/**
 * Teen Google Books query marginal-yield and head-concentration audit (report-driven)
 *
 * Purpose:
 * - quantify within-family head concentration
 * - measure per-query marginal decision-worthy yield
 * - measure recurring-head dominance in accepted candidate pools
 *
 * Usage:
 *   node scripts/run-v2-googlebooks-teen-query-marginal-yield-audit.mjs \
 *     --report <path> [--report <path> ...]
 *
 * Output:
 *   scripts/output/teen-query-marginal-yield-audit.json
 *   scripts/output/teen-query-marginal-yield-audit.csv
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

function parseArray(lines, prefix) {
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

function pct(numerator, denominator) {
  if (!denominator) return 0;
  return Number(((numerator / denominator) * 100).toFixed(1));
}

function avg(nums) {
  if (!nums.length) return 0;
  return Number((nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(2));
}

const reportPaths = argValues("--report");
if (reportPaths.length === 0) {
  throw new Error("No reports provided. Use --report <path> [--report <path> ...]");
}

const sessionRows = [];
const queryRows = [];
const titleReportSets = new Map();
const globalSeenBefore = new Set();

for (const reportPath of reportPaths) {
  const lines = readFileSync(reportPath, "utf8").split(/\r?\n/);
  const report = basename(reportPath);
  const presetTestName = parseLine(lines, "presetTestName") || report;

  const sourceFetch = parseArray(lines, "googleBooksSourceFetchDiagnostics")
    .sort((a, b) => Number(a?.queryCascadeIndex ?? a?.attemptNumber ?? 0) - Number(b?.queryCascadeIndex ?? b?.attemptNumber ?? 0));
  const queryQuality = parseMap(lines, "googleBooksQueryResultQualityByQuery");
  const classByTitle = parseMap(lines, "teenGoogleBooksMeaningfulTasteClassificationByTitle");

  const seenWithinSession = new Set();
  const sessionQueryRows = [];

  for (const row of sourceFetch) {
    const query = String(row?.query || "").trim();
    if (!query) continue;
    const family = normalize(row?.queryFamily || "unknown");

    const quality = mapObject(queryQuality[query]);
    const rawTitles = arrayValue(quality.titles).map((t) => String(t || "").trim()).filter(Boolean);

    const titleKeys = [];
    const titleKeyToLabel = new Map();
    for (const title of rawTitles) {
      const key = normalize(title);
      if (!key || titleKeyToLabel.has(key)) continue;
      titleKeyToLabel.set(key, title);
      titleKeys.push(key);
    }

    let strong = 0;
    let secondary = 0;
    let weak = 0;
    let unknown = 0;
    let newToSession = 0;
    let marginalStrongSecondary = 0;
    let seenEarlierCorpus = 0;

    for (const key of titleKeys) {
      const titleLabel = titleKeyToLabel.get(key) || key;
      const cls = normalize(classByTitle[titleLabel]);
      if (cls === "strong_match") strong += 1;
      else if (cls === "defensible_secondary_match") secondary += 1;
      else if (cls === "query_supported_but_weak") weak += 1;
      else unknown += 1;

      if (!seenWithinSession.has(key)) {
        newToSession += 1;
        if (cls === "strong_match" || cls === "defensible_secondary_match") {
          marginalStrongSecondary += 1;
        }
      }
      if (globalSeenBefore.has(key)) seenEarlierCorpus += 1;
    }

    for (const key of titleKeys) seenWithinSession.add(key);

    const accepted = titleKeys.length;
    sessionQueryRows.push({
      report,
      presetTestName,
      family,
      query,
      accepted,
      strong,
      secondary,
      weak,
      unknown,
      newToSession,
      marginalStrongSecondary,
      seenEarlierCorpus,
      seenEarlierCorpusPct: pct(seenEarlierCorpus, accepted),
      marginalUniqueYieldPct: pct(newToSession, accepted),
      marginalDecisionWorthyYieldPct: pct(marginalStrongSecondary, accepted),
      titleKeys,
    });
  }

  for (const qr of sessionQueryRows) {
    for (const key of qr.titleKeys) {
      if (!titleReportSets.has(key)) titleReportSets.set(key, new Set());
      titleReportSets.get(key).add(report);
    }
  }

  for (const key of seenWithinSession) globalSeenBefore.add(key);

  queryRows.push(...sessionQueryRows);
  sessionRows.push({
    report,
    presetTestName,
    queryCount: sessionQueryRows.length,
    uniqueCandidatesAcrossQueries: seenWithinSession.size,
  });
}

const reportCount = reportPaths.length;
const recurringThreshold = Math.max(2, Math.ceil(reportCount * 0.33));
const recurringHeadTitles = new Set(
  Array.from(titleReportSets.entries())
    .filter(([, reports]) => reports.size >= recurringThreshold)
    .map(([titleKey]) => titleKey),
);

for (const row of queryRows) {
  let recurringHeadCount = 0;
  let maxRecurrence = 0;
  for (const key of row.titleKeys) {
    const reportSeen = titleReportSets.get(key)?.size || 0;
    if (reportSeen > maxRecurrence) maxRecurrence = reportSeen;
    if (recurringHeadTitles.has(key)) recurringHeadCount += 1;
  }
  row.recurringHeadCount = recurringHeadCount;
  row.recurringHeadSharePct = pct(recurringHeadCount, row.accepted);
  row.topTitleRecurrenceRatePct = pct(maxRecurrence, reportCount);
}

const queryAggregateMap = new Map();
for (const row of queryRows) {
  const key = `${row.family}||${row.query}`;
  if (!queryAggregateMap.has(key)) {
    queryAggregateMap.set(key, {
      family: row.family,
      query: row.query,
      runs: 0,
      accepted: 0,
      strong: 0,
      secondary: 0,
      weak: 0,
      newToSession: 0,
      marginalStrongSecondary: 0,
      seenEarlierCorpus: 0,
      recurringHeadSharePcts: [],
      marginalDecisionWorthyYieldPcts: [],
    });
  }
  const agg = queryAggregateMap.get(key);
  agg.runs += 1;
  agg.accepted += row.accepted;
  agg.strong += row.strong;
  agg.secondary += row.secondary;
  agg.weak += row.weak;
  agg.newToSession += row.newToSession;
  agg.marginalStrongSecondary += row.marginalStrongSecondary;
  agg.seenEarlierCorpus += row.seenEarlierCorpus;
  agg.recurringHeadSharePcts.push(row.recurringHeadSharePct);
  agg.marginalDecisionWorthyYieldPcts.push(row.marginalDecisionWorthyYieldPct);
}

const queryAggregates = Array.from(queryAggregateMap.values()).map((row) => ({
  family: row.family,
  query: row.query,
  runs: row.runs,
  accepted: row.accepted,
  strong: row.strong,
  secondary: row.secondary,
  weak: row.weak,
  newToSession: row.newToSession,
  marginalStrongSecondary: row.marginalStrongSecondary,
  seenEarlierCorpus: row.seenEarlierCorpus,
  recurringHeadSharePctAvg: avg(row.recurringHeadSharePcts),
  marginalDecisionWorthyYieldPctAvg: avg(row.marginalDecisionWorthyYieldPcts),
  valueScore: row.marginalStrongSecondary - row.seenEarlierCorpus,
})).sort((a, b) => b.marginalStrongSecondary - a.marginalStrongSecondary || b.accepted - a.accepted);

const familyAggregateMap = new Map();
for (const row of queryRows) {
  if (!familyAggregateMap.has(row.family)) {
    familyAggregateMap.set(row.family, {
      family: row.family,
      queryRuns: 0,
      accepted: 0,
      strong: 0,
      secondary: 0,
      weak: 0,
      newToSession: 0,
      marginalStrongSecondary: 0,
      seenEarlierCorpus: 0,
      recurringHeadSharePcts: [],
      marginalDecisionWorthyYieldPcts: [],
    });
  }
  const agg = familyAggregateMap.get(row.family);
  agg.queryRuns += 1;
  agg.accepted += row.accepted;
  agg.strong += row.strong;
  agg.secondary += row.secondary;
  agg.weak += row.weak;
  agg.newToSession += row.newToSession;
  agg.marginalStrongSecondary += row.marginalStrongSecondary;
  agg.seenEarlierCorpus += row.seenEarlierCorpus;
  agg.recurringHeadSharePcts.push(row.recurringHeadSharePct);
  agg.marginalDecisionWorthyYieldPcts.push(row.marginalDecisionWorthyYieldPct);
}

const familyAggregates = Array.from(familyAggregateMap.values()).map((row) => ({
  family: row.family,
  queryRuns: row.queryRuns,
  accepted: row.accepted,
  strong: row.strong,
  secondary: row.secondary,
  weak: row.weak,
  newToSession: row.newToSession,
  marginalStrongSecondary: row.marginalStrongSecondary,
  seenEarlierCorpus: row.seenEarlierCorpus,
  recurringHeadSharePctAvg: avg(row.recurringHeadSharePcts),
  marginalDecisionWorthyYieldPctAvg: avg(row.marginalDecisionWorthyYieldPcts),
})).sort((a, b) => b.marginalStrongSecondary - a.marginalStrongSecondary || b.accepted - a.accepted);

const repeatedTitlesAcrossReports = Array.from(titleReportSets.entries())
  .map(([titleKey, reports]) => ({ titleKey, reportsSeen: reports.size }))
  .filter((row) => row.reportsSeen >= 2)
  .sort((a, b) => b.reportsSeen - a.reportsSeen);

console.log("=== TEEN GB QUERY MARGINAL-YIELD AUDIT ===");
console.log(`Reports analyzed: ${reportCount}`);
console.log(`Query rows analyzed: ${queryRows.length}`);
console.log(`Recurring-head threshold (reportsSeen >=): ${recurringThreshold}`);
console.log(`Recurring-head title count: ${recurringHeadTitles.size}`);

console.log("\nTop family marginal decision-worthy yield:");
for (const row of familyAggregates.slice(0, 10)) {
  console.log(`  ${row.family}: marginalStrongSecondary=${row.marginalStrongSecondary}, accepted=${row.accepted}, recurringHeadShareAvg=${row.recurringHeadSharePctAvg}%`);
}

console.log("\nLowest-value queries (low marginal decision-worthy yield):");
for (const row of [...queryAggregates].sort((a, b) => a.marginalStrongSecondary - b.marginalStrongSecondary || b.recurringHeadSharePctAvg - a.recurringHeadSharePctAvg).slice(0, 10)) {
  console.log(`  [${row.family}] ${row.query} | runs=${row.runs} marginalStrongSecondary=${row.marginalStrongSecondary} recurringHeadShareAvg=${row.recurringHeadSharePctAvg}%`);
}

if (repeatedTitlesAcrossReports.length > 0) {
  console.log("\nMost repeated titles across reports:");
  for (const row of repeatedTitlesAcrossReports.slice(0, 20)) {
    console.log(`  ${row.titleKey} | reportsSeen=${row.reportsSeen}`);
  }
}

mkdirSync(outDir, { recursive: true });
const jsonOut = resolve(outDir, "teen-query-marginal-yield-audit.json");
const csvOut = resolve(outDir, "teen-query-marginal-yield-audit.csv");

const output = {
  generatedAt: new Date().toISOString(),
  inputs: reportPaths,
  recurringHeadThresholdReportsSeen: recurringThreshold,
  recurringHeadTitleCount: recurringHeadTitles.size,
  familyAggregates,
  queryAggregates,
  repeatedTitlesAcrossReports,
  sessionRows,
  queryRows,
};

writeFileSync(jsonOut, JSON.stringify(output, null, 2));
console.log(`\nJSON written to: ${jsonOut}`);

const csvHeader = [
  "report",
  "presetTestName",
  "family",
  "query",
  "accepted",
  "strong",
  "secondary",
  "weak",
  "unknown",
  "newToSession",
  "marginalStrongSecondary",
  "seenEarlierCorpus",
  "marginalUniqueYieldPct",
  "marginalDecisionWorthyYieldPct",
  "recurringHeadCount",
  "recurringHeadSharePct",
  "topTitleRecurrenceRatePct",
].join(",");

const csvRows = queryRows.map((row) => [
  `"${String(row.report).replace(/"/g, '""')}"`,
  `"${String(row.presetTestName).replace(/"/g, '""')}"`,
  row.family,
  `"${String(row.query).replace(/"/g, '""')}"`,
  row.accepted,
  row.strong,
  row.secondary,
  row.weak,
  row.unknown,
  row.newToSession,
  row.marginalStrongSecondary,
  row.seenEarlierCorpus,
  row.marginalUniqueYieldPct,
  row.marginalDecisionWorthyYieldPct,
  row.recurringHeadCount,
  row.recurringHeadSharePct,
  row.topTitleRecurrenceRatePct,
].join(","));

writeFileSync(csvOut, [csvHeader, ...csvRows].join("\n"));
console.log(`CSV written to: ${csvOut}`);
