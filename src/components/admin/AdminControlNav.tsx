import { Gauge, LayoutDashboard, MapPinned, ShieldCheck, Users } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const items = [
  { href: '/admin', label: 'Boshqaruv', icon: LayoutDashboard },
  { href: '/admin/users', label: 'Users & Auth', icon: Users },
  { href: '/admin/regions', label: 'Hududlar', icon: MapPinned },
  { href: '/admin/operations', label: 'Operations', icon: Gauge },
  { href: '/admin/moderation', label: 'Moderatsiya', icon: ShieldCheck },
] as const;

export function AdminControlNav() {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <div className="max-w-full overflow-x-auto pb-1">
      <div className="flex min-w-max gap-1 rounded-2xl border border-border/70 bg-card/90 p-1.5 shadow-sm backdrop-blur-xl">
        {items.map(({ href, label, icon: Icon }) => {
          const active = href === '/admin'
            ? location.pathname === '/admin'
            : location.pathname.startsWith(href);
          return (
            <Button
              key={href}
              type="button"
              variant="ghost"
              onClick={() => navigate(href)}
              className={cn(
                'h-9 gap-2 rounded-xl px-3 text-muted-foreground',
                active && 'bg-foreground text-background shadow-sm hover:bg-foreground hover:text-background',
              )}
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
