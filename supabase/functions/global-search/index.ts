// ============================================================================
// Alsamos Global Search
// ----------------------------------------------------------------------------
// Priority:
//   1) realtime public-web search through the project's Gemini Google Search
//      grounding (ALSAMOS_SEARCH_API_KEY / GEMINI_API_KEY / GOOGLE_API_KEY)
//   2) optional Google Programmable Search when ALSAMOS_SEARCH_CX is configured
//   3) Alsamos' own crawler/index as a resilient fallback.
//
// IMPORTANT: API keys stay in Supabase Edge Function secrets. Never expose them
// as VITE_* variables or commit them to this repository.
// ============================================================================

import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

type Category = 'web' | 'wikipedia' | 'news' | 'images' | 'videos' | 'all';
type Locale = 'uz' | 'ru' | 'en';
type ResultType = 'web' | 'wikipedia' | 'news' | 'image' | 'video';

const CATEGORIES: Category[] = ['web', 'wikipedia', 'news', 'images', 'videos', 'all'];
const LOCALES: Locale[] = ['uz', 'ru', 'en'];
const CACHE_TTL_MS = 8 * 60 * 1000;

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

function env(name: string) {
  return Deno.env.get(name)?.trim() || '';
}

async function hashId(input: string): Promise<string> {
  const bytes = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(input),
  );
  return Array.from(new Uint8Array(bytes))
    .slice(0, 16)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function toDisplayUrl(raw: string) {
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

function sourceName(raw: string) {
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

function firecrawlQuery(query: string, category: Category) {
  if (category === 'wikipedia') return query + ' site:wikipedia.org';
  if (category === 'videos') return query + ' (site:youtube.com OR site:vimeo.com)';
  return query;
}

function firecrawlSources(category: Category): string[] {
  if (category === 'images') return ['images'];
  if (category === 'news') return ['news'];
  if (category === 'all') return ['web', 'news', 'images'];
  return ['web'];
}

function firecrawlPublished(value: unknown): string | null {
  if (!value) return null;
  const timestamp = Date.parse(String(value));
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
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

  const limit = Math.min(100, Math.max(pageSize, page * pageSize));
  const body = {
    query: firecrawlQuery(query, category),
    limit,
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

  // This is the exact realtime search connector used in
  // SamandarAlimov/instant-find-it.
  if (lovableKey) {
    attempts.push({
      name: 'firecrawl-lovable',
      url: 'https://connector-gateway.lovable.dev/firecrawl/v2/search',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + lovableKey,
        'X-Connection-Api-Key': firecrawlKey,
      },
    });
  }

  // Also support a normal Firecrawl API token.
  attempts.push({
    name: 'firecrawl-direct',
    url: 'https://api.firecrawl.dev/v2/search',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + firecrawlKey,
    },
  });

  const errors: string[] = [];

  for (const attempt of attempts) {
    try {
      const response = await fetch(attempt.url, {
        method: 'POST',
        headers: attempt.headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(35000),
      });
      const raw = await response.text();
      let payload: any = {};
      try {
        payload = raw ? JSON.parse(raw) : {};
      } catch {
        payload = {};
      }

      if (!response.ok || payload?.success === false) {
        errors.push(
          attempt.name + ' ' + response.status + ': ' +
            String(payload?.error || raw).slice(0, 240),
        );
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
        web.forEach((item: any) =>
          rows.push({ kind: categoryType(category, String(item?.url || '')), item })
        );
        news.forEach((item: any) => rows.push({ kind: 'news', item }));
        images.forEach((item: any) => rows.push({ kind: 'image', item }));
      } else {
        web.forEach((item: any) =>
          rows.push({ kind: categoryType(category, String(item?.url || '')), item })
        );
      }

      const start = Math.max(0, (page - 1) * pageSize);
      const selected = rows.slice(start, start + pageSize);
      const seen = new Set<string>();
      const results: SearchResult[] = [];

      for (const row of selected) {
        const item = row.item ?? {};
        const pageUrl = String(
          item?.url || item?.metadata?.sourceURL || item?.metadata?.url || '',
        ).trim();
        const imageUrl = String(item?.imageUrl || '').trim();
        const targetUrl = pageUrl || (row.kind === 'image' ? imageUrl : '');
        if (!targetUrl || seen.has(targetUrl)) continue;
        seen.add(targetUrl);

        const title = String(
          item?.title || item?.metadata?.title || sourceName(targetUrl),
        ).trim();
        const snippet = String(
          item?.description ||
            item?.snippet ||
            item?.metadata?.description ||
            item?.markdown ||
            '',
        )
          .replace(/[#*_>\[\]`]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 700);

        results.push({
          id: await hashId('firecrawl:' + targetUrl),
          type: row.kind,
          title,
          snippet,
          url: pageUrl || targetUrl,
          displayUrl: toDisplayUrl(pageUrl || targetUrl),
          thumbnailUrl:
            row.kind === 'image'
              ? imageUrl || null
              : String(item?.imageUrl || item?.screenshot || '').trim() || null,
          source: sourceName(pageUrl || targetUrl),
          publishedAt: firecrawlPublished(item?.date || item?.publishedAt),
          author: typeof item?.author === 'string' ? item.author : null,
          width: Number.isFinite(Number(item?.imageWidth))
            ? Number(item.imageWidth)
            : null,
          height: Number.isFinite(Number(item?.imageHeight))
            ? Number(item.imageHeight)
            : null,
          durationSeconds: null,
        });
      }

      if (results.length > 0) {
        return { results, engine: attempt.name };
      }
      errors.push(attempt.name + ': no results');
    } catch (error) {
      errors.push(
        attempt.name + ': ' +
          (error instanceof Error ? error.message : String(error)),
      );
    }
  }

  throw new Error(errors.join(' | ') || 'Firecrawl search failed');
}

async function googleProgrammableSearch(
  query: string,
  category: Category,
  page: number,
  pageSize: number,
  locale: Locale,
  apiKey: string,
  cx: string,
): Promise<{ results: SearchResult[]; totalEstimated: number }> {
  const count = Math.min(pageSize, 10);
  const start = Math.min(91, (page - 1) * count + 1);
  const params = new URLSearchParams({
    key: apiKey,
    cx,
    q: query,
    num: String(count),
    start: String(start),
    safe: 'active',
    hl: locale,
  });

  if (category === 'images') params.set('searchType', 'image');
  if (category === 'news') params.set('dateRestrict', 'm6');

  const response = await fetch(
    'https://www.googleapis.com/customsearch/v1?' + params.toString(),
    { signal: AbortSignal.timeout(9000) },
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error('programmable-search ' + response.status + ': ' + body.slice(0, 240));
  }

  const data = await response.json();
  const items = Array.isArray(data?.items) ? data.items : [];
  const results = await Promise.all(items.map(async (item: any) => {
    const url = String(item.link || '');
    const image = item.image || {};
    return {
      id: await hashId('cse:' + url),
      type: categoryType(category, url),
      title: String(item.title || url),
      snippet: String(item.snippet || ''),
      url,
      displayUrl: String(item.formattedUrl || toDisplayUrl(url)),
      thumbnailUrl:
        item.pagemap?.cse_thumbnail?.[0]?.src ||
        item.pagemap?.cse_image?.[0]?.src ||
        image.thumbnailLink ||
        null,
      source: sourceName(url),
      publishedAt: null,
      author: null,
      width: Number.isFinite(Number(image.width)) ? Number(image.width) : null,
      height: Number.isFinite(Number(image.height)) ? Number(image.height) : null,
      durationSeconds: null,
    } satisfies SearchResult;
  }));

  return {
    results,
    totalEstimated: Number(data?.searchInformation?.totalResults || results.length),
  };
}

async function geminiGroundedWebSearch(
  query: string,
  category: Category,
  pageSize: number,
  locale: Locale,
  apiKey: string,
): Promise<{
  results: SearchResult[];
  summary: string;
  searchSuggestionHtml: string | null;
  searchQueries: string[];
}> {
  const model = env('ALSAMOS_SEARCH_MODEL') || 'gemini-2.5-flash';
  const categoryHint = {
    all: 'general web pages from diverse high quality sources',
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
    'We need approximately ' + Math.min(pageSize, 15) + ' distinct sources.',
    'Requested result category: ' + categoryHint + '.',
    'User locale: ' + locale + '.',
    'Write a compact factual search digest so each cited source has a useful supporting sentence.',
    'Query: ' + query,
  ].join('\n');

  const response = await fetch(
    'https://generativelanguage.googleapis.com/v1beta/models/' +
      encodeURIComponent(model) +
      ':generateContent',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      signal: AbortSignal.timeout(16000),
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        tools: [{ google_search: {} }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 1800,
        },
      }),
    },
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error('gemini-search ' + response.status + ': ' + body.slice(0, 300));
  }

  const data = await response.json();
  const candidate = data?.candidates?.[0];
  const summary = (candidate?.content?.parts || [])
    .map((part: any) => typeof part?.text === 'string' ? part.text : '')
    .join('')
    .trim();

  const metadata = candidate?.groundingMetadata || {};
  const chunks = Array.isArray(metadata?.groundingChunks)
    ? metadata.groundingChunks
    : [];
  const supports = Array.isArray(metadata?.groundingSupports)
    ? metadata.groundingSupports
    : [];

  const snippets = new Map<number, string[]>();
  for (const support of supports) {
    const segment = String(support?.segment?.text || '').trim();
    if (!segment) continue;
    for (const index of support?.groundingChunkIndices || []) {
      const list = snippets.get(Number(index)) || [];
      if (!list.includes(segment)) list.push(segment);
      snippets.set(Number(index), list);
    }
  }

  const seen = new Set<string>();
  const results: SearchResult[] = [];

  for (let index = 0; index < chunks.length && results.length < pageSize; index++) {
    const web = chunks[index]?.web;
    if (!web?.uri) continue;

    const url = String(web.uri);
    if (seen.has(url)) continue;
    seen.add(url);

    const snippetParts = snippets.get(index) || [];
    const snippet = snippetParts.join(' ').replace(/\s+/g, ' ').trim();

    results.push({
      id: await hashId('grounded:' + url),
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
    searchSuggestionHtml:
      typeof metadata?.searchEntryPoint?.renderedContent === 'string'
        ? metadata.searchEntryPoint.renderedContent
        : null,
    searchQueries: Array.isArray(metadata?.webSearchQueries)
      ? metadata.webSearchQueries.map(String)
      : [],
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
    return new Response('ok', { headers: corsHeaders });
  }

  const startedAt = Date.now();
  const json = (body: unknown) =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: {
        ...corsHeaders,
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

    const firecrawlKey = env('FIRECRAWL_API_KEY');
    const webApiKey =
      env('ALSAMOS_SEARCH_API_KEY') ||
      env('GEMINI_API_KEY') ||
      env('GOOGLE_API_KEY');
    const programmableCx = env('ALSAMOS_SEARCH_CX');

    const cacheKey = [
      'global-v3',
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

    // Firecrawl from instant-find-it is the primary realtime provider.
    if (firecrawlKey) {
      try {
        const firecrawl = await firecrawlSearch(
          query,
          category,
          page,
          pageSize,
        );
        results = firecrawl.results;
        totalEstimated = (page - 1) * pageSize + results.length +
          (results.length === pageSize ? pageSize : 0);
        engine = firecrawl.engine;
      } catch (error) {
        errors.push(
          'firecrawl: ' +
            (error instanceof Error ? error.message : String(error)),
        );
      }
    }

    // If a Programmable Search Engine ID exists, use it for classic SERP rows.
    if (results.length === 0 && webApiKey && programmableCx && category !== 'videos') {
      try {
        const out = await googleProgrammableSearch(
          query,
          category,
          page,
          pageSize,
          locale,
          webApiKey,
          programmableCx,
        );
        results = out.results;
        totalEstimated = out.totalEstimated;
        engine = 'programmable-web';
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error));
      }
    }

    // Realtime public-web fallback. This needs only the API key and returns
    // verifiable source URLs through Gemini's Google Search grounding metadata.
    if (results.length === 0 && webApiKey && page === 1) {
      try {
        const grounded = await geminiGroundedWebSearch(
          query,
          category,
          Math.min(pageSize, 15),
          locale,
          webApiKey,
        );
        results = grounded.results;
        totalEstimated = results.length;
        summary = grounded.summary || null;
        searchSuggestionHtml = grounded.searchSuggestionHtml;
        searchQueries = grounded.searchQueries;
        engine = 'grounded-realtime-web';
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error));
      }
    }

    // Alsamos crawler/index remains the resilient fallback and long-term
    // independent search foundation.
    if (results.length === 0 && admin) {
      try {
        results = await firstPartyIndexSearch(
          admin,
          query,
          category,
          page,
          pageSize,
          locale,
        );
        totalEstimated = (page - 1) * pageSize + results.length +
          (results.length === pageSize ? pageSize : 0);
        engine = 'alsamos-index';
      } catch (error) {
        errors.push('alsamos-index: ' + (
          error instanceof Error ? error.message : String(error)
        ));
      }
    }

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
      error: results.length === 0
        ? {
            code: firecrawlKey || webApiKey
              ? 'SEARCH_UNAVAILABLE'
              : 'SEARCH_PROVIDER_NOT_CONFIGURED',
            message: firecrawlKey || webApiKey
              ? "Internet qidiruvi hozir javob bermadi. Birozdan so'ng qayta urinib ko'ring."
              : 'Firecrawl yoki boshqa realtime search provider hali production backendga ulanmagan.',
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
