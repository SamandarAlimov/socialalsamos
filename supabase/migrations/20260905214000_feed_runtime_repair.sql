-- Feed runtime repair for production environments that missed older
-- analytics/ads migrations. Keep this idempotent: the site must render posts
-- even while Supabase schema rollout catches up.

alter table public.posts
  add column if not exists views_count integer not null default 0;

create table if not exists public.post_views (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  viewed_at timestamp with time zone not null default now(),
  unique (post_id, user_id)
);

alter table public.post_views enable row level security;

drop policy if exists "Anyone can view post views" on public.post_views;
drop policy if exists "Authenticated users can record views" on public.post_views;
drop policy if exists "post_views_select_public_counts" on public.post_views;
drop policy if exists "post_views_insert_own" on public.post_views;
drop policy if exists "post_views_update_own_timestamp" on public.post_views;

create policy "post_views_select_public_counts"
  on public.post_views
  for select
  to anon, authenticated
  using (true);

create policy "post_views_insert_own"
  on public.post_views
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "post_views_update_own_timestamp"
  on public.post_views
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select on public.post_views to anon, authenticated;
grant insert, update on public.post_views to authenticated;

create or replace function public.sync_post_views_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.posts
       set views_count = coalesce(views_count, 0) + 1
     where id = new.post_id;
    return new;
  elsif tg_op = 'DELETE' then
    update public.posts
       set views_count = greatest(coalesce(views_count, 0) - 1, 0)
     where id = old.post_id;
    return old;
  end if;

  return null;
end;
$$;

drop trigger if exists sync_post_views_count_trigger on public.post_views;
create trigger sync_post_views_count_trigger
after insert or delete on public.post_views
for each row execute function public.sync_post_views_count();

create or replace function public.increment_post_views(post_id_param uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return;
  end if;

  insert into public.post_views (post_id, user_id, viewed_at)
  values (post_id_param, auth.uid(), now())
  on conflict (post_id, user_id)
  do update set viewed_at = greatest(public.post_views.viewed_at, excluded.viewed_at);
end;
$$;

revoke all on function public.increment_post_views(uuid) from public, anon;
grant execute on function public.increment_post_views(uuid) to authenticated, service_role;

do $$
begin
  begin
    alter publication supabase_realtime add table public.post_views;
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;
end;
$$;

-- Compatibility stubs for deployments where the newer ads delivery migrations
-- have not reached PostgREST yet. Do not replace existing richer v4/v5
-- implementations; only fill missing signatures so the frontend does not get
-- RPC 404s.
do $$
begin
  if not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'get_eligible_ads_v2'
      and pg_get_function_identity_arguments(p.oid) = 'p_placement text, p_limit integer, p_session_id text, p_context jsonb'
  ) then
    execute $fn$
      create function public.get_eligible_ads_v2(
        p_placement text,
        p_limit integer default 6,
        p_session_id text default null,
        p_context jsonb default '{}'::jsonb
      )
      returns setof public.ads
      language sql
      stable
      security definer
      set search_path = public
      as $body$
        select a.*
          from public.ads a
         where a.status = 'active'
           and a.user_id is distinct from auth.uid()
           and (a.start_date is null or a.start_date <= now())
           and (a.end_date is null or a.end_date >= now())
           and coalesce(a.spent, 0) < coalesce(nullif(a.budget, 0), 1e18)
           and (
             (p_placement = 'story' and a.ad_type in ('story', 'both'))
             or (p_placement <> 'story' and a.ad_type in ('feed', 'both'))
           )
         order by coalesce(a.bid_amount, 0) desc, a.created_at desc
         limit greatest(0, least(coalesce(p_limit, 6), 20));
      $body$;
    $fn$;
  end if;

  if not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'get_eligible_ads_v4'
      and pg_get_function_identity_arguments(p.oid) = 'p_placement text, p_limit integer, p_session_id text, p_context jsonb'
  ) then
    execute $fn$
      create function public.get_eligible_ads_v4(
        p_placement text,
        p_limit integer default 6,
        p_session_id text default null,
        p_context jsonb default '{}'::jsonb
      )
      returns setof public.ads
      language sql
      stable
      security definer
      set search_path = public
      as $body$
        select *
          from public.get_eligible_ads_v2(p_placement, p_limit, p_session_id, p_context);
      $body$;
    $fn$;
  end if;

  if not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'get_eligible_ads_v5'
      and pg_get_function_identity_arguments(p.oid) = 'p_placement text, p_limit integer, p_session_id text, p_context jsonb'
  ) then
    execute $fn$
      create function public.get_eligible_ads_v5(
        p_placement text,
        p_limit integer default 6,
        p_session_id text default null,
        p_context jsonb default '{}'::jsonb
      )
      returns setof public.ads
      language sql
      stable
      security definer
      set search_path = public
      as $body$
        select *
          from public.get_eligible_ads_v4(p_placement, p_limit, p_session_id, p_context);
      $body$;
    $fn$;
  end if;
end;
$$;

grant execute on function public.get_eligible_ads_v2(text, integer, text, jsonb) to authenticated;
grant execute on function public.get_eligible_ads_v4(text, integer, text, jsonb) to authenticated;
grant execute on function public.get_eligible_ads_v5(text, integer, text, jsonb) to authenticated;

notify pgrst, 'reload schema';
