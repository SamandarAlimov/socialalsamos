/* eslint-disable @typescript-eslint/no-explicit-any */

const SUPABASE_URL = String(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '',
).replace(/\/+$/, '');
const SUPABASE_PUBLIC_KEY = String(
  process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || '',
).trim();

function header(req: any, name: string): string {
  const value = req.headers?.[name.toLowerCase()];
  if (Array.isArray(value)) return String(value[0] || '');
  return String(value || '');
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

async function readJsonBody(req: any): Promise<Record<string, unknown>> {
  if (req.body && typeof req.body === 'object') return req.body as Record<string, unknown>;
  if (typeof req.body === 'string' && req.body.trim()) return JSON.parse(req.body) as Record<string, unknown>;
  return {};
}

async function verifySession(authorization: string): Promise<boolean> {
  if (!SUPABASE_URL || !SUPABASE_PUBLIC_KEY) return false;
  try {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: authorization, apikey: SUPABASE_PUBLIC_KEY },
    });
    return response.ok;
  } catch {
    return false;
  }
}

export default async function handler(req: any, res: any) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  if (!SUPABASE_URL || !SUPABASE_PUBLIC_KEY) {
    res.status(503).json({ error: 'Session context service is not configured' });
    return;
  }

  const authorization = header(req, 'authorization');
  if (!authorization.startsWith('Bearer ') || !(await verifySession(authorization))) {
    res.status(401).json({ error: 'Invalid or expired Alsamos session' });
    return;
  }

  const body = await readJsonBody(req);
  const sessionId = typeof body.session_id === 'string' ? body.session_id.trim() : '';
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(sessionId)) {
    res.status(400).json({ error: 'Valid session_id is required' });
    return;
  }

  const rawCountry = header(req, 'x-vercel-ip-country').trim().toUpperCase();
  const countryCode = /^[A-Z]{2}$/.test(rawCountry) ? rawCountry : null;
  const rawCity = safeDecode(header(req, 'x-vercel-ip-city').trim()).slice(0, 120);
  const city = rawCity || null;
  const forwardedFor = header(req, 'x-forwarded-for');
  const ip = forwardedFor.split(',')[0]?.trim().slice(0, 128) || null;

  try {
    const upstream = await fetch(`${SUPABASE_URL}/rest/v1/rpc/capture_user_session_geo_v1`, {
      method: 'POST',
      headers: {
        Authorization: authorization,
        apikey: SUPABASE_PUBLIC_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        p_session_id: sessionId,
        p_country_code: countryCode,
        p_city: city,
        p_ip: ip,
      }),
    });

    const text = await upstream.text();
    if (!upstream.ok) {
      res.status(upstream.status).json({ error: 'Unable to capture session context' });
      return;
    }

    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json');
    res.status(200).send(text);
  } catch {
    res.status(502).json({ error: 'Session context upstream unavailable' });
  }
}
