import fs from 'node:fs';
import path from 'node:path';

const ROUTER_PATH = 'screens/recommenders/recommenderRouter.ts';
const src = fs.readFileSync(ROUTER_PATH, 'utf8');

const EXPECTED_ROUTER_FINGERPRINT = 'router-comicvine-proxy-default-v1+tdz-guard-2026-05-23b+dispatch-var-972e5e8+dispatch-8509da5+dispatch-loop-idx';
const checks = [
  { name: 'debug-router-version-fingerprint', ok: src.includes(EXPECTED_ROUTER_FINGERPRINT) },
  { name: 'tdz-var-initialized-top-scope', ok: /var tdzGuardedDiagnosticsInitialized\s*=\s*false;/.test(src) },
  { name: 'postTopUp-snapshot-var-initialized-top-scope', ok: /var postTopUpOutputSnapshot:\s*any\[\]\s*=\s*\[\];/.test(src) },
  { name: 'postTopUp-snapshot-length-var-initialized-top-scope', ok: /var postTopUpOutputSnapshotLength\s*=\s*0;/.test(src) },
  { name: 'no-lexical-const-tdz-diagnostic', ok: !/const tdzGuardedDiagnosticsInitialized\s*=/.test(src) },
  { name: 'no-lexical-const-topup-snapshot', ok: !/const postTopUpOutputSnapshot\s*=/.test(src) },
];

const failed = checks.filter((c) => !c.ok);
if (failed.length) {
  console.error('Source smoke failed:', failed.map((f) => f.name));
  process.exit(1);
}

const webDistCandidates = [
  'dist',
  'web-build',
  '.expo/web-build',
].map((p) => path.resolve(p)).filter((p) => fs.existsSync(p));

if (webDistCandidates.length === 0) {
  console.warn('No web bundle directory found (dist/web-build/.expo/web-build). Source checks passed.');
  process.exit(0);
}

const jsFiles = [];
for (const base of webDistCandidates) {
  const stack = [base];
  while (stack.length) {
    const cur = stack.pop();
    if (!cur) continue;
    for (const ent of fs.readdirSync(cur, { withFileTypes: true })) {
      const full = path.join(cur, ent.name);
      if (ent.isDirectory()) stack.push(full);
      else if (ent.isFile() && full.endsWith('.js')) jsFiles.push(full);
    }
  }
}

const fingerprintFoundInBundle = jsFiles.some((f) => {
  try { return fs.readFileSync(f, 'utf8').includes(EXPECTED_ROUTER_FINGERPRINT); }
  catch { return false; }
});

if (!fingerprintFoundInBundle) {
  console.error('Bundle smoke failed: router fingerprint not found in discovered JS bundles.');
  process.exit(1);
}

console.log('Production-bundle smoke check passed: source and bundle fingerprint/TDZ guard assertions satisfied.');
