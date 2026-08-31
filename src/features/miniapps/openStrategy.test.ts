import { describe, expect, it } from 'vitest';

import {
  MINI_APP_IFRAME_SANDBOX,
  buildIframeAllow,
  buildOpenPlan,
  buildProxyUrl,
  isFramingBlocked,
  isPrivateHost,
  normalizeMiniAppUrl,
  resolveEmbedUrl,
} from './openStrategy';

const API_BASE = 'https://project.supabase.co';

describe('sandbox', () => {
  it('allow-same-origin hech qachon berilmaydi', () => {
    expect(MINI_APP_IFRAME_SANDBOX).not.toContain('allow-same-origin');
    expect(MINI_APP_IFRAME_SANDBOX).toContain('allow-scripts');
  });

  it('allow atributi faqat ruxsat berilgan imkoniyatlarni qo\u2019shadi', () => {
    expect(buildIframeAllow([])).not.toContain('camera');
    expect(buildIframeAllow(['camera', 'location'])).toContain('camera');
    expect(buildIframeAllow(['camera', 'location'])).toContain('geolocation');
    expect(buildIframeAllow(['payments'])).toContain('payment');
  });
});

describe('isPrivateHost', () => {
  it('ichki manzillarni bloklaydi', () => {
    for (const host of [
      'localhost',
      '127.0.0.1',
      '10.1.2.3',
      '192.168.0.1',
      '172.16.0.1',
      '169.254.169.254',
      'metadata.google.internal',
      'router.local',
      'db.internal',
      '::1',
      'intranet',
    ]) {
      expect(isPrivateHost(host), host).toBe(true);
    }
  });

  it('ommaviy domenlarga ruxsat beradi', () => {
    for (const host of ['islom.uz', 'www.youtube.com', 'alsamos.uz', '8.8.8.8']) {
      expect(isPrivateHost(host), host).toBe(false);
    }
  });
});

describe('normalizeMiniAppUrl', () => {
  it('sxemasiz kiritilgan domenni https ga keltiradi', () => {
    const result = normalizeMiniAppUrl('islom.uz');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.url).toBe('https://islom.uz/');
  });

  it('http ni https ga majburlaydi', () => {
    const result = normalizeMiniAppUrl('http://islom.uz/quran');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.url.startsWith('https://')).toBe(true);
  });

  it('xavfli sxemalarni rad etadi', () => {
    for (const bad of [
      'javascript:alert(1)',
      'JAVASCRIPT:alert(1)',
      'data:text/html,<script>x</script>',
      'file:///etc/passwd',
      'blob:https://a.b/c',
    ]) {
      const result = normalizeMiniAppUrl(bad);
      expect(result.ok, bad).toBe(false);
      if (!result.ok) expect(result.reason).toBe('scheme_not_allowed');
    }
  });

  it('ichki tarmoq manzillarini rad etadi', () => {
    const result = normalizeMiniAppUrl('http://192.168.1.10:8080');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('private_host');
  });

  it('bo\u2019sh qiymatni rad etadi', () => {
    expect(normalizeMiniAppUrl('   ').ok).toBe(false);
    expect(normalizeMiniAppUrl(null).ok).toBe(false);
  });

  it('punycode domenni belgilaydi', () => {
    const result = normalizeMiniAppUrl('https://xn--80ak6aa92e.com');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.punycode).toBe(true);
  });
});

describe('resolveEmbedUrl', () => {
  it('YouTube video', () => {
    expect(resolveEmbedUrl('https://www.youtube.com/watch?v=abc123')).toBe(
      'https://www.youtube.com/embed/abc123',
    );
  });

  it('youtu.be qisqa havola', () => {
    expect(resolveEmbedUrl('https://youtu.be/abc123')).toBe('https://www.youtube.com/embed/abc123');
  });

  it('YouTube Shorts', () => {
    expect(resolveEmbedUrl('https://www.youtube.com/shorts/abc123')).toBe(
      'https://www.youtube.com/embed/abc123',
    );
  });

  it('YouTube playlist', () => {
    expect(resolveEmbedUrl('https://www.youtube.com/playlist?list=PL1')).toBe(
      'https://www.youtube.com/embed/videoseries?list=PL1',
    );
  });

  it('YouTube kanal uchun soxta embed yasamaydi', () => {
    expect(resolveEmbedUrl('https://www.youtube.com/@islomuz')).toBeNull();
    expect(resolveEmbedUrl('https://www.youtube.com/channel/UC123')).toBeNull();
  });

  it('Instagram post va reel', () => {
    expect(resolveEmbedUrl('https://www.instagram.com/p/XYZ/')).toBe(
      'https://www.instagram.com/p/XYZ/embed/',
    );
    expect(resolveEmbedUrl('https://www.instagram.com/reel/XYZ/')).toBe(
      'https://www.instagram.com/reel/XYZ/embed/',
    );
  });

  it('Instagram profil uchun embed yo\u2019q', () => {
    expect(resolveEmbedUrl('https://www.instagram.com/islom.uz/')).toBeNull();
  });

  it('Telegram kanal', () => {
    expect(resolveEmbedUrl('https://t.me/islomuz')).toBe('https://t.me/s/islomuz');
    expect(resolveEmbedUrl('https://t.me/s/islomuz')).toBe('https://t.me/s/islomuz');
  });

  it('Telegram bot uchun embed yo\u2019q', () => {
    expect(resolveEmbedUrl('https://t.me/AlsamosBot')).toBeNull();
  });

  it('Vimeo', () => {
    expect(resolveEmbedUrl('https://vimeo.com/123456')).toBe('https://player.vimeo.com/video/123456');
  });

  it('oddiy sayt uchun null', () => {
    expect(resolveEmbedUrl('https://islom.uz')).toBeNull();
  });
});

describe('isFramingBlocked', () => {
  it('framing bloklaydigan hostlarni aniqlaydi', () => {
    expect(isFramingBlocked('https://www.facebook.com/meta')).toBe(true);
    expect(isFramingBlocked('https://x.com/meta')).toBe(true);
    expect(isFramingBlocked('https://web.whatsapp.com')).toBe(true);
  });

  it('boshqa saytlar uchun false', () => {
    expect(isFramingBlocked('https://islom.uz')).toBe(false);
  });
});

describe('buildProxyUrl', () => {
  it('URL ni to\u2019g\u2019ri kodlaydi', () => {
    const proxied = buildProxyUrl(API_BASE, 'https://islom.uz/a?b=1', 42);
    expect(proxied).toBe(
      API_BASE + '/functions/v1/mini-app-proxy?url=' +
        encodeURIComponent('https://islom.uz/a?b=1') + '&_ts=42',
    );
  });
});

describe('buildOpenPlan', () => {
  it('oddiy sayt: direct -> proxy -> external', () => {
    const plan = buildOpenPlan({ url: 'https://islom.uz', apiBase: API_BASE });
    expect(plan.steps.map((step) => step.kind)).toEqual(['direct', 'proxy', 'external']);
    expect(plan.steps[0].timeoutMs).toBe(8000);
    expect(plan.steps[1].timeoutMs).toBe(15000);
  });

  it('embed mavjud bo\u2019lsa birinchi bo\u2019ladi', () => {
    const plan = buildOpenPlan({ url: 'https://youtu.be/abc123', apiBase: API_BASE });
    expect(plan.steps[0].kind).toBe('embed');
  });

  it('framing bloklangan saytda direct qadam tushib qoladi', () => {
    const plan = buildOpenPlan({ url: 'https://www.facebook.com/meta', apiBase: API_BASE });
    expect(plan.steps.map((step) => step.kind)).toEqual(['proxy', 'external']);
  });

  it('display_mode=external darhol tashqi ochadi', () => {
    const plan = buildOpenPlan({
      url: 'https://islom.uz',
      displayMode: 'external',
      apiBase: API_BASE,
    });
    expect(plan.steps.map((step) => step.kind)).toEqual(['external']);
  });

  it('apiBase bo\u2019lmasa proxy qadami qo\u2019shilmaydi', () => {
    const plan = buildOpenPlan({ url: 'https://islom.uz' });
    expect(plan.steps.map((step) => step.kind)).toEqual(['direct', 'external']);
  });

  it('native ilova deep_link bilan ochiladi', () => {
    const plan = buildOpenPlan({
      url: null,
      appType: 'native',
      deepLink: 'alsamos://wallet',
    });
    expect(plan.steps).toEqual([{ kind: 'native', src: 'alsamos://wallet', timeoutMs: 0 }]);
  });

  it('noto\u2019g\u2019ri URL uchun reja bo\u2019sh va sabab qaytadi', () => {
    const plan = buildOpenPlan({ url: 'javascript:alert(1)', apiBase: API_BASE });
    expect(plan.steps).toHaveLength(0);
    expect(plan.error).toBe('scheme_not_allowed');
  });

  it('bot turi tashqi ochiladi', () => {
    const plan = buildOpenPlan({
      url: 'https://t.me/AlsamosBot',
      appType: 'bot',
      apiBase: API_BASE,
    });
    expect(plan.steps.map((step) => step.kind)).toEqual(['external']);
  });
});
