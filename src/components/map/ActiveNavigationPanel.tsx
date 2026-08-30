import {
  CircleStop,
  Crosshair,
  Loader2,
  MapPin,
  Navigation,
  Route,
  Satellite,
} from 'lucide-react';
import type { RouteMode } from '@/lib/routing';
import { arrivalTime, formatKm, formatMinutes } from '@/lib/routing';
import type {
  NavigationPosition,
  NavigationSnapshot,
} from '@/hooks/useActiveNavigation';
import { cn } from '@/lib/utils';

interface ActiveNavigationPanelProps {
  snapshot: NavigationSnapshot;
  position: NavigationPosition | null;
  destinationName: string;
  mode: RouteMode;
  error?: string | null;
  highContrast?: boolean;
  onRecenter: () => void;
  onStop: () => void;
}

function modeLabel(mode: RouteMode): string {
  if (mode === 'foot') return 'Piyoda';
  if (mode === 'bike') return 'Velosiped';
  if (mode === 'transit') return 'Transport';
  return 'Avtomobil';
}

export function ActiveNavigationPanel({
  snapshot,
  position,
  destinationName,
  mode,
  error,
  highContrast = false,
  onRecenter,
  onStop,
}: ActiveNavigationPanelProps) {
  const remainingDistance = snapshot.arrived
    ? '0 m'
    : formatKm(snapshot.remainingDistanceM);
  const remainingTime = snapshot.arrived
    ? 'Yetib keldingiz'
    : formatMinutes(snapshot.remainingDurationS);

  const instruction = snapshot.arrived
    ? 'Manzilga yetib keldingiz'
    : snapshot.rerouting
      ? 'Marshrut qayta hisoblanmoqda...'
      : snapshot.currentStep?.instruction || 'Yo‘nalishda davom eting';

  return (
    <>
      <div className="pointer-events-none absolute inset-x-0 top-0 z-[1400] px-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div
          className={cn(
            'pointer-events-auto mx-auto max-w-xl overflow-hidden rounded-[22px] border shadow-2xl backdrop-blur-2xl',
            highContrast
              ? 'border-white/[0.14] bg-slate-950/[0.92] text-white'
              : 'border-border/[0.55] bg-background/[0.94] text-foreground',
          )}
        >
          <div className="flex items-start gap-3 px-4 py-3.5">
            <span
              className={cn(
                'flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl',
                snapshot.arrived
                  ? 'bg-emerald-500/[0.14] text-emerald-500'
                  : 'bg-primary text-primary-foreground',
              )}
            >
              {snapshot.rerouting ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Navigation className="h-5 w-5" />
              )}
            </span>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="truncate text-base font-extrabold tracking-tight">
                  {instruction}
                </p>
                {!snapshot.arrived && snapshot.distanceToManeuverM > 0 && (
                  <span
                    className={cn(
                      'shrink-0 rounded-full px-2 py-1 text-[11px] font-bold',
                      highContrast
                        ? 'bg-white/[0.08] text-white/[0.72]'
                        : 'bg-muted text-muted-foreground',
                    )}
                  >
                    {formatKm(snapshot.distanceToManeuverM)}
                  </span>
                )}
              </div>

              <div
                className={cn(
                  'mt-1 flex items-center gap-2 text-xs',
                  highContrast ? 'text-white/[0.58]' : 'text-muted-foreground',
                )}
              >
                <span>{modeLabel(mode)}</span>
                <span>·</span>
                <span className="truncate">{destinationName}</span>
              </div>
            </div>

            <button
              type="button"
              onClick={onStop}
              className={cn(
                'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition',
                highContrast
                  ? 'border-white/[0.12] bg-white/[0.05] text-white/[0.72] hover:bg-white/[0.1] hover:text-white'
                  : 'border-border/[0.50] bg-background/[0.75] text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
              aria-label="Navigatsiyani tugatish"
              title="Navigatsiyani tugatish"
            >
              <CircleStop className="h-5 w-5" />
            </button>
          </div>

          {error && (
            <div className="border-t border-amber-500/[0.18] bg-amber-500/[0.08] px-4 py-2 text-xs font-medium text-amber-600 dark:text-amber-300">
              {error}
            </div>
          )}
        </div>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[1400] px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div
          className={cn(
            'pointer-events-auto mx-auto flex max-w-xl items-center gap-3 rounded-[22px] border px-3.5 py-3 shadow-2xl backdrop-blur-2xl',
            highContrast
              ? 'border-white/[0.14] bg-slate-950/[0.92] text-white'
              : 'border-border/[0.55] bg-background/[0.94] text-foreground',
          )}
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <p className="text-xl font-extrabold tracking-tight">
                {remainingTime}
              </p>
              {!snapshot.arrived && (
                <span
                  className={cn(
                    'text-sm font-semibold',
                    highContrast ? 'text-white/[0.62]' : 'text-muted-foreground',
                  )}
                >
                  {remainingDistance}
                </span>
              )}
            </div>

            <div
              className={cn(
                'mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]',
                highContrast ? 'text-white/[0.48]' : 'text-muted-foreground',
              )}
            >
              {!snapshot.arrived && (
                <span>{arrivalTime(snapshot.remainingDurationS)} yetib borish</span>
              )}
              {position && (
                <>
                  <span>·</span>
                  <span className="inline-flex items-center gap-1">
                    <Satellite className="h-3 w-3" />
                    ±{Math.round(position.accuracyM)} m
                  </span>
                </>
              )}
              {snapshot.distanceToRouteM > 30 && !snapshot.arrived && (
                <>
                  <span>·</span>
                  <span className="inline-flex items-center gap-1">
                    <Route className="h-3 w-3" />
                    yo‘ldan {formatKm(snapshot.distanceToRouteM)}
                  </span>
                </>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={onRecenter}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm transition hover:shadow-md"
            aria-label="Joylashuvga qaytish"
            title="Joylashuvga qaytish"
          >
            <Crosshair className="h-5 w-5" />
          </button>
        </div>
      </div>
    </>
  );
}

export default ActiveNavigationPanel;
