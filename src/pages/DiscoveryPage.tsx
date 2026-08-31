import { useCallback, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Compass, Flame, RefreshCw, Search, Sparkles, Users, Video } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PullToRefresh } from '@/components/PullToRefresh';
import { CategoryFilterBar } from '@/components/discovery/CategoryFilterBar';
import { DiscoveryStoryBar } from '@/components/discovery/DiscoveryStoryBar';
import { ForYouSection } from '@/components/discovery/ForYouSection';
import { PopularCreators } from '@/components/discovery/PopularCreators';
import { TrendingHashtags } from '@/components/discovery/TrendingHashtags';
import { TrendingPublicPosts } from '@/components/discovery/TrendingPublicPosts';
import { TrendingVideos } from '@/components/discovery/TrendingVideos';
import { useHapticFeedback } from '@/hooks/useHapticFeedback';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';

// Bu sahifa Flutter reposidagi
// lib/features/discover/presentation/discover_page.dart bilan 1:1 mos:
// bir xil tab tartibi (For You / Trending / Creators / Videos) va bir xil
// bo'lim tartibi. Bittasini o'zgartirsangiz, ikkinchisini ham yangilang.

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

  const tabFromUrl = searchParams.get('tab');
  const activeTab: DiscoverTab = isDiscoverTab(tabFromUrl) ? tabFromUrl : 'foryou';

  // Har bir refresh bo'limlarga uzatiladi va ular ma'lumotni qaytadan yuklaydi.
  const [refreshKey, setRefreshKey] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

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
    setIsRefreshing(true);
    setRefreshKey((key) => key + 1);
    // Bo'limlar o'z ma'lumotini mustaqil yuklaydi; indikatorni qisqa ushlab turamiz.
    await new Promise((resolve) => setTimeout(resolve, 600));
    setIsRefreshing(false);
  }, []);

  const openSearch = useCallback(() => {
    triggerHaptic('light');
    navigate('/search');
  }, [navigate, triggerHaptic]);

  const renderTabContent = () => {
    switch (activeTab) {
      case 'trending':
        return (
          <div className="space-y-8">
            <TrendingHashtags refreshKey={refreshKey} />
            <TrendingPublicPosts refreshKey={refreshKey} />
            <TrendingVideos refreshKey={refreshKey} />
          </div>
        );
      case 'creators':
        return <PopularCreators refreshKey={refreshKey} />;
      case 'videos':
        return <TrendingVideos refreshKey={refreshKey} />;
      case 'foryou':
      default:
        return (
          <div className="space-y-8">
            <DiscoveryStoryBar refreshKey={refreshKey} />
            <CategoryFilterBar refreshKey={refreshKey} />
            <TrendingHashtags refreshKey={refreshKey} />
            <TrendingPublicPosts refreshKey={refreshKey} />
            <ForYouSection refreshKey={refreshKey} />
          </div>
        );
    }
  };

  const content = (
    <div className="mx-auto w-full max-w-6xl px-4 pb-24 pt-4 md:pb-10">
      <header className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Compass className="h-6 w-6 text-primary" />
          <h1 className="text-xl font-bold md:text-2xl">Discover</h1>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="hidden md:inline-flex"
          aria-label="Discover sahifasini yangilash"
        >
          <RefreshCw className={cn('mr-2 h-4 w-4', isRefreshing && 'animate-spin')} />
          Yangilash
        </Button>
      </header>

      {/* Qidiruv: ilgari readOnly input bo'lgani uchun klaviatura bilan ishlamasdi. */}
      <button
        type="button"
        onClick={openSearch}
        className={cn(
          'mb-5 flex w-full items-center gap-2 rounded-full border bg-secondary/60 px-4 py-2.5 text-left',
          'text-sm text-muted-foreground transition-colors hover:bg-secondary',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        )}
        aria-label="Qidiruv sahifasini ochish"
      >
        <Search className="h-4 w-4 shrink-0" />
        Odamlar, postlar va hashtaglarni qidirish
      </button>

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
