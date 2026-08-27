import { useEffect, useState } from 'react';
import { Copy, KeyRound, Loader2, RefreshCw, ShieldCheck, ShieldOff } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  AlsamosAuthError,
  disableTwoFactor,
  enableTwoFactor,
  fetchTwoFactorStatus,
  isRecoveryCode,
  isTotpCode,
  regenerateRecoveryCodes,
  startTwoFactorSetup,
  TwoFactorStatus,
} from '@/lib/alsamosAuth';

/** Groups the base32 secret into readable blocks for manual entry. */
function formatSecret(secret: string): string {
  return (secret.match(/.{1,4}/g) ?? []).join(' ');
}

async function copyToClipboard(value: string, message: string) {
  try {
    await navigator.clipboard.writeText(value);
    toast.success(message);
  } catch {
    toast.error('Nusxalab bo’lmadi. Qo’lda ko’chirib oling.');
  }
}

function errorMessage(e: unknown): string {
  return e instanceof AlsamosAuthError ? e.message : 'Kutilmagan xatolik yuz berdi.';
}

export function TwoFactorCard() {
  const [status, setStatus] = useState<TwoFactorStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [setupSecret, setSetupSecret] = useState<string | null>(null);
  const [otpauthUrl, setOtpauthUrl] = useState<string | null>(null);
  const [code, setCode] = useState('');

  const [disableMode, setDisableMode] = useState(false);
  const [disableCode, setDisableCode] = useState('');

  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);

  const reload = async () => {
    try {
      setStatus(await fetchTwoFactorStatus());
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
  }, []);

  const handleStartSetup = async () => {
    setBusy(true);
    try {
      const result = await startTwoFactorSetup();
      setSetupSecret(result.secret);
      setOtpauthUrl(result.otpauth_url);
      setCode('');
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const handleEnable = async () => {
    if (!isTotpCode(code)) {
      toast.error('Ilovadagi 6 xonali kodni kiriting.');
      return;
    }

    setBusy(true);
    try {
      const result = await enableTwoFactor(code);
      setRecoveryCodes(result.recovery_codes);
      setSetupSecret(null);
      setOtpauthUrl(null);
      setCode('');
      toast.success('2FA yoqildi. Zaxira kodlarni saqlab qo’ying.');
      await reload();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const handleDisable = async () => {
    if (!isTotpCode(disableCode) && !isRecoveryCode(disableCode)) {
      toast.error('Tasdiqlash uchun kod kiriting.');
      return;
    }

    setBusy(true);
    try {
      await disableTwoFactor(disableCode);
      setDisableMode(false);
      setDisableCode('');
      setRecoveryCodes(null);
      toast.success('2FA o’chirildi.');
      await reload();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const handleRegenerate = async () => {
    if (!isTotpCode(code) && !isRecoveryCode(code)) {
      toast.error('Yangi kodlar olish uchun joriy kodni kiriting.');
      return;
    }

    setBusy(true);
    try {
      const result = await regenerateRecoveryCodes(code);
      setRecoveryCodes(result.recovery_codes);
      setCode('');
      toast.success('Yangi zaxira kodlar yaratildi. Eskilari ishlamaydi.');
      await reload();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      <div className="p-4 border-b border-border flex items-center gap-3">
        <span className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
          <ShieldCheck className="h-5 w-5 text-primary" />
        </span>
        <div className="min-w-0">
          <h2 className="font-semibold">Ikki qadamli tasdiqlash (2FA)</h2>
          <p className="text-xs text-muted-foreground">
            Autentifikator ilovasi (Google Authenticator, Aegis, 1Password) orqali
          </p>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Yuklanmoqda...
          </div>
        ) : status?.enabled ? (
          <>
            <div className="flex items-center justify-between rounded-xl bg-emerald-500/10 px-4 py-3">
              <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
                2FA yoqilgan
              </p>
              <p className="text-xs text-muted-foreground">
                Zaxira kodlar: {status.codes_left}
              </p>
            </div>

            {status.codes_left <= 2 && (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                Zaxira kodlar tugab qolmoqda. Yangilarini oling.
              </p>
            )}

            {!disableMode ? (
              <div className="space-y-3">
                <Input
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 20))}
                  placeholder="Joriy kod (6 xonali yoki zaxira kod)"
                  icon={<KeyRound className="h-4 w-4" />}
                  inputMode="text"
                  autoComplete="one-time-code"
                />

                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" disabled={busy} onClick={handleRegenerate}>
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Yangi zaxira kodlar
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive"
                    onClick={() => setDisableMode(true)}
                  >
                    <ShieldOff className="mr-2 h-4 w-4" />
                    2FA ni o’chirish
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-3 rounded-xl border border-destructive/30 p-3">
                <p className="text-sm">
                  O’chirish uchun joriy kodni kiriting. Bu akkauntingiz himoyasini
                  kamaytiradi.
                </p>
                <Input
                  value={disableCode}
                  onChange={(e) => setDisableCode(e.target.value.toUpperCase().slice(0, 20))}
                  placeholder="Kod"
                  icon={<KeyRound className="h-4 w-4" />}
                  autoComplete="one-time-code"
                />
                <div className="flex gap-2">
                  <Button variant="destructive" size="sm" disabled={busy} onClick={handleDisable}>
                    {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    O’chirish
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setDisableMode(false);
                      setDisableCode('');
                    }}
                  >
                    Bekor qilish
                  </Button>
                </div>
              </div>
            )}
          </>
        ) : setupSecret ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              1. Autentifikator ilovasida "kalitni qo’lda kiritish" ni tanlang va quyidagi
              maxfiy kalitni kiriting.
            </p>

            <div className="flex items-center gap-2 rounded-xl bg-muted px-3 py-2">
              <code className="flex-1 break-all text-sm tracking-wider">
                {formatSecret(setupSecret)}
              </code>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => copyToClipboard(setupSecret, 'Kalit nusxalandi')}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>

            {otpauthUrl && (
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => copyToClipboard(otpauthUrl, 'otpauth havolasi nusxalandi')}
              >
                otpauth havolasini nusxalash
              </Button>
            )}

            <p className="text-sm text-muted-foreground">
              2. Ilova ko’rsatgan 6 xonali kodni kiriting.
            </p>

            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
              placeholder="123456"
              icon={<KeyRound className="h-4 w-4" />}
              inputMode="numeric"
              autoComplete="one-time-code"
              className="text-center tracking-[0.4em]"
            />

            <div className="flex gap-2">
              <Button variant="hero" size="sm" disabled={busy} onClick={handleEnable}>
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Yoqish
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSetupSecret(null);
                  setOtpauthUrl(null);
                  setCode('');
                }}
              >
                Bekor qilish
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              2FA yoqilganda parol to’g’ri bo’lsa ham kirish uchun ilovadagi vaqtinchalik
              kod so’raladi. Bu parol o’g’irlansa ham akkauntni himoya qiladi.
            </p>
            <Button variant="hero" size="sm" disabled={busy} onClick={handleStartSetup}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              2FA ni yoqish
            </Button>
          </div>
        )}

        {recoveryCodes && (
          <div className="space-y-2 rounded-xl border border-amber-500/40 bg-amber-500/5 p-3">
            <p className="text-sm font-medium">Zaxira kodlar (faqat bir marta ko’rsatiladi)</p>
            <p className="text-xs text-muted-foreground">
              Telefoningizni yo’qotsangiz shu kodlar bilan kirasiz. Har bir kod bir marta
              ishlaydi. Serverda faqat ularning xeshi saqlanadi.
            </p>
            <div className="grid grid-cols-2 gap-1 font-mono text-sm">
              {recoveryCodes.map((item) => (
                <span key={item}>{item}</span>
              ))}
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => copyToClipboard(recoveryCodes.join('\n'), 'Kodlar nusxalandi')}
              >
                <Copy className="mr-2 h-4 w-4" />
                Nusxalash
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setRecoveryCodes(null)}>
                Saqlab oldim
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default TwoFactorCard;
