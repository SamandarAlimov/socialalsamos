import { useState, useRef, useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { 
  Send, 
  Loader2, 
  Sparkles, 
  Bot,
  User,
  MessageSquare,
  History,
  Plus,
  Paperclip,
  Mic,
  ArrowUp,
  Clock,
  Wand2,
  ChevronLeft,
  PanelLeftClose,
  PanelLeft,
  MoreHorizontal,
  Trash2,
  Search,
  Copy,
  Check,
  RotateCcw,
  Zap,
  Brain,
  Image as ImageIcon,
  Code2,
  FileText,
  Lightbulb,
  Globe
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { useIsMobile } from '@/hooks/use-mobile';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  imageUrl?: string;
  timestamp: Date;
}

interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  updatedAt: Date;
  type: 'chat' | 'imagine';
}

export default function AIPage() {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const location = useLocation();
  const navigate = useNavigate();
  const [activeMode, setActiveMode] = useState<'chat' | 'imagine'>('chat');
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(!isMobile);
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [forwardedPost, setForwardedPost] = useState<{ id: string; content?: string; authorName?: string; mediaUrl?: string } | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Handle forwarded post from navigation state
  useEffect(() => {
    const state = location.state as any;
    if (state?.forwardedPost) {
      const postData = state.forwardedPost;
      // Start new conversation for this post
      setMessages([]);
      setCurrentConversationId(null);
      
      // Fetch full post data
      supabase
        .from('posts')
        .select(`id, content, media_urls, media_type, likes_count, comments_count, views_count,
          profile:profiles!posts_user_id_fkey (display_name, username, avatar_url)`)
        .eq('id', postData.id)
        .single()
        .then(({ data }) => {
          if (data) {
            const profile = data.profile as any;
            setForwardedPost({
              id: data.id,
              content: data.content || '',
              authorName: profile?.display_name || profile?.username || 'Foydalanuvchi',
              mediaUrl: data.media_urls?.[0] || undefined,
            });
          } else {
            setForwardedPost({ id: postData.id, content: postData.content || '' });
          }
        });
      
      // Clear navigation state
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state]);

  useEffect(() => {
    setSidebarOpen(!isMobile);
  }, [isMobile]);

  // Load conversations
  useEffect(() => {
    const loadConversations = async () => {
      if (!user) return;
      const { data } = await supabase
        .from('ai_conversations')
        .select('*')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false });
      
      if (data) {
        const loaded: Conversation[] = data.map(conv => ({
          id: conv.id,
          title: getTitle(conv.messages as any[]),
          messages: (conv.messages as any[]).map((msg: any) => ({
            ...msg,
            timestamp: new Date(msg.timestamp)
          })),
          updatedAt: new Date(conv.updated_at),
          type: conv.context === 'imagine' ? 'imagine' : 'chat'
        }));
        setConversations(loaded);
        if (loaded.length > 0) {
          setCurrentConversationId(loaded[0].id);
          setMessages(loaded[0].messages);
        }
      }
    };
    loadConversations();
  }, [user]);

  const getTitle = (messages: any[]): string => {
    if (!messages?.length) return 'Yangi suhbat';
    const first = messages.find(m => m.role === 'user');
    return first ? first.content.slice(0, 50) + (first.content.length > 50 ? '...' : '') : 'Yangi suhbat';
  };

  const saveConversation = async (newMessages: Message[], context = 'chat') => {
    if (!user) return;
    if (currentConversationId) {
      await supabase.from('ai_conversations').update({ 
        messages: newMessages as any, updated_at: new Date().toISOString()
      }).eq('id', currentConversationId);
      setConversations(prev => prev.map(c => 
        c.id === currentConversationId 
          ? { ...c, messages: newMessages, title: getTitle(newMessages), updatedAt: new Date() } : c
      ));
    } else {
      const { data } = await supabase.from('ai_conversations').insert({
        user_id: user.id, messages: newMessages as any, context
      }).select().single();
      if (data) {
        setCurrentConversationId(data.id);
        setConversations(prev => [{
          id: data.id, title: getTitle(newMessages), messages: newMessages, updatedAt: new Date(), type: context === 'imagine' ? 'imagine' : 'chat'
        }, ...prev]);
      }
    }
  };

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 200) + 'px';
    }
  }, [input]);

  useEffect(() => {
    if (scrollAreaRef.current) {
      const el = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (el) el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  const startNew = () => {
    setMessages([]);
    setCurrentConversationId(null);
    setInput('');
    if (isMobile) setSidebarOpen(false);
  };

  const loadConv = (conv: Conversation) => {
    setMessages(conv.messages);
    setCurrentConversationId(conv.id);
    setActiveMode(conv.type);
    if (isMobile) setSidebarOpen(false);
  };

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;
    const userMsg: Message = { id: crypto.randomUUID(), role: 'user', content: input.trim(), timestamp: new Date() };
    const newMsgs = [...messages, userMsg];
    setMessages(newMsgs);
    setInput('');
    setIsLoading(true);
    
    try {
      // Build context from forwarded post
      let contextInfo = '';
      if (forwardedPost) {
        contextInfo = `\n\n[Foydalanuvchi quyidagi postni AI ga yubordi]\nPost muallifi: ${forwardedPost.authorName || 'Noma\'lum'}\nPost matni: ${forwardedPost.content || '(matn yo\'q)'}\n${forwardedPost.mediaUrl ? `Media: ${forwardedPost.mediaUrl}` : ''}`;
      }

      const aiMessages = newMsgs.map(m => ({ role: m.role, content: m.content }));
      if (contextInfo && aiMessages.length > 0) {
        // Inject context into the first user message
        aiMessages[0] = { ...aiMessages[0], content: aiMessages[0].content + contextInfo };
      }

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-assistant`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
        body: JSON.stringify({ messages: aiMessages, userId: user?.id }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || 'AI xizmati bilan xatolik');
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) throw new Error('Stream not available');

      let assistantContent = "";
      let textBuffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        textBuffer += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = textBuffer.indexOf("\n")) !== -1) {
          let line = textBuffer.slice(0, idx);
          textBuffer = textBuffer.slice(idx + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || line.trim() === "" || !line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") break;
          try {
            const parsed = JSON.parse(jsonStr);
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) {
              assistantContent += delta;
              setMessages(prev => {
                const last = prev[prev.length - 1];
                if (last?.role === "assistant") {
                  return prev.map((m, i) => i === prev.length - 1 ? { ...m, content: assistantContent } : m);
                }
                return [...prev, { id: crypto.randomUUID(), role: "assistant" as const, content: assistantContent, timestamp: new Date() }];
              });
            }
          } catch { textBuffer = line + "\n" + textBuffer; break; }
        }
      }

      await saveConversation([...newMsgs, { id: crypto.randomUUID(), role: 'assistant', content: assistantContent, timestamp: new Date() }], 'chat');
      setForwardedPost(null);
    } catch (error: any) {
      toast({ title: 'Xatolik', description: error.message, variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const generateImage = async () => {
    if (!input.trim() || isGeneratingImage) return;
    const userMsg: Message = { id: crypto.randomUUID(), role: 'user', content: input.trim(), timestamp: new Date() };
    const newMsgs = [...messages, userMsg];
    setMessages(newMsgs);
    setInput('');
    setIsGeneratingImage(true);
    try {
      const { data, error } = await supabase.functions.invoke('ai-generate-image', { body: { prompt: input.trim() } });
      if (error) throw error;
      const aMsg: Message = { id: crypto.randomUUID(), role: 'assistant', content: data.revised_prompt || 'Rasm yaratildi!', imageUrl: data.image_url, timestamp: new Date() };
      const updated = [...newMsgs, aMsg];
      setMessages(updated);
      await saveConversation(updated, 'imagine');
    } catch (error: any) {
      toast({ title: 'Xatolik', description: error.message, variant: 'destructive' });
    } finally {
      setIsGeneratingImage(false);
    }
  };

  const deleteConv = async (id: string) => {
    await supabase.from('ai_conversations').delete().eq('id', id);
    setConversations(prev => prev.filter(c => c.id !== id));
    if (currentConversationId === id) startNew();
  };

  const copyText = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      activeMode === 'imagine' ? generateImage() : sendMessage();
    }
  };

  const formatTime = (date: Date) => {
    const diff = Date.now() - date.getTime();
    const days = Math.floor(diff / 86400000);
    if (days === 0) return 'Bugun';
    if (days === 1) return 'Kecha';
    if (days < 7) return `${days} kun oldin`;
    return date.toLocaleDateString('uz-UZ');
  };

  const filtered = conversations.filter(c => c.title.toLowerCase().includes(searchQuery.toLowerCase()));

  const suggestions = [
    { icon: <Lightbulb className="h-5 w-5" />, title: "Fikr generatsiya", desc: "Yangi g'oyalar yarating", prompt: "Menga ijtimoiy tarmoq uchun yangi kontent g'oyalarini taklif qil" },
    { icon: <Code2 className="h-5 w-5" />, title: "Kod yozish", desc: "Dasturlashda yordam", prompt: "React komponent yaratishda yordam ber" },
    { icon: <FileText className="h-5 w-5" />, title: "Matn tahriri", desc: "Professional matnlar", prompt: "Professional bio yozishda yordam ber" },
    { icon: <Globe className="h-5 w-5" />, title: "Tarjima", desc: "Ko'p tilli tarjima", prompt: "Quyidagi matnni ingliz tiliga tarjima qil" },
  ];

  return (
    <div className="flex h-[calc(100vh-4rem)] md:h-[calc(100vh-2rem)] bg-background overflow-hidden">
      {/* Sidebar */}
      <AnimatePresence>
        {sidebarOpen && (
          <>
            {isMobile && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40" onClick={() => setSidebarOpen(false)} />
            )}
            <motion.div
              initial={{ x: isMobile ? -300 : 0, opacity: isMobile ? 0 : 1 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -300, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className={cn(
                "flex flex-col border-r border-border/50 z-50",
                "bg-card/80 backdrop-blur-xl",
                isMobile ? "fixed left-0 top-0 bottom-0 w-[300px]" : "relative w-[280px] lg:w-[300px]"
              )}
            >
              {/* Sidebar Header */}
              <div className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-alsamos-orange to-alsamos-orange-dark flex items-center justify-center shadow-lg shadow-alsamos-orange/20">
                      <Sparkles className="h-4.5 w-4.5 text-white" />
                    </div>
                    <div>
                      <span className="font-display font-bold text-sm">Alsamos AI</span>
                      <p className="text-[10px] text-muted-foreground leading-tight">Premium Assistant</p>
                    </div>
                  </div>
                  <Button size="icon" variant="ghost" className="h-8 w-8 rounded-lg" onClick={() => setSidebarOpen(false)}>
                    {isMobile ? <ChevronLeft className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
                  </Button>
                </div>
                
                <Button className="w-full gap-2 h-10 rounded-xl bg-gradient-to-r from-alsamos-orange to-alsamos-orange-dark hover:opacity-90 text-white shadow-lg shadow-alsamos-orange/20 border-0" onClick={startNew}>
                  <Plus className="h-4 w-4" />
                  Yangi suhbat
                </Button>
                
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Qidirish..." className="pl-9 h-9 text-xs rounded-xl bg-muted/50 border-border/50" />
                </div>
              </div>
              
              {/* Conversation List */}
              <ScrollArea className="flex-1 px-2">
                <div className="space-y-0.5 pb-4">
                  {filtered.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">
                      <History className="h-8 w-8 mx-auto mb-3 opacity-40" />
                      <p className="text-xs">{searchQuery ? 'Natija topilmadi' : 'Hali suhbatlar yo\'q'}</p>
                    </div>
                  ) : (
                    filtered.map(conv => (
                      <motion.div key={conv.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                        className={cn(
                          "group flex items-center gap-2.5 px-3 py-2.5 rounded-xl cursor-pointer transition-all duration-200",
                          "hover:bg-muted/60",
                          currentConversationId === conv.id && "bg-muted/80 shadow-sm"
                        )}
                        onClick={() => loadConv(conv)}
                      >
                        <div className={cn("h-8 w-8 rounded-lg flex items-center justify-center shrink-0",
                          conv.type === 'imagine' ? "bg-primary/10" : "bg-primary/10"
                        )}>
                          {conv.type === 'imagine' ? <Wand2 className="h-3.5 w-3.5 text-primary" /> : <MessageSquare className="h-3.5 w-3.5 text-primary" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate">{conv.title}</p>
                          <p className="text-[10px] text-muted-foreground">{formatTime(conv.updatedAt)}</p>
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="icon" variant="ghost" className="h-6 w-6 opacity-0 group-hover:opacity-100 shrink-0 rounded-md"
                              onClick={(e) => e.stopPropagation()}>
                              <MoreHorizontal className="h-3.5 w-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="min-w-[140px]">
                            <DropdownMenuItem className="text-destructive text-xs" onClick={(e) => { e.stopPropagation(); deleteConv(conv.id); }}>
                              <Trash2 className="h-3.5 w-3.5 mr-2" /> O'chirish
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </motion.div>
                    ))
                  )}
                </div>
              </ScrollArea>

              {/* Sidebar Footer */}
              <div className="p-3 border-t border-border/30">
                <div className="flex items-center gap-2.5 px-2">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={profile?.avatar_url || ''} />
                    <AvatarFallback className="bg-muted text-xs"><User className="h-3.5 w-3.5" /></AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{profile?.display_name || 'Foydalanuvchi'}</p>
                    <p className="text-[10px] text-muted-foreground truncate">Premium</p>
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 relative">
        {/* Top Bar */}
        <div className="h-12 sm:h-14 flex items-center gap-2 px-3 sm:px-4 border-b border-border/30 bg-background/80 backdrop-blur-xl shrink-0">
          {!sidebarOpen && (
            <Button size="icon" variant="ghost" className="h-8 w-8 rounded-lg shrink-0" onClick={() => setSidebarOpen(true)}>
              <PanelLeft className="h-4 w-4" />
            </Button>
          )}
          
          {/* Mode Toggle */}
          <div className="flex items-center gap-1 bg-muted/50 rounded-xl p-1">
            <button onClick={() => setActiveMode('chat')}
              className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
                activeMode === 'chat' ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
              )}>
              <Brain className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Chat</span>
            </button>
            <button onClick={() => setActiveMode('imagine')}
              className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
                activeMode === 'imagine' ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
              )}>
              <ImageIcon className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Imagine</span>
            </button>
          </div>

          <div className="flex-1" />
          
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground bg-muted/30 px-2.5 py-1 rounded-full">
            <Zap className="h-3 w-3 text-alsamos-orange" />
            <span className="hidden sm:inline">Gemini 3 Flash</span>
          </div>
        </div>

        {/* Messages Area */}
        <ScrollArea ref={scrollAreaRef} className="flex-1">
          <AnimatePresence mode="wait">
            {messages.length === 0 ? (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className="flex flex-col items-center justify-center min-h-[calc(100vh-14rem)] px-4">
                {/* Hero */}
                <motion.div initial={{ scale: 0.8 }} animate={{ scale: 1 }} transition={{ type: 'spring', damping: 15 }}
                  className="relative mb-6">
                  <div className="h-20 w-20 sm:h-24 sm:w-24 rounded-3xl bg-gradient-to-br from-alsamos-orange via-alsamos-orange-dark to-primary/80 flex items-center justify-center shadow-2xl shadow-alsamos-orange/30">
                    {activeMode === 'imagine' ? <Wand2 className="h-10 w-10 sm:h-12 sm:w-12 text-white" /> : <Sparkles className="h-10 w-10 sm:h-12 sm:w-12 text-white" />}
                  </div>
                  <div className="absolute -bottom-1 -right-1 h-6 w-6 rounded-full bg-green-500 border-2 border-background flex items-center justify-center">
                    <Check className="h-3 w-3 text-white" />
                  </div>
                </motion.div>
                
                <h1 className="text-2xl sm:text-3xl font-display font-bold mb-2 text-center">
                  {activeMode === 'imagine' ? 'Imagine Studio' : 'Alsamos AI'}
                </h1>
                <p className="text-sm text-muted-foreground max-w-md text-center mb-8">
                  {activeMode === 'imagine' 
                    ? 'Xayolingizni rasmga aylantiring. Tavsif yozing va AI sizning g\'oyangizni vizualizatsiya qilsin.'
                    : 'Professional AI yordamchi. Savol bering, matn yozing, tahlil qiling yoki har qanday vazifada yordam so\'rang.'}
                </p>
                
                {/* Forwarded Post Preview */}
                {forwardedPost && activeMode === 'chat' && (
                  <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                    className="w-full max-w-2xl mb-6">
                    <div className="rounded-2xl border border-alsamos-orange/30 bg-card/60 backdrop-blur-sm overflow-hidden shadow-lg shadow-alsamos-orange/5">
                      <div className="flex items-center gap-2 px-4 py-2.5 bg-alsamos-orange/10 border-b border-alsamos-orange/20">
                        <Sparkles className="h-4 w-4 text-alsamos-orange" />
                        <span className="text-xs font-semibold text-alsamos-orange">Post yuborildi</span>
                        <button onClick={() => setForwardedPost(null)} className="ml-auto text-muted-foreground hover:text-foreground text-xs">✕</button>
                      </div>
                      <div className="p-4">
                        {forwardedPost.mediaUrl && (
                          <img src={forwardedPost.mediaUrl} alt="" className="w-full max-h-48 object-cover rounded-xl mb-3" />
                        )}
                        <p className="text-xs text-muted-foreground mb-1">@{forwardedPost.authorName}</p>
                        {forwardedPost.content && (
                          <p className="text-sm line-clamp-4">{forwardedPost.content}</p>
                        )}
                      </div>
                    </div>

                    {/* Post-specific AI suggestions */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-4">
                      {[
                        { icon: <Lightbulb className="h-4 w-4" />, title: "Shunga o'xshash yoz", prompt: "Shu postga o'xshash kontent yozib ber, lekin yangicha uslubda" },
                        { icon: <Brain className="h-4 w-4" />, title: "Tahlil qil", prompt: "Bu post haqida chuqur tahlil ber: nima yaxshi, nima yaxshilash mumkin" },
                        { icon: <FileText className="h-4 w-4" />, title: "Javob yoz", prompt: "Bu postga professional va qiziqarli javob yozib ber" },
                        { icon: <Globe className="h-4 w-4" />, title: "Tarjima qil", prompt: "Bu post matnini ingliz tiliga professional tarjima qil" },
                      ].map((s, i) => (
                        <motion.button key={i}
                          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 + i * 0.05 }}
                          onClick={() => setInput(s.prompt)}
                          className="flex items-center gap-2.5 p-3 rounded-xl bg-card/50 border border-border/50 hover:border-alsamos-orange/30 hover:bg-card/80 transition-all text-left group">
                          <span className="text-alsamos-orange">{s.icon}</span>
                          <span className="text-xs font-medium">{s.title}</span>
                        </motion.button>
                      ))}
                    </div>
                  </motion.div>
                )}

                {/* Suggestion Cards */}
                {activeMode === 'chat' && !forwardedPost && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-2xl">
                    {suggestions.map((s, i) => (
                      <motion.button key={i}
                        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}
                        onClick={() => setInput(s.prompt)}
                        className={cn(
                          "flex items-start gap-3 p-4 rounded-2xl text-left transition-all duration-200",
                          "bg-card/50 border border-border/50 hover:border-alsamos-orange/30 hover:bg-card/80",
                          "hover:shadow-lg hover:shadow-alsamos-orange/5 group"
                        )}>
                        <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-alsamos-orange/10 to-alsamos-orange-dark/10 flex items-center justify-center shrink-0 group-hover:from-alsamos-orange/20 group-hover:to-alsamos-orange-dark/20 transition-colors">
                          <span className="text-alsamos-orange">{s.icon}</span>
                        </div>
                        <div>
                          <p className="text-sm font-semibold mb-0.5">{s.title}</p>
                          <p className="text-xs text-muted-foreground">{s.desc}</p>
                        </div>
                      </motion.button>
                    ))}
                  </div>
                )}

                {activeMode === 'imagine' && (
                  <div className="flex flex-wrap gap-2 justify-center">
                    {['🎨 Fantastik manzara', '👤 Professional portret', '🏛️ Zamonaviy arxitektura', '🌌 Kosmik landshaft'].map((p, i) => (
                      <motion.button key={i} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.05 }}
                        onClick={() => setInput(p.slice(2).trim())}
                        className="px-4 py-2.5 rounded-xl bg-card/50 border border-border/50 text-xs font-medium hover:border-pink-500/30 hover:bg-card/80 transition-all">
                        {p}
                      </motion.button>
                    ))}
                  </div>
                )}
              </motion.div>
            ) : (
              <div className="max-w-3xl mx-auto py-4 sm:py-6 px-3 sm:px-4 space-y-1">
                {messages.map((msg, idx) => (
                  <motion.div key={msg.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.02 }}>
                    {msg.role === 'user' ? (
                      /* User Message */
                      <div className="flex justify-end mb-4">
                        <div className="flex items-end gap-2 max-w-[85%]">
                          <div className="bg-primary text-primary-foreground rounded-2xl rounded-br-md px-4 py-3 shadow-sm">
                            <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                          </div>
                        </div>
                      </div>
                    ) : (
                      /* Assistant Message */
                      <div className="mb-6 group">
                        <div className="flex items-start gap-3">
                          <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-alsamos-orange to-alsamos-orange-dark flex items-center justify-center shrink-0 shadow-md shadow-alsamos-orange/20 mt-0.5">
                            {activeMode === 'imagine' ? <Wand2 className="h-4 w-4 text-white" /> : <Bot className="h-4 w-4 text-white" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="prose prose-sm dark:prose-invert max-w-none
                              prose-p:leading-relaxed prose-p:mb-3
                              prose-headings:font-display prose-headings:font-bold
                              prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded-md prose-code:text-xs prose-code:font-mono
                              prose-pre:bg-muted prose-pre:border prose-pre:border-border/50 prose-pre:rounded-xl prose-pre:shadow-sm
                              prose-a:text-alsamos-orange prose-a:no-underline hover:prose-a:underline
                              prose-li:marker:text-alsamos-orange
                              prose-strong:text-foreground
                              prose-blockquote:border-l-alsamos-orange/50 prose-blockquote:bg-muted/30 prose-blockquote:rounded-r-lg prose-blockquote:py-1 prose-blockquote:px-4
                              prose-table:border prose-table:border-border prose-th:bg-muted/50 prose-td:border prose-td:border-border prose-th:border prose-th:border-border prose-th:px-3 prose-th:py-2 prose-td:px-3 prose-td:py-2
                            ">
                              <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                            </div>
                            {msg.imageUrl && (
                              <img src={msg.imageUrl} alt="Generated" className="mt-3 rounded-2xl max-w-full shadow-lg border border-border/30" />
                            )}
                            {/* Actions */}
                            <div className="flex items-center gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                              <Button size="icon" variant="ghost" className="h-7 w-7 rounded-lg" onClick={() => copyText(msg.content, msg.id)}>
                                {copiedId === msg.id ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                              </Button>
                              <Button size="icon" variant="ghost" className="h-7 w-7 rounded-lg" onClick={() => { setInput(messages.find(m => m.id === messages[idx - 1]?.id)?.content || ''); }}>
                                <RotateCcw className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </motion.div>
                ))}
                
                {/* Loading indicator */}
                {(isLoading || isGeneratingImage) && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-start gap-3 mb-6">
                    <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-alsamos-orange to-alsamos-orange-dark flex items-center justify-center shrink-0 shadow-md shadow-alsamos-orange/20">
                      <Bot className="h-4 w-4 text-white" />
                    </div>
                    <div className="bg-card/50 border border-border/30 rounded-2xl px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex gap-1">
                          <span className="w-2 h-2 bg-alsamos-orange rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                          <span className="w-2 h-2 bg-alsamos-orange rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                          <span className="w-2 h-2 bg-alsamos-orange rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {isGeneratingImage ? 'Rasm yaratilmoqda...' : 'O\'ylayapman...'}
                        </span>
                      </div>
                    </div>
                  </motion.div>
                )}
              </div>
            )}
          </AnimatePresence>
        </ScrollArea>

        {/* Input Area */}
        <div className="p-3 sm:p-4 bg-background/80 backdrop-blur-xl border-t border-border/20">
          <div className="max-w-3xl mx-auto">
            <div className={cn(
              "relative rounded-2xl transition-all duration-300",
              "bg-card/80 border shadow-lg",
              activeMode === 'imagine'
                ? "border-pink-500/20 focus-within:border-pink-500/50 focus-within:shadow-pink-500/10"
                : "border-border/50 focus-within:border-alsamos-orange/50 focus-within:shadow-alsamos-orange/10"
            )}>
              <Textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={activeMode === 'imagine' ? "Qanday rasm yaratmoqchisiz..." : "Xabar yozing..."}
                className="min-h-[48px] max-h-[200px] resize-none border-0 bg-transparent focus-visible:ring-0 pr-28 sm:pr-36 py-3.5 px-4 text-sm placeholder:text-muted-foreground/60"
                disabled={isLoading || isGeneratingImage}
                rows={1}
              />
              <div className="absolute right-2 bottom-2 flex items-center gap-1">
                {!isMobile && (
                  <>
                    <Button size="icon" variant="ghost" className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground" disabled>
                      <Paperclip className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground" disabled>
                      <Mic className="h-4 w-4" />
                    </Button>
                  </>
                )}
                <Button size="icon"
                  className={cn("h-8 w-8 rounded-xl transition-all duration-200",
                    input.trim() 
                      ? activeMode === 'imagine'
                        ? "bg-gradient-to-r from-pink-500 to-orange-500 text-white hover:opacity-90 shadow-md"
                        : "bg-gradient-to-r from-alsamos-orange to-alsamos-orange-dark text-white hover:opacity-90 shadow-md shadow-alsamos-orange/20"
                      : "bg-muted text-muted-foreground"
                  )}
                  onClick={activeMode === 'imagine' ? generateImage : sendMessage}
                  disabled={!input.trim() || isLoading || isGeneratingImage}
                >
                  {isLoading || isGeneratingImage ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <p className="text-[10px] text-center text-muted-foreground/60 mt-2">
              Alsamos AI xato qilishi mumkin. Muhim ma'lumotlarni tekshiring.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
