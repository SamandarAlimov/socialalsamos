-- Ads Delivery V2
--
-- Goal: move Alsamos ads away from a blind "every N posts" model toward a
-- platform-grade delivery system with server-side candidate eligibility,
-- frequency caps, user feedback, deduplicated delivery events and configurable
-- placement policy.
--
-- This migration is additive. Existing public.ads / ad_impressions / ad_clicks /
-- ad_reach remain the compatibility source used by the current UI.

CREATE TABLE IF NOT EXISTS public.ad_delivery_config (
  placement text PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT true,
  min_session_seconds integer NOT NULL DEFAULT 0 CHECK (min_session_seconds >= 0),
  min_organic_before_first integer NOT NULL DEFAULT 0 CHECK (min_organic_before_first >= 0),
  min_organic_gap integer NOT NULL DEFAULT 0 CHECK (min_organic_gap >= 0),
  min_time_gap_seconds integer NOT NULL DEFAULT 0 CHECK (min_time_gap_seconds >= 0),
  session_cap integer NOT NULL DEFAULT 1 CHECK (session_cap >= 0),
  daily_cap integer NOT NULL DEFAULT 3 CHECK (daily_cap >= 0),
  same_ad_daily_cap integer NOT NULL DEFAULT 1 CHECK (same_ad_daily_cap >= 0),
  same_ad_gap_seconds integer NOT NULL DEFAULT 1800 CHECK (same_ad_gap_seconds >= 0),
  hide_cooldown_seconds integer NOT NULL DEFAULT 1800 CHECK (hide_cooldown_seconds >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.ad_delivery_config (
  placement,
  enabled,
  min_session_seconds,
  min_organic_before_first,
  min_organic_gap,
  min_time_gap_seconds,
  session_cap,
  daily_cap,
  same_ad_daily_cap,
  same_ad_gap_seconds,
  hide_cooldown_seconds
) VALUES
  ('feed',     true, 45, 10, 12, 180, 2, 5, 2, 2700, 1200),
  ('discover', true, 90,  0,  0, 300, 1, 2, 1, 7200, 1800),
  ('video',    true, 120, 12, 20, 480, 2, 3, 1, 86400, 1800),
  ('story',    true, 120,  8, 12, 300, 2, 3, 1, 7200, 1800),
  ('channel',  true, 180,  0,  0, 600, 1, 2, 1, 14400, 3600)
ON CONFLICT (placement) DO UPDATE SET
  enabled = EXCLUDED.enabled,
  min_session_seconds = EXCLUDED.min_session_seconds,
  min_organic_before_first = EXCLUDED.min_organic_before_first,
  min_organic_gap = EXCLUDED.min_organic_gap,
  min_time_gap_seconds = EXCLUDED.min_time_gap_seconds,
  session_cap = EXCLUDED.session_cap,
  daily_cap = EXCLUDED.daily_cap,
  same_ad_daily_cap = EXCLUDED.same_ad_daily_cap,
  same_ad_gap_seconds = EXCLUDED.same_ad_gap_seconds,
  hide_cooldown_seconds = EXCLUDED.hide_cooldown_seconds,
  updated_at = now();

CREATE TABLE IF NOT EXISTS public.ad_delivery_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key text UNIQUE,
  ad_id uuid NOT NULL REFERENCES public.ads(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  placement text NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('impression', 'click', 'dismiss', 'feedback')),
  session_id text,
  slot_key text,
  device_type text,
  score numeric,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ad_delivery_events_user_time_idx
  ON public.ad_delivery_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ad_delivery_events_ad_time_idx
  ON public.ad_delivery_events(ad_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ad_delivery_events_placement_time_idx
  ON public.ad_delivery_events(placement, created_at DESC);
CREATE INDEX IF NOT EXISTS ad_delivery_events_session_idx
  ON public.ad_delivery_events(session_id, placement, created_at DESC)
  WHERE session_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.ad_user_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  ad_id uuid NOT NULL REFERENCES public.ads(id) ON DELETE CASCADE,
  placement text NOT NULL,
  feedback_type text NOT NULL CHECK (
    feedback_type IN ('hide', 'not_relevant', 'seen_too_often', 'report')
  ),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ad_user_feedback_user_ad_idx
  ON public.ad_user_feedback(user_id, ad_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ad_user_feedback_user_time_idx
  ON public.ad_user_feedback(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.ad_frequency_counters (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  ad_id uuid NOT NULL REFERENCES public.ads(id) ON DELETE CASCADE,
  placement text NOT NULL,
  day date NOT NULL DEFAULT CURRENT_DATE,
  impressions integer NOT NULL DEFAULT 0 CHECK (impressions >= 0),
  clicks integer NOT NULL DEFAULT 0 CHECK (clicks >= 0),
  dismissals integer NOT NULL DEFAULT 0 CHECK (dismissals >= 0),
  first_impression_at timestamptz,
  last_impression_at timestamptz,
  last_click_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, ad_id, placement, day)
);

CREATE INDEX IF NOT EXISTS ad_frequency_counters_user_day_idx
  ON public.ad_frequency_counters(user_id, day, placement);

ALTER TABLE public.ad_delivery_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_delivery_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_user_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_frequency_counters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read ad delivery config" ON public.ad_delivery_config;
CREATE POLICY "Authenticated users can read ad delivery config"
  ON public.ad_delivery_config FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Users can read their ad feedback" ON public.ad_user_feedback;
CREATE POLICY "Users can read their ad feedback"
  ON public.ad_user_feedback FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can add their ad feedback" ON public.ad_user_feedback;
CREATE POLICY "Users can add their ad feedback"
  ON public.ad_user_feedback FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

GRANT SELECT ON public.ad_delivery_config TO authenticated;
GRANT SELECT, INSERT ON public.ad_user_feedback TO authenticated;

-- Returns a ranked candidate pool. Timing/organic-content gates stay in the
-- client policy for now so an ad fetch at page load does not permanently lose
-- later opportunities. Server-side daily/session/same-ad fatigue still applies.
CREATE OR REPLACE FUNCTION public.get_eligible_ads_v2(
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
    SELECT *
    FROM public.ad_delivery_config
    WHERE placement = p_placement
      AND enabled = true
    LIMIT 1
  ),
  context AS (
    SELECT
      NULLIF(lower(trim(p_context->>'country')), '') AS country,
      NULLIF(lower(trim(p_context->>'gender')), '') AS gender,
      CASE
        WHEN COALESCE(p_context->>'age', '') ~ '^[0-9]{1,3}$'
          THEN (p_context->>'age')::integer
        ELSE NULL
      END AS age,
      CASE
        WHEN jsonb_typeof(p_context->'interests') = 'array'
          THEN ARRAY(SELECT lower(value) FROM jsonb_array_elements_text(p_context->'interests'))
        ELSE ARRAY[]::text[]
      END AS interests
  ),
  candidates AS (
    SELECT
      a.id,
      a.created_at,
      (
        (GREATEST(COALESCE(a.bid_amount, 0), 0.01) + 0.01)
        * (1 + LEAST(
            0.50,
            COALESCE(a.clicks_count, 0)::numeric
              / GREATEST(COALESCE(a.impressions_count, 0), 20)::numeric
              * 5
          ))
        / (1 + COALESCE(fc.impressions, 0) * 0.75)
      ) AS delivery_score
    FROM public.ads a
    CROSS JOIN context c
    LEFT JOIN public.ad_frequency_counters fc
      ON fc.user_id = auth.uid()
     AND fc.ad_id = a.id
     AND fc.placement = p_placement
     AND fc.day = CURRENT_DATE
    CROSS JOIN cfg
    WHERE a.status = 'active'
      AND a.user_id IS DISTINCT FROM auth.uid()
      AND (a.start_date IS NULL OR a.start_date <= now())
      AND (a.end_date IS NULL OR a.end_date >= now())
      AND COALESCE(a.spent, 0) < COALESCE(NULLIF(a.budget, 0), 1e18)
      AND (
        (p_placement = 'story' AND a.ad_type IN ('story', 'both'))
        OR
        (p_placement <> 'story' AND a.ad_type IN ('feed', 'both'))
      )
      AND (
        COALESCE(cardinality(a.target_countries), 0) = 0
        OR c.country IS NULL
        OR EXISTS (
          SELECT 1 FROM unnest(a.target_countries) country_value
          WHERE lower(country_value) = c.country
        )
      )
      AND (a.target_gender IS NULL OR c.gender IS NULL OR lower(a.target_gender) = c.gender)
      AND (a.target_age_min IS NULL OR c.age IS NULL OR c.age >= a.target_age_min)
      AND (a.target_age_max IS NULL OR c.age IS NULL OR c.age <= a.target_age_max)
      AND (
        COALESCE(cardinality(a.target_interests), 0) = 0
        OR cardinality(c.interests) = 0
        OR EXISTS (
          SELECT 1
          FROM unnest(a.target_interests) interest_value
          WHERE lower(interest_value) = ANY(c.interests)
        )
      )
      AND COALESCE(fc.impressions, 0) < cfg.same_ad_daily_cap
      AND (
        fc.last_impression_at IS NULL
        OR fc.last_impression_at < now() - make_interval(secs => cfg.same_ad_gap_seconds)
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.ad_user_feedback f
        WHERE f.user_id = auth.uid()
          AND f.ad_id = a.id
          AND (
            (f.feedback_type IN ('hide', 'not_relevant') AND f.created_at > now() - interval '30 days')
            OR (f.feedback_type = 'seen_too_often' AND f.created_at > now() - interval '7 days')
            OR (f.feedback_type = 'report')
          )
      )
      AND (
        auth.uid() IS NULL
        OR (
          SELECT count(*)
          FROM public.ad_delivery_events e
          WHERE e.user_id = auth.uid()
            AND e.placement = p_placement
            AND e.event_type = 'impression'
            AND e.created_at >= CURRENT_DATE
        ) < cfg.daily_cap
      )
      AND (
        auth.uid() IS NULL
        OR p_session_id IS NULL
        OR (
          SELECT count(*)
          FROM public.ad_delivery_events e
          WHERE e.user_id = auth.uid()
            AND e.placement = p_placement
            AND e.event_type = 'impression'
            AND e.session_id = p_session_id
        ) < cfg.session_cap
      )
      AND (
        auth.uid() IS NULL
        OR NOT EXISTS (
          SELECT 1
          FROM public.ad_delivery_events e
          WHERE e.user_id = auth.uid()
            AND e.placement = p_placement
            AND e.event_type = 'impression'
            AND e.created_at > now() - make_interval(secs => cfg.min_time_gap_seconds)
        )
      )
  )
  SELECT a.*
  FROM candidates c
  JOIN public.ads a ON a.id = c.id
  ORDER BY c.delivery_score DESC, c.created_at DESC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 6), 20));
$$;

-- Compatibility-aware event recorder. It writes the new delivery event first;
-- only a newly accepted event is mirrored into legacy impression/click tables.
CREATE OR REPLACE FUNCTION public.record_ad_delivery_event_v2(
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
BEGIN
  IF p_event_type NOT IN ('impression', 'click', 'dismiss', 'feedback') THEN
    RAISE EXCEPTION 'unsupported_ad_event';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.ads WHERE id = p_ad_id AND status = 'active') THEN
    RETURN false;
  END IF;

  INSERT INTO public.ad_delivery_events (
    event_key,
    ad_id,
    user_id,
    placement,
    event_type,
    session_id,
    slot_key,
    device_type,
    score,
    metadata
  ) VALUES (
    p_event_key,
    p_ad_id,
    v_user_id,
    p_placement,
    p_event_type,
    p_session_id,
    p_slot_key,
    p_device_type,
    p_score,
    COALESCE(p_metadata, '{}'::jsonb)
  )
  ON CONFLICT (event_key) DO NOTHING
  RETURNING id INTO v_event_id;

  IF v_event_id IS NULL THEN
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
        user_id,
        ad_id,
        placement,
        day,
        impressions,
        first_impression_at,
        last_impression_at,
        updated_at
      ) VALUES (
        v_user_id,
        p_ad_id,
        p_placement,
        CURRENT_DATE,
        1,
        now(),
        now(),
        now()
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
        user_id,
        ad_id,
        placement,
        day,
        clicks,
        last_click_at,
        updated_at
      ) VALUES (
        v_user_id,
        p_ad_id,
        p_placement,
        CURRENT_DATE,
        1,
        now(),
        now()
      )
      ON CONFLICT (user_id, ad_id, placement, day) DO UPDATE SET
        clicks = public.ad_frequency_counters.clicks + 1,
        last_click_at = EXCLUDED.last_click_at,
        updated_at = now();
    END IF;
  ELSIF p_event_type = 'dismiss' AND v_user_id IS NOT NULL THEN
    INSERT INTO public.ad_frequency_counters (
      user_id,
      ad_id,
      placement,
      day,
      dismissals,
      updated_at
    ) VALUES (
      v_user_id,
      p_ad_id,
      p_placement,
      CURRENT_DATE,
      1,
      now()
    )
    ON CONFLICT (user_id, ad_id, placement, day) DO UPDATE SET
      dismissals = public.ad_frequency_counters.dismissals + 1,
      updated_at = now();
  END IF;

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_ad_feedback_v2(
  p_ad_id uuid,
  p_placement text,
  p_feedback_type text,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_feedback_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required';
  END IF;

  IF p_feedback_type NOT IN ('hide', 'not_relevant', 'seen_too_often', 'report') THEN
    RAISE EXCEPTION 'unsupported_feedback_type';
  END IF;

  INSERT INTO public.ad_user_feedback (
    user_id,
    ad_id,
    placement,
    feedback_type,
    metadata
  ) VALUES (
    v_user_id,
    p_ad_id,
    p_placement,
    p_feedback_type,
    COALESCE(p_metadata, '{}'::jsonb)
  )
  RETURNING id INTO v_feedback_id;

  PERFORM public.record_ad_delivery_event_v2(
    p_ad_id,
    p_placement,
    CASE WHEN p_feedback_type = 'hide' THEN 'dismiss' ELSE 'feedback' END,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    jsonb_build_object('feedback_type', p_feedback_type) || COALESCE(p_metadata, '{}'::jsonb)
  );

  RETURN v_feedback_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_eligible_ads_v2(text, integer, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_ad_delivery_event_v2(uuid, text, text, text, text, text, text, numeric, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_ad_feedback_v2(uuid, text, text, jsonb) TO authenticated;
