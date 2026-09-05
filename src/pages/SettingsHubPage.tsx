import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTheme } from 'next-themes';
import {
  AlertTriangle,
  AtSign,
  BadgeCheck,
  BarChart3,
  Bell,
  CalendarDays,
  Camera,
  CheckCircle2,
  ChevronRight,
  CircleUserRound,
  ExternalLink,
  Eye,
  Globe,
  HardDrive,
  Heart,
  Image as ImageIcon,
  Laptop,
  Link as LinkIcon,
  Loader2,
  LogOut,
  MapPin,
  MessageCircle,
  Monitor,
  Moon,
  Palette,
  Save,
  Shield,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Sun,
  Trash2,
  User,
  UserPlus,
  Wallet,
  Wifi,
  XCircle,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useUserSettings } from '@/hooks/useUserSettings';
import { useNotificationPermission } from '@/hooks/useNotificationPermission';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { uploadMedia } from '@/lib/mediaUpload';
import { PROFILE_PUBLIC_COLUMNS } from '@/lib/profileFields';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { VerificationRequestDialog } from '@/components/profile/VerificationRequestDialog';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { ChatWallpaperEditor } from '@/components/settings/ChatWallpaperEditor';
import { ChatAccentEditor } from '@/components/settings/ChatAccentEditor';
import { MediaAutoDownloadEditor } from '@/components/settings/MediaAutoDownloadEditor';
import { LocationPicker } from '@/components/settings/LocationPicker';
import { TwoFactorCard } from '@/components/security/TwoFactorCard';
import { ActiveDevicesCard } from '@/components/security/ActiveDevicesCard';

type SectionKey =
  | 'account'
  | 'privacy'
  | 'security'
  | 'devices'
  | 'notifications'
  | 'appearance'
  | 'language'
  | 'chat-wallpaper'
  | 'data-storage'
  | 'danger';

interface ProfileForm {
  display_name: string;
  username: string;
  bio: string;
  avatar_url: string | null;
  location: string;
  website: string;
  country: string | null;
  birth_date: string | null;
}

interface SectionItem {
  value: SectionKey | 'payment' | 'activity';
  label: string;
  description: string;
  icon: React.ElementType;
  tint: string;
  to?: string;
  danger?: boolean;
}

const EMPTY_PROFILE: ProfileForm = {
  display_name: '',
  username: '',
  bio: '',
  avatar_url: null,
  location: '',
  website: '',
  country: null,
  birth_date: null,
};

const COUNTRIES: Array<{ value: string; label: string }> = [
  { value: 'Uzbekistan', label: '🇺🇿 O‘zbekiston' },
  { value: 'Russia', label: '🇷🇺 Rossiya' },
  { value: 'Kazakhstan', label: '🇰🇿 Qozog‘iston' },
  { value: 'Kyrgyzstan', label: '🇰🇬 Qirg‘iziston' },
  { value: 'Tajikistan', label: '🇹🇯 Tojikiston' },
  { value: 'Turkmenistan', label: '🇹🇲 Turkmaniston' },
  { value: 'Turkey', label: '🇹🇷 Turkiya' },
  { value: 'United States', label: '🇺🇸 AQSh' },
  { value: 'United Kingdom', label: '🇬🇧 Buyuk Britaniya' },
  { value: 'Germany', label: '🇩🇪 Germaniya' },
  { value: 'France', label: '🇫🇷 Fransiya' },
  { value: 'Italy', label: '🇮🇹 Italiya' },
  { value: 'Spain', label: '🇪🇸 Ispaniya' },
  { value: 'South Korea', label: '🇰🇷 Janubiy Koreya' },
  { value: 'Japan', label: '🇯🇵 Yaponiya' },
  { value: 'China', label: '🇨🇳 Xitoy' },
  { value: 'India', label: '🇮🇳 Hindiston' },
  { value: 'UAE', label: '🇦🇪 BAA' },
  { value: 'Saudi Arabia', label: '🇸🇦 Saudiya Arabistoni' },
  { value: 'Other', label: '🌍 Boshqa' },
];

const SECTION_TO_SLUG: Record<SectionKey, string> = {
  account: 'profile',
  privacy: 'privacy',
  security: 'security',
  devices: 'devices',
  notifications: 'notifications',
  appearance: 'appearance',
  language: 'language',
  'chat-wallpaper': 'chat',
  'data-storage': 'data',
  danger: 'account-management',
};

const SLUG_TO_SECTION: Record<string, SectionKey> = {
  profile: 'account',
  account: 'account',
  privacy: 'privacy',
  security: 'security',
  devices: 'devices',
  notifications: 'notifications',
  appearance: 'appearance',
  language: 'language',
  chat: 'chat-wallpaper',
  'chat-wallpaper': 'chat-wallpaper',
  data: 'data-storage',
  'data-storage': 'data-storage',
  danger: 'danger',
  'account-management': 'danger',
};

const SETTINGS_GROUPS: { title: string; items: SectionItem[] }[] = [
  {
    title: 'Hisob',
    items: [
      { value: 'account', label: 'Profilim', description: 'Ism, username, bio va joylashuv', icon: User, tint: 'text-rose-500 bg-rose-500/10' },
      { value: 'privacy', label: 'Maxfiylik', description: 'Kim nimalarni ko‘rishi va aloqa ruxsatlari', icon: Shield, tint: 'text-amber-500 bg-amber-500/10' },
      { value: 'security', label: 'Xavfsizlik', description: '2FA, zaxira kodlar va himoya', icon: ShieldCheck, tint: 'text-emerald-600 bg-emerald-600/10' },
      { value: 'devices', label: 'Qurilmalar', description: 'Faol kirishlar va sessiyalar', icon: Smartphone, tint: 'text-sky-500 bg-sky-500/10' },
    ],
  },
  {
    title: 'Ilova',
    items: [
      { value: 'notifications', label: 'Bildirishnomalar', description: 'Push, ovoz va bildirishnoma turlari', icon: Bell, tint: 'text-violet-500 bg-violet-500/10' },
      { value: 'appearance', label: 'Ko‘rinish', description: 'Yorug‘, tungi yoki tizim rejimi', icon: Palette, tint: 'text-fuchsia-500 bg-fuchsia-500/10' },
      { value: 'language', label: 'Til va hudud', description: 'Interfeys tili va lokal sozlamalar', icon: Globe, tint: 'text-teal-500 bg-teal-500/10' },
    ],
  },
  {
    title: 'Chat va media',
    items: [
      { value: 'chat-wallpaper', label: 'Chat ko‘rinishi', description: 'Xabar aksenti va chat foni', icon: ImageIcon, tint: 'text-emerald-500 bg-emerald-500/10' },
      { value: 'data-storage', label: 'Ma’lumotlar va xotira', description: 'Media va avtomatik yuklab olish', icon: HardDrive, tint: 'text-cyan-500 bg-cyan-500/10' },
    ],
  },
  {
    title: 'Boshqa',
    items: [
      { value: 'payment', label: 'To‘lov', description: 'Balans va tranzaksiyalar', icon: Wallet, tint: 'text-lime-600 bg-lime-600/10', to: '/payment' },
      { value: 'activity', label: 'Faolligim', description: 'Sarflangan vaqt va statistika', icon: BarChart3, tint: 'text-indigo-500 bg-indigo-500/10', to: '/activity' },
      { value: 'danger', label: 'Hisobni boshqarish', description: 'Chiqish va hisobni o‘chirish', icon: AlertTriangle, tint: 'text-destructive bg-destructive/10', danger: true },
    ],
  },
];

function SectionCard({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('overflow-hidden rounded-2xl border border-border bg-card shadow-sm', className)}>
      <div className="border-b border-border/70 px-4 py-4 md:px-5">
        <h2 className="font-semibold tracking-tight">{title}</h2>
        {description && <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  );
}

function SettingRow({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-4 md:px-5">
      <div className="flex min-w-0 items-center gap-3.5">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted">
          <Icon className="h-5 w-5 text-muted-foreground" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium">{title}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function PushNotificationSettings() {
  const { permission, supported, requestPermission } = useNotificationPermission();
  const { toast } = useToast();

  const handleEnablePush = async () => {
    const granted = await requestPermission();
    toast({
      title: granted ? 'Push bildirishnomalar yoqildi' : 'Ruxsat berilmadi',
      description: granted
        ? 'Ilova fonda bo‘lganda ham muhim xabarlarni olasiz.'
        : 'Brauzer sozlamalarida bildirishnoma ruxsatini yoqing.',
      variant: granted ? undefined : 'destructive',
    });
  };

  return (
    <SectionCard title="Push bildirishnomalar" description="Brauzer darajasidagi bildirishnoma ruxsatini boshqaring.">
      <SettingRow
        icon={Bell}
        title="Brauzer bildirishnomalari"
        description={
          !supported
            ? 'Bu brauzer push bildirishnomalarni qo‘llab-quvvatlamaydi.'
            : permission === 'granted'
              ? 'Yoqilgan — ilova fonda bo‘lganda ham bildirishnoma keladi.'
              : permission === 'denied'
                ? 'Bloklangan — brauzer sozlamalaridan qayta ruxsat bering.'
                : 'Yoqtirish, izoh, obuna va eslatishlar uchun ruxsat bering.'
        }
      >
        {!supported ? (
          <span className="text-xs font-medium text-muted-foreground">Mavjud emas</span>
        ) : permission === 'granted' ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-600">
            <CheckCircle2 className="h-3.5 w-3.5" /> Yoqilgan
          </span>
        ) : permission === 'denied' ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-destructive/10 px-2.5 py-1 text-xs font-semibold text-destructive">
            <XCircle className="h-3.5 w-3.5" /> Bloklangan
          </span>
        ) : (
          <Button variant="outline" size="sm" onClick={handleEnablePush}>Yoqish</Button>
        )}
      </SettingRow>
    </SectionCard>
  );
}

export default function SettingsHubPage() {
  const navigate = useNavigate();
  const { section: routeSlug } = useParams<{ section?: string }>();
  const [searchParams] = useSearchParams();
  const { theme, setTheme } = useTheme();
  const { user, logout } = useAuth();
  const { settings, sessions, isLoading, updateSettings, logoutSession, logoutAllOtherSessions } = useUserSettings();
  const { toast } = useToast();

  const [profile, setProfile] = useState<ProfileForm>(EMPTY_PROFILE);
  const [savedProfile, setSavedProfile] = useState<ProfileForm>(EMPTY_PROFILE);
  const [saving, setSaving] = useState(false);
  const [verificationDialogOpen, setVerificationDialogOpen] = useState(false);
  const [logoutDialogOpen, setLogoutDialogOpen] = useState(false);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [logoutAllDialogOpen, setLogoutAllDialogOpen] = useState(false);
  const [deleteAccountDialogOpen, setDeleteAccountDialogOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deletingAccount, setDeletingAccount] = useState(false);

  const routeSection = routeSlug ? SLUG_TO_SECTION[routeSlug] ?? null : null;
  const activeSection: SectionKey = routeSection ?? 'account';

  useEffect(() => {
    if (routeSlug && !SLUG_TO_SECTION[routeSlug]) {
      navigate('/settings', { replace: true });
    }
  }, [routeSlug, navigate]);

  useEffect(() => {
    if (routeSlug) return;
    const legacyTab = searchParams.get('tab');
    const legacySection = legacyTab ? SLUG_TO_SECTION[legacyTab] ?? (legacyTab as SectionKey) : null;
    if (legacySection && SECTION_TO_SLUG[legacySection]) {
      navigate(`/settings/${SECTION_TO_SLUG[legacySection]}`, { replace: true });
    }
  }, [routeSlug, searchParams, navigate]);

  useEffect(() => {
    const fetchProfile = async () => {
      if (!user?.id) return;

      const { data } = await supabase
        .from('profiles')
        .select(PROFILE_PUBLIC_COLUMNS)
        .eq('id', user.id)
        .single();

      const { data: privateRows } = await supabase.rpc('get_profile_private', {
        p_profile_id: user.id,
      });
      const privateProfile = Array.isArray(privateRows) ? privateRows[0] : privateRows;

      if (!data) return;
      const nextProfile: ProfileForm = {
        display_name: data.display_name || '',
        username: data.username || '',
        bio: data.bio || '',
        avatar_url: data.avatar_url,
        location: data.location || '',
        website: data.website || '',
        country: privateProfile?.country || null,
        birth_date: privateProfile?.birth_date || null,
      };
      setProfile(nextProfile);
      setSavedProfile(nextProfile);
    };

    fetchProfile();
  }, [user?.id]);

  const isProfileDirty = useMemo(
    () => JSON.stringify(profile) !== JSON.stringify(savedProfile),
    [profile, savedProfile],
  );

  const profileCompletion = useMemo(() => {
    const fields = [
      profile.avatar_url,
      profile.display_name,
      profile.username,
      profile.bio,
      profile.location,
      profile.website,
      profile.country,
    ];
    return Math.round((fields.filter(Boolean).length / fields.length) * 100);
  }, [profile]);

  const activeLabel = useMemo(() => {
    return SETTINGS_GROUPS.flatMap((group) => group.items).find((item) => item.value === activeSection)?.label || 'Sozlamalar';
  }, [activeSection]);

  const openSection = (section: SectionKey) => {
    navigate(`/settings/${SECTION_TO_SLUG[section]}`);
  };

  const handleSaveProfile = async () => {
    if (!user?.id) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          display_name: profile.display_name.trim(),
          username: profile.username.trim(),
          bio: profile.bio.trim(),
          location: profile.location.trim(),
          website: profile.website.trim(),
          country: profile.country,
          birth_date: profile.birth_date,
        })
        .eq('id', user.id);

      if (error) throw error;
      setSavedProfile(profile);
      toast({ title: 'Profil saqlandi', description: 'O‘zgarishlar muvaffaqiyatli saqlandi.' });
    } catch (error: any) {
      toast({ title: 'Xatolik', description: error.message || 'Profilni saqlab bo‘lmadi.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !user?.id) return;

    try {
      const uploaded = await uploadMedia(file, { type: 'avatar', visibility: 'public' });
      const { error } = await supabase.from('profiles').update({ avatar_url: uploaded.url }).eq('id', user.id);
      if (error) throw error;
      setProfile((prev) => ({ ...prev, avatar_url: uploaded.url }));
      setSavedProfile((prev) => ({ ...prev, avatar_url: uploaded.url }));
      toast({ title: 'Profil rasmi yangilandi' });
    } catch (error: any) {
      toast({ title: 'Xatolik', description: error.message || 'Rasmni yuklab bo‘lmadi.', variant: 'destructive' });
    }
  };

  const handleLogoutSession = async () => {
    if (!selectedSessionId) return;
    await logoutSession(selectedSessionId);
    setSelectedSessionId(null);
    setLogoutDialogOpen(false);
  };

  const handleDeleteAccount = async () => {
    if (!user?.id || deleteConfirmText !== 'DELETE') return;
    setDeletingAccount(true);
    try {
      const { error } = await supabase.from('profiles').delete().eq('id', user.id);
      if (error) throw error;
      await supabase.auth.signOut();
      toast({ title: 'Hisob o‘chirildi', description: 'Hisobingiz va profil ma’lumotlari o‘chirildi.' });
      navigate('/');
    } catch (error: any) {
      toast({ title: 'Xatolik', description: error.message || 'Hisobni o‘chirib bo‘lmadi.', variant: 'destructive' });
    } finally {
      setDeletingAccount(false);
      setDeleteAccountDialogOpen(false);
      setDeleteConfirmText('');
    }
  };

  const getDeviceIcon = (deviceType: string | null) => {
    if (deviceType?.toLowerCase() === 'mobile') return Smartphone;
    if (deviceType?.toLowerCase() === 'tablet') return Laptop;
    return Monitor;
  };

  if (isLoading) {
    return (
      <div className="flex h-[calc(100vh-4rem)] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-3 pb-24 pt-4 md:px-5 md:pb-10 md:pt-7">
      <div className="mb-5 flex items-start justify-between gap-4 md:mb-7">
        <div className="flex min-w-0 items-center gap-2.5">
          {routeSection && (
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => navigate('/settings')}
              aria-label="Sozlamalar ro‘yxatiga qaytish"
            >
              <ChevronRight className="h-5 w-5 rotate-180" />
            </Button>
          )}
          <div className="min-w-0">
            <h1 className="truncate text-xl font-bold tracking-tight md:text-2xl">
              {routeSection ? activeLabel : 'Sozlamalar'}
            </h1>
            <p className="mt-1 hidden text-sm text-muted-foreground md:block">
              Hisobingiz, maxfiylik, xavfsizlik va ilova tajribasini bitta markazdan boshqaring.
            </p>
          </div>
        </div>
        <div className="hidden items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground md:flex">
          <ShieldCheck className="h-3.5 w-3.5" /> Hisob markazi
        </div>
      </div>

      <Tabs value={activeSection} className="md:grid md:grid-cols-[330px_minmax(0,1fr)] md:items-start md:gap-6">
        <aside className={cn('space-y-5', routeSection && 'hidden md:block')}>
          <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
            <div className="relative overflow-hidden p-4">
              <div className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-primary/5 blur-2xl" />
              <div className="relative flex items-center gap-3">
                <Avatar className="h-11 w-11 ring-1 ring-border">
                  <AvatarImage src={profile.avatar_url || ''} />
                  <AvatarFallback>{profile.display_name?.[0] || user?.email?.[0]?.toUpperCase() || 'A'}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{profile.display_name || 'Profilingiz'}</p>
                  <p className="truncate text-xs text-muted-foreground">@{profile.username || 'username'}</p>
                </div>
                <span className="rounded-full bg-muted px-2 py-1 text-[10px] font-semibold text-muted-foreground">{profileCompletion}%</span>
              </div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-foreground/70 transition-all" style={{ width: `${profileCompletion}%` }} />
              </div>
            </div>
          </div>

          {SETTINGS_GROUPS.map((group) => (
            <div key={group.title}>
              <p className="px-1 pb-2 text-[11px] font-semibold uppercase tracking-[0.09em] text-muted-foreground">{group.title}</p>
              <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
                {group.items.map((item, index) => {
                  const isActive = item.value === activeSection;
                  return (
                    <button
                      key={item.value}
                      type="button"
                      aria-current={isActive ? 'page' : undefined}
                      onClick={() => item.to ? navigate(item.to) : openSection(item.value as SectionKey)}
                      className={cn(
                        'flex w-full items-center gap-3 px-3.5 py-3.5 text-left transition-colors',
                        index > 0 && 'border-t border-border/60',
                        isActive ? 'bg-accent/80' : 'hover:bg-accent/50',
                      )}
                    >
                      <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', item.tint)}>
                        <item.icon className="h-[18px] w-[18px]" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={cn('block truncate text-sm font-medium', isActive && 'font-semibold', item.danger && 'text-destructive')}>{item.label}</span>
                        <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{item.description}</span>
                      </span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </aside>

        <main className={cn('min-w-0', !routeSection && 'hidden md:block')}>
          <TabsContent value="account" className="m-0 space-y-5">
            <section className="relative overflow-hidden rounded-2xl border border-border bg-card p-5 shadow-sm md:p-6">
              <div className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-primary/5 blur-3xl" />
              <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-4">
                  <label className="group relative shrink-0 cursor-pointer">
                    <input type="file" accept="image/*" onChange={handleAvatarUpload} className="hidden" />
                    <Avatar className="h-20 w-20 ring-2 ring-background shadow-md md:h-24 md:w-24">
                      <AvatarImage src={profile.avatar_url || ''} />
                      <AvatarFallback className="text-2xl">{profile.display_name?.[0] || user?.email?.[0]?.toUpperCase() || 'A'}</AvatarFallback>
                    </Avatar>
                    <span className="absolute bottom-0 right-0 flex h-8 w-8 items-center justify-center rounded-full border-2 border-card bg-foreground text-background shadow-sm transition-transform group-hover:scale-105">
                      <Camera className="h-4 w-4" />
                    </span>
                  </label>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate text-xl font-bold tracking-tight">{profile.display_name || 'Ismingizni kiriting'}</h2>
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-1 text-[10px] font-semibold text-emerald-600">
                        <Sparkles className="h-3 w-3" /> Profil markazi
                      </span>
                    </div>
                    <p className="mt-1 truncate text-sm text-muted-foreground">@{profile.username || 'username'}</p>
                    <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                      <span>Profil to‘liqligi</span>
                      <span className="font-semibold text-foreground">{profileCompletion}%</span>
                    </div>
                    <div className="mt-1.5 h-1.5 w-44 max-w-full overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-foreground/70 transition-all" style={{ width: `${profileCompletion}%` }} />
                    </div>
                  </div>
                </div>
                <Button variant="outline" className="shrink-0" onClick={() => navigate('/profile')}>
                  <CircleUserRound className="mr-2 h-4 w-4" /> Profilni ko‘rish
                </Button>
              </div>
            </section>

            <SectionCard title="Asosiy ma’lumotlar" description="Odamlar profilingizda ko‘radigan asosiy identifikatsiya ma’lumotlari.">
              <div className="grid gap-5 p-4 md:p-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="display_name">Ko‘rinadigan ism</Label>
                    <Input id="display_name" value={profile.display_name} onChange={(e) => setProfile((prev) => ({ ...prev, display_name: e.target.value }))} className="mt-1.5" placeholder="Ism familiya" />
                  </div>
                  <div>
                    <Label htmlFor="username">Foydalanuvchi nomi</Label>
                    <div className="relative mt-1.5">
                      <AtSign className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input id="username" value={profile.username} onChange={(e) => setProfile((prev) => ({ ...prev, username: e.target.value }))} className="pl-9" placeholder="username" />
                    </div>
                    <p className="mt-1.5 text-[11px] text-muted-foreground">Profil havolangiz: alsamos.com/user/{profile.username || 'username'}</p>
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between gap-3">
                    <Label htmlFor="bio">Bio</Label>
                    <span className="text-[11px] text-muted-foreground">{profile.bio.length}/160</span>
                  </div>
                  <Textarea id="bio" value={profile.bio} maxLength={160} onChange={(e) => setProfile((prev) => ({ ...prev, bio: e.target.value }))} className="mt-1.5 min-h-[96px] resize-none" placeholder="O‘zingiz yoki faoliyatingiz haqida qisqacha yozing…" />
                </div>
              </div>
            </SectionCard>

            <SectionCard title="Qo‘shimcha ma’lumotlar" description="Profilingizni ishonchli va to‘liq ko‘rsatadigan qo‘shimcha ma’lumotlar.">
              <div className="grid gap-5 p-4 md:p-5">
                <div>
                  <div className="mb-2 flex items-center gap-2 text-sm font-medium"><MapPin className="h-4 w-4 text-muted-foreground" /> Joylashuv</div>
                  <LocationPicker value={profile.location} onChange={(value) => setProfile((prev) => ({ ...prev, location: value }))} />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="website" className="flex items-center gap-2"><LinkIcon className="h-3.5 w-3.5" /> Veb-sayt</Label>
                    <Input id="website" value={profile.website} onChange={(e) => setProfile((prev) => ({ ...prev, website: e.target.value }))} className="mt-1.5" placeholder="https://example.com" inputMode="url" />
                  </div>
                  <div>
                    <Label htmlFor="birth_date" className="flex items-center gap-2"><CalendarDays className="h-3.5 w-3.5" /> Tug‘ilgan sana</Label>
                    <Input id="birth_date" type="date" value={profile.birth_date || ''} onChange={(e) => setProfile((prev) => ({ ...prev, birth_date: e.target.value }))} className="mt-1.5" max={new Date().toISOString().split('T')[0]} />
                  </div>
                </div>
                <div>
                  <Label htmlFor="country">Davlat</Label>
                  <Select value={profile.country || ''} onValueChange={(value) => setProfile((prev) => ({ ...prev, country: value }))}>
                    <SelectTrigger id="country" className="mt-1.5"><SelectValue placeholder="Davlatingizni tanlang" /></SelectTrigger>
                    <SelectContent>
                      {COUNTRIES.map((country) => <SelectItem key={country.value} value={country.value}>{country.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </SectionCard>

            <div className={cn('flex flex-col gap-3 rounded-2xl border p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between', isProfileDirty ? 'border-amber-500/30 bg-amber-500/5' : 'border-border bg-card')}>
              <div>
                <p className="text-sm font-semibold">{isProfileDirty ? 'Saqlanmagan o‘zgarishlar bor' : 'Profil ma’lumotlari saqlangan'}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{isProfileDirty ? 'O‘zgarishlarni profilingizga qo‘llash uchun saqlang.' : 'Yangi o‘zgarish kiritsangiz, bu yerda saqlash holati ko‘rinadi.'}</p>
              </div>
              <Button onClick={handleSaveProfile} disabled={!isProfileDirty || saving} className="shrink-0">
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                O‘zgarishlarni saqlash
              </Button>
            </div>

            <SectionCard title="Profil ishonchliligi" description="Tasdiqlash foydalanuvchilarga rasmiy hisobni tezroq tanishga yordam beradi.">
              <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between md:p-5">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sky-500/10"><BadgeCheck className="h-5 w-5 text-sky-600" /></div>
                  <div><p className="text-sm font-medium">Tasdiqlangan nishon</p><p className="mt-0.5 text-xs text-muted-foreground">Shaxs yoki brend sifatida tasdiqlash uchun so‘rov yuboring.</p></div>
                </div>
                <Button variant="outline" onClick={() => setVerificationDialogOpen(true)}>So‘rov yuborish</Button>
              </div>
            </SectionCard>
            <VerificationRequestDialog open={verificationDialogOpen} onOpenChange={setVerificationDialogOpen} />
          </TabsContent>

          <TabsContent value="privacy" className="m-0 space-y-5">
            <SectionCard title="Maxfiylik sozlamalari" description="Profil faolligi va aloqa ruxsatlarini nazorat qiling.">
              <div className="divide-y divide-border/70">
                <SettingRow icon={Eye} title="Oxirgi ko‘rilgan vaqt" description="Onlayn va oxirgi faolligingizni kim ko‘rishini belgilang.">
                  <Select value={settings?.last_seen_visibility || 'everyone'} onValueChange={(value: 'everyone' | 'contacts' | 'nobody') => updateSettings({ last_seen_visibility: value })}>
                    <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="everyone">Hamma</SelectItem><SelectItem value="contacts">Kontaktlar</SelectItem><SelectItem value="nobody">Hech kim</SelectItem></SelectContent>
                  </Select>
                </SettingRow>
                <SettingRow icon={CheckCircle2} title="O‘qilgan belgisi" description="Xabarni o‘qiganingiz suhbatdoshga ko‘rinadi.">
                  <Switch checked={settings?.read_receipts_enabled ?? true} onCheckedChange={(checked) => updateSettings({ read_receipts_enabled: checked })} />
                </SettingRow>
                <SettingRow icon={Wifi} title="Kim qo‘ng‘iroq qila oladi" description="Sizga audio yoki video qo‘ng‘iroq boshlash ruxsati.">
                  <Select value={settings?.call_permissions || 'everyone'} onValueChange={(value: 'everyone' | 'contacts' | 'nobody') => updateSettings({ call_permissions: value })}>
                    <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="everyone">Hamma</SelectItem><SelectItem value="contacts">Kontaktlar</SelectItem><SelectItem value="nobody">Hech kim</SelectItem></SelectContent>
                  </Select>
                </SettingRow>
                <SettingRow icon={UserPlus} title="Guruhga qo‘shish" description="Sizni yangi guruhlarga kim qo‘sha olishini tanlang.">
                  <Select value={settings?.group_invite_permissions || 'everyone'} onValueChange={(value: 'everyone' | 'contacts' | 'nobody') => updateSettings({ group_invite_permissions: value })}>
                    <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="everyone">Hamma</SelectItem><SelectItem value="contacts">Kontaktlar</SelectItem><SelectItem value="nobody">Hech kim</SelectItem></SelectContent>
                  </Select>
                </SettingRow>
              </div>
            </SectionCard>
            <button type="button" onClick={() => openSection('security')} className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card p-4 text-left shadow-sm transition-colors hover:bg-accent/40">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10"><ShieldCheck className="h-5 w-5 text-emerald-600" /></div>
              <div className="min-w-0 flex-1"><p className="text-sm font-semibold">Xavfsizlik markazi</p><p className="mt-0.5 text-xs text-muted-foreground">2FA, zaxira kodlar va faol sessiyalarni tekshiring.</p></div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </button>
          </TabsContent>

          <TabsContent value="security" className="m-0 space-y-5">
            <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 md:p-5">
              <div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" /><div><p className="text-sm font-semibold">Xavfsizlik markazi</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">Ikki qadamli tasdiqlash va faol qurilmalarni muntazam tekshirish hisobingizni himoya qilishning eng muhim qismlaridan biridir.</p></div></div>
            </div>
            <TwoFactorCard />
            <ActiveDevicesCard />
          </TabsContent>

          <TabsContent value="devices" className="m-0 space-y-5">
            <SectionCard title="Faol sessiyalar" description={`${sessions.length} ta qurilma hisobingizga ulangan.`}>
              <div className="flex items-center justify-end border-b border-border/70 px-4 py-3 md:px-5">
                {sessions.length > 1 && <Button variant="outline" size="sm" onClick={() => setLogoutAllDialogOpen(true)}><XCircle className="mr-2 h-4 w-4" /> Boshqalarni chiqarish</Button>}
              </div>
              <ScrollArea className="max-h-[460px]">
                <div className="divide-y divide-border/70">
                  {sessions.map((session) => {
                    const DeviceIcon = getDeviceIcon(session.device_type);
                    const meta = [session.os_name, session.browser_name, session.ip_address || 'IP aniqlanmadi'].filter(Boolean).join(' • ');
                    return (
                      <div key={session.id} className="flex items-center justify-between gap-4 px-4 py-4 md:px-5">
                        <div className="flex min-w-0 items-center gap-3.5">
                          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-muted"><DeviceIcon className="h-5 w-5 text-muted-foreground" /></div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2"><p className="truncate text-sm font-medium">{session.device_name || session.browser_name || 'Noma’lum qurilma'}</p>{session.is_current && <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-600">Hozirgi</span>}</div>
                            <p className="mt-0.5 truncate text-xs text-muted-foreground">{meta}</p>
                            <p className="mt-0.5 text-[11px] text-muted-foreground">Oxirgi faollik: {session.last_active_at ? formatDistanceToNow(new Date(session.last_active_at), { addSuffix: true }) : 'aniqlanmadi'}</p>
                          </div>
                        </div>
                        {!session.is_current && <Button variant="ghost" size="icon" onClick={() => { setSelectedSessionId(session.id); setLogoutDialogOpen(true); }} aria-label="Sessiyani tugatish"><Trash2 className="h-4 w-4 text-destructive" /></Button>}
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </SectionCard>
          </TabsContent>

          <TabsContent value="notifications" className="m-0 space-y-5">
            <PushNotificationSettings />
            <SectionCard title="Media avtomatik ijro" description="Chatda media ko‘ringanda avtomatik ijro etilishini boshqaring.">
              <div className="divide-y divide-border/70">
                <SettingRow icon={Bell} title="Ovozli xabarlar" description="Ko‘ringanda avtomatik ijro etiladi."><Switch checked={settings?.autoplay_voice_messages ?? true} onCheckedChange={(checked) => updateSettings({ autoplay_voice_messages: checked })} /></SettingRow>
                <SettingRow icon={Bell} title="Video xabarlar" description="Ko‘ringanda avtomatik ijro etiladi."><Switch checked={settings?.autoplay_video_messages ?? true} onCheckedChange={(checked) => updateSettings({ autoplay_video_messages: checked })} /></SettingRow>
              </div>
            </SectionCard>
            <SectionCard title="Bildirishnoma turlari" description="Qaysi ijtimoiy faolliklar haqida xabar olishni tanlang.">
              <div className="divide-y divide-border/70">
                <SettingRow icon={Heart} title="Yoqtirishlar" description="Kimdir postingizni yoqtirganda."><Switch checked={settings?.notify_likes ?? true} onCheckedChange={(checked) => updateSettings({ notify_likes: checked })} /></SettingRow>
                <SettingRow icon={MessageCircle} title="Izohlar" description="Postingizga yangi izoh yozilganda."><Switch checked={settings?.notify_comments ?? true} onCheckedChange={(checked) => updateSettings({ notify_comments: checked })} /></SettingRow>
                <SettingRow icon={UserPlus} title="Yangi obunachilar" description="Kimdir sizga obuna bo‘lganda."><Switch checked={settings?.notify_follows ?? true} onCheckedChange={(checked) => updateSettings({ notify_follows: checked })} /></SettingRow>
                <SettingRow icon={AtSign} title="Eslatishlar" description="Kimdir sizni @eslatganda."><Switch checked={settings?.notify_mentions ?? true} onCheckedChange={(checked) => updateSettings({ notify_mentions: checked })} /></SettingRow>
              </div>
            </SectionCard>
            <SectionCard title="Qo‘shimcha" description="Bildirishnomalarning ovozi va maxfiy ko‘rinishini sozlang.">
              <div className="divide-y divide-border/70">
                <SettingRow icon={Bell} title="Bildirishnoma ovozi" description="Yangi bildirishnomalarda ovoz chiqaradi."><Switch checked={settings?.notification_sounds ?? true} onCheckedChange={(checked) => updateSettings({ notification_sounds: checked })} /></SettingRow>
                <SettingRow icon={Eye} title="Xabar matni" description="Bildirishnomada xabar matnini ko‘rsatadi."><Switch checked={settings?.notification_preview ?? true} onCheckedChange={(checked) => updateSettings({ notification_preview: checked })} /></SettingRow>
              </div>
            </SectionCard>
          </TabsContent>

          <TabsContent value="appearance" className="m-0 space-y-5">
            <SectionCard title="Ko‘rinish rejimi" description="Alsamos interfeysini qurilmangiz va ishlash uslubingizga moslang.">
              <div className="grid gap-3 p-4 sm:grid-cols-3 md:p-5">
                {[
                  { value: 'light', label: 'Yorug‘', icon: Sun, description: 'Kunduzgi foydalanish' },
                  { value: 'dark', label: 'Tungi', icon: Moon, description: 'Kam yorug‘ muhit' },
                  { value: 'system', label: 'Tizim', icon: Monitor, description: 'Qurilma rejimiga mos' },
                ].map((option) => {
                  const selected = theme === option.value;
                  return (
                    <button key={option.value} type="button" onClick={() => setTheme(option.value)} className={cn('rounded-2xl border p-4 text-left transition-all', selected ? 'border-foreground/30 bg-accent shadow-sm' : 'border-border hover:bg-accent/40')}>
                      <div className="flex items-center justify-between"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted"><option.icon className="h-5 w-5" /></span>{selected && <CheckCircle2 className="h-4 w-4" />}</div>
                      <p className="mt-4 text-sm font-semibold">{option.label}</p><p className="mt-1 text-xs text-muted-foreground">{option.description}</p>
                    </button>
                  );
                })}
              </div>
            </SectionCard>
          </TabsContent>

          <TabsContent value="language" className="m-0 space-y-5">
            <LanguageSwitcher />
            <div className="rounded-2xl border border-border bg-card p-4 text-xs leading-relaxed text-muted-foreground shadow-sm">
              Til tanlovi shu qurilmada saqlanadi va qo‘llab-quvvatlanadigan barcha sahifalarga darhol qo‘llanadi.
            </div>
          </TabsContent>

          <TabsContent value="chat-wallpaper" className="m-0 space-y-5">
            <SectionCard title="Xabar aksenti" description="Chatdagi asosiy aksent va xabar ko‘rinishini moslang."><div className="p-4 md:p-5"><ChatAccentEditor /></div></SectionCard>
            <SectionCard title="Chat foni" description="Tayyor fonlardan tanlang yoki o‘z rasmingizni yuklang."><div className="p-4 md:p-5"><ChatWallpaperEditor /></div></SectionCard>
          </TabsContent>

          <TabsContent value="data-storage" className="m-0 space-y-5">
            <SectionCard title="Media va xotira" description="Avtomatik yuklab olish orqali trafik va xotira sarfini boshqaring."><div className="p-4 md:p-5"><MediaAutoDownloadEditor /></div></SectionCard>
          </TabsContent>

          <TabsContent value="danger" className="m-0 space-y-5">
            <SectionCard title="Sessiyani boshqarish" description="Joriy qurilmadagi hisob sessiyasini boshqaring.">
              <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between md:p-5"><div><p className="text-sm font-medium">Hisobdan chiqish</p><p className="mt-1 text-xs text-muted-foreground">Faqat shu qurilmadagi sessiya yakunlanadi.</p></div><Button variant="outline" onClick={logout}><LogOut className="mr-2 h-4 w-4" /> Chiqish</Button></div>
            </SectionCard>
            <section className="overflow-hidden rounded-2xl border border-destructive/30 bg-card shadow-sm">
              <div className="border-b border-destructive/20 bg-destructive/5 px-4 py-4 md:px-5"><div className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-destructive" /><h2 className="font-semibold text-destructive">Xavfli hudud</h2></div><p className="mt-1 text-xs text-muted-foreground">Bu amallarni ortga qaytarish imkoni bo‘lmasligi mumkin.</p></div>
              <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between md:p-5"><div><p className="text-sm font-medium">Hisobni butunlay o‘chirish</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">Profil va unga bog‘liq ma’lumotlar o‘chiriladi. Amalni tasdiqlash talab qilinadi.</p></div><Button variant="destructive" onClick={() => setDeleteAccountDialogOpen(true)}><Trash2 className="mr-2 h-4 w-4" /> Hisobni o‘chirish</Button></div>
            </section>
          </TabsContent>
        </main>
      </Tabs>

      <footer className="pt-8 text-center text-xs text-muted-foreground"><p>Alsamos Social v1.0.0</p><p className="mt-1">© 2026 Alsamos. Barcha huquqlar himoyalangan.</p></footer>

      <AlertDialog open={logoutDialogOpen} onOpenChange={setLogoutDialogOpen}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Qurilmani chiqarish</AlertDialogTitle><AlertDialogDescription>Tanlangan qurilma tizimdan chiqariladi va qaytadan kirish talab qilinadi.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Bekor qilish</AlertDialogCancel><AlertDialogAction onClick={handleLogoutSession}>Chiqarish</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={logoutAllDialogOpen} onOpenChange={setLogoutAllDialogOpen}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Boshqa barcha qurilmalarni chiqarish</AlertDialogTitle><AlertDialogDescription>Hozirgi qurilmadan tashqari barcha sessiyalar yakunlanadi.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Bekor qilish</AlertDialogCancel><AlertDialogAction onClick={async () => { await logoutAllOtherSessions(); setLogoutAllDialogOpen(false); }}>Hammasini chiqarish</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteAccountDialogOpen} onOpenChange={setDeleteAccountDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle className="text-destructive">Hisobni o‘chirish</AlertDialogTitle><AlertDialogDescription className="space-y-4"><span className="block">Bu amalni ortga qaytarish mumkin emas. Davom etishdan oldin kerakli ma’lumotlarni saqlab oling.</span><span className="block">Tasdiqlash uchun <strong>DELETE</strong> deb yozing.</span><Input value={deleteConfirmText} onChange={(e) => setDeleteConfirmText(e.target.value)} placeholder="DELETE" /></AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel onClick={() => setDeleteConfirmText('')}>Bekor qilish</AlertDialogCancel><Button variant="destructive" disabled={deleteConfirmText !== 'DELETE' || deletingAccount} onClick={handleDeleteAccount}>{deletingAccount ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />} O‘chirish</Button></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
