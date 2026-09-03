import { useEffect, useState } from 'react';
import { ArrowLeft, ShieldCheck, Star, MapPin, MessageCircle, Package, Users, Heart, Grid3X3, LayoutList, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { useSellerStore } from '@/hooks/useOrders';
import { ProductCard } from '@/components/marketplace/ProductCard';
import { Product } from '@/hooks/useMarketplace';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { marketplaceUz } from '@/i18n/marketplace';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface SellerStorefrontProps {
  sellerId: string | null;
  onClose: () => void;
  onProductSelect: (product: Product) => void;
  onMessageSeller?: (userId: string) => void;
}

export function SellerStorefront({
  sellerId,
  onClose,
  onProductSelect,
  onMessageSeller,
}: SellerStorefrontProps) {
  const { user } = useAuth();
  const { seller, products, reviews, isLoading } = useSellerStore(sellerId || undefined);
  const [activeTab, setActiveTab] = useState<'products' | 'reviews'>('products');
  const [layout, setLayout] = useState<'grid' | 'list'>('grid');
  const [isFollowing, setIsFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);

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

  const handleFollow = async () => {
    if (!user || !seller?.user_id || user.id === seller.user_id || followLoading) return;

    setFollowLoading(true);
    const targetUserId = seller.user_id;

    const { error } = isFollowing
      ? await supabase
          .from('follows')
          .delete()
          .eq('follower_id', user.id)
          .eq('following_id', targetUserId)
      : await supabase
          .from('follows')
          .insert({ follower_id: user.id, following_id: targetUserId });

    setFollowLoading(false);

    if (error) {
      toast.error(marketplaceUz.storefront.followFailed);
      return;
    }

    setIsFollowing(value => !value);
    toast.success(
      isFollowing
        ? marketplaceUz.storefront.unfollowed
        : marketplaceUz.storefront.followed,
    );
  };

  if (!sellerId) return null;

  const avgRating = reviews.length > 0
    ? (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1)
    : seller?.rating?.toFixed(1) || '0.0';

  return (
    <Sheet open={!!sellerId} onOpenChange={() => onClose()}>
      <SheetContent side="bottom" className="marketplace-neutral h-[95vh] p-0 rounded-t-3xl border-t border-border/30">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : seller ? (
          <div className="flex flex-col h-full">
            {/* Header */}
            <div className="relative">
              <div className="h-32 bg-gradient-to-br from-foreground/20 via-foreground/10 to-transparent" />
              <div className="absolute top-3 left-3 right-3 flex justify-between">
                <Button variant="ghost" size="icon" className="h-10 w-10 rounded-full bg-background/70 backdrop-blur-xl" onClick={onClose}>
                  <ArrowLeft className="h-5 w-5" />
                </Button>
              </div>
              <div className="px-4 -mt-12 relative z-10">
                <div className="flex items-end gap-3">
                  <Avatar className="h-20 w-20 ring-4 ring-background shadow-xl">
                    <AvatarImage src={seller.logo_url || seller.profile?.avatar_url || ''} />
                    <AvatarFallback className="bg-foreground/10 text-foreground text-2xl font-bold">
                      {seller.business_name?.[0]?.toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 pb-1">
                    <div className="flex items-center gap-1.5">
                      <h2 className="text-xl font-bold">{seller.business_name}</h2>
                      {seller.is_verified && <ShieldCheck className="h-5 w-5 text-foreground" />}
                    </div>
                    <p className="text-sm text-muted-foreground">{seller.business_type}</p>
                  </div>
                </div>

                {/* Stats */}
                <div className="flex items-center gap-4 mt-3 text-sm">
                  <div className="flex items-center gap-1">
                    <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                    <span className="font-semibold">{avgRating}</span>
                    <span className="text-muted-foreground">({reviews.length})</span>
                  </div>
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <Package className="h-4 w-4" />
                    <span>{marketplaceUz.storefront.productCount(products.length)}</span>
                  </div>
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <Heart className="h-4 w-4" />
                    <span>{marketplaceUz.storefront.sales(seller.total_sales)}</span>
                  </div>
                </div>

                {seller.description && (
                  <p className="text-sm text-muted-foreground mt-2 line-clamp-2">{seller.description}</p>
                )}

                {seller.location && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1.5">
                    <MapPin className="h-3 w-3" />
                    {seller.location}
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-2 mt-3">
                  <Button
                    className="flex-1 rounded-xl h-10 shadow-lg shadow-black/10"
                    size="sm"
                    disabled={!onMessageSeller || !seller.user_id}
                    onClick={() => seller.user_id && onMessageSeller?.(seller.user_id)}
                  >
                    <MessageCircle className="h-4 w-4 mr-1.5" />
                    {marketplaceUz.storefront.sendMessage}
                  </Button>
                  {user?.id !== seller.user_id && (
                    <Button
                      variant="outline"
                      className="rounded-xl h-10"
                      size="sm"
                      onClick={handleFollow}
                      disabled={followLoading}
                      aria-pressed={isFollowing}
                    >
                      {followLoading ? (
                        <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                      ) : (
                        <Users className="h-4 w-4 mr-1.5" />
                      )}
                      {isFollowing
                        ? marketplaceUz.storefront.following
                        : marketplaceUz.storefront.follow}
                    </Button>
                  )}
                </div>

                {/* Tabs */}
                <div className="flex gap-1 mt-4 p-1 rounded-xl bg-muted/40">
                  {[
                    { id: 'products' as const, label: marketplaceUz.storefront.products, count: products.length },
                    { id: 'reviews' as const, label: marketplaceUz.storefront.reviews, count: reviews.length },
                  ].map(tab => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={cn(
                        "flex-1 py-2 rounded-lg text-sm font-medium transition-all",
                        activeTab === tab.id
                          ? "bg-background text-foreground shadow-sm"
                          : "text-muted-foreground"
                      )}
                    >
                      {tab.label} ({tab.count})
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Content */}
            <ScrollArea className="flex-1 mt-4">
              <div className="px-4 pb-6">
                {activeTab === 'products' && (
                  <>
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-sm text-muted-foreground">{marketplaceUz.storefront.productCount(products.length)}</p>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className={cn("h-8 w-8 rounded-lg", layout === 'grid' && "bg-muted")} onClick={() => setLayout('grid')}>
                          <Grid3X3 className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className={cn("h-8 w-8 rounded-lg", layout === 'list' && "bg-muted")} onClick={() => setLayout('list')}>
                          <LayoutList className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                    <div className={cn(
                      "gap-3",
                      layout === 'grid' ? "grid grid-cols-2" : "space-y-3"
                    )}>
                      {products.map(product => (
                        <ProductCard
                          key={product.id}
                          product={product}
                          onSelect={onProductSelect}
                          layout={layout}
                        />
                      ))}
                    </div>
                  </>
                )}

                {activeTab === 'reviews' && (
                  <div className="space-y-3">
                    {reviews.length === 0 ? (
                      <div className="text-center py-12">
                        <Star className="h-10 w-10 mx-auto text-muted-foreground/20 mb-3" />
                        <p className="text-muted-foreground">{marketplaceUz.storefront.noReviews}</p>
                      </div>
                    ) : (
                      reviews.map(review => (
                        <div key={review.id} className="p-3 rounded-xl bg-muted/20 border border-border/20 space-y-2">
                          <div className="flex items-center gap-2">
                            <Avatar className="h-8 w-8">
                              <AvatarImage src={review.user?.avatar_url || ''} />
                              <AvatarFallback>{review.user?.display_name?.[0] || 'U'}</AvatarFallback>
                            </Avatar>
                            <div className="flex-1">
                              <p className="text-sm font-medium">{review.user?.display_name || marketplaceUz.storefront.user}</p>
                              <div className="flex gap-0.5">
                                {Array.from({ length: 5 }).map((_, i) => (
                                  <Star key={i} className={cn("h-3 w-3", i < review.rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30")} />
                                ))}
                              </div>
                            </div>
                          </div>
                          {review.content && <p className="text-sm text-muted-foreground">{review.content}</p>}
                          <p className="text-[10px] text-muted-foreground">
                            {review.product?.title}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
