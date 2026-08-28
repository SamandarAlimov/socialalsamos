import { db } from '@/lib/db';

export interface PollOptionInput {
  label: string;
  emoji?: string | null;
  imageUrl?: string | null;
}

export interface PollInput {
  question: string;
  options: PollOptionInput[];
  allowMultiple?: boolean;
  maxChoices?: number | null;
  isAnonymous?: boolean;
  showResultsBeforeVote?: boolean;
  quizMode?: boolean;
  /** To'g'ri javob indeksi (quiz rejimi uchun). */
  correctOptionIndex?: number | null;
  explanation?: string | null;
  /** Yakunlanish vaqti; null = cheksiz. */
  closesAt?: string | null;
}

export interface PollOption {
  id: string;
  position: number;
  label: string;
  emoji: string | null;
  image_url: string | null;
  votes_count: number;
}

export interface Poll {
  id: string;
  post_id: string;
  question: string;
  allow_multiple: boolean;
  max_choices: number | null;
  is_anonymous: boolean;
  show_results_before_vote: boolean;
  quiz_mode: boolean;
  correct_option_id: string | null;
  explanation: string | null;
  closes_at: string | null;
  total_votes: number;
  total_voters: number;
  created_at: string;
  options: PollOption[];
  /** Joriy foydalanuvchi tanlagan variantlar. */
  myVotes: string[];
}

export const POLL_MIN_OPTIONS = 2;
export const POLL_MAX_OPTIONS = 12;

export function validatePoll(input: PollInput): string | null {
  if (!input.question.trim()) return 'So\u2018rovnoma savolini yozing';

  const filled = input.options.filter((option) => option.label.trim().length > 0);
  if (filled.length < POLL_MIN_OPTIONS) return 'Kamida 2 ta variant kerak';
  if (filled.length > POLL_MAX_OPTIONS) return `Eng ko\u2018pi bilan ${POLL_MAX_OPTIONS} ta variant`;

  const unique = new Set(filled.map((option) => option.label.trim().toLowerCase()));
  if (unique.size !== filled.length) return 'Variantlar takrorlanmasligi kerak';

  if (input.quizMode && (input.correctOptionIndex === null || input.correctOptionIndex === undefined)) {
    return 'Viktorina uchun to\u2018g\u2018ri javobni belgilang';
  }

  return null;
}

/** Post uchun so'rovnoma yaratadi va variant id larini qaytaradi. */
export async function createPollForPost(postId: string, input: PollInput): Promise<string> {
  const options = input.options
    .map((option, index) => ({ ...option, index }))
    .filter((option) => option.label.trim().length > 0);

  const { data: poll, error: pollError } = await db
    .from('polls')
    .insert({
      post_id: postId,
      question: input.question.trim(),
      allow_multiple: input.allowMultiple ?? false,
      max_choices: input.allowMultiple ? (input.maxChoices ?? null) : null,
      is_anonymous: input.isAnonymous ?? false,
      show_results_before_vote: input.showResultsBeforeVote ?? false,
      quiz_mode: input.quizMode ?? false,
      explanation: input.explanation ?? null,
      closes_at: input.closesAt ?? null,
    })
    .select('id')
    .single();

  if (pollError) throw pollError;

  const { data: insertedOptions, error: optionsError } = await db
    .from('poll_options')
    .insert(
      options.map((option, position) => ({
        poll_id: poll.id,
        position,
        label: option.label.trim(),
        emoji: option.emoji ?? null,
        image_url: option.imageUrl ?? null,
      })),
    )
    .select('id, position');

  if (optionsError) throw optionsError;

  if (input.quizMode && input.correctOptionIndex !== null && input.correctOptionIndex !== undefined) {
    const targetPosition = options.findIndex((option) => option.index === input.correctOptionIndex);
    const correct = (insertedOptions ?? []).find(
      (option: { position: number }) => option.position === targetPosition,
    );

    if (correct) {
      const { error } = await db
        .from('polls')
        .update({ correct_option_id: correct.id })
        .eq('id', poll.id);
      if (error) throw error;
    }
  }

  return poll.id as string;
}

/** Post bo'yicha so'rovnomani ovozlar bilan yuklaydi. */
export async function fetchPollByPostId(postId: string, userId?: string | null): Promise<Poll | null> {
  const { data, error } = await db
    .from('polls')
    .select('*, options:poll_options(id, position, label, emoji, image_url, votes_count)')
    .eq('post_id', postId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  let myVotes: string[] = [];
  if (userId) {
    const { data: votes } = await db
      .from('poll_votes')
      .select('option_id')
      .eq('poll_id', data.id)
      .eq('user_id', userId);
    myVotes = (votes ?? []).map((vote: { option_id: string }) => vote.option_id);
  }

  const options = ((data.options ?? []) as PollOption[]).sort((a, b) => a.position - b.position);

  return { ...(data as Poll), options, myVotes };
}

export function isPollClosed(poll: Pick<Poll, 'closes_at'>): boolean {
  return Boolean(poll.closes_at && new Date(poll.closes_at).getTime() <= Date.now());
}

/** Natijalarni ko'rsatish mumkinmi. */
export function canSeeResults(poll: Poll): boolean {
  return poll.show_results_before_vote || poll.myVotes.length > 0 || isPollClosed(poll);
}

export function optionPercent(poll: Poll, option: PollOption): number {
  const base = poll.allow_multiple ? poll.total_voters : poll.total_votes;
  if (!base) return 0;
  return Math.round((option.votes_count / base) * 100);
}

/** Ovoz berish. Bir tanlovli so'rovnomada avvalgi ovoz almashtiriladi. */
export async function castVote(poll: Poll, optionId: string, userId: string): Promise<void> {
  if (isPollClosed(poll)) throw new Error('So\u2018rovnoma yakunlangan');

  const alreadyVoted = poll.myVotes.includes(optionId);

  if (alreadyVoted) {
    const { error } = await db
      .from('poll_votes')
      .delete()
      .eq('option_id', optionId)
      .eq('user_id', userId);
    if (error) throw error;
    return;
  }

  if (!poll.allow_multiple && poll.myVotes.length > 0) {
    const { error } = await db
      .from('poll_votes')
      .delete()
      .eq('poll_id', poll.id)
      .eq('user_id', userId);
    if (error) throw error;
  }

  const { error } = await db
    .from('poll_votes')
    .insert({ poll_id: poll.id, option_id: optionId, user_id: userId });

  if (error) throw error;
}

/** Muddat presetlaridan `closes_at` hosil qilish. */
export function closesAtFromMinutes(minutes: number | null): string | null {
  if (!minutes || minutes <= 0) return null;
  return new Date(Date.now() + minutes * 60_000).toISOString();
}
