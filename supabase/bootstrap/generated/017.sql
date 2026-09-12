-- GENERATED FILE: deterministic fresh Alsamos Supabase bootstrap
-- Sources: SamandarAlimov/alsamos-superapp + SamandarAlimov/socialalsamos
-- Test fixture migrations are intentionally excluded.
-- Do not edit this generated file directly.

-- ============================================================================
-- SOURCE B-web: 20260905104500_allow_external_post_media.sql
-- SHA256 46b874cfd7d69eaf3ebb5c4fd1d58bab36b5abb28117ef195e1d509aea2e1a96
-- ============================================================================
-- =============================================================================
-- External media provider compatibility
--
-- New binary objects live on the Alsamos MinIO/S3 media server, not Supabase
-- Storage. Supabase keeps only post metadata + a stable external provider key.
-- Legacy Supabase `storage://` references continue to work unchanged.
-- =============================================================================

create or replace function public.normalize_post_media_storage()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_visibility text;
  v_ref text;
begin
  -- Canonical external server reference always wins over stale provider fields.
  if new.storage_url like 'alsamos-media://%' then
    new.storage_bucket := 'alsamos-media';
    new.storage_key := substr(new.storage_url, length('alsamos-media://') + 1);
  elsif new.storage_url like 'private/%' then
    -- Old API client stored the raw key for private objects.
    new.storage_bucket := 'alsamos-media';
    new.storage_key := new.storage_url;
  elsif new.storage_url like 'https://media.alsamos.com/media/%' then
    -- Old/new public API client stores the permanent CDN URL.
    new.storage_bucket := 'alsamos-media';
    new.storage_key := substr(
      new.storage_url,
      length('https://media.alsamos.com/media/') + 1
    );
  end if;

  if new.thumbnail_url like 'alsamos-media://%' then
    new.thumbnail_bucket := 'alsamos-media';
    new.thumbnail_key := substr(new.thumbnail_url, length('alsamos-media://') + 1);
  elsif new.thumbnail_url like 'private/%' then
    new.thumbnail_bucket := 'alsamos-media';
    new.thumbnail_key := new.thumbnail_url;
  elsif new.thumbnail_url like 'https://media.alsamos.com/media/%' then
    new.thumbnail_bucket := 'alsamos-media';
    new.thumbnail_key := substr(
      new.thumbnail_url,
      length('https://media.alsamos.com/media/') + 1
    );
  end if;

  -- Legacy Supabase reference remains supported.
  if new.storage_bucket is null
     and new.storage_key is null
     and new.storage_url like 'storage://%' then
    v_ref := substring(new.storage_url from 11);
    new.storage_bucket := split_part(v_ref, '/', 1);
    new.storage_key := substring(v_ref from length(new.storage_bucket) + 2);
  end if;

  if new.thumbnail_bucket is null
     and new.thumbnail_key is null
     and new.thumbnail_url like 'storage://%' then
    v_ref := substring(new.thumbnail_url from 11);
    new.thumbnail_bucket := split_part(v_ref, '/', 1);
    new.thumbnail_key := substring(v_ref from length(new.thumbnail_bucket) + 2);
  end if;

  select p.visibility into v_visibility
  from public.posts p
  where p.id = new.post_id;

  if v_visibility is null then
    raise exception 'Post topilmadi';
  end if;

  if v_visibility <> 'public' then
    if (
         new.storage_bucket is distinct from 'media-private'
         and new.storage_bucket is distinct from 'alsamos-media'
       )
       or new.storage_key is null
       or length(new.storage_key) = 0 then
      raise exception 'Maxfiy post fayli private yoki Alsamos media storage da bo''lishi shart';
    end if;

    if new.thumbnail_url is not null
       and (
         (
           new.thumbnail_bucket is distinct from 'media-private'
           and new.thumbnail_bucket is distinct from 'alsamos-media'
         )
         or new.thumbnail_key is null
         or length(new.thumbnail_key) = 0
       ) then
      raise exception 'Maxfiy post preview fayli private yoki Alsamos media storage da bo''lishi shart';
    end if;
  end if;

  return new;
end
$$;

drop trigger if exists post_media_normalize_storage on public.post_media;
create trigger post_media_normalize_storage
  before insert or update of storage_url, thumbnail_url, storage_bucket, storage_key,
    thumbnail_bucket, thumbnail_key
  on public.post_media
  for each row execute function public.normalize_post_media_storage();

-- Repair canonical scheme rows.
update public.post_media
set
  storage_bucket = 'alsamos-media',
  storage_key = substr(storage_url, length('alsamos-media://') + 1)
where storage_url like 'alsamos-media://%'
  and (
    storage_bucket is distinct from 'alsamos-media'
    or storage_key is distinct from substr(storage_url, length('alsamos-media://') + 1)
  );

-- Repair old private API rows where storage_url itself was just `private/...`.
update public.post_media
set
  storage_bucket = 'alsamos-media',
  storage_key = storage_url
where storage_url like 'private/%'
  and (
    storage_bucket is distinct from 'alsamos-media'
    or storage_key is distinct from storage_url
  );

-- Repair old public API rows that were incorrectly tagged as Supabase `media`
-- because both providers happened to use the same bucket name.
update public.post_media
set
  storage_bucket = 'alsamos-media',
  storage_key = substr(
    storage_url,
    length('https://media.alsamos.com/media/') + 1
  )
where storage_url like 'https://media.alsamos.com/media/%'
  and (
    storage_bucket is distinct from 'alsamos-media'
    or storage_key is distinct from substr(
      storage_url,
      length('https://media.alsamos.com/media/') + 1
    )
  );

update public.post_media
set
  thumbnail_bucket = 'alsamos-media',
  thumbnail_key = case
    when thumbnail_url like 'alsamos-media://%'
      then substr(thumbnail_url, length('alsamos-media://') + 1)
    when thumbnail_url like 'private/%'
      then thumbnail_url
    else substr(
      thumbnail_url,
      length('https://media.alsamos.com/media/') + 1
    )
  end
where thumbnail_url like 'alsamos-media://%'
   or thumbnail_url like 'private/%'
   or thumbnail_url like 'https://media.alsamos.com/media/%';

notify pgrst, 'reload schema';


-- ============================================================================
-- SOURCE B-web: 20260905110000_ads_platform_core_v2.sql
-- SHA256 0faed04b1e530b09bc3a90fa4b3fcb31b1d87811b2eaf02055378a26d111b9bf
-- ============================================================================
-- Ads Platform Core V2
--
-- Additive Meta/YouTube-style hierarchy:
--   ad_account -> campaign -> ad_set -> creative -> delivery_item
-- Existing public.ads remains the compatibility surface while the UI migrates.

CREATE TABLE IF NOT EXISTS public.ad_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'restricted', 'disabled')),
  currency text NOT NULL DEFAULT 'USD',
  timezone text NOT NULL DEFAULT 'UTC',
  spend_limit numeric,
  business_name text,
  business_country text,
  billing_email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ad_accounts_owner_idx
  ON public.ad_accounts(owner_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.ad_account_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_account_id uuid NOT NULL REFERENCES public.ad_accounts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'advertiser' CHECK (role IN ('admin', 'advertiser', 'analyst', 'finance')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'invited', 'revoked')),
  invited_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(ad_account_id, user_id)
);

CREATE INDEX IF NOT EXISTS ad_account_members_user_idx
  ON public.ad_account_members(user_id, status);

CREATE OR REPLACE FUNCTION public.has_ad_account_access(
  p_account_id uuid,
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p_user_id IS NOT NULL
    AND (
      EXISTS (
        SELECT 1 FROM public.ad_accounts a
        WHERE a.id = p_account_id
          AND a.owner_user_id = p_user_id
      )
      OR EXISTS (
        SELECT 1 FROM public.ad_account_members m
        WHERE m.ad_account_id = p_account_id
          AND m.user_id = p_user_id
          AND m.status = 'active'
      )
    );
$$;

CREATE OR REPLACE FUNCTION public.can_manage_ad_account(
  p_account_id uuid,
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p_user_id IS NOT NULL
    AND (
      EXISTS (
        SELECT 1 FROM public.ad_accounts a
        WHERE a.id = p_account_id
          AND a.owner_user_id = p_user_id
      )
      OR EXISTS (
        SELECT 1 FROM public.ad_account_members m
        WHERE m.ad_account_id = p_account_id
          AND m.user_id = p_user_id
          AND m.status = 'active'
          AND m.role IN ('admin', 'advertiser')
      )
    );
$$;

CREATE TABLE IF NOT EXISTS public.ad_campaigns_v2 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_account_id uuid NOT NULL REFERENCES public.ad_accounts(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  name text NOT NULL,
  objective text NOT NULL CHECK (
    objective IN ('awareness', 'traffic', 'engagement', 'video_views', 'leads', 'sales', 'app_installs')
  ),
  buying_type text NOT NULL DEFAULT 'auction' CHECK (buying_type IN ('auction', 'reservation')),
  status text NOT NULL DEFAULT 'draft' CHECK (
    status IN ('draft', 'pending_review', 'active', 'paused', 'completed', 'rejected', 'archived')
  ),
  optimization_goal text,
  special_ad_category text,
  daily_budget numeric CHECK (daily_budget IS NULL OR daily_budget >= 0),
  lifetime_budget numeric CHECK (lifetime_budget IS NULL OR lifetime_budget >= 0),
  start_at timestamptz,
  end_at timestamptz,
  attribution_click_days smallint NOT NULL DEFAULT 7 CHECK (attribution_click_days BETWEEN 0 AND 30),
  attribution_view_days smallint NOT NULL DEFAULT 1 CHECK (attribution_view_days BETWEEN 0 AND 7),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ad_campaigns_v2_account_status_idx
  ON public.ad_campaigns_v2(ad_account_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.ad_sets_v2 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_account_id uuid NOT NULL REFERENCES public.ad_accounts(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES public.ad_campaigns_v2(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (
    status IN ('draft', 'pending_review', 'active', 'paused', 'completed', 'rejected', 'archived')
  ),
  bid_strategy text NOT NULL DEFAULT 'lowest_cost' CHECK (
    bid_strategy IN ('lowest_cost', 'cost_cap', 'bid_cap', 'minimum_roas')
  ),
  bid_amount numeric CHECK (bid_amount IS NULL OR bid_amount >= 0),
  daily_budget numeric CHECK (daily_budget IS NULL OR daily_budget >= 0),
  lifetime_budget numeric CHECK (lifetime_budget IS NULL OR lifetime_budget >= 0),
  optimization_event text,
  targeting jsonb NOT NULL DEFAULT '{}'::jsonb,
  placements text[] NOT NULL DEFAULT ARRAY['feed','discover']::text[],
  frequency_cap jsonb NOT NULL DEFAULT '{}'::jsonb,
  schedule jsonb NOT NULL DEFAULT '{}'::jsonb,
  start_at timestamptz,
  end_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ad_sets_v2_campaign_status_idx
  ON public.ad_sets_v2(campaign_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS ad_sets_v2_account_idx
  ON public.ad_sets_v2(ad_account_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.ad_creatives_v2 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_account_id uuid NOT NULL REFERENCES public.ad_accounts(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  name text NOT NULL,
  format text NOT NULL CHECK (format IN ('image', 'video', 'carousel', 'native')),
  media_url text,
  thumbnail_url text,
  headline text,
  body text,
  call_to_action text,
  destination_url text,
  display_url text,
  tracking_params jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'ready', 'archived')),
  moderation_status text NOT NULL DEFAULT 'pending' CHECK (
    moderation_status IN ('pending', 'approved', 'rejected', 'limited')
  ),
  quality_score numeric NOT NULL DEFAULT 0 CHECK (quality_score >= 0),
  policy_labels text[] NOT NULL DEFAULT ARRAY[]::text[],
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ad_creatives_v2_account_moderation_idx
  ON public.ad_creatives_v2(ad_account_id, moderation_status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.ad_delivery_items_v2 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_account_id uuid NOT NULL REFERENCES public.ad_accounts(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES public.ad_campaigns_v2(id) ON DELETE CASCADE,
  ad_set_id uuid NOT NULL REFERENCES public.ad_sets_v2(id) ON DELETE CASCADE,
  creative_id uuid NOT NULL REFERENCES public.ad_creatives_v2(id) ON DELETE RESTRICT,
  legacy_ad_id uuid REFERENCES public.ads(id) ON DELETE SET NULL,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (
    status IN ('draft', 'pending_review', 'active', 'paused', 'completed', 'rejected', 'archived')
  ),
  delivery_weight numeric NOT NULL DEFAULT 1 CHECK (delivery_weight > 0),
  external_key text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(ad_set_id, creative_id, name)
);

CREATE INDEX IF NOT EXISTS ad_delivery_items_v2_set_status_idx
  ON public.ad_delivery_items_v2(ad_set_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS ad_delivery_items_v2_legacy_idx
  ON public.ad_delivery_items_v2(legacy_ad_id)
  WHERE legacy_ad_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.ad_conversion_events_v2 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text UNIQUE,
  ad_account_id uuid NOT NULL REFERENCES public.ad_accounts(id) ON DELETE CASCADE,
  campaign_id uuid REFERENCES public.ad_campaigns_v2(id) ON DELETE SET NULL,
  ad_set_id uuid REFERENCES public.ad_sets_v2(id) ON DELETE SET NULL,
  delivery_item_id uuid REFERENCES public.ad_delivery_items_v2(id) ON DELETE SET NULL,
  legacy_ad_id uuid REFERENCES public.ads(id) ON DELETE SET NULL,
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  event_name text NOT NULL,
  value numeric,
  currency text,
  source text NOT NULL DEFAULT 'web',
  source_url text,
  click_event_key text,
  impression_event_key text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ad_conversion_events_v2_account_time_idx
  ON public.ad_conversion_events_v2(ad_account_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS ad_conversion_events_v2_campaign_time_idx
  ON public.ad_conversion_events_v2(campaign_id, occurred_at DESC)
  WHERE campaign_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.ad_moderation_reviews_v2 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_account_id uuid NOT NULL REFERENCES public.ad_accounts(id) ON DELETE CASCADE,
  creative_id uuid NOT NULL REFERENCES public.ad_creatives_v2(id) ON DELETE CASCADE,
  reviewer_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  decision text NOT NULL CHECK (decision IN ('approved', 'rejected', 'limited', 'needs_changes')),
  reason_code text,
  notes text,
  policy_labels text[] NOT NULL DEFAULT ARRAY[]::text[],
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ad_moderation_reviews_v2_creative_idx
  ON public.ad_moderation_reviews_v2(creative_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.ad_budget_ledger_v2 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_account_id uuid NOT NULL REFERENCES public.ad_accounts(id) ON DELETE CASCADE,
  campaign_id uuid REFERENCES public.ad_campaigns_v2(id) ON DELETE SET NULL,
  kind text NOT NULL CHECK (kind IN ('fund', 'reserve', 'spend', 'release', 'refund', 'adjustment')),
  amount numeric NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  reference_type text,
  reference_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ad_budget_ledger_v2_account_time_idx
  ON public.ad_budget_ledger_v2(ad_account_id, created_at DESC);

-- Bridge legacy ads to the normalized hierarchy without forcing an immediate
-- data migration or breaking current UI writes.
ALTER TABLE public.ads
  ADD COLUMN IF NOT EXISTS ad_account_id uuid REFERENCES public.ad_accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS campaign_v2_id uuid REFERENCES public.ad_campaigns_v2(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ad_set_v2_id uuid REFERENCES public.ad_sets_v2(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS creative_v2_id uuid REFERENCES public.ad_creatives_v2(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS delivery_item_v2_id uuid REFERENCES public.ad_delivery_items_v2(id) ON DELETE SET NULL;

ALTER TABLE public.ad_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_account_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_campaigns_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_sets_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_creatives_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_delivery_items_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_conversion_events_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_moderation_reviews_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_budget_ledger_v2 ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view accessible ad accounts" ON public.ad_accounts;
CREATE POLICY "Users can view accessible ad accounts"
  ON public.ad_accounts FOR SELECT TO authenticated
  USING (public.has_ad_account_access(id, auth.uid()));

DROP POLICY IF EXISTS "Users can create their ad accounts" ON public.ad_accounts;
CREATE POLICY "Users can create their ad accounts"
  ON public.ad_accounts FOR INSERT TO authenticated
  WITH CHECK (owner_user_id = auth.uid());

DROP POLICY IF EXISTS "Owners can update ad accounts" ON public.ad_accounts;
CREATE POLICY "Owners can update ad accounts"
  ON public.ad_accounts FOR UPDATE TO authenticated
  USING (owner_user_id = auth.uid())
  WITH CHECK (owner_user_id = auth.uid());

DROP POLICY IF EXISTS "Members can view account membership" ON public.ad_account_members;
CREATE POLICY "Members can view account membership"
  ON public.ad_account_members FOR SELECT TO authenticated
  USING (public.has_ad_account_access(ad_account_id, auth.uid()));

DROP POLICY IF EXISTS "Account admins can manage membership" ON public.ad_account_members;
CREATE POLICY "Account admins can manage membership"
  ON public.ad_account_members FOR ALL TO authenticated
  USING (public.can_manage_ad_account(ad_account_id, auth.uid()))
  WITH CHECK (public.can_manage_ad_account(ad_account_id, auth.uid()));

DROP POLICY IF EXISTS "Account members can view campaigns" ON public.ad_campaigns_v2;
CREATE POLICY "Account members can view campaigns"
  ON public.ad_campaigns_v2 FOR SELECT TO authenticated
  USING (public.has_ad_account_access(ad_account_id, auth.uid()));
DROP POLICY IF EXISTS "Account managers can manage campaigns" ON public.ad_campaigns_v2;
CREATE POLICY "Account managers can manage campaigns"
  ON public.ad_campaigns_v2 FOR ALL TO authenticated
  USING (public.can_manage_ad_account(ad_account_id, auth.uid()))
  WITH CHECK (public.can_manage_ad_account(ad_account_id, auth.uid()));

DROP POLICY IF EXISTS "Account members can view ad sets" ON public.ad_sets_v2;
CREATE POLICY "Account members can view ad sets"
  ON public.ad_sets_v2 FOR SELECT TO authenticated
  USING (public.has_ad_account_access(ad_account_id, auth.uid()));
DROP POLICY IF EXISTS "Account managers can manage ad sets" ON public.ad_sets_v2;
CREATE POLICY "Account managers can manage ad sets"
  ON public.ad_sets_v2 FOR ALL TO authenticated
  USING (public.can_manage_ad_account(ad_account_id, auth.uid()))
  WITH CHECK (public.can_manage_ad_account(ad_account_id, auth.uid()));

DROP POLICY IF EXISTS "Account members can view creatives" ON public.ad_creatives_v2;
CREATE POLICY "Account members can view creatives"
  ON public.ad_creatives_v2 FOR SELECT TO authenticated
  USING (public.has_ad_account_access(ad_account_id, auth.uid()));
DROP POLICY IF EXISTS "Account managers can manage creatives" ON public.ad_creatives_v2;
CREATE POLICY "Account managers can manage creatives"
  ON public.ad_creatives_v2 FOR ALL TO authenticated
  USING (public.can_manage_ad_account(ad_account_id, auth.uid()))
  WITH CHECK (public.can_manage_ad_account(ad_account_id, auth.uid()));

DROP POLICY IF EXISTS "Account members can view delivery items" ON public.ad_delivery_items_v2;
CREATE POLICY "Account members can view delivery items"
  ON public.ad_delivery_items_v2 FOR SELECT TO authenticated
  USING (public.has_ad_account_access(ad_account_id, auth.uid()));
DROP POLICY IF EXISTS "Account managers can manage delivery items" ON public.ad_delivery_items_v2;
CREATE POLICY "Account managers can manage delivery items"
  ON public.ad_delivery_items_v2 FOR ALL TO authenticated
  USING (public.can_manage_ad_account(ad_account_id, auth.uid()))
  WITH CHECK (public.can_manage_ad_account(ad_account_id, auth.uid()));

DROP POLICY IF EXISTS "Account members can view conversions" ON public.ad_conversion_events_v2;
CREATE POLICY "Account members can view conversions"
  ON public.ad_conversion_events_v2 FOR SELECT TO authenticated
  USING (public.has_ad_account_access(ad_account_id, auth.uid()));

DROP POLICY IF EXISTS "Account members can view moderation reviews" ON public.ad_moderation_reviews_v2;
CREATE POLICY "Account members can view moderation reviews"
  ON public.ad_moderation_reviews_v2 FOR SELECT TO authenticated
  USING (public.has_ad_account_access(ad_account_id, auth.uid()));

DROP POLICY IF EXISTS "Account members can view budget ledger" ON public.ad_budget_ledger_v2;
CREATE POLICY "Account members can view budget ledger"
  ON public.ad_budget_ledger_v2 FOR SELECT TO authenticated
  USING (public.has_ad_account_access(ad_account_id, auth.uid()));

GRANT SELECT, INSERT, UPDATE ON public.ad_accounts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ad_account_members TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ad_campaigns_v2 TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ad_sets_v2 TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ad_creatives_v2 TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ad_delivery_items_v2 TO authenticated;
GRANT SELECT ON public.ad_conversion_events_v2 TO authenticated;
GRANT SELECT ON public.ad_moderation_reviews_v2 TO authenticated;
GRANT SELECT ON public.ad_budget_ledger_v2 TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_ad_account_access(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_ad_account(uuid, uuid) TO authenticated;


-- ============================================================================
-- SOURCE B-web: 20260905113000_admin_rbac_foundation.sql
-- SHA256 934d0552bfb7020640c20b8ca1b000d1f64bf017b99148aac70d60e6b7782395
-- ============================================================================
-- Professional admin RBAC foundation.
--
-- Keep legacy public.user_roles/app_role for backwards compatibility, but do not
-- grow the enum forever. Platform administration uses normalized role and
-- permission tables so future roles can be added without enum migrations.

CREATE TABLE IF NOT EXISTS public.admin_roles (
  key text PRIMARY KEY,
  label text NOT NULL,
  description text NOT NULL DEFAULT '',
  rank smallint NOT NULL DEFAULT 100,
  is_system boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.admin_permissions (
  key text PRIMARY KEY,
  category text NOT NULL,
  label text NOT NULL,
  description text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.admin_role_permissions (
  role_key text NOT NULL REFERENCES public.admin_roles(key) ON UPDATE CASCADE ON DELETE CASCADE,
  permission_key text NOT NULL REFERENCES public.admin_permissions(key) ON UPDATE CASCADE ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (role_key, permission_key)
);

CREATE TABLE IF NOT EXISTS public.admin_role_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role_key text NOT NULL REFERENCES public.admin_roles(key) ON UPDATE CASCADE ON DELETE RESTRICT,
  granted_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  revoked_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE UNIQUE INDEX IF NOT EXISTS admin_role_assignments_one_active_role
  ON public.admin_role_assignments(user_id, role_key)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS admin_role_assignments_user_active_idx
  ON public.admin_role_assignments(user_id, revoked_at);

CREATE INDEX IF NOT EXISTS admin_role_assignments_role_active_idx
  ON public.admin_role_assignments(role_key, revoked_at);

INSERT INTO public.admin_roles (key, label, description, rank, is_system) VALUES
  ('super_admin', 'Super Admin', 'Platformaning barcha funksiyalari va admin rollarini boshqaradi.', 0, true),
  ('trust_safety', 'Trust & Safety', 'Reportlar, moderatsiya, enforcement va appeal oqimlarini boshqaradi.', 10, true),
  ('support', 'Support', 'Foydalanuvchi yordam oqimlari va hisob ma’lumotlarini ko‘radi.', 20, true),
  ('finance', 'Finance', 'To‘lovlar, wallet, buyurtmalar va moliyaviy operatsiyalarni boshqaradi.', 20, true),
  ('ads_reviewer', 'Ads Reviewer', 'Reklama materiallari va kampaniyalarni ko‘rib chiqadi.', 30, true),
  ('marketplace_reviewer', 'Marketplace Reviewer', 'Mahsulotlar va seller moderatsiyasini boshqaradi.', 30, true),
  ('mini_apps_reviewer', 'Mini Apps Reviewer', 'Mini ilovalar va publisher submissionlarini ko‘rib chiqadi.', 30, true),
  ('security_analyst', 'Security Analyst', 'Security eventlar, sessiyalar va xavf signallarini tekshiradi.', 15, true),
  ('analytics_viewer', 'Analytics Viewer', 'Platform analitikasi va operatsion metrikalarni faqat ko‘radi.', 50, true)
ON CONFLICT (key) DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  rank = EXCLUDED.rank,
  is_system = EXCLUDED.is_system,
  updated_at = now();

INSERT INTO public.admin_permissions (key, category, label, description) VALUES
  ('admin.console.access', 'admin', 'Admin konsoliga kirish', 'Admin application shell va ruxsat etilgan bo‘limlarga kirish.'),
  ('admin.roles.view', 'admin', 'Admin rollarini ko‘rish', 'Admin jamoasi va role assignmentlarni ko‘rish.'),
  ('admin.roles.manage', 'admin', 'Admin rollarini boshqarish', 'Admin role berish, almashtirish va bekor qilish.'),
  ('audit.view', 'admin', 'Audit logni ko‘rish', 'Admin amallari va security audit izlarini ko‘rish.'),
  ('analytics.view', 'analytics', 'Analitikani ko‘rish', 'Platform KPI va analitika hisobotlarini ko‘rish.'),
  ('content.view', 'content', 'Kontentni ko‘rish', 'Post, izoh va moderation metadata ko‘rish.'),
  ('content.moderate', 'content', 'Kontentni moderatsiya qilish', 'Kontentni yashirish, olib tashlash yoki tiklash.'),
  ('users.view', 'users', 'Foydalanuvchilarni ko‘rish', 'Profil va admin uchun ruxsat etilgan hisob metadata ko‘rish.'),
  ('users.support', 'users', 'Support amallari', 'Support workflow va foydalanuvchi yordam amallarini bajarish.'),
  ('users.restrict', 'users', 'Hisobni cheklash', 'Account restriction va enforcement qo‘llash.'),
  ('verification.review', 'trust_safety', 'Verifikatsiyani ko‘rib chiqish', 'Verification requestlarni approve/reject qilish.'),
  ('reports.view', 'trust_safety', 'Reportlarni ko‘rish', 'Report queue va evidence ko‘rish.'),
  ('reports.review', 'trust_safety', 'Reportlarni ko‘rib chiqish', 'Moderation decision chiqarish.'),
  ('appeals.review', 'trust_safety', 'Appeallarni ko‘rib chiqish', 'Enforcement appeal oqimlarini ko‘rib chiqish.'),
  ('security.view', 'security', 'Security eventlarni ko‘rish', 'Risk signallari, login va security eventlarni ko‘rish.'),
  ('security.lock', 'security', 'Security lock qo‘llash', 'Xavfli account yoki sessionga himoya cheklovi qo‘llash.'),
  ('sessions.view', 'security', 'Sessiyalarni ko‘rish', 'Admin uchun ruxsat etilgan session/device metadata ko‘rish.'),
  ('payments.view', 'finance', 'To‘lovlarni ko‘rish', 'Payment va transaction metadata ko‘rish.'),
  ('payments.manage', 'finance', 'To‘lovlarni boshqarish', 'Refund, review va payment workflow amallarini bajarish.'),
  ('wallets.manage', 'finance', 'Walletlarni boshqarish', 'Wallet top-up va ledger workflow amallarini bajarish.'),
  ('orders.view', 'finance', 'Buyurtmalarni ko‘rish', 'Marketplace order va settlement holatini ko‘rish.'),
  ('ads.view', 'ads', 'Reklamalarni ko‘rish', 'Ads va campaign review ma’lumotlarini ko‘rish.'),
  ('ads.review', 'ads', 'Reklamalarni ko‘rib chiqish', 'Reklama moderation qarorlarini chiqarish.'),
  ('marketplace.view', 'marketplace', 'Marketplace ma’lumotlarini ko‘rish', 'Seller va product moderation ma’lumotlarini ko‘rish.'),
  ('marketplace.review', 'marketplace', 'Marketplace moderatsiyasi', 'Product va marketplace listinglarni approve/reject qilish.'),
  ('sellers.review', 'marketplace', 'Sellerlarni ko‘rib chiqish', 'Seller verification va enforcement oqimlarini boshqarish.'),
  ('mini_apps.view', 'mini_apps', 'Mini Appsni ko‘rish', 'Mini app submission va publisher ma’lumotlarini ko‘rish.'),
  ('mini_apps.review', 'mini_apps', 'Mini Appsni ko‘rib chiqish', 'Mini app versionlarini approve/reject qilish.')
ON CONFLICT (key) DO UPDATE SET
  category = EXCLUDED.category,
  label = EXCLUDED.label,
  description = EXCLUDED.description;

-- Super admin is handled as an implicit wildcard in has_admin_permission().
-- Other roles receive least-privilege permissions explicitly.
INSERT INTO public.admin_role_permissions (role_key, permission_key) VALUES
  ('trust_safety', 'admin.console.access'),
  ('trust_safety', 'analytics.view'),
  ('trust_safety', 'content.view'),
  ('trust_safety', 'content.moderate'),
  ('trust_safety', 'users.view'),
  ('trust_safety', 'users.restrict'),
  ('trust_safety', 'verification.review'),
  ('trust_safety', 'reports.view'),
  ('trust_safety', 'reports.review'),
  ('trust_safety', 'appeals.review'),
  ('support', 'admin.console.access'),
  ('support', 'users.view'),
  ('support', 'users.support'),
  ('finance', 'admin.console.access'),
  ('finance', 'payments.view'),
  ('finance', 'payments.manage'),
  ('finance', 'wallets.manage'),
  ('finance', 'orders.view'),
  ('finance', 'marketplace.view'),
  ('ads_reviewer', 'admin.console.access'),
  ('ads_reviewer', 'ads.view'),
  ('ads_reviewer', 'ads.review'),
  ('marketplace_reviewer', 'admin.console.access'),
  ('marketplace_reviewer', 'marketplace.view'),
  ('marketplace_reviewer', 'marketplace.review'),
  ('marketplace_reviewer', 'sellers.review'),
  ('mini_apps_reviewer', 'admin.console.access'),
  ('mini_apps_reviewer', 'mini_apps.view'),
  ('mini_apps_reviewer', 'mini_apps.review'),
  ('security_analyst', 'admin.console.access'),
  ('security_analyst', 'users.view'),
  ('security_analyst', 'security.view'),
  ('security_analyst', 'security.lock'),
  ('security_analyst', 'sessions.view'),
  ('security_analyst', 'audit.view'),
  ('analytics_viewer', 'admin.console.access'),
  ('analytics_viewer', 'analytics.view')
ON CONFLICT (role_key, permission_key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.has_admin_role(_user_id uuid, _role_key text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.admin_role_assignments ara
    WHERE ara.user_id = _user_id
      AND ara.role_key = _role_key
      AND ara.revoked_at IS NULL
  );
$$;

CREATE OR REPLACE FUNCTION public.is_admin_staff(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    EXISTS (
      SELECT 1
      FROM public.admin_role_assignments ara
      WHERE ara.user_id = _user_id
        AND ara.revoked_at IS NULL
    )
    OR public.has_role(_user_id, 'admin'::public.app_role);
$$;

CREATE OR REPLACE FUNCTION public.has_admin_permission(_user_id uuid, _permission_key text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_admin_role(_user_id, 'super_admin')
    OR public.has_role(_user_id, 'admin'::public.app_role)
    OR EXISTS (
      SELECT 1
      FROM public.admin_role_assignments ara
      JOIN public.admin_role_permissions arp ON arp.role_key = ara.role_key
      WHERE ara.user_id = _user_id
        AND ara.revoked_at IS NULL
        AND arp.permission_key = _permission_key
    );
$$;

ALTER TABLE public.admin_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_role_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin staff can view admin roles" ON public.admin_roles;
CREATE POLICY "Admin staff can view admin roles"
  ON public.admin_roles FOR SELECT TO authenticated
  USING (public.is_admin_staff(auth.uid()));

DROP POLICY IF EXISTS "Admin staff can view admin permissions" ON public.admin_permissions;
CREATE POLICY "Admin staff can view admin permissions"
  ON public.admin_permissions FOR SELECT TO authenticated
  USING (public.is_admin_staff(auth.uid()));

DROP POLICY IF EXISTS "Admin staff can view role permissions" ON public.admin_role_permissions;
CREATE POLICY "Admin staff can view role permissions"
  ON public.admin_role_permissions FOR SELECT TO authenticated
  USING (public.is_admin_staff(auth.uid()));

DROP POLICY IF EXISTS "Admins can view role assignments" ON public.admin_role_assignments;
CREATE POLICY "Admins can view role assignments"
  ON public.admin_role_assignments FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.has_admin_permission(auth.uid(), 'admin.roles.view')
    OR public.has_admin_role(auth.uid(), 'super_admin')
  );

GRANT SELECT ON public.admin_roles TO authenticated;
GRANT SELECT ON public.admin_permissions TO authenticated;
GRANT SELECT ON public.admin_role_permissions TO authenticated;
GRANT SELECT ON public.admin_role_assignments TO authenticated;

CREATE OR REPLACE FUNCTION public.grant_admin_role_v2(
  p_target_user_id uuid,
  p_role_key text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_assignment_id uuid;
BEGIN
  IF v_actor IS NULL OR NOT public.has_admin_permission(v_actor, 'admin.roles.manage') THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.admin_roles WHERE key = p_role_key) THEN
    RAISE EXCEPTION 'unknown_admin_role';
  END IF;

  IF p_role_key = 'super_admin' AND NOT public.has_admin_role(v_actor, 'super_admin') THEN
    RAISE EXCEPTION 'super_admin_required';
  END IF;

  SELECT id INTO v_assignment_id
  FROM public.admin_role_assignments
  WHERE user_id = p_target_user_id
    AND role_key = p_role_key
    AND revoked_at IS NULL
  LIMIT 1;

  IF v_assignment_id IS NULL THEN
    INSERT INTO public.admin_role_assignments (user_id, role_key, granted_by)
    VALUES (p_target_user_id, p_role_key, v_actor)
    RETURNING id INTO v_assignment_id;
  END IF;

  INSERT INTO public.admin_actions (admin_id, action, target_id, details)
  VALUES (
    v_actor,
    'admin_role_granted',
    p_target_user_id,
    jsonb_build_object('role', p_role_key, 'assignment_id', v_assignment_id)
  );

  RETURN v_assignment_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_admin_role_v2(
  p_target_user_id uuid,
  p_role_key text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_changed integer := 0;
  v_super_admin_count integer := 0;
BEGIN
  IF v_actor IS NULL OR NOT public.has_admin_permission(v_actor, 'admin.roles.manage') THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF p_target_user_id = v_actor THEN
    RAISE EXCEPTION 'self_role_revocation_not_allowed';
  END IF;

  IF p_role_key = 'super_admin' THEN
    IF NOT public.has_admin_role(v_actor, 'super_admin') THEN
      RAISE EXCEPTION 'super_admin_required';
    END IF;

    SELECT count(*)::integer INTO v_super_admin_count
    FROM public.admin_role_assignments
    WHERE role_key = 'super_admin' AND revoked_at IS NULL;

    IF v_super_admin_count <= 1 THEN
      RAISE EXCEPTION 'cannot_remove_last_super_admin';
    END IF;
  END IF;

  UPDATE public.admin_role_assignments
  SET revoked_at = now(), revoked_by = v_actor
  WHERE user_id = p_target_user_id
    AND role_key = p_role_key
    AND revoked_at IS NULL;

  GET DIAGNOSTICS v_changed = ROW_COUNT;

  IF v_changed > 0 THEN
    INSERT INTO public.admin_actions (admin_id, action, target_id, details)
    VALUES (
      v_actor,
      'admin_role_revoked',
      p_target_user_id,
      jsonb_build_object('role', p_role_key)
    );
  END IF;

  RETURN v_changed > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.grant_admin_role_v2(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.revoke_admin_role_v2(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.grant_admin_role_v2(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_admin_role_v2(uuid, text) TO authenticated;

-- Bootstrap the two platform co-owners by verified login email.
-- This is intentionally email-based rather than username-based: usernames are
-- public/profile mutable while auth email is the login identity.
WITH founders AS (
  SELECT p.id
  FROM auth.users u
  JOIN public.profiles p ON p.id = u.id
  WHERE lower(u.email) IN ('samandar@alsamos.com', 'alsamos@alsamos.com')
)
INSERT INTO public.admin_role_assignments (user_id, role_key, granted_by, metadata)
SELECT f.id, 'super_admin', f.id, jsonb_build_object('bootstrap', true, 'source', 'founder_email')
FROM founders f
WHERE NOT EXISTS (
  SELECT 1
  FROM public.admin_role_assignments ara
  WHERE ara.user_id = f.id
    AND ara.role_key = 'super_admin'
    AND ara.revoked_at IS NULL
);

-- Keep current production clients/RLS working while they migrate from the
-- legacy enum-based admin role to the normalized RBAC tables.
WITH founders AS (
  SELECT p.id
  FROM auth.users u
  JOIN public.profiles p ON p.id = u.id
  WHERE lower(u.email) IN ('samandar@alsamos.com', 'alsamos@alsamos.com')
)
INSERT INTO public.user_roles (user_id, role, granted_by)
SELECT f.id, 'admin'::public.app_role, f.id
FROM founders f
ON CONFLICT (user_id, role) DO NOTHING;

UPDATE public.profiles p
SET is_admin = true
FROM auth.users u
WHERE p.id = u.id
  AND lower(u.email) IN ('samandar@alsamos.com', 'alsamos@alsamos.com');


-- ============================================================================
-- SOURCE B-web: 20260905113000_ads_measurement_quality_v3.sql
-- SHA256 9774eaaeb382da9c7850ec3014f5280ec8646da12650f51228f06dec8564a3d9
-- ============================================================================
-- Ads Measurement & Quality V3
--
-- High-volume raw events are intentionally kept separate from long-lived
-- reporting. Daily rollups power dashboards while raw delivery rows can be
-- pruned after a short attribution/fraud window. This matters for Alsamos
-- because media lives outside Supabase and database storage should stay lean.

CREATE TABLE IF NOT EXISTS public.ad_daily_metrics_v3 (
  day date NOT NULL,
  ad_id uuid NOT NULL REFERENCES public.ads(id) ON DELETE CASCADE,
  placement text NOT NULL,
  impressions bigint NOT NULL DEFAULT 0,
  clicks bigint NOT NULL DEFAULT 0,
  dismissals bigint NOT NULL DEFAULT 0,
  reports bigint NOT NULL DEFAULT 0,
  conversions bigint NOT NULL DEFAULT 0,
  conversion_value numeric NOT NULL DEFAULT 0,
  estimated_spend numeric NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (day, ad_id, placement)
);

CREATE INDEX IF NOT EXISTS ad_daily_metrics_v3_ad_day_idx
  ON public.ad_daily_metrics_v3(ad_id, day DESC);
CREATE INDEX IF NOT EXISTS ad_daily_metrics_v3_day_placement_idx
  ON public.ad_daily_metrics_v3(day DESC, placement);

CREATE TABLE IF NOT EXISTS public.ad_quality_state_v3 (
  ad_id uuid PRIMARY KEY REFERENCES public.ads(id) ON DELETE CASCADE,
  quality_score numeric NOT NULL DEFAULT 1 CHECK (quality_score >= 0 AND quality_score <= 2),
  ctr_30d numeric NOT NULL DEFAULT 0,
  hide_rate_30d numeric NOT NULL DEFAULT 0,
  report_rate_30d numeric NOT NULL DEFAULT 0,
  conversion_rate_30d numeric NOT NULL DEFAULT 0,
  sample_impressions_30d bigint NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'learning' CHECK (status IN ('learning', 'healthy', 'limited', 'poor')),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ad_daily_metrics_v3 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_quality_state_v3 ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Advertisers can view own daily ad metrics" ON public.ad_daily_metrics_v3;
CREATE POLICY "Advertisers can view own daily ad metrics"
  ON public.ad_daily_metrics_v3 FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.ads a WHERE a.id = ad_id AND a.user_id = auth.uid()));

DROP POLICY IF EXISTS "Advertisers can view own ad quality" ON public.ad_quality_state_v3;
CREATE POLICY "Advertisers can view own ad quality"
  ON public.ad_quality_state_v3 FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.ads a WHERE a.id = ad_id AND a.user_id = auth.uid()));

GRANT SELECT ON public.ad_daily_metrics_v3 TO authenticated;
GRANT SELECT ON public.ad_quality_state_v3 TO authenticated;

CREATE OR REPLACE FUNCTION public.rollup_ad_delivery_event_v3()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_billing text;
  v_bid numeric;
  v_spend numeric := 0;
  v_reports bigint := 0;
BEGIN
  SELECT billing_type, COALESCE(bid_amount, 0)
    INTO v_billing, v_bid
  FROM public.ads
  WHERE id = NEW.ad_id;

  IF NEW.event_type = 'impression' AND v_billing = 'cpm' THEN
    v_spend := v_bid / 1000.0;
  ELSIF NEW.event_type = 'click' AND v_billing = 'cpc' THEN
    v_spend := v_bid;
  END IF;

  IF NEW.event_type = 'feedback' AND NEW.metadata->>'feedback_type' = 'report' THEN
    v_reports := 1;
  END IF;

  INSERT INTO public.ad_daily_metrics_v3 (
    day,
    ad_id,
    placement,
    impressions,
    clicks,
    dismissals,
    reports,
    estimated_spend,
    updated_at
  ) VALUES (
    (NEW.created_at AT TIME ZONE 'UTC')::date,
    NEW.ad_id,
    NEW.placement,
    CASE WHEN NEW.event_type = 'impression' THEN 1 ELSE 0 END,
    CASE WHEN NEW.event_type = 'click' THEN 1 ELSE 0 END,
    CASE WHEN NEW.event_type = 'dismiss' THEN 1 ELSE 0 END,
    v_reports,
    v_spend,
    now()
  )
  ON CONFLICT (day, ad_id, placement) DO UPDATE SET
    impressions = public.ad_daily_metrics_v3.impressions + EXCLUDED.impressions,
    clicks = public.ad_daily_metrics_v3.clicks + EXCLUDED.clicks,
    dismissals = public.ad_daily_metrics_v3.dismissals + EXCLUDED.dismissals,
    reports = public.ad_daily_metrics_v3.reports + EXCLUDED.reports,
    estimated_spend = public.ad_daily_metrics_v3.estimated_spend + EXCLUDED.estimated_spend,
    updated_at = now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ad_delivery_events_rollup_v3 ON public.ad_delivery_events;
CREATE TRIGGER ad_delivery_events_rollup_v3
AFTER INSERT ON public.ad_delivery_events
FOR EACH ROW EXECUTE FUNCTION public.rollup_ad_delivery_event_v3();

CREATE OR REPLACE FUNCTION public.refresh_ad_quality_v3(p_ad_id uuid)
RETURNS public.ad_quality_state_v3
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_impressions bigint := 0;
  v_clicks bigint := 0;
  v_dismissals bigint := 0;
  v_reports bigint := 0;
  v_conversions bigint := 0;
  v_ctr numeric := 0;
  v_hide_rate numeric := 0;
  v_report_rate numeric := 0;
  v_conversion_rate numeric := 0;
  v_score numeric := 1;
  v_status text := 'learning';
  v_row public.ad_quality_state_v3;
BEGIN
  SELECT
    COALESCE(sum(impressions), 0),
    COALESCE(sum(clicks), 0),
    COALESCE(sum(dismissals), 0),
    COALESCE(sum(reports), 0),
    COALESCE(sum(conversions), 0)
  INTO v_impressions, v_clicks, v_dismissals, v_reports, v_conversions
  FROM public.ad_daily_metrics_v3
  WHERE ad_id = p_ad_id
    AND day >= CURRENT_DATE - 29;

  IF v_impressions > 0 THEN
    v_ctr := v_clicks::numeric / v_impressions;
    v_hide_rate := v_dismissals::numeric / v_impressions;
    v_report_rate := v_reports::numeric / v_impressions;
    v_conversion_rate := v_conversions::numeric / v_impressions;
  END IF;

  -- Quality score is deliberately bounded. Bid can never buy its way out of
  -- severe negative feedback because delivery ranking multiplies by quality.
  v_score := LEAST(
    2,
    GREATEST(
      0,
      1
      + LEAST(0.35, v_ctr * 3)
      + LEAST(0.25, v_conversion_rate * 8)
      - LEAST(0.65, v_hide_rate * 4)
      - LEAST(0.90, v_report_rate * 20)
    )
  );

  v_status := CASE
    WHEN v_impressions < 100 THEN 'learning'
    WHEN v_score < 0.45 OR v_report_rate >= 0.02 THEN 'poor'
    WHEN v_score < 0.75 OR v_hide_rate >= 0.12 THEN 'limited'
    ELSE 'healthy'
  END;

  INSERT INTO public.ad_quality_state_v3 (
    ad_id,
    quality_score,
    ctr_30d,
    hide_rate_30d,
    report_rate_30d,
    conversion_rate_30d,
    sample_impressions_30d,
    status,
    updated_at
  ) VALUES (
    p_ad_id,
    v_score,
    v_ctr,
    v_hide_rate,
    v_report_rate,
    v_conversion_rate,
    v_impressions,
    v_status,
    now()
  )
  ON CONFLICT (ad_id) DO UPDATE SET
    quality_score = EXCLUDED.quality_score,
    ctr_30d = EXCLUDED.ctr_30d,
    hide_rate_30d = EXCLUDED.hide_rate_30d,
    report_rate_30d = EXCLUDED.report_rate_30d,
    conversion_rate_30d = EXCLUDED.conversion_rate_30d,
    sample_impressions_30d = EXCLUDED.sample_impressions_30d,
    status = EXCLUDED.status,
    updated_at = now()
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

-- During migration from legacy flat ads, conversions are allowed to reference
-- a legacy ad before it has been attached to an ad account/campaign hierarchy.
ALTER TABLE public.ad_conversion_events_v2
  ALTER COLUMN ad_account_id DROP NOT NULL;

CREATE OR REPLACE FUNCTION public.record_ad_conversion_v2(
  p_event_name text,
  p_value numeric DEFAULT NULL,
  p_currency text DEFAULT NULL,
  p_source_url text DEFAULT NULL,
  p_event_id text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_touch public.ad_delivery_events;
  v_ad public.ads;
  v_conversion_id uuid;
  v_account_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required';
  END IF;

  IF COALESCE(trim(p_event_name), '') = '' THEN
    RAISE EXCEPTION 'event_name_required';
  END IF;

  -- Click-through attribution wins. If no click exists, use a recent view.
  SELECT e.* INTO v_touch
  FROM public.ad_delivery_events e
  WHERE e.user_id = v_user_id
    AND e.event_type = 'click'
    AND e.created_at >= now() - interval '7 days'
  ORDER BY e.created_at DESC
  LIMIT 1;

  IF v_touch.id IS NULL THEN
    SELECT e.* INTO v_touch
    FROM public.ad_delivery_events e
    WHERE e.user_id = v_user_id
      AND e.event_type = 'impression'
      AND e.created_at >= now() - interval '1 day'
    ORDER BY e.created_at DESC
    LIMIT 1;
  END IF;

  IF v_touch.id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_ad FROM public.ads WHERE id = v_touch.ad_id;
  IF v_ad.id IS NULL THEN RETURN NULL; END IF;

  v_account_id := v_ad.ad_account_id;

  INSERT INTO public.ad_conversion_events_v2 (
    event_id,
    ad_account_id,
    campaign_id,
    ad_set_id,
    delivery_item_id,
    legacy_ad_id,
    user_id,
    event_name,
    value,
    currency,
    source,
    source_url,
    click_event_key,
    impression_event_key,
    metadata,
    occurred_at
  ) VALUES (
    p_event_id,
    v_account_id,
    v_ad.campaign_v2_id,
    v_ad.ad_set_v2_id,
    v_ad.delivery_item_v2_id,
    v_ad.id,
    v_user_id,
    trim(p_event_name),
    p_value,
    p_currency,
    'alsamos_web',
    p_source_url,
    CASE WHEN v_touch.event_type = 'click' THEN v_touch.event_key ELSE NULL END,
    CASE WHEN v_touch.event_type = 'impression' THEN v_touch.event_key ELSE NULL END,
    COALESCE(p_metadata, '{}'::jsonb),
    now()
  )
  ON CONFLICT (event_id) DO NOTHING
  RETURNING id INTO v_conversion_id;

  IF v_conversion_id IS NOT NULL THEN
    INSERT INTO public.ad_daily_metrics_v3 (
      day,
      ad_id,
      placement,
      conversions,
      conversion_value,
      updated_at
    ) VALUES (
      CURRENT_DATE,
      v_ad.id,
      v_touch.placement,
      1,
      COALESCE(p_value, 0),
      now()
    )
    ON CONFLICT (day, ad_id, placement) DO UPDATE SET
      conversions = public.ad_daily_metrics_v3.conversions + 1,
      conversion_value = public.ad_daily_metrics_v3.conversion_value + COALESCE(EXCLUDED.conversion_value, 0),
      updated_at = now();

    PERFORM public.refresh_ad_quality_v3(v_ad.id);
  END IF;

  RETURN v_conversion_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_ad_conversion_v2(text, numeric, text, text, text, jsonb) TO authenticated;

-- Raw delivery rows are useful for recent frequency/fraud/attribution, but
-- should not grow forever. Long-term dashboards use ad_daily_metrics_v3.
CREATE OR REPLACE FUNCTION public.prune_ad_delivery_raw_v3(p_keep_days integer DEFAULT 30)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted bigint := 0;
BEGIN
  IF auth.uid() IS NOT NULL
     AND NOT public.has_admin_permission(auth.uid(), 'ads.review')
     AND NOT public.has_admin_role(auth.uid(), 'super_admin') THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  WITH deleted AS (
    DELETE FROM public.ad_delivery_events
    WHERE created_at < now() - make_interval(days => GREATEST(7, LEAST(COALESCE(p_keep_days, 30), 90)))
    RETURNING 1
  )
  SELECT count(*) INTO v_deleted FROM deleted;

  RETURN v_deleted;
END;
$$;


-- ============================================================================
-- SOURCE B-web: 20260905114500_ads_admin_review.sql
-- SHA256 47cc34973269e6a3ee9a776d9d2be038cc43be151d39e81bf7d31d700307cbde
-- ============================================================================
-- Permissioned Ads moderation workflow.
-- Specialized ads_reviewer users can review creatives without receiving broad
-- platform-admin powers. super_admin remains an implicit wildcard through
-- has_admin_permission().

CREATE OR REPLACE FUNCTION public.review_ad_v2(
  p_ad_id uuid,
  p_decision text,
  p_reason_code text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_policy_labels text[] DEFAULT ARRAY[]::text[]
)
RETURNS public.ads
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_ad public.ads;
  v_status text;
BEGIN
  IF v_actor IS NULL OR NOT public.has_admin_permission(v_actor, 'ads.review') THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF p_decision NOT IN ('approved', 'rejected', 'limited', 'needs_changes') THEN
    RAISE EXCEPTION 'unsupported_decision';
  END IF;

  SELECT * INTO v_ad
  FROM public.ads
  WHERE id = p_ad_id
  FOR UPDATE;

  IF v_ad.id IS NULL THEN
    RAISE EXCEPTION 'ad_not_found';
  END IF;

  v_status := CASE
    WHEN p_decision = 'approved' THEN 'active'
    WHEN p_decision = 'limited' THEN 'active'
    WHEN p_decision IN ('rejected', 'needs_changes') THEN 'rejected'
    ELSE v_ad.status
  END;

  UPDATE public.ads
  SET status = v_status,
      updated_at = now()
  WHERE id = p_ad_id
  RETURNING * INTO v_ad;

  IF v_ad.creative_v2_id IS NOT NULL AND v_ad.ad_account_id IS NOT NULL THEN
    UPDATE public.ad_creatives_v2
    SET moderation_status = CASE
          WHEN p_decision = 'approved' THEN 'approved'
          WHEN p_decision = 'limited' THEN 'limited'
          ELSE 'rejected'
        END,
        policy_labels = COALESCE(p_policy_labels, ARRAY[]::text[]),
        updated_at = now()
    WHERE id = v_ad.creative_v2_id;

    INSERT INTO public.ad_moderation_reviews_v2 (
      ad_account_id,
      creative_id,
      reviewer_id,
      decision,
      reason_code,
      notes,
      policy_labels,
      metadata
    ) VALUES (
      v_ad.ad_account_id,
      v_ad.creative_v2_id,
      v_actor,
      p_decision,
      NULLIF(trim(COALESCE(p_reason_code, '')), ''),
      NULLIF(trim(COALESCE(p_notes, '')), ''),
      COALESCE(p_policy_labels, ARRAY[]::text[]),
      jsonb_build_object('legacy_ad_id', v_ad.id)
    );
  END IF;

  RETURN v_ad;
END;
$$;

GRANT EXECUTE ON FUNCTION public.review_ad_v2(uuid, text, text, text, text[]) TO authenticated;


-- ============================================================================
-- SOURCE B-web: 20260905120000_ads_auction_fraud_v4.sql
-- SHA256 54cf9e28f6befcc2990134f36ec199af519ded3888a58ae27b495220bb289b60
-- ============================================================================
-- Ads Auction & Integrity V4
--
-- Deepens delivery beyond a flat bid sort. The server now combines smoothed
-- response probability, creative quality, first-party relevance, advertiser
-- fatigue, budget pacing and hierarchy state. Invalid-traffic signals are
-- scored before legacy counters/spend-facing rollups are allowed to move.

ALTER TABLE public.ad_delivery_events
  ADD COLUMN IF NOT EXISTS is_invalid boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS fraud_score numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS invalid_reason text;

CREATE INDEX IF NOT EXISTS ad_delivery_events_valid_user_time_v4_idx
  ON public.ad_delivery_events(user_id, created_at DESC)
  WHERE is_invalid = false;

CREATE TABLE IF NOT EXISTS public.ad_fraud_signals_v4 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_event_id uuid REFERENCES public.ad_delivery_events(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ad_id uuid NOT NULL REFERENCES public.ads(id) ON DELETE CASCADE,
  placement text NOT NULL,
  signal_type text NOT NULL,
  severity numeric NOT NULL CHECK (severity >= 0 AND severity <= 1),
  session_id text,
  device_type text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ad_fraud_signals_v4_ad_time_idx
  ON public.ad_fraud_signals_v4(ad_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ad_fraud_signals_v4_user_time_idx
  ON public.ad_fraud_signals_v4(user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

ALTER TABLE public.ad_fraud_signals_v4 ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Ads reviewers can view fraud signals" ON public.ad_fraud_signals_v4;
CREATE POLICY "Ads reviewers can view fraud signals"
  ON public.ad_fraud_signals_v4 FOR SELECT TO authenticated
  USING (public.has_admin_permission(auth.uid(), 'ads.review'));

GRANT SELECT ON public.ad_fraud_signals_v4 TO authenticated;

CREATE OR REPLACE FUNCTION public.score_ad_event_risk_v4(
  p_user_id uuid,
  p_ad_id uuid,
  p_placement text,
  p_event_type text,
  p_session_id text DEFAULT NULL,
  p_device_type text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_score numeric := 0;
  v_reason text := NULL;
  v_recent_same integer := 0;
  v_user_minute integer := 0;
  v_session_minute integer := 0;
  v_clicks_same_minute integer := 0;
  v_has_recent_impression boolean := false;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('score', 0, 'invalid', false, 'reason', NULL);
  END IF;

  SELECT count(*) INTO v_recent_same
  FROM public.ad_delivery_events e
  WHERE e.user_id = p_user_id
    AND e.ad_id = p_ad_id
    AND e.placement = p_placement
    AND e.event_type = p_event_type
    AND e.created_at > now() - interval '2 seconds';

  IF v_recent_same > 0 THEN
    v_score := v_score + CASE WHEN p_event_type = 'click' THEN 0.85 ELSE 0.70 END;
    v_reason := 'rapid_duplicate';
  END IF;

  SELECT count(*) INTO v_user_minute
  FROM public.ad_delivery_events e
  WHERE e.user_id = p_user_id
    AND e.created_at > now() - interval '1 minute';

  IF v_user_minute >= 40 THEN
    v_score := v_score + 0.45;
    v_reason := COALESCE(v_reason, 'user_event_burst');
  END IF;

  IF p_session_id IS NOT NULL THEN
    SELECT count(*) INTO v_session_minute
    FROM public.ad_delivery_events e
    WHERE e.session_id = p_session_id
      AND e.created_at > now() - interval '1 minute';

    IF v_session_minute >= 60 THEN
      v_score := v_score + 0.45;
      v_reason := COALESCE(v_reason, 'session_event_burst');
    END IF;
  END IF;

  IF p_event_type = 'click' THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.ad_delivery_events e
      WHERE e.user_id = p_user_id
        AND e.ad_id = p_ad_id
        AND e.event_type = 'impression'
        AND e.is_invalid = false
        AND e.created_at > now() - interval '15 minutes'
    ) INTO v_has_recent_impression;

    IF NOT v_has_recent_impression THEN
      v_score := v_score + 0.45;
      v_reason := COALESCE(v_reason, 'click_without_recent_impression');
    END IF;

    SELECT count(*) INTO v_clicks_same_minute
    FROM public.ad_delivery_events e
    WHERE e.user_id = p_user_id
      AND e.ad_id = p_ad_id
      AND e.event_type = 'click'
      AND e.created_at > now() - interval '1 minute';

    IF v_clicks_same_minute >= 3 THEN
      v_score := v_score + 0.55;
      v_reason := COALESCE(v_reason, 'repeated_click_burst');
    END IF;
  END IF;

  -- Client-provided metadata is never trusted as a primary fraud verdict, but
  -- impossible/empty automation fingerprints may contribute a small signal.
  IF COALESCE(p_metadata->>'automation', '') = 'true' THEN
    v_score := v_score + 0.35;
    v_reason := COALESCE(v_reason, 'automation_hint');
  END IF;

  v_score := LEAST(1, GREATEST(0, v_score));
  RETURN jsonb_build_object(
    'score', v_score,
    'invalid', v_score >= 0.85,
    'reason', v_reason
  );
END;
$$;

-- Measurement rollups must ignore invalid traffic. The trigger name remains the
-- V3 name so existing installations are upgraded in place.
CREATE OR REPLACE FUNCTION public.rollup_ad_delivery_event_v3()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_billing text;
  v_bid numeric;
  v_spend numeric := 0;
  v_reports bigint := 0;
BEGIN
  IF COALESCE(NEW.is_invalid, false) THEN
    RETURN NEW;
  END IF;

  SELECT billing_type, COALESCE(bid_amount, 0)
    INTO v_billing, v_bid
  FROM public.ads
  WHERE id = NEW.ad_id;

  IF NEW.event_type = 'impression' AND v_billing = 'cpm' THEN
    v_spend := v_bid / 1000.0;
  ELSIF NEW.event_type = 'click' AND v_billing = 'cpc' THEN
    v_spend := v_bid;
  END IF;

  IF NEW.event_type = 'feedback' AND NEW.metadata->>'feedback_type' = 'report' THEN
    v_reports := 1;
  END IF;

  INSERT INTO public.ad_daily_metrics_v3 (
    day, ad_id, placement, impressions, clicks, dismissals, reports,
    estimated_spend, updated_at
  ) VALUES (
    (NEW.created_at AT TIME ZONE 'UTC')::date,
    NEW.ad_id,
    NEW.placement,
    CASE WHEN NEW.event_type = 'impression' THEN 1 ELSE 0 END,
    CASE WHEN NEW.event_type = 'click' THEN 1 ELSE 0 END,
    CASE WHEN NEW.event_type = 'dismiss' THEN 1 ELSE 0 END,
    v_reports,
    v_spend,
    now()
  )
  ON CONFLICT (day, ad_id, placement) DO UPDATE SET
    impressions = public.ad_daily_metrics_v3.impressions + EXCLUDED.impressions,
    clicks = public.ad_daily_metrics_v3.clicks + EXCLUDED.clicks,
    dismissals = public.ad_daily_metrics_v3.dismissals + EXCLUDED.dismissals,
    reports = public.ad_daily_metrics_v3.reports + EXCLUDED.reports,
    estimated_spend = public.ad_daily_metrics_v3.estimated_spend + EXCLUDED.estimated_spend,
    updated_at = now();

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_ad_delivery_event_v4(
  p_ad_id uuid,
  p_placement text,
  p_event_type text,
  p_session_id text DEFAULT NULL,
  p_event_key text DEFAULT NULL,
  p_slot_key text DEFAULT NULL,
  p_device_type text DEFAULT NULL,
  p_score numeric DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_event_id uuid;
  v_risk jsonb;
  v_fraud_score numeric := 0;
  v_invalid boolean := false;
  v_reason text := NULL;
BEGIN
  IF p_event_type NOT IN ('impression', 'click', 'dismiss', 'feedback') THEN
    RAISE EXCEPTION 'unsupported_ad_event';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.ads WHERE id = p_ad_id AND status = 'active') THEN
    RETURN false;
  END IF;

  v_risk := public.score_ad_event_risk_v4(
    v_user_id, p_ad_id, p_placement, p_event_type,
    p_session_id, p_device_type, COALESCE(p_metadata, '{}'::jsonb)
  );
  v_fraud_score := COALESCE((v_risk->>'score')::numeric, 0);
  v_invalid := COALESCE((v_risk->>'invalid')::boolean, false);
  v_reason := NULLIF(v_risk->>'reason', '');

  INSERT INTO public.ad_delivery_events (
    event_key, ad_id, user_id, placement, event_type, session_id, slot_key,
    device_type, score, metadata, is_invalid, fraud_score, invalid_reason
  ) VALUES (
    p_event_key, p_ad_id, v_user_id, p_placement, p_event_type, p_session_id,
    p_slot_key, p_device_type, p_score, COALESCE(p_metadata, '{}'::jsonb),
    v_invalid, v_fraud_score, v_reason
  )
  ON CONFLICT (event_key) DO NOTHING
  RETURNING id INTO v_event_id;

  IF v_event_id IS NULL THEN
    RETURN false;
  END IF;

  IF v_fraud_score >= 0.35 THEN
    INSERT INTO public.ad_fraud_signals_v4 (
      delivery_event_id, user_id, ad_id, placement, signal_type, severity,
      session_id, device_type, metadata
    ) VALUES (
      v_event_id, v_user_id, p_ad_id, p_placement,
      COALESCE(v_reason, 'risk_score'), v_fraud_score,
      p_session_id, p_device_type,
      jsonb_build_object('event_type', p_event_type, 'slot_key', p_slot_key)
    );
  END IF;

  IF v_invalid THEN
    RETURN false;
  END IF;

  IF p_event_type = 'impression' THEN
    INSERT INTO public.ad_impressions (ad_id, user_id, placement, device_type)
    VALUES (p_ad_id, v_user_id, p_placement, p_device_type);

    IF v_user_id IS NOT NULL THEN
      INSERT INTO public.ad_reach (ad_id, user_id)
      VALUES (p_ad_id, v_user_id)
      ON CONFLICT (ad_id, user_id) DO NOTHING;

      INSERT INTO public.ad_frequency_counters (
        user_id, ad_id, placement, day, impressions,
        first_impression_at, last_impression_at, updated_at
      ) VALUES (
        v_user_id, p_ad_id, p_placement, CURRENT_DATE, 1, now(), now(), now()
      )
      ON CONFLICT (user_id, ad_id, placement, day) DO UPDATE SET
        impressions = public.ad_frequency_counters.impressions + 1,
        first_impression_at = COALESCE(public.ad_frequency_counters.first_impression_at, EXCLUDED.first_impression_at),
        last_impression_at = EXCLUDED.last_impression_at,
        updated_at = now();
    END IF;
  ELSIF p_event_type = 'click' THEN
    INSERT INTO public.ad_clicks (ad_id, user_id, placement, device_type)
    VALUES (p_ad_id, v_user_id, p_placement, p_device_type);

    IF v_user_id IS NOT NULL THEN
      INSERT INTO public.ad_frequency_counters (
        user_id, ad_id, placement, day, clicks, last_click_at, updated_at
      ) VALUES (
        v_user_id, p_ad_id, p_placement, CURRENT_DATE, 1, now(), now()
      )
      ON CONFLICT (user_id, ad_id, placement, day) DO UPDATE SET
        clicks = public.ad_frequency_counters.clicks + 1,
        last_click_at = EXCLUDED.last_click_at,
        updated_at = now();
    END IF;
  ELSIF p_event_type = 'dismiss' AND v_user_id IS NOT NULL THEN
    INSERT INTO public.ad_frequency_counters (
      user_id, ad_id, placement, day, dismissals, updated_at
    ) VALUES (
      v_user_id, p_ad_id, p_placement, CURRENT_DATE, 1, now()
    )
    ON CONFLICT (user_id, ad_id, placement, day) DO UPDATE SET
      dismissals = public.ad_frequency_counters.dismissals + 1,
      updated_at = now();
  END IF;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_ad_delivery_event_v4(uuid, text, text, text, text, text, text, numeric, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_eligible_ads_v4(
  p_placement text,
  p_limit integer DEFAULT 6,
  p_session_id text DEFAULT NULL,
  p_context jsonb DEFAULT '{}'::jsonb
)
RETURNS SETOF public.ads
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH cfg AS (
    SELECT * FROM public.ad_delivery_config
    WHERE placement = p_placement AND enabled = true
    LIMIT 1
  ),
  ctx AS (
    SELECT
      CASE WHEN COALESCE(p_context->>'session_age_seconds', '') ~ '^[0-9]+$'
        THEN (p_context->>'session_age_seconds')::integer ELSE 0 END AS session_age_seconds,
      CASE WHEN jsonb_typeof(p_context->'interests') = 'array'
        THEN ARRAY(SELECT lower(value) FROM jsonb_array_elements_text(p_context->'interests'))
        ELSE ARRAY[]::text[] END AS interests
  ),
  base AS (
    SELECT a.*
    FROM public.get_eligible_ads_v2(
      p_placement,
      LEAST(20, GREATEST(COALESCE(p_limit, 6) * 6, COALESCE(p_limit, 6))),
      p_session_id,
      p_context
    ) a
  ),
  scored AS (
    SELECT
      a.id,
      a.created_at,
      COALESCE(q.quality_score, 1) AS quality_score,
      COALESCE(dm.estimated_spend, 0) AS spent_today,
      COALESCE(di.delivery_weight, 1) AS delivery_weight,
      COALESCE(af.advertiser_impressions_24h, 0) AS advertiser_impressions_24h,
      COALESCE(
        s.daily_budget,
        c.daily_budget,
        a.daily_budget
      ) AS effective_daily_budget,
      (
        CASE
          WHEN lower(COALESCE(a.billing_type, 'cpm')) = 'cpc'
            THEN GREATEST(COALESCE(a.bid_amount, 0.01), 0.01)
                 * ((COALESCE(a.clicks_count, 0) + 2.0) / (COALESCE(a.impressions_count, 0) + 100.0))
                 * 1000.0
          ELSE GREATEST(COALESCE(a.bid_amount, 0.01), 0.01)
        END
      )
      * (0.35 + 0.65 * LEAST(2, GREATEST(0, COALESCE(q.quality_score, 1))))
      * (
          1 + LEAST(
            0.45,
            CASE
              WHEN cardinality(ctx.interests) = 0 OR COALESCE(cardinality(a.target_interests), 0) = 0 THEN 0
              ELSE 0.15 * (
                SELECT count(*)::numeric
                FROM unnest(a.target_interests) target_interest
                WHERE lower(target_interest) = ANY(ctx.interests)
              )
            END
          )
        )
      * (1.0 / (1.0 + COALESCE(af.advertiser_impressions_24h, 0) * 0.22))
      * CASE WHEN COALESCE(a.impressions_count, 0) < 100 THEN 1.08 ELSE 1 END
      * COALESCE(di.delivery_weight, 1)
      * CASE
          WHEN COALESCE(s.daily_budget, c.daily_budget, a.daily_budget) IS NULL
               OR COALESCE(s.daily_budget, c.daily_budget, a.daily_budget) <= 0
            THEN 1
          ELSE LEAST(
            1.40,
            GREATEST(
              0.15,
              (
                COALESCE(s.daily_budget, c.daily_budget, a.daily_budget)
                * GREATEST(
                    0.08,
                    EXTRACT(EPOCH FROM (now() - date_trunc('day', now()))) / 86400.0
                  )
              ) / GREATEST(COALESCE(dm.estimated_spend, 0), 0.01)
            )
          )
        END AS auction_score
    FROM base a
    CROSS JOIN cfg
    CROSS JOIN ctx
    LEFT JOIN public.ad_quality_state_v3 q ON q.ad_id = a.id
    LEFT JOIN (
      SELECT ad_id, sum(estimated_spend) AS estimated_spend
      FROM public.ad_daily_metrics_v3
      WHERE day = CURRENT_DATE
      GROUP BY ad_id
    ) dm ON dm.ad_id = a.id
    LEFT JOIN public.ad_campaigns_v2 c ON c.id = a.campaign_v2_id
    LEFT JOIN public.ad_sets_v2 s ON s.id = a.ad_set_v2_id
    LEFT JOIN public.ad_creatives_v2 cr ON cr.id = a.creative_v2_id
    LEFT JOIN public.ad_delivery_items_v2 di ON di.id = a.delivery_item_v2_id
    LEFT JOIN LATERAL (
      SELECT count(*)::integer AS advertiser_impressions_24h
      FROM public.ad_delivery_events e
      JOIN public.ads seen_ad ON seen_ad.id = e.ad_id
      WHERE e.user_id = auth.uid()
        AND e.event_type = 'impression'
        AND e.is_invalid = false
        AND seen_ad.user_id = a.user_id
        AND e.created_at > now() - interval '24 hours'
    ) af ON true
    WHERE ctx.session_age_seconds >= cfg.min_session_seconds
      AND (a.campaign_v2_id IS NULL OR c.status = 'active')
      AND (a.ad_set_v2_id IS NULL OR s.status = 'active')
      AND (a.creative_v2_id IS NULL OR cr.moderation_status IN ('approved', 'limited'))
      AND (a.delivery_item_v2_id IS NULL OR di.status = 'active')
      AND (
        COALESCE(s.daily_budget, c.daily_budget, a.daily_budget) IS NULL
        OR COALESCE(dm.estimated_spend, 0) < COALESCE(s.daily_budget, c.daily_budget, a.daily_budget)
      )
      AND (
        c.id IS NULL
        OR c.lifetime_budget IS NULL
        OR (
          SELECT COALESCE(sum(COALESCE(linked.spent, 0)), 0)
          FROM public.ads linked
          WHERE linked.campaign_v2_id = c.id
        ) < c.lifetime_budget
      )
  )
  SELECT a.*
  FROM scored s
  JOIN public.ads a ON a.id = s.id
  ORDER BY s.auction_score DESC, s.quality_score DESC, s.created_at DESC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 6), 20));
$$;

GRANT EXECUTE ON FUNCTION public.get_eligible_ads_v4(text, integer, text, jsonb) TO authenticated;


-- ============================================================================
-- SOURCE B-web: 20260905121000_ads_hierarchy_crud_v4.sql
-- SHA256 20220862832ca641ab558729473fc908979d86fb650e086b0eda79127d9cf950
-- ============================================================================
-- Ads Hierarchy CRUD V4
--
-- New campaigns are created atomically across account -> campaign -> ad set ->
-- creative -> delivery item. public.ads remains a compatibility projection for
-- existing feed/rendering code, but it is no longer the only write target.

CREATE OR REPLACE FUNCTION public.create_ad_campaign_v4(p_payload jsonb)
RETURNS public.ads
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_account public.ad_accounts;
  v_campaign public.ad_campaigns_v2;
  v_set public.ad_sets_v2;
  v_creative public.ad_creatives_v2;
  v_delivery public.ad_delivery_items_v2;
  v_ad public.ads;
  v_title text := trim(COALESCE(p_payload->>'title', ''));
  v_media_url text := trim(COALESCE(p_payload->>'media_url', ''));
  v_media_type text := lower(COALESCE(p_payload->>'media_type', 'image'));
  v_ad_type text := lower(COALESCE(p_payload->>'ad_type', 'feed'));
  v_billing text := lower(COALESCE(p_payload->>'billing_type', 'cpm'));
  v_objective text := lower(COALESCE(p_payload->>'objective', ''));
  v_budget numeric := GREATEST(COALESCE(NULLIF(p_payload->>'budget', '')::numeric, 0), 0);
  v_daily numeric := NULLIF(p_payload->>'daily_budget', '')::numeric;
  v_bid numeric := GREATEST(COALESCE(NULLIF(p_payload->>'bid_amount', '')::numeric, 0.01), 0.01);
  v_placements text[];
  v_countries text[] := ARRAY[]::text[];
  v_interests text[] := ARRAY[]::text[];
  v_targeting jsonb;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  IF length(v_title) < 3 THEN RAISE EXCEPTION 'title_required'; END IF;
  IF v_media_url = '' THEN RAISE EXCEPTION 'media_required'; END IF;
  IF v_media_type NOT IN ('image', 'video') THEN RAISE EXCEPTION 'invalid_media_type'; END IF;
  IF v_ad_type NOT IN ('feed', 'story', 'both') THEN RAISE EXCEPTION 'invalid_ad_type'; END IF;
  IF v_billing NOT IN ('cpm', 'cpc') THEN RAISE EXCEPTION 'invalid_billing_type'; END IF;
  IF v_budget < 1 THEN RAISE EXCEPTION 'budget_too_small'; END IF;

  IF jsonb_typeof(p_payload->'target_countries') = 'array' THEN
    SELECT ARRAY(SELECT value FROM jsonb_array_elements_text(p_payload->'target_countries')) INTO v_countries;
  END IF;
  IF jsonb_typeof(p_payload->'target_interests') = 'array' THEN
    SELECT ARRAY(SELECT value FROM jsonb_array_elements_text(p_payload->'target_interests')) INTO v_interests;
  END IF;

  v_placements := CASE v_ad_type
    WHEN 'story' THEN ARRAY['story']::text[]
    WHEN 'both' THEN ARRAY['feed','discover','video','story']::text[]
    ELSE ARRAY['feed','discover','video']::text[]
  END;

  IF v_objective NOT IN ('awareness', 'traffic', 'engagement', 'video_views', 'leads', 'sales', 'app_installs') THEN
    v_objective := CASE
      WHEN lower(COALESCE(p_payload->>'call_to_action', '')) LIKE '%xarid%' THEN 'sales'
      WHEN NULLIF(trim(COALESCE(p_payload->>'destination_url', '')), '') IS NOT NULL THEN 'traffic'
      WHEN v_media_type = 'video' THEN 'video_views'
      ELSE 'awareness'
    END;
  END IF;

  SELECT * INTO v_account
  FROM public.ad_accounts
  WHERE owner_user_id = v_user
    AND status = 'active'
  ORDER BY created_at ASC
  LIMIT 1
  FOR UPDATE;

  IF v_account.id IS NULL THEN
    INSERT INTO public.ad_accounts (
      owner_user_id, name, currency, timezone, business_name
    )
    SELECT
      v_user,
      COALESCE(NULLIF(trim(p.display_name), ''), NULLIF(trim(p.username), ''), 'Alsamos') || ' Ads',
      COALESCE(NULLIF(upper(p_payload->>'currency'), ''), 'USD'),
      COALESCE(NULLIF(p_payload->>'timezone', ''), 'UTC'),
      NULLIF(trim(p.display_name), '')
    FROM public.profiles p
    WHERE p.id = v_user
    RETURNING * INTO v_account;
  END IF;

  INSERT INTO public.ad_campaigns_v2 (
    ad_account_id, created_by, name, objective, buying_type, status,
    optimization_goal, daily_budget, lifetime_budget, start_at, end_at,
    metadata
  ) VALUES (
    v_account.id,
    v_user,
    v_title,
    v_objective,
    'auction',
    'pending_review',
    CASE v_objective
      WHEN 'sales' THEN 'conversions'
      WHEN 'traffic' THEN 'landing_page_views'
      WHEN 'video_views' THEN 'thruplay'
      ELSE 'reach'
    END,
    CASE WHEN v_daily IS NOT NULL AND v_daily > 0 THEN v_daily ELSE NULL END,
    v_budget,
    NULLIF(p_payload->>'start_date', '')::timestamptz,
    NULLIF(p_payload->>'end_date', '')::timestamptz,
    jsonb_build_object('created_from', 'ads_manager_v4')
  ) RETURNING * INTO v_campaign;

  v_targeting := jsonb_build_object(
    'countries', to_jsonb(v_countries),
    'interests', to_jsonb(v_interests),
    'age_min', COALESCE(NULLIF(p_payload->>'target_age_min', '')::integer, 13),
    'age_max', COALESCE(NULLIF(p_payload->>'target_age_max', '')::integer, 65),
    'gender', COALESCE(NULLIF(p_payload->>'target_gender', ''), 'all')
  );

  INSERT INTO public.ad_sets_v2 (
    ad_account_id, campaign_id, created_by, name, status,
    bid_strategy, bid_amount, daily_budget, lifetime_budget,
    optimization_event, targeting, placements, frequency_cap,
    start_at, end_at, metadata
  ) VALUES (
    v_account.id,
    v_campaign.id,
    v_user,
    v_title || ' · Audience',
    'pending_review',
    'lowest_cost',
    v_bid,
    CASE WHEN v_daily IS NOT NULL AND v_daily > 0 THEN v_daily ELSE NULL END,
    v_budget,
    v_campaign.optimization_goal,
    v_targeting,
    v_placements,
    jsonb_build_object('per_user_per_day', 2, 'minimum_gap_minutes', 45),
    v_campaign.start_at,
    v_campaign.end_at,
    jsonb_build_object('created_from', 'ads_manager_v4')
  ) RETURNING * INTO v_set;

  INSERT INTO public.ad_creatives_v2 (
    ad_account_id, created_by, name, format, media_url, headline, body,
    call_to_action, destination_url, status, moderation_status, metadata
  ) VALUES (
    v_account.id,
    v_user,
    v_title || ' · Creative',
    v_media_type,
    v_media_url,
    v_title,
    NULLIF(trim(COALESCE(p_payload->>'description', '')), ''),
    COALESCE(NULLIF(trim(p_payload->>'call_to_action'), ''), 'Batafsil'),
    NULLIF(trim(COALESCE(p_payload->>'destination_url', '')), ''),
    'ready',
    'pending',
    jsonb_build_object('source', 'ads_manager_v4')
  ) RETURNING * INTO v_creative;

  INSERT INTO public.ads (
    user_id, title, description, media_url, media_type, destination_url,
    call_to_action, ad_type, status, budget, daily_budget, bid_amount,
    billing_type, target_countries, target_age_min, target_age_max,
    target_gender, target_interests, start_date, end_date,
    ad_account_id, campaign_v2_id, ad_set_v2_id, creative_v2_id
  ) VALUES (
    v_user,
    v_title,
    NULLIF(trim(COALESCE(p_payload->>'description', '')), ''),
    v_media_url,
    v_media_type,
    NULLIF(trim(COALESCE(p_payload->>'destination_url', '')), ''),
    COALESCE(NULLIF(trim(p_payload->>'call_to_action'), ''), 'Batafsil'),
    v_ad_type,
    'pending',
    v_budget,
    CASE WHEN v_daily IS NOT NULL AND v_daily > 0 THEN v_daily ELSE NULL END,
    v_bid,
    v_billing,
    v_countries,
    COALESCE(NULLIF(p_payload->>'target_age_min', '')::integer, 13),
    COALESCE(NULLIF(p_payload->>'target_age_max', '')::integer, 65),
    COALESCE(NULLIF(p_payload->>'target_gender', ''), 'all'),
    v_interests,
    NULLIF(p_payload->>'start_date', '')::timestamptz,
    NULLIF(p_payload->>'end_date', '')::timestamptz,
    v_account.id,
    v_campaign.id,
    v_set.id,
    v_creative.id
  ) RETURNING * INTO v_ad;

  INSERT INTO public.ad_delivery_items_v2 (
    ad_account_id, campaign_id, ad_set_id, creative_id, legacy_ad_id,
    name, status, delivery_weight, metadata
  ) VALUES (
    v_account.id,
    v_campaign.id,
    v_set.id,
    v_creative.id,
    v_ad.id,
    v_title,
    'pending_review',
    1,
    jsonb_build_object('compatibility_surface', 'public.ads')
  ) RETURNING * INTO v_delivery;

  UPDATE public.ads
  SET delivery_item_v2_id = v_delivery.id,
      updated_at = now()
  WHERE id = v_ad.id
  RETURNING * INTO v_ad;

  RETURN v_ad;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_ad_campaign_v4(jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_ad_delivery_status_v4(
  p_ad_id uuid,
  p_status text
)
RETURNS public.ads
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_ad public.ads;
  v_delivery_status text;
  v_moderation text;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  IF p_status NOT IN ('active', 'paused') THEN RAISE EXCEPTION 'unsupported_status'; END IF;

  SELECT * INTO v_ad
  FROM public.ads
  WHERE id = p_ad_id AND user_id = v_user
  FOR UPDATE;

  IF v_ad.id IS NULL THEN RAISE EXCEPTION 'ad_not_found'; END IF;

  IF p_status = 'active' AND v_ad.creative_v2_id IS NOT NULL THEN
    SELECT moderation_status INTO v_moderation
    FROM public.ad_creatives_v2
    WHERE id = v_ad.creative_v2_id;
    IF v_moderation NOT IN ('approved', 'limited') THEN
      RAISE EXCEPTION 'creative_not_approved';
    END IF;
  END IF;

  UPDATE public.ads
  SET status = p_status, updated_at = now()
  WHERE id = p_ad_id
  RETURNING * INTO v_ad;

  v_delivery_status := CASE WHEN p_status = 'active' THEN 'active' ELSE 'paused' END;
  IF v_ad.delivery_item_v2_id IS NOT NULL THEN
    UPDATE public.ad_delivery_items_v2
    SET status = v_delivery_status, updated_at = now()
    WHERE id = v_ad.delivery_item_v2_id;
  END IF;

  RETURN v_ad;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_ad_delivery_status_v4(uuid, text) TO authenticated;

-- Upgrade the review workflow so approval activates the normalized hierarchy,
-- not only the legacy compatibility row.
CREATE OR REPLACE FUNCTION public.review_ad_v2(
  p_ad_id uuid,
  p_decision text,
  p_reason_code text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_policy_labels text[] DEFAULT ARRAY[]::text[]
)
RETURNS public.ads
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_ad public.ads;
  v_status text;
  v_creative_status text;
BEGIN
  IF v_actor IS NULL OR NOT public.has_admin_permission(v_actor, 'ads.review') THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  IF p_decision NOT IN ('approved', 'rejected', 'limited', 'needs_changes') THEN
    RAISE EXCEPTION 'unsupported_decision';
  END IF;

  SELECT * INTO v_ad FROM public.ads WHERE id = p_ad_id FOR UPDATE;
  IF v_ad.id IS NULL THEN RAISE EXCEPTION 'ad_not_found'; END IF;

  v_status := CASE WHEN p_decision IN ('approved', 'limited') THEN 'active' ELSE 'rejected' END;
  v_creative_status := CASE
    WHEN p_decision = 'approved' THEN 'approved'
    WHEN p_decision = 'limited' THEN 'limited'
    ELSE 'rejected'
  END;

  UPDATE public.ads SET status = v_status, updated_at = now()
  WHERE id = p_ad_id RETURNING * INTO v_ad;

  IF v_ad.creative_v2_id IS NOT NULL THEN
    UPDATE public.ad_creatives_v2
    SET moderation_status = v_creative_status,
        policy_labels = COALESCE(p_policy_labels, ARRAY[]::text[]),
        updated_at = now()
    WHERE id = v_ad.creative_v2_id;
  END IF;

  IF v_ad.delivery_item_v2_id IS NOT NULL THEN
    UPDATE public.ad_delivery_items_v2
    SET status = CASE WHEN p_decision IN ('approved', 'limited') THEN 'active' ELSE 'rejected' END,
        metadata = CASE
          WHEN p_decision = 'limited' THEN COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('limited_delivery', true)
          ELSE COALESCE(metadata, '{}'::jsonb) - 'limited_delivery'
        END,
        updated_at = now()
    WHERE id = v_ad.delivery_item_v2_id;
  END IF;

  IF p_decision IN ('approved', 'limited') THEN
    IF v_ad.ad_set_v2_id IS NOT NULL THEN
      UPDATE public.ad_sets_v2
      SET status = 'active', updated_at = now()
      WHERE id = v_ad.ad_set_v2_id AND status IN ('draft', 'pending_review', 'paused');
    END IF;
    IF v_ad.campaign_v2_id IS NOT NULL THEN
      UPDATE public.ad_campaigns_v2
      SET status = 'active', updated_at = now()
      WHERE id = v_ad.campaign_v2_id AND status IN ('draft', 'pending_review', 'paused');
    END IF;
  ELSE
    IF v_ad.ad_set_v2_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.ad_delivery_items_v2 d
      WHERE d.ad_set_id = v_ad.ad_set_v2_id AND d.status NOT IN ('rejected', 'archived')
    ) THEN
      UPDATE public.ad_sets_v2 SET status = 'rejected', updated_at = now() WHERE id = v_ad.ad_set_v2_id;
    END IF;
  END IF;

  IF v_ad.creative_v2_id IS NOT NULL AND v_ad.ad_account_id IS NOT NULL THEN
    INSERT INTO public.ad_moderation_reviews_v2 (
      ad_account_id, creative_id, reviewer_id, decision, reason_code,
      notes, policy_labels, metadata
    ) VALUES (
      v_ad.ad_account_id,
      v_ad.creative_v2_id,
      v_actor,
      p_decision,
      NULLIF(trim(COALESCE(p_reason_code, '')), ''),
      NULLIF(trim(COALESCE(p_notes, '')), ''),
      COALESCE(p_policy_labels, ARRAY[]::text[]),
      jsonb_build_object('legacy_ad_id', v_ad.id, 'hierarchy_synced', true)
    );
  END IF;

  RETURN v_ad;
END;
$$;

GRANT EXECUTE ON FUNCTION public.review_ad_v2(uuid, text, text, text, text[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_ads_workspace_v4()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'accounts', COALESCE((
      SELECT jsonb_agg(to_jsonb(a) ORDER BY a.created_at)
      FROM public.ad_accounts a
      WHERE public.has_ad_account_access(a.id, auth.uid())
    ), '[]'::jsonb),
    'campaigns', COALESCE((
      SELECT jsonb_agg(to_jsonb(c) ORDER BY c.created_at DESC)
      FROM public.ad_campaigns_v2 c
      WHERE public.has_ad_account_access(c.ad_account_id, auth.uid())
    ), '[]'::jsonb),
    'ad_sets', COALESCE((
      SELECT jsonb_agg(to_jsonb(s) ORDER BY s.created_at DESC)
      FROM public.ad_sets_v2 s
      WHERE public.has_ad_account_access(s.ad_account_id, auth.uid())
    ), '[]'::jsonb),
    'creatives', COALESCE((
      SELECT jsonb_agg(to_jsonb(cr) ORDER BY cr.created_at DESC)
      FROM public.ad_creatives_v2 cr
      WHERE public.has_ad_account_access(cr.ad_account_id, auth.uid())
    ), '[]'::jsonb),
    'delivery_items', COALESCE((
      SELECT jsonb_agg(to_jsonb(d) ORDER BY d.created_at DESC)
      FROM public.ad_delivery_items_v2 d
      WHERE public.has_ad_account_access(d.ad_account_id, auth.uid())
    ), '[]'::jsonb)
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_my_ads_workspace_v4() TO authenticated;


-- ============================================================================
-- SOURCE B-web: 20260905121500_ads_hierarchy_lifecycle_v4.sql
-- SHA256 31a2a1a2e71dcd80a35aee827543af8649667d8d3931d045aae3a153c086f4e4
-- ============================================================================
-- Ads hierarchy lifecycle helpers.

CREATE OR REPLACE FUNCTION public.archive_ad_delivery_v4(p_ad_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_ad public.ads;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;

  SELECT * INTO v_ad
  FROM public.ads
  WHERE id = p_ad_id AND user_id = v_user
  FOR UPDATE;

  IF v_ad.id IS NULL THEN RAISE EXCEPTION 'ad_not_found'; END IF;

  IF v_ad.delivery_item_v2_id IS NOT NULL THEN
    UPDATE public.ad_delivery_items_v2
    SET status = 'archived', updated_at = now()
    WHERE id = v_ad.delivery_item_v2_id;
  END IF;

  IF v_ad.creative_v2_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.ad_delivery_items_v2 d
    WHERE d.creative_id = v_ad.creative_v2_id
      AND d.id IS DISTINCT FROM v_ad.delivery_item_v2_id
      AND d.status <> 'archived'
  ) THEN
    UPDATE public.ad_creatives_v2
    SET status = 'archived', updated_at = now()
    WHERE id = v_ad.creative_v2_id;
  END IF;

  IF v_ad.ad_set_v2_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.ad_delivery_items_v2 d
    WHERE d.ad_set_id = v_ad.ad_set_v2_id
      AND d.id IS DISTINCT FROM v_ad.delivery_item_v2_id
      AND d.status <> 'archived'
  ) THEN
    UPDATE public.ad_sets_v2
    SET status = 'archived', updated_at = now()
    WHERE id = v_ad.ad_set_v2_id;
  END IF;

  IF v_ad.campaign_v2_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.ad_delivery_items_v2 d
    WHERE d.campaign_id = v_ad.campaign_v2_id
      AND d.id IS DISTINCT FROM v_ad.delivery_item_v2_id
      AND d.status <> 'archived'
  ) THEN
    UPDATE public.ad_campaigns_v2
    SET status = 'archived', updated_at = now()
    WHERE id = v_ad.campaign_v2_id;
  END IF;

  DELETE FROM public.ads WHERE id = p_ad_id;
  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.archive_ad_delivery_v4(uuid) TO authenticated;

