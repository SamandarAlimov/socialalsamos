import { useCallback, useEffect, useState } from 'react';

import { supabase } from '@/integrations/supabase/client';

export type AdminIncidentSeverity = 'low' | 'medium' | 'high' | 'critical';
export type AdminIncidentStatus = 'open' | 'investigating' | 'mitigated' | 'resolved';

export interface AdminIncident {
  id: string;
  title: string;
  summary: string | null;
  severity: AdminIncidentSeverity;
  status: AdminIncidentStatus;
  area: string;
  source: string;
  resolution_note: string | null;
  created_by: string | null;
  assigned_to: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  created_by_username?: string | null;
  assigned_to_username?: string | null;
  assigned_to_name?: string | null;
}

export interface AdminFeatureFlag {
  key: string;
  description: string | null;
  enabled: boolean;
  min_version: string | null;
  platforms: string[];
  rollout_percentage: number;
  updated_at: string;
  updated_by: string | null;
}

export interface AdminFeatureFlagHistory {
  id: string;
  flag_key: string;
  changed_by: string | null;
  before_state: Record<string, unknown>;
  after_state: Record<string, unknown>;
  reason: string | null;
  created_at: string;
  changed_by_username?: string | null;
}

export interface AdminOperationsAuditRow {
  id: string;
  actor_id: string | null;
  target_user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  reason: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  actor_username?: string | null;
  actor_name?: string | null;
}

export interface AdminRateLimitScope {
  scope: string;
  event_count: number;
}

export interface AdminOperationsSnapshot {
  generated_at?: string;
  queues: {
    verification_pending: number;
    reports_open: number;
    incidents_open: number;
    incidents_critical: number;
  };
  security: {
    failed_logins_24h: number;
    rate_limit_events_24h: number;
    suspended_accounts: number;
    banned_accounts: number;
  };
  governance: {
    audit_events_24h: number;
    feature_flags_total: number;
    feature_flags_enabled: number;
  };
  incidents: AdminIncident[];
  feature_flags: AdminFeatureFlag[];
  feature_flag_history: AdminFeatureFlagHistory[];
  recent_audit: AdminOperationsAuditRow[];
  rate_limit_scopes: AdminRateLimitScope[];
}

export interface AdminEntityNote {
  id: string;
  body: string;
  pinned: boolean;
  created_by: string | null;
  created_by_username: string | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
}

const EMPTY_SNAPSHOT: AdminOperationsSnapshot = {
  queues: {
    verification_pending: 0,
    reports_open: 0,
    incidents_open: 0,
    incidents_critical: 0,
  },
  security: {
    failed_logins_24h: 0,
    rate_limit_events_24h: 0,
    suspended_accounts: 0,
    banned_accounts: 0,
  },
  governance: {
    audit_events_24h: 0,
    feature_flags_total: 0,
    feature_flags_enabled: 0,
  },
  incidents: [],
  feature_flags: [],
  feature_flag_history: [],
  recent_audit: [],
  rate_limit_scopes: [],
};

function normalizeSnapshot(value: unknown): AdminOperationsSnapshot {
  const data = value && typeof value === 'object' ? (value as Partial<AdminOperationsSnapshot>) : {};
  return {
    ...EMPTY_SNAPSHOT,
    ...data,
    queues: { ...EMPTY_SNAPSHOT.queues, ...(data.queues || {}) },
    security: { ...EMPTY_SNAPSHOT.security, ...(data.security || {}) },
    governance: { ...EMPTY_SNAPSHOT.governance, ...(data.governance || {}) },
    incidents: Array.isArray(data.incidents) ? data.incidents : [],
    feature_flags: Array.isArray(data.feature_flags) ? data.feature_flags : [],
    feature_flag_history: Array.isArray(data.feature_flag_history) ? data.feature_flag_history : [],
    recent_audit: Array.isArray(data.recent_audit) ? data.recent_audit : [],
    rate_limit_scopes: Array.isArray(data.rate_limit_scopes) ? data.rate_limit_scopes : [],
  };
}

export function useAdminOperations(enabled = true) {
  const [snapshot, setSnapshot] = useState<AdminOperationsSnapshot>(EMPTY_SNAPSHOT);
  const [isLoading, setIsLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const { data, error: rpcError } = await (supabase as any).rpc('admin_operations_snapshot_v1');
      if (rpcError) throw rpcError;
      setSnapshot(normalizeSnapshot(data));
    } catch (caught: any) {
      console.error('Admin operations snapshot failed:', caught);
      setError(caught?.message || 'Operations ma’lumotlarini yuklab bo‘lmadi');
    } finally {
      setIsLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { snapshot, isLoading, error, refresh };
}

export async function createAdminIncident(input: {
  title: string;
  summary?: string | null;
  severity: AdminIncidentSeverity;
  area: string;
  assignedTo?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const { data, error } = await (supabase as any).rpc('admin_create_incident_v1', {
    p_title: input.title,
    p_summary: input.summary || null,
    p_severity: input.severity,
    p_area: input.area,
    p_assigned_to: input.assignedTo || null,
    p_metadata: input.metadata || {},
  });
  if (error) throw error;
  return String(data);
}

export async function updateAdminIncident(input: {
  incidentId: string;
  status?: AdminIncidentStatus | null;
  severity?: AdminIncidentSeverity | null;
  assignedTo?: string | null;
  resolutionNote?: string | null;
}) {
  const { data, error } = await (supabase as any).rpc('admin_update_incident_v1', {
    p_incident_id: input.incidentId,
    p_status: input.status || null,
    p_severity: input.severity || null,
    p_assigned_to: input.assignedTo || null,
    p_resolution_note: input.resolutionNote ?? null,
  });
  if (error) throw error;
  return data as AdminIncident;
}

export async function setAdminFeatureFlag(input: {
  key: string;
  enabled: boolean;
  rolloutPercentage: number;
  description?: string | null;
  platforms?: string[] | null;
  minVersion?: string | null;
  reason: string;
}) {
  const { data, error } = await (supabase as any).rpc('admin_set_feature_flag_v1', {
    p_key: input.key,
    p_enabled: input.enabled,
    p_rollout_percentage: input.rolloutPercentage,
    p_description: input.description ?? null,
    p_platforms: input.platforms ?? null,
    p_min_version: input.minVersion ?? null,
    p_reason: input.reason,
  });
  if (error) throw error;
  return data as AdminFeatureFlag;
}

export async function listAdminEntityNotes(
  entityType: string,
  entityId: string,
  limit = 50,
): Promise<AdminEntityNote[]> {
  const { data, error } = await (supabase as any).rpc('admin_list_entity_notes_v1', {
    p_entity_type: entityType,
    p_entity_id: entityId,
    p_limit: limit,
  });
  if (error) throw error;
  return (data || []) as AdminEntityNote[];
}

export async function addAdminEntityNote(input: {
  entityType: string;
  entityId: string;
  body: string;
  pinned?: boolean;
}) {
  const { data, error } = await (supabase as any).rpc('admin_add_entity_note_v1', {
    p_entity_type: input.entityType,
    p_entity_id: input.entityId,
    p_body: input.body,
    p_pinned: Boolean(input.pinned),
  });
  if (error) throw error;
  return String(data);
}

export async function deleteAdminEntityNote(noteId: string, reason: string) {
  const { data, error } = await (supabase as any).rpc('admin_delete_entity_note_v1', {
    p_note_id: noteId,
    p_reason: reason,
  });
  if (error) throw error;
  return Boolean(data);
}
