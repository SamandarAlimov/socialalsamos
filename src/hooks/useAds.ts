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
  ad_account_id?: string | null;
  campaign_v2_id?: string | null;
  ad_set_v2_id?: string | null;
  creative_v2_id?: string | null;
  delivery_item_v2_id?: string | null;
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

function isNewAdsBackendUnavailable(error: any) {
  const code = String(error?.code || '');
  const message = `${error?.message || ''} ${error?.details || ''}`.toLowerCase();
  return (
    code === 'PGRST202' ||
    code === '42883' ||
    message.includes('could not find the function') ||
    message.includes('does not exist')
  );
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

async function fetchServerRankedAds(
  placement: AdPlacement,
  limit: number,
  sessionId: string,
  context: Record<string, unknown>,
) {
  const args = {
    p_placement: placement,
    p_limit: Math.max(limit * 3, limit),
    p_session_id: sessionId,
    p_context: context,
  };

  // V5 adds deterministic experiments on top of V4 pacing/integrity. Rollout
  // remains backwards compatible while migrations are reaching production.
  for (const rpcName of ['get_eligible_ads_v5', 'get_eligible_ads_v4', 'get_eligible_ads_v2']) {
    const result = await (supabase as any).rpc(rpcName, args);
    if (!result?.error && Array.isArray(result?.data)) return result.data as Ad[];
    if (!isNewAdsBackendUnavailable(result?.error)) {
      console.warn(`${rpcName} failed, trying compatibility path.`, result?.error);
    }
  }

  return null;
}

/** Fetches a ranked candidate pool for a real placement. */
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
      const serverAds = await fetchServerRankedAds(effectivePlacement, limit, sessionId, context);

      if (serverAds) {
        // Server ranking is authoritative in V4/V5. Local ranking remains a
        // final fatigue safety net and supports the legacy V2 response shape.
        const ranked = rankAdCandidates(serverAds).slice(0, limit);
        setAds(await hydrateAdvertiserProfiles(ranked));
        return;
      }

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

  const recordDeliveryEvent = useCallback(async (
    adId: string,
    eventType: 'impression' | 'click',
    eventPlacement: AdPlacement,
  ) => {
    const deviceType = /Mobile|Android|iPhone/i.test(navigator.userAgent) ? 'mobile' : 'desktop';
    const args = {
      p_ad_id: adId,
      p_placement: eventPlacement,
      p_event_type: eventType,
      p_session_id: getAdSessionId(),
      p_event_key: createAdEventKey(adId, eventPlacement, eventType),
      p_slot_key: null,
      p_device_type: deviceType,
      p_score: null,
      p_metadata: getAdRequestContext(),
    };

    const v4 = await (supabase as any).rpc('record_ad_delivery_event_v4', args);
    if (!v4?.error) return { handled: true, accepted: v4?.data !== false, deviceType };

    const v2 = await (supabase as any).rpc('record_ad_delivery_event_v2', args);
    if (!v2?.error) return { handled: true, accepted: v2?.data !== false, deviceType };

    return { handled: false, accepted: true, deviceType };
  }, []);

  const trackImpression = useCallback(async (adId: string, eventPlacement: AdPlacement = effectivePlacement) => {
    const ad = ads.find((item) => item.id === adId);

    try {
      const result = await recordDeliveryEvent(adId, 'impression', eventPlacement);
      if (result.handled) {
        if (result.accepted) recordAdvertiserExposure(ad?.user_id);
        return;
      }

      await supabase.from('ad_impressions').insert({
        ad_id: adId,
        user_id: user?.id || null,
        placement: eventPlacement,
        device_type: result.deviceType,
      });

      if (user) {
        await supabase.from('ad_reach').upsert(
          { ad_id: adId, user_id: user.id },
          { onConflict: 'ad_id,user_id' },
        );
      }

      recordAdvertiserExposure(ad?.user_id);
    } catch (error) {
      console.error('Error tracking impression:', error);
    }
  }, [ads, effectivePlacement, recordDeliveryEvent, user]);

  const trackClick = useCallback(async (adId: string, eventPlacement: AdPlacement = effectivePlacement) => {
    try {
      const result = await recordDeliveryEvent(adId, 'click', eventPlacement);
      if (result.handled) return;

      await supabase.from('ad_clicks').insert({
        ad_id: adId,
        user_id: user?.id || null,
        placement: eventPlacement,
        device_type: result.deviceType,
      });
    } catch (error) {
      console.error('Error tracking click:', error);
    }
  }, [effectivePlacement, recordDeliveryEvent, user]);

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
        p_metadata: { ...getAdRequestContext(), ...metadata },
      });

      if (!result?.error) return;

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
        () => { void fetchAds(); },
      )
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [user, fetchAds]);

  const createAd = useCallback(async (input: AdCreateInput) => {
    if (!user) {
      toast.error('Tizimga kiring');
      return null;
    }

    try {
      const hierarchyResult = await (supabase as any).rpc('create_ad_campaign_v4', {
        p_payload: input,
      });

      if (!hierarchyResult?.error && hierarchyResult?.data) {
        toast.success('Kampaniya yaratildi. Moderatsiyadan so‘ng ishga tushadi.');
        return hierarchyResult.data as Ad;
      }

      if (!isNewAdsBackendUnavailable(hierarchyResult?.error)) {
        throw hierarchyResult?.error;
      }

      // Compatibility during staged database rollout only.
      const { data, error } = await supabase
        .from('ads')
        .insert({ ...input, user_id: user.id, status: 'pending' })
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
      const { error } = await supabase.from('ads').update(updates).eq('id', id);
      if (error) throw error;
      toast.success('Reklama yangilandi');
      return true;
    } catch (error) {
      console.error('Error updating ad:', error);
      toast.error('Reklamani yangilashda xatolik');
      return false;
    }
  }, []);

  const setDeliveryStatus = useCallback(async (id: string, status: 'active' | 'paused') => {
    try {
      const result = await (supabase as any).rpc('set_ad_delivery_status_v4', {
        p_ad_id: id,
        p_status: status,
      });

      if (!result?.error) {
        toast.success(status === 'paused' ? 'Reklama to‘xtatildi' : 'Reklama davom ettirildi');
        return true;
      }

      if (!isNewAdsBackendUnavailable(result.error)) throw result.error;
      return updateAd(id, { status });
    } catch (error) {
      console.error('Error changing ad delivery:', error);
      toast.error('Reklama holatini o‘zgartirib bo‘lmadi');
      return false;
    }
  }, [updateAd]);

  const deleteAd = useCallback(async (id: string) => {
    try {
      const archive = await (supabase as any).rpc('archive_ad_delivery_v4', { p_ad_id: id });
      if (!archive?.error) {
        toast.success('Kampaniya arxivlandi');
        return true;
      }

      if (!isNewAdsBackendUnavailable(archive.error)) throw archive.error;

      const { error } = await supabase.from('ads').delete().eq('id', id);
      if (error) throw error;
      toast.success('Reklama o‘chirildi');
      return true;
    } catch (error) {
      console.error('Error deleting ad:', error);
      toast.error('Reklamani o‘chirishda xatolik');
      return false;
    }
  }, []);

  const pauseAd = useCallback((id: string) => setDeliveryStatus(id, 'paused'), [setDeliveryStatus]);
  const resumeAd = useCallback((id: string) => setDeliveryStatus(id, 'active'), [setDeliveryStatus]);

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

      // Prefer long-lived rollups when available; fallback keeps older DBs live.
      const rollup = await (supabase as any)
        .from('ad_daily_metrics_v3')
        .select('day, impressions, clicks')
        .eq('ad_id', adId)
        .gte('day', sevenDaysAgo.toISOString().split('T')[0]);

      if (!rollup?.error && Array.isArray(rollup?.data)) {
        const dailyMap = new Map<string, { impressions: number; clicks: number }>();
        for (let i = 0; i < 7; i += 1) {
          const date = new Date();
          date.setDate(date.getDate() - i);
          dailyMap.set(date.toISOString().split('T')[0], { impressions: 0, clicks: 0 });
        }
        for (const item of rollup.data) {
          const bucket = dailyMap.get(item.day);
          if (bucket) {
            bucket.impressions += Number(item.impressions || 0);
            bucket.clicks += Number(item.clicks || 0);
          }
        }
        setDailyStats(Array.from(dailyMap.entries()).map(([date, data]) => ({ date, ...data })).reverse());
        return;
      }

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
        () => { void fetchStats(); },
      )
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [adId, fetchStats]);

  return { stats, dailyStats, isLoading, refetch: fetchStats };
}