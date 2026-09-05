import { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  BarChart3,
  CalendarDays,
  CreditCard,
  Eye,
  Gauge,
  Image as ImageIcon,
  Layers3,
  Loader2,
  Megaphone,
  MoreHorizontal,
  MousePointerClick,
  Pause,
  Play,
  Plus,
  RefreshCw,
  ShieldCheck,
  Target,
  Trash2,
  TrendingUp,
  Users,
  WalletCards,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { CreateAdDialog } from './CreateAdDialog';
import { AdStatsDialog } from './AdStatsDialog';
import { cn } from '@/lib/utils';
import { useUserAds, type Ad } from '@/hooks/useAds';

type AdsSection =
  | 'overview'
  | 'campaigns'
  | 'creatives'
  | 'audiences'
  | 'delivery'
  | 'billing';

type CampaignFilter = 'all' | 'active' | 'paused' | 'pending' | 'rejected' | 'completed';

const SECTIONS: Array<{
  id: AdsSection;
  label: string;
  description: string;
  icon: typeof Megaphone;
}> = [
  { id: 'overview', label: 'Umumiy', description: 'KPI va kampaniya holati', icon: BarChart3 },
  { id: 'campaigns', label: 'Kampaniyalar', description: 'Faol va rejalashtirilgan reklamalar', icon: Megaphone },
  { id: 'creatives', label: 'Kreativlar', description: 'Rasm, video va CTA materiallari', icon: ImageIcon },
  { id: 'audiences', label: 'Auditoriyalar', description: 'Targeting va segmentlar', icon: Target },
  { id: 'delivery', label: 'Delivery', description: 'Ad load, pacing va user tajribasi', icon: Gauge },
  { id: 'billing', label: 'To‘lovlar', description: 'Byudjet va payment markazi', icon: CreditCard },
];

const FILTERS: Array<{ id: CampaignFilter; label: string }> = [
  { id: 'all', label: 'Hammasi' },
  { id: 'active', label: 'Faol' },
  { id: 'pending', label: 'Tekshirilmoqda' },
  { id: 'paused', label: 'To‘xtatilgan' },
  { id: 'rejected', label: 'Rad etilgan' },
  { id: 'completed', label: 'Tugallangan' },
];

const DELIVERY_SURFACES = [
  {
    name: 'Home',
    detail: 'Fixed interval yo‘q. Session yoshi, oldingi reklama va kundalik cap birga tekshiriladi.',
    cap: '2 / session · 5 / kun',
  },
  {
    name: 'Discover',
    detail: 'High-intent sahifa. Reklama darhol chiqmaydi va bir sessionda bittadan oshmaydi.',
    cap: '1 / session · 2 / kun',
  },
  {
    name: 'Videos',
    detail: 'Avval organic viewing. Keyin kam uchraydigan full-screen Sponsored Reel, swipe bilan darhol skip.',
    cap: '2 / session · 3 / kun',
  },
  {
    name: 'Public channels',
    detail: 'Faqat public discovery. Private chat va direct message ichida reklama yo‘q.',
    cap: '1 / session · 2 / kun',
  },
];

function sectionFromPath(pathname: string): AdsSection {
  const raw = pathname.replace(/^\/ads\/?/, '').split('/')[0];
  if (!raw) return 'overview';
  return SECTIONS.some((item) => item.id === raw) ? (raw as AdsSection) : 'overview';
}

function sectionPath(section: AdsSection) {
  return section === 'overview' ? '/ads' : `/ads/${section}`;
}

function money(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}

function compact(value: number) {
  return new Intl.NumberFormat('uz-UZ', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value || 0);
}

function statusMeta(status: Ad['status']) {
  switch (status) {
    case 'active':
      return { label: 'Faol', className: 'bg-foreground text-background border-foreground' };
    case 'pending':
      return { label: 'Tekshirilmoqda', className: 'bg-muted text-foreground border-border' };
    case 'paused':
      return { label: 'To‘xtatilgan', className: 'bg-background text-muted-foreground border-border' };
    case 'rejected':
      return { label: 'Rad etilgan', className: 'bg-destructive/10 text-destructive border-destructive/20' };
    case 'completed':
      return { label: 'Tugallangan', className: 'bg-muted text-muted-foreground border-border' };
  }
}

function StatusBadge({ status }: { status: Ad['status'] }) {
  const meta = statusMeta(status);
  return (
    <Badge variant="outline" className={cn('rounded-full px-2.5 py-1 text-[10px] font-semibold', meta.className)}>
      {meta.label}
    </Badge>
  );
}

function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
}: {
  label: string;
  value: string;
  detail: string;
  icon: typeof Eye;
}) {
  return (
    <div className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
        </div>
        <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-border/70 bg-muted/35">
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex min-h-72 flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-muted/10 px-6 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-border bg-background shadow-sm">
        <Megaphone className="h-5 w-5" />
      </span>
      <h3 className="mt-4 text-base font-semibold">Hali kampaniya yo‘q</h3>
      <p className="mt-1 max-w-sm text-sm leading-relaxed text-muted-foreground">
        Birinchi reklamani yarating. Moderatsiyadan keyin delivery tizimi mos auditoriya va xavfsiz ad load asosida joylashtiradi.
      </p>
      <Button onClick={onCreate} className="mt-5 rounded-xl bg-foreground text-background hover:bg-foreground/90">
        <Plus className="mr-2 h-4 w-4" /> Yangi kampaniya
      </Button>
    </div>
  );
}

export function AdsManagerPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { ads, isLoading, refetch, pauseAd, resumeAd, deleteAd } = useUserAds();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedAdId, setSelectedAdId] = useState<string | null>(null);
  const [filter, setFilter] = useState<CampaignFilter>('all');

  const section = sectionFromPath(location.pathname);
  const sectionMeta = SECTIONS.find((item) => item.id === section) || SECTIONS[0];

  const totals = useMemo(() => {
    const impressions = ads.reduce((sum, ad) => sum + (ad.impressions_count || 0), 0);
    const clicks = ads.reduce((sum, ad) => sum + (ad.clicks_count || 0), 0);
    const reach = ads.reduce((sum, ad) => sum + (ad.reach_count || 0), 0);
    const spent = ads.reduce((sum, ad) => sum + Number(ad.spent || 0), 0);
    const budget = ads.reduce((sum, ad) => sum + Number(ad.budget || 0), 0);
    const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
    const active = ads.filter((ad) => ad.status === 'active').length;
    const pending = ads.filter((ad) => ad.status === 'pending').length;
    return { impressions, clicks, reach, spent, budget, ctr, active, pending };
  }, [ads]);

  const filteredAds = useMemo(
    () => ads.filter((ad) => filter === 'all' || ad.status === filter),
    [ads, filter],
  );

  const paymentHref = '/payment?source=ads&returnTo=%2Fads%2Fbilling';

  const campaignRow = (ad: Ad) => {
    const progress = ad.budget > 0
      ? Math.min(100, (Number(ad.spent || 0) / Number(ad.budget)) * 100)
      : 0;

    return (
      <article key={ad.id} className="border-b border-border/60 px-4 py-4 last:border-b-0 sm:px-5">
        <div className="flex items-start gap-3 sm:gap-4">
          <button
            type="button"
            onClick={() => setSelectedAdId(ad.id)}
            className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-muted sm:h-20 sm:w-20"
          >
            {ad.media_type === 'video' ? (
              <video src={ad.media_url} muted playsInline preload="metadata" className="h-full w-full object-cover" />
            ) : (
              <img src={ad.media_url} alt={ad.title} loading="lazy" className="h-full w-full object-cover" />
            )}
            <span className="absolute bottom-1.5 left-1.5 rounded-md bg-black/70 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-white">
              {ad.media_type === 'video' ? 'Video' : 'Image'}
            </span>
          </button>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-start gap-2">
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-sm font-semibold sm:text-base">{ad.title}</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  {ad.billing_type.toUpperCase()} · {ad.ad_type === 'story' ? 'Story' : ad.ad_type === 'both' ? 'Feed + Story' : 'Feed / Discover / Video'}
                </p>
              </div>
              <StatusBadge status={ad.status} />
            </div>

            <div className="mt-3 grid grid-cols-3 gap-3 text-xs">
              <div><p className="text-muted-foreground">Ko‘rish</p><p className="mt-0.5 font-semibold tabular-nums">{compact(ad.impressions_count || 0)}</p></div>
              <div><p className="text-muted-foreground">Klik</p><p className="mt-0.5 font-semibold tabular-nums">{compact(ad.clicks_count || 0)}</p></div>
              <div><p className="text-muted-foreground">Sarflandi</p><p className="mt-0.5 font-semibold tabular-nums">{money(Number(ad.spent || 0))}</p></div>
            </div>

            <div className="mt-3">
              <div className="mb-1.5 flex items-center justify-between gap-3 text-[11px] text-muted-foreground">
                <span>Byudjet</span>
                <span className="tabular-nums">{money(Number(ad.spent || 0))} / {money(Number(ad.budget || 0))}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-foreground transition-all" style={{ width: `${progress}%` }} />
              </div>
            </div>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 rounded-lg">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={() => setSelectedAdId(ad.id)}>
                <BarChart3 className="mr-2 h-4 w-4" /> Statistika
              </DropdownMenuItem>
              {ad.status === 'active' && (
                <DropdownMenuItem onClick={() => void pauseAd(ad.id)}>
                  <Pause className="mr-2 h-4 w-4" /> To‘xtatish
                </DropdownMenuItem>
              )}
              {ad.status === 'paused' && (
                <DropdownMenuItem onClick={() => void resumeAd(ad.id)}>
                  <Play className="mr-2 h-4 w-4" /> Davom ettirish
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => void deleteAd(ad.id)}>
                <Trash2 className="mr-2 h-4 w-4" /> O‘chirish
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </article>
    );
  };

  const renderOverview = () => (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard label="Ko‘rsatishlar" value={compact(totals.impressions)} detail={`${compact(totals.reach)} noyob auditoriya`} icon={Eye} />
        <MetricCard label="Kliklar" value={compact(totals.clicks)} detail={`${totals.ctr.toFixed(2)}% umumiy CTR`} icon={MousePointerClick} />
        <MetricCard label="Sarflangan" value={money(totals.spent)} detail={`${money(Math.max(0, totals.budget - totals.spent))} byudjet qoldi`} icon={WalletCards} />
        <MetricCard label="Faol kampaniya" value={String(totals.active)} detail={`${totals.pending} ta moderatsiyada`} icon={TrendingUp} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
        <section className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm">
          <div className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-4 sm:px-5">
            <div><h2 className="text-sm font-semibold">Kampaniyalar holati</h2><p className="mt-1 text-xs text-muted-foreground">Eng yangi reklamalar va delivery holati.</p></div>
            <Button variant="ghost" size="sm" className="rounded-lg" onClick={() => navigate('/ads/campaigns')}>Barchasi <ArrowRight className="ml-1.5 h-3.5 w-3.5" /></Button>
          </div>
          {isLoading ? (
            <div className="flex min-h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : ads.length ? (
            ads.slice(0, 4).map(campaignRow)
          ) : (
            <div className="p-4"><EmptyState onCreate={() => setShowCreateDialog(true)} /></div>
          )}
        </section>

        <div className="space-y-4">
          <section className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-muted/35"><Layers3 className="h-4 w-4" /></span>
              <div><h2 className="text-sm font-semibold">Premium joylashuvlar</h2><p className="text-xs text-muted-foreground">Fixed interval emas — pacing va relevance.</p></div>
            </div>
            <div className="mt-4 space-y-2.5">
              {DELIVERY_SURFACES.map((surface) => (
                <button key={surface.name} type="button" onClick={() => navigate('/ads/delivery')} className="block w-full rounded-xl border border-border/60 bg-muted/15 p-3 text-left transition hover:bg-muted/30">
                  <div className="flex items-center justify-between gap-3"><p className="text-xs font-semibold">{surface.name}</p><span className="text-[10px] text-muted-foreground">{surface.cap}</span></div>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{surface.detail}</p>
                </button>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 h-5 w-5 text-muted-foreground" />
              <div><h2 className="text-sm font-semibold">Moderatsiya va sifat</h2><p className="mt-1 text-xs leading-relaxed text-muted-foreground">Har kreativ review qilinadi. Reklama aniq belgilanadi va user uni hide, not relevant, too often yoki report qilishi mumkin.</p></div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );

  const renderCampaigns = () => (
    <div className="space-y-4">
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hidden">
        {FILTERS.map((item) => {
          const count = item.id === 'all' ? ads.length : ads.filter((ad) => ad.status === item.id).length;
          const active = filter === item.id;
          return (
            <button key={item.id} type="button" onClick={() => setFilter(item.id)} className={cn('shrink-0 rounded-full border px-3.5 py-2 text-xs font-medium transition', active ? 'border-foreground bg-foreground text-background' : 'border-border bg-card text-muted-foreground hover:text-foreground')}>
              {item.label} <span className="ml-1 tabular-nums opacity-70">{count}</span>
            </button>
          );
        })}
      </div>
      <section className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm">
        {isLoading ? <div className="flex min-h-72 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div> : filteredAds.length ? filteredAds.map(campaignRow) : <div className="p-4"><EmptyState onCreate={() => setShowCreateDialog(true)} /></div>}
      </section>
      <section className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm">
        <div className="grid gap-3 md:grid-cols-3">
          {[
            ['1', 'Campaign', 'Maqsad, umumiy budget va attribution oynasi.'],
            ['2', 'Ad set', 'Auditoriya, placement, bid va frequency cap.'],
            ['3', 'Creative', 'Rasm/video, matn, CTA va policy review.'],
          ].map(([step, title, detail]) => (
            <div key={step} className="rounded-xl border border-border/60 bg-muted/15 p-4">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-foreground text-xs font-semibold text-background">{step}</span>
              <p className="mt-3 text-sm font-semibold">{title}</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{detail}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );

  const renderCreatives = () => (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {ads.map((ad) => (
        <article key={ad.id} className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm">
          <button type="button" onClick={() => setSelectedAdId(ad.id)} className="relative aspect-[4/3] w-full overflow-hidden bg-neutral-950">
            {ad.media_type === 'video' ? <video src={ad.media_url} muted playsInline preload="metadata" className="h-full w-full object-cover" /> : <img src={ad.media_url} alt={ad.title} loading="lazy" className="h-full w-full object-cover" />}
            <span className="absolute left-3 top-3 rounded-full bg-black/70 px-2.5 py-1 text-[10px] font-semibold text-white backdrop-blur">Reklama</span>
          </button>
          <div className="p-4">
            <div className="flex items-start gap-2"><h3 className="min-w-0 flex-1 truncate text-sm font-semibold">{ad.title}</h3><StatusBadge status={ad.status} /></div>
            <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{ad.description || 'Tavsif kiritilmagan'}</p>
            <div className="mt-4 flex items-center justify-between border-t border-border/60 pt-3 text-xs"><span className="text-muted-foreground">CTA</span><span className="font-medium">{ad.call_to_action || 'Batafsil'}</span></div>
          </div>
        </article>
      ))}
      {!isLoading && ads.length === 0 && <div className="sm:col-span-2 xl:col-span-3"><EmptyState onCreate={() => setShowCreateDialog(true)} /></div>}
    </div>
  );

  const renderAudiences = () => (
    <div className="grid gap-4 lg:grid-cols-2">
      {ads.map((ad) => {
        const countries = ad.target_countries?.length ? ad.target_countries.join(', ') : 'Barcha hududlar';
        const interests = ad.target_interests?.length ? ad.target_interests.slice(0, 4).join(', ') : 'Keng auditoriya';
        const age = ad.target_age_min || ad.target_age_max ? `${ad.target_age_min || 13}–${ad.target_age_max || '65+'}` : '13+';
        return (
          <article key={ad.id} className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm">
            <div className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-muted/35"><Users className="h-4 w-4" /></span><div className="min-w-0 flex-1"><h3 className="truncate text-sm font-semibold">{ad.title}</h3><p className="mt-1 text-xs text-muted-foreground">Kampaniya auditoriyasi</p></div><StatusBadge status={ad.status} /></div>
            <div className="mt-5 grid grid-cols-2 gap-3 text-xs">
              <div className="rounded-xl bg-muted/25 p-3"><p className="text-muted-foreground">Hudud</p><p className="mt-1 line-clamp-2 font-medium">{countries}</p></div>
              <div className="rounded-xl bg-muted/25 p-3"><p className="text-muted-foreground">Yosh</p><p className="mt-1 font-medium">{age}</p></div>
              <div className="rounded-xl bg-muted/25 p-3"><p className="text-muted-foreground">Jins</p><p className="mt-1 font-medium">{ad.target_gender && ad.target_gender !== 'all' ? ad.target_gender : 'Hammasi'}</p></div>
              <div className="rounded-xl bg-muted/25 p-3"><p className="text-muted-foreground">Qiziqishlar</p><p className="mt-1 line-clamp-2 font-medium">{interests}</p></div>
            </div>
          </article>
        );
      })}
      {!isLoading && ads.length === 0 && <div className="lg:col-span-2"><EmptyState onCreate={() => setShowCreateDialog(true)} /></div>}
    </div>
  );

  const renderDelivery = () => (
    <div className="space-y-5">
      <section className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm sm:p-6">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border bg-muted/35"><Gauge className="h-5 w-5" /></span>
          <div><h2 className="text-base font-semibold">Retention-first Ads Delivery</h2><p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted-foreground">Reklama qat’iy “har N postdan” qoidasi bilan chiqmaydi. Tizim session davomiyligi, organic kontent soni, oldingi impression, advertiser fatigue va user feedbackni birga tekshiradi.</p></div>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        {DELIVERY_SURFACES.map((surface) => (
          <section key={surface.name} className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3"><h3 className="text-sm font-semibold">{surface.name}</h3><Badge variant="outline" className="rounded-full text-[10px]">{surface.cap}</Badge></div>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{surface.detail}</p>
          </section>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        {[
          ['Relevance', 'Campaign targeting, inferred content interests va creative quality delivery rankingga kiradi.'],
          ['Fatigue control', 'Bir xil advertiser va bir xil kreativ qayta-qayta ko‘rsatilmaydi; hide/too often feedback cooldown beradi.'],
          ['Transparency', 'Har joylashuv “Reklama” deb aniq belgilanadi. User “Nega bu reklama?”, hide, not relevant va report boshqaruviga ega.'],
        ].map(([title, detail]) => (
          <section key={title} className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm">
            <h3 className="text-sm font-semibold">{title}</h3>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{detail}</p>
          </section>
        ))}
      </div>
    </div>
  );

  const renderBilling = () => {
    const remaining = Math.max(0, totals.budget - totals.spent);
    return (
      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm sm:p-6">
          <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-medium text-muted-foreground">Reklama xarajatlari</p><p className="mt-2 text-3xl font-semibold tracking-tight tabular-nums">{money(totals.spent)}</p></div><span className="flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-muted/35"><WalletCards className="h-5 w-5" /></span></div>
          <div className="mt-6 grid grid-cols-2 gap-3"><div className="rounded-xl bg-muted/25 p-4"><p className="text-xs text-muted-foreground">Ajratilgan byudjet</p><p className="mt-1 text-lg font-semibold tabular-nums">{money(totals.budget)}</p></div><div className="rounded-xl bg-muted/25 p-4"><p className="text-xs text-muted-foreground">Qolgan byudjet</p><p className="mt-1 text-lg font-semibold tabular-nums">{money(remaining)}</p></div></div>
          <div className="mt-5 border-t border-border/60 pt-5"><Button onClick={() => navigate(paymentHref)} className="h-11 rounded-xl bg-foreground px-5 text-background hover:bg-foreground/90"><CreditCard className="mr-2 h-4 w-4" /> To‘lov markaziga o‘tish</Button><p className="mt-3 text-xs leading-relaxed text-muted-foreground">Hisobni to‘ldirish, tranzaksiyalar va payment usullari umumiy Alsamos To‘lov sahifasida boshqariladi. Ads alohida karta ma’lumotini saqlamaydi.</p></div>
        </section>

        <section className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm sm:p-6">
          <div className="flex items-center gap-3"><CalendarDays className="h-5 w-5 text-muted-foreground" /><div><h2 className="text-sm font-semibold">Budget pacing</h2><p className="text-xs text-muted-foreground">Byudjetni bir zumda sarflab yubormaslik.</p></div></div>
          <div className="mt-5 space-y-3">
            {[
              ['1', 'Payment balans — yagona moliyaviy source of truth.'],
              ['2', 'Campaign va Ad set budgetlari delivery limitini belgilaydi.'],
              ['3', 'CPM/CPC spend impression/click eventlar bilan audit qilinadi.'],
              ['4', 'Refund, adjustment va admin audit alohida ledgerda yuritiladi.'],
            ].map(([step, text]) => (
              <div key={step} className="flex gap-3 rounded-xl border border-border/60 p-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-foreground text-xs font-semibold text-background">{step}</span><p className="pt-1 text-xs leading-relaxed text-muted-foreground">{text}</p></div>
            ))}
          </div>
        </section>
      </div>
    );
  };

  const renderCurrent = () => {
    if (section === 'campaigns') return renderCampaigns();
    if (section === 'creatives') return renderCreatives();
    if (section === 'audiences') return renderAudiences();
    if (section === 'delivery') return renderDelivery();
    if (section === 'billing') return renderBilling();
    return renderOverview();
  };

  return (
    <div className="min-h-full bg-background pb-24 md:pb-10">
      <div className="border-b border-border/60 bg-background/95 backdrop-blur-xl">
        <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0"><div className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><Megaphone className="h-4 w-4" /> Alsamos Ads</div><h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">Reklama markazi</h1><p className="mt-1 max-w-2xl text-sm text-muted-foreground">Campaign → Ad set → Creative, relevance, pacing va to‘lovlarni bitta markazdan boshqaring.</p></div>
            <div className="flex flex-wrap items-center gap-2"><Button variant="outline" className="rounded-xl" onClick={() => void refetch()} disabled={isLoading}><RefreshCw className={cn('mr-2 h-4 w-4', isLoading && 'animate-spin')} />Yangilash</Button><Button variant="outline" className="rounded-xl" onClick={() => navigate(paymentHref)}><CreditCard className="mr-2 h-4 w-4" />To‘lov</Button><Button className="rounded-xl bg-foreground text-background hover:bg-foreground/90" onClick={() => setShowCreateDialog(true)}><Plus className="mr-2 h-4 w-4" />Yangi kampaniya</Button></div>
          </div>

          <nav className="mt-5 flex gap-1 overflow-x-auto rounded-2xl bg-muted/45 p-1 scrollbar-hidden" aria-label="Reklama bo‘limlari">
            {SECTIONS.map((item) => {
              const Icon = item.icon;
              const active = item.id === section;
              return (
                <button key={item.id} type="button" onClick={() => navigate(sectionPath(item.id))} className={cn('flex min-w-max items-center gap-2 rounded-xl px-3.5 py-2.5 text-xs font-semibold transition sm:text-sm', active ? 'bg-background text-foreground shadow-sm ring-1 ring-border/70' : 'text-muted-foreground hover:text-foreground')}>
                  <Icon className="h-4 w-4" /> {item.label}
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      <main className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
        <div className="mb-5 flex items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">{sectionMeta.label}</h2><p className="text-xs text-muted-foreground">{sectionMeta.description}</p></div>{section === 'campaigns' && <span className="text-xs text-muted-foreground">{filteredAds.length} ta kampaniya</span>}</div>
        {renderCurrent()}
      </main>

      <CreateAdDialog open={showCreateDialog} onOpenChange={setShowCreateDialog} />
      {selectedAdId && <AdStatsDialog adId={selectedAdId} open={!!selectedAdId} onOpenChange={(open) => !open && setSelectedAdId(null)} />}
    </div>
  );
}
