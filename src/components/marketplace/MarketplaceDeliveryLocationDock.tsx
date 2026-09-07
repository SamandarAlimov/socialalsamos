import { useState } from 'react';
import { MapPin, Navigation, X } from 'lucide-react';
import { useLocation } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { MarketplaceLocationPicker } from '@/components/marketplace/MarketplaceLocationPicker';
import { useMarketplaceDeliveryLocation } from '@/hooks/useMarketplaceDeliveryLocation';
import { cn } from '@/lib/utils';

/**
 * A persistent Marketplace destination control. It intentionally lives outside
 * individual sheets so product pages, cart and checkout all read the same
 * delivery point through useMarketplaceDeliveryLocation.
 */
export function MarketplaceDeliveryLocationDock() {
  const route = useLocation();
  const [pickerOpen, setPickerOpen] = useState(false);
  const { location, setLocation } = useMarketplaceDeliveryLocation();

  if (!route.pathname.startsWith('/marketplace')) return null;
  if (route.pathname === '/marketplace/chat') return null;

  return (
    <>
      <div className="pointer-events-none fixed inset-x-0 bottom-20 z-40 flex justify-center px-3 md:bottom-5">
        <div
          className={cn(
            'pointer-events-auto flex max-w-[min(92vw,560px)] items-center gap-2 rounded-full border border-border/60 bg-background/92 p-1.5 shadow-2xl backdrop-blur-2xl',
            location && 'pr-1',
          )}
        >
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="flex min-w-0 flex-1 items-center gap-2.5 rounded-full px-2.5 py-1.5 text-left hover:bg-muted/55"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-foreground text-background">
              <MapPin className="h-3.5 w-3.5" />
            </span>
            <span className="min-w-0">
              <span className="block text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                Yetkazish manzili
              </span>
              <span className="block max-w-[42vw] truncate text-xs font-semibold sm:max-w-sm">
                {location?.label || 'Xaritadan manzil tanlang'}
              </span>
            </span>
          </button>

          <Button
            type="button"
            size="sm"
            className="h-9 shrink-0 rounded-full px-3 text-xs"
            onClick={() => setPickerOpen(true)}
          >
            <Navigation className="mr-1.5 h-3.5 w-3.5" />
            {location ? 'O‘zgartirish' : 'Tanlash'}
          </Button>

          {location && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0 rounded-full text-muted-foreground"
              onClick={() => setLocation(null)}
              aria-label="Yetkazish manzilini tozalash"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      <MarketplaceLocationPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        value={location}
        onSelect={setLocation}
        title="Yetkazish manzilini tanlang"
        description="Siz hozir turgan joy emas, buyurtma yetkazilishi kerak bo‘lgan istalgan manzilni xaritadan yoki qidiruvdan tanlang."
      />
    </>
  );
}
