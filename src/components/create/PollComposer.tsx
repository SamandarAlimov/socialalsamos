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

const DURATIONS = [
  { label: '1 soat', minutes: 60 },
  { label: '6 soat', minutes: 360 },
  { label: '1 kun', minutes: 1440 },
  { label: '3 kun', minutes: 4320 },
  { label: '1 hafta', minutes: 10080 },
  { label: 'Cheksiz', minutes: null as number | null },
];

function newOption(): DraftOption {
  const id =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  return { id, label: '' };
}

/**
 * So'rovnoma yaratish oynasi.
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

  const removeOption = useCallback(
    (id: string) => {
      setOptions((current) => {
        if (current.length <= POLL_MIN_OPTIONS) return current;
        const index = current.findIndex((option) => option.id === id);
        const next = current.filter((option) => option.id !== id);

        // To'g'ri javob indeksini moslashtiramiz
        setCorrectIndex((currentIndex) => {
          if (currentIndex === null) return null;
          if (currentIndex === index) return null;
          return currentIndex > index ? currentIndex - 1 : currentIndex;
        });

        return next;
      });
    },
    [],
  );

  /** Tartibni almashtirish (drag-and-drop o'rniga ishonchli tugmalar). */
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
    const validation = validatePoll(draft);
    if (!validation.valid) {
      setErrors(validation.errors);
      return;
    }

    setErrors([]);
    onSave(draft);
    onClose();
  }, [draft, onSave, onClose]);

  if (!open) return null;

  const toggleRow = (
    label: string,
    description: string,
    value: boolean,
    onToggle: (value: boolean) => void,
    icon?: React.ReactNode,
  ) => (
    <button
      type="button"
      onClick={() => onToggle(!value)}
      className="flex w-full items-center gap-3 rounded-xl border border-border/60 px-3 py-2.5 text-left transition hover:bg-muted/50"
    >
      {icon && <span className="shrink-0 text-muted-foreground">{icon}</span>}
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-xs text-muted-foreground">{description}</span>
      </span>
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
    <div className="fixed inset-0 z-[60] flex flex-col bg-background">
      {/* Sarlavha */}
      <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-primary" />
          <h2 className="text-base font-semibold">So\u2018rovnoma</h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleSave}
            className="flex h-9 items-center gap-1.5 rounded-full bg-primary px-3.5 text-sm font-semibold text-primary-foreground"
          >
            <Check className="h-4 w-4" /> Saqlash
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Yopish"
            className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Tarkib — scroll ishlaydi, klaviatura ostida ham */}
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4 pb-24 [-webkit-overflow-scrolling:touch]">
        {errors.length > 0 && (
          <ul className="space-y-1 rounded-xl border border-destructive/50 bg-destructive/10 p-3 text-xs text-destructive">
            {errors.map((message) => (
              <li key={message}>• {message}</li>
            ))}
          </ul>
        )}

        {/* Savol */}
        <div>
          <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Savol
          </label>
          <textarea
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="Savolingizni yozing..."
            rows={2}
            maxLength={300}
            className="mt-1.5 w-full resize-none rounded-xl border border-border/60 bg-muted/30 p-3 text-sm outline-none focus:border-primary"
          />
          <p className="mt-1 text-right text-[11px] text-muted-foreground">
            {question.length}/300
          </p>
        </div>

        {/* Variantlar */}
        <div>
          <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Variantlar ({options.length}/{POLL_MAX_OPTIONS})
          </label>

          <div className="mt-1.5 space-y-2">
            {options.map((option, index) => (
              <div key={option.id} className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  {quizMode && (
                    <button
                      type="button"
                      onClick={() => setCorrectIndex(index)}
                      aria-label="To'g'ri javob"
                      className={cn(
                        'flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition',
                        correctIndex === index
                          ? 'border-green-500 bg-green-500 text-white'
                          : 'border-border/60 text-muted-foreground',
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
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border/60 text-muted-foreground transition hover:bg-muted"
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
                    className="h-9 min-w-0 flex-1 rounded-xl border border-border/60 bg-muted/30 px-3 text-sm outline-none focus:border-primary"
                  />

                  <button
                    type="button"
                    onClick={() => moveOption(index, -1)}
                    disabled={index === 0}
                    aria-label="Yuqoriga"
                    className="flex h-8 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground disabled:opacity-30"
                  >
                    <ArrowUp className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveOption(index, 1)}
                    disabled={index === options.length - 1}
                    aria-label="Pastga"
                    className="flex h-8 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground disabled:opacity-30"
                  >
                    <ArrowDown className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeOption(option.id)}
                    disabled={options.length <= POLL_MIN_OPTIONS}
                    aria-label="O'chirish"
                    className="flex h-8 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground disabled:opacity-30"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                {/* Emoji tanlash — bosish orqali (mobil qurilmada ham ishlaydi) */}
                {emojiTargetId === option.id && (
                  <div className="flex flex-wrap gap-1.5 rounded-xl border border-border/60 bg-muted/30 p-2">
                    {EMOJIS.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => {
                          updateOption(option.id, { emoji });
                          setEmojiTargetId(null);
                        }}
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-base transition hover:bg-muted"
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
                        className="flex h-8 items-center gap-1 rounded-lg px-2 text-xs text-muted-foreground transition hover:bg-muted"
                      >
                        <X className="h-3 w-3" /> Olib tashlash
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {options.length < POLL_MAX_OPTIONS && (
            <button
              type="button"
              onClick={addOption}
              className="mt-2 flex h-10 w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-border text-sm font-medium text-muted-foreground transition hover:bg-muted/50"
            >
              <Plus className="h-4 w-4" /> Variant qo\u2018shish
            </button>
          )}
        </div>

        {/* Muddat */}
        <div>
          <label className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <Clock className="h-3 w-3" /> Muddat
          </label>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {DURATIONS.map((duration) => (
              <button
                key={duration.label}
                type="button"
                onClick={() => setDurationMinutes(duration.minutes)}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-xs font-medium transition',
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

        {/* Sozlamalar */}
        <div className="space-y-2">
          {toggleRow(
            'Viktorina rejimi',
            "To'g'ri javob belgilanadi, ovoz berilgach ko'rsatiladi",
            quizMode,
            (value) => {
              setQuizMode(value);
              if (value) setAllowMultiple(false);
            },
            <Trophy className="h-4 w-4" />,
          )}

          {!quizMode &&
            toggleRow(
              "Ko'p tanlov",
              'Bir necha variantni tanlash mumkin',
              allowMultiple,
              setAllowMultiple,
              <Check className="h-4 w-4" />,
            )}

          {toggleRow(
            'Anonim ovoz berish',
            'Kim ovoz berganini boshqalar ko\u2018rmaydi',
            isAnonymous,
            setIsAnonymous,
            <Lock className="h-4 w-4" />,
          )}

          {!quizMode &&
            toggleRow(
              'Natijalarni oldin ko\u2018rsatish',
              'Ovoz bermasdan ham natijalar ko\u2018rinadi',
              showResultsBeforeVote,
              setShowResultsBeforeVote,
              <BarChart3 className="h-4 w-4" />,
            )}
        </div>

        {/* Viktorina izohi */}
        {quizMode && (
          <div>
            <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Izoh (ixtiyoriy)
            </label>
            <textarea
              value={explanation}
              onChange={(event) => setExplanation(event.target.value)}
              placeholder="To\u2018g\u2018ri javob nima uchun to\u2018g\u2018ri?"
              rows={2}
              maxLength={300}
              className="mt-1.5 w-full resize-none rounded-xl border border-border/60 bg-muted/30 p-3 text-sm outline-none focus:border-primary"
            />
          </div>
        )}
      </div>
    </div>
  );
}
