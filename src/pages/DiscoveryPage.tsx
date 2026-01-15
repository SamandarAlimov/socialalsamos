import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Compass, Flame, Users, Video, Sparkles } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useHapticFeedback } from '@/hooks/useHapticFeedback';
import { TrendingHashtags } from '@/components/discovery/TrendingHashtags';
import { PopularCreators } from '@/components/discovery/PopularCreators';
import { TrendingVideos } from '@/components/discovery/TrendingVideos';
import { ForYouSection } from '@/components/discovery/ForYouSection';
import { PullToRefresh } from '@/components/PullToRefresh';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';

export default function DiscoveryPage() {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const { triggerHaptic } = useHapticFeedback();
  const [activeTab, setActiveTab] = useState('foryou');

  const handleSearchFocus = () => {
    triggerHaptic('light');
    navigate('/search');
  };

  const handleTabChange = (value: string) => {
    triggerHaptic('light');
    setActiveTab(value);
  };

  const handleRefresh = useCallback(async () => {
    // Simulate refresh - in real app would refetch data
    await new Promise(resolve => setTimeout(resolve, 1000));
  }, []);

  const pageContent = (
    <div className="min-h-screen bg-background pb-24 md:pb-4">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-md border-b border-border">
        <div className="max-w-6xl mx-auto px-4 py-3">
          {/* Title and Search */}
          <div className="flex items-center gap-3 mb-3">
            <Compass className="h-6 w-6 text-primary" />
            <h1 className="text-xl font-bold flex-1">Discover</h1>
          </div>
          
          <div 
            className="relative cursor-pointer mb-3"
            onClick={handleSearchFocus}
          >
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search videos, users, hashtags..."
              className="pl-10 bg-muted/50 border-0 h-10"
              readOnly
            />
          </div>

          {/* Navigation Tabs */}
          <Tabs value={activeTab} onValueChange={handleTabChange}>
            <TabsList className="w-full h-auto p-1 bg-muted/50 grid grid-cols-4">
              <TabsTrigger 
                value="foryou" 
                className={cn(
                  "flex items-center gap-1.5 text-xs data-[state=active]:bg-background data-[state=active]:shadow-sm",
                  "py-2"
                )}
              >
                <Sparkles className="h-4 w-4" />
                <span className="hidden sm:inline">For You</span>
              </TabsTrigger>
              <TabsTrigger 
                value="trending" 
                className={cn(
                  "flex items-center gap-1.5 text-xs data-[state=active]:bg-background data-[state=active]:shadow-sm",
                  "py-2"
                )}
              >
                <Flame className="h-4 w-4" />
                <span className="hidden sm:inline">Trending</span>
              </TabsTrigger>
              <TabsTrigger 
                value="creators" 
                className={cn(
                  "flex items-center gap-1.5 text-xs data-[state=active]:bg-background data-[state=active]:shadow-sm",
                  "py-2"
                )}
              >
                <Users className="h-4 w-4" />
                <span className="hidden sm:inline">Creators</span>
              </TabsTrigger>
              <TabsTrigger 
                value="videos" 
                className={cn(
                  "flex items-center gap-1.5 text-xs data-[state=active]:bg-background data-[state=active]:shadow-sm",
                  "py-2"
                )}
              >
                <Video className="h-4 w-4" />
                <span className="hidden sm:inline">Videos</span>
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      {/* Content based on active tab */}
      <div className="max-w-6xl mx-auto px-4 py-4">
        {activeTab === 'foryou' && (
          <div className="space-y-6">
            <TrendingHashtags />
            <ForYouSection />
          </div>
        )}
        
        {activeTab === 'trending' && (
          <div className="space-y-6">
            <TrendingHashtags />
            <TrendingVideos />
          </div>
        )}
        
        {activeTab === 'creators' && (
          <PopularCreators />
        )}
        
        {activeTab === 'videos' && (
          <TrendingVideos />
        )}
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <PullToRefresh onRefresh={handleRefresh} className="h-full">
        {pageContent}
      </PullToRefresh>
    );
  }

  return pageContent;
}
