import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  Bell,
  BellRing,
  CheckCheck,
  ChevronRight,
  Info,
  Loader2,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react';
import { toast } from 'sonner';

import { AdminControlNav } from '@/components/admin/AdminControlNav';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAdminAccess } from '@/hooks/useAdminAccess';
import {
  fetchAdminNotifications,
  markAdminNotificationRead,
  markAllAdminNotificationsRead,
  type AdminNotification,
} from '@/hooks/useAdminControlPlane';
import { cn } from '@/lib/utils';

function dt(value?: string | null) {
  if (!value) return '—';
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function severityIcon(severity: AdminNotification['severity']) {
  if (severity === 'critical') return ShieldAlert;
  if (severity === 'high') return AlertTriangle;
  if (severity === 'warning') return BellRing;
  return Info;
}

function severityBadge(severity: AdminNotification['severity']) {
  if (severity === 'critical') return <Badge variant="destructive">Critical</Badge>;
  if (severity === 'high') {
    return <Badge variant="outline" className="border-amber-500/40 text-amber-700 dark:text-amber-400">High</Badge>;
  }
  if (severity === 'warning') return <Badge variant="secondary">Warning</Badge>;
  return <Badge variant="outline">Info</Badge>;
}

export default function AdminNotificationCenterPage() {
  const navigate = useNavigate();
  const { isAdmin, isLoading: accessLoading, hasPermission } = useAdminAccess();
  const canView = hasPermission('admin.notifications.view') || isAdmin;
  const [items, setItems] = useState<AdminNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'unread' | 'critical'>('all');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isAdmin || !canView) return;
    setLoading(true);
    setError(null);
    try {
      setItems(await fetchAdminNotifications(200));
    } catch (caught: any) {
      setError(caught?.message || 'Admin bildirishnomalarini yuklab bo‘lmadi');
    } finally {
      setLoading(false);
    }
  }, [canView, isAdmin]);

  useEffect(() => {
    void load();
  }, [load]);

  const unread = useMemo(() => items.filter((item) => !item.is_read).length, [items]);
  const critical = useMemo(
    () => items.filter((item) => ['critical', 'high'].includes(item.severity)).length,
    [items],
  );
  const visible = useMemo(() => {
    if (filter === 'unread') return items.filter((item) => !item.is_read);
    if (filter === 'critical') return items.filter((item) => ['critical', 'high'].includes(item.severity));
    return items;
  }, [filter, items]);

  if (accessLoading) {
    return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin" /></div>;
  }
  if (!isAdmin || !canView) return <Navigate to="/admin" replace />;

  const toggleRead = async (item: AdminNotification) => {
    setBusyId(item.id);
    try {
      await markAdminNotificationRead(item.id, !item.is_read);
      setItems((current) =>
        current.map((entry) => entry.id === item.id ? { ...entry, is_read: !entry.is_read } : entry),
      );
    } catch (caught: any) {
      toast.error(caught?.message || 'Read state yangilanmadi');
    } finally {
      setBusyId(null);
    }
  };

  const markAll = async () => {
    setBusyId('all');
    try {
      const count = await markAllAdminNotificationsRead();
      setItems((current) => current.map((item) => ({ ...item, is_read: true })));
      toast.success(String(count) + ' ta notification read holatiga o‘tdi');
    } catch (caught: any) {
      toast.error(caught?.message || 'Notificationlar yangilanmadi');
    } finally {
      setBusyId(null);
    }
  };

  const openAction = async (item: AdminNotification) => {
    if (!item.is_read) {
      try {
        await markAdminNotificationRead(item.id, true);
        setItems((current) =>
          current.map((entry) => entry.id === item.id ? { ...entry, is_read: true } : entry),
        );
      } catch {
        // Navigation remains available even if read-state persistence fails.
      }
    }
    if (item.action_url?.startsWith('/')) navigate(item.action_url);
  };

  return (
    <div className="mx-auto w-full max-w-[1420px] space-y-5 p-3 pb-12 md:p-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="flex items-center gap-3">
          <div className="relative flex h-12 w-12 items-center justify-center rounded-2xl border bg-card shadow-sm">
            <Bell className="h-5 w-5" />
            {unread > 0 && <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-destructive" />}
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Admin Inbox</h1>
              {unread > 0 && <Badge>{unread} unread</Badge>}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Trust & Safety, security va operations alertlari uchun permission-aware inbox.
            </p>
          </div>
        </div>
        <AdminControlNav />
      </div>

      {error && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="flex items-center gap-3 p-4 text-sm">
            <AlertTriangle className="h-5 w-5 shrink-0 text-destructive" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold">Admin inbox yuklanmadi</p>
              <p className="truncate text-muted-foreground">{error}</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => void load()}>Qayta urinish</Button>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          ['Jami', items.length, 'all' as const],
          ['Unread', unread, 'unread' as const],
          ['High priority', critical, 'critical' as const],
        ].map(([label, value, key]) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={cn(
              'rounded-2xl border bg-card p-4 text-left shadow-sm transition hover:bg-muted/20',
              filter === key && 'border-foreground/30 ring-1 ring-foreground/10',
            )}
          >
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums">{Number(value).toLocaleString()}</p>
          </button>
        ))}
      </div>

      <Card className="overflow-hidden shadow-sm">
        <CardHeader className="border-b bg-muted/10">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-base">Control-plane notifications</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Role-targeted alertlar har bir operator uchun individual read state saqlaydi.
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={loading} onClick={() => void load()}>
                <RefreshCw className={cn('mr-2 h-4 w-4', loading && 'animate-spin')} />Yangilash
              </Button>
              <Button variant="outline" size="sm" disabled={!unread || busyId === 'all'} onClick={() => void markAll()}>
                {busyId === 'all' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCheck className="mr-2 h-4 w-4" />}
                All read
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex min-h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : visible.length === 0 ? (
            <div className="flex min-h-64 flex-col items-center justify-center p-8 text-center">
              <CheckCheck className="mb-3 h-8 w-8 text-emerald-600" />
              <p className="font-semibold">Bu filtrda notification yo‘q</p>
              <p className="mt-1 text-sm text-muted-foreground">Yangi operational alert paydo bo‘lsa shu yerda ko‘rinadi.</p>
            </div>
          ) : (
            <div className="divide-y">
              {visible.map((item) => {
                const Icon = severityIcon(item.severity);
                const actionable = Boolean(item.action_url?.startsWith('/'));
                return (
                  <div key={item.id} className={cn('p-4 transition', !item.is_read && 'bg-muted/15')}>
                    <div className="flex items-start gap-3">
                      <div className={cn(
                        'mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border',
                        item.severity === 'critical' && 'border-destructive/30 bg-destructive/5',
                        item.severity === 'high' && 'border-amber-500/30 bg-amber-500/5',
                      )}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <button
                        type="button"
                        className="min-w-0 flex-1 text-left"
                        onClick={() => actionable && void openAction(item)}
                        disabled={!actionable}
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <p className={cn('font-semibold', item.is_read && 'font-medium')}>{item.title}</p>
                          {severityBadge(item.severity)}
                          {!item.is_read && <Badge variant="secondary">Unread</Badge>}
                        </div>
                        {item.body && <p className="mt-1 text-sm leading-6 text-muted-foreground">{item.body}</p>}
                        <p className="mt-2 text-[11px] text-muted-foreground">
                          {dt(item.created_at)}
                          {item.entity_type ? ' · ' + item.entity_type : ''}
                          {item.entity_id ? ' · ' + item.entity_id : ''}
                        </p>
                      </button>
                      <div className="flex shrink-0 items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={busyId === item.id}
                          onClick={() => void toggleRead(item)}
                        >
                          {busyId === item.id && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                          {item.is_read ? 'Unread' : 'Read'}
                        </Button>
                        {actionable && (
                          <Button variant="ghost" size="icon" onClick={() => void openAction(item)} aria-label="Notification action">
                            <ChevronRight className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
