import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useMultiAccount } from '@/hooks/useMultiAccount';
import { useAuth } from '@/contexts/AuthContext';
import { Check, Plus, Trash2, User, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

interface SwitchAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SwitchAccountDialog({ open, onOpenChange }: SwitchAccountDialogProps) {
  const { accounts, activeAccountId, isLoading, switchToAccount, addAccount, removeAccount } = useMultiAccount();
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [showAddForm, setShowAddForm] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [addingAccount, setAddingAccount] = useState(false);

  const handleSwitchAccount = async (accountId: string) => {
    if (accountId === user?.id) return; // Already active

    const result = await switchToAccount(accountId);
    if (result.error) {
      if (result.needsReauth) {
        toast({
          title: "Session expired",
          description: "Please log in again with this account.",
          variant: "destructive",
        });
        // Remove the expired account
        removeAccount(accountId);
      } else {
        toast({
          title: "Switch failed",
          description: result.error.message,
          variant: "destructive",
        });
      }
    }
  };

  const handleAddAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;

    setAddingAccount(true);
    const result = await addAccount(email, password);
    setAddingAccount(false);

    if (result.error) {
      toast({
        title: "Login failed",
        description: result.error.message,
        variant: "destructive",
      });
    } else {
      setShowAddForm(false);
      setEmail('');
      setPassword('');
      onOpenChange(false);
    }
  };

  const handleRemoveAccount = (accountId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (accountId === user?.id) {
      toast({
        title: "Cannot remove",
        description: "You cannot remove the currently active account.",
        variant: "destructive",
      });
      return;
    }
    removeAccount(accountId);
    toast({
      title: "Account removed",
      description: "The account has been removed from your device.",
    });
  };

  // Filter out current user from accounts list and add them at top
  const otherAccounts = accounts.filter(a => a.id !== user?.id);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md z-[10001]" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Switch Account</DialogTitle>
          <DialogDescription>
            Switch between your accounts or add a new one.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Current Account */}
          {user && (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground uppercase tracking-wider">
                Current Account
              </Label>
              <div className="flex items-center gap-3 p-3 rounded-lg bg-primary/10 border border-primary/20">
                <Avatar className="h-10 w-10">
                  <AvatarImage src={accounts.find(a => a.id === user.id)?.avatarUrl || ''} />
                  <AvatarFallback>
                    <User className="h-5 w-5" />
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">
                    {accounts.find(a => a.id === user.id)?.displayName || user.email?.split('@')[0]}
                  </p>
                  <p className="text-sm text-muted-foreground truncate">
                    {user.email}
                  </p>
                </div>
                <Check className="h-5 w-5 text-primary flex-shrink-0" />
              </div>
            </div>
          )}

          {/* Other Accounts */}
          {otherAccounts.length > 0 && (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground uppercase tracking-wider">
                Other Accounts
              </Label>
              <div className="space-y-2">
                {otherAccounts.map((account) => (
                  <div
                    key={account.id}
                    onClick={() => handleSwitchAccount(account.id)}
                    className={cn(
                      "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors",
                      "hover:bg-accent hover:border-accent",
                      isLoading && "opacity-50 pointer-events-none"
                    )}
                  >
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={account.avatarUrl || ''} />
                      <AvatarFallback>
                        <User className="h-5 w-5" />
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">
                        {account.displayName || account.email.split('@')[0]}
                      </p>
                      <p className="text-sm text-muted-foreground truncate">
                        {account.email}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={(e) => handleRemoveAccount(account.id, e)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Add Account Form */}
          {showAddForm ? (
            <form onSubmit={handleAddAccount} className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="Enter email address"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={addingAccount}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Enter password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={addingAccount}
                />
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    setShowAddForm(false);
                    setEmail('');
                    setPassword('');
                  }}
                  disabled={addingAccount}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="flex-1"
                  disabled={addingAccount || !email || !password}
                >
                  {addingAccount ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Logging in...
                    </>
                  ) : (
                    'Add Account'
                  )}
                </Button>
              </div>
            </form>
          ) : (
            <Button
              variant="outline"
              className="w-full"
              onClick={() => setShowAddForm(true)}
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Another Account
            </Button>
          )}
        </div>

        {isLoading && (
          <div className="absolute inset-0 bg-background/80 flex items-center justify-center rounded-lg">
            <div className="flex items-center gap-2">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>Switching account...</span>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
