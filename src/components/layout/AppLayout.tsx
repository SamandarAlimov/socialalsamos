import { useEffect, useState } from 'react';
import { Outlet, Navigate, useLocation } from 'react-router-dom';
import { AppSidebar } from './AppSidebar';
import { BottomNavbar } from './BottomNavbar';
import { MobileHeader } from './MobileHeader';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useActivityTracking } from '@/hooks/useActivityTracking';
import { LocationPermissionDialog } from '@/components/LocationPermissionDialog';
import { cn } from '@/lib/utils';
import { resumeMyLiveLocationSharing } from '@/lib/liveLocationSharing';
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
  // AI sahifasi ham to'liq ekranli: o'zining header va composer'i bor,
  // shuning uchun layout padding qo'shmaydi (aks holda tagida oq joy qoladi).
  const isAiPage = location.pathname === '/ai';

  const hideHeaderOnPages =
    location.pathname === '/messages' ||
    isMapPage ||
    location.pathname === '/videos' ||
    isCreatePage ||
    isAiPage ||
    location.pathname.startsWith('/marketplace/product/');

  const immersiveMobile = isCreatePage || isMapPage;
  // Balandligi ekranga qat'iy teng bo'lishi kerak bo'lgan sahifalar.
  const fullHeightPage = isCreatePage || isMapPage || isAiPage;

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center bg-background"><div className="flex flex-col items-center gap-4"><Loader2 className="h-10 w-10 animate-spin text-muted-foreground" /><p className="text-muted-foreground">Loading...</p></div></div>;
  }

  if (!isAuthenticated) return <Navigate to="/" replace />;

  return (
    <div
      className={cn(
        'flex w-full bg-background',
        fullHeightPage ? 'h-[100dvh] min-h-0 overflow-hidden' : 'min-h-screen',
      )}
    >
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

      {!hideHeaderOnPages && <MobileHeader />}

      <main className={cn(
        'flex-1 md:ml-0 md:pt-0 md:pb-0',
        fullHeightPage
          ? 'h-full min-h-0 overflow-hidden p-0'
          : 'alsamos-scrollbar overflow-auto',
        hideHeaderOnPages ? 'pt-0' : 'pt-14',
        immersiveMobile ? 'pb-0' : 'pb-20',
        // AI sahifasida mobil pastki navbar joyi kerak, desktopda esa umuman kerak emas.
        isAiPage && 'pb-16 md:pb-0'
      )}>
        <Outlet />
      </main>

      {!immersiveMobile && <BottomNavbar />}
      <LocationPermissionDialog />
    </div>
  );
}
