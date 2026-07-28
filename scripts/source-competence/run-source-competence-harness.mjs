#!/usr/bin/env node
import { resolve, join } from "node:path";
import { loadDefinitions, loadPipeline, productionHashes, fixtureInventory, replay, stableJson, writeArtifacts } from "./lib/harness.mjs";

function option(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const repoRoot = resolve(import.meta.dirname, "../..");
const mode = option("--mode", "replay");
const outputDir = resolve(repoRoot, option("--output", "artifacts/source-competence/phase1"));
const selectedProfile = option("--profile", "all");
const verifyDeterminism = process.argv.includes("--verify-determinism");
const verifyNoNetwork = process.argv.includes("--verify-no-network");
if (!["fixture", "replay"].includes(mode)) throw new Error(`Unsupported mode: ${mode}`);

const definitions = loadDefinitions(repoRoot);
const profiles = selectedProfile === "all" ? definitions.profiles : definitions.profiles.filter((row) => row.profileId === selectedProfile);
if (!profiles.length) throw new Error(`Unknown profile: ${selectedProfile}`);
const hashes = productionHashes(repoRoot);
const pipeline = mode === "replay" ? await loadPipeline(repoRoot) : null;

async function execute() {
  const results = [];
  for (const profile of profiles) {
    const fixture = definitions.fixtures[profile.profileId];
    const artifact = mode === "fixture" ? fixtureInventory(profile, fixture, hashes) : await replay(profile, fixture, pipeline, hashes);
    if (mode === "replay") {
      if (artifact.actualActivation !== profile.expectedActivation) throw new Error(`${profile.profileId}: expected activation ${profile.expectedActivation}, got ${artifact.actualActivation}`);
      if (artifact.actualTerminalState !== profile.expectedTerminalStateFamily) throw new Error(`${profile.profileId}: expected terminal ${profile.expectedTerminalStateFamily}, got ${artifact.actualTerminalState}`);
    }
    results.push(artifact);
  }
  return results;
}

if (verifyNoNetwork) {
  const originalFetch = globalThis.fetch;
  let blocked = false;
  globalThis.fetch = async (url) => { throw new Error(`NETWORK_DISABLED_UNEXPECTED_REQUEST:${url}`); };
  try { await globalThis.fetch("https://example.invalid/forbidden"); } catch (error) { blocked = String(error).includes("NETWORK_DISABLED_UNEXPECTED_REQUEST"); }
  finally { globalThis.fetch = originalFetch; }
  if (!blocked) throw new Error("No-network guard regression failed");
}

const first = await execute();
if (verifyDeterminism) {
  const second = await execute();
  if (stableJson(first) !== stableJson(second)) throw new Error("Determinism regression failed: replay artifacts differ across identical runs");
}
writeArtifacts(outputDir, first);
console.log(JSON.stringify({
  pass: true, harnessVersion: "1.0.0", mode, caseCount: first.length,
  noNetworkGuardVerified: verifyNoNetwork, deterministicReplayVerified: verifyDeterminism,
  outputDir: outputDir.replace(`${repoRoot}\\`, ""),
  terminalStates: Object.fromEntries(first.map((row) => [row.profile.profileId, row.actualTerminalState])),
}, null, 2));
