import { useEffect, useMemo, useState } from 'react';
import { Eye, Heart, Loader2, Play, ShoppingBag } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { CategoryIcon } from '@/components/marketplace/CategoryIcon';
import { Product } from '@/hooks/useMarketplace';
import db from '@/lib/supabaseAny';
import { formatPrice } from '@/lib/marketplace';
import { motion } from 'framer-motion';

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

export function VideoCommerceSection({ onProductSelect }: VideoCommerceSectionProps) {
  const [links, setLinks] = useState<VideoProductLink[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const fetchVideoCommerce = async () => {
      setIsLoading(true);

      const { data, error } = await db
        .from('marketplace_video_products')
        .select(`
          post_id,
          position,
          post:posts!inner(
            id, content, media_urls, media_type, views_count, likes_count, user_id, created_at,
            user:profiles(username, display_name, avatar_url)
          ),
          product:products!inner(
            *,
            seller:sellers(
              id, user_id, business_name, business_type, logo_url, location,
              is_verified, rating, total_sales,
              profile:profiles(username, display_name, avatar_url)
            ),
            category:product_categories(id, name, slug, icon),
            images:product_images(id, url, position)
          )
        `)
        .eq('post.media_type', 'video')
        .eq('product.status', 'active')
        .order('position', { ascending: true })
        .limit(40);

      if (cancelled) return;

      if (error) {
        // Migration hali hosted DBga push qilinmagan muhitda Marketplace buzilmasin.
        console.warn('Video shopping relation is unavailable:', error);
        setLinks([]);
      } else {
        setLinks(
          (data ?? []).map((row: any) => ({
            post_id: row.post_id,
            position: Number(row.position ?? 0),
            post: {
              ...row.post,
              user: row.post?.user,
              media_urls: row.post?.media_urls ?? [],
            },
            product: {
              ...row.product,
              seller: row.product?.seller,
              category: row.product?.category,
              images: ((row.product?.images ?? []) as Product['images'])
                .slice()
                .sort((a, b) => a.position - b.position),
            } as Product,
          })),
        );
      }

      setIsLoading(false);
    };

    void fetchVideoCommerce();
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
        <div className="rounded-lg bg-primary/10 p-1.5">
          <Play className="h-4 w-4 text-primary" />
        </div>
        <h3 className="font-bold">Video orqali xarid</h3>
        <Badge variant="outline" className="border-primary/20 bg-primary/5 text-[10px] text-primary">
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
          <Badge className="bg-primary/90 px-1.5 py-0.5 text-[9px] text-primary-foreground backdrop-blur-sm">
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
              <p className="mt-0.5 truncate text-[10px] font-bold text-primary">
                {formatPrice(product.price, product.currency)}
              </p>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
