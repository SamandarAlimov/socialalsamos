import { Outlet, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { AppSidebar } from './AppSidebar';
import { BottomNavbar } from './BottomNavbar';
import { MobileHeader } from './MobileHeader';
import { Loader2 } from 'lucide-react';

export function AppLayout() {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();
  
  // Hide mobile header on messages page (it has its own header)
  const hideHeaderOnMessages = location.pathname === '/messages';

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="min-h-screen flex w-full bg-background">
      {/* Desktop Sidebar */}
      <AppSidebar />
      
      {/* Mobile Header - Hidden on messages page */}
      {!hideHeaderOnMessages && <MobileHeader />}
      
      {/* Main Content */}
      <main className={`flex-1 overflow-auto md:ml-0 ${hideHeaderOnMessages ? 'pt-0' : 'pt-14'} pb-20 md:pt-0 md:pb-0`}>
        <Outlet />
      </main>
      
      {/* Mobile Bottom Navigation */}
      <BottomNavbar />
    </div>
  );
}
