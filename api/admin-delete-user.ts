import { createClient } from "@supabase/supabase-js";

/**
 * ADMIN DELETE USER — complete account erasure (Supabase)
 * =======================================================
 * Deletes the user's Supabase Auth account. Because every user-owned table
 * references auth.users(id) with ON DELETE CASCADE, that single delete also
 * removes all of their rows (profiles, xp_logs, sessions, quizzes, materials,
 * doubts, social graph, etc.) in one transaction — no manual per-table cleanup.
 *
 * Then it best-effort removes the user's avatar from Storage.
 *
 * Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (the service-role key
 * bypasses RLS and can manage auth users).
 */

function getClient() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY environment variables");
  }
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const { uid, adminToken } = body ?? {};

    if (!uid || typeof uid !== "string") {
      return res.status(400).json({ error: "Missing or invalid 'uid' field" });
    }
    if (!adminToken || typeof adminToken !== "string") {
      return res.status(400).json({ error: "Missing admin authentication token" });
    }

    const sb = getClient();

    // ── Verify the caller is a signed-in admin ────────────────
    const { data: callerData, error: callerErr } = await sb.auth.getUser(adminToken);
    if (callerErr || !callerData?.user) {
      return res.status(401).json({ error: "Unauthorized: invalid admin token" });
    }
    const callerUid = callerData.user.id;

    const { data: callerProfile } = await sb
      .from("profiles")
      .select("role")
      .eq("id", callerUid)
      .maybeSingle();

    if (callerProfile?.role !== "admin") {
      return res.status(403).json({ error: "Forbidden: caller is not an admin" });
    }
    if (uid === callerUid) {
      return res.status(400).json({ error: "Cannot delete your own account" });
    }

    const failures: string[] = [];

    // ── Delete the Auth account → cascades to every user-owned table ──
    const { error: delErr } = await sb.auth.admin.deleteUser(uid);
    if (delErr && !/not found/i.test(delErr.message)) {
      return res.status(500).json({ error: `Failed to delete user: ${delErr.message}` });
    }

    // ── Best-effort Storage cleanup (avatar) ──────────────────
    try {
      await sb.storage.from("avatars").remove([`${uid}/profile.jpg`]);
    } catch (err: any) {
      failures.push(`storage: ${err?.message}`);
    }

    console.log(`[admin-delete-user] uid=${uid} deleted (cascade) failures=${failures.length}`);

    return res.status(200).json({
      success: true,
      message: `User ${uid} fully deleted`,
      deletedDocs: 0, // cascade — exact row count not tracked
      failures,
    });
  } catch (error: any) {
    console.error("[admin-delete-user] Error:", error);
    return res.status(500).json({ error: error?.message || "Internal server error" });
  }
}
