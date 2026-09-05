import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import {
  Activity,
  ArrowLeft,
  Eye,
  Fingerprint,
  Gauge,
  Loader2,
  Megaphone,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import { useAdminAccess } from '@/hooks/useAdminAccess';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface FraudSignal {
  id: string;
  delivery_event_id: string | null;
  user_id: string | null;
  ad_id: string;
  placement: string;
  signal_type: string;
  severity: number;
  session_id: string | null;
  device_type: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  ad?: {
    title?: string | null;
    status?: string | null;
    user_id?: string | null;
  } | null;
}

function backendUnavailable(error: any) {
  const code = String(error?.code || '');
  const text = `${error?.message || ''} ${error?.details || ''}`.toLowerCase();
  return code === '42P01' || code === 'PGRST205' || text.includes('does not exist') || text.includes('schema cache');
}

function severityMeta(value: number) {
  if (value >= 0.85) return { label: 'Invalid', className: 'border-destructive/30 bg-destructive/10 text-destructive' };
  if (value >= 0.6) return { label: 'Yuqori risk', className: 'border-border bg-foreground text-background' };
  if (value >= 0.35) return { label: 'Tekshirish', className: 'border-border bg-muted text-foreground' };
  return { label: 'Past risk', className: 'border-border bg-background text-muted-foreground' };
}

function signalLabel(value: string) {
  const labels: Record<string, string> = {
    rapid_duplicate: 'Juda tez takrorlangan event',
    user_event_burst: 'User event burst',
    session_event_burst: 'Session event burst',
    click_without_recent_impression: 'Impressionsiz klik',
    repeated_click_burst: 'Takroriy klik burst',
    automation_hint: 'Automation signali',
    risk_score: 'Risk score',
  };
  return labels[value] || value.replaceAll('_', ' ');
}

export default function AdminAdsIntegrityPage() {
  const navigate = useNavigate();
  const { isAdmin, isLoading: accessLoading, hasPermission } = useAdminAccess();
  const [signals, setSignals] = useState<FraudSignal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [backendReady, setBackendReady] = useState(true);

  const fetchSignals = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await (supabase as any)
        .from('ad_fraud_signals_v4')
        .select(`
          id, delivery_event_id, user_id, ad_id, placement, signal_type,
          severity, session_id, device_type, metadata, created_at,
          ad:ads(title, status, user_id)
        `)
        .order('created_at', { ascending: false })
        .limit(250);

      if (result?.error) {
        if (backendUnavailable(result.error)) {
          setBackendReady(false);
          setSignals([]);
          return;
        }
        throw result.error;
      }

      setBackendReady(true);
      setSignals((result?.data || []) as FraudSignal[]);
    } catch (error) {
      console.error('Ads fraud signals failed:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin && hasPermission('ads.review')) void fetchSignals();
  }, [fetchSignals, hasPermission, isAdmin]);

  const summary = useMemo(() => {
    const invalid = signals.filter((item) => Number(item.severity) >= 0.85).length;
    const high = signals.filter((item) => Number(item.severity) >= 0.6 && Number(item.severity) < 0.85).length;
    const users = new Set(signals.map((item) => item.user_id).filter(Boolean)).size;
    const ads = new Set(signals.map((item) => item.ad_id)).size;
    return { invalid, high, users, ads };
  }, [signals]);

  if (accessLoading) {
    return <div className="flex h-full items-center justify-center bg-background"><Loader2 className="h-7 w-7 animate-spin text-muted-foreground" /></div>;
  }

  if (!isAdmin || !hasPermission('ads.review')) return <Navigate to="/admin" replace />;

  return (
    <div className="h-full overflow-y-auto bg-background pb-10">
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/95 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-5 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div className="flex items-start gap-3">
            <Button variant="ghost" size="icon" className="mt-0.5 h-9 w-9 rounded-xl" onClick={() => navigate('/admin')} aria-label="Admin markaziga qaytish">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><ShieldAlert className="h-4 w-4" /> Ads Integrity</div>
              <h1 className="mt-1 text-2xl font-bold tracking-tight">Invalid traffic nazorati</h1>
              <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                Rapid duplicate, click burst, impressionsiz klik va session anomaliyalarini kuzating. Invalid eventlar reklama metrikasi, spend va quality rollup’iga kiritilmaydi.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" className="rounded-xl" onClick={() => navigate('/admin/ads-review')}><Megaphone className="mr-2 h-4 w-4" /> Ads Review</Button>
            <Button variant="outline" className="rounded-xl" onClick={() => void fetchSignals()} disabled={isLoading}><RefreshCw className={cn('mr-2 h-4 w-4', isLoading && 'animate-spin')} /> Yangilash</Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-5 px-4 py-5 sm:px-6 lg:px-8">
        {!backendReady ? (
          <section className="rounded-2xl border border-dashed border-border bg-muted/15 p-8 text-center">
            <ShieldCheck className="mx-auto h-10 w-10 text-muted-foreground" />
            <h2 className="mt-4 text-lg font-semibold">Integrity migration production deployini kutmoqda</h2>
            <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">Admin UI tayyor. `ad_fraud_signals_v4` va V4 event scorer hosted Supabase’ga deploy bo‘lgach bu yerda real signallar paydo bo‘ladi.</p>
          </section>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {[
                { label: 'Invalid event', value: summary.invalid, detail: 'Business metricdan chiqarilgan', icon: ShieldAlert },
                { label: 'Yuqori risk', value: summary.high, detail: 'Admin ko‘rishi kerak', icon: Gauge },
                { label: 'Ta’sirlangan user', value: summary.users, detail: 'Unique first-party account', icon: Fingerprint },
                { label: 'Ta’sirlangan ads', value: summary.ads, detail: 'Unique kampaniya delivery', icon: Megaphone },
              ].map((item) => (
                <div key={item.label} className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm">
                  <div className="flex items-start justify-between"><div><p className="text-xs text-muted-foreground">{item.label}</p><p className="mt-2 text-2xl font-semibold tabular-nums">{item.value.toLocaleString()}</p></div><span className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-muted/30"><item.icon className="h-4 w-4" /></span></div>
                  <p className="mt-3 text-[11px] text-muted-foreground">{item.detail}</p>
                </div>
              ))}
            </div>

            <section className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm">
              <div className="flex items-center justify-between border-b border-border/60 px-4 py-4 sm:px-5">
                <div><h2 className="font-semibold">Risk eventlar</h2><p className="mt-1 text-xs text-muted-foreground">Oxirgi 250 ta server-side integrity signali.</p></div>
                <Badge variant="secondary" className="rounded-full font-normal">{signals.length}</Badge>
              </div>

              {isLoading ? (
                <div className="flex min-h-72 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
              ) : signals.length === 0 ? (
                <div className="flex min-h-64 flex-col items-center justify-center px-6 text-center"><ShieldCheck className="h-9 w-9 text-muted-foreground/60" /><h3 className="mt-3 font-semibold">Risk signali yo‘q</h3><p className="mt-1 text-sm text-muted-foreground">Hozircha V4 scorer tekshiruv talab qiladigan traffic topmadi.</p></div>
              ) : (
                <div className="divide-y divide-border/60">
                  {signals.map((signal) => {
                    const severity = severityMeta(Number(signal.severity || 0));
                    return (
                      <article key={signal.id} className="grid gap-3 px-4 py-4 sm:px-5 lg:grid-cols-[1.2fr_0.75fr_0.75fr_auto] lg:items-center">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2"><p className="truncate text-sm font-semibold">{signal.ad?.title || 'Unknown ad'}</p><Badge variant="outline" className={cn('rounded-full text-[9px]', severity.className)}>{severity.label}</Badge></div>
                          <p className="mt-1 text-xs text-muted-foreground">{signalLabel(signal.signal_type)}</p>
                        </div>
                        <div className="text-xs"><p className="text-muted-foreground">Risk score</p><div className="mt-1.5 flex items-center gap-2"><div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-foreground" style={{ width: `${Math.min(100, Number(signal.severity || 0) * 100)}%` }} /></div><span className="font-semibold tabular-nums">{Math.round(Number(signal.severity || 0) * 100)}%</span></div></div>
                        <div className="text-xs"><p className="text-muted-foreground">Kontekst</p><p className="mt-1 font-medium">{signal.placement} · {signal.device_type || 'unknown'}</p><p className="mt-0.5 truncate text-[10px] text-muted-foreground">{signal.session_id ? `session ${signal.session_id.slice(0, 10)}…` : 'session yo‘q'}</p></div>
                        <div className="text-right text-[11px] text-muted-foreground"><p>{new Date(signal.created_at).toLocaleDateString('uz-UZ')}</p><p>{new Date(signal.created_at).toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' })}</p></div>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="grid gap-3 md:grid-cols-3">
              <div className="rounded-2xl border border-border bg-card p-4"><Activity className="h-4 w-4 text-muted-foreground" /><h3 className="mt-3 text-sm font-semibold">Pre-counter scoring</h3><p className="mt-1 text-xs leading-relaxed text-muted-foreground">Risk score legacy impression/click mirror va frequency counterdan oldin hisoblanadi.</p></div>
              <div className="rounded-2xl border border-border bg-card p-4"><Eye className="h-4 w-4 text-muted-foreground" /><h3 className="mt-3 text-sm font-semibold">Audit saqlanadi</h3><p className="mt-1 text-xs leading-relaxed text-muted-foreground">Invalid event o‘chirilmaydi: audit uchun `ad_delivery_events`da fraud metadata bilan qoladi.</p></div>
              <div className="rounded-2xl border border-border bg-card p-4"><BarChart3 className="h-4 w-4 text-muted-foreground" /><h3 className="mt-3 text-sm font-semibold">Measurement toza</h3><p className="mt-1 text-xs leading-relaxed text-muted-foreground">Invalid traffic daily metrics, spend estimate va creative quality hisobiga kirmaydi.</p></div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
