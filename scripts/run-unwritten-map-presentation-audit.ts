import assert from "node:assert/strict";

import {
  buildUnwrittenMapPresentationCoverageSummary,
  formatUnwrittenMapPresentationSummary,
  validateUnwrittenMapPresentation,
} from "../lib/recommendationGames/unwrittenMapPresentationValidator";

const diagnostics = validateUnwrittenMapPresentation();
const summary = buildUnwrittenMapPresentationCoverageSummary();
const report = formatUnwrittenMapPresentationSummary();

console.log(report);

assert.equal(summary.length, 12, `expected 12 scenarios in the coverage summary, found ${summary.length}`);
for (const row of summary) {
  assert.equal(row.choiceCount, 4, `${row.scenarioId} must have exactly 4 choices`);
}

if (diagnostics.length > 0) {
  const missingAssetCount = diagnostics.filter((issue) => issue.code === "missing_required_asset").length;
  const integrityIssues = diagnostics.filter((issue) => issue.code !== "missing_required_asset");

  if (integrityIssues.length > 0) {
    console.error("\nPresentation integrity failures:");
    for (const issue of integrityIssues) {
      console.error(`[${issue.code}] ${issue.scenarioId || "-"}${issue.choiceId ? ` / ${issue.choiceId}` : ""}: ${issue.message}`);
    }
  }

  console.error(
    `\nPRODUCTION BLOCKED: ${missingAssetCount} authorized local raster illustration${missingAssetCount === 1 ? "" : "s"} still require commissioning. See docs/unwritten-map-art-manifest.md.`,
  );
  process.exitCode = 1;
} else {
  console.log(`\nThe Unwritten Map presentation metadata contract: OK (${summary.length} scenarios, ${summary.reduce((total, row) => total + row.choiceCount, 0)} choices, 0 diagnostics).`);
}
