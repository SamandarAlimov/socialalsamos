// Mini Apps admin gateway.
//
// `mini_app_moderation_queue` va `mini_app_set_status` RPC lari faqat `service_role`
// uchun ochiq. Brauzer service key ni ko'ra olmasligi kerak, shuning uchun admin
// amallari shu funksiya orqali o'tadi.
//
// POST { action: 'queue', status?, limit?, offset? }
// POST { action: 'setStatus', appId, status, note? }
// POST { action: 'verifyPublisher', publisherId, level }
//
// Admin aniqlash tartibi:
//   1) MINI_APP_ADMIN_IDS muhit o'zgaruvchisidagi UUID ro'yxati (vergul bilan)
//   2) public.user_roles jadvalida role = 'admin' | 'moderator' (agar jadval bo'lsa)
//   3) public.profiles.is_admin = true (agar ustun bo'lsa)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const ALLOWED_STATUSES = [
  'draft',
  'pending_review',
  'approved',
  'rejected',
  'suspended',
  'archived',
];

const ALLOWED_LEVELS = ['unverified', 'email_verified', 'domain_verified', 'official'];

type AdminClient = ReturnType<typeof createClient>;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function isAdmin(admin: AdminClient, userId: string): Promise<boolean> {
  const allowList = (Deno.env.get('MINI_APP_ADMIN_IDS') ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  if (allowList.includes(userId)) return true;

  try {
    const { data } = await admin.from('user_roles').select('role').eq('user_id', userId);
    const roles = (data ?? []).map((row: { role?: string }) => String(row.role ?? ''));
    if (roles.includes('admin') || roles.includes('moderator')) return true;
  } catch {
    // jadval mavjud bo'lmasa e'tiborsiz qoldiriladi
  }

  try {
    const { data } = await admin
      .from('profiles')
      .select('is_admin')
      .eq('id', userId)
      .maybeSingle();
    if (data && (data as { is_admin?: boolean }).is_admin === true) return true;
  } catch {
    // ustun mavjud bo'lmasa e'tiborsiz qoldiriladi
  }

  return false;
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
  if (!supabaseUrl || !serviceKey) return json({ error: 'SERVER_MISCONFIGURED' }, 500);

  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) return json({ error: 'AUTH_REQUIRED' }, 401);

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData } = await userClient.auth.getUser();
  const user = userData?.user;
  if (!user) return json({ error: 'AUTH_REQUIRED' }, 401);

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  if (!(await isAdmin(admin, user.id))) {
    return json({ error: 'FORBIDDEN' }, 403);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'INVALID_BODY' }, 400);
  }

  const action = String(body.action ?? '');

  if (action === 'queue') {
    const status = typeof body.status === 'string' ? body.status : 'pending_review';
    if (!ALLOWED_STATUSES.includes(status)) return json({ error: 'BAD_STATUS' }, 400);

    const { data, error } = await admin.rpc('mini_app_moderation_queue', {
      p_status: status,
      p_limit: Math.min(Number(body.limit ?? 30), 100),
      p_offset: Number(body.offset ?? 0),
    });
    if (error) return json({ error: error.message }, 500);
    return json({ items: data ?? [] });
  }

  if (action === 'setStatus') {
    const appId = String(body.appId ?? '');
    const status = String(body.status ?? '');
    if (!appId) return json({ error: 'APP_ID_REQUIRED' }, 400);
    if (!ALLOWED_STATUSES.includes(status)) return json({ error: 'BAD_STATUS' }, 400);

    // mini_app_set_status(p_app_id uuid, p_status text, p_reason text)
    const { error } = await admin.rpc('mini_app_set_status', {
      p_app_id: appId,
      p_status: status,
      p_reason: typeof body.note === 'string' && body.note ? body.note : null,
    });
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true, appId, status });
  }

  if (action === 'verifyPublisher') {
    const publisherId = String(body.publisherId ?? '');
    const level = String(body.level ?? '');
    if (!publisherId) return json({ error: 'PUBLISHER_ID_REQUIRED' }, 400);
    if (!ALLOWED_LEVELS.includes(level)) return json({ error: 'BAD_LEVEL' }, 400);

    const { error } = await admin
      .from('publishers')
      .update({ verification: level, updated_at: new Date().toISOString() })
      .eq('id', publisherId);
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true, publisherId, level });
  }

  return json({ error: 'UNKNOWN_ACTION' }, 400);
});
