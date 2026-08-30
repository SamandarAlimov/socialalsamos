import { useCallback, useState } from 'react';

const STORAGE_KEY = 'alsamos:map-search-history:v1';
const MAX_ITEMS = 8;

function readHistory(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).slice(0, MAX_ITEMS)
      : [];
  } catch {
    return [];
  }
}

function writeHistory(items: string[]) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // Private mode / storage quota: search itself must continue working.
  }
}

export function useMapSearchHistory() {
  const [recent, setRecent] = useState<string[]>(readHistory);

  const addRecent = useCallback((value: string) => {
    const clean = value.replace(/\s+/g, ' ').trim();
    if (clean.length < 2) return;
    setRecent((current) => {
      const next = [clean, ...current.filter((item) => item.toLocaleLowerCase() !== clean.toLocaleLowerCase())].slice(
        0,
        MAX_ITEMS,
      );
      writeHistory(next);
      return next;
    });
  }, []);

  const clearRecent = useCallback(() => {
    setRecent([]);
    writeHistory([]);
  }, []);

  return { recent, addRecent, clearRecent };
}

export default useMapSearchHistory;
