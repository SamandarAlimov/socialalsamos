import { useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Clock3,
  BookOpen,
  CheckCheck,
  Eye,
  FileWarning,
  Gavel,
  History,
  Loader2,
  PlayCircle,
  RefreshCw,
  Scale,
  ShieldAlert,
  ShieldCheck,
  UserRoundCheck,
  XCircle,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/contexts/AuthContext';
import { useAdminAccess } from '@/hooks/useAdminAccess';
import {
  bulkTriageReports,
  createCaseFromReport,
  decideModerationCase,
  executeEnforcement,
  fetchAdminCaseDetail,
  reviewEnforcement,
  reviewModerationAppeal,
  updateModerationCase,
  useEnforcementQueue,
  useTrustSafetyControl,
  type AdminCaseDetail,
  type EnforcementAction,
  type ModerationAppeal,
  type ModerationCase,
  type TrustSafetyPriority,
  type TrustSafetyReport,
  type TrustSafetySeverity,
} from '@/hooks/useAdminControlPlane';
import { cn } from '@/lib/utils';

function dt(value?: string | null) {
  if (!value) return '—';
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
  } catch {
    return value;
  }
}

function priorityBadge(priority: TrustSafetyPriority) {
  if (priority === 'critical') return <Badge variant="destructive">Critical</Badge>;
  if (priority === 'high') return <Badge variant="outline" className="border-amber-500/40 text-amber-700 dark:text-amber-400">High</Badge>;
  if (priority === 'low') return <Badge variant="secondary">Low</Badge>;
  return <Badge variant="outline">Normal</Badge>;
}

function severityBadge(severity: TrustSafetySeverity) {
  if (severity === 'critical') return <Badge variant="destructive">Critical</Badge>;
  if (severity === 'high') return <Badge variant="outline" className="border-amber-500/40 text-amber-700 dark:text-amber-400">High</Badge>;
  return <Badge variant="secondary">{severity === 'medium' ? 'Medium' : 'Low'}</Badge>;
}

function Metric({
  title,
  value,
  detail,
  icon: Icon,
  attention,
}: {
  title: string;
  value: number;
  detail: string;
  icon: typeof ShieldCheck;
  attention?: boolean;
}) {
  return (
    <Card className={cn('shadow-sm', attention && value > 0 && 'border-amber-500/30')}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium text-muted-foreground">{title}</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums">{value.toLocaleString()}</p>
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

export default function AdminTrustSafetyPage() {
  const { user } = useAuth();
  const { isAdmin, isLoading: accessLoading, hasPermission } = useAdminAccess();
  const canView =
    hasPermission('admin.trust_safety.view') ||
    hasPermission('reports.view') ||
    hasPermission('reports.review');
  const canManage =
    hasPermission('admin.trust_safety.manage') ||
    hasPermission('reports.review');
  const canApprove =
    hasPermission('admin.enforcement.approve') ||
    hasPermission('admin.trust_safety.manage');
  const canExecute =
    hasPermission('admin.enforcement.execute') ||
    hasPermission('admin.trust_safety.manage');
  const { snapshot, loading, error, refresh } = useTrustSafetyControl(isAdmin && canView);
  const {
    snapshot: enforcementSnapshot,
    loading: enforcementLoading,
    error: enforcementError,
    refresh: refreshEnforcement,
  } = useEnforcementQueue(isAdmin && canView);

  const [tab, setTab] = useState('reports');
  const [selectedReportIds, setSelectedReportIds] = useState<string[]>([]);
  const [bulkPriority, setBulkPriority] = useState<TrustSafetyPriority>('high');
  const [bulkReason, setBulkReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [caseTarget, setCaseTarget] = useState<ModerationCase | null>(null);
  const [caseForm, setCaseForm] = useState({
    status: 'investigating',
    priority: 'normal' as TrustSafetyPriority,
    severity: 'medium' as TrustSafetySeverity,
    summary: '',
    policyCode: '',
  });
  const [decisionOpen, setDecisionOpen] = useState(false);
  const [decisionForm, setDecisionForm] = useState({
    decision: 'violation',
    policyCode: '',
    rationale: '',
    actionType: 'warning',
    actionHours: '',
  });
  const [appealTarget, setAppealTarget] = useState<ModerationAppeal | null>(null);
  const [appealForm, setAppealForm] = useState({
    decision: 'upheld' as 'upheld' | 'overturned' | 'modified',
    note: '',
  });
  const [caseDetail, setCaseDetail] = useState<AdminCaseDetail | null>(null);
  const [caseDetailLoading, setCaseDetailLoading] = useState(false);
  const [enforcementTarget, setEnforcementTarget] = useState<EnforcementAction | null>(null);
  const [enforcementMode, setEnforcementMode] = useState<'approve' | 'reject' | 'execute'>('approve');
  const [enforcementNote, setEnforcementNote] = useState('');

  const selectedSet = useMemo(() => new Set(selectedReportIds), [selectedReportIds]);
  const allVisibleSelected =
    snapshot.reports.length > 0 && snapshot.reports.every((item) => selectedSet.has(item.id));

  if (accessLoading) {
    return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin" /></div>;
  }
  if (!isAdmin || !canView) return <Navigate to="/admin" replace />;

  const toggleReport = (id: string) => {
    setSelectedReportIds((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );
  };

  const openCase = (item: ModerationCase) => {
    setCaseTarget(item);
    setCaseDetail(null);
    setCaseDetailLoading(true);
    void fetchAdminCaseDetail(item.id)
      .then(setCaseDetail)
      .catch((caught: any) => toast.error(caught?.message || 'Case timeline yuklanmadi'))
      .finally(() => setCaseDetailLoading(false));
    setCaseForm({
      status: item.status,
      priority: item.priority,
      severity: item.severity,
      summary: item.summary || '',
      policyCode: item.policy_code || '',
    });
  };

  const createCase = async (report: TrustSafetyReport) => {
    setBusy(true);
    try {
      await createCaseFromReport(
        report.id,
        report.priority === 'critical' ? 'critical' : report.priority === 'high' ? 'high' : 'medium',
      );
      toast.success('Report case’ga aylantirildi');
      await refresh();
      setTab('cases');
    } catch (caught: any) {
      toast.error(caught?.message || 'Case yaratilmadi');
    } finally {
      setBusy(false);
    }
  };

  const saveCase = async () => {
    if (!caseTarget) return;
    setBusy(true);
    try {
      await updateModerationCase({
        caseId: caseTarget.id,
        status: caseForm.status as ModerationCase['status'],
        priority: caseForm.priority,
        severity: caseForm.severity,
        summary: caseForm.summary,
        policyCode: caseForm.policyCode,
      });
      toast.success('Case yangilandi');
      setCaseTarget(null);
      await refresh();
    } catch (caught: any) {
      toast.error(caught?.message || 'Case yangilanmadi');
    } finally {
      setBusy(false);
    }
  };

  const decideCase = async () => {
    if (!caseTarget || decisionForm.rationale.trim().length < 3) return;
    setBusy(true);
    try {
      await decideModerationCase({
        caseId: caseTarget.id,
        decision: decisionForm.decision as 'no_violation' | 'violation' | 'needs_more_info' | 'escalate',
        policyCode: decisionForm.policyCode || null,
        rationale: decisionForm.rationale.trim(),
        actionType:
          decisionForm.decision === 'violation' && decisionForm.actionType !== 'none'
            ? decisionForm.actionType
            : null,
        actionHours: decisionForm.actionHours ? Number(decisionForm.actionHours) : null,
      });
      toast.success('Moderation qarori audit bilan saqlandi');
      setDecisionOpen(false);
      setCaseTarget(null);
      setDecisionForm({
        decision: 'violation',
        policyCode: '',
        rationale: '',
        actionType: 'warning',
        actionHours: '',
      });
      await refresh();
    } catch (caught: any) {
      toast.error(caught?.message || 'Qarorni saqlab bo‘lmadi');
    } finally {
      setBusy(false);
    }
  };

  const reviewAppeal = async () => {
    if (!appealTarget || appealForm.note.trim().length < 3) return;
    setBusy(true);
    try {
      await reviewModerationAppeal({
        appealId: appealTarget.id,
        decision: appealForm.decision,
        note: appealForm.note.trim(),
      });
      toast.success('Appeal qarori audit bilan saqlandi');
      setAppealTarget(null);
      setAppealForm({ decision: 'upheld', note: '' });
      await refresh();
    } catch (caught: any) {
      toast.error(caught?.message || 'Appealni ko‘rib chiqib bo‘lmadi');
    } finally {
      setBusy(false);
    }
  };

  const openEnforcementAction = (
    item: EnforcementAction,
    mode: 'approve' | 'reject' | 'execute',
  ) => {
    setEnforcementTarget(item);
    setEnforcementMode(mode);
    setEnforcementNote('');
  };

  const submitEnforcementAction = async () => {
    if (!enforcementTarget || enforcementNote.trim().length < 3) return;
    setBusy(true);
    try {
      if (enforcementMode === 'execute') {
        await executeEnforcement(enforcementTarget.id, enforcementNote.trim());
        toast.success('Enforcement canonical platform state’ga qo‘llandi');
      } else {
        await reviewEnforcement({
          actionId: enforcementTarget.id,
          decision: enforcementMode === 'approve' ? 'approved' : 'rejected',
          note: enforcementNote.trim(),
        });
        toast.success(
          enforcementMode === 'approve'
            ? 'Independent approval saqlandi'
            : 'Enforcement rad etildi',
        );
      }
      setEnforcementTarget(null);
      setEnforcementNote('');
      await Promise.all([refresh(), refreshEnforcement()]);
      if (caseTarget) {
        setCaseDetail(await fetchAdminCaseDetail(caseTarget.id));
      }
    } catch (caught: any) {
      const message = String(caught?.message || '');
      if (message.includes('four_eyes_creator_cannot_approve')) {
        toast.error('Action yaratuvchisi o‘z enforcementini tasdiqlay olmaydi.');
      } else if (message.includes('super_admin_approval_required')) {
        toast.error('Permanent disable uchun boshqa super admin approval kerak.');
      } else {
        toast.error(message || 'Enforcement action bajarilmadi');
      }
    } finally {
      setBusy(false);
    }
  };

  const refreshAll = async () => {
    await Promise.all([refresh(), refreshEnforcement()]);
  };

  const runBulk = async (action: 'dismiss' | 'mark_in_review' | 'set_priority') => {
    if (!selectedReportIds.length) return;
    if (action === 'dismiss' && bulkReason.trim().length < 3) {
      toast.error('Bulk dismiss uchun sabab kiriting');
      return;
    }
    setBusy(true);
    try {
      const count = await bulkTriageReports({
        reportIds: selectedReportIds,
        action,
        priority: action === 'set_priority' ? bulkPriority : undefined,
        reason: bulkReason.trim() || undefined,
      });
      toast.success(String(count) + ' ta report yangilandi');
      setSelectedReportIds([]);
      setBulkReason('');
      await refresh();
    } catch (caught: any) {
      toast.error(caught?.message || 'Bulk action bajarilmadi');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-[1580px] space-y-5 p-3 pb-12 md:p-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border bg-card shadow-sm">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Trust & Safety</h1>
              <Badge variant="outline" className="rounded-full font-normal">Case management</Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Report → case → evidence → decision → enforcement → appeal lifecycle.
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
              <p className="font-semibold">Trust & Safety snapshot yuklanmadi</p>
              <p className="truncate text-muted-foreground">{error}</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => void refresh()}>Qayta urinish</Button>
          </CardContent>
        </Card>
      )}

      {enforcementError && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="flex items-center gap-3 p-4 text-sm">
            <AlertTriangle className="h-5 w-5 shrink-0 text-destructive" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold">Enforcement queue yuklanmadi</p>
              <p className="truncate text-muted-foreground">{enforcementError}</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => void refreshEnforcement()}>
              Qayta urinish
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <Metric title="Open reports" value={snapshot.counts.reports_open} detail="triage kutmoqda" icon={FileWarning} attention />
        <Metric title="In review" value={snapshot.counts.reports_in_review} detail="case / operator ishida" icon={UserRoundCheck} />
        <Metric title="Open cases" value={snapshot.counts.cases_open} detail="faol investigation" icon={ClipboardList} attention />
        <Metric title="Overdue" value={snapshot.counts.cases_overdue} detail="SLA muddatidan o‘tgan" icon={Clock3} attention />
        <Metric title="Appeals" value={snapshot.counts.appeals_open} detail="ko‘rib chiqish navbati" icon={Scale} attention />
        <Metric
          title="Enforcement"
          value={enforcementSnapshot.actions.length}
          detail="approval / execution navbati"
          icon={Gavel}
          attention
        />
      </div>

      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <div className="flex flex-col gap-3 rounded-2xl border bg-card p-2 shadow-sm lg:flex-row lg:items-center lg:justify-between">
          <TabsList className="grid h-auto w-full grid-cols-5 gap-1 bg-muted/50 p-1 lg:w-auto lg:min-w-[780px]">
            <TabsTrigger value="reports" className="rounded-lg py-2">Reports</TabsTrigger>
            <TabsTrigger value="cases" className="rounded-lg py-2">Cases</TabsTrigger>
            <TabsTrigger value="enforcement" className="rounded-lg py-2">Enforcement</TabsTrigger>
            <TabsTrigger value="appeals" className="rounded-lg py-2">Appeals</TabsTrigger>
            <TabsTrigger value="policies" className="rounded-lg py-2">Policies</TabsTrigger>
          </TabsList>
          <Button
            variant="outline"
            size="sm"
            disabled={loading || enforcementLoading}
            onClick={() => void refreshAll()}
          >
            <RefreshCw className={cn('mr-2 h-4 w-4', (loading || enforcementLoading) && 'animate-spin')} />
            Yangilash
          </Button>
        </div>

        <TabsContent value="reports" className="m-0 space-y-4">
          {canManage && selectedReportIds.length > 0 && (
            <Card className="border-primary/20 shadow-sm">
              <CardContent className="flex flex-col gap-3 p-4 xl:flex-row xl:items-center">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{selectedReportIds.length} ta report tanlandi</p>
                  <p className="text-xs text-muted-foreground">Bulk triage 100 tagacha reportda audit bilan ishlaydi.</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Select value={bulkPriority} onValueChange={(value) => setBulkPriority(value as TrustSafetyPriority)}>
                    <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="normal">Normal</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="critical">Critical</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    value={bulkReason}
                    onChange={(event) => setBulkReason(event.target.value)}
                    placeholder="Sabab / triage note"
                    className="min-w-[220px] flex-1 xl:w-[280px]"
                  />
                  <Button variant="outline" disabled={busy} onClick={() => void runBulk('set_priority')}>Priority</Button>
                  <Button variant="outline" disabled={busy} onClick={() => void runBulk('mark_in_review')}>In review</Button>
                  <Button variant="destructive" disabled={busy} onClick={() => void runBulk('dismiss')}>Dismiss</Button>
                </div>
              </CardContent>
            </Card>
          )}

          <Card className="overflow-hidden shadow-sm">
            <CardHeader className="border-b bg-muted/10">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-base">Universal report queue</CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Post, user, message va marketplace reportlari bitta canonical queue’da.
                  </p>
                </div>
                {canManage && (
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={(event) =>
                        setSelectedReportIds(event.target.checked ? snapshot.reports.map((item) => item.id) : [])
                      }
                    />
                    Barchasi
                  </label>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="flex min-h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>
              ) : snapshot.reports.length === 0 ? (
                <div className="flex min-h-64 flex-col items-center justify-center p-8 text-center">
                  <CheckCircle2 className="mb-3 h-8 w-8 text-emerald-600" />
                  <p className="font-semibold">Open report yo‘q</p>
                  <p className="mt-1 text-sm text-muted-foreground">Triage navbati hozir toza.</p>
                </div>
              ) : (
                <div className="divide-y">
                  {snapshot.reports.map((report) => (
                    <div key={report.id} className="grid gap-3 p-4 xl:grid-cols-[28px_minmax(0,1fr)_150px_170px_auto] xl:items-center">
                      <div>
                        {canManage && (
                          <input
                            type="checkbox"
                            checked={selectedSet.has(report.id)}
                            onChange={() => toggleReport(report.id)}
                            aria-label="Reportni tanlash"
                          />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold">{report.reason_code}</p>
                          {priorityBadge(report.priority)}
                          <Badge variant="outline" className="rounded-full text-[10px] font-normal">{report.target_type}</Badge>
                          {report.linked_to_case && <Badge variant="secondary">Case linked</Badge>}
                        </div>
                        <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                          {report.description || 'Qo‘shimcha tavsif yo‘q.'}
                        </p>
                        <p className="mt-2 text-[11px] text-muted-foreground">
                          {report.source_surface || report.legacy_source || 'unknown'} · {dt(report.created_at)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Target</p>
                        <p className="mt-1 truncate font-mono text-xs">{report.target_id}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Reporter</p>
                        <p className="mt-1 truncate text-sm">@{report.reporter_username || 'unknown'}</p>
                      </div>
                      {canManage && (
                        <Button
                          size="sm"
                          variant={report.linked_to_case ? 'outline' : 'default'}
                          disabled={busy || report.linked_to_case}
                          onClick={() => void createCase(report)}
                        >
                          {report.linked_to_case ? 'Case mavjud' : 'Case ochish'}
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="cases" className="m-0">
          <Card className="overflow-hidden shadow-sm">
            <CardHeader className="border-b bg-muted/10">
              <CardTitle className="text-base">Investigation cases</CardTitle>
              <p className="text-sm text-muted-foreground">SLA, assignment, evidence va decision lifecycle.</p>
            </CardHeader>
            <CardContent className="p-0">
              {snapshot.cases.length === 0 ? (
                <div className="p-12 text-center text-sm text-muted-foreground">Case hali yo‘q.</div>
              ) : (
                <div className="divide-y">
                  {snapshot.cases.map((item) => {
                    const overdue =
                      Boolean(item.due_at) &&
                      !['resolved', 'dismissed'].includes(item.status) &&
                      new Date(item.due_at as string).getTime() < Date.now();
                    return (
                      <button
                        key={item.id}
                        type="button"
                        disabled={!canManage}
                        onClick={() => canManage && openCase(item)}
                        className="grid w-full gap-3 p-4 text-left transition hover:bg-muted/25 disabled:cursor-default xl:grid-cols-[minmax(0,1fr)_130px_150px_180px]"
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-semibold">#{item.case_number} · {item.title}</p>
                            {severityBadge(item.severity)}
                            {priorityBadge(item.priority)}
                            {overdue && <Badge variant="destructive">Overdue</Badge>}
                          </div>
                          <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{item.summary || '—'}</p>
                          <p className="mt-2 text-[11px] text-muted-foreground">
                            {item.report_count} report · {item.evidence_count} evidence · {item.decision_count} decision
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Status</p>
                          <p className="mt-1 text-sm">{item.status.replace('_', ' ')}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Assignee</p>
                          <p className="mt-1 truncate text-sm">{item.assigned_name || item.assigned_username || 'Unassigned'}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">SLA</p>
                          <p className={cn('mt-1 text-sm', overdue && 'font-semibold text-destructive')}>{dt(item.due_at)}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="appeals" className="m-0">
          <Card className="overflow-hidden shadow-sm">
            <CardHeader className="border-b bg-muted/10">
              <CardTitle className="text-base">Appeal queue</CardTitle>
              <p className="text-sm text-muted-foreground">Enforcement qarorlariga yuborilgan qayta ko‘rib chiqish so‘rovlari.</p>
            </CardHeader>
            <CardContent className="p-0">
              {snapshot.appeals.length === 0 ? (
                <div className="p-12 text-center text-sm text-muted-foreground">Open appeal yo‘q.</div>
              ) : (
                <div className="divide-y">
                  {snapshot.appeals.map((appeal) => (
                    <div key={appeal.id} className="grid gap-3 p-4 xl:grid-cols-[minmax(0,1fr)_180px_180px_auto] xl:items-center">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold">{appeal.action_type}</p>
                          <Badge variant="outline">{appeal.status}</Badge>
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">{appeal.reason}</p>
                        <p className="mt-2 text-[11px] text-muted-foreground">@{appeal.appellant_username || 'user'} · {dt(appeal.created_at)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Target</p>
                        <p className="mt-1 text-sm">{appeal.target_type}</p>
                        <p className="truncate font-mono text-[11px] text-muted-foreground">{appeal.target_id}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Enforcement</p>
                        <p className="mt-1 text-sm">{appeal.enforcement_status}</p>
                      </div>
                      {canManage && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setAppealTarget(appeal);
                            setAppealForm({ decision: 'upheld', note: '' });
                          }}
                        >
                          Review
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={Boolean(appealTarget)} onOpenChange={(open) => !open && setAppealTarget(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Appeal review</DialogTitle>
            <DialogDescription>
              Qaror enforcement ledger va immutable auditga yoziladi. Overturn qilingan action reverted holatiga o‘tadi.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Decision</Label>
              <Select
                value={appealForm.decision}
                onValueChange={(value) =>
                  setAppealForm((current) => ({
                    ...current,
                    decision: value as 'upheld' | 'overturned' | 'modified',
                  }))
                }
              >
                <SelectTrigger className="mt-2"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="upheld">Upheld</SelectItem>
                  <SelectItem value="overturned">Overturned</SelectItem>
                  <SelectItem value="modified">Modified</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Decision note</Label>
              <Textarea
                className="mt-2"
                rows={4}
                value={appealForm.note}
                onChange={(event) => setAppealForm((current) => ({ ...current, note: event.target.value }))}
                placeholder="Dalil, policy va qaror sababini yozing."
              />
            </div>
            {appealForm.decision === 'modified' && (
              <div className="flex gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <p>Modified qaror executionni avtomatik o‘zgartirmaydi; action manual modification flag bilan belgilanadi.</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAppealTarget(null)}>Bekor qilish</Button>
            <Button disabled={busy || appealForm.note.trim().length < 3} onClick={() => void reviewAppeal()}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Qarorni saqlash
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(caseTarget)} onOpenChange={(open) => !open && setCaseTarget(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Case #{caseTarget?.case_number}</DialogTitle>
            <DialogDescription>
              Assignment, severity, SLA holati va policy metadata audit bilan saqlanadi.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <Label>Status</Label>
                <Select value={caseForm.status} onValueChange={(value) => setCaseForm((current) => ({ ...current, status: value }))}>
                  <SelectTrigger className="mt-2"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">Open</SelectItem>
                    <SelectItem value="investigating">Investigating</SelectItem>
                    <SelectItem value="pending_action">Pending action</SelectItem>
                    <SelectItem value="resolved">Resolved</SelectItem>
                    <SelectItem value="dismissed">Dismissed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Priority</Label>
                <Select value={caseForm.priority} onValueChange={(value) => setCaseForm((current) => ({ ...current, priority: value as TrustSafetyPriority }))}>
                  <SelectTrigger className="mt-2"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Severity</Label>
                <Select value={caseForm.severity} onValueChange={(value) => setCaseForm((current) => ({ ...current, severity: value as TrustSafetySeverity }))}>
                  <SelectTrigger className="mt-2"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Policy code</Label>
              <Input className="mt-2 font-mono" value={caseForm.policyCode} onChange={(event) => setCaseForm((current) => ({ ...current, policyCode: event.target.value }))} placeholder="ABUSE.HARASSMENT.01" />
            </div>
            <div>
              <Label>Case summary</Label>
              <Textarea className="mt-2" rows={4} value={caseForm.summary} onChange={(event) => setCaseForm((current) => ({ ...current, summary: event.target.value }))} />
            </div>
          </div>
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button variant="outline" onClick={() => setCaseTarget(null)}>Bekor qilish</Button>
            <Button variant="outline" onClick={() => setDecisionOpen(true)}>
              <Gavel className="mr-2 h-4 w-4" />Qaror chiqarish
            </Button>
            <Button disabled={busy} onClick={() => void saveCase()}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Saqlash
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={decisionOpen} onOpenChange={setDecisionOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Moderation qarori</DialogTitle>
            <DialogDescription>
              Enforcement action hozir pending_execution sifatida ledgerga yoziladi; execution alohida boshqariladi.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Decision</Label>
              <Select value={decisionForm.decision} onValueChange={(value) => setDecisionForm((current) => ({ ...current, decision: value }))}>
                <SelectTrigger className="mt-2"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="violation">Violation</SelectItem>
                  <SelectItem value="no_violation">No violation</SelectItem>
                  <SelectItem value="needs_more_info">Needs more info</SelectItem>
                  <SelectItem value="escalate">Escalate</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Policy code</Label>
              <Input className="mt-2 font-mono" value={decisionForm.policyCode} onChange={(event) => setDecisionForm((current) => ({ ...current, policyCode: event.target.value }))} />
            </div>
            <div>
              <Label>Rationale</Label>
              <Textarea className="mt-2" rows={4} value={decisionForm.rationale} onChange={(event) => setDecisionForm((current) => ({ ...current, rationale: event.target.value }))} />
            </div>
            {decisionForm.decision === 'violation' && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label>Enforcement plan</Label>
                  <Select value={decisionForm.actionType} onValueChange={(value) => setDecisionForm((current) => ({ ...current, actionType: value }))}>
                    <SelectTrigger className="mt-2"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No action</SelectItem>
                      <SelectItem value="warning">Warning</SelectItem>
                      <SelectItem value="remove_content">Remove content</SelectItem>
                      <SelectItem value="feature_limit">Feature limit</SelectItem>
                      <SelectItem value="temporary_suspend">Temporary suspend</SelectItem>
                      <SelectItem value="permanent_disable">Permanent disable</SelectItem>
                      <SelectItem value="demonetize">Demonetize</SelectItem>
                      <SelectItem value="age_restrict">Age restrict</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Duration hours</Label>
                  <Input className="mt-2" type="number" min={1} value={decisionForm.actionHours} onChange={(event) => setDecisionForm((current) => ({ ...current, actionHours: event.target.value }))} placeholder="Optional" />
                </div>
              </div>
            )}
            <div className="flex gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <p>Permanent disable va boshqa yuqori risk actionlar execution bosqichida qo‘shimcha approval talab qilishi kerak.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDecisionOpen(false)}>Bekor qilish</Button>
            <Button disabled={busy || decisionForm.rationale.trim().length < 3} onClick={() => void decideCase()}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Qarorni saqlash
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
