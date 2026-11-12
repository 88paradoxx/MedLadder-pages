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
  // Repo tools (count map, SEO audits), not part of the site.
  'scripts',
  'build-stamp.json',
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

/* Minify the site's own top-level scripts and stylesheets in dist/ (the
 * repo keeps the readable source) and write source maps next to them.
 * esbuild is a dev dependency; if it is missing the build still succeeds
 * and ships the files as they are. */
async function minifyAssets() {
  let esbuild;
  try { esbuild = await import('esbuild'); } catch (e) {
    // The deploy may run without installing dev dependencies: install the
    // pinned version here, once, and carry on without it if that fails.
    try {
      const { execSync } = await import('node:child_process');
      const pkg = JSON.parse(await (await import('node:fs/promises')).readFile(join(ROOT, 'package.json'), 'utf8'));
      const ver = (pkg.devDependencies && pkg.devDependencies.esbuild) || 'latest';
      console.log('build.mjs: installing esbuild@' + ver + ' for minification');
      execSync('npm install --no-save --no-audit --no-fund esbuild@' + ver, { cwd: ROOT, stdio: 'inherit' });
      esbuild = await import('esbuild');
    } catch (e2) {
      console.warn('build.mjs: esbuild unavailable, skipping minification: ' + e2.message);
      const { writeFile: wf } = await import('node:fs/promises');
      await wf(join(ROOT, 'build-stamp.json'), JSON.stringify({ minified: 0, error: String(e2.message).slice(0, 300), built: new Date().toISOString(), node: process.version }) + '\n');
      return;
    }
  }
  const { readFile, writeFile } = await import('node:fs/promises');
  let before = 0, after = 0, n = 0;
  for (const e of await readdir(DIST, { withFileTypes: true })) {
    if (!e.isFile()) continue;
    const isJs = e.name.endsWith('.js') && e.name !== 'sw.js' && !e.name.endsWith('.min.js');
    const isCss = e.name.endsWith('.css') && !e.name.endsWith('.min.css');
    if (!isJs && !isCss) continue;
    const file = join(DIST, e.name);
    const code = await readFile(file, 'utf8');
    try {
      const out = await esbuild.transform(code, {
        loader: isJs ? 'js' : 'css', minify: true, sourcemap: 'external',
        sourcefile: e.name, legalComments: 'none', ...(isJs ? { target: 'es2017' } : {})
      });
      await writeFile(file, out.code + (isJs ? '\n//# sourceMappingURL=' : '\n/*# sourceMappingURL=') + e.name + '.map' + (isJs ? '\n' : ' */\n'));
      await writeFile(file + '.map', out.map);
      before += code.length; after += out.code.length; n++;
    } catch (err) {
      console.warn(`build.mjs: could not minify ${e.name}, shipping it as is: ${err.message}`);
    }
  }
  console.log(`build.mjs: minified ${n} files, ${(before / 1024).toFixed(0)} KB -> ${(after / 1024).toFixed(0)} KB`);
  const info = JSON.stringify({ minified: n, kb_before: Math.round(before / 1024), kb_after: Math.round(after / 1024), built: new Date().toISOString(), node: process.version }) + '\n';
  await writeFile(join(DIST, 'build-info.json'), info);
  // Also stamped into the Worker bundle (worker.js imports it), so the
  // deployed Worker's code shows whether this build minified.
  await writeFile(join(ROOT, 'build-stamp.json'), info);
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

  await minifyAssets();

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
