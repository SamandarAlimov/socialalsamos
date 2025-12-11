import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { 
  Heart, 
  MessageCircle, 
  Share2, 
  Bookmark, 
  MoreHorizontal,
  Plus,
  Play,
  Image as ImageIcon
} from 'lucide-react';

// Mock data for stories
const stories = [
  { id: 1, name: 'Your Story', avatar: null, isOwn: true },
  { id: 2, name: 'Sarah', avatar: 'https://i.pravatar.cc/150?img=1', hasNew: true },
  { id: 3, name: 'Alex', avatar: 'https://i.pravatar.cc/150?img=2', hasNew: true },
  { id: 4, name: 'Mike', avatar: 'https://i.pravatar.cc/150?img=3', hasNew: false },
  { id: 5, name: 'Emma', avatar: 'https://i.pravatar.cc/150?img=4', hasNew: true },
  { id: 6, name: 'John', avatar: 'https://i.pravatar.cc/150?img=5', hasNew: false },
];

// Mock data for posts
const posts = [
  {
    id: 1,
    author: {
      name: 'Sarah Johnson',
      username: '@sarahj',
      avatar: 'https://i.pravatar.cc/150?img=1',
      isVerified: true,
    },
    content: 'Just launched my new project on the Alsamos ecosystem! Check it out and let me know what you think. 🚀',
    image: 'https://images.unsplash.com/photo-1498050108023-c5249f4df085?w=800',
    likes: 234,
    comments: 45,
    shares: 12,
    time: '2h ago',
    isLiked: false,
    isBookmarked: false,
  },
  {
    id: 2,
    author: {
      name: 'Tech News',
      username: '@technews',
      avatar: 'https://i.pravatar.cc/150?img=10',
      isVerified: true,
    },
    content: 'The future of AI-powered social networks is here. Alsamos is revolutionizing how we connect and collaborate online.',
    image: 'https://images.unsplash.com/photo-1677442136019-21780ecad995?w=800',
    likes: 1523,
    comments: 234,
    shares: 89,
    time: '4h ago',
    isLiked: true,
    isBookmarked: true,
  },
  {
    id: 3,
    author: {
      name: 'Alex Chen',
      username: '@alexc',
      avatar: 'https://i.pravatar.cc/150?img=2',
      isVerified: false,
    },
    content: 'Beautiful sunset from my balcony today. Sometimes you just need to stop and appreciate the little things in life. ☀️',
    image: 'https://images.unsplash.com/photo-1495616811223-4d98c6e9c869?w=800',
    likes: 89,
    comments: 12,
    shares: 3,
    time: '6h ago',
    isLiked: false,
    isBookmarked: false,
  },
];

export default function HomePage() {
  const { user } = useAuth();
  const [feedPosts, setFeedPosts] = useState(posts);

  const toggleLike = (postId: number) => {
    setFeedPosts(prev => prev.map(post => 
      post.id === postId 
        ? { ...post, isLiked: !post.isLiked, likes: post.isLiked ? post.likes - 1 : post.likes + 1 }
        : post
    ));
  };

  const toggleBookmark = (postId: number) => {
    setFeedPosts(prev => prev.map(post => 
      post.id === postId 
        ? { ...post, isBookmarked: !post.isBookmarked }
        : post
    ));
  };

  return (
    <div className="max-w-2xl mx-auto py-6 px-4">
      {/* Stories Section */}
      <div className="mb-6">
        <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hidden">
          {stories.map((story) => (
            <button 
              key={story.id}
              className="flex flex-col items-center gap-2 flex-shrink-0"
            >
              <div className={`relative p-0.5 rounded-full ${story.hasNew ? 'bg-gradient-to-tr from-alsamos-orange-light to-alsamos-orange-dark' : story.isOwn ? '' : 'bg-muted'}`}>
                <div className="bg-background p-0.5 rounded-full">
                  <Avatar className="h-16 w-16">
                    {story.isOwn ? (
                      <div className="h-full w-full bg-muted flex items-center justify-center rounded-full">
                        <Plus className="h-6 w-6 text-muted-foreground" />
                      </div>
                    ) : (
                      <>
                        <AvatarImage src={story.avatar || ''} />
                        <AvatarFallback>{story.name[0]}</AvatarFallback>
                      </>
                    )}
                  </Avatar>
                </div>
                {story.isOwn && (
                  <div className="absolute bottom-0 right-0 bg-primary rounded-full p-1 border-2 border-background">
                    <Plus className="h-3 w-3 text-primary-foreground" />
                  </div>
                )}
              </div>
              <span className="text-xs text-muted-foreground truncate max-w-[64px]">
                {story.name}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Create Post */}
      <div className="bg-card rounded-2xl border border-border p-4 mb-6">
        <div className="flex gap-3">
          <Avatar className="h-10 w-10">
            <AvatarFallback className="bg-primary text-primary-foreground">
              {user?.name?.[0]?.toUpperCase() || 'U'}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <input
              type="text"
              placeholder="What's on your mind?"
              className="w-full bg-transparent text-foreground placeholder:text-muted-foreground focus:outline-none"
            />
          </div>
        </div>
        <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" className="text-muted-foreground">
              <ImageIcon className="h-4 w-4 mr-2" />
              Photo
            </Button>
            <Button variant="ghost" size="sm" className="text-muted-foreground">
              <Play className="h-4 w-4 mr-2" />
              Video
            </Button>
          </div>
          <Button variant="hero" size="sm">
            Post
          </Button>
        </div>
      </div>

      {/* Feed */}
      <div className="space-y-6">
        {feedPosts.map((post) => (
          <article 
            key={post.id} 
            className="bg-card rounded-2xl border border-border overflow-hidden animate-fade-in"
          >
            {/* Post Header */}
            <div className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <Avatar className="h-10 w-10">
                  <AvatarImage src={post.author.avatar} />
                  <AvatarFallback>{post.author.name[0]}</AvatarFallback>
                </Avatar>
                <div>
                  <div className="flex items-center gap-1">
                    <span className="font-semibold text-sm">{post.author.name}</span>
                    {post.author.isVerified && (
                      <svg className="h-4 w-4 text-primary" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                      </svg>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{post.author.username} · {post.time}</p>
                </div>
              </div>
              <Button variant="ghost" size="icon" className="text-muted-foreground">
                <MoreHorizontal className="h-5 w-5" />
              </Button>
            </div>

            {/* Post Content */}
            <div className="px-4 pb-3">
              <p className="text-sm leading-relaxed">{post.content}</p>
            </div>

            {/* Post Image */}
            {post.image && (
              <div className="relative">
                <img 
                  src={post.image} 
                  alt="Post content" 
                  className="w-full aspect-video object-cover"
                />
              </div>
            )}

            {/* Post Actions */}
            <div className="flex items-center justify-between p-4 border-t border-border">
              <div className="flex items-center gap-4">
                <button 
                  onClick={() => toggleLike(post.id)}
                  className={`flex items-center gap-2 transition-colors ${
                    post.isLiked ? 'text-red-500' : 'text-muted-foreground hover:text-red-500'
                  }`}
                >
                  <Heart className={`h-5 w-5 ${post.isLiked ? 'fill-current' : ''}`} />
                  <span className="text-sm">{post.likes}</span>
                </button>
                <button className="flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors">
                  <MessageCircle className="h-5 w-5" />
                  <span className="text-sm">{post.comments}</span>
                </button>
                <button className="flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors">
                  <Share2 className="h-5 w-5" />
                  <span className="text-sm">{post.shares}</span>
                </button>
              </div>
              <button 
                onClick={() => toggleBookmark(post.id)}
                className={`transition-colors ${
                  post.isBookmarked ? 'text-primary' : 'text-muted-foreground hover:text-primary'
                }`}
              >
                <Bookmark className={`h-5 w-5 ${post.isBookmarked ? 'fill-current' : ''}`} />
              </button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
