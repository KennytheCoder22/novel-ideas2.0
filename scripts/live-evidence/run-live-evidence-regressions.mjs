#!/usr/bin/env node
/**
 * Live Evidence Replay Regressions — Phase IV
 *
 * Verifies that frozen Tier 1 observation artifacts reproduce identically
 * without any network access. Also confirms that prior Phase I, II, and III
 * frozen artifacts are unaffected.
 *
 * Pass conditions:
 *   1. GCD probe runner replay completes without network in no-network mode.
 *   2. ComicVine probe runner replay completes without network in no-network mode.
 *   3. GCD and ComicVine frozen artifacts (when present) pass captureHash verification.
 *   4. Phase I, II, and III frozen artifact locks remain green.
 *
 * This suite does NOT make live network calls. It does NOT validate whether
 * live metadata resembles fixtures — that is the delta reporter's responsibility.
 *
 * Governance:
 *   scripts/live-evidence/capture-protocol.md
 *   docs/GRAPHIC_NOVEL_LIVE_EVIDENCE_LICENSING_DECISION.md
 */

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "../..");

function pass(message) {
  console.log(JSON.stringify({ status: "pass", message }, null, 2));
}

function skip(message) {
  console.log(JSON.stringify({ status: "skip", message }, null, 2));
}

function fail(message, detail) {
  console.error(JSON.stringify({ status: "fail", message, detail }, null, 2));
  process.exitCode = 1;
}

function node(...args) {
  try {
    execFileSync(process.execPath, args, { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
  } catch (err) {
    throw new Error(err.stderr || err.stdout || err.message);
  }
}

// ---------------------------------------------------------------------------
// Regression 1: GCD replay mode, no network
// ---------------------------------------------------------------------------

function testGcdReplayNoNetwork() {
  try {
    node(
      join(repoRoot, "scripts/live-evidence/run-gcd-live-probe.mjs"),
      "--mode", "replay",
      "--profile", "all",
      "--verify-no-network",
    );
    pass("GCD replay mode completes without network access");
  } catch (err) {
    fail("GCD replay mode failed", err.message);
  }
}

// ---------------------------------------------------------------------------
// Regression 2: ComicVine replay mode, no network
// ---------------------------------------------------------------------------

function testComicVineReplayNoNetwork() {
  try {
    node(
      join(repoRoot, "scripts/live-evidence/run-comicvine-live-probe.mjs"),
      "--mode", "replay",
      "--profile", "all",
      "--verify-no-network",
    );
    pass("ComicVine replay mode completes without network access");
  } catch (err) {
    fail("ComicVine replay mode failed", err.message);
  }
}

// ---------------------------------------------------------------------------
// Regression 3: GCD frozen artifact hash verification (when artifact exists)
// ---------------------------------------------------------------------------

function testGcdFrozenArtifactHash() {
  const frozenPath = join(repoRoot, "scripts/live-evidence/frozen/gcd-live-observation-v1.json");
  if (!existsSync(frozenPath)) {
    skip("GCD frozen live observation artifact not yet present (pending legal clearance)");
    return;
  }
  const frozen = JSON.parse(readFileSync(frozenPath, "utf8"));
  if (frozen.artifactStatus === "pending_legal_clearance") {
    skip("GCD frozen artifact is a placeholder — no captureHash to verify");
    return;
  }
  if (!Array.isArray(frozen.profiles) || frozen.profiles.length === 0) {
    skip("GCD frozen artifact has no profiles to verify");
    return;
  }
  let allPass = true;
  for (const profileArtifact of frozen.profiles) {
    const { captureHash, ...rest } = profileArtifact;
    if (!captureHash) {
      fail(`GCD frozen artifact profile ${profileArtifact.profileId} missing captureHash`);
      allPass = false;
      continue;
    }
    const computed = createHash("sha256")
      .update(JSON.stringify(sortObject(rest), null, 2))
      .digest("hex");
    if (computed !== captureHash) {
      fail(
        `GCD frozen artifact hash mismatch for ${profileArtifact.profileId}`,
        `expected: ${captureHash}, computed: ${computed}`,
      );
      allPass = false;
    }
  }
  if (allPass) pass("GCD frozen artifact captureHash verified for all profiles");
}

// ---------------------------------------------------------------------------
// Regression 4: ComicVine frozen artifact hash verification (when artifact exists)
// ---------------------------------------------------------------------------

function testComicVineFrozenArtifactHash() {
  const frozenPath = join(repoRoot, "scripts/live-evidence/frozen/comicvine-live-observation-v1.json");
  if (!existsSync(frozenPath)) {
    skip("ComicVine frozen live observation artifact not yet present (pending legal clearance)");
    return;
  }
  const frozen = JSON.parse(readFileSync(frozenPath, "utf8"));
  if (frozen.artifactStatus === "pending_legal_clearance") {
    skip("ComicVine frozen artifact is a placeholder — no captureHash to verify");
    return;
  }
  if (!Array.isArray(frozen.profiles) || frozen.profiles.length === 0) {
    skip("ComicVine frozen artifact has no profiles to verify");
    return;
  }
  let allPass = true;
  for (const profileArtifact of frozen.profiles) {
    const { captureHash, ...rest } = profileArtifact;
    if (!captureHash) {
      fail(`ComicVine frozen artifact profile ${profileArtifact.profileId} missing captureHash`);
      allPass = false;
      continue;
    }
    const computed = createHash("sha256")
      .update(JSON.stringify(sortObject(rest), null, 2))
      .digest("hex");
    if (computed !== captureHash) {
      fail(
        `ComicVine frozen artifact hash mismatch for ${profileArtifact.profileId}`,
        `expected: ${captureHash}, computed: ${computed}`,
      );
      allPass = false;
    }
  }
  if (allPass) pass("ComicVine frozen artifact captureHash verified for all profiles");
}

// ---------------------------------------------------------------------------
// Regression 5: Prior phase locks (Phase I, II, III) still green
// ---------------------------------------------------------------------------

function testPriorPhaseLocks() {
  // Phase I — GCD characterization
  try {
    node(
      join(repoRoot, "scripts/source-competence/run-gcd-characterization.mjs"),
      "--mode", "replay",
      "--profile", "all",
      "--verify-no-network",
      "--verify-determinism",
      "--verify-frozen",
    );
    pass("Phase I GCD frozen characterization lock still green");
  } catch (err) {
    fail("Phase I GCD frozen characterization lock regressed", err.message);
  }

  // Phase II — ComicVine characterization
  try {
    node(
      join(repoRoot, "scripts/source-competence/run-comicvine-characterization.mjs"),
      "--mode", "replay",
      "--profile", "all",
      "--verify-no-network",
      "--verify-determinism",
      "--verify-frozen",
    );
    pass("Phase II ComicVine frozen characterization lock still green");
  } catch (err) {
    fail("Phase II ComicVine frozen characterization lock regressed", err.message);
  }

  // Phase III — GCD vs ComicVine comparison
  try {
    node(
      join(repoRoot, "scripts/comparison-harness/run-gcd-comicvine-comparison.mjs"),
      "--verify-no-network",
      "--verify-determinism",
    );
    pass("Phase III GCD vs ComicVine comparison still green");
  } catch (err) {
    fail("Phase III comparison regressed", err.message);
  }
}

// ---------------------------------------------------------------------------
// Regression 6: Request manifest schema integrity
// ---------------------------------------------------------------------------

function testRequestManifestIntegrity() {
  const manifestPath = join(repoRoot, "scripts/live-evidence/request-manifest-v1.json");
  if (!existsSync(manifestPath)) {
    fail("Request manifest not found", manifestPath);
    return;
  }
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    if (manifest.schemaVersion !== "1.0") {
      fail("Request manifest schema version unexpected", manifest.schemaVersion);
      return;
    }
    if (!Array.isArray(manifest.profiles) || manifest.profiles.length < 6) {
      fail("Request manifest must have at least 6 profiles", `found: ${manifest.profiles?.length}`);
      return;
    }
    for (const profile of manifest.profiles) {
      if (!profile.profileId) {
        fail("Request manifest profile missing profileId");
        return;
      }
      if (profile.requestsPerSource?.gcd?.maxRequestsThisProfile > 2) {
        fail(`Profile ${profile.profileId}: GCD max requests exceeds 2`, profile.requestsPerSource.gcd.maxRequestsThisProfile);
        return;
      }
      if (profile.requestsPerSource?.comicvine?.maxRequestsThisProfile > 2) {
        fail(`Profile ${profile.profileId}: ComicVine max requests exceeds 2`, profile.requestsPerSource.comicvine.maxRequestsThisProfile);
        return;
      }
    }
    const totalGcd = manifest.profiles.reduce((s, p) => s + (p.requestsPerSource?.gcd?.maxRequestsThisProfile || 0), 0);
    const totalCv = manifest.profiles.reduce((s, p) => s + (p.requestsPerSource?.comicvine?.maxRequestsThisProfile || 0), 0);
    if (totalGcd > 18) {
      fail("Request manifest GCD total exceeds session budget of 18", totalGcd);
      return;
    }
    if (totalCv > 18) {
      fail("Request manifest ComicVine total exceeds session budget of 18", totalCv);
      return;
    }
    pass(`Request manifest valid: ${manifest.profiles.length} profiles, GCD total ${totalGcd}, CV total ${totalCv}`);
  } catch (err) {
    fail("Request manifest parse error", err.message);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sortObject(value) {
  if (Array.isArray(value)) return value.map(sortObject);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((k) => [k, sortObject(value[k])]));
  }
  return value;
}

// ---------------------------------------------------------------------------
// Run all regressions
// ---------------------------------------------------------------------------

console.log("=== Live Evidence Replay Regressions ===\n");

testRequestManifestIntegrity();
testGcdReplayNoNetwork();
testComicVineReplayNoNetwork();
testGcdFrozenArtifactHash();
testComicVineFrozenArtifactHash();
testPriorPhaseLocks();

if (process.exitCode) {
  console.error("\nOne or more live evidence regressions failed.");
} else {
  console.log("\nAll live evidence regressions passed.");
}
