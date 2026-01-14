import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { useAuth } from './AuthContext';
import { supabase } from '@/integrations/supabase/client';

type Message = {
  role: 'user' | 'assistant';
  content: string;
  imageUrl?: string;
};

type AIPreferences = {
  content_filter: string[];
  daily_time_limit_minutes: number | null;
  recommendation_topics: string[];
  alerts_enabled: boolean;
};

type AIContextType = {
  messages: Message[];
  isLoading: boolean;
  isOpen: boolean;
  preferences: AIPreferences | null;
  setIsOpen: (open: boolean) => void;
  sendMessage: (content: string, context?: string) => Promise<void>;
  generateImage: (prompt: string, editImage?: string) => Promise<string | null>;
  clearMessages: () => void;
  updatePreferences: (prefs: Partial<AIPreferences>) => Promise<void>;
  checkTimeLimit: () => Promise<{ exceeded: boolean; usedMinutes: number; limitMinutes: number | null }>;
};

const AIContext = createContext<AIContextType | undefined>(undefined);

export function AIProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [preferences, setPreferences] = useState<AIPreferences | null>(null);

  // Load preferences
  useEffect(() => {
    const loadPreferences = async () => {
      if (!user) return;
      
      const { data } = await supabase
        .from('ai_preferences')
        .select('*')
        .eq('user_id', user.id)
        .single();
      
      if (data) {
        setPreferences({
          content_filter: data.content_filter || [],
          daily_time_limit_minutes: data.daily_time_limit_minutes,
          recommendation_topics: data.recommendation_topics || [],
          alerts_enabled: data.alerts_enabled ?? true,
        });
      }
    };
    
    loadPreferences();
  }, [user]);

  const sendMessage = useCallback(async (content: string, context?: string) => {
    if (!user) return;
    
    const userMsg: Message = { role: 'user', content };
    setMessages(prev => [...prev, userMsg]);
    setIsLoading(true);

    let assistantContent = "";

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
            messages: [...messages, userMsg].map(m => ({ role: m.role, content: m.content })),
            userId: user.id,
            context,
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
                return [...prev, { role: "assistant", content: assistantContent }];
              });
            }
          } catch {
            textBuffer = line + "\n" + textBuffer;
            break;
          }
        }
      }
    } catch (error) {
      console.error('AI error:', error);
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: `Xatolik: ${error instanceof Error ? error.message : 'Noma\'lum xatolik'}` }
      ]);
    } finally {
      setIsLoading(false);
    }
  }, [user, messages]);

  const generateImage = useCallback(async (prompt: string, editImage?: string): Promise<string | null> => {
    setIsLoading(true);
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-generate-image`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ prompt, editImage }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Rasm yaratishda xatolik');
      }

      const data = await response.json();
      return data.imageUrl || null;
    } catch (error) {
      console.error('Image generation error:', error);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  const updatePreferences = useCallback(async (prefs: Partial<AIPreferences>) => {
    if (!user) return;
    
    const newPrefs = { ...preferences, ...prefs };
    
    const { error } = await supabase
      .from('ai_preferences')
      .upsert({
        user_id: user.id,
        ...newPrefs,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });
    
    if (!error) {
      setPreferences(newPrefs as AIPreferences);
    }
  }, [user, preferences]);

  const checkTimeLimit = useCallback(async () => {
    if (!user || !preferences?.daily_time_limit_minutes) {
      return { exceeded: false, usedMinutes: 0, limitMinutes: null };
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const { data: logs } = await supabase
      .from('user_activity_logs')
      .select('duration_seconds')
      .eq('user_id', user.id)
      .gte('created_at', today.toISOString());

    const usedMinutes = (logs?.reduce((sum, log) => sum + (log.duration_seconds || 0), 0) || 0) / 60;
    
    return {
      exceeded: usedMinutes >= preferences.daily_time_limit_minutes,
      usedMinutes: Math.round(usedMinutes),
      limitMinutes: preferences.daily_time_limit_minutes,
    };
  }, [user, preferences]);

  return (
    <AIContext.Provider value={{
      messages,
      isLoading,
      isOpen,
      preferences,
      setIsOpen,
      sendMessage,
      generateImage,
      clearMessages,
      updatePreferences,
      checkTimeLimit,
    }}>
      {children}
    </AIContext.Provider>
  );
}

export function useAI() {
  const context = useContext(AIContext);
  if (!context) {
    throw new Error('useAI must be used within an AIProvider');
  }
  return context;
}
