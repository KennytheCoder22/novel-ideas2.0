import fs from 'node:fs';

const src = fs.readFileSync('screens/recommenders/gcd/gcdGraphicNovelRecommender.ts', 'utf8');

const checks = [
  { name: 'stage-statuses', ok: /api_empty/.test(src) && /final_empty/.test(src) },
  { name: 'query-loop-guard', ok: /for \(let i = 0; i < maxQueriesToFetch; i \+= 1\) \{\s*const q[\s\S]*?try \{/.test(src) },
  { name: 'rescue-query-scope', ok: /query:\s*q/.test(src) },
  { name: 'sample-diagnostics', ok: /comicVineSampleTitlesByQuery/.test(src) && /comicVineRejectedSampleReasonsByQuery/.test(src) },
];

const failed = checks.filter(c => !c.ok);
if (failed.length) {
  console.error('ComicVine adapter smoke test failed:', failed.map(f => f.name).join(', '));
  process.exit(1);
}
console.log('ComicVine adapter smoke test passed:', checks.map(c => c.name).join(', '));
