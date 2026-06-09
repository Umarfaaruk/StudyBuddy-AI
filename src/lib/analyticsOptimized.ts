/**
 * Optimized Analytics Aggregation Service
 * ========================================
 * Instead of multiple queries, aggregate XP and study time in a single operation.
 * Future: Move to Cloud Function for server-side aggregation.
 */

import { db } from "@/lib/firebase";
import { collection, query, where, getDocs, doc, getDoc } from "firebase/firestore";

export interface AggregatedUserStats {
  totalXp: number;
  totalStudySeconds: number;
  topicProgress: Record<string, { completedLessons: number; totalLessons: number }>;
  lastActivity: string | null;
}

/**
 * Fetch all user analytics in a single aggregated query batch.
 * Reduces N+1 query problem by batching related reads.
 * 
 * @param userId - User ID to fetch stats for
 * @returns Aggregated analytics data
 */
export async function fetchAggregatedUserStats(userId: string): Promise<AggregatedUserStats> {
  try {
    // Batch queries for parallel execution
    const [xpSnapshot, sessionsSnapshot, progressSnapshot] = await Promise.all([
      getDocs(query(collection(db, "xp_logs"), where("user_id", "==", userId))),
      getDocs(query(collection(db, "study_sessions"), where("user_id", "==", userId))),
      getDocs(query(collection(db, "lesson_progress"), where("user_id", "==", userId))),
    ]);

    // Aggregate XP
    let totalXp = 0;
    xpSnapshot.forEach((doc) => {
      totalXp += doc.data().xp_amount || 0;
    });

    // Aggregate study time and last activity
    let totalStudySeconds = 0;
    let lastActivity: string | null = null;
    sessionsSnapshot.forEach((doc) => {
      const data = doc.data();
      totalStudySeconds += data.duration_seconds || 0;
      const createdAt = data.created_at;
      if (createdAt) {
        const dateStr = createdAt.toDate?.() ? createdAt.toDate().toISOString() : String(createdAt);
        if (!lastActivity || dateStr > lastActivity) {
          lastActivity = dateStr;
        }
      }
    });

    // Aggregate topic progress
    const topicProgress: Record<string, { completedLessons: number; totalLessons: number }> = {};
    progressSnapshot.forEach((doc) => {
      const data = doc.data();
      const topicId = data.topic_id;
      if (topicId) {
        if (!topicProgress[topicId]) {
          topicProgress[topicId] = { completedLessons: 0, totalLessons: 0 };
        }
        if (data.completed_lessons) {
          topicProgress[topicId].completedLessons += data.completed_lessons.length;
        }
      }
    });

    return {
      totalXp,
      totalStudySeconds,
      topicProgress,
      lastActivity,
    };
  } catch (error) {
    console.error("[Analytics] Failed to fetch aggregated stats:", error);
    return {
      totalXp: 0,
      totalStudySeconds: 0,
      topicProgress: {},
      lastActivity: null,
    };
  }
}

/**
 * Cache-optimized profile fetch with timeout.
 * Returns cached value if available, falls back to fetch.
 * 
 * @param userId - User ID to fetch profile for
 * @returns User profile data
 */
const profileCache = new Map<string, { data: any; timestamp: number }>();
const PROFILE_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export async function getCachedUserProfile(userId: string): Promise<any | null> {
  const cached = profileCache.get(userId);
  const now = Date.now();

  // Return if cached and not expired
  if (cached && (now - cached.timestamp) < PROFILE_CACHE_TTL_MS) {
    return cached.data;
  }

  try {
    const docRef = doc(db, "profiles", userId);
    const docSnap = await Promise.race([
      getDoc(docRef),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Profile fetch timeout")), 10000)
      ),
    ]);

    const data = (docSnap as any).exists() ? (docSnap as any).data() : null;
    
    // Cache the result
    profileCache.set(userId, { data, timestamp: now });
    
    return data;
  } catch (error) {
    console.error("[Profile] Failed to fetch:", error);
    return null;
  }
}

/**
 * Clear cache (useful when profile is updated)
 */
export function clearProfileCache(userId?: string): void {
  if (userId) {
    profileCache.delete(userId);
  } else {
    profileCache.clear();
  }
}
