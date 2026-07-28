#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { compareFixture, comparisonMarkdown, stableJson, writeComparisonArtifacts } from "./lib/compare.mjs";

function option(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const repoRoot = resolve(import.meta.dirname, "../..");
const inputPath = resolve(repoRoot, option("--input", "scripts/comparison-harness/fixtures/openlibrary-vs-googlebooks-v1.json"));
const outputDir = resolve(repoRoot, option("--output", "artifacts/comparison-harness/phase1"));
const verifyDeterminism = process.argv.includes("--verify-determinism");
const verifyNoNetwork = process.argv.includes("--verify-no-network");
const fixture = JSON.parse(readFileSync(inputPath, "utf8"));

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
    if (stableJson(result) !== stableJson(repeated)) throw new Error("Determinism check failed: JSON differs across identical comparisons");
    if (comparisonMarkdown(result) !== comparisonMarkdown(repeated)) throw new Error("Determinism check failed: Markdown differs across identical comparisons");
  }
  if (verifyNoNetwork && networkCallCount !== 0) throw new Error(`No-network check failed: ${networkCallCount} calls attempted`);
  writeComparisonArtifacts(outputDir, result);
  console.log(JSON.stringify({
    pass: true,
    comparisonRunId: result.comparisonRunId,
    caseCount: result.comparisons.length,
    sourcesByCase: Object.fromEntries(result.comparisons.map((comparison) => [comparison.caseId, comparison.sources.map((source) => source.source)])),
    deterministic: verifyDeterminism,
    noNetwork: verifyNoNetwork && networkCallCount === 0,
    outputDir: outputDir.replace(`${repoRoot}\\`, ""),
  }, null, 2));
} finally {
  globalThis.fetch = originalFetch;
}
