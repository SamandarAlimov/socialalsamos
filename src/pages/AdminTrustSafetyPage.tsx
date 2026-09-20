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
  Settings2,
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
  updateModerationPolicy,
  useEnforcementQueue,
  useTrustSafetyControl,
  type AdminCaseDetail,
  type EnforcementAction,
  type ModerationAppeal,
  type ModerationPolicy,
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

function enforcementStatusBadge(status: EnforcementAction['status']) {
  if (status === 'awaiting_approval') {
    return <Badge variant="outline" className="border-amber-500/40 text-amber-700 dark:text-amber-400">Approval kerak</Badge>;
  }
  if (status === 'pending_execution') {
    return <Badge variant="outline" className="border-blue-500/40 text-blue-700 dark:text-blue-400">Ready to execute</Badge>;
  }
  if (status === 'failed' || status === 'rejected') {
    return <Badge variant="destructive">{status === 'failed' ? 'Failed' : 'Rejected'}</Badge>;
  }
  if (status === 'applied') return <Badge className="bg-emerald-600 hover:bg-emerald-600">Applied</Badge>;
  if (status === 'reverted') return <Badge variant="secondary">Reverted</Badge>;
  return <Badge variant="outline">{status.replace('_', ' ')}</Badge>;
}

function actionLabel(action: string) {
  return action.replaceAll('_', ' ').replace(/\b\w/g, (value) => value.toUpperCase());
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
  const canManagePolicies = hasPermission('admin.policy.manage');
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
  const [policyTarget, setPolicyTarget] = useState<ModerationPolicy | null>(null);
  const [policyForm, setPolicyForm] = useState({
    description: '',
    defaultAction: 'none',
    requiredApprovals: '1',
    defaultDurationHours: '',
    active: true,
    reason: '',
  });

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

  const openPolicy = (policy: ModerationPolicy) => {
    setPolicyTarget(policy);
    setPolicyForm({
      description: policy.description,
      defaultAction: policy.default_action || 'none',
      requiredApprovals: String(policy.required_approvals),
      defaultDurationHours: policy.default_duration_hours ? String(policy.default_duration_hours) : '',
      active: policy.active,
      reason: '',
    });
  };

  const savePolicy = async () => {
    if (!policyTarget || policyForm.reason.trim().length < 3) return;
    setBusy(true);
    try {
      await updateModerationPolicy({
        code: policyTarget.code,
        description: policyForm.description,
        defaultAction: policyForm.defaultAction === 'none' ? null : policyForm.defaultAction,
        requiredApprovals: Math.max(0, Math.min(3, Number(policyForm.requiredApprovals || 0))),
        defaultDurationHours: policyForm.defaultDurationHours
          ? Number(policyForm.defaultDurationHours)
          : null,
        active: policyForm.active,
        reason: policyForm.reason.trim(),
      });
      toast.success('Policy catalog yangilandi va auditga yozildi');
      setPolicyTarget(null);
      await refreshEnforcement();
    } catch (caught: any) {
      toast.error(caught?.message || 'Policy yangilanmadi');
    } finally {
      setBusy(false);
    }
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

        <TabsContent value="enforcement" className="m-0 space-y-4">
          <Card className="border-primary/20 bg-primary/[0.02] shadow-sm">
            <CardContent className="grid gap-3 p-4 md:grid-cols-3">
              <div className="rounded-xl border bg-background p-3">
                <p className="text-xs font-medium text-muted-foreground">Four-eyes guard</p>
                <p className="mt-1 text-sm font-semibold">Creator o‘z actionini approve qila olmaydi</p>
              </div>
              <div className="rounded-xl border bg-background p-3">
                <p className="text-xs font-medium text-muted-foreground">Permanent disable</p>
                <p className="mt-1 text-sm font-semibold">Independent super admin approval</p>
              </div>
              <div className="rounded-xl border bg-background p-3">
                <p className="text-xs font-medium text-muted-foreground">Automatic executor</p>
                <p className="mt-1 text-sm font-semibold">Warning · remove · suspend · disable</p>
              </div>
            </CardContent>
          </Card>

          <Card className="overflow-hidden shadow-sm">
            <CardHeader className="border-b bg-muted/10">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-base">Enforcement approval & execution queue</CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Decision va real platform mutation alohida bosqichlarda, immutable audit bilan ishlaydi.
                  </p>
                </div>
                <Badge variant="outline">{enforcementSnapshot.actions.length} action</Badge>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {enforcementLoading ? (
                <div className="flex min-h-64 items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : enforcementSnapshot.actions.length === 0 ? (
                <div className="flex min-h-64 flex-col items-center justify-center p-8 text-center">
                  <CheckCircle2 className="mb-3 h-8 w-8 text-emerald-600" />
                  <p className="font-semibold">Enforcement queue toza</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Approval yoki execution kutayotgan action yo‘q.
                  </p>
                </div>
              ) : (
                <div className="divide-y">
                  {enforcementSnapshot.actions.map((action) => {
                    const ownAction = Boolean(user?.id && action.created_by === user.id);
                    return (
                      <div
                        key={action.id}
                        className="grid gap-4 p-4 xl:grid-cols-[minmax(0,1fr)_180px_160px_auto] xl:items-center"
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-semibold">
                              {action.case_number ? '#' + action.case_number + ' · ' : ''}
                              {actionLabel(action.action_type)}
                            </p>
                            {enforcementStatusBadge(action.status)}
                            {action.action_type === 'permanent_disable' && (
                              <Badge variant="destructive">Critical</Badge>
                            )}
                          </div>
                          <p className="mt-1 truncate text-sm text-muted-foreground">
                            {action.case_title || action.target_type + ' enforcement'} · {action.target_type}
                          </p>
                          <p className="mt-2 font-mono text-[11px] text-muted-foreground">
                            {action.target_id}
                          </p>
                        </div>

                        <div>
                          <p className="text-xs text-muted-foreground">Approval</p>
                          <p className="mt-1 text-sm font-medium">
                            {Number(action.approved_count || 0)} / {action.required_approvals}
                          </p>
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            creator: @{action.creator_username || 'admin'}
                          </p>
                        </div>

                        <div>
                          <p className="text-xs text-muted-foreground">Created</p>
                          <p className="mt-1 text-sm">{dt(action.created_at)}</p>
                          {action.failure_reason && (
                            <p className="mt-1 line-clamp-2 text-[11px] text-destructive">
                              {action.failure_reason}
                            </p>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center justify-end gap-2">
                          {action.status === 'awaiting_approval' && canApprove && (
                            <>
                              {ownAction ? (
                                <Badge variant="secondary">Independent reviewer kerak</Badge>
                              ) : (
                                <>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => openEnforcementAction(action, 'reject')}
                                  >
                                    <XCircle className="mr-2 h-4 w-4" />
                                    Reject
                                  </Button>
                                  <Button
                                    size="sm"
                                    onClick={() => openEnforcementAction(action, 'approve')}
                                  >
                                    <CheckCheck className="mr-2 h-4 w-4" />
                                    Approve
                                  </Button>
                                </>
                              )}
                            </>
                          )}

                          {action.status === 'pending_execution' && canExecute && (
                            <Button
                              size="sm"
                              onClick={() => openEnforcementAction(action, 'execute')}
                            >
                              <PlayCircle className="mr-2 h-4 w-4" />
                              Execute
                            </Button>
                          )}

                          {action.case_id && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                const item = snapshot.cases.find((entry) => entry.id === action.case_id);
                                if (item) {
                                  openCase(item);
                                } else {
                                  toast.info('Case snapshotni yangilang va qayta oching.');
                                }
                              }}
                            >
                              <Eye className="mr-2 h-4 w-4" />
                              Case
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="policies" className="m-0">
          <Card className="overflow-hidden shadow-sm">
            <CardHeader className="border-b bg-muted/10">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-base">Moderation policy catalog</CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Enforcement defaults, target scope va independent approval thresholdlari.
                  </p>
                </div>
                <BookOpen className="h-5 w-5 text-muted-foreground" />
              </div>
            </CardHeader>
            <CardContent className="grid gap-3 p-4 lg:grid-cols-2 2xl:grid-cols-3">
              {enforcementSnapshot.policies.map((policy) => (
                <div key={policy.code} className="rounded-2xl border bg-card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <code className="text-[11px] font-semibold text-muted-foreground">{policy.code}</code>
                      <p className="mt-1 font-semibold">{policy.title}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      {severityBadge(policy.severity_default)}
                      {canManagePolicies && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 rounded-lg"
                          onClick={() => openPolicy(policy)}
                          aria-label={policy.title + ' policy sozlamalari'}
                        >
                          <Settings2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                  <p className="mt-3 min-h-10 text-sm leading-5 text-muted-foreground">
                    {policy.description}
                  </p>
                  <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-xl border p-2.5">
                      <p className="text-muted-foreground">Default action</p>
                      <p className="mt-1 font-medium">
                        {policy.default_action ? actionLabel(policy.default_action) : 'None'}
                      </p>
                    </div>
                    <div className="rounded-xl border p-2.5">
                      <p className="text-muted-foreground">Approvals</p>
                      <p className="mt-1 font-medium">{policy.required_approvals}</p>
                    </div>
                    <div className="col-span-2 rounded-xl border p-2.5">
                      <p className="text-muted-foreground">Targets</p>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {policy.allowed_target_types.map((target) => (
                          <Badge key={target} variant="outline" className="text-[10px]">
                            {target}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              {!enforcementLoading && enforcementSnapshot.policies.length === 0 && (
                <div className="col-span-full p-12 text-center text-sm text-muted-foreground">
                  Active policy topilmadi.
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

      <Dialog
        open={Boolean(policyTarget)}
        onOpenChange={(open) => {
          if (!open) setPolicyTarget(null);
        }}
      >
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Policy governance</DialogTitle>
            <DialogDescription>
              {policyTarget?.code} · super admin o‘zgarishlari immutable auditga yoziladi.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Description</Label>
              <Textarea
                className="mt-2"
                rows={4}
                value={policyForm.description}
                onChange={(event) => setPolicyForm((current) => ({ ...current, description: event.target.value }))}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Default action</Label>
                <Select
                  value={policyForm.defaultAction}
                  onValueChange={(value) => setPolicyForm((current) => ({ ...current, defaultAction: value }))}
                >
                  <SelectTrigger className="mt-2"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    <SelectItem value="warning">Warning</SelectItem>
                    <SelectItem value="remove_content">Remove content</SelectItem>
                    <SelectItem value="temporary_suspend">Temporary suspend</SelectItem>
                    <SelectItem value="permanent_disable">Permanent disable</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Independent approvals</Label>
                <Input
                  className="mt-2"
                  type="number"
                  min={0}
                  max={3}
                  value={policyForm.requiredApprovals}
                  onChange={(event) => setPolicyForm((current) => ({ ...current, requiredApprovals: event.target.value }))}
                />
              </div>
              <div>
                <Label>Default duration hours</Label>
                <Input
                  className="mt-2"
                  type="number"
                  min={1}
                  value={policyForm.defaultDurationHours}
                  onChange={(event) => setPolicyForm((current) => ({ ...current, defaultDurationHours: event.target.value }))}
                  placeholder="Optional"
                />
              </div>
              <div>
                <Label>Catalog state</Label>
                <Select
                  value={policyForm.active ? 'active' : 'inactive'}
                  onValueChange={(value) => setPolicyForm((current) => ({ ...current, active: value === 'active' }))}
                >
                  <SelectTrigger className="mt-2"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-muted-foreground">
              Destructive actionlar policy approval qiymati 0 bo‘lsa ham platform guard tomonidan kamida 1 independent approval bilan cheklanadi.
            </div>
            <div>
              <Label>Change reason</Label>
              <Textarea
                className="mt-2"
                rows={3}
                value={policyForm.reason}
                onChange={(event) => setPolicyForm((current) => ({ ...current, reason: event.target.value }))}
                placeholder="Nega policy o‘zgartirilmoqda?"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPolicyTarget(null)}>Bekor qilish</Button>
            <Button disabled={busy || policyForm.reason.trim().length < 3} onClick={() => void savePolicy()}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Saqlash
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(enforcementTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setEnforcementTarget(null);
            setEnforcementNote('');
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {enforcementMode === 'execute'
                ? 'Enforcementni ijro etish'
                : enforcementMode === 'approve'
                  ? 'Independent approval'
                  : 'Enforcementni rad etish'}
            </DialogTitle>
            <DialogDescription>
              {enforcementTarget
                ? actionLabel(enforcementTarget.action_type) + ' · ' + enforcementTarget.target_type
                : 'Enforcement action'}
            </DialogDescription>
          </DialogHeader>

          {enforcementTarget && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-xl border p-3">
                  <p className="text-muted-foreground">Status</p>
                  <div className="mt-2">{enforcementStatusBadge(enforcementTarget.status)}</div>
                </div>
                <div className="rounded-xl border p-3">
                  <p className="text-muted-foreground">Approval</p>
                  <p className="mt-2 font-semibold">
                    {Number(enforcementTarget.approved_count || 0)} / {enforcementTarget.required_approvals}
                  </p>
                </div>
              </div>

              {enforcementMode === 'approve' && (
                <div className="flex gap-3 rounded-xl border border-blue-500/30 bg-blue-500/5 p-3 text-sm">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
                  <p>
                    Siz action yaratuvchisidan mustaqil reviewer sifatida policy, evidence va targetni tekshirganingizni tasdiqlaysiz.
                  </p>
                </div>
              )}

              {enforcementMode === 'execute' && (
                <div className="flex gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
                  <PlayCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                  <p>
                    Bu bosqich real canonical state’ni o‘zgartiradi. Remove content soft-hide/delete qiladi; suspend va disable account control gate orqali bloklanadi.
                  </p>
                </div>
              )}

              <div>
                <Label>
                  {enforcementMode === 'execute' ? 'Execution reason' : 'Reviewer note'}
                </Label>
                <Textarea
                  className="mt-2"
                  rows={4}
                  value={enforcementNote}
                  onChange={(event) => setEnforcementNote(event.target.value)}
                  placeholder={
                    enforcementMode === 'execute'
                      ? 'Nega aynan hozir bu action ijro qilinmoqda?'
                      : 'Evidence va policy asosidagi qisqa izoh.'
                  }
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setEnforcementTarget(null)}>
              Bekor qilish
            </Button>
            <Button
              variant={enforcementMode === 'reject' ? 'destructive' : 'default'}
              disabled={busy || enforcementNote.trim().length < 3}
              onClick={() => void submitEnforcementAction()}
            >
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {enforcementMode === 'execute'
                ? 'Execute'
                : enforcementMode === 'approve'
                  ? 'Approve'
                  : 'Reject'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(caseTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setCaseTarget(null);
            setCaseDetail(null);
          }
        }}
      >
        <DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Case #{caseTarget?.case_number}</DialogTitle>
            <DialogDescription>
              Investigation metadata, evidence, decisions va enforcement timeline bitta audited workspace’da.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
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
                <Label>Policy</Label>
                <Select
                  value={caseForm.policyCode || 'none'}
                  onValueChange={(value) =>
                    setCaseForm((current) => ({ ...current, policyCode: value === 'none' ? '' : value }))
                  }
                >
                  <SelectTrigger className="mt-2"><SelectValue placeholder="Policy tanlang" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Policy biriktirilmagan</SelectItem>
                    {enforcementSnapshot.policies
                      .filter((policy) => !caseTarget || policy.allowed_target_types.includes(caseTarget.subject_type))
                      .map((policy) => (
                        <SelectItem key={policy.code} value={policy.code}>
                          {policy.code} · {policy.title}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Case summary</Label>
                <Textarea
                  className="mt-2"
                  rows={5}
                  value={caseForm.summary}
                  onChange={(event) => setCaseForm((current) => ({ ...current, summary: event.target.value }))}
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <Button disabled={busy} onClick={() => void saveCase()}>
                  {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Saqlash
                </Button>
                <Button variant="outline" onClick={() => setDecisionOpen(true)}>
                  <Gavel className="mr-2 h-4 w-4" />
                  Qaror chiqarish
                </Button>
              </div>
            </div>

            <div className="space-y-4 rounded-2xl border bg-muted/[0.12] p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-semibold">Evidence & action timeline</p>
                  <p className="text-xs text-muted-foreground">
                    Snapshotlar operatorlar uchun read-only ko‘rinishda.
                  </p>
                </div>
                <History className="h-4 w-4 text-muted-foreground" />
              </div>

              {caseDetailLoading ? (
                <div className="flex min-h-56 items-center justify-center">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
              ) : caseDetail ? (
                <div className="space-y-4">
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Evidence · {caseDetail.evidence.length}
                    </p>
                    <div className="space-y-2">
                      {caseDetail.evidence.map((evidence) => (
                        <details key={evidence.id} className="group rounded-xl border bg-background">
                          <summary className="cursor-pointer list-none p-3">
                            <div className="flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <p className="text-sm font-semibold">{actionLabel(evidence.evidence_type)}</p>
                                <p className="mt-1 truncate text-[11px] text-muted-foreground">
                                  {evidence.object_type}:{evidence.object_id} · {dt(evidence.captured_at)}
                                </p>
                              </div>
                              <Eye className="h-4 w-4 shrink-0 text-muted-foreground" />
                            </div>
                          </summary>
                          <pre className="max-h-72 overflow-auto border-t p-3 text-[10px] leading-5 text-muted-foreground">
                            {JSON.stringify(evidence.snapshot_json || {}, null, 2)}
                          </pre>
                        </details>
                      ))}
                      {caseDetail.evidence.length === 0 && (
                        <p className="rounded-xl border bg-background p-3 text-xs text-muted-foreground">
                          Evidence snapshot hali yo‘q.
                        </p>
                      )}
                    </div>
                  </div>

                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Decisions · {caseDetail.decisions.length}
                    </p>
                    <div className="space-y-2">
                      {caseDetail.decisions.map((decision) => (
                        <div key={decision.id} className="rounded-xl border bg-background p-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="outline">{actionLabel(decision.decision)}</Badge>
                            {decision.policy_code && <code className="text-[10px]">{decision.policy_code}</code>}
                          </div>
                          <p className="mt-2 text-sm">{decision.rationale}</p>
                          <p className="mt-2 text-[11px] text-muted-foreground">
                            @{decision.decided_username || 'admin'} · {dt(decision.created_at)}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Enforcement · {caseDetail.enforcement.length}
                    </p>
                    <div className="space-y-2">
                      {caseDetail.enforcement.map((action) => (
                        <div key={action.id} className="rounded-xl border bg-background p-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-semibold">{actionLabel(action.action_type)}</p>
                            {enforcementStatusBadge(action.status)}
                          </div>
                          <p className="mt-2 text-[11px] text-muted-foreground">
                            approval {action.approvals?.filter((item) => item.decision === 'approved').length || 0}
                            {' / '}{action.required_approvals} · created @{action.created_username || 'admin'}
                          </p>
                          {Boolean(action.approvals?.length) && (
                            <div className="mt-2 space-y-1 border-l pl-3">
                              {action.approvals?.map((approval) => (
                                <p key={approval.id} className="text-[11px] text-muted-foreground">
                                  {approval.decision} · @{approval.approver_username || 'admin'} · {approval.note}
                                </p>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <p className="rounded-xl border bg-background p-4 text-sm text-muted-foreground">
                  Timeline yuklanmagan.
                </p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCaseTarget(null)}>Yopish</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={decisionOpen} onOpenChange={setDecisionOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Moderation qarori</DialogTitle>
            <DialogDescription>
              Destructive action avval independent approval queue’ga tushadi. Threshold bajarilgachgina real executor ochiladi.
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
              <Label>Policy</Label>
              <Select
                value={decisionForm.policyCode || 'none'}
                onValueChange={(value) =>
                  setDecisionForm((current) => ({
                    ...current,
                    policyCode: value === 'none' ? '' : value,
                  }))
                }
              >
                <SelectTrigger className="mt-2"><SelectValue placeholder="Policy tanlang" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Policy tanlanmagan</SelectItem>
                  {enforcementSnapshot.policies
                    .filter((policy) => !caseTarget || policy.allowed_target_types.includes(caseTarget.subject_type))
                    .map((policy) => (
                      <SelectItem key={policy.code} value={policy.code}>
                        {policy.code} · {policy.title}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
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
                      <SelectItem value="temporary_suspend">Temporary suspend</SelectItem>
                      <SelectItem value="permanent_disable">Permanent disable</SelectItem>
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
              <p>Remove content, temporary suspend va permanent disable kamida bitta mustaqil approval talab qiladi. Permanent disable approvali super admin bilan cheklangan.</p>
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
