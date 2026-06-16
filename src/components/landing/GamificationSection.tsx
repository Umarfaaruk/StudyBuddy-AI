import { Trophy, Star, Flame, Users, Medal } from "lucide-react";

const GamificationSection = () => (
  <section id="students" className="py-24 bg-transparent">
    <div className="container max-w-7xl mx-auto px-4">
      <div className="grid lg:grid-cols-2 gap-16 items-center">
        {/* Left visual */}
        <div className="space-y-4">
          {/* Leaderboard */}
          <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-5">
              <Trophy className="h-5 w-5 text-primary" />
              <span className="font-semibold text-slate-900">Weekly Leaderboard</span>
            </div>
            <div className="space-y-3">
              {[
                { rank: "🥇", name: "Sarah K.", xp: "2,450", badge: "Math Wizard" },
                { rank: "🥈", name: "Alex M.", xp: "2,120", badge: "Quiz Master" },
                { rank: "🥉", name: "Jordan P.", xp: "1,890", badge: "Streak King" },
                { rank: "4", name: "You", xp: "1,760", badge: "Rising Star", isYou: true },
              ].map((user, i) => (
                <div key={i} className={`flex items-center gap-4 px-4 py-3 rounded-xl ${user.isYou ? "bg-[#29ABE2] border border-[#29ABE2]" : "bg-slate-50"}`}>
                  <span className="text-lg w-8 text-center">{user.rank}</span>
                  <div className="flex-1">
                    <span className={`text-sm font-medium ${user.isYou ? "text-primary" : "text-slate-800"}`}>{user.name}</span>
                    <span className="ml-2 text-xs text-slate-500 bg-white border border-slate-100 px-2 py-0.5 rounded-full">{user.badge}</span>
                  </div>
                  <span className="text-sm font-bold text-primary">{user.xp} XP</span>
                </div>
              ))}
            </div>
          </div>

          {/* Activity feed */}
          <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <Users className="h-4 w-4 text-primary" />
              <span className="font-semibold text-sm text-slate-900">Friend Activity</span>
            </div>
            <div className="space-y-3 text-sm">
              <div className="flex items-center gap-3 text-slate-600">
                <Flame className="h-4 w-4 text-destructive" />
                <span><strong className="text-slate-900 font-semibold">Alex</strong> completed a 14-day streak</span>
              </div>
              <div className="flex items-center gap-3 text-slate-600">
                <Medal className="h-4 w-4 text-primary" />
                <span><strong className="text-slate-900 font-semibold">Sarah</strong> earned "Physics Pro" badge</span>
              </div>
              <div className="flex items-center gap-3 text-slate-600">
                <Star className="h-4 w-4 text-primary" />
                <span><strong className="text-slate-900 font-semibold">Jordan</strong> scored 98% on Calculus quiz</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right text */}
        <div className="space-y-6">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#29ABE2]">Social & Gamified</p>
          <h2 className="text-3xl md:text-4xl font-bold text-white tracking-tight">
            Study together. Improve faster.
          </h2>
          <p className="text-slate-300 text-lg leading-relaxed font-normal">
            Learning shouldn't be lonely. Earn XP for every study session, unlock badges for milestones, and compete with friends on weekly leaderboards. Motivation built into every interaction.
          </p>
          <div className="grid grid-cols-2 gap-4 pt-2">
            {[
              { label: "XP System", desc: "Earn points for every action" },
              { label: "Badges", desc: "Unlock achievements" },
              { label: "Leaderboards", desc: "Compete weekly" },
              { label: "Study Streaks", desc: "Build consistency" },
            ].map((item) => (
              <div key={item.label} className="bg-white border border-slate-100 rounded-xl p-4">
                <div className="text-sm font-semibold text-slate-900">{item.label}</div>
                <div className="text-xs text-slate-500 mt-1">{item.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  </section>
);

export default GamificationSection;
