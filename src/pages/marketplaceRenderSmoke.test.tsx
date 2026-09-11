// @vitest-environment jsdom
import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

vi.mock('@/hooks/useHapticFeedback', () => ({
  useHapticFeedback: () => ({ triggerHaptic: vi.fn() }),
}));

vi.mock('@/hooks/use-mobile', () => ({
  useIsMobile: () => false,
}));

vi.mock('@/hooks/useMarketplace', () => {
  const refresh = vi.fn(async () => undefined);
  const product = {
    id: 'product-1',
    seller_id: 'seller-1',
    category_id: null,
    title: 'Smoke Test Product',
    description: 'Marketplace render smoke test',
    price: 1500000,
    compare_at_price: 1700000,
    currency: 'USD',
    quantity: 3,
    condition: 'new',
    location: null,
    shipping_available: true,
    shipping_price: 0,
    is_negotiable: false,
    is_featured: false,
    status: 'active',
    views_count: 10,
    likes_count: 2,
    created_at: '2026-09-11T00:00:00.000Z',
    images: [],
  };

  return {
    useCategories: () => ({ categories: [] }),
    useProducts: () => ({ products: [product], isLoading: false, error: null, refresh }),
    useNearbyMarketplaceProducts: () => ({ products: [], isLoading: false, error: null, refresh }),
    useSellerProducts: () => ({ products: [], seller: null, isLoading: false, refresh }),
    useSavedProducts: () => ({ products: [], isLoading: false, refresh }),
    useCart: () => ({ itemCount: 0 }),
  };
});

vi.mock('@/components/PullToRefresh', () => ({ PullToRefresh: ({ children }: any) => children }));
vi.mock('@/components/marketplace/ProductCard', () => ({ ProductCard: () => null }));
vi.mock('@/components/marketplace/BecomeSeller', () => ({ BecomeSeller: () => null }));
vi.mock('@/components/marketplace/CreateProductDialog', () => ({ CreateProductDialog: () => null }));
vi.mock('@/components/marketplace/CartSheet', () => ({ CartSheet: () => null }));
vi.mock('@/components/marketplace/SellerDashboard', () => ({ SellerDashboard: () => null }));
vi.mock('@/components/marketplace/OrdersView', () => ({ OrdersView: () => null }));
vi.mock('@/components/marketplace/SellerOrdersView', () => ({ SellerOrdersView: () => null }));
vi.mock('@/components/marketplace/SellerStorefront', () => ({ SellerStorefront: () => null }));
vi.mock('@/components/marketplace/VideoCommerceSection', () => ({ VideoCommerceSection: () => null }));
vi.mock('@/components/marketplace/CategoryIcon', () => ({ CategoryIcon: () => null }));
vi.mock('@/components/marketplace/MarketplaceBottomNav', () => ({ MarketplaceBottomNav: () => null }));

import MarketplacePage from './MarketplacePage';

describe('Marketplace browse render smoke', () => {
  it('renders the browse surface with a real product row instead of crashing to a blank outlet', () => {
    render(
      React.createElement(
        MemoryRouter,
        { initialEntries: ['/marketplace'] },
        React.createElement(MarketplacePage),
      ),
    );

    expect(screen.getByText('Alsamos Bozor')).toBeTruthy();
    expect(screen.getAllByText('Smoke Test Product').length).toBeGreaterThan(0);
    expect(document.body.textContent).toContain('so');
  });
});
