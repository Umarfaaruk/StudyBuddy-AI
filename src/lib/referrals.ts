/**
 * REFERRALS  (Phase 4.4)  +  INSTITUTE CODES  (Phase 4.5)
 * =======================================================
 * Both are "someone arrived because of someone else", captured at signup and
 * resolved once the new student proves they are real.
 *
 * Attribution is read from the URL and stashed in localStorage BEFORE signup,
 * because OAuth bounces the user to Google and back and the query string does
 * not survive the round trip. Without that, every referral through Google
 * sign-in would be silently lost.
 *
 * Referral rewards reuse the existing XP mechanic rather than inventing a
 * second currency, as specified. Both sides are rewarded only on a qualifying
 * action — completing onboarding AND a first mock test — so a referrer cannot
 * farm rewards by creating throwaway accounts that never use the product.
 */

import { supabase } from "@/lib/supabase";

const PENDING_KEY = "studybuddy_pending_attribution";

/** XP awarded to each side once a referral qualifies. */
export const REFERRAL_XP = 200;

export interface PendingAttribution {
  referralCode?: string;
  cohortJoinCode?: string;
  capturedAt: number;
}

/**
 * Capture ?ref= / ?code= from the current URL.
 * Call on app boot, before any auth redirect can discard the query string.
 */
export function capturePendingAttribution(): void {
  try {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get("ref")?.trim().toUpperCase();
    const code = params.get("code")?.trim().toUpperCase();
    if (!ref && !code) return;

    // Never overwrite an existing pending attribution: the first link a student
    // followed is the one that actually brought them in.
    if (localStorage.getItem(PENDING_KEY)) return;

    localStorage.setItem(PENDING_KEY, JSON.stringify({
      referralCode: ref || undefined,
      cohortJoinCode: code || undefined,
      capturedAt: Date.now(),
    } satisfies PendingAttribution));
  } catch {
    // Private browsing can block localStorage; attribution is best-effort and
    // must never break the page.
  }
}

export function readPendingAttribution(): PendingAttribution | null {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    return raw ? (JSON.parse(raw) as PendingAttribution) : null;
  } catch {
    return null;
  }
}

export function clearPendingAttribution(): void {
  try { localStorage.removeItem(PENDING_KEY); } catch { /* ignore */ }
}

/**
 * Redeem whatever attribution is pending for a newly signed-in student.
 *
 * Idempotent and safe to call on every login: the referrals table has a UNIQUE
 * constraint on referred_user_id, and cohort membership is a composite primary
 * key, so a repeat call conflicts harmlessly rather than duplicating.
 */
export async function redeemPendingAttribution(userId: string): Promise<void> {
  const pending = readPendingAttribution();
  if (!pending) return;

  try {
    if (pending.referralCode) {
      const { data: referrer } = await supabase
        .from("profiles").select("id").eq("referral_code", pending.referralCode).maybeSingle();

      // Self-referral is also blocked by a CHECK constraint; caught here first
      // so it fails quietly rather than as a database error.
      if (referrer?.id && referrer.id !== userId) {
        await supabase.from("referrals").insert({
          referrer_user_id: referrer.id,
          referred_user_id: userId,
          referral_code: pending.referralCode,
          status: "pending",
        });
      }
    }

    if (pending.cohortJoinCode) {
      const { data: cohort } = await supabase
        .from("cohorts").select("id").eq("join_code", pending.cohortJoinCode)
        .eq("is_active", true).maybeSingle();
      if (cohort?.id) {
        await supabase.from("cohort_members").insert({
          cohort_id: cohort.id, user_id: userId,
        });
      }
    }
  } catch (err) {
    // A duplicate is the expected outcome on repeat logins, not a failure.
    if (import.meta.env.DEV) console.log("[referrals] attribution already redeemed or unavailable:", err);
  } finally {
    clearPendingAttribution();
  }
}

export interface ReferralStats {
  code: string | null;
  link: string;
  total: number;
  qualified: number;
  pending: number;
}

export async function fetchReferralStats(userId: string): Promise<ReferralStats> {
  const [{ data: profile }, { data: rows }] = await Promise.all([
    supabase.from("profiles").select("referral_code").eq("id", userId).maybeSingle(),
    supabase.from("referrals").select("status").eq("referrer_user_id", userId),
  ]);

  const code = profile?.referral_code ?? null;
  const list = rows ?? [];

  return {
    code,
    link: code ? `${window.location.origin}/free-test?ref=${code}` : "",
    total: list.length,
    qualified: list.filter((r: any) => r.status !== "pending").length,
    pending: list.filter((r: any) => r.status === "pending").length,
  };
}
