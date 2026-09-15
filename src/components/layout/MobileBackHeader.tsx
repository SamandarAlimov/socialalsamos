import { useLayoutEffect, useRef } from 'react';
import { ArrowLeft, Settings } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import {
  getMobileBackFallback,
  isSafeInternalPath,
} from '@/lib/mobileRouteChrome';
import {
  isNotificationReturnBridge,
  notificationReturnHistoryDelta,
  stripNotificationReturnBridge,
} from '@/lib/notificationNavigation';

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
  const normalizedPath = location.pathname.replace(/\/+$/, '') || '/';
  const isNotifications = normalizedPath === '/notifications';
  const isNotificationReturn = isNotificationReturnBridge(
    location.pathname,
    location.search,
  );
  const collapsedBridgeRef = useRef<string | null>(null);

  // Notification post preview currently returns through an explicit `returnTo`
  // navigation. That creates a temporary history shape like:
  //   Notifications -> Post preview -> Notifications(return bridge)
  // Collapse the two transient entries before paint so the user lands on the
  // original Notifications entry. The next Back therefore exits Notifications
  // instead of reopening the post preview.
  useLayoutEffect(() => {
    if (!isNotificationReturn) {
      collapsedBridgeRef.current = null;
      return;
    }

    const bridgeKey = `${location.pathname}${location.search}${location.hash}`;
    if (collapsedBridgeRef.current === bridgeKey) return;
    collapsedBridgeRef.current = bridgeKey;

    const delta = notificationReturnHistoryDelta(window.history.state?.idx);
    if (delta !== null) {
      navigate(delta);
      return;
    }

    navigate(
      stripNotificationReturnBridge(
        location.pathname,
        location.search,
        location.hash,
      ),
      { replace: true },
    );
  }, [
    isNotificationReturn,
    location.hash,
    location.pathname,
    location.search,
    navigate,
  ]);

  const handleBack = () => {
    // If the user taps Back before the layout effect has collapsed the bridge,
    // perform the same cleanup instead of exposing the transient post entry.
    if (isNotificationReturn) {
      const delta = notificationReturnHistoryDelta(window.history.state?.idx);
      if (delta !== null) {
        navigate(delta);
      } else {
        navigate(
          stripNotificationReturnBridge(
            location.pathname,
            location.search,
            location.hash,
          ),
          { replace: true },
        );
      }
      return;
    }

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
    <>
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

          <span
            className={
              isNotifications
                ? 'ml-3 min-w-0 flex-1 truncate text-base font-semibold text-foreground'
                : 'ml-2 min-w-0 flex-1 truncate text-sm font-semibold text-foreground'
            }
          >
            {isNotifications ? 'Bildirishnomalar' : 'Orqaga'}
          </span>

          {isNotifications && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => navigate('/settings?tab=notifications')}
              aria-label="Bildirishnoma sozlamalari"
              className="h-10 w-10 shrink-0 rounded-full"
            >
              <Settings className="h-5 w-5" />
            </Button>
          )}
        </div>
      </header>

      {isNotifications && (
        <style>{`
          @media (max-width: 767.98px) {
            main header.sticky h1 {
              display: none !important;
            }

            main header.sticky button[aria-label='Bildirishnoma sozlamalari'] {
              display: none !important;
            }
          }
        `}</style>
      )}
    </>
  );
}
