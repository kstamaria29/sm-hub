-- v1.9: Cue Clash authoritative start RPC + public wrapper.

create or replace function app.cue_clash_start_v1(
  p_room_id uuid,
  p_actor_user_id uuid,
  p_player_user_ids uuid[] default null
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
  v_table_width int := 1000;
  v_table_height int := 500;
  v_ball_radius int := 18;
  v_pocket_radius int := 30;
  v_position_scale int := 10;
  v_gap double precision := 1;
  v_d double precision;
  v_dx double precision;
  v_center_y double precision;
  v_rack_x double precision;
  v_rack_numbers int[] := array[1, 9, 10, 2, 8, 3, 4, 11, 5, 12, 6, 13, 7, 14, 15];
  v_ball_x int[] := array_fill(0, array[16]);
  v_ball_y int[] := array_fill(0, array[16]);
  v_positions int[] := array[]::int[];
  v_row int;
  v_col int;
  v_k int := 1;
  v_ball_number int;
  v_balls jsonb;
begin
  if p_room_id is null or p_actor_user_id is null then
    raise exception 'room_id and actor_user_id are required' using errcode = '22023';
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

  if v_room.slug <> 'cue-clash' then
    raise exception 'room slug must be cue-clash' using errcode = '23514';
  end if;

  if not app.is_family_member_user(v_room.family_id, p_actor_user_id) then
    raise exception 'actor is not an active family member' using errcode = '23514';
  end if;

  if app.family_role_for_user_id(v_room.family_id, p_actor_user_id) <> 'admin' then
    raise exception 'actor must be admin' using errcode = '42501';
  end if;

  select game.id
  into v_existing_game_id
  from public.cue_clash_games game
  where game.room_id = p_room_id
    and game.status in ('pending', 'active')
  limit 1;

  if v_existing_game_id is not null then
    raise exception 'room already has an open cue clash game' using errcode = '23514';
  end if;

  if p_player_user_ids is null or cardinality(p_player_user_ids) = 0 then
    select array_agg(fm.user_id order by fm.joined_at asc, fm.created_at asc)
    into v_player_user_ids
    from public.family_members fm
    where fm.family_id = v_room.family_id
      and fm.status = 'active'
    ;

    if v_player_user_ids is not null and cardinality(v_player_user_ids) > 2 then
      raise exception 'select 1 or 2 players to start cue clash' using errcode = '23514';
    end if;
  else
    select array_agg(distinct candidate.user_id order by candidate.user_id)
    into v_player_user_ids
    from unnest(p_player_user_ids) as candidate(user_id);
  end if;

  if v_player_user_ids is null or cardinality(v_player_user_ids) < 1 then
    raise exception 'at least one active player is required' using errcode = '23514';
  end if;

  if cardinality(v_player_user_ids) > 2 then
    raise exception 'cue clash supports at most two players' using errcode = '23514';
  end if;

  if exists (
    select 1
    from unnest(v_player_user_ids) as selected(user_id)
    where not app.is_family_member_user(v_room.family_id, selected.user_id)
  ) then
    raise exception 'all selected players must be active family members' using errcode = '23514';
  end if;

  -- Build initial ball layout.
  -- Positions are stored as integer coordinates multiplied by position_scale for stable client replay.
  -- Ball index convention: 0 = cue ball, 1..15 = numbered balls.
  v_ball_x[1] := 250;
  v_ball_y[1] := v_table_height / 2;

  v_d := (v_ball_radius * 2) + v_gap;
  v_dx := v_d * 0.8660254037844386; -- sqrt(3) / 2
  v_center_y := v_table_height / 2.0;
  v_rack_x := 750;

  for v_row in 0..4 loop
    for v_col in 0..v_row loop
      if v_k > array_length(v_rack_numbers, 1) then
        exit;
      end if;

      v_ball_number := v_rack_numbers[v_k];
      v_ball_x[v_ball_number + 1] := round(v_rack_x + (v_row * v_dx))::int;
      v_ball_y[v_ball_number + 1] := round(v_center_y + ((v_col - (v_row / 2.0)) * v_d))::int;
      v_k := v_k + 1;
    end loop;
  end loop;

  for v_ball_number in 0..15 loop
    v_positions := v_positions
      || array[
        v_ball_x[v_ball_number + 1] * v_position_scale,
        v_ball_y[v_ball_number + 1] * v_position_scale
      ];
  end loop;

  v_balls := jsonb_build_object(
    'version', 1,
    'position_scale', v_position_scale,
    'table', jsonb_build_object(
      'width', v_table_width,
      'height', v_table_height,
      'ball_radius', v_ball_radius,
      'pocket_radius', v_pocket_radius
    ),
    'pocketed_mask', 0,
    'positions', to_jsonb(v_positions)
  );

  insert into public.cue_clash_games (
    family_id,
    room_id,
    created_by,
    status,
    balls,
    open_table,
    current_turn_user_id,
    turn_number,
    started_at
  ) values (
    v_room.family_id,
    p_room_id,
    p_actor_user_id,
    'active',
    v_balls,
    true,
    v_player_user_ids[1],
    1,
    v_started_at
  )
  returning id into v_game_id;

  foreach v_player_user_id in array v_player_user_ids
  loop
    insert into public.cue_clash_players (
      game_id,
      family_id,
      user_id,
      player_order,
      suit,
      fouls
    ) values (
      v_game_id,
      v_room.family_id,
      v_player_user_id,
      v_player_order,
      null,
      0
    );

    v_player_order := v_player_order + 1;
  end loop;

  insert into public.cue_clash_events (
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
      'occurred_at', v_started_at
    ),
    p_actor_user_id
  );

  return jsonb_build_object(
    'game_id', v_game_id,
    'family_id', v_room.family_id,
    'room_id', p_room_id,
    'status', 'active',
    'current_turn_user_id', v_player_user_ids[1],
    'player_user_ids', to_jsonb(v_player_user_ids),
    'started_at', v_started_at
  );
end;
$$;

alter function app.cue_clash_start_v1(uuid, uuid, uuid[]) owner to postgres;
revoke all on function app.cue_clash_start_v1(uuid, uuid, uuid[]) from public;
grant execute on function app.cue_clash_start_v1(uuid, uuid, uuid[]) to service_role;

create or replace function public.cue_clash_start_v1(
  p_room_id uuid,
  p_actor_user_id uuid,
  p_player_user_ids uuid[] default null
)
returns jsonb
language sql
security invoker
set search_path = app, public
as $$
  select app.cue_clash_start_v1(
    p_room_id := p_room_id,
    p_actor_user_id := p_actor_user_id,
    p_player_user_ids := p_player_user_ids
  );
$$;

alter function public.cue_clash_start_v1(uuid, uuid, uuid[]) owner to postgres;
revoke all on function public.cue_clash_start_v1(uuid, uuid, uuid[]) from public;
grant execute on function public.cue_clash_start_v1(uuid, uuid, uuid[]) to service_role;

notify pgrst, 'reload schema';
