import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  Binary,
  Clock3,
  Database,
  HardDrive,
  Laptop,
  Loader2,
  RefreshCw,
  Search,
  ServerCog,
  ShieldAlert,
  ShieldCheck,
  TimerReset,
  Users,
  Wifi,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';

import { AdminControlNav } from '@/components/admin/AdminControlNav';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useAdminAccess } from '@/hooks/useAdminAccess';
import {
  fetchAuditEventDetail,
  fetchUserSecuritySnapshot,
  revokeDeviceTrust,
  useSystemControl,
  type AdminAuditEvent,
  type AdminDevice,
  type UserSecuritySnapshot,
} from '@/hooks/useAdminControlPlane';
import { supabase } from '@/integrations/supabase/client';
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

function bytes(value: number) {
  const amount = Number(value || 0);
  if (amount < 1024) return amount + ' B';
  const units = ['KB', 'MB', 'GB', 'TB'];
  let result = amount / 1024;
  let unit = 0;
  while (result >= 1024 && unit < units.length - 1) {
    result /= 1024;
    unit += 1;
  }
  return result.toFixed(result >= 10 ? 1 : 2) + ' ' + units[unit];
}

function age(value?: string | null) {
  if (!value) return '—';
  const delta = Math.max(0, Date.now() - new Date(value).getTime());
  const minutes = Math.floor(delta / 60000);
  if (minutes < 60) return minutes + 'm';
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return hours + 'h ' + (minutes % 60) + 'm';
  return Math.floor(hours / 24) + 'd ' + (hours % 24) + 'h';
}

function statusTone(pending: number, failed: number, oldest?: string | null) {
  if (failed > 0) return 'danger';
  if (pending > 0 && oldest && Date.now() - new Date(oldest).getTime() > 24 * 60 * 60 * 1000) return 'warning';
  if (pending > 0) return 'active';
  return 'healthy';
}

function JsonPanel({ title, value }: { title: string; value: Record<string, unknown> }) {
  const empty = !value || Object.keys(value).length === 0;
  return (
    <div className="min-w-0 rounded-xl border bg-muted/10">
      <div className="border-b px-3 py-2 text-xs font-semibold">{title}</div>
      <pre className="max-h-[380px] overflow-auto whitespace-pre-wrap break-words p-3 text-[11px] leading-5 text-muted-foreground">
        {empty ? 'No snapshot' : JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

export default function AdminSystemPage() {
  const { isAdmin, isLoading: accessLoading, hasPermission } = useAdminAccess();
  const canView =
    hasPermission('admin.system.view') ||
    hasPermission('admin.operations.view') ||
    hasPermission('admin.audit.view') ||
    hasPermission('audit.view');
  const canSecurityView =
    hasPermission('admin.security.view') ||
    hasPermission('security.view') ||
    hasPermission('sessions.view');
  const canSecurityManage =
    hasPermission('admin.security.manage') ||
    hasPermission('security.lock');
  const { snapshot, loading, error, refresh } = useSystemControl(isAdmin && canView);

  const [tab, setTab] = useState('health');
  const [auditDetail, setAuditDetail] = useState<AdminAuditEvent | null>(null);
  const [auditLoading, setAuditLoading] = useState(false);
  const [username, setUsername] = useState('');
  const [security, setSecurity] = useState<UserSecuritySnapshot | null>(null);
  const [securityLoading, setSecurityLoading] = useState(false);
  const [deviceTarget, setDeviceTarget] = useState<AdminDevice | null>(null);
  const [deviceReason, setDeviceReason] = useState('');
  const [deviceSaving, setDeviceSaving] = useState(false);

  if (accessLoading) {
    return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin" /></div>;
  }
  if (!isAdmin || !canView) return <Navigate to="/admin" replace />;

  const failedQueues = snapshot.queues.reduce((sum, queue) => sum + Number(queue.failed || 0), 0);
  const pendingQueues = snapshot.queues.reduce((sum, queue) => sum + Number(queue.pending || 0), 0);

  const loadAudit = async (event: AdminAuditEvent) => {
    setAuditLoading(true);
    try {
      setAuditDetail(await fetchAuditEventDetail(event.id));
    } catch (caught: any) {
      toast.error(caught?.message || 'Audit detail yuklanmadi');
    } finally {
      setAuditLoading(false);
    }
  };

  const lookupSecurity = async () => {
    const clean = username.trim().replace(/^@/, '');
    if (!clean) return;
    setSecurityLoading(true);
    setSecurity(null);
    try {
      const { data, error: profileError } = await supabase
        .from('profiles')
        .select('id')
        .eq('username', clean)
        .maybeSingle();
      if (profileError) throw profileError;
      if (!data?.id) {
        toast.error('Bunday username topilmadi');
        return;
      }
      setSecurity(await fetchUserSecuritySnapshot(data.id));
    } catch (caught: any) {
      toast.error(caught?.message || 'Security snapshot yuklanmadi');
    } finally {
      setSecurityLoading(false);
    }
  };

  const revokeTrust = async () => {
    if (!deviceTarget || deviceReason.trim().length < 3) return;
    setDeviceSaving(true);
    try {
      await revokeDeviceTrust(deviceTarget.id, deviceReason.trim());
      toast.success('Device trust bekor qilindi va auditga yozildi');
      setDeviceTarget(null);
      setDeviceReason('');
      if (security?.user?.id) {
        setSecurity(await fetchUserSecuritySnapshot(security.user.id));
      }
      await refresh();
    } catch (caught: any) {
      toast.error(caught?.message || 'Device trustni bekor qilib bo‘lmadi');
    } finally {
      setDeviceSaving(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-[1580px] space-y-5 p-3 pb-12 md:p-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border bg-card shadow-sm">
            <ServerCog className="h-5 w-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight md:text-3xl">System Control</h1>
              <Badge variant="outline" className="rounded-full font-normal">Health + queues + audit</Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Database health, background work, security posture va immutable governance.
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
              <p className="font-semibold">System snapshot yuklanmadi</p>
              <p className="truncate text-muted-foreground">{error}</p>
            </div>
            <Button size="sm" variant="outline" onClick={() => void refresh()}>Qayta urinish</Button>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        {[
          ['DB size', bytes(snapshot.database.size_bytes), snapshot.database.connections + ' connection', Database],
          ['Pending work', pendingQueues.toLocaleString(), snapshot.queues.length + ' monitored queue', Clock3],
          ['Failed jobs', failedQueues.toLocaleString(), 'queue failures', XCircle],
          ['Security events', snapshot.security.security_events_24h.toLocaleString(), 'oxirgi 24 soat', ShieldAlert],
          ['Active admins', snapshot.governance.admins_active.toLocaleString(), snapshot.governance.roles + ' role', Users],
          ['Unread admin', snapshot.governance.unread_notifications.toLocaleString(), 'notifications', Activity],
        ].map(([title, value, detail, Icon]) => {
          const IconComponent = Icon as typeof Database;
          return (
            <Card key={String(title)} className={cn('shadow-sm', title === 'Failed jobs' && failedQueues > 0 && 'border-destructive/30')}>
              <CardContent className="p-4">
                <IconComponent className="mb-3 h-4 w-4 text-muted-foreground" />
                <p className="text-xl font-semibold tabular-nums">{String(value)}</p>
                <p className="mt-1 text-xs font-medium">{String(title)}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">{String(detail)}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <div className="flex flex-col gap-3 rounded-2xl border bg-card p-2 shadow-sm lg:flex-row lg:items-center lg:justify-between">
          <TabsList className={cn('grid h-auto w-full gap-1 bg-muted/50 p-1 lg:w-auto', canSecurityView ? 'grid-cols-4 lg:min-w-[650px]' : 'grid-cols-3 lg:min-w-[520px]')}>
            <TabsTrigger value="health" className="rounded-lg py-2">Health</TabsTrigger>
            <TabsTrigger value="queues" className="rounded-lg py-2">Queues</TabsTrigger>
            <TabsTrigger value="audit" className="rounded-lg py-2">Audit</TabsTrigger>
            {canSecurityView && <TabsTrigger value="security" className="rounded-lg py-2">Security</TabsTrigger>}
          </TabsList>
          <div className="flex items-center justify-end gap-2">
            <span className="hidden text-xs text-muted-foreground xl:inline">Snapshot: {dt(snapshot.generated_at)}</span>
            <Button variant="outline" size="sm" disabled={loading} onClick={() => void refresh()}>
              <RefreshCw className={cn('mr-2 h-4 w-4', loading && 'animate-spin')} />Yangilash
            </Button>
          </div>
        </div>

        <TabsContent value="health" className="m-0">
          <div className="grid gap-4 xl:grid-cols-2">
            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">Database & governance</CardTitle>
                <p className="text-sm text-muted-foreground">Control-plane uchun asosiy capacity va access signallari.</p>
              </CardHeader>
              <CardContent className="space-y-3">
                {[
                  ['Database size', bytes(snapshot.database.size_bytes), HardDrive],
                  ['Connections', snapshot.database.connections.toLocaleString(), Wifi],
                  ['Audit / 24h', snapshot.governance.audit_24h.toLocaleString(), Binary],
                  ['Permission catalog', snapshot.governance.permissions.toLocaleString(), ShieldCheck],
                ].map(([label, value, Icon]) => {
                  const IconComponent = Icon as typeof Database;
                  return (
                    <div key={String(label)} className="flex items-center gap-3 rounded-xl border p-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted/50"><IconComponent className="h-4 w-4" /></div>
                      <span className="flex-1 text-sm">{String(label)}</span>
                      <span className="font-semibold tabular-nums">{String(value)}</span>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">Security posture</CardTitle>
                <p className="text-sm text-muted-foreground">Privacy-safe aggregate; raw identifiers bu dashboardda ochilmaydi.</p>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2">
                {[
                  ['Active devices', snapshot.security.devices_active, Laptop],
                  ['Revoked devices', snapshot.security.devices_revoked, ShieldAlert],
                  ['Sessions / 24h', snapshot.security.sessions_24h, Activity],
                  ['Failed login / 24h', snapshot.security.failed_logins_24h, AlertTriangle],
                ].map(([label, value, Icon]) => {
                  const IconComponent = Icon as typeof Database;
                  return (
                    <div key={String(label)} className="rounded-xl border p-3">
                      <IconComponent className="mb-3 h-4 w-4 text-muted-foreground" />
                      <p className="text-xl font-semibold tabular-nums">{Number(value).toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground">{String(label)}</p>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="queues" className="m-0">
          <Card className="overflow-hidden shadow-sm">
            <CardHeader className="border-b bg-muted/10">
              <CardTitle className="text-base">Background jobs & operational queues</CardTitle>
              <p className="text-sm text-muted-foreground">
                Verification, moderation, media, AI, email va deletion navbatlari bitta health board’da.
              </p>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y">
                {snapshot.queues.map((queue) => {
                  const tone = statusTone(queue.pending, queue.failed, queue.oldest_at);
                  return (
                    <div key={queue.key} className="grid gap-3 p-4 lg:grid-cols-[minmax(0,1fr)_110px_110px_150px] lg:items-center">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className={cn(
                          'h-2.5 w-2.5 shrink-0 rounded-full',
                          tone === 'danger' && 'bg-destructive',
                          tone === 'warning' && 'bg-amber-500',
                          tone === 'active' && 'bg-blue-500',
                          tone === 'healthy' && 'bg-emerald-500',
                        )} />
                        <div className="min-w-0">
                          <p className="font-semibold">{queue.label}</p>
                          <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">{queue.key}</p>
                        </div>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Pending</p>
                        <p className="mt-1 font-semibold tabular-nums">{queue.pending.toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Failed</p>
                        <p className={cn('mt-1 font-semibold tabular-nums', queue.failed > 0 && 'text-destructive')}>{queue.failed.toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Oldest waiting</p>
                        <p className="mt-1 text-sm">{age(queue.oldest_at)} <span className="text-xs text-muted-foreground">· {dt(queue.oldest_at)}</span></p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="audit" className="m-0">
          <Card className="overflow-hidden shadow-sm">
            <CardHeader className="border-b bg-muted/10">
              <CardTitle className="text-base">Immutable admin audit</CardTitle>
              <p className="text-sm text-muted-foreground">
                Row ustiga bosing — before/after snapshot va metadata diff ochiladi.
              </p>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y">
                {snapshot.recent_audit.map((event) => (
                  <button
                    key={event.id}
                    type="button"
                    className="grid w-full gap-3 p-4 text-left transition hover:bg-muted/25 lg:grid-cols-[170px_minmax(0,1fr)_190px]"
                    onClick={() => void loadAudit(event)}
                  >
                    <div>
                      <p className="text-xs text-muted-foreground">{dt(event.created_at)}</p>
                      <p className="mt-1 text-[11px] text-muted-foreground">@{event.actor_username || 'system'}</p>
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold">{event.action}</p>
                        <Badge variant="outline" className="rounded-full text-[10px] font-normal">{event.entity_type}</Badge>
                      </div>
                      <p className="mt-1 truncate text-sm text-muted-foreground">{event.reason || 'Sabab ko‘rsatilmagan'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Entity</p>
                      <p className="mt-1 truncate font-mono text-xs">{event.entity_id || event.target_user_id || '—'}</p>
                    </div>
                  </button>
                ))}
                {!loading && snapshot.recent_audit.length === 0 && (
                  <div className="p-12 text-center text-sm text-muted-foreground">Audit event topilmadi.</div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {canSecurityView && (
          <TabsContent value="security" className="m-0 space-y-4">
            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">User session & device investigation</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Username orqali Alsamos device trust, app session metadata va security eventlarni tekshirish.
                </p>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    placeholder="@username"
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') void lookupSecurity();
                    }}
                  />
                  <Button disabled={securityLoading || !username.trim()} onClick={() => void lookupSecurity()}>
                    {securityLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
                    Tekshirish
                  </Button>
                </div>
              </CardContent>
            </Card>

            {security && (
              <>
                <Card className="shadow-sm">
                  <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
                    <Avatar className="h-12 w-12">
                      <AvatarImage src={security.user?.avatar_url || ''} />
                      <AvatarFallback>{(security.user?.display_name || security.user?.username || '?').slice(0,2).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">{security.user?.display_name || 'User'}</p>
                      <p className="text-sm text-muted-foreground">@{security.user?.username || 'unknown'}</p>
                    </div>
                    <div className="flex gap-2 text-xs">
                      <Badge variant="outline">{security.devices.length} device</Badge>
                      <Badge variant="outline">{security.sessions.length} app session</Badge>
                      <Badge variant="outline">{security.security_events.length} security event</Badge>
                    </div>
                  </CardContent>
                </Card>

                <div className="grid gap-4 xl:grid-cols-2">
                  <Card className="overflow-hidden shadow-sm">
                    <CardHeader className="border-b bg-muted/10">
                      <CardTitle className="text-base">Trusted devices</CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                      <div className="divide-y">
                        {security.devices.map((device) => (
                          <div key={device.id} className="p-4">
                            <div className="flex items-start gap-3">
                              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border bg-muted/30"><Laptop className="h-4 w-4" /></div>
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="font-semibold">{device.label || 'Unknown device'}</p>
                                  <Badge variant={device.revoked_at ? 'destructive' : 'secondary'}>{device.revoked_at ? 'Revoked' : 'Trusted'}</Badge>
                                </div>
                                <p className="mt-1 truncate text-xs text-muted-foreground">{device.user_agent || '—'}</p>
                                <p className="mt-1 text-[11px] text-muted-foreground">{device.ip_masked || 'IP unavailable'} · last seen {dt(device.last_seen_at)}</p>
                                {device.revoked_reason && <p className="mt-2 rounded-lg bg-muted/50 px-2 py-1 text-xs">{device.revoked_reason}</p>}
                              </div>
                              {canSecurityManage && !device.revoked_at && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    setDeviceReason('');
                                    setDeviceTarget(device);
                                  }}
                                >
                                  Revoke trust
                                </Button>
                              )}
                            </div>
                          </div>
                        ))}
                        {security.devices.length === 0 && <div className="p-8 text-center text-sm text-muted-foreground">Device yo‘q.</div>}
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="overflow-hidden shadow-sm">
                    <CardHeader className="border-b bg-muted/10">
                      <CardTitle className="text-base">App session metadata</CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                      <div className="divide-y">
                        {security.sessions.map((session) => (
                          <div key={session.id} className="p-4">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-semibold">{session.device_name || session.device_model || 'Unknown session'}</p>
                              {session.is_current && <Badge>Current</Badge>}
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {[session.app_name, session.app_version, session.platform, session.os_name, session.os_version]
                                .filter(Boolean)
                                .join(' · ') || 'Metadata unavailable'}
                            </p>
                            <p className="mt-1 text-[11px] text-muted-foreground">
                              {[session.location_city, session.location_country, session.ip_masked].filter(Boolean).join(' · ') || 'Location/IP unavailable'} · active {dt(session.last_active_at)}
                            </p>
                          </div>
                        ))}
                        {security.sessions.length === 0 && <div className="p-8 text-center text-sm text-muted-foreground">App session metadata yo‘q.</div>}
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <Card className="overflow-hidden shadow-sm">
                  <CardHeader className="border-b bg-muted/10">
                    <CardTitle className="text-base">Security events</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="divide-y">
                      {security.security_events.map((event) => (
                        <div key={event.id} className="flex items-start gap-3 p-4">
                          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold">{event.event_type}</p>
                            <p className="mt-1 text-sm text-muted-foreground">{event.description}</p>
                          </div>
                          <span className="whitespace-nowrap text-[11px] text-muted-foreground">{dt(event.created_at)}</span>
                        </div>
                      ))}
                      {security.security_events.length === 0 && <div className="p-8 text-center text-sm text-muted-foreground">Security event yo‘q.</div>}
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>
        )}
      </Tabs>

      <Dialog open={Boolean(auditDetail) || auditLoading} onOpenChange={(open) => !open && setAuditDetail(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Audit diff</DialogTitle>
            <DialogDescription>
              {auditDetail ? auditDetail.action + ' · ' + dt(auditDetail.created_at) : 'Audit detail yuklanmoqda...'}
            </DialogDescription>
          </DialogHeader>
          {auditLoading && !auditDetail ? (
            <div className="flex min-h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : auditDetail ? (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border p-3"><p className="text-xs text-muted-foreground">Actor</p><p className="mt-1 text-sm">@{auditDetail.actor_username || 'system'}</p></div>
                <div className="rounded-xl border p-3"><p className="text-xs text-muted-foreground">Entity</p><p className="mt-1 truncate font-mono text-xs">{auditDetail.entity_type}:{auditDetail.entity_id || '—'}</p></div>
                <div className="rounded-xl border p-3"><p className="text-xs text-muted-foreground">Reason</p><p className="mt-1 text-sm">{auditDetail.reason || '—'}</p></div>
              </div>
              <div className="grid gap-3 lg:grid-cols-2">
                <JsonPanel title="Before" value={auditDetail.before_state || {}} />
                <JsonPanel title="After" value={auditDetail.after_state || {}} />
              </div>
              <JsonPanel title="Metadata" value={auditDetail.metadata || {}} />
            </div>
          ) : null}
          <DialogFooter><Button variant="outline" onClick={() => setAuditDetail(null)}>Yopish</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(deviceTarget)} onOpenChange={(open) => !open && setDeviceTarget(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Device trustni bekor qilish</DialogTitle>
            <DialogDescription>
              Bu Alsamos device-trust holatini revoke qiladi. Bu Supabase Auth access tokenini darhol bekor qilish bilan bir xil emas; mavjud JWT o‘z expiry vaqtigacha amal qilishi mumkin.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
            <TimerReset className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <p>Real Auth session termination alohida token-aware workflow talab qiladi. Bu action faqat platform device trust ledgerini boshqaradi.</p>
          </div>
          <div>
            <Label>Sabab</Label>
            <Textarea
              className="mt-2"
              rows={4}
              value={deviceReason}
              onChange={(event) => setDeviceReason(event.target.value)}
              placeholder="Nega bu device endi trusted emas?"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeviceTarget(null)}>Bekor qilish</Button>
            <Button variant="destructive" disabled={deviceSaving || deviceReason.trim().length < 3} onClick={() => void revokeTrust()}>
              {deviceSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Revoke trust
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
