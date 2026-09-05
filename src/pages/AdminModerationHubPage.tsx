import { Navigate, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowUpRight,
  BadgeCheck,
  FileText,
  Loader2,
  Megaphone,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Sticker,
  Users,
} from 'lucide-react';
import { useAdminAccess } from '@/hooks/useAdminAccess';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export default function AdminModerationHubPage() {
  const navigate = useNavigate();
  const { isAdmin, isLoading, hasPermission } = useAdminAccess();

  if (isLoading) {
    return <div className="flex h-full items-center justify-center bg-background"><Loader2 className="h-7 w-7 animate-spin text-muted-foreground" /></div>;
  }

  if (!isAdmin) return <Navigate to="/home" replace />;

  const tools = [
    { title: 'Post va izohlar', description: 'Platformadagi kontentni ko‘rish va kerak bo‘lsa olib tashlash.', icon: FileText, path: '/admin/content', enabled: true },
    { title: 'Foydalanuvchilar', description: 'Profil, verifikatsiya va umumiy hisob holatini tekshirish.', icon: Users, path: '/admin/users', enabled: true },
    { title: 'Verifikatsiya', description: 'Tasdiqlash arizalarini hujjatlar bilan birga ko‘rib chiqish.', icon: BadgeCheck, path: '/admin/verification', enabled: true },
    { title: 'Reklama moderatsiyasi', description: 'Creative, landing, advertiser va policy signallariga asoslangan Ads Review queue.', icon: Megaphone, path: '/admin/ads-review', enabled: hasPermission('ads.review'), badge: 'Ads Review' },
    { title: 'Ads Integrity', description: 'Invalid traffic, click burst, rapid duplicate va fraud signallarini tekshirish.', icon: ShieldAlert, path: '/admin/ads-integrity', enabled: hasPermission('ads.review'), badge: 'Risk' },
    { title: 'Mini ilovalar', description: 'Publisherlar yuborgan mini ilovalarni moderatsiya qilish.', icon: Sparkles, path: '/mini-apps/moderation', enabled: true },
    { title: 'Stiker paketlari', description: 'Stiker paketlari va ularning kontentini tekshirish.', icon: Sticker, path: '/stickers/moderation', enabled: true },
    { title: 'Admin huquqlari', description: 'Operatorlar va kirish rollarini boshqarish.', icon: ShieldCheck, path: '/admin/team', enabled: hasPermission('admin.roles.view') || hasPermission('admin.roles.manage') },
  ].filter((tool) => tool.enabled);

  return (
    <div className="h-full overflow-y-auto bg-background pb-10">
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/95 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-4 sm:px-6 lg:px-8">
          <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl" onClick={() => navigate('/admin')} aria-label="Admin markaziga qaytish">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-muted-foreground">Alsamos Admin · Trust & Safety</p>
            <h1 className="truncate text-lg font-semibold">Moderatsiya markazi</h1>
          </div>
          <Badge variant="outline" className="hidden rounded-full font-normal sm:inline-flex">Permission-aware</Badge>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <section className="mb-6 rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="max-w-3xl">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Control plane</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight">Barcha moderation oqimlari bitta markazda</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Reklama review va invalid-traffic nazorati endi Admin Console ichidagi Moderatsiya bo‘limidan to‘g‘ridan-to‘g‘ri ochiladi. Ko‘rinadigan vositalar operator permissionlariga qarab filtrlab beriladi.
            </p>
          </div>
        </section>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {tools.map((tool) => (
            <button
              key={tool.path}
              type="button"
              onClick={() => navigate(tool.path)}
              className={cn(
                'group rounded-2xl border border-border bg-card p-5 text-left shadow-sm transition-all',
                'hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              )}
            >
              <div className="mb-8 flex items-start justify-between gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-muted/35"><tool.icon className="h-4 w-4" /></div>
                <div className="flex items-center gap-2">
                  {'badge' in tool && tool.badge && <Badge variant="secondary" className="rounded-full text-[9px] font-medium">{tool.badge}</Badge>}
                  <ArrowUpRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                </div>
              </div>
              <h3 className="font-semibold">{tool.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{tool.description}</p>
            </button>
          ))}
        </div>
      </main>
    </div>
  );
}
