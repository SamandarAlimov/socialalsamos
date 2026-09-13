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
const authPage = read('src/pages/AuthPage.tsx');
const authPolicy = read('src/lib/alsamosAuth.ts');
const loginFn = read('supabase/functions/account-login/index.ts');
const signupFn = read('supabase/functions/account-signup/index.ts');
const verifier = read('supabase/migrations/20260913062000_first_party_auth_password_verifier.sql');
const forgot = read('src/pages/ForgotPasswordPage.tsx');

// Hosted Auth must never require a mailbox confirmation for Alsamos' internal
// @alsamos.com identity namespace.
requireText(config, 'enable_confirmations = false', 'hosted Confirm Email disabled');
requireText(config, '[functions.account-signup]', 'account-signup function config');
requireText(config, '[functions.account-signup]\nverify_jwt = false', 'pre-session signup policy');
requireText(config, '[functions.account-login]', 'account-login function config');
requireText(config, '[functions.account-login]\nverify_jwt = false', 'pre-session login policy');

// The browser is not allowed to create Auth users directly or to show the old
// confirmation-email UX. Public login must go through the first-party ticket
// endpoint so rate limiting, identity resolution and 2FA cannot be bypassed.
forbidText(context, 'supabase.auth.signUp({', 'direct browser signup');
forbidText(context, 'Emailingizga tasdiqlash havolasi yuborildi', 'confirmation-email signup UX');
forbidText(context, 'Agar bu manzil bo’sh bo’lsa, tasdiqlash xati yuborildi', 'legacy confirmation UX');
forbidText(context, 'resetPasswordForEmail', 'synthetic mailbox password reset');
forbidText(context, 'requestPasswordReset', 'obsolete mailbox recovery API');
requireText(context, 'registerFirstPartyIdentity({', 'first-party signup client');
requireText(context, 'requestLoginTicket(identifier, password)', 'first-party login ticket client');
forbidText(context, 'directPasswordLogin(', 'direct browser password login bypass');

// Public login is username/phone only, but registration MUST collect a
// real contact email and phone. Contact email is data, not a confirmation gate.
requireText(authPage, 'Username yoki telefon raqam', 'username/phone login label');
requireText(authPage, 'type="email"', 'required contact email signup input');
requireText(authPage, 'autoComplete="email"', 'contact email autocomplete');
requireText(authPage, 'Username', 'username signup field');
requireText(authPage, 'type="tel"', 'required phone signup field');
requireText(authPage, 'required', 'required signup fields');

// Defence in depth: even a hand-written call to account-login must not accept
// an email identifier. Email remains an internal Supabase credential only.
requireText(loginFn, 'kind === "invalid" || kind === "email"', 'server email-login rejection');
requireText(loginFn, 'email_login_disabled', 'email-login audit reason');

// Legacy unconfirmed users are repaired only inside the server-side login
// boundary, after the password has been proven by a service-role-only verifier.
requireText(loginFn, '/not confirmed/i', 'server-side unconfirmed detection');
requireText(loginFn, 'verify_alsamos_identity_password', 'server-side password ownership proof');
requireText(loginFn, 'email_confirm: true', 'server-side legacy identity confirmation');
requireText(loginFn, 'signOut({ scope: "local" })', 'temporary login session local signout');

requireText(signupFn, 'email_confirm: true', 'server-side auto-confirm');
requireText(signupFn, 'body.contact_email ?? body.email', 'required real contact email input');
requireText(signupFn, '`${username}@alsamos.com`', 'hidden internal auth credential');
requireText(signupFn, '!phone', 'mandatory normalized phone');
requireText(signupFn, 'contact_email: contactEmail', 'contact email persistence');
requireText(signupFn, 'verify_alsamos_identity_password', 'signup repair ownership proof');
requireText(signupFn, 'action === "repair"', 'legacy account repair path');
requireText(verifier, 'GRANT EXECUTE ON FUNCTION public.verify_alsamos_identity_password(text, text) TO service_role;', 'service-role-only verifier grant');
forbidText(verifier, 'TO anon', 'browser verifier grant');
forbidText(verifier, 'TO authenticated', 'authenticated verifier grant');

forbidText(authPolicy, 'Pochtangizdagi havolani bosing', 'email confirmation recovery instruction');
forbidText(forgot, 'resetPasswordForEmail', 'mailbox password reset');
requireText(forgot, 'U pochta qutisi emas', 'synthetic identity recovery explanation');

console.log('No-email Alsamos identity contract passed.');
