-- v1.8: Word Master authoritative play-turn RPC + public wrapper.

create or replace function app.word_master_play_turn_v1(
  p_game_id uuid,
  p_actor_user_id uuid,
  p_request_id uuid,
  p_placements jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_game public.word_master_games%rowtype;
  v_player public.word_master_players%rowtype;
  v_existing_payload jsonb;
  v_existing_tile_count int := 0;
  v_seen_coords text[] := array[]::text[];
  v_letters text[] := array[]::text[];
  v_rows int[] := array[]::int[];
  v_cols int[] := array[]::int[];
  v_placement record;
  v_coord_key text;
  v_letter text;
  v_row int;
  v_col int;
  v_center int;
  v_has_center boolean := false;
  v_min_row int;
  v_max_row int;
  v_min_col int;
  v_max_col int;
  v_distinct_rows int;
  v_distinct_cols int;
  v_orientation text := null;
  v_line_count int;
  v_connected boolean := false;
  v_turn_points int := 0;
  v_words jsonb := '[]'::jsonb;
  v_remaining_rack text[];
  v_idx int;
  v_need int;
  v_bag_len int;
  v_draw_count int;
  v_drawn text[];
  v_next_turn_user_id uuid;
  v_occurred_at timestamptz := timezone('utc', now());
  v_word text;
  v_word_points int;
  v_s int;
  v_e int;
begin
  if p_game_id is null or p_actor_user_id is null or p_request_id is null then
    raise exception 'game_id, actor_user_id, and request_id are required' using errcode = '22023';
  end if;

  if p_placements is null or jsonb_typeof(p_placements) <> 'array' then
    raise exception 'placements must be a JSON array' using errcode = '22023';
  end if;

  select we.payload
  into v_existing_payload
  from public.word_master_events we
  where we.game_id = p_game_id
    and we.event_type = 'turn_played'
    and we.payload ->> 'request_id' = p_request_id::text
  order by we.id desc
  limit 1;

  if v_existing_payload is not null then
    return v_existing_payload || jsonb_build_object('idempotent', true);
  end if;

  select game.*
  into v_game
  from public.word_master_games game
  where game.id = p_game_id
  for update;

  if not found then
    raise exception 'game not found' using errcode = 'P0002';
  end if;

  select we.payload
  into v_existing_payload
  from public.word_master_events we
  where we.game_id = p_game_id
    and we.event_type = 'turn_played'
    and we.payload ->> 'request_id' = p_request_id::text
  order by we.id desc
  limit 1;

  if v_existing_payload is not null then
    return v_existing_payload || jsonb_build_object('idempotent', true);
  end if;

  if v_game.status <> 'active' then
    raise exception 'game is not active' using errcode = '23514';
  end if;

  select gp.*
  into v_player
  from public.word_master_players gp
  where gp.game_id = p_game_id
    and gp.user_id = p_actor_user_id
  for update;

  if not found then
    raise exception 'actor is not a game player' using errcode = '23514';
  end if;

  if v_game.current_turn_user_id is null then
    select gp.user_id
    into v_game.current_turn_user_id
    from public.word_master_players gp
    where gp.game_id = p_game_id
    order by gp.player_order
    limit 1;

    update public.word_master_games
    set current_turn_user_id = v_game.current_turn_user_id
    where id = p_game_id;
  end if;

  if v_game.current_turn_user_id <> p_actor_user_id then
    raise exception 'not your turn' using errcode = '23514';
  end if;

  select count(*)
  into v_existing_tile_count
  from public.word_master_board_tiles bt
  where bt.game_id = p_game_id;

  v_center := (v_game.board_size + 1) / 2;

  -- Parse + validate placements, and insert into board (transactional).
  for v_placement in
    select row, col, upper(left(trim(letter), 1)) as letter
    from jsonb_to_recordset(p_placements) as x(row int, col int, letter text)
  loop
    v_row := v_placement.row;
    v_col := v_placement.col;
    v_letter := v_placement.letter;

    if v_row is null or v_col is null or trim(coalesce(v_letter, '')) = '' then
      raise exception 'each placement requires row, col, and letter' using errcode = '22023';
    end if;

    if v_row < 1 or v_row > v_game.board_size or v_col < 1 or v_col > v_game.board_size then
      raise exception 'placement out of bounds' using errcode = '23514';
    end if;

    if v_letter !~ '^[A-Z]$' then
      raise exception 'letter must be A-Z' using errcode = '22023';
    end if;

    v_coord_key := v_row::text || ',' || v_col::text;
    if v_coord_key = any(v_seen_coords) then
      raise exception 'duplicate placement coordinate' using errcode = '23514';
    end if;

    v_seen_coords := array_append(v_seen_coords, v_coord_key);
    v_letters := array_append(v_letters, v_letter);
    v_rows := array_append(v_rows, v_row);
    v_cols := array_append(v_cols, v_col);

    if v_row = v_center and v_col = v_center then
      v_has_center := true;
    end if;

    insert into public.word_master_board_tiles (
      game_id,
      family_id,
      row,
      col,
      letter,
      points,
      placed_by,
      placed_at_turn
    ) values (
      p_game_id,
      v_game.family_id,
      v_row,
      v_col,
      v_letter,
      app.word_master_letter_points_v1(v_letter),
      p_actor_user_id,
      v_game.turn_number
    );
  end loop;

  if coalesce(array_length(v_letters, 1), 0) = 0 then
    raise exception 'at least one placement is required' using errcode = '22023';
  end if;

  if array_length(v_letters, 1) > v_game.rack_size then
    raise exception 'too many tiles placed' using errcode = '23514';
  end if;

  -- Validate rack letters are available.
  v_remaining_rack := coalesce(v_player.rack, array[]::text[]);
  foreach v_letter in array v_letters
  loop
    v_idx := array_position(v_remaining_rack, v_letter);
    if v_idx is null then
      raise exception 'tile % is not in your rack', v_letter using errcode = '23514';
    end if;

    if coalesce(array_length(v_remaining_rack, 1), 0) = 1 then
      v_remaining_rack := array[]::text[];
    elsif v_idx = 1 then
      v_remaining_rack := v_remaining_rack[2:array_length(v_remaining_rack, 1)];
    elsif v_idx = array_length(v_remaining_rack, 1) then
      v_remaining_rack := v_remaining_rack[1:(v_idx - 1)];
    else
      v_remaining_rack :=
        v_remaining_rack[1:(v_idx - 1)] || v_remaining_rack[(v_idx + 1):array_length(v_remaining_rack, 1)];
    end if;
  end loop;

  v_min_row := (select min(x) from unnest(v_rows) as t(x));
  v_max_row := (select max(x) from unnest(v_rows) as t(x));
  v_min_col := (select min(x) from unnest(v_cols) as t(x));
  v_max_col := (select max(x) from unnest(v_cols) as t(x));

  select count(distinct x)
  into v_distinct_rows
  from unnest(v_rows) as t(x);

  select count(distinct x)
  into v_distinct_cols
  from unnest(v_cols) as t(x);

  if array_length(v_letters, 1) > 1 then
    if v_distinct_rows = 1 then
      v_orientation := 'horizontal';
      select count(*)
      into v_line_count
      from public.word_master_board_tiles bt
      where bt.game_id = p_game_id
        and bt.row = v_min_row
        and bt.col between v_min_col and v_max_col;

      if v_line_count <> (v_max_col - v_min_col + 1) then
        raise exception 'tiles must form one contiguous word (no gaps)' using errcode = '23514';
      end if;
    elsif v_distinct_cols = 1 then
      v_orientation := 'vertical';
      select count(*)
      into v_line_count
      from public.word_master_board_tiles bt
      where bt.game_id = p_game_id
        and bt.col = v_min_col
        and bt.row between v_min_row and v_max_row;

      if v_line_count <> (v_max_row - v_min_row + 1) then
        raise exception 'tiles must form one contiguous word (no gaps)' using errcode = '23514';
      end if;
    else
      raise exception 'tiles must be in the same row or column' using errcode = '23514';
    end if;
  end if;

  if v_existing_tile_count = 0 and not v_has_center then
    raise exception 'first move must cover the center tile' using errcode = '23514';
  end if;

  if v_existing_tile_count > 0 then
    select exists (
      select 1
      from public.word_master_board_tiles newt
      where newt.game_id = p_game_id
        and newt.placed_at_turn = v_game.turn_number
        and exists (
          select 1
          from public.word_master_board_tiles oldt
          where oldt.game_id = p_game_id
            and oldt.placed_at_turn < v_game.turn_number
            and (
              (oldt.row = newt.row and oldt.col = newt.col - 1)
              or (oldt.row = newt.row and oldt.col = newt.col + 1)
              or (oldt.col = newt.col and oldt.row = newt.row - 1)
              or (oldt.col = newt.col and oldt.row = newt.row + 1)
            )
        )
    )
    into v_connected;

    if not v_connected then
      raise exception 'move must connect to an existing tile' using errcode = '23514';
    end if;
  end if;

  -- Extract/score: main word(s) only (no multipliers; single-tile may score both directions).
  if array_length(v_letters, 1) = 1 then
    v_row := v_rows[1];
    v_col := v_cols[1];

    -- Horizontal word (if any)
    v_s := v_col;
    v_e := v_col;
    while exists (select 1 from public.word_master_board_tiles bt where bt.game_id = p_game_id and bt.row = v_row and bt.col = v_s - 1) loop
      v_s := v_s - 1;
    end loop;
    while exists (select 1 from public.word_master_board_tiles bt where bt.game_id = p_game_id and bt.row = v_row and bt.col = v_e + 1) loop
      v_e := v_e + 1;
    end loop;
    if (v_e - v_s + 1) > 1 then
      select string_agg(bt.letter, '' order by bt.col), sum(bt.points)
      into v_word, v_word_points
      from public.word_master_board_tiles bt
      where bt.game_id = p_game_id
        and bt.row = v_row
        and bt.col between v_s and v_e;

      v_turn_points := v_turn_points + coalesce(v_word_points, 0);
      v_words := v_words || jsonb_build_array(
        jsonb_build_object('direction', 'horizontal', 'word', v_word, 'points', coalesce(v_word_points, 0))
      );
    end if;

    -- Vertical word (if any)
    v_s := v_row;
    v_e := v_row;
    while exists (select 1 from public.word_master_board_tiles bt where bt.game_id = p_game_id and bt.col = v_col and bt.row = v_s - 1) loop
      v_s := v_s - 1;
    end loop;
    while exists (select 1 from public.word_master_board_tiles bt where bt.game_id = p_game_id and bt.col = v_col and bt.row = v_e + 1) loop
      v_e := v_e + 1;
    end loop;
    if (v_e - v_s + 1) > 1 then
      select string_agg(bt.letter, '' order by bt.row), sum(bt.points)
      into v_word, v_word_points
      from public.word_master_board_tiles bt
      where bt.game_id = p_game_id
        and bt.col = v_col
        and bt.row between v_s and v_e;

      v_turn_points := v_turn_points + coalesce(v_word_points, 0);
      v_words := v_words || jsonb_build_array(
        jsonb_build_object('direction', 'vertical', 'word', v_word, 'points', coalesce(v_word_points, 0))
      );
    end if;
  else
    if v_orientation = 'horizontal' then
      v_s := v_min_col;
      v_e := v_max_col;
      while exists (select 1 from public.word_master_board_tiles bt where bt.game_id = p_game_id and bt.row = v_min_row and bt.col = v_s - 1) loop
        v_s := v_s - 1;
      end loop;
      while exists (select 1 from public.word_master_board_tiles bt where bt.game_id = p_game_id and bt.row = v_min_row and bt.col = v_e + 1) loop
        v_e := v_e + 1;
      end loop;

      select string_agg(bt.letter, '' order by bt.col), sum(bt.points)
      into v_word, v_word_points
      from public.word_master_board_tiles bt
      where bt.game_id = p_game_id
        and bt.row = v_min_row
        and bt.col between v_s and v_e;

      v_turn_points := v_turn_points + coalesce(v_word_points, 0);
      v_words := v_words || jsonb_build_array(
        jsonb_build_object('direction', 'horizontal', 'word', v_word, 'points', coalesce(v_word_points, 0))
      );
    elsif v_orientation = 'vertical' then
      v_s := v_min_row;
      v_e := v_max_row;
      while exists (select 1 from public.word_master_board_tiles bt where bt.game_id = p_game_id and bt.col = v_min_col and bt.row = v_s - 1) loop
        v_s := v_s - 1;
      end loop;
      while exists (select 1 from public.word_master_board_tiles bt where bt.game_id = p_game_id and bt.col = v_min_col and bt.row = v_e + 1) loop
        v_e := v_e + 1;
      end loop;

      select string_agg(bt.letter, '' order by bt.row), sum(bt.points)
      into v_word, v_word_points
      from public.word_master_board_tiles bt
      where bt.game_id = p_game_id
        and bt.col = v_min_col
        and bt.row between v_s and v_e;

      v_turn_points := v_turn_points + coalesce(v_word_points, 0);
      v_words := v_words || jsonb_build_array(
        jsonb_build_object('direction', 'vertical', 'word', v_word, 'points', coalesce(v_word_points, 0))
      );
    end if;
  end if;

  if v_turn_points <= 0 then
    raise exception 'move must form at least one word' using errcode = '23514';
  end if;

  if array_length(v_letters, 1) = v_game.rack_size then
    v_turn_points := v_turn_points + 50;
  end if;

  update public.word_master_players
  set score = score + v_turn_points
  where id = v_player.id;

  -- Refill rack from bag.
  v_need := v_game.rack_size - coalesce(array_length(v_remaining_rack, 1), 0);
  if v_need < 0 then
    v_need := 0;
  end if;

  v_bag_len := coalesce(array_length(v_game.bag, 1), 0);
  v_draw_count := least(v_need, v_bag_len);

  if v_draw_count > 0 then
    v_drawn := v_game.bag[1:v_draw_count];
    v_remaining_rack := coalesce(v_remaining_rack, array[]::text[]) || coalesce(v_drawn, array[]::text[]);

    if v_draw_count = v_bag_len then
      v_game.bag := array[]::text[];
    else
      v_game.bag := v_game.bag[(v_draw_count + 1):v_bag_len];
    end if;
  end if;

  update public.word_master_players
  set rack = coalesce(v_remaining_rack, array[]::text[])
  where id = v_player.id;

  -- Advance turn.
  select gp.user_id
  into v_next_turn_user_id
  from public.word_master_players gp
  where gp.game_id = p_game_id
    and gp.player_order > v_player.player_order
  order by gp.player_order
  limit 1;

  if v_next_turn_user_id is null then
    select gp.user_id
    into v_next_turn_user_id
    from public.word_master_players gp
    where gp.game_id = p_game_id
    order by gp.player_order
    limit 1;
  end if;

  update public.word_master_games
  set
    current_turn_user_id = v_next_turn_user_id,
    bag = coalesce(v_game.bag, array[]::text[]),
    consecutive_passes = 0,
    turn_number = turn_number + 1
  where id = p_game_id;

  v_existing_payload := jsonb_build_object(
    'request_id', p_request_id::text,
    'placements', p_placements,
    'words', v_words,
    'points', v_turn_points,
    'next_turn_user_id', v_next_turn_user_id,
    'occurred_at', v_occurred_at
  );

  insert into public.word_master_events (game_id, family_id, event_type, payload, created_by)
  values (p_game_id, v_game.family_id, 'turn_played', v_existing_payload, p_actor_user_id);

  return v_existing_payload || jsonb_build_object('idempotent', false);
end;
$$;

alter function app.word_master_play_turn_v1(uuid, uuid, uuid, jsonb) owner to postgres;
revoke all on function app.word_master_play_turn_v1(uuid, uuid, uuid, jsonb) from public;
grant execute on function app.word_master_play_turn_v1(uuid, uuid, uuid, jsonb) to service_role;

create or replace function public.word_master_play_turn_v1(
  p_game_id uuid,
  p_actor_user_id uuid,
  p_request_id uuid,
  p_placements jsonb
)
returns jsonb
language sql
security invoker
set search_path = app, public
as $$
  select app.word_master_play_turn_v1(
    p_game_id := p_game_id,
    p_actor_user_id := p_actor_user_id,
    p_request_id := p_request_id,
    p_placements := p_placements
  );
$$;

alter function public.word_master_play_turn_v1(uuid, uuid, uuid, jsonb) owner to postgres;
revoke all on function public.word_master_play_turn_v1(uuid, uuid, uuid, jsonb) from public;
grant execute on function public.word_master_play_turn_v1(uuid, uuid, uuid, jsonb) to service_role;

notify pgrst, 'reload schema';

