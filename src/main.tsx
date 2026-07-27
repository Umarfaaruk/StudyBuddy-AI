import { createRoot } from "react-dom/client";
import "./index.css";
import { initErrorMonitor } from "@/lib/errorMonitor";
import { initSentry } from "@/lib/sentry";
import { enforceCanonicalDomain } from "@/lib/canonicalDomain";
import { renderBootFailure } from "@/lib/bootFailure";
import { clearLegacyStorage } from "@/lib/legacyStorage";

/**
 * APP BOOTSTRAP
 * =============
 * Ordering here is load-bearing:
 *
 *  1. Canonical-domain check runs FIRST, and the App graph is pulled in with a
 *     dynamic import below rather than a static one. Static imports are hoisted
 *     and evaluated before any statement in this file, so a module that throws
 *     during evaluation would pre-empt the redirect (and everything else).
 *
 *  2. Error monitoring is installed BEFORE the app loads, so a crash during
 *     startup is still captured rather than lost.
 *
 *  3. Loading and rendering happen inside try/catch. If the app cannot start,
 *     we paint an explanatory screen instead of leaving `#root` empty — a blank
 *     page tells the user nothing and tells us nothing.
 */

async function bootstrap(): Promise<void> {
  try {
    const [{ default: App }, { default: ErrorBoundary }, supabaseModule] =
      await Promise.all([
        import("./App.tsx"),
        import("@/components/ErrorBoundary.tsx"),
        import("@/lib/supabase"),
      ]);

    // A build shipped without Supabase credentials can render pixels but no
    // feature works: no login, no signup, no data. Say so plainly rather than
    // letting every interaction fail silently.
    if (!supabaseModule.isSupabaseConfigured) {
      renderBootFailure(
        new Error(
          `Missing: ${supabaseModule.missingSupabaseEnvVars.join(", ")}`
        ),
        "This deployment is missing its backend configuration. Set the variables below in Vercel → Settings → Environment Variables, then redeploy."
      );
      return;
    }

    createRoot(document.getElementById("root")!).render(
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    );
  } catch (error) {
    renderBootFailure(error);
  }
}

if (!enforceCanonicalDomain()) {
  initErrorMonitor();

  // Drop `eduonx_*` keys left behind by the pre-rebrand build.
  clearLegacyStorage();

  // Optional Sentry tracing — a no-op unless VITE_SENTRY_DSN is configured.
  void initSentry();

  void bootstrap();
}
