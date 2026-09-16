import { useEffect, useState } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

/**
 * Whether the visitor has asked their OS for reduced motion.
 *
 * index.css already neutralises CSS animations and transitions under this
 * media query, but the landing page's text effects are driven by JS timers and
 * GSAP, which no stylesheet can reach. A headline that types itself out one
 * character at a time is exactly the kind of motion this setting is meant to
 * stop, so the components that own those effects read this and render their
 * finished state instead.
 *
 * Re-reads on change, so toggling the OS setting takes effect without a
 * reload. Defaults to false during SSR/prerender, where matchMedia is absent.
 */
export function usePrefersReducedMotion(): boolean {
  const [prefersReduced, setPrefersReduced] = useState(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia(QUERY).matches;
  });

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia(QUERY);
    const onChange = (e: MediaQueryListEvent) => setPrefersReduced(e.matches);
    setPrefersReduced(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return prefersReduced;
}

export default usePrefersReducedMotion;
