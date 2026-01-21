import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface DailyActivity {
  date: string;
  totalMinutes: number;
  sessions: number;
  pages: { [key: string]: number };
}

export interface ActivitySummary {
  today: number;
  thisWeek: number;
  thisMonth: number;
  thisYear: number;
  averageDaily: number;
  totalSessions: number;
  mostActiveHour: number;
  mostActiveDay: string;
  dailyData: DailyActivity[];
  hourlyDistribution: number[];
  weeklyPattern: { day: string; minutes: number }[];
}

export function useActivityTracking() {
  const { user } = useAuth();
  const [activitySummary, setActivitySummary] = useState<ActivitySummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const sessionStartRef = useRef<Date | null>(null);
  const currentPageRef = useRef<string>('');
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastLogTimeRef = useRef<Date | null>(null);

  // Log activity to database
  const logActivity = useCallback(async (
    page: string,
    durationSeconds: number,
    activityType: string = 'page_view'
  ) => {
    if (!user || durationSeconds < 5) return; // Minimum 5 seconds

    try {
      await supabase.from('user_activity_logs').insert({
        user_id: user.id,
        page,
        duration_seconds: Math.round(durationSeconds),
        activity_type: activityType,
        content_category: getCategoryFromPage(page),
      });
    } catch (error) {
      console.error('Failed to log activity:', error);
    }
  }, [user]);

  // Get category from page path
  const getCategoryFromPage = (page: string): string => {
    if (page.includes('/home')) return 'feed';
    if (page.includes('/messages')) return 'messaging';
    if (page.includes('/videos')) return 'videos';
    if (page.includes('/discover')) return 'discovery';
    if (page.includes('/profile')) return 'profile';
    if (page.includes('/marketplace')) return 'shopping';
    if (page.includes('/map')) return 'maps';
    if (page.includes('/settings')) return 'settings';
    if (page.includes('/ai')) return 'ai';
    if (page.includes('/create')) return 'creation';
    return 'other';
  };

  // Start tracking session
  const startSession = useCallback((page: string) => {
    if (sessionStartRef.current && currentPageRef.current) {
      // Log previous page time
      const duration = (new Date().getTime() - sessionStartRef.current.getTime()) / 1000;
      logActivity(currentPageRef.current, duration);
    }

    sessionStartRef.current = new Date();
    currentPageRef.current = page;
    lastLogTimeRef.current = new Date();
  }, [logActivity]);

  // Track page change
  const trackPageChange = useCallback((newPage: string) => {
    if (currentPageRef.current === newPage) return;
    
    if (sessionStartRef.current && currentPageRef.current) {
      const duration = (new Date().getTime() - sessionStartRef.current.getTime()) / 1000;
      logActivity(currentPageRef.current, duration);
    }

    sessionStartRef.current = new Date();
    currentPageRef.current = newPage;
  }, [logActivity]);

  // End session
  const endSession = useCallback(() => {
    if (sessionStartRef.current && currentPageRef.current) {
      const duration = (new Date().getTime() - sessionStartRef.current.getTime()) / 1000;
      logActivity(currentPageRef.current, duration, 'session_end');
    }
    sessionStartRef.current = null;
  }, [logActivity]);

  // Fetch activity summary
  const fetchActivitySummary = useCallback(async () => {
    if (!user) return;

    setIsLoading(true);
    try {
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const weekStart = new Date(todayStart);
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const yearStart = new Date(now.getFullYear(), 0, 1);

      // Fetch all activity logs for the year
      const { data: logs, error } = await supabase
        .from('user_activity_logs')
        .select('*')
        .eq('user_id', user.id)
        .gte('created_at', yearStart.toISOString())
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Calculate summaries
      let today = 0;
      let thisWeek = 0;
      let thisMonth = 0;
      let thisYear = 0;
      const hourlyDistribution = new Array(24).fill(0);
      const dailyMap: { [key: string]: DailyActivity } = {};
      const dayOfWeekMinutes: { [key: number]: number } = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };

      (logs || []).forEach(log => {
        const logDate = new Date(log.created_at);
        const seconds = log.duration_seconds || 0;
        const minutes = seconds / 60;
        const dateKey = logDate.toISOString().split('T')[0];
        const hour = logDate.getHours();
        const dayOfWeek = logDate.getDay();

        // Aggregate by period
        thisYear += minutes;
        if (logDate >= monthStart) thisMonth += minutes;
        if (logDate >= weekStart) thisWeek += minutes;
        if (logDate >= todayStart) today += minutes;

        // Hourly distribution
        hourlyDistribution[hour] += minutes;

        // Day of week
        dayOfWeekMinutes[dayOfWeek] += minutes;

        // Daily breakdown
        if (!dailyMap[dateKey]) {
          dailyMap[dateKey] = {
            date: dateKey,
            totalMinutes: 0,
            sessions: 0,
            pages: {},
          };
        }
        dailyMap[dateKey].totalMinutes += minutes;
        dailyMap[dateKey].sessions += 1;
        dailyMap[dateKey].pages[log.page] = (dailyMap[dateKey].pages[log.page] || 0) + minutes;
      });

      // Find most active hour
      const mostActiveHour = hourlyDistribution.indexOf(Math.max(...hourlyDistribution));

      // Find most active day
      const daysOfWeek = ['Yakshanba', 'Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba'];
      const mostActiveDayIndex = Object.entries(dayOfWeekMinutes)
        .sort(([, a], [, b]) => b - a)[0][0];
      const mostActiveDay = daysOfWeek[parseInt(mostActiveDayIndex)];

      // Calculate average daily
      const daysWithActivity = Object.keys(dailyMap).length;
      const averageDaily = daysWithActivity > 0 ? thisYear / daysWithActivity : 0;

      // Weekly pattern
      const weeklyPattern = daysOfWeek.map((day, index) => ({
        day: day.substring(0, 3),
        minutes: dayOfWeekMinutes[index],
      }));

      // Daily data sorted by date (last 30 days)
      const dailyData = Object.values(dailyMap)
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 30);

      setActivitySummary({
        today: Math.round(today),
        thisWeek: Math.round(thisWeek),
        thisMonth: Math.round(thisMonth),
        thisYear: Math.round(thisYear),
        averageDaily: Math.round(averageDaily),
        totalSessions: logs?.length || 0,
        mostActiveHour,
        mostActiveDay,
        dailyData,
        hourlyDistribution,
        weeklyPattern,
      });
    } catch (error) {
      console.error('Failed to fetch activity summary:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  // Periodic logging (every 30 seconds while active)
  useEffect(() => {
    if (!user) return;

    intervalRef.current = setInterval(() => {
      if (sessionStartRef.current && lastLogTimeRef.current) {
        const now = new Date();
        const duration = (now.getTime() - lastLogTimeRef.current.getTime()) / 1000;
        
        if (duration >= 30) {
          logActivity(currentPageRef.current, duration, 'heartbeat');
          lastLogTimeRef.current = now;
        }
      }
    }, 30000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [user, logActivity]);

  // Handle visibility change (tab focus/blur)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        endSession();
      } else if (currentPageRef.current) {
        startSession(currentPageRef.current);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [startSession, endSession]);

  // Handle beforeunload
  useEffect(() => {
    const handleBeforeUnload = () => {
      endSession();
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [endSession]);

  // Initial fetch
  useEffect(() => {
    fetchActivitySummary();
  }, [fetchActivitySummary]);

  return {
    activitySummary,
    isLoading,
    startSession,
    trackPageChange,
    endSession,
    refreshSummary: fetchActivitySummary,
  };
}
