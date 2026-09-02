import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  AtSign,
  Check,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Lock,
  Mail,
  Phone,
  ShieldCheck,
  User,
  UserRound,
} from 'lucide-react';
import { toast } from 'sonner';
import { z } from 'zod';

import { useAuth } from '@/contexts/AuthContext';
import { AlsamosLogo } from '@/components/AlsamosLogo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  ALSAMOS_MAIL_DOMAIN,
  AlsamosAuthError,
  classifyIdentifier,
  isAlsamosEmail,
  isRecoveryCode,
  isTotpCode,
  LEGAL_ROUTES,
  LoginStepResult,
  MAX_ACCOUNTS_PER_IDENTITY,
  normalizePhoneInput,
  PublicAccount,
  toIdentityEmail,
  verifyMfaLogin,
} from '@/lib/alsamosAuth';
import { checkPassword, passwordStrengthColor } from '@/lib/passwordStrength';

type AuthMode = 'login' | 'signup';
type LoginStep = 'credentials' | 'mfa' | 'chooseAccount';

/** Login accepts an email, a username or a phone number. */
const identifierField = z
  .string()
  .trim()
  .min(3, 'Email, username yoki telefon raqamni kiriting')
  .max(255)
  .refine((value) => classifyIdentifier(value) !== 'invalid', {
    message: 'Email, username yoki telefon raqamni to’g’ri kiriting',
  });

const loginSchema = z.object({
  identifier: identifierField,
  password: z.string().min(1, 'Parolni kiriting').max(128),
});

/** Signup still creates an @alsamos.com identity. */
const signupEmailField = z
  .string()
  .trim()
  .min(3, 'Emailni kiriting')
  .max(255)
  .refine((value) => isAlsamosEmail(toIdentityEmail(value)), {
    message: `Ro’yxatdan o’tish faqat @${ALSAMOS_MAIL_DOMAIN} manzili bilan`,
  });

const signupSchema = z
  .object({
    fullName: z.string().trim().min(2, 'Ism kamida 2 ta belgidan iborat bo’lsin').max(100),
    username: z
      .string()
      .trim()
      .min(3, 'Username kamida 3 ta belgi')
      .max(30)
      .regex(/^[a-z0-9_]+$/, 'Username: faqat kichik harflar, raqamlar va _'),
    email: signupEmailField,
    phone: z
      .string()
      .trim()
      .refine((value) => normalizePhoneInput(value) !== null, {
        message: 'Telefon raqamni +998901234567 shaklida kiriting',
      }),
    password: z.string().min(10, 'Parol kamida 10 ta belgidan iborat bo’lsin').max(128),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Parollar mos emas',
    path: ['confirmPassword'],
  });

export default function AuthPage() {
  const [mode, setMode] = useState<AuthMode>('login');
  const [step, setStep] = useState<LoginStep>('credentials');

  // Login
  const [identifier, setIdentifier] = useState('');

  // Signup
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  // Second factor
  const [mfaCode, setMfaCode] = useState('');
  const [useRecoveryCode, setUseRecoveryCode] = useState(false);
  const [verifyingMfa, setVerifyingMfa] = useState(false);

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loginStep, setLoginStep] = useState<LoginStepResult | null>(null);

  const { beginLogin, completeLogin, signup } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const rawNext = searchParams.get('next');
  const nextPath =
    rawNext && rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/home';

  const strength = useMemo(
    () => checkPassword(password, [email, username, fullName]),
    [password, email, username, fullName],
  );

  const resetForm = () => {
    setIdentifier('');
    setEmail('');
    setPhone('');
    setPassword('');
    setConfirmPassword('');
    setFullName('');
    setUsername('');
    setAcceptedTerms(false);
    setMfaCode('');
    setUseRecoveryCode(false);
    setLoginStep(null);
    setStep('credentials');
  };

  /**
   * After credentials (and the second factor, when enabled) are accepted:
   * open the only account directly, or let the user pick one.
   */
  const proceedWithAccounts = async (result: LoginStepResult) => {
    setLoginStep(result);

    if (result.accounts.length <= 1) {
      const only = result.accounts[0];
      const { error } = await completeLogin(result.ticket, only?.id);
      if (!error) {
        toast.success('Xush kelibsiz!');
        navigate(nextPath);
      }
      return;
    }

    setStep('chooseAccount');
  };

  const handleLogin = async () => {
    const parsed = loginSchema.safeParse({ identifier, password });
    if (!parsed.success) {
      toast.error(parsed.error.errors[0].message);
      return;
    }

    try {
      const result = await beginLogin(parsed.data.identifier, parsed.data.password);
      setPassword('');

      // 2FA is on: the ticket can only be spent on the code check.
      if (result.mfa_required) {
        setLoginStep(result);
        setMfaCode('');
        setUseRecoveryCode(false);
        setStep('mfa');
        return;
      }

      await proceedWithAccounts(result);
    } catch (e) {
      const err = e instanceof AlsamosAuthError ? e : new AlsamosAuthError('UNKNOWN');
      toast.error(err.message);
    }
  };

  const handleVerifyMfa = async () => {
    if (!loginStep) return;

    const value = mfaCode.trim();
    const looksValid = useRecoveryCode ? isRecoveryCode(value) : isTotpCode(value);
    if (!looksValid) {
      toast.error(
        useRecoveryCode
          ? 'Zaxira kodni to’liq kiriting.'
          : 'Ilovadagi 6 xonali kodni kiriting.',
      );
      return;
    }

    setVerifyingMfa(true);
    try {
      const verified = await verifyMfaLogin(loginStep.ticket, value);
      setMfaCode('');

      if (verified.method === 'recovery') {
        toast.warning('Zaxira kod ishlatildi. Sozlamalarda yangi kodlar oling.');
      }

      await proceedWithAccounts(verified);
    } catch (e) {
      const err = e instanceof AlsamosAuthError ? e : new AlsamosAuthError('UNKNOWN');
      toast.error(err.message);

      // An expired or fully consumed ticket means starting over.
      if (err.code === 'TICKET_INVALID' || err.code === 'TOO_MANY_ATTEMPTS') {
        setStep('credentials');
        setLoginStep(null);
      }
    } finally {
      setVerifyingMfa(false);
    }
  };

  const handleChooseAccount = async (account: PublicAccount) => {
    if (!loginStep) return;

    setIsSubmitting(true);
    const { error } = await completeLogin(loginStep.ticket, account.id);
    setIsSubmitting(false);

    if (error) {
      // Tickets are single-purpose and short lived: go back to the password step.
      setStep('credentials');
      setLoginStep(null);
      return;
    }

    toast.success(`@${account.username ?? 'akkaunt'} ga kirdingiz`);
    navigate(nextPath);
  };

  const handleSignup = async () => {
    const parsed = signupSchema.safeParse({
      fullName,
      username,
      email,
      phone,
      password,
      confirmPassword,
    });

    if (!parsed.success) {
      toast.error(parsed.error.errors[0].message);
      return;
    }

    if (!strength.valid) {
      toast.error(strength.problems[0]);
      return;
    }

    if (!acceptedTerms) {
      toast.error('Foydalanish shartlari va Maxfiylik siyosatini qabul qiling');
      return;
    }

    const { error, needsEmailConfirmation } = await signup({
      email: toIdentityEmail(parsed.data.email),
      password: parsed.data.password,
      phone: parsed.data.phone,
      displayName: parsed.data.fullName,
      username: parsed.data.username,
      acceptedTerms,
    });

    if (error) return;

    if (needsEmailConfirmation) {
      setMode('login');
      resetForm();
      return;
    }

    navigate(nextPath);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      if (mode === 'login') {
        await handleLogin();
      } else {
        await handleSignup();
      }
    } catch {
      toast.error('Amalga oshmadi. Qaytadan urinib ko’ring.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-background">
      {/* Animated Background */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-1/2 -left-1/2 w-full h-full bg-gradient-to-br from-muted/60 via-transparent to-transparent rounded-full blur-3xl animate-float" />
        <div className="absolute -bottom-1/2 -right-1/2 w-full h-full bg-gradient-to-tl from-muted/60 via-transparent to-transparent rounded-full blur-3xl animate-float" style={{ animationDelay: '-3s' }} />
        <div className="absolute top-1/4 right-1/4 w-96 h-96 bg-muted/40 rounded-full blur-3xl animate-pulse-soft" />
      </div>

      <div className="relative z-10 w-full max-w-md mx-4 my-8">
        <div className="glass-strong rounded-3xl p-8 shadow-lg animate-scale-in">
          {/* Logo */}
          <div className="flex flex-col items-center mb-8">
            <AlsamosLogo size="xl" className="mb-4" />
            <p className="text-muted-foreground text-center text-sm max-w-xs">
              Ulaning, ulashing, kashf eting.
            </p>
          </div>

          {step === 'mfa' && loginStep ? (
            /* ---------------- Second factor ---------------- */
            <div className="space-y-4">
              <div className="flex flex-col items-center text-center">
                <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">
                  <ShieldCheck className="h-6 w-6 text-muted-foreground" />
                </span>
                <h2 className="text-lg font-semibold">Ikki qadamli tasdiqlash</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {useRecoveryCode
                    ? 'Zaxira kodlaringizdan birini kiriting. Har bir kod bir marta ishlaydi.'
                    : 'Autentifikator ilovasidagi 6 xonali kodni kiriting.'}
                </p>
              </div>

              <Input
                type="text"
                value={mfaCode}
                onChange={(e) =>
                  setMfaCode(
                    useRecoveryCode
                      ? e.target.value.toUpperCase().slice(0, 20)
                      : e.target.value.replace(/[^0-9]/g, '').slice(0, 6),
                  )
                }
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void handleVerifyMfa();
                  }
                }}
                placeholder={useRecoveryCode ? 'XXXX-XXXX-XXXX' : '123456'}
                icon={<KeyRound className="h-4 w-4" />}
                inputMode={useRecoveryCode ? 'text' : 'numeric'}
                autoComplete={useRecoveryCode ? 'off' : 'one-time-code'}
                autoFocus
                className={useRecoveryCode ? 'tracking-widest' : 'text-center text-lg tracking-[0.4em]'}
              />

              <Button
                type="button"
                variant="hero"
                size="lg"
                className="w-full"
                disabled={verifyingMfa}
                onClick={handleVerifyMfa}
              >
                {verifyingMfa ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <>
                    Tasdiqlash
                    <ArrowRight className="ml-1 h-4 w-4" />
                  </>
                )}
              </Button>

              <button
                type="button"
                className="w-full text-center text-sm text-link hover:text-link-hover hover:underline"
                onClick={() => {
                  setUseRecoveryCode((prev) => !prev);
                  setMfaCode('');
                }}
              >
                {useRecoveryCode
                  ? 'Autentifikator kodini kiritaman'
                  : 'Ilovaga kira olmayapsizmi? Zaxira koddan foydalanish'}
              </button>

              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => {
                  setStep('credentials');
                  setLoginStep(null);
                  setMfaCode('');
                }}
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Orqaga
              </Button>
            </div>
          ) : step === 'chooseAccount' && loginStep ? (
            /* ---------------- Account chooser ---------------- */
            <div className="space-y-3">
              <div className="text-center">
                <h2 className="text-lg font-semibold">Akkauntni tanlang</h2>
                <p className="text-sm text-muted-foreground">
                  {loginStep.identity.email} · {loginStep.identity.used}/
                  {loginStep.identity.max || MAX_ACCOUNTS_PER_IDENTITY}
                </p>
              </div>

              {loginStep.accounts.map((account) => (
                <button
                  key={account.id}
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => handleChooseAccount(account)}
                  className="flex w-full items-center gap-3 rounded-2xl border border-border p-3 text-left transition-colors hover:bg-muted disabled:opacity-60"
                >
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={account.avatar_url ?? undefined} alt={account.username ?? ''} />
                    <AvatarFallback>
                      {(account.display_name ?? account.username ?? '?').slice(0, 1).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {account.display_name ?? account.username ?? 'Akkaunt'}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      @{account.username ?? '—'} · slot {account.slot_no}
                      {account.is_primary ? ' · asosiy' : ''}
                    </p>
                  </div>

                  {isSubmitting ? (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  ) : (
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  )}
                </button>
              ))}

              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => {
                  setStep('credentials');
                  setLoginStep(null);
                }}
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Orqaga
              </Button>
            </div>
          ) : (
            <>
              {/* Mode Toggle */}
              <div className="flex rounded-xl bg-muted p-1 mb-6">
                <button
                  type="button"
                  onClick={() => { setMode('login'); resetForm(); }}
                  className={`flex-1 py-2.5 text-sm font-medium rounded-lg transition-all duration-200 ${
                    mode === 'login'
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Kirish
                </button>
                <button
                  type="button"
                  onClick={() => { setMode('signup'); resetForm(); }}
                  className={`flex-1 py-2.5 text-sm font-medium rounded-lg transition-all duration-200 ${
                    mode === 'signup'
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Ro’yxatdan o’tish
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                {mode === 'login' ? (
                  /* Email, username or phone number */
                  <Input
                    type="text"
                    placeholder="Email, username yoki telefon raqam"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    icon={<UserRound className="h-4 w-4" />}
                    autoComplete="username"
                    autoCapitalize="none"
                    spellCheck={false}
                    required
                  />
                ) : (
                  <>
                    <Input
                      type="text"
                      placeholder="To’liq ism"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      icon={<User className="h-4 w-4" />}
                      autoComplete="name"
                      required
                    />

                    <Input
                      type="text"
                      placeholder="Username"
                      value={username}
                      onChange={(e) =>
                        setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))
                      }
                      icon={<AtSign className="h-4 w-4" />}
                      autoComplete="username"
                      autoCapitalize="none"
                      spellCheck={false}
                      required
                    />

                    <Input
                      type="email"
                      placeholder={`username@${ALSAMOS_MAIL_DOMAIN}`}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      icon={<Mail className="h-4 w-4" />}
                      autoComplete="email"
                      autoCapitalize="none"
                      spellCheck={false}
                      required
                    />

                    <Input
                      type="tel"
                      placeholder="+998 90 123 45 67"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      icon={<Phone className="h-4 w-4" />}
                      autoComplete="tel"
                      inputMode="tel"
                      required
                    />
                  </>
                )}

                {/* Password */}
                <div className="relative">
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Parol"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    icon={<Lock className="h-4 w-4" />}
                    autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    aria-label="Parolni ko’rsatish"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>

                {mode === 'signup' && password.length > 0 && (
                  <div className="space-y-1">
                    <div className="h-1.5 w-full rounded-full bg-muted">
                      <div
                        className={`h-1.5 rounded-full transition-all ${passwordStrengthColor(strength.score)}`}
                        style={{ width: `${(strength.score / 4) * 100}%` }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">Parol kuchi: {strength.label}</p>
                    {strength.problems.slice(0, 2).map((problem) => (
                      <p key={problem} className="text-xs text-destructive">{problem}</p>
                    ))}
                  </div>
                )}

                {mode === 'signup' && (
                  <>
                    <div className="relative">
                      <Input
                        type={showConfirmPassword ? 'text' : 'password'}
                        placeholder="Parolni tasdiqlash"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        icon={<Lock className="h-4 w-4" />}
                        autoComplete="new-password"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                        aria-label="Parolni ko’rsatish"
                      >
                        {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>

                    <label className="flex items-start gap-2 text-xs text-muted-foreground">
                      <Checkbox
                        checked={acceptedTerms}
                        onCheckedChange={(value) => setAcceptedTerms(value === true)}
                        className="mt-0.5"
                      />
                      <span>
                        Men{' '}
                        <Link className="text-link hover:text-link-hover hover:underline" to={LEGAL_ROUTES.terms}>
                          Foydalanish shartlari
                        </Link>{' '}
                        va{' '}
                        <Link className="text-link hover:text-link-hover hover:underline" to={LEGAL_ROUTES.privacy}>
                          Maxfiylik siyosati
                        </Link>
                        ni o’qidim va qabul qilaman.
                      </span>
                    </label>
                  </>
                )}

                <Button
                  type="submit"
                  variant="hero"
                  size="lg"
                  className="w-full mt-6"
                  disabled={isSubmitting || (mode === 'signup' && !acceptedTerms)}
                >
                  {isSubmitting ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <>
                      {mode === 'login' ? 'Kirish' : 'Akkaunt yaratish'}
                      {mode === 'login' ? (
                        <ArrowRight className="h-4 w-4 ml-1" />
                      ) : (
                        <Check className="h-4 w-4 ml-1" />
                      )}
                    </>
                  )}
                </Button>
              </form>

              {mode === 'login' && (
                <div className="mt-4 text-center">
                  <Link to="/forgot-password" className="text-sm text-link hover:text-link-hover hover:underline">
                    Parolni unutdingizmi?
                  </Link>
                </div>
              )}
            </>
          )}

          {/* Footer Links */}
          <div className="mt-6 pt-6 border-t border-border">
            <div className="flex justify-center gap-4 text-xs text-muted-foreground">
              <Link to={LEGAL_ROUTES.privacy} className="text-link transition-colors hover:text-link-hover">
                Privacy
              </Link>
              <span>•</span>
              <Link to={LEGAL_ROUTES.terms} className="text-link transition-colors hover:text-link-hover">
                Terms
              </Link>
              <span>•</span>
              <Link to={LEGAL_ROUTES.help} className="text-link transition-colors hover:text-link-hover">
                Help Center
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
