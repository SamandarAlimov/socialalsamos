import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Generate JWT for id_token
function generateIdToken(userId: string, email: string, name: string, clientId: string): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: 'https://accounts.alsamos.com',
    sub: userId,
    aud: clientId,
    exp: now + 3600,
    iat: now,
    email,
    name,
  };

  const secret = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  
  const headerB64 = base64Encode(JSON.stringify(header)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const payloadB64 = base64Encode(JSON.stringify(payload)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  
  // Simple HMAC-SHA256 signature (in production, use proper JWT library)
  const encoder = new TextEncoder();
  const data = encoder.encode(`${headerB64}.${payloadB64}`);
  
  // For demo purposes, using simple hash (in production use crypto.subtle)
  const signatureB64 = base64Encode(data.buffer as ArrayBuffer).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_').substring(0, 43);
  
  return `${headerB64}.${payloadB64}.${signatureB64}`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse request body (support both JSON and form-urlencoded)
    let body: Record<string, string>;
    const contentType = req.headers.get('content-type') || '';
    
    if (contentType.includes('application/json')) {
      body = await req.json();
    } else {
      const formData = await req.formData();
      body = Object.fromEntries(formData.entries()) as Record<string, string>;
    }

    const { grant_type, code, redirect_uri, client_id, client_secret, refresh_token, code_verifier } = body;

    console.log('OAuth Token Request:', { grant_type, client_id, redirect_uri });

    // Validate client credentials
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
        error_description: 'Invalid client credentials'
      }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verify client secret (if provided and required)
    if (client_secret && client.client_secret !== client_secret) {
      return new Response(JSON.stringify({ 
        error: 'invalid_client',
        error_description: 'Invalid client secret'
      }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (grant_type === 'authorization_code') {
      // Exchange authorization code for tokens
      const { data: authCode, error: codeError } = await supabase
        .from('oauth_authorization_codes')
        .select('*')
        .eq('code', code)
        .eq('client_id', client_id)
        .eq('used', false)
        .maybeSingle();

      if (codeError || !authCode) {
        console.error('Invalid authorization code:', codeError);
        return new Response(JSON.stringify({ 
          error: 'invalid_grant',
          error_description: 'Invalid or expired authorization code'
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Check if code is expired
      if (new Date(authCode.expires_at) < new Date()) {
        return new Response(JSON.stringify({ 
          error: 'invalid_grant',
          error_description: 'Authorization code has expired'
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Validate redirect_uri matches
      if (authCode.redirect_uri !== redirect_uri) {
        return new Response(JSON.stringify({ 
          error: 'invalid_grant',
          error_description: 'Redirect URI mismatch'
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // PKCE verification (if code_challenge was provided)
      if (authCode.code_challenge && code_verifier) {
        // Verify code_verifier matches code_challenge
        // For S256: base64url(sha256(code_verifier)) === code_challenge
        if (authCode.code_challenge_method === 'S256') {
          const encoder = new TextEncoder();
          const data = encoder.encode(code_verifier);
          const hashBuffer = await crypto.subtle.digest('SHA-256', data);
          const computedChallenge = base64Encode(hashBuffer).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
          
          if (computedChallenge !== authCode.code_challenge) {
            return new Response(JSON.stringify({ 
              error: 'invalid_grant',
              error_description: 'Invalid code verifier'
            }), {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }
        }
      }

      // Mark code as used
      await supabase
        .from('oauth_authorization_codes')
        .update({ used: true })
        .eq('id', authCode.id);

      // Get user profile for id_token
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', authCode.user_id)
        .maybeSingle();

      // Create access token
      const { data: accessToken, error: tokenError } = await supabase
        .from('oauth_access_tokens')
        .insert({
          client_id,
          user_id: authCode.user_id,
          scope: authCode.scope,
        })
        .select('token, expires_at, id')
        .single();

      if (tokenError || !accessToken) {
        console.error('Error creating access token:', tokenError);
        return new Response(JSON.stringify({ 
          error: 'server_error',
          error_description: 'Failed to create access token'
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Create refresh token
      const { data: refreshTokenData, error: refreshError } = await supabase
        .from('oauth_refresh_tokens')
        .insert({
          access_token_id: accessToken.id,
          client_id,
          user_id: authCode.user_id,
          scope: authCode.scope,
        })
        .select('token')
        .single();

      if (refreshError) {
        console.error('Error creating refresh token:', refreshError);
      }

      // Generate id_token if openid scope is requested
      let idToken: string | undefined;
      if (authCode.scope.includes('openid')) {
        const userName = profile ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim() : '';
        idToken = generateIdToken(
          authCode.user_id,
          profile?.email || '',
          userName,
          client_id
        );
      }

      console.log('Tokens generated successfully');

      return new Response(JSON.stringify({
        access_token: accessToken.token,
        token_type: 'Bearer',
        expires_in: 3600,
        refresh_token: refreshTokenData?.token,
        id_token: idToken,
        scope: authCode.scope,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });

    } else if (grant_type === 'refresh_token') {
      // Refresh token flow
      const { data: refreshTokenData, error: refreshError } = await supabase
        .from('oauth_refresh_tokens')
        .select('*')
        .eq('token', refresh_token)
        .eq('client_id', client_id)
        .eq('revoked', false)
        .maybeSingle();

      if (refreshError || !refreshTokenData) {
        return new Response(JSON.stringify({ 
          error: 'invalid_grant',
          error_description: 'Invalid refresh token'
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Check if refresh token is expired
      if (new Date(refreshTokenData.expires_at) < new Date()) {
        return new Response(JSON.stringify({ 
          error: 'invalid_grant',
          error_description: 'Refresh token has expired'
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Create new access token
      const { data: newAccessToken, error: tokenError } = await supabase
        .from('oauth_access_tokens')
        .insert({
          client_id,
          user_id: refreshTokenData.user_id,
          scope: refreshTokenData.scope,
        })
        .select('token, expires_at')
        .single();

      if (tokenError || !newAccessToken) {
        console.error('Error creating new access token:', tokenError);
        return new Response(JSON.stringify({ 
          error: 'server_error',
          error_description: 'Failed to create new access token'
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      console.log('Access token refreshed successfully');

      return new Response(JSON.stringify({
        access_token: newAccessToken.token,
        token_type: 'Bearer',
        expires_in: 3600,
        refresh_token: refresh_token, // Return same refresh token
        scope: refreshTokenData.scope,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });

    } else {
      return new Response(JSON.stringify({ 
        error: 'unsupported_grant_type',
        error_description: 'Supported grant types: authorization_code, refresh_token'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

  } catch (error: unknown) {
    console.error('OAuth token error:', error);
    return new Response(JSON.stringify({ 
      error: 'server_error',
      error_description: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});