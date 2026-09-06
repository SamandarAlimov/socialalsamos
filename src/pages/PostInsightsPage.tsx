import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  BarChart3,
  Bookmark,
  Clock3,
  Eye,
  Heart,
  MessageCircle,
  MousePointerClick,
  RefreshCcw,
  Repeat2,
  Share2,
  Sparkles,
  TrendingUp,
  Users,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { VerifiedBadge } from '@/components/VerifiedBadge';
import { usePostInsights } from '@/hooks/usePostInsights';
import { cn } from '@/lib/utils';

const windows = [7, 28, 90] as const;

function compact(value: number): string {
  return new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

function percent(value: number): string {
  return `${Number.isFinite(value) ? value.toFixed(value % 1 === 0 ? 0 : 1) : '0'}%`;
}

function duration(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds} son`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes < 60) return `${minutes} daq ${rest} son`;
  const hours = Math.floor(minutes / 60);
  return `${hours} soat ${minutes % 60} daq`;
}

function shortDate(value: string): string {
  const date = new Date(`${value}T00:00:00Z`);
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(date);
}

function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
  accent = false,
}: {
  icon: typeof Eye;
  label: string;
  value: string;
  detail?: string;
  accent?: boolean;
}) {
  return (
    <Card className={cn('overflow-hidden border-border/70 bg-card/95 shadow-sm', accent && 'ring-1 ring-primary/15')}>
      <CardContent className="p-4 md:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium text-muted-foreground md:text-sm">{label}</p>
            <p className="mt-1 text-2xl font-bold tracking-tight tabular-nums md:text-3xl">{value}</p>
            {detail && <p className="mt-1 text-[11px] text-muted-foreground md:text-xs">{detail}</p>}
          </div>
          <span className={cn(
            'flex h-10 w-10 items-center justify-center rounded-2xl',
            accent ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
          )}>
            <Icon className="h-5 w-5" />
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function BreakdownBar({ label, value, count }: { label: string; value: number; count?: number }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-4 text-sm">
        <span className="font-medium capitalize">{label}</span>
        <span className="tabular-nums text-muted-foreground">
          {count !== undefined ? `${compact(count)} · ` : ''}{percent(value)}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-500"
          style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
        />
      </div>
    </div>
  );
}

function InteractionItem({ icon: Icon, label, value }: { icon: typeof Heart; label: string; value: number }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-border/60 bg-muted/15 px-3.5 py-3">
      <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-background shadow-sm">
          <Icon className="h-4 w-4 text-muted-foreground" />
        </span>
        <span className="text-sm font-medium">{label}</span>
      </div>
      <span className="font-semibold tabular-nums">{compact(value)}</span>
    </div>
  );
}

export default function PostInsightsPage() {
  const { postId } = useParams<{ postId: string }>();
  const navigate = useNavigate();
  const [days, setDays] = useState<number>(28);
  const { data, preview, isLoading, error, refresh } = usePostInsights(postId, days);

  const isVideo = Boolean(
    data?.post.video_duration ||
      ['video', 'reel', 'short'].includes(String(data?.post.media_type ?? '').toLowerCase()),
  );

  const chartData = useMemo(
    () => data?.timeline.map((point) => ({ ...point, label: shortDate(point.date) })) ?? [],
    [data?.timeline],
  );

  const retentionData = useMemo(
    () => data?.retention.map((point) => ({ ...point, label: `${point.position}%` })) ?? [],
    [data?.retention],
  );

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-6xl space-y-5 px-3 py-4 md:px-6 md:py-7">
        <Skeleton className="h-12 w-72 rounded-2xl" />
        <Skeleton className="h-28 w-full rounded-3xl" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-32 rounded-3xl" />
          ))}
        </div>
        <Skeleton className="h-80 w-full rounded-3xl" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="mx-auto flex min-h-[60vh] w-full max-w-xl flex-col items-center justify-center px-5 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
          <BarChart3 className="h-6 w-6 text-muted-foreground" />
        </div>
        <h1 className="mt-4 text-xl font-semibold">Analitikani ochib bo‘lmadi</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error || 'Post statistikasi mavjud emas.'}</p>
        <div className="mt-5 flex gap-2">
          <Button variant="outline" onClick={() => navigate(-1)}>Orqaga</Button>
          <Button onClick={() => void refresh()}><RefreshCcw className="mr-2 h-4 w-4" />Qayta urinish</Button>
        </div>
      </div>
    );
  }

  const audienceTotal = data.audience.followers + data.audience.non_followers;
  const followerPct = data.audience.followers_percentage || 0;
  const title = preview?.profile?.display_name || preview?.profile?.username || 'Post';
  const initial = title.slice(0, 1).toUpperCase();

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 px-3 pb-16 pt-3 md:px-6 md:py-7">
      <header className="sticky top-0 z-20 -mx-3 flex items-center justify-between gap-3 border-b border-border/60 bg-background/92 px-3 py-2.5 backdrop-blur-xl md:static md:mx-0 md:border-0 md:bg-transparent md:px-0 md:py-0 md:backdrop-blur-none">
        <div className="flex min-w-0 items-center gap-2.5">
          <Button variant="ghost" size="icon" className="rounded-full" onClick={() => navigate(-1)} aria-label="Orqaga">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-lg font-bold tracking-tight md:text-2xl">Post analitikasi</h1>
              <span className="hidden rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary sm:inline">Insights</span>
            </div>
            <p className="truncate text-[11px] text-muted-foreground md:text-xs">Qamrov, faollik, auditoriya va retention</p>
          </div>
        </div>
        <Button variant="outline" className="hidden rounded-full sm:flex" onClick={() => navigate(`/post/${postId}`)}>
          Postni ko‘rish
        </Button>
      </header>

      <section className="flex flex-col gap-3 rounded-3xl border border-border/70 bg-card/95 p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between md:p-5">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar className="h-11 w-11 ring-1 ring-border/60">
            <AvatarImage src={preview?.profile?.avatar_url || ''} />
            <AvatarFallback>{initial}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-sm font-semibold">{title}</span>
              {preview?.profile?.is_verified && <VerifiedBadge size="xs" />}
            </div>
            <p className="line-clamp-1 max-w-2xl text-xs text-muted-foreground">
              {preview?.content || (isVideo ? 'Video post' : 'Media post')}
            </p>
          </div>
        </div>
        <div className="flex rounded-full bg-muted p-1">
          {windows.map((windowDays) => (
            <button
              key={windowDays}
              type="button"
              onClick={() => setDays(windowDays)}
              className={cn(
                'rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                days === windowDays ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {windowDays} kun
            </button>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard icon={Eye} label="Ko‘rishlar" value={compact(data.overview.views)} detail="Postning jami ko‘rishlari" accent />
        <MetricCard icon={Users} label="Qamrov" value={compact(data.overview.reach)} detail="Noyob akkauntlar" />
        <MetricCard icon={Sparkles} label="Interaksiyalar" value={compact(data.overview.interactions)} detail="Like, izoh, share, repost, save" />
        <MetricCard icon={TrendingUp} label="Engagement rate" value={percent(data.overview.engagement_rate)} detail="Qamrovga nisbatan faollik" />
      </div>

      <Card className="overflow-hidden rounded-3xl border-border/70 shadow-sm">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="text-base md:text-lg">Natija dinamikasi</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">Ko‘rishlar va interaksiyalar — oxirgi {days} kun</p>
            </div>
            <BarChart3 className="h-5 w-5 text-primary" />
          </div>
        </CardHeader>
        <CardContent className="h-[270px] px-1 pb-3 pt-2 sm:px-4 md:h-[320px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 8, right: 14, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="viewsGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.28} />
                  <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 5" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} minTickGap={26} />
              <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip
                contentStyle={{ borderRadius: 16, border: '1px solid hsl(var(--border))', background: 'hsl(var(--popover))', color: 'hsl(var(--popover-foreground))' }}
              />
              <Area type="monotone" dataKey="views" name="Ko‘rishlar" stroke="hsl(var(--primary))" strokeWidth={2.5} fill="url(#viewsGradient)" />
              <Line type="monotone" dataKey="interactions" name="Interaksiyalar" stroke="hsl(var(--foreground))" strokeWidth={1.5} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="rounded-3xl border-border/70 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base md:text-lg">Faollik</CardTitle>
            <p className="text-xs text-muted-foreground">Foydalanuvchilar post bilan qanday ishladi</p>
          </CardHeader>
          <CardContent className="grid gap-2.5 sm:grid-cols-2">
            <InteractionItem icon={Heart} label="Like" value={data.overview.likes} />
            <InteractionItem icon={MessageCircle} label="Izoh" value={data.overview.comments} />
            <InteractionItem icon={Share2} label="Ulashish" value={data.overview.shares} />
            <InteractionItem icon={Repeat2} label="Repost" value={data.overview.reposts} />
            <InteractionItem icon={Bookmark} label="Saqlash" value={data.overview.saves} />
            <InteractionItem icon={MousePointerClick} label="Profilga o‘tish" value={data.overview.profile_clicks} />
          </CardContent>
        </Card>

        <Card className="rounded-3xl border-border/70 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base md:text-lg">Auditoriya</CardTitle>
            <p className="text-xs text-muted-foreground">Post kimlarga yetib bordi</p>
          </CardHeader>
          <CardContent>
            {audienceTotal > 0 ? (
              <div className="flex flex-col items-center gap-6 sm:flex-row sm:justify-around">
                <div
                  className="relative flex h-44 w-44 items-center justify-center rounded-full"
                  style={{
                    background: `conic-gradient(hsl(var(--primary)) 0 ${followerPct}%, hsl(var(--muted-foreground) / 0.22) ${followerPct}% 100%)`,
                  }}
                >
                  <div className="flex h-32 w-32 flex-col items-center justify-center rounded-full bg-card">
                    <span className="text-3xl font-bold tabular-nums">{compact(audienceTotal)}</span>
                    <span className="text-[11px] text-muted-foreground">Qamrov</span>
                  </div>
                </div>
                <div className="w-full max-w-xs space-y-5">
                  <BreakdownBar label="Followerlar" value={data.audience.followers_percentage} count={data.audience.followers} />
                  <BreakdownBar label="Yangi auditoriya" value={data.audience.non_followers_percentage} count={data.audience.non_followers} />
                </div>
              </div>
            ) : (
              <div className="py-10 text-center text-sm text-muted-foreground">Auditoriya ma’lumoti hali yetarli emas.</div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="rounded-3xl border-border/70 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base md:text-lg">Ko‘rish manbalari</CardTitle>
            <p className="text-xs text-muted-foreground">Home, Discover, Search, Profile va boshqa yuzalar</p>
          </CardHeader>
          <CardContent className="space-y-4">
            {data.sources.length > 0 ? data.sources.map((item) => (
              <BreakdownBar key={item.source} label={item.source || 'unknown'} value={item.percentage} count={item.sessions} />
            )) : (
              <div className="rounded-2xl border border-dashed border-border p-5 text-sm text-muted-foreground">
                Manba analitikasi yangi qualified ko‘rishlar bilan avtomatik yig‘iladi.
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-3xl border-border/70 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base md:text-lg">Qurilmalar</CardTitle>
            <p className="text-xs text-muted-foreground">Mobile, tablet va desktop ulushi</p>
          </CardHeader>
          <CardContent className="space-y-4">
            {data.devices.length > 0 ? data.devices.map((item) => (
              <BreakdownBar key={item.device} label={item.device || 'unknown'} value={item.percentage} count={item.sessions} />
            )) : (
              <div className="rounded-2xl border border-dashed border-border p-5 text-sm text-muted-foreground">
                Qurilma kesimi yangi analytics sessionlari bilan to‘ldiriladi.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {isVideo && (
        <Card className="overflow-hidden rounded-3xl border-border/70 shadow-sm">
          <CardHeader>
            <div className="flex items-start justify-between gap-4">
              <div>
                <CardTitle className="text-base md:text-lg">Video retention</CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">Tomoshabinlar videoning qaysi qismigacha yetib bordi</p>
              </div>
              <Clock3 className="h-5 w-5 text-primary" />
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <div className="rounded-2xl bg-muted/30 p-3.5"><p className="text-xs text-muted-foreground">Watch time</p><p className="mt-1 font-bold tabular-nums">{duration(data.watch.total_watch_ms)}</p></div>
              <div className="rounded-2xl bg-muted/30 p-3.5"><p className="text-xs text-muted-foreground">O‘rtacha watch</p><p className="mt-1 font-bold tabular-nums">{duration(data.watch.average_watch_ms)}</p></div>
              <div className="rounded-2xl bg-muted/30 p-3.5"><p className="text-xs text-muted-foreground">Skip rate</p><p className="mt-1 font-bold tabular-nums">{percent(data.watch.skip_rate)}</p></div>
              <div className="rounded-2xl bg-muted/30 p-3.5"><p className="text-xs text-muted-foreground">Completion</p><p className="mt-1 font-bold tabular-nums">{percent(data.watch.completion_rate)}</p></div>
            </div>

            {retentionData.length > 0 ? (
              <div className="h-[280px] md:h-[330px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={retentionData} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
                    <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 5" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                    <YAxis domain={[0, 100]} tickFormatter={(value) => `${value}%`} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                    <Tooltip
                      formatter={(value) => [`${value}%`, 'Retention']}
                      contentStyle={{ borderRadius: 16, border: '1px solid hsl(var(--border))', background: 'hsl(var(--popover))', color: 'hsl(var(--popover-foreground))' }}
                    />
                    <Line type="monotone" dataKey="rate" stroke="hsl(var(--primary))" strokeWidth={3} dot={{ r: 2.5, fill: 'hsl(var(--primary))' }} activeDot={{ r: 5 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex min-h-48 flex-col items-center justify-center rounded-2xl border border-dashed border-border px-5 text-center">
                <TrendingUp className="h-6 w-6 text-muted-foreground" />
                <p className="mt-3 text-sm font-medium">Retention yig‘ilmoqda</p>
                <p className="mt-1 max-w-md text-xs text-muted-foreground">Qualified video ko‘rishlari kelishi bilan watch time, skip rate va retention egri chizig‘i avtomatik paydo bo‘ladi.</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="flex items-center justify-between gap-4 rounded-2xl border border-border/60 bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
        <span>
          {data.data_quality.telemetry_sessions > 0
            ? `Historical counts + ${compact(data.data_quality.telemetry_sessions)} analytics session`
            : 'Historical post counts faol. Chuqur session analytics yangi ko‘rishlar bilan to‘ldiriladi.'}
        </span>
        <button type="button" className="shrink-0 font-medium text-foreground hover:underline" onClick={() => void refresh()}>
          Yangilash
        </button>
      </div>
    </div>
  );
}
