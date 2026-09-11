import { lazy, Suspense, useEffect, useLayoutEffect, useRef } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import type { Location } from 'react-router-dom';
import MarketplacePage from '@/pages/MarketplacePage';
import MarketplaceProductPage from '@/pages/MarketplaceProductPage';
import MarketplaceChatHandoffPage from '@/pages/MarketplaceChatHandoffPage';
import MarketplaceStorePage from '@/pages/MarketplaceStorePage';

const MarketplaceProductEditPage = lazy(() => import('@/pages/MarketplaceProductEditPage'));
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

function EditRouteFallback() {
  return (
    <div className="flex min-h-[45vh] items-center justify-center">
      <div className="h-7 w-7 animate-spin rounded-full border-2 border-muted border-t-foreground" />
    </div>
  );
}

/**
 * Marketplace browse keeps its known-good mounted route behavior so cards,
 * filters and scroll state survive detail navigation. Product editing is loaded
 * only when /marketplace/edit/:productId is opened; an editor-only dependency
 * can therefore never break the main Marketplace browse/selling render path.
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
      root.scrollTop = 0;
    } else if (isHome && !previousWasHomeRef.current) {
      const restoreTo = savedScrollTopRef.current || readStoredScrollTop();
      root.scrollTop = restoreTo;
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
          <Route
            path="/marketplace/edit/:productId"
            element={
              <Suspense fallback={<EditRouteFallback />}>
                <MarketplaceProductEditPage />
              </Suspense>
            }
          />
          <Route path="/marketplace/store/:sellerId" element={<MarketplaceStorePage />} />
          <Route path="/marketplace/chat" element={<MarketplaceChatHandoffPage />} />
          <Route path="*" element={<Navigate to="/marketplace" replace />} />
        </Routes>
      )}
    </>
  );
}
