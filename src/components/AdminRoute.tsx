import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Loader2 } from "lucide-react";
// FIX Bug 19: Replaced raw useState/useEffect with useQuery so React Query
// caches the admin check for 5 minutes. Previously, every navigation to any
// admin route fired two fresh getDoc calls. Now the same cached result is
// reused across navigations — Firestore reads cut from N per session to 2.
import { useQuery } from "@tanstack/react-query";

const AdminRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();

  const { data: isAdmin, isLoading: checkingRole } = useQuery({
    queryKey: ["admin-check", user?.uid],
    queryFn: async () => {
      if (!user) return false;

      try {
        const userDoc = await getDoc(doc(db, "users", user.uid));
        const userData = userDoc.data();
        if (userData?.role === "admin" || userData?.is_admin === true) return true;
      } catch (err) {
        console.warn("Could not read users collection:", err);
      }

      try {
        const profileDoc = await getDoc(doc(db, "profiles", user.uid));
        const profileData = profileDoc.data();
        if (profileData?.role === "admin" || profileData?.is_admin === true) return true;
      } catch (err) {
        console.warn("Could not read profiles collection:", err);
      }

      return false;
    },
    enabled: !!user,
    staleTime: 1000 * 60 * 5, // Cache for 5 minutes — admin status rarely changes
    gcTime: 1000 * 60 * 10,
  });

  if (loading || checkingRole) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="space-y-4 text-center">
          <Loader2 className="h-6 w-6 animate-spin text-[#1D4ED8] mx-auto" />
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
