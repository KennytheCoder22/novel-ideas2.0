import { createRequire } from "node:module";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildPublicationIdentityRuleHistogram,
  buildShapeDistribution,
  chooseBestSingleRule,
  isLikelyLegitimateNarrative,
  simulateSingleRuleRelaxations,
  summarizeRuleLoss,
} from "./lib/googlebooks-general-publication-identity-diagnostic.mjs";

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
const {
  analyzeGoogleBooksVolumeForAudit,
  queryFamilyFromQuery,
} = require(resolve(repoRoot, "app/recommender-v2/sources/googleBooksSource.ts"));

const GOOGLE_BOOKS_API_BASE = "https://www.googleapis.com/books/v1/volumes";
const localEnv = parseDotEnv(resolve(repoRoot, ".env"));
if (!process.env.EXPO_PUBLIC_GOOGLE_BOOKS_API_KEY && localEnv.EXPO_PUBLIC_GOOGLE_BOOKS_API_KEY) {
  process.env.EXPO_PUBLIC_GOOGLE_BOOKS_API_KEY = localEnv.EXPO_PUBLIC_GOOGLE_BOOKS_API_KEY;
}
if (!process.env.GOOGLE_BOOKS_API_KEY && localEnv.GOOGLE_BOOKS_API_KEY) {
  process.env.GOOGLE_BOOKS_API_KEY = localEnv.GOOGLE_BOOKS_API_KEY;
}
const GOOGLE_BOOKS_API_KEY =
  process.env.EXPO_PUBLIC_GOOGLE_BOOKS_API_KEY ||
  process.env.GOOGLE_BOOKS_API_KEY ||
  "";

const LIMIT = 6;
const GENERAL_PROFILES = [
  {
    id: "general-contemporary-core",
    label: "General contemporary core",
    ageBand: "teens",
    signals: [
      { action: "like", title: "To All the Boys I've Loved Before", source: "googleBooks", format: "book", genres: ["general"], tones: ["warm"] },
      { action: "like", title: "Eleanor & Park", source: "googleBooks", format: "book", genres: ["fiction"], themes: ["relationships"] },
      { action: "like", title: "The Hate U Give", source: "googleBooks", format: "book", genres: ["fiction"], themes: ["social issues"] },
      { action: "dislike", title: "Lord of the Flies", source: "googleBooks", format: "book", tones: ["bleak"] },
      { action: "skip", title: "Percy Jackson and the Olympians", source: "googleBooks", format: "book", genres: ["fantasy"] },
    ],
  },
  {
    id: "general-coming-of-age",
    label: "General coming-of-age",
    ageBand: "teens",
    signals: [
      { action: "like", title: "The Perks of Being a Wallflower", source: "googleBooks", format: "book", genres: ["fiction"], tones: ["introspective"] },
      { action: "like", title: "The Poet X", source: "googleBooks", format: "book", genres: ["fiction"], themes: ["identity"] },
      { action: "like", title: "I'll Give You the Sun", source: "googleBooks", format: "book", genres: ["fiction"], themes: ["family"] },
      { action: "dislike", title: "1984", source: "googleBooks", format: "book", genres: ["science fiction"] },
      { action: "skip", title: "The Maze Runner", source: "googleBooks", format: "book", genres: ["science fiction"] },
    ],
  },
  {
    id: "general-realistic-fiction",
    label: "General realistic fiction",
    ageBand: "teens",
    signals: [
      { action: "like", title: "Looking for Alaska", source: "googleBooks", format: "book", genres: ["fiction"], tones: ["reflective"] },
      { action: "like", title: "Fangirl", source: "googleBooks", format: "book", genres: ["fiction"], themes: ["self-discovery"] },
      { action: "like", title: "Turtles All the Way Down", source: "googleBooks", format: "book", genres: ["fiction"], themes: ["mental health"] },
      { action: "dislike", title: "Dune", source: "googleBooks", format: "book", genres: ["science fiction"] },
      { action: "skip", title: "Cinder", source: "googleBooks", format: "book", genres: ["science fiction"] },
    ],
  },
];

function parseDotEnv(path) {
  try {
    const raw = readFileSync(path, "utf8");
    const out = {};
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const idx = trimmed.indexOf("=");
      if (idx <= 0) continue;
      const key = trimmed.slice(0, idx).trim();
      const value = trimmed.slice(idx + 1).trim();
      out[key] = value;
    }
    return out;
  } catch {
    return {};
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(url, label) {
  const maxAttempts = 10;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const response = await fetch(url);
    if (response.ok) return response;
    const retryable = [429, 500, 502, 503, 504].includes(Number(response.status));
    if (!retryable || attempt === maxAttempts) {
      throw new Error(`Google Books fetch failed (${response.status}) for ${label}`);
    }
    await sleep(1500 * attempt + Math.floor(Math.random() * 250));
  }
  throw new Error(`Google Books fetch failed (retry_exhausted) for ${label}`);
}

async function fetchTop100Volumes(query) {
  const items = [];
  for (const startIndex of [0, 20, 40, 60, 80]) {
    const url = new URL(GOOGLE_BOOKS_API_BASE);
    url.searchParams.set("q", query);
    url.searchParams.set("startIndex", String(startIndex));
    url.searchParams.set("maxResults", "20");
    url.searchParams.set("printType", "books");
    if (GOOGLE_BOOKS_API_KEY) url.searchParams.set("key", GOOGLE_BOOKS_API_KEY);
    const response = await fetchWithRetry(url.toString(), `${query}:${startIndex}`);
    const payload = await response.json();
    const batch = Array.isArray(payload?.items) ? payload.items : [];
    items.push(...batch);
    await sleep(300);
  }
  return items.slice(0, 100);
}

function extractPrimaryGeneralQuery(result) {
  const diagnostics = (result && result.diagnostics) || {};
  const googleBooksSource = Array.isArray(diagnostics.sources)
    ? diagnostics.sources.find((source) => source && source.source === "googleBooks")
    : undefined;
  const fetches = Array.isArray(googleBooksSource?.fetches) ? googleBooksSource.fetches : [];
  const primary = fetches.find((row) => Number(row?.queryCascadeIndex) === 0) || fetches[0];
  const primaryQuery = String(primary?.originalPlannedQuery || primary?.query || "").trim();
  if (primaryQuery && queryFamilyFromQuery(primaryQuery) === "general") return primaryQuery;
  const anyGeneral = fetches.find((row) => {
    const query = String(row?.originalPlannedQuery || row?.query || "").trim();
    return query && queryFamilyFromQuery(query) === "general";
  });
  return String(anyGeneral?.originalPlannedQuery || anyGeneral?.query || "").trim();
}

async function runProductionProfiles() {
  const rows = [];
  for (const profile of GENERAL_PROFILES) {
    const result = await runRecommenderV2({
      requestId: `phase2-general-publication-identity-${profile.id}`,
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
    const diagnostics = result?.diagnostics || {};
    const googleBooksSource = Array.isArray(diagnostics.sources)
      ? diagnostics.sources.find((source) => source && source.source === "googleBooks")
      : {};
    const primaryGeneralQuery = extractPrimaryGeneralQuery(result);
    const perQueryQuality = (googleBooksSource?.googleBooksQueryResultQualityByQuery || {});
    rows.push({
      profileId: profile.id,
      profileLabel: profile.label,
      primaryGeneralQuery,
      totalScored: Number((diagnostics?.stages || []).find((stage) => stage?.stage === "scored")?.counts?.scored || 0),
      selectedCount: Array.isArray(result?.items) ? result.items.length : 0,
      perQueryQuality,
    });
  }
  return rows;
}

const productionRows = await runProductionProfiles();
const primaryQueryCounts = {};
for (const row of productionRows) {
  if (!row.primaryGeneralQuery) continue;
  primaryQueryCounts[row.primaryGeneralQuery] = Number(primaryQueryCounts[row.primaryGeneralQuery] || 0) + 1;
}
const productionPrimaryGeneralQuery = Object.entries(primaryQueryCounts)
  .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))[0]?.[0] || "young adult contemporary fiction novel";

const aggregatedRejectionReasons = {};
let baselinePublicationPasses = 0;
let baselineNarrativeCandidates = 0;
let baselineRawResults = 0;
for (const row of productionRows) {
  const quality = row.perQueryQuality?.[productionPrimaryGeneralQuery] || {};
  baselinePublicationPasses += Number(quality.acceptedCandidateCount || 0);
  baselineNarrativeCandidates += Number(quality.narrativeCandidateCount || 0);
  baselineRawResults += Number(quality.totalResults || 0);
  const reasons = quality.rejectionReasons || {};
  for (const [reason, count] of Object.entries(reasons)) {
    aggregatedRejectionReasons[reason] = Number(aggregatedRejectionReasons[reason] || 0) + Number(count || 0);
  }
}

const publicationRuleHistogram = buildPublicationIdentityRuleHistogram(
  { [productionPrimaryGeneralQuery]: aggregatedRejectionReasons },
  productionPrimaryGeneralQuery,
);
const publicationLossSummary = summarizeRuleLoss(publicationRuleHistogram);
const majorRules = publicationLossSummary.rows.slice(0, 5).map((row) => row.rule);

const rawTop100 = await fetchTop100Volumes(productionPrimaryGeneralQuery);
const analyzedTop100 = rawTop100
  .map((item) => analyzeGoogleBooksVolumeForAudit((item && item.volumeInfo) || {}, item || {}))
  .map((analysis) => ({
    ...analysis,
    likelyLegitimateNarrative: isLikelyLegitimateNarrative(analysis),
  }));

const rejectedByPublicationIdentity = analyzedTop100.filter((row) => String(row.publicationShapeDropReason || ""));
const falseRejects = rejectedByPublicationIdentity.filter((row) => row.likelyLegitimateNarrative);
const simulations = simulateSingleRuleRelaxations({
  rows: analyzedTop100,
  baselinePassCount: baselinePublicationPasses,
  topRules: majorRules,
});
const bestRule = chooseBestSingleRule(simulations);
const shapeDistribution = buildShapeDistribution(analyzedTop100);

mkdirSync(outDir, { recursive: true });
const jsonOut = resolve(outDir, "googlebooks-general-publication-identity-diagnostic.json");
const csvOut = resolve(outDir, "googlebooks-general-publication-identity-diagnostic.csv");
const summaryOut = resolve(outDir, "googlebooks-general-publication-identity-summary.txt");

const output = {
  generatedAt: new Date().toISOString(),
  productionPrimaryGeneralQuery,
  productionProfiles: productionRows.map((row) => ({
    profileId: row.profileId,
    profileLabel: row.profileLabel,
    primaryGeneralQuery: row.primaryGeneralQuery,
    selectedCount: row.selectedCount,
    totalScored: row.totalScored,
  })),
  productionBaseline: {
    rawApiResults: baselineRawResults,
    narrativeCandidates: baselineNarrativeCandidates,
    publicationPasses: baselinePublicationPasses,
    publicationRuleHistogram,
    publicationLossSummary,
  },
  top100Replay: {
    query: productionPrimaryGeneralQuery,
    rawCount: analyzedTop100.length,
    shapeDistribution,
    publicationIdentityRejectedCount: rejectedByPublicationIdentity.length,
    likelyFalseRejectCount: falseRejects.length,
    likelyFalseRejectTitles: falseRejects.slice(0, 40).map((row) => row.title),
  },
  singleRuleRelaxationSimulations: simulations,
  recommendedSingleRuleExperiment: bestRule || null,
};

writeFileSync(jsonOut, JSON.stringify(output, null, 2));

const csvHeader = [
  "rule",
  "baselinePublicationPasses",
  "simulatedPublicationPasses",
  "additionalCandidates",
  "likelyNarrativeAdds",
  "likelyFalseAcceptAdds",
  "falseAcceptRatePct",
  "publicationPassLiftPct",
].join(",");
const csvRows = simulations.map((row) => [
  row.relaxedRule,
  row.baselinePublicationPasses,
  row.simulatedPublicationPasses,
  row.additionalCandidates,
  row.likelyNarrativeAdds,
  row.likelyFalseAcceptAdds,
  row.falseAcceptRatePct,
  row.publicationPassLiftPct,
].join(","));
writeFileSync(csvOut, `${csvHeader}\n${csvRows.join("\n")}\n`);

const summaryLines = [
  "Google Books General publication-identity diagnostic",
  `Primary General query: ${productionPrimaryGeneralQuery}`,
  `Production baseline raw: ${baselineRawResults}`,
  `Production baseline publication passes: ${baselinePublicationPasses}`,
  `Production baseline narrative candidates: ${baselineNarrativeCandidates}`,
  `Replay top100 publication-identity rejects: ${rejectedByPublicationIdentity.length}`,
  `Replay top100 likely false rejects: ${falseRejects.length}`,
  "",
  "Top publication-identity loss rules:",
  ...publicationLossSummary.rows.slice(0, 5).map((row) => `- ${row.rule}: ${row.rejectedCount} (${row.rejectedPct}%)`),
  "",
  "Single-rule relaxation simulations:",
  ...simulations.map((row) =>
    `- ${row.relaxedRule}: +${row.additionalCandidates} candidates, likely_false_accept +${row.likelyFalseAcceptAdds}, false_accept_rate ${row.falseAcceptRatePct}%`,
  ),
  "",
  `Recommended first experiment: ${bestRule ? bestRule.relaxedRule : "none"}`,
];
writeFileSync(summaryOut, `${summaryLines.join("\n")}\n`);

console.log(`Wrote ${jsonOut}`);
console.log(`Wrote ${csvOut}`);
console.log(`Wrote ${summaryOut}`);
