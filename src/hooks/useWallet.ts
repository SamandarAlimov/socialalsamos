import { useCallback, useEffect, useMemo, useState } from 'react';
import { db } from '@/lib/db';
import { useAuth } from '@/contexts/AuthContext';

export interface WalletInfo {
  id: string;
  user_id: string;
  account_number: string;
  balance: number;
  currency: string;
  status: 'active' | 'restricted' | 'suspended' | 'closed';
  last_activity_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface WalletLedgerEntry {
  id: string;
  direction: 'credit' | 'debit';
  amount: number;
  currency: string;
  kind: string;
  status: 'pending' | 'completed' | 'failed' | 'reversed';
  description: string | null;
  counterparty_user_id: string | null;
  counterparty?: {
    username?: string | null;
    display_name?: string | null;
    avatar_url?: string | null;
  } | null;
  transfer_id: string | null;
  context_type: string | null;
  context_id: string | null;
  balance_after: number | null;
  created_at: string;
}

export interface WalletTopUpRequest {
  id: string;
  amount: number;
  currency: string;
  method: 'bank_transfer' | 'p2p_card' | 'cash_office';
  reference: string | null;
  note: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  review_note: string | null;
  created_at: string;
}

export interface WalletRecipient {
  found: boolean;
  user_id?: string;
  account_number?: string;
  username?: string | null;
  display_name?: string | null;
  avatar_url?: string | null;
}

export interface WalletTransferResult {
  success: boolean;
  duplicate?: boolean;
  transfer_id: string;
  amount: number;
  currency: string;
  sender_balance?: number;
  recipient_id: string;
  recipient_account?: string;
}

function toNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function walletError(error: unknown): string {
  const raw = String((error as any)?.message || error || '');
  if (raw.includes('insufficient_balance')) return 'Hisobda mablag‘ yetarli emas.';
  if (raw.includes('recipient_not_found')) return 'Qabul qiluvchi topilmadi.';
  if (raw.includes('cannot_transfer_to_self')) return 'O‘zingizga pul yubora olmaysiz.';
  if (raw.includes('currency_mismatch')) return 'Hisob valyutalari mos kelmaydi.';
  if (raw.includes('wallet_restricted')) return 'Hisoblardan biri vaqtincha cheklangan.';
  if (raw.includes('private_conversation_required')) return 'Pul faqat shaxsiy chat orqali yuboriladi.';
  if (raw.includes('amount_too_large')) return 'Kiritilgan summa ruxsat etilgan chegaradan katta.';
  if (raw.includes('too_many_pending_topups')) return 'Avvalgi to‘ldirish so‘rovlaringiz ko‘rib chiqilmoqda.';
  return 'Amal bajarilmadi. Qayta urinib ko‘ring.';
}

export function formatWalletAccount(value?: string | null) {
  if (!value) return '';
  const compact = value.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  if (!compact.startsWith('ALS')) return value;
  const body = compact.slice(3);
  const chunks = body.match(/.{1,4}/g) || [];
  return ['ALS', ...chunks].join(' ');
}

export function formatWalletMoney(amount: number, currency: string) {
  return new Intl.NumberFormat('uz-UZ', {
    style: 'currency',
    currency,
    maximumFractionDigits: currency === 'UZS' ? 0 : 2,
  }).format(amount);
}

export function useWallet() {
  const { user } = useAuth();
  const [wallet, setWallet] = useState<WalletInfo | null>(null);
  const [ledger, setLedger] = useState<WalletLedgerEntry[]>([]);
  const [topUps, setTopUps] = useState<WalletTopUpRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (silent = false) => {
    if (!user?.id) {
      setWallet(null);
      setLedger([]);
      setTopUps([]);
      setIsLoading(false);
      return;
    }

    if (silent) setIsRefreshing(true);
    else setIsLoading(true);
    setError(null);

    try {
      const { data: walletRow, error: walletErr } = await db
        .from('wallets')
        .select('id, user_id, account_number, balance, currency, status, last_activity_at, created_at, updated_at')
        .eq('user_id', user.id)
        .single();

      if (walletErr) throw walletErr;

      const nextWallet: WalletInfo = {
        ...walletRow,
        balance: toNumber(walletRow.balance),
      };
      setWallet(nextWallet);

      const [{ data: ledgerRows, error: ledgerErr }, { data: topupRows, error: topupErr }] = await Promise.all([
        db
          .from('wallet_ledger')
          .select('id, direction, amount, currency, kind, status, description, counterparty_user_id, transfer_id, context_type, context_id, balance_after, created_at')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(100),
        db
          .from('wallet_topup_requests')
          .select('id, amount, currency, method, reference, note, status, review_note, created_at')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(20),
      ]);

      if (ledgerErr) throw ledgerErr;
      if (topupErr) throw topupErr;

      const counterpartyIds = Array.from(
        new Set(
          (ledgerRows || [])
            .map((row: any) => row.counterparty_user_id)
            .filter(Boolean)
        )
      );

      const profileMap = new Map<string, any>();
      if (counterpartyIds.length > 0) {
        const { data: profiles } = await db
          .from('profiles')
          .select('id, username, display_name, avatar_url')
          .in('id', counterpartyIds);

        (profiles || []).forEach((profile: any) => profileMap.set(profile.id, profile));
      }

      setLedger(
        (ledgerRows || []).map((row: any) => ({
          ...row,
          amount: toNumber(row.amount),
          balance_after: row.balance_after == null ? null : toNumber(row.balance_after),
          counterparty: row.counterparty_user_id
            ? profileMap.get(row.counterparty_user_id) || null
            : null,
        }))
      );

      setTopUps(
        (topupRows || []).map((row: any) => ({
          ...row,
          amount: toNumber(row.amount),
        }))
      );
    } catch (err) {
      console.error('Wallet refresh failed', err);
      setError(walletError(err));
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [user?.id]);

  useEffect(() => {
    void refresh();

    if (!user?.id) return;

    const channel = db
      .channel('wallet:' + user.id)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'wallets', filter: 'user_id=eq.' + user.id },
        () => void refresh(true)
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'wallet_ledger', filter: 'user_id=eq.' + user.id },
        () => void refresh(true)
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'wallet_topup_requests', filter: 'user_id=eq.' + user.id },
        () => void refresh(true)
      )
      .subscribe();

    return () => {
      void db.removeChannel(channel);
    };
  }, [refresh, user?.id]);

  const lookupRecipient = useCallback(async (identifier: string): Promise<WalletRecipient> => {
    const { data, error } = await db.rpc('wallet_lookup_recipient', {
      _identifier: identifier.trim(),
    });
    if (error) throw new Error(walletError(error));
    return (data || { found: false }) as WalletRecipient;
  }, []);

  const transfer = useCallback(async (args: {
    recipient: string;
    amount: number;
    note?: string;
    idempotencyKey: string;
  }): Promise<WalletTransferResult> => {
    const { data, error } = await db.rpc('wallet_transfer', {
      _recipient: args.recipient.trim(),
      _amount: args.amount,
      _note: args.note?.trim() || null,
      _idempotency_key: args.idempotencyKey,
      _context_type: 'p2p',
      _context_id: null,
    });
    if (error) throw new Error(walletError(error));
    await refresh(true);
    return data as WalletTransferResult;
  }, [refresh]);

  const transferToConversation = useCallback(async (args: {
    conversationId: string;
    amount: number;
    note?: string;
    idempotencyKey: string;
  }): Promise<WalletTransferResult> => {
    const { data, error } = await db.rpc('wallet_transfer_to_conversation', {
      _conversation_id: args.conversationId,
      _amount: args.amount,
      _note: args.note?.trim() || null,
      _idempotency_key: args.idempotencyKey,
    });
    if (error) throw new Error(walletError(error));
    await refresh(true);
    return data as WalletTransferResult;
  }, [refresh]);

  const requestTopUp = useCallback(async (args: {
    amount: number;
    method: WalletTopUpRequest['method'];
    reference?: string;
    note?: string;
  }) => {
    const { data, error } = await db.rpc('request_wallet_topup', {
      _amount: args.amount,
      _method: args.method,
      _reference: args.reference?.trim() || null,
      _proof_url: null,
      _note: args.note?.trim() || null,
    });
    if (error) throw new Error(walletError(error));
    await refresh(true);
    return data;
  }, [refresh]);

  const cancelTopUp = useCallback(async (requestId: string) => {
    const { data, error } = await db.rpc('cancel_wallet_topup', {
      _request_id: requestId,
    });
    if (error) throw new Error(walletError(error));
    await refresh(true);
    return data;
  }, [refresh]);

  const pendingTopUps = useMemo(
    () => topUps.filter((item) => item.status === 'pending'),
    [topUps]
  );

  return {
    wallet,
    ledger,
    topUps,
    pendingTopUps,
    isLoading,
    isRefreshing,
    error,
    refresh,
    lookupRecipient,
    transfer,
    transferToConversation,
    requestTopUp,
    cancelTopUp,
  };
}

export default useWallet;
