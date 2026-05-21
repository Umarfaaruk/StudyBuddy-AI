import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell } from "recharts";
import { Clock, Flame, Target, TrendingUp, Calendar, Award, Zap } from "lucide-react";
import { collection, query, where, orderBy, limit, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useQuery } from "@tanstack/react-query";
import { calculateProductivityScore, getConsistencyMetrics, getPerformanceBreakdown } from "@/lib/analytics";

interface StudySession {
  id: string;
  duration_seconds: number;
  started_at: string;
  ended_at: string;
  xp_earned?: number;
}

interface DailyStats {
  date: string;
  minutes: number;
  sessions: number;
}

interface WeeklyStats {
  weekLabel: string;
  minutes: number;
  sessions: number;
  avgPerDay: number;
}

interface MonthlyStats {
  month: string;
  minutes: number;
  sessions: number;
  daysActive: number;
}

const TimerPage = () => {
  const { user } = useAuth();
  const [pastSessions, setPastSessions] = useState<StudySession[]>([]);
  const [dailyStats, setDailyStats] = useState<DailyStats[]>([]);
  const [weeklyStats, setWeeklyStats] = useState<WeeklyStats[]>([]);
  const [monthlyStats, setMonthlyStats] = useState<MonthlyStats[]>([]);
  const [productivityScore, setProductivityScore] = useState<any>(null);
  const [consistencyMetrics, setConsistencyMetrics] = useState<any>(null);
  const [performanceBreakdown, setPerformanceBreakdown] = useState<any>(null);

  // Fetch recent study sessions
  const { data: sessions, isLoading } = useQuery({
    queryKey: ["studySessions", user?.uid],
    enabled: !!user,
    queryFn: async () => {
      if (!user) return [];
      
      const q = query(
        collection(db, "study_sessions"),
        where("user_id", "==", user.uid),
        orderBy("created_at", "desc"),
        limit(100) // Fetch more sessions for weekly/monthly aggregation
      );

      const docs = await getDocs(q);
      return docs.docs.map((doc) => ({
        id: doc.id,
        ...(doc.data() as StudySession),
      } as StudySession));
    },
  });

  // Fetch analytics data
  useEffect(() => {
    if (!user) return;

    const fetchAnalytics = async () => {
      try {
        const [productivity, consistency, performance] = await Promise.all([
          calculateProductivityScore(user.uid),
          getConsistencyMetrics(user.uid),
          getPerformanceBreakdown(user.uid),
        ]);
        setProductivityScore(productivity);
        setConsistencyMetrics(consistency);
        setPerformanceBreakdown(performance);
      } catch (error) {
        console.error("Error fetching analytics:", error);
      }
    };

    fetchAnalytics();
  }, [user]);

  // Calculate all statistics: daily, weekly, monthly
  useEffect(() => {
    if (!sessions) return;

    // ── Daily Statistics ──
    const dailyMap: { [date: string]: DailyStats } = {};
    sessions.forEach((session) => {
      const date = new Date(session.started_at).toISOString().split("T")[0];
      if (!dailyMap[date]) {
        dailyMap[date] = { date, minutes: 0, sessions: 0 };
      }
      dailyMap[date].minutes += Math.round(session.duration_seconds / 60);
      dailyMap[date].sessions += 1;
    });

    const sortedDaily = Object.values(dailyMap)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Show current week (Monday to Sunday) for daily view
    const currentWeekDays: DailyStats[] = [];
    const todayDate = new Date();
    // Get Monday of current week
    const currentDayOfWeek = todayDate.getDay();
    const daysSinceMonday = currentDayOfWeek === 0 ? 6 : currentDayOfWeek - 1;
    const mondayThisWeek = new Date(todayDate);
    mondayThisWeek.setDate(todayDate.getDate() - daysSinceMonday);

    for (let i = 0; i < 7; i++) {
      const d = new Date(mondayThisWeek);
      d.setDate(d.getDate() + i);
      const dateKey = d.toISOString().split("T")[0];
      const existing = dailyMap[dateKey];
      currentWeekDays.push({
        date: d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }),
        minutes: existing?.minutes || 0,
        sessions: existing?.sessions || 0,
      });
    }
    setDailyStats(currentWeekDays);

    // ── Weekly Statistics ──
    const weeklyMap: { [weekKey: string]: { minutes: number; sessions: number; days: Set<string>; start: Date } } = {};
    sessions.forEach((session) => {
      const date = new Date(session.started_at);
      // Get Monday of the week
      const monday = new Date(date);
      const day = monday.getDay();
      const diff = day === 0 ? -6 : 1 - day;
      monday.setDate(monday.getDate() + diff);
      monday.setHours(0, 0, 0, 0);
      const weekKey = monday.toISOString().split("T")[0];

      if (!weeklyMap[weekKey]) {
        weeklyMap[weekKey] = { minutes: 0, sessions: 0, days: new Set(), start: monday };
      }
      weeklyMap[weekKey].minutes += Math.round(session.duration_seconds / 60);
      weeklyMap[weekKey].sessions += 1;
      weeklyMap[weekKey].days.add(date.toISOString().split("T")[0]);
    });

    const sortedWeekly: WeeklyStats[] = Object.entries(weeklyMap)
      .sort(([a], [b]) => new Date(b).getTime() - new Date(a).getTime())
      .slice(0, 8)
      .reverse()
      .map(([, data]) => {
        const endDate = new Date(data.start);
        endDate.setDate(endDate.getDate() + 6);
        return {
          weekLabel: `${data.start.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${endDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`,
          minutes: data.minutes,
          sessions: data.sessions,
          avgPerDay: Math.round(data.minutes / 7),
        };
      });
    setWeeklyStats(sortedWeekly);

    // ── Monthly Statistics ──
    const monthlyMap: { [monthKey: string]: { minutes: number; sessions: number; days: Set<string> } } = {};
    sessions.forEach((session) => {
      const date = new Date(session.started_at);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      if (!monthlyMap[monthKey]) {
        monthlyMap[monthKey] = { minutes: 0, sessions: 0, days: new Set() };
      }
      monthlyMap[monthKey].minutes += Math.round(session.duration_seconds / 60);
      monthlyMap[monthKey].sessions += 1;
      monthlyMap[monthKey].days.add(date.toISOString().split("T")[0]);
    });

    const sortedMonthly: MonthlyStats[] = Object.entries(monthlyMap)
      .sort(([a], [b]) => b.localeCompare(a))
      .slice(0, 6)
      .reverse()
      .map(([key, data]) => {
        const [year, month] = key.split("-");
        const monthDate = new Date(parseInt(year), parseInt(month) - 1);
        return {
          month: monthDate.toLocaleDateString("en-US", { month: "short", year: "numeric" }),
          minutes: data.minutes,
          sessions: data.sessions,
          daysActive: data.days.size,
        };
      });
    setMonthlyStats(sortedMonthly);

    setPastSessions(sessions);
  }, [sessions]);

  // Calculate totals
  const totalMinutes = sessions?.reduce((acc, s) => acc + s.duration_seconds / 60, 0) ?? 0;
  const todayMinutes = sessions
    ?.filter((s) => new Date(s.started_at).toDateString() === new Date().toDateString())
    .reduce((acc, s) => acc + s.duration_seconds / 60, 0) ?? 0;
  const thisWeekMinutes = sessions
    ?.filter((s) => {
      const date = new Date(s.started_at);
      const now = new Date();
      const daysAgo = (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24);
      return daysAgo <= 7;
    })
    .reduce((acc, s) => acc + s.duration_seconds / 60, 0) ?? 0;
  const thisMonthMinutes = sessions
    ?.filter((s) => {
      const date = new Date(s.started_at);
      const now = new Date();
      return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
    })
    .reduce((acc, s) => acc + s.duration_seconds / 60, 0) ?? 0;

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  };

  const formatMinutes = (mins: number) => {
    if (mins >= 60) {
      const h = Math.floor(mins / 60);
      const m = mins % 60;
      return m > 0 ? `${h}h ${m}m` : `${h}h`;
    }
    return `${mins}m`;
  };

  if (!user) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Please sign in to view your timer</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-8 p-6">
      <div>
        <h1 className="text-4xl font-bold">Study Timer</h1>
        <p className="text-muted-foreground mt-2">Track and manage your study sessions</p>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-blue-500/10 to-cyan-500/10 border-blue-500/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Today
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{formatMinutes(Math.round(todayMinutes))}</div>
            <p className="text-xs text-muted-foreground mt-2">
              {sessions?.filter((s) => new Date(s.started_at).toDateString() === new Date().toDateString()).length ?? 0} sessions
            </p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-blue-500/10 to-cyan-500/10 border-blue-500/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Flame className="h-4 w-4" />
              This Week
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{formatMinutes(Math.round(thisWeekMinutes))}</div>
            <p className="text-xs text-muted-foreground mt-2">
              {consistencyMetrics?.currentStreak || 0}-day streak 🔥
            </p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-amber-500/10 to-orange-500/10 border-amber-500/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              This Month
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{formatMinutes(Math.round(thisMonthMinutes))}</div>
            <p className="text-xs text-muted-foreground mt-2">
              {sessions?.filter(s => {
                const d = new Date(s.started_at);
                const now = new Date();
                return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
              }).length ?? 0} sessions
            </p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-green-500/10 to-emerald-500/10 border-green-500/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Award className="h-4 w-4" />
              Productivity
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{productivityScore?.overall_score ?? 0}/100</div>
            <p className="text-xs text-muted-foreground mt-2">{productivityScore?.trend || "Stable"}</p>
          </CardContent>
        </Card>
      </div>

      {/* Metrics Overview */}
      {consistencyMetrics && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="border-slate-800">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Zap className="h-4 w-4" />
                Current Streak
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{consistencyMetrics.currentStreak}</div>
              <p className="text-xs text-muted-foreground mt-2">days</p>
            </CardContent>
          </Card>

          <Card className="border-slate-800">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                Max Streak
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{consistencyMetrics.maxStreak}</div>
              <p className="text-xs text-muted-foreground mt-2">days</p>
            </CardContent>
          </Card>

          <Card className="border-slate-800">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Days Active
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{consistencyMetrics.daysActive}</div>
              <p className="text-xs text-muted-foreground mt-2">of last 30 days</p>
            </CardContent>
          </Card>

          <Card className="border-slate-800">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Avg/Day
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{consistencyMetrics.avgDailyMinutes}m</div>
              <p className="text-xs text-muted-foreground mt-2">this month</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Charts — Day / Week / Month / History */}
      <Tabs defaultValue="daily" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="daily">Day-wise</TabsTrigger>
          <TabsTrigger value="weekly">Week-wise</TabsTrigger>
          <TabsTrigger value="monthly">Month-wise</TabsTrigger>
          <TabsTrigger value="history">Session Log</TabsTrigger>
        </TabsList>

        {/* Day-wise Chart */}
        <TabsContent value="daily" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Daily Study Time</CardTitle>
              <CardDescription>Minutes studied per day (current week)</CardDescription>
            </CardHeader>
            <CardContent>
              {dailyStats.some(d => d.minutes > 0) ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={dailyStats}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }}
                      formatter={(value: any) => [`${value} min`, "Study Time"]}
                    />
                    <Bar dataKey="minutes" fill="#3b82f6" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                  No study sessions this week. Start studying to see your daily progress!
                </div>
              )}

              {/* Day-wise breakdown table */}
              {dailyStats.some(d => d.minutes > 0) && (
                <div className="mt-4 space-y-2">
                  <h4 className="text-sm font-semibold text-muted-foreground">Day-wise Breakdown</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {dailyStats.filter(d => d.minutes > 0).reverse().map((day) => (
                      <div key={day.date} className="flex items-center justify-between p-2 bg-muted/30 rounded-lg">
                        <span className="text-sm font-medium">{day.date}</span>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-muted-foreground">{day.sessions} session{day.sessions !== 1 ? 's' : ''}</span>
                          <Badge variant="outline" className="text-primary border-primary/30">
                            {formatMinutes(day.minutes)}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Week-wise Chart */}
        <TabsContent value="weekly" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Weekly Study Time</CardTitle>
              <CardDescription>Total minutes studied per week (last 8 weeks)</CardDescription>
            </CardHeader>
            <CardContent>
              {weeklyStats.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={weeklyStats}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="weekLabel" stroke="hsl(var(--muted-foreground))" fontSize={11} angle={-15} textAnchor="end" height={60} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }}
                      formatter={(value: any, name: string) => {
                        if (name === "minutes") return [`${value} min`, "Total Study Time"];
                        if (name === "avgPerDay") return [`${value} min`, "Avg Per Day"];
                        return [value, name];
                      }}
                    />
                    <Legend />
                    <Bar dataKey="minutes" fill="#1D4ED8" radius={[8, 8, 0, 0]} name="Total Minutes" />
                    <Bar dataKey="avgPerDay" fill="#06b6d4" radius={[8, 8, 0, 0]} name="Avg/Day" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                  No weekly data yet. Study regularly to see weekly trends!
                </div>
              )}

              {/* Week-wise breakdown table */}
              {weeklyStats.length > 0 && (
                <div className="mt-4 space-y-2">
                  <h4 className="text-sm font-semibold text-muted-foreground">Week-wise Breakdown</h4>
                  <div className="space-y-2">
                    {[...weeklyStats].reverse().map((week) => (
                      <div key={week.weekLabel} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                        <span className="text-sm font-medium">{week.weekLabel}</span>
                        <div className="flex items-center gap-4">
                          <span className="text-xs text-muted-foreground">{week.sessions} sessions</span>
                          <span className="text-xs text-muted-foreground">~{week.avgPerDay}m/day</span>
                          <Badge variant="outline" className="text-blue-500 border-blue-500/30">
                            {formatMinutes(week.minutes)}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Month-wise Chart */}
        <TabsContent value="monthly" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Monthly Study Time</CardTitle>
              <CardDescription>Total minutes studied per month (last 6 months)</CardDescription>
            </CardHeader>
            <CardContent>
              {monthlyStats.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={monthlyStats}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }}
                      formatter={(value: any, name: string) => {
                        if (name === "minutes") return [`${value} min`, "Total Study Time"];
                        if (name === "daysActive") return [`${value}`, "Days Active"];
                        return [value, name];
                      }}
                    />
                    <Legend />
                    <Bar dataKey="minutes" fill="#f59e0b" radius={[8, 8, 0, 0]} name="Total Minutes" />
                    <Bar dataKey="daysActive" fill="#10b981" radius={[8, 8, 0, 0]} name="Days Active" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                  No monthly data yet. Study consistently to see monthly trends!
                </div>
              )}

              {/* Month-wise breakdown table */}
              {monthlyStats.length > 0 && (
                <div className="mt-4 space-y-2">
                  <h4 className="text-sm font-semibold text-muted-foreground">Month-wise Breakdown</h4>
                  <div className="space-y-2">
                    {[...monthlyStats].reverse().map((month) => (
                      <div key={month.month} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                        <span className="text-sm font-medium">{month.month}</span>
                        <div className="flex items-center gap-4">
                          <span className="text-xs text-muted-foreground">{month.sessions} sessions</span>
                          <span className="text-xs text-muted-foreground">{month.daysActive} days active</span>
                          <Badge variant="outline" className="text-amber-500 border-amber-500/30">
                            {formatMinutes(month.minutes)}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Session History */}
        <TabsContent value="history" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Recent Sessions</CardTitle>
              <CardDescription>Your last 15 study sessions</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <p className="text-muted-foreground">Loading sessions...</p>
              ) : pastSessions.length > 0 ? (
                <div className="space-y-3">
                  {pastSessions.slice(0, 15).map((session) => (
                    <div key={session.id} className="flex items-center justify-between p-3 bg-card/50 border border-border rounded-lg">
                      <div className="flex items-center gap-3">
                        <Clock className="h-4 w-4 text-primary" />
                        <div>
                          <p className="font-medium">
                            {new Date(session.started_at).toLocaleDateString()} at{" "}
                            {new Date(session.started_at).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {formatTime(session.duration_seconds)} • XP earned: +{Math.floor((session.duration_seconds / 60) * 5)}
                          </p>
                        </div>
                      </div>
                      <Badge variant="outline" className="text-primary border-primary/30">
                        {Math.round(session.duration_seconds / 60)}m
                      </Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-center py-8">No sessions yet. Start studying to see your sessions here!</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Tips */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5 text-cta" />
            Study Tips
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li>✓ The timer automatically pauses when you switch tabs or minimize the browser</li>
            <li>✓ If you don't return within 30 seconds, your session is auto-saved</li>
            <li>✓ Your session is saved securely (minimum 5 seconds)</li>
            <li>✓ You earn 5 XP per minute of study time</li>
            <li>✓ Consistent daily study builds your streak!</li>
            <li>✓ If you refresh the page, your session will be recovered automatically</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
};

export default TimerPage;
