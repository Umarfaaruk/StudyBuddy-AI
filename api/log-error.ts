 
/**
 * CLIENT ERROR SINK
 * ==================
 * Receives error reports from src/lib/errorMonitor.ts and writes them as
 * structured JSON lines to stdout — which Vercel captures as function logs.
 *
 * Viewing errors (free, no third-party service):
 *   Vercel Dashboard → Project → Logs → search "[CLIENT-ERROR]"
 *
 * Hardening:
 *   • 10 KB body cap — log spam can't become a cost problem
 *   • Field length caps — one giant stack trace can't flood the log stream
 *   • Always returns 204 fast — never blocks or fails the client
 */

const MAX_BODY = 10_000;

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const raw = typeof req.body === "string" ? req.body : JSON.stringify(req.body ?? {});
    if (!raw || raw.length > MAX_BODY) {
      return res.status(204).end(); // accept silently; never punish the client
    }

    const report = typeof req.body === "string" ? JSON.parse(req.body) : req.body;

    // Structured log line — searchable in Vercel logs
    console.error(
      "[CLIENT-ERROR]",
      JSON.stringify({
        message: String(report?.message ?? "").slice(0, 500),
        source: String(report?.source ?? "unknown").slice(0, 40),
        url: String(report?.url ?? "").slice(0, 200),
        context: String(report?.context ?? "").slice(0, 300),
        stack: String(report?.stack ?? "").slice(0, 2000),
        ua: String(report?.userAgent ?? "").slice(0, 200),
        ts: String(report?.timestamp ?? new Date().toISOString()),
      })
    );

    return res.status(204).end();
  } catch {
    // Even a malformed report must not produce a client-visible failure
    return res.status(204).end();
  }
}
