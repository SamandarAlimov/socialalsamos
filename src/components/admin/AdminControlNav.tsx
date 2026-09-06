import { Database, LayoutDashboard, MapPinned, Users } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const items = [
  { href: '/admin', label: 'Boshqaruv', icon: LayoutDashboard },
  { href: '/admin/users', label: 'Users & Auth', icon: Users },
  { href: '/admin/regions', label: 'Hududlar', icon: MapPinned },
  { href: '/admin/system', label: 'System & Audit', icon: Database },
] as const;

export function AdminControlNav() {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <div className="overflow-x-auto pb-1">
      <div className="flex min-w-max gap-2 rounded-2xl border border-border/70 bg-card/80 p-2 shadow-sm backdrop-blur-xl">
        {items.map(({ href, label, icon: Icon }) => {
          const active = href === '/admin'
            ? location.pathname === '/admin'
            : location.pathname.startsWith(href);
          return (
            <Button
              key={href}
              type="button"
              variant={active ? 'secondary' : 'ghost'}
              onClick={() => navigate(href)}
              className={cn('h-9 rounded-xl gap-2', active && 'font-semibold')}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Button>
          );
        })}
      </div>
    </div>
  );
}
