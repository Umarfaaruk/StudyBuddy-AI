import {
  Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { Activity } from "lucide-react";
import type { RetentionPoint } from "@/hooks/useDashboardData";

/**
 * RetentionTrajectory — a 14-day view of how well the user retains, on two axes:
 *   • bars  = minutes studied each day  → habit retention (are they showing up?)
 *   • line  = average quiz accuracy %   → knowledge retention (is it sticking?)
 * Fed entirely from data the dashboard already fetches (no extra reads).
 */
const RetentionTrajectory = ({ data }: { data: RetentionPoint[] }) => {
  const activeDays = data.filter((d) => d.active).length;
  const scored = data.filter((d) => d.accuracy !== null) as Array<RetentionPoint & { accuracy: number }>;
  const avgAccuracy = scored.length
    ? Math.round(scored.reduce((sum, d) => sum + d.accuracy, 0) / scored.length)
    : null;
  const hasAnything = activeDays > 0 || scored.length > 0;

  return (
    <div className="glass-card rounded-2xl p-6 hover-glow">
      <div className="flex items-center justify-between mb-5 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-primary" />
          <h3 className="text-base font-bold text-foreground">Retention Trajectory</h3>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-lg font-bold text-foreground leading-none tabular-nums">
              {avgAccuracy === null ? "—" : `${avgAccuracy}%`}
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5">avg accuracy</div>
          </div>
          <div className="h-8 w-px bg-border" />
          <div className="text-right">
            <div className="text-lg font-bold text-foreground leading-none tabular-nums">
              {activeDays}<span className="text-sm text-muted-foreground">/14</span>
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5">active days</div>
          </div>
        </div>
      </div>

      {!hasAnything ? (
        <div className="text-center py-10">
          <div className="text-4xl mb-3">📊</div>
          <div className="text-sm text-muted-foreground">
            Study and take quizzes to see how well you're retaining over time.
          </div>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={240}>
          <ComposedChart data={data} margin={{ top: 5, right: 8, left: -12, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis
              dataKey="label"
              stroke="hsl(var(--muted-foreground))"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
              minTickGap={20}
            />
            {/* left axis: study minutes */}
            <YAxis
              yAxisId="minutes"
              stroke="hsl(var(--muted-foreground))"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              width={36}
              allowDecimals={false}
            />
            {/* right axis: accuracy %, fixed 0-100 */}
            <YAxis
              yAxisId="accuracy"
              orientation="right"
              domain={[0, 100]}
              ticks={[0, 50, 100]}
              stroke="hsl(var(--muted-foreground))"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              width={34}
              tickFormatter={(v: number) => `${v}%`}
            />
            <Tooltip
              cursor={{ fill: "hsl(var(--muted))", opacity: 0.3 }}
              contentStyle={{
                background: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: 12,
                fontSize: 12,
                boxShadow: "0 8px 24px rgba(0,0,0,0.08)",
              }}
              labelFormatter={(label: string, payload: any) => {
                const day = payload?.[0]?.payload?.day;
                return day ? `${day} ${label}` : label;
              }}
              formatter={(value: any, name: string) =>
                value === null || value === undefined
                  ? ["—", name]
                  : name === "Accuracy"
                    ? [`${value}%`, name]
                    : [`${value} min`, name]
              }
            />
            <Legend
              iconType="circle"
              wrapperStyle={{ fontSize: 12, paddingTop: 4 }}
            />
            <Bar
              yAxisId="minutes"
              dataKey="minutes"
              name="Study"
              fill="#29ABE2"
              fillOpacity={0.25}
              radius={[6, 6, 0, 0]}
              maxBarSize={22}
            />
            <Line
              yAxisId="accuracy"
              type="monotone"
              dataKey="accuracy"
              name="Accuracy"
              stroke="#29ABE2"
              strokeWidth={2.5}
              connectNulls
              dot={{ r: 3, fill: "#29ABE2", strokeWidth: 0 }}
              activeDot={{ r: 5, fill: "#29ABE2", stroke: "hsl(var(--card))", strokeWidth: 2 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      )}
    </div>
  );
};

export default RetentionTrajectory;
