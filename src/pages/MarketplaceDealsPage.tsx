import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  BadgePercent,
  Flame,
  Percent,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { CategoryIcon } from '@/components/marketplace/CategoryIcon';
import { MarketplaceBottomNav } from '@/components/marketplace/MarketplaceBottomNav';
import { MarketplaceSectionHeader } from '@/components/marketplace/MarketplaceSectionHeader';
import { ProductCard } from '@/components/marketplace/ProductCard';
import { Button } from '@/components/ui/button';
import {
  Product,
  useCart,
  useCategories,
  useProducts,
  useSavedProducts,
} from '@/hooks/useMarketplace';
import { cn } from '@/lib/utils';
import '@/styles/marketplace-premium.css';

type DealsView = 'all' | 'trending' | 'biggest';

function discountRate(product: Product) {
  const price = Number(product.price || 0);
  const compare = Number(product.compare_at_price || 0);
  if (price < 0 || compare <= price) return 0;
  return Math.round(((compare - price) / compare) * 100);
}

export default function MarketplaceDealsPage() {
  const navigate = useNavigate();
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [view, setView] = useState<DealsView>('all');
  const [categorySlug, setCategorySlug] = useState('all');

  const { categories } = useCategories();
  const {
    products,
    isLoading,
    error,
    refresh,
  } = useProducts('all', searchQuery);
  const { itemCount, addToCart } = useCart();
  const { products: savedProducts } = useSavedProducts();

  useEffect(() => {
    const timer = window.setTimeout(() => setSearchQuery(searchInput.trim()), 280);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const allDeals = useMemo(
    () =>
      products.filter(
        product => discountRate(product) > 0 && Number(product.quantity ?? 0) > 0,
      ),
    [products],
  );

  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    allDeals.forEach(product => {
      const slug = product.category?.slug;
      if (!slug) return;
      counts.set(slug, (counts.get(slug) || 0) + 1);
    });
    return counts;
  }, [allDeals]);

  const dealCategories = useMemo(
    () =>
      categories
        .filter(category => (categoryCounts.get(category.slug) || 0) > 0)
        .sort(
          (a, b) =>
            (categoryCounts.get(b.slug) || 0) - (categoryCounts.get(a.slug) || 0),
        ),
    [categories, categoryCounts],
  );

  const filteredDeals = useMemo(() => {
    let list = allDeals.filter(product => {
      if (categorySlug === 'all') return true;
      return product.category?.slug === categorySlug;
    });

    if (view === 'trending') {
      list = [...list].sort(
        (a, b) =>
          (b.views_count ?? 0) +
          (b.likes_count ?? 0) * 5 -
          ((a.views_count ?? 0) + (a.likes_count ?? 0) * 5),
      );
    } else if (view === 'biggest') {
      list = [...list].sort((a, b) => discountRate(b) - discountRate(a));
    } else {
      list = [...list].sort((a, b) => {
        const bScore =
          discountRate(b) * 12 +
          (b.views_count ?? 0) +
          (b.likes_count ?? 0) * 4 +
          (b.is_featured ? 120 : 0);
        const aScore =
          discountRate(a) * 12 +
          (a.views_count ?? 0) +
          (a.likes_count ?? 0) * 4 +
          (a.is_featured ? 120 : 0);
        return bScore - aScore;
      });
    }

    return list;
  }, [allDeals, categorySlug, view]);

  const maxDiscount = useMemo(
    () => allDeals.reduce((max, product) => Math.max(max, discountRate(product)), 0),
    [allDeals],
  );

  const selectedCategoryName =
    categorySlug === 'all'
      ? null
      : categories.find(category => category.slug === categorySlug)?.name || null;

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSearchQuery(searchInput.trim());
  };

  const openProduct = (product: Product) => {
    navigate(`/marketplace/product/${product.id}`);
  };

  return (
    <div className="marketplace-neutral min-h-screen min-w-0 overflow-x-clip bg-background pb-8">
      <MarketplaceSectionHeader
        activeSection="browse"
        searchValue={searchInput}
        onSearchValueChange={setSearchInput}
        onSearchSubmit={submitSearch}
        itemCount={itemCount}
        catalogLabel="Katalog"
      />

      <main className="mx-auto w-full max-w-7xl px-4 py-5 lg:px-6 lg:py-7">
        <section className="relative overflow-hidden rounded-[30px] border border-white/10 bg-zinc-950 px-5 py-6 text-white shadow-[0_24px_70px_rgba(0,0,0,0.16)] sm:px-7 sm:py-8 lg:px-9">
          <div className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-red-500/25 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 left-1/3 h-56 w-56 rounded-full bg-orange-400/15 blur-3xl" />
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(115deg,rgba(255,255,255,0.06),transparent_38%)]" />

          <div className="relative">
            <button
              type="button"
              onClick={() => navigate('/marketplace')}
              className="mb-5 inline-flex items-center gap-1.5 text-xs font-bold text-white/65 transition hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" />
              Bozorga qaytish
            </button>

            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
              <div className="max-w-3xl">
                <div className="inline-flex items-center gap-2 rounded-full border border-red-400/25 bg-red-500/15 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.14em] text-red-100 backdrop-blur">
                  <BadgePercent className="h-3.5 w-3.5" />
                  Alsamos Deals
                </div>
                <h1 className="mt-4 text-3xl font-black tracking-[-0.035em] sm:text-4xl lg:text-5xl">
                  Narxi tushgan eng yaxshi takliflar
                </h1>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-white/65 sm:text-base">
                  Faqat eski narxi bilan solishtirilganda real pasaygan mahsulotlar. Trenddagi,
                  elektronika, maishiy texnika va boshqa turkumlarni bitta joydan ko‘ring.
                </p>
              </div>

              <div className="grid grid-cols-3 gap-2 sm:min-w-[360px]">
                <DealStat label="Taklif" value={String(allDeals.length)} />
                <DealStat label="Gacha" value={maxDiscount > 0 ? `−${maxDiscount}%` : '—'} />
                <DealStat label="Turkum" value={String(dealCategories.length)} />
              </div>
            </div>
          </div>
        </section>

        <section className="mt-6 space-y-3">
          <div className="marketplace-x-rail -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
            <DealFilterChip
              active={view === 'all'}
              icon={<Sparkles className="h-4 w-4" />}
              label="Barchasi"
              onClick={() => setView('all')}
            />
            <DealFilterChip
              active={view === 'trending'}
              icon={<Flame className="h-4 w-4" />}
              label="Trendda"
              onClick={() => setView('trending')}
            />
            <DealFilterChip
              active={view === 'biggest'}
              icon={<TrendingUp className="h-4 w-4" />}
              label="Eng katta chegirma"
              onClick={() => setView('biggest')}
            />
          </div>

          {dealCategories.length > 0 && (
            <div className="marketplace-x-rail -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
              <button
                type="button"
                onClick={() => setCategorySlug('all')}
                className={cn(
                  'flex shrink-0 items-center gap-2 rounded-2xl border px-3 py-2 text-xs font-bold transition',
                  categorySlug === 'all'
                    ? 'border-foreground bg-foreground text-background'
                    : 'border-border/60 bg-card text-muted-foreground hover:border-foreground/25 hover:text-foreground',
                )}
              >
                <Percent className="h-4 w-4" />
                Barcha turkumlar
              </button>

              {dealCategories.map(category => (
                <button
                  type="button"
                  key={category.id}
                  onClick={() => setCategorySlug(category.slug)}
                  className={cn(
                    'flex shrink-0 items-center gap-2 rounded-2xl border px-3 py-2 text-xs font-bold transition',
                    categorySlug === category.slug
                      ? 'border-foreground bg-foreground text-background'
                      : 'border-border/60 bg-card text-muted-foreground hover:border-foreground/25 hover:text-foreground',
                  )}
                >
                  <CategoryIcon
                    slug={category.slug}
                    name={category.name}
                    className="h-4 w-4"
                  />
                  {category.name}
                  <span
                    className={cn(
                      'rounded-full px-1.5 py-0.5 text-[9px]',
                      categorySlug === category.slug
                        ? 'bg-background/15 text-background'
                        : 'bg-muted text-muted-foreground',
                    )}
                  >
                    {categoryCounts.get(category.slug) || 0}
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="mt-7">
          <div className="mb-4 flex items-end justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-red-500">
                Chegirmali mahsulotlar
              </p>
              <h2 className="mt-1 truncate text-xl font-black tracking-tight sm:text-2xl">
                {selectedCategoryName || (view === 'trending' ? 'Trenddagi takliflar' : view === 'biggest' ? 'Eng katta chegirmalar' : 'Barcha takliflar')}
              </h2>
            </div>
            {!isLoading && (
              <span className="shrink-0 rounded-full bg-muted px-3 py-1.5 text-xs font-bold text-muted-foreground">
                {filteredDeals.length} ta
              </span>
            )}
          </div>

          {error ? (
            <div className="rounded-3xl border border-border/50 bg-card px-5 py-12 text-center">
              <p className="font-extrabold">Chegirmalar yuklanmadi</p>
              <p className="mt-1 text-sm text-muted-foreground">{error}</p>
              <Button variant="outline" className="mt-4 rounded-xl" onClick={() => void refresh()}>
                Qayta urinish
              </Button>
            </div>
          ) : isLoading ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {Array.from({ length: 10 }).map((_, index) => (
                <div key={index} className="aspect-[3/4] animate-pulse rounded-2xl bg-muted/60" />
              ))}
            </div>
          ) : filteredDeals.length > 0 ? (
            <div className="grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {filteredDeals.map(product => (
                <div key={product.id} className="min-w-0">
                  <ProductCard
                    product={product}
                    onSelect={openProduct}
                    onAddToCart={addToCart}
                    onLikeChange={() => void refresh()}
                  />
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-[28px] border border-dashed border-border/70 px-5 py-14 text-center">
              <BadgePercent className="mx-auto h-9 w-9 text-muted-foreground/40" />
              <p className="mt-3 font-extrabold">Mos chegirmali mahsulot topilmadi</p>
              <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-muted-foreground">
                Qidiruvni tozalang yoki boshqa turkumni tanlang.
              </p>
              <Button
                variant="outline"
                className="mt-4 rounded-xl"
                onClick={() => {
                  setSearchInput('');
                  setSearchQuery('');
                  setCategorySlug('all');
                  setView('all');
                }}
              >
                Filtrlarni tozalash
              </Button>
            </div>
          )}
        </section>
      </main>

      <MarketplaceBottomNav
        activeTab="browse"
        itemCount={itemCount}
        savedCount={savedProducts.length}
      />
    </div>
  );
}

function DealStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.07] px-3 py-3 backdrop-blur">
      <p className="text-lg font-black tabular-nums sm:text-xl">{value}</p>
      <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-white/45">
        {label}
      </p>
    </div>
  );
}

function DealFilterChip({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex shrink-0 items-center gap-2 rounded-2xl border px-3.5 py-2.5 text-xs font-extrabold transition',
        active
          ? 'border-red-500 bg-red-500 text-white shadow-[0_8px_24px_rgba(239,68,68,0.20)]'
          : 'border-border/60 bg-card text-muted-foreground hover:border-red-500/30 hover:text-foreground',
      )}
    >
      {icon}
      {label}
    </button>
  );
}
