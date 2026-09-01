/**
 * XIZMAT HOLATI — qaysi edge funksiyalar haqiqatan deploy qilinganini aniqlaydi.
 *
 * Repoda kod turishi va Supabase'da ishlab turishi ikki xil narsa. Bu modul
 * taxmin qilmaydi: har bir funksiyaga yengil so'rov yuborib, javobiga qarab
 * xulosa chiqaradi. Natija UI'da ham, AI kontekstida ham ishlatiladi.
 */

import { supabase } from '@/integrations/supabase/client';

const FUNCTIONS_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

export type ServiceState = 'live' | 'missing' | 'error' | 'unknown';

export type ServiceStatus = {
  name: string;
  state: ServiceState;
  detail: string;
};

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
    apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string,
  };
}

/**
 * Funksiyani ataylab NOTO'G'RI tana bilan chaqiramiz.
 * - 400 (INVALID_REQUEST) qaytsa — funksiya TIRIK: so'rovni tekshirib javob berdi.
 * - 404 qaytsa — deploy qilinmagan.
 * - Tarmoq xatosi — mavjud emas yoki CORS yopiq.
 */
async function probe(functionName: string): Promise<ServiceStatus> {
  try {
    const response = await fetch(`${FUNCTIONS_BASE}/${functionName}`, {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify({}),
    });

    if (response.status === 404) {
      return {
        name: functionName,
        state: 'missing',
        detail: 'Deploy qilinmagan (404).',
      };
    }

    if (response.status === 400 || response.status === 200) {
      return { name: functionName, state: 'live', detail: 'Ishlab turibdi.' };
    }

    if (response.status === 401 || response.status === 403) {
      return {
        name: functionName,
        state: 'live',
        detail: 'Ishlayapti, lekin avtorizatsiya talab qiladi.',
      };
    }

    if (response.status === 429) {
      return { name: functionName, state: 'live', detail: 'Ishlayapti (limit oshgan).' };
    }

    return {
      name: functionName,
      state: 'error',
      detail: `Kutilmagan javob (HTTP ${response.status}).`,
    };
  } catch {
    return {
      name: functionName,
      state: 'missing',
      detail: 'Ulanib bo\u2018lmadi — deploy qilinmagan bo\u2018lishi mumkin.',
    };
  }
}

/** Asosiy AI xizmatlarining holatini bir vaqtda tekshiradi. */
export async function checkAiServices(): Promise<ServiceStatus[]> {
  return Promise.all([probe('ai-assistant'), probe('ai-agent'), probe('code-sandbox')]);
}

/** Faqat agent tirikmi — tez tekshiruv (natija sessiya davomida keshlanadi). */
let agentLivePromise: Promise<boolean> | null = null;

export function isAgentLive(): Promise<boolean> {
  if (!agentLivePromise) {
    agentLivePromise = probe('ai-agent').then((status) => status.state === 'live');
  }
  return agentLivePromise;
}

/** Keshni tozalaydi — deploy'dan keyin qayta tekshirish uchun. */
export function resetServiceCache(): void {
  agentLivePromise = null;
}
