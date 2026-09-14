import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

interface CartSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Legacy compatibility wrapper.
 *
 * Marketplace now has one canonical cart surface: /marketplace/cart.
 * Older callers can keep toggling CartSheet while we route them to the page,
 * avoiding a second desktop/tablet cart UI drifting away from the real cart.
 */
export function CartSheet({ open, onOpenChange }: CartSheetProps) {
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;
    onOpenChange(false);
    navigate('/marketplace/cart');
  }, [navigate, onOpenChange, open]);

  return null;
}
