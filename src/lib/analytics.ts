/**
 * EDUONX ANALYTICS SYSTEM
 * ======================
 * 
 * Comprehensive performance tracking and insights generation
 * Database Schema: Firebase Firestore
 */

/**
 * FIRESTORE COLLECTION STRUCTURE
 * =============================
 */

// Collection: study_sessions
// Stores individual study session records
// Example document: {
//   id: "session_12345",
//   user_id: "user_abc123",
//   started_at: "2024-04-20T10:30:00Z",
//   ended_at: "2024-04-20T11:15:00Z",
//   duration_seconds: 2700,
//   created_at: Timestamp,
//   pause_count: 3,
//   interruption_reason: "tab_switch" | "idle" | "manual",
// }

// Collection: xp_logs
// Tracks XP awarded for various activities
// Example document: {
//   id: "xp_12345",
//   user_id: "user_abc123",
//   xp_amount: 75,
//   source_type: "study_session" | "quiz" | "lesson" | "achievement" | "daily_login",
//   source_id: "session_12345" (reference),
//   created_at: Timestamp,
// }

// Collection: user_streaks
// Tracks daily study streaks
// Example document: {
//   user_id: "user_abc123",
//   current_streak: 15,
//   longest_streak: 42,
//   last_study_date: "2024-04-20",
//   updated_at: Timestamp,
// }

// Collection: profiles
// User profile and aggregated stats
// Example document: {
//   user_id: "user_abc123",
//   email: "user@example.com",
//   displayName: "John Doe",
//   total_xp: 5250,
//   level: 12,
//   total_study_hours: 156.5,
//   created_at: Timestamp,
//   updated_at: Timestamp,
// }

// Collection: quiz_results
// Stores quiz attempt results
// Example document: {
//   id: "quiz_result_12345",
//   user_id: "user_abc123",
//   quiz_id: "quiz_abc",
//   topic: "Algebra",
//   questions_total: 10,
//   questions_correct: 8,
//   score: 80,
//   time_spent: 600,
//   completed_at: Timestamp,
//   xp_earned: 50,
// }

// Collection: analytics_snapshots
// Daily aggregated analytics for efficient querying
// Example document: {
//   user_id: "user_abc123",
//   date: "2024-04-20",
//   study_minutes: 145,
//   session_count: 4,
//   xp_earned: 200,
//   quiz_count: 2,
//   quiz_avg_score: 82,
//   streak_maintained: true,
//   timestamp: Timestamp,
// }

// Collection: user_preferences
// User learning preferences and settings
// Example document: {
//   user_id: "user_abc123",
//   daily_goal_minutes: 60,
//   preferred_subjects: ["Math", "Science"],
//   difficulty_level: "medium",
//   notification_enabled: true,
//   theme: "dark",
//   updated_at: Timestamp,
// }

/**
 * FIRESTORE SECURITY RULES & INDEXES
 * ===================================
 * 
 * Recommended indexes for efficient queries:
 * 
 * 1. study_sessions collection:
 *    - user_id + created_at (for user's sessions)
 *    - user_id + started_at (for session recovery)
 * 
 * 2. xp_logs collection:
 *    - user_id + created_at (for user's XP history)
 *    - source_type + created_at (for analytics)
 * 
 * 3. analytics_snapshots collection:
 *    - user_id + date (for daily analytics)
 *    - user_id + created_at (for weekly/monthly queries)
 * 
 * 4. quiz_results collection:
 *    - user_id + completed_at (for user's quiz history)
 *    - topic + completed_at (for topic analytics)
 * 
 * Security Rules:
 * - Users can only read/write their own documents
 * - Admins can read all analytics
 * - Service functions can write to all collections
 */

import { collection, query, where, orderBy, limit, getDocs } from "firebase/firestore";
import { db } from "./firebase";
import { toDateKey } from "./utils";

/**
 * ANALYTICS DATA MODELS
 */

export interface StudySession {
  id: string;
  user_id: string;
  started_at: string;
  ended_at: string;
  duration_seconds: number;
  pause_count?: number;
  interruption_reason?: string;
  created_at: any;
}

export interface XpLog {
  id: string;
  user_id: string;
  xp_amount: number;
  source_type: "study_session" | "quiz" | "lesson" | "achievement" | "daily_login";
  source_id?: string;
  created_at: any;
}

export interface UserStreak {
  current_streak: number;
  longest_streak: number;
  last_study_date: string | null;
  updated_at?: any;
}

export interface AnalyticsSnapshot {
  user_id: string;
  date: string; // YYYY-MM-DD
  study_minutes: number;
  session_count: number;
  xp_earned: number;
  quiz_count: number;
  quiz_avg_score: number;
  streak_maintained: boolean;
  timestamp?: any;
}

export interface ProductivityScore {
  overall_score: number; // 0-100
  consistency_score: number; // Streak and daily consistency
  activity_score: number; // Total study time vs goal
  performance_score: number; // Quiz results
  trend: "improving" | "stable" | "declining";
  insights: string[];
}

/**
 * ANALYTICS QUERIES
 */

/**
 * Get user's study time for a given period
 */
async function getStudyTime(
  userId: string,
  period: "today" | "week" | "month" = "today"
): Promise<number> {
  const now = new Date();
  const startDate = new Date();

  switch (period) {
    case "today":
      startDate.setHours(0, 0, 0, 0);
      break;
    case "week":
      startDate.setDate(now.getDate() - 7);
      break;
    case "month":
      startDate.setMonth(now.getMonth() - 1);
      break;
  }

  const q = query(
    collection(db, "study_sessions"),
    where("user_id", "==", userId),
    where("created_at", ">=", startDate),
    orderBy("created_at", "desc")
  );

  const docs = await getDocs(q);
  const totalSeconds = docs.docs.reduce((sum, doc) => sum + (doc.data().duration_seconds || 0), 0);
  return Math.round(totalSeconds / 60); // Convert to minutes
}

/**
 * Get daily analytics snapshots for charting
 */
async function getDailyAnalytics(
  userId: string,
  days: number = 7
): Promise<AnalyticsSnapshot[]> {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const q = query(
    collection(db, "analytics_snapshots"),
    where("user_id", "==", userId),
    where("timestamp", ">=", startDate),
    orderBy("timestamp", "asc")
  );

  const docs = await getDocs(q);
  return docs.docs.map((doc) => doc.data() as AnalyticsSnapshot);
}

/**
 * Calculate productivity score for a user
 */
export async function calculateProductivityScore(
  userId: string,
  dailyGoalMinutes: number = 60
): Promise<ProductivityScore> {
  // Get streak
  const streakDoc = await getDocs(query(collection(db, "user_streaks"), where("__name__", "==", userId)));
  const streak = streakDoc.docs[0]?.data() as UserStreak | undefined;

  // Get this week's data
  const weekStudyMinutes = await getStudyTime(userId, "week");
  const dailyAnalytics = await getDailyAnalytics(userId, 7);

  // Get quiz results
  const quizQ = query(
    collection(db, "quiz_attempts"),
    where("user_id", "==", userId),
    orderBy("completed_at", "desc"),
    limit(10)
  );
  const quizDocs = await getDocs(quizQ);
  const avgQuizScore =
    quizDocs.docs.length > 0
      ? quizDocs.docs.reduce((sum, doc) => sum + (doc.data().score || 0), 0) / quizDocs.docs.length
      : 0;

  // Calculate component scores
  const consistencyScore = calculateConsistencyScore(streak, dailyAnalytics);
  const activityScore = Math.min((weekStudyMinutes / (dailyGoalMinutes * 7)) * 100, 100);
  const performanceScore = Math.min((avgQuizScore / 100) * 100, 100);
  const overallScore = (consistencyScore * 0.3 + activityScore * 0.4 + performanceScore * 0.3);

  // Determine trend
  let trend: "improving" | "stable" | "declining" = "stable";
  if (dailyAnalytics.length >= 2) {
    const recentAvg =
      dailyAnalytics.slice(-3).reduce((sum, d) => sum + d.study_minutes, 0) / Math.min(3, dailyAnalytics.length);
    const previousAvg =
      dailyAnalytics.slice(0, -3).reduce((sum, d) => sum + d.study_minutes, 0) / Math.max(1, dailyAnalytics.length - 3);
    if (recentAvg > previousAvg * 1.1) trend = "improving";
    else if (recentAvg < previousAvg * 0.9) trend = "declining";
  }

  // Generate insights
  const insights: string[] = [];
  if (streak?.current_streak === 0) insights.push("Start a new streak by studying today!");
  if (activityScore < 50) insights.push("Increase your daily study time to reach your goals.");
  if (avgQuizScore > 80) insights.push("Excellent quiz performance! Keep it up.");
  if (weekStudyMinutes >= dailyGoalMinutes * 7) insights.push("🎉 You've met your weekly goal!");

  return {
    overall_score: Math.round(overallScore),
    consistency_score: Math.round(consistencyScore),
    activity_score: Math.round(activityScore),
    performance_score: Math.round(performanceScore),
    trend,
    insights,
  };
}

/**
 * Calculate consistency score based on streak and regularity
 */
function calculateConsistencyScore(streak: UserStreak | undefined, dailyAnalytics: AnalyticsSnapshot[]): number {
  let score = 0;

  // Streak component (50 points max)
  if (streak) {
    const streakScore = Math.min((streak.current_streak / 30) * 50, 50);
    score += streakScore;
  }

  // Regularity component (50 points max)
  const daysWithStudy = dailyAnalytics.filter((d) => d.study_minutes > 0).length;
  const regularityScore = dailyAnalytics.length > 0
    ? (daysWithStudy / dailyAnalytics.length) * 50
    : 0;
  score += regularityScore;

  return Math.min(score, 100);
}



/**
 * Generate detailed performance insights
 */
export async function getPerformanceBreakdown(userId: string) {
  const today = new Date();
  const dailyAnalytics = await getDailyAnalytics(userId, 30);

  // Daily breakdown
  const daily = dailyAnalytics.filter((d) => {
    const date = new Date(d.timestamp?.toDate?.() || d.date);
    return date.toDateString() === today.toDateString();
  })[0];

  // Weekly breakdown
  const weekStart = new Date();
  weekStart.setDate(today.getDate() - today.getDay());
  weekStart.setHours(0, 0, 0, 0);

  const weeklyTotal = dailyAnalytics
    .filter((d) => {
      const date = new Date(d.timestamp?.toDate?.() || d.date);
      return date >= weekStart;
    })
    .reduce((sum, d) => sum + d.study_minutes, 0);

  // Monthly breakdown
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const monthlyTotal = dailyAnalytics
    .filter((d) => {
      const date = new Date(d.timestamp?.toDate?.() || d.date);
      return date >= monthStart;
    })
    .reduce((sum, d) => sum + d.study_minutes, 0);

  return {
    daily: {
      minutes: daily?.study_minutes || 0,
      sessions: daily?.session_count || 0,
      xp: daily?.xp_earned || 0,
      quizzes: daily?.quiz_count || 0,
    },
    weekly: {
      minutes: weeklyTotal,
      sessionCount: dailyAnalytics
        .filter((d) => {
          const date = new Date(d.timestamp?.toDate?.() || d.date);
          return date >= weekStart;
        })
        .reduce((sum, d) => sum + d.session_count, 0),
      avgDailyMinutes: Math.round(weeklyTotal / 7),
    },
    monthly: {
      minutes: monthlyTotal,
      daysActive: dailyAnalytics.filter((d) => d.study_minutes > 0).length,
      avgDailyMinutes: Math.round(monthlyTotal / 30),
    },
    breakdown: dailyAnalytics.slice(-7).map((d) => ({
      date: typeof d.date === "string" ? d.date : (d.timestamp?.toDate ? toDateKey(d.timestamp.toDate()) : ""),
      minutes: d.study_minutes,
      sessions: d.session_count,
      xp: d.xp_earned,
    })),
  };
}

/**
 * Get consistency metrics
 */
export async function getConsistencyMetrics(userId: string) {
  const dailyAnalytics = await getDailyAnalytics(userId, 30);

  // Calculate streaks
  let currentStreak = 0;
  let maxStreak = 0;
  let tempStreak = 0;

  // Sort by date ascending — use slice() to avoid mutating the original array
  const sortedAnalytics = dailyAnalytics.slice().sort((a, b) => {
    const dateA = new Date(typeof a.date === "string" ? a.date : a.timestamp?.toDate?.() || "");
    const dateB = new Date(typeof b.date === "string" ? b.date : b.timestamp?.toDate?.() || "");
    return dateA.getTime() - dateB.getTime();
  });

  for (const day of sortedAnalytics) {
    if (day.study_minutes > 0) {
      tempStreak++;
      if (tempStreak > maxStreak) maxStreak = tempStreak;
    } else {
      tempStreak = 0;
    }
  }

  // Check if today is part of current streak
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const lastStudyDate = sortedAnalytics[sortedAnalytics.length - 1];
  const lastDate = new Date(typeof lastStudyDate?.date === "string" ? lastStudyDate.date : lastStudyDate?.timestamp?.toDate?.() || "");
  lastDate.setHours(0, 0, 0, 0);

  if (lastDate.getTime() === today.getTime()) {
    currentStreak = tempStreak;
  } else {
    currentStreak = 0;
  }

  const daysActive = dailyAnalytics.filter((d) => d.study_minutes > 0).length;
  const avgDailyMinutes = dailyAnalytics.length > 0
    ? Math.round(dailyAnalytics.reduce((sum, d) => sum + d.study_minutes, 0) / dailyAnalytics.length)
    : 0;

  return {
    currentStreak,
    maxStreak,
    daysActive,
    totalDays: dailyAnalytics.length,
    consistency: Math.round((daysActive / Math.max(dailyAnalytics.length, 1)) * 100),
    avgDailyMinutes,
  };
}

