import type { Product } from '@/hooks/useMarketplace';

export const MARKETPLACE_MESSAGE_SCHEMA = 'alsamos.marketplace-message.v1';

export type MarketplaceChatIntent = 'contact' | 'offer';

export interface MarketplaceProductMessagePayload {
  schema: typeof MARKETPLACE_MESSAGE_SCHEMA;
  product_id: string;
  seller_id: string;
  seller_user_id: string;
  title: string;
  price: number;
  currency: string;
  image_url?: string;
  product_url: string;
  intent: MarketplaceChatIntent;
}

export function buildMarketplaceProductMessage(
  product: Product,
  sellerUserId: string,
  productUrl: string,
  intent: MarketplaceChatIntent = 'contact',
) {
  const price = Number(product.price || 0);
  const currency = product.currency || 'USD';
  const imageUrl = product.images?.[0]?.url || undefined;
  const actionLabel = intent === 'offer'
    ? 'Shu mahsulot bo‘yicha taklif bermoqchiman'
    : 'Shu mahsulot haqida yozmoqchiman';

  const payload: MarketplaceProductMessagePayload = {
    schema: MARKETPLACE_MESSAGE_SCHEMA,
    product_id: product.id,
    seller_id: product.seller_id,
    seller_user_id: sellerUserId,
    title: product.title,
    price,
    currency,
    image_url: imageUrl,
    product_url: productUrl,
    intent,
  };

  const formattedPrice = new Intl.NumberFormat('uz-UZ', {
    style: 'currency',
    currency,
    maximumFractionDigits: currency === 'UZS' ? 0 : 2,
  }).format(price);

  return {
    content: `${actionLabel}\n${product.title}\n${formattedPrice}\n${productUrl}`,
    mediaUrl: imageUrl,
    mediaType: imageUrl ? 'image' : undefined,
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
    payload.schema !== MARKETPLACE_MESSAGE_SCHEMA ||
    typeof payload.product_id !== 'string' ||
    typeof payload.seller_id !== 'string' ||
    typeof payload.seller_user_id !== 'string' ||
    typeof payload.title !== 'string' ||
    typeof payload.product_url !== 'string'
  ) {
    return null;
  }

  const price = Number(payload.price);
  if (!Number.isFinite(price)) return null;

  return {
    schema: MARKETPLACE_MESSAGE_SCHEMA,
    product_id: payload.product_id,
    seller_id: payload.seller_id,
    seller_user_id: payload.seller_user_id,
    title: payload.title,
    price,
    currency: typeof payload.currency === 'string' ? payload.currency : 'USD',
    image_url: typeof payload.image_url === 'string' ? payload.image_url : undefined,
    product_url: payload.product_url,
    intent: payload.intent === 'offer' ? 'offer' : 'contact',
  };
}

export function isRecentMarketplaceProductMessage(
  rows: Array<{ metadata?: unknown; created_at?: string | null }>,
  productId: string,
  now = Date.now(),
  windowMs = 20_000,
) {
  return rows.some((row) => {
    const payload = readMarketplaceProductMessage(row.metadata);
    if (!payload || payload.product_id !== productId || !row.created_at) return false;
    const createdAt = new Date(row.created_at).getTime();
    return Number.isFinite(createdAt) && now - createdAt >= 0 && now - createdAt <= windowMs;
  });
}
