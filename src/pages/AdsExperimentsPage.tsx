import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  BarChart3,
  CheckCircle2,
  FlaskConical,
  Layers3,
  Loader2,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Split,
  Trophy,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface WorkspaceCampaign {
  id: string;
  name: string;
  status: string;
  objective: string;
  ad_account_id: string;
}

interface WorkspaceDeliveryItem {
  id: string;
  campaign_id: string;
  name: string;
  status: string;
  creative_id: string;
}

interface WorkspaceCreative {
  id: string;
  name: string;
  headline?: string | null;
  media_url?: string | null;
  format?: string | null;
}

interface WorkspacePayload {
  campaigns: WorkspaceCampaign[];
  delivery_items: WorkspaceDeliveryItem[];
  creatives: WorkspaceCreative[];
}

interface ExperimentRow {
  id: string;
  campaign_id: string;
  name: string;
  primary_metric: 'ctr' | 'conversion_rate' | 'cpa' | 'roas';
  status: 'draft' | 'running' | 'paused' | 'completed' | 'archived';
  traffic_percent: number;
  minimum_sample_size: number;
  starts_at: string | null;
  ends_at: string | null;
  winner_variant_id: string | null;
  created_at: string;
}

interface VariantResult {
  variant_id: string;
  variant_name: string;
  is_control: boolean;
  allocation_pct: number;
  delivery_item_id: string;
  impressions: number;
  clicks: number;
  conversions: number;
  conversion_value: number;
  spend: number;
  ctr: number;
  conversion_rate: number;
  cpa: number | null;
  roas: number | null;
  sample_ready: boolean;
}

interface ExperimentResultPayload {
  variants: VariantResult[];
}

const METRICS = [
  { id: 'ctr', label: 'CTR', hint: 'Klik ehtimolini optimallashtirish' },
  { id: 'conversion_rate', label: 'Conversion rate', hint: 'Klikdan keyingi natijani o‘lchash' },
  { id: 'cpa', label: 'CPA', hint: 'Har bir konversiya xarajatini kamaytirish' },
  { id: 'roas', label: 'ROAS', hint: 'Reklama xarajatiga qaytishni oshirish' },
] as const;

function metricValue(metric: ExperimentRow['primary_metric'], row: VariantResult) {
  if (metric === 'ctr') return `${(Number(row.ctr || 0) * 100).toFixed(2)}%`;
  if (metric === 'conversion_rate') return `${(Number(row.conversion_rate || 0) * 100).toFixed(2)}%`;
  if (metric === 'cpa') return row.cpa == null ? '—' : `$${Number(row.cpa).toFixed(2)}`;
  return row.roas == null ? '—' : `${Number(row.roas).toFixed(2)}×`;
}

function statusMeta(status: ExperimentRow['status']) {
  switch (status) {
    case 'running':
      return { label: 'Ishlamoqda', className: 'border-foreground bg-foreground text-background' };
    case 'paused':
      return { label: 'To‘xtatilgan', className: 'border-border bg-background text-muted-foreground' };
    case 'completed':
      return { label: 'Yakunlangan', className: 'border-border bg-muted text-foreground' };
    case 'archived':
      return { label: 'Arxiv', className: 'border-border bg-muted text-muted-foreground' };
    default:
      return { label: 'Draft', className: 'border-border bg-muted/50 text-muted-foreground' };
  }
}

function experimentBackendUnavailable(error: any) {
  const code = String(error?.code || '');
  const message = `${error?.message || ''} ${error?.details || ''}`.toLowerCase();
  return code === '42883' || code === 'PGRST202' || message.includes('does not exist') || message.includes('could not find');
}

export default function AdsExperimentsPage() {
  const navigate = useNavigate();
  const [workspace, setWorkspace] = useState<WorkspacePayload>({ campaigns: [], delivery_items: [], creatives: [] });
  const [experiments, setExperiments] = useState<ExperimentRow[]>([]);
  const [results, setResults] = useState<Record<string, ExperimentResultPayload>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [backendReady, setBackendReady] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [campaignId, setCampaignId] = useState('');
  const [controlId, setControlId] = useState('');
  const [variantId, setVariantId] = useState('');
  const [metric, setMetric] = useState<ExperimentRow['primary_metric']>('ctr');
  const [controlAllocation, setControlAllocation] = useState(50);
  const [trafficPercent, setTrafficPercent] = useState(100);
  const [minimumSample, setMinimumSample] = useState(300);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const workspaceResult = await (supabase as any).rpc('get_my_ads_workspace_v4');
      if (workspaceResult?.error) {
        if (experimentBackendUnavailable(workspaceResult.error)) {
          setBackendReady(false);
          setWorkspace({ campaigns: [], delivery_items: [], creatives: [] });
          setExperiments([]);
          return;
        }
        throw workspaceResult.error;
      }

      setBackendReady(true);
      const payload = (workspaceResult?.data || {}) as Partial<WorkspacePayload>;
      const nextWorkspace: WorkspacePayload = {
        campaigns: Array.isArray(payload.campaigns) ? payload.campaigns : [],
        delivery_items: Array.isArray(payload.delivery_items) ? payload.delivery_items : [],
        creatives: Array.isArray(payload.creatives) ? payload.creatives : [],
      };
      setWorkspace(nextWorkspace);

      const experimentResult = await (supabase as any)
        .from('ad_experiments_v4')
        .select('*')
        .neq('status', 'archived')
        .order('created_at', { ascending: false });

      if (experimentResult?.error) {
        if (experimentBackendUnavailable(experimentResult.error)) {
          setBackendReady(false);
          setExperiments([]);
          return;
        }
        throw experimentResult.error;
      }

      const rows = (experimentResult?.data || []) as ExperimentRow[];
      setExperiments(rows);

      const nextResults: Record<string, ExperimentResultPayload> = {};
      await Promise.all(
        rows.map(async (experiment) => {
          const result = await (supabase as any).rpc('get_ad_experiment_results_v4', {
            p_experiment_id: experiment.id,
          });
          if (!result?.error && result?.data) {
            nextResults[experiment.id] = result.data as ExperimentResultPayload;
          }
        }),
      );
      setResults(nextResults);
    } catch (error) {
      console.error('Ads experiments fetch failed:', error);
      toast.error('A/B testlarni yuklab bo‘lmadi');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const campaignItems = useMemo(
    () => workspace.delivery_items.filter((item) => item.campaign_id === campaignId && item.status !== 'archived'),
    [campaignId, workspace.delivery_items],
  );

  const campaignById = useMemo(
    () => new Map(workspace.campaigns.map((campaign) => [campaign.id, campaign])),
    [workspace.campaigns],
  );

  const resetCreate = () => {
    setName('');
    setCampaignId('');
    setControlId('');
    setVariantId('');
    setMetric('ctr');
    setControlAllocation(50);
    setTrafficPercent(100);
    setMinimumSample(300);
  };

  const selectCampaign = (id: string) => {
    setCampaignId(id);
    setControlId('');
    setVariantId('');
  };

  const canCreate =
    backendReady &&
    campaignId &&
    controlId &&
    variantId &&
    controlId !== variantId &&
    controlAllocation >= 10 &&
    controlAllocation <= 90 &&
    trafficPercent >= 1 &&
    trafficPercent <= 100 &&
    minimumSample >= 50;

  const createExperiment = async () => {
    if (!canCreate) return;
    setProcessingId('create');
    try {
      const campaign = campaignById.get(campaignId);
      const result = await (supabase as any).rpc('create_ad_experiment_v4', {
        p_campaign_id: campaignId,
        p_name: name.trim() || `${campaign?.name || 'Campaign'} A/B`,
        p_primary_metric: metric,
        p_variants: [
          {
            delivery_item_id: controlId,
            name: 'Control',
            allocation_pct: controlAllocation,
            is_control: true,
          },
          {
            delivery_item_id: variantId,
            name: 'Variant B',
            allocation_pct: 100 - controlAllocation,
            is_control: false,
          },
        ],
        p_traffic_percent: trafficPercent,
        p_minimum_sample_size: minimumSample,
      });
      if (result?.error) throw result.error;

      toast.success('A/B test yaratildi. Ishga tushirishdan oldin sozlamalarni tekshiring.');
      setCreateOpen(false);
      resetCreate();
      await fetchData();
    } catch (error) {
      console.error('Create ad experiment failed:', error);
      toast.error('A/B testni yaratib bo‘lmadi');
    } finally {
      setProcessingId(null);
    }
  };

  const setStatus = async (experiment: ExperimentRow, status: ExperimentRow['status']) => {
    setProcessingId(experiment.id);
    try {
      const result = await (supabase as any).rpc('set_ad_experiment_status_v4', {
        p_experiment_id: experiment.id,
        p_status: status,
      });
      if (result?.error) throw result.error;
      toast.success(
        status === 'running'
          ? 'A/B test ishga tushdi'
          : status === 'completed'
            ? 'A/B test yakunlandi'
            : 'A/B test to‘xtatildi',
      );
      await fetchData();
    } catch (error) {
      console.error('Experiment status update failed:', error);
      toast.error('Test holatini o‘zgartirib bo‘lmadi');
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="min-h-full bg-background pb-24 md:pb-10">
      <header className="border-b border-border/60 bg-background/95 backdrop-blur-xl">
        <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-3">
              <Button variant="ghost" size="icon" className="mt-0.5 h-9 w-9 shrink-0 rounded-xl" onClick={() => navigate('/ads')} aria-label="Reklama markaziga qaytish">
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div>
                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><FlaskConical className="h-4 w-4" /> Alsamos Ads Experiments</div>
                <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">A/B test markazi</h1>
                <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                  Kreativ va delivery variantlarini sticky, deterministic auditoriya bo‘linishi bilan solishtiring. G‘olibni CTR emas, biznes maqsadingiz bo‘yicha tanlang.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" className="rounded-xl" onClick={() => void fetchData()} disabled={isLoading}>
                <RefreshCw className={cn('mr-2 h-4 w-4', isLoading && 'animate-spin')} /> Yangilash
              </Button>
              <Button className="rounded-xl bg-foreground text-background hover:bg-foreground/90" onClick={() => setCreateOpen(true)} disabled={!backendReady}>
                <Plus className="mr-2 h-4 w-4" /> Yangi test
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
        {!backendReady ? (
          <section className="rounded-2xl border border-dashed border-border bg-muted/15 p-8 text-center">
            <Layers3 className="mx-auto h-10 w-10 text-muted-foreground" />
            <h2 className="mt-4 text-lg font-semibold">Ads V4 backend deployini kutmoqda</h2>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
              Experiments sahifasi tayyor, lekin normalized campaign va A/B RPC migratsiyalari production Supabase’ga yetib borishi kerak. Frontend checkout yoki reklamani shu sabab buzmaydi.
            </p>
          </section>
        ) : isLoading ? (
          <div className="flex min-h-80 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-muted-foreground" /></div>
        ) : experiments.length === 0 ? (
          <section className="rounded-2xl border border-dashed border-border p-10 text-center">
            <Split className="mx-auto h-10 w-10 text-muted-foreground/60" />
            <h2 className="mt-4 text-lg font-semibold">Hali A/B test yo‘q</h2>
            <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">
              Kamida ikki delivery varianti bo‘lgan kampaniyani tanlab, birinchi controlled experimentni yarating.
            </p>
            <Button className="mt-5 rounded-xl" onClick={() => setCreateOpen(true)}><Plus className="mr-2 h-4 w-4" /> Test yaratish</Button>
          </section>
        ) : (
          <div className="space-y-4">
            {experiments.map((experiment) => {
              const status = statusMeta(experiment.status);
              const campaign = campaignById.get(experiment.campaign_id);
              const variants = results[experiment.id]?.variants || [];
              const sampleReady = variants.length >= 2 && variants.every((variant) => variant.sample_ready);
              const sorted = [...variants].sort((a, b) => {
                const av = experiment.primary_metric === 'cpa' ? (a.cpa ?? Number.POSITIVE_INFINITY) : Number((a as any)[experiment.primary_metric] ?? 0);
                const bv = experiment.primary_metric === 'cpa' ? (b.cpa ?? Number.POSITIVE_INFINITY) : Number((b as any)[experiment.primary_metric] ?? 0);
                return experiment.primary_metric === 'cpa' ? av - bv : bv - av;
              });
              const leader = sampleReady ? sorted[0] : null;

              return (
                <article key={experiment.id} className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm">
                  <div className="flex flex-col gap-3 border-b border-border/60 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="truncate font-semibold">{experiment.name}</h2>
                        <Badge variant="outline" className={cn('rounded-full text-[10px]', status.className)}>{status.label}</Badge>
                        {leader && <Badge variant="secondary" className="rounded-full text-[10px]"><Trophy className="mr-1 h-3 w-3" /> Yetakchi: {leader.variant_name}</Badge>}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {campaign?.name || 'Campaign'} · {METRICS.find((item) => item.id === experiment.primary_metric)?.label} · {experiment.traffic_percent}% traffic
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {experiment.status === 'draft' || experiment.status === 'paused' ? (
                        <Button size="sm" className="rounded-xl" onClick={() => void setStatus(experiment, 'running')} disabled={processingId === experiment.id}>
                          {processingId === experiment.id ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Play className="mr-2 h-3.5 w-3.5" />} Ishga tushirish
                        </Button>
                      ) : experiment.status === 'running' ? (
                        <Button variant="outline" size="sm" className="rounded-xl" onClick={() => void setStatus(experiment, 'paused')} disabled={processingId === experiment.id}>
                          <Pause className="mr-2 h-3.5 w-3.5" /> Pauza
                        </Button>
                      ) : null}
                      {(experiment.status === 'running' || experiment.status === 'paused') && (
                        <Button variant="outline" size="sm" className="rounded-xl" onClick={() => void setStatus(experiment, 'completed')} disabled={processingId === experiment.id}>
                          <CheckCircle2 className="mr-2 h-3.5 w-3.5" /> Yakunlash
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="grid gap-px bg-border/60 md:grid-cols-2">
                    {variants.length ? variants.map((variant) => (
                      <div key={variant.variant_id} className="bg-card p-4 sm:p-5">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-semibold">{variant.variant_name}</p>
                              {variant.is_control && <Badge variant="outline" className="rounded-full text-[9px]">Control</Badge>}
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">{variant.allocation_pct}% allocation</p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs text-muted-foreground">Primary metric</p>
                            <p className="mt-1 text-xl font-semibold tabular-nums">{metricValue(experiment.primary_metric, variant)}</p>
                          </div>
                        </div>

                        <div className="mt-4 grid grid-cols-4 gap-2 text-xs">
                          <div className="rounded-xl bg-muted/25 p-2.5"><p className="text-muted-foreground">Impr.</p><p className="mt-1 font-semibold tabular-nums">{Number(variant.impressions || 0).toLocaleString()}</p></div>
                          <div className="rounded-xl bg-muted/25 p-2.5"><p className="text-muted-foreground">Klik</p><p className="mt-1 font-semibold tabular-nums">{Number(variant.clicks || 0).toLocaleString()}</p></div>
                          <div className="rounded-xl bg-muted/25 p-2.5"><p className="text-muted-foreground">Conv.</p><p className="mt-1 font-semibold tabular-nums">{Number(variant.conversions || 0).toLocaleString()}</p></div>
                          <div className="rounded-xl bg-muted/25 p-2.5"><p className="text-muted-foreground">Spend</p><p className="mt-1 font-semibold tabular-nums">${Number(variant.spend || 0).toFixed(2)}</p></div>
                        </div>
                        <p className={cn('mt-3 text-[11px]', variant.sample_ready ? 'text-foreground' : 'text-muted-foreground')}>
                          {variant.sample_ready
                            ? `Minimum sample (${experiment.minimum_sample_size}) bajarildi.`
                            : `Hali learning: kamida ${experiment.minimum_sample_size} impression kerak.`}
                        </p>
                      </div>
                    )) : (
                      <div className="bg-card p-5 text-sm text-muted-foreground md:col-span-2">Variant metrikalari hali shakllanmagan.</div>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </main>

      <Dialog open={createOpen} onOpenChange={(open) => { setCreateOpen(open); if (!open) resetCreate(); }}>
        <DialogContent className="max-w-2xl rounded-3xl">
          <DialogHeader>
            <DialogTitle>Yangi A/B test</DialogTitle>
            <DialogDescription>
              Bir kampaniya ichidagi ikki delivery variantini sticky auditoriya split bilan solishtiring.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-1">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label htmlFor="experiment-name">Test nomi</Label>
                <Input id="experiment-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Masalan: Video CTA — Control vs Variant B" className="mt-1.5" />
              </div>
              <div>
                <Label>Kampaniya</Label>
                <Select value={campaignId} onValueChange={selectCampaign}>
                  <SelectTrigger className="mt-1.5"><SelectValue placeholder="Kampaniyani tanlang" /></SelectTrigger>
                  <SelectContent>
                    {workspace.campaigns.filter((campaign) => campaign.status !== 'archived').map((campaign) => (
                      <SelectItem key={campaign.id} value={campaign.id}>{campaign.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Asosiy metrika</Label>
                <Select value={metric} onValueChange={(value) => setMetric(value as ExperimentRow['primary_metric'])}>
                  <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {METRICS.map((item) => <SelectItem key={item.id} value={item.id}>{item.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {campaignId && campaignItems.length < 2 && (
              <div className="rounded-xl border border-dashed border-border bg-muted/20 p-4 text-sm text-muted-foreground">
                Bu kampaniyada hozircha faqat {campaignItems.length} ta delivery item bor. A/B test uchun kamida ikki kreativ/delivery varianti kerak.
              </div>
            )}

            {campaignItems.length >= 2 && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label>Control</Label>
                  <Select value={controlId} onValueChange={setControlId}>
                    <SelectTrigger className="mt-1.5"><SelectValue placeholder="Control tanlang" /></SelectTrigger>
                    <SelectContent>{campaignItems.map((item) => <SelectItem key={item.id} value={item.id} disabled={item.id === variantId}>{item.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Variant B</Label>
                  <Select value={variantId} onValueChange={setVariantId}>
                    <SelectTrigger className="mt-1.5"><SelectValue placeholder="Variant tanlang" /></SelectTrigger>
                    <SelectContent>{campaignItems.map((item) => <SelectItem key={item.id} value={item.id} disabled={item.id === controlId}>{item.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <Label htmlFor="control-allocation">Control %</Label>
                <Input id="control-allocation" type="number" min={10} max={90} value={controlAllocation} onChange={(event) => setControlAllocation(Number(event.target.value || 0))} className="mt-1.5" />
                <p className="mt-1 text-[11px] text-muted-foreground">Variant B: {Math.max(0, 100 - controlAllocation)}%</p>
              </div>
              <div>
                <Label htmlFor="traffic-percent">Test traffic %</Label>
                <Input id="traffic-percent" type="number" min={1} max={100} value={trafficPercent} onChange={(event) => setTrafficPercent(Number(event.target.value || 0))} className="mt-1.5" />
              </div>
              <div>
                <Label htmlFor="minimum-sample">Min. sample</Label>
                <Input id="minimum-sample" type="number" min={50} step={50} value={minimumSample} onChange={(event) => setMinimumSample(Number(event.target.value || 0))} className="mt-1.5" />
              </div>
            </div>

            <div className="rounded-xl border border-border/60 bg-muted/20 p-4">
              <div className="flex items-start gap-3">
                <BarChart3 className="mt-0.5 h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Statistik intizom</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    Foydalanuvchi yoki session bir variantga deterministic biriktiriladi. Minimum sample yetmaguncha tizim g‘olibni ishonchli deb ko‘rsatmaydi; test traffic foizi organik delivery pacingni buzmaydi.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Bekor qilish</Button>
            <Button onClick={() => void createExperiment()} disabled={!canCreate || processingId === 'create'}>
              {processingId === 'create' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FlaskConical className="mr-2 h-4 w-4" />} Test yaratish
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
