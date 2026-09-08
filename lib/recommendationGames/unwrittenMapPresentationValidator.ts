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
import {
  UNWRITTEN_MAP_SHARED_FRAME_ASSET_IDS,
  unwrittenMapLocalAssetPath,
} from "./unwrittenMapArtAssets";

export type UnwrittenMapPresentationDiagnosticCode =
  | "coverage_gap"
  | "missing_metadata"
  | "invalid_theme"
  | "region_mismatch"
  | "duplicate_art_id"
  | "missing_asset_definition"
  | "missing_asset_file"
  | "missing_required_asset"
  | "invalid_asset_provider"
  | "actor_depiction_violation"
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
  /** Injectable for tests; defaults to checking the declared raster file signature. */
  assetIsRaster?: (repoRelativePath: string) => boolean;
};

const DEFAULT_REPO_ROOT = path.resolve(__dirname, "..", "..");

function defaultAssetExists(repoRoot: string) {
  return (repoRelativePath: string) => fs.existsSync(path.join(repoRoot, repoRelativePath));
}

function defaultAssetIsRaster(repoRoot: string) {
  return (repoRelativePath: string) => {
    const bytes = fs.readFileSync(path.join(repoRoot, repoRelativePath)).subarray(0, 12);
    const extension = path.extname(repoRelativePath).toLowerCase();
    if (extension === ".webp") {
      return bytes.subarray(0, 4).toString("ascii") === "RIFF"
        && bytes.subarray(8, 12).toString("ascii") === "WEBP";
    }
    if (extension === ".png") {
      return bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    }
    if (extension === ".jpg" || extension === ".jpeg") {
      return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    }
    if (extension === ".avif") {
      return bytes.subarray(4, 8).toString("ascii") === "ftyp"
        && ["avif", "avis"].includes(bytes.subarray(8, 12).toString("ascii"));
    }
    return false;
  };
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
  assetIsRaster: (relPath: string) => boolean,
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

  if (art.kind !== "local_raster") {
    issues.push(diagnostic(
      "invalid_asset_provider",
      scope,
      `${scope} art "${art.id}" must use a local illustrated raster; generated SVG/data URI/icon providers are not production art`,
      regionId,
      scenarioId,
      choiceId,
    ));
    return;
  }

  const expectedAssetId = scope === "encounter"
    ? `encounter:${scenarioId}`
    : `${scope}:${scenarioId}:${choiceId}`;
  if (art.slot !== scope || art.assetId !== expectedAssetId) {
    issues.push(diagnostic(
      "missing_metadata",
      scope,
      `${scope} art must use slot "${scope}" and asset id "${expectedAssetId}", got "${art.slot}" / "${art.assetId}"`,
      regionId,
      scenarioId,
      choiceId,
    ));
  }

  if (!/^[a-zA-Z0-9_./-]+\.(webp|png|jpe?g|avif)$/.test(art.assetPath)
    || art.assetPath.startsWith("data:")
    || /^https?:/i.test(art.assetPath)
    || /\.svg$/i.test(art.assetPath)) {
    issues.push(diagnostic(
      "invalid_asset_provider",
      scope,
      `asset "${art.assetId}" must reference a repository-local raster path, got "${art.assetPath}"`,
      regionId,
      scenarioId,
      choiceId,
    ));
  }

  for (const uniqueValue of [`asset:${art.assetId}`, `path:${art.assetPath}`]) {
    if (seenArtIds.has(uniqueValue)) {
      issues.push(diagnostic(
        "duplicate_art_id",
        scope,
        `focal raster "${art.assetId}" reuses an asset id or file path; every encounter/choice/result requires a distinct illustration`,
        regionId,
        scenarioId,
        choiceId,
      ));
    }
    seenArtIds.add(uniqueValue);
  }

  if (!art.brief || !art.targetAspectRatio || !art.recommendedDimensions) {
    issues.push(diagnostic(
      "missing_metadata",
      scope,
      `asset "${art.assetId}" is missing its commissioning brief, aspect ratio, or dimensions`,
      regionId,
      scenarioId,
      choiceId,
    ));
  }

  if ((scope === "choice" || scope === "result") && !art.depictsActorRoles.includes("explorer")) {
    issues.push(diagnostic(
      "actor_depiction_violation",
      scope,
      `player-performed ${scope} asset "${art.assetId}" must depict the explorer performing the action`,
      regionId,
      scenarioId,
      choiceId,
    ));
  }

  if (art.status !== "approved") {
    issues.push(diagnostic(
      "missing_required_asset",
      scope,
      `commissioning required: "${art.assetPath}" (${art.targetAspectRatio}, ${art.recommendedDimensions}) — ${art.brief}`,
      regionId,
      scenarioId,
      choiceId,
    ));
  } else {
    if (!art.localAssetId) {
      issues.push(diagnostic(
        "missing_asset_definition",
        scope,
        `approved raster "${art.assetId}" has no local asset manifest identity`,
        regionId,
        scenarioId,
        choiceId,
      ));
    } else {
      if (UNWRITTEN_MAP_SHARED_FRAME_ASSET_IDS.includes(art.localAssetId)) {
        issues.push(diagnostic(
          "invalid_asset_provider",
          scope,
          `shared frame "${art.localAssetId}" cannot satisfy the unique focal-art slot "${art.assetId}"`,
          regionId,
          scenarioId,
          choiceId,
        ));
      }
      if (unwrittenMapLocalAssetPath(art.localAssetId) !== art.assetPath) {
        issues.push(diagnostic(
          "missing_asset_definition",
          scope,
          `approved raster "${art.assetId}" path does not match local manifest entry "${art.localAssetId}"`,
          regionId,
          scenarioId,
          choiceId,
        ));
      }
    }
    if (!assetExists(art.assetPath)) {
      issues.push(diagnostic(
        "missing_asset_file",
        scope,
        `approved local raster "${art.assetPath}" referenced by "${art.id}" does not exist on disk`,
        regionId,
        scenarioId,
        choiceId,
      ));
    } else if (!assetIsRaster(art.assetPath)) {
      issues.push(diagnostic(
        "invalid_asset_provider",
        scope,
        `approved local asset "${art.assetPath}" does not contain its declared raster file format`,
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
  assetIsRaster: (relPath: string) => boolean,
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

  validateArtDefinition(encounter.focalArt, regionId, "encounter", scenarioId, null, seenArtIds, assetExists, assetIsRaster, issues);

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

    validateArtDefinition(choice.focalArt, regionId, "choice", scenarioId, choice.choiceId, seenArtIds, assetExists, assetIsRaster, issues);
    validateArtDefinition(choice.result.focalArt, regionId, "result", scenarioId, choice.choiceId, seenArtIds, assetExists, assetIsRaster, issues);
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
  const assetIsRaster = options.assetIsRaster
    || (options.assetExists ? () => true : defaultAssetIsRaster(repoRoot));
  const issues: UnwrittenMapPresentationDiagnostic[] = [];
  validateEncounter(encounter, new Set(), assetExists, assetIsRaster, issues);
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
  const assetIsRaster = options.assetIsRaster
    || (options.assetExists ? () => true : defaultAssetIsRaster(repoRoot));
  const issues: UnwrittenMapPresentationDiagnostic[] = [];

  validateCoverage(issues);

  const metadata = buildUnwrittenMapPresentationMetadata();
  const seenArtIds = new Set<string>();

  for (const encounter of metadata) {
    validateEncounter(encounter, seenArtIds, assetExists, assetIsRaster, issues);
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

export type UnwrittenMapArtInventorySummary = {
  required: number;
  approved: number;
  missing: number;
  encounters: { required: number; approved: number; missing: number };
  choices: { required: number; approved: number; missing: number };
  results: { required: number; approved: number; missing: number };
};

export function buildUnwrittenMapArtInventorySummary(
  options: UnwrittenMapPresentationValidationOptions = {},
): UnwrittenMapArtInventorySummary {
  const metadata = buildUnwrittenMapPresentationMetadata();
  const diagnostics = validateUnwrittenMapPresentation(options);
  const bySlot = {
    encounter: metadata.map((encounter) => ({
      art: encounter.focalArt,
      scenarioId: encounter.scenarioId,
      choiceId: null,
    })),
    choice: metadata.flatMap((encounter) => encounter.choices.map((choice) => ({
      art: choice.focalArt,
      scenarioId: encounter.scenarioId,
      choiceId: choice.choiceId,
    }))),
    result: metadata.flatMap((encounter) => encounter.choices.map((choice) => ({
      art: choice.result.focalArt,
      scenarioId: encounter.scenarioId,
      choiceId: choice.choiceId,
    }))),
  };
  const summarize = (
    scope: "encounter" | "choice" | "result",
    items: readonly {
      art: UnwrittenMapArtDefinition;
      scenarioId: string;
      choiceId: string | null;
    }[],
  ) => {
    const approved = items.filter((item) => (
      item.art.status === "approved"
      && !diagnostics.some((issue) => (
        issue.scope === scope
        && issue.scenarioId === item.scenarioId
        && issue.choiceId === item.choiceId
      ))
    )).length;
    return { required: items.length, approved, missing: items.length - approved };
  };
  const encounters = summarize("encounter", bySlot.encounter);
  const choices = summarize("choice", bySlot.choice);
  const results = summarize("result", bySlot.result);
  return {
    required: encounters.required + choices.required + results.required,
    approved: encounters.approved + choices.approved + results.approved,
    missing: encounters.missing + choices.missing + results.missing,
    encounters,
    choices,
    results,
  };
}

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
  const inventory = buildUnwrittenMapArtInventorySummary(options);
  const lines: string[] = [];

  lines.push("The Unwritten Map — presentation metadata coverage");
  lines.push(`Raster inventory: ${inventory.approved}/${inventory.required} approved; ${inventory.missing} commissioning assets missing.`);
  lines.push(diagnostics.length === 0
    ? "Production status: READY (0 diagnostics)"
    : `Production status: BLOCKED (${diagnostics.length} diagnostic${diagnostics.length === 1 ? "" : "s"})`);
  lines.push("");

  for (const regionId of UNWRITTEN_MAP_REGION_IDS) {
    const regionScenarios = metadata.filter((encounter) => encounter.regionId === regionId);
    if (regionScenarios.length === 0) continue;
    lines.push(`Region: ${regionId} (${regionScenarios.length} scenario${regionScenarios.length === 1 ? "" : "s"})`);

    for (const encounter of regionScenarios) {
      const scenarioDiagnostics = diagnostics.filter((issue) => issue.scenarioId === encounter.scenarioId);
      const encounterDiagnostics = scenarioDiagnostics.filter((issue) => issue.scope === "encounter" || issue.scope === "registry");
      lines.push(`  Scenario: ${encounter.scenarioId} [${encounterDiagnostics.length === 0 ? "approved" : "MISSING"}] art=${encounter.focalArt.assetPath} actor=${encounter.actorRole}`);

      for (const choice of encounter.choices) {
        const choiceIssues = scenarioDiagnostics.filter((issue) => issue.scope === "choice" && issue.choiceId === choice.choiceId);
        const resultIssues = scenarioDiagnostics.filter((issue) => issue.scope === "result" && issue.choiceId === choice.choiceId);
        lines.push(`    Choice: ${choice.choiceId} [${choiceIssues.length === 0 ? "approved" : "MISSING"}] art=${choice.focalArt.assetPath}`);
        lines.push(`      Result: [${resultIssues.length === 0 ? "approved" : "MISSING"}] art=${choice.result.focalArt.assetPath}`);
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
