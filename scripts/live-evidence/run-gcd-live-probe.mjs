#!/usr/bin/env node
/**
 * GCD Live Probe Runner — Phase IV Live Observation
 *
 * Modes:
 *   --mode live    Perform bounded live requests against GCD. Requires GC-4 and GC-5 resolved.
 *   --mode replay  Read the frozen Tier 1 artifact from disk. No network.
 *
 * Flags:
 *   --profile <id>       Run one profile (default: "all")
 *   --output <dir>       Output directory (default: artifacts/live-evidence/gcd)
 *   --verify-no-network  Fail if any network socket is opened (replay mode guard)
 *   --verify-frozen      Verify output matches frozen artifact (replay only)
 *   --dry-run            Pre-run checks only; no live requests and no artifact writes
 *
 * Governance:
 *   docs/GRAPHIC_NOVEL_LIVE_EVIDENCE_LICENSING_DECISION.md
 *   scripts/live-evidence/capture-protocol.md
 *   docs/NOVELIDEAS_COMPLETION_ROADMAP.md §5
 *
 * Hard constraints enforced here:
 *   - No live requests until GC-4 (access arrangement) AND GC-5 (access mode) are resolved.
 *   - --dry-run is a GUARANTEED no-network path: fetch is trapped and throws regardless of mode,
 *     credentials, or legal-gate state. Returns only planned manifest, gate status, and bounds.
 *   - No cover URL values stored in any artifact.
 *   - No API credentials in any artifact or log line.
 *   - Max 18 requests per session; 2s inter-request delay; 15s per-request timeout.
 *   - Tier 2 (raw response bodies) never written to disk.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MANIFEST_VERSION = "1.0";
const EVIDENCE_CLASS_FROZEN = "Representative Frozen Class";
const EVIDENCE_CLASS_LIVE = "Live Observation Class";

const STOP_CONDITIONS = {
  LEGAL_BLOCK_GCD_ACCESS: "live_evidence_unavailable_legal_block_gcd_access",
  GCD_ACCESS_MODE_UNCONFIRMED: "live_evidence_unavailable_gcd_access_mode_unconfirmed",
  GCD_ANON_DISABLED: "live_evidence_unavailable_gcd_anon_disabled",
  CREDENTIALS_MISSING: "live_evidence_unavailable_credentials_missing",
  ACCESS_REFUSED: "live_evidence_unavailable_access_refused",
  RATE_LIMIT: "live_evidence_unavailable_rate_limit",
  TRANSPORT_TIMEOUT: "live_evidence_unavailable_transport_timeout",
  SCHEMA_DRIFT: "live_evidence_unavailable_schema_drift",
  COVER_RIGHTS: "live_evidence_unavailable_cover_rights",
  BUDGET_EXHAUSTED: "live_evidence_budget_exhausted",
};

const GCD_MEASURED_FIELDS = [
  "seriesId", "issueId", "seriesName", "issueNumber", "yearBegan",
  "publicationDate", "language", "creatorCredits", "binding",
  "pageCount", "coverImageUrl",
];

const MAX_REQUESTS_PER_SESSION = 18;
const MIN_INTER_REQUEST_DELAY_MS = 2000;
const PER_REQUEST_TIMEOUT_MS = 15000;
const CRITICAL_FIELDS = ["seriesId", "issueId", "seriesName"];

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

function option(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const repoRoot = resolve(import.meta.dirname, "../..");
const mode = option("--mode", "replay");
const selectedProfile = option("--profile", "all");
const outputDir = resolve(repoRoot, option("--output", "artifacts/live-evidence/gcd"));
const verifyNoNetwork = process.argv.includes("--verify-no-network");
const verifyFrozen = process.argv.includes("--verify-frozen");
const dryRun = process.argv.includes("--dry-run");

if (!["live", "replay"].includes(mode)) {
  throw new Error(`Unsupported mode: ${mode}. Use --mode live or --mode replay.`);
}

// ---------------------------------------------------------------------------
// Manifest and profile loading
// ---------------------------------------------------------------------------

const manifestPath = join(repoRoot, "scripts/live-evidence/request-manifest-v1.json");
if (!existsSync(manifestPath)) throw new Error(`Request manifest not found: ${manifestPath}`);
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

const allProfiles = manifest.profiles.filter((p) => p.requestsPerSource.gcd.maxRequestsThisProfile > 0);
const profiles = selectedProfile === "all"
  ? allProfiles
  : allProfiles.filter((p) => p.profileId === selectedProfile);
if (!profiles.length) throw new Error(`Unknown GCD probe profile: ${selectedProfile}`);

// ---------------------------------------------------------------------------
// Provenance block builder
// ---------------------------------------------------------------------------

function buildGcdProvenance(endpointUrl, captureDate) {
  return {
    source: "Grand Comics Database",
    sourceUrl: "https://www.comics.org",
    endpointUrl,
    captureDate,
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    modified: false,
    modificationNote: null,
    attribution: "Grand Comics Database (https://www.comics.org), CC BY-SA 4.0",
    shareAlikeAssessmentPending: true,
    coversExcluded: true,
  };
}

// ---------------------------------------------------------------------------
// Stop condition emitter
// ---------------------------------------------------------------------------

function emitStopCondition(profileId, code, detail) {
  const artifact = {
    source: "gcd",
    evidenceClass: EVIDENCE_CLASS_LIVE,
    profileId,
    captureTimestamp: new Date().toISOString(),
    stopConditionEmitted: code,
    stopConditionDetail: detail,
    recordCount: 0,
    fieldPresence: {},
    sourceNativeIds: [],
    capturePermitted: false,
    provenance: buildGcdProvenance("unknown", new Date().toISOString()),
  };
  artifact.captureHash = computeHash(artifact);
  return artifact;
}

function computeHash(artifact) {
  const { captureHash: _omit, ...rest } = artifact;
  return createHash("sha256").update(JSON.stringify(sortObject(rest), null, 2)).digest("hex");
}

function sortObject(value) {
  if (Array.isArray(value)) return value.map(sortObject);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((k) => [k, sortObject(value[k])]));
  }
  return value;
}

// ---------------------------------------------------------------------------
// Pre-run legal block check (mandatory before any live request)
// ---------------------------------------------------------------------------

function checkLegalGate() {
  // GC-4: GCD access arrangement must be confirmed before any live session.
  const confirmed = process.env.GCD_ACCESS_CONFIRMED === "true";
  if (!confirmed) {
    return {
      blocked: true,
      code: STOP_CONDITIONS.LEGAL_BLOCK_GCD_ACCESS,
      detail: "GC-4 unresolved: GCD access arrangement not confirmed. Set GCD_ACCESS_CONFIRMED=true after receiving written confirmation from GCD.",
    };
  }
  // GC-5: Access mode (anonymous vs. authenticated) must be determined before any request.
  // Anonymous access may be disabled at any time; choosing the wrong mode risks silent failures.
  const accessModeConfirmed = process.env.GCD_ACCESS_MODE_CONFIRMED === "true";
  if (!accessModeConfirmed) {
    return {
      blocked: true,
      code: STOP_CONDITIONS.GCD_ACCESS_MODE_UNCONFIRMED,
      detail: "GC-5 unresolved: GCD access mode (anonymous vs. authenticated) not confirmed. Set GCD_ACCESS_MODE_CONFIRMED=true after determining appropriate access mode per GC-5.",
    };
  }
  return { blocked: false };
}

// ---------------------------------------------------------------------------
// Field presence extraction (Tier 1 from Tier 2 — Tier 2 never persisted)
// ---------------------------------------------------------------------------

function extractFieldPresence(records) {
  const totals = Object.fromEntries(GCD_MEASURED_FIELDS.map((f) => [f, { presentCount: 0, totalCount: 0 }]));
  for (const record of records) {
    for (const field of GCD_MEASURED_FIELDS) {
      totals[field].totalCount++;
      const value = record[field];
      // Cover URL: note presence only, never store the value
      if (field === "coverImageUrl") {
        if (value != null && value !== "") totals[field].presentCount++;
        // value intentionally discarded here
        continue;
      }
      if (value != null && value !== "" && (!Array.isArray(value) || value.length > 0)) {
        totals[field].presentCount++;
      }
    }
    // Validate no cover URL leaks into Tier 1 output via sourceNativeIds or other paths
  }
  return Object.fromEntries(
    GCD_MEASURED_FIELDS.map((f) => [f, {
      fieldName: f,
      presentCount: totals[f].presentCount,
      totalCount: totals[f].totalCount,
      presenceRate: totals[f].totalCount > 0 ? totals[f].presentCount / totals[f].totalCount : 0,
      fixtureClassPresenceRate: null,
      driftDelta: null,
      driftStatus: "fixture_baseline_unavailable",
    }])
  );
}

// ---------------------------------------------------------------------------
// Schema drift check on critical fields
// ---------------------------------------------------------------------------

function checkCriticalFieldDrift(fieldPresence) {
  for (const field of CRITICAL_FIELDS) {
    const fp = fieldPresence[field];
    if (fp && fp.presenceRate <= 0.10) {
      return { drift: true, field, presenceRate: fp.presenceRate };
    }
  }
  return { drift: false };
}

// ---------------------------------------------------------------------------
// Replay mode: read frozen artifact from disk
// ---------------------------------------------------------------------------

function runReplay(profile) {
  const frozenPath = join(repoRoot, "scripts/live-evidence/frozen/gcd-live-observation-v1.json");
  if (!existsSync(frozenPath)) {
    // Frozen artifact does not yet exist — this is the expected state before
    // any live session has been authorized and run. Return the unavailable result.
    return emitStopCondition(
      profile.profileId,
      STOP_CONDITIONS.LEGAL_BLOCK_GCD_ACCESS,
      "Frozen Tier 1 artifact does not yet exist. No authorized live session has been completed.",
    );
  }
  const frozen = JSON.parse(readFileSync(frozenPath, "utf8"));
  // Placeholder artifact pending legal clearance — expected pre-capture state
  if (frozen.artifactStatus === "pending_legal_clearance") {
    return emitStopCondition(
      profile.profileId,
      STOP_CONDITIONS.LEGAL_BLOCK_GCD_ACCESS,
      `GCD live observation artifact is a placeholder pending legal clearance. Blocked by: ${(frozen.blockedByQuestions || []).join(", ")}`,
    );
  }
  // Find this profile in the frozen artifact
  const profileArtifact = Array.isArray(frozen.profiles)
    ? frozen.profiles.find((p) => p.profileId === profile.profileId)
    : frozen.profileId === profile.profileId ? frozen : null;
  if (!profileArtifact) {
    throw new Error(`Profile ${profile.profileId} not found in frozen GCD artifact`);
  }
  // Verify capture hash
  const { captureHash, ...rest } = profileArtifact;
  const recomputedHash = createHash("sha256").update(JSON.stringify(sortObject(rest), null, 2)).digest("hex");
  if (captureHash !== recomputedHash) {
    throw new Error(`GCD frozen artifact hash mismatch for ${profile.profileId}: expected ${captureHash}, got ${recomputedHash}`);
  }
  return profileArtifact;
}

// ---------------------------------------------------------------------------
// Live mode: perform bounded request (no network in replay mode)
// ---------------------------------------------------------------------------

async function runLive(profile, rateLimitState) {
  const gate = checkLegalGate();
  if (gate.blocked) {
    return emitStopCondition(profile.profileId, gate.code, gate.detail);
  }

  if (rateLimitState.cumulativeRequests >= MAX_REQUESTS_PER_SESSION) {
    return emitStopCondition(
      profile.profileId,
      STOP_CONDITIONS.BUDGET_EXHAUSTED,
      `Session request budget exhausted: ${rateLimitState.cumulativeRequests}/${MAX_REQUESTS_PER_SESSION}`,
    );
  }

  // Inter-request delay
  if (rateLimitState.cumulativeRequests > 0) {
    await new Promise((r) => setTimeout(r, MIN_INTER_REQUEST_DELAY_MS));
  }

  const captureTimestamp = new Date().toISOString();
  const endpoint = manifest.sources.gcd.endpointTemplate;

  // Build request parameters from profile (no API key in parameters)
  const requestParameters = {
    format: "json",
    query: profile.description,
    type: "series",
  };

  let httpStatus;
  let responseTimeMs;
  let rawRecords = [];
  let rateLimitHeaders = { requestsRemaining: null, resetAfterSeconds: null, velocityDetected: false };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), PER_REQUEST_TIMEOUT_MS);

  try {
    const startMs = Date.now();
    const params = new URLSearchParams({ ...requestParameters });
    const url = `${endpoint}?${params}`;
    const response = await fetch(url, { signal: controller.signal });
    responseTimeMs = Date.now() - startMs;
    httpStatus = response.status;
    rateLimitState.cumulativeRequests++;

    // Parse rate limit headers
    const remaining = response.headers.get("x-ratelimit-remaining");
    const reset = response.headers.get("x-ratelimit-reset");
    rateLimitHeaders = {
      requestsRemaining: remaining != null ? parseInt(remaining, 10) : null,
      resetAfterSeconds: reset != null ? parseInt(reset, 10) : null,
      velocityDetected: httpStatus === 429,
    };

    if (httpStatus === 401 || httpStatus === 403) {
      return emitStopCondition(
        profile.profileId,
        STOP_CONDITIONS.ACCESS_REFUSED,
        `GCD returned ${httpStatus}: access refused or anonymous access disabled`,
      );
    }

    if (httpStatus === 429) {
      const windowSeconds = rateLimitHeaders.resetAfterSeconds || 3600;
      if (windowSeconds > (MAX_REQUESTS_PER_SESSION * 10)) {
        return emitStopCondition(
          profile.profileId,
          STOP_CONDITIONS.RATE_LIMIT,
          `GCD rate limit hit; reset window ${windowSeconds}s exceeds session budget`,
        );
      }
    }

    if (httpStatus >= 200 && httpStatus < 300) {
      // Tier 2: parse response body into structured records — never persisted
      const body = await response.json();
      rawRecords = Array.isArray(body?.results) ? body.results : [];
    }
  } catch (err) {
    if (err.name === "AbortError") {
      return emitStopCondition(
        profile.profileId,
        STOP_CONDITIONS.TRANSPORT_TIMEOUT,
        `GCD request timed out after ${PER_REQUEST_TIMEOUT_MS}ms`,
      );
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
    // Tier 2 raw records go out of scope here; never written to disk
  }

  // Extract Tier 1 field presence from Tier 2 (raw records discarded after this)
  const fieldPresence = extractFieldPresence(rawRecords);
  rawRecords = null; // Explicitly discard Tier 2

  // Critical field drift check
  const driftCheck = checkCriticalFieldDrift(fieldPresence);
  if (driftCheck.drift) {
    return emitStopCondition(
      profile.profileId,
      STOP_CONDITIONS.SCHEMA_DRIFT,
      `Critical field '${driftCheck.field}' has presence rate ${driftCheck.presenceRate} (≤ 0.10) in live response`,
    );
  }

  // Extract source-native IDs only (no titles, descriptions, creators, or cover values)
  const sourceNativeIds = (rawRecords || []).map((r) => String(r?.id || r?.seriesId || r?.issueId || "unknown"));

  const artifact = {
    source: "gcd",
    evidenceClass: EVIDENCE_CLASS_FROZEN,
    captureTimestamp,
    endpoint,
    apiSchemaVersion: "undocumented",
    profileId: profile.profileId,
    requestParameters,
    httpStatus,
    responseTimeMs,
    recordCount: sourceNativeIds.length,
    rateLimitHeaders,
    sourceNativeIds,
    fieldPresence,
    stopConditionEmitted: null,
    capturePermitted: true,
    provenance: buildGcdProvenance(endpoint, captureTimestamp),
  };
  artifact.captureHash = computeHash(artifact);
  return artifact;
}

// ---------------------------------------------------------------------------
// Main execution
// ---------------------------------------------------------------------------

async function main() {
  if (verifyNoNetwork && mode === "live") {
    throw new Error("--verify-no-network is incompatible with --mode live");
  }

  // --dry-run is a GUARANTEED no-network path.
  // fetch is trapped here unconditionally — mode, credentials, and legal-gate
  // state cannot bypass this guard. Returns planned manifest, gate status,
  // rate bounds, and expected output paths only. No artifact writes.
  if (dryRun) {
    const originalFetch = globalThis.fetch;
    let fetchAttempted = false;
    globalThis.fetch = async (url) => {
      fetchAttempted = true;
      throw new Error(`DRY_RUN_NETWORK_BLOCKED:${url}`);
    };
    try {
      const gateStatus = checkLegalGate();
      const dryRunResult = {
        pass: true,
        dryRun: true,
        source: "gcd",
        mode,
        networkCallsMade: 0,
        artifactsWritten: 0,
        gateStatus: gateStatus.blocked
          ? { blocked: true, code: gateStatus.code, detail: gateStatus.detail }
          : { blocked: false },
        plannedProfiles: profiles.map((p) => ({
          profileId: p.profileId,
          maxRequestsThisProfile: p.requestsPerSource?.gcd?.maxRequestsThisProfile ?? 0,
        })),
        rateBounds: {
          maxRequestsPerSession: MAX_REQUESTS_PER_SESSION,
          minInterRequestDelayMs: MIN_INTER_REQUEST_DELAY_MS,
          perRequestTimeoutMs: PER_REQUEST_TIMEOUT_MS,
        },
        expectedOutputLocations: {
          draftArtifact: outputDir.replace(`${repoRoot}\\`, "").replace(`${repoRoot}/`, "") + "/gcd-live-observation-draft.json",
          frozenArtifact: "scripts/live-evidence/frozen/gcd-live-observation-v1.json",
        },
      };
      if (fetchAttempted) throw new Error("fetch was called during dry-run — this is a bug");
      console.log(JSON.stringify(dryRunResult, null, 2));
    } finally {
      globalThis.fetch = originalFetch;
    }
    return;
  }

  if (verifyNoNetwork) {
    const originalFetch = globalThis.fetch;
    let attempted = false;
    globalThis.fetch = async (url) => {
      attempted = true;
      throw new Error(`NETWORK_DISABLED_UNEXPECTED_REQUEST:${url}`);
    };
    try {
      for (const profile of profiles) {
        runReplay(profile);
      }
    } finally {
      globalThis.fetch = originalFetch;
    }
    if (attempted) throw new Error("GCD probe runner attempted network access in no-network mode");
    console.log(JSON.stringify({ pass: true, mode: "replay", noNetworkGuardVerified: true }, null, 2));
    return;
  }

  const rateLimitState = { cumulativeRequests: 0 };
  const results = [];

  for (const profile of profiles) {
    const artifact = mode === "live"
      ? await runLive(profile, rateLimitState)
      : runReplay(profile);
    results.push(artifact);

    if (artifact.stopConditionEmitted) {
      console.error(JSON.stringify({
        pass: false,
        profileId: profile.profileId,
        stopCondition: artifact.stopConditionEmitted,
        detail: artifact.stopConditionDetail,
      }, null, 2));
      // Continue to next profile; do not abort entire session on a single stop condition
    }
  }

  if (!dryRun && mode === "live") {
    mkdirSync(outputDir, { recursive: true });
    const outPath = join(outputDir, "gcd-live-observation-draft.json");
    writeFileSync(outPath, JSON.stringify({ schemaVersion: "1.0", source: "gcd", profiles: results }, null, 2), "utf8");
    console.error(`Tier 1 draft written to: ${outPath.replace(`${repoRoot}\\`, "")}`);
    console.error("NOTE: This is a draft. Review against capture-protocol.md before committing to scripts/live-evidence/frozen/.");
  }

  if (verifyFrozen) {
    if (mode !== "replay") throw new Error("--verify-frozen requires --mode replay");
    const frozenPath = join(repoRoot, "scripts/live-evidence/frozen/gcd-live-observation-v1.json");
    if (!existsSync(frozenPath)) {
      throw new Error(`Frozen GCD live observation artifact missing: ${frozenPath}`);
    }
    const frozen = JSON.parse(readFileSync(frozenPath, "utf8"));
    const frozenProfiles = Array.isArray(frozen.profiles) ? frozen.profiles : [frozen];
    for (const result of results) {
      const frozenMatch = frozenProfiles.find((p) => p.profileId === result.profileId);
      if (!frozenMatch) throw new Error(`Profile ${result.profileId} not found in frozen artifact`);
      if (frozenMatch.captureHash !== result.captureHash) {
        throw new Error(`Frozen GCD artifact hash mismatch for ${result.profileId}`);
      }
    }
  }

  console.log(JSON.stringify({
    pass: true,
    source: "gcd",
    mode,
    profileCount: results.length,
    stopConditionsEmitted: results.filter((r) => r.stopConditionEmitted).map((r) => ({
      profileId: r.profileId,
      code: r.stopConditionEmitted,
    })),
    totalLiveRequests: mode === "live" ? rateLimitState.cumulativeRequests : 0,
    liveCallsMade: mode === "live",
    noNetworkGuardVerified: verifyNoNetwork,
    frozenArtifactVerified: verifyFrozen,
    productionAdapterState: "adapter_not_implemented",
    comparativeConclusionMade: false,
    evidenceClass: mode === "live" ? EVIDENCE_CLASS_FROZEN : EVIDENCE_CLASS_LIVE,
  }, null, 2));
}

main().catch((err) => {
  console.error(JSON.stringify({ pass: false, error: err.message }, null, 2));
  process.exit(1);
});
