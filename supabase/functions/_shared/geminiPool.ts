/**
 * Shared Gemini API key pool for every Alsamos AI surface.
 *
 * AI Page, AI Search, live search grounding, image/video helpers and any other
 * Gemini caller must use this module instead of choosing a key by variable name.
 * A key that hits quota/auth/server errors is cooled down and the same request
 * is retried with the next key automatically.
 *
 * Secrets are never committed here. Keys may come from:
 *   - GEMINI_API_KEYS / ALSAMOS_AI_API_KEYS / ALSAMOS_SEARCH_API_KEYS bundles
 *   - GEMINI_API_KEY_1..20
 *   - GEMINI_API_KEY / ALSAMOS_SEARCH_API_KEY / GOOGLE_API_KEY legacy aliases
 *   - public.ai_api_key_pool (service-role only, RLS protected)
 */

const GOOGLE_HOST = 'https://' + 'generativelanguage.googleapis.com';
const GOOGLE_OPENAI_PATH = '/v1beta/openai/chat/completions';
const LOVABLE_GATEWAY = 'https://' + 'ai.gateway.lovable.dev' + '/v1/chat/completions';

const COOLDOWN_MS = 60_000;
const DEAD_COOLDOWN_MS = 15 * 60_000;
const DB_REFRESH_MS = 5 * 60_000;

const MODEL_MAP: Record<string, string> = {
  'google/gemini-3-flash-preview': 'gemini-3.8-flash',
  'google/gemini-3.1-flash-lite': 'gemini-flash-lite-latest',
  'google/gemini-2.5-flash-lite': 'gemini-flash-lite-latest',
  'google/gemini-3.5-flash': 'gemini-3.8-flash',
  'google/gemini-3.6-flash': 'gemini-3.8-flash',
  'google/gemini-3.7-flash': 'gemini-3.8-flash',
  'google/gemini-3.8-flash': 'gemini-3.8-flash',
  'google/gemini-2.5-flash': 'gemini-3.8-flash',
  'google/gemini-2.0-flash': 'gemini-3.8-flash',
  'google/gemini-3.1-pro-preview': 'gemini-pro-latest',
  'google/gemini-2.5-pro': 'gemini-pro-latest',
};

const FALLBACK_GOOGLE_MODEL = 'gemini-3.8-flash';

export function toGoogleModel(model: string): string {
  if (MODEL_MAP[model]) return MODEL_MAP[model];
  if (!model.startsWith('google/')) return model;
  const bare = model.slice('google/'.length);
  if (/^gemini-[0-2]\./.test(bare)) return FALLBACK_GOOGLE_MODEL;
  return bare;
}

/* ------------------------------ key sources -------------------------------- */

let cachedKeys: string[] | null = null;
let databaseKeys: string[] = [];
let databaseLoadedAt = 0;
let databaseLoad: Promise<void> | null = null;

function parseKeyList(raw: string | undefined | null): string[] {
  if (!raw) return [];
  return raw
    .split(/[,;\n\r]+/g)
    .map((value) => value.trim())
    .filter(Boolean);
}

function environmentKeys(): string[] {
  const keys: string[] = [];

  for (const name of [
    'GEMINI_API_KEYS',
    'ALSAMOS_AI_API_KEYS',
    'ALSAMOS_SEARCH_API_KEYS',
  ]) {
    keys.push(...parseKeyList(Deno.env.get(name)));
  }

  for (let index = 1; index <= 20; index += 1) {
    const key = Deno.env.get(`GEMINI_API_KEY_${index}`)?.trim();
    if (key) keys.push(key);
  }

  // These old names are aliases only. They no longer decide which product is
  // allowed to use the key: every value joins the same shared pool.
  for (const name of [
    'GEMINI_API_KEY',
    'ALSAMOS_SEARCH_API_KEY',
    'GOOGLE_API_KEY',
  ]) {
    const key = Deno.env.get(name)?.trim();
    if (key) keys.push(key);
  }

  return keys;
}

async function refreshDatabaseKeys(force = false): Promise<void> {
  const now = Date.now();
  if (!force && databaseLoadedAt && now - databaseLoadedAt < DB_REFRESH_MS) return;
  if (databaseLoad) return databaseLoad;

  const supabaseUrl = Deno.env.get('SUPABASE_URL')?.replace(/\/+$/, '');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim();

  if (!supabaseUrl || !serviceRoleKey) {
    databaseLoadedAt = now;
    return;
  }

  databaseLoad = (async () => {
    try {
      const response = await fetch(
        `${supabaseUrl}/rest/v1/ai_api_key_pool?select=api_key&is_active=eq.true&order=priority.asc,id.asc`,
        {
          headers: {
            apikey: serviceRoleKey,
            Authorization: `Bearer ${serviceRoleKey}`,
            Accept: 'application/json',
          },
          signal: AbortSignal.timeout(3500),
        },
      );

      if (!response.ok) {
        console.warn(`Gemini key pool database refresh failed: HTTP ${response.status}`);
        return;
      }

      const rows = await response.json().catch(() => []);
      if (!Array.isArray(rows)) return;

      databaseKeys = rows
        .map((row: { api_key?: unknown }) =>
          typeof row?.api_key === 'string' ? row.api_key.trim() : '',
        )
        .filter(Boolean);
      cachedKeys = null;
    } catch (error) {
      console.warn(
        'Gemini key pool database refresh failed:',
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      databaseLoadedAt = Date.now();
      databaseLoad = null;
    }
  })();

  return databaseLoad;
}

export function geminiKeys(): string[] {
  if (cachedKeys) return cachedKeys;
  cachedKeys = [...new Set([...environmentKeys(), ...databaseKeys])];
  return cachedKeys;
}

export async function ensureGeminiKeys(): Promise<string[]> {
  await refreshDatabaseKeys();
  return geminiKeys();
}

export function hasGeminiKeys(): boolean {
  if (geminiKeys().length > 0) return true;

  // Let aiFetch perform the async database refresh before rejecting a request.
  return Boolean(
    Deno.env.get('SUPABASE_URL') && Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
  );
}

/* ------------------------------ rotation state ------------------------------ */

let cursor = 0;
const cooldownUntil = new Map<string, number>();

async function available(): Promise<string[]> {
  await refreshDatabaseKeys();
  const now = Date.now();
  const keys = geminiKeys();
  const ready = keys.filter((key) => (cooldownUntil.get(key) ?? 0) <= now);
  return ready.length ? ready : keys;
}

function markCooldown(key: string, status: number): void {
  const duration = status === 401 || status === 403
    ? DEAD_COOLDOWN_MS
    : COOLDOWN_MS;
  cooldownUntil.set(key, Date.now() + duration);
}

function shouldRotate(status: number): boolean {
  return status === 401 ||
    status === 403 ||
    status === 404 ||
    status === 408 ||
    status === 409 ||
    status === 429 ||
    status >= 500;
}

/* -------------------------------- chat AI ---------------------------------- */

export type AiFetchOptions = {
  body: Record<string, unknown>;
  lovableKey?: string;
  signal?: AbortSignal;
};

export type AiFetchResult = {
  response: Response;
  provider: 'gemini' | 'lovable';
  keyIndex: number;
};

async function lovableFetch(
  body: Record<string, unknown>,
  lovableKey: string,
  signal?: AbortSignal,
): Promise<AiFetchResult> {
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

export async function aiFetch(options: AiFetchOptions): Promise<AiFetchResult> {
  const { body, lovableKey, signal } = options;
  const keys = await available();
  const model = String(body.model ?? '');

  if (!keys.length) {
    if (lovableKey) return lovableFetch(body, lovableKey, signal);
    throw new Error('Gemini API kalitlari topilmadi. Shared key poolni sozlang.');
  }

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
      lastDetail = error instanceof Error ? error.message : 'network error';
      markCooldown(key, 503);
      continue;
    }

    if (response.ok) {
      cursor = (cursor + attempt + 1) % keys.length;
      return { response, provider: 'gemini', keyIndex: attempt + 1 };
    }

    lastStatus = response.status;
    lastDetail = await response.clone().text().catch(() => '');

    if (shouldRotate(response.status)) {
      markCooldown(key, response.status);
      console.warn(
        `Gemini pool key #${attempt + 1} failed: HTTP ${response.status}; rotating`,
      );
      continue;
    }

    if (lovableKey) return lovableFetch(body, lovableKey, signal);
    return { response, provider: 'gemini', keyIndex: attempt + 1 };
  }

  if (lovableKey) return lovableFetch(body, lovableKey, signal);

  throw new Error(
    `Barcha Gemini kalitlari ishlamadi (oxirgi HTTP ${lastStatus || '?'}). ${lastDetail.slice(0, 160)}`.trim(),
  );
}

/* -------------------------- native Google endpoints ------------------------- */

export type GoogleFetchResult = {
  response: Response;
  keyIndex: number;
};

export async function googleFetch(
  pathOrUrl: string,
  init: { method?: string; body?: unknown; signal?: AbortSignal } = {},
): Promise<GoogleFetchResult> {
  const keys = await available();
  if (!keys.length) {
    throw new Error('Gemini API kalitlari topilmadi. Shared key poolni sozlang.');
  }

  const url = pathOrUrl.startsWith('http') ? pathOrUrl : GOOGLE_HOST + pathOrUrl;
  const method = init.method ?? 'POST';
  const hasBody = init.body !== undefined && init.body !== null;

  let lastStatus = 0;
  let lastDetail = '';

  for (let attempt = 0; attempt < keys.length; attempt += 1) {
    const key = keys[(cursor + attempt) % keys.length];

    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers: {
          'x-goog-api-key': key,
          ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
        },
        body: hasBody ? JSON.stringify(init.body) : undefined,
        signal: init.signal,
      });
    } catch (error) {
      lastDetail = error instanceof Error ? error.message : 'network error';
      markCooldown(key, 503);
      continue;
    }

    if (response.ok) {
      cursor = (cursor + attempt + 1) % keys.length;
      return { response, keyIndex: attempt + 1 };
    }

    lastStatus = response.status;
    lastDetail = await response.clone().text().catch(() => '');

    if (shouldRotate(response.status)) {
      markCooldown(key, response.status);
      console.warn(
        `Google API pool key #${attempt + 1} failed: HTTP ${response.status}; rotating`,
      );
      continue;
    }

    return { response, keyIndex: attempt + 1 };
  }

  throw new Error(
    `Google API ishlamadi (oxirgi HTTP ${lastStatus || '?'}). ${lastDetail.slice(0, 160)}`.trim(),
  );
}

export function poolStatus(): { total: number; ready: number } {
  const now = Date.now();
  const keys = geminiKeys();
  return {
    total: keys.length,
    ready: keys.filter((key) => (cooldownUntil.get(key) ?? 0) <= now).length,
  };
}
