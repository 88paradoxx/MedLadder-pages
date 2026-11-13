#!/usr/bin/env node
/**
 * tools/publish-live-update.cjs
 *
 * Publishes a Capgo live update (self-hosted on Cloudflare R2) for the MedLadder Android app.
 * Users get the new web code without a new APK/Play Store release.
 *
 *   npm run live-update                 -> auto version (e.g. 1.9.1, 1.9.2 ...)
 *   npm run live-update -- 1.9.5        -> explicit version
 *   npm run live-update -- --dry-run    -> build + zip only, no upload
 *
 * What it does:
 *   1. Rebuilds www/ (same as the APK build: tools/build-android-web.cjs)
 *   2. Zips www/ -> live-updates/<version>.zip and computes its SHA-256
 *   3. Uploads to R2 bucket "medladder-images":
 *        app-updates/android/bundles/<version>.zip   (immutable)
 *        app-updates/android/latest.json             (no-cache manifest the app polls)
 *
 * Upload uses the R2 S3 API when R2_ENDPOINT / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY are set
 * (same env vars as tools/sync_images_to_r2.js), otherwise falls back to `npx wrangler r2 object put`.
 *
 * IMPORTANT: only web changes (HTML/CSS/JS/assets) can ship this way. If you add or upgrade a
 * native Capacitor plugin, or change android/ code, you still need a new APK/AAB.
 * Each bundle is locked to the current native versionCode, so a newer APK never gets an older bundle.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync, execSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const WEB_DIR = path.join(ROOT, 'www');
const OUT_DIR = path.join(ROOT, 'live-updates');

const R2_BUCKET = 'medladder-images';
const R2_PREFIX = 'app-updates/android';
const PUBLIC_BASE = 'https://pub-5e62ac2b4d1c43fcb7fb6b025a52e189.r2.dev';
const MANIFEST_KEY = `${R2_PREFIX}/latest.json`;

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const notesIdx = args.indexOf('--notes');
const notes = notesIdx !== -1 ? (args[notesIdx + 1] || '') : '';
const explicitVersion = args.find((a, i) => !a.startsWith('--') && !(notesIdx !== -1 && i === notesIdx + 1));

function readNativeVersion() {
  const gradle = fs.readFileSync(path.join(ROOT, 'android', 'app', 'build.gradle'), 'utf8');
  const code = parseInt((gradle.match(/versionCode\s+(\d+)/) || [])[1], 10);
  const name = (gradle.match(/versionName\s+"([^"]+)"/) || [])[1];
  if (!code || !name) throw new Error('Could not read versionCode/versionName from android/app/build.gradle');
  return { code, name };
}

async function fetchCurrentManifest() {
  try {
    const res = await fetch(`${PUBLIC_BASE}/${MANIFEST_KEY}?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    return null;
  }
}

function nextVersion(nativeName, current) {
  // Bundles are named <versionName>.<n>, e.g. native 1.9 -> 1.9.1, 1.9.2 ...
  const prefix = `${nativeName}.`;
  if (current && typeof current.version === 'string' && current.version.startsWith(prefix)) {
    const n = parseInt(current.version.slice(prefix.length), 10);
    if (Number.isFinite(n)) return `${prefix}${n + 1}`;
  }
  return `${prefix}1`;
}

function sha256File(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

async function uploadS3(key, filePath, contentType, cacheControl) {
  const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
  const s3 = new S3Client({
    region: 'auto',
    endpoint: process.env.R2_ENDPOINT,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY
    }
  });
  await s3.send(new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
    Body: fs.readFileSync(filePath),
    ContentType: contentType,
    CacheControl: cacheControl
  }));
}

function uploadWrangler(key, filePath, contentType, cacheControl) {
  const q = (s) => `"${String(s).replace(/"/g, '\\"')}"`;
  const cmd = [
    'npx', 'wrangler', 'r2', 'object', 'put', q(`${R2_BUCKET}/${key}`),
    '--file', q(filePath),
    '--content-type', q(contentType),
    '--cache-control', q(cacheControl),
    '--remote'
  ].join(' ');
  execSync(cmd, { stdio: 'inherit', cwd: ROOT });
}

async function upload(key, filePath, contentType, cacheControl) {
  const hasS3 = process.env.R2_ENDPOINT && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY;
  console.log(`  -> r2://${R2_BUCKET}/${key} (${hasS3 ? 'S3 API' : 'wrangler'})`);
  if (hasS3) await uploadS3(key, filePath, contentType, cacheControl);
  else uploadWrangler(key, filePath, contentType, cacheControl);
}

async function main() {
  const native = readNativeVersion();
  const current = await fetchCurrentManifest();
  const version = explicitVersion || nextVersion(native.name, current);
  if (!/^\d+\.\d+(\.\d+)*$/.test(version)) throw new Error(`Invalid version "${version}"`);
  if (current && current.version === version) {
    throw new Error(`Version ${version} is already live. Pass a different version.`);
  }

  console.log(`Native app: ${native.name} (versionCode ${native.code})`);
  console.log(`Live now:   ${current ? current.version : '(none)'}`);
  console.log(`Publishing: ${version}${dryRun ? ' [dry run]' : ''}\n`);

  console.log('1/3 Building www/ ...');
  execFileSync(process.execPath, [path.join(__dirname, 'build-android-web.cjs')], { stdio: 'inherit', cwd: ROOT });
  if (!fs.existsSync(path.join(WEB_DIR, 'index.html'))) throw new Error('www/index.html missing after build');

  console.log('2/3 Zipping ...');
  const AdmZip = require('adm-zip');
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const zipPath = path.join(OUT_DIR, `${version}.zip`);
  if (fs.existsSync(zipPath)) fs.rmSync(zipPath);
  const zip = new AdmZip();
  zip.addLocalFolder(WEB_DIR); // index.html at zip root
  zip.writeZip(zipPath);
  const checksum = sha256File(zipPath);
  const sizeMb = (fs.statSync(zipPath).size / 1048576).toFixed(2);
  console.log(`  ${path.relative(ROOT, zipPath)}  ${sizeMb} MB  sha256 ${checksum}`);

  const bundleKey = `${R2_PREFIX}/bundles/${version}.zip`;
  const manifest = {
    version,
    url: `${PUBLIC_BASE}/${bundleKey}`,
    checksum,
    minNativeVersionCode: native.code,
    maxNativeVersionCode: native.code,
    nativeVersionName: native.name,
    notes,
    publishedAt: new Date().toISOString()
  };
  const manifestPath = path.join(OUT_DIR, 'latest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');

  if (dryRun) {
    console.log('\nDry run: nothing uploaded. Manifest would be:\n' + JSON.stringify(manifest, null, 2));
    return;
  }

  console.log('3/3 Uploading to R2 ...');
  // Bundle first, manifest last, so the app never sees a manifest pointing at a missing zip.
  await upload(bundleKey, zipPath, 'application/zip', 'public, max-age=31536000, immutable');
  await upload(MANIFEST_KEY, manifestPath, 'application/json', 'no-cache, max-age=0');

  console.log(`\nLive update ${version} published.`);
  console.log('Users on versionCode ' + native.code + ' get it in the background and see it after reopening the app.');
}

main().catch((err) => {
  console.error('\nLive update failed:', err.message || err);
  process.exit(1);
});
