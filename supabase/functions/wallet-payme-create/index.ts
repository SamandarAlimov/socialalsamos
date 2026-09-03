import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

function env(name: string) {
  return Deno.env.get(name)?.trim() || '';
}

function allowedReturnUrl(raw?: string) {
  const fallback = env('ALSAMOS_APP_URL') || 'https://www.alsamos.com/payment?topup=return';
  if (!raw) return fallback;
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase();
    if (host === 'alsamos.com' || host === 'www.alsamos.com' || host.endsWith('.alsamos.com')) {
      return url.toString();
    }
  } catch {
    // ignore
  }
  return fallback;
}

function base64(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=+$/g, '');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const merchantId = env('PAYME_MERCHANT_ID');
  const checkoutUrl = env('PAYME_CHECKOUT_URL') || 'https://checkout.paycom.uz';

  if (req.method === 'GET') {
    return Response.json(
      { configured: Boolean(merchantId), provider: 'payme' },
      { headers: corsHeaders },
    );
  }

  if (req.method !== 'POST') {
    return Response.json({ error: 'method_not_allowed' }, { status: 405, headers: corsHeaders });
  }

  if (!merchantId) {
    return Response.json(
      {
        configured: false,
        error: 'payme_not_configured',
        message: 'PAYME_MERCHANT_ID Supabase secret hali sozlanmagan.',
      },
      { status: 503, headers: corsHeaders },
    );
  }

  const authHeader = req.headers.get('Authorization') || '';
  if (!authHeader.startsWith('Bearer ')) {
    return Response.json({ error: 'not_authenticated' }, { status: 401, headers: corsHeaders });
  }

  const supabaseUrl = env('SUPABASE_URL');
  const anonKey = env('SUPABASE_ANON_KEY');
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: authData, error: authError } = await userClient.auth.getUser();
  if (authError || !authData.user) {
    return Response.json({ error: 'not_authenticated' }, { status: 401, headers: corsHeaders });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'invalid_json' }, { status: 400, headers: corsHeaders });
  }

  const amount = Number(body?.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return Response.json({ error: 'invalid_amount' }, { status: 400, headers: corsHeaders });
  }

  const returnUrl = allowedReturnUrl(body?.returnUrl);

  const { data, error } = await userClient.rpc('create_wallet_payment_intent', {
    _provider: 'payme',
    _amount: amount,
    _return_url: returnUrl,
  });

  if (error || !data?.intent_id) {
    const message = String(error?.message || '');
    const status = message.includes('provider_requires_uzs_wallet') ? 409 : 400;
    return Response.json(
      { error: message || 'intent_create_failed' },
      { status, headers: corsHeaders },
    );
  }

  const amountTiyin = Math.round(Number(data.amount) * 100);
  const params = [
    'm=' + merchantId,
    'ac.intent_id=' + data.intent_id,
    'a=' + amountTiyin,
    'l=uz',
    'c=' + returnUrl,
    'ct=5000',
    'cr=860',
  ].join(';');

  const paymentUrl = checkoutUrl.replace(/\/$/, '') + '/' + base64(params);

  return Response.json(
    {
      configured: true,
      provider: 'payme',
      intentId: data.intent_id,
      amount: data.amount,
      currency: data.currency,
      expiresAt: data.expires_at,
      paymentUrl,
    },
    { headers: { ...corsHeaders, 'Cache-Control': 'no-store' } },
  );
});
