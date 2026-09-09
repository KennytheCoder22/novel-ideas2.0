import assert from "node:assert/strict";
import test from "node:test";

import {
  buildUnwrittenMapPresentationMetadata,
  type UnwrittenMapEncounterPresentation,
} from "./unwrittenMapPresentationContract";
import {
  buildUnwrittenMapArtInventorySummary,
  buildUnwrittenMapPresentationCoverageSummary,
  formatUnwrittenMapPresentationSummary,
  validateUnwrittenMapEncounterPresentation,
  validateUnwrittenMapPresentation,
} from "./unwrittenMapPresentationValidator";

function approvedEncounter(): UnwrittenMapEncounterPresentation {
  const encounter = buildUnwrittenMapPresentationMetadata().find((item) => item.scenarioId === "frog-parliament");
  assert.ok(encounter);
  return structuredClone(encounter);
}

test("the supplied Reed Parliament encounter has complete approved local raster coverage", () => {
  const issues = validateUnwrittenMapEncounterPresentation(approvedEncounter(), {
    assetExists: () => true,
  });
  assert.deepEqual(issues, []);
});

test("detects an explorer actor violation on the encounter's featured entity", () => {
  const encounter = approvedEncounter();
  (encounter as { actorRole: string }).actorRole = "explorer";
  const issues = validateUnwrittenMapEncounterPresentation(encounter, { assetExists: () => true });
  assert.ok(issues.some((issue) => issue.code === "explorer_actor_violation" && issue.scope === "encounter"));
});

test("detects explorer metadata and depiction violations on a player action", () => {
  const brokenRole = approvedEncounter();
  (brokenRole.choices[0] as { actorRole: string }).actorRole = "creature";
  const roleIssues = validateUnwrittenMapEncounterPresentation(brokenRole, { assetExists: () => true });
  assert.ok(roleIssues.some((issue) => issue.code === "explorer_actor_violation" && issue.scope === "choice"));

  const brokenDepiction = approvedEncounter();
  (brokenDepiction.choices[0].result.focalArt as unknown as { depictsActorRoles: string[] }).depictsActorRoles = ["creature"];
  const depictionIssues = validateUnwrittenMapEncounterPresentation(brokenDepiction, { assetExists: () => true });
  assert.ok(depictionIssues.some((issue) => issue.code === "actor_depiction_violation" && issue.scope === "result"));
});

test("detects duplicate focal art IDs, asset IDs, and paths", () => {
  const encounter = approvedEncounter();
  const first = encounter.choices[0].focalArt;
  const second = encounter.choices[1].focalArt as unknown as {
    id: string;
    assetId: string;
    assetPath: string;
  };
  second.id = first.id;
  second.assetId = first.assetId;
  second.assetPath = first.assetPath;
  const issues = validateUnwrittenMapEncounterPresentation(encounter, { assetExists: () => true });
  assert.ok(issues.filter((issue) => issue.code === "duplicate_art_id").length >= 3);
});

test("rejects generated, SVG, data URI, and network providers as production focal art", () => {
  for (const corrupt of [
    { kind: "vector_composition" },
    { assetPath: "assets/generated/focal.svg" },
    { assetPath: "data:image/png;base64,abc" },
    { assetPath: "https://example.com/focal.webp" },
  ]) {
    const encounter = approvedEncounter();
    Object.assign(encounter.focalArt as unknown as Record<string, unknown>, corrupt);
    const issues = validateUnwrittenMapEncounterPresentation(encounter, { assetExists: () => true });
    assert.ok(issues.some((issue) => issue.code === "invalid_asset_provider"), JSON.stringify(corrupt));
  }
});

test("rejects shared frames, mismatched slot identities, and invalid raster bytes as focal art", () => {
  const sharedFrame = approvedEncounter();
  Object.assign(sharedFrame.focalArt, {
    localAssetId: "shared-frame-world-map",
    assetPath: "assets/games/unwritten-map/world-map.webp",
  });
  const sharedFrameIssues = validateUnwrittenMapEncounterPresentation(sharedFrame, { assetExists: () => true });
  assert.ok(sharedFrameIssues.some((issue) => issue.code === "invalid_asset_provider"));

  const mismatchedIdentity = approvedEncounter();
  Object.assign(mismatchedIdentity.focalArt, {
    slot: "choice",
    assetId: "choice:frog-parliament:hear-frogs",
  });
  const identityIssues = validateUnwrittenMapEncounterPresentation(mismatchedIdentity, { assetExists: () => true });
  assert.ok(identityIssues.some((issue) => issue.code === "missing_metadata"));

  const invalidRaster = approvedEncounter();
  const rasterIssues = validateUnwrittenMapEncounterPresentation(invalidRaster, {
    assetExists: () => true,
    assetIsRaster: () => false,
  });
  assert.ok(rasterIssues.some((issue) => issue.code === "invalid_asset_provider"));
});

test("detects a region mismatch when the declared region disagrees with gameplay data", () => {
  const encounter = approvedEncounter();
  (encounter as { regionId: string }).regionId = "sunmeadow";
  const issues = validateUnwrittenMapEncounterPresentation(encounter, { assetExists: () => true });
  assert.ok(issues.some((issue) => issue.code === "region_mismatch"));
});

test("detects approved assets without manifest identity or files", () => {
  const missingDefinition = approvedEncounter();
  (missingDefinition.focalArt as { localAssetId: null }).localAssetId = null;
  const definitionIssues = validateUnwrittenMapEncounterPresentation(missingDefinition, { assetExists: () => true });
  assert.ok(definitionIssues.some((issue) => issue.code === "missing_asset_definition"));

  const missingFile = approvedEncounter();
  const fileIssues = validateUnwrittenMapEncounterPresentation(missingFile, { assetExists: () => false });
  assert.ok(fileIssues.some((issue) => issue.code === "missing_asset_file"));
});

test("missing commissioning slots block production completeness without pretending art exists", () => {
  const missing = buildUnwrittenMapPresentationMetadata().find((item) => item.scenarioId === "paper-dragon");
  assert.ok(missing);
  const issues = validateUnwrittenMapEncounterPresentation(missing, { assetExists: () => false });
  assert.equal(issues.filter((issue) => issue.code === "missing_required_asset").length, 8);
});

test("detects missing metadata when required fields are absent", () => {
  const encounter = approvedEncounter();
  (encounter as { environmentId: string }).environmentId = "";
  const issues = validateUnwrittenMapEncounterPresentation(encounter, { assetExists: () => true });
  assert.ok(issues.some((issue) => issue.code === "missing_metadata"));
});

test("encounter milestone, seven choice sets, and six result sets are complete while full inventory remains blocked", () => {
  const inventory = buildUnwrittenMapArtInventorySummary();
  assert.deepEqual(inventory, {
    required: 108,
    approved: 64,
    missing: 44,
    encounters: { required: 12, approved: 12, missing: 0 },
    choices: { required: 48, approved: 28, missing: 20 },
    results: { required: 48, approved: 24, missing: 24 },
  });
  const diagnostics = validateUnwrittenMapPresentation();
  assert.equal(diagnostics.filter((issue) => issue.code === "missing_required_asset").length, 44);
  assert.equal(diagnostics.filter((issue) => issue.scope === "encounter" || issue.scope === "registry").length, 0);
});

test("inventory never counts declared approvals whose local files fail validation", () => {
  const inventory = buildUnwrittenMapArtInventorySummary({ assetExists: () => false });
  assert.equal(inventory.required, 108);
  assert.equal(inventory.approved, 0);
  assert.equal(inventory.missing, 108);
});

test("coverage summary identifies approved choice sets while every missing result remains blocked", () => {
  const summary = buildUnwrittenMapPresentationCoverageSummary();
  assert.equal(summary.length, 12);
  for (const row of summary) {
    assert.equal(row.choiceCount, 4);
    if (row.scenarioId === "frog-parliament") {
      assert.equal(row.encounterOk, true);
      assert.equal(row.choiceOkCount, 4);
      assert.equal(row.resultOkCount, 4);
    } else if (row.scenarioId === "lantern-fair") {
      assert.equal(row.encounterOk, true);
      assert.equal(row.choiceOkCount, 4);
      assert.equal(row.resultOkCount, 4);
      assert.equal(row.diagnosticCount, 0);
    } else if (row.scenarioId === "whisper-orchard") {
      assert.equal(row.encounterOk, true);
      assert.equal(row.choiceOkCount, 4);
      assert.equal(row.resultOkCount, 4);
      assert.equal(row.diagnosticCount, 0);
    } else if (row.scenarioId === "clockwork-bridge") {
      assert.equal(row.encounterOk, true);
      assert.equal(row.choiceOkCount, 4);
      assert.equal(row.resultOkCount, 4);
      assert.equal(row.diagnosticCount, 0);
    } else if (row.scenarioId === "cloud-shepherd") {
      assert.equal(row.encounterOk, true);
      assert.equal(row.choiceOkCount, 4);
      assert.equal(row.resultOkCount, 4);
      assert.equal(row.diagnosticCount, 0);
    } else if (row.scenarioId === "mirror-marsh") {
      assert.equal(row.encounterOk, true);
      assert.equal(row.choiceOkCount, 4);
      assert.equal(row.resultOkCount, 4);
      assert.equal(row.diagnosticCount, 0);
    } else if (row.scenarioId === "rain-camp") {
      assert.equal(row.encounterOk, true);
      assert.equal(row.choiceOkCount, 4);
      assert.equal(row.resultOkCount, 0);
      assert.equal(row.diagnosticCount, 4);
    } else {
      assert.ok(row.diagnosticCount > 0, `${row.scenarioId} should remain blocked on commissioned art`);
    }
  }
});

test("human-readable summary reports blocked production status and exact inventory", () => {
  const summary = formatUnwrittenMapPresentationSummary();
  assert.match(summary, /Raster inventory: 64\/108 approved; 44 commissioning assets missing/);
  assert.match(summary, /Production status: BLOCKED/);
  assert.match(summary, /Scenario: frog-parliament \[approved\]/);
  assert.match(summary, /Scenario: mirror-marsh \[approved\]/);
  assert.match(summary, /Scenario: ember-library \[approved\]/);
});
