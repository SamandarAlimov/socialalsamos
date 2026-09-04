import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

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

export const db = new Proxy(rawDb as any, {
  get(target, property, receiver) {
    if (property === 'from') {
      return (table: string) => {
        if (!cloudAiSchemaEnabled && OPTIONAL_LOCAL_AI_TABLES.has(table)) {
          return unavailableBuilder(table);
        }
        return target.from(table);
      };
    }

    const value = Reflect.get(target, property, receiver);
    return typeof value === 'function' ? value.bind(target) : value;
  },
}) as SupabaseClient<any, 'public', any>;

export type DbClient = typeof db;
