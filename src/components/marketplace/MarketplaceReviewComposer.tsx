import { useEffect, useState } from 'react';
import { Star } from 'lucide-react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ReviewMediaPicker } from '@/components/marketplace/ReviewMediaPicker';
import { useProductReviews, MARKETPLACE_REVIEW_UPDATED_EVENT } from '@/hooks/useProductReviews';
import type { ProductMediaDraft } from '@/lib/productMedia';
import { cn } from '@/lib/utils';

export function MarketplaceReviewComposer({ productId }: { productId: string }) {
  const { eligibility, createReview } = useProductReviews(productId);
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [rating, setRating] = useState(5);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [media, setMedia] = useState<ProductMediaDraft[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (eligibility !== 'eligible') {
      setHost(null);
      return;
    }

    const sync = () => {
      const textarea = document.querySelector<HTMLTextAreaElement>(
        '.marketplace-neutral textarea[maxlength="2000"]',
      );
      const nextHost = textarea?.closest<HTMLElement>('.space-y-3.rounded-xl') || null;
      if (nextHost) nextHost.dataset.marketplaceReviewHost = 'true';
      setHost(current => current === nextHost ? current : nextHost);
    };

    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      if (host) delete host.dataset.marketplaceReviewHost;
    };
  }, [eligibility, host]);

  const submit = async () => {
    if (saving || content.trim().length < 3) return;
    setSaving(true);
    const success = await createReview(rating, title, content, media);
    setSaving(false);
    if (!success) return;

    setRating(5);
    setTitle('');
    setContent('');
    setMedia([]);
    window.dispatchEvent(new CustomEvent(MARKETPLACE_REVIEW_UPDATED_EVENT, { detail: { productId } }));
  };

  if (eligibility !== 'eligible' || !host) return null;

  return createPortal(
    <div data-marketplace-review-composer="premium" className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">Tasdiqlangan xarid sharhi</p>
          <p className="mt-0.5 text-[10px] text-muted-foreground">Rasm/video bilan mahsulotning real holatini ko‘rsatishingiz mumkin.</p>
        </div>
        <div className="flex gap-0.5">
          {[1, 2, 3, 4, 5].map(value => (
            <button
              key={value}
              type="button"
              onClick={() => setRating(value)}
              className="rounded-md p-0.5"
              aria-label={`${value} yulduz`}
            >
              <Star className={cn('h-5 w-5', value <= rating ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/30')} />
            </button>
          ))}
        </div>
      </div>

      <Input
        value={title}
        onChange={event => setTitle(event.target.value)}
        placeholder="Sarlavha (ixtiyoriy)"
        maxLength={120}
        className="rounded-xl"
      />
      <Textarea
        value={content}
        onChange={event => setContent(event.target.value)}
        placeholder="Mahsulot, sifat, o‘lcham, rang yoki yetkazish haqida fikringiz…"
        maxLength={2000}
        rows={3}
        className="resize-none rounded-xl"
      />
      <ReviewMediaPicker value={media} onChange={setMedia} disabled={saving} />
      <Button className="h-11 w-full rounded-xl" onClick={() => void submit()} disabled={saving || content.trim().length < 3}>
        {saving ? 'Sharh saqlanmoqda…' : media.length > 0 ? `Sharhni ${media.length} ta media bilan e’lon qilish` : 'Sharhni e’lon qilish'}
      </Button>
    </div>,
    host,
  );
}
