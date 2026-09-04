function env(name: string): string {
  return String(process.env[name] ?? '').trim();
}

function setNoCache(res: any) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
}

async function patchRows(url: string, serviceKey: string, filter: string, body: Record<string, unknown>) {
  const response = await fetch(`${url}/rest/v1/posts?${filter}`, {
    method: 'PATCH',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`posts_patch_${response.status}:${(await response.text()).slice(0, 300)}`);
  }
}

/**
 * Temporary, idempotent production repair.
 *
 * This endpoint accepts no user-controlled mutation. It can only restore the
 * historical Alsamos invariant that an omitted/blank post visibility means
 * `public`. It exists because the GitHub Supabase deployment workflow currently
 * has no production DB credentials, while Vercel may already hold the service
 * role used by server routes. The endpoint is removed after the repair run.
 */
export default async function handler(req: any, res: any) {
  setNoCache(res);

  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.end(JSON.stringify({ ok: false, error: 'method_not_allowed' }));
    return;
  }

  const url = (env('SUPABASE_URL') || env('VITE_SUPABASE_URL')).replace(/\/+$/, '');
  const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY') || env('SUPABASE_SERVICE_KEY');

  if (!url || !serviceKey) {
    res.statusCode = 503;
    res.end(JSON.stringify({
      ok: false,
      error: 'service_role_missing',
      hasUrl: Boolean(url),
      hasServiceRole: Boolean(serviceKey),
    }));
    return;
  }

  try {
    await patchRows(url, serviceKey, 'visibility=is.null', { visibility: 'public' });
    await patchRows(url, serviceKey, 'visibility=eq.', { visibility: 'public' });

    res.statusCode = 200;
    res.end(JSON.stringify({ ok: true, repaired: true }));
  } catch (error) {
    console.error('[repair-post-visibility]', error);
    res.statusCode = 500;
    res.end(JSON.stringify({
      ok: false,
      error: error instanceof Error ? error.message : 'repair_failed',
    }));
  }
}
