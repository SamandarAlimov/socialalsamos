type ClientErrorPayload = {
  kind?: unknown;
  message?: unknown;
  stack?: unknown;
  file?: unknown;
  line?: unknown;
  column?: unknown;
  tag?: unknown;
  resource?: unknown;
  path?: unknown;
  userAgent?: unknown;
  stage?: unknown;
};

const MAX_TEXT = 4000;

function text(value: unknown, max = MAX_TEXT): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, max);
}

function number(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function safePayload(body: ClientErrorPayload) {
  return {
    kind: text(body.kind, 80) || 'client-error',
    message: text(body.message, 1200),
    stack: text(body.stack, 4000),
    file: text(body.file, 1200),
    line: number(body.line),
    column: number(body.column),
    tag: text(body.tag, 40),
    resource: text(body.resource, 1600),
    path: text(body.path, 800),
    userAgent: text(body.userAgent, 1000),
    stage: text(body.stage, 80),
  };
}

export default function handler(req: any, res: any) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let body: ClientErrorPayload = {};
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
  } catch {
    body = { kind: 'invalid-client-error-payload', message: 'Payload was not valid JSON' };
  }

  const payload = safePayload(body);
  console.error('[alsamos-client-error]', JSON.stringify(payload));

  return res.status(204).end();
}
