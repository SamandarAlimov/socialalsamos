// Alsamos API Gateway — tashqi mijozlar uchun API kalit tekshiruvi.
//
// MUHIM: bu endpoint JWT bilan emas, API kalit bilan ishlaydi. Shuning uchun
// config.toml da verify_jwt = false ATAYLAB qoldirilgan — uni yoqish barcha
// tashqi integratsiyalarni sindirar edi. Himoya funksiya ichida.
//
// TUZATILGAN MUAMMOLAR:
//  1. Filtr injection: ilgari kalit `.or(`api_key.eq.${apiKey},...`)` ichiga
//     to'g'ridan-to'g'ri qo'yilardi. Vergul/qavs kabi belgilar bilan filtrni
//     buzish mumkin edi. Endi kalit formati validatsiya qilinadi va ikki alohida
//     .eq() so'rovi ishlatiladi.
//  2. profiles.email / profiles.user_id ustunlari mavjud emas edi — shu sababli
//     limit bildirishnomasi hech qachon yuborilmagan. Endi email
//     rate-limit-notification funksiyasi ichida bazadan olinadi.
//  3. Bildirishnoma chaqiruvi CRON_SECRET (bo'lmasa service key) bilan yuboriladi.
//  4. Xatolar bir xil shaklda, ichki tafsilotlarsiz qaytariladi.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders as sharedCors, preflight } from '../_shared/guard.ts'

interface ApiKeyData {
  id: string
  user_id: string
  api_key: string
  secret_key: string
  is_active: boolean
  requests_today: number
  requests_limit: number
  domains: string[]
  key_type: string
}

// Kalitlar faqat harf/raqam/._- belgilaridan iborat bo'lishi kerak.
const KEY_PATTERN = /^[A-Za-z0-9._-]{16,128}$/

function gatewayCors(req: Request): Record<string, string> {
  return {
    ...sharedCors(req, 'GET, POST, PUT, PATCH, DELETE, OPTIONS'),
    'Access-Control-Allow-Headers':
      'authorization, x-client-info, apikey, content-type, x-api-key',
  }
}

function fail(req: Request, status: number, error: string, code: string, extra: Record<string, unknown> = {}) {
  return new Response(JSON.stringify({ error, code, ...extra }), {
    status,
    headers: { ...gatewayCors(req), 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })
}

Deno.serve(async (req) => {
  const startTime = Date.now()

  const pre = preflight(req, 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
  if (pre) return pre

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const url = new URL(req.url)
  const apiKey = req.headers.get('x-api-key') || url.searchParams.get('api_key')
  const endpoint = url.pathname
  const method = req.method
  const ipAddress =
    (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() ||
    req.headers.get('cf-connecting-ip') ||
    'unknown'
  const userAgent = (req.headers.get('user-agent') || 'unknown').slice(0, 500)

  async function logRequest(
    apiKeyId: string | null,
    userId: string | null,
    statusCode: number,
    errorMessage: string | null = null,
    requestBody: Record<string, unknown> | null = null,
  ) {
    const responseTime = Date.now() - startTime
    if (!apiKeyId || !userId) return
    try {
      await supabase.from('api_usage_logs').insert({
        api_key_id: apiKeyId,
        user_id: userId,
        endpoint,
        method,
        status_code: statusCode,
        response_time_ms: responseTime,
        ip_address: ipAddress,
        user_agent: userAgent,
        request_body: requestBody,
        error_message: errorMessage,
      })
      await supabase.rpc('increment_api_requests', { key_id: apiKeyId })
    } catch (logError) {
      console.error('Failed to log API request:', logError)
    }
  }

  if (!apiKey) {
    return fail(req, 401, 'API key is required', 'MISSING_API_KEY')
  }

  // Format tekshiruvi: injection va keraksiz DB so'rovlarining oldini oladi.
  if (!KEY_PATTERN.test(apiKey)) {
    return fail(req, 401, 'Invalid API key', 'INVALID_API_KEY')
  }

  const columns =
    'id, user_id, api_key, secret_key, is_active, requests_today, requests_limit, domains, key_type'

  // Ikki alohida qat'iy .eq() so'rovi — .or() satrini qurishdan voz kechildi.
  let keyData: ApiKeyData | null = null
  try {
    const byPublic = await supabase.from('api_keys').select(columns).eq('api_key', apiKey).maybeSingle()
    if (byPublic.error) throw byPublic.error
    keyData = (byPublic.data as ApiKeyData | null) ?? null

    if (!keyData) {
      const bySecret = await supabase.from('api_keys').select(columns).eq('secret_key', apiKey).maybeSingle()
      if (bySecret.error) throw bySecret.error
      keyData = (bySecret.data as ApiKeyData | null) ?? null
    }
  } catch (keyError) {
    console.error('Database error looking up API key:', keyError)
    return fail(req, 500, 'Internal server error', 'DB_ERROR')
  }

  if (!keyData) {
    return fail(req, 401, 'Invalid API key', 'INVALID_API_KEY')
  }

  if (!keyData.is_active) {
    await logRequest(keyData.id, keyData.user_id, 403, 'API key is disabled')
    return fail(req, 403, 'API key is disabled', 'KEY_DISABLED')
  }

  if (keyData.requests_limit && keyData.requests_today >= keyData.requests_limit) {
    await logRequest(keyData.id, keyData.user_id, 429, 'Rate limit exceeded')
    return fail(req, 429, 'Rate limit exceeded', 'RATE_LIMIT_EXCEEDED', {
      limit: keyData.requests_limit,
      used: keyData.requests_today,
    })
  }

  // Domen cheklovi
  const origin = req.headers.get('origin')
  if (keyData.domains && keyData.domains.length > 0 && origin) {
    let originHost = ''
    try {
      originHost = new URL(origin).hostname.toLowerCase()
    } catch {
      originHost = ''
    }
    const isAllowed =
      originHost.length > 0 &&
      keyData.domains.some((domain) => {
        const clean = String(domain).toLowerCase().trim()
        return clean.length > 0 && (originHost === clean || originHost.endsWith(`.${clean}`))
      })

    if (!isAllowed) {
      await logRequest(keyData.id, keyData.user_id, 403, 'Domain not allowed')
      return fail(req, 403, 'Domain not allowed', 'DOMAIN_RESTRICTED')
    }
  }

  // So'rov tanasi (faqat JSON bo'lsa va juda katta bo'lmasa jurnalga yoziladi)
  let requestBody: Record<string, unknown> | null = null
  if (method !== 'GET' && method !== 'HEAD') {
    try {
      const text = await req.text()
      if (text && text.length <= 100_000) {
        const parsed = JSON.parse(text)
        requestBody = typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? parsed : null
      }
    } catch {
      // JSON emas — muammo yo'q
    }
  }

  await logRequest(keyData.id, keyData.user_id, 200, null, requestBody)

  // Limitga yaqinlashganda bildirishnoma (80% va 95%).
  if (keyData.requests_limit) {
    const usagePercent = ((keyData.requests_today + 1) / keyData.requests_limit) * 100
    const threshold = usagePercent >= 95 ? 95 : usagePercent >= 80 ? 80 : null

    if (threshold != null) {
      const cronSecret = Deno.env.get('CRON_SECRET') || supabaseServiceKey
      // Fire-and-forget: email manzili funksiya ichida bazadan olinadi.
      fetch(`${supabaseUrl}/functions/v1/rate-limit-notification`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${supabaseServiceKey}`,
          'x-cron-secret': cronSecret,
        },
        body: JSON.stringify({
          apiKeyId: keyData.id,
          thresholdPercent: threshold,
        }),
      }).catch((err) => console.error('Failed to trigger rate limit notification:', err))
    }
  }

  return new Response(
    JSON.stringify({
      success: true,
      message: 'API key validated successfully',
      key_type: keyData.key_type,
      user_id: keyData.user_id,
      requests_remaining: keyData.requests_limit
        ? Math.max(keyData.requests_limit - keyData.requests_today - 1, 0)
        : null,
    }),
    {
      status: 200,
      headers: { ...gatewayCors(req), 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    },
  )
})
