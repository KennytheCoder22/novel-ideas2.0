import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  RECOMMENDATION_CERTIFICATION_SUITE_V1,
  flattenSuiteFixtureInventory,
} from "./lib/recommendation-certification-suite-v1-fixtures.mjs";

const OUTPUT_PATH = resolve("scripts/output/recommendation-certification-suite-v1.json");

function buildArtifact() {
  const fixtureInventory = flattenSuiteFixtureInventory(RECOMMENDATION_CERTIFICATION_SUITE_V1).map((fixture) => ({
    fixtureId: fixture.fixtureId,
    profileName: fixture.profileName,
    purpose: fixture.purpose,
    subsystemProtected: fixture.subsystemProtected,
    randomSeed: fixture.randomSeed,
    correctedFixtureDefinition: fixture.correctedFixtureDefinition,
  }));

  return {
    suiteName: RECOMMENDATION_CERTIFICATION_SUITE_V1.suiteName,
    version: RECOMMENDATION_CERTIFICATION_SUITE_V1.version,
    dateEstablished: RECOMMENDATION_CERTIFICATION_SUITE_V1.dateEstablished,
    diagnosticMetricLabels: RECOMMENDATION_CERTIFICATION_SUITE_V1.diagnosticMetricLabels,
    tiers: RECOMMENDATION_CERTIFICATION_SUITE_V1.tiers,
    fixtureInventory,
    countMetrics: {
      eligibleForScoring: RECOMMENDATION_CERTIFICATION_SUITE_V1.diagnosticMetricLabels.eligibleForScoring,
      candidatesPassedToScoring: RECOMMENDATION_CERTIFICATION_SUITE_V1.diagnosticMetricLabels.candidatesPassedToScoring,
      finalRecommendations: RECOMMENDATION_CERTIFICATION_SUITE_V1.diagnosticMetricLabels.finalRecommendations,
    },
  };
}

function main() {
  const artifact = buildArtifact();
  mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  console.log("PASS: Recommendation Certification Suite v1 artifact generated");
  console.log(JSON.stringify({
    output: OUTPUT_PATH.replace(/\\/g, "/"),
    suiteName: artifact.suiteName,
    version: artifact.version,
    fixtureCount: artifact.fixtureInventory.length,
  }, null, 2));
}

main();
