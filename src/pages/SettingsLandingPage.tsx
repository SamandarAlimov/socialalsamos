import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  BarChart3,
  Bell,
  ChevronRight,
  FlaskConical,
  Globe,
  HardDrive,
  Image as ImageIcon,
  Megaphone,
  MessageSquareText,
  Palette,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  User,
  Wallet,
} from 'lucide-react';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { useAdminAccess } from '@/hooks/useAdminAccess';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';

type ControlCenterItem = {
  id: string;
  label: string;
  description: string;
  path: string;
  icon: React.ElementType;
  tint?: string;
  danger?: boolean;
};

type ControlCenterGroup = {
  title: string;
  description?: string;
  items: ControlCenterItem[];
};

const ACCOUNT_GROUPS: ControlCenterGroup[] = [
  {
    title: 'Hisob',
    items: [
      {
        id: 'profile',
        label: 'Profilim',
        description: 'Ism, username, bio va joylashuv',
        path: '/settings/profile',
        icon: User,
        tint: 'text-rose-500 bg-rose-500/10',
      },
      {
        id: 'privacy',
        label: 'Maxfiylik',
        description: 'Ko‘rinish, aloqa va maxfiylik ruxsatlari',
        path: '/settings/privacy',
        icon: Shield,
        tint: 'text-amber-500 bg-amber-500/10',
      },
      {
        id: 'security',
        label: 'Xavfsizlik',
        description: '2FA, zaxira kodlar va hisob himoyasi',
        path: '/settings/security',
        icon: ShieldCheck,
        tint: 'text-emerald-600 bg-emerald-600/10',
      },
      {
        id: 'devices',
        label: 'Qurilmalar',
        description: 'Faol kirishlar va sessiyalar',
        path: '/settings/devices',
        icon: Smartphone,
        tint: 'text-sky-500 bg-sky-500/10',
      },
    ],
  },
  {
    title: 'Ilova',
    items: [
      {
        id: 'notifications',
        label: 'Bildirishnomalar',
        description: 'Push, ovoz va bildirishnoma turlari',
        path: '/settings/notifications',
        icon: Bell,
        tint: 'text-violet-500 bg-violet-500/10',
      },
      {
        id: 'appearance',
        label: 'Ko‘rinish',
        description: 'Yorug‘, tungi yoki tizim rejimi',
        path: '/settings/appearance',
        icon: Palette,
        tint: 'text-fuchsia-500 bg-fuchsia-500/10',
      },
      {
        id: 'language',
        label: 'Til va hudud',
        description: 'Interfeys tili va lokal sozlamalar',
        path: '/settings/language',
        icon: Globe,
        tint: 'text-teal-500 bg-teal-500/10',
      },
    ],
  },
  {
    title: 'Chat va media',
    items: [
      {
        id: 'chat',
        label: 'Chat ko‘rinishi',
        description: 'Xabar aksenti va chat foni',
        path: '/settings/chat',
        icon: ImageIcon,
        tint: 'text-emerald-500 bg-emerald-500/10',
      },
      {
        id: 'data',
        label: 'Ma’lumotlar va xotira',
        description: 'Media, trafik va avtomatik yuklab olish',
        path: '/settings/data',
        icon: HardDrive,
        tint: 'text-cyan-500 bg-cyan-500/10',
      },
    ],
  },
  {
    title: 'Hisob va faollik',
    items: [
      {
        id: 'payment',
        label: 'To‘lov',
        description: 'Balans, hamyon va tranzaksiyalar',
        path: '/payment',
        icon: Wallet,
        tint: 'text-lime-600 bg-lime-600/10',
      },
      {
        id: 'activity',
        label: 'Faolligim',
        description: 'Sarflangan vaqt va foydalanish statistikasi',
        path: '/activity',
        icon: BarChart3,
        tint: 'text-indigo-500 bg-indigo-500/10',
      },
      {
        id: 'account-management',
        label: 'Hisobni boshqarish',
        description: 'Chiqish va hisobni o‘chirish',
        path: '/settings/account-management',
        icon: AlertTriangle,
        tint: 'text-destructive bg-destructive/10',
        danger: true,
      },
    ],
  },
];

const PLATFORM_TOOLS: ControlCenterGroup = {
  title: 'Platform vositalari',
  description: 'Global sidebarni band qilmasdan, kamroq ishlatiladigan ish vositalarini shu markazdan oching.',
  items: [
    {
      id: 'ads',
      label: 'Reklama markazi',
      description: 'Kampaniyalar, targeting va reklama natijalari',
      path: '/ads',
      icon: Megaphone,
      tint: 'text-orange-600 bg-orange-500/10',
    },
    {
      id: 'experiments',
      label: 'A/B testlar',
      description: 'Kreativ va kampaniya variantlarini solishtirish',
      path: '/ads/experiments',
      icon: FlaskConical,
      tint: 'text-violet-600 bg-violet-500/10',
    },
    {
      id: 'feedback',
      label: 'Feedback va yordam',
      description: 'Muammo, taklif va support murojaatlarini boshqarish',
      path: '/feedback',
      icon: MessageSquareText,
      tint: 'text-sky-600 bg-sky-500/10',
    },
  ],
};

function SettingsGroupCard({ group, onNavigate }: { group: ControlCenterGroup; onNavigate: (path: string) => void }) {
  return (
    <section>
      <div className="mb-2 px-1">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.09em] text-muted-foreground">
          {group.title}
        </h2>
        {group.description && (
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground">
            {group.description}
          </p>
        )}
      </div>
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        {group.items.map((item, index) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onNavigate(item.path)}
            className={cn(
              'group flex w-full items-center gap-3.5 px-4 py-4 text-left transition-colors hover:bg-accent/50 md:px-5',
              index > 0 && 'border-t border-border/60',
            )}
          >
            <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground', item.tint)}>
              <item.icon className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className={cn('block text-sm font-medium', item.danger && 'text-destructive')}>
                {item.label}
              </span>
              <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                {item.description}
              </span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </button>
        ))}
      </div>
    </section>
  );
}

export default function SettingsLandingPage() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const { isAdmin, hasPermission, primaryRole } = useAdminAccess();

  const adminGroup = useMemo<ControlCenterGroup | null>(() => {
    if (!isAdmin) return null;

    const items: ControlCenterItem[] = [
      {
        id: 'admin',
        label: 'Admin panel',
        description: 'Platforma boshqaruvi va moderatsiya markazi',
        path: '/admin',
        icon: Shield,
        tint: 'text-slate-600 bg-slate-500/10 dark:text-slate-300',
      },
    ];

    if (hasPermission('feedback.view') || hasPermission('feedback.review')) {
      items.push({
        id: 'admin-feedback',
        label: 'Feedback & Support',
        description: 'Foydalanuvchi murojaatlarini ko‘rish va javob berish',
        path: '/admin/feedback',
        icon: MessageSquareText,
        tint: 'text-blue-600 bg-blue-500/10',
      });
    }

    if (hasPermission('ads.review')) {
      items.push(
        {
          id: 'ads-review',
          label: 'Ads Review',
          description: 'Reklama materiallarini tekshirish va moderatsiya qilish',
          path: '/admin/ads-review',
          icon: Megaphone,
          tint: 'text-orange-600 bg-orange-500/10',
        },
        {
          id: 'ads-integrity',
          label: 'Ads Integrity',
          description: 'Reklama xavfsizligi, risk va integrity nazorati',
          path: '/admin/ads-integrity',
          icon: ShieldAlert,
          tint: 'text-red-600 bg-red-500/10',
        },
      );
    }

    return {
      title: 'Administratsiya',
      description: 'Bu bo‘lim faqat sizning admin rolingiz va ruxsatlaringizga mos ravishda ko‘rinadi.',
      items,
    };
  }, [hasPermission, isAdmin]);

  const roleLabel = primaryRole
    ? primaryRole.replaceAll('_', ' ')
    : null;

  return (
    <div className="mx-auto max-w-5xl px-3 pb-24 pt-4 md:px-5 md:pb-10 md:pt-7">
      <header className="mb-6 md:mb-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Sozlamalar</h1>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              Hisob, ilova va platforma boshqaruvini bitta tartibli markazdan oching.
            </p>
          </div>
          <Button variant="outline" onClick={() => navigate('/profile')} className="self-start sm:self-auto">
            Profilni ko‘rish
          </Button>
        </div>
      </header>

      <section className="mb-7 overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="relative p-4 md:p-5">
          <div className="pointer-events-none absolute -right-14 -top-14 h-36 w-36 rounded-full bg-primary/5 blur-3xl" />
          <div className="relative flex items-center gap-4">
            <Avatar className="h-14 w-14 ring-1 ring-border">
              <AvatarImage src={profile?.avatar_url || ''} />
              <AvatarFallback className="text-lg">
                {profile?.display_name?.[0] || user?.email?.[0]?.toUpperCase() || 'A'}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{profile?.display_name || 'Profilingiz'}</p>
              <p className="mt-0.5 truncate text-sm text-muted-foreground">
                {profile?.username ? `@${profile.username}` : user?.email || 'Alsamos hisobi'}
              </p>
            </div>
            {isAdmin && (
              <span className="hidden rounded-full border border-border bg-muted px-2.5 py-1 text-[11px] font-semibold capitalize text-muted-foreground sm:inline-flex">
                {roleLabel || 'admin'}
              </span>
            )}
          </div>
        </div>
      </section>

      <div className="grid gap-7 lg:grid-cols-2 lg:items-start">
        <div className="space-y-6">
          {ACCOUNT_GROUPS.slice(0, 2).map((group) => (
            <SettingsGroupCard key={group.title} group={group} onNavigate={navigate} />
          ))}
        </div>
        <div className="space-y-6">
          {ACCOUNT_GROUPS.slice(2).map((group) => (
            <SettingsGroupCard key={group.title} group={group} onNavigate={navigate} />
          ))}
        </div>
      </div>

      <div className="mt-8 grid gap-7 lg:grid-cols-2 lg:items-start">
        <SettingsGroupCard group={PLATFORM_TOOLS} onNavigate={navigate} />
        {adminGroup ? (
          <SettingsGroupCard group={adminGroup} onNavigate={navigate} />
        ) : (
          <section className="rounded-2xl border border-dashed border-border bg-muted/20 p-5">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted">
                <ShieldCheck className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <h2 className="text-sm font-semibold">Boshqaruv vositalari tartibga solindi</h2>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  Admin funksiyalar global navigatsiyada ko‘rinmaydi. Admin ruxsati bo‘lgan hisoblarda ular shu yerda avtomatik paydo bo‘ladi.
                </p>
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
