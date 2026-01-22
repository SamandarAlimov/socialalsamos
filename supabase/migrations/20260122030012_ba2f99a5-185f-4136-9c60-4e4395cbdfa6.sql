-- Add country and birth_date columns to profiles for demographics
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS country TEXT,
ADD COLUMN IF NOT EXISTS birth_date DATE;

-- Create admin analytics view for aggregated stats
CREATE OR REPLACE VIEW admin_user_stats AS
SELECT 
  COUNT(DISTINCT id) as total_users,
  COUNT(DISTINCT CASE WHEN is_online = true THEN id END) as online_users,
  COUNT(DISTINCT CASE WHEN created_at > NOW() - INTERVAL '24 hours' THEN id END) as new_users_24h,
  COUNT(DISTINCT CASE WHEN created_at > NOW() - INTERVAL '7 days' THEN id END) as new_users_7d,
  COUNT(DISTINCT CASE WHEN is_verified = true THEN id END) as verified_users
FROM public.profiles;

-- Create RLS policy for admin analytics view access
-- Note: Views inherit table RLS, so we need a function to get stats securely

CREATE OR REPLACE FUNCTION public.get_admin_platform_stats()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSON;
BEGIN
  -- Check if user is admin
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RETURN NULL;
  END IF;

  SELECT json_build_object(
    'total_users', (SELECT COUNT(*) FROM profiles),
    'online_users', (SELECT COUNT(*) FROM profiles WHERE is_online = true),
    'new_users_24h', (SELECT COUNT(*) FROM profiles WHERE created_at > NOW() - INTERVAL '24 hours'),
    'new_users_7d', (SELECT COUNT(*) FROM profiles WHERE created_at > NOW() - INTERVAL '7 days'),
    'new_users_30d', (SELECT COUNT(*) FROM profiles WHERE created_at > NOW() - INTERVAL '30 days'),
    'verified_users', (SELECT COUNT(*) FROM profiles WHERE is_verified = true),
    'total_posts', (SELECT COUNT(*) FROM posts),
    'posts_24h', (SELECT COUNT(*) FROM posts WHERE created_at > NOW() - INTERVAL '24 hours'),
    'total_messages', (SELECT COUNT(*) FROM messages),
    'messages_24h', (SELECT COUNT(*) FROM messages WHERE created_at > NOW() - INTERVAL '24 hours')
  ) INTO result;

  RETURN result;
END;
$$;

-- Function to get hourly activity distribution
CREATE OR REPLACE FUNCTION public.get_admin_hourly_activity()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSON;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RETURN NULL;
  END IF;

  SELECT json_agg(row_to_json(t))
  FROM (
    SELECT 
      EXTRACT(HOUR FROM created_at) as hour,
      COUNT(*) as activity_count,
      SUM(duration_seconds) as total_duration
    FROM user_activity_logs
    WHERE created_at > NOW() - INTERVAL '7 days'
    GROUP BY EXTRACT(HOUR FROM created_at)
    ORDER BY hour
  ) t INTO result;

  RETURN COALESCE(result, '[]'::json);
END;
$$;

-- Function to get page/feature usage stats
CREATE OR REPLACE FUNCTION public.get_admin_page_stats()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSON;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RETURN NULL;
  END IF;

  SELECT json_agg(row_to_json(t))
  FROM (
    SELECT 
      page,
      COUNT(*) as visit_count,
      COUNT(DISTINCT user_id) as unique_users,
      SUM(duration_seconds) as total_duration,
      AVG(duration_seconds) as avg_duration
    FROM user_activity_logs
    WHERE created_at > NOW() - INTERVAL '30 days'
    AND page IS NOT NULL
    GROUP BY page
    ORDER BY visit_count DESC
    LIMIT 20
  ) t INTO result;

  RETURN COALESCE(result, '[]'::json);
END;
$$;

-- Function to get country distribution
CREATE OR REPLACE FUNCTION public.get_admin_country_stats()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSON;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RETURN NULL;
  END IF;

  SELECT json_agg(row_to_json(t))
  FROM (
    SELECT 
      COALESCE(country, 'Unknown') as country,
      COUNT(*) as user_count
    FROM profiles
    GROUP BY country
    ORDER BY user_count DESC
    LIMIT 20
  ) t INTO result;

  RETURN COALESCE(result, '[]'::json);
END;
$$;

-- Function to get age distribution
CREATE OR REPLACE FUNCTION public.get_admin_age_stats()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSON;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RETURN NULL;
  END IF;

  SELECT json_agg(row_to_json(t))
  FROM (
    SELECT 
      CASE 
        WHEN birth_date IS NULL THEN 'Unknown'
        WHEN EXTRACT(YEAR FROM AGE(birth_date)) < 18 THEN '13-17'
        WHEN EXTRACT(YEAR FROM AGE(birth_date)) < 25 THEN '18-24'
        WHEN EXTRACT(YEAR FROM AGE(birth_date)) < 35 THEN '25-34'
        WHEN EXTRACT(YEAR FROM AGE(birth_date)) < 45 THEN '35-44'
        WHEN EXTRACT(YEAR FROM AGE(birth_date)) < 55 THEN '45-54'
        ELSE '55+'
      END as age_group,
      COUNT(*) as user_count
    FROM profiles
    GROUP BY 
      CASE 
        WHEN birth_date IS NULL THEN 'Unknown'
        WHEN EXTRACT(YEAR FROM AGE(birth_date)) < 18 THEN '13-17'
        WHEN EXTRACT(YEAR FROM AGE(birth_date)) < 25 THEN '18-24'
        WHEN EXTRACT(YEAR FROM AGE(birth_date)) < 35 THEN '25-34'
        WHEN EXTRACT(YEAR FROM AGE(birth_date)) < 45 THEN '35-44'
        WHEN EXTRACT(YEAR FROM AGE(birth_date)) < 55 THEN '45-54'
        ELSE '55+'
      END
    ORDER BY 
      CASE age_group
        WHEN '13-17' THEN 1
        WHEN '18-24' THEN 2
        WHEN '25-34' THEN 3
        WHEN '35-44' THEN 4
        WHEN '45-54' THEN 5
        WHEN '55+' THEN 6
        ELSE 7
      END
  ) t INTO result;

  RETURN COALESCE(result, '[]'::json);
END;
$$;

-- Function to get daily active users trend
CREATE OR REPLACE FUNCTION public.get_admin_dau_trend()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSON;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RETURN NULL;
  END IF;

  SELECT json_agg(row_to_json(t))
  FROM (
    SELECT 
      DATE(created_at) as date,
      COUNT(DISTINCT user_id) as dau
    FROM user_activity_logs
    WHERE created_at > NOW() - INTERVAL '30 days'
    GROUP BY DATE(created_at)
    ORDER BY date
  ) t INTO result;

  RETURN COALESCE(result, '[]'::json);
END;
$$;

-- Function to get weekly activity by day of week
CREATE OR REPLACE FUNCTION public.get_admin_weekly_pattern()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSON;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RETURN NULL;
  END IF;

  SELECT json_agg(row_to_json(t))
  FROM (
    SELECT 
      EXTRACT(DOW FROM created_at) as day_of_week,
      COUNT(*) as activity_count,
      COUNT(DISTINCT user_id) as unique_users
    FROM user_activity_logs
    WHERE created_at > NOW() - INTERVAL '30 days'
    GROUP BY EXTRACT(DOW FROM created_at)
    ORDER BY day_of_week
  ) t INTO result;

  RETURN COALESCE(result, '[]'::json);
END;
$$;