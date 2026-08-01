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
// Regression 7: --mode live --dry-run makes zero network calls
// ---------------------------------------------------------------------------

function testDryRunNoNetwork() {
  // GCD: dry-run with --mode live must not call fetch, even with all env gates cleared.
  try {
    const out = execCapture(
      [join(repoRoot, "scripts/live-evidence/run-gcd-live-probe.mjs"), "--mode", "live", "--dry-run"],
      { GCD_ACCESS_CONFIRMED: "true", GCD_ACCESS_MODE_CONFIRMED: "true" },
    );
    const result = JSON.parse(out);
    if (!result.dryRun) { fail("GCD --dry-run: dryRun flag missing from output"); return; }
    if (result.networkCallsMade !== 0) { fail("GCD --dry-run: networkCallsMade is not 0", result.networkCallsMade); return; }
    if (result.artifactsWritten !== 0) { fail("GCD --dry-run: artifactsWritten is not 0", result.artifactsWritten); return; }
    pass("GCD --mode live --dry-run makes zero network calls and writes zero artifacts");
  } catch (err) {
    fail("GCD --mode live --dry-run failed", err.message);
  }

  // ComicVine: same check
  try {
    const out = execCapture(
      [join(repoRoot, "scripts/live-evidence/run-comicvine-live-probe.mjs"), "--mode", "live", "--dry-run"],
      { COMICVINE_CV1_RESOLVED: "true", COMICVINE_CV4_RESOLVED: "true", COMICVINE_API_KEY: "test-key" },
    );
    const result = JSON.parse(out);
    if (!result.dryRun) { fail("CV --dry-run: dryRun flag missing from output"); return; }
    if (result.networkCallsMade !== 0) { fail("CV --dry-run: networkCallsMade is not 0", result.networkCallsMade); return; }
    if (result.artifactsWritten !== 0) { fail("CV --dry-run: artifactsWritten is not 0", result.artifactsWritten); return; }
    pass("ComicVine --mode live --dry-run makes zero network calls and writes zero artifacts");
  } catch (err) {
    fail("ComicVine --mode live --dry-run failed", err.message);
  }
}

// ---------------------------------------------------------------------------
// Regression 8: Satisfied gates and credentials do NOT bypass dry-run
// ---------------------------------------------------------------------------

function testGatesSatisfiedDontBypassDryRun() {
  // Even with all legal gates satisfied and a valid API key, dry-run must not call fetch.
  // We verify this by checking the dryRun flag and networkCallsMade in the output.
  try {
    const out = execCapture(
      [join(repoRoot, "scripts/live-evidence/run-gcd-live-probe.mjs"), "--mode", "live", "--dry-run", "--profile", "gn-adult-speculative-ensemble"],
      { GCD_ACCESS_CONFIRMED: "true", GCD_ACCESS_MODE_CONFIRMED: "true" },
    );
    const result = JSON.parse(out);
    if (!result.dryRun) { fail("GCD satisfied-gates dry-run: dryRun flag missing"); return; }
    if (result.networkCallsMade !== 0) { fail("GCD satisfied-gates dry-run: network call made despite dry-run", result.networkCallsMade); return; }
    pass("GCD: satisfied gates and credentials do not bypass --dry-run");
  } catch (err) {
    fail("GCD satisfied-gates dry-run test failed", err.message);
  }

  try {
    const out = execCapture(
      [join(repoRoot, "scripts/live-evidence/run-comicvine-live-probe.mjs"), "--mode", "live", "--dry-run", "--profile", "gn-adult-speculative-ensemble"],
      { COMICVINE_CV1_RESOLVED: "true", COMICVINE_CV4_RESOLVED: "true", COMICVINE_API_KEY: "test-key" },
    );
    const result = JSON.parse(out);
    if (!result.dryRun) { fail("CV satisfied-gates dry-run: dryRun flag missing"); return; }
    if (result.networkCallsMade !== 0) { fail("CV satisfied-gates dry-run: network call made despite dry-run", result.networkCallsMade); return; }
    pass("ComicVine: satisfied gates and credentials do not bypass --dry-run");
  } catch (err) {
    fail("ComicVine satisfied-gates dry-run test failed", err.message);
  }
}

// ---------------------------------------------------------------------------
// Regression 9: Missing GC-5 blocks before any network call (not just GC-4)
// ---------------------------------------------------------------------------

function testGc5BlocksBeforeNetwork() {
  // GC-4 satisfied but GC-5 missing — must block with deterministic reason code.
  try {
    const out = execCapture(
      [join(repoRoot, "scripts/live-evidence/run-gcd-live-probe.mjs"), "--mode", "replay", "--profile", "gn-adult-speculative-ensemble"],
      { GCD_ACCESS_CONFIRMED: "true" /* GCD_ACCESS_MODE_CONFIRMED intentionally absent */ },
    );
    // replay mode doesn't call checkLegalGate before requests, but we need to test
    // that in live mode GC-5 blocks. Test live+dry-run to inspect gate status.
    const dryOut = execCapture(
      [join(repoRoot, "scripts/live-evidence/run-gcd-live-probe.mjs"), "--mode", "live", "--dry-run", "--profile", "gn-adult-speculative-ensemble"],
      { GCD_ACCESS_CONFIRMED: "true" /* GCD_ACCESS_MODE_CONFIRMED intentionally absent */ },
    );
    const dryResult = JSON.parse(dryOut);
    if (!dryResult.gateStatus?.blocked) {
      fail("GC-5 missing: expected gate to be blocked when GCD_ACCESS_MODE_CONFIRMED absent", JSON.stringify(dryResult.gateStatus));
      return;
    }
    const expectedCode = "live_evidence_unavailable_gcd_access_mode_unconfirmed";
    if (dryResult.gateStatus.code !== expectedCode) {
      fail(`GC-5 missing: wrong reason code. Expected ${expectedCode}`, dryResult.gateStatus.code);
      return;
    }
    if (dryResult.networkCallsMade !== 0) {
      fail("GC-5 missing: network calls made despite blocked gate", dryResult.networkCallsMade);
      return;
    }
    pass(`GC-5 missing blocks before network with reason code: ${expectedCode}`);
  } catch (err) {
    fail("GC-5 gate test failed", err.message);
  }
}

// ---------------------------------------------------------------------------
// Regression 10: All blocked cases return deterministic reason codes
// ---------------------------------------------------------------------------

function testBlockedCasesReturnDeterministicCodes() {
  const cases = [
    {
      label: "GCD GC-4 missing",
      script: join(repoRoot, "scripts/live-evidence/run-gcd-live-probe.mjs"),
      env: { /* no GCD_ACCESS_CONFIRMED */ },
      expectedCode: "live_evidence_unavailable_legal_block_gcd_access",
    },
    {
      label: "GCD GC-5 missing (GC-4 satisfied)",
      script: join(repoRoot, "scripts/live-evidence/run-gcd-live-probe.mjs"),
      env: { GCD_ACCESS_CONFIRMED: "true" /* no GCD_ACCESS_MODE_CONFIRMED */ },
      expectedCode: "live_evidence_unavailable_gcd_access_mode_unconfirmed",
    },
    {
      label: "ComicVine CV-1 missing",
      script: join(repoRoot, "scripts/live-evidence/run-comicvine-live-probe.mjs"),
      env: { /* no COMICVINE_CV1_RESOLVED */ },
      expectedCode: "live_evidence_unavailable_legal_block_cv_commercial",
    },
    {
      label: "ComicVine CV-4 missing (CV-1 satisfied)",
      script: join(repoRoot, "scripts/live-evidence/run-comicvine-live-probe.mjs"),
      env: { COMICVINE_CV1_RESOLVED: "true" /* no COMICVINE_CV4_RESOLVED */ },
      expectedCode: "live_evidence_unavailable_legal_block_cv_storage",
    },
    {
      label: "ComicVine credentials missing (CV-1+CV-4 satisfied)",
      script: join(repoRoot, "scripts/live-evidence/run-comicvine-live-probe.mjs"),
      env: { COMICVINE_CV1_RESOLVED: "true", COMICVINE_CV4_RESOLVED: "true" /* no API_KEY */ },
      expectedCode: "live_evidence_unavailable_credentials_missing",
    },
  ];

  for (const { label, script, env, expectedCode } of cases) {
    try {
      const out = execCapture(
        [script, "--mode", "live", "--dry-run", "--profile", "gn-adult-speculative-ensemble"],
        env,
      );
      const result = JSON.parse(out);
      if (!result.gateStatus?.blocked) {
        fail(`${label}: expected blocked gate`, JSON.stringify(result.gateStatus));
        continue;
      }
      if (result.gateStatus.code !== expectedCode) {
        fail(`${label}: wrong reason code. Expected ${expectedCode}`, result.gateStatus.code);
        continue;
      }
      if (result.networkCallsMade !== 0) {
        fail(`${label}: network calls made despite blocked gate`, result.networkCallsMade);
        continue;
      }
      pass(`${label}: returns deterministic reason code ${expectedCode}`);
    } catch (err) {
      fail(`${label}: test threw unexpectedly`, err.message);
    }
  }
}

// ---------------------------------------------------------------------------
// Regression 11: No raw payload or Tier-1 evidence written during dry-run
// ---------------------------------------------------------------------------

function testNoDryRunArtifactWrites() {
  const draftGcd = join(repoRoot, "artifacts/live-evidence/gcd/gcd-live-observation-draft.json");
  const draftCv = join(repoRoot, "artifacts/live-evidence/comicvine/comicvine-live-observation-draft.json");

  // Record mtime before dry-run (file may not exist; that's fine)
  const mtimeBefore = (path) => { try { return readFileSync(path, "utf8"); } catch { return null; } };
  const gcdBefore = mtimeBefore(draftGcd);
  const cvBefore = mtimeBefore(draftCv);

  try {
    execCapture(
      [join(repoRoot, "scripts/live-evidence/run-gcd-live-probe.mjs"), "--mode", "live", "--dry-run"],
      { GCD_ACCESS_CONFIRMED: "true", GCD_ACCESS_MODE_CONFIRMED: "true" },
    );
  } catch { /* ignore gate-blocked exits */ }

  try {
    execCapture(
      [join(repoRoot, "scripts/live-evidence/run-comicvine-live-probe.mjs"), "--mode", "live", "--dry-run"],
      { COMICVINE_CV1_RESOLVED: "true", COMICVINE_CV4_RESOLVED: "true", COMICVINE_API_KEY: "test-key" },
    );
  } catch { /* ignore gate-blocked exits */ }

  const gcdAfter = mtimeBefore(draftGcd);
  const cvAfter = mtimeBefore(draftCv);

  if (gcdAfter !== gcdBefore) {
    fail("GCD --dry-run wrote or modified a draft artifact", draftGcd);
  } else {
    pass("GCD --dry-run: no draft artifact written");
  }

  if (cvAfter !== cvBefore) {
    fail("ComicVine --dry-run wrote or modified a draft artifact", draftCv);
  } else {
    pass("ComicVine --dry-run: no draft artifact written");
  }
}

function sortObject(value) {
  if (Array.isArray(value)) return value.map(sortObject);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((k) => [k, sortObject(value[k])]));
  }
  return value;
}

// Run a child process with a custom environment (inherits process.env, then overlays).
// Returns stdout as a string. Throws on non-zero exit.
function execCapture(args, envOverrides = {}) {
  return execFileSync(process.execPath, args, {
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, ...envOverrides },
  });
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
testDryRunNoNetwork();
testGatesSatisfiedDontBypassDryRun();
testGc5BlocksBeforeNetwork();
testBlockedCasesReturnDeterministicCodes();
testNoDryRunArtifactWrites();

if (process.exitCode) {
  console.error("\nOne or more live evidence regressions failed.");
} else {
  console.log("\nAll live evidence regressions passed.");
}
