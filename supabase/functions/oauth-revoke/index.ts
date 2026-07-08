import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse request body
    let body: Record<string, string>;
    const contentType = req.headers.get('content-type') || '';
    
    if (contentType.includes('application/json')) {
      body = await req.json();
    } else {
      const formData = await req.formData();
      body = Object.fromEntries(formData.entries()) as Record<string, string>;
    }

    const { token, token_type_hint, client_id, client_secret } = body;

    if (!token) {
      return new Response(JSON.stringify({ 
        error: 'invalid_request',
        error_description: 'Token is required'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Token revocation request:', { token_type_hint, client_id });

    // Validate client if provided
    if (client_id) {
      const { data: client, error: clientError } = await supabase
        .from('oauth_clients')
        .select('client_secret')
        .eq('client_id', client_id)
        .maybeSingle();

      if (clientError || !client) {
        return new Response(JSON.stringify({ 
          error: 'invalid_client',
          error_description: 'Invalid client'
        }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (client_secret && client.client_secret !== client_secret) {
        return new Response(JSON.stringify({ 
          error: 'invalid_client',
          error_description: 'Invalid client credentials'
        }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // Try to revoke as access token first (or based on hint)
    if (!token_type_hint || token_type_hint === 'access_token') {
      const { data: accessToken, error: accessError } = await supabase
        .from('oauth_access_tokens')
        .update({ revoked: true })
        .eq('token', token)
        .select('id')
        .maybeSingle();

      if (accessToken) {
        // Also revoke associated refresh tokens
        await supabase
          .from('oauth_refresh_tokens')
          .update({ revoked: true })
          .eq('access_token_id', accessToken.id);

        console.log('Access token revoked successfully');
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // Try to revoke as refresh token
    if (!token_type_hint || token_type_hint === 'refresh_token') {
      const { data: refreshToken, error: refreshError } = await supabase
        .from('oauth_refresh_tokens')
        .update({ revoked: true })
        .eq('token', token)
        .select('access_token_id')
        .maybeSingle();

      if (refreshToken) {
        // Also revoke associated access token
        if (refreshToken.access_token_id) {
          await supabase
            .from('oauth_access_tokens')
            .update({ revoked: true })
            .eq('id', refreshToken.access_token_id);
        }

        console.log('Refresh token revoked successfully');
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // Per RFC 7009, return success even if token wasn't found
    console.log('Token not found, returning success per RFC 7009');
    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('Token revocation error:', error);
    return new Response(JSON.stringify({ 
      error: 'server_error',
      error_description: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});