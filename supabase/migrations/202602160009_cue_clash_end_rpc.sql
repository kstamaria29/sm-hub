-- v1.9: Cue Clash authoritative end RPC + public wrapper.

create or replace function app.cue_clash_end_game_v1(
  p_game_id uuid,
  p_actor_user_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_game public.cue_clash_games%rowtype;
  v_ended_at timestamptz := timezone('utc', now());
  v_reason text := coalesce(nullif(trim(coalesce(p_reason, '')), ''), 'admin_end');
begin
  if p_game_id is null or p_actor_user_id is null then
    raise exception 'game_id and actor_user_id are required' using errcode = '22023';
  end if;

  select game.*
  into v_game
  from public.cue_clash_games game
  where game.id = p_game_id
  for update;

  if not found then
    raise exception 'cue clash game not found' using errcode = 'P0002';
  end if;

  if v_game.status not in ('pending', 'active') then
    raise exception 'cue clash game is not open' using errcode = '23514';
  end if;

  if not app.is_family_member_user(v_game.family_id, p_actor_user_id) then
    raise exception 'actor is not an active family member' using errcode = '23514';
  end if;

  if app.family_role_for_user_id(v_game.family_id, p_actor_user_id) <> 'admin' then
    raise exception 'actor must be admin' using errcode = '42501';
  end if;

  update public.cue_clash_games
  set
    status = 'cancelled',
    current_turn_user_id = null,
    finished_at = v_ended_at
  where id = p_game_id;

  insert into public.cue_clash_events (
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
      'ended_by', p_actor_user_id,
      'reason', v_reason,
      'previous_status', v_game.status,
      'status', 'cancelled',
      'occurred_at', v_ended_at
    ),
    p_actor_user_id
  );

  return jsonb_build_object(
    'game_id', p_game_id,
    'family_id', v_game.family_id,
    'status', 'cancelled',
    'ended_at', v_ended_at,
    'ended_by', p_actor_user_id,
    'reason', v_reason
  );
end;
$$;

alter function app.cue_clash_end_game_v1(uuid, uuid, text) owner to postgres;
revoke all on function app.cue_clash_end_game_v1(uuid, uuid, text) from public;
grant execute on function app.cue_clash_end_game_v1(uuid, uuid, text) to service_role;

create or replace function public.cue_clash_end_game_v1(
  p_game_id uuid,
  p_actor_user_id uuid,
  p_reason text default null
)
returns jsonb
language sql
security invoker
set search_path = app, public
as $$
  select app.cue_clash_end_game_v1(
    p_game_id := p_game_id,
    p_actor_user_id := p_actor_user_id,
    p_reason := p_reason
  );
$$;

alter function public.cue_clash_end_game_v1(uuid, uuid, text) owner to postgres;
revoke all on function public.cue_clash_end_game_v1(uuid, uuid, text) from public;
grant execute on function public.cue_clash_end_game_v1(uuid, uuid, text) to service_role;

notify pgrst, 'reload schema';

