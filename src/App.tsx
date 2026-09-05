import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useParams, useSearchParams } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { GlobalCallProvider } from "@/contexts/GlobalCallContext";
import { OnlinePresenceProvider } from "@/contexts/OnlinePresenceContext";
import { AudioPlayerProvider } from "@/contexts/AudioPlayerContext";
import { VideoPlayerProvider } from "@/contexts/VideoPlayerContext";
import { ThemeProvider } from "next-themes";
import { PushNotificationProvider } from "@/components/PushNotificationProvider";
import { ChatWallpaperProvider } from "@/components/chat/ChatWallpaperProvider";
import { ChatAccentProvider } from "@/components/chat/ChatAccentProvider";

// Pages
import AuthPage from "./pages/AuthPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import PrivacyPage from "./pages/legal/PrivacyPage";
import TermsPage from "./pages/legal/TermsPage";
import HelpCenterPage from "./pages/legal/HelpCenterPage";
import HomePage from "./pages/HomePage";
import PostPermalinkPage from "./pages/PostPermalinkPage";
import MessagesPage from "./pages/MessagesPage";
import ProfilePage from "./pages/ProfilePage";
import UserProfilePage from "./pages/UserProfilePage";
import SettingsHubPage from "./pages/SettingsHubPage";
import PaymentSettingsPage from "./pages/PaymentSettingsPage";
import ComposePage from "./pages/ComposePage";
import CreateEntryPage from "./pages/CreateEntryPage";
import StickerPacksPage from "./pages/StickerPacksPage";
import StickerModerationPage from "./pages/StickerModerationPage";
import MapPage from "./pages/MapPage";
import VideosPage from "./pages/VideosPage";
import DiscoveryPage from "./pages/DiscoveryPage";
import SearchPage from "./pages/SearchPage";
import WebViewerPage from "./pages/WebViewerPage";
import MarketplacePage from "./pages/MarketplacePage";
import MarketplaceProductPage from "./pages/MarketplaceProductPage";
import MarketplaceChatHandoffPage from "./pages/MarketplaceChatHandoffPage";
import AdminConsolePage from "./pages/AdminConsolePage";
import AdminModerationHubPage from "./pages/AdminModerationHubPage";
import AdminAdsReviewPage from "./pages/AdminAdsReviewPage";
import AdminAdsIntegrityPage from "./pages/AdminAdsIntegrityPage";
import AdminFeedbackPage from "./pages/AdminFeedbackPage";
import FeedbackPage from "./pages/FeedbackPage";
import NotificationsPage from "./pages/NotificationsPage";
import StoryArchivePage from "./pages/StoryArchivePage";
import AIPage from "./pages/AIPage";
import ProjectsPage from "./pages/ProjectsPage";
import OAuthConsent from "./pages/OAuthConsent";
import ActivityPage from "./pages/ActivityPage";
import AdsPage from "./pages/AdsPage";
import ChannelsPage from "./pages/ChannelsPage";
import MiniAppsPage from "./pages/MiniAppsPage";
import MiniAppSubmitPage from "./pages/MiniAppSubmitPage";
import MiniAppsModerationPage from "./pages/MiniAppsModerationPage";
import PublisherOnboardingPage from "./pages/PublisherOnboardingPage";
import JoinInvitePage from "./pages/JoinInvitePage";
import NotFound from "./pages/NotFound";

// Layout
import { AppLayout } from "./components/layout/AppLayout";
import { RouteSEO } from "./components/RouteSEO";

const queryClient = new QueryClient();

function FullscreenSpinner() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-muted-foreground" />
    </div>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) return <FullscreenSpinner />;

  return isAuthenticated ? <>{children}</> : <Navigate to="/" replace />;
}

function AuthRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const [searchParams] = useSearchParams();

  if (isLoading) return <FullscreenSpinner />;

  if (isAuthenticated) {
    const next = searchParams.get('next');
    const safeNext = next && next.startsWith('/') && !next.startsWith('//') ? next : '/home';
    return <Navigate to={safeNext} replace />;
  }
  return <>{children}</>;
}

/**
 * Older profile cards shared posts as `/user/:username?post=<id>`.
 * Resolve those already-circulating links to the canonical `/post/:id` route.
 */
function UserProfileRoute() {
  const [searchParams] = useSearchParams();
  const postId = searchParams.get('post');
  if (postId) return <Navigate to={'/post/' + encodeURIComponent(postId)} replace />;
  return <UserProfilePage />;
}

function ChannelPermalink() {
  const { channel } = useParams<{ channel: string }>();
  return <Navigate to={channel ? '/channels?channel=' + encodeURIComponent(channel) : '/channels'} replace />;
}

function GroupPermalink() {
  const { group } = useParams<{ group: string }>();
  return <Navigate to={group ? '/messages?conversation=' + encodeURIComponent(group) : '/messages'} replace />;
}

function HashtagPermalink() {
  const { tag } = useParams<{ tag: string }>();
  const clean = (tag || '').replace(/^#/, '');
  return <Navigate to={clean ? '/search?q=%23' + encodeURIComponent(clean) + '&tab=hashtags' : '/search?tab=hashtags'} replace />;
}

function AppRoutes() {
  return (
    <>
      <RouteSEO />
      <Routes>
      <Route path="/" element={
        <AuthRoute>
          <AuthPage />
        </AuthRoute>
      } />

      <Route path="/terms" element={<Navigate to="/legal/terms" replace />} />
      <Route path="/terms-of-service" element={<Navigate to="/legal/terms" replace />} />
      <Route path="/privacy" element={<Navigate to="/legal/privacy" replace />} />
      <Route path="/privacy-policy" element={<Navigate to="/legal/privacy" replace />} />
      <Route path="/help-center" element={<Navigate to="/help" replace />} />
      <Route path="/auth" element={<Navigate to="/" replace />} />

      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />

      <Route path="/legal/privacy" element={<PrivacyPage />} />
      <Route path="/legal/terms" element={<TermsPage />} />
      <Route path="/help" element={<HelpCenterPage />} />

      <Route path="/.lovable/oauth/consent" element={<OAuthConsent />} />

      <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
        <Route path="/home" element={<HomePage />} />
        <Route path="/post/:postId" element={<PostPermalinkPage />} />
        <Route path="/channel/:channel" element={<ChannelPermalink />} />
        <Route path="/group/:group" element={<GroupPermalink />} />
        <Route path="/hashtag/:tag" element={<HashtagPermalink />} />
        <Route path="/discover" element={<DiscoveryPage />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/web" element={<WebViewerPage />} />
        <Route path="/videos" element={<VideosPage />} />
        <Route path="/messages" element={<MessagesPage />} />
        <Route path="/join/:slug" element={<JoinInvitePage />} />
        <Route path="/marketplace" element={<MarketplacePage />} />
        <Route path="/marketplace/chat" element={<MarketplaceChatHandoffPage />} />
        <Route path="/marketplace/product/:productId" element={<MarketplaceProductPage />} />
        <Route path="/map" element={<MapPage />} />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="/create" element={<CreateEntryPage />} />
        <Route path="/compose" element={<Navigate to="/create" replace />} />
        <Route path="/stickers" element={<StickerPacksPage />} />
        <Route path="/stickers/moderation" element={<StickerModerationPage />} />
        <Route path="/stickers/:slug" element={<StickerPacksPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/user/:username" element={<UserProfileRoute />} />
        <Route path="/settings" element={<SettingsHubPage />} />
        <Route path="/settings/payment" element={<Navigate to="/payment" replace />} />
        <Route path="/settings/:section" element={<SettingsHubPage />} />
        <Route path="/payment" element={<PaymentSettingsPage />} />
        <Route path="/feedback" element={<FeedbackPage />} />
        <Route path="/admin" element={<AdminConsolePage />} />
        <Route path="/admin/moderation" element={<AdminModerationHubPage />} />
        <Route path="/admin/feedback" element={<AdminFeedbackPage />} />
        <Route path="/admin/ads-review" element={<AdminAdsReviewPage />} />
        <Route path="/admin/ads-integrity" element={<AdminAdsIntegrityPage />} />
        <Route path="/admin/:section" element={<AdminConsolePage />} />
        <Route path="/story-archive" element={<StoryArchivePage />} />
        <Route path="/projects" element={<ProjectsPage />} />
        <Route path="/ai" element={<AIPage />} />
        <Route path="/activity" element={<ActivityPage />} />
        <Route path="/ads" element={<AdsPage />} />
        <Route path="/ads/:section" element={<AdsPage />} />
        <Route path="/channels" element={<ChannelsPage />} />
        <Route path="/mini-apps/moderation" element={<MiniAppsModerationPage />} />
        <Route path="/mini-apps/publisher" element={<PublisherOnboardingPage />} />
        <Route path="/mini-apps/new" element={<MiniAppSubmitPage />} />
        <Route path="/mini-apps/:appId/edit" element={<MiniAppSubmitPage />} />
        <Route path="/mini-apps" element={<MiniAppsPage />} />
      </Route>

      <Route path="*" element={<NotFound />} />
      </Routes>
    </>
  );
}

function AppWithGlobalCall() {
  const { isAuthenticated } = useAuth();

  return (
    <>
      <Toaster />
      <Sonner />
      {isAuthenticated ? (
        <PushNotificationProvider>
          <OnlinePresenceProvider>
            <GlobalCallProvider>
              <ChatAccentProvider />
              <ChatWallpaperProvider />
              <AppRoutes />
            </GlobalCallProvider>
          </OnlinePresenceProvider>
        </PushNotificationProvider>
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
          <VideoPlayerProvider>
            <AuthProvider>
              <BrowserRouter>
                <AppWithGlobalCall />
              </BrowserRouter>
            </AuthProvider>
          </VideoPlayerProvider>
        </AudioPlayerProvider>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;