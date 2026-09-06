// Stamp a unique build id into the built service worker so sw.js changes on
// every deploy. Without this, a code-only deploy leaves sw.js byte-identical,
// the browser never detects a new worker, and users stay on the old build until
// a manual hard-refresh. Run after `vite build` (see package.json "build").
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const SW_PATH = 'dist/sw.js';

if (!existsSync(SW_PATH)) {
  console.warn(`[stamp-sw] ${SW_PATH} not found — skipping (nothing to stamp).`);
  process.exit(0);
}

// A value unique to this build: timestamp + short random suffix.
const buildId = `${new Date().toISOString().replace(/[:.]/g, '-')}-${Math.random().toString(36).slice(2, 8)}`;

let src = readFileSync(SW_PATH, 'utf8');
if (!src.includes('__BUILD_ID__')) {
  console.warn('[stamp-sw] no __BUILD_ID__ placeholder in sw.js — is it already stamped?');
  process.exit(0);
}
src = src.replaceAll('__BUILD_ID__', buildId);
writeFileSync(SW_PATH, src);
console.log(`[stamp-sw] stamped ${SW_PATH} with build id ${buildId}`);
