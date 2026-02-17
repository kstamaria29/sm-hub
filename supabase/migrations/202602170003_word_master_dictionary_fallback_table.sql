-- v1.10: Word Master dictionary fallback (word list table) for environments without ispell files.

create table if not exists public.word_master_dictionary_words (
  word text primary key check (word ~ '^[a-z]+$' and length(word) between 2 and 32),
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_word_master_dictionary_words_prefix
on public.word_master_dictionary_words (word text_pattern_ops);

alter table public.word_master_dictionary_words enable row level security;

create policy word_master_dictionary_words_select_authenticated
on public.word_master_dictionary_words
for select
using (auth.role() in ('authenticated', 'service_role'));

create policy word_master_dictionary_words_write_service_role
on public.word_master_dictionary_words
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

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
  v_table_oid oid;
  v_table_count bigint;
begin
  if v_word = '' then
    return false;
  end if;

  -- Word Master tiles are currently A-Z only.
  if v_word !~ '^[a-z]+$' then
    return false;
  end if;

  -- Prefer ispell dictionaries if available.
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
    v_lexemes := ts_lexize(v_dict, v_word);
    return v_lexemes is not null and array_length(v_lexemes, 1) > 0;
  end if;

  -- Fallback: word list table (must be seeded once).
  select c.oid
  into v_table_oid
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'word_master_dictionary_words'
    and c.relkind = 'r'
  limit 1;

  if v_table_oid is null then
    raise exception 'Word Master dictionary is not configured' using errcode = '23514';
  end if;

  select count(*) into v_table_count from public.word_master_dictionary_words;
  if coalesce(v_table_count, 0) = 0 then
    raise exception 'Word Master dictionary is not configured' using errcode = '23514';
  end if;

  return exists (
    select 1
    from public.word_master_dictionary_words w
    where w.word = v_word
  );
end;
$$;

alter function app.word_master_is_valid_word_v1(text) owner to postgres;
revoke all on function app.word_master_is_valid_word_v1(text) from public;
grant execute on function app.word_master_is_valid_word_v1(text) to service_role;

notify pgrst, 'reload schema';

