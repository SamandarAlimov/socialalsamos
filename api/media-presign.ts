/* eslint-disable @typescript-eslint/no-explicit-any */

import { createHash, randomUUID } from 'node:crypto';

const MEDIA_API_BASE = String(process.env.MEDIA_API_URL || 'https://api.alsamos.com')
  .replace(/\/+$/, '');

const SUPABASE_URL = String(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '',
).replace(/\/+$/, '');
const SUPABASE_PUBLIC_KEY = String(
  process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || '',
).trim();

function setCors(res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Cache-Control', 'no-store');
}

async function readJsonBody(req: any): Promise<Record<string, unknown>> {
  if (req.body && typeof req.body === 'object') return req.body as Record<string, unknown>;
  if (typeof req.body === 'string' && req.body.trim()) {
    return JSON.parse(req.body) as Record<string, unknown>;
  }

  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk: Buffer) => {
      body += chunk.toString('utf8');
      if (Buffer.byteLength(body, 'utf8') > 512 * 1024) {
        reject(new Error('Request body is too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? (JSON.parse(body) as Record<string, unknown>) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

type CloudinaryCredentials = {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
};

function cloudinaryCredentials(): CloudinaryCredentials | null {
  const raw = String(process.env.CLOUDINARY_URL || '').trim();
  if (!raw) return null;

  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'cloudinary:') return null;

    const apiKey = decodeURIComponent(parsed.username || '').trim();
    const apiSecret = decodeURIComponent(parsed.password || '').trim();
    const cloudName = parsed.hostname.trim();
    if (!apiKey || !apiSecret || !cloudName) return null;

    return { cloudName, apiKey, apiSecret };
  } catch {
    return null;
  }
}

function safeSegment(value: unknown, fallback: string): string {
  const raw = typeof value === 'string' ? value : '';
  const leaf = raw.replace(/\\/g, '/').split('/').pop()?.trim() || '';
  const safe = leaf
    .replace(/\.[a-zA-Z0-9]{1,10}$/, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
  return safe || fallback;
}

function safeType(value: unknown): string {
  const raw = typeof value === 'string' ? value.toLowerCase() : '';
  const safe = raw.replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  return safe || 'file';
}

function signatureFor(params: Record<string, string | number | boolean>, secret: string): string {
  const payload = Object.entries(params)
    .filter(([, value]) => value !== '' && value !== undefined && value !== null)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${String(value)}`)
    .join('&');

  return createHash('sha1').update(`${payload}${secret}`).digest('hex');
}

async function verifySupabaseSession(authorization: string): Promise<{ id: string } | null> {
  if (!SUPABASE_URL || !SUPABASE_PUBLIC_KEY) return null;

  try {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        Authorization: authorization,
        apikey: SUPABASE_PUBLIC_KEY,
      },
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { id?: string };
    return body.id ? { id: body.id } : null;
  } catch {
    return null;
  }
}

async function cloudinaryPresign(
  body: Record<string, unknown>,
  authorization: string,
  credentials: CloudinaryCredentials,
  res: any,
): Promise<boolean> {
  const session = await verifySupabaseSession(authorization);
  if (!session) {
    res.status(401).json({ error: 'Invalid or expired Alsamos session' });
    return true;
  }

  const visibility = body.visibility === 'private' ? 'private' : 'public';
  // Temporary Cloudinary adapter deliberately handles public media only.
  // Friends/private media stays on the authenticated Supabase Storage path
  // until Alsamos' own media server or signed Cloudinary delivery is enabled.
  if (visibility !== 'public') {
    res.status(409).json({
      error: 'Private media is not enabled on the temporary Cloudinary adapter',
    });
    return true;
  }

  const size = typeof body.size === 'number' ? body.size : Number(body.size || 0);
  if (!Number.isFinite(size) || size <= 0) {
    res.status(400).json({ error: 'A positive file size is required' });
    return true;
  }

  const type = safeType(body.type);
  const filename = safeSegment(body.filename, 'upload');
  const timestamp = Math.floor(Date.now() / 1000);
  const publicId = `alsamos/${session.id}/${type}/${timestamp}-${randomUUID()}-${filename}`;
  const signedParams = {
    overwrite: false,
    public_id: publicId,
    timestamp,
  };
  const signature = signatureFor(signedParams, credentials.apiSecret);

  res.status(200).json({
    provider: 'cloudinary',
    upload_url: `https://api.cloudinary.com/v1_1/${encodeURIComponent(credentials.cloudName)}/auto/upload`,
    method: 'POST',
    fields: {
      api_key: credentials.apiKey,
      overwrite: 'false',
      public_id: publicId,
      timestamp: String(timestamp),
      signature,
    },
    key: publicId,
    bucket: 'alsamos-media',
    visibility: 'public',
  });
  return true;
}

export default async function handler(req: any, res: any) {
  setCors(res);

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const authorization = String(req.headers.authorization || '');
  if (!authorization.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authorization bearer token is required' });
    return;
  }

  try {
    const body = await readJsonBody(req);
    const cloudinary = cloudinaryCredentials();
    if (cloudinary) {
      await cloudinaryPresign(body, authorization, cloudinary, res);
      return;
    }

    // When Cloudinary is not configured, preserve the existing Alsamos media
    // server contract. The browser can still fall back to Supabase Storage.
    const upstream = await fetch(`${MEDIA_API_BASE}/api/media/presign`, {
      method: 'POST',
      headers: {
        Authorization: authorization,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body ?? {}),
    });

    const text = await upstream.text();
    res.status(upstream.status);
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json');
    res.send(text);
  } catch (error) {
    res.status(502).json({
      error: error instanceof Error ? error.message : 'Media presign proxy failed',
    });
  }
}
