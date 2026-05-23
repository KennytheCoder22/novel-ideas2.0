import fs from 'node:fs';

const src = fs.readFileSync('screens/recommenders/recommenderRouter.ts', 'utf8');

const mustExist = [
  { name: 'outer-primaryTasteQueryPoolTitles-default', ok: /let primaryTasteQueryPoolTitles:\s*string\[\]\s*=\s*\[\];/.test(src) },
  { name: 'outer-primaryTasteQueryPoolRoots-default', ok: /let primaryTasteQueryPoolRoots:\s*string\[\]\s*=\s*\[\];/.test(src) },
  { name: 'outer-staticRungPoolRoots-default', ok: /let staticRungPoolRoots:\s*string\[\]\s*=\s*\[\];/.test(src) },
  { name: 'outer-preFilterPoolBuiltFrom-default', ok: /let preFilterPoolBuiltFrom\s*=\s*"unknown";/.test(src) },
  { name: 'outer-preFilterPoolOverlap-default', ok: /let preFilterPoolOverlapWithPreviousSession\s*=\s*0;/.test(src) },
  { name: 'outer-tdzGuardedDiagnosticsInitialized-default', ok: /var tdzGuardedDiagnosticsInitialized\s*=\s*false;/.test(src) },
  { name: 'outer-postTopUpOutputSnapshot-default', ok: /var postTopUpOutputSnapshot:\s*any\[\]\s*=\s*\[\];/.test(src) },
  { name: 'outer-postTopUpOutputSnapshotLength-default', ok: /var postTopUpOutputSnapshotLength\s*=\s*0;/.test(src) },
  { name: 'diagnostics-reads-primaryTasteQueryPoolTitles', ok: /primaryTasteQueryPoolTitles:\s*primaryTasteQueryPoolTitles\.slice\(0,\s*80\)/.test(src) },
  { name: 'diagnostics-reads-primaryTasteQueryPoolRoots', ok: /primaryTasteQueryPoolRoots,/.test(src) },
  { name: 'diagnostics-reads-staticRungPoolRoots', ok: /staticRungPoolRoots,/.test(src) },
  { name: 'diagnostics-reads-preFilterPoolBuiltFrom', ok: /preFilterPoolBuiltFrom,/.test(src) },
  { name: 'diagnostics-reads-preFilterPoolOverlap', ok: /preFilterPoolOverlapWithPreviousSession,/.test(src) },
];

const dispatchIdx = src.indexOf('const includeComicVine = shouldUseComicVine(routedInput);');
const tdzIdx = src.indexOf('var tdzGuardedDiagnosticsInitialized = false;');
const topupIdx = src.indexOf('var postTopUpOutputSnapshot: any[] = [];');
const topupLenIdx = src.indexOf('var postTopUpOutputSnapshotLength = 0;');

const orderChecks = [
  { name: 'tdz-var-before-comicvine-dispatch', ok: tdzIdx >= 0 && dispatchIdx >= 0 && tdzIdx < dispatchIdx },
  { name: 'postTopUp-var-before-comicvine-dispatch', ok: topupIdx >= 0 && dispatchIdx >= 0 && topupIdx < dispatchIdx },
  { name: 'postTopUpLength-var-before-comicvine-dispatch', ok: topupLenIdx >= 0 && dispatchIdx >= 0 && topupLenIdx < dispatchIdx },
  { name: 'no-const-tdz-diagnostic', ok: !/const tdzGuardedDiagnosticsInitialized\s*=/.test(src) },
  { name: 'no-const-postTopUpSnapshot', ok: !/const postTopUpOutputSnapshot\s*=/.test(src) },
];

const failed = [...mustExist, ...orderChecks].filter((c) => !c.ok);
if (failed.length) {
  console.error('ComicVine dispatch smoke check failed:', failed.map((f) => f.name));
  process.exit(1);
}

console.log('ComicVine dispatch smoke check passed:', [...mustExist, ...orderChecks].map((c) => c.name).join(', '));
