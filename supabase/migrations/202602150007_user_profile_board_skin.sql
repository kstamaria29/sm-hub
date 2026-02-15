alter table public.user_profiles
  add column if not exists board_skin_id text not null default 'family';

do $$
begin
  alter table public.user_profiles
    add constraint user_profiles_board_skin_id_check
    check (board_skin_id in ('family', 'tropical', 'space'));
exception
  when duplicate_object then null;
end;
$$;
