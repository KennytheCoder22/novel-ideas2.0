/**
 * Mystery primary query A/B/C/D retrieval experiment
 *
 * Evaluates four retrieval strategies (Control + 3 candidates) against identical
 * downstream pipeline logic. Only the primary Google Books query changes between
 * variants; all source-policy gates, scoring, and selection are unchanged.
 *
 * Control  : young adult mystery fiction novel   (current production)
 * Candidate A: teen mystery thriller novel
 * Candidate B: young adult detective novel
 * Candidate C: young adult suspense novel
 *
 * Promotion gates (ALL must clear for a candidate to be recommended):
 *  1. Average acceptedAfterSourcePolicy ≥ control + 2.0  OR  average ≥ 5
 *  2. Zero confirmed G2 false rejects
 *  3. Average relevance score ≥ control average
 *  4. Low-confidence selections ≤ control count
 *  5. Author-root pressure ≤ control
 *  6. Improvement holds across ALL 3 profiles (not driven by a single outlier)
 *
 * Outputs:
 *   scripts/output/mystery-primary-query-abcd-retrieval-experiment.json
 *   scripts/output/mystery-primary-query-abcd-retrieval-experiment-summary.txt
 */

import { createRequire } from "node:module";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");

require.extensions[".ts"] = (module, filename) => {
  const source = readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      moduleResolution: ts.ModuleResolutionKind.Node10,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;
  module._compile(output, filename);
};

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const outDir = resolve(scriptDir, "output");
const { runRecommenderV2 } = require(resolve(repoRoot, "app/recommender-v2/engine.ts"));

function parseDotEnv(path) {
  try {
    const raw = readFileSync(path, "utf8");
    const out = {};
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const idx = trimmed.indexOf("=");
      if (idx <= 0) continue;
      out[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
    }
    return out;
  } catch { return {}; }
}

const localEnv = parseDotEnv(resolve(repoRoot, ".env"));
if (!process.env.EXPO_PUBLIC_GOOGLE_BOOKS_API_KEY && localEnv.EXPO_PUBLIC_GOOGLE_BOOKS_API_KEY) {
  process.env.EXPO_PUBLIC_GOOGLE_BOOKS_API_KEY = localEnv.EXPO_PUBLIC_GOOGLE_BOOKS_API_KEY;
}
if (!process.env.GOOGLE_BOOKS_API_KEY && localEnv.GOOGLE_BOOKS_API_KEY) {
  process.env.GOOGLE_BOOKS_API_KEY = localEnv.GOOGLE_BOOKS_API_KEY;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function asNum(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}
function asStr(value) { return String(value || "").trim(); }
function asObject(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function asArray(value) { return Array.isArray(value) ? value : []; }

// ── Structural reasons ────────────────────────────────────────────────────────

const STRUCTURAL_REASONS = new Set([
  "non_book_response_shape",
  "malformed_api_record",
  "duplicate_volume_id",
  "missing_title",
  "missing_author",
  "missing_volume_info",
]);

const ARTIFACT_REASONS_PREFIX = "artifact_";

// ── G1/G2 classification (reason-level) ──────────────────────────────────────

const DEFINITE_G1_REASONS = new Set([
  "publication_shape_writing_guide",
  "publication_shape_critical_study",
  "publication_shape_reference",
  "publication_shape_genre_survey",
  "publication_shape_nonfiction",
  "publication_shape_catalog",
  "publication_shape_anthology",
  "publication_shape_textbook",
  "publication_shape_academic_study",
  "publication_shape_curated_book_guide",
  "publication_shape_periodical",
  "publication_shape_literary_history",
  "publication_shape_public_domain_compilation",
]);

const G2_NC_THRESHOLD = 3;
const G1_NC_THRESHOLD = 1;

function classifyG1G2(rejectionReason, narrativeConf) {
  if (DEFINITE_G1_REASONS.has(asStr(rejectionReason))) return "G1";
  const nc = asNum(narrativeConf);
  if (asStr(rejectionReason) === "publication_shape_unknown_insufficient_narrative_identity") {
    return nc >= G2_NC_THRESHOLD ? "G2" : "ambiguous";
  }
  if (asStr(rejectionReason).startsWith("publication_shape_")) {
    return nc >= G2_NC_THRESHOLD ? "G2" : "G1";
  }
  return nc >= G2_NC_THRESHOLD ? "G2" : nc <= G1_NC_THRESHOLD ? "G1" : "ambiguous";
}

// ── Waterfall builder ─────────────────────────────────────────────────────────

function buildWaterfall(rawApiCount, rejectionReasons, acceptedCount) {
  let structural = 0, publication = 0, artifact = 0, other = 0;
  for (const [reason, count] of Object.entries(asObject(rejectionReasons))) {
    const n = asNum(count);
    if (STRUCTURAL_REASONS.has(reason)) structural += n;
    else if (reason.startsWith("publication_shape_")) publication += n;
    else if (reason.startsWith(ARTIFACT_REASONS_PREFIX)) artifact += n;
    else other += n;
  }
  const afterStructural = rawApiCount - structural;
  const afterPublication = afterStructural - publication;
  const afterArtifact = afterPublication - artifact;
  const afterOther = afterArtifact - other;
  const gates = [
    { gate: "structural", drop: structural },
    { gate: "publication_identity", drop: publication },
    { gate: "artifact", drop: artifact },
    { gate: "other_source_policy", drop: other },
  ];
  const biggestDrop = gates.reduce((best, g) => g.drop > best.drop ? g : best, { gate: "none", drop: -1 });
  return {
    rawApiCount,
    structural,
    afterStructural,
    publication,
    afterPublication,
    artifact: artifact + other,
    accepted: acceptedCount,
    biggestDropGate: biggestDrop.gate,
    biggestDropCount: biggestDrop.drop,
  };
}

// ── Quality metrics ───────────────────────────────────────────────────────────

const WEAK_FIT_SCORE_THRESHOLD = 0.4; // items below this are "low confidence / weak fit"

function buildQuality(selectedItems) {
  const scores = asArray(selectedItems).map((item) => asNum(asObject(item).score)).filter((s) => s > 0);
  if (!scores.length) return { averageScore: 0, minScore: 0, maxScore: 0, lowConfidenceCount: 0 };
  const sum = scores.reduce((acc, s) => acc + s, 0);
  return {
    averageScore: Number((sum / scores.length).toFixed(3)),
    minScore: Number(Math.min(...scores).toFixed(3)),
    maxScore: Number(Math.max(...scores).toFixed(3)),
    lowConfidenceCount: scores.filter((s) => s < WEAK_FIT_SCORE_THRESHOLD).length,
  };
}

// ── Author diversity pressure ─────────────────────────────────────────────────

function buildAuthorPressure(selectedItems) {
  const authorCounts = new Map();
  for (const item of asArray(selectedItems)) {
    const authors = asArray(asObject(item).authors);
    const firstAuthor = asStr(authors[0]).toLowerCase();
    if (firstAuthor) authorCounts.set(firstAuthor, (authorCounts.get(firstAuthor) || 0) + 1);
  }
  let duplicateAuthorPairs = 0;
  for (const count of authorCounts.values()) {
    if (count >= 2) duplicateAuthorPairs += count - 1;
  }
  return { duplicateAuthorPairs, uniqueAuthors: authorCounts.size };
}

// ── G1/G2 counts from per-title rejected map ─────────────────────────────────

function buildG1G2Counts(gbSource) {
  const rejectedByTitle = asObject(gbSource.googleBooksPublicationShapeRejectedBeforeRankingByTitle);
  const ncByTitle = asObject(gbSource.googleBooksNarrativeConfidenceByTitle);
  const counts = { G1: 0, G2: 0, ambiguous: 0 };
  const g2Examples = [];
  for (const [title, reason] of Object.entries(rejectedByTitle)) {
    const nc = asNum(ncByTitle[title]);
    const cat = classifyG1G2(reason, nc);
    counts[cat]++;
    if (cat === "G2") g2Examples.push({ title, reason, nc });
  }
  return { counts, g2Examples };
}

// ── Rejection examples ────────────────────────────────────────────────────────

function buildRejectionExamples(primaryQuery, gbSource, limit = 5) {
  const qualityByQuery = asObject(gbSource.googleBooksQueryResultQualityByQuery);
  const primaryQuality = asObject(qualityByQuery[primaryQuery]);
  const rejectionReasons = asObject(primaryQuality.rejectionReasons);
  const ncByTitle = asObject(gbSource.googleBooksNarrativeConfidenceByTitle);
  const rejectedByTitle = asObject(gbSource.googleBooksPublicationShapeRejectedBeforeRankingByTitle);

  // Top rejection reasons (publication-identity only)
  const pubReasons = Object.entries(rejectionReasons)
    .filter(([r]) => r.startsWith("publication_shape_"))
    .sort(([, a], [, b]) => asNum(b) - asNum(a))
    .slice(0, 4)
    .map(([r, n]) => `${r}×${n}`);

  // Sample rejected titles
  const examples = Object.entries(rejectedByTitle)
    .slice(0, limit)
    .map(([title, reason]) => ({
      title: title.slice(0, 60),
      reason,
      nc: asNum(ncByTitle[title]),
      g1g2: classifyG1G2(reason, asNum(ncByTitle[title])),
    }));

  return { pubReasons, examples };
}

// ── Fetch latency ─────────────────────────────────────────────────────────────

function buildLatency(fetchDiagnostics) {
  let totalMs = 0;
  let failed = 0;
  let empty = 0;
  for (const fetch of asArray(fetchDiagnostics)) {
    const f = asObject(fetch);
    totalMs += asNum(f.elapsedMs);
    const status = asStr(f.status);
    if (status === "failed" || status === "timed_out") failed++;
    if (status === "empty" || asNum(f.rawApiCount) === 0) empty++;
  }
  return { totalFetchMs: totalMs, failedFetches: failed, emptyFetches: empty };
}

// ── Extract run metrics ───────────────────────────────────────────────────────

function extractRunMetrics(variant, profileId, profileLabel, result) {
  const diagnostics = asObject(asObject(result).diagnostics);
  const sources = asArray(diagnostics.sources);
  const gbSource = asObject(sources.find((s) => asStr(asObject(s).source) === "googleBooks"));

  const fetchDiagnostics = asArray(gbSource.googleBooksSourceFetchDiagnostics);
  const primaryFetch = asObject(fetchDiagnostics.find((f) => asNum(asObject(f).queryCascadeIndex) === 0));
  const primaryQuery = asStr(primaryFetch.originalPlannedQuery || primaryFetch.query);

  const qualityByQuery = asObject(gbSource.googleBooksQueryResultQualityByQuery);
  const primaryQuality = asObject(qualityByQuery[primaryQuery]);

  const rawApiCount = asNum(primaryFetch.rawApiCount);
  const acceptedAfterSourcePolicy = asNum(primaryFetch.acceptedAfterSourcePolicy);
  const rejectionReasons = asObject(primaryQuality.rejectionReasons);

  const waterfall = buildWaterfall(rawApiCount, rejectionReasons, acceptedAfterSourcePolicy);
  const selectedItems = asArray(asObject(result).items);
  const quality = buildQuality(selectedItems);
  const authorPressure = buildAuthorPressure(selectedItems);
  const { counts: g1g2Counts, g2Examples } = buildG1G2Counts(gbSource);
  const rejectionExamples = buildRejectionExamples(primaryQuery, gbSource);
  const latency = buildLatency(fetchDiagnostics);

  // Verify override was applied
  const searchPlanDiagnostics = asObject(diagnostics.searchPlan);
  const overrideApplied = Boolean(asObject(searchPlanDiagnostics.googleBooks).teenGoogleBooksMysteryPrimaryQueryOverrideApplied);

  return {
    variant,
    profileId,
    profileLabel,
    primaryQuery,
    overrideApplied,
    rawApiCount,
    structuralLoss: waterfall.structural,
    publicationIdentityLoss: waterfall.publication,
    artifactLoss: waterfall.artifact,
    acceptedAfterSourcePolicy,
    finalSelected: selectedItems.length,
    quality,
    authorPressure,
    g1g2Counts,
    g2Examples,
    rejectionExamples,
    waterfall,
    latency,
    rejectionReasonsFull: rejectionReasons,
  };
}

// ── Variants ──────────────────────────────────────────────────────────────────

const VARIANTS = [
  { id: "control", label: "Control (current)", query: "" },
  { id: "A", label: "Candidate A", query: "teen mystery thriller novel" },
  { id: "B", label: "Candidate B", query: "young adult detective novel" },
  { id: "C", label: "Candidate C", query: "young adult suspense novel" },
];

// ── Mystery profiles (same 3 G-bucket profiles from pub-shape audit) ──────────

const MYSTERY_PROFILES = [
  {
    id: "mystery-classic-whodunit",
    label: "Classic whodunit mystery",
    ageBand: "teens",
    signals: [
      { action: "like", title: "Truly Devious", source: "googleBooks", format: "book", genres: ["mystery"], tones: ["suspenseful"], themes: ["investigation", "whodunit"] },
      { action: "like", title: "One of Us Is Lying", source: "googleBooks", format: "book", genres: ["mystery"], tones: ["dramatic"], themes: ["secrets", "suspects"] },
      { action: "like", title: "A Good Girl's Guide to Murder", source: "googleBooks", format: "book", genres: ["mystery"], tones: ["tense"], themes: ["true crime", "investigation"] },
      { action: "dislike", title: "Twilight", source: "googleBooks", format: "book", genres: ["romance", "fantasy"], tones: ["romantic"] },
      { action: "dislike", title: "The Hunger Games", source: "googleBooks", format: "book", genres: ["science fiction"], tones: ["bleak"] },
      { action: "skip", title: "Harry Potter and the Sorcerer's Stone", source: "googleBooks", format: "book", genres: ["fantasy"] },
    ],
  },
  {
    id: "mystery-psychological-thriller",
    label: "Psychological thriller mystery",
    ageBand: "teens",
    signals: [
      { action: "like", title: "We Were Liars", source: "googleBooks", format: "book", genres: ["mystery"], tones: ["atmospheric", "suspenseful"], themes: ["memory", "family secrets"] },
      { action: "like", title: "The Female of the Species", source: "googleBooks", format: "book", genres: ["mystery", "thriller"], tones: ["dark", "tense"], themes: ["revenge"] },
      { action: "like", title: "Allegedly", source: "googleBooks", format: "book", genres: ["thriller", "mystery"], tones: ["unsettling"], themes: ["unreliable narrator"] },
      { action: "dislike", title: "Harry Potter and the Sorcerer's Stone", source: "googleBooks", format: "book", genres: ["fantasy"], tones: ["whimsical"] },
      { action: "skip", title: "The Hunger Games", source: "googleBooks", format: "book", genres: ["science fiction"], tones: ["bleak"] },
    ],
  },
  {
    id: "mystery-cozy-amateur",
    label: "Cozy amateur detective mystery",
    ageBand: "teens",
    signals: [
      { action: "like", title: "Enola Holmes", source: "googleBooks", format: "book", genres: ["mystery"], tones: ["charming"], themes: ["amateur detective"] },
      { action: "like", title: "The Name of the Star", source: "googleBooks", format: "book", genres: ["mystery", "horror"], tones: ["suspenseful"], themes: ["historical", "investigation"] },
      { action: "like", title: "The London Eye Mystery", source: "googleBooks", format: "book", genres: ["mystery"], tones: ["clever"], themes: ["siblings", "puzzle"] },
      { action: "dislike", title: "Divergent", source: "googleBooks", format: "book", genres: ["science fiction"], tones: ["action-packed"] },
      { action: "skip", title: "Twilight", source: "googleBooks", format: "book", genres: ["romance", "fantasy"], tones: ["romantic"] },
    ],
  },
];

const LIMIT = 6;
const OVERRIDE_ENV = "V2_TEEN_GB_MYSTERY_PRIMARY_QUERY_OVERRIDE";

// ── Run all variants ──────────────────────────────────────────────────────────

const allVariantResults = [];

for (const variant of VARIANTS) {
  console.log(`\nVariant ${variant.id}: "${variant.query || "young adult mystery fiction novel (control)"}"`);

  if (variant.query) {
    process.env[OVERRIDE_ENV] = variant.query;
  } else {
    delete process.env[OVERRIDE_ENV];
  }

  const variantRows = [];

  for (const profile of MYSTERY_PROFILES) {
    const start = Date.now();
    process.stdout.write(`  [${profile.id}] ... `);

    const result = await runRecommenderV2({
      requestId: `mystery-abcd-${variant.id}-${profile.id}`,
      ageBand: profile.ageBand,
      limit: LIMIT,
      enabledSources: {
        googleBooks: true,
        openLibrary: false,
        kitsu: false,
        comicVine: false,
        localLibrary: false,
        nyt: false,
        mock: false,
      },
      signals: profile.signals,
    });

    const elapsed = Date.now() - start;
    const row = extractRunMetrics(variant.id, profile.id, profile.label, result);
    row.wallClockMs = elapsed;
    variantRows.push(row);

    console.log(
      `accepted=${row.acceptedAfterSourcePolicy}  selected=${row.finalSelected}`
      + `  score=${row.quality.averageScore}  G1=${row.g1g2Counts.G1} G2=${row.g1g2Counts.G2}`
      + `  ${elapsed}ms`,
    );
  }

  delete process.env[OVERRIDE_ENV];
  allVariantResults.push({ variant, rows: variantRows });
}

// ── Aggregate per variant ─────────────────────────────────────────────────────

function avgField(rows, field) {
  return Number((rows.reduce((sum, r) => sum + asNum(r[field]), 0) / rows.length).toFixed(2));
}

function avgNested(rows, ...keys) {
  return Number((rows.reduce((sum, r) => {
    let v = r;
    for (const k of keys) v = asObject(v)[k];
    return sum + asNum(v);
  }, 0) / rows.length).toFixed(3));
}

const aggregates = allVariantResults.map(({ variant, rows }) => ({
  variantId: variant.id,
  variantLabel: variant.label,
  queryUsed: rows[0]?.primaryQuery ?? "(unknown)",
  avgRawApiCount: avgField(rows, "rawApiCount"),
  avgStructuralLoss: avgField(rows, "structuralLoss"),
  avgPublicationIdentityLoss: avgField(rows, "publicationIdentityLoss"),
  avgArtifactLoss: avgField(rows, "artifactLoss"),
  avgAcceptedAfterSourcePolicy: avgField(rows, "acceptedAfterSourcePolicy"),
  avgFinalSelected: avgField(rows, "finalSelected"),
  avgRelevanceScore: avgNested(rows, "quality", "averageScore"),
  minRelevanceScore: Math.min(...rows.map((r) => asNum(asObject(r.quality).minScore))),
  totalLowConfidenceSelected: rows.reduce((sum, r) => sum + asNum(asObject(r.quality).lowConfidenceCount), 0),
  totalG1: rows.reduce((sum, r) => sum + asNum(asObject(r.g1g2Counts).G1), 0),
  totalG2: rows.reduce((sum, r) => sum + asNum(asObject(r.g1g2Counts).G2), 0),
  totalAmbiguous: rows.reduce((sum, r) => sum + asNum(asObject(r.g1g2Counts).ambiguous), 0),
  totalDuplicateAuthorPairs: rows.reduce((sum, r) => sum + asNum(asObject(r.authorPressure).duplicateAuthorPairs), 0),
  avgTotalFetchMs: avgField(rows, "wallClockMs"),
  failedOrEmptyFetches: rows.reduce((sum, r) => sum + asNum(asObject(r.latency).failedFetches) + asNum(asObject(r.latency).emptyFetches), 0),
}));

// ── Promotion gate evaluation ─────────────────────────────────────────────────

const CONTROL = aggregates.find((a) => a.variantId === "control");
const ACCEPTED_IMPROVEMENT_THRESHOLD = 2.0;
const ACCEPTED_ABSOLUTE_THRESHOLD = 5;

function evaluateGates(variantAgg, controlAgg, rows, controlRows) {
  const acceptedDelta = variantAgg.avgAcceptedAfterSourcePolicy - controlAgg.avgAcceptedAfterSourcePolicy;
  const gate1 = acceptedDelta >= ACCEPTED_IMPROVEMENT_THRESHOLD || variantAgg.avgAcceptedAfterSourcePolicy >= ACCEPTED_ABSOLUTE_THRESHOLD;
  const gate2 = variantAgg.totalG2 === 0;
  const gate3 = variantAgg.avgRelevanceScore >= controlAgg.avgRelevanceScore;
  const gate4 = variantAgg.totalLowConfidenceSelected <= controlAgg.totalLowConfidenceSelected;
  const gate5 = variantAgg.totalDuplicateAuthorPairs <= controlAgg.totalDuplicateAuthorPairs;
  const gate6 = rows.every((row) => {
    const controlRow = controlRows.find((r) => r.profileId === row.profileId);
    if (!controlRow) return false;
    const delta = row.acceptedAfterSourcePolicy - controlRow.acceptedAfterSourcePolicy;
    return delta >= ACCEPTED_IMPROVEMENT_THRESHOLD || row.acceptedAfterSourcePolicy >= ACCEPTED_ABSOLUTE_THRESHOLD;
  });

  const passed = [gate1, gate2, gate3, gate4, gate5, gate6];
  const allPassed = passed.every(Boolean);

  return {
    acceptedDelta: Number(acceptedDelta.toFixed(2)),
    gate1_accepted_improvement: { passed: gate1, detail: `Δ=${acceptedDelta.toFixed(2)}, avg=${variantAgg.avgAcceptedAfterSourcePolicy} (threshold: +2.0 or ≥5)` },
    gate2_zero_g2: { passed: gate2, detail: `G2 count: ${variantAgg.totalG2}` },
    gate3_relevance: { passed: gate3, detail: `score ${variantAgg.avgRelevanceScore} vs control ${controlAgg.avgRelevanceScore}` },
    gate4_weak_fit: { passed: gate4, detail: `low-confidence selected: ${variantAgg.totalLowConfidenceSelected} vs control ${controlAgg.totalLowConfidenceSelected}` },
    gate5_diversity: { passed: gate5, detail: `dup-author pairs: ${variantAgg.totalDuplicateAuthorPairs} vs control ${controlAgg.totalDuplicateAuthorPairs}` },
    gate6_consistent: { passed: gate6, detail: "improvement holds across all 3 profiles" },
    allGatesPassed: allPassed,
    promotionRecommendation: allPassed ? "promote" : "do_not_promote",
  };
}

const controlRows = allVariantResults.find((v) => v.variant.id === "control").rows;
const gateResults = aggregates.map((agg) => {
  if (agg.variantId === "control") return null;
  const variantRows = allVariantResults.find((v) => v.variant.id === agg.variantId).rows;
  return {
    variantId: agg.variantId,
    variantLabel: agg.variantLabel,
    ...evaluateGates(agg, CONTROL, variantRows, controlRows),
  };
}).filter(Boolean);

// ── Write outputs ─────────────────────────────────────────────────────────────

mkdirSync(outDir, { recursive: true });

const jsonOut = resolve(outDir, "mystery-primary-query-abcd-retrieval-experiment.json");
const summaryOut = resolve(outDir, "mystery-primary-query-abcd-retrieval-experiment-summary.txt");

writeFileSync(jsonOut, JSON.stringify({
  generatedAt: new Date().toISOString(),
  profiles: MYSTERY_PROFILES.map(({ id, label }) => ({ id, label })),
  variants: VARIANTS,
  aggregates,
  gateResults,
  allRuns: allVariantResults.map(({ variant, rows }) => ({ variantId: variant.id, rows })),
}, null, 2));

// ── Summary text ──────────────────────────────────────────────────────────────

function pad(s, n, right = false) {
  const str = String(s);
  return right ? str.padStart(n) : str.padEnd(n);
}

function delta(a, b) {
  const d = Number((a - b).toFixed(2));
  return d >= 0 ? `+${d}` : String(d);
}

const lines = [];

lines.push("═══════════════════════════════════════════════════════════════════");
lines.push(" Mystery primary query A/B/C/D retrieval experiment");
lines.push(`  Profiles: ${MYSTERY_PROFILES.length}  |  Variants: ${VARIANTS.length}  |  Limit: ${LIMIT}`);
lines.push("═══════════════════════════════════════════════════════════════════");
lines.push("");

// Per-variant comparison table
lines.push("── Aggregate comparison ─────────────────────────────────────────────");
const hdr = [
  pad("Variant", 20),
  pad("Query used", 42),
  pad("raw", 5, true),
  pad("-struct", 8, true),
  pad("-pubid", 7, true),
  pad("accepted", 9, true),
  pad("selected", 9, true),
  pad("score", 7, true),
  pad("G1", 4, true),
  pad("G2", 4, true),
  pad("lowconf", 8, true),
  pad("dupAuth", 8, true),
].join("  ");
lines.push(`  ${hdr}`);
lines.push(`  ${"─".repeat(hdr.length)}`);

for (const agg of aggregates) {
  const isCtr = agg.variantId === "control";
  const scoreDelta = isCtr ? "" : ` (${delta(agg.avgRelevanceScore, CONTROL.avgRelevanceScore)})`;
  const acceptedDelta = isCtr ? "" : ` (${delta(agg.avgAcceptedAfterSourcePolicy, CONTROL.avgAcceptedAfterSourcePolicy)})`;
  lines.push(`  ${[
    pad(`${agg.variantId}: ${agg.variantLabel}`, 20),
    pad(agg.queryUsed.slice(0, 42), 42),
    pad(agg.avgRawApiCount, 5, true),
    pad(agg.avgStructuralLoss, 8, true),
    pad(agg.avgPublicationIdentityLoss, 7, true),
    pad(`${agg.avgAcceptedAfterSourcePolicy}${acceptedDelta}`, 9, true),
    pad(agg.avgFinalSelected, 9, true),
    pad(`${agg.avgRelevanceScore}${scoreDelta}`, 7, true),
    pad(agg.totalG1, 4, true),
    pad(agg.totalG2, 4, true),
    pad(agg.totalLowConfidenceSelected, 8, true),
    pad(agg.totalDuplicateAuthorPairs, 8, true),
  ].join("  ")}`);
}

lines.push("");

// Waterfall table
lines.push("── Gate-by-gate waterfall (avg across 3 profiles) ──────────────────");
for (const agg of aggregates) {
  lines.push(`  ${agg.variantId} — "${agg.queryUsed}"`);
  lines.push(`    ${agg.avgRawApiCount} raw  →  −${agg.avgStructuralLoss} structural  →  ${agg.avgRawApiCount - agg.avgStructuralLoss} entered pub-id`);
  lines.push(`    →  −${agg.avgPublicationIdentityLoss} publication-identity  →  ${agg.avgAcceptedAfterSourcePolicy} accepted`);
  lines.push("");
}

// Per-profile breakdown
lines.push("── Per-profile breakdown ────────────────────────────────────────────");
for (const profile of MYSTERY_PROFILES) {
  lines.push(`  ${profile.id}`);
  for (const { variant, rows } of allVariantResults) {
    const row = rows.find((r) => r.profileId === profile.id);
    if (!row) continue;
    const controlRow = controlRows.find((r) => r.profileId === profile.id);
    const d = controlRow ? ` (${delta(row.acceptedAfterSourcePolicy, controlRow.acceptedAfterSourcePolicy)})` : "";
    lines.push(
      `    ${pad(variant.id, 9)} accepted=${row.acceptedAfterSourcePolicy}${d}`
      + `  selected=${row.finalSelected}  score=${row.quality.averageScore}`
      + `  G1=${row.g1g2Counts.G1} G2=${row.g1g2Counts.G2} ambig=${row.g1g2Counts.ambiguous}`
      + `  ${row.wallClockMs}ms`,
    );
  }
  lines.push("");
}

// Rejection examples per variant
lines.push("── Rejection reason samples (publication-identity, primary query) ────");
for (const { variant, rows } of allVariantResults) {
  const sampleRow = rows[0];
  const exs = sampleRow?.rejectionExamples?.pubReasons ?? [];
  lines.push(`  ${variant.id} "${sampleRow?.primaryQuery}"`);
  lines.push(`    Top pub-id reasons: ${exs.join(" | ") || "(none)"}`);
  const g2ex = sampleRow?.g2Examples ?? [];
  if (g2ex.length) {
    lines.push(`    G2 false rejects:`);
    for (const ex of g2ex) {
      lines.push(`      "${ex.title}" [${ex.reason}] nc=${ex.nc}`);
    }
  }
  lines.push("");
}

// Promotion gate summary
lines.push("── Promotion gate results ───────────────────────────────────────────");
lines.push(`  Thresholds:`);
lines.push(`    Gate 1: avg accepted ≥ control + 2.0  OR  ≥ ${ACCEPTED_ABSOLUTE_THRESHOLD}`);
lines.push(`    Gate 2: G2 false rejects = 0`);
lines.push(`    Gate 3: avg relevance score ≥ control`);
lines.push(`    Gate 4: low-confidence selections ≤ control`);
lines.push(`    Gate 5: duplicate-author pairs ≤ control`);
lines.push(`    Gate 6: improvement consistent across all ${MYSTERY_PROFILES.length} profiles`);
lines.push("");
for (const gate of gateResults) {
  lines.push(`  ${gate.variantId} — ${gate.variantLabel}`);
  lines.push(`    Gate 1 (accepted):    ${gate.gate1_accepted_improvement.passed ? "✓" : "✗"}  ${gate.gate1_accepted_improvement.detail}`);
  lines.push(`    Gate 2 (G2 zero):     ${gate.gate2_zero_g2.passed ? "✓" : "✗"}  ${gate.gate2_zero_g2.detail}`);
  lines.push(`    Gate 3 (quality):     ${gate.gate3_relevance.passed ? "✓" : "✗"}  ${gate.gate3_relevance.detail}`);
  lines.push(`    Gate 4 (weak-fit):    ${gate.gate4_weak_fit.passed ? "✓" : "✗"}  ${gate.gate4_weak_fit.detail}`);
  lines.push(`    Gate 5 (diversity):   ${gate.gate5_diversity.passed ? "✓" : "✗"}  ${gate.gate5_diversity.detail}`);
  lines.push(`    Gate 6 (consistent):  ${gate.gate6_consistent.passed ? "✓" : "✗"}  ${gate.gate6_consistent.detail}`);
  lines.push(`    → ${gate.promotionRecommendation.toUpperCase()}`);
  lines.push("");
}

// Verdict
const promotable = gateResults.filter((g) => g.allGatesPassed);
const bestByAccepted = aggregates
  .filter((a) => a.variantId !== "control")
  .sort((a, b) => b.avgAcceptedAfterSourcePolicy - a.avgAcceptedAfterSourcePolicy)[0];

lines.push("═══════════════════════════════════════════════════════════════════");
lines.push(" VERDICT");
lines.push("═══════════════════════════════════════════════════════════════════");
if (promotable.length === 1) {
  lines.push(`  PROMOTE: ${promotable[0].variantId} — ${promotable[0].variantLabel}`);
  lines.push(`  All 6 gates passed.`);
} else if (promotable.length > 1) {
  lines.push(`  MULTIPLE CANDIDATES PASS: ${promotable.map((g) => g.variantId).join(", ")}`);
  lines.push(`  Select the highest accepted yield with equal or better quality.`);
} else {
  lines.push("  NO CANDIDATE CLEARS ALL PROMOTION GATES.");
  lines.push(`  Best performer by accepted yield: ${bestByAccepted.variantId} — "${bestByAccepted.queryUsed}"`);
  lines.push(`    avg accepted: ${bestByAccepted.avgAcceptedAfterSourcePolicy}  (control: ${CONTROL.avgAcceptedAfterSourcePolicy})`);
  lines.push("");
  lines.push("  Reasons no candidate was promoted:");
  for (const gate of gateResults) {
    const failed = [
      gate.gate1_accepted_improvement.passed ? null : `Gate 1 (accepted): ${gate.gate1_accepted_improvement.detail}`,
      gate.gate2_zero_g2.passed ? null : `Gate 2 (G2 false rejects): ${gate.gate2_zero_g2.detail}`,
      gate.gate3_relevance.passed ? null : `Gate 3 (quality): ${gate.gate3_relevance.detail}`,
      gate.gate4_weak_fit.passed ? null : `Gate 4 (weak-fit): ${gate.gate4_weak_fit.detail}`,
      gate.gate5_diversity.passed ? null : `Gate 5 (diversity): ${gate.gate5_diversity.detail}`,
      gate.gate6_consistent.passed ? null : `Gate 6 (consistent): ${gate.gate6_consistent.detail}`,
    ].filter(Boolean);
    if (failed.length) {
      lines.push(`  ${gate.variantId} failed ${failed.length} gate(s):`);
      for (const f of failed) lines.push(`    • ${f}`);
    }
  }
  lines.push("");
  lines.push("  Next step: test a complementary two-query retrieval plan.");
  lines.push("  Do not relax filters or weaken source policy.");
}
lines.push("═══════════════════════════════════════════════════════════════════");

writeFileSync(summaryOut, `${lines.join("\n")}\n`);

console.log(`\nJSON:    ${jsonOut}`);
console.log(`Summary: ${summaryOut}`);
