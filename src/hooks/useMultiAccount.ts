import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Session } from '@supabase/supabase-js';

interface StoredAccount {
  id: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  username: string | null;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

const ACCOUNTS_STORAGE_KEY = 'alsamos_accounts';
const ACTIVE_ACCOUNT_KEY = 'alsamos_active_account';

export function useMultiAccount() {
  const [accounts, setAccounts] = useState<StoredAccount[]>([]);
  const [activeAccountId, setActiveAccountId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Load accounts from localStorage
  useEffect(() => {
    const stored = localStorage.getItem(ACCOUNTS_STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as StoredAccount[];
        setAccounts(parsed);
      } catch (e) {
        console.error('Failed to parse stored accounts:', e);
      }
    }

    const activeId = localStorage.getItem(ACTIVE_ACCOUNT_KEY);
    if (activeId) {
      setActiveAccountId(activeId);
    }
  }, []);

  // Save current session as an account
  const saveCurrentAccount = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    // Fetch profile data
    const { data: profile } = await supabase
      .from('profiles')
      .select('display_name, avatar_url, username')
      .eq('id', session.user.id)
      .maybeSingle();

    const newAccount: StoredAccount = {
      id: session.user.id,
      email: session.user.email || '',
      displayName: profile?.display_name || null,
      avatarUrl: profile?.avatar_url || null,
      username: profile?.username || null,
      accessToken: session.access_token,
      refreshToken: session.refresh_token,
      expiresAt: session.expires_at || 0,
    };

    setAccounts(prev => {
      // Update existing or add new
      const existing = prev.findIndex(a => a.id === newAccount.id);
      let updated: StoredAccount[];
      
      if (existing >= 0) {
        updated = [...prev];
        updated[existing] = newAccount;
      } else {
        updated = [...prev, newAccount];
      }

      localStorage.setItem(ACCOUNTS_STORAGE_KEY, JSON.stringify(updated));
      return updated;
    });

    setActiveAccountId(newAccount.id);
    localStorage.setItem(ACTIVE_ACCOUNT_KEY, newAccount.id);
  }, []);

  // Switch to a different account
  const switchToAccount = useCallback(async (accountId: string) => {
    const account = accounts.find(a => a.id === accountId);
    if (!account) return { error: new Error('Account not found') };

    setIsLoading(true);

    try {
      // First save current session
      await saveCurrentAccount();

      // Set the session for the selected account
      const { data, error } = await supabase.auth.setSession({
        access_token: account.accessToken,
        refresh_token: account.refreshToken,
      });

      if (error) {
        // Token might be expired, need to re-login
        setIsLoading(false);
        return { error, needsReauth: true, account };
      }

      // Update the stored account with new tokens
      if (data.session) {
        const updatedAccount: StoredAccount = {
          ...account,
          accessToken: data.session.access_token,
          refreshToken: data.session.refresh_token,
          expiresAt: data.session.expires_at || 0,
        };

        setAccounts(prev => {
          const updated = prev.map(a => a.id === accountId ? updatedAccount : a);
          localStorage.setItem(ACCOUNTS_STORAGE_KEY, JSON.stringify(updated));
          return updated;
        });
      }

      setActiveAccountId(accountId);
      localStorage.setItem(ACTIVE_ACCOUNT_KEY, accountId);
      setIsLoading(false);

      // Reload page to refresh all data
      window.location.reload();
      
      return { error: null };
    } catch (err) {
      setIsLoading(false);
      return { error: err as Error };
    }
  }, [accounts, saveCurrentAccount]);

  // Add new account (opens login flow)
  const addAccount = useCallback(async (email: string, password: string) => {
    setIsLoading(true);

    try {
      // First save current session
      await saveCurrentAccount();

      // Sign out current user
      await supabase.auth.signOut();

      // Sign in with new credentials
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setIsLoading(false);
        return { error };
      }

      if (data.session) {
        // Fetch profile for the new account
        const { data: profile } = await supabase
          .from('profiles')
          .select('display_name, avatar_url, username')
          .eq('id', data.session.user.id)
          .maybeSingle();

        const newAccount: StoredAccount = {
          id: data.session.user.id,
          email: data.session.user.email || '',
          displayName: profile?.display_name || null,
          avatarUrl: profile?.avatar_url || null,
          username: profile?.username || null,
          accessToken: data.session.access_token,
          refreshToken: data.session.refresh_token,
          expiresAt: data.session.expires_at || 0,
        };

        setAccounts(prev => {
          const existing = prev.findIndex(a => a.id === newAccount.id);
          let updated: StoredAccount[];
          
          if (existing >= 0) {
            updated = [...prev];
            updated[existing] = newAccount;
          } else {
            updated = [...prev, newAccount];
          }

          localStorage.setItem(ACCOUNTS_STORAGE_KEY, JSON.stringify(updated));
          return updated;
        });

        setActiveAccountId(newAccount.id);
        localStorage.setItem(ACTIVE_ACCOUNT_KEY, newAccount.id);
      }

      setIsLoading(false);
      window.location.reload();
      return { error: null };
    } catch (err) {
      setIsLoading(false);
      return { error: err as Error };
    }
  }, [saveCurrentAccount]);

  // Remove an account
  const removeAccount = useCallback((accountId: string) => {
    setAccounts(prev => {
      const updated = prev.filter(a => a.id !== accountId);
      localStorage.setItem(ACCOUNTS_STORAGE_KEY, JSON.stringify(updated));
      return updated;
    });

    // If removing active account, clear active
    if (activeAccountId === accountId) {
      localStorage.removeItem(ACTIVE_ACCOUNT_KEY);
      setActiveAccountId(null);
    }
  }, [activeAccountId]);

  // Clear all accounts on logout
  const clearAllAccounts = useCallback(() => {
    localStorage.removeItem(ACCOUNTS_STORAGE_KEY);
    localStorage.removeItem(ACTIVE_ACCOUNT_KEY);
    setAccounts([]);
    setActiveAccountId(null);
  }, []);

  return {
    accounts,
    activeAccountId,
    isLoading,
    saveCurrentAccount,
    switchToAccount,
    addAccount,
    removeAccount,
    clearAllAccounts,
  };
}
