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
