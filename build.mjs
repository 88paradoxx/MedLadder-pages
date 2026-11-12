#!/usr/bin/env node
/**
 * Populate ./dist with exactly the files that should be served as Worker
 * static assets.
 *
 * wrangler.jsonc sets `assets.directory: "./dist"`, but dist/ is gitignored and
 * nothing created it, so the repo could not be deployed as committed. This
 * script closes that gap: run it (or `npm run build`) before `wrangler deploy`,
 * and set the Cloudflare build command to `npm run build`.
 *
 * Anything not needed by a browser stays out of dist/ — notably worker.js
 * (Worker source, bundled separately via `main`) and the repo's own docs, which
 * would otherwise be publicly fetchable.
 *
 * No dependencies. Node 18+.
 */
import { cp, rm, mkdir, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const DIST = join(ROOT, 'dist');

/** Top-level names never copied into dist/. */
const EXCLUDE_ENTRIES = new Set([
  'dist',
  'node_modules',
  '.git',
  '.github',
  '.wrangler',
  'android',
  'supabase',
  'tools',
  // Generated audit reports: unlinked, not in the sitemap, ~900 KB. Not for serving.
  'audit-output',
  // Worker source + deploy config: not static assets.
  'worker.js',
  'wrangler.jsonc',
  'wrangler.toml',
  'package.json',
  'package-lock.json',
  'build.mjs',
  // Read by worker.js at bundle time; not a page asset.
  'count-map.json',
  // Node build script (require('fs')), referenced by no page — was being
  // served publicly. sw.js stays: it is registered from app.js, not via <script src>.
  'optimize_lcp.js',
  '.assetsignore',
  '.gitignore',
  // Repo documentation — must not be publicly served.
  'README.md',
  'SEO_AUDIT.md',
  'SEO_PHASE1_PROGRESS.md',
  'AUDIT-2026-11-09.md',
]);

/** Extra patterns excluded at any depth. */
const EXCLUDE_SUFFIX = ['.md', '.py', '.map'];

function keep(absPath) {
  const rel = relative(ROOT, absPath);
  if (!rel || rel.startsWith('..')) return false;
  const parts = rel.split(sep);
  if (EXCLUDE_ENTRIES.has(parts[0])) return false;
  if (EXCLUDE_SUFFIX.some((s) => rel.toLowerCase().endsWith(s))) return false;
  return true;
}

async function main() {
  if (existsSync(DIST)) await rm(DIST, { recursive: true, force: true });
  await mkdir(DIST, { recursive: true });

  const entries = await readdir(ROOT, { withFileTypes: true });
  let files = 0;
  let dirs = 0;

  for (const e of entries) {
    const src = join(ROOT, e.name);
    if (!keep(src)) continue;
    const dest = join(DIST, e.name);
    await cp(src, dest, { recursive: true, filter: keep });
    if (e.isDirectory()) dirs++; else files++;
  }

  // Sanity-check the files Cloudflare needs to find.
  const required = ['index.html', '404.html', '_headers', '_redirects',
                    'robots.txt', 'sitemap.xml'];
  const missing = required.filter((f) => !existsSync(join(DIST, f)));
  if (missing.length) {
    console.error(`build.mjs: missing from dist/: ${missing.join(', ')}`);
    process.exit(1);
  }

  // Count what actually landed, for the build log.
  let total = 0;
  const walk = async (d) => {
    for (const e of await readdir(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) await walk(p);
      else { total++; }
    }
  };
  await walk(DIST);

  const html = [];
  const walkHtml = async (d) => {
    for (const e of await readdir(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) await walkHtml(p);
      else if (e.name.endsWith('.html')) html.push(p);
    }
  };
  await walkHtml(DIST);

  const apk = join(DIST, 'MedLadder-latest.apk');
  const apkMb = existsSync(apk) ? ((await stat(apk)).size / 1048576).toFixed(1) : null;

  console.log(`build.mjs: dist/ ready — ${total} files (${html.length} HTML), ` +
              `${dirs} directories, ${files} root files` +
              (apkMb ? `, APK ${apkMb} MB` : ''));
}

main().catch((err) => {
  console.error('build.mjs failed:', err);
  process.exit(1);
});
