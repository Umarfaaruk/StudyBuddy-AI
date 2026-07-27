/// <reference types="vite/client" />

interface ImportMetaEnv {
  // ── Supabase (backend: Auth + Postgres + Storage + Realtime) ──
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  // ── Canonical site URL (custom domain) ──
  readonly VITE_SITE_URL: string;
  // "true" to force-redirect other origins to VITE_SITE_URL. Only enable once
  // that domain is verified to serve this app — see lib/canonicalDomain.ts.
  readonly VITE_ENFORCE_CANONICAL_DOMAIN: string;
  // ── Error monitoring (optional) ──
  readonly VITE_SENTRY_DSN: string;
  readonly VITE_SENTRY_TRACES_SAMPLE_RATE: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
