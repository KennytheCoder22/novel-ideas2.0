// Repository-local validator for The Unwritten Map's domain presentation
// metadata contract.
//
// This module is Node-only (it uses fs/path to confirm local asset files
// exist on disk) and is intentionally never imported by app/games/
// unwritten-map.tsx or any other React Native bundle entry point. It is
// meant to be run from scripts and tests.

import fs from "node:fs";
import path from "node:path";

import { UNWRITTEN_MAP_SCENARIOS } from "./unwrittenMap";
import {
  UNWRITTEN_MAP_REGION_IDS,
  unwrittenMapRegionOwningMotifToken,
  type UnwrittenMapRegionId,
} from "./unwrittenMapRegions";
import {
  UNWRITTEN_MAP_ACTOR_ROLES,
  UNWRITTEN_MAP_SCENARIO_CHOICE_IDS,
  UNWRITTEN_MAP_SCENARIO_IDS,
  buildUnwrittenMapPresentationMetadata,
  unwrittenMapSceneRegistryEntry,
  type UnwrittenMapArtDefinition,
  type UnwrittenMapEncounterPresentation,
} from "./unwrittenMapPresentationContract";
import { unwrittenMapLocalAssetPath } from "./unwrittenMapArtAssets";

export type UnwrittenMapPresentationDiagnosticCode =
  | "coverage_gap"
  | "missing_metadata"
  | "invalid_theme"
  | "region_mismatch"
  | "duplicate_art_id"
  | "missing_asset_definition"
  | "missing_asset_file"
  | "explorer_actor_violation";

export type UnwrittenMapPresentationScope = "registry" | "encounter" | "choice" | "result";

export type UnwrittenMapPresentationDiagnostic = {
  code: UnwrittenMapPresentationDiagnosticCode;
  scope: UnwrittenMapPresentationScope;
  regionId: UnwrittenMapRegionId | null;
  scenarioId: string | null;
  choiceId: string | null;
  message: string;
};

export type UnwrittenMapPresentationValidationOptions = {
  /** Absolute path to the repository root; defaults to this module's repo. */
  repoRoot?: string;
  /** Injectable for tests; defaults to a real fs.existsSync check. */
  assetExists?: (repoRelativePath: string) => boolean;
};

const DEFAULT_REPO_ROOT = path.resolve(__dirname, "..", "..");

function defaultAssetExists(repoRoot: string) {
  return (repoRelativePath: string) => fs.existsSync(path.join(repoRoot, repoRelativePath));
}

function diagnostic(
  code: UnwrittenMapPresentationDiagnosticCode,
  scope: UnwrittenMapPresentationScope,
  message: string,
  regionId: UnwrittenMapRegionId | null = null,
  scenarioId: string | null = null,
  choiceId: string | null = null,
): UnwrittenMapPresentationDiagnostic {
  return { code, scope, regionId, scenarioId, choiceId, message };
}

function validateArtDefinition(
  art: UnwrittenMapArtDefinition | null | undefined,
  regionId: UnwrittenMapRegionId,
  scope: UnwrittenMapPresentationScope,
  scenarioId: string,
  choiceId: string | null,
  seenArtIds: Set<string>,
  assetExists: (relPath: string) => boolean,
  issues: UnwrittenMapPresentationDiagnostic[],
): void {
  if (!art || !art.id) {
    issues.push(diagnostic("missing_metadata", scope, `${scope} focal art is missing`, regionId, scenarioId, choiceId));
    return;
  }

  if (seenArtIds.has(art.id)) {
    issues.push(diagnostic(
      "duplicate_art_id",
      scope,
      `art id "${art.id}" is reused; every encounter/choice/result must have a unique focal art identity`,
      regionId,
      scenarioId,
      choiceId,
    ));
  }
  seenArtIds.add(art.id);

  if (art.kind === "local_asset") {
    const relPath = unwrittenMapLocalAssetPath(art.assetId);
    if (!relPath) {
      issues.push(diagnostic(
        "missing_asset_definition",
        scope,
        `local asset "${art.assetId}" referenced by "${art.id}" has no manifest definition`,
        regionId,
        scenarioId,
        choiceId,
      ));
    } else if (!assetExists(relPath)) {
      issues.push(diagnostic(
        "missing_asset_file",
        scope,
        `local asset file "${relPath}" referenced by "${art.id}" does not exist on disk`,
        regionId,
        scenarioId,
        choiceId,
      ));
    }
    return;
  }

  if (!art.motifTokens || art.motifTokens.length === 0) {
    issues.push(diagnostic("missing_metadata", scope, `art "${art.id}" has no motif tokens`, regionId, scenarioId, choiceId));
    return;
  }

  for (const token of art.motifTokens) {
    const owner = unwrittenMapRegionOwningMotifToken(token);
    if (!owner) {
      issues.push(diagnostic(
        "invalid_theme",
        scope,
        `motif token "${token}" on art "${art.id}" is not part of any known region vocabulary`,
        regionId,
        scenarioId,
        choiceId,
      ));
    } else if (owner !== regionId) {
      issues.push(diagnostic(
        "region_mismatch",
        scope,
        `motif token "${token}" on art "${art.id}" belongs to region "${owner}", not "${regionId}"`,
        regionId,
        scenarioId,
        choiceId,
      ));
    }
  }

  if (!art.paletteId.startsWith(`${regionId}_`)) {
    issues.push(diagnostic(
      "region_mismatch",
      scope,
      `palette id "${art.paletteId}" on art "${art.id}" does not belong to region "${regionId}"`,
      regionId,
      scenarioId,
      choiceId,
    ));
  }
}

function validateCoverage(issues: UnwrittenMapPresentationDiagnostic[]): void {
  const liveScenarioIds = UNWRITTEN_MAP_SCENARIOS.map((scenario) => scenario.id);
  const declaredScenarioIds = [...UNWRITTEN_MAP_SCENARIO_IDS];
  if (
    liveScenarioIds.length !== declaredScenarioIds.length
    || liveScenarioIds.some((id, index) => id !== declaredScenarioIds[index])
  ) {
    issues.push(diagnostic(
      "coverage_gap",
      "registry",
      `declared scenario id list has drifted from gameplay data. live=[${liveScenarioIds.join(", ")}] declared=[${declaredScenarioIds.join(", ")}]`,
    ));
  }

  for (const scenario of UNWRITTEN_MAP_SCENARIOS) {
    const declaredChoiceIds = (UNWRITTEN_MAP_SCENARIO_CHOICE_IDS as Record<string, readonly string[]>)[scenario.id];
    const liveChoiceIds = scenario.choices.map((choice) => choice.id);
    if (!declaredChoiceIds) {
      issues.push(diagnostic(
        "coverage_gap",
        "registry",
        `scenario "${scenario.id}" has no declared choice-id list`,
        scenario.regionId as UnwrittenMapRegionId,
        scenario.id,
      ));
      continue;
    }
    if (
      declaredChoiceIds.length !== liveChoiceIds.length
      || liveChoiceIds.some((id, index) => id !== declaredChoiceIds[index])
    ) {
      issues.push(diagnostic(
        "coverage_gap",
        "registry",
        `scenario "${scenario.id}" declared choice ids have drifted from gameplay data. live=[${liveChoiceIds.join(", ")}] declared=[${declaredChoiceIds.join(", ")}]`,
        scenario.regionId as UnwrittenMapRegionId,
        scenario.id,
      ));
    }

    if (!unwrittenMapSceneRegistryEntry(scenario.id)) {
      issues.push(diagnostic(
        "missing_metadata",
        "registry",
        `scenario "${scenario.id}" has no scene registry entry (environment/character/actor role)`,
        scenario.regionId as UnwrittenMapRegionId,
        scenario.id,
      ));
    }
  }
}

function validateEncounter(
  encounter: UnwrittenMapEncounterPresentation,
  seenArtIds: Set<string>,
  assetExists: (relPath: string) => boolean,
  issues: UnwrittenMapPresentationDiagnostic[],
): void {
  const { regionId, scenarioId } = encounter;

  if (!UNWRITTEN_MAP_REGION_IDS.includes(regionId)) {
    issues.push(diagnostic("missing_metadata", "encounter", `scenario "${scenarioId}" has an invalid regionId "${regionId}"`, null, scenarioId));
    return;
  }

  const liveScenario = UNWRITTEN_MAP_SCENARIOS.find((scenario) => scenario.id === scenarioId);
  if (liveScenario && liveScenario.regionId !== regionId) {
    issues.push(diagnostic(
      "region_mismatch",
      "encounter",
      `scenario "${scenarioId}" presentation regionId "${regionId}" does not match gameplay regionId "${liveScenario.regionId}"`,
      regionId,
      scenarioId,
    ));
  }

  if (!encounter.environmentId || !encounter.characterId || !encounter.landmarkId || !encounter.moodId) {
    issues.push(diagnostic("missing_metadata", "encounter", `scenario "${scenarioId}" is missing environment/character/landmark/mood metadata`, regionId, scenarioId));
  }

  if ((encounter.actorRole as string) === "explorer" || !UNWRITTEN_MAP_ACTOR_ROLES.includes(encounter.actorRole)) {
    issues.push(diagnostic(
      "explorer_actor_violation",
      "encounter",
      `scenario "${scenarioId}" encounter actor role must be community/creature/environment, got "${encounter.actorRole}"`,
      regionId,
      scenarioId,
    ));
  }

  validateArtDefinition(encounter.focalArt, regionId, "encounter", scenarioId, null, seenArtIds, assetExists, issues);

  if (encounter.choices.length !== 4) {
    issues.push(diagnostic("missing_metadata", "encounter", `scenario "${scenarioId}" must have exactly 4 choices, found ${encounter.choices.length}`, regionId, scenarioId));
  }

  for (const choice of encounter.choices) {
    if (choice.actorRole !== "explorer") {
      issues.push(diagnostic(
        "explorer_actor_violation",
        "choice",
        `choice "${choice.choiceId}" is a player-performed action and must have actorRole "explorer", got "${choice.actorRole}"`,
        regionId,
        scenarioId,
        choice.choiceId,
      ));
    }
    if (choice.result.actorRole !== "explorer") {
      issues.push(diagnostic(
        "explorer_actor_violation",
        "result",
        `result for choice "${choice.choiceId}" must have actorRole "explorer", got "${choice.result.actorRole}"`,
        regionId,
        scenarioId,
        choice.choiceId,
      ));
    }
    if (!choice.moodId || !choice.actionId) {
      issues.push(diagnostic("missing_metadata", "choice", `choice "${choice.choiceId}" is missing mood/action metadata`, regionId, scenarioId, choice.choiceId));
    }

    validateArtDefinition(choice.focalArt, regionId, "choice", scenarioId, choice.choiceId, seenArtIds, assetExists, issues);
    validateArtDefinition(choice.result.focalArt, regionId, "result", scenarioId, choice.choiceId, seenArtIds, assetExists, issues);
  }
}

/**
 * Validates a single already-built encounter presentation. Exported so
 * tests can exercise each diagnostic path directly with crafted fixtures,
 * independent of the full live metadata build.
 */
export function validateUnwrittenMapEncounterPresentation(
  encounter: UnwrittenMapEncounterPresentation,
  options: UnwrittenMapPresentationValidationOptions = {},
): UnwrittenMapPresentationDiagnostic[] {
  const repoRoot = options.repoRoot || DEFAULT_REPO_ROOT;
  const assetExists = options.assetExists || defaultAssetExists(repoRoot);
  const issues: UnwrittenMapPresentationDiagnostic[] = [];
  validateEncounter(encounter, new Set(), assetExists, issues);
  return issues;
}

/**
 * Validates the full presentation metadata contract, returning actionable
 * diagnostics. An empty array means the contract is fully valid.
 */
export function validateUnwrittenMapPresentation(
  options: UnwrittenMapPresentationValidationOptions = {},
): UnwrittenMapPresentationDiagnostic[] {
  const repoRoot = options.repoRoot || DEFAULT_REPO_ROOT;
  const assetExists = options.assetExists || defaultAssetExists(repoRoot);
  const issues: UnwrittenMapPresentationDiagnostic[] = [];

  validateCoverage(issues);

  const metadata = buildUnwrittenMapPresentationMetadata();
  const seenArtIds = new Set<string>();

  for (const encounter of metadata) {
    validateEncounter(encounter, seenArtIds, assetExists, issues);
  }

  return issues;
}

// ---------------------------------------------------------------------------
// Coverage summary
// ---------------------------------------------------------------------------

export type UnwrittenMapPresentationCoverageSummary = {
  regionId: UnwrittenMapRegionId;
  scenarioId: string;
  encounterOk: boolean;
  choiceCount: number;
  choiceOkCount: number;
  resultOkCount: number;
  diagnosticCount: number;
}[];

export function buildUnwrittenMapPresentationCoverageSummary(
  options: UnwrittenMapPresentationValidationOptions = {},
): UnwrittenMapPresentationCoverageSummary {
  const diagnostics = validateUnwrittenMapPresentation(options);
  const metadata = buildUnwrittenMapPresentationMetadata();

  return metadata.map((encounter) => {
    const scenarioDiagnostics = diagnostics.filter((issue) => issue.scenarioId === encounter.scenarioId);
    const encounterDiagnostics = scenarioDiagnostics.filter((issue) => issue.scope === "encounter" || issue.scope === "registry");
    const choiceOkCount = encounter.choices.filter((choice) => (
      !scenarioDiagnostics.some((issue) => issue.scope === "choice" && issue.choiceId === choice.choiceId)
    )).length;
    const resultOkCount = encounter.choices.filter((choice) => (
      !scenarioDiagnostics.some((issue) => issue.scope === "result" && issue.choiceId === choice.choiceId)
    )).length;

    return {
      regionId: encounter.regionId,
      scenarioId: encounter.scenarioId,
      encounterOk: encounterDiagnostics.length === 0,
      choiceCount: encounter.choices.length,
      choiceOkCount,
      resultOkCount,
      diagnosticCount: scenarioDiagnostics.length,
    };
  });
}

/** Produces a human-readable report grouped by region > scenario > choice > result. */
export function formatUnwrittenMapPresentationSummary(
  options: UnwrittenMapPresentationValidationOptions = {},
): string {
  const diagnostics = validateUnwrittenMapPresentation(options);
  const metadata = buildUnwrittenMapPresentationMetadata();
  const lines: string[] = [];

  lines.push("The Unwritten Map — presentation metadata coverage");
  lines.push(diagnostics.length === 0
    ? "Status: OK (0 diagnostics)"
    : `Status: FAILED (${diagnostics.length} diagnostic${diagnostics.length === 1 ? "" : "s"})`);
  lines.push("");

  for (const regionId of UNWRITTEN_MAP_REGION_IDS) {
    const regionScenarios = metadata.filter((encounter) => encounter.regionId === regionId);
    if (regionScenarios.length === 0) continue;
    lines.push(`Region: ${regionId} (${regionScenarios.length} scenario${regionScenarios.length === 1 ? "" : "s"})`);

    for (const encounter of regionScenarios) {
      const scenarioDiagnostics = diagnostics.filter((issue) => issue.scenarioId === encounter.scenarioId);
      const encounterDiagnostics = scenarioDiagnostics.filter((issue) => issue.scope === "encounter" || issue.scope === "registry");
      lines.push(`  Scenario: ${encounter.scenarioId} [${encounterDiagnostics.length === 0 ? "ok" : "FAIL"}] art=${encounter.focalArt.id} actor=${encounter.actorRole}`);

      for (const choice of encounter.choices) {
        const choiceIssues = scenarioDiagnostics.filter((issue) => issue.scope === "choice" && issue.choiceId === choice.choiceId);
        const resultIssues = scenarioDiagnostics.filter((issue) => issue.scope === "result" && issue.choiceId === choice.choiceId);
        lines.push(`    Choice: ${choice.choiceId} [${choiceIssues.length === 0 ? "ok" : "FAIL"}] art=${choice.focalArt.id}`);
        lines.push(`      Result: [${resultIssues.length === 0 ? "ok" : "FAIL"}] art=${choice.result.focalArt.id}`);
      }
    }
    lines.push("");
  }

  if (diagnostics.length > 0) {
    lines.push("Diagnostics:");
    for (const issue of diagnostics) {
      lines.push(`  [${issue.code}] (${issue.scope}) ${issue.scenarioId || "-"}${issue.choiceId ? ` / ${issue.choiceId}` : ""}: ${issue.message}`);
    }
  }

  return lines.join("\n");
}
