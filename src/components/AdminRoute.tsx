import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";
import { useProfile } from "@/hooks/useProfile";

/**
 * The admin role lives on profiles.role, so this gate reads the shared profile
 * row (see src/hooks/useProfile.ts) instead of issuing its own
 * ["admin-check", uid] query. By the time any admin route renders,
 * ProtectedRoute has already put that row in the cache, so this costs nothing.
 */
const AdminRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  const { data: profile, isLoading: checkingRole, isError } = useProfile();

  if (loading || (user && checkingRole)) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="space-y-4 text-center">
          <Loader2 className="h-6 w-6 animate-spin text-[#29ABE2] mx-auto" />
          <p className="text-sm text-gray-400 font-medium">Verifying admin access...</p>
        </div>
      </div>
    );
  }

  // Fail closed. Unlike ProtectedRoute — which lets a user through on a failed
  // read because the cost is only a redirect — an unreadable role here must
  // deny access rather than grant it.
  if (!user || isError || profile?.role !== "admin") {
    return <Navigate to="/admin-login" replace />;
  }

  return <>{children}</>;
};

export default AdminRoute;
