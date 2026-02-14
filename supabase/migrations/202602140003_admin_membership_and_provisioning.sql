-- v1.1: admin/member role model + admin-provisioned family members.

update public.family_members
set role = 'admin'
where role = 'owner';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'family_members_no_owner_role'
      and conrelid = 'public.family_members'::regclass
  ) then
    alter table public.family_members
      add constraint family_members_no_owner_role
      check (role <> 'owner');
  end if;
end
$$;

drop policy if exists families_update_owner_admin on public.families;
drop policy if exists family_members_insert_owner_admin on public.family_members;
drop policy if exists family_members_update_owner_admin on public.family_members;
drop policy if exists family_members_delete_owner_admin on public.family_members;
drop policy if exists invites_manage_owner_admin on public.invites;
drop policy if exists rooms_manage_owner_admin on public.rooms;
drop policy if exists families_update_admin on public.families;
drop policy if exists family_members_insert_admin on public.family_members;
drop policy if exists family_members_update_admin on public.family_members;
drop policy if exists family_members_delete_admin on public.family_members;
drop policy if exists invites_manage_admin on public.invites;
drop policy if exists rooms_manage_admin on public.rooms;

create policy families_update_admin
on public.families
for update
using (app.family_role_for_user(id) = 'admin')
with check (app.family_role_for_user(id) = 'admin');

create policy family_members_insert_admin
on public.family_members
for insert
with check (app.family_role_for_user(family_id) = 'admin');

create policy family_members_update_admin
on public.family_members
for update
using (app.family_role_for_user(family_id) = 'admin')
with check (app.family_role_for_user(family_id) = 'admin');

create policy family_members_delete_admin
on public.family_members
for delete
using (app.family_role_for_user(family_id) = 'admin');

create policy invites_manage_admin
on public.invites
for all
using (app.family_role_for_user(family_id) = 'admin')
with check (app.family_role_for_user(family_id) = 'admin');

create policy rooms_manage_admin
on public.rooms
for all
using (app.family_role_for_user(family_id) = 'admin')
with check (app.family_role_for_user(family_id) = 'admin');

do $$
begin
  if to_regprocedure('app.storage_family_id(text)') is not null
     and to_regprocedure('app.storage_user_id(text)') is not null then
    execute 'drop policy if exists avatar_originals_insert_self_or_admin on storage.objects';
    execute 'drop policy if exists avatar_originals_update_self_or_admin on storage.objects';
    execute 'drop policy if exists avatar_originals_delete_self_or_admin on storage.objects';

    execute $policy$
      create policy avatar_originals_insert_self_or_admin
      on storage.objects
      for insert
      to authenticated
      with check (
        bucket_id = 'avatar-originals'
        and app.is_family_member(app.storage_family_id(name))
        and (
          app.storage_user_id(name) = auth.uid()
          or app.family_role_for_user(app.storage_family_id(name)) = 'admin'
        )
      )
    $policy$;

    execute $policy$
      create policy avatar_originals_update_self_or_admin
      on storage.objects
      for update
      to authenticated
      using (
        bucket_id = 'avatar-originals'
        and app.is_family_member(app.storage_family_id(name))
        and (
          app.storage_user_id(name) = auth.uid()
          or app.family_role_for_user(app.storage_family_id(name)) = 'admin'
        )
      )
      with check (
        bucket_id = 'avatar-originals'
        and app.is_family_member(app.storage_family_id(name))
        and (
          app.storage_user_id(name) = auth.uid()
          or app.family_role_for_user(app.storage_family_id(name)) = 'admin'
        )
      )
    $policy$;

    execute $policy$
      create policy avatar_originals_delete_self_or_admin
      on storage.objects
      for delete
      to authenticated
      using (
        bucket_id = 'avatar-originals'
        and app.is_family_member(app.storage_family_id(name))
        and (
          app.storage_user_id(name) = auth.uid()
          or app.family_role_for_user(app.storage_family_id(name)) = 'admin'
        )
      )
    $policy$;
  end if;
end
$$;

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
  values (v_family_id, p_actor_user_id, 'admin', 'active')
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
    'admin_user_id', p_actor_user_id,
    'chat_room_id', v_chat_room_id,
    'game_room_id', v_game_room_id
  );
end;
$$;

create or replace function app.admin_add_family_member_v1(
  p_actor_user_id uuid,
  p_family_id uuid,
  p_member_user_id uuid,
  p_display_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_member_id uuid;
begin
  if p_actor_user_id is null or p_family_id is null or p_member_user_id is null then
    raise exception 'actor_user_id, family_id, and member_user_id are required' using errcode = '22023';
  end if;

  if not app.is_family_member_user(p_family_id, p_actor_user_id) then
    raise exception 'actor is not an active family member' using errcode = '23514';
  end if;

  if app.family_role_for_user_id(p_family_id, p_actor_user_id) <> 'admin' then
    raise exception 'actor must be admin' using errcode = '42501';
  end if;

  if exists (
    select 1
    from public.family_members fm
    where fm.user_id = p_member_user_id
      and fm.status = 'active'
      and fm.family_id <> p_family_id
  ) then
    raise exception 'target user belongs to another active family' using errcode = '23514';
  end if;

  insert into public.family_members (family_id, user_id, role, status)
  values (p_family_id, p_member_user_id, 'member', 'active')
  on conflict (family_id, user_id) do update
  set
    status = 'active',
    role = 'member'
  returning id into v_member_id;

  insert into public.user_profiles (user_id, family_id, display_name)
  values (
    p_member_user_id,
    p_family_id,
    nullif(trim(coalesce(p_display_name, '')), '')
  )
  on conflict (user_id) do update
  set
    family_id = excluded.family_id,
    display_name = coalesce(excluded.display_name, public.user_profiles.display_name);

  return jsonb_build_object(
    'family_id', p_family_id,
    'member_user_id', p_member_user_id,
    'member_id', v_member_id
  );
end;
$$;

revoke all on function app.admin_add_family_member_v1(uuid, uuid, uuid, text) from public;
grant execute on function app.admin_add_family_member_v1(uuid, uuid, uuid, text) to service_role;

revoke execute on function app.accept_invite_v1(uuid, text, text) from service_role;
