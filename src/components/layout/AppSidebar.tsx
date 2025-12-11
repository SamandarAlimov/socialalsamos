import { NavLink, useLocation } from 'react-router-dom';
import { 
  Home, 
  Search, 
  Video, 
  MessageCircle, 
  ShoppingBag, 
  Map, 
  Bell, 
  PlusSquare, 
  User, 
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { AlsamosLogo } from '@/components/AlsamosLogo';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useState } from 'react';

interface NavItem {
  icon: React.ElementType;
  label: string;
  path: string;
  badge?: number;
}

const navItems: NavItem[] = [
  { icon: Home, label: 'Home', path: '/home' },
  { icon: Search, label: 'Search', path: '/search' },
  { icon: Video, label: 'Videos', path: '/videos' },
  { icon: MessageCircle, label: 'Messages', path: '/messages', badge: 3 },
  { icon: ShoppingBag, label: 'Marketplace', path: '/marketplace' },
  { icon: Map, label: 'Map', path: '/map' },
  { icon: Bell, label: 'Notifications', path: '/notifications', badge: 12 },
  { icon: PlusSquare, label: 'Create', path: '/create' },
];

const bottomItems: NavItem[] = [
  { icon: User, label: 'Profile', path: '/profile' },
  { icon: Settings, label: 'Settings', path: '/settings' },
];

export function AppSidebar() {
  const location = useLocation();
  const { user, logout } = useAuth();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside 
      className={cn(
        "h-screen sticky top-0 bg-sidebar border-r border-sidebar-border flex flex-col transition-all duration-300",
        collapsed ? "w-[72px]" : "w-64"
      )}
    >
      {/* Logo */}
      <div className="h-16 flex items-center px-4 border-b border-sidebar-border">
        <AlsamosLogo size="sm" showText={!collapsed} />
      </div>

      {/* Main Navigation */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto scrollbar-hidden">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 group relative",
                isActive 
                  ? "bg-primary text-primary-foreground shadow-md" 
                  : "text-sidebar-foreground hover:bg-sidebar-accent"
              )}
            >
              <item.icon className={cn(
                "h-5 w-5 flex-shrink-0 transition-transform duration-200",
                !isActive && "group-hover:scale-110"
              )} />
              {!collapsed && (
                <span className="font-medium text-sm">{item.label}</span>
              )}
              {item.badge && (
                <span className={cn(
                  "flex items-center justify-center min-w-[20px] h-5 text-xs font-semibold rounded-full px-1.5",
                  collapsed ? "absolute -top-1 -right-1" : "ml-auto",
                  isActive 
                    ? "bg-primary-foreground text-primary" 
                    : "bg-primary text-primary-foreground"
                )}>
                  {item.badge > 99 ? '99+' : item.badge}
                </span>
              )}
            </NavLink>
          );
        })}
      </nav>

      {/* Bottom Section */}
      <div className="p-3 border-t border-sidebar-border space-y-1">
        {bottomItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 group",
                isActive 
                  ? "bg-primary text-primary-foreground shadow-md" 
                  : "text-sidebar-foreground hover:bg-sidebar-accent"
              )}
            >
              <item.icon className="h-5 w-5 flex-shrink-0" />
              {!collapsed && <span className="font-medium text-sm">{item.label}</span>}
            </NavLink>
          );
        })}
        
        {/* Logout */}
        <button
          onClick={logout}
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 w-full text-destructive hover:bg-destructive/10"
        >
          <LogOut className="h-5 w-5 flex-shrink-0" />
          {!collapsed && <span className="font-medium text-sm">Logout</span>}
        </button>
      </div>

      {/* Collapse Toggle */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="absolute -right-3 top-20 bg-background border border-border rounded-full p-1.5 shadow-md hover:bg-accent transition-colors"
      >
        {collapsed ? (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronLeft className="h-4 w-4 text-muted-foreground" />
        )}
      </button>
    </aside>
  );
}
