import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { ShieldCheck, Loader2 } from "lucide-react";

const AdminRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [checkingRole, setCheckingRole] = useState(true);

  useEffect(() => {
    const checkAdminRole = async () => {
      if (!user) {
        setCheckingRole(false);
        return;
      }

      try {
        // Check both 'users' and 'profiles' collections for admin flag
        const userDoc = await getDoc(doc(db, "users", user.uid));
        const userData = userDoc.data();

        if (userData?.role === "admin" || userData?.is_admin === true) {
          setIsAdmin(true);
          setCheckingRole(false);
          return;
        }

        // Fallback: check profiles collection
        const profileDoc = await getDoc(doc(db, "profiles", user.uid));
        const profileData = profileDoc.data();

        if (profileData?.role === "admin" || profileData?.is_admin === true) {
          setIsAdmin(true);
          setCheckingRole(false);
          return;
        }

        setIsAdmin(false);
      } catch (error) {
        console.error("Error checking admin role:", error);
        // If permission error reading users collection, try profiles
        try {
          const profileDoc = await getDoc(doc(db, "profiles", user.uid));
          const profileData = profileDoc.data();
          setIsAdmin(profileData?.role === "admin" || profileData?.is_admin === true);
        } catch {
          setIsAdmin(false);
        }
      } finally {
        setCheckingRole(false);
      }
    };

    checkAdminRole();
  }, [user]);

  if (loading || checkingRole) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="space-y-4 text-center">
          <div className="h-12 w-12 rounded-xl bg-[#1D4ED8]/10 flex items-center justify-center mx-auto">
            <Loader2 className="h-6 w-6 animate-spin text-[#1D4ED8]" />
          </div>
          <p className="text-sm text-gray-400 font-medium">Verifying admin access...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!isAdmin) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="space-y-4 text-center max-w-sm mx-auto px-6">
          <div className="h-14 w-14 rounded-2xl bg-red-50 flex items-center justify-center mx-auto">
            <ShieldCheck className="h-7 w-7 text-red-400" />
          </div>
          <div>
            <p className="text-lg font-bold text-gray-900">Access Denied</p>
            <p className="text-sm text-gray-400 mt-1">
              You don't have admin privileges. Contact your administrator to request access.
            </p>
          </div>
          <button
            onClick={() => window.history.back()}
            className="mt-2 inline-flex items-center gap-2 px-5 py-2.5 bg-[#0F172A] text-white text-sm font-semibold rounded-xl hover:bg-[#1e293b] transition-colors shadow-md"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

export default AdminRoute;
