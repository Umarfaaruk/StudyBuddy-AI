import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useEffect } from "react";

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  const location = useLocation();
  const queryClient = useQueryClient();

  // Invalidate profile cache when navigating away from onboarding
  // This ensures the onboarding_completed flag is fresh after the user finishes onboarding
  const isOnboardingPage = location.pathname.startsWith("/onboarding");
  useEffect(() => {
    // When navigating FROM onboarding TO another page, refetch profile
    if (!isOnboardingPage && user) {
      queryClient.invalidateQueries({ queryKey: ["profile-onboarding-check", user.uid] });
    }
  }, [isOnboardingPage, user, queryClient]);

  // Check if user has completed onboarding
  const { data: profile, isLoading: profileLoading, isError } = useQuery({
    queryKey: ["profile-onboarding-check", user?.uid],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select("onboarding_completed")
        .eq("id", user.uid)
        .maybeSingle();
      if (error) throw error;
      return data ?? null;
    },
    enabled: !!user,
    staleTime: 1000 * 30, // Cache for 30 seconds — short enough to catch post-onboarding writes
    retry: 1,
    refetchOnWindowFocus: true,
  });

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
