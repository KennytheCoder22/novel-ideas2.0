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
  UNWRITTEN_MAP_REGION_REGISTRY,
  unwrittenMapPaletteId,
  type UnwrittenMapPaletteId,
  type UnwrittenMapRegionId,
} from "./unwrittenMapRegions";
import {
  FROG_PARLIAMENT_CHOICE_ASSET_IDS,
  FROG_PARLIAMENT_ENCOUNTER_ASSET_ID,
  FROG_PARLIAMENT_RESULT_ASSET_IDS,
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
  "festival-musicians",
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

export type UnwrittenMapArtKind = "local_asset" | "vector_composition";

export type UnwrittenMapLocalAssetArt = {
  kind: "local_asset";
  id: string;
  assetId: UnwrittenMapLocalAssetId;
  paletteId: UnwrittenMapPaletteId;
};

export type UnwrittenMapVectorCompositionArt = {
  kind: "vector_composition";
  id: string;
  paletteId: UnwrittenMapPaletteId;
  /** Region-appropriate motif tokens; always non-empty and region-valid. */
  motifTokens: readonly string[];
  /** Bounded abstract composition primitives used to render the vector/CSS art. */
  shapeTokens: readonly string[];
};

export type UnwrittenMapArtDefinition = UnwrittenMapLocalAssetArt | UnwrittenMapVectorCompositionArt;

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
  { scenarioId: "lantern-fair", regionId: "sunmeadow", environmentId: "sunmeadow-pavilion-field", characterId: "festival-musicians", actorRole: "community" },
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
// Deterministic motif/shape composition helpers
// ---------------------------------------------------------------------------

const SHAPE_TOKENS = [
  "arc",
  "band",
  "dot-cluster",
  "frame",
  "silhouette",
  "glow",
  "ripple",
  "lattice",
] as const;

function stableStringHash(seed: string): number {
  let hash = 5381;
  for (let index = 0; index < seed.length; index += 1) {
    hash = ((hash << 5) + hash + seed.charCodeAt(index)) | 0;
  }
  return Math.abs(hash);
}

function shapeTokensFor(seed: string): readonly string[] {
  const first = SHAPE_TOKENS[stableStringHash(seed) % SHAPE_TOKENS.length];
  const second = SHAPE_TOKENS[stableStringHash(`${seed}:2`) % SHAPE_TOKENS.length];
  return Array.from(new Set([first, second]));
}

function motifTokensFor(regionId: UnwrittenMapRegionId, seed: string): readonly string[] {
  const region = UNWRITTEN_MAP_REGION_REGISTRY[regionId];
  // Mossmere's canonical vocabulary IS the required motif set (reeds, frogs,
  // lily pads, marsh water, mist, wetland flora); every Mossmere art
  // definition includes the full set so the requirement holds everywhere,
  // not just at the region-vocabulary level.
  if (regionId === "mossmere") return region.canonicalMotifTokens;
  const tokens = region.canonicalMotifTokens;
  const first = tokens[stableStringHash(seed) % tokens.length];
  const second = tokens[stableStringHash(`${seed}:2`) % tokens.length];
  return Array.from(new Set([first, second, region.fallbackMotifToken]));
}

function vectorArt(
  id: string,
  regionId: UnwrittenMapRegionId,
  slot: "primary" | "accent" | "fallback",
  seed: string,
): UnwrittenMapVectorCompositionArt {
  return {
    kind: "vector_composition",
    id,
    paletteId: unwrittenMapPaletteId(regionId, slot),
    motifTokens: motifTokensFor(regionId, seed),
    shapeTokens: shapeTokensFor(seed),
  };
}

function localAssetArt(
  id: string,
  assetId: UnwrittenMapLocalAssetId,
  regionId: UnwrittenMapRegionId,
  slot: "primary" | "accent" | "fallback",
): UnwrittenMapLocalAssetArt {
  return { kind: "local_asset", id, assetId, paletteId: unwrittenMapPaletteId(regionId, slot) };
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

  const focalArt = frogChoiceAssetId
    ? localAssetArt(choiceArtId, frogChoiceAssetId, regionId, paletteSlot)
    : vectorArt(choiceArtId, regionId, paletteSlot, `choice:${choice.id}`);

  const resultFocalArt = frogResultAssetId
    ? localAssetArt(resultArtId, frogResultAssetId, regionId, "fallback")
    : vectorArt(resultArtId, regionId, "fallback", `result:${choice.id}`);

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

  const focalArt = scenarioId === "frog-parliament"
    ? localAssetArt(encounterArtId, FROG_PARLIAMENT_ENCOUNTER_ASSET_ID, regionId, "primary")
    : vectorArt(encounterArtId, regionId, "primary", `encounter:${scenarioId}`);

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
