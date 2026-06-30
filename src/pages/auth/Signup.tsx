import { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Mail, Lock, User, ArrowRight, CheckCircle2, Eye, EyeOff } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { getReadableAuthError } from "@/lib/authErrors";

import eduonxLogo from "@/assets/eduonx-logo.png";
import eduonxLogoOnDark from "@/assets/eduonx-logo-on-dark.png";

const Signup = () => {
  const navigate = useNavigate();
  const { signUp, signInWithGoogle, user } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  // Only true once the user has *just* signed up here. We don't redirect merely
  // because a session already exists, so a returning logged-in user still sees
  // the form instead of being bounced straight through to onboarding/dashboard.
  const justAuthed = useRef(false);

  // After a successful signup with confirmation OFF, a session is created
  // asynchronously — navigate to onboarding once `user` is populated. With
  // confirmation ON there's no session, so this never fires and we show the
  // "confirm your email" toast below.
  useEffect(() => {
    if (user && justAuthed.current) navigate("/onboarding", { replace: true });
  }, [user, navigate]);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    if (password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    setIsLoading(true);
    justAuthed.current = true;
    const { error } = await signUp(email, password, name);
    setIsLoading(false);

    if (error) {
      justAuthed.current = false;
      toast.error(getReadableAuthError(error));
      console.error("Signup error:", error);
      return;
    }
    // If email confirmation is OFF, the session is created and the effect above
    // redirects to onboarding. If it's ON, there's no session yet — tell the
    // user to confirm via email (the confirm link returns them to /login).
    toast.success("Account created! If asked, confirm via the email we sent, then log in.");
  };

  const handleGoogleSignup = async () => {
    setIsGoogleLoading(true);
    // Full-page redirect to Google; on return the OAuth callback lands directly
    // on /onboarding (redirectTo), so no in-page navigation is needed here.
    const { error } = await signInWithGoogle();
    if (error) {
      toast.error(getReadableAuthError(error));
      setIsGoogleLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-deep flex">
      {/* ── Left branding panel ──────────────────────────────── */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-between p-12 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-[hsl(var(--navy))] via-[hsl(var(--deep))] to-[hsl(var(--navy))]/80" />

        <div className="relative z-10">
          <Link to="/" className="flex items-center shrink-0 w-full justify-center lg:justify-start">
            <img src={eduonxLogoOnDark} alt="EduOnx Logo" className="block h-[80px] w-auto max-w-[300px] object-contain" />
          </Link>
        </div>

        <div className="relative z-10 space-y-6">
          <h1 className="text-4xl font-bold text-highlight tracking-tight leading-tight font-display">
            Begin your journey<br />to smarter studying.
          </h1>
          <p className="text-soft text-lg max-w-md leading-relaxed">
            Join thousands of students using AI to learn faster, retain more, and achieve their goals.
          </p>

          <div className="space-y-3 pt-2">
            {[
              "AI-powered tutoring on any subject",
              "Personalized quizzes & progress tracking",
              "Compete with friends on leaderboards",
            ].map((t) => (
              <div key={t} className="flex items-center gap-3">
                <CheckCircle2 className="h-5 w-5 text-success flex-shrink-0" />
                <span className="text-soft text-sm">{t}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="relative z-10 text-xs text-soft">
          © 2026 EduOnx. All rights reserved.
        </div>
      </div>

      {/* ── Right form panel ─────────────────────────────────── */}
      <div className="flex-1 flex items-center justify-center p-6 bg-background">
        <div className="w-full max-w-md space-y-8">

          <div className="lg:hidden flex items-center justify-center mb-8 shrink-0 w-full">
            <img src={eduonxLogo} alt="EduOnx Logo" className="block h-[60px] w-auto max-w-[200px] object-contain" />
          </div>

          <div>
            <h2 className="text-2xl font-bold text-foreground tracking-tight">
              Create your account
            </h2>
            <p className="text-muted-foreground mt-2 text-sm">
              Start learning smarter in under a minute
            </p>
          </div>

          <Button
            variant="outline"
            className="w-full h-11 gap-3 text-sm font-medium border-border"
            onClick={handleGoogleSignup}
            disabled={isGoogleLoading}
          >
            {isGoogleLoading ? (
              <span className="h-4 w-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg className="h-4 w-4" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
            )}
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

          <form onSubmit={handleSignup} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Full Name</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="John Doe"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="pl-10 h-11 focus-visible:ring-primary"
                  required
                />
              </div>
            </div>

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
              <label className="text-sm font-medium text-foreground">Password</label>
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

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Confirm Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="••••••••"
                  type={showConfirmPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="pl-10 pr-10 h-11 focus-visible:ring-primary"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              className="w-full h-11 bg-cta text-cta-foreground hover:bg-cta/90 font-semibold gap-2"
              disabled={isLoading}
            >
              {isLoading ? "Creating account…" : "Create Account"}
              {!isLoading && <ArrowRight className="h-4 w-4" />}
            </Button>
          </form>

          <p className="text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link to="/login" className="text-primary font-medium hover:underline">Log In</Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Signup;
