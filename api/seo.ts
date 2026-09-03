const SITE_ORIGIN = 'https://www.alsamos.com';

function env(name: string) {
  const value = process.env[name];
  return typeof value === 'string' ? value.trim() : '';
}

function supabaseConfig() {
  const url = env('SUPABASE_URL') || env('VITE_SUPABASE_URL');
  const key =
    env('SUPABASE_ANON_KEY') ||
    env('SUPABASE_PUBLISHABLE_KEY') ||
    env('VITE_SUPABASE_PUBLISHABLE_KEY');
  if (!url || !key) throw new Error('supabase_env_missing');
  return { url: url.replace(/\/+$/, ''), key };
}

function first(value: unknown) {
  return Array.isArray(value) ? String(value[0] ?? '') : String(value ?? '');
}

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function cleanDescription(value: unknown) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 320);
}

function safeImage(value: unknown) {
  const image = String(value ?? '').trim();
  return /^https?:\/\//i.test(image) ? image : SITE_ORIGIN + '/apple-touch-icon.png';
}

async function rpc(name: string, body: unknown) {
  const { url, key } = supabaseConfig();
  const response = await fetch(url + '/rest/v1/rpc/' + name, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: 'Bearer ' + key,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(name + '_http_' + response.status + ':' + (await response.text()).slice(0, 180));
  }
  return response.json();
}

function jsonLd(entity: any, canonical: string, image: string) {
  if (entity.kind === 'profile') {
    return {
      '@context': 'https://schema.org',
      '@type': 'Person',
      name: entity.title,
      alternateName: entity.username ? '@' + entity.username : undefined,
      description: entity.description,
      image,
      url: canonical,
    };
  }
  if (entity.kind === 'post') {
    return {
      '@context': 'https://schema.org',
      '@type': 'SocialMediaPosting',
      headline: entity.title,
      articleBody: entity.description,
      datePublished: entity.createdAt || undefined,
      dateModified: entity.updatedAt || entity.createdAt || undefined,
      image,
      url: canonical,
      author: entity.authorName
        ? { '@type': 'Person', name: entity.authorName, alternateName: entity.authorUsername ? '@' + entity.authorUsername : undefined }
        : undefined,
      interactionStatistic: [
        { '@type': 'InteractionCounter', interactionType: 'https://schema.org/LikeAction', userInteractionCount: entity.likesCount || 0 },
        { '@type': 'InteractionCounter', interactionType: 'https://schema.org/CommentAction', userInteractionCount: entity.commentsCount || 0 },
        { '@type': 'InteractionCounter', interactionType: 'https://schema.org/ViewAction', userInteractionCount: entity.viewsCount || 0 },
      ],
    };
  }
  if (entity.kind === 'product') {
    return {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: entity.title,
      description: entity.description,
      image: [image],
      url: canonical,
      offers: {
        '@type': 'Offer',
        price: entity.price,
        priceCurrency: entity.currency || 'USD',
        availability: 'https://schema.org/' + (entity.availability || 'InStock'),
        url: canonical,
      },
      seller: entity.sellerName ? { '@type': 'Organization', name: entity.sellerName } : undefined,
    };
  }
  return {
    '@context': 'https://schema.org',
    '@type': entity.kind === 'hashtag' ? 'CollectionPage' : 'WebPage',
    name: entity.title,
    description: entity.description,
    image,
    url: canonical,
  };
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.status(405).end();
    return;
  }

  const kind = first(req.query?.kind).toLowerCase();
  const value = first(req.query?.value);
  const allowed = new Set(['profile', 'post', 'channel', 'group', 'product', 'hashtag']);
  if (!allowed.has(kind) || !value) {
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.status(400).send('Bad SEO route');
    return;
  }

  try {
    const entity = await rpc('seo_public_entity', { p_kind: kind, p_value: value });
    if (!entity) {
      res.setHeader('X-Robots-Tag', 'noindex, nofollow');
      res.status(404).send('<!doctype html><html><head><title>Topilmadi • Alsamos</title></head><body><h1>Topilmadi</h1></body></html>');
      return;
    }

    const canonical = SITE_ORIGIN + String(entity.canonicalPath || '/');
    const title = String(entity.title || 'Alsamos').slice(0, 120);
    const description = cleanDescription(entity.description || 'Alsamos — ulaning, ulashing, kashf eting.');
    const image = safeImage(entity.image);
    const type =
      entity.kind === 'profile' ? 'profile' :
      entity.kind === 'post' ? 'article' :
      entity.kind === 'product' ? 'product' : 'website';
    const structured = jsonLd(entity, canonical, image);

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=600, stale-while-revalidate=86400');
    res.setHeader('X-Robots-Tag', 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1');

    if (req.method === 'HEAD') {
      res.status(200).end();
      return;
    }

    res.status(200).send(`<!doctype html>
<html lang="uz">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)} • Alsamos</title>
<meta name="description" content="${escapeHtml(description)}">
<meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1">
<link rel="canonical" href="${escapeHtml(canonical)}">
<meta property="og:site_name" content="Alsamos">
<meta property="og:type" content="${type}">
<meta property="og:title" content="${escapeHtml(title)} • Alsamos">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:url" content="${escapeHtml(canonical)}">
<meta property="og:image" content="${escapeHtml(image)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(title)} • Alsamos">
<meta name="twitter:description" content="${escapeHtml(description)}">
<meta name="twitter:image" content="${escapeHtml(image)}">
<script type="application/ld+json">${JSON.stringify(structured).replace(/</g, '\\u003c')}</script>
</head>
<body>
<main>
  <article>
    <h1>${escapeHtml(title)}</h1>
    <p>${escapeHtml(description)}</p>
    <p><a href="${escapeHtml(canonical)}">Alsamos’da ochish</a></p>
  </article>
</main>
</body>
</html>`);
  } catch (error: any) {
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.status(503).send('SEO snapshot unavailable');
  }
}
