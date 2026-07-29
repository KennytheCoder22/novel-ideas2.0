/**
 * Kids K-2 Google Books pre-scoring rejection audit
 *
 * Diagnostic-only instrumentation:
 * - inspects publication-shape-pass Google Books candidates
 * - runs the existing Kids pre-scoring gate unchanged
 * - emits rejection histogram + representative examples by rejection reason
 *
 * Usage:
 *   GOOGLE_BOOKS_API_KEY=<key> node scripts/run-v2-googlebooks-kids-k2-pre-scoring-rejection-audit.mjs
 *
 * Output:
 *   scripts/output/kids-k2-pre-scoring-rejection-audit.json
 *   scripts/output/kids-k2-pre-scoring-rejection-audit.csv
 */
import { createRequire } from "node:module";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");
require.extensions[".ts"] = (module, filename) => {
  const output = ts.transpileModule(readFileSync(filename, "utf8"), {
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
const repoDir = resolve(scriptDir, "..");
const recommenderDir = resolve(repoDir, "app/recommender-v2");

const { buildTasteProfile } = require(resolve(recommenderDir, "tasteProfile.ts"));
const { buildSearchPlan } = require(resolve(recommenderDir, "searchPlan.ts"));
const { runRecommenderV2, applyKidsGoogleBooksPreScoringGate } = require(resolve(recommenderDir, "engine.ts"));
const { analyzeGoogleBooksVolumeForAudit } = require(resolve(recommenderDir, "sources/googleBooksSource.ts"));

const API_KEY = process.env.GOOGLE_BOOKS_API_KEY || process.env.EXPO_PUBLIC_GOOGLE_BOOKS_API_KEY || "";
const API_BASE = "https://www.googleapis.com/books/v1/volumes";
const MAX_RESULTS = 24;
const FETCH_DELAY_MS = 300;
const EXAMPLES_PER_REASON = 5;

const PRESETS = [
  {
    name: "Test A",
    signals: [
      { action: "like", title: "Mercy Watson", genres: ["humorous", "adventure"], themes: ["friendship", "cozy"], format: "book" },
      { action: "like", title: "Frog and Toad", genres: ["humorous"], themes: ["friendship", "gentle"], format: "book" },
      { action: "dislike", title: "Dark Kingdom", genres: ["horror"], themes: ["grim"], format: "book" },
      { action: "skip", title: "Magic Castle", genres: ["fantasy"], themes: ["magic"], format: "book" },
    ],
  },
  {
    name: "Test B",
    signals: [
      { action: "like", title: "Dragon Masters", genres: ["fantasy", "adventure"], themes: ["dragons", "magic"], format: "book" },
      { action: "like", title: "Magic Tree House", genres: ["fantasy", "adventure"], themes: ["friendship"], format: "book" },
      { action: "skip", title: "Funny Bones", genres: ["humorous"], themes: ["jokes"], format: "book" },
      { action: "dislike", title: "Workbook", genres: ["education"], themes: ["worksheets"], format: "book" },
    ],
  },
  {
    name: "Test C",
    signals: [
      { action: "like", title: "How to Train Your Dragon", genres: ["fantasy", "adventure"], themes: ["dragons", "friendship"], format: "book" },
      { action: "like", title: "The Princess in Black", genres: ["fantasy", "adventure"], themes: ["heroic", "humorous"], format: "book" },
      { action: "like", title: "Unicorn Academy", genres: ["fantasy"], themes: ["magic", "friendship"], format: "book" },
      { action: "skip", title: "Bus Drivers", genres: ["transport"], themes: ["nonfiction"], format: "book" },
    ],
  },
];

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

async function fetchQuery(query) {
  const params = new URLSearchParams({
    q: query,
    maxResults: String(MAX_RESULTS),
    orderBy: "relevance",
    printType: "books",
    projection: "full",
    langRestrict: "en",
  });
  if (API_KEY) params.set("key", API_KEY);
  const res = await fetch(`${API_BASE}?${params.toString()}`);
  if (!res.ok) return [];
  const json = await res.json();
  return Array.isArray(json.items) ? json.items : [];
}

function buildCandidate(volumeInfo, item, analysis, queryText) {
  const volumeId = String(item.id || "").trim();
  return {
    id: `googleBooks:${volumeId}`,
    source: "googleBooks",
    sourceId: volumeId,
    title: analysis.title,
    subtitle: analysis.subtitle || undefined,
    creators: analysis.authors,
    description: analysis.description || undefined,
    genres: analysis.categories,
    themes: [],
    tones: [],
    characterDynamics: [],
    formats: ["book"],
    publicationYear: analysis.publicationYear,
    maturityBand: analysis.maturityRating,
    sourceUrl: String(volumeInfo.infoLink || "").trim() || undefined,
    raw: {
      id: volumeId,
      title: analysis.title,
      subtitle: analysis.subtitle,
      description: analysis.description,
      categories: analysis.categories,
      maturityRating: analysis.maturityRating,
      contentMaturity: analysis.contentMaturity,
      audienceBand: analysis.inferredAudienceBand,
      requestedAgeBand: "kids",
      pageCount: analysis.pageCount,
      printType: analysis.printType,
      volumeInfo: {
        ...volumeInfo,
        categories: analysis.categories,
        description: analysis.description,
        maturityRating: analysis.maturityRating,
        pageCount: analysis.pageCount,
      },
    },
    diagnostics: {
      googleBooksPublicationShape: analysis.publicationShape,
      googleBooksAudienceBand: analysis.inferredAudienceBand,
      googleBooksContentMaturity: analysis.contentMaturity,
      queryText,
      queryFamily: "",
    },
    score: 0,
    matchedSignals: [],
    rejectedReasons: [],
    scoreBreakdown: {},
  };
}

function pushHistogram(map, key) {
  if (!key) return;
  map[key] = Number(map[key] || 0) + 1;
}

function keepRepresentativeExample(map, reason, example) {
  if (!reason) return;
  if (!map[reason]) map[reason] = [];
  const existing = map[reason];
  if (existing.some((row) => row.volumeId === example.volumeId)) return;
  if (existing.length >= EXAMPLES_PER_REASON) return;
  existing.push(example);
}

function summarizePresetResult(presetName, rows) {
  const histogram = {};
  const examplesByReason = {};
  for (const row of rows) {
    if (!row.shapePassed || row.enteredScoring) continue;
    pushHistogram(histogram, row.reason);
    keepRepresentativeExample(examplesByReason, row.reason, {
      preset: row.preset,
      volumeId: row.volumeId,
      title: row.title,
      queries: row.queries,
      categories: row.categories,
      pageCount: row.pageCount,
      publicationShape: row.publicationShape,
      inferredAudienceBand: row.diagnostics.inferredAudienceBand || "",
      formatIdentity: row.diagnostics.formatIdentity || "",
      audienceDecision: row.diagnostics.audienceDecision || "",
      audienceRejectionReason: row.diagnostics.audienceRejectionReason || "",
      audienceEvidence: row.diagnostics.audienceEvidence || [],
      formatEvidence: row.diagnostics.formatEvidence || [],
      recommendationIdentity: row.diagnostics.recommendationIdentity || "",
      descriptionSnippet: row.descriptionSnippet,
    });
  }
  return {
    preset: presetName,
    publicationShapePassRejectedHistogram: histogram,
    representativeExamplesByReason: examplesByReason,
  };
}

const presetAudits = [];
const aggregateRows = [];

for (const preset of PRESETS) {
  const session = {
    requestId: `kids-k2-pre-scoring-audit-${preset.name.replace(/\s+/g, "-").toLowerCase()}`,
    ageBand: "kids",
    limit: 10,
    enabledSources: { googleBooks: true, openLibrary: false, mock: false, kitsu: false, comicVine: false, nyt: false },
    signals: preset.signals,
  };

  const runResult = await runRecommenderV2(session);
  const profile = buildTasteProfile(session);
  const plan = buildSearchPlan(profile, session.enabledSources);
  const sourceDiag = runResult.diagnostics.sources.find((source) => source.source === "googleBooks") || {};
  const attemptedQueries = Array.isArray(sourceDiag.googleBooksQueriesAttempted)
    ? sourceDiag.googleBooksQueriesAttempted
    : Array.isArray(sourceDiag.queries)
      ? sourceDiag.queries
      : (plan.sourcePlans.find((sourcePlan) => sourcePlan.source === "googleBooks")?.intents || []).map((intent) => intent.query);

  const byVolume = new Map();
  for (const query of attemptedQueries) {
    const items = await fetchQuery(query);
    for (const item of items) {
      const volumeId = String(item?.id || "").trim();
      if (!volumeId) continue;
      if (!byVolume.has(volumeId)) {
        byVolume.set(volumeId, { volumeId, item, queries: new Set([query]) });
      } else {
        byVolume.get(volumeId).queries.add(query);
      }
    }
    await sleep(FETCH_DELAY_MS);
  }

  const rows = [];
  for (const row of byVolume.values()) {
    const volumeInfo = row.item?.volumeInfo && typeof row.item.volumeInfo === "object" ? row.item.volumeInfo : {};
    const analysis = analyzeGoogleBooksVolumeForAudit(volumeInfo, row.item);
    const candidate = buildCandidate(volumeInfo, row.item, analysis, Array.from(row.queries)[0] || "");
    let enteredScoring = false;
    let reason = "";
    let diag = {};
    if (analysis.admittedAfterSourcePolicy) {
      const gate = applyKidsGoogleBooksPreScoringGate([candidate], profile);
      enteredScoring = gate.candidates.length > 0;
      reason = enteredScoring
        ? "entered_scoring"
        : String(gate.diagnostics.rejectedBeforeScoringByTitle[candidate.title] || "unknown_rejection");
      diag = {
        inferredAudienceBand: gate.diagnostics.inferredAudienceBandByTitle[candidate.title] || "",
        formatIdentity: gate.diagnostics.formatIdentityByTitle[candidate.title] || "",
        audienceDecision: gate.diagnostics.audienceDecisionByTitle[candidate.title] || "",
        audienceRejectionReason: gate.diagnostics.audienceRejectionReasonByTitle[candidate.title] || "",
        audienceEvidence: gate.diagnostics.audienceEvidenceByTitle[candidate.title] || [],
        formatEvidence: gate.diagnostics.formatEvidenceByTitle[candidate.title] || [],
        recommendationIdentity: gate.diagnostics.recommendationIdentityByTitle[candidate.title] || "",
      };
    }

    rows.push({
      preset: preset.name,
      volumeId: row.volumeId,
      title: analysis.title,
      queries: Array.from(row.queries),
      categories: analysis.categories,
      pageCount: analysis.pageCount,
      publicationShape: analysis.publicationShape,
      shapePassed: analysis.admittedAfterSourcePolicy,
      enteredScoring,
      reason,
      diagnostics: diag,
      descriptionSnippet: String(analysis.description || "").replace(/\s+/g, " ").trim().slice(0, 180),
    });
  }

  const presetSummary = summarizePresetResult(preset.name, rows);
  const shapePassedCount = rows.filter((row) => row.shapePassed).length;
  const rejectedAfterShapeCount = rows.filter((row) => row.shapePassed && !row.enteredScoring).length;
  const enteredScoringCount = rows.filter((row) => row.enteredScoring).length;
  console.log(
    `[${preset.name}] shape-pass=${shapePassedCount} entered-scoring=${enteredScoringCount} rejected-after-shape=${rejectedAfterShapeCount}`,
  );

  presetAudits.push({
    preset: preset.name,
    attemptedQueries,
    uniqueRawCandidates: rows.length,
    publicationShapePassCount: shapePassedCount,
    enteredScoringCount,
    rejectedAfterShapeCount,
    summary: presetSummary,
    rows,
  });
  aggregateRows.push(...rows);
}

const aggregateHistogram = {};
const aggregateExamplesByReason = {};
for (const row of aggregateRows) {
  if (!row.shapePassed || row.enteredScoring) continue;
  pushHistogram(aggregateHistogram, row.reason);
  keepRepresentativeExample(aggregateExamplesByReason, row.reason, {
    preset: row.preset,
    volumeId: row.volumeId,
    title: row.title,
    queries: row.queries,
    categories: row.categories,
    pageCount: row.pageCount,
    publicationShape: row.publicationShape,
    inferredAudienceBand: row.diagnostics.inferredAudienceBand || "",
    formatIdentity: row.diagnostics.formatIdentity || "",
    audienceDecision: row.diagnostics.audienceDecision || "",
    audienceRejectionReason: row.diagnostics.audienceRejectionReason || "",
    audienceEvidence: row.diagnostics.audienceEvidence || [],
    formatEvidence: row.diagnostics.formatEvidence || [],
    recommendationIdentity: row.diagnostics.recommendationIdentity || "",
    descriptionSnippet: row.descriptionSnippet,
  });
}

const totalRejected = Object.values(aggregateHistogram).reduce((sum, count) => sum + Number(count || 0), 0);
const rankedReasons = Object.entries(aggregateHistogram).sort((a, b) => Number(b[1]) - Number(a[1]));

console.log("\n=== K-2 PRE-SCORING REJECTION HISTOGRAM (shape-pass only) ===");
for (const [reason, count] of rankedReasons) {
  const pct = totalRejected > 0 ? Math.round((Number(count) / totalRejected) * 1000) / 10 : 0;
  console.log(`  ${String(count).padStart(3)} (${String(pct).padStart(5)}%)  ${reason}`);
}

console.log("\n=== REPRESENTATIVE EXAMPLES BY REJECTION REASON ===");
for (const [reason, examples] of Object.entries(aggregateExamplesByReason)) {
  console.log(`\n[${reason}]`);
  for (const example of examples) {
    console.log(
      `  - ${example.title} [${example.preset}] | shape=${example.publicationShape} | aud=${example.inferredAudienceBand} | fmt=${example.formatIdentity} | cats=${(example.categories || []).slice(0, 3).join(" ; ") || "none"}`,
    );
  }
}

const outDir = resolve(scriptDir, "output");
mkdirSync(outDir, { recursive: true });
const jsonOut = resolve(outDir, "kids-k2-pre-scoring-rejection-audit.json");
const csvOut = resolve(outDir, "kids-k2-pre-scoring-rejection-audit.csv");

const output = {
  generatedAt: new Date().toISOString(),
  presets: presetAudits.map((preset) => ({
    preset: preset.preset,
    attemptedQueries: preset.attemptedQueries,
    uniqueRawCandidates: preset.uniqueRawCandidates,
    publicationShapePassCount: preset.publicationShapePassCount,
    enteredScoringCount: preset.enteredScoringCount,
    rejectedAfterShapeCount: preset.rejectedAfterShapeCount,
    publicationShapePassRejectedHistogram: preset.summary.publicationShapePassRejectedHistogram,
    representativeExamplesByReason: preset.summary.representativeExamplesByReason,
  })),
  aggregate: {
    totalRows: aggregateRows.length,
    publicationShapePassCount: aggregateRows.filter((row) => row.shapePassed).length,
    enteredScoringCount: aggregateRows.filter((row) => row.enteredScoring).length,
    rejectedAfterShapeCount: totalRejected,
    publicationShapePassRejectedHistogram: aggregateHistogram,
    representativeExamplesByReason: aggregateExamplesByReason,
    dominantReason: rankedReasons[0] ? { reason: rankedReasons[0][0], count: rankedReasons[0][1] } : null,
  },
};
writeFileSync(jsonOut, JSON.stringify(output, null, 2));
console.log(`\nJSON written to: ${jsonOut}`);

const csvHeader = "preset,volumeId,title,queries,publicationShape,categories,pageCount,shapePassed,enteredScoring,reason,inferredAudienceBand,formatIdentity,audienceDecision,audienceRejectionReason,recommendationIdentity,descriptionSnippet";
const csvRows = aggregateRows.map((row) => [
  row.preset,
  row.volumeId,
  `"${String(row.title || "").replace(/"/g, "\"\"")}"`,
  `"${(row.queries || []).join(" | ").replace(/"/g, "\"\"")}"`,
  row.publicationShape,
  `"${(row.categories || []).join(" | ").replace(/"/g, "\"\"")}"`,
  row.pageCount ?? "",
  row.shapePassed ? "true" : "false",
  row.enteredScoring ? "true" : "false",
  row.reason,
  row.diagnostics.inferredAudienceBand || "",
  row.diagnostics.formatIdentity || "",
  row.diagnostics.audienceDecision || "",
  row.diagnostics.audienceRejectionReason || "",
  row.diagnostics.recommendationIdentity || "",
  `"${String(row.descriptionSnippet || "").replace(/"/g, "\"\"")}"`,
].join(","));
writeFileSync(csvOut, [csvHeader, ...csvRows].join("\n"));
console.log(`CSV written to: ${csvOut}`);
