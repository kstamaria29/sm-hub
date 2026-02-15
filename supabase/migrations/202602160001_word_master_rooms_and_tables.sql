-- v1.8: Word Master game rooms + tables + RLS.

-- Ensure existing families have a Word Master room.
insert into public.rooms (family_id, kind, slug, title, created_by)
select
  f.id,
  'game'::public.room_type,
  'word-master',
  'Word Master',
  f.created_by
from public.families f
where not exists (
  select 1
  from public.rooms r
  where r.family_id = f.id
    and r.slug = 'word-master'
);

-- Update bootstrap to create both game rooms for new families.
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
    (v_family_id, 'game', 'word-master', 'Word Master', p_actor_user_id);

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
    'word_master_room_id', v_word_master_room_id
  );
end;
$$;

alter function app.bootstrap_family_v1(uuid, text, text) owner to postgres;
revoke all on function app.bootstrap_family_v1(uuid, text, text) from public;
grant execute on function app.bootstrap_family_v1(uuid, text, text) to service_role;

-- Word Master tables (authoritative state)
create table if not exists public.word_master_games (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  room_id uuid not null references public.rooms (id) on delete cascade,
  created_by uuid not null references auth.users (id),
  status public.game_status not null default 'pending',
  board_size int not null default 11 check (board_size between 9 and 15 and mod(board_size, 2) = 1),
  rack_size int not null default 7 check (rack_size between 5 and 10),
  bag text[] not null default array[]::text[],
  current_turn_user_id uuid references auth.users (id),
  winner_user_id uuid references auth.users (id),
  consecutive_passes int not null default 0 check (consecutive_passes >= 0),
  turn_number int not null default 1 check (turn_number >= 1),
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.word_master_players (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.word_master_games (id) on delete cascade,
  family_id uuid not null references public.families (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  player_order int not null check (player_order > 0),
  score int not null default 0 check (score >= 0),
  rack text[] not null default array[]::text[],
  created_at timestamptz not null default timezone('utc', now()),
  unique (game_id, user_id),
  unique (game_id, player_order)
);

create table if not exists public.word_master_board_tiles (
  game_id uuid not null references public.word_master_games (id) on delete cascade,
  family_id uuid not null references public.families (id) on delete cascade,
  row int not null check (row > 0),
  col int not null check (col > 0),
  letter text not null check (length(trim(letter)) = 1),
  points int not null check (points >= 0),
  placed_by uuid references auth.users (id),
  placed_at_turn int not null check (placed_at_turn >= 1),
  created_at timestamptz not null default timezone('utc', now()),
  primary key (game_id, row, col)
);

create table if not exists public.word_master_events (
  id bigint generated by default as identity primary key,
  game_id uuid not null references public.word_master_games (id) on delete cascade,
  family_id uuid not null references public.families (id) on delete cascade,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists idx_word_master_games_one_open_game_per_room
on public.word_master_games (room_id)
where status in ('pending', 'active');

create index if not exists idx_word_master_players_game_order
on public.word_master_players (game_id, player_order);

create index if not exists idx_word_master_events_game_id
on public.word_master_events (game_id, id desc);

create unique index if not exists idx_word_master_events_request_unique
on public.word_master_events (game_id, (payload ->> 'request_id'))
where event_type in ('turn_played', 'turn_passed');

create or replace function app.assert_word_master_game_family_match()
returns trigger
language plpgsql
as $$
declare
  v_game_family_id uuid;
begin
  select g.family_id
  into v_game_family_id
  from public.word_master_games g
  where g.id = new.game_id;

  if v_game_family_id is null then
    raise exception 'word_master_game % does not exist', new.game_id
      using errcode = '23503';
  end if;

  if new.family_id <> v_game_family_id then
    raise exception 'family_id mismatch for word_master_game %', new.game_id
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_word_master_games_room_family_check on public.word_master_games;
create trigger trg_word_master_games_room_family_check
before insert or update on public.word_master_games
for each row execute function app.assert_room_family_match();

drop trigger if exists trg_word_master_players_family_check on public.word_master_players;
create trigger trg_word_master_players_family_check
before insert or update on public.word_master_players
for each row execute function app.assert_word_master_game_family_match();

drop trigger if exists trg_word_master_board_tiles_family_check on public.word_master_board_tiles;
create trigger trg_word_master_board_tiles_family_check
before insert or update on public.word_master_board_tiles
for each row execute function app.assert_word_master_game_family_match();

drop trigger if exists trg_word_master_events_family_check on public.word_master_events;
create trigger trg_word_master_events_family_check
before insert or update on public.word_master_events
for each row execute function app.assert_word_master_game_family_match();

drop trigger if exists trg_word_master_games_touch_updated_at on public.word_master_games;
create trigger trg_word_master_games_touch_updated_at
before update on public.word_master_games
for each row execute function app.touch_updated_at();

alter table public.word_master_games enable row level security;
alter table public.word_master_players enable row level security;
alter table public.word_master_board_tiles enable row level security;
alter table public.word_master_events enable row level security;

create policy word_master_games_select_same_family
on public.word_master_games
for select
using (app.is_family_member(family_id));

create policy word_master_games_write_service_role
on public.word_master_games
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

create policy word_master_players_select_same_family
on public.word_master_players
for select
using (app.is_family_member(family_id));

create policy word_master_players_write_service_role
on public.word_master_players
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

create policy word_master_board_tiles_select_same_family
on public.word_master_board_tiles
for select
using (app.is_family_member(family_id));

create policy word_master_board_tiles_write_service_role
on public.word_master_board_tiles
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

create policy word_master_events_select_same_family
on public.word_master_events
for select
using (app.is_family_member(family_id));

create policy word_master_events_insert_service_role
on public.word_master_events
for insert
with check (auth.role() = 'service_role');

create or replace function app.word_master_letter_points_v1(p_letter text)
returns int
language sql
immutable
as $$
  select case upper(left(trim(coalesce(p_letter, '')), 1))
    when 'A' then 1
    when 'B' then 3
    when 'C' then 3
    when 'D' then 2
    when 'E' then 1
    when 'F' then 4
    when 'G' then 2
    when 'H' then 4
    when 'I' then 1
    when 'J' then 8
    when 'K' then 5
    when 'L' then 1
    when 'M' then 3
    when 'N' then 1
    when 'O' then 1
    when 'P' then 3
    when 'Q' then 10
    when 'R' then 1
    when 'S' then 1
    when 'T' then 1
    when 'U' then 1
    when 'V' then 4
    when 'W' then 4
    when 'X' then 8
    when 'Y' then 4
    when 'Z' then 10
    else 0
  end;
$$;

