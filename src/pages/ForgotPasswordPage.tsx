import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, MailCheck } from 'lucide-react';

import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AlsamosLogo } from '@/components/AlsamosLogo';
import { ALSAMOS_MAIL_DOMAIN, isAlsamosEmail, toIdentityEmail } from '@/lib/alsamosAuth';

export default function ForgotPasswordPage() {
  const { requestPasswordReset } = useAuth();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const identityEmail = toIdentityEmail(email);
    if (!isAlsamosEmail(identityEmail)) {
      setError(`Tiklash havolasi faqat @${ALSAMOS_MAIL_DOMAIN} manziliga yuboriladi.`);
      return;
    }

    setLoading(true);
    await requestPasswordReset(identityEmail);
    setLoading(false);
    // Always the same outcome, so nobody can probe which emails exist.
    setSent(true);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md space-y-6">
        <div className="flex justify-center">
          <AlsamosLogo size="lg" />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Parolni tiklash</CardTitle>
            <CardDescription>
              Parol identifikator emailingizga bog’langan. Tiklash havolasi shu manzilga
              yuboriladi.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            {sent ? (
              <div className="space-y-4 text-center">
                <MailCheck className="mx-auto h-10 w-10 text-emerald-500" />
                <p className="text-sm text-muted-foreground">
                  Agar bu manzil ro’yxatdan o’tgan bo’lsa, tiklash havolasi yuborildi.
                  Havola 1 soat davomida amal qiladi.
                </p>
                <Button asChild className="w-full">
                  <Link to="/">Kirish sahifasiga qaytish</Link>
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="reset-email">Email</Label>
                  <Input
                    id="reset-email"
                    type="email"
                    autoComplete="email"
                    placeholder={`ism@${ALSAMOS_MAIL_DOMAIN}`}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                  {error && <p className="text-sm text-destructive">{error}</p>}
                </div>

                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? 'Yuborilmoqda...' : 'Tiklash havolasini yuborish'}
                </Button>

                <Button asChild variant="ghost" className="w-full">
                  <Link to="/">
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Orqaga
                  </Link>
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
