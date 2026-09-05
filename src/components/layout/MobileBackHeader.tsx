import { ArrowLeft } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import {
  getMobileBackFallback,
  isSafeInternalPath,
} from '@/lib/mobileRouteChrome';

interface MobileBackState {
  mobileBackTarget?: unknown;
}

/**
 * Secondary mobile pages use one premium, predictable back affordance instead
 * of keeping the primary Alsamos header and bottom tabs visible everywhere.
 */
export function MobileBackHeader() {
  const navigate = useNavigate();
  const location = useLocation();

  const handleBack = () => {
    const state = (location.state ?? {}) as MobileBackState;
    const explicitTarget = state.mobileBackTarget;
    const current = `${location.pathname}${location.search}`;

    // Hamburger destinations remember the primary page they came from. This is
    // also reliable after a reload because React Router stores location.state
    // in browser history.
    if (isSafeInternalPath(explicitTarget) && explicitTarget !== current) {
      navigate(explicitTarget, { replace: true });
      return;
    }

    // Nested details (settings section, product, mini-app edit, etc.) should use
    // natural browser history when available.
    const historyIndex = Number(window.history.state?.idx ?? 0);
    if (Number.isFinite(historyIndex) && historyIndex > 0) {
      navigate(-1);
      return;
    }

    navigate(getMobileBackFallback(location.pathname), { replace: true });
  };

  return (
    <header className="fixed left-0 right-0 top-0 z-50 border-b border-border/60 bg-background/90 shadow-[0_1px_12px_rgba(0,0,0,0.04)] backdrop-blur-xl md:hidden safe-area-top">
      <div className="flex h-14 items-center px-3">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={handleBack}
          aria-label="Orqaga"
          className="h-10 w-10 shrink-0 rounded-full border border-border/60 bg-background/80 shadow-sm transition-transform active:scale-95"
        >
          <ArrowLeft className="h-5 w-5" strokeWidth={2.2} />
        </Button>
        <span className="ml-2 text-sm font-semibold text-foreground">Orqaga</span>
      </div>
    </header>
  );
}
