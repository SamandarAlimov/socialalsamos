import * as React from "react";

const MOBILE_BREAKPOINT = 768;

function getIsMobile(): boolean {
  if (typeof window === "undefined") return false;
  return window.innerWidth < MOBILE_BREAKPOINT;
}

export function useIsMobile() {
  // Read the viewport synchronously on the first browser render. The previous
  // undefined -> false fallback made mobile AI routes render one desktop frame,
  // so the 280px desktop sidebar could reserve space and push project content
  // off-screen before the effect corrected the breakpoint.
  const [isMobile, setIsMobile] = React.useState<boolean>(getIsMobile);

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const onChange = () => setIsMobile(getIsMobile());

    mql.addEventListener("change", onChange);
    onChange();
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return isMobile;
}
