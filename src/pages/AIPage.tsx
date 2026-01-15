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
  User
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  imageUrl?: string;
  timestamp: Date;
}

export default function AIPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load conversation from database
  useEffect(() => {
    const loadConversation = async () => {
      if (!user) return;
      
      const { data } = await supabase
        .from('ai_conversations')
        .select('messages')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false })
        .limit(1)
        .single();
      
      if (data?.messages) {
        const loadedMessages = (data.messages as any[]).map((msg: any) => ({
          ...msg,
          timestamp: new Date(msg.timestamp)
        }));
        setMessages(loadedMessages);
      }
    };
    
    loadConversation();
  }, [user]);

  // Save conversation to database
  const saveConversation = async (newMessages: Message[]) => {
    if (!user) return;
    
    const { data: existing } = await supabase
      .from('ai_conversations')
      .select('id')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .limit(1)
      .single();
    
    if (existing) {
      await supabase
        .from('ai_conversations')
        .update({ 
          messages: newMessages as any,
          updated_at: new Date().toISOString()
        })
        .eq('id', existing.id);
    } else {
      await supabase
        .from('ai_conversations')
        .insert({
          user_id: user.id,
          messages: newMessages as any,
          context: 'general'
        });
    }
  };

  // Scroll to bottom on new messages
  useEffect(() => {
    if (scrollAreaRef.current) {
      const scrollContainer = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    }
  }, [messages]);

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
      const { data, error } = await supabase.functions.invoke('ai-assistant', {
        body: { 
          messages: newMessages.map(m => ({ role: m.role, content: m.content }))
        }
      });
      
      if (error) throw error;
      
      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: data.response || "Kechirasiz, javob olishda xatolik yuz berdi.",
        timestamp: new Date()
      };
      
      const updatedMessages = [...newMessages, assistantMessage];
      setMessages(updatedMessages);
      await saveConversation(updatedMessages);
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
      content: `🎨 Rasm yaratish: ${input.trim()}`,
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
      await saveConversation(updatedMessages);
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

  const clearConversation = async () => {
    setMessages([]);
    if (user) {
      await supabase
        .from('ai_conversations')
        .delete()
        .eq('user_id', user.id);
    }
    toast({
      title: 'Suhbat tozalandi',
      description: 'Barcha xabarlar o\'chirildi'
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] md:h-[calc(100vh-2rem)]">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
            <Sparkles className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="font-semibold">AI Assistant</h1>
            <p className="text-xs text-muted-foreground">Sizga yordam berishga tayyorman</p>
          </div>
        </div>
        {messages.length > 0 && (
          <Button variant="ghost" size="icon" onClick={clearConversation}>
            <Trash2 className="h-4 w-4 text-muted-foreground" />
          </Button>
        )}
      </div>

      {/* Messages */}
      <ScrollArea ref={scrollAreaRef} className="flex-1 p-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <div className="h-16 w-16 rounded-full bg-gradient-to-br from-violet-500/20 to-purple-600/20 flex items-center justify-center mb-4">
              <Sparkles className="h-8 w-8 text-primary" />
            </div>
            <h2 className="text-lg font-semibold mb-2">Salom! Men AI yordamchingizman</h2>
            <p className="text-sm text-muted-foreground max-w-sm">
              Menga savol bering, rasm yarating yoki akkauntingiz haqida ma'lumot oling.
            </p>
            <div className="grid grid-cols-2 gap-2 mt-6 w-full max-w-sm">
              <Button 
                variant="outline" 
                className="text-xs h-auto py-3"
                onClick={() => setInput('Mening profilim haqida aytib ber')}
              >
                📊 Profil statistikasi
              </Button>
              <Button 
                variant="outline" 
                className="text-xs h-auto py-3"
                onClick={() => setInput('Hamyon balansim qancha?')}
              >
                💰 Hamyon balansi
              </Button>
              <Button 
                variant="outline" 
                className="text-xs h-auto py-3"
                onClick={() => setInput('Platformadan samarali foydalanish bo\'yicha maslahat ber')}
              >
                💡 Maslahatlar
              </Button>
              <Button 
                variant="outline" 
                className="text-xs h-auto py-3"
                onClick={() => setInput('Chiroyli tabiat manzarasi')}
              >
                🎨 Rasm yaratish
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={cn(
                  "flex gap-3",
                  message.role === 'user' ? 'flex-row-reverse' : 'flex-row'
                )}
              >
                <Avatar className="h-8 w-8 shrink-0">
                  {message.role === 'user' ? (
                    <>
                      <AvatarImage src="" />
                      <AvatarFallback className="bg-primary text-primary-foreground">
                        <User className="h-4 w-4" />
                      </AvatarFallback>
                    </>
                  ) : (
                    <AvatarFallback className="bg-gradient-to-br from-violet-500 to-purple-600 text-white">
                      <Bot className="h-4 w-4" />
                    </AvatarFallback>
                  )}
                </Avatar>
                <div
                  className={cn(
                    "rounded-2xl px-4 py-2.5 max-w-[80%]",
                    message.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted'
                  )}
                >
                  <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                  {message.imageUrl && (
                    <img 
                      src={message.imageUrl} 
                      alt="Generated" 
                      className="mt-2 rounded-lg max-w-full"
                    />
                  )}
                </div>
              </div>
            ))}
            {(isLoading || isGeneratingImage) && (
              <div className="flex gap-3">
                <Avatar className="h-8 w-8 shrink-0">
                  <AvatarFallback className="bg-gradient-to-br from-violet-500 to-purple-600 text-white">
                    <Bot className="h-4 w-4" />
                  </AvatarFallback>
                </Avatar>
                <div className="bg-muted rounded-2xl px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm text-muted-foreground">
                      {isGeneratingImage ? 'Rasm yaratilmoqda...' : 'Yozmoqda...'}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </ScrollArea>

      {/* Input */}
      <div className="p-4 border-t border-border">
        <div className="flex gap-2">
          <Input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Xabar yozing..."
            className="flex-1"
            disabled={isLoading || isGeneratingImage}
          />
          <Button
            size="icon"
            variant="outline"
            onClick={generateImage}
            disabled={!input.trim() || isLoading || isGeneratingImage}
            title="Rasm yaratish"
          >
            <ImageIcon className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            onClick={sendMessage}
            disabled={!input.trim() || isLoading || isGeneratingImage}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
