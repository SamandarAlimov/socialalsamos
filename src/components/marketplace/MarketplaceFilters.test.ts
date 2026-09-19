import { describe, expect, it } from 'vitest';
import type { Product } from '@/hooks/useMarketplace';
import {
  marketplaceProductMatchesFilters,
  type MarketplaceDeliveryMode,
} from '@/components/marketplace/MarketplaceFilters';

function product(overrides: Partial<Product> = {}): Product {
  return {
    id: 'product-1',
    seller_id: 'seller-1',
    category_id: null,
    title: 'Test product',
    description: null,
    price: 800_000,
    compare_at_price: 1_000_000,
    currency: 'UZS',
    quantity: 3,
    condition: 'new',
    location: null,
    shipping_available: true,
    shipping_price: 0,
    is_negotiable: false,
    is_featured: false,
    status: 'active',
    views_count: 0,
    likes_count: 0,
    created_at: '2026-09-19T00:00:00.000Z',
    images: [],
    ...overrides,
  };
}

function matches(
  target: Product,
  overrides: Partial<{
    priceRange: [number, number] | null;
    conditionFilter: string;
    minDiscount: number;
    inStockOnly: boolean;
    deliveryMode: MarketplaceDeliveryMode;
  }> = {},
) {
  return marketplaceProductMatchesFilters(target, {
    priceRange: null,
    conditionFilter: 'all',
    minDiscount: 0,
    inStockOnly: false,
    deliveryMode: 'all',
    ...overrides,
  });
}

describe('marketplaceProductMatchesFilters', () => {
  it('supports real discount thresholds', () => {
    const discounted = product({ price: 750_000, compare_at_price: 1_000_000 });

    expect(matches(discounted, { minDiscount: 25 })).toBe(true);
    expect(matches(discounted, { minDiscount: 50 })).toBe(false);
  });

  it('distinguishes paid shipping, free shipping and pickup', () => {
    expect(matches(product({ shipping_available: true, shipping_price: 0 }), {
      deliveryMode: 'free_shipping',
    })).toBe(true);

    expect(matches(product({ shipping_available: true, shipping_price: 25_000 }), {
      deliveryMode: 'free_shipping',
    })).toBe(false);

    expect(matches(product({ shipping_available: false }), {
      deliveryMode: 'pickup',
    })).toBe(true);
  });

  it('combines price, condition and stock filters', () => {
    const target = product({ price: 2_000_000, condition: 'like_new', quantity: 1 });

    expect(matches(target, {
      priceRange: [1_500_000, 2_500_000],
      conditionFilter: 'like_new',
      inStockOnly: true,
    })).toBe(true);

    expect(matches(target, {
      priceRange: [0, 1_000_000],
      conditionFilter: 'like_new',
      inStockOnly: true,
    })).toBe(false);
  });
});
