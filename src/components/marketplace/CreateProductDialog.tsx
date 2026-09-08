import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import {
  CheckCircle2,
  Clock3,
  Image as ImageIcon,
  Loader2,
  MapPin,
  PackagePlus,
  Palette,
  Play,
  Plus,
  Ruler,
  SlidersHorizontal,
  Sparkles,
  Tag,
  Trash2,
  Utensils,
  X,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { CategoryIcon } from '@/components/marketplace/CategoryIcon';
import {
  MarketplaceLocationPicker,
  type MarketplaceLocationValue,
} from '@/components/marketplace/MarketplaceLocationPicker';
import { useAuth } from '@/contexts/AuthContext';
import { useCategories, useProductActions } from '@/hooks/useMarketplace';
import { useToast } from '@/hooks/use-toast';
import { marketplaceUz } from '@/i18n/marketplace';
import { db } from '@/lib/supabaseAny';
import { cn } from '@/lib/utils';
import {
  MAX_PRODUCT_MEDIA,
  MAX_PRODUCT_VIDEOS,
  PRODUCT_MEDIA_ACCEPT,
  type ProductMediaDraft,
  ProductMediaError,
  formatMediaDuration,
  prepareProductMedia,
  productMediaErrorMessage,
  syncProductMedia,
} from '@/lib/productMedia';

interface CreateProductDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

type OptionGroup = {
  id: string;
  name: string;
  valuesText: string;
};

type VariantEdit = {
  price: string;
  compareAtPrice: string;
  quantity: string;
  sku: string;
  imageUrl: string;
};

type GeneratedVariant = {
  key: string;
  options: Record<string, string>;
  label: string;
};

type RestaurantOption = {
  id: string;
  name: string;
  price: string;
};

type RestaurantOptionGroup = {
  id: string;
  name: string;
  required: boolean;
  maxSelect: string;
  options: RestaurantOption[];
};

const copy = marketplaceUz.productForm;
const conditions = [
  { value: 'new', label: copy.conditions.new },
  { value: 'like_new', label: copy.conditions.like_new },
  { value: 'good', label: copy.conditions.good },
  { value: 'fair', label: copy.conditions.fair },
];

const OPTION_PRESETS = [
  { name: 'Rang', icon: Palette },
  { name: 'O‘lcham', icon: Ruler },
  { name: 'Rusum', icon: Tag },
  { name: 'Model', icon: Sparkles },
];

const RESTAURANT_VARIANT_PRESETS = [
  { name: 'Porsiya', icon: Utensils },
  { name: 'Hajm', icon: Ruler },
  { name: 'Achchiqlik', icon: Sparkles },
];

const RESTAURANT_CATEGORIES = [
  'Milliy taomlar',
  'Oshlar',
  'Fast food',
  'Pizza',
  'Burger',
  'Salatlar',
  'Ichimliklar',
  'Desertlar',
  'Nonushta',
  'Boshqa',
];

const MAX_VARIANTS = 100;

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function parseValues(value: string) {
  return Array.from(
    new Set(
      value
        .split(',')
        .map(item => item.trim())
        .filter(Boolean),
    ),
  );
}

function buildVariants(groups: OptionGroup[]): GeneratedVariant[] {
  const validGroups = groups
    .map(group => ({ name: group.name.trim(), values: parseValues(group.valuesText) }))
    .filter(group => group.name && group.values.length > 0);

  if (validGroups.length === 0) return [];

  let combinations: Record<string, string>[] = [{}];
  for (const group of validGroups) {
    combinations = combinations.flatMap(previous =>
      group.values.map(value => ({ ...previous, [group.name]: value })),
    );
    if (combinations.length > MAX_VARIANTS) return [];
  }

  return combinations.map(options => {
    const key = Object.entries(options)
      .map(([name, value]) => `${name.toLocaleLowerCase()}:${value.toLocaleLowerCase()}`)
      .join('|');
    return {
      key,
      options,
      label: Object.values(options).join(' · '),
    };
  });
}

function emptyVariantEdit(basePrice = ''): VariantEdit {
  return {
    price: basePrice,
    compareAtPrice: '',
    quantity: '1',
    sku: '',
    imageUrl: '',
  };
}

function createRestaurantOptionGroup(): RestaurantOptionGroup {
  return {
    id: createId('food-group'),
    name: 'Qo‘shimchalar',
    required: false,
    maxSelect: '3',
    options: [{ id: createId('food-option'), name: '', price: '' }],
  };
}

export function CreateProductDialog({ open, onOpenChange, onSuccess }: CreateProductDialogProps) {
  const { user } = useAuth();
  const { categories } = useCategories();
  const { toast } = useToast();
  const {
    createProduct,
    checkProductVariantsReady,
    rollbackCreatedProduct,
    createProductVariants,
  } = useProductActions();

  const [sellerBusinessType, setSellerBusinessType] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [compareAtPrice, setCompareAtPrice] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [condition, setCondition] = useState('new');
  const [quantity, setQuantity] = useState('1');
  const [isNegotiable, setIsNegotiable] = useState(false);
  const [shippingAvailable, setShippingAvailable] = useState(true);
  const [shippingPrice, setShippingPrice] = useState('0');
  const [media, setMedia] = useState<ProductMediaDraft[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasVariants, setHasVariants] = useState(false);
  const [optionGroups, setOptionGroups] = useState<OptionGroup[]>([
    { id: createId('option'), name: 'Rang', valuesText: '' },
  ]);
  const [variantEdits, setVariantEdits] = useState<Record<string, VariantEdit>>({});
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [location, setLocation] = useState<MarketplaceLocationValue | null>(null);

  const [restaurantCategory, setRestaurantCategory] = useState(RESTAURANT_CATEGORIES[0]);
  const [preparationMinutes, setPreparationMinutes] = useState('25');
  const [servingLabel, setServingLabel] = useState('1 porsiya');
  const [restaurantOptionGroups, setRestaurantOptionGroups] = useState<RestaurantOptionGroup[]>([
    createRestaurantOptionGroup(),
  ]);

  const isRestaurant = sellerBusinessType === 'restaurant';

  useEffect(() => {
    if (!open || !user) {
      if (!user) setSellerBusinessType(null);
      return;
    }
    let cancelled = false;
    void db
      .from('sellers')
      .select('business_type')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }: { data: any }) => {
        if (cancelled) return;
        setSellerBusinessType(data?.business_type || null);
      });
    return () => {
      cancelled = true;
    };
  }, [open, user]);

  useEffect(() => {
    if (!isRestaurant) return;
    setCondition('new');
    setIsNegotiable(false);
    setOptionGroups(current => {
      if (current.some(group => group.valuesText.trim())) return current;
      return [{ id: createId('option'), name: 'Porsiya', valuesText: '' }];
    });
  }, [isRestaurant]);

  const generatedVariants = useMemo(() => buildVariants(optionGroups), [optionGroups]);
  const potentialVariantCount = useMemo(() => {
    const valid = optionGroups
      .map(group => ({ name: group.name.trim(), values: parseValues(group.valuesText) }))
      .filter(group => group.name && group.values.length > 0);
    if (valid.length === 0) return 0;
    return valid.reduce((total, group) => total * group.values.length, 1);
  }, [optionGroups]);
  const variantLimitExceeded = potentialVariantCount > MAX_VARIANTS;
  const productImages = useMemo(
    () => media.filter(item => item.mediaType !== 'video'),
    [media],
  );
  const videoCount = media.filter(item => item.mediaType === 'video').length;

  const readVariantEdit = (key: string) => variantEdits[key] ?? emptyVariantEdit(price);

  const updateVariant = (key: string, patch: Partial<VariantEdit>) => {
    setVariantEdits(previous => ({
      ...previous,
      [key]: { ...(previous[key] ?? emptyVariantEdit(price)), ...patch },
    }));
  };

  const handleMediaUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || !user) return;

    const selected = Array.from(files);
    const reported = new Set<string>();
    setIsUploading(true);

    let accepted: ProductMediaDraft[] = media;
    for (const file of selected) {
      try {
        const prepared = await prepareProductMedia(file, accepted);
        accepted = [...accepted, prepared];
        setMedia(accepted);
      } catch (error) {
        const code = error instanceof ProductMediaError ? error.code : 'upload_failed';
        if (!reported.has(code)) {
          reported.add(code);
          toast({
            title: file.name,
            description: productMediaErrorMessage(code),
            variant: 'destructive',
          });
        }
        if (code === 'too_many_media') break;
      }
    }

    setIsUploading(false);
    event.target.value = '';
  };

  const removeMedia = (index: number) => {
    const removed = media[index];
    setMedia(previous => previous.filter((_, current) => current !== index));
    if (removed?.url) {
      setVariantEdits(previous => {
        const next = { ...previous };
        Object.keys(next).forEach(key => {
          if (next[key].imageUrl === removed.url) next[key] = { ...next[key], imageUrl: '' };
        });
        return next;
      });
    }
  };

  const addOptionGroup = (presetName?: string) => {
    const presets = isRestaurant ? RESTAURANT_VARIANT_PRESETS : OPTION_PRESETS;
    const taken = new Set(optionGroups.map(group => group.name.trim().toLocaleLowerCase()));
    const fallback = presets.find(preset => !taken.has(preset.name.toLocaleLowerCase()))?.name || 'Xususiyat';
    setOptionGroups(previous => [
      ...previous,
      { id: createId('option'), name: presetName || fallback, valuesText: '' },
    ]);
  };

  const updateOptionGroup = (id: string, patch: Partial<OptionGroup>) => {
    setOptionGroups(previous => previous.map(group => group.id === id ? { ...group, ...patch } : group));
  };

  const removeOptionGroup = (id: string) => {
    setOptionGroups(previous => previous.filter(group => group.id !== id));
  };

  const addRestaurantOptionGroup = () => {
    setRestaurantOptionGroups(previous => [...previous, createRestaurantOptionGroup()]);
  };

  const updateRestaurantOptionGroup = (id: string, patch: Partial<RestaurantOptionGroup>) => {
    setRestaurantOptionGroups(previous => previous.map(group => group.id === id ? { ...group, ...patch } : group));
  };

  const removeRestaurantOptionGroup = (id: string) => {
    setRestaurantOptionGroups(previous => previous.filter(group => group.id !== id));
  };

  const addRestaurantOption = (groupId: string) => {
    setRestaurantOptionGroups(previous => previous.map(group =>
      group.id === groupId
        ? { ...group, options: [...group.options, { id: createId('food-option'), name: '', price: '' }] }
        : group,
    ));
  };

  const updateRestaurantOption = (groupId: string, optionId: string, patch: Partial<RestaurantOption>) => {
    setRestaurantOptionGroups(previous => previous.map(group =>
      group.id === groupId
        ? {
            ...group,
            options: group.options.map(option => option.id === optionId ? { ...option, ...patch } : option),
          }
        : group,
    ));
  };

  const removeRestaurantOption = (groupId: string, optionId: string) => {
    setRestaurantOptionGroups(previous => previous.map(group =>
      group.id === groupId
        ? { ...group, options: group.options.filter(option => option.id !== optionId) }
        : group,
    ));
  };

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setPrice('');
    setCompareAtPrice('');
    setCategoryId('');
    setCondition('new');
    setQuantity('1');
    setIsNegotiable(false);
    setShippingAvailable(true);
    setShippingPrice('0');
    setMedia([]);
    setHasVariants(false);
    setOptionGroups([{ id: createId('option'), name: isRestaurant ? 'Porsiya' : 'Rang', valuesText: '' }]);
    setVariantEdits({});
    setLocation(null);
    setRestaurantCategory(RESTAURANT_CATEGORIES[0]);
    setPreparationMinutes('25');
    setServingLabel('1 porsiya');
    setRestaurantOptionGroups([createRestaurantOptionGroup()]);
  };

  const handleSubmit = async () => {
    if (!title.trim() || !price || isUploading || isSubmitting) return;

    if (isRestaurant) {
      const prep = Number(preparationMinutes);
      if (!Number.isFinite(prep) || prep < 1 || prep > 240) {
        toast({
          title: 'Tayyorlash vaqtini tekshiring',
          description: 'Tayyorlash vaqti 1–240 daqiqa oralig‘ida bo‘lishi kerak.',
          variant: 'destructive',
        });
        return;
      }
    }

    if (hasVariants && (variantLimitExceeded || generatedVariants.length === 0)) {
      toast({
        title: 'Variantlarni tekshiring',
        description: variantLimitExceeded
          ? `Bitta mahsulot uchun ko‘pi bilan ${MAX_VARIANTS} variant yarating.`
          : 'Kamida bitta xususiyat nomi va qiymatlarini kiriting.',
        variant: 'destructive',
      });
      return;
    }

    if (hasVariants) {
      const ready = await checkProductVariantsReady();
      if (!ready) return;
    }

    const parsedVariants = generatedVariants.map(variant => {
      const edit = readVariantEdit(variant.key);
      const variantPrice = Number(edit.price || price);
      const variantCompare = edit.compareAtPrice.trim() ? Number(edit.compareAtPrice) : null;
      return {
        options: variant.options,
        price: Number.isFinite(variantPrice) ? variantPrice : Number(price),
        compare_at_price: variantCompare != null && Number.isFinite(variantCompare) ? variantCompare : null,
        quantity: Math.max(0, Math.floor(Number(edit.quantity) || 0)),
        sku: edit.sku.trim() || null,
        image_url: edit.imageUrl || null,
      };
    });

    const totalStock = hasVariants
      ? parsedVariants.reduce((sum, variant) => sum + variant.quantity, 0)
      : Math.max(0, Math.floor(Number(quantity) || 0));

    setIsSubmitting(true);
    try {
      const result = await createProduct({
        title: title.trim(),
        description: description.trim() || undefined,
        price: Number(price),
        category_id: categoryId || undefined,
        condition: isRestaurant ? 'new' : condition,
        location: location?.label || undefined,
        quantity: totalStock,
        is_negotiable: isRestaurant ? false : isNegotiable,
        shipping_available: shippingAvailable,
        shipping_price: Number(shippingPrice) || 0,
      }, []);

      if (!result) return;

      if (media.length > 0) {
        const mediaSaved = await syncProductMedia(result.id, media);
        if (!mediaSaved) {
          toast({
            title: 'Media to‘liq saqlanmadi',
            description: isRestaurant
              ? 'Menyu pozitsiyasi yaratildi. Rasm yoki videolarni tahrirlashdan qayta qo‘shishingiz mumkin.'
              : 'Mahsulot yaratildi. Rasm yoki videolarni tahrirlashdan qayta qo‘shishingiz mumkin.',
            variant: 'destructive',
          });
        }
      }

      const extraUpdates: Record<string, unknown> = {};
      if (location) {
        extraUpdates.latitude = location.latitude;
        extraUpdates.longitude = location.longitude;
        extraUpdates.location = location.label;
      }
      if (compareAtPrice.trim()) {
        const value = Number(compareAtPrice);
        if (Number.isFinite(value) && value > Number(price)) extraUpdates.compare_at_price = value;
      }

      if (isRestaurant) {
        extraUpdates.is_food = true;
        extraUpdates.restaurant_category = restaurantCategory;
        extraUpdates.preparation_minutes = Math.min(240, Math.max(1, Math.round(Number(preparationMinutes) || 25)));
        extraUpdates.serving_label = servingLabel.trim() || null;
        extraUpdates.restaurant_options = restaurantOptionGroups
          .map(group => ({
            name: group.name.trim(),
            required: group.required,
            maxSelect: Math.max(1, Math.round(Number(group.maxSelect) || 1)),
            options: group.options
              .filter(option => option.name.trim())
              .map(option => ({
                name: option.name.trim(),
                price: Math.max(0, Number(option.price) || 0),
              })),
          }))
          .filter(group => group.name && group.options.length > 0);
      }

      if (Object.keys(extraUpdates).length > 0) {
        const { error } = await db.from('products').update(extraUpdates).eq('id', result.id);
        if (error) console.warn('Marketplace product extra fields were not saved:', error);
      }

      if (hasVariants) {
        const variantsSaved = await createProductVariants(result.id, parsedVariants);
        if (!variantsSaved) {
          await rollbackCreatedProduct(result.id);
          return;
        }
      }

      toast({
        title: isRestaurant ? 'Menyu pozitsiyasi tayyor' : 'Mahsulot tayyor',
        description: hasVariants
          ? `${parsedVariants.length} ta variant, ${totalStock} dona umumiy qoldiq bilan e’lon qilindi.`
          : isRestaurant
            ? `${restaurantCategory} bo‘limiga qo‘shildi · tayyorlash ~${Math.round(Number(preparationMinutes) || 25)} daqiqa.`
            : 'Mahsulot Marketplace’da e’lon qilindi.',
      });
      resetForm();
      onSuccess();
      onOpenChange(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const variantPresets = isRestaurant ? RESTAURANT_VARIANT_PRESETS : OPTION_PRESETS;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="marketplace-neutral max-h-[94dvh] max-w-4xl overflow-hidden p-0 sm:rounded-3xl">
          <DialogHeader className="border-b border-border/60 px-5 py-4 text-left">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-foreground text-background">
                {isRestaurant ? <Utensils className="h-5 w-5" /> : <PackagePlus className="h-5 w-5" />}
              </div>
              <div>
                <DialogTitle className="text-lg">
                  {isRestaurant ? 'Professional menyu pozitsiyasi' : 'Professional mahsulot yaratish'}
                </DialogTitle>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {isRestaurant
                    ? 'Taom media, porsiya, qo‘shimchalar, tayyorlash vaqti va yetkazishni bitta joyda boshqaring.'
                    : 'Media, variantlar, ombor, SKU va xaritadagi joylashuvni bitta joyda boshqaring.'}
                </p>
              </div>
            </div>
          </DialogHeader>

          <ScrollArea className="max-h-[calc(94dvh-154px)]">
            <div className="grid gap-6 p-5 lg:grid-cols-[minmax(0,1fr)_320px]">
              <div className="space-y-6">
                <section className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label>Rasm va video</Label>
                    <span className="text-[11px] text-muted-foreground">{media.length}/{MAX_PRODUCT_MEDIA} · video {videoCount}/{MAX_PRODUCT_VIDEOS}</span>
                  </div>
                  <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
                    {media.map((item, index) => (
                      <div key={`${item.url}-${index}`} className="relative aspect-square overflow-hidden rounded-2xl bg-muted">
                        <img
                          src={item.mediaType === 'video' ? item.thumbnailUrl || item.url : item.url}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                        {item.mediaType === 'video' && (
                          <>
                            <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
                              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-black/55"><Play className="h-4 w-4 fill-white text-white" /></span>
                            </span>
                            {item.durationSeconds ? <span className="absolute bottom-1 left-1 rounded bg-black/65 px-1.5 py-0.5 text-[10px] text-white">{formatMediaDuration(item.durationSeconds)}</span> : null}
                          </>
                        )}
                        {index === 0 && <span className="absolute left-1 top-1 rounded-md bg-foreground px-1.5 py-0.5 text-[9px] font-bold text-background">Muqova</span>}
                        <button type="button" onClick={() => removeMedia(index)} className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                    {media.length < MAX_PRODUCT_MEDIA && (
                      <label className={cn('flex aspect-square cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border bg-muted/20 hover:bg-muted/50', isUploading && 'pointer-events-none opacity-60')}>
                        <input type="file" accept={PRODUCT_MEDIA_ACCEPT} multiple onChange={handleMediaUpload} className="hidden" disabled={isUploading} />
                        {isUploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <><Plus className="h-5 w-5" /><span className="mt-1 text-[10px] text-muted-foreground">Media</span></>}
                      </label>
                    )}
                  </div>
                </section>

                <section className="space-y-4 rounded-2xl border border-border/50 p-4">
                  <div className="flex items-center gap-2"><Tag className="h-4 w-4" /><h3 className="text-sm font-semibold">Asosiy ma’lumot</h3></div>
                  <div className="space-y-2">
                    <Label htmlFor="marketplace-title">{isRestaurant ? 'Taom nomi' : 'Mahsulot nomi'}</Label>
                    <Input
                      id="marketplace-title"
                      value={title}
                      onChange={event => setTitle(event.target.value)}
                      placeholder={isRestaurant ? 'Masalan, To‘y oshi' : 'Masalan, iPhone 16 Pro Max'}
                      className="h-11 rounded-xl"
                    />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Asosiy narx</Label>
                      <Input type="number" min="0" step="0.01" value={price} onChange={event => setPrice(event.target.value)} placeholder="0" className="h-11 rounded-xl" />
                    </div>
                    <div className="space-y-2">
                      <Label>Eski / taqqoslash narxi</Label>
                      <Input type="number" min="0" step="0.01" value={compareAtPrice} onChange={event => setCompareAtPrice(event.target.value)} placeholder="Ixtiyoriy" className="h-11 rounded-xl" />
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Marketplace kategoriyasi</Label>
                      <Select value={categoryId} onValueChange={setCategoryId}>
                        <SelectTrigger className="h-11 rounded-xl"><SelectValue placeholder="Tanlang" /></SelectTrigger>
                        <SelectContent>
                          {categories.map(category => (
                            <SelectItem key={category.id} value={category.id}>
                              <span className="flex items-center gap-2"><CategoryIcon slug={category.slug} name={category.name} className="h-4 w-4" />{category.name}</span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {isRestaurant ? (
                      <div className="space-y-2">
                        <Label>Holati</Label>
                        <div className="flex h-11 items-center rounded-xl border border-input bg-muted/20 px-3 text-sm font-medium">
                          Yangi tayyorlanadi
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <Label>Holati</Label>
                        <Select value={condition} onValueChange={setCondition}>
                          <SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger>
                          <SelectContent>{conditions.map(item => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label>Tavsif</Label>
                    <Textarea
                      value={description}
                      onChange={event => setDescription(event.target.value)}
                      rows={5}
                      placeholder={isRestaurant ? 'Tarkibi, allergenlar, porsiya, ta’m va muhim ma’lumotlar…' : 'Xususiyatlari, komplektatsiya, kafolat va boshqa muhim ma’lumotlar…'}
                      className="rounded-xl"
                    />
                  </div>
                </section>

                {isRestaurant && (
                  <section className="space-y-4 rounded-2xl border border-sky-500/20 bg-sky-500/[0.025] p-4">
                    <div className="flex items-start gap-2">
                      <Utensils className="mt-0.5 h-4 w-4 text-sky-500" />
                      <div>
                        <h3 className="text-sm font-semibold">Restoran / menyu sozlamalari</h3>
                        <p className="text-[11px] text-muted-foreground">Porsiya, tayyorlash vaqti va xaridor tanlaydigan qo‘shimchalarni kiriting.</p>
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Restoran bo‘limi</Label>
                        <Select value={restaurantCategory} onValueChange={setRestaurantCategory}>
                          <SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {RESTAURANT_CATEGORIES.map(item => <SelectItem key={item} value={item}>{item}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Tayyorlash vaqti</Label>
                        <div className="relative">
                          <Clock3 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                          <Input type="number" min="1" max="240" value={preparationMinutes} onChange={event => setPreparationMinutes(event.target.value)} className="h-11 rounded-xl pl-9 pr-16" />
                          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">daqiqa</span>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Standart porsiya</Label>
                      <Input value={servingLabel} onChange={event => setServingLabel(event.target.value)} placeholder="Masalan, 1 porsiya · 450 g" className="h-11 rounded-xl" />
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <Label>Qo‘shimcha ingredient / optionlar</Label>
                          <p className="mt-0.5 text-[11px] text-muted-foreground">Masalan: sous, pishloq, go‘sht qo‘shimchasi yoki ichimlik.</p>
                        </div>
                        <Button type="button" variant="outline" size="sm" className="h-8 rounded-lg" onClick={addRestaurantOptionGroup}>
                          <Plus className="mr-1 h-3.5 w-3.5" /> Guruh
                        </Button>
                      </div>

                      {restaurantOptionGroups.map(group => (
                        <div key={group.id} className="space-y-3 rounded-2xl border border-border/50 bg-background p-3">
                          <div className="grid gap-2 sm:grid-cols-[1fr_90px_auto_auto] sm:items-center">
                            <Input value={group.name} onChange={event => updateRestaurantOptionGroup(group.id, { name: event.target.value })} placeholder="Qo‘shimchalar" className="h-9 rounded-lg" />
                            <Input type="number" min="1" max="20" value={group.maxSelect} onChange={event => updateRestaurantOptionGroup(group.id, { maxSelect: event.target.value })} placeholder="Max" className="h-9 rounded-lg" />
                            <label className="flex items-center gap-2 whitespace-nowrap text-xs font-medium">
                              <Switch checked={group.required} onCheckedChange={value => updateRestaurantOptionGroup(group.id, { required: value })} />
                              Majburiy
                            </label>
                            <Button type="button" variant="ghost" size="icon" className="h-9 w-9 rounded-lg text-muted-foreground hover:text-destructive" onClick={() => removeRestaurantOptionGroup(group.id)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>

                          <div className="space-y-2">
                            {group.options.map(option => (
                              <div key={option.id} className="grid grid-cols-[minmax(0,1fr)_120px_auto] gap-2">
                                <Input value={option.name} onChange={event => updateRestaurantOption(group.id, option.id, { name: event.target.value })} placeholder="Masalan, pishloq" className="h-9 rounded-lg" />
                                <Input type="number" min="0" step="0.01" value={option.price} onChange={event => updateRestaurantOption(group.id, option.id, { price: event.target.value })} placeholder="+ narx" className="h-9 rounded-lg" />
                                <Button type="button" variant="ghost" size="icon" className="h-9 w-9 rounded-lg text-muted-foreground hover:text-destructive" onClick={() => removeRestaurantOption(group.id, option.id)}>
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            ))}
                            <Button type="button" variant="ghost" size="sm" className="h-8 rounded-lg" onClick={() => addRestaurantOption(group.id)}>
                              <Plus className="mr-1 h-3.5 w-3.5" /> Option qo‘shish
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                <section className="space-y-4 rounded-2xl border border-border/50 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-start gap-2">
                      <SlidersHorizontal className="mt-0.5 h-4 w-4" />
                      <div>
                        <h3 className="text-sm font-semibold">{isRestaurant ? 'Porsiya va variantlar' : 'Variantlar'}</h3>
                        <p className="text-[11px] text-muted-foreground">
                          {isRestaurant ? 'Porsiya, hajm yoki achchiqlik kombinatsiyalariga alohida narx va qoldiq bering.' : 'Rang, o‘lcham, rusum yoki model kombinatsiyalarini avtomatik yarating.'}
                        </p>
                      </div>
                    </div>
                    <Switch checked={hasVariants} onCheckedChange={setHasVariants} />
                  </div>

                  {hasVariants && (
                    <div className="space-y-4">
                      <div className="flex flex-wrap gap-2">
                        {variantPresets.map(({ name, icon: Icon }) => (
                          <Button key={name} type="button" size="sm" variant="outline" className="h-8 rounded-lg" onClick={() => addOptionGroup(name)} disabled={optionGroups.some(group => group.name === name)}>
                            <Icon className="mr-1.5 h-3.5 w-3.5" /> {name}
                          </Button>
                        ))}
                        <Button type="button" size="sm" variant="ghost" className="h-8 rounded-lg" onClick={() => addOptionGroup()}><Plus className="mr-1.5 h-3.5 w-3.5" /> Xususiyat</Button>
                      </div>

                      <div className="space-y-2">
                        {optionGroups.map(group => (
                          <div key={group.id} className="grid gap-2 rounded-xl bg-muted/25 p-2.5 sm:grid-cols-[130px_1fr_auto]">
                            <Input value={group.name} onChange={event => updateOptionGroup(group.id, { name: event.target.value })} placeholder={isRestaurant ? 'Porsiya' : 'Rang'} className="h-10 rounded-lg" />
                            <Input value={group.valuesText} onChange={event => updateOptionGroup(group.id, { valuesText: event.target.value })} placeholder={isRestaurant ? 'Kichik, O‘rta, Katta' : 'Qora, Oq, Titan'} className="h-10 rounded-lg" />
                            <Button type="button" variant="ghost" size="icon" className="h-10 w-10 rounded-lg text-muted-foreground hover:text-destructive" onClick={() => removeOptionGroup(group.id)}><Trash2 className="h-4 w-4" /></Button>
                          </div>
                        ))}
                      </div>

                      <div className={cn('rounded-xl border px-3 py-2 text-xs', variantLimitExceeded ? 'border-destructive/40 bg-destructive/5 text-destructive' : 'border-border/50 bg-muted/20 text-muted-foreground')}>
                        {variantLimitExceeded ? `${potentialVariantCount} kombinatsiya juda ko‘p. Limit: ${MAX_VARIANTS}.` : `${generatedVariants.length} ta variant avtomatik shakllandi.`}
                      </div>

                      {!variantLimitExceeded && generatedVariants.length > 0 && (
                        <div className="overflow-hidden rounded-2xl border border-border/50">
                          <div className="grid grid-cols-[minmax(150px,1.35fr)_100px_90px_105px_100px] gap-2 border-b bg-muted/35 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                            <span>Variant</span><span>Narx</span><span>Qoldiq</span><span>SKU</span><span>Rasm</span>
                          </div>
                          <div className="max-h-72 overflow-y-auto">
                            {generatedVariants.map(variant => {
                              const edit = readVariantEdit(variant.key);
                              return (
                                <div key={variant.key} className="grid grid-cols-[minmax(150px,1.35fr)_100px_90px_105px_100px] items-center gap-2 border-b px-3 py-2 last:border-b-0">
                                  <div className="min-w-0"><p className="truncate text-xs font-semibold">{variant.label}</p><p className="truncate text-[10px] text-muted-foreground">{Object.entries(variant.options).map(([k,v]) => `${k}: ${v}`).join(' · ')}</p></div>
                                  <Input type="number" min="0" step="0.01" value={edit.price} onChange={event => updateVariant(variant.key, { price: event.target.value })} placeholder={price || 'Narx'} className="h-8 rounded-lg px-2 text-xs" />
                                  <Input type="number" min="0" value={edit.quantity} onChange={event => updateVariant(variant.key, { quantity: event.target.value })} className="h-8 rounded-lg px-2 text-xs" />
                                  <Input value={edit.sku} onChange={event => updateVariant(variant.key, { sku: event.target.value })} placeholder="SKU" className="h-8 rounded-lg px-2 text-xs" />
                                  <select value={edit.imageUrl} onChange={event => updateVariant(variant.key, { imageUrl: event.target.value })} className="h-8 min-w-0 rounded-lg border border-input bg-background px-1.5 text-[10px]">
                                    <option value="">Muqova</option>
                                    {productImages.map((item, imageIndex) => <option key={item.url} value={item.url}>Rasm {imageIndex + 1}</option>)}
                                  </select>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </section>
              </div>

              <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
                <section className="space-y-3 rounded-2xl border border-border/50 bg-muted/15 p-4">
                  <div className="flex items-center gap-2"><MapPin className="h-4 w-4" /><h3 className="text-sm font-semibold">{isRestaurant ? 'Tayyorlash / olib ketish nuqtasi' : 'Mahsulot joylashuvi'}</h3></div>
                  <button type="button" onClick={() => setShowLocationPicker(true)} className="flex min-h-20 w-full items-center gap-3 rounded-xl border border-dashed border-border bg-background p-3 text-left hover:bg-muted/35">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted"><MapPin className="h-4 w-4" /></div>
                    <div className="min-w-0 flex-1"><p className="text-sm font-semibold">{location ? 'Joylashuv tanlandi' : 'Xaritadan tanlash'}</p><p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{location?.label || (isRestaurant ? 'Restoran yoki filial joylashuvini belgilang.' : 'Joriy joyingiz shart emas — istalgan manzilni belgilang.')}</p></div>
                    {location && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
                  </button>
                  {location && <p className="text-[10px] tabular-nums text-muted-foreground">{location.latitude.toFixed(5)}, {location.longitude.toFixed(5)}</p>}
                </section>

                {!hasVariants && (
                  <section className="space-y-2 rounded-2xl border border-border/50 p-4">
                    <Label>{isRestaurant ? 'Sotuvdagi porsiya soni' : 'Ombordagi soni'}</Label>
                    <Input type="number" min="0" value={quantity} onChange={event => setQuantity(event.target.value)} className="h-11 rounded-xl" />
                  </section>
                )}

                <section className="space-y-4 rounded-2xl border border-border/50 p-4">
                  {!isRestaurant && (
                    <div className="flex items-center justify-between gap-3"><div><p className="text-sm font-medium">Narx kelishiladi</p><p className="text-[11px] text-muted-foreground">Xaridor taklif yubora oladi</p></div><Switch checked={isNegotiable} onCheckedChange={setIsNegotiable} /></div>
                  )}
                  <div className="flex items-center justify-between gap-3"><div><p className="text-sm font-medium">Yetkazib berish</p><p className="text-[11px] text-muted-foreground">{isRestaurant ? 'Kuryer orqali yetkazishni yoqing' : 'Yetkazish mavjudligini ko‘rsating'}</p></div><Switch checked={shippingAvailable} onCheckedChange={setShippingAvailable} /></div>
                  {shippingAvailable && <div className="space-y-2"><Label>Yetkazish narxi</Label><Input type="number" min="0" step="0.01" value={shippingPrice} onChange={event => setShippingPrice(event.target.value)} placeholder="0 = bepul" className="h-10 rounded-xl" /></div>}
                </section>

                <section className="rounded-2xl border border-border/50 bg-foreground/[0.03] p-4 text-xs text-muted-foreground">
                  <div className="flex gap-2"><ImageIcon className="mt-0.5 h-4 w-4 shrink-0" /><p>{isRestaurant ? 'Porsiya/hajm variantlari alohida narx va qoldiq bilan ishlaydi. Qo‘shimcha ingredientlar esa menyu metadata sifatida checkout va taom UX uchun saqlanadi.' : 'Variant narxi, qoldig‘i, SKU va rasmi alohida saqlanadi. Xaridor variantni almashtirganda mahsulot kartasidagi narx va rasm ham shu variantga o‘tadi.'}</p></div>
                </section>
              </aside>
            </div>
          </ScrollArea>

          <div className="flex items-center justify-between gap-3 border-t border-border/60 bg-background px-5 py-4">
            <p className="hidden text-xs text-muted-foreground sm:block">{hasVariants ? `${generatedVariants.length} variant · ${generatedVariants.reduce((sum, variant) => sum + Math.max(0, Number(readVariantEdit(variant.key).quantity) || 0), 0)} dona` : `${Math.max(0, Number(quantity) || 0)} dona`}</p>
            <Button className="ml-auto h-11 min-w-44 rounded-xl" onClick={() => void handleSubmit()} disabled={!title.trim() || !price || isSubmitting || isUploading || (hasVariants && (variantLimitExceeded || generatedVariants.length === 0))}>
              {isSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saqlanmoqda…</> : <><PackagePlus className="mr-2 h-4 w-4" /> {isRestaurant ? 'Menyuga qo‘shish' : 'E’lon qilish'}</>}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <MarketplaceLocationPicker
        open={showLocationPicker}
        onOpenChange={setShowLocationPicker}
        value={location}
        onSelect={setLocation}
        title={isRestaurant ? 'Restoran / filial joylashuvini tanlang' : 'Mahsulot joylashuvini tanlang'}
        description={isRestaurant ? 'Bu nuqta olib ketish va kuryer yo‘nalishlarida ishlatiladi.' : 'Mahsulot qayerda ekanini aniq belgilang. Bu nuqta yaqin atrof qidiruvi va xarita funksiyalarida ishlatiladi.'}
      />
    </>
  );
}
