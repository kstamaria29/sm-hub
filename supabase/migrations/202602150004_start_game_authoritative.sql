-- v1.5: authoritative game-start RPC + public wrapper for PostgREST RPC routing.

create or replace function app.start_game_v1(
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

  if not app.is_family_member_user(v_room.family_id, p_actor_user_id) then
    raise exception 'actor is not an active family member' using errcode = '23514';
  end if;

  if app.family_role_for_user_id(v_room.family_id, p_actor_user_id) <> 'admin' then
    raise exception 'actor must be admin' using errcode = '42501';
  end if;

  select game.id
  into v_existing_game_id
  from public.games game
  where game.room_id = p_room_id
    and game.status in ('pending', 'active')
  limit 1;

  if v_existing_game_id is not null then
    raise exception 'room already has an open game' using errcode = '23514';
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

  if v_player_user_ids is null or cardinality(v_player_user_ids) < 2 then
    raise exception 'at least two active players are required' using errcode = '23514';
  end if;

  if exists (
    select 1
    from unnest(v_player_user_ids) as selected(user_id)
    where not app.is_family_member_user(v_room.family_id, selected.user_id)
  ) then
    raise exception 'all selected players must be active family members' using errcode = '23514';
  end if;

  insert into public.games (
    family_id,
    room_id,
    created_by,
    mapping_id,
    status,
    current_turn_user_id,
    started_at
  )
  values (
    v_room.family_id,
    p_room_id,
    p_actor_user_id,
    'classic_v1',
    'active',
    v_player_user_ids[1],
    v_started_at
  )
  returning id into v_game_id;

  foreach v_player_user_id in array v_player_user_ids
  loop
    insert into public.game_players (
      game_id,
      family_id,
      user_id,
      player_order,
      tile_position
    )
    values (
      v_game_id,
      v_room.family_id,
      v_player_user_id,
      v_player_order,
      1
    );

    v_player_order := v_player_order + 1;
  end loop;

  insert into public.game_events (
    game_id,
    family_id,
    event_type,
    payload,
    created_by
  )
  values (
    v_game_id,
    v_room.family_id,
    'game_started',
    jsonb_build_object(
      'started_by', p_actor_user_id,
      'room_id', p_room_id,
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

alter function app.start_game_v1(uuid, uuid, uuid[]) owner to postgres;
revoke all on function app.start_game_v1(uuid, uuid, uuid[]) from public;
grant execute on function app.start_game_v1(uuid, uuid, uuid[]) to service_role;

create or replace function public.start_game_v1(
  p_room_id uuid,
  p_actor_user_id uuid,
  p_player_user_ids uuid[] default null
)
returns jsonb
language plpgsql
security definer
set search_path = app, public
as $$
begin
  return app.start_game_v1(p_room_id, p_actor_user_id, p_player_user_ids);
end;
$$;

alter function public.start_game_v1(uuid, uuid, uuid[]) owner to postgres;
revoke all on function public.start_game_v1(uuid, uuid, uuid[]) from public;
grant execute on function public.start_game_v1(uuid, uuid, uuid[]) to service_role;

notify pgrst, 'reload schema';
