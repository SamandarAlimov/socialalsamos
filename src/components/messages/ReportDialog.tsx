import { useState } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { useMessageSafety, type ReportReason } from '@/hooks/useMessageSafety';

interface ReportDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  userId?: string;
  conversationId?: string;
  messageId?: string;
  onReported?: () => void;
}

const REASONS: { value: ReportReason; label: string }[] = [
  { value: 'spam', label: 'Spam yoki noqonuniy reklama' },
  { value: 'scam', label: 'Firibgarlik / aldash' },
  { value: 'harassment', label: 'Tahdid / haqorat' },
  { value: 'inappropriate', label: "Nomaqbul kontent" },
  { value: 'impersonation', label: 'Boshqa shaxsni tuqib chiqarish' },
  { value: 'other', label: 'Boshqa sabab' },
];

export function ReportDialog({ open, onOpenChange, userId, conversationId, messageId, onReported }: ReportDialogProps) {
  const { report } = useMessageSafety();
  const [reason, setReason] = useState<ReportReason>('spam');
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    setSubmitting(true);
    const ok = await report({ userId, conversationId, messageId, reason, details: details.trim() || undefined });
    setSubmitting(false);
    if (ok) {
      onOpenChange(false);
      setDetails('');
      onReported?.();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Shikoyat qilish</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <RadioGroup value={reason} onValueChange={(v) => setReason(v as ReportReason)}>
            {REASONS.map((r) => (
              <div key={r.value} className="flex items-center gap-2">
                <RadioGroupItem value={r.value} id={`reason-${r.value}`} />
                <Label htmlFor={`reason-${r.value}`} className="text-sm cursor-pointer">{r.label}</Label>
              </div>
            ))}
          </RadioGroup>
          <div>
            <Label className="text-xs text-muted-foreground">Qo'shimcha izoh (ixtiyoriy)</Label>
            <Textarea
              value={details}
              onChange={(e) => setDetails(e.target.value.slice(0, 500))}
              placeholder="Nima yuz berdi?"
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Bekor qilish</Button>
          <Button onClick={submit} disabled={submitting}>Yuborish</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
