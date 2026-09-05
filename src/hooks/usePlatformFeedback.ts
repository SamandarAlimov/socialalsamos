import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import {
  collectFeedbackDiagnostics,
  isFeedbackBackendUnavailable,
  type FeedbackCategory,
  type PlatformFeedbackCase,
  type PlatformFeedbackMessage,
} from '@/lib/platformFeedback';

export interface SubmitFeedbackInput {
  category: FeedbackCategory;
  title: string;
  description: string;
  rating?: number | null;
  contactAllowed?: boolean;
  includeDiagnostics?: boolean;
  sourceRoute?: string | null;
  sourceUrl?: string | null;
  attachments?: string[];
}

export function usePlatformFeedback() {
  const { user } = useAuth();
  const [cases, setCases] = useState<PlatformFeedbackCase[]>([]);
  const [messages, setMessages] = useState<Record<string, PlatformFeedbackMessage[]>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [backendReady, setBackendReady] = useState(true);

  const fetchCases = useCallback(async () => {
    if (!user) {
      setCases([]);
      setMessages({});
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const result = await (supabase as any)
        .from('platform_feedback')
        .select('*')
        .eq('user_id', user.id)
        .order('last_activity_at', { ascending: false })
        .limit(100);

      if (result?.error) {
        if (isFeedbackBackendUnavailable(result.error)) {
          setBackendReady(false);
          setCases([]);
          return;
        }
        throw result.error;
      }

      setBackendReady(true);
      setCases((result.data || []) as PlatformFeedbackCase[]);
    } catch (error) {
      console.error('Feedback cases failed:', error);
      toast.error('Murojaatlarni yuklab bo‘lmadi');
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void fetchCases();
  }, [fetchCases]);

  const fetchMessages = useCallback(async (feedbackId: string) => {
    if (!feedbackId || !user || !backendReady) return [];
    try {
      const result = await (supabase as any)
        .from('platform_feedback_messages')
        .select('*')
        .eq('feedback_id', feedbackId)
        .order('created_at', { ascending: true });
      if (result?.error) throw result.error;
      const rows = (result.data || []) as PlatformFeedbackMessage[];
      setMessages((current) => ({ ...current, [feedbackId]: rows }));
      return rows;
    } catch (error) {
      console.error('Feedback conversation failed:', error);
      return [];
    }
  }, [backendReady, user]);

  const submitFeedback = useCallback(async (input: SubmitFeedbackInput) => {
    if (!user) return null;

    const sourceRoute = input.sourceRoute ?? (typeof window !== 'undefined' ? `${window.location.pathname}${window.location.search}` : null);
    const sourceUrl = input.sourceUrl ?? (typeof window !== 'undefined' ? window.location.href : null);
    const diagnostics = input.includeDiagnostics === false ? {} : collectFeedbackDiagnostics();

    try {
      const result = await (supabase as any).rpc('submit_platform_feedback', {
        p_category: input.category,
        p_title: input.title.trim(),
        p_description: input.description.trim(),
        p_rating: input.rating ?? null,
        p_contact_allowed: input.contactAllowed ?? true,
        p_source_route: sourceRoute,
        p_source_url: sourceUrl,
        p_diagnostics: diagnostics,
        p_attachments: input.attachments ?? [],
      });

      if (result?.error) {
        if (isFeedbackBackendUnavailable(result.error)) {
          setBackendReady(false);
          toast.error('Feedback markazi backend deployini kutmoqda');
          return null;
        }
        throw result.error;
      }

      const created = result.data as PlatformFeedbackCase;
      toast.success(`Murojaat yuborildi · ${created.reference_code}`);
      await fetchCases();
      return created;
    } catch (error) {
      console.error('Feedback submit failed:', error);
      toast.error('Feedbackni yuborib bo‘lmadi');
      return null;
    }
  }, [fetchCases, user]);

  const reply = useCallback(async (feedbackId: string, body: string) => {
    if (!user || !body.trim()) return false;
    try {
      const result = await (supabase as any).rpc('reply_platform_feedback', {
        p_feedback_id: feedbackId,
        p_body: body.trim(),
        p_internal: false,
      });
      if (result?.error) throw result.error;
      await Promise.all([fetchMessages(feedbackId), fetchCases()]);
      toast.success('Javob yuborildi');
      return true;
    } catch (error: any) {
      console.error('Feedback reply failed:', error);
      const message = String(error?.message || '');
      toast.error(message.includes('feedback_closed') ? 'Bu murojaat yopilgan' : 'Javobni yuborib bo‘lmadi');
      return false;
    }
  }, [fetchCases, fetchMessages, user]);

  return {
    cases,
    messages,
    isLoading,
    backendReady,
    refresh: fetchCases,
    fetchMessages,
    submitFeedback,
    reply,
  };
}
