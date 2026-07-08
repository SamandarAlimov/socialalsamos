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

    const { client_id, redirect_uri, scope, state, response_type, code_challenge, code_challenge_method, user_id } = await req.json();

    console.log('OAuth Authorize Request:', { client_id, redirect_uri, scope, state, response_type });

    // Validate required parameters
    if (!client_id || !redirect_uri || !user_id) {
      return new Response(JSON.stringify({ 
        error: 'invalid_request',
        error_description: 'Missing required parameters: client_id, redirect_uri, or user_id'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Validate client
    const { data: client, error: clientError } = await supabase
      .from('oauth_clients')
      .select('*')
      .eq('client_id', client_id)
      .eq('is_active', true)
      .maybeSingle();

    if (clientError || !client) {
      console.error('Client validation error:', clientError);
      return new Response(JSON.stringify({ 
        error: 'invalid_client',
        error_description: 'Client not found or inactive'
      }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Validate redirect URI
    if (!client.redirect_uris.includes(redirect_uri)) {
      return new Response(JSON.stringify({ 
        error: 'invalid_request',
        error_description: 'Invalid redirect_uri'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Validate scopes
    const requestedScopes = (scope || 'openid').split(' ');
    const invalidScopes = requestedScopes.filter((s: string) => !client.allowed_scopes.includes(s));
    if (invalidScopes.length > 0) {
      return new Response(JSON.stringify({ 
        error: 'invalid_scope',
        error_description: `Invalid scopes: ${invalidScopes.join(', ')}`
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Generate authorization code
    const { data: authCode, error: codeError } = await supabase
      .from('oauth_authorization_codes')
      .insert({
        client_id,
        user_id,
        redirect_uri,
        scope: scope || 'openid',
        state,
        code_challenge,
        code_challenge_method,
      })
      .select('code')
      .single();

    if (codeError || !authCode) {
      console.error('Error creating authorization code:', codeError);
      return new Response(JSON.stringify({ 
        error: 'server_error',
        error_description: 'Failed to generate authorization code'
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Authorization code generated successfully');

    return new Response(JSON.stringify({
      code: authCode.code,
      state,
      redirect_uri
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('OAuth authorize error:', error);
    return new Response(JSON.stringify({ 
      error: 'server_error',
      error_description: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});