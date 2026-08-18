-- REVIEW BEFORE RUNNING. This migration has not been applied to Supabase.
-- It reuses public.review_images and the existing review-images bucket.
begin;

alter table public.review_images enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'review_images'
      and policyname = 'Anyone can read review images'
  ) then
    create policy "Anyone can read review images"
      on public.review_images for select
      to anon, authenticated
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'review_images'
      and policyname = 'Users can insert images for own reviews'
  ) then
    create policy "Users can insert images for own reviews"
      on public.review_images for insert
      to authenticated
      with check (
        exists (
          select 1 from public.reviews
          where reviews.id = review_images.review_id
            and reviews.user_id = auth.uid()
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'review_images'
      and policyname = 'Users can delete images from own reviews'
  ) then
    create policy "Users can delete images from own reviews"
      on public.review_images for delete
      to authenticated
      using (
        exists (
          select 1 from public.reviews
          where reviews.id = review_images.review_id
            and reviews.user_id = auth.uid()
        )
      );
  end if;
end
$$;

grant select on table public.review_images to anon, authenticated;
grant insert, delete on table public.review_images to authenticated;

create or replace function public.enforce_review_image_limit()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (
    select count(*)
    from public.review_images
    where review_id = new.review_id
      and (tg_op = 'INSERT' or id <> new.id)
  ) >= 3 then
    raise exception 'A review can have at most 3 images.';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_review_image_limit_trigger
  on public.review_images;
create trigger enforce_review_image_limit_trigger
before insert or update of review_id on public.review_images
for each row execute function public.enforce_review_image_limit();

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Authenticated users upload own review images'
  ) then
    create policy "Authenticated users upload own review images"
      on storage.objects for insert
      to authenticated
      with check (
        bucket_id = 'review-images'
        and (storage.foldername(name))[1] = 'reviews'
        and (storage.foldername(name))[2] = auth.uid()::text
        and exists (
          select 1 from public.reviews
          where reviews.id::text = (storage.foldername(name))[3]
            and reviews.user_id = auth.uid()
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Users delete own review image objects'
  ) then
    create policy "Users delete own review image objects"
      on storage.objects for delete
      to authenticated
      using (
        bucket_id = 'review-images'
        and (storage.foldername(name))[1] = 'reviews'
        and (storage.foldername(name))[2] = auth.uid()::text
      );
  end if;
end
$$;

commit;

-- Verify the existing review_images -> reviews FK separately. This migration
-- deliberately does not change it. ON DELETE CASCADE removes DB rows only;
-- it never removes files from Storage.
--
-- select tc.constraint_name, rc.delete_rule
-- from information_schema.table_constraints tc
-- join information_schema.referential_constraints rc
--   on rc.constraint_schema = tc.constraint_schema
--  and rc.constraint_name = tc.constraint_name
-- where tc.table_schema = 'public'
--   and tc.table_name = 'review_images'
--   and tc.constraint_type = 'FOREIGN KEY';
