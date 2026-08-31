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

    return url.hostname.replace(/^www\./, '') + (path ? ' › ' + path : '');
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

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#x([0-9a-f]+);/gi, (_, code) =>
      String.fromCharCode(parseInt(code, 16)),
    )
    .replace(/&#(\d+);/g, (_, code) =>
      String.fromCharCode(Number(code)),
    );
}

function plainText(value: string) {
  return decodeHtmlEntities(
    value
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/\s+/g, ' ')
    .trim();
}

function duckDuckGoTarget(rawHref: string) {
  const href = decodeHtmlEntities(rawHref.trim());
  try {
    const normalized = href.startsWith('//') ? 'https:' + href : href;
    const url = new URL(normalized, 'https://html.duckduckgo.com');

    const uddg = url.searchParams.get('uddg');
    if (uddg) {
      const decoded = decodeURIComponent(uddg);
      const target = new URL(decoded);
      if (target.protocol === 'http:' || target.protocol === 'https:') {
        return target.toString();
      }
    }

    if (url.hostname.endsWith('duckduckgo.com')) return null;
    if (url.protocol === 'http:' || url.protocol === 'https:') return url.toString();
    return null;
  } catch {
    return null;
  }
}

function duckDuckGoQuery(query: string, category: GlobalCategory) {
  if (category === 'wikipedia') return query + ' site:wikipedia.org';
  if (category === 'news') return query + ' news';
  return query;
}

async function runDuckDuckGoSearch(input: {
  query: string;
  category: GlobalCategory;
  page: number;
  pageSize: number;
}) {
  if (input.category === 'images' || input.category === 'videos') {
    return {
      results: [] as SearchResult[],
      totalEstimated: 0,
    };
  }

  const params = new URLSearchParams({
    q: duckDuckGoQuery(input.query, input.category),
    s: String(Math.max(0, (input.page - 1) * input.pageSize)),
    kl: 'wt-wt',
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8500);

  try {
    const response = await fetch(
      'https://html.duckduckgo.com/html/?' + params.toString(),
      {
        method: 'GET',
        signal: controller.signal,
        redirect: 'follow',
        headers: {
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Language': 'en-US,en;q=0.8',
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
            '(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        },
      },
    );

    if (!response.ok) {
      throw new Error('DuckDuckGo HTTP ' + response.status);
    }

    const html = await response.text();
    const resultAnchor =
      /<a[^>]*class=["'][^"']*result__a[^"']*["'][^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    const anchors = Array.from(html.matchAll(resultAnchor));
    const results: SearchResult[] = [];
    const seen = new Set<string>();

    for (let index = 0; index < anchors.length; index += 1) {
      const match = anchors[index];
      const rawUrl = duckDuckGoTarget(match[1] || '');
      if (!rawUrl || seen.has(rawUrl)) continue;
      seen.add(rawUrl);

      const title = plainText(match[2] || '') || sourceFromUrl(rawUrl);
      const blockStart = match.index ?? 0;
      const blockEnd =
        index + 1 < anchors.length
          ? anchors[index + 1].index ?? html.length
          : Math.min(html.length, blockStart + 8000);
      const block = html.slice(blockStart, blockEnd);
      const snippetMatch =
        /<(?:a|div)[^>]*class=["'][^"']*result__snippet[^"']*["'][^>]*>([\s\S]*?)<\/(?:a|div)>/i.exec(
          block,
        );
      const snippet = snippetMatch ? plainText(snippetMatch[1]) : '';

      results.push({
        id: await hashId('ddg:' + rawUrl),
        type: typeFromCategory(input.category, rawUrl, title),
        title,
        snippet,
        url: rawUrl,
        displayUrl: displayUrl(rawUrl),
        thumbnailUrl: null,
        source: sourceFromUrl(rawUrl),
        publishedAt: null,
        author: null,
        width: null,
        height: null,
        durationSeconds: null,
      });

      if (results.length >= input.pageSize) break;
    }

    return {
      results,
      totalEstimated: results.length,
    };
  } finally {
    clearTimeout(timer);
  }
}

function yacyBaseUrls() {
  const configured = (process.env.YACY_SEARCH_BASES || process.env.YACY_SEARCH_BASE || '')
    .split(',')
    .map((value) => value.trim().replace(/\/+$/, ''))
    .filter(Boolean);

  if (configured.length > 0) return configured;

  return [
    'https://peer.yacy.space',
    'https://yacy.searchlab.eu',
    'https://search.lomig.me',
    'https://yacy.ecosys.eu',
    'https://search.webproject.link',
  ];
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

async function fetchYacyPeer(input: {
  baseUrl: string;
  query: string;
  category: GlobalCategory;
  page: number;
  pageSize: number;
  resource: 'global' | 'local';
}) {
  const { baseUrl, query, category, page, pageSize, resource } = input;
  const startRecord = (page - 1) * pageSize;
  const params = new URLSearchParams({
    query: yacyQuery(query, category),
    resource,
    verify: 'false',
    maximumRecords: String(pageSize),
    startRecord: String(startRecord),
    contentdom: yacyContentDomain(category),
    urlmaskfilter: '.*',
    prefermaskfilter: '',
    nav: 'all',
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 7500);

  try {
    const response = await fetch(
      baseUrl + '/yacysearch.json?' + params.toString(),
      {
        method: 'GET',
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          'User-Agent': 'AlsamosSearch/1.0 (+https://www.alsamos.com/)',
        },
      },
    );

    if (!response.ok) throw new Error(baseUrl + ' HTTP ' + response.status);

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
    const totalEstimated =
      Number(String(totalRaw).replace(/[^0-9]/g, '')) || results.length;

    return {
      baseUrl,
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

async function queryYacyPool(
  input: {
    query: string;
    category: GlobalCategory;
    page: number;
    pageSize: number;
  },
  resource: 'global' | 'local',
) {
  const peers = yacyBaseUrls();
  const settled = await Promise.allSettled(
    peers.map((baseUrl) =>
      fetchYacyPeer({
        baseUrl,
        query: input.query,
        category: input.category,
        page: input.page,
        pageSize: input.pageSize,
        resource,
      }),
    ),
  );

  const fulfilled = settled
    .filter(
      (entry): entry is PromiseFulfilledResult<
        Awaited<ReturnType<typeof fetchYacyPeer>>
      > => entry.status === 'fulfilled',
    )
    .map((entry) => entry.value);

  const failures = settled
    .filter(
      (entry): entry is PromiseRejectedResult => entry.status === 'rejected',
    )
    .map((entry) =>
      entry.reason instanceof Error ? entry.reason.message : String(entry.reason),
    );

  // Merge results from every responsive peer. Public YaCy peers can return
  // different slices of the freeworld index at the same moment, so selecting
  // only one peer makes production unnecessarily flaky.
  const seen = new Set<string>();
  const merged: SearchResult[] = [];
  let totalEstimated = 0;
  const contributingPeers: string[] = [];

  for (const result of fulfilled.sort((a, b) => b.results.length - a.results.length)) {
    totalEstimated = Math.max(totalEstimated, result.totalEstimated);
    if (result.results.length > 0) contributingPeers.push(result.baseUrl);

    for (const item of result.results) {
      if (seen.has(item.url)) continue;
      seen.add(item.url);
      merged.push(item);
      if (merged.length >= input.pageSize) break;
    }

    if (merged.length >= input.pageSize) break;
  }

  return {
    results: merged,
    totalEstimated: Math.max(totalEstimated, merged.length),
    contributingPeers,
    failures,
  };
}

async function runYacySearch(input: {
  query: string;
  category: GlobalCategory;
  page: number;
  pageSize: number;
  locale: Locale;
}) {
  // First query the distributed freeworld network.
  const global = await queryYacyPool(input, 'global');
  if (global.results.length > 0) {
    return {
      ...global,
      resource: 'global' as const,
    };
  }

  // If the P2P query is temporarily empty, use each peer's local index.
  // This avoids turning a transient freeworld miss into a user-visible outage.
  const local = await queryYacyPool(input, 'local');
  if (local.results.length > 0) {
    return {
      ...local,
      resource: 'local' as const,
      failures: [...global.failures, ...local.failures],
    };
  }

  const failures = [...global.failures, ...local.failures];
  if (failures.length >= yacyBaseUrls().length * 2) {
    throw new Error(failures.join(' | ') || 'No YaCy peer responded');
  }

  return {
    results: [] as SearchResult[],
    totalEstimated: 0,
    contributingPeers: [] as string[],
    failures,
    resource: 'global' as const,
  };
}

function navigationalResult(
  query: string,
  category: GlobalCategory,
): Promise<SearchResult | null> {
  if (category !== 'all' && category !== 'web') return Promise.resolve(null);

  const value = query.trim().toLowerCase();
  if (
    /\s/.test(value) ||
    !/^(?:https?:\/\/)?(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s]*)?$/.test(value)
  ) {
    return Promise.resolve(null);
  }

  const url = /^https?:\/\//.test(value) ? value : 'https://' + value;
  const host = sourceFromUrl(url);
  if (!host || host === 'web') return Promise.resolve(null);

  return hashId('nav:' + url).then((id) => ({
    id,
    type: 'web',
    title: host,
    snippet: "To'g'ridan-to'g'ri veb-manzil.",
    url,
    displayUrl: displayUrl(url),
    thumbnailUrl: null,
    source: host,
    publishedAt: null,
    author: null,
    width: null,
    height: null,
    durationSeconds: null,
  }));
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

  // Global Search is keyless and independent from paid search APIs.
  // YaCy is primary; DuckDuckGo HTML is a resilient web fallback.

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
      if (yacy.results.length > 0) {
        const peerLabel = yacy.contributingPeers
          .slice(0, 2)
          .map((url) => sourceFromUrl(url))
          .join(',');
        engine =
          yacy.resource === 'local'
            ? 'yacy-local:' + peerLabel
            : 'yacy-freeworld:' + peerLabel;
      }
      if (yacy.failures.length > 0) {
        upstreamErrors.push(...yacy.failures.map((failure) => 'yacy-peer: ' + failure));
      }
    } catch (error) {
      upstreamErrors.push(
        'yacy: ' + (error instanceof Error ? error.message : String(error)),
      );
    }

    if (results.length === 0) {
      try {
        const ddg = await runDuckDuckGoSearch({
          query,
          category,
          page,
          pageSize,
        });

        if (ddg.results.length > 0) {
          results = ddg.results;
          totalEstimated = Math.max(totalEstimated, ddg.totalEstimated);
          engine = 'duckduckgo-html';
        }
      } catch (error) {
        upstreamErrors.push(
          'duckduckgo: ' +
            (error instanceof Error ? error.message : String(error)),
        );
      }
    }

    if (page === 1) {
      const direct = await navigationalResult(query, category);
      if (direct && !results.some((item) => item.url === direct.url)) {
        results = [direct, ...results].slice(0, pageSize);
        totalEstimated = Math.max(totalEstimated, results.length);
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
      summary: null,
      searchSuggestionHtml: null,
      searchQueries: [],
      error:
        results.length > 0
          ? null
          : {
              code: 'NO_RESULTS',
              message:
                "Internet qidiruvi bajarildi, lekin bu so'rov uchun natija topilmadi.",
            },
    };

    if (results.length > 0 && !payload.error) {
      cacheSet(cacheKey, payload);
    }

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
