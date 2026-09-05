import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Archive,
  ArrowLeft,
  BarChart3,
  Edit3,
  FlaskConical,
  Image as ImageIcon,
  Layers3,
  Loader2,
  MoreHorizontal,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Split,
  Upload,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { uploadMedia } from '@/lib/mediaUpload';
import { cn } from '@/lib/utils';
import { AdsManagerPage } from '@/components/ads/AdsManagerPage';
import { CreateAdDialog } from '@/components/ads/CreateAdDialog';
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

interface AdAccountRow {
  id: string;
  name: string;
  currency: string;
  status: string;
}

interface CampaignRow {
  id: string;
  ad_account_id: string;
  name: string;
  objective: string;
  status: string;
  daily_budget: number | null;
  lifetime_budget: number | null;
  attribution_click_days: number;
  attribution_view_days: number;
  start_at: string | null;
  end_at: string | null;
  created_at: string;
}

interface AdSetRow {
  id: string;
  campaign_id: string;
  name: string;
  status: string;
  bid_strategy: string;
  bid_amount: number | null;
  daily_budget: number | null;
  lifetime_budget: number | null;
  placements: string[];
  targeting: Record<string, unknown>;
}

interface CreativeRow {
  id: string;
  name: string;
  format: string;
  media_url: string | null;
  headline: string | null;
  body: string | null;
  call_to_action: string | null;
  destination_url: string | null;
  moderation_status: string;
  quality_score: number;
}

interface DeliveryItemRow {
  id: string;
  campaign_id: string;
  ad_set_id: string;
  creative_id: string;
  legacy_ad_id: string | null;
  name: string;
  status: string;
  delivery_weight: number;
  created_at: string;
}

interface WorkspacePayload {
  accounts: AdAccountRow[];
  campaigns: CampaignRow[];
  ad_sets: AdSetRow[];
  creatives: CreativeRow[];
  delivery_items: DeliveryItemRow[];
}

const EMPTY_WORKSPACE: WorkspacePayload = {
  accounts: [],
  campaigns: [],
  ad_sets: [],
  creatives: [],
  delivery_items: [],
};

function money(value: number | null | undefined, currency = 'USD') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function backendUnavailable(error: any) {
  const code = String(error?.code || '');
  const text = `${error?.message || ''} ${error?.details || ''}`.toLowerCase();
  return code === '42883' || code === 'PGRST202' || text.includes('does not exist') || text.includes('could not find the function');
}

function statusBadge(status: string) {
  if (status === 'active') return { label: 'Faol', className: 'border-foreground bg-foreground text-background' };
  if (status === 'pending_review' || status === 'pending') return { label: 'Moderatsiyada', className: 'border-border bg-muted text-foreground' };
  if (status === 'paused') return { label: 'Pauza', className: 'border-border bg-background text-muted-foreground' };
  if (status === 'rejected') return { label: 'Rad etilgan', className: 'border-destructive/20 bg-destructive/10 text-destructive' };
  if (status === 'completed') return { label: 'Yakunlangan', className: 'border-border bg-muted text-muted-foreground' };
  return { label: status === 'draft' ? 'Draft' : status, className: 'border-border bg-muted/50 text-muted-foreground' };
}

export default function AdsCampaignsV4Page() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [workspace, setWorkspace] = useState<WorkspacePayload>(EMPTY_WORKSPACE);
  const [backendReady, setBackendReady] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [createCampaignOpen, setCreateCampaignOpen] = useState(false);
  const [editCampaign, setEditCampaign] = useState<CampaignRow | null>(null);
  const [archiveCampaign, setArchiveCampaign] = useState<CampaignRow | null>(null);
  const [variantCampaign, setVariantCampaign] = useState<CampaignRow | null>(null);

  const [editName, setEditName] = useState('');
  const [editDaily, setEditDaily] = useState('');
  const [editLifetime, setEditLifetime] = useState('');
  const [editClickDays, setEditClickDays] = useState('7');
  const [editViewDays, setEditViewDays] = useState('1');

  const [sourceDeliveryId, setSourceDeliveryId] = useState('');
  const [variantTitle, setVariantTitle] = useState('');
  const [variantDescription, setVariantDescription] = useState('');
  const [variantUrl, setVariantUrl] = useState('');
  const [variantCta, setVariantCta] = useState('Batafsil');
  const [variantMediaUrl, setVariantMediaUrl] = useState('');
  const [variantPreview, setVariantPreview] = useState('');
  const [variantMediaType, setVariantMediaType] = useState<'image' | 'video'>('image');
  const [isUploading, setIsUploading] = useState(false);

  const fetchWorkspace = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await (supabase as any).rpc('get_my_ads_workspace_v4');
      if (result?.error) {
        if (backendUnavailable(result.error)) {
          setBackendReady(false);
          setWorkspace(EMPTY_WORKSPACE);
          return;
        }
        throw result.error;
      }

      const data = (result?.data || {}) as Partial<WorkspacePayload>;
      setBackendReady(true);
      setWorkspace({
        accounts: Array.isArray(data.accounts) ? data.accounts : [],
        campaigns: Array.isArray(data.campaigns) ? data.campaigns : [],
        ad_sets: Array.isArray(data.ad_sets) ? data.ad_sets : [],
        creatives: Array.isArray(data.creatives) ? data.creatives : [],
        delivery_items: Array.isArray(data.delivery_items) ? data.delivery_items : [],
      });
    } catch (error) {
      console.error('Ads workspace failed:', error);
      toast.error('Campaign Studio ma’lumotlarini yuklab bo‘lmadi');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchWorkspace();
  }, [fetchWorkspace]);

  const accountById = useMemo(() => new Map(workspace.accounts.map((item) => [item.id, item])), [workspace.accounts]);
  const adSetById = useMemo(() => new Map(workspace.ad_sets.map((item) => [item.id, item])), [workspace.ad_sets]);
  const creativeById = useMemo(() => new Map(workspace.creatives.map((item) => [item.id, item])), [workspace.creatives]);

  const activeCampaigns = useMemo(
    () => workspace.campaigns.filter((campaign) => campaign.status !== 'archived'),
    [workspace.campaigns],
  );

  const openEdit = (campaign: CampaignRow) => {
    setEditCampaign(campaign);
    setEditName(campaign.name);
    setEditDaily(campaign.daily_budget == null ? '' : String(campaign.daily_budget));
    setEditLifetime(campaign.lifetime_budget == null ? '' : String(campaign.lifetime_budget));
    setEditClickDays(String(campaign.attribution_click_days ?? 7));
    setEditViewDays(String(campaign.attribution_view_days ?? 1));
  };

  const saveCampaign = async () => {
    if (!editCampaign || editName.trim().length < 2) return;
    setProcessingId(editCampaign.id);
    try {
      const result = await (supabase as any).rpc('update_ad_campaign_v4', {
        p_campaign_id: editCampaign.id,
        p_patch: {
          name: editName.trim(),
          daily_budget: editDaily.trim() || null,
          lifetime_budget: editLifetime.trim() || null,
          attribution_click_days: Number(editClickDays || 7),
          attribution_view_days: Number(editViewDays || 1),
        },
      });
      if (result?.error) throw result.error;
      toast.success('Kampaniya sozlamalari yangilandi');
      setEditCampaign(null);
      await fetchWorkspace();
    } catch (error) {
      console.error('Campaign update failed:', error);
      toast.error('Kampaniyani yangilab bo‘lmadi');
    } finally {
      setProcessingId(null);
    }
  };

  const archiveSelectedCampaign = async () => {
    if (!archiveCampaign) return;
    setProcessingId(archiveCampaign.id);
    try {
      const result = await (supabase as any).rpc('archive_ad_campaign_v4', {
        p_campaign_id: archiveCampaign.id,
      });
      if (result?.error) throw result.error;
      toast.success('Kampaniya arxivlandi');
      setArchiveCampaign(null);
      await fetchWorkspace();
    } catch (error) {
      console.error('Campaign archive failed:', error);
      toast.error('Kampaniyani arxivlab bo‘lmadi');
    } finally {
      setProcessingId(null);
    }
  };

  const setDeliveryStatus = async (delivery: DeliveryItemRow, status: 'active' | 'paused') => {
    if (!delivery.legacy_ad_id) return;
    setProcessingId(delivery.id);
    try {
      const result = await (supabase as any).rpc('set_ad_delivery_status_v4', {
        p_ad_id: delivery.legacy_ad_id,
        p_status: status,
      });
      if (result?.error) throw result.error;
      toast.success(status === 'active' ? 'Variant ishga tushdi' : 'Variant to‘xtatildi');
      await fetchWorkspace();
    } catch (error) {
      console.error('Delivery status failed:', error);
      toast.error('Delivery holatini o‘zgartirib bo‘lmadi');
    } finally {
      setProcessingId(null);
    }
  };

  const resetVariant = () => {
    setSourceDeliveryId('');
    setVariantTitle('');
    setVariantDescription('');
    setVariantUrl('');
    setVariantCta('Batafsil');
    setVariantMediaUrl('');
    setVariantPreview('');
    setVariantMediaType('image');
  };

  const openVariant = (campaign: CampaignRow) => {
    resetVariant();
    setVariantCampaign(campaign);
    const first = workspace.delivery_items.find((item) => item.campaign_id === campaign.id && item.status !== 'archived');
    if (first) setSourceDeliveryId(first.id);
  };

  const handleVariantFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const mediaType: 'image' | 'video' = file.type.startsWith('video/') ? 'video' : 'image';
    const preview = URL.createObjectURL(file);
    setVariantMediaType(mediaType);
    setVariantPreview(preview);
    setIsUploading(true);
    try {
      const uploaded = await uploadMedia(file, { type: 'post', visibility: 'public' });
      setVariantMediaUrl(uploaded.url);
      toast.success('Variant kreativi yuklandi');
    } catch (error) {
      console.error('Variant media upload failed:', error);
      setVariantMediaUrl('');
      setVariantPreview('');
      toast.error('Kreativni yuklab bo‘lmadi');
    } finally {
      setIsUploading(false);
    }
  };

  const createVariant = async () => {
    if (!variantCampaign || !sourceDeliveryId || !variantMediaUrl || variantTitle.trim().length < 3) return;
    setProcessingId(`variant:${variantCampaign.id}`);
    try {
      const result = await (supabase as any).rpc('create_ad_variant_v4', {
        p_campaign_id: variantCampaign.id,
        p_source_delivery_item_id: sourceDeliveryId,
        p_payload: {
          title: variantTitle.trim(),
          description: variantDescription.trim() || null,
          destination_url: variantUrl.trim() || null,
          call_to_action: variantCta.trim() || 'Batafsil',
          media_url: variantMediaUrl,
          media_type: variantMediaType,
        },
      });
      if (result?.error) throw result.error;
      toast.success('Variant yaratildi va moderatsiyaga yuborildi');
      setVariantCampaign(null);
      resetVariant();
      await fetchWorkspace();
    } catch (error) {
      console.error('Create ad variant failed:', error);
      toast.error('Variantni yaratib bo‘lmadi');
    } finally {
      setProcessingId(null);
    }
  };

  if (!backendReady && !isLoading) {
    // Staged rollout safety: until V4 migrations reach hosted Supabase, existing
    // advertisers continue using the compatibility campaign screen.
    return <AdsManagerPage />;
  }

  return (
    <div className="min-h-full bg-background pb-24 md:pb-10">
      <header className="border-b border-border/60 bg-background/95 backdrop-blur-xl">
        <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-3">
              <Button variant="ghost" size="icon" className="mt-0.5 h-9 w-9 rounded-xl" onClick={() => navigate('/ads')} aria-label="Reklama markaziga qaytish">
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div>
                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><Layers3 className="h-4 w-4" /> Ads Platform V4</div>
                <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">Campaign Studio</h1>
                <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                  Ad Account → Campaign → Ad Set → Creative → Delivery Item. Bu ekran legacy ads ro‘yxati emas, normalized hierarchy’ning o‘zini boshqaradi.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" className="rounded-xl" onClick={() => void fetchWorkspace()} disabled={isLoading}>
                <RefreshCw className={cn('mr-2 h-4 w-4', isLoading && 'animate-spin')} /> Yangilash
              </Button>
              <Button variant="outline" className="rounded-xl" onClick={() => navigate('/ads/experiments')}>
                <FlaskConical className="mr-2 h-4 w-4" /> A/B testlar
              </Button>
              <Button className="rounded-xl bg-foreground text-background hover:bg-foreground/90" onClick={() => setCreateCampaignOpen(true)}>
                <Plus className="mr-2 h-4 w-4" /> Yangi kampaniya
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
        {isLoading ? (
          <div className="flex min-h-80 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-muted-foreground" /></div>
        ) : activeCampaigns.length === 0 ? (
          <section className="rounded-2xl border border-dashed border-border p-10 text-center">
            <Layers3 className="mx-auto h-10 w-10 text-muted-foreground/60" />
            <h2 className="mt-4 text-lg font-semibold">Hali normalized kampaniya yo‘q</h2>
            <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">Yangi kampaniya yaratilganda ad account, ad set, creative va delivery item atomik tarzda birga yaratiladi.</p>
            <Button className="mt-5 rounded-xl" onClick={() => setCreateCampaignOpen(true)}><Plus className="mr-2 h-4 w-4" /> Kampaniya yaratish</Button>
          </section>
        ) : (
          <div className="space-y-4">
            {activeCampaigns.map((campaign) => {
              const account = accountById.get(campaign.ad_account_id);
              const campaignSets = workspace.ad_sets.filter((item) => item.campaign_id === campaign.id && item.status !== 'archived');
              const campaignDeliveries = workspace.delivery_items.filter((item) => item.campaign_id === campaign.id && item.status !== 'archived');
              const status = statusBadge(campaign.status);

              return (
                <article key={campaign.id} className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm">
                  <div className="flex flex-col gap-3 border-b border-border/60 p-4 sm:flex-row sm:items-start sm:justify-between sm:p-5">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="truncate text-base font-semibold sm:text-lg">{campaign.name}</h2>
                        <Badge variant="outline" className={cn('rounded-full text-[10px]', status.className)}>{status.label}</Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {account?.name || 'Ad Account'} · {campaign.objective} · {campaignSets.length} ad set · {campaignDeliveries.length} delivery variant
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" className="rounded-xl" onClick={() => openVariant(campaign)}>
                        <Split className="mr-2 h-3.5 w-3.5" /> Variant qo‘shish
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-52 rounded-xl">
                          <DropdownMenuItem onClick={() => openEdit(campaign)}><Edit3 className="mr-2 h-4 w-4" /> Kampaniyani tahrirlash</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => navigate('/ads/experiments')}><FlaskConical className="mr-2 h-4 w-4" /> A/B test yaratish</DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setArchiveCampaign(campaign)}><Archive className="mr-2 h-4 w-4" /> Arxivlash</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>

                  <div className="grid gap-px bg-border/50 lg:grid-cols-[0.72fr_1.28fr]">
                    <div className="bg-card p-4 sm:p-5">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Campaign controls</p>
                      <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                        <div className="rounded-xl bg-muted/25 p-3"><p className="text-muted-foreground">Kunlik byudjet</p><p className="mt-1 font-semibold">{campaign.daily_budget == null ? 'Campaign total' : money(campaign.daily_budget, account?.currency || 'USD')}</p></div>
                        <div className="rounded-xl bg-muted/25 p-3"><p className="text-muted-foreground">Lifetime</p><p className="mt-1 font-semibold">{money(campaign.lifetime_budget, account?.currency || 'USD')}</p></div>
                        <div className="rounded-xl bg-muted/25 p-3"><p className="text-muted-foreground">Click attribution</p><p className="mt-1 font-semibold">{campaign.attribution_click_days} kun</p></div>
                        <div className="rounded-xl bg-muted/25 p-3"><p className="text-muted-foreground">View attribution</p><p className="mt-1 font-semibold">{campaign.attribution_view_days} kun</p></div>
                      </div>
                      {campaignSets.map((set) => (
                        <div key={set.id} className="mt-3 rounded-xl border border-border/60 p-3">
                          <div className="flex items-center gap-2"><Layers3 className="h-3.5 w-3.5 text-muted-foreground" /><p className="truncate text-xs font-semibold">{set.name}</p></div>
                          <p className="mt-1 text-[11px] text-muted-foreground">{set.bid_strategy} · {set.placements?.join(', ') || 'placement yo‘q'}</p>
                        </div>
                      ))}
                    </div>

                    <div className="bg-card">
                      <div className="flex items-center justify-between border-b border-border/50 px-4 py-3 sm:px-5">
                        <div><p className="text-sm font-semibold">Delivery variantlar</p><p className="text-[11px] text-muted-foreground">Har biri alohida kreativ va moderation lifecycle’ga ega.</p></div>
                        <Badge variant="secondary" className="rounded-full font-normal">{campaignDeliveries.length}</Badge>
                      </div>

                      {campaignDeliveries.length === 0 ? (
                        <div className="p-5 text-sm text-muted-foreground">Delivery item topilmadi.</div>
                      ) : campaignDeliveries.map((delivery) => {
                        const creative = creativeById.get(delivery.creative_id);
                        const adSet = adSetById.get(delivery.ad_set_id);
                        const deliveryStatus = statusBadge(delivery.status);
                        const moderation = statusBadge(creative?.moderation_status || 'pending');
                        const canActivate = ['approved', 'limited'].includes(creative?.moderation_status || '');

                        return (
                          <div key={delivery.id} className="flex items-start gap-3 border-b border-border/50 p-4 last:border-b-0 sm:px-5">
                            <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-muted">
                              {creative?.media_url ? (
                                creative.format === 'video' ? <video src={creative.media_url} muted playsInline preload="metadata" className="h-full w-full object-cover" /> : <img src={creative.media_url} alt="" className="h-full w-full object-cover" loading="lazy" />
                              ) : <div className="flex h-full w-full items-center justify-center"><ImageIcon className="h-5 w-5 text-muted-foreground" /></div>}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="truncate text-sm font-semibold">{delivery.name}</p>
                                <Badge variant="outline" className={cn('rounded-full text-[9px]', deliveryStatus.className)}>{deliveryStatus.label}</Badge>
                                <Badge variant="outline" className={cn('rounded-full text-[9px]', moderation.className)}>Creative: {moderation.label}</Badge>
                              </div>
                              <p className="mt-1 text-xs text-muted-foreground">{creative?.headline || creative?.name || 'Creative'} · {adSet?.placements?.join(', ')}</p>
                              <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
                                <span>Weight {Number(delivery.delivery_weight || 1).toFixed(2)}</span>
                                <span>Quality {Number(creative?.quality_score || 0).toFixed(2)}</span>
                                {creative?.call_to_action && <span>CTA: {creative.call_to_action}</span>}
                              </div>
                            </div>
                            {delivery.status === 'active' ? (
                              <Button variant="outline" size="sm" className="h-8 rounded-lg" disabled={processingId === delivery.id} onClick={() => void setDeliveryStatus(delivery, 'paused')}><Pause className="mr-1.5 h-3.5 w-3.5" /> Pauza</Button>
                            ) : delivery.status === 'paused' ? (
                              <Button size="sm" className="h-8 rounded-lg" disabled={!canActivate || processingId === delivery.id} onClick={() => void setDeliveryStatus(delivery, 'active')}><Play className="mr-1.5 h-3.5 w-3.5" /> Davom</Button>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </main>

      <CreateAdDialog open={createCampaignOpen} onOpenChange={(open) => { setCreateCampaignOpen(open); if (!open) void fetchWorkspace(); }} />

      <Dialog open={!!editCampaign} onOpenChange={(open) => !open && setEditCampaign(null)}>
        <DialogContent className="max-w-lg rounded-3xl">
          <DialogHeader><DialogTitle>Kampaniya sozlamalari</DialogTitle><DialogDescription>Campaign-level budget va attribution oynalarini normalized source-of-truth’da yangilang.</DialogDescription></DialogHeader>
          <div className="grid gap-4 py-1 sm:grid-cols-2">
            <div className="sm:col-span-2"><Label htmlFor="campaign-name">Nomi</Label><Input id="campaign-name" className="mt-1.5" value={editName} onChange={(event) => setEditName(event.target.value)} /></div>
            <div><Label htmlFor="campaign-daily">Kunlik byudjet</Label><Input id="campaign-daily" className="mt-1.5" type="number" min={0} step="0.01" value={editDaily} onChange={(event) => setEditDaily(event.target.value)} placeholder="Optional" /></div>
            <div><Label htmlFor="campaign-life">Lifetime byudjet</Label><Input id="campaign-life" className="mt-1.5" type="number" min={1} step="0.01" value={editLifetime} onChange={(event) => setEditLifetime(event.target.value)} /></div>
            <div><Label htmlFor="click-window">Click attribution (kun)</Label><Input id="click-window" className="mt-1.5" type="number" min={0} max={30} value={editClickDays} onChange={(event) => setEditClickDays(event.target.value)} /></div>
            <div><Label htmlFor="view-window">View attribution (kun)</Label><Input id="view-window" className="mt-1.5" type="number" min={0} max={7} value={editViewDays} onChange={(event) => setEditViewDays(event.target.value)} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setEditCampaign(null)}>Bekor qilish</Button><Button onClick={() => void saveCampaign()} disabled={!editCampaign || processingId === editCampaign.id}>{processingId === editCampaign?.id && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Saqlash</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!archiveCampaign} onOpenChange={(open) => !open && setArchiveCampaign(null)}>
        <DialogContent className="max-w-md rounded-3xl">
          <DialogHeader><DialogTitle>Kampaniyani arxivlash</DialogTitle><DialogDescription>{archiveCampaign?.name} va uning delivery itemlari delivery’dan chiqariladi. Historical measurement rolluplari saqlanib qoladi.</DialogDescription></DialogHeader>
          <DialogFooter><Button variant="outline" onClick={() => setArchiveCampaign(null)}>Bekor qilish</Button><Button variant="destructive" onClick={() => void archiveSelectedCampaign()} disabled={!archiveCampaign || processingId === archiveCampaign.id}>{processingId === archiveCampaign?.id && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Arxivlash</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!variantCampaign} onOpenChange={(open) => { if (!open) { setVariantCampaign(null); resetVariant(); } }}>
        <DialogContent className="max-h-[92dvh] max-w-2xl overflow-y-auto rounded-3xl">
          <DialogHeader><DialogTitle>Yangi creative variant</DialogTitle><DialogDescription>Variant shu kampaniyaning mavjud ad set targeting/bid konfiguratsiyasini meros oladi, kreativ esa alohida moderatsiyadan o‘tadi.</DialogDescription></DialogHeader>
          <div className="space-y-4 py-1">
            <div>
              <Label>Asos bo‘ladigan delivery item</Label>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {workspace.delivery_items.filter((item) => item.campaign_id === variantCampaign?.id && item.status !== 'archived').map((item) => (
                  <button key={item.id} type="button" onClick={() => setSourceDeliveryId(item.id)} className={cn('rounded-xl border p-3 text-left text-sm transition', sourceDeliveryId === item.id ? 'border-foreground bg-muted/40' : 'border-border hover:bg-muted/25')}>
                    <p className="truncate font-medium">{item.name}</p><p className="mt-1 text-[11px] text-muted-foreground">{adSetById.get(item.ad_set_id)?.placements?.join(', ')}</p>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Label>Kreativ *</Label>
              <input ref={fileInputRef} type="file" accept="image/*,video/*" className="hidden" onChange={handleVariantFile} />
              {variantPreview ? (
                <div className="relative mt-2 aspect-video overflow-hidden rounded-2xl bg-neutral-950">
                  {variantMediaType === 'video' ? <video src={variantPreview} controls playsInline className="h-full w-full object-contain" /> : <img src={variantPreview} alt="Variant preview" className="h-full w-full object-contain" />}
                  {isUploading && <div className="absolute inset-0 flex items-center justify-center bg-black/50"><Loader2 className="h-7 w-7 animate-spin text-white" /></div>}
                </div>
              ) : (
                <button type="button" onClick={() => fileInputRef.current?.click()} className="mt-2 flex aspect-video w-full flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-muted/15 hover:bg-muted/25"><Upload className="h-6 w-6 text-muted-foreground" /><p className="mt-2 text-sm font-medium">Rasm yoki video yuklash</p></button>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2"><Label htmlFor="variant-title">Sarlavha *</Label><Input id="variant-title" className="mt-1.5" value={variantTitle} onChange={(event) => setVariantTitle(event.target.value)} /></div>
              <div className="sm:col-span-2"><Label htmlFor="variant-description">Tavsif</Label><Textarea id="variant-description" className="mt-1.5 min-h-20" value={variantDescription} onChange={(event) => setVariantDescription(event.target.value)} /></div>
              <div><Label htmlFor="variant-url">Destination URL</Label><Input id="variant-url" className="mt-1.5" value={variantUrl} onChange={(event) => setVariantUrl(event.target.value)} placeholder="https://..." /></div>
              <div><Label htmlFor="variant-cta">CTA</Label><Input id="variant-cta" className="mt-1.5" value={variantCta} onChange={(event) => setVariantCta(event.target.value)} /></div>
            </div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setVariantCampaign(null)}>Bekor qilish</Button><Button onClick={() => void createVariant()} disabled={!sourceDeliveryId || !variantMediaUrl || variantTitle.trim().length < 3 || isUploading || processingId === `variant:${variantCampaign?.id}`}>
            {processingId === `variant:${variantCampaign?.id}` ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Split className="mr-2 h-4 w-4" />} Variant yaratish
          </Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
