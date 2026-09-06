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
  deleteAdminMailboxAlias,
  getAdminAuthUser,
  getAdminMailboxAliases,
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
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
  } catch {
    return value;
  }
}

function UserStatusBadge({ status }: { status: AdminAccountStatus }) {
  const variant = status === 'active'
    ? 'secondary'
    : status === 'banned' || status === 'deletion_pending'
      ? 'destructive'
      : 'outline';
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
  const [aliases, setAliases] = useState<string[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [statusAction, setStatusAction] = useState<AdminAccountStatus | null>(null);
  const [dangerOpen, setDangerOpen] = useState(false);
  const [aliasToDelete, setAliasToDelete] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [email, setEmail] = useState('');
  const [suspendedUntil, setSuspendedUntil] = useState('');
  const [confirmDelete, setConfirmDelete] = useState('');
  const [profileForm, setProfileForm] = useState({
    display_name: '', username: '', bio: '', website: '', location: '', country: '', is_verified: false,
  });

  const { users, total, isLoading, error, schemaReady, refresh } = useAdminUsers(query, status, page, PAGE_SIZE);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const canEdit = hasPermission('admin.users.edit');
  const canSuspend = hasPermission('admin.users.suspend');
  const canDelete = hasPermission('admin.users.delete');
  const canEmail = hasPermission('admin.users.email.manage');

  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(0);
      setQuery(search.trim());
    }, 320);
    return () => clearTimeout(timer);
  }, [search]);

  const loadSelected = async (row: AdminUserRow) => {
    setSelected(row);
    setDetailLoading(true);
    setDetails(null);
    setAuthUser(null);
    setAudit([]);
    setAliases([]);
    try {
      const [detailResult, authResult, auditResult, aliasResult] = await Promise.allSettled([
        getAdminUserDetails(row.user_id),
        getAdminAuthUser(row.user_id),
        getAdminUserAudit(row.user_id),
        getAdminMailboxAliases(row.user_id),
      ]);
      const detail = detailResult.status === 'fulfilled' ? detailResult.value : null;
      const auth = authResult.status === 'fulfilled' ? authResult.value : null;
      setDetails(detail);
      setAuthUser(auth);
      setAudit(auditResult.status === 'fulfilled' ? auditResult.value : []);
      setAliases(aliasResult.status === 'fulfilled' ? aliasResult.value : []);
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
    setSuspendedUntil('');
    await refresh();
    if (selected) await loadSelected(selected);
  };

  const saveProfile = async () => {
    if (!selected || !reason.trim()) return toast.error('O‘zgarish sababini kiriting');
    setActionLoading(true);
    try {
      await updateAdminUserProfile(selected.user_id, profileForm, reason.trim());
      setEditOpen(false);
      toast.success('Profil yangilandi va auditga yozildi');
      await afterAction();
    } catch (error: any) {
      toast.error(error?.message || 'Profilni yangilab bo‘lmadi');
    } finally {
      setActionLoading(false);
    }
  };

  const applyStatus = async () => {
    if (!selected || !statusAction) return;
    if (statusAction !== 'active' && !reason.trim()) return toast.error('Sabab majburiy');
    setActionLoading(true);
    try {
      const until = statusAction === 'suspended' && suspendedUntil
        ? new Date(suspendedUntil).toISOString()
        : null;
      await setAdminUserStatus(selected.user_id, statusAction, reason.trim(), until);
      if (statusAction === 'banned') {
        await runAdminAuthAction('ban', selected.user_id, { reason: reason.trim() });
      } else if (statusAction === 'active' && authUser?.banned_until) {
        await runAdminAuthAction('unban', selected.user_id, { reason: reason.trim() || 'Admin account reactivated' });
      }
      toast.success(`Hisob holati: ${statusLabels[statusAction]}`);
      setStatusAction(null);
      await afterAction();
    } catch (error: any) {
      toast.error(error?.message || 'Hisob holatini o‘zgartirib bo‘lmadi');
    } finally {
      setActionLoading(false);
    }
  };

  const updateEmail = async () => {
    if (!selected || !email.trim() || !reason.trim()) return toast.error('Email va sabab majburiy');
    setActionLoading(true);
    try {
      const result = await runAdminAuthAction('update_email', selected.user_id, {
        email: email.trim(),
        reason: reason.trim(),
        email_confirm: true,
      });
      setAuthUser(result?.user || null);
      setAuthOpen(false);
      setReason('');
      toast.success('Auth email va identity login email sinxron yangilandi');
    } catch (error: any) {
      toast.error(error?.message || 'Emailni yangilab bo‘lmadi');
    } finally {
      setActionLoading(false);
    }
  };

  const deleteAlias = async () => {
    if (!selected || !aliasToDelete || !reason.trim()) return toast.error('Sabab majburiy');
    setActionLoading(true);
    try {
      const deleted = await deleteAdminMailboxAlias(selected.user_id, aliasToDelete, reason.trim());
      if (!deleted) throw new Error('Alias topilmadi');
      setAliases((current) => current.filter((alias) => alias !== aliasToDelete));
      setAliasToDelete(null);
      setReason('');
      toast.success('Mailbox alias o‘chirildi va auditga yozildi');
    } catch (error: any) {
      toast.error(error?.message || 'Aliasni o‘chirib bo‘lmadi');
    } finally {
      setActionLoading(false);
    }
  };

  const deleteUser = async () => {
    if (!selected || !reason.trim()) return toast.error('O‘chirish sababi majburiy');
    const expected = selected.username || selected.user_id;
    if (confirmDelete !== expected) return toast.error(`Tasdiqlash uchun “${expected}” ni aynan kiriting`);
    setActionLoading(true);
    try {
      await runAdminAuthAction('delete_user', selected.user_id, { reason: reason.trim() });
      toast.success('Auth identity o‘chirildi. Deletion job auditda saqlandi.');
      setDangerOpen(false);
      setSelected(null);
      setReason('');
      setConfirmDelete('');
      await refresh();
    } catch (error: any) {
      toast.error(error?.message || 'Foydalanuvchini o‘chirib bo‘lmadi');
    } finally {
      setActionLoading(false);
    }
  };

  const activeCount = useMemo(() => users.filter((user) => user.account_status === 'active').length, [users]);
  const protectedTarget = Boolean(details?.account.protected);

  if (accessLoading) return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin" /></div>;
  if (!isAdmin) return <Navigate to="/home" replace />;

  return (
    <div className="mx-auto w-full max-w-[1500px] space-y-5 p-3 pb-12 md:p-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <Button variant="ghost" size="sm" className="mb-2 -ml-2" onClick={() => navigate('/admin')}><ChevronLeft className="mr-1 h-4 w-4" />Admin</Button>
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10"><Users className="h-5 w-5 text-primary" /></div>
            <div><h1 className="text-2xl font-bold tracking-tight md:text-3xl">Users & Auth</h1><p className="text-sm text-muted-foreground">Profil, Supabase Auth, mailbox, status va audit — bitta xavfsiz boshqaruv joyida</p></div>
          </div>
        </div>
        <AdminControlNav />
      </div>

      {!schemaReady && <Card className="border-amber-500/30 bg-amber-500/5"><CardContent className="flex gap-3 p-4 text-sm"><ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" /><div><p className="font-semibold">Governance migration hali productionda yo‘q</p><p className="text-muted-foreground">Hozir xavfsiz profile fallback ko‘rinadi. Status/Auth/mail/audit amallari migration va Edge Function deployidan keyin faol bo‘ladi.</p></div></CardContent></Card>}

      <div className="grid gap-3 sm:grid-cols-3">
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Jami</p><p className="mt-1 text-2xl font-bold tabular-nums">{total.toLocaleString()}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Bu sahifadagi faol</p><p className="mt-1 text-2xl font-bold tabular-nums">{activeCount}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Boshqaruv modeli</p><p className="mt-1 font-semibold">RBAC + server Auth + audit</p></CardContent></Card>
      </div>

      <Card>
        <CardHeader className="pb-3"><div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><CardTitle className="text-base">Foydalanuvchilar</CardTitle><div className="flex flex-col gap-2 sm:flex-row"><div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Username, ism yoki UUID" className="w-full pl-9 sm:w-72" /></div><select value={status} onChange={(event) => { setStatus(event.target.value); setPage(0); }} className="h-10 rounded-md border border-input bg-background px-3 text-sm"><option value="all">Barcha holatlar</option>{Object.entries(statusLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select><Button variant="outline" size="icon" onClick={() => void refresh()}><RefreshCw className="h-4 w-4" /></Button></div></div></CardHeader>
        <CardContent className="p-0">
          {error && <div className="border-t p-4 text-sm text-destructive">{error}</div>}
          <div className="divide-y border-t">
            {isLoading ? Array.from({ length: 6 }).map((_, index) => <div key={index} className="h-20 animate-pulse bg-muted/20" />) : users.length === 0 ? <div className="p-10 text-center text-sm text-muted-foreground">Natija topilmadi</div> : users.map((row) => (
              <button key={row.user_id} type="button" onClick={() => void loadSelected(row)} className="flex w-full items-center gap-3 p-4 text-left transition hover:bg-muted/40">
                <Avatar className="h-11 w-11"><AvatarImage src={row.avatar_url || ''} /><AvatarFallback>{(row.display_name || row.username || '?').slice(0, 1).toUpperCase()}</AvatarFallback></Avatar>
                <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="truncate font-semibold">{row.display_name || row.username || 'Nomsiz profil'}</span>{row.is_verified && <ShieldCheck className="h-4 w-4 text-primary" />}<UserStatusBadge status={row.account_status} />{row.is_online && <Badge variant="outline" className="border-emerald-500/30 text-emerald-600">online</Badge>}</div><p className="truncate text-xs text-muted-foreground">@{row.username || '—'} · {row.country || 'Hudud yo‘q'} · {row.posts_count} post</p></div>
                <div className="hidden text-right text-xs text-muted-foreground md:block"><p>{row.roles.length ? row.roles.join(', ') : 'user'}</p><p>{dateTime(row.created_at)}</p></div><ChevronRight className="h-4 w-4 text-muted-foreground" />
              </button>
            ))}
          </div>
          <div className="flex items-center justify-between border-t p-3"><span className="text-xs text-muted-foreground">{total ? `${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, total)} / ${total}` : '0'}</span><div className="flex gap-2"><Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((value) => Math.max(0, value - 1))}><ChevronLeft className="h-4 w-4" /></Button><span className="flex items-center px-2 text-xs">{page + 1} / {pages}</span><Button variant="outline" size="sm" disabled={page + 1 >= pages} onClick={() => setPage((value) => value + 1)}><ChevronRight className="h-4 w-4" /></Button></div></div>
        </CardContent>
      </Card>

      <Dialog open={Boolean(selected)} onOpenChange={(open) => { if (!open) setSelected(null); }}>
        <DialogContent className="max-w-3xl overflow-hidden p-0"><DialogHeader className="border-b p-5"><DialogTitle className="flex items-center gap-3"><Avatar><AvatarImage src={selected?.avatar_url || ''} /><AvatarFallback>{(selected?.display_name || selected?.username || '?')[0]}</AvatarFallback></Avatar><span>{selected?.display_name || selected?.username || 'User'}</span>{protectedTarget && <Badge variant="outline">Protected</Badge>}</DialogTitle><DialogDescription className="font-mono text-xs">{selected?.user_id}</DialogDescription></DialogHeader>
          <ScrollArea className="max-h-[72vh]"><div className="space-y-5 p-5">
            {detailLoading ? <div className="flex h-40 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div> : selected && <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Status</p><div className="mt-2"><UserStatusBadge status={details?.account.status || selected.account_status} /></div></CardContent></Card>
                <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Postlar</p><p className="mt-1 text-xl font-semibold">{details?.counts.posts ?? selected.posts_count}</p></CardContent></Card>
                <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Mailbox aliases</p><p className="mt-1 text-xl font-semibold">{aliases.length || details?.counts.mailbox_aliases || 0}</p></CardContent></Card>
                <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Audit event</p><p className="mt-1 text-xl font-semibold">{details?.counts.audit_events ?? audit.length}</p></CardContent></Card>
              </div>

              <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Supabase Auth identity</CardTitle></CardHeader><CardContent className="grid gap-3 text-sm sm:grid-cols-2"><div><p className="text-xs text-muted-foreground">Email</p><p className="break-all font-medium">{authUser?.email || 'Edge Function deployidan keyin'}</p></div><div><p className="text-xs text-muted-foreground">Oxirgi login</p><p>{dateTime(authUser?.last_sign_in_at)}</p></div><div><p className="text-xs text-muted-foreground">Email tasdiqlangan</p><p>{authUser?.email_confirmed_at ? 'Ha' : 'Yo‘q / noma’lum'}</p></div><div><p className="text-xs text-muted-foreground">Provider</p><p>{authUser?.providers?.join(', ') || '—'}</p></div></CardContent></Card>

              <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Alsamos mailbox aliases</CardTitle></CardHeader><CardContent>{aliases.length === 0 ? <p className="text-sm text-muted-foreground">Alias yo‘q yoki migration hali deploy qilinmagan.</p> : <div className="space-y-2">{aliases.map((alias) => <div key={alias} className="flex items-center justify-between gap-3 rounded-xl border p-3"><span className="min-w-0 truncate font-mono text-sm">{alias}</span><Button size="sm" variant="ghost" disabled={!canEmail || protectedTarget} onClick={() => { setReason(''); setAliasToDelete(alias); }}><Trash2 className="mr-2 h-4 w-4" />O‘chirish</Button></div>)}</div>}</CardContent></Card>

              <div className="flex flex-wrap gap-2">
                <Button variant="outline" disabled={!canEdit || !schemaReady || protectedTarget} onClick={() => { setReason(''); setEditOpen(true); }}><UserCog className="mr-2 h-4 w-4" />Profil</Button>
                <Button variant="outline" disabled={!canEmail || !schemaReady || protectedTarget} onClick={() => { setReason(''); setEmail(authUser?.email || ''); setAuthOpen(true); }}><Mail className="mr-2 h-4 w-4" />Auth email</Button>
                <Button variant="outline" disabled={!canSuspend || !schemaReady || protectedTarget} onClick={() => { setReason(''); setStatusAction('active'); }}><CheckCircle2 className="mr-2 h-4 w-4" />Faollashtirish</Button>
                <Button variant="outline" disabled={!canSuspend || !schemaReady || protectedTarget} onClick={() => { setReason(''); setSuspendedUntil(''); setStatusAction('suspended'); }}><Ban className="mr-2 h-4 w-4" />Suspend</Button>
                <Button variant="outline" className="text-destructive" disabled={!canSuspend || !schemaReady || protectedTarget} onClick={() => { setReason(''); setStatusAction('banned'); }}><ShieldAlert className="mr-2 h-4 w-4" />Ban</Button>
                <Button variant="destructive" disabled={!canDelete || !schemaReady || protectedTarget} onClick={() => { setReason(''); setConfirmDelete(''); setDangerOpen(true); }}><Trash2 className="mr-2 h-4 w-4" />Hard delete</Button>
                <Button variant="ghost" onClick={() => navigate('/admin/team')}><KeyRound className="mr-2 h-4 w-4" />Rollar</Button>
              </div>

              <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Audit timeline</CardTitle></CardHeader><CardContent>{audit.length === 0 ? <p className="text-sm text-muted-foreground">Hozircha audit event yo‘q.</p> : <div className="space-y-3">{audit.slice(0, 20).map((event) => <div key={event.id} className="rounded-xl border p-3"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-medium">{event.action}</p><p className="text-xs text-muted-foreground">{event.reason || 'Sabab ko‘rsatilmagan'}</p></div><span className="whitespace-nowrap text-[11px] text-muted-foreground">{dateTime(event.created_at)}</span></div></div>)}</div>}</CardContent></Card>
            </>}
          </div></ScrollArea>
        </DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={setEditOpen}><DialogContent className="max-w-xl"><DialogHeader><DialogTitle>Profil ma’lumotlarini tahrirlash</DialogTitle><DialogDescription>Faqat whitelisted profil maydonlari o‘zgaradi. Har bir o‘zgarish auditga yoziladi.</DialogDescription></DialogHeader><div className="grid gap-3 sm:grid-cols-2"><div><Label>Display name</Label><Input value={profileForm.display_name} onChange={(event) => setProfileForm((value) => ({ ...value, display_name: event.target.value }))} /></div><div><Label>Username</Label><Input value={profileForm.username} onChange={(event) => setProfileForm((value) => ({ ...value, username: event.target.value }))} /></div><div><Label>Country</Label><Input value={profileForm.country} onChange={(event) => setProfileForm((value) => ({ ...value, country: event.target.value }))} /></div><div><Label>Location</Label><Input value={profileForm.location} onChange={(event) => setProfileForm((value) => ({ ...value, location: event.target.value }))} /></div><div className="sm:col-span-2"><Label>Website</Label><Input value={profileForm.website} onChange={(event) => setProfileForm((value) => ({ ...value, website: event.target.value }))} /></div><div className="sm:col-span-2"><Label>Bio</Label><Textarea value={profileForm.bio} onChange={(event) => setProfileForm((value) => ({ ...value, bio: event.target.value }))} /></div><label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" checked={profileForm.is_verified} onChange={(event) => setProfileForm((value) => ({ ...value, is_verified: event.target.checked }))} /> Verified</label><div className="sm:col-span-2"><Label>O‘zgarish sababi</Label><Textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Audit uchun majburiy" /></div></div><DialogFooter><Button variant="outline" onClick={() => setEditOpen(false)}>Bekor qilish</Button><Button disabled={actionLoading} onClick={() => void saveProfile()}>{actionLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Saqlash</Button></DialogFooter></DialogContent></Dialog>

      <Dialog open={authOpen} onOpenChange={setAuthOpen}><DialogContent><DialogHeader><DialogTitle>Supabase Auth email</DialogTitle><DialogDescription>Service-role faqat server Edge Function ichida ishlaydi. Linked Alsamos identity login email ham sinxronlanadi.</DialogDescription></DialogHeader><div className="space-y-3"><div><Label>Yangi email</Label><Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></div><div><Label>Sabab</Label><Textarea value={reason} onChange={(event) => setReason(event.target.value)} /></div></div><DialogFooter><Button variant="outline" onClick={() => setAuthOpen(false)}>Bekor qilish</Button><Button disabled={actionLoading} onClick={() => void updateEmail()}>{actionLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Emailni yangilash</Button></DialogFooter></DialogContent></Dialog>

      <Dialog open={Boolean(statusAction)} onOpenChange={(open) => { if (!open) setStatusAction(null); }}><DialogContent><DialogHeader><DialogTitle>Hisob holatini o‘zgartirish</DialogTitle><DialogDescription>{statusAction ? `Yangi holat: ${statusLabels[statusAction]}` : ''}. Suspend/deactivate active session gate orqali darhol cheklanadi; Ban Supabase Auth’ga ham yuboriladi.</DialogDescription></DialogHeader><div className="space-y-3">{statusAction === 'suspended' && <div><Label>Muddati (ixtiyoriy)</Label><Input type="datetime-local" value={suspendedUntil} onChange={(event) => setSuspendedUntil(event.target.value)} /></div>}<div><Label>Sabab {statusAction === 'active' ? '(ixtiyoriy)' : ''}</Label><Textarea value={reason} onChange={(event) => setReason(event.target.value)} /></div></div><DialogFooter><Button variant="outline" onClick={() => setStatusAction(null)}>Bekor qilish</Button><Button disabled={actionLoading} variant={statusAction === 'banned' ? 'destructive' : 'default'} onClick={() => void applyStatus()}>{actionLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Tasdiqlash</Button></DialogFooter></DialogContent></Dialog>

      <Dialog open={Boolean(aliasToDelete)} onOpenChange={(open) => { if (!open) setAliasToDelete(null); }}><DialogContent><DialogHeader><DialogTitle>Mailbox aliasni o‘chirish</DialogTitle><DialogDescription>{aliasToDelete}. Bu amal inbox body’larini ochmaydi; faqat alias lifecycle boshqariladi va auditga yoziladi.</DialogDescription></DialogHeader><div><Label>Sabab</Label><Textarea value={reason} onChange={(event) => setReason(event.target.value)} /></div><DialogFooter><Button variant="outline" onClick={() => setAliasToDelete(null)}>Bekor qilish</Button><Button variant="destructive" disabled={actionLoading} onClick={() => void deleteAlias()}>{actionLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Aliasni o‘chirish</Button></DialogFooter></DialogContent></Dialog>

      <Dialog open={dangerOpen} onOpenChange={setDangerOpen}><DialogContent><DialogHeader><DialogTitle className="flex items-center gap-2 text-destructive"><ShieldAlert className="h-5 w-5" />Hard delete</DialogTitle><DialogDescription>Supabase Auth identity o‘chiriladi. DB’da avval deletion job yaratiladi; muvaffaqiyatsizlik ham auditda qoladi. Self/super-admin himoyalangan.</DialogDescription></DialogHeader><div className="space-y-3"><div><Label>O‘chirish sababi</Label><Textarea value={reason} onChange={(event) => setReason(event.target.value)} /></div><div><Label>Tasdiqlash: {selected?.username || selected?.user_id}</Label><Input value={confirmDelete} onChange={(event) => setConfirmDelete(event.target.value)} /></div></div><DialogFooter><Button variant="outline" onClick={() => setDangerOpen(false)}>Bekor qilish</Button><Button variant="destructive" disabled={actionLoading} onClick={() => void deleteUser()}>{actionLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Butunlay o‘chirish</Button></DialogFooter></DialogContent></Dialog>
    </div>
  );
}
