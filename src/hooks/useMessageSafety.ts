import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

export type ReportReason =
  | 'spam'
  | 'harassment'
  | 'scam'
  | 'inappropriate'
  | 'impersonation'
  | 'other';

// PII patterns: card numbers (13-19 digits, spaces/dashes tolerated) and password-like leaks.
const CARD_RE = /\b(?:\d[ -]?){13,19}\b/;
const PASSWORD_HINT_RE = /(?:parol|password|pin[- ]?kod)\s*[:=]\s*\S{4,}/i;
const CVV_RE = /\bcvv2?\s*[:=]?\s*\d{3,4}\b/i;

export function detectPII(text: string): { type: 'card' | 'password' | 'cvv'; hint: string } | null {
  if (!text) return null;
  if (CARD_RE.test(text)) return { type: 'card', hint: 'Karta raqami aniqlandi' };
  if (CVV_RE.test(text)) return { type: 'cvv', hint: 'CVV kod aniqlandi' };
  if (PASSWORD_HINT_RE.test(text)) return { type: 'password', hint: 'Parol/PIN aniqlandi' };
  return null;
}

export function useBlockedUsers() {
  const { user } = useAuth();
  const [blockedIds, setBlockedIds] = useState<Set<string>>(new Set());

  const refresh = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('blocked_users')
      .select('blocked_id')
      .eq('blocker_id', user.id);
    setBlockedIds(new Set((data || []).map((r: any) => r.blocked_id)));
  }, [user]);

  useEffect(() => { refresh(); }, [refresh]);
  return { blockedIds, isBlocked: (id: string) => blockedIds.has(id), refresh };
}

export function useMessageSafety() {
  const { user } = useAuth();
  const { toast } = useToast();

  const block = useCallback(async (targetId: string, reason?: string) => {
    if (!user) return false;
    const { error } = await supabase.rpc('block_user', { _target: targetId, _reason: reason ?? null });
    if (error) {
      toast({ title: "Xato", description: error.message, variant: 'destructive' });
      return false;
    }
    toast({ title: 'Bloklandi', description: "Foydalanuvchi endi sizga yoza olmaydi." });
    return true;
  }, [user, toast]);

  const unblock = useCallback(async (targetId: string) => {
    const { error } = await supabase.rpc('unblock_user', { _target: targetId });
    if (error) {
      toast({ title: "Xato", description: error.message, variant: 'destructive' });
      return false;
    }
    toast({ title: 'Blok olib tashlandi' });
    return true;
  }, [toast]);

  const report = useCallback(async (params: {
    userId?: string;
    conversationId?: string;
    messageId?: string;
    reason: ReportReason;
    details?: string;
  }) => {
    const { error } = await supabase.rpc('report_content', {
      _target_user_id: params.userId ?? null,
      _target_conversation_id: params.conversationId ?? null,
      _target_message_id: params.messageId ?? null,
      _reason: params.reason,
      _details: params.details ?? null,
    });
    if (error) {
      toast({ title: "Xato", description: error.message, variant: 'destructive' });
      return false;
    }
    toast({ title: 'Shikoyat yuborildi', description: "Moderatorlar tez orada ko'rib chiqadi." });
    return true;
  }, [toast]);

  const respondToRequest = useCallback(async (conversationId: string, accept: boolean) => {
    const { error } = await supabase.rpc('respond_to_message_request', {
      _conversation_id: conversationId,
      _accept: accept,
    });
    if (error) {
      toast({ title: "Xato", description: error.message, variant: 'destructive' });
      return false;
    }
    toast({ title: accept ? "So'rov qabul qilindi" : "So'rov rad etildi" });
    return true;
  }, [toast]);

  return { block, unblock, report, respondToRequest };
}
