import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Users, Plus, TrendingUp, Flame, Activity, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";

/**
 * COHORT ANALYTICS (admin)  (Phase 3.3 / 3.4)
 * ===========================================
 * Create pilot groups and read their aggregate outcomes.
 *
 * Deliberately plain: this exists so a real before/after story can be pulled
 * out of real usage, not to be a polished dashboard. Every number comes from
 * the `cohort_analytics` SQL function, which is SECURITY INVOKER — so a
 * non-admin calling the same RPC sees only their own rows and therefore no
 * cohort aggregate.
 */

interface Cohort {
  id: string;
  name: string;
  institute_name: string | null;
  join_code: string | null;
  is_active: boolean;
}

interface Analytics {
  member_count: number;
  students_with_attempts: number;
  avg_first_score: number | null;
  avg_latest_score: number | null;
  avg_score_change: number | null;
  avg_streak: number | null;
  sessions_per_week: number | null;
  most_improved_topics: { topic: string; subject: string | null; delta: number; n_students: number }[];
}

/** Uppercase, unambiguous over a phone call — no O/0 or I/1 confusion. */
function generateJoinCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () =>
    alphabet[Math.floor(Math.random() * alphabet.length)]
  ).join("");
}

const CohortAnalytics = () => {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<string>("");
  const [newName, setNewName] = useState("");
  const [newInstitute, setNewInstitute] = useState("");
  const [creating, setCreating] = useState(false);

  const { data: cohorts, isLoading } = useQuery({
    queryKey: ["admin-cohorts"],
    queryFn: async (): Promise<Cohort[]> => {
      const { data, error } = await supabase
        .from("cohorts")
        .select("id, name, institute_name, join_code, is_active")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Cohort[];
    },
  });

  const { data: analytics, isFetching: loadingAnalytics } = useQuery({
    queryKey: ["cohort-analytics", selected],
    queryFn: async (): Promise<Analytics | null> => {
      if (!selected) return null;
      const { data, error } = await supabase.rpc("cohort_analytics", { p_cohort_id: selected });
      if (error) throw error;
      return data as Analytics;
    },
    enabled: !!selected,
  });

  const createCohort = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const { error } = await supabase.from("cohorts").insert({
        name: newName.trim(),
        institute_name: newInstitute.trim() || null,
        join_code: generateJoinCode(),
      });
      if (error) throw error;
      toast.success("Cohort created");
      setNewName(""); setNewInstitute("");
      queryClient.invalidateQueries({ queryKey: ["admin-cohorts"] });
    } catch (err) {
      console.error("[CohortAnalytics] create failed:", err);
      toast.error((err as Error).message || "Could not create the cohort");
    } finally {
      setCreating(false);
    }
  };

  const Stat = ({ icon: Icon, label, value, hint }: {
    icon: typeof Users; label: string; value: string; hint?: string;
  }) => (
    <div className="rounded-xl border border-gray-200 p-4">
      <div className="flex items-center gap-2 text-gray-500 mb-1">
        <Icon className="h-3.5 w-3.5" />
        <span className="text-xs font-medium">{label}</span>
      </div>
      <div className="text-xl font-bold text-gray-900 tabular-nums">{value}</div>
      {hint && <div className="text-xs text-gray-400 mt-0.5">{hint}</div>}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-xl bg-[#0F172A] flex items-center justify-center flex-shrink-0">
          <Users className="h-5 w-5 text-white" />
        </div>
        <div>
          <h3 className="text-lg font-bold text-gray-900">Cohorts &amp; pilot groups</h3>
          <p className="text-sm text-gray-500">
            Tag a batch of students, then read their aggregate outcome over time.
          </p>
        </div>
      </div>

      {/* Create */}
      <div className="rounded-xl border border-gray-200 p-4 space-y-3">
        <div className="grid md:grid-cols-2 gap-3">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Cohort name (e.g. Pilot batch 1)"
            className="h-10 rounded-lg border border-gray-200 px-3 text-sm"
          />
          <input
            value={newInstitute}
            onChange={(e) => setNewInstitute(e.target.value)}
            placeholder="Institute (optional)"
            className="h-10 rounded-lg border border-gray-200 px-3 text-sm"
          />
        </div>
        <Button
          onClick={createCohort}
          disabled={creating || !newName.trim()}
          className="gap-2 bg-[#0F172A] text-white hover:bg-[#0F172A]/90"
          size="sm"
        >
          <Plus className="h-4 w-4" />
          {creating ? "Creating…" : "Create cohort"}
        </Button>
      </div>

      {/* Select */}
      {isLoading ? (
        <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
      ) : !cohorts?.length ? (
        <p className="text-sm text-gray-500">No cohorts yet.</p>
      ) : (
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">Cohort</label>
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm"
          >
            <option value="">Select a cohort…</option>
            {cohorts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}{c.institute_name ? ` — ${c.institute_name}` : ""}
                {c.join_code ? ` (code ${c.join_code})` : ""}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Analytics */}
      {selected && (
        loadingAnalytics ? (
          <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
        ) : !analytics ? (
          <p className="text-sm text-gray-500">No data for this cohort yet.</p>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Stat icon={Users} label="Members" value={String(analytics.member_count)}
                    hint={`${analytics.students_with_attempts} with mock attempts`} />
              <Stat icon={TrendingUp} label="Avg score change"
                    value={analytics.avg_score_change != null
                      ? `${analytics.avg_score_change > 0 ? "+" : ""}${analytics.avg_score_change}`
                      : "—"}
                    hint={analytics.avg_first_score != null
                      ? `${analytics.avg_first_score}% → ${analytics.avg_latest_score}%`
                      : "needs 2+ attempts"} />
              <Stat icon={Flame} label="Avg streak"
                    value={analytics.avg_streak != null ? String(analytics.avg_streak) : "—"} />
              <Stat icon={Activity} label="Sessions / week"
                    value={analytics.sessions_per_week != null ? String(analytics.sessions_per_week) : "—"}
                    hint="last 28 days" />
            </div>

            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">
                Most improved topics
              </h4>
              {analytics.most_improved_topics?.length ? (
                <div className="space-y-1.5">
                  {analytics.most_improved_topics.map((t) => (
                    <div key={t.topic} className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2">
                      <div className="min-w-0">
                        <div className="text-sm text-gray-900 truncate">{t.topic}</div>
                        {t.subject && <div className="text-xs text-gray-400">{t.subject}</div>}
                      </div>
                      <div className="text-sm font-semibold text-emerald-600 tabular-nums flex-shrink-0">
                        +{t.delta}
                        <span className="text-xs text-gray-400 font-normal ml-1.5">
                          n={t.n_students}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                // Snapshots accumulate over time; say why it is empty rather
                // than showing a blank panel that reads as broken.
                <p className="text-xs text-gray-500">
                  Needs at least two mastery snapshots per student — these accumulate
                  as students sit mock tests.
                </p>
              )}
            </div>
          </div>
        )
      )}
    </div>
  );
};

export default CohortAnalytics;
