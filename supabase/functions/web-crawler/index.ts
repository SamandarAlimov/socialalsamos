// ============================================================================
// Alsamos first-party web crawler
// Crawls public websites directly into Alsamos' own search index.
// No Google/Bing/Yandex/Brave search APIs are used.
// ============================================================================

import { createClient } from 'npm:@supabase/supabase-js@2';

const MAX_HTML_BYTES = 2_000_000;
const MAX_DISCOVERED_LINKS = 40;
const MAX_DEPTH = 6;
const DEFAULT_BATCH = 5;

function env(name: string) {
  return Deno.env.get(name)?.trim() || '';
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function isPrivateIpv4(host: string) {
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const a = Number(m[1]);
  const b = Number(m[2]);
  return (
    a === 10 ||
    a === 127 ||
    a === 0 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}

function normalizeUrl(raw: string, base?: string): string | null {
  try {
    const u = new URL(raw, base);
    if (!['http:', 'https:'].includes(u.protocol)) return null;
    const host = u.hostname.toLowerCase();
    if (
      host === 'localhost' ||
      host.endsWith('.local') ||
      host.endsWith('.internal') ||
      host === '::1' ||
      isPrivateIpv4(host)
    ) return null;

    u.hash = '';
    ['utm_source','utm_medium','utm_campaign','utm_term','utm_content','gclid','fbclid']
      .forEach((key) => u.searchParams.delete(key));
    return u.toString();
  } catch {
    return null;
  }
}

function decodeEntities(value: string) {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function stripHtml(html: string) {
  return decodeEntities(
    html
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, ' ')
      .replace(/<!--([\s\S]*?)-->/g, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
  );
}

function pick(html: string, pattern: RegExp): string | null {
  const m = pattern.exec(html);
  return m?.[1] ? decodeEntities(m[1].trim()) : null;
}

function meta(html: string, name: string) {
  const escaped = name.replace(/[.*+?^$\{\}()|[\]\\]/g, '\\$&');
  const first = new RegExp(
    '<meta[^>]+(?:name|property)=["\\\']' + escaped + '["\\\'][^>]+content=["\\\']([^"\\\']*)["\\\'][^>]*>',
    'i',
  );
  const second = new RegExp(
    '<meta[^>]+content=["\\\']([^"\\\']*)["\\\'][^>]+(?:name|property)=["\\\']' + escaped + '["\\\'][^>]*>',
    'i',
  );
  return pick(html, first) || pick(html, second);
}

function classify(url: URL, contentType: string, html: string) {
  if (url.hostname.endsWith('wikipedia.org')) return 'wikipedia';
  if (contentType.startsWith('image/')) return 'image';
  if (contentType.startsWith('video/')) return 'video';
  const ogType = meta(html, 'og:type')?.toLowerCase() || '';
  if (ogType.includes('video')) return 'video';
  if (ogType.includes('article') || meta(html, 'article:published_time')) return 'news';
  return 'web';
}

function extractLinks(html: string, pageUrl: string) {
  const seen = new Set<string>();
  const out: string[] = [];
  const re = /<a\b[^>]*\bhref=["']([^"'#]+)["'][^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) && out.length < MAX_DISCOVERED_LINKS) {
    const normalized = normalizeUrl(match[1], pageUrl);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

async function robotsAllows(target: URL) {
  try {
    const robotsUrl = new URL('/robots.txt', target.origin);
    const res = await fetch(robotsUrl, {
      headers: { 'User-Agent': 'AlsamosBot/1.0 (+https://www.alsamos.com/)' },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return true;

    const text = await res.text();
    let applies = false;
    const rules: string[] = [];
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.split('#')[0].trim();
      if (!line) continue;
      const idx = line.indexOf(':');
      if (idx === -1) continue;
      const key = line.slice(0, idx).trim().toLowerCase();
      const value = line.slice(idx + 1).trim();
      if (key === 'user-agent') {
        applies = value === '*' || value.toLowerCase().includes('alsamosbot');
      } else if (applies && key === 'disallow' && value) {
        rules.push(value);
      }
    }
    return !rules.some((rule) => target.pathname.startsWith(rule));
  } catch {
    return true;
  }
}

async function crawlOne(admin: any, item: any) {
  const normalized = normalizeUrl(item.url);
  if (!normalized) {
    await admin.from('web_crawl_queue').update({
      status: 'blocked',
      last_error: 'Unsupported or private URL',
      updated_at: new Date().toISOString(),
    }).eq('id', item.id);
    return { url: item.url, status: 'blocked' };
  }

  const target = new URL(normalized);
  if (!(await robotsAllows(target))) {
    await admin.from('web_crawl_queue').update({
      status: 'blocked',
      last_error: 'robots.txt disallow',
      updated_at: new Date().toISOString(),
    }).eq('id', item.id);
    return { url: normalized, status: 'robots-blocked' };
  }

  try {
    const res = await fetch(normalized, {
      redirect: 'follow',
      headers: {
        'User-Agent': 'AlsamosBot/1.0 (+https://www.alsamos.com/)',
        Accept: 'text/html,application/xhtml+xml,image/*,video/*;q=0.8,*/*;q=0.5',
      },
      signal: AbortSignal.timeout(12000),
    });

    const finalUrl = normalizeUrl(res.url || normalized) || normalized;
    const final = new URL(finalUrl);
    const contentType = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    const contentLength = Number(res.headers.get('content-length') || 0);

    if (contentLength > MAX_HTML_BYTES && contentType.includes('html')) {
      throw new Error('Document too large');
    }

    let html = '';
    let contentText = '';
    let title = final.hostname;
    let description = '';
    let thumbnailUrl: string | null = null;
    let canonicalUrl: string | null = null;
    let author: string | null = null;
    let publishedAt: string | null = null;
    let language: string | null = null;

    if (contentType.includes('html') || contentType.includes('xml') || !contentType) {
      html = await res.text();
      if (html.length > MAX_HTML_BYTES) html = html.slice(0, MAX_HTML_BYTES);
      title =
        pick(html, /<title[^>]*>([\s\S]*?)<\/title>/i) ||
        meta(html, 'og:title') ||
        final.hostname;
      description = meta(html, 'description') || meta(html, 'og:description') || '';
      thumbnailUrl = normalizeUrl(meta(html, 'og:image') || '', finalUrl);
      canonicalUrl = normalizeUrl(
        pick(html, /<link[^>]+rel=["'][^"']*canonical[^"']*["'][^>]+href=["']([^"']+)["']/i) || '',
        finalUrl,
      );
      author = meta(html, 'author') || meta(html, 'article:author');
      publishedAt = meta(html, 'article:published_time') || meta(html, 'date');
      language = pick(html, /<html[^>]+lang=["']([^"']+)["']/i)?.split('-')[0]?.toLowerCase() || null;
      contentText = stripHtml(html).slice(0, 180_000);
    }

    const kind = classify(final, contentType, html);
    const hashInput = [title, description, contentText.slice(0, 10_000)].join('\n');
    const hashBytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(hashInput));
    const contentHash = Array.from(new Uint8Array(hashBytes))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    const { error: upsertError } = await admin.from('web_search_documents').upsert({
      url: finalUrl,
      canonical_url: canonicalUrl,
      domain: final.hostname.replace(/^www\./, ''),
      path: final.pathname || '/',
      title: title.slice(0, 500),
      description: description.slice(0, 1500),
      content_text: contentText,
      language,
      kind,
      content_type: contentType || null,
      thumbnail_url: thumbnailUrl,
      author: author?.slice(0, 300) || null,
      published_at: publishedAt,
      status_code: res.status,
      content_hash: contentHash,
      crawl_depth: item.depth || 0,
      fetched_at: new Date().toISOString(),
      indexed_at: new Date().toISOString(),
    }, { onConflict: 'url' });

    if (upsertError) throw upsertError;

    if (html && (item.depth || 0) < MAX_DEPTH) {
      for (const link of extractLinks(html, finalUrl)) {
        await admin.rpc('enqueue_web_url', {
          p_url: link,
          p_depth: (item.depth || 0) + 1,
          p_priority: Math.max(-10, 20 - (item.depth || 0) * 3),
          p_discovered_from: finalUrl,
        });
      }
    }

    await admin.from('web_crawl_queue').update({
      status: 'done',
      last_error: null,
      updated_at: new Date().toISOString(),
    }).eq('id', item.id);

    return { url: finalUrl, status: 'indexed', kind };
  } catch (error) {
    const attempts = Number(item.attempts || 0) + 1;
    const retryMinutes = Math.min(24 * 60, 2 ** Math.min(attempts, 10));
    await admin.from('web_crawl_queue').update({
      status: attempts >= 5 ? 'blocked' : 'failed',
      attempts,
      last_error: error instanceof Error ? error.message.slice(0, 1000) : String(error).slice(0, 1000),
      next_attempt_at: new Date(Date.now() + retryMinutes * 60_000).toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', item.id);

    return {
      url: normalized,
      status: 'failed',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

Deno.serve(async (req) => {
  const secret = env('CRAWLER_SECRET');
  const supplied = req.headers.get('x-crawler-secret') || '';
  if (!secret || supplied !== secret) return json({ error: 'Unauthorized' }, 401);

  const supabaseUrl = env('SUPABASE_URL');
  const serviceRoleKey = env('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: 'Supabase service credentials missing' }, 500);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
  const seedUrls = Array.isArray(body?.urls) ? body.urls.slice(0, 100) : [];

  for (const raw of seedUrls) {
    const normalized = normalizeUrl(String(raw));
    if (!normalized) continue;
    await admin.rpc('enqueue_web_url', {
      p_url: normalized,
      p_depth: 0,
      p_priority: 100,
      p_discovered_from: null,
    });
  }

  const maxPages = Math.max(1, Math.min(20, Number(body?.maxPages) || DEFAULT_BATCH));
  const { data: queue, error } = await admin
    .from('web_crawl_queue')
    .select('*')
    .in('status', ['pending', 'failed'])
    .lte('next_attempt_at', new Date().toISOString())
    .order('priority', { ascending: false })
    .order('id', { ascending: true })
    .limit(maxPages);

  if (error) return json({ error: error.message }, 500);
  if (!queue?.length) return json({ processed: 0, results: [] });

  await admin.from('web_crawl_queue').update({
    status: 'processing',
    updated_at: new Date().toISOString(),
  }).in('id', queue.map((item: any) => item.id));

  const results = [];
  for (const item of queue) results.push(await crawlOne(admin, item));
  return json({ processed: results.length, results });
});
