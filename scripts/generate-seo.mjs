/**
 * SEO PRERENDER  (Phase 4.1 / 4.7)
 * ================================
 * Post-build step. Emits a real HTML file per public route with correct
 * per-page metadata, plus a topic page for every syllabus chapter that has
 * published questions, plus sitemap.xml.
 *
 * WHY THIS AND NOT SSR: the app is a Vite SPA served from Vercel. Every route
 * currently returns the SAME index.html, so every page shares one <title> and
 * one description — search and social previews cannot tell them apart. Full SSR
 * would mean migrating to Next.js and rewriting routing, auth wiring and every
 * page shell. Emitting static HTML for the handful of PUBLIC routes gets the
 * crawlable metadata without touching the authenticated app at all.
 *
 * Vercel matches the filesystem BEFORE applying the SPA rewrite in vercel.json,
 * so a generated dist/<route>/index.html is served in preference to the
 * fallback. The SPA still hydrates over it, so users get the normal app.
 *
 * Content is placed INSIDE #root deliberately: React replaces it on mount, so
 * users never see it twice, while crawlers that do not execute JavaScript —
 * social scrapers especially — still get real text rather than an empty div.
 *
 * Degrades gracefully. If Supabase is unreachable at build time this logs and
 * skips the topic pages rather than failing the deploy; shipping without a few
 * SEO pages is far better than shipping nothing.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = resolve(ROOT, "dist");

/* ── Config ───────────────────────────────────────────────────────────────── */

function loadEnv() {
  const env = { ...process.env };
  for (const file of [".env", ".env.local"]) {
    const p = resolve(ROOT, file);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/i);
      if (!m) continue;
      const v = m[2].trim().replace(/^["']|["']$/g, "");
      if (v) env[m[1]] = v;
    }
  }
  return env;
}

const env = loadEnv();
const SUPABASE_URL = env.VITE_SUPABASE_URL;
const SUPABASE_KEY = env.VITE_SUPABASE_ANON_KEY;

// Absolute URLs are required in canonical/og tags — relative ones are ignored
// by most crawlers.
const SITE =
  (env.VITE_SITE_URL || env.PUBLIC_APP_URL || "https://study-buddy-ai-nu-seven.vercel.app")
    .replace(/\/+$/, "");

const slug = (s) =>
  String(s).toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const esc = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/* ── Template ─────────────────────────────────────────────────────────────── */

const shell = readFileSync(resolve(DIST, "index.html"), "utf8");

function renderPage({ path, title, description, bodyHtml, jsonLd }) {
  const url = `${SITE}${path}`;
  let html = shell;

  // Replace the shared defaults with this page's own metadata.
  html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>`);
  html = html.replace(
    /<meta name="description"[^>]*>/,
    `<meta name="description" content="${esc(description)}" />`
  );
  html = html.replace(
    /<meta property="og:title"[^>]*>/,
    `<meta property="og:title" content="${esc(title)}" />`
  );
  html = html.replace(
    /<meta property="og:description"[^>]*>/,
    `<meta property="og:description" content="${esc(description)}" />`
  );

  const extraHead =
    `<link rel="canonical" href="${esc(url)}" />\n` +
    `    <meta property="og:url" content="${esc(url)}" />\n` +
    (jsonLd
      ? `    <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>\n`
      : "");
  html = html.replace("</head>", `    ${extraHead}  </head>`);

  if (bodyHtml) {
    // Injected inside #root; React clears it on mount.
    html = html.replace(
      /<div id="root"><\/div>/,
      `<div id="root">${bodyHtml}</div>`
    );
  }
  return html;
}

function writePage(path, html) {
  const dir = path === "/" ? DIST : resolve(DIST, `.${path}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, "index.html"), html, "utf8");
}

/* ── Static public routes ─────────────────────────────────────────────────── */

const STATIC_PAGES = [
  {
    path: "/",
    title: "StudyBuddy AI — JEE, NEET & GATE preparation with an AI tutor",
    description:
      "Diagnostic-led practice for JEE, NEET and GATE: syllabus-grounded answers and a study plan built around your exam date. Free to start.",
  },
  {
    path: "/about",
    title: "About StudyBuddy AI",
    description:
      "Why StudyBuddy AI exists and how diagnostic-led, syllabus-grounded practice differs from generic AI tutoring.",
  },
  {
    path: "/free-test",
    title: "Free JEE, NEET & GATE diagnostic test — no signup",
    description:
      "Answer 8 questions and find the chapters costing you the most marks. No account needed.",
  },
  {
    path: "/most-improved",
    title: "Most improved students — StudyBuddy AI",
    description:
      "Measured score improvement between students' first and latest mock test, shared with their permission.",
  },
];

/* ── Topic pages from real syllabus + question data ───────────────────────── */

async function fetchTopics() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.warn("  [seo] Supabase not configured — skipping topic pages");
    return [];
  }

  const headers = { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` };
  const get = async (p) => {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${p}`, { headers });
    if (!r.ok) throw new Error(`${p} -> HTTP ${r.status}`);
    return r.json();
  };

  const [tracks, nodes, questions] = await Promise.all([
    get("exam_tracks?select=id,name&is_active=eq.true"),
    get("syllabus_nodes?select=id,exam_track_id,parent_id,name,level,code"),
    get("questions?select=syllabus_node_id&status=eq.published"),
  ]);

  const trackName = new Map(tracks.map((t) => [t.id, t.name]));
  const byId = new Map(nodes.map((n) => [n.id, n]));

  const counts = new Map();
  for (const q of questions) {
    if (!q.syllabus_node_id) continue;
    counts.set(q.syllabus_node_id, (counts.get(q.syllabus_node_id) ?? 0) + 1);
  }

  // Only chapters that actually HAVE questions. A page promising "practice
  // questions" that has none is a bad landing page and a thin-content signal.
  return nodes
    .filter((n) => n.level === "chapter" && (counts.get(n.id) ?? 0) > 0)
    .map((n) => {
      const parent = n.parent_id ? byId.get(n.parent_id) : null;
      return {
        id: n.id,
        chapter: n.name,
        subject: parent?.name ?? "General",
        trackId: n.exam_track_id,
        track: trackName.get(n.exam_track_id) ?? n.exam_track_id,
        count: counts.get(n.id) ?? 0,
        path: `/learn/${slug(n.exam_track_id)}/${slug(parent?.name ?? "general")}/${slug(n.name)}`,
      };
    });
}

function topicBody(t) {
  return (
    `<main><article>` +
    `<h1>${esc(t.track)} ${esc(t.subject)} — ${esc(t.chapter)} practice questions</h1>` +
    `<p>Practise ${t.count} ${esc(t.chapter)} question${t.count === 1 ? "" : "s"} for ${esc(t.track)} ${esc(t.subject)}, ` +
    `with worked explanations and spaced revision scheduled from how you actually perform.</p>` +
    `<p><a href="/free-test">Take a free 8-question diagnostic</a> to find your weakest chapters — no signup required.</p>` +
    `</article></main>`
  );
}

/* ── Run ──────────────────────────────────────────────────────────────────── */

console.log("\n[seo] generating static pages…");

if (!existsSync(DIST)) {
  console.error("[seo] dist/ not found — run the build first.");
  process.exit(1);
}

const urls = [];

for (const page of STATIC_PAGES) {
  writePage(page.path, renderPage(page));
  urls.push({ loc: `${SITE}${page.path}`, priority: page.path === "/" ? "1.0" : "0.7" });
}
console.log(`  ${STATIC_PAGES.length} static pages`);

let topics = [];
try {
  topics = await fetchTopics();
} catch (err) {
  // Never fail the deploy over SEO extras.
  console.warn(`  [seo] topic pages skipped: ${err.message}`);
}

for (const t of topics) {
  const title = `${t.track} ${t.subject} — ${t.chapter} practice questions | StudyBuddy AI`;
  const description =
    `Practise ${t.count} ${t.chapter} questions for ${t.track} ${t.subject}, ` +
    `with explanations and revision scheduled from your performance. Free diagnostic, no signup.`;

  writePage(t.path, renderPage({
    path: t.path,
    title,
    description,
    bodyHtml: topicBody(t),
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "LearningResource",
      name: `${t.chapter} practice questions`,
      educationalLevel: t.track,
      about: `${t.subject} — ${t.chapter}`,
      url: `${SITE}${t.path}`,
      provider: { "@type": "Organization", name: "StudyBuddy AI", url: SITE },
    },
  }));
  urls.push({ loc: `${SITE}${t.path}`, priority: "0.6" });
}
console.log(`  ${topics.length} topic pages`);

const today = new Date().toISOString().slice(0, 10);
const sitemap =
  `<?xml version="1.0" encoding="UTF-8"?>\n` +
  `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  urls
    .map((u) =>
      `  <url><loc>${esc(u.loc)}</loc><lastmod>${today}</lastmod><priority>${u.priority}</priority></url>`
    )
    .join("\n") +
  `\n</urlset>\n`;
writeFileSync(resolve(DIST, "sitemap.xml"), sitemap, "utf8");
console.log(`  sitemap.xml (${urls.length} urls)`);

// Point crawlers at the sitemap, and keep authenticated areas out of the index.
//
// The Disallow lines MUST sit inside the "User-agent: *" group with NO blank
// line before them. A blank line TERMINATES a group in robots.txt, so appending
// them to the end of the file leaves them attached to no user-agent at all and
// crawlers ignore them entirely — /dashboard and /admin would stay indexable.
//
// Rebuilt from the source file each time rather than patched in place, so a
// re-run is idempotent instead of stacking duplicate groups.
const robotsSrc = readFileSync(resolve(ROOT, "public", "robots.txt"), "utf8").replace(/\s*$/, "");
const disallow = [
  "Disallow: /dashboard",
  "Disallow: /admin",
  "Disallow: /onboarding",
  "Disallow: /profile",
  "Disallow: /settings",
].join("\n");

// Split into groups on blank lines, then extend the wildcard group in place.
const groups = robotsSrc.split(/\n\s*\n/).map((g) => g.trim()).filter(Boolean);
let wildcardFound = false;
const rebuilt = groups.map((g) => {
  if (/^User-agent:\s*\*/im.test(g)) {
    wildcardFound = true;
    return `${g}\n${disallow}`;
  }
  return g;
});
if (!wildcardFound) rebuilt.push(`User-agent: *\nAllow: /\n${disallow}`);

writeFileSync(
  resolve(DIST, "robots.txt"),
  `${rebuilt.join("\n\n")}\n\nSitemap: ${SITE}/sitemap.xml\n`,
  "utf8"
);
console.log("  robots.txt updated");

console.log("[seo] done\n");
