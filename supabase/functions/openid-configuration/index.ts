import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const baseUrl = supabaseUrl.replace('/rest/v1', '');
    const issuer = "https://accounts.alsamos.com";
    
    // OpenID Connect Discovery Document
    const configuration = {
      issuer: issuer,
      authorization_endpoint: `${baseUrl}/functions/v1/oauth-authorize`,
      token_endpoint: `${baseUrl}/functions/v1/oauth-token`,
      userinfo_endpoint: `${baseUrl}/functions/v1/oauth-userinfo`,
      revocation_endpoint: `${baseUrl}/functions/v1/oauth-revoke`,
      jwks_uri: `${issuer}/.well-known/jwks.json`,
      registration_endpoint: `${baseUrl}/functions/v1/oauth-clients`,
      
      // Supported response types
      response_types_supported: [
        "code",
        "token",
        "id_token",
        "code token",
        "code id_token",
        "token id_token",
        "code token id_token"
      ],
      
      // Supported response modes
      response_modes_supported: [
        "query",
        "fragment",
        "form_post"
      ],
      
      // Supported grant types
      grant_types_supported: [
        "authorization_code",
        "refresh_token",
        "implicit"
      ],
      
      // Supported scopes
      scopes_supported: [
        "openid",
        "profile",
        "email",
        "phone",
        "address",
        "offline_access"
      ],
      
      // Subject types
      subject_types_supported: ["public"],
      
      // ID Token signing algorithms
      id_token_signing_alg_values_supported: ["RS256", "HS256"],
      
      // Token endpoint auth methods
      token_endpoint_auth_methods_supported: [
        "client_secret_basic",
        "client_secret_post"
      ],
      
      // Claims supported
      claims_supported: [
        "sub",
        "iss",
        "aud",
        "exp",
        "iat",
        "auth_time",
        "nonce",
        "at_hash",
        "c_hash",
        "name",
        "given_name",
        "family_name",
        "email",
        "email_verified",
        "phone_number",
        "phone_number_verified",
        "picture",
        "locale",
        "updated_at"
      ],
      
      // PKCE support
      code_challenge_methods_supported: ["S256", "plain"],
      
      // UI Locales
      ui_locales_supported: ["en", "es", "fr", "de", "pt", "ar"],
      
      // Service documentation
      service_documentation: "https://developers.alsamos.com/docs/oauth",
      
      // Consent page
      op_policy_uri: "https://alsamos.com/privacy",
      op_tos_uri: "https://alsamos.com/terms",
      
      // Additional capabilities
      request_parameter_supported: true,
      request_uri_parameter_supported: true,
      require_request_uri_registration: false,
      claims_parameter_supported: true,
      
      // End session endpoint
      end_session_endpoint: `${issuer}/logout`,
      
      // Frontchannel logout
      frontchannel_logout_supported: true,
      frontchannel_logout_session_supported: true,
      
      // Backchannel logout
      backchannel_logout_supported: true,
      backchannel_logout_session_supported: true
    };

    return new Response(JSON.stringify(configuration, null, 2), {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=86400'
      }
    });
  } catch (error: unknown) {
    console.error('OpenID Configuration error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
