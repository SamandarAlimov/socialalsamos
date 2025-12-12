import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { 
  MessageCircle, 
  UserPlus, 
  UserMinus,
  BadgeCheck,
  Grid, 
  Video, 
  MapPin,
  Link as LinkIcon,
  Calendar,
  ArrowLeft
} from 'lucide-react';
import { toast } from 'sonner';
import { useConversations } from '@/hooks/useMessages';
import { Skeleton } from '@/components/ui/skeleton';

interface UserProfile {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  cover_url: string | null;
  bio: string | null;
  location: string | null;
  website: string | null;
  is_verified: boolean | null;
  followers_count: number | null;
  following_count: number | null;
  posts_count: number | null;
  created_at: string | null;
}

export default function UserProfilePage() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isFollowing, setIsFollowing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [followLoading, setFollowLoading] = useState(false);
  const [messageLoading, setMessageLoading] = useState(false);
  const { createPrivateConversation } = useConversations();

  const isOwnProfile = user?.id === userId;

  const fetchProfile = useCallback(async () => {
    if (!userId) return;
    setLoading(true);

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) throw error;
      setProfile(data);

      // Check if following
      if (user && !isOwnProfile) {
        const { data: followData } = await supabase
          .from('follows')
          .select('id')
          .eq('follower_id', user.id)
          .eq('following_id', userId)
          .single();
        
        setIsFollowing(!!followData);
      }
    } catch (error) {
      console.error('Error fetching profile:', error);
      toast.error('User not found');
      navigate('/home');
    } finally {
      setLoading(false);
    }
  }, [userId, user, isOwnProfile, navigate]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const handleFollow = async () => {
    if (!user || !userId) return;
    setFollowLoading(true);

    try {
      if (isFollowing) {
        await supabase
          .from('follows')
          .delete()
          .eq('follower_id', user.id)
          .eq('following_id', userId);
        setIsFollowing(false);
        toast.success(`Unfollowed ${profile?.display_name || profile?.username}`);
      } else {
        await supabase
          .from('follows')
          .insert({ follower_id: user.id, following_id: userId });
        setIsFollowing(true);
        toast.success(`Following ${profile?.display_name || profile?.username}`);
      }
    } catch (error) {
      console.error('Error toggling follow:', error);
      toast.error('Failed to update follow status');
    } finally {
      setFollowLoading(false);
    }
  };

  const handleMessage = async () => {
    if (!userId) return;
    setMessageLoading(true);

    try {
      const conversation = await createPrivateConversation(userId);
      if (conversation) {
        navigate(`/messages?conversation=${conversation.id}`);
      }
    } catch (error) {
      console.error('Error creating conversation:', error);
      toast.error('Failed to start conversation');
    } finally {
      setMessageLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto py-8 px-4">
        <Skeleton className="h-48 md:h-64 rounded-2xl mb-16" />
        <div className="relative -mt-24 px-4">
          <div className="flex flex-col md:flex-row md:items-end gap-4">
            <Skeleton className="h-32 w-32 rounded-full" />
            <div className="flex-1 pb-2 space-y-2">
              <Skeleton className="h-8 w-48" />
              <Skeleton className="h-4 w-32" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-muted-foreground">User not found</p>
      </div>
    );
  }

  const stats = [
    { label: 'Posts', value: profile.posts_count || 0 },
    { label: 'Followers', value: profile.followers_count || 0 },
    { label: 'Following', value: profile.following_count || 0 },
  ];

  const tabs = [
    { icon: Grid, label: 'Posts' },
    { icon: Video, label: 'Videos' },
  ];

  const joinedDate = profile.created_at 
    ? new Date(profile.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : null;

  return (
    <div className="max-w-4xl mx-auto py-8 px-4">
      {/* Back button */}
      <Button 
        variant="ghost" 
        size="sm" 
        onClick={() => navigate(-1)}
        className="mb-4"
      >
        <ArrowLeft className="h-4 w-4 mr-2" />
        Back
      </Button>

      {/* Cover Photo */}
      <div className="relative h-48 md:h-64 rounded-2xl bg-gradient-to-r from-primary/20 to-primary/40 mb-16 overflow-hidden">
        {profile.cover_url && (
          <img 
            src={profile.cover_url} 
            alt="Cover" 
            className="w-full h-full object-cover"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-background/50 to-transparent" />
      </div>

      {/* Profile Info */}
      <div className="relative -mt-24 px-4">
        <div className="flex flex-col md:flex-row md:items-end gap-4">
          <Avatar className="h-32 w-32 border-4 border-background shadow-lg">
            <AvatarImage src={profile.avatar_url || undefined} />
            <AvatarFallback className="text-4xl bg-primary text-primary-foreground">
              {(profile.display_name || profile.username || 'U')[0].toUpperCase()}
            </AvatarFallback>
          </Avatar>

          <div className="flex-1 pb-2">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl font-bold">
                    {profile.display_name || profile.username || 'User'}
                  </h1>
                  {profile.is_verified && (
                    <BadgeCheck className="h-6 w-6 text-primary" />
                  )}
                </div>
                <p className="text-muted-foreground">
                  @{profile.username || 'username'}
                </p>
              </div>
              
              {!isOwnProfile && (
                <div className="flex gap-2">
                  <Button
                    variant={isFollowing ? 'outline' : 'default'}
                    onClick={handleFollow}
                    disabled={followLoading}
                  >
                    {isFollowing ? (
                      <>
                        <UserMinus className="h-4 w-4 mr-2" />
                        Unfollow
                      </>
                    ) : (
                      <>
                        <UserPlus className="h-4 w-4 mr-2" />
                        Follow
                      </>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleMessage}
                    disabled={messageLoading}
                  >
                    <MessageCircle className="h-4 w-4 mr-2" />
                    Message
                  </Button>
                </div>
              )}

              {isOwnProfile && (
                <Button variant="hero" onClick={() => navigate('/profile')}>
                  Edit Profile
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Bio */}
        <div className="mt-6 max-w-2xl">
          {profile.bio && (
            <p className="text-foreground leading-relaxed">{profile.bio}</p>
          )}
          <div className="flex flex-wrap gap-4 mt-4 text-sm text-muted-foreground">
            {profile.location && (
              <span className="flex items-center gap-1">
                <MapPin className="h-4 w-4" />
                {profile.location}
              </span>
            )}
            {profile.website && (
              <span className="flex items-center gap-1">
                <LinkIcon className="h-4 w-4" />
                <a 
                  href={profile.website.startsWith('http') ? profile.website : `https://${profile.website}`} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  {profile.website}
                </a>
              </span>
            )}
            {joinedDate && (
              <span className="flex items-center gap-1">
                <Calendar className="h-4 w-4" />
                Joined {joinedDate}
              </span>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="flex gap-8 mt-6 py-4 border-y border-border">
          {stats.map((stat) => (
            <div key={stat.label} className="text-center">
              <span className="text-xl font-bold">{stat.value}</span>
              <span className="text-muted-foreground text-sm ml-1">{stat.label}</span>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex mt-6 border-b border-border">
          {tabs.map((tab, index) => (
            <button
              key={tab.label}
              className={`flex items-center gap-2 px-6 py-3 text-sm font-medium transition-colors ${
                index === 0 
                  ? 'text-primary border-b-2 border-primary' 
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Posts Grid Placeholder */}
        <div className="grid grid-cols-3 gap-1 mt-4">
          <div className="aspect-square bg-muted/50 rounded-lg flex items-center justify-center">
            <p className="text-muted-foreground text-sm">No posts yet</p>
          </div>
        </div>
      </div>
    </div>
  );
}
