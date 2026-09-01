// Mini App proksisi — SUPERAPP ICHIDA ochish uchun.
//
// Nega kerak: Supabase Edge Functions gateway o'z javoblariga "sandbox" CSP
// qo'shadi va brauzer iframe sandbox'i bilan kesishtirganda `allow-scripts`
// yo'qoladi — natijada sayt ichida JS ishlamaydi (HTML matn bo'lib chiqadi).
// Shuning uchun proksi O'Z DOMENIMIZDA (alsamos.com) turadi.
//
// URL shakli: /api/mp/p/https://islom.uz/sahifa?x=1
// Nisbiy havolalar <base href> orqali proksi ustidan hal bo'ladi.

const FETCH_TIMEOUT_MS = 15000;
const MAX_REDIRECTS = 5;
const MAX_BYTES = 4 * 1024 * 1024;
const ROUTE_PREFIX = '/api/mp/';

const UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36';

// Iframe'ni bloklovchi yoki javobni buzuvchi sarlavhalar olib tashlanadi.
const STRIP_HEADERS = new Set([
  'x-frame-options',
  'content-security-policy',
  'content-security-policy-report-only',
  'cross-origin-opener-policy',
  'cross-origin-embedder-policy',
  'cross-origin-resource-policy',
  'permissions-policy',
  'feature-policy',
  'report-to',
  'nel',
  'clear-site-data',
  'strict-transport-security',
  'content-encoding',
  'content-length',
  'transfer-encoding',
  'connection',
  'keep-alive',
  'set-cookie',
]);

function splitList(value?: string | null): string[] {
  return (value || '')
    .split(/[,\s]+/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function isPrivateHost(hostname: string): boolean {
  const host = (hostname || '').toLowerCase().replace(/^\[|\]$/g, '');
  if (!host) return true;
  if (host === 'localhost' || host === '0.0.0.0' || host === '::1') return true;
  if (host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.localhost')) return true;
  if (host === 'metadata.google.internal' || host === '169.254.169.254') return true;
  if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host)) return true;
  if (/^169\.254\./.test(host) || /^172\.(1[6-9]|2[0-9]|3[01])\./.test(host)) return true;
  if (/^f[cd][0-9a-f]{0,2}:/i.test(host) || /^fe80:/i.test(host)) return true;
  if (!host.includes('.') && !host.includes(':')) return true;
  return false;
}

// MINI_APP_ALLOWED_HOSTS bo'sh bo'lsa hamma https host ruxsat etiladi.
function hostAllowed(hostname: string): boolean {
  const list = splitList(process.env.MINI_APP_ALLOWED_HOSTS);
  if (list.length === 0) return true;
  const host = hostname.toLowerCase();
  return list.some((entry) => host === entry || host.endsWith('.' + entry));
}

// Brauzer path ichidagi '//' ni '/' ga qisqartirishi mumkin — tiklaymiz.
function parseTarget(rawPath: string): URL | null {
  let raw = (rawPath || '').replace(/^\/+/, '');
  if (raw.startsWith('p/')) raw = raw.slice(2);
  if (!raw) return null;

  if (/^https?%3a/i.test(raw)) {
    try {
      raw = decodeURIComponent(raw);
    } catch {
      // asl holida qoldiramiz
    }
  }

  raw = raw.replace(/^(https?:)\/*/i, (_match, scheme) => scheme + '//');
  if (!/^https?:\/\//i.test(raw)) raw = 'https://' + raw;

  try {
    const parsed = new URL(raw);
    if (parsed.protocol === 'http:') parsed.protocol = 'https:';
    if (parsed.protocol !== 'https:') return null;
    if (!parsed.hostname) return null;
    return parsed;
  } catch {
    return null;
  }
}

function proxyBaseFrom(req: any): string {
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '');
  const proto = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0];
  return proto + '://' + host + ROUTE_PREFIX + 'p/';
}

function toProxied(value: string, base: string, proxyBase: string): string | null {
  const raw = (value || '').trim();
  if (!raw) return null;
  if (/^(#|data:|blob:|about:|javascript:|mailto:|tel:|sms:)/i.test(raw)) return null;
  if (raw.startsWith(proxyBase)) return null;

  try {
    const absolute = new URL(raw, base);
    if (absolute.protocol !== 'http:' && absolute.protocol !== 'https:') return null;
    if (absolute.protocol === 'http:') absolute.protocol = 'https:';
    return proxyBase + absolute.toString();
  } catch {
    return null;
  }
}

function escapeAttr(value: string): string {
  return value.replace(/"/g, '&quot;');
}

function rewriteSrcset(value: string, base: string, proxyBase: string): string {
  return value
    .split(',')
    .map((part) => {
      const trimmed = part.trim();
      if (!trimmed) return '';
      const pieces = trimmed.split(/\s+/);
      const next = toProxied(pieces[0], base, proxyBase);
      if (next) pieces[0] = next;
      return pieces.join(' ');
    })
    .filter(Boolean)
    .join(', ');
}

function rewriteCssUrls(css: string, base: string, proxyBase: string): string {
  return css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (match, _quote, value) => {
    const next = toProxied(value, base, proxyBase);
    return next ? 'url("' + next + '")' : match;
  });
}

// Sayt ichidagi runtime so'rovlarini ham proksi ustidan yuboradi va
// frame-busting (top.location = ...) urinishlarini to'xtatadi.
function runtimePatch(proxyBase: string): string {
  const base = JSON.stringify(proxyBase);
  return (
    '<script>(function(){try{var B=' + base + ';' +
    'function abs(u){try{return new URL(u,document.baseURI).toString()}catch(e){return null}}' +
    'function wrap(u){if(typeof u!=="string")return u;' +
    'if(/^(#|data:|blob:|about:|javascript:|mailto:|tel:)/i.test(u))return u;' +
    'if(u.indexOf(B)===0)return u;var a=abs(u);if(!a||!/^https?:/i.test(a))return u;' +
    'if(a.indexOf(location.origin)===0)return u;return B+a}' +
    'var of=window.fetch;if(of){window.fetch=function(i,n){try{if(typeof i==="string"){i=wrap(i)}else if(i&&i.url){i=new Request(wrap(i.url),i)}}catch(e){}return of.call(window,i,n)}}' +
    'var oo=XMLHttpRequest.prototype.open;XMLHttpRequest.prototype.open=function(m,u){var r=[m,wrap(u)].concat([].slice.call(arguments,2));return oo.apply(this,r)};' +
    'var ow=window.open;window.open=function(u,n,f){try{u=wrap(u)}catch(e){}return ow?ow.call(window,u,n,f):null};' +
    'try{Object.defineProperty(window,"top",{get:function(){return window.self}});' +
    'Object.defineProperty(window,"parent",{get:function(){return window.self}})}catch(e){}' +
    '}catch(e){}})();</script>'
  );
}

function rewriteHtml(html: string, base: string, proxyBase: string): string {
  let out = html;

  out = out.replace(/<base[^>]*>/gi, '');
  out = out.replace(/\sintegrity=("[^"]*"|'[^']*')/gi, '');
  out = out.replace(
    /<meta[^>]+http-equiv=["']?(content-security-policy|x-frame-options)["']?[^>]*>/gi,
    '',
  );

  out = out.replace(
    /\s(src|href|action|poster|formaction|data-src)=("([^"]*)"|'([^']*)')/gi,
    (match, attr, _quoted, doubleValue, singleValue) => {
      const value = doubleValue !== undefined ? doubleValue : singleValue;
      const next = toProxied(value, base, proxyBase);
      return next ? ' ' + attr + '="' + escapeAttr(next) + '"' : match;
    },
  );

  out = out.replace(
    /\ssrcset=("([^"]*)"|'([^']*)')/gi,
    (_match, _quoted, doubleValue, singleValue) => {
      const value = doubleValue !== undefined ? doubleValue : singleValue;
      return ' srcset="' + escapeAttr(rewriteSrcset(value, base, proxyBase)) + '"';
    },
  );

  out = rewriteCssUrls(out, base, proxyBase);

  const injected = '<base href="' + escapeAttr(proxyBase + base) + '">' + runtimePatch(proxyBase);
  if (/<head[^>]*>/i.test(out)) {
    out = out.replace(/<head[^>]*>/i, (match) => match + injected);
  } else {
    out = injected + out;
  }

  return out;
}

async function safeFetch(start: URL): Promise<{ response: Response; url: URL } | null> {
  let current = start;

  for (let attempt = 0; attempt <= MAX_REDIRECTS; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let response: Response;

    try {
      response = await fetch(current.toString(), {
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          'User-Agent': UA,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'uz,ru;q=0.9,en;q=0.8',
        },
      });
    } catch {
      clearTimeout(timer);
      return null;
    }
    clearTimeout(timer);

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) return { response, url: current };

      let next: URL;
      try {
        next = new URL(location, current);
      } catch {
        return null;
      }
      if (next.protocol === 'http:') next.protocol = 'https:';
      if (next.protocol !== 'https:') return null;
      if (isPrivateHost(next.hostname) || !hostAllowed(next.hostname)) return null;
      current = next;
      continue;
    }

    return { response, url: current };
  }

  return null;
}

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const requestUrl = String(req.url || '');
  const withoutHash = requestUrl.split('#')[0];
  const relative = withoutHash.startsWith(ROUTE_PREFIX)
    ? withoutHash.slice(ROUTE_PREFIX.length)
    : withoutHash.replace(/^\/+/, '');

  if (relative === 'health' || relative === 'health/') {
    res.status(200).json({ ok: true, service: 'mini-app-proxy' });
    return;
  }

  const target = parseTarget(relative);
  if (!target) {
    res.status(400).json({ error: 'invalid_url' });
    return;
  }
  if (isPrivateHost(target.hostname) || !hostAllowed(target.hostname)) {
    res.status(403).json({ error: 'host_not_allowed' });
    return;
  }
  target.searchParams.delete('__mp');

  const proxyBase = proxyBaseFrom(req);
  const result = await safeFetch(target);
  if (!result) {
    res.status(502).json({ error: 'fetch_failed' });
    return;
  }

  const upstream = result.response;
  const contentType = upstream.headers.get('content-type') || 'application/octet-stream';

  upstream.headers.forEach((value: string, key: string) => {
    if (STRIP_HEADERS.has(key.toLowerCase())) return;
    try {
      res.setHeader(key, value);
    } catch {
      // ba'zi sarlavhalar o'rnatilmasligi mumkin
    }
  });

  res.setHeader('Content-Security-Policy', "frame-ancestors 'self'");
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');

  const isHtml = /text\/html|application\/xhtml\+xml/i.test(contentType);
  const isCss = /text\/css/i.test(contentType);

  if (isHtml || isCss) {
    const text = await upstream.text();
    const base = result.url.toString();
    const body = isHtml
      ? rewriteHtml(text, base, proxyBase)
      : rewriteCssUrls(text, base, proxyBase);

    res.setHeader('Content-Type', isHtml ? 'text/html; charset=utf-8' : 'text/css; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=120');
    res.status(upstream.status).send(body);
    return;
  }

  const declaredLength = Number(upstream.headers.get('content-length') || '0');
  if (declaredLength > MAX_BYTES) {
    res.writeHead(302, { Location: result.url.toString() });
    res.end();
    return;
  }

  const buffer = Buffer.from(await upstream.arrayBuffer());
  res.setHeader('Content-Type', contentType);
  res.status(upstream.status).send(buffer);
}
