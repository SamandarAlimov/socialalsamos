import { useEffect, useState } from 'react';
import { CategoryIcon } from '@/components/marketplace/CategoryIcon';
import type { Product } from '@/hooks/useMarketplace';
import { resolveStorageUrlCandidates } from '@/lib/mediaUpload';
import { cn } from '@/lib/utils';

interface MarketplaceProductImageProps {
  product: Product;
  className?: string;
  fallbackClassName?: string;
  eager?: boolean;
  fetchPriority?: 'high' | 'low' | 'auto';
}

function canRenderDirectly(value: string) {
  return /^(https?:|blob:|data:)/i.test(value);
}

/**
 * ProductDetail'dagi tarixiy raw <img> lar ham ProductCard bilan bir xil media
 * recovery yo'lidan foydalanishi kerak. Ularni birdan qayta yozish o'rniga
 * Marketplace chegarasida capture qilamiz: birinchi 403/404 da React fallback
 * ko'rsatib rasmni unmount qilishidan oldin fresh storage kandidat sinab ko'riladi.
 */
const rawImageRecovery = new WeakMap<
  HTMLImageElement,
  { original: string; tried: Set<string>; resolving: boolean }
>();

function installMarketplaceRawImageRecovery() {
  if (typeof window === 'undefined') return;
  const marker = '__alsamosMarketplaceImageRecoveryInstalled__';
  const markedWindow = window as typeof window & Record<string, unknown>;
  if (markedWindow[marker]) return;
  markedWindow[marker] = true;

  window.addEventListener(
    'error',
    event => {
      const target = event.target;
      if (!(target instanceof HTMLImageElement)) return;
      if (target.dataset.marketplaceImageManaged === 'true') return;
      if (target.dataset.marketplaceRecoveryExhausted === 'true') return;
      if (!target.closest('.marketplace-neutral')) return;

      const current = target.currentSrc || target.src || target.getAttribute('src') || '';
      if (!current || !canRenderDirectly(current)) return;

      // ProductDetail onError imageFailed=true qilib elementni darhol unmount
      // qiladi. Recovery kandidatlarini tekshirguncha o'sha handlerni to'xtatamiz.
      event.preventDefault();
      event.stopImmediatePropagation();

      let state = rawImageRecovery.get(target);
      if (!state || state.original !== current && state.tried.size === 0) {
        state = { original: current, tried: new Set<string>(), resolving: false };
        rawImageRecovery.set(target, state);
      }
      if (state.resolving) return;
      state.resolving = true;
      state.tried.add(current);

      void resolveStorageUrlCandidates(state.original)
        .then(candidates => {
          const next = candidates.find(candidate => candidate && !state!.tried.has(candidate));
          if (next) {
            state!.tried.add(next);
            target.src = next;
            return;
          }

          // Haqiqatan kandidat qolmagan bo'lsa original React onError yana
          // ishlashi uchun bitta final error yuboramiz.
          target.dataset.marketplaceRecoveryExhausted = 'true';
          target.dispatchEvent(new Event('error'));
        })
        .catch(() => {
          target.dataset.marketplaceRecoveryExhausted = 'true';
          target.dispatchEvent(new Event('error'));
        })
        .finally(() => {
          if (state) state.resolving = false;
        });
    },
    true,
  );
}

installMarketplaceRawImageRecovery();

/**
 * Marketplace media must go through the same legacy/storage recovery path as
 * the rest of Alsamos. Historical rows may contain storage:// references,
 * expired signed URLs or URLs from buckets whose visibility changed. Rendering
 * product_images.url directly makes those rows look as if they have no image.
 */
export function MarketplaceProductImage({
  product,
  className,
  fallbackClassName,
  eager = false,
  fetchPriority = 'auto',
}: MarketplaceProductImageProps) {
  const rawSource = product.images?.[0]?.url?.trim() || '';
  const [candidates, setCandidates] = useState<string[]>(() =>
    rawSource && canRenderDirectly(rawSource) ? [rawSource] : [],
  );
  const [candidateIndex, setCandidateIndex] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const directCandidates = rawSource && canRenderDirectly(rawSource) ? [rawSource] : [];

    setCandidates(directCandidates);
    setCandidateIndex(0);

    if (!rawSource) {
      return () => {
        cancelled = true;
      };
    }

    void resolveStorageUrlCandidates(rawSource)
      .then(resolved => {
        if (cancelled) return;
        setCandidates(resolved.length > 0 ? resolved : directCandidates);
        setCandidateIndex(0);
      })
      .catch(error => {
        if (cancelled) return;
        console.warn('Marketplace product image URL resolve failed:', error);
        setCandidates(directCandidates);
        setCandidateIndex(0);
      });

    return () => {
      cancelled = true;
    };
  }, [product.id, rawSource]);

  const source = candidates[candidateIndex];

  if (!source) {
    return (
      <div
        className={cn(
          'flex h-full w-full items-center justify-center bg-gradient-to-br from-muted to-muted/40 text-muted-foreground/40',
          fallbackClassName,
        )}
      >
        <CategoryIcon
          slug={product.category?.slug}
          name={product.category?.name}
          className="h-7 w-7"
        />
      </div>
    );
  }

  return (
    <img
      data-marketplace-image-managed="true"
      src={source}
      alt={product.title}
      className={className}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      fetchPriority={fetchPriority}
      onError={() => setCandidateIndex(current => current + 1)}
    />
  );
}
