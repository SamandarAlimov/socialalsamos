import { useCallback, useEffect, useState } from 'react';
import { Loader2, Plug, Plus, RefreshCw, Trash2, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/db';

export type ConnectorRow = {
  id: string;
  name: string;
  kind: string;
  base_url: string;
  auth_type: string | null;
  description: string | null;
  enabled: boolean;
  last_error: string | null;
};

interface AIConnectorsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId?: string | null;
  onChanged?: () => void;
}

/** MCP pluginlarini (konnektorlarni) qo'shish/boshqarish oynasi. */
export function AIConnectorsDialog({
  open,
  onOpenChange,
  userId,
  onChanged,
}: AIConnectorsDialogProps) {
  const { toast } = useToast();
  const [rows, setRows] = useState<ConnectorRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [token, setToken] = useState('');

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    const { data, error } = await db
      .from('ai_connectors')
      .select('id, name, kind, base_url, auth_type, description, enabled, last_error')
      .order('created_at', { ascending: false });
    if (error) {
      toast({ title: "Konnektorlarni yuklab bo'lmadi", description: error.message, variant: 'destructive' });
    } else {
      setRows((data ?? []) as ConnectorRow[]);
    }
    setLoading(false);
  }, [userId, toast]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const add = async () => {
    if (!userId) {
      toast({ title: 'Tizimga kirish kerak', variant: 'destructive' });
      return;
    }
    const trimmedName = name.trim();
    const trimmedUrl = url.trim();
    if (!trimmedName || !/^https:\/\//i.test(trimmedUrl)) {
      toast({
        title: "Ma'lumot to'liq emas",
        description: 'Nom va https:// bilan boshlanadigan MCP server manzili kerak.',
        variant: 'destructive',
      });
      return;
    }

    setSaving(true);
    const { error } = await db.from('ai_connectors').insert({
      user_id: userId,
      name: trimmedName,
      kind: 'mcp',
      base_url: trimmedUrl,
      auth_type: token.trim() ? 'bearer' : 'none',
      auth_token: token.trim() || null,
      enabled: true,
    });
    setSaving(false);

    if (error) {
      toast({ title: "Qo'shilmadi", description: error.message, variant: 'destructive' });
      return;
    }
    setName('');
    setUrl('');
    setToken('');
    toast({ title: "Konnektor qo'shildi", description: `${trimmedName} endi AI uchun mavjud.` });
    await load();
    onChanged?.();
  };

  const toggle = async (row: ConnectorRow) => {
    const { error } = await db
      .from('ai_connectors')
      .update({ enabled: !row.enabled })
      .eq('id', row.id);
    if (error) {
      toast({ title: "O'zgartirilmadi", description: error.message, variant: 'destructive' });
      return;
    }
    await load();
    onChanged?.();
  };

  const remove = async (row: ConnectorRow) => {
    const { error } = await db.from('ai_connectors').delete().eq('id', row.id);
    if (error) {
      toast({ title: "O'chirilmadi", description: error.message, variant: 'destructive' });
      return;
    }
    await load();
    onChanged?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plug className="h-4 w-4 text-alsamos-orange" />
            Konnektorlar va pluginlar
          </DialogTitle>
          <DialogDescription>
            MCP serverlarini ulang — AI ularning vositalarini suhbat ichida ishlatadi
            (Notion, GitHub, Drive, o'z serveringiz...).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 rounded-xl border border-border/60 p-3">
          <div className="grid gap-2">
            <Label htmlFor="connector-name" className="text-xs">
              Nom
            </Label>
            <Input
              id="connector-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Masalan: Notion"
              className="h-9"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="connector-url" className="text-xs">
              MCP server manzili
            </Label>
            <Input
              id="connector-url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://mcp.example.com/mcp"
              className="h-9 font-mono text-xs"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="connector-token" className="text-xs">
              Token (ixtiyoriy)
            </Label>
            <Input
              id="connector-token"
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Bearer token"
              className="h-9"
            />
          </div>
          <Button onClick={add} disabled={saving} className="w-full gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Konnektor qo'shish
          </Button>
        </div>

        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Ulangan konnektorlar
          </p>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => void load()} aria-label="Yangilash">
            <RefreshCw className={loading ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} />
          </Button>
        </div>

        <ScrollArea className="max-h-56">
          <div className="space-y-2 pr-2">
            {rows.length === 0 && !loading && (
              <p className="rounded-lg border border-dashed border-border/60 p-4 text-center text-xs text-muted-foreground">
                Hali konnektor yo'q. Yuqorida birinchisini qo'shing.
              </p>
            )}
            {rows.map((row) => (
              <div
                key={row.id}
                className="flex items-center gap-2 rounded-lg border border-border/60 px-3 py-2"
              >
                <Wrench className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{row.name}</p>
                  <p className="truncate font-mono text-[10px] text-muted-foreground">{row.base_url}</p>
                  {row.last_error && (
                    <p className="truncate text-[10px] text-destructive">{row.last_error}</p>
                  )}
                </div>
                <Switch
                  checked={row.enabled}
                  onCheckedChange={() => void toggle(row)}
                  aria-label={`${row.name} yoqish`}
                />
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 text-destructive"
                  onClick={() => void remove(row)}
                  aria-label={`${row.name} o'chirish`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

export default AIConnectorsDialog;
