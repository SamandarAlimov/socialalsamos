// ============================================================================
// Alsamos Global Search
// ----------------------------------------------------------------------------
// Realtime search and Alsamos AI use the SAME Gemini key pool. The labels used
// when a Google project/key was created do not determine where that key may be
// used. Quota/auth/server failures rotate automatically to the next pool key.
//
// Priority:
//   1) Gemini + Google Search grounding from the shared rotating key pool
//   2) Firecrawl realtime search (and primary image-search provider)
//   3) Alsamos' own crawler/index as a resilient fallback
//
// IMPORTANT: API keys stay server-side. Never expose them as VITE_* variables
// or commit them to this repository.
// ============================================================================

import { createClient } from 'npm:@supabase/supabase-js@2';
import { googleFetch, poolStatus } from '../_shared/geminiPool.ts';

type Category = 'web' | 'wikipedia' | 'news' | 'images' | 'videos' | 'all';
type Locale = 'uz' | 'ru' | 'en';
type ResultType = 'web' | 'wikipedia' | 'news' | 'image' | 'video';

const CATEGORIES: Category[] = ['web', 'wikipedia', 'news', 'images', 'videos', 'all'];
const LOCALES: Locale[] = ['uz', 'ru', 'en'];
const CACHE_TTL_MS = 8 * 60 * 1000;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface SearchResult {
  id: string;
  type: ResultType;
  title: string;
  snippet: string;
  url: string;
  displayUrl: string;
  thumbnailUrl: string | null;
  source: string;
  publishedAt: string | null;
  author: string | null;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
}

interface IndexedRow {
  id: string;
  type: ResultType;
  title: string;
  snippet: string;
  url: string;
  display_url: string;
  thumbnail_url: string | null;
  source: string;
  published_at: string | null;
  author: string | null;
  width: number | null;
  height: number | null;
  duration_seconds: number | null;
  score: number;
}

function env(name: string): string {
  return Deno.env.get(name)?.trim() || '';
}

async function hashId(input: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(bytes))
    .slice(0, 16)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function toDisplayUrl(raw: string): string {
  try {
    const url = new URL(raw);
    const path = url.pathname
      .split('/')
      .filter(Boolean)
      .slice(0, 3)
      .map((part) => decodeURIComponent(part))
      .join(' › ');
    return url.hostname.replace(/^www\./, '') + (path ? ' › ' + path : '');
  } catch {
    return raw;
  }
}

function sourceName(raw: string): string {
  try {
    return new URL(raw).hostname.replace(/^www\./, '');
  } catch {
    return 'web';
  }
}

function categoryType(category: Category, url: string): ResultType {
  if (category === 'images') return 'image';
  if (category === 'videos') return 'video';
  if (category === 'news') return 'news';
  if (category === 'wikipedia' || /wikipedia\.org/i.test(url)) return 'wikipedia';
  return 'web';
}

function publishedAt(value: unknown): string | null {
  if (!value) return null;
  const time = Date.parse(String(value));
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

function firecrawlQuery(query: string, category: Category): string {
  if (category === 'wikipedia') return `${query} site:wikipedia.org`;
  if (category === 'videos') return `${query} (site:youtube.com OR site:vimeo.com)`;
  return query;
}

function firecrawlSources(category: Category): string[] {
  if (category === 'images') return ['images'];
  if (category === 'news') return ['news'];
  if (category === 'all') return ['web', 'news', 'images'];
  return ['web'];
}

async function firecrawlSearch(
  query: string,
  category: Category,
  page: number,
  pageSize: number,
): Promise<{ results: SearchResult[]; engine: string }> {
  const firecrawlKey = env('FIRECRAWL_API_KEY');
  const lovableKey = env('LOVABLE_API_KEY');
  if (!firecrawlKey) throw new Error('FIRECRAWL_API_KEY_NOT_CONFIGURED');

  const body = {
    query: firecrawlQuery(query, category),
    limit: Math.min(100, Math.max(pageSize, page * pageSize)),
    sources: firecrawlSources(category),
    safe: true,
    timeout: 30000,
    ignoreInvalidURLs: true,
  };

  const attempts: Array<{
    name: string;
    url: string;
    headers: Record<string, string>;
  }> = [];

  if (lovableKey) {
    attempts.push({
      name: 'firecrawl-lovable',
      url: 'https://connector-gateway.lovable.dev/firecrawl/v2/search',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${lovableKey}`,
        'X-Connection-Api-Key': firecrawlKey,
      },
    });
  }

  attempts.push({
    name: 'firecrawl-direct',
    url: 'https://api.firecrawl.dev/v2/search',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${firecrawlKey}`,
    },
  });

  const errors: string[] = [];

  for (const attempt of attempts) {
    try {
      const response = await fetch(attempt.url, {
        method: 'POST',
        headers: attempt.headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(35_000),
      });
      const raw = await response.text();
      let payload: any = {};
      try {
        payload = raw ? JSON.parse(raw) : {};
      } catch {
        payload = {};
      }

      if (!response.ok || payload?.success === false) {
        errors.push(`${attempt.name} ${response.status}: ${String(payload?.error || raw).slice(0, 220)}`);
        continue;
      }

      const data = payload?.data ?? payload ?? {};
      const web = Array.isArray(data)
        ? data
        : Array.isArray(data?.web) ? data.web : [];
      const news = Array.isArray(data?.news) ? data.news : [];
      const images = Array.isArray(data?.images) ? data.images : [];
      const rows: Array<{ kind: ResultType; item: any }> = [];

      if (category === 'images') {
        images.forEach((item: any) => rows.push({ kind: 'image', item }));
      } else if (category === 'news') {
        news.forEach((item: any) => rows.push({ kind: 'news', item }));
      } else if (category === 'all') {
        web.forEach((item: any) => rows.push({ kind: categoryType(category, String(item?.url || '')), item }));
        news.forEach((item: any) => rows.push({ kind: 'news', item }));
        images.forEach((item: any) => rows.push({ kind: 'image', item }));
      } else {
        web.forEach((item: any) => rows.push({ kind: categoryType(category, String(item?.url || '')), item }));
      }

      const start = Math.max(0, (page - 1) * pageSize);
      const selected = rows.slice(start, start + pageSize);
      const seen = new Set<string>();
      const results: SearchResult[] = [];

      for (const row of selected) {
        const item = row.item ?? {};
        const pageUrl = String(item?.url || item?.metadata?.sourceURL || item?.metadata?.url || '').trim();
        const imageUrl = String(item?.imageUrl || '').trim();
        const targetUrl = pageUrl || (row.kind === 'image' ? imageUrl : '');
        if (!targetUrl || seen.has(targetUrl)) continue;
        seen.add(targetUrl);

        const title = String(item?.title || item?.metadata?.title || sourceName(targetUrl)).trim();
        const snippet = String(
          item?.description || item?.snippet || item?.metadata?.description || item?.markdown || '',
        )
          .replace(/[#*_>\[\]`]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 700);

        results.push({
          id: await hashId(`firecrawl:${targetUrl}`),
          type: row.kind,
          title,
          snippet,
          url: pageUrl || targetUrl,
          displayUrl: toDisplayUrl(pageUrl || targetUrl),
          thumbnailUrl: row.kind === 'image'
            ? imageUrl || null
            : String(item?.imageUrl || item?.screenshot || '').trim() || null,
          source: sourceName(pageUrl || targetUrl),
          publishedAt: publishedAt(item?.date || item?.publishedAt),
          author: typeof item?.author === 'string' ? item.author : null,
          width: Number.isFinite(Number(item?.imageWidth)) ? Number(item.imageWidth) : null,
          height: Number.isFinite(Number(item?.imageHeight)) ? Number(item.imageHeight) : null,
          durationSeconds: null,
        });
      }

      if (results.length) return { results, engine: attempt.name };
      errors.push(`${attempt.name}: no results`);
    } catch (error) {
      errors.push(`${attempt.name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  throw new Error(errors.join(' | ') || 'Firecrawl search failed');
}

async function geminiGroundedWebSearch(
  query: string,
  category: Category,
  pageSize: number,
  locale: Locale,
): Promise<{
  results: SearchResult[];
  summary: string;
  searchSuggestionHtml: string | null;
  searchQueries: string[];
  keyIndex: number;
}> {
  const model = env('ALSAMOS_SEARCH_MODEL') || 'gemini-3.8-flash';
  const categoryHint = {
    all: 'general web pages from diverse, high quality sources',
    web: 'general web pages',
    wikipedia: 'Wikipedia pages and encyclopedic references',
    news: 'recent news and current reporting',
    images: 'web pages that contain highly relevant images',
    videos: 'video pages and pages hosting relevant videos',
  }[category];

  const prompt = [
    'Act as the retrieval layer for Alsamos Search.',
    'Search the live public web for the user query.',
    'Do not chat with the user and do not invent URLs.',
    'Use Google Search grounding heavily and prefer diverse authoritative sources.',
    `We need approximately ${Math.min(pageSize, 15)} distinct sources.`,
    `Requested result category: ${categoryHint}.`,
    `User locale: ${locale}.`,
    'Write a compact factual search digest so each cited source has a useful supporting sentence.',
    `Query: ${query}`,
  ].join('\n');

  const { response, keyIndex } = await googleFetch(
    `/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      body: {
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        tools: [{ google_search: {} }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 1800,
        },
      },
      signal: AbortSignal.timeout(18_000),
    },
  );

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`gemini-search ${response.status}: ${detail.slice(0, 260)}`);
  }

  const data = await response.json();
  const candidate = data?.candidates?.[0];
  const summary = (candidate?.content?.parts || [])
    .map((part: any) => typeof part?.text === 'string' ? part.text : '')
    .join('')
    .trim();
  const metadata = candidate?.groundingMetadata || {};
  const chunks = Array.isArray(metadata?.groundingChunks) ? metadata.groundingChunks : [];
  const supports = Array.isArray(metadata?.groundingSupports) ? metadata.groundingSupports : [];

  const snippets = new Map<number, string[]>();
  for (const support of supports) {
    const segment = String(support?.segment?.text || '').trim();
    if (!segment) continue;
    for (const rawIndex of support?.groundingChunkIndices || []) {
      const index = Number(rawIndex);
      const list = snippets.get(index) || [];
      if (!list.includes(segment)) list.push(segment);
      snippets.set(index, list);
    }
  }

  const seen = new Set<string>();
  const results: SearchResult[] = [];
  for (let index = 0; index < chunks.length && results.length < pageSize; index += 1) {
    const web = chunks[index]?.web;
    if (!web?.uri) continue;

    const url = String(web.uri).trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);

    const snippet = (snippets.get(index) || []).join(' ').replace(/\s+/g, ' ').trim();
    results.push({
      id: await hashId(`grounded:${url}`),
      type: categoryType(category, url),
      title: String(web.title || sourceName(url)),
      snippet: snippet || summary.slice(0, 420),
      url,
      displayUrl: toDisplayUrl(url),
      thumbnailUrl: null,
      source: sourceName(url),
      publishedAt: null,
      author: null,
      width: null,
      height: null,
      durationSeconds: null,
    });
  }

  return {
    results,
    summary,
    searchSuggestionHtml: typeof metadata?.searchEntryPoint?.renderedContent === 'string'
      ? metadata.searchEntryPoint.renderedContent
      : null,
    searchQueries: Array.isArray(metadata?.webSearchQueries)
      ? metadata.webSearchQueries.map(String)
      : [],
    keyIndex,
  };
}

async function firstPartyIndexSearch(
  admin: any,
  query: string,
  category: Category,
  page: number,
  pageSize: number,
  locale: Locale,
): Promise<SearchResult[]> {
  const offset = (page - 1) * pageSize;
  const { data, error } = await admin.rpc('search_web_index', {
    p_query: query,
    p_category: category,
    p_limit: pageSize,
    p_offset: offset,
    p_locale: locale,
  });
  if (error) throw error;

  return ((data ?? []) as IndexedRow[]).map((row) => ({
    id: row.id,
    type: row.type,
    title: row.title,
    snippet: row.snippet,
    url: row.url,
    displayUrl: row.display_url,
    thumbnailUrl: row.thumbnail_url,
    source: row.source,
    publishedAt: row.published_at,
    author: row.author,
    width: row.width,
    height: row.height,
    durationSeconds: row.duration_seconds,
  }));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  const startedAt = Date.now();
  const json = (body: unknown) => new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });

  let query = '';
  let category: Category = 'all';
  let page = 1;
  let pageSize = 20;
  let locale: Locale = 'uz';

  try {
    const body = await req.json().catch(() => ({}));
    query = String(body?.query ?? '').trim().slice(0, 300);

    const requestedCategory = String(body?.category ?? 'all');
    category = (CATEGORIES as string[]).includes(requestedCategory)
      ? requestedCategory as Category
      : 'all';

    page = Math.max(1, Math.min(100, Number(body?.page) || 1));
    pageSize = Math.max(1, Math.min(50, Number(body?.pageSize) || 20));

    const requestedLocale = String(body?.locale ?? 'uz');
    locale = (LOCALES as string[]).includes(requestedLocale)
      ? requestedLocale as Locale
      : 'uz';

    if (!query) {
      return json({
        query,
        category,
        page,
        totalEstimated: 0,
        tookMs: Date.now() - startedAt,
        results: [],
        error: { code: 'INVALID_QUERY', message: 'Query is required.' },
      });
    }

    const supabaseUrl = env('SUPABASE_URL');
    const serviceRoleKey = env('SUPABASE_SERVICE_ROLE_KEY');
    const admin = supabaseUrl && serviceRoleKey
      ? createClient(supabaseUrl, serviceRoleKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        })
      : null;

    const cacheKey = [
      'global-v4',
      locale,
      category,
      page,
      pageSize,
      query.toLocaleLowerCase(),
    ].join(':');

    if (admin) {
      try {
        const { data: cached } = await admin
          .from('search_cache')
          .select('results, created_at')
          .eq('cache_key', cacheKey)
          .maybeSingle();

        if (
          cached &&
          Date.now() - new Date(cached.created_at as string).getTime() < CACHE_TTL_MS
        ) {
          return json({
            ...(cached.results as Record<string, unknown>),
            tookMs: Date.now() - startedAt,
            cached: true,
          });
        }
      } catch {
        // Cache is optional.
      }
    }

    const errors: string[] = [];
    let results: SearchResult[] = [];
    let totalEstimated = 0;
    let engine = 'none';
    let summary: string | null = null;
    let searchSuggestionHtml: string | null = null;
    let searchQueries: string[] = [];
    let aiKeyIndex: number | null = null;

    const firecrawlKey = env('FIRECRAWL_API_KEY');

    // Gemini + Google Search is the primary realtime provider for page 1.
    // Image search stays on Firecrawl because grounding URLs do not reliably
    // contain direct image thumbnails.
    if (page === 1 && category !== 'images') {
      try {
        const grounded = await geminiGroundedWebSearch(
          query,
          category,
          Math.min(pageSize, 15),
          locale,
        );
        results = grounded.results;
        totalEstimated = results.length;
        summary = grounded.summary || null;
        searchSuggestionHtml = grounded.searchSuggestionHtml;
        searchQueries = grounded.searchQueries;
        aiKeyIndex = grounded.keyIndex;
        engine = 'gemini-google-grounding';
      } catch (error) {
        errors.push(`gemini-grounding: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    if (results.length === 0 && firecrawlKey) {
      try {
        const firecrawl = await firecrawlSearch(query, category, page, pageSize);
        results = firecrawl.results;
        totalEstimated = (page - 1) * pageSize + results.length +
          (results.length === pageSize ? pageSize : 0);
        engine = firecrawl.engine;
      } catch (error) {
        errors.push(`firecrawl: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    if (results.length === 0 && admin) {
      try {
        results = await firstPartyIndexSearch(admin, query, category, page, pageSize, locale);
        totalEstimated = (page - 1) * pageSize + results.length +
          (results.length === pageSize ? pageSize : 0);
        engine = 'alsamos-index';
      } catch (error) {
        errors.push(`alsamos-index: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    const pool = poolStatus();
    const payload = {
      query,
      category,
      page,
      totalEstimated,
      tookMs: Date.now() - startedAt,
      results,
      engine,
      summary,
      searchSuggestionHtml,
      searchQueries,
      aiKeyIndex,
      aiKeyPool: { total: pool.total, ready: pool.ready },
      error: results.length === 0
        ? {
            code: 'SEARCH_UNAVAILABLE',
            message: "Internet qidiruvi hozir javob bermadi. Birozdan so'ng qayta urinib ko'ring.",
          }
        : null,
    };

    if (errors.length) console.error('global-search provider errors', errors);

    if (admin && results.length > 0) {
      try {
        await admin.from('search_cache').upsert(
          {
            cache_key: cacheKey,
            results: payload,
            created_at: new Date().toISOString(),
          },
          { onConflict: 'cache_key' },
        );
      } catch {
        // Cache write is optional.
      }
    }

    return json(payload);
  } catch (error) {
    console.error('global-search fatal', error);
    return json({
      query,
      category,
      page,
      totalEstimated: 0,
      tookMs: Date.now() - startedAt,
      results: [],
      error: {
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Unexpected error',
      },
    });
  }
});
