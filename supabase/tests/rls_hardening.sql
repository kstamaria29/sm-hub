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
        'message_reactions',
        'games',
        'game_players',
        'game_events',
        'word_master_games',
        'word_master_players',
        'word_master_board_tiles',
        'word_master_events',
        'cue_clash_games',
        'cue_clash_players',
        'cue_clash_events',
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
        'message_reactions',
        'games',
        'game_players',
        'game_events',
        'word_master_games',
        'word_master_players',
        'word_master_board_tiles',
        'word_master_events',
        'cue_clash_games',
        'cue_clash_players',
        'cue_clash_events',
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
      and tablename = 'word_master_games'
      and policyname = 'word_master_games_write_service_role'
      and coalesce(qual, '') like '%auth.role() = ''service_role''%'
      and coalesce(with_check, '') like '%auth.role() = ''service_role''%'
  ) then
    raise exception 'Expected service-role write policy on public.word_master_games';
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'word_master_players'
      and policyname = 'word_master_players_write_service_role'
      and coalesce(qual, '') like '%auth.role() = ''service_role''%'
      and coalesce(with_check, '') like '%auth.role() = ''service_role''%'
  ) then
    raise exception 'Expected service-role write policy on public.word_master_players';
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'word_master_board_tiles'
      and policyname = 'word_master_board_tiles_write_service_role'
      and coalesce(qual, '') like '%auth.role() = ''service_role''%'
      and coalesce(with_check, '') like '%auth.role() = ''service_role''%'
  ) then
    raise exception 'Expected service-role write policy on public.word_master_board_tiles';
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

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'cue_clash_games'
      and policyname = 'cue_clash_games_write_service_role'
      and coalesce(qual, '') like '%auth.role() = ''service_role''%'
      and coalesce(with_check, '') like '%auth.role() = ''service_role''%'
  ) then
    raise exception 'Expected service-role write policy on public.cue_clash_games';
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'cue_clash_players'
      and policyname = 'cue_clash_players_write_service_role'
      and coalesce(qual, '') like '%auth.role() = ''service_role''%'
      and coalesce(with_check, '') like '%auth.role() = ''service_role''%'
  ) then
    raise exception 'Expected service-role write policy on public.cue_clash_players';
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'cue_clash_events'
      and policyname = 'cue_clash_events_insert_service_role'
      and coalesce(with_check, '') like '%auth.role() = ''service_role''%'
  ) then
    raise exception 'Expected service-role insert policy on public.cue_clash_events';
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    raise exception 'service_role database role not found';
  end if;

  if not has_schema_privilege('authenticated', 'app', 'USAGE') then
    raise exception 'authenticated must have USAGE on schema app';
  end if;

  if not has_schema_privilege('anon', 'app', 'USAGE') then
    raise exception 'anon must have USAGE on schema app';
  end if;

  if not has_schema_privilege('service_role', 'app', 'USAGE') then
    raise exception 'service_role must have USAGE on schema app';
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

  if has_function_privilege('public', 'app.start_game_v1(uuid,uuid,uuid[])', 'EXECUTE') then
    raise exception 'public role must not execute app.start_game_v1';
  end if;

  if has_function_privilege('public', 'app.end_game_v1(uuid,uuid,text)', 'EXECUTE') then
    raise exception 'public role must not execute app.end_game_v1';
  end if;

  if has_function_privilege('public', 'app.reserve_avatar_pack_v1(uuid,uuid,text,uuid)', 'EXECUTE') then
    raise exception 'public role must not execute app.reserve_avatar_pack_v1';
  end if;

  if has_function_privilege('public', 'app.word_master_start_v1(uuid,uuid,uuid[],int,int)', 'EXECUTE') then
    raise exception 'public role must not execute app.word_master_start_v1';
  end if;

  if has_function_privilege('public', 'app.word_master_play_turn_v1(uuid,uuid,uuid,jsonb)', 'EXECUTE') then
    raise exception 'public role must not execute app.word_master_play_turn_v1';
  end if;

  if has_function_privilege('public', 'app.word_master_pass_turn_v1(uuid,uuid,uuid)', 'EXECUTE') then
    raise exception 'public role must not execute app.word_master_pass_turn_v1';
  end if;

  if has_function_privilege('public', 'app.word_master_end_game_v1(uuid,uuid,text)', 'EXECUTE') then
    raise exception 'public role must not execute app.word_master_end_game_v1';
  end if;

  if has_function_privilege('public', 'app.admin_add_family_member_v1(uuid,uuid,uuid,text)', 'EXECUTE') then
    raise exception 'public role must not execute app.admin_add_family_member_v1';
  end if;

  if not has_function_privilege('service_role', 'app.bootstrap_family_v1(uuid,text,text)', 'EXECUTE') then
    raise exception 'service_role must execute app.bootstrap_family_v1';
  end if;

  if has_function_privilege('service_role', 'app.accept_invite_v1(uuid,text,text)', 'EXECUTE') then
    raise exception 'service_role must not execute app.accept_invite_v1';
  end if;

  if not has_function_privilege('service_role', 'app.roll_game_turn_v1(uuid,uuid,uuid)', 'EXECUTE') then
    raise exception 'service_role must execute app.roll_game_turn_v1';
  end if;

  if not has_function_privilege('service_role', 'app.start_game_v1(uuid,uuid,uuid[])', 'EXECUTE') then
    raise exception 'service_role must execute app.start_game_v1';
  end if;

  if not has_function_privilege('service_role', 'app.end_game_v1(uuid,uuid,text)', 'EXECUTE') then
    raise exception 'service_role must execute app.end_game_v1';
  end if;

  if not has_function_privilege('service_role', 'app.reserve_avatar_pack_v1(uuid,uuid,text,uuid)', 'EXECUTE') then
    raise exception 'service_role must execute app.reserve_avatar_pack_v1';
  end if;

  if not has_function_privilege('service_role', 'app.word_master_start_v1(uuid,uuid,uuid[],int,int)', 'EXECUTE') then
    raise exception 'service_role must execute app.word_master_start_v1';
  end if;

  if not has_function_privilege('service_role', 'app.word_master_play_turn_v1(uuid,uuid,uuid,jsonb)', 'EXECUTE') then
    raise exception 'service_role must execute app.word_master_play_turn_v1';
  end if;

  if not has_function_privilege('service_role', 'app.word_master_pass_turn_v1(uuid,uuid,uuid)', 'EXECUTE') then
    raise exception 'service_role must execute app.word_master_pass_turn_v1';
  end if;

  if not has_function_privilege('service_role', 'app.word_master_end_game_v1(uuid,uuid,text)', 'EXECUTE') then
    raise exception 'service_role must execute app.word_master_end_game_v1';
  end if;

  if not has_function_privilege('service_role', 'app.admin_add_family_member_v1(uuid,uuid,uuid,text)', 'EXECUTE') then
    raise exception 'service_role must execute app.admin_add_family_member_v1';
  end if;

  if has_function_privilege('public', 'public.bootstrap_family_v1(uuid,text,text)', 'EXECUTE') then
    raise exception 'public role must not execute public.bootstrap_family_v1';
  end if;

  if has_function_privilege('public', 'public.admin_add_family_member_v1(uuid,uuid,uuid,text)', 'EXECUTE') then
    raise exception 'public role must not execute public.admin_add_family_member_v1';
  end if;

  if has_function_privilege('public', 'public.roll_game_turn_v1(uuid,uuid,uuid)', 'EXECUTE') then
    raise exception 'public role must not execute public.roll_game_turn_v1';
  end if;

  if has_function_privilege('public', 'public.start_game_v1(uuid,uuid,uuid[])', 'EXECUTE') then
    raise exception 'public role must not execute public.start_game_v1';
  end if;

  if has_function_privilege('public', 'public.end_game_v1(uuid,uuid,text)', 'EXECUTE') then
    raise exception 'public role must not execute public.end_game_v1';
  end if;

  if has_function_privilege('public', 'public.reserve_avatar_pack_v1(uuid,uuid,text,uuid)', 'EXECUTE') then
    raise exception 'public role must not execute public.reserve_avatar_pack_v1';
  end if;

  if has_function_privilege('public', 'public.word_master_start_v1(uuid,uuid,uuid[],int,int)', 'EXECUTE') then
    raise exception 'public role must not execute public.word_master_start_v1';
  end if;

  if has_function_privilege('public', 'public.word_master_play_turn_v1(uuid,uuid,uuid,jsonb)', 'EXECUTE') then
    raise exception 'public role must not execute public.word_master_play_turn_v1';
  end if;

  if has_function_privilege('public', 'public.word_master_pass_turn_v1(uuid,uuid,uuid)', 'EXECUTE') then
    raise exception 'public role must not execute public.word_master_pass_turn_v1';
  end if;

  if has_function_privilege('public', 'public.word_master_end_game_v1(uuid,uuid,text)', 'EXECUTE') then
    raise exception 'public role must not execute public.word_master_end_game_v1';
  end if;

  if has_function_privilege('public', 'public.cue_clash_start_v1(uuid,uuid,uuid[])', 'EXECUTE') then
    raise exception 'public role must not execute public.cue_clash_start_v1';
  end if;

  if has_function_privilege('public', 'public.cue_clash_take_shot_v1(uuid,uuid,uuid,int,jsonb,uuid,boolean,jsonb,boolean,uuid,public.game_status,jsonb)', 'EXECUTE') then
    raise exception 'public role must not execute public.cue_clash_take_shot_v1';
  end if;

  if has_function_privilege('public', 'public.cue_clash_end_game_v1(uuid,uuid,text)', 'EXECUTE') then
    raise exception 'public role must not execute public.cue_clash_end_game_v1';
  end if;

  if not has_function_privilege('service_role', 'public.bootstrap_family_v1(uuid,text,text)', 'EXECUTE') then
    raise exception 'service_role must execute public.bootstrap_family_v1';
  end if;

  if not has_function_privilege('service_role', 'public.admin_add_family_member_v1(uuid,uuid,uuid,text)', 'EXECUTE') then
    raise exception 'service_role must execute public.admin_add_family_member_v1';
  end if;

  if not has_function_privilege('service_role', 'public.roll_game_turn_v1(uuid,uuid,uuid)', 'EXECUTE') then
    raise exception 'service_role must execute public.roll_game_turn_v1';
  end if;

  if not has_function_privilege('service_role', 'public.start_game_v1(uuid,uuid,uuid[])', 'EXECUTE') then
    raise exception 'service_role must execute public.start_game_v1';
  end if;

  if not has_function_privilege('service_role', 'public.end_game_v1(uuid,uuid,text)', 'EXECUTE') then
    raise exception 'service_role must execute public.end_game_v1';
  end if;

  if not has_function_privilege('service_role', 'public.reserve_avatar_pack_v1(uuid,uuid,text,uuid)', 'EXECUTE') then
    raise exception 'service_role must execute public.reserve_avatar_pack_v1';
  end if;

  if not has_function_privilege('service_role', 'public.word_master_start_v1(uuid,uuid,uuid[],int,int)', 'EXECUTE') then
    raise exception 'service_role must execute public.word_master_start_v1';
  end if;

  if not has_function_privilege('service_role', 'public.word_master_play_turn_v1(uuid,uuid,uuid,jsonb)', 'EXECUTE') then
    raise exception 'service_role must execute public.word_master_play_turn_v1';
  end if;

  if not has_function_privilege('service_role', 'public.word_master_pass_turn_v1(uuid,uuid,uuid)', 'EXECUTE') then
    raise exception 'service_role must execute public.word_master_pass_turn_v1';
  end if;

  if not has_function_privilege('service_role', 'public.word_master_end_game_v1(uuid,uuid,text)', 'EXECUTE') then
    raise exception 'service_role must execute public.word_master_end_game_v1';
  end if;

  if not has_function_privilege('service_role', 'public.cue_clash_start_v1(uuid,uuid,uuid[])', 'EXECUTE') then
    raise exception 'service_role must execute public.cue_clash_start_v1';
  end if;

  if not has_function_privilege('service_role', 'public.cue_clash_take_shot_v1(uuid,uuid,uuid,int,jsonb,uuid,boolean,jsonb,boolean,uuid,public.game_status,jsonb)', 'EXECUTE') then
    raise exception 'service_role must execute public.cue_clash_take_shot_v1';
  end if;

  if not has_function_privilege('service_role', 'public.cue_clash_end_game_v1(uuid,uuid,text)', 'EXECUTE') then
    raise exception 'service_role must execute public.cue_clash_end_game_v1';
  end if;

  if not has_function_privilege('authenticated', 'app.is_family_member(uuid)', 'EXECUTE') then
    raise exception 'authenticated must execute app.is_family_member';
  end if;

  if not has_function_privilege('authenticated', 'app.family_role_for_user(uuid)', 'EXECUTE') then
    raise exception 'authenticated must execute app.family_role_for_user';
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'family_members_no_owner_role'
      and conrelid = 'public.family_members'::regclass
  ) then
    raise exception 'Missing no-owner-role check on family_members';
  end if;

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
      and indexname = 'idx_word_master_games_one_open_game_per_room'
  ) then
    raise exception 'Missing Word Master one-open-game-per-room index';
  end if;

  if not exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and indexname = 'idx_cue_clash_games_one_open_game_per_room'
  ) then
    raise exception 'Missing Cue Clash one-open-game-per-room index';
  end if;

  if not exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and indexname = 'idx_game_events_roll_request_unique'
  ) then
    raise exception 'Missing game roll request idempotency index';
  end if;

  if not exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and indexname = 'idx_word_master_events_request_unique'
  ) then
    raise exception 'Missing Word Master request idempotency index';
  end if;

  if not exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and indexname = 'idx_cue_clash_events_request_unique'
  ) then
    raise exception 'Missing Cue Clash request idempotency index';
  end if;
end
$$;

rollback;
