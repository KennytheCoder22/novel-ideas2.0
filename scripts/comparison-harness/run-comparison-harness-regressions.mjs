import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { candidateIdentity, compareFixture, comparisonMarkdown, stableJson } from "./lib/compare.mjs";

function assertEqual(actual, expected, message) {
  if (actual !== expected) throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

function assertThrows(fn, message) {
  let threw = false;
  try { fn(); } catch { threw = true; }
  if (!threw) throw new Error(message);
}

const repoRoot = resolve(import.meta.dirname, "../..");
const fixture = JSON.parse(readFileSync(resolve(repoRoot, "scripts/comparison-harness/fixtures/openlibrary-vs-googlebooks-v1.json"), "utf8"));
const originalFetch = globalThis.fetch;
let networkCallCount = 0;
globalThis.fetch = async (url) => {
  networkCallCount += 1;
  throw new Error(`COMPARISON_HARNESS_NETWORK_FORBIDDEN:${url}`);
};

try {
  const first = compareFixture(fixture);
  const second = compareFixture(fixture);
  assertEqual(stableJson(first), stableJson(second), "comparison JSON must be deterministic");
  assertEqual(comparisonMarkdown(first), comparisonMarkdown(second), "comparison Markdown must be deterministic");
  assertEqual(networkCallCount, 0, "comparison must not attempt network access");
  assertEqual(first.comparisons.length, 3, "representative fixture case count");
  assertEqual(first.harness.productionCodeImported, false, "comparison must remain outside production code");

  const teen = first.comparisons.find((row) => row.caseId === "teen-fantasy");
  assertEqual(teen.overlap.overlapCount, 2, "Teen Fantasy overlap");
  assertEqual(teen.overlap.unionSize, 8, "Teen Fantasy union size");
  assertEqual(teen.overlap.jaccard, 0.25, "Teen Fantasy Jaccard overlap");
  assertEqual(teen.uniqueContribution.openLibrary.length, 3, "Teen Fantasy Open Library unique contribution");
  assertEqual(teen.uniqueContribution.googleBooks.length, 3, "Teen Fantasy Google Books unique contribution");
  assertEqual(teen.sources.find((row) => row.source === "openLibrary").metadata.completenessRate, 1, "Open Library fixture metadata coverage");
  assertEqual(teen.sources.find((row) => row.source === "googleBooks").metadata.completenessRate, 0.9556, "Google Books fixture metadata coverage");

  const adult = first.comparisons.find((row) => row.caseId === "adult-mystery");
  assertEqual(adult.overlap.overlapCount, 2, "Adult Mystery overlap");
  assertEqual(adult.overlap.unionSize, 6, "Adult Mystery union size");
  assertEqual(adult.uniqueContribution.openLibrary.length, 1, "Adult Mystery Open Library unique contribution");
  assertEqual(adult.uniqueContribution.googleBooks.length, 3, "Adult Mystery Google Books unique contribution");
  assertEqual(adult.sources.find((row) => row.source === "openLibrary").slate.underfillCount, 2, "Adult Mystery Open Library underfill");
  assertEqual(adult.sources.find((row) => row.source === "googleBooks").slate.underfillCount, 0, "Adult Mystery Google Books full slate");

  const preteen = first.comparisons.find((row) => row.caseId === "preteen-adventure-source-failure");
  const failedGoogle = preteen.sources.find((row) => row.source === "googleBooks");
  assertEqual(failedGoogle.terminalState, "response_invalid", "source-specific failure terminal state");
  assertEqual(failedGoogle.failureReason, "fixture_invalid_response_shape", "source-specific failure reason");
  assertEqual(failedGoogle.slate.selectedCount, 0, "failed source slate size");

  for (const comparison of first.comparisons) {
    for (const source of comparison.sources) {
      assertEqual(source.humanReview.status, "not_reviewed", `${comparison.caseId}/${source.source} human review state`);
      assertEqual(source.humanReview.coverageRate, 0, `${comparison.caseId}/${source.source} human review coverage`);
      assertEqual(source.humanReview.claimsHumanUsefulness, false, `${comparison.caseId}/${source.source} usefulness claim boundary`);
    }
  }

  assertEqual(candidateIdentity({ stableId: "a", title: "Same Book", creators: ["One Author"] }).strategy, "normalized_title_first_creator", "identity fallback must be explicit");
  const invalid = structuredClone(fixture);
  invalid.cases[0].sources[1].source = invalid.cases[0].sources[0].source;
  assertThrows(() => compareFixture(invalid), "same-source comparison must be rejected");

  console.log(JSON.stringify({
    pass: true,
    caseCount: first.comparisons.length,
    deterministic: true,
    networkCallCount,
    assertions: [
      "same_profile_two_source_validation",
      "transparent_overlap_and_unique_contribution",
      "underfill_and_source_failure_preserved",
      "metadata_and_diversity_metrics_deterministic",
      "human_review_unreviewed_is_explicit",
      "no_production_imports_or_network",
    ],
  }, null, 2));
} finally {
  globalThis.fetch = originalFetch;
}
