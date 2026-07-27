/**
 * CANONICAL DOMAIN ENFORCEMENT
 * ============================
 * Optionally bounces visitors from a secondary origin (e.g. the raw
 * `*.vercel.app` deployment URL) to the custom domain, so OAuth callbacks and
 * email links always land on one origin.
 *
 * OFF BY DEFAULT — and deliberately so. A client-side redirect is a loaded gun:
 * if VITE_SITE_URL points at a domain that isn't actually serving this app
 * (not yet delegated to Vercel, still on a registrar parking page, DNS mid-
 * propagation), every single visitor is thrown off the working deployment onto
 * a dead page. That is exactly what happened before this guard existed.
 *
 * To turn it on, BOTH must be true in the production environment:
 *   VITE_SITE_URL=https://your-domain.com
 *   VITE_ENFORCE_CANONICAL_DOMAIN=true
 *
 * Only flip the second one AFTER confirming the custom domain serves the app.
 * Prefer a server-side redirect (Vercel → Settings → Domains → "Redirect to")
 * when you can: it avoids the blank flash and is better for SEO.
 */

/** The configured canonical origin, normalised (no trailing slash), or "". */
export const SITE_ORIGIN = (import.meta.env.VITE_SITE_URL ?? "")
  .trim()
  .replace(/\/+$/, "");

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "0.0.0.0", ""]);

/** True when the current page is being served from a local dev machine. */
function isLocalHost(hostname: string): boolean {
  return LOCAL_HOSTS.has(hostname) || hostname.endsWith(".local");
}

/**
 * Redirect to the canonical origin when enabled and we're somewhere else.
 *
 * @returns `true` if a redirect was started — the caller must NOT render, since
 *          the page is about to be replaced. `false` means carry on and boot.
 */
export function enforceCanonicalDomain(): boolean {
  if (import.meta.env.VITE_ENFORCE_CANONICAL_DOMAIN !== "true") return false;
  if (!SITE_ORIGIN) return false;

  let canonical: URL;
  try {
    canonical = new URL(SITE_ORIGIN);
  } catch {
    // A malformed VITE_SITE_URL must never take the site down.
    console.error(`Ignoring malformed VITE_SITE_URL: ${SITE_ORIGIN}`);
    return false;
  }

  const { origin, hostname, pathname, search, hash } = window.location;
  if (origin === canonical.origin) return false;
  if (isLocalHost(hostname)) return false;

  window.location.replace(canonical.origin + pathname + search + hash);
  return true;
}
