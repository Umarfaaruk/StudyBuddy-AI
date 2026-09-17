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
 * THIS PAGE DOES NOT REDIRECT SIGNED-IN USERS — ON PURPOSE
 * =======================================================
 * It briefly did. A Google OAuth callback was landing on `/#` and stranding
 * signed-in users on the marketing page, so `/` was made to send anyone with a
 * session to /dashboard. That fixed the symptom and cost something real: the
 * owner and any signed-in visitor could no longer view the landing page at
 * all, which is also where the About and Features links live.
 *
 * The redirect was the wrong layer. The cause of `/#` was a redirect URL
 * missing from the Supabase allow-list, so Supabase discarded the requested
 * `${AUTH_ORIGIN}/onboarding` and fell back to the project's Site URL. That is
 * fixed in the project's Auth → URL Configuration, not here.
 *
 * What remains is the genuine oddity of a signed-in visitor being shown "Sign
 * Up Free" and "Log In". HeroSection and FinalCTA now swap those for a single
 * "Go to Dashboard", which keeps the page readable by everyone while still
 * offering the one action a signed-in visitor actually wants.
 *
 * So: if you are tempted to add a redirect here because a signed-in user
 * "shouldn't see" this page, check the allow-list first — that is almost
 * certainly the real bug.
 */
const Index = () => (
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

export default Index;
