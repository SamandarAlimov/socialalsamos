import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import type {
  AIClarificationQuestion,
  AIClarificationRequest,
} from '@/lib/ai/capabilities';

export type AIClarificationAnswers = Record<string, string | string[]>;

type DraftAnswer = {
  selected: string[];
  custom: string;
};

interface Props {
  request: AIClarificationRequest | null;
  submitting?: boolean;
  onClose: () => void;
  onSubmit: (answers: AIClarificationAnswers) => void | Promise<void>;
}

function initialDraft(question: AIClarificationQuestion): DraftAnswer {
  return { selected: [], custom: '' };
}

function answerFor(question: AIClarificationQuestion, draft: DraftAnswer): string | string[] {
  const custom = draft.custom.trim();
  if (question.type === 'text') return custom;
  if (question.type === 'single') return custom || draft.selected[0] || '';
  return [...draft.selected, ...(custom ? [custom] : [])];
}

function hasAnswer(question: AIClarificationQuestion, draft: DraftAnswer): boolean {
  const answer = answerFor(question, draft);
  return Array.isArray(answer) ? answer.length > 0 : Boolean(answer.trim());
}

export function AIClarificationDialog({
  request,
  submitting = false,
  onClose,
  onSubmit,
}: Props) {
  const [step, setStep] = useState(0);
  const [drafts, setDrafts] = useState<Record<string, DraftAnswer>>({});

  useEffect(() => {
    if (!request) return;
    setStep(0);
    setDrafts(
      Object.fromEntries(
        request.questions.map((question) => [question.id, initialDraft(question)]),
      ),
    );
  }, [request?.id]);

  const questions = request?.questions ?? [];
  const question = questions[step] ?? null;
  const draft = question ? drafts[question.id] ?? initialDraft(question) : null;
  const total = questions.length;
  const isLast = step === total - 1;
  const canAdvance = Boolean(
    question &&
      (!question.required || (draft && hasAnswer(question, draft))),
  );

  const answers = useMemo<AIClarificationAnswers>(() => {
    if (!request) return {};
    return Object.fromEntries(
      request.questions.map((item) => [
        item.id,
        answerFor(item, drafts[item.id] ?? initialDraft(item)),
      ]),
    );
  }, [drafts, request]);

  if (!request || !question || !draft) return null;

  const updateDraft = (next: Partial<DraftAnswer>) => {
    setDrafts((previous) => ({
      ...previous,
      [question.id]: {
        ...(previous[question.id] ?? initialDraft(question)),
        ...next,
      },
    }));
  };

  const chooseSingle = (value: string) => {
    updateDraft({ selected: [value], custom: '' });
  };

  const toggleMulti = (value: string) => {
    const selected = draft.selected.includes(value)
      ? draft.selected.filter((item) => item !== value)
      : [...draft.selected, value];
    updateDraft({ selected });
  };

  const submit = async () => {
    if (!canAdvance || submitting) return;
    if (!isLast) {
      setStep((value) => Math.min(value + 1, total - 1));
      return;
    }
    await onSubmit(answers);
  };

  return (
    <Dialog open={Boolean(request)} onOpenChange={(open) => !open && !submitting && onClose()}>
      <DialogContent
        className="w-[calc(100vw-1rem)] max-w-xl gap-0 overflow-hidden rounded-[28px] border-border/70 bg-background p-0 shadow-2xl sm:w-full"
        onInteractOutside={(event) => {
          if (submitting) event.preventDefault();
        }}
        onEscapeKeyDown={(event) => {
          if (submitting) event.preventDefault();
        }}
      >
        <div className="border-b border-border/50 px-5 pb-4 pt-5 sm:px-7">
          <div className="mb-5 flex items-center gap-3 pr-8">
            <button
              type="button"
              onClick={() => setStep((value) => Math.max(0, value - 1))}
              disabled={step === 0 || submitting}
              className="grid h-9 w-9 place-items-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-25"
              aria-label="Oldingi savol"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <span className="text-sm font-semibold tabular-nums text-muted-foreground">
              {step + 1} of {total}
            </span>
            <button
              type="button"
              onClick={() => setStep((value) => Math.min(total - 1, value + 1))}
              disabled={step >= total - 1 || submitting}
              className="grid h-9 w-9 place-items-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-25"
              aria-label="Keyingi savol"
            >
              <ArrowRight className="h-5 w-5" />
            </button>
          </div>

          <DialogTitle className="text-balance text-2xl font-semibold leading-tight sm:text-[28px]">
            {question.question}
          </DialogTitle>
          {(request.message || question.required === false) && (
            <DialogDescription className="mt-2 text-sm leading-relaxed">
              {request.message || 'Bu savol ixtiyoriy.'}
            </DialogDescription>
          )}
        </div>

        <div className="max-h-[60dvh] overflow-y-auto px-5 py-4 sm:px-7">
          {question.type === 'text' ? (
            <Textarea
              autoFocus
              value={draft.custom}
              onChange={(event) => updateDraft({ custom: event.target.value })}
              placeholder={question.placeholder || 'Javobingizni yozing…'}
              className="min-h-32 resize-none rounded-2xl text-base"
              disabled={submitting}
            />
          ) : (
            <div className="divide-y divide-border/60">
              {(question.options ?? []).map((option) => {
                const active = draft.selected.includes(option.value);
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() =>
                      question.type === 'single'
                        ? chooseSingle(option.value)
                        : toggleMulti(option.value)
                    }
                    disabled={submitting}
                    className="flex w-full items-start gap-4 py-4 text-left transition hover:bg-muted/35 disabled:opacity-60"
                  >
                    <span
                      className={cn(
                        'mt-0.5 grid h-8 w-8 shrink-0 place-items-center border text-transparent transition',
                        question.type === 'single' ? 'rounded-full' : 'rounded-xl',
                        active
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border bg-background',
                      )}
                    >
                      <Check className="h-5 w-5" strokeWidth={2.5} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-base font-medium leading-snug sm:text-[17px]">
                        {option.label}
                      </span>
                      {option.description && (
                        <span className="mt-1 block text-sm leading-relaxed text-muted-foreground">
                          {option.description}
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}

              <div className="py-4">
                <Input
                  value={draft.custom}
                  onChange={(event) =>
                    updateDraft({
                      custom: event.target.value,
                      ...(question.type === 'single' && event.target.value
                        ? { selected: [] }
                        : {}),
                    })
                  }
                  placeholder={question.placeholder || 'Boshqa javob…'}
                  className="h-12 border-0 bg-transparent px-0 text-base shadow-none focus-visible:ring-0"
                  disabled={submitting}
                />
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-border/50 px-5 py-4 sm:px-7">
          <Button
            type="button"
            size="lg"
            onClick={() => void submit()}
            disabled={!canAdvance || submitting}
            className="min-w-36 rounded-full px-6"
          >
            {submitting ? 'Davom etmoqda…' : isLast ? 'Yuborish' : 'Keyingi'}
            {!submitting && <ArrowRight className="ml-2 h-4 w-4" />}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
