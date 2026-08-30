import { useEffect, useState } from 'react';
import { Outlet, Navigate, useLocation } from 'react-router-dom';
import { AppSidebar } from './AppSidebar';
import { BottomNavbar } from './BottomNavbar';
import { MobileHeader } from './MobileHeader';
import { Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useActivityTracking } from '@/hooks/useActivityTracking';
import { LocationPermissionDialog } from '@/components/LocationPermissionDialog';
import { cn } from '@/lib/utils';
import { resumeMyLiveLocationSharing } from '@/lib/liveLocationSharing';

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

  const hideHeaderOnPages =
    location.pathname === '/messages' ||
    location.pathname === '/map' ||
    location.pathname === '/videos' ||
    location.pathname === '/create' ||
    location.pathname.startsWith('/marketplace/product/');

  const isMapPage = location.pathname === '/map';
  const isCreatePage = location.pathname === '/create';
  const immersiveMobile = isCreatePage || isMapPage;

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center bg-background"><div className="flex flex-col items-center gap-4"><Loader2 className="h-10 w-10 animate-spin text-primary" /><p className="text-muted-foreground">Loading...</p></div></div>;
  }

  if (!isAuthenticated) return <Navigate to="/" replace />;

  return (
    <div
      className={cn(
        'flex w-full bg-background',
        isMapPage || isCreatePage
          ? 'h-[100dvh] min-h-0 overflow-hidden'
          : 'min-h-screen',
      )}
    >
      <AppSidebar collapsed={sidebarCollapsed} onCollapsedChange={setSidebarCollapsed} />

      {!hideHeaderOnPages && <MobileHeader />}

      <main className={cn(
        'flex-1 md:ml-0 md:pt-0 md:pb-0',
        isMapPage || isCreatePage
          ? 'h-full min-h-0 overflow-hidden p-0'
          : 'alsamos-scrollbar overflow-auto',
        hideHeaderOnPages ? 'pt-0' : 'pt-14',
        immersiveMobile ? 'pb-0' : 'pb-20'
      )}>
        <Outlet />
      </main>

      {/* Keep the collapse control above normal page content, but below dialogs.
          Modal backdrops/dialogs must be able to cover this control. */}
      <button
        type="button"
        aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        onClick={() => setSidebarCollapsed(value => !value)}
        className="hidden md:flex fixed top-20 z-40 h-8 w-8 -translate-x-1/2 items-center justify-center rounded-full bg-background border border-border shadow-md hover:bg-accent transition-colors pointer-events-auto"
        style={{ left: sidebarCollapsed ? '72px' : '256px' }}
      >
        {sidebarCollapsed ? <ChevronRight className="h-4 w-4 text-muted-foreground" /> : <ChevronLeft className="h-4 w-4 text-muted-foreground" />}
      </button>

      {!immersiveMobile && <BottomNavbar />}
      <LocationPermissionDialog />
    </div>
  );
}
