/// <reference types="vite/client" />

interface ImportMetaEnv {
  // ── Supabase (backend: Auth + Postgres + Storage + Realtime) ──
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  // ── Error monitoring (optional) ──
  readonly VITE_SENTRY_DSN: string;
  readonly VITE_SENTRY_TRACES_SAMPLE_RATE: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
