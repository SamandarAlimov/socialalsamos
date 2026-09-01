import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from 'next-themes';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useUserSettings } from '@/hooks/useUserSettings';
import { useNotificationPermission } from '@/hooks/useNotificationPermission';
import { supabase } from '@/integrations/supabase/client';
import { uploadMedia } from '@/lib/mediaUpload';
import {
  AtSign,
  BadgeCheck,
  BarChart3,
  Bell,
  CheckCircle2,
  ChevronRight,
  Clock,
  Eye,
  HardDrive,
  Heart,
  Image as ImageIcon,
  Info,
  Laptop,
  Loader2,
  LogOut,
  MessageCircle,
  Monitor,
  Moon,
  Palette,
  Save,
  Shield,
  Smartphone,
  Sun,
  Trash2,
  User,
  UserPlus,
  Wallet,
  Wifi,
  XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { MediaAutoDownloadEditor } from '@/components/settings/MediaAutoDownloadEditor';
import { LocationPicker, type LocationCoords } from '@/components/settings/LocationPicker';
import { PROFILE_PUBLIC_COLUMNS } from '@/lib/profileFields';

const APP_VERSION = '1.0.0';

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

type SectionItem = {
  value: string;
  label: string;
  description: string;
  icon: React.ElementType;
  tint: string;
  to?: string;
};

const COUNTRIES: Array<{ value: string; flag: string; label: string }> = [
  { value: 'Uzbekistan', flag: '\uD83C\uDDFA\uD83C\uDDFF', label: "O'zbekiston" },
  { value: 'Russia', flag: '\uD83C\uDDF7\uD83C\uDDFA', label: 'Rossiya' },
  { value: 'Kazakhstan', flag: '\uD83C\uDDF0\uD83C\uDDFF', label: "Qozog'iston" },
  { value: 'Kyrgyzstan', flag: '\uD83C\uDDF0\uD83C\uDDEC', label: "Qirg'iziston" },
  { value: 'Tajikistan', flag: '\uD83C\uDDF9\uD83C\uDDEF', label: 'Tojikiston' },
  { value: 'Turkmenistan', flag: '\uD83C\uDDF9\uD83C\uDDF2', label: 'Turkmaniston' },
  { value: 'Turkey', flag: '\uD83C\uDDF9\uD83C\uDDF7', label: 'Turkiya' },
  { value: 'United States', flag: '\uD83C\uDDFA\uD83C\uDDF8', label: 'AQSh' },
  { value: 'United Kingdom', flag: '\uD83C\uDDEC\uD83C\uDDE7', label: 'Buyuk Britaniya' },
  { value: 'Germany', flag: '\uD83C\uDDE9\uD83C\uDDEA', label: 'Germaniya' },
  { value: 'France', flag: '\uD83C\uDDEB\uD83C\uDDF7', label: 'Fransiya' },
  { value: 'Italy', flag: '\uD83C\uDDEE\uD83C\uDDF9', label: 'Italiya' },
  { value: 'Spain', flag: '\uD83C\uDDEA\uD83C\uDDF8', label: 'Ispaniya' },
  { value: 'South Korea', flag: '\uD83C\uDDF0\uD83C\uDDF7', label: 'Janubiy Koreya' },
  { value: 'Japan', flag: '\uD83C\uDDEF\uD83C\uDDF5', label: 'Yaponiya' },
  { value: 'China', flag: '\uD83C\uDDE8\uD83C\uDDF3', label: 'Xitoy' },
  { value: 'India', flag: '\uD83C\uDDEE\uD83C\uDDF3', label: 'Hindiston' },
  { value: 'UAE', flag: '\uD83C\uDDE6\uD83C\uDDEA', label: 'BAA' },
  { value: 'Saudi Arabia', flag: '\uD83C\uDDF8\uD83C\uDDE6', label: 'Saudiya Arabistoni' },
  { value: 'Other', flag: '\uD83C\uDF0D', label: 'Boshqa' },
];

const SECTION_GROUPS: Array<{ title: string; items: SectionItem[] }> = [
  {
    title: 'Hisob',
    items: [
      {
        value: 'account',
        label: 'Profil ma\u2019lumotlari',
        description: 'Ism, username, bio, manzil va davlat',
        icon: User,
        tint: 'text-rose-500 bg-rose-500/10',
      },
      {
        value: 'verification',
        label: 'Tasdiqlash',
        description: 'Rasmiy nishon uchun ariza yuborish',
        icon: BadgeCheck,
        tint: 'text-blue-500 bg-blue-500/10',
      },
      {
        value: 'payment',
        label: 'To\u2019lov va hamyon',
        description: 'Balans va tranzaksiyalar tarixi',
        icon: Wallet,
        tint: 'text-green-600 bg-green-600/10',
        to: '/payment',
      },
    ],
  },
  {
    title: 'Maxfiylik va xavfsizlik',
    items: [
      {
        value: 'privacy',
        label: 'Maxfiylik',
        description: 'Oxirgi faollik, qo\u2019ng\u2019iroqlar, guruhlar',
        icon: Shield,
        tint: 'text-amber-500 bg-amber-500/10',
      },
      {
        value: 'devices',
        label: 'Qurilmalar va seanslar',
        description: 'Faol qurilmalarni ko\u2019rish va chiqarish',
        icon: Smartphone,
        tint: 'text-sky-500 bg-sky-500/10',
      },
    ],
  },
  {
    title: 'Bildirishnomalar',
    items: [
      {
        value: 'notifications',
        label: 'Bildirishnomalar',
        description: 'Push, ovoz va bildirishnoma turlari',
        icon: Bell,
        tint: 'text-violet-500 bg-violet-500/10',
      },
    ],
  },
  {
    title: 'Ko\u2019rinish va til',
    items: [
      {
        value: 'appearance',
        label: 'Mavzu va til',
        description: 'Yorug\u2019/tungi rejim va interfeys tili',
        icon: Palette,
        tint: 'text-fuchsia-500 bg-fuchsia-500/10',
      },
    ],
  },
  {
    title: 'Chat',
    items: [
      {
        value: 'chat-wallpaper',
        label: 'Chat foni',
        description: 'Fon rasmi yoki gradient tanlash',
        icon: ImageIcon,
        tint: 'text-emerald-500 bg-emerald-500/10',
      },
      {
        value: 'data-storage',
        label: "Ma'lumotlar va xotira",
        description: 'Media avtomatik yuklash va trafik tejash',
        icon: HardDrive,
        tint: 'text-cyan-500 bg-cyan-500/10',
      },
    ],
  },
  {
    title: 'Boshqa',
    items: [
      {
        value: 'activity',
        label: 'Faollik va statistika',
        description: 'Platformada sarflagan vaqtingiz',
        icon: BarChart3,
        tint: 'text-orange-500 bg-orange-500/10',
        to: '/activity',
      },
      {
        value: 'about',
        label: 'Ilova haqida',
        description: 'Versiya, huquqiy hujjatlar va hisobni o\u2019chirish',
        icon: Info,
        tint: 'text-slate-500 bg-slate-500/10',
      },
    ],
  },
];

function SectionCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      <div className="p-4 border-b border-border">
        <h2 className="font-semibold">{title}</h2>
        {description && <p className="text-xs text-muted-foreground mt-1">{description}</p>}
      </div>
      {children}
    </div>
  );
}

function PushNotificationSettings() {
  const { permission, supported, requestPermission } = useNotificationPermission();
  const { toast } = useToast();

  const handleEnablePush = async () => {
    const granted = await requestPermission();
    if (granted) {
      toast({
        title: 'Push bildirishnomalar yoqildi',
        description: 'Ilova fonda bo\u2019lganda ham xabar olasiz.',
      });
    } else {
      toast({
        title: 'Ruxsat berilmadi',
        description: 'Brauzer sozlamalaridan bildirishnomalarni yoqing.',
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
            <p className="text-xs text-muted-foreground">Bu brauzer qo\u2019llab-quvvatlamaydi</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <SectionCard title="Push bildirishnomalar">
      <div className="p-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
            <Bell className="h-5 w-5 text-muted-foreground" />
          </div>
          <div>
            <p className="font-medium text-sm">Brauzer bildirishnomalari</p>
            <p className="text-xs text-muted-foreground">
              {permission === 'granted'
                ? 'Yoqilgan - ilova fonda bo\u2019lganda xabar olasiz'
                : permission === 'denied'
                  ? 'Bloklangan - brauzer sozlamalaridan yoqing'
                  : 'Like, izoh va obunalar haqida xabar olish uchun yoqing'}
            </p>
          </div>
        </div>
        {permission === 'granted' ? (
          <div className="flex items-center gap-2 text-green-500">
            <CheckCircle2 className="h-5 w-5" />
            <span className="text-sm font-medium">Yoqilgan</span>
          </div>
        ) : permission === 'denied' ? (
          <div className="flex items-center gap-2 text-destructive">
            <XCircle className="h-5 w-5" />
            <span className="text-sm font-medium">Bloklangan</span>
          </div>
        ) : (
          <Button variant="outline" size="sm" onClick={handleEnablePush}>
            Yoqish
          </Button>
        )}
      </div>
    </SectionCard>
  );
}

export default function SettingsPage() {
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  const { user, logout } = useAuth();
  const { settings, sessions, isLoading, updateSettings, logoutSession, logoutAllOtherSessions } =
    useUserSettings();
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
  const [locationCoords, setLocationCoords] = useState<LocationCoords | null>(null);
  const [saving, setSaving] = useState(false);
  const [logoutDialogOpen, setLogoutDialogOpen] = useState(false);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [logoutAllDialogOpen, setLogoutAllDialogOpen] = useState(false);
  const [verificationDialogOpen, setVerificationDialogOpen] = useState(false);
  const [deleteAccountDialogOpen, setDeleteAccountDialogOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [section, setSection] = useState<string | null>(null);

  useEffect(() => {
    const fetchProfile = async () => {
      if (!user) return;

      const { data } = await supabase
        .from('profiles')
        .select(PROFILE_PUBLIC_COLUMNS)
        .eq('id', user.id)
        .single();

      // Shaxsiy maydonlar (tug'ilgan sana, davlat) faqat egasi yoki admin uchun.
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
        title: 'Profil yangilandi',
        description: 'Ma\u2019lumotlaringiz muvaffaqiyatli saqlandi.',
      });
    } catch (error: any) {
      toast({
        title: 'Xatolik',
        description: error.message || 'Profilni yangilab bo\u2019lmadi',
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
    } catch {
      toast({
        title: 'Xatolik',
        description: 'Avatarni yuklab bo\u2019lmadi',
        variant: 'destructive',
      });
      return;
    }

    await supabase.from('profiles').update({ avatar_url: avatarUrl }).eq('id', user.id);

    setProfile((prev) => ({ ...prev, avatar_url: avatarUrl }));
    toast({ title: 'Tayyor', description: 'Avatar yangilandi' });
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

  const handleSelectSection = (item: SectionItem) => {
    if (item.to) {
      navigate(item.to);
      return;
    }
    setSection(item.value);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const activeLabel = SECTION_GROUPS.flatMap((group) => group.items).find(
    (item) => item.value === section,
  )?.label;

  return (
    <div className="max-w-5xl mx-auto py-4 md:py-8 px-3 md:px-4 pb-24 md:pb-8">
      <div className="flex items-center gap-2 mb-4 md:mb-8">
        {section && (
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setSection(null)}
            aria-label="Orqaga"
          >
            <ChevronRight className="h-5 w-5 rotate-180" />
          </Button>
        )}
        <h1 className="text-xl md:text-2xl font-bold">{section ? activeLabel : 'Sozlamalar'}</h1>
      </div>

      <Tabs
        value={section ?? 'account'}
        className="md:grid md:grid-cols-[300px_1fr] md:gap-6 md:items-start"
      >
        {/* Chap panel */}
        <div className={cn('space-y-6', section && 'hidden md:block')}>
          {SECTION_GROUPS.map((group) => (
            <div key={group.title}>
              <p className="px-1 pb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {group.title}
              </p>
              <div className="rounded-2xl border border-border bg-card overflow-hidden">
                {group.items.map((item, idx) => {
                  const isActive = section === item.value;
                  return (
                    <button
                      key={item.value}
                      type="button"
                      onClick={() => handleSelectSection(item)}
                      className={cn(
                        'w-full flex items-center gap-3 px-4 py-3 text-left transition-colors',
                        idx !== 0 && 'border-t border-border/60',
                        isActive ? 'bg-primary/10' : 'hover:bg-accent/50',
                      )}
                    >
                      <span
                        className={cn(
                          'h-9 w-9 rounded-xl flex items-center justify-center shrink-0',
                          item.tint,
                        )}
                      >
                        <item.icon className="h-[18px] w-[18px]" />
                      </span>
                      <span className="flex-1 min-w-0">
                        <span
                          className={cn(
                            'block text-sm font-medium truncate',
                            isActive && 'text-primary',
                          )}
                        >
                          {item.label}
                        </span>
                        <span className="block text-xs text-muted-foreground truncate">
                          {item.description}
                        </span>
                      </span>
                      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          <Button variant="outline" className="w-full text-destructive" onClick={logout}>
            <LogOut className="h-4 w-4 mr-2" />
            Hisobdan chiqish
          </Button>
        </div>

        {/* O'ng panel */}
        <div className={cn('mt-6 md:mt-0 min-w-0', !section && 'hidden md:block')}>
          {!section && (
            <div className="hidden md:flex flex-col items-center justify-center text-center rounded-2xl border border-border bg-card/40 py-24">
              <Palette className="h-10 w-10 text-muted-foreground mb-4" />
              <p className="font-semibold">Sozlamani tanlang</p>
              <p className="text-sm text-muted-foreground mt-1">
                Chap paneldan sozlamalar bo\u2019limini tanlang
              </p>
            </div>
          )}

          {/* Profil */}
          <TabsContent value="account" className="space-y-6">
            <div className="bg-card rounded-xl border border-border p-6">
              <h2 className="text-lg font-semibold mb-6">Shaxsiy ma\u2019lumotlar</h2>

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
                    <span className="text-white text-xs">O\u2019zgartirish</span>
                  </div>
                </label>
                <div>
                  <p className="font-medium">{profile.display_name || 'Ism kiritilmagan'}</p>
                  <p className="text-sm text-muted-foreground">@{profile.username || 'username'}</p>
                </div>
              </div>

              <div className="grid gap-4">
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="display_name">Ko\u2019rsatiladigan ism</Label>
                    <Input
                      id="display_name"
                      value={profile.display_name || ''}
                      onChange={(e) =>
                        setProfile((prev) => ({ ...prev, display_name: e.target.value }))
                      }
                      className="mt-1.5"
                    />
                  </div>
                  <div>
                    <Label htmlFor="username">Username</Label>
                    <Input
                      id="username"
                      value={profile.username || ''}
                      onChange={(e) => setProfile((prev) => ({ ...prev, username: e.target.value }))}
                      className="mt-1.5"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="bio">Bio</Label>
                  <Textarea
                    id="bio"
                    value={profile.bio || ''}
                    onChange={(e) => setProfile((prev) => ({ ...prev, bio: e.target.value }))}
                    className="mt-1.5 resize-none"
                    rows={3}
                    placeholder="O\u2019zingiz haqingizda qisqacha..."
                  />
                </div>

                <div>
                  <Label htmlFor="website">Veb-sayt</Label>
                  <Input
                    id="website"
                    value={profile.website || ''}
                    onChange={(e) => setProfile((prev) => ({ ...prev, website: e.target.value }))}
                    className="mt-1.5"
                    placeholder="https://..."
                  />
                </div>

                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="country">Davlat</Label>
                    <Select
                      value={profile.country || ''}
                      onValueChange={(value) => setProfile((prev) => ({ ...prev, country: value }))}
                    >
                      <SelectTrigger id="country" className="mt-1.5">
                        <SelectValue placeholder="Davlatingizni tanlang" />
                      </SelectTrigger>
                      <SelectContent>
                        {COUNTRIES.map((country) => (
                          <SelectItem key={country.value} value={country.value}>
                            <span className="mr-2">{country.flag}</span>
                            {country.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="birth_date">Tug\u2019ilgan sana</Label>
                    <Input
                      id="birth_date"
                      type="date"
                      value={profile.birth_date || ''}
                      onChange={(e) =>
                        setProfile((prev) => ({ ...prev, birth_date: e.target.value }))
                      }
                      className="mt-1.5"
                      max={new Date().toISOString().split('T')[0]}
                    />
                  </div>
                </div>
              </div>

              <Button onClick={handleSaveProfile} disabled={saving} className="mt-6">
                {saving ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                Saqlash
              </Button>
            </div>

            {/* Manzil - real xarita */}
            <SectionCard
              title="Manzil"
              description="Manzilingizni xaritadan tanlang - u profilingizda ko\u2019rinadi"
            >
              <div className="p-4 md:p-6">
                <LocationPicker
                  value={profile.location || ''}
                  coords={locationCoords}
                  onChange={(label, coords) => {
                    setProfile((prev) => ({ ...prev, location: label }));
                    setLocationCoords(coords);
                  }}
                  onClear={() => {
                    setProfile((prev) => ({ ...prev, location: '' }));
                    setLocationCoords(null);
                  }}
                />
                <Button onClick={handleSaveProfile} disabled={saving} className="mt-4">
                  {saving ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4 mr-2" />
                  )}
                  Manzilni saqlash
                </Button>
              </div>
            </SectionCard>
          </TabsContent>

          {/* Tasdiqlash */}
          <TabsContent value="verification" className="space-y-6">
            <div className="bg-card rounded-xl border border-border p-6">
              <div className="flex items-center gap-4 mb-4">
                <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <BadgeCheck className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold">Tasdiqlangan nishon</h3>
                  <p className="text-sm text-muted-foreground">
                    Hisobingiz haqiqiyligini tasdiqlash uchun ariza yuboring
                  </p>
                </div>
              </div>
              <Button onClick={() => setVerificationDialogOpen(true)}>Ariza yuborish</Button>
            </div>
          </TabsContent>

          {/* Maxfiylik */}
          <TabsContent value="privacy" className="space-y-6">
            <SectionCard title="Maxfiylik sozlamalari">
              <div className="divide-y divide-border">
                <div className="p-4 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                      <Eye className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">Oxirgi faollik</p>
                      <p className="text-xs text-muted-foreground">
                        Kim onlayn vaqtingizni ko\u2019ra oladi
                      </p>
                    </div>
                  </div>
                  <Select
                    value={settings?.last_seen_visibility || 'everyone'}
                    onValueChange={(value: 'everyone' | 'contacts' | 'nobody') =>
                      updateSettings({ last_seen_visibility: value })
                    }
                  >
                    <SelectTrigger className="w-36">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="everyone">Hamma</SelectItem>
                      <SelectItem value="contacts">Kontaktlar</SelectItem>
                      <SelectItem value="nobody">Hech kim</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="p-4 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                      <CheckCircle2 className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">O\u2019qilgani haqida xabar</p>
                      <p className="text-xs text-muted-foreground">
                        Xabarni o\u2019qiganingiz boshqalarga ko\u2019rinadi
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={settings?.read_receipts_enabled ?? true}
                    onCheckedChange={(checked) => updateSettings({ read_receipts_enabled: checked })}
                  />
                </div>

                <div className="p-4 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                      <Wifi className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">Qo\u2019ng\u2019iroqlar</p>
                      <p className="text-xs text-muted-foreground">
                        Kim sizga qo\u2019ng\u2019iroq qila oladi
                      </p>
                    </div>
                  </div>
                  <Select
                    value={settings?.call_permissions || 'everyone'}
                    onValueChange={(value: 'everyone' | 'contacts' | 'nobody') =>
                      updateSettings({ call_permissions: value })
                    }
                  >
                    <SelectTrigger className="w-36">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="everyone">Hamma</SelectItem>
                      <SelectItem value="contacts">Kontaktlar</SelectItem>
                      <SelectItem value="nobody">Hech kim</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="p-4 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                      <User className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">Guruhga qo\u2019shish</p>
                      <p className="text-xs text-muted-foreground">
                        Kim sizni guruhlarga qo\u2019sha oladi
                      </p>
                    </div>
                  </div>
                  <Select
                    value={settings?.group_invite_permissions || 'everyone'}
                    onValueChange={(value: 'everyone' | 'contacts' | 'nobody') =>
                      updateSettings({ group_invite_permissions: value })
                    }
                  >
                    <SelectTrigger className="w-36">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="everyone">Hamma</SelectItem>
                      <SelectItem value="contacts">Kontaktlar</SelectItem>
                      <SelectItem value="nobody">Hech kim</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="p-4 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                      <Shield className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">Ikki bosqichli himoya</p>
                      <p className="text-xs text-muted-foreground">
                        Hisobingiz uchun qo\u2019shimcha xavfsizlik
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={settings?.two_factor_enabled ?? false}
                    onCheckedChange={(checked) => updateSettings({ two_factor_enabled: checked })}
                  />
                </div>
              </div>
            </SectionCard>
          </TabsContent>

          {/* Qurilmalar */}
          <TabsContent value="devices" className="space-y-6">
            <div className="bg-card rounded-xl border border-border overflow-hidden">
              <div className="p-4 border-b border-border flex items-center justify-between gap-4">
                <div>
                  <h2 className="font-semibold">Faol seanslar</h2>
                  <p className="text-sm text-muted-foreground">
                    {sessions.length} ta qurilma tizimga kirgan
                  </p>
                </div>
                {sessions.length > 1 && (
                  <Button variant="outline" size="sm" onClick={() => setLogoutAllDialogOpen(true)}>
                    <XCircle className="h-4 w-4 mr-2" />
                    Barchasini chiqarish
                  </Button>
                )}
              </div>

              <ScrollArea className="max-h-[420px]">
                <div className="divide-y divide-border">
                  {sessions.map((session) => {
                    const DeviceIcon = getDeviceIcon(session.device_type);
                    const meta = [session.os_name, session.browser_name, session.ip_address]
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
                                {session.device_name || session.browser_name || 'Noma\u2019lum qurilma'}
                              </p>
                              {session.is_current && (
                                <span className="px-2 py-0.5 bg-primary/10 text-primary text-xs rounded-full shrink-0">
                                  Joriy
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground truncate">
                              {meta || 'Noma\u2019lum IP'}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Oxirgi faollik:{' '}
                              {session.last_active_at
                                ? formatDistanceToNow(new Date(session.last_active_at), {
                                    addSuffix: true,
                                  })
                                : 'Noma\u2019lum'}
                            </p>
                          </div>
                        </div>
                        {!session.is_current && (
                          <Button
                            variant="ghost"
                            size="sm"
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

            <SectionCard
              title="Media avtomatik ijro"
              description="Chatdagi media fayllar avtomatik ijro etilishini boshqaring"
            >
              <div className="divide-y divide-border">
                <div className="p-4 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                      <Bell className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">Ovozli xabarlar</p>
                      <p className="text-xs text-muted-foreground">Ko\u2019ringanda avtomatik ijro</p>
                    </div>
                  </div>
                  <Switch
                    checked={settings?.autoplay_voice_messages ?? true}
                    onCheckedChange={(checked) =>
                      updateSettings({ autoplay_voice_messages: checked })
                    }
                  />
                </div>

                <div className="p-4 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                      <Bell className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">Video xabarlar</p>
                      <p className="text-xs text-muted-foreground">Ko\u2019ringanda avtomatik ijro</p>
                    </div>
                  </div>
                  <Switch
                    checked={settings?.autoplay_video_messages ?? true}
                    onCheckedChange={(checked) =>
                      updateSettings({ autoplay_video_messages: checked })
                    }
                  />
                </div>
              </div>
            </SectionCard>

            <SectionCard
              title="Bildirishnoma turlari"
              description="Qaysi bildirishnomalarni olishni tanlang"
            >
              <div className="divide-y divide-border">
                <div className="p-4 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                      <Heart className="h-5 w-5 text-foreground" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">Layklar</p>
                      <p className="text-xs text-muted-foreground">Postingizga like bosilganda</p>
                    </div>
                  </div>
                  <Switch
                    checked={settings?.notify_likes ?? true}
                    onCheckedChange={(checked) => updateSettings({ notify_likes: checked })}
                  />
                </div>

                <div className="p-4 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                      <MessageCircle className="h-5 w-5 text-foreground" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">Izohlar</p>
                      <p className="text-xs text-muted-foreground">Postingizga izoh yozilganda</p>
                    </div>
                  </div>
                  <Switch
                    checked={settings?.notify_comments ?? true}
                    onCheckedChange={(checked) => updateSettings({ notify_comments: checked })}
                  />
                </div>

                <div className="p-4 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                      <UserPlus className="h-5 w-5 text-foreground" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">Yangi obunachilar</p>
                      <p className="text-xs text-muted-foreground">Kimdir sizga obuna bo\u2019lganda</p>
                    </div>
                  </div>
                  <Switch
                    checked={settings?.notify_follows ?? true}
                    onCheckedChange={(checked) => updateSettings({ notify_follows: checked })}
                  />
                </div>

                <div className="p-4 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                      <AtSign className="h-5 w-5 text-foreground" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">Eslatishlar</p>
                      <p className="text-xs text-muted-foreground">Kimdir sizni @mention qilganda</p>
                    </div>
                  </div>
                  <Switch
                    checked={settings?.notify_mentions ?? true}
                    onCheckedChange={(checked) => updateSettings({ notify_mentions: checked })}
                  />
                </div>
              </div>
            </SectionCard>

            <SectionCard title="Bildirishnoma afzalliklari">
              <div className="divide-y divide-border">
                <div className="p-4 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                      <Bell className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">Bildirishnoma ovozi</p>
                      <p className="text-xs text-muted-foreground">Yangi xabarlarda ovoz chalinadi</p>
                    </div>
                  </div>
                  <Switch
                    checked={settings?.notification_sounds ?? true}
                    onCheckedChange={(checked) => updateSettings({ notification_sounds: checked })}
                  />
                </div>

                <div className="p-4 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                      <Eye className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">Xabar matnini ko\u2019rsatish</p>
                      <p className="text-xs text-muted-foreground">
                        Bildirishnomada xabar mazmuni ko\u2019rinadi
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={settings?.notification_preview ?? true}
                    onCheckedChange={(checked) => updateSettings({ notification_preview: checked })}
                  />
                </div>
              </div>
            </SectionCard>
          </TabsContent>

          {/* Mavzu va til */}
          <TabsContent value="appearance" className="space-y-6">
            <SectionCard title="Mavzu" description="Interfeys ko\u2019rinishini tanlang">
              <div className="p-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                    {theme === 'dark' ? (
                      <Moon className="h-5 w-5 text-muted-foreground" />
                    ) : theme === 'light' ? (
                      <Sun className="h-5 w-5 text-muted-foreground" />
                    ) : (
                      <Monitor className="h-5 w-5 text-muted-foreground" />
                    )}
                  </div>
                  <div>
                    <p className="font-medium text-sm">Rang rejimi</p>
                    <p className="text-xs text-muted-foreground">Tizim, yorug\u2019 yoki tungi</p>
                  </div>
                </div>
                <Select value={theme} onValueChange={setTheme}>
                  <SelectTrigger className="w-36">
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
                        Yorug\u2019
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
            </SectionCard>

            <div>
              <LanguageSwitcher />
            </div>
          </TabsContent>

          {/* Chat foni */}
          <TabsContent value="chat-wallpaper" className="space-y-6">
            <SectionCard
              title="Chat foni"
              description="Tayyor fonlardan tanlang yoki o\u2019z rasmingizni yuklang. Tanlov shu qurilmada saqlanadi."
            >
              <div className="p-4 md:p-6">
                <ChatWallpaperEditor />
              </div>
            </SectionCard>
          </TabsContent>

          {/* Ma'lumotlar va xotira */}
          <TabsContent value="data-storage" className="space-y-6">
            <div className="bg-card rounded-xl border border-border p-4 md:p-6">
              <MediaAutoDownloadEditor />
            </div>
          </TabsContent>

          {/* Ilova haqida */}
          <TabsContent value="about" className="space-y-6">
            <SectionCard title="Ilova haqida">
              <div className="divide-y divide-border">
                <div className="p-4 flex items-center justify-between gap-4">
                  <div>
                    <p className="font-medium text-sm">Alsamos Social</p>
                    <p className="text-xs text-muted-foreground">Versiya {APP_VERSION}</p>
                  </div>
                  <Info className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="p-4 flex items-center justify-between gap-4">
                  <div>
                    <p className="font-medium text-sm">Faollik va statistika</p>
                    <p className="text-xs text-muted-foreground">
                      Platformada sarflagan vaqtingiz
                    </p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => navigate('/activity')}>
                    <Clock className="h-4 w-4 mr-2" />
                    Ko\u2019rish
                  </Button>
                </div>
              </div>
            </SectionCard>

            <div className="bg-card rounded-xl border border-destructive/30 p-6">
              <div className="flex items-center gap-4 mb-4">
                <div className="h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center">
                  <Trash2 className="h-6 w-6 text-destructive" />
                </div>
                <div>
                  <h3 className="font-semibold text-destructive">Hisobni o\u2019chirish</h3>
                  <p className="text-sm text-muted-foreground">
                    Hisobingiz va barcha ma\u2019lumotlaringiz butunlay o\u2019chiriladi
                  </p>
                </div>
              </div>
              <p className="text-sm text-muted-foreground mb-4">
                Hisobni o\u2019chirgandan so\u2019ng uni tiklab bo\u2019lmaydi. Barcha postlar,
                xabarlar va shaxsiy ma\u2019lumotlar butunlay o\u2019chib ketadi.
              </p>
              <Button variant="destructive" onClick={() => setDeleteAccountDialogOpen(true)}>
                <Trash2 className="h-4 w-4 mr-2" />
                Hisobimni o\u2019chirish
              </Button>
            </div>
          </TabsContent>
        </div>
      </Tabs>

      {/* Footer */}
      <div className="text-center text-xs text-muted-foreground pt-8">
        <p>Alsamos Social v{APP_VERSION}</p>
        <p className="mt-1">
          \u00A9 {new Date().getFullYear()} Alsamos. Barcha huquqlar himoyalangan.
        </p>
      </div>

      <VerificationRequestDialog
        open={verificationDialogOpen}
        onOpenChange={setVerificationDialogOpen}
      />

      {/* Hisobni o'chirish dialogi */}
      <AlertDialog open={deleteAccountDialogOpen} onOpenChange={setDeleteAccountDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">Hisobni o\u2019chirish</AlertDialogTitle>
            <AlertDialogDescription>
              Bu amalni ortga qaytarib bo\u2019lmaydi. Hisobingiz va barcha ma\u2019lumotlaringiz
              serverlarimizdan butunlay o\u2019chiriladi.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <p className="text-sm">
              Tasdiqlash uchun <span className="font-semibold">DELETE</span> deb yozing:
            </p>
            <Input
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder="DELETE"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteConfirmText('')}>Bekor qilish</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={deleteConfirmText !== 'DELETE' || deletingAccount}
              onClick={async () => {
                setDeletingAccount(true);
                try {
                  const { error: profileError } = await supabase
                    .from('profiles')
                    .delete()
                    .eq('id', user?.id);

                  if (profileError) throw profileError;

                  await supabase.auth.signOut();

                  toast({
                    title: 'Hisob o\u2019chirildi',
                    description: 'Hisobingiz butunlay o\u2019chirildi.',
                  });

                  navigate('/');
                } catch (error: any) {
                  toast({
                    title: 'Xatolik',
                    description: error.message || 'Hisobni o\u2019chirib bo\u2019lmadi',
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
              O\u2019chirish
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Seansdan chiqarish */}
      <AlertDialog open={logoutDialogOpen} onOpenChange={setLogoutDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Qurilmani chiqarish</AlertDialogTitle>
            <AlertDialogDescription>
              Tanlangan qurilma tizimdan chiqariladi va qayta kirish talab qilinadi.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Bekor qilish</AlertDialogCancel>
            <AlertDialogAction onClick={handleLogoutSession}>Chiqarish</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Barcha boshqa qurilmalarni chiqarish */}
      <AlertDialog open={logoutAllDialogOpen} onOpenChange={setLogoutAllDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Barcha boshqa qurilmalarni chiqarish</AlertDialogTitle>
            <AlertDialogDescription>
              Joriy qurilmadan tashqari barcha qurilmalar tizimdan chiqariladi.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Bekor qilish</AlertDialogCancel>
            <AlertDialogAction onClick={handleLogoutAllOthers}>Chiqarish</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
