import fs from 'node:fs';

const src = fs.readFileSync('screens/recommenders/recommenderRouter.ts', 'utf8');

const checks = [
  { name: 'outer-primaryTasteQueryPoolTitles-default', ok: /let primaryTasteQueryPoolTitles:\s*string\[\]\s*=\s*\[\];/.test(src) },
  { name: 'outer-primaryTasteQueryPoolRoots-default', ok: /let primaryTasteQueryPoolRoots:\s*string\[\]\s*=\s*\[\];/.test(src) },
  { name: 'outer-staticRungPoolRoots-default', ok: /let staticRungPoolRoots:\s*string\[\]\s*=\s*\[\];/.test(src) },
  { name: 'outer-preFilterPoolBuiltFrom-default', ok: /let preFilterPoolBuiltFrom\s*=\s*"unknown";/.test(src) },
  { name: 'outer-preFilterPoolOverlap-default', ok: /let preFilterPoolOverlapWithPreviousSession\s*=\s*0;/.test(src) },
  { name: 'diagnostics-reads-primaryTasteQueryPoolTitles', ok: /primaryTasteQueryPoolTitles:\s*primaryTasteQueryPoolTitles\.slice\(0,\s*80\)/.test(src) },
  { name: 'diagnostics-reads-primaryTasteQueryPoolRoots', ok: /primaryTasteQueryPoolRoots,/.test(src) },
  { name: 'diagnostics-reads-staticRungPoolRoots', ok: /staticRungPoolRoots,/.test(src) },
  { name: 'diagnostics-reads-preFilterPoolBuiltFrom', ok: /preFilterPoolBuiltFrom,/.test(src) },
  { name: 'diagnostics-reads-preFilterPoolOverlap', ok: /preFilterPoolOverlapWithPreviousSession,/.test(src) },
];

const failed = checks.filter((c) => !c.ok);
if (failed.length) {
  console.error('Smoke check failed:', failed.map((f) => f.name));
  process.exit(1);
}

console.log('Smoke check passed:', checks.map((c) => c.name).join(', '));
