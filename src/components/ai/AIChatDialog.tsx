import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, 
  Send, 
  Bot, 
  User, 
  Image as ImageIcon, 
  Trash2,
  Sparkles,
  Settings,
  Clock,
  AlertTriangle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAI } from '@/contexts/AIContext';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

export function AIChatDialog() {
  const { user, profile } = useAuth();
  const { 
    messages, 
    isLoading, 
    isOpen, 
    setIsOpen, 
    sendMessage, 
    generateImage,
    clearMessages,
    checkTimeLimit 
  } = useAI();
  
  const [input, setInput] = useState('');
  const [imagePrompt, setImagePrompt] = useState('');
  const [showImageGen, setShowImageGen] = useState(false);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [timeLimitWarning, setTimeLimitWarning] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
      checkTimeLimit().then(({ exceeded, usedMinutes, limitMinutes }) => {
        if (exceeded && limitMinutes) {
          setTimeLimitWarning(`⚠️ Kunlik ${limitMinutes} daqiqa limitga yetdingiz (${usedMinutes} daqiqa foydalandingiz)`);
        }
      });
    }
  }, [isOpen, checkTimeLimit]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;
    
    const message = input.trim();
    setInput('');
    await sendMessage(message);
  };

  const handleGenerateImage = async () => {
    if (!imagePrompt.trim()) return;
    
    const imageUrl = await generateImage(imagePrompt);
    if (imageUrl) {
      setGeneratedImage(imageUrl);
      toast.success('Rasm muvaffaqiyatli yaratildi!');
    } else {
      toast.error('Rasm yaratishda xatolik');
    }
  };

  const quickActions = [
    { label: "To'lovlarim haqida", prompt: "Mening so'nggi to'lovlarim haqida ma'lumot ber" },
    { label: "Statistikam", prompt: "Mening platformadagi statistikalarimni ko'rsat" },
    { label: "Trend mavzular", prompt: "Hozirgi trend mavzular qanday?" },
  ];

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 100, scale: 0.9 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 100, scale: 0.9 }}
        className={cn(
          "fixed bottom-20 right-4 md:bottom-6 md:right-6 z-50",
          "w-[calc(100vw-2rem)] max-w-md",
          "h-[70vh] max-h-[600px]",
          "bg-background border border-border rounded-2xl shadow-2xl",
          "flex flex-col overflow-hidden"
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border bg-gradient-to-r from-primary/10 to-primary/5">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center">
              <Bot className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">Alsamos AI</h3>
              <p className="text-xs text-muted-foreground">Sizga yordam berishga tayyorman</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={clearMessages} className="h-8 w-8">
              <Trash2 className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => setIsOpen(false)} className="h-8 w-8">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Time limit warning */}
        {timeLimitWarning && (
          <div className="px-4 py-2 bg-yellow-500/10 border-b border-yellow-500/20">
            <p className="text-xs text-yellow-600 dark:text-yellow-400 flex items-center gap-2">
              <AlertTriangle className="h-3 w-3" />
              {timeLimitWarning}
            </p>
          </div>
        )}

        {/* Messages */}
        <ScrollArea className="flex-1 p-4">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center gap-4 py-8">
              <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
                <Sparkles className="h-8 w-8 text-primary" />
              </div>
              <p className="text-center text-muted-foreground text-sm">
                Salom! Men Alsamos AI yordamchisiman.<br />
                Sizga qanday yordam bera olaman?
              </p>
              <div className="flex flex-wrap gap-2 justify-center">
                {quickActions.map((action) => (
                  <Button
                    key={action.label}
                    variant="outline"
                    size="sm"
                    className="text-xs"
                    onClick={() => sendMessage(action.prompt)}
                  >
                    {action.label}
                  </Button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={cn(
                    "flex gap-3",
                    msg.role === 'user' ? "justify-end" : "justify-start"
                  )}
                >
                  {msg.role === 'assistant' && (
                    <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center flex-shrink-0">
                      <Bot className="h-4 w-4 text-primary-foreground" />
                    </div>
                  )}
                  <div
                    className={cn(
                      "max-w-[80%] rounded-2xl px-4 py-2 text-sm",
                      msg.role === 'user'
                        ? "bg-primary text-primary-foreground rounded-tr-none"
                        : "bg-muted text-foreground rounded-tl-none"
                    )}
                  >
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                    {msg.imageUrl && (
                      <img src={msg.imageUrl} alt="Generated" className="mt-2 rounded-lg max-w-full" />
                    )}
                  </div>
                  {msg.role === 'user' && (
                    <Avatar className="h-8 w-8 flex-shrink-0">
                      <AvatarImage src={profile?.avatar_url || ''} />
                      <AvatarFallback>
                        <User className="h-4 w-4" />
                      </AvatarFallback>
                    </Avatar>
                  )}
                </div>
              ))}
              {isLoading && (
                <div className="flex gap-3">
                  <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center">
                    <Bot className="h-4 w-4 text-primary-foreground" />
                  </div>
                  <div className="bg-muted rounded-2xl rounded-tl-none px-4 py-2">
                    <div className="flex gap-1">
                      <span className="h-2 w-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="h-2 w-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="h-2 w-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </ScrollArea>

        {/* Image generation panel */}
        {showImageGen && (
          <div className="p-4 border-t border-border bg-muted/50">
            <div className="flex gap-2">
              <Input
                value={imagePrompt}
                onChange={(e) => setImagePrompt(e.target.value)}
                placeholder="Rasm tavsifini kiriting..."
                className="flex-1"
              />
              <Button onClick={handleGenerateImage} disabled={isLoading || !imagePrompt.trim()}>
                <Sparkles className="h-4 w-4" />
              </Button>
            </div>
            {generatedImage && (
              <img src={generatedImage} alt="Generated" className="mt-2 rounded-lg max-w-full max-h-40 object-contain" />
            )}
          </div>
        )}

        {/* Input */}
        <div className="p-4 border-t border-border">
          <div className="flex gap-2">
            <Button
              variant={showImageGen ? "secondary" : "ghost"}
              size="icon"
              onClick={() => setShowImageGen(!showImageGen)}
              className="flex-shrink-0"
            >
              <ImageIcon className="h-4 w-4" />
            </Button>
            <Input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
              placeholder="Xabar yozing..."
              disabled={isLoading}
              className="flex-1"
            />
            <Button onClick={handleSend} disabled={isLoading || !input.trim()}>
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
