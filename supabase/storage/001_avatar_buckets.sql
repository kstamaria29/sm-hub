-- Storage bucket + policy scaffold for Family Hub v1 avatars.
-- Required path format:
-- avatar-packs/<family_id>/<user_id>/<style_id>/<version>/{neutral|happy|angry|crying}.png
-- avatar-originals/<family_id>/<user_id>/original.<ext>

insert into storage.buckets (id, name, public)
values ('avatar-packs', 'avatar-packs', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('avatar-originals', 'avatar-originals', false)
on conflict (id) do nothing;

create or replace function app.try_uuid(raw text)
returns uuid
language plpgsql
immutable
as $$
begin
  return raw::uuid;
exception
  when others then
    return null;
end;
$$;

create or replace function app.storage_family_id(path text)
returns uuid
language sql
immutable
as $$
  select app.try_uuid(split_part(path, '/', 1));
$$;

create or replace function app.storage_user_id(path text)
returns uuid
language sql
immutable
as $$
  select app.try_uuid(split_part(path, '/', 2));
$$;

create policy avatar_packs_select_same_family
on storage.objects
for select
to authenticated
using (
  bucket_id = 'avatar-packs'
  and app.is_family_member(app.storage_family_id(name))
);

create policy avatar_packs_insert_service_role_only
on storage.objects
for insert
to public
with check (
  bucket_id = 'avatar-packs'
  and auth.role() = 'service_role'
);

create policy avatar_packs_update_service_role_only
on storage.objects
for update
to public
using (
  bucket_id = 'avatar-packs'
  and auth.role() = 'service_role'
)
with check (
  bucket_id = 'avatar-packs'
  and auth.role() = 'service_role'
);

create policy avatar_packs_delete_service_role_only
on storage.objects
for delete
to public
using (
  bucket_id = 'avatar-packs'
  and auth.role() = 'service_role'
);

create policy avatar_originals_select_same_family
on storage.objects
for select
to authenticated
using (
  bucket_id = 'avatar-originals'
  and app.is_family_member(app.storage_family_id(name))
);

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
);

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
);

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
);
