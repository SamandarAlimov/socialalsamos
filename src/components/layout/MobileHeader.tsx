import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { AlsamosLogo } from '@/components/AlsamosLogo';
import { NotificationsDropdown } from '@/components/NotificationsDropdown';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { MobileMenu } from './MobileMenu';

export function MobileHeader() {
  const navigate = useNavigate();
  const location = useLocation();
  const [hidden, setHidden] = useState(false);
  const lastScrollTopRef = useRef(0);
  const directionRef = useRef<'up' | 'down' | null>(null);
  const travelRef = useRef(0);

  useEffect(() => {
    setHidden(false);
    directionRef.current = null;
    travelRef.current = 0;

    // The authenticated shell scrolls inside <main>, not the window. Home gets
    // an Instagram-style auto-hiding top bar: down = more feed space, a small
    // upward gesture = bring navigation back immediately.
    if (location.pathname !== '/home' || typeof document === 'undefined') return;

    const scrollRoot = document.querySelector<HTMLElement>('[data-platform-scroll-root="true"]');
    if (!scrollRoot) return;

    lastScrollTopRef.current = scrollRoot.scrollTop;
    let frame = 0;

    const handleScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const current = Math.max(0, scrollRoot.scrollTop);
        const delta = current - lastScrollTopRef.current;
        lastScrollTopRef.current = current;

        if (current <= 12) {
          directionRef.current = null;
          travelRef.current = 0;
          setHidden(false);
          return;
        }

        if (Math.abs(delta) < 1) return;

        const nextDirection: 'up' | 'down' = delta > 0 ? 'down' : 'up';
        if (directionRef.current !== nextDirection) {
          directionRef.current = nextDirection;
          travelRef.current = 0;
        }

        travelRef.current += Math.abs(delta);

        if (nextDirection === 'down' && current > 72 && travelRef.current >= 18) {
          setHidden(true);
          travelRef.current = 0;
        } else if (nextDirection === 'up' && travelRef.current >= 6) {
          setHidden(false);
          travelRef.current = 0;
        }
      });
    };

    scrollRoot.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      if (frame) cancelAnimationFrame(frame);
      scrollRoot.removeEventListener('scroll', handleScroll);
    };
  }, [location.pathname]);

  return (
    <header
      className={cn(
        'fixed left-0 right-0 top-0 z-50 border-b border-border bg-background/95 backdrop-blur-lg md:hidden safe-area-top',
        'transform-gpu transition-transform duration-200 ease-out will-change-transform',
        hidden ? '-translate-y-full' : 'translate-y-0',
      )}
    >
      <div className="flex h-14 items-center justify-between px-4">
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
