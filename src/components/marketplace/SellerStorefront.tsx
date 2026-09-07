import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Product } from '@/hooks/useMarketplace';

interface SellerStorefrontProps {
  sellerId: string | null;
  onClose: () => void;
  onProductSelect: (product: Product) => void;
  onMessageSeller?: (userId: string) => void;
}

/**
 * Legacy compatibility bridge.
 *
 * Old Marketplace links used `?seller=<id>` and opened a bottom Sheet. Stores
 * are now canonical standalone pages (`/marketplace/store/:sellerId`). Keeping
 * this component as a redirect means old shared/bookmarked links continue to
 * work while the sheet UI is completely retired.
 */
export function SellerStorefront({ sellerId }: SellerStorefrontProps) {
  const navigate = useNavigate();

  useEffect(() => {
    if (!sellerId) return;
    navigate(`/marketplace/store/${encodeURIComponent(sellerId)}`, { replace: true });
  }, [navigate, sellerId]);

  return null;
}
