import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key',
}

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

Deno.serve(async (req) => {
  const startTime = Date.now()
  
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  // Extract API key from header or query param
  const apiKey = req.headers.get('x-api-key') || new URL(req.url).searchParams.get('api_key')
  const endpoint = new URL(req.url).pathname
  const method = req.method
  const ipAddress = req.headers.get('x-forwarded-for') || req.headers.get('cf-connecting-ip') || 'unknown'
  const userAgent = req.headers.get('user-agent') || 'unknown'

  // Helper function to log the request
  async function logRequest(
    apiKeyId: string | null,
    userId: string | null,
    statusCode: number,
    errorMessage: string | null = null,
    requestBody: Record<string, unknown> | null = null
  ) {
    const responseTime = Date.now() - startTime
    
    if (apiKeyId && userId) {
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

        // Increment daily request count
        await supabase.rpc('increment_api_requests', { key_id: apiKeyId })
      } catch (logError) {
        console.error('Failed to log API request:', logError)
      }
    }
  }

  // Validate API key presence
  if (!apiKey) {
    console.log('API request rejected: No API key provided')
    return new Response(
      JSON.stringify({ error: 'API key is required', code: 'MISSING_API_KEY' }),
      { 
        status: 401, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }

  // Look up the API key
  const { data: keyData, error: keyError } = await supabase
    .from('api_keys')
    .select('id, user_id, api_key, secret_key, is_active, requests_today, requests_limit, domains, key_type')
    .or(`api_key.eq.${apiKey},secret_key.eq.${apiKey}`)
    .maybeSingle()

  if (keyError) {
    console.error('Database error looking up API key:', keyError)
    return new Response(
      JSON.stringify({ error: 'Internal server error', code: 'DB_ERROR' }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }

  if (!keyData) {
    console.log('API request rejected: Invalid API key')
    return new Response(
      JSON.stringify({ error: 'Invalid API key', code: 'INVALID_API_KEY' }),
      { 
        status: 401, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }

  const typedKeyData = keyData as ApiKeyData

  // Check if key is active
  if (!typedKeyData.is_active) {
    await logRequest(typedKeyData.id, typedKeyData.user_id, 403, 'API key is disabled')
    console.log('API request rejected: API key is disabled')
    return new Response(
      JSON.stringify({ error: 'API key is disabled', code: 'KEY_DISABLED' }),
      { 
        status: 403, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }

  // Check rate limit
  if (typedKeyData.requests_limit && typedKeyData.requests_today >= typedKeyData.requests_limit) {
    await logRequest(typedKeyData.id, typedKeyData.user_id, 429, 'Rate limit exceeded')
    console.log('API request rejected: Rate limit exceeded')
    return new Response(
      JSON.stringify({ 
        error: 'Rate limit exceeded', 
        code: 'RATE_LIMIT_EXCEEDED',
        limit: typedKeyData.requests_limit,
        used: typedKeyData.requests_today
      }),
      { 
        status: 429, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }

  // Check domain restrictions (if any)
  const origin = req.headers.get('origin')
  if (typedKeyData.domains && typedKeyData.domains.length > 0 && origin) {
    const originHost = new URL(origin).hostname
    const isAllowed = typedKeyData.domains.some(domain => 
      originHost === domain || originHost.endsWith(`.${domain}`)
    )
    
    if (!isAllowed) {
      await logRequest(typedKeyData.id, typedKeyData.user_id, 403, 'Domain not allowed')
      console.log('API request rejected: Domain not allowed -', originHost)
      return new Response(
        JSON.stringify({ error: 'Domain not allowed', code: 'DOMAIN_RESTRICTED' }),
        { 
          status: 403, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }
  }

  // Parse request body if present
  let requestBody = null
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    try {
      const text = await req.text()
      if (text) {
        requestBody = JSON.parse(text)
      }
    } catch {
      // Body isn't JSON, that's fine
    }
  }

  // Log successful validation
  await logRequest(typedKeyData.id, typedKeyData.user_id, 200, null, requestBody)

  // Check if approaching rate limit and send notification
  if (typedKeyData.requests_limit) {
    const usagePercent = ((typedKeyData.requests_today + 1) / typedKeyData.requests_limit) * 100
    
    // Send notification at 80% and 95% thresholds
    const thresholds = [80, 95]
    for (const threshold of thresholds) {
      if (usagePercent >= threshold) {
        // Get user email for notification
        const { data: profile } = await supabase
          .from('profiles')
          .select('email')
          .eq('user_id', typedKeyData.user_id)
          .maybeSingle()

        if (profile?.email) {
          // Fire and forget - don't await, let it run in background
          fetch(`${supabaseUrl}/functions/v1/rate-limit-notification`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${supabaseServiceKey}`,
            },
            body: JSON.stringify({
              apiKeyId: typedKeyData.id,
              apiKeyName: typedKeyData.api_key.substring(0, 8) + '...',
              userId: typedKeyData.user_id,
              userEmail: profile.email,
              currentUsage: typedKeyData.requests_today + 1,
              limit: typedKeyData.requests_limit,
              thresholdPercent: threshold,
            }),
          }).catch(err => console.error('Failed to trigger rate limit notification:', err))
        }
        break // Only send one notification per request
      }
    }
  }

  // Return success with key info
  console.log('API request validated successfully for key:', typedKeyData.id)
  return new Response(
    JSON.stringify({
      success: true,
      message: 'API key validated successfully',
      key_type: typedKeyData.key_type,
      user_id: typedKeyData.user_id,
      requests_remaining: typedKeyData.requests_limit ? typedKeyData.requests_limit - typedKeyData.requests_today - 1 : null
    }),
    { 
      status: 200, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    }
  )
})
