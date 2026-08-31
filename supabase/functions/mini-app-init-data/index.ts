// Mini App SDK — imzolangan initData berish va tekshirish.
//
// POST /functions/v1/mini-app-init-data        { appId, platform }  -> initData beradi
// POST /functions/v1/mini-app-init-data?verify=1 { initData }       -> imzoni tekshiradi
//
// Imzo sxemasi Telegram Web App uslubida:
//   secretKey = HMAC_SHA256(key: 'WebAppData', message: MINI_APP_SDK_SECRET)
//   hash      = HMAC_SHA256(key: secretKey,  message: dataCheckString)
// dataCheckString — kalitlar alifbo tartibida, har biri 'kalit=qiymat', \n bilan qo'shilgan.
//
// Muhit o'zgaruvchilari: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
// MINI_APP_SDK_SECRET.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const TTL_SECONDS = 3600;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function hmac(key: ArrayBuffer | Uint8Array, message: string): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(message));
  return new Uint8Array(signature);
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function buildDataCheckString(fields: Record<string, string>): string {
  return Object.keys(fields)
    .filter((key) => key !== 'hash')
    .sort()
    .map((key) => key + '=' + fields[key])
    .join('\n');
}

async function signFields(fields: Record<string, string>, secret: string): Promise<string> {
  const secretKey = await hmac(new TextEncoder().encode('WebAppData'), secret);
  const signature = await hmac(secretKey, buildDataCheckString(fields));
  return toHex(signature);
}

// Tayming hujumlariga qarshi doimiy vaqtli solishtirish.
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) {
    diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return diff === 0;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return json({ error: 'METHOD_NOT_ALLOWED' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const secret = Deno.env.get('MINI_APP_SDK_SECRET') ?? '';

  if (!supabaseUrl || !serviceKey || !secret) {
    return json({ error: 'SERVER_MISCONFIGURED' }, 500);
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'INVALID_BODY' }, 400);
  }

  const url = new URL(req.url);
  const isVerify = url.searchParams.get('verify') === '1' || body.mode === 'verify';

  // ---------------------------------------------------------------- verify
  if (isVerify) {
    const initData = typeof body.initData === 'string' ? body.initData : '';
    if (!initData) return json({ error: 'INIT_DATA_REQUIRED' }, 400);

    const params = new URLSearchParams(initData);
    const hash = params.get('hash') ?? '';
    const fields: Record<string, string> = {};
    params.forEach((value, key) => {
      if (key !== 'hash') fields[key] = value;
    });

    const expected = await signFields(fields, secret);
    if (!hash || !safeEqual(hash, expected)) {
      return json({ ok: false, error: 'BAD_SIGNATURE' }, 401);
    }

    const expiresAt = Number(fields.exp ?? '0');
    if (!expiresAt || expiresAt * 1000 < Date.now()) {
      return json({ ok: false, error: 'EXPIRED' }, 401);
    }

    const { data: session } = await admin
      .from('mini_app_sdk_sessions')
      .select('id, app_id, user_id, consumed_at, expires_at')
      .eq('nonce', fields.nonce ?? '')
      .maybeSingle();

    if (!session) return json({ ok: false, error: 'UNKNOWN_SESSION' }, 401);
    if (session.app_id !== fields.app_id) return json({ ok: false, error: 'APP_MISMATCH' }, 401);

    await admin
      .from('mini_app_sdk_sessions')
      .update({ consumed_at: new Date().toISOString() })
      .eq('id', session.id);

    return json({
      ok: true,
      appId: session.app_id,
      userId: session.user_id,
      firstUse: session.consumed_at === null,
    });
  }

  // ------------------------------------------------------------------ issue
  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    return json({ error: 'AUTH_REQUIRED' }, 401);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userError } = await userClient.auth.getUser();
  const user = userData?.user;
  if (userError || !user) {
    return json({ error: 'AUTH_REQUIRED' }, 401);
  }

  const appId = typeof body.appId === 'string' ? body.appId : '';
  if (!appId) return json({ error: 'APP_ID_REQUIRED' }, 400);

  const { data: app } = await admin
    .from('mini_apps')
    .select('id, status, app_type, permissions')
    .eq('id', appId)
    .maybeSingle();

  if (!app || app.status !== 'approved') {
    return json({ error: 'APP_NOT_AVAILABLE' }, 404);
  }
  if (app.app_type !== 'webapp') {
    return json({ error: 'SDK_ONLY_FOR_WEBAPP' }, 400);
  }

  const { data: profile } = await admin
    .from('profiles')
    .select('username, display_name, avatar_url')
    .eq('id', user.id)
    .maybeSingle();

  const nonce = crypto.randomUUID();
  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAt = issuedAt + TTL_SECONDS;
  const platform = typeof body.platform === 'string' ? body.platform : 'web';

  const { error: sessionError } = await admin.from('mini_app_sdk_sessions').insert({
    app_id: appId,
    user_id: user.id,
    nonce,
    platform,
    expires_at: new Date(expiresAt * 1000).toISOString(),
  });
  if (sessionError) {
    return json({ error: 'SESSION_FAILED', details: sessionError.message }, 500);
  }

  // Faqat zarur maydonlar uzatiladi — email va telefon hech qachon berilmaydi.
  const userPayload = {
    id: user.id,
    username: profile?.username ?? null,
    name: profile?.display_name ?? null,
    photo_url: profile?.avatar_url ?? null,
  };

  const fields: Record<string, string> = {
    app_id: appId,
    auth_date: String(issuedAt),
    exp: String(expiresAt),
    nonce,
    platform,
    user: JSON.stringify(userPayload),
  };

  const hash = await signFields(fields, secret);
  const params = new URLSearchParams(fields);
  params.set('hash', hash);

  return json({
    initData: params.toString(),
    initDataUnsafe: { ...fields, user: userPayload, hash },
    expiresAt,
  });
});
