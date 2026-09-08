import assert from "node:assert/strict";
import test from "node:test";

import type { UnwrittenMapEncounterPresentation } from "./unwrittenMapPresentationContract";
import {
  buildUnwrittenMapPresentationCoverageSummary,
  formatUnwrittenMapPresentationSummary,
  validateUnwrittenMapEncounterPresentation,
  validateUnwrittenMapPresentation,
} from "./unwrittenMapPresentationValidator";

const FROG_PARLIAMENT_CHOICE_IDS = ["grand-speech", "moon-experiment", "hear-frogs", "night-pageant"] as const;
const MOSSMERE_MOTIFS = ["reeds", "frogs", "lily-pads", "marsh-water", "mist", "wetland-flora"];

function baseMossmereEncounter(): UnwrittenMapEncounterPresentation {
  return {
    scenarioId: "frog-parliament",
    regionId: "mossmere",
    landmarkId: "frog-parliament",
    environmentId: "mossmere-reed-parliament",
    characterId: "reed-parliament-frogs",
    actorRole: "creature",
    moodId: "playful",
    focalArt: {
      kind: "vector_composition",
      id: "art:encounter:frog-parliament",
      paletteId: "mossmere_primary",
      motifTokens: MOSSMERE_MOTIFS,
      shapeTokens: ["arc", "band"],
    },
    choices: FROG_PARLIAMENT_CHOICE_IDS.map((choiceId) => ({
      scenarioId: "frog-parliament",
      choiceId,
      actionId: choiceId,
      actorRole: "explorer",
      moodId: "playful",
      focalArt: {
        kind: "vector_composition",
        id: `art:choice:${choiceId}`,
        paletteId: "mossmere_primary",
        motifTokens: MOSSMERE_MOTIFS,
        shapeTokens: ["arc"],
      },
      result: {
        actorRole: "explorer",
        moodId: "playful",
        focalArt: {
          kind: "vector_composition",
          id: `art:result:${choiceId}`,
          paletteId: "mossmere_fallback",
          motifTokens: MOSSMERE_MOTIFS,
          shapeTokens: ["band"],
        },
      },
    })),
  };
}

test("a well-formed encounter presentation produces zero diagnostics", () => {
  const issues = validateUnwrittenMapEncounterPresentation(baseMossmereEncounter(), {
    assetExists: () => true,
  });
  assert.deepEqual(issues, []);
});

test("detects an explorer actor violation on the encounter's featured entity", () => {
  const encounter = baseMossmereEncounter();
  // Encounters must never be attributed to the explorer; corrupt it here.
  (encounter as { actorRole: string }).actorRole = "explorer";
  const issues = validateUnwrittenMapEncounterPresentation(encounter, { assetExists: () => true });
  assert.ok(issues.some((issue) => issue.code === "explorer_actor_violation" && issue.scope === "encounter"));
});

test("detects an explorer actor violation on a choice or its result", () => {
  const brokenChoice = baseMossmereEncounter();
  (brokenChoice.choices[0] as { actorRole: string }).actorRole = "creature";
  const choiceIssues = validateUnwrittenMapEncounterPresentation(brokenChoice, { assetExists: () => true });
  assert.ok(choiceIssues.some((issue) => issue.code === "explorer_actor_violation" && issue.scope === "choice"));

  const brokenResult = baseMossmereEncounter();
  (brokenResult.choices[0].result as { actorRole: string }).actorRole = "community";
  const resultIssues = validateUnwrittenMapEncounterPresentation(brokenResult, { assetExists: () => true });
  assert.ok(resultIssues.some((issue) => issue.code === "explorer_actor_violation" && issue.scope === "result"));
});

test("detects a duplicate focal art id reused between encounter and choice", () => {
  const encounter = baseMossmereEncounter();
  (encounter.choices[0].focalArt as { id: string }).id = encounter.focalArt.id;
  const issues = validateUnwrittenMapEncounterPresentation(encounter, { assetExists: () => true });
  assert.ok(issues.some((issue) => issue.code === "duplicate_art_id"));
});

test("detects an invalid theme token unknown to any region", () => {
  const encounter = baseMossmereEncounter();
  (encounter.focalArt as unknown as { motifTokens: string[] }).motifTokens = ["not-a-real-motif"];
  const issues = validateUnwrittenMapEncounterPresentation(encounter, { assetExists: () => true });
  assert.ok(issues.some((issue) => issue.code === "invalid_theme"));
});

test("detects a region mismatch when a motif token belongs to a different region", () => {
  const encounter = baseMossmereEncounter();
  (encounter.focalArt as unknown as { motifTokens: string[] }).motifTokens = ["reeds", "wildflowers"]; // wildflowers is sunmeadow's
  const issues = validateUnwrittenMapEncounterPresentation(encounter, { assetExists: () => true });
  assert.ok(issues.some((issue) => issue.code === "region_mismatch"));
});

test("detects a region mismatch when the declared regionId disagrees with gameplay data", () => {
  const encounter = baseMossmereEncounter();
  (encounter as { regionId: string }).regionId = "sunmeadow";
  const issues = validateUnwrittenMapEncounterPresentation(encounter, { assetExists: () => true });
  assert.ok(issues.some((issue) => issue.code === "region_mismatch"));
});

test("detects a missing local asset definition", () => {
  const encounter = baseMossmereEncounter();
  (encounter.focalArt as unknown as { kind: string; assetId: string }).kind = "local_asset";
  (encounter.focalArt as unknown as { assetId: string }).assetId = "not-a-real-asset-id";
  const issues = validateUnwrittenMapEncounterPresentation(encounter, { assetExists: () => true });
  assert.ok(issues.some((issue) => issue.code === "missing_asset_definition"));
});

test("detects a missing local asset file on disk", () => {
  const encounter = baseMossmereEncounter();
  (encounter.focalArt as unknown as { kind: string; assetId: string }).kind = "local_asset";
  (encounter.focalArt as unknown as { assetId: string }).assetId = "frog-parliament-encounter";
  const issues = validateUnwrittenMapEncounterPresentation(encounter, { assetExists: () => false });
  assert.ok(issues.some((issue) => issue.code === "missing_asset_file"));
});

test("detects missing metadata when required fields are absent", () => {
  const encounter = baseMossmereEncounter();
  (encounter as { environmentId: string }).environmentId = "";
  const issues = validateUnwrittenMapEncounterPresentation(encounter, { assetExists: () => true });
  assert.ok(issues.some((issue) => issue.code === "missing_metadata"));
});

test("the real, live presentation metadata contract is fully valid with zero diagnostics", () => {
  const issues = validateUnwrittenMapPresentation();
  assert.deepEqual(issues, [], `unexpected diagnostics:\n${issues.map((issue) => `${issue.code}: ${issue.message}`).join("\n")}`);
});

test("coverage summary reports all 12 scenarios with 4 choices/results each and no diagnostics", () => {
  const summary = buildUnwrittenMapPresentationCoverageSummary();
  assert.equal(summary.length, 12);
  for (const row of summary) {
    assert.equal(row.encounterOk, true, `${row.scenarioId} encounter should be ok`);
    assert.equal(row.choiceCount, 4);
    assert.equal(row.choiceOkCount, 4, `${row.scenarioId} all choices should be ok`);
    assert.equal(row.resultOkCount, 4, `${row.scenarioId} all results should be ok`);
    assert.equal(row.diagnosticCount, 0, `${row.scenarioId} should have zero diagnostics`);
  }
});

test("human-readable summary is grouped by region/scenario/choice/result and reports OK status", () => {
  const summary = formatUnwrittenMapPresentationSummary();
  assert.match(summary, /Status: OK \(0 diagnostics\)/);
  assert.match(summary, /Region: mossmere/);
  assert.match(summary, /Scenario: frog-parliament/);
  assert.match(summary, /Choice: hear-frogs/);
  assert.match(summary, /Result: \[ok\]/);
});
