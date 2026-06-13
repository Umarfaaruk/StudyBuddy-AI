/**
 * SENTRY ERROR TRACING (optional, scaffolded)
 * ===========================================
 * Gives engineers visual stack traces, breadcrumbs, and alerts for production
 * crashes — complementing the lightweight errorMonitor (which only ships errors
 * to Vercel logs).
 *
 * ZERO-COST UNTIL CONFIGURED:
 *   • If VITE_SENTRY_DSN is not set, initSentry() is a no-op and the @sentry/react
 *     bundle is never downloaded (it's behind a dynamic import, its own chunk).
 *   • To turn it on, set VITE_SENTRY_DSN in your env (Vercel → Project → Settings
 *     → Environment Variables) and redeploy. Nothing else to change.
 *
 * Optional tuning envs:
 *   VITE_SENTRY_TRACES_SAMPLE_RATE  (default 0.1)  — performance trace sampling
 */

type SentryModule = typeof import("@sentry/react");

let sentry: SentryModule | null = null;

/**
 * Initialize Sentry if a DSN is configured. Safe to call once at startup.
 * Resolves after the (optional) dynamic import completes.
 */
export async function initSentry(): Promise<void> {
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (!dsn) return; // not configured → stays completely inert

  try {
    sentry = await import("@sentry/react");
    const tracesSampleRate = Number(
      import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE ?? 0.1
    );
    sentry.init({
      dsn,
      environment: import.meta.env.MODE,
      integrations: [sentry.browserTracingIntegration()],
      tracesSampleRate: Number.isFinite(tracesSampleRate) ? tracesSampleRate : 0.1,
    });
  } catch {
    sentry = null; // monitoring must never break the app
  }
}

/**
 * Forward an exception to Sentry. No-op if Sentry isn't configured/initialized.
 * Wired into errorMonitor.reportError so manual + boundary reports reach Sentry.
 */
export function captureException(
  error: unknown,
  context?: Record<string, unknown>
): void {
  if (!sentry) return;
  try {
    sentry.captureException(error, context ? { extra: context } : undefined);
  } catch {
    /* never let reporting cause errors */
  }
}
