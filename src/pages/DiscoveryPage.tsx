import { useNavigate } from 'react-router-dom';
import { Search, Compass } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useHapticFeedback } from '@/hooks/useHapticFeedback';
import { TrendingHashtags } from '@/components/discovery/TrendingHashtags';
import { PopularCreators } from '@/components/discovery/PopularCreators';
import { TrendingVideos } from '@/components/discovery/TrendingVideos';
import { ForYouSection } from '@/components/discovery/ForYouSection';

export default function DiscoveryPage() {
  const navigate = useNavigate();
  const { triggerHaptic } = useHapticFeedback();

  const handleSearchFocus = () => {
    triggerHaptic('light');
    navigate('/search');
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-md border-b border-border">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3 mb-4">
            <Compass className="h-6 w-6 text-primary" />
            <h1 className="text-xl font-bold">Discover</h1>
          </div>
          <div 
            className="relative cursor-pointer"
            onClick={handleSearchFocus}
          >
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search videos, users, hashtags..."
              className="pl-10 bg-muted/50 border-0 h-11"
              readOnly
            />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-8">
        <TrendingHashtags />
        <PopularCreators />
        <TrendingVideos />
        <ForYouSection />
      </div>
    </div>
  );
}
