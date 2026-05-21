import { Link, Outlet, useLocation } from "react-router-dom";
import {
  LayoutDashboard, BookOpen, MessageCircleQuestion, Trophy,
  BarChart3, Upload, Settings, User, Flame, Gamepad2, Bot,
  Timer, Focus, X, ChevronLeft, MessageSquare, Camera, Menu, Wrench,
  SkipBack, Play, SkipForward, Pause, Bell
} from "lucide-react";
import { useDeepFocus } from "@/hooks/useDeepFocus";
import GlobalTimer from "@/components/GlobalTimer";
import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";

import eduonxLogo from "@/assets/eduonx-logo.png";

const sidebarLinks = [
  { to: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/lessons", icon: BookOpen, label: "Academy" },
  { to: "/progress", icon: BarChart3, label: "Insights" },
  { to: "/doubts", icon: MessageCircleQuestion, label: "Ask Doubt" },
  { to: "/leaderboard", icon: Trophy, label: "Leaderboard" },
  { to: "/quiz", icon: Gamepad2, label: "Practice Arena" },
];

const librarySidebarLinks = [
  { to: "/materials", icon: Upload, label: "Materials" },
  { to: "/settings", icon: Settings, label: "Settings" },
];

// Mobile nav shows only the 5 most important routes
const mobileNavLinks = [
  { to: "/dashboard", icon: LayoutDashboard, label: "Home" },
  { to: "/lessons", icon: BookOpen, label: "Academy" },
  { to: "/doubts", icon: MessageCircleQuestion, label: "Ask" },
  { to: "/materials", icon: Upload, label: "Resources" },
  { to: "/materials/tutor", icon: Bot, label: "AI Tutor" },
];

/* ── Animated waveform bars for the music player ── */
const WaveformBars = () => (
  <div className="flex items-end gap-[3px] h-5">
    {[0.6, 1, 0.4, 0.8, 0.5, 1, 0.7, 0.3, 0.9, 0.5, 0.7, 1, 0.4, 0.8, 0.6].map((h, i) => (
      <div
        key={i}
        className="w-[2px] bg-white/60 rounded-full animate-pulse"
        style={{
          height: `${h * 20}px`,
          animationDelay: `${i * 0.1}s`,
          animationDuration: `${0.8 + Math.random() * 0.6}s`,
        }}
      />
    ))}
  </div>
);

const AppLayout = () => {
  const { pathname } = useLocation();
  const { isDeepFocus, disableDeepFocus } = useDeepFocus();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const { user } = useAuth();

  const { data: profile } = useQuery({
    queryKey: ["profile-sidebar", user?.uid],
    queryFn: async () => {
      if (!user) return null;
      const snap = await getDoc(doc(db, "profiles", user.uid));
      return snap.exists() ? snap.data() : null;
    },
    enabled: !!user,
    staleTime: 1000 * 60 * 5,
  });

  const displayName = profile?.full_name || user?.displayName || "Student";
  const firstName = displayName.split(" ")[0];

  return (
    <div className="min-h-screen bg-[#131526] flex">
      <GlobalTimer />

      {/* ── Desktop Sidebar ────────────────────────────── */}
      {!isDeepFocus && (
        <aside className="hidden md:flex w-[260px] flex-col fixed inset-y-0 left-0 z-30 bg-[#131526]">
          {/* User Avatar & Greeting */}
          <div className="px-6 pt-8 pb-6 flex-shrink-0">
            <div className="flex flex-col items-start">
              <div className="h-16 w-16 rounded-full bg-[#f4a261] flex items-center justify-center text-2xl font-bold text-white shadow-lg mb-3 border-2 border-[#f4a261]/30">
                {firstName[0]?.toUpperCase() || "S"}
              </div>
              <span className="text-white/50 text-sm">Hi!</span>
              <h3 className="text-white text-xl font-bold leading-tight">{firstName}</h3>
            </div>
          </div>

          {/* Navigation links */}
          <nav className="flex-1 px-4 space-y-1 overflow-y-auto scrollbar-thin">
            {sidebarLinks.map((link) => {
              const active =
                pathname === link.to ||
                (link.to !== "/dashboard" && pathname.startsWith(link.to + "/"));
              return (
                <Link
                  key={link.to}
                  to={link.to}
                  className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${active
                    ? "bg-white text-[#131526] shadow-md font-semibold"
                    : "text-white/60 hover:text-white hover:bg-white/[0.08]"
                    }`}
                >
                  <link.icon className="h-[18px] w-[18px] flex-shrink-0" />
                  {link.label}
                </Link>
              );
            })}

            {/* Library Section */}
            <div className="pt-4 pb-1">
              <span className="px-4 text-[11px] font-bold text-white/30 uppercase tracking-widest">
                Library
              </span>
            </div>
            {librarySidebarLinks.map((link) => {
              const active =
                pathname === link.to ||
                (link.to !== "/dashboard" && pathname.startsWith(link.to + "/"));
              return (
                <Link
                  key={link.to}
                  to={link.to}
                  className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${active
                    ? "bg-white text-[#131526] shadow-md font-semibold"
                    : "text-white/60 hover:text-white hover:bg-white/[0.08]"
                    }`}
                >
                  <link.icon className="h-[18px] w-[18px] flex-shrink-0" />
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </aside>
      )}

      {/* ── Mobile hamburger menu overlay ──────────────────── */}
      {!isDeepFocus && mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setMobileMenuOpen(false)} />
          <aside className="relative w-72 bg-[#131526] flex flex-col h-full animate-in slide-in-from-left duration-200">
            <div className="px-5 py-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-[#f4a261] flex items-center justify-center text-lg font-bold text-white">
                  {firstName[0]?.toUpperCase() || "S"}
                </div>
                <div>
                  <div className="text-white/50 text-xs">Hi!</div>
                  <div className="text-white text-sm font-bold">{firstName}</div>
                </div>
              </div>
              <button onClick={() => setMobileMenuOpen(false)} className="text-white/40 hover:text-white p-1">
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
              {[...sidebarLinks, ...librarySidebarLinks].map((link) => {
                const active =
                  pathname === link.to ||
                  (link.to !== "/dashboard" && pathname.startsWith(link.to + "/"));
                return (
                  <Link
                    key={link.to}
                    to={link.to}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${active
                      ? "bg-white text-[#131526] font-semibold"
                      : "text-white/60 hover:text-white hover:bg-white/[0.08]"
                      }`}
                  >
                    <link.icon className="h-5 w-5 flex-shrink-0" />
                    {link.label}
                  </Link>
                );
              })}
            </nav>
          </aside>
        </div>
      )}

      {/* ── Deep Focus Mode — minimal top bar ──────────────── */}
      {isDeepFocus && (
        <div className="fixed top-0 left-0 right-0 z-30 h-12 bg-[#131526] border-b border-white/10 flex items-center justify-between px-6">
          <div className="flex items-center gap-2 text-sm font-semibold text-white">
            <Focus className="h-4 w-4" />
            Deep Focus Mode
          </div>
          <button
            onClick={disableDeepFocus}
            className="flex items-center gap-2 text-xs text-white/60 hover:text-white transition-colors border border-white/20 rounded-lg px-3 py-1.5"
          >
            <X className="h-3.5 w-3.5" />
            Exit Focus
          </button>
        </div>
      )}

      {/* ── Mobile Top Header ───────────────────────────────── */}
      {!isDeepFocus && (
        <div className="md:hidden fixed top-0 left-0 right-0 z-20 bg-[#131526] border-b border-white/10 flex items-center justify-between px-4 h-14">
          <button onClick={() => setMobileMenuOpen(true)} className="p-2 -ml-1 text-white/60 hover:text-white">
            <Menu className="h-5 w-5" />
          </button>
          <img src={eduonxLogo} alt="EduOnx" className="h-[28px] w-auto object-contain brightness-0 invert" />
          <Link to="/profile" className="p-2 -mr-1">
            <User className="h-5 w-5 text-white/60" />
          </Link>
        </div>
      )}

      {/* ── Mobile Bottom Nav ──────────────────────────────── */}
      {!isDeepFocus && (
        <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-[#131526]/95 backdrop-blur-sm border-t border-white/10 flex safe-area-pb">
          {mobileNavLinks.map((link) => {
            const active =
              pathname === link.to ||
              (link.to !== "/dashboard" && pathname.startsWith(link.to + "/"));
            return (
              <Link
                key={link.to}
                to={link.to}
                className={`flex-1 flex flex-col items-center gap-1 py-2.5 min-h-[56px] justify-center text-[10px] font-medium transition-colors ${active ? "text-[#8b5cf6]" : "text-white/40"
                  }`}
              >
                <link.icon className="h-5 w-5" />
                {link.label}
              </Link>
            );
          })}
        </nav>
      )}

      {/* ── Main Content — Floating White Panel ──────────────── */}
      <main
        className={`flex-1 ${isDeepFocus
          ? "pt-12 pb-0"
          : "pt-14 md:pt-0 md:ml-[260px] pb-20 md:pb-0"
          }`}
      >
        <div className={`${isDeepFocus ? "" : "md:p-3 md:h-screen md:flex md:flex-col"}`}>
          <div
            className={`${isDeepFocus
              ? ""
              : "md:bg-[#f3f4f6] md:rounded-[2rem] md:flex-1 md:overflow-y-auto md:shadow-2xl scrollbar-thin"
              }`}
          >
            <Outlet />
          </div>
        </div>
      </main>
    </div>
  );
};

export default AppLayout;
