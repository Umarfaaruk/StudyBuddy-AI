import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useProfile } from "@/hooks/useProfile";

/**
 * The route guard reads the profile through the shared useProfile() hook rather
 * than issuing its own query. It used to own a separate
 * ["profile-onboarding-check", uid] key, which meant this BLOCKING read could
 * not be served from — or serve — the cache that the sidebar, admin gate and
 * dashboard were filling with the very same row. See src/hooks/useProfile.ts.
 *
 * The explicit cache invalidation that used to live here is gone too: the hook's
 * 30 s staleTime plus the invalidation both onboarding flows already fire on
 * ["profile", uid] cover the post-onboarding refresh, and the old effect ran on
 * every navigation away from /onboarding whether or not anything had changed.
 */
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  const location = useLocation();

  const isOnboardingPage = location.pathname.startsWith("/onboarding");
  const { data: profile, isLoading: profileLoading, isError } = useProfile();

  if (loading || (user && profileLoading)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="space-y-3 text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent mx-auto" />
          <p className="text-sm text-muted-foreground">Loading…</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // If the profile read failed (RLS, offline, etc.)
  // let the user through rather than blocking them entirely.
  // The onboarding page itself will handle re-checking.
  if (isError) {
    return <>{children}</>;
  }

  // Redirect to onboarding if profile doesn't exist or onboarding not completed
  // (skip if already on the onboarding page to avoid redirect loop)
  if (!isOnboardingPage && (!profile || !profile.onboarding_completed)) {
    return <Navigate to="/onboarding" replace />;
  }

  // Redirect to dashboard if already completed onboarding and trying to visit onboarding page
  if (isOnboardingPage && profile?.onboarding_completed) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
