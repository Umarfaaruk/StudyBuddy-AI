import { useEffect } from "react";
import { useLocation } from "react-router-dom";

/**
 * HASH SCROLLING
 * ==============
 * React Router does not scroll to `#id` targets on its own — it updates the
 * URL and stops there. So the landing nav's "Features" link set the address to
 * /#features and left the visitor at the top of the page, looking at a nav
 * item that appeared to do nothing.
 *
 * Mounted once inside the router, this watches the hash and scrolls the
 * matching element into view. A short retry covers the case where the target
 * lives in a lazily-loaded route chunk that has not painted yet, and the
 * no-hash case restores top-of-page on normal navigations.
 */
const ScrollToHash = () => {
  const { pathname, hash } = useLocation();

  useEffect(() => {
    if (!hash) {
      window.scrollTo({ top: 0 });
      return;
    }

    const id = decodeURIComponent(hash.slice(1));
    if (!id) return;

    let frame = 0;
    let attempts = 0;

    // The element may not exist on the first frame after a route change, so
    // look again for a few frames before giving up rather than scrolling to
    // nowhere or throwing.
    const tryScroll = () => {
      const target = document.getElementById(id);
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
      if (attempts++ < 30) frame = requestAnimationFrame(tryScroll);
    };

    frame = requestAnimationFrame(tryScroll);
    return () => cancelAnimationFrame(frame);
  }, [pathname, hash]);

  return null;
};

export default ScrollToHash;
