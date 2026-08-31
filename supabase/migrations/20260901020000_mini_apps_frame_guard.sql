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
