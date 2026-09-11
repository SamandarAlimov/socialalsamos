import { createRoot } from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";
import { AppErrorBoundary } from "./components/AppErrorBoundary.tsx";
import "./index.css";
import "./styles/native-interactions.css";
import "./styles/video-watch.css";
import "./styles/video-feed.css";
import "./styles/canonical-engagement.css";
import "./styles/marketplace-create-product.css";
import "./i18n";
import { installMediaUploadFetchFallback } from "./lib/mediaUploadFetchFallback";
import { installNativeInteractionPolicy } from "./lib/nativeInteractionPolicy";

function safeInstall(label: string, install: () => void) {
  try {
    install();
  } catch (error) {
    // Non-critical browser enhancements must never prevent React from mounting.
    console.warn(`[alsamos] ${label} initialization failed`, error);
  }
}

function BootFailure() {
  return (
    <main
      style={{
        minHeight: '100vh',
        height: '100dvh',
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
          Alsamos yuklanmadi
        </h1>
        <p style={{ margin: '10px 0 0', fontSize: 14, lineHeight: 1.6, color: '#6b7280' }}>
          Ilova modullaridan biri ishga tushmadi. Qayta yuklash xavfsiz va hisobingizdagi ma’lumotlarni o‘chirmaydi.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
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

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error('[alsamos] #root element was not found');
}

const root = createRoot(rootElement);

async function bootstrap() {
  // These are progressive enhancements. A browser-specific incompatibility in
  // either installer must not take down the whole application.
  safeInstall('media upload fallback', installMediaUploadFetchFallback);
  safeInstall('native interaction policy', installNativeInteractionPolicy);

  try {
    // Load the application behind an explicit bootstrap boundary. Any module-
    // evaluation failure (env/config, browser API, circular dependency, stale
    // chunk) now produces a visible recovery screen instead of an empty PWA.
    const { default: App } = await import("./App.tsx");

    root.render(
      <HelmetProvider>
        <AppErrorBoundary>
          <App />
        </AppErrorBoundary>
      </HelmetProvider>
    );
  } catch (error) {
    console.error('[alsamos] Application bootstrap failed', error);
    root.render(<BootFailure />);
  }
}

void bootstrap();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.error('Service worker registration failed:', err);
    });
  });
}
