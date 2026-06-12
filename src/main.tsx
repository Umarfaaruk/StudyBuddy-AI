import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import ErrorBoundary from "@/components/ErrorBoundary.tsx";
import { initErrorMonitor } from "@/lib/errorMonitor";

// Install global error monitoring before anything renders so even
// startup crashes are captured in Vercel logs.
initErrorMonitor();

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
