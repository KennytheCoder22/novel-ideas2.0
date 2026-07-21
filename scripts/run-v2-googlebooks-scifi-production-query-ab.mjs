import { createRequire } from "node:module";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { compareVariantRows, extractProductionMetrics } from "./lib/googlebooks-scifi-production-ab.mjs";

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

const localEnv = parseDotEnv(resolve(repoRoot, ".env"));
if (!process.env.EXPO_PUBLIC_GOOGLE_BOOKS_API_KEY && localEnv.EXPO_PUBLIC_GOOGLE_BOOKS_API_KEY) {
  process.env.EXPO_PUBLIC_GOOGLE_BOOKS_API_KEY = localEnv.EXPO_PUBLIC_GOOGLE_BOOKS_API_KEY;
}
if (!process.env.GOOGLE_BOOKS_API_KEY && localEnv.GOOGLE_BOOKS_API_KEY) {
  process.env.GOOGLE_BOOKS_API_KEY = localEnv.GOOGLE_BOOKS_API_KEY;
}

const CURRENT_QUERY = "young adult science fiction novel";
const CANDIDATE_QUERY = "\"young adult\" dystopian novel";
const LIMIT = 6;

const SCIENCE_FICTION_PROFILES = [
  {
    id: "test-c-reconstructed",
    label: "Test C reconstructed",
    ageBand: "teens",
    signals: [
      { action: "like", title: "A Wrinkle in Time", source: "googleBooks", format: "book", tags: ["young heroes", "speculative"], genres: ["science fiction"], themes: ["identity"] },
      { action: "like", title: "Inkheart", source: "googleBooks", format: "book", tags: ["adventure", "worlds"], genres: ["science fiction", "fantasy"], themes: ["family"] },
      { action: "like", title: "The School for Good and Evil", source: "googleBooks", format: "book", tags: ["friendship"], genres: ["science fiction", "fantasy"], tones: ["upbeat"] },
      { action: "dislike", title: "The Hunger Games", source: "googleBooks", format: "book", tags: ["survival"], genres: ["science fiction"], tones: ["bleak"] },
      { action: "dislike", title: "The Giver", source: "googleBooks", format: "book", tags: ["dystopia"], genres: ["science fiction"], tones: ["somber"] },
      { action: "skip", title: "Percy Jackson and the Olympians", source: "googleBooks", format: "book", tags: ["mythology"], genres: ["fantasy"] },
      { action: "skip", title: "Keeper of the Lost Cities", source: "googleBooks", format: "book", tags: ["academy"], genres: ["fantasy"] },
      { action: "skip", title: "One Crazy Summer", source: "googleBooks", format: "book", tags: ["historical"], genres: ["general"] },
    ],
  },
  {
    id: "space-opera-positive",
    label: "Space-opera weighted",
    ageBand: "teens",
    signals: [
      { action: "like", title: "Skyward", source: "googleBooks", format: "book", genres: ["science fiction"], tones: ["adventurous"], themes: ["pilots"] },
      { action: "like", title: "Aurora Rising", source: "googleBooks", format: "book", genres: ["science fiction"], tones: ["fast-paced"], themes: ["found family"] },
      { action: "like", title: "Scythe", source: "googleBooks", format: "book", genres: ["science fiction"], tones: ["tense"] },
      { action: "dislike", title: "Station Eleven", source: "googleBooks", format: "book", genres: ["science fiction"], tones: ["literary"] },
      { action: "skip", title: "Legend", source: "googleBooks", format: "book", genres: ["science fiction"], tones: ["dystopian"] },
    ],
  },
  {
    id: "speculative-mixed",
    label: "Speculative mixed profile",
    ageBand: "teens",
    signals: [
      { action: "like", title: "Cinder", source: "googleBooks", format: "book", genres: ["science fiction"], themes: ["retellings"] },
      { action: "like", title: "The 5th Wave", source: "googleBooks", format: "book", genres: ["science fiction"], tones: ["urgent"] },
      { action: "dislike", title: "Divergent", source: "googleBooks", format: "book", genres: ["science fiction"], tones: ["grim"] },
      { action: "dislike", title: "Maze Runner", source: "googleBooks", format: "book", genres: ["science fiction"], tones: ["dark"] },
      { action: "skip", title: "Shadow and Bone", source: "googleBooks", format: "book", genres: ["fantasy"] },
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

async function runVariant(variant, queryOverride) {
  if (queryOverride) process.env.V2_TEEN_GB_SCIFI_PRIMARY_QUERY_OVERRIDE = queryOverride;
  else delete process.env.V2_TEEN_GB_SCIFI_PRIMARY_QUERY_OVERRIDE;
  const rows = [];
  for (const profile of SCIENCE_FICTION_PROFILES) {
    const result = await runRecommenderV2({
      requestId: `phase2-scifi-ab-${variant}-${profile.id}`,
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
    rows.push(extractProductionMetrics({
      variant,
      profileId: profile.id,
      profileLabel: profile.label,
      result,
      limit: LIMIT,
    }));
  }
  return rows;
}

const baselineRows = await runVariant("baseline", "");
const candidateRows = await runVariant("candidate", CANDIDATE_QUERY);
delete process.env.V2_TEEN_GB_SCIFI_PRIMARY_QUERY_OVERRIDE;

const baselineById = Object.fromEntries(baselineRows.map((row) => [row.profileId, row]));
const candidateById = Object.fromEntries(candidateRows.map((row) => [row.profileId, row]));
const comparisons = SCIENCE_FICTION_PROFILES.map((profile) => compareVariantRows(baselineById[profile.id], candidateById[profile.id]));

const aggregate = comparisons.reduce((acc, row) => {
  acc.acceptedAfterSourcePolicyDelta += row.acceptedAfterSourcePolicyDelta;
  acc.scoredCandidatesDelta += row.scoredCandidatesDelta;
  acc.selectedDelta += row.selectedDelta;
  acc.qualityAverageDelta += row.qualityAverageDelta;
  if (row.fallbackImproved) acc.fallbackImprovedProfiles += 1;
  if (row.underfillCandidate) acc.underfilledCandidateProfiles += 1;
  if (row.meetsPromotionSignals) acc.profilesMeetingPromotionSignals += 1;
  return acc;
}, {
  acceptedAfterSourcePolicyDelta: 0,
  scoredCandidatesDelta: 0,
  selectedDelta: 0,
  qualityAverageDelta: 0,
  fallbackImprovedProfiles: 0,
  underfilledCandidateProfiles: 0,
  profilesMeetingPromotionSignals: 0,
});
aggregate.qualityAverageDelta = Number(aggregate.qualityAverageDelta.toFixed(3));
aggregate.promotionRecommendation =
  aggregate.acceptedAfterSourcePolicyDelta > 0
  && aggregate.profilesMeetingPromotionSignals === comparisons.length
  ? "promote_candidate_query_for_science_fiction"
  : "do_not_promote_candidate_query";

mkdirSync(outDir, { recursive: true });
const jsonOut = resolve(outDir, "googlebooks-scifi-production-query-ab.json");
const csvOut = resolve(outDir, "googlebooks-scifi-production-query-ab.csv");
const summaryOut = resolve(outDir, "googlebooks-scifi-production-query-ab-summary.txt");

writeFileSync(jsonOut, JSON.stringify({
  generatedAt: new Date().toISOString(),
  currentQuery: CURRENT_QUERY,
  candidateQuery: CANDIDATE_QUERY,
  profiles: SCIENCE_FICTION_PROFILES.map(({ id, label }) => ({ id, label })),
  baselineRows,
  candidateRows,
  comparisons,
  aggregate,
}, null, 2));

const csvHeader = [
  "profileId",
  "profileLabel",
  "baselinePrimaryQuery",
  "candidatePrimaryQuery",
  "acceptedAfterSourcePolicyBaseline",
  "acceptedAfterSourcePolicyCandidate",
  "acceptedAfterSourcePolicyDelta",
  "scoredCandidatesBaseline",
  "scoredCandidatesCandidate",
  "scoredCandidatesDelta",
  "selectedBaseline",
  "selectedCandidate",
  "selectedDelta",
  "fallbackUsedBaseline",
  "fallbackUsedCandidate",
  "qualityAverageBaseline",
  "qualityAverageCandidate",
  "qualityAverageDelta",
  "underfillBaseline",
  "underfillCandidate",
  "meetsPromotionSignals",
].join(",");

const csvRows = comparisons.map((row) => [
  row.profileId,
  `"${String(row.profileLabel).replace(/"/g, "\"\"")}"`,
  `"${String(row.baselinePrimaryQuery).replace(/"/g, "\"\"")}"`,
  `"${String(row.candidatePrimaryQuery).replace(/"/g, "\"\"")}"`,
  row.acceptedAfterSourcePolicyBaseline,
  row.acceptedAfterSourcePolicyCandidate,
  row.acceptedAfterSourcePolicyDelta,
  row.scoredCandidatesBaseline,
  row.scoredCandidatesCandidate,
  row.scoredCandidatesDelta,
  row.selectedBaseline,
  row.selectedCandidate,
  row.selectedDelta,
  row.fallbackUsedBaseline,
  row.fallbackUsedCandidate,
  row.qualityAverageBaseline,
  row.qualityAverageCandidate,
  row.qualityAverageDelta,
  row.underfillBaseline,
  row.underfillCandidate,
  row.meetsPromotionSignals,
].join(","));
writeFileSync(csvOut, `${csvHeader}\n${csvRows.join("\n")}\n`);

const summaryLines = [
  "Google Books Science Fiction production query A/B",
  `Current query: ${CURRENT_QUERY}`,
  `Candidate query: ${CANDIDATE_QUERY}`,
  "",
  ...comparisons.map((row) => (
    `${row.profileId}: accepted ${row.acceptedAfterSourcePolicyBaseline} -> ${row.acceptedAfterSourcePolicyCandidate} `
    + `(Δ ${row.acceptedAfterSourcePolicyDelta >= 0 ? "+" : ""}${row.acceptedAfterSourcePolicyDelta}), `
    + `scored ${row.scoredCandidatesBaseline} -> ${row.scoredCandidatesCandidate}, `
    + `selected ${row.selectedBaseline} -> ${row.selectedCandidate}, `
    + `fallback ${row.fallbackUsedBaseline} -> ${row.fallbackUsedCandidate}, `
    + `quality ${row.qualityAverageBaseline} -> ${row.qualityAverageCandidate}`
  )),
  "",
  `Aggregate accepted-after-source-policy delta: ${aggregate.acceptedAfterSourcePolicyDelta}`,
  `Aggregate scored-candidates delta: ${aggregate.scoredCandidatesDelta}`,
  `Aggregate selected delta: ${aggregate.selectedDelta}`,
  `Aggregate quality-average delta: ${aggregate.qualityAverageDelta}`,
  `Promotion recommendation: ${aggregate.promotionRecommendation}`,
];
writeFileSync(summaryOut, `${summaryLines.join("\n")}\n`);

console.log(`Wrote ${jsonOut}`);
console.log(`Wrote ${csvOut}`);
console.log(`Wrote ${summaryOut}`);

