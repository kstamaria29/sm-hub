-- v1.4: harden RPC execution context to avoid recursive RLS evaluation.
-- Ensures helper policy functions run as definer and wrapper RPCs execute as definer.

grant usage on schema app to authenticated, anon, service_role;

create or replace function app.is_family_member(target_family_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, app
as $$
  select exists (
    select 1
    from public.family_members fm
    where fm.family_id = target_family_id
      and fm.user_id = auth.uid()
      and fm.status = 'active'
  );
$$;

create or replace function app.family_role_for_user(target_family_id uuid)
returns public.family_role
language sql
stable
security definer
set search_path = public, app
as $$
  select fm.role
  from public.family_members fm
  where fm.family_id = target_family_id
    and fm.user_id = auth.uid()
    and fm.status = 'active'
  limit 1;
$$;

create or replace function app.is_family_member_user(target_family_id uuid, target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, app
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
security definer
set search_path = public, app
as $$
  select fm.role
  from public.family_members fm
  where fm.family_id = target_family_id
    and fm.user_id = target_user_id
    and fm.status = 'active'
  limit 1;
$$;

revoke all on function app.is_family_member(uuid) from public;
revoke all on function app.family_role_for_user(uuid) from public;
revoke all on function app.is_family_member_user(uuid, uuid) from public;
revoke all on function app.family_role_for_user_id(uuid, uuid) from public;

grant execute on function app.is_family_member(uuid) to authenticated, anon, service_role;
grant execute on function app.family_role_for_user(uuid) to authenticated, anon, service_role;
grant execute on function app.is_family_member_user(uuid, uuid) to authenticated, anon, service_role;
grant execute on function app.family_role_for_user_id(uuid, uuid) to authenticated, anon, service_role;

alter function app.bootstrap_family_v1(uuid, text, text) security definer;
alter function app.admin_add_family_member_v1(uuid, uuid, uuid, text) security definer;
alter function app.roll_game_turn_v1(uuid, uuid, uuid) security definer;
alter function app.reserve_avatar_pack_v1(uuid, uuid, text, uuid) security definer;

alter function app.bootstrap_family_v1(uuid, text, text) owner to postgres;
alter function app.admin_add_family_member_v1(uuid, uuid, uuid, text) owner to postgres;
alter function app.roll_game_turn_v1(uuid, uuid, uuid) owner to postgres;
alter function app.reserve_avatar_pack_v1(uuid, uuid, text, uuid) owner to postgres;

create or replace function public.bootstrap_family_v1(
  p_actor_user_id uuid,
  p_family_name text,
  p_display_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = app, public
as $$
begin
  return app.bootstrap_family_v1(p_actor_user_id, p_family_name, p_display_name);
end;
$$;

create or replace function public.admin_add_family_member_v1(
  p_actor_user_id uuid,
  p_family_id uuid,
  p_member_user_id uuid,
  p_display_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = app, public
as $$
begin
  return app.admin_add_family_member_v1(p_actor_user_id, p_family_id, p_member_user_id, p_display_name);
end;
$$;

create or replace function public.roll_game_turn_v1(
  p_game_id uuid,
  p_actor_user_id uuid,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = app, public
as $$
begin
  return app.roll_game_turn_v1(p_game_id, p_actor_user_id, p_request_id);
end;
$$;

create or replace function public.reserve_avatar_pack_v1(
  p_family_id uuid,
  p_user_id uuid,
  p_style_id text,
  p_created_by uuid
)
returns jsonb
language plpgsql
security definer
set search_path = app, public
as $$
begin
  return app.reserve_avatar_pack_v1(p_family_id, p_user_id, p_style_id, p_created_by);
end;
$$;

alter function public.bootstrap_family_v1(uuid, text, text) owner to postgres;
alter function public.admin_add_family_member_v1(uuid, uuid, uuid, text) owner to postgres;
alter function public.roll_game_turn_v1(uuid, uuid, uuid) owner to postgres;
alter function public.reserve_avatar_pack_v1(uuid, uuid, text, uuid) owner to postgres;

revoke all on function public.bootstrap_family_v1(uuid, text, text) from public;
revoke all on function public.admin_add_family_member_v1(uuid, uuid, uuid, text) from public;
revoke all on function public.roll_game_turn_v1(uuid, uuid, uuid) from public;
revoke all on function public.reserve_avatar_pack_v1(uuid, uuid, text, uuid) from public;

grant execute on function public.bootstrap_family_v1(uuid, text, text) to service_role;
grant execute on function public.admin_add_family_member_v1(uuid, uuid, uuid, text) to service_role;
grant execute on function public.roll_game_turn_v1(uuid, uuid, uuid) to service_role;
grant execute on function public.reserve_avatar_pack_v1(uuid, uuid, text, uuid) to service_role;

notify pgrst, 'reload schema';
