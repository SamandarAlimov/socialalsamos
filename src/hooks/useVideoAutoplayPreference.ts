import { useCallback, useEffect, useRef, useState } from 'react';

import { supabase } from '@/integrations/supabase/client';

interface UseVideoAutoplayPreferenceResult {
  isAutoplayEnabled: boolean;
  isLoading: boolean;
  isSaving: boolean;
  setAutoplayEnabled: (enabled: boolean) => Promise<boolean>;
}

export function useVideoAutoplayPreference(
  userId?: string | null,
): UseVideoAutoplayPreferenceResult {
  const [isAutoplayEnabled, setIsAutoplayEnabled] = useState(true);
  const [isLoading, setIsLoading] = useState(Boolean(userId));
  const [isSaving, setIsSaving] = useState(false);
  const requestVersionRef = useRef(0);

  useEffect(() => {
    const requestVersion = ++requestVersionRef.current;

    if (!userId) {
      setIsAutoplayEnabled(true);
      setIsLoading(false);
      setIsSaving(false);
      return;
    }

    setIsLoading(true);

    void (async () => {
      const { data, error } = await supabase
        .from('user_settings')
        .select('videos_autoplay')
        .eq('user_id', userId)
        .maybeSingle();

      if (requestVersionRef.current !== requestVersion) return;

      if (error) {
        console.error('Failed to load video autoplay preference', error);
      } else {
        setIsAutoplayEnabled(data?.videos_autoplay ?? true);
      }

      setIsLoading(false);
    })();
  }, [userId]);

  const setAutoplayEnabled = useCallback(async (enabled: boolean) => {
    const requestVersion = ++requestVersionRef.current;
    const previous = isAutoplayEnabled;

    setIsAutoplayEnabled(enabled);
    setIsLoading(false);

    if (!userId) return true;

    setIsSaving(true);
    const { error } = await supabase
      .from('user_settings')
      .upsert(
        {
          user_id: userId,
          videos_autoplay: enabled,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' },
      );

    if (requestVersionRef.current !== requestVersion) return !error;

    setIsSaving(false);

    if (error) {
      console.error('Failed to save video autoplay preference', error);
      setIsAutoplayEnabled(previous);
      return false;
    }

    return true;
  }, [isAutoplayEnabled, userId]);

  return {
    isAutoplayEnabled,
    isLoading,
    isSaving,
    setAutoplayEnabled,
  };
}
