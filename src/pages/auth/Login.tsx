import { useState, useEffect, useRef } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Mail, Lock, ArrowRight, Eye, EyeOff } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { getReadableAuthError } from "@/lib/authErrors";

import BrandMark from "@/components/BrandMark";

const Login = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { signIn, signInWithGoogle, sendPasswordReset, user } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Redirect to the page the user was trying to visit, or the dashboard.
  // ProtectedRoute still sends users who haven't finished onboarding to
  // /onboarding, so returning users land on /dashboard and new-but-confirmed
  // users are routed to onboarding automatically.
  const from = (location.state as { from?: { pathname: string } })?.from?.pathname ?? "/dashboard";

  // Only true once the user has *just* logged in on this page. We deliberately
  // do NOT redirect simply because a session already exists — otherwise a user
  // who is still logged in from a previous visit would be bounced straight to
  // the dashboard the instant they open /login and never see the form.
  const justAuthed = useRef(false);

  // After an explicit login the session is set asynchronously (onAuthStateChange);
  // navigate once `user` is populated so ProtectedRoute reads a valid session.
  useEffect(() => {
    if (user && justAuthed.current) navigate(from, { replace: true });
  }, [user, from, navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    justAuthed.current = true;
    const { error } = await signIn(email, password);

    if (error) {
      justAuthed.current = false;
      setIsLoading(false);
      toast.error(getReadableAuthError(error));
      return;
    }
    // Success: the effect above navigates once the auth state updates.
  };

  const handleForgotPassword = async () => {
    const target = email.trim();
    if (!target) {
      toast.error("Enter your email above first, then click “Forgot password?”");
      return;
    }
    const { error } = await sendPasswordReset(target);
    if (error) {
      toast.error(getReadableAuthError(error));
      return;
    }
    toast.success(`Password reset link sent to ${target}. Check your inbox (and spam).`);
  };

  const handleGoogleLogin = async () => {
    // Full-page redirect to Google; on return the OAuth callback lands directly
    // on /onboarding (redirectTo), so no in-page navigation is needed here.
    const { error } = await signInWithGoogle();
    if (error) toast.error(getReadableAuthError(error));
  };

  return (
    <div className="min-h-screen bg-deep flex">
      {/* ── Left branding panel ──────────────────────────────── */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-between p-12 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-[hsl(var(--navy))] via-[hsl(var(--deep))] to-[hsl(var(--navy))]/80" />

        <div className="relative z-10">
          <Link to="/" className="flex items-center shrink-0 w-full justify-center lg:justify-start">
            <BrandMark size="xl" onDark />
          </Link>
        </div>

        {/* Hero copy */}
        <div className="relative z-10 space-y-6">
          <h1 className="text-4xl font-bold text-highlight tracking-tight leading-tight font-display">
            Welcome back to<br />smarter learning.
          </h1>
          <p className="text-soft text-lg max-w-md leading-relaxed">
            Pick up where you left off. Your AI tutor, quizzes, and study streaks are waiting.
          </p>

          {/* Feature highlights */}
          <div className="space-y-3 pt-2">
            {[
              "AI-powered tutoring on any subject",
              "Personalized quizzes & progress tracking",
              "Daily streaks to build study habits",
            ].map((t) => (
              <div key={t} className="flex items-center gap-3">
                <div className="h-5 w-5 rounded-full bg-primary/30 flex items-center justify-center flex-shrink-0">
                  <div className="h-2 w-2 rounded-full bg-highlight" />
                </div>
                <span className="text-soft text-sm">{t}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="relative z-10 text-xs text-soft">
          © 2026 StudyBuddy AI. All rights reserved.
        </div>
      </div>

      {/* ── Right form panel ─────────────────────────────────── */}
      <div className="flex-1 flex items-center justify-center p-6 bg-background">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="w-full max-w-md space-y-8"
        >

          <div className="lg:hidden flex items-center justify-center mb-8 shrink-0 w-full">
            <BrandMark size="lg" />
          </div>

          <div>
            <h2 className="text-2xl font-bold text-foreground tracking-tight">
              Log in to your account
            </h2>
            <p className="text-muted-foreground mt-2 text-sm">
              Enter your credentials to continue learning
            </p>
          </div>

          {/* Google OAuth */}
          <Button
            variant="outline"
            className="w-full h-11 gap-3 text-sm font-medium border-border"
            onClick={handleGoogleLogin}
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Continue with Google
          </Button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-3 text-muted-foreground">or</span>
            </div>
          </div>

          {/* Email/password form */}
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="you@example.com"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-10 h-11 focus-visible:ring-primary"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-foreground">Password</label>
                <button type="button" onClick={handleForgotPassword} className="text-xs text-primary hover:underline">
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="••••••••"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10 pr-10 h-11 focus-visible:ring-primary"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* ✅ StudyBuddy AI: CTA button uses Amber (#F97316) */}
            <Button
              type="submit"
              className="w-full h-11 bg-cta text-cta-foreground hover:bg-cta/90 font-semibold gap-2"
              disabled={isLoading}
            >
              {isLoading ? "Logging in…" : "Log In"}
              {!isLoading && <ArrowRight className="h-4 w-4" />}
            </Button>
          </form>

          <p className="text-center text-sm text-muted-foreground">
            Don't have an account?{" "}
            <Link to="/signup" className="text-primary font-medium hover:underline">
              Sign Up Free
            </Link>
          </p>
        </motion.div>
      </div>
    </div>
  );
};

export default Login;
