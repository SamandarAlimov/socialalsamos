import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import db from '@/lib/supabaseAny';

export type PromotionOwnerType = 'platform' | 'seller';
export type PromotionDiscountType = 'percent' | 'fixed';
export type PromotionScopeType = 'all' | 'categories' | 'products';
export type PromotionAudienceType =
  | 'all'
  | 'new_customers'
  | 'returning_customers'
  | 'specific_users';

export interface MarketplacePromoQuote {
  success: boolean;
  error?: string;
  promotion_id?: string;
  code?: string;
  name?: string;
  description?: string | null;
  owner_type?: PromotionOwnerType;
  seller_id?: string | null;
  discount_type?: PromotionDiscountType;
  discount_value?: number;
  max_discount_amount?: number | null;
  min_subtotal?: number;
  scope_type?: PromotionScopeType;
  audience_type?: PromotionAudienceType;
  eligible_subtotal?: number;
  discount_amount?: number;
  currency?: string;
  ends_at?: string | null;
}

export interface MarketplacePromotion {
  id: string;
  code: string;
  name: string;
  description: string | null;
  owner_type: PromotionOwnerType;
  seller_id: string | null;
  seller_name: string | null;
  discount_type: PromotionDiscountType;
  discount_value: number;
  max_discount_amount: number | null;
  min_subtotal: number;
  currency: string;
  scope_type: PromotionScopeType;
  audience_type: PromotionAudienceType;
  starts_at: string;
  ends_at: string | null;
  usage_limit: number | null;
  per_user_limit: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  usage_count: number;
  total_discount: number;
  product_ids: string[];
  products: Array<{ id: string; title: string }>;
  category_ids: string[];
  categories: Array<{ id: string; name: string; slug: string }>;
  user_ids: string[];
  users: Array<{ id: string; username: string | null; display_name: string | null }>;
}

export interface PromotionDraft {
  owner_type: PromotionOwnerType;
  seller_id?: string | null;
  code: string;
  name: string;
  description?: string | null;
  discount_type: PromotionDiscountType;
  discount_value: number | string;
  max_discount_amount?: number | string | null;
  min_subtotal?: number | string | null;
  currency?: string;
  scope_type: PromotionScopeType;
  audience_type: PromotionAudienceType;
  starts_at?: string | null;
  ends_at?: string | null;
  usage_limit?: number | string | null;
  per_user_limit?: number | string | null;
  is_active?: boolean;
  product_ids?: string[];
  category_ids?: string[];
  user_ids?: string[];
  metadata?: Record<string, unknown>;
}

const PROMO_ERRORS: Record<string, string> = {
  promo_code_required: 'Promokodni kiriting',
  promo_not_found: 'Bunday promokod topilmadi',
  promo_inactive: 'Bu promokod hozir faol emas',
  promo_not_started: 'Bu promokod hali boshlanmagan',
  promo_expired: 'Bu promokod muddati tugagan',
  promo_usage_limit: 'Promokodning umumiy foydalanish limiti tugagan',
  promo_user_limit: 'Siz bu promokoddan foydalanish limitiga yetgansiz',
  promo_audience: 'Bu promokod sizning hisobingiz uchun mo‘ljallanmagan',
  promo_no_eligible_items: 'Savatda bu promokodga mos mahsulot yo‘q',
  promo_min_subtotal: 'Promokod uchun minimal xarid summasi yetarli emas',
  promo_currency_mismatch: 'Promokod savat valyutasiga mos kelmaydi',
  promo_code_exists: 'Bu promokod allaqachon mavjud',
  invalid_promo_code: 'Promokod 3–32 belgidan iborat bo‘lsin. Harf, raqam, _ va - ishlating',
  invalid_promo_name: 'Kampaniya nomini kiriting',
  invalid_promo_values: 'Chegirma qiymatlari noto‘g‘ri',
  invalid_promo_scope: 'Promokod qamrovi noto‘g‘ri',
  invalid_promo_audience: 'Promokod auditoriyasi noto‘g‘ri',
  promo_products_required: 'Kamida bitta mahsulot tanlang',
  promo_categories_required: 'Kamida bitta turkum tanlang',
  promo_users_required: 'Kamida bitta foydalanuvchi tanlang',
  invalid_promo_product: 'Tanlangan mahsulotlardan biri bu promokodga tegishli emas',
  invalid_promo_category: 'Tanlangan turkum topilmadi',
  invalid_promo_user: 'Tanlangan foydalanuvchi topilmadi',
  seller_required: 'Faol sotuvchi profili topilmadi',
  not_authorized: 'Bu amal uchun ruxsatingiz yo‘q',
  promo_not_found_or_forbidden: 'Promokod topilmadi yoki uni boshqarishga ruxsat yo‘q',
};

export function promoErrorMessage(code?: string | null, minSubtotal?: number, currency = 'UZS') {
  if (!code) return 'Promokodni tekshirib bo‘lmadi';
  if (code === 'promo_min_subtotal' && minSubtotal != null) {
    try {
      return `Promokod uchun kamida ${new Intl.NumberFormat('uz-UZ').format(minSubtotal)} ${currency} xarid qiling`;
    } catch {
      return PROMO_ERRORS[code];
    }
  }
  return PROMO_ERRORS[code] || code;
}

export async function quoteMarketplacePromo(code: string): Promise<MarketplacePromoQuote> {
  const { data, error } = await db.rpc('marketplace_quote_promo', { _code: code });
  if (error) {
    const raw = String(error.message || '');
    const parsed = raw.replace(/^.*:\s*/, '').trim();
    return { success: false, error: parsed || 'promo_invalid' };
  }

  const payload = (data ?? {}) as MarketplacePromoQuote;
  return {
    ...payload,
    discount_value: payload.discount_value == null ? undefined : Number(payload.discount_value),
    max_discount_amount:
      payload.max_discount_amount == null ? null : Number(payload.max_discount_amount),
    min_subtotal: payload.min_subtotal == null ? undefined : Number(payload.min_subtotal),
    eligible_subtotal:
      payload.eligible_subtotal == null ? undefined : Number(payload.eligible_subtotal),
    discount_amount:
      payload.discount_amount == null ? undefined : Number(payload.discount_amount),
  };
}

function normalizePromotion(row: any): MarketplacePromotion {
  return {
    ...row,
    discount_value: Number(row.discount_value ?? 0),
    max_discount_amount:
      row.max_discount_amount == null ? null : Number(row.max_discount_amount),
    min_subtotal: Number(row.min_subtotal ?? 0),
    usage_limit: row.usage_limit == null ? null : Number(row.usage_limit),
    per_user_limit: row.per_user_limit == null ? null : Number(row.per_user_limit),
    usage_count: Number(row.usage_count ?? 0),
    total_discount: Number(row.total_discount ?? 0),
    product_ids: Array.isArray(row.product_ids) ? row.product_ids : [],
    products: Array.isArray(row.products) ? row.products : [],
    category_ids: Array.isArray(row.category_ids) ? row.category_ids : [],
    categories: Array.isArray(row.categories) ? row.categories : [],
    user_ids: Array.isArray(row.user_ids) ? row.user_ids : [],
    users: Array.isArray(row.users) ? row.users : [],
  } as MarketplacePromotion;
}

export function useMarketplacePromotionManager(mode: 'seller' | 'admin' = 'seller') {
  const [promotions, setPromotions] = useState<MarketplacePromotion[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data, error: rpcError } = await db.rpc('marketplace_list_manageable_promotions', {
      _mode: mode,
    });

    if (rpcError) {
      setError(promoErrorMessage(String(rpcError.message || '').replace(/^.*:\s*/, '').trim()));
      setPromotions([]);
    } else {
      setPromotions(
        (Array.isArray(data) ? data : []).map(normalizePromotion),
      );
    }

    setLoading(false);
  }, [mode]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const savePromotion = useCallback(async (
    promotionId: string | null,
    draft: PromotionDraft,
  ) => {
    setSaving(true);
    try {
      const { data, error: rpcError } = await db.rpc('marketplace_save_promotion', {
        _promotion_id: promotionId,
        _payload: draft,
      });

      if (rpcError) {
        const code = String(rpcError.message || '').replace(/^.*:\s*/, '').trim();
        return { success: false as const, error: promoErrorMessage(code) };
      }

      await refresh();
      return {
        success: true as const,
        promotionId: String((data as any)?.promotion_id || promotionId || ''),
      };
    } finally {
      setSaving(false);
    }
  }, [refresh]);

  const setPromotionActive = useCallback(async (promotionId: string, active: boolean) => {
    const { error: rpcError } = await db.rpc('marketplace_set_promotion_active', {
      _promotion_id: promotionId,
      _active: active,
    });
    if (rpcError) {
      const code = String(rpcError.message || '').replace(/^.*:\s*/, '').trim();
      return { success: false as const, error: promoErrorMessage(code) };
    }
    setPromotions(current =>
      current.map(item => item.id === promotionId ? { ...item, is_active: active } : item),
    );
    return { success: true as const };
  }, []);

  const deletePromotion = useCallback(async (promotionId: string) => {
    const { error: rpcError } = await db.rpc('marketplace_delete_promotion', {
      _promotion_id: promotionId,
    });
    if (rpcError) {
      const code = String(rpcError.message || '').replace(/^.*:\s*/, '').trim();
      return { success: false as const, error: promoErrorMessage(code) };
    }
    setPromotions(current => current.filter(item => item.id !== promotionId));
    return { success: true as const };
  }, []);

  return {
    promotions,
    loading,
    saving,
    error,
    refresh,
    savePromotion,
    setPromotionActive,
    deletePromotion,
  };
}

export async function findPromotionUsers(query: string) {
  const needle = query.trim().replace(/^@/, '');
  if (needle.length < 2) return [];

  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, display_name, avatar_url')
    .or(`username.ilike.%${needle}%,display_name.ilike.%${needle}%`)
    .limit(12);

  if (error) return [];
  return data ?? [];
}
