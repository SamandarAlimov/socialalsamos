import { useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  BadgeCheck,
  Bug,
  CheckCircle2,
  Clock3,
  Flag,
  Gauge,
  History,
  Loader2,
  LockKeyhole,
  Plus,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Siren,
  SlidersHorizontal,
  UserRoundCheck,
} from 'lucide-react';
import { toast } from 'sonner';

import { AdminControlNav } from '@/components/admin/AdminControlNav';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/contexts/AuthContext';
import { useAdminAccess } from '@/hooks/useAdminAccess';
import {
  createAdminIncident,
  setAdminFeatureFlag,
  updateAdminIncident,
  useAdminOperations,
  type AdminFeatureFlag,
  type AdminIncident,
  type AdminIncidentSeverity,
  type AdminIncidentStatus,
} from '@/hooks/useAdminOperations';
import { cn } from '@/lib/utils';

const severityLabel: Record<AdminIncidentSeverity, string> = {
  low: 'Past',
  medium: 'O‘rta',
  high: 'Yuqori',
  critical: 'Kritik',
};

const statusLabel: Record<AdminIncidentStatus, string> = {
  open: 'Ochiq',
  investigating: 'Tekshirilmoqda',
  mitigated: 'Ta’siri kamaytirildi',
  resolved: 'Yopildi',
};

function dateTime(value?: string | null) {
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

function StatCard({
  title,
  value,
  detail,
  icon: Icon,
  attention = false,
}: {
  title: string;
  value: number;
  detail: string;
  icon: typeof Activity;
  attention?: boolean;
}) {
  return (
    <Card className={cn('overflow-hidden shadow-sm', attention && value > 0 && 'border-amber-500/30')}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium text-muted-foreground">{title}</p>
            <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">
              {value.toLocaleString()}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border bg-muted/30">
            <Icon className="h-4 w-4" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function SeverityBadge({ severity }: { severity: AdminIncidentSeverity }) {
  if (severity === 'critical') return <Badge variant="destructive">{severityLabel[severity]}</Badge>;
  if (severity === 'high') {
    return (
      <Badge variant="outline" className="border-amber-500/40 text-amber-700 dark:text-amber-400">
        {severityLabel[severity]}
      </Badge>
    );
  }
  return <Badge variant="secondary">{severityLabel[severity]}</Badge>;
}

function StatusBadge({ status }: { status: AdminIncidentStatus }) {
  return (
    <Badge variant={status === 'resolved' ? 'secondary' : 'outline'} className="rounded-full font-normal">
      {statusLabel[status]}
    </Badge>
  );
}

export default function AdminOperationsPage() {
  const { user } = useAuth();
  const { isAdmin, isLoading: accessLoading, hasPermission } = useAdminAccess();
  const canView = hasPermission('admin.operations.view') || hasPermission('admin.system.view');
  const canManageIncidents = hasPermission('admin.incidents.manage');
  const canManageFlags = hasPermission('admin.feature_flags.manage');
  const { snapshot, isLoading, error, refresh } = useAdminOperations(isAdmin && canView);

  const [tab, setTab] = useState('overview');
  const [saving, setSaving] = useState(false);
  const [incidentDialog, setIncidentDialog] = useState(false);
  const [editIncident, setEditIncident] = useState<AdminIncident | null>(null);
  const [incidentForm, setIncidentForm] = useState({
    title: '',
    summary: '',
    severity: 'medium' as AdminIncidentSeverity,
    area: 'platform',
    assignToMe: true,
  });
  const [incidentUpdate, setIncidentUpdate] = useState({
    status: 'investigating' as AdminIncidentStatus,
    severity: 'medium' as AdminIncidentSeverity,
    resolutionNote: '',
    assignToMe: false,
  });
  const [flagDialog, setFlagDialog] = useState(false);
  const [flagForm, setFlagForm] = useState({
    key: '',
    description: '',
    enabled: false,
    rollout: 100,
    platforms: 'web',
    minVersion: '',
    reason: '',
  });

  const activeIncidents = useMemo(
    () => snapshot.incidents.filter((incident) => incident.status !== 'resolved'),
    [snapshot.incidents],
  );
  const maxScope = Math.max(
    1,
    ...snapshot.rate_limit_scopes.map((scope) => Number(scope.event_count || 0)),
  );

  if (accessLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!isAdmin || !canView) return <Navigate to="/admin" replace />;

  const openIncidentCreate = () => {
    setIncidentForm({
      title: '',
      summary: '',
      severity: 'medium',
      area: 'platform',
      assignToMe: true,
    });
    setIncidentDialog(true);
  };

  const submitIncident = async () => {
    if (incidentForm.title.trim().length < 3) {
      toast.error('Incident nomini kiriting');
      return;
    }
    setSaving(true);
    try {
      await createAdminIncident({
        title: incidentForm.title.trim(),
        summary: incidentForm.summary.trim() || null,
        severity: incidentForm.severity,
        area: incidentForm.area.trim() || 'platform',
        assignedTo: incidentForm.assignToMe ? user?.id || null : null,
      });
      setIncidentDialog(false);
      toast.success('Incident yaratildi va auditga yozildi');
      await refresh();
    } catch (caught: any) {
      toast.error(caught?.message || 'Incident yaratilmadi');
    } finally {
      setSaving(false);
    }
  };

  const openIncidentUpdate = (incident: AdminIncident) => {
    setEditIncident(incident);
    setIncidentUpdate({
      status: incident.status,
      severity: incident.severity,
      resolutionNote: incident.resolution_note || '',
      assignToMe: false,
    });
  };

  const submitIncidentUpdate = async () => {
    if (!editIncident) return;
    setSaving(true);
    try {
      await updateAdminIncident({
        incidentId: editIncident.id,
        status: incidentUpdate.status,
        severity: incidentUpdate.severity,
        assignedTo: incidentUpdate.assignToMe ? user?.id || null : null,
        resolutionNote: incidentUpdate.resolutionNote.trim() || null,
      });
      setEditIncident(null);
      toast.success('Incident yangilandi');
      await refresh();
    } catch (caught: any) {
      toast.error(caught?.message || 'Incidentni yangilab bo‘lmadi');
    } finally {
      setSaving(false);
    }
  };

  const openFlag = (flag?: AdminFeatureFlag) => {
    setFlagForm({
      key: flag?.key || '',
      description: flag?.description || '',
      enabled: Boolean(flag?.enabled),
      rollout: Number(flag?.rollout_percentage ?? 100),
      platforms: (flag?.platforms || []).join(', ') || 'web',
      minVersion: flag?.min_version || '',
      reason: '',
    });
    setFlagDialog(true);
  };

  const submitFlag = async () => {
    if (!flagForm.key.trim() || flagForm.reason.trim().length < 3) {
      toast.error('Flag kaliti va audit sababi majburiy');
      return;
    }
    setSaving(true);
    try {
      await setAdminFeatureFlag({
        key: flagForm.key.trim(),
        enabled: flagForm.enabled,
        rolloutPercentage: Math.max(0, Math.min(100, Number(flagForm.rollout) || 0)),
        description: flagForm.description.trim() || null,
        platforms: flagForm.platforms
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean),
        minVersion: flagForm.minVersion.trim() || null,
        reason: flagForm.reason.trim(),
      });
      setFlagDialog(false);
      toast.success('Feature flag yangilandi va auditga yozildi');
      await refresh();
    } catch (caught: any) {
      toast.error(caught?.message || 'Feature flag yangilanmadi');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-[1580px] space-y-5 p-3 pb-12 md:p-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border bg-card shadow-sm">
            <Gauge className="h-5 w-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Operations Control Plane</h1>
              <Badge variant="outline" className="rounded-full font-normal">RBAC + audit</Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Incident response, security pulse, feature rollout va governance — bitta xavfsiz markazda.
            </p>
          </div>
        </div>
        <AdminControlNav />
      </div>

      {error && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="flex items-center gap-3 p-4 text-sm">
            <ShieldAlert className="h-5 w-5 shrink-0 text-destructive" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold">Operations snapshot yuklanmadi</p>
              <p className="truncate text-muted-foreground">{error}</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => void refresh()}>Qayta urinish</Button>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <StatCard title="Verification" value={snapshot.queues.verification_pending} detail="pending navbat" icon={BadgeCheck} attention />
        <StatCard title="Reportlar" value={snapshot.queues.reports_open} detail="ochiq / reviewing" icon={Bug} attention />
        <StatCard title="Incidentlar" value={snapshot.queues.incidents_open} detail={String(snapshot.queues.incidents_critical) + ' kritik'} icon={Siren} attention />
        <StatCard title="Failed login" value={snapshot.security.failed_logins_24h} detail="oxirgi 24 soat" icon={LockKeyhole} attention />
        <StatCard title="Rate limit" value={snapshot.security.rate_limit_events_24h} detail="oxirgi 24 soat" icon={ShieldAlert} attention />
        <StatCard title="Audit event" value={snapshot.governance.audit_events_24h} detail="oxirgi 24 soat" icon={History} />
      </div>

      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <div className="flex flex-col gap-3 rounded-2xl border bg-card p-2 shadow-sm lg:flex-row lg:items-center lg:justify-between">
          <TabsList className="grid h-auto w-full grid-cols-2 gap-1 bg-muted/50 p-1 sm:grid-cols-5 lg:w-auto lg:min-w-[680px]">
            <TabsTrigger value="overview" className="rounded-lg py-2">Overview</TabsTrigger>
            <TabsTrigger value="incidents" className="rounded-lg py-2">Incidents</TabsTrigger>
            <TabsTrigger value="flags" className="rounded-lg py-2">Feature flags</TabsTrigger>
            <TabsTrigger value="security" className="rounded-lg py-2">Security</TabsTrigger>
            <TabsTrigger value="audit" className="rounded-lg py-2">Audit</TabsTrigger>
          </TabsList>
          <div className="flex items-center justify-end gap-2 px-1">
            {snapshot.generated_at && (
              <span className="hidden text-xs text-muted-foreground xl:inline">
                Snapshot: {dateTime(snapshot.generated_at)}
              </span>
            )}
            <Button variant="outline" size="sm" disabled={isLoading} onClick={() => void refresh()}>
              <RefreshCw className={cn('mr-2 h-4 w-4', isLoading && 'animate-spin')} />
              Yangilash
            </Button>
          </div>
        </div>

        <TabsContent value="overview" className="m-0 space-y-4">
          <div className="grid gap-4 xl:grid-cols-[1.4fr_0.6fr]">
            <Card className="overflow-hidden shadow-sm">
              <CardHeader className="border-b bg-muted/10">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <CardTitle className="text-base">Faol incidentlar</CardTitle>
                    <p className="mt-1 text-sm text-muted-foreground">Eng muhim operational holatlar birinchi ko‘rsatiladi.</p>
                  </div>
                  {canManageIncidents && (
                    <Button size="sm" onClick={openIncidentCreate}>
                      <Plus className="mr-2 h-4 w-4" />Incident
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {isLoading ? (
                  <div className="flex min-h-56 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>
                ) : activeIncidents.length === 0 ? (
                  <div className="flex min-h-56 flex-col items-center justify-center px-6 text-center">
                    <CheckCircle2 className="mb-3 h-8 w-8 text-emerald-600" />
                    <p className="font-semibold">Faol incident yo‘q</p>
                    <p className="mt-1 text-sm text-muted-foreground">Platform operations navbati hozir toza.</p>
                  </div>
                ) : (
                  <div className="divide-y">
                    {activeIncidents.slice(0, 8).map((incident) => (
                      <button
                        key={incident.id}
                        type="button"
                        disabled={!canManageIncidents}
                        onClick={() => canManageIncidents && openIncidentUpdate(incident)}
                        className="flex w-full items-start gap-4 p-4 text-left transition hover:bg-muted/30 disabled:cursor-default"
                      >
                        <div
                          className={cn(
                            'mt-1 h-2.5 w-2.5 shrink-0 rounded-full',
                            incident.severity === 'critical' && 'bg-destructive',
                            incident.severity === 'high' && 'bg-amber-500',
                            incident.severity === 'medium' && 'bg-blue-500',
                            incident.severity === 'low' && 'bg-muted-foreground/50',
                          )}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-semibold">{incident.title}</p>
                            <SeverityBadge severity={incident.severity} />
                            <StatusBadge status={incident.status} />
                          </div>
                          <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                            {incident.summary || 'Qo‘shimcha tavsif berilmagan.'}
                          </p>
                          <p className="mt-2 text-[11px] text-muted-foreground">
                            {incident.area} · {incident.assigned_to_name || incident.assigned_to_username || 'Unassigned'} · {dateTime(incident.created_at)}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="space-y-4">
              <Card className="shadow-sm">
                <CardHeader className="pb-3"><CardTitle className="text-base">Account enforcement</CardTitle></CardHeader>
                <CardContent className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border p-3">
                    <UserRoundCheck className="mb-3 h-4 w-4 text-muted-foreground" />
                    <p className="text-xl font-semibold tabular-nums">{snapshot.security.suspended_accounts}</p>
                    <p className="text-xs text-muted-foreground">Suspended</p>
                  </div>
                  <div className="rounded-xl border p-3">
                    <ShieldAlert className="mb-3 h-4 w-4 text-muted-foreground" />
                    <p className="text-xl font-semibold tabular-nums">{snapshot.security.banned_accounts}</p>
                    <p className="text-xs text-muted-foreground">Banned</p>
                  </div>
                </CardContent>
              </Card>

              <Card className="shadow-sm">
                <CardHeader className="pb-3"><CardTitle className="text-base">Feature rollout</CardTitle></CardHeader>
                <CardContent>
                  <div className="flex items-end justify-between">
                    <div>
                      <p className="text-3xl font-semibold tabular-nums">{snapshot.governance.feature_flags_enabled}</p>
                      <p className="text-xs text-muted-foreground">
                        enabled / {snapshot.governance.feature_flags_total} jami
                      </p>
                    </div>
                    <Flag className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <Button variant="outline" size="sm" className="mt-4 w-full" onClick={() => setTab('flags')}>
                    Rollout boshqaruvi
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="incidents" className="m-0">
          <Card className="overflow-hidden shadow-sm">
            <CardHeader className="border-b bg-muted/10">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle className="text-base">Incident response</CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">Operational muammolar uchun auditli lifecycle.</p>
                </div>
                {canManageIncidents && (
                  <Button size="sm" onClick={openIncidentCreate}><Plus className="mr-2 h-4 w-4" />Yangi incident</Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {snapshot.incidents.length === 0 ? (
                <div className="p-12 text-center text-sm text-muted-foreground">Incident tarixi yo‘q.</div>
              ) : (
                <div className="divide-y">
                  {snapshot.incidents.map((incident) => (
                    <div key={incident.id} className="grid gap-3 p-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold">{incident.title}</p>
                          <SeverityBadge severity={incident.severity} />
                          <StatusBadge status={incident.status} />
                        </div>
                        <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{incident.summary || '—'}</p>
                        <p className="mt-2 text-[11px] text-muted-foreground">
                          {incident.area} · {incident.assigned_to_name || incident.assigned_to_username || 'Unassigned'} · {dateTime(incident.created_at)}
                        </p>
                        {incident.resolution_note && (
                          <p className="mt-2 rounded-lg bg-muted/50 px-3 py-2 text-xs">Resolution: {incident.resolution_note}</p>
                        )}
                      </div>
                      {canManageIncidents && (
                        <Button variant="outline" size="sm" onClick={() => openIncidentUpdate(incident)}>Boshqarish</Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="flags" className="m-0 space-y-4">
          <Card className="overflow-hidden shadow-sm">
            <CardHeader className="border-b bg-muted/10">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle className="text-base">Feature flag governance</CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Har bir rollout o‘zgarishi history va immutable admin auditga yoziladi.
                  </p>
                </div>
                {canManageFlags && (
                  <Button size="sm" onClick={() => openFlag()}><Plus className="mr-2 h-4 w-4" />Flag yaratish</Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {snapshot.feature_flags.length === 0 ? (
                <div className="p-12 text-center text-sm text-muted-foreground">Feature flag mavjud emas.</div>
              ) : (
                <div className="divide-y">
                  {snapshot.feature_flags.map((flag) => (
                    <div
                      key={flag.key}
                      className="grid gap-3 p-4 lg:grid-cols-[minmax(0,1fr)_180px_130px_auto] lg:items-center"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <code className="text-sm font-semibold">{flag.key}</code>
                          <Badge variant={flag.enabled ? 'default' : 'secondary'} className="rounded-full">
                            {flag.enabled ? 'Enabled' : 'Off'}
                          </Badge>
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">{flag.description || 'Tavsif berilmagan'}</p>
                        <p className="mt-1 text-[11px] text-muted-foreground">Yangilangan: {dateTime(flag.updated_at)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Platformalar</p>
                        <p className="mt-1 text-sm">{flag.platforms?.length ? flag.platforms.join(', ') : 'Barchasi'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Rollout</p>
                        <div className="mt-2 flex items-center gap-2">
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                            <div
                              className="h-full rounded-full bg-foreground"
                              style={{ width: String(Math.max(0, Math.min(100, flag.rollout_percentage))) + '%' }}
                            />
                          </div>
                          <span className="text-xs font-medium tabular-nums">{flag.rollout_percentage}%</span>
                        </div>
                      </div>
                      {canManageFlags && (
                        <Button variant="outline" size="sm" onClick={() => openFlag(flag)}>
                          <SlidersHorizontal className="mr-2 h-4 w-4" />Sozlash
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="overflow-hidden shadow-sm">
            <CardHeader><CardTitle className="text-base">Rollout history</CardTitle></CardHeader>
            <CardContent className="p-0">
              {snapshot.feature_flag_history.length === 0 ? (
                <div className="border-t p-8 text-center text-sm text-muted-foreground">History hali yo‘q.</div>
              ) : (
                <div className="divide-y border-t">
                  {snapshot.feature_flag_history.slice(0, 20).map((entry) => (
                    <div key={entry.id} className="flex items-start gap-3 p-4">
                      <History className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">
                          <code>{entry.flag_key}</code> · {entry.reason || 'Sabab berilmagan'}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          @{entry.changed_by_username || 'admin'} · {dateTime(entry.created_at)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security" className="m-0">
          <div className="grid gap-4 xl:grid-cols-[0.75fr_1.25fr]">
            <Card className="shadow-sm">
              <CardHeader><CardTitle className="text-base">Security pulse · 24h</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {[
                  ['Failed login', snapshot.security.failed_logins_24h, LockKeyhole],
                  ['Rate-limit event', snapshot.security.rate_limit_events_24h, ShieldAlert],
                  ['Suspended', snapshot.security.suspended_accounts, Clock3],
                  ['Banned', snapshot.security.banned_accounts, Siren],
                ].map(([label, value, Icon]) => {
                  const IconComponent = Icon as typeof Activity;
                  return (
                    <div key={String(label)} className="flex items-center gap-3 rounded-xl border p-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted/50">
                        <IconComponent className="h-4 w-4" />
                      </div>
                      <span className="flex-1 text-sm">{String(label)}</span>
                      <span className="font-semibold tabular-nums">{Number(value).toLocaleString()}</span>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">Rate-limit scope’lar</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Shaxsiy IP yoki identifier ochilmaydi — faqat agregat operational signal.
                </p>
              </CardHeader>
              <CardContent>
                {snapshot.rate_limit_scopes.length === 0 ? (
                  <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
                    Oxirgi 24 soatda rate-limit event yo‘q.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {snapshot.rate_limit_scopes.map((scope) => (
                      <div key={scope.scope}>
                        <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
                          <span className="truncate font-medium">{scope.scope}</span>
                          <span className="tabular-nums text-muted-foreground">
                            {Number(scope.event_count).toLocaleString()}
                          </span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-foreground"
                            style={{ width: String(Math.max(4, (Number(scope.event_count) / maxScope) * 100)) + '%' }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="audit" className="m-0">
          <Card className="overflow-hidden shadow-sm">
            <CardHeader className="border-b bg-muted/10">
              <CardTitle className="text-base">Admin audit timeline</CardTitle>
              <p className="text-sm text-muted-foreground">
                Verification, user lifecycle, incident, notes va rollout o‘zgarishlari.
              </p>
            </CardHeader>
            <CardContent className="p-0">
              {snapshot.recent_audit.length === 0 ? (
                <div className="p-12 text-center text-sm text-muted-foreground">Audit event topilmadi.</div>
              ) : (
                <div className="divide-y">
                  {snapshot.recent_audit.map((event) => (
                    <div key={event.id} className="flex items-start gap-3 p-4">
                      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border bg-muted/30">
                        <ShieldCheck className="h-3.5 w-3.5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold">{event.action}</p>
                          <Badge variant="outline" className="rounded-full text-[10px] font-normal">
                            {event.entity_type}
                          </Badge>
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">{event.reason || 'Sabab berilmagan'}</p>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          @{event.actor_username || 'admin'} · {dateTime(event.created_at)}
                          {event.entity_id ? ' · ' + event.entity_id : ''}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={incidentDialog} onOpenChange={setIncidentDialog}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Yangi incident</DialogTitle>
            <DialogDescription>Operational holat incident lifecycle va audit journalga yoziladi.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Nomi</Label>
              <Input
                className="mt-2"
                value={incidentForm.title}
                onChange={(event) => setIncidentForm((value) => ({ ...value, title: event.target.value }))}
                placeholder="Masalan: Verification queue 5xx spike"
              />
            </div>
            <div>
              <Label>Tavsif</Label>
              <Textarea
                className="mt-2"
                rows={4}
                value={incidentForm.summary}
                onChange={(event) => setIncidentForm((value) => ({ ...value, summary: event.target.value }))}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Severity</Label>
                <Select
                  value={incidentForm.severity}
                  onValueChange={(value) => setIncidentForm((current) => ({ ...current, severity: value as AdminIncidentSeverity }))}
                >
                  <SelectTrigger className="mt-2"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(severityLabel).map(([key, label]) => (
                      <SelectItem key={key} value={key}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Area</Label>
                <Input
                  className="mt-2"
                  value={incidentForm.area}
                  onChange={(event) => setIncidentForm((value) => ({ ...value, area: event.target.value }))}
                  placeholder="auth / admin / marketplace"
                />
              </div>
            </div>
            <label className="flex items-center justify-between gap-4 rounded-xl border p-3 text-sm">
              <div>
                <p className="font-medium">O‘zimga biriktirish</p>
                <p className="text-xs text-muted-foreground">Incident owner sifatida joriy admin.</p>
              </div>
              <Switch
                checked={incidentForm.assignToMe}
                onCheckedChange={(checked) => setIncidentForm((value) => ({ ...value, assignToMe: checked }))}
              />
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIncidentDialog(false)}>Bekor qilish</Button>
            <Button disabled={saving || incidentForm.title.trim().length < 3} onClick={() => void submitIncident()}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Yaratish
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(editIncident)} onOpenChange={(open) => !open && setEditIncident(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{editIncident?.title || 'Incident'}</DialogTitle>
            <DialogDescription>Status, severity va resolution o‘zgarishlari auditga yoziladi.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Status</Label>
                <Select
                  value={incidentUpdate.status}
                  onValueChange={(value) => setIncidentUpdate((current) => ({ ...current, status: value as AdminIncidentStatus }))}
                >
                  <SelectTrigger className="mt-2"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(statusLabel).map(([key, label]) => (
                      <SelectItem key={key} value={key}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Severity</Label>
                <Select
                  value={incidentUpdate.severity}
                  onValueChange={(value) => setIncidentUpdate((current) => ({ ...current, severity: value as AdminIncidentSeverity }))}
                >
                  <SelectTrigger className="mt-2"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(severityLabel).map(([key, label]) => (
                      <SelectItem key={key} value={key}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Resolution / ish qaydi</Label>
              <Textarea
                className="mt-2"
                rows={4}
                value={incidentUpdate.resolutionNote}
                onChange={(event) => setIncidentUpdate((current) => ({ ...current, resolutionNote: event.target.value }))}
              />
            </div>
            <label className="flex items-center justify-between gap-4 rounded-xl border p-3 text-sm">
              <div>
                <p className="font-medium">O‘zimga biriktirish</p>
                <p className="text-xs text-muted-foreground">Hozirgi assignmentni joriy adminga o‘tkazadi.</p>
              </div>
              <Switch
                checked={incidentUpdate.assignToMe}
                onCheckedChange={(checked) => setIncidentUpdate((value) => ({ ...value, assignToMe: checked }))}
              />
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditIncident(null)}>Bekor qilish</Button>
            <Button disabled={saving} onClick={() => void submitIncidentUpdate()}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Saqlash
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={flagDialog} onOpenChange={setFlagDialog}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Feature flag</DialogTitle>
            <DialogDescription>
              Rollout o‘zgarishi history va auditda saqlanadi. Production ta’sirini oldindan tekshiring.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Kalit</Label>
              <Input
                className="mt-2 font-mono"
                value={flagForm.key}
                onChange={(event) => setFlagForm((value) => ({ ...value, key: event.target.value }))}
                placeholder="marketplace.new_checkout"
              />
            </div>
            <div>
              <Label>Tavsif</Label>
              <Input
                className="mt-2"
                value={flagForm.description}
                onChange={(event) => setFlagForm((value) => ({ ...value, description: event.target.value }))}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Rollout %</Label>
                <Input
                  className="mt-2"
                  type="number"
                  min={0}
                  max={100}
                  value={flagForm.rollout}
                  onChange={(event) => setFlagForm((value) => ({ ...value, rollout: Number(event.target.value) }))}
                />
              </div>
              <div>
                <Label>Min version</Label>
                <Input
                  className="mt-2"
                  value={flagForm.minVersion}
                  onChange={(event) => setFlagForm((value) => ({ ...value, minVersion: event.target.value }))}
                  placeholder="ixtiyoriy"
                />
              </div>
            </div>
            <div>
              <Label>Platformalar</Label>
              <Input
                className="mt-2"
                value={flagForm.platforms}
                onChange={(event) => setFlagForm((value) => ({ ...value, platforms: event.target.value }))}
                placeholder="web, ios, android"
              />
            </div>
            <label className="flex items-center justify-between gap-4 rounded-xl border p-3 text-sm">
              <div>
                <p className="font-medium">Enabled</p>
                <p className="text-xs text-muted-foreground">Flag aktiv holatda bo‘ladi.</p>
              </div>
              <Switch
                checked={flagForm.enabled}
                onCheckedChange={(checked) => setFlagForm((value) => ({ ...value, enabled: checked }))}
              />
            </label>
            <div>
              <Label>Audit sababi</Label>
              <Textarea
                className="mt-2"
                value={flagForm.reason}
                onChange={(event) => setFlagForm((value) => ({ ...value, reason: event.target.value }))}
                placeholder="Nega rollout o‘zgartirilmoqda?"
              />
            </div>
            {flagForm.enabled && flagForm.rollout > 50 && (
              <div className="flex gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <p>Katta rollout. Monitoring va rollback rejasi tayyorligini tekshiring.</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFlagDialog(false)}>Bekor qilish</Button>
            <Button disabled={saving || flagForm.reason.trim().length < 3} onClick={() => void submitFlag()}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Saqlash
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
