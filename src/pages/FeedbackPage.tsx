import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Bug,
  CheckCircle2,
  ChevronRight,
  CreditCard,
  HeartHandshake,
  Lightbulb,
  Loader2,
  MessageSquareText,
  RefreshCw,
  Send,
  ShieldAlert,
  ShoppingBag,
  Sparkles,
  Star,
} from 'lucide-react';
import { usePlatformFeedback } from '@/hooks/usePlatformFeedback';
import {
  FEEDBACK_CATEGORIES,
  FEEDBACK_STATUS_META,
  getFeedbackCategoryLabel,
  type FeedbackCategory,
  type PlatformFeedbackCase,
} from '@/lib/platformFeedback';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const CATEGORY_ICONS: Record<FeedbackCategory, typeof Bug> = {
  bug: Bug,
  feature: Lightbulb,
  experience: Sparkles,
  content: MessageSquareText,
  safety: ShieldAlert,
  payments: CreditCard,
  marketplace: ShoppingBag,
  other: HeartHandshake,
};

function formatDate(value: string) {
  try {
    return new Intl.DateTimeFormat('uz-UZ', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function FeedbackCaseCard({
  item,
  onOpen,
}: {
  item: PlatformFeedbackCase;
  onOpen: (item: PlatformFeedbackCase) => void;
}) {
  const status = FEEDBACK_STATUS_META[item.status];
  const Icon = CATEGORY_ICONS[item.category];

  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      className="w-full rounded-2xl border border-border bg-card p-4 text-left shadow-sm transition hover:border-foreground/15 hover:shadow-md"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-muted/35">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-muted-foreground">{item.reference_code}</span>
            <Badge variant="outline" className={cn('rounded-full border-0 text-[10px] font-medium', status.tone)}>
              {status.label}
            </Badge>
          </div>
          <h3 className="mt-1.5 truncate text-sm font-semibold">{item.title}</h3>
          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{item.description}</p>
          <div className="mt-3 flex items-center gap-2 text-[11px] text-muted-foreground">
            <span>{getFeedbackCategoryLabel(item.category)}</span>
            <span>•</span>
            <span>{formatDate(item.last_activity_at)}</span>
            {item.last_response_by === 'staff' && item.status !== 'resolved' && item.status !== 'closed' && (
              <span className="ml-auto font-medium text-foreground">Yangi javob</span>
            )}
          </div>
        </div>
        <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
      </div>
    </button>
  );
}

export default function FeedbackPage() {
  const {
    cases,
    messages,
    isLoading,
    backendReady,
    refresh,
    fetchMessages,
    submitFeedback,
    reply,
  } = usePlatformFeedback();

  const [view, setView] = useState<'compose' | 'history'>('compose');
  const [category, setCategory] = useState<FeedbackCategory>('experience');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [rating, setRating] = useState<number | null>(null);
  const [contactAllowed, setContactAllowed] = useState(true);
  const [includeDiagnostics, setIncludeDiagnostics] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [selected, setSelected] = useState<PlatformFeedbackCase | null>(null);
  const [replyBody, setReplyBody] = useState('');
  const [replying, setReplying] = useState(false);

  const openCases = useMemo(
    () => cases.filter((item) => !['resolved', 'closed'].includes(item.status)).length,
    [cases],
  );

  useEffect(() => {
    if (!selected) return;
    void fetchMessages(selected.id);
  }, [fetchMessages, selected]);

  const canSubmit =
    backendReady &&
    title.trim().length >= 3 &&
    description.trim().length >= 10 &&
    !submitting;

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    const created = await submitFeedback({
      category,
      title,
      description,
      rating,
      contactAllowed,
      includeDiagnostics,
    });
    setSubmitting(false);
    if (!created) return;

    setTitle('');
    setDescription('');
    setRating(null);
    setCategory('experience');
    setSelected(created);
    setView('history');
  };

  const sendReply = async () => {
    if (!selected || !replyBody.trim() || replying) return;
    setReplying(true);
    const ok = await reply(selected.id, replyBody);
    setReplying(false);
    if (ok) setReplyBody('');
  };

  const selectedLive = selected
    ? cases.find((item) => item.id === selected.id) || selected
    : null;

  return (
    <div className="min-h-full bg-background pb-12">
      <div className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-6 lg:px-8">
        <section className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
          <div className="border-b border-border px-5 py-6 sm:px-7">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                  <MessageSquareText className="h-4 w-4" /> Alsamos Feedback Center
                </div>
                <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">Fikringiz mahsulotni yaxshilaydi</h1>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                  Xatolik, taklif, xavfsizlik yoki xizmat tajribasini bitta professional murojaat oqimida yuboring va holatini kuzating.
                </p>
              </div>
              <div className="flex items-center gap-2 rounded-2xl border border-border bg-background p-2">
                <div className="px-2 text-center"><p className="text-lg font-bold tabular-nums">{cases.length}</p><p className="text-[10px] text-muted-foreground">Jami</p></div>
                <div className="h-8 w-px bg-border" />
                <div className="px-2 text-center"><p className="text-lg font-bold tabular-nums">{openCases}</p><p className="text-[10px] text-muted-foreground">Ochiq</p></div>
              </div>
            </div>
          </div>

          <div className="border-b border-border bg-muted/15 px-3 py-2 sm:px-5">
            <div className="inline-flex rounded-xl bg-muted p-1">
              <button
                type="button"
                onClick={() => { setView('compose'); setSelected(null); }}
                className={cn('rounded-lg px-4 py-2 text-sm font-semibold transition', view === 'compose' ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground')}
              >
                Feedback yuborish
              </button>
              <button
                type="button"
                onClick={() => setView('history')}
                className={cn('rounded-lg px-4 py-2 text-sm font-semibold transition', view === 'history' ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground')}
              >
                Murojaatlarim {cases.length > 0 && <span className="ml-1 text-xs tabular-nums">{cases.length}</span>}
              </button>
            </div>
          </div>

          {!backendReady && (
            <div className="mx-5 mt-5 flex items-start gap-3 rounded-2xl border border-amber-500/25 bg-amber-500/8 p-4 sm:mx-7">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
              <div>
                <p className="text-sm font-semibold">Feedback backend deployini kutmoqda</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  Interfeys tayyor, ammo production ma’lumotlar bazasiga feedback migrationi yetib bormaguncha yangi murojaat yuborish vaqtincha bloklanadi.
                </p>
              </div>
            </div>
          )}

          {view === 'compose' ? (
            <div className="grid gap-6 p-5 sm:p-7 lg:grid-cols-[1.05fr_.95fr]">
              <div className="space-y-5">
                <div>
                  <label className="text-sm font-semibold">Murojaat turi</label>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {FEEDBACK_CATEGORIES.map((item) => {
                      const Icon = CATEGORY_ICONS[item.id];
                      const active = category === item.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setCategory(item.id)}
                          className={cn(
                            'flex items-start gap-3 rounded-2xl border p-3 text-left transition',
                            active ? 'border-foreground/35 bg-foreground/[0.035] ring-1 ring-foreground/10' : 'border-border hover:bg-muted/25',
                          )}
                        >
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted/60"><Icon className="h-4 w-4" /></span>
                          <span className="min-w-0"><span className="block text-sm font-semibold">{item.label}</span><span className="mt-0.5 block text-[11px] leading-relaxed text-muted-foreground">{item.description}</span></span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label htmlFor="feedback-title" className="text-sm font-semibold">Qisqa sarlavha</label>
                  <Input id="feedback-title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={140} placeholder="Masalan: Video yuklashda progress to‘xtab qoladi" className="mt-2 h-11 rounded-xl" />
                  <div className="mt-1 text-right text-[10px] text-muted-foreground tabular-nums">{title.length}/140</div>
                </div>

                <div>
                  <label htmlFor="feedback-description" className="text-sm font-semibold">Batafsil tavsif</label>
                  <Textarea id="feedback-description" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={6000} rows={8} placeholder="Nima qilayotgan edingiz, nima yuz berdi va qanday natija kutgandingiz? Xatolik bo‘lsa, takrorlash qadamlarini yozing." className="mt-2 resize-y rounded-xl" />
                  <div className="mt-1 text-right text-[10px] text-muted-foreground tabular-nums">{description.length}/6000</div>
                </div>
              </div>

              <aside className="space-y-4">
                <div className="rounded-2xl border border-border bg-muted/15 p-4">
                  <p className="text-sm font-semibold">Tajribani baholang</p>
                  <p className="mt-1 text-xs text-muted-foreground">Ixtiyoriy. 1 — juda yomon, 5 — a’lo.</p>
                  <div className="mt-3 flex gap-1">
                    {[1, 2, 3, 4, 5].map((value) => (
                      <button key={value} type="button" onClick={() => setRating(rating === value ? null : value)} className="rounded-lg p-1.5 transition hover:bg-muted" aria-label={`${value} yulduz`}>
                        <Star className={cn('h-6 w-6', rating && value <= rating ? 'fill-foreground text-foreground' : 'text-muted-foreground/40')} />
                      </button>
                    ))}
                  </div>
                </div>

                <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-border p-4">
                  <input type="checkbox" checked={includeDiagnostics} onChange={(event) => setIncludeDiagnostics(event.target.checked)} className="mt-1 h-4 w-4 rounded border-border" />
                  <span><span className="block text-sm font-semibold">Texnik diagnostikani qo‘shish</span><span className="mt-1 block text-xs leading-relaxed text-muted-foreground">Brauzer, ekran o‘lchami, til, timezone va tarmoq turi kabi ma’lumotlar muammoni tezroq topishga yordam beradi. Parol yoki yozishma mazmuni olinmaydi.</span></span>
                </label>

                <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-border p-4">
                  <input type="checkbox" checked={contactAllowed} onChange={(event) => setContactAllowed(event.target.checked)} className="mt-1 h-4 w-4 rounded border-border" />
                  <span><span className="block text-sm font-semibold">Javob olishga roziman</span><span className="mt-1 block text-xs leading-relaxed text-muted-foreground">Support jamoasi shu murojaat ichida qo‘shimcha ma’lumot so‘rashi mumkin.</span></span>
                </label>

                <div className="rounded-2xl border border-border bg-card p-4">
                  <div className="flex gap-3"><ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" /><div><p className="text-sm font-semibold">Maxfiy ma’lumot yubormang</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">Parol, SMS kod, bank karta CVV yoki recovery kodlarni feedbackga yozmang.</p></div></div>
                </div>

                <Button onClick={() => void submit()} disabled={!canSubmit} className="h-11 w-full rounded-xl">
                  {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                  Feedback yuborish
                </Button>
              </aside>
            </div>
          ) : (
            <div className="p-5 sm:p-7">
              {selectedLive ? (
                <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
                  <div>
                    <Button variant="ghost" size="sm" className="mb-3 -ml-2" onClick={() => setSelected(null)}>← Barcha murojaatlar</Button>
                    <FeedbackCaseCard item={selectedLive} onOpen={() => undefined} />
                    <div className="mt-3 rounded-2xl border border-border bg-muted/15 p-4 text-xs text-muted-foreground">
                      <p><span className="font-semibold text-foreground">Kategoriya:</span> {getFeedbackCategoryLabel(selectedLive.category)}</p>
                      <p className="mt-1"><span className="font-semibold text-foreground">Yaratilgan:</span> {formatDate(selectedLive.created_at)}</p>
                      {selectedLive.source_route && <p className="mt-1 break-all"><span className="font-semibold text-foreground">Sahifa:</span> {selectedLive.source_route}</p>}
                    </div>
                  </div>

                  <div className="overflow-hidden rounded-2xl border border-border bg-card">
                    <div className="border-b border-border px-4 py-4 sm:px-5">
                      <div className="flex items-center gap-2"><MessageSquareText className="h-4 w-4" /><h2 className="font-semibold">Support suhbat</h2></div>
                      <p className="mt-1 text-xs text-muted-foreground">{selectedLive.reference_code} · {FEEDBACK_STATUS_META[selectedLive.status].label}</p>
                    </div>

                    <div className="max-h-[50vh] space-y-3 overflow-y-auto p-4 sm:p-5">
                      <div className="ml-auto max-w-[88%] rounded-2xl rounded-br-md bg-foreground px-4 py-3 text-background">
                        <p className="text-sm font-medium">{selectedLive.title}</p>
                        <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed opacity-90">{selectedLive.description}</p>
                        <p className="mt-2 text-[10px] opacity-60">{formatDate(selectedLive.created_at)}</p>
                      </div>

                      {(messages[selectedLive.id] || []).map((message) => (
                        <div key={message.id} className={cn('max-w-[88%] rounded-2xl px-4 py-3', message.author_role === 'user' ? 'ml-auto rounded-br-md bg-foreground text-background' : 'rounded-bl-md bg-muted')}>
                          <p className="text-[10px] font-semibold opacity-60">{message.author_role === 'staff' ? 'Alsamos Support' : 'Siz'}</p>
                          <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{message.body}</p>
                          <p className="mt-2 text-[10px] opacity-60">{formatDate(message.created_at)}</p>
                        </div>
                      ))}

                      {selectedLive.resolution_note && (
                        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/8 p-4">
                          <div className="flex items-center gap-2 text-sm font-semibold"><CheckCircle2 className="h-4 w-4 text-emerald-600" />Yechim</div>
                          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{selectedLive.resolution_note}</p>
                        </div>
                      )}
                    </div>

                    {selectedLive.status !== 'closed' && (
                      <div className="border-t border-border p-4">
                        <Textarea value={replyBody} onChange={(event) => setReplyBody(event.target.value)} maxLength={6000} rows={3} placeholder="Supportga javob yozing…" className="resize-none rounded-xl" />
                        <div className="mt-2 flex justify-end">
                          <Button size="sm" className="rounded-xl" onClick={() => void sendReply()} disabled={!replyBody.trim() || replying}>
                            {replying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}Javob yuborish
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ) : isLoading ? (
                <div className="flex min-h-72 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-muted-foreground" /></div>
              ) : cases.length === 0 ? (
                <div className="flex min-h-72 flex-col items-center justify-center rounded-2xl border border-dashed border-border text-center">
                  <HeartHandshake className="h-10 w-10 text-muted-foreground/50" />
                  <h2 className="mt-4 font-semibold">Hali murojaat yo‘q</h2>
                  <p className="mt-1 max-w-sm text-sm text-muted-foreground">Birinchi feedbackni yuboring — keyin uning holati va support javoblarini shu yerda kuzatasiz.</p>
                  <Button className="mt-5 rounded-xl" onClick={() => setView('compose')}>Feedback yuborish <ArrowRight className="ml-2 h-4 w-4" /></Button>
                </div>
              ) : (
                <>
                  <div className="mb-4 flex items-center justify-between"><div><h2 className="font-semibold">Murojaatlar tarixi</h2><p className="text-xs text-muted-foreground">Oxirgi faollik bo‘yicha saralangan</p></div><Button variant="outline" size="sm" className="rounded-xl" onClick={() => void refresh()} disabled={isLoading}><RefreshCw className={cn('mr-2 h-3.5 w-3.5', isLoading && 'animate-spin')} />Yangilash</Button></div>
                  <div className="grid gap-3 lg:grid-cols-2">{cases.map((item) => <FeedbackCaseCard key={item.id} item={item} onOpen={setSelected} />)}</div>
                </>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
