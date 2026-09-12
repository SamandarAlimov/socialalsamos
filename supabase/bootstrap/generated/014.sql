-- GENERATED FILE: deterministic fresh Alsamos Supabase bootstrap
-- Sources: SamandarAlimov/alsamos-superapp + SamandarAlimov/socialalsamos
-- Test fixture migrations are intentionally excluded.
-- Do not edit this generated file directly.

-- ============================================================================
-- SOURCE B-web: 20260831120000_mini_apps_platform_v2.sql
-- SHA256 cbc2237f4ec980dfbe981d097ac8a39eec615ce5926d7864308da4b57569fed5
-- ============================================================================
-- Mini Apps Platform 2.0 — Faza 0 (asos) + Faza 1 (feed/ranking)
--
-- Muammolar va yechim:
--  1. `is_approved` ishlatilmagan  -> `status` + RLS: faqat 'approved' ilovalar ommaviy.
--  2. Soxta rating/users_count    -> mini_app_events / reviews / installs + stats cache.
--  3. Klientda filtr va sort      -> mini_apps_feed() RPC (server-side ranking + pagination).
--  4. Publisher/tashkilot yo'q    -> publishers + publisher_members + publisher_domains.
--  5. islom.uz ustuvorligi yo'q   -> is_pinned + pin_priority (DB konfiguratsiyasi).
--  6. Kategoriya xardkod          -> mini_app_categories jadvali (uz/ru/en).

-- =====================================================================
-- 1. PUBLISHERLAR
-- =====================================================================

create table if not exists public.publishers (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  handle text not null,
  display_name text not null,
  type text not null default 'individual'
    check (type in ('individual','company','government','non_profit')),
  verification text not null default 'unverified'
    check (verification in ('unverified','email_verified','domain_verified','official')),
  logo_url text,
  website text,
  support_email text,
  country_code text,
  legal_name text,
  tax_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists publishers_handle_key on public.publishers (lower(handle));
create index if not exists publishers_owner_idx on public.publishers (owner_id);

create table if not exists public.publisher_members (
  publisher_id uuid not null references public.publishers(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'developer'
    check (role in ('owner','admin','developer','analyst')),
  created_at timestamptz not null default now(),
  primary key (publisher_id, user_id)
);

create table if not exists public.publisher_domains (
  id uuid primary key default gen_random_uuid(),
  publisher_id uuid not null references public.publishers(id) on delete cascade,
  domain text not null,
  verify_token text not null default encode(gen_random_bytes(16), 'hex'),
  verified_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists publisher_domains_domain_key on public.publisher_domains (lower(domain));

-- =====================================================================
-- 2. KATEGORIYALAR (yagona manba — klientlarda xardkod yo'q)
-- =====================================================================

create table if not exists public.mini_app_categories (
  id text primary key,
  sort_order int not null default 100,
  icon text,
  is_active boolean not null default true,
  labels jsonb not null default '{}'::jsonb
);

insert into public.mini_app_categories (id, sort_order, icon, labels) values
  ('religion',     10, 'moon-star',   '{"uz":"Diniy","ru":"Религия","en":"Religion"}'),
  ('education',    20, 'graduation-cap', '{"uz":"Ta''lim","ru":"Образование","en":"Education"}'),
  ('tools',        30, 'wrench',      '{"uz":"Asboblar","ru":"Инструменты","en":"Tools"}'),
  ('social',       40, 'users',       '{"uz":"Ijtimoiy","ru":"Социальные","en":"Social"}'),
  ('business',     50, 'briefcase',   '{"uz":"Biznes","ru":"Бизнес","en":"Business"}'),
  ('finance',      60, 'wallet',      '{"uz":"Moliya","ru":"Финансы","en":"Finance"}'),
  ('lifestyle',    70, 'heart',       '{"uz":"Turmush tarzi","ru":"Стиль жизни","en":"Lifestyle"}'),
  ('entertainment',80, 'gamepad-2',   '{"uz":"Ko''ngil ochar","ru":"Развлечения","en":"Entertainment"}'),
  ('news',         90, 'newspaper',   '{"uz":"Yangiliklar","ru":"Новости","en":"News"}'),
  ('portfolio',   100, 'code',        '{"uz":"Portfolio","ru":"Портфолио","en":"Portfolio"}'),
  ('other',       999, 'sparkles',    '{"uz":"Boshqa","ru":"Другое","en":"Other"}')
on conflict (id) do update
  set sort_order = excluded.sort_order,
      icon = excluded.icon,
      labels = excluded.labels;

-- =====================================================================
-- 3. MINI_APPS KENGAYTIRISH
-- =====================================================================

alter table public.mini_apps
  add column if not exists publisher_id uuid references public.publishers(id) on delete set null,
  add column if not exists handle text,
  add column if not exists app_type text not null default 'link',
  add column if not exists status text not null default 'pending_review',
  add column if not exists display_mode text not null default 'iframe',
  add column if not exists short_description text,
  add column if not exists locales text[] not null default array['uz']::text[],
  add column if not exists countries text[],
  add column if not exists age_rating int not null default 0,
  add column if not exists price_model text not null default 'free',
  add column if not exists permissions jsonb not null default '[]'::jsonb,
  add column if not exists screenshots jsonb not null default '[]'::jsonb,
  add column if not exists privacy_url text,
  add column if not exists terms_url text,
  add column if not exists support_url text,
  add column if not exists bot_id uuid,
  add column if not exists deep_link text,
  add column if not exists is_pinned boolean not null default false,
  add column if not exists pin_priority int,
  add column if not exists rejected_reason text,
  add column if not exists published_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'mini_apps_app_type_check') then
    alter table public.mini_apps add constraint mini_apps_app_type_check
      check (app_type in ('link','webapp','bot','native'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'mini_apps_status_check') then
    alter table public.mini_apps add constraint mini_apps_status_check
      check (status in ('draft','pending_review','approved','rejected','suspended','archived'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'mini_apps_display_mode_check') then
    alter table public.mini_apps add constraint mini_apps_display_mode_check
      check (display_mode in ('iframe','embed','proxy','external','webview'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'mini_apps_price_model_check') then
    alter table public.mini_apps add constraint mini_apps_price_model_check
      check (price_model in ('free','freemium','paid'));
  end if;
end $$;

-- Mavjud ma'lumotlarni yangi modelga ko'chirish
update public.mini_apps set status = 'approved' where is_approved is true and status <> 'approved';
update public.mini_apps set published_at = coalesce(published_at, created_at) where status = 'approved';
update public.mini_apps
   set category = 'other'
 where category is null
    or category not in (select id from public.mini_app_categories);

-- Handle: nomdan avtomatik (bo'sh bo'lsa)
update public.mini_apps m
   set handle = sub.candidate
  from (
    select id,
           left(regexp_replace(lower(coalesce(nullif(name,''), 'app')), '[^a-z0-9_]', '', 'g'), 24)
             || '_' || left(replace(id::text, '-', ''), 6) as candidate
      from public.mini_apps
     where handle is null
  ) sub
 where m.id = sub.id and m.handle is null;

create unique index if not exists mini_apps_handle_key on public.mini_apps (lower(handle));
create index if not exists mini_apps_status_type_idx on public.mini_apps (status, app_type);
create index if not exists mini_apps_publisher_idx on public.mini_apps (publisher_id);
create index if not exists mini_apps_category_idx on public.mini_apps (category);
create index if not exists mini_apps_search_idx on public.mini_apps
  using gin (to_tsvector('simple', coalesce(name,'') || ' ' || coalesce(description,'')));

-- islom.uz — doimiy 1-o'rin (kodda emas, DB konfiguratsiyasida)
update public.mini_apps
   set is_pinned = true,
       pin_priority = 1,
       category = 'religion'
 where url ilike '%islom.uz%';

-- =====================================================================
-- 4. VERSIYALAR, METRIKALAR, SHIKOYATLAR
-- =====================================================================

create table if not exists public.mini_app_versions (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references public.mini_apps(id) on delete cascade,
  version int not null,
  manifest jsonb not null,
  submitted_by uuid references auth.users(id) on delete set null,
  submitted_at timestamptz not null default now(),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  status text not null default 'pending_review'
    check (status in ('draft','pending_review','approved','rejected','suspended','archived')),
  review_notes text,
  unique (app_id, version)
);

create table if not exists public.mini_app_events (
  id bigserial primary key,
  app_id uuid not null references public.mini_apps(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  event text not null
    check (event in ('open','close','error','install','uninstall','share','payment')),
  session_id uuid,
  duration_ms int,
  error_code text,
  platform text not null default 'web' check (platform in ('web','android','ios','desktop')),
  created_at timestamptz not null default now()
);

create index if not exists mini_app_events_app_idx on public.mini_app_events (app_id, created_at desc);
create index if not exists mini_app_events_user_idx on public.mini_app_events (user_id, created_at desc);

create table if not exists public.mini_app_reviews (
  app_id uuid not null references public.mini_apps(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  rating int not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (app_id, user_id)
);

create table if not exists public.mini_app_installs (
  app_id uuid not null references public.mini_apps(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  pinned boolean not null default false,
  open_count int not null default 0,
  last_opened_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (app_id, user_id)
);

create table if not exists public.mini_app_reports (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references public.mini_apps(id) on delete cascade,
  reporter_id uuid references auth.users(id) on delete set null,
  reason text not null,
  details text,
  status text not null default 'open' check (status in ('open','reviewing','resolved','rejected')),
  created_at timestamptz not null default now()
);

create table if not exists public.mini_app_stats_cache (
  app_id uuid primary key references public.mini_apps(id) on delete cascade,
  opens_7d int not null default 0,
  opens_30d int not null default 0,
  users_30d int not null default 0,
  errors_30d int not null default 0,
  avg_rating numeric(3,2) not null default 0,
  rating_count int not null default 0,
  installs int not null default 0,
  refreshed_at timestamptz not null default now()
);

-- =====================================================================
-- 5. YORDAMCHI FUNKSIYALAR
-- =====================================================================

create or replace function public.mini_app_is_service_role()
returns boolean
language sql
stable
as $$
  select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), '') = 'service_role'
      or coalesce(current_setting('role', true), '') = 'service_role';
$$;

create or replace function public.mini_app_can_manage(p_app_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.mini_apps a
      left join public.publisher_members pm
        on pm.publisher_id = a.publisher_id and pm.user_id = auth.uid()
      left join public.publishers p
        on p.id = a.publisher_id
     where a.id = p_app_id
       and (a.user_id = auth.uid() or pm.user_id is not null or p.owner_id = auth.uid())
  );
$$;

-- Foydalanuvchi status/pin/verification maydonlarini o'zgartira olmaydi.
create or replace function public.mini_apps_guard_writes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.mini_app_is_service_role() then
    new.updated_at := now();
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.status := 'pending_review';
    new.is_pinned := false;
    new.pin_priority := null;
    new.published_at := null;
  else
    new.status := case
      when old.url is distinct from new.url then 'pending_review'
      else old.status
    end;
    new.is_pinned := old.is_pinned;
    new.pin_priority := old.pin_priority;
    new.published_at := old.published_at;
    new.rating := old.rating;
    new.users_count := old.users_count;
  end if;

  new.updated_at := now();
  return new;
end $$;

drop trigger if exists mini_apps_guard_writes_trg on public.mini_apps;
create trigger mini_apps_guard_writes_trg
  before insert or update on public.mini_apps
  for each row execute function public.mini_apps_guard_writes();

-- Reyting agregatsiyasi (Bayes o'rtachasi bilan)
create or replace function public.mini_app_sync_rating(p_app_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_avg numeric := 0;
  v_count int := 0;
  v_installs int := 0;
begin
  select coalesce(avg(rating), 0), count(*) into v_avg, v_count
    from public.mini_app_reviews where app_id = p_app_id;
  select count(*) into v_installs
    from public.mini_app_installs where app_id = p_app_id;

  update public.mini_apps
     set rating = round(
           (v_count::numeric / (v_count + 20)) * v_avg
           + (20::numeric / (v_count + 20)) * 3.8, 2),
         users_count = v_installs
   where id = p_app_id;

  insert into public.mini_app_stats_cache (app_id, avg_rating, rating_count, installs)
  values (p_app_id, round(v_avg, 2), v_count, v_installs)
  on conflict (app_id) do update
    set avg_rating = excluded.avg_rating,
        rating_count = excluded.rating_count,
        installs = excluded.installs,
        refreshed_at = now();
end $$;

create or replace function public.mini_app_reviews_sync_trg()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.mini_app_sync_rating(coalesce(new.app_id, old.app_id));
  return coalesce(new, old);
end $$;

drop trigger if exists mini_app_reviews_sync on public.mini_app_reviews;
create trigger mini_app_reviews_sync
  after insert or update or delete on public.mini_app_reviews
  for each row execute function public.mini_app_reviews_sync_trg();

drop trigger if exists mini_app_installs_sync on public.mini_app_installs;
create trigger mini_app_installs_sync
  after insert or delete on public.mini_app_installs
  for each row execute function public.mini_app_reviews_sync_trg();

-- Statistika keshini yangilash (scheduled job yoki admin chaqiradi)
create or replace function public.refresh_mini_app_stats()
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.mini_app_stats_cache as c
    (app_id, opens_7d, opens_30d, users_30d, errors_30d, avg_rating, rating_count, installs, refreshed_at)
  select a.id,
         count(*) filter (where e.event = 'open' and e.created_at > now() - interval '7 days'),
         count(*) filter (where e.event = 'open' and e.created_at > now() - interval '30 days'),
         count(distinct e.user_id) filter (where e.event = 'open' and e.created_at > now() - interval '30 days'),
         count(*) filter (where e.event = 'error' and e.created_at > now() - interval '30 days'),
         coalesce((select round(avg(r.rating), 2) from public.mini_app_reviews r where r.app_id = a.id), 0),
         coalesce((select count(*) from public.mini_app_reviews r where r.app_id = a.id), 0),
         coalesce((select count(*) from public.mini_app_installs i where i.app_id = a.id), 0),
         now()
    from public.mini_apps a
    left join public.mini_app_events e on e.app_id = a.id
   group by a.id
  on conflict (app_id) do update
    set opens_7d = excluded.opens_7d,
        opens_30d = excluded.opens_30d,
        users_30d = excluded.users_30d,
        errors_30d = excluded.errors_30d,
        avg_rating = excluded.avg_rating,
        rating_count = excluded.rating_count,
        installs = excluded.installs,
        refreshed_at = now();
$$;

-- =====================================================================
-- 6. FEED RPC — ranking, filtr va sahifalash faqat serverda
-- =====================================================================

create or replace function public.mini_apps_feed(
  p_section text default 'all',
  p_category text default null,
  p_app_type text default null,
  p_sort text default 'recommended',
  p_verified_only boolean default false,
  p_price_model text default null,
  p_locale text default null,
  p_query text default null,
  p_limit int default 30,
  p_offset int default 0
)
returns table (
  app_id uuid,
  handle text,
  name text,
  short_description text,
  description text,
  url text,
  icon_url text,
  category text,
  app_type text,
  display_mode text,
  price_model text,
  permissions jsonb,
  screenshots jsonb,
  privacy_url text,
  support_url text,
  deep_link text,
  is_pinned boolean,
  owner_id uuid,
  publisher_id uuid,
  publisher_handle text,
  publisher_name text,
  publisher_type text,
  publisher_verification text,
  author_username text,
  author_display_name text,
  author_avatar_url text,
  rating numeric,
  rating_count int,
  users_count int,
  opens_30d int,
  is_installed boolean,
  created_at timestamptz,
  updated_at timestamptz,
  score numeric,
  total_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select q.* from (
    select
      a.id as app_id,
      a.handle,
      a.name,
      a.short_description,
      a.description,
      a.url,
      a.icon_url,
      a.category,
      a.app_type,
      a.display_mode,
      a.price_model,
      a.permissions,
      a.screenshots,
      a.privacy_url,
      a.support_url,
      a.deep_link,
      a.is_pinned,
      a.user_id as owner_id,
      a.publisher_id,
      p.handle as publisher_handle,
      p.display_name as publisher_name,
      p.type as publisher_type,
      coalesce(p.verification, 'unverified') as publisher_verification,
      pr.username as author_username,
      pr.display_name as author_display_name,
      pr.avatar_url as author_avatar_url,
      coalesce(s.avg_rating, 0)::numeric as rating,
      coalesce(s.rating_count, 0) as rating_count,
      coalesce(s.installs, a.users_count, 0) as users_count,
      coalesce(s.opens_30d, 0) as opens_30d,
      (mi.user_id is not null) as is_installed,
      a.created_at,
      a.updated_at,
      (
        (case when a.is_pinned then 1000 - coalesce(a.pin_priority, 50) else 0 end)::numeric
        + (case coalesce(p.verification, 'unverified')
             when 'official' then 200
             when 'domain_verified' then 80
             else 0 end)::numeric
        + 60 * log((1 + coalesce(s.opens_30d, 0))::numeric)
        + 40 * log((1 + coalesce(s.users_30d, 0))::numeric)
        + 30 * (
            (coalesce(s.rating_count, 0)::numeric / (coalesce(s.rating_count, 0) + 20))
              * coalesce(s.avg_rating, 0)
            + (20::numeric / (coalesce(s.rating_count, 0) + 20)) * 3.8
          )
        - 50 * (coalesce(s.errors_30d, 0)::numeric / greatest(coalesce(s.opens_30d, 0), 1))
        - least(30, extract(epoch from (now() - coalesce(a.updated_at, a.created_at))) / 86400 / 12)::numeric
        + 15 * least(1, coalesce(mi.open_count, 0)::numeric / 10)
      ) as score,
      count(*) over () as total_count
    from public.mini_apps a
    left join public.publishers p on p.id = a.publisher_id
    left join public.profiles pr on pr.id = a.user_id
    left join public.mini_app_stats_cache s on s.app_id = a.id
    left join public.mini_app_installs mi on mi.app_id = a.id and mi.user_id = auth.uid()
    where a.status = 'approved'
      and (p_category is null or p_category in ('', 'all') or a.category = p_category)
      and (p_app_type is null or p_app_type in ('', 'all') or a.app_type = p_app_type)
      and (p_price_model is null or p_price_model = '' or a.price_model = p_price_model)
      and (p_verified_only is not true
           or coalesce(p.verification, 'unverified') in ('domain_verified', 'official'))
      and (p_locale is null or p_locale = '' or a.locales is null or p_locale = any(a.locales))
      and (
        p_query is null or btrim(p_query) = ''
        or a.name ilike '%' || btrim(p_query) || '%'
        or coalesce(a.handle, '') ilike '%' || btrim(p_query) || '%'
        or coalesce(a.short_description, '') ilike '%' || btrim(p_query) || '%'
        or coalesce(a.description, '') ilike '%' || btrim(p_query) || '%'
      )
      and (
        p_section is null or p_section in ('', 'all')
        or (p_section = 'pinned' and a.is_pinned)
        or (p_section = 'official' and coalesce(p.verification, 'unverified') = 'official')
        or (p_section = 'trending' and coalesce(s.opens_7d, 0) > 0)
        or (p_section = 'new' and a.created_at > now() - interval '30 days')
        or (p_section = 'portfolio' and a.app_type = 'link'
            and coalesce(p.verification, 'unverified') not in ('official', 'domain_verified'))
        or (p_section = 'installed' and mi.user_id is not null)
      )
  ) q
  order by
    case when p_sort = 'new' then extract(epoch from q.created_at) end desc nulls last,
    case when p_sort = 'rating' then q.rating end desc nulls last,
    case when p_sort = 'popular' then q.users_count end desc nulls last,
    case when p_sort = 'trending' then q.opens_30d end desc nulls last,
    q.score desc,
    q.created_at desc
  limit greatest(1, least(coalesce(p_limit, 30), 60))
  offset greatest(0, coalesce(p_offset, 0));
$$;

create or replace function public.mini_app_detail(p_handle_or_id text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select to_jsonb(f) from public.mini_apps_feed(
    p_section => 'all',
    p_limit => 1,
    p_query => null
  ) f
  where lower(f.handle) = lower(p_handle_or_id)
     or f.app_id::text = p_handle_or_id
  limit 1;
$$;

-- =====================================================================
-- 7. TELEMETRIYA VA REYTING RPC
-- =====================================================================

create or replace function public.mini_app_track_event(
  p_app_id uuid,
  p_event text,
  p_platform text default 'web',
  p_duration_ms int default null,
  p_error_code text default null,
  p_session_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.mini_apps where id = p_app_id and status = 'approved') then
    raise exception 'MINI_APP_NOT_AVAILABLE';
  end if;

  insert into public.mini_app_events (app_id, user_id, event, platform, duration_ms, error_code, session_id)
  values (p_app_id, auth.uid(), p_event, coalesce(p_platform, 'web'), p_duration_ms, p_error_code, p_session_id);

  if p_event = 'open' and auth.uid() is not null then
    insert into public.mini_app_installs (app_id, user_id, open_count, last_opened_at)
    values (p_app_id, auth.uid(), 1, now())
    on conflict (app_id, user_id) do update
      set open_count = public.mini_app_installs.open_count + 1,
          last_opened_at = now();
  end if;
end $$;

create or replace function public.mini_app_rate(
  p_app_id uuid,
  p_rating int,
  p_comment text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;
  if p_rating < 1 or p_rating > 5 then
    raise exception 'INVALID_RATING';
  end if;
  -- Faqat ilovani kamida bir marta ochgan foydalanuvchi ovoz beradi.
  if not exists (
    select 1 from public.mini_app_events
     where app_id = p_app_id and user_id = auth.uid() and event = 'open'
  ) then
    raise exception 'OPEN_REQUIRED_BEFORE_RATING';
  end if;

  insert into public.mini_app_reviews (app_id, user_id, rating, comment)
  values (p_app_id, auth.uid(), p_rating, p_comment)
  on conflict (app_id, user_id) do update
    set rating = excluded.rating,
        comment = excluded.comment,
        updated_at = now();
end $$;

create or replace function public.mini_app_set_install(
  p_app_id uuid,
  p_installed boolean,
  p_pinned boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if p_installed then
    insert into public.mini_app_installs (app_id, user_id, pinned)
    values (p_app_id, auth.uid(), coalesce(p_pinned, false))
    on conflict (app_id, user_id) do update set pinned = coalesce(p_pinned, false);
  else
    delete from public.mini_app_installs where app_id = p_app_id and user_id = auth.uid();
  end if;
end $$;

create or replace function public.mini_app_report(
  p_app_id uuid,
  p_reason text,
  p_details text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  insert into public.mini_app_reports (app_id, reporter_id, reason, details)
  values (p_app_id, auth.uid(), p_reason, p_details);

  -- 3 va undan ko'p ochiq shikoyat -> avtomatik to'xtatish
  if (select count(*) from public.mini_app_reports where app_id = p_app_id and status = 'open') >= 3 then
    update public.mini_apps set status = 'suspended' where id = p_app_id;
  end if;
end $$;

-- Moderatsiya (faqat service_role / admin panel)
create or replace function public.mini_app_set_status(
  p_app_id uuid,
  p_status text,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.mini_app_is_service_role() then
    raise exception 'FORBIDDEN';
  end if;

  update public.mini_apps
     set status = p_status,
         rejected_reason = case when p_status = 'rejected' then p_reason else null end,
         published_at = case when p_status = 'approved' then coalesce(published_at, now()) else published_at end,
         is_approved = (p_status = 'approved')
   where id = p_app_id;
end $$;

-- =====================================================================
-- 8. RLS
-- =====================================================================

alter table public.publishers enable row level security;
alter table public.publisher_members enable row level security;
alter table public.publisher_domains enable row level security;
alter table public.mini_app_categories enable row level security;
alter table public.mini_app_versions enable row level security;
alter table public.mini_app_events enable row level security;
alter table public.mini_app_reviews enable row level security;
alter table public.mini_app_installs enable row level security;
alter table public.mini_app_reports enable row level security;
alter table public.mini_app_stats_cache enable row level security;
alter table public.mini_apps enable row level security;

-- Eski (haddan tashqari ochiq) SELECT siyosatlarini olib tashlaymiz:
-- ular `is_approved` ni tekshirmagani uchun moderatsiyadan o'tmagan ilovalar ko'rinardi.
do $$
declare pol record;
begin
  for pol in
    select policyname from pg_policies
     where schemaname = 'public' and tablename = 'mini_apps' and cmd in ('SELECT', 'ALL')
  loop
    execute format('drop policy if exists %I on public.mini_apps', pol.policyname);
  end loop;
end $$;

create policy mini_apps_public_read on public.mini_apps
  for select using (
    status = 'approved'
    or user_id = auth.uid()
    or public.mini_app_can_manage(id)
  );

drop policy if exists publishers_read on public.publishers;
create policy publishers_read on public.publishers for select using (true);

drop policy if exists publishers_insert on public.publishers;
create policy publishers_insert on public.publishers
  for insert to authenticated with check (owner_id = auth.uid());

drop policy if exists publishers_update on public.publishers;
create policy publishers_update on public.publishers
  for update to authenticated using (
    owner_id = auth.uid()
    or exists (
      select 1 from public.publisher_members pm
       where pm.publisher_id = publishers.id and pm.user_id = auth.uid()
         and pm.role in ('owner', 'admin')
    )
  );

drop policy if exists publisher_members_read on public.publisher_members;
create policy publisher_members_read on public.publisher_members
  for select to authenticated using (
    user_id = auth.uid()
    or exists (select 1 from public.publishers p where p.id = publisher_id and p.owner_id = auth.uid())
  );

drop policy if exists publisher_domains_manage on public.publisher_domains;
create policy publisher_domains_manage on public.publisher_domains
  for all to authenticated using (
    exists (select 1 from public.publishers p where p.id = publisher_id and p.owner_id = auth.uid())
  ) with check (
    exists (select 1 from public.publishers p where p.id = publisher_id and p.owner_id = auth.uid())
  );

drop policy if exists mini_app_categories_read on public.mini_app_categories;
create policy mini_app_categories_read on public.mini_app_categories
  for select using (is_active);

drop policy if exists mini_app_versions_read on public.mini_app_versions;
create policy mini_app_versions_read on public.mini_app_versions
  for select to authenticated using (public.mini_app_can_manage(app_id));

drop policy if exists mini_app_versions_insert on public.mini_app_versions;
create policy mini_app_versions_insert on public.mini_app_versions
  for insert to authenticated with check (public.mini_app_can_manage(app_id));

-- Xom eventlarni faqat egasi ko'radi (ommaga faqat agregat ko'rsatiladi).
drop policy if exists mini_app_events_owner_read on public.mini_app_events;
create policy mini_app_events_owner_read on public.mini_app_events
  for select to authenticated using (user_id = auth.uid() or public.mini_app_can_manage(app_id));

drop policy if exists mini_app_reviews_read on public.mini_app_reviews;
create policy mini_app_reviews_read on public.mini_app_reviews for select using (true);

drop policy if exists mini_app_reviews_write on public.mini_app_reviews;
create policy mini_app_reviews_write on public.mini_app_reviews
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists mini_app_installs_own on public.mini_app_installs;
create policy mini_app_installs_own on public.mini_app_installs
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists mini_app_reports_insert on public.mini_app_reports;
create policy mini_app_reports_insert on public.mini_app_reports
  for insert to authenticated with check (reporter_id = auth.uid());

drop policy if exists mini_app_reports_read on public.mini_app_reports;
create policy mini_app_reports_read on public.mini_app_reports
  for select to authenticated using (reporter_id = auth.uid() or public.mini_app_can_manage(app_id));

drop policy if exists mini_app_stats_read on public.mini_app_stats_cache;
create policy mini_app_stats_read on public.mini_app_stats_cache for select using (true);

-- =====================================================================
-- 9. GRANTLAR
-- =====================================================================

grant execute on function public.mini_apps_feed(text, text, text, text, boolean, text, text, text, int, int) to anon, authenticated;
grant execute on function public.mini_app_detail(text) to anon, authenticated;
grant execute on function public.mini_app_track_event(uuid, text, text, int, text, uuid) to authenticated;
grant execute on function public.mini_app_rate(uuid, int, text) to authenticated;
grant execute on function public.mini_app_set_install(uuid, boolean, boolean) to authenticated;
grant execute on function public.mini_app_report(uuid, text, text) to authenticated;
grant execute on function public.refresh_mini_app_stats() to service_role;
grant execute on function public.mini_app_set_status(uuid, text, text) to service_role;

-- Boshlang'ich statistika
select public.refresh_mini_app_stats();


-- ============================================================================
-- SOURCE B-web: 20260831121500_ai_agent_platform.sql
-- SHA256 a4be0577e23b0b2ec5f04bdb0b28aa82e45fac69cf3d0fe09591064a82b82b1c
-- ============================================================================
-- Alsamos AI agent platformasi: konnektorlar (MCP pluginlar), qurilmalar,
-- kompyuter boshqaruv vazifalari, uzoq muddatli xotira va media navbati.
-- Barcha jadvallar RLS bilan yopilgan: har bir foydalanuvchi faqat o'z yozuvlarini ko'radi.

-- ============================================================ ai_connectors
create table if not exists public.ai_connectors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  kind text not null default 'mcp' check (kind in ('mcp', 'http')),
  base_url text not null,
  auth_type text check (auth_type in ('none', 'bearer', 'header')),
  auth_token text,
  description text,
  enabled boolean not null default true,
  last_ok_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

create index if not exists ai_connectors_user_idx on public.ai_connectors (user_id, enabled);

alter table public.ai_connectors enable row level security;

drop policy if exists "ai_connectors_select_own" on public.ai_connectors;
create policy "ai_connectors_select_own" on public.ai_connectors
  for select using (auth.uid() = user_id);

drop policy if exists "ai_connectors_insert_own" on public.ai_connectors;
create policy "ai_connectors_insert_own" on public.ai_connectors
  for insert with check (auth.uid() = user_id);

drop policy if exists "ai_connectors_update_own" on public.ai_connectors;
create policy "ai_connectors_update_own" on public.ai_connectors
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "ai_connectors_delete_own" on public.ai_connectors;
create policy "ai_connectors_delete_own" on public.ai_connectors
  for delete using (auth.uid() = user_id);

-- =============================================================== ai_devices
-- "Alsamos Bridge" lokal agenti ro'yxatdan o'tadigan qurilmalar.
create table if not exists public.ai_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  platform text,
  agent_version text,
  capabilities jsonb not null default '[]'::jsonb,
  paired_at timestamptz not null default now(),
  last_seen_at timestamptz,
  revoked boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists ai_devices_user_idx on public.ai_devices (user_id, revoked);

alter table public.ai_devices enable row level security;

drop policy if exists "ai_devices_all_own" on public.ai_devices;
create policy "ai_devices_all_own" on public.ai_devices
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ======================================================= ai_computer_tasks
-- Har bir vazifa foydalanuvchi qurilmada tasdiqlamaguncha bajarilmaydi.
create table if not exists public.ai_computer_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id uuid references public.ai_devices(id) on delete set null,
  conversation_id uuid,
  action text not null check (
    action in (
      'shell', 'read_file', 'write_file', 'list_dir',
      'open', 'screenshot', 'click', 'type_text', 'key'
    )
  ),
  payload jsonb not null default '{}'::jsonb,
  reason text not null,
  status text not null default 'pending_approval' check (
    status in ('pending_approval', 'approved', 'running', 'done', 'failed', 'rejected', 'expired')
  ),
  result jsonb,
  error text,
  approved_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  expires_at timestamptz not null default (now() + interval '15 minutes'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ai_computer_tasks_user_idx
  on public.ai_computer_tasks (user_id, status, created_at desc);
create index if not exists ai_computer_tasks_device_idx
  on public.ai_computer_tasks (device_id, status);

alter table public.ai_computer_tasks enable row level security;

drop policy if exists "ai_computer_tasks_select_own" on public.ai_computer_tasks;
create policy "ai_computer_tasks_select_own" on public.ai_computer_tasks
  for select using (auth.uid() = user_id);

-- Foydalanuvchi faqat tasdiqlash / rad etish uchun yozadi; yaratish server tomonida.
drop policy if exists "ai_computer_tasks_update_own" on public.ai_computer_tasks;
create policy "ai_computer_tasks_update_own" on public.ai_computer_tasks
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "ai_computer_tasks_delete_own" on public.ai_computer_tasks;
create policy "ai_computer_tasks_delete_own" on public.ai_computer_tasks
  for delete using (auth.uid() = user_id);

-- ============================================================== ai_memories
create table if not exists public.ai_memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  key text not null,
  value text not null,
  source text default 'assistant',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, key)
);

create index if not exists ai_memories_user_idx on public.ai_memories (user_id, updated_at desc);

alter table public.ai_memories enable row level security;

drop policy if exists "ai_memories_all_own" on public.ai_memories;
create policy "ai_memories_all_own" on public.ai_memories
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============================================================ ai_media_jobs
create table if not exists public.ai_media_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid,
  kind text not null check (kind in ('video', 'image', 'audio')),
  status text not null default 'queued' check (
    status in ('queued', 'running', 'done', 'failed', 'canceled')
  ),
  prompt text not null,
  params jsonb not null default '{}'::jsonb,
  output_url text,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ai_media_jobs_user_idx
  on public.ai_media_jobs (user_id, status, created_at desc);

alter table public.ai_media_jobs enable row level security;

drop policy if exists "ai_media_jobs_select_own" on public.ai_media_jobs;
create policy "ai_media_jobs_select_own" on public.ai_media_jobs
  for select using (auth.uid() = user_id);

drop policy if exists "ai_media_jobs_update_own" on public.ai_media_jobs;
create policy "ai_media_jobs_update_own" on public.ai_media_jobs
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "ai_media_jobs_delete_own" on public.ai_media_jobs;
create policy "ai_media_jobs_delete_own" on public.ai_media_jobs
  for delete using (auth.uid() = user_id);

-- ================================================================ triggers
create or replace function public.ai_touch_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists ai_connectors_touch on public.ai_connectors;
create trigger ai_connectors_touch before update on public.ai_connectors
  for each row execute function public.ai_touch_updated_at();

drop trigger if exists ai_computer_tasks_touch on public.ai_computer_tasks;
create trigger ai_computer_tasks_touch before update on public.ai_computer_tasks
  for each row execute function public.ai_touch_updated_at();

drop trigger if exists ai_memories_touch on public.ai_memories;
create trigger ai_memories_touch before update on public.ai_memories
  for each row execute function public.ai_touch_updated_at();

drop trigger if exists ai_media_jobs_touch on public.ai_media_jobs;
create trigger ai_media_jobs_touch before update on public.ai_media_jobs
  for each row execute function public.ai_touch_updated_at();


-- ============================================================================
-- SOURCE B-web: 20260831140000_profile_embed_fk_hardening.sql
-- SHA256 d88584768a4df162c5a09789da23bd02f01c08835e40f15bf6575c9d41297438
-- ============================================================================
-- Sahifalarda "yuklab bo'lmadi" xatolarining umumiy sababi.
--
-- Frontend PostgREST embed hintlaridan foydalanadi, masalan:
--   select=*,profile:profiles!posts_user_id_fkey(id,username,...)
-- Bu hint faqat shu NOM bilan FK constraint bazada mavjud bo'lsa ishlaydi.
-- Nom mos kelmasa PostgREST butun so'rovni PGRST200 bilan rad etadi, ya'ni
-- faqat avatar uchun kerak bo'lgan kosmetik join butun ro'yxatni (postlar,
-- videolar, izohlar, typing indikatorlari) yo'q qilib qo'yadi.
--
-- Xuddi shu bug chat oynasi uchun 20260831070000_messages_sender_embed_fk.sql
-- da tuzatilgan edi. Bu migratsiya qolgan barcha profil embedlarini bir xil
-- qoidaga keltiradi.
--
-- Migratsiya idempotent:
--   * jadval yoki ustun yo'q bo'lsa - o'tkazib yuboriladi;
--   * shu ustunda profiles ga FK mavjud, lekin nomi boshqa bo'lsa - RENAME
--     qilinadi (ikkinchi FK qo'shilsa PGRST201 "ambiguous relationship"
--     xatosi kelib chiqardi);
--   * FK butunlay yo'q bo'lsa - NOT VALID qilib qo'shiladi, shunda profili
--     o'chirilgan eski qatorlar DDL ni to'xtatib qo'ymaydi.

BEGIN;

DO $$
DECLARE
  spec record;
  src_oid oid;
  ref_oid oid;
  src_attnum smallint;
  existing_name text;
BEGIN
  FOR spec IN
    SELECT *
    FROM (VALUES
      ('public.posts', 'user_id', 'posts_user_id_fkey', 'public.profiles', 'id', 'CASCADE'),
      ('public.comments', 'user_id', 'comments_user_id_fkey', 'public.profiles', 'id', 'CASCADE'),
      ('public.post_likes', 'user_id', 'post_likes_user_id_fkey', 'public.profiles', 'id', 'CASCADE'),
      ('public.comment_likes', 'user_id', 'comment_likes_user_id_fkey', 'public.profiles', 'id', 'CASCADE'),
      ('public.typing_indicators', 'user_id', 'typing_indicators_user_id_fkey', 'public.profiles', 'id', 'CASCADE'),
      ('public.post_collaborators', 'user_id', 'post_collaborators_user_id_fkey', 'public.profiles', 'id', 'CASCADE'),
      ('public.sellers', 'user_id', 'sellers_user_id_fkey', 'public.profiles', 'id', 'CASCADE')
    ) AS t(src_table, src_column, fk_name, ref_table, ref_column, on_delete)
  LOOP
    src_oid := to_regclass(spec.src_table);
    ref_oid := to_regclass(spec.ref_table);

    IF src_oid IS NULL OR ref_oid IS NULL THEN
      CONTINUE;
    END IF;

    SELECT attnum INTO src_attnum
    FROM pg_attribute
    WHERE attrelid = src_oid
      AND attname = spec.src_column
      AND attnum > 0
      AND NOT attisdropped;

    IF src_attnum IS NULL THEN
      CONTINUE;
    END IF;

    SELECT conname INTO existing_name
    FROM pg_constraint
    WHERE conrelid = src_oid
      AND confrelid = ref_oid
      AND contype = 'f'
      AND conkey = ARRAY[src_attnum]::smallint[]
    ORDER BY conname
    LIMIT 1;

    IF existing_name IS NOT NULL THEN
      IF existing_name <> spec.fk_name THEN
        EXECUTE format(
          'ALTER TABLE %s RENAME CONSTRAINT %I TO %I',
          spec.src_table, existing_name, spec.fk_name
        );
      END IF;
    ELSE
      EXECUTE format(
        'ALTER TABLE %s ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES %s(%I) ON DELETE %s NOT VALID',
        spec.src_table, spec.fk_name, spec.src_column,
        spec.ref_table, spec.ref_column, spec.on_delete
      );
    END IF;

    existing_name := NULL;
    src_attnum := NULL;
  END LOOP;
END $$;

-- Embed va profil bo'yicha filtrlash uchun foydali indekslar.
DO $$
DECLARE
  spec record;
BEGIN
  FOR spec IN
    SELECT *
    FROM (VALUES
      ('public.posts', 'user_id', 'idx_posts_user_id'),
      ('public.comments', 'user_id', 'idx_comments_user_id'),
      ('public.post_likes', 'user_id', 'idx_post_likes_user_id')
    ) AS t(src_table, src_column, index_name)
  LOOP
    IF to_regclass(spec.src_table) IS NULL THEN
      CONTINUE;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_attribute
      WHERE attrelid = to_regclass(spec.src_table)
        AND attname = spec.src_column
        AND attnum > 0
        AND NOT attisdropped
    ) THEN
      CONTINUE;
    END IF;

    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON %s(%I)',
      spec.index_name, spec.src_table, spec.src_column
    );
  END LOOP;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';


-- ============================================================================
-- SOURCE B-web: 20260901010000_mini_apps_sdk_publishers_moderation.sql
-- SHA256 a4bf2e51c0d0b0a05d4b5b0487e7e395fb057d565b6d93441860719db06d1337
-- ============================================================================
-- Mini Apps Platform 2.0 — Faza 2/3
--
-- Bu migratsiya 20260831120000_mini_apps_platform_v2.sql ustiga qo'yiladi va
-- quyidagilarni qo'shadi:
--   1. publisher_domains uchun tekshiruv metadatasi (last_checked_at, check_error)
--   2. publisher onboarding RPC lari (yaratish, domen qo'shish, natijani yozish)
--   3. Mini App SDK sessiyalari (initData nonce, replay himoyasi)
--   4. To'lovlar jadvali va RPC lari
--   5. Moderatsiya navbati RPC si
--
-- Diqqat: jadval nomi `public.publishers` (v2 migratsiyasidagi kabi),
-- domen tokeni esa `publisher_domains.verify_token` ustunida saqlanadi.

-- =====================================================================
-- 1. PUBLISHER_DOMAINS — tekshiruv metadatasi
-- =====================================================================

alter table public.publisher_domains
  add column if not exists last_checked_at timestamptz,
  add column if not exists check_error text;

-- =====================================================================
-- 2. PUBLISHER ONBOARDING RPC
-- =====================================================================

create or replace function public.mini_app_publisher_create(
  p_handle text,
  p_name text,
  p_type text default 'individual'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_handle text := lower(btrim(coalesce(p_handle, '')));
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;
  if v_handle !~ '^[a-z0-9_]{3,32}$' then
    raise exception 'INVALID_HANDLE';
  end if;
  if length(btrim(coalesce(p_name, ''))) < 2 then
    raise exception 'INVALID_NAME';
  end if;
  if coalesce(p_type, 'individual') not in ('individual','company','government','non_profit') then
    raise exception 'INVALID_TYPE';
  end if;
  if exists (select 1 from public.publishers where lower(handle) = v_handle) then
    raise exception 'HANDLE_TAKEN';
  end if;

  insert into public.publishers (owner_id, handle, display_name, type)
  values (auth.uid(), v_handle, btrim(p_name), coalesce(p_type, 'individual'))
  returning id into v_id;

  insert into public.publisher_members (publisher_id, user_id, role)
  values (v_id, auth.uid(), 'owner')
  on conflict (publisher_id, user_id) do update set role = 'owner';

  return v_id;
end $$;

-- Domen qo'shadi va TXT yozuvi uchun tokenni qaytaradi.
create or replace function public.mini_app_publisher_add_domain(
  p_publisher_id uuid,
  p_domain text
)
returns table (domain_id uuid, verification_token text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_domain text := lower(btrim(coalesce(p_domain, '')));
  v_id uuid;
  v_token text;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;
  if v_domain !~ '^[a-z0-9.-]+\.[a-z]{2,}$' then
    raise exception 'INVALID_DOMAIN';
  end if;

  if not exists (
    select 1 from public.publishers p
     where p.id = p_publisher_id
       and (p.owner_id = auth.uid()
            or exists (select 1 from public.publisher_members m
                        where m.publisher_id = p.id and m.user_id = auth.uid()
                          and m.role in ('owner','admin')))
  ) then
    raise exception 'FORBIDDEN';
  end if;

  select d.id, d.verify_token into v_id, v_token
    from public.publisher_domains d
   where lower(d.domain) = v_domain;

  if v_id is null then
    insert into public.publisher_domains (publisher_id, domain)
    values (p_publisher_id, v_domain)
    returning id, verify_token into v_id, v_token;
  elsif not exists (
    select 1 from public.publisher_domains d
     where d.id = v_id and d.publisher_id = p_publisher_id
  ) then
    raise exception 'DOMAIN_TAKEN';
  end if;

  domain_id := v_id;
  verification_token := 'alsamos-verify=' || v_token;
  return next;
end $$;

-- DNS tekshiruvi natijasini yozadi (faqat edge funksiya / service_role).
create or replace function public.mini_app_publisher_domain_result(
  p_domain_id uuid,
  p_verified boolean,
  p_error text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_publisher uuid;
begin
  if not public.mini_app_is_service_role() then
    raise exception 'FORBIDDEN';
  end if;

  update public.publisher_domains
     set verified_at = case when p_verified then coalesce(verified_at, now()) else null end,
         last_checked_at = now(),
         check_error = case when p_verified then null else p_error end
   where id = p_domain_id
  returning publisher_id into v_publisher;

  if p_verified and v_publisher is not null then
    update public.publishers
       set verification = 'domain_verified',
           updated_at = now()
     where id = v_publisher
       and verification <> 'official';
  end if;
end $$;

-- =====================================================================
-- 3. SDK SESSIYALARI (initData nonce)
-- =====================================================================

create table if not exists public.mini_app_sdk_sessions (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references public.mini_apps(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  nonce text not null unique,
  platform text not null default 'web',
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz
);

create index if not exists mini_app_sdk_sessions_app_idx
  on public.mini_app_sdk_sessions (app_id, issued_at desc);

alter table public.mini_app_sdk_sessions enable row level security;

drop policy if exists mini_app_sdk_sessions_own on public.mini_app_sdk_sessions;
create policy mini_app_sdk_sessions_own on public.mini_app_sdk_sessions
  for select to authenticated using (user_id = auth.uid());

-- =====================================================================
-- 4. TO'LOVLAR
-- =====================================================================

create table if not exists public.mini_app_payments (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references public.mini_apps(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  amount numeric(14,2) not null check (amount > 0),
  currency text not null default 'UZS',
  status text not null default 'pending'
    check (status in ('draft','pending','paid','failed','refunded')),
  description text,
  provider text,
  external_id text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists mini_app_payments_user_idx
  on public.mini_app_payments (user_id, created_at desc);
create index if not exists mini_app_payments_app_idx
  on public.mini_app_payments (app_id, created_at desc);

alter table public.mini_app_payments enable row level security;

drop policy if exists mini_app_payments_read on public.mini_app_payments;
create policy mini_app_payments_read on public.mini_app_payments
  for select to authenticated using (
    user_id = auth.uid() or public.mini_app_can_manage(app_id)
  );

create or replace function public.mini_app_payment_create(
  p_app_id uuid,
  p_amount numeric,
  p_currency text default 'UZS',
  p_description text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'INVALID_AMOUNT';
  end if;
  if not exists (
    select 1 from public.mini_apps
     where id = p_app_id
       and status = 'approved'
       and permissions ? 'payments'
  ) then
    raise exception 'PAYMENTS_NOT_ALLOWED';
  end if;

  insert into public.mini_app_payments (app_id, user_id, amount, currency, description)
  values (p_app_id, auth.uid(), p_amount, coalesce(p_currency, 'UZS'), p_description)
  returning id into v_id;

  return v_id;
end $$;

create or replace function public.mini_app_payment_set_status(
  p_payment_id uuid,
  p_status text,
  p_provider text default null,
  p_external_id text default null,
  p_payload jsonb default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.mini_app_is_service_role() then
    raise exception 'FORBIDDEN';
  end if;
  if p_status not in ('draft','pending','paid','failed','refunded') then
    raise exception 'INVALID_STATUS';
  end if;

  update public.mini_app_payments
     set status = p_status,
         provider = coalesce(p_provider, provider),
         external_id = coalesce(p_external_id, external_id),
         payload = coalesce(p_payload, payload),
         updated_at = now()
   where id = p_payment_id;
end $$;

-- =====================================================================
-- 5. MODERATSIYA NAVBATI
-- =====================================================================

create or replace function public.mini_app_moderation_queue(
  p_status text default 'pending_review',
  p_limit int default 30,
  p_offset int default 0
)
returns table (
  app_id uuid,
  slug text,
  name text,
  icon_url text,
  app_type text,
  url text,
  status text,
  publisher_id uuid,
  publisher_name text,
  publisher_handle text,
  publisher_verification text,
  open_reports bigint,
  submitted_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.mini_app_is_service_role() then
    raise exception 'FORBIDDEN';
  end if;

  return query
  select
    a.id,
    a.handle,
    a.name,
    a.icon_url,
    a.app_type,
    a.url,
    a.status,
    a.publisher_id,
    p.display_name,
    p.handle,
    coalesce(p.verification, 'unverified'),
    (select count(*) from public.mini_app_reports r
      where r.app_id = a.id and r.status = 'open'),
    coalesce(a.updated_at, a.created_at)
  from public.mini_apps a
  left join public.publishers p on p.id = a.publisher_id
  where a.status = coalesce(p_status, 'pending_review')
  order by
    (select count(*) from public.mini_app_reports r
      where r.app_id = a.id and r.status = 'open') desc,
    coalesce(a.updated_at, a.created_at) asc
  limit greatest(1, least(coalesce(p_limit, 30), 100))
  offset greatest(0, coalesce(p_offset, 0));
end $$;

-- =====================================================================
-- 6. GRANTLAR
-- =====================================================================

grant execute on function public.mini_app_publisher_create(text, text, text) to authenticated;
grant execute on function public.mini_app_publisher_add_domain(uuid, text) to authenticated;
grant execute on function public.mini_app_publisher_domain_result(uuid, boolean, text) to service_role;
grant execute on function public.mini_app_payment_create(uuid, numeric, text, text) to authenticated;
grant execute on function public.mini_app_payment_set_status(uuid, text, text, text, jsonb) to service_role;
grant execute on function public.mini_app_moderation_queue(text, int, int) to service_role;

-- PostgREST schema keshini yangilash
notify pgrst, 'reload schema';


-- ============================================================================
-- SOURCE B-web: 20260901010000_product_media.sql
-- SHA256 941621f07e115b28a0711788772e01145e3200e00498cbe578bb7c7e96ad9bc4
-- ============================================================================
-- Marketplace media: product_images endi rasm ham, video ham saqlaydi.
-- Migratsiya additiv va idempotent: mavjud satrlar o'zgarmaydi.

-- 1. Ustunlar ------------------------------------------------------------
alter table public.product_images
  add column if not exists media_type text not null default 'image';

alter table public.product_images
  add column if not exists thumbnail_url text;

alter table public.product_images
  add column if not exists duration_seconds integer;

-- 2. Cheklovlar ----------------------------------------------------------
alter table public.product_images
  drop constraint if exists product_images_media_type_check;
alter table public.product_images
  add constraint product_images_media_type_check
  check (media_type in ('image', 'video'));

alter table public.product_images
  drop constraint if exists product_images_duration_check;
alter table public.product_images
  add constraint product_images_duration_check
  check (
    duration_seconds is null
    or (duration_seconds > 0 and duration_seconds <= 60)
  );

-- Video uchun poster majburiy: kartochka va galereya hech qachon bo'sh
-- ramka ko'rsatmasligi kerak.
alter table public.product_images
  drop constraint if exists product_images_video_thumbnail_check;
alter table public.product_images
  add constraint product_images_video_thumbnail_check
  check (
    media_type <> 'video'
    or (thumbnail_url is not null and length(btrim(thumbnail_url)) > 0)
  );

-- 3. Indeks --------------------------------------------------------------
-- Kartochka faqat muqovani (position = 0) o'qiydi.
create index if not exists product_images_cover_idx
  on public.product_images (product_id, position)
  where position = 0;

create index if not exists product_images_media_type_idx
  on public.product_images (product_id, media_type);

-- 4. Qoidalar triggeri ---------------------------------------------------
-- Frontend ham shu limitlarni tekshiradi, lekin baza oxirgi himoya bo'lishi
-- kerak: API orqali to'g'ridan-to'g'ri yozishga ham ta'sir qiladi.
create or replace function public.marketplace_check_product_media()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  media_count integer;
  video_count integer;
begin
  select
    count(*),
    count(*) filter (where media_type = 'video')
  into media_count, video_count
  from public.product_images
  where product_id = new.product_id
    and id <> new.id;

  if media_count + 1 > 10 then
    raise exception 'too_many_media';
  end if;

  if new.media_type = 'video' and video_count + 1 > 2 then
    raise exception 'too_many_videos';
  end if;

  -- Muqova doim rasm bo'ladi.
  if new.position = 0 and new.media_type <> 'image' then
    raise exception 'cover_must_be_image';
  end if;

  return new;
end;
$$;

drop trigger if exists marketplace_product_media_guard on public.product_images;
create trigger marketplace_product_media_guard
  before insert or update on public.product_images
  for each row execute function public.marketplace_check_product_media();

-- 5. Eski satrlarni normallashtirish -------------------------------------
update public.product_images
set media_type = 'image'
where media_type is null;

notify pgrst, 'reload schema';


-- ============================================================================
-- SOURCE B-web: 20260901020000_github_connector.sql
-- SHA256 cd8aab27bc45b8b5f19ba589e9cb37ac6fc33ee029adb4f7fa44d4613a2022eb
-- ============================================================================
-- GitHub konnektori: foydalanuvchining shaxsiy access token'i (PAT yoki OAuth bearer).
-- Token faqat egasiga ko'rinadi (RLS) va edge funksiyada service role orqali ishlatiladi.

create table if not exists public.ai_github_connections (
  user_id uuid primary key references auth.users (id) on delete cascade,
  token text not null,
  login text,
  scopes text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.ai_github_connections enable row level security;

drop policy if exists "github_conn_select_own" on public.ai_github_connections;
create policy "github_conn_select_own"
  on public.ai_github_connections for select
  using (auth.uid() = user_id);

drop policy if exists "github_conn_insert_own" on public.ai_github_connections;
create policy "github_conn_insert_own"
  on public.ai_github_connections for insert
  with check (auth.uid() = user_id);

drop policy if exists "github_conn_update_own" on public.ai_github_connections;
create policy "github_conn_update_own"
  on public.ai_github_connections for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "github_conn_delete_own" on public.ai_github_connections;
create policy "github_conn_delete_own"
  on public.ai_github_connections for delete
  using (auth.uid() = user_id);


-- ============================================================================
-- SOURCE B-web: 20260901020000_mini_apps_frame_guard.sql
-- SHA256 68ebe715992d3c61d8f70405b66cfad3bc444343681b0cfe6d0d31b1e1ea2e07
-- ============================================================================
-- Mini Apps — Frame Guard
--
-- Muammo: ba'zi saytlar (masalan islom.uz) `Content-Security-Policy: frame-ancestors 'self'`
-- yoki `X-Frame-Options: SAMEORIGIN` qo'yadi. Bunday sayt iframe'da HECH QACHON
-- ochilmaydi — brauzer so'rovni butunlay bloklaydi va bu hodisani JS ushlay olmaydi
-- (onError ishlamaydi, faqat timeout bo'ladi). Natijada foydalanuvchi 8 soniya
-- bo'sh oyna ko'radi.
--
-- Yechim: bunday saytlar bazada belgilanadi va ular uchun ochish rejasi darhol
-- proxy/tashqi oynaga o'tadi. Belgilash 3 yo'l bilan bo'ladi:
--   1. `mini-app-frame-check` edge funksiyasi sarlavhalarni tekshiradi (eng ishonchli)
--   2. Klientdagi takroriy timeout — `mini_app_report_frame_block`
--   3. Ma'lum hostlar ro'yxati (quyida seed)

alter table public.mini_apps
  add column if not exists frame_blocked boolean not null default false,
  add column if not exists frame_checked_at timestamptz,
  add column if not exists frame_check_error text;

create index if not exists mini_apps_frame_blocked_idx
  on public.mini_apps (frame_blocked) where frame_blocked;

-- =====================================================================
-- 1. Edge funksiya natijasi (sarlavhalar bo'yicha aniq tekshiruv)
-- =====================================================================

create or replace function public.mini_app_set_frame_result(
  p_app_id uuid,
  p_blocked boolean,
  p_error text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.mini_app_is_service_role() then
    raise exception 'FORBIDDEN';
  end if;

  update public.mini_apps
     set frame_blocked = coalesce(p_blocked, false),
         frame_checked_at = now(),
         frame_check_error = p_error,
         -- Bloklangan sayt uchun iframe rejimi ma'nosiz: proxy ham ko'pincha
         -- ishlamaydi (login/cookie), shuning uchun tashqi oynaga o'tkazamiz.
         display_mode = case
           when coalesce(p_blocked, false) and display_mode in ('iframe','embed','webview')
             then 'external'
           else display_mode
         end
   where id = p_app_id;
end $$;

-- =====================================================================
-- 2. Klientdan kelgan signal (timeout takrorlansa)
-- =====================================================================
--
-- Bitta foydalanuvchining bir marta muvaffaqiyatsizligi yetarli emas (tarmoq
-- sekin bo'lishi mumkin). Kamida 2 xil foydalanuvchidan 'blocked' signali
-- kelgandagina ilova rejimi o'zgaradi.

create or replace function public.mini_app_report_frame_block(p_app_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_distinct int;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  insert into public.mini_app_events (app_id, user_id, event, error_code, platform)
  values (p_app_id, auth.uid(), 'error', 'blocked', 'web');

  select count(distinct user_id) into v_distinct
    from public.mini_app_events
   where app_id = p_app_id
     and event = 'error'
     and error_code = 'blocked'
     and created_at > now() - interval '30 days';

  if v_distinct >= 2 then
    update public.mini_apps
       set frame_blocked = true,
           frame_checked_at = now(),
           frame_check_error = 'client_timeout',
           display_mode = case
             when display_mode in ('iframe','embed','webview') then 'external'
             else display_mode
           end
     where id = p_app_id
       and frame_blocked = false;
    return true;
  end if;

  return false;
end $$;

-- =====================================================================
-- 3. Feed RPC — frame_blocked ni ham qaytarishi kerak
-- =====================================================================
--
-- Klient ochish rejasini shu bayroq asosida tuzadi, shuning uchun feed
-- javobiga qo'shamiz. Funksiya imzosi o'zgarmaydi, faqat ustun qo'shiladi,
-- shuning uchun avval drop qilamiz.

drop function if exists public.mini_app_detail(text);
drop function if exists public.mini_apps_feed(text, text, text, text, boolean, text, text, text, int, int);

create function public.mini_apps_feed(
  p_section text default 'all',
  p_category text default null,
  p_app_type text default null,
  p_sort text default 'recommended',
  p_verified_only boolean default false,
  p_price_model text default null,
  p_locale text default null,
  p_query text default null,
  p_limit int default 30,
  p_offset int default 0
)
returns table (
  app_id uuid,
  handle text,
  name text,
  short_description text,
  description text,
  url text,
  icon_url text,
  category text,
  app_type text,
  display_mode text,
  frame_blocked boolean,
  price_model text,
  permissions jsonb,
  screenshots jsonb,
  privacy_url text,
  support_url text,
  deep_link text,
  is_pinned boolean,
  owner_id uuid,
  publisher_id uuid,
  publisher_handle text,
  publisher_name text,
  publisher_type text,
  publisher_verification text,
  author_username text,
  author_display_name text,
  author_avatar_url text,
  rating numeric,
  rating_count int,
  users_count int,
  opens_30d int,
  is_installed boolean,
  created_at timestamptz,
  updated_at timestamptz,
  score numeric,
  total_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select q.* from (
    select
      a.id as app_id,
      a.handle,
      a.name,
      a.short_description,
      a.description,
      a.url,
      a.icon_url,
      a.category,
      a.app_type,
      a.display_mode,
      coalesce(a.frame_blocked, false) as frame_blocked,
      a.price_model,
      a.permissions,
      a.screenshots,
      a.privacy_url,
      a.support_url,
      a.deep_link,
      a.is_pinned,
      a.user_id as owner_id,
      a.publisher_id,
      p.handle as publisher_handle,
      p.display_name as publisher_name,
      p.type as publisher_type,
      coalesce(p.verification, 'unverified') as publisher_verification,
      pr.username as author_username,
      pr.display_name as author_display_name,
      pr.avatar_url as author_avatar_url,
      coalesce(s.avg_rating, 0)::numeric as rating,
      coalesce(s.rating_count, 0) as rating_count,
      coalesce(s.installs, a.users_count, 0) as users_count,
      coalesce(s.opens_30d, 0) as opens_30d,
      (mi.user_id is not null) as is_installed,
      a.created_at,
      a.updated_at,
      (
        (case when a.is_pinned then 1000 - coalesce(a.pin_priority, 50) else 0 end)::numeric
        + (case coalesce(p.verification, 'unverified')
             when 'official' then 200
             when 'domain_verified' then 80
             else 0 end)::numeric
        + 60 * log((1 + coalesce(s.opens_30d, 0))::numeric)
        + 40 * log((1 + coalesce(s.users_30d, 0))::numeric)
        + 30 * (
            (coalesce(s.rating_count, 0)::numeric / (coalesce(s.rating_count, 0) + 20))
              * coalesce(s.avg_rating, 0)
            + (20::numeric / (coalesce(s.rating_count, 0) + 20)) * 3.8
          )
        - 50 * (coalesce(s.errors_30d, 0)::numeric / greatest(coalesce(s.opens_30d, 0), 1))
        - least(30, extract(epoch from (now() - coalesce(a.updated_at, a.created_at))) / 86400 / 12)::numeric
        + 15 * least(1, coalesce(mi.open_count, 0)::numeric / 10)
      ) as score,
      count(*) over () as total_count
    from public.mini_apps a
    left join public.publishers p on p.id = a.publisher_id
    left join public.profiles pr on pr.id = a.user_id
    left join public.mini_app_stats_cache s on s.app_id = a.id
    left join public.mini_app_installs mi on mi.app_id = a.id and mi.user_id = auth.uid()
    where a.status = 'approved'
      and (p_category is null or p_category in ('', 'all') or a.category = p_category)
      and (p_app_type is null or p_app_type in ('', 'all') or a.app_type = p_app_type)
      and (p_price_model is null or p_price_model = '' or a.price_model = p_price_model)
      and (p_verified_only is not true
           or coalesce(p.verification, 'unverified') in ('domain_verified', 'official'))
      and (p_locale is null or p_locale = '' or a.locales is null or p_locale = any(a.locales))
      and (
        p_query is null or btrim(p_query) = ''
        or a.name ilike '%' || btrim(p_query) || '%'
        or coalesce(a.handle, '') ilike '%' || btrim(p_query) || '%'
        or coalesce(a.short_description, '') ilike '%' || btrim(p_query) || '%'
        or coalesce(a.description, '') ilike '%' || btrim(p_query) || '%'
      )
      and (
        p_section is null or p_section in ('', 'all')
        or (p_section = 'pinned' and a.is_pinned)
        or (p_section = 'official' and coalesce(p.verification, 'unverified') = 'official')
        or (p_section = 'trending' and coalesce(s.opens_7d, 0) > 0)
        or (p_section = 'new' and a.created_at > now() - interval '30 days')
        or (p_section = 'portfolio' and a.app_type = 'link'
            and coalesce(p.verification, 'unverified') not in ('official', 'domain_verified'))
        or (p_section = 'installed' and mi.user_id is not null)
      )
  ) q
  order by
    case when p_sort = 'new' then extract(epoch from q.created_at) end desc nulls last,
    case when p_sort = 'rating' then q.rating end desc nulls last,
    case when p_sort = 'popular' then q.users_count end desc nulls last,
    case when p_sort = 'trending' then q.opens_30d end desc nulls last,
    q.score desc,
    q.created_at desc
  limit greatest(1, least(coalesce(p_limit, 30), 60))
  offset greatest(0, coalesce(p_offset, 0));
$$;

create function public.mini_app_detail(p_handle_or_id text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select to_jsonb(f) from public.mini_apps_feed(
    p_section => 'all',
    p_limit => 60,
    p_query => null
  ) f
  where lower(f.handle) = lower(p_handle_or_id)
     or f.app_id::text = p_handle_or_id
  limit 1;
$$;

-- =====================================================================
-- 4. Ma'lum bloklovchi hostlar (seed)
-- =====================================================================

update public.mini_apps
   set frame_blocked = true,
       frame_checked_at = now(),
       frame_check_error = 'known_host',
       display_mode = case
         when display_mode in ('iframe','embed','webview') then 'external'
         else display_mode
       end
 where url ~* '(^|//|\.)(islom\.uz|facebook\.com|instagram\.com|x\.com|twitter\.com|linkedin\.com|whatsapp\.com|tiktok\.com|github\.com|accounts\.google\.com|mail\.google\.com|chat\.openai\.com)(/|$)';

-- =====================================================================
-- 5. GRANTLAR
-- =====================================================================

grant execute on function public.mini_apps_feed(text, text, text, text, boolean, text, text, text, int, int) to anon, authenticated;
grant execute on function public.mini_app_detail(text) to anon, authenticated;
grant execute on function public.mini_app_set_frame_result(uuid, boolean, text) to service_role;
grant execute on function public.mini_app_report_frame_block(uuid) to authenticated;

notify pgrst, 'reload schema';


-- ============================================================================
-- SOURCE B-web: 20260901040000_alsamos_bot_api.sql
-- SHA256 49b5761ed1d40496f42740da46b752fdbbe51e2d20453654a2fb3eef7a3c60be
-- ============================================================================
-- Alsamos Bot API.
-- Maqsad: mini applar botlar orqali ulanadi (Telegram modeli): bot yaratiladi,
-- token beriladi, bot HTTP API orqali update oladi va xabar yuboradi.
--
-- Qoidalar: enum yo'q (text + check), citext yo'q, cron yo'q, additive va idempotent.

-- 1) Botlar --------------------------------------------------------------
create table if not exists public.bots (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  publisher_id uuid references public.publishers(id) on delete set null,
  username text not null,
  display_name text not null,
  description text,
  token_hash text not null,
  token_prefix text not null,
  webhook_url text,
  webhook_secret text,
  allowed_updates jsonb not null default '["message","mini_app_open","web_app_data","callback_query"]'::jsonb,
  commands jsonb not null default '[]'::jsonb,
  mini_app_id uuid references public.mini_apps(id) on delete set null,
  mini_app_url text,
  is_active boolean not null default true,
  requests_total bigint not null default 0,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bots_username_format check (username ~ '^[a-z][a-z0-9_]{3,28}bot$'),
  constraint bots_username_key unique (username)
);

create index if not exists bots_owner_idx on public.bots (owner_id);
create index if not exists bots_token_hash_idx on public.bots (token_hash);
create index if not exists bots_mini_app_idx on public.bots (mini_app_id);

alter table public.mini_apps add column if not exists bot_id uuid references public.bots(id) on delete set null;
create index if not exists mini_apps_bot_idx on public.mini_apps (bot_id);

-- 2) Update navbati ------------------------------------------------------
create table if not exists public.bot_updates (
  id bigserial primary key,
  bot_id uuid not null references public.bots(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  update_type text not null check (update_type in ('message','mini_app_open','web_app_data','callback_query','payment')),
  payload jsonb not null default '{}'::jsonb,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists bot_updates_queue_idx on public.bot_updates (bot_id, id) where consumed_at is null;

-- 3) Xabarlar ------------------------------------------------------------
create table if not exists public.bot_messages (
  id uuid primary key default gen_random_uuid(),
  bot_id uuid not null references public.bots(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  direction text not null check (direction in ('in','out')),
  kind text not null default 'text' check (kind in ('text','photo','document','web_app_data','system')),
  text text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists bot_messages_bot_idx on public.bot_messages (bot_id, created_at desc);
create index if not exists bot_messages_user_idx on public.bot_messages (user_id, created_at desc);

-- 4) updated_at ----------------------------------------------------------
create or replace function public.bots_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists bots_touch_updated_at_trg on public.bots;
create trigger bots_touch_updated_at_trg
  before update on public.bots
  for each row execute function public.bots_touch_updated_at();

-- 5) Token yordamchilari -------------------------------------------------
create or replace function public.bot_token_hash(p_token text)
returns text
language sql
immutable
as $$
  select encode(sha256(convert_to(coalesce(p_token, ''), 'utf8')), 'hex')
$$;

create or replace function public.bot_normalize_username(p_username text)
returns text
language plpgsql
immutable
as $$
declare
  v text := lower(regexp_replace(coalesce(p_username, ''), '[^A-Za-z0-9_]', '', 'g'));
begin
  if v = '' then
    return null;
  end if;
  if right(v, 3) <> 'bot' then
    v := v || '_bot';
  end if;
  if v !~ '^[a-z][a-z0-9_]{3,28}bot$' then
    return null;
  end if;
  return v;
end;
$$;

-- 6) Bot yaratish (token FAQAT bir marta qaytariladi) -------------------
create or replace function public.bot_create(
  p_username text,
  p_display_name text default null,
  p_description text default null,
  p_publisher_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_username text := public.bot_normalize_username(p_username);
  v_id uuid := gen_random_uuid();
  v_secret text := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  v_token text;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED';
  end if;
  if v_username is null then
    raise exception 'INVALID_USERNAME';
  end if;
  if exists (select 1 from public.bots b where b.username = v_username) then
    raise exception 'USERNAME_TAKEN';
  end if;
  if p_publisher_id is not null and not exists (
    select 1 from public.publisher_members m
    where m.publisher_id = p_publisher_id and m.user_id = v_uid
  ) then
    raise exception 'NOT_PUBLISHER_MEMBER';
  end if;

  v_token := substr(replace(v_id::text, '-', ''), 1, 12) || ':' || v_secret;

  insert into public.bots (
    id, owner_id, publisher_id, username, display_name, description, token_hash, token_prefix
  ) values (
    v_id,
    v_uid,
    p_publisher_id,
    v_username,
    coalesce(nullif(btrim(p_display_name), ''), v_username),
    nullif(btrim(p_description), ''),
    public.bot_token_hash(v_token),
    substr(v_token, 1, 12)
  );

  return jsonb_build_object('bot_id', v_id, 'username', v_username, 'token', v_token);
end;
$$;

-- 7) Tokenni almashtirish ------------------------------------------------
create or replace function public.bot_revoke_token(p_bot_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_secret text := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  v_token text;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED';
  end if;
  if not exists (select 1 from public.bots b where b.id = p_bot_id and b.owner_id = v_uid) then
    raise exception 'FORBIDDEN';
  end if;

  v_token := substr(replace(p_bot_id::text, '-', ''), 1, 12) || ':' || v_secret;

  update public.bots
     set token_hash = public.bot_token_hash(v_token),
         token_prefix = substr(v_token, 1, 12)
   where id = p_bot_id;

  return jsonb_build_object('bot_id', p_bot_id, 'token', v_token);
end;
$$;

-- 8) Webhook / mini app / komandalar ------------------------------------
create or replace function public.bot_set_webhook(
  p_bot_id uuid,
  p_url text,
  p_secret text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if not public.mini_app_is_service_role()
     and not exists (select 1 from public.bots b where b.id = p_bot_id and b.owner_id = v_uid) then
    raise exception 'FORBIDDEN';
  end if;
  if p_url is not null and p_url !~* '^https://' then
    raise exception 'HTTPS_REQUIRED';
  end if;

  update public.bots
     set webhook_url = nullif(btrim(p_url), ''),
         webhook_secret = nullif(btrim(p_secret), '')
   where id = p_bot_id;

  return true;
end;
$$;

create or replace function public.bot_set_mini_app(
  p_bot_id uuid,
  p_app_id uuid,
  p_url text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if not public.mini_app_is_service_role()
     and not exists (select 1 from public.bots b where b.id = p_bot_id and b.owner_id = v_uid) then
    raise exception 'FORBIDDEN';
  end if;
  if p_app_id is not null and not public.mini_app_is_service_role() and not public.mini_app_can_manage(p_app_id) then
    raise exception 'FORBIDDEN_APP';
  end if;

  update public.bots
     set mini_app_id = p_app_id,
         mini_app_url = nullif(btrim(p_url), '')
   where id = p_bot_id;

  if p_app_id is not null then
    update public.mini_apps set bot_id = p_bot_id where id = p_app_id;
  end if;

  return true;
end;
$$;

create or replace function public.bot_set_commands(p_bot_id uuid, p_commands jsonb)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if not public.mini_app_is_service_role()
     and not exists (select 1 from public.bots b where b.id = p_bot_id and b.owner_id = v_uid) then
    raise exception 'FORBIDDEN';
  end if;
  update public.bots set commands = coalesce(p_commands, '[]'::jsonb) where id = p_bot_id;
  return true;
end;
$$;

-- 9) Token bilan autentifikatsiya (faqat service role = edge function) --
create or replace function public.bot_authenticate(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bot public.bots;
begin
  if not public.mini_app_is_service_role() then
    raise exception 'FORBIDDEN';
  end if;

  select * into v_bot from public.bots where token_hash = public.bot_token_hash(p_token);
  if v_bot.id is null or not v_bot.is_active then
    return null;
  end if;

  update public.bots
     set requests_total = requests_total + 1,
         last_used_at = now()
   where id = v_bot.id;

  return jsonb_build_object(
    'id', v_bot.id,
    'username', v_bot.username,
    'display_name', v_bot.display_name,
    'description', v_bot.description,
    'owner_id', v_bot.owner_id,
    'publisher_id', v_bot.publisher_id,
    'mini_app_id', v_bot.mini_app_id,
    'mini_app_url', v_bot.mini_app_url,
    'webhook_url', v_bot.webhook_url,
    'webhook_secret', v_bot.webhook_secret,
    'commands', v_bot.commands,
    'allowed_updates', v_bot.allowed_updates
  );
end;
$$;

-- 10) Update qo'shish (superapp -> bot) ---------------------------------
create or replace function public.bot_push_update(
  p_username text,
  p_type text,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_bot public.bots;
  v_id bigint;
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
begin
  if v_uid is null and not public.mini_app_is_service_role() then
    raise exception 'AUTH_REQUIRED';
  end if;
  if p_type not in ('message','mini_app_open','web_app_data','callback_query','payment') then
    raise exception 'INVALID_TYPE';
  end if;

  select * into v_bot from public.bots where username = lower(btrim(p_username)) and is_active;
  if v_bot.id is null then
    raise exception 'BOT_NOT_FOUND';
  end if;

  insert into public.bot_updates (bot_id, user_id, update_type, payload)
  values (v_bot.id, v_uid, p_type, v_payload || jsonb_build_object('from_user_id', v_uid))
  returning id into v_id;

  if p_type in ('message','web_app_data') then
    insert into public.bot_messages (bot_id, user_id, direction, kind, text, payload)
    values (
      v_bot.id,
      v_uid,
      'in',
      case when p_type = 'web_app_data' then 'web_app_data' else 'text' end,
      nullif(v_payload->>'text', ''),
      v_payload
    );
  end if;

  return jsonb_build_object(
    'update_id', v_id,
    'bot_id', v_bot.id,
    'webhook_url', v_bot.webhook_url,
    'webhook_secret', v_bot.webhook_secret
  );
end;
$$;

-- 11) getUpdates (long-poll o'rniga navbatdan olish) --------------------
create or replace function public.bot_dequeue_updates(
  p_bot_id uuid,
  p_offset bigint default 0,
  p_limit int default 20
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ids bigint[];
  v_result jsonb;
begin
  if not public.mini_app_is_service_role() then
    raise exception 'FORBIDDEN';
  end if;

  select coalesce(array_agg(id order by id), '{}'::bigint[])
    into v_ids
    from (
      select id
        from public.bot_updates
       where bot_id = p_bot_id
         and consumed_at is null
         and id > coalesce(p_offset, 0)
       order by id
       limit least(greatest(coalesce(p_limit, 20), 1), 100)
    ) s;

  if array_length(v_ids, 1) is null then
    return '[]'::jsonb;
  end if;

  update public.bot_updates set consumed_at = now() where id = any(v_ids);

  select coalesce(
           jsonb_agg(
             jsonb_build_object(
               'update_id', id,
               'type', update_type,
               'payload', payload,
               'date', created_at
             ) order by id
           ),
           '[]'::jsonb
         )
    into v_result
    from public.bot_updates
   where id = any(v_ids);

  return v_result;
end;
$$;

-- 12) sendMessage --------------------------------------------------------
create or replace function public.bot_send_message(
  p_bot_id uuid,
  p_user_id uuid,
  p_text text default null,
  p_payload jsonb default '{}'::jsonb,
  p_kind text default 'text'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.mini_app_is_service_role() then
    raise exception 'FORBIDDEN';
  end if;
  if p_kind not in ('text','photo','document','web_app_data','system') then
    raise exception 'INVALID_KIND';
  end if;

  insert into public.bot_messages (bot_id, user_id, direction, kind, text, payload)
  values (p_bot_id, p_user_id, 'out', p_kind, nullif(btrim(p_text), ''), coalesce(p_payload, '{}'::jsonb))
  returning id into v_id;

  return v_id;
end;
$$;

-- 13) RLS ---------------------------------------------------------------
alter table public.bots enable row level security;
alter table public.bot_updates enable row level security;
alter table public.bot_messages enable row level security;

drop policy if exists bots_owner_select on public.bots;
create policy bots_owner_select on public.bots
  for select using (owner_id = auth.uid());

drop policy if exists bots_owner_update on public.bots;
create policy bots_owner_update on public.bots
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists bots_owner_delete on public.bots;
create policy bots_owner_delete on public.bots
  for delete using (owner_id = auth.uid());

drop policy if exists bot_updates_owner_select on public.bot_updates;
create policy bot_updates_owner_select on public.bot_updates
  for select using (
    exists (select 1 from public.bots b where b.id = bot_id and b.owner_id = auth.uid())
  );

drop policy if exists bot_messages_read on public.bot_messages;
create policy bot_messages_read on public.bot_messages
  for select using (
    user_id = auth.uid()
    or exists (select 1 from public.bots b where b.id = bot_id and b.owner_id = auth.uid())
  );

-- 14) PostgREST sxemasini yangilash -------------------------------------
notify pgrst, 'reload schema';

