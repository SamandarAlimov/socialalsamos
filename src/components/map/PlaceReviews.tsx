import { useEffect, useState } from 'react';
import { Loader2, MessageSquare, Star, Trash2 } from 'lucide-react';
import { usePlaceReviews, type PlaceRef } from '@/hooks/usePlaceReviews';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

interface PlaceReviewsProps {
  place: PlaceRef | null;
  className?: string;
}

function Stars({
  value,
  size = 'md',
  onChange,
}: {
  value: number;
  size?: 'sm' | 'md';
  onChange?: (value: number) => void;
}) {
  const dimension = size === 'sm' ? 'h-3.5 w-3.5' : 'h-6 w-6';
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          disabled={!onChange}
          onClick={() => onChange?.(star)}
          className={cn(onChange ? 'cursor-pointer' : 'cursor-default')}
          aria-label={star + ' yulduz'}
        >
          <Star
            className={cn(
              dimension,
              star <= value ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/40',
            )}
          />
        </button>
      ))}
    </div>
  );
}

export function PlaceReviews({ place, className }: PlaceReviewsProps) {
  const { reviews, summary, myReview, loading, saving, submit, remove } = usePlaceReviews(place);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');

  useEffect(() => {
    setRating(myReview?.rating ?? 0);
    setComment(myReview?.comment ?? '');
  }, [myReview]);

  const handleSubmit = async () => {
    if (!rating) return;
    await submit(rating, comment);
  };

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex items-center gap-4 rounded-xl bg-muted/50 p-3">
        <div className="text-center">
          <p className="text-2xl font-bold leading-none">
            {summary.total ? summary.average.toFixed(1) : '-'}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {summary.total ? summary.total + ' izoh' : "Izoh yo'q"}
          </p>
        </div>
        <div className="flex-1">
          <Stars value={Math.round(summary.average)} size="sm" />
          <p className="mt-1 text-xs text-muted-foreground">
            {summary.total
              ? 'Foydalanuvchilar bahosi'
              : "Bu joyni birinchi bo'lib baholaganlar orasida bo'ling."}
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-border/70 p-3">
        <p className="mb-2 text-sm font-medium">
          {myReview ? 'Sizning bahoyingiz' : 'Baho bering'}
        </p>
        <Stars value={rating} onChange={setRating} />
        <textarea
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          rows={3}
          maxLength={600}
          placeholder="Nima yoqdi, nima yoqmadi?"
          className="mt-2 w-full resize-none rounded-lg border border-border/70 bg-background p-2 text-sm outline-none focus:border-primary"
        />
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            disabled={!rating || saving}
            onClick={handleSubmit}
            className="flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <MessageSquare className="h-4 w-4" />
            )}
            {myReview ? 'Yangilash' : 'Yuborish'}
          </button>
          {myReview && (
            <button
              type="button"
              onClick={() => void remove()}
              className="flex h-9 items-center gap-1.5 rounded-lg border border-border/70 px-3 text-sm text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
              O'chirish
            </button>
          )}
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Izohlar yuklanmoqda...
        </div>
      )}

      <div className="space-y-3">
        {reviews.map((review) => (
          <div key={review.id} className="flex gap-3">
            <Avatar className="h-8 w-8">
              <AvatarImage src={review.author?.avatar_url ?? undefined} />
              <AvatarFallback>
                {(review.author?.display_name ?? review.author?.username ?? 'A')
                  .slice(0, 1)
                  .toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="truncate text-sm font-medium">
                  {review.author?.display_name ?? review.author?.username ?? 'Foydalanuvchi'}
                </p>
                <Stars value={review.rating} size="sm" />
              </div>
              {review.comment && (
                <p className="mt-0.5 whitespace-pre-wrap text-sm text-muted-foreground">
                  {review.comment}
                </p>
              )}
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {new Date(review.created_at).toLocaleDateString('uz-UZ', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default PlaceReviews;
