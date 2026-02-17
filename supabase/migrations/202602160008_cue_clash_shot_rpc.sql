-- v1.9: Cue Clash authoritative shot RPC + public wrapper.

create or replace function app.cue_clash_take_shot_v1(
  p_game_id uuid,
  p_actor_user_id uuid,
  p_request_id uuid,
  p_expected_turn_number int,
  p_new_balls jsonb,
  p_next_turn_user_id uuid,
  p_open_table boolean,
  p_suit_updates jsonb default null,
  p_actor_foul boolean default false,
  p_winner_user_id uuid default null,
  p_new_status public.game_status default 'active',
  p_event_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_game public.cue_clash_games%rowtype;
  v_existing_payload jsonb;
  v_event_payload jsonb;
  v_now timestamptz := timezone('utc', now());
  v_suit_entry jsonb;
  v_target_user_id uuid;
  v_suit text;
begin
  if p_game_id is null or p_actor_user_id is null or p_request_id is null then
    raise exception 'game_id, actor_user_id, and request_id are required' using errcode = '22023';
  end if;

  if p_new_balls is null then
    raise exception 'new_balls is required' using errcode = '22023';
  end if;

  if p_expected_turn_number is null then
    raise exception 'expected_turn_number is required' using errcode = '22023';
  end if;

  select ce.payload
  into v_existing_payload
  from public.cue_clash_events ce
  where ce.game_id = p_game_id
    and ce.event_type = 'shot_taken'
    and ce.payload ->> 'request_id' = p_request_id::text
  order by ce.id desc
  limit 1;

  if v_existing_payload is not null then
    return v_existing_payload || jsonb_build_object('idempotent', true);
  end if;

  select game.*
  into v_game
  from public.cue_clash_games game
  where game.id = p_game_id
  for update;

  if not found then
    raise exception 'cue clash game not found' using errcode = 'P0002';
  end if;

  if v_game.status <> 'active' then
    raise exception 'cue clash game is not active' using errcode = '23514';
  end if;

  if v_game.turn_number <> p_expected_turn_number then
    raise exception 'turn mismatch' using errcode = '23514';
  end if;

  if not app.is_family_member_user(v_game.family_id, p_actor_user_id) then
    raise exception 'actor is not an active family member' using errcode = '23514';
  end if;

  if v_game.current_turn_user_id is null then
    raise exception 'current turn is missing' using errcode = '23514';
  end if;

  if v_game.current_turn_user_id <> p_actor_user_id then
    raise exception 'not your turn' using errcode = '23514';
  end if;

  -- Check again under lock for idempotency.
  select ce.payload
  into v_existing_payload
  from public.cue_clash_events ce
  where ce.game_id = p_game_id
    and ce.event_type = 'shot_taken'
    and ce.payload ->> 'request_id' = p_request_id::text
  order by ce.id desc
  limit 1;

  if v_existing_payload is not null then
    return v_existing_payload || jsonb_build_object('idempotent', true);
  end if;

  if p_suit_updates is not null then
    for v_suit_entry in
      select value
      from jsonb_array_elements(p_suit_updates)
    loop
      v_target_user_id := nullif(trim(coalesce(v_suit_entry ->> 'user_id', '')), '')::uuid;
      v_suit := nullif(trim(coalesce(v_suit_entry ->> 'suit', '')), '');

      if v_target_user_id is null then
        raise exception 'suit_updates entries must include user_id' using errcode = '22023';
      end if;

      if v_suit is null or v_suit not in ('solids', 'stripes') then
        raise exception 'invalid suit %', v_suit using errcode = '22023';
      end if;

      update public.cue_clash_players
      set suit = v_suit
      where game_id = p_game_id
        and user_id = v_target_user_id;
    end loop;
  end if;

  if coalesce(p_actor_foul, false) then
    update public.cue_clash_players
    set fouls = fouls + 1
    where game_id = p_game_id
      and user_id = p_actor_user_id;
  end if;

  update public.cue_clash_games
  set
    balls = p_new_balls,
    open_table = coalesce(p_open_table, false),
    status = p_new_status,
    winner_user_id = p_winner_user_id,
    current_turn_user_id = case
      when p_new_status = 'finished' then null
      else p_next_turn_user_id
    end,
    turn_number = v_game.turn_number + 1,
    last_shot_at = v_now,
    finished_at = case
      when p_new_status = 'finished' then v_now
      else null
    end
  where id = p_game_id
  returning * into v_game;

  v_event_payload := coalesce(p_event_payload, '{}'::jsonb)
    || jsonb_build_object(
      'request_id', p_request_id::text,
      'next_turn_user_id', p_next_turn_user_id,
      'status', v_game.status,
      'winner_user_id', v_game.winner_user_id,
      'occurred_at', v_now
    );

  insert into public.cue_clash_events (game_id, family_id, event_type, payload, created_by)
  values (p_game_id, v_game.family_id, 'shot_taken', v_event_payload, p_actor_user_id);

  return v_event_payload || jsonb_build_object('idempotent', false);
end;
$$;

alter function app.cue_clash_take_shot_v1(uuid, uuid, uuid, int, jsonb, uuid, boolean, jsonb, boolean, uuid, public.game_status, jsonb) owner to postgres;
revoke all on function app.cue_clash_take_shot_v1(uuid, uuid, uuid, int, jsonb, uuid, boolean, jsonb, boolean, uuid, public.game_status, jsonb) from public;
grant execute on function app.cue_clash_take_shot_v1(uuid, uuid, uuid, int, jsonb, uuid, boolean, jsonb, boolean, uuid, public.game_status, jsonb) to service_role;

create or replace function public.cue_clash_take_shot_v1(
  p_game_id uuid,
  p_actor_user_id uuid,
  p_request_id uuid,
  p_expected_turn_number int,
  p_new_balls jsonb,
  p_next_turn_user_id uuid,
  p_open_table boolean,
  p_suit_updates jsonb default null,
  p_actor_foul boolean default false,
  p_winner_user_id uuid default null,
  p_new_status public.game_status default 'active',
  p_event_payload jsonb default '{}'::jsonb
)
returns jsonb
language sql
security invoker
set search_path = app, public
as $$
  select app.cue_clash_take_shot_v1(
    p_game_id := p_game_id,
    p_actor_user_id := p_actor_user_id,
    p_request_id := p_request_id,
    p_expected_turn_number := p_expected_turn_number,
    p_new_balls := p_new_balls,
    p_next_turn_user_id := p_next_turn_user_id,
    p_open_table := p_open_table,
    p_suit_updates := p_suit_updates,
    p_actor_foul := p_actor_foul,
    p_winner_user_id := p_winner_user_id,
    p_new_status := p_new_status,
    p_event_payload := p_event_payload
  );
$$;

alter function public.cue_clash_take_shot_v1(uuid, uuid, uuid, int, jsonb, uuid, boolean, jsonb, boolean, uuid, public.game_status, jsonb) owner to postgres;
revoke all on function public.cue_clash_take_shot_v1(uuid, uuid, uuid, int, jsonb, uuid, boolean, jsonb, boolean, uuid, public.game_status, jsonb) from public;
grant execute on function public.cue_clash_take_shot_v1(uuid, uuid, uuid, int, jsonb, uuid, boolean, jsonb, boolean, uuid, public.game_status, jsonb) to service_role;

notify pgrst, 'reload schema';

