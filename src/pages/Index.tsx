import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

import Navbar from "@/components/landing/Navbar";
import HeroSection from "@/components/landing/HeroSection";
import FeaturesGrid from "@/components/landing/FeaturesGrid";
import StudyLoop from "@/components/landing/StudyLoop";
import AITutorSection from "@/components/landing/AITutorSection";
import GamificationSection from "@/components/landing/GamificationSection";
import ProgressSection from "@/components/landing/ProgressSection";
import Testimonials from "@/components/landing/Testimonials";
import FinalCTA from "@/components/landing/FinalCTA";
import Footer from "@/components/landing/Footer";

/**
 * A SIGNED-IN USER MUST NOT BE LEFT ON THE MARKETING PAGE
 * ======================================================
 * `/` is a public route, so nothing used to move an authenticated visitor off
 * it — they sat reading the landing copy while holding a valid session, with no
 * way forward except typing /dashboard by hand.
 *
 * That is not hypothetical. Google OAuth asks Supabase to return the user to
 * `${AUTH_ORIGIN}/onboarding` (see signInWithGoogle in AuthContext), but when
 * that URL is missing from the project's redirect allow-list Supabase discards
 * it and falls back to the Site URL — which is the bare domain. The callback
 * then lands on `/#`, and the user is stranded here.
 *
 * Sending them to /dashboard fixes both that case and the ordinary one of
 * bookmarking the root. It deliberately does NOT try to decide between
 * onboarding and the dashboard: ProtectedRoute already owns that decision and
 * will bounce anyone with `onboarding_completed: false` to /onboarding. Adding
 * a second copy of that rule here is how the two drift apart.
 *
 * WHY THE `loading` GUARD MATTERS
 * -------------------------------
 * `user` is null both when signed out and while the session is still being
 * restored. Redirecting on `!loading` only means an anonymous visitor is never
 * bounced, and — importantly for the OAuth case above — that we wait for
 * detectSessionInUrl to finish consuming the tokens from the URL fragment
 * before deciding.
 *
 * Crawlers are unaffected: they carry no session, so they get the prerendered
 * landing HTML that scripts/generate-seo.mjs emits for this route.
 */
const Index = () => {
  const { user, loading } = useAuth();

  if (!loading && user) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="min-h-screen">
      <Navbar />
      <HeroSection />
      <FeaturesGrid />
      <StudyLoop />
      <AITutorSection />
      <GamificationSection />
      <ProgressSection />
      <Testimonials />
      <FinalCTA />
      <Footer />
    </div>
  );
};

export default Index;
