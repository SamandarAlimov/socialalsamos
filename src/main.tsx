import { createRoot } from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";
import App from "./App.tsx";
import "./index.css";
import "./styles/native-interactions.css";
import "./styles/video-watch.css";
import "./styles/video-autoplay-toggle.css";
import "./styles/video-feed.css";
import "./styles/canonical-engagement.css";
import "./styles/marketplace-create-product.css";
import "./styles/create-camera-zoom.css";
import "./styles/create-camera-mobile-polish.css";
import "./styles/create-camera-shutter-safe.css";
import "./styles/create-camera-ios-canvas.css";
import "./styles/video-comments-preview-tap-dismiss.css";
import "./styles/video-comments-preview-sheet-sync.css";
import "./i18n";
import {
  installAuthSessionResumeRecovery,
  recoverAuthSessionBeforeMount,
} from "./lib/bootstrapAuthSession";
import { installMediaUploadFetchFallback } from "./lib/mediaUploadFetchFallback";
import { installNativeInteractionPolicy } from "./lib/nativeInteractionPolicy";
import { installMobileChatKeyboardLayout } from "./lib/mobileChatKeyboardLayout";
import { installCreateCameraZoom } from "./lib/createCameraZoom";
import { installIosCameraCanvasPreview } from "./lib/iosCameraCanvasPreview";
import { installCreateImmersiveStatusBar } from "./lib/createImmersiveStatusBar";
import { installVideoCommentsPreviewTapDismiss } from "./lib/videoCommentsPreviewTapDismiss";
import { installVideoCommentsPreviewSheetSync } from "./lib/videoCommentsPreviewSheetSync";

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

// Make Story/Reel/Live/Post camera surfaces edge-to-edge at the system status bar
// when the host browser supports it, with a dark system-chrome fallback elsewhere.
installCreateImmersiveStatusBar();

// iOS/WebKit must not combine hardware-backed camera video, CSS filters and
// mix-blend overlays. Reuse the capture Canvas2D lens renderer for live filtered
// previews so Story/Reel stay WYSIWYG without Safari compositor artifacts.
installIosCameraCanvasPreview();

// Instagram-style Reel comments use the compact video as an exit target. Capture
// that tap before the underlying player can interpret it as play/pause or hold.
installVideoCommentsPreviewTapDismiss();

// A compact comments sheet dismisses with transform while its logical top stays
// fixed. Follow the sheet's actual composited edge so the Reel grows/moves with
// the finger instead of freezing above a moving panel.
installVideoCommentsPreviewSheetSync();

const root = createRoot(document.getElementById("root")!);

async function mountApp() {
  // A suspended browser can resume with an expired access JWT. Recover it before
  // authenticated hooks mount, otherwise every initial PostgREST request races
  // with token refresh and the app can appear completely empty.
  await recoverAuthSessionBeforeMount();

  // Keep recovering on focus/pageshow/online after mount as well. This is not
  // tied to any OS: mobile and desktop browsers can all suspend refresh timers.
  installAuthSessionResumeRecovery();

  root.render(
    <HelmetProvider>
      <App />
    </HelmetProvider>
  );
}

void mountApp();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.error('Service worker registration failed:', err);
    });
  });
}
