import { Camera, Star } from 'lucide-react';
import { ReviewMediaGallery } from '@/components/marketplace/ReviewMediaPicker';
import { useProductReviews } from '@/hooks/useProductReviews';

export function MarketplaceReviewMediaWall({ productId }: { productId: string }) {
  const { reviews, isLoading } = useProductReviews(productId);
  const mediaReviews = reviews.filter(review => review.media && review.media.length > 0);

  if (isLoading || mediaReviews.length === 0) return null;

  return (
    <section className="mx-auto w-full max-w-7xl px-4 pb-8 lg:px-6" aria-label="Media sharhlar">
      <div className="rounded-2xl border border-border/40 bg-card p-4">
        <div className="mb-4 flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-500/10 text-sky-600">
            <Camera className="h-4 w-4" />
          </span>
          <div>
            <h3 className="text-sm font-bold">Xaridorlarning rasm va videolari</h3>
            <p className="text-[11px] text-muted-foreground">Faqat yetkazilgan xariddan keyin biriktirilgan media.</p>
          </div>
        </div>

        <div className="space-y-4">
          {mediaReviews.map(review => {
            const name = review.user?.display_name || review.user?.username || 'Alsamos xaridori';
            return (
              <article key={review.id} className="rounded-xl border border-border/30 bg-background p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="truncate text-xs font-semibold">{name}</p>
                  <span className="inline-flex shrink-0 items-center gap-0.5 text-[10px] text-muted-foreground">
                    <Star className="h-3 w-3 fill-amber-400 text-amber-400" /> {review.rating}/5
                  </span>
                </div>
                {review.title && <p className="mt-1 text-sm font-semibold">{review.title}</p>}
                <ReviewMediaGallery media={review.media} />
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
