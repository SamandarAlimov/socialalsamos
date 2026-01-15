import { useState, useRef, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { 
  Send, 
  Loader2, 
  Sparkles, 
  Image as ImageIcon,
  Trash2,
  Bot,
  User,
  MessageSquare,
  FolderKanban,
  Users,
  History,
  Plus,
  Paperclip,
  Mic,
  MoreHorizontal,
  ArrowUp,
  Clock,
  Zap,
  Wand2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

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
  const [activeTab, setActiveTab] = useState('chat');
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
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
  };

  const loadConversation = (conv: Conversation) => {
    setMessages(conv.messages);
    setCurrentConversationId(conv.id);
    setActiveTab(conv.type);
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

  return (
    <div className="flex h-[calc(100vh-4rem)] md:h-[calc(100vh-2rem)] bg-background">
      {/* Sidebar - History */}
      <div className="hidden md:flex w-64 border-r border-border flex-col">
        <div className="p-4 border-b border-border">
          <Button 
            className="w-full gap-2" 
            onClick={startNewConversation}
          >
            <Plus className="h-4 w-4" />
            Yangi suhbat
          </Button>
        </div>
        
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {conversations.map(conv => (
              <motion.div
                key={conv.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className={cn(
                  "group flex items-center gap-2 p-3 rounded-lg cursor-pointer hover:bg-muted/80 transition-colors",
                  currentConversationId === conv.id && "bg-muted"
                )}
                onClick={() => loadConversation(conv)}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{conv.title}</p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {formatTime(conv.updatedAt)}
                  </p>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteConversation(conv.id);
                  }}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </motion.div>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Tabs Header */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
          <div className="border-b border-border px-4">
            <TabsList className="h-14 bg-transparent p-0 gap-2">
              <TabsTrigger 
                value="chat" 
                className="gap-2 data-[state=active]:bg-muted rounded-lg px-4"
              >
                <MessageSquare className="h-4 w-4" />
                <span className="hidden sm:inline">Chat</span>
              </TabsTrigger>
              <TabsTrigger 
                value="imagine" 
                className="gap-2 data-[state=active]:bg-muted rounded-lg px-4"
              >
                <Wand2 className="h-4 w-4" />
                <span className="hidden sm:inline">Imagine</span>
              </TabsTrigger>
              <TabsTrigger 
                value="projects" 
                className="gap-2 data-[state=active]:bg-muted rounded-lg px-4"
              >
                <FolderKanban className="h-4 w-4" />
                <span className="hidden sm:inline">Loyihalar</span>
              </TabsTrigger>
              <TabsTrigger 
                value="groups" 
                className="gap-2 data-[state=active]:bg-muted rounded-lg px-4"
              >
                <Users className="h-4 w-4" />
                <span className="hidden sm:inline">Guruhlar</span>
              </TabsTrigger>
              <TabsTrigger 
                value="history" 
                className="gap-2 data-[state=active]:bg-muted rounded-lg px-4 md:hidden"
              >
                <History className="h-4 w-4" />
                <span className="hidden sm:inline">Tarix</span>
              </TabsTrigger>
            </TabsList>
          </div>

          {/* Chat Tab */}
          <TabsContent value="chat" className="flex-1 flex flex-col m-0 data-[state=inactive]:hidden">
            <ScrollArea ref={scrollAreaRef} className="flex-1 p-4">
              <AnimatePresence mode="wait">
                {messages.length === 0 ? (
                  <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex flex-col items-center justify-center h-full text-center px-4 py-12"
                  >
                    <div className="h-20 w-20 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center mb-6 shadow-lg shadow-violet-500/20">
                      <Sparkles className="h-10 w-10 text-white" />
                    </div>
                    <h2 className="text-2xl font-bold mb-2">Salom! Men AI yordamchingizman</h2>
                    <p className="text-muted-foreground max-w-md mb-8">
                      Savol bering, matn yozing, kod generatsiya qiling yoki har qanday vazifada yordam so'rang.
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 w-full max-w-2xl">
                      {quickPrompts.map((prompt, i) => (
                        <Button 
                          key={i}
                          variant="outline" 
                          className="h-auto py-4 flex-col gap-2 hover:bg-muted/80"
                          onClick={() => setInput(prompt.text)}
                        >
                          <span className="text-2xl">{prompt.icon}</span>
                          <span className="text-xs">{prompt.text}</span>
                        </Button>
                      ))}
                    </div>
                  </motion.div>
                ) : (
                  <div className="space-y-6 max-w-3xl mx-auto">
                    {messages.map((message, idx) => (
                      <motion.div
                        key={message.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.05 }}
                        className={cn(
                          "flex gap-4",
                          message.role === 'user' ? 'flex-row-reverse' : 'flex-row'
                        )}
                      >
                        <Avatar className="h-8 w-8 shrink-0 ring-2 ring-background shadow">
                          {message.role === 'user' ? (
                            <AvatarFallback className="bg-primary text-primary-foreground">
                              <User className="h-4 w-4" />
                            </AvatarFallback>
                          ) : (
                            <AvatarFallback className="bg-gradient-to-br from-violet-500 to-purple-600 text-white">
                              <Bot className="h-4 w-4" />
                            </AvatarFallback>
                          )}
                        </Avatar>
                        <div
                          className={cn(
                            "rounded-2xl px-4 py-3 max-w-[85%] shadow-sm",
                            message.role === 'user'
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-muted'
                          )}
                        >
                          <p className="text-sm whitespace-pre-wrap leading-relaxed">{message.content}</p>
                          {message.imageUrl && (
                            <img 
                              src={message.imageUrl} 
                              alt="Generated" 
                              className="mt-3 rounded-xl max-w-full shadow-md"
                            />
                          )}
                        </div>
                      </motion.div>
                    ))}
                    {(isLoading || isGeneratingImage) && (
                      <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="flex gap-4"
                      >
                        <Avatar className="h-8 w-8 shrink-0">
                          <AvatarFallback className="bg-gradient-to-br from-violet-500 to-purple-600 text-white">
                            <Bot className="h-4 w-4" />
                          </AvatarFallback>
                        </Avatar>
                        <div className="bg-muted rounded-2xl px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="flex gap-1">
                              <span className="w-2 h-2 bg-violet-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                              <span className="w-2 h-2 bg-violet-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                              <span className="w-2 h-2 bg-violet-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                            </div>
                            <span className="text-sm text-muted-foreground ml-2">
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

            {/* Professional Input Section */}
            <div className="p-4 border-t border-border bg-background/95 backdrop-blur">
              <div className="max-w-3xl mx-auto">
                <div className="relative bg-muted/50 rounded-2xl border border-border focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/20 transition-all">
                  <Textarea
                    ref={textareaRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={activeTab === 'imagine' ? "Qanday rasm yaratmoqchisiz..." : "Xabar yozing..."}
                    className="min-h-[52px] max-h-[200px] resize-none border-0 bg-transparent focus-visible:ring-0 pr-32 py-4 px-4"
                    disabled={isLoading || isGeneratingImage}
                    rows={1}
                  />
                  <div className="absolute right-2 bottom-2 flex items-center gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-muted-foreground hover:text-foreground"
                      disabled
                    >
                      <Paperclip className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-muted-foreground hover:text-foreground"
                      disabled
                    >
                      <Mic className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      className={cn(
                        "h-8 w-8 rounded-lg transition-all",
                        input.trim() 
                          ? "bg-primary text-primary-foreground hover:bg-primary/90" 
                          : "bg-muted text-muted-foreground"
                      )}
                      onClick={activeTab === 'imagine' ? generateImage : sendMessage}
                      disabled={!input.trim() || isLoading || isGeneratingImage}
                    >
                      {isLoading || isGeneratingImage ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <ArrowUp className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
                <p className="text-xs text-center text-muted-foreground mt-2">
                  AI xato qilishi mumkin. Muhim ma'lumotlarni tekshiring.
                </p>
              </div>
            </div>
          </TabsContent>

          {/* Imagine Tab */}
          <TabsContent value="imagine" className="flex-1 flex flex-col m-0 data-[state=inactive]:hidden">
            <ScrollArea ref={scrollAreaRef} className="flex-1 p-4">
              <AnimatePresence mode="wait">
                {messages.length === 0 ? (
                  <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex flex-col items-center justify-center h-full text-center px-4 py-12"
                  >
                    <div className="h-20 w-20 rounded-2xl bg-gradient-to-br from-pink-500 to-orange-500 flex items-center justify-center mb-6 shadow-lg shadow-pink-500/20">
                      <Wand2 className="h-10 w-10 text-white" />
                    </div>
                    <h2 className="text-2xl font-bold mb-2">Imagine - Rasm Yaratish</h2>
                    <p className="text-muted-foreground max-w-md mb-8">
                      Tavsif yozing va AI sizning xayolingizni rasmga aylantirsin.
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 w-full max-w-2xl">
                      {quickPrompts.map((prompt, i) => (
                        <Button 
                          key={i}
                          variant="outline" 
                          className="h-auto py-4 flex-col gap-2 hover:bg-muted/80"
                          onClick={() => setInput(prompt.text)}
                        >
                          <span className="text-2xl">{prompt.icon}</span>
                          <span className="text-xs">{prompt.text}</span>
                        </Button>
                      ))}
                    </div>
                  </motion.div>
                ) : (
                  <div className="space-y-6 max-w-3xl mx-auto">
                    {messages.map((message, idx) => (
                      <motion.div
                        key={message.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.05 }}
                        className={cn(
                          "flex gap-4",
                          message.role === 'user' ? 'flex-row-reverse' : 'flex-row'
                        )}
                      >
                        <Avatar className="h-8 w-8 shrink-0 ring-2 ring-background shadow">
                          {message.role === 'user' ? (
                            <AvatarFallback className="bg-primary text-primary-foreground">
                              <User className="h-4 w-4" />
                            </AvatarFallback>
                          ) : (
                            <AvatarFallback className="bg-gradient-to-br from-pink-500 to-orange-500 text-white">
                              <Wand2 className="h-4 w-4" />
                            </AvatarFallback>
                          )}
                        </Avatar>
                        <div
                          className={cn(
                            "rounded-2xl px-4 py-3 max-w-[85%] shadow-sm",
                            message.role === 'user'
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-muted'
                          )}
                        >
                          <p className="text-sm whitespace-pre-wrap leading-relaxed">{message.content}</p>
                          {message.imageUrl && (
                            <img 
                              src={message.imageUrl} 
                              alt="Generated" 
                              className="mt-3 rounded-xl max-w-full shadow-md"
                            />
                          )}
                        </div>
                      </motion.div>
                    ))}
                    {isGeneratingImage && (
                      <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="flex gap-4"
                      >
                        <Avatar className="h-8 w-8 shrink-0">
                          <AvatarFallback className="bg-gradient-to-br from-pink-500 to-orange-500 text-white">
                            <Wand2 className="h-4 w-4" />
                          </AvatarFallback>
                        </Avatar>
                        <div className="bg-muted rounded-2xl px-4 py-3">
                          <div className="flex items-center gap-2">
                            <Loader2 className="h-4 w-4 animate-spin text-pink-500" />
                            <span className="text-sm text-muted-foreground">Rasm yaratilmoqda...</span>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </div>
                )}
              </AnimatePresence>
            </ScrollArea>

            {/* Same Input for Imagine */}
            <div className="p-4 border-t border-border bg-background/95 backdrop-blur">
              <div className="max-w-3xl mx-auto">
                <div className="relative bg-muted/50 rounded-2xl border border-border focus-within:border-pink-500/50 focus-within:ring-2 focus-within:ring-pink-500/20 transition-all">
                  <Textarea
                    ref={textareaRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Qanday rasm yaratmoqchisiz..."
                    className="min-h-[52px] max-h-[200px] resize-none border-0 bg-transparent focus-visible:ring-0 pr-32 py-4 px-4"
                    disabled={isGeneratingImage}
                    rows={1}
                  />
                  <div className="absolute right-2 bottom-2 flex items-center gap-1">
                    <Button
                      size="icon"
                      className={cn(
                        "h-8 w-8 rounded-lg transition-all",
                        input.trim() 
                          ? "bg-gradient-to-r from-pink-500 to-orange-500 text-white hover:opacity-90" 
                          : "bg-muted text-muted-foreground"
                      )}
                      onClick={generateImage}
                      disabled={!input.trim() || isGeneratingImage}
                    >
                      {isGeneratingImage ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Wand2 className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>

          {/* Projects Tab */}
          <TabsContent value="projects" className="flex-1 m-0 p-4 data-[state=inactive]:hidden">
            <div className="max-w-4xl mx-auto">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-xl font-bold">Loyihalar</h2>
                  <p className="text-sm text-muted-foreground">AI suhbatlarini loyihalar bo'yicha guruhlang</p>
                </div>
                <Button className="gap-2">
                  <Plus className="h-4 w-4" />
                  Yangi loyiha
                </Button>
              </div>
              
              <div className="grid gap-4 sm:grid-cols-2">
                {projects.map(project => (
                  <motion.div
                    key={project.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-4 rounded-xl border border-border bg-card hover:bg-muted/50 cursor-pointer transition-colors"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
                        <FolderKanban className="h-5 w-5 text-white" />
                      </div>
                      <Button size="icon" variant="ghost" className="h-8 w-8">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </div>
                    <h3 className="font-semibold mb-1">{project.name}</h3>
                    <p className="text-sm text-muted-foreground mb-3">{project.description}</p>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
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
                  className="p-4 rounded-xl border border-dashed border-border hover:border-primary/50 cursor-pointer transition-colors flex flex-col items-center justify-center min-h-[160px] text-muted-foreground hover:text-foreground"
                >
                  <Plus className="h-8 w-8 mb-2" />
                  <span className="text-sm">Yangi loyiha yaratish</span>
                </motion.div>
              </div>
            </div>
          </TabsContent>

          {/* Groups Tab */}
          <TabsContent value="groups" className="flex-1 m-0 p-4 data-[state=inactive]:hidden">
            <div className="max-w-4xl mx-auto">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-xl font-bold">Guruhlar</h2>
                  <p className="text-sm text-muted-foreground">Jamoaviy AI suhbatlari</p>
                </div>
                <Button className="gap-2">
                  <Plus className="h-4 w-4" />
                  Guruh yaratish
                </Button>
              </div>
              
              <div className="space-y-3">
                {groups.map(group => (
                  <motion.div
                    key={group.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="flex items-center gap-4 p-4 rounded-xl border border-border bg-card hover:bg-muted/50 cursor-pointer transition-colors"
                  >
                    <Avatar className="h-12 w-12">
                      <AvatarFallback className="bg-gradient-to-br from-green-500 to-emerald-500 text-white">
                        <Users className="h-5 w-5" />
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <h3 className="font-semibold">{group.name}</h3>
                      <p className="text-sm text-muted-foreground">{group.members} a'zo</p>
                    </div>
                    <Button variant="outline" size="sm">
                      Kirish
                    </Button>
                  </motion.div>
                ))}
                
                {/* Create group prompt */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex items-center gap-4 p-4 rounded-xl border border-dashed border-border hover:border-primary/50 cursor-pointer transition-colors"
                >
                  <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
                    <Plus className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <h3 className="font-medium">Yangi guruh yaratish</h3>
                    <p className="text-sm text-muted-foreground">Jamoa bilan AI dan foydalaning</p>
                  </div>
                </motion.div>
              </div>
            </div>
          </TabsContent>

          {/* History Tab (Mobile) */}
          <TabsContent value="history" className="flex-1 m-0 p-4 data-[state=inactive]:hidden md:hidden">
            <div className="mb-4">
              <Button 
                className="w-full gap-2" 
                onClick={startNewConversation}
              >
                <Plus className="h-4 w-4" />
                Yangi suhbat
              </Button>
            </div>
            
            <div className="space-y-2">
              {conversations.map(conv => (
                <motion.div
                  key={conv.id}
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={cn(
                    "group flex items-center gap-3 p-3 rounded-xl cursor-pointer hover:bg-muted/80 transition-colors",
                    currentConversationId === conv.id && "bg-muted"
                  )}
                  onClick={() => {
                    loadConversation(conv);
                    setActiveTab(conv.type);
                  }}
                >
                  <div className={cn(
                    "h-10 w-10 rounded-lg flex items-center justify-center shrink-0",
                    conv.type === 'imagine' 
                      ? "bg-gradient-to-br from-pink-500/20 to-orange-500/20" 
                      : "bg-gradient-to-br from-violet-500/20 to-purple-500/20"
                  )}>
                    {conv.type === 'imagine' ? (
                      <Wand2 className="h-5 w-5 text-pink-500" />
                    ) : (
                      <MessageSquare className="h-5 w-5 text-violet-500" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{conv.title}</p>
                    <p className="text-xs text-muted-foreground">{formatTime(conv.updatedAt)}</p>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 opacity-0 group-hover:opacity-100"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteConversation(conv.id);
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </motion.div>
              ))}
              
              {conversations.length === 0 && (
                <div className="text-center py-12 text-muted-foreground">
                  <History className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>Hali suhbatlar yo'q</p>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
