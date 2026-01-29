import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { AlsamosLogo } from '@/components/AlsamosLogo';
import { NotificationsDropdown } from '@/components/NotificationsDropdown';
import { Button } from '@/components/ui/button';
import { MobileMenu } from './MobileMenu';

export function MobileHeader() {
  const navigate = useNavigate();

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
          
          <MobileMenu />
        </div>
      </div>
    </header>
  );
}
