import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Globe2, Loader2, MapPinned, RefreshCw, ShieldCheck, Users } from 'lucide-react';
import { AdminControlNav } from '@/components/admin/AdminControlNav';
import { AdminOnlineUsersMap } from '@/components/admin/AdminOnlineUsersMap';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAdminAccess } from '@/hooks/useAdminAccess';
import { db } from '@/lib/db';

type RegionRow = {
  country: string;
  users_count: number;
  online_count: number;
  verified_count: number;
  new_30d_count: number;
  posts_count: number;
};

export default function AdminRegionsPage() {
  const { isAdmin, isLoading: accessLoading } = useAdminAccess();
  const [rows, setRows] = useState<RegionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [schemaReady, setSchemaReady] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await db.rpc('admin_region_summary_v3');
    if (error) {
      setSchemaReady(false);
      setRows([]);
    } else {
      setSchemaReady(true);
      setRows((data || []).map((row: any) => ({
        country: String(row.country || 'Unknown'),
        users_count: Number(row.users_count || 0),
        online_count: Number(row.online_count || 0),
        verified_count: Number(row.verified_count || 0),
        new_30d_count: Number(row.new_30d_count || 0),
        posts_count: Number(row.posts_count || 0),
      })));
    }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const totals = useMemo(() => rows.reduce((acc, row) => ({
    users: acc.users + row.users_count,
    online: acc.online + row.online_count,
    newUsers: acc.newUsers + row.new_30d_count,
    posts: acc.posts + row.posts_count,
  }), { users: 0, online: 0, newUsers: 0, posts: 0 }), [rows]);

  if (accessLoading) return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin" /></div>;
  if (!isAdmin) return <Navigate to="/home" replace />;

  return (
    <div className="mx-auto w-full max-w-[1500px] space-y-5 p-3 pb-12 md:p-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10"><MapPinned className="h-5 w-5 text-primary" /></div><div><h1 className="text-2xl font-bold tracking-tight md:text-3xl">Hududlar analitikasi</h1><p className="text-sm text-muted-foreground">Alsamos Map Engine + maxfiylikka mos agregat platform signallari</p></div></div>
        <AdminControlNav />
      </div>

      {!schemaReady && <Card className="border-amber-500/30 bg-amber-500/5"><CardContent className="p-4 text-sm">Admin Control Center migration run qilingandan keyin tarixiy hudud agregatlari shu yerda chiqadi. Real-time xarita esa mavjud Alsamos map tizimidan ishlashda davom etadi.</CardContent></Card>}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card><CardContent className="p-4"><Users className="mb-3 h-4 w-4 text-muted-foreground" /><p className="text-2xl font-bold tabular-nums">{totals.users.toLocaleString()}</p><p className="text-xs text-muted-foreground">Hududi ma’lum/jamlangan users</p></CardContent></Card>
        <Card><CardContent className="p-4"><Globe2 className="mb-3 h-4 w-4 text-muted-foreground" /><p className="text-2xl font-bold tabular-nums">{rows.length}</p><p className="text-xs text-muted-foreground">Davlat/hudud guruhlari</p></CardContent></Card>
        <Card><CardContent className="p-4"><RefreshCw className="mb-3 h-4 w-4 text-muted-foreground" /><p className="text-2xl font-bold tabular-nums">{totals.newUsers.toLocaleString()}</p><p className="text-xs text-muted-foreground">Oxirgi 30 kun yangi</p></CardContent></Card>
        <Card><CardContent className="p-4"><ShieldCheck className="mb-3 h-4 w-4 text-muted-foreground" /><p className="text-2xl font-bold tabular-nums">Aggregate</p><p className="text-xs text-muted-foreground">Aniq foydalanuvchi koordinatasi ochilmaydi</p></CardContent></Card>
      </div>

      <AdminOnlineUsersMap />

      <Card>
        <CardHeader><div className="flex items-center justify-between"><CardTitle className="text-base">Hududlar kesimi</CardTitle><Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}><RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Yangilash</Button></div></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-sm"><thead className="border-y bg-muted/30 text-left text-xs text-muted-foreground"><tr><th className="px-4 py-3 font-medium">Hudud</th><th className="px-4 py-3 font-medium">Users</th><th className="px-4 py-3 font-medium">Online</th><th className="px-4 py-3 font-medium">Verified</th><th className="px-4 py-3 font-medium">Yangi 30d</th><th className="px-4 py-3 font-medium">Postlar</th></tr></thead><tbody className="divide-y">{loading ? <tr><td colSpan={6} className="p-10 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></td></tr> : rows.length === 0 ? <tr><td colSpan={6} className="p-10 text-center text-muted-foreground">Hudud ma’lumoti yo‘q</td></tr> : rows.map((row) => <tr key={row.country} className="hover:bg-muted/20"><td className="px-4 py-3 font-medium">{row.country}</td><td className="px-4 py-3 tabular-nums">{row.users_count.toLocaleString()}</td><td className="px-4 py-3"><Badge variant="outline">{row.online_count}</Badge></td><td className="px-4 py-3 tabular-nums">{row.verified_count}</td><td className="px-4 py-3 tabular-nums">{row.new_30d_count}</td><td className="px-4 py-3 tabular-nums">{row.posts_count.toLocaleString()}</td></tr>)}</tbody></table></div>
        </CardContent>
      </Card>
    </div>
  );
}
