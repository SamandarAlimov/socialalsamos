// Admin gateway (`mini-app-admin` edge funksiyasi) uchun klient.

import { supabase } from '@/integrations/supabase/client';

import { getApiBase } from '../api';
import type { MiniAppStatus } from '../types';

export type ModerationQueueItem = {
  app_id: string;
  slug: string;
  name: string;
  icon_url: string | null;
  app_type: string;
  url: string | null;
  status: MiniAppStatus;
  publisher_name: string | null;
  publisher_handle: string | null;
  publisher_verification: string | null;
  open_reports: number;
  submitted_at: string | null;
};

async function callAdmin<T>(payload: Record<string, unknown>): Promise<T> {
  const apiBase = getApiBase();
  if (!apiBase) throw new Error('API_BASE_MISSING');

  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error('AUTH_REQUIRED');

  const response = await fetch(apiBase + '/functions/v1/mini-app-admin', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + token,
    },
    body: JSON.stringify(payload),
  });

  const result = (await response.json()) as { error?: string } & T;
  if (!response.ok) {
    throw new Error(result?.error ?? 'ADMIN_REQUEST_FAILED');
  }
  return result;
}

export async function fetchModerationQueue(
  status: MiniAppStatus = 'pending_review',
  limit = 30,
  offset = 0,
): Promise<ModerationQueueItem[]> {
  const result = await callAdmin<{ items: ModerationQueueItem[] }>({
    action: 'queue',
    status,
    limit,
    offset,
  });
  return result.items ?? [];
}

export async function setMiniAppStatus(
  appId: string,
  status: MiniAppStatus,
  note?: string,
): Promise<void> {
  await callAdmin({ action: 'setStatus', appId, status, note: note ?? null });
}

export async function setPublisherVerification(
  publisherId: string,
  level: 'unverified' | 'email_verified' | 'domain_verified' | 'official',
): Promise<void> {
  await callAdmin({ action: 'verifyPublisher', publisherId, level });
}
