import { useState, useEffect, useRef } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Bell, User, LogOut, Shield, Bot, Camera, AlertTriangle, FileImage, X, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { useNotifications } from "@/contexts/NotificationContext";
import { supabase } from "@/lib/supabase";
import { useQuery, useQueryClient } from "@tanstack/react-query";

const tabs = [
  { key: "profile", icon: User, label: "Profile" },
  { key: "notifications", icon: Bell, label: "Notifications" },
  { key: "security", icon: Shield, label: "Security" },
];

const Settings = () => {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const [activeTab, setActiveTab] = useState("profile");
  const queryClient = useQueryClient();
  const avatarInputRef = useRef<HTMLInputElement>(null);

  // Report issue form states
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("Bug");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("Medium");
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const { addNotification } = useNotifications();

  const handleScreenshotChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setFormErrors(prev => ({ ...prev, screenshot: "" }));
    if (!file) {
      setScreenshot(null);
      setScreenshotPreview(null);
      return;
    }

    if (!file.type.startsWith("image/")) {
      setFormErrors(prev => ({ ...prev, screenshot: "File must be an image (PNG, JPG, WEBP)" }));
      setScreenshot(null);
      setScreenshotPreview(null);
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setFormErrors(prev => ({ ...prev, screenshot: "Image size must be under 5MB" }));
      setScreenshot(null);
      setScreenshotPreview(null);
      return;
    }

    setScreenshot(file);
    const reader = new FileReader();
    reader.onloadend = () => {
      setScreenshotPreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleSubmitComplaint = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors: Record<string, string> = {};
    if (!title.trim()) errors.title = "Issue Title is required";
    if (!description.trim()) errors.description = "Description is required";

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    setSubmitting(true);
    const refToast = toast.loading("Submitting report...");
    try {
      let screenshotUrl = null;
      if (screenshot) {
        const fileExtension = screenshot.name.split(".").pop();
        const path = `${user!.uid}/${Date.now()}_screenshot.${fileExtension}`;
        const { error: upErr } = await supabase.storage
          .from("complaints")
          .upload(path, screenshot, { contentType: screenshot.type, upsert: true });
        if (!upErr) {
          screenshotUrl = supabase.storage.from("complaints").getPublicUrl(path).data.publicUrl;
        }
      }

      const complaintId = `CMP-${Math.floor(100000 + Math.random() * 900000)}`;
      const nowStr = new Date().toISOString();

      await supabase.from("complaints").insert({
        id: complaintId,
        user_id: user!.uid,
        title: title.trim(),
        category,
        description: description.trim(),
        screenshot: screenshotUrl,
        priority,
        status: "Pending",
        admin_notes: "",
        resolution_notes: "",
        created_at: nowStr,
        updated_at: nowStr,
      });

      const historyId = `HST-${Math.floor(100000 + Math.random() * 900000)}`;
      await supabase.from("complaint_history").insert({
        id: historyId,
        complaint_id: complaintId,
        old_status: "",
        new_status: "Pending",
        changed_by: "user",
        notes: "Complaint submitted",
        created_at: nowStr,
        user_id: user!.uid,
      });

      await addNotification({
        title: "Complaint Submitted",
        message: "Your issue has been received.",
        type: "system",
        icon: "⚠️"
      });

      toast.dismiss(refToast);
      toast.success(`Issue reported successfully! Reference: ${complaintId}`);

      setTitle("");
      setCategory("Bug");
      setDescription("");
      setPriority("Medium");
      setScreenshot(null);
      setScreenshotPreview(null);
      setFormErrors({});
      setIsReportModalOpen(false);
    } catch (error: any) {
      toast.dismiss(refToast);
      console.error("Error submitting complaint:", error);
      toast.error(error.message || "Failed to submit issue report");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Change password ────────────────────────────────────────────────
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);

  const handleChangePassword = async () => {
    if (!user?.email) {
      toast.error("You must be signed in to change your password.");
      return;
    }
    if (!currentPassword || !newPassword || !confirmPassword) {
      toast.error("Please fill in all password fields.");
      return;
    }
    if (newPassword.length < 6) {
      toast.error("New password must be at least 6 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("New password and confirmation do not match.");
      return;
    }
    if (newPassword === currentPassword) {
      toast.error("New password must be different from your current password.");
      return;
    }

    setChangingPassword(true);
    try {
      // Verify the current password by re-authenticating (this also refreshes
      // the session, which Supabase needs before a password update).
      const { error: reauthError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPassword,
      });
      if (reauthError) {
        toast.error("Your current password is incorrect.");
        return;
      }
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        toast.error(error.message || "Could not change password. Please try again.");
        return;
      }
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast.success("Password changed successfully.");
    } catch (err: any) {
      toast.error(err?.message || "Could not change password. Please try again.");
    } finally {
      setChangingPassword(false);
    }
  };

  // Load profile from Supabase
  const { data: profile } = useQuery({
    queryKey: ["settings-profile", user?.uid],
    queryFn: async () => {
      if (!user) return null;
      const { data } = await supabase.from("profiles").select("*").eq("id", user.uid).maybeSingle();
      return data ?? null;
    },
    enabled: !!user,
  });

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [university, setUniversity] = useState("");
  const [stream, setStream] = useState("");
  const [age, setAge] = useState("");
  const [bio, setBio] = useState("");
  const [place, setPlace] = useState("");

  // Initialize form fields from profile data
  useEffect(() => {
    if (profile) {
      setName(profile.full_name || user?.displayName || "");
      setEmail(user?.email || "");
      setUniversity(profile.university || "");
      setStream(profile.stream || "");
      setAge(profile.age || "");
      setBio(profile.bio || "");
      setPlace(profile.place || "");
    } else if (user) {
      setName(user.displayName || "");
      setEmail(user.email || "");
    }
  }, [profile, user]);

  const [notifications, setNotifications] = useState({ email: true, push: true, streak: true });
  const [tutorTone, setTutorTone] = useState<"academic" | "friendly" | "direct">("academic");
  const [socraticMethod, setSocraticMethod] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const handleSaveProfile = async () => {
    if (!user) return;
    setIsSaving(true);
    try {
      await supabase.from("profiles").update({
        full_name: name,
        university: university,
        stream: stream,
        age: age,
        bio: bio,
        place: place,
        email: email,
        updated_at: new Date().toISOString(),
      }).eq("id", user.uid);
      toast.success("Profile updated successfully");
    } catch (error) {
      console.error("Error updating profile:", error);
      toast.error("Failed to update profile");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto">
      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-6">
        <Link to="/dashboard" className="hover:text-foreground">Dashboard</Link>
        <span>›</span>
        <span className="text-foreground font-medium">Settings</span>
      </div>

      <div className="grid md:grid-cols-[220px_1fr] gap-8">
        {/* Left sidebar nav */}
        <div className="space-y-6">
          <div className="space-y-1">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Settings</h2>
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === tab.key
                    ? "text-accent bg-accent/10"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
              >
                <tab.icon className="h-4 w-4" />
                {tab.label}
              </button>
            ))}
          </div>

          {/* Report Issue card */}
          <button
            onClick={() => setIsReportModalOpen(true)}
            className="w-full text-left block relative overflow-hidden rounded-xl bg-gradient-to-br from-red-500/10 to-red-500/20 border border-red-500/20 p-4 text-foreground group hover-lift hover-glow transition-all"
          >
            <div className="absolute -bottom-4 -right-4 opacity-15 group-hover:opacity-25 transition-opacity text-red-500">
              <AlertTriangle className="h-16 w-16" />
            </div>
            <div className="relative z-10">
              <div className="h-8 w-8 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center justify-center mb-2">
                <AlertTriangle className="h-4 w-4 text-red-500" />
              </div>
              <h3 className="text-sm font-bold text-white">Report Issue</h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">Bugs or UI problems</p>
            </div>
          </button>

          {/* Plan badge */}
          <div className="bg-accent text-accent-foreground rounded-xl p-4 space-y-2">
            <div className="text-xs font-bold uppercase tracking-wider">Current Plan</div>
            <div className="text-lg font-bold">EduOnx Pro</div>
            <p className="text-xs opacity-80">Unlimited AI tutors & detailed progress analytics.</p>
            <Button size="sm" className="w-full bg-white/20 hover:bg-white/30 text-white text-xs mt-2">
              Manage Billing
            </Button>
          </div>
        </div>

        {/* Right content area */}
        <div className="space-y-6">
          {activeTab === "profile" && (
            <>
              {/* Personal Information */}
              <div className="bg-card border border-border rounded-xl p-6 space-y-5">
                <div className="flex items-center justify-between pb-4 border-b border-border">
                  <h3 className="font-bold text-foreground">Personal Information</h3>
                </div>

                {/* Avatar upload */}
                <div className="flex items-center gap-5">
                  <div 
                    className="relative h-16 w-16 rounded-full flex-shrink-0 cursor-pointer group"
                    onClick={() => avatarInputRef.current?.click()}
                    title="Change profile picture"
                  >
                    {profile?.avatar_url ? (
                      <img src={profile.avatar_url} alt="Avatar" className="h-16 w-16 rounded-full object-cover border-2 border-border group-hover:border-accent transition-colors" />
                    ) : (
                      <div className="h-16 w-16 rounded-full bg-primary flex items-center justify-center group-hover:bg-primary/80 transition-colors">
                        <User className="h-8 w-8 text-primary-foreground" />
                      </div>
                    )}
                    <div className="absolute -bottom-0.5 -right-0.5 h-6 w-6 rounded-full bg-card border-2 border-border flex items-center justify-center shadow-sm">
                      <Camera className="h-3 w-3 text-muted-foreground" />
                    </div>
                    <input
                      ref={avatarInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file || !user) return;
                        if (file.size > 2 * 1024 * 1024) { toast.error("Image must be under 2MB"); return; }
                        try {
                          const canvas = document.createElement('canvas');
                          const ctx = canvas.getContext('2d');
                          const img = document.createElement('img');
                          const reader = new FileReader();
                          reader.onload = async (ev) => {
                            img.onload = async () => {
                              const size = 200;
                              canvas.width = size; canvas.height = size;
                              const minDim = Math.min(img.width, img.height);
                              ctx?.drawImage(img, (img.width - minDim) / 2, (img.height - minDim) / 2, minDim, minDim, 0, 0, size, size);
                              const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
                              await supabase.from('profiles').update({ avatar_url: dataUrl }).eq('id', user.uid);
                              queryClient.invalidateQueries({ queryKey: ['settings-profile', user.uid] });
                              queryClient.invalidateQueries({ queryKey: ['profile', user.uid] });
                              toast.success('Profile picture updated!');
                            };
                            img.src = ev.target?.result as string;
                          };
                          reader.readAsDataURL(file);
                        } catch { toast.error('Failed to update picture'); }
                      }}
                    />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">Profile Picture</p>
                    <p className="text-xs text-muted-foreground">Click to upload (JPEG, PNG, WebP, max 2MB)</p>
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Full Name</label>
                    <Input value={name} onChange={(e) => setName(e.target.value)} className="h-10" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Email Address</label>
                    <Input value={email} onChange={(e) => setEmail(e.target.value)} className="h-10" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">University / School</label>
                    <Input value={university} onChange={(e) => setUniversity(e.target.value)} placeholder="Enter university" className="h-10" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Stream</label>
                    <Input value={stream} onChange={(e) => setStream(e.target.value)} placeholder="e.g. Science, Commerce, Arts" className="h-10" />
                  </div>
                </div>
                <div className="grid md:grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Age</label>
                    <Input type="number" min="10" max="99" value={age} onChange={(e) => setAge(e.target.value)} placeholder="Your age" className="h-10" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Place</label>
                    <Input value={place} onChange={(e) => setPlace(e.target.value)} placeholder="City, Country" className="h-10" />
                  </div>
                  <div className="space-y-1.5 md:col-span-1">
                    <label className="text-xs font-medium text-muted-foreground">Bio</label>
                    <Input value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Tell us about yourself" className="h-10" />
                  </div>
                </div>
              </div>

              {/* AI Tutor Preferences */}
              <div className="bg-card border border-border rounded-xl p-6 space-y-5">
                <h3 className="font-bold text-foreground pb-4 border-b border-border">AI Tutor Preferences</h3>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Bot className="h-5 w-5 text-accent" />
                    <div>
                      <div className="text-sm font-medium text-foreground">Socratic Method</div>
                      <div className="text-xs text-muted-foreground">AI will guide you with questions instead of giving answers directly.</div>
                    </div>
                  </div>
                  <button
                    onClick={() => setSocraticMethod(!socraticMethod)}
                    className={`h-6 w-11 rounded-full transition-colors flex-shrink-0 ${
                      socraticMethod ? "bg-accent" : "bg-muted"
                    }`}
                  >
                    <div className={`h-5 w-5 rounded-full bg-card shadow transition-transform ${
                      socraticMethod ? "translate-x-5" : "translate-x-0.5"
                    }`} />
                  </button>
                </div>
                <div className="space-y-2">
                  <div className="text-sm font-medium text-foreground">Tutor Personality Tone</div>
                  <div className="grid grid-cols-3 gap-3">
                    {(["academic", "friendly", "direct"] as const).map((tone) => (
                      <button
                        key={tone}
                        onClick={() => setTutorTone(tone)}
                        className={`px-4 py-2.5 rounded-lg text-sm font-medium border transition-colors capitalize ${
                          tutorTone === tone
                            ? "border-accent bg-accent/10 text-accent"
                            : "border-border text-muted-foreground hover:border-accent/30"
                        }`}
                      >
                        {tone === "academic" ? "✦ Academic" : tone === "friendly" ? "☺ Friendly" : "✦ Direct"}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Save */}
              <div className="flex items-center justify-between">
                <button className="text-sm text-destructive hover:underline">Deactivate Account</button>
                <div className="flex gap-3">
                  <Button variant="outline" size="sm">Cancel</Button>
                  <Button size="sm" className="bg-accent text-accent-foreground hover:bg-accent/90" onClick={handleSaveProfile} disabled={isSaving}>
                    {isSaving ? "Saving..." : "Save All Changes"}
                  </Button>
                </div>
              </div>
            </>
          )}

          {activeTab === "notifications" && (
            <div className="bg-card border border-border rounded-xl p-6 space-y-5">
              <h3 className="font-bold text-foreground pb-4 border-b border-border">Notification Preferences</h3>
              {[
                { key: "email", label: "Email notifications", desc: "Receive weekly progress reports" },
                { key: "push", label: "Push notifications", desc: "Get reminders to study" },
                { key: "streak", label: "Streak reminders", desc: "Don't lose your streak!" },
              ].map((n) => (
                <div key={n.key} className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-foreground">{n.label}</div>
                    <div className="text-xs text-muted-foreground">{n.desc}</div>
                  </div>
                  <button
                    onClick={() => setNotifications((p) => ({ ...p, [n.key]: !p[n.key as keyof typeof p] }))}
                    className={`h-6 w-11 rounded-full transition-colors ${
                      notifications[n.key as keyof typeof notifications] ? "bg-accent" : "bg-muted"
                    }`}
                  >
                    <div className={`h-5 w-5 rounded-full bg-card shadow transition-transform ${
                      notifications[n.key as keyof typeof notifications] ? "translate-x-5" : "translate-x-0.5"
                    }`} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {activeTab === "security" && (
            <div className="bg-card border border-border rounded-xl p-6 space-y-5">
              <div>
                <h3 className="font-bold text-foreground">Change Password</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Enter your current password, then choose a new one. Your password is stored securely by Supabase Authentication.
                </p>
              </div>
              <div className="space-y-3 max-w-md">
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Current password</label>
                  <Input
                    type="password"
                    autoComplete="current-password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="••••••••"
                    disabled={changingPassword}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1.5">New password</label>
                  <Input
                    type="password"
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="At least 6 characters"
                    disabled={changingPassword}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Confirm new password</label>
                  <Input
                    type="password"
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter new password"
                    disabled={changingPassword}
                    onKeyDown={(e) => { if (e.key === "Enter") handleChangePassword(); }}
                  />
                </div>
                <Button
                  onClick={handleChangePassword}
                  disabled={changingPassword}
                  className="gap-2 bg-primary hover:bg-primary/90 text-primary-foreground"
                >
                  {changingPassword && <Loader2 className="h-4 w-4 animate-spin" />}
                  {changingPassword ? "Updating…" : "Update Password"}
                </Button>
              </div>
            </div>
          )}



          {/* Sign out */}
          <Button
            variant="outline"
            onClick={async () => {
              try {
                await signOut();
                toast.success("Signed out successfully");
                navigate("/login");
              } catch (error) {
                toast.error("Failed to sign out");
              }
            }}
            className="w-full gap-2 border-destructive text-destructive hover:bg-destructive/10"
          >
            <LogOut className="h-4 w-4" /> Sign Out
          </Button>
        </div>
      </div>

      {/* Report Modal */}
      {isReportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsReportModalOpen(false)} />
          <div className="relative w-full max-w-lg bg-[#0F172A] border border-white/10 rounded-2xl shadow-2xl p-6 max-h-[90vh] overflow-y-auto scrollbar-thin animate-in fade-in zoom-in-95 duration-200 text-left">
            <button
              onClick={() => setIsReportModalOpen(false)}
              className="absolute top-4 right-4 text-white/40 hover:text-white p-1 rounded-lg hover:bg-white/5 transition-all"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="flex items-center gap-3 mb-5">
              <div className="h-10 w-10 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                <AlertTriangle className="h-5 w-5 text-red-500" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">Report an Issue</h2>
                <p className="text-xs text-muted-foreground">Tell us what's broken or needs improvement</p>
              </div>
            </div>

            <form onSubmit={handleSubmitComplaint} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-1.5">Issue Title <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    setFormErrors(prev => ({ ...prev, title: "" }));
                  }}
                  placeholder="Summarize the issue briefly..."
                  className={`w-full h-11 px-4 text-sm bg-white/5 border rounded-xl outline-none text-white focus:border-primary/50 transition-all ${
                    formErrors.title ? "border-red-500" : "border-white/10"
                  }`}
                />
                {formErrors.title && <p className="text-xs text-red-500 mt-1">{formErrors.title}</p>}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-1.5">Category <span className="text-red-500">*</span></label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full h-11 px-3 text-sm bg-white/5 border border-white/10 rounded-xl outline-none text-white focus:border-primary/50 transition-all"
                  >
                    {["Bug", "Feature Not Working", "UI Problem", "Performance Issue", "Account Issue", "Other"].map((cat) => (
                      <option key={cat} value={cat} className="bg-[#0F172A] text-white">{cat}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-1.5">Priority <span className="text-red-500">*</span></label>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value)}
                    className="w-full h-11 px-3 text-sm bg-white/5 border border-white/10 rounded-xl outline-none text-white focus:border-primary/50 transition-all"
                  >
                    {["Low", "Medium", "High", "Critical"].map((prio) => (
                      <option key={prio} value={prio} className="bg-[#0F172A] text-white">{prio}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-1.5">Description <span className="text-red-500">*</span></label>
                <textarea
                  value={description}
                  onChange={(e) => {
                    setDescription(e.target.value);
                    setFormErrors(prev => ({ ...prev, description: "" }));
                  }}
                  rows={4}
                  placeholder="Describe the steps to reproduce the issue or details of the problem..."
                  className={`w-full p-4 text-sm bg-white/5 border rounded-xl outline-none text-white focus:border-primary/50 transition-all resize-none ${
                    formErrors.description ? "border-red-500" : "border-white/10"
                  }`}
                />
                {formErrors.description && <p className="text-xs text-red-500 mt-1">{formErrors.description}</p>}
              </div>

              <div>
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-1.5">Attach Screenshot (Optional)</label>
                <div className="flex items-center gap-3">
                  <label className="flex items-center justify-center gap-2 h-11 px-4 border border-white/10 rounded-xl bg-white/5 text-xs text-white cursor-pointer hover:bg-white/10 active:bg-white/15 transition-all">
                    <FileImage className="h-4 w-4" />
                    Choose Image
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleScreenshotChange}
                    />
                  </label>
                  <div className="text-xs text-muted-foreground truncate max-w-[200px]">
                    {screenshot ? screenshot.name : "No file chosen"}
                  </div>
                </div>
                {formErrors.screenshot && <p className="text-xs text-red-500 mt-1">{formErrors.screenshot}</p>}
                {screenshotPreview && (
                  <div className="mt-3 relative inline-block">
                    <img src={screenshotPreview} alt="Preview" className="h-20 w-auto rounded-lg border border-white/10" />
                    <button
                      type="button"
                      onClick={() => {
                        setScreenshot(null);
                        setScreenshotPreview(null);
                      }}
                      className="absolute -top-1.5 -right-1.5 bg-red-500 hover:bg-red-600 text-white rounded-full p-0.5"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>

              <div className="pt-2 flex justify-end gap-3 border-t border-white/5">
                <button
                  type="button"
                  onClick={() => setIsReportModalOpen(false)}
                  className="h-11 px-5 border border-white/10 rounded-xl text-xs text-white hover:bg-white/5 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="h-11 px-5 bg-red-500 hover:bg-red-600 disabled:bg-red-500/50 text-white font-semibold rounded-xl text-xs flex items-center gap-2 transition-all"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Submitting...
                    </>
                  ) : (
                    "Submit Report"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Settings;
