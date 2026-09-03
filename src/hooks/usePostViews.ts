import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { readStructuredPostSchemaCapability } from '@/lib/structuredPostSchema';
import { db } from '@/lib/db';

/**
 * Post ko'rishlarini yozish.
 *
 * Legacy production schema'da RPC/jadval mavjud bo'lmasligi mumkin.
 * Birinchi capability probe tugamaguncha boshqa kartalar parallel probe
 * yubormaydi — shu bilan 404/403 request storm oldi olinadi.
 */

const recorded = new Set<string>();
let viewTrackingDisabled = false;
let rpcAvailable: boolean | null = null;
let capabilityProbeInFlight = false;

function errorText(error: unknown): string {
  const value = error as {
    code?: string;
    message?: string;
    details?: string;
    hint?: string;
  } | null;

  return [value?.code, value?.message, value?.details, value?.hint]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function isBlockedError(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  const text = errorText(error);

  return (
    code === '42501' ||
    code === 'PGRST205' ||
    code === 'PGRST301' ||
    text.includes('row-level security') ||
    text.includes('permission denied') ||
    text.includes('forbidden')
  );
}

function isMissingRpc(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  const text = errorText(error);

  return (
    code === 'PGRST202' ||
    code === '42883' ||
    (text.includes('increment_post_views') &&
      (text.includes('schema cache') || text.includes('could not find the function')))
  );
}

export function usePostViews() {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const recordView = useCallback(
    async (postId: string) => {
      if (!userId || !postId) return;
      if (viewTrackingDisabled || readStructuredPostSchemaCapability() === 'missing') return;

      const key = userId + ':' + postId;
      if (recorded.has(key)) return;

      // Birinchi noma'lum capability probe davom etayotgan bo'lsa, qolgan
      // kartalar request yubormaydi. Keyingi scroll/mountlarda holat cache'dan olinadi.
      if (rpcAvailable === null && capabilityProbeInFlight) return;

      recorded.add(key);
      let ownsCapabilityProbe = false;

      try {
        if (rpcAvailable !== false) {
          if (rpcAvailable === null) {
            capabilityProbeInFlight = true;
            ownsCapabilityProbe = true;
          }

          const { error } = await db.rpc('increment_post_views', {
            post_id_param: postId,
          });

          if (!error) {
            rpcAvailable = true;
            return;
          }

          if (isMissingRpc(error)) {
            rpcAvailable = false;
          } else if (isBlockedError(error)) {
            viewTrackingDisabled = true;
            return;
          } else {
            return;
          }
        }

        const { error: upsertError } = await supabase
          .from('post_views')
          .upsert({ post_id: postId, user_id: userId }, { onConflict: 'post_id,user_id' });

        if (upsertError && isBlockedError(upsertError)) {
          viewTrackingDisabled = true;
        }
      } catch {
        // Ko'rish statistikasi kritik emas — jimgina o'tkazib yuboriladi.
      } finally {
        if (ownsCapabilityProbe) capabilityProbeInFlight = false;
      }
    },
    [userId],
  );

  return { recordView };
}
