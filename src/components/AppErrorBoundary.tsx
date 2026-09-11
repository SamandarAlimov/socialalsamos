import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  error: Error | null;
}

/**
 * Last-resort UI boundary for render/lifecycle failures.
 *
 * A React exception must never leave the PWA as a completely white screen.
 * Feature-level code should still handle its own errors; this boundary exists
 * so a data/device-specific crash remains recoverable and diagnosable.
 */
export class AppErrorBoundary extends Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[alsamos] Unhandled React render error', error, info.componentStack);
  }

  private reload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <main className="flex min-h-[100dvh] w-full items-center justify-center bg-background px-5 py-10 text-foreground">
        <section className="w-full max-w-md rounded-3xl border border-border/70 bg-card p-6 text-center shadow-sm">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <h1 className="mt-4 text-lg font-extrabold">Ilovani ochishda xatolik yuz berdi</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Oq ekran o‘rniga xavfsiz tiklash oynasi ko‘rsatildi. Sahifani qayta yuklab ko‘ring.
          </p>
          <Button type="button" className="mt-5 w-full rounded-xl" onClick={this.reload}>
            <RotateCcw className="mr-2 h-4 w-4" />
            Qayta yuklash
          </Button>
        </section>
      </main>
    );
  }
}
