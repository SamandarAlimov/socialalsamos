// ============================================================================
// Alsamos — Global Search Edge Function
// ----------------------------------------------------------------------------
// STABLE PUBLIC CONTRACT (also consumed by the future Flutter client).
// Do not change field names/shapes without versioning the endpoint.
//
//   POST /functions/v1/global-search
//
//   Request:
//   {
//     "query":    string,                                     // required
//     "category": "web"|"wikipedia"|"news"|"images"|"videos"|"all", // default "all"
//     "page":     number,                                     // 1-based, default 1
//     "pageSize": number,                                     // default 20, max 50
//     "locale":   "uz"|"ru"|"en"                              // default "uz"
//   }
//
//   Response (ALWAYS HTTP 200, always this shape):
//   {
//     "query": string,
//     "category": string,
//     "page": number,
//     "totalEstimated": number,
//     "tookMs": number,
//     "results": SearchResult[],
//     "error": null | { "code": string, "message": string }
//   }
//
//   SearchResult:
//   {
//     "id": string,              // stable sha-256 hash of the url
//     "type": "web"|"wikipedia"|"news"|"image"|"video",
//     "title": string,
//     "snippet": string,
//     "url": string,
//     "displayUrl": string,      // e.g. "en.wikipedia.org › wiki › Topic"
//     "thumbnailUrl": string|null,
//     "source": string,          // "wikipedia" | "bing" | "brave" | "yandex" | "youtube" | "newsapi" | "google"
//     "publishedAt": string|null,// ISO date
//     "author": string|null,
//     "width": number|null,
//     "height": number|null,
//     "durationSeconds": number|null
//   }
//
// SECURITY: every external provider is called from here only. No provider key
// is ever shipped to a client. Configure keys as edge function secrets:
//   BING_SEARCH_API_KEY   (web + news + images + videos, single Bing key)
//   BRAVE_SEARCH_API_KEY  (web fallback)
//   YANDEX_SEARCH_API_KEY + YANDEX_SEARCH_USER (web fallback)
//   NEWSAPI_KEY           (news fallback)
//   GOOGLE_CSE_KEY + GOOGLE_CSE_CX (images fallback)
//   YOUTUBE_API_KEY       (videos primary)
// Wikipedia needs no key and always works.
//
// CACHING: `public.search_cache` (cache_key, results jsonb, created_at).
// TTL 15 minutes on read; rows older than 24h are pruned opportunistically.
// ============================================================================

import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

type Category = 'web' | 'wikipedia' | 'news' | 'images' | 'videos' | 'all';
type ResultType = 'web' | 'wikipedia' | 'news' | 'image' | 'video';
type Locale = 'uz' | 'ru' | 'en';

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

const CACHE_TTL_MS = 15 * 60 * 1000;
const CATEGORIES: Category[] = ['web', 'wikipedia', 'news', 'images', 'videos', 'all'];
const LOCALES: Locale[] = ['uz', 'ru', 'en'];

const MARKET: Record<Locale, string> = { uz: 'uz-UZ', ru: 'ru-RU', en: 'en-US' };

const env = (k: string) => Deno.env.get(k)?.trim() || '';

// ── helpers ────────────────────────────────────────────────────────────────
async function hashId(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).slice(0, 16).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function displayUrl(raw: string): string {
  try {
    const u = new URL(raw);
    const parts = u.pathname.split('/').filter(Boolean).map(decodeURIComponent);
    return [u.hostname.replace(/^www\./, ''), ...parts.slice(0, 3)].join(' › ');
  } catch {
    return raw;
  }
}

function stripHtml(s: unknown): string {
  return String(s ?? '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

async function makeResult(r: Omit<SearchResult, 'id'>): Promise<SearchResult> {
  return { ...r, id: await hashId(`${r.type}:${r.url}`) };
}

async function fetchJson(url: string, init?: RequestInit, timeoutMs = 8000): Promise<any> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    const text = await res.text();
    if (!res.ok) throw new Error(`[${res.status}] ${text.slice(0, 300)}`);
    return text ? JSON.parse(text) : {};
  } finally {
    clearTimeout(t);
  }
}

function iso8601ToSeconds(d?: string): number | null {
  if (!d) return null;
  const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(d);
  if (!m) return null;
  return (+(m[1] || 0)) * 86400 + (+(m[2] || 0)) * 3600 + (+(m[3] || 0)) * 60 + (+(m[4] || 0));
}

// ── providers: WIKIPEDIA (free, no key) ────────────────────────────────────
async function wikipediaSearch(q: string, locale: Locale, page: number, pageSize: number): Promise<SearchResult[]> {
  const host = `https://${locale}.wikipedia.org`;
  const params = new URLSearchParams({
    action: 'query', format: 'json', origin: '*', generator: 'search',
    gsrsearch: q, gsrlimit: String(pageSize), gsroffset: String((page - 1) * pageSize),
    prop: 'extracts|pageimages', exintro: '1', explaintext: '1', exsentences: '3',
    piprop: 'thumbnail', pithumbsize: '240',
  });
  const data = await fetchJson(`${host}/w/api.php?${params}`);
  const pages = data?.query?.pages ? Object.values<any>(data.query.pages) : [];
  pages.sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  return Promise.all(pages.map((p) => {
    const url = `${host}/wiki/${encodeURIComponent(String(p.title).replace(/ /g, '_'))}`;
    return makeResult({
      type: 'wikipedia', title: p.title, snippet: stripHtml(p.extract), url,
      displayUrl: displayUrl(url), thumbnailUrl: p.thumbnail?.source ?? null,
      source: 'wikipedia', publishedAt: null, author: null,
      width: p.thumbnail?.width ?? null, height: p.thumbnail?.height ?? null, durationSeconds: null,
    });
  }));
}

// ── providers: BING (web / news / images / videos share one key) ───────────
async function bing(endpoint: string, q: string, locale: Locale, page: number, pageSize: number, extra: Record<string, string> = {}) {
  const key = env('BING_SEARCH_API_KEY');
  if (!key) throw new Error('BING_SEARCH_API_KEY not configured');
  const params = new URLSearchParams({
    q, count: String(pageSize), offset: String((page - 1) * pageSize),
    mkt: MARKET[locale], safeSearch: 'Moderate', ...extra,
  });
  return fetchJson(`https://api.bing.microsoft.com/v7.0/${endpoint}?${params}`, {
    headers: { 'Ocp-Apim-Subscription-Key': key },
  });
}

async function bingWeb(q: string, locale: Locale, page: number, pageSize: number): Promise<SearchResult[]> {
  const d = await bing('search', q, locale, page, pageSize, { responseFilter: 'Webpages' });
  return Promise.all((d?.webPages?.value ?? []).map((v: any) => makeResult({
    type: 'web', title: stripHtml(v.name), snippet: stripHtml(v.snippet), url: v.url,
    displayUrl: displayUrl(v.url), thumbnailUrl: v.thumbnailUrl ?? null, source: 'bing',
    publishedAt: v.dateLastCrawled ?? null, author: null, width: null, height: null, durationSeconds: null,
  })));
}

async function bingNews(q: string, locale: Locale, page: number, pageSize: number): Promise<SearchResult[]> {
  const d = await bing('news/search', q, locale, page, pageSize, { sortBy: 'Relevance' });
  return Promise.all((d?.value ?? []).map((v: any) => makeResult({
    type: 'news', title: stripHtml(v.name), snippet: stripHtml(v.description), url: v.url,
    displayUrl: displayUrl(v.url), thumbnailUrl: v.image?.thumbnail?.contentUrl ?? null,
    source: v.provider?.[0]?.name || 'bing', publishedAt: v.datePublished ?? null,
    author: v.provider?.[0]?.name ?? null, width: null, height: null, durationSeconds: null,
  })));
}

async function bingImages(q: string, locale: Locale, page: number, pageSize: number): Promise<SearchResult[]> {
  const d = await bing('images/search', q, locale, page, pageSize);
  return Promise.all((d?.value ?? []).map((v: any) => makeResult({
    type: 'image', title: stripHtml(v.name), snippet: stripHtml(v.hostPageDisplayUrl),
    url: v.contentUrl, displayUrl: displayUrl(v.hostPageUrl || v.contentUrl),
    thumbnailUrl: v.thumbnailUrl ?? null, source: 'bing', publishedAt: v.datePublished ?? null,
    author: v.hostPageDomainFriendlyName ?? null, width: v.width ?? null, height: v.height ?? null,
    durationSeconds: null,
  })));
}

async function bingVideos(q: string, locale: Locale, page: number, pageSize: number): Promise<SearchResult[]> {
  const d = await bing('videos/search', q, locale, page, pageSize);
  return Promise.all((d?.value ?? []).map((v: any) => makeResult({
    type: 'video', title: stripHtml(v.name), snippet: stripHtml(v.description), url: v.contentUrl,
    displayUrl: displayUrl(v.hostPageUrl || v.contentUrl), thumbnailUrl: v.thumbnailUrl ?? null,
    source: v.publisher?.[0]?.name || 'bing', publishedAt: v.datePublished ?? null,
    author: v.creator?.name ?? null, width: v.width ?? null, height: v.height ?? null,
    durationSeconds: iso8601ToSeconds(v.duration),
  })));
}

// ── providers: BRAVE (web fallback) ────────────────────────────────────────
async function braveWeb(q: string, locale: Locale, page: number, pageSize: number): Promise<SearchResult[]> {
  const key = env('BRAVE_SEARCH_API_KEY');
  if (!key) throw new Error('BRAVE_SEARCH_API_KEY not configured');
  const params = new URLSearchParams({
    q, count: String(Math.min(pageSize, 20)), offset: String(page - 1),
    safesearch: 'moderate', search_lang: locale,
  });
  const d = await fetchJson(`https://api.search.brave.com/res/v1/web/search?${params}`, {
    headers: { 'X-Subscription-Token': key, Accept: 'application/json' },
  });
  return Promise.all((d?.web?.results ?? []).map((v: any) => makeResult({
    type: 'web', title: stripHtml(v.title), snippet: stripHtml(v.description), url: v.url,
    displayUrl: displayUrl(v.url), thumbnailUrl: v.thumbnail?.src ?? null, source: 'brave',
    publishedAt: v.age ?? null, author: null, width: null, height: null, durationSeconds: null,
  })));
}

// ── providers: YANDEX (web fallback, XML API) ──────────────────────────────
async function yandexWeb(q: string, _locale: Locale, page: number, _pageSize: number): Promise<SearchResult[]> {
  const key = env('YANDEX_SEARCH_API_KEY');
  const user = env('YANDEX_SEARCH_USER');
  if (!key || !user) throw new Error('YANDEX_SEARCH_API_KEY / YANDEX_SEARCH_USER not configured');
  const url = `https://yandex.com/search/xml?user=${encodeURIComponent(user)}&key=${encodeURIComponent(key)}&query=${encodeURIComponent(q)}&page=${page - 1}`;
  const res = await fetch(url);
  const xml = await res.text();
  if (!res.ok) throw new Error(`[${res.status}] yandex`);
  const docs = [...xml.matchAll(/<doc>([\s\S]*?)<\/doc>/g)].map((m) => m[1]);
  return Promise.all(docs.map((doc) => {
    const pick = (tag: string) => stripHtml((new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`).exec(doc) || [])[1] || '');
    const link = pick('url');
    return makeResult({
      type: 'web', title: pick('title') || link, snippet: pick('passage') || pick('headline'),
      url: link, displayUrl: displayUrl(link), thumbnailUrl: null, source: 'yandex',
      publishedAt: null, author: null, width: null, height: null, durationSeconds: null,
    });
  }));
}

// ── providers: NEWSAPI (news fallback) ─────────────────────────────────────
async function newsApi(q: string, locale: Locale, page: number, pageSize: number): Promise<SearchResult[]> {
  const key = env('NEWSAPI_KEY');
  if (!key) throw new Error('NEWSAPI_KEY not configured');
  const params = new URLSearchParams({
    q, page: String(page), pageSize: String(Math.min(pageSize, 100)), sortBy: 'publishedAt',
  });
  if (locale !== 'uz') params.set('language', locale);
  const d = await fetchJson(`https://newsapi.org/v2/everything?${params}`, { headers: { 'X-Api-Key': key } });
  return Promise.all((d?.articles ?? []).map((v: any) => makeResult({
    type: 'news', title: stripHtml(v.title), snippet: stripHtml(v.description), url: v.url,
    displayUrl: displayUrl(v.url), thumbnailUrl: v.urlToImage ?? null,
    source: v.source?.name || 'newsapi', publishedAt: v.publishedAt ?? null, author: v.author ?? null,
    width: null, height: null, durationSeconds: null,
  })));
}

// ── providers: GOOGLE CSE (images fallback) ────────────────────────────────
async function googleImages(q: string, _locale: Locale, page: number, pageSize: number): Promise<SearchResult[]> {
  const key = env('GOOGLE_CSE_KEY');
  const cx = env('GOOGLE_CSE_CX');
  if (!key || !cx) throw new Error('GOOGLE_CSE_KEY / GOOGLE_CSE_CX not configured');
  const params = new URLSearchParams({
    key, cx, q, searchType: 'image', safe: 'active',
    num: String(Math.min(pageSize, 10)), start: String((page - 1) * Math.min(pageSize, 10) + 1),
  });
  const d = await fetchJson(`https://www.googleapis.com/customsearch/v1?${params}`);
  return Promise.all((d?.items ?? []).map((v: any) => makeResult({
    type: 'image', title: stripHtml(v.title), snippet: stripHtml(v.snippet || v.displayLink),
    url: v.link, displayUrl: displayUrl(v.image?.contextLink || v.link),
    thumbnailUrl: v.image?.thumbnailLink ?? null, source: 'google', publishedAt: null,
    author: v.displayLink ?? null, width: v.image?.width ?? null, height: v.image?.height ?? null,
    durationSeconds: null,
  })));
}

// ── providers: YOUTUBE (videos primary) ────────────────────────────────────
async function youtubeVideos(q: string, locale: Locale, page: number, pageSize: number): Promise<SearchResult[]> {
  const key = env('YOUTUBE_API_KEY');
  if (!key) throw new Error('YOUTUBE_API_KEY not configured');
  const params = new URLSearchParams({
    key, q, part: 'snippet', type: 'video', safeSearch: 'moderate',
    maxResults: String(Math.min(pageSize, 50)), relevanceLanguage: locale,
  });
  const d = await fetchJson(`https://www.googleapis.com/youtube/v3/search?${params}`);
  const items: any[] = d?.items ?? [];
  const ids = items.map((i) => i.id?.videoId).filter(Boolean);
  let durations: Record<string, number | null> = {};
  if (ids.length) {
    try {
      const det = await fetchJson(
        `https://www.googleapis.com/youtube/v3/videos?${new URLSearchParams({ key, part: 'contentDetails', id: ids.join(',') })}`,
      );
      durations = Object.fromEntries((det?.items ?? []).map((v: any) => [v.id, iso8601ToSeconds(v.contentDetails?.duration)]));
    } catch { /* durations optional */ }
  }
  // YouTube search uses token paging; we serve a single relevance-ranked page.
  return Promise.all(items.map((v: any) => {

    const url = `https://www.youtube.com/watch?v=${v.id.videoId}`;
    return makeResult({
      type: 'video', title: stripHtml(v.snippet?.title), snippet: stripHtml(v.snippet?.description),
      url, displayUrl: displayUrl(url),
      thumbnailUrl: v.snippet?.thumbnails?.high?.url || v.snippet?.thumbnails?.default?.url || null,
      source: 'youtube', publishedAt: v.snippet?.publishedAt ?? null, author: v.snippet?.channelTitle ?? null,
      width: v.snippet?.thumbnails?.high?.width ?? null, height: v.snippet?.thumbnails?.high?.height ?? null,
      durationSeconds: durations[v.id.videoId] ?? null,
    });
  }));
}

// ── provider chain runner: primary then fallbacks ──────────────────────────
type Provider = (q: string, l: Locale, p: number, ps: number) => Promise<SearchResult[]>;

async function runChain(chain: Provider[], q: string, l: Locale, p: number, ps: number) {
  const errors: string[] = [];
  for (const provider of chain) {
    try {
      const out = await provider(q, l, p, ps);
      if (out.length) return { results: out, errors };
      errors.push(`${provider.name}: empty`);
    } catch (e) {
      errors.push(`${provider.name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { results: [] as SearchResult[], errors };
}

const CHAINS: Record<Exclude<Category, 'all'>, Provider[]> = {
  web: [bingWeb, braveWeb, yandexWeb],
  wikipedia: [wikipediaSearch],
  news: [bingNews, newsApi],
  images: [bingImages, googleImages],
  videos: [youtubeVideos, bingVideos],
};

// ── handler ────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const startedAt = Date.now();
  const json = (body: unknown) =>
    new Response(JSON.stringify(body), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  let query = '';
  let category: Category = 'all';
  let page = 1;
  let pageSize = 20;
  let locale: Locale = 'uz';

  try {
    const body = await req.json().catch(() => ({}));
    query = String(body?.query ?? '').trim().slice(0, 300);
    const c = String(body?.category ?? 'all');
    category = (CATEGORIES as string[]).includes(c) ? (c as Category) : 'all';
    page = Math.max(1, Math.min(20, Number(body?.page) || 1));
    pageSize = Math.max(1, Math.min(50, Number(body?.pageSize) || 20));
    const l = String(body?.locale ?? 'uz');
    locale = (LOCALES as string[]).includes(l) ? (l as Locale) : 'uz';

    if (!query) {
      return json({
        query, category, page, totalEstimated: 0, tookMs: Date.now() - startedAt, results: [],
        error: { code: 'INVALID_QUERY', message: 'Query is required.' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } },
    );

    const cacheKey = `gs:${locale}:${category}:${page}:${pageSize}:${await hashId(query.toLowerCase())}`;

    // 1. cache read (15 min TTL)
    try {
      const { data: cached } = await supabase
        .from('search_cache').select('results, created_at').eq('cache_key', cacheKey).maybeSingle();
      if (cached && Date.now() - new Date(cached.created_at as string).getTime() < CACHE_TTL_MS) {
        return json({ ...(cached.results as Record<string, unknown>), tookMs: Date.now() - startedAt, cached: true });
      }
    } catch (e) {
      console.error('cache read failed', e);
    }

    // 2. providers
    let results: SearchResult[] = [];
    const providerErrors: string[] = [];

    if (category === 'all') {
      const per = Math.max(3, Math.min(5, Math.ceil(pageSize / 5)));
      const order: Exclude<Category, 'all'>[] = ['wikipedia', 'web', 'news', 'images', 'videos'];
      const settled = await Promise.allSettled(
        order.map((c) => runChain(CHAINS[c], query, locale, page, per)),
      );
      settled.forEach((s, i) => {
        if (s.status === 'fulfilled') {
          results.push(...s.value.results.slice(0, per));
          providerErrors.push(...s.value.errors);
        } else {
          providerErrors.push(`${order[i]}: ${String(s.reason)}`);
        }
      });
    } else {
      const out = await runChain(CHAINS[category], query, locale, page, pageSize);
      results = out.results;
      providerErrors.push(...out.errors);
    }

    const allMissingKeys = results.length === 0 && providerErrors.length > 0 &&
      providerErrors.every((e) => e.includes('not configured'));

    const payload = {
      query,
      category,
      page,
      totalEstimated: results.length ? results.length + (page - 1) * pageSize + (results.length >= pageSize ? pageSize : 0) : 0,
      tookMs: Date.now() - startedAt,
      results,
      error: results.length === 0 && providerErrors.length
        ? {
            code: allMissingKeys ? 'PROVIDER_NOT_CONFIGURED' : 'PROVIDER_UNAVAILABLE',
            message: allMissingKeys
              ? "Bu bo'lim uchun tashqi qidiruv API kaliti sozlanmagan."
              : "Qidiruv provayderi hozir javob bermayapti. Birozdan so'ng urinib ko'ring.",
          }
        : null,
    };

    if (providerErrors.length) console.error('provider errors', providerErrors);

    // 3. cache write (only successful, non-empty responses)
    if (results.length) {
      try {
        await supabase.from('search_cache').upsert(
          { cache_key: cacheKey, results: payload, created_at: new Date().toISOString() },
          { onConflict: 'cache_key' },
        );
        // opportunistic TTL cleanup (>24h)
        if (Math.random() < 0.05) {
          await supabase.from('search_cache').delete()
            .lt('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
        }
      } catch (e) {
        console.error('cache write failed', e);
      }
    }

    return json(payload);
  } catch (e) {
    console.error('global-search fatal', e);
    return json({
      query, category, page, totalEstimated: 0, tookMs: Date.now() - startedAt, results: [],
      error: { code: 'INTERNAL_ERROR', message: e instanceof Error ? e.message : 'Unexpected error' },
    });
  }
});
