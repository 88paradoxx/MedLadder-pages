# MedLadder — Cloudflare Pages export

Static frontend export of https://medladder.top, built from a snapshot of the
main repo `88paradoxx/MedLadder` — **commit 4cd5ec4 (24 Oct 2026, v1.6 /
versionCode 7)**. The main repo was not modified; this is a separate,
standalone copy meant for Cloudflare Pages.

## What is inside

- The full site: homepage, landing page, all 759 subject/topic pages, mock-test
  lobby, NEET SS books catalogue, privacy/terms, sitemap, robots.txt, PWA
  manifest, icons and images, and the Android APK served at `/download-apk`.
- `admin-mock.html` is included (as in production) but stays unlinked and out
  of the sitemap, exactly like the live site.
- `_redirects` reproduces the Vercel routing: clean URLs (`/privacy`,
  `/mock-test`, `/neet-ss-books`, `/landing`, …), the `/ini-cet` → `/inicet`
  301, `.html` → clean-URL 301s, the `/download-apk` rewrite, and the SPA
  fallback to `/index.html`. Static files and directory indexes (topic pages
  are `subjects/<subject>/<topic>/index.html`) are served directly.
- `_headers` carries the production security headers (CSP, HSTS, nosniff,
  frame deny) plus the APK download headers.

## What was left out (deliberately)

`android/` (native app project), `tools/`, `supabase/` (migrations),
`.github/`, build scripts (`*.py`, `package*.json`), `seo_samples.json`,
`playstore-assets/`, and the main repo's README/vercel config. Nothing in
here contains a secret — the Android `google-services.json` was never in the
snapshot and is excluded by design.

## Deploy to Cloudflare Pages

Option A — drag-and-drop (fastest):
1. Cloudflare dashboard → Workers & Pages → Create → Pages → Upload assets.
2. Upload this whole folder. No build step, no framework preset.

Option B — connect Git:
1. Push this folder to a new GitHub repo.
2. Cloudflare dashboard → Workers & Pages → Create → Pages → Import a
   repository. Framework preset: **None**. Build command: **(empty)**.
   Output directory: **`/`** (root). Deploy.

## Notes

- This is a **snapshot, not a live sync**. When main changes, re-export (copy
  the web files again) or, better, point Pages at a repo that tracks main.
- `sitemap.xml` and `robots.txt` still reference `medladder.top`. That is
  correct if you later point the domain here; until then the Pages URL
  (`*.pages.dev`) is a staging copy and search engines will see the
  medladder.top canonical URLs.
- Pointing `medladder.top` itself at Pages is a separate DNS step and is NOT
  done by uploading this — the Vercel deployment keeps serving until you
  change DNS.
