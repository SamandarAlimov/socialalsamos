import { useEffect, useState } from 'react';
import { Outlet, Navigate, useLocation } from 'react-router-dom';
import { AppSidebar } from './AppSidebar';
import { BottomNavbar } from './BottomNavbar';
import { MobileHeader } from './MobileHeader';
import { MobileBackHeader } from './MobileBackHeader';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useActivityTracking } from '@/hooks/useActivityTracking';
import { LocationPermissionDialog } from '@/components/LocationPermissionDialog';
import { cn } from '@/lib/utils';
import { resumeMyLiveLocationSharing } from '@/lib/liveLocationSharing';
import { getMobileChromeMode } from '@/lib/mobileRouteChrome';
import { UI_LAYER } from '@/lib/uiLayers';

export function AppLayout() {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();
  const { startSession, trackPageChange } = useActivityTracking();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    if (isAuthenticated) trackPageChange(location.pathname);
  }, [location.pathname, isAuthenticated, trackPageChange]);

  useEffect(() => {
    if (isAuthenticated) startSession(location.pathname);
  }, [isAuthenticated]);

  useEffect(() => {
    if (isAuthenticated) void resumeMyLiveLocationSharing();
  }, [isAuthenticated]);

  // Keep the global desktop/tablet collapse state in the layout, not inside a page.
  // This makes the control a sibling of <main>, so page overflow/z-index cannot cover it.
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
  const isAiPage = location.pathname === '/ai';

  /**
   * One mobile navigation contract for the whole authenticated app:
   *
   * Primary tabs (/home, /messages, /videos, /profile)
   *   -> branded header + bottom navbar.
   * Hamburger/detail pages
   *   -> premium back header + NO bottom navbar.
   * Create
   *   -> immersive full-screen flow with page-owned controls.
   */
  const mobileChromeMode = getMobileChromeMode(location.pathname);
  const hasMobileTopChrome = mobileChromeMode !== 'immersive';
  const showPrimaryMobileChrome = mobileChromeMode === 'primary';
  const showSecondaryMobileChrome = mobileChromeMode === 'secondary';

  // Pages with their own canonical inner scroll container remain viewport-bound.
  const fullHeightPage =
    isCreatePage || isMapPage || isAiPage || isMessagesPage || isVideosPage;

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center bg-background"><div className="flex flex-col items-center gap-4"><Loader2 className="h-10 w-10 animate-spin text-muted-foreground" /><p className="text-muted-foreground">Loading...</p></div></div>;
  }

  if (!isAuthenticated) return <Navigate to="/" replace />;

  return (
    <div className="flex h-[100dvh] min-h-0 w-full overflow-hidden bg-background">
      <AppSidebar collapsed={sidebarCollapsed} onCollapsedChange={setSidebarCollapsed} />

      {/*
        Global collapse control sidebar ichida emas, layout overlay sifatida turadi.
        U oddiy page chrome'dan yuqori, lekin modal backdropdan qat'iy past turishi
        kerak. Aks holda dialog ochilganda collapse tugmasi hira qatlam ustiga chiqib
        qoladi. left qiymati dividerning o'zi, translate esa tugmani aynan 50%
        sidebar / 50% page qilib markazlaydi.
      */}
      {!hasPostPreview && <button
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

      {showPrimaryMobileChrome && <MobileHeader />}
      {showSecondaryMobileChrome && <MobileBackHeader />}

      <main
        data-platform-scroll-root={fullHeightPage ? undefined : 'true'}
        className={cn(
          // App shell is always viewport-bounded. Standard pages scroll here;
          // fullscreen pages deliberately hand scrolling to their own inner root.
          'min-h-0 min-w-0 flex-1 md:ml-0 md:pt-0 md:pb-0',
          fullHeightPage
            ? 'h-full overflow-hidden p-0'
            : 'h-full overflow-x-hidden overflow-y-auto overscroll-y-contain alsamos-scrollbar [-webkit-overflow-scrolling:touch]',
          hasMobileTopChrome ? 'pt-14' : 'pt-0',
          showPrimaryMobileChrome ? 'pb-20' : 'pb-0',
        )}
      >
        <Outlet />
      </main>

      {showPrimaryMobileChrome && <BottomNavbar />}
      <LocationPermissionDialog />
    </div>
  );
}
