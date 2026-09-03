const SITE_ORIGIN = 'https://www.alsamos.com';
const ENTITY_TYPES = ['profiles', 'posts', 'channels', 'groups', 'products', 'hashtags'] as const;

function env(name: string) {
  const value = process.env[name];
  return typeof value === 'string' ? value.trim() : '';
}
function supabaseConfig() {
  const url = env('SUPABASE_URL') || env('VITE_SUPABASE_URL');
  const key = env('SUPABASE_ANON_KEY') || env('SUPABASE_PUBLISHABLE_KEY') || env('VITE_SUPABASE_PUBLISHABLE_KEY');
  if (!url || !key) throw new Error('supabase_env_missing');
  return { url: url.replace(/\/+$/, ''), key };
}
function first(value: unknown) {
  return Array.isArray(value) ? String(value[0] ?? '') : String(value ?? '');
}
function xml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
async function sitemapRows(kind: string) {
  const { url, key } = supabaseConfig();
  const response = await fetch(url + '/rest/v1/rpc/seo_public_sitemap', {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: 'Bearer ' + key,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ p_kind: kind, p_limit: 50000, p_offset: 0 }),
  });
  if (!response.ok) throw new Error('sitemap_rpc_' + response.status);
  const data = await response.json();
  return Array.isArray(data) ? data : [];
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.status(405).end();
    return;
  }

  const type = first(req.query?.type || 'index').toLowerCase();
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=900, stale-while-revalidate=86400');
  res.setHeader('X-Robots-Tag', 'index, follow');

  if (type === 'index') {
    const staticMap = SITE_ORIGIN + '/sitemaps/static.xml';
    const maps = [staticMap, ...ENTITY_TYPES.map((kind) => SITE_ORIGIN + '/sitemaps/' + kind + '.xml')];
    const body = '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
      maps.map((loc) => '  <sitemap><loc>' + xml(loc) + '</loc></sitemap>').join('\n') +
      '\n</sitemapindex>';
    res.status(200).send(req.method === 'HEAD' ? '' : body);
    return;
  }

  if (type === 'static') {
    const routes = [
      '/', '/help', '/legal/privacy', '/legal/terms'
    ];
    const body = '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
      routes.map((path) => '  <url><loc>' + xml(SITE_ORIGIN + path) + '</loc></url>').join('\n') +
      '\n</urlset>';
    res.status(200).send(req.method === 'HEAD' ? '' : body);
    return;
  }

  if (!(ENTITY_TYPES as readonly string[]).includes(type)) {
    res.status(404).send('');
    return;
  }

  try {
    const rows = await sitemapRows(type);
    const body = '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
      rows.map((row: any) => {
        const loc = SITE_ORIGIN + String(row.url_path || '');
        const lastmod = row.lastmod ? '<lastmod>' + xml(new Date(row.lastmod).toISOString()) + '</lastmod>' : '';
        return '  <url><loc>' + xml(loc) + '</loc>' + lastmod + '</url>';
      }).join('\n') +
      '\n</urlset>';
    res.status(200).send(req.method === 'HEAD' ? '' : body);
  } catch {
    res.status(503).send('');
  }
}
