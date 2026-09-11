import { createRoot } from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";
import App from "./App.tsx";
import "./index.css";
import "./styles/native-interactions.css";
import "./styles/video-watch.css";
import "./styles/video-feed.css";
import "./styles/canonical-engagement.css";
import "./styles/marketplace-create-product.css";
import "./i18n";
import { installMediaUploadFetchFallback } from "./lib/mediaUploadFetchFallback";
import { installNativeInteractionPolicy } from "./lib/nativeInteractionPolicy";
import { installMarketplaceImageRecovery } from "./lib/marketplaceImageRecovery";

// Install before React mounts so every presigned media PUT (including chat video
// notes recorded immediately after page load) gets the production CORS fallback.
installMediaUploadFetchFallback();

// Touch-first browsers otherwise surface native long-press selection/callouts
// over Alsamos controls. Editable fields remain explicitly exempt.
installNativeInteractionPolicy();

// Legacy Marketplace rails/detail surfaces can still receive expired signed
// product image URLs. Recover those URLs globally without changing the known-
// good Marketplace routing tree; modern resilient image components opt out.
installMarketplaceImageRecovery();

createRoot(document.getElementById("root")!).render(
  <HelmetProvider>
    <App />
  </HelmetProvider>
);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.error('Service worker registration failed:', err);
    });
  });
}
