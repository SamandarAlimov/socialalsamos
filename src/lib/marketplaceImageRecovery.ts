import { resolveStorageUrlCandidates } from '@/lib/mediaUpload';

const RECOVERING_ATTR = 'marketplaceRecoveryActive';
const EXHAUSTED_ATTR = 'marketplaceRecoveryExhausted';
let installed = false;

type RecoveryState = {
  rawSource: string;
  attempted: Set<string>;
  resolving: boolean;
};

const imageStates = new WeakMap<HTMLImageElement, RecoveryState>();

function isMarketplacePath() {
  return typeof window !== 'undefined' && window.location.pathname.startsWith('/marketplace');
}

function currentSource(image: HTMLImageElement) {
  return (image.currentSrc || image.getAttribute('src') || '').trim();
}

function handBackToReact(image: HTMLImageElement) {
  image.dataset[EXHAUSTED_ATTR] = 'true';
  image.dispatchEvent(new Event('error'));
}

async function recoverImage(image: HTMLImageElement, state: RecoveryState) {
  try {
    const candidates = await resolveStorageUrlCandidates(state.rawSource);
    const next = candidates.find(candidate => candidate && !state.attempted.has(candidate));

    if (!next) {
      handBackToReact(image);
      return;
    }

    state.attempted.add(next);
    image.dataset[RECOVERING_ATTR] = 'true';
    image.src = next;
  } catch (error) {
    console.warn('Marketplace legacy image recovery failed:', error);
    handBackToReact(image);
  } finally {
    state.resolving = false;
  }
}

/**
 * Some legacy Marketplace surfaces still render product_images.url directly.
 * Those rows may contain an expired signed URL or a storage reference while
 * modern ProductCard already uses MarketplaceProductImage and retries safely.
 *
 * This capture listener is intentionally scoped to /marketplace and skips
 * self-recovering images. It prevents a legacy component from switching to its
 * permanent placeholder until all storage URL candidates have been tried.
 */
export function installMarketplaceImageRecovery() {
  if (installed || typeof document === 'undefined') return;
  installed = true;

  document.addEventListener(
    'error',
    event => {
      const target = event.target;
      if (!(target instanceof HTMLImageElement)) return;
      if (!isMarketplacePath()) return;
      if (target.dataset.marketplaceResilientImage === 'true') return;

      if (target.dataset[EXHAUSTED_ATTR] === 'true') {
        delete target.dataset[EXHAUSTED_ATTR];
        delete target.dataset[RECOVERING_ATTR];
        return;
      }

      const source = currentSource(target);
      if (!source) return;

      let state = imageStates.get(target);
      const isNewSource = state && source !== state.rawSource && !state.attempted.has(source);
      if (!state || isNewSource) {
        state = {
          rawSource: source,
          attempted: new Set<string>(),
          resolving: false,
        };
        imageStates.set(target, state);
      }

      state.attempted.add(source);

      // React's local onError would otherwise immediately replace the image
      // with a fallback before the asynchronous storage resolver can retry it.
      event.stopImmediatePropagation();

      if (state.resolving) return;
      state.resolving = true;
      void recoverImage(target, state);
    },
    true,
  );
}
