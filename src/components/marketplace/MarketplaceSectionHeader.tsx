import { FormEvent, ReactNode } from 'react';
import {
  ArrowLeft,
  ClipboardList,
  Grid3X3,
  Heart,
  Package,
  Search,
  ShoppingBag,
  SlidersHorizontal,
  Store,
  X,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { MarketplaceNavSection } from '@/components/marketplace/MarketplaceBottomNav';

interface MarketplaceSectionHeaderProps {
  activeSection: MarketplaceNavSection;
  searchValue: string;
  onSearchValueChange: (value: string) => void;
  onSearchSubmit?: (event: FormEvent<HTMLFormElement>) => void;
  onFilterClick?: () => void;
  hideFilter?: boolean;
  filterCount?: number;
  itemCount?: number;
  catalogLabel?: string;
  searchOverlay?: ReactNode;
  onSearchFocus?: () => void;
  onSearchEscape?: () => void;
}

const desktopTabs = [
  { id: 'browse' as const, label: 'Bozor', icon: Store, href: '/marketplace' },
  { id: 'orders' as const, label: 'Buyurtmalar', icon: ClipboardList, href: '/marketplace?tab=orders' },
  { id: 'saved' as const, label: 'Saqlangan', icon: Heart, href: '/marketplace?tab=saved' },
  { id: 'selling' as const, label: 'Sotuvchi markazi', icon: Package, href: '/marketplace?tab=selling' },
];

export function MarketplaceSectionHeader({
  activeSection,
  searchValue,
  onSearchValueChange,
  onSearchSubmit,
  onFilterClick,
  hideFilter = false,
  filterCount = 0,
  itemCount = 0,
  catalogLabel = 'Katalog',
  searchOverlay,
  onSearchFocus,
  onSearchEscape,
}: MarketplaceSectionHeaderProps) {
  const navigate = useNavigate();
  const handleFilterClick = onFilterClick ?? (() => navigate('/marketplace'));

  return (
    <header className="sticky top-0 z-40 border-b border-border/40 bg-background/92 backdrop-blur-2xl">
      <div className="mx-auto w-full max-w-7xl min-w-0 px-4 py-3 lg:px-6">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="hidden min-w-0 items-center gap-3 md:flex">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-foreground text-background">
              <Store className="h-5 w-5" />
            </span>
            <div className="hidden min-w-0 xl:block">
              <h1 className="truncate text-lg font-extrabold tracking-tight">Alsamos Bozor</h1>
              <p className="truncate text-[11px] text-muted-foreground">Xavfsiz savdo · keng katalog</p>
            </div>
          </div>

          <Button
            variant="ghost"
            size="icon"
            className="h-11 w-11 shrink-0 rounded-2xl border border-border/50 bg-background shadow-sm md:hidden"
            onClick={() => {
              if (window.history.length > 1) navigate(-1);
              else navigate('/marketplace');
            }}
            aria-label="Ortga qaytish"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>

          <form
            onSubmit={onSearchSubmit}
            className="relative min-w-0 flex-1 md:ml-1 xl:ml-3"
          >
            <Search className="pointer-events-none absolute left-3.5 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              inputMode="search"
              value={searchValue}
              onChange={event => onSearchValueChange(event.target.value)}
              onFocus={onSearchFocus}
              onKeyDown={event => {
                if (event.key === 'Escape') {
                  onSearchEscape?.();
                  event.currentTarget.blur();
                }
              }}
              placeholder="Mahsulot, brend yoki turkum qidiring"
              aria-label="Marketplace qidiruvi"
              className="h-11 w-full rounded-2xl border-border/60 bg-muted/45 pl-10 pr-10 text-sm shadow-none transition focus:bg-background"
            />
            {searchValue && (
              <button
                type="button"
                aria-label="Qidiruvni tozalash"
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground"
                onMouseDown={event => event.preventDefault()}
                onClick={() => onSearchValueChange('')}
              >
                <X className="h-4 w-4" />
              </button>
            )}
            {searchOverlay}
          </form>

          <Button
            variant="outline"
            className={cn(
              'hidden h-11 shrink-0 rounded-2xl px-3 sm:inline-flex',
              activeSection === 'catalog' && 'border-foreground/20 bg-foreground/[0.05]',
            )}
            onClick={() => navigate('/marketplace/catalog')}
            aria-label="Katalogni ochish"
          >
            <Grid3X3 className="h-4 w-4 xl:mr-1.5" />
            <span className="hidden max-w-28 truncate text-xs font-semibold xl:inline">{catalogLabel}</span>
          </Button>

          {!hideFilter && (
            <Button
              variant="outline"
              size="icon"
              className={cn(
                'relative h-11 w-11 shrink-0 rounded-2xl',
                !onFilterClick && 'hidden md:inline-flex',
                filterCount > 0 && 'border-foreground/30 bg-foreground text-background',
              )}
              onClick={handleFilterClick}
              aria-label="Filtrlar"
            >
              <SlidersHorizontal className="h-4 w-4" />
              {filterCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold text-destructive-foreground">
                  {filterCount > 99 ? '99+' : filterCount}
                </span>
              )}
            </Button>
          )}

          <Button
            variant="outline"
            size="icon"
            className={cn(
              'relative hidden h-11 w-11 shrink-0 rounded-2xl sm:inline-flex',
              activeSection === 'cart' && 'border-foreground bg-foreground text-background',
            )}
            onClick={() => navigate('/marketplace/cart')}
            aria-label="Savat"
          >
            <ShoppingBag className="h-4 w-4" />
            {itemCount > 0 && (
              <span
                className={cn(
                  'absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[9px] font-bold',
                  activeSection === 'cart'
                    ? 'bg-background text-foreground ring-1 ring-border'
                    : 'bg-foreground text-background',
                )}
              >
                {itemCount > 99 ? '99+' : itemCount}
              </span>
            )}
          </Button>

          <Button
            className="hidden h-11 shrink-0 rounded-2xl px-4 text-xs font-extrabold md:inline-flex"
            onClick={() => navigate('/marketplace?tab=selling')}
          >
            Sotish
          </Button>
        </div>

        <div className="mt-2 hidden min-w-0 items-center justify-between gap-3 md:flex">
          <nav
            className="flex min-w-0 items-center gap-1 rounded-xl bg-muted/35 p-1"
            aria-label="Marketplace bo‘limlari"
          >
            {desktopTabs.map(tab => {
              const Icon = tab.icon;
              const active = activeSection === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => navigate(tab.href)}
                  className={cn(
                    'flex min-w-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition lg:px-3',
                    active
                      ? 'bg-background text-foreground shadow-sm ring-1 ring-border/40'
                      : 'text-muted-foreground hover:bg-background/60 hover:text-foreground',
                  )}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{tab.label}</span>
                </button>
              );
            })}
          </nav>
          <div data-marketplace-location-slot className="flex min-w-0 shrink-0 justify-end" />
        </div>
      </div>
    </header>
  );
}
