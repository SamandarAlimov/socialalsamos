import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import {
  Code2,
  FileText,
  Globe,
  Image as ImageIcon,
  PanelLeft,
  Sparkles,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { useIsMobile } from '@/hooks/use-mobile';
import { useFileUpload } from '@/hooks/useFileUpload';
import { toast as sonnerToast } from 'sonner';
import { AISidebar } from '@/components/ai/AISidebar';
import { AIComposer, type ComposerAttachment } from '@/components/ai/AIComposer';
import { AIMessageBubble, AIThinkingBubble } from '@/components/ai/AIMessageBubble';
import { AIArtifactPanel } from '@/components/ai/AIArtifactPanel';
import { AIConnectorsDialog } from '@/components/ai/AIConnectorsDialog';
import { AIGithubDialog } from '@/components/ai/AIGithubDialog';
import type { AIConversation, AIMessage, AISource, AIToolEvent } from '@/components/ai/types';
import { extractArtifacts } from '@/lib/aiArtifacts';
import { streamAgent } from '@/lib/ai/agentClient';
import { toolLabel, type ModelId, type ToolGroupId } from '@/lib/ai/capabilities';

const PIN_KEY = 'alsamos.ai.pinned';
const TITLE_KEY = 'alsamos.ai.titles';
const PREFS_KEY = 'alsamos.ai.prefs';

/**
 * Barcha vositalar doim yoqilgan: foydalanuvchi hech narsa tanlamaydi.
 * "Rasm chizib ber" desa — model o'zi rasm vositasini chaqiradi.
 * Yagona istisno — veb qidiruvni "+" menyusidan o'chirib qo'yish mumkin.
 */
const ALL_TOOL_GROUPS: ToolGroupId[] = [
  'web',
  'image',
  'video',
  'code',
  'alsamos',
  'connectors',
  'computer',
];

const readMap = (key: string): Record<string, string> => {
  try {
    return JSON.parse(localStorage.getItem(key) || '{}');
  } catch {
    return {};
  }
};
const writeMap = (key: string, value: Record<string, string>) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
};

const readPrefs = (): { model: ModelId; toolGroups: ToolGroupId[] } => {
  try {
    const parsed = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}');
    return {
      model: (parsed.model as ModelId) || 'auto',
      toolGroups:
        Array.isArray(parsed.toolGroups) && parsed.toolGroups.length
          ? (parsed.toolGroups as ToolGroupId[])
          : ALL_TOOL_GROUPS,
    };
  } catch {
    return { model: 'auto', toolGroups: ALL_TOOL_GROUPS };
  }
};

export default function AIPage() {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const location = useLocation();
  const navigate = useNavigate();

  const initialPrefs = useMemo(readPrefs, []);

  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [statusLabel, setStatusLabel] = useState("O'ylayapman...");
  const [conversations, setConversations] = useState<AIConversation[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(!isMobile);
  const [artifactsOpen, setArtifactsOpen] = useState(false);
  const [activeArtifactId, setActiveArtifactId] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<ComposerAttachment[]>([]);
  const [connectorsOpen, setConnectorsOpen] = useState(false);
  const [githubOpen, setGithubOpen] = useState(false);

  const [model, setModel] = useState<ModelId>(initialPrefs.model);
  const [toolGroups, setToolGroups] = useState<ToolGroupId[]>(initialPrefs.toolGroups);
  const [activeModel, setActiveModel] = useState<string | null>(null);

  const [forwardedPost, setForwardedPost] = useState<{
    id: string;
    content?: string;
    authorName?: string;
    mediaUrl?: string;
  } | null>(null);

  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const { uploadFile, uploading, getFileType } = useFileUpload();

  const busy = isStreaming;

  useEffect(() => {
    setSidebarOpen(!isMobile);
  }, [isMobile]);

  useEffect(() => {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify({ model, toolGroups }));
    } catch {
      /* ignore */
    }
  }, [model, toolGroups]);

  /* ---------------- history ---------------- */

  const deriveTitle = useCallback((msgs: AIMessage[], id?: string): string => {
    const overrides = readMap(TITLE_KEY);
    if (id && overrides[id]) return overrides[id];
    const first = msgs.find((m) => m.role === 'user');
    if (!first) return 'Yangi suhbat';
    return first.content.slice(0, 48) + (first.content.length > 48 ? '\u2026' : '');
  }, []);

  useEffect(() => {
    const load = async () => {
      if (!user) {
        setHistoryLoading(false);
        return;
      }
      setHistoryLoading(true);
      const { data } = await supabase
        .from('ai_conversations')
        .select('*')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false });

      const pins = readMap(PIN_KEY);
      const loaded: AIConversation[] = (data || []).map((conv: any) => {
        const msgs: AIMessage[] = ((conv.messages as any[]) || []).map((m: any) => ({
          ...m,
          timestamp: new Date(m.timestamp),
        }));
        return {
          id: conv.id,
          title: deriveTitle(msgs, conv.id),
          messages: msgs,
          updatedAt: new Date(conv.updated_at),
          pinned: Boolean(pins[conv.id]),
        };
      });
      setConversations(loaded);
      setHistoryLoading(false);
    };
    load();
  }, [user, deriveTitle]);

  const saveConversation = async (newMessages: AIMessage[]) => {
    if (!user) return;
    if (currentConversationId) {
      await supabase
        .from('ai_conversations')
        .update({ messages: newMessages as any, updated_at: new Date().toISOString() })
        .eq('id', currentConversationId);
      setConversations((prev) =>
        prev.map((c) =>
          c.id === currentConversationId
            ? {
                ...c,
                messages: newMessages,
                title: deriveTitle(newMessages, c.id),
                updatedAt: new Date(),
              }
            : c,
        ),
      );
    } else {
      const { data } = await supabase
        .from('ai_conversations')
        .insert({ user_id: user.id, messages: newMessages as any, context: 'chat' })
        .select()
        .single();
      if (data) {
        setCurrentConversationId(data.id);
        setConversations((prev) => [
          {
            id: data.id,
            title: deriveTitle(newMessages, data.id),
            messages: newMessages,
            updatedAt: new Date(),
          },
          ...prev,
        ]);
      }
    }
  };

  /* ---------------- forwarded post ---------------- */

  useEffect(() => {
    const state = location.state as any;
    if (!state?.forwardedPost) return;
    const postData = state.forwardedPost;
    setMessages([]);
    setCurrentConversationId(null);

    supabase
      .from('posts')
      .select(
        `id, content, media_urls, media_type,
         profile:profiles!posts_user_id_fkey (display_name, username, avatar_url)`,
      )
      .eq('id', postData.id)
      .single()
      .then(({ data }) => {
        if (data) {
          const p = data.profile as any;
          setForwardedPost({
            id: data.id,
            content: data.content || '',
            authorName: p?.display_name || p?.username || 'Foydalanuvchi',
            mediaUrl: data.media_urls?.[0] || undefined,
          });
        } else {
          setForwardedPost({ id: postData.id, content: postData.content || '' });
        }
      });

    navigate(location.pathname, { replace: true, state: {} });
  }, [location.state]);

  /* ---------------- scroll ---------------- */

  useEffect(() => {
    const el = scrollAreaRef.current?.querySelector('[data-radix-scroll-area-viewport]');
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, isStreaming]);

  /* ---------------- conversation actions ---------------- */

  const startNew = () => {
    abortRef.current?.abort();
    setMessages([]);
    setCurrentConversationId(null);
    setInput('');
    setAttachments([]);
    setForwardedPost(null);
    if (isMobile) setSidebarOpen(false);
  };

  const selectConversation = (conv: AIConversation) => {
    abortRef.current?.abort();
    setMessages(conv.messages);
    setCurrentConversationId(conv.id);
    if (isMobile) setSidebarOpen(false);
  };

  const deleteConversation = async (id: string) => {
    await supabase.from('ai_conversations').delete().eq('id', id);
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (currentConversationId === id) startNew();
  };

  const renameConversation = (id: string, title: string) => {
    const map = readMap(TITLE_KEY);
    map[id] = title;
    writeMap(TITLE_KEY, map);
    setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, title } : c)));
  };

  const togglePin = (id: string) => {
    const pins = readMap(PIN_KEY);
    if (pins[id]) delete pins[id];
    else pins[id] = '1';
    writeMap(PIN_KEY, pins);
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, pinned: Boolean(pins[id]) } : c)),
    );
  };

  /* ---------------- attachments ---------------- */

  const uploadFiles = async (list: FileList | null) => {
    const files = Array.from(list || []);
    for (const file of files) {
      if (file.size > 20 * 1024 * 1024) {
        sonnerToast.error(`${file.name}: 20MB dan katta`);
        continue;
      }
      const res = await uploadFile(file);
      if (res) {
        setAttachments((prev) => [
          ...prev,
          { url: res.url, name: res.name, type: getFileType(res.type) },
        ]);
      } else {
        sonnerToast.error(`${file.name} yuklanmadi`);
      }
    }
  };

  /* ---------------- agent run ---------------- */

  const runAgent = async (baseMessages: AIMessage[]) => {
    setIsStreaming(true);
    setStatusLabel("O'ylayapman...");

    const controller = new AbortController();
    abortRef.current = controller;

    const assistantId = crypto.randomUUID();
    let content = '';
    const tools: AIToolEvent[] = [];
    const images: string[] = [];
    const sources: AISource[] = [];
    let usedModel: string | null = null;
    let notice: string | undefined;
    let created = false;

    const flush = () => {
      const assistant: AIMessage = {
        id: assistantId,
        role: 'assistant',
        content,
        images: images.length ? [...images] : undefined,
        sources: sources.length ? [...sources] : undefined,
        tools: tools.length ? tools.map((t) => ({ ...t })) : undefined,
        model: usedModel ?? undefined,
        mode: 'agent',
        notice,
        timestamp: new Date(),
      };
      setMessages(
        created
          ? (prev) => prev.map((m) => (m.id === assistantId ? assistant : m))
          : [...baseMessages, assistant],
      );
      created = true;
      return assistant;
    };

    try {
      const history = baseMessages.map((m) => ({ role: m.role, content: m.content }));

      if (forwardedPost && history.length > 0) {
        const contextInfo = `\n\n[Foydalanuvchi quyidagi postni AI ga yubordi]\nPost muallifi: ${
          forwardedPost.authorName || "Noma'lum"
        }\nPost matni: ${forwardedPost.content || "(matn yo'q)"}\n${
          forwardedPost.mediaUrl ? `Media: ${forwardedPost.mediaUrl}` : ''
        }`;
        history[0] = { ...history[0], content: history[0].content + contextInfo };
      }

      await streamAgent({
        messages: history,
        mode: 'agent',
        model,
        toolGroups,
        conversationId: currentConversationId,
        signal: controller.signal,
        onEvent: (event) => {
          switch (event.type) {
            case 'meta': {
              usedModel = event.model;
              setActiveModel(event.model);
              break;
            }
            case 'delta': {
              content += event.text;
              flush();
              break;
            }
            case 'tool_call': {
              const label = toolLabel(event.name);
              setStatusLabel(`${label}\u2026`);
              tools.push({
                id: event.id || crypto.randomUUID(),
                name: event.name,
                label,
                status: 'running',
                args: event.args,
                startedAt: Date.now(),
              });
              flush();
              break;
            }
            case 'tool_result': {
              const entry = tools.find((t) => t.id === event.id) ?? tools[tools.length - 1];
              if (entry) {
                entry.status = event.ok ? 'done' : 'error';
                entry.summary = event.summary;
                entry.data = event.data;
                entry.finishedAt = Date.now();
              }
              const imageUrl = (event.data as any)?.imageUrl;
              if (typeof imageUrl === 'string' && !images.includes(imageUrl)) {
                images.push(imageUrl);
              }
              const found = (event.data as any)?.sources;
              if (Array.isArray(found)) {
                for (const source of found as AISource[]) {
                  if (source?.url && !sources.some((s) => s.url === source.url)) {
                    sources.push({ title: source.title, url: source.url });
                  }
                }
              }
              const jobId = (event.data as any)?.jobId;
              if (jobId) {
                sonnerToast.info('Video navbatga qo\u2019yildi', {
                  description: 'Tayyor bo\u2019lgach shu suhbatda ko\u2019rinadi.',
                });
              }
              const taskId = (event.data as any)?.taskId;
              if (taskId) {
                sonnerToast.warning('Kompyuter vazifasi tasdiq kutmoqda', {
                  description: 'Alsamos Bridge ilovasida tasdiqlang.',
                });
              }
              setStatusLabel('Javob tayyorlanmoqda\u2026');
              flush();
              break;
            }
            case 'notice': {
              notice = event.message;
              flush();
              break;
            }
            case 'error': {
              throw new Error(event.message);
            }
          }
        },
      });

      if (!content && !images.length) {
        content = "Javob bo'sh qaytdi. Iltimos, qaytadan urinib ko'ring.";
      }
      const final = flush();
      await saveConversation([...baseMessages, final]);
      setForwardedPost(null);
    } catch (error: any) {
      if (error?.name === 'AbortError') {
        if (content) {
          const partial = flush();
          await saveConversation([...baseMessages, partial]);
        }
        return;
      }
      setMessages([
        ...baseMessages,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: error?.message || "Javob olishda xatolik. Qaytadan urinib ko'ring.",
          error: true,
          tools: tools.length ? tools : undefined,
          timestamp: new Date(),
        },
      ]);
    } finally {
      abortRef.current = null;
      setIsStreaming(false);
    }
  };

  const send = async (overrideText?: string) => {
    const raw = (overrideText ?? input).trim();
    if ((!raw && attachments.length === 0) || busy) return;

    let content = raw;
    if (attachments.length > 0) {
      const attachmentText = attachments.map((a) => `[${a.type}] ${a.name}: ${a.url}`).join('\n');
      content = content ? `${content}\n\n${attachmentText}` : attachmentText;
    }

    const userMsg: AIMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
      attachments: attachments.length ? [...attachments] : undefined,
      timestamp: new Date(),
    };
    const base = [...messages, userMsg];
    setMessages(base);
    setInput('');
    setAttachments([]);

    await runAgent(base);
  };

  const regenerateFrom = async (index: number) => {
    const base = messages.slice(0, index);
    if (!base.some((m) => m.role === 'user')) return;
    setMessages(base);
    await runAgent(base);
  };

  const stop = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsStreaming(false);
  };

  /* ---------------- suggestions (kam va foydali) ---------------- */

  const suggestions = useMemo(
    () => [
      {
        icon: <Code2 className="h-5 w-5" />,
        title: 'Kod yozib bering',
        prompt:
          'JavaScriptda katta massivni tez saralaydigan funksiya yoz va uni testlar bilan tekshirib natijani ko\u2019rsat',
      },
      {
        icon: <ImageIcon className="h-5 w-5" />,
        title: 'Rasm yarating',
        prompt:
          'Alsamos brendi uchun minimalistik logotip konsepti rasmini yarat: to\u2019q fon, apelsin rangli aksent',
      },
      {
        icon: <Globe className="h-5 w-5" />,
        title: 'Internetdan tekshiring',
        prompt:
          "Internetdan qidirib, 2026-yilda O'zbekistonda eng ko'p ishlatilgan to'lov tizimlarini manbalar bilan tahlil qilib ber",
      },
      {
        icon: <FileText className="h-5 w-5" />,
        title: 'Hujjat tayyorlang',
        prompt: 'Kichik biznes uchun oylik moliyaviy hisobot shablonini jadval ko\u2019rinishida tayyorla',
      },
    ],
    [],
  );

  const greetingName = profile?.display_name || profile?.username || '';

  const artifacts = useMemo(() => extractArtifacts(messages), [messages]);
  const showArtifacts = artifactsOpen && artifacts.length > 0;

  const openArtifacts = () => {
    if (artifacts.length === 0) {
      sonnerToast.info('Hali artefakt yo\u2019q', {
        description: 'Kod yoki hujjat yaratilgach shu yerda ko\u2019rinadi.',
      });
      return;
    }
    setArtifactsOpen(true);
    if (isMobile) setSidebarOpen(false);
  };

  useEffect(() => {
    if (!user && messages.length > 0) {
      toast({
        title: 'Tizimga kiring',
        description: 'Suhbatlar saqlanishi va vositalar ishlashi uchun hisobga kirish kerak.',
      });
    }
  }, [user, messages.length, toast]);

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden bg-background md:h-[calc(100vh-2rem)]">
      {/* Sidebar */}
      <AnimatePresence>
        {sidebarOpen && (
          <>
            {isMobile && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
                onClick={() => setSidebarOpen(false)}
              />
            )}
            <motion.aside
              initial={{ x: isMobile ? -320 : 0, opacity: isMobile ? 0 : 1 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -320, opacity: 0 }}
              transition={{ type: 'spring', damping: 26, stiffness: 300 }}
              className={cn(
                'z-50 flex flex-col border-r border-border/50 bg-card/80 backdrop-blur-xl',
                isMobile
                  ? 'fixed bottom-0 left-0 top-0 w-[300px]'
                  : 'relative w-[280px] lg:w-[300px]',
              )}
            >
              <AISidebar
                conversations={conversations}
                loading={historyLoading}
                activeId={currentConversationId}
                isMobile={isMobile}
                profile={profile as any}
                onNew={startNew}
                onSelect={selectConversation}
                onDelete={deleteConversation}
                onRename={renameConversation}
                onTogglePin={togglePin}
                onClose={() => setSidebarOpen(false)}
                onOpenArtifacts={openArtifacts}
                onOpenConnectors={() => setConnectorsOpen(true)}
                onOpenGithub={() => setGithubOpen(true)}
                artifactCount={artifacts.length}
              />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Main */}
      <div className="relative flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border/30 bg-background/80 px-3 backdrop-blur-xl sm:h-14 sm:px-4">
          {!sidebarOpen && (
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 shrink-0 rounded-lg"
              onClick={() => setSidebarOpen(true)}
              aria-label="Yon panelni ochish"
            >
              <PanelLeft className="h-4 w-4" />
            </Button>
          )}
          <h1 className="truncate text-sm font-semibold">
            {currentConversationId
              ? conversations.find((c) => c.id === currentConversationId)?.title || 'Suhbat'
              : 'Yangi suhbat'}
          </h1>
          <div className="flex-1" />
          {artifacts.length > 0 && (
            <Button
              size="sm"
              variant={artifactsOpen ? 'secondary' : 'ghost'}
              className="h-8 gap-1.5 rounded-lg px-2.5 text-[11px]"
              onClick={() => setArtifactsOpen((v) => !v)}
            >
              <FileText className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Artefaktlar</span>
              <span className="rounded-full bg-muted/70 px-1.5 text-[10px]">{artifacts.length}</span>
            </Button>
          )}
        </header>

        <ScrollArea ref={scrollAreaRef} className="flex-1">
          {messages.length === 0 ? (
            <div className="flex min-h-[calc(100vh-16rem)] flex-col items-center justify-center px-4 py-8">
              <motion.div
                initial={{ scale: 0.85, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', damping: 16 }}
                className="mb-5 flex h-16 w-16 items-center justify-center rounded-3xl bg-gradient-to-br from-alsamos-orange to-alsamos-orange-dark shadow-2xl shadow-alsamos-orange/25"
              >
                <Sparkles className="h-8 w-8 text-white" />
              </motion.div>

              <h2 className="mb-1.5 text-center font-display text-2xl font-bold sm:text-3xl">
                {greetingName ? `Salom, ${greetingName}` : 'Alsamos AI'}
              </h2>
              <p className="mb-7 max-w-md text-center text-sm text-muted-foreground">
                Nima kerakligini shunchaki yozing — kerakli vositani AI o\u2019zi tanlaydi.
              </p>

              {forwardedPost && (
                <div className="mb-6 w-full max-w-2xl overflow-hidden rounded-2xl border border-alsamos-orange/30 bg-card/60">
                  <div className="flex items-center gap-2 border-b border-alsamos-orange/20 bg-alsamos-orange/10 px-4 py-2.5">
                    <Sparkles className="h-4 w-4 text-alsamos-orange" />
                    <span className="text-xs font-semibold text-alsamos-orange">Post yuborildi</span>
                    <button
                      onClick={() => setForwardedPost(null)}
                      className="ml-auto text-muted-foreground hover:text-foreground"
                      aria-label="Yopish"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="p-4">
                    {forwardedPost.mediaUrl && (
                      <img
                        src={forwardedPost.mediaUrl}
                        alt=""
                        className="mb-3 max-h-48 w-full rounded-xl object-cover"
                      />
                    )}
                    <p className="mb-1 text-xs text-muted-foreground">@{forwardedPost.authorName}</p>
                    {forwardedPost.content && (
                      <p className="line-clamp-4 text-sm">{forwardedPost.content}</p>
                    )}
                  </div>
                </div>
              )}

              <div className="grid w-full max-w-2xl grid-cols-2 gap-2.5">
                {suggestions.map((s, i) => (
                  <motion.button
                    key={s.title}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04 }}
                    onClick={() => void send(s.prompt)}
                    className="group flex items-center gap-2.5 rounded-2xl border border-border/50 bg-card/50 p-3 text-left transition-all hover:border-alsamos-orange/30 hover:bg-card/80"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-alsamos-orange/10 text-alsamos-orange">
                      {s.icon}
                    </span>
                    <span className="min-w-0 truncate text-[13px] font-medium">{s.title}</span>
                  </motion.button>
                ))}
              </div>
            </div>
          ) : (
            <div className="mx-auto max-w-3xl px-3 py-4 sm:px-4 sm:py-6">
              {messages.map((msg, idx) => (
                <AIMessageBubble
                  key={msg.id}
                  message={msg}
                  isStreaming={
                    isStreaming && idx === messages.length - 1 && msg.role === 'assistant'
                  }
                  onRegenerate={msg.role === 'assistant' ? () => regenerateFrom(idx) : undefined}
                />
              ))}
              {isStreaming && messages[messages.length - 1]?.role === 'user' && (
                <AIThinkingBubble label={statusLabel} />
              )}
            </div>
          )}
        </ScrollArea>

        <AIComposer
          value={input}
          onChange={setInput}
          onSend={() => send()}
          onStop={stop}
          busy={busy}
          uploading={uploading}
          attachments={attachments}
          onPickFiles={uploadFiles}
          onDropFiles={uploadFiles}
          onRemoveAttachment={(url) => setAttachments((prev) => prev.filter((a) => a.url !== url))}
          model={model}
          onModelChange={setModel}
          activeModel={activeModel}
          toolGroups={toolGroups}
          onToolGroupsChange={setToolGroups}
          onOpenConnectors={() => setConnectorsOpen(true)}
          onOpenGithub={() => setGithubOpen(true)}
        />
      </div>

      {/* Artifacts */}
      <AnimatePresence>
        {showArtifacts && (
          <motion.div
            initial={{ x: isMobile ? '100%' : 40, opacity: isMobile ? 1 : 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: isMobile ? '100%' : 40, opacity: isMobile ? 1 : 0 }}
            transition={{ type: 'spring', damping: 28, stiffness: 320 }}
            className={cn('z-50', isMobile ? 'fixed inset-0 bg-background' : 'relative shrink-0')}
          >
            <AIArtifactPanel
              artifacts={artifacts}
              activeId={activeArtifactId}
              onSelect={setActiveArtifactId}
              onClose={() => setArtifactsOpen(false)}
              isMobile={isMobile}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <AIConnectorsDialog
        open={connectorsOpen}
        onOpenChange={setConnectorsOpen}
        userId={user?.id}
      />

      <AIGithubDialog
        open={githubOpen}
        onOpenChange={setGithubOpen}
        onPickRepo={(repo) => {
          const prefix = input.trim() ? `${input.trim()} ` : '';
          setInput(`${prefix}${repo.fullName} repozitoriysi bo'yicha: `);
        }}
      />
    </div>
  );
}
