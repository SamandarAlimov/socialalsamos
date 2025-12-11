import { useAuth } from '@/contexts/AuthContext';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { 
  Settings, 
  Edit3, 
  Grid, 
  Video, 
  Bookmark, 
  ShoppingBag,
  Link as LinkIcon,
  MapPin,
  Calendar,
  Users
} from 'lucide-react';

export default function ProfilePage() {
  const { user } = useAuth();

  const stats = [
    { label: 'Posts', value: '248' },
    { label: 'Followers', value: '12.5K' },
    { label: 'Following', value: '892' },
  ];

  const tabs = [
    { icon: Grid, label: 'Posts' },
    { icon: Video, label: 'Videos' },
    { icon: Bookmark, label: 'Saved' },
    { icon: ShoppingBag, label: 'Shop' },
  ];

  return (
    <div className="max-w-4xl mx-auto py-8 px-4">
      {/* Cover Photo */}
      <div className="relative h-48 md:h-64 rounded-2xl bg-gradient-to-r from-alsamos-orange-light to-alsamos-orange-dark mb-16 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-t from-background/50 to-transparent" />
      </div>

      {/* Profile Info */}
      <div className="relative -mt-24 px-4">
        <div className="flex flex-col md:flex-row md:items-end gap-4">
          <Avatar className="h-32 w-32 border-4 border-background shadow-lg">
            <AvatarImage src="" />
            <AvatarFallback className="text-4xl bg-primary text-primary-foreground">
              {user?.name?.[0]?.toUpperCase() || 'U'}
            </AvatarFallback>
          </Avatar>

          <div className="flex-1 pb-2">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold">{user?.name || 'User'}</h1>
                <p className="text-muted-foreground">@{user?.email?.split('@')[0] || 'username'}</p>
              </div>
              <div className="flex gap-2">
                <Button variant="hero">
                  <Edit3 className="h-4 w-4 mr-2" />
                  Edit Profile
                </Button>
                <Button variant="outline" size="icon">
                  <Settings className="h-5 w-5" />
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Bio */}
        <div className="mt-6 max-w-2xl">
          <p className="text-foreground leading-relaxed">
            Digital creator & tech enthusiast. Building the future with Alsamos. 
            Love connecting with like-minded people around the world. ✨
          </p>
          <div className="flex flex-wrap gap-4 mt-4 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <MapPin className="h-4 w-4" />
              San Francisco, CA
            </span>
            <span className="flex items-center gap-1">
              <LinkIcon className="h-4 w-4" />
              <a href="#" className="text-primary hover:underline">alsamos.com/user</a>
            </span>
            <span className="flex items-center gap-1">
              <Calendar className="h-4 w-4" />
              Joined March 2024
            </span>
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

        {/* Posts Grid */}
        <div className="grid grid-cols-3 gap-1 mt-4">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => (
            <div 
              key={i} 
              className="aspect-square bg-muted rounded-lg overflow-hidden hover:opacity-90 transition-opacity cursor-pointer"
            >
              <img 
                src={`https://images.unsplash.com/photo-${1500000000000 + i * 10000000}?w=400&h=400&fit=crop`}
                alt=""
                className="w-full h-full object-cover"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
