import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildTeenGoogleBooksFallbackRootCauseBreakdown,
  parseTeenGoogleBooksRunsFromReportText,
} from "./lib/teen-googlebooks-fallback-root-cause.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(scriptDir, "output");

function argValues(flag) {
  const values = [];
  for (let i = 0; i < process.argv.length; i += 1) {
    if (process.argv[i] === flag && process.argv[i + 1]) values.push(process.argv[i + 1]);
  }
  return values;
}

const reportPaths = argValues("--report");
if (reportPaths.length === 0) {
  throw new Error("No reports provided. Use --report <path> [--report <path> ...]");
}

const allRuns = [];
for (const reportPath of reportPaths) {
  const text = readFileSync(reportPath, "utf8");
  allRuns.push(...parseTeenGoogleBooksRunsFromReportText(text, basename(reportPath)));
}
const breakdown = buildTeenGoogleBooksFallbackRootCauseBreakdown(allRuns);

mkdirSync(outDir, { recursive: true });
const jsonOut = resolve(outDir, "teen-googlebooks-fallback-root-cause-breakdown.json");
const summaryOut = resolve(outDir, "teen-googlebooks-fallback-root-cause-breakdown-summary.txt");

writeFileSync(jsonOut, JSON.stringify({
  generatedAt: new Date().toISOString(),
  inputs: reportPaths,
  ...breakdown,
}, null, 2));

const b = breakdown.bucketCounts;
const summaryLines = [
  `${breakdown.totalRuns} Teen sessions`,
  "",
  `Primary sufficient ............ ${b.A_primary_query_succeeded}`,
  `Recall shortage ............... ${b.B_insufficient_recall}`,
  `Publication filtering ......... ${b.C_publication_filtering}`,
  `Taste filtering ............... ${b.D_taste_filtering}`,
  `Diversity filtering ........... ${b.E_diversity_filtering}`,
  `Ranking/selection ............. ${b.F_ranking_selection}`,
  `Query mismatch ................ ${b.G_query_mismatch}`,
  "",
  "Per-run bucket assignments:",
  ...breakdown.runs.map((run) =>
    `- ${run.report} ${run.presetTestName ? `(${run.presetTestName})` : ""}: ${run.bucket} `
      + `| primaryAccepted=${run.primaryAccepted} secondaryAccepted=${run.secondaryAccepted} `
      + `primarySelected=${run.primarySelected} secondarySelected=${run.secondarySelected} finalSelected=${run.finalSelectedCount}`,
  ),
];
writeFileSync(summaryOut, `${summaryLines.join("\n")}\n`);

console.log(`JSON written to: ${jsonOut}`);
console.log(`Summary written to: ${summaryOut}`);

