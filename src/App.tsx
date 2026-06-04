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

import Index from "./pages/Index";
import About from "./pages/About";
import NotFound from "./pages/NotFound";
import Login from "./pages/auth/Login";
import Signup from "./pages/auth/Signup";
import OnboardingFlow from "./pages/onboarding/OnboardingFlow";
import AppLayout from "./components/layout/AppLayout";
import Dashboard from "./pages/Dashboard";
import DoubtInput from "./pages/doubts/DoubtInput";
import AISolution from "./pages/doubts/AISolution";
import DoubtHistory from "./pages/doubts/DoubtHistory";
import DoubtSession from "./pages/doubts/DoubtSession";
import CameraQnA from "./pages/doubts/CameraQnA";
import TopicSelection from "./pages/quiz/TopicSelection";
import QuizPage from "./pages/quiz/QuizPage";
import QuizResults from "./pages/quiz/QuizResults";

import { lazy, Suspense } from "react";

import MaterialUpload from "./pages/materials/MaterialUpload";
import AILearning from "./pages/materials/AILearning";
import AITutor from "./pages/materials/AITutor";
import Flashcards from "./pages/materials/Flashcards";
const StudyPlanner = lazy(() => import("./pages/materials/StudyPlanner"));
import QuickTools from "./pages/tools/QuickTools";
import ProgressDashboard from "./pages/progress/ProgressDashboard";
import TimerPage from "./pages/timer/TimerPage";
import Leaderboard from "./pages/social/Leaderboard";
import Friends from "./pages/social/Friends";
import Achievements from "./pages/social/Achievements";
import Profile from "./pages/Profile";
import Settings from "./pages/Settings";
import LessonList from "./pages/lessons/LessonList";
import LessonViewer from "./pages/lessons/LessonViewer";
import AdminPanel from "./pages/admin/AdminPanel";
import AdminLogin from "./pages/admin/AdminLogin";
import Feedback from "./pages/Feedback";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 2,
      retry: 1,
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
                <Route path="/planner" element={<ErrorBoundary><Suspense fallback={<div className="p-8 flex justify-center"><div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" /></div>}><StudyPlanner /></Suspense></ErrorBoundary>} />
                <Route path="/materials/planner" element={<ErrorBoundary><Suspense fallback={<div className="p-8 flex justify-center"><div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" /></div>}><StudyPlanner /></Suspense></ErrorBoundary>} />

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
          </DeepFocusProvider>
          </NotificationProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
