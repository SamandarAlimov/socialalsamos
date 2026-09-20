import {
  ArrowDownUp,
  BadgePercent,
  Banknote,
  Check,
  Clock3,
  PackageCheck,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  Store,
  Tag,
  Truck,
  X,
} from 'lucide-react';
import { Category, Product } from '@/hooks/useMarketplace';
import { CategoryIcon } from '@/components/marketplace/CategoryIcon';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';
import { conditionLabel, formatPriceCompact } from '@/lib/marketplace';

export type MarketplaceSortMode = 'recommended' | 'newest' | 'popular' | 'price_low' | 'price_high';
export type MarketplaceDeliveryMode = 'all' | 'shipping' | 'free_shipping' | 'pickup';

interface FilterStateProps {
  categories: Category[];
  selectedCategory: string;
  onCategoryChange: (slug: string) => void;
  sortBy: MarketplaceSortMode;
  onSortChange: (value: MarketplaceSortMode) => void;
  priceRange: [number, number] | null;
  sliderMax: number;
  onPriceRangeChange: (value: [number, number] | null) => void;
  conditionFilter: string;
  availableConditions: string[];
  onConditionChange: (condition: string) => void;
  minDiscount: number;
  onMinDiscountChange: (value: number) => void;
  inStockOnly: boolean;
  onInStockOnlyChange: (value: boolean) => void;
  deliveryMode: MarketplaceDeliveryMode;
  onDeliveryModeChange: (value: MarketplaceDeliveryMode) => void;
  activeFilterCount: number;
  resultCount: number;
  onReset: () => void;
}

interface MarketplaceFiltersProps extends FilterStateProps {
  onApply: () => void;
  onClose?: () => void;
}

interface MarketplaceQuickFiltersProps extends FilterStateProps {
  onOpenAll: () => void;
}

const SORT_OPTIONS: Array<{
  id: MarketplaceSortMode;
  label: string;
  description: string;
  icon: typeof Clock3;
}> = [
  { id: 'recommended', label: 'Tavsiya etiladi', description: 'Sifat va qiziqish balansi', icon: Sparkles },
  { id: 'newest', label: 'Eng yangi', description: 'Yangi e’lonlar avval', icon: Clock3 },
  { id: 'popular', label: 'Mashhur', description: 'Ko‘p qiziqish olganlar', icon: Sparkles },
  { id: 'price_low', label: 'Arzon → Qimmat', description: 'Past narxdan boshlash', icon: ArrowDownUp },
  { id: 'price_high', label: 'Qimmat → Arzon', description: 'Yuqori narxdan boshlash', icon: ArrowDownUp },
];

const DISCOUNT_OPTIONS = [
  { value: 0, label: 'Barchasi' },
  { value: 1, label: 'Chegirmali' },
  { value: 10, label: '10%+' },
  { value: 25, label: '25%+' },
  { value: 50, label: '50%+' },
];

const DELIVERY_OPTIONS: Array<{
  value: MarketplaceDeliveryMode;
  label: string;
  description: string;
  icon: typeof Truck;
}> = [
  { value: 'all', label: 'Barchasi', description: 'Barcha olish usullari', icon: Store },
  { value: 'shipping', label: 'Yetkazish', description: 'Kuryer orqali yetkazish', icon: Truck },
  { value: 'free_shipping', label: 'Bepul yetkazish', description: 'Yetkazish narxi 0 so‘m', icon: Sparkles },
  { value: 'pickup', label: 'Olib ketish', description: 'Sotuvchidan olib ketish', icon: PackageCheck },
];

function clampPrice(value: number, max: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(0, value), Math.max(0, max));
}

function pricePresets(sliderMax: number) {
  const fixed = [
    { min: 0, max: 500_000, label: '500 minggacha' },
    { min: 500_000, max: 2_000_000, label: '500 ming – 2 mln' },
    { min: 2_000_000, max: 5_000_000, label: '2 – 5 mln' },
    { min: 5_000_000, max: sliderMax, label: '5 mln+' },
  ];

  if (sliderMax >= 5_000_000) return fixed;

  const quarter = Math.max(1, Math.round(sliderMax / 4));
  return [
    { min: 0, max: quarter, label: formatPriceCompact(quarter) + ' gacha' },
    { min: quarter, max: quarter * 2, label: formatPriceCompact(quarter) + ' – ' + formatPriceCompact(quarter * 2) },
    { min: quarter * 2, max: quarter * 3, label: formatPriceCompact(quarter * 2) + ' – ' + formatPriceCompact(quarter * 3) },
    { min: quarter * 3, max: sliderMax, label: formatPriceCompact(quarter * 3) + '+' },
  ];
}

function SectionCard({
  icon,
  title,
  description,
  children,
  className,
}: {
  icon: React.ReactNode;
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        'overflow-hidden rounded-[22px] border border-border/55 bg-card shadow-[0_8px_30px_rgba(15,23,42,0.035)]',
        className,
      )}
    >
      <div className="flex items-start gap-3 border-b border-border/45 px-4 py-3.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted/65 text-foreground">
          {icon}
        </span>
        <div className="min-w-0">
          <h3 className="text-sm font-extrabold tracking-tight">{title}</h3>
          {description && <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">{description}</p>}
        </div>
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function ChoiceChip({
  active,
  label,
  onClick,
  accent = false,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  accent?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition-all',
        active
          ? accent
            ? 'border-orange-500 bg-orange-500 text-white shadow-[0_7px_18px_rgba(249,115,22,0.18)]'
            : 'border-zinc-950 bg-zinc-950 text-white shadow-sm dark:border-white dark:bg-white dark:text-zinc-950'
          : 'border-border/60 bg-background text-muted-foreground hover:border-foreground/20 hover:text-foreground',
      )}
    >
      {active && <Check className="h-3.5 w-3.5" />}
      {label}
    </button>
  );
}

function ActiveFilterChip({
  label,
  onRemove,
}: {
  label: string;
  onRemove: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onRemove}
      className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-foreground/10 bg-foreground/[0.055] px-2.5 text-[11px] font-bold text-foreground transition hover:bg-foreground/[0.09]"
    >
      <span className="max-w-[180px] truncate">{label}</span>
      <X className="h-3 w-3 text-muted-foreground" />
    </button>
  );
}

function ActiveFilters({
  selectedCategory,
  categories,
  onCategoryChange,
  priceRange,
  onPriceRangeChange,
  conditionFilter,
  onConditionChange,
  minDiscount,
  onMinDiscountChange,
  inStockOnly,
  onInStockOnlyChange,
  deliveryMode,
  onDeliveryModeChange,
}: Pick<
  FilterStateProps,
  | 'selectedCategory'
  | 'categories'
  | 'onCategoryChange'
  | 'priceRange'
  | 'onPriceRangeChange'
  | 'conditionFilter'
  | 'onConditionChange'
  | 'minDiscount'
  | 'onMinDiscountChange'
  | 'inStockOnly'
  | 'onInStockOnlyChange'
  | 'deliveryMode'
  | 'onDeliveryModeChange'
>) {
  const category = categories.find(item => item.slug === selectedCategory);
  const hasAnything =
    selectedCategory !== 'all' ||
    Boolean(priceRange) ||
    conditionFilter !== 'all' ||
    minDiscount > 0 ||
    inStockOnly ||
    deliveryMode !== 'all';

  if (!hasAnything) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {category && selectedCategory !== 'all' && (
        <ActiveFilterChip label={category.name} onRemove={() => onCategoryChange('all')} />
      )}
      {priceRange && (
        <ActiveFilterChip
          label={formatPriceCompact(priceRange[0]) + ' – ' + formatPriceCompact(priceRange[1])}
          onRemove={() => onPriceRangeChange(null)}
        />
      )}
      {conditionFilter !== 'all' && (
        <ActiveFilterChip
          label={conditionLabel(conditionFilter)}
          onRemove={() => onConditionChange('all')}
        />
      )}
      {minDiscount > 0 && (
        <ActiveFilterChip
          label={minDiscount === 1 ? 'Chegirmali' : minDiscount + '%+ chegirma'}
          onRemove={() => onMinDiscountChange(0)}
        />
      )}
      {inStockOnly && <ActiveFilterChip label="Omborda bor" onRemove={() => onInStockOnlyChange(false)} />}
      {deliveryMode !== 'all' && (
        <ActiveFilterChip
          label={DELIVERY_OPTIONS.find(option => option.value === deliveryMode)?.label || 'Yetkazish'}
          onRemove={() => onDeliveryModeChange('all')}
        />
      )}
    </div>
  );
}

export function MarketplaceFilters({
  categories,
  selectedCategory,
  onCategoryChange,
  sortBy,
  onSortChange,
  priceRange,
  sliderMax,
  onPriceRangeChange,
  conditionFilter,
  availableConditions,
  onConditionChange,
  minDiscount,
  onMinDiscountChange,
  inStockOnly,
  onInStockOnlyChange,
  deliveryMode,
  onDeliveryModeChange,
  activeFilterCount,
  resultCount,
  onReset,
  onApply,
  onClose,
}: MarketplaceFiltersProps) {
  const activeRange = priceRange ?? [0, sliderMax];
  const presets = pricePresets(sliderMax);

  const updatePrice = (index: 0 | 1, raw: string) => {
    const parsed = Number(raw.replace(/[^0-9.]/g, ''));
    const current: [number, number] = [...activeRange] as [number, number];
    current[index] = clampPrice(Number.isFinite(parsed) ? parsed : 0, sliderMax);
    if (current[0] > current[1]) {
      if (index === 0) current[1] = current[0];
      else current[0] = current[1];
    }
    onPriceRangeChange(current);
  };

  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col">
      <div className="border-b border-border/45 bg-background/95 px-4 pb-4 pt-4 backdrop-blur-xl sm:px-5 sm:pt-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-zinc-950 text-white dark:bg-white dark:text-zinc-950">
              <SlidersHorizontal className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-lg font-black tracking-tight">Filtr va saralash</h2>
              <p className="truncate text-xs text-muted-foreground">
                {activeFilterCount > 0
                  ? activeFilterCount + ' ta filtr tanlangan'
                  : 'Kerakli mahsulotni tezroq toping'}
              </p>
            </div>
          </div>

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Filtrlarni yopish"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border/60 bg-background text-muted-foreground transition hover:bg-muted hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="mt-4">
          <ActiveFilters
            categories={categories}
            selectedCategory={selectedCategory}
            onCategoryChange={onCategoryChange}
            priceRange={priceRange}
            onPriceRangeChange={onPriceRangeChange}
            conditionFilter={conditionFilter}
            onConditionChange={onConditionChange}
            minDiscount={minDiscount}
            onMinDiscountChange={onMinDiscountChange}
            inStockOnly={inStockOnly}
            onInStockOnlyChange={onInStockOnlyChange}
            deliveryMode={deliveryMode}
            onDeliveryModeChange={onDeliveryModeChange}
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto bg-muted/[0.16] px-4 py-4 sm:px-5">
        <div className="grid gap-4 md:grid-cols-2 md:items-start">
          <SectionCard
            className="md:col-span-2"
            icon={<ArrowDownUp className="h-4 w-4" />}
            title="Saralash"
            description="Mahsulotlar qanday tartibda ko‘rinsin"
          >
            <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
              {SORT_OPTIONS.map(option => {
                const Icon = option.icon;
                const active = sortBy === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => onSortChange(option.id)}
                    className={cn(
                      'relative min-h-[76px] rounded-2xl border p-3 text-left transition-all',
                      option.id === 'recommended' && 'col-span-2 md:col-span-1',
                      active
                        ? 'border-zinc-950 bg-zinc-950 text-white shadow-[0_10px_24px_rgba(0,0,0,0.12)] dark:border-white dark:bg-white dark:text-zinc-950'
                        : 'border-border/55 bg-background hover:border-foreground/20 hover:shadow-sm',
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <Icon className={cn('h-4 w-4', active ? 'opacity-90' : 'text-muted-foreground')} />
                      <span
                        className={cn(
                          'flex h-5 w-5 items-center justify-center rounded-full border',
                          active
                            ? 'border-white/25 bg-white/15 dark:border-zinc-950/15 dark:bg-zinc-950/10'
                            : 'border-border',
                        )}
                      >
                        {active && <Check className="h-3 w-3" />}
                      </span>
                    </div>
                    <p className="mt-2 text-xs font-extrabold">{option.label}</p>
                    <p className={cn('mt-0.5 text-[10px]', active ? 'opacity-60' : 'text-muted-foreground')}>
                      {option.description}
                    </p>
                  </button>
                );
              })}
            </div>
          </SectionCard>

          <SectionCard
            className="md:col-span-2"
            icon={<Tag className="h-4 w-4" />}
            title="Turkum"
            description="Qidiruvni mahsulot turiga toraytiring"
          >
            <div className="marketplace-x-rail -mx-1 flex gap-2 overflow-x-auto px-1 pb-1 md:grid md:grid-cols-5 md:overflow-visible">
              <button
                type="button"
                onClick={() => onCategoryChange('all')}
                className={cn(
                  'flex min-w-[92px] shrink-0 flex-col items-center gap-2 rounded-2xl border px-3 py-3 text-xs font-bold transition md:min-w-0',
                  selectedCategory === 'all'
                    ? 'border-zinc-950 bg-zinc-950 text-white dark:border-white dark:bg-white dark:text-zinc-950'
                    : 'border-border/55 bg-background text-muted-foreground hover:border-foreground/20 hover:text-foreground',
                )}
              >
                <Sparkles className="h-5 w-5" />
                Barchasi
              </button>
              {categories.slice(0, 12).map(category => (
                <button
                  type="button"
                  key={category.id}
                  onClick={() => onCategoryChange(category.slug)}
                  className={cn(
                    'flex min-w-[92px] shrink-0 flex-col items-center gap-2 rounded-2xl border px-3 py-3 text-xs font-bold transition md:min-w-0',
                    selectedCategory === category.slug
                      ? 'border-zinc-950 bg-zinc-950 text-white dark:border-white dark:bg-white dark:text-zinc-950'
                      : 'border-border/55 bg-background text-muted-foreground hover:border-foreground/20 hover:text-foreground',
                  )}
                >
                  <CategoryIcon slug={category.slug} name={category.name} className="h-5 w-5" />
                  <span className="max-w-[82px] truncate">{category.name}</span>
                </button>
              ))}
            </div>
          </SectionCard>

          <SectionCard
            icon={<Banknote className="h-4 w-4" />}
            title="Narx"
            description="Byudjetingizga mos oraliqni belgilang"
          >
            <div className="grid grid-cols-2 gap-2">
              <label className="rounded-2xl border border-border/55 bg-background px-3 py-2">
                <span className="block text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground">dan</span>
                <Input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={sliderMax}
                  value={Math.round(activeRange[0])}
                  onChange={event => updatePrice(0, event.target.value)}
                  className="mt-0.5 h-7 border-0 bg-transparent p-0 text-sm font-extrabold shadow-none focus-visible:ring-0"
                />
              </label>
              <label className="rounded-2xl border border-border/55 bg-background px-3 py-2">
                <span className="block text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground">gacha</span>
                <Input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={sliderMax}
                  value={Math.round(activeRange[1])}
                  onChange={event => updatePrice(1, event.target.value)}
                  className="mt-0.5 h-7 border-0 bg-transparent p-0 text-sm font-extrabold shadow-none focus-visible:ring-0"
                />
              </label>
            </div>

            <div className="mt-5 px-1">
              <Slider
                value={activeRange}
                min={0}
                max={sliderMax}
                step={Math.max(1, Math.round(sliderMax / 100))}
                onValueChange={value => onPriceRangeChange([value[0], value[1]])}
              />
              <div className="mt-2 flex items-center justify-between text-[10px] font-semibold text-muted-foreground">
                <span>{formatPriceCompact(0)}</span>
                <span>{formatPriceCompact(sliderMax)}</span>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {presets.map(preset => (
                <ChoiceChip
                  key={preset.label}
                  active={
                    Boolean(priceRange) &&
                    activeRange[0] === preset.min &&
                    activeRange[1] === preset.max
                  }
                  label={preset.label}
                  onClick={() => onPriceRangeChange([preset.min, preset.max])}
                />
              ))}
              {priceRange && (
                <button
                  type="button"
                  onClick={() => onPriceRangeChange(null)}
                  className="rounded-full px-2.5 py-1.5 text-[11px] font-bold text-muted-foreground transition hover:bg-muted hover:text-foreground"
                >
                  Narxni tozalash
                </button>
              )}
            </div>
          </SectionCard>

          {availableConditions.length > 0 && (
            <SectionCard
              icon={<PackageCheck className="h-4 w-4" />}
              title="Mahsulot holati"
              description="Yangi yoki ishlatilgan mahsulotlarni ajrating"
            >
              <div className="flex flex-wrap gap-2">
                <ChoiceChip
                  active={conditionFilter === 'all'}
                  label="Barchasi"
                  onClick={() => onConditionChange('all')}
                />
                {availableConditions.map(condition => (
                  <ChoiceChip
                    key={condition}
                    active={conditionFilter === condition}
                    label={conditionLabel(condition)}
                    onClick={() => onConditionChange(condition)}
                  />
                ))}
              </div>
            </SectionCard>
          )}

          <SectionCard
            icon={<BadgePercent className="h-4 w-4" />}
            title="Chegirma"
            description="Faqat real eski narxi mavjud takliflar"
          >
            <div className="flex flex-wrap gap-2">
              {DISCOUNT_OPTIONS.map(option => (
                <ChoiceChip
                  key={option.value}
                  active={minDiscount === option.value}
                  label={option.label}
                  accent={option.value > 0}
                  onClick={() => onMinDiscountChange(option.value)}
                />
              ))}
            </div>
          </SectionCard>

          <SectionCard
            icon={<Truck className="h-4 w-4" />}
            title="Olish usuli"
            description="Yetkazish va olib ketish imkoniyatlari"
          >
            <div className="grid grid-cols-2 gap-2">
              {DELIVERY_OPTIONS.map(option => {
                const Icon = option.icon;
                const active = deliveryMode === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => onDeliveryModeChange(option.value)}
                    className={cn(
                      'min-h-[78px] rounded-2xl border p-3 text-left transition',
                      active
                        ? 'border-zinc-950 bg-zinc-950 text-white dark:border-white dark:bg-white dark:text-zinc-950'
                        : 'border-border/55 bg-background hover:border-foreground/20',
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <Icon className={cn('h-4 w-4', !active && 'text-muted-foreground')} />
                      {active && <Check className="h-4 w-4" />}
                    </div>
                    <p className="mt-2 text-xs font-extrabold">{option.label}</p>
                    <p className={cn('mt-0.5 text-[10px]', active ? 'opacity-60' : 'text-muted-foreground')}>
                      {option.description}
                    </p>
                  </button>
                );
              })}
            </div>
          </SectionCard>

          <SectionCard
            icon={<PackageCheck className="h-4 w-4" />}
            title="Mavjudlik"
            description="Sotib olish mumkin bo‘lgan mahsulotlarni ko‘rsating"
          >
            <button
              type="button"
              role="switch"
              aria-checked={inStockOnly}
              onClick={() => onInStockOnlyChange(!inStockOnly)}
              className={cn(
                'flex w-full items-center justify-between gap-4 rounded-2xl border px-3.5 py-3 text-left transition',
                inStockOnly
                  ? 'border-zinc-950/15 bg-zinc-950/[0.045] dark:border-white/20 dark:bg-white/[0.06]'
                  : 'border-border/55 bg-background hover:border-foreground/20',
              )}
            >
              <span>
                <span className="block text-sm font-extrabold">Faqat omborda bor</span>
                <span className="mt-0.5 block text-[11px] text-muted-foreground">Sotilib ketgan mahsulotlarni yashiradi</span>
              </span>
              <span
                className={cn(
                  'relative h-7 w-12 shrink-0 rounded-full p-1 transition',
                  inStockOnly ? 'bg-zinc-950 dark:bg-white' : 'bg-muted',
                )}
              >
                <span
                  className={cn(
                    'block h-5 w-5 rounded-full bg-background shadow-sm transition-transform dark:bg-zinc-950',
                    inStockOnly && 'translate-x-5',
                  )}
                />
              </span>
            </button>
          </SectionCard>
        </div>
      </div>

      <div className="border-t border-border/50 bg-background/96 px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-3 shadow-[0_-12px_30px_rgba(15,23,42,0.055)] backdrop-blur-xl sm:px-5">
        <div className="grid grid-cols-[0.8fr_1.2fr] gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-12 rounded-2xl font-extrabold"
            onClick={onReset}
            disabled={activeFilterCount === 0 && sortBy === 'recommended'}
          >
            <RotateCcw className="mr-2 h-4 w-4" />
            Tozalash
          </Button>
          <Button
            type="button"
            className="h-12 rounded-2xl bg-orange-500 font-extrabold text-white shadow-[0_10px_28px_rgba(249,115,22,0.22)] hover:bg-orange-600"
            onClick={onApply}
          >
            {resultCount} ta natijani ko‘rish
          </Button>
        </div>
      </div>
    </div>
  );
}

export function MarketplaceQuickFilters({
  categories,
  selectedCategory,
  onCategoryChange,
  sortBy,
  onSortChange,
  priceRange,
  sliderMax,
  onPriceRangeChange,
  conditionFilter,
  availableConditions,
  onConditionChange,
  minDiscount,
  onMinDiscountChange,
  inStockOnly,
  onInStockOnlyChange,
  deliveryMode,
  onDeliveryModeChange,
  activeFilterCount,
  resultCount,
  onReset,
  onOpenAll,
}: MarketplaceQuickFiltersProps) {
  const selectedSort = SORT_OPTIONS.find(option => option.id === sortBy);
  const selectedCondition =
    conditionFilter === 'all' ? null : conditionLabel(conditionFilter);

  return (
    <div className="space-y-2.5">
      <div className="marketplace-x-rail -mx-4 flex items-center gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
        <button
          type="button"
          onClick={() => onMinDiscountChange(minDiscount > 0 ? 0 : 1)}
          className={cn(
            'inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-xs font-extrabold transition',
            minDiscount > 0
              ? 'border-red-500 bg-red-500 text-white shadow-[0_7px_18px_rgba(239,68,68,0.16)]'
              : 'border-border/60 bg-background hover:border-red-500/35',
          )}
        >
          <BadgePercent className="h-4 w-4" />
          {minDiscount > 1 ? minDiscount + '%+' : 'Chegirmali'}
        </button>

        <button
          type="button"
          onClick={() => onSortChange(sortBy === 'popular' ? 'newest' : 'popular')}
          className={cn(
            'inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-xs font-extrabold transition',
            sortBy === 'popular'
              ? 'border-zinc-950 bg-zinc-950 text-white dark:border-white dark:bg-white dark:text-zinc-950'
              : 'border-border/60 bg-background hover:border-foreground/20',
          )}
        >
          <Sparkles className="h-4 w-4" />
          Ommabop
        </button>

        {availableConditions.includes('new') && (
          <button
            type="button"
            onClick={() => onConditionChange(conditionFilter === 'all' ? 'new' : 'all')}
            className={cn(
              'inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-xs font-extrabold transition',
              conditionFilter !== 'all'
                ? 'border-zinc-950 bg-zinc-950 text-white dark:border-white dark:bg-white dark:text-zinc-950'
                : 'border-border/60 bg-background hover:border-foreground/20',
            )}
          >
            <PackageCheck className="h-4 w-4" />
            {selectedCondition || 'Yangi'}
          </button>
        )}

        <button
          type="button"
          onClick={() => onDeliveryModeChange(deliveryMode === 'all' ? 'shipping' : 'all')}
          className={cn(
            'inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-xs font-extrabold transition',
            deliveryMode !== 'all'
              ? 'border-zinc-950 bg-zinc-950 text-white dark:border-white dark:bg-white dark:text-zinc-950'
              : 'border-border/60 bg-background hover:border-foreground/20',
          )}
        >
          <Truck className="h-4 w-4" />
          {DELIVERY_OPTIONS.find(option => option.value === deliveryMode)?.label || 'Yetkazish'}
        </button>

        <button
          type="button"
          onClick={() => onInStockOnlyChange(!inStockOnly)}
          className={cn(
            'inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-xs font-extrabold transition',
            inStockOnly
              ? 'border-zinc-950 bg-zinc-950 text-white dark:border-white dark:bg-white dark:text-zinc-950'
              : 'border-border/60 bg-background hover:border-foreground/20',
          )}
        >
          <PackageCheck className="h-4 w-4" />
          Omborda
        </button>

        <button
          type="button"
          onClick={onOpenAll}
          className={cn(
            'inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-xs font-extrabold transition',
            priceRange
              ? 'border-zinc-950 bg-zinc-950 text-white dark:border-white dark:bg-white dark:text-zinc-950'
              : 'border-border/60 bg-background hover:border-foreground/20',
          )}
        >
          <Banknote className="h-4 w-4" />
          {priceRange
            ? formatPriceCompact(priceRange[0]) + '–' + formatPriceCompact(priceRange[1])
            : 'Narx'}
        </button>

        <button
          type="button"
          onClick={onOpenAll}
          className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full border border-border/60 bg-background px-3.5 text-xs font-extrabold transition hover:border-foreground/20"
        >
          <ArrowDownUp className="h-4 w-4" />
          {selectedSort?.label || 'Saralash'}
        </button>

        <button
          type="button"
          onClick={onOpenAll}
          className={cn(
            'relative inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-xs font-extrabold transition',
            activeFilterCount > 0
              ? 'border-orange-500/35 bg-orange-500/[0.08] text-orange-700 dark:text-orange-300'
              : 'border-border/60 bg-background hover:border-foreground/20',
          )}
        >
          <SlidersHorizontal className="h-4 w-4" />
          Barcha filtrlar
          {activeFilterCount > 0 && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-orange-500 px-1 text-[9px] font-black text-white">
              {activeFilterCount}
            </span>
          )}
        </button>
      </div>

      <ActiveFilters
        categories={categories}
        selectedCategory={selectedCategory}
        onCategoryChange={onCategoryChange}
        priceRange={priceRange}
        onPriceRangeChange={onPriceRangeChange}
        conditionFilter={conditionFilter}
        onConditionChange={onConditionChange}
        minDiscount={minDiscount}
        onMinDiscountChange={onMinDiscountChange}
        inStockOnly={inStockOnly}
        onInStockOnlyChange={onInStockOnlyChange}
        deliveryMode={deliveryMode}
        onDeliveryModeChange={onDeliveryModeChange}
      />

      {activeFilterCount > 0 && (
        <div className="flex items-center justify-between gap-3 text-[11px] text-muted-foreground">
          <span>{resultCount} ta mos mahsulot</span>
          <button type="button" onClick={onReset} className="font-bold transition hover:text-foreground">
            Hammasini tozalash
          </button>
        </div>
      )}
    </div>
  );
}

export function marketplaceProductMatchesFilters(
  product: Product,
  {
    priceRange,
    conditionFilter,
    minDiscount,
    inStockOnly,
    deliveryMode,
  }: Pick<
    FilterStateProps,
    'priceRange' | 'conditionFilter' | 'minDiscount' | 'inStockOnly' | 'deliveryMode'
  >,
) {
  if (priceRange && (product.price < priceRange[0] || product.price > priceRange[1])) return false;
  if (conditionFilter !== 'all' && product.condition !== conditionFilter) return false;
  if (inStockOnly && Number(product.quantity) <= 0) return false;

  const rate =
    Number(product.compare_at_price || 0) > Number(product.price || 0)
      ? Math.round(
          ((Number(product.compare_at_price) - Number(product.price)) /
            Number(product.compare_at_price)) *
            100,
        )
      : 0;
  if (minDiscount > 0 && rate < minDiscount) return false;

  if (deliveryMode === 'shipping' && !product.shipping_available) return false;
  if (
    deliveryMode === 'free_shipping' &&
    (!product.shipping_available || Number(product.shipping_price || 0) > 0)
  ) {
    return false;
  }
  if (deliveryMode === 'pickup' && product.shipping_available) return false;

  return true;
}
