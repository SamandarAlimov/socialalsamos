import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  BadgeCheck,
  CheckCircle2,
  Clock3,
  Grid3X3,
  Heart,
  LayoutList,
  Loader2,
  MapPin,
  MessageCircle,
  Package,
  Search,
  ShieldCheck,
  ShoppingBag,
  Star,
  Store,
  Truck,
  Users,
  Utensils,
} from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ProductCard } from '@/components/marketplace/ProductCard';
import { useAuth } from '@/contexts/AuthContext';
import { type Product } from '@/hooks/useMarketplace';
import { useSellerStore } from '@/hooks/useOrders';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

function verifiedSellerMark(className = 'h-5 w-5') {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center"
      title="Alsamos tomonidan tasdiqlangan rasmiy sotuvchi"
      aria-label="Alsamos tomonidan tasdiqlangan rasmiy sotuvchi"
    >
      <BadgeCheck className={cn(className, 'text-sky-400')} />
    </span>
  );
}

export default function MarketplaceStorePage() {
  const { sellerId } = useParams<{ sellerId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { seller, products, reviews, isLoading } = useSellerStore(sellerId);
  const [tab, setTab] = useState<'products' | 'reviews'>('products');
  const [layout, setLayout] = useState<'grid' | 'list'>('grid');
  const [query, setQuery] = useState('');
  const [menuCategory, setMenuCategory] = useState('all');
  const [isFollowing, setIsFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);

  useEffect(() => {
    if (!seller) return;
    const previous = document.title;
    document.title = `${seller.business_name} | Alsamos Bozor`;
    return () => {
      document.title = previous;
    };
  }, [seller]);

  useEffect(() => {
    if (!user || !seller?.user_id || user.id === seller.user_id) {
      setIsFollowing(false);
      return;
    }
    let cancelled = false;
    void supabase
      .from('follows')
      .select('following_id')
      .eq('follower_id', user.id)
      .eq('following_id', seller.user_id)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setIsFollowing(Boolean(data));
      });
    return () => {
      cancelled = true;
    };
  }, [seller?.user_id, user]);

  const isRestaurant = seller?.business_type === 'restaurant';

  const menuCategories = useMemo(
    () => Array.from(
      new Set(
        products
          .map(product => String((product as any).restaurant_category || '').trim())
          .filter(Boolean),
      ),
    ),
    [products],
  );

  useEffect(() => {
    if (!isRestaurant) setMenuCategory('all');
    else if (menuCategory !== 'all' && !menuCategories.includes(menuCategory)) setMenuCategory('all');
  }, [isRestaurant, menuCategories, menuCategory]);

  const visibleProducts = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    return products.filter(product => {
      if (
        isRestaurant &&
        menuCategory !== 'all' &&
        String((product as any).restaurant_category || '') !== menuCategory
      ) return false;

      if (!term) return true;
      return [
        product.title,
        product.description,
        product.category?.name,
        (product as any).restaurant_category,
        (product as any).serving_label,
      ]
        .filter(Boolean)
        .some(value => String(value).toLocaleLowerCase().includes(term));
    });
  }, [products, query, isRestaurant, menuCategory]);

  const averageRating = useMemo(() => {
    if (reviews.length > 0) {
      return reviews.reduce((sum, review) => sum + Number(review.rating || 0), 0) / reviews.length;
    }
    return Number(seller?.rating || 0);
  }, [reviews, seller?.rating]);

  const ratingDistribution = useMemo(() => {
    const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    reviews.forEach(review => {
      const value = Math.max(1, Math.min(5, Math.round(Number(review.rating || 0))));
      counts[value] += 1;
    });
    return counts;
  }, [reviews]);

  const totalLikes = useMemo(
    () => products.reduce((sum, product) => sum + Number(product.likes_count || 0), 0),
    [products],
  );

  const averagePreparationMinutes = useMemo(() => {
    const values = products
      .map(product => Number((product as any).preparation_minutes || 0))
      .filter(value => Number.isFinite(value) && value > 0);
    if (values.length === 0) return 0;
    return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
  }, [products]);

  const handleFollow = async () => {
    if (!user) {
      navigate('/?next=' + encodeURIComponent(`/marketplace/store/${sellerId || ''}`));
      return;
    }
    if (!seller?.user_id || user.id === seller.user_id || followLoading) return;

    setFollowLoading(true);
    const { error } = isFollowing
      ? await supabase
          .from('follows')
          .delete()
          .eq('follower_id', user.id)
          .eq('following_id', seller.user_id)
      : await supabase
          .from('follows')
          .insert({ follower_id: user.id, following_id: seller.user_id });
    setFollowLoading(false);

    if (error) {
      toast.error('Obuna holatini o‘zgartirib bo‘lmadi');
      return;
    }
    setIsFollowing(value => !value);
  };

  const openProduct = (product: Product) => {
    navigate(`/marketplace/product/${product.id}`);
  };

  if (isLoading) {
    return (
      <div className="marketplace-neutral flex min-h-[70vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="h-7 w-7 animate-spin" />
          <span className="text-sm">{isRestaurant ? 'Restoran yuklanmoqda…' : 'Do‘kon yuklanmoqda…'}</span>
        </div>
      </div>
    );
  }

  if (!seller) {
    return (
      <div className="marketplace-neutral mx-auto flex min-h-[65vh] max-w-xl flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-muted"><Store className="h-8 w-8 text-muted-foreground" /></div>
        <div><h1 className="text-xl font-bold">Do‘kon topilmadi</h1><p className="mt-1 text-sm text-muted-foreground">Sotuvchi profili o‘chirilgan yoki havola noto‘g‘ri bo‘lishi mumkin.</p></div>
        <Button variant="outline" className="rounded-xl" onClick={() => navigate('/marketplace')}><ArrowLeft className="mr-2 h-4 w-4" /> Marketplace’ga qaytish</Button>
      </div>
    );
  }

  const coverStyle = seller.cover_url
    ? { backgroundImage: `linear-gradient(180deg, rgba(0,0,0,.08), rgba(0,0,0,.5)), url("${seller.cover_url}")` }
    : undefined;
  const sellerAvatar = seller.logo_url || seller.profile?.avatar_url || '';
  const ownStore = user?.id === seller.user_id;
  const storeLabel = isRestaurant ? 'Restoran / kafe' : (seller.business_type || 'Marketplace sotuvchisi');

  return (
    <div className="marketplace-neutral min-h-screen bg-background pb-16">
      <section
        className={cn(
          'relative min-h-[270px] overflow-hidden border-b border-border/60 bg-gradient-to-br from-foreground via-foreground/90 to-foreground/70 bg-cover bg-center text-background',
          seller.cover_url && 'bg-blend-normal',
        )}
        style={coverStyle}
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_20%,rgba(255,255,255,.18),transparent_32%),radial-gradient(circle_at_82%_35%,rgba(255,255,255,.12),transparent_26%)]" />
        <div className="relative mx-auto flex min-h-[270px] w-full max-w-7xl flex-col justify-between px-4 py-4 lg:px-6">
          <div className="flex items-center justify-between gap-3">
            <Button variant="ghost" size="sm" className="rounded-full bg-background/12 text-background backdrop-blur-xl hover:bg-background/20 hover:text-background" onClick={() => navigate(-1)}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Orqaga
            </Button>
            <Badge className="border-background/15 bg-background/12 text-background backdrop-blur-xl hover:bg-background/12">
              {isRestaurant ? <Utensils className="mr-1.5 h-3.5 w-3.5" /> : <ShoppingBag className="mr-1.5 h-3.5 w-3.5" />}
              {isRestaurant ? 'Alsamos Restaurant' : 'Alsamos Store'}
            </Badge>
          </div>

          <div className="grid items-end gap-4 md:grid-cols-[auto_1fr_auto]">
            <Avatar className="h-24 w-24 border-4 border-background/85 shadow-2xl md:h-28 md:w-28">
              <AvatarImage src={sellerAvatar} />
              <AvatarFallback className="bg-background text-3xl font-black text-foreground">{seller.business_name?.[0]?.toUpperCase() || 'S'}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 pb-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="min-w-0 truncate text-2xl font-black tracking-tight md:text-3xl">{seller.business_name}</h1>
                {seller.is_verified && verifiedSellerMark()}
              </div>
              <p className="mt-1 text-sm text-background/70">{storeLabel}</p>
              <div className="mt-3 flex flex-wrap gap-2 text-xs text-background/80">
                <span className="rounded-full bg-background/10 px-2.5 py-1 backdrop-blur"><Star className="mr-1 inline h-3.5 w-3.5 fill-current" />{averageRating > 0 ? averageRating.toFixed(1) : '0.0'} · {reviews.length} sharh</span>
                <span className="rounded-full bg-background/10 px-2.5 py-1 backdrop-blur">{isRestaurant ? <Utensils className="mr-1 inline h-3.5 w-3.5" /> : <Package className="mr-1 inline h-3.5 w-3.5" />}{products.length} {isRestaurant ? 'taom' : 'mahsulot'}</span>
                <span className="rounded-full bg-background/10 px-2.5 py-1 backdrop-blur"><Heart className="mr-1 inline h-3.5 w-3.5" />{totalLikes} saqlash</span>
                {isRestaurant && averagePreparationMinutes > 0 && (
                  <span className="rounded-full bg-background/10 px-2.5 py-1 backdrop-blur"><Clock3 className="mr-1 inline h-3.5 w-3.5" />~{averagePreparationMinutes} daqiqa</span>
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-2 md:justify-end">
              {!ownStore && (
                <>
                  <Button className="rounded-xl bg-background text-foreground hover:bg-background/90" onClick={() => navigate(`/messages?user=${seller.user_id}`)}>
                    <MessageCircle className="mr-2 h-4 w-4" /> Xabar yuborish
                  </Button>
                  <Button variant="outline" className="rounded-xl border-background/25 bg-background/10 text-background backdrop-blur hover:bg-background/20 hover:text-background" onClick={() => void handleFollow()} disabled={followLoading}>
                    {followLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Users className="mr-2 h-4 w-4" />}
                    {isFollowing ? 'Obuna bo‘lingan' : 'Obuna bo‘lish'}
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </section>

      <main className="mx-auto w-full max-w-7xl px-4 py-6 lg:px-6">
        <div className="grid gap-6 lg:grid-cols-[310px_minmax(0,1fr)]">
          <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
            <div className="rounded-3xl border border-border/60 bg-card p-5 shadow-sm">
              <div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4" /><h2 className="text-sm font-bold">{isRestaurant ? 'Restoran haqida' : 'Do‘kon haqida'}</h2></div>
              {seller.description ? <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{seller.description}</p> : <p className="mt-3 text-sm text-muted-foreground">{isRestaurant ? 'Restoran hali tavsifini to‘ldirmagan.' : 'Sotuvchi hali do‘kon tavsifini to‘ldirmagan.'}</p>}
              {seller.location && <div className="mt-4 flex items-start gap-2 rounded-xl bg-muted/35 p-3 text-xs text-muted-foreground"><MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span>{seller.location}</span></div>}
              {seller.website && <a href={seller.website} target="_blank" rel="noreferrer" className="mt-3 block truncate text-xs font-semibold text-link hover:underline">{seller.website}</a>}
            </div>

            <div className="space-y-2 rounded-3xl border border-border/60 bg-card p-4 shadow-sm">
              <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-muted-foreground">Ishonch va himoya</p>
              {seller.is_verified && (
                <div className="flex items-start gap-2.5 rounded-2xl bg-sky-500/8 p-3">
                  <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-sky-500" />
                  <div><p className="text-xs font-bold">Rasmiy tasdiqlangan</p><p className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">Alsamos sotuvchi shaxsini tasdiqlagan. Bu belgi mahsulot originaliga avtomatik kafolat bermaydi.</p></div>
                </div>
              )}
              <div className="flex items-start gap-2.5 rounded-2xl bg-muted/30 p-3">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                <div><p className="text-xs font-bold">Tasdiqlangan xaridor sharhlari</p><p className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">Sharhlar yetkazilgan real buyurtma bilan tekshiriladi.</p></div>
              </div>
              <div className="flex items-start gap-2.5 rounded-2xl bg-muted/30 p-3">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-violet-500" />
                <div><p className="text-xs font-bold">Xavfsiz to‘lov va xaridor himoyasi</p><p className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">Buyurtma va to‘lov holati Alsamos orqali kuzatiladi.</p></div>
              </div>
              {isRestaurant && (
                <div className="flex items-start gap-2.5 rounded-2xl bg-muted/30 p-3">
                  <Truck className="mt-0.5 h-4 w-4 shrink-0 text-orange-500" />
                  <div><p className="text-xs font-bold">Yetkazish yoki olib ketish</p><p className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">Checkoutda restoran uchun mos fulfillment rejimini tanlash mumkin.</p></div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-3 gap-2 lg:grid-cols-1">
              <div className="rounded-2xl border border-border/60 p-3"><p className="text-xl font-black tabular-nums">{Number(seller.total_sales || 0)}</p><p className="text-[10px] uppercase tracking-wide text-muted-foreground">Sotuv</p></div>
              <div className="rounded-2xl border border-border/60 p-3"><p className="text-xl font-black tabular-nums">{products.length}</p><p className="text-[10px] uppercase tracking-wide text-muted-foreground">{isRestaurant ? 'Menyu' : 'Mahsulot'}</p></div>
              <div className="rounded-2xl border border-border/60 p-3"><p className="text-xl font-black tabular-nums">{seller.profile?.followers_count || 0}</p><p className="text-[10px] uppercase tracking-wide text-muted-foreground">Obunachi</p></div>
            </div>
          </aside>

          <section className="min-w-0">
            <div className="mb-5 flex flex-col gap-3 rounded-3xl border border-border/60 bg-card p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
              <div className="grid grid-cols-2 gap-1 rounded-2xl bg-muted/40 p-1">
                <button type="button" onClick={() => setTab('products')} className={cn('rounded-xl px-4 py-2 text-sm font-semibold', tab === 'products' ? 'bg-background shadow-sm' : 'text-muted-foreground')}>{isRestaurant ? 'Menyu' : 'Mahsulotlar'} <span className="ml-1 text-xs opacity-60">{products.length}</span></button>
                <button type="button" onClick={() => setTab('reviews')} className={cn('rounded-xl px-4 py-2 text-sm font-semibold', tab === 'reviews' ? 'bg-background shadow-sm' : 'text-muted-foreground')}>Sharhlar <span className="ml-1 text-xs opacity-60">{reviews.length}</span></button>
              </div>

              {tab === 'products' && (
                <div className="flex items-center gap-2">
                  <div className="relative min-w-0 flex-1 sm:w-64">
                    <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input value={query} onChange={event => setQuery(event.target.value)} placeholder={isRestaurant ? 'Menyudan qidirish' : 'Do‘kondan qidirish'} className="h-10 rounded-xl pl-9" />
                  </div>
                  <Button variant="ghost" size="icon" className={cn('h-10 w-10 rounded-xl', layout === 'grid' && 'bg-muted')} onClick={() => setLayout('grid')}><Grid3X3 className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" className={cn('h-10 w-10 rounded-xl', layout === 'list' && 'bg-muted')} onClick={() => setLayout('list')}><LayoutList className="h-4 w-4" /></Button>
                </div>
              )}
            </div>

            {tab === 'products' ? (
              <>
                {isRestaurant && menuCategories.length > 0 && (
                  <div className="marketplace-x-rail mb-4 flex gap-2 overflow-x-auto pb-1">
                    <button type="button" onClick={() => setMenuCategory('all')} className={cn('shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition', menuCategory === 'all' ? 'border-foreground bg-foreground text-background' : 'border-border/60 bg-background text-muted-foreground')}>Barcha menyu</button>
                    {menuCategories.map(category => (
                      <button key={category} type="button" onClick={() => setMenuCategory(category)} className={cn('shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition', menuCategory === category ? 'border-foreground bg-foreground text-background' : 'border-border/60 bg-background text-muted-foreground')}>{category}</button>
                    ))}
                  </div>
                )}

                {visibleProducts.length > 0 ? (
                  <div className={cn(layout === 'grid' ? 'grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4' : 'space-y-3')}>
                    {visibleProducts.map(product => <ProductCard key={product.id} product={product} onSelect={openProduct} layout={layout} />)}
                  </div>
                ) : (
                  <div className="flex min-h-72 flex-col items-center justify-center rounded-3xl border border-dashed border-border text-center"><Package className="h-10 w-10 text-muted-foreground/30" /><h3 className="mt-3 font-semibold">{isRestaurant ? 'Taom topilmadi' : 'Mahsulot topilmadi'}</h3><p className="mt-1 text-sm text-muted-foreground">Qidiruv yoki bo‘limni o‘zgartirib ko‘ring.</p></div>
                )}
              </>
            ) : reviews.length > 0 ? (
              <div className="space-y-4">
                <section className="grid gap-4 rounded-3xl border border-border/60 bg-card p-5 shadow-sm sm:grid-cols-[180px_minmax(0,1fr)] sm:items-center">
                  <div className="text-center sm:border-r sm:border-border/50">
                    <p className="text-4xl font-black tabular-nums">{averageRating.toFixed(1)}</p>
                    <div className="mt-2 flex justify-center gap-0.5">{Array.from({ length: 5 }).map((_, index) => <Star key={index} className={cn('h-4 w-4', index < Math.round(averageRating) ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/20')} />)}</div>
                    <p className="mt-2 text-xs text-muted-foreground">{reviews.length} tasdiqlangan sharh</p>
                  </div>
                  <div className="space-y-2">
                    {[5, 4, 3, 2, 1].map(value => {
                      const count = ratingDistribution[value] || 0;
                      const percent = reviews.length > 0 ? (count / reviews.length) * 100 : 0;
                      return (
                        <div key={value} className="grid grid-cols-[20px_1fr_28px] items-center gap-2 text-[11px] text-muted-foreground">
                          <span>{value}</span>
                          <div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-amber-400" style={{ width: `${percent}%` }} /></div>
                          <span className="text-right tabular-nums">{count}</span>
                        </div>
                      );
                    })}
                  </div>
                </section>

                {reviews.map(review => (
                  <article key={review.id} className="rounded-3xl border border-border/60 bg-card p-4 shadow-sm">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-10 w-10"><AvatarImage src={review.user?.avatar_url || ''} /><AvatarFallback>{review.user?.display_name?.[0] || 'U'}</AvatarFallback></Avatar>
                      <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{review.user?.display_name || review.user?.username || 'Foydalanuvchi'}</p><div className="mt-0.5 flex gap-0.5">{Array.from({ length: 5 }).map((_, index) => <Star key={index} className={cn('h-3.5 w-3.5', index < Number(review.rating) ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/25')} />)}</div></div>
                      <div className="flex max-w-[46%] flex-col items-end gap-1">
                        <Badge className="border-emerald-500/15 bg-emerald-500/10 text-[9px] font-bold text-emerald-600 hover:bg-emerald-500/10"><CheckCircle2 className="mr-1 h-3 w-3" />Tasdiqlangan xarid</Badge>
                        {review.product?.title && <Badge variant="secondary" className="max-w-full truncate">{review.product.title}</Badge>}
                      </div>
                    </div>
                    {review.title && <p className="mt-3 text-sm font-bold">{review.title}</p>}
                    {review.content && <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{review.content}</p>}
                  </article>
                ))}
              </div>
            ) : (
              <div className="flex min-h-72 flex-col items-center justify-center rounded-3xl border border-dashed border-border text-center"><Star className="h-10 w-10 text-muted-foreground/30" /><h3 className="mt-3 font-semibold">Hali sharh yo‘q</h3><p className="mt-1 text-sm text-muted-foreground">Birinchi tasdiqlangan xaridor sharhi shu yerda ko‘rinadi.</p></div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
