import { useState } from "react";
import { ShieldCheck, Loader2, LogIn, Eye, EyeOff, AlertTriangle, Copy, CheckCheck } from "lucide-react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

const AdminLogin = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [debugUid, setDebugUid] = useState("");
  const [copied, setCopied] = useState(false);

  // If user is already logged in, check admin status immediately
  const [checkingExisting, setCheckingExisting] = useState(false);

  const checkAdminAndRedirect = async (uid: string) => {
    // Check users collection
    try {
      const userDoc = await getDoc(doc(db, "users", uid));
      const userData = userDoc.data();
      if (userData?.is_admin === true || userData?.role === "admin") {
        navigate("/admin", { replace: true });
        return true;
      }
    } catch (err) {
      console.warn("Could not read users collection:", err);
    }

    // Check profiles collection
    try {
      const profileDoc = await getDoc(doc(db, "profiles", uid));
      const profileData = profileDoc.data();
      if (profileData?.is_admin === true || profileData?.role === "admin") {
        navigate("/admin", { replace: true });
        return true;
      }
    } catch (err) {
      console.warn("Could not read profiles collection:", err);
    }

    return false;
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setDebugUid("");

    try {
      const credential = await signInWithEmailAndPassword(auth, email, password);
      const uid = credential.user.uid;
      setDebugUid(uid);

      const isAdmin = await checkAdminAndRedirect(uid);
      if (!isAdmin) {
        setError(
          `Login successful, but this account does not have admin privileges. Your UID is shown below — use it as the Document ID in the "users" collection in Firebase Console.`
        );
      }
    } catch (err: any) {
      if (err.code === "auth/user-not-found" || err.code === "auth/wrong-password" || err.code === "auth/invalid-credential") {
        setError("Invalid email or password.");
      } else if (err.code === "auth/too-many-requests") {
        setError("Too many failed attempts. Please try again later.");
      } else {
        setError(err.message || "Login failed. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCheckExisting = async () => {
    if (!user) return;
    setCheckingExisting(true);
    setDebugUid(user.uid);
    const isAdmin = await checkAdminAndRedirect(user.uid);
    if (!isAdmin) {
      setError(
        `Your current account does not have admin privileges. Your UID is shown below — use it as the Document ID in the "users" collection in Firebase Console.`
      );
    }
    setCheckingExisting(false);
  };

  const copyUid = () => {
    navigator.clipboard.writeText(debugUid);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-[#0B0F1A] flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background effects */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#29ABE2]/8 rounded-full blur-[120px]" />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-purple-600/6 rounded-full blur-[100px]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-[#29ABE2]/4 rounded-full blur-[150px]" />
      </div>

      {/* Grid pattern overlay */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.03]"
        style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
          backgroundSize: "60px 60px",
        }}
      />

      <div className="relative w-full max-w-md">
        {/* Logo & Title */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-gradient-to-br from-[#29ABE2] to-[#3FB0E8] shadow-xl shadow-[#29ABE2]/25 mb-5">
            <ShieldCheck className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Admin Access</h1>
          <p className="text-sm text-white/40 mt-1.5">Sign in with your admin credentials</p>
        </div>

        {/* Login Card */}
        <div className="bg-white/[0.05] backdrop-blur-xl border border-white/[0.08] rounded-2xl p-6 md:p-8 shadow-2xl">
          {/* Already logged in — quick check */}
          {user && (
            <div className="mb-6 p-4 rounded-xl bg-white/[0.04] border border-white/[0.06]">
              <p className="text-sm text-white/60 mb-3">
                You're logged in as <span className="text-white font-semibold">{user.email}</span>
              </p>
              <button
                onClick={handleCheckExisting}
                disabled={checkingExisting}
                className="w-full h-10 bg-white/10 hover:bg-white/15 text-white text-sm font-semibold rounded-xl transition-all flex items-center justify-center gap-2"
              >
                {checkingExisting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ShieldCheck className="h-4 w-4" />
                )}
                Check Admin Access
              </button>
              <div className="mt-3 border-t border-white/[0.06] pt-3">
                <p className="text-[11px] text-white/30 text-center">Or sign in with a different account below</p>
              </div>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            {/* Email */}
            <div>
              <label className="block text-xs font-semibold text-white/40 uppercase tracking-wider mb-2">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@example.com"
                required
                className="w-full h-12 px-4 bg-white/[0.06] border border-white/[0.08] rounded-xl text-sm text-white placeholder:text-white/20 outline-none focus:border-[#29ABE2]/50 focus:ring-2 focus:ring-[#29ABE2]/20 transition-all"
              />
            </div>

            {/* Password */}
            <div>
              <label className="block text-xs font-semibold text-white/40 uppercase tracking-wider mb-2">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full h-12 px-4 pr-12 bg-white/[0.06] border border-white/[0.08] rounded-xl text-sm text-white placeholder:text-white/20 outline-none focus:border-[#29ABE2]/50 focus:ring-2 focus:ring-[#29ABE2]/20 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 flex items-start gap-2.5">
                <AlertTriangle className="h-4 w-4 text-red-400 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-red-300/90 leading-relaxed">{error}</p>
              </div>
            )}

            {/* UID Display */}
            {debugUid && (
              <div className="p-3.5 rounded-xl bg-[#29ABE2]/10 border border-[#29ABE2]/20">
                <p className="text-[10px] font-bold uppercase tracking-wider text-[#7CC9EF] mb-1.5">Your Firebase UID</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-xs text-white bg-black/30 rounded-lg px-3 py-2 font-mono break-all select-all">
                    {debugUid}
                  </code>
                  <button
                    type="button"
                    onClick={copyUid}
                    className="flex-shrink-0 h-8 w-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
                  >
                    {copied ? (
                      <CheckCheck className="h-3.5 w-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="h-3.5 w-3.5 text-white/50" />
                    )}
                  </button>
                </div>
                <p className="text-[10px] text-white/30 mt-2 leading-relaxed">
                  Use this UID as the Document ID in Firestore → <code className="text-white/50">users</code> collection, then set <code className="text-white/50">is_admin: true</code>
                </p>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full h-12 bg-gradient-to-r from-[#29ABE2] to-[#3FB0E8] hover:from-[#1A7BA8] hover:to-[#1E96CC] text-white text-sm font-bold rounded-xl transition-all shadow-lg shadow-[#29ABE2]/25 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <LogIn className="h-4 w-4" />
              )}
              {loading ? "Verifying..." : "Sign In as Admin"}
            </button>
          </form>

          {/* Back link */}
          <div className="mt-6 text-center">
            <button
              onClick={() => navigate("/")}
              className="text-xs text-white/30 hover:text-white/60 transition-colors"
            >
              ← Back to app
            </button>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-[10px] text-white/15 mt-6">
          Restricted access · Authorized personnel only
        </p>
      </div>
    </div>
  );
};

export default AdminLogin;
