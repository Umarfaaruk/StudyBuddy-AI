/**
 * WEEKLY PROGRESS EMAIL (#7)
 * ==========================
 * Sends each active user a digest of THEIR real weekly stats (XP earned this
 * week, total XP, streak) to their account email. Triggered by a Vercel Cron
 * (see vercel.json) once a week, or manually with the CRON_SECRET.
 *
 * Accuracy: only users who actually earned XP in the last 7 days get an email,
 * and the numbers come straight from that user's deduplicated xp_logs — no
 * phantom data, no duplicates.
 *
 * Required env (set in Vercel):
 *   RESEND_API_KEY                – your Resend API key
 *   SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY – server DB access
 * Optional:
 *   RESEND_FROM                   – e.g. "StudyBuddy AI <noreply@yourdomain.com>"
 *                                   (defaults to Resend's onboarding sender)
 *   CRON_SECRET                   – if set, the request must send
 *                                   Authorization: Bearer <CRON_SECRET>
 */
import { Resend } from "resend";
import { createClient } from "@supabase/supabase-js";

// Absolute base URL for links in emails — a serverless function has no
// window.location to fall back on.
//
// Resolution order: an explicit PUBLIC_APP_URL wins; otherwise Vercel's own
// production-domain variable is used, so this keeps working through domain
// changes without a hardcoded host going stale.
const APP_URL = (
  process.env.PUBLIC_APP_URL?.trim() ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "")
).replace(/\/+$/, "");

function getDb() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function emailHtml(name: string, weeklyXp: number, totalXp: number, streak: number, awards: number) {
  return `<!doctype html><html><body style="margin:0;background:#f3f4f6;font-family:Inter,Arial,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:24px;">
    <div style="background:#fff;border-radius:18px;overflow:hidden;box-shadow:0 8px 30px -12px rgba(0,0,0,.15);">
      <div style="background:linear-gradient(135deg,#29ABE2,#1E96CC);padding:28px 28px 22px;color:#fff;">
        <div style="font-size:13px;letter-spacing:.08em;text-transform:uppercase;opacity:.85;">StudyBuddy AI · Weekly Recap</div>
        <h1 style="margin:6px 0 0;font-size:24px;">Nice work this week, ${name}! 🎉</h1>
      </div>
      <div style="padding:24px 28px;">
        <p style="color:#475569;font-size:15px;margin:0 0 18px;">Here's how your learning went over the last 7 days:</p>
        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;border-spacing:10px 0;">
          <tr>
            <td style="background:#EAF7FD;border-radius:14px;padding:16px;text-align:center;">
              <div style="font-size:26px;font-weight:800;color:#1E96CC;">${weeklyXp.toLocaleString()}</div>
              <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.05em;">XP this week</div>
            </td>
            <td style="background:#FFF7ED;border-radius:14px;padding:16px;text-align:center;">
              <div style="font-size:26px;font-weight:800;color:#F97316;">${streak}</div>
              <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.05em;">Day streak</div>
            </td>
          </tr>
        </table>
        <div style="margin-top:18px;color:#475569;font-size:14px;line-height:1.7;">
          <div>📚 Total XP earned all-time: <b style="color:#0f172a;">${totalXp.toLocaleString()}</b></div>
          <div>⚡ Study sessions / activities this week: <b style="color:#0f172a;">${awards}</b></div>
        </div>
        <div style="text-align:center;margin-top:26px;">
          <a href="${APP_URL}/dashboard" style="display:inline-block;background:#29ABE2;color:#fff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 26px;border-radius:12px;">Keep your streak going →</a>
        </div>
      </div>
      <div style="padding:16px 28px;background:#f8fafc;color:#94a3b8;font-size:11px;text-align:center;">
        You're receiving this because you have an StudyBuddy AI account. Keep learning! 💙
      </div>
    </div>
  </div></body></html>`;
}

export default async function handler(req: any, res: any) {
  // ── Auth: only the cron (or someone with the secret) may trigger sends ──
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers?.authorization || req.headers?.Authorization;
    if (auth !== `Bearer ${secret}`) {
      return res.status(401).json({ error: "Unauthorized" });
    }
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "RESEND_API_KEY is not configured." });
  }
  // Without an absolute base the dashboard link renders as a relative href,
  // which is dead in an email client. Refuse to send rather than mail everyone
  // a broken button.
  if (!APP_URL) {
    return res.status(500).json({
      error:
        "No base URL available. Set PUBLIC_APP_URL (absolute, e.g. https://example.com).",
    });
  }
  const resend = new Resend(apiKey);
  const from = process.env.RESEND_FROM || "StudyBuddy AI <onboarding@resend.dev>";

  try {
    const db = getDb();
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    // Aggregate this week's XP per user from the event log (de-duplicated).
    const { data: logs, error: logsErr } = await db
      .from("xp_logs")
      .select("user_id, xp_amount, source_type, created_at")
      .gte("created_at", weekAgo.toISOString());
    if (logsErr) throw logsErr;

    const seen = new Set<string>();
    const weeklyXp = new Map<string, number>();
    const counts = new Map<string, number>();
    (logs ?? []).forEach((x: any) => {
      if (!x.user_id || typeof x.xp_amount !== "number") return;
      const ms = x.created_at ? new Date(x.created_at).getTime() : 0;
      const sig = `${x.user_id}|${x.xp_amount}|${x.source_type}|${ms}`;
      if (seen.has(sig)) return;
      seen.add(sig);
      weeklyXp.set(x.user_id, (weeklyXp.get(x.user_id) || 0) + x.xp_amount);
      counts.set(x.user_id, (counts.get(x.user_id) || 0) + 1);
    });

    let sent = 0;
    let skippedNoEmail = 0;
    const failures: string[] = [];

    for (const [uid, xpWeek] of weeklyXp) {
      try {
        const [pRes, sRes] = await Promise.all([
          db.from("profiles").select("email, full_name, total_xp").eq("id", uid).maybeSingle(),
          db.from("user_streaks").select("current_streak").eq("user_id", uid).maybeSingle(),
        ]);
        const profile = pRes.data as any;
        if (!profile?.email) { skippedNoEmail++; continue; }
        const name = (profile.full_name || "there").split(" ")[0];
        const totalXp = profile.total_xp || 0;
        const streak = (sRes.data as any)?.current_streak || 0;

        // Resend resolves with { data, error } and does NOT throw on API
        // errors (invalid key, unverified domain, bad recipient, rate limit),
        // so we must inspect `error` — otherwise failed sends look successful.
        const { error } = await resend.emails.send({
          from,
          to: profile.email,
          subject: `Your StudyBuddy AI week: +${xpWeek.toLocaleString()} XP 🚀`,
          html: emailHtml(name, xpWeek, totalXp, streak, counts.get(uid) || 0),
        });
        if (error) {
          failures.push(`${profile.email}: ${error.message || error.name}`);
        } else {
          sent++;
        }
      } catch (err: any) {
        failures.push(`${uid}: ${err?.message}`);
      }
    }

    return res.status(200).json({
      ok: true,
      usersWithActivity: weeklyXp.size,
      sent,
      skippedNoEmail,
      failures,
    });
  } catch (err: any) {
    console.error("[send-weekly-emails] Error:", err);
    return res.status(500).json({ error: err?.message || "Internal server error" });
  }
}
