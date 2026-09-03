import { createClient } from 'npm:@supabase/supabase-js@2';

function env(name: string) {
  return Deno.env.get(name)?.trim() || '';
}

function rpcError(id: unknown, code: number, message: string, data?: string) {
  return {
    jsonrpc: '2.0',
    id: id ?? null,
    error: {
      code,
      message: {
        ru: message,
        uz: message,
        en: message,
      },
      ...(data ? { data } : {}),
    },
  };
}

function result(id: unknown, value: unknown) {
  return { jsonrpc: '2.0', id: id ?? null, result: value };
}

function decodeBasic(header: string) {
  if (!header.startsWith('Basic ')) return null;
  try {
    const decoded = atob(header.slice(6).trim());
    const index = decoded.indexOf(':');
    if (index < 0) return null;
    return { login: decoded.slice(0, index), password: decoded.slice(index + 1) };
  } catch {
    return null;
  }
}

async function sameSecret(a: string, b: string) {
  const encoder = new TextEncoder();
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(a)),
    crypto.subtle.digest('SHA-256', encoder.encode(b)),
  ]);
  const aa = new Uint8Array(ha);
  const bb = new Uint8Array(hb);
  if (aa.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < aa.length; i++) diff |= aa[i] ^ bb[i];
  return diff === 0;
}

function errorFromDatabase(id: unknown, error: any, accountField = 'intent_id') {
  const text = String(error?.message || error || '');
  if (text.includes('invalid_amount')) return rpcError(id, -31001, 'Noto‘g‘ri summa');
  if (text.includes('intent_not_found')) return rpcError(id, -31050, 'Hisob topilmadi', accountField);
  if (text.includes('intent_expired')) return rpcError(id, -31050, 'To‘lov muddati tugagan', accountField);
  if (text.includes('intent_not_payable')) return rpcError(id, -31008, 'Operatsiyani bajarib bo‘lmaydi');
  if (text.includes('transaction_not_found')) return rpcError(id, -31003, 'Tranzaksiya topilmadi');
  if (text.includes('service_already_delivered')) return rpcError(id, -31007, 'Xizmat ko‘rsatilgan, avtomatik bekor qilib bo‘lmaydi');
  if (text.includes('operation_not_allowed') || text.includes('provider_transaction_conflict')) {
    return rpcError(id, -31008, 'Operatsiyani bajarib bo‘lmaydi');
  }
  return rpcError(id, -32400, 'Ichki tizim xatosi');
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return Response.json(rpcError(null, -32300, 'Faqat POST so‘rovi qabul qilinadi'), { status: 200 });
  }

  const credentials = decodeBasic(req.headers.get('Authorization') || '');
  const expectedLogin = env('PAYME_LOGIN');
  const liveKey = env('PAYME_KEY');
  const testKey = env('PAYME_TEST_KEY');

  if (!credentials || !expectedLogin || !liveKey) {
    return Response.json(rpcError(null, -32504, 'Ruxsat yetarli emas'), { status: 200 });
  }

  const loginOk = await sameSecret(credentials.login, expectedLogin);
  const passwordOk =
    (await sameSecret(credentials.password, liveKey)) ||
    Boolean(testKey && (await sameSecret(credentials.password, testKey)));

  if (!loginOk || !passwordOk) {
    return Response.json(rpcError(null, -32504, 'Ruxsat yetarli emas'), { status: 200 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return Response.json(rpcError(null, -32700, 'JSON xatosi'), { status: 200 });
  }

  const id = body?.id ?? null;
  const method = body?.method;
  const params = body?.params || {};

  if (!method || typeof method !== 'string') {
    return Response.json(rpcError(id, -32600, 'RPC so‘rovi noto‘g‘ri'), { status: 200 });
  }

  const supabase = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    if (method === 'CheckPerformTransaction') {
      const intentId = params?.account?.intent_id;
      if (!intentId) return Response.json(rpcError(id, -31050, 'Hisob topilmadi', 'intent_id'));
      const { data, error } = await supabase.rpc('payme_wallet_check_intent', {
        _intent_id: intentId,
        _amount_tiyin: Number(params.amount),
      });
      if (error) return Response.json(errorFromDatabase(id, error));
      return Response.json(result(id, { allow: Boolean(data?.allow) }));
    }

    if (method === 'CreateTransaction') {
      const intentId = params?.account?.intent_id;
      if (!intentId) return Response.json(rpcError(id, -31050, 'Hisob topilmadi', 'intent_id'));
      const { data, error } = await supabase.rpc('payme_wallet_create_transaction', {
        _intent_id: intentId,
        _payme_id: String(params.id || ''),
        _payme_time: Number(params.time),
        _amount_tiyin: Number(params.amount),
      });
      if (error) return Response.json(errorFromDatabase(id, error));
      return Response.json(result(id, data));
    }

    if (method === 'PerformTransaction') {
      const { data, error } = await supabase.rpc('payme_wallet_perform_transaction', {
        _payme_id: String(params.id || ''),
      });
      if (error) return Response.json(errorFromDatabase(id, error));
      return Response.json(result(id, data));
    }

    if (method === 'CancelTransaction') {
      const { data, error } = await supabase.rpc('payme_wallet_cancel_transaction', {
        _payme_id: String(params.id || ''),
        _reason: Number(params.reason || 10),
      });
      if (error) return Response.json(errorFromDatabase(id, error));
      return Response.json(result(id, data));
    }

    if (method === 'CheckTransaction') {
      const { data, error } = await supabase.rpc('payme_wallet_check_transaction', {
        _payme_id: String(params.id || ''),
      });
      if (error) return Response.json(errorFromDatabase(id, error));
      return Response.json(result(id, data));
    }

    if (method === 'GetStatement') {
      const from = Number(params.from || 0);
      const to = Number(params.to || 0);
      const { data, error } = await supabase
        .from('wallet_payment_intents')
        .select('id, amount, provider_transaction_id, provider_time, provider_create_time, provider_perform_time, provider_cancel_time, provider_state, provider_reason')
        .eq('provider', 'payme')
        .not('provider_transaction_id', 'is', null)
        .gte('provider_time', from)
        .lte('provider_time', to)
        .order('provider_time', { ascending: true });

      if (error) return Response.json(errorFromDatabase(id, error));

      return Response.json(
        result(id, {
          transactions: (data || []).map((row: any) => ({
            id: row.provider_transaction_id,
            time: Number(row.provider_time || 0),
            amount: Math.round(Number(row.amount) * 100),
            account: { intent_id: row.id },
            create_time: Number(row.provider_create_time || 0),
            perform_time: Number(row.provider_perform_time || 0),
            cancel_time: Number(row.provider_cancel_time || 0),
            transaction: row.id,
            state: Number(row.provider_state || 0),
            reason: row.provider_reason,
            receivers: null,
          })),
        }),
      );
    }

    return Response.json(rpcError(id, -32601, 'Metod topilmadi', method), { status: 200 });
  } catch {
    return Response.json(rpcError(id, -32400, 'Ichki tizim xatosi'), { status: 200 });
  }
});
