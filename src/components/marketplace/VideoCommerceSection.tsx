import { useEffect, useMemo, useState } from 'react';
import { Eye, Heart, Loader2, Play, ShoppingBag } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { CategoryIcon } from '@/components/marketplace/CategoryIcon';
import { Product } from '@/hooks/useMarketplace';
import db from '@/lib/supabaseAny';
import { formatPrice } from '@/lib/marketplace';
import { motion } from 'framer-motion';
import { marketplaceUz } from '@/i18n/marketplace';

interface VideoPost {
  id: string;
  content: string | null;
  media_urls: string[];
  media_type: string | null;
  views_count: number;
  likes_count: number;
  user_id: string;
  created_at: string;
  user?: {
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
  };
}

interface VideoProductLink {
  post_id: string;
  position: number;
  post: VideoPost;
  product: Product;
}

interface VideoCommerceSectionProps {
  onProductSelect: (product: Product) => void;
}

let videoCommerceWarningShown = false;

function warnVideoCommerce(stage: string, error: unknown) {
  if (videoCommerceWarningShown) return;
  videoCommerceWarningShown = true;
  console.warn(`Video shopping ${stage} is unavailable:`, error);
}

function uniqueIds(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

export function VideoCommerceSection({ onProductSelect }: VideoCommerceSectionProps) {
  const [links, setLinks] = useState<VideoProductLink[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const finish = (next: VideoProductLink[]) => {
      if (cancelled) return;
      setLinks(next);
      setIsLoading(false);
    };

    const fetchVideoCommerce = async () => {
      setIsLoading(true);

      // Keep the first request deliberately relation-free. A missing/stale
      // PostgREST relationship must never make an otherwise empty marketplace
      // section look broken or spam the console.
      const { data: linkRows, error: linkError } = await db
        .from('marketplace_video_products')
        .select('post_id, product_id, position')
        .order('position', { ascending: true })
        .limit(40);

      if (cancelled) return;

      if (linkError) {
        warnVideoCommerce('links', linkError);
        finish([]);
        return;
      }

      const rawLinks = (linkRows ?? []) as Array<{
        post_id: string;
        product_id: string;
        position: number | null;
      }>;

      // No shoppable-video links is a normal state, not an error.
      if (rawLinks.length === 0) {
        finish([]);
        return;
      }

      const postIds = uniqueIds(rawLinks.map(row => row.post_id));
      const productIds = uniqueIds(rawLinks.map(row => row.product_id));

      const [postsResult, productsResult] = await Promise.all([
        db
          .from('posts')
          .select('id, content, media_urls, media_type, views_count, likes_count, user_id, created_at')
          .in('id', postIds)
          .eq('media_type', 'video'),
        db
          .from('products')
          .select('*')
          .in('id', productIds)
          .eq('status', 'active'),
      ]);

      if (cancelled) return;

      if (postsResult.error) {
        warnVideoCommerce('posts', postsResult.error);
        finish([]);
        return;
      }
      if (productsResult.error) {
        warnVideoCommerce('products', productsResult.error);
        finish([]);
        return;
      }

      const posts = (postsResult.data ?? []) as any[];
      const products = (productsResult.data ?? []) as any[];

      // A deleted/non-video post or inactive/deleted product is simply omitted.
      // The linking table remains the source of ordering.
      if (posts.length === 0 || products.length === 0) {
        finish([]);
        return;
      }

      const sellerIds = uniqueIds(products.map(product => product.seller_id));
      const categoryIds = uniqueIds(products.map(product => product.category_id));

      const [sellersResult, categoriesResult, imagesResult] = await Promise.all([
        sellerIds.length > 0
          ? db
              .from('sellers')
              .select(
                'id, user_id, business_name, business_type, description, logo_url, location, is_verified, rating, total_sales, status',
              )
              .in('id', sellerIds)
          : Promise.resolve({ data: [], error: null }),
        categoryIds.length > 0
          ? db
              .from('product_categories')
              .select('id, name, slug, icon, position')
              .in('id', categoryIds)
          : Promise.resolve({ data: [], error: null }),
        db
          .from('product_images')
          .select('id, product_id, url, position')
          .in('product_id', productIds)
          .order('position', { ascending: true }),
      ]);

      if (cancelled) return;

      if (sellersResult.error) {
        warnVideoCommerce('sellers', sellersResult.error);
        finish([]);
        return;
      }
      if (categoriesResult.error) {
        warnVideoCommerce('categories', categoriesResult.error);
        finish([]);
        return;
      }
      if (imagesResult.error) {
        warnVideoCommerce('images', imagesResult.error);
        finish([]);
        return;
      }

      const sellers = (sellersResult.data ?? []) as any[];
      const profileIds = uniqueIds([
        ...posts.map(post => post.user_id),
        ...sellers.map(seller => seller.user_id),
      ]);

      const profilesResult = profileIds.length > 0
        ? await db
            .from('profiles')
            .select('id, username, display_name, avatar_url, is_online, last_seen, followers_count')
            .in('id', profileIds)
        : { data: [], error: null };

      if (cancelled) return;

      if (profilesResult.error) {
        // Profile decoration is non-essential. Keep products/videos usable even
        // if this optional read is temporarily unavailable.
        warnVideoCommerce('profiles', profilesResult.error);
      }

      const profiles = (profilesResult.data ?? []) as any[];
      const categories = (categoriesResult.data ?? []) as any[];
      const images = (imagesResult.data ?? []) as any[];

      const profileById = new Map(profiles.map(profile => [profile.id, profile]));
      const sellerById = new Map(
        sellers.map(seller => [
          seller.id,
          {
            ...seller,
            rating: Number(seller.rating ?? 0),
            total_sales: Number(seller.total_sales ?? 0),
            profile: profileById.get(seller.user_id),
          },
        ]),
      );
      const categoryById = new Map(categories.map(category => [category.id, category]));
      const imagesByProduct = new Map<string, Product['images']>();

      for (const image of images) {
        const current = imagesByProduct.get(image.product_id) ?? [];
        current.push({
          id: image.id,
          url: image.url,
          position: Number(image.position ?? 0),
        });
        imagesByProduct.set(image.product_id, current);
      }
      for (const productImages of imagesByProduct.values()) {
        productImages.sort((a, b) => a.position - b.position);
      }

      const postById = new Map<string, VideoPost>(
        posts.map(post => [
          post.id,
          {
            ...post,
            media_urls: Array.isArray(post.media_urls) ? post.media_urls : [],
            views_count: Number(post.views_count ?? 0),
            likes_count: Number(post.likes_count ?? 0),
            user: profileById.get(post.user_id),
          } as VideoPost,
        ]),
      );

      const productById = new Map<string, Product>(
        products.map(product => [
          product.id,
          {
            ...product,
            price: Number(product.price ?? 0),
            compare_at_price:
              product.compare_at_price == null ? null : Number(product.compare_at_price),
            quantity: Number(product.quantity ?? 0),
            shipping_price: Number(product.shipping_price ?? 0),
            views_count: Number(product.views_count ?? 0),
            likes_count: Number(product.likes_count ?? 0),
            seller: sellerById.get(product.seller_id),
            category: product.category_id ? categoryById.get(product.category_id) : undefined,
            images: imagesByProduct.get(product.id) ?? [],
          } as Product,
        ]),
      );

      const hydrated = rawLinks.flatMap<VideoProductLink>(row => {
        const post = postById.get(row.post_id);
        const product = productById.get(row.product_id);
        if (!post || !product) return [];
        return [{
          post_id: row.post_id,
          position: Number(row.position ?? 0),
          post,
          product,
        }];
      });

      finish(hydrated);
    };

    void fetchVideoCommerce().catch(error => {
      if (cancelled) return;
      warnVideoCommerce('loader', error);
      finish([]);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const videoGroups = useMemo(() => {
    const grouped = new Map<string, { video: VideoPost; products: Product[] }>();

    for (const link of links) {
      const existing = grouped.get(link.post_id);
      if (existing) {
        if (!existing.products.some(product => product.id === link.product.id)) {
          existing.products.push(link.product);
        }
      } else {
        grouped.set(link.post_id, {
          video: link.post,
          products: [link.product],
        });
      }
    }

    return [...grouped.values()]
      .sort((a, b) => (b.video.views_count ?? 0) - (a.video.views_count ?? 0))
      .slice(0, 10);
  }, [links]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (videoGroups.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="rounded-lg bg-foreground/10 p-1.5">
          <Play className="h-4 w-4 text-foreground" />
        </div>
        <h3 className="font-bold">{marketplaceUz.video.title}</h3>
        <Badge variant="outline" className="border-foreground/20 bg-foreground/5 text-[10px] text-foreground">
          Yangi
        </Badge>
      </div>

      <ScrollArea className="w-full">
        <div className="flex gap-3 pb-2">
          {videoGroups.map(group => (
            <VideoCommerceCard
              key={group.video.id}
              video={group.video}
              products={group.products}
              onProductSelect={onProductSelect}
            />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

function VideoCommerceCard({
  video,
  products,
  onProductSelect,
}: {
  video: VideoPost;
  products: Product[];
  onProductSelect: (product: Product) => void;
}) {
  const videoUrl = video.media_urls?.[0] || '';

  return (
    <div className="w-44 shrink-0 space-y-2">
      <div className="group relative aspect-[9/16] overflow-hidden rounded-2xl bg-muted">
        {videoUrl ? (
          <video
            src={videoUrl}
            className="h-full w-full object-cover"
            muted
            playsInline
            preload="metadata"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-muted">
            <Play className="h-8 w-8 text-muted-foreground/30" />
          </div>
        )}

        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
        <div className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/20 backdrop-blur-sm">
            <Play className="h-5 w-5 fill-white text-white" />
          </div>
        </div>

        <div className="absolute bottom-2 left-2 right-2">
          <div className="flex items-center gap-2 text-[10px] text-white">
            <span className="flex items-center gap-0.5">
              <Eye className="h-3 w-3" />
              {video.views_count}
            </span>
            <span className="flex items-center gap-0.5">
              <Heart className="h-3 w-3" />
              {video.likes_count}
            </span>
          </div>
          <p className="mt-0.5 line-clamp-1 text-[10px] font-medium text-white">
            @{video.user?.username || 'alsamos'}
          </p>
        </div>

        <div className="absolute right-2 top-2">
          <Badge className="bg-foreground/90 px-1.5 py-0.5 text-[9px] text-background backdrop-blur-sm">
            <ShoppingBag className="mr-0.5 h-2.5 w-2.5" />
            {products.length}
          </Badge>
        </div>
      </div>

      <div className="flex gap-1.5">
        {products.slice(0, 2).map(product => {
          const image = product.images?.[0]?.url;
          return (
            <motion.button
              type="button"
              key={product.id}
              whileTap={{ scale: 0.95 }}
              className="min-w-0 flex-1 text-left"
              onClick={() => onProductSelect(product)}
            >
              <div className="aspect-square overflow-hidden rounded-xl bg-muted ring-1 ring-border/30">
                {image ? (
                  <img
                    src={image}
                    alt={product.title}
                    className="h-full w-full object-cover"
                    loading="lazy"
                    onError={event => {
                      event.currentTarget.style.display = 'none';
                      event.currentTarget.nextElementSibling?.classList.remove('hidden');
                    }}
                  />
                ) : null}
                <div className={image ? 'hidden h-full w-full items-center justify-center' : 'flex h-full w-full items-center justify-center'}>
                  <CategoryIcon
                    slug={product.category?.slug}
                    name={product.category?.name}
                    className="h-5 w-5 text-muted-foreground/50"
                  />
                </div>
              </div>
              <p className="mt-0.5 truncate text-[10px] font-bold text-foreground">
                {formatPrice(product.price, product.currency)}
              </p>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
