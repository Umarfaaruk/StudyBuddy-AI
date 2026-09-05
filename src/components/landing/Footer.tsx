import { Link } from "react-router-dom";
import { BackgroundPaths } from "@/components/ui/background-paths";
import BrandMark from "@/components/BrandMark";

// FIX Bug 12: All footer links were plain <span> tags with cursor-pointer that
// did nothing when clicked. Privacy Policy and Terms of Service especially must
// be real links (legal risk). Platform/Feature links now route to the relevant
// app pages. Legal links point to dedicated pages — create /privacy and /terms
// routes, or swap the `to` values for external URLs if you host them elsewhere.
// A route audit found /about, /free-test and /most-improved had no inbound
// link anywhere in the app, despite /about and /most-improved being prerendered
// into sitemap.xml. They were reachable only by typing the URL, and
// /most-improved is the social-proof page.
//
// NOTE: /privacy and /terms are still listed below and BOTH 404 - the routes
// were never created. They are deliberately left in place rather than silently
// deleted, because removing a privacy policy link is a legal decision, not a
// tidy-up. Either add the pages or drop these two entries.
const footerLinks: Record<string, { label: string; to: string }[]> = {
  Prepare: [
    { label: "Free diagnostic test", to: "/free-test" },
    { label: "Mock tests", to: "/mock" },
    { label: "Progress Tracker", to: "/progress" },
    { label: "AI Tutor", to: "/materials/tutor" },
  ],
  Features: [
    { label: "Document Learning", to: "/materials" },
    { label: "Streaks & XP", to: "/achievements" },
    { label: "Leaderboards", to: "/leaderboard" },
    { label: "Study Timer", to: "/timer" },
  ],
  Company: [
    { label: "About", to: "/about" },
    { label: "Most improved students", to: "/most-improved" },
    { label: "Send feedback", to: "/feedback" },
  ],
  Legal: [
    { label: "Privacy Policy", to: "/privacy" },
    { label: "Terms of Service", to: "/terms" },
  ],
};

const Footer = () => (
  <footer className="bg-[#0B0F19] text-white border-t border-white/[0.06] relative overflow-hidden">
    {/* Background Paths decoration */}
    <div className="absolute inset-0 opacity-20 pointer-events-none">
      <BackgroundPaths />
    </div>

    <div className="container relative max-w-7xl mx-auto px-4 py-16">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
        {/* Brand */}
        <div className="col-span-2 md:col-span-1">
          <Link to="/" className="flex items-center mb-4 w-max shrink-0 max-w-full">
            <BrandMark size="xl" onDark />
          </Link>
          <p className="text-xs text-slate-400 leading-relaxed">
            AI-powered learning platform for smarter studying.
          </p>
        </div>

        {/* Link columns */}
        {Object.entries(footerLinks).map(([title, links]) => (
          <div key={title}>
            <h4 className="text-xs font-bold uppercase tracking-widest text-slate-200 mb-4">{title}</h4>
            <ul className="space-y-2.5">
              {links.map(({ label, to }) => (
                <li key={label}>
                  {to.startsWith("http") ? (
                    <a
                      href={to}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-slate-400 hover:text-white transition-colors"
                    >
                      {label}
                    </a>
                  ) : (
                    <Link
                      to={to}
                      className="text-sm text-slate-400 hover:text-white transition-colors"
                    >
                      {label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="border-t border-white/[0.06] mt-12 pt-8 text-center">
        <p className="text-xs text-slate-500">
          © 2026 StudyBuddy AI. All rights reserved.
        </p>
      </div>
    </div>
  </footer>
);

export default Footer;
