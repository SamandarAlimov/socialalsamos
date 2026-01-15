import { useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { 
  Menu, 
  Search, 
  ShoppingBag, 
  LogOut,
  Compass,
  MapPin,
  Wallet,
  Sparkles
} from 'lucide-react';
import { AlsamosLogo } from '@/components/AlsamosLogo';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { NotificationsDropdown } from '@/components/NotificationsDropdown';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';

interface NavItem {
  icon: React.ElementType;
  label: string;
  path: string;
}

const menuItems: NavItem[] = [
  { icon: Compass, label: 'Discover', path: '/discover' },
  { icon: ShoppingBag, label: 'Marketplace', path: '/marketplace' },
  { icon: MapPin, label: 'Map', path: '/map' },
  { icon: Wallet, label: 'Payment', path: '/payment' },
  { icon: Sparkles, label: 'AI Assistant', path: '/ai' },
];

export function MobileHeader() {
  const location = useLocation();
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [open, setOpen] = useState(false);


  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-lg border-b border-border md:hidden safe-area-top">
      <div className="flex items-center justify-between h-14 px-4">
        {/* Logo */}
        <AlsamosLogo size="sm" showText />

        {/* Right Actions */}
        <div className="flex items-center gap-1">
          <NotificationsDropdown />
          
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-9 w-9"
            onClick={() => navigate('/search')}
          >
            <Search className="h-5 w-5" />
          </Button>
          
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="h-9 w-9">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[280px] p-0">
              <SheetHeader className="p-4 border-b border-border">
                <SheetTitle className="text-left">Menu</SheetTitle>
              </SheetHeader>
              
              <nav className="p-3 space-y-1">
                {menuItems.map((item) => {
                  const isActive = location.pathname === item.path;
                  
                  return (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      onClick={() => setOpen(false)}
                      className={cn(
                        "flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-200",
                        isActive 
                          ? "bg-primary text-primary-foreground" 
                          : "text-foreground hover:bg-accent"
                      )}
                    >
                      <item.icon className={cn(
                        "h-5 w-5",
                        !isActive && "text-muted-foreground"
                      )} />
                      <span className="font-medium">{item.label}</span>
                    </NavLink>
                  );
                })}
              </nav>
              
              {/* Logout */}
              <div className="absolute bottom-0 left-0 right-0 p-3 border-t border-border safe-area-bottom">
                <button
                  onClick={() => {
                    setOpen(false);
                    logout();
                  }}
                  className="flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-200 w-full text-destructive hover:bg-destructive/10"
                >
                  <LogOut className="h-5 w-5" />
                  <span className="font-medium">Logout</span>
                </button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
