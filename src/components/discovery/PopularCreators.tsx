import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { useHapticFeedback } from '@/hooks/useHapticFeedback';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { StoryAvatar } from '@/components/stories/StoryAvatar';

interface Creator {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  followers_count: number | null;
  is_verified: boolean | null;
  bio: string | null;
}

export function PopularCreators() {
  const navigate = useNavigate();
  const { triggerHaptic } = useHapticFeedback();
  const { user } = useAuth();
  const [creators, setCreators] = useState<Creator[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [followingMap, setFollowingMap] = useState<Record<string, boolean>>({});
  const [loadingFollow, setLoadingFollow] = useState<string | null>(null);

  useEffect(() => {
    async function fetchCreators() {
      setIsLoading(true);
      
      const { data: users } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url, followers_count, is_verified, bio')
        .neq('id', user?.id || '')
        .order('followers_count', { ascending: false })
        .limit(15);

      if (users) {
        setCreators(users);
        
        // Check follow status for each user
        if (user) {
          const { data: follows } = await supabase
            .from('follows')
            .select('following_id')
            .eq('follower_id', user.id)
            .in('following_id', users.map(u => u.id));
          
          const followMap: Record<string, boolean> = {};
          follows?.forEach(f => {
            followMap[f.following_id] = true;
          });
          setFollowingMap(followMap);
        }
      }
      
      setIsLoading(false);
    }

    fetchCreators();
  }, [user]);

  const handleFollow = async (creatorId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) {
      toast.error('Please login to follow users');
      return;
    }
    
    setLoadingFollow(creatorId);
    triggerHaptic('medium');
    
    try {
      if (followingMap[creatorId]) {
        await supabase
          .from('follows')
          .delete()
          .eq('follower_id', user.id)
          .eq('following_id', creatorId);
        
        setFollowingMap(prev => ({ ...prev, [creatorId]: false }));
        toast.success('Unfollowed');
      } else {
        await supabase
          .from('follows')
          .insert({ follower_id: user.id, following_id: creatorId });
        
        setFollowingMap(prev => ({ ...prev, [creatorId]: true }));
        toast.success('Following');
      }
    } catch (error) {
      toast.error('Failed to update follow status');
    }
    
    setLoadingFollow(null);
  };

  const formatCount = (count: number | null) => {
    if (!count) return '0';
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
    if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
    return count.toString();
  };

  if (isLoading) {
    return (
      <section>
        <div className="flex items-center gap-2 mb-4">
          <Users className="h-5 w-5 text-primary" />
          <h2 className="font-semibold text-lg">Popular Creators</h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex flex-col items-center gap-3 p-4 rounded-xl bg-card border border-border">
              <Skeleton className="w-16 h-16 rounded-full" />
              <Skeleton className="w-20 h-4" />
              <Skeleton className="w-24 h-8 rounded-full" />
            </div>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-primary" />
          <h2 className="font-semibold text-lg">Popular Creators</h2>
        </div>
        <Button variant="ghost" size="sm" onClick={() => navigate('/search')}>
          See all
        </Button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {creators.slice(0, 10).map((creator) => (
          <div
            key={creator.id}
            className="flex flex-col items-center gap-3 p-4 rounded-xl bg-card border border-border hover:border-primary/50 hover:shadow-lg transition-all cursor-pointer"
            onClick={() => {
              triggerHaptic('light');
              navigate(`/user/${creator.username || creator.id}`);
            }}
          >
            <StoryAvatar
              userId={creator.id}
              username={creator.username}
              displayName={creator.display_name}
              avatarUrl={creator.avatar_url}
              isVerified={!!creator.is_verified}
              size="lg"
              showRing
            />
            <div className="text-center">
              <p className="font-medium text-sm truncate max-w-[100px]">
                {creator.display_name || creator.username || 'User'}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatCount(creator.followers_count)} followers
              </p>
            </div>
            <Button
              variant={followingMap[creator.id] ? "outline" : "default"}
              size="sm"
              className="w-full"
              disabled={loadingFollow === creator.id}
              onClick={(e) => handleFollow(creator.id, e)}
            >
              {loadingFollow === creator.id ? (
                <span className="animate-spin">⏳</span>
              ) : followingMap[creator.id] ? (
                'Following'
              ) : (
                <>
                  <UserPlus className="h-3 w-3 mr-1" />
                  Follow
                </>
              )}
            </Button>
          </div>
        ))}
      </div>
    </section>
  );
}
