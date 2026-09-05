/* eslint-disable @typescript-eslint/no-explicit-any */

const MEDIA_API_BASE = String(process.env.MEDIA_API_URL || 'https://api.alsamos.com')
  .replace(/\/+$/, '');

function setCors(res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
}

export default async function handler(req: any, res: any) {
  setCors(res);

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const authorization = String(req.headers.authorization || '');
  if (!authorization.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authorization bearer token is required' });
    return;
  }

  const key = typeof req.query?.key === 'string' ? req.query.key : '';
  if (!key) {
    res.status(400).json({ error: 'key is required' });
    return;
  }

  try {
    const upstream = await fetch(
      `${MEDIA_API_BASE}/api/media/sign?key=${encodeURIComponent(key)}`,
      { headers: { Authorization: authorization } },
    );

    const text = await upstream.text();
    res.status(upstream.status);
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json');
    res.send(text);
  } catch (error) {
    res.status(502).json({
      error: error instanceof Error ? error.message : 'Media sign proxy failed',
    });
  }
}
