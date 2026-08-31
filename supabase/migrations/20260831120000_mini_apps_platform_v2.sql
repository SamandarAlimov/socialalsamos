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
