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

assert.deepEqual(
  diagnostics,
  [],
  `The Unwritten Map presentation metadata contract failed validation:\n${diagnostics.map((issue) => `[${issue.code}] ${issue.scenarioId || "-"}${issue.choiceId ? ` / ${issue.choiceId}` : ""}: ${issue.message}`).join("\n")}`,
);
assert.equal(summary.length, 12, `expected 12 scenarios in the coverage summary, found ${summary.length}`);
for (const row of summary) {
  assert.equal(row.choiceCount, 4, `${row.scenarioId} must have exactly 4 choices`);
}

console.log(`\nThe Unwritten Map presentation metadata contract: OK (${summary.length} scenarios, ${summary.reduce((total, row) => total + row.choiceCount, 0)} choices, 0 diagnostics).`);
