/* eslint-disable @typescript-eslint/no-explicit-any */

const CANONICAL_PROJECT_REF = 'tcykulflvagvwuygwgmu';
const CANONICAL_SUPABASE_URL = `https://${CANONICAL_PROJECT_REF}.supabase.co`;
const CANONICAL_SUPABASE_PUBLISHABLE_KEY =
  'sb_publishable_ZfK2a0Rut0mlFYVaLpKt9g_YmX-Ppu1';

const SUPABASE_URL = String(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || CANONICAL_SUPABASE_URL,
).replace(/\/+$/, '');

const SUPABASE_PUBLISHABLE_KEY = String(
  process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    CANONICAL_SUPABASE_PUBLISHABLE_KEY,
).trim();

const ALLOWED_METHODS = new Set(['GET', 'POST', 'PATCH', 'DELETE', 'HEAD']);
const FORWARDED_REQUEST_HEADERS = [
  'accept',
  'content-type',
  'prefer',
  'range',
  'range-unit',
  'accept-profile',
  'content-profile',
  'x-client-info',
];
const FORWARDED_RESPONSE_HEADERS = [
  'content-type',
  'content-range',
  'range-unit',
  'location',
  'preference-applied',
];

function setCommonHeaders(res: any) {
  res.setHeader('Cache-Control', 'no-store');
}

function getPath(req: any): string | null {
  const raw = Array.isArray(req.query?.path) ? req.query.path[0] : req.query?.path;
  if (typeof raw !== 'string') return null;
  if (!raw.startsWith('/rest/v1/')) return null;
  if (raw.includes('\\') || raw.includes('\0')) return null;
  return raw;
}

function serializeBody(req: any): string | undefined {
  if (req.method === 'GET' || req.method === 'HEAD') return undefined;
  if (req.body == null || req.body === '') return undefined;
  if (typeof req.body === 'string') return req.body;
  if (Buffer.isBuffer(req.body)) return req.body.toString('utf8');
  return JSON.stringify(req.body);
}

export default async function handler(req: any, res: any) {
  setCommonHeaders(res);

  if (req.method === 'OPTIONS') {
    res.setHeader('Allow', 'GET,POST,PATCH,DELETE,HEAD,OPTIONS');
    res.status(204).end();
    return;
  }

  const method = String(req.method || 'GET').toUpperCase();
  if (!ALLOWED_METHODS.has(method)) {
    res.setHeader('Allow', 'GET,POST,PATCH,DELETE,HEAD,OPTIONS');
    res.status(405).json({ message: 'Method not allowed' });
    return;
  }

  const path = getPath(req);
  if (!path) {
    res.status(400).json({ message: 'Invalid Supabase REST path' });
    return;
  }

  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    res.status(503).json({ message: 'Supabase proxy is not configured' });
    return;
  }

  const upstreamBase = new URL(SUPABASE_URL);
  const upstreamUrl = new URL(path, `${upstreamBase.origin}/`);
  if (
    upstreamUrl.origin !== upstreamBase.origin ||
    !upstreamUrl.pathname.startsWith('/rest/v1/')
  ) {
    res.status(400).json({ message: 'Invalid Supabase REST path' });
    return;
  }

  const headers: Record<string, string> = {
    apikey: SUPABASE_PUBLISHABLE_KEY,
  };

  const authorization = String(req.headers.authorization || '').trim();
  if (authorization) headers.authorization = authorization;

  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = req.headers[name];
    if (typeof value === 'string' && value) headers[name] = value;
  }
  if (!headers.accept) headers.accept = 'application/json';

  try {
    const upstream = await fetch(upstreamUrl, {
      method,
      headers,
      body: serializeBody(req),
      signal: AbortSignal.timeout(15_000),
    });

    res.status(upstream.status);
    for (const name of FORWARDED_RESPONSE_HEADERS) {
      const value = upstream.headers.get(name);
      if (value) res.setHeader(name, value);
    }

    if (method === 'HEAD' || upstream.status === 204) {
      res.end();
      return;
    }

    res.send(await upstream.text());
  } catch (error) {
    res.status(502).json({
      message: 'Supabase REST proxy failed',
      error: error instanceof Error ? error.message : 'Unknown upstream error',
    });
  }
}
