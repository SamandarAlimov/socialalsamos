import { supabase } from '@/integrations/supabase/client';

export interface AdConversionOptions {
  value?: number | null;
  currency?: string | null;
  sourceUrl?: string | null;
  eventId?: string | null;
  metadata?: Record<string, unknown>;
}

type QueuedConversion = {
  eventName: string;
  options: AdConversionOptions;
  queuedAt: number;
  attempts: number;
};

const QUEUE_KEY = 'alsamos:ads:conversion-queue:v1';
const MAX_QUEUE = 50;
const MAX_ATTEMPTS = 4;

function storage() {
  return typeof window === 'undefined' ? null : window.localStorage;
}

function readQueue(): QueuedConversion[] {
  const target = storage();
  if (!target) return [];
  try {
    const parsed = JSON.parse(target.getItem(QUEUE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.slice(-MAX_QUEUE) : [];
  } catch {
    return [];
  }
}

function writeQueue(items: QueuedConversion[]) {
  const target = storage();
  if (!target) return;
  try {
    target.setItem(QUEUE_KEY, JSON.stringify(items.slice(-MAX_QUEUE)));
  } catch {
    // Conversion measurement must never interrupt the commerce flow.
  }
}

function enqueue(eventName: string, options: AdConversionOptions) {
  const queue = readQueue();
  const eventId = options.eventId || null;
  if (eventId && queue.some((item) => item.options.eventId === eventId)) return;
  queue.push({ eventName, options, queuedAt: Date.now(), attempts: 0 });
  writeQueue(queue);
}

function currentUrl() {
  if (typeof window === 'undefined') return null;
  return window.location.href;
}

async function sendConversion(eventName: string, options: AdConversionOptions) {
  return (supabase as any).rpc('record_ad_conversion_v2', {
    p_event_name: eventName,
    p_value: options.value == null ? null : Number(options.value),
    p_currency: options.currency || null,
    p_source_url: options.sourceUrl || currentUrl(),
    p_event_id: options.eventId || null,
    p_metadata: options.metadata || {},
  });
}

/**
 * First-party Ads conversion SDK.
 *
 * The RPC performs attribution server-side using the signed-in user's recent ad
 * click/view touchpoints. The client never receives another user's ad history,
 * and an unavailable measurement backend never blocks checkout.
 */
export async function trackAdConversion(
  eventName: string,
  options: AdConversionOptions = {},
): Promise<string | null> {
  const cleanName = eventName.trim();
  if (!cleanName) return null;

  try {
    const result = await sendConversion(cleanName, options);
    if (!result?.error) return result?.data ? String(result.data) : null;

    // Network/schema rollout failures are retried later. Business-level no-touch
    // attribution returns null without an error and therefore is not queued.
    enqueue(cleanName, options);
    return null;
  } catch {
    enqueue(cleanName, options);
    return null;
  }
}

/** Best-effort retry used after successful app/network activity. */
export async function flushQueuedAdConversions() {
  const queue = readQueue();
  if (!queue.length) return;

  const remaining: QueuedConversion[] = [];
  for (const item of queue) {
    try {
      const result = await sendConversion(item.eventName, item.options);
      if (!result?.error) continue;
    } catch {
      // Keep below.
    }

    const attempts = item.attempts + 1;
    if (attempts < MAX_ATTEMPTS) remaining.push({ ...item, attempts });
  }
  writeQueue(remaining);
}

export function trackMarketplaceCheckout(
  checkoutKey: string,
  value: number,
  currency: string,
  metadata: Record<string, unknown> = {},
) {
  return trackAdConversion('initiate_checkout', {
    value,
    currency,
    eventId: `marketplace-checkout:${checkoutKey}`,
    metadata: { commerce: 'marketplace', ...metadata },
  });
}

export function trackMarketplacePurchase(
  orderId: string,
  value: number,
  currency: string,
  metadata: Record<string, unknown> = {},
) {
  return trackAdConversion('purchase', {
    value,
    currency,
    eventId: `marketplace-order:${orderId}:purchase`,
    metadata: { commerce: 'marketplace', order_id: orderId, ...metadata },
  });
}
