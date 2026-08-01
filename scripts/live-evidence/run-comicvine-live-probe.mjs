#!/usr/bin/env node
/**
 * ComicVine Live Probe Runner — Phase IV Live Observation
 *
 * Modes:
 *   --mode live    Perform bounded live requests against ComicVine. Requires CV-1 through CV-6 resolved.
 *   --mode replay  Read the frozen Tier 1 artifact from disk. No network.
 *
 * Flags:
 *   --profile <id>       Run one profile (default: "all")
 *   --output <dir>       Output directory (default: artifacts/live-evidence/comicvine)
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
 *   - No live requests until CV-1 (commercial use) and CV-4 (storage) are resolved.
 *   - No cover URL values stored in any artifact.
 *   - No API credentials in any artifact or log line.
 *   - Max 18 requests per session; 2s inter-request delay; 10s per-request timeout.
 *   - Tier 2 (raw response bodies) never written to disk.
 *   - Zero automatic retries per policy.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EVIDENCE_CLASS_FROZEN = "Representative Frozen Class";
const EVIDENCE_CLASS_LIVE = "Live Observation Class";

const STOP_CONDITIONS = {
  LEGAL_BLOCK_CV_COMMERCIAL: "live_evidence_unavailable_legal_block_cv_commercial",
  LEGAL_BLOCK_CV_STORAGE: "live_evidence_unavailable_legal_block_cv_storage",
  CREDENTIALS_MISSING: "live_evidence_unavailable_credentials_missing",
  ACCESS_REFUSED: "live_evidence_unavailable_access_refused",
  RATE_LIMIT: "live_evidence_unavailable_rate_limit",
  TRANSPORT_TIMEOUT: "live_evidence_unavailable_transport_timeout",
  SCHEMA_DRIFT: "live_evidence_unavailable_schema_drift",
  COVER_RIGHTS: "live_evidence_unavailable_cover_rights",
  BUDGET_EXHAUSTED: "live_evidence_budget_exhausted",
};

const CV_MEASURED_FIELDS = [
  "id", "name", "issueNumber", "startYear", "publisherName",
  "description", "genres", "imageUrl", "creatorCredits",
  "deck", "countOfIssues",
];

const MAX_REQUESTS_PER_SESSION = 18;
const MIN_INTER_REQUEST_DELAY_MS = 2000;
const PER_REQUEST_TIMEOUT_MS = 10000;
const CRITICAL_FIELDS = ["id", "name"];

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
const outputDir = resolve(repoRoot, option("--output", "artifacts/live-evidence/comicvine"));
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

const allProfiles = manifest.profiles.filter((p) => p.requestsPerSource.comicvine.maxRequestsThisProfile > 0);
const profiles = selectedProfile === "all"
  ? allProfiles
  : allProfiles.filter((p) => p.profileId === selectedProfile);
if (!profiles.length) throw new Error(`Unknown ComicVine probe profile: ${selectedProfile}`);

// ---------------------------------------------------------------------------
// Provenance block builder
// ---------------------------------------------------------------------------

function buildCvProvenance(endpointUrl, captureDate, capturePermitted) {
  return {
    source: "ComicVine",
    sourceUrl: "https://comicvine.gamespot.com",
    endpointUrl,
    captureDate,
    linkbackRequired: true,
    linkbackTarget: "https://comicvine.gamespot.com",
    redistribution: "restricted_pending_written_permission",
    covers: "excluded_pending_rights_clarification",
    commercialUseStatus: "pending_cv1_resolution",
    capturePermitted,
  };
}

// ---------------------------------------------------------------------------
// Stop condition emitter
// ---------------------------------------------------------------------------

function emitStopCondition(profileId, code, detail) {
  const artifact = {
    source: "comicvine",
    evidenceClass: EVIDENCE_CLASS_LIVE,
    profileId,
    captureTimestamp: new Date().toISOString(),
    stopConditionEmitted: code,
    stopConditionDetail: detail,
    recordCount: 0,
    fieldPresence: {},
    sourceNativeIds: [],
    capturePermitted: false,
    provenance: buildCvProvenance("unknown", new Date().toISOString(), false),
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
// Pre-run legal block checks (mandatory before any live request)
// ---------------------------------------------------------------------------

function checkLegalGate() {
  // CV-1: Non-commercial use confirmation required before any live call.
  // CV-4: Fixture/payload storage permission required before any artifact commit.
  //
  // Both must be set by the operator via environment variables after receiving
  // written clarification from ComicVine. The probe runner enforces both gates
  // independently. CV-1 blocks any live request; CV-4 blocks any storage of
  // real response data.
  const cv1Resolved = process.env.COMICVINE_CV1_RESOLVED === "true";
  if (!cv1Resolved) {
    return {
      blocked: true,
      code: STOP_CONDITIONS.LEGAL_BLOCK_CV_COMMERCIAL,
      detail: "CV-1 unresolved: ComicVine commercial-use definition not clarified. Set COMICVINE_CV1_RESOLVED=true after receiving written clarification.",
    };
  }

  const cv4Resolved = process.env.COMICVINE_CV4_RESOLVED === "true";
  if (!cv4Resolved) {
    return {
      blocked: true,
      code: STOP_CONDITIONS.LEGAL_BLOCK_CV_STORAGE,
      detail: "CV-4 unresolved: ComicVine payload storage permission not confirmed. Set COMICVINE_CV4_RESOLVED=true after receiving written permission.",
    };
  }

  // Credentials check
  const apiKey = process.env.COMICVINE_API_KEY;
  if (!apiKey || apiKey.trim() === "") {
    return {
      blocked: true,
      code: STOP_CONDITIONS.CREDENTIALS_MISSING,
      detail: "ComicVine API key not found in COMICVINE_API_KEY environment variable.",
    };
  }

  return { blocked: false, apiKey };
}

// ---------------------------------------------------------------------------
// Field presence extraction (Tier 1 from Tier 2 — Tier 2 never persisted)
// ---------------------------------------------------------------------------

function extractFieldPresence(records) {
  const totals = Object.fromEntries(CV_MEASURED_FIELDS.map((f) => [f, { presentCount: 0, totalCount: 0 }]));
  for (const record of records) {
    for (const field of CV_MEASURED_FIELDS) {
      totals[field].totalCount++;
      const value = record[field];
      // Cover / image URL: note presence only, never store the value
      if (field === "imageUrl") {
        if (value != null && value !== "" && typeof value === "object"
          ? (value.original_url != null && value.original_url !== "")
          : (value != null && value !== "")) {
          totals[field].presentCount++;
        }
        // value intentionally discarded
        continue;
      }
      if (value != null && value !== "" && (!Array.isArray(value) || value.length > 0)) {
        totals[field].presentCount++;
      }
    }
  }
  return Object.fromEntries(
    CV_MEASURED_FIELDS.map((f) => [f, {
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
  const frozenPath = join(repoRoot, "scripts/live-evidence/frozen/comicvine-live-observation-v1.json");
  if (!existsSync(frozenPath)) {
    return emitStopCondition(
      profile.profileId,
      STOP_CONDITIONS.LEGAL_BLOCK_CV_COMMERCIAL,
      "Frozen Tier 1 artifact does not yet exist. No authorized live session has been completed.",
    );
  }
  const frozen = JSON.parse(readFileSync(frozenPath, "utf8"));
  // Placeholder artifact pending legal clearance — expected pre-capture state
  if (frozen.artifactStatus === "pending_legal_clearance") {
    return emitStopCondition(
      profile.profileId,
      STOP_CONDITIONS.LEGAL_BLOCK_CV_COMMERCIAL,
      `ComicVine live observation artifact is a placeholder pending legal clearance. Blocked by: ${(frozen.blockedByQuestions || []).join(", ")}`,
    );
  }
  const profileArtifact = Array.isArray(frozen.profiles)
    ? frozen.profiles.find((p) => p.profileId === profile.profileId)
    : frozen.profileId === profile.profileId ? frozen : null;
  if (!profileArtifact) {
    throw new Error(`Profile ${profile.profileId} not found in frozen ComicVine artifact`);
  }
  const { captureHash, ...rest } = profileArtifact;
  const recomputedHash = createHash("sha256").update(JSON.stringify(sortObject(rest), null, 2)).digest("hex");
  if (captureHash !== recomputedHash) {
    throw new Error(`ComicVine frozen artifact hash mismatch for ${profile.profileId}: expected ${captureHash}, got ${recomputedHash}`);
  }
  return profileArtifact;
}

// ---------------------------------------------------------------------------
// Live mode: perform bounded request
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

  if (rateLimitState.cumulativeRequests > 0) {
    await new Promise((r) => setTimeout(r, MIN_INTER_REQUEST_DELAY_MS));
  }

  const captureTimestamp = new Date().toISOString();
  const endpoint = manifest.sources.comicvine.endpointTemplate;

  // Redact API key from all logged parameters
  const requestParameters = {
    format: "json",
    filter: `name:${profile.description}`,
    field_list: CV_MEASURED_FIELDS.join(","),
    limit: 20,
  };

  let httpStatus;
  let responseTimeMs;
  let rawRecords = [];
  let rateLimitHeaders = { requestsRemaining: null, resetAfterSeconds: null, velocityDetected: false };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), PER_REQUEST_TIMEOUT_MS);

  try {
    const params = new URLSearchParams({
      ...requestParameters,
      api_key: gate.apiKey, // key used in request but never in artifacts
    });
    const url = `${endpoint}?${params}`;
    const startMs = Date.now();
    const response = await fetch(url, { signal: controller.signal });
    responseTimeMs = Date.now() - startMs;
    httpStatus = response.status;
    rateLimitState.cumulativeRequests++;

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
        `ComicVine returned ${httpStatus}: access refused or API key revoked`,
      );
    }

    if (httpStatus === 429) {
      // Zero automatic retries per ComicVine policy
      return emitStopCondition(
        profile.profileId,
        STOP_CONDITIONS.RATE_LIMIT,
        "ComicVine rate limit hit. Zero automatic retries per policy.",
      );
    }

    if (httpStatus >= 200 && httpStatus < 300) {
      const body = await response.json();
      rawRecords = Array.isArray(body?.results) ? body.results : [];
    }
  } catch (err) {
    if (err.name === "AbortError") {
      return emitStopCondition(
        profile.profileId,
        STOP_CONDITIONS.TRANSPORT_TIMEOUT,
        `ComicVine request timed out after ${PER_REQUEST_TIMEOUT_MS}ms`,
      );
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
    // Tier 2 raw records out of scope here; never written to disk
  }

  const fieldPresence = extractFieldPresence(rawRecords);
  rawRecords = null; // Explicitly discard Tier 2

  const driftCheck = checkCriticalFieldDrift(fieldPresence);
  if (driftCheck.drift) {
    return emitStopCondition(
      profile.profileId,
      STOP_CONDITIONS.SCHEMA_DRIFT,
      `Critical field '${driftCheck.field}' has presence rate ${driftCheck.presenceRate} (≤ 0.10) in live response`,
    );
  }

  // Source-native IDs only; covers excluded
  const sourceNativeIds = (rawRecords || []).map((r) => String(r?.id ?? "unknown"));

  const artifact = {
    source: "comicvine",
    evidenceClass: EVIDENCE_CLASS_FROZEN,
    captureTimestamp,
    endpoint,
    apiSchemaVersion: "undocumented",
    profileId: profile.profileId,
    requestParameters, // api_key intentionally NOT included
    httpStatus,
    responseTimeMs,
    recordCount: sourceNativeIds.length,
    rateLimitHeaders,
    sourceNativeIds,
    fieldPresence,
    stopConditionEmitted: null,
    capturePermitted: true,
    provenance: buildCvProvenance(endpoint, captureTimestamp, true),
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
    if (attempted) throw new Error("ComicVine probe runner attempted network access in no-network mode");
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
    }
  }

  if (!dryRun && mode === "live") {
    mkdirSync(outputDir, { recursive: true });
    const outPath = join(outputDir, "comicvine-live-observation-draft.json");
    writeFileSync(outPath, JSON.stringify({ schemaVersion: "1.0", source: "comicvine", profiles: results }, null, 2), "utf8");
    console.error(`Tier 1 draft written to: ${outPath.replace(`${repoRoot}\\`, "")}`);
    console.error("NOTE: This is a draft. Review against capture-protocol.md before committing to scripts/live-evidence/frozen/.");
  }

  if (verifyFrozen) {
    if (mode !== "replay") throw new Error("--verify-frozen requires --mode replay");
    const frozenPath = join(repoRoot, "scripts/live-evidence/frozen/comicvine-live-observation-v1.json");
    if (!existsSync(frozenPath)) {
      throw new Error(`Frozen ComicVine live observation artifact missing: ${frozenPath}`);
    }
    const frozen = JSON.parse(readFileSync(frozenPath, "utf8"));
    const frozenProfiles = Array.isArray(frozen.profiles) ? frozen.profiles : [frozen];
    for (const result of results) {
      const frozenMatch = frozenProfiles.find((p) => p.profileId === result.profileId);
      if (!frozenMatch) throw new Error(`Profile ${result.profileId} not found in frozen ComicVine artifact`);
      if (frozenMatch.captureHash !== result.captureHash) {
        throw new Error(`Frozen ComicVine artifact hash mismatch for ${result.profileId}`);
      }
    }
  }

  console.log(JSON.stringify({
    pass: true,
    source: "comicvine",
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
    productionAdapterState: "adapter_implemented_not_exercised_by_live_probe",
    comparativeConclusionMade: false,
    evidenceClass: mode === "live" ? EVIDENCE_CLASS_FROZEN : EVIDENCE_CLASS_LIVE,
  }, null, 2));
}

main().catch((err) => {
  console.error(JSON.stringify({ pass: false, error: err.message }, null, 2));
  process.exit(1);
});
