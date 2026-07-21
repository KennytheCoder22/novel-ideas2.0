/**
 * Teen Google Books taste-tier counterfactual audit (report-driven)
 *
 * Reads SESSION REPORT exports and computes aggregate statistics about the
 * Teen Google Books taste-tier counterfactual slate: how often strong/secondary
 * candidates fill the slate, how often weak candidates are needed as underfill,
 * and which titles are repeatedly appearing only via weak underfill.
 *
 * Diagnostic-only: no production behavior changes.
 *
 * Usage:
 *   node scripts/run-v2-googlebooks-teen-taste-tier-audit.mjs \
 *     --report <path> [--report <path> ...]
 *
 * Output:
 *   scripts/output/teen-taste-tier-audit.json
 *   scripts/output/teen-taste-tier-audit.csv
 *
 * Use --reset-history to discard previously accumulated per-title observations.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(scriptDir, "output");
const historyPath = resolve(outDir, "teen-taste-tier-audit-history.json");

// ---------------------------------------------------------------------------
// CLI argument helpers
// ---------------------------------------------------------------------------

function argValues(flag) {
  const values = [];
  for (let i = 0; i < process.argv.length; i += 1) {
    if (process.argv[i] === flag && process.argv[i + 1]) values.push(process.argv[i + 1]);
  }
  return values;
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

// ---------------------------------------------------------------------------
// Report parsing helpers
// ---------------------------------------------------------------------------

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

function parseReportNumber(lines, prefix) {
  const marker = `${prefix}:`;
  const line = lines.find((entry) => entry.startsWith(marker));
  if (!line) return null;
  const raw = line.slice(marker.length).trim();
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function parseReportBoolean(lines, prefix) {
  const marker = `${prefix}:`;
  const line = lines.find((entry) => entry.startsWith(marker));
  if (!line) return null;
  const raw = line.slice(marker.length).trim().toLowerCase();
  if (raw === "true") return true;
  if (raw === "false") return false;
  return null;
}

function parseReportTitleList(lines, prefix) {
  const marker = `${prefix}:`;
  const line = lines.find((entry) => entry.startsWith(marker));
  if (!line) return [];
  const raw = line.slice(marker.length).trim();
  if (!raw || raw === "(none)") return [];
  return raw.split(" | ").map((s) => s.trim()).filter(Boolean);
}

function parseReportLine(lines, prefix) {
  const marker = `${prefix}:`;
  const line = lines.find((entry) => entry.startsWith(marker));
  if (!line) return "";
  return line.slice(marker.length).trim();
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const reportPaths = argValues("--report");
if (reportPaths.length === 0) {
  throw new Error("No reports provided. Use --report <path> [--report <path> ...]");
}
const resetHistory = hasFlag("--reset-history");

// ---- per-report accumulation ----
const perReport = [];

// ---- cross-report per-title accumulation ----
// title -> { seenInReports, usedAsUnderfillCount, seenCount, classifications, tierSelectionReasons }
const titleRegistry = new Map();

// ---- session-level aggregate accumulators ----
let totalSessions = 0;
let teenGbSessions = 0;        // sessions where any Teen GB candidates existed
let underfillRequiredSessions = 0;
let noUnderfillNeededSessions = 0;
let fullyStarvedSessions = 0;  // counterfactualFinalCount === 0

const strongOrSecondaryAvailableCounts = [];
const counterfactualFinalCounts = [];
const underfillWeakCountsWhenUsed = [];

for (const reportPath of reportPaths) {
  const lines = readFileSync(reportPath, "utf8").split(/\r?\n/);
  const reportName = basename(reportPath);
  totalSessions += 1;

  // ---- Extract the seven counterfactual fields ----
  const tasteTierDecisionByTitle = parseReportMap(lines, "teenGoogleBooksTasteTierSelectionDecisionByTitle");
  const tasteTierReasonByTitle = parseReportMap(lines, "teenGoogleBooksTasteTierSelectionReasonByTitle");
  const weakUnderfillByTitle = parseReportMap(lines, "teenGoogleBooksWeakCandidateUsedForUnderfillByTitle");
  const classificationByTitle = parseReportMap(lines, "teenGoogleBooksMeaningfulTasteClassificationByTitle");
  const classificationHistogram = parseReportMap(lines, "teenGoogleBooksMeaningfulTasteClassificationHistogram");
  const netScoreByTitle = parseReportMap(lines, "teenGoogleBooksNetMeaningfulAlignmentScoreByTitle");

  const strongOrSecondaryAvailableCount = parseReportNumber(lines, "teenGoogleBooksStrongOrSecondaryAvailableCount");
  const counterfactualFinalCount = parseReportNumber(lines, "teenGoogleBooksCounterfactualFinalCount");
  const counterfactualUnderfill = parseReportBoolean(lines, "teenGoogleBooksCounterfactualUnderfill");
  const counterfactualFinalTitles = parseReportTitleList(lines, "teenGoogleBooksCounterfactualFinalTitles");

  // Additional context fields for the report
  const presetTestName = parseReportLine(lines, "presetTestName") || reportName;
  const deckKey = parseReportLine(lines, "Deck Key");

  const allCandidateTitles = Object.keys(tasteTierDecisionByTitle);
  if (allCandidateTitles.length === 0 && counterfactualFinalCount === null) {
    // No Teen GB candidates in this report at all
    perReport.push({
      report: reportName,
      presetTestName,
      deckKey,
      teenGbCandidatesFound: false,
      strongOrSecondaryAvailableCount: 0,
      counterfactualFinalCount: 0,
      counterfactualUnderfill: false,
      weakUnderfillTitles: [],
      counterfactualFinalTitles: [],
      classificationHistogram: {},
      rows: [],
    });
    continue;
  }

  teenGbSessions += 1;
  const safeStrong = strongOrSecondaryAvailableCount ?? 0;
  const safeFinalCount = counterfactualFinalCount ?? 0;
  const safeUnderfill = counterfactualUnderfill ?? false;

  strongOrSecondaryAvailableCounts.push(safeStrong);
  counterfactualFinalCounts.push(safeFinalCount);

  const weakUnderfillTitles = counterfactualFinalTitles.filter((t) => weakUnderfillByTitle[t] === true);
  const weakFallbackUsed = weakUnderfillTitles.length > 0;

  if (safeFinalCount === 0) {
    fullyStarvedSessions += 1;
  } else if (weakFallbackUsed) {
    underfillRequiredSessions += 1;
  } else {
    noUnderfillNeededSessions += 1;
  }

  if (weakFallbackUsed) {
    underfillWeakCountsWhenUsed.push(weakUnderfillTitles.length);
  }

  // ---- Build per-candidate rows ----
  const rows = [];
  for (const title of allCandidateTitles) {
    const decision = String(tasteTierDecisionByTitle[title] || "");
    const reason = String(tasteTierReasonByTitle[title] || "");
    const classification = String(classificationByTitle[title] || "");
    const netScore = typeof netScoreByTitle[title] === "number" ? netScoreByTitle[title] : Number(netScoreByTitle[title] || 0);
    const usedAsUnderfill = weakUnderfillByTitle[title] === true;
    const inCounterfactualFinal = counterfactualFinalTitles.includes(title);

    rows.push({ title, decision, reason, classification, netScore, usedAsUnderfill, inCounterfactualFinal });

    // Update cross-report registry
    const existing = titleRegistry.get(title);
    if (!existing) {
      titleRegistry.set(title, {
        title,
        seenInReports: [reportName],
        seenCount: 1,
        usedAsUnderfillCount: usedAsUnderfill ? 1 : 0,
        inCounterfactualFinalCount: inCounterfactualFinal ? 1 : 0,
        classifications: classification ? { [classification]: 1 } : {},
        tierSelectionReasons: reason ? { [reason]: 1 } : {},
        maxNetScore: netScore,
        minNetScore: netScore,
      });
    } else {
      if (!existing.seenInReports.includes(reportName)) {
        existing.seenInReports.push(reportName);
      }
      existing.seenCount += 1;
      if (usedAsUnderfill) existing.usedAsUnderfillCount += 1;
      if (inCounterfactualFinal) existing.inCounterfactualFinalCount += 1;
      if (classification) existing.classifications[classification] = (existing.classifications[classification] || 0) + 1;
      if (reason) existing.tierSelectionReasons[reason] = (existing.tierSelectionReasons[reason] || 0) + 1;
      if (netScore > existing.maxNetScore) existing.maxNetScore = netScore;
      if (netScore < existing.minNetScore) existing.minNetScore = netScore;
    }
  }

  perReport.push({
    report: reportName,
    presetTestName,
    deckKey,
    teenGbCandidatesFound: true,
    strongOrSecondaryAvailableCount: safeStrong,
    counterfactualFinalCount: safeFinalCount,
    counterfactualUnderfill: safeUnderfill,
    weakUnderfillTitles,
    counterfactualFinalTitles,
    classificationHistogram,
    rows,
  });
}

// ---------------------------------------------------------------------------
// Aggregate statistics
// ---------------------------------------------------------------------------

function avg(arr) {
  if (arr.length === 0) return 0;
  return Number((arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(2));
}

function pct(numerator, denominator) {
  if (denominator === 0) return 0;
  return Number(((numerator / denominator) * 100).toFixed(1));
}

const allRows = perReport.flatMap((r) => r.rows);
const classificationCounts = { strong_match: 0, defensible_secondary_match: 0, query_supported_but_weak: 0, unrelated: 0, actively_conflicting: 0, excluded_non_taste: 0 };
for (const row of allRows) {
  if (row.decision === "excluded_non_taste_final_eligibility") {
    classificationCounts.excluded_non_taste += 1;
  } else if (classificationCounts[row.classification] !== undefined) {
    classificationCounts[row.classification] += 1;
  }
}

const weakUnderfillTitleFrequency = new Map();
for (const report of perReport) {
  for (const title of report.weakUnderfillTitles) {
    weakUnderfillTitleFrequency.set(title, (weakUnderfillTitleFrequency.get(title) || 0) + 1);
  }
}
const weakUnderfillTitleFrequencyRanked = Array.from(weakUnderfillTitleFrequency.entries())
  .sort((a, b) => b[1] - a[1])
  .map(([title, count]) => ({ title, count }));

const titlesOnlyReachableViaUnderfill = Array.from(titleRegistry.values())
  .filter((entry) => entry.inCounterfactualFinalCount > 0 && entry.usedAsUnderfillCount === entry.inCounterfactualFinalCount)
  .sort((a, b) => b.inCounterfactualFinalCount - a.inCounterfactualFinalCount)
  .map((entry) => ({
    title: entry.title,
    timesInFinal: entry.inCounterfactualFinalCount,
    timesAsUnderfill: entry.usedAsUnderfillCount,
    seenInReports: entry.seenCount,
    dominantClassification: Object.entries(entry.classifications).sort((a, b) => b[1] - a[1])[0]?.[0] || "unknown",
  }));

const aggregate = {
  totalSessionsAnalyzed: totalSessions,
  teenGbSessions,
  sessionBreakdown: {
    underfillNotNeeded: noUnderfillNeededSessions,
    underfillRequired: underfillRequiredSessions,
    fullyStarved: fullyStarvedSessions,
  },
  sessionPercentages: {
    underfillNotNeededPct: pct(noUnderfillNeededSessions, teenGbSessions),
    underfillRequiredPct: pct(underfillRequiredSessions, teenGbSessions),
    fullyStarvedPct: pct(fullyStarvedSessions, teenGbSessions),
  },
  averages: {
    avgStrongOrSecondaryAvailable: avg(strongOrSecondaryAvailableCounts),
    avgCounterfactualFinalCount: avg(counterfactualFinalCounts),
    avgWeakUnderfillCountWhenRequired: avg(underfillWeakCountsWhenUsed),
  },
  candidateClassificationCounts: classificationCounts,
  weakUnderfillTitleFrequencyRanked,
  titlesOnlyReachableViaUnderfill,
};

// ---------------------------------------------------------------------------
// Console output
// ---------------------------------------------------------------------------

console.log("=== TEEN GOOGLE BOOKS TASTE-TIER COUNTERFACTUAL AUDIT ===");
console.log(`Reports analyzed: ${totalSessions}`);
console.log(`Sessions with Teen GB candidates: ${teenGbSessions}`);
console.log("");
console.log("SESSION BREAKDOWN (among Teen GB sessions):");
console.log(`  Strong/secondary filled slate:    ${noUnderfillNeededSessions}  (${aggregate.sessionPercentages.underfillNotNeededPct}%)`);
console.log(`  Weak underfill was required:      ${underfillRequiredSessions}  (${aggregate.sessionPercentages.underfillRequiredPct}%)`);
console.log(`  Fully starved (0 candidates):     ${fullyStarvedSessions}  (${aggregate.sessionPercentages.fullyStarvedPct}%)`);
console.log("");
console.log("AVERAGES (over Teen GB sessions):");
console.log(`  Avg strong+secondary available:   ${aggregate.averages.avgStrongOrSecondaryAvailable}`);
console.log(`  Avg counterfactual final count:   ${aggregate.averages.avgCounterfactualFinalCount}`);
console.log(`  Avg weak underfill when required: ${aggregate.averages.avgWeakUnderfillCountWhenRequired}`);
console.log("");
console.log("CANDIDATE CLASSIFICATION COUNTS (across all reports):");
for (const [label, count] of Object.entries(classificationCounts)) {
  console.log(`  ${label}: ${count}`);
}
if (weakUnderfillTitleFrequencyRanked.length > 0) {
  console.log("");
  console.log("MOST FREQUENT WEAK-UNDERFILL TITLES:");
  for (const { title, count } of weakUnderfillTitleFrequencyRanked.slice(0, 20)) {
    console.log(`  [${count}x] ${title}`);
  }
}
if (titlesOnlyReachableViaUnderfill.length > 0) {
  console.log("");
  console.log("TITLES ONLY REACHABLE VIA WEAK UNDERFILL (never appeared as strong/secondary):");
  for (const entry of titlesOnlyReachableViaUnderfill.slice(0, 20)) {
    console.log(`  [${entry.timesAsUnderfill}x underfill / ${entry.seenInReports}x seen] ${entry.title}  (${entry.dominantClassification})`);
  }
}
console.log("");
console.log("PER-SESSION SUMMARY:");
for (const r of perReport) {
  if (!r.teenGbCandidatesFound) {
    console.log(`  [${r.presetTestName}] no Teen GB candidates`);
    continue;
  }
  const hist = r.classificationHistogram;
  const strong = Number(hist.strong_match || 0);
  const secondary = Number(hist.defensible_secondary_match || 0);
  const weak = Number(hist.query_supported_but_weak || 0);
  const underfillMark = r.weakUnderfillTitles.length > 0 ? " [weak fallback]" : (r.counterfactualUnderfill ? " [underfill]" : "");
  console.log(
    `  [${r.presetTestName}] final=${r.counterfactualFinalCount} strong=${strong} secondary=${secondary} weak=${weak}` +
    ` strongOrSec=${r.strongOrSecondaryAvailableCount}${underfillMark}`,
  );
  if (r.weakUnderfillTitles.length > 0) {
    console.log(`    weak underfill: ${r.weakUnderfillTitles.join(" | ")}`);
  }
}

// ---------------------------------------------------------------------------
// File output
// ---------------------------------------------------------------------------

mkdirSync(outDir, { recursive: true });
const jsonOut = resolve(outDir, "teen-taste-tier-audit.json");
const csvOut = resolve(outDir, "teen-taste-tier-audit.csv");

const output = {
  generatedAt: new Date().toISOString(),
  inputs: reportPaths,
  aggregate,
  perReport,
  allCandidates: Array.from(titleRegistry.values()).sort((a, b) => b.seenCount - a.seenCount),
};
writeFileSync(jsonOut, JSON.stringify(output, null, 2));
console.log(`\nJSON written to: ${jsonOut}`);

const csvHeader = [
  "title", "seenCount", "inCounterfactualFinalCount", "usedAsUnderfillCount",
  "underfillRatio", "dominantClassification", "maxNetScore", "minNetScore", "seenInReports",
].join(",");
const csvRows = Array.from(titleRegistry.values())
  .sort((a, b) => b.usedAsUnderfillCount - a.usedAsUnderfillCount || b.seenCount - a.seenCount)
  .map((entry) => {
    const dominantClass = Object.entries(entry.classifications).sort((a, b) => b[1] - a[1])[0]?.[0] || "";
    const underfillRatio = entry.inCounterfactualFinalCount > 0
      ? Number((entry.usedAsUnderfillCount / entry.inCounterfactualFinalCount).toFixed(2))
      : 0;
    return [
      `"${entry.title.replace(/"/g, '""')}"`,
      entry.seenCount,
      entry.inCounterfactualFinalCount,
      entry.usedAsUnderfillCount,
      underfillRatio,
      dominantClass,
      entry.maxNetScore,
      entry.minNetScore,
      `"${entry.seenInReports.join(" | ").replace(/"/g, '""')}"`,
    ].join(",");
  });
writeFileSync(csvOut, [csvHeader, ...csvRows].join("\n"));
console.log(`CSV written to: ${csvOut}`);

// ---------------------------------------------------------------------------
// History (per-title cumulative tracking across separate invocations)
// ---------------------------------------------------------------------------

let history = {
  generatedAt: new Date().toISOString(),
  runs: [],
  seenObservationKeys: [],
  titleRegistry: {},
  lifetimeCounts: {
    sessions: 0,
    teenGbSessions: 0,
    underfillRequiredSessions: 0,
    noUnderfillNeededSessions: 0,
    fullyStarvedSessions: 0,
    uniqueTitlesObserved: 0,
    totalWeakUnderfillOccurrences: 0,
  },
};

if (!resetHistory && existsSync(historyPath)) {
  try {
    const parsed = JSON.parse(readFileSync(historyPath, "utf8"));
    if (parsed && typeof parsed === "object" && parsed.titleRegistry) {
      history = { ...history, ...parsed };
    }
  } catch {
    // fresh history on parse failure
  }
}

const seenObs = new Set(arrayValue(history.seenObservationKeys).map((v) => String(v)));
if (!history.titleRegistry || typeof history.titleRegistry !== "object") history.titleRegistry = {};
const hRegistry = history.titleRegistry;

let newObs = 0;
let newTitles = 0;

for (const r of perReport) {
  const obsKey = `session::${r.report}`;
  if (!seenObs.has(obsKey)) {
    seenObs.add(obsKey);
    history.lifetimeCounts.sessions += 1;
    if (r.teenGbCandidatesFound) {
      history.lifetimeCounts.teenGbSessions += 1;
      if (r.counterfactualFinalCount === 0) history.lifetimeCounts.fullyStarvedSessions += 1;
      else if ((r.weakUnderfillTitles || []).length > 0) history.lifetimeCounts.underfillRequiredSessions += 1;
      else history.lifetimeCounts.noUnderfillNeededSessions += 1;
    }
    newObs += 1;
  }

  for (const row of r.rows) {
    const titleKey = row.title;
    if (!hRegistry[titleKey]) {
      hRegistry[titleKey] = {
        firstSeenAt: new Date().toISOString(),
        lastSeenAt: new Date().toISOString(),
        seenCount: 0,
        usedAsUnderfillCount: 0,
        inCounterfactualFinalCount: 0,
        classifications: {},
      };
      history.lifetimeCounts.uniqueTitlesObserved += 1;
      newTitles += 1;
    }
    const entry = hRegistry[titleKey];
    entry.lastSeenAt = new Date().toISOString();
    entry.seenCount += 1;
    if (row.usedAsUnderfill) {
      entry.usedAsUnderfillCount += 1;
      history.lifetimeCounts.totalWeakUnderfillOccurrences += 1;
    }
    if (row.inCounterfactualFinal) entry.inCounterfactualFinalCount += 1;
    if (row.classification) entry.classifications[row.classification] = (entry.classifications[row.classification] || 0) + 1;
  }
}

history.seenObservationKeys = Array.from(seenObs);
history.generatedAt = new Date().toISOString();

writeFileSync(historyPath, JSON.stringify(history, null, 2));
console.log(`History updated: ${historyPath}`);
console.log(`  New sessions recorded: ${newObs}`);
console.log(`  New unique titles recorded: ${newTitles}`);
console.log(`  Lifetime sessions: ${history.lifetimeCounts.sessions}`);
console.log(`  Lifetime Teen GB sessions: ${history.lifetimeCounts.teenGbSessions}`);
console.log(`  Lifetime underfill-required: ${history.lifetimeCounts.underfillRequiredSessions}`);
console.log(`  Lifetime no-underfill-needed: ${history.lifetimeCounts.noUnderfillNeededSessions}`);
console.log(`  Lifetime unique titles: ${history.lifetimeCounts.uniqueTitlesObserved}`);
console.log(`  Lifetime weak underfill occurrences: ${history.lifetimeCounts.totalWeakUnderfillOccurrences}`);





