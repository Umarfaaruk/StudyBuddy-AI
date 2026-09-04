import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, X } from "lucide-react";
import { useState } from "react";
import { checkDeploymentHealth, allConfiguredHealthy } from "@/lib/deploymentHealth";

/**
 * DEPLOYMENT HEALTH NOTICE
 * ========================
 * Reports environment health WITHOUT blocking onboarding.
 *
 * The requirement is explicit and worth restating in code: a failed deployment
 * check must never gate the flow. A student cannot fix an unreachable
 * government API, and refusing to let them onboard over it converts someone
 * else's outage into our lost signup. So this renders an advisory strip and
 * nothing more — no modal, no disabled button, no redirect.
 *
 * While the probe is in flight it renders a skeleton rather than an optimistic
 * "all systems normal", which would flash a claim that might be about to be
 * contradicted.
 */
const DeploymentHealthNotice = () => {
  const [dismissed, setDismissed] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["deployment-health"],
    queryFn: checkDeploymentHealth,
    staleTime: 1000 * 60 * 2,
    // A failing probe already resolves to healthy:false; a retry storm on a
    // known-down environment adds latency and no information.
    retry: false,
    refetchOnWindowFocus: false,
  });

  if (isLoading) {
    return (
      <div
        className="h-9 w-full rounded-lg bg-muted animate-pulse"
        aria-busy="true"
        aria-label="Checking environment status"
      />
    );
  }

  if (!data || dismissed || allConfiguredHealthy(data)) return null;

  const degraded = data.filter((r) => r.configured && !r.healthy);

  return (
    <div
      role="status"
      className="rounded-lg border border-cta/30 bg-cta/5 px-4 py-3 flex items-start gap-3"
    >
      <AlertTriangle className="h-4 w-4 text-cta flex-shrink-0 mt-0.5" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">
          {degraded.length === 1
            ? `${degraded[0].label} is unreachable`
            : "Some services are unreachable"}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          You can carry on — this only affects features that depend on{" "}
          {degraded.map((d) => d.label).join(" and ")}.
        </p>
      </div>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
        className="text-muted-foreground hover:text-foreground flex-shrink-0"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
};

export default DeploymentHealthNotice;
