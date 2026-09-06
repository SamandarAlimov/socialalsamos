import { useCallback, useEffect, useState } from 'react';
import { Loader2, LogOut, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/db';

type Control = {
  status: string;
  blocked: boolean;
  reason?: string | null;
  suspended_until?: string | null;
};

function missingRpc(error: any) {
  const text = `${error?.code ?? ''} ${error?.message ?? ''}`.toLowerCase();
  return text.includes('pgrst202') || text.includes('42883') || text.includes('could not find the function');
}

export function AccountControlGate({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const [control, setControl] = useState<Control | null>(null);
  const [checking, setChecking] = useState(true);

  const check = useCallback(async () => {
    if (!user) { setControl(null); setChecking(false); return; }
    const { data, error } = await db.rpc('get_my_account_control_v3');
    if (error) {
      // Backward compatible during deploy: a missing migration never locks out users.
      if (!missingRpc(error)) console.warn('Account control check failed:', error.message);
      setControl({ status: 'active', blocked: false });
    } else {
      setControl((data || { status: 'active', blocked: false }) as Control);
    }
    setChecking(false);
  }, [user]);

  useEffect(() => {
    void check();
    const timer = window.setInterval(() => void check(), 60_000);
    const onVisible = () => { if (document.visibilityState === 'visible') void check(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, [check]);

  if (checking) return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-muted-foreground" /></div>;
  if (!control?.blocked) return <>{children}</>;

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/20 p-4">
      <Card className="w-full max-w-lg border-destructive/20 shadow-xl">
        <CardContent className="p-7 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10"><ShieldAlert className="h-7 w-7 text-destructive" /></div>
          <h1 className="text-xl font-bold">Hisobga kirish vaqtincha cheklangan</h1>
          <p className="mt-2 text-sm text-muted-foreground">Holat: <span className="font-medium text-foreground">{control.status}</span></p>
          {control.reason && <div className="mt-4 rounded-xl border bg-muted/30 p-3 text-left text-sm"><p className="text-xs font-medium text-muted-foreground">Sabab</p><p className="mt-1">{control.reason}</p></div>}
          {control.suspended_until && <p className="mt-3 text-xs text-muted-foreground">Cheklov muddati: {new Intl.DateTimeFormat(undefined,{dateStyle:'medium',timeStyle:'short'}).format(new Date(control.suspended_until))}</p>}
          <p className="mt-5 text-xs text-muted-foreground">Bu holat admin audit tizimi orqali boshqariladi. Xato deb hisoblasangiz, support bilan bog‘laning.</p>
          <Button variant="outline" className="mt-5" onClick={() => void logout()}><LogOut className="mr-2 h-4 w-4" />Hisobdan chiqish</Button>
        </CardContent>
      </Card>
    </div>
  );
}
