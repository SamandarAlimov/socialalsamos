import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import {
  createAdEventKey,
  getAdRequestContext,
  getAdSessionId,
  rankAdCandidates,
  recordAdFeedbackLocal,
  recordAdvertiserExposure,
  type AdFeedbackType,
} from '@/lib/adDeliveryClient';

export type AdPlacement = 'feed' | 'story' | 'video' | 'discover' | 'channel';

export interface Ad {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  media_url: string;
  media_type: 'image' | 'video';
  destination_url: string | null;
  call_to_action: string;
  ad_type: 'feed' | 'story' | 'both';
  status: 'pending' | 'active' | 'paused' | 'rejected' | 'completed';
  budget: number;
  spent: number;
  daily_budget: number | null;
  bid_amount: number;
  billing_type: 'cpm' | 'cpc';
  target_countries: string[];
  target_age_min: number | null;
  target_age_max: number | null;
  target_gender: string | null;
  target_interests: string[];
  start_date: string | null;
  end_date: string | null;
  impressions_count: number;
  clicks_count: number;
  reach_count: number;
  created_at: string;
  updated_at: string;
  profile?: {
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
    is_verified: boolean;
  };
}

export interface AdCreateInput {
  title: string;
  description?: string;
  media_url: string;
  media_type: 'image' | 'video';
  destination_url?: string;
  call_to_action?: string;
  ad_type: 'feed' | 'story' | 'both';
  budget: number;
  daily_budget?: number;
  bid_amount?: number;
  billing_type?: 'cpm' | 'cpc';
  target_countries?: string[];
  target_age_min?: number;
  target_age_max?: number;
  target_gender?: string;
  target_interests?: string[];
  start_date?: string;
  end_date?: string;
}

async function hydrateAdvertiserProfiles(items: Ad[]): Promise<Ad[]> {
  const userIds = Array.from(new Set(items.map((item) => item.user_id).filter(Boolean)));
  if (!userIds.length) return items;

  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, username, display_name, avatar_url, is_verified')
      .in('id', userIds);

    if (error || !data) return items;

    const byId = new Map(
      data.map((profile) => [
        profile.id,
        {
          username: profile.username,
          display_name: profile.display_name,
          avatar_url: profile.avatar_url,
          is_verified: Boolean(profile.is_verified),
        },
      ]),
    );

    return items.map((item) => ({
      ...item,
      profile: byId.get(item.user_id) || item.profile,
    }));
  } catch {
    return items;
  }
}

function sourceAdType(placement: AdPlacement | 'both') {
  return placement === 'story' ? 'story' : 'feed';
}

/**
 * Fetches a ranked candidate pool for a real placement.
 *
 * Ads Delivery V2 RPC is preferred when the migration is available. Until the
 * production migration is deployed, the hook safely falls back to the legacy
 * ads table and applies local diversity/fatigue ranking. This keeps rollout
 * backwards compatible instead of making the UI depend on a migration flag.
 */
export function useActiveAds(placement: AdPlacement | 'both' = 'feed', limit = 3) {
  const { user } = useAuth();
  const [ads, setAds] = useState<Ad[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const effectivePlacement: AdPlacement = placement === 'both' ? 'feed' : placement;

  const fetchAds = useCallback(async () => {
    setIsLoading(true);
    try {
      const sessionId = getAdSessionId();
      const context = getAdRequestContext();

      // New server-ranked path. Cast keeps generated Supabase types backwards
      // compatible until the new RPC has been generated into database.types.ts.
      const rpcResult = await (supabase as any).rpc('get_eligible_ads_v2', {
        p_placement: effectivePlacement,
        p_limit: Math.max(limit * 3, limit),
        p_session_id: sessionId,
        p_context: context,
      });

      if (!rpcResult?.error && Array.isArray(rpcResult?.data)) {
        const ranked = rankAdCandidates((rpcResult.data || []) as Ad[]).slice(0, limit);
        setAds(await hydrateAdvertiserProfiles(ranked));
        return;
      }

      // Compatibility fallback while Ads Delivery V2 is not deployed yet.
      let query = supabase
        .from('ads')
        .select('*')
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(Math.max(limit * 4, 12));

      if (placement === 'both') {
        query = query.in('ad_type', ['feed', 'story', 'both']);
      } else {
        const type = sourceAdType(placement);
        query = query.or(`ad_type.eq.${type},ad_type.eq.both`);
      }

      const { data, error } = await query;
      if (error) throw error;

      const ranked = rankAdCandidates((data || []) as Ad[]).slice(0, limit);
      setAds(await hydrateAdvertiserProfiles(ranked));
    } catch (error) {
      console.error('Error fetching ads:', error);
      setAds([]);
    } finally {
      setIsLoading(false);
    }
  }, [effectivePlacement, limit, placement]);

  useEffect(() => {
    void fetchAds();
  }, [fetchAds]);

  const trackImpression = useCallback(async (adId: string, eventPlacement: AdPlacement = effectivePlacement) => {
    const deviceType = /Mobile|Android|iPhone/i.test(navigator.userAgent) ? 'mobile' : 'desktop';
    const ad = ads.find((item) => item.id === adId);

    try {
      const result = await (supabase as any).rpc('record_ad_delivery_event_v2', {
        p_ad_id: adId,
        p_placement: eventPlacement,
        p_event_type: 'impression',
        p_session_id: getAdSessionId(),
        p_event_key: createAdEventKey(adId, eventPlacement, 'impression'),
        p_slot_key: null,
        p_device_type: deviceType,
        p_score: null,
        p_metadata: getAdRequestContext(),
      });

      if (!result?.error) {
        if (result?.data !== false) recordAdvertiserExposure(ad?.user_id);
        return;
      }

      await supabase.from('ad_impressions').insert({
        ad_id: adId,
        user_id: user?.id || null,
        placement: eventPlacement,
        device_type: deviceType,
      });

      if (user) {
        await supabase.from('ad_reach').upsert(
          {
            ad_id: adId,
            user_id: user.id,
          },
          { onConflict: 'ad_id,user_id' },
        );
      }

      recordAdvertiserExposure(ad?.user_id);
    } catch (error) {
      console.error('Error tracking impression:', error);
    }
  }, [ads, effectivePlacement, user]);

  const trackClick = useCallback(async (adId: string, eventPlacement: AdPlacement = effectivePlacement) => {
    const deviceType = /Mobile|Android|iPhone/i.test(navigator.userAgent) ? 'mobile' : 'desktop';

    try {
      const result = await (supabase as any).rpc('record_ad_delivery_event_v2', {
        p_ad_id: adId,
        p_placement: eventPlacement,
        p_event_type: 'click',
        p_session_id: getAdSessionId(),
        p_event_key: createAdEventKey(adId, eventPlacement, 'click'),
        p_slot_key: null,
        p_device_type: deviceType,
        p_score: null,
        p_metadata: getAdRequestContext(),
      });

      if (!result?.error) return;

      await supabase.from('ad_clicks').insert({
        ad_id: adId,
        user_id: user?.id || null,
        placement: eventPlacement,
        device_type: deviceType,
      });
    } catch (error) {
      console.error('Error tracking click:', error);
    }
  }, [effectivePlacement, user]);

  const submitFeedback = useCallback(async (
    adId: string,
    feedback: AdFeedbackType,
    eventPlacement: AdPlacement = effectivePlacement,
    metadata: Record<string, unknown> = {},
  ) => {
    recordAdFeedbackLocal(adId, feedback);
    setAds((current) => current.filter((item) => item.id !== adId));

    if (!user) return;

    try {
      const result = await (supabase as any).rpc('submit_ad_feedback_v2', {
        p_ad_id: adId,
        p_placement: eventPlacement,
        p_feedback_type: feedback,
        p_metadata: {
          ...getAdRequestContext(),
          ...metadata,
        },
      });

      if (!result?.error) return;

      // If the RPC is not deployed but the table already exists, preserve the
      // feedback. If neither exists this remains a harmless local preference.
      await (supabase as any).from('ad_user_feedback').insert({
        user_id: user.id,
        ad_id: adId,
        placement: eventPlacement,
        feedback_type: feedback,
        metadata,
      });
    } catch (error) {
      console.warn('Ad feedback stored locally; server feedback unavailable.', error);
    }
  }, [effectivePlacement, user]);

  return {
    ads,
    isLoading,
    refetch: fetchAds,
    trackImpression,
    trackClick,
    submitFeedback,
  };
}

export function useUserAds() {
  const { user } = useAuth();
  const [ads, setAds] = useState<Ad[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchAds = useCallback(async () => {
    if (!user) {
      setAds([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('ads')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setAds((data || []) as Ad[]);
    } catch (error) {
      console.error('Error fetching user ads:', error);
      toast.error('Reklamalarni yuklashda xatolik');
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!user) {
      setAds([]);
      setIsLoading(false);
      return;
    }

    void fetchAds();

    const channel = supabase
      .channel(`user-ads-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'ads',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          void fetchAds();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user, fetchAds]);

  const createAd = useCallback(async (input: AdCreateInput) => {
    if (!user) {
      toast.error('Tizimga kiring');
      return null;
    }

    try {
      const { data, error } = await supabase
        .from('ads')
        .insert({
          ...input,
          user_id: user.id,
          status: 'pending',
        })
        .select()
        .single();

      if (error) throw error;

      toast.success('Reklama yaratildi. Moderatsiyadan so‘ng ishga tushadi.');
      return data as Ad;
    } catch (error) {
      console.error('Error creating ad:', error);
      toast.error('Reklama yaratishda xatolik');
      return null;
    }
  }, [user]);

  const updateAd = useCallback(async (id: string, updates: Partial<AdCreateInput> | Partial<Pick<Ad, 'status'>>) => {
    try {
      const { error } = await supabase
        .from('ads')
        .update(updates)
        .eq('id', id);

      if (error) throw error;
      toast.success('Reklama yangilandi');
      return true;
    } catch (error) {
      console.error('Error updating ad:', error);
      toast.error('Reklamani yangilashda xatolik');
      return false;
    }
  }, []);

  const deleteAd = useCallback(async (id: string) => {
    try {
      const { error } = await supabase
        .from('ads')
        .delete()
        .eq('id', id);

      if (error) throw error;
      toast.success('Reklama o‘chirildi');
      return true;
    } catch (error) {
      console.error('Error deleting ad:', error);
      toast.error('Reklamani o‘chirishda xatolik');
      return false;
    }
  }, []);

  const pauseAd = useCallback((id: string) => updateAd(id, { status: 'paused' }), [updateAd]);
  const resumeAd = useCallback((id: string) => updateAd(id, { status: 'active' }), [updateAd]);

  return {
    ads,
    isLoading,
    refetch: fetchAds,
    createAd,
    updateAd,
    deleteAd,
    pauseAd,
    resumeAd,
  };
}

export function useAdStats(adId: string) {
  const [stats, setStats] = useState({
    impressions: 0,
    clicks: 0,
    reach: 0,
    ctr: 0,
    spent: 0,
  });
  const [dailyStats, setDailyStats] = useState<{ date: string; impressions: number; clicks: number }[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    try {
      const { data: ad, error: adError } = await supabase
        .from('ads')
        .select('impressions_count, clicks_count, reach_count, spent')
        .eq('id', adId)
        .single();

      if (adError) throw adError;

      const impressions = ad.impressions_count || 0;
      const clicks = ad.clicks_count || 0;
      const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;

      setStats({
        impressions,
        clicks,
        reach: ad.reach_count || 0,
        ctr: Math.round(ctr * 100) / 100,
        spent: ad.spent || 0,
      });

      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const { data: impressionsData } = await supabase
        .from('ad_impressions')
        .select('created_at')
        .eq('ad_id', adId)
        .gte('created_at', sevenDaysAgo.toISOString());

      const { data: clicksData } = await supabase
        .from('ad_clicks')
        .select('created_at')
        .eq('ad_id', adId)
        .gte('created_at', sevenDaysAgo.toISOString());

      const dailyMap = new Map<string, { impressions: number; clicks: number }>();

      for (let i = 0; i < 7; i += 1) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        dailyMap.set(date.toISOString().split('T')[0], { impressions: 0, clicks: 0 });
      }

      impressionsData?.forEach((item) => {
        const date = item.created_at.split('T')[0];
        const bucket = dailyMap.get(date);
        if (bucket) bucket.impressions += 1;
      });

      clicksData?.forEach((item) => {
        const date = item.created_at.split('T')[0];
        const bucket = dailyMap.get(date);
        if (bucket) bucket.clicks += 1;
      });

      setDailyStats(
        Array.from(dailyMap.entries())
          .map(([date, data]) => ({ date, ...data }))
          .reverse(),
      );
    } catch (error) {
      console.error('Error fetching ad stats:', error);
    } finally {
      setIsLoading(false);
    }
  }, [adId]);

  useEffect(() => {
    void fetchStats();

    const channel = supabase
      .channel(`ad-stats-${adId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'ads',
          filter: `id=eq.${adId}`,
        },
        () => {
          void fetchStats();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [adId, fetchStats]);

  return { stats, dailyStats, isLoading, refetch: fetchStats };
}
