import {
  Crosshair,
  Flag,
  SkipForward,
  X,
  Loader2,
  Navigation,
  Route,
  Satellite,
  Volume2,
  VolumeX,
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
  voiceEnabled?: boolean;
  voiceSupported?: boolean;
  onToggleVoice?: () => void;
  following?: boolean;
  nextStopName?: string | null;
  nextStopDistanceM?: number | null;
  canSkipNextStop?: boolean;
  reachedStopName?: string | null;
  onContinueAfterStop?: () => void;
  onSkipNextStop?: () => void;
  onRecenter: () => void;
  onStop: () => void;
}

function maneuverRotation(modifier?: string): number {
  switch (modifier) {
    case 'left':
      return -90;
    case 'slight left':
      return -45;
    case 'sharp left':
      return -120;
    case 'right':
      return 90;
    case 'slight right':
      return 45;
    case 'sharp right':
      return 120;
    case 'uturn':
      return 180;
    default:
      return 0;
  }
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
  voiceEnabled = true,
  voiceSupported = false,
  onToggleVoice,
  following = true,
  nextStopName = null,
  nextStopDistanceM = null,
  canSkipNextStop = false,
  reachedStopName = null,
  onContinueAfterStop,
  onSkipNextStop,
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
                <Navigation
                  className="h-5 w-5 transition-transform"
                  style={{
                    transform:
                      'rotate(' +
                      maneuverRotation(snapshot.currentStep?.modifier) +
                      'deg)',
                  }}
                />
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

            <div className="flex shrink-0 gap-1.5">
              {voiceSupported && onToggleVoice && (
                <button
                  type="button"
                  onClick={onToggleVoice}
                  className={cn(
                    'flex h-10 w-10 items-center justify-center rounded-xl border transition',
                    highContrast
                      ? 'border-white/[0.12] bg-white/[0.05] text-white/[0.72] hover:bg-white/[0.1] hover:text-white'
                      : 'border-border/[0.50] bg-background/[0.75] text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                  aria-label={voiceEnabled ? 'Ovozni o‘chirish' : 'Ovozni yoqish'}
                  title={voiceEnabled ? 'Ovozni o‘chirish' : 'Ovozni yoqish'}
                >
                  {voiceEnabled ? (
                    <Volume2 className="h-5 w-5" />
                  ) : (
                    <VolumeX className="h-5 w-5" />
                  )}
                </button>
              )}
              <button
                type="button"
                onClick={onStop}
                className={cn(
                  'flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-xl border px-3 text-xs font-extrabold transition',
                  highContrast
                    ? 'border-red-300/[0.22] bg-red-400/[0.10] text-red-100 hover:bg-red-400/[0.18]'
                    : 'border-red-500/[0.20] bg-red-500/[0.08] text-red-600 hover:bg-red-500/[0.14] dark:text-red-300',
                )}
                aria-label="Navigatsiyadan chiqish"
                title="Navigatsiyadan chiqish"
              >
                <X className="h-4 w-4" />
                <span>Tugatish</span>
              </button>
            </div>
          </div>

          {reachedStopName ? (
            <div
              className={cn(
                'flex items-center gap-3 border-t px-4 py-3',
                highContrast
                  ? 'border-emerald-300/[0.14] bg-emerald-300/[0.08]'
                  : 'border-emerald-500/[0.16] bg-emerald-500/[0.07]',
              )}
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/[0.14] text-emerald-500">
                <Flag className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-extrabold">
                  {reachedStopName}
                </p>
                <p
                  className={cn(
                    'mt-0.5 text-[11px]',
                    highContrast
                      ? 'text-white/[0.55]'
                      : 'text-muted-foreground',
                  )}
                >
                  Oraliq manzilga yetdingiz
                </p>
              </div>
              {onContinueAfterStop && (
                <button
                  type="button"
                  onClick={onContinueAfterStop}
                  className="h-9 rounded-xl bg-emerald-500 px-3 text-xs font-extrabold text-white"
                >
                  Davom etish
                </button>
              )}
            </div>
          ) : nextStopName ? (
            <div
              className={cn(
                'flex items-center gap-3 border-t px-4 py-2.5',
                highContrast
                  ? 'border-white/[0.10] bg-white/[0.035]'
                  : 'border-border/[0.45] bg-muted/[0.20]',
              )}
            >
              <Flag
                className={cn(
                  'h-4 w-4 shrink-0',
                  highContrast ? 'text-white/[0.60]' : 'text-primary',
                )}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[11px] font-bold">
                  Keyingi: {nextStopName}
                </p>
                {nextStopDistanceM != null && (
                  <p
                    className={cn(
                      'mt-0.5 text-[10px]',
                      highContrast
                        ? 'text-white/[0.45]'
                        : 'text-muted-foreground',
                    )}
                  >
                    {formatKm(nextStopDistanceM)}
                  </p>
                )}
              </div>
              {canSkipNextStop && onSkipNextStop && (
                <button
                  type="button"
                  onClick={onSkipNextStop}
                  className={cn(
                    'flex h-8 items-center gap-1.5 rounded-xl border px-2.5 text-[10px] font-bold transition',
                    highContrast
                      ? 'border-white/[0.12] bg-white/[0.04] text-white/[0.65] hover:bg-white/[0.09]'
                      : 'border-border/[0.55] bg-background text-muted-foreground hover:text-foreground',
                  )}
                >
                  <SkipForward className="h-3.5 w-3.5" />
                  O‘tkazish
                </button>
              )}
            </div>
          ) : null}

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
                  {position.speedMps != null && position.speedMps >= 0.8 && (
                    <>
                      <span>·</span>
                      <span>{Math.round(position.speedMps * 3.6)} km/soat</span>
                    </>
                  )}
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
            className={cn(
              'flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl shadow-sm transition hover:shadow-md',
              following
                ? highContrast
                  ? 'bg-white/[0.08] text-white/[0.72]'
                  : 'bg-muted text-muted-foreground'
                : 'bg-primary text-primary-foreground ring-4 ring-primary/[0.14]',
            )}
            aria-label={
              following ? 'Joylashuv markazda' : 'Joylashuvga qaytish'
            }
            title={following ? 'Joylashuv markazda' : 'Joylashuvga qaytish'}
          >
            <Crosshair className="h-5 w-5" />
          </button>
        </div>
      </div>
    </>
  );
}

export default ActiveNavigationPanel;
