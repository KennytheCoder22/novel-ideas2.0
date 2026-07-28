import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const HARNESS_VERSION = "1.0.0";
export const TERMINAL_STATES = [
  "intentional_skip_disabled", "intentional_skip_ineligible_profile", "unsupported_age_or_configuration",
  "adapter_not_implemented", "dispatch_not_attempted_bug", "response_invalid", "valid_empty_response",
  "raw_results_all_structurally_rejected", "source_policy_rejected_all", "normalized_but_final_ineligible",
  "eligible_underfilled", "eligible_useful", "fallback_only",
];
const PRODUCTION_FILES = [
  "app/recommender-v2/tasteProfile.ts", "app/recommender-v2/searchPlan.ts",
  "app/recommender-v2/sources/openLibrarySource.ts", "app/recommender-v2/normalize.ts",
  "app/recommender-v2/score.ts", "app/recommender-v2/select.ts",
];
const COMPILE_FILES = [
  "app/recommender-v2/tasteProfile.ts", "app/recommender-v2/searchPlan.ts",
  "app/recommender-v2/diagnostics.ts", "app/recommender-v2/types.ts",
  "app/recommender-v2/normalize.ts", "app/recommender-v2/score.ts", "app/recommender-v2/select.ts",
  "app/recommender-v2/sources/openLibraryProfiles.ts", "app/recommender-v2/sources/openLibrarySource.ts",
];

function json(path) { return JSON.parse(readFileSync(path, "utf8")); }
function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  return value;
}
export function stableJson(value) { return `${JSON.stringify(stable(value), null, 2)}\n`; }

export function loadDefinitions(repoRoot) {
  const profilePath = join(repoRoot, "scripts/source-competence/profiles/open-library-phase1.json");
  const fixturePath = join(repoRoot, "scripts/source-competence/fixtures/openLibrary/cases.json");
  const profileSet = json(profilePath);
  const fixtureSet = json(fixturePath);
  if (profileSet.schemaVersion !== "1.0.0" || fixtureSet.schemaVersion !== "1.0.0") throw new Error("Unsupported source-competence schema version");
  if (!Array.isArray(profileSet.profiles) || profileSet.profiles.length !== 6) throw new Error("Phase 1 requires exactly six profiles");
  for (const profile of profileSet.profiles) {
    for (const key of ["profileId", "ageBand", "positiveSignals", "negativeSignals", "skipSignals", "formatIntent", "expectedActivation", "expectedTerminalStateFamily", "humanReview", "notes"]) {
      if (!(key in profile)) throw new Error(`${profile.profileId || "unknown"}: missing profile field ${key}`);
    }
    if (!TERMINAL_STATES.includes(profile.expectedTerminalStateFamily)) throw new Error(`${profile.profileId}: unsupported expected terminal state`);
    if (!fixtureSet.cases[profile.profileId]) throw new Error(`${profile.profileId}: fixture missing`);
  }
  return { profiles: profileSet.profiles, fixtures: fixtureSet.cases, profileSchemaVersion: profileSet.schemaVersion, fixtureSchemaVersion: fixtureSet.schemaVersion };
}

export function productionHashes(repoRoot) {
  return Object.fromEntries(PRODUCTION_FILES.map((file) => [file, sha256(readFileSync(join(repoRoot, file)))]));
}

export async function loadPipeline(repoRoot) {
  const outDir = join(repoRoot, "artifacts/source-competence/.compiled");
  mkdirSync(outDir, { recursive: true });
  execFileSync(process.execPath, [
    "node_modules/typescript/bin/tsc", "--target", "es2020", "--module", "commonjs", "--moduleResolution", "node",
    "--skipLibCheck", "--esModuleInterop", "--outDir", outDir, ...COMPILE_FILES,
  ], { cwd: repoRoot, stdio: "pipe" });
  const load = (file) => import(pathToFileURL(join(outDir, file)).href);
  const [{ buildTasteProfile }, { buildSearchPlan }, { openLibrarySourceAdapter }, { normalizeSourceResults }, { scoreCandidates }, { selectRecommendations }] = await Promise.all([
    load("tasteProfile.js"), load("searchPlan.js"), load("sources/openLibrarySource.js"), load("normalize.js"), load("score.js"), load("select.js"),
  ]);
  return { buildTasteProfile, buildSearchPlan, openLibrarySourceAdapter, normalizeSourceResults, scoreCandidates, selectRecommendations };
}

function sessionFor(profile) {
  const signals = [];
  for (const [field, action] of [["positiveSignals", "like"], ["negativeSignals", "dislike"], ["skipSignals", "skip"]]) {
    for (const signal of profile[field]) signals.push({ ...signal, action, tags: [...(signal.tags || []), ...(signal.format ? [signal.format] : [])] });
  }
  return {
    requestId: `source-competence-${profile.profileId}`, ageBand: profile.ageBand, signals, limit: 10,
    enabledSources: { mock: false, googleBooks: false, openLibrary: true, kitsu: false, comicVine: false, localLibrary: false, nyt: false },
  };
}

function fixtureFetch(fixture, requests) {
  return async (input) => {
    const url = String(input || "");
    if (!url.includes("openlibrary") && !url.includes("/api/openlibrary")) throw new Error(`NETWORK_DISABLED_UNEXPECTED_REQUEST:${url}`);
    const parsed = new URL(url, "https://fixture.invalid");
    const nested = parsed.searchParams.get("url");
    const sourceUrl = nested ? new URL(nested) : parsed;
    requests.push({ request: url, query: sourceUrl.searchParams.get("q") || "", limit: Number(sourceUrl.searchParams.get("limit") || 0) });
    return { ok: true, status: 200, text: async () => JSON.stringify(fixture.payload) };
  };
}

function candidateView(candidate, selectedIds, eligibleTitles) {
  return {
    id: candidate.id, sourceId: candidate.sourceId || null, title: candidate.title, score: Number(candidate.score ?? 0),
    genres: candidate.genres || [], themes: candidate.themes || [], tones: candidate.tones || [], maturityBand: candidate.maturityBand || null,
    matchedSignals: candidate.matchedSignals || [], scoreBreakdown: candidate.scoreBreakdown || {},
    finalEligibility: selectedIds ? { eligible: eligibleTitles?.has(candidate.title) || false, selected: selectedIds.has(candidate.id), rejectionReasons: candidate.rejectedReasons || [] } : null,
    queryProvenance: {
      queryText: candidate.diagnostics?.queryText || null, originalPlannedQuery: candidate.diagnostics?.originalPlannedQuery || null,
      queryFamily: candidate.diagnostics?.queryFamily || null, routingReason: candidate.diagnostics?.routingReason || null,
      fallback: Boolean(candidate.raw?.emergencyFallback || candidate.diagnostics?.emergencyFallback),
    },
  };
}

function classify({ plan, sourceResult, fixture, requests, normalized, scored, selected }) {
  if (!plan.enabled) return plan.skippedReason === "source_disabled" ? "intentional_skip_disabled" : "intentional_skip_ineligible_profile";
  if (!requests.length) return "dispatch_not_attempted_bug";
  if (["failed", "timed_out"].includes(sourceResult.status)) return "response_invalid";
  if (fixture.payload.docs.length === 0 && Number(sourceResult.diagnostics.rawApiResultCount || 0) === 0) return "valid_empty_response";
  if (!sourceResult.rawItems.length) {
    const reasons = Object.keys(sourceResult.diagnostics.dropReasons || {});
    const structural = reasons.length > 0 && reasons.every((reason) => /missing_|invalid_|language|relevance_drift/.test(reason));
    return structural ? "raw_results_all_structurally_rejected" : "source_policy_rejected_all";
  }
  if (!normalized.length) return "raw_results_all_structurally_rejected";
  if (!selected.length) return "normalized_but_final_ineligible";
  if (sourceResult.diagnostics.middleGradesFallbackOnlySlate || selected.every((row) => row.raw?.emergencyFallback)) return "fallback_only";
  return selected.length < 5 ? "eligible_underfilled" : "eligible_useful";
}

export function fixtureInventory(profile, fixture, hashes) {
  return {
    harness: { name: "NovelIdeas Source Competence Harness", version: HARNESS_VERSION, mode: "fixture", schemaVersion: "1.0.0" },
    profile, source: "openLibrary", engine: { replayed: false, productionHashes: hashes },
    expectedActivation: profile.expectedActivation, actualActivation: "not_executed_fixture_inventory",
    expectedTerminalStateFamily: profile.expectedTerminalStateFamily, actualTerminalState: null,
    fixture: { fixtureId: fixture.fixtureId, captureKind: "deterministic_offline_fixture", responseShape: "docs_array" },
    raw: { identifiersInReturnedOrder: fixture.payload.docs.map((doc) => doc.key || null), titlesInReturnedOrder: fixture.payload.docs.map((doc) => doc.title || null), documentCount: fixture.payload.docs.length },
    humanReview: { ...profile.humanReview, scoringPerformedByHarness: false },
  };
}

export async function replay(profile, fixture, pipeline, hashes) {
  const requests = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = fixtureFetch(fixture, requests);
  try {
    const tasteProfile = pipeline.buildTasteProfile(sessionFor(profile));
    const searchPlan = pipeline.buildSearchPlan(tasteProfile, { openLibrary: true });
    const plan = searchPlan.sourcePlans.find((row) => row.source === "openLibrary");
    if (!plan) throw new Error("Open Library plan missing");
    const sourceResult = await pipeline.openLibrarySourceAdapter.search(plan, { profile: tasteProfile });
    const normalized = pipeline.normalizeSourceResults([sourceResult]);
    const scored = pipeline.scoreCandidates(normalized, tasteProfile);
    const selection = pipeline.selectRecommendations(scored, tasteProfile, 10);
    const selectedIds = new Set(selection.selected.map((row) => row.id));
    const eligibleTitles = new Set(Array.isArray(selection.rejectedReasons.finalEligibilityAcceptedTitles) ? selection.rejectedReasons.finalEligibilityAcceptedTitles.map(String) : []);
    const terminal = classify({ plan, sourceResult, fixture, requests, normalized, scored, selected: selection.selected });
    const artifact = {
      harness: { name: "NovelIdeas Source Competence Harness", version: HARNESS_VERSION, mode: "replay", schemaVersion: "1.0.0", networkPolicy: "fixture_only_hard_block" },
      profile, source: "openLibrary",
      engine: { version: "recommender-v2-openlibrary-baseline", stages: ["taste_profile", "routing", "source_adapter", "normalization", "scoring", "final_eligibility", "selection"], productionHashes: hashes },
      expectedActivation: profile.expectedActivation,
      actualActivation: sourceResult.diagnostics.attempted ? "attempted" : sourceResult.status === "skipped" ? "skipped" : "not_attempted",
      expectedTerminalStateFamily: profile.expectedTerminalStateFamily, actualTerminalState: terminal,
      fixture: { fixtureId: fixture.fixtureId, captureKind: "deterministic_offline_fixture", responseShape: "docs_array" },
      requests,
      raw: {
        fixtureDocumentCount: fixture.payload.docs.length,
        identifiersInReturnedOrder: fixture.payload.docs.map((doc) => doc.key || null),
        titlesInReturnedOrder: fixture.payload.docs.map((doc) => doc.title || null),
        adapterRawApiResultCount: Number(sourceResult.diagnostics.rawApiResultCount || 0),
        acceptedAfterSourcePolicy: sourceResult.rawItems.length,
        dropCounts: sourceResult.diagnostics.dropReasons || {},
      },
      normalized: normalized.map((row) => candidateView(row)),
      scored: scored.map((row) => candidateView(row, selectedIds)),
      rejectedReasonHistogram: selection.rejectedReasons,
      selected: selection.selected.map((row) => candidateView(row, selectedIds, eligibleTitles)),
      recovery: {
        fallbackOnly: Boolean(sourceResult.diagnostics.middleGradesFallbackOnlySlate),
        fallbackQueries: sourceResult.diagnostics.fallbackCandidateQueries || [],
        retryAttempted: Boolean(sourceResult.diagnostics.retryAttempted), retrySucceeded: Boolean(sourceResult.diagnostics.retrySucceeded),
        emergencyFallbackSelected: selection.selected.filter((row) => row.raw?.emergencyFallback).map((row) => row.title),
      },
      underfill: { target: 5, selectedCount: selection.selected.length, underfilled: selection.selected.length < 5 },
      humanReview: { ...profile.humanReview, scoringPerformedByHarness: false, machineTerminalStateIsNotHumanUsefulnessJudgment: true },
    };
    return artifact;
  } finally {
    globalThis.fetch = originalFetch;
  }
}

export function markdownFor(artifacts) {
  const lines = ["# Source Competence Harness - Open Library Phase 1", "", "Generated from the same structured replay artifacts. Human usefulness remains explicitly unscored.", "", "| Profile | Age | Activation | Expected | Actual | Raw fixture | Accepted | Scored | Selected | Human review |", "| --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | --- |"];
  for (const artifact of artifacts) lines.push(`| ${artifact.profile.profileId} | ${artifact.profile.ageBand} | ${artifact.actualActivation} | ${artifact.expectedTerminalStateFamily} | ${artifact.actualTerminalState ?? "not run"} | ${artifact.raw.fixtureDocumentCount ?? artifact.raw.documentCount} | ${artifact.raw.acceptedAfterSourcePolicy ?? "not run"} | ${artifact.scored?.length ?? "not run"} | ${artifact.selected?.length ?? "not run"} | ${artifact.humanReview.status} |`);
  lines.push("", "## Interpretation boundary", "", "`eligible_useful` is a machine terminal-state family indicating a sufficiently populated eligible slate. It is not a human precision judgment. Fixture and replay modes make no live requests.", "");
  return lines.join("\n");
}

export function writeArtifacts(outputDir, artifacts) {
  mkdirSync(outputDir, { recursive: true });
  for (const artifact of artifacts) writeFileSync(join(outputDir, `${artifact.profile.profileId}.json`), stableJson(artifact));
  writeFileSync(join(outputDir, "summary.json"), stableJson({ harnessVersion: HARNESS_VERSION, cases: artifacts }));
  writeFileSync(join(outputDir, "summary.md"), markdownFor(artifacts));
}
