import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BarChart3,
  Check,
  Clock,
  ExternalLink,
  Hash,
  HelpCircle,
  MapPin,
  Music2,
  Send,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  MAX_ANSWER_LENGTH,
  type StorySticker,
  type StoryStickerResults,
} from '@/lib/storyStickers';

interface StoryStickerViewProps {
  sticker: StorySticker;
  results?: StoryStickerResults;
  /** Faqat ko‘rish (masalan, tahrirlash yoki oldindan ko‘rish rejimida). */
  readOnly?: boolean;
  onRespond?: (answer: { optionIndex?: number; value?: number; text?: string }) => Promise<void>;
}

/**
 * Bitta interaktiv story stikerining ko‘rinishi.
 *
 * Muhim: bu komponent o‘z o‘lchamini piksel emas, `em` da beradi — tashqi
 * qatlam `fontSize` orqali stikerni kattalashtiradi/kichraytiradi. Shu sababli
 * bir xil stiker story va reel ekranida bir xil nisbatda ko‘rinadi.
 */
export function StoryStickerView({
  sticker,
  results,
  readOnly,
  onRespond,
}: StoryStickerViewProps) {
  const [isSending, setIsSending] = useState(false);

  const send = async (answer: { optionIndex?: number; value?: number; text?: string }) => {
    if (readOnly || !onRespond || isSending) return;
    setIsSending(true);
    try {
      await onRespond(answer);
    } finally {
      setIsSending(false);
    }
  };

  switch (sticker.type) {
    case 'poll':
    case 'quiz':
      return (
        <ChoiceSticker
          sticker={sticker}
          results={results}
          disabled={readOnly || isSending}
          onPick={(index) => void send({ optionIndex: index })}
        />
      );

    case 'slider':
      return (
        <SliderSticker
          sticker={sticker}
          results={results}
          disabled={readOnly || isSending}
          onCommit={(value) => void send({ value })}
        />
      );

    case 'question':
      return (
        <QuestionSticker
          sticker={sticker}
          disabled={readOnly || isSending}
          onSubmit={(text) => void send({ text })}
        />
      );

    case 'location':
      return (
        <Chip icon={MapPin} tone="light">
          {sticker.config.placeName ?? 'Joylashuv'}
        </Chip>
      );

    case 'music':
      return (
        <Chip icon={Music2} tone="dark">
          <span className="truncate">
            {sticker.config.trackTitle ?? 'Musiqa'}
            {sticker.config.trackArtist ? ' · ' + sticker.config.trackArtist : ''}
          </span>
        </Chip>
      );

    case 'mention':
      return <Chip tone="light">@{sticker.config.username}</Chip>;

    case 'hashtag':
      return (
        <Chip icon={Hash} tone="light">
          {sticker.config.hashtag}
        </Chip>
      );

    case 'link':
      return (
        <Chip icon={ExternalLink} tone="dark">
          <span className="truncate">{sticker.config.prompt ?? sticker.config.url}</span>
        </Chip>
      );

    case 'countdown':
      return <CountdownSticker sticker={sticker} />;

    default:
      return null;
  }
}

/* -------------------------------------------------------------------------- */
/* So‘rovnoma va viktorina                                                    */
/* -------------------------------------------------------------------------- */

function ChoiceSticker({
  sticker,
  results,
  disabled,
  onPick,
}: {
  sticker: StorySticker;
  results?: StoryStickerResults;
  disabled?: boolean;
  onPick: (index: number) => void;
}) {
  const options = sticker.config.options ?? [];
  const isQuiz = sticker.type === 'quiz';

  const total = results?.total ?? 0;
  const myChoice = results?.myChoice ?? null;
  const answered = myChoice !== null && myChoice !== undefined;
  const correctIndex = isQuiz ? (sticker.config.correctIndex ?? results?.correctIndex ?? null) : null;

  const percentFor = (index: number) => {
    if (!results?.counts || total === 0) return 0;
    const count = results.counts[String(index)] ?? 0;
    return Math.round((count / total) * 100);
  };

  return (
    <div className="w-[13em] overflow-hidden rounded-[1.1em] bg-white/95 shadow-lg backdrop-blur">
      {sticker.config.prompt ? (
        <p className="px-[0.9em] pt-[0.7em] text-[0.62em] font-semibold leading-snug text-neutral-900">
          {sticker.config.prompt}
        </p>
      ) : null}

      <div className="space-y-[0.4em] p-[0.7em]">
        {options.map((option, index) => {
          const isMine = myChoice === index;
          const isCorrect = correctIndex === index;
          const showQuizVerdict = isQuiz && answered;
          const percent = percentFor(index);

          return (
            <button
              key={index}
              type="button"
              disabled={disabled || answered}
              onClick={() => onPick(index)}
              className={cn(
                'relative flex w-full items-center justify-between gap-[0.4em] overflow-hidden rounded-[0.7em] px-[0.7em] py-[0.45em] text-left text-[0.58em] font-medium transition',
                'bg-neutral-100 text-neutral-900',
                !answered && !disabled && 'hover:bg-neutral-200',
                showQuizVerdict && isCorrect && 'bg-emerald-100 text-emerald-900',
                showQuizVerdict && isMine && !isCorrect && 'bg-rose-100 text-rose-900',
              )}
            >
              {/* Natija ustuni — javob berilgandan keyin ko‘rinadi */}
              {answered && !isQuiz && (
                <span
                  aria-hidden
                  className="absolute inset-y-0 left-0 bg-primary/20 transition-[width] duration-500"
                  style={{ width: percent + '%' }}
                />
              )}

              <span className="relative z-[1] truncate">{option}</span>

              <span className="relative z-[1] flex shrink-0 items-center gap-[0.3em]">
                {showQuizVerdict && isCorrect && <Check className="h-[1em] w-[1em]" />}
                {showQuizVerdict && isMine && !isCorrect && <X className="h-[1em] w-[1em]" />}
                {answered && !isQuiz && <span>{percent}%</span>}
              </span>
            </button>
          );
        })}
      </div>

      {answered && (
        <p className="flex items-center gap-[0.3em] border-t border-neutral-200 px-[0.9em] py-[0.4em] text-[0.5em] text-neutral-500">
          <BarChart3 className="h-[1em] w-[1em]" />
          {total} ta ovoz
        </p>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Slayder                                                                    */
/* -------------------------------------------------------------------------- */

function SliderSticker({
  sticker,
  results,
  disabled,
  onCommit,
}: {
  sticker: StorySticker;
  results?: StoryStickerResults;
  disabled?: boolean;
  onCommit: (value: number) => void;
}) {
  const committed = results?.myValue ?? null;
  const [value, setValue] = useState<number>(committed ?? 50);
  const answered = committed !== null && committed !== undefined;

  // Natija keyin kelib qolsa, holatni moslashtiramiz.
  useEffect(() => {
    if (answered) setValue(committed as number);
  }, [answered, committed]);

  const emoji = sticker.config.emoji ?? '❤️';

  return (
    <div className="w-[13em] rounded-[1.1em] bg-white/95 p-[0.8em] shadow-lg backdrop-blur">
      {sticker.config.prompt ? (
        <p className="mb-[0.5em] text-[0.62em] font-semibold leading-snug text-neutral-900">
          {sticker.config.prompt}
        </p>
      ) : null}

      <div className="relative h-[1.6em]">
        <span
          aria-hidden
          className="absolute left-0 right-0 top-1/2 h-[0.35em] -translate-y-1/2 rounded-full bg-neutral-200"
        />
        <span
          aria-hidden
          className="absolute left-0 top-1/2 h-[0.35em] -translate-y-1/2 rounded-full bg-primary"
          style={{ width: value + '%' }}
        />
        <span
          aria-hidden
          className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 text-[1em] leading-none"
          style={{ left: value + '%' }}
        >
          {emoji}
        </span>

        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={value}
          disabled={disabled || answered}
          aria-label={sticker.config.prompt ?? 'Slayder'}
          onChange={(event) => setValue(Number(event.target.value))}
          onPointerUp={() => !answered && onCommit(value)}
          onKeyUp={(event) => {
            if (!answered && (event.key === 'Enter' || event.key.startsWith('Arrow'))) {
              onCommit(value);
            }
          }}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </div>

      <div className="mt-[0.35em] flex items-center justify-between text-[0.5em] text-neutral-500">
        <span className="truncate">{sticker.config.leftLabel}</span>
        {answered ? (
          <span className="font-medium text-neutral-700">
            O‘rtacha {results?.average ?? 0} · {results?.total ?? 0} kishi
          </span>
        ) : (
          <span>Sudrab javob bering</span>
        )}
        <span className="truncate">{sticker.config.rightLabel}</span>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Savol                                                                      */
/* -------------------------------------------------------------------------- */

function QuestionSticker({
  sticker,
  disabled,
  onSubmit,
}: {
  sticker: StorySticker;
  disabled?: boolean;
  onSubmit: (text: string) => void;
}) {
  const [text, setText] = useState('');
  const [sent, setSent] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  if (sent) {
    return (
      <div className="w-[13em] rounded-[1.1em] bg-white/95 p-[0.9em] text-center shadow-lg">
        <Check className="mx-auto mb-[0.3em] h-[1.2em] w-[1.2em] text-emerald-600" />
        <p className="text-[0.58em] font-medium text-neutral-700">Javobingiz yuborildi</p>
      </div>
    );
  }

  return (
    <div className="w-[13em] rounded-[1.1em] bg-white/95 p-[0.8em] shadow-lg backdrop-blur">
      <p className="mb-[0.5em] flex items-center gap-[0.35em] text-[0.62em] font-semibold text-neutral-900">
        <HelpCircle className="h-[1em] w-[1em] text-primary" />
        <span className="truncate">{sticker.config.prompt}</span>
      </p>

      <div className="flex items-center gap-[0.35em] rounded-[0.7em] bg-neutral-100 px-[0.6em] py-[0.35em]">
        <input
          ref={inputRef}
          value={text}
          disabled={disabled}
          maxLength={MAX_ANSWER_LENGTH}
          placeholder="Javob yozing..."
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && text.trim()) {
              onSubmit(text.trim());
              setSent(true);
            }
          }}
          className="min-w-0 flex-1 bg-transparent text-[0.56em] text-neutral-900 outline-none placeholder:text-neutral-400"
        />
        <button
          type="button"
          aria-label="Javobni yuborish"
          disabled={disabled || !text.trim()}
          onClick={() => {
            onSubmit(text.trim());
            setSent(true);
          }}
          className="flex h-[1.5em] w-[1.5em] shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-40"
        >
          <Send className="h-[0.8em] w-[0.8em]" />
        </button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Countdown                                                                  */
/* -------------------------------------------------------------------------- */

function CountdownSticker({ sticker }: { sticker: StorySticker }) {
  const target = useMemo(() => {
    const parsed = sticker.config.endsAt ? Date.parse(sticker.config.endsAt) : NaN;
    return Number.isFinite(parsed) ? parsed : null;
  }, [sticker.config.endsAt]);

  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  if (target === null) return null;

  const remaining = Math.max(0, target - now);
  const totalSeconds = Math.floor(remaining / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const pad = (value: number) => String(value).padStart(2, '0');

  return (
    <div className="w-[11em] rounded-[1.1em] bg-gradient-to-br from-fuchsia-500 to-orange-400 p-[0.8em] text-center text-white shadow-lg">
      {sticker.config.prompt ? (
        <p className="mb-[0.3em] truncate text-[0.55em] font-semibold uppercase tracking-wide opacity-90">
          {sticker.config.prompt}
        </p>
      ) : null}
      <p className="font-mono text-[0.9em] font-bold tabular-nums">
        {remaining === 0
          ? 'Tugadi'
          : (days > 0 ? days + 'k ' : '') + pad(hours) + ':' + pad(minutes) + ':' + pad(seconds)}
      </p>
      <p className="mt-[0.2em] flex items-center justify-center gap-[0.25em] text-[0.45em] opacity-90">
        <Clock className="h-[1em] w-[1em]" />
        Sanoq
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Oddiy chip ko‘rinishlar                                                    */
/* -------------------------------------------------------------------------- */

function Chip({
  icon: Icon,
  tone = 'light',
  children,
}: {
  icon?: typeof MapPin;
  tone?: 'light' | 'dark';
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex max-w-[14em] items-center gap-[0.35em] rounded-full px-[0.8em] py-[0.4em] text-[0.6em] font-semibold shadow-md backdrop-blur',
        tone === 'light' ? 'bg-white/95 text-neutral-900' : 'bg-black/70 text-white',
      )}
    >
      {Icon ? <Icon className="h-[1em] w-[1em] shrink-0" /> : null}
      {children}
    </span>
  );
}
