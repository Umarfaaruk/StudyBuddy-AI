/**
 * Ensures a Firestore profile exists for Google OAuth users.
 * Email/password signups create profiles in AuthContext.signUp();
 * Google sign-in must call this on both Login and Signup flows.
 */
import { User } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

export async function ensureGoogleUserProfile(firebaseUser: User): Promise<void> {
  const profileRef = doc(db, "profiles", firebaseUser.uid);
  const existing = await getDoc(profileRef);
  if (existing.exists()) return;

  await setDoc(profileRef, {
    user_id: firebaseUser.uid,
    full_name: firebaseUser.displayName || "Student",
    email: firebaseUser.email || "",
    avatar_url: firebaseUser.photoURL || null,
    onboarding_completed: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
}
