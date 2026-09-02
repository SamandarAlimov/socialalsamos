import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';

import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AlsamosLogo } from '@/components/AlsamosLogo';
import { checkPassword, passwordStrengthColor } from '@/lib/passwordStrength';

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const { updatePassword } = useAuth();
  const [ready, setReady] = useState(false);
  const [linkValid, setLinkValid] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The recovery link puts a short-lived session in place; without it the page
  // must refuse to change anything.
  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      setLinkValid(!!data.session);
      setReady(true);
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') {
        setLinkValid(true);
        setReady(true);
      }
    });

    check();

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  const strength = checkPassword(password);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== confirm) {
      setError('Parollar mos kelmadi.');
      return;
    }
    if (!strength.valid) {
      setError(strength.problems[0]);
      return;
    }

    setSaving(true);
    const { error: updateError } = await updatePassword(password);
    setSaving(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    await supabase.auth.signOut({ scope: 'global' }).catch(() => {});
    navigate('/', { replace: true });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md space-y-6">
        <div className="flex justify-center">
          <AlsamosLogo size="lg" />
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-muted-foreground" />
              Yangi parol
            </CardTitle>
            <CardDescription>
              Parol yangilangach barcha qurilmalardagi sessiyalar yopiladi.
            </CardDescription>
          </CardHeader>

          <CardContent>
            {!ready ? (
              <p className="text-sm text-muted-foreground">Tekshirilmoqda...</p>
            ) : !linkValid ? (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Havola yaroqsiz yoki muddati tugagan. Iltimos, tiklash havolasini qaytadan
                  so’rang.
                </p>
                <Button asChild className="w-full">
                  <Link to="/forgot-password">Qaytadan so’rash</Link>
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="new-password">Yangi parol</Label>
                  <Input
                    id="new-password"
                    type="password"
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                  {password.length > 0 && (
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
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirm-password">Parolni tasdiqlash</Label>
                  <Input
                    id="confirm-password"
                    type="password"
                    autoComplete="new-password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    required
                  />
                </div>

                {error && <p className="text-sm text-destructive">{error}</p>}

                <Button type="submit" className="w-full" disabled={saving}>
                  {saving ? 'Saqlanmoqda...' : 'Parolni saqlash'}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
