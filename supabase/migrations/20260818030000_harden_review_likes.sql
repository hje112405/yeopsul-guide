-- REVIEW ONLY: do not run until the existing review_likes constraints and
-- policies have been checked in the Supabase SQL Editor.
begin;

alter table public.review_likes enable row level security;

-- Ensure one like per user and review. This block does nothing when an
-- equivalent UNIQUE constraint or composite primary key already exists.
do $$
begin
  if not exists (
    select 1
    from pg_constraint constraint_info
    where constraint_info.conrelid = 'public.review_likes'::regclass
      and constraint_info.contype in ('p', 'u')
      and (
        select array_agg(attribute_info.attname order by attribute_info.attname)
        from unnest(constraint_info.conkey) as key_info(attribute_number)
        join pg_attribute attribute_info
          on attribute_info.attrelid = constraint_info.conrelid
         and attribute_info.attnum = key_info.attribute_number
      ) = array['review_id', 'user_id']::name[]
  ) then
    alter table public.review_likes
      add constraint review_likes_user_id_review_id_key
      unique (user_id, review_id);
  end if;
end
$$;

-- These named policies are added only when policies with the same names do
-- not already exist. Review existing policies before running this migration.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'review_likes'
      and policyname = 'Anyone can read review likes'
  ) then
    create policy "Anyone can read review likes"
      on public.review_likes for select
      to anon, authenticated
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'review_likes'
      and policyname = 'Users can insert own review likes'
  ) then
    create policy "Users can insert own review likes"
      on public.review_likes for insert
      to authenticated
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'review_likes'
      and policyname = 'Users can delete own review likes'
  ) then
    create policy "Users can delete own review likes"
      on public.review_likes for delete
      to authenticated
      using (auth.uid() = user_id);
  end if;
end
$$;

grant select on table public.review_likes to anon, authenticated;
grant insert, delete on table public.review_likes to authenticated;

commit;

-- This migration deliberately does not alter the review_id foreign key.
-- Check its delete action with this read-only query before running:
--
-- select constraint_name, delete_rule
-- from information_schema.referential_constraints
-- where constraint_schema = 'public'
--   and constraint_name in (
--     select constraint_name
--     from information_schema.constraint_column_usage
--     where table_schema = 'public'
--       and table_name = 'reviews'
--       and column_name = 'id'
--   );
