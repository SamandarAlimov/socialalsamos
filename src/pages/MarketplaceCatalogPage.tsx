import { FormEvent, useMemo, useState, type ReactNode } from 'react';
import {
  ArrowRight,
  BadgePercent,
  ChevronRight,
  Clock3,
  Flame,
  Grid3X3,
  Search,
  Sparkles,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { MarketplaceBottomNav } from '@/components/marketplace/MarketplaceBottomNav';
import { MarketplaceSectionHeader } from '@/components/marketplace/MarketplaceSectionHeader';
import { CategoryIcon } from '@/components/marketplace/CategoryIcon';
import { ProductCard } from '@/components/marketplace/ProductCard';
import { Button } from '@/components/ui/button';
import {
  type Category,
  type Product,
  useCart,
  useCategories,
  useProducts,
  useSavedProducts,
} from '@/hooks/useMarketplace';
import {
  catalogCategoryLabel,
  categoryMatchesCatalogQuery,
  getCatalogGuide,
} from '@/lib/marketplaceCatalog';
import { cn } from '@/lib/utils';
import '@/styles/marketplace-premium.css';

const MAX_PREVIEW_PRODUCTS = 5;

export default function MarketplaceCatalogPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [selectedCategorySlug, setSelectedCategorySlug] = useState('all');

  const {
    categories,
    isLoading: categoriesLoading,
    error: categoriesError,
    refresh: refreshCategories,
  } = useCategories();
  const { products, isLoading: productsLoading } = useProducts('all', '');
  const { itemCount, addToCart } = useCart();
  const { products: savedProducts } = useSavedProducts();

  const productCountByCategory = useMemo(() => {
    const counts = new Map<string, number>();
    products.forEach(product => {
      if (!product.category_id) return;
      counts.set(product.category_id, (counts.get(product.category_id) || 0) + 1);
    });
    return counts;
  }, [products]);

  const filteredCategories = useMemo(
    () =>
      categories.filter(category =>
        categoryMatchesCatalogQuery(category, query),
      ),
    [categories, query],
  );

  const selectedCategory = useMemo(
    () =>
      selectedCategorySlug === 'all'
        ? null
        : categories.find(category => category.slug === selectedCategorySlug) ?? null,
    [categories, selectedCategorySlug],
  );

  const selectedGuide = useMemo(
    () => getCatalogGuide(selectedCategory),
    [selectedCategory],
  );

  const selectedProducts = useMemo(() => {
    const scoped = selectedCategory
      ? products.filter(product => product.category_id === selectedCategory.id)
      : products;

    return [...scoped].sort((a, b) => {
      const score = (product: Product) =>
        (product.is_featured ? 1000 : 0) +
        (product.views_count ?? 0) +
        (product.likes_count ?? 0) * 4 +
        Number(product.seller?.rating ?? 0) * 25 +
        (Number(product.quantity ?? 0) > 0 ? 80 : 0);

      return score(b) - score(a);
    });
  }, [products, selectedCategory]);

  const previewProducts = selectedProducts.slice(0, MAX_PREVIEW_PRODUCTS);

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = query.trim();
    if (value) navigate(`/marketplace?q=${encodeURIComponent(value)}`);
  };

  const openCategoryProducts = (category?: Category | null) => {
    if (!category) {
      navigate('/marketplace');
      return;
    }

    navigate(`/marketplace?category=${encodeURIComponent(category.slug)}`);
  };

  const openCatalogSearch = (term: string, category?: Category | null) => {
    const params = new URLSearchParams();
    if (category) params.set('category', category.slug);

    const needle = term.trim().toLocaleLowerCase();
    const hasMatchingProduct = products.some(product => {
      if (category && product.category_id !== category.id) return false;
      const haystack = `${product.title} ${product.description || ''}`.toLocaleLowerCase();
      return haystack.includes(needle);
    });

    if (hasMatchingProduct) params.set('q', term);
    navigate(`/marketplace?${params.toString()}`);
  };

  return (
    <div className="marketplace-neutral min-h-screen min-w-0 overflow-x-clip bg-background pb-8">
      <MarketplaceSectionHeader
        activeSection="catalog"
        searchValue={query}
        onSearchValueChange={value => {
          setQuery(value);
          if (value.trim()) setSelectedCategorySlug('all');
        }}
        onSearchSubmit={submitSearch}
        hideFilter
        itemCount={itemCount}
        catalogLabel="Katalog"
      />

      <main className="mx-auto w-full max-w-7xl px-4 py-4 lg:px-6 lg:py-6">
        <section aria-label="Katalog tezkor bo‘limlari">
          <div className="marketplace-x-rail -mx-4 flex gap-2 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
            <CatalogShortcut
              icon={<BadgePercent className="h-4 w-4" />}
              label="Chegirmalar"
              description="Narxi tushganlar"
              accent="red"
              onClick={() => navigate('/marketplace/deals')}
            />
            <CatalogShortcut
              icon={<Flame className="h-4 w-4" />}
              label="Ommabop"
              description="Ko‘p qiziqish olganlar"
              onClick={() => navigate('/marketplace?sort=popular')}
            />
            <CatalogShortcut
              icon={<Clock3 className="h-4 w-4" />}
              label="Yangi"
              description="Yangi e’lonlar"
              onClick={() => navigate('/marketplace?sort=newest')}
            />
            <CatalogShortcut
              icon={<Grid3X3 className="h-4 w-4" />}
              label="Barcha mahsulotlar"
              description={`${products.length} ta mahsulot`}
              onClick={() => navigate('/marketplace')}
            />
          </div>
        </section>

        <section className="mt-4 overflow-hidden rounded-[28px] border border-border/55 bg-card shadow-[0_18px_60px_rgba(15,23,42,0.055)]">
          <div className="border-b border-border/45 px-4 py-4 sm:px-5 lg:hidden">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">
                  Katalog
                </p>
                <h1 className="mt-1 text-xl font-black tracking-tight">
                  {selectedCategory ? catalogCategoryLabel(selectedCategory) : 'Barcha turkumlar'}
                </h1>
              </div>
              <span className="rounded-full bg-muted px-2.5 py-1 text-[10px] font-bold text-muted-foreground">
                {selectedCategory
                  ? productCountByCategory.get(selectedCategory.id) || 0
                  : products.length}{' '}
                ta
              </span>
            </div>
          </div>

          <div className="lg:grid lg:grid-cols-[260px_minmax(0,1fr)]">
            <aside className="border-b border-border/45 bg-muted/[0.16] lg:border-b-0 lg:border-r">
              <div className="lg:sticky lg:top-[116px]">
                <div className="hidden px-4 pb-2 pt-5 lg:block">
                  <p className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">
                    Turkumlar
                  </p>
                  <h2 className="mt-1 text-base font-black tracking-tight">Katalog</h2>
                </div>

                <div className="marketplace-x-rail flex gap-2 overflow-x-auto px-3 py-3 lg:max-h-[calc(100vh-160px)] lg:flex-col lg:gap-1 lg:overflow-y-auto lg:px-3 lg:pb-5 lg:pt-2">
                  <CategoryNavItem
                    active={selectedCategorySlug === 'all'}
                    label="Barcha turkumlar"
                    count={products.length}
                    icon={<Sparkles className="h-4 w-4" />}
                    onClick={() => setSelectedCategorySlug('all')}
                  />

                  {filteredCategories.map(category => (
                    <CategoryNavItem
                      key={category.id}
                      active={selectedCategorySlug === category.slug}
                      label={catalogCategoryLabel(category)}
                      count={productCountByCategory.get(category.id) || 0}
                      icon={
                        <CategoryIcon
                          slug={category.slug}
                          name={category.name}
                          className="h-4 w-4"
                        />
                      }
                      onClick={() => setSelectedCategorySlug(category.slug)}
                    />
                  ))}
                </div>
              </div>
            </aside>

            <div className="min-w-0 p-4 sm:p-5 lg:p-6">
              {categoriesError ? (
                <CatalogError
                  message={categoriesError}
                  onRetry={() => void refreshCategories()}
                />
              ) : categoriesLoading ? (
                <CatalogSkeleton />
              ) : filteredCategories.length === 0 ? (
                <CatalogEmpty
                  query={query}
                  onClear={() => setQuery('')}
                />
              ) : selectedCategory ? (
                <CategoryDetail
                  category={selectedCategory}
                  count={productCountByCategory.get(selectedCategory.id) || 0}
                  guide={selectedGuide}
                  products={previewProducts}
                  productsLoading={productsLoading}
                  onOpenAll={() => openCategoryProducts(selectedCategory)}
                  onOpenSearch={term => openCatalogSearch(term, selectedCategory)}
                  onProductSelect={product =>
                    navigate(`/marketplace/product/${product.id}`)
                  }
                  onAddToCart={addToCart}
                />
              ) : (
                <AllCategoriesDirectory
                  categories={filteredCategories}
                  productCountByCategory={productCountByCategory}
                  products={previewProducts}
                  productsLoading={productsLoading}
                  onSelectCategory={slug => setSelectedCategorySlug(slug)}
                  onOpenSearch={openCatalogSearch}
                  onProductSelect={product =>
                    navigate(`/marketplace/product/${product.id}`)
                  }
                  onAddToCart={addToCart}
                  onOpenAllProducts={() => navigate('/marketplace')}
                />
              )}
            </div>
          </div>
        </section>
      </main>

      <MarketplaceBottomNav
        activeTab="catalog"
        itemCount={itemCount}
        savedCount={savedProducts.length}
      />
    </div>
  );
}

function CatalogShortcut({
  icon,
  label,
  description,
  onClick,
  accent = 'neutral',
}: {
  icon: ReactNode;
  label: string;
  description: string;
  onClick: () => void;
  accent?: 'neutral' | 'red';
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group flex min-w-[188px] shrink-0 items-center gap-3 rounded-2xl border px-3.5 py-3 text-left transition-all hover:-translate-y-0.5 hover:shadow-md',
        accent === 'red'
          ? 'border-red-500/20 bg-red-500/[0.055]'
          : 'border-border/55 bg-card hover:border-foreground/15',
      )}
    >
      <span
        className={cn(
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
          accent === 'red'
            ? 'bg-red-500 text-white'
            : 'bg-zinc-950 text-white dark:bg-white dark:text-zinc-950',
        )}
      >
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-xs font-extrabold">{label}</span>
        <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">
          {description}
        </span>
      </span>
      <ChevronRight className="ml-auto h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </button>
  );
}

function CategoryNavItem({
  active,
  label,
  count,
  icon,
  onClick,
}: {
  active: boolean;
  label: string;
  count: number;
  icon: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'group flex min-w-[168px] shrink-0 items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition lg:min-w-0 lg:w-full',
        active
          ? 'border-zinc-950 bg-zinc-950 text-white shadow-sm dark:border-white dark:bg-white dark:text-zinc-950'
          : 'border-border/50 bg-background text-foreground hover:border-foreground/15 hover:bg-background/90',
      )}
    >
      <span
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
          active ? 'bg-white/12 dark:bg-zinc-950/10' : 'bg-muted/65',
        )}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-extrabold">{label}</span>
        <span
          className={cn(
            'mt-0.5 block text-[9px]',
            active ? 'text-white/60 dark:text-zinc-950/55' : 'text-muted-foreground',
          )}
        >
          {count} ta mahsulot
        </span>
      </span>
      <ChevronRight
        className={cn(
          'hidden h-3.5 w-3.5 shrink-0 transition lg:block',
          active ? 'opacity-80' : 'text-muted-foreground group-hover:translate-x-0.5',
        )}
      />
    </button>
  );
}

function CategoryDetail({
  category,
  count,
  guide,
  products,
  productsLoading,
  onOpenAll,
  onOpenSearch,
  onProductSelect,
  onAddToCart,
}: {
  category: Category;
  count: number;
  guide: ReturnType<typeof getCatalogGuide>;
  products: Product[];
  productsLoading: boolean;
  onOpenAll: () => void;
  onOpenSearch: (term: string) => void;
  onProductSelect: (product: Product) => void;
  onAddToCart: (productId: string) => boolean | Promise<boolean>;
}) {
  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 border-b border-border/45 pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <CategoryIcon
            slug={category.slug}
            name={category.name}
            boxed
            className="h-5 w-5"
          />
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">
              Katalog
            </p>
            <h1 className="truncate text-2xl font-black tracking-tight sm:text-3xl">
              {catalogCategoryLabel(category)}
            </h1>
            <p className="mt-1 text-xs text-muted-foreground">
              {count} ta mahsulot
            </p>
          </div>
        </div>

        <Button
          type="button"
          className="h-10 rounded-xl px-4 text-xs font-extrabold"
          onClick={onOpenAll}
        >
          Barcha mahsulotlar
          <ArrowRight className="ml-1.5 h-4 w-4" />
        </Button>
      </div>

      {guide ? (
        <div>
          <div className="mb-4">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">
              Yo‘nalishlar
            </p>
            <h2 className="mt-1 text-lg font-black tracking-tight">
              {guide.label} bo‘yicha tanlang
            </h2>
          </div>

          <div className="grid gap-x-8 gap-y-7 sm:grid-cols-2 xl:grid-cols-3">
            {guide.groups.map(group => (
              <div key={group.title} className="min-w-0">
                <h3 className="text-sm font-extrabold tracking-tight">{group.title}</h3>
                <div className="mt-2.5 space-y-1">
                  {group.items.map(item => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => onOpenSearch(item)}
                      className="group flex w-full items-center justify-between gap-2 rounded-lg px-1 py-1.5 text-left text-sm text-muted-foreground transition hover:bg-muted/45 hover:text-foreground"
                    >
                      <span className="truncate">{item}</span>
                      <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-0 transition group-hover:translate-x-0.5 group-hover:opacity-100" />
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-border/50 bg-muted/[0.22] p-4">
          <p className="text-sm font-extrabold">Turkum ichida qidiring</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Hozir bu turkum uchun alohida ichki bo‘limlar hali shakllanmagan.
            Quyidagi mashhur mahsulotlardan boshlashingiz mumkin.
          </p>
        </div>
      )}

      <ProductPreviewSection
        title="Mashhur mahsulotlar"
        products={products}
        isLoading={productsLoading}
        onOpenAll={onOpenAll}
        onProductSelect={onProductSelect}
        onAddToCart={onAddToCart}
      />
    </div>
  );
}

function AllCategoriesDirectory({
  categories,
  productCountByCategory,
  products,
  productsLoading,
  onSelectCategory,
  onOpenSearch,
  onProductSelect,
  onAddToCart,
  onOpenAllProducts,
}: {
  categories: Category[];
  productCountByCategory: Map<string, number>;
  products: Product[];
  productsLoading: boolean;
  onSelectCategory: (slug: string) => void;
  onOpenSearch: (term: string, category?: Category | null) => void;
  onProductSelect: (product: Product) => void;
  onAddToCart: (productId: string) => boolean | Promise<boolean>;
  onOpenAllProducts: () => void;
}) {
  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between gap-4 border-b border-border/45 pb-5">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">
            Turkumlar
          </p>
          <h1 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">
            Barcha turkumlar
          </h1>
        </div>
        <span className="rounded-full bg-muted px-3 py-1.5 text-xs font-bold text-muted-foreground">
          {categories.length} ta
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {categories.map(category => {
          const guide = getCatalogGuide(category);
          const count = productCountByCategory.get(category.id) || 0;

          return (
            <div
              key={category.id}
              className="group rounded-[22px] border border-border/50 bg-background p-4 transition hover:border-foreground/15 hover:shadow-[0_12px_34px_rgba(15,23,42,0.055)]"
            >
              <button
                type="button"
                onClick={() => onSelectCategory(category.slug)}
                className="flex w-full items-center gap-3 text-left"
              >
                <CategoryIcon
                  slug={category.slug}
                  name={category.name}
                  boxed
                  className="h-5 w-5"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-extrabold">
                    {catalogCategoryLabel(category)}
                  </span>
                  <span className="mt-0.5 block text-[10px] text-muted-foreground">
                    {count > 0 ? `${count} ta mahsulot` : 'Turkumni ochish'}
                  </span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </button>

              {guide && (
                <div className="mt-3 border-t border-border/40 pt-3">
                  <div className="flex flex-wrap gap-1.5">
                    {guide.groups
                      .flatMap(group => group.items)
                      .slice(0, 4)
                      .map(item => (
                        <button
                          key={item}
                          type="button"
                          onClick={() => onOpenSearch(item, category)}
                          className="rounded-full bg-muted/60 px-2.5 py-1 text-[10px] font-semibold text-muted-foreground transition hover:bg-muted hover:text-foreground"
                        >
                          {item}
                        </button>
                      ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <ProductPreviewSection
        title="Katalogda ommabop"
        products={products}
        isLoading={productsLoading}
        onOpenAll={onOpenAllProducts}
        onProductSelect={onProductSelect}
        onAddToCart={onAddToCart}
      />
    </div>
  );
}

function ProductPreviewSection({
  title,
  products,
  isLoading,
  onOpenAll,
  onProductSelect,
  onAddToCart,
}: {
  title: string;
  products: Product[];
  isLoading: boolean;
  onOpenAll: () => void;
  onProductSelect: (product: Product) => void;
  onAddToCart: (productId: string) => boolean | Promise<boolean>;
}) {
  return (
    <section>
      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">
            Tanlangan
          </p>
          <h2 className="mt-1 text-lg font-black tracking-tight">{title}</h2>
        </div>
        <button
          type="button"
          onClick={onOpenAll}
          className="flex shrink-0 items-center gap-1 text-xs font-bold text-muted-foreground transition hover:text-foreground"
        >
          Ko‘proq
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
          {Array.from({ length: 5 }).map((_, index) => (
            <div
              key={index}
              className="aspect-[3/4] animate-pulse rounded-2xl bg-muted/60"
            />
          ))}
        </div>
      ) : products.length > 0 ? (
        <div className="grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
          {products.map(product => (
            <div key={product.id} className="min-w-0">
              <ProductCard
                product={product}
                onSelect={onProductSelect}
                onAddToCart={onAddToCart}
              />
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-border/70 px-5 py-8 text-center text-sm text-muted-foreground">
          Hozircha bu turkumda mahsulot yo‘q.
        </div>
      )}
    </section>
  );
}

function CatalogError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="rounded-3xl border border-border/50 bg-background p-8 text-center">
      <p className="font-extrabold">Katalog yuklanmadi</p>
      <p className="mx-auto mt-1 max-w-lg text-sm text-muted-foreground">{message}</p>
      <Button variant="outline" className="mt-4 rounded-xl" onClick={onRetry}>
        Qayta urinish
      </Button>
    </div>
  );
}

function CatalogEmpty({
  query,
  onClear,
}: {
  query: string;
  onClear: () => void;
}) {
  return (
    <div className="rounded-3xl border border-dashed border-border/70 px-5 py-12 text-center">
      <Search className="mx-auto h-8 w-8 text-muted-foreground/40" />
      <p className="mt-3 font-extrabold">Mos turkum topilmadi</p>
      <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-muted-foreground">
        {query
          ? `“${query}” bo‘yicha boshqa so‘z bilan qidirib ko‘ring.`
          : 'Katalog hozircha bo‘sh.'}
      </p>
      {query && (
        <Button variant="outline" className="mt-4 rounded-xl" onClick={onClear}>
          Qidiruvni tozalash
        </Button>
      )}
    </div>
  );
}

function CatalogSkeleton() {
  return (
    <div className="space-y-6">
      <div className="h-16 animate-pulse rounded-2xl bg-muted/60" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 9 }).map((_, index) => (
          <div key={index} className="h-32 animate-pulse rounded-2xl bg-muted/60" />
        ))}
      </div>
    </div>
  );
}
