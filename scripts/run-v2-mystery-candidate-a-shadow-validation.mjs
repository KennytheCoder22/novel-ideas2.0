/**
 * Mystery Candidate A shadow production validation
 *
 * Runs the COMPLETE production pipeline (all sources enabled) on 4 mystery
 * profiles under two configurations:
 *   Control   — current production query: "young adult mystery fiction novel"
 *   Candidate A — "teen mystery thriller novel"
 *
 * Unlike the A/B/C/D retrieval experiment (Google Books only), this validation
 * includes Open Library and all other enabled sources, matching the exact pipeline
 * users experience in production. Measures:
 *   - Final slate size and quality (avg score, min score, weak-fit count)
 *   - Source blend (GB vs OL vs other contributions)
 *   - Fallback activation and fallback necessity
 *   - Author diversity in final slate
 *   - Unexpected route interactions
 *
 * Confirmation criteria (all must pass):
 *   S1. GB accepted ≥ control + 2 for ≥ 3/4 profiles (yield improvement persists)
 *   S2. Final selected ≥ control for ≥ 3/4 profiles (no slate regression)
 *   S3. Average relevance score ≥ control − 0.5 (quality tolerance for source-blend variation)
 *   S4. Weak-fit selections ≤ control
 *   S5. Fallback activation reduced or unchanged
 *   S6. No profile starves (selected ≥ 5 for ≥ 3/4 profiles)
 *
 * Outputs:
 *   scripts/output/mystery-candidate-a-shadow-validation.json
 *   scripts/output/mystery-candidate-a-shadow-validation-summary.txt
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
for (const key of ["EXPO_PUBLIC_GOOGLE_BOOKS_API_KEY", "GOOGLE_BOOKS_API_KEY"]) {
  if (!process.env[key] && localEnv[key]) process.env[key] = localEnv[key];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function asNum(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }
function asStr(v) { return String(v || "").trim(); }
function asObject(v) { return v && typeof v === "object" && !Array.isArray(v) ? v : {}; }
function asArray(v) { return Array.isArray(v) ? v : []; }

const WEAK_FIT_THRESHOLD = 0.4;
const LIMIT = 6;

// ── Profiles: all 4 mystery families from the 26-profile corpus ───────────────

const MYSTERY_PROFILES = [
  {
    id: "mystery-classic-whodunit",
    label: "Classic whodunit",
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
    label: "Psychological thriller",
    ageBand: "teens",
    signals: [
      { action: "like", title: "We Were Liars", source: "googleBooks", format: "book", genres: ["mystery"], tones: ["atmospheric", "suspenseful"], themes: ["memory", "family secrets"] },
      { action: "like", title: "The Female of the Species", source: "googleBooks", format: "book", genres: ["mystery", "thriller"], tones: ["dark", "tense"], themes: ["revenge"] },
      { action: "like", title: "Allegedly", source: "googleBooks", format: "book", genres: ["thriller", "mystery"], tones: ["unsettling"], themes: ["unreliable narrator"] },
      { action: "dislike", title: "Eragon", source: "googleBooks", format: "book", genres: ["fantasy"], tones: ["adventurous"] },
      { action: "dislike", title: "City of Bones", source: "googleBooks", format: "book", genres: ["fantasy"], tones: ["action-packed"] },
    ],
  },
  {
    id: "mystery-detective-crime",
    label: "Detective and crime",
    ageBand: "teens",
    signals: [
      { action: "like", title: "I Am the Messenger", source: "googleBooks", format: "book", genres: ["mystery", "general"], tones: ["introspective"], themes: ["helping others", "identity"] },
      { action: "like", title: "The Westing Game", source: "googleBooks", format: "book", genres: ["mystery"], tones: ["clever"], themes: ["puzzles", "clues", "competition"] },
      { action: "like", title: "Holes", source: "googleBooks", format: "book", genres: ["mystery", "adventure"], tones: ["quirky"], themes: ["justice", "secrets"] },
      { action: "dislike", title: "Breaking Dawn", source: "googleBooks", format: "book", genres: ["romance", "fantasy"] },
      { action: "skip", title: "Catching Fire", source: "googleBooks", format: "book", genres: ["science fiction"] },
    ],
  },
  {
    id: "mystery-cozy-amateur",
    label: "Cozy amateur-sleuth",
    ageBand: "teens",
    signals: [
      { action: "like", title: "The Inheritance Games", source: "googleBooks", format: "book", genres: ["mystery"], tones: ["fun", "page-turning"], themes: ["puzzles", "inheritance"] },
      { action: "like", title: "Sadie", source: "googleBooks", format: "book", genres: ["mystery"], tones: ["urgent", "suspenseful"], themes: ["missing persons", "justice"] },
      { action: "dislike", title: "Divergent", source: "googleBooks", format: "book", genres: ["science fiction"], tones: ["grim"] },
      { action: "dislike", title: "Maze Runner", source: "googleBooks", format: "book", genres: ["science fiction"], tones: ["dark"] },
      { action: "skip", title: "Shadow and Bone", source: "googleBooks", format: "book", genres: ["fantasy"] },
    ],
  },
];

// ── Extract per-run metrics (full-pipeline version) ───────────────────────────

function extractFullPipelineMetrics(variantId, profileId, profileLabel, result) {
  const diagnostics = asObject(asObject(result).diagnostics);
  const sources = asArray(diagnostics.sources);

  // Google Books diagnostics
  const gbSource = asObject(sources.find((s) => asStr(asObject(s).source) === "googleBooks"));
  const gbFetches = asArray(gbSource.googleBooksSourceFetchDiagnostics);
  const gbPrimary = asObject(gbFetches.find((f) => asNum(asObject(f).queryCascadeIndex) === 0));
  const primaryQuery = asStr(gbPrimary.originalPlannedQuery || gbPrimary.query);
  const gbAcceptedPrimary = asNum(gbPrimary.acceptedAfterSourcePolicy);
  const gbRaw = asNum(gbPrimary.rawApiCount);

  // Did fallback activate?
  const gbFallbackFetches = gbFetches.filter((f) => asNum(asObject(f).queryCascadeIndex) > 0);
  const gbFallbackActivated = gbFallbackFetches.length > 0;
  const gbFallbackAccepted = gbFallbackFetches.reduce((sum, f) => sum + asNum(asObject(f).acceptedAfterSourcePolicy), 0);

  // Open Library diagnostics
  const olSource = asObject(sources.find((s) => asStr(asObject(s).source) === "openLibrary"));
  const olRawCount = asNum(asObject(olSource).rawCount) || asNum(asObject(olSource).rawItems);

  // Final selected items
  const selectedItems = asArray(asObject(result).items);
  const scores = selectedItems.map((item) => asNum(asObject(item).score)).filter((s) => s > 0);
  const avgScore = scores.length ? Number((scores.reduce((a, s) => a + s, 0) / scores.length).toFixed(3)) : 0;
  const minScore = scores.length ? Number(Math.min(...scores).toFixed(3)) : 0;
  const weakFitCount = scores.filter((s) => s < WEAK_FIT_THRESHOLD).length;

  // Source blend: which source contributed each selected item
  const gbQueryByTitle = asObject(gbSource.googleBooksQueryByTitle);
  const selectedTitles = selectedItems.map((item) => asStr(asObject(item).title));
  let gbContrib = 0;
  let olContrib = 0;
  let otherContrib = 0;
  for (const item of selectedItems) {
    const title = asStr(asObject(item).title);
    const sourceId = asStr(asObject(item).sourceId || asObject(item).source || "");
    if (sourceId.startsWith("gb_") || gbQueryByTitle[title] || gbQueryByTitle[title.toLowerCase()]) {
      gbContrib++;
    } else if (sourceId.startsWith("ol_") || sourceId.startsWith("openlibrary") || asStr(asObject(item).workKey || "").startsWith("/works/OL")) {
      olContrib++;
    } else if (asStr(asObject(item).id || "").includes("openLibrary") || asStr(asObject(item).id || "").startsWith("/works/")) {
      olContrib++;
    } else {
      otherContrib++;
    }
  }

  // Author diversity pressure
  const authorCounts = new Map();
  for (const item of selectedItems) {
    const authors = asArray(asObject(item).authors);
    const first = asStr(authors[0]).toLowerCase();
    if (first) authorCounts.set(first, (authorCounts.get(first) || 0) + 1);
  }
  const dupAuthorPairs = [...authorCounts.values()].reduce((sum, c) => sum + (c >= 2 ? c - 1 : 0), 0);

  // Selected titles for inspection
  const selectedTitleList = selectedItems.map((item) => {
    const row = asObject(item);
    return {
      title: asStr(row.title).slice(0, 60),
      score: asNum(row.score),
      authors: asArray(row.authors).map((a) => asStr(a)).slice(0, 2),
      sourceId: asStr(row.id || "").slice(0, 40),
    };
  });

  // Fallback necessity: did selected < limit without fallback?
  const gbRequiredFallback = gbFallbackActivated && gbFallbackAccepted > 0 && gbAcceptedPrimary < LIMIT;

  return {
    variantId,
    profileId,
    profileLabel,
    primaryQuery,
    gbRaw,
    gbAcceptedPrimary,
    gbFallbackActivated,
    gbFallbackAccepted,
    gbRequiredFallback,
    gbContrib,
    olContrib,
    otherContrib,
    finalSelected: selectedItems.length,
    avgScore,
    minScore,
    weakFitCount,
    dupAuthorPairs,
    selectedTitles: selectedTitleList,
  };
}

// ── Run both variants ─────────────────────────────────────────────────────────

const VARIANTS = [
  { id: "control", label: "Control", query: "" },
  { id: "candidate_a", label: "Candidate A", query: "teen mystery thriller novel" },
];

const allResults = [];

for (const variant of VARIANTS) {
  console.log(`\nVariant: ${variant.label} "${variant.query || "production mystery query"}"`);

  const variantRows = [];

  for (const profile of MYSTERY_PROFILES) {
    const start = Date.now();
    process.stdout.write(`  [${profile.id}] ... `);

    const result = await runRecommenderV2({
      requestId: `mystery-shadow-${variant.id}-${profile.id}`,
      ageBand: profile.ageBand,
      limit: LIMIT,
      // Full production source mix for teens: Google Books + Open Library
      enabledSources: {
        googleBooks: true,
        openLibrary: true,
        kitsu: false,
        comicVine: false,
        localLibrary: false,
        nyt: false,
        mock: false,
      },
      signals: profile.signals,
    });

    const elapsed = Date.now() - start;
    const row = extractFullPipelineMetrics(variant.id, profile.id, profile.label, result);
    row.wallClockMs = elapsed;
    variantRows.push(row);

    console.log(
      `GBprimary=${row.gbAcceptedPrimary}  selected=${row.finalSelected}`
      + ` (GB=${row.gbContrib} OL=${row.olContrib} other=${row.otherContrib})`
      + `  score=${row.avgScore}  fallback=${row.gbFallbackActivated}  ${elapsed}ms`,
    );
  }

  allResults.push({ variant, rows: variantRows });
}

// ── Aggregate ─────────────────────────────────────────────────────────────────

function avg(rows, field) {
  return Number((rows.reduce((s, r) => s + asNum(r[field]), 0) / rows.length).toFixed(2));
}

const aggregates = allResults.map(({ variant, rows }) => ({
  variantId: variant.id,
  variantLabel: variant.label,
  queryUsed: rows[0]?.primaryQuery ?? "",
  avgGbAcceptedPrimary: avg(rows, "gbAcceptedPrimary"),
  avgFinalSelected: avg(rows, "finalSelected"),
  avgScore: avg(rows, "avgScore"),
  totalWeakFit: rows.reduce((s, r) => s + asNum(r.weakFitCount), 0),
  totalDupAuthor: rows.reduce((s, r) => s + asNum(r.dupAuthorPairs), 0),
  fallbackActivatedCount: rows.filter((r) => r.gbFallbackActivated).length,
  fallbackRequiredCount: rows.filter((r) => r.gbRequiredFallback).length,
  fullSlateCount: rows.filter((r) => r.finalSelected >= LIMIT).length,
  avgGbContrib: avg(rows, "gbContrib"),
  avgOlContrib: avg(rows, "olContrib"),
}));

// ── Confirmation gate evaluation ──────────────────────────────────────────────

const CONTROL_AGG = aggregates.find((a) => a.variantId === "control");
const CANDIDATE_A_AGG = aggregates.find((a) => a.variantId === "candidate_a");
const controlRows = allResults.find((r) => r.variant.id === "control").rows;
const candidateRows = allResults.find((r) => r.variant.id === "candidate_a").rows;

// S1: GB accepted ≥ control + 2 for ≥ 3/4 profiles
const s1Profiles = candidateRows.filter((r) => {
  const ctrl = controlRows.find((cr) => cr.profileId === r.profileId);
  return ctrl && r.gbAcceptedPrimary >= ctrl.gbAcceptedPrimary + 2;
}).length;
const s1 = s1Profiles >= 3;

// S2: Final selected ≥ control for ≥ 3/4 profiles
const s2Profiles = candidateRows.filter((r) => {
  const ctrl = controlRows.find((cr) => cr.profileId === r.profileId);
  return ctrl && r.finalSelected >= ctrl.finalSelected;
}).length;
const s2 = s2Profiles >= 3;

// S3: Avg relevance score ≥ control − 0.5
const s3 = CANDIDATE_A_AGG.avgScore >= CONTROL_AGG.avgScore - 0.5;

// S4: Weak-fit ≤ control
const s4 = CANDIDATE_A_AGG.totalWeakFit <= CONTROL_AGG.totalWeakFit;

// S5: Fallback activation reduced or unchanged
const s5 = CANDIDATE_A_AGG.fallbackActivatedCount <= CONTROL_AGG.fallbackActivatedCount;

// S6: No starvation — selected ≥ 5 for ≥ 3/4 profiles
const s6Profiles = candidateRows.filter((r) => r.finalSelected >= 5).length;
const s6 = s6Profiles >= 3;

const allConfirmed = s1 && s2 && s3 && s4 && s5 && s6;

// ── Write outputs ─────────────────────────────────────────────────────────────

mkdirSync(outDir, { recursive: true });
const jsonOut = resolve(outDir, "mystery-candidate-a-shadow-validation.json");
const summaryOut = resolve(outDir, "mystery-candidate-a-shadow-validation-summary.txt");

writeFileSync(jsonOut, JSON.stringify({
  generatedAt: new Date().toISOString(),
  profiles: MYSTERY_PROFILES.map(({ id, label }) => ({ id, label })),
  variants: VARIANTS,
  aggregates,
  confirmationGates: { s1, s2, s3, s4, s5, s6, allConfirmed, s1Profiles, s2Profiles, s6Profiles },
  allRuns: allResults.map(({ variant, rows }) => ({ variantId: variant.id, rows })),
}, null, 2));

// ── Summary text ──────────────────────────────────────────────────────────────

function d(a, b) { const v = Number((a - b).toFixed(2)); return v >= 0 ? `+${v}` : String(v); }
function pad(s, n, r = false) { return String(s)[r ? "padStart" : "padEnd"](n); }

const lines = [];
lines.push("═══════════════════════════════════════════════════════════════════");
lines.push(" Mystery Candidate A — shadow production validation");
lines.push(" Full pipeline (all sources enabled) • 4 mystery profiles");
lines.push("═══════════════════════════════════════════════════════════════════");
lines.push("");
lines.push("── Aggregate comparison ─────────────────────────────────────────────");
lines.push(`  ${"".padEnd(14)}  ${"query".padEnd(42)}  ${"GBprim".padStart(7)}  ${"selected".padStart(9)}  ${"score".padStart(7)}  ${"weakfit".padStart(8)}  ${"fbAct".padStart(6)}  ${"gbC".padStart(4)}  ${"olC".padStart(4)}`);
for (const agg of aggregates) {
  const isCtrl = agg.variantId === "control";
  const selD = isCtrl ? "" : ` (${d(agg.avgFinalSelected, CONTROL_AGG.avgFinalSelected)})`;
  const scoD = isCtrl ? "" : ` (${d(agg.avgScore, CONTROL_AGG.avgScore)})`;
  const gbD = isCtrl ? "" : ` (${d(agg.avgGbAcceptedPrimary, CONTROL_AGG.avgGbAcceptedPrimary)})`;
  lines.push(`  ${pad(agg.variantId, 14)}  ${pad(agg.queryUsed.slice(0, 42), 42)}  ${pad(`${agg.avgGbAcceptedPrimary}${gbD}`, 7, true)}  ${pad(`${agg.avgFinalSelected}${selD}`, 9, true)}  ${pad(`${agg.avgScore}${scoD}`, 7, true)}  ${pad(agg.totalWeakFit, 8, true)}  ${pad(`${agg.fallbackActivatedCount}/4`, 6, true)}  ${pad(agg.avgGbContrib, 4, true)}  ${pad(agg.avgOlContrib, 4, true)}`);
}
lines.push("");

lines.push("── Per-profile comparison ───────────────────────────────────────────");
for (const profile of MYSTERY_PROFILES) {
  lines.push(`  ${profile.id}`);
  for (const { variant, rows } of allResults) {
    const row = rows.find((r) => r.profileId === profile.id);
    if (!row) continue;
    const ctrlRow = controlRows.find((r) => r.profileId === profile.id);
    const gbD = ctrlRow ? ` (${d(row.gbAcceptedPrimary, ctrlRow.gbAcceptedPrimary)})` : "";
    const selD = ctrlRow ? ` (${d(row.finalSelected, ctrlRow.finalSelected)})` : "";
    lines.push(
      `    ${pad(variant.id, 12)}`
      + ` GBprim=${row.gbAcceptedPrimary}${gbD}`
      + `  selected=${row.finalSelected}${selD}`
      + ` (GB=${row.gbContrib} OL=${row.olContrib})`
      + `  score=${row.avgScore}`
      + `  fallback=${row.gbFallbackActivated}${row.gbRequiredFallback ? "(required)" : ""}`
      + `  weakfit=${row.weakFitCount}`,
    );
  }
  lines.push("");
}

lines.push("── Candidate A selected slates ──────────────────────────────────────");
const candidateRunRows = allResults.find((r) => r.variant.id === "candidate_a").rows;
for (const row of candidateRunRows) {
  lines.push(`  ${row.profileId}`);
  for (const item of row.selectedTitles) {
    const weak = item.score < WEAK_FIT_THRESHOLD ? " [WEAK]" : "";
    lines.push(`    ${pad(item.score.toFixed(3), 8)}  ${item.title}${weak}`);
  }
  lines.push("");
}

lines.push("── Confirmation gates ───────────────────────────────────────────────");
lines.push(`  S1. GB primary accepted ≥ control+2 for ≥ 3/4 profiles:  ${s1 ? "✓" : "✗"}  (${s1Profiles}/4 profiles pass)`);
lines.push(`  S2. Final selected ≥ control for ≥ 3/4 profiles:         ${s2 ? "✓" : "✗"}  (${s2Profiles}/4 profiles pass)`);
lines.push(`  S3. Avg score ≥ control − 0.5:                            ${s3 ? "✓" : "✗"}  (${CANDIDATE_A_AGG.avgScore} vs control ${CONTROL_AGG.avgScore})`);
lines.push(`  S4. Weak-fit selections ≤ control:                        ${s4 ? "✓" : "✗"}  (${CANDIDATE_A_AGG.totalWeakFit} vs control ${CONTROL_AGG.totalWeakFit})`);
lines.push(`  S5. Fallback activation ≤ control:                        ${s5 ? "✓" : "✗"}  (${CANDIDATE_A_AGG.fallbackActivatedCount}/4 vs control ${CONTROL_AGG.fallbackActivatedCount}/4)`);
lines.push(`  S6. Selected ≥ 5 for ≥ 3/4 profiles:                      ${s6 ? "✓" : "✗"}  (${s6Profiles}/4 profiles pass)`);
lines.push("");

lines.push("═══════════════════════════════════════════════════════════════════");
lines.push(" SHADOW VALIDATION VERDICT");
lines.push("═══════════════════════════════════════════════════════════════════");
if (allConfirmed) {
  lines.push("  CONFIRMED — Candidate A shadow validation passes.");
  lines.push("  Production promotion recommended.");
  lines.push("");
  lines.push("  Recommended change to searchPlan.ts:");
  lines.push("    Replace mystery primary query default:");
  lines.push("      Before: return `${agePrefix} mystery fiction novel`;");
  lines.push("      After:  return \"teen mystery thriller novel\";");
  lines.push("");
  lines.push("  Close investigation as: Production Validated.");
  lines.push(`  Before: avg GB primary accepted = ${CONTROL_AGG.avgGbAcceptedPrimary}`);
  lines.push(`  After:  avg GB primary accepted = ${CANDIDATE_A_AGG.avgGbAcceptedPrimary}`);
  lines.push(`  Score delta: ${d(CANDIDATE_A_AGG.avgScore, CONTROL_AGG.avgScore)}`);
} else {
  const failed = [
    !s1 && `S1 (yield improvement consistent): only ${s1Profiles}/4 profiles pass`,
    !s2 && `S2 (no slate regression): only ${s2Profiles}/4 profiles pass`,
    !s3 && `S3 (quality): ${CANDIDATE_A_AGG.avgScore} vs control ${CONTROL_AGG.avgScore}`,
    !s4 && `S4 (weak-fit): ${CANDIDATE_A_AGG.totalWeakFit} vs control ${CONTROL_AGG.totalWeakFit}`,
    !s5 && `S5 (fallback): ${CANDIDATE_A_AGG.fallbackActivatedCount}/4 vs control ${CONTROL_AGG.fallbackActivatedCount}/4`,
    !s6 && `S6 (no starvation): only ${s6Profiles}/4 profiles reach ≥5`,
  ].filter(Boolean);
  lines.push("  NOT CONFIRMED — Shadow validation failed.");
  lines.push("  Do not promote Candidate A.");
  lines.push("");
  lines.push(`  Failed gates (${failed.length}):`);
  for (const f of failed) lines.push(`    • ${f}`);
}
lines.push("═══════════════════════════════════════════════════════════════════");

writeFileSync(summaryOut, `${lines.join("\n")}\n`);
console.log(`\nJSON:    ${jsonOut}`);
console.log(`Summary: ${summaryOut}`);
