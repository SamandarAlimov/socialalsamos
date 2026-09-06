import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { db } from '@/lib/db';

export type AdminAccountStatus = 'active' | 'suspended' | 'banned' | 'deactivated' | 'deletion_pending';

export interface AdminUserRow {
  user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  is_verified: boolean;
  is_online: boolean;
  last_seen: string | null;
  country: string | null;
  created_at: string | null;
  followers_count: number;
  following_count: number;
  posts_count: number;
  account_status: AdminAccountStatus;
  status_reason: string | null;
  suspended_until: string | null;
  roles: string[];
  total_count: number;
}

export interface AdminUserDetails {
  profile: Record<string, any>;
  account: {
    status: AdminAccountStatus;
    reason: string | null;
    suspended_until: string | null;
    changed_at: string | null;
    roles: string[];
    protected: boolean;
  };
  counts: {
    posts: number;
    comments: number;
    followers: number;
    following: number;
    mailbox_aliases: number;
    scheduled_emails: number;
    audit_events: number;
  };
}

export interface AdminAuthUser {
  id: string;
  email: string | null;
  phone: string | null;
  email_confirmed_at: string | null;
  phone_confirmed_at: string | null;
  confirmed_at: string | null;
  last_sign_in_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  banned_until: string | null;
  is_anonymous: boolean;
  providers: string[];
}

export interface AdminAuditEvent {
  id: string;
  actor_id: string | null;
  action: string;
  reason: string | null;
  before_state: Record<string, unknown>;
  after_state: Record<string, unknown>;
  metadata: Record<string, unknown>;
  created_at: string;
}

function isMissingRpc(error: any) {
  const text = `${error?.code ?? ''} ${error?.message ?? ''}`.toLowerCase();
  return text.includes('pgrst202') || text.includes('42883') || text.includes('could not find the function');
}

export function useAdminUsers(search: string, status: string, page: number, pageSize = 30) {
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [schemaReady, setSchemaReady] = useState(true);
  const [total, setTotal] = useState(0);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    const result = await db.rpc('admin_list_users_v3', {
      p_search: search.trim() || null,
      p_status: status === 'all' ? null : status,
      p_limit: pageSize,
      p_offset: Math.max(0, page * pageSize),
    });

    if (!result.error && Array.isArray(result.data)) {
      const rows = result.data as AdminUserRow[];
      setUsers(rows);
      setTotal(Number(rows[0]?.total_count ?? 0));
      setSchemaReady(true);
      setIsLoading(false);
      return;
    }

    if (!isMissingRpc(result.error)) {
      setError(result.error?.message || 'Foydalanuvchilarni yuklab bo‘lmadi');
      setUsers([]);
      setTotal(0);
      setIsLoading(false);
      return;
    }

    // Pre-migration compatibility: safe public profile fields only.
    setSchemaReady(false);
    let query = supabase
      .from('profiles')
      .select('id, username, display_name, avatar_url, is_verified, is_online, last_seen, country, created_at, followers_count, following_count, posts_count', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(page * pageSize, page * pageSize + pageSize - 1);
    if (search.trim()) {
      const escaped = search.trim().replace(/[%_,]/g, '');
      query = query.or(`username.ilike.%${escaped}%,display_name.ilike.%${escaped}%`);
    }
    const fallback = await query;
    if (fallback.error) {
      setError('Admin Control Center migratsiyasi hali run qilinmagan.');
      setUsers([]);
      setTotal(0);
    } else {
      setUsers((fallback.data || []).map((row: any) => ({
        user_id: row.id,
        username: row.username,
        display_name: row.display_name,
        avatar_url: row.avatar_url,
        is_verified: Boolean(row.is_verified),
        is_online: Boolean(row.is_online),
        last_seen: row.last_seen,
        country: row.country,
        created_at: row.created_at,
        followers_count: Number(row.followers_count || 0),
        following_count: Number(row.following_count || 0),
        posts_count: Number(row.posts_count || 0),
        account_status: 'active',
        status_reason: null,
        suspended_until: null,
        roles: [],
        total_count: fallback.count || 0,
      })));
      setTotal(fallback.count || 0);
    }
    setIsLoading(false);
  }, [page, pageSize, search, status]);

  useEffect(() => { void refresh(); }, [refresh]);

  return { users, total, isLoading, error, schemaReady, refresh };
}

export async function getAdminUserDetails(userId: string): Promise<AdminUserDetails | null> {
  const { data, error } = await db.rpc('admin_get_user_details_v3', { p_user_id: userId });
  if (error) throw error;
  return (data as AdminUserDetails | null) ?? null;
}

export async function getAdminAuthUser(userId: string): Promise<AdminAuthUser | null> {
  const { data, error } = await supabase.functions.invoke('admin-user-control', {
    body: { action: 'get_auth_user', target_user_id: userId },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.message || data.error);
  return data?.user ?? null;
}

export async function updateAdminUserProfile(userId: string, patch: Record<string, unknown>, reason: string) {
  const { data, error } = await db.rpc('admin_update_user_profile_v3', {
    p_user_id: userId,
    p_patch: patch,
    p_reason: reason,
  });
  if (error) throw error;
  return data;
}

export async function setAdminUserStatus(
  userId: string,
  status: AdminAccountStatus,
  reason: string,
  suspendedUntil?: string | null,
) {
  const { data, error } = await db.rpc('admin_set_user_account_status_v3', {
    p_user_id: userId,
    p_status: status,
    p_reason: reason,
    p_suspended_until: suspendedUntil ?? null,
  });
  if (error) throw error;
  return data;
}

export async function runAdminAuthAction(
  action: 'update_email' | 'ban' | 'unban' | 'delete_user',
  userId: string,
  body: Record<string, unknown>,
) {
  const { data, error } = await supabase.functions.invoke('admin-user-control', {
    body: { action, target_user_id: userId, ...body },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.message || data.error);
  return data;
}

export async function getAdminUserAudit(userId: string): Promise<AdminAuditEvent[]> {
  const { data, error } = await db.rpc('admin_user_audit_v3', { p_user_id: userId, p_limit: 50 });
  if (error) throw error;
  return (data || []) as AdminAuditEvent[];
}
