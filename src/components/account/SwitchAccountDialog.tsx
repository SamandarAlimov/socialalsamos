import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Check,
  ChevronLeft,
  Loader2,
  LogIn,
  Plus,
  ShieldAlert,
  Trash2,
  UserPlus,
} from 'lucide-react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { useIsMobile } from '@/hooks/use-mobile';
import { LinkedAccount, useMultiAccount } from '@/hooks/useMultiAccount';
import { isUsernameValid, MAX_ACCOUNTS_PER_IDENTITY } from '@/lib/alsamosAuth';
import { cn } from '@/lib/utils';

type SwitchAccountDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type Mode = 'list' | 'add-existing' | 'create' | 'reauth';
type BusyAction = 'switch' | 'add' | 'create' | 'reauth' | 'remove' | null;

function modeTitle(mode: Mode) {
  if (mode === 'add-existing') return 'Akkaunt qo‘shish';
  if (mode === 'create') return 'Yangi profil';
  if (mode === 'reauth') return 'Qayta kirish';
  return 'Hisobni almashtirish';
}

function modeDescription(mode: Mode) {
  if (mode === 'add-existing') {
    return 'Mavjud akkauntga kiring — keyin uni bir bosishda almashtirasiz.';
  }
  if (mode === 'create') {
    return 'Joriy identifikator ostida yangi profil yarating.';
  }
  if (mode === 'reauth') {
    return 'Saqlangan akkaunt sessiyasini xavfsiz yangilang.';
  }
  return 'Ushbu qurilmada saqlangan akkauntlar.';
}

function AccountSkeleton() {
  return (
    <div className="space-y-2 px-1 py-1" aria-hidden>
      {[0, 1, 2].map((item) => (
        <div key={item} className="flex animate-pulse items-center gap-3 rounded-2xl px-3 py-3">
          <div className="h-11 w-11 rounded-full bg-muted" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-3.5 w-28 rounded-full bg-muted" />
            <div className="h-3 w-40 rounded-full bg-muted/70" />
          </div>
          <div className="h-7 w-16 rounded-full bg-muted/70" />
        </div>
      ))}
    </div>
  );
}

export function SwitchAccountDialog({ open, onOpenChange }: SwitchAccountDialogProps) {
  const {
    accounts,
    identityEmail,
    maxAccounts,
    usedAccounts,
    canAddAccount,
    isLoading,
    error,
    refresh,
    switchToAccount,
    authenticateAccount,
    addExistingAccount,
    addAccount,
    removeAccount,
    setSaveLoginInfo,
  } = useMultiAccount(open);

  const { toast } = useToast();
  const isMobile = useIsMobile();

  const [mode, setMode] = useState<Mode>('list');
  const [busyAction, setBusyAction] = useState<BusyAction>(null);
  const [busyAccountId, setBusyAccountId] = useState<string | null>(null);
  const [pendingAccount, setPendingAccount] = useState<LinkedAccount | null>(null);
  const [removeTarget, setRemoveTarget] = useState<LinkedAccount | null>(null);

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [saveLoginOnAdd, setSaveLoginOnAdd] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);

  const switchingAccount = useMemo(
    () => accounts.find((account) => account.userId === busyAccountId) ?? null,
    [accounts, busyAccountId],
  );

  useEffect(() => {
    if (!open) return;

    void refresh();
    setMode('list');
    setBusyAction(null);
    setBusyAccountId(null);
    setPendingAccount(null);
    setRemoveTarget(null);
    setIdentifier('');
    setPassword('');
    setUsername('');
    setDisplayName('');
    setSaveLoginOnAdd(true);
    setFormError(null);
  }, [open, refresh]);

  const returnToList = () => {
    setMode('list');
    setPendingAccount(null);
    setIdentifier('');
    setPassword('');
    setUsername('');
    setDisplayName('');
    setFormError(null);
  };

  const handleSwitch = async (account: LinkedAccount) => {
    if (account.isActive || busyAction) return;

    setBusyAction('switch');
    setBusyAccountId(account.userId);

    const result = await switchToAccount(account);

    if (result.ok) return;

    setBusyAction(null);
    setBusyAccountId(null);

    if ('needsPassword' in result) {
      setPendingAccount(account);
      setPassword('');
      setFormError(null);
      setMode('reauth');
      return;
    }

    toast({
      title: 'Akkaunt almashtirilmadi',
      description: 'error' in result ? result.error : undefined,
      variant: 'destructive',
    });
  };

  const handleAddExisting = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);

    if (!identifier.trim() || !password) {
      setFormError('Login va parolni kiriting.');
      return;
    }

    setBusyAction('add');
    const result = await addExistingAccount(
      identifier.trim(),
      password,
      saveLoginOnAdd,
    );

    if (result.ok) return;

    setBusyAction(null);
    setFormError('error' in result ? result.error : 'Akkaunt qo‘shilmadi.');
  };

  const handleReauth = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!pendingAccount) return;

    setFormError(null);
    setBusyAction('reauth');
    setBusyAccountId(pendingAccount.userId);

    const result = await authenticateAccount(pendingAccount, password);

    if (result.ok) return;

    setBusyAction(null);
    setBusyAccountId(null);
    setFormError('error' in result ? result.error : 'Parol tasdiqlanmadi.');
  };

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);

    const normalized = username.trim().toLowerCase();
    if (!isUsernameValid(normalized)) {
      setFormError('Username 3–30 belgi, faqat a-z, 0-9 va _ bo‘lishi kerak.');
      return;
    }

    setBusyAction('create');
    const result = await addAccount(normalized, displayName.trim() || undefined);

    if (result.ok) return;

    setBusyAction(null);
    setFormError('error' in result ? result.error : 'Profil yaratilmadi.');
  };

  const handleConfirmRemove = async (event: React.MouseEvent) => {
    event.preventDefault();
    if (!removeTarget) return;

    const account = removeTarget;
    setBusyAction('remove');
    setBusyAccountId(account.userId);

    const result = await removeAccount(account, 'signout');

    if (!result.ok) {
      setBusyAction(null);
      setBusyAccountId(null);
      toast({
        title: 'Qurilmadan olib tashlanmadi',
        description: 'error' in result ? result.error : '',
        variant: 'destructive',
      });
      return;
    }

    setRemoveTarget(null);
    setBusyAction(null);
    setBusyAccountId(null);
    toast({
      title: 'Akkaunt qurilmadan olib tashlandi',
      description: 'Lokal sessiya va saqlangan login kartasi tozalandi.',
    });
  };

  const accountList = (
    <div className="space-y-2">
      {isLoading && accounts.length === 0 ? (
        <AccountSkeleton />
      ) : accounts.length === 0 ? (
        <div className="px-5 py-10 text-center">
          <p className="text-sm font-semibold">Saqlangan akkaunt yo‘q</p>
          <p className="mx-auto mt-1 max-w-[290px] text-xs leading-5 text-muted-foreground">
            Boshqa akkauntga bir marta kirsangiz, keyingi safar shu yerdan tez almashtirasiz.
          </p>
        </div>
      ) : (
        <AnimatePresence initial={false}>
          {accounts.map((account) => {
            const accountBusy = busyAccountId === account.userId;
            return (
              <motion.div
                layout
                key={account.userId + '-' + account.slot}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                transition={{ duration: 0.18 }}
                className={cn(
                  'rounded-2xl px-3 py-2.5 transition-colors',
                  account.isActive
                    ? 'bg-primary/[0.07] ring-1 ring-primary/15'
                    : 'hover:bg-muted/60',
                )}
              >
                <motion.button
                  type="button"
                  disabled={account.isActive || Boolean(busyAction)}
                  onClick={() => void handleSwitch(account)}
                  whileTap={account.isActive ? undefined : { scale: 0.985 }}
                  className="flex w-full items-center gap-3 text-left disabled:cursor-default"
                >
                  <div className="relative shrink-0">
                    <Avatar className="h-11 w-11 ring-1 ring-border/60">
                      <AvatarImage
                        src={account.avatarUrl ?? undefined}
                        alt={account.username ?? account.displayName ?? 'Akkaunt'}
                      />
                      <AvatarFallback>
                        {(account.displayName ?? account.username ?? '?')
                          .slice(0, 1)
                          .toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    {account.isActive && (
                      <span className="absolute -bottom-0.5 -right-0.5 flex h-[18px] w-[18px] items-center justify-center rounded-full bg-primary text-primary-foreground ring-2 ring-background">
                        <Check className="h-3 w-3" strokeWidth={3} />
                      </span>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-semibold">
                        {account.username
                          ? '@' + account.username
                          : account.displayName ?? 'Akkaunt'}
                      </p>
                      {account.isActive && (
                        <span className="text-[11px] font-medium text-primary">Joriy</span>
                      )}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {account.displayName ?? account.identityEmail ?? 'Alsamos'}
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground/80">
                      {account.hasLocalSession
                        ? account.saveLoginInfo
                          ? 'Login saqlangan · tez kirish'
                          : 'Sessiya faol · logoutdan keyin saqlanmaydi'
                        : 'Sessiya tugagan · parol bilan qayta kirish'}
                    </p>
                  </div>

                  {accountBusy ? (
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
                  ) : !account.isActive ? (
                    <LogIn className="h-4 w-4 shrink-0 text-muted-foreground" />
                  ) : null}
                </motion.button>

                <div className="ml-14 mt-2 flex items-center justify-between gap-3 border-t border-border/45 pt-2">
                  <label className="flex min-w-0 items-center gap-2 text-[11px] text-muted-foreground">
                    <Switch
                      checked={account.saveLoginInfo}
                      onCheckedChange={(checked) => setSaveLoginInfo(account, checked)}
                      disabled={Boolean(busyAction)}
                      className="scale-[0.78] origin-left"
                      aria-label="Login ma’lumotini saqlash"
                    />
                    <span className="truncate">Login ma’lumotini saqlash</span>
                  </label>

                  <button
                    type="button"
                    disabled={Boolean(busyAction)}
                    onClick={() => setRemoveTarget(account)}
                    className="flex h-7 items-center gap-1.5 rounded-lg px-2 text-[11px] text-muted-foreground transition hover:bg-destructive/8 hover:text-destructive disabled:opacity-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Olib tashlash
                  </button>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      )}

      {error && (
        <p className="mx-2 rounded-xl bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </p>
      )}

      <Separator className="my-2" />

      <motion.button
        type="button"
        whileTap={{ scale: 0.99 }}
        disabled={Boolean(busyAction)}
        onClick={() => {
          setIdentifier('');
          setPassword('');
          setSaveLoginOnAdd(true);
          setFormError(null);
          setMode('add-existing');
        }}
        className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition hover:bg-muted/70 disabled:opacity-50"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-background">
          <Plus className="h-5 w-5" />
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold">Boshqa akkaunt qo‘shish</span>
          <span className="block truncate text-xs text-muted-foreground">
            Mavjud akkauntga kirib, shu qurilmada saqlash
          </span>
        </span>
      </motion.button>

      {canAddAccount && (
        <motion.button
          type="button"
          whileTap={{ scale: 0.99 }}
          disabled={Boolean(busyAction)}
          onClick={() => setMode('create')}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition hover:bg-muted/70 disabled:opacity-50"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-background">
            <UserPlus className="h-5 w-5" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold">Yangi profil yaratish</span>
            <span className="block truncate text-xs text-muted-foreground">
              {identityEmail
                ? identityEmail + ' identifikatori ostida'
                : 'Joriy identifikator ostida'}
            </span>
          </span>
        </motion.button>
      )}

      {!canAddAccount && usedAccounts >= (maxAccounts || MAX_ACCOUNTS_PER_IDENTITY) && (
        <p className="flex items-start gap-2 px-3 py-1 text-xs text-muted-foreground">
          <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Joriy identifikatorda yangi profil limiti to‘lgan.
        </p>
      )}

      <p className="px-3 pb-1 pt-1 text-[11px] leading-4 text-muted-foreground">
        Parol va tokenlar account ro‘yxatiga yozilmaydi. Faqat xavfsiz profil metama’lumotlari eslab qolinadi.
      </p>
    </div>
  );

  const addExistingForm = (
    <form onSubmit={handleAddExisting} className="space-y-4 px-5 py-5">
      <div className="space-y-2">
        <Label htmlFor="switch-identifier">Email, username yoki telefon</Label>
        <Input
          id="switch-identifier"
          value={identifier}
          onChange={(event) => setIdentifier(event.target.value)}
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
          onChange={(event) => setPassword(event.target.value)}
          required
        />
      </div>

      <div className="flex items-center justify-between gap-4 rounded-2xl border border-border/60 px-3.5 py-3">
        <div>
          <p className="text-sm font-medium">Login ma’lumotini saqlash</p>
          <p className="mt-0.5 text-xs leading-4 text-muted-foreground">
            Keyingi safar account kartasi shu qurilmada qoladi.
          </p>
        </div>
        <Switch
          checked={saveLoginOnAdd}
          onCheckedChange={setSaveLoginOnAdd}
          disabled={Boolean(busyAction)}
          aria-label="Login ma’lumotini saqlash"
        />
      </div>

      {formError && <p className="text-sm text-destructive">{formError}</p>}

      <Button type="submit" className="w-full rounded-xl" disabled={Boolean(busyAction)}>
        {busyAction === 'add' ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <LogIn className="mr-2 h-4 w-4" />
        )}
        Kirish
      </Button>
    </form>
  );

  const createForm = (
    <form onSubmit={handleCreate} className="space-y-4 px-5 py-5">
      <div className="space-y-2">
        <Label htmlFor="new-username">Username</Label>
        <Input
          id="new-username"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          placeholder="masalan: samandar_work"
          autoComplete="off"
          autoFocus
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="new-display-name">Ko‘rinadigan ism</Label>
        <Input
          id="new-display-name"
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          autoComplete="off"
        />
      </div>

      <p className="text-xs leading-5 text-muted-foreground">
        Yangi profil alohida parol talab qilmaydi va joriy Alsamos identifikatoriga bog‘lanadi.
      </p>

      {formError && <p className="text-sm text-destructive">{formError}</p>}

      <Button type="submit" className="w-full rounded-xl" disabled={Boolean(busyAction)}>
        {busyAction === 'create' ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <UserPlus className="mr-2 h-4 w-4" />
        )}
        Profil yaratish
      </Button>
    </form>
  );

  const reauthForm = (
    <form onSubmit={handleReauth} className="space-y-4 px-5 py-5">
      {pendingAccount && (
        <div className="flex items-center gap-3 rounded-2xl bg-muted/55 p-3">
          <Avatar className="h-11 w-11">
            <AvatarImage src={pendingAccount.avatarUrl ?? undefined} />
            <AvatarFallback>
              {(pendingAccount.displayName ?? pendingAccount.username ?? '?')
                .slice(0, 1)
                .toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">
              {pendingAccount.username ? '@' + pendingAccount.username : 'Akkaunt'}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {pendingAccount.displayName ?? pendingAccount.identityEmail ?? 'Alsamos'}
            </p>
          </div>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="identity-password">
          {pendingAccount?.identityEmail ?? identityEmail ?? 'Akkaunt'} paroli
        </Label>
        <Input
          id="identity-password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoFocus
          required
        />
      </div>

      {formError && <p className="text-sm text-destructive">{formError}</p>}

      <Button type="submit" className="w-full rounded-xl" disabled={Boolean(busyAction)}>
        {busyAction === 'reauth' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Kirish
      </Button>
    </form>
  );

  const body = (
    <div className="relative min-h-0">
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={mode}
          initial={{ opacity: 0, x: mode === 'list' ? -6 : 8 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: mode === 'list' ? -6 : 6 }}
          transition={{ duration: 0.16, ease: 'easeOut' }}
          className={cn(
            mode === 'list'
              ? 'max-h-[64dvh] overflow-y-auto overscroll-contain px-3 py-3'
              : 'overflow-y-auto',
          )}
        >
          {mode === 'list'
            ? accountList
            : mode === 'add-existing'
              ? addExistingForm
              : mode === 'create'
                ? createForm
                : reauthForm}
        </motion.div>
      </AnimatePresence>

      <AnimatePresence>
        {busyAction === 'switch' && switchingAccount && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-20 flex items-center justify-center bg-background/88 px-6 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.96, y: 4 }}
              animate={{ scale: 1, y: 0 }}
              className="flex min-w-[220px] items-center gap-3 rounded-2xl border border-border/60 bg-background px-4 py-3 shadow-xl"
            >
              <Avatar className="h-10 w-10">
                <AvatarImage src={switchingAccount.avatarUrl ?? undefined} />
                <AvatarFallback>
                  {(switchingAccount.displayName ?? switchingAccount.username ?? '?')
                    .slice(0, 1)
                    .toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">
                  {switchingAccount.username
                    ? '@' + switchingAccount.username
                    : switchingAccount.displayName ?? 'Akkaunt'}
                </p>
                <p className="text-xs text-muted-foreground">Almashtirilmoqda…</p>
              </div>
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );

  const headerBack = mode !== 'list' ? (
    <button
      type="button"
      onClick={returnToList}
      className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition hover:bg-muted"
      aria-label="Orqaga"
    >
      <ChevronLeft className="h-5 w-5" />
    </button>
  ) : null;

  const surface = isMobile ? (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      shouldScaleBackground={false}
      dismissible={!busyAction}
    >
      <DrawerContent className="max-h-[86dvh] overflow-hidden rounded-t-[28px] border-border/70 pb-[env(safe-area-inset-bottom)] shadow-2xl [&>div:first-child]:mt-2.5 [&>div:first-child]:h-1 [&>div:first-child]:w-10">
        <DrawerHeader className="shrink-0 border-b border-border/60 px-5 pb-4 pt-3 text-left">
          <div className="flex items-start gap-2">
            {headerBack}
            <div className="min-w-0">
              <DrawerTitle className="text-base">{modeTitle(mode)}</DrawerTitle>
              <DrawerDescription className="mt-1 text-xs leading-4">
                {modeDescription(mode)}
              </DrawerDescription>
            </div>
          </div>
        </DrawerHeader>
        {body}
      </DrawerContent>
    </Drawer>
  ) : (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (busyAction) return;
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent className="overflow-hidden p-0 sm:max-w-[470px]">
        <div className="border-b border-border/60 px-5 pb-4 pt-5">
          <DialogHeader className="text-left">
            <div className="flex items-start gap-2">
              {headerBack}
              <div className="min-w-0">
                <DialogTitle>{modeTitle(mode)}</DialogTitle>
                <DialogDescription className="mt-1">
                  {modeDescription(mode)}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
        </div>
        {body}
      </DialogContent>
    </Dialog>
  );

  return (
    <>
      {surface}

      <AlertDialog
        open={Boolean(removeTarget)}
        onOpenChange={(nextOpen) => {
          if (!nextOpen && busyAction !== 'remove') setRemoveTarget(null);
        }}
      >
        <AlertDialogContent className="max-w-[420px] rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {removeTarget?.username
                ? '@' + removeTarget.username + ' qurilmadan olib tashlansinmi?'
                : 'Akkaunt qurilmadan olib tashlansinmi?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Bu accountning o‘zi o‘chirilmaydi. Faqat shu qurilmadagi saqlangan login kartasi va lokal sessiya tozalanadi.
              {removeTarget?.isActive
                ? ' Joriy accountdan ham chiqiladi.'
                : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={busyAction === 'remove'}>
              Bekor qilish
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => void handleConfirmRemove(event)}
              disabled={busyAction === 'remove'}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {busyAction === 'remove' && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Olib tashlash
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
