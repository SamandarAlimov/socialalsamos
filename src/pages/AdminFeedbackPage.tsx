import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  CheckCircle2,
  Clock3,
  ExternalLink,
  Inbox,
  Loader2,
  MessageSquareText,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  UserRoundCheck,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useAdminAccess } from '@/hooks/useAdminAccess';
import { supabase } from '@/integrations/supabase/client';
import {
  FEEDBACK_CATEGORIES,
  FEEDBACK_PRIORITY_META,
  FEEDBACK_STATUS_META,
  getFeedbackCategoryLabel,
  isFeedbackBackendUnavailable,
  type FeedbackCategory,
  type FeedbackPriority,
  type FeedbackStatus,
  type PlatformFeedbackCase,
  type PlatformFeedbackMessage,
} from '@/lib/platformFeedback';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

interface ReporterProfile {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
}

const STATUS_OPTIONS: FeedbackStatus[] = ['new', 'triaged', 'in_progress', 'waiting_user', 'resolved', 'closed'];
const PRIORITY_OPTIONS: FeedbackPriority[] = ['low', 'normal', 'high', 'urgent'];

function formatDate(value: string) {
  return new Intl.DateTimeFormat('uz-UZ', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

export default function AdminFeedbackPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isAdmin, isLoading: accessLoading, hasPermission } = useAdminAccess();
  const canReview = isAdmin && hasPermission('feedback.review');

  const [cases, setCases] = useState<PlatformFeedbackCase[]>([]);
  const [profiles, setProfiles] = useState<Record<string, ReporterProfile>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<PlatformFeedbackMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [backendReady, setBackendReady] = useState(true);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'open' | FeedbackStatus | 'all'>('open');
  const [categoryFilter, setCategoryFilter] = useState<'all' | FeedbackCategory>('all');
  const [replyBody, setReplyBody] = useState('');
  const [internalNote, setInternalNote] = useState(false);
  const [resolutionNote, setResolutionNote] = useState('');
  const [processing, setProcessing] = useState(false);

  const fetchQueue = useCallback(async () => {
    if (!canReview) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const result = await (supabase as any)
        .from('platform_feedback')
        .select('*')
        .order('last_activity_at', { ascending: false })
        .limit(250);

      if (result?.error) {
        if (isFeedbackBackendUnavailable(result.error)) {
          setBackendReady(false);
          setCases([]);
          return;
        }
        throw result.error;
      }

      const rows = (result.data || []) as PlatformFeedbackCase[];
      setCases(rows);
      setBackendReady(true);

      const userIds = Array.from(new Set(rows.map((item) => item.user_id).filter(Boolean)));
      if (userIds.length) {
        const profileResult = await supabase
          .from('profiles')
          .select('id, username, display_name, avatar_url')
          .in('id', userIds);
        if (!profileResult.error && profileResult.data) {
          setProfiles(Object.fromEntries(profileResult.data.map((profile) => [profile.id, profile as ReporterProfile])));
        }
      }

      if (!selectedId && rows.length) setSelectedId(rows[0].id);
    } catch (error) {
      console.error('Admin feedback queue failed:', error);
      toast.error('Feedback navbatini yuklab bo‘lmadi');
    } finally {
      setIsLoading(false);
    }
  }, [canReview, selectedId]);

  const fetchMessages = useCallback(async (feedbackId: string) => {
    const result = await (supabase as any)
      .from('platform_feedback_messages')
      .select('*')
      .eq('feedback_id', feedbackId)
      .order('created_at', { ascending: true });
    if (!result?.error) setMessages((result.data || []) as PlatformFeedbackMessage[]);
  }, []);

  useEffect(() => {
    void fetchQueue();
  }, [fetchQueue]);

  useEffect(() => {
    if (!selectedId || !backendReady || !canReview) {
      setMessages([]);
      return;
    }
    void fetchMessages(selectedId);
  }, [backendReady, canReview, fetchMessages, selectedId]);

  const selected = useMemo(
    () => cases.find((item) => item.id === selectedId) || null,
    [cases, selectedId],
  );

  useEffect(() => {
    setResolutionNote(selected?.resolution_note || '');
    setReplyBody('');
    setInternalNote(false);
  }, [selected?.id, selected?.resolution_note]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return cases.filter((item) => {
      const profile = profiles[item.user_id];
      const statusMatches = statusFilter === 'all'
        ? true
        : statusFilter === 'open'
          ? !['resolved', 'closed'].includes(item.status)
          : item.status === statusFilter;
      const categoryMatches = categoryFilter === 'all' || item.category === categoryFilter;
      const queryMatches = !needle || [
        item.reference_code,
        item.title,
        item.description,
        profile?.username,
        profile?.display_name,
      ].some((value) => String(value || '').toLowerCase().includes(needle));
      return statusMatches && categoryMatches && queryMatches;
    });
  }, [cases, categoryFilter, profiles, query, statusFilter]);

  const metrics = useMemo(() => ({
    new: cases.filter((item) => item.status === 'new').length,
    active: cases.filter((item) => ['triaged', 'in_progress'].includes(item.status)).length,
    waiting: cases.filter((item) => item.status === 'waiting_user').length,
    resolved: cases.filter((item) => item.status === 'resolved').length,
  }), [cases]);

  const manage = async (patch: {
    status?: FeedbackStatus;
    priority?: FeedbackPriority;
    assignSelf?: boolean;
    unassign?: boolean;
    resolution?: string | null;
  }) => {
    if (!selected || processing) return;
    setProcessing(true);
    try {
      const result = await (supabase as any).rpc('manage_platform_feedback', {
        p_feedback_id: selected.id,
        p_status: patch.status ?? null,
        p_priority: patch.priority ?? null,
        p_assigned_to: patch.assignSelf ? user?.id ?? null : null,
        p_set_assignment: Boolean(patch.assignSelf || patch.unassign),
        p_resolution_note: patch.resolution === undefined ? null : patch.resolution,
      });
      if (result?.error) throw result.error;
      await fetchQueue();
    } catch (error) {
      console.error('Feedback manage failed:', error);
      toast.error('Murojaat holatini yangilab bo‘lmadi');
    } finally {
      setProcessing(false);
    }
  };

  const sendReply = async () => {
    if (!selected || !replyBody.trim() || processing) return;
    setProcessing(true);
    try {
      const result = await (supabase as any).rpc('reply_platform_feedback', {
        p_feedback_id: selected.id,
        p_body: replyBody.trim(),
        p_internal: internalNote,
      });
      if (result?.error) throw result.error;
      toast.success(internalNote ? 'Ichki izoh saqlandi' : 'Javob yuborildi');
      setReplyBody('');
      await Promise.all([fetchMessages(selected.id), fetchQueue()]);
    } catch (error) {
      console.error('Feedback staff reply failed:', error);
      toast.error('Javobni yuborib bo‘lmadi');
    } finally {
      setProcessing(false);
    }
  };

  if (accessLoading) {
    return <div className="flex h-full items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-muted-foreground" /></div>;
  }
  if (!isAdmin) return <Navigate to="/home" replace />;
  if (!canReview) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="max-w-md text-center"><ShieldCheck className="mx-auto h-10 w-10 text-muted-foreground" /><h1 className="mt-4 text-xl font-semibold">Ruxsat talab qilinadi</h1><p className="mt-2 text-sm text-muted-foreground">Feedback Center uchun <code>feedback.review</code> permission kerak.</p><Button variant="outline" className="mt-5" onClick={() => navigate('/admin/moderation')}>Moderatsiya markaziga qaytish</Button></div>
      </div>
    );
  }

  return (
    <div className="admin-neutral min-h-full bg-background">
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1500px] items-center gap-3 px-4 py-3 sm:px-6">
          <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl" onClick={() => navigate('/admin/moderation')}><ArrowLeft className="h-4 w-4" /></Button>
          <div className="min-w-0 flex-1"><div className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><MessageSquareText className="h-3.5 w-3.5" /> Support Operations</div><h1 className="truncate text-lg font-semibold">Feedback & Support</h1></div>
          <Button variant="outline" size="sm" className="rounded-xl" onClick={() => void fetchQueue()} disabled={isLoading}><RefreshCw className={cn('mr-2 h-4 w-4', isLoading && 'animate-spin')} />Yangilash</Button>
        </div>
      </header>

      <main className="mx-auto max-w-[1500px] p-4 sm:p-6">
        {!backendReady ? (
          <div className="rounded-2xl border border-dashed border-border p-10 text-center"><Inbox className="mx-auto h-10 w-10 text-muted-foreground" /><h2 className="mt-4 font-semibold">Feedback backend deployini kutmoqda</h2><p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">Migration production Supabase’ga deploy bo‘lgach support navbati avtomatik ishlaydi.</p></div>
        ) : (
          <>
            <section className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {[
                ['Yangi', metrics.new, Inbox],
                ['Jarayonda', metrics.active, Clock3],
                ['User javobi', metrics.waiting, MessageSquareText],
                ['Hal qilindi', metrics.resolved, CheckCircle2],
              ].map(([label, value, Icon]) => {
                const MetricIcon = Icon as typeof Inbox;
                return <div key={String(label)} className="rounded-2xl border border-border bg-card p-4 shadow-sm"><div className="flex items-center justify-between"><p className="text-xs font-medium text-muted-foreground">{label as string}</p><MetricIcon className="h-4 w-4 text-muted-foreground" /></div><p className="mt-3 text-2xl font-bold tabular-nums">{value as number}</p></div>;
              })}
            </section>

            <section className="grid min-h-[620px] overflow-hidden rounded-2xl border border-border bg-card shadow-sm lg:grid-cols-[380px_1fr]">
              <aside className="border-b border-border lg:border-b-0 lg:border-r">
                <div className="space-y-3 border-b border-border p-3">
                  <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ref, sarlavha yoki username" className="pl-9" /></div>
                  <div className="grid grid-cols-2 gap-2">
                    <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)} className="h-9 rounded-xl border border-input bg-background px-3 text-xs"><option value="open">Ochiq</option><option value="all">Barchasi</option>{STATUS_OPTIONS.map((status) => <option key={status} value={status}>{FEEDBACK_STATUS_META[status].label}</option>)}</select>
                    <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value as typeof categoryFilter)} className="h-9 rounded-xl border border-input bg-background px-3 text-xs"><option value="all">Barcha kategoriyalar</option>{FEEDBACK_CATEGORIES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select>
                  </div>
                </div>

                <div className="max-h-[68vh] overflow-y-auto">
                  {isLoading ? <div className="flex min-h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div> : filtered.length === 0 ? <div className="p-8 text-center text-sm text-muted-foreground">Filterga mos murojaat topilmadi.</div> : filtered.map((item) => {
                    const profile = profiles[item.user_id];
                    const status = FEEDBACK_STATUS_META[item.status];
                    return (
                      <button key={item.id} type="button" onClick={() => setSelectedId(item.id)} className={cn('w-full border-b border-border p-4 text-left transition hover:bg-muted/25', selectedId === item.id && 'bg-muted/40')}>
                        <div className="flex items-center gap-2"><span className="text-[10px] font-bold text-muted-foreground">{item.reference_code}</span><Badge variant="outline" className={cn('rounded-full border-0 text-[9px]', status.tone)}>{status.label}</Badge><span className={cn('ml-auto text-[10px] font-medium', FEEDBACK_PRIORITY_META[item.priority].tone)}>{FEEDBACK_PRIORITY_META[item.priority].label}</span></div>
                        <p className="mt-2 line-clamp-1 text-sm font-semibold">{item.title}</p>
                        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{item.description}</p>
                        <div className="mt-3 flex items-center justify-between text-[10px] text-muted-foreground"><span>@{profile?.username || 'user'} · {getFeedbackCategoryLabel(item.category)}</span><span>{formatDate(item.last_activity_at)}</span></div>
                      </button>
                    );
                  })}
                </div>
              </aside>

              <div className="min-w-0">
                {!selected ? (
                  <div className="flex h-full min-h-[520px] items-center justify-center text-center"><div><MessageSquareText className="mx-auto h-10 w-10 text-muted-foreground/40" /><p className="mt-3 text-sm font-medium">Murojaatni tanlang</p></div></div>
                ) : (
                  <div className="flex h-full min-h-[620px] flex-col">
                    <div className="border-b border-border p-4 sm:p-5">
                      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-3">
                            <Avatar className="h-10 w-10"><AvatarImage src={profiles[selected.user_id]?.avatar_url || ''} /><AvatarFallback>{(profiles[selected.user_id]?.display_name || profiles[selected.user_id]?.username || '?')[0]?.toUpperCase()}</AvatarFallback></Avatar>
                            <div className="min-w-0"><p className="truncate text-sm font-semibold">{profiles[selected.user_id]?.display_name || 'Foydalanuvchi'}</p><p className="truncate text-xs text-muted-foreground">@{profiles[selected.user_id]?.username || 'user'} · {selected.reference_code}</p></div>
                          </div>
                          <h2 className="mt-4 text-lg font-semibold">{selected.title}</h2>
                          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{selected.description}</p>
                          {selected.source_url && <button type="button" onClick={() => window.open(selected.source_url!, '_blank', 'noopener,noreferrer')} className="mt-3 inline-flex items-center gap-1 text-xs font-medium underline underline-offset-4">Manba sahifa <ExternalLink className="h-3 w-3" /></button>}
                        </div>
                        <div className="grid min-w-[260px] grid-cols-2 gap-2">
                          <select value={selected.status} onChange={(event) => void manage({ status: event.target.value as FeedbackStatus })} disabled={processing} className="h-9 rounded-xl border border-input bg-background px-3 text-xs">{STATUS_OPTIONS.map((status) => <option key={status} value={status}>{FEEDBACK_STATUS_META[status].label}</option>)}</select>
                          <select value={selected.priority} onChange={(event) => void manage({ priority: event.target.value as FeedbackPriority })} disabled={processing} className="h-9 rounded-xl border border-input bg-background px-3 text-xs">{PRIORITY_OPTIONS.map((priority) => <option key={priority} value={priority}>{FEEDBACK_PRIORITY_META[priority].label}</option>)}</select>
                          <Button variant="outline" size="sm" className="col-span-2 rounded-xl" onClick={() => void manage(selected.assigned_to === user?.id ? { unassign: true } : { assignSelf: true })} disabled={processing}><UserRoundCheck className="mr-2 h-3.5 w-3.5" />{selected.assigned_to === user?.id ? 'Unassign' : 'O‘zimga biriktirish'}</Button>
                        </div>
                      </div>
                    </div>

                    <div className="flex-1 space-y-3 overflow-y-auto p-4 sm:p-5">
                      {messages.map((message) => (
                        <div key={message.id} className={cn('max-w-[88%] rounded-2xl px-4 py-3', message.is_internal ? 'border border-dashed border-amber-500/30 bg-amber-500/8' : message.author_role === 'staff' ? 'ml-auto rounded-br-md bg-foreground text-background' : 'rounded-bl-md bg-muted')}>
                          <p className="text-[10px] font-semibold opacity-60">{message.is_internal ? 'Ichki izoh · faqat staff' : message.author_role === 'staff' ? 'Support' : 'Foydalanuvchi'}</p><p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{message.body}</p><p className="mt-2 text-[10px] opacity-60">{formatDate(message.created_at)}</p>
                        </div>
                      ))}
                    </div>

                    <div className="border-t border-border p-4">
                      <Textarea value={replyBody} onChange={(event) => setReplyBody(event.target.value)} rows={3} maxLength={6000} placeholder={internalNote ? 'Ichki izoh — foydalanuvchiga ko‘rinmaydi' : 'Foydalanuvchiga javob yozing…'} className="resize-none rounded-xl" />
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <label className="mr-auto flex cursor-pointer items-center gap-2 text-xs text-muted-foreground"><input type="checkbox" checked={internalNote} onChange={(event) => setInternalNote(event.target.checked)} />Ichki izoh</label>
                        <Button size="sm" className="rounded-xl" onClick={() => void sendReply()} disabled={processing || !replyBody.trim()}>{processing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}{internalNote ? 'Izoh saqlash' : 'Javob yuborish'}</Button>
                      </div>

                      <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto]">
                        <Input value={resolutionNote} onChange={(event) => setResolutionNote(event.target.value)} placeholder="Yechim izohi (resolved bo‘lganda foydalanuvchiga ko‘rinadi)" />
                        <Button variant="outline" className="rounded-xl" onClick={() => void manage({ status: 'resolved', resolution: resolutionNote.trim() || null })} disabled={processing || !resolutionNote.trim()}><CheckCircle2 className="mr-2 h-4 w-4" />Hal qilindi</Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
