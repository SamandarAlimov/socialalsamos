import { useEffect, useState } from 'react';
import { FolderKanban } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { AIProject } from './types';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project?: AIProject | null;
  onSave: (value: { name: string; instructions: string }) => Promise<void> | void;
}

export function AIProjectDialog({ open, onOpenChange, project, onSave }: Props) {
  const [name, setName] = useState('');
  const [instructions, setInstructions] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(project?.name ?? '');
    setInstructions(project?.instructions ?? '');
  }, [open, project]);

  const submit = async () => {
    const clean = name.trim();
    if (!clean || saving) return;
    setSaving(true);
    try {
      await onSave({ name: clean, instructions: instructions.trim() });
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="mb-1 flex h-9 w-9 items-center justify-center rounded-xl border bg-muted/50">
            <FolderKanban className="h-4 w-4" />
          </div>
          <DialogTitle>{project ? 'Loyihani tahrirlash' : 'Yangi loyiha'}</DialogTitle>
          <DialogDescription>
            Loyiha ko‘rsatmalari shu loyiha ichidagi barcha suhbatlarda umumiy kontekst bo‘lib ishlaydi.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <label className="text-xs font-medium" htmlFor="ai-project-name">Loyiha nomi</label>
            <Input
              id="ai-project-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Masalan: Alsamos mobile redesign"
              maxLength={120}
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium" htmlFor="ai-project-instructions">Loyiha ko‘rsatmalari</label>
            <Textarea
              id="ai-project-instructions"
              value={instructions}
              onChange={(event) => setInstructions(event.target.value)}
              placeholder="Stack, arxitektura, brend qoidalari, maqsadlar va doimiy talablarni yozing…"
              className="min-h-32 resize-y"
              maxLength={12000}
            />
            <p className="text-[11px] text-muted-foreground">
              AI yangi suhbat ochilganda ham shu ko‘rsatmalarni eslab ishlaydi.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Bekor qilish</Button>
          <Button onClick={submit} disabled={!name.trim() || saving}>
            {saving ? 'Saqlanmoqda…' : project ? 'Saqlash' : 'Loyiha yaratish'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
