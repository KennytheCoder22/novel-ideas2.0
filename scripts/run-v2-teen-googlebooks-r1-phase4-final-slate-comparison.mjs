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
const COMPOSITE_QUERIES = [
  "young adult sci fi",
  "YA dystopian",
  "YA speculative fiction",
];

const CONFIGS = [
  {
    id: "A_production",
    label: "Configuration A (current production retrieval)",
    apply: () => {
      delete process.env.V2_TEEN_GB_SCIFI_PRIMARY_QUERY_OVERRIDE;
      delete process.env.V2_TEEN_GB_SCIFI_COMPOSITE_QUERIES_OVERRIDE;
    },
  },
  {
    id: "B_composite",
    label: "Configuration B (best composite family)",
    apply: () => {
      delete process.env.V2_TEEN_GB_SCIFI_PRIMARY_QUERY_OVERRIDE;
      process.env.V2_TEEN_GB_SCIFI_COMPOSITE_QUERIES_OVERRIDE = COMPOSITE_QUERIES.join("|");
    },
  },
];

const SCIENCE_FICTION_PROFILES = TEEN_AUDIT_PROFILES
  .filter((profile) => String(profile.family || "").trim() === "science_fiction")
  .map((profile) => ({
    id: profile.id,
    label: profile.label,
    ageBand: profile.ageBand,
    signals: profile.signals,
  }));

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
  } catch {
    return {};
  }
}

function asNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function text(v) {
  return String(v || "").trim();
}

function key(v) {
  return text(v).toLowerCase();
}

function round2(v) {
  return Number(v.toFixed(2));
}

function round4(v) {
  return Number(v.toFixed(4));
}

function stats(values) {
  const nums = values.map((v) => asNumber(v));
  if (!nums.length) return { mean: 0, min: 0, max: 0, stddev: 0 };
  const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const variance = nums.reduce((sum, v) => sum + ((v - mean) ** 2), 0) / nums.length;
  return { mean: round2(mean), min: round2(min), max: round2(max), stddev: round2(Math.sqrt(variance)) };
}

function subgenreFromText(textValue) {
  const s = key(textValue);
  if (!s) return "Other";
  if (s.includes("space opera") || s.includes("starship") || s.includes("interstellar")) return "Space Opera";
  if (s.includes("dystop")) return "Dystopian";
  if (s.includes("time travel") || s.includes("time loop")) return "Time Travel";
  if (s.includes("first contact") || s.includes("alien contact")) return "First Contact";
  if (s.includes("artificial intelligence") || s.includes(" ai ") || s.includes("robot") || s.includes("android")) return "Artificial Intelligence";
  if (s.includes("cyberpunk") || s.includes("hacker") || s.includes("virtual reality")) return "Cyberpunk";
  if (s.includes("military") || s.includes("fleet") || s.includes("war")) return "Military SF";
  if (s.includes("near future") || s.includes("speculative")) return "Near Future";
  if (s.includes("post-apocalyptic") || s.includes("post apocalyptic") || s.includes("apocalypse")) return "Post-apocalyptic";
  if (s.includes("science fiction") || s.includes("sci fi") || s.includes("science-fiction")) return "General speculative";
  return "Other";
}

function shannonEntropy(histogram) {
  const counts = Object.values(asObject(histogram)).map((v) => asNumber(v)).filter((v) => v > 0);
  const total = counts.reduce((sum, v) => sum + v, 0);
  if (!total) return { entropy: 0, normalizedEntropy: 0 };
  let entropy = 0;
  for (const c of counts) {
    const p = c / total;
    entropy += -p * Math.log2(p);
  }
  const maxEntropy = Math.log2(SUBGENRES.length);
  return { entropy: round4(entropy), normalizedEntropy: maxEntropy > 0 ? round4(entropy / maxEntropy) : 0 };
}

function seriesKeyForTitle(title) {
  const t = text(title);
  if (!t) return "";
  const withoutBook = t.replace(/\bbook\s+\d+\b/gi, "").trim();
  const beforeColon = withoutBook.split(":")[0].trim();
  const beforeParen = beforeColon.split("(")[0].trim();
  return key(beforeParen || t);
}

function normalizeSet(values) {
  const set = new Set();
  for (const value of values) {
    const k = key(value);
    if (k) set.add(k);
  }
  return set;
}

function computeSourceBalance(items) {
  const counts = {};
  for (const item of items) {
    const source = text(asObject(item).source || "unknown");
    counts[source] = asNumber(counts[source]) + 1;
  }
  return counts;
}

function extractMetrics(result) {
  const items = asArray(asObject(result).items);
  const selectedTitles = items.map((item) => text(asObject(item).title)).filter(Boolean);
  const selectedTitleSet = normalizeSet(selectedTitles);
  const selectedScores = items.map((item) => asNumber(asObject(item).score)).filter((v) => Number.isFinite(v));
  const avgScore = selectedScores.length ? round4(selectedScores.reduce((a, b) => a + b, 0) / selectedScores.length) : 0;

  const uniqueAuthors = new Set();
  const uniqueSeries = new Set();
  const subgenreHistogram = {};
  for (const item of items) {
    const row = asObject(item);
    const title = text(row.title);
    const genres = asArray(row.genres).map(text).filter(Boolean);
    const themes = asArray(row.themes).map(text).filter(Boolean);
    const tones = asArray(row.tones).map(text).filter(Boolean);
    const subgenre = subgenreFromText([title, ...genres, ...themes, ...tones].join(" "));
    subgenreHistogram[subgenre] = asNumber(subgenreHistogram[subgenre]) + 1;
    uniqueSeries.add(seriesKeyForTitle(title));
    for (const author of asArray(row.creators || row.authors).map(text).filter(Boolean)) {
      uniqueAuthors.add(key(author));
    }
  }

  const diagnostics = asObject(asObject(result).diagnostics);
  const sourceRows = asArray(diagnostics.sources);
  const googleBooks = asObject(sourceRows.find((row) => asObject(row).source === "googleBooks"));
  const fetches = asArray(googleBooks.fetches);
  const acceptedAfterSourcePolicyTotal = fetches.reduce((sum, fetch) => sum + asNumber(asObject(fetch).acceptedAfterSourcePolicy), 0);
  const rawApiCountTotal = fetches.reduce((sum, fetch) => sum + asNumber(asObject(fetch).rawApiCount), 0);
  const queryQualityByQuery = asObject(googleBooks.googleBooksQueryResultQualityByQuery);
  const acceptedTitlesAll = [];
  for (const row of Object.values(queryQualityByQuery)) {
    const titles = asArray(asObject(row).titles).map(text).filter(Boolean);
    acceptedTitlesAll.push(...titles);
  }
  const acceptedUniqueTitleSet = normalizeSet(acceptedTitlesAll);
  const acceptedDuplicateRate = acceptedTitlesAll.length > 0
    ? round4(1 - (acceptedUniqueTitleSet.size / acceptedTitlesAll.length))
    : 0;

  const ageDecisionByTitle = asObject(googleBooks.teensGoogleBooksPreScoringDecisionByTitle);
  let ageAppropriateCount = 0;
  for (const title of selectedTitles) {
    const decision = key(ageDecisionByTitle[title] || ageDecisionByTitle[key(title)]);
    if (!decision || (!decision.includes("reject") && !decision.includes("blocked"))) {
      ageAppropriateCount += 1;
    }
  }

  return {
    selectedCount: items.length,
    selectedTitles,
    selectedTitleSet,
    averageScore: avgScore,
    sourceBalance: computeSourceBalance(items),
    uniqueAuthorCount: uniqueAuthors.size,
    uniqueSeriesCount: Array.from(uniqueSeries).filter(Boolean).length,
    recommendationEntropy: shannonEntropy(subgenreHistogram),
    selectedSubgenreHistogram: subgenreHistogram,
    ageAppropriateSelectedCount: ageAppropriateCount,
    ageAppropriateSelectedRate: items.length > 0 ? round4(ageAppropriateCount / items.length) : 0,
    acceptedAfterSourcePolicyTotal,
    acceptedAfterSourcePolicyUnique: acceptedUniqueTitleSet.size,
    acceptedDuplicateRate,
    rawApiCountTotal,
  };
}

function compareConfigurations(rowA, rowB) {
  const overlap = Array.from(rowA.selectedTitleSet).filter((title) => rowB.selectedTitleSet.has(title));
  const addedByB = Array.from(rowB.selectedTitleSet).filter((title) => !rowA.selectedTitleSet.has(title));
  const removedByB = Array.from(rowA.selectedTitleSet).filter((title) => !rowB.selectedTitleSet.has(title));
  return {
    round: rowA.round,
    profileId: rowA.profileId,
    profileLabel: rowA.profileLabel,
    overlapCount: overlap.length,
    addedByBCount: addedByB.length,
    removedByBCount: removedByB.length,
    addedByBTitles: addedByB,
    removedByBTitles: removedByB,
    avgScoreDeltaBMinusA: round4(rowB.averageScore - rowA.averageScore),
    acceptedDeltaBMinusA: rowB.acceptedAfterSourcePolicyUnique - rowA.acceptedAfterSourcePolicyUnique,
    contributionDeltaBMinusA: rowB.selectedCount - rowA.selectedCount,
    uniqueAuthorDeltaBMinusA: rowB.uniqueAuthorCount - rowA.uniqueAuthorCount,
    uniqueSeriesDeltaBMinusA: rowB.uniqueSeriesCount - rowA.uniqueSeriesCount,
    entropyDeltaBMinusA: round4(rowB.recommendationEntropy.normalizedEntropy - rowA.recommendationEntropy.normalizedEntropy),
    ageAppropriateRateDeltaBMinusA: round4(rowB.ageAppropriateSelectedRate - rowA.ageAppropriateSelectedRate),
  };
}

async function run() {
  const allRows = [];
  const byConfig = new Map();
  for (const config of CONFIGS) byConfig.set(config.id, []);

  for (let round = 1; round <= ROUNDS; round += 1) {
    for (const profile of SCIENCE_FICTION_PROFILES) {
      for (const config of CONFIGS) {
        config.apply();
        const result = await runRecommenderV2({
          requestId: `gbr1-phase4-r${round}-${profile.id}-${config.id}`.replace(/[^a-zA-Z0-9-_]/g, "_"),
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
        const metrics = extractMetrics(result);
        const row = {
          round,
          profileId: profile.id,
          profileLabel: profile.label,
          configId: config.id,
          configLabel: config.label,
          ...metrics,
        };
        allRows.push(row);
        byConfig.get(config.id).push(row);
      }
    }
  }
  delete process.env.V2_TEEN_GB_SCIFI_PRIMARY_QUERY_OVERRIDE;
  delete process.env.V2_TEEN_GB_SCIFI_COMPOSITE_QUERIES_OVERRIDE;

  const compareRows = [];
  const rowsA = byConfig.get("A_production") || [];
  const rowsB = byConfig.get("B_composite") || [];
  const pairCount = Math.min(rowsA.length, rowsB.length);
  for (let i = 0; i < pairCount; i += 1) {
    compareRows.push(compareConfigurations(rowsA[i], rowsB[i]));
  }

  const summaryByConfig = CONFIGS.map((config) => {
    const rows = byConfig.get(config.id) || [];
    return {
      configId: config.id,
      configLabel: config.label,
      selectedCount: stats(rows.map((r) => r.selectedCount)),
      acceptedAfterSourcePolicyUnique: stats(rows.map((r) => r.acceptedAfterSourcePolicyUnique)),
      averageScore: stats(rows.map((r) => r.averageScore)),
      uniqueAuthorCount: stats(rows.map((r) => r.uniqueAuthorCount)),
      uniqueSeriesCount: stats(rows.map((r) => r.uniqueSeriesCount)),
      recommendationEntropy: stats(rows.map((r) => r.recommendationEntropy.normalizedEntropy)),
      ageAppropriateSelectedRate: stats(rows.map((r) => r.ageAppropriateSelectedRate)),
    };
  });

  const deltaSummary = {
    overlapCount: stats(compareRows.map((r) => r.overlapCount)),
    addedByBCount: stats(compareRows.map((r) => r.addedByBCount)),
    removedByBCount: stats(compareRows.map((r) => r.removedByBCount)),
    avgScoreDeltaBMinusA: stats(compareRows.map((r) => r.avgScoreDeltaBMinusA)),
    acceptedDeltaBMinusA: stats(compareRows.map((r) => r.acceptedDeltaBMinusA)),
    contributionDeltaBMinusA: stats(compareRows.map((r) => r.contributionDeltaBMinusA)),
    uniqueAuthorDeltaBMinusA: stats(compareRows.map((r) => r.uniqueAuthorDeltaBMinusA)),
    uniqueSeriesDeltaBMinusA: stats(compareRows.map((r) => r.uniqueSeriesDeltaBMinusA)),
    entropyDeltaBMinusA: stats(compareRows.map((r) => r.entropyDeltaBMinusA)),
    ageAppropriateRateDeltaBMinusA: stats(compareRows.map((r) => r.ageAppropriateRateDeltaBMinusA)),
  };

  mkdirSync(outDir, { recursive: true });
  const jsonOut = resolve(outDir, "teen-gb-r1-phase4-final-slate-comparison.json");
  const csvOut = resolve(outDir, "teen-gb-r1-phase4-final-slate-comparison.csv");
  const summaryOut = resolve(outDir, "teen-gb-r1-phase4-final-slate-comparison-summary.txt");

  writeFileSync(jsonOut, JSON.stringify({
    generatedAt: new Date().toISOString(),
    rounds: ROUNDS,
    profiles: SCIENCE_FICTION_PROFILES.map((p) => ({ id: p.id, label: p.label })),
    configs: CONFIGS.map((c) => ({ id: c.id, label: c.label })),
    compositeQueries: COMPOSITE_QUERIES,
    allRows,
    compareRows,
    summaryByConfig,
    deltaSummary,
  }, null, 2));

  const csvHeader = [
    "round",
    "profileId",
    "overlapCount",
    "addedByBCount",
    "removedByBCount",
    "avgScoreDeltaBMinusA",
    "acceptedDeltaBMinusA",
    "contributionDeltaBMinusA",
    "uniqueAuthorDeltaBMinusA",
    "uniqueSeriesDeltaBMinusA",
    "entropyDeltaBMinusA",
    "ageAppropriateRateDeltaBMinusA",
  ].join(",");
  const csvRows = compareRows.map((row) => [
    row.round,
    row.profileId,
    row.overlapCount,
    row.addedByBCount,
    row.removedByBCount,
    row.avgScoreDeltaBMinusA,
    row.acceptedDeltaBMinusA,
    row.contributionDeltaBMinusA,
    row.uniqueAuthorDeltaBMinusA,
    row.uniqueSeriesDeltaBMinusA,
    row.entropyDeltaBMinusA,
    row.ageAppropriateRateDeltaBMinusA,
  ].join(","));
  writeFileSync(csvOut, `${csvHeader}\n${csvRows.join("\n")}\n`);

  const aSummary = summaryByConfig.find((row) => row.configId === "A_production");
  const bSummary = summaryByConfig.find((row) => row.configId === "B_composite");
  const summaryLines = [
    "Teen GB-R1 Phase 4 Final Slate Comparison",
    `Rounds: ${ROUNDS}`,
    `Profiles per round: ${SCIENCE_FICTION_PROFILES.length}`,
    `Composite queries: ${COMPOSITE_QUERIES.join(" | ")}`,
    "",
    aSummary
      ? `A production -> selected=${aSummary.selectedCount.mean}, acceptedUnique=${aSummary.acceptedAfterSourcePolicyUnique.mean}, score=${aSummary.averageScore.mean}, entropy=${aSummary.recommendationEntropy.mean}`
      : "A production -> unavailable",
    bSummary
      ? `B composite -> selected=${bSummary.selectedCount.mean}, acceptedUnique=${bSummary.acceptedAfterSourcePolicyUnique.mean}, score=${bSummary.averageScore.mean}, entropy=${bSummary.recommendationEntropy.mean}`
      : "B composite -> unavailable",
    "",
    `Delta B-A overlap mean: ${deltaSummary.overlapCount.mean}`,
    `Delta B-A added titles mean: ${deltaSummary.addedByBCount.mean}`,
    `Delta B-A removed titles mean: ${deltaSummary.removedByBCount.mean}`,
    `Delta B-A score mean: ${deltaSummary.avgScoreDeltaBMinusA.mean}`,
    `Delta B-A accepted unique mean: ${deltaSummary.acceptedDeltaBMinusA.mean}`,
    `Delta B-A author diversity mean: ${deltaSummary.uniqueAuthorDeltaBMinusA.mean}`,
    `Delta B-A series diversity mean: ${deltaSummary.uniqueSeriesDeltaBMinusA.mean}`,
    `Delta B-A recommendation entropy mean: ${deltaSummary.entropyDeltaBMinusA.mean}`,
    `Delta B-A age-appropriate rate mean: ${deltaSummary.ageAppropriateRateDeltaBMinusA.mean}`,
  ];
  writeFileSync(summaryOut, `${summaryLines.join("\n")}\n`);

  console.log(`Wrote ${jsonOut}`);
  console.log(`Wrote ${csvOut}`);
  console.log(`Wrote ${summaryOut}`);
}

await run();
