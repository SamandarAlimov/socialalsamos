import { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import {
  Ban,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  KeyRound,
  Loader2,
  Mail,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  UserCog,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { AdminControlNav } from '@/components/admin/AdminControlNav';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
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
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { useAdminAccess } from '@/hooks/useAdminAccess';
import {
  getAdminAuthUser,
  getAdminUserAudit,
  getAdminUserDetails,
  runAdminAuthAction,
  setAdminUserStatus,
  updateAdminUserProfile,
  useAdminUsers,
  type AdminAccountStatus,
  type AdminAuditEvent,
  type AdminAuthUser,
  type AdminUserDetails,
  type AdminUserRow,
} from '@/hooks/useAdminUsers';

const PAGE_SIZE = 30;
const statusLabels: Record<AdminAccountStatus, string> = {
  active: 'Faol',
  suspended: 'Vaqtincha to‘xtatilgan',
  banned: 'Bloklangan',
  deactivated: 'Faolsizlantirilgan',
  deletion_pending: 'O‘chirish navbatida',
};

function dateTime(value?: string | null) {
  if (!value) return '—';
  try { return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)); }
  catch { return value; }
}

function UserStatusBadge({ status }: { status: AdminAccountStatus }) {
  const variant = status === 'active' ? 'secondary' : status === 'banned' || status === 'deletion_pending' ? 'destructive' : 'outline';
  return <Badge variant={variant}>{statusLabels[status]}</Badge>;
}

export default function AdminUsersPage() {
  const navigate = useNavigate();
  const { isAdmin, isLoading: accessLoading, hasPermission } = useAdminAccess();
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<AdminUserRow | null>(null);
  const [details, setDetails] = useState<AdminUserDetails | null>(null);
  const [authUser, setAuthUser] = useState<AdminAuthUser | null>(null);
  const [audit, setAudit] = useState<AdminAuditEvent[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [dangerOpen, setDangerOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [email, setEmail] = useState('');
  const [confirmDelete, setConfirmDelete] = useState('');
  const [profileForm, setProfileForm] = useState({
    display_name: '', username: '', bio: '', website: '', location: '', country: '', is_verified: false,
  });

  const { users, total, isLoading, error, schemaReady, refresh } = useAdminUsers(query, status, page, PAGE_SIZE);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const canEdit = hasPermission('admin.users.edit') || hasPermission('*');
  const canSuspend = hasPermission('admin.users.suspend') || hasPermission('*');
  const canDelete = hasPermission('admin.users.delete') || hasPermission('*');
  const canEmail = hasPermission('admin.users.email.manage') || hasPermission('*');

  useEffect(() => {
    const timer = setTimeout(() => { setPage(0); setQuery(search.trim()); }, 320);
    return () => clearTimeout(timer);
  }, [search]);

  const loadSelected = async (row: AdminUserRow) => {
    setSelected(row);
    setDetailLoading(true);
    setDetails(null);
    setAuthUser(null);
    setAudit([]);
    try {
      const [detailResult, authResult, auditResult] = await Promise.allSettled([
        getAdminUserDetails(row.user_id),
        getAdminAuthUser(row.user_id),
        getAdminUserAudit(row.user_id),
      ]);
      const detail = detailResult.status === 'fulfilled' ? detailResult.value : null;
      const auth = authResult.status === 'fulfilled' ? authResult.value : null;
      const events = auditResult.status === 'fulfilled' ? auditResult.value : [];
      setDetails(detail);
      setAuthUser(auth);
      setAudit(events);
      if (detail?.profile) {
        setProfileForm({
          display_name: detail.profile.display_name || '',
          username: detail.profile.username || '',
          bio: detail.profile.bio || '',
          website: detail.profile.website || '',
          location: detail.profile.location || '',
          country: detail.profile.country || '',
          is_verified: Boolean(detail.profile.is_verified),
        });
      }
      setEmail(auth?.email || '');
    } finally {
      setDetailLoading(false);
    }
  };

  const afterAction = async () => {
    setReason('');
    await refresh();
    if (selected) {
      const latest = users.find((u) => u.user_id === selected.user_id) || selected;
      await loadSelected(latest);
    }
  };

  const saveProfile = async () => {
    if (!selected || !reason.trim()) return toast.error('O‘zgarish sababini kiriting');
    setActionLoading(true);
    try {
      await updateAdminUserProfile(selected.user_id, profileForm, reason.trim());
      toast.success('Profil yangilandi va auditga yozildi');
      setEditOpen(false);
      await afterAction();
    } catch (e: any) {
      toast.error(e?.message || 'Profilni yangilab bo‘lmadi');
    } finally { setActionLoading(false); }
  };

  const changeStatus = async (next: AdminAccountStatus) => {
    if (!selected) return;
    if (next !== 'active' && !reason.trim()) return toast.error('Sabab majburiy');
    setActionLoading(true);
    try {
      await setAdminUserStatus(selected.user_id, next, reason.trim());
      if (next === 'banned') await runAdminAuthAction('ban', selected.user_id, { reason: reason.trim() });
      if (next === 'active' && authUser?.banned_until) await runAdminAuthAction('unban', selected.user_id, { reason: reason.trim() || 'Admin account reactivated' });
      toast.success(`Hisob holati: ${statusLabels[next]}`);
      await afterAction();
    } catch (e: any) {
      toast.error(e?.message || 'Hisob holatini o‘zgartirib bo‘lmadi');
    } finally { setActionLoading(false); }
  };

  const updateEmail = async () => {
    if (!selected || !email.trim() || !reason.trim()) return toast.error('Email va sabab majburiy');
    setActionLoading(true);
    try {
      const result = await runAdminAuthAction('update_email', selected.user_id, { email: email.trim(), reason: reason.trim() });
      setAuthUser(result?.user || null);
      toast.success('Auth email yangilandi va auditga yozildi');
      setReason('');
    } catch (e: any) { toast.error(e?.message || 'Emailni yangilab bo‘lmadi'); }
    finally { setActionLoading(false); }
  };

  const deleteUser = async () => {
    if (!selected || !reason.trim()) return toast.error('O‘chirish sababi majburiy');
    const expected = selected.username || selected.user_id;
    if (confirmDelete !== expected) return toast.error(`Tasdiqlash uchun “${expected}” ni aynan kiriting`);
    setActionLoading(true);
    try {
      await runAdminAuthAction('delete_user', selected.user_id, { reason: reason.trim() });
      toast.success('Auth user o‘chirildi. Deletion job auditda saqlandi.');
      setDangerOpen(false);
      setSelected(null);
      setReason('');
      setConfirmDelete('');
      await refresh();
    } catch (e: any) { toast.error(e?.message || 'Foydalanuvchini o‘chirib bo‘lmadi'); }
    finally { setActionLoading(false); }
  };

  const activeCount = useMemo(() => users.filter((u) => u.account_status === 'active').length, [users]);

  if (accessLoading) return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin" /></div>;
  if (!isAdmin) return <Navigate to="/home" replace />;

  return (
    <div className="mx-auto w-full max-w-[1500px] space-y-5 p-3 pb-12 md:p-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <Button variant="ghost" size="sm" className="mb-2 -ml-2" onClick={() => navigate('/admin')}><ChevronLeft className="mr-1 h-4 w-4" />Admin</Button>
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10"><Users className="h-5 w-5 text-primary" /></div>
            <div><h1 className="text-2xl font-bold tracking-tight md:text-3xl">Users & Auth</h1><p className="text-sm text-muted-foreground">Profil, Auth identity, hisob holati, email va audit boshqaruvi</p></div>
          </div>
        </div>
        <AdminControlNav />
      </div>

      {!schemaReady && (
        <Card className="border-amber-500/30 bg-amber-500/5"><CardContent className="flex gap-3 p-4 text-sm"><ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" /><div><p className="font-semibold">Governance migration hali productionda yo‘q</p><p className="text-muted-foreground">Hozir faqat xavfsiz profil fallback ko‘rinadi. Status/Auth/audit amallari migration va Edge Function deployidan keyin faol bo‘ladi.</p></div></CardContent></Card>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Jami</p><p className="mt-1 text-2xl font-bold tabular-nums">{total.toLocaleString()}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Bu sahifadagi faol</p><p className="mt-1 text-2xl font-bold tabular-nums">{activeCount}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Boshqaruv modeli</p><p className="mt-1 font-semibold">RBAC + immutable audit</p></CardContent></Card>
      </div>

      <Card>
        <CardHeader className="pb-3"><div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><CardTitle className="text-base">Foydalanuvchilar</CardTitle><div className="flex flex-col gap-2 sm:flex-row"><div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Username, ism yoki UUID" className="w-full pl-9 sm:w-72" /></div><select value={status} onChange={(e) => { setStatus(e.target.value); setPage(0); }} className="h-10 rounded-md border border-input bg-background px-3 text-sm"><option value="all">Barcha holatlar</option>{Object.entries(statusLabels).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select><Button variant="outline" size="icon" onClick={() => void refresh()}><RefreshCw className="h-4 w-4" /></Button></div></div></CardHeader>
        <CardContent className="p-0">
          {error && <div className="border-t p-4 text-sm text-destructive">{error}</div>}
          <div className="divide-y border-t">
            {isLoading ? Array.from({ length: 6 }).map((_,i) => <div key={i} className="h-20 animate-pulse bg-muted/20" />) : users.length === 0 ? <div className="p-10 text-center text-sm text-muted-foreground">Natija topilmadi</div> : users.map((row) => (
              <button key={row.user_id} type="button" onClick={() => void loadSelected(row)} className="flex w-full items-center gap-3 p-4 text-left transition hover:bg-muted/40">
                <Avatar className="h-11 w-11"><AvatarImage src={row.avatar_url || ''} /><AvatarFallback>{(row.display_name || row.username || '?').slice(0,1).toUpperCase()}</AvatarFallback></Avatar>
                <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="truncate font-semibold">{row.display_name || row.username || 'Nomsiz profil'}</span>{row.is_verified && <ShieldCheck className="h-4 w-4 text-primary" />}<UserStatusBadge status={row.account_status} />{row.is_online && <Badge variant="outline" className="border-emerald-500/30 text-emerald-600">online</Badge>}</div><p className="truncate text-xs text-muted-foreground">@{row.username || '—'} · {row.country || 'Hudud yo‘q'} · {row.posts_count} post</p></div>
                <div className="hidden text-right text-xs text-muted-foreground md:block"><p>{row.roles.length ? row.roles.join(', ') : 'user'}</p><p>{dateTime(row.created_at)}</p></div><ChevronRight className="h-4 w-4 text-muted-foreground" />
              </button>
            ))}
          </div>
          <div className="flex items-center justify-between border-t p-3"><span className="text-xs text-muted-foreground">{total ? `${page*PAGE_SIZE+1}–${Math.min((page+1)*PAGE_SIZE,total)} / ${total}` : '0'}</span><div className="flex gap-2"><Button variant="outline" size="sm" disabled={page===0} onClick={() => setPage((v)=>Math.max(0,v-1))}><ChevronLeft className="h-4 w-4" /></Button><span className="flex items-center px-2 text-xs">{page+1} / {pages}</span><Button variant="outline" size="sm" disabled={page+1>=pages} onClick={() => setPage((v)=>v+1)}><ChevronRight className="h-4 w-4" /></Button></div></div>
        </CardContent>
      </Card>

      <Dialog open={Boolean(selected)} onOpenChange={(open) => { if (!open) setSelected(null); }}>
        <DialogContent className="max-w-3xl p-0 overflow-hidden"><DialogHeader className="border-b p-5"><DialogTitle className="flex items-center gap-3"><Avatar><AvatarImage src={selected?.avatar_url || ''} /><AvatarFallback>{(selected?.display_name || selected?.username || '?')[0]}</AvatarFallback></Avatar><span>{selected?.display_name || selected?.username || 'User'}</span></DialogTitle><DialogDescription>{selected?.user_id}</DialogDescription></DialogHeader>
          <ScrollArea className="max-h-[72vh]"><div className="space-y-5 p-5">
            {detailLoading ? <div className="flex h-40 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div> : selected && (
              <>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Status</p><div className="mt-2"><UserStatusBadge status={details?.account.status || selected.account_status} /></div></CardContent></Card>
                  <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Postlar</p><p className="mt-1 text-xl font-semibold">{details?.counts.posts ?? selected.posts_count}</p></CardContent></Card>
                  <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Mailbox aliases</p><p className="mt-1 text-xl font-semibold">{details?.counts.mailbox_aliases ?? '—'}</p></CardContent></Card>
                  <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Audit event</p><p className="mt-1 text-xl font-semibold">{details?.counts.audit_events ?? audit.length}</p></CardContent></Card>
                </div>

                <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Supabase Auth identity</CardTitle></CardHeader><CardContent className="grid gap-3 text-sm sm:grid-cols-2"><div><p className="text-xs text-muted-foreground">Email</p><p className="font-medium break-all">{authUser?.email || 'Edge Function deployidan keyin'}</p></div><div><p className="text-xs text-muted-foreground">Oxirgi login</p><p>{dateTime(authUser?.last_sign_in_at)}</p></div><div><p className="text-xs text-muted-foreground">Email tasdiqlangan</p><p>{authUser?.email_confirmed_at ? 'Ha' : 'Yo‘q / noma’lum'}</p></div><div><p className="text-xs text-muted-foreground">Provider</p><p>{authUser?.providers?.join(', ') || '—'}</p></div></CardContent></Card>

                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" disabled={!canEdit || !schemaReady || details?.account.protected} onClick={() => { setReason(''); setEditOpen(true); }}><UserCog className="mr-2 h-4 w-4" />Profilni tahrirlash</Button>
                  <Button variant="outline" disabled={!canEmail || !schemaReady || details?.account.protected} onClick={() => { setReason(''); setEmail(authUser?.email || ''); setAuthOpen(true); }}><Mail className="mr-2 h-4 w-4" />Auth email</Button>
                  <Button variant="outline" disabled={!canSuspend || !schemaReady || details?.account.protected || actionLoading} onClick={() => { setReason(''); void changeStatus('active'); }}><CheckCircle2 className="mr-2 h-4 w-4" />Faollashtirish</Button>
                  <Button variant="outline" disabled={!canSuspend || !schemaReady || details?.account.protected} onClick={() => { const value = window.prompt('Suspend sababi'); if (value) { setReason(value); void setAdminUserStatus(selected.user_id,'suspended',value).then(afterAction).then(()=>toast.success('Hisob suspend qilindi')).catch((e)=>toast.error(e.message)); } }}><Ban className="mr-2 h-4 w-4" />Suspend</Button>
                  <Button variant="destructive" disabled={!canDelete || !schemaReady || details?.account.protected} onClick={() => { setReason(''); setConfirmDelete(''); setDangerOpen(true); }}><Trash2 className="mr-2 h-4 w-4" />Hard delete</Button>
                  <Button variant="ghost" onClick={() => navigate('/admin/team')}><KeyRound className="mr-2 h-4 w-4" />Rollar</Button>
                </div>

                <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Audit timeline</CardTitle></CardHeader><CardContent>{audit.length === 0 ? <p className="text-sm text-muted-foreground">Hozircha audit event yo‘q.</p> : <div className="space-y-3">{audit.slice(0,20).map((event) => <div key={event.id} className="rounded-xl border p-3"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-medium">{event.action}</p><p className="text-xs text-muted-foreground">{event.reason || 'Sabab ko‘rsatilmagan'}</p></div><span className="whitespace-nowrap text-[11px] text-muted-foreground">{dateTime(event.created_at)}</span></div></div>)}</div>}</CardContent></Card>
              </>
            )}
          </div></ScrollArea>
        </DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={setEditOpen}><DialogContent className="max-w-xl"><DialogHeader><DialogTitle>Profil ma’lumotlarini tahrirlash</DialogTitle><DialogDescription>Faqat whitelisted profil maydonlari o‘zgaradi. Har bir o‘zgarish auditga yoziladi.</DialogDescription></DialogHeader><div className="grid gap-3 sm:grid-cols-2"><div><Label>Display name</Label><Input value={profileForm.display_name} onChange={(e)=>setProfileForm(v=>({...v,display_name:e.target.value}))} /></div><div><Label>Username</Label><Input value={profileForm.username} onChange={(e)=>setProfileForm(v=>({...v,username:e.target.value}))} /></div><div><Label>Country</Label><Input value={profileForm.country} onChange={(e)=>setProfileForm(v=>({...v,country:e.target.value}))} /></div><div><Label>Location</Label><Input value={profileForm.location} onChange={(e)=>setProfileForm(v=>({...v,location:e.target.value}))} /></div><div className="sm:col-span-2"><Label>Website</Label><Input value={profileForm.website} onChange={(e)=>setProfileForm(v=>({...v,website:e.target.value}))} /></div><div className="sm:col-span-2"><Label>Bio</Label><Textarea value={profileForm.bio} onChange={(e)=>setProfileForm(v=>({...v,bio:e.target.value}))} /></div><label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" checked={profileForm.is_verified} onChange={(e)=>setProfileForm(v=>({...v,is_verified:e.target.checked}))} /> Verified</label><div className="sm:col-span-2"><Label>O‘zgarish sababi</Label><Textarea value={reason} onChange={(e)=>setReason(e.target.value)} placeholder="Audit uchun majburiy" /></div></div><DialogFooter><Button variant="outline" onClick={()=>setEditOpen(false)}>Bekor qilish</Button><Button disabled={actionLoading} onClick={()=>void saveProfile()}>{actionLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Saqlash</Button></DialogFooter></DialogContent></Dialog>

      <Dialog open={authOpen} onOpenChange={setAuthOpen}><DialogContent><DialogHeader><DialogTitle>Supabase Auth email</DialogTitle><DialogDescription>Bu amal service-role bilan faqat Edge Function ichida bajariladi. Kalit brauzerga chiqmaydi.</DialogDescription></DialogHeader><div className="space-y-3"><div><Label>Yangi email</Label><Input type="email" value={email} onChange={(e)=>setEmail(e.target.value)} /></div><div><Label>Sabab</Label><Textarea value={reason} onChange={(e)=>setReason(e.target.value)} /></div></div><DialogFooter><Button variant="outline" onClick={()=>setAuthOpen(false)}>Bekor qilish</Button><Button disabled={actionLoading} onClick={()=>void updateEmail()}>{actionLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Emailni yangilash</Button></DialogFooter></DialogContent></Dialog>

      <Dialog open={dangerOpen} onOpenChange={setDangerOpen}><DialogContent><DialogHeader><DialogTitle className="flex items-center gap-2 text-destructive"><ShieldAlert className="h-5 w-5" />Hard delete</DialogTitle><DialogDescription>Bu Supabase Auth identity’ni o‘chiradi. DB’da avval deletion job yaratiladi; muvaffaqiyatsizlik ham auditda qoladi. Super admin va o‘z hisobingizni bu yerdan o‘chirib bo‘lmaydi.</DialogDescription></DialogHeader><div className="space-y-3"><div><Label>O‘chirish sababi</Label><Textarea value={reason} onChange={(e)=>setReason(e.target.value)} /></div><div><Label>Tasdiqlash: {selected?.username || selected?.user_id}</Label><Input value={confirmDelete} onChange={(e)=>setConfirmDelete(e.target.value)} /></div></div><DialogFooter><Button variant="outline" onClick={()=>setDangerOpen(false)}>Bekor qilish</Button><Button variant="destructive" disabled={actionLoading} onClick={()=>void deleteUser()}>{actionLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Butunlay o‘chirish</Button></DialogFooter></DialogContent></Dialog>
    </div>
  );
}
