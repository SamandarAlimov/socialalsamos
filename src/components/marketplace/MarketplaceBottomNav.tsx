import {
  ClipboardList,
  Grid3X3,
  Heart,
  Plus,
  ShoppingBag,
  Store,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';

interface MarketplaceBottomNavProps {
  activeTab: 'browse' | 'orders' | 'selling' | 'saved';
  itemCount: number;
  savedCount: number;
  onBrowse: () => void;
  onCatalog: () => void;
  onCart: () => void;
  onSaved: () => void;
  onOrders: () => void;
}

export function MarketplaceBottomNav({
  activeTab,
  itemCount,
  savedCount,
  onBrowse,
  onCatalog,
  onCart,
  onSaved,
  onOrders,
}: MarketplaceBottomNavProps) {
  const navigate = useNavigate();

  const items = [
    {
      id: 'browse',
      label: 'Bozor',
      icon: Store,
      active: activeTab === 'browse',
      onClick: onBrowse,
      badge: 0,
    },
    {
      id: 'catalog',
      label: 'Katalog',
      icon: Grid3X3,
      active: false,
      onClick: onCatalog,
      badge: 0,
    },
    {
      id: 'cart',
      label: 'Savat',
      icon: ShoppingBag,
      active: false,
      onClick: onCart,
      badge: itemCount,
    },
    {
      id: 'saved',
      label: 'Saqlangan',
      icon: Heart,
      active: activeTab === 'saved',
      onClick: onSaved,
      badge: savedCount,
    },
    {
      id: 'orders',
      label: 'Buyurtma',
      icon: ClipboardList,
      active: activeTab === 'orders',
      onClick: onOrders,
      badge: 0,
    },
  ] as const;

  return (
    <>
      <button
        type="button"
        aria-label="Sotuvchi markazi"
        aria-current={activeTab === 'selling' ? 'page' : undefined}
        onClick={() => navigate('/marketplace?tab=selling')}
        className={cn(
          'fixed bottom-[calc(env(safe-area-inset-bottom)+88px)] right-4 z-50 flex h-12 items-center gap-2 rounded-full border px-4 text-xs font-extrabold backdrop-blur-3xl transition duration-200 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/30 md:hidden',
          activeTab === 'selling'
            ? 'border-foreground bg-foreground text-background shadow-[0_14px_34px_rgba(0,0,0,0.22)]'
            : 'border-foreground/[0.12] bg-background/[0.98] text-foreground shadow-[0_14px_34px_rgba(0,0,0,0.16)] ring-1 ring-foreground/[0.04]',
        )}
      >
        <Plus className="h-4 w-4" strokeWidth={2.3} />
        Sotish
      </button>

      <nav
        aria-label="Marketplace navigatsiyasi"
        className="fixed bottom-[calc(env(safe-area-inset-bottom)+12px)] left-1/2 z-50 flex w-[calc(100%-24px)] max-w-[480px] -translate-x-1/2 items-center justify-around rounded-[28px] border border-foreground/[0.12] bg-background/[0.98] px-2 py-2 text-foreground shadow-[0_18px_50px_rgba(0,0,0,0.20)] ring-1 ring-foreground/[0.04] backdrop-blur-3xl md:hidden"
      >
        {items.map(item => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              aria-current={item.active ? 'page' : undefined}
              aria-label={item.badge > 0 ? `${item.label}, ${item.badge}` : item.label}
              onClick={item.onClick}
              className={cn(
                'relative flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-[20px] px-1 py-2 text-[10px] font-bold transition duration-200 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/25',
                item.active
                  ? 'bg-foreground text-background shadow-[0_8px_22px_rgba(0,0,0,0.16)]'
                  : 'text-foreground/[0.70] hover:bg-foreground/[0.06] hover:text-foreground',
              )}
            >
              <span className="relative">
                <Icon
                  className="h-[21px] w-[21px]"
                  strokeWidth={item.active ? 2.5 : 2.15}
                />
                {item.badge > 0 && (
                  <span
                    className={cn(
                      'absolute -right-2.5 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[8px] font-extrabold shadow-sm ring-2 ring-background',
                      item.active
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
