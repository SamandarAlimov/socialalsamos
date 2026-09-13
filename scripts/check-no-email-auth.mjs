import fs from 'node:fs';

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

function requireText(haystack, needle, label) {
  if (!haystack.includes(needle)) {
    throw new Error(`Missing ${label}: ${needle}`);
  }
}

function forbidText(haystack, needle, label) {
  if (haystack.includes(needle)) {
    throw new Error(`Forbidden ${label}: ${needle}`);
  }
}

const config = read('supabase/config.toml');
const context = read('src/contexts/AuthContext.tsx');
const authPolicy = read('src/lib/alsamosAuth.ts');
const signupFn = read('supabase/functions/account-signup/index.ts');
const verifier = read('supabase/migrations/20260913062000_first_party_auth_password_verifier.sql');
const forgot = read('src/pages/ForgotPasswordPage.tsx');

requireText(config, 'enable_confirmations = false', 'hosted Confirm Email disabled');
requireText(config, '[functions.account-signup]', 'account-signup function config');
requireText(config, '[functions.account-signup]\nverify_jwt = false', 'pre-session function policy');

forbidText(context, 'supabase.auth.signUp({', 'direct browser signup');
forbidText(context, 'Emailingizga tasdiqlash havolasi yuborildi', 'confirmation-email signup UX');
forbidText(context, 'Agar bu manzil bo’sh bo’lsa, tasdiqlash xati yuborildi', 'legacy confirmation UX');
requireText(context, 'registerFirstPartyIdentity({', 'first-party signup client');
requireText(context, "e.code === 'EMAIL_NOT_CONFIRMED'", 'legacy unconfirmed repair hook');
requireText(context, 'repairFirstPartyIdentity(', 'safe login repair client');

requireText(signupFn, 'email_confirm: true', 'server-side auto-confirm');
requireText(signupFn, 'verify_alsamos_identity_password', 'password ownership proof');
requireText(signupFn, 'action === "repair"', 'legacy account repair path');
requireText(verifier, 'GRANT EXECUTE ON FUNCTION public.verify_alsamos_identity_password(text, text) TO service_role;', 'service-role-only verifier grant');
forbidText(verifier, 'TO anon', 'browser verifier grant');
forbidText(verifier, 'TO authenticated', 'authenticated verifier grant');

forbidText(authPolicy, 'Pochtangizdagi havolani bosing', 'email confirmation recovery instruction');
forbidText(forgot, 'resetPasswordForEmail', 'mailbox password reset');
requireText(forgot, 'U pochta qutisi emas', 'synthetic identity recovery explanation');

console.log('No-email Alsamos identity contract passed.');
