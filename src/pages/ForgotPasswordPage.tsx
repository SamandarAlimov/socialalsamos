import { Link } from 'react-router-dom';
import { ArrowLeft, ShieldCheck } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AlsamosLogo } from '@/components/AlsamosLogo';

export default function ForgotPasswordPage() {
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
              @alsamos.com manzili Alsamos ichki identifikatori. U pochta qutisi emas,
              shuning uchun tasdiqlash yoki parol tiklash havolasi emailga yuborilmaydi.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="rounded-xl border bg-muted/30 p-4 text-sm text-muted-foreground">
              <ShieldCheck className="mb-3 h-6 w-6 text-foreground" />
              Agar boshqa qurilmada akkauntingiz ochiq bo’lsa, Sozlamalar → Xavfsizlik
              orqali parolni o’zgartiring. Akkauntga umuman kira olmasangiz, Help Center
              orqali Alsamos identity recovery jarayonidan foydalaning.
            </div>

            <Button asChild className="w-full">
              <Link to="/help">Help Center</Link>
            </Button>

            <Button asChild variant="ghost" className="w-full">
              <Link to="/">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Kirish sahifasiga qaytish
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
