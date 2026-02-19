import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useMultiAccount } from '@/hooks/useMultiAccount';
import { useAuth } from '@/contexts/AuthContext';
import {
  Check,
  Plus,
  Trash2,
  User,
  Loader2,
  ChevronRight,
  ArrowLeft,
  AlertCircle,
  Eye,
  EyeOff,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

interface SwitchAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type View = 'list' | 'add';

export function SwitchAccountDialog({ open, onOpenChange }: SwitchAccountDialogProps) {
  const { accounts, activeAccountId, isLoading, switchToAccount, addAccount, removeAccount } =
    useMultiAccount();
  const { user } = useAuth();
  const { toast } = useToast();

  const [view, setView] = useState<View>('list');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [addingAccount, setAddingAccount] = useState(false);
  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const handleSwitchAccount = async (accountId: string) => {
    if (accountId === user?.id || isLoading) return;

    setSwitchingId(accountId);
    const result = await switchToAccount(accountId);
    setSwitchingId(null);

    if (result.error) {
      if (result.needsReauth) {
        toast({
          title: 'Sessiya muddati tugagan',
          description: 'Iltimos, bu akkauntga qayta kiring.',
          variant: 'destructive',
        });
        removeAccount(accountId);
      } else {
        toast({
          title: "O'tish muvaffaqiyatsiz",
          description: result.error.message,
          variant: 'destructive',
        });
      }
    }
  };

  const handleAddAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;

    setError(null);
    setAddingAccount(true);
    const result = await addAccount(email, password);
    setAddingAccount(false);

    if (result.error) {
      setError(result.error.message || "Akkaunt qo'shib bo'lmadi. Ma'lumotlarni tekshiring.");
    } else {
      resetAddForm();
      onOpenChange(false);
    }
  };

  const handleRemoveAccount = async (accountId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (accountId === user?.id) {
      toast({
        title: "O'chirib bo'lmaydi",
        description: 'Faol akkauntni o\'chirib bo\'lmaydi.',
        variant: 'destructive',
      });
      return;
    }
    setRemovingId(accountId);
    setTimeout(() => {
      removeAccount(accountId);
      setRemovingId(null);
      toast({
        title: "Akkaunt o'chirildi",
        description: "Akkaunt qurilmangizdan o'chirildi.",
      });
    }, 300);
  };

  const resetAddForm = () => {
    setView('list');
    setEmail('');
    setPassword('');
    setShowPassword(false);
    setError(null);
  };

  const currentAccount = accounts.find((a) => a.id === user?.id);
  const otherAccounts = accounts.filter((a) => a.id !== user?.id);

  const getInitials = (name: string | null, email: string) => {
    if (name) return name.slice(0, 2).toUpperCase();
    return email.slice(0, 2).toUpperCase();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-sm p-0 gap-0 overflow-hidden rounded-2xl z-[10001]"
        onInteractOutside={(e) => e.preventDefault()}
      >
        {/* Header */}
        <DialogHeader className="px-5 pt-5 pb-4 border-b border-border/50">
          <div className="flex items-center gap-3">
            {view === 'add' && (
              <button
                onClick={resetAddForm}
                className="flex items-center justify-center h-8 w-8 rounded-full hover:bg-muted transition-colors"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
            )}
            <div className="flex items-center gap-2 flex-1">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                <Users className="h-4 w-4 text-primary" />
              </div>
              <DialogTitle className="text-base font-semibold">
                {view === 'list' ? 'Akkauntlar' : 'Yangi akkaunt qo\'shish'}
              </DialogTitle>
            </div>
          </div>
        </DialogHeader>

        <AnimatePresence mode="wait">
          {view === 'list' ? (
            <motion.div
              key="list"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
            >
              <ScrollArea className="max-h-[400px]">
                <div className="p-3 space-y-1">
                  {/* Active Account */}
                  {user && (
                    <div className="relative">
                      <div className="flex items-center gap-3 px-3 py-3 rounded-xl bg-primary/10 border border-primary/20">
                        <div className="relative">
                          <Avatar className="h-11 w-11 ring-2 ring-primary/40">
                            <AvatarImage src={currentAccount?.avatarUrl || ''} />
                            <AvatarFallback className="bg-primary/20 text-primary font-semibold text-sm">
                              {getInitials(
                                currentAccount?.displayName || null,
                                currentAccount?.email || user.email || ''
                              )}
                            </AvatarFallback>
                          </Avatar>
                          {/* Online indicator */}
                          <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-green-500 border-2 border-background" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm truncate">
                            {currentAccount?.displayName || user.email?.split('@')[0]}
                          </p>
                          {currentAccount?.username && (
                            <p className="text-xs text-muted-foreground truncate">
                              @{currentAccount.username}
                            </p>
                          )}
                          <p className="text-xs text-muted-foreground truncate">
                            {user.email}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-primary/15 border border-primary/25">
                          <Check className="h-3 w-3 text-primary" />
                          <span className="text-xs font-medium text-primary">Faol</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Divider */}
                  {otherAccounts.length > 0 && (
                    <div className="flex items-center gap-2 py-1 px-1">
                      <div className="flex-1 h-px bg-border/60" />
                      <span className="text-xs text-muted-foreground">Boshqa akkauntlar</span>
                      <div className="flex-1 h-px bg-border/60" />
                    </div>
                  )}

                  {/* Other Accounts */}
                  <AnimatePresence>
                    {otherAccounts.map((account) => (
                      <motion.div
                        key={account.id}
                        layout
                        initial={{ opacity: 1, height: 'auto' }}
                        animate={{
                          opacity: removingId === account.id ? 0 : 1,
                          height: removingId === account.id ? 0 : 'auto',
                          scale: removingId === account.id ? 0.95 : 1,
                        }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.25 }}
                        className="overflow-hidden"
                      >
                        <button
                          onClick={() => handleSwitchAccount(account.id)}
                          disabled={!!switchingId || isLoading}
                          className={cn(
                            'w-full flex items-center gap-3 px-3 py-3 rounded-xl',
                            'transition-all duration-150 group',
                            'hover:bg-muted/80 active:scale-[0.98]',
                            switchingId === account.id && 'bg-muted/60',
                            (switchingId || isLoading) && switchingId !== account.id && 'opacity-50'
                          )}
                        >
                          <div className="relative">
                            <Avatar className="h-11 w-11">
                              <AvatarImage src={account.avatarUrl || ''} />
                              <AvatarFallback className="bg-muted font-semibold text-sm text-muted-foreground">
                                {getInitials(account.displayName, account.email)}
                              </AvatarFallback>
                            </Avatar>
                            {switchingId === account.id && (
                              <div className="absolute inset-0 flex items-center justify-center rounded-full bg-background/70">
                                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                              </div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0 text-left">
                            <p className="font-medium text-sm truncate">
                              {account.displayName || account.email.split('@')[0]}
                            </p>
                            {account.username && (
                              <p className="text-xs text-muted-foreground truncate">
                                @{account.username}
                              </p>
                            )}
                            <p className="text-xs text-muted-foreground truncate">{account.email}</p>
                          </div>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={(e) => handleRemoveAccount(account.id, e)}
                              className="h-7 w-7 flex items-center justify-center rounded-full hover:bg-destructive/10 hover:text-destructive transition-colors"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          </div>
                        </button>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              </ScrollArea>

              {/* Add Account Button */}
              <div className="p-3 border-t border-border/50">
                <button
                  onClick={() => setView('add')}
                  className={cn(
                    'w-full flex items-center gap-3 px-3 py-3 rounded-xl',
                    'transition-all duration-150',
                    'hover:bg-muted/80 active:scale-[0.98] text-left'
                  )}
                >
                  <div className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-dashed border-primary/40 bg-primary/5">
                    <Plus className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">Akkaunt qo'shish</p>
                    <p className="text-xs text-muted-foreground">Yangi akkaunt bilan kiring</p>
                  </div>
                </button>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="add"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.2 }}
            >
              <form onSubmit={handleAddAccount} className="p-5 space-y-4">
                {/* Error */}
                <AnimatePresence>
                  {error && (
                    <motion.div
                      initial={{ opacity: 0, y: -8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20"
                    >
                      <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                      <p className="text-xs text-destructive leading-relaxed">{error}</p>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="space-y-1.5">
                  <Label htmlFor="acc-email" className="text-sm font-medium">
                    Email
                  </Label>
                  <Input
                    id="acc-email"
                    type="email"
                    placeholder="email@example.com"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setError(null);
                    }}
                    disabled={addingAccount}
                    className="h-11 rounded-xl"
                    autoComplete="email"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="acc-password" className="text-sm font-medium">
                    Parol
                  </Label>
                  <div className="relative">
                    <Input
                      id="acc-password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        setError(null);
                      }}
                      disabled={addingAccount}
                      className="h-11 rounded-xl pr-11"
                      autoComplete="current-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>

                <div className="flex gap-2 pt-1">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1 h-11 rounded-xl"
                    onClick={resetAddForm}
                    disabled={addingAccount}
                  >
                    Bekor qilish
                  </Button>
                  <Button
                    type="submit"
                    className="flex-1 h-11 rounded-xl bg-primary hover:bg-primary/90"
                    disabled={addingAccount || !email || !password}
                  >
                    {addingAccount ? (
                      <span className="flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Kirilmoqda...
                      </span>
                    ) : (
                      "Qo'shish"
                    )}
                  </Button>
                </div>
              </form>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}
