import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Star, MessageSquare, Send, Mail, User } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { db } from "@/lib/firebase";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { useAuth } from "@/contexts/AuthContext";

const feedbackSchema = z.object({
  rating: z.number().min(1, "Please select a rating").max(5),
  comment: z.string().min(10, "Comment must be at least 10 characters long").max(1000, "Comment is too long"),
  name: z.string().optional(),
  email: z.string().email("Invalid email address").optional().or(z.literal("")),
});

type FeedbackFormValues = z.infer<typeof feedbackSchema>;

const Feedback = () => {
  const { user } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hoveredStar, setHoveredStar] = useState<number | null>(null);

  const form = useForm<FeedbackFormValues>({
    resolver: zodResolver(feedbackSchema),
    defaultValues: {
      rating: 0,
      comment: "",
      name: user?.displayName || "",
      email: user?.email || "",
    },
  });

  const [submitted, setSubmitted] = useState(false);

  const onSubmit = async (data: FeedbackFormValues) => {
    setIsSubmitting(true);
    let retries = 0;
    const maxRetries = 2;

    while (retries <= maxRetries) {
      try {
        await addDoc(collection(db, "feedback"), {
          userId: user?.uid || "anonymous",
          rating: data.rating,
          comment: data.comment,
          name: data.name || "Anonymous",
          email: data.email || "",
          createdAt: serverTimestamp(),
          platform: "web",
          version: "2.0",
        });
        toast.success("Thank you for your feedback!");
        setSubmitted(true);
        form.reset({
          rating: 0,
          comment: "",
          name: user?.displayName || "",
          email: user?.email || "",
        });
        return;
      } catch (error: any) {
        retries++;
        console.error(`[Feedback] Submission attempt ${retries} failed:`, error);
        if (retries > maxRetries) {
          const errMsg = error?.code === "permission-denied"
            ? "Permission denied. Please make sure you're signed in."
            : error?.code === "unavailable"
            ? "Service temporarily unavailable. Please try again in a moment."
            : "Failed to submit feedback. Please try again later.";
          toast.error(errMsg);
        } else {
          await new Promise(r => setTimeout(r, 1000 * retries));
        }
      }
    }
    setIsSubmitting(false);
  };

  if (submitted) {
    return (
      <div className="container max-w-2xl py-16 px-4 text-center animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="inline-flex h-16 w-16 rounded-full bg-success/10 items-center justify-center mb-4">
          <MessageSquare className="h-8 w-8 text-success" />
        </div>
        <h2 className="text-2xl font-bold text-foreground mb-2">Thank You! 🎉</h2>
        <p className="text-muted-foreground mb-6">Your feedback has been submitted successfully. We appreciate your input!</p>
        <Button onClick={() => setSubmitted(false)} variant="outline" className="gap-2">
          <Send className="h-4 w-4" /> Submit More Feedback
        </Button>
      </div>
    );
  }

  return (
    <div className="container max-w-2xl py-8 px-4 md:py-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="mb-8 space-y-2">
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <MessageSquare className="h-8 w-8 text-primary" />
          We Value Your Feedback
        </h1>
        <p className="text-muted-foreground">
          Help us improve EduOnx by sharing your experience, suggestions, or reporting any issues.
        </p>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 border-border/50 shadow-sm">
        <div className="mb-4" >
          <h3 className="font-bold text-gray-900 text-lg" >Submit Feedback</h3>
          <p className="text-xs text-gray-400 mt-0.5" >
            Your thoughts matter to us. Let us know how we can make things better.
          </p>
        </div>
        <div >
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              
              {/* Rating Field */}
              <FormField
                control={form.control}
                name="rating"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-base">How would you rate your experience?</FormLabel>
                    <FormControl>
                      <div className="flex gap-2 items-center py-2">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <button
                            type="button"
                            key={star}
                            className={`p-2 rounded-full transition-all focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 ${
                              (hoveredStar !== null ? star <= hoveredStar : star <= field.value)
                                ? "text-yellow-400"
                                : "text-muted-foreground/30 hover:text-muted-foreground"
                            }`}
                            onMouseEnter={() => setHoveredStar(star)}
                            onMouseLeave={() => setHoveredStar(null)}
                            onClick={() => field.onChange(star)}
                          >
                            <Star className={`h-8 w-8 ${star <= field.value ? "fill-current" : ""}`} />
                          </button>
                        ))}
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Comments Field */}
              <FormField
                control={form.control}
                name="comment"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tell us more</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="What did you like? What can we improve?" 
                        className="min-h-[120px] resize-y"
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Name Field (Optional) */}
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name (Optional)</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <User className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                          <Input placeholder="John Doe" className="pl-9" {...field} />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Email Field (Optional) */}
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email (Optional)</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Mail className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                          <Input type="email" placeholder="john@example.com" className="pl-9" {...field} />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <Button type="submit" disabled={isSubmitting} className="w-full sm:w-auto">
                {isSubmitting ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-2" />
                    Submit Feedback
                  </>
                )}
              </Button>
            </form>
          </Form>
        </div>
      </div>
    </div>
  );
};

export default Feedback;
