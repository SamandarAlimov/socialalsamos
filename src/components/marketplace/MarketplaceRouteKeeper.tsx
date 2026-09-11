import { useEffect, useLayoutEffect, useRef } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import type { Location } from 'react-router-dom';
import MarketplacePage from '@/pages/MarketplacePage';
import MarketplaceProductPage from '@/pages/MarketplaceProductPage';
import MarketplaceChatHandoffPage from '@/pages/MarketplaceChatHandoffPage';
import MarketplaceStorePage from '@/pages/MarketplaceStorePage';

const MARKETPLACE_SCROLL_KEY = 'alsamos:marketplace:scroll-top:v2';

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
    <>
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
    </>
  );
}
