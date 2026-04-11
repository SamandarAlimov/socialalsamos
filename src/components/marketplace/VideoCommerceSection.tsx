import { useState, useEffect } from 'react';
import { Play, ShoppingBag, Eye, Heart, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { Product } from '@/hooks/useMarketplace';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

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

interface VideoCommerceSectionProps {
  onProductSelect: (product: Product) => void;
}

export function VideoCommerceSection({ onProductSelect }: VideoCommerceSectionProps) {
  const [videoPosts, setVideoPosts] = useState<VideoPost[]>([]);
  const [linkedProducts, setLinkedProducts] = useState<Record<string, Product[]>>({});
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchVideoCommerce = async () => {
      // Fetch video posts that mention products or have commerce tags
      const { data: videos } = await supabase
        .from('posts')
        .select(`
          id, content, media_urls, media_type, views_count, likes_count, user_id, created_at,
          user:profiles(username, display_name, avatar_url)
        `)
        .eq('media_type', 'video')
        .not('media_urls', 'is', null)
        .order('views_count', { ascending: false })
        .limit(10);

      if (videos && videos.length > 0) {
        setVideoPosts(videos.map(v => ({
          ...v,
          user: v.user as any,
          media_urls: v.media_urls || [],
        })));

        // Try to find products from the same users (creators who also sell)
        const userIds = [...new Set(videos.map(v => v.user_id))];
        
        const { data: sellers } = await supabase
          .from('sellers')
          .select('id, user_id')
          .in('user_id', userIds);

        if (sellers && sellers.length > 0) {
          const sellerIds = sellers.map(s => s.id);
          const { data: products } = await supabase
            .from('products')
            .select(`
              *,
              seller:sellers(id, user_id, business_name, is_verified, logo_url),
              images:product_images(id, url, position)
            `)
            .in('seller_id', sellerIds)
            .eq('status', 'active')
            .limit(20);

          if (products) {
            const grouped: Record<string, Product[]> = {};
            for (const p of products) {
              const sellerUserId = sellers.find(s => s.id === p.seller_id)?.user_id;
              if (sellerUserId) {
                const matchingVideos = videos.filter(v => v.user_id === sellerUserId);
                for (const vid of matchingVideos) {
                  if (!grouped[vid.id]) grouped[vid.id] = [];
                  grouped[vid.id].push({
                    ...p,
                    seller: p.seller as any,
                    images: (p.images as any[]).sort((a: any, b: any) => a.position - b.position),
                  });
                }
              }
            }
            setLinkedProducts(grouped);
          }
        }
      }

      setIsLoading(false);
    };

    fetchVideoCommerce();
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const videosWithProducts = videoPosts.filter(v => linkedProducts[v.id]?.length > 0);

  if (videosWithProducts.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-primary/10">
            <Play className="h-4 w-4 text-primary" />
          </div>
          <h3 className="font-bold">Video Shopping</h3>
          <Badge variant="outline" className="text-[10px] bg-primary/5 text-primary border-primary/20">
            Yangi
          </Badge>
        </div>
      </div>

      <ScrollArea className="w-full">
        <div className="flex gap-3 pb-2">
          {videosWithProducts.map(video => (
            <VideoCommerceCard
              key={video.id}
              video={video}
              products={linkedProducts[video.id] || []}
              onProductSelect={onProductSelect}
            />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

function VideoCommerceCard({ video, products, onProductSelect }: { 
  video: VideoPost; 
  products: Product[];
  onProductSelect: (product: Product) => void;
}) {
  const thumbnail = video.media_urls?.[0] || '';

  return (
    <div className="w-44 shrink-0 space-y-2">
      {/* Video Thumbnail */}
      <div className="relative aspect-[9/16] rounded-2xl overflow-hidden bg-muted group cursor-pointer">
        {thumbnail ? (
          <video
            src={thumbnail}
            className="w-full h-full object-cover"
            muted
            preload="metadata"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-muted to-muted/50 flex items-center justify-center">
            <Play className="h-8 w-8 text-muted-foreground/30" />
          </div>
        )}

        {/* Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
        
        {/* Play Button */}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
            <Play className="h-5 w-5 text-white fill-white" />
          </div>
        </div>

        {/* Stats */}
        <div className="absolute bottom-2 left-2 right-2">
          <div className="flex items-center gap-2 text-white text-[10px]">
            <div className="flex items-center gap-0.5">
              <Eye className="h-3 w-3" />
              {video.views_count}
            </div>
            <div className="flex items-center gap-0.5">
              <Heart className="h-3 w-3" />
              {video.likes_count}
            </div>
          </div>
          <p className="text-white text-[10px] font-medium mt-0.5 line-clamp-1">
            @{video.user?.username}
          </p>
        </div>

        {/* Product Count Badge */}
        <div className="absolute top-2 right-2">
          <Badge className="bg-primary/90 text-primary-foreground text-[9px] px-1.5 py-0.5 backdrop-blur-sm">
            <ShoppingBag className="h-2.5 w-2.5 mr-0.5" />
            {products.length}
          </Badge>
        </div>
      </div>

      {/* Linked Products */}
      <div className="flex gap-1.5">
        {products.slice(0, 2).map(product => (
          <motion.div
            key={product.id}
            whileTap={{ scale: 0.95 }}
            className="flex-1 cursor-pointer"
            onClick={() => onProductSelect(product)}
          >
            <div className="aspect-square rounded-xl overflow-hidden bg-muted ring-1 ring-border/30">
              <img
                src={product.images?.[0]?.url || 'https://placehold.co/80x80?text=P'}
                alt=""
                className="w-full h-full object-cover"
              />
            </div>
            <p className="text-[10px] font-bold text-primary mt-0.5">${product.price}</p>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
