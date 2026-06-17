# Lighthouse Report

**Date:** 2026-06-17

## Status

Lighthouse was **not executed** in this audit session (requires running preview server + Chrome Lighthouse CLI against deployed or local build).

## Pre-Deploy Checklist for Manual Run

```bash
npm run build && npm run preview
# In separate terminal:
npx lighthouse http://localhost:4173/ --output html --output-path reports/lighthouse-landing.html
npx lighthouse http://localhost:4173/login --output html --output-path reports/lighthouse-login.html
```

For authenticated pages (Dashboard, Lessons, Admin), use Lighthouse with stored auth or run against staging with test account.

## Targets

| Category | Target |
|----------|--------|
| Performance | > 85 |
| Accessibility | > 90 |
| Best Practices | > 90 |
| SEO | > 90 |

## Known Factors Affecting Scores

- Google Fonts loaded via CSS `@import` (render-blocking)
- Large Firebase chunk on first authenticated load
- Framer Motion + GSAP on landing page

## Recommendations

1. Preconnect to `fonts.googleapis.com` and `fonts.gstatic.com` in `index.html`
2. Add meta description + OG tags on landing if missing
3. Ensure all interactive elements have accessible labels (Radix components generally good)

## Verdict

**Pending manual Lighthouse run post-deploy** — infrastructure supports targets with font/preconnect optimizations.
