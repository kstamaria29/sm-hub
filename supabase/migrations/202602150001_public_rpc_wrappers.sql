-- v1.2: expose app RPCs through public wrappers for PostgREST schema resolution.
-- Edge Functions call /rpc/<name> against public by default.

create or replace function public.bootstrap_family_v1(
  p_actor_user_id uuid,
  p_family_name text,
  p_display_name text default null
)
returns jsonb
language sql
security invoker
set search_path = public, app
as $$
  select app.bootstrap_family_v1(
    p_actor_user_id := p_actor_user_id,
    p_family_name := p_family_name,
    p_display_name := p_display_name
  );
$$;

create or replace function public.admin_add_family_member_v1(
  p_actor_user_id uuid,
  p_family_id uuid,
  p_member_user_id uuid,
  p_display_name text default null
)
returns jsonb
language sql
security invoker
set search_path = public, app
as $$
  select app.admin_add_family_member_v1(
    p_actor_user_id := p_actor_user_id,
    p_family_id := p_family_id,
    p_member_user_id := p_member_user_id,
    p_display_name := p_display_name
  );
$$;

create or replace function public.roll_game_turn_v1(
  p_game_id uuid,
  p_actor_user_id uuid,
  p_request_id uuid
)
returns jsonb
language sql
security invoker
set search_path = public, app
as $$
  select app.roll_game_turn_v1(
    p_game_id := p_game_id,
    p_actor_user_id := p_actor_user_id,
    p_request_id := p_request_id
  );
$$;

create or replace function public.reserve_avatar_pack_v1(
  p_family_id uuid,
  p_user_id uuid,
  p_style_id text,
  p_created_by uuid
)
returns jsonb
language sql
security invoker
set search_path = public, app
as $$
  select app.reserve_avatar_pack_v1(
    p_family_id := p_family_id,
    p_user_id := p_user_id,
    p_style_id := p_style_id,
    p_created_by := p_created_by
  );
$$;

revoke all on function public.bootstrap_family_v1(uuid, text, text) from public;
revoke all on function public.admin_add_family_member_v1(uuid, uuid, uuid, text) from public;
revoke all on function public.roll_game_turn_v1(uuid, uuid, uuid) from public;
revoke all on function public.reserve_avatar_pack_v1(uuid, uuid, text, uuid) from public;

grant execute on function public.bootstrap_family_v1(uuid, text, text) to service_role;
grant execute on function public.admin_add_family_member_v1(uuid, uuid, uuid, text) to service_role;
grant execute on function public.roll_game_turn_v1(uuid, uuid, uuid) to service_role;
grant execute on function public.reserve_avatar_pack_v1(uuid, uuid, text, uuid) to service_role;

notify pgrst, 'reload schema';
