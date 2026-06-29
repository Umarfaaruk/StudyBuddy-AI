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

import { lazy, Suspense } from "react";

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
const About = lazy(() => import("./pages/About"));
const OnboardingFlow = lazy(() => import("./pages/onboarding/OnboardingFlow"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const DoubtInput = lazy(() => import("./pages/doubts/DoubtInput"));
const AISolution = lazy(() => import("./pages/doubts/AISolution"));
const DoubtHistory = lazy(() => import("./pages/doubts/DoubtHistory"));
const DoubtSession = lazy(() => import("./pages/doubts/DoubtSession"));
const CameraQnA = lazy(() => import("./pages/doubts/CameraQnA"));
const TopicSelection = lazy(() => import("./pages/quiz/TopicSelection"));
const QuizPage = lazy(() => import("./pages/quiz/QuizPage"));
const QuizResults = lazy(() => import("./pages/quiz/QuizResults"));
const MaterialUpload = lazy(() => import("./pages/materials/MaterialUpload"));
const AILearning = lazy(() => import("./pages/materials/AILearning"));
const AITutor = lazy(() => import("./pages/materials/AITutor"));
const Flashcards = lazy(() => import("./pages/materials/Flashcards"));
const StudyPlanner = lazy(() => import("./pages/materials/StudyPlanner"));
const QuickTools = lazy(() => import("./pages/tools/QuickTools"));
const ProgressDashboard = lazy(() => import("./pages/progress/ProgressDashboard"));
const TimerPage = lazy(() => import("./pages/timer/TimerPage"));
const Leaderboard = lazy(() => import("./pages/social/Leaderboard"));
const Friends = lazy(() => import("./pages/social/Friends"));
const Achievements = lazy(() => import("./pages/social/Achievements"));
const Profile = lazy(() => import("./pages/Profile"));
const Settings = lazy(() => import("./pages/Settings"));
const LessonList = lazy(() => import("./pages/lessons/LessonList"));
const LessonViewer = lazy(() => import("./pages/lessons/LessonViewer"));
const AdminPanel = lazy(() => import("./pages/admin/AdminPanel"));
const AdminLogin = lazy(() => import("./pages/admin/AdminLogin"));
const Feedback = lazy(() => import("./pages/Feedback"));

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
