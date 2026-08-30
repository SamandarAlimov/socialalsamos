import { useCallback, useEffect, useState } from 'react';
import { db } from '@/lib/db';
import {
  startLiveLocationSharing,
  stopLiveLocationSharing,
} from '@/lib/liveLocationSharing';

interface Options {
  locationId: string | null;
  postId: string | null;
  liveUntil: string | null;
  enabled: boolean;
}

/**
 * UI adapter for the app-level live-location service.
 *
 * Watcher component lifecycle'iga bog'liq emas: Create'dan keyin boshlangan
 * ulashish route almashtirilganda ham davom etadi. Bu hook faqat owner kartasi
 * ochilganda service'ni ensure qiladi va "To'xtatish" amalini boshqaradi.
 */
export function useLiveLocationSharing({
  locationId,
  postId,
  liveUntil,
  enabled,
}: Options) {
  const [isSharing, setIsSharing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || !postId || !liveUntil) {
      setIsSharing(false);
      return;
    }

    if (!('geolocation' in navigator)) {
      setError('Qurilma joylashuvni qo‘llab-quvvatlamaydi');
      setIsSharing(false);
      return;
    }

    const started = startLiveLocationSharing(postId, liveUntil);
    setIsSharing(started);
    setError(started ? null : 'Jonli joylashuvni boshlashning imkoni bo‘lmadi');
  }, [enabled, liveUntil, postId]);

  const endSharing = useCallback(async () => {
    if (postId) stopLiveLocationSharing(postId);
    setIsSharing(false);

    if (!locationId) return;

    const { error: updateError } = await db
      .from('post_locations')
      .update({ live_until: new Date().toISOString() })
      .eq('id', locationId);

    if (updateError) {
      console.error('Live ulashishni yakunlashda xatolik:', updateError);
      setError('Jonli joylashuvni to‘xtatib bo‘lmadi');
    }
  }, [locationId, postId]);

  return { isSharing, error, endSharing };
}
