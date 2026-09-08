import {
  buildUnwrittenMapArtInventorySummary,
  validateUnwrittenMapPresentation,
} from "../lib/recommendationGames/unwrittenMapPresentationValidator";

const diagnostics = validateUnwrittenMapPresentation();
const encounterDiagnostics = diagnostics.filter(
  (issue) => issue.scope === "registry" || issue.scope === "encounter",
);
const inventory = buildUnwrittenMapArtInventorySummary();

if (
  encounterDiagnostics.length > 0
  || inventory.encounters.required !== 12
  || inventory.encounters.approved !== 12
  || inventory.encounters.missing !== 0
) {
  console.error("The Unwritten Map encounter hero gate failed:");
  for (const issue of encounterDiagnostics) {
    console.error(`[${issue.code}] ${issue.scenarioId || "-"}: ${issue.message}`);
  }
  process.exitCode = 1;
} else {
  console.log("The Unwritten Map encounter hero gate: PASS (12/12 approved local raster illustrations).");
  console.log(`Full focal-art commissioning remains BLOCKED: ${inventory.missing} choice/result illustrations outstanding.`);
}
