import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

export interface UserSettings {
  id: string;
  user_id: string;
  last_seen_visibility: 'everyone' | 'contacts' | 'nobody';
  read_receipts_enabled: boolean;
  call_permissions: 'everyone' | 'contacts' | 'nobody';
  group_invite_permissions: 'everyone' | 'contacts' | 'nobody';
  two_factor_enabled: boolean;
  notification_sounds: boolean;
  notification_preview: boolean;
  theme: 'system' | 'light' | 'dark';
  language: string;
  notify_likes: boolean;
  notify_comments: boolean;
  notify_follows: boolean;
  notify_mentions: boolean;
  autoplay_voice_messages: boolean;
  autoplay_video_messages: boolean;
}

export interface UserSession {
  id: string;
  user_id: string;
  device_name: string | null;
  device_type: string | null;
  os_name: string | null;
  browser_name: string | null;
  ip_address: string | null;
  last_active_at: string | null;
  created_at: string;
  is_current: boolean;
}

export function useUserSettings() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [sessions, setSessions] = useState<UserSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch user settings
  const fetchSettings = useCallback(async () => {
    if (!user?.id) return;

    try {
      const { data, error } = await supabase
        .from('user_settings')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setSettings(data as UserSettings);
      } else {
        // Create default settings if none exist
        const { data: newSettings, error: createError } = await supabase
          .from('user_settings')
          .insert({ user_id: user.id })
          .select()
          .single();

        if (createError) throw createError;
        setSettings(newSettings as UserSettings);
      }
    } catch (error) {
      console.error('Error fetching settings:', error);
    }
  }, [user?.id]);

  // Fetch user sessions
  const fetchSessions = useCallback(async () => {
    if (!user?.id) return;

    try {
      const { data, error } = await supabase
        .from('user_sessions')
        .select('*')
        .eq('user_id', user.id)
        .order('last_active_at', { ascending: false });

      if (error) throw error;
      setSessions((data || []) as UserSession[]);
    } catch (error) {
      console.error('Error fetching sessions:', error);
    }
  }, [user?.id]);

  // Update settings
  const updateSettings = useCallback(async (updates: Partial<UserSettings>) => {
    if (!user?.id || !settings) return;

    try {
      const { error } = await supabase
        .from('user_settings')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('user_id', user.id);

      if (error) throw error;

      setSettings(prev => prev ? { ...prev, ...updates } : null);
      toast({ title: 'Settings updated' });
    } catch (error) {
      console.error('Error updating settings:', error);
      toast({ title: 'Error', description: 'Failed to update settings', variant: 'destructive' });
    }
  }, [user?.id, settings, toast]);

  // Register current session
  const registerSession = useCallback(async () => {
    if (!user?.id) return;

    const deviceInfo = {
      device_name: navigator.userAgent.includes('Mobile') ? 'Mobile Device' : 'Desktop',
      device_type: navigator.userAgent.includes('Mobile') ? 'mobile' : 'desktop',
      os_name: getOSName(),
      browser_name: getBrowserName(),
      is_current: true,
    };

    try {
      // Mark all other sessions as not current
      await supabase
        .from('user_sessions')
        .update({ is_current: false })
        .eq('user_id', user.id);

      // Check if this session already exists (by browser fingerprint)
      const sessionKey = `${deviceInfo.browser_name}_${deviceInfo.os_name}_${deviceInfo.device_type}`;
      
      const { data: existing } = await supabase
        .from('user_sessions')
        .select('id')
        .eq('user_id', user.id)
        .eq('device_name', deviceInfo.device_name)
        .eq('browser_name', deviceInfo.browser_name)
        .maybeSingle();

      if (existing) {
        // Update existing session
        await supabase
          .from('user_sessions')
          .update({ 
            ...deviceInfo, 
            last_active_at: new Date().toISOString(),
            is_current: true 
          })
          .eq('id', existing.id);
      } else {
        // Create new session
        await supabase
          .from('user_sessions')
          .insert({ 
            user_id: user.id, 
            ...deviceInfo,
            last_active_at: new Date().toISOString() 
          });
      }

      fetchSessions();
    } catch (error) {
      console.error('Error registering session:', error);
    }
  }, [user?.id, fetchSessions]);

  // Logout specific session
  const logoutSession = useCallback(async (sessionId: string) => {
    try {
      const { error } = await supabase
        .from('user_sessions')
        .delete()
        .eq('id', sessionId);

      if (error) throw error;

      setSessions(prev => prev.filter(s => s.id !== sessionId));
      toast({ title: 'Session ended' });
    } catch (error) {
      console.error('Error ending session:', error);
      toast({ title: 'Error', description: 'Failed to end session', variant: 'destructive' });
    }
  }, [toast]);

  // Logout all other sessions
  const logoutAllOtherSessions = useCallback(async () => {
    if (!user?.id) return;

    try {
      const { error } = await supabase
        .from('user_sessions')
        .delete()
        .eq('user_id', user.id)
        .eq('is_current', false);

      if (error) throw error;

      setSessions(prev => prev.filter(s => s.is_current));
      toast({ title: 'All other sessions ended' });
    } catch (error) {
      console.error('Error ending sessions:', error);
      toast({ title: 'Error', description: 'Failed to end sessions', variant: 'destructive' });
    }
  }, [user?.id, toast]);

  // Change password
  const changePassword = useCallback(async (newPassword: string) => {
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      toast({ title: 'Password updated successfully' });
      return true;
    } catch (error: any) {
      console.error('Error changing password:', error);
      toast({ title: 'Error', description: error.message || 'Failed to change password', variant: 'destructive' });
      return false;
    }
  }, [toast]);

  useEffect(() => {
    if (user?.id) {
      setIsLoading(true);
      Promise.all([fetchSettings(), fetchSessions(), registerSession()])
        .finally(() => setIsLoading(false));
    }
  }, [user?.id, fetchSettings, fetchSessions, registerSession]);

  return {
    settings,
    sessions,
    isLoading,
    updateSettings,
    logoutSession,
    logoutAllOtherSessions,
    changePassword,
    refetch: () => Promise.all([fetchSettings(), fetchSessions()]),
  };
}

function getOSName(): string {
  const ua = navigator.userAgent;
  if (ua.includes('Windows')) return 'Windows';
  if (ua.includes('Mac')) return 'macOS';
  if (ua.includes('Linux')) return 'Linux';
  if (ua.includes('Android')) return 'Android';
  if (ua.includes('iPhone') || ua.includes('iPad')) return 'iOS';
  return 'Unknown';
}

function getBrowserName(): string {
  const ua = navigator.userAgent;
  if (ua.includes('Firefox')) return 'Firefox';
  if (ua.includes('Chrome') && !ua.includes('Edg')) return 'Chrome';
  if (ua.includes('Safari') && !ua.includes('Chrome')) return 'Safari';
  if (ua.includes('Edg')) return 'Edge';
  if (ua.includes('Opera') || ua.includes('OPR')) return 'Opera';
  return 'Unknown';
}
