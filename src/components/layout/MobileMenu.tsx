import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Menu,
  Compass,
  ShoppingBag,
  MapPin,
  Wallet,
  Sparkles,
  LayoutGrid,
  Settings,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { MobileMenuDrawer, type MobileMenuNavItem } from "./MobileMenuDrawer";

const menuItems: MobileMenuNavItem[] = [
  { icon: Compass, label: 'Kashf etish', path: '/discover' },
  { icon: ShoppingBag, label: 'Bozor', path: '/marketplace' },
  { icon: MapPin, label: 'Xarita', path: '/map' },
  { icon: Wallet, label: 'To‘lov', path: '/payment' },
  { icon: Sparkles, label: 'AI yordamchi', path: '/ai' },
  { icon: LayoutGrid, label: 'Mini ilovalar', path: '/mini-apps' },
  { icon: Settings, label: 'Sozlamalar', path: '/settings' },
];

interface MobileMenuProps {
  className?: string;
}

export function MobileMenu({ className }: MobileMenuProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [isOpen, setIsOpen] = useState(false);

  const handleNavigate = (path: string) => {
    navigate(path);
    setIsOpen(false);
  };

  const activePath = useMemo(() => location.pathname, [location.pathname]);

  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className={cn("h-9 w-9 relative", className)}
        onClick={() => setIsOpen(true)}
        aria-label="Menyuni ochish"
      >
        <Menu className="h-5 w-5" />
      </Button>

      {typeof document !== "undefined" &&
        createPortal(
          <MobileMenuDrawer
            isOpen={isOpen}
            onClose={() => setIsOpen(false)}
            onNavigate={handleNavigate}
            onLogout={() => {
              setIsOpen(false);
              logout();
            }}
            activePath={activePath}
            items={menuItems}
          />,
          document.body
        )}
    </>
  );
}
