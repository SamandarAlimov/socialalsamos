import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ChevronRight,
  ClipboardList,
  CreditCard,
  Heart,
  Loader2,
  MapPin,
  MessageSquareText,
  ShoppingBag,
  Star,
  Store,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { MarketplaceLocationPicker } from '@/components/marketplace/MarketplaceLocationPicker';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useAuth } from '@/contexts/AuthContext';
import { useMarketplaceDeliveryLocation } from '@/hooks/useMarketplaceDeliveryLocation';
import db from '@/lib/supabaseAny';
import { cn } from '@/lib/utils';

type CommerceCounts = {
  orders: number | null;
  reviews: number | null;
  saved: number | null;
};

type ReviewMedia = {
  id: string;
  url: string;
  media_type: 'image' | 'video';
  thumbnail_url: string | null;
};

type MyReview = {
  id: string;
  product_id: string;
  rating: number;
  title: string | null;
  content: string | null;
  created_at: string;
  product?: {
    id: string;
    title: string;
    images?: Array<{ url: string; position: number }>;
  } | null;
  media?: ReviewMedia[];
};

function countLabel(value: number | null) {
  if (value == null) return null;
  if (value > 99) return '99+';
  return String(value);
}

export function ProfileCommercePanel({ className }: { className?: string }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { location, setLocation } = useMarketplaceDeliveryLocation();
  const [locationOpen, setLocationOpen] = useState(false);
  const [reviewsOpen, setReviewsOpen] = useState(false);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [reviews, setReviews] = useState<MyReview[]>([]);
  const [counts, setCounts] = useState<CommerceCounts>({ orders: null, reviews: null, saved: null });

  const refreshCounts = useCallback(async () => {
    if (!user) {
      setCounts({ orders: null, reviews: null, saved: null });
      return;
    }

    const [ordersResult, reviewsResult, savedResult] = await Promise.all([
      db.from('orders').select('id', { count: 'exact', head: true }).eq('buyer_id', user.id),
      db.from('product_reviews').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
      db.from('product_likes').select('product_id', { count: 'exact', head: true }).eq('user_id', user.id),
    ]);

    setCounts({
      orders: ordersResult.error ? null : Number(ordersResult.count ?? 0),
      reviews: reviewsResult.error ? null : Number(reviewsResult.count ?? 0),
      saved: savedResult.error ? null : Number(savedResult.count ?? 0),
    });
  }, [user]);

  useEffect(() => {
    void refreshCounts();
  }, [refreshCounts]);

  const loadReviews = useCallback(async () => {
    if (!user) return;
    setReviewsLoading(true);

    let result = await db
      .from('product_reviews')
      .select(`
        id, product_id, rating, title, content, created_at,
        product:products(id, title, images:product_images(url, position))
      `)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50);

    if (result.error) {
      result = await db
        .from('product_reviews')
        .select('id, product_id, rating, title, content, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);
    }

    const base = (result.data ?? []) as MyReview[];
    const ids = base.map(review => review.id);
    const mediaMap = new Map<string, ReviewMedia[]>();

    if (ids.length > 0) {
      const mediaResult = await db
        .from('product_review_media')
        .select('id, review_id, url, media_type, thumbnail_url, position')
        .in('review_id', ids)
        .order('position', { ascending: true });

      if (!mediaResult.error) {
        for (const row of mediaResult.data ?? []) {
          const current = mediaMap.get(row.review_id) ?? [];
          current.push({
            id: String(row.id),
            url: String(row.url || ''),
            media_type: row.media_type === 'video' ? 'video' : 'image',
            thumbnail_url: row.thumbnail_url || null,
          });
          mediaMap.set(row.review_id, current);
        }
      }
    }

    setReviews(base.map(review => ({ ...review, media: mediaMap.get(review.id) ?? [] })));
    setReviewsLoading(false);
  }, [user]);

  useEffect(() => {
    if (reviewsOpen) void loadReviews();
  }, [loadReviews, reviewsOpen]);

  const primaryRows = useMemo(() => [
    {
      id: 'orders',
      icon: ClipboardList,
      title: 'Buyurtmalarim',
      description: 'Jarayondagi va oldingi xaridlaringiz',
      count: countLabel(counts.orders),
      onClick: () => navigate('/marketplace?tab=orders'),
    },
    {
      id: 'reviews',
      icon: MessageSquareText,
      title: 'Sharhlarim',
      description: 'Mahsulotlarga yozgan baho, rasm va videolaringiz',
      count: countLabel(counts.reviews),
      onClick: () => setReviewsOpen(true),
    },
    {
      id: 'location',
      icon: MapPin,
      title: 'Yetkazish manzili',
      description: location?.label || 'Xaritadan yoki qidiruvdan manzil tanlang',
      count: null,
      onClick: () => setLocationOpen(true),
    },
    {
      id: 'saved',
      icon: Heart,
      title: 'Saqlangan mahsulotlar',
      description: 'Keyinroq ko‘rish uchun saqlaganlaringiz',
      count: countLabel(counts.saved),
      onClick: () => navigate('/marketplace?tab=saved'),
    },
  ], [counts.orders, counts.reviews, counts.saved, location?.label, navigate]);

  if (!user) return null;

  return (
    <>
      <section className={cn('space-y-3', className)} aria-label="Xaridlar va savdo">
        <div className="flex items-end justify-between gap-3 px-1">
          <div>
            <h2 className="text-base font-extrabold tracking-tight text-foreground">Xaridlar va savdo</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Alohida Marketplace profili emas — kerakli savdo boshqaruvi shu profilingizda.
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/marketplace')}
            className="shrink-0 text-xs font-bold text-muted-foreground transition hover:text-foreground"
          >
            Bozor
          </button>
        </div>

        <div className="overflow-hidden rounded-[24px] border border-border/60 bg-card shadow-sm">
          {primaryRows.map((row, index) => {
            const Icon = row.icon;
            return (
              <button
                key={row.id}
                type="button"
                onClick={row.onClick}
                className={cn(
                  'group flex min-h-[66px] w-full min-w-0 items-center gap-3 px-4 py-3 text-left transition hover:bg-muted/45',
                  index !== primaryRows.length - 1 && 'border-b border-border/45',
                )}
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-muted/70 text-foreground transition group-hover:bg-foreground group-hover:text-background">
                  <Icon className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-foreground">{row.title}</span>
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">{row.description}</span>
                </span>
                {row.count && (
                  <span className="flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full bg-foreground px-1.5 text-[10px] font-extrabold text-background">
                    {row.count}
                  </span>
                )}
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/60 transition group-hover:translate-x-0.5 group-hover:text-foreground" />
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => navigate('/settings/payment')}
            className="flex min-w-0 items-center gap-2.5 rounded-2xl border border-border/60 bg-card p-3 text-left transition hover:bg-muted/45"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted/70"><CreditCard className="h-4 w-4" /></span>
            <span className="min-w-0"><span className="block truncate text-xs font-bold">To‘lovlar</span><span className="block truncate text-[10px] text-muted-foreground">Usullar va hamyon</span></span>
          </button>
          <button
            type="button"
            onClick={() => navigate('/marketplace?tab=selling')}
            className="flex min-w-0 items-center gap-2.5 rounded-2xl border border-border/60 bg-card p-3 text-left transition hover:bg-muted/45"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted/70"><Store className="h-4 w-4" /></span>
            <span className="min-w-0"><span className="block truncate text-xs font-bold">Sotuvchi markazi</span><span className="block truncate text-[10px] text-muted-foreground">Do‘kon yoki restoran</span></span>
          </button>
        </div>
      </section>

      <MarketplaceLocationPicker
        open={locationOpen}
        onOpenChange={setLocationOpen}
        value={location}
        onSelect={setLocation}
        title="Yetkazish manzilini tanlang"
        description="Joriy joylashuvingiz shart emas. Xarita yoki qidiruv orqali buyurtma yetkazilishi kerak bo‘lgan istalgan manzilni belgilang."
      />

      <Sheet open={reviewsOpen} onOpenChange={setReviewsOpen}>
        <SheetContent side="bottom" className="max-h-[88dvh] rounded-t-[30px] border-x border-t border-border/60 p-0 sm:left-1/2 sm:max-w-xl sm:-translate-x-1/2">
          <SheetHeader className="border-b border-border/50 px-5 py-4 text-left">
            <SheetTitle>Sharhlarim</SheetTitle>
            <p className="text-xs text-muted-foreground">Xarid qilgan mahsulotlaringizga qoldirgan baho va fikrlar.</p>
          </SheetHeader>

          <div className="max-h-[calc(88dvh-82px)] overflow-y-auto px-4 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
            {reviewsLoading ? (
              <div className="flex min-h-48 items-center justify-center text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin" /></div>
            ) : reviews.length === 0 ? (
              <div className="flex min-h-56 flex-col items-center justify-center px-6 text-center">
                <span className="flex h-14 w-14 items-center justify-center rounded-3xl bg-muted"><MessageSquareText className="h-6 w-6 text-muted-foreground" /></span>
                <h3 className="mt-4 text-sm font-bold">Hali sharh yozmagansiz</h3>
                <p className="mt-1 max-w-xs text-xs leading-relaxed text-muted-foreground">Yetkazilgan buyurtmadan keyin mahsulotga baho, rasm yoki video bilan sharh qoldirishingiz mumkin.</p>
                <button type="button" className="mt-4 rounded-xl bg-foreground px-4 py-2 text-xs font-bold text-background" onClick={() => { setReviewsOpen(false); navigate('/marketplace?tab=orders'); }}>Buyurtmalarim</button>
              </div>
            ) : (
              <div className="space-y-3">
                {reviews.map(review => {
                  const productImage = review.product?.images?.slice().sort((a, b) => a.position - b.position)[0]?.url;
                  return (
                    <button
                      type="button"
                      key={review.id}
                      onClick={() => { setReviewsOpen(false); navigate(`/marketplace/product/${review.product_id}`); }}
                      className="w-full rounded-2xl border border-border/60 bg-card p-4 text-left transition hover:bg-muted/35"
                    >
                      <div className="flex min-w-0 items-start gap-3">
                        <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-muted">
                          {productImage ? <img src={productImage} alt="" className="h-full w-full object-cover" /> : <ShoppingBag className="h-5 w-5 text-muted-foreground" />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-bold">{review.product?.title || 'Marketplace mahsuloti'}</span>
                          <span className="mt-1 flex items-center gap-1">
                            {Array.from({ length: 5 }).map((_, index) => <Star key={index} className={cn('h-3.5 w-3.5', index < Number(review.rating) ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/20')} />)}
                          </span>
                        </span>
                        <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground/60" />
                      </div>
                      {review.title && <p className="mt-3 text-sm font-bold">{review.title}</p>}
                      {review.content && <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-muted-foreground">{review.content}</p>}
                      {(review.media?.length ?? 0) > 0 && (
                        <div className="mt-3 flex gap-2 overflow-x-auto">
                          {review.media!.slice(0, 5).map(media => (
                            <span key={media.id} className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-muted">
                              <img src={media.media_type === 'video' ? media.thumbnail_url || media.url : media.url} alt="" className="h-full w-full object-cover" />
                              {media.media_type === 'video' && <span className="absolute inset-0 flex items-center justify-center bg-black/15"><span className="rounded-full bg-black/60 px-1.5 py-0.5 text-[8px] font-bold text-white">VIDEO</span></span>}
                            </span>
                          ))}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
