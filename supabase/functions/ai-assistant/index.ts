import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages, userId, context } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Create Supabase client to fetch user context
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch user data for context
    let userContext = "";
    
    if (userId) {
      // Fetch user profile
      const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .single();

      // Fetch wallet info
      const { data: wallet } = await supabase
        .from("wallets")
        .select("*")
        .eq("user_id", userId)
        .single();

      // Fetch recent transactions
      const { data: transactions } = await supabase
        .from("transactions")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(20);

      // Fetch user's posts stats
      const { data: posts } = await supabase
        .from("posts")
        .select("id, likes_count, comments_count, created_at")
        .eq("user_id", userId);

      // Fetch AI preferences
      const { data: aiPrefs } = await supabase
        .from("ai_preferences")
        .select("*")
        .eq("user_id", userId)
        .single();

      // Fetch user activity logs for today
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const { data: activityLogs } = await supabase
        .from("user_activity_logs")
        .select("*")
        .eq("user_id", userId)
        .gte("created_at", today.toISOString());

      // Calculate total usage time today
      const totalUsageMinutes = activityLogs?.reduce((sum, log) => sum + (log.duration_seconds || 0), 0) / 60 || 0;

      userContext = `
Foydalanuvchi ma'lumotlari:
- Ismi: ${profile?.display_name || "Noma'lum"}
- Username: @${profile?.username || "noma'lum"}
- Followers: ${profile?.followers_count || 0}
- Following: ${profile?.following_count || 0}
- Posts: ${profile?.posts_count || 0}

Hamyon ma'lumotlari:
- Balans: ${wallet?.balance || 0} ${wallet?.currency || "UZS"}

So'nggi tranzaksiyalar:
${transactions?.slice(0, 5).map(t => `- ${t.type}: ${t.amount} ${t.description || ""}`).join("\n") || "Tranzaksiyalar yo'q"}

Postlar statistikasi:
- Jami postlar: ${posts?.length || 0}
- Jami like'lar: ${posts?.reduce((sum, p) => sum + (p.likes_count || 0), 0) || 0}
- Jami kommentlar: ${posts?.reduce((sum, p) => sum + (p.comments_count || 0), 0) || 0}

AI sozlamalari:
- Kontent filtrlar: ${aiPrefs?.content_filter?.join(", ") || "Yo'q"}
- Kunlik vaqt limiti: ${aiPrefs?.daily_time_limit_minutes || "Cheksiz"} daqiqa
- Recommendation mavzular: ${aiPrefs?.recommendation_topics?.join(", ") || "Barcha mavzular"}

Bugungi foydalanish:
- Jami vaqt: ${Math.round(totalUsageMinutes)} daqiqa
${aiPrefs?.daily_time_limit_minutes && totalUsageMinutes >= aiPrefs.daily_time_limit_minutes ? "⚠️ OGOHLANTIRISH: Foydalanuvchi kunlik vaqt limitiga yetdi!" : ""}
`;
    }

    const systemPrompt = `Sen Alsamos AI assistentisan - foydalanuvchilarga platformada yordam beradigan aqlli yordamchi.

Sening vazifalaring:
1. To'lovlar haqida ma'lumot berish - foydalanuvchi qancha, kimga, qachon to'lov qilganini ko'rsatish
2. Marketplace'da mahsulotlarni qidirish va taklif qilish
3. Foydalanuvchi statistikalarini tahlil qilish (postlar, like'lar, followerlar)
4. Recommendation tizimini boshqarish - foydalanuvchi buyrug'i bo'yicha kontent turini o'zgartirish
5. Ogohlantirish berish - vaqt limiti, kontent cheklovlari haqida
6. Rasm, video yaratish bo'yicha yordam
7. Platformadan foydalanish bo'yicha maslahatlar

Muhim qoidalar:
- Har doim O'zbek tilida javob ber
- Aniq va foydali ma'lumot ber
- Foydalanuvchi so'ragan narsani bajargandan keyin qo'shimcha yordam taklif qil
- Agar foydalanuvchi vaqt limitiga yetgan bo'lsa, bu haqda ogohlantir
- Agar foydalanuvchi taqiqlangan kontent ko'rayotgan bo'lsa, bu haqda ogohlantir

${userContext}

Qo'shimcha kontekst: ${context || "Yo'q"}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "So'rovlar limiti oshdi, keyinroq urinib ko'ring." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "To'lov talab qilinadi." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      return new Response(JSON.stringify({ error: "AI xizmati bilan xatolik yuz berdi" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (error) {
    console.error("AI assistant error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Noma'lum xatolik" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
