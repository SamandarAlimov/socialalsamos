import { useState } from 'react';
import { AlertTriangle, ChevronLeft, Loader2, LogOut, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import {
  clearSlot,
  getActiveSlot,
  occupiedSlots,
  removeAccountMeta,
  setActiveSlot,
} from '@/lib/accountSlots';

export default function AccountManagementPage() {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const { toast } = useToast();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await logout();
      window.location.assign('/');
    } finally {
      setLoggingOut(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== 'DELETE' || deleting) return;

    setDeleting(true);
    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError || !session?.access_token) {
        throw new Error('Sessiya topilmadi. Qaytadan kiring va yana urinib ko‘ring.');
      }

      const response = await fetch('/api/account-delete', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        credentials: 'same-origin',
        body: JSON.stringify({ confirm: 'DELETE' }),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) {
        throw new Error(
          typeof payload?.message === 'string' && payload.message
            ? payload.message
            : 'Hisobni o‘chirib bo‘lmadi. Qaytadan urinib ko‘ring.',
        );
      }

      const deletedSlot = getActiveSlot();
      clearSlot(deletedSlot);
      removeAccountMeta(deletedSlot);

      const remainingSlots = occupiedSlots();
      if (remainingSlots.length > 0) {
        setActiveSlot(remainingSlots[0]);
      }

      toast({
        title: 'Hisob o‘chirildi',
        description: 'Hisobingiz yopildi va shu qurilmadagi sessiya tozalandi.',
      });

      window.location.assign(remainingSlots.length > 0 ? '/home' : '/');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Hisobni o‘chirib bo‘lmadi.';
      toast({ title: 'Xatolik', description: message, variant: 'destructive' });
      setDeleting(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-3 pb-24 pt-4 md:px-5 md:pb-10 md:pt-7">
      <header className="mb-6 flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate('/settings')}
          aria-label="Sozlamalarga qaytish"
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-xl font-bold tracking-tight md:text-2xl">Hisobni boshqarish</h1>
        </div>
      </header>

      <div className="space-y-5">
        <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <div className="border-b border-border/70 px-4 py-4 md:px-5">
            <h2 className="font-semibold tracking-tight">Sessiyani boshqarish</h2>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Joriy qurilmadagi hisob sessiyasini boshqaring.
            </p>
          </div>
          <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between md:p-5">
            <div>
              <p className="text-sm font-medium">Hisobdan chiqish</p>
              <p className="mt-1 text-xs text-muted-foreground">Faqat shu qurilmadagi sessiya yakunlanadi.</p>
            </div>
            <Button variant="outline" onClick={handleLogout} disabled={loggingOut || deleting}>
              {loggingOut ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LogOut className="mr-2 h-4 w-4" />}
              Chiqish
            </Button>
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-destructive/30 bg-card shadow-sm">
          <div className="border-b border-destructive/20 bg-destructive/5 px-4 py-4 md:px-5">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              <h2 className="font-semibold text-destructive">Xavfli hudud</h2>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Bu amallarni ortga qaytarish imkoni bo‘lmasligi mumkin.
            </p>
          </div>
          <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between md:p-5">
            <div>
              <p className="text-sm font-medium">Hisobni butunlay o‘chirish</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Profil va unga bog‘liq shaxsiy ma’lumotlar o‘chiriladi. Ayrim qonuniy yoki moliyaviy yozuvlar anonim holda saqlanishi mumkin.
              </p>
            </div>
            <Button variant="destructive" onClick={() => setDeleteDialogOpen(true)} disabled={loggingOut}>
              <Trash2 className="mr-2 h-4 w-4" /> Hisobni o‘chirish
            </Button>
          </div>
        </section>
      </div>

      <AlertDialog
        open={deleteDialogOpen}
        onOpenChange={(open) => {
          if (deleting) return;
          setDeleteDialogOpen(open);
          if (!open) setDeleteConfirmText('');
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">Hisobni o‘chirish</AlertDialogTitle>
            <AlertDialogDescription className="space-y-4">
              <span className="block">
                Bu amalni ortga qaytarish mumkin emas. Davom etishdan oldin kerakli ma’lumotlarni saqlab oling.
              </span>
              <span className="block">
                Tasdiqlash uchun <strong>DELETE</strong> deb yozing.
              </span>
              <Input
                value={deleteConfirmText}
                onChange={(event) => setDeleteConfirmText(event.target.value)}
                placeholder="DELETE"
                autoComplete="off"
              />
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Bekor qilish</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={deleteConfirmText !== 'DELETE' || deleting}
              onClick={handleDeleteAccount}
            >
              {deleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
              O‘chirish
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
