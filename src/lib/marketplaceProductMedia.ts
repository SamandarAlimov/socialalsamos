import type { Product } from '@/hooks/useMarketplace';
import { resolveStorageUrlCandidates } from '@/lib/mediaUpload';

const resolvedUrlCache = new Map<string, string>();
const inflightUrlCache = new Map<string, Promise<string>>();

async function resolveProductImageUrl(rawUrl: string) {
  const raw = rawUrl.trim();
  if (!raw) return raw;

  const cached = resolvedUrlCache.get(raw);
  if (cached) return cached;

  const inflight = inflightUrlCache.get(raw);
  if (inflight) return inflight;

  const promise = resolveStorageUrlCandidates(raw)
    .then(candidates => {
      const resolved = candidates[0] || raw;
      resolvedUrlCache.set(raw, resolved);
      return resolved;
    })
    .catch(error => {
      console.warn('Marketplace detail media resolve failed:', error);
      return raw;
    })
    .finally(() => {
      inflightUrlCache.delete(raw);
    });

  inflightUrlCache.set(raw, promise);
  return promise;
}

/**
 * Product cards already have URL recovery, but the detail gallery historically
 * rendered product_images.url directly. Resolve the same storage references
 * before ProductDetail receives the product so card/detail/store surfaces use
 * one canonical browser URL and old signed/private URLs do not disappear only
 * on the detail page.
 */
export async function resolveMarketplaceProductMedia(product: Product): Promise<Product> {
  if (!product.images?.length) return product;

  const images = await Promise.all(
    product.images.map(async image => ({
      ...image,
      url: await resolveProductImageUrl(image.url),
    })),
  );

  return { ...product, images };
}
