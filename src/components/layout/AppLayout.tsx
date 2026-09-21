import { useEffect, useState } from 'react';
import { Outlet, Navigate, useLocation } from 'react-router-dom';
import { AppSidebar } from './AppSidebar';
import { BottomNavbar } from './BottomNavbar';
import { MobileHeader } from './MobileHeader';
import { MobileBackHeader } from './MobileBackHeader';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useActivityTracking } from '@/hooks/useActivityTracking';
import { useAdRelevanceBootstrap } from '@/hooks/useAdRelevanceBootstrap';
import { LocationPermissionDialog } from '@/components/LocationPermissionDialog';
import { VideoAdsSurface } from '@/components/ads/VideoAdsSurface';
import { cn } from '@/lib/utils';
import { resumeMyLiveLocationSharing } from '@/lib/liveLocationSharing';
import { getMobileChromeMode } from '@/lib/mobileRouteChrome';
import { UI_LAYER } from '@/lib/uiLayers';

export function AppLayout() {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();
  const { startSession, trackPageChange } = useActivityTracking();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [messagesChatOpen, setMessagesChatOpen] = useState(false);
  const [immersiveMediaIds, setImmersiveMediaIds] = useState<Set<string>>(() => new Set());

  // Shared Home + Ads relevance graph. This uses only first-party Alsamos
  // behavior and stores a compact interest snapshot rather than raw history.
  useAdRelevanceBootstrap();

  useEffect(() => {
    if (isAuthenticated) trackPageChange(location.pathname);
  }, [location.pathname, isAuthenticated, trackPageChange]);

  useEffect(() => {
    if (isAuthenticated) startSession(location.pathname);
  }, [isAuthenticated]);

  useEffect(() => {
    if (isAuthenticated) void resumeMyLiveLocationSharing();
  }, [isAuthenticated]);

  // The authenticated shell has exactly one vertical scroll owner: <main>.
  // Desktop browsers can expose document scrolling after keyboard focus/scroll
  // restoration even when the app root itself is overflow-hidden. Lock the
  // document while AppLayout is mounted and restore the previous styles when
  // leaving the authenticated shell so public/auth pages keep native scrolling.
  useEffect(() => {
    if (!isAuthenticated || typeof document === 'undefined') return;

    const html = document.documentElement;
    const body = document.body;
    const previous = {
      htmlOverflow: html.style.overflow,
      htmlOverscrollY: html.style.overscrollBehaviorY,
      bodyOverflow: body.style.overflow,
      bodyOverscrollY: body.style.overscrollBehaviorY,
    };

    html.style.overflow = 'hidden';
    html.style.overscrollBehaviorY = 'none';
    body.style.overflow = 'hidden';
    body.style.overscrollBehaviorY = 'none';

    return () => {
      html.style.overflow = previous.htmlOverflow;
      html.style.overscrollBehaviorY = previous.htmlOverscrollY;
      body.style.overflow = previous.bodyOverflow;
      body.style.overscrollBehaviorY = previous.bodyOverscrollY;
    };
  }, [isAuthenticated]);

  useEffect(() => {
    const check = () => {
      if (window.innerWidth < 1100) setSidebarCollapsed(true);
    };
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const isMapPage = location.pathname === '/map';
  const hasPostPreview =
    location.pathname === '/home' && new URLSearchParams(location.search).has('post');
  const isCreatePage = location.pathname === '/create';
  const isMessagesPage = location.pathname === '/messages';
  const isVideosPage = location.pathname === '/videos';
  const isAiWorkspace =
    location.pathname === '/ai' ||
    location.pathname.startsWith('/ai/') ||
    location.pathname === '/projects';
  const isAdminPage = location.pathname === '/admin' || location.pathname.startsWith('/admin/');

  useEffect(() => {
    if (!isMessagesPage || typeof document === 'undefined') {
      setMessagesChatOpen(false);
      return;
    }

    const sync = () => {
      const backButton = document.querySelector<HTMLElement>(
        'main button[aria-label="Orqaga"]'
      );

      // MessagesPage keeps the mobile chat panel mounted and toggles it with
      // Tailwind's `hidden` class. A raw querySelector therefore keeps finding
      // the back button after the user returns to the chat list, which leaves
      // the bottom navbar hidden. Track the button's actual rendered visibility
      // instead, and react to class/style mutations on the mounted panel.
      const isVisible = Boolean(
        backButton &&
          !backButton.closest('.hidden') &&
          backButton.getClientRects().length > 0
      );

      setMessagesChatOpen(isVisible);
    };

    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style'],
    });
    window.addEventListener('resize', sync);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', sync);
    };
  }, [isMessagesPage]);

  // VideoPlayer uses a CSS fullscreen fallback on iPhone/iOS and restricted
  // webviews where the browser Fullscreen API is unavailable. That fallback
  // still lives inside the authenticated shell, so the shell must explicitly
  // get out of the way (header, bottom nav, sidebar) while media is immersive.
  // Track player ids instead of a single boolean so multiple mounted feed
  // players cannot accidentally clear another player's fullscreen state.
  useEffect(() => {
    const handleImmersiveChange = (event: Event) => {
      const detail = (event as CustomEvent<{ id?: string; active?: boolean }>).detail;
      if (!detail?.id) return;

      setImmersiveMediaIds((current) => {
        const next = new Set(current);
        if (detail.active) next.add(detail.id);
        else next.delete(detail.id);

        if (
          next.size === current.size &&
          Array.from(next).every((id) => current.has(id))
        ) {
          return current;
        }
        return next;
      });
    };

    window.addEventListener('alsamos:immersive-change', handleImmersiveChange);
    return () => window.removeEventListener('alsamos:immersive-change', handleImmersiveChange);
  }, []);

  const isImmersiveMediaActive = immersiveMediaIds.size > 0;
  const mobileChromeMode = getMobileChromeMode(location.pathname);
  const showPrimaryMobileHeader =
    !isImmersiveMediaActive &&
    !isAdminPage &&
    !isAiWorkspace &&
    mobileChromeMode === 'primary' &&
    !isMessagesPage &&
    !isVideosPage;
  const showSecondaryMobileHeader =
    !isImmersiveMediaActive &&
    !isAdminPage &&
    !isAiWorkspace &&
    mobileChromeMode === 'secondary';
  const showBottomNavbar =
    !isImmersiveMediaActive &&
    !isAdminPage &&
    !isAiWorkspace &&
    mobileChromeMode === 'primary' &&
    !(isMessagesPage && messagesChatOpen);
  const hasMobileTopChrome = showPrimaryMobileHeader || showSecondaryMobileHeader;

  const fullHeightPage =
    isCreatePage || isMapPage || isAiWorkspace || isMessagesPage || isVideosPage || isAdminPage;

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center bg-background"><div className="flex flex-col items-center gap-4"><Loader2 className="h-10 w-10 animate-spin text-muted-foreground" /><p className="text-muted-foreground">Loading...</p></div></div>;
  }

  if (!isAuthenticated) return <Navigate to="/" replace />;

  return (
    <div
      data-platform-shell="true"
      className={cn(
        // h-screen-safe uses 100dvh on modern mobile browsers and falls back to
        // 100vh where dynamic viewport units are unavailable. This keeps the
        // shell stable across Android, iOS, Samsung Internet, tablets and PWAs.
        'flex h-screen-safe min-h-0 w-full overflow-hidden bg-background',
        isMessagesPage &&
          messagesChatOpen &&
          '[&_.chat-shell>.pb-safe.mb-16]:!mb-0',
      )}
    >
      {!isAdminPage && !isImmersiveMediaActive && (
        <AppSidebar collapsed={sidebarCollapsed} onCollapsedChange={setSidebarCollapsed} />
      )}

      {!isAdminPage && !hasPostPreview && !isImmersiveMediaActive && <button
        type="button"
        aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        onClick={() => setSidebarCollapsed((current) => !current)}
        className={cn(
          'fixed top-20 hidden h-8 w-8 -translate-x-1/2 items-center justify-center rounded-full border border-sidebar-border bg-background shadow-lg transition-[left,background-color,color,box-shadow] duration-300 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 md:flex',
          UI_LAYER.shellFloating,
          sidebarCollapsed ? 'left-[72px]' : 'left-64',
        )}
      >
        {sidebarCollapsed ? (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronLeft className="h-4 w-4 text-muted-foreground" />
        )}
      </button>}

      {showPrimaryMobileHeader && <MobileHeader />}
      {showSecondaryMobileHeader && <MobileBackHeader />}

      <main
        data-platform-scroll-root={fullHeightPage ? undefined : 'true'}
        className={cn(
          'min-h-0 min-w-0 flex-1 md:ml-0 md:pt-0 md:pb-0',
          fullHeightPage
            ? 'h-full overflow-hidden p-0'
            : 'h-full overflow-x-hidden overflow-y-auto overscroll-y-contain alsamos-scrollbar [-webkit-overflow-scrolling:touch]',
          isVideosPage &&
            'bg-background [&>div]:!bg-background [&_.snap-start]:!bg-background dark:bg-black dark:[&>div]:!bg-black dark:[&_.snap-start]:!bg-black',
          hasMobileTopChrome ? 'pt-14' : 'pt-0',
          showBottomNavbar ? 'pb-20' : 'pb-0',
        )}
      >
        <Outlet />
      </main>

      {isVideosPage && !isImmersiveMediaActive && <VideoAdsSurface />}
      {showBottomNavbar && <BottomNavbar />}
      {!isAdminPage && <LocationPermissionDialog />}
    </div>
  );
}
