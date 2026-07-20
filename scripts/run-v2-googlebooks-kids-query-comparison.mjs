/**
 * Kids Google Books Query-Family Comparison Framework
 *
 * Diagnostic-only: does NOT change production behavior.
 * Tests multiple query formulations and traces yield through each pipeline stage:
 *   raw API count → shape admitted → audience=kids → pre-scoring passed
 *
 * Usage:
 *   GOOGLE_BOOKS_API_KEY=<key> node scripts/run-v2-googlebooks-kids-query-comparison.mjs
 *
 * Output:
 *   scripts/output/kids-query-comparison.json
 *   scripts/output/kids-query-comparison.csv
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

const { analyzeGoogleBooksVolumeForAudit } = require(
  resolve(recommenderDir, "sources/googleBooksSource.ts"),
);
const { applyKidsGoogleBooksPreScoringGate } = require(
  resolve(recommenderDir, "engine.ts"),
);
const { scoreCandidates } = require(resolve(recommenderDir, "score.ts"));
const { selectRecommendations } = require(resolve(recommenderDir, "select.ts"));

// ─── Configuration ────────────────────────────────────────────────────────────

const API_KEY = process.env.GOOGLE_BOOKS_API_KEY || "";
const API_BASE = "https://www.googleapis.com/books/v1/volumes";
const MAX_RESULTS = 24;
const FETCH_DELAY_MS = 350;

if (!API_KEY) {
  console.warn(
    "WARNING: GOOGLE_BOOKS_API_KEY not set — requests will be unauthenticated and may be rate-limited.",
  );
}

// Neutral Kids profile: broad positive signals, no blockers.
const neutralKidsProfile = {
  ageBand: "kids",
  maturityBand: "kids",
  genreFamily: [
    { value: "fantasy", weight: 2, evidence: ["like:kids:fantasy"] },
    { value: "adventure", weight: 1, evidence: ["like:kids:adventure"] },
    { value: "humorous", weight: 1, evidence: ["like:kids:humorous"] },
  ],
  tone: [
    { value: "warm", weight: 1, evidence: ["like:kids:warm"] },
    { value: "funny", weight: 1, evidence: ["like:kids:funny"] },
  ],
  pacing: [],
  themes: [
    { value: "friendship", weight: 1, evidence: ["like:kids:friendship"] },
    { value: "animals", weight: 1, evidence: ["like:kids:animals"] },
  ],
  characterDynamics: [],
  formatPreference: [{ value: "book", weight: 1, evidence: ["like:kids:book"] }],
  avoidSignals: [],
  sourceHints: ["googleBooks"],
  diagnostics: {},
};

// ─── Query families to compare ────────────────────────────────────────────────
//
// Grouped by hypothesis:
//   baseline   — current production queries
//   prefix     — alternative age-prefix formulations
//   format     — explicit format-anchor variants
//   broad      — category / subject anchors
//   theme      — theme × format combos beyond the current planner
//   subject    — Google Books subject: qualifier
//
const QUERY_FAMILIES = [
  // ── Baseline: what the current planner produces ──────────────────────────
  { id: "baseline-fantasy-picture-book",   group: "baseline", query: "kids fantasy picture book" },
  { id: "baseline-fantasy-early-reader",   group: "baseline", query: "kids fantasy early reader" },
  { id: "baseline-adventure-picture-book", group: "baseline", query: "kids adventure picture book" },
  { id: "baseline-generic-picture-book",   group: "baseline", query: "kids picture book" },
  { id: "baseline-generic-early-reader",   group: "baseline", query: "kids early reader" },
  { id: "baseline-read-aloud",             group: "baseline", query: "kids read aloud" },

  // ── Prefix alternatives ───────────────────────────────────────────────────
  { id: "prefix-childrens-picture-book",   group: "prefix", query: "children's picture book" },
  { id: "prefix-childrens-early-reader",   group: "prefix", query: "children's early reader" },
  { id: "prefix-juvenile-fiction",         group: "prefix", query: "juvenile fiction" },
  { id: "prefix-juvenile-picture-book",    group: "prefix", query: "juvenile fiction picture book" },

  // ── Explicit format anchors ───────────────────────────────────────────────
  { id: "format-beginning-reader",         group: "format", query: "beginning reader fiction" },
  { id: "format-easy-reader",              group: "format", query: "easy reader fiction" },
  { id: "format-chapter-book",             group: "format", query: "kids chapter book" },
  { id: "format-illustrated-story",        group: "format", query: "kids illustrated story" },

  // ── Theme × format expansions ─────────────────────────────────────────────
  { id: "theme-humor-picture-book",        group: "theme", query: "kids humorous picture book" },
  { id: "theme-animal-picture-book",       group: "theme", query: "kids animal picture book" },
  { id: "theme-friendship-picture-book",   group: "theme", query: "kids friendship picture book" },
  { id: "theme-rhyming-picture-book",      group: "theme", query: "kids rhyming picture book" },
  { id: "theme-adventure-early-reader",    group: "theme", query: "kids adventure early reader" },
  { id: "theme-humor-early-reader",        group: "theme", query: "kids humorous early reader" },
  { id: "theme-magic-adventure",           group: "theme", query: "kids magic adventure" },
  { id: "theme-dragon-adventure-reader",   group: "theme", query: "kids dragon adventure early reader" },

  // ── Subject / category anchors ────────────────────────────────────────────
  { id: "subject-juvenile-fiction",        group: "subject", query: "subject:juvenile fiction" },
  { id: "subject-juvenile-fantasy",        group: "subject", query: "subject:juvenile fiction fantasy" },
  { id: "subject-juvenile-adventure",      group: "subject", query: "subject:juvenile fiction adventure" },
  { id: "subject-childrens-stories",       group: "subject", query: "subject:children's stories" },
  { id: "subject-picture-book",            group: "subject", query: "subject:picture books fiction" },
];

const NARRATIVE_SHAPES = new Set(["novel", "series_installment", "story_collection"]);

const CASCADE_ROUTES = [
  {
    id: "route-general",
    label: "General Kids formats",
    queryIds: [
      "baseline-generic-picture-book",
      "baseline-generic-early-reader",
      "baseline-read-aloud",
    ],
  },
  {
    id: "route-fantasy-variants",
    label: "Fantasy variants",
    queryIds: [
      "baseline-fantasy-picture-book",
      "baseline-fantasy-early-reader",
      "theme-magic-adventure",
    ],
  },
  {
    id: "route-adventure-stack",
    label: "Adventure stack",
    queryIds: [
      "baseline-adventure-picture-book",
      "theme-adventure-early-reader",
      "format-chapter-book",
    ],
  },
  {
    id: "route-friendship-humor-rhyme",
    label: "Friendship/Humor/Rhyming",
    queryIds: [
      "theme-friendship-picture-book",
      "theme-humor-picture-book",
      "theme-rhyming-picture-book",
    ],
  },
];

// ─── API fetch ────────────────────────────────────────────────────────────────

async function fetchQuery(queryText) {
  const params = new URLSearchParams({
    q: queryText,
    maxResults: String(MAX_RESULTS),
    orderBy: "relevance",
    printType: "books",
    projection: "full",
    langRestrict: "en",
  });
  if (API_KEY) params.set("key", API_KEY);
  const url = `${API_BASE}?${params}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return { error: `http_${res.status}`, items: [] };
    const json = await res.json();
    return { items: Array.isArray(json.items) ? json.items : [], totalItems: json.totalItems ?? 0 };
  } catch (err) {
    return { error: String(err?.message ?? err), items: [] };
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── Candidate builder (mirrors the audit harness pattern) ───────────────────

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

function combinations(values) {
  const out = [];
  const n = values.length;
  for (let mask = 1; mask < (1 << n); mask += 1) {
    const picked = [];
    for (let i = 0; i < n; i += 1) {
      if (mask & (1 << i)) picked.push(values[i]);
    }
    if (picked.length >= 2) out.push(picked);
  }
  return out;
}

function evaluateCascade(route, chosenQueryIds, queryById) {
  const pooledEditions = [];
  for (const queryId of chosenQueryIds) {
    const query = queryById.get(queryId);
    if (!query || query.error) continue;
    pooledEditions.push(...query.editions);
  }

  const uniqueByVolume = new Map();
  for (const ed of pooledEditions) {
    if (!uniqueByVolume.has(ed.volumeId)) uniqueByVolume.set(ed.volumeId, ed);
  }
  const uniqueRaw = [...uniqueByVolume.values()];
  const rawTotal = pooledEditions.length;
  const duplicatePct = rawTotal > 0
    ? Math.round(((rawTotal - uniqueRaw.length) / rawTotal) * 1000) / 10
    : 0;

  const narrativeRaw = uniqueRaw.filter((ed) => NARRATIVE_SHAPES.has(ed.publicationShape));
  const shapePass = uniqueRaw.filter((ed) => ed.shapeAdmitted);
  const shapePassCandidates = shapePass.map((ed) => ed.candidate);

  let preScoringCandidates = [];
  let selection = { selected: [], diagnostics: {} };
  if (shapePassCandidates.length > 0) {
    const gate = applyKidsGoogleBooksPreScoringGate(shapePassCandidates, neutralKidsProfile);
    preScoringCandidates = gate.candidates;
    if (preScoringCandidates.length > 0) {
      const scored = scoreCandidates(preScoringCandidates, neutralKidsProfile);
      selection = selectRecommendations(scored, neutralKidsProfile, 10);
    }
  }

  const finalTitles = selection.selected.map((c) => c.title);
  const finalAuthors = new Set(selection.selected.map((c) => String((c.creators || [])[0] || "").trim()).filter(Boolean));
  const finalCategories = new Set(
    selection.selected
      .flatMap((c) => Array.isArray(c.genres) ? c.genres : [])
      .map((g) => String(g || "").trim())
      .filter(Boolean),
  );

  return {
    routeId: route.id,
    routeLabel: route.label,
    queryIds: chosenQueryIds,
    querySetLabel: chosenQueryIds.join(" + "),
    uniqueRawNarrativeCandidates: narrativeRaw.length,
    uniquePublicationShapePasses: shapePass.length,
    uniqueK2PreScoringPasses: preScoringCandidates.length,
    uniqueFinalEligibilityPasses: selection.selected.length,
    duplicatePct,
    finalProductionRecommendations: finalTitles,
    finalRecommendationDiversity: {
      uniqueTitles: new Set(finalTitles).size,
      uniqueLeadAuthors: finalAuthors.size,
      uniqueGenres: finalCategories.size,
    },
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const results = [];

for (const family of QUERY_FAMILIES) {
  process.stdout.write(`Querying: "${family.query}" ... `);
  const { items, totalItems, error } = await fetchQuery(family.query);
  await sleep(FETCH_DELAY_MS);

  if (error) {
    console.log(`ERROR: ${error}`);
    results.push({ ...family, error, rawCount: 0, editions: [] });
    continue;
  }

  const editions = [];
  const candidates = [];

  for (const item of items) {
    const volumeInfo = (item.volumeInfo && typeof item.volumeInfo === "object")
      ? item.volumeInfo
      : {};
    const analysis = analyzeGoogleBooksVolumeForAudit(volumeInfo, item);
    const candidate = buildCandidate(volumeInfo, item, analysis, family.query);
    editions.push({ analysis, candidate });
    if (analysis.admittedAfterSourcePolicy) {
      candidates.push(candidate);
    }
  }

  // Run Kids pre-scoring gate on all shape-admitted candidates
  let preScoringPassed = [];
  let preScoringDiag = {};
  let finalSelected = [];
  if (candidates.length > 0) {
    const gate = applyKidsGoogleBooksPreScoringGate(candidates, neutralKidsProfile);
    preScoringPassed = gate.candidates.map((c) => c.id);
    preScoringDiag = gate.diagnostics;
    if (gate.candidates.length > 0) {
      const scored = scoreCandidates(gate.candidates, neutralKidsProfile);
      const selection = selectRecommendations(scored, neutralKidsProfile, 10);
      finalSelected = selection.selected.map((c) => c.id);
    }
  }

  const preScoringPassedSet = new Set(preScoringPassed);

  const editionRows = editions.map(({ analysis, candidate }) => {
    const volumeId = String(candidate.sourceId || "").trim();
    const shapeAdmitted = analysis.admittedAfterSourcePolicy;
    const audienceKids = analysis.inferredAudienceBand === "kids";
    const preScoringPass = preScoringPassedSet.has(candidate.id);
    const rejectionReason = shapeAdmitted && !preScoringPass
      ? (preScoringDiag?.rejectedBeforeScoringByTitle?.[analysis.title] || "not_evaluated")
      : analysis.publicationShapeDropReason || analysis.artifactDropReason || (shapeAdmitted ? null : "shape_rejected");
    return {
      volumeId,
      title: analysis.title,
      authors: analysis.authors.slice(0, 2).join(", "),
      categories: analysis.categories.join(" | "),
      pageCount: analysis.pageCount,
      publicationShape: analysis.publicationShape,
      inferredAudienceBand: analysis.inferredAudienceBand,
      shapeAdmitted,
      audienceKids,
      preScoringPass,
      rejectionReason,
      candidate,
    };
  });

  const rawCount = editions.length;
  const shapeAdmittedCount = editionRows.filter((e) => e.shapeAdmitted).length;
  const audienceKidsCount = editionRows.filter((e) => e.audienceKids).length;
  const preScoringPassCount = editionRows.filter((e) => e.preScoringPass).length;
  const finalSelectedSet = new Set(finalSelected);
  const finalEligibilityPassCount = editionRows.filter((e) => finalSelectedSet.has(e.candidate.id)).length;
  const finalReturnedTitles = editionRows.filter((e) => finalSelectedSet.has(e.candidate.id)).map((e) => e.title);

  const row = {
    id: family.id,
    group: family.group,
    query: family.query,
    apiTotalItems: totalItems,
    rawCount,
    shapeAdmittedCount,
    audienceKidsCount,
    preScoringPassCount,
    finalEligibilityPassCount,
    finalReturnedTitles,
    shapeYieldPct: rawCount ? Math.round(shapeAdmittedCount / rawCount * 100) : 0,
    audienceYieldPct: rawCount ? Math.round(audienceKidsCount / rawCount * 100) : 0,
    k2YieldPct: rawCount ? Math.round(preScoringPassCount / rawCount * 100) : 0,
    k2YieldAbsolute: preScoringPassCount,
    preScoringPassedIds: preScoringPassed,
    preScoringPassedTitles: editionRows.filter((e) => e.preScoringPass).map((e) => e.title),
    editions: editionRows,
  };
  results.push(row);

  console.log(
    `raw=${rawCount} shape=${shapeAdmittedCount} audience_kids=${audienceKidsCount} pre_scoring=${preScoringPassCount} final=${finalEligibilityPassCount} (${row.k2YieldPct}%)`,
  );
}

// ─── Aggregate analysis ───────────────────────────────────────────────────────

const sorted = [...results].sort((a, b) => b.preScoringPassCount - a.preScoringPassCount);

console.log("\n=== RANKED BY K-2 PRE-SCORING YIELD ===");
console.log(
  `${"Query".padEnd(42)} ${"Group".padEnd(9)} ${"Raw".padStart(4)} ${"Shape".padStart(6)} ${"Aud-K".padStart(6)} ${"PreScr".padStart(7)} ${"K2%".padStart(5)}`,
);
console.log("─".repeat(80));
for (const r of sorted) {
  if (r.error) continue;
  console.log(
    `${r.query.padEnd(42)} ${r.group.padEnd(9)} ${String(r.rawCount).padStart(4)} ${String(r.shapeAdmittedCount).padStart(6)} ${String(r.audienceKidsCount).padStart(6)} ${String(r.preScoringPassCount).padStart(7)} ${String(r.k2YieldPct).padStart(4)}%`,
  );
}

// Group averages
const groups = [...new Set(results.map((r) => r.group))];
console.log("\n=== GROUP AVERAGES ===");
for (const group of groups) {
  const rows = results.filter((r) => r.group === group && !r.error);
  if (!rows.length) continue;
  const avgK2 = rows.reduce((s, r) => s + r.preScoringPassCount, 0) / rows.length;
  const avgRaw = rows.reduce((s, r) => s + r.rawCount, 0) / rows.length;
  console.log(`  ${group.padEnd(12)} avg_raw=${avgRaw.toFixed(1)} avg_k2_pre_scoring=${avgK2.toFixed(1)}`);
}

// Best pre-scoring titles across all queries
const allPassed = new Map();
for (const r of results) {
  if (r.error) continue;
  for (const title of (r.preScoringPassedTitles || [])) {
    allPassed.set(title, (allPassed.get(title) || 0) + 1);
  }
}
const topTitles = [...allPassed.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);
console.log("\n=== TITLES PASSING K-2 PRE-SCORING MOST OFTEN (top 20) ===");
for (const [title, count] of topTitles) {
  console.log(`  [${count} queries] ${title}`);
}

// Rejection breakdown for shape-admitted titles that did NOT pass
const allRejections = new Map();
for (const r of results) {
  if (r.error) continue;
  for (const ed of r.editions) {
    if (ed.shapeAdmitted && !ed.preScoringPass && ed.rejectionReason) {
      allRejections.set(ed.rejectionReason, (allRejections.get(ed.rejectionReason) || 0) + 1);
    }
  }
}
console.log("\n=== REJECTION REASONS (shape-admitted, pre-scoring failed) ===");
for (const [reason, count] of [...allRejections.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${count.toString().padStart(4)}  ${reason}`);
}

// ─── Cascade-combination analysis ──────────────────────────────────────────────

const queryById = new Map(results.map((r) => [r.id, r]));
const cascadeRows = [];
for (const route of CASCADE_ROUTES) {
  const combos = combinations(route.queryIds);
  for (const combo of combos) {
    cascadeRows.push(evaluateCascade(route, combo, queryById));
  }
}
const cascadeSorted = [...cascadeRows].sort((a, b) => {
  if (b.uniqueFinalEligibilityPasses !== a.uniqueFinalEligibilityPasses) {
    return b.uniqueFinalEligibilityPasses - a.uniqueFinalEligibilityPasses;
  }
  if (b.uniqueK2PreScoringPasses !== a.uniqueK2PreScoringPasses) {
    return b.uniqueK2PreScoringPasses - a.uniqueK2PreScoringPasses;
  }
  return b.uniquePublicationShapePasses - a.uniquePublicationShapePasses;
});

console.log("\n=== CASCADE COMBINATIONS (ranked by final eligibility, then pre-scoring) ===");
console.log(
  `${"Route".padEnd(28)} ${"Combo".padEnd(74)} ${"NarrRaw".padStart(7)} ${"Shape".padStart(6)} ${"PreScr".padStart(7)} ${"Final".padStart(6)} ${"Dup%".padStart(6)}`,
);
console.log("─".repeat(150));
for (const row of cascadeSorted) {
  const comboLabel = row.queryIds.join(" + ");
  console.log(
    `${row.routeLabel.padEnd(28)} ${comboLabel.padEnd(74)} ${String(row.uniqueRawNarrativeCandidates).padStart(7)} ${String(row.uniquePublicationShapePasses).padStart(6)} ${String(row.uniqueK2PreScoringPasses).padStart(7)} ${String(row.uniqueFinalEligibilityPasses).padStart(6)} ${String(row.duplicatePct).padStart(5)}%`,
  );
}

// ─── Write outputs ────────────────────────────────────────────────────────────

const outDir = resolve(scriptDir, "output");
mkdirSync(outDir, { recursive: true });

const jsonOut = resolve(outDir, "kids-query-comparison.json");
const csvOut = resolve(outDir, "kids-query-comparison.csv");
const cascadeCsvOut = resolve(outDir, "kids-query-cascade-comparison.csv");

const output = {
  generatedAt: new Date().toISOString(),
  totalQueries: results.length,
  rankedByK2YieldAbsolute: sorted.filter((r) => !r.error).map((r) => r.id),
  results,
  cascades: {
    routes: CASCADE_ROUTES,
    rankedByFinalThenPreScoring: cascadeSorted,
  },
  aggregate: {
    groupAverages: Object.fromEntries(
      groups.map((group) => {
        const rows = results.filter((r) => r.group === group && !r.error);
        return [group, {
          queryCount: rows.length,
          avgRaw: rows.length ? +(rows.reduce((s, r) => s + r.rawCount, 0) / rows.length).toFixed(1) : 0,
          avgShapeAdmitted: rows.length ? +(rows.reduce((s, r) => s + r.shapeAdmittedCount, 0) / rows.length).toFixed(1) : 0,
          avgK2PreScoring: rows.length ? +(rows.reduce((s, r) => s + r.preScoringPassCount, 0) / rows.length).toFixed(1) : 0,
        }];
      }),
    ),
    topK2Titles: topTitles.map(([title, count]) => ({ title, queriesPassedIn: count })),
    topRejectionReasons: [...allRejections.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([reason, count]) => ({ reason, count })),
  },
};

writeFileSync(jsonOut, JSON.stringify(output, null, 2));
console.log(`\nJSON written to: ${jsonOut}`);

const csvHeader = "id,group,query,apiTotalItems,rawCount,shapeAdmittedCount,audienceKidsCount,preScoringPassCount,finalEligibilityPassCount,shapeYieldPct,audienceYieldPct,k2YieldPct";
const csvRows = results
  .filter((r) => !r.error)
  .sort((a, b) => b.preScoringPassCount - a.preScoringPassCount)
  .map((r) =>
    [
      r.id, r.group,
      `"${r.query}"`,
      r.apiTotalItems, r.rawCount,
      r.shapeAdmittedCount, r.audienceKidsCount, r.preScoringPassCount, r.finalEligibilityPassCount,
      r.shapeYieldPct, r.audienceYieldPct, r.k2YieldPct,
    ].join(","),
  );
writeFileSync(csvOut, [csvHeader, ...csvRows].join("\n"));
console.log(`CSV written to: ${csvOut}`);

const cascadeCsvHeader = "routeId,routeLabel,querySetLabel,queryIds,uniqueRawNarrativeCandidates,uniquePublicationShapePasses,uniqueK2PreScoringPasses,uniqueFinalEligibilityPasses,duplicatePct,finalTitles,uniqueLeadAuthors,uniqueGenres";
const cascadeCsvRows = cascadeSorted.map((row) => [
  row.routeId,
  `"${row.routeLabel}"`,
  `"${row.querySetLabel}"`,
  `"${row.queryIds.join("|")}"`,
  row.uniqueRawNarrativeCandidates,
  row.uniquePublicationShapePasses,
  row.uniqueK2PreScoringPasses,
  row.uniqueFinalEligibilityPasses,
  row.duplicatePct,
  `"${row.finalProductionRecommendations.join(" | ").replace(/"/g, "\"\"")}"`,
  row.finalRecommendationDiversity.uniqueLeadAuthors,
  row.finalRecommendationDiversity.uniqueGenres,
].join(","));
writeFileSync(cascadeCsvOut, [cascadeCsvHeader, ...cascadeCsvRows].join("\n"));
console.log(`Cascade CSV written to: ${cascadeCsvOut}`);
