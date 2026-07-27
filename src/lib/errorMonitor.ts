/**
 * STUDYBUDDY AI ERROR MONITOR
 * =====================
 * Zero-dependency, zero-cost production error monitoring.
 *
 * What it captures:
 *   • Uncaught exceptions        (window "error")
 *   • Unhandled promise rejects  (window "unhandledrejection")
 *   • React render crashes       (reported by ErrorBoundary)
 *   • Manual reports             (reportError() anywhere in the app)
 *
 * Where it goes:
 *   POST /api/log-error → structured JSON in Vercel function logs.
 *   View them in Vercel Dashboard → Project → Logs (filter "[CLIENT-ERROR]").
 *   No third-party service, no extra cost, nothing blocks the UI.
 *
 * Safety rails:
 *   • Dedup — the same error message is sent at most once per session
 *   • Budget — max 10 reports per session (a crash loop can't spam the API)
 *   • sendBeacon-first — reports survive page unloads; fetch keepalive fallback
 *   • Never throws — a failure to report can never cause its own error
 */

import { captureException } from "@/lib/sentry";

const MAX_REPORTS_PER_SESSION = 10;
const seenErrors = new Set<string>();
let reportCount = 0;
let initialized = false;

interface ErrorReport {
  message: string;
  stack?: string;
  source: "window.error" | "unhandledrejection" | "react.boundary" | "manual";
  context?: string;
  url: string;
  userAgent: string;
  timestamp: string;
}

function send(report: ErrorReport): void {
  try {
    const payload = JSON.stringify(report);
    if (navigator.sendBeacon) {
      navigator.sendBeacon("/api/log-error", new Blob([payload], { type: "application/json" }));
    } else {
      fetch("/api/log-error", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
        keepalive: true,
      }).catch(() => { /* never let reporting cause errors */ });
    }
  } catch { /* never let reporting cause errors */ }
}

/**
 * Report an error to the monitoring pipeline.
 * Safe to call from anywhere — dedupes, budgets, and never throws.
 */
export function reportError(
  error: unknown,
  source: ErrorReport["source"] = "manual",
  context?: string
): void {
  try {
    if (reportCount >= MAX_REPORTS_PER_SESSION) return;

    const err = error instanceof Error ? error : new Error(String(error));
    const dedupKey = `${source}:${err.message}`;
    if (seenErrors.has(dedupKey)) return;
    seenErrors.add(dedupKey);
    reportCount++;

    send({
      message: err.message.slice(0, 500),
      stack: err.stack?.slice(0, 2000),
      source,
      context: context?.slice(0, 300),
      url: window.location.pathname,
      userAgent: navigator.userAgent.slice(0, 200),
      timestamp: new Date().toISOString(),
    });

    // Also forward to Sentry when configured (no-op otherwise).
    captureException(err, { source, context });
  } catch { /* never let reporting cause errors */ }
}

/**
 * Install global listeners. Call once from main.tsx.
 * Idempotent — calling twice is a no-op.
 */
export function initErrorMonitor(): void {
  if (initialized || typeof window === "undefined") return;
  initialized = true;

  window.addEventListener("error", (event) => {
    // Ignore noisy cross-origin "Script error." with no info
    if (event.message === "Script error." && !event.filename) return;
    reportError(event.error ?? event.message, "window.error", event.filename);
  });

  window.addEventListener("unhandledrejection", (event) => {
    reportError(event.reason, "unhandledrejection");
  });
}
