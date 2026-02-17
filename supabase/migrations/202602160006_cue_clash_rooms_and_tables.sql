-- v1.9: Cue Clash (pool) game room + tables + RLS.

-- Ensure existing families have a Cue Clash room.
insert into public.rooms (family_id, kind, slug, title, created_by)
select
  f.id,
  'game'::public.room_type,
  'cue-clash',
  'Cue Clash',
  f.created_by
from public.families f
where not exists (
  select 1
  from public.rooms r
  where r.family_id = f.id
    and r.slug = 'cue-clash'
);

-- Update bootstrap to create Cue Clash game room for new families.
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
  v_snakes_room_id uuid;
  v_word_master_room_id uuid;
  v_cue_clash_room_id uuid;
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
    (v_family_id, 'game', 'snakes-ladders', 'Snakes and Ladders', p_actor_user_id),
    (v_family_id, 'game', 'word-master', 'Word Master', p_actor_user_id),
    (v_family_id, 'game', 'cue-clash', 'Cue Clash', p_actor_user_id);

  select room.id
  into v_chat_room_id
  from public.rooms room
  where room.family_id = v_family_id
    and room.slug = 'family-chat'
  limit 1;

  select room.id
  into v_snakes_room_id
  from public.rooms room
  where room.family_id = v_family_id
    and room.slug = 'snakes-ladders'
  limit 1;

  select room.id
  into v_word_master_room_id
  from public.rooms room
  where room.family_id = v_family_id
    and room.slug = 'word-master'
  limit 1;

  select room.id
  into v_cue_clash_room_id
  from public.rooms room
  where room.family_id = v_family_id
    and room.slug = 'cue-clash'
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
    'snakes_ladders_room_id', v_snakes_room_id,
    'word_master_room_id', v_word_master_room_id,
    'cue_clash_room_id', v_cue_clash_room_id
  );
end;
$$;

alter function app.bootstrap_family_v1(uuid, text, text) owner to postgres;
revoke all on function app.bootstrap_family_v1(uuid, text, text) from public;
grant execute on function app.bootstrap_family_v1(uuid, text, text) to service_role;

-- Cue Clash tables (authoritative state)
create table if not exists public.cue_clash_games (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  room_id uuid not null references public.rooms (id) on delete cascade,
  created_by uuid not null references auth.users (id),
  status public.game_status not null default 'pending',
  balls jsonb not null default '{}'::jsonb,
  open_table boolean not null default true,
  current_turn_user_id uuid references auth.users (id),
  winner_user_id uuid references auth.users (id),
  turn_number int not null default 1 check (turn_number >= 1),
  last_shot_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.cue_clash_players (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.cue_clash_games (id) on delete cascade,
  family_id uuid not null references public.families (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  player_order int not null check (player_order > 0),
  suit text check (suit in ('solids', 'stripes')),
  fouls int not null default 0 check (fouls >= 0),
  created_at timestamptz not null default timezone('utc', now()),
  unique (game_id, user_id),
  unique (game_id, player_order)
);

create table if not exists public.cue_clash_events (
  id bigint generated by default as identity primary key,
  game_id uuid not null references public.cue_clash_games (id) on delete cascade,
  family_id uuid not null references public.families (id) on delete cascade,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists idx_cue_clash_games_one_open_game_per_room
on public.cue_clash_games (room_id)
where status in ('pending', 'active');

create index if not exists idx_cue_clash_players_game_order
on public.cue_clash_players (game_id, player_order);

create index if not exists idx_cue_clash_events_game_id
on public.cue_clash_events (game_id, id desc);

create unique index if not exists idx_cue_clash_events_request_unique
on public.cue_clash_events (game_id, (payload ->> 'request_id'))
where event_type in ('shot_taken', 'turn_passed');

create or replace function app.assert_cue_clash_game_family_match()
returns trigger
language plpgsql
as $$
declare
  v_game_family_id uuid;
begin
  select g.family_id
  into v_game_family_id
  from public.cue_clash_games g
  where g.id = new.game_id;

  if v_game_family_id is null then
    raise exception 'cue_clash_game % does not exist', new.game_id
      using errcode = '23503';
  end if;

  if new.family_id <> v_game_family_id then
    raise exception 'family_id mismatch for cue_clash_game %', new.game_id
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_cue_clash_games_room_family_check on public.cue_clash_games;
create trigger trg_cue_clash_games_room_family_check
before insert or update on public.cue_clash_games
for each row execute function app.assert_room_family_match();

drop trigger if exists trg_cue_clash_players_family_check on public.cue_clash_players;
create trigger trg_cue_clash_players_family_check
before insert or update on public.cue_clash_players
for each row execute function app.assert_cue_clash_game_family_match();

drop trigger if exists trg_cue_clash_events_family_check on public.cue_clash_events;
create trigger trg_cue_clash_events_family_check
before insert or update on public.cue_clash_events
for each row execute function app.assert_cue_clash_game_family_match();

drop trigger if exists trg_cue_clash_games_touch_updated_at on public.cue_clash_games;
create trigger trg_cue_clash_games_touch_updated_at
before update on public.cue_clash_games
for each row execute function app.touch_updated_at();

alter table public.cue_clash_games enable row level security;
alter table public.cue_clash_players enable row level security;
alter table public.cue_clash_events enable row level security;

create policy cue_clash_games_select_same_family
on public.cue_clash_games
for select
using (app.is_family_member(family_id));

create policy cue_clash_games_write_service_role
on public.cue_clash_games
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

create policy cue_clash_players_select_same_family
on public.cue_clash_players
for select
using (app.is_family_member(family_id));

create policy cue_clash_players_write_service_role
on public.cue_clash_players
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

create policy cue_clash_events_select_same_family
on public.cue_clash_events
for select
using (app.is_family_member(family_id));

create policy cue_clash_events_insert_service_role
on public.cue_clash_events
for insert
with check (auth.role() = 'service_role');

