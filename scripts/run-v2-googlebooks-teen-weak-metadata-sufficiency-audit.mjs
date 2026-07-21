/**
 * Teen Google Books weak-candidate metadata sufficiency audit (report-driven)
 *
 * Purpose:
 * - Diagnose why Teen GB candidates land in query_supported_but_weak
 * - Separate likely true weak matches from metadata-sparse/query-only uncertainty
 * - Identify whether weak dependence is primarily retrieval quality or metadata sparsity
 *
 * Usage:
 *   node scripts/run-v2-googlebooks-teen-weak-metadata-sufficiency-audit.mjs \
 *     --report <path> [--report <path> ...]
 *
 * Output:
 *   scripts/output/teen-weak-metadata-sufficiency-audit.json
 *   scripts/output/teen-weak-metadata-sufficiency-audit.csv
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(scriptDir, "output");

function argValues(flag) {
  const values = [];
  for (let i = 0; i < process.argv.length; i += 1) {
    if (process.argv[i] === flag && process.argv[i + 1]) values.push(process.argv[i + 1]);
  }
  return values;
}

function mapObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function arrayValue(value) {
  return Array.isArray(value) ? value : [];
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

function parseReportLine(lines, prefix) {
  const marker = `${prefix}:`;
  const line = lines.find((entry) => entry.startsWith(marker));
  if (!line) return "";
  return line.slice(marker.length).trim();
}

function asBool(v, fallback = false) {
  if (typeof v === "boolean") return v;
  if (v === "true") return true;
  if (v === "false") return false;
  return fallback;
}

function asNum(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function weakReason(row) {
  const identityReason = `${row.finalEligibilityReason} ${row.tierReason}`.toLowerCase();
  if (identityReason.includes("teen_googlebooks_publication_identity")) return "publication_identity_rejected";
  // Guard against over-counting generic disliked-signal overlaps; require negative net alignment.
  if (row.netScore < 0) return "negative_or_conflicting";
  if (row.metadataSparse) return "metadata_sparse_unresolved";
  if (!row.wouldPassWithoutQueryEvidence && row.candidateNativeSpecificSignalCount === 0) return "query_only_unresolved";
  return "likely_true_weak_match";
}

const reportPaths = argValues("--report");
if (reportPaths.length === 0) {
  throw new Error("No reports provided. Use --report <path> [--report <path> ...]");
}

const perReport = [];
const rows = [];

for (const reportPath of reportPaths) {
  const lines = readFileSync(reportPath, "utf8").split(/\r?\n/);
  const report = basename(reportPath);
  const presetTestName = parseReportLine(lines, "presetTestName") || report;

  const classByTitle = parseReportMap(lines, "teenGoogleBooksMeaningfulTasteClassificationByTitle");
  const decisionByTitle = parseReportMap(lines, "teenGoogleBooksTasteTierSelectionDecisionByTitle");
  const tierReasonByTitle = parseReportMap(lines, "teenGoogleBooksTasteTierSelectionReasonByTitle");
  const weakUnderfillByTitle = parseReportMap(lines, "teenGoogleBooksWeakCandidateUsedForUnderfillByTitle");
  const netByTitle = parseReportMap(lines, "teenGoogleBooksNetMeaningfulAlignmentScoreByTitle");
  const nativeSpecificByTitle = parseReportMap(lines, "teenGoogleBooksDocumentNativeSpecificSignalsByTitle");
  const queryOnlyByTitle = parseReportMap(lines, "teenGoogleBooksQueryFamilyOnlySignalsByTitle");
  const categoryOnlyByTitle = parseReportMap(lines, "teenGoogleBooksCategoryOnlySignalsByTitle");
  const genreSignalsByTitle = parseReportMap(lines, "teenGoogleBooksGenreSignalsByTitle");
  const wouldPassByTitle = parseReportMap(lines, "teenGoogleBooksWouldPassWithoutQueryDerivedEvidenceByTitle");

  const finalReasonByTitle = parseReportMap(lines, "googleBooksFinalEligibilityReasonByTitle");
  const finalDecisionByTitle = parseReportMap(lines, "googleBooksFinalEligibilityDecisionByTitle");
  const droppedReasonByTitle = parseReportMap(lines, "googleBooksDroppedReasonByTitle");
  const shapeByTitle = parseReportMap(lines, "googleBooksPublicationShapeByTitle");
  const storyEvidenceByTitle = parseReportMap(lines, "googleBooksStoryLevelNarrativeEvidenceByTitle");
  const descPresentByTitle = parseReportMap(lines, "googleBooksDescriptionPresentByTitle");
  const isbnPresentByTitle = parseReportMap(lines, "googleBooksIsbnPresentByTitle");
  const dislikedByTitle = parseReportMap(lines, "candidateMatchedDislikedSignalsByTitle");

  const weakTitles = Object.keys(classByTitle).filter((title) => String(classByTitle[title] || "") === "query_supported_but_weak");

  const reportRows = [];
  for (const title of weakTitles) {
    const nativeSpecificSignals = arrayValue(nativeSpecificByTitle[title]).map(String);
    const queryOnlySignals = arrayValue(queryOnlyByTitle[title]).map(String);
    const categoryOnlySignals = arrayValue(categoryOnlyByTitle[title]).map(String);
    const genreSignals = arrayValue(genreSignalsByTitle[title]).map(String);
    const storyEvidence = arrayValue(storyEvidenceByTitle[title]).map(String);
    const dislikedSignals = arrayValue(dislikedByTitle[title]).map(String);

    const row = {
      report,
      presetTestName,
      title,
      classification: "query_supported_but_weak",
      tierDecision: String(decisionByTitle[title] || ""),
      tierReason: String(tierReasonByTitle[title] || ""),
      weakUsedForUnderfill: asBool(weakUnderfillByTitle[title], false),
      finalEligibilityDecision: String(finalDecisionByTitle[title] || ""),
      finalEligibilityReason: String(finalReasonByTitle[title] || droppedReasonByTitle[title] || ""),
      publicationShape: String(shapeByTitle[title] || ""),
      descriptionPresent: asBool(descPresentByTitle[title], false),
      descriptionLength: null,
      isbnPresent: asBool(isbnPresentByTitle[title], false),
      candidateNativeSpecificSignalCount: nativeSpecificSignals.length,
      candidateNativeSpecificSignals: nativeSpecificSignals,
      queryFamilyOnlySignalCount: queryOnlySignals.length,
      queryFamilyOnlySignals: queryOnlySignals,
      categoryOnlySignalCount: categoryOnlySignals.length,
      categoryOnlySignals,
      genreSignalCount: genreSignals.length,
      genreSignals,
      storyNarrativeEvidenceCount: storyEvidence.length,
      storyNarrativeEvidence: storyEvidence,
      dislikedSignalCount: dislikedSignals.length,
      dislikedSignals,
      netScore: asNum(netByTitle[title], 0),
      wouldPassWithoutQueryEvidence: asBool(wouldPassByTitle[title], false),
      categoriesTasteEvidencePresent: categoryOnlySignals.length > 0,
      titleOrSubtitleOnlyEvidenceLikely: nativeSpecificSignals.length > 0 && storyEvidence.length === 0 && categoryOnlySignals.length === 0,
      externalOrNormalizedGenreWithoutGoogleNative: genreSignals.length > 0 && nativeSpecificSignals.length === 0,
      metadataSparse: !asBool(descPresentByTitle[title], false) && !asBool(isbnPresentByTitle[title], false) && storyEvidence.length === 0 && nativeSpecificSignals.length === 0,
    };

    row.weakReason = weakReason(row);

    rows.push(row);
    reportRows.push(row);
  }

  const countsByReason = reportRows.reduce((acc, row) => {
    acc[row.weakReason] = Number(acc[row.weakReason] || 0) + 1;
    return acc;
  }, {});

  perReport.push({
    report,
    presetTestName,
    weakCount: reportRows.length,
    weakUsedForUnderfillCount: reportRows.filter((r) => r.weakUsedForUnderfill).length,
    reasonCounts: countsByReason,
  });
}

const totals = {
  weakCount: rows.length,
  weakUsedForUnderfillCount: rows.filter((r) => r.weakUsedForUnderfill).length,
  reasonCounts: rows.reduce((acc, row) => {
    acc[row.weakReason] = Number(acc[row.weakReason] || 0) + 1;
    return acc;
  }, {}),
  metadataSparsityIndicators: {
    noDescription: rows.filter((r) => !r.descriptionPresent).length,
    noIsbn: rows.filter((r) => !r.isbnPresent).length,
    zeroNativeSpecificSignals: rows.filter((r) => r.candidateNativeSpecificSignalCount === 0).length,
    queryOnlyWithoutNative: rows.filter((r) => !r.wouldPassWithoutQueryEvidence && r.candidateNativeSpecificSignalCount === 0).length,
    externalGenreWithoutNative: rows.filter((r) => r.externalOrNormalizedGenreWithoutGoogleNative).length,
  },
};

const weakByTitle = new Map();
for (const row of rows) {
  const existing = weakByTitle.get(row.title) || {
    title: row.title,
    seenCount: 0,
    usedForUnderfillCount: 0,
    reasons: {},
    reports: [],
  };
  existing.seenCount += 1;
  if (row.weakUsedForUnderfill) existing.usedForUnderfillCount += 1;
  existing.reasons[row.weakReason] = Number(existing.reasons[row.weakReason] || 0) + 1;
  if (!existing.reports.includes(row.report)) existing.reports.push(row.report);
  weakByTitle.set(row.title, existing);
}

const repeatedWeakTitles = Array.from(weakByTitle.values())
  .filter((entry) => entry.seenCount >= 2)
  .sort((a, b) => b.seenCount - a.seenCount || b.usedForUnderfillCount - a.usedForUnderfillCount);

const knownFocusTitles = [
  "The Giver Illustrated Gift Edition",
  "The Red Queen",
  "The Red Queen: The Obernewtyn Chronicles Volume 7",
  "Starclimber",
  "Love Is Hell",
  "Your Eyes in Stars",
];
const focusTitleRows = rows.filter((row) => knownFocusTitles.includes(row.title));

console.log("=== TEEN GB WEAK-CANDIDATE METADATA SUFFICIENCY AUDIT ===");
console.log(`Reports analyzed: ${reportPaths.length}`);
console.log(`Weak candidates analyzed: ${totals.weakCount}`);
console.log(`Weak candidates used for underfill: ${totals.weakUsedForUnderfillCount}`);
console.log("\nWeak reason breakdown:");
for (const reason of ["likely_true_weak_match", "metadata_sparse_unresolved", "query_only_unresolved", "negative_or_conflicting", "publication_identity_rejected"]) {
  const count = Number(totals.reasonCounts[reason] || 0);
  const pct = totals.weakCount > 0 ? ((count / totals.weakCount) * 100).toFixed(1) : "0.0";
  console.log(`  ${reason}: ${count} (${pct}%)`);
}
console.log("\nMetadata sparsity indicators:");
console.log(`  noDescription: ${totals.metadataSparsityIndicators.noDescription}`);
console.log(`  noIsbn: ${totals.metadataSparsityIndicators.noIsbn}`);
console.log(`  zeroNativeSpecificSignals: ${totals.metadataSparsityIndicators.zeroNativeSpecificSignals}`);
console.log(`  queryOnlyWithoutNative: ${totals.metadataSparsityIndicators.queryOnlyWithoutNative}`);
console.log(`  externalGenreWithoutNative: ${totals.metadataSparsityIndicators.externalGenreWithoutNative}`);

if (repeatedWeakTitles.length > 0) {
  console.log("\nRepeated weak titles (seen >=2):");
  for (const row of repeatedWeakTitles.slice(0, 20)) {
    const topReason = Object.entries(row.reasons).sort((a, b) => b[1] - a[1])[0]?.[0] || "unknown";
    console.log(`  [${row.seenCount}x, underfill ${row.usedForUnderfillCount}x] ${row.title} | topReason=${topReason}`);
  }
}

if (focusTitleRows.length > 0) {
  console.log("\nFocus title snapshots:");
  for (const row of focusTitleRows) {
    console.log(`  ${row.title} | report=${row.presetTestName} | reason=${row.weakReason} | nativeSpecific=${row.candidateNativeSpecificSignalCount} | queryOnly=${row.queryFamilyOnlySignalCount} | desc=${row.descriptionPresent} | isbn=${row.isbnPresent} | underfill=${row.weakUsedForUnderfill}`);
  }
}

mkdirSync(outDir, { recursive: true });
const jsonOut = resolve(outDir, "teen-weak-metadata-sufficiency-audit.json");
const csvOut = resolve(outDir, "teen-weak-metadata-sufficiency-audit.csv");

const output = {
  generatedAt: new Date().toISOString(),
  inputs: reportPaths,
  totals,
  perReport,
  repeatedWeakTitles,
  focusTitleRows,
  rows,
};
writeFileSync(jsonOut, JSON.stringify(output, null, 2));
console.log(`\nJSON written to: ${jsonOut}`);

const csvHeader = [
  "report", "presetTestName", "title", "weakReason", "weakUsedForUnderfill",
  "finalEligibilityReason", "tierReason", "publicationShape", "descriptionPresent", "descriptionLength",
  "isbnPresent", "candidateNativeSpecificSignalCount", "queryFamilyOnlySignalCount", "categoryOnlySignalCount",
  "genreSignalCount", "storyNarrativeEvidenceCount", "dislikedSignalCount", "netScore",
  "wouldPassWithoutQueryEvidence", "externalOrNormalizedGenreWithoutGoogleNative", "metadataSparse",
].join(",");

const csvRows = rows.map((row) => [
  `"${String(row.report).replace(/"/g, '""')}"`,
  `"${String(row.presetTestName).replace(/"/g, '""')}"`,
  `"${String(row.title).replace(/"/g, '""')}"`,
  row.weakReason,
  row.weakUsedForUnderfill ? "true" : "false",
  `"${String(row.finalEligibilityReason).replace(/"/g, '""')}"`,
  `"${String(row.tierReason).replace(/"/g, '""')}"`,
  `"${String(row.publicationShape).replace(/"/g, '""')}"`,
  row.descriptionPresent ? "true" : "false",
  row.descriptionLength === null ? "" : row.descriptionLength,
  row.isbnPresent ? "true" : "false",
  row.candidateNativeSpecificSignalCount,
  row.queryFamilyOnlySignalCount,
  row.categoryOnlySignalCount,
  row.genreSignalCount,
  row.storyNarrativeEvidenceCount,
  row.dislikedSignalCount,
  row.netScore,
  row.wouldPassWithoutQueryEvidence ? "true" : "false",
  row.externalOrNormalizedGenreWithoutGoogleNative ? "true" : "false",
  row.metadataSparse ? "true" : "false",
].join(","));

writeFileSync(csvOut, [csvHeader, ...csvRows].join("\n"));
console.log(`CSV written to: ${csvOut}`);

