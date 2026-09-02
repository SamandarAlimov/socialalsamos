import { useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ExternalLink,
  Globe2,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { Button } from '@/components/ui/button';

function normalizeTarget(raw: string | null) {
  if (!raw) return null;

  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return url.toString();
  } catch {
    return null;
  }
}

export default function WebViewerPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const target = useMemo(
    () => normalizeTarget(searchParams.get('url')),
    [searchParams],
  );
  const [reloadKey, setReloadKey] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const host = useMemo(() => {
    if (!target) return '';
    try {
      return new URL(target).hostname.replace(/^www\./, '');
    } catch {
      return '';
    }
  }, [target]);

  const proxyUrl = target
    ? '/api/mini-app-proxy?u=' + encodeURIComponent(target)
    : '';

  const openExternal = () => {
    if (!target) return;
    window.open(target, '_blank', 'noopener,noreferrer');
  };

  const reload = () => {
    setLoaded(false);
    setFailed(false);
    setReloadKey((value) => value + 1);
  };

  return (
    <div className="flex h-[calc(100dvh-0px)] min-h-0 flex-col bg-background">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border/60 bg-background/95 px-2.5 backdrop-blur-xl sm:px-4">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-9 w-9 shrink-0 rounded-xl"
          onClick={() => navigate(-1)}
          aria-label="Orqaga"
        >
          <ArrowLeft className="h-4.5 w-4.5" />
        </Button>

        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl bg-muted/45 px-3 py-2">
          <Globe2 className="h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold text-foreground">
              {host || 'Internet'}
            </p>
            <p className="truncate text-[10px] text-muted-foreground">
              {target || 'Noto‘g‘ri manzil'}
            </p>
          </div>
        </div>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-9 w-9 shrink-0 rounded-xl"
          onClick={reload}
          disabled={!target}
          aria-label="Qayta yuklash"
        >
          <RefreshCw className="h-4 w-4" />
        </Button>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-9 w-9 shrink-0 rounded-xl"
          onClick={openExternal}
          disabled={!target}
          aria-label="Yangi tabda ochish"
          title="Yangi tabda ochish"
        >
          <ExternalLink className="h-4 w-4" />
        </Button>
      </header>

      <div className="relative min-h-0 flex-1 overflow-hidden bg-muted/20">
        {!target ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
            <AlertTriangle className="h-9 w-9 text-muted-foreground" />
            <div>
              <p className="text-sm font-semibold text-foreground">
                Veb manzil noto‘g‘ri
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Faqat http yoki https internet manzillari ochiladi.
              </p>
            </div>
          </div>
        ) : (
          <>
            {!loaded && !failed && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-background">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  {host} yuklanmoqda…
                </div>
              </div>
            )}

            {failed && (
              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-background p-6 text-center">
                <AlertTriangle className="h-9 w-9 text-muted-foreground" />
                <div className="max-w-sm">
                  <p className="text-sm font-semibold text-foreground">
                    Saytni Alsamos ichida ochib bo‘lmadi
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    Sayt proksi orqali ishlashni cheklagan yoki vaqtincha javob bermayapti.
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={reload}>
                    Qayta urinish
                  </Button>
                  <Button size="sm" onClick={openExternal}>
                    <ExternalLink className="mr-2 h-4 w-4" />
                    Yangi tab
                  </Button>
                </div>
              </div>
            )}

            <iframe
              ref={iframeRef}
              key={target + ':' + reloadKey}
              src={proxyUrl}
              title={host || 'Internet sahifasi'}
              className="h-full w-full border-0 bg-background"
              sandbox="allow-scripts allow-forms allow-popups allow-modals allow-downloads"
              referrerPolicy="no-referrer"
              onLoad={() => setLoaded(true)}
              onError={() => {
                setLoaded(false);
                setFailed(true);
              }}
            />
          </>
        )}
      </div>
    </div>
  );
}
