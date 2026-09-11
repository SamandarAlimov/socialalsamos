import { useEffect, useState } from 'react';
import { CategoryIcon } from '@/components/marketplace/CategoryIcon';
import type { Product } from '@/hooks/useMarketplace';
import { resolveMarketplaceImageCandidates } from '@/lib/marketplaceImageRecovery';
import { cn } from '@/lib/utils';

interface MarketplaceProductImageProps {
  product: Product;
  className?: string;
  fallbackClassName?: string;
}

function canRenderDirectly(value: string) {
  return /^(https?:|blob:|data:)/i.test(value);
}

/**
 * Marketplace media must go through the same storage recovery path everywhere.
 * Historical rows may contain storage:// references, expired signed URLs or an
 * absolute Supabase URL from a previous Alsamos storage project.
 */
export function MarketplaceProductImage({
  product,
  className,
  fallbackClassName,
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

    void resolveMarketplaceImageCandidates(rawSource)
      .then((resolved) => {
        if (cancelled) return;
        setCandidates(resolved.length > 0 ? resolved : directCandidates);
        setCandidateIndex(0);
      })
      .catch((error) => {
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
      src={source}
      alt={product.title}
      className={className}
      loading="lazy"
      decoding="async"
      onError={() => setCandidateIndex((current) => current + 1)}
    />
  );
}
