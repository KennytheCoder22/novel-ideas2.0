#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { stableJson } from "./lib/harness.mjs";
import {
  COMICVINE_CHARACTERIZATION_VERSION,
  characterizeComicVineFixture,
  comicVineFixtureInventory,
  comicVineProductionHashes,
  loadComicVineDefinitions,
  writeComicVineArtifacts,
} from "./lib/comicVineCharacterization.mjs";

function option(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const repoRoot = resolve(import.meta.dirname, "../..");
const mode = option("--mode", "replay");
const selectedProfile = option("--profile", "all");
const outputDir = resolve(repoRoot, option("--output", "artifacts/source-competence/graphic-novel-source-competence-phase2"));
const verifyDeterminism = process.argv.includes("--verify-determinism");
const verifyNoNetwork = process.argv.includes("--verify-no-network");
const verifyFrozen = process.argv.includes("--verify-frozen");
if (!["fixture", "replay"].includes(mode)) throw new Error(`Unsupported mode: ${mode}`);

const definitions = loadComicVineDefinitions(repoRoot);
const profiles = selectedProfile === "all"
  ? definitions.profiles
  : definitions.profiles.filter((profile) => profile.profileId === selectedProfile);
if (!profiles.length) throw new Error(`Unknown ComicVine characterization profile: ${selectedProfile}`);

function execute() {
  const hashes = comicVineProductionHashes(repoRoot);
  return profiles.map((profile) => {
    const fixture = definitions.fixtures[profile.profileId];
    const artifact = mode === "fixture"
      ? comicVineFixtureInventory(profile, fixture, definitions, hashes)
      : characterizeComicVineFixture(profile, fixture, definitions, hashes);
    if (mode === "replay") {
      if (artifact.characterizationOutcome !== profile.expectedOutcome) {
        throw new Error(`${profile.profileId}: expected outcome ${profile.expectedOutcome}, got ${artifact.characterizationOutcome}`);
      }
      if (artifact.identity.recommendationCapableIdentityCount !== profile.expectedRecommendationCapableCount) {
        throw new Error(`${profile.profileId}: expected ${profile.expectedRecommendationCapableCount} recommendation-capable identities, got ${artifact.identity.recommendationCapableIdentityCount}`);
      }
    }
    return artifact;
  });
}

if (verifyNoNetwork) {
  const originalFetch = globalThis.fetch;
  let attempted = false;
  globalThis.fetch = async (url) => {
    attempted = true;
    throw new Error(`NETWORK_DISABLED_UNEXPECTED_REQUEST:${url}`);
  };
  try {
    execute();
  } finally {
    globalThis.fetch = originalFetch;
  }
  if (attempted) throw new Error("ComicVine fixture characterization attempted network access");
}

const hashesBefore = comicVineProductionHashes(repoRoot);
const first = execute();
if (verifyDeterminism) {
  const second = execute();
  if (stableJson(first) !== stableJson(second)) {
    throw new Error("Determinism regression failed: ComicVine characterization artifacts differ across identical runs");
  }
}
const hashesAfter = comicVineProductionHashes(repoRoot);
if (stableJson(hashesBefore) !== stableJson(hashesAfter)) {
  throw new Error("Production hashes changed during ComicVine diagnostic characterization");
}
const summary = writeComicVineArtifacts(outputDir, first);

if (verifyFrozen) {
  if (mode !== "replay" || selectedProfile !== "all") throw new Error("--verify-frozen requires --mode replay --profile all");
  const frozenPath = join(repoRoot, "scripts/source-competence/frozen/comicvine-phase2-summary.json");
  if (!existsSync(frozenPath)) throw new Error(`Frozen ComicVine artifact missing: ${frozenPath}`);
  const frozen = readFileSync(frozenPath, "utf8");
  if (stableJson(JSON.parse(frozen)) !== stableJson(summary)) {
    throw new Error("Frozen ComicVine characterization artifact differs from deterministic replay");
  }
}

console.log(JSON.stringify({
  pass: true,
  characterization: "Graphic Novel Source Competence Phase II",
  characterizationVersion: COMICVINE_CHARACTERIZATION_VERSION,
  source: "comicvine",
  mode,
  caseCount: first.length,
  noNetworkGuardVerified: verifyNoNetwork,
  deterministicReplayVerified: verifyDeterminism,
  frozenArtifactVerified: verifyFrozen,
  productionHashesUnchanged: true,
  productionAdapterState: "adapter_implemented",
  liveTransportCharacterized: false,
  comparativeConclusionMade: false,
  outputDir: outputDir.replace(`${repoRoot}\\`, "").replace(`${repoRoot}/`, ""),
  outcomes: Object.fromEntries(first.map((artifact) => [artifact.profile.profileId, artifact.characterizationOutcome])),
}, null, 2));
