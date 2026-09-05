import '@/styles/admin-console.css';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import {
  Activity,
  ArrowUpRight,
  BadgeCheck,
  BarChart3,
  CheckCircle2,
  ChevronRight,
  CircleGauge,
  FileText,
  Home,
  LayoutDashboard,
  Loader2,
  Menu,
  MessageSquare,
  MoreHorizontal,
  RefreshCw,
  Search,
  Shield,
  ShieldCheck,
  Sparkles,
  Sticker,
  UserCheck,
  UserMinus,
  UserPlus,
  Users,
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useAdminAccess } from '@/hooks/useAdminAccess';
import { useAdminAnalytics } from '@/hooks/useAdminAnalytics';
import { supabase } from '@/integrations/supabase/client';
import { PROFILE_PUBLIC_COLUMNS } from '@/lib/profileFields';
import { cn } from '@/lib/utils';
import { AdminContentManagement } from '@/components/admin/AdminContentManagement';
import { AdminOnlineUsersMap } from '@/components/admin/AdminOnlineUsersMap';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';

interface VerificationRequest {
  id: string;
  user_id: string;
  full_name: string;
  known_as: string | null;
  category: string;
  bio_link: string | null;
  id_document_url: string | null;
  additional_info: string | null;
  status: string;
  rejection_reason?: string | null;
  created_at: string;
  reviewed_at?: string | null;
  profile?: {
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
    is_verified: boolean | null;
  };
}

interface AdminUser {
  id: string;
  user_id: string;
  role: string;
  created_at: string;
  profile?: {
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
  };
}

interface UserProfile {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  is_verified: boolean | null;
  is_online: boolean | null;
  last_seen: string | null;
  country: string | null;
  followers_count: number;
  following_count: number;
  posts_count: number;
  created_at: string;
}

type AdminSection =
  | 'overview'
  | 'analytics'
  | 'content'
  | 'users'
  | 'verification'
  | 'team'
  | 'moderation';

const ADMIN_SECTIONS: Array<{
  id: AdminSection;
  label: string;
  description: string;
  icon: typeof LayoutDashboard;
}> = [
  { id: 'overview', label: 'Boshqaruv markazi', description: 'Platform holati va ish navbati', icon: LayoutDashboard },
  { id: 'analytics', label: 'Analitika', description: 'Foydalanuvchi va kontent signallari', icon: BarChart3 },
  { id: 'content', label: 'Kontent', description: 'Post va izohlarni boshqarish', icon: FileText },
  { id: 'users', label: 'Foydalanuvchilar', description: 'Profil va hisob nazorati', icon: Users },
  { id: 'verification', label: 'Verifikatsiya', description: 'Tasdiqlash so‘rovlari', icon: BadgeCheck },
  { id: 'team', label: 'Adminlar va rollar', description: 'Kirish huquqlarini boshqarish', icon: ShieldCheck },
  { id: 'moderation', label: 'Moderatsiya markazi', description: 'Maxsus nazorat vositalari', icon: CircleGauge },
];

const SECTION_BY_ID = Object.fromEntries(
  ADMIN_SECTIONS.map((item) => [item.id, item]),
) as Record<AdminSection, (typeof ADMIN_SECTIONS)[number]>;

function sectionFromPath(pathname: string): AdminSection {
  const raw = pathname.replace(/^\/admin\/?/, '').split('/')[0];
  if (!raw) return 'overview';
  return ADMIN_SECTIONS.some((section) => section.id === raw) ? (raw as AdminSection) : 'overview';
}

function sectionPath(section: AdminSection): string {
  return section === 'overview' ? '/admin' : `/admin/${section}`;
}

function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
}: {
  label: string;
  value: number | string;
  detail?: string;
  icon: typeof Users;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-muted/40">
          <Icon className="h-4 w-4 text-foreground" />
        </div>
        <MoreHorizontal className="h-4 w-4 text-muted-foreground/70" />
      </div>
      <p className="text-2xl font-semibold tracking-tight tabular-nums">
        {typeof value === 'number' ? value.toLocaleString() : value}
      </p>
      <p className="mt-1 text-sm font-medium text-foreground">{label}</p>
      {detail && <p className="mt-1 text-xs text-muted-foreground">{detail}</p>}
    </div>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex min-h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-muted/15 px-6 text-center">
      <CheckCircle2 className="mb-3 h-7 w-7 text-muted-foreground" />
      <p className="font-medium">{title}</p>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

export default function AdminConsolePage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const { isAdmin, isLoading: adminLoading, grantAdminRole, revokeAdminRole } = useAdminAccess();
  const analytics = useAdminAnalytics();
  const section = sectionFromPath(location.pathname);
  const sectionMeta = SECTION_BY_ID[section];

  const [requests, setRequests] = useState<VerificationRequest[]>([]);
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loadingCore, setLoadingCore] = useState(true);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [verificationSearch, setVerificationSearch] = useState('');
  const [verificationMode, setVerificationMode] = useState<'pending' | 'history'>('pending');
  const [userSearch, setUserSearch] = useState('');
  const [selectedRequest, setSelectedRequest] = useState<VerificationRequest | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [addAdminOpen, setAddAdminOpen] = useState(false);
  const [newAdminUsername, setNewAdminUsername] = useState('');
  const [removeAdmin, setRemoveAdmin] = useState<AdminUser | null>(null);

  useEffect(() => {
    const raw = location.pathname.replace(/^\/admin\/?/, '').split('/')[0];
    if (raw && !ADMIN_SECTIONS.some((item) => item.id === raw)) {
      navigate('/admin', { replace: true });
    }
  }, [location.pathname, navigate]);

  const fetchRequests = useCallback(async () => {
    const { data, error } = await supabase
      .from('verification_requests')
      .select(`
        *,
        profile:profiles!verification_requests_user_id_fkey(
          username, display_name, avatar_url, is_verified
        )
      `)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Admin verification queue failed:', error);
      return;
    }
    setRequests((data || []) as unknown as VerificationRequest[]);
  }, []);

  const fetchAdmins = useCallback(async () => {
    const { data, error } = await supabase
      .from('user_roles')
      .select(`
        *,
        profile:profiles!user_roles_user_id_fkey(
          username, display_name, avatar_url
        )
      `)
      .eq('role', 'admin')
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Admin role list failed:', error);
      return;
    }
    setAdmins((data || []) as unknown as AdminUser[]);
  }, []);

  const fetchCore = useCallback(async () => {
    setLoadingCore(true);
    await Promise.all([fetchRequests(), fetchAdmins()]);
    setLoadingCore(false);
  }, [fetchAdmins, fetchRequests]);

  useEffect(() => {
    if (isAdmin) void fetchCore();
  }, [fetchCore, isAdmin]);

  const fetchUsers = useCallback(async () => {
    setLoadingUsers(true);
    const { data, error } = await supabase
      .from('profiles')
      .select(PROFILE_PUBLIC_COLUMNS)
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) {
      console.error('Admin user list failed:', error);
      toast.error('Foydalanuvchilar ro‘yxatini yuklab bo‘lmadi');
    } else {
      setUsers((data || []) as unknown as UserProfile[]);
    }
    setLoadingUsers(false);
  }, []);

  useEffect(() => {
    if (isAdmin && section === 'users' && users.length === 0 && !loadingUsers) {
      void fetchUsers();
    }
  }, [fetchUsers, isAdmin, loadingUsers, section, users.length]);

  const pendingRequests = useMemo(
    () => requests.filter((request) => request.status === 'pending'),
    [requests],
  );
  const processedRequests = useMemo(
    () => requests.filter((request) => request.status !== 'pending'),
    [requests],
  );

  const visibleVerificationRequests = useMemo(() => {
    const source = verificationMode === 'pending' ? pendingRequests : processedRequests;
    const query = verificationSearch.trim().toLowerCase();
    if (!query) return source;
    return source.filter(
      (request) =>
        request.full_name.toLowerCase().includes(query) ||
        request.profile?.username?.toLowerCase().includes(query) ||
        request.category?.toLowerCase().includes(query),
    );
  }, [pendingRequests, processedRequests, verificationMode, verificationSearch]);

  const filteredUsers = useMemo(() => {
    const query = userSearch.trim().toLowerCase();
    if (!query) return users;
    return users.filter(
      (item) =>
        item.username?.toLowerCase().includes(query) ||
        item.display_name?.toLowerCase().includes(query) ||
        item.country?.toLowerCase().includes(query),
    );
  }, [userSearch, users]);

  const refreshCurrent = async () => {
    if (section === 'users') await fetchUsers();
    else if (section === 'analytics') await analytics.refetch();
    else await Promise.all([fetchCore(), analytics.refetch()]);
  };

  const approveVerification = async (request: VerificationRequest) => {
    setProcessingId(request.id);
    try {
      const { error: requestError } = await supabase
        .from('verification_requests')
        .update({
          status: 'approved',
          reviewed_at: new Date().toISOString(),
          reviewed_by: user?.id,
          rejection_reason: null,
        })
        .eq('id', request.id);
      if (requestError) throw requestError;

      const { error: profileError } = await supabase
        .from('profiles')
        .update({ is_verified: true })
        .eq('id', request.user_id);
      if (profileError) throw profileError;

      const { error: notificationError } = await supabase.from('notifications').insert({
        user_id: request.user_id,
        type: 'verification',
        title: 'Verifikatsiya tasdiqlandi',
        body: 'Hisobingiz Alsamos tomonidan tasdiqlandi.',
        data: { request_id: request.id },
      });
      if (notificationError) console.warn('Verification notification failed:', notificationError);

      toast.success('Verifikatsiya tasdiqlandi');
      await fetchRequests();
    } catch (error) {
      console.error('Verification approve failed:', error);
      toast.error('Verifikatsiyani tasdiqlab bo‘lmadi');
    } finally {
      setProcessingId(null);
    }
  };

  const rejectVerification = async () => {
    if (!selectedRequest) return;
    const reason = rejectionReason.trim();
    if (reason.length < 3) {
      toast.error('Rad etish sababini kiriting');
      return;
    }

    setProcessingId(selectedRequest.id);
    try {
      const { error } = await supabase
        .from('verification_requests')
        .update({
          status: 'rejected',
          rejection_reason: reason,
          reviewed_at: new Date().toISOString(),
          reviewed_by: user?.id,
        })
        .eq('id', selectedRequest.id);
      if (error) throw error;

      const { error: notificationError } = await supabase.from('notifications').insert({
        user_id: selectedRequest.user_id,
        type: 'verification',
        title: 'Verifikatsiya rad etildi',
        body: reason,
        data: { request_id: selectedRequest.id },
      });
      if (notificationError) console.warn('Verification rejection notification failed:', notificationError);

      toast.success('So‘rov rad etildi');
      setSelectedRequest(null);
      setRejectionReason('');
      await fetchRequests();
    } catch (error) {
      console.error('Verification reject failed:', error);
      toast.error('So‘rovni rad etib bo‘lmadi');
    } finally {
      setProcessingId(null);
    }
  };

  const toggleVerification = async (target: UserProfile) => {
    setProcessingId(target.id);
    try {
      const nextValue = !target.is_verified;
      const { error } = await supabase
        .from('profiles')
        .update({ is_verified: nextValue })
        .eq('id', target.id);
      if (error) throw error;
      setUsers((current) =>
        current.map((item) => (item.id === target.id ? { ...item, is_verified: nextValue } : item)),
      );
      toast.success(nextValue ? 'Foydalanuvchi tasdiqlandi' : 'Verifikatsiya olib tashlandi');
    } catch (error) {
      console.error('Admin verification toggle failed:', error);
      toast.error('Verifikatsiya holatini o‘zgartirib bo‘lmadi');
    } finally {
      setProcessingId(null);
    }
  };

  const addAdmin = async () => {
    const username = newAdminUsername.trim().replace(/^@/, '');
    if (!username) return;
    setProcessingId('add-admin');
    try {
      const { data: target, error: profileError } = await supabase
        .from('profiles')
        .select('id, username')
        .eq('username', username)
        .maybeSingle();
      if (profileError) throw profileError;
      if (!target) {
        toast.error('Bunday username topilmadi');
        return;
      }

      const { error } = await grantAdminRole(target.id);
      if (error) throw new Error(error);
      toast.success(`@${target.username || username} admin qilindi`);
      setNewAdminUsername('');
      setAddAdminOpen(false);
      await fetchAdmins();
    } catch (error) {
      console.error('Grant admin failed:', error);
      toast.error('Admin huquqini berib bo‘lmadi');
    } finally {
      setProcessingId(null);
    }
  };

  const confirmRemoveAdmin = async () => {
    if (!removeAdmin) return;
    if (removeAdmin.user_id === user?.id) {
      toast.error('O‘zingizning admin huquqingizni bu yerdan olib tashlay olmaysiz');
      setRemoveAdmin(null);
      return;
    }

    setProcessingId(removeAdmin.id);
    try {
      const { error } = await revokeAdminRole(removeAdmin.user_id);
      if (error) throw new Error(error);
      toast.success('Admin huquqi olib tashlandi');
      setRemoveAdmin(null);
      await fetchAdmins();
    } catch (error) {
      console.error('Revoke admin failed:', error);
      toast.error('Admin huquqini olib tashlab bo‘lmadi');
    } finally {
      setProcessingId(null);
    }
  };

  if (adminLoading) {
    return (
      <div className="admin-neutral flex h-full items-center justify-center bg-background">
        <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isAdmin) return <Navigate to="/home" replace />;

  const stats = analytics.platformStats || {
    total_users: 0,
    online_users: 0,
    new_users_24h: 0,
    new_users_7d: 0,
    new_users_30d: 0,
    verified_users: 0,
    total_posts: 0,
    posts_24h: 0,
    total_messages: 0,
    messages_24h: 0,
  };

  const renderOverview = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-3 2xl:grid-cols-6">
        <MetricCard label="Jami foydalanuvchi" value={stats.total_users} detail={`+${stats.new_users_24h} oxirgi 24 soatda`} icon={Users} />
        <MetricCard label="Hozir onlayn" value={stats.online_users} detail="Real-time presence" icon={Activity} />
        <MetricCard label="Verifikatsiya navbati" value={pendingRequests.length} detail="Ko‘rib chiqilishi kerak" icon={BadgeCheck} />
        <MetricCard label="24 soatdagi postlar" value={stats.posts_24h} detail={`${stats.total_posts.toLocaleString()} jami`} icon={FileText} />
        <MetricCard label="24 soatdagi xabarlar" value={stats.messages_24h} detail={`${stats.total_messages.toLocaleString()} jami`} icon={MessageSquare} />
        <MetricCard label="Adminlar" value={admins.length} detail="Faol rollar" icon={ShieldCheck} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
        <section className="rounded-2xl border border-border bg-card shadow-sm">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <div>
              <h2 className="font-semibold">Ish navbati</h2>
              <p className="text-sm text-muted-foreground">Admin e’tiborini kutayotgan asosiy yo‘nalishlar</p>
            </div>
            <Badge variant="secondary" className="rounded-full font-normal">Live</Badge>
          </div>
          <div className="divide-y divide-border">
            {[
              { title: 'Verifikatsiya so‘rovlari', value: pendingRequests.length, hint: 'Pending arizalar', icon: BadgeCheck, section: 'verification' as AdminSection },
              { title: 'Foydalanuvchilar', value: stats.total_users, hint: 'Profil va hisob nazorati', icon: Users, section: 'users' as AdminSection },
              { title: 'Kontent moderatsiyasi', value: stats.posts_24h, hint: 'Bugungi yangi postlar', icon: FileText, section: 'content' as AdminSection },
              { title: 'Kirish huquqlari', value: admins.length, hint: 'Admin roliga ega hisoblar', icon: ShieldCheck, section: 'team' as AdminSection },
            ].map((item) => (
              <button
                key={item.title}
                type="button"
                onClick={() => navigate(sectionPath(item.section))}
                className="flex w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-muted/35"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-muted/35">
                  <item.icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{item.title}</p>
                  <p className="text-sm text-muted-foreground">{item.hint}</p>
                </div>
                <span className="text-lg font-semibold tabular-nums">{item.value.toLocaleString()}</span>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </button>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="font-semibold">30 kunlik o‘sish</h2>
              <p className="text-sm text-muted-foreground">Yangi hisoblar va tasdiqlangan profillar</p>
            </div>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="space-y-5">
            <div>
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Yangi foydalanuvchilar</span>
                <span className="font-semibold tabular-nums">{stats.new_users_30d.toLocaleString()}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-foreground"
                  style={{ width: `${Math.min(100, stats.total_users ? (stats.new_users_30d / stats.total_users) * 100 : 0)}%` }}
                />
              </div>
            </div>
            <div>
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Tasdiqlangan profillar</span>
                <span className="font-semibold tabular-nums">{stats.verified_users.toLocaleString()}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-foreground/70"
                  style={{ width: `${Math.min(100, stats.total_users ? (stats.verified_users / stats.total_users) * 100 : 0)}%` }}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div className="rounded-xl border border-border bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground">7 kunlik yangi</p>
                <p className="mt-1 text-xl font-semibold tabular-nums">{stats.new_users_7d.toLocaleString()}</p>
              </div>
              <div className="rounded-xl border border-border bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground">Verified ulushi</p>
                <p className="mt-1 text-xl font-semibold tabular-nums">
                  {stats.total_users ? `${Math.round((stats.verified_users / stats.total_users) * 100)}%` : '0%'}
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>

      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="font-semibold">Moderatsiya markazlari</h2>
            <p className="text-sm text-muted-foreground">Platformadagi maxsus nazorat oqimlari</p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => navigate('/admin/moderation')}>
            Barchasi <ArrowUpRight className="ml-1.5 h-3.5 w-3.5" />
          </Button>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <button onClick={() => navigate('/mini-apps/moderation')} className="flex items-center gap-4 rounded-xl border border-border p-4 text-left transition-colors hover:bg-muted/35">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted"><Sparkles className="h-4 w-4" /></div>
            <div className="flex-1"><p className="font-medium">Mini ilovalar moderatsiyasi</p><p className="text-sm text-muted-foreground">Publisher va ilova arizalarini tekshirish</p></div>
            <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
          </button>
          <button onClick={() => navigate('/stickers/moderation')} className="flex items-center gap-4 rounded-xl border border-border p-4 text-left transition-colors hover:bg-muted/35">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted"><Sticker className="h-4 w-4" /></div>
            <div className="flex-1"><p className="font-medium">Stikerlar moderatsiyasi</p><p className="text-sm text-muted-foreground">Paketlar va kontentni tekshirish</p></div>
            <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
      </section>
    </div>
  );

  const renderAnalytics = () => {
    const maxDau = Math.max(1, ...analytics.dauTrend.map((item) => item.dau));
    const topPages = analytics.pageStats.slice(0, 8);
    const topCountries = analytics.countryStats.slice(0, 8);
    const maxPageVisits = Math.max(1, ...topPages.map((item) => item.visit_count));
    const maxCountryUsers = Math.max(1, ...topCountries.map((item) => item.user_count));

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <MetricCard label="Jami foydalanuvchi" value={stats.total_users} icon={Users} detail={`${stats.online_users.toLocaleString()} onlayn`} />
          <MetricCard label="24 soatda yangi" value={stats.new_users_24h} icon={UserPlus} detail={`${stats.new_users_7d.toLocaleString()} oxirgi 7 kunda`} />
          <MetricCard label="Jami postlar" value={stats.total_posts} icon={FileText} detail={`+${stats.posts_24h} bugun`} />
          <MetricCard label="Jami xabarlar" value={stats.total_messages} icon={MessageSquare} detail={`+${stats.messages_24h} bugun`} />
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <div className="mb-5">
              <h2 className="font-semibold">Kunlik faol foydalanuvchilar</h2>
              <p className="text-sm text-muted-foreground">Oxirgi 30 kunlik DAU</p>
            </div>
            {analytics.dauTrend.length === 0 ? (
              <EmptyState title="Ma’lumot yo‘q" description="DAU ma’lumotlari yig‘ilgach bu yerda trend ko‘rinadi." />
            ) : (
              <div className="flex h-56 items-end gap-1.5">
                {analytics.dauTrend.map((item) => (
                  <div key={item.date} className="group flex min-w-0 flex-1 flex-col items-center justify-end gap-2" title={`${item.date}: ${item.dau}`}>
                    <div className="w-full rounded-t-sm bg-foreground/85 transition-opacity group-hover:opacity-60" style={{ height: `${Math.max(4, (item.dau / maxDau) * 180)}px` }} />
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <div className="mb-5">
              <h2 className="font-semibold">Eng ko‘p ishlatilgan sahifalar</h2>
              <p className="text-sm text-muted-foreground">Tashriflar bo‘yicha top yo‘nalishlar</p>
            </div>
            <div className="space-y-4">
              {topPages.map((item) => (
                <div key={item.page}>
                  <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
                    <span className="truncate font-medium">{item.page}</span>
                    <span className="tabular-nums text-muted-foreground">{item.visit_count.toLocaleString()}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-foreground/75" style={{ width: `${Math.max(3, (item.visit_count / maxPageVisits) * 100)}%` }} /></div>
                </div>
              ))}
              {topPages.length === 0 && <p className="py-12 text-center text-sm text-muted-foreground">Ma’lumot yo‘q</p>}
            </div>
          </section>
        </div>

        <div className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
          <AdminOnlineUsersMap />
          <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <div className="mb-5"><h2 className="font-semibold">Davlatlar bo‘yicha</h2><p className="text-sm text-muted-foreground">Foydalanuvchi taqsimoti</p></div>
            <div className="space-y-4">
              {topCountries.map((item, index) => (
                <div key={item.country}>
                  <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
                    <span className="truncate"><span className="mr-2 text-muted-foreground">{String(index + 1).padStart(2, '0')}</span>{item.country}</span>
                    <span className="font-medium tabular-nums">{item.user_count.toLocaleString()}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-foreground/65" style={{ width: `${Math.max(3, (item.user_count / maxCountryUsers) * 100)}%` }} /></div>
                </div>
              ))}
              {topCountries.length === 0 && <p className="py-12 text-center text-sm text-muted-foreground">Ma’lumot yo‘q</p>}
            </div>
          </section>
        </div>
      </div>
    );
  };

  const renderUsers = () => (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={userSearch} onChange={(event) => setUserSearch(event.target.value)} placeholder="Username, ism yoki davlat bo‘yicha qidiring" className="pl-9" />
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>{filteredUsers.length.toLocaleString()} ko‘rsatilmoqda</span>
          <Button variant="outline" size="sm" onClick={() => void fetchUsers()} disabled={loadingUsers}>
            <RefreshCw className={cn('mr-1.5 h-3.5 w-3.5', loadingUsers && 'animate-spin')} />Yangilash
          </Button>
        </div>
      </div>

      <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="hidden grid-cols-[minmax(220px,1.4fr)_110px_130px_150px_90px] gap-4 border-b border-border bg-muted/25 px-4 py-3 text-xs font-medium uppercase tracking-wide text-muted-foreground md:grid">
          <span>Foydalanuvchi</span><span>Holat</span><span>Davlat</span><span>Statistika</span><span className="text-right">Amal</span>
        </div>
        {loadingUsers ? (
          <div className="flex min-h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : filteredUsers.length === 0 ? (
          <EmptyState title="Foydalanuvchi topilmadi" description="Qidiruv so‘rovini o‘zgartirib qayta urinib ko‘ring." />
        ) : (
          <div className="divide-y divide-border">
            {filteredUsers.map((item) => (
              <div key={item.id} className="grid gap-3 px-4 py-4 transition-colors hover:bg-muted/20 md:grid-cols-[minmax(220px,1.4fr)_110px_130px_150px_90px] md:items-center md:gap-4">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="relative shrink-0">
                    <Avatar className="h-10 w-10"><AvatarImage src={item.avatar_url || ''} /><AvatarFallback>{(item.display_name || item.username || '?')[0]?.toUpperCase()}</AvatarFallback></Avatar>
                    {item.is_online && <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card bg-foreground" />}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5"><p className="truncate font-medium">{item.display_name || item.username || 'Nomsiz foydalanuvchi'}</p>{item.is_verified && <BadgeCheck className="h-4 w-4 shrink-0" />}</div>
                    <p className="truncate text-sm text-muted-foreground">@{item.username || 'username-yoq'}</p>
                  </div>
                </div>
                <div><Badge variant="secondary" className="rounded-full font-normal">{item.is_online ? 'Online' : 'Offline'}</Badge></div>
                <p className="text-sm text-muted-foreground">{item.country || '—'}</p>
                <div className="text-sm"><p>{item.posts_count || 0} post</p><p className="text-xs text-muted-foreground">{item.followers_count || 0} kuzatuvchi</p></div>
                <div className="flex justify-end">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                      <DropdownMenuLabel>Foydalanuvchi amallari</DropdownMenuLabel>
                      {item.username && <DropdownMenuItem onClick={() => navigate(`/user/${item.username}`)}><ArrowUpRight className="mr-2 h-4 w-4" />Profilni ochish</DropdownMenuItem>}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => void toggleVerification(item)} disabled={processingId === item.id}>{item.is_verified ? <UserMinus className="mr-2 h-4 w-4" /> : <UserCheck className="mr-2 h-4 w-4" />}{item.is_verified ? 'Verifikatsiyani olib tashlash' : 'Tasdiqlash'}</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );

  const renderVerification = () => (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div className="flex rounded-xl bg-muted p-1">
          <button type="button" onClick={() => setVerificationMode('pending')} className={cn('rounded-lg px-3 py-1.5 text-sm font-medium transition-colors', verificationMode === 'pending' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>Navbat <span className="ml-1.5 tabular-nums">{pendingRequests.length}</span></button>
          <button type="button" onClick={() => setVerificationMode('history')} className={cn('rounded-lg px-3 py-1.5 text-sm font-medium transition-colors', verificationMode === 'history' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>Tarix <span className="ml-1.5 tabular-nums">{processedRequests.length}</span></button>
        </div>
        <div className="relative w-full lg:max-w-md"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={verificationSearch} onChange={(event) => setVerificationSearch(event.target.value)} placeholder="Ariza, username yoki kategoriya" className="pl-9" /></div>
      </div>

      {loadingCore ? (
        <div className="flex min-h-72 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : visibleVerificationRequests.length === 0 ? (
        <EmptyState title={verificationMode === 'pending' ? 'Navbat bo‘sh' : 'Tarix topilmadi'} description={verificationMode === 'pending' ? 'Hozir ko‘rib chiqilishi kerak bo‘lgan verifikatsiya arizasi yo‘q.' : 'Qidiruv shartlariga mos ko‘rib chiqilgan ariza topilmadi.'} />
      ) : (
        <div className="grid gap-3 xl:grid-cols-2">
          {visibleVerificationRequests.map((request) => (
            <article key={request.id} className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <div className="flex items-start gap-3">
                <Avatar className="h-11 w-11"><AvatarImage src={request.profile?.avatar_url || ''} /><AvatarFallback>{request.full_name[0]?.toUpperCase()}</AvatarFallback></Avatar>
                <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{request.full_name}</h3><Badge variant="outline" className="rounded-full font-normal">{request.category}</Badge></div><p className="text-sm text-muted-foreground">@{request.profile?.username || 'unknown'}</p></div>
                {request.status !== 'pending' && <Badge variant={request.status === 'approved' ? 'secondary' : 'outline'} className="rounded-full font-normal">{request.status === 'approved' ? 'Tasdiqlangan' : 'Rad etilgan'}</Badge>}
              </div>

              <div className="mt-4 space-y-3 text-sm">
                {request.known_as && <div><p className="text-xs text-muted-foreground">Taniqli nomi</p><p>{request.known_as}</p></div>}
                {request.additional_info && <div><p className="text-xs text-muted-foreground">Qo‘shimcha ma’lumot</p><p className="line-clamp-3 leading-relaxed">{request.additional_info}</p></div>}
                {request.rejection_reason && <div className="rounded-xl bg-muted/50 p-3"><p className="text-xs text-muted-foreground">Rad etish sababi</p><p className="mt-1">{request.rejection_reason}</p></div>}
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-4">
                <span className="mr-auto text-xs text-muted-foreground">{format(new Date(request.created_at), 'dd.MM.yyyy · HH:mm')}</span>
                {request.bio_link && <Button asChild variant="ghost" size="sm"><a href={request.bio_link} target="_blank" rel="noreferrer">Manba <ArrowUpRight className="ml-1 h-3.5 w-3.5" /></a></Button>}
                {request.id_document_url && <Button asChild variant="outline" size="sm"><a href={request.id_document_url} target="_blank" rel="noreferrer">Hujjat <ArrowUpRight className="ml-1 h-3.5 w-3.5" /></a></Button>}
                {request.status === 'pending' && <><Button variant="outline" size="sm" onClick={() => { setSelectedRequest(request); setRejectionReason(''); }}>Rad etish</Button><Button size="sm" onClick={() => void approveVerification(request)} disabled={processingId === request.id}>{processingId === request.id ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />}Tasdiqlash</Button></>}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );

  const renderTeam = () => (
    <div className="space-y-4">
      <section className="rounded-2xl border border-border bg-card shadow-sm">
        <div className="flex flex-col gap-3 border-b border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div><h2 className="font-semibold">Admin jamoasi</h2><p className="text-sm text-muted-foreground">Platformani boshqarish huquqiga ega hisoblar</p></div>
          <Button onClick={() => setAddAdminOpen(true)}><UserPlus className="mr-2 h-4 w-4" />Admin qo‘shish</Button>
        </div>
        {loadingCore ? <div className="flex min-h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div> : <div className="divide-y divide-border">{admins.map((admin) => (
          <div key={admin.id} className="flex items-center gap-4 px-5 py-4">
            <Avatar className="h-10 w-10"><AvatarImage src={admin.profile?.avatar_url || ''} /><AvatarFallback>{(admin.profile?.display_name || admin.profile?.username || '?')[0]?.toUpperCase()}</AvatarFallback></Avatar>
            <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><p className="truncate font-medium">{admin.profile?.display_name || admin.profile?.username || 'Admin'}</p>{admin.user_id === user?.id && <Badge variant="secondary" className="rounded-full font-normal">Siz</Badge>}</div><p className="truncate text-sm text-muted-foreground">@{admin.profile?.username || 'username-yoq'}</p></div>
            <div className="hidden text-right text-xs text-muted-foreground sm:block"><p>Admin</p><p>{format(new Date(admin.created_at), 'dd.MM.yyyy')}</p></div>
            <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive" onClick={() => setRemoveAdmin(admin)} disabled={admin.user_id === user?.id || processingId === admin.id}><UserMinus className="mr-1.5 h-4 w-4" />Olib tashlash</Button>
          </div>
        ))}{admins.length === 0 && <div className="p-5"><EmptyState title="Admin topilmadi" description="Admin rollari ro‘yxati bo‘sh." /></div>}</div>}
      </section>

      <section className="rounded-2xl border border-border bg-muted/20 p-5">
        <div className="flex gap-3"><Shield className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" /><div><h3 className="font-medium">Kirish nazorati</h3><p className="mt-1 text-sm leading-relaxed text-muted-foreground">Admin huquqi platformadagi maxsus jadvallar, verifikatsiya, foydalanuvchi ma’lumotlari va moderatsiya amallariga kirish beradi. Rolni faqat ishonchli operatorlarga bering.</p></div></div>
      </section>
    </div>
  );

  const renderModeration = () => (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {[
        { title: 'Post va izohlar', description: 'Platformadagi kontentni ko‘rish va kerak bo‘lsa olib tashlash.', icon: FileText, path: '/admin/content' },
        { title: 'Foydalanuvchilar', description: 'Profil, verifikatsiya va umumiy hisob holatini tekshirish.', icon: Users, path: '/admin/users' },
        { title: 'Verifikatsiya', description: 'Tasdiqlash arizalarini hujjatlar bilan birga ko‘rib chiqish.', icon: BadgeCheck, path: '/admin/verification' },
        { title: 'Mini ilovalar', description: 'Publisherlar yuborgan mini ilovalarni moderatsiya qilish.', icon: Sparkles, path: '/mini-apps/moderation' },
        { title: 'Stiker paketlari', description: 'Stiker paketlari va ularning kontentini tekshirish.', icon: Sticker, path: '/stickers/moderation' },
        { title: 'Admin huquqlari', description: 'Operatorlar va kirish rollarini boshqarish.', icon: ShieldCheck, path: '/admin/team' },
      ].map((tool) => (
        <button key={tool.title} type="button" onClick={() => navigate(tool.path)} className="group rounded-2xl border border-border bg-card p-5 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
          <div className="mb-8 flex items-start justify-between"><div className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-muted/35"><tool.icon className="h-4 w-4" /></div><ArrowUpRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" /></div>
          <h3 className="font-semibold">{tool.title}</h3><p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{tool.description}</p>
        </button>
      ))}
    </div>
  );

  return (
    <div className="admin-neutral flex h-full min-h-0 bg-background text-foreground">
      <aside className="hidden w-[272px] shrink-0 flex-col border-r border-border bg-card/60 lg:flex">
        <div className="flex h-16 items-center gap-3 border-b border-border px-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-foreground text-background"><Shield className="h-4 w-4" /></div>
          <div className="min-w-0"><p className="truncate text-sm font-semibold">Alsamos Admin</p><p className="text-xs text-muted-foreground">Control center</p></div>
        </div>
        <ScrollArea className="min-h-0 flex-1">
          <nav className="space-y-1 p-3">
            {ADMIN_SECTIONS.map((item) => {
              const active = section === item.id;
              return (
                <button key={item.id} type="button" onClick={() => navigate(sectionPath(item.id))} className={cn('flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors', active ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}>
                  <item.icon className="h-4 w-4 shrink-0" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{item.label}</p>{!active && <p className="mt-0.5 truncate text-[11px] opacity-70">{item.description}</p>}</div>{item.id === 'verification' && pendingRequests.length > 0 && <span className={cn('min-w-5 rounded-full px-1.5 text-center text-[10px] font-semibold tabular-nums', active ? 'bg-background/15 text-background' : 'bg-muted text-foreground')}>{pendingRequests.length > 99 ? '99+' : pendingRequests.length}</span>}
                </button>
              );
            })}
          </nav>
        </ScrollArea>
        <div className="border-t border-border p-3">
          <button onClick={() => navigate('/home')} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"><Home className="h-4 w-4" /><span className="text-sm">Platformaga qaytish</span></button>
          <div className="mt-2 flex items-center gap-3 rounded-xl border border-border bg-background p-3"><Avatar className="h-9 w-9"><AvatarImage src={profile?.avatar_url || ''} /><AvatarFallback>{(profile?.display_name || profile?.username || 'A')[0]?.toUpperCase()}</AvatarFallback></Avatar><div className="min-w-0"><p className="truncate text-sm font-medium">{profile?.display_name || 'Administrator'}</p><p className="truncate text-xs text-muted-foreground">@{profile?.username || 'admin'}</p></div></div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b border-border bg-background/95 px-4 backdrop-blur-xl sm:px-6">
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="lg:hidden"><Menu className="h-5 w-5" /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-72">
              <DropdownMenuLabel>Alsamos Admin</DropdownMenuLabel><DropdownMenuSeparator />
              {ADMIN_SECTIONS.map((item) => <DropdownMenuItem key={item.id} onClick={() => navigate(sectionPath(item.id))} className={cn(section === item.id && 'font-semibold')}><item.icon className="mr-2 h-4 w-4" />{item.label}{item.id === 'verification' && pendingRequests.length > 0 && <span className="ml-auto text-xs tabular-nums text-muted-foreground">{pendingRequests.length}</span>}</DropdownMenuItem>)}
              <DropdownMenuSeparator /><DropdownMenuItem onClick={() => navigate('/home')}><Home className="mr-2 h-4 w-4" />Platformaga qaytish</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><h1 className="truncate text-base font-semibold sm:text-lg">{sectionMeta.label}</h1>{section === 'overview' && <Badge variant="outline" className="hidden rounded-full font-normal sm:inline-flex">Admin</Badge>}</div><p className="hidden truncate text-xs text-muted-foreground sm:block">{sectionMeta.description}</p></div>
          <Button variant="outline" size="sm" onClick={() => void refreshCurrent()} disabled={loadingCore || analytics.isLoading || loadingUsers}><RefreshCw className={cn('mr-1.5 h-3.5 w-3.5', (loadingCore || analytics.isLoading || loadingUsers) && 'animate-spin')} /><span className="hidden sm:inline">Yangilash</span></Button>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain">
          <div className="mx-auto w-full max-w-[1480px] p-4 sm:p-6 xl:p-8">
            {section === 'overview' && renderOverview()}
            {section === 'analytics' && renderAnalytics()}
            {section === 'content' && <AdminContentManagement />}
            {section === 'users' && renderUsers()}
            {section === 'verification' && renderVerification()}
            {section === 'team' && renderTeam()}
            {section === 'moderation' && renderModeration()}
          </div>
        </main>
      </div>

      <Dialog open={!!selectedRequest} onOpenChange={(open) => { if (!open) { setSelectedRequest(null); setRejectionReason(''); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Verifikatsiyani rad etish</DialogTitle><DialogDescription>Foydalanuvchiga aniq va tushunarli sabab yuboriladi.</DialogDescription></DialogHeader>
          <Textarea value={rejectionReason} onChange={(event) => setRejectionReason(event.target.value)} placeholder="Masalan: yuborilgan hujjatdagi ism profil ma’lumotlariga mos kelmadi." rows={5} />
          <DialogFooter><Button variant="outline" onClick={() => { setSelectedRequest(null); setRejectionReason(''); }}>Bekor qilish</Button><Button variant="destructive" onClick={() => void rejectVerification()} disabled={!selectedRequest || processingId === selectedRequest.id || rejectionReason.trim().length < 3}>{processingId === selectedRequest?.id && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Rad etish</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={addAdminOpen} onOpenChange={setAddAdminOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Admin qo‘shish</DialogTitle><DialogDescription>Username orqali mavjud foydalanuvchiga admin huquqini bering.</DialogDescription></DialogHeader>
          <div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">@</span><Input value={newAdminUsername} onChange={(event) => setNewAdminUsername(event.target.value)} placeholder="username" className="pl-7" onKeyDown={(event) => { if (event.key === 'Enter') void addAdmin(); }} /></div>
          <DialogFooter><Button variant="outline" onClick={() => setAddAdminOpen(false)}>Bekor qilish</Button><Button onClick={() => void addAdmin()} disabled={!newAdminUsername.trim() || processingId === 'add-admin'}>{processingId === 'add-admin' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Huquq berish</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!removeAdmin} onOpenChange={(open) => !open && setRemoveAdmin(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Admin huquqini olib tashlash</DialogTitle><DialogDescription>@{removeAdmin?.profile?.username || 'admin'} platforma boshqaruviga kira olmay qoladi. Bu amal foydalanuvchi hisobini o‘chirmaydi.</DialogDescription></DialogHeader>
          <DialogFooter><Button variant="outline" onClick={() => setRemoveAdmin(null)}>Bekor qilish</Button><Button variant="destructive" onClick={() => void confirmRemoveAdmin()} disabled={!removeAdmin || processingId === removeAdmin.id}>{processingId === removeAdmin?.id && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Huquqni olib tashlash</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
