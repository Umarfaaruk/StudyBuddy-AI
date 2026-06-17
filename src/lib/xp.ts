/**
 * XP AGGREGATION — single source of truth
 * =======================================
 * `xp_logs` is the canonical record of every XP award. The `profiles.total_xp`
 * field is just a cached aggregate. To guarantee the same number everywhere
 * (dashboard, profile, leaderboard, admin, email), ALL of them sum xp_logs with
 * the SAME de-duplication so an accidental double-write can never inflate XP.
 *
 * Two xp_logs are considered the same award (a duplicate) when they share the
 * user, amount, source and timestamp — that only happens on an accidental
 * double-write; genuine separate awards differ in their timestamp.
 */

type DocLike = { data: () => any };

export function xpLogSignature(x: any): string {
  const ms = x?.created_at?.toMillis?.() ?? (x?.created_at ? new Date(x.created_at).getTime() : 0);
  return `${x?.user_id}|${x?.xp_amount}|${x?.source_type}|${ms}`;
}

/** Timestamp (ms) of an xp_log doc, supporting Firestore Timestamp or ISO string. */
function xpLogMillis(x: any): number {
  return x?.created_at?.toMillis?.() ?? (x?.created_at ? new Date(x.created_at).getTime() : 0);
}

/**
 * Deduplicated, time-ordered XP entries for one user — the basis for a
 * performance-over-time trajectory. Same de-dup rule as dedupedXpSum.
 */
export function dedupedXpEntries(docs: DocLike[]): Array<{ ms: number; amount: number }> {
  const seen = new Set<string>();
  const entries: Array<{ ms: number; amount: number }> = [];
  for (const d of docs) {
    const x = d.data();
    if (!x || typeof x.xp_amount !== "number" || !x.user_id) continue;
    const sig = xpLogSignature(x);
    if (seen.has(sig)) continue;
    seen.add(sig);
    entries.push({ ms: xpLogMillis(x), amount: x.xp_amount });
  }
  return entries.sort((a, b) => a.ms - b.ms);
}

/** Deduplicated sum of xp_amount across a set of xp_log docs (one user). */
export function dedupedXpSum(docs: DocLike[]): number {
  const seen = new Set<string>();
  let total = 0;
  for (const d of docs) {
    const x = d.data();
    if (!x || typeof x.xp_amount !== "number" || !x.user_id) continue;
    const sig = xpLogSignature(x);
    if (seen.has(sig)) continue;
    seen.add(sig);
    total += x.xp_amount;
  }
  return total;
}

/** Deduplicated XP per user across many users' xp_log docs (for leaderboards). */
export function dedupedXpByUser(docs: DocLike[]): Map<string, number> {
  const seen = new Set<string>();
  const totals = new Map<string, number>();
  for (const d of docs) {
    const x = d.data();
    if (!x || typeof x.xp_amount !== "number" || !x.user_id) continue;
    const sig = xpLogSignature(x);
    if (seen.has(sig)) continue;
    seen.add(sig);
    totals.set(x.user_id, (totals.get(x.user_id) || 0) + x.xp_amount);
  }
  return totals;
}
