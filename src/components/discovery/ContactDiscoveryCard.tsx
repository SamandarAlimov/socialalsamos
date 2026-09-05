import { useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  ContactRound,
  Loader2,
  MessageCircle,
  ShieldCheck,
  Smartphone,
  Trash2,
  UserRound,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useContactDiscovery, type ContactDiscoveryMatch } from '@/hooks/useContactDiscovery';
import { useConversations } from '@/hooks/useMessages';
import { cn } from '@/lib/utils';

function initials(match: ContactDiscoveryMatch) {
  const value = match.display_name || match.username || '?';
  return value
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] || '')
    .join('')
    .toUpperCase();
}

export function ContactDiscoveryCard() {
  const navigate = useNavigate();
  const { createPrivateConversation } = useConversations(undefined, false);
  const discovery = useContactDiscovery();
  const [expanded, setExpanded] = useState(false);
  const [manualValue, setManualValue] = useState('');
  const [openingUserId, setOpeningUserId] = useState<string | null>(null);

  const summary = useMemo(() => {
    if (discovery.isLoadingSaved) return 'Kontakt takliflari tekshirilmoqda…';
    if (discovery.matches.length > 0) {
      return `${discovery.matches.length} ta tanishingiz Alsamos’da topildi`;
    }
    return 'Telefon daftaringizdagi Alsamos foydalanuvchilarini toping';
  }, [discovery.isLoadingSaved, discovery.matches.length]);

  const openMessage = async (match: ContactDiscoveryMatch) => {
    if (openingUserId) return;
    setOpeningUserId(match.user_id);
    try {
      const conversation = await createPrivateConversation(match.user_id);
      if (!conversation?.id) throw new Error('conversation_create_failed');
      navigate(`/messages?conversation=${encodeURIComponent(conversation.id)}`);
    } catch (error) {
      console.error('Contact conversation failed', error);
      toast.error('Suhbatni hozir ochib bo‘lmadi.');
    } finally {
      setOpeningUserId(null);
    }
  };

  const syncDeviceContacts = async () => {
    const rows = await discovery.pickAndSync();
    if (rows.length > 0) toast.success(`${rows.length} ta Alsamos foydalanuvchisi topildi`);
    else if (!discovery.error) toast.info('Tanlangan kontaktlar orasida yangi Alsamos foydalanuvchisi topilmadi.');
  };

  const syncManualContacts = async () => {
    if (!manualValue.trim()) return;
    const rows = await discovery.syncManual(manualValue);
    if (rows.length > 0) {
      toast.success(`${rows.length} ta Alsamos foydalanuvchisi topildi`);
      setManualValue('');
    } else if (!discovery.error) {
      toast.info('Kiritilgan kontaktlar orasida Alsamos foydalanuvchisi topilmadi.');
    }
  };

  return (
    <section className="mb-5 overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm">
      <button
        type="button"
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-muted/30"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-foreground text-background">
          <ContactRound className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">Kontaktlardan topish</span>
          <span className="mt-0.5 block truncate text-xs text-muted-foreground">{summary}</span>
        </span>
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </button>

      {expanded && (
        <div className="border-t border-border/60 px-4 py-4">
          <div className="flex items-start gap-2.5 rounded-xl border border-border/60 bg-muted/20 p-3">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="text-xs leading-relaxed text-muted-foreground">
              <p className="font-medium text-foreground">Kontaktlaringiz maxfiy qoladi</p>
              <p className="mt-1">
                Telefon va email brauzerning o‘zida SHA-256 hash qilinadi. Serverga xom kontaktlar
                yuborilmaydi va kontakt nomlari saqlanmaydi. Faqat aniq mos kelgan Alsamos profillari qaytadi.
              </p>
            </div>
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <Button
              type="button"
              className="h-10 rounded-xl"
              disabled={discovery.isLoading || !discovery.contactPickerSupported}
              onClick={() => void syncDeviceContacts()}
            >
              {discovery.isLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Smartphone className="mr-2 h-4 w-4" />
              )}
              Kontaktlarni tanlash
            </Button>
            <div className="flex items-center rounded-xl border border-border/60 px-3 text-xs text-muted-foreground">
              {discovery.contactPickerSupported
                ? 'Siz tanlagan kontaktlargina tekshiriladi.'
                : 'Device picker bu brauzerda yo‘q — pastdagi qo‘lda tekshirish ishlaydi.'}
            </div>
          </div>

          <div className="mt-3 rounded-xl border border-border/60 p-3">
            <label htmlFor="contact-discovery-manual" className="text-xs font-medium">
              Telefon yoki emailni qo‘lda tekshirish
            </label>
            <Textarea
              id="contact-discovery-manual"
              value={manualValue}
              onChange={(event) => setManualValue(event.target.value)}
              placeholder={'+998 90 123 45 67\nexample@mail.com'}
              className="mt-2 min-h-20 resize-none rounded-xl text-sm"
              autoComplete="off"
              spellCheck={false}
            />
            <div className="mt-2 flex items-center justify-between gap-2">
              <p className="text-[11px] text-muted-foreground">Vergul yoki yangi qatordan ajratish mumkin.</p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="rounded-lg"
                disabled={discovery.isLoading || !manualValue.trim()}
                onClick={() => void syncManualContacts()}
              >
                Tekshirish
              </Button>
            </div>
          </div>

          {discovery.error && (
            <div className="mt-3 rounded-xl border border-destructive/20 bg-destructive/5 px-3 py-2.5 text-xs text-destructive">
              {discovery.error}
            </div>
          )}

          {(discovery.matches.length > 0 || discovery.isLoadingSaved) && (
            <div className="mt-4 overflow-hidden rounded-xl border border-border/60">
              <div className="flex items-center justify-between border-b border-border/60 px-3 py-2.5">
                <div>
                  <p className="text-xs font-semibold">Alsamos’dagi tanishlar</p>
                  <p className="text-[11px] text-muted-foreground">Kontakt mosliklari birinchi o‘rinda ko‘rsatiladi.</p>
                </div>
                {discovery.matches.length > 0 && (
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 rounded-lg"
                    aria-label="Saqlangan kontakt takliflarini unutish"
                    onClick={async () => {
                      await discovery.forgetMatches();
                      toast.success('Kontakt takliflari tozalandi');
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>

              {discovery.isLoadingSaved && discovery.matches.length === 0 ? (
                <div className="flex items-center justify-center gap-2 px-3 py-6 text-xs text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Takliflar yuklanmoqda…
                </div>
              ) : (
                discovery.matches.map((match) => (
                  <div
                    key={match.user_id}
                    className="flex items-center gap-3 border-b border-border/50 px-3 py-3 last:border-b-0"
                  >
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={match.avatar_url || undefined} alt="" />
                      <AvatarFallback>{initials(match)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {match.display_name || match.username || 'Alsamos foydalanuvchisi'}
                      </p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {match.username ? `@${match.username}` : 'Kontakt orqali topildi'}
                        {match.mutual_count > 0 ? ` · ${match.mutual_count} ta umumiy kuzatuv` : ''}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {match.username && (
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 rounded-lg"
                          aria-label="Profilni ochish"
                          onClick={() => navigate(`/user/${encodeURIComponent(match.username!)}`)}
                        >
                          <UserRound className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      <Button
                        type="button"
                        size="icon"
                        className={cn('h-8 w-8 rounded-lg', openingUserId === match.user_id && 'pointer-events-none')}
                        aria-label="Xabar yozish"
                        disabled={Boolean(openingUserId)}
                        onClick={() => void openMessage(match)}
                      >
                        {openingUserId === match.user_id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <MessageCircle className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

export default ContactDiscoveryCard;
