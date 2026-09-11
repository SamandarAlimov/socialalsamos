import { useEffect, useState } from 'react';
import { CategoryIcon } from '@/components/marketplace/CategoryIcon';
import type { Product } from '@/hooks/useMarketplace';
import { resolveStorageUrlCandidates } from '@/lib/mediaUpload';
import { cn } from '@/lib/utils';

interface MarketplaceProductImageProps {
  product: Product;
  className?: string;
  fallbackClassName?: string;
}

const resolvedCandidateCache = new Map<string, string[]>();
const workingCandidateCache = new Map<string, string>();
const inflightCandidateCache = new Map<string, Promise<string[]>>();

function canRenderDirectly(value: string) {
  return /^(https?:|blob:|data:)/i.test(value);
}

function directCandidates(rawSource: string) {
  return rawSource && canRenderDirectly(rawSource) ? [rawSource] : [];
}

function cachedCandidates(rawSource: string) {
  const cached = resolvedCandidateCache.get(rawSource) ?? directCandidates(rawSource);
  const working = workingCandidateCache.get(rawSource);
  if (!working) return cached;
  return [working, ...cached.filter(candidate => candidate !== working)];
}

function resolveCandidatesOnce(rawSource: string) {
  const cached = resolvedCandidateCache.get(rawSource);
  if (cached) return Promise.resolve(cachedCandidates(rawSource));

  const inflight = inflightCandidateCache.get(rawSource);
  if (inflight) return inflight;

  const promise = resolveStorageUrlCandidates(rawSource)
    .then(resolved => {
      const candidates = resolved.length > 0 ? resolved : directCandidates(rawSource);
      resolvedCandidateCache.set(rawSource, candidates);
      return cachedCandidates(rawSource);
    })
    .finally(() => {
      inflightCandidateCache.delete(rawSource);
    });

  inflightCandidateCache.set(rawSource, promise);
  return promise;
}

/**
 * Marketplace media must go through the same legacy/storage recovery path as
 * the rest of Alsamos. Historical rows may contain storage:// references,
 * expired signed URLs or URLs from buckets whose visibility changed. Rendering
 * product_images.url directly makes those rows look as if they have no image.
 *
 * Resolved and known-working candidates are cached at module scope. Switching
 * Marketplace tabs or reopening the browse surface therefore does not repeat
 * signing/recovery work and does not flash a placeholder for an image that was
 * already successfully displayed in this session.
 */
export function MarketplaceProductImage({
  product,
  className,
  fallbackClassName,
}: MarketplaceProductImageProps) {
  const rawSource = product.images?.[0]?.url?.trim() || '';
  const [candidates, setCandidates] = useState<string[]>(() => cachedCandidates(rawSource));
  const [candidateIndex, setCandidateIndex] = useState(0);

  useEffect(() => {
    let cancelled = false;

    setCandidates(cachedCandidates(rawSource));
    setCandidateIndex(0);

    if (!rawSource) {
      return () => {
        cancelled = true;
      };
    }

    void resolveCandidatesOnce(rawSource)
      .then(resolved => {
        if (cancelled) return;
        setCandidates(resolved);
        setCandidateIndex(0);
      })
      .catch(error => {
        if (cancelled) return;
        console.warn('Marketplace product image URL resolve failed:', error);
        setCandidates(cachedCandidates(rawSource));
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
      src={source}
      alt={product.title}
      className={className}
      loading="lazy"
      decoding="async"
      data-marketplace-resilient-image="true"
      onLoad={() => {
        if (!rawSource) return;
        workingCandidateCache.set(rawSource, source);
      }}
      onError={() => {
        if (workingCandidateCache.get(rawSource) === source) {
          workingCandidateCache.delete(rawSource);
        }
        setCandidateIndex(current => current + 1);
      }}
    />
  );
}
