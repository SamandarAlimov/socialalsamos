import { useCallback, useEffect, useState } from 'react';

import { supabase } from '@/integrations/supabase/client';

interface PlatformStats {
  total_users: number;
  online_users: number;
  new_users_24h: number;
  new_users_7d: number;
  new_users_30d: number;
  verified_users: number;
  total_posts: number;
  posts_24h: number;
  total_messages: number;
  messages_24h: number;
}

interface HourlyActivity {
  hour: number;
  activity_count: number;
  total_duration: number;
}

interface PageStats {
  page: string;
  visit_count: number;
  unique_users: number;
  total_duration: number;
  avg_duration: number;
}

export interface CountryStats {
  country_code: string | null;
  user_count: number;
  avg_confidence: number;
  sources: Record<string, number>;
}

interface AgeStats {
  age_group: string;
  user_count: number;
}

interface DAUTrend {
  date: string;
  dau: number;
}

interface WeeklyPattern {
  day_of_week: number;
  activity_count: number;
  unique_users: number;
}

interface AdminAnalyticsSnapshot {
  platform_stats: PlatformStats;
  hourly_activity: HourlyActivity[];
  page_stats: PageStats[];
  country_stats: unknown[];
  age_stats: AgeStats[];
  dau_trend: DAUTrend[];
  weekly_pattern: WeeklyPattern[];
  generated_at?: string;
}

export function useAdminAnalytics() {
  const [platformStats, setPlatformStats] = useState<PlatformStats | null>(null);
  const [hourlyActivity, setHourlyActivity] = useState<HourlyActivity[]>([]);
  const [pageStats, setPageStats] = useState<PageStats[]>([]);
  const [countryStats, setCountryStats] = useState<CountryStats[]>([]);
  const [ageStats, setAgeStats] = useState<AgeStats[]>([]);
  const [dauTrend, setDauTrend] = useState<DAUTrend[]>([]);
  const [weeklyPattern, setWeeklyPattern] = useState<WeeklyPattern[]>([]);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchAllAnalytics = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const [snapshotResult, countryResult] = await Promise.all([
        (supabase as any).rpc('admin_analytics_snapshot_v1'),
        (supabase as any).rpc('admin_country_stats_v2'),
      ]);

      if (snapshotResult.error) throw snapshotResult.error;
      if (countryResult.error) throw countryResult.error;
      if (!snapshotResult.data || typeof snapshotResult.data !== 'object') {
        throw new Error('Analytics snapshot bo‘sh qaytdi');
      }

      const snapshot = snapshotResult.data as AdminAnalyticsSnapshot;
      setPlatformStats(snapshot.platform_stats || null);
      setHourlyActivity(snapshot.hourly_activity || []);
      setPageStats(snapshot.page_stats || []);
      setCountryStats(
        Array.isArray(countryResult.data)
          ? countryResult.data.map((item: any) => ({
              country_code: item?.country_code ? String(item.country_code).toUpperCase() : null,
              user_count: Number(item?.user_count || 0),
              avg_confidence: Number(item?.avg_confidence || 0),
              sources: item?.sources && typeof item.sources === 'object' ? item.sources : {},
            }))
          : [],
      );
      setAgeStats(snapshot.age_stats || []);
      setDauTrend(snapshot.dau_trend || []);
      setWeeklyPattern(snapshot.weekly_pattern || []);
      setGeneratedAt(snapshot.generated_at || null);
    } catch (caught: any) {
      console.error('Error fetching admin analytics:', caught);
      setError(caught?.message || 'Admin analitikasini yuklab bo‘lmadi');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchAllAnalytics();
  }, [fetchAllAnalytics]);

  return {
    platformStats,
    hourlyActivity,
    pageStats,
    countryStats,
    ageStats,
    dauTrend,
    weeklyPattern,
    generatedAt,
    error,
    isLoading,
    refetch: fetchAllAnalytics,
  };
}
