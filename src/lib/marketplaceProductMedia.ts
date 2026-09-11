import type { Product } from '@/hooks/useMarketplace';
import { resolveStorageUrlCandidates } from '@/lib/mediaUpload';

const resolvedUrlCache = new Map<string, string>();
const inflightUrlCache = new Map<string, Promise<string>>();
const candidateHealthCache = new Map<string, boolean>();
const IMAGE_PROBE_TIMEOUT_MS = 8000;

function canProbeImages() {
  return typeof Image !== 'undefined';
}

/**
 * resolveStorageUrlCandidates intentionally returns every plausible URL. The
 * first candidate is not guaranteed to be readable: an old public URL may now
 * point at a private bucket, while the following signed URL is valid. Product
 * cards already retry candidates in <img onError>; detail pages need the same
 * guarantee before ProductDetail receives its gallery URLs.
 */
async function candidateLoads(candidate: string): Promise<boolean> {
  if (!candidate) return false;

  const cached = candidateHealthCache.get(candidate);
  if (cached != null) return cached;

  // SSR/tests do not have HTMLImageElement. In that environment we cannot
  // probe, so keep the resolver deterministic and let the browser verify it.
  if (!canProbeImages()) return true;

  return new Promise<boolean>(resolve => {
    const image = new Image();
    let settled = false;

    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      globalThis.clearTimeout(timer);
      image.onload = null;
      image.onerror = null;
      candidateHealthCache.set(candidate, ok);
      resolve(ok);
    };

    const timer = globalThis.setTimeout(() => finish(false), IMAGE_PROBE_TIMEOUT_MS);
    image.onload = () => finish(true);
    image.onerror = () => finish(false);
    image.src = candidate;
  });
}

async function resolveProductImageUrl(rawUrl: string) {
  const raw = rawUrl.trim();
  if (!raw) return raw;

  const cached = resolvedUrlCache.get(raw);
  if (cached) return cached;

  const inflight = inflightUrlCache.get(raw);
  if (inflight) return inflight;

  const promise = resolveStorageUrlCandidates(raw)
    .then(async candidates => {
      const ordered = candidates.length > 0 ? candidates : [raw];

      for (const candidate of ordered) {
        if (await candidateLoads(candidate)) {
          resolvedUrlCache.set(raw, candidate);
          return candidate;
        }
      }

      // Returning the raw value keeps the existing ProductDetail fallback
      // behaviour if every recovery candidate is genuinely unavailable.
      return raw;
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
 * Resolve all product images before ProductDetail receives the product. This
 * keeps card/detail/store surfaces consistent for storage:// references,
 * expired signed URLs and buckets whose visibility changed over time.
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
