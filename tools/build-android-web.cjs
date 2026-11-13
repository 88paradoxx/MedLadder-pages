/**
 * tools/build-android-web.cjs
 *
 * Builds www/ (the web code inside the Android app and inside Capgo live updates)
 * from the same site build that medladder.top serves:
 *
 *   1. node build.mjs                  -> dist/ (minified public site)
 *   2. copy dist/ -> www/              minus SEO-only trees and web-only files
 *   3. bundle tools/android-native-bridge.js -> www/medladder-native.js
 *   4. inject medladder-native.js + the is-native-app class into every page
 *
 * Run via: npm run build:android:web   (or npm run android:sync)
 */
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');
const distDir = path.join(root, 'dist');
const webDir = path.join(root, 'www');

// Top-level entries in dist/ that the app doesn't need.
const SKIP_TOP = new Set([
  'subjects',            // ~38 MB of static SEO topic pages
  'pyqs',                // ~15 MB of static SEO past-paper pages
  // Other website-only SEO pages: the app opens these from medladder.top (see the native bridge)
  'neet-pg', 'neet-pg-syllabus', 'neet-pg-high-yield-topics', 'neet-pg-top-100-questions',
  'fmge', 'inicet', 'ini-cet', 'neet-ss', 'landing', 'landing.html',
  'best-free-neet-pg-question-bank', 'medladder-vs-marrow', 'medladder-vs-prepladder',
  'MedLadder-latest.apk',
  'sitemap.xml',
  'robots.txt',
  'llms.txt',
  '_headers',
  '_redirects',
  'sw.js',               // service worker: not used inside the app
  'google588cf65d870b0d74.html',
  'eb80e09c7e354239b254e411ced4c81e.txt',
  'build-info.json'
]);
const SKIP_SUFFIX = ['.map'];

console.log('build-android-web: building site (build.mjs) ...');
execFileSync(process.execPath, [path.join(root, 'build.mjs')], { stdio: 'inherit', cwd: root });
if (!fs.existsSync(path.join(distDir, 'index.html'))) throw new Error('dist/index.html missing after build.mjs');

if (fs.existsSync(webDir)) fs.rmSync(webDir, { recursive: true, force: true });
fs.cpSync(distDir, webDir, {
  recursive: true,
  filter: (src) => {
    const rel = path.relative(distDir, src);
    if (!rel) return true;
    const top = rel.split(path.sep)[0];
    if (SKIP_TOP.has(top)) return false;
    if (SKIP_SUFFIX.some((s) => rel.endsWith(s))) return false;
    return true;
  }
});

esbuild.buildSync({
  entryPoints: [path.join(__dirname, 'android-native-bridge.js')],
  outfile: path.join(webDir, 'medladder-native.js'),
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['es2020'],
  minify: true
});

function injectNativeScript(filePath) {
  let html = fs.readFileSync(filePath, 'utf8');

  // Edge to edge: let the page draw behind the camera cutout / navigation bar; the page
  // keeps its content clear of them with env(safe-area-inset-*).
  html = html.replace(/<meta\s+name="viewport"\s+content="([^"]*)"/i, function (m, c) {
    return /viewport-fit/.test(c) ? m : '<meta name="viewport" content="' + c + ', viewport-fit=cover"';
  });

  // SEO directory navigation is for the website only.
  html = html.replace(/<nav\s+aria-label="Browse MedLadder"[\s\S]*?<\/nav>/gi, '');

  if (!html.includes('medladder-native.js')) {
    const tag = '<script src="/medladder-native.js" defer></script>';
    const m = html.match(/<script[^>]+src="\/(app|mock-test|books)\.js[^"]*"[^>]*><\/script>/);
    if (m) html = html.replace(m[0], tag + '\n  ' + m[0]);
    else if (html.includes('</head>')) html = html.replace('</head>', '  ' + tag + '\n</head>');
  }

  if (!html.includes('is-native-app')) {
    html = html.replace(/<html([^>]*?)\sclass="([^"]*)"/, '<html$1 class="$2 is-native-app" data-native="true"');
    if (!html.includes('is-native-app')) html = html.replace(/<html(\s|>)/, '<html class="is-native-app" data-native="true"$1');
  }

  fs.writeFileSync(filePath, html);
}

let pages = 0;
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p);
    else if (entry.name.endsWith('.html')) { injectNativeScript(p); pages++; }
  }
})(webDir);

console.log(`build-android-web: www/ ready (${pages} pages).`);
