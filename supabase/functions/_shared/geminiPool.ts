/**
 * Shared Gemini API key pool for every Alsamos AI surface.
 *
 * AI Page, AI Search, live search grounding, image/video helpers and any other
 * Gemini caller must use this module instead of choosing a key by variable name.
 * A key that hits quota/auth/server errors is cooled down and the same request
 * is retried with the next key automatically.
 *
 * Secrets are never committed here. Keys may come from:
 *   - Alsamos (the shared Edge Functions secret used by the current project)
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

// These project keys were verified to work with Flash-Lite while higher-tier
// model IDs may be unavailable for a particular Google project/quota. Until the
// production billing/model matrix is finalized, every text route uses the same
// reliable shared fallback. This keeps AI Page, AI Search and grounded search
// working instead of failing the whole request on a model-access mismatch.
const SAFE_OPENAI_MODEL = 'gemini-flash-lite-latest';
const SAFE_NATIVE_MODEL = 'gemini-3.1-flash-lite';

const MODEL_MAP: Record<string, string> = {
  'google/gemini-3-flash-preview': SAFE_OPENAI_MODEL,
  'google/gemini-3.1-flash-lite': SAFE_OPENAI_MODEL,
  'google/gemini-2.5-flash-lite': SAFE_OPENAI_MODEL,
  'google/gemini-3.5-flash': SAFE_OPENAI_MODEL,
  'google/gemini-3.6-flash': SAFE_OPENAI_MODEL,
  'google/gemini-3.7-flash': SAFE_OPENAI_MODEL,
  'google/gemini-3.8-flash': SAFE_OPENAI_MODEL,
  'google/gemini-2.5-flash': SAFE_OPENAI_MODEL,
  'google/gemini-2.0-flash': SAFE_OPENAI_MODEL,
  'google/gemini-3.1-pro-preview': SAFE_OPENAI_MODEL,
  'google/gemini-2.5-pro': SAFE_OPENAI_MODEL,
};

const FALLBACK_GOOGLE_MODEL = SAFE_OPENAI_MODEL;

export function toGoogleModel(model: string): string {
  const prefixed = model.startsWith('google/') ? model : `google/${model}`;
  if (MODEL_MAP[prefixed]) return MODEL_MAP[prefixed];
  if (!model.startsWith('google/')) return model;
  const bare = model.slice('google/'.length);
  if (/^gemini-[0-2]\./.test(bare)) return FALLBACK_GOOGLE_MODEL;
  return bare;
}

function toNativeGoogleModel(model: string): string {
  const mapped = toGoogleModel(model);
  return mapped === SAFE_OPENAI_MODEL ? SAFE_NATIVE_MODEL : mapped;
}

function normalizeNativeGoogleUrl(pathOrUrl: string): string {
  return pathOrUrl.replace(
    /\/models\/([^/:?]+)(?=:)/,
    (_match, rawModel: string) => {
      const decoded = decodeURIComponent(rawModel);
      return `/models/${encodeURIComponent(toNativeGoogleModel(decoded))}`;
    },
  );
}

/* ------------------------------ key sources -------------------------------- */

let cachedKeys: string[] | null = null;
let databaseKeys: string[] = [];
let databaseLoadedAt = 0;
let databaseLoad: Promise<void> | null = null;

/**
 * Accept either a normal comma/newline-separated bundle or the labelled text
 * copied from Google AI Studio/Cloud. When labelled text is supplied, only
 * actual AQ.* API-key-looking tokens are admitted to the pool, so project IDs
 * and display names can never become fake keys.
 */
function parseKeyList(raw: string | undefined | null): string[] {
  if (!raw) return [];

  const googleKeys = raw.match(/AQ\.[A-Za-z0-9_-]+/g);
  if (googleKeys?.length) return googleKeys;

  return raw
    .split(/[,;\s]+/g)
    .map((value) => value.trim())
    .filter(Boolean);
}

function environmentKeys(): string[] {
  const keys: string[] = [];

  // `Alsamos` is deliberately a bundle, not a product-specific key. AI Page,
  // AI Search and Global Search all consume the same values and rotate together.
  for (const name of [
    'Alsamos',
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

/* ---------------------- quota-safe web search fallback --------------------- */

function plainText(value: unknown): string {
  return String(value ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&#x27;/gi, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function googleSearchPrompt(body: unknown): { query: string; locale: 'uz' | 'ru' | 'en'; limit: number } | null {
  const payload = body as any;
  const tools = Array.isArray(payload?.tools) ? payload.tools : [];
  if (!tools.some((tool: any) => tool?.google_search)) return null;

  const contents = Array.isArray(payload?.contents) ? payload.contents : [];
  const text = contents
    .flatMap((content: any) => Array.isArray(content?.parts) ? content.parts : [])
    .map((part: any) => typeof part?.text === 'string' ? part.text : '')
    .join('\n');

  const query = text.match(/(?:^|\n)Query:\s*(.+?)(?:\n|$)/i)?.[1]?.trim();
  if (!query) return null;

  const rawLocale = text.match(/User locale:\s*(uz|ru|en)/i)?.[1]?.toLowerCase();
  const locale: 'uz' | 'ru' | 'en' = rawLocale === 'ru' || rawLocale === 'en' ? rawLocale : 'uz';
  const rawLimit = Number(text.match(/approximately\s+(\d+)\s+distinct sources/i)?.[1] || 8);
  const limit = Math.max(1, Math.min(10, Number.isFinite(rawLimit) ? rawLimit : 8));

  return { query: query.slice(0, 300), locale, limit };
}

async function wikipediaGroundingFallback(body: unknown): Promise<Response | null> {
  const request = googleSearchPrompt(body);
  if (!request) return null;

  try {
    const host = request.locale === 'ru'
      ? 'ru.wikipedia.org'
      : request.locale === 'en'
        ? 'en.wikipedia.org'
        : 'uz.wikipedia.org';
    const params = new URLSearchParams({
      action: 'query',
      list: 'search',
      srsearch: request.query,
      format: 'json',
      utf8: '1',
      srlimit: String(request.limit),
      origin: '*',
    });

    const response = await fetch(`https://${host}/w/api.php?${params.toString()}`, {
      headers: { 'User-Agent': 'AlsamosSearch/1.0' },
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) return null;

    const payload = await response.json().catch(() => null);
    const rows = Array.isArray(payload?.query?.search) ? payload.query.search : [];
    if (!rows.length) return null;

    const chunks: any[] = [];
    const supports: any[] = [];
    const digest: string[] = [];

    for (const row of rows.slice(0, request.limit)) {
      const title = plainText(row?.title);
      if (!title) continue;
      const snippet = plainText(row?.snippet).slice(0, 700);
      const article = `https://${host}/wiki/${encodeURIComponent(title.replace(/\s+/g, '_'))}`;
      const index = chunks.length;
      chunks.push({ web: { uri: article, title } });
      if (snippet) {
        supports.push({ segment: { text: snippet }, groundingChunkIndices: [index] });
        if (digest.length < 4) digest.push(`${title}: ${snippet}`);
      }
    }

    if (!chunks.length) return null;

    return new Response(JSON.stringify({
      candidates: [{
        content: {
          parts: [{
            text: digest.join('\n') || `Wikipedia results for ${request.query}`,
          }],
        },
        groundingMetadata: {
          groundingChunks: chunks,
          groundingSupports: supports,
          webSearchQueries: [request.query],
        },
      }],
      alsamosFallbackProvider: 'wikipedia',
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'X-Alsamos-Search-Provider': 'wikipedia',
      },
    });
  } catch (error) {
    console.warn(
      'Wikipedia search fallback failed:',
      error instanceof Error ? error.message : String(error),
    );
    return null;
  }
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
    const fallback = await wikipediaGroundingFallback(init.body);
    if (fallback) return { response: fallback, keyIndex: 0 };
    throw new Error('Gemini API kalitlari topilmadi. Shared key poolni sozlang.');
  }

  const normalizedPathOrUrl = normalizeNativeGoogleUrl(pathOrUrl);
  const url = normalizedPathOrUrl.startsWith('http')
    ? normalizedPathOrUrl
    : GOOGLE_HOST + normalizedPathOrUrl;
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

    const fallback = await wikipediaGroundingFallback(init.body);
    if (fallback) return { response: fallback, keyIndex: 0 };
    return { response, keyIndex: attempt + 1 };
  }

  // All configured Gemini keys were tried first. Search-mode requests still get
  // real, attributable web evidence from Wikipedia instead of failing entirely
  // when every Google Search grounding quota is exhausted.
  const fallback = await wikipediaGroundingFallback(init.body);
  if (fallback) return { response: fallback, keyIndex: 0 };

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
