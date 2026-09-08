// Domain presentation metadata contract for The Unwritten Map.
//
// This module derives a bounded, typed presentation layer over the existing
// gameplay content in ./unwrittenMap (scenarios and choices). It never
// changes gameplay data: it reads UNWRITTEN_MAP_SCENARIOS to build encounter/
// choice/result focal art identities, actor roles, moods, and region-aware
// motif composition, while leaving choice ids/order, evidence, and save
// contracts completely untouched.
//
// Pure data + pure functions only (no fs/network); safe to import anywhere.

import { UNWRITTEN_MAP_SCENARIOS, type MapChoice, type MapScenario } from "./unwrittenMap";
import {
  unwrittenMapPaletteId,
  type UnwrittenMapPaletteId,
  type UnwrittenMapRegionId,
} from "./unwrittenMapRegions";
import {
  FROG_PARLIAMENT_CHOICE_ASSET_IDS,
  FROG_PARLIAMENT_RESULT_ASSET_IDS,
  UNWRITTEN_MAP_ENCOUNTER_ASSET_IDS,
  unwrittenMapLocalAssetPath,
  type UnwrittenMapLocalAssetId,
} from "./unwrittenMapArtAssets";

// ---------------------------------------------------------------------------
// Bounded ID types
// ---------------------------------------------------------------------------

/**
 * The 12 scenario ids, hand-declared (not derived from the mutable-typed
 * gameplay array) so they form a literal-typed bounded union. Kept in the
 * same order as UNWRITTEN_MAP_SCENARIOS; a regression test asserts this
 * list and its ordering stay identical to the live gameplay data so any
 * drift is caught immediately as an actionable failure.
 */
export const UNWRITTEN_MAP_SCENARIO_IDS = [
  "lantern-fair",
  "whisper-orchard",
  "clockwork-bridge",
  "cloud-shepherd",
  "mirror-marsh",
  "frog-parliament",
  "rain-camp",
  "paper-dragon",
  "ember-library",
  "giant-garden",
  "old-lighthouse",
  "star-ferry",
] as const;

export type UnwrittenMapScenarioId = typeof UNWRITTEN_MAP_SCENARIO_IDS[number];

/** A scenario's specific place is also its landmark identity. */
export type UnwrittenMapLandmarkId = UnwrittenMapScenarioId;

/** Bounded per-scenario choice-id tuples, in exact gameplay order. */
export const UNWRITTEN_MAP_SCENARIO_CHOICE_IDS = {
  "lantern-fair": ["take-stage", "balcony-view", "hidden-melody", "help-lanterns"],
  "whisper-orchard": ["call-light", "trail-light", "decode-trees", "taste-fruit"],
  "clockwork-bridge": ["gear-puzzle", "rope-crossing", "mediate-gears", "paint-blueprint"],
  "cloud-shepherd": ["race-cloud", "cloud-joke", "weather-song", "map-air-current"],
  "mirror-marsh": ["step-reflection", "sketch-stars", "wave-back", "reed-raft"],
  "frog-parliament": ["grand-speech", "moon-experiment", "hear-frogs", "night-pageant"],
  "rain-camp": ["crowded-table", "paint-storm", "sort-supplies", "rain-walk"],
  "paper-dragon": ["fly-with-dragon", "dragon-riddle", "repair-tail", "festival-chase"],
  "ember-library": ["forbidden-volume", "catalog-flames", "listen-book", "fold-fire-bird"],
  "giant-garden": ["climb-fast", "botany-notes", "vine-picnic", "cloud-shapes"],
  "old-lighthouse": ["repair-lens", "keeper-journals", "storm-roof", "sea-listen"],
  "star-ferry": ["steer-stars", "ferryman-tale", "catch-star", "deck-dance"],
} as const satisfies Record<UnwrittenMapScenarioId, readonly [string, string, string, string]>;

type ScenarioChoiceIdMap = typeof UNWRITTEN_MAP_SCENARIO_CHOICE_IDS;

/** Every choice id across all 12 scenarios, also used as the action id. */
export type UnwrittenMapActionId = ScenarioChoiceIdMap[keyof ScenarioChoiceIdMap][number];

export type UnwrittenMapActorRole = "explorer" | "community" | "creature" | "environment";

export const UNWRITTEN_MAP_ACTOR_ROLES: readonly UnwrittenMapActorRole[] = [
  "explorer",
  "community",
  "creature",
  "environment",
];

export const UNWRITTEN_MAP_ENVIRONMENT_IDS = [
  "sunmeadow-pavilion-field",
  "sunmeadow-whisper-orchard",
  "ironwood-brass-bridge",
  "ironwood-highwind-farm",
  "mossmere-mirror-marsh",
  "mossmere-reed-parliament",
  "westreach-storm-camp",
  "westreach-kite-hill",
  "ashpeak-ember-library",
  "ashpeak-giants-garden",
  "tideglass-old-lighthouse",
  "tideglass-star-ferry",
] as const;

export type UnwrittenMapEnvironmentId = typeof UNWRITTEN_MAP_ENVIRONMENT_IDS[number];

export const UNWRITTEN_MAP_CHARACTER_IDS = [
  "frog-festival-musicians-and-audience",
  "orchard-light-wisp",
  "bridge-gearkin",
  "highwind-shepherd",
  "marsh-mirror-reflection",
  "reed-parliament-frogs",
  "rain-camp-travelers",
  "living-paper-dragon",
  "cold-ember-archive",
  "stairway-vine-spirit",
  "lighthouse-keeper",
  "star-ferryman",
] as const;

export type UnwrittenMapCharacterId = typeof UNWRITTEN_MAP_CHARACTER_IDS[number];

export const UNWRITTEN_MAP_MOOD_IDS = [
  "playful",
  "mysterious",
  "cozy",
  "adventurous",
  "wondrous",
  "tender",
  "urgent",
  "whimsical",
  "contemplative",
  "comic",
  "celebratory",
] as const;

export type UnwrittenMapMoodId = typeof UNWRITTEN_MAP_MOOD_IDS[number];

export type UnwrittenMapArtSlot = "encounter" | "choice" | "result";
export type UnwrittenMapAssetStatus = "approved" | "missing";
export type UnwrittenMapTargetAspectRatio = "3:2" | "4:3";
export type UnwrittenMapFocalAssetId =
  | `encounter:${UnwrittenMapScenarioId}`
  | `choice:${UnwrittenMapScenarioId}:${UnwrittenMapActionId}`
  | `result:${UnwrittenMapScenarioId}:${UnwrittenMapActionId}`;

export type UnwrittenMapRasterArt = {
  kind: "local_raster";
  id: string;
  assetId: UnwrittenMapFocalAssetId;
  localAssetId: UnwrittenMapLocalAssetId | null;
  assetPath: string;
  status: UnwrittenMapAssetStatus;
  slot: UnwrittenMapArtSlot;
  paletteId: UnwrittenMapPaletteId;
  brief: string;
  depictsActorRoles: readonly UnwrittenMapActorRole[];
  targetAspectRatio: UnwrittenMapTargetAspectRatio;
  recommendedDimensions: `${number}x${number}`;
};

export type UnwrittenMapArtDefinition = UnwrittenMapRasterArt;

export type UnwrittenMapChoicePresentation = {
  scenarioId: UnwrittenMapScenarioId;
  choiceId: UnwrittenMapActionId;
  actionId: UnwrittenMapActionId;
  actorRole: "explorer";
  moodId: UnwrittenMapMoodId;
  focalArt: UnwrittenMapArtDefinition;
  result: {
    actorRole: "explorer";
    moodId: UnwrittenMapMoodId;
    focalArt: UnwrittenMapArtDefinition;
  };
};

export type UnwrittenMapEncounterPresentation = {
  scenarioId: UnwrittenMapScenarioId;
  regionId: UnwrittenMapRegionId;
  landmarkId: UnwrittenMapLandmarkId;
  environmentId: UnwrittenMapEnvironmentId;
  characterId: UnwrittenMapCharacterId;
  /** The featured non-player entity for this encounter; never "explorer". */
  actorRole: Exclude<UnwrittenMapActorRole, "explorer">;
  moodId: UnwrittenMapMoodId;
  focalArt: UnwrittenMapArtDefinition;
  choices: readonly UnwrittenMapChoicePresentation[];
};

// ---------------------------------------------------------------------------
// Supplemental per-scenario registry (fields not present in gameplay data)
// ---------------------------------------------------------------------------

type SceneRegistryEntry = {
  scenarioId: UnwrittenMapScenarioId;
  /** Declared independently of gameplay data so drift can be detected. */
  regionId: UnwrittenMapRegionId;
  environmentId: UnwrittenMapEnvironmentId;
  characterId: UnwrittenMapCharacterId;
  actorRole: Exclude<UnwrittenMapActorRole, "explorer">;
};

const SCENE_REGISTRY: readonly SceneRegistryEntry[] = [
  { scenarioId: "lantern-fair", regionId: "sunmeadow", environmentId: "sunmeadow-pavilion-field", characterId: "frog-festival-musicians-and-audience", actorRole: "community" },
  { scenarioId: "whisper-orchard", regionId: "sunmeadow", environmentId: "sunmeadow-whisper-orchard", characterId: "orchard-light-wisp", actorRole: "creature" },
  { scenarioId: "clockwork-bridge", regionId: "ironwood", environmentId: "ironwood-brass-bridge", characterId: "bridge-gearkin", actorRole: "creature" },
  { scenarioId: "cloud-shepherd", regionId: "ironwood", environmentId: "ironwood-highwind-farm", characterId: "highwind-shepherd", actorRole: "community" },
  { scenarioId: "mirror-marsh", regionId: "mossmere", environmentId: "mossmere-mirror-marsh", characterId: "marsh-mirror-reflection", actorRole: "environment" },
  { scenarioId: "frog-parliament", regionId: "mossmere", environmentId: "mossmere-reed-parliament", characterId: "reed-parliament-frogs", actorRole: "creature" },
  { scenarioId: "rain-camp", regionId: "westreach", environmentId: "westreach-storm-camp", characterId: "rain-camp-travelers", actorRole: "community" },
  { scenarioId: "paper-dragon", regionId: "westreach", environmentId: "westreach-kite-hill", characterId: "living-paper-dragon", actorRole: "creature" },
  { scenarioId: "ember-library", regionId: "ashpeak", environmentId: "ashpeak-ember-library", characterId: "cold-ember-archive", actorRole: "environment" },
  { scenarioId: "giant-garden", regionId: "ashpeak", environmentId: "ashpeak-giants-garden", characterId: "stairway-vine-spirit", actorRole: "environment" },
  { scenarioId: "old-lighthouse", regionId: "tideglass", environmentId: "tideglass-old-lighthouse", characterId: "lighthouse-keeper", actorRole: "community" },
  { scenarioId: "star-ferry", regionId: "tideglass", environmentId: "tideglass-star-ferry", characterId: "star-ferryman", actorRole: "community" },
];

const SCENE_REGISTRY_BY_SCENARIO_ID: ReadonlyMap<string, SceneRegistryEntry> = new Map(
  SCENE_REGISTRY.map((entry) => [entry.scenarioId, entry]),
);

export function unwrittenMapSceneRegistryEntry(scenarioId: string): SceneRegistryEntry | null {
  return SCENE_REGISTRY_BY_SCENARIO_ID.get(scenarioId) || null;
}

export function unwrittenMapSceneRegistry(): readonly SceneRegistryEntry[] {
  return SCENE_REGISTRY;
}

// ---------------------------------------------------------------------------
// Deterministic mood derivation (bounded, tag-driven, always valid)
// ---------------------------------------------------------------------------

const MOOD_KEYWORD_RULES: readonly { keywords: readonly string[]; mood: UnwrittenMapMoodId }[] = [
  { keywords: ["absurd", "comic"], mood: "comic" },
  { keywords: ["kinetic", "celebratory", "lively", "spectacle"], mood: "celebratory" },
  { keywords: ["mysterious", "surreal", "cosmic", "dark-wonder"], mood: "mysterious" },
  { keywords: ["cozy", "warm", "gentle", "community", "ensemble", "friendly"], mood: "cozy" },
  { keywords: ["adventure", "bold", "kinetic", "exhilarating"], mood: "adventurous" },
  { keywords: ["urgent", "dramatic"], mood: "urgent" },
  { keywords: ["magical", "fantastical", "whimsical", "surprising", "riddle"], mood: "whimsical" },
  { keywords: ["reflective", "patient", "quiet", "contemplative", "intimate", "poignant"], mood: "contemplative" },
  { keywords: ["tender", "characterful", "care"], mood: "tender" },
  { keywords: ["craft", "science-fantasy", "observant", "scholarly", "puzzle", "investigative", "curious", "mechanical", "purposeful"], mood: "wondrous" },
];

export function unwrittenMapDeriveMoodId(tags: readonly string[]): UnwrittenMapMoodId {
  for (const rule of MOOD_KEYWORD_RULES) {
    if (tags.some((tag) => rule.keywords.includes(tag))) return rule.mood;
  }
  return "playful";
}

// ---------------------------------------------------------------------------
// Raster commissioning helpers
// ---------------------------------------------------------------------------

const OTHER_SKY_BRIEFS = {
  encounter: "Eerie moonlit marsh; the water reflects an impossible second sky with unfamiliar stars, and something in the reflection waves upward at the explorer.",
  "sketch-stars": "Explorer kneeling beside the marsh, drawing reflected constellations in a field notebook.",
  "wave-back": "Explorer at the water's edge, waving toward the mysterious reflected figure.",
  "reed-raft": "Explorer tying marsh reeds into a small raft beside the reflective water.",
  "step-reflection": "Explorer cautiously placing a boot onto the star-filled reflected surface as if it were solid.",
} as const;

const LANTERN_FAIR_ENCOUNTER_BRIEF = "A rain-soaked striped pavilion glows with warm hanging lanterns while frog musicians and their audience gather; distant tents and town sit beyond, and the explorer directs and participates in the final song.";

function expectedRasterPath(
  regionId: UnwrittenMapRegionId,
  scenarioId: UnwrittenMapScenarioId,
  slot: UnwrittenMapArtSlot,
  choiceId?: string,
): string {
  const suffix = slot === "encounter" ? "encounter" : `${slot}-${choiceId}`;
  return `assets/games/unwritten-map/illustrations/${regionId}/${scenarioId}/${scenarioId}-${suffix}.webp`;
}

function rasterArt(args: {
  id: string,
  assetId: UnwrittenMapFocalAssetId,
  localAssetId?: UnwrittenMapLocalAssetId,
  assetPath: string,
  status: UnwrittenMapAssetStatus,
  slot: UnwrittenMapArtSlot,
  regionId: UnwrittenMapRegionId,
  paletteSlot: "primary" | "accent" | "fallback",
  brief: string,
  depictsActorRoles: readonly UnwrittenMapActorRole[],
}): UnwrittenMapRasterArt {
  return {
    kind: "local_raster",
    id: args.id,
    assetId: args.assetId,
    localAssetId: args.localAssetId || null,
    assetPath: args.assetPath,
    status: args.status,
    slot: args.slot,
    paletteId: unwrittenMapPaletteId(args.regionId, args.paletteSlot),
    brief: args.brief,
    depictsActorRoles: args.depictsActorRoles,
    targetAspectRatio: args.slot === "choice" ? "4:3" : "3:2",
    recommendedDimensions: args.slot === "choice" ? "800x600" : "1800x1200",
  };
}

// ---------------------------------------------------------------------------
// Metadata builder
// ---------------------------------------------------------------------------

function buildChoicePresentation(
  scenario: MapScenario,
  choice: MapChoice,
  choiceIndex: number,
): UnwrittenMapChoicePresentation {
  const scenarioId = scenario.id as UnwrittenMapScenarioId;
  const regionId = scenario.regionId as UnwrittenMapRegionId;
  const moodId = unwrittenMapDeriveMoodId(choice.tags);
  const paletteSlot = choiceIndex % 2 === 0 ? "primary" : "accent";

  const choiceArtId = `art:choice:${choice.id}`;
  const resultArtId = `art:result:${choice.id}`;

  const frogChoiceAssetId = FROG_PARLIAMENT_CHOICE_ASSET_IDS[choice.id];
  const frogResultAssetId = FROG_PARLIAMENT_RESULT_ASSET_IDS[choice.id];
  const choiceBrief = scenarioId === "mirror-marsh"
    ? OTHER_SKY_BRIEFS[choice.id as keyof typeof OTHER_SKY_BRIEFS]
    : `The explorer performs "${choice.label}" at ${scenario.location}: ${choice.description}`;
  const resultBrief = `The explorer completes "${choice.label}" at ${scenario.location}. Outcome: ${choice.result}`;
  const choiceAssetId = `choice:${scenarioId}:${choice.id}` as UnwrittenMapFocalAssetId;
  const resultAssetId = `result:${scenarioId}:${choice.id}` as UnwrittenMapFocalAssetId;

  const focalArt = rasterArt({
    id: choiceArtId,
    assetId: choiceAssetId,
    localAssetId: frogChoiceAssetId,
    assetPath: frogChoiceAssetId
      ? unwrittenMapLocalAssetPath(frogChoiceAssetId)
      : expectedRasterPath(regionId, scenarioId, "choice", choice.id),
    status: frogChoiceAssetId ? "approved" : "missing",
    slot: "choice",
    regionId,
    paletteSlot,
    brief: choiceBrief,
    depictsActorRoles: ["explorer"],
  });

  const resultFocalArt = rasterArt({
    id: resultArtId,
    assetId: resultAssetId,
    localAssetId: frogResultAssetId,
    assetPath: frogResultAssetId
      ? unwrittenMapLocalAssetPath(frogResultAssetId)
      : expectedRasterPath(regionId, scenarioId, "result", choice.id),
    status: frogResultAssetId ? "approved" : "missing",
    slot: "result",
    regionId,
    paletteSlot: "fallback",
    brief: resultBrief,
    depictsActorRoles: ["explorer"],
  });

  return {
    scenarioId,
    choiceId: choice.id as UnwrittenMapActionId,
    actionId: choice.id as UnwrittenMapActionId,
    actorRole: "explorer",
    moodId,
    focalArt,
    result: {
      actorRole: "explorer",
      moodId,
      focalArt: resultFocalArt,
    },
  };
}

function buildEncounterPresentation(scenario: MapScenario): UnwrittenMapEncounterPresentation | null {
  const scenarioId = scenario.id as UnwrittenMapScenarioId;
  const regionId = scenario.regionId as UnwrittenMapRegionId;
  const sceneEntry = unwrittenMapSceneRegistryEntry(scenarioId);
  // A missing scene registry entry is a coverage gap the validator reports
  // as a diagnostic; the builder itself must never throw so validation can
  // always run and produce actionable output instead of crashing.
  if (!sceneEntry) return null;

  const encounterArtId = `art:encounter:${scenarioId}`;
  const encounterTags = scenario.choices.flatMap((choice) => choice.tags);
  const approvedEncounterAssetId = UNWRITTEN_MAP_ENCOUNTER_ASSET_IDS[scenarioId] || null;
  const focalArt = rasterArt({
    id: encounterArtId,
    assetId: `encounter:${scenarioId}`,
    localAssetId: approvedEncounterAssetId || undefined,
    assetPath: approvedEncounterAssetId
      ? unwrittenMapLocalAssetPath(approvedEncounterAssetId)
      : expectedRasterPath(regionId, scenarioId, "encounter"),
    status: approvedEncounterAssetId ? "approved" : "missing",
    slot: "encounter",
    regionId,
    paletteSlot: "primary",
    brief: scenarioId === "mirror-marsh"
      ? OTHER_SKY_BRIEFS.encounter
      : scenarioId === "lantern-fair"
        ? LANTERN_FAIR_ENCOUNTER_BRIEF
        : `${scenario.prompt} Establish ${scenario.location}, its ${sceneEntry.environmentId} environment, and ${sceneEntry.characterId}.`,
    depictsActorRoles: scenarioId === "lantern-fair"
      ? ["explorer", "community", "creature"]
      : [sceneEntry.actorRole],
  });

  return {
    scenarioId,
    regionId: sceneEntry.regionId,
    landmarkId: scenarioId,
    environmentId: sceneEntry.environmentId,
    characterId: sceneEntry.characterId,
    actorRole: sceneEntry.actorRole,
    moodId: unwrittenMapDeriveMoodId(encounterTags),
    focalArt,
    choices: scenario.choices.map((choice, index) => buildChoicePresentation(scenario, choice, index)),
  };
}

let cachedMetadata: readonly UnwrittenMapEncounterPresentation[] | null = null;

/**
 * Builds (and memoizes) the full domain presentation metadata contract: one
 * entry per gameplay scenario, each carrying its bounded region/environment/
 * character/actor/mood/landmark metadata plus unique focal art identities
 * for the encounter and every choice/result, in exact gameplay order.
 */
export function buildUnwrittenMapPresentationMetadata(): readonly UnwrittenMapEncounterPresentation[] {
  if (!cachedMetadata) {
    cachedMetadata = UNWRITTEN_MAP_SCENARIOS
      .map((scenario) => buildEncounterPresentation(scenario))
      .filter((entry): entry is UnwrittenMapEncounterPresentation => entry !== null);
  }
  return cachedMetadata;
}
