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

    // Check if this is a public client lookup (for consent page)
    if (req.method === 'POST') {
      const body = await req.json();
      
      // Handle public client lookup action
      if (body.action === 'get' && body.client_id) {
        console.log('Public client lookup for:', body.client_id);
        
        const { data: client, error } = await supabase
          .from('oauth_clients')
          .select('client_id, name, description, logo_url, redirect_uris, allowed_scopes, is_verified, is_active')
          .eq('client_id', body.client_id)
          .maybeSingle();

        if (error) {
          console.error('Error fetching client:', error);
          return new Response(JSON.stringify({ 
            error: 'server_error',
            error_description: 'Failed to fetch client'
          }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        if (!client) {
          return new Response(JSON.stringify({ 
            error: 'not_found',
            error_description: 'Client not found'
          }), {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        return new Response(JSON.stringify(client), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // For other operations, require authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ 
        error: 'unauthorized',
        error_description: 'Missing or invalid Authorization header'
      }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.substring(7);
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(JSON.stringify({ 
        error: 'unauthorized',
        error_description: 'Invalid user token'
      }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const url = new URL(req.url);
    const clientIdParam = url.searchParams.get('client_id');

    if (req.method === 'GET') {
      // List all clients for the user or get specific client info
      if (clientIdParam) {
        // Get specific client (public info only for non-owners)
        const { data: client, error } = await supabase
          .from('oauth_clients')
          .select('client_id, name, description, logo_url, is_verified, allowed_scopes, owner_id')
          .eq('client_id', clientIdParam)
          .eq('is_active', true)
          .maybeSingle();

        if (error || !client) {
          return new Response(JSON.stringify({ 
            error: 'not_found',
            error_description: 'Client not found'
          }), {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // If owner, include secret
        if (client.owner_id === user.id) {
          const { data: fullClient } = await supabase
            .from('oauth_clients')
            .select('*')
            .eq('client_id', clientIdParam)
            .single();
          
          return new Response(JSON.stringify(fullClient), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Return public info only
        const { owner_id, ...publicInfo } = client;
        return new Response(JSON.stringify(publicInfo), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // List user's clients
      const { data: clients, error } = await supabase
        .from('oauth_clients')
        .select('*')
        .eq('owner_id', user.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching clients:', error);
        return new Response(JSON.stringify({ 
          error: 'server_error',
          error_description: 'Failed to fetch clients'
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ clients }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });

    } else if (req.method === 'POST') {
      // Register new OAuth client
      const body = await req.json();
      const { name, description, redirect_uris, logo_url, allowed_scopes } = body;

      if (!name || !redirect_uris || redirect_uris.length === 0) {
        return new Response(JSON.stringify({ 
          error: 'invalid_request',
          error_description: 'Name and at least one redirect_uri are required'
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Validate redirect URIs
      for (const uri of redirect_uris) {
        try {
          new URL(uri);
        } catch {
          return new Response(JSON.stringify({ 
            error: 'invalid_request',
            error_description: `Invalid redirect_uri: ${uri}`
          }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }

      console.log('Creating new OAuth client:', { name, owner_id: user.id });

      const { data: newClient, error: createError } = await supabase
        .from('oauth_clients')
        .insert({
          name,
          description,
          redirect_uris,
          logo_url,
          allowed_scopes: allowed_scopes || ['openid', 'profile', 'email'],
          owner_id: user.id,
        })
        .select()
        .single();

      if (createError) {
        console.error('Error creating client:', createError);
        return new Response(JSON.stringify({ 
          error: 'server_error',
          error_description: 'Failed to create client'
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      console.log('OAuth client created successfully:', newClient.client_id);

      return new Response(JSON.stringify(newClient), {
        status: 201,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });

    } else if (req.method === 'PUT' || req.method === 'PATCH') {
      // Update OAuth client
      if (!clientIdParam) {
        return new Response(JSON.stringify({ 
          error: 'invalid_request',
          error_description: 'client_id parameter is required'
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Verify ownership
      const { data: existingClient } = await supabase
        .from('oauth_clients')
        .select('owner_id')
        .eq('client_id', clientIdParam)
        .single();

      if (!existingClient || existingClient.owner_id !== user.id) {
        return new Response(JSON.stringify({ 
          error: 'forbidden',
          error_description: 'You do not have permission to update this client'
        }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const body = await req.json();
      const { name, description, redirect_uris, logo_url, allowed_scopes, is_active } = body;

      const updates: Record<string, any> = {};
      if (name !== undefined) updates.name = name;
      if (description !== undefined) updates.description = description;
      if (redirect_uris !== undefined) updates.redirect_uris = redirect_uris;
      if (logo_url !== undefined) updates.logo_url = logo_url;
      if (allowed_scopes !== undefined) updates.allowed_scopes = allowed_scopes;
      if (is_active !== undefined) updates.is_active = is_active;

      const { data: updatedClient, error: updateError } = await supabase
        .from('oauth_clients')
        .update(updates)
        .eq('client_id', clientIdParam)
        .select()
        .single();

      if (updateError) {
        console.error('Error updating client:', updateError);
        return new Response(JSON.stringify({ 
          error: 'server_error',
          error_description: 'Failed to update client'
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      console.log('OAuth client updated:', clientIdParam);

      return new Response(JSON.stringify(updatedClient), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });

    } else if (req.method === 'DELETE') {
      // Delete OAuth client
      if (!clientIdParam) {
        return new Response(JSON.stringify({ 
          error: 'invalid_request',
          error_description: 'client_id parameter is required'
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Verify ownership
      const { data: existingClient } = await supabase
        .from('oauth_clients')
        .select('owner_id')
        .eq('client_id', clientIdParam)
        .single();

      if (!existingClient || existingClient.owner_id !== user.id) {
        return new Response(JSON.stringify({ 
          error: 'forbidden',
          error_description: 'You do not have permission to delete this client'
        }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { error: deleteError } = await supabase
        .from('oauth_clients')
        .delete()
        .eq('client_id', clientIdParam);

      if (deleteError) {
        console.error('Error deleting client:', deleteError);
        return new Response(JSON.stringify({ 
          error: 'server_error',
          error_description: 'Failed to delete client'
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      console.log('OAuth client deleted:', clientIdParam);

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ 
      error: 'method_not_allowed',
      error_description: 'Method not allowed'
    }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('OAuth clients error:', error);
    return new Response(JSON.stringify({ 
      error: 'server_error',
      error_description: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});