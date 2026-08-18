begin;

create or replace function public.calculate_mania_score(answer_values jsonb)
returns integer
language plpgsql
immutable
set search_path = public
as $$
declare
  result integer := 0;
begin
  if answer_values is null
    or jsonb_typeof(answer_values) <> 'array'
    or jsonb_array_length(answer_values) <> 5 then
    return 0;
  end if;

  if answer_values ->> 0 = '3' then result := result + 1; end if;
  if answer_values ->> 1 = '3' then result := result + 1; end if;
  if answer_values ->> 2 = '2' then result := result + 1; end if;
  if answer_values ->> 3 = '4' then result := result + 1; end if;
  if answer_values ->> 4 = '2' then result := result + 1; end if;

  return result;
end;
$$;

revoke all on function public.calculate_mania_score(jsonb) from public;

create or replace function public.evaluate_mania_test(answer_values integer[])
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select public.calculate_mania_score(to_jsonb(answer_values));
$$;

revoke all on function public.evaluate_mania_test(integer[]) from public;
grant execute on function public.evaluate_mania_test(integer[]) to anon, authenticated;

create or replace function public.set_profile_mania_passed_from_answers()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  signup_answers jsonb;
begin
  select raw_user_meta_data -> 'mania_answers'
  into signup_answers
  from auth.users
  where id = new.id;

  new.mania_passed := public.calculate_mania_score(signup_answers) >= 3;
  return new;
end;
$$;

drop trigger if exists validate_mania_passed_on_profile_insert on public.profiles;
create trigger validate_mania_passed_on_profile_insert
before insert on public.profiles
for each row
execute function public.set_profile_mania_passed_from_answers();

do $$
begin
  if public.calculate_mania_score('[3, 3, 2, 4, 2]'::jsonb) <> 5 then
    raise exception 'Mania test validation failed for the all-correct answers.';
  end if;

  if public.calculate_mania_score('[3, 3, 2, 1, 1]'::jsonb) <> 3 then
    raise exception 'Mania test validation failed for the passing boundary.';
  end if;

  if public.calculate_mania_score('[3, 3, 1, 1, 1]'::jsonb) <> 2 then
    raise exception 'Mania test validation failed for the failing boundary.';
  end if;
end
$$;

commit;
