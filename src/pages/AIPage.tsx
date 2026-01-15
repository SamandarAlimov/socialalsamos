import { useState, useRef, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { 
  Send, 
  Loader2, 
  Sparkles, 
  Bot,
  User,
  MessageSquare,
  FolderKanban,
  Users,
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
  Search
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { useIsMobile } from '@/hooks/use-mobile';
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

interface Project {
  id: string;
  name: string;
  description: string;
  conversationCount: number;
  createdAt: Date;
}

interface Group {
  id: string;
  name: string;
  members: number;
  avatar?: string;
}

export default function AIPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const [activeTab, setActiveTab] = useState('chat');
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(!isMobile);
  const [searchQuery, setSearchQuery] = useState('');
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Mock data for projects and groups
  const [projects] = useState<Project[]>([
    { id: '1', name: 'Ijtimoiy Media Bot', description: 'Postlar yaratish va tahlil qilish', conversationCount: 12, createdAt: new Date() },
    { id: '2', name: 'Rasm generatori', description: 'AI bilan rasm yaratish loyihasi', conversationCount: 8, createdAt: new Date() },
  ]);

  const [groups] = useState<Group[]>([
    { id: '1', name: 'Developers UZ', members: 156 },
    { id: '2', name: 'AI Enthusiasts', members: 89 },
  ]);

  // Update sidebar state when mobile changes
  useEffect(() => {
    setSidebarOpen(!isMobile);
  }, [isMobile]);

  // Load conversations from database
  useEffect(() => {
    const loadConversations = async () => {
      if (!user) return;
      
      const { data } = await supabase
        .from('ai_conversations')
        .select('*')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false });
      
      if (data) {
        const loadedConversations: Conversation[] = data.map(conv => ({
          id: conv.id,
          title: getConversationTitle(conv.messages as any[]),
          messages: (conv.messages as any[]).map((msg: any) => ({
            ...msg,
            timestamp: new Date(msg.timestamp)
          })),
          updatedAt: new Date(conv.updated_at),
          type: conv.context === 'imagine' ? 'imagine' : 'chat'
        }));
        setConversations(loadedConversations);
        
        // Load most recent conversation
        if (loadedConversations.length > 0) {
          setCurrentConversationId(loadedConversations[0].id);
          setMessages(loadedConversations[0].messages);
        }
      }
    };
    
    loadConversations();
  }, [user]);

  const getConversationTitle = (messages: any[]): string => {
    if (!messages || messages.length === 0) return 'Yangi suhbat';
    const firstUserMessage = messages.find(m => m.role === 'user');
    if (firstUserMessage) {
      return firstUserMessage.content.slice(0, 40) + (firstUserMessage.content.length > 40 ? '...' : '');
    }
    return 'Yangi suhbat';
  };

  // Save conversation to database
  const saveConversation = async (newMessages: Message[], context: string = 'chat') => {
    if (!user) return;
    
    if (currentConversationId) {
      await supabase
        .from('ai_conversations')
        .update({ 
          messages: newMessages as any,
          updated_at: new Date().toISOString()
        })
        .eq('id', currentConversationId);
      
      // Update local state
      setConversations(prev => prev.map(c => 
        c.id === currentConversationId 
          ? { ...c, messages: newMessages, title: getConversationTitle(newMessages), updatedAt: new Date() }
          : c
      ));
    } else {
      const { data } = await supabase
        .from('ai_conversations')
        .insert({
          user_id: user.id,
          messages: newMessages as any,
          context
        })
        .select()
        .single();
      
      if (data) {
        setCurrentConversationId(data.id);
        const newConv: Conversation = {
          id: data.id,
          title: getConversationTitle(newMessages),
          messages: newMessages,
          updatedAt: new Date(),
          type: context === 'imagine' ? 'imagine' : 'chat'
        };
        setConversations(prev => [newConv, ...prev]);
      }
    }
  };

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 200) + 'px';
    }
  }, [input]);

  // Scroll to bottom on new messages
  useEffect(() => {
    if (scrollAreaRef.current) {
      const scrollContainer = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    }
  }, [messages]);

  const startNewConversation = () => {
    setMessages([]);
    setCurrentConversationId(null);
    setInput('');
    if (isMobile) setSidebarOpen(false);
  };

  const loadConversation = (conv: Conversation) => {
    setMessages(conv.messages);
    setCurrentConversationId(conv.id);
    setActiveTab(conv.type);
    if (isMobile) setSidebarOpen(false);
  };

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;
    
    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date()
    };
    
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput('');
    setIsLoading(true);
    
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-assistant`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({
            messages: newMessages.map(m => ({ role: m.role, content: m.content })),
            userId: user?.id,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'AI xizmati bilan xatolik');
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

        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);

          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || line.trim() === "") continue;
          if (!line.startsWith("data: ")) continue;

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
                  return prev.map((m, i) => 
                    i === prev.length - 1 ? { ...m, content: assistantContent } : m
                  );
                }
                return [...prev, { 
                  id: crypto.randomUUID(),
                  role: "assistant" as const, 
                  content: assistantContent,
                  timestamp: new Date()
                }];
              });
            }
          } catch {
            textBuffer = line + "\n" + textBuffer;
            break;
          }
        }
      }

      // Save after streaming complete
      const finalMessages = [...newMessages, {
        id: crypto.randomUUID(),
        role: 'assistant' as const,
        content: assistantContent,
        timestamp: new Date()
      }];
      await saveConversation(finalMessages, 'chat');
      
    } catch (error: any) {
      console.error('AI error:', error);
      toast({
        title: 'Xatolik',
        description: error.message || 'AI bilan bog\'lanishda xatolik',
        variant: 'destructive'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const generateImage = async () => {
    if (!input.trim() || isGeneratingImage) return;
    
    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date()
    };
    
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput('');
    setIsGeneratingImage(true);
    
    try {
      const { data, error } = await supabase.functions.invoke('ai-generate-image', {
        body: { prompt: input.trim() }
      });
      
      if (error) throw error;
      
      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: data.revised_prompt || 'Rasm yaratildi!',
        imageUrl: data.image_url,
        timestamp: new Date()
      };
      
      const updatedMessages = [...newMessages, assistantMessage];
      setMessages(updatedMessages);
      await saveConversation(updatedMessages, 'imagine');
    } catch (error: any) {
      console.error('Image generation error:', error);
      toast({
        title: 'Xatolik',
        description: error.message || 'Rasm yaratishda xatolik',
        variant: 'destructive'
      });
    } finally {
      setIsGeneratingImage(false);
    }
  };

  const deleteConversation = async (convId: string) => {
    await supabase
      .from('ai_conversations')
      .delete()
      .eq('id', convId);
    
    setConversations(prev => prev.filter(c => c.id !== convId));
    
    if (currentConversationId === convId) {
      startNewConversation();
    }
    
    toast({
      title: 'O\'chirildi',
      description: 'Suhbat o\'chirildi'
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (activeTab === 'imagine') {
        generateImage();
      } else {
        sendMessage();
      }
    }
  };

  const formatTime = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days === 0) return 'Bugun';
    if (days === 1) return 'Kecha';
    if (days < 7) return `${days} kun oldin`;
    return date.toLocaleDateString('uz-UZ');
  };

  const filteredConversations = conversations.filter(conv =>
    conv.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const quickPrompts = activeTab === 'imagine' 
    ? [
        { icon: '🎨', text: 'Fantastik manzara' },
        { icon: '👤', text: 'Professional portret' },
        { icon: '🏛️', text: 'Zamonaviy arxitektura' },
        { icon: '🌌', text: 'Kosmik landshaft' },
      ]
    : [
        { icon: '💡', text: 'Fikr generatsiya qil' },
        { icon: '📝', text: 'Matn yoz' },
        { icon: '🔍', text: 'Tahlil qil' },
        { icon: '🎯', text: 'Maslahat ber' },
      ];

  // Render chat/imagine content
  const renderChatContent = (isImagine = false) => (
    <>
      <ScrollArea ref={scrollAreaRef} className="flex-1 p-4">
        <AnimatePresence mode="wait">
          {messages.length === 0 ? (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4"
            >
              <div className={cn(
                "h-16 w-16 sm:h-20 sm:w-20 rounded-2xl flex items-center justify-center mb-4 sm:mb-6 shadow-lg",
                isImagine 
                  ? "bg-gradient-to-br from-pink-500 to-orange-500 shadow-pink-500/20"
                  : "bg-gradient-to-br from-violet-500 to-purple-600 shadow-violet-500/20"
              )}>
                {isImagine ? (
                  <Wand2 className="h-8 w-8 sm:h-10 sm:w-10 text-white" />
                ) : (
                  <Sparkles className="h-8 w-8 sm:h-10 sm:w-10 text-white" />
                )}
              </div>
              <h2 className="text-xl sm:text-2xl font-bold mb-2">
                {isImagine ? 'Imagine - Rasm Yaratish' : 'Salom! Men AI yordamchingizman'}
              </h2>
              <p className="text-sm sm:text-base text-muted-foreground max-w-md mb-6 sm:mb-8">
                {isImagine 
                  ? 'Tavsif yozing va AI sizning xayolingizni rasmga aylantirsin.'
                  : 'Savol bering, matn yozing, kod generatsiya qiling yoki har qanday vazifada yordam so\'rang.'}
              </p>
              <div className="grid grid-cols-2 gap-2 sm:gap-3 w-full max-w-md sm:max-w-2xl">
                {quickPrompts.map((prompt, i) => (
                  <Button 
                    key={i}
                    variant="outline" 
                    className="h-auto py-3 sm:py-4 flex-col gap-1 sm:gap-2 hover:bg-muted/80 text-xs sm:text-sm"
                    onClick={() => setInput(prompt.text)}
                  >
                    <span className="text-xl sm:text-2xl">{prompt.icon}</span>
                    <span>{prompt.text}</span>
                  </Button>
                ))}
              </div>
            </motion.div>
          ) : (
            <div className="space-y-4 sm:space-y-6 max-w-3xl mx-auto pb-4">
              {messages.map((message, idx) => (
                <motion.div
                  key={message.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.03 }}
                  className={cn(
                    "flex gap-2 sm:gap-4",
                    message.role === 'user' ? 'flex-row-reverse' : 'flex-row'
                  )}
                >
                  <Avatar className="h-7 w-7 sm:h-8 sm:w-8 shrink-0 ring-2 ring-background shadow">
                    {message.role === 'user' ? (
                      <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                        <User className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                      </AvatarFallback>
                    ) : (
                      <AvatarFallback className={cn(
                        "text-white text-xs",
                        isImagine 
                          ? "bg-gradient-to-br from-pink-500 to-orange-500"
                          : "bg-gradient-to-br from-violet-500 to-purple-600"
                      )}>
                        {isImagine ? <Wand2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> : <Bot className="h-3.5 w-3.5 sm:h-4 sm:w-4" />}
                      </AvatarFallback>
                    )}
                  </Avatar>
                  <div
                    className={cn(
                      "rounded-2xl px-3 py-2 sm:px-4 sm:py-3 max-w-[85%] shadow-sm",
                      message.role === 'user'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted'
                    )}
                  >
                    <p className="text-xs sm:text-sm whitespace-pre-wrap leading-relaxed">{message.content}</p>
                    {message.imageUrl && (
                      <img 
                        src={message.imageUrl} 
                        alt="Generated" 
                        className="mt-2 sm:mt-3 rounded-xl max-w-full shadow-md"
                      />
                    )}
                  </div>
                </motion.div>
              ))}
              {(isLoading || isGeneratingImage) && (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex gap-2 sm:gap-4"
                >
                  <Avatar className="h-7 w-7 sm:h-8 sm:w-8 shrink-0">
                    <AvatarFallback className={cn(
                      "text-white text-xs",
                      isImagine 
                        ? "bg-gradient-to-br from-pink-500 to-orange-500"
                        : "bg-gradient-to-br from-violet-500 to-purple-600"
                    )}>
                      {isImagine ? <Wand2 className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
                    </AvatarFallback>
                  </Avatar>
                  <div className="bg-muted rounded-2xl px-3 py-2 sm:px-4 sm:py-3">
                    <div className="flex items-center gap-2">
                      <div className="flex gap-1">
                        <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-violet-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-violet-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-violet-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                      <span className="text-xs sm:text-sm text-muted-foreground ml-1 sm:ml-2">
                        {isGeneratingImage ? 'Rasm yaratilmoqda...' : 'Yozmoqda...'}
                      </span>
                    </div>
                  </div>
                </motion.div>
              )}
            </div>
          )}
        </AnimatePresence>
      </ScrollArea>

      {/* Input Section */}
      <div className="p-3 sm:p-4 border-t border-border bg-background/95 backdrop-blur">
        <div className="max-w-3xl mx-auto">
          <div className={cn(
            "relative bg-muted/50 rounded-xl sm:rounded-2xl border border-border transition-all",
            isImagine 
              ? "focus-within:border-pink-500/50 focus-within:ring-2 focus-within:ring-pink-500/20"
              : "focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/20"
          )}>
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={isImagine ? "Qanday rasm yaratmoqchisiz..." : "Xabar yozing..."}
              className="min-h-[44px] sm:min-h-[52px] max-h-[150px] sm:max-h-[200px] resize-none border-0 bg-transparent focus-visible:ring-0 pr-24 sm:pr-32 py-3 sm:py-4 px-3 sm:px-4 text-sm"
              disabled={isLoading || isGeneratingImage}
              rows={1}
            />
            <div className="absolute right-2 bottom-1.5 sm:bottom-2 flex items-center gap-0.5 sm:gap-1">
              {!isMobile && (
                <>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 sm:h-8 sm:w-8 text-muted-foreground hover:text-foreground"
                    disabled
                  >
                    <Paperclip className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 sm:h-8 sm:w-8 text-muted-foreground hover:text-foreground"
                    disabled
                  >
                    <Mic className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                  </Button>
                </>
              )}
              <Button
                size="icon"
                className={cn(
                  "h-7 w-7 sm:h-8 sm:w-8 rounded-lg transition-all",
                  input.trim() 
                    ? isImagine
                      ? "bg-gradient-to-r from-pink-500 to-orange-500 text-white hover:opacity-90"
                      : "bg-primary text-primary-foreground hover:bg-primary/90" 
                    : "bg-muted text-muted-foreground"
                )}
                onClick={isImagine ? generateImage : sendMessage}
                disabled={!input.trim() || isLoading || isGeneratingImage}
              >
                {isLoading || isGeneratingImage ? (
                  <Loader2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 animate-spin" />
                ) : isImagine ? (
                  <Wand2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                ) : (
                  <ArrowUp className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                )}
              </Button>
            </div>
          </div>
          <p className="text-[10px] sm:text-xs text-center text-muted-foreground mt-1.5 sm:mt-2">
            AI xato qilishi mumkin. Muhim ma'lumotlarni tekshiring.
          </p>
        </div>
      </div>
    </>
  );

  return (
    <div className="flex h-[calc(100vh-4rem)] md:h-[calc(100vh-2rem)] bg-background overflow-hidden">
      {/* Sidebar - History */}
      <AnimatePresence>
        {sidebarOpen && (
          <>
            {/* Mobile overlay */}
            {isMobile && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/50 z-40 md:hidden"
                onClick={() => setSidebarOpen(false)}
              />
            )}
            
            <motion.div
              initial={{ x: isMobile ? -280 : 0, opacity: isMobile ? 0 : 1 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -280, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className={cn(
                "flex flex-col bg-background border-r border-border z-50",
                isMobile 
                  ? "fixed left-0 top-0 bottom-0 w-[280px]" 
                  : "relative w-64 lg:w-72"
              )}
            >
              {/* Sidebar Header */}
              <div className="p-3 sm:p-4 border-b border-border space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
                      <Sparkles className="h-4 w-4 text-white" />
                    </div>
                    <span className="font-semibold">AI Assistant</span>
                  </div>
                  <Button 
                    size="icon" 
                    variant="ghost" 
                    className="h-8 w-8"
                    onClick={() => setSidebarOpen(false)}
                  >
                    {isMobile ? <ChevronLeft className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
                  </Button>
                </div>
                
                <Button 
                  className="w-full gap-2 h-9 sm:h-10" 
                  onClick={startNewConversation}
                >
                  <Plus className="h-4 w-4" />
                  Yangi suhbat
                </Button>
                
                {/* Search */}
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Suhbatlarni qidirish..."
                    className="pl-9 h-9 text-sm"
                  />
                </div>
              </div>
              
              {/* Conversations List */}
              <ScrollArea className="flex-1">
                <div className="p-2 space-y-1">
                  {filteredConversations.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <History className="h-10 w-10 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">
                        {searchQuery ? 'Natija topilmadi' : 'Hali suhbatlar yo\'q'}
                      </p>
                    </div>
                  ) : (
                    filteredConversations.map(conv => (
                      <motion.div
                        key={conv.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        className={cn(
                          "group flex items-center gap-2 p-2.5 sm:p-3 rounded-lg cursor-pointer hover:bg-muted/80 transition-colors",
                          currentConversationId === conv.id && "bg-muted"
                        )}
                        onClick={() => loadConversation(conv)}
                      >
                        <div className={cn(
                          "h-8 w-8 rounded-lg flex items-center justify-center shrink-0",
                          conv.type === 'imagine' 
                            ? "bg-gradient-to-br from-pink-500/20 to-orange-500/20" 
                            : "bg-gradient-to-br from-violet-500/20 to-purple-500/20"
                        )}>
                          {conv.type === 'imagine' ? (
                            <Wand2 className="h-4 w-4 text-pink-500" />
                          ) : (
                            <MessageSquare className="h-4 w-4 text-violet-500" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{conv.title}</p>
                          <p className="text-xs text-muted-foreground flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatTime(conv.updatedAt)}
                          </p>
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem 
                              className="text-destructive"
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteConversation(conv.id);
                              }}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              O'chirish
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </motion.div>
                    ))
                  )}
                </div>
              </ScrollArea>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Tabs Header */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
          <div className="border-b border-border px-2 sm:px-4 flex items-center gap-2">
            {/* Toggle sidebar button */}
            {!sidebarOpen && (
              <Button 
                size="icon" 
                variant="ghost" 
                className="h-8 w-8 shrink-0"
                onClick={() => setSidebarOpen(true)}
              >
                <PanelLeft className="h-4 w-4" />
              </Button>
            )}
            
            <TabsList className="h-12 sm:h-14 bg-transparent p-0 gap-1 sm:gap-2 flex-1 justify-start">
              <TabsTrigger 
                value="chat" 
                className="gap-1.5 sm:gap-2 data-[state=active]:bg-muted rounded-lg px-2.5 sm:px-4 text-xs sm:text-sm"
              >
                <MessageSquare className="h-4 w-4" />
                <span className="hidden xs:inline">Chat</span>
              </TabsTrigger>
              <TabsTrigger 
                value="imagine" 
                className="gap-1.5 sm:gap-2 data-[state=active]:bg-muted rounded-lg px-2.5 sm:px-4 text-xs sm:text-sm"
              >
                <Wand2 className="h-4 w-4" />
                <span className="hidden xs:inline">Imagine</span>
              </TabsTrigger>
              <TabsTrigger 
                value="projects" 
                className="gap-1.5 sm:gap-2 data-[state=active]:bg-muted rounded-lg px-2.5 sm:px-4 text-xs sm:text-sm"
              >
                <FolderKanban className="h-4 w-4" />
                <span className="hidden sm:inline">Loyihalar</span>
              </TabsTrigger>
              <TabsTrigger 
                value="groups" 
                className="gap-1.5 sm:gap-2 data-[state=active]:bg-muted rounded-lg px-2.5 sm:px-4 text-xs sm:text-sm"
              >
                <Users className="h-4 w-4" />
                <span className="hidden sm:inline">Guruhlar</span>
              </TabsTrigger>
            </TabsList>
          </div>

          {/* Chat Tab */}
          <TabsContent value="chat" className="flex-1 flex flex-col m-0 data-[state=inactive]:hidden">
            {renderChatContent(false)}
          </TabsContent>

          {/* Imagine Tab */}
          <TabsContent value="imagine" className="flex-1 flex flex-col m-0 data-[state=inactive]:hidden">
            {renderChatContent(true)}
          </TabsContent>

          {/* Projects Tab */}
          <TabsContent value="projects" className="flex-1 m-0 p-3 sm:p-4 overflow-auto data-[state=inactive]:hidden">
            <div className="max-w-4xl mx-auto">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 sm:mb-6">
                <div>
                  <h2 className="text-lg sm:text-xl font-bold">Loyihalar</h2>
                  <p className="text-xs sm:text-sm text-muted-foreground">AI suhbatlarini loyihalar bo'yicha guruhlang</p>
                </div>
                <Button className="gap-2 w-full sm:w-auto">
                  <Plus className="h-4 w-4" />
                  Yangi loyiha
                </Button>
              </div>
              
              <div className="grid gap-3 sm:gap-4 sm:grid-cols-2">
                {projects.map(project => (
                  <motion.div
                    key={project.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-3 sm:p-4 rounded-xl border border-border bg-card hover:bg-muted/50 cursor-pointer transition-colors"
                  >
                    <div className="flex items-start justify-between mb-2 sm:mb-3">
                      <div className="h-9 w-9 sm:h-10 sm:w-10 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
                        <FolderKanban className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
                      </div>
                      <Button size="icon" variant="ghost" className="h-7 w-7 sm:h-8 sm:w-8">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </div>
                    <h3 className="font-semibold text-sm sm:text-base mb-1">{project.name}</h3>
                    <p className="text-xs sm:text-sm text-muted-foreground mb-2 sm:mb-3">{project.description}</p>
                    <div className="flex items-center gap-3 sm:gap-4 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <MessageSquare className="h-3 w-3" />
                        {project.conversationCount} suhbat
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatTime(project.createdAt)}
                      </span>
                    </div>
                  </motion.div>
                ))}
                
                {/* Empty state card */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="p-4 rounded-xl border border-dashed border-border hover:border-primary/50 cursor-pointer transition-colors flex flex-col items-center justify-center min-h-[140px] sm:min-h-[160px] text-muted-foreground hover:text-foreground"
                >
                  <Plus className="h-6 w-6 sm:h-8 sm:w-8 mb-2" />
                  <span className="text-xs sm:text-sm">Yangi loyiha yaratish</span>
                </motion.div>
              </div>
            </div>
          </TabsContent>

          {/* Groups Tab */}
          <TabsContent value="groups" className="flex-1 m-0 p-3 sm:p-4 overflow-auto data-[state=inactive]:hidden">
            <div className="max-w-4xl mx-auto">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 sm:mb-6">
                <div>
                  <h2 className="text-lg sm:text-xl font-bold">Guruhlar</h2>
                  <p className="text-xs sm:text-sm text-muted-foreground">Jamoaviy AI suhbatlari</p>
                </div>
                <Button className="gap-2 w-full sm:w-auto">
                  <Plus className="h-4 w-4" />
                  Guruh yaratish
                </Button>
              </div>
              
              <div className="space-y-2 sm:space-y-3">
                {groups.map(group => (
                  <motion.div
                    key={group.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="flex items-center gap-3 sm:gap-4 p-3 sm:p-4 rounded-xl border border-border bg-card hover:bg-muted/50 cursor-pointer transition-colors"
                  >
                    <Avatar className="h-10 w-10 sm:h-12 sm:w-12">
                      <AvatarFallback className="bg-gradient-to-br from-green-500 to-emerald-500 text-white">
                        <Users className="h-4 w-4 sm:h-5 sm:w-5" />
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-sm sm:text-base truncate">{group.name}</h3>
                      <p className="text-xs sm:text-sm text-muted-foreground">{group.members} a'zo</p>
                    </div>
                    <Button variant="outline" size="sm" className="shrink-0 text-xs sm:text-sm">
                      Kirish
                    </Button>
                  </motion.div>
                ))}
                
                {/* Create group prompt */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex items-center gap-3 sm:gap-4 p-3 sm:p-4 rounded-xl border border-dashed border-border hover:border-primary/50 cursor-pointer transition-colors"
                >
                  <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-full bg-muted flex items-center justify-center">
                    <Plus className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <h3 className="font-medium text-sm sm:text-base">Yangi guruh yaratish</h3>
                    <p className="text-xs sm:text-sm text-muted-foreground">Jamoa bilan AI dan foydalaning</p>
                  </div>
                </motion.div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
