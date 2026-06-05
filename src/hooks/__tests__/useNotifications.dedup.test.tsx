import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// ---- Mocks --------------------------------------------------------------

const MOCK_USER = { id: 'user-1' };
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: MOCK_USER }),
}));

// Shared mutable store the mocked supabase client reads from.
const store: { rows: Array<Record<string, any>> } = { rows: [] };
const listeners: Array<(payload: any) => void> = [];

function makeQuery(table: string) {
  const state: any = { table, filters: [] as Array<[string, string, any]>, _order: null, _limit: null, _in: null };
  const api: any = {
    select: () => api,
    eq: (col: string, val: any) => { state.filters.push([col, 'eq', val]); return api; },
    in: (col: string, vals: any[]) => { state._in = [col, vals]; return api; },
    order: (col: string, opts: any) => { state._order = [col, opts]; return api; },
    limit: (n: number) => { state._limit = n; return api; },
    update: () => api,
    delete: () => api,
    maybeSingle: async () => ({ data: null, error: null }),
    then: undefined as any,
  };
  // Make it thenable so `await query` works.
  api.then = (resolve: any) => {
    let data: any[] = [];
    if (table === 'notifications') {
      data = [...store.rows]
        .filter((r) => state.filters.every(([c, , v]) => r[c] === v))
        .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
        .slice(0, state._limit ?? 50);
    } else if (table === 'profiles' || table === 'posts') {
      data = [];
    }
    resolve({ data, error: null });
  };
  return api;
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => makeQuery(table),
    channel: () => {
      const ch: any = {
        on: (_evt: string, cfg: any, cb: (p: any) => void) => {
          if (cfg?.event === 'INSERT') listeners.push(cb);
          return ch;
        },
        subscribe: () => ch,
      };
      return ch;
    },
    removeChannel: () => {},
  },
}));

import { useNotifications } from '../useNotifications';

// ---- Helpers ------------------------------------------------------------

function insertRow(id: string) {
  const row = {
    id,
    user_id: 'user-1',
    type: 'like',
    title: 't',
    body: 'b',
    data: { liker_id: 'x', post_id: 'p1' },
    is_read: false,
    created_at: new Date().toISOString(),
  };
  store.rows.unshift(row);
  // Fire realtime to every subscribed listener (simulates duplicate channels/triggers).
  listeners.forEach((l) => l({ new: row }));
}

describe('useNotifications — dedup under stress', () => {
  beforeEach(() => {
    store.rows = [];
    listeners.length = 0;
  });

  it('never shows duplicates after 10 rapid realtime triggers', async () => {
    const { result } = renderHook(() => useNotifications());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      for (let i = 0; i < 10; i++) insertRow(`n-${i}`);
      const replay = [...store.rows];
      replay.forEach((r) => listeners.forEach((l) => l({ new: r })));
      await new Promise((r) => setTimeout(r, 50));
    });

    await waitFor(() => expect(result.current.notifications.length).toBe(10));
    const ids = result.current.notifications.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(listeners.length).toBe(1);
  });

  it('dedups when realtime and historical fetch overlap', async () => {
    // Pre-seed historical rows.
    for (let i = 0; i < 5; i++) {
      store.rows.push({
        id: `h-${i}`,
        user_id: 'user-1',
        type: 'like',
        title: 't',
        body: 'b',
        data: {},
        is_read: false,
        created_at: new Date(Date.now() - i * 1000).toISOString(),
      });
    }

    const { result } = renderHook(() => useNotifications());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      // Realtime fires for the SAME historical IDs (double-subscription scenario).
      store.rows.slice().forEach((r) => listeners.forEach((l) => l({ new: r })));
      await new Promise((r) => setTimeout(r, 0));
    });

    await waitFor(() => {
      const ids = result.current.notifications.map((n) => n.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(result.current.notifications.length).toBe(5);
    });
  });
});
