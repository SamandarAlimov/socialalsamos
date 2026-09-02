/**
 * GEMINI KALITLAR HOVUZI — bir nechta API kalitni navbat bilan ishlatish.
 *
 * Muammo: bitta kalitning kunlik/daqiqalik limiti tez tugaydi va butun AI
 * to'xtab qoladi ("AI kreditlari tugagan").
 *
 * Yechim: 5–10 ta kalit hovuzga qo'yiladi. Har so'rov navbatdagi kalitga
 * yuboriladi (round-robin). Kalit limitga urilsa (429) yoki bloklansa (401/403),
 * u vaqtincha "sovutishga" qo'yiladi va so'rov keyingi kalit bilan qayta
 * uriniladi. Hamma kalit band bo'lsa — eski Lovable gateway'iga qaytiladi.
 *
 * MUHIM: kalitlar KODDA saqlanmaydi. Faqat Supabase secrets orqali o'qiladi:
 *   supabase secrets set GEMINI_API_KEYS="kalit1,kalit2,kalit3"
 * yoki alohida-alohida: GEMINI_API_KEY_1 ... GEMINI_API_KEY_10
 *
 * Google'ning OpenAI-mos endpointi ishlatiladi, shuning uchun so'rov tanasi
 * Lovable gateway'inikiga aynan bir xil — chaqiruv joyini almashtirish kifoya.
 */

const GOOGLE_HOST = 'https://' + 'generativelanguage.googleapis.com';
const GOOGLE_OPENAI_PATH = '/v1beta/openai/chat/completions';
const LOVABLE_GATEWAY = 'https://' + 'ai.gateway.lovable.dev' + '/v1/chat/completions';

/** Limitga urilgan kalit shuncha vaqt chetda turadi. */
const COOLDOWN_MS = 60_000;
/** Kalit butunlay yaroqsiz bo'lsa (401/403) — uzoqroq sovutamiz. */
const DEAD_COOLDOWN_MS = 15 * 60_000;

/**
 * Lovable model nomlarini Google'ning haqiqiy model IDlariga moslash.
 * Nomlar mos kelmasa, Google 404 qaytaradi — shuning uchun aniq xarita kerak.
 */
const MODEL_MAP: Record<string, string> = {
  // Flash oilasi — 2.5 endi yangi kalitlar uchun yopiq, 3.6 ga yo'naltiramiz.
  'google/gemini-3-flash-preview': 'gemini-3.6-flash',
  'google/gemini-3.1-flash-lite': 'gemini-flash-lite-latest',
  'google/gemini-2.5-flash-lite': 'gemini-flash-lite-latest',
  'google/gemini-3.5-flash': 'gemini-3.6-flash',
  'google/gemini-3.6-flash': 'gemini-3.6-flash',
  'google/gemini-3.7-flash': 'gemini-flash-latest',
  'google/gemini-2.5-flash': 'gemini-3.6-flash',
  'google/gemini-2.0-flash': 'gemini-3.6-flash',
  // Pro oilasi
  'google/gemini-3.1-pro-preview': 'gemini-pro-latest',
  'google/gemini-2.5-pro': 'gemini-pro-latest',
};

/** Google'da mavjud bo'lmagan nomlar uchun xavfsiz zaxira. */
const FALLBACK_GOOGLE_MODEL = 'gemini-3.6-flash';

export function toGoogleModel(model: string): string {
  if (MODEL_MAP[model]) return MODEL_MAP[model];
  if (!model.startsWith('google/')) return model;
  const bare = model.slice('google/'.length);
  if (/^gemini-[0-2]\./.test(bare)) return FALLBACK_GOOGLE_MODEL;
  return bare;
}


/* ------------------------------ kalitlar ro'yxati -------------------------- */

let cachedKeys: string[] | null = null;

export function geminiKeys(): string[] {
  if (cachedKeys) return cachedKeys;

  const keys: string[] = [];

  const bundle = Deno.env.get('GEMINI_API_KEYS');
  if (bundle) {
    for (const part of bundle.split(',')) {
      const key = part.trim();
      if (key) keys.push(key);
    }
  }

  for (let i = 1; i <= 10; i += 1) {
    const key = Deno.env.get(`GEMINI_API_KEY_${i}`)?.trim();
    if (key) keys.push(key);
  }

  const single = Deno.env.get('GEMINI_API_KEY')?.trim();
  if (single) keys.push(single);

  // Takrorlanganlarini olib tashlaymiz.
  cachedKeys = [...new Set(keys)];
  return cachedKeys;
}

export function hasGeminiKeys(): boolean {
  return geminiKeys().length > 0;
}

/* ------------------------------ navbat va sovutish ------------------------- */

let cursor = 0;
const cooldownUntil = new Map<string, number>();

function available(): string[] {
  const now = Date.now();
  const keys = geminiKeys();
  const free = keys.filter((key) => (cooldownUntil.get(key) ?? 0) <= now);
  // Hammasi sovutishda bo'lsa — baribir urinib ko'ramiz (limit tiklangan bo'lishi mumkin).
  return free.length ? free : keys;
}

function markCooldown(key: string, status: number): void {
  const duration = status === 401 || status === 403 ? DEAD_COOLDOWN_MS : COOLDOWN_MS;
  cooldownUntil.set(key, Date.now() + duration);
}

/* -------------------------------- so'rov ---------------------------------- */

export type AiFetchOptions = {
  /** Chat completions tanasi (OpenAI formati): model, messages, stream, tools… */
  body: Record<string, unknown>;
  /** Zaxira yo'l uchun Lovable kaliti. Bo'lmasa fallback ishlatilmaydi. */
  lovableKey?: string;
  signal?: AbortSignal;
};

export type AiFetchResult = {
  response: Response;
  /** Qaysi manba javob berdi — loglar va X-AI-Provider sarlavhasi uchun. */
  provider: 'gemini' | 'lovable';
  /** Nechanchi kalit ishlatildi (1 dan boshlab). Lovable uchun 0. */
  keyIndex: number;
};

/**
 * AI so'rovini yuboradi: avval Gemini kalitlari navbati bilan, keyin Lovable.
 * Muvaffaqiyatli javob (yoki tuzatib bo'lmaydigan xato) qaytguncha uriniladi.
 */
export async function aiFetch(options: AiFetchOptions): Promise<AiFetchResult> {
  const { body, lovableKey, signal } = options;
  const keys = available();
  const model = String(body.model ?? '');

  let lastStatus = 0;
  let lastDetail = '';

  for (let attempt = 0; attempt < keys.length; attempt += 1) {
    const key = keys[(cursor + attempt) % keys.length];

    let response: Response;
    try {
      response = await fetch(GOOGLE_HOST + GOOGLE_OPENAI_PATH, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ...body, model: toGoogleModel(model) }),
        signal,
      });
    } catch (error) {
      lastDetail = error instanceof Error ? error.message : 'tarmoq xatosi';
      markCooldown(key, 503);
      continue;
    }

    if (response.ok) {
      // Navbatni surib qo'yamiz — yuk kalitlar orasida teng taqsimlanadi.
      cursor = (cursor + attempt + 1) % keys.length;
      return { response, provider: 'gemini', keyIndex: attempt + 1 };
    }

    lastStatus = response.status;
    lastDetail = await response.text().catch(() => '');

    // 429 (limit), 401/403 (yaroqsiz kalit), 5xx (server) — keyingi kalitga o'tamiz.
    if (
      response.status === 429 ||
      response.status === 401 ||
      response.status === 403 ||
      response.status >= 500
    ) {
      markCooldown(key, response.status);
      console.warn(
        `gemini key #${attempt + 1} failed: HTTP ${response.status} ${lastDetail.slice(0, 200)}`,
      );
      continue;
    }

    // 400 kabi xatolar so'rovning o'zida — kalit almashtirish yordam bermaydi.
    return { response, provider: 'gemini', keyIndex: attempt + 1 };
  }

  // Barcha kalitlar ishlamadi — eski yo'lga qaytamiz.
  if (lovableKey) {
    console.warn(
      `all gemini keys exhausted (last HTTP ${lastStatus}) — falling back to Lovable gateway`,
    );
    const response = await fetch(LOVABLE_GATEWAY, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal,
    });
    return { response, provider: 'lovable', keyIndex: 0 };
  }

  throw new Error(
    `Barcha Gemini kalitlari ishlamadi (oxirgi holat: HTTP ${lastStatus || '?'}). ` +
      'Kalitlarni yoki limitlarni tekshiring.',
  );
}

/** Diagnostika uchun: nechta kalit bor va nechtasi hozir bo'sh. */
export function poolStatus(): { total: number; ready: number } {
  const now = Date.now();
  const keys = geminiKeys();
  return {
    total: keys.length,
    ready: keys.filter((key) => (cooldownUntil.get(key) ?? 0) <= now).length,
  };
}
