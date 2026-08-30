// ============================================================================
// Alsamos — first-party Global Search
// ----------------------------------------------------------------------------
// This endpoint NEVER proxies Google/Bing/Yandex/Brave or any other search
// engine. Results come only from Alsamos' own web index populated by
// supabase/functions/web-crawler.
//
// Stable client contract:
// POST { query, category, page, pageSize, locale }
// category: all | web | wikipedia | news | images | videos
// ============================================================================

import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

type Category = 'web' | 'wikipedia' | 'news' | 'images' | 'videos' | 'all';
type Locale = 'uz' | 'ru' | 'en';

const CATEGORIES: Category[] = ['web', 'wikipedia', 'news', 'images', 'videos', 'all'];
const LOCALES: Locale[] = ['uz', 'ru', 'en'];
const CACHE_TTL_MS = 10 * 60 * 1000;

interface IndexedRow {
  id: string;
  type: 'web' | 'wikipedia' | 'news' | 'image' | 'video';
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const startedAt = Date.now();
  const json = (body: unknown) =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
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

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    if (!supabaseUrl || !serviceRoleKey) {
      return json({
        query,
        category,
        page,
        totalEstimated: 0,
        tookMs: Date.now() - startedAt,
        results: [],
        error: { code: 'INDEX_UNAVAILABLE', message: 'Alsamos web indeksi sozlanmagan.' },
      });
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const cacheKey = [
      'first-party-web',
      locale,
      category,
      page,
      pageSize,
      query.toLocaleLowerCase(),
    ].join(':');

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
      // Cache is optional; search itself must still work.
    }

    const offset = (page - 1) * pageSize;
    const { data, error } = await admin.rpc('search_web_index', {
      p_query: query,
      p_category: category,
      p_limit: pageSize,
      p_offset: offset,
      p_locale: locale,
    });

    if (error) {
      console.error('search_web_index failed', error);
      return json({
        query,
        category,
        page,
        totalEstimated: 0,
        tookMs: Date.now() - startedAt,
        results: [],
        error: {
          code: 'INDEX_UNAVAILABLE',
          message: 'Alsamos Global Search indeksi hozircha mavjud emas.',
        },
      });
    }

    const rows = (data ?? []) as IndexedRow[];
    const results = rows.map((row) => ({
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

    const payload = {
      query,
      category,
      page,
      totalEstimated: offset + results.length + (results.length === pageSize ? pageSize : 0),
      tookMs: Date.now() - startedAt,
      results,
      error: results.length === 0
        ? {
            code: 'INDEX_EMPTY',
            message:
              "Alsamos indeksi bu so'rov uchun hali sahifa topmadi. Crawler indeksni kengaytirishda davom etadi.",
          }
        : null,
    };

    if (results.length > 0) {
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
