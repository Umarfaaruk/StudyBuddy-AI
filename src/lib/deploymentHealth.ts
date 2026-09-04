/**
 * DEPLOYMENT HEALTH CHECKS
 * ========================
 * Pings the configured environments and reports a boolean per environment.
 *
 * Endpoints come from configuration, never hardcoded. A health check that only
 * knows about one hardcoded URL is useless the moment you add a staging or
 * partner environment — and it silently reports on the wrong host after a
 * domain change.
 *
 * Every check is non-fatal by construction. A failed probe is INFORMATION about
 * the environment, not a reason to block a student from onboarding, so failures
 * resolve to `false` rather than throwing.
 */

export type EnvironmentId = "app" | "government";

export interface HealthEndpoint {
  id: EnvironmentId;
  label: string;
  url: string | null;
  /** A probe that never returns must not hold the UI open indefinitely. */
  timeoutMs: number;
}

export interface HealthResult {
  id: EnvironmentId;
  label: string;
  healthy: boolean;
  /** Null when the endpoint is not configured — distinct from "unhealthy". */
  configured: boolean;
  status?: number;
  latencyMs?: number;
  error?: string;
}

const DEFAULT_TIMEOUT_MS = 5000;

/**
 * Resolve the endpoints to probe.
 *
 * The app's own health is checked against a same-origin path, which needs no
 * configuration and no CORS. The government environment is entirely
 * configuration-driven: if VITE_GOV_HEALTH_URL is unset it reports as
 * "not configured" rather than being invented or silently skipped.
 */
export function getHealthEndpoints(): HealthEndpoint[] {
  const gov = (import.meta.env.VITE_GOV_HEALTH_URL ?? "").trim();
  return [
    {
      id: "app",
      label: "StudyBuddy AI",
      url: "/api/log-error",
      timeoutMs: DEFAULT_TIMEOUT_MS,
    },
    {
      id: "government",
      label: "Government exam service",
      url: gov || null,
      timeoutMs: DEFAULT_TIMEOUT_MS,
    },
  ];
}

/**
 * Probe one endpoint.
 * Resolves to a result in every case — it never rejects.
 */
export async function probeEndpoint(endpoint: HealthEndpoint): Promise<HealthResult> {
  if (!endpoint.url) {
    return {
      id: endpoint.id,
      label: endpoint.label,
      healthy: false,
      configured: false,
      error: "No URL configured",
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), endpoint.timeoutMs);
  const startedAt = performance.now();

  try {
    const res = await fetch(endpoint.url, {
      method: "GET",
      signal: controller.signal,
      // A cached 200 from an earlier probe would report a dead host as healthy.
      cache: "no-store",
    });
    return {
      id: endpoint.id,
      label: endpoint.label,
      configured: true,
      // Any response at all proves the host is reachable and serving. A 405 or
      // 404 from a real server still means the environment is up, which is what
      // this check is actually asking.
      healthy: res.status > 0 && res.status < 500,
      status: res.status,
      latencyMs: Math.round(performance.now() - startedAt),
    };
  } catch (err) {
    const aborted = (err as Error)?.name === "AbortError";
    return {
      id: endpoint.id,
      label: endpoint.label,
      configured: true,
      healthy: false,
      latencyMs: Math.round(performance.now() - startedAt),
      error: aborted ? `Timed out after ${endpoint.timeoutMs}ms` : "Unreachable",
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Probe every configured environment in parallel.
 *
 * Parallel, not sequential: two 5-second timeouts in series would make a
 * fully-down check take ten seconds before onboarding could even render its
 * notice.
 */
export async function checkDeploymentHealth(): Promise<HealthResult[]> {
  return Promise.all(getHealthEndpoints().map(probeEndpoint));
}

/** True when every CONFIGURED environment responded. Unconfigured is not a failure. */
export function allConfiguredHealthy(results: HealthResult[]): boolean {
  return results.filter((r) => r.configured).every((r) => r.healthy);
}
