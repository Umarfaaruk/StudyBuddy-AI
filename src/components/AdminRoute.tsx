import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Loader2 } from "lucide-react";

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
        // Check users collection
        const userDoc = await getDoc(doc(db, "users", user.uid));
        const userData = userDoc.data();
        if (userData?.role === "admin" || userData?.is_admin === true) {
          setIsAdmin(true);
          setCheckingRole(false);
          return;
        }
      } catch (err) {
        console.warn("Could not read users collection:", err);
      }

      try {
        // Fallback: check profiles collection
        const profileDoc = await getDoc(doc(db, "profiles", user.uid));
        const profileData = profileDoc.data();
        if (profileData?.role === "admin" || profileData?.is_admin === true) {
          setIsAdmin(true);
          setCheckingRole(false);
          return;
        }
      } catch (err) {
        console.warn("Could not read profiles collection:", err);
      }

      setIsAdmin(false);
      setCheckingRole(false);
    };

    checkAdminRole();
  }, [user]);

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

  // Not logged in or not admin → redirect to admin login
  if (!user || !isAdmin) {
    return <Navigate to="/admin-login" replace />;
  }

  return <>{children}</>;
};

export default AdminRoute;
