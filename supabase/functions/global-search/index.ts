// Alsamos Global Search
//
// One resilient retrieval endpoint shared by the Search UI and Alsamos AI.
// Provider strategy:
//   1) Firecrawl when configured (web/news/images, rich thumbnails)
//   2) pooled Gemini + Google Search grounding, with DuckDuckGo HTML/Lite fallback
//   3) Alsamos' own indexed crawler data
//
// Results from available providers are merged instead of stopping at the first
// provider so current URLs and image/news results can complement each other.

import { createClient } from "npm:@supabase/supabase-js@2";
import { duckDuckGoSearch, type WebHit } from "../_shared/webFallback.ts";

type Category = "web" | "wikipedia" | "news" | "images" | "videos" | "all";
type Locale = "uz" | "ru" | "en";
type ResultType = "web" | "wikipedia" | "news" | "image" | "video";

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

type IndexedRow = {
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
};

const CATEGORIES = new Set<Category>(["web", "wikipedia", "news", "images", "videos", "all"]);
const LOCALES = new Set<Locale>(["uz", "ru", "en"]);
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store",
};

function env(name: string): string {
  return Deno.env.get(name)?.trim() || "";
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json; charset=utf-8" },
  });
}

async function hashId(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .slice(0, 16)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function sourceName(raw: string): string {
  try {
    return new URL(raw).hostname.replace(/^www\./i, "");
  } catch {
    return "web";
  }
}

function displayUrl(raw: string): string {
  try {
    const url = new URL(raw);
    const path = url.pathname
      .split("/")
      .filter(Boolean)
      .slice(0, 3)
      .map((part) => {
        try {
          return decodeURIComponent(part);
        } catch {
          return part;
        }
      })
      .join(" › ");
    return `${url.hostname.replace(/^www\./i, "")}${path ? ` › ${path}` : ""}`;
  } catch {
    return raw;
  }
}

function clean(value: unknown, max = 700): string {
  return String(value ?? "")
    .replace(/[#*_>\[\]`]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function publishedAt(value: unknown): string | null {
  if (!value) return null;
  const timestamp = Date.parse(String(value));
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function typeFor(category: Category, url: string): ResultType {
  if (category === "images") return "image";
  if (category === "videos") return "video";
  if (category === "news") return "news";
  if (category === "wikipedia" || /wikipedia\.org/i.test(url)) return "wikipedia";
  return "web";
}

function queryForCategory(query: string, category: Category): string {
  if (category === "wikipedia") return `${query} site:wikipedia.org`;
  if (category === "videos") return `${query} (site:youtube.com OR site:vimeo.com OR site:dailymotion.com)`;
  if (category === "images") return `${query} images photos`;
  if (category === "news") return `${query} latest news`;
  return query;
}

function firecrawlSources(category: Category): string[] {
  if (category === "images") return ["images"];
  if (category === "news") return ["news"];
  if (category === "all") return ["web", "news", "images"];
  return ["web"];
}

async function firecrawlSearch(
  query: string,
  category: Category,
  limit: number,
): Promise<SearchResult[]> {
  const apiKey = env("FIRECRAWL_API_KEY");
  if (!apiKey) return [];

  const response = await fetch("https://api.firecrawl.dev/v2/search", {
    method: "POST",
    signal: AbortSignal.timeout(30_000),
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: queryForCategory(query, category),
      limit: Math.min(100, Math.max(limit, 10)),
      sources: firecrawlSources(category),
      safe: true,
      timeout: 25_000,
      ignoreInvalidURLs: true,
    }),
  });

  const raw = await response.text();
  let payload: any = {};
  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    payload = {};
  }
  if (!response.ok || payload?.success === false) {
    throw new Error(`Firecrawl HTTP ${response.status}: ${clean(payload?.error || raw, 240)}`);
  }

  const data = payload?.data ?? payload ?? {};
  const web = Array.isArray(data) ? data : Array.isArray(data?.web) ? data.web : [];
  const news = Array.isArray(data?.news) ? data.news : [];
  const images = Array.isArray(data?.images) ? data.images : [];
  const rows: Array<{ type: ResultType; item: any }> = [];

  if (category === "images") {
    images.forEach((item: any) => rows.push({ type: "image", item }));
  } else if (category === "news") {
    news.forEach((item: any) => rows.push({ type: "news", item }));
  } else if (category === "all") {
    web.forEach((item: any) => rows.push({ type: typeFor(category, String(item?.url || "")), item }));
    news.forEach((item: any) => rows.push({ type: "news", item }));
    images.forEach((item: any) => rows.push({ type: "image", item }));
  } else {
    web.forEach((item: any) => rows.push({ type: typeFor(category, String(item?.url || "")), item }));
  }

  const results: SearchResult[] = [];
  for (const row of rows) {
    const item = row.item ?? {};
    const pageUrl = String(item?.url || item?.metadata?.sourceURL || item?.metadata?.url || "").trim();
    const imageUrl = String(item?.imageUrl || item?.image || "").trim();
    const targetUrl = pageUrl || (row.type === "image" ? imageUrl : "");
    if (!targetUrl) continue;

    results.push({
      id: await hashId(`firecrawl:${row.type}:${targetUrl}`),
      type: row.type,
      title: clean(item?.title || item?.metadata?.title || sourceName(targetUrl), 220),
      snippet: clean(item?.description || item?.snippet || item?.metadata?.description || item?.markdown),
      url: pageUrl || targetUrl,
      displayUrl: displayUrl(pageUrl || targetUrl),
      thumbnailUrl: row.type === "image"
        ? imageUrl || targetUrl
        : String(item?.imageUrl || item?.screenshot || "").trim() || null,
      source: sourceName(pageUrl || targetUrl),
      publishedAt: publishedAt(item?.date || item?.publishedAt),
      author: typeof item?.author === "string" ? clean(item.author, 180) : null,
      width: Number.isFinite(Number(item?.imageWidth)) ? Number(item.imageWidth) : null,
      height: Number.isFinite(Number(item?.imageHeight)) ? Number(item.imageHeight) : null,
      durationSeconds: null,
    });
    if (results.length >= limit) break;
  }
  return results;
}

async function groundedSearch(query: string, category: Category, limit: number): Promise<SearchResult[]> {
  const hits: WebHit[] = await duckDuckGoSearch(queryForCategory(query, category), Math.min(8, limit));
  const results: SearchResult[] = [];
  for (const hit of hits) {
    results.push({
      id: await hashId(`grounded:${hit.url}`),
      type: typeFor(category, hit.url),
      title: clean(hit.title || sourceName(hit.url), 220),
      snippet: clean(hit.snippet),
      url: hit.url,
      displayUrl: displayUrl(hit.url),
      thumbnailUrl: null,
      source: sourceName(hit.url),
      publishedAt: null,
      author: null,
      width: null,
      height: null,
      durationSeconds: null,
    });
  }
  return results;
}

async function indexedSearch(
  query: string,
  category: Category,
  locale: Locale,
  limit: number,
): Promise<SearchResult[]> {
  const supabaseUrl = env("SUPABASE_URL");
  const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return [];

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await admin.rpc("search_web_index", {
    p_query: query,
    p_category: category,
    p_limit: limit,
    p_offset: 0,
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

function mergeResults(groups: SearchResult[][], limit: number): SearchResult[] {
  const seen = new Set<string>();
  const output: SearchResult[] = [];
  for (const group of groups) {
    for (const result of group) {
      const key = `${result.type}:${result.url}`;
      if (!result.url || seen.has(key)) continue;
      seen.add(key);
      output.push(result);
      if (output.length >= limit) return output;
    }
  }
  return output;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: { code: "METHOD_NOT_ALLOWED", message: "POST required" } }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const query = clean(body?.query, 500);
    if (!query) return json({ error: { code: "INVALID_QUERY", message: "query talab qilinadi" }, results: [] }, 400);

    const category: Category = CATEGORIES.has(body?.category) ? body.category : "all";
    const locale: Locale = LOCALES.has(body?.locale) ? body.locale : "uz";
    const page = Math.max(1, Math.min(20, Number(body?.page) || 1));
    const pageSize = Math.max(1, Math.min(30, Number(body?.pageSize) || 10));
    const providerLimit = Math.min(60, page * pageSize + 8);

    const diagnostics: string[] = [];
    const engines: string[] = [];

    const [firecrawlSettled, groundedSettled, indexedSettled] = await Promise.allSettled([
      firecrawlSearch(query, category, providerLimit),
      groundedSearch(query, category, Math.min(providerLimit, 8)),
      indexedSearch(query, category, locale, providerLimit),
    ]);

    const firecrawl = firecrawlSettled.status === "fulfilled" ? firecrawlSettled.value : [];
    if (firecrawl.length) engines.push("firecrawl");
    else if (firecrawlSettled.status === "rejected") diagnostics.push(`firecrawl: ${String(firecrawlSettled.reason).slice(0, 300)}`);

    const grounded = groundedSettled.status === "fulfilled" ? groundedSettled.value : [];
    if (grounded.length) engines.push("grounded-web");
    else if (groundedSettled.status === "rejected") diagnostics.push(`grounded-web: ${String(groundedSettled.reason).slice(0, 300)}`);

    const indexed = indexedSettled.status === "fulfilled" ? indexedSettled.value : [];
    if (indexed.length) engines.push("alsamos-index");
    else if (indexedSettled.status === "rejected") diagnostics.push(`alsamos-index: ${String(indexedSettled.reason).slice(0, 300)}`);

    const merged = mergeResults([firecrawl, grounded, indexed], providerLimit);
    const start = (page - 1) * pageSize;
    const results = merged.slice(start, start + pageSize);

    if (!results.length) {
      console.warn("global-search no results", { query, category, diagnostics });
      return json({
        query,
        category,
        locale,
        page,
        pageSize,
        results: [],
        engine: engines.join("+") || "none",
        error: {
          code: "NO_RESULTS",
          message: diagnostics.length
            ? "Web qidiruv provayderlari natija qaytarmadi."
            : "Mos natija topilmadi.",
        },
        diagnostics,
      });
    }

    return json({
      query,
      category,
      locale,
      page,
      pageSize,
      results,
      engine: engines.join("+") || "fallback",
      hasMore: merged.length > start + results.length,
      diagnostics: diagnostics.length ? diagnostics : undefined,
    });
  } catch (error) {
    console.error("global-search error", error);
    return json(
      {
        results: [],
        error: {
          code: "SEARCH_FAILED",
          message: error instanceof Error ? error.message : "Web qidiruvda xatolik yuz berdi.",
        },
      },
      500,
    );
  }
});
