import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import {
  User,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  updateProfile
} from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { doc, setDoc } from "firebase/firestore";

// FIX Bug 20: Import the retry queue key so we can clear it on sign out,
// preventing one user's unsaved sessions from being flushed under another
// user's UID when they log in on the same browser.
import { RETRY_QUEUE_KEY } from "@/lib/studySession";

interface AuthContextType {
  user: User | null;
  session: User | null;
  loading: boolean;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: Error | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const signUp = async (email: string, password: string, fullName: string) => {
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(userCredential.user, { displayName: fullName });

      await setDoc(doc(db, "profiles", userCredential.user.uid), {
        user_id: userCredential.user.uid,
        full_name: fullName,
        email: email,
        onboarding_completed: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      return { error: null };
    } catch (error: any) {
      return { error };
    }
  };

  const signIn = async (email: string, password: string) => {
    try {
      await signInWithEmailAndPassword(auth, email, password);
      return { error: null };
    } catch (error: any) {
      return { error };
    }
  };

  const signOut = async () => {
    try {
      // Clear session data and notepad drafts
      const keys = Object.keys(localStorage);
      keys.forEach((key) => {
        if (key.startsWith("session_") || key.startsWith("notes_")) {
          localStorage.removeItem(key);
        }
      });

      // FIX Bug 20: Clear the study session retry queue on sign out.
      // Without this, User A's failed sessions could be replayed under User B's
      // UID if they log in on the same browser.
      try { localStorage.removeItem(RETRY_QUEUE_KEY); } catch {}

      await firebaseSignOut(auth);
    } catch (error: any) {
      console.error("Sign out error:", error);
      throw error;
    }
  };

  return (
    <AuthContext.Provider value={{ user, session: user, loading, signUp, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
};
