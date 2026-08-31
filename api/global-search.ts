type GlobalCategory = 'all' | 'web' | 'wikipedia' | 'news' | 'images' | 'videos';
type Locale = 'uz' | 'ru' | 'en';
type ResultType = 'web' | 'wikipedia' | 'news' | 'image' | 'video';

type SearchResult = {
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
};

const ALLOWED_CATEGORIES = new Set<GlobalCategory>([
  'all',
  'web',
  'wikipedia',
  'news',
  'images',
  'videos',
]);
const ALLOWED_LOCALES = new Set<Locale>(['uz', 'ru', 'en']);
const memoryCache = new Map<string, { at: number; payload: any }>();
const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_MAX = 200;

function setCors(res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function getApiKey(): string {
  return (
    process.env.ALSAMOS_SEARCH_API_KEY ||
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    ''
  ).trim();
}

function getModel(): string {
  return (process.env.ALSAMOS_SEARCH_MODEL || 'gemini-2.5-flash').trim();
}

function cacheGet(key: string) {
  const hit = memoryCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    memoryCache.delete(key);
    return null;
  }
  return hit.payload;
}

function cacheSet(key: string, payload: any) {
  if (memoryCache.size >= CACHE_MAX) {
    const first = memoryCache.keys().next().value as string | undefined;
    if (first) memoryCache.delete(first);
  }
  memoryCache.set(key, { at: Date.now(), payload });
}

async function hashId(input: string) {
  const bytes = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(input),
  );
  return Array.from(new Uint8Array(bytes))
    .slice(0, 16)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function displayUrl(raw: string) {
  try {
    const url = new URL(raw);
    const path = url.pathname
      .split('/')
      .filter(Boolean)
      .slice(0, 3)
      .map((part) => {
        try {
          return decodeURIComponent(part);
        } catch {
          return part;
        }
      })
      .join(' › ');

    return (
      url.hostname.replace(/^www\./, '') +
      (path ? ' › ' + path : '')
    );
  } catch {
    return raw;
  }
}

function sourceFromUrl(raw: string) {
  try {
    return new URL(raw).hostname.replace(/^www\./, '');
  } catch {
    return 'web';
  }
}

function typeFromCategory(
  category: GlobalCategory,
  url: string,
  title: string,
): ResultType {
  if (category === 'images') return 'image';
  if (category === 'videos') return 'video';
  if (category === 'news') return 'news';
  if (
    category === 'wikipedia' ||
    /wikipedia\.org/i.test(url) ||
    /wikipedia/i.test(title)
  ) {
    return 'wikipedia';
  }
  return 'web';
}

function yacyBaseUrl() {
  return (process.env.YACY_SEARCH_BASE || 'https://peer.yacy.space').replace(/\/+$/, '');
}

function yacyQuery(query: string, category: GlobalCategory) {
  if (category === 'wikipedia') return query + ' site:wikipedia.org';
  if (category === 'news') return query + ' /date';
  return query;
}

function yacyContentDomain(category: GlobalCategory) {
  if (category === 'images') return 'image';
  if (category === 'videos') return 'video';
  return 'text';
}

function normalizePublishedAt(value: unknown): string | null {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const timestamp = Date.parse(raw);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

async function runYacySearch(input: {
  query: string;
  category: GlobalCategory;
  page: number;
  pageSize: number;
  locale: Locale;
}) {
  const { query, category, page, pageSize } = input;
  const startRecord = (page - 1) * pageSize;

  const params = new URLSearchParams({
    query: yacyQuery(query, category),
    resource: 'global',
    verify: 'false',
    maximumRecords: String(pageSize),
    startRecord: String(startRecord),
    contentdom: yacyContentDomain(category),
    urlmaskfilter: '.*',
    prefermaskfilter: '',
    nav: 'all',
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 14000);

  try {
    const response = await fetch(
      yacyBaseUrl() + '/yacysearch.json?' + params.toString(),
      {
        method: 'GET',
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          'User-Agent': 'AlsamosSearch/1.0 (+https://www.alsamos.com/)',
        },
      },
    );

    if (!response.ok) {
      throw new Error('YaCy HTTP ' + response.status);
    }

    const data = await response.json();
    const channel = Array.isArray(data?.channels) ? data.channels[0] : null;
    const items = Array.isArray(channel?.items) ? channel.items : [];

    const seen = new Set<string>();
    const results: SearchResult[] = [];

    for (const item of items) {
      const rawUrl = String(item?.link || item?.url || '').trim();
      if (!rawUrl || seen.has(rawUrl)) continue;
      seen.add(rawUrl);

      const title = String(item?.title || sourceFromUrl(rawUrl)).trim();
      const snippet = String(item?.description || item?.content || '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      results.push({
        id: await hashId('yacy:' + rawUrl),
        type: typeFromCategory(category, rawUrl, title),
        title,
        snippet,
        url: rawUrl,
        displayUrl: displayUrl(rawUrl),
        thumbnailUrl:
          typeof item?.image === 'string' && item.image.trim()
            ? item.image.trim()
            : null,
        source: sourceFromUrl(rawUrl),
        publishedAt: normalizePublishedAt(item?.pubDate),
        author: null,
        width: null,
        height: null,
        durationSeconds: null,
      });
    }

    const totalRaw =
      channel?.totalResults ??
      channel?.['opensearch:totalResults'] ??
      results.length;

    const totalEstimated = Number(String(totalRaw).replace(/[^0-9]/g, '')) || results.length;

    return {
      results,
      totalEstimated,
      hasMore:
        Boolean(channel?.hasMoreResults) ||
        results.length === pageSize ||
        totalEstimated > startRecord + results.length,
    };
  } finally {
    clearTimeout(timer);
  }
}

function categoryInstruction(category: GlobalCategory) {
  switch (category) {
    case 'news':
      return 'Prioritize recent news reporting and current authoritative sources.';
    case 'wikipedia':
      return 'Prioritize Wikipedia and encyclopedic reference pages.';
    case 'images':
      return 'Find authoritative pages containing images strongly related to the query.';
    case 'videos':
      return 'Find video pages and pages hosting relevant videos.';
    case 'web':
      return 'Prioritize general web pages that directly answer the query.';
    default:
      return 'Search broadly across the public web and use diverse authoritative sources.';
  }
}

async function runGroundedSearch(input: {
  query: string;
  category: GlobalCategory;
  page: number;
  pageSize: number;
  locale: Locale;
  apiKey: string;
}) {
  const { query, category, page, pageSize, locale, apiKey } = input;
  const model = getModel();

  const prompt = [
    'You are the retrieval engine for Alsamos Global Search.',
    'Use Google Search grounding to search the live public web.',
    'Return factual information supported by real web sources.',
    'Never invent URLs or source titles.',
    categoryInstruction(category),
    'Search locale: ' + locale + '.',
    'Requested result page: ' + page + '.',
    'Aim for ' + Math.min(pageSize, 16) + ' distinct, useful sources.',
    'Write one compact evidence sentence per important source so snippets can be derived from grounding supports.',
    'Search query: ' + query,
  ].join('\n');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 18000);

  try {
    const response = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/' +
        encodeURIComponent(model) +
        ':generateContent',
      {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [{ text: prompt }],
            },
          ],
          tools: [{ google_search: {} }],
          generationConfig: {
            temperature: 0.05,
            maxOutputTokens: 2200,
          },
        }),
      },
    );

    const rawText = await response.text();
    if (!response.ok) {
      let detail = rawText.slice(0, 500);
      try {
        const parsed = JSON.parse(rawText);
        detail =
          parsed?.error?.message ||
          parsed?.error?.status ||
          detail;
      } catch {
        // keep raw detail
      }
      throw new Error(
        'Gemini Search HTTP ' + response.status + ': ' + detail,
      );
    }

    const data = JSON.parse(rawText);
    const candidate = data?.candidates?.[0];
    if (!candidate) {
      throw new Error('Gemini Search returned no candidate.');
    }

    const summary = (candidate?.content?.parts || [])
      .map((part: any) =>
        typeof part?.text === 'string' ? part.text : '',
      )
      .join('')
      .trim();

    const metadata = candidate?.groundingMetadata || {};
    const chunks = Array.isArray(metadata.groundingChunks)
      ? metadata.groundingChunks
      : [];
    const supports = Array.isArray(metadata.groundingSupports)
      ? metadata.groundingSupports
      : [];

    const snippetMap = new Map<number, string[]>();
    for (const support of supports) {
      const segment = String(support?.segment?.text || '')
        .replace(/\s+/g, ' ')
        .trim();
      if (!segment) continue;

      for (const rawIndex of support?.groundingChunkIndices || []) {
        const index = Number(rawIndex);
        if (!Number.isInteger(index)) continue;
        const list = snippetMap.get(index) || [];
        if (!list.includes(segment)) list.push(segment);
        snippetMap.set(index, list);
      }
    }

    const seen = new Set<string>();
    const results: SearchResult[] = [];

    for (
      let index = 0;
      index < chunks.length && results.length < pageSize;
      index += 1
    ) {
      const web = chunks[index]?.web;
      const url = String(web?.uri || '').trim();
      if (!url || seen.has(url)) continue;
      seen.add(url);

      const title =
        String(web?.title || '').trim() ||
        sourceFromUrl(url);
      const snippet =
        (snippetMap.get(index) || []).join(' ').trim() ||
        summary.slice(0, 420);

      results.push({
        id: await hashId('alsamos-global:' + url),
        type: typeFromCategory(category, url, title),
        title,
        snippet,
        url,
        displayUrl: displayUrl(url),
        thumbnailUrl: null,
        source: sourceFromUrl(url),
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
      finishReason: candidate?.finishReason || null,
    };
  } finally {
    clearTimeout(timer);
  }
}

async function parseBody(req: any) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string' && req.body.trim()) {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return {};
}

export default async function handler(req: any, res: any) {
  setCors(res);

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST' && req.method !== 'GET') {
    res.status(405).json({
      error: {
        code: 'METHOD_NOT_ALLOWED',
        message: 'GET yoki POST ishlating.',
      },
    });
    return;
  }

  const body =
    req.method === 'POST'
      ? await parseBody(req)
      : req.query || {};

  const query = String(body?.query ?? body?.q ?? '')
    .trim()
    .slice(0, 300);

  const requestedCategory = String(body?.category ?? 'all');
  const category: GlobalCategory = ALLOWED_CATEGORIES.has(
    requestedCategory as GlobalCategory,
  )
    ? (requestedCategory as GlobalCategory)
    : 'all';

  const requestedLocale = String(body?.locale ?? 'uz');
  const locale: Locale = ALLOWED_LOCALES.has(
    requestedLocale as Locale,
  )
    ? (requestedLocale as Locale)
    : 'uz';

  const page = Math.max(
    1,
    Math.min(20, Number(body?.page) || 1),
  );
  const pageSize = Math.max(
    1,
    Math.min(20, Number(body?.pageSize) || 20),
  );

  if (!query) {
    res.status(400).json({
      query,
      category,
      page,
      totalEstimated: 0,
      tookMs: 0,
      results: [],
      error: {
        code: 'INVALID_QUERY',
        message: 'Query is required.',
      },
    });
    return;
  }

  // Global Search must work without a proprietary API key.
  // YaCy's public freeworld peer is the primary engine; Gemini grounding is only
  // an optional fallback when a server-side key is configured.
  const apiKey = getApiKey();

  const cacheKey = [
    query.toLowerCase(),
    category,
    locale,
    page,
    pageSize,
  ].join('|');
  const cached = cacheGet(cacheKey);

  if (cached) {
    res.setHeader(
      'Cache-Control',
      'private, max-age=60, s-maxage=180, stale-while-revalidate=300',
    );
    res.status(200).json({
      ...cached,
      cached: true,
    });
    return;
  }

  const startedAt = Date.now();

  try {
    let results: SearchResult[] = [];
    let totalEstimated = 0;
    let engine = 'yacy-freeworld';
    let summary: string | null = null;
    let searchSuggestionHtml: string | null = null;
    let searchQueries: string[] = [];
    const upstreamErrors: string[] = [];

    try {
      const yacy = await runYacySearch({
        query,
        category,
        page,
        pageSize,
        locale,
      });
      results = yacy.results;
      totalEstimated = yacy.totalEstimated;
    } catch (error) {
      upstreamErrors.push(
        'yacy: ' + (error instanceof Error ? error.message : String(error)),
      );
    }

    if (results.length === 0 && apiKey && page === 1) {
      try {
        const grounded = await runGroundedSearch({
          query,
          category,
          page,
          pageSize,
          locale,
          apiKey,
        });

        results = grounded.results;
        totalEstimated = grounded.results.length;
        summary = grounded.summary;
        searchSuggestionHtml = grounded.searchSuggestionHtml;
        searchQueries = grounded.searchQueries;
        engine = 'gemini-google-search-fallback';
      } catch (error) {
        upstreamErrors.push(
          'gemini: ' + (error instanceof Error ? error.message : String(error)),
        );
      }
    }

    if (upstreamErrors.length) {
      console.warn('Alsamos Global Search upstream notes:', upstreamErrors);
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
      error:
        results.length > 0
          ? null
          : {
              code: 'NO_RESULTS',
              message:
                "Internet qidiruvi bajarildi, lekin bu so'rov uchun natija topilmadi.",
            },
    };

    cacheSet(cacheKey, payload);

    res.setHeader(
      'Cache-Control',
      'private, max-age=60, s-maxage=180, stale-while-revalidate=300',
    );
    res.status(200).json(payload);
  } catch (error) {
    console.error('Alsamos Global Search failed:', error);
    res.status(502).json({
      query,
      category,
      page,
      totalEstimated: 0,
      tookMs: Date.now() - startedAt,
      results: [],
      engine: 'yacy-freeworld',
      error: {
        code: 'SEARCH_UPSTREAM_ERROR',
        message:
          error instanceof Error
            ? error.message
            : 'Internet qidiruvi vaqtincha ishlamayapti.',
      },
    });
  }
}
