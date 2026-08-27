import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { PROFILE_PUBLIC_COLUMNS } from '@/lib/profileFields';
import {
  AlsamosAuthError,
  authErrorMessage,
  DIRECT_SESSION_TICKET,
  directPasswordLogin,
  isAlsamosEmail,
  isRecoverableAuthFailure,
  isUsernameValid,
  LoginStepResult,
  normalizePhoneInput,
  requestAccountSession,
  requestLoginTicket,
  toIdentityEmail,
  TOS_VERSION,
} from '@/lib/alsamosAuth';
import { checkPassword } from '@/lib/passwordStrength';
import {
  clearAllSlots,
  getActiveSlot,
  purgeLegacyTokenStore,
  setActiveSlot,
} from '@/lib/accountSlots';

interface Profile {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  is_verified: boolean;
  is_online: boolean;
  followers_count: number;
  following_count: number;
  posts_count: number;
}

type AuthResult = { error: Error | null };

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  activeSlot: number;
  isAuthenticated: boolean;
  isLoading: boolean;
  /**
   * Step 1: verify the identity password, get the account list + ticket.
   * `identifier` may be an email, a username or a phone number.
   */
  beginLogin: (identifier: string, password: string) => Promise<LoginStepResult>;
  /** Step 2: open a session for one of the identity's accounts. */
  completeLogin: (ticket: string, accountId?: string) => Promise<AuthResult>;
  /** Convenience: log straight into the primary (slot 1) account. */
  login: (identifier: string, password: string) => Promise<AuthResult>;
  signup: (params: {
    email: string;
    password: string;
    phone?: string;
    displayName?: string;
    username?: string;
    acceptedTerms: boolean;
  }) => Promise<AuthResult & { needsEmailConfirmation?: boolean }>;
  requestPasswordReset: (email: string) => Promise<AuthResult>;
  updatePassword: (newPassword: string) => Promise<AuthResult>;
  logout: () => Promise<void>;
  updateProfile: (updates: Partial<Profile>) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/** Turn a server token hash into a real session inside a given slot. */
async function activateSlotSession(slot: number, tokenHash: string) {
  setActiveSlot(slot);
  return supabase.auth.verifyOtp({ type: 'magiclink', token_hash: tokenHash });
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeSlot, setActiveSlotState] = useState<number>(() => getActiveSlot());
  const userIdRef = useRef<string | null>(null);
  const { toast } = useToast();

  const setOffline = async (userId: string) => {
    await supabase
      .from('profiles')
      .update({ is_online: false, last_seen: new Date().toISOString() })
      .eq('id', userId);
  };

  const fetchProfile = async (userId: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select(PROFILE_PUBLIC_COLUMNS)
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      console.error('Error fetching profile:', error);
      return;
    }

    if (data) {
      setProfile(data as Profile);
      await supabase
        .from('profiles')
        .update({ is_online: true, last_seen: new Date().toISOString() })
        .eq('id', userId);
    }
  };

  useEffect(() => {
    // Devices upgraded from the old multi-account implementation still carry
    // plaintext access/refresh tokens in localStorage - drop them immediately.
    purgeLegacyTokenStore();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      setActiveSlotState(getActiveSlot());
      userIdRef.current = nextSession?.user?.id ?? null;

      if (nextSession?.user) {
        // Deferred to avoid deadlocking the auth callback.
        setTimeout(() => {
          fetchProfile(nextSession.user.id);
        }, 0);
      } else {
        setProfile(null);
      }
    });

    supabase.auth.getSession().then(({ data: { session: existing } }) => {
      setSession(existing);
      setUser(existing?.user ?? null);
      userIdRef.current = existing?.user?.id ?? null;
      if (existing?.user) fetchProfile(existing.user.id);
      setIsLoading(false);
    });

    const handleUnload = () => {
      const uid = userIdRef.current;
      if (uid) setOffline(uid);
    };

    window.addEventListener('beforeunload', handleUnload);

    return () => {
      subscription.unsubscribe();
      window.removeEventListener('beforeunload', handleUnload);
    };
  }, []);

  // ---------------------------------------------------------------------
  // Login (two steps: credentials -> choose account)
  //
  // The multi-account flow runs in the account-* edge functions. When those
  // are unreachable (not deployed, CORS, cold start) we do NOT leave the user
  // locked out: plain Supabase email/phone + password sign-in takes over.
  // ---------------------------------------------------------------------
  const beginLogin = async (identifier: string, password: string): Promise<LoginStepResult> => {
    try {
      // Credentials are verified server side: identical response for unknown
      // identifier and wrong password, rate limited, audited.
      return await requestLoginTicket(identifier, password);
    } catch (e) {
      if (!isRecoverableAuthFailure(e)) throw e;

      console.warn('account-login unavailable, using direct sign-in fallback', e);
      return directPasswordLogin(identifier, password);
    }
  };

  const completeLogin = async (ticket: string, accountId?: string): Promise<AuthResult> => {
    // Fallback path: the session already exists, nothing to exchange.
    if (ticket === DIRECT_SESSION_TICKET) {
      const { data } = await supabase.auth.getSession();

      if (!data.session) {
        const error = new AlsamosAuthError('SESSION_MINT_FAILED');
        toast({
          title: 'Kirish amalga oshmadi',
          description: authErrorMessage('SESSION_MINT_FAILED'),
          variant: 'destructive',
        });
        return { error };
      }

      setActiveSlot(1);
      setActiveSlotState(1);
      return { error: null };
    }

    setIsLoading(true);
    try {
      const result = await requestAccountSession(ticket, accountId);
      const { error } = await activateSlotSession(result.slot_no, result.token_hash);

      if (error) {
        toast({
          title: 'Kirish amalga oshmadi',
          description: authErrorMessage('SESSION_MINT_FAILED'),
          variant: 'destructive',
        });
        return { error };
      }

      setActiveSlotState(result.slot_no);
      return { error: null };
    } catch (e) {
      const err = e instanceof AlsamosAuthError ? e : new AlsamosAuthError('UNKNOWN');
      toast({
        title: 'Kirish amalga oshmadi',
        description: err.message,
        variant: 'destructive',
      });
      return { error: err };
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (identifier: string, password: string): Promise<AuthResult> => {
    try {
      const step = await beginLogin(identifier, password);
      const primary = step.accounts.find((a) => a.is_primary) ?? step.accounts[0];
      return completeLogin(step.ticket, primary?.id);
    } catch (e) {
      const err = e instanceof AlsamosAuthError ? e : new AlsamosAuthError('UNKNOWN');
      toast({
        title: 'Kirish amalga oshmadi',
        description: err.message,
        variant: 'destructive',
      });
      return { error: err };
    }
  };

  // ---------------------------------------------------------------------
  // Signup (identity creation) - the identity email must be @alsamos.com,
  // while login later accepts email, username or phone.
  // ---------------------------------------------------------------------
  const signup: AuthContextType['signup'] = async ({
    email,
    password,
    phone,
    displayName,
    username,
    acceptedTerms,
  }) => {
    const identityEmail = toIdentityEmail(email);

    if (!isAlsamosEmail(identityEmail)) {
      const error = new AlsamosAuthError('EMAIL_DOMAIN_NOT_ALLOWED');
      toast({
        title: 'Ro’yxatdan o’tish amalga oshmadi',
        description: error.message,
        variant: 'destructive',
      });
      return { error };
    }

    const finalUsername = (username || identityEmail.split('@')[0])
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '');

    if (!isUsernameValid(finalUsername)) {
      const error = new AlsamosAuthError('USERNAME_INVALID');
      toast({ title: 'Username xato', description: error.message, variant: 'destructive' });
      return { error };
    }

    // Phone is optional, but when present it must be a valid E.164 number:
    // it becomes a login identifier, so a broken value would lock the user out.
    let normalizedPhone: string | null = null;
    if (phone && phone.trim()) {
      normalizedPhone = normalizePhoneInput(phone);
      if (!normalizedPhone) {
        const error = new AlsamosAuthError('PHONE_INVALID');
        toast({ title: 'Telefon raqam xato', description: error.message, variant: 'destructive' });
        return { error };
      }
    }

    const strength = checkPassword(password, [identityEmail, finalUsername]);
    if (!strength.valid) {
      const error = new Error(strength.problems[0]);
      toast({ title: 'Parol juda kuchsiz', description: error.message, variant: 'destructive' });
      return { error };
    }

    if (!acceptedTerms) {
      const error = new Error('Shartlarni qabul qilish talab etiladi.');
      toast({ title: 'Tasdiqlash kerak', description: error.message, variant: 'destructive' });
      return { error };
    }

    setIsLoading(true);

    const { data, error } = await supabase.auth.signUp({
      email: identityEmail,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/`,
        data: {
          display_name: displayName || finalUsername,
          username: finalUsername,
          phone: normalizedPhone,
          tos_version: TOS_VERSION,
        },
      },
    });

    setIsLoading(false);

    if (error) {
      // Never confirm whether an address is already registered.
      const message = /already|registered|exists/i.test(error.message)
        ? 'Agar bu manzil bo’sh bo’lsa, tasdiqlash xati yuborildi.'
        : error.message;
      toast({
        title: 'Ro’yxatdan o’tish',
        description: message,
        variant: 'destructive',
      });
      return { error };
    }

    // Email confirmation is NEVER bypassed with an automatic sign-in anymore.
    const needsEmailConfirmation = !data.session;

    toast({
      title: 'Akkaunt yaratildi',
      description: needsEmailConfirmation
        ? 'Emailingizga tasdiqlash havolasi yuborildi. Havolani bosgach kirishingiz mumkin.'
        : 'Alsamosga xush kelibsiz!',
    });

    return { error: null, needsEmailConfirmation };
  };

  // ---------------------------------------------------------------------
  // Password recovery / change
  // ---------------------------------------------------------------------
  const requestPasswordReset = async (email: string): Promise<AuthResult> => {
    const identityEmail = toIdentityEmail(email);

    if (!isAlsamosEmail(identityEmail)) {
      const error = new AlsamosAuthError('EMAIL_DOMAIN_NOT_ALLOWED');
      toast({ title: 'Email xato', description: error.message, variant: 'destructive' });
      return { error };
    }

    const { error } = await supabase.auth.resetPasswordForEmail(identityEmail, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    // The UI shows the same message either way, so a missing account cannot
    // be detected from the outside.
    if (error) console.error('resetPasswordForEmail failed', error);

    return { error: null };
  };

  const updatePassword = async (newPassword: string): Promise<AuthResult> => {
    const strength = checkPassword(newPassword, [user?.email ?? '', profile?.username ?? '']);

    if (!strength.valid) {
      const error = new Error(strength.problems[0]);
      toast({ title: 'Parol juda kuchsiz', description: error.message, variant: 'destructive' });
      return { error };
    }

    const { error } = await supabase.auth.updateUser({ password: newPassword });

    if (error) {
      toast({ title: 'Parol o’zgartirilmadi', description: error.message, variant: 'destructive' });
      return { error };
    }

    toast({
      title: 'Parol yangilandi',
      description: 'Boshqa qurilmalardagi sessiyalar bekor qilinishi mumkin.',
    });
    return { error: null };
  };

  // ---------------------------------------------------------------------
  // Logout - clears the server session AND every local account slot
  // ---------------------------------------------------------------------
  const logout = async () => {
    const uid = userIdRef.current;
    if (uid) await setOffline(uid);

    await supabase.auth.signOut({ scope: 'global' }).catch(() => {
      /* offline: still wipe local state below */
    });

    clearAllSlots();

    userIdRef.current = null;
    setUser(null);
    setSession(null);
    setProfile(null);
    setActiveSlotState(1);
  };

  const updateProfile = async (updates: Partial<Profile>) => {
    if (!user) return;

    const { error } = await supabase
      .from('profiles')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', user.id);

    if (error) {
      toast({ title: 'Saqlanmadi', description: error.message, variant: 'destructive' });
      return;
    }

    setProfile((prev) => (prev ? { ...prev, ...updates } : null));
    toast({ title: 'Profil yangilandi', description: 'O’zgarishlar saqlandi.' });
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        activeSlot,
        isAuthenticated: !!user,
        isLoading,
        beginLogin,
        completeLogin,
        login,
        signup,
        requestPasswordReset,
        updatePassword,
        logout,
        updateProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
