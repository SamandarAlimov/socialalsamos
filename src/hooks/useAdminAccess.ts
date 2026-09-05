import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export function useAdminAccess() {
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [roles, setRoles] = useState<string[]>([]);
  const [permissions, setPermissions] = useState<string[]>([]);

  const refreshAccess = useCallback(async () => {
    if (!user) {
      setIsAdmin(false);
      setRoles([]);
      setPermissions([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      // Prefer normalized RBAC. All calls are best-effort so deployments that
      // have not received the RBAC migration yet keep working through legacy
      // user_roles instead of locking founders out of the console.
      const [staffResult, assignmentResult, legacyResult] = await Promise.all([
        (supabase as any).rpc('is_admin_staff', { _user_id: user.id }),
        (supabase as any)
          .from('admin_role_assignments')
          .select('role_key')
          .eq('user_id', user.id)
          .is('revoked_at', null),
        supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', user.id)
          .eq('role', 'admin')
          .maybeSingle(),
      ]);

      const roleKeys = !assignmentResult?.error && Array.isArray(assignmentResult?.data)
        ? Array.from(new Set(assignmentResult.data.map((row: any) => String(row.role_key)).filter(Boolean)))
        : [];
      const legacyAdmin = !legacyResult.error && Boolean(legacyResult.data);
      const staffFromRpc = !staffResult?.error && Boolean(staffResult?.data);
      const staff = staffFromRpc || roleKeys.length > 0 || legacyAdmin;

      let permissionKeys: string[] = [];
      if (roleKeys.includes('super_admin') || legacyAdmin) {
        permissionKeys = ['*'];
      } else if (roleKeys.length > 0) {
        const permissionResult = await (supabase as any)
          .from('admin_role_permissions')
          .select('permission_key')
          .in('role_key', roleKeys);
        if (!permissionResult?.error && Array.isArray(permissionResult?.data)) {
          permissionKeys = Array.from(
            new Set(permissionResult.data.map((row: any) => String(row.permission_key)).filter(Boolean)),
          );
        }
      }

      setRoles(roleKeys.length ? roleKeys : legacyAdmin ? ['legacy_admin'] : []);
      setPermissions(permissionKeys);
      setIsAdmin(staff);
    } catch (err) {
      console.error('Error checking admin status:', err);

      // Last-resort compatibility query. This path matters during staged DB
      // migrations and should disappear only after legacy user_roles retires.
      try {
        const { data } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', user.id)
          .eq('role', 'admin')
          .maybeSingle();
        const legacyAdmin = Boolean(data);
        setIsAdmin(legacyAdmin);
        setRoles(legacyAdmin ? ['legacy_admin'] : []);
        setPermissions(legacyAdmin ? ['*'] : []);
      } catch {
        setIsAdmin(false);
        setRoles([]);
        setPermissions([]);
      }
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void refreshAccess();
  }, [refreshAccess]);

  const hasPermission = useCallback(
    (permissionKey: string) => permissions.includes('*') || permissions.includes(permissionKey),
    [permissions],
  );

  const primaryRole = useMemo(() => {
    if (roles.includes('super_admin')) return 'super_admin';
    return roles[0] || null;
  }, [roles]);

  const grantAdminRole = useCallback(async (userId: string) => {
    if (!user || !isAdmin || !hasPermission('admin.roles.manage')) return { error: 'Not authorized' };

    // New RBAC first. Founders/super admins can grant super_admin explicitly
    // through the dedicated team UI later; this compatibility action grants a
    // platform admin role without silently elevating beyond the caller's intent.
    const v2 = await (supabase as any).rpc('grant_admin_role_v2', {
      p_target_user_id: userId,
      p_role_key: 'super_admin',
    });
    if (!v2?.error) {
      await refreshAccess();
      return { error: undefined };
    }

    const { error } = await supabase
      .from('user_roles')
      .insert({
        user_id: userId,
        role: 'admin',
        granted_by: user.id,
      });

    return { error: error?.message };
  }, [hasPermission, isAdmin, refreshAccess, user]);

  const revokeAdminRole = useCallback(async (userId: string) => {
    if (!user || !isAdmin || !hasPermission('admin.roles.manage')) return { error: 'Not authorized' };

    // Existing team UI historically manages legacy admins. Keep that behavior
    // as a fallback while role-specific revoke UI is introduced.
    const { error } = await supabase
      .from('user_roles')
      .delete()
      .eq('user_id', userId)
      .eq('role', 'admin');

    return { error: error?.message };
  }, [hasPermission, isAdmin, user]);

  return {
    isAdmin,
    isLoading,
    roles,
    permissions,
    primaryRole,
    hasPermission,
    refreshAccess,
    grantAdminRole,
    revokeAdminRole,
  };
}
