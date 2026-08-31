// Publisher domenini DNS TXT yozuvi orqali tasdiqlaydi.
//
// POST /functions/v1/mini-app-verify-domain  { domainId }
//
// Foydalanuvchi avval `mini_app_publisher_add_domain` RPC orqali token oladi va uni
// domenning TXT yozuviga (yoki `_alsamos.<domen>` ga) qo'yadi. Bu funksiya DNS-over-HTTPS
// orqali tekshiradi va natijani `mini_app_publisher_domain_result` bilan yozadi.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const DNS_RESOLVER = 'https://dns.google/resolve';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function txtRecords(name: string): Promise<string[]> {
  const query = DNS_RESOLVER + '?name=' + encodeURIComponent(name) + '&type=TXT';
  const response = await fetch(query, { headers: { accept: 'application/dns-json' } });
  if (!response.ok) return [];
  const payload = await response.json();
  const answers = Array.isArray(payload?.Answer) ? payload.Answer : [];
  return answers
    .map((answer: { data?: string }) => String(answer.data ?? ''))
    .map((value: string) => value.replace(/^"|"$/g, '').replace(/"\s+"/g, ''));
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
  if (!supabaseUrl || !serviceKey) {
    return json({ error: 'SERVER_MISCONFIGURED' }, 500);
  }

  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    return json({ error: 'AUTH_REQUIRED' }, 401);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData } = await userClient.auth.getUser();
  const user = userData?.user;
  if (!user) return json({ error: 'AUTH_REQUIRED' }, 401);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'INVALID_BODY' }, 400);
  }

  const domainId = typeof body.domainId === 'string' ? body.domainId : '';
  if (!domainId) return json({ error: 'DOMAIN_ID_REQUIRED' }, 400);

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: domainRow } = await admin
    .from('publisher_domains')
    .select('id, publisher_id, domain, verification_token, verified_at')
    .eq('id', domainId)
    .maybeSingle();

  if (!domainRow) return json({ error: 'DOMAIN_NOT_FOUND' }, 404);

  // Faqat publisher a'zosi tekshiruvni ishga tushira oladi.
  const { data: membership } = await admin
    .from('publisher_members')
    .select('role')
    .eq('publisher_id', domainRow.publisher_id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!membership || !['owner', 'admin'].includes(String(membership.role))) {
    return json({ error: 'FORBIDDEN' }, 403);
  }

  const token = String(domainRow.verification_token ?? '');
  if (!token) return json({ error: 'TOKEN_MISSING' }, 400);

  const domain = String(domainRow.domain);
  let records: string[] = [];
  try {
    const [root, sub] = await Promise.all([
      txtRecords(domain),
      txtRecords('_alsamos.' + domain),
    ]);
    records = [...root, ...sub];
  } catch (error) {
    const message = error instanceof Error ? error.message : 'DNS_ERROR';
    await admin.rpc('mini_app_publisher_domain_result', {
      p_domain_id: domainId,
      p_verified: false,
      p_error: message,
    });
    return json({ verified: false, error: 'DNS_ERROR', details: message }, 502);
  }

  const verified = records.some((record) => record.includes(token));

  const { error: rpcError } = await admin.rpc('mini_app_publisher_domain_result', {
    p_domain_id: domainId,
    p_verified: verified,
    p_error: verified ? null : 'TXT_NOT_FOUND',
  });
  if (rpcError) {
    return json({ error: 'RESULT_WRITE_FAILED', details: rpcError.message }, 500);
  }

  return json({
    verified,
    domain,
    checkedRecords: records.length,
    expectedToken: token,
    hint: verified
      ? null
      : 'TXT yozuvi topilmadi. DNS tarqalishi 24 soatgacha davom etishi mumkin.',
  });
});
