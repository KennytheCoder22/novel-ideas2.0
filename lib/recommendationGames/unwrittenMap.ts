export const UNWRITTEN_MAP_SAVE_SCHEMA = "unwritten_map_save_v2" as const;
export const UNWRITTEN_MAP_V1_SAVE_SCHEMA = "unwritten_map_save_v1" as const;
export const UNWRITTEN_MAP_EVENT_SCHEMA = "unwritten_map_event_v2" as const;
export const UNWRITTEN_MAP_V1_EVENT_SCHEMA = "unwritten_map_choice_event_v1" as const;
export const UNWRITTEN_MAP_GAME_VERSION = "grand_journey_v2" as const;
export const UNWRITTEN_MAP_V1_GAME_VERSION = "first_journey_v1" as const;
export const UNWRITTEN_MAP_TAXONOMY_VERSION = "novelideas_taste_v1" as const;
export const UNWRITTEN_MAP_SAVE_KEY = "novelideas_unwritten_map_save_v2";
export const UNWRITTEN_MAP_V1_SAVE_KEY = "novelideas_unwritten_map_save_v1";
export const UNWRITTEN_MAP_EVENT_QUEUE_KEY = "novelideas_unwritten_map_event_queue_v2";
export const UNWRITTEN_MAP_V1_EVENT_QUEUE_KEY = "novelideas_unwritten_map_event_queue_v1";
export const UNWRITTEN_MAP_V1_MIGRATION_KEY = "novelideas_unwritten_map_v1_migration_owner";
export const UNWRITTEN_MAP_MAX_COMMITTED_EVENT_IDS = 2_048;
export const UNWRITTEN_MAP_MAX_PLAY_SESSIONS = 10_000;
export const UNWRITTEN_MAP_MAX_UNDONE_DECISIONS = 500;
export const UNWRITTEN_MAP_MAX_ENCOUNTER_ATTEMPTS = 1_000;
export const UNWRITTEN_MAP_MAX_STEPS_PER_SESSION = 1_000_000;

export const UNWRITTEN_MAP_TAXONOMY = [
  "intensity",
  "novelty",
  "social_energy",
  "structure",
  "imagination",
  "emotional_depth",
  "humor",
  "pace",
  "challenge",
  "visual_aesthetic",
] as const;

export type TasteAxis = typeof UNWRITTEN_MAP_TAXONOMY[number];
export type TasteVector = Partial<Record<TasteAxis, -2 | -1 | 1 | 2>>;
export type MapPosition = { x: number; y: number };
export type MapDirection = "up" | "down" | "left" | "right";
export type MapTile = "T" | "G" | "P" | "W" | "S" | "M";
export type MapFacing = MapDirection;
export type EncounterType = "mystery" | "community" | "expedition" | "craft" | "wonder";

export type MapChoice = {
  id: string;
  version: 1;
  label: string;
  description: string;
  result: string;
  tasteVector: TasteVector;
  tags: string[];
};

export type MapScenario = {
  id: string;
  version: 2;
  regionId: string;
  type: EncounterType;
  location: string;
  mapLabel: string;
  position: MapPosition;
  color: string;
  title: string;
  prompt: string;
  choices: MapChoice[];
};

export type OptionSnapshot = {
  id: string;
  version: 1;
  label: string;
  description: string;
  taxonomyVersion: typeof UNWRITTEN_MAP_TAXONOMY_VERSION;
  tasteVector: TasteVector;
  tags: string[];
};

export type UnwrittenMapOutcomeEvidence =
  | {
    kind: "durable_event";
    schemaVersion: typeof UNWRITTEN_MAP_EVENT_SCHEMA;
    eventId: string;
  }
  | {
    kind: "durable_event";
    schemaVersion: typeof UNWRITTEN_MAP_V1_EVENT_SCHEMA;
    eventId: string;
  }
  | {
    kind: "migrated_local_without_durable_event";
  };

export type UnwrittenMapDecision = {
  scenarioId: string;
  kind: "choice" | "skip";
  optionId: string | null;
  outcomeEvidence: UnwrittenMapOutcomeEvidence;
  presentationId: string;
  attempt: number;
  occurredAt: string;
};

export type UndoneMapDecision = UnwrittenMapDecision & {
  correctionEventId: string;
  undoneAt: string;
};

export type UnwrittenMapSaveV2 = {
  schemaVersion: typeof UNWRITTEN_MAP_SAVE_SCHEMA;
  revision: number;
  lastOperationId: string | null;
  anonymousPlayerId: string;
  libraryScopeId: string;
  position: MapPosition;
  facing: MapFacing;
  decisions: UnwrittenMapDecision[];
  undoneDecisions: UndoneMapDecision[];
  discoveredScenarioIds: string[];
  encounterAttempts: Record<string, number>;
  committedEventIds: string[];
  playSessionCount: number;
  lastSessionId: string | null;
  startedAt: string;
  updatedAt: string;
  completedAt: string | null;
};

export type UnwrittenMapSaveV1 = {
  schemaVersion: typeof UNWRITTEN_MAP_V1_SAVE_SCHEMA;
  anonymousPlayerId: string;
  position: MapPosition;
  decisions: { scenarioId: string; optionId: string }[];
  discoveredScenarioIds: string[];
  startedAt: string;
  updatedAt: string;
};

export type LatencyCategory = "instant" | "quick" | "considered" | "long" | "returned";
export type UnwrittenMapEventType =
  | "encounter_presented"
  | "choice_made"
  | "encounter_skipped"
  | "choice_undone"
  | "session_started"
  | "session_continued"
  | "session_exited"
  | "session_completed";
export type MapExplorationContext = {
  mapX: number;
  mapY: number;
  regionId: string;
  effectiveCompletedCount: number;
  discoveredCount: number;
  stepsThisSession: number;
  preferenceInference: "none_from_exploration";
};

type EventBase = {
  schemaVersion: typeof UNWRITTEN_MAP_EVENT_SCHEMA;
  eventId: string;
  eventType: UnwrittenMapEventType;
  gameId: "the_unwritten_map";
  gameVersion: typeof UNWRITTEN_MAP_GAME_VERSION;
  taxonomyVersion: typeof UNWRITTEN_MAP_TAXONOMY_VERSION;
  gameSessionId: string;
  anonymousPlayerId: string;
  libraryScopeId: string;
  occurredAt: string;
  explorationContext: MapExplorationContext;
};

export type EncounterPresentedEvent = EventBase & {
  eventType: "encounter_presented";
  scenarioId: string;
  scenarioVersion: 2;
  presentationId: string;
  attempt: number;
  presentedOptions: OptionSnapshot[];
};

export type ChoiceMadeEvent = EventBase & {
  eventType: "choice_made";
  scenarioId: string;
  scenarioVersion: 2;
  presentationId: string;
  attempt: number;
  presentedOptions: OptionSnapshot[];
  selectedSlot: number;
  chosenOption: OptionSnapshot;
  nonSelectedOptions: OptionSnapshot[];
  latencyCategory: LatencyCategory;
};

export type EncounterSkippedEvent = EventBase & {
  eventType: "encounter_skipped";
  scenarioId: string;
  scenarioVersion: 2;
  presentationId: string;
  attempt: number;
  presentedOptions: OptionSnapshot[];
  latencyCategory: LatencyCategory;
  preferenceEffect: "none";
  skipMeaning: "keep_exploring";
};

export type ChoiceUndoneEvent = EventBase & {
  eventType: "choice_undone";
  scenarioId: string;
  originalEvidence: UnwrittenMapOutcomeEvidence;
  originalOutcomeKind: "choice" | "skip";
  restoredEncounter: true;
};

export type SessionEvent = EventBase & {
  eventType: "session_started" | "session_continued" | "session_exited" | "session_completed";
  playSessionCount: number;
};

export type UnwrittenMapEventV2 =
  | EncounterPresentedEvent
  | ChoiceMadeEvent
  | EncounterSkippedEvent
  | ChoiceUndoneEvent
  | SessionEvent;

export type UnwrittenMapChoiceEventV1 = {
  schemaVersion: typeof UNWRITTEN_MAP_V1_EVENT_SCHEMA;
  eventId: string;
  gameId: "the_unwritten_map";
  gameVersion: typeof UNWRITTEN_MAP_V1_GAME_VERSION;
  gameSessionId: string;
  anonymousPlayerId: string;
  scenarioId: string;
  scenarioVersion: 1;
  occurredAt: string;
  presentedOptionIds: string[];
  selectedOptionId: string;
  rejectedOptionIds: string[];
  responseTimeMs: number;
  gameContext: {
    mapX: number;
    mapY: number;
    completedScenarioCount: number;
  };
};

export type UnwrittenMapEvent = UnwrittenMapChoiceEventV1 | UnwrittenMapEventV2;

const UNWRITTEN_MAP_V1_SCENARIO_CONTRACT = [
  {
    id: "lantern-fair", position: { x: 2, y: 1 },
    optionIds: ["story-contest", "balcony-watch", "follow-music", "quiet-lane"],
  },
  {
    id: "whisper-orchard", position: { x: 12, y: 1 },
    optionIds: ["call-out", "follow-silently", "study-echoes", "gather-fruit"],
  },
  {
    id: "old-lighthouse", position: { x: 12, y: 9 },
    optionIds: ["repair-lens", "read-journals", "climb-roof", "listen-to-sea"],
  },
  {
    id: "rain-camp", position: { x: 2, y: 9 },
    optionIds: ["share-table", "paint-storm", "organize-supplies", "walk-in-rain"],
  },
] as const;

const choice = (
  id: string,
  label: string,
  description: string,
  result: string,
  tasteVector: TasteVector,
  tags: string[],
): MapChoice => ({ id, version: 1, label, description, result, tasteVector, tags });

export const UNWRITTEN_MAP_SCENARIOS: MapScenario[] = [
  {
    id: "lantern-fair", version: 2, regionId: "sunmeadow", type: "community", location: "Lantern Fair",
    mapLabel: "FAIR", position: { x: 5, y: 4 }, color: "#dca84e", title: "Music Beyond the Rain",
    prompt: "Rain gathers everyone beneath a striped pavilion. The last song is about to begin.",
    choices: [
      choice("take-stage", "Take the little stage", "Add an outrageous verse of your own.", "Your verse earns a brass compass needle and delighted applause.", { social_energy: 2, humor: 1 }, ["performative", "playful"]),
      choice("balcony-view", "Watch from the balcony", "Find a quiet perch above the lanterns.", "From above, the lanterns arrange themselves into a new constellation.", { social_energy: -2, visual_aesthetic: 1 }, ["observant", "quiet"]),
      choice("hidden-melody", "Follow the hidden melody", "Slip behind the tents toward an unseen musician.", "The tune opens a painted door for one impossible minute.", { novelty: 2, imagination: 1 }, ["mysterious", "surreal"]),
      choice("help-lanterns", "Help mend the lanterns", "Join the careful work before the final song.", "The repaired lights float higher than any lantern should.", { structure: 2, emotional_depth: 1 }, ["craft", "warm"]),
    ],
  },
  {
    id: "whisper-orchard", version: 2, regionId: "sunmeadow", type: "mystery", location: "Whisper Orchard",
    mapLabel: "GLOW", position: { x: 11, y: 3 }, color: "#7fb460", title: "The Light Between Trees",
    prompt: "A pale light drifts among trees that repeat fragments of old conversations.",
    choices: [
      choice("call-light", "Call out to the light", "Ask plainly what it wants.", "It answers in your voice, then becomes a companionable lantern moth.", { social_energy: 1, pace: 1 }, ["direct", "companion"]),
      choice("trail-light", "Trail it silently", "Let the mystery unfold without interruption.", "It leads to a tree bearing moon-silver fruit.", { emotional_depth: 1, pace: -1 }, ["atmospheric", "patient"]),
      choice("decode-trees", "Decode the whispers", "Collect and order every repeated fragment.", "The fragments become directions left by a traveler a century ago.", { structure: 2, challenge: 1 }, ["puzzle", "investigative"]),
      choice("taste-fruit", "Taste a windfallen apple", "Trust the orchard's smallest invitation.", "The apple hums whenever you face north.", { novelty: 1, humor: 1 }, ["whimsical", "sensory"]),
    ],
  },
  {
    id: "clockwork-bridge", version: 2, regionId: "ironwood", type: "craft", location: "Clockwork Bridge",
    mapLabel: "GEAR", position: { x: 18, y: 4 }, color: "#bb7b50", title: "The Bridge That Forgot",
    prompt: "A brass bridge has stopped halfway across the gorge, while tiny gears argue beneath its deck.",
    choices: [
      choice("gear-puzzle", "Rebuild the gear train", "Study each tooth and restore the mechanism.", "The bridge remembers every crossing and clicks gratefully into place.", { challenge: 2, structure: 2 }, ["mechanical", "puzzle"]),
      choice("rope-crossing", "Rig a rope crossing", "Make a daring route over the open gorge.", "Your rope becomes a shining handrail when the bridge finally wakes.", { intensity: 2, pace: 1 }, ["adventure", "bold"]),
      choice("mediate-gears", "Settle the gears' quarrel", "Listen to each tiny voice and find a compromise.", "The gears agree to turn together, though one insists on singing.", { emotional_depth: 1, humor: 1 }, ["characterful", "gentle"]),
      choice("paint-blueprint", "Paint a better blueprint", "Imagine a bridge that moves like a living thing.", "The painted bridge climbs off the page and completes the span.", { imagination: 2, visual_aesthetic: 1 }, ["creative", "wonder"]),
    ],
  },
  {
    id: "cloud-shepherd", version: 2, regionId: "ironwood", type: "wonder", location: "Highwind Farm",
    mapLabel: "CLOD", position: { x: 24, y: 3 }, color: "#8ba8b1", title: "A Runaway Thundercloud",
    prompt: "A young shepherd asks for help returning one mischievous thundercloud to its flock.",
    choices: [
      choice("race-cloud", "Race it along the ridge", "Match its wild speed until it turns home.", "It laughs thunder and leaves a rainbow ribbon in your pack.", { pace: 2, intensity: 2 }, ["kinetic", "exhilarating"]),
      choice("cloud-joke", "Tell it a terrible joke", "Try to charm it down with cheerful nonsense.", "It rains from laughter and follows you back like a puppy.", { humor: 2, social_energy: 1 }, ["comic", "friendly"]),
      choice("weather-song", "Learn the shepherd's song", "Practice the old melody one patient phrase at a time.", "The whole flock settles into a soft silver harmony.", { structure: 1, emotional_depth: 1 }, ["musical", "tender"]),
      choice("map-air-current", "Map the invisible currents", "Find the hidden route the cloud already wants.", "Your ink swirls into a permanent map of the upper air.", { challenge: 1, novelty: 1 }, ["discovery", "thoughtful"]),
    ],
  },
  {
    id: "mirror-marsh", version: 2, regionId: "mossmere", type: "mystery", location: "Mirror Marsh",
    mapLabel: "MIRR", position: { x: 25, y: 9 }, color: "#628e87", title: "The Other Sky",
    prompt: "The marsh reflects unfamiliar stars. One reflection waves at you from below the water.",
    choices: [
      choice("step-reflection", "Step onto the reflection", "Treat the other sky like a road.", "For a breath, you walk among upside-down stars.", { imagination: 2, novelty: 2 }, ["surreal", "cosmic"]),
      choice("sketch-stars", "Sketch the strange stars", "Preserve every shape before the clouds move.", "Your sketch glows whenever an unseen path is near.", { visual_aesthetic: 2, structure: 1 }, ["artful", "observant"]),
      choice("wave-back", "Sit and wave back", "Share a quiet moment with whoever is there.", "The reflection smiles, and both skies feel less lonely.", { emotional_depth: 2, pace: -1 }, ["reflective", "gentle"]),
      choice("reed-raft", "Build a reed raft", "Explore the mirror from a practical little boat.", "The raft sails equally well across water and starlight.", { challenge: 1, structure: 1 }, ["craft", "exploration"]),
    ],
  },
  {
    id: "frog-parliament", version: 2, regionId: "mossmere", type: "community", location: "Reed Parliament",
    mapLabel: "FROG", position: { x: 20, y: 10 }, color: "#76a558", title: "The Very Serious Debate",
    prompt: "A parliament of frogs cannot agree whether the moon belongs in the sky or in the pond.",
    choices: [
      choice("grand-speech", "Deliver a grand speech", "Argue passionately for both moons at once.", "The frogs cheer and appoint you Minister of Excellent Confusion.", { social_energy: 2, humor: 2 }, ["absurd", "performative"]),
      choice("moon-experiment", "Design a moon experiment", "Test reflections, angles, and one polished spoon.", "Your evidence proves there are at least three moons on Tuesdays.", { challenge: 1, structure: 2 }, ["curious", "comic"]),
      choice("hear-frogs", "Hear every frog's story", "Find out why each moon matters to them.", "The debate becomes a chorus about homes near and far.", { emotional_depth: 2, pace: -1 }, ["empathetic", "ensemble"]),
      choice("night-pageant", "Stage a moon pageant", "Settle nothing, but make it beautiful.", "Lilies become stages and fireflies handle the lighting.", { visual_aesthetic: 2, imagination: 1 }, ["spectacle", "creative"]),
    ],
  },
  {
    id: "rain-camp", version: 2, regionId: "westreach", type: "community", location: "Rain Camp",
    mapLabel: "CAMP", position: { x: 4, y: 10 }, color: "#ad7ab2", title: "One Dry Place",
    prompt: "Travelers offer hot tea and four good ways to spend the stormy evening.",
    choices: [
      choice("crowded-table", "Join the crowded table", "Trade jokes, rumors, and food with new friends.", "By midnight, everyone has added a ridiculous landmark to your map.", { social_energy: 2, humor: 1 }, ["community", "lively"]),
      choice("paint-storm", "Paint the storm", "Catch its changing colors on borrowed paper.", "Your painted lightning flashes whenever weather approaches.", { visual_aesthetic: 2, intensity: 1 }, ["artful", "weather"]),
      choice("sort-supplies", "Organize tomorrow's supplies", "Make the shelter calm and ready for morning.", "The travelers sew a secret pocket into your map case.", { structure: 2, pace: -1 }, ["cozy", "practical"]),
      choice("rain-walk", "Walk beneath the open sky", "Follow the one trail the rain refuses to touch.", "The dry trail curls toward a valley missing from every chart.", { novelty: 2, social_energy: -1 }, ["solitary", "discovery"]),
    ],
  },
  {
    id: "paper-dragon", version: 2, regionId: "westreach", type: "craft", location: "Kite Hill",
    mapLabel: "KITE", position: { x: 8, y: 15 }, color: "#cb6651", title: "The Paper Dragon",
    prompt: "A festival kite has come alive and refuses to land before sunset.",
    choices: [
      choice("fly-with-dragon", "Take a second kite aloft", "Meet the dragon in its own windy world.", "Together you loop a message across the entire evening sky.", { intensity: 1, visual_aesthetic: 2 }, ["flight", "spectacle"]),
      choice("dragon-riddle", "Challenge it with a riddle", "Offer a puzzle worthy of a paper dragon.", "It lands to whisper the answer, then asks for another.", { challenge: 2, imagination: 1 }, ["riddle", "fantastical"]),
      choice("repair-tail", "Mend its torn tail", "Show it the loose ribbon and offer careful help.", "The dragon settles gently and keeps one patch as a badge.", { emotional_depth: 1, structure: 1 }, ["care", "craft"]),
      choice("festival-chase", "Lead a laughing chase", "Gather the children and follow wherever it dives.", "The whole hill becomes a joyful maze of string.", { pace: 2, social_energy: 2 }, ["playful", "kinetic"]),
    ],
  },
  {
    id: "ember-library", version: 2, regionId: "ashpeak", type: "mystery", location: "Ember Library",
    mapLabel: "BOOK", position: { x: 14, y: 16 }, color: "#bd6544", title: "Books That Burn Cold",
    prompt: "Blue flames curl around unread books without harming a single page.",
    choices: [
      choice("forbidden-volume", "Open the chained volume", "Begin with the book everyone avoided.", "Its pages contain a city that notices you reading.", { intensity: 2, novelty: 2 }, ["dark-wonder", "mysterious"]),
      choice("catalog-flames", "Catalog every flame", "Look for a patient pattern in color and shape.", "The catalogue reveals which stories dream of being found.", { structure: 2, challenge: 1 }, ["scholarly", "puzzle"]),
      choice("listen-book", "Listen beside one small book", "Wait for the quietest story to speak.", "It tells of a lost friendship and leaves its last page blank for you.", { emotional_depth: 2, pace: -1 }, ["poignant", "intimate"]),
      choice("fold-fire-bird", "Fold a bird from blue fire", "See what the impossible material can become.", "The bird nests in your compass and sings at crossroads.", { imagination: 2, humor: 1 }, ["magical", "whimsical"]),
    ],
  },
  {
    id: "giant-garden", version: 2, regionId: "ashpeak", type: "expedition", location: "Giant's Garden",
    mapLabel: "VINE", position: { x: 21, y: 16 }, color: "#779150", title: "The Stairway Vine",
    prompt: "A vine broad as a road climbs into clouds glowing peach and gold.",
    choices: [
      choice("climb-fast", "Climb before the light fades", "Trust your grip and race the sunset.", "You reach a cloud orchard at the exact moment its fruit turns gold.", { pace: 2, challenge: 2 }, ["adventure", "urgent"]),
      choice("botany-notes", "Study each impossible leaf", "Take careful notes on the living stair.", "The leaves rearrange your notes into a greeting.", { structure: 2, novelty: 1 }, ["science-fantasy", "observant"]),
      choice("vine-picnic", "Invite nearby travelers", "Turn the first broad leaf into a shared picnic.", "The vine grows benches and a table in response.", { social_energy: 2, emotional_depth: 1 }, ["community", "cozy"]),
      choice("cloud-shapes", "Watch clouds through the leaves", "Stay low and enjoy the changing framed sky.", "Each gap shows a different season passing overhead.", { visual_aesthetic: 2, pace: -1 }, ["atmospheric", "quiet"]),
    ],
  },
  {
    id: "old-lighthouse", version: 2, regionId: "tideglass", type: "expedition", location: "Old Lighthouse",
    mapLabel: "BEAM", position: { x: 26, y: 18 }, color: "#5f9fb0", title: "A Darkened Beacon",
    prompt: "The keeper needs help before nightfall, but the tower is full of secret doors.",
    choices: [
      choice("repair-lens", "Repair the great lens", "Get the beacon shining with careful hands.", "The beam reveals a road across the surface of the sea.", { structure: 2, challenge: 1 }, ["mechanical", "purposeful"]),
      choice("keeper-journals", "Search the keeper's journals", "Discover why the light went dark.", "A margin note describes an island visible only without a beacon.", { emotional_depth: 1, novelty: 2 }, ["lore", "mystery"]),
      choice("storm-roof", "Climb into the storm", "Inspect the weather from the highest rail.", "Lightning outlines the blank edge of the world.", { intensity: 2, pace: 1 }, ["dramatic", "adventure"]),
      choice("sea-listen", "Listen beside the sea", "Wait quietly before deciding what the tower needs.", "The waves tap a patient rhythm and the beacon relights itself.", { pace: -2, imagination: 1 }, ["contemplative", "magical"]),
    ],
  },
  {
    id: "star-ferry", version: 2, regionId: "tideglass", type: "wonder", location: "Star Ferry",
    mapLabel: "STAR", position: { x: 14, y: 19 }, color: "#7875b8", title: "The Last Ferry",
    prompt: "The ferryman offers one final crossing as falling stars collect on the black water.",
    choices: [
      choice("steer-stars", "Take the silver tiller", "Steer between bright falling stars.", "The wake writes your route in light behind the boat.", { challenge: 1, visual_aesthetic: 2 }, ["cosmic", "active"]),
      choice("ferryman-tale", "Ask for the ferryman's tale", "Let the long crossing hold a long story.", "He tells of every passenger except himself, until tonight.", { emotional_depth: 2, pace: -1 }, ["character", "reflective"]),
      choice("catch-star", "Catch a star in your hat", "Try the most unreasonable thing first.", "It squeaks, apologizes, and becomes a warm button.", { humor: 2, novelty: 2 }, ["whimsical", "surprising"]),
      choice("deck-dance", "Join the deck musicians", "Turn the crossing into a midnight dance.", "Even the constellations keep time above you.", { social_energy: 2, pace: 2 }, ["musical", "celebratory"]),
    ],
  },
];

export const UNWRITTEN_MAP_WIDTH = 29;
export const UNWRITTEN_MAP_HEIGHT = 21;
export const UNWRITTEN_MAP_START: MapPosition = { x: 14, y: 10 };

function buildWorld(): readonly string[] {
  const world: MapTile[][] = Array.from({ length: UNWRITTEN_MAP_HEIGHT }, (_, y) =>
    Array.from({ length: UNWRITTEN_MAP_WIDTH }, (_, x) =>
      x === 0 || y === 0 || x === UNWRITTEN_MAP_WIDTH - 1 || y === UNWRITTEN_MAP_HEIGHT - 1 ? "T" : "G"));
  for (let y = 1; y < UNWRITTEN_MAP_HEIGHT - 1; y += 1) {
    if (y !== 10 && y !== 17) world[y][16] = "W";
  }
  for (let x = 1; x < UNWRITTEN_MAP_WIDTH - 1; x += 1) world[10][x] = "P";
  for (let y = 2; y < UNWRITTEN_MAP_HEIGHT - 1; y += 1) world[y][14] = "P";
  for (let x = 3; x <= 26; x += 1) {
    world[4][x] = "P";
    world[16][x] = "P";
  }
  for (let y = 3; y <= 18; y += 1) {
    world[y][4] = "P";
    world[y][21] = "P";
    world[y][26] = "P";
  }
  for (let x = 4; x <= 14; x += 1) world[15][x] = "P";
  for (let x = 14; x <= 26; x += 1) world[18][x] = "P";
  for (let x = 17; x <= 27; x += 1) if (x !== 21 && x !== 26) world[7][x] = "S";
  for (let x = 1; x <= 12; x += 1) if (x % 3 === 0) world[7][x] = "T";
  for (let x = 17; x <= 25; x += 2) world[13][x] = "M";
  [[7, 2], [9, 6], [2, 13], [11, 12], [24, 14], [7, 18], [18, 19]].forEach(([x, y]) => {
    world[y][x] = "T";
  });
  for (const scenario of UNWRITTEN_MAP_SCENARIOS) world[scenario.position.y][scenario.position.x] = "P";
  world[UNWRITTEN_MAP_START.y][UNWRITTEN_MAP_START.x] = "P";
  return world.map((row) => row.join(""));
}

export const UNWRITTEN_MAP_TILES = buildWorld();

export function samePosition(left: MapPosition, right: MapPosition): boolean {
  return left.x === right.x && left.y === right.y;
}

export function tileAt(position: MapPosition): MapTile | null {
  const tile = UNWRITTEN_MAP_TILES[position.y]?.[position.x];
  return tile === "T" || tile === "G" || tile === "P" || tile === "W" || tile === "S" || tile === "M" ? tile : null;
}

export function isWalkable(position: MapPosition): boolean {
  if (!position || !Number.isInteger(position.x) || !Number.isInteger(position.y)) return false;
  const tile = tileAt(position);
  return tile === "G" || tile === "P" || tile === "S";
}

export function moveOnMap(position: MapPosition, direction: MapDirection): MapPosition {
  const delta = direction === "up" ? { x: 0, y: -1 }
    : direction === "down" ? { x: 0, y: 1 }
      : direction === "left" ? { x: -1, y: 0 } : { x: 1, y: 0 };
  const next = { x: position.x + delta.x, y: position.y + delta.y };
  return isWalkable(next) ? next : position;
}

export function scenarioAt(position: MapPosition): MapScenario | null {
  return UNWRITTEN_MAP_SCENARIOS.find((scenario) => samePosition(scenario.position, position)) || null;
}

export function regionAt(position: MapPosition): { id: string; name: string } {
  if (position.y >= 18 && position.x >= 13) return { id: "tideglass", name: "Tideglass Coast" };
  if (position.y >= 13) return position.x < 13 ? { id: "westreach", name: "Westreach Hills" } : { id: "ashpeak", name: "Ashpeak Rise" };
  if (position.y >= 8 && position.x < 13) return { id: "westreach", name: "Westreach Hills" };
  if (position.x >= 18 && position.y >= 7) return { id: "mossmere", name: "Mossmere Wetlands" };
  if (position.x >= 16) return { id: "ironwood", name: "Ironwood Heights" };
  return { id: "sunmeadow", name: "Sunmeadow Vale" };
}

export function cameraOrigin(position: MapPosition, columns: number, rows: number): MapPosition {
  const maxX = Math.max(0, UNWRITTEN_MAP_WIDTH - columns);
  const maxY = Math.max(0, UNWRITTEN_MAP_HEIGHT - rows);
  return {
    x: Math.max(0, Math.min(maxX, position.x - Math.floor(columns / 2))),
    y: Math.max(0, Math.min(maxY, position.y - Math.floor(rows / 2))),
  };
}

export function normalizeLibraryScope(value: string | undefined): string {
  const normalized = String(value || "default").trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64);
  return normalized || "default";
}

function hashText(input: string): string {
  let first = 2166136261;
  let second = 5381;
  for (let index = 0; index < input.length; index += 1) {
    const code = input.charCodeAt(index);
    first = Math.imul(first ^ code, 16777619);
    second = Math.imul(second, 33) ^ code;
  }
  return `${(first >>> 0).toString(16).padStart(8, "0")}${(second >>> 0).toString(16).padStart(8, "0")}`;
}

export function storageScopeKey(libraryId?: string, routePlayerId?: string): string {
  return `${normalizeLibraryScope(libraryId)}-${hashText(String(routePlayerId || "device"))}`;
}

export function scopedSaveKey(scopeKey: string): string {
  return `${UNWRITTEN_MAP_SAVE_KEY}:${scopeKey}`;
}

export function scopedQueueKey(scopeKey: string): string {
  return `${UNWRITTEN_MAP_EVENT_QUEUE_KEY}:${scopeKey}`;
}

export function createUnwrittenMapPlayerId(now = Date.now(), random = Math.random()): string {
  return `map-${now.toString(36)}-${Math.floor(random * 1_000_000_000).toString(36)}`;
}

export function createInitialUnwrittenMapSave(
  anonymousPlayerId: string,
  now = new Date().toISOString(),
  libraryScopeId = "default",
): UnwrittenMapSaveV2 {
  return {
    schemaVersion: UNWRITTEN_MAP_SAVE_SCHEMA,
    revision: 0,
    lastOperationId: null,
    anonymousPlayerId,
    libraryScopeId: normalizeLibraryScope(libraryScopeId),
    position: { ...UNWRITTEN_MAP_START },
    facing: "down",
    decisions: [],
    undoneDecisions: [],
    discoveredScenarioIds: [],
    encounterAttempts: {},
    committedEventIds: [],
    playSessionCount: 0,
    lastSessionId: null,
    startedAt: now,
    updatedAt: now,
    completedAt: null,
  };
}

function isIso(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function validPlayerId(value: unknown): value is string {
  return typeof value === "string" && /^map-[a-z0-9]{1,32}-[a-z0-9]{1,32}$/.test(value);
}

function validV2EventId(value: unknown): value is string {
  return typeof value === "string" && /^ume2-[a-f0-9]{16}$/.test(value);
}

function validPresentationId(value: unknown): value is string {
  return typeof value === "string" && /^ump-[a-f0-9]{16}$/.test(value);
}

function validOutcomeEvidence(value: unknown): value is UnwrittenMapOutcomeEvidence {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const evidence = value as unknown as Record<string, unknown>;
  if (evidence.kind === "migrated_local_without_durable_event") {
    return exactKeys(evidence, ["kind"]);
  }
  return evidence.kind === "durable_event"
    && exactKeys(evidence, ["kind", "schemaVersion", "eventId"])
    && (
      (evidence.schemaVersion === UNWRITTEN_MAP_EVENT_SCHEMA && validV2EventId(evidence.eventId))
      || (evidence.schemaVersion === UNWRITTEN_MAP_V1_EVENT_SCHEMA
        && typeof evidence.eventId === "string" && /^ume-[a-f0-9]{16}$/.test(evidence.eventId))
    );
}

function durableV2OutcomeEventId(decision: Pick<UnwrittenMapDecision, "outcomeEvidence">): string | null {
  return decision.outcomeEvidence.kind === "durable_event"
    && decision.outcomeEvidence.schemaVersion === UNWRITTEN_MAP_EVENT_SCHEMA
    ? decision.outcomeEvidence.eventId : null;
}

function validDecision(value: unknown): value is UnwrittenMapDecision {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as UnwrittenMapDecision;
  const scenario = UNWRITTEN_MAP_SCENARIOS.find((candidate) => candidate.id === item.scenarioId);
  if (!scenario) return false;
  return exactKeys(item as unknown as Record<string, unknown>, [
    "scenarioId", "kind", "optionId", "outcomeEvidence", "presentationId", "attempt", "occurredAt",
  ])
    && (item.kind === "skip" ? item.optionId === null
      : item.kind === "choice" && scenario.choices.some((candidate) => candidate.id === item.optionId))
    && validOutcomeEvidence(item.outcomeEvidence)
    && (item.kind === "choice"
      || (item.outcomeEvidence.kind === "durable_event"
        && item.outcomeEvidence.schemaVersion === UNWRITTEN_MAP_EVENT_SCHEMA))
    && validPresentationId(item.presentationId)
    && Number.isInteger(item.attempt) && item.attempt >= 1 && item.attempt <= UNWRITTEN_MAP_MAX_ENCOUNTER_ATTEMPTS
    && isIso(item.occurredAt);
}

function validUndoneDecision(value: unknown): value is UndoneMapDecision {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const { correctionEventId, undoneAt, ...decision } = value as UndoneMapDecision;
  return exactKeys(value as unknown as Record<string, unknown>, [
    "scenarioId", "kind", "optionId", "outcomeEvidence", "presentationId", "attempt", "occurredAt",
    "correctionEventId", "undoneAt",
  ])
    && validDecision(decision)
    && validV2EventId(correctionEventId)
    && isIso(undoneAt)
    && Date.parse(decision.occurredAt) <= Date.parse(undoneAt);
}

const LEGACY_CHOICE_IDS: Record<string, Record<string, string>> = {
  "lantern-fair": {
    "story-contest": "take-stage",
    "balcony-watch": "balcony-view",
    "follow-music": "hidden-melody",
    "quiet-lane": "help-lanterns",
  },
  "whisper-orchard": {
    "call-out": "call-light",
    "follow-silently": "trail-light",
    "study-echoes": "decode-trees",
    "gather-fruit": "taste-fruit",
  },
  "old-lighthouse": {
    "repair-lens": "repair-lens",
    "read-journals": "keeper-journals",
    "climb-roof": "storm-roof",
    "listen-to-sea": "sea-listen",
  },
  "rain-camp": {
    "share-table": "crowded-table",
    "paint-storm": "paint-storm",
    "organize-supplies": "sort-supplies",
    "walk-in-rain": "rain-walk",
  },
};

export function mapLegacyUnwrittenMapOptionId(scenarioId: string, optionId: string): string | null {
  return LEGACY_CHOICE_IDS[scenarioId]?.[optionId] || null;
}

export function migrateUnwrittenMapSaveV1(
  value: UnwrittenMapSaveV1,
  libraryScopeId = "default",
  legacyEvidence: readonly UnwrittenMapChoiceEventV1[] = [],
): UnwrittenMapSaveV2 {
  const initial = createInitialUnwrittenMapSave(
    validPlayerId(value.anonymousPlayerId) ? value.anonymousPlayerId : createUnwrittenMapPlayerId(),
    isIso(value.startedAt) ? value.startedAt : new Date().toISOString(),
    libraryScopeId,
  );
  const decisions = (Array.isArray(value.decisions) ? value.decisions.flatMap((legacy, index) => {
    if (!legacy || typeof legacy.scenarioId !== "string" || typeof legacy.optionId !== "string") return [];
    const scenario = UNWRITTEN_MAP_SCENARIOS.find((candidate) => candidate.id === legacy.scenarioId);
    const optionId = mapLegacyUnwrittenMapOptionId(legacy.scenarioId, legacy.optionId);
    if (!scenario?.choices.some((candidate) => candidate.id === optionId)) return [];
    const sourceEvent = [...legacyEvidence].reverse().find((event) =>
      isUnwrittenMapChoiceEventV1(event)
      && event.anonymousPlayerId === value.anonymousPlayerId
      && event.scenarioId === legacy.scenarioId
      && event.selectedOptionId === legacy.optionId);
    return [{
      scenarioId: legacy.scenarioId,
      kind: "choice" as const,
      optionId,
      outcomeEvidence: sourceEvent ? {
        kind: "durable_event" as const,
        schemaVersion: UNWRITTEN_MAP_V1_EVENT_SCHEMA,
        eventId: sourceEvent.eventId,
      } : {
        kind: "migrated_local_without_durable_event" as const,
      },
      presentationId: `ump-${hashText(`migrated-v1:${value.anonymousPlayerId}:${legacy.scenarioId}:${index + 1}`)}`,
      attempt: 1,
      occurredAt: sourceEvent?.occurredAt || (isIso(value.updatedAt) ? value.updatedAt : initial.startedAt),
    }];
  }) : []).filter((decision, index, all) =>
    all.findIndex((candidate) => candidate.scenarioId === decision.scenarioId) === index);
  return {
    ...initial,
    position: value.position && isWalkable(value.position) ? { ...value.position } : { ...UNWRITTEN_MAP_START },
    decisions,
    discoveredScenarioIds: [...new Set([
      ...(Array.isArray(value.discoveredScenarioIds)
        ? value.discoveredScenarioIds.filter((id): id is string => typeof id === "string"
          && UNWRITTEN_MAP_SCENARIOS.some((scenario) => scenario.id === id))
        : []),
      ...decisions.map((decision) => decision.scenarioId),
    ])],
    encounterAttempts: Object.fromEntries(decisions.map((decision) => [decision.scenarioId, 1])),
    committedEventIds: [],
    updatedAt: isIso(value.updatedAt) ? value.updatedAt : initial.updatedAt,
    completedAt: decisions.length === UNWRITTEN_MAP_SCENARIOS.length ? (isIso(value.updatedAt) ? value.updatedAt : initial.updatedAt) : null,
  };
}

function requiredCommittedEventIds(save: UnwrittenMapSaveV2): Set<string> {
  const required = new Set<string>();
  for (const decision of save.decisions) {
    const eventId = durableV2OutcomeEventId(decision);
    if (eventId) required.add(eventId);
  }
  for (const decision of save.undoneDecisions) {
    const eventId = durableV2OutcomeEventId(decision);
    if (eventId) required.add(eventId);
    required.add(decision.correctionEventId);
  }
  return required;
}

export function compactUnwrittenMapCommittedEventIds(
  save: UnwrittenMapSaveV2,
  queuedEventIds: readonly string[] = [],
): UnwrittenMapSaveV2 {
  const required = requiredCommittedEventIds(save);
  queuedEventIds.forEach((eventId) => {
    if (!validV2EventId(eventId)) throw new Error("invalid_unwritten_map_event_id");
    required.add(eventId);
  });
  const committedEventIds = save.committedEventIds.filter((eventId) => required.has(eventId));
  if (committedEventIds.length > UNWRITTEN_MAP_MAX_COMMITTED_EVENT_IDS) {
    throw new Error("unwritten_map_committed_event_ledger_capacity_exceeded");
  }
  return committedEventIds.length === save.committedEventIds.length
    ? save : { ...save, committedEventIds };
}

export function restoreUnwrittenMapSave(raw: string | null, libraryScopeId: string): UnwrittenMapSaveV2 | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const schema = (parsed as { schemaVersion?: unknown }).schemaVersion;
    if (schema === UNWRITTEN_MAP_V1_SAVE_SCHEMA) return migrateUnwrittenMapSaveV1(parsed as UnwrittenMapSaveV1, libraryScopeId);
    const value = parsed as Partial<UnwrittenMapSaveV2>;
    const hasCommittedLedger = Array.isArray(value.committedEventIds);
    const committedEventIds = hasCommittedLedger
      ? value.committedEventIds as unknown[]
      : [
        ...(Array.isArray(value.decisions) ? value.decisions.flatMap((decision) => {
          const eventId = durableV2OutcomeEventId(decision);
          return eventId ? [eventId] : [];
        }) : []),
        ...(Array.isArray(value.undoneDecisions) ? value.undoneDecisions.flatMap((decision) => {
          const eventId = durableV2OutcomeEventId(decision);
          return [...(eventId ? [eventId] : []), decision.correctionEventId];
        }) : []),
      ];
    if (
      value.schemaVersion !== UNWRITTEN_MAP_SAVE_SCHEMA || !validPlayerId(value.anonymousPlayerId)
      || (value.revision !== undefined && (!Number.isInteger(value.revision) || Number(value.revision) < 0))
      || (value.lastOperationId !== undefined && value.lastOperationId !== null
        && (typeof value.lastOperationId !== "string" || value.lastOperationId.length > 200))
      || typeof value.libraryScopeId !== "string" || normalizeLibraryScope(value.libraryScopeId) !== value.libraryScopeId
      || value.libraryScopeId !== normalizeLibraryScope(libraryScopeId)
      || !value.position || !isWalkable(value.position)
      || !["up", "down", "left", "right"].includes(String(value.facing))
      || !Array.isArray(value.decisions) || !value.decisions.every(validDecision)
      || !Array.isArray(value.undoneDecisions) || !Array.isArray(value.discoveredScenarioIds)
      || !value.encounterAttempts || typeof value.encounterAttempts !== "object"
      || !Array.isArray(committedEventIds) || committedEventIds.length > UNWRITTEN_MAP_MAX_COMMITTED_EVENT_IDS
      || !committedEventIds.every(validV2EventId) || new Set(committedEventIds).size !== committedEventIds.length
      || !Number.isInteger(value.playSessionCount) || Number(value.playSessionCount) < 0
      || Number(value.playSessionCount) > UNWRITTEN_MAP_MAX_PLAY_SESSIONS
      || !isIso(value.startedAt) || !isIso(value.updatedAt)
    ) return null;
    const decisions = value.decisions;
    const undoneDecisions = value.undoneDecisions as UndoneMapDecision[];
    const discoveredScenarioIds = value.discoveredScenarioIds as unknown[];
    const attemptEntries = Object.entries(value.encounterAttempts);
    if (
      decisions.length > UNWRITTEN_MAP_SCENARIOS.length
      || new Set(decisions.map((decision) => decision.scenarioId)).size !== decisions.length
      || undoneDecisions.length > UNWRITTEN_MAP_MAX_UNDONE_DECISIONS
      || !undoneDecisions.every(validUndoneDecision)
      || discoveredScenarioIds.length > UNWRITTEN_MAP_SCENARIOS.length
      || !discoveredScenarioIds.every((id) => typeof id === "string"
        && UNWRITTEN_MAP_SCENARIOS.some((scenario) => scenario.id === id))
      || new Set(discoveredScenarioIds).size !== discoveredScenarioIds.length
      || [...decisions, ...undoneDecisions].some((item) => !discoveredScenarioIds.includes(item.scenarioId))
      || decisions.some((item) => {
        const eventId = durableV2OutcomeEventId(item);
        return eventId !== null && !committedEventIds.includes(eventId);
      })
      || undoneDecisions.some((item) => {
        const eventId = durableV2OutcomeEventId(item);
        return (eventId !== null && !committedEventIds.includes(eventId))
          || !committedEventIds.includes(item.correctionEventId);
      })
      || attemptEntries.length > UNWRITTEN_MAP_SCENARIOS.length
      || !attemptEntries.every(([id, count]) => UNWRITTEN_MAP_SCENARIOS.some((scenario) => scenario.id === id)
        && Number.isInteger(count) && Number(count) >= 0 && Number(count) <= UNWRITTEN_MAP_MAX_ENCOUNTER_ATTEMPTS)
      || [...decisions, ...undoneDecisions].some((item) => Number(value.encounterAttempts?.[item.scenarioId]) < item.attempt)
      || Date.parse(String(value.startedAt)) > Date.parse(String(value.updatedAt))
      || [...decisions, ...undoneDecisions].some((item) =>
        Date.parse(item.occurredAt) < Date.parse(String(value.startedAt)) || Date.parse(item.occurredAt) > Date.parse(String(value.updatedAt)))
      || undoneDecisions.some((item) => Date.parse(item.undoneAt) > Date.parse(String(value.updatedAt)))
      || (decisions.length === UNWRITTEN_MAP_SCENARIOS.length) !== isIso(value.completedAt)
      || (isIso(value.completedAt) && (Date.parse(value.completedAt) < Date.parse(String(value.startedAt))
        || Date.parse(value.completedAt) > Date.parse(String(value.updatedAt))))
      || (Number(value.playSessionCount) === 0
        ? value.lastSessionId !== null
        : typeof value.lastSessionId !== "string" || !/^map-session-[a-z0-9-]{3,80}$/.test(value.lastSessionId))
    ) return null;
    return {
      schemaVersion: UNWRITTEN_MAP_SAVE_SCHEMA,
      revision: value.revision === undefined ? 0 : Number(value.revision),
      lastOperationId: typeof value.lastOperationId === "string" ? value.lastOperationId : null,
      anonymousPlayerId: value.anonymousPlayerId,
      libraryScopeId: normalizeLibraryScope(value.libraryScopeId),
      position: { x: value.position.x, y: value.position.y },
      facing: value.facing as MapFacing,
      decisions,
      undoneDecisions,
      discoveredScenarioIds: discoveredScenarioIds as string[],
      encounterAttempts: Object.fromEntries(attemptEntries.map(([id, count]) => [id, Number(count)])),
      committedEventIds: committedEventIds as string[],
      playSessionCount: Number(value.playSessionCount),
      lastSessionId: typeof value.lastSessionId === "string" ? value.lastSessionId : null,
      startedAt: value.startedAt,
      updatedAt: value.updatedAt,
      completedAt: isIso(value.completedAt) ? value.completedAt : null,
    };
  } catch {
    return null;
  }
}

export function monotonicUnwrittenMapTimestamp(
  save: UnwrittenMapSaveV2,
  candidate = new Date().toISOString(),
): string {
  if (!isIso(candidate)) throw new Error("invalid_unwritten_map_timestamp");
  const latest = [
    save.startedAt,
    save.updatedAt,
    ...(save.completedAt ? [save.completedAt] : []),
    ...save.decisions.map((decision) => decision.occurredAt),
    ...save.undoneDecisions.flatMap((decision) => [decision.occurredAt, decision.undoneAt]),
  ].reduce((maximum, timestamp) => Math.max(maximum, Date.parse(timestamp)), Number.NEGATIVE_INFINITY);
  return Date.parse(candidate) < latest
    ? new Date(latest).toISOString()
    : candidate;
}

export function sameUnwrittenMapDecisionIdentity(
  left: UnwrittenMapDecision,
  right: UnwrittenMapDecision,
): boolean {
  return left.scenarioId === right.scenarioId
    && left.kind === right.kind
    && left.optionId === right.optionId
    && left.presentationId === right.presentationId
    && left.attempt === right.attempt
    && left.occurredAt === right.occurredAt
    && JSON.stringify(left.outcomeEvidence) === JSON.stringify(right.outcomeEvidence);
}

export function updateMapPosition(
  save: UnwrittenMapSaveV2,
  position: MapPosition,
  facing: MapFacing = save.facing,
  now = new Date().toISOString(),
): UnwrittenMapSaveV2 {
  const discovered = scenarioAt(position);
  const updatedAt = monotonicUnwrittenMapTimestamp(save, now);
  return {
    ...save,
    position: { ...position },
    facing,
    discoveredScenarioIds: discovered && !save.discoveredScenarioIds.includes(discovered.id)
      ? [...save.discoveredScenarioIds, discovered.id] : save.discoveredScenarioIds,
    updatedAt,
  };
}

export function startEncounterAttempt(save: UnwrittenMapSaveV2, scenarioId: string, now = new Date().toISOString()): UnwrittenMapSaveV2 {
  if (!UNWRITTEN_MAP_SCENARIOS.some((scenario) => scenario.id === scenarioId)) throw new Error("invalid_map_scenario");
  if (save.decisions.some((decision) => decision.scenarioId === scenarioId)) throw new Error("scenario_already_completed");
  return {
    ...save,
    encounterAttempts: { ...save.encounterAttempts, [scenarioId]: (save.encounterAttempts[scenarioId] || 0) + 1 },
    discoveredScenarioIds: save.discoveredScenarioIds.includes(scenarioId)
      ? save.discoveredScenarioIds : [...save.discoveredScenarioIds, scenarioId],
    updatedAt: monotonicUnwrittenMapTimestamp(save, now),
  };
}

export function applyMapOutcome(
  save: UnwrittenMapSaveV2,
  outcome: Omit<UnwrittenMapDecision, "occurredAt"> & { occurredAt?: string },
): UnwrittenMapSaveV2 {
  const scenario = UNWRITTEN_MAP_SCENARIOS.find((candidate) => candidate.id === outcome.scenarioId);
  if (!scenario || (outcome.kind === "choice" && !scenario.choices.some((item) => item.id === outcome.optionId))
    || (outcome.kind === "skip" && outcome.optionId !== null)) throw new Error("invalid_map_outcome");
  if (outcome.outcomeEvidence.kind !== "durable_event"
    || outcome.outcomeEvidence.schemaVersion !== UNWRITTEN_MAP_EVENT_SCHEMA
    || !validV2EventId(outcome.outcomeEvidence.eventId)) throw new Error("invalid_map_outcome_evidence");
  if (save.decisions.some((decision) => decision.scenarioId === outcome.scenarioId)) throw new Error("scenario_already_completed");
  const occurredAt = monotonicUnwrittenMapTimestamp(save, outcome.occurredAt || new Date().toISOString());
  const decisions = [...save.decisions, { ...outcome, occurredAt }];
  return {
    ...save,
    decisions,
    discoveredScenarioIds: save.discoveredScenarioIds.includes(outcome.scenarioId)
      ? save.discoveredScenarioIds : [...save.discoveredScenarioIds, outcome.scenarioId],
    updatedAt: occurredAt,
    completedAt: decisions.length === UNWRITTEN_MAP_SCENARIOS.length ? occurredAt : null,
  };
}

export function undoMostRecentOutcome(
  save: UnwrittenMapSaveV2,
  correctionEventId: string,
  now = new Date().toISOString(),
): UnwrittenMapSaveV2 {
  const original = save.decisions[save.decisions.length - 1];
  if (!original) throw new Error("no_map_outcome_to_undo");
  const undoneAt = monotonicUnwrittenMapTimestamp(save, now);
  return {
    ...save,
    decisions: save.decisions.slice(0, -1),
    undoneDecisions: [...save.undoneDecisions, { ...original, correctionEventId, undoneAt }]
      .slice(-UNWRITTEN_MAP_MAX_UNDONE_DECISIONS),
    updatedAt: undoneAt,
    completedAt: null,
  };
}

export function isUnwrittenMapJourneyComplete(save: UnwrittenMapSaveV2): boolean {
  const effectiveScenarioIds = new Set(save.decisions.map((decision) => decision.scenarioId));
  return effectiveScenarioIds.size === UNWRITTEN_MAP_SCENARIOS.length
    && UNWRITTEN_MAP_SCENARIOS.every((scenario) => effectiveScenarioIds.has(scenario.id));
}

export function recordDurableUnwrittenMapEvent(
  save: UnwrittenMapSaveV2,
  eventId: string,
  queuedEventIds?: readonly string[],
): UnwrittenMapSaveV2 {
  if (!validV2EventId(eventId)) throw new Error("invalid_unwritten_map_event_id");
  const compacted = queuedEventIds
    ? compactUnwrittenMapCommittedEventIds(save, queuedEventIds)
    : save;
  if (compacted.committedEventIds.includes(eventId)) return compacted;
  if (compacted.committedEventIds.length >= UNWRITTEN_MAP_MAX_COMMITTED_EVENT_IDS) {
    throw new Error("unwritten_map_committed_event_ledger_capacity_exceeded");
  }
  return { ...compacted, committedEventIds: [...compacted.committedEventIds, eventId] };
}

export function orderedChoices(scenario: MapScenario, anonymousPlayerId: string, attempt: number): MapChoice[] {
  const result = [...scenario.choices];
  let state = parseInt(hashText(`${anonymousPlayerId}:${scenario.id}:${attempt}`).slice(0, 8), 16) || 1;
  for (let index = result.length - 1; index > 0; index -= 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const swap = state % (index + 1);
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  if (attempt > 1) {
    const prior = orderedChoices(scenario, anonymousPlayerId, attempt - 1);
    if (result.every((item, index) => item.id === prior[index].id)) result.push(result.shift() as MapChoice);
  }
  return result;
}

export function optionSnapshot(option: MapChoice): OptionSnapshot {
  return {
    id: option.id,
    version: option.version,
    label: option.label,
    description: option.description,
    taxonomyVersion: UNWRITTEN_MAP_TAXONOMY_VERSION,
    tasteVector: { ...option.tasteVector },
    tags: [...option.tags],
  };
}

export function presentationIdFor(
  anonymousPlayerId: string,
  scenarioId: string,
  attempt: number,
  optionIds: string[],
): string {
  return `ump-${hashText(`${anonymousPlayerId}:${scenarioId}:${attempt}:${optionIds.join(",")}`)}`;
}

export function latencyFor(startedAtMs: number, nowMs = Date.now()): { latencyCategory: LatencyCategory } {
  const responseTimeMs = Math.max(0, Math.min(3_600_000, Math.round(nowMs - startedAtMs)));
  return { latencyCategory: latencyCategoryFor(responseTimeMs) };
}

function latencyCategoryFor(responseTimeMs: number): LatencyCategory {
  return responseTimeMs < 1_500 ? "instant"
    : responseTimeMs < 8_000 ? "quick"
      : responseTimeMs < 30_000 ? "considered"
        : responseTimeMs < 120_000 ? "long" : "returned";
}

function eventWithoutId(event: Partial<UnwrittenMapEventV2>): Record<string, unknown> {
  const { eventId: _eventId, ...rest } = event;
  return rest as Record<string, unknown>;
}

function eventIdFor(event: Partial<UnwrittenMapEventV2>): string {
  return `ume2-${hashText(JSON.stringify(eventWithoutId(event)))}`;
}

export function explorationContext(save: UnwrittenMapSaveV2, stepsThisSession: number): MapExplorationContext {
  return {
    mapX: save.position.x,
    mapY: save.position.y,
    regionId: regionAt(save.position).id,
    effectiveCompletedCount: save.decisions.length,
    discoveredCount: save.discoveredScenarioIds.length,
    stepsThisSession: Math.max(0, Math.floor(stepsThisSession)),
    preferenceInference: "none_from_exploration",
  };
}

type CreateEventBase = {
  save: UnwrittenMapSaveV2;
  gameSessionId: string;
  stepsThisSession?: number;
  occurredAt?: string;
};

function baseEvent(args: CreateEventBase, eventType: UnwrittenMapEventType): Omit<EventBase, "eventId"> {
  return {
    schemaVersion: UNWRITTEN_MAP_EVENT_SCHEMA,
    eventType,
    gameId: "the_unwritten_map",
    gameVersion: UNWRITTEN_MAP_GAME_VERSION,
    taxonomyVersion: UNWRITTEN_MAP_TAXONOMY_VERSION,
    gameSessionId: args.gameSessionId,
    anonymousPlayerId: args.save.anonymousPlayerId,
    libraryScopeId: args.save.libraryScopeId,
    occurredAt: monotonicUnwrittenMapTimestamp(args.save, args.occurredAt || new Date().toISOString()),
    explorationContext: explorationContext(args.save, args.stepsThisSession || 0),
  };
}

function withEventId<T extends Omit<UnwrittenMapEventV2, "eventId">>(event: T): T & { eventId: string } {
  return { ...event, eventId: eventIdFor(event) };
}

export function createEncounterPresentedEvent(args: CreateEventBase & {
  scenario: MapScenario;
  presentedChoices: MapChoice[];
  attempt: number;
}): EncounterPresentedEvent {
  const presentedOptions = args.presentedChoices.map(optionSnapshot);
  return withEventId({
    ...baseEvent(args, "encounter_presented"),
    eventType: "encounter_presented",
    scenarioId: args.scenario.id,
    scenarioVersion: args.scenario.version,
    presentationId: presentationIdFor(args.save.anonymousPlayerId, args.scenario.id, args.attempt, presentedOptions.map((item) => item.id)),
    attempt: args.attempt,
    presentedOptions,
  });
}

export function createChoiceMadeEvent(args: CreateEventBase & {
  scenario: MapScenario;
  presentedChoices: MapChoice[];
  selectedOptionId: string;
  attempt: number;
  startedAtMs: number;
  nowMs?: number;
}): ChoiceMadeEvent {
  const presentedOptions = args.presentedChoices.map(optionSnapshot);
  const selectedSlot = presentedOptions.findIndex((option) => option.id === args.selectedOptionId);
  if (selectedSlot < 0) throw new Error("selected_option_not_presented");
  const latency = latencyFor(args.startedAtMs, args.nowMs);
  return withEventId({
    ...baseEvent(args, "choice_made"),
    eventType: "choice_made",
    scenarioId: args.scenario.id,
    scenarioVersion: args.scenario.version,
    presentationId: presentationIdFor(args.save.anonymousPlayerId, args.scenario.id, args.attempt, presentedOptions.map((item) => item.id)),
    attempt: args.attempt,
    presentedOptions,
    selectedSlot,
    chosenOption: { ...presentedOptions[selectedSlot], tasteVector: { ...presentedOptions[selectedSlot].tasteVector }, tags: [...presentedOptions[selectedSlot].tags] },
    nonSelectedOptions: presentedOptions.filter((_, index) => index !== selectedSlot),
    ...latency,
  });
}

export function createEncounterSkippedEvent(args: CreateEventBase & {
  scenario: MapScenario;
  presentedChoices: MapChoice[];
  attempt: number;
  startedAtMs: number;
  nowMs?: number;
}): EncounterSkippedEvent {
  const presentedOptions = args.presentedChoices.map(optionSnapshot);
  return withEventId({
    ...baseEvent(args, "encounter_skipped"),
    eventType: "encounter_skipped",
    scenarioId: args.scenario.id,
    scenarioVersion: args.scenario.version,
    presentationId: presentationIdFor(args.save.anonymousPlayerId, args.scenario.id, args.attempt, presentedOptions.map((item) => item.id)),
    attempt: args.attempt,
    presentedOptions,
    ...latencyFor(args.startedAtMs, args.nowMs),
    preferenceEffect: "none",
    skipMeaning: "keep_exploring",
  });
}

export function createChoiceUndoneEvent(args: CreateEventBase & { decision: UnwrittenMapDecision }): ChoiceUndoneEvent {
  return withEventId({
    ...baseEvent(args, "choice_undone"),
    eventType: "choice_undone",
    scenarioId: args.decision.scenarioId,
    originalEvidence: { ...args.decision.outcomeEvidence },
    originalOutcomeKind: args.decision.kind,
    restoredEncounter: true,
  });
}

export function createSessionEvent(
  args: CreateEventBase & { eventType: SessionEvent["eventType"]; playSessionCount: number },
): SessionEvent {
  return withEventId({
    ...baseEvent(args, args.eventType),
    eventType: args.eventType,
    playSessionCount: args.playSessionCount,
  });
}

function exactKeys(value: Record<string, unknown>, expected: string[]): boolean {
  const actual = Object.keys(value).sort();
  return actual.length === expected.length && actual.every((key, index) => key === [...expected].sort()[index]);
}

function validTasteVector(value: unknown): value is TasteVector {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.entries(value).every(([axis, weight]) =>
    UNWRITTEN_MAP_TAXONOMY.includes(axis as TasteAxis) && [-2, -1, 1, 2].includes(Number(weight)));
}

function validSnapshot(value: unknown): value is OptionSnapshot {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const option = value as unknown as Record<string, unknown>;
  return exactKeys(option, ["id", "version", "label", "description", "taxonomyVersion", "tasteVector", "tags"])
    && typeof option.id === "string" && option.id.length <= 80 && option.version === 1
    && typeof option.label === "string" && option.label.length <= 120
    && typeof option.description === "string" && option.description.length <= 240
    && option.taxonomyVersion === UNWRITTEN_MAP_TAXONOMY_VERSION
    && validTasteVector(option.tasteVector)
    && Array.isArray(option.tags) && option.tags.length <= 8
    && option.tags.every((tag) => typeof tag === "string" && tag.length <= 40);
}

function snapshotMatchesOption(snapshot: OptionSnapshot, option: MapChoice): boolean {
  return JSON.stringify(snapshot) === JSON.stringify(optionSnapshot(option));
}

function validExploration(value: unknown): value is MapExplorationContext {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const context = value as unknown as Record<string, unknown>;
  return exactKeys(context, ["mapX", "mapY", "regionId", "effectiveCompletedCount", "discoveredCount", "stepsThisSession", "preferenceInference"])
    && Number.isInteger(context.mapX) && Number.isInteger(context.mapY)
    && Number(context.mapX) >= 0 && Number(context.mapX) < UNWRITTEN_MAP_WIDTH
    && Number(context.mapY) >= 0 && Number(context.mapY) < UNWRITTEN_MAP_HEIGHT
    && isWalkable({ x: Number(context.mapX), y: Number(context.mapY) })
    && typeof context.regionId === "string"
    && context.regionId === regionAt({ x: Number(context.mapX), y: Number(context.mapY) }).id
    && Number.isInteger(context.effectiveCompletedCount) && Number(context.effectiveCompletedCount) >= 0
    && Number(context.effectiveCompletedCount) <= UNWRITTEN_MAP_SCENARIOS.length
    && Number.isInteger(context.discoveredCount) && Number(context.discoveredCount) >= 0
    && Number(context.discoveredCount) <= UNWRITTEN_MAP_SCENARIOS.length
    && Number(context.effectiveCompletedCount) <= Number(context.discoveredCount)
    && Number.isInteger(context.stepsThisSession) && Number(context.stepsThisSession) >= 0
    && Number(context.stepsThisSession) <= UNWRITTEN_MAP_MAX_STEPS_PER_SESSION
    && context.preferenceInference === "none_from_exploration";
}

const BASE_KEYS = [
  "schemaVersion", "eventId", "eventType", "gameId", "gameVersion", "taxonomyVersion",
  "gameSessionId", "anonymousPlayerId", "libraryScopeId", "occurredAt", "explorationContext",
];

export function isUnwrittenMapEventV2(value: unknown): value is UnwrittenMapEventV2 {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const event = value as unknown as Record<string, unknown>;
  if (
    event.schemaVersion !== UNWRITTEN_MAP_EVENT_SCHEMA || event.gameId !== "the_unwritten_map"
    || event.gameVersion !== UNWRITTEN_MAP_GAME_VERSION || event.taxonomyVersion !== UNWRITTEN_MAP_TAXONOMY_VERSION
    || !validV2EventId(event.eventId)
    || typeof event.gameSessionId !== "string" || !/^map-session-[a-z0-9-]{3,80}$/.test(event.gameSessionId)
    || !validPlayerId(event.anonymousPlayerId)
    || typeof event.libraryScopeId !== "string" || normalizeLibraryScope(event.libraryScopeId) !== event.libraryScopeId
    || !isIso(event.occurredAt) || !validExploration(event.explorationContext)
  ) return false;
  const type = event.eventType;
  const snapshots = event.presentedOptions;
  const scenario = UNWRITTEN_MAP_SCENARIOS.find((candidate) => candidate.id === event.scenarioId);
  let valid = false;
  if (type === "encounter_presented") {
    valid = exactKeys(event, [...BASE_KEYS, "scenarioId", "scenarioVersion", "presentationId", "attempt", "presentedOptions"])
      && validPresentation(event, scenario, snapshots);
  } else if (type === "choice_made") {
    const selectedSlot = Number(event.selectedSlot);
    valid = exactKeys(event, [...BASE_KEYS, "scenarioId", "scenarioVersion", "presentationId", "attempt", "presentedOptions",
      "selectedSlot", "chosenOption", "nonSelectedOptions", "latencyCategory"])
      && validPresentation(event, scenario, snapshots)
      && Number.isInteger(selectedSlot) && selectedSlot >= 0 && selectedSlot < (snapshots as unknown[]).length
      && validSnapshot(event.chosenOption)
      && JSON.stringify(event.chosenOption) === JSON.stringify((snapshots as unknown[])[selectedSlot])
      && Array.isArray(event.nonSelectedOptions)
      && JSON.stringify(event.nonSelectedOptions) === JSON.stringify((snapshots as unknown[]).filter((_, index) => index !== selectedSlot))
      && validLatencyCategory(event.latencyCategory);
  } else if (type === "encounter_skipped") {
    valid = exactKeys(event, [...BASE_KEYS, "scenarioId", "scenarioVersion", "presentationId", "attempt", "presentedOptions",
      "latencyCategory", "preferenceEffect", "skipMeaning"])
      && validPresentation(event, scenario, snapshots) && validLatencyCategory(event.latencyCategory)
      && event.preferenceEffect === "none" && event.skipMeaning === "keep_exploring";
  } else if (type === "choice_undone") {
    const originalEvidence = event.originalEvidence as UnwrittenMapOutcomeEvidence;
    valid = exactKeys(event, [...BASE_KEYS, "scenarioId", "originalEvidence", "originalOutcomeKind", "restoredEncounter"])
      && Boolean(scenario) && validOutcomeEvidence(originalEvidence)
      && ["choice", "skip"].includes(String(event.originalOutcomeKind)) && event.restoredEncounter === true;
    if (valid && (originalEvidence.kind === "migrated_local_without_durable_event"
      || originalEvidence.schemaVersion === UNWRITTEN_MAP_V1_EVENT_SCHEMA)) {
      valid = event.originalOutcomeKind === "choice";
    }
  } else if (["session_started", "session_continued", "session_exited", "session_completed"].includes(String(type))) {
    const completedCount = Number((event.explorationContext as MapExplorationContext).effectiveCompletedCount);
    valid = exactKeys(event, [...BASE_KEYS, "playSessionCount"])
      && Number.isInteger(event.playSessionCount) && Number(event.playSessionCount) >= 1
      && Number(event.playSessionCount) <= UNWRITTEN_MAP_MAX_PLAY_SESSIONS
      && (type !== "session_started" || (Number(event.playSessionCount) === 1 && completedCount === 0))
      && (type !== "session_completed" || completedCount === UNWRITTEN_MAP_SCENARIOS.length);
  }
  return valid && event.eventId === eventIdFor(event as Partial<UnwrittenMapEventV2>);
}

function validPresentation(
  event: Record<string, unknown>,
  scenario: MapScenario | undefined,
  snapshots: unknown,
): boolean {
  if (!scenario || event.scenarioVersion !== scenario.version || !Array.isArray(snapshots)
    || snapshots.length !== scenario.choices.length || !snapshots.every(validSnapshot)
    || new Set(snapshots.map((option) => option.id)).size !== snapshots.length
    || !Number.isInteger(event.attempt) || Number(event.attempt) < 1
    || Number(event.attempt) > UNWRITTEN_MAP_MAX_ENCOUNTER_ATTEMPTS
    || !validPresentationId(event.presentationId)) return false;
  const canonicalChoices = orderedChoices(scenario, String(event.anonymousPlayerId), Number(event.attempt));
  return snapshots.every((option, index) => snapshotMatchesOption(option, canonicalChoices[index]))
    && Number((event.explorationContext as MapExplorationContext).mapX) === scenario.position.x
    && Number((event.explorationContext as MapExplorationContext).mapY) === scenario.position.y
    && (event.explorationContext as MapExplorationContext).regionId === scenario.regionId
    && event.presentationId === presentationIdFor(
      String(event.anonymousPlayerId), scenario.id, Number(event.attempt), snapshots.map((option) => option.id));
}

function validLatencyCategory(value: unknown): value is LatencyCategory {
  return value === "instant" || value === "quick" || value === "considered" || value === "long" || value === "returned";
}

export function normalizeUnwrittenMapEventV2(value: unknown): UnwrittenMapEventV2 | null {
  if (!isUnwrittenMapEventV2(value)) return null;
  return JSON.parse(JSON.stringify(value)) as UnwrittenMapEventV2;
}

function v1EventIdFor(event: Partial<UnwrittenMapChoiceEventV1>): string {
  const fingerprint = {
    schemaVersion: event.schemaVersion,
    gameId: event.gameId,
    gameVersion: event.gameVersion,
    gameSessionId: event.gameSessionId,
    anonymousPlayerId: event.anonymousPlayerId,
    scenarioId: event.scenarioId,
    scenarioVersion: event.scenarioVersion,
    occurredAt: event.occurredAt,
    presentedOptionIds: event.presentedOptionIds,
    selectedOptionId: event.selectedOptionId,
    rejectedOptionIds: event.rejectedOptionIds,
    responseTimeMs: event.responseTimeMs,
    gameContext: event.gameContext,
  };
  return `ume-${hashText(JSON.stringify(fingerprint))}`;
}

export function isUnwrittenMapChoiceEventV1(value: unknown): value is UnwrittenMapChoiceEventV1 {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const event = value as unknown as Record<string, unknown>;
  if (!exactKeys(event, [
    "schemaVersion", "eventId", "gameId", "gameVersion", "gameSessionId", "anonymousPlayerId",
    "scenarioId", "scenarioVersion", "occurredAt", "presentedOptionIds", "selectedOptionId",
    "rejectedOptionIds", "responseTimeMs", "gameContext",
  ])) return false;
  const scenario = UNWRITTEN_MAP_V1_SCENARIO_CONTRACT.find((candidate) => candidate.id === event.scenarioId);
  const presented = event.presentedOptionIds;
  const rejected = event.rejectedOptionIds;
  const context = event.gameContext as Record<string, unknown> | null;
  if (
    event.schemaVersion !== UNWRITTEN_MAP_V1_EVENT_SCHEMA || event.gameId !== "the_unwritten_map"
    || event.gameVersion !== UNWRITTEN_MAP_V1_GAME_VERSION
    || typeof event.eventId !== "string" || !/^ume-[a-f0-9]{16}$/.test(event.eventId)
    || typeof event.gameSessionId !== "string" || !/^map-session-[a-z0-9-]{3,80}$/.test(event.gameSessionId)
    || !validPlayerId(event.anonymousPlayerId) || !scenario || event.scenarioVersion !== 1
    || !isIso(event.occurredAt) || !Array.isArray(presented) || !Array.isArray(rejected)
    || presented.length !== scenario.optionIds.length || new Set(presented).size !== presented.length
    || !presented.every((id) => typeof id === "string" && scenario.optionIds.includes(id as never))
    || typeof event.selectedOptionId !== "string" || !presented.includes(event.selectedOptionId)
    || rejected.length !== presented.length - 1 || new Set(rejected).size !== rejected.length
    || !rejected.every((id) => typeof id === "string" && id !== event.selectedOptionId && presented.includes(id))
    || !presented.every((id) => id === event.selectedOptionId || rejected.includes(id))
    || typeof event.responseTimeMs !== "number" || !Number.isFinite(event.responseTimeMs) || event.responseTimeMs < 0
    || !context || Array.isArray(context)
    || !exactKeys(context, ["mapX", "mapY", "completedScenarioCount"])
    || context.mapX !== scenario.position.x || context.mapY !== scenario.position.y
    || !Number.isInteger(context.completedScenarioCount) || Number(context.completedScenarioCount) < 0
    || Number(context.completedScenarioCount) >= UNWRITTEN_MAP_V1_SCENARIO_CONTRACT.length
  ) return false;
  return event.eventId === v1EventIdFor(event as Partial<UnwrittenMapChoiceEventV1>);
}

export function normalizeUnwrittenMapChoiceEventV1(value: unknown): UnwrittenMapChoiceEventV1 | null {
  if (!isUnwrittenMapChoiceEventV1(value)) return null;
  return {
    schemaVersion: UNWRITTEN_MAP_V1_EVENT_SCHEMA,
    eventId: value.eventId,
    gameId: "the_unwritten_map",
    gameVersion: UNWRITTEN_MAP_V1_GAME_VERSION,
    gameSessionId: value.gameSessionId,
    anonymousPlayerId: value.anonymousPlayerId,
    scenarioId: value.scenarioId,
    scenarioVersion: 1,
    occurredAt: value.occurredAt,
    presentedOptionIds: [...value.presentedOptionIds],
    selectedOptionId: value.selectedOptionId,
    rejectedOptionIds: [...value.rejectedOptionIds],
    responseTimeMs: value.responseTimeMs,
    gameContext: { ...value.gameContext },
  };
}
