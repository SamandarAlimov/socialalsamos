// Mini app URL'ining iframe'da ochilishini sarlavhalar bo'yicha tekshiradi.
//
// POST /functions/v1/mini-app-frame-check  { appId }  — natijani bazaga yozadi
// POST /functions/v1/mini-app-frame-check  { url }    — faqat tekshirib qaytaradi
//
// Brauzer CSP `frame-ancestors` yoki `X-Frame-Options` sababli bloklanishini
// JS orqali ushlay olmaydi (iframe onError ishlamaydi, faqat timeout bo'ladi).
// Shuning uchun tekshiruvni server tomonda, HTTP sarlavhalarini o'qib bajaramiz.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const FETCH_TIMEOUT_MS = 10000;
const HOST_HEADER = 'https://www.alsamos.com';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

type FrameVerdict = {
  blocked: boolean;
  reason: string | null;
  xFrameOptions: string | null;
  frameAncestors: string | null;
};

/** `frame-ancestors` direktivasini CSP satridan ajratib oladi. */
function extractFrameAncestors(csp: string | null): string | null {
  if (!csp) return null;
  for (const directive of csp.split(';')) {
    const trimmed = directive.trim();
    if (trimmed.toLowerCase().startsWith('frame-ancestors')) {
      return trimmed.slice('frame-ancestors'.length).trim();
    }
  }
  return null;
}

function evaluate(headers: Headers): FrameVerdict {
  const xfo = headers.get('x-frame-options');
  const csp = headers.get('content-security-policy');
  const frameAncestors = extractFrameAncestors(csp);

  if (xfo) {
    const value = xfo.trim().toLowerCase();
    if (value === 'deny' || value === 'sameorigin' || value.startsWith('allow-from')) {
      return { blocked: true, reason: 'x_frame_options:' + value, xFrameOptions: xfo, frameAncestors };
    }
  }

  if (frameAncestors !== null) {
    const value = frameAncestors.toLowerCase();
    const allowsUs =
      value.includes('*') ||
      value.includes('https:') ||
      value.includes('alsamos.com');
    if (!allowsUs) {
      return {
        blocked: true,
        reason: 'frame_ancestors:' + frameAncestors,
        xFrameOptions: xfo,
        frameAncestors,
      };
    }
  }

  return { blocked: false, reason: null, xFrameOptions: xfo, frameAncestors };
}

async function probe(url: string): Promise<FrameVerdict> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    let response = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'user-agent': 'AlsamosMiniApps/2.0 (+' + HOST_HEADER + ')' },
    });

    // Ba'zi saytlar HEAD ni qo'llab-quvvatlamaydi.
    if (response.status === 405 || response.status === 501) {
      response = await fetch(url, {
        method: 'GET',
        redirect: 'follow',
        signal: controller.signal,
        headers: { 'user-agent': 'AlsamosMiniApps/2.0 (+' + HOST_HEADER + ')' },
      });
    }

    return evaluate(response.headers);
  } finally {
    clearTimeout(timer);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!supabaseUrl || !serviceKey) return json({ error: 'SERVER_MISCONFIGURED' }, 500);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'INVALID_BODY' }, 400);
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const appId = typeof body.appId === 'string' ? body.appId : '';
  let targetUrl = typeof body.url === 'string' ? body.url : '';

  if (appId && !targetUrl) {
    const { data } = await admin
      .from('mini_apps')
      .select('url')
      .eq('id', appId)
      .maybeSingle();
    targetUrl = String((data as { url?: string } | null)?.url ?? '');
  }

  if (!targetUrl) return json({ error: 'URL_REQUIRED' }, 400);
  if (!/^https:\/\//i.test(targetUrl)) return json({ error: 'HTTPS_REQUIRED' }, 400);

  let verdict: FrameVerdict;
  try {
    verdict = await probe(targetUrl);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'FETCH_FAILED';
    if (appId) {
      await admin.rpc('mini_app_set_frame_result', {
        p_app_id: appId,
        p_blocked: false,
        p_error: 'probe_failed:' + message,
      });
    }
    return json({ error: 'PROBE_FAILED', details: message }, 502);
  }

  if (appId) {
    const { error } = await admin.rpc('mini_app_set_frame_result', {
      p_app_id: appId,
      p_blocked: verdict.blocked,
      p_error: verdict.reason,
    });
    if (error) return json({ error: 'RESULT_WRITE_FAILED', details: error.message }, 500);
  }

  return json({ url: targetUrl, ...verdict });
});
