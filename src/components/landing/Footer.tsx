import { Link } from "react-router-dom";
import { BackgroundPaths } from "@/components/ui/background-paths";
import eduonxLogoOnDark from "@/assets/eduonx-logo-on-dark.png";

const footerLinks = {
  Platform: ["AI Tutor", "Quiz Engine", "Progress Tracker", "Study Timer"],
  Features: ["Document Learning", "Streaks & XP", "Leaderboards"],
  Legal: ["Privacy Policy", "Terms of Service"],
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
            <img src={eduonxLogoOnDark} alt="EduOnx Logo" className="block h-[60px] md:h-[80px] w-auto max-w-[200px] md:max-w-[300px] object-contain" />
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
              {links.map((link) => (
                <li key={link}>
                  <span className="text-sm text-slate-400 hover:text-white transition-colors cursor-pointer">{link}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="border-t border-white/[0.06] mt-12 pt-8 text-center">
        <p className="text-xs text-slate-500">
          © 2026 EduOnx. All rights reserved.
        </p>
      </div>
    </div>
  </footer>
);

export default Footer;
