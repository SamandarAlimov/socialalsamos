import { useCallback, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Activity, Database, FileClock, Loader2, Mail, RefreshCw, ShieldCheck, TriangleAlert, Users } from 'lucide-react';
import { AdminControlNav } from '@/components/admin/AdminControlNav';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAdminAccess } from '@/hooks/useAdminAccess';
import { db } from '@/lib/db';

type Health = {
  checked_at?: string;
  users?: { total?: number; online?: number; verified?: number; suspended?: number; banned?: number; deletion_pending?: number };
  content?: { posts?: number; comments?: number };
  mail?: { aliases?: number; scheduled_total?: number; scheduled_pending?: number; scheduled_failed?: number };
  governance?: { audit_events_24h?: number; failed_deletions?: number; pending_deletions?: number };
};

type Audit = {
  id: string;
  actor_id: string | null;
  target_user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  reason: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

function n(value: unknown) { return Number(value || 0).toLocaleString(); }
function dt(value?: string | null) {
  if (!value) return '—';
  try { return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)); }
  catch { return value; }
}

export default function AdminSystemPage() {
  const { isAdmin, isLoading: accessLoading } = useAdminAccess();
  const [health, setHealth] = useState<Health | null>(null);
  const [audit, setAudit] = useState<Audit[]>([]);
  const [loading, setLoading] = useState(true);
  const [schemaReady, setSchemaReady] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [healthResult, auditResult] = await Promise.all([
      db.rpc('admin_system_health_v3'),
      db.rpc('admin_recent_audit_v3', { p_limit: 60 }),
    ]);
    const ready = !healthResult.error && !auditResult.error;
    setSchemaReady(ready);
    if (!healthResult.error) setHealth((healthResult.data || {}) as Health);
    if (!auditResult.error) setAudit((auditResult.data || []) as Audit[]);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (accessLoading) return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin" /></div>;
  if (!isAdmin) return <Navigate to="/home" replace />;

  const failed = Number(health?.governance?.failed_deletions || 0) + Number(health?.mail?.scheduled_failed || 0);

  return (
    <div className="mx-auto w-full max-w-[1500px] space-y-5 p-3 pb-12 md:p-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10"><Database className="h-5 w-5 text-primary" /></div><div><h1 className="text-2xl font-bold tracking-tight md:text-3xl">System & Audit</h1><p className="text-sm text-muted-foreground">Database health, mail queue, deletion workflow va immutable admin audit</p></div></div>
        <AdminControlNav />
      </div>

      {!schemaReady && <Card className="border-amber-500/30 bg-amber-500/5"><CardContent className="flex gap-3 p-4 text-sm"><TriangleAlert className="h-5 w-5 shrink-0 text-amber-600" /><div><p className="font-semibold">System governance migration kutilmoqda</p><p className="text-muted-foreground">Lovable migrationni Run qilgach health va audit live ishlaydi. Bu sahifa hech qanday arbitrary SQL console bermaydi.</p></div></CardContent></Card>}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card><CardContent className="p-4"><Users className="mb-3 h-4 w-4 text-muted-foreground" /><p className="text-2xl font-bold tabular-nums">{n(health?.users?.total)}</p><p className="text-xs text-muted-foreground">Profiles · {n(health?.users?.online)} online</p></CardContent></Card>
        <Card><CardContent className="p-4"><Mail className="mb-3 h-4 w-4 text-muted-foreground" /><p className="text-2xl font-bold tabular-nums">{n(health?.mail?.scheduled_pending)}</p><p className="text-xs text-muted-foreground">Pending scheduled email · {n(health?.mail?.aliases)} alias</p></CardContent></Card>
        <Card><CardContent className="p-4"><FileClock className="mb-3 h-4 w-4 text-muted-foreground" /><p className="text-2xl font-bold tabular-nums">{n(health?.governance?.audit_events_24h)}</p><p className="text-xs text-muted-foreground">Admin audit · oxirgi 24 soat</p></CardContent></Card>
        <Card className={failed ? 'border-destructive/30' : ''}><CardContent className="p-4">{failed ? <TriangleAlert className="mb-3 h-4 w-4 text-destructive" /> : <ShieldCheck className="mb-3 h-4 w-4 text-emerald-600" />}<p className="text-2xl font-bold tabular-nums">{failed}</p><p className="text-xs text-muted-foreground">Failed queue/deletion holatlari</p></CardContent></Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card><CardHeader><CardTitle className="text-base">Account lifecycle</CardTitle></CardHeader><CardContent className="space-y-3 text-sm">{[
          ['Faol profiles', Math.max(0, Number(health?.users?.total || 0)-Number(health?.users?.suspended || 0)-Number(health?.users?.banned || 0)-Number(health?.users?.deletion_pending || 0))],
          ['Suspended', health?.users?.suspended], ['Banned', health?.users?.banned], ['Deletion pending', health?.users?.deletion_pending], ['Verified', health?.users?.verified],
        ].map(([label,value]) => <div key={String(label)} className="flex items-center justify-between rounded-xl border p-3"><span>{label}</span><Badge variant="secondary">{n(value)}</Badge></div>)}</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-base">Platform data</CardTitle></CardHeader><CardContent className="space-y-3 text-sm">{[
          ['Postlar', health?.content?.posts], ['Izohlar', health?.content?.comments], ['Scheduled email jami', health?.mail?.scheduled_total], ['Scheduled email failed', health?.mail?.scheduled_failed], ['Deletion job failed', health?.governance?.failed_deletions],
        ].map(([label,value]) => <div key={String(label)} className="flex items-center justify-between rounded-xl border p-3"><span>{label}</span><span className="font-semibold tabular-nums">{n(value)}</span></div>)}</CardContent></Card>
      </div>

      <Card>
        <CardHeader><div className="flex items-center justify-between"><div><CardTitle className="flex items-center gap-2 text-base"><Activity className="h-4 w-4" />Immutable admin audit</CardTitle><p className="mt-1 text-xs text-muted-foreground">Kim, qachon, qaysi user/entity ustida nima qilganini saqlaydi. Normal client delete/update qila olmaydi.</p></div><Button variant="outline" size="sm" disabled={loading} onClick={() => void load()}><RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Yangilash</Button></div></CardHeader>
        <CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full min-w-[850px] text-sm"><thead className="border-y bg-muted/30 text-left text-xs text-muted-foreground"><tr><th className="px-4 py-3">Vaqt</th><th className="px-4 py-3">Action</th><th className="px-4 py-3">Actor</th><th className="px-4 py-3">Target</th><th className="px-4 py-3">Sabab</th></tr></thead><tbody className="divide-y">{loading ? <tr><td colSpan={5} className="p-10 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></td></tr> : audit.length === 0 ? <tr><td colSpan={5} className="p-10 text-center text-muted-foreground">Audit yozuvlari hali yo‘q</td></tr> : audit.map((event) => <tr key={event.id} className="align-top hover:bg-muted/20"><td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">{dt(event.created_at)}</td><td className="px-4 py-3 font-medium">{event.action}<p className="text-[11px] font-normal text-muted-foreground">{event.entity_type}</p></td><td className="px-4 py-3 font-mono text-xs">{event.actor_id?.slice(0,8) || 'system'}</td><td className="px-4 py-3 font-mono text-xs">{event.target_user_id?.slice(0,8) || event.entity_id || '—'}</td><td className="max-w-md px-4 py-3 text-xs text-muted-foreground">{event.reason || '—'}</td></tr>)}</tbody></table></div></CardContent>
      </Card>

      <p className="text-center text-xs text-muted-foreground">Oxirgi tekshiruv: {dt(health?.checked_at)} · Admin panelda raw SQL executor ataylab yo‘q.</p>
    </div>
  );
}
