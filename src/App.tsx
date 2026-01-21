import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { GlobalCallProvider } from "@/contexts/GlobalCallContext";
import { AudioPlayerProvider } from "@/contexts/AudioPlayerContext";
import { ThemeProvider } from "next-themes";

// Pages
import AuthPage from "./pages/AuthPage";
import HomePage from "./pages/HomePage";
import MessagesPage from "./pages/MessagesPage";
import ProfilePage from "./pages/ProfilePage";
import UserProfilePage from "./pages/UserProfilePage";
import SettingsPage from "./pages/SettingsPage";
import PaymentSettingsPage from "./pages/PaymentSettingsPage";
import CreatePage from "./pages/CreatePage";
import MapPage from "./pages/MapPage";
import VideosPage from "./pages/VideosPage";
import DiscoveryPage from "./pages/DiscoveryPage";
import SearchPage from "./pages/SearchPage";
import MarketplacePage from "./pages/MarketplacePage";
import AdminPage from "./pages/AdminPage";
import NotificationsPage from "./pages/NotificationsPage";
import StoryArchivePage from "./pages/StoryArchivePage";
import AIPage from "./pages/AIPage";
import ActivityPage from "./pages/ActivityPage";
import NotFound from "./pages/NotFound";

// Layout
import { AppLayout } from "./components/layout/AppLayout";

const queryClient = new QueryClient();

// Protected route wrapper
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }
  
  return isAuthenticated ? <>{children}</> : <Navigate to="/" replace />;
}

// Auth route - redirects to home if already logged in
function AuthRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }
  
  return isAuthenticated ? <Navigate to="/home" replace /> : <>{children}</>;
}

// Placeholder pages
function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="text-center">
        <h1 className="text-2xl font-bold mb-2">{title}</h1>
        <p className="text-muted-foreground">Coming soon...</p>
      </div>
    </div>
  );
}

function AppRoutes() {
  return (
    <Routes>
      {/* Auth - First screen before login */}
      <Route path="/" element={
        <AuthRoute>
          <AuthPage />
        </AuthRoute>
      } />
      
      {/* Protected App Routes */}
      <Route element={<AppLayout />}>
        <Route path="/home" element={<HomePage />} />
        <Route path="/discover" element={<DiscoveryPage />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/videos" element={<VideosPage />} />
        <Route path="/messages" element={<MessagesPage />} />
        <Route path="/marketplace" element={<MarketplacePage />} />
        <Route path="/map" element={<MapPage />} />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="/create" element={<CreatePage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/user/:username" element={<UserProfilePage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/payment" element={<PaymentSettingsPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/story-archive" element={<StoryArchivePage />} />
        <Route path="/ai" element={<AIPage />} />
        <Route path="/activity" element={<ActivityPage />} />
      </Route>
      
      {/* 404 */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

// Wrapper component that provides GlobalCallProvider inside BrowserRouter
function AppWithGlobalCall() {
  const { isAuthenticated } = useAuth();
  
  return (
    <>
      <Toaster />
      <Sonner />
      {isAuthenticated ? (
        <GlobalCallProvider>
          <AppRoutes />
        </GlobalCallProvider>
      ) : (
        <AppRoutes />
      )}
    </>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <TooltipProvider>
        <AudioPlayerProvider>
          <AuthProvider>
            <BrowserRouter>
              <AppWithGlobalCall />
            </BrowserRouter>
          </AuthProvider>
        </AudioPlayerProvider>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
