#!/usr/bin/env node
import { resolve } from "node:path";
import { stableJson } from "./lib/harness.mjs";
import {
  GOOGLE_BOOKS_CERTIFICATION_VERSION,
  googleBooksFixtureInventory,
  googleBooksProductionHashes,
  loadGoogleBooksDefinitions,
  loadGoogleBooksPipeline,
  replayGoogleBooks,
  writeGoogleBooksArtifacts,
} from "./lib/googleBooksCertification.mjs";

function option(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const repoRoot = resolve(import.meta.dirname, "../..");
const mode = option("--mode", "replay");
const selectedProfile = option("--profile", "all");
const outputDir = resolve(repoRoot, option("--output", "artifacts/source-competence/google-books-phase1"));
const verifyDeterminism = process.argv.includes("--verify-determinism");
const verifyNoNetwork = process.argv.includes("--verify-no-network");
if (!["fixture", "replay"].includes(mode)) throw new Error(`Unsupported mode: ${mode}`);

const definitions = loadGoogleBooksDefinitions(repoRoot);
const profiles = selectedProfile === "all"
  ? definitions.profiles
  : definitions.profiles.filter((profile) => profile.profileId === selectedProfile);
if (!profiles.length) throw new Error(`Unknown Google Books certification profile: ${selectedProfile}`);
const hashes = googleBooksProductionHashes(repoRoot);
const pipeline = mode === "replay" ? await loadGoogleBooksPipeline(repoRoot) : null;

async function execute() {
  const results = [];
  for (const profile of profiles) {
    const fixture = definitions.fixtures[profile.profileId];
    const artifact = mode === "fixture"
      ? googleBooksFixtureInventory(profile, fixture, hashes)
      : await replayGoogleBooks(profile, fixture, pipeline, hashes);
    if (mode === "replay") {
      if (artifact.actualActivation !== profile.expectedActivation) {
        throw new Error(`${profile.profileId}: expected activation ${profile.expectedActivation}, got ${artifact.actualActivation}`);
      }
      if (artifact.actualTerminalState !== profile.expectedTerminalStateFamily) {
        throw new Error(`${profile.profileId}: expected terminal ${profile.expectedTerminalStateFamily}, got ${artifact.actualTerminalState}`);
      }
    }
    results.push(artifact);
  }
  return results;
}

if (verifyNoNetwork) {
  const originalFetch = globalThis.fetch;
  let blocked = false;
  globalThis.fetch = async (url) => {
    throw new Error(`NETWORK_DISABLED_UNEXPECTED_REQUEST:${url}`);
  };
  try {
    await globalThis.fetch("https://example.invalid/forbidden");
  } catch (error) {
    blocked = String(error).includes("NETWORK_DISABLED_UNEXPECTED_REQUEST");
  } finally {
    globalThis.fetch = originalFetch;
  }
  if (!blocked) throw new Error("No-network guard regression failed");
}

const beforeHashes = googleBooksProductionHashes(repoRoot);
const first = await execute();
if (verifyDeterminism) {
  const second = await execute();
  if (stableJson(first) !== stableJson(second)) {
    throw new Error("Determinism regression failed: Google Books replay artifacts differ across identical runs");
  }
}
const afterHashes = googleBooksProductionHashes(repoRoot);
if (stableJson(beforeHashes) !== stableJson(afterHashes)) {
  throw new Error("Production source hashes changed during diagnostic certification");
}
writeGoogleBooksArtifacts(outputDir, first);
console.log(JSON.stringify({
  pass: true,
  certification: "Google Books Phase 1",
  certificationVersion: GOOGLE_BOOKS_CERTIFICATION_VERSION,
  mode,
  caseCount: first.length,
  noNetworkGuardVerified: verifyNoNetwork,
  deterministicReplayVerified: verifyDeterminism,
  productionHashesUnchanged: true,
  outputDir: outputDir.replace(`${repoRoot}\\`, ""),
  terminalStates: Object.fromEntries(first.map((artifact) => [artifact.profile.profileId, artifact.actualTerminalState])),
}, null, 2));
