import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import MarketplacePage from '@/pages/MarketplacePage';
import MarketplaceProductPage from '@/pages/MarketplaceProductPage';
import MarketplaceChatHandoffPage from '@/pages/MarketplaceChatHandoffPage';
import MarketplaceStorePage from '@/pages/MarketplaceStorePage';

const MarketplaceProductEditPage = lazy(() => import('@/pages/MarketplaceProductEditPage'));

function RouteFallback() {
  return (
    <div className="flex min-h-[45vh] items-center justify-center">
      <div className="h-7 w-7 animate-spin rounded-full border-2 border-muted border-t-foreground" />
    </div>
  );
}

/**
 * Marketplace routing intentionally stays simple and deterministic here.
 *
 * The previous keep-alive implementation preserved the browse DOM and manually
 * supplied a saved `location` to a second <Routes> tree. That optimization is
 * not allowed to sit on the critical render path: if routing state becomes
 * stale after a deploy/navigation, the authenticated shell can render while
 * the Marketplace outlet itself is empty. A normal route tree is cheap,
 * predictable and lets React Router own matching again.
 *
 * Product editing remains code-split so editor-only code is not evaluated when
 * users open the catalogue or seller centre.
 */
export function MarketplaceRouteKeeper() {
  return (
    <Routes>
      <Route path="/marketplace" element={<MarketplacePage />} />
      <Route path="/marketplace/product/:productId" element={<MarketplaceProductPage />} />
      <Route
        path="/marketplace/edit/:productId"
        element={
          <Suspense fallback={<RouteFallback />}>
            <MarketplaceProductEditPage />
          </Suspense>
        }
      />
      <Route path="/marketplace/store/:sellerId" element={<MarketplaceStorePage />} />
      <Route path="/marketplace/chat" element={<MarketplaceChatHandoffPage />} />
      <Route path="*" element={<Navigate to="/marketplace" replace />} />
    </Routes>
  );
}
