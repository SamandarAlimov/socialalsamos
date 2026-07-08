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

    // Extract bearer token
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ 
        error: 'invalid_token',
        error_description: 'Missing or invalid Authorization header'
      }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.substring(7);
    console.log('UserInfo request with token');

    // Validate access token
    const { data: accessToken, error: tokenError } = await supabase
      .from('oauth_access_tokens')
      .select('*')
      .eq('token', token)
      .eq('revoked', false)
      .maybeSingle();

    if (tokenError || !accessToken) {
      console.error('Invalid token:', tokenError);
      return new Response(JSON.stringify({ 
        error: 'invalid_token',
        error_description: 'Invalid or expired access token'
      }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check token expiry
    if (new Date(accessToken.expires_at) < new Date()) {
      return new Response(JSON.stringify({ 
        error: 'invalid_token',
        error_description: 'Access token has expired'
      }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get user profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', accessToken.user_id)
      .maybeSingle();

    if (profileError) {
      console.error('Error fetching profile:', profileError);
    }

    // Build userinfo response based on scopes
    const scopes = accessToken.scope.split(' ');
    const userInfo: Record<string, any> = {
      sub: accessToken.user_id,
    };

    if (scopes.includes('profile')) {
      userInfo.name = profile ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim() : undefined;
      userInfo.given_name = profile?.first_name;
      userInfo.family_name = profile?.last_name;
      userInfo.picture = profile?.avatar_url;
      userInfo.updated_at = profile?.updated_at;
    }

    if (scopes.includes('email')) {
      userInfo.email = profile?.email;
      userInfo.email_verified = true; // Assuming verified if in profiles
    }

    if (scopes.includes('phone')) {
      userInfo.phone_number = profile?.phone;
      userInfo.phone_number_verified = !!profile?.phone;
    }

    if (scopes.includes('address')) {
      userInfo.address = {
        country: profile?.country,
      };
    }

    console.log('UserInfo returned successfully');

    return new Response(JSON.stringify(userInfo), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('UserInfo error:', error);
    return new Response(JSON.stringify({ 
      error: 'server_error',
      error_description: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});