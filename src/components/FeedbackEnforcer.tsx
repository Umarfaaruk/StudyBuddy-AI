import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { MessageSquare, Star, Send, Loader2, X } from "lucide-react";
import { toast } from "sonner";

const FEEDBACK_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * FeedbackEnforcer — Checks if the user has submitted feedback recently.
 * If not, shows a blocking modal requiring them to submit before continuing.
 * 
 * Logic:
 * 1. Check the `feedback` table for user's most recent submission
 * 2. Also check `user_preferences/{uid}` for `last_feedback_at` timestamp
 * 3. If > 7 days since last feedback, show mandatory modal
 * 4. Users can only dismiss after submitting
 */
const FeedbackEnforcer = () => {
  const { user } = useAuth();
  const [showModal, setShowModal] = useState(false);
  const [checking, setChecking] = useState(true);
  const [rating, setRating] = useState(0);
  const [hoveredStar, setHoveredStar] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!user) {
      setChecking(false);
      return;
    }

    const checkFeedbackStatus = async () => {
      try {
        // Check user preferences for last feedback timestamp
        const { data: prefData } = await supabase
          .from("user_preferences")
          .select("last_feedback_at")
          .eq("user_id", user.uid)
          .maybeSingle();
        const lastFeedbackAt = (prefData as any)?.last_feedback_at;

        if (lastFeedbackAt) {
          const lastDate = new Date(lastFeedbackAt).getTime();
          if (Date.now() - lastDate < FEEDBACK_INTERVAL_MS) {
            setChecking(false);
            return;
          }
        }

        // Also check the feedback table directly — most recent first.
        const { data: feedbackRows } = await supabase
          .from("feedback")
          .select("created_at")
          .eq("user_id", user.uid)
          .order("created_at", { ascending: false })
          .limit(1);

        if (feedbackRows && feedbackRows.length > 0) {
          const createdAt = new Date(feedbackRows[0].created_at);
          if (Date.now() - createdAt.getTime() < FEEDBACK_INTERVAL_MS) {
            await supabase.from("user_preferences").upsert(
              { user_id: user.uid, last_feedback_at: createdAt.toISOString() },
              { onConflict: "user_id" }
            );
            setChecking(false);
            return;
          }
        }

        // No recent feedback — check if user account is at least 7 days old
        const { data: profileRow } = await supabase
          .from("profiles")
          .select("created_at")
          .eq("id", user.uid)
          .maybeSingle();
        if (profileRow?.created_at) {
          const accountAge = Date.now() - new Date(profileRow.created_at).getTime();
          if (accountAge < FEEDBACK_INTERVAL_MS) {
            setChecking(false);
            return;
          }
        }

        // Show the feedback modal
        setShowModal(true);
      } catch (error) {
        console.error("[FeedbackEnforcer] Check failed:", error);
        // Don't block on errors
      } finally {
        setChecking(false);
      }
    };

    checkFeedbackStatus();
  }, [user]);

  const handleSubmit = async () => {
    if (rating === 0) {
      toast.error("Please select a rating");
      return;
    }
    if (comment.trim().length < 5) {
      toast.error("Please write at least a short comment");
      return;
    }
    if (!user) return;

    setIsSubmitting(true);
    try {
      await supabase.from("feedback").insert({
        user_id: user.uid,
        rating,
        comment: comment.trim(),
        name: user.displayName || "User",
        email: user.email || "",
        platform: "web",
        version: "2.0",
        source: "enforced_modal",
      });

      // Update user preferences with the current timestamp
      await supabase.from("user_preferences").upsert(
        { user_id: user.uid, last_feedback_at: new Date().toISOString() },
        { onConflict: "user_id" }
      );

      toast.success("Thank you for your feedback! 🎉");
      setShowModal(false);
    } catch (error) {
      console.error("[FeedbackEnforcer] Submit error:", error);
      toast.error("Failed to submit. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!showModal || checking) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="bg-white rounded-2xl shadow-2xl w-[440px] max-w-[calc(100vw-32px)] overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-4 duration-300">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#29ABE2] to-[#29ABE2] px-6 py-5 text-white">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-white/20 flex items-center justify-center">
              <MessageSquare className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Weekly Feedback</h2>
              <p className="text-xs text-white/70">Help us improve EduOnx for you</p>
            </div>
            <button
              type="button"
              onClick={() => setShowModal(false)}
              aria-label="Close"
              className="ml-auto -mr-1 shrink-0 text-white/70 hover:text-white hover:bg-white/10 rounded-lg p-1.5 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5">
          <p className="text-sm text-gray-500">
            It's been a week! Please share your experience so we can make EduOnx better. This only takes a minute.
          </p>

          {/* Star Rating */}
          <div>
            <label className="text-sm font-semibold text-gray-900 block mb-2">
              How would you rate your experience?
            </label>
            <div className="flex gap-1.5">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  className="p-1 transition-transform hover:scale-110"
                  onMouseEnter={() => setHoveredStar(star)}
                  onMouseLeave={() => setHoveredStar(null)}
                  onClick={() => setRating(star)}
                >
                  <Star
                    className={`h-8 w-8 transition-colors ${
                      star <= (hoveredStar ?? rating)
                        ? "text-yellow-400 fill-yellow-400"
                        : "text-gray-200"
                    }`}
                  />
                </button>
              ))}
            </div>
          </div>

          {/* Comment */}
          <div>
            <label className="text-sm font-semibold text-gray-900 block mb-2">
              Tell us more
            </label>
            <textarea
              placeholder="What do you like? What can we improve? Any bugs or suggestions?"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              className="w-full h-24 px-3 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-[#29ABE2]/40 focus:ring-2 focus:ring-[#29ABE2]/10 text-gray-900 resize-none transition-all"
            />
          </div>

          {/* Submit Button */}
          <button
            onClick={handleSubmit}
            disabled={isSubmitting || rating === 0}
            className="w-full h-11 rounded-xl bg-[#29ABE2] text-white font-semibold text-sm hover:bg-[#29ABE2] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-all"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Submitting...
              </>
            ) : (
              <>
                <Send className="h-4 w-4" />
                Submit Feedback
              </>
            )}
          </button>

          <p className="text-[10px] text-gray-300 text-center">
            Your feedback helps us build a better learning experience for everyone.
          </p>
        </div>
      </div>
    </div>
  );
};

export default FeedbackEnforcer;
