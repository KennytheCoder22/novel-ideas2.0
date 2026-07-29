/**
 * Teen Google Books trusted-evidence origin reconciliation audit (report-driven)
 *
 * Goal:
 * For weak/query-only candidates, trace where non-Google-native alignment signals
 * came from and classify them into trusted vs untrusted evidence channels.
 *
 * Usage:
 *   node scripts/run-v2-googlebooks-teen-evidence-origin-reconciliation-audit.mjs \
 *     --report <path> [--report <path> ...]
 *
 * Outputs:
 *   scripts/output/teen-evidence-origin-reconciliation-audit.json
 *   scripts/output/teen-evidence-origin-reconciliation-audit.csv
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(scriptDir, "output");

const CONTEXT_DEFAULT_SIGNALS = new Set([
  "indie genre",
  "mshs",
  "teen",
  "book",
  "young adult",
  "ya",
]);

function argValues(flag) {
  const values = [];
  for (let i = 0; i < process.argv.length; i += 1) {
    if (process.argv[i] === flag && process.argv[i + 1]) values.push(process.argv[i + 1]);
  }
  return values;
}

function normalize(v) {
  return String(v || "").trim().toLowerCase();
}

function mapObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function arrayValue(value) {
  return Array.isArray(value) ? value : [];
}

function parseReportLine(lines, prefix) {
  const marker = `${prefix}:`;
  const line = lines.find((entry) => entry.startsWith(marker));
  if (!line) return "";
  return line.slice(marker.length).trim();
}

function parseReportMap(lines, prefix) {
  const marker = `${prefix}:`;
  const line = lines.find((entry) => entry.startsWith(marker));
  if (!line) return {};
  const raw = line.slice(marker.length).trim();
  try {
    return mapObject(JSON.parse(raw));
  } catch {
    return {};
  }
}

function parseReportArray(lines, prefix) {
  const marker = `${prefix}:`;
  const line = lines.find((entry) => entry.startsWith(marker));
  if (!line) return [];
  const raw = line.slice(marker.length).trim();
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function splitPhrases(text) {
  return normalize(text)
    .split(/[^a-z0-9]+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

function phraseInText(phrase, text) {
  const p = normalize(phrase);
  if (!p) return false;
  return normalize(text).includes(p);
}

function wordsInText(phrase, text) {
  const words = splitPhrases(phrase);
  if (words.length === 0) return false;
  const hay = splitPhrases(text);
  const haySet = new Set(hay);
  return words.every((w) => haySet.has(w));
}

function classifySignalOrigin(signal, ctx) {
  const s = normalize(signal);
  if (!s) return "unknown";

  if (CONTEXT_DEFAULT_SIGNALS.has(s)) return "route_or_profile_context";

  if (ctx.queryFacets.has(s)) return "query_facet_context";

  if (ctx.queryFamilies.has(s)) return "query_family_context";

  if (phraseInText(s, ctx.builtQuery) || wordsInText(s, ctx.builtQuery)) return "planned_query_text_context";

  for (const rungQuery of ctx.rungQueries) {
    if (phraseInText(s, rungQuery) || wordsInText(s, rungQuery)) return "planned_query_text_context";
  }

  return "unresolved_normalized_non_native";
}

const reportPaths = argValues("--report");
if (reportPaths.length === 0) {
  throw new Error("No reports provided. Use --report <path> [--report <path> ...]");
}

const rows = [];
const perReport = [];
const originHistogram = {};

for (const reportPath of reportPaths) {
  const lines = readFileSync(reportPath, "utf8").split(/\r?\n/);
  const report = basename(reportPath);
  const presetTestName = parseReportLine(lines, "presetTestName") || report;
  const builtQuery = parseReportLine(lines, "Built Query");

  const rungQueries = lines
    .filter((line) => /^Rung \d+:\s+/i.test(line))
    .map((line) => line.replace(/^Rung \d+:\s+/i, "").trim())
    .filter(Boolean);

  const sourceFetchDiagnostics = parseReportArray(lines, "googleBooksSourceFetchDiagnostics");
  const queryFacets = new Set();
  const queryFamilies = new Set();
  for (const row of sourceFetchDiagnostics) {
    const facets = arrayValue(row?.facets).map((f) => normalize(f));
    for (const f of facets) if (f) queryFacets.add(f);
    const qf = normalize(row?.queryFamily || "");
    if (qf) queryFamilies.add(qf);
  }

  const classByTitle = parseReportMap(lines, "teenGoogleBooksMeaningfulTasteClassificationByTitle");
  const nativeSpecificByTitle = parseReportMap(lines, "teenGoogleBooksDocumentNativeSpecificSignalsByTitle");
  const queryOnlyByTitle = parseReportMap(lines, "teenGoogleBooksQueryFamilyOnlySignalsByTitle");
  const categoryOnlyByTitle = parseReportMap(lines, "teenGoogleBooksCategoryOnlySignalsByTitle");
  const genreByTitle = parseReportMap(lines, "teenGoogleBooksGenreSignalsByTitle");
  const wouldPassByTitle = parseReportMap(lines, "teenGoogleBooksWouldPassWithoutQueryDerivedEvidenceByTitle");
  const weakUnderfillByTitle = parseReportMap(lines, "teenGoogleBooksWeakCandidateUsedForUnderfillByTitle");
  const tierDecisionByTitle = parseReportMap(lines, "teenGoogleBooksTasteTierSelectionDecisionByTitle");
  const tierReasonByTitle = parseReportMap(lines, "teenGoogleBooksTasteTierSelectionReasonByTitle");

  const finalReasonByTitle = parseReportMap(lines, "googleBooksFinalEligibilityReasonByTitle");
  const finalDecisionByTitle = parseReportMap(lines, "googleBooksFinalEligibilityDecisionByTitle");

  const weakTitles = Object.keys(classByTitle).filter((t) => normalize(classByTitle[t]) === "query_supported_but_weak");
  let reportQueryOnlyUnresolvedCount = 0;

  for (const title of weakTitles) {
    const nativeSpecific = arrayValue(nativeSpecificByTitle[title]).map(String);
    const queryOnlySignals = arrayValue(queryOnlyByTitle[title]).map(String);
    const categoryOnlySignals = arrayValue(categoryOnlyByTitle[title]).map(String);
    const genreSignals = arrayValue(genreByTitle[title]).map(String);
    const wouldPass = Boolean(wouldPassByTitle[title] === true);

    const trustedEvidence = {
      googleNativeSpecificEvidence: nativeSpecific,
      googleNativeCategoryOnlyEvidence: categoryOnlySignals,
    };

    const context = { builtQuery, rungQueries, queryFacets, queryFamilies };
    const untrustedOrigins = [];
    for (const signal of queryOnlySignals) {
      const origin = classifySignalOrigin(signal, context);
      untrustedOrigins.push({ signal, origin });
      originHistogram[origin] = Number(originHistogram[origin] || 0) + 1;
    }

    const externalOrNormalizedGenreWithoutGoogleNative = genreSignals.length > 0 && nativeSpecific.length === 0;
    const queryOnlyUnresolved = !wouldPass && nativeSpecific.length === 0;
    if (queryOnlyUnresolved) reportQueryOnlyUnresolvedCount += 1;

    const trustClassification = queryOnlyUnresolved
      ? "untrusted_context_only"
      : nativeSpecific.length > 0
        ? "trusted_google_native_present"
        : "mixed_or_unclear";

    const row = {
      report,
      presetTestName,
      title,
      classification: "query_supported_but_weak",
      weakUsedForUnderfill: weakUnderfillByTitle[title] === true,
      tierDecision: String(tierDecisionByTitle[title] || ""),
      tierReason: String(tierReasonByTitle[title] || ""),
      finalEligibilityDecision: String(finalDecisionByTitle[title] || ""),
      finalEligibilityReason: String(finalReasonByTitle[title] || ""),
      candidateNativeSpecificSignalCount: nativeSpecific.length,
      queryOnlySignalCount: queryOnlySignals.length,
      categoryOnlySignalCount: categoryOnlySignals.length,
      genreSignalCount: genreSignals.length,
      wouldPassWithoutQueryEvidence: wouldPass,
      externalOrNormalizedGenreWithoutGoogleNative,
      queryOnlyUnresolved,
      trustClassification,
      trustedEvidence,
      untrustedOrigins,
    };

    rows.push(row);
  }

  perReport.push({
    report,
    presetTestName,
    weakCount: weakTitles.length,
    queryOnlyUnresolvedCount: reportQueryOnlyUnresolvedCount,
  });
}

const totalWeak = rows.length;
const queryOnlyUnresolvedCount = rows.filter((r) => r.queryOnlyUnresolved).length;
const weakUnderfillCount = rows.filter((r) => r.weakUsedForUnderfill).length;
const externalGenreWithoutNativeCount = rows.filter((r) => r.externalOrNormalizedGenreWithoutGoogleNative).length;

const trustedVsUntrusted = rows.reduce((acc, row) => {
  acc[row.trustClassification] = Number(acc[row.trustClassification] || 0) + 1;
  return acc;
}, {});

const titleSummaryMap = new Map();
for (const row of rows) {
  const existing = titleSummaryMap.get(row.title) || {
    title: row.title,
    seenCount: 0,
    underfillCount: 0,
    queryOnlyUnresolvedCount: 0,
    trustClassifications: {},
    topOrigins: {},
  };
  existing.seenCount += 1;
  if (row.weakUsedForUnderfill) existing.underfillCount += 1;
  if (row.queryOnlyUnresolved) existing.queryOnlyUnresolvedCount += 1;
  existing.trustClassifications[row.trustClassification] = Number(existing.trustClassifications[row.trustClassification] || 0) + 1;
  for (const entry of row.untrustedOrigins) {
    existing.topOrigins[entry.origin] = Number(existing.topOrigins[entry.origin] || 0) + 1;
  }
  titleSummaryMap.set(row.title, existing);
}

const titleSummaries = Array.from(titleSummaryMap.values())
  .sort((a, b) => b.queryOnlyUnresolvedCount - a.queryOnlyUnresolvedCount || b.underfillCount - a.underfillCount || b.seenCount - a.seenCount);

console.log("=== TEEN GB EVIDENCE-ORIGIN RECONCILIATION AUDIT ===");
console.log(`Reports analyzed: ${reportPaths.length}`);
console.log(`Weak candidates analyzed: ${totalWeak}`);
console.log(`query_only_unresolved candidates: ${queryOnlyUnresolvedCount}`);
console.log(`Weak candidates used for underfill: ${weakUnderfillCount}`);
console.log(`externalOrNormalizedGenreWithoutGoogleNative=true: ${externalGenreWithoutNativeCount}`);
console.log("\nTrusted vs untrusted classification:");
for (const key of ["trusted_google_native_present", "mixed_or_unclear", "untrusted_context_only"]) {
  const count = Number(trustedVsUntrusted[key] || 0);
  const pct = totalWeak > 0 ? ((count / totalWeak) * 100).toFixed(1) : "0.0";
  console.log(`  ${key}: ${count} (${pct}%)`);
}
console.log("\nUntrusted origin histogram:");
for (const [origin, count] of Object.entries(originHistogram).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${origin}: ${count}`);
}

const focusTitles = [
  "The Giver Illustrated Gift Edition",
  "The Red Queen",
  "The Red Queen: The Obernewtyn Chronicles Volume 7",
  "Starclimber",
  "Love Is Hell",
  "Your Eyes in Stars",
  "Last Chance Books",
];
const focusRows = rows.filter((row) => focusTitles.includes(row.title));
if (focusRows.length > 0) {
  console.log("\nFocus title provenance snapshots:");
  for (const row of focusRows) {
    const topOrigins = Object.entries(row.untrustedOrigins.reduce((acc, entry) => {
      acc[entry.origin] = Number(acc[entry.origin] || 0) + 1;
      return acc;
    }, {})).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join(" | ");
    console.log(`  ${row.title} | report=${row.presetTestName} | trust=${row.trustClassification} | nativeSpecific=${row.candidateNativeSpecificSignalCount} | queryOnly=${row.queryOnlySignalCount} | underfill=${row.weakUsedForUnderfill} | origins=${topOrigins || "(none)"}`);
  }
}

mkdirSync(outDir, { recursive: true });
const jsonOut = resolve(outDir, "teen-evidence-origin-reconciliation-audit.json");
const csvOut = resolve(outDir, "teen-evidence-origin-reconciliation-audit.csv");

const output = {
  generatedAt: new Date().toISOString(),
  inputs: reportPaths,
  aggregate: {
    totalWeak,
    queryOnlyUnresolvedCount,
    weakUnderfillCount,
    externalGenreWithoutNativeCount,
    trustedVsUntrusted,
    originHistogram,
  },
  perReport,
  titleSummaries,
  focusRows,
  rows,
};

writeFileSync(jsonOut, JSON.stringify(output, null, 2));
console.log(`\nJSON written to: ${jsonOut}`);

const csvHeader = [
  "report",
  "presetTestName",
  "title",
  "weakUsedForUnderfill",
  "tierDecision",
  "tierReason",
  "finalEligibilityReason",
  "trustClassification",
  "candidateNativeSpecificSignalCount",
  "queryOnlySignalCount",
  "categoryOnlySignalCount",
  "genreSignalCount",
  "wouldPassWithoutQueryEvidence",
  "externalOrNormalizedGenreWithoutGoogleNative",
  "queryOnlyUnresolved",
  "topUntrustedOrigins",
].join(",");

const csvRows = rows.map((row) => {
  const topOrigins = Object.entries(row.untrustedOrigins.reduce((acc, entry) => {
    acc[entry.origin] = Number(acc[entry.origin] || 0) + 1;
    return acc;
  }, {})).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join(" | ");

  return [
    `"${String(row.report).replace(/"/g, '""')}"`,
    `"${String(row.presetTestName).replace(/"/g, '""')}"`,
    `"${String(row.title).replace(/"/g, '""')}"`,
    row.weakUsedForUnderfill ? "true" : "false",
    `"${String(row.tierDecision).replace(/"/g, '""')}"`,
    `"${String(row.tierReason).replace(/"/g, '""')}"`,
    `"${String(row.finalEligibilityReason).replace(/"/g, '""')}"`,
    row.trustClassification,
    row.candidateNativeSpecificSignalCount,
    row.queryOnlySignalCount,
    row.categoryOnlySignalCount,
    row.genreSignalCount,
    row.wouldPassWithoutQueryEvidence ? "true" : "false",
    row.externalOrNormalizedGenreWithoutGoogleNative ? "true" : "false",
    row.queryOnlyUnresolved ? "true" : "false",
    `"${topOrigins.replace(/"/g, '""')}"`,
  ].join(",");
});

writeFileSync(csvOut, [csvHeader, ...csvRows].join("\n"));
console.log(`CSV written to: ${csvOut}`);
