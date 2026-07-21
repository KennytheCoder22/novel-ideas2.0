/**
 * Teen Google Books trusted-evidence reconciliation counterfactual (report-driven)
 *
 * Diagnostic-only:
 * - Starts from current Teen GB taste classifications
 * - Re-evaluates weak candidates using only trusted book-backed evidence provenance
 * - Computes before/after slate quality counters and weak-underfill dependence
 *
 * Trusted provenance channels:
 *   google_title_native
 *   google_subtitle_native
 *   google_description_native
 *   google_category_native_specific
 *   verified_same_work_metadata (if surfaced in evidence tokens)
 *   verified_same_isbn_metadata (if surfaced in evidence tokens)
 *
 * Explicitly excluded:
 *   route/profile context, query facets, query family, planned query text,
 *   unresolved normalized non-native evidence.
 *
 * Usage:
 *   node scripts/run-v2-googlebooks-teen-trusted-reconciliation-counterfactual.mjs \
 *     --report <path> [--report <path> ...]
 *
 * Outputs:
 *   scripts/output/teen-trusted-reconciliation-counterfactual.json
 *   scripts/output/teen-trusted-reconciliation-counterfactual.csv
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(scriptDir, "output");

const GENERIC_CONTEXT_SIGNALS = new Set([
  "indie genre",
  "mshs",
  "teen",
  "book",
  "fiction",
  "school",
  "drama",
  "family",
  "identity",
  "film",
  "comedy",
  "community",
  "series",
  "young adult",
  "ya",
]);

const TRUSTED_PROVENANCE_FIELDS = new Set(["title", "subtitle", "description", "categories"]);

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

function parseLine(lines, prefix) {
  const marker = `${prefix}:`;
  const line = lines.find((entry) => entry.startsWith(marker));
  if (!line) return "";
  return line.slice(marker.length).trim();
}

function parseMap(lines, prefix) {
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

function parseRejectedReasonsMap(lines) {
  const raw = parseLine(lines, "rejectedReasons");
  if (!raw) return {};
  try {
    return mapObject(JSON.parse(raw));
  } catch {
    return {};
  }
}

function asNum(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function provenanceTagForField(field) {
  if (field === "title") return "google_title_native";
  if (field === "subtitle") return "google_subtitle_native";
  if (field === "description") return "google_description_native";
  if (field === "categories") return "google_category_native_specific";
  return "unknown";
}

function trustedSignalEntriesForTitle(title, signalFieldsByTitle, finalEligibilityEvidenceByTitle) {
  const bySignal = mapObject(signalFieldsByTitle[title]);
  const entries = [];

  for (const [signal, fieldsRaw] of Object.entries(bySignal)) {
    const fields = arrayValue(fieldsRaw).map((f) => normalize(f)).filter(Boolean);
    if (fields.length === 0) continue;
    if (GENERIC_CONTEXT_SIGNALS.has(normalize(signal))) continue;

    const trustedFields = fields.filter((f) => TRUSTED_PROVENANCE_FIELDS.has(f));
    if (trustedFields.length === 0) continue;

    for (const f of trustedFields) {
      entries.push({
        signal,
        field: f,
        origin: provenanceTagForField(f),
      });
    }
  }

  const evidence = arrayValue(finalEligibilityEvidenceByTitle[title]).map((v) => String(v || ""));
  for (const token of evidence) {
    const t = normalize(token);
    if (t.includes("verified_same_work_metadata")) {
      entries.push({ signal: "verified_same_work_metadata", field: "metadata", origin: "verified_same_work_metadata" });
    }
    if (t.includes("verified_same_isbn_metadata")) {
      entries.push({ signal: "verified_same_isbn_metadata", field: "metadata", origin: "verified_same_isbn_metadata" });
    }
  }

  const seen = new Set();
  const deduped = [];
  for (const e of entries) {
    const k = `${normalize(e.signal)}|${e.field}|${e.origin}`;
    if (seen.has(k)) continue;
    seen.add(k);
    deduped.push(e);
  }
  return deduped;
}

const reportPaths = argValues("--report");
if (reportPaths.length === 0) {
  throw new Error("No reports provided. Use --report <path> [--report <path> ...]");
}

const perReport = [];
const promotedRows = [];
const remainingWeakRows = [];

for (const reportPath of reportPaths) {
  const lines = readFileSync(reportPath, "utf8").split(/\r?\n/);
  const report = basename(reportPath);
  const presetTestName = parseLine(lines, "presetTestName") || report;

  const rejectedReasons = parseRejectedReasonsMap(lines);

  const classByTitle = Object.keys(parseMap(lines, "teenGoogleBooksMeaningfulTasteClassificationByTitle")).length
    ? parseMap(lines, "teenGoogleBooksMeaningfulTasteClassificationByTitle")
    : mapObject(rejectedReasons.teenGoogleBooksMeaningfulTasteClassificationByTitle);

  const weakUsedByTitle = Object.keys(parseMap(lines, "teenGoogleBooksWeakCandidateUsedForUnderfillByTitle")).length
    ? parseMap(lines, "teenGoogleBooksWeakCandidateUsedForUnderfillByTitle")
    : mapObject(rejectedReasons.teenGoogleBooksWeakCandidateUsedForUnderfillByTitle);

  const finalEvidenceByTitle = Object.keys(parseMap(lines, "googleBooksFinalEligibilityEvidenceByTitle")).length
    ? parseMap(lines, "googleBooksFinalEligibilityEvidenceByTitle")
    : mapObject(rejectedReasons.googleBooksFinalEligibilityEvidenceByTitle);

  const netByTitle = Object.keys(parseMap(lines, "teenGoogleBooksNetMeaningfulAlignmentScoreByTitle")).length
    ? parseMap(lines, "teenGoogleBooksNetMeaningfulAlignmentScoreByTitle")
    : mapObject(rejectedReasons.teenGoogleBooksNetMeaningfulAlignmentScoreByTitle);

  const signalFieldsByTitle = mapObject(rejectedReasons.teenGoogleBooksSignalFieldsByTitle);

  const weakTitles = Object.keys(classByTitle).filter((t) => normalize(classByTitle[t]) === "query_supported_but_weak");
  const strongCountBefore = Object.values(classByTitle).filter((v) => normalize(v) === "strong_match").length;
  const secondaryCountBefore = Object.values(classByTitle).filter((v) => normalize(v) === "defensible_secondary_match").length;
  const weakUnderfillBefore = weakTitles.filter((t) => weakUsedByTitle[t] === true).length;

  const promotions = [];
  for (const title of weakTitles) {
    const trustedEntries = trustedSignalEntriesForTitle(title, signalFieldsByTitle, finalEvidenceByTitle);
    if (trustedEntries.length === 0) {
      remainingWeakRows.push({
        report,
        presetTestName,
        title,
        weakUsedForUnderfill: weakUsedByTitle[title] === true,
        netScore: asNum(netByTitle[title], 0),
      });
      continue;
    }

    promotions.push({
      report,
      presetTestName,
      title,
      from: "query_supported_but_weak",
      to: "defensible_secondary_match",
      weakUsedForUnderfillBefore: weakUsedByTitle[title] === true,
      netScore: asNum(netByTitle[title], 0),
      trustedEvidence: trustedEntries,
    });
    promotedRows.push(promotions[promotions.length - 1]);
  }

  const strongCountAfter = strongCountBefore;
  const secondaryCountAfter = secondaryCountBefore + promotions.length;
  const weakCountAfter = weakTitles.length - promotions.length;

  const weakUnderfillAfter = Math.max(0, weakUnderfillBefore - promotions.filter((p) => p.weakUsedForUnderfillBefore).length);

  perReport.push({
    report,
    presetTestName,
    countsBefore: {
      strong: strongCountBefore,
      secondary: secondaryCountBefore,
      weak: weakTitles.length,
      strongPlusSecondary: strongCountBefore + secondaryCountBefore,
      weakUnderfill: weakUnderfillBefore,
    },
    countsAfter: {
      strong: strongCountAfter,
      secondary: secondaryCountAfter,
      weak: weakCountAfter,
      strongPlusSecondary: strongCountAfter + secondaryCountAfter,
      weakUnderfill: weakUnderfillAfter,
    },
    promotedFromWeakToSecondaryTitles: promotions.map((p) => p.title),
    promotions,
  });
}

const aggregateBefore = perReport.reduce((acc, r) => {
  acc.strong += r.countsBefore.strong;
  acc.secondary += r.countsBefore.secondary;
  acc.weak += r.countsBefore.weak;
  acc.strongPlusSecondary += r.countsBefore.strongPlusSecondary;
  acc.weakUnderfill += r.countsBefore.weakUnderfill;
  return acc;
}, { strong: 0, secondary: 0, weak: 0, strongPlusSecondary: 0, weakUnderfill: 0 });

const aggregateAfter = perReport.reduce((acc, r) => {
  acc.strong += r.countsAfter.strong;
  acc.secondary += r.countsAfter.secondary;
  acc.weak += r.countsAfter.weak;
  acc.strongPlusSecondary += r.countsAfter.strongPlusSecondary;
  acc.weakUnderfill += r.countsAfter.weakUnderfill;
  return acc;
}, { strong: 0, secondary: 0, weak: 0, strongPlusSecondary: 0, weakUnderfill: 0 });

const newlyFullWithoutWeakFallbackReports = perReport
  .filter((r) => r.countsBefore.weakUnderfill > 0 && r.countsAfter.weakUnderfill === 0)
  .map((r) => r.presetTestName);

const originHistogram = {};
for (const row of promotedRows) {
  for (const e of row.trustedEvidence) {
    originHistogram[e.origin] = Number(originHistogram[e.origin] || 0) + 1;
  }
}

console.log("=== TEEN GB TRUSTED RECONCILIATION COUNTERFACTUAL ===");
console.log(`Reports analyzed: ${reportPaths.length}`);
console.log(`Weak -> secondary promotions: ${promotedRows.length}`);
console.log(`Remaining weak candidates: ${remainingWeakRows.length}`);
console.log("\nAggregate BEFORE:");
console.log(`  strong=${aggregateBefore.strong} secondary=${aggregateBefore.secondary} weak=${aggregateBefore.weak}`);
console.log(`  strong+secondary=${aggregateBefore.strongPlusSecondary}`);
console.log(`  weak-underfill count=${aggregateBefore.weakUnderfill}`);
console.log("Aggregate AFTER trusted reconciliation:");
console.log(`  strong=${aggregateAfter.strong} secondary=${aggregateAfter.secondary} weak=${aggregateAfter.weak}`);
console.log(`  strong+secondary=${aggregateAfter.strongPlusSecondary}`);
console.log(`  weak-underfill count=${aggregateAfter.weakUnderfill}`);
console.log(`  newly full without weak fallback reports=${newlyFullWithoutWeakFallbackReports.length}`);
if (newlyFullWithoutWeakFallbackReports.length > 0) {
  console.log(`    ${newlyFullWithoutWeakFallbackReports.join(" | ")}`);
}

if (promotedRows.length > 0) {
  console.log("\nPromoted candidates (weak -> secondary):");
  for (const row of promotedRows) {
    const evidence = row.trustedEvidence.map((e) => `${e.signal}@${e.field}[${e.origin}]`).join(" | ");
    console.log(`  ${row.title} | report=${row.presetTestName} | evidence=${evidence}`);
  }
}

console.log("\nTrusted evidence origin histogram for promotions:");
if (Object.keys(originHistogram).length === 0) {
  console.log("  (no trusted promotions)");
} else {
  for (const [origin, count] of Object.entries(originHistogram).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${origin}: ${count}`);
  }
}

mkdirSync(outDir, { recursive: true });
const jsonOut = resolve(outDir, "teen-trusted-reconciliation-counterfactual.json");
const csvOut = resolve(outDir, "teen-trusted-reconciliation-counterfactual.csv");

const output = {
  generatedAt: new Date().toISOString(),
  inputs: reportPaths,
  aggregate: {
    before: aggregateBefore,
    after: aggregateAfter,
    weakPromotions: promotedRows.length,
    remainingWeak: remainingWeakRows.length,
    newlyFullWithoutWeakFallbackReports,
    trustedPromotionOriginHistogram: originHistogram,
  },
  perReport,
  promotedRows,
  remainingWeakRows,
};

writeFileSync(jsonOut, JSON.stringify(output, null, 2));
console.log(`\nJSON written to: ${jsonOut}`);

const csvHeader = [
  "report",
  "presetTestName",
  "title",
  "result",
  "weakUsedForUnderfillBefore",
  "netScore",
  "trustedEvidence",
].join(",");

const promoCsv = promotedRows.map((row) => {
  const evidence = row.trustedEvidence.map((e) => `${e.signal}@${e.field}[${e.origin}]`).join(" | ");
  return [
    `"${String(row.report).replace(/"/g, '""')}"`,
    `"${String(row.presetTestName).replace(/"/g, '""')}"`,
    `"${String(row.title).replace(/"/g, '""')}"`,
    "promoted_to_secondary",
    row.weakUsedForUnderfillBefore ? "true" : "false",
    row.netScore,
    `"${evidence.replace(/"/g, '""')}"`,
  ].join(",");
});

const remainingCsv = remainingWeakRows.map((row) => [
  `"${String(row.report).replace(/"/g, '""')}"`,
  `"${String(row.presetTestName).replace(/"/g, '""')}"`,
  `"${String(row.title).replace(/"/g, '""')}"`,
  "remains_weak",
  row.weakUsedForUnderfill ? "true" : "false",
  row.netScore,
  "",
].join(","));

writeFileSync(csvOut, [csvHeader, ...promoCsv, ...remainingCsv].join("\n"));
console.log(`CSV written to: ${csvOut}`);
