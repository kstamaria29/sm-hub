-- v1.8: Word Master pass + end RPCs + public wrappers.

create or replace function app.word_master_pass_turn_v1(
  p_game_id uuid,
  p_actor_user_id uuid,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_game public.word_master_games%rowtype;
  v_player public.word_master_players%rowtype;
  v_existing_payload jsonb;
  v_next_turn_user_id uuid;
  v_occurred_at timestamptz := timezone('utc', now());
begin
  if p_game_id is null or p_actor_user_id is null or p_request_id is null then
    raise exception 'game_id, actor_user_id, and request_id are required' using errcode = '22023';
  end if;

  select we.payload
  into v_existing_payload
  from public.word_master_events we
  where we.game_id = p_game_id
    and we.event_type = 'turn_passed'
    and we.payload ->> 'request_id' = p_request_id::text
  order by we.id desc
  limit 1;

  if v_existing_payload is not null then
    return v_existing_payload || jsonb_build_object('idempotent', true);
  end if;

  select game.*
  into v_game
  from public.word_master_games game
  where game.id = p_game_id
  for update;

  if not found then
    raise exception 'game not found' using errcode = 'P0002';
  end if;

  if v_game.status <> 'active' then
    raise exception 'game is not active' using errcode = '23514';
  end if;

  select gp.*
  into v_player
  from public.word_master_players gp
  where gp.game_id = p_game_id
    and gp.user_id = p_actor_user_id
  for update;

  if not found then
    raise exception 'actor is not a game player' using errcode = '23514';
  end if;

  if v_game.current_turn_user_id is null then
    select gp.user_id
    into v_game.current_turn_user_id
    from public.word_master_players gp
    where gp.game_id = p_game_id
    order by gp.player_order
    limit 1;

    update public.word_master_games
    set current_turn_user_id = v_game.current_turn_user_id
    where id = p_game_id;
  end if;

  if v_game.current_turn_user_id <> p_actor_user_id then
    raise exception 'not your turn' using errcode = '23514';
  end if;

  select gp.user_id
  into v_next_turn_user_id
  from public.word_master_players gp
  where gp.game_id = p_game_id
    and gp.player_order > v_player.player_order
  order by gp.player_order
  limit 1;

  if v_next_turn_user_id is null then
    select gp.user_id
    into v_next_turn_user_id
    from public.word_master_players gp
    where gp.game_id = p_game_id
    order by gp.player_order
    limit 1;
  end if;

  update public.word_master_games
  set
    current_turn_user_id = v_next_turn_user_id,
    consecutive_passes = consecutive_passes + 1,
    turn_number = turn_number + 1
  where id = p_game_id;

  v_existing_payload := jsonb_build_object(
    'request_id', p_request_id::text,
    'next_turn_user_id', v_next_turn_user_id,
    'occurred_at', v_occurred_at
  );

  insert into public.word_master_events (game_id, family_id, event_type, payload, created_by)
  values (p_game_id, v_game.family_id, 'turn_passed', v_existing_payload, p_actor_user_id);

  return v_existing_payload || jsonb_build_object('idempotent', false);
end;
$$;

alter function app.word_master_pass_turn_v1(uuid, uuid, uuid) owner to postgres;
revoke all on function app.word_master_pass_turn_v1(uuid, uuid, uuid) from public;
grant execute on function app.word_master_pass_turn_v1(uuid, uuid, uuid) to service_role;

create or replace function public.word_master_pass_turn_v1(
  p_game_id uuid,
  p_actor_user_id uuid,
  p_request_id uuid
)
returns jsonb
language sql
security invoker
set search_path = app, public
as $$
  select app.word_master_pass_turn_v1(
    p_game_id := p_game_id,
    p_actor_user_id := p_actor_user_id,
    p_request_id := p_request_id
  );
$$;

alter function public.word_master_pass_turn_v1(uuid, uuid, uuid) owner to postgres;
revoke all on function public.word_master_pass_turn_v1(uuid, uuid, uuid) from public;
grant execute on function public.word_master_pass_turn_v1(uuid, uuid, uuid) to service_role;

create or replace function app.word_master_end_game_v1(
  p_game_id uuid,
  p_actor_user_id uuid,
  p_reason text default 'admin_end'
)
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_game public.word_master_games%rowtype;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_occurred_at timestamptz := timezone('utc', now());
begin
  if p_game_id is null or p_actor_user_id is null then
    raise exception 'game_id and actor_user_id are required' using errcode = '22023';
  end if;

  select game.*
  into v_game
  from public.word_master_games game
  where game.id = p_game_id
  for update;

  if not found then
    raise exception 'game not found' using errcode = 'P0002';
  end if;

  if not app.is_family_member_user(v_game.family_id, p_actor_user_id) then
    raise exception 'actor is not an active family member' using errcode = '23514';
  end if;

  if app.family_role_for_user_id(v_game.family_id, p_actor_user_id) <> 'admin' then
    raise exception 'actor must be admin' using errcode = '42501';
  end if;

  if v_game.status not in ('active', 'pending') then
    raise exception 'game cannot be ended in status %', v_game.status using errcode = '23514';
  end if;

  update public.word_master_games
  set
    status = 'finished',
    finished_at = v_occurred_at,
    current_turn_user_id = null
  where id = p_game_id
  returning * into v_game;

  insert into public.word_master_events (
    game_id,
    family_id,
    event_type,
    payload,
    created_by
  ) values (
    p_game_id,
    v_game.family_id,
    'game_ended',
    jsonb_build_object(
      'reason', coalesce(v_reason, 'admin_end'),
      'occurred_at', v_occurred_at
    ),
    p_actor_user_id
  );

  return jsonb_build_object(
    'game_id', p_game_id,
    'status', v_game.status,
    'finished_at', v_game.finished_at,
    'reason', coalesce(v_reason, 'admin_end')
  );
end;
$$;

alter function app.word_master_end_game_v1(uuid, uuid, text) owner to postgres;
revoke all on function app.word_master_end_game_v1(uuid, uuid, text) from public;
grant execute on function app.word_master_end_game_v1(uuid, uuid, text) to service_role;

create or replace function public.word_master_end_game_v1(
  p_game_id uuid,
  p_actor_user_id uuid,
  p_reason text default 'admin_end'
)
returns jsonb
language sql
security invoker
set search_path = app, public
as $$
  select app.word_master_end_game_v1(
    p_game_id := p_game_id,
    p_actor_user_id := p_actor_user_id,
    p_reason := p_reason
  );
$$;

alter function public.word_master_end_game_v1(uuid, uuid, text) owner to postgres;
revoke all on function public.word_master_end_game_v1(uuid, uuid, text) from public;
grant execute on function public.word_master_end_game_v1(uuid, uuid, text) to service_role;

notify pgrst, 'reload schema';

