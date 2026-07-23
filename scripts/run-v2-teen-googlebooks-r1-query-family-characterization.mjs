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
const SUBGENRES = [
  "Space Opera",
  "Dystopian",
  "Time Travel",
  "First Contact",
  "Artificial Intelligence",
  "Cyberpunk",
  "Military SF",
  "Near Future",
  "Post-apocalyptic",
  "General speculative",
  "Other",
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

function text(v) {
  return String(v || "").trim();
}

function key(v) {
  return text(v).toLowerCase();
}

function round2(value) {
  return Number(value.toFixed(2));
}

function round4(value) {
  return Number(value.toFixed(4));
}

function stats(values) {
  const nums = values.map((value) => asNumber(value));
  if (nums.length === 0) return { mean: 0, min: 0, max: 0, stddev: 0 };
  const mean = nums.reduce((sum, value) => sum + value, 0) / nums.length;
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const variance = nums.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / nums.length;
  return { mean: round2(mean), min: round2(min), max: round2(max), stddev: round2(Math.sqrt(variance)) };
}

function incCounter(map, field, amount = 1) {
  map[field] = asNumber(map[field]) + amount;
}

function mergeHistogram(target, source) {
  for (const [name, count] of Object.entries(asObject(source))) {
    target[name] = asNumber(target[name]) + asNumber(count);
  }
}

function shannonEntropy(histogram) {
  const counts = Object.values(asObject(histogram)).map((v) => asNumber(v)).filter((v) => v > 0);
  const total = counts.reduce((sum, v) => sum + v, 0);
  if (!total) return { entropy: 0, normalizedEntropy: 0 };
  let entropy = 0;
  for (const count of counts) {
    const p = count / total;
    entropy += -p * Math.log2(p);
  }
  const maxEntropy = Math.log2(SUBGENRES.length);
  return {
    entropy: round4(entropy),
    normalizedEntropy: maxEntropy > 0 ? round4(entropy / maxEntropy) : 0,
  };
}

function jaccard(setA, setB) {
  const a = new Set(setA);
  const b = new Set(setB);
  if (!a.size && !b.size) return 1;
  let intersection = 0;
  for (const v of a) if (b.has(v)) intersection += 1;
  const union = a.size + b.size - intersection;
  return union > 0 ? intersection / union : 0;
}

function extractQueryRejectedHistogram(query, preNormalizationRejectAuditRows) {
  const histogram = {};
  for (const row of asArray(preNormalizationRejectAuditRows)) {
    const rejectQuery = text(asObject(row).query);
    if (rejectQuery !== query) continue;
    const reason = text(asObject(row).exactRejectionReason) || "unknown_reject_reason";
    incCounter(histogram, reason);
  }
  return histogram;
}

function normalizedTitleSet(values) {
  const set = new Set();
  for (const value of asArray(values)) {
    const k = key(value);
    if (k) set.add(k);
  }
  return set;
}

function subgenreFromSignals(signalsText) {
  const s = key(signalsText);
  if (!s) return "Other";
  if (s.includes("space opera") || s.includes("starship") || s.includes("space crew") || s.includes("interstellar")) return "Space Opera";
  if (s.includes("dystop")) return "Dystopian";
  if (s.includes("time travel") || s.includes("time loop") || s.includes("timeline")) return "Time Travel";
  if (s.includes("first contact") || s.includes("alien contact") || s.includes("alien encounter")) return "First Contact";
  if (s.includes("artificial intelligence") || s.includes(" ai ") || s.startsWith("ai ") || s.endsWith(" ai") || s.includes("robot") || s.includes("android")) return "Artificial Intelligence";
  if (s.includes("cyberpunk") || s.includes("cyber ") || s.includes("hacker") || s.includes("virtual reality")) return "Cyberpunk";
  if (s.includes("military") || s.includes("fleet") || s.includes("war") || s.includes("strategy")) return "Military SF";
  if (s.includes("near future") || s.includes("speculative")) return "Near Future";
  if (s.includes("post-apocalyptic") || s.includes("post apocalyptic") || s.includes("apocalypse")) return "Post-apocalyptic";
  if (s.includes("science fiction") || s.includes("sci fi") || s.includes("science-fiction")) return "General speculative";
  return "Other";
}

function subgenreForTitle({ title, queryHint, categoriesByTitle, genreSignalsByTitle, themeSignalsByTitle, toneSignalsByTitle }) {
  const titleValue = text(title);
  const titleKey = key(titleValue);
  const categories = asArray(categoriesByTitle[titleValue] || categoriesByTitle[titleKey]).map(text).filter(Boolean);
  const genreSignals = asArray(genreSignalsByTitle[titleValue] || genreSignalsByTitle[titleKey]).map(text).filter(Boolean);
  const themeSignals = asArray(themeSignalsByTitle[titleValue] || themeSignalsByTitle[titleKey]).map(text).filter(Boolean);
  const toneSignals = asArray(toneSignalsByTitle[titleValue] || toneSignalsByTitle[titleKey]).map(text).filter(Boolean);
  const merged = [titleValue, ...categories, ...genreSignals, ...themeSignals, ...toneSignals].join(" ");
  const signalDerived = subgenreFromSignals(merged);
  if (signalDerived !== "Other") return signalDerived;
  return subgenreFromSignals(`${text(queryHint)} ${titleValue}`);
}

function extractRunRow({ queryOverride, roundIndex, profileId, profileLabel, result }) {
  const diagnostics = asObject(asObject(result).diagnostics);
  const sources = asArray(diagnostics.sources);
  const googleBooks = asObject(sources.find((source) => asObject(source).source === "googleBooks"));
  const fetches = asArray(googleBooks.fetches);
  const primaryFetch = asObject(fetches.find((fetch) => asNumber(asObject(fetch).queryCascadeIndex) === 0) || fetches[0] || {});
  const primaryQuery = text(primaryFetch.query);
  const rawApiCount = asNumber(primaryFetch.rawApiCount);
  const acceptedAfterSourcePolicy = asNumber(primaryFetch.acceptedAfterSourcePolicy);
  const rejectedCount = Math.max(0, rawApiCount - acceptedAfterSourcePolicy);
  const acceptanceRatePct = rawApiCount > 0 ? round2((acceptedAfterSourcePolicy / rawApiCount) * 100) : 0;

  const queryQualityByQuery = asObject(googleBooks.googleBooksQueryResultQualityByQuery);
  const primaryQuality = asObject(queryQualityByQuery[primaryQuery]);
  const primaryTitles = asArray(primaryQuality.titles).map(text).filter(Boolean);
  const normalizedCandidates = asNumber(primaryQuality.enteredRankingCount);
  const preNormalizationRejectAuditRows = asArray(googleBooks.googleBooksPreNormalizationRejectAuditRows);
  const creatorsByTitle = asObject(googleBooks.googleBooksCreatorsByTitle);
  const categoriesByTitle = asObject(googleBooks.googleBooksCategoriesByTitle);

  const genreSignalsByTitle = asObject(googleBooks.teenGoogleBooksGenreSignalsByTitle);
  const themeSignalsByTitle = asObject(googleBooks.teenGoogleBooksThemeSignalsByTitle);
  const toneSignalsByTitle = asObject(googleBooks.teenGoogleBooksToneSignalsByTitle);
  const queryByTitle = asObject(googleBooks.googleBooksQueryByTitle);
  const selectedItems = asArray(asObject(result).items);
  const contributingTitles = selectedItems
    .map((item) => text(asObject(item).title))
    .filter((title) => title && text(queryByTitle[title] || queryByTitle[key(title)]) === primaryQuery);

  const acceptedTitleSet = normalizedTitleSet(primaryTitles);
  const contributingTitleSet = normalizedTitleSet(contributingTitles);
  const duplicateRate = primaryTitles.length > 0 ? round4(1 - (acceptedTitleSet.size / primaryTitles.length)) : 0;

  const acceptedSubgenreHistogram = {};
  for (const title of primaryTitles) {
    incCounter(acceptedSubgenreHistogram, subgenreForTitle({
      title,
      queryHint: queryOverride,
      categoriesByTitle,
      genreSignalsByTitle,
      themeSignalsByTitle,
      toneSignalsByTitle,
    }));
  }
  const contributionSubgenreHistogram = {};
  for (const title of contributingTitles) {
    incCounter(contributionSubgenreHistogram, subgenreForTitle({
      title,
      queryHint: queryOverride,
      categoriesByTitle,
      genreSignalsByTitle,
      themeSignalsByTitle,
      toneSignalsByTitle,
    }));
  }

  const acceptedAuthors = new Set();
  for (const title of primaryTitles) {
    const authors = asArray(creatorsByTitle[title] || creatorsByTitle[key(title)]);
    for (const author of authors) {
      const authorKey = key(author);
      if (authorKey) acceptedAuthors.add(authorKey);
    }
  }
  const contributingAuthors = new Set();
  for (const title of contributingTitles) {
    const authors = asArray(creatorsByTitle[title] || creatorsByTitle[key(title)]);
    for (const author of authors) {
      const authorKey = key(author);
      if (authorKey) contributingAuthors.add(authorKey);
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
    recommendationContributionCount: contributingTitles.length,
    uniqueNarrativeFictionYield: acceptedTitleSet.size,
    duplicateRate,
    acceptedTitles: Array.from(acceptedTitleSet),
    contributingTitles: Array.from(contributingTitleSet),
    acceptedSubgenreHistogram,
    contributionSubgenreHistogram,
    uniqueAuthorYield: acceptedAuthors.size,
    contributingUniqueAuthorYield: contributingAuthors.size,
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
    const acceptedSubgenreHistogram = {};
    const contributionSubgenreHistogram = {};
    const acceptedTitleSet = new Set();
    const contributingTitleSet = new Set();
    let acceptedTitleOccurrences = 0;
    let contributingTitleOccurrences = 0;

    for (const row of rows) {
      mergeHistogram(rejectionHistogram, row.rejectionHistogram);
      mergeHistogram(acceptedSubgenreHistogram, row.acceptedSubgenreHistogram);
      mergeHistogram(contributionSubgenreHistogram, row.contributionSubgenreHistogram);
      for (const t of row.acceptedTitles) acceptedTitleSet.add(t);
      for (const t of row.contributingTitles) contributingTitleSet.add(t);
      acceptedTitleOccurrences += row.acceptedTitles.length;
      contributingTitleOccurrences += row.contributingTitles.length;
    }

    const acceptedDuplicateRate = acceptedTitleOccurrences > 0
      ? round4(1 - (acceptedTitleSet.size / acceptedTitleOccurrences))
      : 0;
    const contributingDuplicateRate = contributingTitleOccurrences > 0
      ? round4(1 - (contributingTitleSet.size / contributingTitleOccurrences))
      : 0;

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
        recommendationContributionCount: roundRows.reduce((sum, row) => sum + row.recommendationContributionCount, 0),
        uniqueNarrativeFictionYield: roundRows.reduce((sum, row) => sum + row.uniqueNarrativeFictionYield, 0),
        uniqueAuthorYield: roundRows.reduce((sum, row) => sum + row.uniqueAuthorYield, 0),
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
      uniqueAuthorYield: stats(rows.map((row) => row.uniqueAuthorYield)),
      duplicateRate: stats(rows.map((row) => row.duplicateRate)),
      rejectionHistogram,
      acceptedBySubgenre: acceptedSubgenreHistogram,
      contributionBySubgenre: contributionSubgenreHistogram,
      acceptedCoverageEntropy: shannonEntropy(acceptedSubgenreHistogram),
      contributionCoverageEntropy: shannonEntropy(contributionSubgenreHistogram),
      uniqueTitleYield: acceptedTitleSet.size,
      uniqueContributingTitleYield: contributingTitleSet.size,
      acceptedDuplicateRate,
      contributingDuplicateRate,
      roundAggregates,
      stability: {
        accepted: stats(roundAggregates.map((row) => row.acceptedAfterSourcePolicy)),
        contribution: stats(roundAggregates.map((row) => row.recommendationContributionCount)),
        uniqueTitles: stats(roundAggregates.map((row) => row.uniqueNarrativeFictionYield)),
      },
      acceptedTitleSet: Array.from(acceptedTitleSet).sort(),
      contributingTitleSet: Array.from(contributingTitleSet).sort(),
    });
  }
  return querySummaries;
}

function buildOverlap(querySummaries) {
  const overlapRows = [];
  for (let i = 0; i < querySummaries.length; i += 1) {
    for (let j = i + 1; j < querySummaries.length; j += 1) {
      const a = querySummaries[i];
      const b = querySummaries[j];
      const aAccepted = new Set(a.acceptedTitleSet);
      const bAccepted = new Set(b.acceptedTitleSet);
      const aContrib = new Set(a.contributingTitleSet);
      const bContrib = new Set(b.contributingTitleSet);

      let acceptedIntersection = 0;
      for (const t of aAccepted) if (bAccepted.has(t)) acceptedIntersection += 1;
      let contribIntersection = 0;
      for (const t of aContrib) if (bContrib.has(t)) contribIntersection += 1;

      const uniqueAcceptedA = Array.from(aAccepted).filter((t) => !bAccepted.has(t)).length;
      const uniqueAcceptedB = Array.from(bAccepted).filter((t) => !aAccepted.has(t)).length;
      const uniqueContribA = Array.from(aContrib).filter((t) => !bContrib.has(t)).length;
      const uniqueContribB = Array.from(bContrib).filter((t) => !aContrib.has(t)).length;

      overlapRows.push({
        queryA: a.queryCandidate,
        queryB: b.queryCandidate,
        acceptedJaccard: round4(jaccard(aAccepted, bAccepted)),
        contributionJaccard: round4(jaccard(aContrib, bContrib)),
        acceptedIntersection,
        contributionIntersection: contribIntersection,
        uniqueAcceptedAdditionsAOverB: uniqueAcceptedA,
        uniqueAcceptedAdditionsBOverA: uniqueAcceptedB,
        uniqueContributionAdditionsAOverB: uniqueContribA,
        uniqueContributionAdditionsBOverA: uniqueContribB,
      });
    }
  }
  return overlapRows.sort((x, y) => y.acceptedJaccard - x.acceptedJaccard);
}

function buildRanking(summaryRows) {
  return [...summaryRows]
    .sort((a, b) => {
      if (b.uniqueNarrativeFictionYield.mean !== a.uniqueNarrativeFictionYield.mean) {
        return b.uniqueNarrativeFictionYield.mean - a.uniqueNarrativeFictionYield.mean;
      }
      if (b.recommendationContributionCount.mean !== a.recommendationContributionCount.mean) {
        return b.recommendationContributionCount.mean - a.recommendationContributionCount.mean;
      }
      return b.acceptedCoverageEntropy.normalizedEntropy - a.acceptedCoverageEntropy.normalizedEntropy;
    })
    .map((row, index) => ({
      rank: index + 1,
      queryCandidate: row.queryCandidate,
      acceptedMean: row.publicationIdentityAccepted.mean,
      contributionMean: row.recommendationContributionCount.mean,
      uniqueNarrativeYieldMean: row.uniqueNarrativeFictionYield.mean,
      uniqueAuthorYieldMean: row.uniqueAuthorYield.mean,
      acceptedEntropy: row.acceptedCoverageEntropy.normalizedEntropy,
      acceptedStdDev: row.stability.accepted.stddev,
    }));
}

async function run() {
  const runRows = [];
  for (let round = 1; round <= ROUNDS; round += 1) {
    for (const queryCandidate of QUERY_CANDIDATES) {
      process.env.V2_TEEN_GB_SCIFI_PRIMARY_QUERY_OVERRIDE = queryCandidate;
      for (const profile of SCIENCE_FICTION_PROFILES) {
        const result = await runRecommenderV2({
          requestId: `gbr1-phase2-r${round}-${queryCandidate}-${profile.id}`.replace(/[^a-zA-Z0-9-_]/g, "_"),
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
  const overlap = buildOverlap(querySummaries);
  const ranking = buildRanking(querySummaries);

  mkdirSync(outDir, { recursive: true });
  const jsonOut = resolve(outDir, "teen-gb-r1-query-family-characterization-phase2.json");
  const csvOut = resolve(outDir, "teen-gb-r1-query-family-characterization-phase2.csv");
  const overlapOut = resolve(outDir, "teen-gb-r1-query-family-characterization-phase2-overlap.csv");
  const summaryOut = resolve(outDir, "teen-gb-r1-query-family-characterization-phase2-summary.txt");

  writeFileSync(jsonOut, JSON.stringify({
    generatedAt: new Date().toISOString(),
    rounds: ROUNDS,
    profiles: SCIENCE_FICTION_PROFILES.map((profile) => ({ id: profile.id, label: profile.label })),
    queryCandidates: QUERY_CANDIDATES,
    baselineQuery: BASELINE_QUERY,
    runRows,
    querySummaries,
    overlap,
    ranking,
  }, null, 2));

  const csvHeader = [
    "queryCandidate",
    "acceptedMean",
    "acceptedStdDev",
    "acceptedMin",
    "acceptedMax",
    "contributionMean",
    "contributionStdDev",
    "contributionMin",
    "contributionMax",
    "uniqueNarrativeYieldMean",
    "uniqueAuthorYieldMean",
    "acceptedEntropy",
    "acceptedDuplicateRate",
    "uniqueTitleYield",
    "uniqueContributingTitleYield",
  ].join(",");
  const csvRows = querySummaries.map((row) => [
    `"${row.queryCandidate.replace(/"/g, "\"\"")}"`,
    row.publicationIdentityAccepted.mean,
    row.publicationIdentityAccepted.stddev,
    row.publicationIdentityAccepted.min,
    row.publicationIdentityAccepted.max,
    row.recommendationContributionCount.mean,
    row.recommendationContributionCount.stddev,
    row.recommendationContributionCount.min,
    row.recommendationContributionCount.max,
    row.uniqueNarrativeFictionYield.mean,
    row.uniqueAuthorYield.mean,
    row.acceptedCoverageEntropy.normalizedEntropy,
    row.acceptedDuplicateRate,
    row.uniqueTitleYield,
    row.uniqueContributingTitleYield,
  ].join(","));
  writeFileSync(csvOut, `${csvHeader}\n${csvRows.join("\n")}\n`);

  const overlapHeader = [
    "queryA",
    "queryB",
    "acceptedJaccard",
    "contributionJaccard",
    "acceptedIntersection",
    "contributionIntersection",
    "uniqueAcceptedAdditionsAOverB",
    "uniqueAcceptedAdditionsBOverA",
    "uniqueContributionAdditionsAOverB",
    "uniqueContributionAdditionsBOverA",
  ].join(",");
  const overlapRows = overlap.map((row) => [
    `"${row.queryA.replace(/"/g, "\"\"")}"`,
    `"${row.queryB.replace(/"/g, "\"\"")}"`,
    row.acceptedJaccard,
    row.contributionJaccard,
    row.acceptedIntersection,
    row.contributionIntersection,
    row.uniqueAcceptedAdditionsAOverB,
    row.uniqueAcceptedAdditionsBOverA,
    row.uniqueContributionAdditionsAOverB,
    row.uniqueContributionAdditionsBOverA,
  ].join(","));
  writeFileSync(overlapOut, `${overlapHeader}\n${overlapRows.join("\n")}\n`);

  const baselineSummary = querySummaries.find((row) => row.queryCandidate === BASELINE_QUERY);
  const top = ranking[0] || null;
  const summaryLines = [
    "Teen GB-R1 Query Family Characterization (Phase 2)",
    `Rounds: ${ROUNDS}`,
    `Profiles per query per round: ${SCIENCE_FICTION_PROFILES.length}`,
    `Queries: ${QUERY_CANDIDATES.length}`,
    "",
    baselineSummary
      ? `Baseline -> accepted=${baselineSummary.publicationIdentityAccepted.mean}, contribution=${baselineSummary.recommendationContributionCount.mean}, entropy=${baselineSummary.acceptedCoverageEntropy.normalizedEntropy}, uniqueTitles=${baselineSummary.uniqueTitleYield}`
      : "Baseline -> unavailable",
    "",
    "Top candidates:",
    ...ranking.slice(0, 5).map((row) => (
      `${row.rank}. ${row.queryCandidate} | accepted=${row.acceptedMean} (std ${row.acceptedStdDev}) | contribution=${row.contributionMean} | uniqueYield=${row.uniqueNarrativeYieldMean} | authorYield=${row.uniqueAuthorYieldMean} | entropy=${row.acceptedEntropy}`
    )),
    "",
    top ? `Current top candidate: ${top.queryCandidate}` : "Current top candidate: unavailable",
  ];
  writeFileSync(summaryOut, `${summaryLines.join("\n")}\n`);

  console.log(`Wrote ${jsonOut}`);
  console.log(`Wrote ${csvOut}`);
  console.log(`Wrote ${overlapOut}`);
  console.log(`Wrote ${summaryOut}`);
}

await run();
