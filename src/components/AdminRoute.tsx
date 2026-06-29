import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { Loader2 } from "lucide-react";
// useQuery caches the admin check for 5 minutes so navigating between admin
// routes reuses the cached result instead of re-querying every time.
import { useQuery } from "@tanstack/react-query";

const AdminRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();

  const { data: isAdmin, isLoading: checkingRole } = useQuery({
    queryKey: ["admin-check", user?.uid],
    queryFn: async () => {
      if (!user) return false;
      // Admin role lives in profiles.role (the `users` collection was merged
      // into profiles during the Supabase migration).
      try {
        const { data } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.uid)
          .maybeSingle();
        return data?.role === "admin";
      } catch (err) {
        console.warn("Could not read profile role:", err);
        return false;
      }
    },
    enabled: !!user,
    staleTime: 1000 * 60 * 5, // Cache for 5 minutes — admin status rarely changes
    gcTime: 1000 * 60 * 10,
  });

  if (loading || checkingRole) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="space-y-4 text-center">
          <Loader2 className="h-6 w-6 animate-spin text-[#29ABE2] mx-auto" />
          <p className="text-sm text-gray-400 font-medium">Verifying admin access...</p>
        </div>
      </div>
    );
  }

  if (!user || !isAdmin) {
    return <Navigate to="/admin-login" replace />;
  }

  return <>{children}</>;
};

export default AdminRoute;
