import { supabase } from '@/integrations/supabase/client';
import {
  ALSAMOS_MAIL_DOMAIN,
  AlsamosAuthError,
  AuthErrorCode,
  authErrorMessage,
  isAlsamosEmail,
  toIdentityEmail,
} from '@/lib/alsamosAuth';

type IdentityTokenResponse = {
  token_hash: string;
  repaired?: boolean;
  user_id: string;
};

async function invokeIdentity(
  body: Record<string, unknown>,
): Promise<IdentityTokenResponse> {
  const { data, error } = await supabase.functions.invoke('account-signup', { body });

  if (error) {
    let code: AuthErrorCode = 'NETWORK';
    const ctx = (error as { context?: Response }).context;

    if (ctx && typeof ctx.json === 'function') {
      try {
        const payload = await ctx.json();
        if (typeof payload?.error === 'string') {
          code = payload.error as AuthErrorCode;
        }
      } catch {
        code = 'NETWORK';
      }
    }

    throw new AlsamosAuthError(code, authErrorMessage(code));
  }

  if (!data || typeof data !== 'object' || typeof data.token_hash !== 'string') {
    throw new AlsamosAuthError('SESSION_MINT_FAILED', authErrorMessage('SESSION_MINT_FAILED'));
  }

  return data as IdentityTokenResponse;
}

async function exchangeToken(tokenHash: string): Promise<void> {
  const { error } = await supabase.auth.verifyOtp({
    type: 'magiclink',
    token_hash: tokenHash,
  });

  if (error) {
    throw new AlsamosAuthError('SESSION_MINT_FAILED', authErrorMessage('SESSION_MINT_FAILED'));
  }
}

export async function registerFirstPartyIdentity(params: {
  email: string;
  password: string;
  username: string;
  displayName?: string;
  phone?: string | null;
  tosVersion?: string | null;
}): Promise<{ repaired: boolean }> {
  const email = toIdentityEmail(params.email);
  if (!isAlsamosEmail(email)) {
    throw new AlsamosAuthError(
      'EMAIL_DOMAIN_NOT_ALLOWED',
      `Ro’yxatdan o’tish faqat @${ALSAMOS_MAIL_DOMAIN} identifikatori bilan.`,
    );
  }

  const result = await invokeIdentity({
    action: 'signup',
    email,
    password: params.password,
    username: params.username,
    display_name: params.displayName ?? params.username,
    phone: params.phone ?? null,
    tos_version: params.tosVersion ?? null,
  });

  await exchangeToken(result.token_hash);
  return { repaired: result.repaired === true };
}

/**
 * Repair an identity accidentally created while hosted Confirm Email was on.
 * The Edge Function confirms it only after server-side password verification.
 */
export async function repairFirstPartyIdentity(
  emailOrUsername: string,
  password: string,
): Promise<void> {
  const email = toIdentityEmail(emailOrUsername);
  if (!isAlsamosEmail(email)) {
    throw new AlsamosAuthError('EMAIL_NOT_CONFIRMED',
      'Bu akkaunt email havolasi bilan emas, Alsamos identity recovery orqali tiklanadi.');
  }

  const result = await invokeIdentity({
    action: 'repair',
    email,
    password,
  });
  await exchangeToken(result.token_hash);
}
