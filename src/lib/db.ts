import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import {
  readActiveLocalProject,
  setConversationProject,
} from '@/lib/ai/projectsStore';

/**
 * `src/integrations/supabase/types.ts` is generated and can lag behind newer
 * tables, so the app uses this untyped client for incremental schema work.
 *
 * Some optional AI tables are not deployed in production yet. Querying a
 * missing PostgREST relation on every render creates repeated 404s and can
 * break otherwise-working AI features. Until the cloud AI schema is explicitly
 * enabled, those optional relations fail locally (without a network request),
 * allowing their browser-backed fallbacks to work normally.
 */

const rawDb = supabase as unknown as SupabaseClient<any, 'public', any>;

const OPTIONAL_LOCAL_AI_TABLES = new Set([
  'ai_projects',
  'ai_memories',
  'ai_connectors',
  'ai_github_connections',
]);

const cloudAiSchemaEnabled = import.meta.env.VITE_AI_CLOUD_SCHEMA === '1';

function unavailableBuilder(table: string): any {
  const result = {
    data: null,
    count: null,
    status: 404,
    statusText: 'Optional AI schema disabled',
    error: {
      code: 'PGRST205',
      message: `Optional table public.${table} is using its local fallback.`,
      details: '',
      hint: 'Set VITE_AI_CLOUD_SCHEMA=1 only after the production migration is deployed.',
    },
  };

  let builder: any;
  const chain = () => builder;
  builder = {
    select: chain,
    insert: chain,
    upsert: chain,
    update: chain,
    delete: chain,
    eq: chain,
    neq: chain,
    gt: chain,
    gte: chain,
    lt: chain,
    lte: chain,
    like: chain,
    ilike: chain,
    is: chain,
    in: chain,
    contains: chain,
    containedBy: chain,
    range: chain,
    limit: chain,
    order: chain,
    match: chain,
    filter: chain,
    not: chain,
    or: chain,
    single: () => Promise.resolve(result),
    maybeSingle: () => Promise.resolve(result),
    then: (resolve: (value: any) => any, reject?: (reason: any) => any) =>
      Promise.resolve(result).then(resolve, reject),
  };
  return builder;
}

type ConversationMutation = {
  kind: 'insert' | 'update' | 'delete';
  id?: string;
};

function applyConversationProjectSideEffect(result: any, mutation?: ConversationMutation) {
  if (!mutation || result?.error) return;
  const active = readActiveLocalProject();

  if (mutation.kind === 'delete') {
    if (active?.userId && mutation.id) {
      setConversationProject(active.userId, mutation.id, null);
    }
    return;
  }

  if (!active) return;

  if (mutation.kind === 'update' && mutation.id) {
    setConversationProject(active.userId, mutation.id, active.project.id);
    return;
  }

  if (mutation.kind === 'insert') {
    const data = result?.data;
    const row = Array.isArray(data) ? data[0] : data;
    if (row?.id) {
      setConversationProject(active.userId, String(row.id), active.project.id);
    }
  }
}

function wrapConversationBuilder(builder: any, mutation?: ConversationMutation): any {
  return new Proxy(builder, {
    get(target, property, receiver) {
      if (property === 'insert') {
        return (...args: any[]) =>
          wrapConversationBuilder(target.insert(...args), { kind: 'insert' });
      }
      if (property === 'update') {
        return (...args: any[]) =>
          wrapConversationBuilder(target.update(...args), { kind: 'update' });
      }
      if (property === 'delete') {
        return (...args: any[]) =>
          wrapConversationBuilder(target.delete(...args), { kind: 'delete' });
      }
      if (property === 'eq') {
        return (column: string, value: unknown) => {
          const nextMutation = mutation ? { ...mutation } : undefined;
          if (nextMutation && column === 'id') nextMutation.id = String(value);
          return wrapConversationBuilder(target.eq(column, value), nextMutation);
        };
      }
      if (property === 'single' || property === 'maybeSingle') {
        return async (...args: any[]) => {
          const result = await target[property](...args);
          applyConversationProjectSideEffect(result, mutation);
          return result;
        };
      }
      if (property === 'then') {
        return (resolve: (value: any) => any, reject?: (reason: any) => any) =>
          target.then(
            (result: any) => {
              applyConversationProjectSideEffect(result, mutation);
              return resolve ? resolve(result) : result;
            },
            reject,
          );
      }

      const value = Reflect.get(target, property, receiver);
      if (typeof value === 'function') {
        return (...args: any[]) => {
          const next = value.apply(target, args);
          if (next && typeof next === 'object') return wrapConversationBuilder(next, mutation);
          return next;
        };
      }
      return value;
    },
  });
}

export const db = new Proxy(rawDb as any, {
  get(target, property, receiver) {
    if (property === 'from') {
      return (table: string) => {
        if (!cloudAiSchemaEnabled && OPTIONAL_LOCAL_AI_TABLES.has(table)) {
          return unavailableBuilder(table);
        }

        const builder = target.from(table);
        if (table === 'ai_conversations') return wrapConversationBuilder(builder);
        return builder;
      };
    }

    const value = Reflect.get(target, property, receiver);
    return typeof value === 'function' ? value.bind(target) : value;
  },
}) as SupabaseClient<any, 'public', any>;

export type DbClient = typeof db;
