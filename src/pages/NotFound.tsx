import { Link, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { ArrowLeft, ClipboardCheck, Info, LayoutDashboard, LifeBuoy } from "lucide-react";
import BrandMark from "@/components/BrandMark";
import { Button } from "@/components/ui/button";

/**
 * 404
 * ===
 * Worth designing rather than leaving as scaffolding: a mistyped or stale link
 * is the one page a visitor reaches by accident, and a bare browser-blue link
 * on grey reads as a broken site rather than a wrong turn.
 *
 * Everything here routes through <Link>. The previous <a href="/"> did a full
 * document reload, which threw away the loaded bundle and the auth session
 * refresh, so returning home took seconds instead of being instant.
 */
const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    // Dev-only: in production a mistyped URL is a visitor's normal mistake,
    // not an application error worth shipping to the console.
    if (import.meta.env.DEV) {
      console.warn("404: no route matches", location.pathname);
    }
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="px-6 py-5">
        <Link to="/" className="inline-flex" aria-label="StudyBuddy AI home">
          <BrandMark size="md" />
        </Link>
      </header>

      <main className="flex-1 flex items-center justify-center px-6 pb-16">
        <div className="w-full max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent mb-4">
            Error 404
          </p>
          <h1 className="text-4xl md:text-5xl font-bold text-foreground tracking-tight mb-4">
            This page doesn't exist.
          </h1>
          <p className="text-muted-foreground text-lg mb-10 max-w-md mx-auto">
            The link may be out of date, or the address may have a typo. Your
            progress and study data are untouched.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center mb-12">
            {/* bg-cta, not the default bg-primary: azure is this theme's link
                colour and royal blue is its action colour (see index.css). */}
            <Button asChild size="lg" className="bg-cta text-white hover:bg-cta/90 font-semibold">
              <Link to="/">
                <ArrowLeft className="h-4 w-4" />
                Back to home
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link to="/dashboard">
                <LayoutDashboard className="h-4 w-4" />
                Go to dashboard
              </Link>
            </Button>
          </div>

          <div className="border-t border-border pt-8">
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground mb-4">
              Or try one of these
            </p>
            <div className="flex flex-wrap gap-x-6 gap-y-2 justify-center text-sm">
              <Link
                to="/free-test"
                className="inline-flex items-center gap-1.5 text-primary hover:underline"
              >
                <ClipboardCheck className="h-3.5 w-3.5" />
                Free diagnostic test
              </Link>
              <Link
                to="/about"
                className="inline-flex items-center gap-1.5 text-primary hover:underline"
              >
                <Info className="h-3.5 w-3.5" />
                About StudyBuddy AI
              </Link>
              <Link
                to="/feedback"
                className="inline-flex items-center gap-1.5 text-primary hover:underline"
              >
                <LifeBuoy className="h-3.5 w-3.5" />
                Report a problem
              </Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default NotFound;
