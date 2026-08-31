// Tarmoq uzilishlariga chidamli Supabase o'qish yordamchisi.
//
// supabase-js v2 `fetch` xatosini ushlab oladi va uni PostgREST xatosi
// ko'rinishida qaytaradi:
//
//   { message: 'TypeError: Failed to fetch', details: '<stack trace>',
//     hint: '', code: '' }
//
// Shu sababli chaqiruv joyida transport uzilishini haqiqiy ma'lumotlar bazasi
// xatosidan ajratib bo'lmaydi: ikkalasi ham `error` bo'lib keladi. Natijada
// bitta yo'qolgan so'rov butun katalogni bo'shatib qo'yadi va foydalanuvchi
// minifikatsiya qilingan stack trace ni ko'radi.
//
// Bu yordamchi shu holatni tasniflaydi, backoff bilan qayta uriniladi va
// odam tushunadigan xabar beradi.

/** Bitta Supabase so'rovi natijasi (PostgrestBuilder shakli). */
export type SupabaseResult<T> = { data: T | null; error: unknown };

const NETWORK_ERROR_PATTERNS = [
  'failed to fetch',
  'load failed',
  'network request failed',
  'networkerror',
  'err_network',
  'err_internet_disconnected',
  'err_connection',
  'err_name_not_resolved',
  'err_timed_out',
  'fetch failed',
  'socket hang up',
  'connection closed',
  'aborted',
];

function errorText(error: unknown): string {
  if (!error) return '';
  if (typeof error === 'string') return error.toLowerCase();

  const source = error as {
    message?: unknown;
    details?: unknown;
    name?: unknown;
    code?: unknown;
  };

  return [source.name, source.message, source.details, source.code]
    .filter(part => typeof part === 'string' && part.length > 0)
    .join(' ')
    .toLowerCase();
}

/**
 * Xato transport darajasidami (server javob bermadi), yoki PostgREST
 * darajasidami (server javob berdi, lekin so'rovni rad etdi)?
 *
 * Faqat transport xatolarini qayta urinib ko'rish mumkin. PostgREST rad
 * etgan so'rovni qayta yuborish faqat vaqtni behuda ketkazadi.
 */
export function isNetworkError(error: unknown): boolean {
  if (!error) return false;

  // PostgREST har doim `code` qaytaradi (masalan PGRST200, 42703, 23505).
  // Transport xatosida `code` bo'sh bo'ladi.
  const code = (error as { code?: unknown }).code;
  if (typeof code === 'string' && /^[A-Z0-9]{5}$/.test(code)) return false;

  const text = errorText(error);
  if (!text) return false;

  return NETWORK_ERROR_PATTERNS.some(pattern => text.includes(pattern));
}

/** Brauzer hozir tarmoqdan uzilganini bildiradimi? */
export function isOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

/**
 * Foydalanuvchiga ko'rsatish uchun xabar. Stack trace hech qachon
 * interfeysga chiqmasligi kerak.
 */
export function networkErrorMessage(): string {
  return isOffline()
    ? 'Internet aloqasi yo\u2018q. Ulanish tiklanganda avtomatik qayta yuklanadi.'
    : 'Serverga ulanib bo\u2018lmadi. Aloqa qayta tiklanishi bilan urinib ko\u2018ramiz.';
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Tarmoq tiklanishini kutadi. Agar berilgan vaqt ichida tiklanmasa, shunchaki
 * qaytadi — chaqiruvchi baribir bir marta urinib ko'radi.
 */
export function waitForOnline(timeoutMs = 8000): Promise<void> {
  if (typeof window === 'undefined' || !isOffline()) return Promise.resolve();

  return new Promise(resolve => {
    let settled = false;

    const finish = () => {
      if (settled) return;
      settled = true;
      window.removeEventListener('online', finish);
      window.clearTimeout(timer);
      resolve();
    };

    const timer = window.setTimeout(finish, timeoutMs);
    window.addEventListener('online', finish);
  });
}

export type NetworkRetryOptions = {
  /** Jami urinishlar soni (birinchi urinish ham shu ichida). */
  attempts?: number;
  /** Birinchi kutish oralig'i; keyingilari eksponensial o'sadi. */
  baseDelayMs?: number;
  /** Log uchun nom, masalan 'products'. */
  label?: string;
};

/**
 * Supabase o'qish so'rovini tarmoq uzilishida qayta yuboradi.
 *
 * `run` har chaqirilganda **yangi** so'rov qurishi kerak: PostgrestBuilder bir
 * marta bajarilgandan keyin qayta ishlatilmaydi.
 *
 * PostgREST xatolari (RLS, embed, sintaksis) qayta urinilmaydi — ular darhol
 * qaytariladi.
 *
 * @example
 * const { data, error } = await withNetworkRetry(
 *   () => db.from('products').select(productSelect()).limit(50),
 *   { label: 'products' },
 * );
 */
export async function withNetworkRetry<T>(
  run: () => PromiseLike<SupabaseResult<T>>,
  options: NetworkRetryOptions = {},
): Promise<SupabaseResult<T>> {
  const attempts = Math.max(1, options.attempts ?? 3);
  const baseDelayMs = Math.max(50, options.baseDelayMs ?? 400);
  const label = options.label ?? 'query';

  let last: SupabaseResult<T> = { data: null, error: null };

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    if (isOffline()) await waitForOnline();

    try {
      last = await run();
    } catch (thrown) {
      // Ba'zi holatlarda supabase-js xatoni ushlamaydi (masalan URL noto'g'ri).
      last = { data: null, error: thrown };
    }

    if (!last.error || !isNetworkError(last.error)) return last;

    if (attempt < attempts) {
      // Jitter bir vaqtda uzilgan bir nechta so'rovning bir paytda qaytishini
      // (thundering herd) oldini oladi.
      const backoff = baseDelayMs * 2 ** (attempt - 1);
      const jitter = Math.round(Math.random() * baseDelayMs);
      console.warn(
        `Supabase ${label}: network failure, retrying (${attempt}/${attempts - 1})`,
        last.error,
      );
      await sleep(backoff + jitter);
    }
  }

  console.error(`Supabase ${label}: giving up after ${attempts} attempts`, last.error);
  return last;
}

/**
 * Tarmoq tiklanganda yoki foydalanuvchi ilovaga qaytganda `callback` ni
 * chaqiradi. Hook lar shu orqali muvaffaqiyatsiz yuklashni o'zi tiklaydi.
 *
 * Tozalash funksiyasini qaytaradi.
 */
export function onNetworkRestored(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined;

  const handleOnline = () => callback();
  const handleVisibility = () => {
    if (document.visibilityState === 'visible' && !isOffline()) callback();
  };

  window.addEventListener('online', handleOnline);
  document.addEventListener('visibilitychange', handleVisibility);

  return () => {
    window.removeEventListener('online', handleOnline);
    document.removeEventListener('visibilitychange', handleVisibility);
  };
}
