/**
 * LEGACY STORAGE CLEANUP
 * ======================
 * The rebrand renamed every localStorage key from `eduonx_*` to `studybuddy_*`.
 * Anyone who used the app under the old name still has the old entries sitting
 * in their browser, and nothing reads them any more — they would linger
 * indefinitely, taking up the origin's storage quota.
 *
 * These keys only ever held transient UI state (a running timer, the dragged
 * position of the chat widget, a retry queue for unsaved sessions). Everything
 * durable lives in Postgres, so dropping them loses nothing of value.
 *
 * Safe to run on every boot: once the keys are gone the loop finds nothing.
 */

const LEGACY_PREFIX = "eduonx_";

export function clearLegacyStorage(): void {
  try {
    // Collect first — removing while iterating localStorage's live index
    // shifts subsequent entries and silently skips keys.
    const stale: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(LEGACY_PREFIX)) stale.push(key);
    }
    stale.forEach((key) => localStorage.removeItem(key));
  } catch {
    // Private-browsing modes can throw on localStorage access. A failed
    // cleanup is cosmetic and must never block startup.
  }
}
