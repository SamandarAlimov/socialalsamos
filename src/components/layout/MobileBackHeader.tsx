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
  const isAiWorkspace = normalizedPath === '/ai' || normalizedPath === '/projects';
  const [aiTitle, setAiTitle] = useState('Alsamos AI');
  const isNotificationReturn = isNotificationReturnBridge(
    location.pathname,
    location.search,
  );
  const collapsedBridgeRef = useRef<string | null>(null);

  // AI already owns a rich workspace header. On mobile the authenticated shell
  // used to add a second "Orqaga" row above it. We keep one shell header and
  // mirror the AI workspace title into it, while hiding only the duplicate
  // in-page header. This preserves a stable 56px chrome contract for AppLayout.
  useEffect(() => {
    if (!isAiWorkspace || typeof document === 'undefined') return;

    const syncTitle = () => {
      const heading = document.querySelector<HTMLElement>('main header h1');
      const value = heading?.textContent?.trim();
      if (value) setAiTitle(value);
    };

    syncTitle();
    const main = document.querySelector('main');
    if (!main) return;

    const observer = new MutationObserver(syncTitle);
    observer.observe(main, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [isAiWorkspace, location.search]);

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
    if (!isAiWorkspace || typeof document === 'undefined') return;
    document
      .querySelector<HTMLButtonElement>('main button[aria-label="Yon panelni ochish"]')
      ?.click();
  };

  const title = isNotifications
    ? 'Bildirishnomalar'
    : isAiWorkspace
      ? aiTitle
      : 'Orqaga';

  return (
    <>
      <header className="fixed left-0 right-0 top-0 z-50 border-b border-border/50 bg-background/88 shadow-[0_1px_18px_rgba(15,23,42,0.055)] backdrop-blur-2xl md:hidden safe-area-top">
        <div className="flex h-14 items-center gap-1.5 px-3">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={handleBack}
            aria-label="Orqaga"
            className="h-10 w-10 shrink-0 rounded-full border border-border/55 bg-background/80 shadow-sm transition-[transform,background-color] active:scale-95"
          >
            <ArrowLeft className="h-5 w-5" strokeWidth={2.2} />
          </Button>

          {isAiWorkspace && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={openAiSidebar}
              aria-label="AI yon panelini ochish"
              className="h-10 w-10 shrink-0 rounded-full text-foreground/90 transition-[transform,background-color] active:scale-95"
            >
              <PanelLeft className="h-[19px] w-[19px]" strokeWidth={2.1} />
            </Button>
          )}

          <span
            className={
              isNotifications || isAiWorkspace
                ? 'ml-1 min-w-0 flex-1 truncate text-[15px] font-semibold tracking-[-0.01em] text-foreground'
                : 'ml-2 min-w-0 flex-1 truncate text-sm font-semibold text-foreground'
            }
          >
            {title}
          </span>

          {isAiWorkspace && (
            <span className="mr-1 hidden max-w-[34vw] truncate rounded-full border border-border/50 bg-muted/35 px-2.5 py-1 text-[10px] font-medium text-muted-foreground min-[390px]:block">
              AI
            </span>
          )}

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

      {(isNotifications || isAiWorkspace) && (
        <style>{`
          @media (max-width: 767.98px) {
            ${isNotifications ? `
              main header.sticky h1 {
                display: none !important;
              }

              main header.sticky button[aria-label='Bildirishnoma sozlamalari'] {
                display: none !important;
              }
            ` : ''}

            ${isAiWorkspace ? `
              /* AIPageV2 has its own desktop/workspace header. On mobile the
                 shell above replaces it, preventing the previous double header. */
              main header {
                display: none !important;
              }
            ` : ''}
          }
        `}</style>
      )}
    </>
  );
}
