const CANONICAL_SUPABASE_URL = 'https://tcykulflvagvwuygwgmu.supabase.co';
const CANONICAL_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_ZfK2a0Rut0mlFYVaLpKt9g_YmX-Ppu1';

function normalizeEnvValue(raw: unknown, acceptedKeys: string[]) {
  let value = String(raw ?? '').trim();
  if (
    value.length >= 2 &&
    ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'")))
  ) {
    value = value.slice(1, -1).trim();
  }

  for (const key of acceptedKeys) {
    const prefix = `${key}=`;
    if (value.startsWith(prefix)) {
      value = value.slice(prefix.length).trim();
      break;
    }
  }

  if (
    value.length >= 2 &&
    ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'")))
  ) {
    value = value.slice(1, -1).trim();
  }
  return value;
}

function supabaseConfig() {
  const configuredUrl = normalizeEnvValue(
    process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
    ['SUPABASE_URL', 'VITE_SUPABASE_URL'],
  );
  const configuredKey = normalizeEnvValue(
    process.env.SUPABASE_PUBLISHABLE_KEY ||
      process.env.SUPABASE_ANON_KEY ||
      process.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    ['SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_ANON_KEY', 'VITE_SUPABASE_PUBLISHABLE_KEY'],
  );

  const validUrl = /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(configuredUrl);
  const validKey = configuredKey.startsWith('sb_publishable_') || configuredKey.startsWith('eyJ');

  return {
    url: (validUrl ? configuredUrl : CANONICAL_SUPABASE_URL).replace(/\/+$/, ''),
    key: validKey ? configuredKey : CANONICAL_SUPABASE_PUBLISHABLE_KEY,
  };
}

function isAllowedOrigin(origin: string) {
  if (!origin) return true;
  try {
    const url = new URL(origin);
    const host = url.hostname.toLowerCase();
    if (url.protocol === 'https:' && (host === 'alsamos.com' || host === 'www.alsamos.com' || host.endsWith('.alsamos.com'))) return true;
    if (url.protocol === 'https:' && host.endsWith('.vercel.app')) return true;
    return url.protocol === 'http:' && (host === 'localhost' || host === '127.0.0.1');
  } catch {
    return false;
  }
}

function header(req: any, name: string) {
  const value = req.headers?.[name] ?? req.headers?.[name.toLowerCase()];
  return Array.isArray(value) ? String(value[0] ?? '') : String(value ?? '');
}

function clientIp(req: any) {
  const vercelForwarded = header(req, 'x-vercel-forwarded-for');
  if (vercelForwarded) return vercelForwarded.split(',')[0].trim();
  const realIp = header(req, 'x-real-ip');
  if (realIp) return realIp.trim();
  const forwarded = header(req, 'x-forwarded-for');
  return forwarded.split(',')[0].trim();
}

export default async function handler(req: any, res: any) {
  if (req.method === 'GET') {
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ ok: true, service: 'account-signup-proxy' });
    return;
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
    return;
  }

  const origin = header(req, 'origin');
  if (!isAllowedOrigin(origin)) {
    res.status(403).json({ error: 'ORIGIN_NOT_ALLOWED', message: "Ro'yxatdan o'tish so'rovi rad etildi." });
    return;
  }

  const body = req.body && typeof req.body === 'object' ? req.body : null;
  if (!body) {
    res.status(400).json({ error: 'INVALID_REQUEST', message: "Ro'yxatdan o'tish ma'lumotlari topilmadi." });
    return;
  }

  const { url, key } = supabaseConfig();
  const headers: Record<string, string> = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  const ip = clientIp(req);
  if (ip) headers['x-forwarded-for'] = ip;

  try {
    const upstream = await fetch(`${url}/functions/v1/account-signup`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
    });

    const text = await upstream.text();
    let payload: unknown = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = { error: 'UPSTREAM_INVALID_RESPONSE', message: "Ro'yxatdan o'tish xizmati noto'g'ri javob qaytardi." };
    }

    res.setHeader('Cache-Control', 'no-store');
    res.status(upstream.status).json(payload ?? {});
  } catch (error) {
    const details = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    console.error('[account-signup-proxy] upstream fetch failed:', details.slice(0, 300));
    res.status(503).json({
      error: 'SIGNUP_SERVICE_UNAVAILABLE',
      message: "Ro'yxatdan o'tish xizmati bilan aloqa o'rnatilmadi. Qaytadan urinib ko'ring.",
    });
  }
}
