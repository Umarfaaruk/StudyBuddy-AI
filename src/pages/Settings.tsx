import { useState, useEffect, useRef } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Bell, User, LogOut, Shield, Bot, Camera } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { db } from "@/lib/firebase";
import { doc, getDoc, updateDoc } from "firebase/firestore";
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

  // Load profile from Firebase
  const { data: profile } = useQuery({
    queryKey: ["settings-profile", user?.uid],
    queryFn: async () => {
      if (!user) return null;
      const docRef = doc(db, "profiles", user.uid);
      const snap = await getDoc(docRef);
      return snap.exists() ? snap.data() : null;
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
      const docRef = doc(db, "profiles", user.uid);
      await updateDoc(docRef, {
        full_name: name,
        university: university,
        stream: stream,
        age: age,
        bio: bio,
        place: place,
        // email usually handled by Firebase Auth, but we can store it too
        email: email,
      });
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
                              await updateDoc(doc(db, 'profiles', user.uid), { avatar_url: dataUrl });
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
            <div className="bg-card border border-border rounded-xl p-6 space-y-4">
              <h3 className="font-bold text-foreground pb-4 border-b border-border">Security</h3>
              <Button variant="outline" size="sm">Change Password</Button>
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
    </div>
  );
};

export default Settings;
