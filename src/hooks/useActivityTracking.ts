import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/db';

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

const MIN_SEGMENT_SECONDS = 5;
const HEARTBEAT_SECONDS = 30;
const SESSION_IDLE_RESET_MS = 30 * 60 * 1000;

function createTelemetryId(prefix: string) {
  const randomId = typeof globalThis.crypto?.randomUUID === 'function'
    ? globalThis.crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${randomId}`;
}

function contributesLegacyDuration(log: any) {
  const schemaVersion = Number(log?.schema_version ?? 1);
  const duration = Math.max(0, Number(log?.duration_seconds ?? 0));
  return schemaVersion >= 2 || log?.activity_type === 'heartbeat' || duration < 30;
}

export function useActivityTracking() {
  const { user } = useAuth();
  const [activitySummary, setActivitySummary] = useState<ActivitySummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const currentPageRef = useRef<string>('');
  const segmentStartedAtRef = useRef<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionIdRef = useRef<string>(createTelemetryId('session'));
  const eventCounterRef = useRef(0);
  const hiddenAtRef = useRef<number | null>(null);

  const resetLogicalSession = useCallback(() => {
    sessionIdRef.current = createTelemetryId('session');
    eventCounterRef.current = 0;
  }, []);

  useEffect(() => {
    resetLogicalSession();
    currentPageRef.current = '';
    segmentStartedAtRef.current = null;
    hiddenAtRef.current = null;
  }, [resetLogicalSession, user?.id]);

  /**
   * Flush exactly one non-overlapping activity segment.
   *
   * The legacy tracker repeatedly wrote a 30s heartbeat and later wrote the
   * entire page lifetime again on route change/session end. That inflated time
   * spent and admin analytics. v2 advances the segment boundary before the
   * network call, so overlapping flushes cannot double count the same seconds.
   */
  const flushSegment = useCallback(async (
    activityType: 'heartbeat' | 'page_view' | 'session_end',
    stopAfterFlush = false,
  ) => {
    if (!user || !currentPageRef.current || segmentStartedAtRef.current == null) return;

    const now = Date.now();
    const startedAt = segmentStartedAtRef.current;
    const durationSeconds = Math.floor((now - startedAt) / 1000);

    // Advance synchronously before awaiting the RPC so concurrent visibility,
    // route and heartbeat events can never submit the same interval twice.
    segmentStartedAtRef.current = stopAfterFlush ? null : now;

    if (durationSeconds < MIN_SEGMENT_SECONDS) return;

    eventCounterRef.current += 1;
    const clientEventId = `${sessionIdRef.current}-${eventCounterRef.current}-${now.toString(36)}`;

    const { error } = await db.rpc('track_user_activity_v2', {
      p_session_id: sessionIdRef.current,
      p_client_event_id: clientEventId,
      p_page: currentPageRef.current,
      p_duration_seconds: durationSeconds,
      p_activity_type: activityType,
    });

    if (error) {
      console.warn('Activity telemetry segment was not recorded:', error);
    }
  }, [user]);

  const startSession = useCallback((page: string) => {
    if (!user) return;

    const normalizedPage = page || '/';
    if (currentPageRef.current && currentPageRef.current !== normalizedPage) {
      void flushSegment('page_view', true);
    }

    currentPageRef.current = normalizedPage;
    if (typeof document === 'undefined' || !document.hidden) {
      segmentStartedAtRef.current ??= Date.now();
    }
  }, [flushSegment, user]);

  const trackPageChange = useCallback((newPage: string) => {
    if (!user) return;

    const normalizedPage = newPage || '/';
    if (currentPageRef.current === normalizedPage) {
      if ((typeof document === 'undefined' || !document.hidden) && segmentStartedAtRef.current == null) {
        segmentStartedAtRef.current = Date.now();
      }
      return;
    }

    if (currentPageRef.current) {
      void flushSegment('page_view', true);
    }

    currentPageRef.current = normalizedPage;
    if (typeof document === 'undefined' || !document.hidden) {
      segmentStartedAtRef.current = Date.now();
    }
  }, [flushSegment, user]);

  const endSession = useCallback(() => {
    void flushSegment('session_end', true);
  }, [flushSegment]);

  const fetchActivitySummary = useCallback(async () => {
    if (!user) {
      setActivitySummary(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const weekStart = new Date(todayStart);
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const yearStart = new Date(now.getFullYear(), 0, 1);

      const { data: logs, error } = await db
        .from('user_activity_logs')
        .select('id, activity_type, page, duration_seconds, created_at, schema_version, session_id')
        .eq('user_id', user.id)
        .gte('created_at', yearStart.toISOString())
        .order('created_at', { ascending: false });

      if (error) throw error;

      let today = 0;
      let thisWeek = 0;
      let thisMonth = 0;
      let thisYear = 0;
      const hourlyDistribution = new Array(24).fill(0) as number[];
      const dailyMap: { [key: string]: DailyActivity } = {};
      const dailySessionKeys: Record<string, Set<string>> = {};
      const globalSessionKeys = new Set<string>();
      const dayOfWeekMinutes: { [key: number]: number } = {
        0: 0,
        1: 0,
        2: 0,
        3: 0,
        4: 0,
        5: 0,
        6: 0,
      };

      (logs || []).forEach((log: any, index: number) => {
        const logDate = new Date(log.created_at);
        if (Number.isNaN(logDate.getTime())) return;

        const schemaVersion = Number(log.schema_version ?? 1);
        const seconds = Math.max(0, Number(log.duration_seconds || 0));
        const dateKey = logDate.toISOString().split('T')[0];
        const hour = logDate.getHours();
        const dayOfWeek = logDate.getDay();
        const page = String(log.page || '/');

        if (!dailyMap[dateKey]) {
          dailyMap[dateKey] = {
            date: dateKey,
            totalMinutes: 0,
            sessions: 0,
            pages: {},
          };
          dailySessionKeys[dateKey] = new Set<string>();
        }

        // v2 rows have a real logical session id. For legacy data, every
        // non-heartbeat terminal/page row is the best available visit proxy.
        const sessionKey = schemaVersion >= 2 && log.session_id
          ? `v2:${log.session_id}`
          : log.activity_type !== 'heartbeat'
            ? `legacy:${log.id || index}`
            : null;

        if (sessionKey) {
          globalSessionKeys.add(sessionKey);
          dailySessionKeys[dateKey].add(sessionKey);
        }

        if (!contributesLegacyDuration(log)) return;

        const minutes = seconds / 60;
        thisYear += minutes;
        if (logDate >= monthStart) thisMonth += minutes;
        if (logDate >= weekStart) thisWeek += minutes;
        if (logDate >= todayStart) today += minutes;

        hourlyDistribution[hour] += minutes;
        dayOfWeekMinutes[dayOfWeek] += minutes;
        dailyMap[dateKey].totalMinutes += minutes;
        dailyMap[dateKey].pages[page] = (dailyMap[dateKey].pages[page] || 0) + minutes;
      });

      Object.entries(dailyMap).forEach(([date, activity]) => {
        activity.sessions = dailySessionKeys[date]?.size || 0;
      });

      const mostActiveHour = hourlyDistribution.indexOf(Math.max(...hourlyDistribution));
      const daysOfWeek = ['Yakshanba', 'Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba'];
      const mostActiveDayIndex = Number(
        Object.entries(dayOfWeekMinutes).sort(([, a], [, b]) => b - a)[0]?.[0] ?? 0,
      );
      const mostActiveDay = daysOfWeek[mostActiveDayIndex];
      const daysWithActivity = Object.values(dailyMap).filter(day => day.totalMinutes > 0).length;
      const averageDaily = daysWithActivity > 0 ? thisYear / daysWithActivity : 0;
      const weeklyPattern = daysOfWeek.map((day, index) => ({
        day: day.substring(0, 3),
        minutes: dayOfWeekMinutes[index],
      }));
      const dailyData = Object.values(dailyMap)
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 30);

      setActivitySummary({
        today: Math.round(today),
        thisWeek: Math.round(thisWeek),
        thisMonth: Math.round(thisMonth),
        thisYear: Math.round(thisYear),
        averageDaily: Math.round(averageDaily),
        totalSessions: globalSessionKeys.size,
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

  useEffect(() => {
    if (!user) return;

    intervalRef.current = setInterval(() => {
      if (
        segmentStartedAtRef.current != null
        && (typeof document === 'undefined' || !document.hidden)
        && Date.now() - segmentStartedAtRef.current >= HEARTBEAT_SECONDS * 1000
      ) {
        void flushSegment('heartbeat');
      }
    }, HEARTBEAT_SECONDS * 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [flushSegment, user]);

  useEffect(() => {
    if (!user || typeof document === 'undefined') return;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        hiddenAtRef.current = Date.now();
        endSession();
        return;
      }

      const hiddenFor = hiddenAtRef.current == null ? 0 : Date.now() - hiddenAtRef.current;
      if (hiddenFor >= SESSION_IDLE_RESET_MS) {
        resetLogicalSession();
      }
      hiddenAtRef.current = null;

      if (currentPageRef.current) {
        segmentStartedAtRef.current = Date.now();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [endSession, resetLogicalSession, user]);

  useEffect(() => {
    if (!user || typeof window === 'undefined') return;

    // This is best-effort. Heartbeats bound unload loss to <30s even if the
    // browser terminates the async request before it completes.
    const handlePageHide = () => endSession();
    window.addEventListener('pagehide', handlePageHide);
    return () => window.removeEventListener('pagehide', handlePageHide);
  }, [endSession, user]);

  useEffect(() => {
    void fetchActivitySummary();
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
