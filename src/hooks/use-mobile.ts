import * as React from "react";

const MOBILE_BREAKPOINT = 768;
export const CHAT_LAYOUT_BREAKPOINT = 1024;

function getIsMobile(breakpoint: number) {
  if (typeof window === "undefined") {
    return false;
  }

  return window.innerWidth < breakpoint;
}

export function useIsMobile(breakpoint = MOBILE_BREAKPOINT) {
  const [isMobile, setIsMobile] = React.useState(() => getIsMobile(breakpoint));

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const onChange = () => {
      setIsMobile(getIsMobile(breakpoint));
    };
    mql.addEventListener("change", onChange);
    window.addEventListener("resize", onChange);
    setIsMobile(getIsMobile(breakpoint));
    return () => {
      mql.removeEventListener("change", onChange);
      window.removeEventListener("resize", onChange);
    };
  }, [breakpoint]);

  return isMobile;
}
