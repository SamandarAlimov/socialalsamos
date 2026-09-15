import { createRoot } from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";
import App from "./App.tsx";
import "./index.css";
import "./styles/native-interactions.css";
import "./styles/video-watch.css";
import "./styles/video-feed.css";
import "./styles/canonical-engagement.css";
import "./styles/marketplace-create-product.css";
import "./styles/create-camera-zoom.css";
import "./styles/create-camera-mobile-polish.css";
import "./styles/create-camera-shutter-safe.css";
import "./styles/create-camera-ios-canvas.css";
import "./styles/video-comments-preview-tap-dismiss.css";
import "./i18n";
import { installMediaUploadFetchFallback } from "./lib/mediaUploadFetchFallback";
import { installNativeInteractionPolicy } from "./lib/nativeInteractionPolicy";
import { installMobileChatKeyboardLayout } from "./lib/mobileChatKeyboardLayout";
import { installCreateCameraZoom } from "./lib/createCameraZoom";
import { installIosCameraCanvasPreview } from "./lib/iosCameraCanvasPreview";
import { installVideoCommentsPreviewTapDismiss } from "./lib/videoCommentsPreviewTapDismiss";

// Install before React mounts so every presigned media PUT (including chat video
// notes recorded immediately after page load) gets the production CORS fallback.
installMediaUploadFetchFallback();

// Touch-first browsers otherwise surface native long-press selection/callouts
// over Alsamos controls. Editable fields remain explicitly exempt.
installNativeInteractionPolicy();

// iOS/Android klaviaturasi ochilganda faqat chatning ko'rinadigan maydonini
// visual viewportga moslaydi: header joyida qoladi, composer klaviatura ustiga chiqadi.
installMobileChatKeyboardLayout();

// Create Live can move its active camera into a document-level fullscreen portal.
// Keep pinch/wheel zoom working there as well as inside the normal Create stage.
installCreateCameraZoom();

// iOS/WebKit must not combine hardware-backed camera video, CSS filters and
// mix-blend overlays. Reuse the capture Canvas2D lens renderer for live filtered
// previews so Story/Reel stay WYSIWYG without Safari compositor artifacts.
installIosCameraCanvasPreview();

// Instagram-style Reel comments use the compact video as an exit target. Capture
// that tap before the underlying player can interpret it as play/pause or hold.
installVideoCommentsPreviewTapDismiss();

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
