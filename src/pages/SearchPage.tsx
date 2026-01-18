import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Search, X, User, Video, Hash } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { useHapticFeedback } from '@/hooks/useHapticFeedback';
import { useDebounce } from '@/hooks/useDebounce';
import { StoryAvatar } from '@/components/stories/StoryAvatar';
import { PullToRefresh } from '@/components/PullToRefresh';
import { useIsMobile } from '@/hooks/use-mobile';

interface SearchUser {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  followers_count: number | null;
  is_verified: boolean | null;
}

interface SearchVideo {
  id: string;
  content: string | null;
  media_urls: string[];
  likes_count: number;
  profile?: {
    username: string | null;
    avatar_url: string | null;
  };
}

const recentSearches = ['dance', 'cooking', 'travel vlog', 'music'];

export default function SearchPage() {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { triggerHaptic } = useHapticFeedback();
  
  const [query, setQuery] = useState(searchParams.get('q') || '');
  const debouncedQuery = useDebounce(query, 300);
  const [activeTab, setActiveTab] = useState('all');
  const [users, setUsers] = useState<SearchUser[]>([]);
  const [videos, setVideos] = useState<SearchVideo[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const handleRefresh = useCallback(async () => {
    // Trigger re-search
    if (debouncedQuery.trim()) {
      setIsLoading(true);
      const searchTerm = debouncedQuery.replace('#', '');
      const [usersRes, videosRes] = await Promise.all([
        supabase
          .from('profiles')
          .select('id, username, display_name, avatar_url, bio, followers_count, is_verified')
          .or(`username.ilike.%${searchTerm}%,display_name.ilike.%${searchTerm}%`)
          .limit(20),
        supabase
          .from('posts')
          .select(`
            id, content, media_urls, likes_count,
            profile:profiles!posts_user_id_fkey (username, avatar_url)
          `)
          .eq('media_type', 'video')
          .eq('visibility', 'public')
          .ilike('content', `%${searchTerm}%`)
          .limit(20)
      ]);
      if (usersRes.data) setUsers(usersRes.data);
      if (videosRes.data) setVideos(videosRes.data as SearchVideo[]);
      setIsLoading(false);
    }
  }, [debouncedQuery]);

  useEffect(() => {
    if (!debouncedQuery.trim()) {
      setUsers([]);
      setVideos([]);
      return;
    }

    async function search() {
      setIsLoading(true);
      const searchTerm = debouncedQuery.replace('#', '');

      const [usersRes, videosRes] = await Promise.all([
        supabase
          .from('profiles')
          .select('id, username, display_name, avatar_url, bio, followers_count, is_verified')
          .or(`username.ilike.%${searchTerm}%,display_name.ilike.%${searchTerm}%`)
          .limit(20),
        supabase
          .from('posts')
          .select(`
            id, content, media_urls, likes_count,
            profile:profiles!posts_user_id_fkey (username, avatar_url)
          `)
          .eq('media_type', 'video')
          .eq('visibility', 'public')
          .ilike('content', `%${searchTerm}%`)
          .limit(20)
      ]);

      if (usersRes.data) setUsers(usersRes.data);
      if (videosRes.data) setVideos(videosRes.data as SearchVideo[]);
      setIsLoading(false);
    }

    search();
  }, [debouncedQuery]);

  const clearSearch = () => {
    triggerHaptic('light');
    setQuery('');
  };

  const pageContent = (
    <div className="min-h-screen bg-background pb-24 md:pb-4">
      {/* Search Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-md border-b border-border p-4">
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search..."
              className="pl-10 pr-10 bg-muted/50 border-0"
              autoFocus
            />
            {query && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                onClick={clearSearch}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      {!query.trim() ? (
        <div className="p-4">
          <h3 className="text-sm font-medium text-muted-foreground mb-3">Recent Searches</h3>
          <div className="flex flex-wrap gap-2">
            {recentSearches.map((term) => (
              <Badge
                key={term}
                variant="secondary"
                className="cursor-pointer py-2 px-3"
                onClick={() => {
                  triggerHaptic('light');
                  setQuery(term);
                }}
              >
                {term}
              </Badge>
            ))}
          </div>
        </div>
      ) : (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="w-full justify-start px-4 bg-transparent border-b border-border rounded-none h-12">
            <TabsTrigger value="all" className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none">
              All
            </TabsTrigger>
            <TabsTrigger value="users" className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none">
              <User className="h-4 w-4 mr-1" />
              Users
            </TabsTrigger>
            <TabsTrigger value="videos" className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none">
              <Video className="h-4 w-4 mr-1" />
              Videos
            </TabsTrigger>
            <TabsTrigger value="hashtags" className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none">
              <Hash className="h-4 w-4 mr-1" />
              Tags
            </TabsTrigger>
          </TabsList>

          <TabsContent value="all" className="mt-0 p-4 space-y-6">
            {isLoading ? (
              <SearchSkeleton />
            ) : (
              <>
                {users.length > 0 && (
                  <section>
                    <h3 className="text-sm font-medium text-muted-foreground mb-3">Users</h3>
                    <div className="space-y-3">
                      {users.slice(0, 3).map((user) => (
                        <UserCard key={user.id} user={user} onClick={() => navigate(`/user/${user.username || user.id}`)} />
                      ))}
                    </div>
                  </section>
                )}
                {videos.length > 0 && (
                  <section>
                    <h3 className="text-sm font-medium text-muted-foreground mb-3">Videos</h3>
                    <div className="grid grid-cols-3 gap-1">
                      {videos.slice(0, 6).map((video) => (
                        <VideoCard key={video.id} video={video} onClick={() => navigate('/videos')} />
                      ))}
                    </div>
                  </section>
                )}
                {users.length === 0 && videos.length === 0 && (
                  <div className="text-center py-12 text-muted-foreground">
                    No results found for "{query}"
                  </div>
                )}
              </>
            )}
          </TabsContent>

          <TabsContent value="users" className="mt-0 p-4">
            {isLoading ? (
              <SearchSkeleton type="users" />
            ) : users.length > 0 ? (
              <div className="space-y-3">
                {users.map((user) => (
                  <UserCard key={user.id} user={user} onClick={() => navigate(`/user/${user.username || user.id}`)} />
                ))}
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">No users found</div>
            )}
          </TabsContent>

          <TabsContent value="videos" className="mt-0 p-4">
            {isLoading ? (
              <SearchSkeleton type="videos" />
            ) : videos.length > 0 ? (
              <div className="grid grid-cols-3 gap-1">
                {videos.map((video) => (
                  <VideoCard key={video.id} video={video} onClick={() => navigate('/videos')} />
                ))}
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">No videos found</div>
            )}
          </TabsContent>

          <TabsContent value="hashtags" className="mt-0 p-4">
            <div className="text-center py-12 text-muted-foreground">
              Hashtag search coming soon
            </div>
          </TabsContent>
        </Tabs>
      )}
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

function UserCard({ user, onClick }: { user: SearchUser; onClick: () => void }) {
  const { triggerHaptic } = useHapticFeedback();
  
  return (
    <div
      className="flex items-center gap-3 p-3 rounded-xl bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors"
      onClick={() => {
        triggerHaptic('light');
        onClick();
      }}
    >
      <StoryAvatar
        userId={user.id}
        username={user.username}
        displayName={user.display_name}
        avatarUrl={user.avatar_url}
        isVerified={!!user.is_verified}
        size="lg"
        showRing
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1">
          <span className="font-medium truncate">{user.display_name || user.username}</span>
          {user.is_verified && (
            <Badge variant="secondary" className="h-4 px-1 text-[10px]">✓</Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground truncate">@{user.username}</p>
      </div>
      <span className="text-sm text-muted-foreground">
        {user.followers_count || 0} followers
      </span>
    </div>
  );
}

function VideoCard({ video, onClick }: { video: SearchVideo; onClick: () => void }) {
  const { triggerHaptic } = useHapticFeedback();
  
  return (
    <div
      className="relative aspect-[9/16] bg-muted rounded-lg overflow-hidden cursor-pointer"
      onClick={() => {
        triggerHaptic('medium');
        onClick();
      }}
    >
      <video
        src={video.media_urls[0]}
        className="w-full h-full object-cover"
        muted
        playsInline
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
      <div className="absolute bottom-2 left-2 text-white text-xs">
        ❤️ {video.likes_count || 0}
      </div>
    </div>
  );
}

function SearchSkeleton({ type = 'all' }: { type?: 'all' | 'users' | 'videos' }) {
  if (type === 'users') {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 p-3">
            <Skeleton className="w-12 h-12 rounded-full" />
            <div className="flex-1">
              <Skeleton className="h-4 w-32 mb-1" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (type === 'videos') {
    return (
      <div className="grid grid-cols-3 gap-1">
        {Array.from({ length: 9 }).map((_, i) => (
          <Skeleton key={i} className="aspect-[9/16] rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <>
      <div className="space-y-3">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 p-3">
            <Skeleton className="w-12 h-12 rounded-full" />
            <div className="flex-1">
              <Skeleton className="h-4 w-32 mb-1" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-1 mt-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="aspect-[9/16] rounded-lg" />
        ))}
      </div>
    </>
  );
}
