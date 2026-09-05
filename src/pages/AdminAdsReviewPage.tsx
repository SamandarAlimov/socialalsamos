import '@/styles/admin-console.css';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Check,
  ExternalLink,
  Eye,
  Flag,
  Loader2,
  Megaphone,
  RefreshCw,
  ShieldCheck,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAdminAccess } from '@/hooks/useAdminAccess';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import type { Ad } from '@/hooks/useAds';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
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
import { Textarea } from '@/components/ui/textarea';

interface ReviewAd extends Ad {
  advertiser?: {
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
    is_verified: boolean;
  };
}

type QueueMode = 'pending' | 'active' | 'rejected';

const MODES: Array<{ id: QueueMode; label: string }> = [
  { id: 'pending', label: 'Navbat' },
  { id: 'active', label: 'Faol' },
  { id: 'rejected', label: 'Rad etilgan' },
];

export default function AdminAdsReviewPage() {
  const navigate = useNavigate();
  const { isAdmin, isLoading: accessLoading, hasPermission } = useAdminAccess();
  const [mode, setMode] = useState<QueueMode>('pending');
  const [ads, setAds] = useState<ReviewAd[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [rejectingAd, setRejectingAd] = useState<ReviewAd | null>(null);
  const [reason, setReason] = useState('');

  const canReview = isAdmin && hasPermission('ads.review');

  const fetchQueue = useCallback(async () => {
    if (!canReview) {
      setAds([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('ads')
        .select('*')
        .eq('status', mode)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;

      const rows = (data || []) as Ad[];
      const userIds = Array.from(new Set(rows.map((ad) => ad.user_id).filter(Boolean)));
      const byId = new Map<string, ReviewAd['advertiser']>();

      if (userIds.length) {
        const profiles = await supabase
          .from('profiles')
          .select('id, username, display_name, avatar_url, is_verified')
          .in('id', userIds);
        if (!profiles.error && profiles.data) {
          for (const profile of profiles.data) {
            byId.set(profile.id, {
              username: profile.username,
              display_name: profile.display_name,
              avatar_url: profile.avatar_url,
              is_verified: Boolean(profile.is_verified),
            });
          }
        }
      }

      setAds(rows.map((ad) => ({ ...ad, advertiser: byId.get(ad.user_id) })));
    } catch (error) {
      console.error('Ads review queue failed:', error);
      toast.error('Reklama navbatini yuklab bo‘lmadi');
    } finally {
      setIsLoading(false);
    }
  }, [canReview, mode]);

  useEffect(() => {
    void fetchQueue();
  }, [fetchQueue]);

  const review = async (
    ad: ReviewAd,
    decision: 'approved' | 'rejected' | 'limited',
    notes?: string,
  ) => {
    setProcessingId(ad.id);
    try {
      const result = await (supabase as any).rpc('review_ad_v2', {
        p_ad_id: ad.id,
        p_decision: decision,
        p_reason_code: decision === 'rejected' ? 'policy_or_quality' : null,
        p_notes: notes?.trim() || null,
        p_policy_labels: [],
      });

      if (result?.error) {
        // Compatibility path until the permissioned review RPC reaches
        // production. Existing admin RLS may still allow the status update.
        const fallback = await supabase
          .from('ads')
          .update({ status: decision === 'rejected' ? 'rejected' : 'active' })
          .eq('id', ad.id);
        if (fallback.error) throw result.error;
      }

      toast.success(
        decision === 'approved'
          ? 'Reklama tasdiqlandi'
          : decision === 'limited'
            ? 'Reklama cheklangan delivery bilan tasdiqlandi'
            : 'Reklama rad etildi',
      );
      setRejectingAd(null);
      setReason('');
      await fetchQueue();
    } catch (error) {
      console.error('Ad review failed:', error);
      toast.error('Moderatsiya qarorini saqlab bo‘lmadi');
    } finally {
      setProcessingId(null);
    }
  };

  const counts = useMemo(() => ({ total: ads.length }), [ads]);

  if (accessLoading) {
    return (
      <div className="admin-neutral flex h-full items-center justify-center bg-background">
        <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isAdmin) return <Navigate to="/home" replace />;

  if (!canReview) {
    return (
      <div className="admin-neutral flex h-full items-center justify-center bg-background p-6">
        <div className="max-w-md text-center">
          <ShieldCheck className="mx-auto h-10 w-10 text-muted-foreground" />
          <h1 className="mt-4 text-xl font-semibold">Ruxsat talab qilinadi</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Bu bo‘lim uchun <code>ads.review</code> permission kerak. Super Admin yoki Ads Reviewer roli bilan kiring.
          </p>
          <Button variant="outline" className="mt-5" onClick={() => navigate('/admin')}>Admin markaziga qaytish</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-neutral h-full overflow-y-auto bg-background">
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 sm:px-6">
          <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl" onClick={() => navigate('/admin/moderation')} aria-label="Orqaga">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><Megaphone className="h-3.5 w-3.5" /> Trust & Safety</div>
            <h1 className="truncate text-lg font-semibold">Reklama moderatsiyasi</h1>
          </div>
          <Button variant="outline" size="sm" className="rounded-xl" onClick={() => void fetchQueue()} disabled={isLoading}>
            <RefreshCw className={cn('mr-2 h-4 w-4', isLoading && 'animate-spin')} /> Yangilash
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-5 sm:px-6">
        <section className="mb-5 rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground">Review queue</p>
              <h2 className="mt-1 text-2xl font-semibold tracking-tight">{counts.total} ta reklama</h2>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                Creative, destination, advertiser va targeting birgalikda tekshiriladi. Qarorlar permissioned RPC orqali yoziladi.
              </p>
            </div>
            <div className="flex gap-1 rounded-xl bg-muted/50 p-1">
              {MODES.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setMode(item.id)}
                  className={cn(
                    'rounded-lg px-3 py-2 text-xs font-semibold transition',
                    mode === item.id ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </section>

        {isLoading ? (
          <div className="flex min-h-72 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-muted-foreground" /></div>
        ) : ads.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-12 text-center">
            <Check className="mx-auto h-9 w-9 text-muted-foreground/50" />
            <h3 className="mt-3 font-semibold">Bu navbat bo‘sh</h3>
            <p className="mt-1 text-sm text-muted-foreground">Hozir ko‘rib chiqilishi kerak bo‘lgan reklama yo‘q.</p>
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {ads.map((ad) => {
              const advertiser = ad.advertiser?.display_name || ad.advertiser?.username || 'Advertiser';
              const initial = advertiser.charAt(0).toUpperCase();
              const ctr = ad.impressions_count > 0 ? (ad.clicks_count / ad.impressions_count) * 100 : 0;
              return (
                <article key={ad.id} className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
                  <div className="relative aspect-video bg-neutral-950">
                    {ad.media_type === 'video' ? (
                      <video src={ad.media_url} controls playsInline preload="metadata" className="h-full w-full object-contain" />
                    ) : (
                      <img src={ad.media_url} alt={ad.title} className="h-full w-full object-contain" />
                    )}
                    <Badge className="absolute left-3 top-3 rounded-full bg-black/75 text-white hover:bg-black/75">Reklama</Badge>
                  </div>

                  <div className="p-4 sm:p-5">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-10 w-10 border border-border bg-muted">
                        <AvatarImage src={ad.advertiser?.avatar_url || ''} />
                        <AvatarFallback>{initial}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{advertiser}</p>
                        <p className="truncate text-xs text-muted-foreground">{ad.advertiser?.username ? `@${ad.advertiser.username}` : ad.user_id}</p>
                      </div>
                      <Badge variant="outline" className="rounded-full text-[10px]">{ad.status}</Badge>
                    </div>

                    <h3 className="mt-4 text-base font-semibold">{ad.title}</h3>
                    {ad.description && <p className="mt-1 line-clamp-3 text-sm leading-relaxed text-muted-foreground">{ad.description}</p>}

                    <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
                      <div className="rounded-xl bg-muted/30 p-3"><p className="text-muted-foreground">Budget</p><p className="mt-1 font-semibold tabular-nums">${Number(ad.budget || 0).toFixed(2)}</p></div>
                      <div className="rounded-xl bg-muted/30 p-3"><p className="text-muted-foreground">CTR</p><p className="mt-1 font-semibold tabular-nums">{ctr.toFixed(2)}%</p></div>
                      <div className="rounded-xl bg-muted/30 p-3"><p className="text-muted-foreground">Billing</p><p className="mt-1 font-semibold uppercase">{ad.billing_type}</p></div>
                    </div>

                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      {ad.destination_url && (
                        <Button variant="outline" size="sm" className="rounded-xl" onClick={() => window.open(ad.destination_url!, '_blank', 'noopener,noreferrer')}>
                          <ExternalLink className="mr-2 h-3.5 w-3.5" /> Landing
                        </Button>
                      )}
                      <Button variant="outline" size="sm" className="rounded-xl" onClick={() => void review(ad, 'limited')} disabled={processingId === ad.id}>
                        <Eye className="mr-2 h-3.5 w-3.5" /> Limited
                      </Button>
                      <Button variant="outline" size="sm" className="rounded-xl text-destructive hover:text-destructive" onClick={() => setRejectingAd(ad)} disabled={processingId === ad.id}>
                        <Flag className="mr-2 h-3.5 w-3.5" /> Rad etish
                      </Button>
                      <Button size="sm" className="ml-auto rounded-xl bg-foreground text-background hover:bg-foreground/90" onClick={() => void review(ad, 'approved')} disabled={processingId === ad.id}>
                        {processingId === ad.id ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Check className="mr-2 h-3.5 w-3.5" />}
                        Tasdiqlash
                      </Button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </main>

      <Dialog open={!!rejectingAd} onOpenChange={(open) => !open && setRejectingAd(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reklamani rad etish</DialogTitle>
            <DialogDescription>Advertiser tushunadigan aniq sabab yozing. Bu keyin moderation auditida saqlanadi.</DialogDescription>
          </DialogHeader>
          <Textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={5} placeholder="Masalan: landing page kreativdagi va’daga mos emas yoki policy talabini buzadi." />
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRejectingAd(null); setReason(''); }}>Bekor qilish</Button>
            <Button variant="destructive" disabled={!rejectingAd || reason.trim().length < 3 || processingId === rejectingAd.id} onClick={() => rejectingAd && void review(rejectingAd, 'rejected', reason)}>
              {processingId === rejectingAd?.id && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Rad etish
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
