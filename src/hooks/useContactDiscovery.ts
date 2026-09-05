import { useCallback, useEffect, useMemo, useState } from 'react';

import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/db';

export interface ContactDiscoveryMatch {
  user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  matched_by: 'phone' | 'email' | 'saved';
  is_following: boolean;
  mutual_count: number;
  last_seen_at?: string | null;
}

export interface DeviceContactInput {
  name?: string[];
  tel?: string[];
  email?: string[];
}

type ContactsNavigator = Navigator & {
  contacts?: {
    select(
      properties: Array<'name' | 'tel' | 'email'>,
      options?: { multiple?: boolean },
    ): Promise<DeviceContactInput[]>;
    getProperties?(): Promise<string[]>;
  };
};

function normalizePhone(value: string) {
  const digits = value.replace(/[^0-9]/g, '');
  if (digits.length < 7 || digits.length > 18) return null;
  return digits.startsWith('00') ? digits.slice(2) : digits;
}

function normalizeEmail(value: string) {
  const email = value.trim().toLowerCase();
  if (!email || email.length > 320 || !email.includes('@')) return null;
  return email;
}

async function sha256Hex(value: string) {
  if (!globalThis.crypto?.subtle) throw new Error('secure_context_required');
  const bytes = new TextEncoder().encode(value);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function parseManualContacts(text: string) {
  const phoneValues = new Set<string>();
  const emailValues = new Set<string>();

  // One line may contain a name plus phone/email. We deliberately do not keep
  // the name: only normalized contact points are hashed in memory and sent.
  for (const line of text.split(/[\n,;]+/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const emailCandidates = trimmed.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
    emailCandidates.forEach((value) => {
      const normalized = normalizeEmail(value);
      if (normalized) emailValues.add(normalized);
    });

    const phoneCandidates = trimmed.match(/\+?[0-9][0-9\s().-]{5,}[0-9]/g) || [];
    phoneCandidates.forEach((value) => {
      const normalized = normalizePhone(value);
      if (normalized) phoneValues.add(normalized);
    });
  }

  return { phoneValues, emailValues };
}

function friendlyError(error: unknown) {
  const raw = String((error as any)?.message || error || '').toLowerCase();
  if (raw.includes('rate_limited')) return 'Juda ko‘p urinish bo‘ldi. Birozdan keyin qayta sinang.';
  if (raw.includes('batch_too_large')) return 'Bir martada juda ko‘p kontakt tanlandi.';
  if (raw.includes('secure_context')) return 'Kontaktlarni xavfsiz tekshirish uchun HTTPS kerak.';
  if (raw.includes('notallowed') || raw.includes('permission')) return 'Kontaktlarga ruxsat berilmadi.';
  return 'Kontaktlarni hozir tekshirib bo‘lmadi.';
}

export function useContactDiscovery() {
  const { user } = useAuth();
  const [matches, setMatches] = useState<ContactDiscoveryMatch[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingSaved, setIsLoadingSaved] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const contactPickerSupported = useMemo(() => {
    if (typeof navigator === 'undefined' || !globalThis.isSecureContext) return false;
    return typeof (navigator as ContactsNavigator).contacts?.select === 'function';
  }, []);

  const loadSavedSuggestions = useCallback(async () => {
    if (!user?.id) {
      setMatches([]);
      setIsLoadingSaved(false);
      return;
    }

    setIsLoadingSaved(true);
    try {
      const { data, error: rpcError } = await db.rpc('my_contact_suggestions', { p_limit: 30 });
      if (rpcError) {
        const raw = String(rpcError.message || '').toLowerCase();
        // Migration may not be deployed yet. Keep Discover usable until Lovable
        // applies it instead of surfacing a global error.
        if (raw.includes('could not find') || raw.includes('schema cache') || raw.includes('42883')) {
          setMatches([]);
          return;
        }
        throw rpcError;
      }
      setMatches(
        ((data || []) as any[]).map((item) => ({
          user_id: String(item.user_id),
          username: item.username ?? null,
          display_name: item.display_name ?? null,
          avatar_url: item.avatar_url ?? null,
          matched_by: 'saved' as const,
          is_following: Boolean(item.is_following),
          mutual_count: Number(item.mutual_count || 0),
          last_seen_at: item.last_seen_at ?? null,
        })),
      );
    } catch (loadError) {
      console.warn('Contact suggestions unavailable', loadError);
    } finally {
      setIsLoadingSaved(false);
    }
  }, [user?.id]);

  useEffect(() => {
    void loadSavedSuggestions();
  }, [loadSavedSuggestions]);

  const syncNormalized = useCallback(async (phones: Iterable<string>, emails: Iterable<string>) => {
    if (!user?.id) throw new Error('auth_required');

    const normalizedPhones = Array.from(new Set(Array.from(phones).map(normalizePhone).filter(Boolean))) as string[];
    const normalizedEmails = Array.from(new Set(Array.from(emails).map(normalizeEmail).filter(Boolean))) as string[];
    if (normalizedPhones.length + normalizedEmails.length === 0) {
      setError('Tekshirish uchun telefon yoki email topilmadi.');
      return [];
    }

    setIsLoading(true);
    setError(null);
    try {
      // Hashing happens before the request. Raw device contact values never
      // leave this browser context.
      const [phoneHashes, emailHashes] = await Promise.all([
        Promise.all(normalizedPhones.slice(0, 500).map(sha256Hex)),
        Promise.all(normalizedEmails.slice(0, 500).map(sha256Hex)),
      ]);

      const { data, error: rpcError } = await db.rpc('sync_my_contact_hashes', {
        p_phone_hashes: phoneHashes,
        p_email_hashes: emailHashes,
      });
      if (rpcError) throw rpcError;

      const next = ((data || []) as any[]).map((item) => ({
        user_id: String(item.user_id),
        username: item.username ?? null,
        display_name: item.display_name ?? null,
        avatar_url: item.avatar_url ?? null,
        matched_by: item.matched_by === 'email' ? ('email' as const) : ('phone' as const),
        is_following: Boolean(item.is_following),
        mutual_count: Number(item.mutual_count || 0),
      }));
      setMatches(next);
      return next;
    } catch (syncError) {
      console.error('Contact discovery failed', syncError);
      setError(friendlyError(syncError));
      return [];
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  const pickAndSync = useCallback(async () => {
    const contacts = (navigator as ContactsNavigator).contacts;
    if (!contacts?.select) {
      setError('Bu brauzer device contact picker’ni qo‘llamaydi. Qo‘lda telefon/email kiritishingiz mumkin.');
      return [];
    }

    try {
      const selected = await contacts.select(['name', 'tel', 'email'], { multiple: true });
      const phones = new Set<string>();
      const emails = new Set<string>();
      selected.slice(0, 500).forEach((contact) => {
        (contact.tel || []).forEach((value) => phones.add(value));
        (contact.email || []).forEach((value) => emails.add(value));
      });
      return await syncNormalized(phones, emails);
    } catch (pickerError) {
      const raw = String((pickerError as any)?.name || (pickerError as any)?.message || pickerError);
      if (!/abort/i.test(raw)) setError(friendlyError(pickerError));
      return [];
    }
  }, [syncNormalized]);

  const syncManual = useCallback(async (text: string) => {
    const parsed = parseManualContacts(text);
    return syncNormalized(parsed.phoneValues, parsed.emailValues);
  }, [syncNormalized]);

  const forgetMatches = useCallback(async () => {
    if (!user?.id) return;
    setError(null);
    const { error: deleteError } = await db
      .from('contact_discovery_matches')
      .delete()
      .eq('owner_user_id', user.id);
    if (deleteError) {
      setError(friendlyError(deleteError));
      return;
    }
    setMatches([]);
  }, [user?.id]);

  return {
    matches,
    isLoading,
    isLoadingSaved,
    error,
    contactPickerSupported,
    pickAndSync,
    syncManual,
    forgetMatches,
    refresh: loadSavedSuggestions,
  };
}
