import { User, Zap, Trophy, BookOpen, Clock, Flame, Settings, ArrowRight, Camera } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { doc, getDoc, updateDoc, collection, query, where, getDocs } from "firebase/firestore";
import { toast } from "sonner";
import { useRef } from "react";

const Profile = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ["profile", user?.uid],
    queryFn: async () => {
      if (!user) return null;
      try {
        const docRef = doc(db, "profiles", user.uid);
        const docSnap = await getDoc(docRef);
        return docSnap.exists() ? docSnap.data() : null;
      } catch (error) {
        console.error("[Profile] Profile load error:", error);
        throw error;
      }
    },
    enabled: !!user,
  });

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["profile-stats", user?.uid],
    queryFn: async () => {
      if (!user) return null;
      try {
        // Get XP logs
        const xpQ = query(collection(db, "xp_logs"), where("user_id", "==", user.uid));
        const xpDocs = await getDocs(xpQ);
        const totalXp = xpDocs.docs.reduce((sum, doc) => sum + (doc.data().xp_amount || 0), 0);

        // Get streak
        const streakRef = doc(db, "user_streaks", user.uid);
        const streakSnap = await getDoc(streakRef);
        const streak = streakSnap.exists() ? streakSnap.data() : { current_streak: 0, longest_streak: 0 };

        // Get quiz attempts
        const quizQ = query(collection(db, "quiz_attempts"), where("user_id", "==", user.uid));
        const quizDocs = await getDocs(quizQ);
        const quizCount = quizDocs.size;

        // Get study sessions
        const sessionsQ = query(collection(db, "study_sessions"), where("user_id", "==", user.uid));
        const sessionDocs = await getDocs(sessionsQ);
        const totalStudySeconds = sessionDocs.docs.reduce((sum, doc) => sum + (doc.data().duration_seconds || 0), 0);

        return {
          totalXp,
          level: Math.floor(totalXp / 200) + 1,
          levelProgress: totalXp % 200,
          streak: streak,
          quizCount: quizCount,
          lessonsCompleted: quizCount,
          studyHours: (totalStudySeconds / 3600).toFixed(1),
          badges: [],
        };
      } catch (error) {
        console.error("[Profile] Stats load error:", error);
        return {
          totalXp: 0,
          level: 1,
          levelProgress: 0,
          streak: { current_streak: 0 },
          quizCount: 0,
          lessonsCompleted: 0,
          studyHours: "0",
          badges: [],
        };
      }
    },
    enabled: !!user,
  });

  const isLoading = profileLoading || statsLoading;
  const displayName = profile?.full_name ?? "Student";
  const gradeLevel = profile?.grade_level ?? "—";
  const xpProgress = (stats?.totalXp ?? 0);
  const nextMilestone = Math.ceil(xpProgress / 500) * 500 || 500;
  const milestonePct = Math.round((xpProgress / nextMilestone) * 100);

  return (
    <div className="p-6 md:p-8 max-w-3xl mx-auto space-y-6">

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-gray-500">
        <Link to="/dashboard" className="hover:text-gray-900">Home</Link>
        <span>›</span>
        <span className="text-gray-900 font-medium">Profile</span>
      </div>

      {/* Profile header card */}
      <div className="bg-white border border-gray-100 shadow-sm rounded-2xl p-6 flex flex-col sm:flex-row items-center gap-6">
        {/* Avatar — clickable for upload */}
        <div 
          className="relative h-20 w-20 rounded-full flex-shrink-0 cursor-pointer group"
          onClick={() => avatarInputRef.current?.click()}
          title="Click to change profile picture"
        >
          {profile?.avatar_url ? (
            <img 
              src={profile.avatar_url} 
              alt={displayName}
              className="h-20 w-20 rounded-full object-cover border-2 border-gray-100 group-hover:border-[#1D4ED8] transition-colors"
            />
          ) : (
            <div className="h-20 w-20 rounded-full bg-[#1D4ED8] flex items-center justify-center group-hover:bg-[#1D4ED8]/80 transition-colors">
              <User className="h-10 w-10 text-white" />
            </div>
          )}
          <div className="absolute bottom-0 right-0 h-7 w-7 rounded-full bg-card border-2 border-gray-100 flex items-center justify-center shadow-sm group-hover:border-[#1D4ED8] transition-colors">
            <Camera className="h-3.5 w-3.5 text-gray-500 group-hover:text-[#1D4ED8]" />
          </div>
          <input
            ref={avatarInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file || !user) return;
              if (file.size > 2 * 1024 * 1024) {
                toast.error("Image must be under 2MB");
                return;
              }
              try {
                // Resize and compress to base64
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                const img = document.createElement('img');
                const reader = new FileReader();
                reader.onload = async (ev) => {
                  img.onload = async () => {
                    const size = 200;
                    canvas.width = size;
                    canvas.height = size;
                    // Center crop
                    const minDim = Math.min(img.width, img.height);
                    const sx = (img.width - minDim) / 2;
                    const sy = (img.height - minDim) / 2;
                    ctx?.drawImage(img, sx, sy, minDim, minDim, 0, 0, size, size);
                    const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
                    await updateDoc(doc(db, 'profiles', user.uid), { avatar_url: dataUrl });
                    queryClient.invalidateQueries({ queryKey: ['profile', user.uid] });
                    toast.success('Profile picture updated!');
                  };
                  img.src = ev.target?.result as string;
                };
                reader.readAsDataURL(file);
              } catch (err) {
                toast.error('Failed to update profile picture');
              }
            }}
          />
        </div>

        <div className="flex-1 text-center sm:text-left">
          {isLoading ? (
            <>
              <Skeleton className="h-6 w-40 mb-2 mx-auto sm:mx-0" />
              <Skeleton className="h-4 w-28 mx-auto sm:mx-0" />
            </>
          ) : (
            <>
              <h1 className="text-xl font-bold text-gray-900">{displayName}</h1>
              <p className="text-sm text-gray-500 mt-0.5">
                {gradeLevel}{profile?.stream ? ` · ${profile.stream}` : ""}{profile?.place ? ` · ${profile.place}` : ""}
              </p>
              {profile?.bio && (
                <p className="text-xs text-gray-500 mt-1 italic">{profile.bio}</p>
              )}
            </>
          )}

          {/* XP / Streak row */}
          <div className="flex items-center gap-4 mt-3 justify-center sm:justify-start flex-wrap">
            <div className="flex items-center gap-1">
              <Zap className="h-4 w-4 text-[#f4a261]" />
              <span className="text-sm font-bold text-gray-900">
                {(stats?.totalXp ?? 0).toLocaleString()} XP
              </span>
            </div>
            <div className="flex items-center gap-1">
              <Flame className="h-4 w-4 text-red-500" />
              <span className="text-sm font-bold text-gray-900">
                {stats?.streak?.current_streak ?? 0} days
              </span>
            </div>
          </div>

          {/* XP progress bar */}
          {!isLoading && (
            <div className="mt-3 max-w-xs mx-auto sm:mx-0">
              <div className="flex justify-between text-xs text-gray-500 mb-1">
                <span>{xpProgress.toLocaleString()} XP</span>
                <span>Next milestone: {nextMilestone.toLocaleString()} XP</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-green-500 rounded-full transition-all duration-700"
                  style={{ width: `${milestonePct}%` }}
                />
              </div>
            </div>
          )}
        </div>

        <Link to="/settings">
          <Button variant="outline" size="sm" className="gap-2 flex-shrink-0">
            <Settings className="h-4 w-4" /> Edit Profile
          </Button>
        </Link>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { icon: BookOpen,  label: "Lessons Done",   value: stats?.lessonsCompleted ?? 0,  color: "text-[#1D4ED8]" },
          { icon: Trophy,    label: "Quizzes Taken",  value: stats?.quizCount ?? 0,          color: "text-[#f4a261]" },
          { icon: Clock,     label: "Study Hours",    value: `${stats?.studyHours ?? "0.0"}h`, color: "text-green-500" },
          { icon: Flame,     label: "Best Streak",    value: `${stats?.streak?.longest_streak ?? 0}d`, color: "text-red-500" },
        ].map((s) => (
          <div key={s.label} className="bg-white border border-gray-100 shadow-sm rounded-2xl p-4 text-center">
            {isLoading ? (
              <>
                <Skeleton className="h-5 w-5 mx-auto mb-2" />
                <Skeleton className="h-6 w-12 mx-auto mb-1" />
                <Skeleton className="h-3 w-20 mx-auto" />
              </>
            ) : (
              <>
                <s.icon className={`h-5 w-5 ${s.color} mx-auto mb-2`} />
                <div className="text-xl font-bold text-gray-900">{s.value}</div>
                <div className="text-xs text-gray-500 mt-0.5">{s.label}</div>
              </>
            )}
          </div>
        ))}
      </div>

      {/* Recent badges */}
      {(stats?.badges?.length ?? 0) > 0 && (
        <div className="bg-white border border-gray-100 shadow-sm rounded-2xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-gray-900 text-sm">Recent Achievements</h3>
            <Link to="/achievements" className="text-xs text-[#1D4ED8] hover:underline flex items-center gap-1">
              View all <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {stats?.badges?.slice(0, 4).map((b) => (
              <div
                key={(b as { achievement_id: string }).achievement_id}
                className="bg-gray-100 rounded-lg p-3 text-center"
              >
                <div className="text-2xl mb-1">
                  {(b as { achievements?: { icon?: string } }).achievements?.icon ?? "🏆"}
                </div>
                <div className="text-xs font-medium text-gray-900 truncate">
                  {(b as { achievements?: { name?: string } }).achievements?.name ?? "Badge"}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick links */}
      <div className="grid grid-cols-2 gap-4">
        <Link
          to="/progress"
          className="flex items-center gap-3 bg-white border border-gray-100 shadow-sm rounded-2xl p-4 hover:border-[#1D4ED8]/40 transition-colors group"
        >
          <div className="h-9 w-9 rounded-lg bg-[#1D4ED8]/10 flex items-center justify-center">
            <Trophy className="h-4 w-4 text-[#1D4ED8]" />
          </div>
          <div>
            <div className="text-sm font-medium text-gray-900">View Progress</div>
            <div className="text-xs text-gray-500">Detailed analytics</div>
          </div>
          <ArrowRight className="h-4 w-4 text-gray-500 ml-auto group-hover:text-[#1D4ED8] transition-colors" />
        </Link>

        <Link
          to="/achievements"
          className="flex items-center gap-3 bg-white border border-gray-100 shadow-sm rounded-2xl p-4 hover:border-[#1D4ED8]/40 transition-colors group"
        >
          <div className="h-9 w-9 rounded-lg bg-[#f4a261]/10 flex items-center justify-center">
            <Zap className="h-4 w-4 text-[#f4a261]" />
          </div>
          <div>
            <div className="text-sm font-medium text-gray-900">Achievements</div>
            <div className="text-xs text-gray-500">Badges & rewards</div>
          </div>
          <ArrowRight className="h-4 w-4 text-gray-500 ml-auto group-hover:text-[#f4a261] transition-colors" />
        </Link>
      </div>
    </div>
  );
};

export default Profile;
