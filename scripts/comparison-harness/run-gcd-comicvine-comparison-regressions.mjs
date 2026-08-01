#!/usr/bin/env node
/**
 * GCD vs ComicVine Comparison Regression Suite
 *
 * Structural assertions over the GCD vs ComicVine fixture-class comparison.
 * Observed metrics (overlap, coverage rates) are reported as findings, not
 * as hard pass conditions — per the comparison-only methodology in
 * docs/SOURCE_COMPARISON_HARNESS.md and the Phase III plan.
 *
 * Also re-runs the existing Open Library vs Google Books regression suite to
 * confirm that the comparison harness library remains unmodified.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  candidateIdentity,
  compareFixture,
  comparisonMarkdown,
  stableJson,
} from "./lib/compare.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../..");

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertTrue(actual, message) {
  if (!actual) throw new Error(`${message}: expected truthy, got ${JSON.stringify(actual)}`);
}

// ─── Load fixture ────────────────────────────────────────────────────────────

const fixturePath = resolve(
  repoRoot,
  "scripts/comparison-harness/fixtures/gcd-vs-comicvine-fixture-class-v1.json"
);
const fixture = JSON.parse(readFileSync(fixturePath, "utf8"));

// ─── Install network guard ────────────────────────────────────────────────────

const originalFetch = globalThis.fetch;
let networkCallCount = 0;
globalThis.fetch = async (url) => {
  networkCallCount += 1;
  throw new Error(`COMPARISON_HARNESS_NETWORK_FORBIDDEN:${url}`);
};

const observations = {};

try {
  // ─── Run comparison (twice for determinism check) ───────────────────────────

  const first = compareFixture(fixture);
  const second = compareFixture(fixture);

  // ─── Structural assertions ──────────────────────────────────────────────────

  assertEqual(stableJson(first), stableJson(second), "comparison JSON must be deterministic");
  assertEqual(
    comparisonMarkdown(first),
    comparisonMarkdown(second),
    "comparison Markdown must be deterministic"
  );
  assertEqual(networkCallCount, 0, "comparison must not attempt network access");
  assertEqual(first.harness.productionCodeImported, false, "comparison must remain outside production code");
  assertEqual(
    first.humanUsefulnessClaim,
    "not_established_without_completed_hash_linked_human_review",
    "human usefulness must not be claimed"
  );

  // Eight cases: six content profiles + two operational controls
  assertEqual(first.comparisons.length, 8, "case count");

  const EXPECTED_CONTENT_CASE_IDS = [
    "gn-adult-speculative-ensemble",
    "gn-adult-horror-mystery",
    "gn-teen-fantasy-adventure",
    "gn-teen-superhero-identity",
    "gn-preteen-humor-adventure",
    "gn-teen-manga-volume",
  ];
  const EXPECTED_CONTROL_CASE_IDS = [
    "control-valid_empty_response",
    "control-response_invalid",
  ];

  const allCaseIds = first.comparisons.map((c) => c.caseId);
  for (const id of [...EXPECTED_CONTENT_CASE_IDS, ...EXPECTED_CONTROL_CASE_IDS]) {
    assertTrue(allCaseIds.includes(id), `case "${id}" must be present`);
  }

  // Each case must have exactly two sources: gcd and comicvine
  for (const comparison of first.comparisons) {
    const sources = comparison.sources.map((s) => s.source).sort();
    assertEqual(sources.join(","), "comicvine,gcd", `${comparison.caseId}: must have gcd and comicvine sources`);
  }

  // Human review must be not_reviewed with zero coverage for all cases
  for (const comparison of first.comparisons) {
    for (const source of comparison.sources) {
      assertEqual(
        source.humanReview.status,
        "not_reviewed",
        `${comparison.caseId}/${source.source}: human review state`
      );
      assertEqual(
        source.humanReview.coverageRate,
        0,
        `${comparison.caseId}/${source.source}: human review coverage`
      );
      assertEqual(
        source.humanReview.claimsHumanUsefulness,
        false,
        `${comparison.caseId}/${source.source}: usefulness claim boundary`
      );
    }
  }

  // Operational controls must have empty slates on both sources
  for (const controlId of EXPECTED_CONTROL_CASE_IDS) {
    const control = first.comparisons.find((c) => c.caseId === controlId);
    for (const source of control.sources) {
      assertEqual(
        source.slate.selectedCount,
        0,
        `${controlId}/${source.source}: control must have empty slate`
      );
    }
    assertEqual(control.overlap.unionSize, 0, `${controlId}: control union size`);
  }

  // Content profiles must have non-zero slate on both sources
  for (const caseId of EXPECTED_CONTENT_CASE_IDS) {
    const comparison = first.comparisons.find((c) => c.caseId === caseId);
    for (const source of comparison.sources) {
      assertTrue(
        source.slate.selectedCount > 0,
        `${caseId}/${source.source}: content profile must have non-empty slate`
      );
    }
  }

  // GCD and ComicVine terminal states must match within each case
  // (equivalence certification ensures both sources produce the same
  // characterization outcome for each profile).
  for (const comparison of first.comparisons) {
    const gcd = comparison.sources.find((s) => s.source === "gcd");
    const cv = comparison.sources.find((s) => s.source === "comicvine");
    assertEqual(
      gcd.terminalState,
      cv.terminalState,
      `${comparison.caseId}: terminal states must match (equivalence-certified)`
    );
  }

  // Identity fallback strategy is title+creator when workKey is present
  // (the adapter always sets workKey = recommendationIdentity.id).
  const specContent = first.comparisons
    .find((c) => c.caseId === "gn-adult-speculative-ensemble")
    .sources.find((s) => s.source === "gcd");
  if (specContent.slate.selectedCount > 0) {
    const firstCandidate = fixture.cases.find(
      (c) => c.caseId === "gn-adult-speculative-ensemble"
    ).sources.find((s) => s.source === "gcd").selected[0];
    const identity = candidateIdentity(firstCandidate);
    assertEqual(
      identity.strategy,
      "canonical_work_key",
      "adapter-set workKey resolves to canonical_work_key strategy"
    );
  }

  // ─── Record observed metrics (findings, not pass conditions) ───────────────

  for (const comparison of first.comparisons) {
    const gcd = comparison.sources.find((s) => s.source === "gcd");
    const cv = comparison.sources.find((s) => s.source === "comicvine");
    observations[comparison.caseId] = {
      overlapCount: comparison.overlap.overlapCount,
      jaccard: comparison.overlap.jaccard,
      unionSize: comparison.overlap.unionSize,
      gcdMetadataCompleteness: gcd.metadata.completenessRate,
      cvMetadataCompleteness: cv.metadata.completenessRate,
      gcdUniqueContribution: comparison.uniqueContribution.gcd?.length ?? 0,
      cvUniqueContribution: comparison.uniqueContribution.comicvine?.length ?? 0,
    };
  }

  // ─── Re-run existing OL vs GB regression suite ──────────────────────────────
  // Confirms compare.mjs library is unmodified.
  execFileSync(process.execPath, [
    resolve(repoRoot, "scripts/comparison-harness/run-comparison-harness-regressions.mjs"),
  ], { cwd: repoRoot, stdio: "pipe" });

  console.log(JSON.stringify({
    pass: true,
    caseCount: first.comparisons.length,
    deterministic: true,
    networkCallCount,
    existingOlGbRegressionsPass: true,
    assertions: [
      "comparison_json_and_markdown_deterministic",
      "no_network_access",
      "no_production_code_imported",
      "human_usefulness_not_claimed",
      "eight_cases_present",
      "all_expected_case_ids_present",
      "each_case_has_gcd_and_comicvine_sources",
      "human_review_not_reviewed_and_zero_coverage_for_all",
      "control_cases_have_empty_slates",
      "content_cases_have_non_empty_slates",
      "terminal_states_match_within_each_case",
      "adapter_workkey_resolves_canonical_work_key_strategy",
    ],
    observedMetrics: observations,
  }, null, 2));
} finally {
  globalThis.fetch = originalFetch;
}
