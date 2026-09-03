import { useEffect, useState } from 'react';
import { Check, ChevronLeft, Loader2, LogIn, LogOut, Plus, ShieldAlert, UserPlus } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { LinkedAccount, useMultiAccount } from '@/hooks/useMultiAccount';
import { isUsernameValid, MAX_ACCOUNTS_PER_IDENTITY } from '@/lib/alsamosAuth';

type SwitchAccountDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type Mode = 'list' | 'add-existing' | 'create' | 'reauth';

export function SwitchAccountDialog({ open, onOpenChange }: SwitchAccountDialogProps) {
  const {
    accounts,
    identityEmail,
    maxAccounts,
    usedAccounts,
    canAddAccount,
    isLoading,
    refresh,
    switchToAccount,
    authenticateAccount,
    addExistingAccount,
    addAccount,
    removeAccount,
  } = useMultiAccount(open);
  const { toast } = useToast();

  const [mode, setMode] = useState<Mode>('list');
  const [busy, setBusy] = useState(false);
  const [pendingAccount, setPendingAccount] = useState<LinkedAccount | null>(null);
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      refresh();
      setMode('list');
      setIdentifier('');
      setPassword('');
      setUsername('');
      setDisplayName('');
      setFormError(null);
      setPendingAccount(null);
    }
  }, [open, refresh]);

  const handleSwitch = async (account: LinkedAccount) => {
    setBusy(true);
    const result = await switchToAccount(account);
    setBusy(false);

    if (result.ok) return;

    if ('needsPassword' in result) {
      // The session for this slot is gone (expired or removed): the identity
      // password is required to mint a new one.
      setPendingAccount(account);
      setMode('reauth');
      return;
    }

    toast({ title: 'Almashtirib bo’lmadi', description: 'error' in result ? result.error : undefined, variant: 'destructive' });
  };

  const handleAddExisting = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!identifier.trim() || !password) {
      setFormError('Login va parolni kiriting.');
      return;
    }

    setBusy(true);
    const result = await addExistingAccount(identifier.trim(), password);
    setBusy(false);

    if (!result.ok) {
      setFormError('error' in result ? result.error : 'Akkaunt qo‘shilmadi.');
    }
  };

  const handleReauth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingAccount) return;

    setFormError(null);
    setBusy(true);
    const result = await authenticateAccount(pendingAccount, password);
    setBusy(false);

    if (!result.ok) {
      setFormError('error' in result ? result.error : 'Parol tasdiqlanmadi.');
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const normalized = username.trim().toLowerCase();
    if (!isUsernameValid(normalized)) {
      setFormError('Username 3-30 belgi, faqat a-z, 0-9 va _ bo’lishi kerak.');
      return;
    }

    setBusy(true);
    const result = await addAccount(normalized, displayName.trim() || undefined);
    setBusy(false);

    if (!result.ok) {
      setFormError('error' in result ? result.error : 'Akkaunt yaratilmadi.');
    }
  };

  const handleRemove = async (account: LinkedAccount) => {
    setBusy(true);
    const result = await removeAccount(account, 'signout');
    setBusy(false);

    if (!result.ok) {
      toast({
        title: 'Olib tashlanmadi',
        description: 'error' in result ? result.error : '',
        variant: 'destructive',
      });
      return;
    }

    toast({
      title: 'Akkaunt qurilmadan olib tashlandi',
      description: 'Saqlangan lokal sessiya va account kartasi tozalandi.',
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden p-0 sm:max-w-[460px]">
        <div className="border-b border-border/60 px-5 pb-4 pt-5">
          <DialogHeader className="text-left">
            <div className="flex items-start gap-2">
              {mode !== 'list' && (
                <button
                  type="button"
                  onClick={() => {
                    setMode('list');
                    setIdentifier('');
                    setPassword('');
                    setFormError(null);
                    setPendingAccount(null);
                  }}
                  className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition hover:bg-muted"
                  aria-label="Orqaga"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
              )}
              <div>
                <DialogTitle>
                  {mode === 'list'
                    ? 'Hisobni almashtirish'
                    : mode === 'add-existing'
                      ? 'Akkaunt qo‘shish'
                      : mode === 'create'
                        ? 'Yangi profil'
                        : 'Qayta kirish'}
                </DialogTitle>
                <DialogDescription className="mt-1">
                  {mode === 'list'
                    ? 'Ushbu qurilmada saqlangan akkauntlar.'
                    : mode === 'add-existing'
                      ? 'Mavjud akkauntga kiring — keyin bir bosishda almashtirasiz.'
                      : mode === 'create'
                        ? 'Joriy identifikator ostida yangi profil yarating.'
                        : 'Saqlangan akkaunt sessiyasini yangilang.'}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
        </div>

        {mode === 'list' && (
          <div className="max-h-[68dvh] space-y-2 overflow-y-auto px-3 py-3">
            {isLoading && accounts.length === 0 && (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            )}

            {accounts.map((account) => (
              <div
                key={account.id}
                className={cn(
                  'flex items-center gap-3 rounded-2xl px-3 py-2.5 transition',
                  account.isActive
                    ? 'bg-primary/[0.07] ring-1 ring-primary/15'
                    : 'hover:bg-muted/70',
                )}
              >
                <Avatar className="h-10 w-10">
                  <AvatarImage src={account.avatarUrl ?? undefined} alt={account.username ?? ''} />
                  <AvatarFallback>
                    {(account.displayName ?? account.username ?? '?').slice(0, 1).toUpperCase()}
                  </AvatarFallback>
                </Avatar>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-semibold">
                      {account.username ? '@' + account.username : account.displayName ?? 'Akkaunt'}
                    </p>
                    {account.isActive && (
                      <span className="text-[11px] font-medium text-primary">Joriy</span>
                    )}
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {account.displayName ?? account.identityEmail ?? 'Alsamos'}
                  </p>
                  {!account.isActive && (
                    <p className="mt-0.5 text-[11px] text-muted-foreground/80">
                      {account.hasLocalSession
                        ? 'Bir bosishda kirish'
                        : 'Parol bilan qayta kirish kerak'}
                    </p>
                  )}
                </div>

                {account.isActive ? (
                  <Check className="h-5 w-5 text-emerald-500" />
                ) : (
                  <div className="flex items-center gap-1">
                    <Button size="sm" variant="ghost" disabled={busy} onClick={() => handleSwitch(account)}>
                      <LogIn className="mr-1.5 h-4 w-4" />
                      Kirish
                    </Button>
                    {account.hasLocalSession && (
                      <Button
                        size="icon"
                        variant="ghost"
                        disabled={busy}
                        aria-label="Qurilmadan olib tashlash"
                        onClick={() => handleRemove(account)}
                      >
                        <LogOut className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                )}
              </div>
            ))}

            <Separator className="my-2" />

            <Button
              className="w-full justify-start rounded-xl"
              variant="ghost"
              disabled={busy}
              onClick={() => {
                setIdentifier('');
                setPassword('');
                setFormError(null);
                setMode('add-existing');
              }}
            >
              <span className="mr-3 flex h-9 w-9 items-center justify-center rounded-full border border-border">
                <Plus className="h-4 w-4" />
              </span>
              <span className="text-left">
                <span className="block text-sm font-semibold">Boshqa akkaunt qo‘shish</span>
                <span className="block text-xs font-normal text-muted-foreground">
                  Mavjud akkauntga kirib, shu qurilmada saqlash
                </span>
              </span>
            </Button>

            {canAddAccount && (
              <Button
                className="w-full justify-start rounded-xl"
                variant="ghost"
                disabled={busy}
                onClick={() => setMode('create')}
              >
                <span className="mr-3 flex h-9 w-9 items-center justify-center rounded-full border border-border">
                  <UserPlus className="h-4 w-4" />
                </span>
                <span className="text-left">
                  <span className="block text-sm font-semibold">Yangi profil yaratish</span>
                  <span className="block text-xs font-normal text-muted-foreground">
                    {identityEmail
                      ? identityEmail + ' identifikatori ostida'
                      : 'Joriy identifikator ostida'}
                  </span>
                </span>
              </Button>
            )}

            {!canAddAccount && usedAccounts >= (maxAccounts || MAX_ACCOUNTS_PER_IDENTITY) && (
              <p className="flex items-start gap-2 px-2 text-xs text-muted-foreground">
                <ShieldAlert className="mt-0.5 h-3.5 w-3.5" />
                Joriy identifikatorda yangi profil limiti to‘lgan.
              </p>
            )}

            <p className="px-2 pt-1 text-[11px] text-muted-foreground">
              Parol va tokenlar account ro‘yxatiga yozilmaydi. Faqat avatar, username va saqlangan account tanlovi eslab qolinadi.
            </p>
          </div>
        )}

        {mode === 'add-existing' && (
          <form onSubmit={handleAddExisting} className="space-y-4 px-5 py-5">
            <div className="space-y-2">
              <Label htmlFor="switch-identifier">Email, username yoki telefon</Label>
              <Input
                id="switch-identifier"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="samandar yoki name@alsamos.com"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                autoFocus
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="switch-password">Parol</Label>
              <Input
                id="switch-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            {formError && <p className="text-sm text-destructive">{formError}</p>}

            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <LogIn className="mr-2 h-4 w-4" />
              )}
              Kirish va saqlash
            </Button>
          </form>
        )}

        {mode === 'create' && (
          <form onSubmit={handleCreate} className="space-y-4 px-5 py-5">
            <div className="space-y-2">
              <Label htmlFor="new-username">Username</Label>
              <Input
                id="new-username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="masalan: samandar_work"
                autoComplete="off"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="new-display-name">Ko’rinadigan ism (ixtiyoriy)</Label>
              <Input
                id="new-display-name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                autoComplete="off"
              />
            </div>

            <p className="text-xs text-muted-foreground">
              Yangi akkaunt uchun alohida email yoki parol kerak emas: u
              {identityEmail ? ` ${identityEmail}` : ' identifikatoringiz'} ga bog’lanadi.
            </p>

            {formError && <p className="text-sm text-destructive">{formError}</p>}

            <div className="flex gap-2">
              <Button type="button" variant="ghost" className="flex-1" onClick={() => setMode('list')}>
                Orqaga
              </Button>
              <Button type="submit" className="flex-1" disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="mr-2 h-4 w-4" />}
                Yaratish
              </Button>
            </div>
          </form>
        )}

        {mode === 'reauth' && (
          <form onSubmit={handleReauth} className="space-y-4 px-5 py-5">
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">
                @{pendingAccount?.username ?? 'akkaunt'}
              </span>{' '}
              uchun bu qurilmada sessiya yo’q. Identifikator parolini kiriting.
            </p>

            <div className="space-y-2">
              <Label htmlFor="identity-password">
                {pendingAccount?.identityEmail ?? identityEmail ?? 'Akkaunt'} paroli
              </Label>
              <Input
                id="identity-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            {formError && <p className="text-sm text-destructive">{formError}</p>}

            <div className="flex gap-2">
              <Button type="button" variant="ghost" className="flex-1" onClick={() => setMode('list')}>
                Orqaga
              </Button>
              <Button type="submit" className="flex-1" disabled={busy}>
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Tasdiqlash
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
