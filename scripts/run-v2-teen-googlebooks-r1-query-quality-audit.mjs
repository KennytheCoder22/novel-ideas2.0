import { createRequire } from "node:module";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { TEEN_AUDIT_PROFILES } from "./lib/teen-googlebooks-audit-profiles.mjs";

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

const ROUNDS = 4;
const LIMIT = 10;
const BASELINE_QUERY = "young adult science fiction novel";
const QUERY_CANDIDATES = [
  BASELINE_QUERY,
  "YA science fiction",
  "young adult sci fi",
  "teen science fiction",
  "young adult dystopian fiction",
  "YA dystopian",
  "YA speculative fiction",
  "YA space opera",
  "science fiction for teens",
];

const SCIENCE_FICTION_PROFILES = TEEN_AUDIT_PROFILES
  .filter((profile) => String(profile.family || "").trim() === "science_fiction")
  .map((profile) => ({
    id: profile.id,
    label: profile.label,
    ageBand: profile.ageBand,
    signals: profile.signals,
  }));

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

function asNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function titleKey(value) {
  return String(value || "").trim().toLowerCase();
}

function round2(value) {
  return Number(value.toFixed(2));
}

function stats(values) {
  const nums = values.map((value) => asNumber(value));
  if (nums.length === 0) {
    return { mean: 0, min: 0, max: 0, stddev: 0 };
  }
  const mean = nums.reduce((sum, value) => sum + value, 0) / nums.length;
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const variance = nums.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / nums.length;
  const stddev = Math.sqrt(variance);
  return {
    mean: round2(mean),
    min: round2(min),
    max: round2(max),
    stddev: round2(stddev),
  };
}

function extractQueryRejectedHistogram(query, preNormalizationRejectAuditRows) {
  const histogram = {};
  for (const row of asArray(preNormalizationRejectAuditRows)) {
    const rejectQuery = String(asObject(row).query || "");
    if (rejectQuery !== query) continue;
    const reason = String(asObject(row).exactRejectionReason || "").trim() || "unknown_reject_reason";
    histogram[reason] = asNumber(histogram[reason]) + 1;
  }
  return histogram;
}

function extractRunRow({ queryOverride, roundIndex, profileId, profileLabel, result }) {
  const diagnostics = asObject(asObject(result).diagnostics);
  const sources = asArray(diagnostics.sources);
  const googleBooks = asObject(sources.find((source) => asObject(source).source === "googleBooks"));
  const fetches = asArray(googleBooks.fetches);
  const primaryFetch = asObject(fetches.find((fetch) => asNumber(asObject(fetch).queryCascadeIndex) === 0) || fetches[0] || {});
  const primaryQuery = String(primaryFetch.query || "");
  const rawApiCount = asNumber(primaryFetch.rawApiCount);
  const acceptedAfterSourcePolicy = asNumber(primaryFetch.acceptedAfterSourcePolicy);
  const rejectedCount = Math.max(0, rawApiCount - acceptedAfterSourcePolicy);
  const acceptanceRatePct = rawApiCount > 0 ? round2((acceptedAfterSourcePolicy / rawApiCount) * 100) : 0;

  const queryQualityByQuery = asObject(googleBooks.googleBooksQueryResultQualityByQuery);
  const primaryQuality = asObject(queryQualityByQuery[primaryQuery]);
  const primaryTitles = asArray(primaryQuality.titles).map((title) => String(title || "").trim()).filter(Boolean);
  const normalizedCandidates = asNumber(primaryQuality.enteredRankingCount);
  const preNormalizationRejectAuditRows = asArray(googleBooks.googleBooksPreNormalizationRejectAuditRows);

  const queryByTitle = asObject(googleBooks.googleBooksQueryByTitle);
  const selectedItems = asArray(asObject(result).items);
  const selectedFromPrimaryQuery = selectedItems.filter((item) => {
    const title = String(asObject(item).title || "");
    return String(queryByTitle[title] || queryByTitle[titleKey(title)] || "") === primaryQuery;
  }).length;

  const classByTitle = asObject(googleBooks.teenGoogleBooksMeaningfulTasteClassificationByTitle);
  const narrativeTitleKeys = new Set();
  const decisionWorthyTitleKeys = new Set();
  for (const title of primaryTitles) {
    const key = titleKey(title);
    if (!key) continue;
    narrativeTitleKeys.add(key);
    const classification = String(classByTitle[title] || classByTitle[key] || "").trim().toLowerCase();
    if (classification === "strong_match" || classification === "defensible_secondary_match") {
      decisionWorthyTitleKeys.add(key);
    }
  }

  return {
    round: roundIndex,
    queryCandidate: queryOverride,
    primaryQuery,
    profileId,
    profileLabel,
    rawApiCount,
    acceptedAfterSourcePolicy,
    acceptanceRatePct,
    rejectedBeforeNormalization: rejectedCount,
    rejectionHistogram: extractQueryRejectedHistogram(primaryQuery, preNormalizationRejectAuditRows),
    normalizedCandidates,
    recommendationContributionCount: selectedFromPrimaryQuery,
    uniqueNarrativeFictionYield: narrativeTitleKeys.size,
    uniqueDecisionWorthyNarrativeYield: decisionWorthyTitleKeys.size,
    selectedCount: selectedItems.length,
  };
}

function summarizeRows(runRows) {
  const byQuery = new Map();
  for (const row of runRows) {
    if (!byQuery.has(row.queryCandidate)) byQuery.set(row.queryCandidate, []);
    byQuery.get(row.queryCandidate).push(row);
  }

  const querySummaries = [];
  for (const queryCandidate of QUERY_CANDIDATES) {
    const rows = byQuery.get(queryCandidate) || [];
    const rejectionHistogram = {};
    for (const row of rows) {
      for (const [reason, count] of Object.entries(asObject(row.rejectionHistogram))) {
        rejectionHistogram[reason] = asNumber(rejectionHistogram[reason]) + asNumber(count);
      }
    }

    const roundsMap = new Map();
    for (const row of rows) {
      if (!roundsMap.has(row.round)) roundsMap.set(row.round, []);
      roundsMap.get(row.round).push(row);
    }
    const roundAggregates = Array.from(roundsMap.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([round, roundRows]) => ({
        round,
        rawApiCount: roundRows.reduce((sum, row) => sum + row.rawApiCount, 0),
        acceptedAfterSourcePolicy: roundRows.reduce((sum, row) => sum + row.acceptedAfterSourcePolicy, 0),
        normalizedCandidates: roundRows.reduce((sum, row) => sum + row.normalizedCandidates, 0),
        recommendationContributionCount: roundRows.reduce((sum, row) => sum + row.recommendationContributionCount, 0),
        uniqueNarrativeFictionYield: roundRows.reduce((sum, row) => sum + row.uniqueNarrativeFictionYield, 0),
        uniqueDecisionWorthyNarrativeYield: roundRows.reduce((sum, row) => sum + row.uniqueDecisionWorthyNarrativeYield, 0),
      }));

    querySummaries.push({
      queryCandidate,
      runs: rows.length,
      rawRetrieval: stats(rows.map((row) => row.rawApiCount)),
      publicationIdentityAccepted: stats(rows.map((row) => row.acceptedAfterSourcePolicy)),
      acceptanceRatePct: stats(rows.map((row) => row.acceptanceRatePct)),
      normalizedCandidates: stats(rows.map((row) => row.normalizedCandidates)),
      recommendationContributionCount: stats(rows.map((row) => row.recommendationContributionCount)),
      uniqueNarrativeFictionYield: stats(rows.map((row) => row.uniqueNarrativeFictionYield)),
      uniqueDecisionWorthyNarrativeYield: stats(rows.map((row) => row.uniqueDecisionWorthyNarrativeYield)),
      rejectionHistogram,
      roundAggregates,
      stability: {
        acceptedStdDevAcrossRounds: stats(roundAggregates.map((row) => row.acceptedAfterSourcePolicy)).stddev,
        narrativeYieldStdDevAcrossRounds: stats(roundAggregates.map((row) => row.uniqueNarrativeFictionYield)).stddev,
        contributionStdDevAcrossRounds: stats(roundAggregates.map((row) => row.recommendationContributionCount)).stddev,
      },
    });
  }
  return querySummaries;
}

function buildRanking(summaryRows) {
  return [...summaryRows]
    .sort((a, b) => {
      if (b.uniqueDecisionWorthyNarrativeYield.mean !== a.uniqueDecisionWorthyNarrativeYield.mean) {
        return b.uniqueDecisionWorthyNarrativeYield.mean - a.uniqueDecisionWorthyNarrativeYield.mean;
      }
      if (b.publicationIdentityAccepted.mean !== a.publicationIdentityAccepted.mean) {
        return b.publicationIdentityAccepted.mean - a.publicationIdentityAccepted.mean;
      }
      return b.recommendationContributionCount.mean - a.recommendationContributionCount.mean;
    })
    .map((row, index) => ({
      rank: index + 1,
      queryCandidate: row.queryCandidate,
      decisionWorthyYieldMean: row.uniqueDecisionWorthyNarrativeYield.mean,
      publicationIdentityAcceptedMean: row.publicationIdentityAccepted.mean,
      recommendationContributionMean: row.recommendationContributionCount.mean,
      acceptanceRateMeanPct: row.acceptanceRatePct.mean,
      acceptedStdDevAcrossRounds: row.stability.acceptedStdDevAcrossRounds,
    }));
}

async function run() {
  const runRows = [];

  for (let round = 1; round <= ROUNDS; round += 1) {
    for (const queryCandidate of QUERY_CANDIDATES) {
      process.env.V2_TEEN_GB_SCIFI_PRIMARY_QUERY_OVERRIDE = queryCandidate;
      for (const profile of SCIENCE_FICTION_PROFILES) {
        const result = await runRecommenderV2({
          requestId: `gbr1-q-quality-r${round}-${queryCandidate}-${profile.id}`.replace(/[^a-zA-Z0-9-_]/g, "_"),
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
        runRows.push(extractRunRow({
          queryOverride: queryCandidate,
          roundIndex: round,
          profileId: profile.id,
          profileLabel: profile.label,
          result,
        }));
      }
    }
  }
  delete process.env.V2_TEEN_GB_SCIFI_PRIMARY_QUERY_OVERRIDE;

  const querySummaries = summarizeRows(runRows);
  const ranking = buildRanking(querySummaries);

  mkdirSync(outDir, { recursive: true });
  const jsonOut = resolve(outDir, "teen-gb-r1-query-quality-audit-phase1.json");
  const csvOut = resolve(outDir, "teen-gb-r1-query-quality-audit-phase1.csv");
  const summaryOut = resolve(outDir, "teen-gb-r1-query-quality-audit-phase1-summary.txt");

  writeFileSync(jsonOut, JSON.stringify({
    generatedAt: new Date().toISOString(),
    rounds: ROUNDS,
    profiles: SCIENCE_FICTION_PROFILES.map((profile) => ({ id: profile.id, label: profile.label })),
    queryCandidates: QUERY_CANDIDATES,
    baselineQuery: BASELINE_QUERY,
    runRows,
    querySummaries,
    ranking,
  }, null, 2));

  const csvHeader = [
    "round",
    "queryCandidate",
    "primaryQuery",
    "profileId",
    "rawApiCount",
    "acceptedAfterSourcePolicy",
    "acceptanceRatePct",
    "rejectedBeforeNormalization",
    "normalizedCandidates",
    "recommendationContributionCount",
    "uniqueNarrativeFictionYield",
    "uniqueDecisionWorthyNarrativeYield",
    "selectedCount",
  ].join(",");
  const csvRows = runRows.map((row) => [
    row.round,
    `"${String(row.queryCandidate).replace(/"/g, "\"\"")}"`,
    `"${String(row.primaryQuery).replace(/"/g, "\"\"")}"`,
    row.profileId,
    row.rawApiCount,
    row.acceptedAfterSourcePolicy,
    row.acceptanceRatePct,
    row.rejectedBeforeNormalization,
    row.normalizedCandidates,
    row.recommendationContributionCount,
    row.uniqueNarrativeFictionYield,
    row.uniqueDecisionWorthyNarrativeYield,
    row.selectedCount,
  ].join(","));
  writeFileSync(csvOut, `${csvHeader}\n${csvRows.join("\n")}\n`);

  const best = ranking[0] || null;
  const baselineSummary = querySummaries.find((row) => row.queryCandidate === BASELINE_QUERY);
  const summaryLines = [
    "Teen GB-R1 Query Quality Audit (Phase 1)",
    `Rounds: ${ROUNDS}`,
    `Profiles per query per round: ${SCIENCE_FICTION_PROFILES.length}`,
    `Query candidates: ${QUERY_CANDIDATES.length}`,
    "",
    `Baseline query: ${BASELINE_QUERY}`,
    baselineSummary
      ? `Baseline means -> accepted=${baselineSummary.publicationIdentityAccepted.mean}, acceptanceRate=${baselineSummary.acceptanceRatePct.mean}%, narrativeYield=${baselineSummary.uniqueNarrativeFictionYield.mean}, decisionWorthyYield=${baselineSummary.uniqueDecisionWorthyNarrativeYield.mean}, contribution=${baselineSummary.recommendationContributionCount.mean}`
      : "Baseline means -> unavailable",
    "",
    "Top candidates by decision-worthy narrative yield:",
    ...ranking.slice(0, 5).map((row) => (
      `${row.rank}. ${row.queryCandidate} | decisionWorthy=${row.decisionWorthyYieldMean}, accepted=${row.publicationIdentityAcceptedMean}, contribution=${row.recommendationContributionMean}, acceptanceRate=${row.acceptanceRateMeanPct}%`
    )),
    "",
    best ? `Current top candidate: ${best.queryCandidate}` : "Current top candidate: unavailable",
  ];
  writeFileSync(summaryOut, `${summaryLines.join("\n")}\n`);

  console.log(`Wrote ${jsonOut}`);
  console.log(`Wrote ${csvOut}`);
  console.log(`Wrote ${summaryOut}`);
}

await run();
