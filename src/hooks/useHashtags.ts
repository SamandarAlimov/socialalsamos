import { useCallback, useEffect, useRef, useState } from 'react';
import { db } from '@/lib/db';

export interface HashtagSuggestion {
  id: string;
  tag: string;
  posts_count: number;
  recent_count?: number;
}

/**
 * Unicode hashtag regexi — kirill, lotin, raqam va pastki chiziq.
 * Eski kodda `[a-zA-Z0-9_]` edi, ya'ni #salom yozsa topardi, #салом yo'q.
 */
export const HASHTAG_REGEX = /#([\p{L}\p{N}_]{1,64})/gu;

export function extractHashtags(text: string): string[] {
  if (!text) return [];
  const found = new Set<string>();
  for (const match of text.matchAll(HASHTAG_REGEX)) {
    found.add(match[1].toLowerCase());
  }
  return Array.from(found);
}

/** Kursor oldidagi tugallanmagan hashtagni topadi (autocomplete uchun). */
export function activeHashtagQuery(text: string, caret: number): string | null {
  const upto = text.slice(0, caret);
  const match = upto.match(/#([\p{L}\p{N}_]*)$/u);
  return match ? match[1] : null;
}

/**
 * Server tomonda hashtag qidiruvi — endi 200 ta postni klientga tortib
 * regex bilan sanamaymiz, trigram indeks bilan qidiramiz.
 */
export function useHashtagSearch(query: string | null, limit = 12) {
  const [suggestions, setSuggestions] = useState<HashtagSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const requestId = useRef(0);

  useEffect(() => {
    if (query === null) {
      setSuggestions([]);
      return;
    }

    const currentRequest = ++requestId.current;
    setIsLoading(true);

    const timer = setTimeout(async () => {
      try {
        const { data, error } = await db.rpc('search_hashtags', {
          p_query: query,
          p_limit: limit,
        });

        if (error) throw error;
        if (currentRequest === requestId.current) {
          setSuggestions((data ?? []) as HashtagSuggestion[]);
        }
      } catch (error) {
        console.error('Hashtag qidiruvida xatolik:', error);
        if (currentRequest === requestId.current) setSuggestions([]);
      } finally {
        if (currentRequest === requestId.current) setIsLoading(false);
      }
    }, 180);

    return () => clearTimeout(timer);
  }, [query, limit]);

  return { suggestions, isLoading };
}

/** Trend hashtaglar. */
export function useTrendingHashtags(limit = 12, days = 7) {
  const [trending, setTrending] = useState<HashtagSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data, error } = await db.rpc('trending_hashtags', {
        p_limit: limit,
        p_days: days,
      });

      if (error) throw error;
      setTrending((data ?? []) as HashtagSuggestion[]);
    } catch (error) {
      console.error('Trend hashtaglarni yuklashda xatolik:', error);
      setTrending([]);
    } finally {
      setIsLoading(false);
    }
  }, [limit, days]);

  useEffect(() => {
    load();
  }, [load]);

  return { trending, isLoading, refresh: load };
}

/** Bitta hashtag bo'yicha postlarni olish (SearchPage uchun). */
export async function fetchPostIdsByHashtag(tag: string, limit = 30, offset = 0) {
  const normalized = tag.replace(/^#/, '').toLowerCase();

  const { data, error } = await db
    .from('post_hashtags')
    .select('post_id, created_at, hashtags!inner(tag)')
    .eq('hashtags.tag', normalized)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw error;
  return (data ?? []).map((row: { post_id: string }) => row.post_id);
}
