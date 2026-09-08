import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import db from '@/lib/supabaseAny';
import { marketplaceUz } from '@/i18n/marketplace';
import type { ProductMediaDraft } from '@/lib/productMedia';

export const MARKETPLACE_REVIEW_UPDATED_EVENT = 'alsamos:marketplace:review-updated';

export interface ProductReviewMedia {
  id: string;
  url: string;
  mediaType: 'image' | 'video';
  thumbnailUrl: string | null;
  durationSeconds: number | null;
  position: number;
}

export interface ProductReview {
  id: string;
  product_id: string;
  user_id: string;
  order_id: string | null;
  rating: number;
  title: string | null;
  content: string | null;
  created_at: string;
  updated_at: string;
  media?: ProductReviewMedia[];
  user?: {
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
  } | null;
}

export type ReviewEligibility =
  | 'loading'
  | 'signed_out'
  | 'eligible'
  | 'already_reviewed'
  | 'not_delivered';

const PAGE_SIZE = 5;
const MAX_REVIEW_MEDIA = 5;

function normalizeReviewMedia(row: any): ProductReviewMedia {
  return {
    id: String(row.id),
    url: String(row.url || ''),
    mediaType: row.media_type === 'video' ? 'video' : 'image',
    thumbnailUrl: row.thumbnail_url || null,
    durationSeconds: row.duration_seconds == null ? null : Number(row.duration_seconds),
    position: Number(row.position || 0),
  };
}

export function useProductReviews(productId?: string | null) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [reviews, setReviews] = useState<ProductReview[]>([]);
  const [averageRating, setAverageRating] = useState(0);
  const [reviewCount, setReviewCount] = useState(0);
  const [page, setPage] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [eligibility, setEligibility] = useState<ReviewEligibility>('loading');
  const [eligibleOrderId, setEligibleOrderId] = useState<string | null>(null);

  const fetchSummary = useCallback(async () => {
    if (!productId) {
      setAverageRating(0);
      setReviewCount(0);
      return;
    }

    const { data, error } = await db.rpc('get_product_review_summary', { _product_id: productId });
    if (error) {
      console.warn('Product review summary failed:', error);
      return;
    }

    const row = Array.isArray(data) ? data[0] : data;
    setAverageRating(Number(row?.average_rating ?? 0));
    setReviewCount(Number(row?.review_count ?? 0));
  }, [productId]);

  const fetchReviews = useCallback(async (targetPage = page) => {
    if (!productId) {
      setReviews([]);
      return;
    }

    setIsLoading(true);
    const from = targetPage * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    const { data, error, count } = await db
      .from('product_reviews')
      .select(
        `
          id, product_id, user_id, order_id, rating, title, content, created_at, updated_at,
          user:profiles(username, display_name, avatar_url)
        `,
        { count: 'exact' },
      )
      .eq('product_id', productId)
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) {
      console.warn('Product reviews failed:', error);
      setReviews([]);
      setIsLoading(false);
      return;
    }

    const baseReviews = (data ?? []) as ProductReview[];
    const reviewIds = baseReviews.map(review => review.id);
    let mediaByReview = new Map<string, ProductReviewMedia[]>();

    if (reviewIds.length > 0) {
      const mediaResult = await db
        .from('product_review_media')
        .select('id, review_id, media_type, url, thumbnail_url, duration_seconds, position')
        .in('review_id', reviewIds)
        .order('position', { ascending: true });

      if (!mediaResult.error) {
        mediaByReview = (mediaResult.data ?? []).reduce((map: Map<string, ProductReviewMedia[]>, row: any) => {
          const current = map.get(row.review_id) ?? [];
          current.push(normalizeReviewMedia(row));
          map.set(row.review_id, current);
          return map;
        }, new Map<string, ProductReviewMedia[]>());
      } else if (mediaResult.error.code !== '42P01') {
        console.warn('Product review media failed:', mediaResult.error);
      }
    }

    setReviews(baseReviews.map(review => ({ ...review, media: mediaByReview.get(review.id) ?? [] })));
    setReviewCount(Number(count ?? 0));
    setIsLoading(false);
  }, [page, productId]);

  const checkEligibility = useCallback(async () => {
    if (!productId) {
      setEligibility('not_delivered');
      setEligibleOrderId(null);
      return;
    }
    if (!user) {
      setEligibility('signed_out');
      setEligibleOrderId(null);
      return;
    }

    setEligibility('loading');
    const [existingResult, deliveredResult] = await Promise.all([
      db.from('product_reviews').select('id').eq('product_id', productId).eq('user_id', user.id).maybeSingle(),
      db
        .from('order_items')
        .select('order_id, order:orders!inner(id, buyer_id, status)')
        .eq('product_id', productId)
        .eq('order.buyer_id', user.id)
        .eq('order.status', 'delivered')
        .limit(1)
        .maybeSingle(),
    ]);

    if (existingResult.data?.id) {
      setEligibility('already_reviewed');
      setEligibleOrderId(null);
      return;
    }
    if (deliveredResult.data?.order_id) {
      setEligibleOrderId(deliveredResult.data.order_id);
      setEligibility('eligible');
      return;
    }

    setEligibleOrderId(null);
    setEligibility('not_delivered');
  }, [productId, user]);

  useEffect(() => {
    setPage(0);
  }, [productId]);

  useEffect(() => {
    void fetchSummary();
    void fetchReviews(page);
  }, [fetchReviews, fetchSummary, page]);

  useEffect(() => {
    void checkEligibility();
  }, [checkEligibility]);

  useEffect(() => {
    const handleReviewUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{ productId?: string }>).detail;
      if (detail?.productId && detail.productId !== productId) return;
      void Promise.all([fetchSummary(), fetchReviews(page), checkEligibility()]);
    };
    window.addEventListener(MARKETPLACE_REVIEW_UPDATED_EVENT, handleReviewUpdated);
    return () => window.removeEventListener(MARKETPLACE_REVIEW_UPDATED_EVENT, handleReviewUpdated);
  }, [checkEligibility, fetchReviews, fetchSummary, page, productId]);

  const createReview = useCallback(async (
    rating: number,
    title: string,
    content: string,
    media: ProductMediaDraft[] = [],
  ): Promise<boolean> => {
    if (!user || !productId || !eligibleOrderId) {
      toast({
        title: marketplaceUz.reviewActions.unavailableTitle,
        description: marketplaceUz.reviewActions.deliveredOnly,
        variant: 'destructive',
      });
      return false;
    }

    const safeRating = Math.min(5, Math.max(1, Math.round(rating)));
    const { data: created, error } = await db
      .from('product_reviews')
      .insert({
        product_id: productId,
        user_id: user.id,
        order_id: eligibleOrderId,
        rating: safeRating,
        title: title.trim() || null,
        content: content.trim() || null,
      })
      .select('id')
      .single();

    if (error || !created?.id) {
      const duplicate = error?.code === '23505';
      toast({
        title: duplicate ? marketplaceUz.reviewActions.duplicateTitle : marketplaceUz.reviewActions.saveFailed,
        description: duplicate ? marketplaceUz.reviewActions.duplicateDescription : marketplaceUz.reviewActions.retry,
        variant: 'destructive',
      });
      if (duplicate) setEligibility('already_reviewed');
      return false;
    }

    const safeMedia = media
      .slice(0, MAX_REVIEW_MEDIA)
      .filter((item, index, list) => item.mediaType !== 'video' || list.findIndex(candidate => candidate.mediaType === 'video') === index);

    if (safeMedia.length > 0) {
      const { error: mediaError } = await db.from('product_review_media').insert(
        safeMedia.map((item, index) => ({
          review_id: created.id,
          user_id: user.id,
          media_type: item.mediaType,
          url: item.url,
          thumbnail_url: item.thumbnailUrl,
          duration_seconds: item.durationSeconds,
          position: index,
        })),
      );

      if (mediaError) {
        console.warn('Review media save failed:', mediaError);
        toast({
          title: 'Sharh saqlandi',
          description: 'Sharh e’lon qilindi, lekin rasm/video to‘liq biriktirilmadi.',
          variant: 'destructive',
        });
      } else {
        toast({ title: marketplaceUz.reviewActions.published, description: `${safeMedia.length} ta media bilan e’lon qilindi.` });
      }
    } else {
      toast({ title: marketplaceUz.reviewActions.published });
    }

    setEligibility('already_reviewed');
    setEligibleOrderId(null);
    setPage(0);
    await Promise.all([fetchSummary(), fetchReviews(0)]);
    return true;
  }, [eligibleOrderId, fetchReviews, fetchSummary, productId, toast, user]);

  const pageCount = Math.max(1, Math.ceil(reviewCount / PAGE_SIZE));

  return {
    reviews,
    averageRating,
    reviewCount,
    page,
    pageCount,
    pageSize: PAGE_SIZE,
    isLoading,
    eligibility,
    createReview,
    setPage,
    refresh: async () => {
      await Promise.all([fetchSummary(), fetchReviews(page), checkEligibility()]);
    },
  };
}
