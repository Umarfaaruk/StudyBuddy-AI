import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import ErrorBoundary from "@/components/ErrorBoundary.tsx";
import { initErrorMonitor } from "@/lib/errorMonitor";
import { initSentry } from "@/lib/sentry";

// ── Canonical domain enforcement ──────────────────────────────────────────
// If VITE_SITE_URL is configured (production) and the user is on a different
// origin (e.g. edunox-eta.vercel.app instead of edunox.in), redirect them
// to the canonical domain. This prevents domain drift after OAuth callbacks,
// email links, or direct Vercel URL access.
const canonicalUrl = import.meta.env.VITE_SITE_URL?.replace(/\/+$/, "");
if (
  canonicalUrl &&
  window.location.origin !== canonicalUrl &&
  // Don't redirect in development (localhost / 127.0.0.1)
  !window.location.hostname.includes("localhost") &&
  !window.location.hostname.includes("127.0.0.1")
) {
  window.location.replace(
    canonicalUrl + window.location.pathname + window.location.search + window.location.hash
  );
} else {
  // Install global error monitoring before anything renders so even
  // startup crashes are captured in Vercel logs.
  initErrorMonitor();

  // Optional Sentry tracing — a no-op unless VITE_SENTRY_DSN is configured.
  void initSentry();

  createRoot(document.getElementById("root")!).render(
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}
