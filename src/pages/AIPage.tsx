import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import {
  PanelLeft,
  Sparkles,
  Zap,
  Lightbulb,
  Code2,
  FileText,
  Globe,
  ShoppingBag,
  MapPin,
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
import type { AIConversation, AIMessage } from '@/components/ai/types';
import { detectIntent } from '@/lib/aiIntent';
import { extractArtifacts } from '@/lib/aiArtifacts';


const PIN_KEY = 'alsamos.ai.pinned';
const TITLE_KEY = 'alsamos.ai.titles';

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

export default function AIPage() {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const location = useLocation();
  const navigate = useNavigate();

  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [conversations, setConversations] = useState<AIConversation[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  // Cold start ALWAYS lands on a fresh conversation — never restore the last chat.
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(!isMobile);
  const [artifactsOpen, setArtifactsOpen] = useState(false);
  const [activeArtifactId, setActiveArtifactId] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<ComposerAttachment[]>([]);

  const [forwardedPost, setForwardedPost] = useState<{
    id: string;
    content?: string;
    authorName?: string;
    mediaUrl?: string;
  } | null>(null);

  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const { uploadFile, uploading, getFileType } = useFileUpload();

  const busy = isStreaming || isGeneratingImage;

  useEffect(() => {
    setSidebarOpen(!isMobile);
  }, [isMobile]);

  /* ---------------- history ---------------- */

  const deriveTitle = useCallback((msgs: AIMessage[], id?: string): string => {
    const overrides = readMap(TITLE_KEY);
    if (id && overrides[id]) return overrides[id];
    const first = msgs.find((m) => m.role === 'user');
    if (!first) return 'Yangi suhbat';
    return first.content.slice(0, 48) + (first.content.length > 48 ? '…' : '');
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
            ? { ...c, messages: newMessages, title: deriveTitle(newMessages, c.id), updatedAt: new Date() }
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
  }, [messages, isStreaming, isGeneratingImage]);

  /* ---------------- actions ---------------- */

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
    setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, pinned: Boolean(pins[id]) } : c)));
  };

  const uploadFiles = async (files: File[]) => {
    for (const file of files) {
      if (file.size > 20 * 1024 * 1024) {
        sonnerToast.error(`${file.name}: 20MB dan katta`);
        continue;
      }
      const res = await uploadFile(file);
      if (res) {
        setAttachments((prev) => [...prev, { url: res.url, name: res.name, type: getFileType(res.type) }]);
      } else {
        sonnerToast.error(`${file.name} yuklanmadi`);
      }
    }
  };

  const handlePickFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    await uploadFiles(files);
  };

  /* ---------------- generation ---------------- */

  const runImageGeneration = async (prompt: string, baseMessages: AIMessage[]) => {
    setIsGeneratingImage(true);
    try {
      const { data, error } = await supabase.functions.invoke('ai-generate-image', { body: { prompt } });
      if (error) throw error;
      // The edge function returns { imageUrl, text }.
      const imageUrl: string | undefined = data?.imageUrl;
      if (!imageUrl) throw new Error("Rasm yaratilmadi. Tavsifni aniqroq yozib ko'ring.");

      const assistant: AIMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: data?.text || 'Mana, so\'rovingiz bo\'yicha yaratilgan rasm.',
        imageUrl,
        timestamp: new Date(),
      };
      const updated = [...baseMessages, assistant];
      setMessages(updated);
      await saveConversation(updated);
    } catch (err: any) {
      const failure: AIMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: err?.message || 'Rasm yaratishda xatolik yuz berdi.',
        error: true,
        timestamp: new Date(),
      };
      setMessages([...baseMessages, failure]);
    } finally {
      setIsGeneratingImage(false);
    }
  };

  const runChat = async (baseMessages: AIMessage[]) => {
    setIsStreaming(true);
    const controller = new AbortController();
    abortRef.current = controller;
    let assistantContent = '';

    try {
      let contextInfo = '';
      if (forwardedPost) {
        contextInfo = `\n\n[Foydalanuvchi quyidagi postni AI ga yubordi]\nPost muallifi: ${
          forwardedPost.authorName || "Noma'lum"
        }\nPost matni: ${forwardedPost.content || "(matn yo'q)"}\n${
          forwardedPost.mediaUrl ? `Media: ${forwardedPost.mediaUrl}` : ''
        }`;
      }

      const aiMessages = baseMessages.map((m) => ({ role: m.role, content: m.content }));
      if (contextInfo && aiMessages.length > 0) {
        aiMessages[0] = { ...aiMessages[0], content: aiMessages[0].content + contextInfo };
      }

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-assistant`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ messages: aiMessages, userId: user?.id }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || 'AI xizmati bilan xatolik');
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) throw new Error('Oqim mavjud emas');

      let textBuffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        textBuffer += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = textBuffer.indexOf('\n')) !== -1) {
          let line = textBuffer.slice(0, idx);
          textBuffer = textBuffer.slice(idx + 1);
          if (line.endsWith('\r')) line = line.slice(0, -1);
          if (line.startsWith(':') || line.trim() === '' || !line.startsWith('data: ')) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === '[DONE]') break;
          try {
            const parsed = JSON.parse(jsonStr);
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) {
              assistantContent += delta;
              setMessages((prev) => {
                const last = prev[prev.length - 1];
                if (last?.role === 'assistant' && !last.error) {
                  return prev.map((m, i) =>
                    i === prev.length - 1 ? { ...m, content: assistantContent } : m,
                  );
                }
                return [
                  ...prev,
                  {
                    id: crypto.randomUUID(),
                    role: 'assistant' as const,
                    content: assistantContent,
                    timestamp: new Date(),
                  },
                ];
              });
            }
          } catch {
            textBuffer = line + '\n' + textBuffer;
            break;
          }
        }
      }

      if (assistantContent) {
        await saveConversation([
          ...baseMessages,
          { id: crypto.randomUUID(), role: 'assistant', content: assistantContent, timestamp: new Date() },
        ]);
      }
      setForwardedPost(null);
    } catch (error: any) {
      if (error?.name === 'AbortError') return;
      setMessages([
        ...baseMessages,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: error?.message || "Javob olishda xatolik. Qaytadan urinib ko'ring.",
          error: true,
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
      timestamp: new Date(),
    };
    const base = [...messages, userMsg];
    setMessages(base);
    setInput('');
    setAttachments([]);

    // Unified entry point: infer whether this is an image request.
    const { intent, prompt } = detectIntent(raw);
    if (intent === 'image' && attachments.length === 0) {
      await runImageGeneration(prompt, base);
    } else {
      await runChat(base);
    }
  };

  const regenerateFrom = async (index: number) => {
    const lastUser = [...messages.slice(0, index)].reverse().find((m) => m.role === 'user');
    if (!lastUser) return;
    const base = messages.slice(0, index);
    setMessages(base);
    const { intent, prompt } = detectIntent(lastUser.content);
    if (intent === 'image') await runImageGeneration(prompt, base);
    else await runChat(base);
  };

  const stop = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsStreaming(false);
  };

  /* ---------------- home suggestions ---------------- */

  const suggestions = useMemo(
    () => [
      {
        icon: <ShoppingBag className="h-5 w-5" />,
        title: 'Bozordan tavsiya',
        desc: 'Eng yaxshi takliflarni toping',
        prompt: 'Bozorda arzon va sifatli mahsulotlarni topishga yordam ber',
      },
      {
        icon: <MapPin className="h-5 w-5" />,
        title: 'Marshrut rejalash',
        desc: "Xarita bo'yicha yordam",
        prompt: "Toshkentda bir kunlik sayohat marshrutini rejalashtir",
      },
      {
        icon: <Lightbulb className="h-5 w-5" />,
        title: 'Kontent g\'oyalari',
        desc: 'Postlar uchun g\'oyalar',
        prompt: 'Ijtimoiy tarmoq uchun 10 ta kontent g\'oyasi taklif qil',
      },
      {
        icon: <Code2 className="h-5 w-5" />,
        title: 'Kod yozish',
        desc: 'Dasturlashda yordam',
        prompt: 'React komponent yaratishda yordam ber',
      },
      {
        icon: <FileText className="h-5 w-5" />,
        title: 'Hisobot tayyorlash',
        desc: 'Biznes matnlari',
        prompt: 'Kichik biznes uchun oylik hisobot shabloni tayyorlab ber',
      },
      {
        icon: <Globe className="h-5 w-5" />,
        title: 'Tarjima',
        desc: "Ko'p tilli tarjima",
        prompt: 'Quyidagi matnni ingliz tiliga tarjima qil: ',
      },
    ],
    [],
  );

  const greetingName = profile?.display_name || profile?.username || '';

  const artifacts = useMemo(() => extractArtifacts(messages), [messages]);
  const showArtifacts = artifactsOpen && artifacts.length > 0;


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
                isMobile ? 'fixed bottom-0 left-0 top-0 w-[300px]' : 'relative w-[280px] lg:w-[300px]',
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

          <div className="flex items-center gap-1.5 rounded-full bg-muted/40 px-2.5 py-1 text-[10px] text-muted-foreground">
            <Zap className="h-3 w-3 text-alsamos-orange" />
            <span className="hidden sm:inline">Avto model</span>
          </div>
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
                Savol bering, rasm yarating, kod yozing yoki Alsamos modullari bo'yicha yordam so'rang — barchasi
                bitta oynada.
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
                    {forwardedPost.content && <p className="line-clamp-4 text-sm">{forwardedPost.content}</p>}
                  </div>
                </div>
              )}

              <div className="grid w-full max-w-2xl grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {suggestions.map((s, i) => (
                  <motion.button
                    key={s.title}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    onClick={() => setInput(s.prompt)}
                    className="group flex items-start gap-3 rounded-2xl border border-border/50 bg-card/50 p-3.5 text-left transition-all hover:border-alsamos-orange/30 hover:bg-card/80"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-alsamos-orange/10 text-alsamos-orange">
                      {s.icon}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[13px] font-semibold">{s.title}</span>
                      <span className="block truncate text-[11px] text-muted-foreground">{s.desc}</span>
                    </span>
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
                  isStreaming={isStreaming && idx === messages.length - 1 && msg.role === 'assistant'}
                  onRegenerate={msg.role === 'assistant' ? () => regenerateFrom(idx) : undefined}
                />
              ))}
              {isGeneratingImage && <AIThinkingBubble label="Rasm yaratilmoqda..." />}
              {isStreaming && messages[messages.length - 1]?.role === 'user' && (
                <AIThinkingBubble label="O'ylayapman..." />
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
          onPickFiles={handlePickFiles}
          onDropFiles={uploadFiles}
          onRemoveAttachment={(i) => setAttachments((prev) => prev.filter((_, idx) => idx !== i))}
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
    </div>

  );
}
