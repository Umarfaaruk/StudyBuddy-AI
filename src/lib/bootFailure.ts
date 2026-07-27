/**
 * BOOT FAILURE SCREEN
 * ===================
 * Last line of defence against the white screen of death.
 *
 * React's ErrorBoundary can only catch errors thrown while *rendering*. If a
 * module in the App import graph throws while it is being *evaluated* — a
 * misconfigured SDK constructor is the classic case — React never runs at all,
 * `#root` stays empty, and the user sees a blank page with no explanation.
 *
 * This module renders a plain-DOM error card in that situation. It has no
 * imports and uses inline styles, so it still works when the stylesheet or the
 * component library is the very thing that failed to load.
 */

import { reportError } from "@/lib/errorMonitor";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Replace the (empty) app root with a readable failure card.
 * Never throws — if even this fails, we fall back to plain text.
 */
export function renderBootFailure(error: unknown, hint?: string): void {
  const message =
    error instanceof Error ? error.message : String(error ?? "Unknown error");

  // Surface it in Vercel logs / Sentry alongside the on-screen card.
  try {
    reportError(error, "manual", hint ?? "app.bootstrap");
  } catch {
    /* reporting must never mask the original failure */
  }
  console.error("App failed to start:", error);

  const root = document.getElementById("root");
  if (!root) return;

  try {
    root.innerHTML = `
      <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;background:#0f172a;color:#e2e8f0;font-family:Inter,system-ui,-apple-system,sans-serif">
        <div style="max-width:34rem;text-align:center">
          <div style="font-size:40px;line-height:1;margin-bottom:16px">&#9888;&#65039;</div>
          <h1 style="font-size:22px;font-weight:700;margin:0 0 12px;color:#f8fafc">
            StudyBuddy AI couldn&rsquo;t start
          </h1>
          <p style="font-size:14px;line-height:1.6;margin:0 0 8px;color:#94a3b8">
            ${escapeHtml(hint ?? "The app hit an error while loading.")}
          </p>
          <pre style="font-size:12px;text-align:left;white-space:pre-wrap;word-break:break-word;background:#1e293b;border:1px solid #334155;border-radius:8px;padding:12px;margin:0 0 20px;color:#cbd5e1">${escapeHtml(
            message
          )}</pre>
          <button
            onclick="window.location.reload()"
            style="background:#6366f1;color:#fff;border:0;border-radius:8px;padding:10px 20px;font-size:14px;font-weight:600;cursor:pointer"
          >Reload page</button>
        </div>
      </div>`;
  } catch {
    root.textContent = `StudyBuddy AI couldn't start: ${message}`;
  }
}
