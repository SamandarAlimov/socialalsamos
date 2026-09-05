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

  useEffect(() => {
    if (isAuthenticated) trackPageChange(location.pathname);
  }, [location.pathname, isAuthenticated, trackPageChange]);

  useEffect(() => {
    if (isAuthenticated) startSession(location.pathname);
  }, [isAuthenticated]);

  useEffect(() => {
    if (isAuthenticated) void resumeMyLiveLocationSharing();
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
  const isAiPage = location.pathname === '/ai';
  const isAdminPage = location.pathname === '/admin' || location.pathname.startsWith('/admin/');

  useEffect(() => {
    if (!isMessagesPage || typeof document === 'undefined') {
      setMessagesChatOpen(false);
      return;
    }

    const sync = () => {
      setMessagesChatOpen(Boolean(document.querySelector('main button[aria-label="Orqaga"]')));
    };

    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [isMessagesPage]);

  const mobileChromeMode = getMobileChromeMode(location.pathname);
  const showPrimaryMobileHeader =
    !isAdminPage && mobileChromeMode === 'primary' && !isMessagesPage && !isVideosPage;
  const showSecondaryMobileHeader = !isAdminPage && mobileChromeMode === 'secondary';
  const showBottomNavbar =
    !isAdminPage && mobileChromeMode === 'primary' && !(isMessagesPage && messagesChatOpen);
  const hasMobileTopChrome = showPrimaryMobileHeader || showSecondaryMobileHeader;

  const fullHeightPage =
    isCreatePage || isMapPage || isAiPage || isMessagesPage || isVideosPage || isAdminPage;

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center bg-background"><div className="flex flex-col items-center gap-4"><Loader2 className="h-10 w-10 animate-spin text-muted-foreground" /><p className="text-muted-foreground">Loading...</p></div></div>;
  }

  if (!isAuthenticated) return <Navigate to="/" replace />;

  return (
    <div
      className={cn(
        'flex h-[100dvh] min-h-0 w-full overflow-hidden bg-background',
        isMessagesPage &&
          messagesChatOpen &&
          '[&_.chat-shell>.pb-safe.mb-16]:!mb-0',
      )}
    >
      {!isAdminPage && (
        <AppSidebar collapsed={sidebarCollapsed} onCollapsedChange={setSidebarCollapsed} />
      )}

      {!isAdminPage && !hasPostPreview && <button
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
          hasMobileTopChrome ? 'pt-14' : 'pt-0',
          showBottomNavbar ? 'pb-20' : 'pb-0',
        )}
      >
        <Outlet />
      </main>

      {isVideosPage && <VideoAdsSurface />}
      {showBottomNavbar && <BottomNavbar />}
      {!isAdminPage && <LocationPermissionDialog />}
    </div>
  );
}
