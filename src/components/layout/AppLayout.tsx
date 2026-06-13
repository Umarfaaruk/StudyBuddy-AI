import { Link, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard, BookOpen, MessageCircleQuestion, Trophy,
  BarChart3, Upload, Settings, User, Gamepad2, Bot,
  Focus, X, Menu, Wrench, ShieldCheck, ChevronLeft, ChevronRight,
} from "lucide-react";
import { useDeepFocus } from "@/hooks/useDeepFocus";
import GlobalTimer from "@/components/GlobalTimer";
import PageTransition from "@/components/motion/PageTransition";
import EduOnxAIChat from "@/components/EduOnxAIChat";
import SnapEnhance from "@/components/SnapEnhance";
import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import eduonxLogoOnDark from "@/assets/eduonx-logo-on-dark.png";

const sidebarLinks = [
  { to: "/dashboard", icon: LayoutDashboard, label: "Home" },
  { to: "/lessons", icon: BookOpen, label: "Academy" },
  { to: "/tools", icon: Bot, label: "AI Tutor" },
  { to: "/progress", icon: BarChart3, label: "Progress" },
  { to: "/doubts", icon: MessageCircleQuestion, label: "Ask Doubt" },
  { to: "/leaderboard", icon: Trophy, label: "Leaderboard" },
  { to: "/quiz", icon: Gamepad2, label: "Practice Arena" },
];

const librarySidebarLinks = [
  { to: "/materials", icon: Upload, label: "Materials" },
  { to: "/settings", icon: Settings, label: "Settings" },
];

const mobileNavLinks = [
  { to: "/dashboard", icon: LayoutDashboard, label: "Home" },
  { to: "/lessons", icon: BookOpen, label: "Academy" },
  { to: "/doubts", icon: MessageCircleQuestion, label: "Ask" },
  { to: "/materials", icon: Upload, label: "Resources" },
  { to: "/tools", icon: Bot, label: "AI Tutor" },
];

function NavLink({
  to,
  icon: Icon,
  label,
  active,
  onClick,
  collapsed,
}: {
  to: string;
  icon: typeof LayoutDashboard;
  label: string;
  active: boolean;
  onClick?: () => void;
  collapsed?: boolean;
}) {
  return (
    <Link
      to={to}
      onClick={onClick}
      className={`relative flex items-center ${collapsed ? "justify-center px-2 py-3" : "gap-3 px-4 py-2.5"} rounded-xl text-sm font-medium transition-all duration-200 z-10 ${
        active ? "text-foreground" : "text-white/55 hover:text-white"
      }`}
      title={collapsed ? label : undefined}
    >
      {active && (
        <motion.div
          layoutId="sidebar-active-pill"
          className="absolute inset-0 bg-white rounded-xl shadow-lg shadow-black/10"
          transition={{ type: "spring", stiffness: 400, damping: 32 }}
        />
      )}
      <Icon className={`h-[18px] w-[18px] flex-shrink-0 relative z-10 ${active ? "text-primary" : ""}`} />
      {!collapsed && <span className={`relative z-10 ${active ? "font-semibold" : ""}`}>{label}</span>}
    </Link>
  );
}

const AppLayout = () => {
  const { pathname } = useLocation();
  const { isDeepFocus, disableDeepFocus } = useDeepFocus();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { user } = useAuth();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem("sidebar_collapsed") === "true";
    } catch {
      return false;
    }
  });

  const toggleSidebar = () => {
    setSidebarCollapsed((prev) => {
      const newVal = !prev;
      try {
        localStorage.setItem("sidebar_collapsed", String(newVal));
      } catch {}
      return newVal;
    });
  };

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

  // Shares the SAME query key as AdminRoute (["admin-check", uid]) so the admin
  // check runs once and is served from cache here instead of firing a second
  // pair of Firestore reads for the sidebar.
  const { data: isAdmin } = useQuery({
    queryKey: ["admin-check", user?.uid],
    queryFn: async () => {
      if (!user) return false;
      try {
        const userSnap = await getDoc(doc(db, "users", user.uid));
        const userData = userSnap.data();
        if (userData?.role === "admin" || userData?.is_admin === true) return true;
      } catch {}
      try {
        const profileSnap = await getDoc(doc(db, "profiles", user.uid));
        const profileData = profileSnap.data();
        if (profileData?.role === "admin" || profileData?.is_admin === true) return true;
      } catch {}
      return false;
    },
    enabled: !!user,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 10,
  });

  const displayName = profile?.full_name || user?.displayName || "Student";
  const firstName = displayName.split(" ")[0];

  const isActive = (to: string) =>
    pathname === to || (to !== "/dashboard" && pathname.startsWith(to + "/"));

  return (
    <div className="min-h-screen bg-[#0F172A] flex">
      <GlobalTimer />

      {/* Desktop Sidebar */}
      {!isDeepFocus && (
        <aside className={`hidden md:flex flex-col fixed inset-y-0 left-0 z-30 border-r border-white/[0.06] transition-all duration-300 ${sidebarCollapsed ? "w-[76px]" : "w-[272px]"}`}>
          <div className="absolute inset-0 bg-[#0F172A]" />
          <div className="absolute inset-0 bg-gradient-to-b from-primary/[0.08] via-transparent to-transparent pointer-events-none" />

          <div className="relative flex flex-col h-full">
            <div className={`pt-7 pb-5 flex-shrink-0 flex items-center justify-between ${sidebarCollapsed ? "px-2 flex-col gap-4" : "px-6"}`}>
              {sidebarCollapsed ? (
                <Link to="/dashboard" className="h-8 w-8 rounded-lg bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center font-bold text-white text-sm shadow-md">
                  EO
                </Link>
              ) : (
                <Link to="/dashboard" className="block">
                  <img src={eduonxLogoOnDark} alt="EduOnx" className="h-8 w-auto object-contain" />
                </Link>
              )}
              <button
                type="button"
                onClick={toggleSidebar}
                className="text-white/40 hover:text-white p-1 rounded-lg hover:bg-white/[0.06] transition-all"
                title={sidebarCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
              >
                {sidebarCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
              </button>
            </div>

            {!sidebarCollapsed && (
              <div className="px-6 pb-5 flex-shrink-0">
                <div className="flex items-center gap-3 p-3 rounded-2xl bg-white/[0.06] border border-white/[0.08]">
                  <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-cta to-cta/80 flex items-center justify-center text-lg font-bold text-white shadow-lg shadow-cta/20">
                    {firstName[0]?.toUpperCase() || "S"}
                  </div>
                  <div className="min-w-0">
                    <p className="text-white/45 text-xs">Welcome back</p>
                    <p className="text-white font-semibold truncate">{firstName}</p>
                  </div>
                </div>
              </div>
            )}

            <nav className={`flex-1 space-y-0.5 overflow-y-auto scrollbar-thin pb-4 ${sidebarCollapsed ? "px-2" : "px-4"}`}>
              {sidebarLinks.map((link) => (
                <NavLink key={link.to} {...link} active={isActive(link.to)} collapsed={sidebarCollapsed} />
              ))}

              <div className="pt-5 pb-2">
                {sidebarCollapsed ? (
                  <div className="h-px bg-white/10 my-1 mx-2" />
                ) : (
                  <span className="px-4 text-[10px] font-bold text-white/25 uppercase tracking-[0.15em]">
                    Library
                  </span>
                )}
              </div>
              {librarySidebarLinks.map((link) => (
                <NavLink key={link.to} {...link} active={isActive(link.to)} collapsed={sidebarCollapsed} />
              ))}

              {isAdmin && (
                <>
                  <div className="pt-5 pb-2">
                    {sidebarCollapsed ? (
                      <div className="h-px bg-white/10 my-1 mx-2" />
                    ) : (
                      <span className="px-4 text-[10px] font-bold text-white/25 uppercase tracking-[0.15em]">
                        Admin
                      </span>
                    )}
                  </div>
                  <NavLink to="/admin" icon={ShieldCheck} label="Admin Panel" active={pathname === "/admin"} collapsed={sidebarCollapsed} />
                </>
              )}
            </nav>

            <div className={`${sidebarCollapsed ? "px-2" : "px-4"} pb-6 flex-shrink-0`}>
              <Link
                to="/profile"
                className={`flex items-center ${sidebarCollapsed ? "justify-center" : "gap-3 px-4"} py-3 rounded-xl text-sm text-white/50 hover:text-white hover:bg-white/[0.06] transition-all duration-200`}
                title={sidebarCollapsed ? "Profile & account" : undefined}
              >
                <User className="h-4 w-4" />
                {!sidebarCollapsed && <span>Profile & account</span>}
              </Link>
            </div>
          </div>
        </aside>
      )}

      {/* Mobile menu */}
      <AnimatePresence>
        {!isDeepFocus && mobileMenuOpen && (
          <div className="md:hidden fixed inset-0 z-50 flex">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setMobileMenuOpen(false)}
            />
            <motion.aside
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", stiffness: 380, damping: 36 }}
              className="relative w-72 bg-[#0F172A] flex flex-col h-full border-r border-white/10"
            >
              <div className="px-5 py-5 flex items-center justify-between border-b border-white/10">
                <img src={eduonxLogoOnDark} alt="EduOnx" className="h-7 w-auto" />
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  className="text-white/40 hover:text-white p-1"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
                {[...sidebarLinks, ...librarySidebarLinks].map((link) => (
                  <NavLink
                    key={link.to}
                    {...link}
                    active={isActive(link.to)}
                    onClick={() => setMobileMenuOpen(false)}
                  />
                ))}
                {isAdmin && (
                  <NavLink
                    to="/admin"
                    icon={ShieldCheck}
                    label="Admin Panel"
                    active={pathname === "/admin"}
                    onClick={() => setMobileMenuOpen(false)}
                  />
                )}
              </nav>
            </motion.aside>
          </div>
        )}
      </AnimatePresence>

      {/* Deep Focus bar */}
      {isDeepFocus && (
        <div className="fixed top-0 left-0 right-0 z-30 h-12 bg-[#0F172A] border-b border-white/10 flex items-center justify-between px-6">
          <div className="flex items-center gap-2 text-sm font-semibold text-white">
            <Focus className="h-4 w-4 text-primary" />
            Deep Focus Mode
          </div>
          <button
            type="button"
            onClick={disableDeepFocus}
            className="flex items-center gap-2 text-xs text-white/60 hover:text-white transition-colors border border-white/20 rounded-lg px-3 py-1.5"
          >
            <X className="h-3.5 w-3.5" />
            Exit Focus
          </button>
        </div>
      )}

      {/* Mobile header */}
      {!isDeepFocus && (
        <div className="md:hidden fixed top-0 left-0 right-0 z-20 bg-[#0F172A]/95 backdrop-blur-md border-b border-white/10 flex items-center justify-between px-4 h-14">
          <button type="button" onClick={() => setMobileMenuOpen(true)} className="p-2 -ml-1 text-white/60 hover:text-white">
            <Menu className="h-5 w-5" />
          </button>
          <img src={eduonxLogoOnDark} alt="EduOnx" className="h-7 w-auto object-contain" />
          <Link to="/profile" className="p-2 -mr-1">
            <User className="h-5 w-5 text-white/60" />
          </Link>
        </div>
      )}

      {/* Mobile bottom nav */}
      {!isDeepFocus && (
        <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-[#0F172A]/95 backdrop-blur-md border-t border-white/10 flex safe-area-pb">
          {mobileNavLinks.map((link) => {
            const active = isActive(link.to);
            return (
              <Link
                key={link.to}
                to={link.to}
                className={`relative flex-1 flex flex-col items-center gap-0.5 py-2 min-h-[56px] justify-center text-[10px] font-medium transition-all duration-200 ${
                  active ? "text-primary" : "text-white/40"
                }`}
              >
                <motion.div animate={active ? { scale: 1.1 } : { scale: 1 }} transition={{ duration: 0.2 }}>
                  <link.icon className="h-5 w-5" />
                </motion.div>
                {link.label}
                {active && (
                  <motion.div
                    layoutId="mobile-nav-dot"
                    className="absolute bottom-1 h-1 w-1 rounded-full bg-primary"
                  />
                )}
              </Link>
            );
          })}
        </nav>
      )}

      {/* Main content */}
      <main
        className={`flex-1 transition-all duration-300 ${
          isDeepFocus ? "pt-12 pb-0" : `pt-14 md:pt-0 ${sidebarCollapsed ? "md:ml-[76px]" : "md:ml-[272px]"} pb-20 md:pb-0`
        }`}
      >
        <div className={`${isDeepFocus ? "" : "md:p-3 md:h-screen md:flex md:flex-col"}`}>
          <div
            className={`${
              isDeepFocus
                ? ""
                : "main-canvas md:rounded-[1.75rem] md:flex-1 md:overflow-y-auto md:shadow-[0_20px_60px_-15px_rgba(0,0,0,0.35)] md:ring-1 md:ring-white/10 scrollbar-thin"
            }`}
          >
            <PageTransition />
          </div>
        </div>
        <EduOnxAIChat />
        <SnapEnhance />
      </main>
    </div>
  );
};

export default AppLayout;
