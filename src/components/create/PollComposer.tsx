import { useCallback, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  BarChart3,
  Check,
  Clock,
  Lock,
  Plus,
  Smile,
  Trash2,
  Trophy,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  POLL_MAX_OPTIONS,
  POLL_MIN_OPTIONS,
  closesAtFromMinutes,
  validatePoll,
  type PollInput,
} from '@/lib/polls';

interface PollComposerProps {
  open: boolean;
  onClose: () => void;
  onSave: (poll: PollInput) => void;
  initialPoll?: PollInput | null;
}

interface DraftOption {
  id: string;
  label: string;
  emoji?: string;
}

const EMOJIS = ['👍', '👎', '❤️', '🔥', '😂', '😮', '😢', '🎉', '✅', '❌', '⭐', '🎯'];

const DURATIONS: Array<{ label: string; minutes: number | null }> = [
  { label: '1 soat', minutes: 60 },
  { label: '6 soat', minutes: 360 },
  { label: '1 kun', minutes: 1440 },
  { label: '3 kun', minutes: 4320 },
  { label: '1 hafta', minutes: 10080 },
  { label: 'Cheksiz', minutes: null },
];

function newOption(): DraftOption {
  const id =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  return { id, label: '' };
}

/**
 * So‘rovnoma yaratish oynasi.
 *
 * Eski `EnhancedPollCreator` natijani post matniga JSON qilib yozardi.
 * Bu komponent esa `PollInput` qaytaradi — u `polls` jadvaliga yoziladi.
 */
export function PollComposer({ open, onClose, onSave, initialPoll }: PollComposerProps) {
  const [question, setQuestion] = useState(initialPoll?.question ?? '');
  const [options, setOptions] = useState<DraftOption[]>(() => {
    if (initialPoll?.options?.length) {
      return initialPoll.options.map((option, index) => ({
        id: String(index),
        label: option.label,
        emoji: option.emoji ?? undefined,
      }));
    }
    return [newOption(), newOption()];
  });
  const [allowMultiple, setAllowMultiple] = useState(initialPoll?.allowMultiple ?? false);
  const [isAnonymous, setIsAnonymous] = useState(initialPoll?.isAnonymous ?? true);
  const [showResultsBeforeVote, setShowResultsBeforeVote] = useState(
    initialPoll?.showResultsBeforeVote ?? false,
  );
  const [quizMode, setQuizMode] = useState(initialPoll?.quizMode ?? false);
  const [correctIndex, setCorrectIndex] = useState<number | null>(
    initialPoll?.correctOptionIndex ?? null,
  );
  const [explanation, setExplanation] = useState(initialPoll?.explanation ?? '');
  const [durationMinutes, setDurationMinutes] = useState<number | null>(1440);
  const [emojiTargetId, setEmojiTargetId] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);

  const updateOption = useCallback((id: string, changes: Partial<DraftOption>) => {
    setOptions((current) =>
      current.map((option) => (option.id === id ? { ...option, ...changes } : option)),
    );
  }, []);

  const addOption = useCallback(() => {
    setOptions((current) =>
      current.length >= POLL_MAX_OPTIONS ? current : [...current, newOption()],
    );
  }, []);

  const removeOption = useCallback((id: string) => {
    setOptions((current) => {
      if (current.length <= POLL_MIN_OPTIONS) return current;

      const index = current.findIndex((option) => option.id === id);

      // To‘g‘ri javob indeksini moslashtiramiz
      setCorrectIndex((currentIndex) => {
        if (currentIndex === null) return null;
        if (currentIndex === index) return null;
        return currentIndex > index ? currentIndex - 1 : currentIndex;
      });

      return current.filter((option) => option.id !== id);
    });
  }, []);

  /** Tartibni almashtirish (mobil qurilmada ishonchsiz drag-and-drop o‘rniga). */
  const moveOption = useCallback((index: number, direction: -1 | 1) => {
    setOptions((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;

      const next = [...current];
      const [moved] = next.splice(index, 1);
      next.splice(target, 0, moved);

      setCorrectIndex((currentIndex) => {
        if (currentIndex === null) return null;
        if (currentIndex === index) return target;
        if (currentIndex === target) return index;
        return currentIndex;
      });

      return next;
    });
  }, []);

  const draft = useMemo<PollInput>(
    () => ({
      question: question.trim(),
      options: options.map((option) => ({
        label: option.label.trim(),
        emoji: option.emoji ?? null,
      })),
      allowMultiple,
      isAnonymous,
      showResultsBeforeVote,
      quizMode,
      correctOptionIndex: quizMode ? correctIndex : null,
      explanation: quizMode ? explanation.trim() || null : null,
      closesAt: closesAtFromMinutes(durationMinutes),
    }),
    [
      question,
      options,
      allowMultiple,
      isAnonymous,
      showResultsBeforeVote,
      quizMode,
      correctIndex,
      explanation,
      durationMinutes,
    ],
  );

  const handleSave = useCallback(() => {
    const validationError = validatePoll(draft);
    if (validationError) {
      setErrors([validationError]);
      return;
    }

    setErrors([]);
    onSave(draft);
    onClose();
  }, [draft, onSave, onClose]);

  if (!open) return null;

  const toggleRow = (
    label: string,
    _description: string,
    value: boolean,
    onToggle: (value: boolean) => void,
    icon?: React.ReactNode,
  ) => (
    <button
      type="button"
      onClick={() => onToggle(!value)}
      className="flex w-full items-center gap-3 rounded-2xl border border-border/60 bg-background px-3 py-3 text-left transition hover:border-primary/20 hover:bg-primary/[0.025]"
    >
      {icon && <span className="shrink-0 text-muted-foreground">{icon}</span>}
      <span className="min-w-0 flex-1 text-sm font-medium">{label}</span>
      <span
        className={cn(
          'flex h-6 w-10 shrink-0 items-center rounded-full p-0.5 transition',
          value ? 'bg-primary' : 'bg-muted',
        )}
      >
        <span
          className={cn(
            'h-5 w-5 rounded-full bg-background shadow transition-transform',
            value && 'translate-x-4',
          )}
        />
      </span>
    </button>
  );

  return (
    <div className="fixed inset-0 z-[60] flex h-[100dvh] min-h-0 flex-col bg-background">
      <header className="shrink-0 border-b border-border/60 bg-background/90 backdrop-blur-2xl">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-3 px-4 sm:px-6">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <BarChart3 className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold sm:text-base">So‘rovnoma</h2>
          </div>

          <button
            type="button"
            onClick={handleSave}
            className="hidden h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm sm:flex"
          >
            <Check className="h-4 w-4" />
            Saqlash
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Yopish"
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-border/60 text-muted-foreground transition hover:bg-muted"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-muted/20 [-webkit-overflow-scrolling:touch]">
        <div className="mx-auto grid w-full max-w-6xl gap-5 px-4 py-5 pb-28 sm:px-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
          <section className="min-w-0 space-y-4">
            {errors.length > 0 && (
              <ul className="space-y-1 rounded-2xl border border-destructive/40 bg-destructive/10 p-4 text-xs text-destructive">
                {errors.map((message) => (
                  <li key={message}>• {message}</li>
                ))}
              </ul>
            )}

            <div className="overflow-hidden rounded-3xl border border-border/60 bg-card shadow-sm">
              <div className="border-b border-border/50 px-4 py-3 sm:px-5">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Savol
                </p>
              </div>
              <div className="p-4 sm:p-5">
                <textarea
                  value={question}
                  onChange={(event) => setQuestion(event.target.value)}
                  placeholder="Savolingizni yozing..."
                  rows={3}
                  maxLength={300}
                  className="w-full resize-none rounded-2xl border border-border/60 bg-muted/25 p-4 text-base font-medium outline-none transition focus:border-primary/60 focus:bg-background"
                />
                <p className="mt-2 text-right text-[11px] text-muted-foreground">
                  {question.length}/300
                </p>
              </div>
            </div>

            <div className="overflow-hidden rounded-3xl border border-border/60 bg-card shadow-sm">
              <div className="flex items-center justify-between border-b border-border/50 px-4 py-3 sm:px-5">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Variantlar
                </p>
                <span className="rounded-full bg-muted px-2.5 py-1 text-[10px] font-medium text-muted-foreground">
                  {options.length}/{POLL_MAX_OPTIONS}
                </span>
              </div>

              <div className="space-y-3 p-4 sm:p-5">
                {options.map((option, index) => (
                  <div key={option.id} className="rounded-2xl border border-border/50 bg-background p-2.5">
                    <div className="flex items-center gap-2">
                      {quizMode && (
                        <button
                          type="button"
                          onClick={() => setCorrectIndex(index)}
                          aria-label="To‘g‘ri javob"
                          className={cn(
                            'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border transition',
                            correctIndex === index
                              ? 'border-emerald-500 bg-emerald-500 text-white'
                              : 'border-border/60 text-muted-foreground hover:bg-muted',
                          )}
                        >
                          <Check className="h-4 w-4" />
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() =>
                          setEmojiTargetId((current) => (current === option.id ? null : option.id))
                        }
                        aria-label="Emoji tanlash"
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border/60 bg-muted/25 text-muted-foreground transition hover:bg-muted"
                      >
                        {option.emoji ? (
                          <span className="text-base">{option.emoji}</span>
                        ) : (
                          <Smile className="h-4 w-4" />
                        )}
                      </button>

                      <input
                        value={option.label}
                        onChange={(event) => updateOption(option.id, { label: event.target.value })}
                        placeholder={'Variant ' + (index + 1)}
                        maxLength={150}
                        className="h-10 min-w-0 flex-1 rounded-xl border border-border/60 bg-muted/25 px-3 text-sm outline-none transition focus:border-primary/60 focus:bg-background"
                      />

                      <div className="hidden items-center gap-0.5 sm:flex">
                        <button
                          type="button"
                          onClick={() => moveOption(index, -1)}
                          disabled={index === 0}
                          aria-label="Yuqoriga"
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted disabled:opacity-25"
                        >
                          <ArrowUp className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => moveOption(index, 1)}
                          disabled={index === options.length - 1}
                          aria-label="Pastga"
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted disabled:opacity-25"
                        >
                          <ArrowDown className="h-4 w-4" />
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => removeOption(option.id)}
                        disabled={options.length <= POLL_MIN_OPTIONS}
                        aria-label="O‘chirish"
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive disabled:opacity-25"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>

                    <div className="mt-2 flex gap-1 sm:hidden">
                      <button
                        type="button"
                        onClick={() => moveOption(index, -1)}
                        disabled={index === 0}
                        className="flex h-8 flex-1 items-center justify-center rounded-lg bg-muted/45 text-xs text-muted-foreground disabled:opacity-25"
                      >
                        <ArrowUp className="mr-1 h-3.5 w-3.5" /> Yuqoriga
                      </button>
                      <button
                        type="button"
                        onClick={() => moveOption(index, 1)}
                        disabled={index === options.length - 1}
                        className="flex h-8 flex-1 items-center justify-center rounded-lg bg-muted/45 text-xs text-muted-foreground disabled:opacity-25"
                      >
                        <ArrowDown className="mr-1 h-3.5 w-3.5" /> Pastga
                      </button>
                    </div>

                    {emojiTargetId === option.id && (
                      <div className="mt-2 flex flex-wrap gap-1.5 rounded-xl bg-muted/35 p-2">
                        {EMOJIS.map((emoji) => (
                          <button
                            key={emoji}
                            type="button"
                            onClick={() => {
                              updateOption(option.id, { emoji });
                              setEmojiTargetId(null);
                            }}
                            className="flex h-9 w-9 items-center justify-center rounded-lg text-base transition hover:bg-background"
                          >
                            {emoji}
                          </button>
                        ))}
                        {option.emoji && (
                          <button
                            type="button"
                            onClick={() => {
                              updateOption(option.id, { emoji: undefined });
                              setEmojiTargetId(null);
                            }}
                            className="flex h-9 items-center gap-1 rounded-lg px-2 text-xs text-muted-foreground transition hover:bg-background"
                          >
                            <X className="h-3 w-3" /> Olib tashlash
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ))}

                {options.length < POLL_MAX_OPTIONS && (
                  <button
                    type="button"
                    onClick={addOption}
                    className="flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-border text-sm font-medium text-muted-foreground transition hover:border-primary/35 hover:bg-primary/[0.03] hover:text-foreground"
                  >
                    <Plus className="h-4 w-4" />
                    Variant qo‘shish
                  </button>
                )}
              </div>
            </div>
          </section>

          <aside className="min-w-0 space-y-4 lg:sticky lg:top-5">
            <div className="overflow-hidden rounded-3xl border border-border/60 bg-card shadow-sm">
              <div className="border-b border-border/50 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Sozlamalar
                </p>
              </div>

              <div className="space-y-4 p-4">
                <div>
                  <label className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    <Clock className="h-3.5 w-3.5" />
                    Muddat
                  </label>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {DURATIONS.map((duration) => (
                      <button
                        key={duration.label}
                        type="button"
                        onClick={() => setDurationMinutes(duration.minutes)}
                        className={cn(
                          'rounded-full border px-2.5 py-1.5 text-[11px] font-medium transition',
                          durationMinutes === duration.minutes
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-border/60 text-muted-foreground hover:bg-muted',
                        )}
                      >
                        {duration.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  {toggleRow(
                    'Viktorina rejimi',
                    'To‘g‘ri javob va izoh',
                    quizMode,
                    (value) => {
                      setQuizMode(value);
                      if (value) setAllowMultiple(false);
                    },
                    <Trophy className="h-4 w-4" />,
                  )}

                  {!quizMode &&
                    toggleRow(
                      'Ko‘p tanlov',
                      'Bir nechta variant',
                      allowMultiple,
                      setAllowMultiple,
                      <Check className="h-4 w-4" />,
                    )}

                  {toggleRow(
                    'Anonim',
                    'Ovoz berganlar yashirin',
                    isAnonymous,
                    setIsAnonymous,
                    <Lock className="h-4 w-4" />,
                  )}

                  {!quizMode &&
                    toggleRow(
                      'Natijalarni oldin',
                      'Ovoz berishdan avval ko‘rsatish',
                      showResultsBeforeVote,
                      setShowResultsBeforeVote,
                      <BarChart3 className="h-4 w-4" />,
                    )}
                </div>

                {quizMode && (
                  <div>
                    <label className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      Javob izohi
                    </label>
                    <textarea
                      value={explanation}
                      onChange={(event) => setExplanation(event.target.value)}
                      placeholder="To‘g‘ri javob nima uchun to‘g‘ri?"
                      rows={3}
                      maxLength={300}
                      className="mt-2 w-full resize-none rounded-2xl border border-border/60 bg-muted/25 p-3 text-xs outline-none focus:border-primary/60"
                    />
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-3xl border border-border/60 bg-card p-4 shadow-sm">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                Preview
              </p>
              <p className="mt-2 line-clamp-2 text-sm font-semibold">
                {question.trim() || 'Savol hali yozilmagan'}
              </p>
              <div className="mt-3 space-y-1.5">
                {options.slice(0, 4).map((option, index) => (
                  <div key={option.id} className="flex items-center gap-2 rounded-xl bg-muted/40 px-3 py-2">
                    <span className="text-sm">{option.emoji || '○'}</span>
                    <span className="min-w-0 flex-1 truncate text-xs">
                      {option.label.trim() || `Variant ${index + 1}`}
                    </span>
                    {quizMode && correctIndex === index && (
                      <Check className="h-3.5 w-3.5 text-emerald-500" />
                    )}
                  </div>
                ))}
                {options.length > 4 && (
                  <p className="px-1 text-[10px] text-muted-foreground">
                    +{options.length - 4} ta variant
                  </p>
                )}
              </div>
            </div>
          </aside>
        </div>
      </main>

      <div className="absolute inset-x-0 bottom-0 z-10 border-t border-border/60 bg-background/92 p-3 backdrop-blur-xl sm:hidden">
        <button
          type="button"
          onClick={handleSave}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-sm font-semibold text-primary-foreground"
        >
          <Check className="h-4 w-4" />
          Saqlash
        </button>
      </div>
    </div>
  );
}
