// Saqlashdan oldin manzilni real tekshirish.
// Maqsad: sayt superapp ichida (iframe) ochiladimi yoki proksi kerakmi — shuni
// oldindan aniqlab, to'g'ri `display_mode` bilan saqlash.

import { isFramingBlocked, normalizeMiniAppUrl } from '../openStrategy';

export type FrameProbeResult = {
  /** Iframe ichida ochilishi mumkin. */
  embeddable: boolean;
  /** Tavsiya etilgan ko'rsatish rejimi. */
  displayMode: 'iframe' | 'proxy';
  reason: 'ok' | 'known_blocked' | 'timeout' | 'invalid_url';
};

const PROBE_TIMEOUT_MS = 7000;

/**
 * Yashirin iframe orqali tekshiradi. Sayt `frame-ancestors`/`X-Frame-Options`
 * bilan bloklasa, brauzer `load` hodisasini bermaydi — timeout = bloklangan.
 */
export function probeFramability(rawUrl: string): Promise<FrameProbeResult> {
  const normalized = normalizeMiniAppUrl(rawUrl);
  if (!normalized.ok) {
    return Promise.resolve({ embeddable: false, displayMode: 'proxy', reason: 'invalid_url' });
  }

  // Ma'lum bloklovchi hostlar uchun brauzerni bezovta qilmaymiz.
  if (isFramingBlocked(normalized.url)) {
    return Promise.resolve({ embeddable: false, displayMode: 'proxy', reason: 'known_blocked' });
  }

  if (typeof document === 'undefined') {
    return Promise.resolve({ embeddable: true, displayMode: 'iframe', reason: 'ok' });
  }

  return new Promise<FrameProbeResult>((resolve) => {
    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.setAttribute('tabindex', '-1');
    frame.style.position = 'fixed';
    frame.style.width = '1px';
    frame.style.height = '1px';
    frame.style.opacity = '0';
    frame.style.pointerEvents = 'none';
    frame.style.left = '-9999px';
    frame.referrerPolicy = 'no-referrer';
    frame.src = normalized.url;

    let settled = false;
    const finish = (result: FrameProbeResult) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      frame.remove();
      resolve(result);
    };

    const timer = window.setTimeout(
      () => finish({ embeddable: false, displayMode: 'proxy', reason: 'timeout' }),
      PROBE_TIMEOUT_MS,
    );

    frame.addEventListener('load', () =>
      finish({ embeddable: true, displayMode: 'iframe', reason: 'ok' }),
    );
    frame.addEventListener('error', () =>
      finish({ embeddable: false, displayMode: 'proxy', reason: 'timeout' }),
    );

    document.body.appendChild(frame);
  });
}
