// Bosqich F: yuklangan stiker uchun majburiy NSFW tekshiruvi.
//
// Nima uchun Edge Function?
// Tekshiruvni klientda bajarish mumkin emas — foydalanuvchi uni chetlab
// o‘tishi oson. Shuning uchun natijani faqat service role kaliti bilan
// yozadigan server funksiyasi bor. Baza tomonida esa "tekshirilmagan stiker
// ommaviy bo‘lmaydi" cheklovi turadi, ya’ni bu funksiya ishlamay qolsa
// tizim xavfsiz holatda qoladi (stiker shaxsiy bo‘lib turadi).
//
// Kutilgan chaqiruv: POST { stickerId: string }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const AUTO_REJECT_THRESHOLD = 0.85;
const AUTO_APPROVE_THRESHOLD = 0.15;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface NsfwResult {
  score: number;
  labels: Record<string, number>;
  provider: string;
}

/**
 * Tashqi NSFW xizmatiga murojaat.
 *
 * Xizmat manzili sozlanadi (NSFW_API_URL). Manzil berilmagan bo‘lsa
 * tekshiruv "aniqlanmadi" holatida qaytadi va stiker inson moderatoriga
 * yuboriladi — avtomatik tasdiqlanmaydi.
 */
async function checkImage(imageUrl: string): Promise<NsfwResult | null> {
  const endpoint = Deno.env.get('NSFW_API_URL');
  if (!endpoint) return null;

  const apiKey = Deno.env.get('NSFW_API_KEY') ?? '';

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey ? { Authorization: 'Bearer ' + apiKey } : {}),
    },
    body: JSON.stringify({ url: imageUrl }),
  });

  if (!response.ok) return null;

  const data = await response.json().catch(() => null);
  if (!data || typeof data !== 'object') return null;

  const labels = (data.labels ?? data.predictions ?? {}) as Record<string, number>;

  // Turli xizmatlar turli nom qaytaradi; eng yuqori xavfli belgini olamiz.
  const risky = ['porn', 'sexy', 'hentai', 'nsfw', 'explicit', 'gore', 'violence'];
  const score =
    typeof data.score === 'number'
      ? data.score
      : Math.max(0, ...risky.map((key) => Number(labels[key] ?? 0)));

  return {
    score: Number.isFinite(score) ? score : 0,
    labels,
    provider: String(data.provider ?? 'nsfw-api'),
  };
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { stickerId } = await request.json();

    if (!stickerId || typeof stickerId !== 'string') {
      return new Response(JSON.stringify({ error: 'stickerId kerak' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const { data: sticker, error: loadError } = await supabase
      .from('stickers')
      .select('id, full_url, preview_url, created_by')
      .eq('id', stickerId)
      .maybeSingle();

    if (loadError || !sticker) {
      return new Response(JSON.stringify({ error: 'Stiker topilmadi' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const imageUrl = sticker.full_url ?? sticker.preview_url;
    if (!imageUrl) {
      return new Response(JSON.stringify({ error: 'Stikerda rasm yo‘q' }), {
        status: 422,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const result = await checkImage(imageUrl);

    // Xizmat javob bermadi: tekshirilgan deb belgilaymiz, lekin qarorni
    // insonga qoldiramiz.
    if (!result) {
      await supabase
        .from('stickers')
        .update({
          nsfw_checked_at: new Date().toISOString(),
          nsfw_score: null,
          nsfw_labels: { status: 'unavailable' },
          moderation_status: 'pending',
        })
        .eq('id', stickerId);

      return new Response(
        JSON.stringify({ status: 'pending', reason: 'NSFW xizmati mavjud emas' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const status =
      result.score >= AUTO_REJECT_THRESHOLD
        ? 'rejected'
        : result.score <= AUTO_APPROVE_THRESHOLD
          ? 'approved'
          : 'pending';

    await supabase
      .from('stickers')
      .update({
        nsfw_checked_at: new Date().toISOString(),
        nsfw_score: result.score,
        nsfw_labels: result.labels,
        moderation_status: status,
        moderation_reason:
          status === 'rejected' ? 'Avtomatik tekshiruv: nomaqbul kontent' : null,
      })
      .eq('id', stickerId);

    return new Response(
      JSON.stringify({ status, score: result.score, provider: result.provider }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Xatolik' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
