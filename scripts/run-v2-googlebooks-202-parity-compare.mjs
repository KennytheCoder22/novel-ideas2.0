/**
 * #202 parity comparator script.
 *
 * Reads two parity-baseline artifacts (pre-change and post-consolidation) and
 * produces a field-level parity report.  Exits non-zero on any hard-failure
 * condition listed in the #202 hypothesis document.
 *
 * Hard-failure conditions (any one causes a FAIL result):
 *   - Different number of fixtures in either set
 *   - Different adult or teen fixture names or order
 *   - Any change to extracted phrase sets (matchedFields, perTitleSignalFields)
 *   - Any change to match methods (matchedMethods)
 *   - Any change to matched texts (matchedTexts)
 *   - Any change to match traces (matchedTrace)
 *   - Any change to rejected short-match records
 *   - Any change to liked/disliked matched signals
 *   - Any change to candidate scores
 *   - Overall or per-set content signature mismatch
 *
 * Soft-check (logged but does not fail the comparison):
 *   - `generatedAt` timestamps are expected to differ between baseline runs
 *
 * Usage:
 *   node scripts/run-v2-googlebooks-202-parity-compare.mjs \
 *     --baseline <path-to-pre-change-baseline.json> \
 *     --candidate <path-to-post-change-baseline.json>
 *
 * Output:
 *   scripts/output/googlebooks-202-parity-compare.json
 *   scripts/output/googlebooks-202-parity-compare.csv
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(scriptDir, "output");

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function argValue(flag) {
  const idx = process.argv.indexOf(flag);
  return idx >= 0 && process.argv[idx + 1] ? process.argv[idx + 1] : null;
}

const baselinePath = argValue("--baseline");
const candidatePath = argValue("--candidate");

if (!baselinePath || !candidatePath) {
  throw new Error(
    "Usage: node run-v2-googlebooks-202-parity-compare.mjs --baseline <pre-change.json> --candidate <post-change.json>",
  );
}

// ---------------------------------------------------------------------------
// Load artifacts
// ---------------------------------------------------------------------------

const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
const candidate = JSON.parse(readFileSync(candidatePath, "utf8"));

// ---------------------------------------------------------------------------
// Comparison utilities
// ---------------------------------------------------------------------------

function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function sortedKeys(obj) {
  return Object.keys(obj || {}).sort();
}

function arrayValue(v) {
  return Array.isArray(v) ? v : [];
}

function mapObject(v) {
  return v && typeof v === "object" && !Array.isArray(v) ? v : {};
}

const failures = [];
const warnings = [];
const checks = [];

function check(label, passed, baselineValue, candidateValue, context = "") {
  checks.push({
    label,
    context,
    result: passed ? "pass" : "fail",
    baselineValue: passed ? undefined : baselineValue,
    candidateValue: passed ? undefined : candidateValue,
  });
  if (!passed) {
    failures.push({ label, context, baselineValue, candidateValue });
  }
}

function warn(label, detail) {
  warnings.push({ label, detail });
}

// ---------------------------------------------------------------------------
// Top-level metadata checks
// ---------------------------------------------------------------------------

if (baseline.baselineCommit !== candidate.baselineCommit) {
  warn(
    "baselineCommit_mismatch",
    `baseline=${baseline.baselineCommit} candidate=${candidate.baselineCommit}`,
  );
}

if (baseline.fixtureCorpusVersion !== candidate.fixtureCorpusVersion) {
  check(
    "fixtureCorpusVersion",
    false,
    baseline.fixtureCorpusVersion,
    candidate.fixtureCorpusVersion,
    "top-level metadata",
  );
}

// ---------------------------------------------------------------------------
// Overall content signature
// ---------------------------------------------------------------------------

check(
  "signature_overall",
  baseline.signatures?.overallBaseline === candidate.signatures?.overallBaseline,
  baseline.signatures?.overallBaseline,
  candidate.signatures?.overallBaseline,
  "overall content signature",
);

check(
  "signature_adult_fixture_set",
  baseline.signatures?.adultFixtureSet === candidate.signatures?.adultFixtureSet,
  baseline.signatures?.adultFixtureSet,
  candidate.signatures?.adultFixtureSet,
  "adult fixture set signature",
);

check(
  "signature_teen_fixture_set",
  baseline.signatures?.teenFixtureSet === candidate.signatures?.teenFixtureSet,
  baseline.signatures?.teenFixtureSet,
  candidate.signatures?.teenFixtureSet,
  "teen fixture set signature",
);

// ---------------------------------------------------------------------------
// Prerequisite regression status
// ---------------------------------------------------------------------------

for (const [scriptName, baselineResult] of Object.entries(mapObject(baseline.prerequisiteRegressions))) {
  const candidateResult = mapObject(candidate.prerequisiteRegressions)[scriptName];
  if (!candidateResult) {
    check(`prereq_present_${scriptName}`, false, baselineResult.status, "(missing)", scriptName);
    continue;
  }
  if (baselineResult.status === "skipped_requires_report_args") continue;
  check(
    `prereq_status_${scriptName}`,
    candidateResult.status === "pass",
    baselineResult.status,
    candidateResult.status,
    scriptName,
  );
}

// ---------------------------------------------------------------------------
// Adult fixture comparison
// ---------------------------------------------------------------------------

const baselineAdult = arrayValue(baseline.adultFixtures);
const candidateAdult = arrayValue(candidate.adultFixtures);

check(
  "adult_fixture_count",
  baselineAdult.length === candidateAdult.length,
  baselineAdult.length,
  candidateAdult.length,
  "adult fixture set length",
);

const adultPairs = [];
for (let i = 0; i < Math.max(baselineAdult.length, candidateAdult.length); i++) {
  const b = baselineAdult[i];
  const c = candidateAdult[i];

  if (!b || !c) {
    check(`adult_fixture_${i}_present`, false, b?.fixtureName ?? "(missing)", c?.fixtureName ?? "(missing)", `adult[${i}]`);
    continue;
  }

  const ctx = `adult[${i}]:${b.fixtureName}`;

  // Fixture identity
  check(`${ctx}_name`, b.fixtureName === c.fixtureName, b.fixtureName, c.fixtureName, ctx);
  check(`${ctx}_candidateTitle`, b.candidateTitle === c.candidateTitle, b.candidateTitle, c.candidateTitle, ctx);
  check(`${ctx}_likedSignals`, deepEqual(b.likedSignals, c.likedSignals), b.likedSignals, c.likedSignals, ctx);
  check(`${ctx}_dislikedSignals`, deepEqual(b.dislikedSignals, c.dislikedSignals), b.dislikedSignals, c.dislikedSignals, ctx);

  // Score
  check(`${ctx}_score`, b.score === c.score, b.score, c.score, ctx);

  // Per-scored fields
  const bs = mapObject(b.scoredFields);
  const cs = mapObject(c.scoredFields);

  check(`${ctx}_matchedLikedSignals`, deepEqual(bs.metadataBackedMatchedLikedSignals, cs.metadataBackedMatchedLikedSignals), bs.metadataBackedMatchedLikedSignals, cs.metadataBackedMatchedLikedSignals, ctx);
  check(`${ctx}_matchedDislikedSignals`, deepEqual(bs.metadataBackedMatchedDislikedSignals, cs.metadataBackedMatchedDislikedSignals), bs.metadataBackedMatchedDislikedSignals, cs.metadataBackedMatchedDislikedSignals, ctx);
  check(`${ctx}_signalMatchTrace`, deepEqual(bs.adultGoogleBooksSignalMatchTrace, cs.adultGoogleBooksSignalMatchTrace), bs.adultGoogleBooksSignalMatchTrace, cs.adultGoogleBooksSignalMatchTrace, ctx);
  check(`${ctx}_matchedField`, deepEqual(bs.adultGoogleBooksSignalMatchedField, cs.adultGoogleBooksSignalMatchedField), bs.adultGoogleBooksSignalMatchedField, cs.adultGoogleBooksSignalMatchedField, ctx);
  check(`${ctx}_matchedText`, deepEqual(bs.adultGoogleBooksSignalMatchedText, cs.adultGoogleBooksSignalMatchedText), bs.adultGoogleBooksSignalMatchedText, cs.adultGoogleBooksSignalMatchedText, ctx);
  check(`${ctx}_matchMethod`, deepEqual(bs.adultGoogleBooksSignalMatchMethod, cs.adultGoogleBooksSignalMatchMethod), bs.adultGoogleBooksSignalMatchMethod, cs.adultGoogleBooksSignalMatchMethod, ctx);
  check(`${ctx}_rejectedShortMatches`, deepEqual(bs.adultGoogleBooksRejectedShortSignalMatches, cs.adultGoogleBooksRejectedShortSignalMatches), bs.adultGoogleBooksRejectedShortSignalMatches, cs.adultGoogleBooksRejectedShortSignalMatches, ctx);

  // Per-title aggregated (from selection output)
  const bp = mapObject(b.perTitle);
  const cp = mapObject(c.perTitle);

  check(`${ctx}_perTitle_trace`, deepEqual(bp.matchedTrace, cp.matchedTrace), bp.matchedTrace, cp.matchedTrace, ctx);
  check(`${ctx}_perTitle_fields`, deepEqual(bp.matchedFields, cp.matchedFields), bp.matchedFields, cp.matchedFields, ctx);
  check(`${ctx}_perTitle_texts`, deepEqual(bp.matchedTexts, cp.matchedTexts), bp.matchedTexts, cp.matchedTexts, ctx);
  check(`${ctx}_perTitle_methods`, deepEqual(bp.matchedMethods, cp.matchedMethods), bp.matchedMethods, cp.matchedMethods, ctx);

  // Content signature
  check(`${ctx}_contentSignature`, b.contentSignature === c.contentSignature, b.contentSignature, c.contentSignature, ctx);

  adultPairs.push({ fixtureName: b.fixtureName, result: failures.filter((f) => f.context === ctx).length === 0 ? "pass" : "fail" });
}

// ---------------------------------------------------------------------------
// Teen fixture comparison
// ---------------------------------------------------------------------------

const baselineTeen = arrayValue(baseline.teenFixtures);
const candidateTeen = arrayValue(candidate.teenFixtures);

check(
  "teen_fixture_count",
  baselineTeen.length === candidateTeen.length,
  baselineTeen.length,
  candidateTeen.length,
  "teen fixture set length",
);

const teenPairs = [];
for (let i = 0; i < Math.max(baselineTeen.length, candidateTeen.length); i++) {
  const b = baselineTeen[i];
  const c = candidateTeen[i];

  if (!b || !c) {
    check(`teen_fixture_${i}_present`, false, b?.fixtureName ?? "(missing)", c?.fixtureName ?? "(missing)", `teen[${i}]`);
    continue;
  }

  const ctx = `teen[${i}]:${b.fixtureName}`;

  // Fixture identity
  check(`${ctx}_name`, b.fixtureName === c.fixtureName, b.fixtureName, c.fixtureName, ctx);
  check(`${ctx}_candidateTitle`, b.candidateTitle === c.candidateTitle, b.candidateTitle, c.candidateTitle, ctx);
  check(`${ctx}_likedSignals`, deepEqual(b.likedSignals, c.likedSignals), b.likedSignals, c.likedSignals, ctx);

  // Score
  check(`${ctx}_score`, b.score === c.score, b.score, c.score, ctx);

  // Per-title signal fields (the #202-scope field for Teen)
  check(
    `${ctx}_perTitleSignalFields`,
    deepEqual(b.perTitleSignalFields, c.perTitleSignalFields),
    b.perTitleSignalFields,
    c.perTitleSignalFields,
    ctx,
  );

  // Full selection map (all titles, not just this candidate)
  const bMap = mapObject(b.selectionFields?.teenGoogleBooksSignalFieldsByTitle);
  const cMap = mapObject(c.selectionFields?.teenGoogleBooksSignalFieldsByTitle);
  check(`${ctx}_signalFieldsByTitle`, deepEqual(bMap, cMap), bMap, cMap, ctx);

  // Content signature
  check(`${ctx}_contentSignature`, b.contentSignature === c.contentSignature, b.contentSignature, c.contentSignature, ctx);

  teenPairs.push({ fixtureName: b.fixtureName, result: failures.filter((f) => f.context === ctx).length === 0 ? "pass" : "fail" });
}

// ---------------------------------------------------------------------------
// Final verdict
// ---------------------------------------------------------------------------

const passed = failures.length === 0;
const totalChecks = checks.length;
const passedChecks = checks.filter((c) => c.result === "pass").length;

console.log("\n=== GOOGLE BOOKS #202 PARITY COMPARISON ===");
console.log(`Baseline:   ${baselinePath}`);
console.log(`Candidate:  ${candidatePath}`);
console.log(`Checks run: ${totalChecks}`);
console.log(`Passed:     ${passedChecks}`);
console.log(`Failed:     ${failures.length}`);
if (warnings.length > 0) {
  console.log(`Warnings:   ${warnings.length}`);
  for (const w of warnings) console.log(`  [WARN] ${w.label}: ${w.detail}`);
}

if (failures.length > 0) {
  console.log("\nFAILURES:");
  for (const f of failures) {
    const bStr = JSON.stringify(f.baselineValue);
    const cStr = JSON.stringify(f.candidateValue);
    console.log(`  [FAIL] ${f.label}`);
    console.log(`         context:   ${f.context}`);
    console.log(`         baseline:  ${bStr?.slice(0, 120)}`);
    console.log(`         candidate: ${cStr?.slice(0, 120)}`);
  }
  console.log("\nVERDICT: PARITY FAILED — #202 consolidation introduced a behavioral difference.");
  console.log("Do not merge until all failures are resolved.");
} else {
  console.log("\nVERDICT: PARITY PASSED — all #202-scope fields are identical pre/post-consolidation.");
}

// ---------------------------------------------------------------------------
// Write outputs
// ---------------------------------------------------------------------------

mkdirSync(outDir, { recursive: true });

const jsonOut = resolve(outDir, "googlebooks-202-parity-compare.json");
const csvOut = resolve(outDir, "googlebooks-202-parity-compare.csv");

const outputJson = {
  generatedAt: new Date().toISOString(),
  baselinePath,
  candidatePath,
  baselineCommit: baseline.baselineCommit,
  candidateCommit: candidate.baselineCommit,
  verdict: passed ? "PARITY_PASSED" : "PARITY_FAILED",
  totalChecks,
  passedChecks,
  failedChecks: failures.length,
  warnings,
  failures,
  adultPairs,
  teenPairs,
  checks,
};

writeFileSync(jsonOut, JSON.stringify(outputJson, null, 2));

const csvHeader = [
  "label",
  "context",
  "result",
  "baselineValue",
  "candidateValue",
].join(",");

const csvRows = checks.map((entry) => [
  `"${String(entry.label).replace(/"/g, '""')}"`,
  `"${String(entry.context || "").replace(/"/g, '""')}"`,
  entry.result,
  entry.result === "fail" ? `"${String(JSON.stringify(entry.baselineValue) || "").replace(/"/g, '""').slice(0, 200)}"` : `""`,
  entry.result === "fail" ? `"${String(JSON.stringify(entry.candidateValue) || "").replace(/"/g, '""').slice(0, 200)}"` : `""`,
].join(","));

writeFileSync(csvOut, [csvHeader, ...csvRows].join("\n"));

console.log(`\nJSON written to: ${jsonOut}`);
console.log(`CSV written to:  ${csvOut}`);

if (!passed) process.exit(1);
