-- Compatibility objects required by the currently deployed web client.
-- These keep the production API stable while source callers are converged on
-- the canonical underlying tables.

create table if not exists public.user_recommendation_interests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  topic text not null,
  weight numeric not null default 1 check (weight >= -3 and weight <= 3),
  source text not null default 'user',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, topic)
);

alter table public.user_recommendation_interests enable row level security;

drop policy if exists user_recommendation_interests_select_own on public.user_recommendation_interests;
create policy user_recommendation_interests_select_own on public.user_recommendation_interests
for select to authenticated using (auth.uid() = user_id);

drop policy if exists user_recommendation_interests_insert_own on public.user_recommendation_interests;
create policy user_recommendation_interests_insert_own on public.user_recommendation_interests
for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists user_recommendation_interests_update_own on public.user_recommendation_interests;
create policy user_recommendation_interests_update_own on public.user_recommendation_interests
for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists user_recommendation_interests_delete_own on public.user_recommendation_interests;
create policy user_recommendation_interests_delete_own on public.user_recommendation_interests
for delete to authenticated using (auth.uid() = user_id);

grant select, insert, update, delete on public.user_recommendation_interests to authenticated;
revoke all on public.user_recommendation_interests from anon;

drop trigger if exists set_user_recommendation_interests_updated_at on public.user_recommendation_interests;
create trigger set_user_recommendation_interests_updated_at
before update on public.user_recommendation_interests
for each row execute function public.update_updated_at_column();

-- Older video clients use post_bookmarks; bookmarks is the canonical table.
create or replace view public.post_bookmarks
with (security_invoker = true)
as
select id, user_id, post_id, created_at
from public.bookmarks;
grant select, insert, update, delete on public.post_bookmarks to authenticated;
revoke all on public.post_bookmarks from anon;

-- PostgREST computed field for legacy product searches selecting `images`.
create or replace function public.images(p public.products)
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    array_agg(pi.url order by pi.position nulls last, pi.created_at, pi.id),
    '{}'::text[]
  )
  from public.product_images pi
  where pi.product_id = p.id;
$$;
revoke all on function public.images(public.products) from public;
grant execute on function public.images(public.products) to authenticated, anon;

-- Current location-history client selects left_at; historical rows may leave it null.
alter table public.place_visits
add column if not exists left_at timestamptz;

notify pgrst, 'reload schema';
