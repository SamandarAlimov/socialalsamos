import { useState } from 'react';
import { X, Plus, Loader2, Trash2, SlidersHorizontal, Play } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import { CategoryIcon } from '@/components/marketplace/CategoryIcon';
import { useCategories, useProductActions } from '@/hooks/useMarketplace';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { marketplaceUz } from '@/i18n/marketplace';
import { cn } from '@/lib/utils';
import {
  MAX_PRODUCT_MEDIA,
  MAX_PRODUCT_VIDEOS,
  PRODUCT_MEDIA_ACCEPT,
  ProductMediaDraft,
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

const copy = marketplaceUz.productForm;
const conditions = [
  { value: 'new', label: copy.conditions.new },
  { value: 'like_new', label: copy.conditions.like_new },
  { value: 'good', label: copy.conditions.good },
  { value: 'fair', label: copy.conditions.fair },
];

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

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [condition, setCondition] = useState('new');
  const [location, setLocation] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [isNegotiable, setIsNegotiable] = useState(false);
  const [shippingAvailable, setShippingAvailable] = useState(true);
  const [shippingPrice, setShippingPrice] = useState('0');
  const [media, setMedia] = useState<ProductMediaDraft[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasVariants, setHasVariants] = useState(false);
  const [variantDrafts, setVariantDrafts] = useState<Array<{
    optionsText: string;
    price: string;
    quantity: string;
    sku: string;
  }>>([
    { optionsText: '', price: '', quantity: '1', sku: '' },
  ]);

  const videoCount = media.filter(item => item.mediaType === 'video').length;

  const handleMediaUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || !user) return;

    const selected = Array.from(files);
    // Bir xil xatoni har bir fayl uchun takrorlab ko'rsatmaymiz.
    const reported = new Set<string>();
    setIsUploading(true);

    // Ketma-ket: har bir fayl o'zidan oldingilarni hisobga olib tekshiriladi,
    // aks holda 10/2 limitlarini bir vaqtda tanlangan fayllar buzib ketardi.
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
    setMedia(previous => previous.filter((_, current) => current !== index));
  };

  const addVariantDraft = () => {
    setVariantDrafts(previous => [
      ...previous,
      { optionsText: '', price: '', quantity: '1', sku: '' },
    ]);
  };

  const updateVariantDraft = (
    index: number,
    key: 'optionsText' | 'price' | 'quantity' | 'sku',
    value: string,
  ) => {
    setVariantDrafts(previous =>
      previous.map((draft, current) =>
        current === index ? { ...draft, [key]: value } : draft,
      ),
    );
  };

  const removeVariantDraft = (index: number) => {
    setVariantDrafts(previous =>
      previous.length <= 1
        ? [{ optionsText: '', price: '', quantity: '1', sku: '' }]
        : previous.filter((_, current) => current !== index),
    );
  };

  const parseVariantOptions = (value: string) => {
    const options: Record<string, string> = {};
    value
      .split(';')
      .map(part => part.trim())
      .filter(Boolean)
      .forEach(part => {
        const separator = part.indexOf('=');
        if (separator <= 0) return;
        const name = part.slice(0, separator).trim();
        const optionValue = part.slice(separator + 1).trim();
        if (name && optionValue) options[name] = optionValue;
      });
    return options;
  };

  const handleSubmit = async () => {
    if (!title.trim() || !price || isUploading) return;

    const parsedVariants = hasVariants
      ? variantDrafts
          .map(draft => ({
            options: parseVariantOptions(draft.optionsText),
            price: draft.price.trim() ? Number(draft.price) : null,
            quantity: Math.max(0, Math.floor(Number(draft.quantity) || 0)),
            sku: draft.sku.trim() || null,
          }))
          .filter(variant => Object.keys(variant.options).length > 0)
      : [];

    if (hasVariants && parsedVariants.length === 0) return;

    if (hasVariants) {
      const variantsReady = await checkProductVariantsReady();
      if (!variantsReady) {
        setIsSubmitting(false);
        return;
      }
    }

    const totalVariantStock = parsedVariants.reduce(
      (sum, variant) => sum + variant.quantity,
      0,
    );

    setIsSubmitting(true);
    // Media satrlari syncProductMedia orqali yoziladi — faqat o'sha yerda
    // media_type, poster va tartib to'g'ri o'rnatiladi.
    const result = await createProduct({
      title: title.trim(),
      description: description.trim() || undefined,
      price: parseFloat(price),
      category_id: categoryId || undefined,
      condition,
      location: location.trim() || undefined,
      quantity: hasVariants ? totalVariantStock : (parseInt(quantity) || 1),
      is_negotiable: isNegotiable,
      shipping_available: shippingAvailable,
      shipping_price: parseFloat(shippingPrice) || 0,
    }, []);

    if (!result) {
      setIsSubmitting(false);
      return;
    }

    if (media.length > 0) {
      const mediaSaved = await syncProductMedia(result.id, media);
      if (!mediaSaved) {
        toast({
          title: copy.photos,
          description:
            "Mahsulot saqlandi, lekin media yozilmadi. Tahrirlash orqali qayta yuklang.",
          variant: 'destructive',
        });
      }
    }

    if (hasVariants) {
      const variantsSaved = await createProductVariants(result.id, parsedVariants);
      if (!variantsSaved) {
        await rollbackCreatedProduct(result.id);
        setIsSubmitting(false);
        return;
      }
    }

    setIsSubmitting(false);
    setTitle('');
    setDescription('');
    setPrice('');
    setCategoryId('');
    setCondition('new');
    setLocation('');
    setQuantity('1');
    setIsNegotiable(false);
    setShippingAvailable(true);
    setShippingPrice('0');
    setMedia([]);
    setHasVariants(false);
    setVariantDrafts([{ optionsText: '', price: '', quantity: '1', sku: '' }]);
    onSuccess();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] p-0">
        <DialogHeader className="p-4 pb-0">
          <DialogTitle>{copy.title}</DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(90vh-120px)]">
          <div className="p-4 space-y-6">
            <div className="space-y-2">
              <div className="flex items-baseline justify-between gap-3">
                <Label>{copy.photos}</Label>
                <span className="text-[11px] text-muted-foreground">
                  {media.length}/{MAX_PRODUCT_MEDIA} · video {videoCount}/{MAX_PRODUCT_VIDEOS}
                </span>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {media.map((item, index) => (
                  <div
                    key={item.url}
                    className="relative aspect-square overflow-hidden rounded-lg bg-muted"
                  >
                    <img
                      src={item.mediaType === 'video' ? item.thumbnailUrl || item.url : item.url}
                      alt=""
                      className="h-full w-full object-cover"
                    />

                    {item.mediaType === 'video' && (
                      <>
                        <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
                          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-black/55 backdrop-blur-sm">
                            <Play className="h-4 w-4 fill-white text-white" />
                          </span>
                        </span>
                        {item.durationSeconds ? (
                          <span className="pointer-events-none absolute bottom-1 left-1 rounded bg-black/65 px-1.5 py-0.5 text-[10px] font-medium text-white">
                            {formatMediaDuration(item.durationSeconds)}
                          </span>
                        ) : null}
                      </>
                    )}

                    {index === 0 && (
                      <span className="pointer-events-none absolute left-1 top-1 rounded bg-primary px-1.5 py-0.5 text-[9px] font-bold text-primary-foreground">
                        Muqova
                      </span>
                    )}

                    <Button
                      variant="destructive"
                      size="icon"
                      className="absolute right-1 top-1 h-6 w-6"
                      onClick={() => removeMedia(index)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ))}

                {media.length < MAX_PRODUCT_MEDIA && (
                  <label className={cn(
                    'aspect-square rounded-lg border-2 border-dashed border-muted-foreground/30',
                    'flex flex-col items-center justify-center cursor-pointer',
                    'hover:border-primary hover:bg-primary/5 transition-colors',
                    isUploading && 'pointer-events-none opacity-60',
                  )}>
                    <input
                      type="file"
                      accept={PRODUCT_MEDIA_ACCEPT}
                      multiple
                      onChange={handleMediaUpload}
                      className="hidden"
                      disabled={isUploading}
                    />
                    {isUploading ? (
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    ) : (
                      <>
                        <Plus className="h-6 w-6 text-muted-foreground" />
                        <span className="text-[10px] text-muted-foreground mt-1">{copy.add}</span>
                      </>
                    )}
                  </label>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Rasm yoki video (MP4 / WebM / MOV), video 60 soniyagacha. Birinchi rasm muqova bo‘ladi.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="title">{copy.productTitle}</Label>
              <Input
                id="title"
                placeholder={copy.productTitlePlaceholder}
                value={title}
                onChange={event => setTitle(event.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="price">{copy.price}</Label>
                <Input
                  id="price"
                  type="number"
                  placeholder="0"
                  min="0"
                  step="0.01"
                  value={price}
                  onChange={event => setPrice(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="quantity">{copy.quantity}</Label>
                <Input
                  id="quantity"
                  type="number"
                  placeholder="1"
                  min="1"
                  value={
                    hasVariants
                      ? String(variantDrafts.reduce(
                          (sum, draft) => sum + Math.max(0, Math.floor(Number(draft.quantity) || 0)),
                          0,
                        ))
                      : quantity
                  }
                  onChange={event => setQuantity(event.target.value)}
                  disabled={hasVariants}
                />
              </div>
            </div>

            <div className="space-y-3 rounded-2xl border border-border/40 bg-muted/15 p-3.5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-start gap-2.5">
                  <div className="mt-0.5 rounded-lg bg-primary/10 p-1.5 text-primary">
                    <SlidersHorizontal className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">{copy.variants}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {copy.variantsDescription}
                    </p>
                  </div>
                </div>
                <Switch
                  checked={hasVariants}
                  onCheckedChange={checked => {
                    setHasVariants(checked);
                    if (checked && variantDrafts.length === 0) {
                      setVariantDrafts([{ optionsText: '', price: '', quantity: '1', sku: '' }]);
                    }
                  }}
                />
              </div>

              {hasVariants && (
                <div className="space-y-3">
                  <p className="text-[11px] text-muted-foreground">
                    {copy.variantFormatHint}
                  </p>
                  {variantDrafts.map((draft, index) => (
                    <div
                      key={index}
                      className="space-y-2 rounded-xl border border-border/35 bg-background p-3"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold">
                          {copy.variantNumber(index + 1)}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 rounded-lg text-muted-foreground hover:text-destructive"
                          onClick={() => removeVariantDraft(index)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      <Input
                        value={draft.optionsText}
                        onChange={event => updateVariantDraft(index, 'optionsText', event.target.value)}
                        placeholder={copy.variantOptionsPlaceholder}
                        className="h-10 rounded-xl"
                      />
                      <div className="grid grid-cols-3 gap-2">
                        <Input
                          value={draft.price}
                          onChange={event => updateVariantDraft(index, 'price', event.target.value)}
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder={copy.variantPricePlaceholder}
                          className="h-10 rounded-xl"
                        />
                        <Input
                          value={draft.quantity}
                          onChange={event => updateVariantDraft(index, 'quantity', event.target.value)}
                          type="number"
                          min="0"
                          placeholder={copy.variantQuantityPlaceholder}
                          className="h-10 rounded-xl"
                        />
                        <Input
                          value={draft.sku}
                          onChange={event => updateVariantDraft(index, 'sku', event.target.value)}
                          placeholder="SKU"
                          className="h-10 rounded-xl"
                        />
                      </div>
                    </div>
                  ))}

                  <Button
                    type="button"
                    variant="outline"
                    className="h-10 w-full rounded-xl border-dashed"
                    onClick={addVariantDraft}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    {copy.addVariant}
                  </Button>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{copy.category}</Label>
                <Select value={categoryId} onValueChange={setCategoryId}>
                  <SelectTrigger>
                    <SelectValue placeholder={copy.select} />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map(category => (
                      <SelectItem key={category.id} value={category.id}>
                        <span className="flex items-center gap-2">
                          <CategoryIcon slug={category.slug} name={category.name} className="h-4 w-4" />
                          {category.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{copy.condition}</Label>
                <Select value={condition} onValueChange={setCondition}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {conditions.map(item => (
                      <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">{copy.description}</Label>
              <Textarea
                id="description"
                placeholder={copy.descriptionPlaceholder}
                value={description}
                onChange={event => setDescription(event.target.value)}
                rows={4}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="location">{copy.location}</Label>
              <Input
                id="location"
                placeholder={copy.locationPlaceholder}
                value={location}
                onChange={event => setLocation(event.target.value)}
              />
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm">{copy.negotiable}</p>
                  <p className="text-xs text-muted-foreground">{copy.negotiableDescription}</p>
                </div>
                <Switch checked={isNegotiable} onCheckedChange={setIsNegotiable} />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm">{copy.shipping}</p>
                  <p className="text-xs text-muted-foreground">{copy.shippingDescription}</p>
                </div>
                <Switch checked={shippingAvailable} onCheckedChange={setShippingAvailable} />
              </div>

              {shippingAvailable && (
                <div className="space-y-2">
                  <Label htmlFor="shippingPrice">{copy.shippingPrice}</Label>
                  <Input
                    id="shippingPrice"
                    type="number"
                    placeholder={copy.freeShippingPlaceholder}
                    min="0"
                    step="0.01"
                    value={shippingPrice}
                    onChange={event => setShippingPrice(event.target.value)}
                  />
                </div>
              )}
            </div>
          </div>
        </ScrollArea>

        <div className="p-4 border-t">
          <Button
            className="w-full"
            size="lg"
            onClick={handleSubmit}
            disabled={
              !title.trim() ||
              !price ||
              isSubmitting ||
              isUploading ||
              (hasVariants && !variantDrafts.some(draft => Object.keys(parseVariantOptions(draft.optionsText)).length > 0))
            }
          >
            {isSubmitting ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> {copy.publishing}</>
            ) : (
              copy.publish
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
