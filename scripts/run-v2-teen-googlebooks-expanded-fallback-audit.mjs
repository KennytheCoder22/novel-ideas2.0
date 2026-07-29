/**
 * Teen Google Books expanded fallback root-cause audit.
 *
 * Runs 26 diverse Teen profiles through the production recommender (Google
 * Books only) and classifies each run into an A–G bucket with fallback-state
 * and confidence annotations.  Produces all summary tables required to assess
 * whether a single bucket clears the engineering dominance threshold.
 *
 * Usage:
 *   node scripts/run-v2-teen-googlebooks-expanded-fallback-audit.mjs
 *
 * No recommendation-policy changes.  Read-only diagnostic.
 */

import { createRequire } from "node:module";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  extractMetricsFromLiveResult,
  buildTeenGoogleBooksFallbackRootCauseBreakdown,
} from "./lib/teen-googlebooks-fallback-root-cause.mjs";
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

// Load API key from .env if not already set.
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
const localEnv = parseDotEnv(resolve(repoRoot, ".env"));
if (!process.env.EXPO_PUBLIC_GOOGLE_BOOKS_API_KEY && localEnv.EXPO_PUBLIC_GOOGLE_BOOKS_API_KEY) {
  process.env.EXPO_PUBLIC_GOOGLE_BOOKS_API_KEY = localEnv.EXPO_PUBLIC_GOOGLE_BOOKS_API_KEY;
}
if (!process.env.GOOGLE_BOOKS_API_KEY && localEnv.GOOGLE_BOOKS_API_KEY) {
  process.env.GOOGLE_BOOKS_API_KEY = localEnv.GOOGLE_BOOKS_API_KEY;
}

const LIMIT = 6;

// ── Run all profiles ──────────────────────────────────────────────────────────

console.log(`Running ${TEEN_AUDIT_PROFILES.length} Teen profiles through Google Books recommender…`);

const allRuns = [];
let skipped = 0;

for (const profile of TEEN_AUDIT_PROFILES) {
  process.stdout.write(`  [${profile.id}] `);
  let result;
  try {
    result = await runRecommenderV2({
      requestId: `teen-gb-expanded-audit-${profile.id}`,
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
  } catch (err) {
    console.log(`ERROR — ${err.message}`);
    skipped += 1;
    continue;
  }

  const metrics = extractMetricsFromLiveResult(result, profile.id, profile.label);
  if (!metrics) {
    console.log("SKIPPED (no GB fetch diagnostics)");
    skipped += 1;
    continue;
  }

  // Attach the profile-declared family for reporting; overridden by live
  // queryFamily if available.
  const run = { ...metrics, declaredFamily: profile.family };
  allRuns.push(run);
  console.log(
    `${run.bucket} | fallback=${run.fallbackState} | conf=${run.confidence} | ` +
    `primaryAccepted=${run.primaryAccepted} secondarySelected=${run.secondarySelected} ` +
    `finalSelected=${run.finalSelectedCount}`,
  );
}

console.log(`\nCompleted ${allRuns.length} runs (${skipped} skipped).`);

// ── Build breakdown ───────────────────────────────────────────────────────────

const breakdown = buildTeenGoogleBooksFallbackRootCauseBreakdown(allRuns);

// ── Persist output ────────────────────────────────────────────────────────────

mkdirSync(outDir, { recursive: true });

const jsonOut = resolve(outDir, "teen-googlebooks-expanded-fallback-audit.json");
const csvOut = resolve(outDir, "teen-googlebooks-expanded-fallback-audit.csv");
const summaryOut = resolve(outDir, "teen-googlebooks-expanded-fallback-audit-summary.txt");

writeFileSync(jsonOut, JSON.stringify({
  generatedAt: new Date().toISOString(),
  profileCount: TEEN_AUDIT_PROFILES.length,
  skipped,
  ...breakdown,
}, null, 2));

// CSV — one row per run
const csvHeader = [
  "profileId",
  "profileLabel",
  "declaredFamily",
  "liveQueryFamily",
  "primaryQuery",
  "primaryAccepted",
  "primarySelected",
  "secondaryAccepted",
  "secondarySelected",
  "finalSelectedCount",
  "primaryRawApiCount",
  "primaryNarrativeCandidates",
  "primaryPublicationRejectShare",
  "primaryWeakShare",
  "diversityExclusionCount",
  "secondaryQueryCount",
  "bucket",
  "secondaryContributor",
  "fallbackState",
  "confidence",
].join(",");

function csvEscape(value) {
  const str = String(value == null ? "" : value);
  return str.includes(",") || str.includes('"') ? `"${str.replace(/"/g, '""')}"` : str;
}

const csvRows = allRuns.map((run) => [
  run.profileId,
  csvEscape(run.profileLabel),
  run.declaredFamily,
  run.queryFamily || "",
  csvEscape(run.primaryQuery),
  run.primaryAccepted,
  run.primarySelected,
  run.secondaryAccepted,
  run.secondarySelected,
  run.finalSelectedCount,
  run.primaryRawApiCount,
  run.primaryNarrativeCandidates,
  Number(run.primaryPublicationRejectShare.toFixed(3)),
  Number(run.primaryWeakShare.toFixed(3)),
  run.diversityExclusionCount,
  run.secondaryQueryCount,
  run.bucket,
  run.secondaryContributor || "",
  run.fallbackState,
  run.confidence,
].join(","));

writeFileSync(csvOut, `${csvHeader}\n${csvRows.join("\n")}\n`);

// ── Human-readable summary ────────────────────────────────────────────────────

const b = breakdown.bucketCounts;
const fb = breakdown.fallbackStateCounts;
const bFs = breakdown.bucketCountsAmongFallbackSelected;
const bHc = breakdown.bucketCountsHighConfidence;
const dom = breakdown.dominance;

function formatBuckets(counts) {
  return [
    `  Primary sufficient (A) .......... ${counts.A_primary_query_succeeded}`,
    `  Recall shortage (B) ............. ${counts.B_insufficient_recall}`,
    `  Publication filtering (C) ....... ${counts.C_publication_filtering}`,
    `  Taste filtering (D) ............. ${counts.D_taste_filtering}`,
    `  Diversity filtering (E) ......... ${counts.E_diversity_filtering}`,
    `  Ranking/selection (F) ........... ${counts.F_ranking_selection}`,
    `  Query mismatch (G) .............. ${counts.G_query_mismatch}`,
  ].join("\n");
}

function formatFamilyBreakdown(qfb) {
  return Object.entries(qfb)
    .sort(([, a], [, b]) => b.count - a.count)
    .map(([family, data]) => {
      const topBucket = Object.entries(data.bucketCounts).sort(([, a], [, b]) => b - a)[0];
      return `  ${family.padEnd(24)} n=${data.count}  leading=${topBucket ? topBucket[0] : "none"}`;
    })
    .join("\n");
}

const summaryLines = [
  "═══════════════════════════════════════════════════════════════════",
  " Teen Google Books — expanded fallback root-cause audit",
  "═══════════════════════════════════════════════════════════════════",
  "",
  `Total profiles run .............. ${TEEN_AUDIT_PROFILES.length}`,
  `Skipped ......................... ${skipped}`,
  `Eligible runs ................... ${breakdown.totalRuns}`,
  `Classifiable runs ............... ${breakdown.classifiableRuns}`,
  `Ambiguous / low-confidence ...... ${breakdown.ambiguousRuns}`,
  "",
  "── Bucket counts (all runs) ─────────────────────────────────────",
  formatBuckets(b),
  "",
  "── Fallback state counts ────────────────────────────────────────",
  `  fallback_not_activated ......... ${fb.fallback_not_activated}`,
  `  fallback_activated_not_selected  ${fb.fallback_activated_not_selected}`,
  `  fallback_selected .............. ${fb.fallback_selected}`,
  `  fallback_required_for_slate .... ${fb.fallback_required_for_minimum_slate}`,
  "",
  "── Bucket counts — fallback_selected runs only ──────────────────",
  formatBuckets(bFs),
  "",
  "── Bucket counts — high-confidence runs only ────────────────────",
  formatBuckets(bHc),
  "",
  "── Query-family breakdown ───────────────────────────────────────",
  formatFamilyBreakdown(breakdown.queryFamilyBreakdown),
  "",
  "── Dominance assessment ─────────────────────────────────────────",
  `  Lead bucket .................... ${dom.leadBucket || "n/a"}`,
  `  Lead count ..................... ${dom.leadCount ?? "—"}`,
  `  Runner-up bucket ............... ${dom.runnerUpBucket || "n/a"}`,
  `  Runner-up count ................ ${dom.runnerUpCount ?? "—"}`,
  `  Count delta .................... ${dom.countDelta ?? "—"}`,
  `  Pct delta ...................... ${dom.pctDelta != null ? (dom.pctDelta * 100).toFixed(1) + "%" : "—"}`,
  `  Is dominant .................... ${dom.isDominant}`,
  `  Note ........................... ${dom.dominanceNote || "—"}`,
  "",
  "── Per-run assignments ──────────────────────────────────────────",
  ...allRuns.map((run) =>
    `  ${run.profileId.padEnd(36)} ${run.bucket}` +
    (run.secondaryContributor ? ` (+${run.secondaryContributor})` : "") +
    ` | ${run.fallbackState} | ${run.confidence}`,
  ),
  "",
  "═══════════════════════════════════════════════════════════════════",
];

writeFileSync(summaryOut, `${summaryLines.join("\n")}\n`);

console.log(`\nJSON:    ${jsonOut}`);
console.log(`CSV:     ${csvOut}`);
console.log(`Summary: ${summaryOut}`);
console.log(`\nDominance: ${dom.isDominant ? dom.leadBucket : "NO DOMINANT BUCKET — " + (dom.dominanceNote || "see summary")}`);
