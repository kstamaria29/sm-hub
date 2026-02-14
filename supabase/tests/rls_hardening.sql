-- RLS and privilege hardening checks for Family Hub v1.
-- This script raises exceptions if critical constraints or policy guards are missing.

begin;

do $$
declare
  v_missing_tables text[];
begin
  with required_tables as (
    select unnest(
      array[
        'families',
        'family_members',
        'invites',
        'rooms',
        'messages',
        'games',
        'game_players',
        'game_events',
        'user_profiles',
        'avatar_packs'
      ]
    ) as table_name
  )
  select array_agg(r.table_name order by r.table_name)
  into v_missing_tables
  from required_tables r
  left join pg_class c
    on c.relname = r.table_name
   and c.relnamespace = 'public'::regnamespace
  where c.oid is null;

  if v_missing_tables is not null then
    raise exception 'Missing required public tables: %', v_missing_tables;
  end if;
end
$$;

do $$
declare
  v_tables_without_rls text[];
begin
  with required_tables as (
    select unnest(
      array[
        'families',
        'family_members',
        'invites',
        'rooms',
        'messages',
        'games',
        'game_players',
        'game_events',
        'user_profiles',
        'avatar_packs'
      ]
    ) as table_name
  )
  select array_agg(r.table_name order by r.table_name)
  into v_tables_without_rls
  from required_tables r
  join pg_class c
    on c.relname = r.table_name
   and c.relnamespace = 'public'::regnamespace
  where c.relrowsecurity = false;

  if v_tables_without_rls is not null then
    raise exception 'RLS must be enabled on all tables, missing on: %', v_tables_without_rls;
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'games'
      and policyname = 'games_write_service_role'
      and coalesce(qual, '') like '%auth.role() = ''service_role''%'
      and coalesce(with_check, '') like '%auth.role() = ''service_role''%'
  ) then
    raise exception 'Expected service-role write policy on public.games';
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'game_players'
      and policyname = 'game_players_write_service_role'
      and coalesce(qual, '') like '%auth.role() = ''service_role''%'
      and coalesce(with_check, '') like '%auth.role() = ''service_role''%'
  ) then
    raise exception 'Expected service-role write policy on public.game_players';
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'avatar_packs'
      and policyname = 'avatar_packs_write_service_role'
      and coalesce(qual, '') like '%auth.role() = ''service_role''%'
      and coalesce(with_check, '') like '%auth.role() = ''service_role''%'
  ) then
    raise exception 'Expected service-role write policy on public.avatar_packs';
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    raise exception 'service_role database role not found';
  end if;

  if has_function_privilege('public', 'app.bootstrap_family_v1(uuid,text,text)', 'EXECUTE') then
    raise exception 'public role must not execute app.bootstrap_family_v1';
  end if;

  if has_function_privilege('public', 'app.accept_invite_v1(uuid,text,text)', 'EXECUTE') then
    raise exception 'public role must not execute app.accept_invite_v1';
  end if;

  if has_function_privilege('public', 'app.roll_game_turn_v1(uuid,uuid,uuid)', 'EXECUTE') then
    raise exception 'public role must not execute app.roll_game_turn_v1';
  end if;

  if has_function_privilege('public', 'app.reserve_avatar_pack_v1(uuid,uuid,text,uuid)', 'EXECUTE') then
    raise exception 'public role must not execute app.reserve_avatar_pack_v1';
  end if;

  if not has_function_privilege('service_role', 'app.bootstrap_family_v1(uuid,text,text)', 'EXECUTE') then
    raise exception 'service_role must execute app.bootstrap_family_v1';
  end if;

  if not has_function_privilege('service_role', 'app.accept_invite_v1(uuid,text,text)', 'EXECUTE') then
    raise exception 'service_role must execute app.accept_invite_v1';
  end if;

  if not has_function_privilege('service_role', 'app.roll_game_turn_v1(uuid,uuid,uuid)', 'EXECUTE') then
    raise exception 'service_role must execute app.roll_game_turn_v1';
  end if;

  if not has_function_privilege('service_role', 'app.reserve_avatar_pack_v1(uuid,uuid,text,uuid)', 'EXECUTE') then
    raise exception 'service_role must execute app.reserve_avatar_pack_v1';
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and indexname = 'idx_family_members_single_active_family_per_user'
  ) then
    raise exception 'Missing unique active-membership index';
  end if;

  if not exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and indexname = 'idx_games_one_open_game_per_room'
  ) then
    raise exception 'Missing one-open-game-per-room index';
  end if;

  if not exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and indexname = 'idx_game_events_roll_request_unique'
  ) then
    raise exception 'Missing game roll request idempotency index';
  end if;
end
$$;

rollback;
