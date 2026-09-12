import { FormEvent, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ChevronRight,
  Search,
  SlidersHorizontal,
  Sparkles,
  X,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { MarketplaceBottomNav } from '@/components/marketplace/MarketplaceBottomNav';
import { CategoryIcon } from '@/components/marketplace/CategoryIcon';
import { ProductCard } from '@/components/marketplace/ProductCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useCart, useCategories, useProducts, useSavedProducts } from '@/hooks/useMarketplace';
import { cn } from '@/lib/utils';
import '@/styles/marketplace-premium.css';

export default function MarketplaceCatalogPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [onlyWithProducts, setOnlyWithProducts] = useState(false);
  const { categories, isLoading: categoriesLoading, error: categoriesError, refresh: refreshCategories } = useCategories();
  const { products, isLoading: productsLoading } = useProducts('all', '');
  const { itemCount } = useCart();
  const { products: savedProducts } = useSavedProducts();

  const productCountByCategory = useMemo(() => {
    const counts = new Map<string, number>();
    products.forEach(product => {
      if (!product.category_id) return;
      counts.set(product.category_id, (counts.get(product.category_id) || 0) + 1);
    });
    return counts;
  }, [products]);

  const filteredCategories = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return categories.filter(category => {
      if (onlyWithProducts && (productCountByCategory.get(category.id) || 0) === 0) return false;
      if (!needle) return true;
      return category.name.toLocaleLowerCase().includes(needle);
    });
  }, [categories, onlyWithProducts, productCountByCategory, query]);

  const featuredProducts = useMemo(
    () => [...products]
      .sort((a, b) => {
        if (a.is_featured !== b.is_featured) return a.is_featured ? -1 : 1;
        return (b.views_count ?? 0) - (a.views_count ?? 0);
      })
      .slice(0, 8),
    [products],
  );

  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    const value = query.trim();
    if (value) navigate(`/marketplace?q=${encodeURIComponent(value)}`);
  };

  const openCategory = (slug: string) => {
    navigate(slug === 'all' ? '/marketplace' : `/marketplace?category=${encodeURIComponent(slug)}`);
  };

  return (
    <div className="marketplace-neutral min-h-screen min-w-0 overflow-x-clip bg-background pb-8">
      <header className="sticky top-0 z-40 border-b border-border/40 bg-background/94 backdrop-blur-2xl">
        <div className="mx-auto flex w-full max-w-7xl min-w-0 items-center gap-2.5 px-4 py-3 lg:px-6">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-11 w-11 shrink-0 rounded-2xl"
            onClick={() => navigate('/marketplace')}
            aria-label="Bozorga qaytish"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>

          <form onSubmit={submitSearch} className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              inputMode="search"
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="Mahsulot, brend yoki turkum qidiring"
              aria-label="Katalog qidiruvi"
              className="h-11 w-full rounded-2xl border-border/60 bg-muted/45 pl-10 pr-10 text-sm shadow-none transition focus:bg-background"
            />
            {query && (
              <button
                type="button"
                aria-label="Qidiruvni tozalash"
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground"
                onClick={() => setQuery('')}
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </form>

          <Button
            type="button"
            variant="outline"
            size="icon"
            className={cn(
              'relative h-11 w-11 shrink-0 rounded-2xl',
              onlyWithProducts && 'border-foreground/30 bg-foreground text-background',
            )}
            onClick={() => setShowFilters(true)}
            aria-label="Katalog filtrlari"
          >
            <SlidersHorizontal className="h-4 w-4" />
            {onlyWithProducts && (
              <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-destructive ring-2 ring-background" />
            )}
          </Button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl px-4 py-5 lg:px-6 lg:py-7">
        <section className="relative overflow-hidden rounded-[30px] border border-border/50 bg-card px-5 py-6 sm:px-7 sm:py-8 lg:px-9">
          <div className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-violet-500/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 left-1/3 h-52 w-52 rounded-full bg-blue-500/10 blur-3xl" />
          <div className="relative max-w-3xl">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-border/50 bg-background/70 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground backdrop-blur">
              <Sparkles className="h-3.5 w-3.5" />
              Alsamos katalogi
            </div>
            <h2 className="text-2xl font-black tracking-tight sm:text-3xl lg:text-4xl">
              Kerakli mahsulotni turkum bo‘yicha tez toping
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
              Elektronika, transport, uy-ro‘zg‘or, moda va boshqa yo‘nalishlar — barchasi tartibli katalogda.
            </p>
          </div>
        </section>

        <section className="mt-7">
          <div className="mb-4 flex items-end justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Turkumlar</p>
              <h2 className="mt-1 text-xl font-extrabold tracking-tight">Barcha kategoriyalar</h2>
            </div>
            {!categoriesLoading && (
              <span className="shrink-0 rounded-full bg-muted px-3 py-1 text-xs font-bold text-muted-foreground">
                {filteredCategories.length} ta
              </span>
            )}
          </div>

          {categoriesError ? (
            <div className="rounded-3xl border border-border/50 bg-card p-7 text-center">
              <p className="font-bold">Kategoriyalar yuklanmadi</p>
              <p className="mt-1 text-sm text-muted-foreground">{categoriesError}</p>
              <Button variant="outline" className="mt-4 rounded-xl" onClick={() => void refreshCategories()}>
                Qayta urinish
              </Button>
            </div>
          ) : categoriesLoading ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
              {Array.from({ length: 12 }).map((_, index) => (
                <div key={index} className="h-28 animate-pulse rounded-3xl bg-muted/60" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
              <CategoryCard
                label="Barcha mahsulotlar"
                subtitle={`${products.length} ta mahsulot`}
                icon={<Sparkles className="h-6 w-6" />}
                onClick={() => openCategory('all')}
                featured
              />
              {filteredCategories.map(category => {
                const categoryCount = productCountByCategory.get(category.id) || 0;
                return (
                  <CategoryCard
                    key={category.id}
                    label={category.name}
                    subtitle={categoryCount > 0 ? `${categoryCount} ta mahsulot` : 'Turkumni ochish'}
                    icon={<CategoryIcon slug={category.slug} name={category.name} className="h-6 w-6" />}
                    onClick={() => openCategory(category.slug)}
                  />
                );
              })}
            </div>
          )}

          {!categoriesLoading && !categoriesError && filteredCategories.length === 0 && (
            <div className="mt-3 rounded-3xl border border-dashed border-border/70 px-5 py-10 text-center">
              <Search className="mx-auto h-8 w-8 text-muted-foreground/40" />
              <p className="mt-3 font-bold">Bunday kategoriya topilmadi</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {onlyWithProducts ? 'Filtrni o‘chirib yoki boshqa nom bilan qidirib ko‘ring.' : 'Boshqa nom bilan qidirib ko‘ring.'}
              </p>
            </div>
          )}
        </section>

        <section className="mt-9">
          <div className="mb-4 flex items-end justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Tavsiya</p>
              <h2 className="mt-1 text-xl font-extrabold tracking-tight">Mashhur mahsulotlar</h2>
            </div>
            <button
              type="button"
              onClick={() => navigate('/marketplace')}
              className="flex shrink-0 items-center gap-1 text-xs font-bold text-muted-foreground transition hover:text-foreground"
            >
              Barchasini ko‘rish
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {productsLoading ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {Array.from({ length: 5 }).map((_, index) => (
                <div key={index} className="aspect-[3/4] animate-pulse rounded-2xl bg-muted/60" />
              ))}
            </div>
          ) : featuredProducts.length > 0 ? (
            <div className="grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {featuredProducts.map(product => (
                <div key={product.id} className="min-w-0">
                  <ProductCard
                    product={product}
                    onSelect={selected => navigate(`/marketplace/product/${selected.id}`)}
                  />
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-3xl border border-dashed border-border/70 px-5 py-10 text-center text-sm text-muted-foreground">
              Hozircha katalogda mahsulot yo‘q.
            </div>
          )}
        </section>
      </main>

      <MarketplaceBottomNav
        activeTab="catalog"
        itemCount={itemCount}
        savedCount={savedProducts.length}
      />

      <Sheet open={showFilters} onOpenChange={setShowFilters}>
        <SheetContent side="bottom" className="rounded-t-[30px] border-x border-t border-border/60 px-5 pb-[calc(env(safe-area-inset-bottom)+24px)] pt-5">
          <SheetHeader className="text-left">
            <SheetTitle>Katalog filtri</SheetTitle>
            <p className="text-xs text-muted-foreground">Katalogda ko‘rinadigan turkumlarni moslang.</p>
          </SheetHeader>

          <button
            type="button"
            role="switch"
            aria-checked={onlyWithProducts}
            onClick={() => setOnlyWithProducts(value => !value)}
            className="mt-5 flex w-full items-center justify-between gap-4 rounded-2xl border border-border/60 bg-muted/25 p-4 text-left"
          >
            <span className="min-w-0">
              <span className="block text-sm font-bold">Faqat mahsuloti bor turkumlar</span>
              <span className="mt-1 block text-xs leading-5 text-muted-foreground">Hozir mahsuloti yo‘q kategoriyalarni yashiradi.</span>
            </span>
            <span
              className={cn(
                'relative h-7 w-12 shrink-0 rounded-full transition',
                onlyWithProducts ? 'bg-foreground' : 'bg-muted-foreground/25',
              )}
            >
              <span
                className={cn(
                  'absolute top-1 h-5 w-5 rounded-full bg-background shadow-sm transition-transform',
                  onlyWithProducts ? 'translate-x-6' : 'translate-x-1',
                )}
              />
            </span>
          </button>

          <div className="mt-5 grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant="outline"
              className="h-11 rounded-xl"
              onClick={() => setOnlyWithProducts(false)}
              disabled={!onlyWithProducts}
            >
              Tozalash
            </Button>
            <Button type="button" className="h-11 rounded-xl" onClick={() => setShowFilters(false)}>
              Tayyor
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function CategoryCard({
  label,
  subtitle,
  icon,
  onClick,
  featured = false,
}: {
  label: string;
  subtitle: string;
  icon: React.ReactNode;
  onClick: () => void;
  featured?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group flex min-h-28 min-w-0 flex-col items-start justify-between rounded-3xl border p-4 text-left transition duration-200 hover:-translate-y-0.5 hover:shadow-lg',
        featured
          ? 'border-foreground/15 bg-foreground text-background'
          : 'border-border/50 bg-card hover:border-foreground/15',
      )}
    >
      <span
        className={cn(
          'flex h-11 w-11 items-center justify-center rounded-2xl transition group-hover:scale-105',
          featured ? 'bg-background/15 text-background' : 'bg-muted text-foreground',
        )}
      >
        {icon}
      </span>
      <span className="mt-4 min-w-0 w-full">
        <span className="block truncate text-sm font-extrabold">{label}</span>
        <span className={cn('mt-0.5 block truncate text-[10px]', featured ? 'text-background/70' : 'text-muted-foreground')}>
          {subtitle}
        </span>
      </span>
    </button>
  );
}
