import { useEffect, useState } from 'react';
import { Check, Loader2, LogOut, Plus, ShieldAlert, UserPlus } from 'lucide-react';

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
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { LinkedAccount, useMultiAccount } from '@/hooks/useMultiAccount';
import { isUsernameValid, MAX_ACCOUNTS_PER_IDENTITY } from '@/lib/alsamosAuth';

type SwitchAccountDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type Mode = 'list' | 'create' | 'reauth';

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
    addAccount,
    removeAccount,
  } = useMultiAccount();
  const { toast } = useToast();

  const [mode, setMode] = useState<Mode>('list');
  const [busy, setBusy] = useState(false);
  const [pendingAccount, setPendingAccount] = useState<LinkedAccount | null>(null);
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      refresh();
      setMode('list');
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

    toast({ title: 'Almashtirib bo\u2018lmadi', description: result.error, variant: 'destructive' });
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
      setFormError('Username 3-30 belgi, faqat a-z, 0-9 va _ bo\u2018lishi kerak.');
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
      title: 'Akkaunt olib tashlandi',
      description: 'Sessiya serverda ham bekor qilindi.',
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Akkauntlar</DialogTitle>
          <DialogDescription>
            {identityEmail ? (
              <>
                <span className="font-medium text-foreground">{identityEmail}</span> identifikatori
                ostidagi akkauntlar. Limit: {usedAccounts}/{maxAccounts || MAX_ACCOUNTS_PER_IDENTITY}
              </>
            ) : (
              'Akkauntlaringiz ro\u2018yxati.'
            )}
          </DialogDescription>
        </DialogHeader>

        {mode === 'list' && (
          <div className="space-y-2">
            {isLoading && accounts.length === 0 && (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            )}

            {accounts.map((account) => (
              <div
                key={account.id}
                className="flex items-center gap-3 rounded-xl border border-border p-3"
              >
                <Avatar className="h-10 w-10">
                  <AvatarImage src={account.avatarUrl ?? undefined} alt={account.username ?? ''} />
                  <AvatarFallback>
                    {(account.displayName ?? account.username ?? '?').slice(0, 1).toUpperCase()}
                  </AvatarFallback>
                </Avatar>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium">
                      {account.displayName ?? account.username ?? 'Akkaunt'}
                    </p>
                    {account.isPrimary && <Badge variant="secondary">asosiy</Badge>}
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    @{account.username ?? '—'} · slot {account.slot}
                    {!account.hasLocalSession && !account.isActive && ' · parol so\u2018raladi'}
                  </p>
                </div>

                {account.isActive ? (
                  <Check className="h-5 w-5 text-emerald-500" />
                ) : (
                  <div className="flex items-center gap-1">
                    <Button size="sm" variant="secondary" disabled={busy} onClick={() => handleSwitch(account)}>
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
              className="w-full"
              variant="outline"
              disabled={!canAddAccount || busy}
              onClick={() => setMode('create')}
            >
              <Plus className="mr-2 h-4 w-4" />
              Yangi akkaunt ({usedAccounts}/{maxAccounts || MAX_ACCOUNTS_PER_IDENTITY})
            </Button>

            {!canAddAccount && (
              <p className="flex items-start gap-2 text-xs text-muted-foreground">
                <ShieldAlert className="mt-0.5 h-3.5 w-3.5" />
                Limitga yetdingiz. Yangi akkaunt ochish uchun mavjud akkauntlardan birini uzing.
              </p>
            )}
          </div>
        )}

        {mode === 'create' && (
          <form onSubmit={handleCreate} className="space-y-4">
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
              <Label htmlFor="new-display-name">Ko\u2018rinadigan ism (ixtiyoriy)</Label>
              <Input
                id="new-display-name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                autoComplete="off"
              />
            </div>

            <p className="text-xs text-muted-foreground">
              Yangi akkaunt uchun alohida email yoki parol kerak emas: u
              {identityEmail ? ` ${identityEmail}` : ' identifikatoringiz'} ga bog\u2018lanadi.
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
          <form onSubmit={handleReauth} className="space-y-4">
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">
                @{pendingAccount?.username ?? 'akkaunt'}
              </span>{' '}
              uchun bu qurilmada sessiya yo\u2018q. Identifikator parolini kiriting.
            </p>

            <div className="space-y-2">
              <Label htmlFor="identity-password">{identityEmail ?? 'Identifikator'} paroli</Label>
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
