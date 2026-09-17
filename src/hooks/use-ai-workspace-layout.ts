import * as React from 'react';

type AIWorkspaceLayout = {
  isMobile: boolean;
  isCompact: boolean;
  sidebarOverlay: boolean;
  artifactOverlay: boolean;
};

const MOBILE_BREAKPOINT = 768;
const SIDEBAR_DOCK_BREAKPOINT = 1200;
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
    isCompact: width < SIDEBAR_DOCK_BREAKPOINT,
    sidebarOverlay: width < SIDEBAR_DOCK_BREAKPOINT,
    artifactOverlay: width < ARTIFACT_DOCK_BREAKPOINT,
  };
}

/**
 * AI workspace-specific responsive contract.
 *
 * The shared platform sidebar remains controlled by AppLayout. Inside the AI
 * workspace we avoid docking a second navigation rail until there is enough
 * horizontal room, and we keep the artifact canvas as an overlay on ordinary
 * laptop/tablet widths so the chat never collapses into an unusably narrow
 * column.
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
