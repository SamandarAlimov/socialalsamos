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
    res.status(200).json({ ok: true, service: 'alsamos-ai-agent-proxy' });
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
  req.on?.('close', () => controller.abort());

  try {
    const upstream = await fetch(`${agentServerBase()}/api/alsamos/agent`, {
      method: 'POST',
      headers: {
        Authorization: authorization,
        'Content-Type': 'application/json',
        Accept: 'text/event-stream, application/json',
        ...(header(req, 'apikey') ? { apikey: header(req, 'apikey') } : {}),
      },
      body: serializeBody(req),
      signal: controller.signal,
    });

    res.status(upstream.status);
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json; charset=utf-8');
    for (const name of ['x-ai-model', 'x-ai-task', 'x-ai-language', 'x-request-id']) {
      const value = upstream.headers.get(name);
      if (value) res.setHeader(name, value);
    }

    if (!upstream.body) {
      res.end();
      return;
    }

    const reader = upstream.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value?.length) res.write(Buffer.from(value));
      }
    } finally {
      reader.releaseLock();
    }
    res.end();
  } catch (error) {
    if (controller.signal.aborted) return;
    console.error('AI agent proxy failed', error);
    if (!res.headersSent) res.status(502);
    res.end(JSON.stringify({ error: 'UPSTREAM_UNAVAILABLE', message: 'AI agent serveriga ulanib bo‘lmadi.' }));
  }
}
