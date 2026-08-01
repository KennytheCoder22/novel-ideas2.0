#!/usr/bin/env node
/**
 * GCD vs ComicVine Fixture-Class Source Comparison
 *
 * Runs the Source Comparison Harness on the frozen GCD vs ComicVine
 * comparison input fixture, which was produced by adapting the frozen
 * Phase I (GCD) and Phase II (ComicVine) source-competence characterization
 * artifacts into the comparison harness envelope format.
 *
 * This script does not call source adapters, change routing, alter scoring
 * or selection, or modify any production file. It reads two frozen artifacts
 * and produces a comparison report. Evidence class: Fixture Class.
 *
 * Usage:
 *   node scripts/comparison-harness/run-gcd-comicvine-comparison.mjs \
 *     [--verify-no-network] [--verify-determinism]
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  compareFixture,
  comparisonMarkdown,
  stableJson,
  writeComparisonArtifacts,
} from "./lib/compare.mjs";

function option(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

const repoRoot = resolve(import.meta.dirname, "../..");
const inputPath = resolve(
  repoRoot,
  "scripts/comparison-harness/fixtures/gcd-vs-comicvine-fixture-class-v1.json"
);
const gcdArtifactPath = resolve(
  repoRoot,
  "scripts/source-competence/frozen/gcd-phase1-summary.json"
);
const cvArtifactPath = resolve(
  repoRoot,
  "scripts/source-competence/frozen/comicvine-phase2-summary.json"
);
const outputDir = resolve(
  repoRoot,
  option("--output", "artifacts/comparison-harness/gcd-vs-comicvine")
);
const verifyDeterminism = process.argv.includes("--verify-determinism");
const verifyNoNetwork = process.argv.includes("--verify-no-network");

// Record frozen input hashes for traceability (no hard assertion — hashes
// are recorded in the report and verified by --verify-frozen on the individual
// characterization runners; see run-gcd-characterization.mjs and
// run-comicvine-characterization.mjs for canonical frozen-artifact verification).
const gcdArtifactHash = sha256(readFileSync(gcdArtifactPath));
const cvArtifactHash = sha256(readFileSync(cvArtifactPath));
const inputFixtureRaw = readFileSync(inputPath, "utf8");
const fixture = JSON.parse(inputFixtureRaw);

// Install network guard before any comparison work.
const originalFetch = globalThis.fetch;
let networkCallCount = 0;
if (verifyNoNetwork) {
  globalThis.fetch = async (url) => {
    networkCallCount += 1;
    throw new Error(`COMPARISON_HARNESS_NETWORK_FORBIDDEN:${url}`);
  };
}

try {
  const result = compareFixture(fixture);

  if (verifyDeterminism) {
    const repeated = compareFixture(fixture);
    if (stableJson(result) !== stableJson(repeated)) {
      throw new Error("Determinism check failed: JSON differs across identical comparisons");
    }
    if (comparisonMarkdown(result) !== comparisonMarkdown(repeated)) {
      throw new Error("Determinism check failed: Markdown differs across identical comparisons");
    }
  }

  if (verifyNoNetwork && networkCallCount !== 0) {
    throw new Error(`No-network check failed: ${networkCallCount} network call(s) attempted`);
  }

  writeComparisonArtifacts(outputDir, result);

  console.log(
    JSON.stringify(
      {
        pass: true,
        phase: "Graphic Novel Source Competence Phase III — GCD vs ComicVine Comparison",
        evidenceClass: "Fixture Class",
        equivalenceCertification: fixture.equivalenceCertification,
        comparisonRunId: result.comparisonRunId,
        caseCount: result.comparisons.length,
        frozenInputs: {
          gcdArtifact: gcdArtifactPath.replace(`${repoRoot}\\`, ""),
          gcdArtifactSha256: gcdArtifactHash,
          cvArtifact: cvArtifactPath.replace(`${repoRoot}\\`, ""),
          cvArtifactSha256: cvArtifactHash,
          fixtureSha256: sha256(inputFixtureRaw),
        },
        deterministic: verifyDeterminism,
        noNetwork: verifyNoNetwork ? networkCallCount === 0 : "not_verified",
        outputDir: outputDir.replace(`${repoRoot}\\`, ""),
        comparativeConclusionAuthorized: false,
        humanUsefulnessClaim: result.humanUsefulnessClaim,
      },
      null,
      2
    )
  );
} finally {
  globalThis.fetch = originalFetch;
}
