begin;

-- A table-level UPDATE grant also permits updating mania_passed, so remove the
-- broad grant before restoring column-level access to every other column.
revoke update on table public.profiles from authenticated;
revoke update (mania_passed) on table public.profiles from authenticated;

do $$
declare
  allowed_columns text;
begin
  select string_agg(format('%I', column_name), ', ' order by ordinal_position)
  into allowed_columns
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'profiles'
    and column_name <> 'mania_passed'
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

do $$
begin
  if has_column_privilege(
    'authenticated',
    'public.profiles',
    'mania_passed',
    'UPDATE'
  ) then
    raise exception 'Privilege validation failed: authenticated can still update mania_passed.';
  end if;
end
$$;

commit;
