import { useEffect, useState } from 'react';
import { ChevronRight, MapPin, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { MarketplaceLocationPicker } from '@/components/marketplace/MarketplaceLocationPicker';
import {
  MARKETPLACE_LOCATION_PICKER_OPEN_EVENT,
  useMarketplaceDeliveryLocation,
} from '@/hooks/useMarketplaceDeliveryLocation';
import { cn } from '@/lib/utils';

const RETURN_ROUTE_KEY = 'alsamos:marketplace:return-route';

function safeInternalRoute(value: string | null) {
  return Boolean(value && value.startsWith('/') && !value.startsWith('//') && !value.includes('\\'));
}

/**
 * Shared Marketplace chrome bridge.
 *
 * Delivery selection is contextual instead of a permanent floating dock:
 * - desktop browse mounts a compact address control beside the marketplace tabs;
 * - mobile browse keeps a small full-width control under the search row;
 * - product/cart/checkout can open the same picker through the shared event;
 * - the mobile Marketplace close action is mounted into the sticky header row.
 *
 * MarketplacePage can be replaced once on mobile when responsive hooks settle,
 * so the observer deliberately keeps the portal targets synchronized while the
 * route is mounted instead of disconnecting after the first match.
 */
export function MarketplaceDeliveryLocationDock() {
  const route = useLocation();
  const navigate = useNavigate();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [headerRowTarget, setHeaderRowTarget] = useState<HTMLElement | null>(null);
  const [headerShellTarget, setHeaderShellTarget] = useState<HTMLElement | null>(null);
  const [locationSlotTarget, setLocationSlotTarget] = useState<HTMLElement | null>(null);
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
      setHeaderRowTarget(null);
      setHeaderShellTarget(null);
      setLocationSlotTarget(null);
      return;
    }

    const syncTargets = () => {
      const shell = document.querySelector<HTMLElement>('.marketplace-neutral > header > div');
      const row = shell?.firstElementChild instanceof HTMLElement ? shell.firstElementChild : null;
      const locationSlot = shell?.querySelector<HTMLElement>('[data-marketplace-location-slot]') ?? null;
      setHeaderShellTarget(current => (current === shell ? current : shell));
      setHeaderRowTarget(current => (current === row ? current : row));
      setLocationSlotTarget(current => (current === locationSlot ? current : locationSlot));
    };

    syncTargets();

    const observer = new MutationObserver(syncTargets);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => observer.disconnect();
  }, [route.pathname]);

  const goBack = () => {
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

  const marketplaceParams = new URLSearchParams(route.search);
  const tab = marketplaceParams.get('tab');
  const showBrowseLocation = route.pathname === '/marketplace' && (!tab || tab === 'browse');
  const showPicker = route.pathname.startsWith('/marketplace') && route.pathname !== '/marketplace/chat';

  const locationLabel = location?.label || 'Yetkazish manzilini tanlang';

  const desktopLocationControl = (
    <button
      type="button"
      onClick={() => setPickerOpen(true)}
      className={cn(
        'group flex h-9 w-56 min-w-0 items-center gap-2 rounded-xl border px-2.5 text-left transition lg:w-72 xl:w-80',
        'border-border/50 bg-muted/30 hover:border-foreground/20 hover:bg-muted/55',
      )}
      aria-label={location ? `Yetkazish manzili: ${location.label}` : 'Yetkazish manzilini tanlash'}
    >
      <span
        className={cn(
          'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition',
          location ? 'bg-foreground text-background' : 'bg-background text-muted-foreground shadow-sm',
        )}
      >
        <MapPin className="h-3.5 w-3.5" />
      </span>
      <span className="min-w-0 flex-1 truncate text-xs font-semibold text-foreground">
        {locationLabel}
      </span>
      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5" />
    </button>
  );

  const mobileLocationControl = (
    <div className="mt-2 md:hidden">
      <button
        type="button"
        onClick={() => setPickerOpen(true)}
        className="group flex h-10 w-full min-w-0 items-center gap-2.5 rounded-xl border border-border/50 bg-muted/30 px-2.5 text-left transition hover:bg-muted/55"
        aria-label={location ? `Yetkazish manzili: ${location.label}` : 'Yetkazish manzilini tanlash'}
      >
        <span
          className={cn(
            'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg',
            location ? 'bg-foreground text-background' : 'bg-background text-muted-foreground shadow-sm',
          )}
        >
          <MapPin className="h-3.5 w-3.5" />
        </span>
        <span className="min-w-0 flex-1 truncate text-xs font-semibold">{locationLabel}</span>
        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      </button>
    </div>
  );

  return (
    <>
      {route.pathname === '/marketplace' && headerRowTarget
        ? createPortal(
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="order-first h-11 w-11 shrink-0 rounded-2xl border-border/60 bg-background/90 shadow-sm md:hidden"
              onClick={goBack}
              aria-label="Marketplace’dan chiqish"
            >
              <X className="h-5 w-5" />
            </Button>,
            headerRowTarget,
          )
        : null}

      {showBrowseLocation && locationSlotTarget
        ? createPortal(desktopLocationControl, locationSlotTarget)
        : null}

      {showBrowseLocation && headerShellTarget
        ? createPortal(mobileLocationControl, headerShellTarget)
        : null}

      {showPicker && (
        <MarketplaceLocationPicker
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          value={location}
          onSelect={setLocation}
          title="Yetkazish manzilini tanlang"
        />
      )}
    </>
  );
}
