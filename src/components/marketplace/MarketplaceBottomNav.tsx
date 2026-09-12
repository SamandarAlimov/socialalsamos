import {
  ClipboardList,
  Grid3X3,
  Heart,
  ShoppingBag,
  Store,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';

export type MarketplaceNavSection =
  | 'browse'
  | 'catalog'
  | 'cart'
  | 'saved'
  | 'orders'
  | 'selling';

interface MarketplaceBottomNavProps {
  activeTab: MarketplaceNavSection;
  itemCount?: number;
  savedCount?: number;
  onBrowse?: () => void;
  onSaved?: () => void;
  onOrders?: () => void;
}

export function MarketplaceBottomNav({
  activeTab,
  itemCount = 0,
  savedCount = 0,
  onBrowse,
  onSaved,
  onOrders,
}: MarketplaceBottomNavProps) {
  const navigate = useNavigate();

  const items = [
    {
      id: 'browse' as const,
      label: 'Bozor',
      icon: Store,
      onClick: () => (onBrowse ? onBrowse() : navigate('/marketplace')),
      badge: 0,
    },
    {
      id: 'catalog' as const,
      label: 'Katalog',
      icon: Grid3X3,
      onClick: () => navigate('/marketplace/catalog'),
      badge: 0,
    },
    {
      id: 'cart' as const,
      label: 'Savat',
      icon: ShoppingBag,
      onClick: () => navigate('/marketplace/cart'),
      badge: itemCount,
    },
    {
      id: 'saved' as const,
      label: 'Saqlangan',
      icon: Heart,
      onClick: () => (onSaved ? onSaved() : navigate('/marketplace?tab=saved')),
      badge: savedCount,
    },
    {
      id: 'orders' as const,
      label: 'Buyurtmalar',
      icon: ClipboardList,
      onClick: () => (onOrders ? onOrders() : navigate('/marketplace?tab=orders')),
      badge: 0,
    },
  ];

  return (
    <>
      <div aria-hidden="true" className="h-24 shrink-0" />

      <nav
        aria-label="Marketplace navigatsiyasi"
        className="fixed bottom-[calc(env(safe-area-inset-bottom)+12px)] left-1/2 z-[70] flex w-[calc(100%-24px)] max-w-[900px] -translate-x-1/2 items-stretch justify-around rounded-[28px] border border-foreground/[0.12] bg-background/[0.97] px-1.5 py-2 text-foreground shadow-[0_18px_50px_rgba(0,0,0,0.20)] ring-1 ring-foreground/[0.04] backdrop-blur-3xl sm:px-2.5"
      >
        {items.map(item => {
          const Icon = item.icon;
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              aria-current={active ? 'page' : undefined}
              aria-label={item.badge > 0 ? `${item.label}, ${item.badge}` : item.label}
              onClick={item.onClick}
              className={cn(
                'relative flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-[20px] px-0.5 py-2 text-[9px] font-bold transition duration-200 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/25 sm:px-1 sm:text-[10px] md:flex-row md:gap-2 md:py-2.5 md:text-xs',
                active
                  ? 'bg-foreground text-background shadow-[0_8px_22px_rgba(0,0,0,0.16)]'
                  : 'text-foreground/[0.70] hover:bg-foreground/[0.06] hover:text-foreground',
              )}
            >
              <span className="relative shrink-0">
                <Icon
                  className="h-5 w-5 md:h-[21px] md:w-[21px]"
                  strokeWidth={active ? 2.5 : 2.15}
                />
                {item.badge > 0 && (
                  <span
                    className={cn(
                      'absolute -right-2.5 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[8px] font-extrabold shadow-sm ring-2 ring-background',
                      active
                        ? 'bg-background text-foreground'
                        : 'bg-destructive text-destructive-foreground',
                    )}
                  >
                    {item.badge > 99 ? '99+' : item.badge}
                  </span>
                )}
              </span>
              <span className="max-w-full truncate">{item.label}</span>
            </button>
          );
        })}
      </nav>
    </>
  );
}
