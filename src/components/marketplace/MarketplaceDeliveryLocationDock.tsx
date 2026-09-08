import { useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { MarketplaceLocationPicker } from '@/components/marketplace/MarketplaceLocationPicker';
import {
  MARKETPLACE_LOCATION_PICKER_OPEN_EVENT,
  useMarketplaceDeliveryLocation,
} from '@/hooks/useMarketplaceDeliveryLocation';

const RETURN_ROUTE_KEY = 'alsamos:marketplace:return-route';

function safeInternalRoute(value: string | null) {
  return Boolean(value && value.startsWith('/') && !value.startsWith('//') && !value.includes('\\'));
}

/**
 * Shared Marketplace chrome bridge.
 *
 * Delivery address UI stays contextual: product/cart/checkout can ask for the
 * picker without a permanent floating dock covering commerce content.
 *
 * The Marketplace home back button is portaled directly into the real sticky
 * header row. The row can be replaced once on mobile when useIsMobile settles
 * and PullToRefresh mounts, so the MutationObserver deliberately keeps
 * watching instead of disconnecting after the first match. This prevents the
 * portal from getting stranded in a detached, invisible header node.
 */
export function MarketplaceDeliveryLocationDock() {
  const route = useLocation();
  const navigate = useNavigate();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [headerTarget, setHeaderTarget] = useState<HTMLElement | null>(null);
  const { location, setLocation } = useMarketplaceDeliveryLocation();

  useEffect(() => {
    if (!route.pathname.startsWith('/marketplace')) {
      try {
        sessionStorage.setItem(
          RETURN_ROUTE_KEY,
          `${route.pathname}${route.search}${route.hash}`,
        );
      } catch {
        // Navigation still falls back to browser history or /home.
      }
    }
  }, [route.hash, route.pathname, route.search]);

  useEffect(() => {
    const openPicker = () => setPickerOpen(true);
    window.addEventListener(MARKETPLACE_LOCATION_PICKER_OPEN_EVENT, openPicker);
    return () => window.removeEventListener(MARKETPLACE_LOCATION_PICKER_OPEN_EVENT, openPicker);
  }, []);

  useEffect(() => {
    if (route.pathname !== '/marketplace') {
      setHeaderTarget(null);
      return;
    }

    const findTarget = () =>
      document.querySelector<HTMLElement>('.marketplace-neutral > header > div > div');

    const syncTarget = () => {
      const target = findTarget();
      setHeaderTarget(current => (current === target ? current : target));
    };

    syncTarget();

    // Keep observing while the Marketplace home route is mounted. On mobile
    // the first header can be replaced after the responsive hook resolves.
    const observer = new MutationObserver(syncTarget);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => observer.disconnect();
  }, [route.pathname]);

  const goBack = () => {
    // The main Marketplace back action should return to the app surface from
    // which Marketplace was entered, even after browsing products internally.
    try {
      const stored = sessionStorage.getItem(RETURN_ROUTE_KEY);
      if (safeInternalRoute(stored) && !stored!.startsWith('/marketplace')) {
        navigate(stored!);
        return;
      }
    } catch {
      // Continue with history fallback.
    }

    const historyIndex = Number(window.history.state?.idx);
    if (Number.isFinite(historyIndex) && historyIndex > 0) {
      navigate(-1);
      return;
    }

    navigate('/home', { replace: true });
  };

  const showPicker = route.pathname.startsWith('/marketplace') && route.pathname !== '/marketplace/chat';

  return (
    <>
      {route.pathname === '/marketplace' && headerTarget
        ? createPortal(
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="order-first h-11 w-11 shrink-0 rounded-2xl border-border/60 bg-background/90 shadow-sm md:hidden"
              onClick={goBack}
              aria-label="Oldingi sahifaga qaytish"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>,
            headerTarget,
          )
        : null}

      {showPicker && (
        <MarketplaceLocationPicker
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          value={location}
          onSelect={setLocation}
          title="Yetkazish manzilini tanlang"
          description="Joriy joylashuvingizni tanlang yoki xarita va qidiruv orqali buyurtma yetkazilishi kerak bo‘lgan boshqa manzilni belgilang."
        />
      )}
    </>
  );
}
