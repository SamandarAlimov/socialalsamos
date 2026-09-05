import { useEffect, useMemo, useState } from 'react';
import { BadgeCheck, ExternalLink, Loader2, Package, ShoppingBag } from 'lucide-react';

import { fetchMarketplaceProductById, type Product } from '@/hooks/useMarketplace';
import { formatPrice } from '@/lib/marketplace';
import { parseMarketplaceSelectionFromUrl } from '@/lib/marketplaceChat';
import { db } from '@/lib/supabaseAny';
import { cn } from '@/lib/utils';

type VariantPreview = {
  id: string;
  sku: string | null;
  options: Record<string, string>;
  price: number | null;
  quantity: number;
  image_url: string | null;
};

interface MarketplaceLinkPreviewProps {
  url: string;
  isMine?: boolean;
  className?: string;
}

function trustedHost(url: URL) {
  if (typeof window !== 'undefined' && url.origin === window.location.origin) return true;
  const host = url.hostname.toLowerCase();
  return host === 'alsamos.com' || host.endsWith('.alsamos.com');
}

export function marketplaceProductIdFromUrl(value: string): string | null {
  try {
    const url = new URL(value, typeof window !== 'undefined' ? window.location.origin : 'https://alsamos.com');
    if (!trustedHost(url)) return null;
    const match = /^\/marketplace\/product\/([^/?#]+)\/?$/.exec(url.pathname);
    return match ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
}

export function isMarketplaceProductUrl(value: string) {
  return Boolean(marketplaceProductIdFromUrl(value));
}

export function MarketplaceLinkPreview({ url, isMine, className }: MarketplaceLinkPreviewProps) {
  const productId = useMemo(() => marketplaceProductIdFromUrl(url), [url]);
  const selection = useMemo(() => parseMarketplaceSelectionFromUrl(url), [url]);
  const [product, setProduct] = useState<Product | null>(null);
  const [variant, setVariant] = useState<VariantPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setProduct(null);
    setVariant(null);
    setFailed(false);
    setImageFailed(false);

    if (!productId) {
      setLoading(false);
      setFailed(true);
      return;
    }

    setLoading(true);
    const load = async () => {
      try {
        const nextProduct = await fetchMarketplaceProductById(productId);
        if (!nextProduct) throw new Error('product_not_found');

        let nextVariant: VariantPreview | null = null;
        if (selection.variantId) {
          const { data, error } = await db
            .from('product_variants')
            .select('id, sku, options, price, quantity, image_url, is_active')
            .eq('id', selection.variantId)
            .eq('product_id', productId)
            .eq('is_active', true)
            .maybeSingle();

          if (!error && data) {
            nextVariant = {
              id: String(data.id),
              sku: data.sku ? String(data.sku) : null,
              options: (data.options && typeof data.options === 'object' ? data.options : {}) as Record<string, string>,
              price: data.price == null ? null : Number(data.price),
              quantity: Number(data.quantity ?? 0),
              image_url: data.image_url ? String(data.image_url) : null,
            };
          }
        }

        if (cancelled) return;
        setProduct(nextProduct);
        setVariant(nextVariant);
      } catch {
        if (!cancelled) setFailed(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [productId, selection.variantId]);

  if (loading) {
    return (
      <div
        className={cn(
          'flex w-[320px] max-w-full items-center gap-3 rounded-2xl border p-3',
          isMine ? 'border-bubble-own-accent/15 bg-black/[0.035]' : 'border-border/60 bg-muted/45',
          className,
        )}
      >
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-muted/70">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="h-3 w-24 animate-pulse rounded bg-muted" />
          <div className="h-4 w-44 max-w-full animate-pulse rounded bg-muted" />
          <div className="h-3 w-20 animate-pulse rounded bg-muted" />
        </div>
      </div>
    );
  }

  if (failed || !product) return null;

  const authoritativeOptions = variant?.options || selection.options;
  const optionEntries = Object.entries(authoritativeOptions).slice(0, 4);
  const quantity = Math.max(1, Math.min(selection.quantity || 1, variant?.quantity || product.quantity || 1));
  const unitPrice = Number(variant?.price ?? product.price ?? 0);
  const currency = product.currency || 'USD';
  const imageUrl = !imageFailed
    ? variant?.image_url || product.images?.[0]?.url || null
    : null;
  const unavailable = product.status !== 'active' || Number(variant?.quantity ?? product.quantity ?? 0) <= 0;
  const sellerName = product.seller?.business_name || product.seller?.profile?.display_name || 'Alsamos sotuvchisi';

  return (
    <a
      href={url}
      onClick={(event) => event.stopPropagation()}
      className={cn(
        'group block w-[340px] max-w-full overflow-hidden rounded-2xl border text-left no-underline shadow-sm transition-all hover:-translate-y-px hover:shadow-md',
        isMine
          ? 'border-bubble-own-accent/15 bg-black/[0.035] text-bubble-own-foreground'
          : 'border-border/60 bg-background text-foreground',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3 border-b border-current/10 px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={cn(
              'flex h-8 w-8 shrink-0 items-center justify-center rounded-xl',
              isMine ? 'bg-bubble-own-foreground/10' : 'bg-foreground text-background',
            )}
          >
            <ShoppingBag className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] opacity-55">Alsamos Bozor</p>
            <div className="flex min-w-0 items-center gap-1">
              <p className="truncate text-xs font-semibold">{sellerName}</p>
              {product.seller?.is_verified && <BadgeCheck className="h-3.5 w-3.5 shrink-0" />}
            </div>
          </div>
        </div>
        <ExternalLink className="h-4 w-4 shrink-0 opacity-45 transition-opacity group-hover:opacity-80" />
      </div>

      <div className="flex gap-3 p-3">
        <div className="h-24 w-24 shrink-0 overflow-hidden rounded-2xl bg-muted">
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={product.title}
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover"
              onError={() => setImageFailed(true)}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-muted-foreground">
              <Package className="h-7 w-7" />
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-[14px] font-semibold leading-snug">{product.title}</p>
          <p className="mt-1.5 text-lg font-extrabold tabular-nums">
            {formatPrice(unitPrice, currency)}
          </p>

          {optionEntries.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {optionEntries.map(([name, value]) => (
                <span
                  key={name}
                  className={cn(
                    'rounded-lg px-2 py-1 text-[10px] font-medium',
                    isMine ? 'bg-bubble-own-foreground/[0.08]' : 'bg-muted',
                  )}
                >
                  {name}: {value}
                </span>
              ))}
            </div>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] opacity-65">
            {variant?.sku && <span>SKU {variant.sku}</span>}
            {quantity > 1 && <span>{quantity} dona</span>}
            <span>{unavailable ? 'Hozir mavjud emas' : 'Mahsulotni ko‘rish'}</span>
          </div>
        </div>
      </div>
    </a>
  );
}
