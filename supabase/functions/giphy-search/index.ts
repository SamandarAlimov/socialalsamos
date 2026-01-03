import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { query, type = "gifs", limit = 20 } = await req.json();
    const GIPHY_API_KEY = Deno.env.get("GIPHY_API_KEY");

    if (!GIPHY_API_KEY) {
      throw new Error("GIPHY_API_KEY is not configured");
    }

    let url: string;
    
    if (query && query.trim()) {
      // Search endpoint
      url = `https://api.giphy.com/v1/${type}/search?api_key=${GIPHY_API_KEY}&q=${encodeURIComponent(query)}&limit=${limit}&rating=g&lang=en`;
    } else {
      // Trending endpoint
      url = `https://api.giphy.com/v1/${type}/trending?api_key=${GIPHY_API_KEY}&limit=${limit}&rating=g`;
    }

    const response = await fetch(url);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error("GIPHY API error:", response.status, errorText);
      throw new Error(`GIPHY API error: ${response.status}`);
    }

    const data = await response.json();
    
    // Transform GIPHY response to our format
    const gifs = data.data.map((gif: any) => ({
      id: gif.id,
      url: gif.images.original.url,
      preview: gif.images.fixed_width_small.url || gif.images.preview_gif?.url || gif.images.fixed_width.url,
      width: parseInt(gif.images.original.width),
      height: parseInt(gif.images.original.height),
      title: gif.title,
    }));

    return new Response(JSON.stringify({ gifs }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { 
        status: 500, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );
  }
});
