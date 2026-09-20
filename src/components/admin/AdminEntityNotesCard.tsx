import { useCallback, useEffect, useState } from 'react';
import { Loader2, Pin, Plus, StickyNote, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useAdminAccess } from '@/hooks/useAdminAccess';
import {
  addAdminEntityNote,
  deleteAdminEntityNote,
  listAdminEntityNotes,
  type AdminEntityNote,
} from '@/hooks/useAdminOperations';

function dateTime(value: string) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export function AdminEntityNotesCard({
  entityType,
  entityId,
  title = 'Ichki admin qaydlari',
}: {
  entityType: string;
  entityId: string;
  title?: string;
}) {
  const { hasPermission } = useAdminAccess();
  const canManage = hasPermission('admin.notes.manage');
  const canView = canManage || hasPermission('admin.notes.view');
  const [notes, setNotes] = useState<AdminEntityNote[]>([]);
  const [body, setBody] = useState('');
  const [pinned, setPinned] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AdminEntityNote | null>(null);
  const [deleteReason, setDeleteReason] = useState('');

  const load = useCallback(async () => {
    if (!canView || !entityId) return;
    setLoading(true);
    try {
      setNotes(await listAdminEntityNotes(entityType, entityId));
    } catch (error: any) {
      console.error('Admin entity notes load failed:', error);
      toast.error(error?.message || 'Ichki qaydlarni yuklab bo‘lmadi');
    } finally {
      setLoading(false);
    }
  }, [canView, entityId, entityType]);

  useEffect(() => {
    setBody('');
    setPinned(false);
    void load();
  }, [load]);

  if (!canView) return null;

  const addNote = async () => {
    const clean = body.trim();
    if (clean.length < 2) return;
    setSaving(true);
    try {
      await addAdminEntityNote({
        entityType,
        entityId,
        body: clean,
        pinned,
      });
      setBody('');
      setPinned(false);
      toast.success('Ichki qayd audit bilan saqlandi');
      await load();
    } catch (error: any) {
      toast.error(error?.message || 'Qaydni saqlab bo‘lmadi');
    } finally {
      setSaving(false);
    }
  };

  const removeNote = async () => {
    if (!deleteTarget || deleteReason.trim().length < 3) return;
    setSaving(true);
    try {
      await deleteAdminEntityNote(deleteTarget.id, deleteReason.trim());
      toast.success('Ichki qayd o‘chirildi');
      setDeleteTarget(null);
      setDeleteReason('');
      await load();
    } catch (error: any) {
      toast.error(error?.message || 'Qaydni o‘chirib bo‘lmadi');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Card className="overflow-hidden">
        <CardHeader className="border-b bg-muted/10 pb-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-sm">
                <StickyNote className="h-4 w-4" />
                {title}
              </CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                Faqat admin operatorlar ko‘radi. Har bir qo‘shish va o‘chirish auditga yoziladi.
              </p>
            </div>
            <Badge variant="outline" className="rounded-full font-normal">
              {notes.length}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 p-4">
          {loading ? (
            <div className="flex min-h-24 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : notes.length === 0 ? (
            <div className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
              Hozircha ichki qayd yo‘q.
            </div>
          ) : (
            <div className="space-y-2">
              {notes.map((note) => (
                <div key={note.id} className="rounded-xl border bg-background p-3">
                  <div className="flex items-start gap-3">
                    {note.pinned && (
                      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted">
                        <Pin className="h-3.5 w-3.5" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="whitespace-pre-wrap text-sm leading-5">{note.body}</p>
                      <p className="mt-2 text-[11px] text-muted-foreground">
                        {note.created_by_name || note.created_by_username || 'Admin'} · {dateTime(note.created_at)}
                      </p>
                    </div>
                    {canManage && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                        onClick={() => {
                          setDeleteReason('');
                          setDeleteTarget(note);
                        }}
                        aria-label="Ichki qaydni o‘chirish"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {canManage && (
            <div className="space-y-3 border-t pt-4">
              <Textarea
                value={body}
                onChange={(event) => setBody(event.target.value)}
                placeholder="Masalan: support bilan tekshirildi, keyingi murojaatda billing logini solishtiring."
                rows={3}
                maxLength={4000}
              />
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={pinned}
                    onChange={(event) => setPinned(event.target.checked)}
                    className="h-4 w-4 rounded border-border"
                  />
                  Muhim qayd sifatida pin qilish
                </label>
                <Button
                  type="button"
                  size="sm"
                  disabled={saving || body.trim().length < 2}
                  onClick={() => void addNote()}
                >
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                  Qayd qo‘shish
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
            setDeleteReason('');
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ichki qaydni o‘chirish</DialogTitle>
            <DialogDescription>
              O‘chirish sababi audit jurnalida saqlanadi.
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label>Sabab</Label>
            <Textarea
              value={deleteReason}
              onChange={(event) => setDeleteReason(event.target.value)}
              placeholder="Nega bu qayd endi kerak emas?"
              className="mt-2"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Bekor qilish
            </Button>
            <Button
              variant="destructive"
              disabled={saving || deleteReason.trim().length < 3}
              onClick={() => void removeNote()}
            >
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              O‘chirish
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
