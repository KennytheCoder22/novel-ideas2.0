import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { stableJson, TERMINAL_STATES } from "./harness.mjs";

export const GOOGLE_BOOKS_CERTIFICATION_VERSION = "1.0.0";

const PRODUCTION_FILES = [
  "app/recommender-v2/tasteProfile.ts",
  "app/recommender-v2/searchPlan.ts",
  "app/recommender-v2/sources/googleBooksSource.ts",
  "app/recommender-v2/preteenGoogleBooksPublicationIdentity.ts",
  "app/recommender-v2/googleBooksLineageDiagnostics.ts",
  "app/recommender-v2/normalize.ts",
  "app/recommender-v2/score.ts",
  "app/recommender-v2/select.ts",
];

const COMPILE_FILES = [
  "app/recommender-v2/tasteProfile.ts",
  "app/recommender-v2/searchPlan.ts",
  "app/recommender-v2/diagnostics.ts",
  "app/recommender-v2/types.ts",
  "app/recommender-v2/preteenGoogleBooksPublicationIdentity.ts",
  "app/recommender-v2/googleBooksLineageDiagnostics.ts",
  "app/recommender-v2/normalize.ts",
  "app/recommender-v2/score.ts",
  "app/recommender-v2/select.ts",
  "app/recommender-v2/sources/googleBooksSource.ts",
];

function json(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function values(value) {
  return Array.isArray(value) ? value.map((entry) => String(entry || "")).filter(Boolean) : [];
}

export function loadGoogleBooksDefinitions(repoRoot) {
  const profileSet = json(join(repoRoot, "scripts/source-competence/profiles/google-books-phase1.json"));
  const fixtureSet = json(join(repoRoot, "scripts/source-competence/fixtures/googleBooks/cases.json"));
  if (profileSet.schemaVersion !== "1.0.0" || fixtureSet.schemaVersion !== "1.0.0") {
    throw new Error("Unsupported Google Books certification schema version");
  }
  if (profileSet.source !== "googleBooks" || fixtureSet.source !== "googleBooks") {
    throw new Error("Google Books certification definitions must identify googleBooks");
  }
  if (!Array.isArray(profileSet.profiles) || profileSet.profiles.length !== 9) {
    throw new Error("Google Books Phase 1 requires exactly nine certification profiles");
  }
  const required = [
    "profileId", "comparisonProfileId", "ageBand", "positiveSignals", "negativeSignals",
    "skipSignals", "formatIntent", "sourceEnabled", "expectedActivation",
    "expectedTerminalStateFamily", "humanReview", "notes",
  ];
  for (const profile of profileSet.profiles) {
    for (const key of required) {
      if (!(key in profile)) throw new Error(`${profile.profileId || "unknown"}: missing profile field ${key}`);
    }
    if (!TERMINAL_STATES.includes(profile.expectedTerminalStateFamily)) {
      throw new Error(`${profile.profileId}: unsupported expected terminal state`);
    }
    if (!fixtureSet.cases[profile.profileId]) throw new Error(`${profile.profileId}: fixture missing`);
  }
  return {
    profiles: profileSet.profiles,
    fixtures: fixtureSet.cases,
    profileSchemaVersion: profileSet.schemaVersion,
    fixtureSchemaVersion: fixtureSet.schemaVersion,
  };
}

export function googleBooksProductionHashes(repoRoot) {
  return Object.fromEntries(PRODUCTION_FILES.map((file) => [file, sha256(readFileSync(join(repoRoot, file)))]));
}

export async function loadGoogleBooksPipeline(repoRoot) {
  const outDir = join(repoRoot, "artifacts/source-competence/.compiled-google-books");
  mkdirSync(outDir, { recursive: true });
  execFileSync(process.execPath, [
    "node_modules/typescript/bin/tsc",
    "--target", "es2020",
    "--module", "commonjs",
    "--moduleResolution", "node",
    "--skipLibCheck",
    "--esModuleInterop",
    "--outDir", outDir,
    ...COMPILE_FILES,
  ], { cwd: repoRoot, stdio: "pipe" });
  const load = (file) => import(pathToFileURL(join(outDir, file)).href);
  const [
    { buildTasteProfile },
    { buildSearchPlan },
    { googleBooksSourceAdapter },
    { normalizeSourceResults },
    { scoreCandidates },
    { selectRecommendations },
  ] = await Promise.all([
    load("tasteProfile.js"),
    load("searchPlan.js"),
    load("sources/googleBooksSource.js"),
    load("normalize.js"),
    load("score.js"),
    load("select.js"),
  ]);
  return {
    buildTasteProfile,
    buildSearchPlan,
    googleBooksSourceAdapter,
    normalizeSourceResults,
    scoreCandidates,
    selectRecommendations,
  };
}

function sessionFor(profile) {
  const signals = [];
  for (const [field, action] of [["positiveSignals", "like"], ["negativeSignals", "dislike"], ["skipSignals", "skip"]]) {
    for (const signal of profile[field]) {
      signals.push({ ...signal, action, tags: [...(signal.tags || []), ...(signal.format ? [signal.format] : [])] });
    }
  }
  return {
    requestId: `google-books-certification-${profile.profileId}`,
    ageBand: profile.ageBand,
    signals,
    limit: 10,
    enabledSources: {
      mock: false,
      googleBooks: Boolean(profile.sourceEnabled),
      openLibrary: false,
      kitsu: false,
      comicVine: false,
      localLibrary: false,
      nyt: false,
    },
  };
}

function fixtureFetch(fixture, requests) {
  return async (input) => {
    const request = String(input || "");
    if (!request.includes("googleapis.com/books/v1/volumes")) {
      throw new Error(`NETWORK_DISABLED_UNEXPECTED_REQUEST:${request}`);
    }
    const url = new URL(request);
    const sanitizedUrl = new URL(request);
    sanitizedUrl.searchParams.delete("key");
    requests.push({
      request: sanitizedUrl.toString(),
      query: url.searchParams.get("q") || "",
      maxResults: Number(url.searchParams.get("maxResults") || 0),
      orderBy: url.searchParams.get("orderBy") || null,
      printType: url.searchParams.get("printType") || null,
      filter: url.searchParams.get("filter") || null,
      projection: url.searchParams.get("projection") || null,
      language: url.searchParams.get("langRestrict") || null,
      credentialMaterial: "excluded_from_artifact",
    });
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify(fixture.payload),
    };
  };
}

function metadataCoverage(candidates) {
  const checks = {
    stableIdentifier: (row) => Boolean(row.sourceId || row.id),
    title: (row) => Boolean(String(row.title || "").trim()),
    creators: (row) => values(row.creators).length > 0,
    description: (row) => Boolean(String(row.description || "").trim()),
    genres: (row) => values(row.genres).length > 0,
    publicationYear: (row) => row.publicationYear !== null && row.publicationYear !== undefined && Number.isFinite(Number(row.publicationYear)),
    isbn: (row) => Boolean(row.raw?.isbn13 || row.raw?.isbn10),
    audience: (row) => Boolean(row.diagnostics?.googleBooksAudienceBand || row.raw?.audienceBand),
    publicationShape: (row) => Boolean(row.diagnostics?.googleBooksPublicationShape || row.raw?.googleBooksPublicationShape),
    queryProvenance: (row) => Boolean(row.diagnostics?.queryText || row.raw?.queryText),
  };
  const fields = {};
  let present = 0;
  for (const [field, check] of Object.entries(checks)) {
    const count = candidates.filter(check).length;
    fields[field] = {
      present: count,
      total: candidates.length,
      rate: candidates.length ? Number((count / candidates.length).toFixed(4)) : 0,
    };
    present += count;
  }
  const denominator = candidates.length * Object.keys(checks).length;
  return {
    fieldCoverage: fields,
    overallRate: denominator ? Number((present / denominator).toFixed(4)) : 0,
  };
}

function candidateView(candidate, selectedIds, acceptedTitles) {
  const raw = candidate.raw || {};
  return {
    id: candidate.id,
    sourceId: candidate.sourceId || null,
    isbn13: raw.isbn13 || null,
    title: candidate.title,
    creators: candidate.creators || [],
    description: candidate.description || null,
    score: Number(candidate.score ?? 0),
    genres: candidate.genres || [],
    themes: candidate.themes || [],
    tones: candidate.tones || [],
    formats: candidate.formats || [],
    publicationYear: raw.publicationYear ?? null,
    maturityBand: candidate.maturityBand || null,
    audienceBand: candidate.diagnostics?.googleBooksAudienceBand || raw.audienceBand || null,
    contentMaturity: candidate.diagnostics?.googleBooksContentMaturity || raw.contentMaturity || null,
    publicationShape: candidate.diagnostics?.googleBooksPublicationShape || raw.googleBooksPublicationShape || null,
    narrativeConfidence: Number(candidate.diagnostics?.googleBooksNarrativeConfidence ?? raw.googleBooksNarrativeConfidence ?? 0),
    matchedSignals: candidate.matchedSignals || [],
    scoreBreakdown: candidate.scoreBreakdown || {},
    finalEligibility: selectedIds
      ? {
        eligible: acceptedTitles?.has(candidate.title) || false,
        selected: selectedIds.has(candidate.id),
        rejectionReasons: candidate.rejectedReasons || [],
      }
      : null,
    queryProvenance: {
      queryText: candidate.diagnostics?.queryText || raw.queryText || null,
      originalPlannedQuery: candidate.diagnostics?.originalPlannedQuery || raw.originalPlannedQuery || null,
      queryFamily: candidate.diagnostics?.queryFamily || raw.queryFamily || null,
      queryRung: candidate.diagnostics?.queryRung ?? raw.queryRung ?? null,
    },
  };
}

function classify({ plan, sourceResult, fixture, requests, normalized, selected }) {
  if (!plan.enabled) return "intentional_skip_disabled";
  if (!requests.length) return "dispatch_not_attempted_bug";
  if (["failed", "timed_out"].includes(sourceResult.status)) return "response_invalid";
  if (!Array.isArray(fixture.payload.items)) return "response_invalid";
  if (fixture.payload.items.length === 0 && Number(sourceResult.diagnostics.googleBooksSourceRawApiResultCount || 0) === 0) {
    return "valid_empty_response";
  }
  if (!sourceResult.rawItems.length) {
    const reasons = Object.keys(sourceResult.diagnostics.googleBooksSourceDropReasons || sourceResult.diagnostics.dropReasons || {});
    const structural = reasons.length > 0 && reasons.every((reason) => /malformed_|missing_|non_book_response_shape/.test(reason));
    return structural ? "raw_results_all_structurally_rejected" : "source_policy_rejected_all";
  }
  if (!normalized.length) return "raw_results_all_structurally_rejected";
  if (!selected.length) return "normalized_but_final_ineligible";
  return selected.length < 5 ? "eligible_underfilled" : "eligible_useful";
}

export function googleBooksFixtureInventory(profile, fixture, hashes) {
  return {
    harness: {
      name: "NovelIdeas Source Competence Harness",
      sourceCertification: "Google Books Phase 1",
      version: GOOGLE_BOOKS_CERTIFICATION_VERSION,
      mode: "fixture",
      schemaVersion: "1.0.0",
    },
    profile,
    source: "googleBooks",
    engine: { replayed: false, productionHashes: hashes },
    expectedActivation: profile.expectedActivation,
    actualActivation: "not_executed_fixture_inventory",
    expectedTerminalStateFamily: profile.expectedTerminalStateFamily,
    actualTerminalState: null,
    fixture: {
      fixtureId: fixture.fixtureId,
      captureKind: "deterministic_offline_fixture",
      responseShape: Array.isArray(fixture.payload.items) ? "items_array" : "invalid_missing_items_array",
    },
    raw: {
      identifiersInReturnedOrder: Array.isArray(fixture.payload.items)
        ? fixture.payload.items.map((item) => item.id || null)
        : [],
      titlesInReturnedOrder: Array.isArray(fixture.payload.items)
        ? fixture.payload.items.map((item) => item.volumeInfo?.title || null)
        : [],
      documentCount: Array.isArray(fixture.payload.items) ? fixture.payload.items.length : 0,
    },
    humanReview: { ...profile.humanReview, scoringPerformedByHarness: false },
  };
}

export async function replayGoogleBooks(profile, fixture, pipeline, hashes) {
  const requests = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = fixtureFetch(fixture, requests);
  try {
    const tasteProfile = pipeline.buildTasteProfile(sessionFor(profile));
    const searchPlan = pipeline.buildSearchPlan(tasteProfile, { googleBooks: Boolean(profile.sourceEnabled) });
    const plan = searchPlan.sourcePlans.find((row) => row.source === "googleBooks");
    if (!plan) throw new Error("Google Books plan missing");
    const sourceResult = await pipeline.googleBooksSourceAdapter.search(plan, { profile: tasteProfile });
    const normalized = pipeline.normalizeSourceResults([sourceResult]);
    const scored = pipeline.scoreCandidates(normalized, tasteProfile);
    const selection = pipeline.selectRecommendations(scored, tasteProfile, 10);
    const selectedIds = new Set(selection.selected.map((row) => row.id));
    const acceptedTitles = new Set(values(selection.rejectedReasons.googleBooksFinalEligibilityDecisionByTitle
      ? Object.entries(selection.rejectedReasons.googleBooksFinalEligibilityDecisionByTitle)
        .filter(([, decision]) => decision === "accepted")
        .map(([title]) => title)
      : []));
    const terminal = classify({ plan, sourceResult, fixture, requests, normalized, selected: selection.selected });
    const normalizedViews = normalized.map((row) => candidateView(row));
    const scoredViews = scored.map((row) => candidateView(row, selectedIds, acceptedTitles));
    const selectedViews = selection.selected.map((row) => candidateView(row, selectedIds, acceptedTitles));
    const queryQuality = sourceResult.diagnostics.googleBooksQueryResultQualityByQuery || {};
    return {
      harness: {
        name: "NovelIdeas Source Competence Harness",
        sourceCertification: "Google Books Phase 1",
        version: GOOGLE_BOOKS_CERTIFICATION_VERSION,
        mode: "replay",
        schemaVersion: "1.0.0",
        networkPolicy: "fixture_only_hard_block",
      },
      profile,
      source: "googleBooks",
      engine: {
        version: "recommender-v2-googlebooks-baseline",
        stages: ["taste_profile", "routing", "source_adapter", "normalization", "scoring", "final_eligibility", "selection"],
        productionHashes: hashes,
      },
      expectedActivation: profile.expectedActivation,
      actualActivation: sourceResult.diagnostics.attempted
        ? "attempted"
        : sourceResult.status === "skipped"
        ? "skipped"
        : "not_attempted",
      expectedTerminalStateFamily: profile.expectedTerminalStateFamily,
      actualTerminalState: terminal,
      fixture: {
        fixtureId: fixture.fixtureId,
        captureKind: "deterministic_offline_fixture",
        responseShape: Array.isArray(fixture.payload.items) ? "items_array" : "invalid_missing_items_array",
      },
      routing: {
        enabled: plan.enabled,
        skippedReason: plan.skippedReason || null,
        plannedQueries: plan.intents.map((intent) => String(intent.query || "")),
        timeoutMs: plan.timeoutMs,
      },
      requests,
      raw: {
        fixtureDocumentCount: Array.isArray(fixture.payload.items) ? fixture.payload.items.length : 0,
        identifiersInReturnedOrder: Array.isArray(fixture.payload.items) ? fixture.payload.items.map((item) => item.id || null) : [],
        titlesInReturnedOrder: Array.isArray(fixture.payload.items) ? fixture.payload.items.map((item) => item.volumeInfo?.title || null) : [],
        adapterRawApiResultCount: Number(sourceResult.diagnostics.googleBooksSourceRawApiResultCount || 0),
        acceptedAfterSourcePolicy: sourceResult.rawItems.length,
        dropCounts: sourceResult.diagnostics.googleBooksSourceDropReasons || {},
        perQueryQuality: queryQuality,
      },
      normalized: normalizedViews,
      scored: scoredViews,
      rejectedReasonHistogram: selection.rejectedReasons,
      selected: selectedViews,
      metadataQuality: metadataCoverage(normalized),
      diversity: {
        distinctCreatorCount: new Set(selectedViews.flatMap((row) => row.creators.slice(0, 1).map((creator) => creator.toLowerCase()))).size,
        distinctCategoryCount: new Set(selectedViews.flatMap((row) => row.genres.map((genre) => genre.toLowerCase()))).size,
        duplicateSourceIdCount: selectedViews.length - new Set(selectedViews.map((row) => row.sourceId)).size,
      },
      recovery: {
        fallbackPlanned: plan.intents.some((intent) => intent.id === "fallback-fiction-broad"),
        fallbackAttempted: requests.length > 2,
        retryAttempted: false,
        boundedRequestCount: requests.length,
      },
      underfill: {
        target: 5,
        selectedCount: selection.selected.length,
        underfilled: selection.selected.length < 5,
      },
      humanReview: {
        ...profile.humanReview,
        scoringPerformedByHarness: false,
        machineTerminalStateIsNotHumanUsefulnessJudgment: true,
      },
    };
  } finally {
    globalThis.fetch = originalFetch;
  }
}

export function googleBooksCertificationMarkdown(artifacts) {
  const lines = [
    "# Source Competence Harness - Google Books Phase 1",
    "",
    "Deterministic fixture/replay certification. Live transport health and human usefulness are not certified.",
    "",
    "| Profile | Age | Activation | Expected | Actual | Raw | Accepted | Scored | Selected | Metadata | Human review |",
    "| --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |",
  ];
  for (const artifact of artifacts) {
    lines.push(`| ${artifact.profile.profileId} | ${artifact.profile.ageBand} | ${artifact.actualActivation} | ${artifact.expectedTerminalStateFamily} | ${artifact.actualTerminalState ?? "not run"} | ${artifact.raw.fixtureDocumentCount ?? artifact.raw.documentCount} | ${artifact.raw.acceptedAfterSourcePolicy ?? "not run"} | ${artifact.scored?.length ?? "not run"} | ${artifact.selected?.length ?? "not run"} | ${artifact.metadataQuality?.overallRate ?? "not run"} | ${artifact.humanReview.status} |`);
  }
  lines.push(
    "",
    "## Certification boundary",
    "",
    "- Contract correctness: certified for the frozen cases above.",
    "- Routing correctness: source activation, disabled skip, age-prefixed plans, and bounded fallback execution are replayed.",
    "- Transport health: not certified; fixture/replay modes make no live requests.",
    "- Source competence: machine-stage behavior is characterized for the frozen metadata compositions.",
    "- Human usefulness: not certified; every case remains `not_reviewed`.",
    "",
  );
  return lines.join("\n");
}

export function writeGoogleBooksArtifacts(outputDir, artifacts) {
  mkdirSync(outputDir, { recursive: true });
  for (const artifact of artifacts) {
    writeFileSync(join(outputDir, `${artifact.profile.profileId}.json`), stableJson(artifact));
  }
  writeFileSync(join(outputDir, "summary.json"), stableJson({
    certification: "Google Books Phase 1",
    certificationVersion: GOOGLE_BOOKS_CERTIFICATION_VERSION,
    cases: artifacts,
  }));
  writeFileSync(join(outputDir, "summary.md"), googleBooksCertificationMarkdown(artifacts));
}
