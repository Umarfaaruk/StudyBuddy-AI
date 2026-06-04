import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight, Bot, BarChart3, Trophy, Timer } from "lucide-react";
import { motion } from "framer-motion";
import TextType from "@/components/ui/TextType";

const HeroSection = () => (
  <section className="relative min-h-[100svh] md:min-h-0 overflow-hidden bg-deep text-deep-foreground">
    <div className="container relative max-w-7xl mx-auto px-4 py-24 md:py-32 lg:py-40">
      <div className="grid lg:grid-cols-2 gap-16 items-center">
        {/* Left */}
        <div className="space-y-8">
          <div className="inline-flex items-center gap-2 bg-navy/80 border border-interface/30 rounded-full px-4 py-1.5 text-xs font-medium text-soft">
            <span className="h-1.5 w-1.5 rounded-full bg-highlight animate-pulse" />
            AI-Powered Learning Platform
          </div>

          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold leading-[1.1] tracking-tight min-h-[140px] md:min-h-[160px] lg:min-h-[180px]">
            <TextType
              text="Your AI Study Companion for Smarter Learning"
              typingSpeed={75}
              pauseDuration={3000}
              showCursor
              cursorCharacter="_"
              deletingSpeed={50}
              variableSpeed={false}
              cursorBlinkDuration={0.5}
              loop={false}
            />
          </h1>

          <p className="text-soft text-lg md:text-xl leading-relaxed max-w-lg">
            Solve homework instantly. Study with AI guidance. Track progress, compete with friends, and build daily study habits.
          </p>

          <div className="flex flex-wrap gap-4">
            <Button className="bg-highlight text-navy hover:bg-highlight/90 font-semibold text-sm h-12 px-7 rounded-xl gap-2" asChild>
              <Link to="/signup">
                Sign Up Free
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button variant="outline" className="border-interface/40 text-soft hover:text-highlight hover:border-highlight/50 h-12 px-7 rounded-xl gap-2 bg-transparent" asChild>
              <Link to="/login">
                Log In
              </Link>
            </Button>
          </div>

          <div className="flex items-center gap-6 pt-2 text-sm text-soft">
            <span className="flex items-center gap-1.5">✓ Free to start</span>
            <span className="flex items-center gap-1.5">✓ No credit card</span>
            <span className="flex items-center gap-1.5">✓ Instant AI access</span>
          </div>
        </div>

        {/* Right - Abstract UI Cards */}
        <div className="relative hidden lg:block">
          <div className="relative w-full h-[500px]">
            {/* Main dashboard card */}
            <motion.div
              className="absolute top-0 left-8 w-80 bg-navy/60 backdrop-blur-md border border-interface/20 rounded-2xl p-5 shadow-2xl cursor-pointer"
              animate={{ y: [0, -15, 0] }}
              transition={{ repeat: Infinity, duration: 6, ease: "easeInOut" }}
              whileHover={{ scale: 1.05, rotate: -2, zIndex: 50 }}
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="h-8 w-8 rounded-lg bg-interface/30 flex items-center justify-center">
                  <BarChart3 className="h-4 w-4 text-highlight" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-highlight">Study Dashboard</div>
                  <div className="text-xs text-soft">Today's Progress</div>
                </div>
              </div>
              <div className="space-y-3">
                <div className="flex justify-between text-xs text-soft">
                  <span>Mathematics</span><span className="text-highlight">85%</span>
                </div>
                <div className="h-2 bg-deep rounded-full overflow-hidden">
                  <div className="h-full w-[85%] bg-gradient-to-r from-interface to-highlight rounded-full" />
                </div>
                <div className="flex justify-between text-xs text-soft">
                  <span>Physics</span><span className="text-highlight">62%</span>
                </div>
                <div className="h-2 bg-deep rounded-full overflow-hidden">
                  <div className="h-full w-[62%] bg-gradient-to-r from-interface to-highlight rounded-full" />
                </div>
              </div>
            </motion.div>

            {/* AI Chat card */}
            <motion.div
              className="absolute top-32 right-0 w-72 bg-navy/60 backdrop-blur-md border border-interface/20 rounded-2xl p-4 shadow-2xl cursor-pointer"
              animate={{ y: [0, -20, 0] }}
              transition={{ repeat: Infinity, duration: 7, delay: 1, ease: "easeInOut" }}
              whileHover={{ scale: 1.05, rotate: 2, zIndex: 50 }}
            >
              <div className="flex items-center gap-2 mb-3">
                <Bot className="h-5 w-5 text-highlight" />
                <span className="text-sm font-semibold text-highlight">AI Tutor</span>
              </div>
              <div className="space-y-2">
                <div className="bg-deep/60 rounded-lg px-3 py-2 text-xs text-soft max-w-[85%]">
                  Explain the Pythagorean theorem
                </div>
                <div className="bg-interface/20 rounded-lg px-3 py-2 text-xs text-highlight/90 ml-auto max-w-[90%]">
                  The Pythagorean theorem states that a² + b² = c², where c is the hypotenuse...
                </div>
              </div>
            </motion.div>

            {/* Leaderboard card */}
            <motion.div
              className="absolute bottom-8 left-16 w-64 bg-navy/60 backdrop-blur-md border border-interface/20 rounded-2xl p-4 shadow-2xl cursor-pointer"
              animate={{ y: [0, -10, 0] }}
              transition={{ repeat: Infinity, duration: 5, delay: 2, ease: "easeInOut" }}
              whileHover={{ scale: 1.05, rotate: -1, zIndex: 50 }}
            >
              <div className="flex items-center gap-2 mb-3">
                <Trophy className="h-5 w-5 text-highlight" />
                <span className="text-sm font-semibold text-highlight">Leaderboard</span>
              </div>
              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between text-highlight">
                  <span>🥇 Sarah K.</span><span>2,450 XP</span>
                </div>
                <div className="flex items-center justify-between text-soft">
                  <span>🥈 Alex M.</span><span>2,120 XP</span>
                </div>
                <div className="flex items-center justify-between text-soft">
                  <span>🥉 You</span><span>1,890 XP</span>
                </div>
              </div>
            </motion.div>

            {/* Streak badge */}
            <motion.div
              className="absolute bottom-4 right-8 bg-navy/60 backdrop-blur-md border border-interface/20 rounded-xl px-4 py-3 shadow-2xl flex items-center gap-3 cursor-pointer"
              animate={{ y: [0, -12, 0] }}
              transition={{ repeat: Infinity, duration: 4.5, delay: 1.5, ease: "easeInOut" }}
              whileHover={{ scale: 1.05, rotate: 3, zIndex: 50 }}
            >
              <Timer className="h-5 w-5 text-highlight" />
              <div>
                <div className="text-sm font-bold text-highlight">7-Day Streak 🔥</div>
                <div className="text-xs text-soft">Keep going!</div>
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  </section>
);

export default HeroSection;
