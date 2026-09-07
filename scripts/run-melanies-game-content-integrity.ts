import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  buildMelanieContentAuditReport,
  MELANIE_CONCEPTS_PER_AGE_BAND,
  MELANIE_CONCEPT_TOTAL,
  validateMelanieConceptLibrary,
} from "../lib/recommendationGames/melaniesGameContentValidation";

const issues = validateMelanieConceptLibrary();
const report = buildMelanieContentAuditReport();
fs.writeFileSync(path.join(process.cwd(), "docs", "melanies-game-content-audit.md"), report);
assert.deepEqual(issues, [], `Melanie content integrity failed:\n${issues.join("\n")}`);
console.log(`Melanie content integrity: ${MELANIE_CONCEPT_TOTAL} concepts (${MELANIE_CONCEPTS_PER_AGE_BAND} per age band), 256 unique semantic cover definitions.`);
