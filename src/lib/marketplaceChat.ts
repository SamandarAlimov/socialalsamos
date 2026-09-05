import type { Product } from '@/hooks/useMarketplace';

export const MARKETPLACE_MESSAGE_SCHEMA = 'alsamos.marketplace-message.v2';
const LEGACY_MARKETPLACE_MESSAGE_SCHEMA = 'alsamos.marketplace-message.v1';

export type MarketplaceChatIntent = 'contact' | 'offer';

export interface MarketplaceProductSelection {
  variant_id?: string;
  variant_sku?: string;
  options: Record<string, string>;
  quantity: number;
  unit_price: number;
  line_total: number;
  image_url?: string;
}

export interface MarketplaceProductMessagePayload {
  schema: typeof MARKETPLACE_MESSAGE_SCHEMA;
  product_id: string;
  seller_id: string;
  seller_user_id: string;
  title: string;
  /** Backward-compatible unit price alias. */
  price: number;
  currency: string;
  image_url?: string;
  product_url: string;
  intent: MarketplaceChatIntent;
  selection: MarketplaceProductSelection;
}

export interface MarketplaceProductMessageInput {
  variantId?: string;
  variantSku?: string;
  options?: Record<string, string>;
  quantity?: number;
  unitPrice?: number;
  imageUrl?: string;
}

function cleanOptions(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

  const out: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    const name = key.trim().slice(0, 80);
    const option = typeof raw === 'string' ? raw.trim().slice(0, 160) : '';
    if (name && option) out[name] = option;
    if (Object.keys(out).length >= 16) break;
  }
  return out;
}

function safeQuantity(value: unknown, fallback = 1) {
  const quantity = Math.floor(Number(value));
  return Number.isFinite(quantity) ? Math.min(999, Math.max(1, quantity)) : fallback;
}

function safeMoney(value: unknown, fallback = 0) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? amount : fallback;
}

export function buildMarketplaceProductUrl(
  baseUrl: string,
  selection?: Partial<MarketplaceProductMessageInput>,
) {
  try {
    const url = new URL(baseUrl, typeof window !== 'undefined' ? window.location.origin : 'https://alsamos.com');
    if (selection?.variantId) url.searchParams.set('variant', selection.variantId);

    const quantity = safeQuantity(selection?.quantity, 1);
    if (quantity > 1) url.searchParams.set('qty', String(quantity));

    const options = cleanOptions(selection?.options);
    if (Object.keys(options).length > 0) {
      url.searchParams.set('opts', JSON.stringify(options));
    }

    return url.toString();
  } catch {
    return baseUrl;
  }
}

export function parseMarketplaceSelectionFromUrl(urlValue: string): {
  variantId?: string;
  options: Record<string, string>;
  quantity: number;
} {
  try {
    const url = new URL(urlValue, typeof window !== 'undefined' ? window.location.origin : 'https://alsamos.com');
    const variantId = url.searchParams.get('variant')?.trim() || undefined;
    const quantity = safeQuantity(url.searchParams.get('qty'), 1);
    let options: Record<string, string> = {};

    const rawOptions = url.searchParams.get('opts');
    if (rawOptions && rawOptions.length <= 2500) {
      try {
        options = cleanOptions(JSON.parse(rawOptions));
      } catch {
        options = {};
      }
    }

    return { variantId, options, quantity };
  } catch {
    return { options: {}, quantity: 1 };
  }
}

export function buildMarketplaceProductMessage(
  product: Product,
  sellerUserId: string,
  productUrl: string,
  intent: MarketplaceChatIntent = 'contact',
  input: MarketplaceProductMessageInput = {},
) {
  const unitPrice = safeMoney(input.unitPrice, Number(product.price || 0));
  const quantity = safeQuantity(input.quantity, 1);
  const currency = product.currency || 'USD';
  const options = cleanOptions(input.options);
  const imageUrl = input.imageUrl || product.images?.[0]?.url || undefined;
  const finalUrl = buildMarketplaceProductUrl(productUrl, {
    variantId: input.variantId,
    options,
    quantity,
  });
  const selection: MarketplaceProductSelection = {
    variant_id: input.variantId || undefined,
    variant_sku: input.variantSku || undefined,
    options,
    quantity,
    unit_price: unitPrice,
    line_total: unitPrice * quantity,
    image_url: imageUrl,
  };

  const payload: MarketplaceProductMessagePayload = {
    schema: MARKETPLACE_MESSAGE_SCHEMA,
    product_id: product.id,
    seller_id: product.seller_id,
    seller_user_id: sellerUserId,
    title: product.title,
    price: unitPrice,
    currency,
    image_url: imageUrl,
    product_url: finalUrl,
    intent,
    selection,
  };

  const actionLabel = intent === 'offer'
    ? 'Shu mahsulot bo‘yicha taklif bermoqchiman'
    : 'Shu mahsulot haqida yozmoqchiman';
  const formattedUnitPrice = new Intl.NumberFormat('uz-UZ', {
    style: 'currency',
    currency,
    maximumFractionDigits: currency === 'UZS' ? 0 : 2,
  }).format(unitPrice);
  const formattedTotal = new Intl.NumberFormat('uz-UZ', {
    style: 'currency',
    currency,
    maximumFractionDigits: currency === 'UZS' ? 0 : 2,
  }).format(selection.line_total);
  const optionLabel = Object.entries(options)
    .map(([name, value]) => `${name}: ${value}`)
    .join(' · ');
  const quantityLabel = quantity > 1
    ? `${quantity} × ${formattedUnitPrice} = ${formattedTotal}`
    : formattedUnitPrice;

  return {
    content: [actionLabel, product.title, optionLabel, quantityLabel, finalUrl].filter(Boolean).join('\n'),
    // Product media is rendered by the canonical marketplace link card. Keeping
    // media_url empty prevents the same image from appearing twice in Messages.
    mediaUrl: undefined,
    mediaType: undefined,
    metadata: {
      schema: MARKETPLACE_MESSAGE_SCHEMA,
      message_type: 'marketplace_product',
      marketplace_product: payload,
    } as Record<string, unknown>,
    payload,
  };
}

export function readMarketplaceProductMessage(
  metadata: unknown,
): MarketplaceProductMessagePayload | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const record = metadata as Record<string, unknown>;
  const raw = record.marketplace_product;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const payload = raw as Record<string, unknown>;

  if (
    (payload.schema !== MARKETPLACE_MESSAGE_SCHEMA && payload.schema !== LEGACY_MARKETPLACE_MESSAGE_SCHEMA) ||
    typeof payload.product_id !== 'string' ||
    typeof payload.seller_id !== 'string' ||
    typeof payload.seller_user_id !== 'string' ||
    typeof payload.title !== 'string' ||
    typeof payload.product_url !== 'string'
  ) {
    return null;
  }

  const price = safeMoney(payload.price, NaN);
  if (!Number.isFinite(price)) return null;

  const rawSelection =
    payload.selection && typeof payload.selection === 'object' && !Array.isArray(payload.selection)
      ? payload.selection as Record<string, unknown>
      : null;
  const quantity = safeQuantity(rawSelection?.quantity, 1);
  const unitPrice = safeMoney(rawSelection?.unit_price, price);
  const imageUrl =
    typeof rawSelection?.image_url === 'string'
      ? rawSelection.image_url
      : typeof payload.image_url === 'string'
        ? payload.image_url
        : undefined;

  return {
    schema: MARKETPLACE_MESSAGE_SCHEMA,
    product_id: payload.product_id,
    seller_id: payload.seller_id,
    seller_user_id: payload.seller_user_id,
    title: payload.title,
    price: unitPrice,
    currency: typeof payload.currency === 'string' ? payload.currency : 'USD',
    image_url: imageUrl,
    product_url: payload.product_url,
    intent: payload.intent === 'offer' ? 'offer' : 'contact',
    selection: {
      variant_id: typeof rawSelection?.variant_id === 'string' ? rawSelection.variant_id : undefined,
      variant_sku: typeof rawSelection?.variant_sku === 'string' ? rawSelection.variant_sku : undefined,
      options: cleanOptions(rawSelection?.options),
      quantity,
      unit_price: unitPrice,
      line_total: safeMoney(rawSelection?.line_total, unitPrice * quantity),
      image_url: imageUrl,
    },
  };
}

export function isRecentMarketplaceProductMessage(
  rows: Array<{ metadata?: unknown; created_at?: string | null }>,
  target: {
    productId: string;
    variantId?: string;
    intent?: MarketplaceChatIntent;
  },
  now = Date.now(),
  windowMs = 20_000,
) {
  return rows.some((row) => {
    const payload = readMarketplaceProductMessage(row.metadata);
    if (!payload || !row.created_at) return false;
    if (payload.product_id !== target.productId) return false;
    if ((payload.selection.variant_id || undefined) !== (target.variantId || undefined)) return false;
    if (target.intent && payload.intent !== target.intent) return false;

    const createdAt = new Date(row.created_at).getTime();
    return Number.isFinite(createdAt) && now - createdAt >= 0 && now - createdAt <= windowMs;
  });
}
