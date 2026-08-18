-- REVIEW BEFORE RUNNING. This migration has not been applied to Supabase.
begin;

alter table public.profiles
  add column if not exists nickname_changed_at timestamptz;

comment on column public.profiles.nickname_changed_at is
  'The last time the member changed an already-created profile nickname.';

-- A table-level UPDATE grant would override a column-level revoke, so replace
-- it with grants for every ordinary profile column except protected fields.
revoke update on table public.profiles from authenticated;
revoke update (nickname_changed_at) on table public.profiles
from authenticated;

do $$
declare
  allowed_columns text;
begin
  select string_agg(format('%I', column_name), ', ' order by ordinal_position)
  into allowed_columns
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'profiles'
    and column_name not in ('mania_passed', 'nickname_changed_at')
    and is_generated = 'NEVER';

  if allowed_columns is null then
    raise exception 'Could not find profile columns eligible for UPDATE.';
  end if;

  execute format(
    'grant update (%s) on table public.profiles to authenticated',
    allowed_columns
  );
end
$$;

create or replace function public.enforce_nickname_change_interval()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.nickname is not distinct from old.nickname then
    return new;
  end if;

  new.nickname := btrim(new.nickname);

  if new.nickname = '' then
    raise exception 'Nickname cannot be empty.';
  end if;

  if old.nickname_changed_at is not null
     and old.nickname_changed_at > now() - interval '30 days' then
    raise exception using
      errcode = 'P0001',
      message = format(
        'Nickname can be changed again on %s.',
        to_char(old.nickname_changed_at + interval '30 days', 'YYYY-MM-DD')
      );
  end if;

  new.nickname_changed_at := now();
  return new;
end;
$$;

drop trigger if exists enforce_nickname_change_interval_trigger
  on public.profiles;
create trigger enforce_nickname_change_interval_trigger
before update of nickname on public.profiles
for each row execute function public.enforce_nickname_change_interval();

commit;
