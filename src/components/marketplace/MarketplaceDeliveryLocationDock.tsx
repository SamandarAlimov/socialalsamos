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
import { useIsMobile } from '@/hooks/use-mobile';

const RETURN_ROUTE_KEY = 'alsamos:marketplace:return-route';

function safeInternalRoute(value: string | null) {
  return Boolean(value && value.startsWith('/') && !value.startsWith('//') && !value.includes('\\'));
}

/**
 * Marketplace chrome bridge.
 *
 * The old implementation rendered a permanently floating delivery-location
 * pill above every Marketplace screen. That obscured products and competed
 * with the Marketplace bottom nav. This bridge is intentionally invisible
 * until a product/cart/checkout asks for an address; then it opens the shared
 * map picker. It also injects a real mobile back button into the Marketplace
 * header without bringing back the global app-shell header.
 */
export function MarketplaceDeliveryLocationDock() {
  const route = useLocation();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
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
        // Navigation fallback remains /home when session storage is unavailable.
      }
    }
  }, [route.hash, route.pathname, route.search]);

  useEffect(() => {
    const openPicker = () => setPickerOpen(true);
    window.addEventListener(MARKETPLACE_LOCATION_PICKER_OPEN_EVENT, openPicker);
    return () => window.removeEventListener(MARKETPLACE_LOCATION_PICKER_OPEN_EVENT, openPicker);
  }, []);

  useEffect(() => {
    if (!isMobile || route.pathname !== '/marketplace') {
      setHeaderTarget(null);
      return;
    }

    const findTarget = () =>
      document.querySelector<HTMLElement>('.marketplace-neutral > header > div > div');

    const immediate = findTarget();
    if (immediate) {
      setHeaderTarget(immediate);
      return;
    }

    const observer = new MutationObserver(() => {
      const target = findTarget();
      if (target) {
        setHeaderTarget(target);
        observer.disconnect();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [isMobile, route.pathname]);

  const goBack = () => {
    const historyIndex = Number(window.history.state?.idx);
    if (Number.isFinite(historyIndex) && historyIndex > 0) {
      navigate(-1);
      return;
    }

    let fallback = '/home';
    try {
      const stored = sessionStorage.getItem(RETURN_ROUTE_KEY);
      if (safeInternalRoute(stored) && !stored!.startsWith('/marketplace')) fallback = stored!;
    } catch {
      // /home is a safe deterministic fallback.
    }
    navigate(fallback, { replace: true });
  };

  const showPicker = route.pathname.startsWith('/marketplace') && route.pathname !== '/marketplace/chat';

  return (
    <>
      {isMobile && route.pathname === '/marketplace' && headerTarget
        ? createPortal(
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="order-first h-11 w-11 shrink-0 rounded-2xl border border-border/50 bg-background/80 shadow-sm md:hidden"
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
