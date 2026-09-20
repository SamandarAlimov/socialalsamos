import { useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import {
  AlertTriangle,
  CheckCircle2,
  KeyRound,
  Loader2,
  RefreshCw,
  Shield,
  ShieldAlert,
  UsersRound,
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
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useAdminAccess } from '@/hooks/useAdminAccess';
import {
  setRolePermission,
  useRbacMatrix,
  type RbacPermission,
  type RbacRole,
} from '@/hooks/useAdminControlPlane';
import { cn } from '@/lib/utils';

const riskOrder: Record<RbacPermission['risk_level'], number> = {
  critical: 1,
  high: 2,
  medium: 3,
  low: 4,
};

function riskBadge(risk: RbacPermission['risk_level']) {
  if (risk === 'critical') return <Badge variant="destructive">Critical</Badge>;
  if (risk === 'high') {
    return <Badge variant="outline" className="border-amber-500/40 text-amber-700 dark:text-amber-400">High</Badge>;
  }
  if (risk === 'low') return <Badge variant="secondary">Low</Badge>;
  return <Badge variant="outline">Medium</Badge>;
}

export default function AdminAccessControlPage() {
  const { isAdmin, isLoading: accessLoading, hasPermission } = useAdminAccess();
  const canView = hasPermission('admin.roles.view') || hasPermission('admin.roles.manage');
  const { matrix, categories, loading, error, refresh } = useRbacMatrix(isAdmin && canView);

  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [change, setChange] = useState<{
    role: RbacRole;
    permission: RbacPermission;
    enabled: boolean;
  } | null>(null);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const visiblePermissions = useMemo(() => {
    const clean = query.trim().toLowerCase();
    return matrix.permissions
      .filter((permission) => category === 'all' || permission.category === category)
      .filter(
        (permission) =>
          !clean ||
          permission.key.toLowerCase().includes(clean) ||
          permission.label.toLowerCase().includes(clean) ||
          permission.description.toLowerCase().includes(clean),
      )
      .sort((a, b) => {
        const risk = riskOrder[a.risk_level] - riskOrder[b.risk_level];
        return risk || a.key.localeCompare(b.key);
      });
  }, [category, matrix.permissions, query]);

  if (accessLoading) {
    return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin" /></div>;
  }
  if (!isAdmin || !canView) return <Navigate to="/admin" replace />;

  const applyChange = async () => {
    if (!change || reason.trim().length < 3) return;
    setSaving(true);
    try {
      await setRolePermission({
        roleKey: change.role.key,
        permissionKey: change.permission.key,
        enabled: change.enabled,
        reason: reason.trim(),
      });
      toast.success(
        change.enabled
          ? change.permission.label + ' huquqi berildi'
          : change.permission.label + ' huquqi olib tashlandi',
      );
      setChange(null);
      setReason('');
      await refresh();
    } catch (caught: any) {
      toast.error(caught?.message || 'RBAC matrixni yangilab bo‘lmadi');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-[1680px] space-y-5 p-3 pb-12 md:p-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border bg-card shadow-sm">
            <KeyRound className="h-5 w-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Access Control</h1>
              <Badge variant="outline" className="rounded-full font-normal">Least privilege</Badge>
              {matrix.actor_super_admin && <Badge>Super admin</Badge>}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Role-permission matrix, risk classification va audited access governance.
            </p>
          </div>
        </div>
        <AdminControlNav />
      </div>

      {!matrix.actor_super_admin && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="flex gap-3 p-4 text-sm">
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div>
              <p className="font-semibold">Read-only RBAC view</p>
              <p className="text-muted-foreground">
                Permission matrixini o‘zgartirish faqat active super_admin uchun ochiq.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {error && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="flex items-center gap-3 p-4 text-sm">
            <AlertTriangle className="h-5 w-5 shrink-0 text-destructive" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold">RBAC matrix yuklanmadi</p>
              <p className="truncate text-muted-foreground">{error}</p>
            </div>
            <Button size="sm" variant="outline" onClick={() => void refresh()}>Qayta urinish</Button>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
        {matrix.roles.map((role) => (
          <Card key={role.key} className={cn('shadow-sm', role.key === 'super_admin' && 'border-primary/30')}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl border bg-muted/30">
                  {role.key === 'super_admin' ? <Shield className="h-4 w-4" /> : <UsersRound className="h-4 w-4" />}
                </div>
                <Badge variant="outline" className="rounded-full font-normal">rank {role.rank}</Badge>
              </div>
              <p className="mt-4 font-semibold">{role.label}</p>
              <p className="mt-1 min-h-10 text-xs leading-5 text-muted-foreground">{role.description}</p>
              <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-xl border p-2.5">
                  <p className="font-semibold tabular-nums">{role.active_members}</p>
                  <p className="text-muted-foreground">members</p>
                </div>
                <div className="rounded-xl border p-2.5">
                  <p className="font-semibold tabular-nums">
                    {role.implicit_all ? 'ALL' : role.permission_count}
                  </p>
                  <p className="text-muted-foreground">permissions</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="overflow-hidden shadow-sm">
        <CardHeader className="border-b bg-muted/10">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <CardTitle className="text-base">Permission matrix</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Critical permission o‘zgarishlari reason va immutable audit bilan bajariladi.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Permission qidirish..."
                className="sm:w-[260px]"
              />
              <select
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                aria-label="Permission category"
              >
                <option value="all">Barcha kategoriyalar</option>
                {categories.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
              <Button variant="outline" disabled={loading} onClick={() => void refresh()}>
                <RefreshCw className={cn('mr-2 h-4 w-4', loading && 'animate-spin')} />Yangilash
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1050px] text-sm">
              <thead className="border-b bg-muted/30 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="sticky left-0 z-10 min-w-[360px] bg-muted/95 px-4 py-3">Permission</th>
                  {matrix.roles.map((role) => (
                    <th key={role.key} className="min-w-[150px] px-4 py-3 text-center">{role.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {visiblePermissions.map((permission) => (
                  <tr key={permission.key} className="hover:bg-muted/15">
                    <td className="sticky left-0 z-10 bg-background px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <code className="font-semibold">{permission.key}</code>
                        {riskBadge(permission.risk_level)}
                        <Badge variant="outline" className="rounded-full text-[10px] font-normal">{permission.category}</Badge>
                      </div>
                      <p className="mt-1 font-medium">{permission.label}</p>
                      <p className="mt-1 max-w-xl text-xs text-muted-foreground">{permission.description}</p>
                    </td>
                    {matrix.roles.map((role) => {
                      const enabled = role.implicit_all || permission.roles.includes(role.key);
                      const editable = matrix.actor_super_admin && !role.implicit_all;
                      return (
                        <td key={role.key} className="px-4 py-3 text-center">
                          <div className="inline-flex min-w-[104px] items-center justify-center gap-2 rounded-xl border px-3 py-2">
                            <Switch
                              checked={enabled}
                              disabled={!editable || saving}
                              onCheckedChange={(next) => {
                                if (!editable) return;
                                setReason('');
                                setChange({ role, permission, enabled: next });
                              }}
                              aria-label={role.label + ' ' + permission.label}
                            />
                            <span className={cn('text-[11px]', enabled ? 'font-medium' : 'text-muted-foreground')}>
                              {enabled ? 'On' : 'Off'}
                            </span>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
                {!loading && visiblePermissions.length === 0 && (
                  <tr>
                    <td colSpan={matrix.roles.length + 1} className="p-12 text-center text-muted-foreground">
                      Permission topilmadi.
                    </td>
                  </tr>
                )}
                {loading && (
                  <tr>
                    <td colSpan={matrix.roles.length + 1} className="p-12 text-center">
                      <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
        <CheckCircle2 className="h-3.5 w-3.5" />
        Super admin implicit wildcard matrixdan o‘chirib bo‘lmaydi; role assignmentlar alohida audited workflow orqali boshqariladi.
      </div>

      <Dialog open={Boolean(change)} onOpenChange={(open) => !open && setChange(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>RBAC permissionni {change?.enabled ? 'berish' : 'olib tashlash'}</DialogTitle>
            <DialogDescription>
              {change?.role.label} · {change?.permission.key}. Bu access-control o‘zgarishi immutable auditga yoziladi.
            </DialogDescription>
          </DialogHeader>
          {change && ['high', 'critical'].includes(change.permission.risk_level) && (
            <div className="flex gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <p>
                {change.permission.risk_level === 'critical' ? 'Critical' : 'High'} risk permission.
                Least-privilege va operator vazifasini tekshiring.
              </p>
            </div>
          )}
          <div>
            <Label>O‘zgarish sababi</Label>
            <Textarea
              className="mt-2"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Nega aynan shu role uchun bu permission o‘zgartirilmoqda?"
              rows={4}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setChange(null)}>Bekor qilish</Button>
            <Button
              variant={change?.enabled ? 'default' : 'destructive'}
              disabled={saving || reason.trim().length < 3}
              onClick={() => void applyChange()}
            >
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Tasdiqlash
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
