import { Component, type ErrorInfo, type ReactNode } from 'react';

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  error: Error | null;
}

/**
 * Last-resort UI boundary for render/lifecycle failures.
 *
 * Keep this component dependency-light: if the application UI bundle itself is
 * what failed, the recovery screen must not depend on that same component tree.
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
      <main
        style={{
          minHeight: '100vh',
          minHeight: '100dvh',
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxSizing: 'border-box',
          padding: 20,
          background: '#ffffff',
          color: '#111827',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        }}
      >
        <section
          style={{
            width: '100%',
            maxWidth: 420,
            border: '1px solid #e5e7eb',
            borderRadius: 24,
            padding: 24,
            textAlign: 'center',
            background: '#ffffff',
            boxSizing: 'border-box',
          }}
        >
          <div style={{ fontSize: 30, lineHeight: 1 }}>!</div>
          <h1 style={{ margin: '14px 0 0', fontSize: 19, lineHeight: 1.35 }}>
            Ilovani ochishda xatolik yuz berdi
          </h1>
          <p style={{ margin: '10px 0 0', fontSize: 14, lineHeight: 1.6, color: '#6b7280' }}>
            Oq ekran o‘rniga xavfsiz tiklash oynasi ko‘rsatildi. Sahifani qayta yuklab ko‘ring.
          </p>
          <button
            type="button"
            onClick={this.reload}
            style={{
              width: '100%',
              minHeight: 44,
              marginTop: 20,
              border: 0,
              borderRadius: 12,
              background: '#111827',
              color: '#ffffff',
              fontSize: 14,
              fontWeight: 700,
            }}
          >
            Qayta yuklash
          </button>
        </section>
      </main>
    );
  }
}
