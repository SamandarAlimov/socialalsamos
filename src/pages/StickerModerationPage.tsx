import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Check,
  Flag,
  Loader2,
  ShieldAlert,
  ShieldCheck,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useStickerModeration, type ModerationItem } from '@/hooks/useStickerModeration';
import { cn } from '@/lib/utils';

/**
 * Bosqich F: moderator paneli.
 *
 * Navbat tartibi bazada hal qilinadi (shikoyat soni → NSFW bali → vaqt),
 * shuning uchun bu sahifa faqat birinchi elementga fokus beradi. Moderator
 * bir vaqtda bitta stikerga qaraydi — ro‘yxatni varaqlash tezlikni
 * pasaytiradi.
 */

function riskLabel(score: number | null): { text: string; tone: string } {
  if (score === null) return { text: 'Tekshirilmagan', tone: 'bg-muted text-muted-foreground' };
  if (score >= 0.6) return { text: 'Yuqori xavf', tone: 'bg-destructive text-destructive-foreground' };
  if (score >= 0.3) return { text: 'O‘rtacha xavf', tone: 'bg-amber-500 text-black' };
  return { text: 'Past xavf', tone: 'bg-emerald-600 text-white' };
}

function topLabels(labels: Record<string, number> | null): Array<[string, number]> {
  if (!labels) return [];
  return Object.entries(labels)
    .filter(([, value]) => typeof value === 'number')
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);
}

interface CardProps {
  item: ModerationItem;
  isActive: boolean;
  isBusy: boolean;
  onApprove: () => void;
  onReject: (reason: string) => void;
  onFocus: () => void;
}

function ModerationCard({ item, isActive, isBusy, onApprove, onReject, onFocus }: CardProps) {
  const [reason, setReason] = useState('');
  const [showReason, setShowReason] = useState(false);
  const risk = riskLabel(item.nsfwScore);
  const labels = topLabels(item.nsfwLabels);

  return (
    <div
      onClick={onFocus}
      className={cn(
        'rounded-2xl border bg-card p-4 transition-shadow',
        isActive ? 'border-primary shadow-lg' : 'border-border',
      )}
    >
      <div className="flex gap-4">
        {/* Shaffof stikerni ko‘rish uchun shaxmat foni */}
        <div
          className="h-24 w-24 shrink-0 rounded-xl border border-border bg-[length:16px_16px] bg-[position:0_0,8px_8px]"
          style={{
            backgroundImage:
              'linear-gradient(45deg, hsl(var(--muted)) 25%, transparent 25%, transparent 75%, hsl(var(--muted)) 75%), linear-gradient(45deg, hsl(var(--muted)) 25%, transparent 25%, transparent 75%, hsl(var(--muted)) 75%)',
          }}
        >
          {item.previewUrl || item.fullUrl ? (
            <img
              src={item.fullUrl ?? item.previewUrl ?? ''}
              alt="Tekshiruvdagi stiker"
              loading="lazy"
              className="h-full w-full object-contain p-1"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
              Rasm yo‘q
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className={cn('border-0', risk.tone)}>{risk.text}</Badge>
            {item.nsfwScore !== null && (
              <span className="text-xs text-muted-foreground">
                ball: {item.nsfwScore.toFixed(2)}
              </span>
            )}
            {item.reportCount > 0 && (
              <span className="flex items-center gap-1 text-xs text-destructive">
                <Flag className="h-3.5 w-3.5" />
                {item.reportCount} shikoyat
              </span>
            )}
          </div>

          <p className="mt-2 truncate text-sm font-medium">{item.packName || 'Nomsiz paket'}</p>

          {labels.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
              {labels.map(([key, value]) => (
                <span key={key}>
                  {key}: {Number(value).toFixed(2)}
                </span>
              ))}
            </div>
          )}

          {item.submittedAt && (
            <p className="mt-1 text-xs text-muted-foreground">
              So‘rov: {new Date(item.submittedAt).toLocaleString('uz-UZ')}
            </p>
          )}
        </div>
      </div>

      {showReason && (
        <div className="mt-3">
          <Textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Rad etish sababi (foydalanuvchiga ko‘rinadi)"
            rows={2}
            maxLength={300}
            autoFocus
          />
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" disabled={isBusy} onClick={onApprove} className="gap-1.5">
          <Check className="h-4 w-4" />
          Tasdiqlash
        </Button>

        {showReason ? (
          <>
            <Button
              size="sm"
              variant="destructive"
              // Sababsiz rad etish taqiqlangan: foydalanuvchi nimani
              // tuzatishini bilmasa, xuddi shu stikerni qayta yuklaydi.
              disabled={isBusy || reason.trim().length < 3}
              onClick={() => onReject(reason.trim())}
              className="gap-1.5"
            >
              <X className="h-4 w-4" />
              Rad etishni tasdiqlash
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={isBusy}
              onClick={() => {
                setShowReason(false);
                setReason('');
              }}
            >
              Bekor qilish
            </Button>
          </>
        ) : (
          <Button
            size="sm"
            variant="outline"
            disabled={isBusy}
            onClick={() => setShowReason(true)}
            className="gap-1.5"
          >
            <X className="h-4 w-4" />
            Rad etish
          </Button>
        )}
      </div>
    </div>
  );
}

export default function StickerModerationPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { items, isModerator, isLoading, reload, review } = useStickerModeration();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  const activeStickerId = useMemo(
    () => activeId ?? items[0]?.stickerId ?? null,
    [activeId, items],
  );

  const decide = useCallback(
    async (stickerId: string, approve: boolean, reason?: string) => {
      setBusyId(stickerId);
      try {
        await review(stickerId, approve, reason);
        toast({
          title: approve ? 'Tasdiqlandi' : 'Rad etildi',
          description: approve
            ? 'Stiker ommaviy paketlarda ko‘rinishi mumkin.'
            : 'Stiker ommadan olindi va egasiga sabab yuboriladi.',
        });
        setActiveId(null);
      } catch (error) {
        toast({
          title: 'Amal bajarilmadi',
          description: error instanceof Error ? error.message : 'Qayta urinib ko‘ring.',
          variant: 'destructive',
        });
      } finally {
        setBusyId(null);
      }
    },
    [review, toast],
  );

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isModerator) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-3 px-4 text-center">
        <ShieldAlert className="h-10 w-10 text-muted-foreground" />
        <h1 className="text-lg font-semibold">Bu sahifa faqat moderatorlar uchun</h1>
        <p className="text-sm text-muted-foreground">
          Agar sizga moderator huquqi berilgan bo‘lsa, sahifani yangilab ko‘ring.
        </p>
        <Button variant="outline" onClick={() => navigate('/stickers')}>
          Stiker paketlariga qaytish
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-24 pt-4">
      <div className="mb-4 flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => navigate('/stickers')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-semibold">Stiker moderatsiyasi</h1>
          <p className="text-xs text-muted-foreground">
            Navbatda {items.length} ta stiker — shikoyatlilar va yuqori xavflilar tepada
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void reload()}>
          Yangilash
        </Button>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card px-4 py-12 text-center">
          <ShieldCheck className="h-10 w-10 text-emerald-600" />
          <p className="font-medium">Navbat bo‘sh</p>
          <p className="text-sm text-muted-foreground">
            Tekshiruvni kutayotgan stiker yo‘q.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <ModerationCard
              key={item.stickerId}
              item={item}
              isActive={item.stickerId === activeStickerId}
              isBusy={busyId === item.stickerId}
              onFocus={() => setActiveId(item.stickerId)}
              onApprove={() => void decide(item.stickerId, true)}
              onReject={(reason) => void decide(item.stickerId, false, reason)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
