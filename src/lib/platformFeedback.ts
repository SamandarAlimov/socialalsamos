export type FeedbackCategory =
  | 'bug'
  | 'feature'
  | 'experience'
  | 'content'
  | 'safety'
  | 'payments'
  | 'marketplace'
  | 'other';

export type FeedbackStatus =
  | 'new'
  | 'triaged'
  | 'in_progress'
  | 'waiting_user'
  | 'resolved'
  | 'closed';

export type FeedbackPriority = 'low' | 'normal' | 'high' | 'urgent';

export interface PlatformFeedbackCase {
  id: string;
  reference_code: string;
  user_id: string;
  category: FeedbackCategory;
  status: FeedbackStatus;
  priority: FeedbackPriority;
  title: string;
  description: string;
  rating: number | null;
  contact_allowed: boolean;
  source_route: string | null;
  source_url: string | null;
  diagnostics: Record<string, unknown>;
  attachments: string[];
  assigned_to: string | null;
  resolution_note: string | null;
  last_response_by: 'user' | 'staff' | null;
  last_activity_at: string;
  created_at: string;
  updated_at: string;
}

export interface PlatformFeedbackMessage {
  id: string;
  feedback_id: string;
  author_user_id: string | null;
  author_role: 'user' | 'staff';
  body: string;
  is_internal: boolean;
  created_at: string;
}

export const FEEDBACK_CATEGORIES: Array<{
  id: FeedbackCategory;
  label: string;
  description: string;
}> = [
  { id: 'bug', label: 'Xatolik', description: 'Ishlamayotgan yoki noto‘g‘ri ishlayotgan funksiya' },
  { id: 'feature', label: 'Taklif', description: 'Yangi imkoniyat yoki mahsulot g‘oyasi' },
  { id: 'experience', label: 'Tajriba', description: 'Qulaylik, dizayn yoki umumiy taassurot' },
  { id: 'content', label: 'Kontent', description: 'Kontent sifati yoki boshqaruviga oid fikr' },
  { id: 'safety', label: 'Xavfsizlik', description: 'Xavfsizlik, zarar yoki jiddiy policy muammosi' },
  { id: 'payments', label: 'To‘lov', description: 'Hamyon, payment yoki tranzaksiya muammosi' },
  { id: 'marketplace', label: 'Marketplace', description: 'Sotuv, buyurtma yoki seller tajribasi' },
  { id: 'other', label: 'Boshqa', description: 'Yuqoridagilarga kirmaydigan murojaat' },
];

export const FEEDBACK_STATUS_META: Record<FeedbackStatus, { label: string; tone: string }> = {
  new: { label: 'Yangi', tone: 'bg-blue-500/10 text-blue-700 dark:text-blue-300' },
  triaged: { label: 'Ko‘rib chiqildi', tone: 'bg-violet-500/10 text-violet-700 dark:text-violet-300' },
  in_progress: { label: 'Jarayonda', tone: 'bg-amber-500/10 text-amber-700 dark:text-amber-300' },
  waiting_user: { label: 'Javobingiz kutilmoqda', tone: 'bg-orange-500/10 text-orange-700 dark:text-orange-300' },
  resolved: { label: 'Hal qilindi', tone: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' },
  closed: { label: 'Yopildi', tone: 'bg-muted text-muted-foreground' },
};

export const FEEDBACK_PRIORITY_META: Record<FeedbackPriority, { label: string; tone: string }> = {
  low: { label: 'Past', tone: 'text-muted-foreground' },
  normal: { label: 'Normal', tone: 'text-foreground' },
  high: { label: 'Yuqori', tone: 'text-amber-700 dark:text-amber-300' },
  urgent: { label: 'Shoshilinch', tone: 'text-destructive' },
};

export function getFeedbackCategoryLabel(category: FeedbackCategory): string {
  return FEEDBACK_CATEGORIES.find((item) => item.id === category)?.label ?? category;
}

export function collectFeedbackDiagnostics(): Record<string, unknown> {
  if (typeof window === 'undefined') return {};

  const nav = navigator as Navigator & {
    deviceMemory?: number;
    connection?: { effectiveType?: string; downlink?: number; rtt?: number; saveData?: boolean };
  };

  return {
    user_agent: navigator.userAgent,
    language: navigator.language,
    languages: navigator.languages,
    platform: navigator.platform,
    online: navigator.onLine,
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
      pixel_ratio: window.devicePixelRatio,
    },
    screen: {
      width: window.screen?.width,
      height: window.screen?.height,
    },
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    device_memory_gb: nav.deviceMemory ?? null,
    connection: nav.connection
      ? {
          effective_type: nav.connection.effectiveType ?? null,
          downlink: nav.connection.downlink ?? null,
          rtt: nav.connection.rtt ?? null,
          save_data: nav.connection.saveData ?? null,
        }
      : null,
    captured_at: new Date().toISOString(),
  };
}

export function isFeedbackBackendUnavailable(error: unknown): boolean {
  const value = error as { code?: string; message?: string; details?: string } | null;
  const text = `${value?.code ?? ''} ${value?.message ?? ''} ${value?.details ?? ''}`.toLowerCase();
  return (
    text.includes('42p01') ||
    text.includes('42883') ||
    text.includes('platform_feedback') ||
    text.includes('submit_platform_feedback') ||
    text.includes('reply_platform_feedback')
  );
}
