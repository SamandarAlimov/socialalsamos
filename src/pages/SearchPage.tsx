import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Search, X, Globe, Sparkles, LayoutGrid, User, FileText, Users, Radio, ShoppingBag, Hash, TrendingUp, Clock, ArrowLeft, Mic, ChevronRight, Heart, MessageCircle, Eye, Play, Star, ExternalLink, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { useHapticFeedback } from '@/hooks/useHapticFeedback';
import { useDebounce } from '@/hooks/useDebounce';
import { StoryAvatar } from '@/components/stories/StoryAvatar';
import { OnlineIndicator } from '@/components/OnlineIndicator';
import { VerifiedBadge } from '@/components/VerifiedBadge';
import { PullToRefresh } from '@/components/PullToRefresh';
import { PostViewModal } from '@/components/PostViewModal';
import { PostMediaThumbnail } from '@/components/PostMediaThumbnail';
import { getStructuredPostMediaPreviewMap } from '@/lib/postMediaPreview';
import { getPostPreviewText } from '@/components/discovery/PostPreviewContent';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { GlobalSearchResults, type GlobalSearchResult } from '@/components/search/GlobalSearchResults';
import { useHashtagSearch, type HashtagSuggestion } from '@/hooks/useHashtags';
import { useVoiceSearch } from '@/hooks/useVoiceSearch';
import { useAuth } from '@/contexts/AuthContext';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';


// ── Types ──────────────────────────────────
interface SearchUser {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  followers_count: number | null;
  is_verified: boolean | null;
}

interface SearchPost {
  id: string;
  content: string | null;
  media_urls: string[] | null;
  media_type: string | null;
  preview_poster?: string | null;
  likes_count: number | null;
  comments_count: number | null;
  views_count: number;
  created_at: string | null;
  profile?: {
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
    is_verified: boolean | null;
  };
}

interface SearchChannel {
  id: string;
  name: string;
  description: string | null;
  avatar_url: string | null;
  subscriber_count: number;
  channel_type: string;
  username: string | null;
}

interface SearchProduct {
  id: string;
  title: string;
  price: number;
  currency: string | null;
  images: string[];
  seller?: {
    store_name: string | null;
    is_verified: boolean | null;
  };
}

interface SearchGroup {
  id: string;
  name: string | null;
  description: string | null;
  avatar_url: string | null;
  type: string;
}

type TabKey = 'global' | 'ai' | 'all' | 'users' | 'posts' | 'groups' | 'channels' | 'products' | 'hashtags';

const TABS: { key: TabKey; label: string; icon: React.ElementType }[] = [
  { key: 'global', label: 'Global', icon: Globe },
  { key: 'ai', label: 'AI', icon: Sparkles },
  { key: 'all', label: 'Hammasi', icon: LayoutGrid },
  { key: 'users', label: 'Foydalanuvchilar', icon: User },
  { key: 'posts', label: 'Postlar', icon: FileText },
  { key: 'groups', label: 'Guruhlar', icon: Users },
  { key: 'channels', label: 'Kanallar', icon: Radio },
  { key: 'products', label: 'Mahsulotlar', icon: ShoppingBag },
  { key: 'hashtags', label: 'Teglar', icon: Hash },
];

const trendingSearches = [
  { text: 'Alsamos yangiliklar', icon: TrendingUp },
  { text: 'trending videos', icon: Play },
  { text: 'yangi mahsulotlar', icon: ShoppingBag },
  { text: 'music covers', icon: Star },
];

const SEARCH_HISTORY_KEY = 'alsamos.search.history.v1';

function readLocalSearchHistory(): string[] {
  try {
    const raw = localStorage.getItem(SEARCH_HISTORY_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === 'string').slice(0, 20)
      : [];
  } catch {
    return [];
  }
}

function writeLocalSearchHistory(items: string[]) {
  try {
    localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(items.slice(0, 20)));
  } catch {
    // Storage can be unavailable in private/restricted browser modes.
  }
}

// ── Main Component ────────────────────────────
export default function SearchPage() {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { triggerHaptic } = useHapticFeedback();
  const { user } = useAuth();
  const tabsRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const initialTab = searchParams.get('tab') as TabKey | null;
  const [query, setQuery] = useState(searchParams.get('q') || '');
  const debouncedQuery = useDebounce(query, 300);
  const [activeTab, setActiveTab] = useState<TabKey>(
    initialTab && TABS.some((tab) => tab.key === initialTab) ? initialTab : 'global',
  );
  const [isFocused, setIsFocused] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>(readLocalSearchHistory);
  const platformSearchRequestRef = useRef(0);

  // Data states
  const [users, setUsers] = useState<SearchUser[]>([]);
  const [posts, setPosts] = useState<SearchPost[]>([]);
  const [channels, setChannels] = useState<SearchChannel[]>([]);
  const [products, setProducts] = useState<SearchProduct[]>([]);
  const [groups, setGroups] = useState<SearchGroup[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedPost, setSelectedPost] = useState<SearchPost | null>(null);
  const [aiResponse, setAiResponse] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSources, setAiSources] = useState<GlobalSearchResult[]>([]);
  const [aiError, setAiError] = useState<string | null>(null);
  const aiAbortRef = useRef<AbortController | null>(null);
  const aiQueryRef = useRef('');

  const hashtagQuery = debouncedQuery.trim() ? debouncedQuery.replace(/^#/, '') : null;
  const { suggestions: hashtags, isLoading: hashtagsLoading } = useHashtagSearch(hashtagQuery, 20);

  const onVoiceResult = useCallback((text: string) => {
    setQuery(text);
    inputRef.current?.focus();
  }, []);
  const { isListening, isSupported: voiceSupported, toggleListening } = useVoiceSearch({
    onResult: onVoiceResult,
    language: 'uz-UZ',
  });

  // Search state is URL-backed: refresh/back/share keep the exact query and tab.
  useEffect(() => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);

      if (query.trim()) next.set('q', query);
      else next.delete('q');

      if (activeTab === 'global') next.delete('tab');
      else next.set('tab', activeTab);

      return next;
    }, { replace: true });
  }, [query, activeTab, setSearchParams]);

  const rememberSearch = useCallback((value: string) => {
    const clean = value.trim().replace(/\s+/g, ' ');
    if (clean.length < 2) return;

    setRecentSearches((current) => {
      const next = [clean, ...current.filter((item) => item.toLocaleLowerCase() !== clean.toLocaleLowerCase())].slice(0, 20);
      writeLocalSearchHistory(next);
      return next;
    });

    if (user?.id) {
      void (async () => {
        try {
          await supabase
            .from('search_history')
            .delete()
            .eq('user_id', user.id)
            .ilike('query', clean);

          await supabase
            .from('search_history')
            .insert({ user_id: user.id, query: clean });
        } catch (error) {
          console.warn('[Search] history sync failed', error);
        }
      })();
    }
  }, [user?.id]);

  const clearSearchHistory = useCallback(() => {
    setRecentSearches([]);
    writeLocalSearchHistory([]);

    if (user?.id) {
      void supabase
        .from('search_history')
        .delete()
        .eq('user_id', user.id)
        .then(({ error }) => {
          if (error) console.warn('[Search] history clear failed', error);
        });
    }
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;

    let cancelled = false;
    void supabase
      .from('search_history')
      .select('query, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20)
      .then(({ data, error }) => {
        if (cancelled || error || !data) return;

        setRecentSearches((local) => {
          const merged = [
            ...data.map((row) => row.query),
            ...local,
          ].filter((value, index, all) =>
            all.findIndex((candidate) => candidate.toLocaleLowerCase() === value.toLocaleLowerCase()) === index,
          ).slice(0, 20);

          writeLocalSearchHistory(merged);
          return merged;
        });
      });

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  // Remember a query only after the user has stopped typing. This avoids
  // storing every intermediate keystroke such as "a", "al", "als"...
  useEffect(() => {
    const clean = debouncedQuery.trim();
    if (clean.length < 2) return;

    const timer = window.setTimeout(() => rememberSearch(clean), 900);
    return () => window.clearTimeout(timer);
  }, [debouncedQuery, rememberSearch]);

  // Search logic
  const performSearch = useCallback(async (searchTerm: string) => {
    const requestId = ++platformSearchRequestRef.current;
    const clean = searchTerm.trim();

    if (!clean) {
      setUsers([]);
      setPosts([]);
      setChannels([]);
      setProducts([]);
      setGroups([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    // PostgREST .or() uses commas/parentheses as syntax. Strip those control
    // characters from free-form search text so one unusual query cannot break
    // every platform tab.
    const term = clean.replace(/^#/, '').replace(/[,()]/g, ' ').replace(/\s+/g, ' ').trim();

    const requests = [
      supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url, bio, followers_count, is_verified')
        .or(`username.ilike.%${term}%,display_name.ilike.%${term}%,bio.ilike.%${term}%`)
        .limit(20),
      supabase
        .from('posts')
        .select(`
          id, content, media_urls, media_type, likes_count, comments_count, views_count, created_at,
          profile:profiles!posts_user_id_fkey (username, display_name, avatar_url, is_verified)
        `)
        .eq('visibility', 'public')
        .ilike('content', `%${term}%`)
        .order('created_at', { ascending: false })
        .limit(20),
      supabase
        .from('channels')
        .select('id, name, description, avatar_url, subscriber_count, channel_type, username')
        .or(`name.ilike.%${term}%,username.ilike.%${term}%,description.ilike.%${term}%`)
        .limit(20),
      supabase
        .from('products')
        .select(`
          id, title, price, currency, images,
          seller:sellers!products_seller_id_fkey (store_name, is_verified)
        `)
        .eq('status', 'active')
        .ilike('title', `%${term}%`)
        .limit(20),
      supabase
        .from('conversations')
        .select('id, name, description, avatar_url, type')
        .eq('type', 'group')
        .or(`name.ilike.%${term}%,description.ilike.%${term}%`)
        .limit(20),
    ] as const;

    try {
      const settled = await Promise.allSettled(requests);
      if (requestId !== platformSearchRequestRef.current) return;

      const read = <T,>(index: number): T[] => {
        const entry = settled[index];
        if (entry.status === 'rejected') {
          console.warn('[Search] platform source rejected', index, entry.reason);
          return [];
        }

        const result = entry.value as { data: T[] | null; error: { message?: string } | null };
        if (result.error) {
          console.warn('[Search] platform source error', index, result.error);
          return [];
        }

        return result.data ?? [];
      };

      setUsers(read<SearchUser>(0));
      const postRows = read<SearchPost>(1);
      setPosts(postRows);
      setChannels(read<SearchChannel>(2));
      setProducts(read<SearchProduct>(3));
      setGroups(read<SearchGroup>(4));

      const missingPreviewIds = postRows
        .filter((post) => !post.media_urls?.some(Boolean))
        .map((post) => post.id);

      if (missingPreviewIds.length > 0) {
        const previewMap = await getStructuredPostMediaPreviewMap(missingPreviewIds);
        if (requestId !== platformSearchRequestRef.current) return;

        if (previewMap.size > 0) {
          setPosts(
            postRows.map((post) => {
              const preview = previewMap.get(post.id);
              if (!preview || post.media_urls?.some(Boolean)) return post;
              return {
                ...post,
                media_urls: [preview.url],
                media_type: preview.mediaType,
                preview_poster: preview.poster,
              };
            }),
          );
        }
      }
    } finally {
      if (requestId === platformSearchRequestRef.current) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    performSearch(debouncedQuery);
  }, [debouncedQuery, performSearch]);

  const handleRefresh = useCallback(async () => {
    if (debouncedQuery.trim()) await performSearch(debouncedQuery);
  }, [debouncedQuery, performSearch]);

  const clearSearch = () => {
    triggerHaptic('light');
    setQuery('');
    inputRef.current?.focus();
  };

  const handleTabChange = (tab: TabKey) => {
    triggerHaptic('light');
    setActiveTab(tab);
  };

  // Post natijasi ilgari `navigate('/')` qilardi: bu Auth route, ya'ni post
  // ham, /home ham ochilmasdi. Endi video post Videolar sahifasida aynan
  // o'sha video bilan, oddiy post esa modalda ochiladi.
  const openPost = useCallback((post: SearchPost) => {
    triggerHaptic('light');

    if (post.media_type === 'video') {
      navigate(`/videos?v=${post.id}`);
      return;
    }

    setSelectedPost(post);
  }, [navigate, triggerHaptic]);

  // Teg tugmalari ilgari umuman bosilmasdi (onClick yo'q edi).
  const openHashtag = useCallback((tag: string) => {
    triggerHaptic('light');
    const clean = tag.replace(/^#/, '');
    setQuery(`#${clean}`);
    rememberSearch(`#${clean}`);
    setActiveTab('posts');
  }, [rememberSearch, triggerHaptic]);

  const handleAISearch = useCallback(async (searchTerm: string) => {
    const cleanQuery = searchTerm.trim();
    if (!cleanQuery) return;

    // Tab switching must never regenerate the same AI answer.
    // Only a changed search query is allowed to start a new request.
    if (aiQueryRef.current === cleanQuery) return;

    aiQueryRef.current = cleanQuery;
    aiAbortRef.current?.abort();
    const controller = new AbortController();
    aiAbortRef.current = controller;

    setAiLoading(true);
    setAiResponse('');
    setAiSources([]);
    setAiError(null);

    try {
      // AI Search must remain usable even when Global Search is slow or down.
      // It uses the exact same ai-assistant endpoint as AIPage.
      setAiSources([]);

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-assistant`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          signal: controller.signal,
          body: JSON.stringify({
            messages: [
              {
                role: 'user',
                content:
                  'Qidiruv so\'rovi: "' + cleanQuery + '"\n' +
                  'Shu qidiruv so\'rovi nimani anglatishi yoki kim/nima haqida ekanini bevosita tushuntir. ' +
                  'Salomlashma, o\'zingni tanishtirma va "qanday yordam bera olaman" deb so\'rama. ' +
                  'Agar bu ism, brend, joy, tashkilot yoki mavzu bo\'lsa, aynan o\'sha haqida foydali ma\'lumot ber.',
              },
            ],
            context:
              '[SEARCH_GROUNDING]\n' +
              'MODE=SEARCH_RESULT. Bu oddiy chat emas. Search inputidagi queryga darhol javob ber. ' +
              'Salomlashma, o\'zingni tanishtirma, imkoniyatlaringni sanama va qo\'shimcha savol so\'rama. ' +
              'Agar query ism, brend, tashkilot, joy, mahsulot yoki mavzu bo\'lsa, aynan shu narsa haqida qisqa, foydali va faktlarga boy javob ber. ' +
              'Query tili aniq bo\'lmasa o\'zbekcha javob ber. Web manba berilmagan bo\'lsa ham umumiy model biliming bilan bevosita javob ber; URL o\'ylab topma.',
          }),
        },
      );

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body?.error || 'AI xizmati bilan xatolik');
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('AI oqimi mavjud emas');

      const decoder = new TextDecoder();
      let buffer = '';
      let answer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done || controller.signal.aborted) break;
        buffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
          let line = buffer.slice(0, newlineIndex);
          buffer = buffer.slice(newlineIndex + 1);

          if (line.endsWith('\r')) line = line.slice(0, -1);
          if (!line.startsWith('data: ')) continue;

          const jsonText = line.slice(6).trim();
          if (!jsonText || jsonText === '[DONE]') continue;

          try {
            const chunk = JSON.parse(jsonText);
            const delta = chunk.choices?.[0]?.delta?.content;
            if (delta) {
              answer += delta;
              setAiResponse(answer);
            }
          } catch {
            // Partial SSE line is ignored; the next complete event continues.
          }
        }
      }

      if (!answer && !controller.signal.aborted) {
        setAiError('AI javobi bo\'sh qaytdi.');
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      setAiError(error instanceof Error ? error.message : 'AI xizmatiga ulanib bo\'lmadi.');
    } finally {
      if (aiAbortRef.current === controller) {
        setAiLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    const cleanQuery = debouncedQuery.trim();

    if (!cleanQuery) {
      aiAbortRef.current?.abort();
      aiAbortRef.current = null;
      aiQueryRef.current = '';
      setAiResponse('');
      setAiSources([]);
      setAiError(null);
      setAiLoading(false);
      return;
    }

    if (activeTab === 'ai') {
      void handleAISearch(cleanQuery);
    }
  }, [activeTab, debouncedQuery, handleAISearch]);

  // Leaving the AI tab does not abort or restart the current answer.
  // The request keeps running in SearchPage state and is reused when the user returns.
  useEffect(() => {
    return () => {
      aiAbortRef.current?.abort();
    };
  }, []);

  const hasQuery = query.trim().length > 0;

  // Count helpers
  const resultCounts: Partial<Record<TabKey, number>> = {
    users: users.length,
    posts: posts.length,
    groups: groups.length,
    channels: channels.length,
    products: products.length,
    hashtags: hashtags.length,
  };

  const pageContent = (
    <div className="min-h-screen bg-background pb-24 md:pb-4">
      {/* ── Premium Glass Header ── */}
      <div className="sticky top-0 z-30 bg-background/80 backdrop-blur-xl border-b border-border/50">
        <div className="max-w-3xl mx-auto px-4 pt-3 pb-2">
          {/* Search Bar */}
          <div className="flex items-center gap-2.5">
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-9 w-9 shrink-0 rounded-xl text-muted-foreground hover:text-foreground"
              onClick={() => navigate(-1)}
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>

            <div className={cn(
              "flex-1 relative group transition-all duration-300",
              isFocused && "scale-[1.01]"
            )}>
              <div className={cn(
                "absolute inset-0 rounded-2xl transition-all duration-500 pointer-events-none",
                isFocused 
                  ? "bg-background ring-1 ring-border shadow-sm" 
                  : "bg-muted/40"
              )} />
              <Search className={cn(
                "absolute left-3.5 top-1/2 -translate-y-1/2 h-4.5 w-4.5 transition-colors duration-300 z-10",
                isFocused ? "text-foreground" : "text-muted-foreground"
              )} />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    rememberSearch(query);
                  }
                }}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                placeholder="Qidirish..."
                className={cn(
                  "w-full h-11 pl-11 pr-20 rounded-2xl bg-transparent text-sm font-medium relative z-10",
                  "placeholder:text-muted-foreground/60 outline-none border-0",
                  "transition-all duration-300"
                )}
                autoFocus
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 z-10">
                {query && (
                  <motion.button
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0, opacity: 0 }}
                    className="h-7 w-7 rounded-full bg-muted/60 flex items-center justify-center hover:bg-muted transition-colors"
                    onClick={clearSearch}
                  >
                    <X className="h-3.5 w-3.5 text-muted-foreground" />
                  </motion.button>
                )}
                <button
                  type="button"
                  disabled={!voiceSupported}
                  onClick={toggleListening}
                  className={cn(
                    "h-7 w-7 rounded-full flex items-center justify-center transition-colors",
                    isListening ? "bg-foreground text-background" : "bg-muted/60 hover:bg-muted",
                    !voiceSupported && "opacity-40 cursor-not-allowed",
                  )}
                  aria-label={isListening ? "Ovozli qidiruvni to'xtatish" : "Ovozli qidiruv"}
                >
                  <Mic className={cn("h-3.5 w-3.5", !isListening && "text-muted-foreground")} />
                </button>
              </div>
            </div>
          </div>

          {/* ── Premium Tab Bar ── */}
          <div 
            ref={tabsRef}
            className="flex gap-1 mt-3 overflow-x-auto scrollbar-hide -mx-4 px-4 pb-1"
          >
            {TABS.map((tab) => {
              const isActive = activeTab === tab.key;
              const Icon = tab.icon;
              const count = resultCounts[tab.key];
              return (
                <button
                  key={tab.key}
                  onClick={() => handleTabChange(tab.key)}
                  className={cn(
                    "relative flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all duration-300 shrink-0",
                    isActive
                      ? "bg-background text-foreground shadow-sm ring-1 ring-border"
                      : "bg-muted/40 text-muted-foreground hover:bg-muted/70 hover:text-foreground"
                  )}
                >
                  <Icon className={cn("h-3.5 w-3.5", isActive && "drop-shadow-sm")} />
                  <span>{tab.label}</span>
                  {hasQuery && count !== undefined && count > 0 && !isActive && (
                    <span className="ml-0.5 px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground text-[10px] font-bold leading-none">
                      {count > 99 ? '99+' : count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Content ── */}
      <div className="max-w-3xl mx-auto px-4 py-4">
        <AnimatePresence mode="wait">
          {!hasQuery ? (
            <motion.div
              key={`empty-${activeTab}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
            >
              {activeTab === 'global' || activeTab === 'ai' ? (
                <RecentSearchHistory
                  items={recentSearches}
                  onSelect={(text) => {
                    triggerHaptic('light');
                    setQuery(text);
                  }}
                  onClear={clearSearchHistory}
                />
              ) : (
                <EmptySearchState
                  recentSearches={recentSearches}
                  trendingSearches={trendingSearches}
                  onSelect={(text) => { triggerHaptic('light'); setQuery(text); }}
                  onClearHistory={clearSearchHistory}
                />
              )}
            </motion.div>
          ) : (
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.15 }}
            >
              {activeTab === 'global' && (
                <GlobalTab query={query} />
              )}
              {activeTab === 'ai' && (
                <AITab
                  query={query}
                  response={aiResponse}
                  loading={aiLoading}
                  sources={aiSources}
                  error={aiError}
                />
              )}
              {activeTab === 'all' && (
                <AllTab
                  users={users} posts={posts} groups={groups} channels={channels} products={products}
                  hashtags={hashtags}
                  isLoading={isLoading || hashtagsLoading} query={query} navigate={navigate}
                  onTabSwitch={handleTabChange}
                  onOpenPost={openPost}
                  onSelectHashtag={openHashtag}
                />
              )}
              {activeTab === 'users' && (
                <UsersTab users={users} isLoading={isLoading} navigate={navigate} />
              )}
              {activeTab === 'posts' && (
                <PostsTab posts={posts} isLoading={isLoading} onOpenPost={openPost} />
              )}
              {activeTab === 'groups' && (
                <GroupsTab groups={groups} isLoading={isLoading} navigate={navigate} />
              )}
              {activeTab === 'channels' && (
                <ChannelsTab channels={channels} isLoading={isLoading} navigate={navigate} />
              )}
              {activeTab === 'products' && (
                <ProductsTab products={products} isLoading={isLoading} navigate={navigate} />
              )}
              {activeTab === 'hashtags' && (
                <HashtagsTab
                  hashtags={hashtags}
                  isLoading={hashtagsLoading}
                  onSelectHashtag={openHashtag}
                />
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {selectedPost && (
        <PostViewModal
          post={selectedPost as any}
          profile={selectedPost.profile as any}
          open={!!selectedPost}
          onOpenChange={(open: boolean) => !open && setSelectedPost(null)}
          onLike={() => {}}
        />
      )}
    </div>
  );

  if (isMobile) {
    return (
      <PullToRefresh onRefresh={handleRefresh} className="h-full">
        {pageContent}
      </PullToRefresh>
    );
  }
  return pageContent;
}

function RecentSearchHistory({
  items,
  onSelect,
  onClear,
}: {
  items: string[];
  onSelect: (text: string) => void;
  onClear: () => void;
}) {
  if (items.length === 0) return <div className="min-h-[42vh]" aria-hidden="true" />;

  return (
    <section className="pt-2">
      <div className="mb-3 flex items-center gap-2">
        <Clock className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Oxirgi qidiruvlar
        </h3>
        <button
          type="button"
          onClick={onClear}
          className="ml-auto text-[11px] font-medium text-muted-foreground hover:text-foreground"
        >
          Tozalash
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {items.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => onSelect(item)}
            className="rounded-xl border border-border/30 bg-muted/30 px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted/60"
          >
            {item}
          </button>
        ))}
      </div>
    </section>
  );
}

// ── Empty Search State ────────────────────────
function EmptySearchState({ recentSearches, trendingSearches, onSelect, onClearHistory }: {
  recentSearches: string[];
  trendingSearches: { text: string; icon: React.ElementType }[];
  onSelect: (text: string) => void;
  onClearHistory: () => void;
}) {
  return (
    <div className="space-y-6">
      {/* Trending */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <div className="h-8 w-8 rounded-xl bg-muted flex items-center justify-center">
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </div>
          <h3 className="text-sm font-semibold text-foreground">Trendda</h3>
        </div>
        <div className="space-y-1">
          {trendingSearches.map((item, i) => {
            const Icon = item.icon;
            return (
              <button
                key={i}
                onClick={() => onSelect(item.text)}
                className="w-full flex items-center gap-3 px-3.5 py-3 rounded-xl hover:bg-muted/50 transition-colors group"
              >
                <div className="h-9 w-9 rounded-xl bg-muted/60 flex items-center justify-center group-hover:bg-muted transition-colors">
                  <Icon className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                </div>
                <span className="text-sm font-medium text-foreground flex-1 text-left">{item.text}</span>
                <ChevronRight className="h-4 w-4 text-muted-foreground/50" />
              </button>
            );
          })}
        </div>
      </section>

      {/* Recent */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <div className="h-8 w-8 rounded-xl bg-muted/60 flex items-center justify-center">
            <Clock className="h-4 w-4 text-muted-foreground" />
          </div>
          <h3 className="text-sm font-semibold text-foreground">Oxirgi qidiruvlar</h3>
          {recentSearches.length > 0 && (
            <button
              type="button"
              onClick={onClearHistory}
              className="ml-auto text-[11px] font-medium text-muted-foreground hover:text-foreground"
            >
              Tozalash
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {recentSearches.map((term) => (
            <button
              key={term}
              onClick={() => onSelect(term)}
              className="px-3.5 py-2 rounded-xl bg-muted/40 hover:bg-muted/70 text-sm font-medium text-foreground transition-all duration-200 border border-border/30"
            >
              {term}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

// ── Global Tab ──────────────────────────────
function GlobalTab({ query }: { query: string }) {
  return <GlobalSearchResults query={query} />;
}


// ── AI Tab ─────────────────────────────────
function AITab({
  query,
  response,
  loading,
  sources,
  error,
}: {
  query: string;
  response: string;
  loading: boolean;
  sources: GlobalSearchResult[];
  error: string | null;
}) {
  return (
    <div className="space-y-4">
      <div className="p-4 rounded-2xl bg-card/60 border border-border/50 backdrop-blur-sm">
        <div className="flex items-center gap-2.5 mb-3">
          <div className="h-9 w-9 rounded-xl bg-muted flex items-center justify-center">
            <Sparkles className="h-4.5 w-4.5 text-muted-foreground" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-foreground">Alsamos AI Search</h3>
            <p className="text-[11px] text-muted-foreground truncate">"{query}" so'rovi bo'yicha</p>
          </div>
          {loading && <Loader2 className="ml-auto h-4 w-4 animate-spin text-muted-foreground" />}
        </div>

        {response ? (
          <div className="prose prose-sm max-w-none text-foreground/90 dark:prose-invert prose-p:leading-7 prose-p:my-2 prose-ul:my-2 prose-ol:my-2 prose-headings:mt-4 prose-headings:mb-2">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{response}</ReactMarkdown>
          </div>
        ) : loading ? (
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-4 w-3/5" />
          </div>
        ) : error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : null}
      </div>

      {sources.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-2">
            <Globe className="h-4 w-4 text-muted-foreground" />
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Manbalar
            </h4>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {sources.map((source, index) => (
              <a
                key={source.id}
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group rounded-xl border border-border/40 bg-card/50 p-3 hover:bg-muted/40 transition-colors"
              >
                <div className="flex items-start gap-2">
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-md bg-muted px-1 text-[10px] font-bold text-muted-foreground">
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-foreground line-clamp-2">{source.title}</p>
                    <p className="mt-1 text-[10px] text-muted-foreground truncate">{source.displayUrl}</p>
                  </div>
                  <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-60" />
                </div>
              </a>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// ── All Tab ────────────────────────────────
function AllTab({ users, posts, groups, channels, products, hashtags, isLoading, query, navigate, onTabSwitch, onOpenPost, onSelectHashtag }: {
  users: SearchUser[]; posts: SearchPost[]; groups: SearchGroup[]; channels: SearchChannel[];
  products: SearchProduct[]; hashtags: HashtagSuggestion[]; isLoading: boolean; query: string;
  navigate: (path: string) => void; onTabSwitch: (tab: TabKey) => void;
  onOpenPost: (post: SearchPost) => void; onSelectHashtag: (tag: string) => void;
}) {
  if (isLoading) return <AllSkeleton />;

  const noResults = users.length === 0 && posts.length === 0 && groups.length === 0 && channels.length === 0 && products.length === 0 && hashtags.length === 0;

  if (noResults) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <div className="h-16 w-16 rounded-2xl bg-muted/50 flex items-center justify-center mb-4">
          <Search className="h-7 w-7 text-muted-foreground/50" />
        </div>
        <h3 className="text-base font-semibold text-foreground mb-1">Natija topilmadi</h3>
        <p className="text-sm text-muted-foreground text-center max-w-xs">
          "{query}" bo'yicha hech narsa topilmadi. Boshqa so'z bilan qidirib ko'ring.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {users.length > 0 && (
        <ResultSection
          title="Foydalanuvchilar"
          count={users.length}
          icon={User}
          onSeeAll={() => onTabSwitch('users')}
        >
          <div className="space-y-1.5">
            {users.slice(0, 4).map((user) => (
              <PremiumUserCard key={user.id} user={user} onClick={() => navigate(`/user/${user.username || user.id}`)} />
            ))}
          </div>
        </ResultSection>
      )}

      {posts.length > 0 && (
        <ResultSection
          title="Postlar"
          count={posts.length}
          icon={FileText}
          onSeeAll={() => onTabSwitch('posts')}
        >
          <div className="space-y-2">
            {posts.slice(0, 3).map((post) => (
              <PremiumPostCard key={post.id} post={post} onClick={() => onOpenPost(post)} />
            ))}
          </div>
        </ResultSection>
      )}

      {groups.length > 0 && (
        <ResultSection
          title="Guruhlar"
          count={groups.length}
          icon={Users}
          onSeeAll={() => onTabSwitch('groups')}
        >
          <div className="space-y-1.5">
            {groups.slice(0, 4).map((group) => (
              <GroupResultCard
                key={group.id}
                group={group}
                onClick={() => navigate(`/messages?c=${group.id}`)}
              />
            ))}
          </div>
        </ResultSection>
      )}

      {hashtags.length > 0 && (
        <ResultSection
          title="Teglar"
          count={hashtags.length}
          icon={Hash}
          onSeeAll={() => onTabSwitch('hashtags')}
        >
          <div className="flex flex-wrap gap-2">
            {hashtags.slice(0, 8).map((tag) => (
              <HashtagChip key={tag.id} hashtag={tag} onSelect={onSelectHashtag} />
            ))}
          </div>
        </ResultSection>
      )}

      {channels.length > 0 && (
        <ResultSection
          title="Kanallar"
          count={channels.length}
          icon={Radio}
          onSeeAll={() => onTabSwitch('channels')}
        >
          <div className="space-y-1.5">
            {channels.slice(0, 3).map((ch) => (
              <PremiumChannelCard key={ch.id} channel={ch} onClick={() => navigate(`/channels?c=${ch.id}`)} />
            ))}
          </div>
        </ResultSection>
      )}

      {products.length > 0 && (
        <ResultSection
          title="Mahsulotlar"
          count={products.length}
          icon={ShoppingBag}
          onSeeAll={() => onTabSwitch('products')}
        >
          <div className="grid grid-cols-2 gap-2.5">
            {products.slice(0, 4).map((p) => (
              <PremiumProductCard key={p.id} product={p} onClick={() => navigate(`/marketplace/product/${p.id}`)} />
            ))}
          </div>
        </ResultSection>
      )}
    </div>
  );
}

// ── Section Wrapper ───────────────────────────
function ResultSection({ title, count, icon: Icon, onSeeAll, children }: {
  title: string; count: number; icon: React.ElementType;
  onSeeAll: () => void; children: React.ReactNode;
}) {
  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-muted flex items-center justify-center">
            <Icon className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          <span className="text-[11px] font-medium text-muted-foreground bg-muted/50 px-2 py-0.5 rounded-full">
            {count}
          </span>
        </div>
        <button
          onClick={onSeeAll}
          className="text-xs font-semibold text-link flex items-center gap-0.5 transition-colors hover:text-link-hover"
        >
          Hammasi <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
      {children}
    </section>
  );
}

// ── Users Tab ───────────────────────────────
function UsersTab({ users, isLoading, navigate }: {
  users: SearchUser[]; isLoading: boolean; navigate: (path: string) => void;
}) {
  if (isLoading) return <UsersSkeleton />;
  if (users.length === 0) return <EmptyTabState icon={User} text="Foydalanuvchi topilmadi" />;
  return (
    <div className="space-y-1.5">
      {users.map((user) => (
        <PremiumUserCard key={user.id} user={user} onClick={() => navigate(`/user/${user.username || user.id}`)} />
      ))}
    </div>
  );
}

// ── Posts Tab ────────────────────────────────
function PostsTab({ posts, isLoading, onOpenPost }: {
  posts: SearchPost[]; isLoading: boolean; onOpenPost: (post: SearchPost) => void;
}) {
  if (isLoading) return <PostsSkeleton />;
  if (posts.length === 0) return <EmptyTabState icon={FileText} text="Post topilmadi" />;
  return (
    <div className="space-y-2">
      {posts.map((post) => (
        <PremiumPostCard key={post.id} post={post} onClick={() => onOpenPost(post)} />
      ))}
    </div>
  );
}

// ── Groups Tab ──────────────────────────────
function GroupsTab({
  groups,
  isLoading,
  navigate,
}: {
  groups: SearchGroup[];
  isLoading: boolean;
  navigate: (path: string) => void;
}) {
  if (isLoading) return <UsersSkeleton />;
  if (groups.length === 0) return <EmptyTabState icon={Users} text="Guruh topilmadi" />;

  return (
    <div className="space-y-1.5">
      {groups.map((group) => (
        <GroupResultCard
          key={group.id}
          group={group}
          onClick={() => navigate(`/messages?c=${group.id}`)}
        />
      ))}
    </div>
  );
}

// ── Channels Tab ────────────────────────────
function ChannelsTab({ channels, isLoading, navigate }: {
  channels: SearchChannel[]; isLoading: boolean; navigate: (path: string) => void;
}) {
  if (isLoading) return <ChannelsSkeleton />;
  if (channels.length === 0) return <EmptyTabState icon={Radio} text="Kanal topilmadi" />;
  return (
    <div className="space-y-1.5">
      {channels.map((ch) => (
        <PremiumChannelCard key={ch.id} channel={ch} onClick={() => navigate(`/channels?c=${ch.id}`)} />
      ))}
    </div>
  );
}

// ── Products Tab ────────────────────────────
function ProductsTab({ products, isLoading, navigate }: {
  products: SearchProduct[]; isLoading: boolean; navigate: (path: string) => void;
}) {
  if (isLoading) return <ProductsSkeleton />;
  if (products.length === 0) return <EmptyTabState icon={ShoppingBag} text="Mahsulot topilmadi" />;
  return (
    <div className="grid grid-cols-2 gap-2.5">
      {products.map((p) => (
        // Ilgari bu yerda umumiy /marketplace ochilardi, AllTab esa mahsulot
        // sahifasiga o'tardi. Endi ikkalasi ham bir xil ishlaydi.
        <PremiumProductCard key={p.id} product={p} onClick={() => navigate(`/marketplace/product/${p.id}`)} />
      ))}
    </div>
  );
}

// ── Hashtags Tab ────────────────────────────
function HashtagsTab({
  hashtags,
  isLoading,
  onSelectHashtag,
}: {
  hashtags: HashtagSuggestion[];
  isLoading: boolean;
  onSelectHashtag: (tag: string) => void;
}) {
  if (isLoading) return <UsersSkeleton />;
  if (hashtags.length === 0) return <EmptyTabState icon={Hash} text="Teg topilmadi" />;

  return (
    <div className="flex flex-wrap gap-2">
      {hashtags.map((tag) => (
        <HashtagChip key={tag.id} hashtag={tag} onSelect={onSelectHashtag} />
      ))}
    </div>
  );
}

// ══════════════════════════════════════════════════════
// ── PREMIUM CARDS ─────────────────────────────
// ══════════════════════════════════════════════════════

function GroupResultCard({ group, onClick }: { group: SearchGroup; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-2xl border border-border/20 bg-card/50 p-3 text-left transition-colors hover:bg-card/80"
    >
      <div className="h-11 w-11 shrink-0 overflow-hidden rounded-xl bg-muted flex items-center justify-center">
        {group.avatar_url ? (
          <img src={group.avatar_url} alt="" className="h-full w-full object-cover" />
        ) : (
          <Users className="h-5 w-5 text-muted-foreground" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-foreground">{group.name || 'Guruh'}</p>
        {group.description && (
          <p className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">{group.description}</p>
        )}
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/50" />
    </button>
  );
}

function HashtagChip({
  hashtag,
  onSelect,
}: {
  hashtag: HashtagSuggestion;
  onSelect: (tag: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(hashtag.tag)}
      aria-label={`#${hashtag.tag} bo'yicha qidirish`}
      className="rounded-xl border border-border/30 bg-muted/40 px-3 py-2 text-left transition-colors hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="text-sm font-semibold text-foreground">#{hashtag.tag}</span>
      <span className="ml-2 text-[10px] text-muted-foreground">
        {formatCount(hashtag.posts_count || 0)} post
      </span>
    </button>
  );
}

function PremiumUserCard({ user, onClick }: { user: SearchUser; onClick: () => void }) {
  const { triggerHaptic } = useHapticFeedback();
  return (
    <motion.div
      whileTap={{ scale: 0.98 }}
      className="flex items-center gap-3 p-3 rounded-2xl bg-card/50 backdrop-blur-sm border border-border/20 cursor-pointer hover:bg-card/80 transition-all duration-200"
      onClick={() => { triggerHaptic('light'); onClick(); }}
    >
      <div className="relative shrink-0">
        <StoryAvatar
          userId={user.id}
          username={user.username}
          displayName={user.display_name}
          avatarUrl={user.avatar_url}
          isVerified={!!user.is_verified}
          size="lg"
          showRing
        />
        <OnlineIndicator userId={user.id} size="sm" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="font-semibold text-sm truncate text-foreground">{user.display_name || user.username}</span>
          {user.is_verified && <VerifiedBadge size="sm" />}
        </div>
        <p className="text-xs text-muted-foreground truncate">@{user.username}</p>
        {user.bio && <p className="text-[11px] text-muted-foreground/70 truncate mt-0.5">{user.bio}</p>}
      </div>
      <div className="text-right shrink-0">
        <span className="text-xs font-semibold text-foreground">{formatCount(user.followers_count || 0)}</span>
        <p className="text-[10px] text-muted-foreground">followers</p>
      </div>
    </motion.div>
  );
}

function PremiumPostCard({ post, onClick }: { post: SearchPost; onClick: () => void }) {
  const { triggerHaptic } = useHapticFeedback();
  const hasMedia = post.media_urls && post.media_urls.length > 0;
  // Post matnida [MUSIC]/[LOCATION] markerlari bo'lishi mumkin: xom JSON
  // qidiruv natijasida ko'rinmasligi kerak.
  const previewText = getPostPreviewText(post.content, '');

  return (
    <motion.div
      whileTap={{ scale: 0.98 }}
      className="p-3.5 rounded-2xl bg-card/50 backdrop-blur-sm border border-border/20 cursor-pointer hover:bg-card/80 transition-all duration-200"
      onClick={() => { triggerHaptic('light'); onClick(); }}
    >
      <div className="flex gap-3">
        {/* Author */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-1.5">
            {post.profile?.avatar_url ? (
              <img src={post.profile.avatar_url} className="h-6 w-6 rounded-full object-cover" alt="" />
            ) : (
              <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center">
                <User className="h-3 w-3 text-muted-foreground" />
              </div>
            )}
            <span className="text-xs font-semibold text-foreground truncate">
              {post.profile?.display_name || post.profile?.username || "Noma'lum"}
            </span>
            {post.profile?.is_verified && <VerifiedBadge size="xs" />}
          </div>
          {previewText && (
            <p className="text-sm text-foreground/90 line-clamp-2 leading-relaxed">{previewText}</p>
          )}
          <div className="flex items-center gap-3 mt-2.5">
            <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <Heart className="h-3 w-3" /> {post.likes_count || 0}
            </span>
            <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <MessageCircle className="h-3 w-3" /> {post.comments_count || 0}
            </span>
            <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <Eye className="h-3 w-3" /> {formatCount(post.views_count || 0)}
            </span>
          </div>
        </div>
        {/* Media thumbnail */}
        {hasMedia && (
          <PostMediaThumbnail
            url={post.media_urls![0]}
            mediaType={post.media_type}
            poster={post.preview_poster}
            className="h-20 w-20 rounded-xl"
          />
        )}
      </div>
    </motion.div>
  );
}

function PremiumChannelCard({ channel, onClick }: { channel: SearchChannel; onClick: () => void }) {
  const { triggerHaptic } = useHapticFeedback();
  return (
    <motion.div
      whileTap={{ scale: 0.98 }}
      className="flex items-center gap-3 p-3 rounded-2xl bg-card/50 backdrop-blur-sm border border-border/20 cursor-pointer hover:bg-card/80 transition-all duration-200"
      onClick={() => { triggerHaptic('light'); onClick(); }}
    >
      <div className="h-11 w-11 rounded-xl bg-muted flex items-center justify-center shrink-0 overflow-hidden">
        {channel.avatar_url ? (
          <img src={channel.avatar_url} className="h-full w-full object-cover" alt="" />
        ) : (
          <Radio className="h-5 w-5 text-muted-foreground" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="font-semibold text-sm truncate text-foreground">{channel.name}</span>
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 shrink-0">
            {channel.channel_type}
          </Badge>
        </div>
        {channel.description && (
          <p className="text-[11px] text-muted-foreground truncate mt-0.5">{channel.description}</p>
        )}
      </div>
      <div className="text-right shrink-0">
        <span className="text-xs font-semibold text-foreground">{formatCount(channel.subscriber_count)}</span>
        <p className="text-[10px] text-muted-foreground">a'zo</p>
      </div>
    </motion.div>
  );
}

function PremiumProductCard({ product, onClick }: { product: SearchProduct; onClick: () => void }) {
  const { triggerHaptic } = useHapticFeedback();
  const mainImage = product.images?.[0] || '/placeholder.svg';

  return (
    <motion.div
      whileTap={{ scale: 0.97 }}
      className="rounded-2xl bg-card/50 backdrop-blur-sm border border-border/20 overflow-hidden cursor-pointer hover:shadow-md transition-all duration-200"
      onClick={() => { triggerHaptic('light'); onClick(); }}
    >
      <div className="aspect-square bg-muted overflow-hidden">
        <img src={mainImage} className="w-full h-full object-cover" alt={product.title} />
      </div>
      <div className="p-2.5">
        <p className="text-xs font-medium text-foreground line-clamp-2 leading-snug mb-1.5">{product.title}</p>
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold text-foreground">
            {product.price?.toLocaleString()} {product.currency || 'UZS'}
          </span>
        </div>
        {product.seller?.store_name && (
          <p className="text-[10px] text-muted-foreground mt-1 truncate">{product.seller.store_name}</p>
        )}
      </div>
    </motion.div>
  );
}

// ── Utility Components ─────────────────────────

function EmptyTabState({ icon: Icon, text }: { icon: React.ElementType; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16">
      <div className="h-14 w-14 rounded-2xl bg-muted/40 flex items-center justify-center mb-3">
        <Icon className="h-6 w-6 text-muted-foreground/50" />
      </div>
      <p className="text-sm text-muted-foreground">{text}</p>
    </div>
  );
}

// ── Skeletons ────────────────────────────────

function AllSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 p-3 rounded-2xl bg-card/30">
            <Skeleton className="w-11 h-11 rounded-full" />
            <div className="flex-1">
              <Skeleton className="h-4 w-32 mb-1.5" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
        ))}
      </div>
      <div className="space-y-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="p-3.5 rounded-2xl bg-card/30">
            <Skeleton className="h-4 w-40 mb-2" />
            <Skeleton className="h-3 w-full mb-1" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        ))}
      </div>
    </div>
  );
}

function UsersSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-3 rounded-2xl bg-card/30">
          <Skeleton className="w-11 h-11 rounded-full" />
          <div className="flex-1">
            <Skeleton className="h-4 w-32 mb-1.5" />
            <Skeleton className="h-3 w-24" />
          </div>
          <Skeleton className="h-4 w-12" />
        </div>
      ))}
    </div>
  );
}

function PostsSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="p-3.5 rounded-2xl bg-card/30">
          <div className="flex items-center gap-2 mb-2">
            <Skeleton className="h-6 w-6 rounded-full" />
            <Skeleton className="h-3 w-24" />
          </div>
          <Skeleton className="h-4 w-full mb-1" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      ))}
    </div>
  );
}

function ChannelsSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-3 rounded-2xl bg-card/30">
          <Skeleton className="w-11 h-11 rounded-xl" />
          <div className="flex-1">
            <Skeleton className="h-4 w-36 mb-1.5" />
            <Skeleton className="h-3 w-48" />
          </div>
        </div>
      ))}
    </div>
  );
}

function ProductsSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-2.5">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="rounded-2xl bg-card/30 overflow-hidden">
          <Skeleton className="aspect-square w-full" />
          <div className="p-2.5">
            <Skeleton className="h-3 w-full mb-1.5" />
            <Skeleton className="h-4 w-16" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Utils ────────────────────────────────────

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}
