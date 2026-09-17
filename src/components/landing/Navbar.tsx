import { Link } from "react-router-dom";
import { Home, Sparkles, Info, ArrowRight } from "lucide-react";
import { NavBar } from "@/components/ui/tubelight-navbar";
import BrandMark from "@/components/BrandMark";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";

const navItems = [
  { name: 'Home', url: '/', icon: Home },
  { name: 'Features', url: '/#features', icon: Sparkles },
  { name: 'About Us', url: '/about', icon: Info },
];

interface NavbarProps {
  /**
   * Whether this navbar sits on a dark surface. True on the landing page,
   * whose hero is near-black; false on About, which is the light page
   * background. Both the wordmark and the nav pill need to know: rendered
   * onDark over a light page the wordmark is white-on-#F1F4F6 and effectively
   * invisible, which is how About shipped.
   */
  onDark?: boolean;
}

/**
 * AUTH BUTTONS LIVE HERE, NOT ONLY IN THE HERO
 * ============================================
 * They used to exist only in HeroSection and FinalCTA. That left no way to
 * reach log-in or sign-up from the header, so on any scroll position other
 * than the very top or very bottom there was no visible route into the app —
 * and none at all from /about, which shares this navbar.
 *
 * Signed in, the pair collapses to a single "Go to Dashboard". Asking someone
 * to "Sign Up Free" for the account they are already using is the one thing
 * that genuinely reads as broken.
 *
 * Hidden below `sm`. The pill nav is centred at the top on small screens and
 * these would collide with it; the hero CTA sits immediately below the fold
 * there and covers the same need.
 */
const Navbar = ({ onDark = true }: NavbarProps) => {
  const { user, loading } = useAuth();
  const signedIn = !loading && !!user;

  // The outline button has to read on both surfaces: white-on-transparent over
  // the near-black hero, slate-on-transparent over the light About page.
  const outlineOnSurface = onDark
    ? "border-white/15 text-white hover:bg-white/10 hover:text-white"
    : "border-slate-300 text-slate-700 hover:bg-slate-100 hover:text-slate-900";

  return (
    <>
      <nav className="absolute top-0 w-full z-40 bg-transparent border-transparent pt-0 md:pt-1 shrink-0 transition-opacity pointer-events-none flex justify-center">
        <div className="w-full max-w-7xl px-4 flex relative justify-between items-center">
          <Link to="/" className="ml-4 md:ml-8 lg:ml-12 h-16 md:h-20 shrink-0 z-10 pointer-events-auto inline-flex items-center transition-transform hover:opacity-90 active:scale-95 cursor-pointer">
            <BrandMark size="lg" onDark={onDark} />
          </Link>

          <div className="mr-4 md:mr-8 lg:mr-12 shrink-0 z-10 pointer-events-auto hidden sm:flex items-center gap-2">
            {signedIn ? (
              <Button className="bg-cta text-white hover:bg-cta/90 font-semibold text-sm h-10 px-5 rounded-xl gap-2 shadow-sm" asChild>
                <Link to="/dashboard">
                  Go to Dashboard
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            ) : (
              <>
                <Button variant="outline" className={`${outlineOnSurface} font-medium h-10 px-5 rounded-xl bg-transparent`} asChild>
                  <Link to="/login">Log In</Link>
                </Button>
                <Button className="bg-cta text-white hover:bg-cta/90 font-semibold text-sm h-10 px-5 rounded-xl gap-2 shadow-sm" asChild>
                  <Link to="/signup">
                    Sign Up Free
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* Floating tubelight navigation */}
      <NavBar items={navItems} onDark={onDark} />
    </>
  );
};

export default Navbar;
