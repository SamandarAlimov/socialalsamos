import * as React from 'react';

type AIWorkspaceLayout = {
  isMobile: boolean;
  isCompact: boolean;
  sidebarOverlay: boolean;
  artifactOverlay: boolean;
};

const MOBILE_BREAKPOINT = 768;
const ARTIFACT_DOCK_BREAKPOINT = 1600;

function readLayout(): AIWorkspaceLayout {
  if (typeof window === 'undefined') {
    return {
      isMobile: false,
      isCompact: false,
      sidebarOverlay: false,
      artifactOverlay: false,
    };
  }

  const width = window.innerWidth;
  return {
    isMobile: width < MOBILE_BREAKPOINT,
    isCompact: width < 1200,
    sidebarOverlay: width < MOBILE_BREAKPOINT,
    artifactOverlay: width < ARTIFACT_DOCK_BREAKPOINT,
  };
}

/**
 * AI workspace-specific responsive contract.
 *
 * The shared platform sidebar remains controlled by AppLayout. The AI sidebar
 * overlays only on phones; tablet and desktop widths keep a docked rail so a
 * collapsed sidebar still leaves navigation icons visible. The artifact canvas
 * remains an overlay on ordinary laptop/tablet widths so chat keeps usable room.
 */
export function useAIWorkspaceLayout(): AIWorkspaceLayout {
  const [layout, setLayout] = React.useState<AIWorkspaceLayout>(readLayout);

  React.useEffect(() => {
    const onResize = () => setLayout(readLayout());
    onResize();
    window.addEventListener('resize', onResize, { passive: true });
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return layout;
}
