import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// Validate Firebase environment variables
const requiredEnvVars = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_MEASUREMENT_ID',
  'VITE_FIREBASE_APP_ID'
];

const missingVars = requiredEnvVars.filter(v => !import.meta.env[v as keyof ImportMetaEnv]);
if (missingVars.length > 0) {
  console.error(
    `Missing Firebase environment variables:\n${missingVars.join('\n')}\n\n` +
    'Add these to your .env.local file. See README.md for details.'
  );
}

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

// ── Firebase Performance Monitoring ───────────────────────────────────────
// Auto-traces page loads and outgoing network requests, and supports custom
// traces (e.g. AI stream latency) via `trace(perf, name)`. Loaded lazily and
// only in the browser in production builds, so it adds zero dev-time noise and
// stays out of the critical render path. Uses the existing Firebase project —
// no extra account or DSN required.
export let perf: import("firebase/performance").FirebasePerformance | undefined;
if (typeof window !== "undefined" && import.meta.env.PROD) {
  import("firebase/performance")
    .then(({ getPerformance }) => {
      try {
        perf = getPerformance(app);
      } catch {
        /* non-fatal — monitoring must never break the app */
      }
    })
    .catch(() => { /* chunk load failure is non-fatal */ });
}
