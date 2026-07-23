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
const BROAD_QUERY = "young adult sci fi";
const DYSTOPIAN_QUERY = "YA dystopian";
const SPACE_OPERA_QUERY = "YA space opera";
const SPECULATIVE_QUERY = "YA speculative fiction";

const EXPERIMENTS = [
  { id: "single-baseline", label: "Single baseline", queries: [BASELINE_QUERY] },
  { id: "single-broad", label: "Single broad", queries: [BROAD_QUERY] },
  { id: "single-dystopian", label: "Single dystopian", queries: [DYSTOPIAN_QUERY] },
  { id: "composite-broad-dystopian", label: "Composite broad+dystopian", queries: [BROAD_QUERY, DYSTOPIAN_QUERY] },
  { id: "composite-broad-dystopian-space-opera", label: "Composite broad+dystopian+space-opera", queries: [BROAD_QUERY, DYSTOPIAN_QUERY, SPACE_OPERA_QUERY] },
  { id: "composite-broad-dystopian-speculative", label: "Composite broad+dystopian+speculative", queries: [BROAD_QUERY, DYSTOPIAN_QUERY, SPECULATIVE_QUERY] },
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

function incCounter(map, name, amount = 1) {
  map[name] = asNumber(map[name]) + amount;
}

function mergeHistogram(target, source) {
  for (const [name, count] of Object.entries(asObject(source))) {
    target[name] = asNumber(target[name]) + asNumber(count);
  }
}

function subgenreFromSignals(signalsText) {
  const s = key(signalsText);
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
  const total = counts.reduce((s, v) => s + v, 0);
  if (!total) return { entropy: 0, normalizedEntropy: 0 };
  let entropy = 0;
  for (const c of counts) {
    const p = c / total;
    entropy += -p * Math.log2(p);
  }
  const maxEntropy = Math.log2(SUBGENRES.length);
  return { entropy: round4(entropy), normalizedEntropy: maxEntropy > 0 ? round4(entropy / maxEntropy) : 0 };
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

function titleSubgenre(title, queryHint, categoriesByTitle, genreSignalsByTitle, themeSignalsByTitle, toneSignalsByTitle) {
  const t = text(title);
  const k = key(t);
  const categories = asArray(categoriesByTitle[t] || categoriesByTitle[k]).map(text).filter(Boolean);
  const genres = asArray(genreSignalsByTitle[t] || genreSignalsByTitle[k]).map(text).filter(Boolean);
  const themes = asArray(themeSignalsByTitle[t] || themeSignalsByTitle[k]).map(text).filter(Boolean);
  const tones = asArray(toneSignalsByTitle[t] || toneSignalsByTitle[k]).map(text).filter(Boolean);
  const signal = [t, ...categories, ...genres, ...themes, ...tones].join(" ");
  const derived = subgenreFromSignals(signal);
  if (derived !== "Other") return derived;
  return subgenreFromSignals(`${queryHint} ${t}`);
}

function extractSingleQueryRun(result, queryOverride) {
  const diagnostics = asObject(asObject(result).diagnostics);
  const sources = asArray(diagnostics.sources);
  const googleBooks = asObject(sources.find((source) => asObject(source).source === "googleBooks"));
  const fetches = asArray(googleBooks.fetches);
  const primaryFetch = asObject(fetches.find((fetch) => asNumber(asObject(fetch).queryCascadeIndex) === 0) || fetches[0] || {});
  const primaryQuery = text(primaryFetch.query);

  const queryQualityByQuery = asObject(googleBooks.googleBooksQueryResultQualityByQuery);
  const quality = asObject(queryQualityByQuery[primaryQuery]);
  const acceptedTitles = asArray(quality.titles).map(text).filter(Boolean);
  const acceptedTitleSet = new Set(acceptedTitles.map(key).filter(Boolean));

  const queryByTitle = asObject(googleBooks.googleBooksQueryByTitle);
  const selectedItems = asArray(asObject(result).items);
  const contributingTitles = selectedItems
    .map((item) => text(asObject(item).title))
    .filter((title) => title && text(queryByTitle[title] || queryByTitle[key(title)]) === primaryQuery);
  const contributingTitleSet = new Set(contributingTitles.map(key).filter(Boolean));

  const creatorsByTitle = asObject(googleBooks.googleBooksCreatorsByTitle);
  const categoriesByTitle = asObject(googleBooks.googleBooksCategoriesByTitle);
  const genreSignalsByTitle = asObject(googleBooks.teenGoogleBooksGenreSignalsByTitle);
  const themeSignalsByTitle = asObject(googleBooks.teenGoogleBooksThemeSignalsByTitle);
  const toneSignalsByTitle = asObject(googleBooks.teenGoogleBooksToneSignalsByTitle);

  const acceptedSubgenreHistogram = {};
  const acceptedAuthors = new Set();
  for (const title of acceptedTitles) {
    incCounter(
      acceptedSubgenreHistogram,
      titleSubgenre(title, queryOverride, categoriesByTitle, genreSignalsByTitle, themeSignalsByTitle, toneSignalsByTitle),
    );
    for (const author of asArray(creatorsByTitle[title] || creatorsByTitle[key(title)])) {
      const ak = key(author);
      if (ak) acceptedAuthors.add(ak);
    }
  }

  const contributingSubgenreHistogram = {};
  const contributingAuthors = new Set();
  for (const title of contributingTitles) {
    incCounter(
      contributingSubgenreHistogram,
      titleSubgenre(title, queryOverride, categoriesByTitle, genreSignalsByTitle, themeSignalsByTitle, toneSignalsByTitle),
    );
    for (const author of asArray(creatorsByTitle[title] || creatorsByTitle[key(title)])) {
      const ak = key(author);
      if (ak) contributingAuthors.add(ak);
    }
  }

  return {
    query: queryOverride,
    acceptedAfterSourcePolicy: asNumber(primaryFetch.acceptedAfterSourcePolicy),
    rawApiCount: asNumber(primaryFetch.rawApiCount),
    acceptedTitles,
    acceptedTitleSet,
    contributingTitles,
    contributingTitleSet,
    acceptedSubgenreHistogram,
    contributingSubgenreHistogram,
    acceptedAuthors,
    contributingAuthors,
  };
}

function compositeFromParts(parts) {
  const acceptedTitleSet = new Set();
  const contributingTitleSet = new Set();
  const acceptedAuthors = new Set();
  const contributingAuthors = new Set();
  const acceptedSubgenreHistogram = {};
  const contributionSubgenreHistogram = {};
  let acceptedOccurrences = 0;
  let contributingOccurrences = 0;
  let rawApiCount = 0;
  let acceptedAfterSourcePolicyTotal = 0;

  for (const part of parts) {
    rawApiCount += part.rawApiCount;
    acceptedAfterSourcePolicyTotal += part.acceptedAfterSourcePolicy;
    acceptedOccurrences += part.acceptedTitles.length;
    contributingOccurrences += part.contributingTitles.length;
    for (const t of part.acceptedTitleSet) acceptedTitleSet.add(t);
    for (const t of part.contributingTitleSet) contributingTitleSet.add(t);
    for (const a of part.acceptedAuthors) acceptedAuthors.add(a);
    for (const a of part.contributingAuthors) contributingAuthors.add(a);
    mergeHistogram(acceptedSubgenreHistogram, part.acceptedSubgenreHistogram);
    mergeHistogram(contributionSubgenreHistogram, part.contributingSubgenreHistogram);
  }

  const duplicateRate = acceptedOccurrences > 0 ? round4(1 - (acceptedTitleSet.size / acceptedOccurrences)) : 0;
  return {
    rawApiCount,
    acceptedAfterSourcePolicyTotal,
    acceptedAfterSourcePolicyUnique: acceptedTitleSet.size,
    acceptanceRatePct: rawApiCount > 0 ? round2((acceptedAfterSourcePolicyTotal / rawApiCount) * 100) : 0,
    uniqueTitles: acceptedTitleSet.size,
    uniqueAuthors: acceptedAuthors.size,
    recommendationContributionUnique: contributingTitleSet.size,
    recommendationContributionOccurrences: contributingOccurrences,
    contributingUniqueAuthors: contributingAuthors.size,
    duplicateRate,
    acceptedSubgenreHistogram,
    contributionSubgenreHistogram,
    acceptedCoverageEntropy: shannonEntropy(acceptedSubgenreHistogram),
  };
}

async function run() {
  const perRunRows = [];
  const perQueryCache = new Map();

  for (let round = 1; round <= ROUNDS; round += 1) {
    for (const profile of SCIENCE_FICTION_PROFILES) {
      for (const experiment of EXPERIMENTS) {
        const parts = [];
        for (const query of experiment.queries) {
          const cacheKey = `${round}::${profile.id}::${query}`;
          if (!perQueryCache.has(cacheKey)) {
            process.env.V2_TEEN_GB_SCIFI_PRIMARY_QUERY_OVERRIDE = query;
            const result = await runRecommenderV2({
              requestId: `gbr1-phase3-r${round}-${profile.id}-${query}`.replace(/[^a-zA-Z0-9-_]/g, "_"),
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
            perQueryCache.set(cacheKey, extractSingleQueryRun(result, query));
          }
          parts.push(perQueryCache.get(cacheKey));
        }
        const composite = compositeFromParts(parts);
        perRunRows.push({
          round,
          profileId: profile.id,
          profileLabel: profile.label,
          experimentId: experiment.id,
          experimentLabel: experiment.label,
          queries: experiment.queries,
          ...composite,
        });
      }
    }
  }
  delete process.env.V2_TEEN_GB_SCIFI_PRIMARY_QUERY_OVERRIDE;

  const byExperiment = new Map();
  for (const row of perRunRows) {
    if (!byExperiment.has(row.experimentId)) byExperiment.set(row.experimentId, []);
    byExperiment.get(row.experimentId).push(row);
  }

  const summaries = EXPERIMENTS.map((experiment) => {
    const rows = byExperiment.get(experiment.id) || [];
    const acceptedSubgenreHistogram = {};
    const contributionSubgenreHistogram = {};
    for (const row of rows) {
      mergeHistogram(acceptedSubgenreHistogram, row.acceptedSubgenreHistogram);
      mergeHistogram(contributionSubgenreHistogram, row.contributionSubgenreHistogram);
    }
    return {
      experimentId: experiment.id,
      experimentLabel: experiment.label,
      queries: experiment.queries,
      runs: rows.length,
      acceptedAfterSourcePolicyTotal: stats(rows.map((r) => r.acceptedAfterSourcePolicyTotal)),
      acceptedAfterSourcePolicyUnique: stats(rows.map((r) => r.acceptedAfterSourcePolicyUnique)),
      acceptanceRatePct: stats(rows.map((r) => r.acceptanceRatePct)),
      uniqueTitles: stats(rows.map((r) => r.uniqueTitles)),
      uniqueAuthors: stats(rows.map((r) => r.uniqueAuthors)),
      recommendationContributionUnique: stats(rows.map((r) => r.recommendationContributionUnique)),
      duplicateRate: stats(rows.map((r) => r.duplicateRate)),
      acceptedSubgenreHistogram,
      contributionSubgenreHistogram,
      acceptedCoverageEntropy: shannonEntropy(acceptedSubgenreHistogram),
    };
  });

  const baseline = summaries.find((s) => s.experimentId === "single-baseline");
  const broad = summaries.find((s) => s.experimentId === "single-broad");
  const dystopian = summaries.find((s) => s.experimentId === "single-dystopian");

  const ranking = [...summaries].sort((a, b) => {
    if (b.recommendationContributionUnique.mean !== a.recommendationContributionUnique.mean) {
      return b.recommendationContributionUnique.mean - a.recommendationContributionUnique.mean;
    }
    if (b.uniqueTitles.mean !== a.uniqueTitles.mean) return b.uniqueTitles.mean - a.uniqueTitles.mean;
    return b.acceptedCoverageEntropy.normalizedEntropy - a.acceptedCoverageEntropy.normalizedEntropy;
  }).map((row, index) => ({
    rank: index + 1,
    experimentId: row.experimentId,
    label: row.experimentLabel,
    queries: row.queries,
    acceptedMean: row.acceptedAfterSourcePolicyUnique.mean,
    contributionMean: row.recommendationContributionUnique.mean,
    uniqueAuthorMean: row.uniqueAuthors.mean,
    entropy: row.acceptedCoverageEntropy.normalizedEntropy,
    duplicateRateMean: row.duplicateRate.mean,
  }));

  const overlap = [];
  if (broad && dystopian) {
    const broadRows = byExperiment.get(broad.experimentId) || [];
    const dystRows = byExperiment.get(dystopian.experimentId) || [];
    const pairCount = Math.min(broadRows.length, dystRows.length);
    const jaccards = [];
    for (let i = 0; i < pairCount; i += 1) {
      const br = broadRows[i];
      const dr = dystRows[i];
      const bSet = new Set(Object.keys(asObject(br.acceptedSubgenreHistogram)));
      const dSet = new Set(Object.keys(asObject(dr.acceptedSubgenreHistogram)));
      jaccards.push(jaccard(bSet, dSet));
    }
    overlap.push({
      pair: `${broad.experimentId}<>${dystopian.experimentId}`,
      meanSubgenreFamilyJaccard: stats(jaccards).mean,
    });
  }

  mkdirSync(outDir, { recursive: true });
  const jsonOut = resolve(outDir, "teen-gb-r1-composite-query-experiment-phase3.json");
  const csvOut = resolve(outDir, "teen-gb-r1-composite-query-experiment-phase3.csv");
  const summaryOut = resolve(outDir, "teen-gb-r1-composite-query-experiment-phase3-summary.txt");

  writeFileSync(jsonOut, JSON.stringify({
    generatedAt: new Date().toISOString(),
    rounds: ROUNDS,
    profiles: SCIENCE_FICTION_PROFILES.map((p) => ({ id: p.id, label: p.label })),
    experiments: EXPERIMENTS,
    perRunRows,
    summaries,
    ranking,
    overlap,
  }, null, 2));

  const csvHeader = [
    "experimentId",
    "experimentLabel",
    "queries",
    "acceptedAfterSourcePolicyUniqueMean",
    "acceptedAfterSourcePolicyUniqueStddev",
    "contributionUniqueMean",
    "contributionUniqueStddev",
    "uniqueTitlesMean",
    "uniqueAuthorsMean",
    "duplicateRateMean",
    "entropy",
  ].join(",");
  const csvRows = summaries.map((row) => [
    row.experimentId,
    `"${row.experimentLabel.replace(/"/g, "\"\"")}"`,
    `"${row.queries.join(" | ").replace(/"/g, "\"\"")}"`,
    row.acceptedAfterSourcePolicyUnique.mean,
    row.acceptedAfterSourcePolicyUnique.stddev,
    row.recommendationContributionUnique.mean,
    row.recommendationContributionUnique.stddev,
    row.uniqueTitles.mean,
    row.uniqueAuthors.mean,
    row.duplicateRate.mean,
    row.acceptedCoverageEntropy.normalizedEntropy,
  ].join(","));
  writeFileSync(csvOut, `${csvHeader}\n${csvRows.join("\n")}\n`);

  const best = ranking[0];
  const summaryLines = [
    "Teen GB-R1 Composite Query Experiment (Phase 3)",
    `Rounds: ${ROUNDS}`,
    `Profiles per round: ${SCIENCE_FICTION_PROFILES.length}`,
    "",
    baseline
      ? `Baseline ${baseline.queries[0]} -> accepted=${baseline.acceptedAfterSourcePolicyUnique.mean}, contribution=${baseline.recommendationContributionUnique.mean}, entropy=${baseline.acceptedCoverageEntropy.normalizedEntropy}`
      : "Baseline unavailable",
    broad
      ? `Broad ${broad.queries[0]} -> accepted=${broad.acceptedAfterSourcePolicyUnique.mean}, contribution=${broad.recommendationContributionUnique.mean}, entropy=${broad.acceptedCoverageEntropy.normalizedEntropy}`
      : "Broad unavailable",
    dystopian
      ? `Dystopian ${dystopian.queries[0]} -> accepted=${dystopian.acceptedAfterSourcePolicyUnique.mean}, contribution=${dystopian.recommendationContributionUnique.mean}, entropy=${dystopian.acceptedCoverageEntropy.normalizedEntropy}`
      : "Dystopian unavailable",
    "",
    "Composite ranking:",
    ...ranking.map((row) => `${row.rank}. ${row.label} | accepted=${row.acceptedMean} contribution=${row.contributionMean} entropy=${row.entropy} dup=${row.duplicateRateMean}`),
    "",
    best ? `Top phase-3 configuration: ${best.label}` : "Top phase-3 configuration: unavailable",
  ];
  writeFileSync(summaryOut, `${summaryLines.join("\n")}\n`);

  console.log(`Wrote ${jsonOut}`);
  console.log(`Wrote ${csvOut}`);
  console.log(`Wrote ${summaryOut}`);
}

await run();
