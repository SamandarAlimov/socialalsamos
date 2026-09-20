import { useCallback, useEffect, useMemo, useState } from 'react';

import { supabase } from '@/integrations/supabase/client';

export type TrustSafetyPriority = 'low' | 'normal' | 'high' | 'critical';
export type TrustSafetySeverity = 'low' | 'medium' | 'high' | 'critical';
export type ModerationCaseStatus = 'open' | 'investigating' | 'pending_action' | 'resolved' | 'dismissed';

export interface TrustSafetyReport {
  id: string;
  reporter_id: string | null;
  target_type: string;
  target_id: string;
  reason_code: string;
  subreason_code: string | null;
  description: string | null;
  source_surface: string | null;
  priority: TrustSafetyPriority;
  status: 'open' | 'in_review' | 'resolved' | 'dismissed';
  legacy_source: string | null;
  created_at: string;
  updated_at: string;
  reporter_username?: string | null;
  reporter_name?: string | null;
  linked_to_case: boolean;
}

export interface ModerationCase {
  id: string;
  case_number: number;
  case_type: string;
  subject_type: string;
  subject_id: string;
  title: string;
  summary: string | null;
  severity: TrustSafetySeverity;
  priority: TrustSafetyPriority;
  status: ModerationCaseStatus;
  assigned_team: string;
  assigned_admin_id: string | null;
  policy_code: string | null;
  opened_at: string;
  due_at: string | null;
  resolved_at: string | null;
  updated_at: string;
  sla_state?: 'on_track' | 'at_risk' | 'breached' | 'resolved';
  sla_escalation_level?: number;
  sla_last_evaluated_at?: string | null;
  escalated_at?: string | null;
  assigned_username?: string | null;
  assigned_name?: string | null;
  report_count: number;
  evidence_count: number;
  decision_count: number;
}

export interface ModerationAppeal {
  id: string;
  enforcement_action_id: string;
  appellant_id: string | null;
  reason: string;
  status: string;
  assigned_admin_id: string | null;
  decision_note: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  appellant_username?: string | null;
  action_type: string;
  target_type: string;
  target_id: string;
  enforcement_status: string;
}

export interface TrustSafetySnapshot {
  generated_at?: string;
  counts: {
    reports_open: number;
    reports_in_review: number;
    cases_open: number;
    cases_overdue: number;
    appeals_open: number;
    pending_enforcement: number;
  };
  reports: TrustSafetyReport[];
  cases: ModerationCase[];
  appeals: ModerationAppeal[];
}

export interface RbacRole {
  key: string;
  label: string;
  description: string;
  rank: number;
  is_system: boolean;
  active_members: number;
  permission_count: number;
  implicit_all: boolean;
}

export interface RbacPermission {
  key: string;
  category: string;
  label: string;
  description: string;
  risk_level: 'low' | 'medium' | 'high' | 'critical';
  roles: string[];
}

export interface RbacMatrix {
  generated_at?: string;
  actor_super_admin: boolean;
  roles: RbacRole[];
  permissions: RbacPermission[];
}

export interface QueueHealth {
  key: string;
  label: string;
  pending: number;
  failed: number;
  oldest_at: string | null;
}

export interface AdminAuditEvent {
  id: string;
  actor_id: string | null;
  target_user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  reason: string | null;
  before_state: Record<string, unknown>;
  after_state: Record<string, unknown>;
  metadata: Record<string, unknown>;
  created_at: string;
  actor_username?: string | null;
  actor_name?: string | null;
}

export interface SystemControlSnapshot {
  generated_at?: string;
  database: { size_bytes: number; connections: number };
  queues: QueueHealth[];
  security: {
    devices_total: number;
    devices_active: number;
    devices_revoked: number;
    sessions_24h: number;
    security_events_24h: number;
    failed_logins_24h: number;
  };
  governance: {
    audit_24h: number;
    admins_active: number;
    roles: number;
    permissions: number;
    unread_notifications: number;
  };
  recent_audit: AdminAuditEvent[];
}

export interface AdminDevice {
  id: string;
  label: string | null;
  user_agent: string | null;
  ip_masked: string | null;
  created_at: string;
  last_seen_at: string;
  revoked_at: string | null;
  revoked_reason: string | null;
}

export interface AdminSession {
  id: string;
  device_name: string | null;
  device_type: string | null;
  platform: string | null;
  device_model: string | null;
  os_name: string | null;
  os_version: string | null;
  browser_name: string | null;
  app_name: string | null;
  app_version: string | null;
  location_city: string | null;
  location_country: string | null;
  ip_masked: string | null;
  is_current: boolean | null;
  created_at: string;
  last_active_at: string | null;
}

export interface AdminSecurityEvent {
  id: string;
  event_type: string;
  description: string;
  created_at: string | null;
}

export interface UserSecuritySnapshot {
  user: {
    id: string;
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
  } | null;
  devices: AdminDevice[];
  sessions: AdminSession[];
  security_events: AdminSecurityEvent[];
}

export interface AdminNotification {
  id: string;
  kind: string;
  severity: 'info' | 'warning' | 'high' | 'critical';
  title: string;
  body: string | null;
  action_url: string | null;
  entity_type: string | null;
  entity_id: string | null;
  created_at: string;
  is_read: boolean;
}

export interface ModerationPolicy {
  code: string;
  title: string;
  category: string;
  description: string;
  severity_default: TrustSafetySeverity;
  default_action: string | null;
  execution_mode: 'automatic' | 'manual';
  requires_independent_approval: boolean;
  required_approvals: number;
  default_duration_hours: number | null;
  allowed_target_types: string[];
  active: boolean;
  created_at: string;
  updated_at: string;
}

export type EnforcementStatus =
  | 'awaiting_approval'
  | 'pending_execution'
  | 'executing'
  | 'applied'
  | 'failed'
  | 'reverted'
  | 'rejected';

export interface EnforcementApproval {
  id: string;
  enforcement_action_id: string;
  approver_id: string;
  decision: 'approved' | 'rejected';
  note: string;
  created_at: string;
  approver_username?: string | null;
  approver_name?: string | null;
}

export interface EnforcementExecutionEvent {
  id: string;
  enforcement_action_id: string;
  actor_id: string | null;
  event_type: string;
  detail: Record<string, unknown>;
  created_at: string;
  actor_username?: string | null;
  actor_name?: string | null;
}

export interface EnforcementAction {
  id: string;
  case_id: string | null;
  case_number?: number | null;
  case_title?: string | null;
  target_type: string;
  target_id: string;
  action_type: string;
  status: EnforcementStatus;
  starts_at: string;
  ends_at: string | null;
  created_by: string | null;
  created_at: string;
  approved_at: string | null;
  executed_at: string | null;
  executed_by: string | null;
  failure_reason: string | null;
  required_approvals: number;
  approved_count?: number;
  policy_code: string | null;
  execution_result?: Record<string, unknown>;
  retry_count?: number;
  last_retry_at?: string | null;
  created_username?: string | null;
  created_name?: string | null;
  creator_username?: string | null;
  creator_name?: string | null;
  executed_username?: string | null;
  executed_name?: string | null;
  approvals?: EnforcementApproval[];
  events?: EnforcementExecutionEvent[];
}

export interface ModerationEvidence {
  id: string;
  case_id: string;
  evidence_type: string;
  object_type: string;
  object_id: string;
  snapshot_json: Record<string, unknown>;
  media_reference: string | null;
  captured_by: string | null;
  captured_at: string;
  metadata: Record<string, unknown>;
  captured_username?: string | null;
  captured_name?: string | null;
}

export interface ModerationDecision {
  id: string;
  case_id: string;
  decision: string;
  policy_code: string | null;
  rationale: string;
  decided_by: string | null;
  created_at: string;
  metadata: Record<string, unknown>;
  decided_username?: string | null;
  decided_name?: string | null;
}

export interface AdminCaseDetail {
  case: (ModerationCase & Record<string, unknown>) | null;
  reports: TrustSafetyReport[];
  evidence: ModerationEvidence[];
  decisions: ModerationDecision[];
  enforcement: EnforcementAction[];
}

export interface EnforcementQueueSnapshot {
  generated_at?: string;
  actions: EnforcementAction[];
  policies: ModerationPolicy[];
}

export interface EnforcementPreflightCheck {
  key: string;
  ok: boolean;
  label: string;
  detail: string;
}

export interface EnforcementPreflight {
  action_id: string;
  ready: boolean;
  status: EnforcementStatus;
  action_type: string;
  target_type: string;
  approved_count: number;
  required_approvals: number;
  policy_code: string | null;
  policy_revision_id: number | null;
  policy_revision_created_at: string | null;
  policy_snapshot: Record<string, unknown> | null;
  checks: EnforcementPreflightCheck[];
  checked_at: string;
}

export interface ModerationPolicyRevision {
  id: number;
  policy_code: string;
  snapshot: Record<string, unknown>;
  changed_by: string | null;
  change_reason: string;
  created_at: string;
  changed_username?: string | null;
  changed_name?: string | null;
}

export interface SlaCase {
  id: string;
  case_number: number;
  title: string;
  priority: TrustSafetyPriority;
  status: ModerationCaseStatus;
  due_at: string | null;
  sla_state: 'on_track' | 'at_risk' | 'breached' | 'resolved';
  sla_escalation_level: number;
  sla_last_evaluated_at: string | null;
  escalated_at: string | null;
}

export interface SlaEvent {
  id: string;
  case_id: string;
  event_type: 'at_risk' | 'breached' | 'recovered' | 'resolved';
  escalation_level: number;
  prior_priority: string | null;
  new_priority: string | null;
  due_at: string | null;
  observed_at: string;
  detail: Record<string, unknown>;
  case_number: number;
  title: string;
}

export interface SlaSnapshot {
  generated_at?: string;
  counts: {
    on_track: number;
    at_risk: number;
    breached: number;
  };
  cases: SlaCase[];
  events: SlaEvent[];
}

export interface SecurityPosture {
  checked_at?: string;
  audit_chain: {
    valid: boolean;
    rows_checked: number;
    head_hash?: string;
    first_invalid_id?: string;
    checked_at?: string;
  };
  rls_exposed_without_policy: number;
  security_definer_public_execute: number;
  country_resolution: {
    resolved: number;
    unknown: number;
    coverage_pct: number;
  };
  sla: {
    at_risk: number;
    breached: number;
  };
  enforcement: {
    failed: number;
    retry_requests: number;
  };
}

export interface AdminAuditExport {
  exported_at: string;
  chain: SecurityPosture['audit_chain'];
  events: Array<AdminAuditEvent & { prev_hash?: string | null; event_hash?: string | null }>;
}

const EMPTY_TRUST_SAFETY: TrustSafetySnapshot = {
  counts: {
    reports_open: 0,
    reports_in_review: 0,
    cases_open: 0,
    cases_overdue: 0,
    appeals_open: 0,
    pending_enforcement: 0,
  },
  reports: [],
  cases: [],
  appeals: [],
};

const EMPTY_SLA: SlaSnapshot = {
  counts: { on_track: 0, at_risk: 0, breached: 0 },
  cases: [],
  events: [],
};

const EMPTY_RBAC: RbacMatrix = {
  actor_super_admin: false,
  roles: [],
  permissions: [],
};

const EMPTY_SYSTEM: SystemControlSnapshot = {
  database: { size_bytes: 0, connections: 0 },
  queues: [],
  security: {
    devices_total: 0,
    devices_active: 0,
    devices_revoked: 0,
    sessions_24h: 0,
    security_events_24h: 0,
    failed_logins_24h: 0,
  },
  governance: {
    audit_24h: 0,
    admins_active: 0,
    roles: 0,
    permissions: 0,
    unread_notifications: 0,
  },
  recent_audit: [],
};

function rpc<T>(name: string, args?: Record<string, unknown>) {
  return (supabase as any).rpc(name, args) as Promise<{ data: T; error: any }>;
}

export function useTrustSafetyControl(enabled = true) {
  const [snapshot, setSnapshot] = useState<TrustSafetySnapshot>(EMPTY_TRUST_SAFETY);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const { data, error: rpcError } = await rpc<TrustSafetySnapshot>('admin_trust_safety_snapshot_v1', { p_limit: 180 });
    if (rpcError) {
      setError(rpcError.message || 'Trust & Safety ma’lumotlarini yuklab bo‘lmadi');
    } else {
      setSnapshot({
        ...EMPTY_TRUST_SAFETY,
        ...(data || {}),
        counts: { ...EMPTY_TRUST_SAFETY.counts, ...(data?.counts || {}) },
        reports: Array.isArray(data?.reports) ? data.reports : [],
        cases: Array.isArray(data?.cases) ? data.cases : [],
        appeals: Array.isArray(data?.appeals) ? data.appeals : [],
      });
    }
    setLoading(false);
  }, [enabled]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { snapshot, loading, error, refresh };
}

export function useSlaControl(enabled = true) {
  const [snapshot, setSnapshot] = useState<SlaSnapshot>(EMPTY_SLA);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error: rpcError } = await rpc<SlaSnapshot>('admin_sla_snapshot_v1', {
      p_limit: 100,
    });
    if (rpcError) {
      setError(rpcError.message || 'SLA snapshot yuklanmadi');
    } else {
      setError(null);
      setSnapshot({
        generated_at: data?.generated_at,
        counts: { ...EMPTY_SLA.counts, ...(data?.counts || {}) },
        cases: Array.isArray(data?.cases) ? data.cases : [],
        events: Array.isArray(data?.events) ? data.events : [],
      });
    }
    setLoading(false);
  }, [enabled]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { snapshot, loading, error, refresh };
}

export function useRbacMatrix(enabled = true) {
  const [matrix, setMatrix] = useState<RbacMatrix>(EMPTY_RBAC);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error: rpcError } = await rpc<RbacMatrix>('admin_rbac_matrix_v1');
    if (rpcError) {
      setError(rpcError.message || 'RBAC matrixni yuklab bo‘lmadi');
    } else {
      setError(null);
      setMatrix({
        ...EMPTY_RBAC,
        ...(data || {}),
        roles: Array.isArray(data?.roles) ? data.roles : [],
        permissions: Array.isArray(data?.permissions) ? data.permissions : [],
      });
    }
    setLoading(false);
  }, [enabled]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const categories = useMemo(
    () => Array.from(new Set(matrix.permissions.map((permission) => permission.category))),
    [matrix.permissions],
  );

  return { matrix, categories, loading, error, refresh };
}

export function useEnforcementQueue(enabled = true) {
  const [snapshot, setSnapshot] = useState<EnforcementQueueSnapshot>({
    actions: [],
    policies: [],
  });
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error: rpcError } = await rpc<EnforcementQueueSnapshot>(
      'admin_enforcement_queue_v1',
      { p_limit: 180 },
    );
    if (rpcError) {
      setError(rpcError.message || 'Enforcement queue yuklanmadi');
    } else {
      setError(null);
      setSnapshot({
        generated_at: data?.generated_at,
        actions: Array.isArray(data?.actions) ? data.actions : [],
        policies: Array.isArray(data?.policies) ? data.policies : [],
      });
    }
    setLoading(false);
  }, [enabled]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { snapshot, loading, error, refresh };
}

export function useSystemControl(enabled = true) {
  const [snapshot, setSnapshot] = useState<SystemControlSnapshot>(EMPTY_SYSTEM);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error: rpcError } = await rpc<SystemControlSnapshot>('admin_system_control_snapshot_v4');
    if (rpcError) {
      setError(rpcError.message || 'System snapshot yuklanmadi');
    } else {
      setError(null);
      setSnapshot({
        ...EMPTY_SYSTEM,
        ...(data || {}),
        database: { ...EMPTY_SYSTEM.database, ...(data?.database || {}) },
        security: { ...EMPTY_SYSTEM.security, ...(data?.security || {}) },
        governance: { ...EMPTY_SYSTEM.governance, ...(data?.governance || {}) },
        queues: Array.isArray(data?.queues) ? data.queues : [],
        recent_audit: Array.isArray(data?.recent_audit) ? data.recent_audit : [],
      });
    }
    setLoading(false);
  }, [enabled]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { snapshot, loading, error, refresh };
}

export async function createCaseFromReport(reportId: string, severity?: TrustSafetySeverity) {
  const { data, error } = await rpc<string>('admin_create_case_from_report_v1', {
    p_report_id: reportId,
    p_assigned_to: null,
    p_severity: severity || null,
  });
  if (error) throw error;
  return data;
}

export async function updateModerationCase(input: {
  caseId: string;
  status?: ModerationCaseStatus;
  priority?: TrustSafetyPriority;
  severity?: TrustSafetySeverity;
  assignedAdminId?: string | null;
  summary?: string | null;
  policyCode?: string | null;
}) {
  const { data, error } = await rpc<ModerationCase>('admin_update_case_v1', {
    p_case_id: input.caseId,
    p_status: input.status || null,
    p_priority: input.priority || null,
    p_severity: input.severity || null,
    p_assigned_admin_id: input.assignedAdminId || null,
    p_summary: input.summary ?? null,
    p_policy_code: input.policyCode ?? null,
  });
  if (error) throw error;
  return data;
}

export async function decideModerationCase(input: {
  caseId: string;
  decision: 'no_violation' | 'violation' | 'needs_more_info' | 'escalate';
  policyCode?: string | null;
  rationale: string;
  actionType?: string | null;
  actionHours?: number | null;
}) {
  const { data, error } = await rpc<Record<string, unknown>>('admin_decide_case_v1', {
    p_case_id: input.caseId,
    p_decision: input.decision,
    p_policy_code: input.policyCode || null,
    p_rationale: input.rationale,
    p_action_type: input.actionType || null,
    p_action_hours: input.actionHours || null,
  });
  if (error) throw error;
  return data;
}

export async function bulkTriageReports(input: {
  reportIds: string[];
  action: 'dismiss' | 'reopen' | 'set_priority' | 'mark_in_review';
  priority?: TrustSafetyPriority;
  reason?: string;
}) {
  const { data, error } = await rpc<number>('admin_bulk_triage_reports_v1', {
    p_report_ids: input.reportIds,
    p_action: input.action,
    p_priority: input.priority || null,
    p_reason: input.reason || null,
  });
  if (error) throw error;
  return Number(data || 0);
}

export async function setRolePermission(input: {
  roleKey: string;
  permissionKey: string;
  enabled: boolean;
  reason: string;
}) {
  const { data, error } = await rpc<boolean>('admin_set_role_permission_v1', {
    p_role_key: input.roleKey,
    p_permission_key: input.permissionKey,
    p_enabled: input.enabled,
    p_reason: input.reason,
  });
  if (error) throw error;
  return Boolean(data);
}

export async function fetchUserSecuritySnapshot(userId: string) {
  const { data, error } = await rpc<UserSecuritySnapshot>('admin_user_security_snapshot_v1', {
    p_user_id: userId,
  });
  if (error) throw error;
  return {
    user: data?.user || null,
    devices: Array.isArray(data?.devices) ? data.devices : [],
    sessions: Array.isArray(data?.sessions) ? data.sessions : [],
    security_events: Array.isArray(data?.security_events) ? data.security_events : [],
  } satisfies UserSecuritySnapshot;
}

export async function revokeDeviceTrust(deviceId: string, reason: string) {
  const { data, error } = await rpc<boolean>('admin_revoke_device_trust_v1', {
    p_device_id: deviceId,
    p_reason: reason,
  });
  if (error) throw error;
  return Boolean(data);
}

export async function fetchAuditEventDetail(eventId: string) {
  const { data, error } = await rpc<AdminAuditEvent>('admin_audit_event_detail_v1', {
    p_event_id: eventId,
  });
  if (error) throw error;
  return data;
}

export async function fetchAdminNotifications(limit = 120) {
  const { data, error } = await rpc<AdminNotification[]>('admin_notification_inbox_v1', {
    p_limit: limit,
  });
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

export async function markAdminNotificationRead(notificationId: string, read = true) {
  const { data, error } = await rpc<boolean>('admin_mark_notification_read_v1', {
    p_notification_id: notificationId,
    p_read: read,
  });
  if (error) throw error;
  return Boolean(data);
}


export async function reviewModerationAppeal(input: {
  appealId: string;
  decision: 'upheld' | 'overturned' | 'modified';
  note: string;
}) {
  const { data, error } = await rpc<Record<string, unknown>>('admin_review_appeal_v1', {
    p_appeal_id: input.appealId,
    p_decision: input.decision,
    p_note: input.note,
  });
  if (error) throw error;
  return data;
}

export async function markAllAdminNotificationsRead() {
  const { data, error } = await rpc<number>('admin_mark_all_notifications_read_v1');
  if (error) throw error;
  return Number(data || 0);
}


export async function fetchAdminCaseDetail(caseId: string) {
  const { data, error } = await rpc<AdminCaseDetail>('admin_case_detail_v1', {
    p_case_id: caseId,
  });
  if (error) throw error;
  return {
    case: data?.case || null,
    reports: Array.isArray(data?.reports) ? data.reports : [],
    evidence: Array.isArray(data?.evidence) ? data.evidence : [],
    decisions: Array.isArray(data?.decisions) ? data.decisions : [],
    enforcement: Array.isArray(data?.enforcement) ? data.enforcement : [],
  } satisfies AdminCaseDetail;
}

export async function fetchEnforcementPreflight(actionId: string) {
  const { data, error } = await rpc<EnforcementPreflight>(
    'admin_enforcement_preflight_v1',
    { p_action_id: actionId },
  );
  if (error) throw error;
  return {
    ...data,
    checks: Array.isArray(data?.checks) ? data.checks : [],
  } satisfies EnforcementPreflight;
}

export async function fetchModerationPolicyHistory(code: string, limit = 25) {
  const { data, error } = await rpc<ModerationPolicyRevision[]>(
    'admin_policy_revision_history_v1',
    {
      p_code: code,
      p_limit: limit,
    },
  );
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

export async function retryEnforcement(actionId: string, reason: string) {
  const { data, error } = await rpc<Record<string, unknown>>('admin_retry_enforcement_v1', {
    p_action_id: actionId,
    p_reason: reason,
  });
  if (error) throw error;
  return data;
}

export async function fetchSecurityPosture() {
  const { data, error } = await rpc<SecurityPosture>('admin_security_posture_v1');
  if (error) throw error;
  return data;
}

export async function exportAdminAudit(limit = 1000) {
  const { data, error } = await rpc<AdminAuditExport>('admin_audit_export_v1', {
    p_from: null,
    p_to: null,
    p_limit: limit,
  });
  if (error) throw error;
  return data;
}

export async function reviewEnforcement(input: {
  actionId: string;
  decision: 'approved' | 'rejected';
  note: string;
}) {
  const { data, error } = await rpc<Record<string, unknown>>(
    'admin_review_enforcement_v1',
    {
      p_action_id: input.actionId,
      p_decision: input.decision,
      p_note: input.note,
    },
  );
  if (error) throw error;
  return data;
}

export async function executeEnforcement(actionId: string, reason: string) {
  const { data, error } = await rpc<Record<string, unknown>>(
    'admin_execute_enforcement_v1',
    {
      p_action_id: actionId,
      p_reason: reason,
    },
  );
  if (error) throw error;
  return data;
}

export async function revertEnforcement(actionId: string, reason: string) {
  const { data, error } = await rpc<Record<string, unknown>>(
    'admin_revert_enforcement_v1',
    {
      p_action_id: actionId,
      p_reason: reason,
    },
  );
  if (error) throw error;
  return data;
}

export async function updateModerationPolicy(input: {
  code: string;
  description: string;
  defaultAction: string | null;
  requiredApprovals: number;
  defaultDurationHours: number | null;
  active: boolean;
  reason: string;
}) {
  const { data, error } = await rpc<ModerationPolicy>(
    'admin_update_moderation_policy_v1',
    {
      p_code: input.code,
      p_description: input.description,
      p_default_action: input.defaultAction,
      p_required_approvals: input.requiredApprovals,
      p_default_duration_hours: input.defaultDurationHours,
      p_active: input.active,
      p_reason: input.reason,
    },
  );
  if (error) throw error;
  return data;
}
