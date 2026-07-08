import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SSOUser {
  id: string;
  email: string;
  name?: string;
  avatar_url?: string;
  email_verified: boolean;
}

interface RequestBody {
  sso_token: string;
  user: SSOUser;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { sso_token, user } = await req.json() as RequestBody;

    if (!sso_token || !user) {
      return new Response(
        JSON.stringify({ error: "Missing sso_token or user data" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Processing SSO session for user:", user.email);

    // Initialize Supabase admin client
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    // Verify the SSO token with accounts.alsamos.com
    const accountsUrl = Deno.env.get("ACCOUNTS_ALSAMOS_URL") || "https://accounts.alsamos.com";
    
    console.log("Verifying token with:", `${accountsUrl}/functions/v1/oauth-verify`);
    
    const verifyResponse = await fetch(`${accountsUrl}/functions/v1/oauth-verify`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${sso_token}`,
      },
    });

    if (!verifyResponse.ok) {
      const errorText = await verifyResponse.text();
      console.error("Token verification failed:", errorText);
      return new Response(
        JSON.stringify({ error: "Invalid SSO token", details: errorText }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const verifiedData = await verifyResponse.json();
    console.log("Verified user data:", verifiedData);
    
    const verifiedUser = verifiedData.user as SSOUser;

    // Check if user already exists
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
    let authUser = existingUsers?.users.find(u => u.email === verifiedUser.email);

    if (!authUser) {
      // Create new user with a random password (they'll use SSO to login)
      console.log("Creating new user for:", verifiedUser.email);
      
      const randomPassword = crypto.randomUUID() + crypto.randomUUID();
      
      const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email: verifiedUser.email,
        password: randomPassword,
        email_confirm: true, // Auto-confirm since they're verified via SSO
        user_metadata: {
          full_name: verifiedUser.name,
          avatar_url: verifiedUser.avatar_url,
          sso_id: verifiedUser.id,
          provider: "alsamos_sso",
        },
      });

      if (createError) {
        console.error("Error creating user:", createError);
        return new Response(
          JSON.stringify({ error: "Failed to create user", details: createError.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      authUser = newUser.user;
    } else {
      // Update existing user metadata
      console.log("Updating existing user:", verifiedUser.email);
      
      await supabaseAdmin.auth.admin.updateUserById(authUser.id, {
        user_metadata: {
          full_name: verifiedUser.name,
          avatar_url: verifiedUser.avatar_url,
          sso_id: verifiedUser.id,
          provider: "alsamos_sso",
        },
      });
    }

    // Generate a magic link token for seamless sign-in
    console.log("Generating magic link for user:", authUser?.id);
    
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email: verifiedUser.email,
      options: {
        redirectTo: Deno.env.get("MAIL_REDIRECT_URL") || "https://mail.alsamos.com",
      },
    });

    if (linkError) {
      console.error("Error generating magic link:", linkError);
      return new Response(
        JSON.stringify({ error: "Failed to generate session", details: linkError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Extract the token from the magic link
    const magicLinkUrl = new URL(linkData.properties.hashed_token ? 
      `${Deno.env.get("SUPABASE_URL")}/auth/v1/verify?token=${linkData.properties.hashed_token}&type=magiclink` :
      linkData.properties.action_link || ""
    );
    
    console.log("Generated magic link successfully");

    return new Response(
      JSON.stringify({
        success: true,
        user: {
          id: authUser?.id,
          email: authUser?.email,
          user_metadata: authUser?.user_metadata,
        },
        magic_link: linkData.properties.action_link,
        // Also return tokens if available for direct session creation
        access_token: linkData.properties.hashed_token,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("SSO session error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});