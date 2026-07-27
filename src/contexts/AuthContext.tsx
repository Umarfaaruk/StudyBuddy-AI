import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

// FIX Bug 20: clear the study-session retry queue on sign out so one user's
// unsaved sessions are never flushed under another user's id on a shared browser.
import { RETRY_QUEUE_KEY } from "@/lib/studySession";

import { SITE_ORIGIN as CONFIGURED_ORIGIN } from "@/lib/canonicalDomain";

/**
 * Origin used to build every auth redirect URL (email confirmation, Google
 * OAuth callback, password reset).
 *
 * Prefers the configured custom domain so links stay on one origin, but only
 * if VITE_SITE_URL is a well-formed absolute URL — a typo here would send every
 * user who signs in to a dead address, and falling back to the origin they are
 * already browsing is always safe.
 *
 * Whichever origin wins must be listed under Supabase → Authentication → URL
 * Configuration → Redirect URLs, or the provider rejects the callback.
 */
const AUTH_ORIGIN = (() => {
  if (!CONFIGURED_ORIGIN) return window.location.origin;
  try {
    return new URL(CONFIGURED_ORIGIN).origin;
  } catch {
    console.error(
      `Malformed VITE_SITE_URL (${CONFIGURED_ORIGIN}); using ${window.location.origin} for auth redirects.`
    );
    return window.location.origin;
  }
})();

/**
 * AppUser — a thin, provider-agnostic shape.
 * We keep the field name `uid` rather than Supabase's `id` because ~134 call
 * sites across the app already read `user.uid`; renaming buys nothing and
 * touches every page.
 */
export interface AppUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
}

interface AuthResult {
  error: Error | null;
}

interface AuthContextType {
  user: AppUser | null;
  loading: boolean;
  signUp: (email: string, password: string, fullName: string) => Promise<AuthResult>;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signInWithGoogle: () => Promise<AuthResult>;
  sendPasswordReset: (email: string) => Promise<AuthResult>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function toAppUser(u: SupabaseUser | null | undefined): AppUser | null {
  if (!u) return null;
  const meta = (u.user_metadata ?? {}) as Record<string, unknown>;
  return {
    uid: u.id,
    email: u.email ?? null,
    displayName: (meta.full_name as string) ?? (meta.name as string) ?? null,
    photoURL: (meta.avatar_url as string) ?? (meta.picture as string) ?? null,
  };
}

/**
 * True when two AppUsers represent the same signed-in user. Used to KEEP the
 * previous object reference across Supabase auth events (token refresh, tab
 * focus, etc.) so `user` identity is stable — otherwise every event produces a
 * new object that re-fires effects and causes redirect loops / refetch storms.
 */
function sameUser(a: AppUser | null, b: AppUser | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.uid === b.uid && a.email === b.email
    && a.displayName === b.displayName && a.photoURL === b.photoURL;
}

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Seed from any persisted session, then subscribe to changes.
    // Keep the previous reference when the user is unchanged, so `user` identity
    // stays stable across token refreshes / focus events (prevents redirect loops).
    const apply = (sbUser: SupabaseUser | null | undefined) => {
      const next = toAppUser(sbUser);
      setUser((prev) => (sameUser(prev, next) ? prev : next));
      setLoading(false);
    };

    supabase.auth.getSession().then(({ data }) => apply(data.session?.user));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => apply(session?.user));

    return () => sub.subscription.unsubscribe();
  }, []);

  const signUp = async (email: string, password: string, fullName: string): Promise<AuthResult> => {
    // The DB trigger handle_new_user() creates the profile + streak rows from
    // this metadata, so no client-side profile write is needed.
    // emailRedirectTo sends the "Confirm email" link to /onboarding: confirming
    // establishes the session (detectSessionInUrl) and drops the new user
    // straight into onboarding, which then routes them to the dashboard.
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: `${AUTH_ORIGIN}/onboarding`,
      },
    });
    return { error: error ?? null };
  };

  const signIn = async (email: string, password: string): Promise<AuthResult> => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error ?? null };
  };

  const signInWithGoogle = async (): Promise<AuthResult> => {
    // OAuth is a full-page redirect (not a popup). After Google returns, the
    // session is picked up by onAuthStateChange and the user lands on /onboarding.
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${AUTH_ORIGIN}/onboarding`,
        queryParams: { prompt: "select_account" },
      },
    });
    return { error: error ?? null };
  };

  const sendPasswordReset = async (email: string): Promise<AuthResult> => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${AUTH_ORIGIN}/login`,
    });
    return { error: error ?? null };
  };

  const signOut = async () => {
    try {
      // Clear per-session local data and notepad drafts.
      Object.keys(localStorage).forEach((key) => {
        if (key.startsWith("session_") || key.startsWith("notes_")) {
          localStorage.removeItem(key);
        }
      });
      try { localStorage.removeItem(RETRY_QUEUE_KEY); } catch {}

      await supabase.auth.signOut();
    } catch (error) {
      console.error("Sign out error:", error);
      throw error;
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, signUp, signIn, signInWithGoogle, sendPasswordReset, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
};
