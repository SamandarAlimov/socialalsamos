import { useState, useEffect, useCallback } from 'react';
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

interface CountryStats {
  country: string;
  user_count: number;
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

export function useAdminAnalytics() {
  const [platformStats, setPlatformStats] = useState<PlatformStats | null>(null);
  const [hourlyActivity, setHourlyActivity] = useState<HourlyActivity[]>([]);
  const [pageStats, setPageStats] = useState<PageStats[]>([]);
  const [countryStats, setCountryStats] = useState<CountryStats[]>([]);
  const [ageStats, setAgeStats] = useState<AgeStats[]>([]);
  const [dauTrend, setDauTrend] = useState<DAUTrend[]>([]);
  const [weeklyPattern, setWeeklyPattern] = useState<WeeklyPattern[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchAllAnalytics = useCallback(async () => {
    setIsLoading(true);
    try {
      const [
        statsResult,
        hourlyResult,
        pageResult,
        countryResult,
        ageResult,
        dauResult,
        weeklyResult
      ] = await Promise.all([
        supabase.rpc('get_admin_platform_stats'),
        supabase.rpc('get_admin_hourly_activity'),
        supabase.rpc('get_admin_page_stats'),
        supabase.rpc('get_admin_country_stats'),
        supabase.rpc('get_admin_age_stats'),
        supabase.rpc('get_admin_dau_trend'),
        supabase.rpc('get_admin_weekly_pattern')
      ]);

      if (statsResult.data) setPlatformStats(statsResult.data as unknown as PlatformStats);
      if (hourlyResult.data) setHourlyActivity((hourlyResult.data as unknown as HourlyActivity[]) || []);
      if (pageResult.data) setPageStats((pageResult.data as unknown as PageStats[]) || []);
      if (countryResult.data) setCountryStats((countryResult.data as unknown as CountryStats[]) || []);
      if (ageResult.data) setAgeStats((ageResult.data as unknown as AgeStats[]) || []);
      if (dauResult.data) setDauTrend((dauResult.data as unknown as DAUTrend[]) || []);
      if (weeklyResult.data) setWeeklyPattern((weeklyResult.data as unknown as WeeklyPattern[]) || []);
    } catch (error) {
      console.error('Error fetching admin analytics:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAllAnalytics();
  }, [fetchAllAnalytics]);

  return {
    platformStats,
    hourlyActivity,
    pageStats,
    countryStats,
    ageStats,
    dauTrend,
    weeklyPattern,
    isLoading,
    refetch: fetchAllAnalytics
  };
}
