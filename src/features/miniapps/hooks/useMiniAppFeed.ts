import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { fetchMiniAppFeed } from '../api';
import type { MiniApp, MiniAppFeedParams } from '../types';

const PAGE_SIZE = 24;
const SEARCH_DEBOUNCE_MS = 350;

interface UseMiniAppFeedResult {
  apps: MiniApp[];
  total: number;
  hasMore: boolean;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  loadMore: () => void;
  refresh: () => void;
  patchApp: (appId: string, patch: Partial<MiniApp>) => void;
}

/** Feed faqat serverdan keladi: filtr, sort va ranking klientda takrorlanmaydi. */
export function useMiniAppFeed(params: MiniAppFeedParams): UseMiniAppFeedResult {
  const [apps, setApps] = useState<MiniApp[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [debouncedQuery, setDebouncedQuery] = useState(params.query ?? '');

  const requestId = useRef(0);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(params.query ?? ''), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [params.query]);

  const effectiveParams = useMemo<MiniAppFeedParams>(
    () => ({
      section: params.section ?? 'all',
      category: params.category ?? null,
      appType: params.appType ?? null,
      sort: params.sort ?? 'recommended',
      verifiedOnly: params.verifiedOnly ?? false,
      priceModel: params.priceModel ?? null,
      locale: params.locale ?? null,
      query: debouncedQuery,
      limit: PAGE_SIZE,
    }),
    [
      params.section,
      params.category,
      params.appType,
      params.sort,
      params.verifiedOnly,
      params.priceModel,
      params.locale,
      debouncedQuery,
    ],
  );

  useEffect(() => {
    const currentRequest = ++requestId.current;
    setLoading(true);
    setError(null);

    fetchMiniAppFeed({ ...effectiveParams, offset: 0 })
      .then((page) => {
        if (currentRequest !== requestId.current) return;
        setApps(page.apps);
        setTotal(page.total);
        setHasMore(page.hasMore);
      })
      .catch((err: unknown) => {
        if (currentRequest !== requestId.current) return;
        setApps([]);
        setTotal(0);
        setHasMore(false);
        setError(err instanceof Error ? err.message : 'Ilovalarni yuklab bo\u2019lmadi');
      })
      .finally(() => {
        if (currentRequest === requestId.current) setLoading(false);
      });
  }, [effectiveParams, reloadToken]);

  const loadMore = useCallback(() => {
    if (loadingMore || loading || !hasMore) return;
    setLoadingMore(true);

    fetchMiniAppFeed({ ...effectiveParams, offset: apps.length })
      .then((page) => {
        setApps((prev) => {
          const seen = new Set(prev.map((app) => app.id));
          return [...prev, ...page.apps.filter((app) => !seen.has(app.id))];
        });
        setTotal(page.total);
        setHasMore(page.hasMore);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Qo\u2019shimcha ilovalarni yuklab bo\u2019lmadi');
      })
      .finally(() => setLoadingMore(false));
  }, [apps.length, effectiveParams, hasMore, loading, loadingMore]);

  const patchApp = useCallback((appId: string, patch: Partial<MiniApp>) => {
    setApps((prev) => prev.map((app) => (app.id === appId ? { ...app, ...patch } : app)));
  }, []);

  return {
    apps,
    total,
    hasMore,
    loading,
    loadingMore,
    error,
    loadMore,
    refresh: () => setReloadToken((token) => token + 1),
    patchApp,
  };
}
