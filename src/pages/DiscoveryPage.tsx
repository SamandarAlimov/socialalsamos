import { useCallback, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Compass, Flame, Search, Sparkles, Users, Video } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PullToRefresh } from '@/components/PullToRefresh';
import { CategoryFilterBar } from '@/components/discovery/CategoryFilterBar';
import { ContactDiscoveryCard } from '@/components/discovery/ContactDiscoveryCard';
import { DiscoveryStoryBar } from '@/components/discovery/DiscoveryStoryBar';
import { ForYouSection } from '@/components/discovery/ForYouSection';
import { PopularCreators } from '@/components/discovery/PopularCreators';
import { TrendingHashtags } from '@/components/discovery/TrendingHashtags';
import { TrendingPublicPosts } from '@/components/discovery/TrendingPublicPosts';
import { TrendingVideos } from '@/components/discovery/TrendingVideos';
import { FeedAd } from '@/components/ads/FeedAd';
import { useActiveAds } from '@/hooks/useAds';
import { useHapticFeedback } from '@/hooks/useHapticFeedback';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';

// Bu sahifa Flutter reposidagi
// lib/features/discover/presentation/discover_page.dart bilan 1:1 mos:
// bir xil tab tartibi (For You / Trending / Creators / Videos) va bir xil
// bo'lim tartibi. Bittasini o'zgartirsangiz, ikkinchisini ham yangilang.
//
// DIZAYN ESLATMASI: bu sahifadagi tab bar (TabsList/TabsTrigger) butun
// platforma uchun segment/chip naqshining ANDOZASI hisoblanadi — neytral
// track + oq/qora aktiv qatlam, rangsiz. Yangi filtr/segment ro'yxati
// qursangiz src/lib/segmentedControl.ts dan foydalaning.

const DISCOVER_TABS = [
  { value: 'foryou', label: 'For You', icon: Sparkles },
  { value: 'trending', label: 'Trending', icon: Flame },
  { value: 'creators', label: 'Creators', icon: Users },
  { value: 'videos', label: 'Videos', icon: Video },
] as const;

type DiscoverTab = (typeof DISCOVER_TABS)[number]['value'];

function isDiscoverTab(value: string | null): value is DiscoverTab {
  return !!value && DISCOVER_TABS.some((tab) => tab.value === value);
}

export default function DiscoveryPage() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { triggerHaptic } = useHapticFeedback();
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    ads: discoverAds,
    trackImpression,
    trackClick,
    submitFeedback,
  } = useActiveAds('discover', 3);

  const tabFromUrl = searchParams.get('tab');
  const activeTab: DiscoverTab = isDiscoverTab(tabFromUrl) ? tabFromUrl : 'foryou';
  const [refreshKey, setRefreshKey] = useState(0);
  const sponsored = discoverAds[0] || null;

  const handleTabChange = useCallback(
    (value: string) => {
      if (!isDiscoverTab(value)) return;
      triggerHaptic('light');

      const next = new URLSearchParams(searchParams);
      if (value === 'foryou') {
        next.delete('tab');
      } else {
        next.set('tab', value);
      }
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams, triggerHaptic],
  );

  const handleRefresh = useCallback(async () => {
    setRefreshKey((key) => key + 1);
    await new Promise((resolve) => setTimeout(resolve, 600));
  }, []);

  const openSearch = useCallback(() => {
    triggerHaptic('light');
    navigate('/search');
  }, [navigate, triggerHaptic]);

  const sponsoredCard = sponsored ? (
    <FeedAd
      ad={sponsored}
      variant="discover"
      onImpression={(id) => trackImpression(id, 'discover')}
      onClick={(id) => trackClick(id, 'discover')}
      onFeedback={(id, feedback) => void submitFeedback(id, feedback, 'discover')}
    />
  ) : null;

  const renderTabContent = () => {
    switch (activeTab) {
      case 'trending':
        return (
          <div className="space-y-8">
            <TrendingHashtags refreshKey={refreshKey} />
            {sponsoredCard}
            <TrendingPublicPosts refreshKey={refreshKey} />
            <TrendingVideos refreshKey={refreshKey} />
          </div>
        );
      case 'creators':
        return (
          <div className="space-y-8">
            <PopularCreators refreshKey={refreshKey} />
            {sponsoredCard}
          </div>
        );
      case 'videos':
        return (
          <div className="space-y-8">
            <TrendingVideos refreshKey={refreshKey} />
            {sponsoredCard}
          </div>
        );
      case 'foryou':
      default:
        return (
          <div className="space-y-8">
            <DiscoveryStoryBar refreshKey={refreshKey} />
            <CategoryFilterBar refreshKey={refreshKey} />
            <TrendingHashtags refreshKey={refreshKey} />
            {sponsoredCard}
            <TrendingPublicPosts refreshKey={refreshKey} />
            <ForYouSection refreshKey={refreshKey} />
          </div>
        );
    }
  };

  const content = (
    <div className="mx-auto w-full max-w-6xl px-4 pb-24 pt-4 md:pb-10">
      <header className="mb-4 flex items-center gap-2">
        <Compass className="h-6 w-6 text-muted-foreground" />
        <h1 className="text-xl font-bold md:text-2xl">Discover</h1>
      </header>

      <button
        type="button"
        onClick={openSearch}
        className={cn(
          'mb-3 flex w-full items-center gap-2 rounded-full border bg-secondary/60 px-4 py-2.5 text-left',
          'text-sm text-muted-foreground transition-colors hover:bg-secondary',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        )}
        aria-label="Qidiruv sahifasini ochish"
      >
        <Search className="h-4 w-4 shrink-0" />
        Odamlar, postlar va hashtaglarni qidirish
      </button>

      <ContactDiscoveryCard />

      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <TabsList className="mb-6 grid w-full grid-cols-4">
          {DISCOVER_TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <TabsTrigger key={tab.value} value={tab.value} className="gap-1.5">
                <Icon className="h-4 w-4" />
                <span className="hidden sm:inline">{tab.label}</span>
              </TabsTrigger>
            );
          })}
        </TabsList>
      </Tabs>

      {renderTabContent()}
    </div>
  );

  return (
    <PullToRefresh onRefresh={handleRefresh} disabled={!isMobile} className="min-h-screen">
      {content}
    </PullToRefresh>
  );
}
