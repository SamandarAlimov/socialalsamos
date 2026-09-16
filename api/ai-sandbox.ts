const DEFAULT_AGENT_SERVER_BASE = 'https://api.alsamos.com/ai';

function normalizeBase(raw: unknown) {
  const value = String(raw ?? '').trim().replace(/^['"]|['"]$/g, '').replace(/\/+$/, '');
  return /^https:\/\//i.test(value) ? value : DEFAULT_AGENT_SERVER_BASE;
}

function agentServerBase() {
  return normalizeBase(
    process.env.ALSAMOS_AGENT_SERVER_URL ||
      process.env.VITE_ALSAMOS_AGENT_SERVER_URL ||
      DEFAULT_AGENT_SERVER_BASE,
  );
}

function header(req: any, name: string) {
  const value = req.headers?.[name] ?? req.headers?.[name.toLowerCase()];
  return Array.isArray(value) ? String(value[0] ?? '') : String(value ?? '');
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

function serializeBody(req: any) {
  if (typeof req.body === 'string') return req.body;
  if (req.body && typeof req.body === 'object') return JSON.stringify(req.body);
  return '';
}

export default async function handler(req: any, res: any) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'GET') {
    res.status(200).json({ ok: true, service: 'alsamos-ai-sandbox-proxy' });
    return;
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
    return;
  }

  if (!isAllowedOrigin(header(req, 'origin'))) {
    res.status(403).json({ error: 'ORIGIN_NOT_ALLOWED' });
    return;
  }

  const authorization = header(req, 'authorization');
  if (!authorization.toLowerCase().startsWith('bearer ')) {
    res.status(401).json({ error: 'AUTH_REQUIRED' });
    return;
  }

  const controller = new AbortController();
  req.on?.('aborted', () => controller.abort());

  try {
    const upstream = await fetch(`${agentServerBase()}/v1/sandbox/run`, {
      method: 'POST',
      headers: {
        Authorization: authorization,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(header(req, 'apikey') ? { apikey: header(req, 'apikey') } : {}),
      },
      body: serializeBody(req),
      signal: controller.signal,
    });

    const contentType = upstream.headers.get('content-type') || 'application/json; charset=utf-8';
    res.status(upstream.status);
    res.setHeader('Content-Type', contentType);
    res.send(Buffer.from(await upstream.arrayBuffer()));
  } catch (error) {
    if (controller.signal.aborted) return;
    console.error('AI sandbox proxy failed', error);
    res.status(502).json({ error: 'UPSTREAM_UNAVAILABLE', message: 'AI sandbox serveriga ulanib bo‘lmadi.' });
  }
}
