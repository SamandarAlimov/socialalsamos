import { db } from '@/lib/db';
/**
 * Multi-account support for one Alsamos identity.
 *
 * The account list comes from the database (`identity_accounts`, protected by
 * RLS so only sibling accounts of the same identity are visible). Sessions
 * live in per-slot cookies; this hook never reads or writes tokens itself,
 * which is the key difference from the previous localStorage implementation.
 *
 * Agar multi-account migratsiyasi hali qo'llanmagan bo'lsa (`identity_accounts`
 * jadvali yo'q → PostgREST `PGRST205` / 404), hook jimgina "funksiya mavjud emas"
 * holatiga o'tadi: konsolga xato yozilmaydi va UI'da xato ko'rsatilmaydi.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import {
  AlsamosAuthError,
  authErrorMessage,
  directPasswordLogin,
  MAX_ACCOUNTS_PER_IDENTITY,
  requestAccountCreate,
  requestAccountRevoke,
  requestAccountSession,
  requestLoginTicket,
} from '@/lib/alsamosAuth';
import {
  clearSlot,
  firstFreeSlot,
  getActiveSlot,
  occupiedSlots,
  readAccountMeta,
  rememberAccountMeta,
  removeAccountMeta,
  setActiveSlot,
  touchAccountMeta,
  writeAccountMeta,
} from '@/lib/accountSlots';

export type LinkedAccount = {
  id: string;
  userId: string;
  slot: number;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  isPrimary: boolean;
  identityEmail?: string | null;
  source?: 'linked' | 'remembered';
  /** A session for this account is stored on this device. */
  hasLocalSession: boolean;
  isActive: boolean;
};

export type SwitchResult =
  | { ok: true }
  | { ok: false; needsPassword: true }
  | { ok: false; error: string };

/** Jadval/ustun mavjud emasligini bildiruvchi PostgREST xatolari */
function isSchemaMissingError(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  if (code === 'PGRST205' || code === 'PGRST202' || code === '42P01') return true;

  const message = String((error as { message?: string } | null)?.message || '');
  return /schema cache|does not exist/i.test(message);
}

const MULTI_ACCOUNT_SCHEMA_MISSING_KEY = 'alsamos.multi-account-schema-missing-at';
const MULTI_ACCOUNT_SCHEMA_RETRY_MS = 10 * 60 * 1000;
let ownIdentityProbe:
  | {
      userId: string;
      promise: Promise<any>;
    }
  | null = null;

function schemaProbeSuppressed(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const at = Number(window.sessionStorage.getItem(MULTI_ACCOUNT_SCHEMA_MISSING_KEY) || '0');
    return Number.isFinite(at) && at > 0 && Date.now() - at < MULTI_ACCOUNT_SCHEMA_RETRY_MS;
  } catch {
    return false;
  }
}

function markSchemaMissing() {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(MULTI_ACCOUNT_SCHEMA_MISSING_KEY, String(Date.now()));
  } catch {
    // Session storage is only an optimization.
  }
}

function clearSchemaMissingMark() {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(MULTI_ACCOUNT_SCHEMA_MISSING_KEY);
  } catch {
    // Ignore private mode/storage restrictions.
  }
}

async function probeOwnIdentity(userId: string): Promise<{
  data: { identity_id?: string | null } | null;
  error: unknown | null;
}> {
  if (schemaProbeSuppressed()) {
    return {
      data: null,
      error: {
        code: 'PGRST205',
        message: 'identity_accounts schema capability temporarily unavailable',
      },
    };
  }

  if (ownIdentityProbe?.userId === userId) {
    return ownIdentityProbe.promise;
  }

  const promise = Promise.resolve(
    db
    .from('identity_accounts')
    .select('identity_id')
    .eq('user_id', userId)
    .neq('status', 'deleted')
    .maybeSingle()
    .then((result) => {
      if (result.error && isSchemaMissingError(result.error)) {
        markSchemaMissing();
      } else if (!result.error) {
        clearSchemaMissingMark();
      }
      return result as {
        data: { identity_id?: string | null } | null;
        error: unknown | null;
      };
    })
  ).finally(() => {
    if (ownIdentityProbe?.promise === promise) ownIdentityProbe = null;
  });

  ownIdentityProbe = { userId, promise };
  return promise;
}

export function useMultiAccount(enabled = true) {
  const { user, profile } = useAuth();
  const [accounts, setAccounts] = useState<LinkedAccount[]>([]);
  const [identityEmail, setIdentityEmail] = useState<string | null>(null);
  const [maxAccounts, setMaxAccounts] = useState<number>(MAX_ACCOUNTS_PER_IDENTITY);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Server tomonda multi-account umuman sozlanmagan */
  const [isSupported, setIsSupported] = useState(() => !schemaProbeSuppressed());

  const activeSlot = getActiveSlot();

  const readLocalAccounts = useCallback((): LinkedAccount[] => {
    const localSlots = occupiedSlots();
    const local = readAccountMeta().map((item) => ({
      id: item.accountId || item.userId,
      userId: item.userId,
      slot: item.slot,
      username: item.username,
      displayName: item.displayName,
      avatarUrl: item.avatarUrl,
      isPrimary: item.isPrimary,
      identityEmail: item.identityEmail ?? null,
      source: item.source === 'linked' ? 'linked' as const : 'remembered' as const,
      hasLocalSession: localSlots.includes(item.slot),
      isActive: item.userId === user?.id,
    }));

    if (user && !local.some((item) => item.userId === user.id)) {
      local.unshift({
        id: user.id,
        userId: user.id,
        slot: activeSlot,
        username: profile?.username ?? null,
        displayName: profile?.display_name ?? null,
        avatarUrl: profile?.avatar_url ?? null,
        isPrimary: true,
        identityEmail: user.email ?? null,
        source: 'remembered',
        hasLocalSession: true,
        isActive: true,
      });
    }

    return local.sort(
      (a, b) =>
        Number(b.isActive) - Number(a.isActive) ||
        Number(b.hasLocalSession) - Number(a.hasLocalSession) ||
        a.slot - b.slot,
    );
  }, [
    activeSlot,
    profile?.avatar_url,
    profile?.display_name,
    profile?.username,
    user,
  ]);

  const refresh = useCallback(async () => {
    if (!user) {
      setAccounts([]);
      setIdentityEmail(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    const localAccounts = readLocalAccounts();
    setAccounts(localAccounts);
    setIdentityEmail(user.email ?? null);

    try {
      const { data: own, error: ownError } = await probeOwnIdentity(user.id);

      if (ownError) throw ownError;
      if (!own?.identity_id) {
        setIsSupported(false);
        return;
      }

      const [{ data: rows, error: rowsError }, { data: identity }] = await Promise.all([
        db
          .from('identity_accounts')
          .select('id, user_id, slot_no, is_primary, status')
          .eq('identity_id', own.identity_id)
          .eq('status', 'active')
          .order('slot_no', { ascending: true }),
        db
          .from('auth_identities')
          .select('alsamos_email, max_accounts')
          .eq('id', own.identity_id)
          .maybeSingle(),
      ]);

      if (rowsError) throw rowsError;

      const list = rows ?? [];
      const userIds = list.map((row) => row.user_id as string);

      const { data: profiles } = userIds.length
        ? await supabase
            .from('profiles')
            .select('id, username, display_name, avatar_url')
            .in('id', userIds)
        : { data: [] as Array<Record<string, unknown>> };

      const profileById = new Map(
        (profiles ?? []).map((p) => [p.id as string, p as Record<string, unknown>] as const),
      );
      const localSlots = occupiedSlots();
      const localMetaByUser = new Map(
        readAccountMeta().map((item) => [item.userId, item] as const),
      );

      const mapped: LinkedAccount[] = list.map((row) => {
        const rowUserId = row.user_id as string;
        const remembered = localMetaByUser.get(rowUserId);
        const slot = remembered?.slot ?? (row.slot_no as number);
        const profile = profileById.get(rowUserId);

        return {
          id: row.id as string,
          userId: rowUserId,
          slot,
          username: (profile?.username as string | null) ?? null,
          displayName: (profile?.display_name as string | null) ?? null,
          avatarUrl: (profile?.avatar_url as string | null) ?? null,
          isPrimary: Boolean(row.is_primary),
          identityEmail: (identity?.alsamos_email as string | null) ?? user.email ?? null,
          source: 'linked' as const,
          hasLocalSession:
            localSlots.includes(slot) &&
            (remembered?.userId === rowUserId || rowUserId === user.id),
          isActive: rowUserId === user.id,
        };
      });

      const merged = new Map<string, LinkedAccount>();
      for (const account of localAccounts) merged.set(account.userId, account);
      for (const account of mapped) merged.set(account.userId, account);

      setAccounts(
        Array.from(merged.values()).sort(
          (a, b) =>
            Number(b.isActive) - Number(a.isActive) ||
            Number(b.hasLocalSession) - Number(a.hasLocalSession) ||
            a.slot - b.slot,
        ),
      );
      setIdentityEmail((identity?.alsamos_email as string | null) ?? user.email ?? null);
      setMaxAccounts((identity?.max_accounts as number | null) ?? MAX_ACCOUNTS_PER_IDENTITY);
      setIsSupported(true);
      clearSchemaMissingMark();

      // Cache non-sensitive metadata only (no tokens, ever).
      writeAccountMeta(
        mapped.map((account) => ({
          slot: account.slot,
          accountId: account.id,
          userId: account.userId,
          username: account.username,
          displayName: account.displayName,
          avatarUrl: account.avatarUrl,
          isPrimary: account.isPrimary,
          identityEmail: account.identityEmail ?? null,
          source: 'linked',
          lastUsedAt: account.isActive ? Date.now() : undefined,
        })),
      );
    } catch (e) {
      if (isSchemaMissingError(e)) {
        // Migratsiya qo'llanmagan: funksiyani jimgina o'chiramiz
        markSchemaMissing();
        setIsSupported(false);
        setError(null);
        return;
      }

      console.error('useMultiAccount refresh failed', e);
      setError('Akkauntlar ro\u2019yxatini yuklab bo\u2019lmadi.');
    } finally {
      setIsLoading(false);
    }
  }, [readLocalAccounts, user]);

  useEffect(() => {
    if (!enabled) return;
    void refresh();
  }, [enabled, refresh]);

  const canAddAccount = isSupported && accounts.length < maxAccounts;

  /**
   * Switch to another account of the same identity. Instant when a session for
   * that slot exists on this device, otherwise the identity password is needed.
   */
  const switchToAccount = useCallback(
    async (account: LinkedAccount): Promise<SwitchResult> => {
      if (account.isActive) return { ok: true };

      if (!account.hasLocalSession) {
        return { ok: false, needsPassword: true };
      }

      touchAccountMeta(account.slot);
      setActiveSlot(account.slot);
      window.location.assign('/home');
      return { ok: true };
    },
    [],
  );

  /** Instagram-style: add another existing account to this device. */
  const addExistingAccount = useCallback(
    async (identifier: string, password: string): Promise<SwitchResult> => {
      if (occupiedSlots().length >= MAX_ACCOUNTS_PER_IDENTITY) {
        return {
          ok: false,
          error: 'Bu qurilmada saqlanadigan akkauntlar limiti to‘ldi.',
        };
      }

      try {
        await directPasswordLogin(identifier, password);
        window.location.assign('/home');
        return { ok: true };
      } catch (e) {
        const err = e instanceof AlsamosAuthError ? e : new AlsamosAuthError('UNKNOWN');
        return { ok: false, error: err.message };
      }
    },
    [],
  );

  /** Re-authenticate a specific account with the identity password. */
  const authenticateAccount = useCallback(
    async (account: LinkedAccount, password: string): Promise<SwitchResult> => {
      try {
        if (account.source === 'remembered' && account.identityEmail) {
          await directPasswordLogin(account.identityEmail, password);
          window.location.assign('/home');
          return { ok: true };
        }

        if (!identityEmail) {
          return { ok: false, error: 'Identifikator emaili topilmadi.' };
        }

        const step = await requestLoginTicket(identityEmail, password);
        const result = await requestAccountSession(step.ticket, account.id);
        const rememberedSlot = readAccountMeta().find(
          (item) => item.userId === account.userId,
        )?.slot;
        const localSlot = rememberedSlot ?? firstFreeSlot();

        if (!localSlot) {
          return { ok: false, error: 'Bu qurilmada saqlanadigan akkauntlar limiti to‘ldi.' };
        }

        setActiveSlot(localSlot);
        const { error: verifyError } = await supabase.auth.verifyOtp({
          type: 'magiclink',
          token_hash: result.token_hash,
        });

        if (verifyError) {
          return { ok: false, error: authErrorMessage('SESSION_MINT_FAILED') };
        }

        rememberAccountMeta({
          slot: localSlot,
          accountId: account.id,
          userId: account.userId,
          username: account.username,
          displayName: account.displayName,
          avatarUrl: account.avatarUrl,
          isPrimary: account.isPrimary,
          identityEmail,
          source: 'linked',
          lastUsedAt: Date.now(),
        });
        window.location.assign('/home');
        return { ok: true };
      } catch (e) {
        const err = e instanceof AlsamosAuthError ? e : new AlsamosAuthError('UNKNOWN');
        return { ok: false, error: err.message };
      }
    },
    [identityEmail],
  );

  /** Create an additional account (slot 2..10) and switch into it. */
  const addAccount = useCallback(
    async (username: string, displayName?: string): Promise<SwitchResult> => {
      if (!canAddAccount) {
        return { ok: false, error: authErrorMessage('ACCOUNT_LIMIT_REACHED') };
      }

      try {
        const created = await requestAccountCreate({ username, displayName });

        if (created.token_hash) {
          const localSlot = firstFreeSlot();
          if (!localSlot) {
            await refresh();
            return { ok: false, error: 'Bu qurilmada saqlanadigan akkauntlar limiti to‘ldi.' };
          }

          setActiveSlot(localSlot);
          const { error: verifyError } = await supabase.auth.verifyOtp({
            type: 'magiclink',
            token_hash: created.token_hash,
          });

          if (verifyError) {
            await refresh();
            return { ok: false, error: authErrorMessage('SESSION_MINT_FAILED') };
          }

          window.location.reload();
          return { ok: true };
        }

        await refresh();
        return { ok: true };
      } catch (e) {
        const err = e instanceof AlsamosAuthError ? e : new AlsamosAuthError('UNKNOWN');
        return { ok: false, error: err.message };
      }
    },
    [canAddAccount, refresh],
  );

  /**
   * Remove an account from this device.
   * Local "signout" must work even when the optional identity backend is
   * unavailable. Full unlink still requires a successful server operation.
   */
  const removeAccount = useCallback(
    async (account: LinkedAccount, mode: 'signout' | 'unlink' = 'signout'): Promise<SwitchResult> => {
      if (mode === 'unlink' && account.source === 'linked') {
        try {
          await requestAccountRevoke(account.id, mode);
        } catch (e) {
          const err = e instanceof AlsamosAuthError ? e : new AlsamosAuthError('UNKNOWN');
          return { ok: false, error: err.message };
        }
      } else if (account.source === 'linked') {
        void requestAccountRevoke(account.id, 'signout').catch(() => undefined);
      }

      if (account.isActive) {
        await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
      }

      clearSlot(account.slot);
      removeAccountMeta(account.slot);

      if (account.slot === activeSlot) {
        const fallback = accounts.find((a) => a.slot !== account.slot && a.hasLocalSession);
        setActiveSlot(fallback?.slot ?? 1);
        if (fallback) touchAccountMeta(fallback.slot);
        window.location.assign(fallback ? '/home' : '/');
        return { ok: true };
      }

      await refresh();
      return { ok: true };
    },
    [accounts, activeSlot, refresh],
  );

  const activeAccount = useMemo(
    () => accounts.find((account) => account.isActive) ?? null,
    [accounts],
  );

  return {
    accounts,
    activeAccount,
    activeSlot,
    identityEmail,
    maxAccounts,
    usedAccounts: accounts.length,
    canAddAccount,
    isSupported,
    isLoading,
    error,
    refresh,
    switchToAccount,
    authenticateAccount,
    addExistingAccount,
    addAccount,
    removeAccount,
  };
}
