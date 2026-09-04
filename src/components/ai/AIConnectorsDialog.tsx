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
import { useToast } from '@/hooks/use-toast';
import {
  listMcpServers,
  refreshMcpTools,
  removeMcpServer,
  saveMcpServer,
  testMcpServer,
  type McpServer,
} from '@/lib/ai/mcpClient';

interface AIConnectorsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId?: string | null;
  onChanged?: () => void;
}

/**
 * MCP konnektorlarini brauzerning o'zida boshqaradi.
 * Bu oqim Supabase'dagi ai_connectors jadvaliga bog'liq emas, shuning uchun
 * production migration kechiksa ham foydalanuvchining konnektorlari ishlaydi.
 */
export function AIConnectorsDialog({
  open,
  onOpenChange,
  userId,
  onChanged,
}: AIConnectorsDialogProps) {
  const { toast } = useToast();
  const [rows, setRows] = useState<McpServer[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [token, setToken] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    setRows(listMcpServers().sort((a, b) => b.addedAt - a.addedAt));
    setLoading(false);
  }, []);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const add = async () => {
    if (!userId) {
      toast({ title: 'Tizimga kirish kerak', variant: 'destructive' });
      return;
    }

    const trimmedName = name.trim();
    const trimmedUrl = url.trim();
    if (!trimmedName || !/^https?:\/\//i.test(trimmedUrl)) {
      toast({
        title: "Ma'lumot to'liq emas",
        description: 'Nom va http:// yoki https:// bilan boshlanadigan MCP server manzili kerak.',
        variant: 'destructive',
      });
      return;
    }

    setSaving(true);
    try {
      const checked = await testMcpServer(trimmedUrl, token.trim() || undefined);
      const saved = saveMcpServer({
        name: trimmedName || checked.serverName,
        url: trimmedUrl,
        token: token.trim() || undefined,
        enabled: true,
      });

      // Vositalarni keshga yozamiz, shunda AI shu zahoti ularni ko'ra oladi.
      await refreshMcpTools(saved);

      setName('');
      setUrl('');
      setToken('');
      load();
      onChanged?.();
      toast({
        title: "Konnektor qo'shildi",
        description: `${trimmedName} ulandi. ${checked.tools.length} ta vosita topildi.`,
      });
    } catch (error) {
      toast({
        title: 'Ulanmadi',
        description: error instanceof Error ? error.message : 'MCP serverga ulanib bo‘lmadi.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const toggle = (row: McpServer) => {
    saveMcpServer({
      id: row.id,
      name: row.name,
      url: row.url,
      token: row.token,
      enabled: !row.enabled,
    });
    load();
    onChanged?.();
  };

  const remove = (row: McpServer) => {
    removeMcpServer(row.id);
    load();
    onChanged?.();
  };

  const refresh = async () => {
    setLoading(true);
    try {
      const enabled = listMcpServers().filter((server) => server.enabled);
      await Promise.allSettled(enabled.map((server) => refreshMcpTools(server)));
      load();
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg border bg-muted/40">
              <Plug className="h-4 w-4" />
            </span>
            Konnektorlar va pluginlar
          </DialogTitle>
          <DialogDescription>
            MCP serverlarini ulang — AI ularning vositalarini suhbat ichida ishlatadi
            (Notion, GitHub, Drive, o'z serveringiz...).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 rounded-xl border border-border/60 bg-muted/15 p-3">
          <div className="grid gap-2">
            <Label htmlFor="connector-name" className="text-xs">Nom</Label>
            <Input
              id="connector-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Masalan: Notion"
              className="h-9"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="connector-url" className="text-xs">MCP server manzili</Label>
            <Input
              id="connector-url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://mcp.example.com/mcp"
              inputMode="url"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              className="h-9 font-mono text-xs"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="connector-token" className="text-xs">Token (ixtiyoriy)</Label>
            <Input
              id="connector-token"
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Bearer token"
              className="h-9"
            />
          </div>
          <Button
            onClick={add}
            disabled={saving}
            className="w-full gap-2 bg-foreground text-background hover:bg-foreground/90"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Konnektor qo'shish
          </Button>
        </div>

        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ulangan konnektorlar</p>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => void refresh()} aria-label="Yangilash">
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
              <div key={row.id} className="flex items-center gap-2 rounded-lg border border-border/60 px-3 py-2">
                <Wrench className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{row.name}</p>
                  <p className="truncate font-mono text-[10px] text-muted-foreground">{row.url}</p>
                </div>
                <Switch checked={row.enabled} onCheckedChange={() => toggle(row)} aria-label={`${row.name} yoqish`} />
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 text-destructive"
                  onClick={() => remove(row)}
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
