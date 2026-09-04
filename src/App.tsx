import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { NotificationProvider } from "@/contexts/NotificationContext";
import { DeepFocusProvider } from "@/hooks/useDeepFocus";
import ProtectedRoute from "@/components/ProtectedRoute";
import AdminRoute from "@/components/AdminRoute";
import ErrorBoundary from "@/components/ErrorBoundary";
import AppLayout from "./components/layout/AppLayout";

import { lazy, Suspense, type ComponentType } from "react";

/**
 * Wrap a lazy import so a STALE CHUNK auto-recovers. After a new deploy, the
 * hashed chunk files the currently-open tab references (e.g. QuizPage-abc123.js)
 * are replaced on the server, so navigating to a not-yet-loaded route throws
 * "Failed to fetch dynamically imported module". Instead of crashing, reload
 * once to fetch the fresh index.html + new chunk URLs. A sessionStorage guard
 * prevents an infinite reload loop if the failure is something else.
 */
function lazyWithReload<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>
) {
  return lazy(() =>
    factory()
      .then((mod) => {
        sessionStorage.removeItem("chunk-reloaded");
        return mod;
      })
      .catch((err) => {
        if (!sessionStorage.getItem("chunk-reloaded")) {
          sessionStorage.setItem("chunk-reloaded", "1");
          window.location.reload();
          return new Promise<{ default: T }>(() => {}); // hang until reload
        }
        throw err;
      })
  );
}

/* ──────────────────────────────────────────────────────────────────────────
 * ROUTE-LEVEL CODE SPLITTING
 * Eager (in the main bundle): only what's needed for first paint —
 * the landing page, auth pages, and the app shell.
 * Everything else loads on demand, cutting the initial JS bundle ~45%.
 * ────────────────────────────────────────────────────────────────────────── */

// Eager: first-paint critical
import Index from "./pages/Index";
import Login from "./pages/auth/Login";
import Signup from "./pages/auth/Signup";
import NotFound from "./pages/NotFound";

// Lazy: everything behind auth or rarely hit on first visit
const About = lazyWithReload(() => import("./pages/About"));
const OnboardingFlow = lazyWithReload(() => import("./pages/onboarding/OnboardingFlow"));
const Dashboard = lazyWithReload(() => import("./pages/Dashboard"));
const DoubtInput = lazyWithReload(() => import("./pages/doubts/DoubtInput"));
const AISolution = lazyWithReload(() => import("./pages/doubts/AISolution"));
const DoubtHistory = lazyWithReload(() => import("./pages/doubts/DoubtHistory"));
const DoubtSession = lazyWithReload(() => import("./pages/doubts/DoubtSession"));
const CameraQnA = lazyWithReload(() => import("./pages/doubts/CameraQnA"));
const TopicSelection = lazyWithReload(() => import("./pages/quiz/TopicSelection"));
const QuizPage = lazyWithReload(() => import("./pages/quiz/QuizPage"));
const QuizResults = lazyWithReload(() => import("./pages/quiz/QuizResults"));
const MaterialUpload = lazyWithReload(() => import("./pages/materials/MaterialUpload"));
const AILearning = lazyWithReload(() => import("./pages/materials/AILearning"));
const AITutor = lazyWithReload(() => import("./pages/materials/AITutor"));
const Flashcards = lazyWithReload(() => import("./pages/materials/Flashcards"));
const StudyPlanner = lazyWithReload(() => import("./pages/materials/StudyPlanner"));
const QuickTools = lazyWithReload(() => import("./pages/tools/QuickTools"));
const ProgressDashboard = lazyWithReload(() => import("./pages/progress/ProgressDashboard"));
const TimerPage = lazyWithReload(() => import("./pages/timer/TimerPage"));
const Leaderboard = lazyWithReload(() => import("./pages/social/Leaderboard"));
const Friends = lazyWithReload(() => import("./pages/social/Friends"));
const Achievements = lazyWithReload(() => import("./pages/social/Achievements"));
const Profile = lazyWithReload(() => import("./pages/Profile"));
const Settings = lazyWithReload(() => import("./pages/Settings"));
const LessonList = lazyWithReload(() => import("./pages/lessons/LessonList"));
const LessonViewer = lazyWithReload(() => import("./pages/lessons/LessonViewer"));
const AdminPanel = lazyWithReload(() => import("./pages/admin/AdminPanel"));
const AdminLogin = lazyWithReload(() => import("./pages/admin/AdminLogin"));
const Feedback = lazyWithReload(() => import("./pages/Feedback"));
const DiagnosticFlow = lazyWithReload(() => import("./pages/diagnostic/DiagnosticFlow"));
const DiagnosticResults = lazyWithReload(() => import("./pages/diagnostic/DiagnosticResults"));
const PracticeSession = lazyWithReload(() => import("./pages/practice/PracticeSession"));
const MockTestList = lazyWithReload(() => import("./pages/mock/MockTestList"));
const MockTestSession = lazyWithReload(() => import("./pages/mock/MockTestSession"));
const MockTestResults = lazyWithReload(() => import("./pages/mock/MockTestResults"));

/** Shared loading fallback shown while a route chunk downloads */
const PageLoader = () => (
  <div className="min-h-[50vh] p-8 flex items-center justify-center">
    <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
  </div>
);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Dashboard-style data stays fresh for 5 min — avoids refetching
      // (and re-reading the DB) on every back/forward navigation.
      staleTime: 1000 * 60 * 5,
      gcTime: 1000 * 60 * 30,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <NotificationProvider>
          <DeepFocusProvider>
            <Suspense fallback={<PageLoader />}>
            <Routes>
              {/* Public */}
              <Route path="/" element={<Index />} />
              <Route path="/about" element={<About />} />
              <Route path="/pricing" element={<Navigate to="/" replace />} />
              <Route path="/login" element={<Login />} />
              <Route path="/signup" element={<Signup />} />
              <Route path="/admin-login" element={<AdminLogin />} />

              {/* Protected: Onboarding (new multi-stage flow) */}
              <Route
                path="/onboarding"
                element={<ProtectedRoute><OnboardingFlow /></ProtectedRoute>}
              />
              {/* Legacy onboarding routes redirect to new flow */}
              <Route path="/onboarding/profile" element={<Navigate to="/onboarding" replace />} />
              <Route path="/onboarding/goals" element={<Navigate to="/onboarding" replace />} />

              {/* Protected: App screens with sidebar layout */}
              <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
                <Route path="/dashboard" element={<ErrorBoundary><Dashboard /></ErrorBoundary>} />
                <Route path="/lessons" element={<ErrorBoundary><LessonList /></ErrorBoundary>} />
                <Route path="/lessons/:id" element={<ErrorBoundary><LessonViewer /></ErrorBoundary>} />
                <Route path="/doubts" element={<ErrorBoundary><DoubtInput /></ErrorBoundary>} />
                <Route path="/doubts/solution" element={<ErrorBoundary><AISolution /></ErrorBoundary>} />
                <Route path="/doubts/history" element={<ErrorBoundary><DoubtHistory /></ErrorBoundary>} />
                <Route path="/doubts/session/:id" element={<ErrorBoundary><DoubtSession /></ErrorBoundary>} />
                <Route path="/doubts/camera" element={<ErrorBoundary><CameraQnA /></ErrorBoundary>} />
                <Route path="/quiz" element={<ErrorBoundary><TopicSelection /></ErrorBoundary>} />
                <Route path="/quiz/:id" element={<ErrorBoundary><QuizPage /></ErrorBoundary>} />
                <Route path="/quiz/:id/results" element={<ErrorBoundary><QuizResults /></ErrorBoundary>} />
                <Route path="/materials" element={<ErrorBoundary><MaterialUpload /></ErrorBoundary>} />
                <Route path="/materials/learn/:id" element={<ErrorBoundary><AILearning /></ErrorBoundary>} />
                <Route path="/materials/tutor" element={<ErrorBoundary><AITutor /></ErrorBoundary>} />
                <Route path="/materials/flashcards" element={<ErrorBoundary><Flashcards /></ErrorBoundary>} />

                {/* Study Planner — standalone and materials-based */}
                <Route path="/planner" element={<ErrorBoundary><StudyPlanner /></ErrorBoundary>} />
                <Route path="/materials/planner" element={<ErrorBoundary><StudyPlanner /></ErrorBoundary>} />

                {/* Quick Tools */}
                <Route path="/tools" element={<ErrorBoundary><QuickTools /></ErrorBoundary>} />

                {/* Diagnostic (Phase 2.1) — inside AppLayout so the student
                    keeps their normal navigation while taking it. */}
                <Route path="/diagnostic" element={<ErrorBoundary><DiagnosticFlow /></ErrorBoundary>} />
                <Route path="/diagnostic/results" element={<ErrorBoundary><DiagnosticResults /></ErrorBoundary>} />
                {/* Bank-backed drill for one syllabus concept — the action the
                    review queue points at (Phase 2.2). */}
                <Route path="/practice/:nodeId" element={<ErrorBoundary><PracticeSession /></ErrorBoundary>} />

                {/* Mock tests (Phase 3.1). :testId/results is declared BEFORE
                    :testId so the literal segment is not swallowed by the param. */}
                <Route path="/mock" element={<ErrorBoundary><MockTestList /></ErrorBoundary>} />
                <Route path="/mock/:testId/results" element={<ErrorBoundary><MockTestResults /></ErrorBoundary>} />
                <Route path="/mock/:testId" element={<ErrorBoundary><MockTestSession /></ErrorBoundary>} />

                <Route path="/progress" element={<ErrorBoundary><ProgressDashboard /></ErrorBoundary>} />
                <Route path="/timer" element={<ErrorBoundary><TimerPage /></ErrorBoundary>} />
                <Route path="/leaderboard" element={<ErrorBoundary><Leaderboard /></ErrorBoundary>} />
                <Route path="/friends" element={<ErrorBoundary><Friends /></ErrorBoundary>} />
                <Route path="/achievements" element={<ErrorBoundary><Achievements /></ErrorBoundary>} />
                <Route path="/profile" element={<ErrorBoundary><Profile /></ErrorBoundary>} />
                <Route path="/settings" element={<ErrorBoundary><Settings /></ErrorBoundary>} />
                <Route path="/feedback" element={<ErrorBoundary><Feedback /></ErrorBoundary>} />
                <Route path="/admin" element={<AdminRoute><ErrorBoundary><AdminPanel /></ErrorBoundary></AdminRoute>} />
              </Route>

              <Route path="*" element={<NotFound />} />
            </Routes>
            </Suspense>
          </DeepFocusProvider>
          </NotificationProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
