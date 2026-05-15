import fs from 'node:fs';

const src = fs.readFileSync('screens/recommenders/recommenderRouter.ts', 'utf8');

const preDispatchPos = src.indexOf('const preDispatchGeneratedQueries = generatedComicVineQueriesFromTaste;');
const generatedPos = src.indexOf('const generatedComicVineQueriesFromTaste = Array.from(new Set([');

const checks = [
  { name: 'generated-queries-declared-before-pre-dispatch-read', ok: generatedPos >= 0 && preDispatchPos > generatedPos },
  { name: 'taste-profile-failure-only-when-signals-exist', ok: /const tasteProfileBuildFailure = hasSwipeSignals && tasteProfileSummaryEmpty;/.test(src) },
  { name: 'comicvine-taste-rungs-still-driven-by-generated-queries', ok: /if \(sourceEnabled\.comicVine && generatedComicVineQueriesFromTaste\.length >= 3 && !tasteProfileBuildFailure\)/.test(src) },
  { name: 'signal-text-coercion-helper-present', ok: /const toSignalText = \(value: any\): string =>/.test(src) },
  { name: 'query-build-uses-signal-text-coercion', ok: /likedGenres\.map\(\(s\) => `\$\{toSignalText\(s\)\.replace\(/.test(src) },
  { name: 'weighted-shape-signal-supported', ok: /if \(typeof value\.signal === "string"\) return value\.signal;/.test(src) },
  { name: 'tag-shape-signal-supported', ok: /if \(typeof value\.tag === "string"\) return value\.tag;/.test(src) },
  { name: 'invalid-taste-signals-diagnostics-exported', ok: /invalidTasteSignalsDropped,/.test(src) && /tasteProfileRawSignalTypes,/.test(src) },
];

const failed = checks.filter((c) => !c.ok);
if (failed.length) {
  console.error('Recommender dispatch safety smoke test failed:', failed.map((f) => f.name).join(', '));
  process.exit(1);
}

console.log('Recommender dispatch safety smoke test passed:', checks.map((c) => c.name).join(', '));
