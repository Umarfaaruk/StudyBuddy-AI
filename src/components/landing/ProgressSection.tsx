import { BarChart3, Clock, AlertTriangle, TrendingUp } from "lucide-react";

const ProgressSection = () => (
  <section className="py-24 bg-background">
    <div className="container max-w-7xl mx-auto px-4">
      <div className="grid lg:grid-cols-2 gap-16 items-center">
        {/* Left text */}
        <div className="space-y-6">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Progress & Analytics</p>
          <h2 className="text-3xl md:text-4xl font-bold text-foreground tracking-tight">
            Know exactly where you stand.
          </h2>
          <p className="text-muted-foreground text-lg leading-relaxed">
            Get a clear picture of your learning journey. Track study hours, visualize topic mastery, receive alerts for weak areas, and monitor performance trends — all in one beautiful dashboard.
          </p>
          <div className="space-y-4 pt-2">
            {[
              { icon: Clock, label: "Study hours tracked automatically" },
              { icon: BarChart3, label: "Topic mastery visualization" },
              { icon: AlertTriangle, label: "Weak topic alerts and suggestions" },
              { icon: TrendingUp, label: "Performance trend analysis" },
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg bg-secondary flex items-center justify-center">
                  <item.icon className="h-4 w-4 text-navy" />
                </div>
                <span className="text-sm text-foreground font-medium">{item.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Right dashboard visual */}
        <div className="bg-card border border-border rounded-2xl p-6 shadow-sm space-y-5">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-foreground">Weekly Overview</span>
            <span className="text-xs text-muted-foreground bg-muted px-3 py-1 rounded-full">This Week</span>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-4">
            {[
              { value: "12.5h", label: "Study Time", color: "text-accent" },
              { value: "89%", label: "Avg. Score", color: "text-accent" },
              { value: "7", label: "Day Streak", color: "text-destructive" },
            ].map((stat) => (
              <div key={stat.label} className="bg-muted/50 rounded-xl p-4 text-center">
                <div className={`text-2xl font-bold ${stat.color}`}>{stat.value}</div>
                <div className="text-xs text-muted-foreground mt-1">{stat.label}</div>
              </div>
            ))}
          </div>

          {/* Subject bars */}
          <div className="space-y-3">
            <div className="text-sm font-medium text-foreground">Topic Mastery</div>
            {[
              { subject: "Mathematics", pct: 92 },
              { subject: "Physics", pct: 78 },
              { subject: "Chemistry", pct: 65 },
              { subject: "Biology", pct: 85 },
            ].map((s) => (
              <div key={s.subject} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">{s.subject}</span>
                  <span className="text-accent font-medium">{s.pct}%</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-primary to-cta rounded-full transition-all"
                    style={{ width: `${s.pct}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Alert */}
          <div className="flex items-start gap-3 bg-secondary/50 rounded-xl px-4 py-3 border border-accent/10">
            <AlertTriangle className="h-4 w-4 text-accent mt-0.5 flex-shrink-0" />
            <div className="text-xs text-muted-foreground">
              <strong className="text-foreground">Suggestion:</strong> Your Chemistry scores dropped 12% this week. We recommend focusing on Organic Chemistry topics.
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
);

export default ProgressSection;
