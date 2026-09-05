-- Ads legacy -> normalized hierarchy backfill.
--
-- Existing campaigns must not disappear from Campaign Studio after V4 rollout.
-- This migration converts every legacy public.ads row that is not yet bridged
-- into one normalized Campaign -> Ad Set -> Creative -> Delivery Item chain.
-- The operation is idempotent because bridge IDs are written back to public.ads.

DO $$
DECLARE
  r public.ads;
  v_account public.ad_accounts;
  v_campaign public.ad_campaigns_v2;
  v_set public.ad_sets_v2;
  v_creative public.ad_creatives_v2;
  v_delivery public.ad_delivery_items_v2;
  v_campaign_status text;
  v_delivery_status text;
  v_moderation_status text;
  v_objective text;
  v_placements text[];
BEGIN
  FOR r IN
    SELECT *
    FROM public.ads
    WHERE ad_account_id IS NULL
       OR campaign_v2_id IS NULL
       OR ad_set_v2_id IS NULL
       OR creative_v2_id IS NULL
       OR delivery_item_v2_id IS NULL
    ORDER BY created_at ASC
  LOOP
    SELECT * INTO v_account
    FROM public.ad_accounts
    WHERE owner_user_id = r.user_id
      AND status <> 'disabled'
    ORDER BY created_at ASC
    LIMIT 1;

    IF v_account.id IS NULL THEN
      INSERT INTO public.ad_accounts (
        owner_user_id, name, currency, timezone, business_name, created_at, updated_at
      )
      SELECT
        r.user_id,
        COALESCE(NULLIF(trim(p.display_name), ''), NULLIF(trim(p.username), ''), 'Alsamos') || ' Ads',
        'USD',
        'UTC',
        NULLIF(trim(p.display_name), ''),
        r.created_at,
        now()
      FROM public.profiles p
      WHERE p.id = r.user_id
      RETURNING * INTO v_account;
    END IF;

    -- A profile should always exist for an ads owner. If historical data is
    -- inconsistent, skip it rather than failing the entire migration.
    IF v_account.id IS NULL THEN
      CONTINUE;
    END IF;

    v_campaign_status := CASE r.status
      WHEN 'active' THEN 'active'
      WHEN 'paused' THEN 'paused'
      WHEN 'completed' THEN 'completed'
      WHEN 'rejected' THEN 'rejected'
      ELSE 'pending_review'
    END;
    v_delivery_status := v_campaign_status;
    v_moderation_status := CASE
      WHEN r.status IN ('active', 'paused', 'completed') THEN 'approved'
      WHEN r.status = 'rejected' THEN 'rejected'
      ELSE 'pending'
    END;
    v_objective := CASE
      WHEN lower(COALESCE(r.call_to_action, '')) LIKE '%xarid%' THEN 'sales'
      WHEN NULLIF(trim(COALESCE(r.destination_url, '')), '') IS NOT NULL THEN 'traffic'
      WHEN r.media_type = 'video' THEN 'video_views'
      ELSE 'awareness'
    END;
    v_placements := CASE r.ad_type
      WHEN 'story' THEN ARRAY['story']::text[]
      WHEN 'both' THEN ARRAY['feed','discover','video','story']::text[]
      ELSE ARRAY['feed','discover','video']::text[]
    END;

    IF r.campaign_v2_id IS NOT NULL THEN
      SELECT * INTO v_campaign FROM public.ad_campaigns_v2 WHERE id = r.campaign_v2_id;
    END IF;
    IF v_campaign.id IS NULL THEN
      INSERT INTO public.ad_campaigns_v2 (
        ad_account_id, created_by, name, objective, buying_type, status,
        optimization_goal, daily_budget, lifetime_budget, start_at, end_at,
        metadata, created_at, updated_at
      ) VALUES (
        v_account.id,
        r.user_id,
        r.title,
        v_objective,
        'auction',
        v_campaign_status,
        CASE v_objective
          WHEN 'sales' THEN 'conversions'
          WHEN 'traffic' THEN 'landing_page_views'
          WHEN 'video_views' THEN 'thruplay'
          ELSE 'reach'
        END,
        r.daily_budget,
        r.budget,
        r.start_date,
        r.end_date,
        jsonb_build_object('backfilled_from_legacy_ad', r.id),
        r.created_at,
        now()
      ) RETURNING * INTO v_campaign;
    END IF;

    IF r.ad_set_v2_id IS NOT NULL THEN
      SELECT * INTO v_set FROM public.ad_sets_v2 WHERE id = r.ad_set_v2_id;
    END IF;
    IF v_set.id IS NULL THEN
      INSERT INTO public.ad_sets_v2 (
        ad_account_id, campaign_id, created_by, name, status,
        bid_strategy, bid_amount, daily_budget, lifetime_budget,
        optimization_event, targeting, placements, frequency_cap,
        start_at, end_at, metadata, created_at, updated_at
      ) VALUES (
        v_account.id,
        v_campaign.id,
        r.user_id,
        r.title || ' · Audience',
        v_campaign_status,
        'lowest_cost',
        r.bid_amount,
        r.daily_budget,
        r.budget,
        v_campaign.optimization_goal,
        jsonb_build_object(
          'countries', to_jsonb(COALESCE(r.target_countries, ARRAY[]::text[])),
          'interests', to_jsonb(COALESCE(r.target_interests, ARRAY[]::text[])),
          'age_min', COALESCE(r.target_age_min, 13),
          'age_max', COALESCE(r.target_age_max, 65),
          'gender', COALESCE(r.target_gender, 'all')
        ),
        v_placements,
        jsonb_build_object('per_user_per_day', 2, 'minimum_gap_minutes', 45),
        r.start_date,
        r.end_date,
        jsonb_build_object('backfilled_from_legacy_ad', r.id),
        r.created_at,
        now()
      ) RETURNING * INTO v_set;
    END IF;

    IF r.creative_v2_id IS NOT NULL THEN
      SELECT * INTO v_creative FROM public.ad_creatives_v2 WHERE id = r.creative_v2_id;
    END IF;
    IF v_creative.id IS NULL THEN
      INSERT INTO public.ad_creatives_v2 (
        ad_account_id, created_by, name, format, media_url, headline, body,
        call_to_action, destination_url, status, moderation_status,
        metadata, created_at, updated_at
      ) VALUES (
        v_account.id,
        r.user_id,
        r.title || ' · Creative',
        CASE WHEN r.media_type = 'video' THEN 'video' ELSE 'image' END,
        r.media_url,
        r.title,
        r.description,
        r.call_to_action,
        r.destination_url,
        'ready',
        v_moderation_status,
        jsonb_build_object('backfilled_from_legacy_ad', r.id),
        r.created_at,
        now()
      ) RETURNING * INTO v_creative;
    END IF;

    IF r.delivery_item_v2_id IS NOT NULL THEN
      SELECT * INTO v_delivery FROM public.ad_delivery_items_v2 WHERE id = r.delivery_item_v2_id;
    END IF;
    IF v_delivery.id IS NULL THEN
      INSERT INTO public.ad_delivery_items_v2 (
        ad_account_id, campaign_id, ad_set_id, creative_id, legacy_ad_id,
        name, status, delivery_weight, metadata, created_at, updated_at
      ) VALUES (
        v_account.id,
        v_campaign.id,
        v_set.id,
        v_creative.id,
        r.id,
        r.title,
        v_delivery_status,
        1,
        jsonb_build_object('backfilled_from_legacy_ad', r.id),
        r.created_at,
        now()
      ) RETURNING * INTO v_delivery;
    END IF;

    UPDATE public.ads
    SET ad_account_id = v_account.id,
        campaign_v2_id = v_campaign.id,
        ad_set_v2_id = v_set.id,
        creative_v2_id = v_creative.id,
        delivery_item_v2_id = v_delivery.id,
        updated_at = now()
    WHERE id = r.id;

    -- Clear composite variables before the next row. PL/pgSQL record variables
    -- otherwise keep the previous iteration's values after an empty SELECT.
    v_campaign := NULL;
    v_set := NULL;
    v_creative := NULL;
    v_delivery := NULL;
    v_account := NULL;
  END LOOP;
END;
$$;
