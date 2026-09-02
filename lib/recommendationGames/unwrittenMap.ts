export const UNWRITTEN_MAP_SAVE_SCHEMA = "unwritten_map_save_v1" as const;
export const UNWRITTEN_MAP_EVENT_SCHEMA = "unwritten_map_choice_event_v1" as const;
export const UNWRITTEN_MAP_GAME_VERSION = "first_journey_v1" as const;
export const UNWRITTEN_MAP_SAVE_KEY = "novelideas_unwritten_map_save_v1";
export const UNWRITTEN_MAP_EVENT_QUEUE_KEY = "novelideas_unwritten_map_event_queue_v1";

export type MapPosition = { x: number; y: number };
export type MapDirection = "up" | "down" | "left" | "right";
export type MapTile = "T" | "G" | "P" | "W";

export type MapChoice = {
  id: string;
  label: string;
  description: string;
  result: string;
};

export type MapScenario = {
  id: string;
  version: 1;
  location: string;
  mapLabel: string;
  position: MapPosition;
  color: string;
  title: string;
  prompt: string;
  choices: MapChoice[];
};

export type UnwrittenMapDecision = {
  scenarioId: string;
  optionId: string;
};

export type UnwrittenMapSaveV1 = {
  schemaVersion: typeof UNWRITTEN_MAP_SAVE_SCHEMA;
  anonymousPlayerId: string;
  position: MapPosition;
  decisions: UnwrittenMapDecision[];
  discoveredScenarioIds: string[];
  startedAt: string;
  updatedAt: string;
};

export type UnwrittenMapChoiceEventV1 = {
  schemaVersion: typeof UNWRITTEN_MAP_EVENT_SCHEMA;
  eventId: string;
  gameId: "the_unwritten_map";
  gameVersion: typeof UNWRITTEN_MAP_GAME_VERSION;
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

function eventFingerprint(event: Partial<UnwrittenMapChoiceEventV1>): string {
  const input = JSON.stringify({
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
  });
  let first = 2166136261;
  let second = 5381;
  for (let index = 0; index < input.length; index += 1) {
    const code = input.charCodeAt(index);
    first ^= code;
    first = Math.imul(first, 16777619);
    second = Math.imul(second, 33) ^ code;
  }
  return `${(first >>> 0).toString(16).padStart(8, "0")}${(second >>> 0).toString(16).padStart(8, "0")}`;
}

function expectedEventId(event: Partial<UnwrittenMapChoiceEventV1>): string {
  return `ume-${eventFingerprint(event)}`;
}

export const UNWRITTEN_MAP_TILES: readonly string[] = [
  "TTTTTTTTTTTTTTT",
  "TGGGGGGPGGGGGGT",
  "TGGGWWGPGWWGGGT",
  "TGGGWWGPGWWGGGT",
  "TPPPPPPPPPPPPPT",
  "TPPPPPPPPPPPPPT",
  "TPPPPPPPPPPPPPT",
  "TGGGGGGPGGGGGGT",
  "TGGGWWGPGWWGGGT",
  "TGGGGGGPGGGGGGT",
  "TTTTTTTTTTTTTTT",
];

export const UNWRITTEN_MAP_START: MapPosition = { x: 7, y: 5 };

export const UNWRITTEN_MAP_SCENARIOS: MapScenario[] = [
  {
    id: "lantern-fair",
    version: 1,
    location: "Lantern Fair",
    mapLabel: "FAIR",
    position: { x: 2, y: 1 },
    color: "#e2b04f",
    title: "Music Beyond the Rain",
    prompt: "The storm has driven the entire village beneath one striped pavilion. What draws you in?",
    choices: [
      {
        id: "story-contest",
        label: "Enter the story contest",
        description: "Take the little stage and improvise something ridiculous.",
        result: "Your impossible tale earns a brass compass needle and several dramatic gasps.",
      },
      {
        id: "balcony-watch",
        label: "Watch from the balcony",
        description: "Find a quiet perch and observe the celebration below.",
        result: "From above, the moving lanterns form a constellation no one else notices.",
      },
      {
        id: "follow-music",
        label: "Follow the hidden music",
        description: "Slip behind the tents toward a melody with no visible musician.",
        result: "The tune leads to a tiny door painted on a brick wall. It opens once, just for you.",
      },
      {
        id: "quiet-lane",
        label: "Take the quiet lane",
        description: "Leave the crowd and enjoy the rain-softened streets.",
        result: "You discover that every puddle reflects a different season.",
      },
    ],
  },
  {
    id: "whisper-orchard",
    version: 1,
    location: "Whisper Orchard",
    mapLabel: "GLOW",
    position: { x: 12, y: 1 },
    color: "#79b86a",
    title: "The Light Between the Trees",
    prompt: "A pale light drifts deeper into an orchard where the trees quietly repeat old conversations.",
    choices: [
      {
        id: "call-out",
        label: "Call out to it",
        description: "Make your presence known and ask the light what it wants.",
        result: "The light answers in your own voice, then becomes a friendly lantern moth.",
      },
      {
        id: "follow-silently",
        label: "Follow without a sound",
        description: "Trail it carefully and let the mystery reveal itself.",
        result: "It leads you to a tree growing silver fruit under silver leaves.",
      },
      {
        id: "study-echoes",
        label: "Study the whispering trees",
        description: "Ignore the light for now and decode the orchard's repeating voices.",
        result: "The fragments assemble into directions left by a traveler a century ago.",
      },
      {
        id: "gather-fruit",
        label: "Gather windfallen fruit",
        description: "Stay near the path and fill your pack for the road ahead.",
        result: "One green apple hums whenever you face north.",
      },
    ],
  },
  {
    id: "old-lighthouse",
    version: 1,
    location: "Old Lighthouse",
    mapLabel: "BEAM",
    position: { x: 12, y: 9 },
    color: "#64a9bd",
    title: "A Darkened Beacon",
    prompt: "The lighthouse keeper needs help before nightfall, but the whole tower is full of secrets.",
    choices: [
      {
        id: "repair-lens",
        label: "Repair the great lens",
        description: "Work with your hands and get the beacon shining again.",
        result: "The restored beam reveals a road stretching across the surface of the sea.",
      },
      {
        id: "read-journals",
        label: "Search the keeper's journals",
        description: "Look for the reason the light went dark in the first place.",
        result: "A margin note describes an island that appears only when no beacon is burning.",
      },
      {
        id: "climb-roof",
        label: "Climb to the roof",
        description: "Trust the height and inspect the storm from above.",
        result: "At the railing, you see the entire blank edge of the world waiting to be mapped.",
      },
      {
        id: "listen-to-sea",
        label: "Sit beside the sea",
        description: "Wait quietly and listen before deciding what the tower needs.",
        result: "The waves tap out a patient rhythm against the rocks, and the beacon relights itself.",
      },
    ],
  },
  {
    id: "rain-camp",
    version: 1,
    location: "Rain Camp",
    mapLabel: "CAMP",
    position: { x: 2, y: 9 },
    color: "#b482bc",
    title: "One Dry Place",
    prompt: "A traveling camp offers shelter, hot tea, and several ways to spend the long wet evening.",
    choices: [
      {
        id: "share-table",
        label: "Join the crowded table",
        description: "Trade jokes, rumors, and food with travelers you have just met.",
        result: "By midnight, everyone has added a ridiculous landmark to your map.",
      },
      {
        id: "paint-storm",
        label: "Paint the storm",
        description: "Borrow paper and try to capture its colors before they change.",
        result: "Your painted lightning begins flashing whenever weather approaches.",
      },
      {
        id: "organize-supplies",
        label: "Help organize the camp",
        description: "Make the shelter warmer, calmer, and ready for tomorrow.",
        result: "The grateful travelers sew a hidden pocket into your map case.",
      },
      {
        id: "walk-in-rain",
        label: "Walk through the rain",
        description: "Leave the tents behind and wander beneath the open sky.",
        result: "The rain avoids one winding trail, outlining a new road through the hills.",
      },
    ],
  },
];

function samePosition(left: MapPosition, right: MapPosition): boolean {
  return left.x === right.x && left.y === right.y;
}

export function tileAt(position: MapPosition): MapTile | null {
  const row = UNWRITTEN_MAP_TILES[position.y];
  const tile = row?.[position.x];
  return tile === "T" || tile === "G" || tile === "P" || tile === "W" ? tile : null;
}

export function isWalkable(position: MapPosition): boolean {
  const tile = tileAt(position);
  return tile === "G" || tile === "P";
}

export function moveOnMap(position: MapPosition, direction: MapDirection): MapPosition {
  const delta = direction === "up"
    ? { x: 0, y: -1 }
    : direction === "down"
      ? { x: 0, y: 1 }
      : direction === "left"
        ? { x: -1, y: 0 }
        : { x: 1, y: 0 };
  const next = { x: position.x + delta.x, y: position.y + delta.y };
  return isWalkable(next) ? next : position;
}

export function scenarioAt(position: MapPosition): MapScenario | null {
  return UNWRITTEN_MAP_SCENARIOS.find((scenario) => samePosition(scenario.position, position)) || null;
}

export function createUnwrittenMapPlayerId(now = Date.now(), random = Math.random()): string {
  return `map-${now.toString(36)}-${Math.floor(random * 1_000_000_000).toString(36)}`;
}

export function createInitialUnwrittenMapSave(
  anonymousPlayerId: string,
  now = new Date().toISOString(),
): UnwrittenMapSaveV1 {
  return {
    schemaVersion: UNWRITTEN_MAP_SAVE_SCHEMA,
    anonymousPlayerId,
    position: { ...UNWRITTEN_MAP_START },
    decisions: [],
    discoveredScenarioIds: [],
    startedAt: now,
    updatedAt: now,
  };
}

export function restoreUnwrittenMapSave(raw: string | null): UnwrittenMapSaveV1 | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<UnwrittenMapSaveV1>;
    if (
      value.schemaVersion !== UNWRITTEN_MAP_SAVE_SCHEMA
      || typeof value.anonymousPlayerId !== "string"
      || !value.position
      || !isWalkable(value.position)
      || !Array.isArray(value.decisions)
      || !Array.isArray(value.discoveredScenarioIds)
      || typeof value.startedAt !== "string"
      || typeof value.updatedAt !== "string"
    ) return null;
    const decisions = value.decisions.filter((decision): decision is UnwrittenMapDecision => {
      if (!decision || typeof decision.scenarioId !== "string" || typeof decision.optionId !== "string") return false;
      const scenario = UNWRITTEN_MAP_SCENARIOS.find((candidate) => candidate.id === decision.scenarioId);
      return Boolean(scenario?.choices.some((choice) => choice.id === decision.optionId));
    });
    return {
      schemaVersion: UNWRITTEN_MAP_SAVE_SCHEMA,
      anonymousPlayerId: value.anonymousPlayerId,
      position: { x: value.position.x, y: value.position.y },
      decisions,
      discoveredScenarioIds: value.discoveredScenarioIds.filter((id): id is string =>
        typeof id === "string" && UNWRITTEN_MAP_SCENARIOS.some((scenario) => scenario.id === id)),
      startedAt: value.startedAt,
      updatedAt: value.updatedAt,
    };
  } catch {
    return null;
  }
}

export function updateMapPosition(
  save: UnwrittenMapSaveV1,
  position: MapPosition,
  now = new Date().toISOString(),
): UnwrittenMapSaveV1 {
  const discovered = scenarioAt(position);
  return {
    ...save,
    position: { ...position },
    discoveredScenarioIds: discovered && !save.discoveredScenarioIds.includes(discovered.id)
      ? [...save.discoveredScenarioIds, discovered.id]
      : save.discoveredScenarioIds,
    updatedAt: now,
  };
}

export function applyMapChoice(
  save: UnwrittenMapSaveV1,
  scenarioId: string,
  optionId: string,
  now = new Date().toISOString(),
): UnwrittenMapSaveV1 {
  const scenario = UNWRITTEN_MAP_SCENARIOS.find((candidate) => candidate.id === scenarioId);
  if (!scenario?.choices.some((choice) => choice.id === optionId)) throw new Error("invalid_map_choice");
  if (save.decisions.some((decision) => decision.scenarioId === scenarioId)) throw new Error("scenario_already_completed");
  return {
    ...save,
    decisions: [...save.decisions, { scenarioId, optionId }],
    discoveredScenarioIds: save.discoveredScenarioIds.includes(scenarioId)
      ? save.discoveredScenarioIds
      : [...save.discoveredScenarioIds, scenarioId],
    updatedAt: now,
  };
}

export function createUnwrittenMapChoiceEvent(args: {
  save: UnwrittenMapSaveV1;
  scenario: MapScenario;
  selectedOptionId: string;
  presentedOptionIds: string[];
  gameSessionId: string;
  startedAtMs: number;
  occurredAt?: string;
}): UnwrittenMapChoiceEventV1 {
  if (!args.scenario.choices.some((choice) => choice.id === args.selectedOptionId)) {
    throw new Error("invalid_map_choice");
  }
  const authoredIds = args.scenario.choices.map((choice) => choice.id);
  if (
    args.presentedOptionIds.length !== authoredIds.length
    || new Set(args.presentedOptionIds).size !== authoredIds.length
    || authoredIds.some((id) => !args.presentedOptionIds.includes(id))
  ) throw new Error("invalid_presented_options");
  const occurredAt = args.occurredAt || new Date().toISOString();
  const event: Omit<UnwrittenMapChoiceEventV1, "eventId"> = {
    schemaVersion: UNWRITTEN_MAP_EVENT_SCHEMA,
    gameId: "the_unwritten_map",
    gameVersion: UNWRITTEN_MAP_GAME_VERSION,
    gameSessionId: args.gameSessionId,
    anonymousPlayerId: args.save.anonymousPlayerId,
    scenarioId: args.scenario.id,
    scenarioVersion: args.scenario.version,
    occurredAt,
    presentedOptionIds: [...args.presentedOptionIds],
    selectedOptionId: args.selectedOptionId,
    rejectedOptionIds: args.presentedOptionIds.filter((id) => id !== args.selectedOptionId),
    responseTimeMs: Math.max(0, Date.now() - args.startedAtMs),
    gameContext: {
      mapX: args.save.position.x,
      mapY: args.save.position.y,
      completedScenarioCount: args.save.decisions.length,
    },
  };
  return { ...event, eventId: expectedEventId(event) };
}

export function isUnwrittenMapChoiceEventV1(value: unknown): value is UnwrittenMapChoiceEventV1 {
  if (!value || typeof value !== "object") return false;
  const event = value as Partial<UnwrittenMapChoiceEventV1>;
  const scenario = UNWRITTEN_MAP_SCENARIOS.find((candidate) => candidate.id === event.scenarioId);
  if (!scenario) return false;
  const authoredIds = scenario?.choices.map((choice) => choice.id) || [];
  const presented = Array.isArray(event.presentedOptionIds) ? event.presentedOptionIds : [];
  const rejected = Array.isArray(event.rejectedOptionIds) ? event.rejectedOptionIds : [];
  return event.schemaVersion === UNWRITTEN_MAP_EVENT_SCHEMA
    && event.gameId === "the_unwritten_map"
    && event.gameVersion === UNWRITTEN_MAP_GAME_VERSION
    && typeof event.eventId === "string"
    && /^ume-[a-f0-9]{16}$/.test(event.eventId)
    && typeof event.gameSessionId === "string"
    && /^map-session-[a-z0-9-]{3,80}$/.test(event.gameSessionId)
    && typeof event.anonymousPlayerId === "string"
    && /^map-[a-z0-9]+-[a-z0-9]+$/.test(event.anonymousPlayerId)
    && scenario?.version === event.scenarioVersion
    && presented.length === authoredIds.length
    && new Set(presented).size === authoredIds.length
    && authoredIds.every((id) => presented.includes(id))
    && typeof event.selectedOptionId === "string"
    && presented.includes(event.selectedOptionId)
    && rejected.length === presented.length - 1
    && new Set(rejected).size === rejected.length
    && rejected.every((id) => id !== event.selectedOptionId && presented.includes(id))
    && presented.every((id) => id === event.selectedOptionId || rejected.includes(id))
    && typeof event.occurredAt === "string"
    && Number.isFinite(Date.parse(event.occurredAt))
    && typeof event.responseTimeMs === "number"
    && Number.isFinite(event.responseTimeMs)
    && event.responseTimeMs >= 0
    && event.gameContext?.mapX === scenario.position.x
    && event.gameContext?.mapY === scenario.position.y
    && Number.isInteger(event.gameContext?.completedScenarioCount)
    && Number(event.gameContext?.completedScenarioCount) >= 0
    && Number(event.gameContext?.completedScenarioCount) < UNWRITTEN_MAP_SCENARIOS.length
    && event.eventId === expectedEventId(event);
}

export function normalizeUnwrittenMapChoiceEventV1(value: unknown): UnwrittenMapChoiceEventV1 | null {
  if (!isUnwrittenMapChoiceEventV1(value)) return null;
  return {
    schemaVersion: UNWRITTEN_MAP_EVENT_SCHEMA,
    eventId: value.eventId,
    gameId: "the_unwritten_map",
    gameVersion: UNWRITTEN_MAP_GAME_VERSION,
    gameSessionId: value.gameSessionId,
    anonymousPlayerId: value.anonymousPlayerId,
    scenarioId: value.scenarioId,
    scenarioVersion: value.scenarioVersion,
    occurredAt: value.occurredAt,
    presentedOptionIds: [...value.presentedOptionIds],
    selectedOptionId: value.selectedOptionId,
    rejectedOptionIds: [...value.rejectedOptionIds],
    responseTimeMs: value.responseTimeMs,
    gameContext: { ...value.gameContext },
  };
}
