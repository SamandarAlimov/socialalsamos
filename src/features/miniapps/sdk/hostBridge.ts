// Mini App SDK — host tomoni (Alsamos web).
//
// Mini app iframe ichida `allow-same-origin` BERILMAGANI uchun uning origin'i "null".
// Shu sababli xabarlar faqat `event.source === iframe.contentWindow` bo'yicha tekshiriladi,
// va javob har doim `targetOrigin: '*'` bilan yuboriladi (boshqa iloji yo'q, lekin
// hech qanday maxfiy ma'lumot uzatilmaydi — faqat imzolangan initData).
//
// Protokol: docs/contracts/mini-apps/sdk.md

import { supabase } from '@/integrations/supabase/client';

import { getApiBase } from '../api';
import { normalizeMiniAppUrl } from '../openStrategy';
import type { MiniApp, MiniAppPermission } from '../types';

export type MiniAppBridgeRequest = {
  source: 'alsamos-mini-app';
  id: string;
  method: string;
  params?: Record<string, unknown>;
};

export type MiniAppBridgeHandlers = {
  onReady?: () => void;
  onClose?: () => void;
  onOpenLink?: (url: string) => void;
  onShare?: (payload: { url?: string; text?: string }) => void;
  onPaymentRequested?: (paymentId: string, amount: number) => void;
};

const SDK_VERSION = '2.0.0';

function hasPermission(app: MiniApp, permission: MiniAppPermission): boolean {
  return app.permissions.includes(permission);
}

async function issueInitData(appId: string): Promise<unknown> {
  const apiBase = getApiBase();
  if (!apiBase) throw new Error('API_BASE_MISSING');

  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error('AUTH_REQUIRED');

  const response = await fetch(apiBase + '/functions/v1/mini-app-init-data', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + token,
    },
    body: JSON.stringify({ appId, platform: 'web' }),
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error('INIT_DATA_FAILED: ' + details);
  }
  return response.json();
}

async function createPayment(
  appId: string,
  amount: number,
  currency: string,
  description: string | null,
): Promise<string> {
  const client = supabase as unknown as {
    rpc: (name: string, params: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
  };
  const { data, error } = await client.rpc('mini_app_payment_create', {
    p_app_id: appId,
    p_amount: amount,
    p_currency: currency,
    p_description: description,
  });
  if (error) throw new Error(error.message);
  return String(data);
}

/**
 * Iframe bilan postMessage ko'prigini o'rnatadi. Tozalash funksiyasini qaytaradi.
 */
export function createMiniAppBridge(
  iframe: HTMLIFrameElement,
  app: MiniApp,
  handlers: MiniAppBridgeHandlers = {},
): () => void {
  const respond = (id: string, result: unknown, error?: string) => {
    iframe.contentWindow?.postMessage(
      { source: 'alsamos-host', id, result, error: error ?? null },
      '*',
    );
  };

  const onMessage = async (event: MessageEvent) => {
    if (!event.data || typeof event.data !== 'object') return;
    if (event.source !== iframe.contentWindow) return;

    const message = event.data as MiniAppBridgeRequest;
    if (message.source !== 'alsamos-mini-app' || typeof message.method !== 'string') return;

    const params = message.params ?? {};

    try {
      switch (message.method) {
        case 'ready': {
          handlers.onReady?.();
          respond(message.id, {
            sdkVersion: SDK_VERSION,
            platform: 'web',
            permissions: app.permissions,
            theme: document.documentElement.classList.contains('dark') ? 'dark' : 'light',
          });
          break;
        }

        case 'getInitData': {
          if (!hasPermission(app, 'profile')) throw new Error('PERMISSION_DENIED');
          respond(message.id, await issueInitData(app.id));
          break;
        }

        case 'close': {
          handlers.onClose?.();
          respond(message.id, { closed: true });
          break;
        }

        case 'openLink': {
          const normalized = normalizeMiniAppUrl(String(params.url ?? ''));
          if (!normalized.ok) throw new Error('INVALID_URL');
          handlers.onOpenLink?.(normalized.url);
          window.open(normalized.url, '_blank', 'noopener,noreferrer');
          respond(message.id, { opened: true });
          break;
        }

        case 'share': {
          const payload = {
            url: params.url ? String(params.url) : undefined,
            text: params.text ? String(params.text) : undefined,
          };
          handlers.onShare?.(payload);
          respond(message.id, { shared: true });
          break;
        }

        case 'requestPayment': {
          if (!hasPermission(app, 'payments')) throw new Error('PERMISSION_DENIED');
          const amount = Number(params.amount ?? 0);
          if (!Number.isFinite(amount) || amount <= 0) throw new Error('INVALID_AMOUNT');
          const paymentId = await createPayment(
            app.id,
            amount,
            String(params.currency ?? 'UZS'),
            params.description ? String(params.description) : null,
          );
          handlers.onPaymentRequested?.(paymentId, amount);
          respond(message.id, { paymentId, status: 'pending' });
          break;
        }

        default:
          throw new Error('UNKNOWN_METHOD');
      }
    } catch (error) {
      respond(message.id, null, error instanceof Error ? error.message : 'UNKNOWN_ERROR');
    }
  };

  window.addEventListener('message', onMessage);
  return () => window.removeEventListener('message', onMessage);
}
