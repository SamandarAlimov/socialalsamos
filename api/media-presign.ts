/* eslint-disable @typescript-eslint/no-explicit-any */

const MEDIA_API_BASE = String(process.env.MEDIA_API_URL || 'https://api.alsamos.com')
  .replace(/\/+$/, '');

function setCors(res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
}

async function readJsonBody(req: any): Promise<unknown> {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string' && req.body.trim()) return JSON.parse(req.body);

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
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
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
