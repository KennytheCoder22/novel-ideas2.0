/**
 * Teen Google Books query-family overlap audit (report-driven)
 *
 * Measures candidate-space diversity and query-family collapse using session reports.
 *
 * Usage:
 *   node scripts/run-v2-googlebooks-teen-query-family-overlap-audit.mjs \
 *     --report <path> [--report <path> ...]
 *
 * Outputs:
 *   scripts/output/teen-query-family-overlap-audit.json
 *   scripts/output/teen-query-family-overlap-audit.csv
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

function canonicalFamily(value) {
  const v = normalize(value);
  if (!v) return "unknown";
  return v;
}

function jaccard(aSet, bSet) {
  const a = Array.from(aSet);
  const b = Array.from(bSet);
  if (a.length === 0 && b.length === 0) return 1;
  const bLookup = new Set(b);
  let intersection = 0;
  for (const x of a) {
    if (bLookup.has(x)) intersection += 1;
  }
  const union = a.length + b.length - intersection;
  return union > 0 ? intersection / union : 0;
}

const reportPaths = argValues("--report");
if (reportPaths.length === 0) {
  throw new Error("No reports provided. Use --report <path> [--report <path> ...]");
}

// family -> metadata
const familyMap = new Map();

// title -> in how many reports seen in query pools
const titleReportCounts = new Map();

const perReport = [];

for (const reportPath of reportPaths) {
  const lines = readFileSync(reportPath, "utf8").split(/\r?\n/);
  const report = basename(reportPath);
  const presetTestName = parseLine(lines, "presetTestName") || report;

  const sourceFetch = parseArray(lines, "googleBooksSourceFetchDiagnostics");
  const queryQuality = parseMap(lines, "googleBooksQueryResultQualityByQuery");
  const classByTitle = parseMap(lines, "teenGoogleBooksMeaningfulTasteClassificationByTitle");
  const genreSignalsByTitle = parseMap(lines, "teenGoogleBooksGenreSignalsByTitle");

  const reportTitlesSeen = new Set();
  const reportFamilyCounts = {};

  for (const row of sourceFetch) {
    const query = String(row?.query || "").trim();
    if (!query) continue;
    const family = canonicalFamily(row?.queryFamily || "unknown");

    const quality = mapObject(queryQuality[query]);
    const titles = arrayValue(quality.titles).map((t) => String(t || "").trim()).filter(Boolean);

    if (!familyMap.has(family)) {
      familyMap.set(family, {
        family,
        queries: new Set(),
        titles: new Map(), // normalized title -> original title
        reports: new Set(),
        strongTitles: new Set(),
        secondaryTitles: new Set(),
        weakTitles: new Set(),
        tasteSignals: new Set(),
      });
    }
    const bucket = familyMap.get(family);
    bucket.queries.add(query);
    bucket.reports.add(report);

    for (const title of titles) {
      const key = normalize(title);
      if (!key) continue;
      if (!bucket.titles.has(key)) bucket.titles.set(key, title);
      reportTitlesSeen.add(key);

      const classification = normalize(classByTitle[title]);
      if (classification === "strong_match") bucket.strongTitles.add(key);
      else if (classification === "defensible_secondary_match") bucket.secondaryTitles.add(key);
      else if (classification === "query_supported_but_weak") bucket.weakTitles.add(key);

      const signals = arrayValue(genreSignalsByTitle[title]).map((s) => normalize(s)).filter(Boolean);
      for (const signal of signals) bucket.tasteSignals.add(signal);
    }

    reportFamilyCounts[family] = Number(reportFamilyCounts[family] || 0) + titles.length;
  }

  for (const titleKey of reportTitlesSeen) {
    titleReportCounts.set(titleKey, Number(titleReportCounts.get(titleKey) || 0) + 1);
  }

  perReport.push({
    report,
    presetTestName,
    familyCandidateCounts: reportFamilyCounts,
    uniqueCandidateCount: reportTitlesSeen.size,
  });
}

const families = Array.from(familyMap.keys()).sort();

// precompute family title sets
const familyTitleSets = {};
for (const family of families) {
  const bucket = familyMap.get(family);
  familyTitleSets[family] = new Set(Array.from(bucket.titles.keys()));
}

// overlap matrix
const overlapMatrix = [];
for (let i = 0; i < families.length; i += 1) {
  for (let j = i + 1; j < families.length; j += 1) {
    const a = families[i];
    const b = families[j];
    const aSet = familyTitleSets[a];
    const bSet = familyTitleSets[b];

    const jac = jaccard(aSet, bSet);
    const inter = Array.from(aSet).filter((x) => bSet.has(x)).length;
    const union = aSet.size + bSet.size - inter;

    overlapMatrix.push({
      familyA: a,
      familyB: b,
      intersectionCount: inter,
      unionCount: union,
      jaccard: Number(jac.toFixed(4)),
    });
  }
}

const highOverlapPairs = overlapMatrix.filter((row) => row.jaccard >= 0.8).sort((a, b) => b.jaccard - a.jaccard);
const lowOverlapPairs = overlapMatrix.filter((row) => row.jaccard <= 0.3).sort((a, b) => a.jaccard - b.jaccard);

const familySummary = families.map((family) => {
  const bucket = familyMap.get(family);
  const titleSet = familyTitleSets[family];

  let sharedCount = 0;
  for (const titleKey of titleSet) {
    let appearsElsewhere = false;
    for (const other of families) {
      if (other === family) continue;
      if (familyTitleSets[other].has(titleKey)) {
        appearsElsewhere = true;
        break;
      }
    }
    if (appearsElsewhere) sharedCount += 1;
  }

  const uniqueCount = titleSet.size;
  const sharedPct = uniqueCount > 0 ? Number(((sharedCount / uniqueCount) * 100).toFixed(1)) : 0;
  const strongCount = bucket.strongTitles.size;
  const secondaryCount = bucket.secondaryTitles.size;
  const weakCount = bucket.weakTitles.size;

  return {
    family,
    queryCount: bucket.queries.size,
    uniqueCandidates: uniqueCount,
    sharedWithOtherFamiliesPercent: sharedPct,
    strongCandidates: strongCount,
    secondaryCandidates: secondaryCount,
    weakCandidates: weakCount,
    strongPlusSecondaryCandidates: strongCount + secondaryCount,
    distinctTasteSignals: bucket.tasteSignals.size,
    reportsSeen: bucket.reports.size,
  };
}).sort((a, b) => b.uniqueCandidates - a.uniqueCandidates);

const repeatedTitlesAcrossReports = Array.from(titleReportCounts.entries())
  .filter(([, count]) => count >= 2)
  .sort((a, b) => b[1] - a[1])
  .map(([titleKey, count]) => ({ titleKey, reportsSeen: count }));

console.log("=== TEEN GB QUERY-FAMILY OVERLAP AUDIT ===");
console.log(`Reports analyzed: ${reportPaths.length}`);
console.log(`Families observed: ${families.length}`);
console.log(`High-overlap family pairs (Jaccard >= 0.8): ${highOverlapPairs.length}`);
console.log(`Low-overlap family pairs (Jaccard <= 0.3): ${lowOverlapPairs.length}`);
console.log("\nFamily summary:");
for (const row of familySummary) {
  console.log(`  ${row.family}: unique=${row.uniqueCandidates}, shared=${row.sharedWithOtherFamiliesPercent}%, strong+secondary=${row.strongPlusSecondaryCandidates}, weak=${row.weakCandidates}, tasteSignals=${row.distinctTasteSignals}`);
}

if (highOverlapPairs.length > 0) {
  console.log("\nMost overlapping pairs:");
  for (const row of highOverlapPairs.slice(0, 10)) {
    console.log(`  ${row.familyA} <-> ${row.familyB}: jaccard=${row.jaccard} (intersection=${row.intersectionCount})`);
  }
}

if (repeatedTitlesAcrossReports.length > 0) {
  console.log("\nMost repeated candidate titles across reports:");
  for (const row of repeatedTitlesAcrossReports.slice(0, 20)) {
    console.log(`  ${row.titleKey} | reportsSeen=${row.reportsSeen}`);
  }
}

mkdirSync(outDir, { recursive: true });
const jsonOut = resolve(outDir, "teen-query-family-overlap-audit.json");
const csvOut = resolve(outDir, "teen-query-family-overlap-audit.csv");

const output = {
  generatedAt: new Date().toISOString(),
  inputs: reportPaths,
  familySummary,
  overlapMatrix,
  highOverlapPairs,
  lowOverlapPairs,
  repeatedTitlesAcrossReports,
  perReport,
};

writeFileSync(jsonOut, JSON.stringify(output, null, 2));
console.log(`\nJSON written to: ${jsonOut}`);

const csvHeader = [
  "family",
  "queryCount",
  "uniqueCandidates",
  "sharedWithOtherFamiliesPercent",
  "strongCandidates",
  "secondaryCandidates",
  "weakCandidates",
  "strongPlusSecondaryCandidates",
  "distinctTasteSignals",
  "reportsSeen",
].join(",");

const csvRows = familySummary.map((row) => [
  row.family,
  row.queryCount,
  row.uniqueCandidates,
  row.sharedWithOtherFamiliesPercent,
  row.strongCandidates,
  row.secondaryCandidates,
  row.weakCandidates,
  row.strongPlusSecondaryCandidates,
  row.distinctTasteSignals,
  row.reportsSeen,
].join(","));

writeFileSync(csvOut, [csvHeader, ...csvRows].join("\n"));
console.log(`CSV written to: ${csvOut}`);
