import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronLeft,
  Image as ImageIcon,
  Loader2,
  MapPin,
  PackageCheck,
  Play,
  Save,
  ShieldCheck,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { CategoryIcon } from '@/components/marketplace/CategoryIcon';
import {
  MarketplaceLocationPicker,
  type MarketplaceLocationValue,
} from '@/components/marketplace/MarketplaceLocationPicker';
import { useAuth } from '@/contexts/AuthContext';
import {
  fetchMarketplaceProductById,
  type Product,
  type ProductVariant,
  useCategories,
  useProductVariants,
} from '@/hooks/useMarketplace';
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/supabaseAny';
import { cn } from '@/lib/utils';
import { formatPrice } from '@/lib/marketplace';
import { resolveStorageUrlCandidates } from '@/lib/mediaUpload';
import {
  MAX_PRODUCT_MEDIA,
  MAX_PRODUCT_VIDEOS,
  PRODUCT_MEDIA_ACCEPT,
  ProductMediaError,
  type ProductMediaDraft,
  formatMediaDuration,
  orderProductMedia,
  prepareProductMedia,
  productMediaErrorMessage,
} from '@/lib/productMedia';

const NO_CATEGORY = '__none__';

const CONDITIONS = [
  { value: 'new', label: 'Yangi' },
  { value: 'like_new', label: 'Yangiday' },
  { value: 'good', label: 'Yaxshi' },
  { value: 'fair', label: "O‘rtacha" },
  { value: 'used', label: 'Ishlatilgan' },
  { value: 'refurbished', label: 'Tiklangan' },
];

const STATUS_OPTIONS = [
  { value: 'active', label: 'Sotuvda' },
  { value: 'inactive', label: 'Vaqtincha to‘xtatilgan' },
];

type VariantEdit = {
  sku: string;
  price: string;
  compareAtPrice: string;
  quantity: string;
  imageUrl: string;
};

type MediaRow = Record<string, unknown> & {
  id?: string;
  product_id?: string;
  url?: string;
  position?: number;
  media_type?: string;
  thumbnail_url?: string | null;
  duration_seconds?: number | null;
};

function mediaWriteError(error: unknown) {
  if (!error || typeof error !== 'object') return false;
  const value = error as { code?: string; message?: string; details?: string; hint?: string };
  const text = [value.message, value.details, value.hint].filter(Boolean).join(' ').toLowerCase();
  return value.code === 'PGRST204' || (
    (text.includes('media_type') || text.includes('thumbnail_url') || text.includes('duration_seconds')) &&
    (text.includes('column') || text.includes('schema cache'))
  );
}

function snapshotRow(row: MediaRow) {
  const next: Record<string, unknown> = {};
  const fields = [
    'id',
    'product_id',
    'url',
    'position',
    'media_type',
    'thumbnail_url',
    'duration_seconds',
    'created_at',
  ];
  fields.forEach(field => {
    if (row[field] !== undefined) next[field] = row[field];
  });
  return next;
}

async function replaceProductMediaSafely(productId: string, media: ProductMediaDraft[]) {
  const snapshotQuery = await db
    .from('product_images')
    .select('*')
    .eq('product_id', productId)
    .order('position', { ascending: true });

  if (snapshotQuery.error) {
    return { ok: false as const, error: snapshotQuery.error };
  }

  const snapshot = ((snapshotQuery.data ?? []) as MediaRow[]).map(snapshotRow);
  const restore = async () => {
    await db.from('product_images').delete().eq('product_id', productId);
    if (snapshot.length > 0) {
      const restored = await db.from('product_images').insert(snapshot);
      if (restored.error) console.error('Marketplace edit media rollback failed:', restored.error);
    }
  };

  const ordered = orderProductMedia(media).slice(0, MAX_PRODUCT_MEDIA);
  const deleted = await db.from('product_images').delete().eq('product_id', productId);
  if (deleted.error) {
    return { ok: false as const, error: deleted.error };
  }

  if (ordered.length === 0) {
    return { ok: true as const, rollback: restore };
  }

  const richRows = ordered.map((item, index) => ({
    product_id: productId,
    url: item.url,
    position: index,
    media_type: item.mediaType,
    thumbnail_url: item.thumbnailUrl,
    duration_seconds: item.durationSeconds,
  }));
  const richInsert = await db.from('product_images').insert(richRows);
  if (!richInsert.error) {
    return { ok: true as const, rollback: restore };
  }

  if (ordered.every(item => item.mediaType === 'image') && mediaWriteError(richInsert.error)) {
    const legacyRows = ordered.map((item, index) => ({
      product_id: productId,
      url: item.url,
      position: index,
    }));
    const legacyInsert = await db.from('product_images').insert(legacyRows);
    if (!legacyInsert.error) {
      return { ok: true as const, rollback: restore };
    }
    await restore();
    return { ok: false as const, error: legacyInsert.error };
  }

  await restore();
  return { ok: false as const, error: richInsert.error };
}

function rawMediaToDraft(row: MediaRow): ProductMediaDraft | null {
  const url = typeof row.url === 'string' ? row.url : '';
  if (!url) return null;
  return {
    url,
    mediaType: row.media_type === 'video' ? 'video' : 'image',
    thumbnailUrl: typeof row.thumbnail_url === 'string' ? row.thumbnail_url : null,
    durationSeconds: row.duration_seconds == null ? null : Number(row.duration_seconds),
  };
}

function MediaPreview({ item }: { item: ProductMediaDraft }) {
  const raw = item.mediaType === 'video' ? item.thumbnailUrl || '' : item.url;
  const [candidates, setCandidates] = useState<string[]>(() => (/^https?:/i.test(raw) ? [raw] : []));
  const [index, setIndex] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setCandidates(/^https?:/i.test(raw) ? [raw] : []);
    setIndex(0);
    if (!raw) return () => { cancelled = true; };
    void resolveStorageUrlCandidates(raw)
      .then(result => {
        if (!cancelled) setCandidates(result.length > 0 ? result : (/^https?:/i.test(raw) ? [raw] : []));
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [raw]);

  const source = candidates[index];
  if (!source) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-muted text-muted-foreground/50">
        {item.mediaType === 'video' ? <Play className="h-7 w-7" /> : <ImageIcon className="h-7 w-7" />}
      </div>
    );
  }

  return (
    <img
      src={source}
      alt=""
      className="h-full w-full object-cover"
      loading="lazy"
      decoding="async"
      onError={() => setIndex(current => current + 1)}
    />
  );
}

function variantLabel(variant: ProductVariant) {
  const values = Object.values(variant.options ?? {}).filter(Boolean);
  return values.length > 0 ? values.join(' · ') : variant.sku || 'Variant';
}

export default function MarketplaceProductEditPage() {
  const { productId } = useParams<{ productId: string }>();
  const navigate = useNavigate();
  const { user, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const { categories } = useCategories();

  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [mediaLoading, setMediaLoading] = useState(false);
  const [mediaLoadError, setMediaLoadError] = useState<string | null>(null);
  const [mediaDirty, setMediaDirty] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [location, setLocation] = useState<MarketplaceLocationValue | null>(null);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [compareAtPrice, setCompareAtPrice] = useState('');
  const [categoryId, setCategoryId] = useState(NO_CATEGORY);
  const [condition, setCondition] = useState('new');
  const [quantity, setQuantity] = useState('0');
  const [status, setStatus] = useState('active');
  const [shippingAvailable, setShippingAvailable] = useState(true);
  const [shippingPrice, setShippingPrice] = useState('0');
  const [isNegotiable, setIsNegotiable] = useState(false);
  const [media, setMedia] = useState<ProductMediaDraft[]>([]);
  const [variantEdits, setVariantEdits] = useState<Record<string, VariantEdit>>({});

  const { variants, isLoading: variantsLoading } = useProductVariants(product?.id);

  useEffect(() => {
    if (!productId) {
      setLoadError('Mahsulot identifikatori topilmadi.');
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    void fetchMarketplaceProductById(productId)
      .then(result => {
        if (cancelled) return;
        if (!result) {
          setLoadError('Mahsulot topilmadi yoki sizda unga kirish huquqi yo‘q.');
          return;
        }
        setProduct(result);
        setTitle(result.title || '');
        setDescription(result.description || '');
        setPrice(String(Number(result.price ?? 0)));
        setCompareAtPrice(result.compare_at_price == null ? '' : String(Number(result.compare_at_price)));
        setCategoryId(result.category_id || NO_CATEGORY);
        setCondition(result.condition || 'new');
        setQuantity(String(Math.max(0, Number(result.quantity ?? 0))));
        setStatus(result.status === 'inactive' ? 'inactive' : 'active');
        setShippingAvailable(Boolean(result.shipping_available));
        setShippingPrice(String(Math.max(0, Number(result.shipping_price ?? 0))));
        setIsNegotiable(Boolean(result.is_negotiable));

        const lat = Number(result.latitude);
        const lng = Number(result.longitude);
        if (
          Number.isFinite(lat) && Number.isFinite(lng) &&
          Math.abs(lat) <= 90 && Math.abs(lng) <= 180 &&
          !(lat === 0 && lng === 0)
        ) {
          setLocation({
            label: result.location?.trim() || result.title,
            latitude: lat,
            longitude: lng,
          });
        }
      })
      .catch(error => {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : 'Mahsulot yuklanmadi.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [productId]);

  useEffect(() => {
    if (!product?.id) return;
    let cancelled = false;
    setMediaLoading(true);
    setMediaLoadError(null);
    void db
      .from('product_images')
      .select('*')
      .eq('product_id', product.id)
      .order('position', { ascending: true })
      .then(({ data, error }: { data: MediaRow[] | null; error: any }) => {
        if (cancelled) return;
        if (error) {
          setMediaLoadError('Mavjud media yuklanmadi. Media o‘zgartirilmasa boshqa maydonlarni saqlash mumkin.');
          return;
        }
        setMedia((data ?? []).map(rawMediaToDraft).filter(Boolean) as ProductMediaDraft[]);
        setMediaDirty(false);
      })
      .finally(() => {
        if (!cancelled) setMediaLoading(false);
      });
    return () => { cancelled = true; };
  }, [product?.id]);

  useEffect(() => {
    if (variants.length === 0) {
      setVariantEdits({});
      return;
    }
    const next: Record<string, VariantEdit> = {};
    variants.forEach(variant => {
      next[variant.id] = {
        sku: variant.sku || '',
        price: variant.price == null ? '' : String(Number(variant.price)),
        compareAtPrice: variant.compare_at_price == null ? '' : String(Number(variant.compare_at_price)),
        quantity: String(Math.max(0, Number(variant.quantity ?? 0))),
        imageUrl: variant.image_url || '',
      };
    });
    setVariantEdits(next);
  }, [variants]);

  const owner = Boolean(product && user?.id && product.seller?.user_id === user.id);
  const videoCount = media.filter(item => item.mediaType === 'video').length;
  const orderedMedia = useMemo(() => orderProductMedia(media), [media]);
  const totalVariantStock = useMemo(
    () => variants.reduce((sum, variant) => sum + Math.max(0, Number(variantEdits[variant.id]?.quantity ?? variant.quantity ?? 0)), 0),
    [variantEdits, variants],
  );

  const updateVariant = (variantId: string, patch: Partial<VariantEdit>) => {
    setVariantEdits(previous => ({
      ...previous,
      [variantId]: {
        ...(previous[variantId] ?? { sku: '', price: '', compareAtPrice: '', quantity: '0', imageUrl: '' }),
        ...patch,
      },
    }));
  };

  const addMedia = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    let accepted = [...media];
    const reported = new Set<string>();

    for (const file of Array.from(files)) {
      try {
        const prepared = await prepareProductMedia(file, accepted);
        accepted = orderProductMedia([...accepted, prepared]);
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

    setMedia(accepted);
    setMediaDirty(true);
    setUploading(false);
    event.target.value = '';
  };

  const removeMedia = (index: number) => {
    setMedia(current => orderProductMedia(current.filter((_, currentIndex) => currentIndex !== index)));
    setMediaDirty(true);
  };

  const moveMedia = (index: number, direction: -1 | 1) => {
    setMedia(current => {
      const next = [...current];
      const target = index + direction;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return orderProductMedia(next);
    });
    setMediaDirty(true);
  };

  const handleSave = async () => {
    if (!product || !owner || saving) return;
    const numericPrice = Number(price);
    const numericCompareAt = compareAtPrice.trim() ? Number(compareAtPrice) : null;
    const numericQuantity = Math.max(0, Math.floor(Number(quantity) || 0));
    const numericShipping = Math.max(0, Number(shippingPrice) || 0);

    if (!title.trim()) {
      toast({ title: 'Mahsulot nomini kiriting', variant: 'destructive' });
      return;
    }
    if (!Number.isFinite(numericPrice) || numericPrice < 0) {
      toast({ title: 'Narxni tekshiring', description: 'Narx 0 yoki undan katta bo‘lishi kerak.', variant: 'destructive' });
      return;
    }
    if (numericCompareAt != null && (!Number.isFinite(numericCompareAt) || numericCompareAt <= numericPrice)) {
      toast({ title: 'Eski narxni tekshiring', description: 'Taqqoslash narxi amaldagi narxdan katta bo‘lishi kerak.', variant: 'destructive' });
      return;
    }

    for (const variant of variants) {
      const edit = variantEdits[variant.id];
      if (!edit) continue;
      const variantPrice = edit.price.trim() ? Number(edit.price) : null;
      const variantCompare = edit.compareAtPrice.trim() ? Number(edit.compareAtPrice) : null;
      if (variantPrice != null && (!Number.isFinite(variantPrice) || variantPrice < 0)) {
        toast({ title: `${variantLabel(variant)} narxini tekshiring`, variant: 'destructive' });
        return;
      }
      const effective = variantPrice ?? numericPrice;
      if (variantCompare != null && (!Number.isFinite(variantCompare) || variantCompare <= effective)) {
        toast({ title: `${variantLabel(variant)} eski narxini tekshiring`, variant: 'destructive' });
        return;
      }
    }

    if (mediaDirty && mediaLoadError) {
      toast({
        title: 'Media xavfsiz tahrirlanmadi',
        description: 'Mavjud media ro‘yxatini yuklab bo‘lmagani uchun uning ustiga yozish bloklandi. Sahifani yangilab qayta urinib ko‘ring.',
        variant: 'destructive',
      });
      return;
    }

    setSaving(true);
    let mediaRollback: (() => Promise<void>) | undefined;
    let variantsChanged = false;

    try {
      if (mediaDirty) {
        const mediaResult = await replaceProductMediaSafely(product.id, orderedMedia);
        if (!mediaResult.ok) {
          throw new Error('Rasm va videolarni saqlashda xatolik yuz berdi. Eski media tiklandi.');
        }
        mediaRollback = mediaResult.rollback;
      }

      if (variants.length > 0) {
        const variantRows = variants.map(variant => {
          const edit = variantEdits[variant.id];
          return {
            id: variant.id,
            product_id: product.id,
            sku: edit?.sku.trim() || null,
            options: variant.options ?? {},
            price: edit?.price.trim() ? Number(edit.price) : null,
            compare_at_price: edit?.compareAtPrice.trim() ? Number(edit.compareAtPrice) : null,
            quantity: Math.max(0, Math.floor(Number(edit?.quantity ?? variant.quantity) || 0)),
            image_url: edit?.imageUrl || null,
            is_active: variant.is_active,
            position: variant.position,
          };
        });
        const variantResult = await db.from('product_variants').upsert(variantRows);
        if (variantResult.error) {
          if (mediaRollback) await mediaRollback();
          throw new Error('Variantlar saqlanmadi. Media o‘zgarishlari bekor qilindi.');
        }
        variantsChanged = true;
      }

      const updates = {
        title: title.trim(),
        description: description.trim() || null,
        price: numericPrice,
        compare_at_price: numericCompareAt,
        currency: 'UZS',
        category_id: categoryId === NO_CATEGORY ? null : categoryId,
        condition,
        quantity: variants.length > 0 ? totalVariantStock : numericQuantity,
        status,
        shipping_available: shippingAvailable,
        shipping_price: shippingAvailable ? numericShipping : 0,
        is_negotiable: isNegotiable,
        location: location?.label || product.location || null,
        latitude: location?.latitude ?? product.latitude ?? null,
        longitude: location?.longitude ?? product.longitude ?? null,
      };

      const productResult = await db
        .from('products')
        .update(updates)
        .eq('id', product.id)
        .eq('seller_id', product.seller_id);

      if (productResult.error) {
        if (mediaRollback) await mediaRollback();
        if (variantsChanged) {
          const rollbackRows = variants.map(variant => ({
            id: variant.id,
            product_id: variant.product_id,
            sku: variant.sku,
            options: variant.options,
            price: variant.price,
            compare_at_price: variant.compare_at_price,
            quantity: variant.quantity,
            image_url: variant.image_url,
            is_active: variant.is_active,
            position: variant.position,
          }));
          const rollback = await db.from('product_variants').upsert(rollbackRows);
          if (rollback.error) console.error('Marketplace variant rollback failed:', rollback.error);
        }
        throw new Error('Mahsulot ma’lumotlari saqlanmadi. Oldingi holatni tiklashga urinildi.');
      }

      toast({
        title: 'Mahsulot yangilandi',
        description: mediaDirty
          ? 'Ma’lumotlar va media saqlandi. Marketplace kartalari yangi holatni ko‘rsatadi.'
          : 'Mahsulot ma’lumotlari saqlandi.',
      });
      navigate(`/marketplace/product/${product.id}`, { replace: true });
    } catch (error) {
      console.error('Marketplace product edit failed:', error);
      toast({
        title: 'Saqlab bo‘lmadi',
        description: error instanceof Error ? error.message : 'Kutilmagan xatolik yuz berdi.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading || authLoading) {
    return (
      <div className="flex min-h-[65vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-sm text-muted-foreground">
          <Loader2 className="h-7 w-7 animate-spin" />
          Mahsulot tahriri yuklanmoqda…
        </div>
      </div>
    );
  }

  if (loadError || !product) {
    return (
      <div className="mx-auto flex min-h-[65vh] max-w-lg flex-col items-center justify-center gap-4 px-6 text-center">
        <AlertTriangle className="h-12 w-12 text-muted-foreground/50" />
        <div>
          <h1 className="text-lg font-bold">Mahsulotni ochib bo‘lmadi</h1>
          <p className="mt-1 text-sm text-muted-foreground">{loadError || 'Mahsulot topilmadi.'}</p>
        </div>
        <Button variant="outline" className="rounded-xl" onClick={() => navigate('/marketplace')}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Bozorga qaytish
        </Button>
      </div>
    );
  }

  if (!user || !owner) {
    return (
      <div className="mx-auto flex min-h-[65vh] max-w-lg flex-col items-center justify-center gap-4 px-6 text-center">
        <ShieldCheck className="h-12 w-12 text-muted-foreground/50" />
        <div>
          <h1 className="text-lg font-bold">Faqat sotuvchi tahrirlay oladi</h1>
          <p className="mt-1 text-sm text-muted-foreground">Bu mahsulot sizning sotuvchi profilingizga tegishli emas.</p>
        </div>
        <Button variant="outline" className="rounded-xl" onClick={() => navigate(`/marketplace/product/${product.id}`)}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Mahsulotga qaytish
        </Button>
      </div>
    );
  }

  return (
    <div className="marketplace-neutral min-h-screen bg-background pb-28">
      <header className="sticky top-0 z-40 border-b border-border/50 bg-background/94 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-6xl items-center gap-3 px-4 py-3 lg:px-6">
          <Button variant="ghost" size="icon" className="h-10 w-10 rounded-xl" onClick={() => navigate(`/marketplace/product/${product.id}`)} aria-label="Orqaga">
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-extrabold sm:text-lg">Mahsulotni tahrirlash</h1>
            <p className="truncate text-[11px] text-muted-foreground">{product.title}</p>
          </div>
          <div className="hidden items-center gap-2 sm:flex">
            <span className={cn(
              'rounded-full px-2.5 py-1 text-[11px] font-bold',
              status === 'active' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-muted text-muted-foreground',
            )}>
              {status === 'active' ? 'Sotuvda' : 'To‘xtatilgan'}
            </span>
            <Button className="h-10 rounded-xl" onClick={() => void handleSave()} disabled={saving || uploading}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Saqlash
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-6xl gap-5 px-4 py-5 lg:grid-cols-[minmax(0,1fr)_340px] lg:px-6">
        <div className="min-w-0 space-y-5">
          <section className="space-y-4 rounded-3xl border border-border/60 bg-card p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-bold">Rasm va videolar</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">Birinchi rasm Marketplace kartasining muqovasi bo‘ladi.</p>
              </div>
              <span className="text-[11px] font-medium text-muted-foreground">{media.length}/{MAX_PRODUCT_MEDIA} · video {videoCount}/{MAX_PRODUCT_VIDEOS}</span>
            </div>

            {mediaLoadError && (
              <div className="flex gap-2 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-400">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{mediaLoadError}</span>
              </div>
            )}

            {mediaLoading ? (
              <div className="flex h-32 items-center justify-center rounded-2xl bg-muted/30">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                {media.map((item, index) => (
                  <div key={`${item.url}-${index}`} className="group relative aspect-square overflow-hidden rounded-2xl border border-border/50 bg-muted">
                    <MediaPreview item={item} />
                    <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-gradient-to-t from-black/70 to-transparent p-2 pt-8 text-white">
                      <div className="flex min-w-0 items-center gap-1.5 text-[10px] font-semibold">
                        {item.mediaType === 'video' ? <Play className="h-3 w-3 fill-current" /> : <ImageIcon className="h-3 w-3" />}
                        <span className="truncate">
                          {item.mediaType === 'video' ? formatMediaDuration(item.durationSeconds) || 'Video' : index === 0 ? 'Muqova' : `Rasm ${index + 1}`}
                        </span>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <button type="button" disabled={index === 0} onClick={() => moveMedia(index, -1)} className="flex h-7 w-7 items-center justify-center rounded-full bg-black/45 disabled:opacity-30" aria-label="Chapga">
                          <ArrowLeft className="h-3.5 w-3.5" />
                        </button>
                        <button type="button" disabled={index === media.length - 1} onClick={() => moveMedia(index, 1)} className="flex h-7 w-7 items-center justify-center rounded-full bg-black/45 disabled:opacity-30" aria-label="O‘ngga">
                          <ArrowRight className="h-3.5 w-3.5" />
                        </button>
                        <button type="button" onClick={() => removeMedia(index)} className="flex h-7 w-7 items-center justify-center rounded-full bg-red-500/85" aria-label="O‘chirish">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}

                {media.length < MAX_PRODUCT_MEDIA && (
                  <label className={cn(
                    'flex aspect-square cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border bg-muted/20 text-center transition hover:bg-muted/45',
                    uploading && 'pointer-events-none opacity-60',
                  )}>
                    <input type="file" accept={PRODUCT_MEDIA_ACCEPT} multiple className="hidden" onChange={addMedia} disabled={uploading} />
                    {uploading ? <Loader2 className="h-6 w-6 animate-spin" /> : <Upload className="h-6 w-6" />}
                    <span className="mt-2 text-xs font-semibold">Media qo‘shish</span>
                    <span className="mt-0.5 px-2 text-[10px] text-muted-foreground">Rasm, MP4, WebM yoki MOV</span>
                  </label>
                )}
              </div>
            )}

            {!mediaLoading && media.length === 0 && (
              <div className="rounded-2xl border border-dashed border-amber-500/30 bg-amber-500/[0.04] p-3 text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">Mahsulotda rasm yo‘q.</span> Yangi rasm qo‘shib saqlasangiz, u product detail, “Hozir ommabop” va katalog kartalarida ishlatiladi.
              </div>
            )}
          </section>

          <section className="space-y-4 rounded-3xl border border-border/60 bg-card p-4 sm:p-5">
            <div>
              <h2 className="font-bold">Asosiy ma’lumot</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">Xaridor ko‘radigan nom, tavsif, kategoriya va holat.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-product-title">Mahsulot nomi</Label>
              <Input id="edit-product-title" value={title} onChange={event => setTitle(event.target.value)} maxLength={180} className="h-11 rounded-xl" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-product-description">Tavsif</Label>
              <Textarea id="edit-product-description" value={description} onChange={event => setDescription(event.target.value)} rows={6} className="rounded-xl" placeholder="Xususiyatlari, komplektatsiya, kafolat va boshqa muhim ma’lumotlar…" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Kategoriya</Label>
                <Select value={categoryId} onValueChange={setCategoryId}>
                  <SelectTrigger className="h-11 rounded-xl"><SelectValue placeholder="Tanlang" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_CATEGORY}>Kategoriyasiz</SelectItem>
                    {categories.map(category => (
                      <SelectItem key={category.id} value={category.id}>
                        <span className="flex items-center gap-2"><CategoryIcon slug={category.slug} name={category.name} className="h-4 w-4" />{category.name}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Holati</Label>
                <Select value={condition} onValueChange={setCondition}>
                  <SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>{CONDITIONS.map(item => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
          </section>

          {variants.length > 0 && (
            <section className="space-y-4 rounded-3xl border border-border/60 bg-card p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="font-bold">Variantlar</h2>
                  <p className="mt-0.5 text-xs text-muted-foreground">Narx, SKU va ombor qoldig‘ini har bir variant uchun alohida boshqaring.</p>
                </div>
                <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-semibold">Jami {totalVariantStock} dona</span>
              </div>
              {variantsLoading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <div className="space-y-3">
                  {variants.map(variant => {
                    const edit = variantEdits[variant.id];
                    return (
                      <div key={variant.id} className="rounded-2xl border border-border/50 p-3">
                        <div className="mb-3 flex min-w-0 items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-bold">{variantLabel(variant)}</p>
                            <p className="truncate text-[10px] text-muted-foreground">{Object.entries(variant.options ?? {}).map(([key, value]) => `${key}: ${value}`).join(' · ')}</p>
                          </div>
                          <span className="text-[11px] font-semibold text-muted-foreground">{formatPrice(Number(edit?.price || price || 0), 'UZS')}</span>
                        </div>
                        <div className="grid gap-2 sm:grid-cols-4">
                          <div className="space-y-1"><Label className="text-[10px]">Narx</Label><Input type="number" min="0" value={edit?.price ?? ''} onChange={event => updateVariant(variant.id, { price: event.target.value })} placeholder="Asosiy" className="h-9 rounded-lg" /></div>
                          <div className="space-y-1"><Label className="text-[10px]">Eski narx</Label><Input type="number" min="0" value={edit?.compareAtPrice ?? ''} onChange={event => updateVariant(variant.id, { compareAtPrice: event.target.value })} placeholder="Ixtiyoriy" className="h-9 rounded-lg" /></div>
                          <div className="space-y-1"><Label className="text-[10px]">Qoldiq</Label><Input type="number" min="0" value={edit?.quantity ?? '0'} onChange={event => updateVariant(variant.id, { quantity: event.target.value })} className="h-9 rounded-lg" /></div>
                          <div className="space-y-1"><Label className="text-[10px]">SKU</Label><Input value={edit?.sku ?? ''} onChange={event => updateVariant(variant.id, { sku: event.target.value })} className="h-9 rounded-lg" /></div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          )}
        </div>

        <aside className="space-y-5 lg:sticky lg:top-24 lg:self-start">
          <section className="space-y-4 rounded-3xl border border-border/60 bg-card p-4">
            <div className="flex items-center gap-2">
              <PackageCheck className="h-4 w-4" />
              <h2 className="font-bold">Savdo sozlamalari</h2>
            </div>
            <div className="space-y-2">
              <Label>Holat</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>{STATUS_OPTIONS.map(item => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-2">
                <Label>Amaldagi narx</Label>
                <Input type="number" min="0" step="1" value={price} onChange={event => setPrice(event.target.value)} className="h-11 rounded-xl" />
              </div>
              <div className="space-y-2">
                <Label>Eski narx</Label>
                <Input type="number" min="0" step="1" value={compareAtPrice} onChange={event => setCompareAtPrice(event.target.value)} placeholder="Ixtiyoriy" className="h-11 rounded-xl" />
              </div>
            </div>
            {variants.length === 0 ? (
              <div className="space-y-2">
                <Label>Ombordagi soni</Label>
                <Input type="number" min="0" value={quantity} onChange={event => setQuantity(event.target.value)} className="h-11 rounded-xl" />
              </div>
            ) : (
              <div className="rounded-xl bg-muted/40 px-3 py-2.5 text-xs text-muted-foreground">
                Qoldiq variantlar bo‘yicha hisoblanadi: <span className="font-bold text-foreground">{totalVariantStock} dona</span>.
              </div>
            )}
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-border/50 p-3">
              <div><p className="text-sm font-semibold">Narx kelishiladi</p><p className="text-[10px] text-muted-foreground">Xaridor taklif yubora oladi</p></div>
              <Switch checked={isNegotiable} onCheckedChange={setIsNegotiable} />
            </div>
          </section>

          <section className="space-y-4 rounded-3xl border border-border/60 bg-card p-4">
            <div className="flex items-center gap-2"><MapPin className="h-4 w-4" /><h2 className="font-bold">Joylashuv va yetkazish</h2></div>
            <button type="button" onClick={() => setShowLocationPicker(true)} className="flex w-full items-center gap-3 rounded-2xl border border-dashed border-border bg-muted/15 p-3 text-left hover:bg-muted/35">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted"><MapPin className="h-4 w-4" /></div>
              <div className="min-w-0 flex-1"><p className="text-sm font-semibold">{location ? 'Joylashuv tanlangan' : 'Xaritadan tanlash'}</p><p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">{location?.label || product.location || 'Mahsulot joylashuvini belgilang'}</p></div>
              {location && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
            </button>
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-border/50 p-3">
              <div><p className="text-sm font-semibold">Yetkazib berish</p><p className="text-[10px] text-muted-foreground">Kuryer/yetkazish mavjudligini ko‘rsatadi</p></div>
              <Switch checked={shippingAvailable} onCheckedChange={setShippingAvailable} />
            </div>
            {shippingAvailable && (
              <div className="space-y-2"><Label>Yetkazish narxi</Label><Input type="number" min="0" value={shippingPrice} onChange={event => setShippingPrice(event.target.value)} className="h-11 rounded-xl" /><p className="text-[10px] text-muted-foreground">0 = bepul yetkazish</p></div>
            )}
          </section>

          <section className="rounded-3xl border border-emerald-500/15 bg-emerald-500/[0.035] p-4 text-xs text-muted-foreground">
            <div className="flex gap-2"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /><p>Saqlash paytida media avval zaxiralanadi. Yangi media yozilishi muvaffaqiyatsiz bo‘lsa, eski rasm va videolar avtomatik tiklanadi.</p></div>
          </section>
        </aside>
      </main>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border/60 bg-background/95 p-3 backdrop-blur-xl sm:hidden">
        <div className="mx-auto flex max-w-6xl gap-2">
          <Button variant="outline" className="h-11 flex-1 rounded-xl" onClick={() => navigate(`/marketplace/product/${product.id}`)}>
            <X className="mr-2 h-4 w-4" /> Bekor qilish
          </Button>
          <Button className="h-11 flex-[1.25] rounded-xl" onClick={() => void handleSave()} disabled={saving || uploading}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Saqlash
          </Button>
        </div>
      </div>

      <MarketplaceLocationPicker
        open={showLocationPicker}
        onOpenChange={setShowLocationPicker}
        value={location}
        onSelect={setLocation}
        title="Mahsulot joylashuvini tanlang"
        description="Bu nuqta yaqin atrof qidiruvi, yetkazish masofasi va Alsamos Map uchun ishlatiladi."
      />
    </div>
  );
}
