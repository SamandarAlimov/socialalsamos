import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowLeft, PanelLeft, Settings } from 'lucide-react';
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
  const isAiPage = normalizedPath === '/ai' || normalizedPath === '/projects';
  const isNotificationReturn = isNotificationReturnBridge(
    location.pathname,
    location.search,
  );
  const collapsedBridgeRef = useRef<string | null>(null);
  const [aiTitle, setAiTitle] = useState(
    normalizedPath === '/projects' ? 'Loyihalar' : 'Yangi suhbat',
  );

  // AI owns a rich desktop header, but on mobile the shell already owns the
  // top safe-area row. Mirror the current AI title into this one mobile header
  // so Back + Sidebar + title live on a single premium line instead of stacking
  // two independent headers.
  useEffect(() => {
    if (!isAiPage || typeof document === 'undefined') return;

    const syncTitle = () => {
      const title = document.querySelector<HTMLElement>(
        'main header.h-12.shrink-0 h1',
      )?.textContent?.trim();
      if (title) setAiTitle(title);
      else if (normalizedPath === '/projects') setAiTitle('Loyihalar');
      else setAiTitle('Yangi suhbat');
    };

    syncTitle();
    const observer = new MutationObserver(syncTitle);
    const main = document.querySelector('main');
    if (main) {
      observer.observe(main, {
        childList: true,
        subtree: true,
        characterData: true,
      });
    }

    return () => observer.disconnect();
  }, [isAiPage, normalizedPath]);

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

  const openAiSidebar = () => {
    if (typeof document === 'undefined') return;
    const trigger = document.querySelector<HTMLButtonElement>(
      'main button[aria-label="Yon panelni ochish"]',
    );
    trigger?.click();
  };

  return (
    <>
      <header className="fixed left-0 right-0 top-0 z-50 border-b border-border/50 bg-background/88 shadow-[0_1px_14px_rgba(15,23,42,0.045)] backdrop-blur-2xl md:hidden safe-area-top">
        <div className="flex h-14 items-center gap-1.5 px-3">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={handleBack}
            aria-label="Orqaga"
            className="h-9 w-9 shrink-0 rounded-xl border border-border/50 bg-background/75 shadow-[0_1px_5px_rgba(15,23,42,0.06)] transition-all active:scale-95"
          >
            <ArrowLeft className="h-[18px] w-[18px]" strokeWidth={2.15} />
          </Button>

          {isAiPage && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={openAiSidebar}
              aria-label="AI yon panelini ochish"
              className="h-9 w-9 shrink-0 rounded-xl text-foreground/85 transition-all hover:bg-muted/70 active:scale-95"
            >
              <PanelLeft className="h-[18px] w-[18px]" strokeWidth={2.05} />
            </Button>
          )}

          <span
            className={
              isNotifications
                ? 'ml-2 min-w-0 flex-1 truncate text-base font-semibold text-foreground'
                : isAiPage
                  ? 'ml-1 min-w-0 flex-1 truncate text-[15px] font-semibold tracking-[-0.01em] text-foreground'
                  : 'ml-2 min-w-0 flex-1 truncate text-sm font-semibold text-foreground'
            }
          >
            {isNotifications ? 'Bildirishnomalar' : isAiPage ? aiTitle : 'Orqaga'}
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

      {isAiPage && (
        <style>{`
          @media (max-width: 767.98px) {
            main header.h-12.shrink-0.items-center.gap-2 {
              display: none !important;
            }
          }
        `}</style>
      )}
    </>
  );
}
