/**
 * ONE PROFILE READ PER PAGE LOAD
 * ==============================
 * `profiles` holds one row per user, and almost every screen needs something
 * from it — the display name in the sidebar, the role for the admin gate, the
 * onboarding flag for the route guard, XP for the dashboard, created_at for the
 * feedback prompt.
 *
 * Each of those used to fetch that same row under its OWN React Query key:
 *
 *   ["profile-onboarding-check", uid]   ProtectedRoute   select onboarding_completed
 *   ["profile-sidebar", uid]            AppLayout        select full_name
 *   ["admin-check", uid]                AdminRoute       select role
 *   ["profile", uid]                    useDashboardData select *
 *   (inline, no key)                    FeedbackEnforcer select created_at
 *
 * React Query de-duplicates by key, so five different keys meant five separate
 * round trips for one row. Measured against the production database that is
 * ~310 ms each, and the route guard's one BLOCKS rendering — nothing at all is
 * painted until it returns, so its latency is added to every other read rather
 * than overlapping them.
 *
 * Everything now shares this hook, so the row is fetched once and served from
 * cache to every other consumer.
 *
 * WHY THE KEY IS ["profile", uid]
 * -------------------------------
 * That is the key the app was already invalidating after a profile write —
 * Profile.tsx, Settings.tsx, GlobalTimer.tsx and both onboarding flows all call
 * `invalidateQueries({ queryKey: ["profile", uid] })`. Adopting it as the single
 * key means those existing invalidations now correctly refresh the sidebar name,
 * the admin gate and the route guard too, instead of only the dashboard copy.
 *
 * WHY select("*")
 * ---------------
 * One row, ~24 small columns. Fetching the whole row once is cheaper than
 * several narrow round trips, and it means a new consumer needs no change here.
 * The one genuinely large column is `avatar_url` when it holds a base64 data
 * URI rather than a storage URL — see the note in REGION-MIGRATION.md.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";

export interface Profile {
  id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
  role: string;
  onboarding_completed: boolean;
  total_xp: number;
  created_at: string;
  updated_at: string;
  is_active: boolean;
  exam_track_id: string | null;
  target_exam_date: string | null;
  referral_code: string | null;
  public_leaderboard_opt_in: boolean;
  public_display_name: string | null;
  date_of_birth: string | null;
  grade_level: string | null;
  university: string | null;
  stream: string | null;
  age: string | null;
  bio: string | null;
  place: string | null;
  xp_reconciled: boolean;
}

/** The single cache key for the signed-in user's profile row. */
export const profileKey = (uid: string | undefined) => ["profile", uid] as const;

/**
 * The signed-in user's profile row.
 *
 * `staleTime` is deliberately short. The value that matters most here is
 * `onboarding_completed`: the moment a user finishes onboarding we redirect
 * them, and a long stale window would bounce them straight back to the
 * onboarding screen. 30 s is long enough to cover a page load without
 * re-fetching, short enough that the post-onboarding write is picked up.
 */
export function useProfile() {
  const { user } = useAuth();

  return useQuery({
    queryKey: profileKey(user?.uid),
    queryFn: async (): Promise<Profile | null> => {
      if (!user) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.uid)
        .maybeSingle();
      // Surfaced rather than swallowed: ProtectedRoute lets the user through on
      // an error instead of trapping them behind a gate it cannot evaluate.
      if (error) throw error;
      return (data as Profile) ?? null;
    },
    enabled: !!user,
    staleTime: 1000 * 30,
    retry: 1,
    refetchOnWindowFocus: true,
  });
}

/** Refresh the profile row after a write. */
export function useRefreshProfile() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useCallback(
    () => queryClient.invalidateQueries({ queryKey: profileKey(user?.uid) }),
    [queryClient, user?.uid]
  );
}
