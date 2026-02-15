-- v1.8: Word Master authoritative start RPC + public wrapper.

create or replace function app.word_master_start_v1(
  p_room_id uuid,
  p_actor_user_id uuid,
  p_player_user_ids uuid[] default null,
  p_board_size int default 11,
  p_rack_size int default 7
)
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_room public.rooms%rowtype;
  v_existing_game_id uuid;
  v_game_id uuid;
  v_player_user_ids uuid[];
  v_player_user_id uuid;
  v_player_order int := 1;
  v_started_at timestamptz := timezone('utc', now());
  v_bag text[];
  v_bag_len int;
  v_draw_count int;
  v_rack text[];
begin
  if p_room_id is null or p_actor_user_id is null then
    raise exception 'room_id and actor_user_id are required' using errcode = '22023';
  end if;

  if p_board_size is null or p_board_size < 9 or p_board_size > 15 or mod(p_board_size, 2) <> 1 then
    raise exception 'board_size must be an odd number between 9 and 15' using errcode = '22023';
  end if;

  if p_rack_size is null or p_rack_size < 5 or p_rack_size > 10 then
    raise exception 'rack_size must be between 5 and 10' using errcode = '22023';
  end if;

  select room.*
  into v_room
  from public.rooms room
  where room.id = p_room_id
  for update;

  if not found then
    raise exception 'room not found' using errcode = 'P0002';
  end if;

  if v_room.kind <> 'game' then
    raise exception 'room must be of kind game' using errcode = '23514';
  end if;

  if v_room.slug <> 'word-master' then
    raise exception 'room slug must be word-master' using errcode = '23514';
  end if;

  if not app.is_family_member_user(v_room.family_id, p_actor_user_id) then
    raise exception 'actor is not an active family member' using errcode = '23514';
  end if;

  if app.family_role_for_user_id(v_room.family_id, p_actor_user_id) <> 'admin' then
    raise exception 'actor must be admin' using errcode = '42501';
  end if;

  select game.id
  into v_existing_game_id
  from public.word_master_games game
  where game.room_id = p_room_id
    and game.status in ('pending', 'active')
  limit 1;

  if v_existing_game_id is not null then
    raise exception 'room already has an open word master game' using errcode = '23514';
  end if;

  if p_player_user_ids is null or cardinality(p_player_user_ids) = 0 then
    select array_agg(fm.user_id order by fm.joined_at asc, fm.created_at asc)
    into v_player_user_ids
    from public.family_members fm
    where fm.family_id = v_room.family_id
      and fm.status = 'active';
  else
    select array_agg(distinct candidate.user_id order by candidate.user_id)
    into v_player_user_ids
    from unnest(p_player_user_ids) as candidate(user_id);
  end if;

  if v_player_user_ids is null or cardinality(v_player_user_ids) < 1 then
    raise exception 'at least one active player is required' using errcode = '23514';
  end if;

  if exists (
    select 1
    from unnest(v_player_user_ids) as selected(user_id)
    where not app.is_family_member_user(v_room.family_id, selected.user_id)
  ) then
    raise exception 'all selected players must be active family members' using errcode = '23514';
  end if;

  -- Build and shuffle initial bag (English Scrabble distribution, no blanks).
  select array_agg(letter order by random())
  into v_bag
  from (
    select dist.letter
    from (values
      ('A', 9), ('B', 2), ('C', 2), ('D', 4), ('E', 12),
      ('F', 2), ('G', 3), ('H', 2), ('I', 9), ('J', 1),
      ('K', 1), ('L', 4), ('M', 2), ('N', 6), ('O', 8),
      ('P', 2), ('Q', 1), ('R', 6), ('S', 4), ('T', 6),
      ('U', 4), ('V', 2), ('W', 2), ('X', 1), ('Y', 2),
      ('Z', 1)
    ) as dist(letter, count)
    cross join generate_series(1, dist.count)
  ) bag_letters;

  insert into public.word_master_games (
    family_id,
    room_id,
    created_by,
    status,
    board_size,
    rack_size,
    bag,
    current_turn_user_id,
    started_at,
    consecutive_passes,
    turn_number
  ) values (
    v_room.family_id,
    p_room_id,
    p_actor_user_id,
    'active',
    p_board_size,
    p_rack_size,
    coalesce(v_bag, array[]::text[]),
    v_player_user_ids[1],
    v_started_at,
    0,
    1
  )
  returning id into v_game_id;

  v_bag_len := coalesce(array_length(v_bag, 1), 0);

  foreach v_player_user_id in array v_player_user_ids
  loop
    v_draw_count := least(p_rack_size, v_bag_len);

    if v_draw_count > 0 then
      v_rack := v_bag[1:v_draw_count];

      if v_draw_count = v_bag_len then
        v_bag := array[]::text[];
        v_bag_len := 0;
      else
        v_bag := v_bag[(v_draw_count + 1):v_bag_len];
        v_bag_len := coalesce(array_length(v_bag, 1), 0);
      end if;
    else
      v_rack := array[]::text[];
    end if;

    insert into public.word_master_players (
      game_id,
      family_id,
      user_id,
      player_order,
      score,
      rack
    ) values (
      v_game_id,
      v_room.family_id,
      v_player_user_id,
      v_player_order,
      0,
      coalesce(v_rack, array[]::text[])
    );

    v_player_order := v_player_order + 1;
  end loop;

  update public.word_master_games
  set bag = coalesce(v_bag, array[]::text[])
  where id = v_game_id;

  insert into public.word_master_events (
    game_id,
    family_id,
    event_type,
    payload,
    created_by
  ) values (
    v_game_id,
    v_room.family_id,
    'game_started',
    jsonb_build_object(
      'room_id', p_room_id,
      'started_by', p_actor_user_id,
      'player_user_ids', to_jsonb(v_player_user_ids),
      'board_size', p_board_size,
      'rack_size', p_rack_size,
      'occurred_at', v_started_at
    ),
    p_actor_user_id
  );

  return jsonb_build_object(
    'game_id', v_game_id,
    'family_id', v_room.family_id,
    'room_id', p_room_id,
    'status', 'active',
    'board_size', p_board_size,
    'rack_size', p_rack_size,
    'current_turn_user_id', v_player_user_ids[1],
    'player_user_ids', to_jsonb(v_player_user_ids),
    'started_at', v_started_at
  );
end;
$$;

alter function app.word_master_start_v1(uuid, uuid, uuid[], int, int) owner to postgres;
revoke all on function app.word_master_start_v1(uuid, uuid, uuid[], int, int) from public;
grant execute on function app.word_master_start_v1(uuid, uuid, uuid[], int, int) to service_role;

create or replace function public.word_master_start_v1(
  p_room_id uuid,
  p_actor_user_id uuid,
  p_player_user_ids uuid[] default null,
  p_board_size int default 11,
  p_rack_size int default 7
)
returns jsonb
language sql
security invoker
set search_path = app, public
as $$
  select app.word_master_start_v1(
    p_room_id := p_room_id,
    p_actor_user_id := p_actor_user_id,
    p_player_user_ids := p_player_user_ids,
    p_board_size := p_board_size,
    p_rack_size := p_rack_size
  );
$$;

alter function public.word_master_start_v1(uuid, uuid, uuid[], int, int) owner to postgres;
revoke all on function public.word_master_start_v1(uuid, uuid, uuid[], int, int) from public;
grant execute on function public.word_master_start_v1(uuid, uuid, uuid[], int, int) to service_role;

notify pgrst, 'reload schema';

