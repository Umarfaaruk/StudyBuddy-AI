import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { TrendingUp, TrendingDown } from "lucide-react";
import type { TrendPoint } from "@/hooks/useDashboardData";

/**
 * PerformanceTrajectory — a 14-day curve of the user's cumulative XP growth.
 * The area shows total XP over time (the "trajectory"); the tooltip surfaces
 * how much XP was earned on each individual day. Fed from the same
 * de-duplicated xp_logs the rest of the dashboard uses, so it never disagrees.
 */
const PerformanceTrajectory = ({ data }: { data: TrendPoint[] }) => {
  const hasData = data.length > 0;
  const earnedInWindow = data.reduce((sum, d) => sum + d.xp, 0);
  const startTotal = hasData ? data[0].total - data[0].xp : 0;
  const endTotal = hasData ? data[data.length - 1].total : 0;
  const growthPct = startTotal > 0 ? Math.round((earnedInWindow / startTotal) * 100) : null;
  const trendingUp = earnedInWindow > 0;

  return (
    <div className="glass-card rounded-2xl p-6 hover-glow">
      <div className="flex items-center justify-between mb-5 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-primary" />
          <h3 className="text-base font-bold text-foreground">Performance Trajectory</h3>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-lg font-bold text-foreground leading-none tabular-nums">
              +{earnedInWindow.toLocaleString()} XP
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5">last 14 days</div>
          </div>
          {growthPct !== null && (
            <span
              className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full ${
                trendingUp ? "text-emerald-600 bg-emerald-500/10" : "text-muted-foreground bg-muted"
              }`}
            >
              {trendingUp ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              {growthPct}%
            </span>
          )}
        </div>
      </div>

      {hasData && earnedInWindow === 0 && endTotal === 0 ? (
        <div className="text-center py-10">
          <div className="text-4xl mb-3">📈</div>
          <div className="text-sm text-muted-foreground">
            Earn XP from lessons, quizzes and study sessions to see your growth curve.
          </div>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={data} margin={{ top: 5, right: 8, left: -10, bottom: 0 }}>
            <defs>
              <linearGradient id="xpTrajectory" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#29ABE2" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#29ABE2" stopOpacity={0} />
              </linearGradient>
            </defs>
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
            <YAxis
              stroke="hsl(var(--muted-foreground))"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              width={44}
              allowDecimals={false}
            />
            <Tooltip
              cursor={{ stroke: "#29ABE2", strokeWidth: 1, strokeDasharray: "4 4" }}
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
              formatter={(value: number, name: string) => [
                `${Number(value).toLocaleString()} XP`,
                name === "total" ? "Total" : "Earned",
              ]}
            />
            <Area
              type="monotone"
              dataKey="total"
              stroke="#29ABE2"
              strokeWidth={2.5}
              fill="url(#xpTrajectory)"
              dot={false}
              activeDot={{ r: 4, fill: "#29ABE2", stroke: "hsl(var(--card))", strokeWidth: 2 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
};

export default PerformanceTrajectory;
