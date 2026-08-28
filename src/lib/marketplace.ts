/**
 * Shared marketplace formatting + domain helpers.
 *
 * Previously every component hardcoded `$` and `toLocaleString()`, which broke
 * as soon as a product used a different currency and produced inconsistent
 * decimals across the card / detail / cart / checkout / order screens.
 */

export const DEFAULT_CURRENCY = 'USD';

const CURRENCY_LOCALE: Record<string, string> = {
  USD: 'en-US',
  UZS: 'uz-UZ',
  EUR: 'de-DE',
  RUB: 'ru-RU',
};

/** Formats a money amount with the correct currency symbol and grouping. */
export function formatPrice(
  amount: number | null | undefined,
  currency: string = DEFAULT_CURRENCY,
): string {
  const value = Number(amount ?? 0);
  const code = (currency || DEFAULT_CURRENCY).toUpperCase();
  const locale = CURRENCY_LOCALE[code] ?? 'en-US';

  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: code,
      // Whole amounts stay clean ($1,200), fractional amounts keep cents.
      minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${code} ${value.toLocaleString()}`;
  }
}

/** Compact form for dense UI (badges, chips): $1.2K, $500K, $1M. */
export function formatPriceCompact(
  amount: number | null | undefined,
  currency: string = DEFAULT_CURRENCY,
): string {
  const value = Number(amount ?? 0);
  if (value < 10_000) return formatPrice(value, currency);
  const code = (currency || DEFAULT_CURRENCY).toUpperCase();
  try {
    return new Intl.NumberFormat(CURRENCY_LOCALE[code] ?? 'en-US', {
      style: 'currency',
      currency: code,
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(value);
  } catch {
    return formatPrice(value, currency);
  }
}

export interface DiscountInfo {
  hasDiscount: boolean;
  percent: number;
  savings: number;
}

/** Single source of truth for discount math (was duplicated in 3 files). */
export function getDiscount(price: number, compareAtPrice?: number | null): DiscountInfo {
  const compare = Number(compareAtPrice ?? 0);
  if (!compare || compare <= price) {
    return { hasDiscount: false, percent: 0, savings: 0 };
  }
  return {
    hasDiscount: true,
    percent: Math.round((1 - price / compare) * 100),
    savings: compare - price,
  };
}

export const CONDITION_LABELS: Record<string, string> = {
  new: 'Yangi',
  like_new: 'Yangiday',
  good: 'Yaxshi',
  fair: "O'rtacha",
  used: 'Ishlatilgan',
  refurbished: 'Tiklangan',
};

export function conditionLabel(condition?: string | null): string {
  if (!condition) return '—';
  return CONDITION_LABELS[condition] ?? condition;
}

export interface StockState {
  stock: number;
  isSoldOut: boolean;
  isLowStock: boolean;
  /** Max units a buyer may put in the cart for this listing. */
  maxSelectable: number;
}

/**
 * Stock rules used by the card, detail sheet, cart and checkout so the
 * three screens can no longer disagree about availability.
 */
export function getStockState(product: {
  quantity?: number | null;
  status?: string | null;
}): StockState {
  const stock = Math.max(0, Number(product.quantity ?? 0));
  const isSoldOut = stock === 0 || product.status === 'sold' || product.status === 'inactive';
  return {
    stock,
    isSoldOut,
    isLowStock: !isSoldOut && stock <= 5,
    maxSelectable: isSoldOut ? 0 : stock,
  };
}

/** Shipping is charged per unit, so quantity must be part of the math. */
export function getShippingCost(
  product: { shipping_available?: boolean | null; shipping_price?: number | null } | undefined,
  quantity = 1,
): number {
  if (!product) return 0;
  if (product.shipping_available === false) return 0;
  return Number(product.shipping_price ?? 0) * Math.max(1, quantity);
}

/** Maps raw RPC / Postgres error codes to user-facing Uzbek copy. */
export const CHECKOUT_ERROR_MESSAGES: Record<string, string> = {
  not_authenticated: 'Iltimos, tizimga kiring.',
  invalid_payment_method: "To'lov usuli noto'g'ri tanlangan.",
  invalid_shipping_address: "Yetkazib berish manzili to'liq emas.",
  empty_cart: "Savat bo'sh.",
  invalid_quantity: "Mahsulot soni noto'g'ri.",
  product_unavailable: 'Mahsulot sotuvdan olingan. Savatni tekshiring.',
  insufficient_stock: 'Omborda yetarli mahsulot qolmadi. Sonini kamaytiring.',
  insufficient_balance: "Hamyonda mablag' yetarli emas. To'ldiring yoki boshqa usulni tanlang.",
};

export function checkoutErrorMessage(raw?: string | null): string {
  if (!raw) return "Kutilmagan xatolik yuz berdi. Qayta urinib ko'ring.";
  const code = raw.replace(/^.*:\s*/, '').trim();
  return CHECKOUT_ERROR_MESSAGES[code] ?? raw;
}
