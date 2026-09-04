import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Boxes,
  BriefcaseBusiness,
  CalendarDays,
  Check,
  Cloud,
  FileText,
  Github,
  HardDrive,
  Loader2,
  Mail,
  MessageSquare,
  Palette,
  Plug,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  TicketCheck,
  Trash2,
  Wrench,
  Eye,
  EyeOff,
} from 'lucide-react';
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
import { cn } from '@/lib/utils';
import {
  cachedTools,
  listMcpServers,
  refreshMcpTools,
  removeMcpServer,
  saveMcpServer,
  testMcpServer,
  type McpServer,
} from '@/lib/ai/mcpClient';
import {
  connectGithub,
  disconnectGithub,
  githubStatus,
} from '@/lib/ai/githubConnector';

interface AIConnectorsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId?: string | null;
  onChanged?: () => void;
}

type ConnectorCategory = 'all' | 'work' | 'developer' | 'communication' | 'design';

type ConnectorDefinition = {
  id: string;
  name: string;
  description: string;
  category: Exclude<ConnectorCategory, 'all'>;
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
  hint: string;
  aliases: string[];
  kind?: 'github' | 'mcp';
};

const CONNECTORS: ConnectorDefinition[] = [
  {
    id: 'google-drive',
    name: 'Google Drive',
    description: 'Drive fayllari, Docs, Sheets va Slides bilan ishlash.',
    category: 'work',
    icon: HardDrive,
    accent: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
    hint: 'Google Drive uchun MCP server manzilini va kerak bo‘lsa tokenni kiriting.',
    aliases: ['drive', 'google drive', 'docs', 'sheets', 'slides'],
  },
  {
    id: 'gmail',
    name: 'Gmail',
    description: 'Xatlarni qidirish, o‘qish va draft oqimlarini avtomatlashtirish.',
    category: 'communication',
    icon: Mail,
    accent: 'bg-red-500/10 text-red-600 dark:text-red-400',
    hint: 'Gmail MCP serveringizning Streamable HTTP URL manzilini kiriting.',
    aliases: ['gmail', 'mail', 'email'],
  },
  {
    id: 'google-calendar',
    name: 'Google Calendar',
    description: 'Taqvim, uchrashuv va availability ma’lumotlari.',
    category: 'work',
    icon: CalendarDays,
    accent: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400',
    hint: 'Google Calendar MCP server URL manzilini kiriting.',
    aliases: ['calendar', 'google calendar', 'meeting'],
  },
  {
    id: 'github',
    name: 'GitHub',
    description: 'Repo, issue, pull request va kod bilan to‘g‘ridan-to‘g‘ri ishlash.',
    category: 'developer',
    icon: Github,
    accent: 'bg-foreground/8 text-foreground',
    hint: 'GitHub Fine-grained Personal Access Token bilan ulanadi.',
    aliases: ['github', 'git', 'repository', 'repo'],
    kind: 'github',
  },
  {
    id: 'notion',
    name: 'Notion',
    description: 'Workspace sahifalari, database va hujjatlarni AI kontekstiga ulang.',
    category: 'work',
    icon: FileText,
    accent: 'bg-foreground/8 text-foreground',
    hint: 'Notion MCP server URL va auth tokenini kiriting.',
    aliases: ['notion', 'notes', 'workspace'],
  },
  {
    id: 'slack',
    name: 'Slack',
    description: 'Kanallar, xabarlar va jamoa workflow’lari.',
    category: 'communication',
    icon: MessageSquare,
    accent: 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
    hint: 'Slack MCP server URL manzilini kiriting.',
    aliases: ['slack', 'channel', 'team chat'],
  },
  {
    id: 'figma',
    name: 'Figma',
    description: 'Design konteksti, fayllar va komponentlar bilan ishlash.',
    category: 'design',
    icon: Palette,
    accent: 'bg-pink-500/10 text-pink-600 dark:text-pink-400',
    hint: 'Figma MCP server URL va tokenini kiriting.',
    aliases: ['figma', 'design', 'ui', 'ux'],
  },
  {
    id: 'canva',
    name: 'Canva',
    description: 'Dizayn va marketing materiallari workflow’larini ulang.',
    category: 'design',
    icon: Palette,
    accent: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400',
    hint: 'Canva bilan ishlaydigan MCP server URL manzilini kiriting.',
    aliases: ['canva', 'design', 'presentation'],
  },
  {
    id: 'microsoft-365',
    name: 'Microsoft 365',
    description: 'OneDrive, Outlook, SharePoint va Teams konteksti.',
    category: 'work',
    icon: Boxes,
    accent: 'bg-orange-500/10 text-orange-600 dark:text-orange-400',
    hint: 'Microsoft 365 MCP server URL va kerakli tokenni kiriting.',
    aliases: ['microsoft', 'office', 'onedrive', 'outlook', 'teams', 'sharepoint'],
  },
  {
    id: 'dropbox',
    name: 'Dropbox',
    description: 'Bulutdagi fayllarni qidirish va ish jarayoniga ulash.',
    category: 'work',
    icon: Cloud,
    accent: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
    hint: 'Dropbox MCP server URL manzilini kiriting.',
    aliases: ['dropbox', 'cloud', 'files'],
  },
  {
    id: 'linear',
    name: 'Linear',
    description: 'Issue, project va engineering workflow’lari.',
    category: 'developer',
    icon: TicketCheck,
    accent: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
    hint: 'Linear MCP server URL va auth tokenini kiriting.',
    aliases: ['linear', 'issue', 'project'],
  },
  {
    id: 'jira',
    name: 'Jira',
    description: 'Task, sprint va software project boshqaruvi.',
    category: 'developer',
    icon: BriefcaseBusiness,
    accent: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
    hint: 'Jira MCP server URL va tokenini kiriting.',
    aliases: ['jira', 'atlassian', 'sprint', 'issue'],
  },
  {
    id: 'custom',
    name: 'Custom MCP',
    description: 'Istalgan Streamable HTTP MCP serverini ulang.',
    category: 'developer',
    icon: Plug,
    accent: 'bg-muted text-foreground',
    hint: 'MCP serveringizning HTTPS URL manzilini va ixtiyoriy Bearer tokenni kiriting.',
    aliases: ['custom', 'mcp', 'server', 'plugin'],
  },
];

const CATEGORY_LABELS: Array<{ id: ConnectorCategory; label: string }> = [
  { id: 'all', label: 'Hammasi' },
  { id: 'work', label: 'Ish' },
  { id: 'developer', label: 'Developer' },
  { id: 'communication', label: 'Aloqa' },
  { id: 'design', label: 'Dizayn' },
];

function normalized(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function serverMatches(server: McpServer, connector: ConnectorDefinition) {
  const target = normalized(`${server.name} ${server.url}`);
  return connector.aliases.some((alias) => target.includes(normalized(alias)));
}

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
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<ConnectorCategory>('all');
  const [selected, setSelected] = useState<ConnectorDefinition | null>(null);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [token, setToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [githubConnected, setGithubConnected] = useState(false);
  const [githubLogin, setGithubLogin] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(listMcpServers().sort((a, b) => b.addedAt - a.addedAt));
      try {
        const status = await githubStatus();
        setGithubConnected(status.connected);
        setGithubLogin(status.login);
      } catch {
        setGithubConnected(false);
        setGithubLogin(null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const visibleConnectors = useMemo(() => {
    const cleanQuery = query.trim().toLowerCase();
    return CONNECTORS.filter((connector) => {
      if (category !== 'all' && connector.category !== category) return false;
      if (!cleanQuery) return true;
      return `${connector.name} ${connector.description} ${connector.aliases.join(' ')}`
        .toLowerCase()
        .includes(cleanQuery);
    });
  }, [category, query]);

  const chooseConnector = (connector: ConnectorDefinition) => {
    setSelected(connector);
    setName(connector.id === 'custom' ? '' : connector.name);
    setUrl('');
    setToken('');
    setShowToken(false);
  };

  const add = async () => {
    if (!userId) {
      toast({ title: 'Tizimga kirish kerak', variant: 'destructive' });
      return;
    }

    if (selected?.kind === 'github') {
      const value = token.trim();
      if (!value) return;
      setSaving(true);
      try {
        const result = await connectGithub(value);
        setGithubConnected(true);
        setGithubLogin(result.login);
        setToken('');
        setSelected(null);
        onChanged?.();
        toast({
          title: 'GitHub ulandi',
          description: result.login ? `@${result.login}` : 'Repo vositalari tayyor.',
        });
      } catch (error) {
        toast({
          title: 'GitHub ulanmadi',
          description: error instanceof Error ? error.message : 'Tokenni tekshiring.',
          variant: 'destructive',
        });
      } finally {
        setSaving(false);
      }
      return;
    }

    const trimmedName = name.trim();
    const trimmedUrl = url.trim();
    if (!trimmedName || !/^https?:\/\//i.test(trimmedUrl)) {
      toast({
        title: 'MCP manzili kerak',
        description: 'Nom va http:// yoki https:// bilan boshlanadigan MCP server URL manzilini kiriting.',
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
      await refreshMcpTools(saved);

      setSelected(null);
      setName('');
      setUrl('');
      setToken('');
      await load();
      onChanged?.();
      toast({
        title: 'Konnektor ulandi',
        description: `${trimmedName}: ${checked.tools.length} ta AI vosita tayyor.`,
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
    setRows(listMcpServers().sort((a, b) => b.addedAt - a.addedAt));
    onChanged?.();
  };

  const remove = (row: McpServer) => {
    removeMcpServer(row.id);
    setRows(listMcpServers().sort((a, b) => b.addedAt - a.addedAt));
    onChanged?.();
  };

  const refresh = async () => {
    setLoading(true);
    try {
      const enabled = listMcpServers().filter((server) => server.enabled);
      await Promise.allSettled(enabled.map((server) => refreshMcpTools(server)));
      await load();
    } finally {
      setLoading(false);
    }
  };

  const disconnectGithubNow = async () => {
    setLoading(true);
    try {
      await disconnectGithub();
      setGithubConnected(false);
      setGithubLogin(null);
      onChanged?.();
      toast({ title: 'GitHub uzildi' });
    } finally {
      setLoading(false);
    }
  };

  const connectedCount = rows.filter((row) => row.enabled).length + (githubConnected ? 1 : 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="h-[82vh] w-[96vw] max-w-6xl overflow-hidden p-0 sm:rounded-2xl">
        <div className="flex h-full min-h-0 flex-col">
          <DialogHeader className="shrink-0 border-b border-border/50 px-5 py-4 pr-12 text-left">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border/70 bg-muted/40">
                <Plug className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <DialogTitle className="text-lg">Konnektorlar</DialogTitle>
                <DialogDescription className="mt-1 max-w-2xl">
                  Alsamos AI’ni ish vositalaringizga ulang. GitHub bevosita ulanadi, qolgan servislar esa standart MCP orqali ishlaydi.
                </DialogDescription>
              </div>
              <div className="ml-auto hidden shrink-0 items-center gap-2 sm:flex">
                <span className="rounded-full border border-border/60 bg-muted/30 px-2.5 py-1 text-[11px] text-muted-foreground">
                  {connectedCount} ulangan
                </span>
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => void refresh()} aria-label="Yangilash">
                  <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
                </Button>
              </div>
            </div>
          </DialogHeader>

          <div className="grid min-h-0 flex-1 md:grid-cols-[minmax(0,1fr)_340px]">
            <div className="flex min-h-0 flex-col border-b border-border/50 md:border-b-0 md:border-r">
              <div className="shrink-0 space-y-3 px-4 py-4 sm:px-5">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Konnektorlarni qidirish"
                    className="h-10 rounded-xl pl-9"
                  />
                </div>
                <div className="flex gap-1.5 overflow-x-auto pb-0.5">
                  {CATEGORY_LABELS.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setCategory(item.id)}
                      className={cn(
                        'shrink-0 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors',
                        category === item.id
                          ? 'border-foreground bg-foreground text-background'
                          : 'border-border/60 bg-background text-muted-foreground hover:bg-muted/50 hover:text-foreground',
                      )}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              <ScrollArea className="min-h-0 flex-1 px-4 pb-5 sm:px-5">
                <div className="grid gap-2 pb-2 sm:grid-cols-2">
                  {visibleConnectors.map((connector) => {
                    const Icon = connector.icon;
                    const matched = rows.find((row) => serverMatches(row, connector));
                    const isConnected = connector.kind === 'github' ? githubConnected : Boolean(matched?.enabled);

                    return (
                      <button
                        key={connector.id}
                        type="button"
                        onClick={() => chooseConnector(connector)}
                        className="group flex min-h-28 flex-col rounded-2xl border border-border/60 bg-card p-3.5 text-left transition-all hover:border-border hover:bg-muted/20 hover:shadow-sm"
                      >
                        <div className="flex items-start gap-3">
                          <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', connector.accent)}>
                            <Icon className="h-5 w-5" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <p className="truncate text-sm font-semibold">{connector.name}</p>
                              {isConnected && <Check className="h-3.5 w-3.5 shrink-0 text-emerald-500" />}
                            </div>
                            <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">
                              {connector.description}
                            </p>
                          </div>
                        </div>
                        <div className="mt-auto flex items-center justify-between pt-3">
                          <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                            {isConnected ? 'Ulangan' : connector.kind === 'github' ? 'Bevosita' : 'MCP'}
                          </span>
                          <span className="text-[11px] font-medium text-foreground opacity-70 group-hover:opacity-100">
                            {isConnected ? 'Sozlash' : 'Ulash →'}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {visibleConnectors.length === 0 && (
                  <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
                    Mos konnektor topilmadi.
                  </div>
                )}
              </ScrollArea>
            </div>

            <div className="flex min-h-0 flex-col bg-muted/10">
              {selected ? (
                <div className="flex min-h-0 flex-1 flex-col">
                  <div className="shrink-0 border-b border-border/50 p-4">
                    <button
                      type="button"
                      onClick={() => setSelected(null)}
                      className="mb-3 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                    >
                      <ArrowLeft className="h-3.5 w-3.5" /> Katalogga qaytish
                    </button>
                    <div className="flex items-start gap-3">
                      <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', selected.accent)}>
                        <selected.icon className="h-5 w-5" />
                      </span>
                      <div className="min-w-0">
                        <p className="font-semibold">{selected.name}</p>
                        <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{selected.hint}</p>
                      </div>
                    </div>
                  </div>

                  <ScrollArea className="min-h-0 flex-1">
                    <div className="space-y-4 p-4">
                      {selected.kind === 'github' && githubConnected ? (
                        <div className="space-y-3">
                          <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-3">
                            <div className="flex items-center gap-2 text-sm font-medium">
                              <ShieldCheck className="h-4 w-4 text-emerald-500" />
                              GitHub ulangan
                            </div>
                            {githubLogin && <p className="mt-1 text-xs text-muted-foreground">@{githubLogin}</p>}
                          </div>
                          <Button variant="outline" className="w-full" onClick={() => void disconnectGithubNow()} disabled={loading}>
                            GitHub’ni uzish
                          </Button>
                        </div>
                      ) : (
                        <>
                          {selected.kind !== 'github' && (
                            <>
                              <div className="space-y-1.5">
                                <Label htmlFor="connector-name" className="text-xs">Nom</Label>
                                <Input
                                  id="connector-name"
                                  value={name}
                                  onChange={(event) => setName(event.target.value)}
                                  placeholder="Konnektor nomi"
                                  className="h-9"
                                />
                              </div>
                              <div className="space-y-1.5">
                                <Label htmlFor="connector-url" className="text-xs">MCP server URL</Label>
                                <Input
                                  id="connector-url"
                                  value={url}
                                  onChange={(event) => setUrl(event.target.value)}
                                  placeholder="https://mcp.example.com/mcp"
                                  inputMode="url"
                                  autoCapitalize="none"
                                  autoCorrect="off"
                                  spellCheck={false}
                                  className="h-9 font-mono text-xs"
                                />
                              </div>
                            </>
                          )}

                          <div className="space-y-1.5">
                            <Label htmlFor="connector-token" className="text-xs">
                              {selected.kind === 'github' ? 'Fine-grained access token' : 'Token (ixtiyoriy)'}
                            </Label>
                            <div className="relative">
                              <Input
                                id="connector-token"
                                type={showToken ? 'text' : 'password'}
                                value={token}
                                onChange={(event) => setToken(event.target.value)}
                                placeholder={selected.kind === 'github' ? 'github_pat_…' : 'Bearer token'}
                                autoComplete="off"
                                className="h-9 pr-9 font-mono text-xs"
                              />
                              <button
                                type="button"
                                onClick={() => setShowToken((value) => !value)}
                                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
                                aria-label={showToken ? 'Tokenni yashirish' : 'Tokenni ko‘rsatish'}
                              >
                                {showToken ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                              </button>
                            </div>
                          </div>

                          <div className="rounded-xl border border-border/60 bg-background/70 p-3 text-[11px] leading-relaxed text-muted-foreground">
                            {selected.kind === 'github'
                              ? 'Token faqat shu brauzerda saqlanadi. Metadata Read, Contents va kerak bo‘lsa Issues/Pull requests ruxsatlarini bering.'
                              : 'Alsamos serverni ulashdan oldin initialize va tools/list orqali tekshiradi. Token faqat shu brauzerda saqlanadi.'}
                          </div>

                          <Button
                            onClick={() => void add()}
                            disabled={saving || (selected.kind === 'github' ? !token.trim() : !url.trim())}
                            className="w-full gap-2 bg-foreground text-background hover:bg-foreground/90"
                          >
                            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                            {saving ? 'Tekshirilmoqda…' : `${selected.name} ulash`}
                          </Button>
                        </>
                      )}
                    </div>
                  </ScrollArea>
                </div>
              ) : (
                <div className="flex min-h-0 flex-1 flex-col">
                  <div className="flex shrink-0 items-center justify-between border-b border-border/50 p-4">
                    <div>
                      <p className="text-sm font-semibold">Ulanganlar</p>
                      <p className="text-[11px] text-muted-foreground">AI hozir ishlata oladigan servislar</p>
                    </div>
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => chooseConnector(CONNECTORS[CONNECTORS.length - 1])} aria-label="Custom MCP qo‘shish">
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>

                  <ScrollArea className="min-h-0 flex-1">
                    <div className="space-y-2 p-3">
                      {githubConnected && (
                        <button
                          type="button"
                          onClick={() => chooseConnector(CONNECTORS.find((item) => item.id === 'github')!)}
                          className="flex w-full items-center gap-2.5 rounded-xl border border-border/60 bg-background p-2.5 text-left hover:bg-muted/40"
                        >
                          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-foreground/8">
                            <Github className="h-4 w-4" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-semibold">GitHub</p>
                            <p className="truncate text-[10px] text-muted-foreground">{githubLogin ? `@${githubLogin}` : 'Ulangan'}</p>
                          </div>
                          <span className="h-2 w-2 rounded-full bg-emerald-500" />
                        </button>
                      )}

                      {rows.map((row) => (
                        <div key={row.id} className="rounded-xl border border-border/60 bg-background p-2.5">
                          <div className="flex items-center gap-2.5">
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted/60">
                              <Wrench className="h-4 w-4 text-muted-foreground" />
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-xs font-semibold">{row.name}</p>
                              <p className="truncate font-mono text-[9px] text-muted-foreground">{row.url}</p>
                            </div>
                            <Switch checked={row.enabled} onCheckedChange={() => toggle(row)} aria-label={`${row.name} yoqish`} />
                          </div>
                          <div className="mt-2 flex items-center justify-between border-t border-border/40 pt-2">
                            <span className="text-[10px] text-muted-foreground">{cachedTools(row.id).length} vosita</span>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-6 w-6 text-muted-foreground hover:text-destructive"
                              onClick={() => remove(row)}
                              aria-label={`${row.name} o‘chirish`}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      ))}

                      {!githubConnected && rows.length === 0 && !loading && (
                        <div className="rounded-xl border border-dashed border-border/60 p-5 text-center">
                          <Plug className="mx-auto h-5 w-5 text-muted-foreground" />
                          <p className="mt-2 text-xs font-medium">Hali konnektor ulanmagan</p>
                          <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
                            Chap tomondagi katalogdan servisni tanlang.
                          </p>
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                </div>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default AIConnectorsDialog;
