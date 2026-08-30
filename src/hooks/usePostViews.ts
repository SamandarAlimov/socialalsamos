import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { readStructuredPostSchemaCapability } from '@/lib/structuredPostSchema';

/**
 * Post ko'rishlarini yozish.
 *
 * Muammo: `post_views` jadvaliga to'g'ridan-to'g'ri insert RLS tomonidan
 * to'silsa (403), har bir post uchun qayta-qayta so'rov yuborilib, konsol
 * xatolar bilan to'lib ketardi.
 *
 * Yechim:
 *  1. Avval `increment_post_views` RPC ishlatiladi (server tomonda xavfsiz).
 *  2. RPC bo'lmasa — bir marta `upsert` sinab ko'riladi.
 *  3. Ruxsat yo'q (403 / 42501) yoki jadval yo'q bo'lsa — funksiya shu sessiya
 *     uchun butunlay o'chiriladi, boshqa so'rov yuborilmaydi.
 *  4. Bir post uchun sessiyada faqat bir marta yoziladi.
 */

const recorded = new Set<string>();
let viewTrackingDisabled = false;
let rpcAvailable: boolean | null = null;

function isBlockedError(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  if (!code) return false;
  // 42501 = insufficient_privilege, PGRST205 = jadval topilmadi, PGRST202 = RPC topilmadi
  return code === '42501' || code === 'PGRST205' || code === 'PGRST301';
}

function isMissingRpc(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  return code === 'PGRST202' || code === '42883';
}

export function usePostViews() {
  const { user } = useAuth();

  const recordView = useCallback(
    async (postId: string) => {
      if (!user || !postId) return;
      if (viewTrackingDisabled || readStructuredPostSchemaCapability() === 'missing') return;

      const key = user.id + ':' + postId;
      if (recorded.has(key)) return;
      recorded.add(key);

      try {
        if (rpcAvailable !== false) {
          const { error } = await supabase.rpc('increment_post_views', {
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
          .upsert({ post_id: postId, user_id: user.id }, { onConflict: 'post_id,user_id' });

        if (upsertError && isBlockedError(upsertError)) {
          // RLS ruxsat bermaydi — boshqa urinmaymiz
          viewTrackingDisabled = true;
        }
      } catch {
        // Ko'rish statistikasi kritik emas — jimgina o'tkazib yuboriladi
      }
    },
    [user],
  );

  return { recordView };
}
