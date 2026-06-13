import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import ErrorBoundary from "@/components/ErrorBoundary.tsx";
import { initErrorMonitor } from "@/lib/errorMonitor";
import { initSentry } from "@/lib/sentry";

// Install global error monitoring before anything renders so even
// startup crashes are captured in Vercel logs.
initErrorMonitor();

// Optional Sentry tracing — a no-op unless VITE_SENTRY_DSN is configured.
void initSentry();

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
