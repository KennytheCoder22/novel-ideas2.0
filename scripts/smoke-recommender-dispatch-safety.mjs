import fs from 'node:fs';

const src = fs.readFileSync('screens/recommenders/recommenderRouter.ts', 'utf8');

const preDispatchPos = src.indexOf('const preDispatchGeneratedQueries = generatedComicVineQueriesFromTaste;');
const generatedPos = src.indexOf('const generatedComicVineQueriesFromTaste = Array.from(new Set([');

const checks = [
  { name: 'generated-queries-declared-before-pre-dispatch-read', ok: generatedPos >= 0 && preDispatchPos > generatedPos },
  { name: 'taste-profile-failure-only-when-signals-exist', ok: /const tasteProfileBuildFailure = hasSwipeSignals && tasteProfileSummaryEmpty;/.test(src) },
  { name: 'comicvine-taste-rungs-still-driven-by-generated-queries', ok: /if \(sourceEnabled\.comicVine && generatedComicVineQueriesFromTaste\.length >= 3 && !tasteProfileBuildFailure\)/.test(src) },
];

const failed = checks.filter((c) => !c.ok);
if (failed.length) {
  console.error('Recommender dispatch safety smoke test failed:', failed.map((f) => f.name).join(', '));
  process.exit(1);
}

console.log('Recommender dispatch safety smoke test passed:', checks.map((c) => c.name).join(', '));
