import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ExternalLink, Flag, RotateCcw, Star, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { UI_LAYER } from '@/lib/uiLayers';

import { getApiBase, rateMiniApp, reportMiniApp, trackMiniAppEvent } from '../api';
import {
  MINI_APP_IFRAME_SANDBOX,
  buildIframeAllow,
  buildOpenPlan,
  type OpenPlan,
  type OpenStep,
} from '../openStrategy';
import type { MiniApp, MiniAppErrorCode } from '../types';

interface MiniAppViewerProps {
  app: MiniApp;
  onClose: () => void;
}

const URL_ERROR_MESSAGES: Record<string, string> = {
  empty: 'Ilova manzili ko’rsatilmagan.',
  malformed: 'Ilova manzili noto’g’ri formatda.',
  scheme_not_allowed: 'Faqat https manzillarga ruxsat beriladi.',
  private_host: 'Bu manzil ichki tarmoqqa tegishli — xavfsizlik uchun bloklandi.',
  no_host: 'Ilova manzilida domen aniqlanmadi.',
  unsupported: 'Bu ilova turi hozircha qo’llab-quvvatlanmaydi.',
};

export function MiniAppViewer({ app, onClose }: MiniAppViewerProps) {
  const { toast } = useToast();
  const [reloadKey, setReloadKey] = useState(0);
  const [stepIndex, setStepIndex] = useState(0);
  const [frameLoaded, setFrameLoaded] = useState(false);
  const [failed, setFailed] = useState<MiniAppErrorCode | null>(null);
  const [rating, setRating] = useState(0);

  const openedAt = useRef<number>(Date.now());
  const sessionId = useRef<string>(
    typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : String(Date.now()),
  );

  const plan: OpenPlan = useMemo(
    () =>
      buildOpenPlan({
        url: app.url,
        displayMode: app.displayMode,
        appType: app.appType,
        deepLink: app.deepLink,
        apiBase: getApiBase(),
        frameBlocked: app.frameBlocked,
        cacheBuster: reloadKey,
      }),
    [app.url, app.displayMode, app.appType, app.deepLink, app.frameBlocked, reloadKey],
  );

  const step: OpenStep | undefined = plan.steps[stepIndex];

  const openExternal = useCallback((url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer');
  }, []);

  // Ochilish telemetriyasi + yopilishda davomiylik (ranking shu eventlarga tayanadi).
  useEffect(() => {
    openedAt.current = Date.now();
    void trackMiniAppEvent(app.id, 'open', { sessionId: sessionId.current });
    return () => {
      void trackMiniAppEvent(app.id, 'close', {
        durationMs: Date.now() - openedAt.current,
        sessionId: sessionId.current,
      });
    };
  }, [app.id]);

  // Native deep-link'dan boshqa hech narsa avtomatik tashqariga chiqmaydi:
  // mini app maqsadi — superapp ichida ochilish.
  useEffect(() => {
    if (!step) return;
    if (step.kind === 'native') {
      openExternal(step.src);
    }
  }, [openExternal, step]);

  // Har bir iframe qadami uchun kutish vaqti; tugasa keyingi qadamga o‘tamiz.
  useEffect(() => {
    if (!step || step.timeoutMs <= 0 || frameLoaded) return;
    const timer = setTimeout(() => {
      if (stepIndex + 1 < plan.steps.length) {
        setStepIndex((index) => index + 1);
      } else {
        setFailed('timeout');
        void trackMiniAppEvent(app.id, 'error', {
          errorCode: 'timeout',
          sessionId: sessionId.current,
        });
      }
    }, step.timeoutMs);
    return () => clearTimeout(timer);
  }, [app.id, frameLoaded, plan.steps.length, step, stepIndex]);

  const handleReload = () => {
    setStepIndex(0);
    setFrameLoaded(false);
    setFailed(null);
    setReloadKey((key) => key + 1);
  };

  const handleRate = async (value: number) => {
    try {
      await rateMiniApp(app.id, value);
      setRating(value);
      toast({ title: 'Rahmat!', description: 'Bahoyingiz saqlandi.' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Xatolik';
      toast({
        title: 'Baholab bo’lmadi',
        description: message.includes('OPEN_REQUIRED')
          ? 'Baholash uchun ilovani kamida bir marta ochish kerak.'
          : message,
        variant: 'destructive',
      });
    }
  };

  const handleReport = async () => {
    try {
      await reportMiniApp(app.id, 'user_report');
      toast({ title: 'Shikoyat yuborildi', description: 'Moderatorlar tekshiradi.' });
    } catch (error) {
      toast({
        title: 'Yuborilmadi',
        description: error instanceof Error ? error.message : 'Xatolik',
        variant: 'destructive',
      });
    }
  };

  const showFrame = step && (step.kind === 'embed' || step.kind === 'direct' || step.kind === 'proxy');

  return (
    <div className={cn('fixed inset-0 flex flex-col bg-background', UI_LAYER.immersive)}>
      <header className="flex items-center gap-2 border-b px-3 py-2">
        <Button size="icon" variant="ghost" onClick={onClose} aria-label="Yopish">
          <X className="h-5 w-5" />
        </Button>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{app.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {plan.canonicalUrl ? new URL(plan.canonicalUrl).hostname : app.handle}
            {step ? ' · ' + step.kind : ''}
          </p>
        </div>

        <div className="hidden items-center gap-1 sm:flex">
          {[1, 2, 3, 4, 5].map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => void handleRate(value)}
              aria-label={value + ' yulduz'}
              className="p-0.5"
            >
              <Star
                className={cn(
                  'h-4 w-4',
                  value <= rating ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground',
                )}
              />
            </button>
          ))}
        </div>

        <Button size="icon" variant="ghost" onClick={handleReload} aria-label="Qayta yuklash">
          <RotateCcw className="h-4 w-4" />
        </Button>
        <Button size="icon" variant="ghost" onClick={() => void handleReport()} aria-label="Shikoyat">
          <Flag className="h-4 w-4" />
        </Button>
        {plan.canonicalUrl && (
          <Button
            size="icon"
            variant="ghost"
            onClick={() => openExternal(plan.canonicalUrl as string)}
            aria-label="Brauzerda ochish"
          >
            <ExternalLink className="h-4 w-4" />
          </Button>
        )}
      </header>

      {plan.punycodeWarning && (
        <div className="flex items-center gap-2 bg-amber-500/10 px-4 py-2 text-xs text-amber-700 dark:text-amber-300">
          <AlertTriangle className="h-4 w-4" />
          Bu domen xalqaro belgilardan foydalanadi — manzilni diqqat bilan tekshiring.
        </div>
      )}

      <div className="relative flex-1 overflow-hidden bg-muted/30">
        {plan.error && (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
            <AlertTriangle className="h-10 w-10 text-destructive" />
            <p className="text-sm text-muted-foreground">
              {URL_ERROR_MESSAGES[plan.error] ?? 'Ilovani ochib bo’lmadi.'}
            </p>
          </div>
        )}

        {!plan.error && failed && (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
            <AlertTriangle className="h-10 w-10 text-amber-500" />
            <p className="max-w-sm text-sm text-muted-foreground">
              {plan.inAppProxy
                ? 'Bu ilova Alsamos ichida yuklanmadi. Sayt javob bermayapti yoki proksi orqali ochilishini cheklagan.'
                : 'Bu ilova Alsamos ichida yuklanmadi. Ichki proksi hali sozlanmagan (VITE_MINI_APP_PROXY_ORIGIN).'}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleReload}>
                Qayta urinish
              </Button>
              {plan.canonicalUrl && (
                <Button onClick={() => openExternal(plan.canonicalUrl as string)}>
                  Brauzerda ochish
                </Button>
              )}
            </div>
          </div>
        )}

        {!plan.error && !failed && showFrame && step && (
          <>
            {!frameLoaded && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              </div>
            )}
            <iframe
              key={step.kind + ':' + step.src}
              src={step.src}
              title={app.name}
              className="h-full w-full border-0"
              // Sandbox qadamga bog‘liq: `allow-same-origin` faqat o‘z proksi
              // domenimiz uchun beriladi (u alohida origin — sandbox escape yo‘q).
              sandbox={step.sandbox ?? MINI_APP_IFRAME_SANDBOX}
              allow={buildIframeAllow(app.permissions)}
              referrerPolicy="no-referrer"
              onLoad={() => setFrameLoaded(true)}
              onError={() => {
                if (stepIndex + 1 < plan.steps.length) {
                  setStepIndex((index) => index + 1);
                } else {
                  setFailed('blocked');
                }
              }}
            />
          </>
        )}

        {!plan.error && !failed && step && (step.kind === 'external' || step.kind === 'native') && (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
            <ExternalLink className="h-10 w-10 text-muted-foreground" />
            <p className="max-w-sm text-sm text-muted-foreground">
              {step.kind === 'native'
                ? 'Bu ilova qurilmadagi ilovada ochiladi.'
                : 'Bu saytni Alsamos ichida ko’rsatib bo’lmadi. Uni yangi oynada ochishingiz mumkin.'}
            </p>
            <Button onClick={() => openExternal(step.src)}>Ochish</Button>
          </div>
        )}
      </div>
    </div>
  );
}
