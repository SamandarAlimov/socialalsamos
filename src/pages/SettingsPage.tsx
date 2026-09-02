import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';

import { useNavigate } from 'react-router-dom';
import { useTheme } from 'next-themes';
import { useAuth } from '@/contexts/AuthContext';
import { useUserSettings } from '@/hooks/useUserSettings';
import { useNotificationPermission } from '@/hooks/useNotificationPermission';
import { supabase } from '@/integrations/supabase/client';
import { uploadMedia } from '@/lib/mediaUpload';
import { User, Bell, Shield, ShieldCheck, Palette, Globe, Smartphone, Eye, Moon, Sun, LogOut, ChevronRight, Wifi, Trash2, Monitor, Laptop, CheckCircle2, XCircle, Loader2, Save, BadgeCheck, Wallet, Heart, MessageCircle, UserPlus, AtSign, BarChart3, HardDrive, Image as ImageIcon, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
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
import { formatDistanceToNow } from 'date-fns';
import { VerificationRequestDialog } from '@/components/profile/VerificationRequestDialog';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { ChatWallpaperEditor } from '@/components/settings/ChatWallpaperEditor';
import { ChatAccentEditor } from '@/components/settings/ChatAccentEditor';
import { MediaAutoDownloadEditor } from '@/components/settings/MediaAutoDownloadEditor';
import { LocationPicker } from '@/components/settings/LocationPicker';
import { PROFILE_PUBLIC_COLUMNS } from '@/lib/profileFields';

interface Profile {
  display_name: string | null;
  username: string | null;
  bio: string | null;
  avatar_url: string | null;
  location: string | null;
  website: string | null;
  country: string | null;
  birth_date: string | null;
}

/** Bayroqlar haqiqiy belgi sifatida yoziladi. Ilgari ekranlangan matn chiqib qolgan edi. */
const COUNTRIES: Array<{ value: string; label: string }> = [
  { value: 'Uzbekistan', label: '🇺🇿 O\u2018zbekiston' },
  { value: 'Russia', label: '🇷🇺 Rossiya' },
  { value: 'Kazakhstan', label: '🇰🇿 Qozog\u2018iston' },
  { value: 'Kyrgyzstan', label: '🇰🇬 Qirg\u2018iziston' },
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

// Push Notification Settings Component
function PushNotificationSettings() {
  const { permission, supported, requestPermission } = useNotificationPermission();
  const { toast } = useToast();

  const handleEnablePush = async () => {
    const granted = await requestPermission();
    if (granted) {
      toast({
        title: 'Push bildirishnomalar yoqildi',
        description: 'Ilova fonda bo\u2018lganda ham xabar olasiz.',
      });
    } else {
      toast({
        title: 'Ruxsat berilmadi',
        description: 'Brauzer sozlamalarida bildirishnomalarni yoqing.',
        variant: 'destructive',
      });
    }
  };

  if (!supported) {
    return (
      <div className="bg-card rounded-xl border border-border p-4">
        <div className="flex items-center gap-4">
          <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
            <Bell className="h-5 w-5 text-muted-foreground" />
          </div>
          <div>
            <p className="font-medium text-sm">Push bildirishnomalar</p>
            <p className="text-xs text-muted-foreground">Bu brauzerda qo\u2018llab-quvvatlanmaydi</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      <div className="p-4 border-b border-border">
        <h2 className="font-semibold">Push bildirishnomalar</h2>
      </div>
      <div className="p-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center shrink-0">
            <Bell className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="min-w-0">
            <p className="font-medium text-sm">Brauzer bildirishnomalari</p>
            <p className="text-xs text-muted-foreground">
              {permission === 'granted'
                ? 'Yoqilgan \u2014 ilova fonda bo\u2018lganda ham xabar keladi'
                : permission === 'denied'
                ? 'Bloklangan \u2014 brauzer sozlamalaridan yoqing'
                : 'Yoqtirish, izoh va obunalar haqida xabar olish uchun yoqing'}
            </p>
          </div>
        </div>
        {permission === 'granted' ? (
          <div className="flex items-center gap-2 text-green-500 shrink-0">
            <CheckCircle2 className="h-5 w-5" />
            <span className="text-sm font-medium">Yoqilgan</span>
          </div>
        ) : permission === 'denied' ? (
          <div className="flex items-center gap-2 text-destructive shrink-0">
            <XCircle className="h-5 w-5" />
            <span className="text-sm font-medium">Bloklangan</span>
          </div>
        ) : (
          <Button variant="outline" size="sm" className="shrink-0" onClick={handleEnablePush}>
            Yoqish
          </Button>
        )}
      </div>
    </div>
  );
}

interface SectionItem {
  value: string;
  label: string;
  description?: string;
  icon: React.ElementType;
  tint: string;
  /** Boshqa sahifaga o'tadigan menyular. */
  to?: string;
  danger?: boolean;
}

export default function SettingsPage() {
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  const { user, logout } = useAuth();
  const { settings, sessions, isLoading, updateSettings, logoutSession, logoutAllOtherSessions, refetch } = useUserSettings();
  const { toast } = useToast();

  const [profile, setProfile] = useState<Profile>({
    display_name: '',
    username: '',
    bio: '',
    avatar_url: null,
    location: '',
    website: '',
    country: null,
    birth_date: null,
  });
  const [saving, setSaving] = useState(false);
  const [logoutDialogOpen, setLogoutDialogOpen] = useState(false);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [logoutAllDialogOpen, setLogoutAllDialogOpen] = useState(false);
  const [verificationDialogOpen, setVerificationDialogOpen] = useState(false);
  const [deleteAccountDialogOpen, setDeleteAccountDialogOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deletingAccount, setDeletingAccount] = useState(false);

  useEffect(() => {
    const fetchProfile = async () => {
      if (!user) return;

      const { data } = await supabase
        .from('profiles')
        .select(PROFILE_PUBLIC_COLUMNS)
        .eq('id', user.id)
        .single();

      // Personal fields (birth date, country) are readable only by the owner
      // or an admin through this secure function.
      const { data: privateRows } = await supabase.rpc('get_profile_private', {
        p_profile_id: user.id,
      });
      const priv = Array.isArray(privateRows) ? privateRows[0] : privateRows;

      if (data) {
        setProfile({
          display_name: data.display_name || '',
          username: data.username || '',
          bio: data.bio || '',
          avatar_url: data.avatar_url,
          location: data.location || '',
          website: data.website || '',
          country: priv?.country || null,
          birth_date: priv?.birth_date || null,
        });
      }
    };

    fetchProfile();
  }, [user]);

  const handleSaveProfile = async () => {
    if (!user) return;
    setSaving(true);

    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          display_name: profile.display_name,
          username: profile.username,
          bio: profile.bio,
          location: profile.location,
          website: profile.website,
          country: profile.country,
          birth_date: profile.birth_date,
        })
        .eq('id', user.id);

      if (error) throw error;

      toast({
        title: 'Profil saqlandi',
        description: 'O\u2018zgarishlar muvaffaqiyatli saqlandi.',
      });
    } catch (error: any) {
      toast({
        title: 'Xatolik',
        description: error.message || 'Profilni saqlab bo\u2018lmadi',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    let avatarUrl: string;
    try {
      const uploaded = await uploadMedia(file, { type: 'avatar', visibility: 'public' });
      avatarUrl = uploaded.url;
    } catch (error) {
      toast({ title: 'Xatolik', description: 'Rasmni yuklab bo\u2018lmadi', variant: 'destructive' });
      return;
    }

    await supabase
      .from('profiles')
      .update({ avatar_url: avatarUrl })
      .eq('id', user.id);

    setProfile(prev => ({ ...prev, avatar_url: avatarUrl }));
    toast({ title: 'Bajarildi', description: 'Profil rasmi yangilandi' });
  };

  const handleLogoutSession = async () => {
    if (!selectedSessionId) return;
    await logoutSession(selectedSessionId);
    setLogoutDialogOpen(false);
    setSelectedSessionId(null);
  };

  const handleLogoutAllOthers = async () => {
    await logoutAllOtherSessions();
    setLogoutAllDialogOpen(false);
  };

  const getDeviceIcon = (deviceType: string | null) => {
    switch (deviceType?.toLowerCase()) {
      case 'mobile':
        return Smartphone;
      case 'tablet':
        return Laptop;
      default:
        return Monitor;
    }
  };

  const [section, setSection] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  /**
   * Menyular mavzu bo'yicha guruhlangan: har bir bo'lim o'z sahifasida turadi.
   * Til tanlash endi ro'yxatning tepasida emas, "Ilova" guruhidagi alohida
   * bo'lim ichida.
   */
  const sectionGroups: { title: string; items: SectionItem[] }[] = [
    {
      title: 'Hisob',
      items: [
        { value: 'account', label: 'Profilim', description: 'Ism, username, bio va joylashuv', icon: User, tint: 'text-rose-500 bg-rose-500/10' },
        { value: 'privacy', label: 'Maxfiylik', description: 'Kim nima ko\u2018rishi va qo\u2018ng\u2018iroqlar', icon: Shield, tint: 'text-amber-500 bg-amber-500/10' },
        { value: 'security', label: 'Xavfsizlik', description: 'Ikki qadamli tasdiqlash va sessiyalar', icon: ShieldCheck, tint: 'text-emerald-600 bg-emerald-600/10', to: '/settings/security' },
        { value: 'devices', label: 'Qurilmalar', description: 'Faol kirishlar', icon: Smartphone, tint: 'text-sky-500 bg-sky-500/10' },
      ],
    },
    {
      title: 'Ilova',
      items: [
        { value: 'notifications', label: 'Bildirishnomalar', description: 'Push, ovoz va turlari', icon: Bell, tint: 'text-violet-500 bg-violet-500/10' },
        { value: 'appearance', label: 'Ko\u2018rinish', description: 'Yorug\u2018, tungi yoki tizim rejimi', icon: Palette, tint: 'text-fuchsia-500 bg-fuchsia-500/10' },
        { value: 'language', label: 'Til va hudud', description: 'Interfeys tili', icon: Globe, tint: 'text-teal-500 bg-teal-500/10' },
      ],
    },
    {
      title: 'Chat',
      items: [
        { value: 'chat-wallpaper', label: 'Chat ko\u2018rinishi', description: 'Xabar rangi va fon', icon: ImageIcon, tint: 'text-emerald-500 bg-emerald-500/10' },
        { value: 'data-storage', label: 'Ma\u2018lumotlar va xotira', description: 'Avtomatik yuklab olish', icon: HardDrive, tint: 'text-cyan-500 bg-cyan-500/10' },
      ],
    },
    {
      title: 'Boshqa',
      items: [
        { value: 'payment', label: 'To\u2018lov', description: 'Hisob balansi va tranzaksiyalar', icon: Wallet, tint: 'text-lime-600 bg-lime-600/10', to: '/payment' },
        { value: 'activity', label: 'Faolligim', description: 'Sarflangan vaqt va statistika', icon: BarChart3, tint: 'text-indigo-500 bg-indigo-500/10', to: '/activity' },
        { value: 'danger', label: 'Hisobni boshqarish', description: 'Chiqish va hisobni o\u2018chirish', icon: AlertTriangle, tint: 'text-destructive bg-destructive/10', danger: true },
      ],
    },
  ];

  const activeLabel = sectionGroups
    .flatMap((g) => g.items)
    .find((i) => i.value === section)?.label;

  return (
    <div className="max-w-5xl mx-auto py-4 md:py-8 px-3 md:px-4 pb-24 md:pb-8">
      <div className="flex items-center gap-2 mb-4 md:mb-8">
        {section && (
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setSection(null)}
          >
            <ChevronRight className="h-5 w-5 rotate-180" />
          </Button>
        )}
        <h1 className="text-xl md:text-2xl font-bold tracking-tight">
          {section ? activeLabel : 'Sozlamalar'}
        </h1>
      </div>

      <Tabs value={section ?? 'account'} className="md:grid md:grid-cols-[320px_1fr] md:gap-6 md:items-start">
        {/* Master list */}
        <div className={cn('space-y-6', section && 'hidden md:block')}>
          {sectionGroups.map((group) => (
            <div key={group.title}>
              <p className="px-1 pb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                {group.title}
              </p>
              <div className="rounded-2xl border border-border bg-card overflow-hidden">
                {group.items.map((item, idx) => {
                  const isActive = section === item.value;
                  return (
                    <button
                      key={item.value}
                      type="button"
                      onClick={() => (item.to ? navigate(item.to) : setSection(item.value))}
                      className={cn(
                        'w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors',
                        idx !== 0 && 'border-t border-border/60',
                        isActive ? 'bg-accent/70' : 'hover:bg-accent/50',
                      )}
                    >
                      <span className={cn('h-9 w-9 rounded-xl flex items-center justify-center shrink-0', item.tint)}>
                        <item.icon className="h-[18px] w-[18px]" />
                      </span>
                      <span className="flex-1 min-w-0">
                        <span
                          className={cn(
                            'block text-sm font-medium truncate',
                            isActive && 'font-semibold text-foreground',
                            item.danger && 'text-destructive',
                          )}
                        >
                          {item.label}
                        </span>
                        {item.description && (
                          <span className="block text-xs text-muted-foreground truncate">
                            {item.description}
                          </span>
                        )}
                      </span>
                      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Detail pane */}
        <div className={cn('mt-6 md:mt-0 min-w-0', !section && 'hidden md:block')}>
          {!section && (
            <div className="hidden md:flex flex-col items-center justify-center text-center rounded-2xl border border-border bg-card/40 py-24">
              <Palette className="h-10 w-10 text-muted-foreground mb-4" />
              <p className="font-semibold">Sozlamani tanlang</p>
              <p className="text-sm text-muted-foreground mt-1">
                Chap paneldan kerakli bo\u2018limni tanlang
              </p>
            </div>
          )}

        {/* Profilim */}
        <TabsContent value="account" className="space-y-6">
          <div className="bg-card rounded-xl border border-border p-4 md:p-6">
            <h2 className="text-lg font-semibold mb-6">Shaxsiy ma\u2018lumotlar</h2>

            {/* Avatar */}
            <div className="flex items-center gap-6 mb-6">
              <label className="relative cursor-pointer group">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleAvatarUpload}
                  className="hidden"
                />
                <Avatar className="h-20 w-20">
                  <AvatarImage src={profile.avatar_url || ''} />
                  <AvatarFallback className="text-xl">
                    {profile.display_name?.[0] || user?.email?.[0]?.toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                  <span className="text-white text-xs">O\u2018zgartirish</span>
                </div>
              </label>
              <div className="min-w-0">
                <p className="font-medium truncate">{profile.display_name || 'Ism kiritilmagan'}</p>
                <p className="text-sm text-muted-foreground truncate">@{profile.username || 'username'}</p>
              </div>
            </div>

            <div className="grid gap-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="display_name">Ko\u2018rinadigan ism</Label>
                  <Input
                    id="display_name"
                    value={profile.display_name || ''}
                    onChange={(e) => setProfile(prev => ({ ...prev, display_name: e.target.value }))}
                    className="mt-1.5"
                  />
                </div>
                <div>
                  <Label htmlFor="username">Foydalanuvchi nomi</Label>
                  <Input
                    id="username"
                    value={profile.username || ''}
                    onChange={(e) => setProfile(prev => ({ ...prev, username: e.target.value }))}
                    className="mt-1.5"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="bio">Bio</Label>
                <Textarea
                  id="bio"
                  value={profile.bio || ''}
                  onChange={(e) => setProfile(prev => ({ ...prev, bio: e.target.value }))}
                  className="mt-1.5 resize-none"
                  rows={3}
                  placeholder="O\u2018zingiz haqida qisqacha..."
                />
              </div>

              {/* Joylashuv: haqiqiy xarita bazasi bilan bog'langan */}
              <div>
                <Label>Joylashuv</Label>
                <p className="mt-1 mb-2 text-xs text-muted-foreground">
                  Manzilni qidirib tanlang yoki joriy joylashuvingizni aniqlang \u2014 tanlangan nuqta xaritada ko\u2018rinadi.
                </p>
                <LocationPicker
                  value={profile.location || ''}
                  onChange={(value) => setProfile(prev => ({ ...prev, location: value }))}
                />
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="website">Veb-sayt</Label>
                  <Input
                    id="website"
                    value={profile.website || ''}
                    onChange={(e) => setProfile(prev => ({ ...prev, website: e.target.value }))}
                    className="mt-1.5"
                    placeholder="https://..."
                  />
                </div>
                <div>
                  <Label htmlFor="birth_date">Tug\u2018ilgan sana</Label>
                  <Input
                    id="birth_date"
                    type="date"
                    value={profile.birth_date || ''}
                    onChange={(e) => setProfile(prev => ({ ...prev, birth_date: e.target.value }))}
                    className="mt-1.5"
                    max={new Date().toISOString().split('T')[0]}
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="country">Davlat</Label>
                <Select
                  value={profile.country || ''}
                  onValueChange={(value) => setProfile(prev => ({ ...prev, country: value }))}
                >
                  <SelectTrigger className="mt-1.5">
                    <SelectValue placeholder="Davlatingizni tanlang" />
                  </SelectTrigger>
                  <SelectContent>
                    {COUNTRIES.map((country) => (
                      <SelectItem key={country.value} value={country.value}>
                        {country.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Button onClick={handleSaveProfile} disabled={saving} className="mt-6">
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              Saqlash
            </Button>
          </div>

          {/* Verification Request */}
          <div className="bg-card rounded-xl border border-border p-4 md:p-6">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-4 min-w-0">
                <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center shrink-0">
                  <BadgeCheck className="h-6 w-6 text-muted-foreground" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-semibold">Tasdiqlangan nishon</h3>
                  <p className="text-sm text-muted-foreground">Hisobingiz uchun ko\u2018k nishon so\u2018rang</p>
                </div>
              </div>
              <Button variant="outline" className="shrink-0" onClick={() => setVerificationDialogOpen(true)}>
                So\u2018rov
              </Button>
            </div>
          </div>

          <VerificationRequestDialog
            open={verificationDialogOpen}
            onOpenChange={setVerificationDialogOpen}
          />
        </TabsContent>

        {/* Ko'rinish */}
        <TabsContent value="appearance" className="space-y-6">
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <div className="p-4 border-b border-border">
              <h2 className="font-semibold">Mavzu</h2>
              <p className="text-xs text-muted-foreground mt-1">Ilova ko\u2018rinishini tanlang</p>
            </div>
            <div className="p-4 flex items-center justify-between gap-4">
              <div className="flex items-center gap-4 min-w-0">
                <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center shrink-0">
                  {theme === 'dark' ? (
                    <Moon className="h-5 w-5 text-muted-foreground" />
                  ) : theme === 'light' ? (
                    <Sun className="h-5 w-5 text-muted-foreground" />
                  ) : (
                    <Monitor className="h-5 w-5 text-muted-foreground" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-sm">Rejim</p>
                  <p className="text-xs text-muted-foreground">Yorug\u2018, tungi yoki tizim bo\u2018yicha</p>
                </div>
              </div>
              <Select value={theme} onValueChange={setTheme}>
                <SelectTrigger className="w-36 shrink-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="system">
                    <div className="flex items-center gap-2">
                      <Monitor className="h-4 w-4" />
                      Tizim
                    </div>
                  </SelectItem>
                  <SelectItem value="light">
                    <div className="flex items-center gap-2">
                      <Sun className="h-4 w-4" />
                      Yorug\u2018
                    </div>
                  </SelectItem>
                  <SelectItem value="dark">
                    <div className="flex items-center gap-2">
                      <Moon className="h-4 w-4" />
                      Tungi
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </TabsContent>

        {/* Til va hudud */}
        <TabsContent value="language" className="space-y-6">
          <LanguageSwitcher />
          <div className="rounded-xl border border-border bg-card/40 p-4 text-xs text-muted-foreground">
            Til tanlovi shu qurilmada saqlanadi va butun interfeysga darhol qo\u2018llanadi.
          </div>
        </TabsContent>

        {/* Chat ko'rinishi */}
        <TabsContent value="chat-wallpaper" className="space-y-4">
          <div className="rounded-xl border border-border bg-card p-4 md:p-6">
            <ChatAccentEditor />
          </div>
          <div className="rounded-xl border border-border bg-card p-4 md:p-6">
            <div className="mb-4">
              <h2 className="font-semibold">Chat foni</h2>
              <p className="text-sm text-muted-foreground">
                Tayyor fonlardan tanlang yoki o\u2018z rasmingizni yuklang. Tanlov shu qurilmada saqlanadi va barcha chatlarga qo\u2018llanadi.
              </p>
            </div>
            <ChatWallpaperEditor />
          </div>
        </TabsContent>

        {/* Ma'lumotlar va xotira */}
        <TabsContent value="data-storage" className="space-y-6">
          <div className="bg-card rounded-xl border border-border p-4 md:p-6">
            <MediaAutoDownloadEditor />
          </div>
        </TabsContent>

        {/* Maxfiylik */}
        <TabsContent value="privacy" className="space-y-6">
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <div className="p-4 border-b border-border">
              <h2 className="font-semibold">Maxfiylik sozlamalari</h2>
            </div>

            <div className="divide-y divide-border">
              {/* Last Seen Visibility */}
              <div className="p-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-4 min-w-0">
                  <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center shrink-0">
                    <Eye className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-sm">Oxirgi ko\u2018rilgan vaqt</p>
                    <p className="text-xs text-muted-foreground">Onlayn vaqtingizni kim ko\u2018radi</p>
                  </div>
                </div>
                <Select
                  value={settings?.last_seen_visibility || 'everyone'}
                  onValueChange={(value: 'everyone' | 'contacts' | 'nobody') => updateSettings({ last_seen_visibility: value })}
                >
                  <SelectTrigger className="w-32 shrink-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="everyone">Hamma</SelectItem>
                    <SelectItem value="contacts">Kontaktlar</SelectItem>
                    <SelectItem value="nobody">Hech kim</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Read Receipts */}
              <div className="p-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-4 min-w-0">
                  <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center shrink-0">
                    <CheckCircle2 className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-sm">O\u2018qilgan belgisi</p>
                    <p className="text-xs text-muted-foreground">Xabarni o\u2018qiganingiz ko\u2018rinadi</p>
                  </div>
                </div>
                <Switch
                  checked={settings?.read_receipts_enabled ?? true}
                  onCheckedChange={(checked) => updateSettings({ read_receipts_enabled: checked })}
                />
              </div>

              {/* Call Permissions */}
              <div className="p-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-4 min-w-0">
                  <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center shrink-0">
                    <Wifi className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-sm">Menga kim qo\u2018ng\u2018iroq qila oladi</p>
                    <p className="text-xs text-muted-foreground">Qo\u2018ng\u2018iroqlarni boshlash ruxsati</p>
                  </div>
                </div>
                <Select
                  value={settings?.call_permissions || 'everyone'}
                  onValueChange={(value: 'everyone' | 'contacts' | 'nobody') => updateSettings({ call_permissions: value })}
                >
                  <SelectTrigger className="w-32 shrink-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="everyone">Hamma</SelectItem>
                    <SelectItem value="contacts">Kontaktlar</SelectItem>
                    <SelectItem value="nobody">Hech kim</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Group Invite Permissions */}
              <div className="p-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-4 min-w-0">
                  <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center shrink-0">
                    <User className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-sm">Guruhga qo\u2018shish</p>
                    <p className="text-xs text-muted-foreground">Sizni kim guruhga qo\u2018sha oladi</p>
                  </div>
                </div>
                <Select
                  value={settings?.group_invite_permissions || 'everyone'}
                  onValueChange={(value: 'everyone' | 'contacts' | 'nobody') => updateSettings({ group_invite_permissions: value })}
                >
                  <SelectTrigger className="w-32 shrink-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="everyone">Hamma</SelectItem>
                    <SelectItem value="contacts">Kontaktlar</SelectItem>
                    <SelectItem value="nobody">Hech kim</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card/40 p-4">
            <div className="flex items-start gap-3">
              <ShieldCheck className="h-5 w-5 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <p className="text-sm font-medium">Ikki qadamli tasdiqlash</p>
                <p className="text-xs text-muted-foreground">
                  Parol bilan birga qo\u2018shimcha kod so\u2018raladi. Zaxira kodlar va faol sessiyalar Xavfsizlik bo\u2018limida.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3 rounded-full"
                  onClick={() => navigate('/settings/security')}
                >
                  Xavfsizlik bo\u2018limi
                </Button>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* Qurilmalar */}
        <TabsContent value="devices" className="space-y-6">
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <div className="p-4 border-b border-border flex items-center justify-between gap-4">
              <div className="min-w-0">
                <h2 className="font-semibold">Faol sessiyalar</h2>
                <p className="text-sm text-muted-foreground">{sessions.length} qurilma tizimga kirgan</p>
              </div>
              {sessions.length > 1 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  onClick={() => setLogoutAllDialogOpen(true)}
                >
                  <XCircle className="h-4 w-4 mr-2" />
                  Boshqalarni chiqarish
                </Button>
              )}
            </div>

            <ScrollArea className="max-h-[400px]">
              <div className="divide-y divide-border">
                {sessions.map((session) => {
                  const DeviceIcon = getDeviceIcon(session.device_type);
                  const meta = [session.os_name, session.browser_name, session.ip_address || 'IP aniqlanmadi']
                    .filter(Boolean)
                    .join(' \u2022 ');
                  return (
                    <div key={session.id} className="p-4 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-4 min-w-0">
                        <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center shrink-0">
                          <DeviceIcon className="h-6 w-6 text-muted-foreground" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-sm truncate">
                              {session.device_name || session.browser_name || 'Noma\u2018lum qurilma'}
                            </p>
                            {session.is_current && (
                              <span className="px-2 py-0.5 bg-muted text-foreground text-xs rounded-full shrink-0">
                                Hozirgi
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground truncate">{meta}</p>
                          <p className="text-xs text-muted-foreground">
                            Oxirgi faollik:{' '}
                            {session.last_active_at
                              ? formatDistanceToNow(new Date(session.last_active_at), { addSuffix: true })
                              : 'aniqlanmadi'}
                          </p>
                        </div>
                      </div>
                      {!session.is_current && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="shrink-0"
                          onClick={() => {
                            setSelectedSessionId(session.id);
                            setLogoutDialogOpen(true);
                          }}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </div>
        </TabsContent>

        {/* Bildirishnomalar */}
        <TabsContent value="notifications" className="space-y-6">
          <PushNotificationSettings />

          {/* Autoplay Settings */}
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <div className="p-4 border-b border-border">
              <h2 className="font-semibold">Media avtomatik ijro</h2>
              <p className="text-xs text-muted-foreground mt-1">Xabarlardagi media o\u2018zi ijro bo\u2018lishini boshqarish</p>
            </div>

            <div className="divide-y divide-border">
              <div className="p-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-4 min-w-0">
                  <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center shrink-0">
                    <Bell className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-sm">Ovozli xabarlar</p>
                    <p className="text-xs text-muted-foreground">Ko\u2018ringanda avtomatik ijro etiladi</p>
                  </div>
                </div>
                <Switch
                  checked={settings?.autoplay_voice_messages ?? true}
                  onCheckedChange={(checked) => updateSettings({ autoplay_voice_messages: checked })}
                />
              </div>

              <div className="p-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-4 min-w-0">
                  <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center shrink-0">
                    <Bell className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-sm">Video xabarlar</p>
                    <p className="text-xs text-muted-foreground">Ko\u2018ringanda avtomatik ijro etiladi</p>
                  </div>
                </div>
                <Switch
                  checked={settings?.autoplay_video_messages ?? true}
                  onCheckedChange={(checked) => updateSettings({ autoplay_video_messages: checked })}
                />
              </div>
            </div>
          </div>

          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <div className="p-4 border-b border-border">
              <h2 className="font-semibold">Bildirishnoma turlari</h2>
              <p className="text-xs text-muted-foreground mt-1">Qaysi xabarlarni olishni tanlang</p>
            </div>

            <div className="divide-y divide-border">
              <div className="p-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-4 min-w-0">
                  <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center shrink-0">
                    <Heart className="h-5 w-5 text-foreground" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-sm">Yoqtirishlar</p>
                    <p className="text-xs text-muted-foreground">Kimdir postingizni yoqtirganda</p>
                  </div>
                </div>
                <Switch
                  checked={settings?.notify_likes ?? true}
                  onCheckedChange={(checked) => updateSettings({ notify_likes: checked })}
                />
              </div>

              <div className="p-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-4 min-w-0">
                  <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center shrink-0">
                    <MessageCircle className="h-5 w-5 text-foreground" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-sm">Izohlar</p>
                    <p className="text-xs text-muted-foreground">Postingizga izoh qoldirilganda</p>
                  </div>
                </div>
                <Switch
                  checked={settings?.notify_comments ?? true}
                  onCheckedChange={(checked) => updateSettings({ notify_comments: checked })}
                />
              </div>

              <div className="p-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-4 min-w-0">
                  <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center shrink-0">
                    <UserPlus className="h-5 w-5 text-foreground" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-sm">Yangi obunachilar</p>
                    <p className="text-xs text-muted-foreground">Kimdir sizga obuna bo\u2018lganda</p>
                  </div>
                </div>
                <Switch
                  checked={settings?.notify_follows ?? true}
                  onCheckedChange={(checked) => updateSettings({ notify_follows: checked })}
                />
              </div>

              <div className="p-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-4 min-w-0">
                  <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center shrink-0">
                    <AtSign className="h-5 w-5 text-foreground" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-sm">Eslatishlar</p>
                    <p className="text-xs text-muted-foreground">Kimdir sizni @eslatganda</p>
                  </div>
                </div>
                <Switch
                  checked={settings?.notify_mentions ?? true}
                  onCheckedChange={(checked) => updateSettings({ notify_mentions: checked })}
                />
              </div>
            </div>
          </div>

          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <div className="p-4 border-b border-border">
              <h2 className="font-semibold">Qo\u2018shimcha</h2>
            </div>

            <div className="divide-y divide-border">
              <div className="p-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-4 min-w-0">
                  <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center shrink-0">
                    <Bell className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-sm">Bildirishnoma ovozi</p>
                    <p className="text-xs text-muted-foreground">Yangi xabarlarda ovoz chiqaradi</p>
                  </div>
                </div>
                <Switch
                  checked={settings?.notification_sounds ?? true}
                  onCheckedChange={(checked) => updateSettings({ notification_sounds: checked })}
                />
              </div>

              <div className="p-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-4 min-w-0">
                  <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center shrink-0">
                    <Eye className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-sm">Xabar matni</p>
                    <p className="text-xs text-muted-foreground">Bildirishnomada matn ko\u2018rsatiladi</p>
                  </div>
                </div>
                <Switch
                  checked={settings?.notification_preview ?? true}
                  onCheckedChange={(checked) => updateSettings({ notification_preview: checked })}
                />
              </div>
            </div>
          </div>
        </TabsContent>

        {/* Hisobni boshqarish */}
        <TabsContent value="danger" className="space-y-6">
          <div className="bg-card rounded-xl border border-border p-4 md:p-6">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <h3 className="font-semibold">Hisobdan chiqish</h3>
                <p className="text-sm text-muted-foreground">Faqat shu qurilmadan chiqadi</p>
              </div>
              <Button variant="outline" className="shrink-0" onClick={logout}>
                <LogOut className="h-4 w-4 mr-2" />
                Chiqish
              </Button>
            </div>
          </div>

          <div className="bg-card rounded-xl border border-destructive/30 p-4 md:p-6">
            <div className="flex items-center gap-4 mb-4">
              <div className="h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center shrink-0">
                <Trash2 className="h-6 w-6 text-destructive" />
              </div>
              <div className="min-w-0">
                <h3 className="font-semibold text-destructive">Hisobni o\u2018chirish</h3>
                <p className="text-sm text-muted-foreground">Hisob va barcha ma\u2018lumotlar butunlay o\u2018chadi</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Hisobni o\u2018chirgandan keyin ortga qaytarish imkoni yo\u2018q. Barcha postlar, xabarlar va shaxsiy ma\u2018lumotlar butunlay o\u2018chiriladi.
            </p>
            <Button
              variant="destructive"
              onClick={() => setDeleteAccountDialogOpen(true)}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Hisobimni o\u2018chirish
            </Button>
          </div>

          {/* Delete Account Confirmation Dialog */}
          <AlertDialog open={deleteAccountDialogOpen} onOpenChange={setDeleteAccountDialogOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle className="text-destructive">Hisobni o\u2018chirish</AlertDialogTitle>
                <AlertDialogDescription className="space-y-4">
                  <span className="block">
                    Bu amalni ortga qaytarish mumkin emas. Hisobingiz va barcha ma\u2018lumotlaringiz serverlardan butunlay o\u2018chiriladi.
                  </span>
                  <span className="block">
                    Tasdiqlash uchun quyiga <span className="font-semibold">DELETE</span> deb yozing:
                  </span>
                  <Input
                    value={deleteConfirmText}
                    onChange={(e) => setDeleteConfirmText(e.target.value)}
                    placeholder="DELETE"
                    className="mt-2"
                  />
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel onClick={() => setDeleteConfirmText('')}>Bekor qilish</AlertDialogCancel>
                <Button
                  variant="destructive"
                  disabled={deleteConfirmText !== 'DELETE' || deletingAccount}
                  onClick={async () => {
                    setDeletingAccount(true);
                    try {
                      // Delete user profile and related data (cascades will handle related tables)
                      const { error: profileError } = await supabase
                        .from('profiles')
                        .delete()
                        .eq('id', user?.id);

                      if (profileError) throw profileError;

                      // Sign out the user
                      await supabase.auth.signOut();

                      toast({
                        title: 'Hisob o\u2018chirildi',
                        description: 'Hisobingiz butunlay o\u2018chirildi.',
                      });

                      navigate('/');
                    } catch (error: any) {
                      toast({
                        title: 'Xatolik',
                        description: error.message || 'Hisobni o\u2018chirib bo\u2018lmadi',
                        variant: 'destructive',
                      });
                    } finally {
                      setDeletingAccount(false);
                      setDeleteAccountDialogOpen(false);
                      setDeleteConfirmText('');
                    }
                  }}
                >
                  {deletingAccount ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4 mr-2" />
                  )}
                  O\u2018chirish
                </Button>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </TabsContent>
        </div>
      </Tabs>

      {/* Footer — belgilar haqiqiy simvol sifatida yoziladi */}
      <div className="text-center text-xs text-muted-foreground pt-8">
        <p>Alsamos Social v1.0.0</p>
        <p className="mt-1">© 2026 Alsamos. Barcha huquqlar himoyalangan.</p>
      </div>

      {/* Logout Session Dialog */}
      <AlertDialog open={logoutDialogOpen} onOpenChange={setLogoutDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Qurilmani chiqarish</AlertDialogTitle>
            <AlertDialogDescription>
              Tanlangan qurilma tizimdan chiqariladi va u qurilmada qaytadan kirish talab qilinadi.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Bekor qilish</AlertDialogCancel>
            <AlertDialogAction onClick={handleLogoutSession}>
              Chiqarish
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Logout All Others Dialog */}
      <AlertDialog open={logoutAllDialogOpen} onOpenChange={setLogoutAllDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Boshqa barcha qurilmalarni chiqarish</AlertDialogTitle>
            <AlertDialogDescription>
              Hozirgi qurilmadan tashqari barcha qurilmalar tizimdan chiqariladi. Siz shu qurilmada qolasiz.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Bekor qilish</AlertDialogCancel>
            <AlertDialogAction onClick={handleLogoutAllOthers}>
              Hammasini chiqarish
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
