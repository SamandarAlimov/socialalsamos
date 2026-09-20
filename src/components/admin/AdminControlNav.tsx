import {
  Bell,
  Gauge,
  KeyRound,
  LayoutDashboard,
  LayoutGrid,
  MapPinned,
  ServerCog,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { useAdminAccess } from '@/hooks/useAdminAccess';
import { cn } from '@/lib/utils';

const items = [
  { href: '/admin', label: 'Boshqaruv', icon: LayoutDashboard, permissions: [] },
  { href: '/admin/users', label: 'Users & Auth', icon: Users, permissions: ['admin.users.view', 'users.view'] },
  { href: '/admin/trust-safety', label: 'Trust & Safety', icon: ShieldCheck, permissions: ['admin.trust_safety.view', 'reports.view', 'reports.review'] },
  { href: '/admin/moderation', label: 'Moderatsiya', icon: LayoutGrid, permissions: [] },
  { href: '/admin/operations', label: 'Operations', icon: Gauge, permissions: ['admin.operations.view', 'admin.system.view'] },
  { href: '/admin/system', label: 'System', icon: ServerCog, permissions: ['admin.system.view', 'admin.operations.view', 'admin.audit.view', 'audit.view'] },
  { href: '/admin/access', label: 'Access', icon: KeyRound, permissions: ['admin.roles.view', 'admin.roles.manage'] },
  { href: '/admin/notifications', label: 'Inbox', icon: Bell, permissions: [] },
  { href: '/admin/regions', label: 'Hududlar', icon: MapPinned, permissions: ['admin.regions.view', 'analytics.view'] },
] as const;

export function AdminControlNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAdmin, hasPermission } = useAdminAccess();

  if (!isAdmin) return null;

  const visibleItems = items.filter(
    (item) => item.permissions.length === 0 || item.permissions.some((permission) => hasPermission(permission)),
  );

  return (
    <div className="max-w-full overflow-x-auto pb-1">
      <div className="flex min-w-max gap-1 rounded-2xl border border-border/70 bg-card/90 p-1.5 shadow-sm backdrop-blur-xl">
        {visibleItems.map(({ href, label, icon: Icon }) => {
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
