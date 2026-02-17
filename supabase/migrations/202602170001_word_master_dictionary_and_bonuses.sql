-- v1.10: Word Master dictionary validation + bonus square helpers.

do $$
begin
  -- Provision an ispell dictionary for offline word validation when possible.
  -- Some Postgres installs ship `english.dict/english.affix`, others `en_us.dict/en_us.affix`.
  if not exists (
    select 1
    from pg_catalog.pg_ts_dict d
    join pg_catalog.pg_namespace n on n.oid = d.dictnamespace
    where n.nspname = 'public'
      and d.dictname = 'word_master_english_ispell'
  ) then
    begin
      create text search dictionary public.word_master_english_ispell (
        template = ispell,
        dictfile = english,
        afffile = english,
        stopwords = english
      );
    exception when others then
      begin
        create text search dictionary public.word_master_english_ispell (
          template = ispell,
          dictfile = en_us,
          afffile = en_us,
          stopwords = english
        );
      exception when others then
        raise notice 'Word Master: ispell dictionary files not available; strict word validation will error until configured.';
      end;
    end;
  end if;
end;
$$;

create or replace function app.word_master_is_valid_word_v1(p_word text)
returns boolean
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  v_word text := lower(trim(coalesce(p_word, '')));
  v_dict regdictionary;
  v_dict_oid oid;
  v_lexemes text[];
begin
  if v_word = '' then
    return false;
  end if;

  -- Word Master tiles are currently A-Z only.
  if v_word !~ '^[a-z]+$' then
    return false;
  end if;

  select d.oid
  into v_dict_oid
  from pg_catalog.pg_ts_dict d
  join pg_catalog.pg_namespace n on n.oid = d.dictnamespace
  where n.nspname = 'public'
    and d.dictname = 'word_master_english_ispell'
  limit 1;

  if v_dict_oid is null then
    select d.oid
    into v_dict_oid
    from pg_catalog.pg_ts_dict d
    join pg_catalog.pg_namespace n on n.oid = d.dictnamespace
    where n.nspname = 'pg_catalog'
      and d.dictname = 'english_ispell'
    limit 1;
  end if;

  if v_dict_oid is not null then
    v_dict := v_dict_oid::regdictionary;
  end if;

  if v_dict is null then
    raise exception 'Word Master dictionary is not configured' using errcode = '23514';
  end if;

  v_lexemes := ts_lexize(v_dict, v_word);
  return v_lexemes is not null and array_length(v_lexemes, 1) > 0;
end;
$$;

alter function app.word_master_is_valid_word_v1(text) owner to postgres;
revoke all on function app.word_master_is_valid_word_v1(text) from public;
grant execute on function app.word_master_is_valid_word_v1(text) to service_role;

-- Board bonuses (11x11) inspired by Scrabble-like layouts.
create or replace function app.word_master_square_bonus_v1(
  p_board_size int,
  p_row int,
  p_col int
)
returns table (
  letter_multiplier int,
  word_multiplier int,
  label text
)
language sql
immutable
security definer
set search_path = public, app
as $$
  with norm as (
    select
      p_board_size as board_size,
      least(p_row, p_board_size + 1 - p_row) as r,
      least(p_col, p_board_size + 1 - p_col) as c
  )
  select
    case
      when board_size = 11 and (
        (r = 2 and c = 6)
        or (r = 6 and c = 2)
        or (r = 3 and c = 5)
        or (r = 5 and c = 3)
      ) then 3
      when board_size = 11 and (
        (r = 1 and c = 4)
        or (r = 4 and c = 1)
        or (r = 2 and c = 3)
        or (r = 3 and c = 2)
        or (r = 2 and c = 5)
        or (r = 5 and c = 2)
        or (r = 4 and c = 6)
        or (r = 6 and c = 4)
      ) then 2
      else 1
    end as letter_multiplier,
    case
      when board_size = 11 and (
        (r = 1 and c = 1)
        or (r = 1 and c = 6)
        or (r = 6 and c = 1)
      ) then 3
      when board_size = 11 and (r = c and r between 2 and 6) then 2
      else 1
    end as word_multiplier,
    case
      when board_size = 11 and (
        (r = 1 and c = 1)
        or (r = 1 and c = 6)
        or (r = 6 and c = 1)
      ) then 'TW'
      when board_size = 11 and (r = c and r between 2 and 6) then 'DW'
      when board_size = 11 and (
        (r = 2 and c = 6)
        or (r = 6 and c = 2)
        or (r = 3 and c = 5)
        or (r = 5 and c = 3)
      ) then 'TL'
      when board_size = 11 and (
        (r = 1 and c = 4)
        or (r = 4 and c = 1)
        or (r = 2 and c = 3)
        or (r = 3 and c = 2)
        or (r = 2 and c = 5)
        or (r = 5 and c = 2)
        or (r = 4 and c = 6)
        or (r = 6 and c = 4)
      ) then 'DL'
      else null
    end as label
  from norm;
$$;

alter function app.word_master_square_bonus_v1(int, int, int) owner to postgres;
revoke all on function app.word_master_square_bonus_v1(int, int, int) from public;
grant execute on function app.word_master_square_bonus_v1(int, int, int) to service_role;

notify pgrst, 'reload schema';
