import { useEffect, useMemo, useState } from 'react';
import {
  CalendarClock,
  Check,
  ChevronRight,
  Copy,
  Edit3,
  Loader2,
  Plus,
  Search,
  Sparkles,
  Tag,
  TicketPercent,
  Trash2,
  Users,
  X,
  Zap,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useCategories } from '@/hooks/useMarketplace';
import {
  findPromotionUsers,
  promoErrorMessage,
  type MarketplacePromotion,
  type PromotionAudienceType,
  type PromotionDiscountType,
  type PromotionDraft,
  type PromotionScopeType,
  useMarketplacePromotionManager,
} from '@/hooks/useMarketplacePromotions';
import { supabase } from '@/integrations/supabase/client';
import { formatPrice, formatPriceCompact } from '@/lib/marketplace';
import { cn } from '@/lib/utils';

interface MarketplacePromotionManagerProps {
  mode?: 'seller' | 'admin';
  sellerId?: string | null;
  compact?: boolean;
}

interface ProductOption {
  id: string;
  title: string;
  seller_id: string;
}

interface UserOption {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url?: string | null;
}

interface DraftState {
  code: string;
  name: string;
  description: string;
  discountType: PromotionDiscountType;
  discountValue: string;
  maxDiscount: string;
  minSubtotal: string;
  scopeType: PromotionScopeType;
  audienceType: PromotionAudienceType;
  startsAt: string;
  endsAt: string;
  usageLimit: string;
  perUserLimit: string;
  isActive: boolean;
  productIds: string[];
  categoryIds: string[];
  users: UserOption[];
}

const SCOPE_LABELS: Record<PromotionScopeType, string> = {
  all: 'Barcha mahsulotlar',
  categories: 'Tanlangan turkumlar',
  products: 'Tanlangan mahsulotlar',
};

const AUDIENCE_LABELS: Record<PromotionAudienceType, string> = {
  all: 'Barcha xaridorlar',
  new_customers: 'Yangi xaridorlar',
  returning_customers: 'Qaytgan xaridorlar',
  specific_users: 'Tanlangan foydalanuvchilar',
};

function localDateInput(value: Date) {
  const offset = value.getTimezoneOffset() * 60_000;
  return new Date(value.getTime() - offset).toISOString().slice(0, 16);
}

function emptyDraft(): DraftState {
  const start = new Date();
  const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
  return {
    code: '',
    name: '',
    description: '',
    discountType: 'percent',
    discountValue: '10',
    maxDiscount: '',
    minSubtotal: '0',
    scopeType: 'all',
    audienceType: 'all',
    startsAt: localDateInput(start),
    endsAt: localDateInput(end),
    usageLimit: '',
    perUserLimit: '1',
    isActive: true,
    productIds: [],
    categoryIds: [],
    users: [],
  };
}

function draftFromPromotion(item: MarketplacePromotion): DraftState {
  return {
    code: item.code,
    name: item.name,
    description: item.description || '',
    discountType: item.discount_type,
    discountValue: String(item.discount_value),
    maxDiscount: item.max_discount_amount == null ? '' : String(item.max_discount_amount),
    minSubtotal: String(item.min_subtotal || 0),
    scopeType: item.scope_type,
    audienceType: item.audience_type,
    startsAt: localDateInput(new Date(item.starts_at)),
    endsAt: item.ends_at ? localDateInput(new Date(item.ends_at)) : '',
    usageLimit: item.usage_limit == null ? '' : String(item.usage_limit),
    perUserLimit: item.per_user_limit == null ? '' : String(item.per_user_limit),
    isActive: item.is_active,
    productIds: item.product_ids || [],
    categoryIds: item.category_ids || [],
    users: (item.users || []).map(user => ({ ...user })),
  };
}

function promotionState(item: MarketplacePromotion) {
  const now = Date.now();
  if (!item.is_active) return { label: 'To‘xtatilgan', tone: 'muted' as const };
  if (new Date(item.starts_at).getTime() > now) return { label: 'Rejalashtirilgan', tone: 'scheduled' as const };
  if (item.ends_at && new Date(item.ends_at).getTime() <= now) return { label: 'Tugagan', tone: 'expired' as const };
  return { label: 'Faol', tone: 'active' as const };
}

function discountLabel(item: MarketplacePromotion) {
  if (item.discount_type === 'percent') {
    return `${item.discount_value}%${item.max_discount_amount ? ` · max ${formatPriceCompact(item.max_discount_amount, item.currency)}` : ''}`;
  }
  return formatPrice(item.discount_value, item.currency);
}

export function MarketplacePromotionManager({
  mode = 'seller',
  sellerId = null,
  compact = false,
}: MarketplacePromotionManagerProps) {
  const {
    promotions,
    loading,
    saving,
    error,
    refresh,
    savePromotion,
    setPromotionActive,
    deletePromotion,
  } = useMarketplacePromotionManager(mode);
  const { categories } = useCategories();

  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<MarketplacePromotion | null>(null);
  const [draft, setDraft] = useState<DraftState>(() => emptyDraft());
  const [productSearch, setProductSearch] = useState('');
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [userSearch, setUserSearch] = useState('');
  const [userResults, setUserResults] = useState<UserOption[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<MarketplacePromotion | null>(null);

  const activeCount = useMemo(
    () => promotions.filter(item => promotionState(item).tone === 'active').length,
    [promotions],
  );
  const redemptionCount = useMemo(
    () => promotions.reduce((sum, item) => sum + item.usage_count, 0),
    [promotions],
  );
  const totalDiscount = useMemo(
    () => promotions.reduce((sum, item) => sum + item.total_discount, 0),
    [promotions],
  );

  useEffect(() => {
    if (!editorOpen || draft.scopeType !== 'products') return;

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setProductsLoading(true);
      let query = supabase
        .from('products')
        .select('id,title,seller_id')
        .neq('status', 'deleted')
        .order('created_at', { ascending: false })
        .limit(80);

      if (mode === 'seller' && sellerId) query = query.eq('seller_id', sellerId);
      if (productSearch.trim()) {
        const safe = productSearch.trim().replace(/[%_]/g, value => `\\${value}`);
        query = query.ilike('title', `%${safe}%`);
      }

      const { data } = await query;
      if (!cancelled) {
        setProducts((data || []) as ProductOption[]);
        setProductsLoading(false);
      }
    }, 220);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [draft.scopeType, editorOpen, mode, productSearch, sellerId]);

  useEffect(() => {
    if (!editorOpen || draft.audienceType !== 'specific_users') {
      setUserResults([]);
      return;
    }

    const needle = userSearch.trim();
    if (needle.length < 2) {
      setUserResults([]);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setUsersLoading(true);
      const rows = await findPromotionUsers(needle);
      if (!cancelled) {
        const selected = new Set(draft.users.map(user => user.id));
        setUserResults((rows as UserOption[]).filter(user => !selected.has(user.id)));
        setUsersLoading(false);
      }
    }, 260);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [draft.audienceType, draft.users, editorOpen, userSearch]);

  const openCreate = () => {
    setEditing(null);
    setDraft(emptyDraft());
    setProductSearch('');
    setUserSearch('');
    setEditorOpen(true);
  };

  const openEdit = (item: MarketplacePromotion) => {
    setEditing(item);
    setDraft(draftFromPromotion(item));
    setProductSearch('');
    setUserSearch('');
    setEditorOpen(true);
  };

  const toggleId = (key: 'productIds' | 'categoryIds', id: string) => {
    setDraft(current => ({
      ...current,
      [key]: current[key].includes(id)
        ? current[key].filter(value => value !== id)
        : [...current[key], id],
    }));
  };

  const save = async () => {
    const discountValue = Number(draft.discountValue);
    if (!draft.code.trim() || !draft.name.trim() || !Number.isFinite(discountValue) || discountValue <= 0) {
      toast.error('Kod, kampaniya nomi va chegirma qiymatini tekshiring');
      return;
    }

    const payload: PromotionDraft = {
      owner_type: mode === 'admin' ? 'platform' : 'seller',
      seller_id: mode === 'seller' ? sellerId : null,
      code: draft.code.trim().toUpperCase(),
      name: draft.name.trim(),
      description: draft.description.trim() || null,
      discount_type: draft.discountType,
      discount_value: discountValue,
      max_discount_amount: draft.maxDiscount.trim() ? Number(draft.maxDiscount) : null,
      min_subtotal: draft.minSubtotal.trim() ? Number(draft.minSubtotal) : 0,
      currency: 'UZS',
      scope_type: draft.scopeType,
      audience_type: draft.audienceType,
      starts_at: draft.startsAt ? new Date(draft.startsAt).toISOString() : new Date().toISOString(),
      ends_at: draft.endsAt ? new Date(draft.endsAt).toISOString() : null,
      usage_limit: draft.usageLimit.trim() ? Number(draft.usageLimit) : null,
      per_user_limit: draft.perUserLimit.trim() ? Number(draft.perUserLimit) : null,
      is_active: draft.isActive,
      product_ids: draft.scopeType === 'products' ? draft.productIds : [],
      category_ids: draft.scopeType === 'categories' ? draft.categoryIds : [],
      user_ids: draft.audienceType === 'specific_users' ? draft.users.map(user => user.id) : [],
    };

    const result = await savePromotion(editing?.id ?? null, payload);
    if (!result.success) {
      toast.error(result.error || 'Promokodni saqlab bo‘lmadi');
      return;
    }

    toast.success(editing ? 'Promokod yangilandi' : 'Promokod yaratildi');
    setEditorOpen(false);
    setEditing(null);
  };

  const toggleActive = async (item: MarketplacePromotion) => {
    const result = await setPromotionActive(item.id, !item.is_active);
    if (!result.success) toast.error(result.error);
    else toast.success(!item.is_active ? 'Promokod faollashtirildi' : 'Promokod to‘xtatildi');
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const result = await deletePromotion(deleteTarget.id);
    if (!result.success) toast.error(result.error);
    else toast.success('Promokod o‘chirildi');
    setDeleteTarget(null);
  };

  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      toast.success('Promokod nusxalandi');
    } catch {
      toast.error('Nusxalab bo‘lmadi');
    }
  };

  return (
    <section className={cn('min-w-0', compact ? 'space-y-3' : 'space-y-4')}>
      <Card className="overflow-hidden border-border/60">
        <CardHeader className="border-b border-border/45 bg-muted/[0.14] px-4 py-4 sm:px-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-zinc-950 text-white dark:bg-white dark:text-zinc-950">
                  <TicketPercent className="h-4 w-4" />
                </span>
                Promokodlar
              </CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                {mode === 'admin'
                  ? 'Butun marketplace uchun kampaniyalar, auditoriya va limitlarni boshqaring'
                  : 'Do‘koningiz mahsulotlari uchun chegirma kampaniyalarini boshqaring'}
              </p>
            </div>
            <Button className="h-10 rounded-xl font-bold" onClick={openCreate}>
              <Plus className="mr-1.5 h-4 w-4" />
              Yangi promokod
            </Button>
          </div>
        </CardHeader>

        <CardContent className="p-4 sm:p-5">
          <div className="mb-4 grid grid-cols-3 gap-2 sm:gap-3">
            <PromoMetric label="Faol" value={activeCount.toLocaleString()} />
            <PromoMetric label="Ishlatilgan" value={redemptionCount.toLocaleString()} />
            <PromoMetric label="Chegirma" value={formatPriceCompact(totalDiscount)} />
          </div>

          {error && (
            <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-destructive/20 bg-destructive/[0.04] p-3 text-xs text-destructive">
              <span>{error}</span>
              <Button size="sm" variant="ghost" className="h-8 rounded-lg" onClick={() => void refresh()}>
                Qayta urinish
              </Button>
            </div>
          )}

          {loading ? (
            <div className="flex min-h-40 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : promotions.length === 0 ? (
            <div className="flex min-h-52 flex-col items-center justify-center rounded-2xl border border-dashed border-border/70 bg-muted/[0.12] px-5 text-center">
              <TicketPercent className="mb-3 h-9 w-9 text-muted-foreground/35" />
              <p className="font-bold">Hali promokod yo‘q</p>
              <p className="mt-1 max-w-sm text-xs leading-5 text-muted-foreground">
                Chegirma foizi yoki aniq summa, mahsulot/turkum qamrovi, auditoriya va limitlarni belgilang.
              </p>
              <Button variant="outline" className="mt-4 rounded-xl" onClick={openCreate}>
                Birinchi promokodni yaratish
              </Button>
            </div>
          ) : (
            <div className="grid gap-3 xl:grid-cols-2">
              {promotions.map(item => {
                const state = promotionState(item);
                return (
                  <article key={item.id} className="min-w-0 rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => void copyCode(item.code)}
                            className="inline-flex max-w-full items-center gap-1.5 rounded-lg bg-zinc-950 px-2.5 py-1 text-xs font-black tracking-[0.08em] text-white dark:bg-white dark:text-zinc-950"
                          >
                            <span className="truncate">{item.code}</span>
                            <Copy className="h-3 w-3 shrink-0" />
                          </button>
                          <Badge
                            variant="outline"
                            className={cn(
                              'rounded-full text-[10px]',
                              state.tone === 'active' && 'border-emerald-500/25 bg-emerald-500/10 text-emerald-600',
                              state.tone === 'scheduled' && 'border-sky-500/25 bg-sky-500/10 text-sky-600',
                              state.tone === 'expired' && 'border-amber-500/25 bg-amber-500/10 text-amber-600',
                            )}
                          >
                            {state.label}
                          </Badge>
                        </div>
                        <h3 className="mt-2 truncate text-sm font-bold">{item.name}</h3>
                        {item.description && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{item.description}</p>}
                      </div>

                      <div className="flex shrink-0 items-center gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={() => openEdit(item)} aria-label="Tahrirlash">
                          <Edit3 className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-destructive" onClick={() => setDeleteTarget(item)} aria-label="O‘chirish">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                      <InfoTile label="Chegirma" value={discountLabel(item)} />
                      <InfoTile label="Minimal xarid" value={item.min_subtotal > 0 ? formatPriceCompact(item.min_subtotal, item.currency) : 'Yo‘q'} />
                      <InfoTile label="Qamrov" value={SCOPE_LABELS[item.scope_type]} />
                      <InfoTile label="Auditoriya" value={AUDIENCE_LABELS[item.audience_type]} />
                    </div>

                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border/45 pt-3">
                      <div className="text-[11px] text-muted-foreground">
                        <span className="font-semibold text-foreground">{item.usage_count}</span>
                        {item.usage_limit ? ` / ${item.usage_limit}` : ''} marta ishlatilgan
                        {item.per_user_limit ? ` · foydalanuvchiga ${item.per_user_limit} marta` : ''}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-medium text-muted-foreground">{item.is_active ? 'Faol' : 'O‘chiq'}</span>
                        <Switch checked={item.is_active} onCheckedChange={() => void toggleActive(item)} />
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="flex h-[min(92dvh,900px)] w-[min(96vw,920px)] max-w-[920px] flex-col gap-0 overflow-hidden rounded-[28px] p-0">
          <DialogHeader className="border-b border-border/50 px-4 py-4 sm:px-6">
            <DialogTitle>{editing ? 'Promokodni tahrirlash' : 'Yangi promokod'}</DialogTitle>
            <DialogDescription>
              Kod, chegirma qoidasi, qamrov, auditoriya va foydalanish limitlarini belgilang.
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="min-h-0 flex-1">
            <div className="grid gap-5 p-4 sm:p-6 lg:grid-cols-2">
              <div className="space-y-4">
                <EditorSection title="Asosiy ma’lumot" icon={<TicketPercent className="h-4 w-4" />}>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Promokod">
                      <Input
                        value={draft.code}
                        onChange={event => setDraft(current => ({
                          ...current,
                          code: event.target.value.toUpperCase().replace(/\s+/g, ''),
                        }))}
                        placeholder="ALSAMOS10"
                        className="h-11 rounded-xl font-black tracking-[0.08em]"
                        maxLength={32}
                      />
                    </Field>
                    <Field label="Kampaniya nomi">
                      <Input
                        value={draft.name}
                        onChange={event => setDraft(current => ({ ...current, name: event.target.value }))}
                        placeholder="Kuzgi chegirma"
                        className="h-11 rounded-xl"
                      />
                    </Field>
                  </div>
                  <Field label="Izoh">
                    <Textarea
                      value={draft.description}
                      onChange={event => setDraft(current => ({ ...current, description: event.target.value }))}
                      placeholder="Xaridorga ko‘rinadigan qisqa izoh"
                      rows={2}
                      className="resize-none rounded-xl"
                    />
                  </Field>
                </EditorSection>

                <EditorSection title="Chegirma" icon={<Zap className="h-4 w-4" />}>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Turi">
                      <Select
                        value={draft.discountType}
                        onValueChange={(value: PromotionDiscountType) =>
                          setDraft(current => ({ ...current, discountType: value }))
                        }
                      >
                        <SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="percent">Foiz (%)</SelectItem>
                          <SelectItem value="fixed">Aniq summa (UZS)</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field label={draft.discountType === 'percent' ? 'Foiz' : 'Chegirma summasi'}>
                      <Input
                        value={draft.discountValue}
                        onChange={event => setDraft(current => ({ ...current, discountValue: event.target.value }))}
                        inputMode="decimal"
                        type="number"
                        min="0"
                        max={draft.discountType === 'percent' ? '100' : undefined}
                        className="h-11 rounded-xl"
                      />
                    </Field>
                    {draft.discountType === 'percent' && (
                      <Field label="Maksimal chegirma">
                        <Input
                          value={draft.maxDiscount}
                          onChange={event => setDraft(current => ({ ...current, maxDiscount: event.target.value }))}
                          inputMode="decimal"
                          type="number"
                          min="0"
                          placeholder="Cheklanmagan"
                          className="h-11 rounded-xl"
                        />
                      </Field>
                    )}
                    <Field label="Minimal xarid">
                      <Input
                        value={draft.minSubtotal}
                        onChange={event => setDraft(current => ({ ...current, minSubtotal: event.target.value }))}
                        inputMode="decimal"
                        type="number"
                        min="0"
                        className="h-11 rounded-xl"
                      />
                    </Field>
                  </div>
                </EditorSection>

                <EditorSection title="Qamrov" icon={<Tag className="h-4 w-4" />}>
                  <div className="grid grid-cols-3 gap-2">
                    {(['all', 'categories', 'products'] as PromotionScopeType[]).map(scope => (
                      <ChoiceButton
                        key={scope}
                        active={draft.scopeType === scope}
                        onClick={() => setDraft(current => ({ ...current, scopeType: scope }))}
                        label={scope === 'all' ? 'Barchasi' : scope === 'categories' ? 'Turkumlar' : 'Mahsulotlar'}
                      />
                    ))}
                  </div>

                  {draft.scopeType === 'categories' && (
                    <div className="mt-3 flex max-h-48 flex-wrap gap-2 overflow-y-auto rounded-xl border border-border/50 p-2.5">
                      {categories.map(category => (
                        <button
                          key={category.id}
                          type="button"
                          onClick={() => toggleId('categoryIds', category.id)}
                          className={cn(
                            'rounded-full border px-2.5 py-1.5 text-xs font-semibold transition',
                            draft.categoryIds.includes(category.id)
                              ? 'border-foreground bg-foreground text-background'
                              : 'border-border/60 bg-background hover:bg-muted',
                          )}
                        >
                          {category.name}
                        </button>
                      ))}
                    </div>
                  )}

                  {draft.scopeType === 'products' && (
                    <div className="mt-3 space-y-2">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          value={productSearch}
                          onChange={event => setProductSearch(event.target.value)}
                          placeholder="Mahsulot qidirish"
                          className="h-10 rounded-xl pl-9"
                        />
                      </div>
                      <div className="max-h-52 overflow-y-auto rounded-xl border border-border/50">
                        {productsLoading ? (
                          <div className="flex h-24 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                        ) : products.length === 0 ? (
                          <p className="p-4 text-center text-xs text-muted-foreground">Mahsulot topilmadi</p>
                        ) : products.map(product => {
                          const selected = draft.productIds.includes(product.id);
                          return (
                            <button
                              key={product.id}
                              type="button"
                              onClick={() => toggleId('productIds', product.id)}
                              className="flex w-full items-center gap-3 border-b border-border/40 px-3 py-2.5 text-left last:border-b-0 hover:bg-muted/40"
                            >
                              <span className={cn(
                                'flex h-5 w-5 shrink-0 items-center justify-center rounded-md border',
                                selected ? 'border-foreground bg-foreground text-background' : 'border-border',
                              )}>
                                {selected && <Check className="h-3 w-3" />}
                              </span>
                              <span className="min-w-0 flex-1 truncate text-xs font-medium">{product.title}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </EditorSection>
              </div>

              <div className="space-y-4">
                <EditorSection title="Kimlarga" icon={<Users className="h-4 w-4" />}>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {([
                      ['all', 'Barcha xaridorlar'],
                      ['new_customers', 'Yangi xaridorlar'],
                      ['returning_customers', 'Qaytgan xaridorlar'],
                      ['specific_users', 'Tanlangan foydalanuvchilar'],
                    ] as Array<[PromotionAudienceType, string]>).map(([value, label]) => (
                      <ChoiceButton
                        key={value}
                        active={draft.audienceType === value}
                        onClick={() => setDraft(current => ({ ...current, audienceType: value }))}
                        label={label}
                      />
                    ))}
                  </div>

                  {draft.audienceType === 'specific_users' && (
                    <div className="mt-3 space-y-2">
                      {draft.users.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {draft.users.map(user => (
                            <span key={user.id} className="inline-flex items-center gap-1 rounded-full bg-foreground px-2.5 py-1 text-[11px] font-semibold text-background">
                              @{user.username || user.display_name || user.id.slice(0, 6)}
                              <button type="button" onClick={() => setDraft(current => ({ ...current, users: current.users.filter(item => item.id !== user.id) }))}>
                                <X className="h-3 w-3" />
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          value={userSearch}
                          onChange={event => setUserSearch(event.target.value)}
                          placeholder="@username yoki ism"
                          className="h-10 rounded-xl pl-9"
                        />
                      </div>
                      {(usersLoading || userResults.length > 0) && (
                        <div className="max-h-44 overflow-y-auto rounded-xl border border-border/50">
                          {usersLoading ? (
                            <div className="flex h-20 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                          ) : userResults.map(user => (
                            <button
                              key={user.id}
                              type="button"
                              onClick={() => {
                                setDraft(current => ({ ...current, users: [...current.users, user] }));
                                setUserSearch('');
                                setUserResults([]);
                              }}
                              className="flex w-full items-center justify-between gap-3 border-b border-border/40 px-3 py-2.5 text-left last:border-b-0 hover:bg-muted/40"
                            >
                              <span className="min-w-0">
                                <span className="block truncate text-xs font-semibold">{user.display_name || user.username || 'Foydalanuvchi'}</span>
                                {user.username && <span className="block truncate text-[11px] text-muted-foreground">@{user.username}</span>}
                              </span>
                              <Plus className="h-4 w-4 shrink-0 text-muted-foreground" />
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </EditorSection>

                <EditorSection title="Muddat va limitlar" icon={<CalendarClock className="h-4 w-4" />}>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Boshlanish">
                      <Input
                        type="datetime-local"
                        value={draft.startsAt}
                        onChange={event => setDraft(current => ({ ...current, startsAt: event.target.value }))}
                        className="h-11 rounded-xl"
                      />
                    </Field>
                    <Field label="Tugash">
                      <Input
                        type="datetime-local"
                        value={draft.endsAt}
                        onChange={event => setDraft(current => ({ ...current, endsAt: event.target.value }))}
                        className="h-11 rounded-xl"
                      />
                    </Field>
                    <Field label="Umumiy foydalanish limiti">
                      <Input
                        type="number"
                        min="1"
                        value={draft.usageLimit}
                        onChange={event => setDraft(current => ({ ...current, usageLimit: event.target.value }))}
                        placeholder="Cheklanmagan"
                        className="h-11 rounded-xl"
                      />
                    </Field>
                    <Field label="Bir xaridorga">
                      <Input
                        type="number"
                        min="1"
                        value={draft.perUserLimit}
                        onChange={event => setDraft(current => ({ ...current, perUserLimit: event.target.value }))}
                        placeholder="Cheklanmagan"
                        className="h-11 rounded-xl"
                      />
                    </Field>
                  </div>
                </EditorSection>

                <div className="rounded-2xl border border-border/60 bg-zinc-950 p-4 text-white dark:bg-white dark:text-zinc-950">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <Sparkles className="h-4 w-4" />
                        <p className="text-sm font-black">Kampaniya holati</p>
                      </div>
                      <p className="mt-1 text-xs text-white/65 dark:text-zinc-950/65">
                        Faol bo‘lsa, belgilangan vaqt va limitlar oralig‘ida checkoutda ishlaydi.
                      </p>
                    </div>
                    <Switch checked={draft.isActive} onCheckedChange={isActive => setDraft(current => ({ ...current, isActive }))} />
                  </div>
                </div>
              </div>
            </div>
          </ScrollArea>

          <DialogFooter className="border-t border-border/50 bg-background px-4 py-3 sm:px-6">
            <Button variant="ghost" className="rounded-xl" onClick={() => setEditorOpen(false)}>Bekor qilish</Button>
            <Button className="rounded-xl px-5 font-bold" disabled={saving} onClick={() => void save()}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <TicketPercent className="mr-2 h-4 w-4" />}
              {editing ? 'Saqlash' : 'Promokod yaratish'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(deleteTarget)} onOpenChange={open => !open && setDeleteTarget(null)}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>Promokodni o‘chirasizmi?</DialogTitle>
            <DialogDescription>
              {deleteTarget?.code} boshqa checkoutlarda ishlamaydi. Avvalgi buyurtma va foydalanish tarixi saqlanadi.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" className="rounded-xl" onClick={() => setDeleteTarget(null)}>Bekor qilish</Button>
            <Button variant="destructive" className="rounded-xl" onClick={() => void confirmDelete()}>
              O‘chirish
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function PromoMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-border/50 bg-muted/[0.16] px-3 py-2.5">
      <p className="truncate text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-sm font-black tabular-nums sm:text-base">{value}</p>
    </div>
  );
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl bg-muted/30 p-2.5">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className="mt-0.5 truncate font-semibold">{value}</p>
    </div>
  );
}

function EditorSection({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border/60 bg-card p-3.5 sm:p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-black">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted">{icon}</span>
        {title}
      </div>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-semibold text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function ChoiceButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex min-h-10 items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left text-xs font-bold transition',
        active
          ? 'border-foreground bg-foreground text-background shadow-sm'
          : 'border-border/60 bg-background hover:bg-muted/50',
      )}
    >
      <span className="min-w-0 truncate">{label}</span>
      {active ? <Check className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-40" />}
    </button>
  );
}
