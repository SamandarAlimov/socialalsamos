import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Loader2, MessageCircle, PackageSearch } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useConversations } from '@/hooks/useMessages';
import { fetchMarketplaceProductById } from '@/hooks/useMarketplace';
import { supabase } from '@/integrations/supabase/client';
import { db } from '@/lib/supabaseAny';
import {
  buildMarketplaceProductMessage,
  isRecentMarketplaceProductMessage,
  type MarketplaceChatIntent,
} from '@/lib/marketplaceChat';

function safeQuantity(value: string | null, max: number) {
  const parsed = Math.floor(Number(value));
  const requested = Number.isFinite(parsed) ? Math.max(1, parsed) : 1;
  return Math.min(Math.max(1, max), requested, 999);
}

export default function MarketplaceChatHandoffPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { createPrivateConversation } = useConversations(undefined, false);
  const startedRef = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user || startedRef.current) return;

    const sellerUserId = searchParams.get('user')?.trim() || '';
    const productId = searchParams.get('product')?.trim() || '';
    const requestedVariantId = searchParams.get('variant')?.trim() || undefined;
    const intent: MarketplaceChatIntent = searchParams.get('intent') === 'offer' ? 'offer' : 'contact';

    if (!sellerUserId || !productId) {
      setError('Sotuvchi yoki mahsulot ma’lumoti yetishmayapti.');
      return;
    }

    if (sellerUserId === user.id) {
      setError('O‘zingizga marketplace xabari yuborib bo‘lmaydi.');
      return;
    }

    startedRef.current = true;
    let cancelled = false;

    const handoff = async () => {
      try {
        const [conversation, product] = await Promise.all([
          createPrivateConversation(sellerUserId),
          fetchMarketplaceProductById(productId),
        ]);

        if (cancelled) return;
        if (!conversation) throw new Error('Sotuvchi bilan suhbatni ochib bo‘lmadi.');
        if (!product) throw new Error('Mahsulot topilmadi yoki sotuvdan olingan.');
        if (!product.seller || product.seller.user_id !== sellerUserId) {
          throw new Error('Mahsulot sotuvchisi mos kelmadi.');
        }

        let selectedVariant: {
          id: string;
          sku: string | null;
          options: Record<string, string>;
          price: number | null;
          quantity: number;
          image_url: string | null;
        } | null = null;

        if (requestedVariantId) {
          const { data: variant, error: variantError } = await db
            .from('product_variants')
            .select('id, sku, options, price, quantity, image_url, is_active')
            .eq('id', requestedVariantId)
            .eq('product_id', product.id)
            .eq('is_active', true)
            .maybeSingle();

          if (variantError) throw new Error(`Variantni tekshirib bo‘lmadi: ${variantError.message}`);
          if (!variant) throw new Error('Tanlangan rang/o‘lcham varianti endi mavjud emas.');
          if (Number(variant.quantity ?? 0) <= 0) throw new Error('Tanlangan variant hozir sotuvda qolmagan.');

          selectedVariant = {
            id: String(variant.id),
            sku: variant.sku ? String(variant.sku) : null,
            options: (variant.options && typeof variant.options === 'object' ? variant.options : {}) as Record<string, string>,
            price: variant.price == null ? null : Number(variant.price),
            quantity: Number(variant.quantity ?? 0),
            image_url: variant.image_url ? String(variant.image_url) : null,
          };
        }

        const available = selectedVariant
          ? selectedVariant.quantity
          : Math.max(1, Number(product.quantity ?? 1));
        const quantity = safeQuantity(searchParams.get('qty'), available);
        const unitPrice = Number(selectedVariant?.price ?? product.price ?? 0);
        const productUrl = `${window.location.origin}/marketplace/product/${encodeURIComponent(product.id)}`;
        const message = buildMarketplaceProductMessage(
          product,
          sellerUserId,
          productUrl,
          intent,
          {
            variantId: selectedVariant?.id,
            variantSku: selectedVariant?.sku || undefined,
            options: selectedVariant?.options || {},
            quantity,
            unitPrice,
            imageUrl: selectedVariant?.image_url || product.images?.[0]?.url || undefined,
          },
        );

        const { data: recentRows, error: recentError } = await supabase
          .from('messages')
          .select('metadata, created_at')
          .eq('conversation_id', conversation.id)
          .eq('sender_id', user.id)
          .order('created_at', { ascending: false })
          .limit(12);

        if (recentError) {
          console.warn('Marketplace handoff dedupe check failed:', recentError);
        }

        const alreadySent = isRecentMarketplaceProductMessage(
          (recentRows || []) as Array<{ metadata?: unknown; created_at?: string | null }>,
          {
            productId: product.id,
            variantId: selectedVariant?.id,
            intent,
          },
        );

        if (!alreadySent) {
          const { error: insertError } = await supabase.from('messages').insert({
            conversation_id: conversation.id,
            sender_id: user.id,
            content: message.content,
            media_url: null,
            media_type: null,
            metadata: message.metadata as any,
          });

          if (insertError) throw insertError;

          const { error: conversationError } = await supabase
            .from('conversations')
            .update({ last_message_at: new Date().toISOString() })
            .eq('id', conversation.id);

          if (conversationError) {
            console.warn('Marketplace handoff conversation timestamp failed:', conversationError);
          }
        }

        if (!cancelled) {
          navigate(`/messages?conversation=${encodeURIComponent(conversation.id)}`, { replace: true });
        }
      } catch (handoffError) {
        if (cancelled) return;
        console.error('Marketplace chat handoff failed:', handoffError);
        setError(
          handoffError instanceof Error && handoffError.message
            ? handoffError.message
            : 'Marketplace xabarini yuborib bo‘lmadi.',
        );
      }
    };

    void handoff();

    return () => {
      cancelled = true;
    };
  }, [createPrivateConversation, navigate, searchParams, user]);

  if (error) {
    return (
      <div className="marketplace-neutral mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
          <PackageSearch className="h-8 w-8 text-muted-foreground" />
        </div>
        <div>
          <h1 className="text-lg font-bold">Suhbatni ochib bo‘lmadi</h1>
          <p className="mt-1 text-sm text-muted-foreground">{error}</p>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <Button variant="outline" className="rounded-xl" onClick={() => navigate(-1)}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Ortga
          </Button>
          <Button className="rounded-xl" onClick={() => navigate('/messages', { replace: true })}>
            <MessageCircle className="mr-2 h-4 w-4" />
            Xabarlar
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="marketplace-neutral flex min-h-[55vh] items-center justify-center px-6">
      <div className="flex max-w-sm flex-col items-center gap-3 text-center text-muted-foreground">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-border/50 bg-background shadow-sm">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">Sotuvchi bilan suhbat ochilmoqda</p>
          <p className="mt-1 text-xs">Mahsulot, variant va miqdor konteksti chatga biriktirilmoqda.</p>
        </div>
      </div>
    </div>
  );
}
