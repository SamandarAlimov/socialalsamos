import { useMemo, useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Link2, Phone, Search, Video } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface CallContact {
  id: string;
  name: string;
  avatarUrl?: string | null;
  /** "oxirgi marta ... da ko'rindi" kabi holat matni */
  status?: string;
}

interface AddPeopleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contacts: CallContact[];
  /** Odamni audio yoki video bilan qo'ng'irog'ga qo'shish */
  onAdd: (contact: CallContact, withVideo: boolean) => void;
  /** "Havola orqali taklif qilish" - havolani nusxalaydi */
  onInviteLink?: () => void;
  loading?: boolean;
}

/**
 * Telegram Desktopdagi "Add People" oynasi: qidiruv maydoni, "Havola orqali
 * taklif qilish" qatori va kontaktlar ro'yxati (har birida audio/video tugmasi).
 */
export function AddPeopleDialog({
  open,
  onOpenChange,
  contacts,
  onAdd,
  onInviteLink,
  loading,
}: AddPeopleDialogProps) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter((contact) => contact.name.toLowerCase().includes(q));
  }, [contacts, query]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-1.5rem)] max-w-md overflow-hidden rounded-2xl border-white/10 bg-neutral-900/95 p-0 text-white backdrop-blur-xl">
        <div className="border-b border-white/10 p-4">
          <h3 className="mb-3 text-base font-semibold">Odam qo'shish</h3>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
            <Input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Qidirish"
              className="h-10 border-white/10 bg-white/5 pl-9 text-white placeholder:text-white/40 focus-visible:ring-white/20"
            />
          </div>
        </div>

        <div className="max-h-[52vh] overflow-y-auto overscroll-contain">
          {onInviteLink && (
            <button
              type="button"
              onClick={onInviteLink}
              className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-white/5"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#4DA6FF]/20 text-[#4DA6FF]">
                <Link2 className="h-5 w-5" />
              </span>
              <span className="text-sm font-medium">Havola orqali taklif qilish</span>
            </button>
          )}

          {loading ? (
            <p className="px-4 py-8 text-center text-sm text-white/50">Yuklanmoqda...</p>
          ) : filtered.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-white/50">Kontakt topilmadi</p>
          ) : (
            filtered.map((contact) => (
              <div
                key={contact.id}
                className={cn(
                  'flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-white/5'
                )}
              >
                <Avatar className="h-10 w-10 shrink-0">
                  <AvatarImage src={contact.avatarUrl || undefined} alt={contact.name} />
                  <AvatarFallback className="bg-white/10 text-sm text-white">
                    {contact.name.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{contact.name}</p>
                  {contact.status && (
                    <p className="truncate text-xs text-white/45">{contact.status}</p>
                  )}
                </div>

                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 shrink-0 rounded-full text-white/70 hover:bg-white/10 hover:text-white"
                  onClick={() => onAdd(contact, false)}
                  aria-label="Audio qo'ng'iroq"
                >
                  <Phone className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 shrink-0 rounded-full text-white/70 hover:bg-white/10 hover:text-white"
                  onClick={() => onAdd(contact, true)}
                  aria-label="Video qo'ng'iroq"
                >
                  <Video className="h-4 w-4" />
                </Button>
              </div>
            ))
          )}
        </div>

        <div className="border-t border-white/10 p-3 text-right">
          <Button
            variant="ghost"
            className="h-9 rounded-full px-5 text-sm text-white/70 hover:bg-white/10 hover:text-white"
            onClick={() => onOpenChange(false)}
          >
            Bekor qilish
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default AddPeopleDialog;
