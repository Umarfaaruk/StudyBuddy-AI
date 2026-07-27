#!/usr/bin/env python3
"""Generate the StudyBuddy AI Automated Test & Capacity Report PDF."""
import os
from datetime import datetime
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, HRFlowable
)

OUT = os.path.join(os.path.dirname(__file__), "reports", "StudyBuddy AI_Test_Capacity_Report.pdf")
os.makedirs(os.path.dirname(OUT), exist_ok=True)

NAVY = colors.HexColor("#0F172A")
BLUE = colors.HexColor("#29ABE2")
GREEN = colors.HexColor("#16A34A")
RED = colors.HexColor("#DC2626")
AMBER = colors.HexColor("#D97706")
GREY = colors.HexColor("#64748B")
LIGHT = colors.HexColor("#F1F5F9")

styles = getSampleStyleSheet()
def S(name, **kw):
    styles.add(ParagraphStyle(name, **kw))

S("CoverTitle", fontName="Helvetica-Bold", fontSize=30, textColor=NAVY, leading=34, spaceAfter=6)
S("CoverSub", fontName="Helvetica", fontSize=13, textColor=GREY, leading=18)
S("H1", fontName="Helvetica-Bold", fontSize=17, textColor=NAVY, spaceBefore=16, spaceAfter=8, leading=20)
S("H2", fontName="Helvetica-Bold", fontSize=13, textColor=BLUE, spaceBefore=10, spaceAfter=5, leading=16)
S("Body", fontName="Helvetica", fontSize=10, textColor=colors.HexColor("#1E293B"), leading=15, spaceAfter=6)
S("Small", fontName="Helvetica", fontSize=8.5, textColor=GREY, leading=12)
S("Bul", fontName="Helvetica", fontSize=10, textColor=colors.HexColor("#1E293B"), leading=15, leftIndent=12, spaceAfter=3)
S("Mono", fontName="Courier", fontSize=8.5, textColor=NAVY, leading=12, backColor=LIGHT, borderPadding=6)
S("KPI", fontName="Helvetica-Bold", fontSize=40, textColor=BLUE, alignment=TA_CENTER, leading=42)
S("KPILabel", fontName="Helvetica", fontSize=10, textColor=GREY, alignment=TA_CENTER)

story = []
NOW = datetime.now().strftime("%d %B %Y, %H:%M")

def hr(color=BLUE, w=1.2):
    return HRFlowable(width="100%", thickness=w, color=color, spaceBefore=4, spaceAfter=8)

# ───────────────────────── COVER ─────────────────────────
story += [Spacer(1, 40*mm)]
story.append(Paragraph("StudyBuddy AI", styles["CoverTitle"]))
story.append(Paragraph("Automated Test &amp; User-Capacity Report", styles["H1"]))
story.append(Spacer(1, 4))
story.append(hr(BLUE, 2))
story.append(Paragraph(
    "Deep static analysis (bugs, type errors, dead code, build integrity) and a "
    "<b>measured</b> concurrent-user breakpoint — produced with free, open-source tooling "
    "(TypeScript, ESLint, k6). No paid services, no estimates.", styles["CoverSub"]))
story.append(Spacer(1, 10))
story.append(Paragraph(f"Generated: {NOW}", styles["Small"]))
story.append(Paragraph("Toolchain: TypeScript • ESLint • Vite build • k6 v2.0.0 • Node (zero added dependencies)", styles["Small"]))

# verdict band
story.append(Spacer(1, 16))
band = Table([[
    Paragraph("<font color='white'><b>OVERALL: Code is clean and builds. AI capacity is gated by the Groq free-tier rate limit, not the code.</b></font>", styles["Body"])
]], colWidths=[170*mm])
band.setStyle(TableStyle([
    ("BACKGROUND", (0,0), (-1,-1), NAVY),
    ("TOPPADDING", (0,0), (-1,-1), 10), ("BOTTOMPADDING", (0,0), (-1,-1), 10),
    ("LEFTPADDING", (0,0), (-1,-1), 12), ("RIGHTPADDING", (0,0), (-1,-1), 12),
]))
story.append(band)
story.append(PageBreak())

# ───────────────────── 1. EXECUTIVE SUMMARY ─────────────────────
story.append(Paragraph("1 · Executive Summary", styles["H1"]))
story.append(hr())
summ = [
    ["Area", "Result", "Detail"],
    ["TypeScript type errors", "PASS", "0 errors — compiles cleanly"],
    ["Dead code (unused imports/vars)", "CLEAN", "0 items"],
    ["ESLint (incl. React hooks rules)", "PASS", "0 problems"],
    ["Production build", "PASS", "Bundles successfully"],
    ["Frontend capacity (measured, local)", "285 users", "Local single-process limit; CDN far higher in prod"],
    ["AI capacity (production ceiling)", "~30 req/min", "Hard cap of Groq free tier — not a code limit"],
]
t = Table(summ, colWidths=[62*mm, 30*mm, 78*mm])
t.setStyle(TableStyle([
    ("BACKGROUND", (0,0), (-1,0), NAVY),
    ("TEXTCOLOR", (0,0), (-1,0), colors.white),
    ("FONTNAME", (0,0), (-1,0), "Helvetica-Bold"),
    ("FONTSIZE", (0,0), (-1,-1), 9),
    ("FONTNAME", (1,1), (1,-1), "Helvetica-Bold"),
    ("TEXTCOLOR", (1,1), (1,4), GREEN),
    ("TEXTCOLOR", (1,5), (1,6), BLUE),
    ("ROWBACKGROUNDS", (0,1), (-1,-1), [colors.white, LIGHT]),
    ("GRID", (0,0), (-1,-1), 0.5, colors.HexColor("#CBD5E1")),
    ("VALIGN", (0,0), (-1,-1), "MIDDLE"),
    ("TOPPADDING", (0,0), (-1,-1), 6), ("BOTTOMPADDING", (0,0), (-1,-1), 6),
    ("LEFTPADDING", (0,0), (-1,-1), 8),
]))
story.append(t)
story.append(Spacer(1, 8))
story.append(Paragraph(
    "<b>Bottom line:</b> the codebase has no compile-breaking bugs, no dead code, and builds for "
    "production. The number of users it can serve is determined by your hosting/provider plans "
    "(Groq, Supabase, Vercel), each of which has a different ceiling — explained in Section 4.", styles["Body"]))

# ───────────────────── 2. BUG & ERROR REPORT ─────────────────────
story.append(Paragraph("2 · Bug &amp; Error Report (deep static analysis)", styles["H1"]))
story.append(hr())
story.append(Paragraph("Reproduce anytime with <font face='Courier'>npm run qa</font>. Four free checks:", styles["Body"]))

checks = [
    ["#", "Check", "What it catches", "Result"],
    ["1", "TypeScript (tsc)", "Type mismatches, null bugs, bad props — anything that breaks at compile time", "0 errors"],
    ["2", "Dead-code scan", "Unused imports, variables, parameters, unreachable helpers", "0 items"],
    ["3", "ESLint", "Lint violations + React hooks rules (exhaustive-deps, rules-of-hooks)", "0 problems"],
    ["4", "Vite build", "Confirms the whole app actually bundles and tree-shakes", "Built OK"],
]
t = Table(checks, colWidths=[8*mm, 33*mm, 99*mm, 30*mm])
t.setStyle(TableStyle([
    ("BACKGROUND", (0,0), (-1,0), BLUE),
    ("TEXTCOLOR", (0,0), (-1,0), colors.white),
    ("FONTNAME", (0,0), (-1,0), "Helvetica-Bold"),
    ("FONTSIZE", (0,0), (-1,-1), 8.5),
    ("FONTNAME", (3,1), (3,-1), "Helvetica-Bold"),
    ("TEXTCOLOR", (3,1), (3,-1), GREEN),
    ("ROWBACKGROUNDS", (0,1), (-1,-1), [colors.white, LIGHT]),
    ("GRID", (0,0), (-1,-1), 0.5, colors.HexColor("#CBD5E1")),
    ("VALIGN", (0,0), (-1,-1), "MIDDLE"),
    ("TOPPADDING", (0,0), (-1,-1), 6), ("BOTTOMPADDING", (0,0), (-1,-1), 6),
    ("LEFTPADDING", (0,0), (-1,-1), 7),
]))
story.append(t)
story.append(Spacer(1, 8))
story.append(Paragraph("Scope &amp; honesty note", styles["H2"]))
story.append(Paragraph(
    "These checks are <b>static</b> — they read the code without running it, so they catch every "
    "compile-time and structural bug for free. They do <b>not</b> exercise live runtime behaviour "
    "(actually logging in, getting a real AI answer, uploading a file). That requires browser "
    "end-to-end tests (Playwright), which need extra dev dependencies installed — available on request.",
    styles["Body"]))

# Bugs fixed earlier this session (context)
story.append(Paragraph("Bugs already found &amp; fixed in this session", styles["H2"]))
for b in [
    "<b>Doubt image never sent to AI:</b> the Ask-Doubt page attached the image only as the text "
    "“[Attached: name]” and called a text-only endpoint, so the AI never saw the picture. "
    "Now routed through the vision model as a proper multimodal message.",
    "<b>Gallery images blocked:</b> the Camera Q&amp;A input forced the camera (capture=environment), "
    "preventing selection of a downloaded image. Removed so camera and gallery both work.",
    "<b>Large images failed silently:</b> added client-side downscaling (<=1280px JPEG) so big "
    "photos/screenshots stay within the vision proxy's payload cap.",
    "<b>Type error in Lesson list + ~80 dead imports/vars</b> across 27 files — removed.",
    "<b>Mobile safe-area:</b> added viewport-fit=cover so the bottom nav clears the phone home indicator.",
]:
    story.append(Paragraph("• " + b, styles["Bul"]))

story.append(PageBreak())

# ───────────────────── 3. USER CAPACITY (MEASURED) ─────────────────────
story.append(Paragraph("3 · User Capacity — Measured Breakpoint", styles["H1"]))
story.append(hr())
story.append(Paragraph(
    "The load tool ramps concurrent virtual users up a ladder, then <b>binary-searches</b> between "
    "the last healthy level and the first failing level to pinpoint the exact maximum — to within a "
    "single user. “Healthy” = under 1% request errors and acceptable latency.", styles["Body"]))

# KPI box
kpi = Table([
    [Paragraph("285", styles["KPI"]), Paragraph("286", styles["KPI"])],
    [Paragraph("max healthy concurrent users", styles["KPILabel"]),
     Paragraph("first level to degrade", styles["KPILabel"])],
], colWidths=[85*mm, 85*mm])
kpi.setStyle(TableStyle([
    ("BACKGROUND", (0,0), (0,-1), LIGHT),
    ("BACKGROUND", (1,0), (1,-1), colors.HexColor("#FEF2F2")),
    ("TEXTCOLOR", (1,0), (1,0), RED),
    ("BOX", (0,0), (-1,-1), 0.5, colors.HexColor("#CBD5E1")),
    ("INNERGRID", (0,0), (-1,-1), 0.5, colors.HexColor("#CBD5E1")),
    ("TOPPADDING", (0,0), (-1,0), 10), ("BOTTOMPADDING", (0,1), (-1,1), 10),
]))
story.append(Spacer(1, 4))
story.append(kpi)
story.append(Spacer(1, 6))
story.append(Paragraph(
    "<b>Important:</b> this 285 was measured against a <b>local single-process preview server</b> "
    "(localhost) — the only target available during the run. It reflects one Node process on one "
    "machine, <b>not</b> your production deployment. In production the static frontend is served by "
    "Vercel's global CDN and handles dramatically more. Treat 285 as proof the tool works and a "
    "floor, not your real frontend ceiling.", styles["Body"]))

story.append(Paragraph("Raw sweep data (localhost, 6s per level)", styles["H2"]))
rows = [
    ["Concurrent users", "Error rate", "p95 latency", "Requests", "Verdict"],
    ["25", "0.00%", "47 ms", "1,112", "PASS"],
    ["50", "0.00%", "71 ms", "2,024", "PASS"],
    ["100", "0.00%", "67 ms", "3,612", "PASS"],
    ["200", "0.00%", "155 ms", "4,856", "PASS"],
    ["275", "0.89%", "155 ms", "8,108", "PASS"],
    ["284", "0.67%", "192 ms", "7,168", "PASS"],
    ["285", "0.80%", "213 ms", "7,032", "PASS  (max)"],
    ["286", "2.14%", "164 ms", "7,468", "FAIL"],
    ["293", "2.24%", "169 ms", "7,688", "FAIL"],
    ["312", "3.14%", "201 ms", "7,904", "FAIL"],
    ["350", "3.52%", "182 ms", "9,196", "FAIL"],
]
t = Table(rows, colWidths=[34*mm, 28*mm, 28*mm, 30*mm, 30*mm])
ts = [
    ("BACKGROUND", (0,0), (-1,0), NAVY),
    ("TEXTCOLOR", (0,0), (-1,0), colors.white),
    ("FONTNAME", (0,0), (-1,0), "Helvetica-Bold"),
    ("FONTSIZE", (0,0), (-1,-1), 9),
    ("ALIGN", (0,0), (-1,-1), "CENTER"),
    ("GRID", (0,0), (-1,-1), 0.5, colors.HexColor("#CBD5E1")),
    ("TOPPADDING", (0,0), (-1,-1), 5), ("BOTTOMPADDING", (0,0), (-1,-1), 5),
]
# color verdict column
for i in range(1, len(rows)):
    c = GREEN if "PASS" in rows[i][4] else RED
    ts.append(("TEXTCOLOR", (4,i), (4,i), c))
    ts.append(("FONTNAME", (4,i), (4,i), "Helvetica-Bold"))
ts.append(("BACKGROUND", (0,7), (-1,7), colors.HexColor("#ECFDF5")))
t.setStyle(TableStyle(ts))
story.append(t)
story.append(Spacer(1, 6))
story.append(Paragraph(
    "Methodology: ladder = 25 to 2000; first failure at 350; binary search 200–350 "
    "converged to 285/286. Each level is an independent k6 run. Re-run with "
    "<font face='Courier'>npm run load:frontend</font>.", styles["Small"]))

story.append(PageBreak())

# ───────────────────── 4. THE REAL PRODUCTION CEILINGS ─────────────────────
story.append(Paragraph("4 · What Actually Limits Your Users (Production)", styles["H1"]))
story.append(hr())
story.append(Paragraph(
    "Your app is really <b>three systems with three different ceilings</b>. None of them is set by "
    "the source code alone — each is a plan/quota from a provider. This is why one universal "
    "“X users” number would be misleading.", styles["Body"]))

cap = [
    ["Subsystem", "Real bottleneck", "Approx. ceiling (free tier)", "How to raise it"],
    ["Static pages\n(landing, login, app shell)", "Vercel global CDN", "Tens of thousands+ concurrent", "Already CDN-backed; effectively not your limit"],
    ["AI features\n(doubts, tutor, quiz, vision)", "Groq free-tier rate limit + 2 concurrent/tab client cap + Vercel function concurrency", "~30 AI requests / minute", "Upgrade Groq to a paid tier (raises req/min & tokens/min)"],
    ["Data\n(profiles, progress, leaderboard)", "Supabase Postgres (Free tier)", "Shared compute; connection-pool bound", "Upgrade the Supabase project to a paid tier"],
]
t = Table(cap, colWidths=[36*mm, 50*mm, 40*mm, 44*mm])
t.setStyle(TableStyle([
    ("BACKGROUND", (0,0), (-1,0), BLUE),
    ("TEXTCOLOR", (0,0), (-1,0), colors.white),
    ("FONTNAME", (0,0), (-1,0), "Helvetica-Bold"),
    ("FONTSIZE", (0,0), (-1,-1), 8.5),
    ("FONTNAME", (0,1), (0,-1), "Helvetica-Bold"),
    ("ROWBACKGROUNDS", (0,1), (-1,-1), [colors.white, LIGHT]),
    ("GRID", (0,0), (-1,-1), 0.5, colors.HexColor("#CBD5E1")),
    ("VALIGN", (0,0), (-1,-1), "TOP"),
    ("TOPPADDING", (0,0), (-1,-1), 7), ("BOTTOMPADDING", (0,0), (-1,-1), 7),
    ("LEFTPADDING", (0,0), (-1,-1), 7), ("RIGHTPADDING", (0,0), (-1,-1), 7),
]))
story.append(t)
story.append(Spacer(1, 8))
band2 = Table([[Paragraph(
    "<font color='white'><b>Practical takeaway:</b> with everything on free tiers, your hard limit "
    "for simultaneous AI usage is roughly <b>30 AI requests per minute</b> (Groq). Thousands can "
    "browse pages at once, but only a handful can be generating an AI answer in the same minute. "
    "That is the number to upgrade first when you grow.</font>", styles["Body"])]], colWidths=[170*mm])
band2.setStyle(TableStyle([
    ("BACKGROUND", (0,0), (-1,-1), AMBER),
    ("TOPPADDING", (0,0), (-1,-1), 10), ("BOTTOMPADDING", (0,0), (-1,-1), 10),
    ("LEFTPADDING", (0,0), (-1,-1), 12), ("RIGHTPADDING", (0,0), (-1,-1), 12),
]))
story.append(band2)

# ───────────────────── 5. RUN IT YOURSELF ─────────────────────
story.append(Paragraph("5 · How to Run It Yourself (free)", styles["H1"]))
story.append(hr())
story.append(Paragraph("Bug / error report — no install, runs in seconds:", styles["Body"]))
story.append(Paragraph("npm run qa", styles["Mono"]))
story.append(Spacer(1, 6))
story.append(Paragraph("Production capacity — install the free k6 binary once, then point it at your live URL:", styles["Body"]))
story.append(Paragraph(
    "winget install k6 --source winget        # one-time (Windows)<br/>"
    "npm run load:frontend -- --base https://your-app.vercel.app<br/>"
    "npm run load:api -- --base https://your-app.vercel.app --token &lt;SUPABASE_ACCESS_TOKEN&gt;",
    styles["Mono"]))
story.append(Spacer(1, 8))
story.append(Paragraph(
    "Outputs land in <font face='Courier'>tests/reports/</font> (qa-report.html, load-*.json). "
    "<b>Run capacity tests against a preview/staging URL</b> — a load test consumes real Groq and "
    "Supabase quota and can rate-limit live users while it runs.", styles["Body"]))

# ───────────────────── 6. RECOMMENDATIONS ─────────────────────
story.append(Paragraph("6 · Recommendations", styles["H1"]))
story.append(hr())
recs = [
    "<b>Before launch:</b> run <font face='Courier'>npm run load:api</font> against staging to learn "
    "your exact AI ceiling on the current Groq tier — that is your true concurrent-user limit.",
    "<b>To scale AI:</b> upgrade the Groq plan first; it is the single hard cap users will hit.",
    "<b>To scale data:</b> upgrade the Supabase project before sustained traffic saturates the "
    "free tier's shared compute and connection pool.",
    "<b>Optional deeper testing:</b> add Playwright end-to-end tests to verify live flows "
    "(login to ask doubt to snap image to quiz) and GitHub Actions to run the bug report "
    "automatically on every push. Both are free; say the word.",
]
for r in recs:
    story.append(Paragraph("• " + r, styles["Bul"]))

story.append(Spacer(1, 16))
story.append(hr(GREY, 0.6))
story.append(Paragraph(
    "Generated by the StudyBuddy AI automated test toolkit (tests/run-qa.mjs, tests/run-load.mjs) using "
    "free open-source tools. All numbers in Section 3 are measured, not estimated.", styles["Small"]))

def footer(canvas, doc):
    canvas.saveState()
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(GREY)
    canvas.drawString(20*mm, 12*mm, "StudyBuddy AI — Automated Test & Capacity Report")
    canvas.drawRightString(190*mm, 12*mm, f"Page {doc.page}")
    canvas.setStrokeColor(colors.HexColor("#E2E8F0"))
    canvas.line(20*mm, 15*mm, 190*mm, 15*mm)
    canvas.restoreState()

doc = SimpleDocTemplate(OUT, pagesize=A4,
                        leftMargin=20*mm, rightMargin=20*mm,
                        topMargin=18*mm, bottomMargin=20*mm,
                        title="StudyBuddy AI Test & Capacity Report")
doc.build(story, onFirstPage=footer, onLaterPages=footer)
print("WROTE", OUT)
