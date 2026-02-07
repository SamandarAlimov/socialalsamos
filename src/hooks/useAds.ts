import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

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

// Get random active ads for feed/story
export function useActiveAds(type: 'feed' | 'story' | 'both' = 'feed', limit: number = 3) {
  const { user } = useAuth();
  const [ads, setAds] = useState<Ad[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchAds = useCallback(async () => {
    try {
      let query = supabase
        .from('ads')
        .select('*')
        .eq('status', 'active')
        .or(`ad_type.eq.${type},ad_type.eq.both`)
        .order('created_at', { ascending: false })
        .limit(limit);

      const { data, error } = await query;
      if (error) throw error;
      
      setAds((data || []) as Ad[]);
    } catch (error) {
      console.error('Error fetching ads:', error);
    } finally {
      setIsLoading(false);
    }
  }, [type, limit]);

  useEffect(() => {
    fetchAds();
  }, [fetchAds]);

  const trackImpression = useCallback(async (adId: string, placement: 'feed' | 'story') => {
    try {
      const deviceType = /Mobile|Android|iPhone/i.test(navigator.userAgent) ? 'mobile' : 'desktop';
      
      await supabase.from('ad_impressions').insert({
        ad_id: adId,
        user_id: user?.id || null,
        placement,
        device_type: deviceType
      });

      // Track reach (unique user)
      if (user) {
        await supabase.from('ad_reach').upsert({
          ad_id: adId,
          user_id: user.id
        }, { onConflict: 'ad_id,user_id' });
      }
    } catch (error) {
      console.error('Error tracking impression:', error);
    }
  }, [user]);

  const trackClick = useCallback(async (adId: string, placement: 'feed' | 'story') => {
    try {
      const deviceType = /Mobile|Android|iPhone/i.test(navigator.userAgent) ? 'mobile' : 'desktop';
      
      await supabase.from('ad_clicks').insert({
        ad_id: adId,
        user_id: user?.id || null,
        placement,
        device_type: deviceType
      });
    } catch (error) {
      console.error('Error tracking click:', error);
    }
  }, [user]);

  return { ads, isLoading, refetch: fetchAds, trackImpression, trackClick };
}

// User's own ads management
export function useUserAds() {
  const { user } = useAuth();
  const [ads, setAds] = useState<Ad[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchAds = useCallback(async () => {
    if (!user) return;
    
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
    if (user) {
      fetchAds();

      // Real-time updates
      const channel = supabase
        .channel(`user-ads-${user.id}`)
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'ads',
          filter: `user_id=eq.${user.id}`
        }, () => {
          fetchAds();
        })
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
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
          status: 'pending'
        })
        .select()
        .single();

      if (error) throw error;
      
      toast.success('Reklama yaratildi! Tekshirilmoqda...');
      return data as Ad;
    } catch (error) {
      console.error('Error creating ad:', error);
      toast.error('Reklama yaratishda xatolik');
      return null;
    }
  }, [user]);

  const updateAd = useCallback(async (id: string, updates: Partial<AdCreateInput>) => {
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
      toast.success("Reklama o'chirildi");
      return true;
    } catch (error) {
      console.error('Error deleting ad:', error);
      toast.error("Reklamani o'chirishda xatolik");
      return false;
    }
  }, []);

  const pauseAd = useCallback(async (id: string) => {
    return updateAd(id, { status: 'paused' } as any);
  }, [updateAd]);

  const resumeAd = useCallback(async (id: string) => {
    return updateAd(id, { status: 'active' } as any);
  }, [updateAd]);

  return {
    ads,
    isLoading,
    refetch: fetchAds,
    createAd,
    updateAd,
    deleteAd,
    pauseAd,
    resumeAd
  };
}

// Ad statistics
export function useAdStats(adId: string) {
  const [stats, setStats] = useState({
    impressions: 0,
    clicks: 0,
    reach: 0,
    ctr: 0, // click-through rate
    spent: 0
  });
  const [dailyStats, setDailyStats] = useState<{date: string; impressions: number; clicks: number}[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    try {
      // Get ad details
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
        spent: ad.spent || 0
      });

      // Get daily stats (last 7 days)
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

      // Aggregate by date
      const dailyMap = new Map<string, { impressions: number; clicks: number }>();
      
      for (let i = 0; i < 7; i++) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];
        dailyMap.set(dateStr, { impressions: 0, clicks: 0 });
      }

      impressionsData?.forEach(item => {
        const date = item.created_at.split('T')[0];
        if (dailyMap.has(date)) {
          dailyMap.get(date)!.impressions++;
        }
      });

      clicksData?.forEach(item => {
        const date = item.created_at.split('T')[0];
        if (dailyMap.has(date)) {
          dailyMap.get(date)!.clicks++;
        }
      });

      setDailyStats(
        Array.from(dailyMap.entries())
          .map(([date, data]) => ({ date, ...data }))
          .reverse()
      );

    } catch (error) {
      console.error('Error fetching ad stats:', error);
    } finally {
      setIsLoading(false);
    }
  }, [adId]);

  useEffect(() => {
    fetchStats();

    // Real-time updates
    const channel = supabase
      .channel(`ad-stats-${adId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'ads',
        filter: `id=eq.${adId}`
      }, () => {
        fetchStats();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [adId, fetchStats]);

  return { stats, dailyStats, isLoading, refetch: fetchStats };
}
