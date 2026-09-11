import { useCallback, useEffect, useLayoutEffect, useRef, type SyntheticEvent } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import type { Location } from 'react-router-dom';
import MarketplacePage from '@/pages/MarketplacePage';
import MarketplaceProductPage from '@/pages/MarketplaceProductPage';
import MarketplaceChatHandoffPage from '@/pages/MarketplaceChatHandoffPage';
import MarketplaceStorePage from '@/pages/MarketplaceStorePage';
import { resolveStorageUrlCandidates } from '@/lib/mediaUpload';

const MARKETPLACE_SCROLL_KEY = 'alsamos:marketplace:scroll-top:v2';
const recoveryCandidateCache = new Map<string, string[]>();
const recoveryInflightCache = new Map<string, Promise<string[]>>();
const attemptedCandidates = new WeakMap<HTMLImageElement, Set<string>>();
const recoveringImages = new WeakSet<HTMLImageElement>();

function getPlatformScrollRoot() {
  if (typeof document === 'undefined') return null;
  return document.querySelector<HTMLElement>('main[data-platform-scroll-root="true"]');
}

function readStoredScrollTop() {
  if (typeof window === 'undefined') return 0;
  try {
    const value = Number(sessionStorage.getItem(MARKETPLACE_SCROLL_KEY) || 0);
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
}

function persistScrollTop(value: number) {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(MARKETPLACE_SCROLL_KEY, String(Math.max(0, Math.round(value))));
  } catch {
    // Scroll restoration is a UX enhancement; private mode may deny storage.
  }
}

function homeLocationFrom(location: Location): Location {
  return {
    ...location,
    pathname: '/marketplace',
    search: '',
    hash: '',
    state: null,
    key: 'marketplace-home',
  };
}

function resolveRecoveryCandidates(rawSource: string) {
  const cached = recoveryCandidateCache.get(rawSource);
  if (cached) return Promise.resolve(cached);

  const inflight = recoveryInflightCache.get(rawSource);
  if (inflight) return inflight;

  const promise = resolveStorageUrlCandidates(rawSource)
    .then(candidates => {
      const unique = Array.from(new Set(candidates.filter(Boolean)));
      recoveryCandidateCache.set(rawSource, unique);
      return unique;
    })
    .finally(() => {
      recoveryInflightCache.delete(rawSource);
    });

  recoveryInflightCache.set(rawSource, promise);
  return promise;
}

function handErrorBackToComponent(image: HTMLImageElement) {
  image.dataset.marketplaceRecoveryExhausted = 'true';
  image.dispatchEvent(new Event('error'));
}

/**
 * A few older Marketplace surfaces still render product_images.url directly
 * instead of using MarketplaceProductImage. That made the same photo work in
 * the main product grid but fail in "Hozir ommabop" or the detail gallery when
 * the stored URL was an expired signed URL / storage reference. This capture
 * boundary gives every raw Marketplace <img> the same recovery candidates.
 *
 * MarketplaceProductImage marks itself and is deliberately skipped here: it
 * already owns its retry state and must receive its own onError events.
 */
function recoverMarketplaceImageError(event: SyntheticEvent<HTMLDivElement>) {
  const target = event.target;
  if (!(target instanceof HTMLImageElement)) return;
  if (target.dataset.marketplaceResilientImage === 'true') return;

  if (target.dataset.marketplaceRecoveryExhausted === 'true') {
    delete target.dataset.marketplaceRecoveryExhausted;
    return;
  }

  const currentSource = target.getAttribute('src')?.trim() || '';
  const rawSource = target.dataset.marketplaceRecoverySource || currentSource;
  if (!rawSource) return;

  // Do not let a component switch to its permanent placeholder until all
  // storage recovery candidates have actually been tried.
  event.stopPropagation();

  if (recoveringImages.has(target)) return;

  target.dataset.marketplaceRecoverySource = rawSource;
  const attempted = attemptedCandidates.get(target) ?? new Set<string>();
  if (currentSource) attempted.add(currentSource);
  attemptedCandidates.set(target, attempted);
  recoveringImages.add(target);

  void resolveRecoveryCandidates(rawSource)
    .then(candidates => {
      const next = candidates.find(candidate => !attempted.has(candidate));
      if (!next) {
        handErrorBackToComponent(target);
        return;
      }

      attempted.add(next);
      target.src = next;
    })
    .catch(error => {
      console.warn('Marketplace raw image recovery failed:', error);
      handErrorBackToComponent(target);
    })
    .finally(() => {
      recoveringImages.delete(target);
    });
}

/**
 * Marketplace browse is intentionally kept mounted while a product/store/chat
 * route is open. Product cards, filters, loaded sections and image elements
 * therefore do not get destroyed and fetched again just because the user opens
 * a detail page. The authenticated shell scrolls inside AppLayout <main>, not
 * window, so that exact scroll owner is saved and restored as well.
 */
export function MarketplaceRouteKeeper() {
  const location = useLocation();
  const isHome = location.pathname === '/marketplace';
  const homeLocationRef = useRef<Location>(
    isHome ? location : homeLocationFrom(location),
  );
  const savedScrollTopRef = useRef(readStoredScrollTop());
  const previousWasHomeRef = useRef(isHome);
  const handleImageErrorCapture = useCallback(recoverMarketplaceImageError, []);

  if (isHome) {
    homeLocationRef.current = location;
  }

  useEffect(() => {
    if (!isHome) return;
    const root = getPlatformScrollRoot();
    if (!root) return;

    const remember = () => {
      savedScrollTopRef.current = root.scrollTop;
      persistScrollTop(root.scrollTop);
    };

    // Capture the current position immediately, then keep it fresh. This is
    // deliberately done while the browse surface is still visible: once the
    // route switches and that surface becomes display:none, the browser may
    // clamp main.scrollTop to zero before layout effects run.
    remember();
    root.addEventListener('scroll', remember, { passive: true });
    return () => root.removeEventListener('scroll', remember);
  }, [isHome]);

  useLayoutEffect(() => {
    const root = getPlatformScrollRoot();
    if (!root) {
      previousWasHomeRef.current = isHome;
      return;
    }

    if (!isHome && previousWasHomeRef.current) {
      // Do not read scrollTop here: hiding the Marketplace DOM can already have
      // clamped it to zero. The scroll listener above holds the last real value.
      root.scrollTop = 0;
    } else if (isHome && !previousWasHomeRef.current) {
      const restoreTo = savedScrollTopRef.current || readStoredScrollTop();
      root.scrollTop = restoreTo;
      // A second assignment after layout protects the exact card position from
      // late font/image sizing without remounting the browse tree.
      const frame = window.requestAnimationFrame(() => {
        root.scrollTop = restoreTo;
      });
      previousWasHomeRef.current = isHome;
      return () => window.cancelAnimationFrame(frame);
    }

    previousWasHomeRef.current = isHome;
  }, [isHome]);

  return (
    <div className="contents" onErrorCapture={handleImageErrorCapture}>
      <div className={isHome ? 'contents' : 'hidden'} aria-hidden={!isHome}>
        <Routes location={homeLocationRef.current}>
          <Route path="/marketplace" element={<MarketplacePage />} />
        </Routes>
      </div>

      {!isHome && (
        <Routes>
          <Route path="/marketplace/product/:productId" element={<MarketplaceProductPage />} />
          <Route path="/marketplace/store/:sellerId" element={<MarketplaceStorePage />} />
          <Route path="/marketplace/chat" element={<MarketplaceChatHandoffPage />} />
          <Route path="*" element={<Navigate to="/marketplace" replace />} />
        </Routes>
      )}
    </div>
  );
}
