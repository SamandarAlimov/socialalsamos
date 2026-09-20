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
