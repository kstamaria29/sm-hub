-- v1 transactional RPC functions + integrity hardening.

alter table public.invites
  add column if not exists max_uses int not null default 1,
  add column if not exists use_count int not null default 0;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'invites_max_uses_check'
      and conrelid = 'public.invites'::regclass
  ) then
    alter table public.invites
      add constraint invites_max_uses_check
      check (max_uses > 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'invites_use_count_check'
      and conrelid = 'public.invites'::regclass
  ) then
    alter table public.invites
      add constraint invites_use_count_check
      check (use_count >= 0 and use_count <= max_uses);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'invites_expires_after_creation_check'
      and conrelid = 'public.invites'::regclass
  ) then
    alter table public.invites
      add constraint invites_expires_after_creation_check
      check (expires_at > created_at);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'messages_content_not_blank'
      and conrelid = 'public.messages'::regclass
  ) then
    alter table public.messages
      add constraint messages_content_not_blank
      check (length(trim(content)) > 0);
  end if;
end
$$;

create unique index if not exists idx_family_members_single_active_family_per_user
on public.family_members (user_id)
where status = 'active';

create unique index if not exists idx_games_one_open_game_per_room
on public.games (room_id)
where status in ('pending', 'active');

create unique index if not exists idx_game_events_roll_request_unique
on public.game_events (game_id, (payload ->> 'request_id'))
where event_type = 'roll_move';

create or replace function app.is_family_member_user(target_family_id uuid, target_user_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.family_members fm
    where fm.family_id = target_family_id
      and fm.user_id = target_user_id
      and fm.status = 'active'
  );
$$;

create or replace function app.family_role_for_user_id(target_family_id uuid, target_user_id uuid)
returns public.family_role
language sql
stable
as $$
  select fm.role
  from public.family_members fm
  where fm.family_id = target_family_id
    and fm.user_id = target_user_id
    and fm.status = 'active'
  limit 1;
$$;

create or replace function app.resolve_classic_tile(raw_tile int)
returns int
language sql
immutable
as $$
  select case raw_tile
    when 1 then 38
    when 4 then 14
    when 9 then 31
    when 16 then 6
    when 21 then 42
    when 28 then 84
    when 36 then 44
    when 47 then 26
    when 49 then 11
    when 51 then 67
    when 56 then 53
    when 62 then 19
    when 64 then 60
    when 71 then 91
    when 80 then 100
    when 87 then 24
    when 93 then 73
    when 95 then 75
    when 98 then 78
    else raw_tile
  end;
$$;

create or replace function app.assert_room_family_match()
returns trigger
language plpgsql
as $$
declare
  v_room_family_id uuid;
begin
  select room.family_id
  into v_room_family_id
  from public.rooms room
  where room.id = new.room_id;

  if v_room_family_id is null then
    raise exception 'room % does not exist', new.room_id
      using errcode = '23503';
  end if;

  if new.family_id <> v_room_family_id then
    raise exception 'family_id mismatch for room %', new.room_id
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_messages_room_family_check on public.messages;
create trigger trg_messages_room_family_check
before insert or update on public.messages
for each row execute function app.assert_room_family_match();

drop trigger if exists trg_games_room_family_check on public.games;
create trigger trg_games_room_family_check
before insert or update on public.games
for each row execute function app.assert_room_family_match();

create or replace function app.assert_game_family_match()
returns trigger
language plpgsql
as $$
declare
  v_game_family_id uuid;
begin
  select g.family_id
  into v_game_family_id
  from public.games g
  where g.id = new.game_id;

  if v_game_family_id is null then
    raise exception 'game % does not exist', new.game_id
      using errcode = '23503';
  end if;

  if new.family_id <> v_game_family_id then
    raise exception 'family_id mismatch for game %', new.game_id
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_game_players_family_check on public.game_players;
create trigger trg_game_players_family_check
before insert or update on public.game_players
for each row execute function app.assert_game_family_match();

drop trigger if exists trg_game_events_family_check on public.game_events;
create trigger trg_game_events_family_check
before insert or update on public.game_events
for each row execute function app.assert_game_family_match();

create or replace function app.bootstrap_family_v1(
  p_actor_user_id uuid,
  p_family_name text,
  p_display_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_family_id uuid;
  v_member_id uuid;
  v_chat_room_id uuid;
  v_game_room_id uuid;
begin
  if p_actor_user_id is null then
    raise exception 'actor_user_id is required' using errcode = '22023';
  end if;

  if trim(coalesce(p_family_name, '')) = '' then
    raise exception 'family_name is required' using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.family_members fm
    where fm.user_id = p_actor_user_id
      and fm.status = 'active'
  ) then
    raise exception 'user already belongs to an active family' using errcode = '23514';
  end if;

  insert into public.families (name, created_by)
  values (trim(p_family_name), p_actor_user_id)
  returning id into v_family_id;

  insert into public.family_members (family_id, user_id, role, status)
  values (v_family_id, p_actor_user_id, 'owner', 'active')
  returning id into v_member_id;

  insert into public.rooms (family_id, kind, slug, title, created_by)
  values
    (v_family_id, 'chat', 'family-chat', 'Family Chat', p_actor_user_id),
    (v_family_id, 'game', 'snakes-ladders', 'Snakes and Ladders', p_actor_user_id);

  select room.id
  into v_chat_room_id
  from public.rooms room
  where room.family_id = v_family_id
    and room.slug = 'family-chat'
  limit 1;

  select room.id
  into v_game_room_id
  from public.rooms room
  where room.family_id = v_family_id
    and room.slug = 'snakes-ladders'
  limit 1;

  insert into public.user_profiles (user_id, family_id, display_name)
  values (
    p_actor_user_id,
    v_family_id,
    nullif(trim(coalesce(p_display_name, '')), '')
  )
  on conflict (user_id) do update
  set
    family_id = excluded.family_id,
    display_name = coalesce(excluded.display_name, public.user_profiles.display_name);

  return jsonb_build_object(
    'family_id', v_family_id,
    'member_id', v_member_id,
    'owner_user_id', p_actor_user_id,
    'chat_room_id', v_chat_room_id,
    'game_room_id', v_game_room_id
  );
end;
$$;

create or replace function app.accept_invite_v1(
  p_actor_user_id uuid,
  p_invite_token text,
  p_display_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_invite public.invites%rowtype;
  v_member_id uuid;
  v_status public.invite_status;
begin
  if p_actor_user_id is null then
    raise exception 'actor_user_id is required' using errcode = '22023';
  end if;

  if trim(coalesce(p_invite_token, '')) = '' then
    raise exception 'invite_token is required' using errcode = '22023';
  end if;

  select invite.*
  into v_invite
  from public.invites invite
  where invite.token = trim(p_invite_token)
  for update;

  if not found then
    raise exception 'invite token not found' using errcode = 'P0002';
  end if;

  if v_invite.status <> 'pending' then
    raise exception 'invite is not pending' using errcode = '23514';
  end if;

  if v_invite.expires_at <= timezone('utc', now()) then
    update public.invites
    set status = 'expired'
    where id = v_invite.id;

    raise exception 'invite has expired' using errcode = '23514';
  end if;

  if v_invite.use_count >= v_invite.max_uses then
    raise exception 'invite has reached max uses' using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.family_members fm
    where fm.user_id = p_actor_user_id
      and fm.status = 'active'
      and fm.family_id <> v_invite.family_id
  ) then
    raise exception 'user belongs to another active family' using errcode = '23514';
  end if;

  insert into public.family_members (family_id, user_id, role, status)
  values (v_invite.family_id, p_actor_user_id, 'member', 'active')
  on conflict (family_id, user_id) do update
  set status = 'active'
  returning id into v_member_id;

  update public.invites
  set
    use_count = use_count + 1,
    accepted_by = p_actor_user_id,
    accepted_at = timezone('utc', now()),
    status = case when use_count + 1 >= max_uses then 'accepted' else status end
  where id = v_invite.id
  returning status into v_status;

  insert into public.user_profiles (user_id, family_id, display_name)
  values (
    p_actor_user_id,
    v_invite.family_id,
    nullif(trim(coalesce(p_display_name, '')), '')
  )
  on conflict (user_id) do update
  set
    family_id = excluded.family_id,
    display_name = coalesce(excluded.display_name, public.user_profiles.display_name);

  return jsonb_build_object(
    'family_id', v_invite.family_id,
    'invite_id', v_invite.id,
    'member_id', v_member_id,
    'status', v_status
  );
end;
$$;

create or replace function app.roll_game_turn_v1(
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
  v_game public.games%rowtype;
  v_player public.game_players%rowtype;
  v_existing_payload jsonb;
  v_dice int;
  v_from_tile int;
  v_landing_tile int;
  v_to_tile int;
  v_transition text := 'none';
  v_next_turn_user_id uuid;
  v_event_payload jsonb;
begin
  if p_game_id is null or p_actor_user_id is null or p_request_id is null then
    raise exception 'game_id, actor_user_id, and request_id are required' using errcode = '22023';
  end if;

  select ge.payload
  into v_existing_payload
  from public.game_events ge
  where ge.game_id = p_game_id
    and ge.event_type = 'roll_move'
    and ge.payload ->> 'request_id' = p_request_id::text
  order by ge.id desc
  limit 1;

  if v_existing_payload is not null then
    return v_existing_payload || jsonb_build_object('idempotent', true);
  end if;

  select game.*
  into v_game
  from public.games game
  where game.id = p_game_id
  for update;

  if not found then
    raise exception 'game not found' using errcode = 'P0002';
  end if;

  if v_game.mapping_id <> 'classic_v1' then
    raise exception 'unsupported mapping_id %', v_game.mapping_id using errcode = '23514';
  end if;

  select ge.payload
  into v_existing_payload
  from public.game_events ge
  where ge.game_id = p_game_id
    and ge.event_type = 'roll_move'
    and ge.payload ->> 'request_id' = p_request_id::text
  order by ge.id desc
  limit 1;

  if v_existing_payload is not null then
    return v_existing_payload || jsonb_build_object('idempotent', true);
  end if;

  if v_game.status <> 'active' then
    raise exception 'game is not active' using errcode = '23514';
  end if;

  select gp.*
  into v_player
  from public.game_players gp
  where gp.game_id = p_game_id
    and gp.user_id = p_actor_user_id
  for update;

  if not found then
    raise exception 'actor is not a game player' using errcode = '23514';
  end if;

  if v_game.current_turn_user_id is null then
    select gp.user_id
    into v_game.current_turn_user_id
    from public.game_players gp
    where gp.game_id = p_game_id
    order by gp.player_order
    limit 1;

    update public.games
    set current_turn_user_id = v_game.current_turn_user_id
    where id = p_game_id;
  end if;

  if v_game.current_turn_user_id <> p_actor_user_id then
    raise exception 'not your turn' using errcode = '23514';
  end if;

  v_dice := floor(random() * 6 + 1)::int;
  v_from_tile := v_player.tile_position;
  v_landing_tile := case
    when v_from_tile + v_dice > 100 then v_from_tile
    else v_from_tile + v_dice
  end;
  v_to_tile := app.resolve_classic_tile(v_landing_tile);

  if v_to_tile > v_landing_tile then
    v_transition := 'ladder';
  elsif v_to_tile < v_landing_tile then
    if (v_landing_tile - v_to_tile) >= 20 then
      v_transition := 'big_snake';
    else
      v_transition := 'snake';
    end if;
  end if;

  update public.game_players
  set tile_position = v_to_tile
  where id = v_player.id;

  if v_to_tile = 100 then
    v_next_turn_user_id := null;

    update public.games
    set
      status = 'finished',
      winner_user_id = p_actor_user_id,
      finished_at = timezone('utc', now()),
      current_turn_user_id = null
    where id = p_game_id
    returning * into v_game;
  else
    select gp.user_id
    into v_next_turn_user_id
    from public.game_players gp
    where gp.game_id = p_game_id
      and gp.player_order > v_player.player_order
    order by gp.player_order
    limit 1;

    if v_next_turn_user_id is null then
      select gp.user_id
      into v_next_turn_user_id
      from public.game_players gp
      where gp.game_id = p_game_id
      order by gp.player_order
      limit 1;
    end if;

    update public.games
    set current_turn_user_id = v_next_turn_user_id
    where id = p_game_id
    returning * into v_game;
  end if;

  v_event_payload := jsonb_build_object(
    'request_id', p_request_id::text,
    'dice', v_dice,
    'from_tile', v_from_tile,
    'landing_tile', v_landing_tile,
    'to_tile', v_to_tile,
    'transition', v_transition,
    'next_turn_user_id', v_next_turn_user_id,
    'status', v_game.status,
    'winner_user_id', v_game.winner_user_id,
    'occurred_at', timezone('utc', now())
  );

  insert into public.game_events (game_id, family_id, event_type, payload, created_by)
  values (p_game_id, v_game.family_id, 'roll_move', v_event_payload, p_actor_user_id);

  return v_event_payload || jsonb_build_object('idempotent', false);
end;
$$;

create or replace function app.reserve_avatar_pack_v1(
  p_family_id uuid,
  p_user_id uuid,
  p_style_id text,
  p_created_by uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_version int;
  v_base_path text;
  v_pack_id uuid;
begin
  if p_family_id is null or p_user_id is null then
    raise exception 'family_id and user_id are required' using errcode = '22023';
  end if;

  if trim(coalesce(p_style_id, '')) = '' then
    raise exception 'style_id is required' using errcode = '22023';
  end if;

  if not app.is_family_member_user(p_family_id, p_user_id) then
    raise exception 'target user is not an active member of the family' using errcode = '23514';
  end if;

  perform pg_advisory_xact_lock(
    hashtext(p_family_id::text || ':' || p_user_id::text || ':' || trim(p_style_id))
  );

  select coalesce(max(ap.version), 0) + 1
  into v_version
  from public.avatar_packs ap
  where ap.family_id = p_family_id
    and ap.user_id = p_user_id
    and ap.style_id = trim(p_style_id);

  v_base_path := p_family_id::text || '/' || p_user_id::text || '/' || trim(p_style_id) || '/' || v_version::text;

  insert into public.avatar_packs (
    family_id,
    user_id,
    style_id,
    version,
    status,
    base_path,
    created_by
  ) values (
    p_family_id,
    p_user_id,
    trim(p_style_id),
    v_version,
    'processing',
    v_base_path,
    p_created_by
  )
  returning id into v_pack_id;

  return jsonb_build_object(
    'avatar_pack_id', v_pack_id,
    'version', v_version,
    'base_path', v_base_path
  );
end;
$$;

revoke all on function app.bootstrap_family_v1(uuid, text, text) from public;
revoke all on function app.accept_invite_v1(uuid, text, text) from public;
revoke all on function app.roll_game_turn_v1(uuid, uuid, uuid) from public;
revoke all on function app.reserve_avatar_pack_v1(uuid, uuid, text, uuid) from public;

grant execute on function app.bootstrap_family_v1(uuid, text, text) to service_role;
grant execute on function app.accept_invite_v1(uuid, text, text) to service_role;
grant execute on function app.roll_game_turn_v1(uuid, uuid, uuid) to service_role;
grant execute on function app.reserve_avatar_pack_v1(uuid, uuid, text, uuid) to service_role;
