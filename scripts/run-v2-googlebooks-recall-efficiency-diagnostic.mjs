import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildRecallEfficiencyReportFromReports } from "./lib/googlebooks-recall-efficiency.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(scriptDir, "output");

function argValues(flag) {
  const values = [];
  for (let i = 0; i < process.argv.length; i += 1) {
    if (process.argv[i] === flag && process.argv[i + 1]) values.push(process.argv[i + 1]);
  }
  return values;
}

function csvValue(value) {
  if (value === null || value === undefined) return "";
  const text = typeof value === "string" ? value : JSON.stringify(value);
  const escaped = String(text).replace(/"/g, "\"\"");
  return `"${escaped}"`;
}

const reportPaths = argValues("--report");
if (reportPaths.length === 0) {
  throw new Error("No reports provided. Use --report <path> [--report <path> ...]");
}

const reports = reportPaths.map((path) => ({
  name: basename(path),
  path,
  text: readFileSync(path, "utf8"),
}));

const diagnostic = buildRecallEfficiencyReportFromReports(reports);

mkdirSync(outDir, { recursive: true });
const jsonOut = resolve(outDir, "googlebooks-recall-efficiency-diagnostic.json");
const csvOut = resolve(outDir, "googlebooks-recall-efficiency-diagnostic.csv");
const summaryOut = resolve(outDir, "googlebooks-recall-efficiency-summary.txt");

const jsonPayload = {
  generatedAt: new Date().toISOString(),
  inputs: reports.map((report) => report.path),
  totals: diagnostic.totals,
  summaryByRecallLoss: diagnostic.summaryByRecallLoss,
  familyRows: diagnostic.familyRows,
  queryRows: diagnostic.queryRows,
};
writeFileSync(jsonOut, JSON.stringify(jsonPayload, null, 2));

const csvHeader = [
  "queryFamily",
  "queryCount",
  "rawApiResults",
  "narrativeCandidates",
  "publicationIdentityPasses",
  "scoredCandidates",
  "selectedRecommendations",
  "narrativeYieldPct",
  "publicationSurvivalPct",
  "selectionEfficiencyPct",
  "overallRecallEfficiencyPct",
  "publicationShapeRejectionHistogram",
  "dominantRejectionReason",
  "dominantLossStage",
  "dominantLossCount",
  "likelyAction",
].join(",");

const csvRows = diagnostic.familyRows.map((row) => [
  row.queryFamily,
  row.queryCount,
  row.rawApiResults,
  row.narrativeCandidates,
  row.publicationIdentityPasses,
  row.scoredCandidates,
  row.selectedRecommendations,
  row.narrativeYield,
  row.publicationSurvival,
  row.selectionEfficiency,
  row.overallRecallEfficiency,
  csvValue(row.publicationShapeRejectionHistogram),
  row.dominantRejectionReason,
  row.dominantLossStage,
  row.dominantLossCount,
  row.likelyAction,
].join(","));
writeFileSync(csvOut, [csvHeader, ...csvRows].join("\n"));

const summaryLines = [
  "GOOGLE BOOKS RECALL EFFICIENCY SUMMARY",
  `Reports analyzed: ${reports.length}`,
  `Families analyzed: ${diagnostic.totals.families}`,
  "",
  "Ranked by recall loss (raw - selected):",
  ...diagnostic.summaryByRecallLoss.map((row, index) =>
    `${index + 1}. ${row.queryFamily} | loss=${row.recallLossCount} | lossRate=${row.recallLossRate}% | stage=${row.dominantLossStage} | action=${row.likelyAction}`,
  ),
];
writeFileSync(summaryOut, summaryLines.join("\n"));

console.log(`JSON written to: ${jsonOut}`);
console.log(`CSV written to: ${csvOut}`);
console.log(`Summary written to: ${summaryOut}`);
console.log("\nTop recall-loss families:");
for (const row of diagnostic.summaryByRecallLoss.slice(0, 10)) {
  console.log(`  ${row.queryFamily}: loss=${row.recallLossCount}, lossRate=${row.recallLossRate}%, action=${row.likelyAction}`);
}
