export const LAST_BOOKSHOP_PROGRESS_SCHEMA = "last_bookshop_progress_v1" as const;
export const RECOMMENDATION_GAME_EVENT_SCHEMA = "recommendation_game_event_v1" as const;
export const LAST_BOOKSHOP_PROGRESS_KEY = "novelideas_last_bookshop_progress_v1";
export const LAST_BOOKSHOP_EVENT_QUEUE_KEY = "novelideas_recommendation_game_event_queue_v1";

export type ConfidenceLevel = "low" | "medium" | "high";
export type PitchCharm = "mood" | "world" | "pace" | "surprise";

export type LastBookshopWork = {
  id: string;
  title: string;
  creator: string;
  blurb: string;
  shelf: string;
  tags: string[];
  concernTags: string[];
  coverColor: string;
  coverAccent: string;
};

export type LastBookshopCustomer = {
  id: string;
  name: string;
  role: string;
  portraitColor: string;
  arrival: string;
};

export type LastBookshopEncounter = {
  id: string;
  night: number;
  customerId: string;
  request: string;
  clues: string[];
  likes: string[];
  avoids: string[];
  shelfIds: string[];
  reactions: {
    delighted: string;
    content: string;
    disappointed: string;
  };
};

export type LastBookshopProgressV1 = {
  schemaVersion: typeof LAST_BOOKSHOP_PROGRESS_SCHEMA;
  anonymousPlayerId: string;
  night: number;
  encounterIndex: number;
  reputation: number;
  coins: number;
  completedEncounterIds: string[];
  unlockedDecorations: string[];
};

export type RecommendationGameEventV1 = {
  schemaVersion: typeof RECOMMENDATION_GAME_EVENT_SCHEMA;
  eventId: string;
  gameId: "the_last_bookshop";
  gameVersion: "vertical_slice_v1";
  gameSessionId: string;
  anonymousPlayerId: string;
  scenarioId: string;
  occurredAt: string;
  presentedCandidateIds: string[];
  selectedCandidateIds: string[];
  selectedOrder: string[];
  predictedCustomerChoiceId: string;
  simulatedCustomerChoiceId: string;
  confidence: ConfidenceLevel;
  reasonTags: PitchCharm[];
  responseTimeMs: number;
  outcome: {
    predictionCorrect: boolean;
    boundaryViolations: string[];
    selectionDiversity: number;
    reputationEarned: number;
  };
  presentationOrder: string[];
  gameContext: {
    night: number;
    customerId: string;
    customerRole: string;
  };
};

export type EncounterOutcome = {
  chosenWorkId: string;
  choiceScore: number;
  boundaryViolations: string[];
  selectionDiversity: number;
};

export const LAST_BOOKSHOP_WORKS: LastBookshopWork[] = [
  {
    id: "atlas-of-small-stars",
    title: "Atlas of Small Stars",
    creator: "E. Vesper",
    blurb: "A lighthouse keeper maps constellations that appear only above forgotten islands.",
    shelf: "The Rain Room",
    tags: ["quiet", "space", "mystery", "hopeful", "solitary"],
    concernTags: [],
    coverColor: "#24324f",
    coverAccent: "#e8c56a",
  },
  {
    id: "iron-suns",
    title: "Iron Suns",
    creator: "Rook Halden",
    blurb: "Three armies race across a dying galaxy toward a weapon that remembers every war.",
    shelf: "The Locked Stacks",
    tags: ["space", "war", "grim", "fast", "violent"],
    concernTags: ["bleak", "violence"],
    coverColor: "#49292a",
    coverAccent: "#f17a4b",
  },
  {
    id: "tea-at-worlds-end",
    title: "Tea at World's End",
    creator: "Mina Bell",
    blurb: "An anxious cartographer finds a tea shop at the edge of every unfinished map.",
    shelf: "The Lantern Shelves",
    tags: ["cozy", "adventure", "hopeful", "quiet", "found-family"],
    concernTags: [],
    coverColor: "#315348",
    coverAccent: "#f1d6a3",
  },
  {
    id: "the-clockwork-orchard",
    title: "The Clockwork Orchard",
    creator: "N. Quill",
    blurb: "A young mechanic inherits an orchard where brass fruit contains stolen memories.",
    shelf: "The Children's Staircase",
    tags: ["mystery", "family", "gentle", "inventive", "hopeful"],
    concernTags: [],
    coverColor: "#614927",
    coverAccent: "#e7bd67",
  },
  {
    id: "wolves-under-glass",
    title: "Wolves Under Glass",
    creator: "Iris North",
    blurb: "A museum guard discovers the creatures in the winter dioramas are watching back.",
    shelf: "The Locked Stacks",
    tags: ["horror", "winter", "tense", "mystery", "dark"],
    concernTags: ["frightening"],
    coverColor: "#27373d",
    coverAccent: "#b7d7d7",
  },
  {
    id: "a-pocketful-of-thunder",
    title: "A Pocketful of Thunder",
    creator: "June Lark",
    blurb: "Two rival storm collectors cross the countryside in a wagon full of bottled weather.",
    shelf: "The Lantern Shelves",
    tags: ["adventure", "funny", "fast", "rivals", "romance"],
    concernTags: [],
    coverColor: "#3e4a73",
    coverAccent: "#f6d34a",
  },
  {
    id: "the-quiet-detective",
    title: "The Quiet Detective",
    creator: "O. Finch",
    blurb: "A retired investigator solves village mysteries without leaving his garden.",
    shelf: "The Rain Room",
    tags: ["cozy", "mystery", "quiet", "clever", "gentle"],
    concernTags: [],
    coverColor: "#45604b",
    coverAccent: "#d8c49a",
  },
  {
    id: "salt-crown",
    title: "The Salt Crown",
    creator: "Marrow Tide",
    blurb: "A drowned queen bargains with pirates to reclaim a kingdom beneath the sea.",
    shelf: "The Locked Stacks",
    tags: ["fantasy", "ocean", "dark", "politics", "violent"],
    concernTags: ["violence", "bleak"],
    coverColor: "#163f55",
    coverAccent: "#91d4cf",
  },
  {
    id: "letters-to-a-sleeping-city",
    title: "Letters to a Sleeping City",
    creator: "Ansel Grey",
    blurb: "Every midnight, a postal worker delivers letters to residents who vanished years ago.",
    shelf: "The Cabinet of Unfinished Stories",
    tags: ["ghosts", "quiet", "melancholy", "mystery", "hopeful"],
    concernTags: ["grief"],
    coverColor: "#443a58",
    coverAccent: "#ddd0a7",
  },
  {
    id: "how-to-befriend-a-volcano",
    title: "How to Befriend a Volcano",
    creator: "Pip Ember",
    blurb: "An impatient apprentice learns that saving a town begins with listening to a mountain.",
    shelf: "The Children's Staircase",
    tags: ["funny", "fantasy", "gentle", "adventure", "young"],
    concernTags: [],
    coverColor: "#7a382c",
    coverAccent: "#f7b85b",
  },
  {
    id: "the-seventh-summer",
    title: "The Seventh Summer",
    creator: "Clara Moss",
    blurb: "Old friends return to a lakeside house where one perfect summer keeps repeating.",
    shelf: "The Rain Room",
    tags: ["friendship", "romance", "nostalgic", "quiet", "mystery"],
    concernTags: [],
    coverColor: "#315c67",
    coverAccent: "#f0cf86",
  },
  {
    id: "teeth-of-the-moon",
    title: "Teeth of the Moon",
    creator: "Vale Sable",
    blurb: "A monster hunter enters a moonlit city where everyone has something to hide.",
    shelf: "The Locked Stacks",
    tags: ["horror", "violent", "fast", "dark", "monsters"],
    concernTags: ["violence", "frightening"],
    coverColor: "#2d263c",
    coverAccent: "#cfdae8",
  },
  {
    id: "the-borrowed-kitchen",
    title: "The Borrowed Kitchen",
    creator: "Saffron Lee",
    blurb: "Neighbors trade recipes, memories, and second chances in a wandering kitchen.",
    shelf: "The Lantern Shelves",
    tags: ["cozy", "food", "community", "hopeful", "gentle"],
    concernTags: [],
    coverColor: "#6d4934",
    coverAccent: "#f0cf98",
  },
  {
    id: "river-with-no-name",
    title: "The River With No Name",
    creator: "Tomas Reed",
    blurb: "A lone ferryman carries impossible passengers through a country erased from maps.",
    shelf: "The Cabinet of Unfinished Stories",
    tags: ["adventure", "solitary", "mythic", "melancholy", "slow"],
    concernTags: ["grief"],
    coverColor: "#2e4e59",
    coverAccent: "#a7d1c8",
  },
  {
    id: "everyone-is-a-suspect",
    title: "Everyone Is a Suspect",
    creator: "Bea Sharp",
    blurb: "A disastrous family reunion becomes a sparkling locked-room mystery.",
    shelf: "The Rain Room",
    tags: ["mystery", "funny", "family", "fast", "clever"],
    concernTags: [],
    coverColor: "#5b303c",
    coverAccent: "#f1c978",
  },
  {
    id: "garden-of-last-chances",
    title: "The Garden of Last Chances",
    creator: "Mae Rowan",
    blurb: "A grieving botanist grows flowers from choices people wish they could remake.",
    shelf: "The Lantern Shelves",
    tags: ["grief", "hopeful", "quiet", "romance", "magical"],
    concernTags: ["grief"],
    coverColor: "#35563e",
    coverAccent: "#df9ab1",
  },
  {
    id: "the-unfinished-hero",
    title: "The Unfinished Hero",
    creator: "Calder Penn",
    blurb: "A celebrated champion abandons his quest, leaving his village to face the ending.",
    shelf: "The Cabinet of Unfinished Stories",
    tags: ["fantasy", "hero", "grim", "war", "quest"],
    concernTags: ["bleak", "violence"],
    coverColor: "#51402d",
    coverAccent: "#d5b36a",
  },
  {
    id: "midnight-on-platform-nine",
    title: "Midnight on Platform Nine",
    creator: "Lio Winter",
    blurb: "Strangers aboard a train with no destination must decide where they belong.",
    shelf: "The Cabinet of Unfinished Stories",
    tags: ["found-family", "mystery", "hopeful", "travel", "inventive"],
    concernTags: [],
    coverColor: "#2f3859",
    coverAccent: "#d3b96f",
  },
];

export const LAST_BOOKSHOP_CUSTOMERS: LastBookshopCustomer[] = [
  {
    id: "mara",
    name: "Mara Venn",
    role: "Lighthouse keeper",
    portraitColor: "#8fb9c7",
    arrival: "Rain follows her through the door, though the street outside is dry.",
  },
  {
    id: "orin",
    name: "Orin Bell",
    role: "Retired stage magician",
    portraitColor: "#caa6d8",
    arrival: "He removes three gloves from two hands and looks disappointed by the arithmetic.",
  },
  {
    id: "kit",
    name: "Kit Wren",
    role: "Runaway cartographer",
    portraitColor: "#e1ad6d",
    arrival: "Their coat pockets are full of maps to places that deny existing.",
  },
  {
    id: "elsie",
    name: "Elsie Thorn",
    role: "Ghost, recently",
    portraitColor: "#aebbd8",
    arrival: "The bell rings first. Elsie arrives a few seconds later.",
  },
  {
    id: "bram",
    name: "Bram Hearth",
    role: "Night-shift baker",
    portraitColor: "#d6a47b",
    arrival: "He smells of cinnamon, smoke, and a very long day.",
  },
];

export const LAST_BOOKSHOP_ENCOUNTERS: LastBookshopEncounter[] = [
  {
    id: "n1-mara",
    night: 1,
    customerId: "mara",
    request: "I want somewhere enormous to disappear into. Nothing bleak. I have enough storms at home.",
    clues: ["Carries a hand-drawn star chart.", "Keeps glancing toward the quietest corner.", "Returns war stories unopened."],
    likes: ["space", "quiet", "mystery", "hopeful", "solitary"],
    avoids: ["war", "grim", "bleak"],
    shelfIds: ["atlas-of-small-stars", "iron-suns", "tea-at-worlds-end", "salt-crown", "the-quiet-detective", "river-with-no-name"],
    reactions: {
      delighted: "This one has room to breathe. Wrap it in the blue paper.",
      content: "Not what I came for, perhaps. But perhaps that is why I need it.",
      disappointed: "You heard 'enormous.' You missed 'nothing bleak.'",
    },
  },
  {
    id: "n1-orin",
    night: 1,
    customerId: "orin",
    request: "Surprise me, but do not mistake cruelty for cleverness. I have performed that trick myself.",
    clues: ["Laughs at impossible machinery.", "Dislikes stories that take themselves too seriously.", "Asks whether the ending plays fair."],
    likes: ["inventive", "funny", "clever", "mystery", "gentle"],
    avoids: ["grim", "violent", "bleak"],
    shelfIds: ["the-clockwork-orchard", "a-pocketful-of-thunder", "the-quiet-detective", "teeth-of-the-moon", "everyone-is-a-suspect", "the-unfinished-hero"],
    reactions: {
      delighted: "Ah. A secret hidden in plain sight. The only respectable kind.",
      content: "A modest trick, but honestly performed.",
      disappointed: "Shock is easy. Surprise requires grace.",
    },
  },
  {
    id: "n1-bram",
    night: 1,
    customerId: "bram",
    request: "Five minutes without saving the world. People being kind would be enough.",
    clues: ["Has flour on his sleeves.", "Yawns whenever anyone mentions destiny.", "Brought an extra pastry for whoever closes tonight."],
    likes: ["cozy", "food", "community", "gentle", "hopeful"],
    avoids: ["war", "quest", "violent", "grim"],
    shelfIds: ["the-borrowed-kitchen", "tea-at-worlds-end", "iron-suns", "how-to-befriend-a-volcano", "the-unfinished-hero", "garden-of-last-chances"],
    reactions: {
      delighted: "Yes. This feels like a chair by the oven.",
      content: "A little more excitement than I ordered, but the heart is right.",
      disappointed: "I asked for a rest, not another emergency.",
    },
  },
  {
    id: "n2-elsie",
    night: 2,
    customerId: "elsie",
    request: "No tragedies about ghosts, please. I am trying not to make it my whole personality.",
    clues: ["Still laughs at bad jokes.", "Misses noisy family dinners.", "Wants a mystery she cannot solve immediately."],
    likes: ["funny", "family", "mystery", "clever", "community"],
    avoids: ["ghosts", "grief", "bleak", "melancholy"],
    shelfIds: ["letters-to-a-sleeping-city", "everyone-is-a-suspect", "the-clockwork-orchard", "the-borrowed-kitchen", "wolves-under-glass", "the-seventh-summer"],
    reactions: {
      delighted: "A family this chaotic could make anyone feel alive.",
      content: "I did not expect that. Happily, expectations are less binding now.",
      disappointed: "I have already read enough about being dead.",
    },
  },
  {
    id: "n2-kit",
    night: 2,
    customerId: "kit",
    request: "An adventure with no chosen hero and no kingdom waiting to be restored.",
    clues: ["Corrects the shop's oldest map.", "Draws routes around palaces.", "Prefers travelers to conquerors."],
    likes: ["adventure", "travel", "inventive", "found-family", "solitary"],
    avoids: ["hero", "war", "politics", "kingdom", "quest"],
    shelfIds: ["river-with-no-name", "midnight-on-platform-nine", "the-unfinished-hero", "salt-crown", "a-pocketful-of-thunder", "tea-at-worlds-end"],
    reactions: {
      delighted: "A road without a prophecy. Finally.",
      content: "The route wanders, but wandering is not the same as being lost.",
      disappointed: "Another throne. Every map is better after you erase the thrones.",
    },
  },
  {
    id: "n2-mara",
    night: 2,
    customerId: "mara",
    request: "Last night's silence helped. Tonight I can manage company, if they are not too loud.",
    clues: ["The star chart now has one island circled.", "Asks about found families.", "Still avoids battle scenes."],
    likes: ["found-family", "quiet", "hopeful", "travel", "community"],
    avoids: ["war", "violent", "grim"],
    shelfIds: ["midnight-on-platform-nine", "the-borrowed-kitchen", "iron-suns", "the-seventh-summer", "tea-at-worlds-end", "teeth-of-the-moon"],
    reactions: {
      delighted: "Strangers can be quiet together. I had forgotten.",
      content: "I think I can share the journey for a while.",
      disappointed: "There are too many kinds of noise in this one.",
    },
  },
  {
    id: "n3-orin",
    night: 3,
    customerId: "orin",
    request: "I want to be fooled by hope. Make me believe the impossible without making me feel foolish.",
    clues: ["Leaves his trick cane by the door.", "Reads dedications before first chapters.", "No longer asks if the ending plays fair."],
    likes: ["hopeful", "inventive", "magical", "gentle", "mystery"],
    avoids: ["grim", "bleak", "violent"],
    shelfIds: ["garden-of-last-chances", "the-clockwork-orchard", "teeth-of-the-moon", "atlas-of-small-stars", "the-unfinished-hero", "how-to-befriend-a-volcano"],
    reactions: {
      delighted: "Hope: the oldest illusion, and still the finest.",
      content: "I can see the wire. I do not mind.",
      disappointed: "That is despair in a bright costume.",
    },
  },
  {
    id: "n3-elsie",
    night: 3,
    customerId: "elsie",
    request: "Something about leaving without it meaning the end.",
    clues: ["Her reflection appears tonight.", "Keeps the shop door propped open.", "Has stopped avoiding the travel shelves."],
    likes: ["travel", "hopeful", "found-family", "gentle", "mystery"],
    avoids: ["bleak", "grim", "violent"],
    shelfIds: ["midnight-on-platform-nine", "letters-to-a-sleeping-city", "river-with-no-name", "iron-suns", "tea-at-worlds-end", "garden-of-last-chances"],
    reactions: {
      delighted: "A departure with somewhere to arrive. I like that.",
      content: "Perhaps not every unfinished thing is broken.",
      disappointed: "I asked for a door. This feels like a wall.",
    },
  },
  {
    id: "n3-bram",
    night: 3,
    customerId: "bram",
    request: "The apprentice at the bakery thinks she ruins everything. I need a story to leave by her station.",
    clues: ["This book is for someone younger.", "Kindness matters more than perfection.", "A little danger is fine; despair is not."],
    likes: ["young", "gentle", "hopeful", "funny", "family"],
    avoids: ["bleak", "grim", "violent"],
    shelfIds: ["how-to-befriend-a-volcano", "the-clockwork-orchard", "teeth-of-the-moon", "the-unfinished-hero", "the-borrowed-kitchen", "wolves-under-glass"],
    reactions: {
      delighted: "She will pretend not to cry. I will pretend not to notice.",
      content: "There is something useful in this. Thank you.",
      disappointed: "She already believes mistakes are monsters. She does not need proof.",
    },
  },
];

export const PITCH_CHARMS: { id: PitchCharm; label: string; description: string }[] = [
  { id: "mood", label: "Atmospheric", description: "A story for the feeling it leaves behind." },
  { id: "world", label: "Transportive", description: "A world they will want to disappear into." },
  { id: "pace", label: "Gripping", description: "A breathless story that refuses to let go." },
  { id: "surprise", label: "Unexpected", description: "An unusual story whose mystery is the invitation." },
];

export function createAnonymousPlayerId(now = Date.now(), random = Math.random()): string {
  return `shopkeeper-${now.toString(36)}-${Math.floor(random * 0xffffff).toString(36).padStart(5, "0")}`;
}

export function createInitialLastBookshopProgress(anonymousPlayerId: string): LastBookshopProgressV1 {
  return {
    schemaVersion: LAST_BOOKSHOP_PROGRESS_SCHEMA,
    anonymousPlayerId,
    night: 1,
    encounterIndex: 0,
    reputation: 0,
    coins: 12,
    completedEncounterIds: [],
    unlockedDecorations: ["Brass counter bell"],
  };
}

export function restoreLastBookshopProgress(raw: string | null): LastBookshopProgressV1 | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<LastBookshopProgressV1>;
    if (value.schemaVersion !== LAST_BOOKSHOP_PROGRESS_SCHEMA) return null;
    if (typeof value.anonymousPlayerId !== "string" || !value.anonymousPlayerId) return null;
    if (!Number.isInteger(value.night) || Number(value.night) < 1 || Number(value.night) > 4) return null;
    if (!Number.isInteger(value.encounterIndex) || Number(value.encounterIndex) < 0) return null;
    const night = Number(value.night);
    const encounterIndex = Number(value.encounterIndex);
    const validEncounterIndex = night > 3
      ? 0
      : Math.min(encounterIndex, Math.max(0, getEncountersForNight(night).length - 1));
    return {
      schemaVersion: LAST_BOOKSHOP_PROGRESS_SCHEMA,
      anonymousPlayerId: value.anonymousPlayerId,
      night,
      encounterIndex: validEncounterIndex,
      reputation: Number.isFinite(value.reputation) ? Number(value.reputation) : 0,
      coins: Number.isFinite(value.coins) ? Number(value.coins) : 0,
      completedEncounterIds: Array.isArray(value.completedEncounterIds)
        ? value.completedEncounterIds.filter((item): item is string => typeof item === "string")
        : [],
      unlockedDecorations: Array.isArray(value.unlockedDecorations)
        ? value.unlockedDecorations.filter((item): item is string => typeof item === "string")
        : [],
    };
  } catch {
    return null;
  }
}

export function getEncountersForNight(night: number): LastBookshopEncounter[] {
  return LAST_BOOKSHOP_ENCOUNTERS.filter((encounter) => encounter.night === night);
}

export function getWork(workId: string): LastBookshopWork {
  const work = LAST_BOOKSHOP_WORKS.find((candidate) => candidate.id === workId);
  if (!work) throw new Error(`unknown_last_bookshop_work:${workId}`);
  return work;
}

export function getCustomer(customerId: string): LastBookshopCustomer {
  const customer = LAST_BOOKSHOP_CUSTOMERS.find((candidate) => candidate.id === customerId);
  if (!customer) throw new Error(`unknown_last_bookshop_customer:${customerId}`);
  return customer;
}

export function resolveEncounterOutcome(
  encounter: LastBookshopEncounter,
  selectedWorkIds: string[],
): EncounterOutcome {
  if (selectedWorkIds.length !== 3 || new Set(selectedWorkIds).size !== 3) {
    throw new Error("last_bookshop_requires_three_unique_works");
  }

  const scored = selectedWorkIds.map((workId, order) => {
    const work = getWork(workId);
    const positiveMatches = work.tags.filter((tag) => encounter.likes.includes(tag)).length;
    const avoidMatches = work.tags.filter((tag) => encounter.avoids.includes(tag)).length
      + work.concernTags.filter((tag) => encounter.avoids.includes(tag)).length;
    return {
      work,
      score: positiveMatches * 3 - avoidMatches * 6 - order * 0.01,
      violations: [...work.tags, ...work.concernTags].filter((tag) => encounter.avoids.includes(tag)),
    };
  }).sort((left, right) => right.score - left.score);

  const allShelves = new Set(selectedWorkIds.map((workId) => getWork(workId).shelf));
  return {
    chosenWorkId: scored[0].work.id,
    choiceScore: scored[0].score,
    boundaryViolations: Array.from(new Set(scored.flatMap((entry) => entry.violations))),
    selectionDiversity: allShelves.size,
  };
}

export function calculateRoundReward(
  predictedWorkId: string,
  outcome: EncounterOutcome,
): { reputation: number; coins: number } {
  const predictionBonus = predictedWorkId === outcome.chosenWorkId ? 3 : 0;
  const careBonus = outcome.boundaryViolations.length === 0 ? 2 : 0;
  const varietyBonus = outcome.selectionDiversity >= 2 ? 1 : 0;
  const reputation = Math.max(1, predictionBonus + careBonus + varietyBonus);
  return { reputation, coins: 4 + reputation };
}

export function advanceLastBookshopProgress(
  progress: LastBookshopProgressV1,
  encounter: LastBookshopEncounter,
  reward: { reputation: number; coins: number },
): LastBookshopProgressV1 {
  const nightEncounters = getEncountersForNight(progress.night);
  const isLastEncounter = progress.encounterIndex >= nightEncounters.length - 1;
  const nextReputation = progress.reputation + reward.reputation;
  const unlocked = new Set(progress.unlockedDecorations);
  if (nextReputation >= 10) unlocked.add("Rain-glass window");
  if (nextReputation >= 20) unlocked.add("Clockwork moth lamp");
  if (nextReputation >= 30) unlocked.add("Door to the hidden stacks");
  return {
    ...progress,
    night: isLastEncounter ? progress.night + 1 : progress.night,
    encounterIndex: isLastEncounter ? 0 : progress.encounterIndex + 1,
    reputation: nextReputation,
    coins: progress.coins + reward.coins,
    completedEncounterIds: Array.from(new Set([...progress.completedEncounterIds, encounter.id])),
    unlockedDecorations: Array.from(unlocked),
  };
}

export function createRecommendationGameEvent(args: {
  progress: LastBookshopProgressV1;
  encounter: LastBookshopEncounter;
  selectedWorkIds: string[];
  predictedWorkId: string;
  confidence: ConfidenceLevel;
  pitchCharm: PitchCharm;
  outcome: EncounterOutcome;
  reward: { reputation: number; coins: number };
  gameSessionId: string;
  startedAtMs: number;
  occurredAt?: string;
}): RecommendationGameEventV1 {
  const occurredAt = args.occurredAt || new Date().toISOString();
  return {
    schemaVersion: RECOMMENDATION_GAME_EVENT_SCHEMA,
    eventId: `lb-${args.progress.anonymousPlayerId}-${args.encounter.id}`,
    gameId: "the_last_bookshop",
    gameVersion: "vertical_slice_v1",
    gameSessionId: args.gameSessionId,
    anonymousPlayerId: args.progress.anonymousPlayerId,
    scenarioId: args.encounter.id,
    occurredAt,
    presentedCandidateIds: [...args.encounter.shelfIds],
    selectedCandidateIds: [...args.selectedWorkIds],
    selectedOrder: [...args.selectedWorkIds],
    predictedCustomerChoiceId: args.predictedWorkId,
    simulatedCustomerChoiceId: args.outcome.chosenWorkId,
    confidence: args.confidence,
    reasonTags: [args.pitchCharm],
    responseTimeMs: Math.max(0, Date.now() - args.startedAtMs),
    outcome: {
      predictionCorrect: args.predictedWorkId === args.outcome.chosenWorkId,
      boundaryViolations: [...args.outcome.boundaryViolations],
      selectionDiversity: args.outcome.selectionDiversity,
      reputationEarned: args.reward.reputation,
    },
    presentationOrder: [...args.encounter.shelfIds],
    gameContext: {
      night: args.encounter.night,
      customerId: args.encounter.customerId,
      customerRole: getCustomer(args.encounter.customerId).role,
    },
  };
}

export function isRecommendationGameEventV1(value: unknown): value is RecommendationGameEventV1 {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const event = value as Partial<RecommendationGameEventV1>;
  const selectedIds = Array.isArray(event.selectedCandidateIds) ? event.selectedCandidateIds : [];
  const presentedIds = Array.isArray(event.presentedCandidateIds) ? event.presentedCandidateIds : [];
  const pitchCharms: PitchCharm[] = ["mood", "world", "pace", "surprise"];
  const occurredAtMs = Date.parse(String(event.occurredAt || ""));
  const encounter = LAST_BOOKSHOP_ENCOUNTERS.find((candidate) => candidate.id === event.scenarioId);
  const customer = encounter ? getCustomer(encounter.customerId) : null;
  const expectedEventId = `lb-${event.anonymousPlayerId}-${event.scenarioId}`;
  const selectedIdsAreResolvable = Boolean(encounter)
    && selectedIds.length === 3
    && new Set(selectedIds).size === 3
    && selectedIds.every((id) => typeof id === "string" && encounter?.shelfIds.includes(id));
  const outcome = encounter && selectedIdsAreResolvable
    ? resolveEncounterOutcome(encounter, selectedIds)
    : null;
  const expectedReward = outcome && typeof event.predictedCustomerChoiceId === "string"
    ? calculateRoundReward(event.predictedCustomerChoiceId, outcome)
    : null;
  return event.schemaVersion === RECOMMENDATION_GAME_EVENT_SCHEMA
    && event.gameId === "the_last_bookshop"
    && event.gameVersion === "vertical_slice_v1"
    && typeof event.eventId === "string"
    && event.eventId === expectedEventId
    && typeof event.gameSessionId === "string"
    && /^lbs-[a-z0-9-]{4,100}$/.test(event.gameSessionId)
    && typeof event.anonymousPlayerId === "string"
    && /^shopkeeper-[a-z0-9-]{4,100}$/.test(event.anonymousPlayerId)
    && typeof event.scenarioId === "string"
    && Boolean(encounter)
    && Number.isFinite(occurredAtMs)
    && presentedIds.length === encounter?.shelfIds.length
    && presentedIds.every((id, index) => id === encounter?.shelfIds[index])
    && selectedIds.length === 3
    && new Set(selectedIds).size === 3
    && selectedIds.every((id) => typeof id === "string" && presentedIds.includes(id))
    && Array.isArray(event.selectedOrder)
    && event.selectedOrder.length === selectedIds.length
    && event.selectedOrder.every((id, index) => id === selectedIds[index])
    && typeof event.predictedCustomerChoiceId === "string"
    && selectedIds.includes(event.predictedCustomerChoiceId)
    && typeof event.simulatedCustomerChoiceId === "string"
    && event.simulatedCustomerChoiceId === outcome?.chosenWorkId
    && ["low", "medium", "high"].includes(String(event.confidence))
    && Array.isArray(event.reasonTags)
    && event.reasonTags.length > 0
    && event.reasonTags.every((tag) => pitchCharms.includes(tag))
    && typeof event.responseTimeMs === "number"
    && Number.isFinite(event.responseTimeMs)
    && event.responseTimeMs >= 0
    && Boolean(event.outcome)
    && event.outcome?.predictionCorrect === (event.predictedCustomerChoiceId === event.simulatedCustomerChoiceId)
    && Array.isArray(event.outcome?.boundaryViolations)
    && event.outcome.boundaryViolations.length === outcome?.boundaryViolations.length
    && event.outcome.boundaryViolations.every((tag, index) => tag === outcome?.boundaryViolations[index])
    && event.outcome?.selectionDiversity === outcome?.selectionDiversity
    && event.outcome?.reputationEarned === expectedReward?.reputation
    && Array.isArray(event.presentationOrder)
    && event.presentationOrder.length === presentedIds.length
    && event.presentationOrder.every((id, index) => id === presentedIds[index])
    && Boolean(event.gameContext)
    && event.gameContext?.night === encounter?.night
    && event.gameContext?.customerId === encounter?.customerId
    && event.gameContext?.customerRole === customer?.role;
}

export function normalizeRecommendationGameEventV1(value: unknown): RecommendationGameEventV1 | null {
  if (!isRecommendationGameEventV1(value)) return null;
  return {
    schemaVersion: value.schemaVersion,
    eventId: value.eventId,
    gameId: value.gameId,
    gameVersion: value.gameVersion,
    gameSessionId: value.gameSessionId,
    anonymousPlayerId: value.anonymousPlayerId,
    scenarioId: value.scenarioId,
    occurredAt: value.occurredAt,
    presentedCandidateIds: [...value.presentedCandidateIds],
    selectedCandidateIds: [...value.selectedCandidateIds],
    selectedOrder: [...value.selectedOrder],
    predictedCustomerChoiceId: value.predictedCustomerChoiceId,
    simulatedCustomerChoiceId: value.simulatedCustomerChoiceId,
    confidence: value.confidence,
    reasonTags: [...value.reasonTags],
    responseTimeMs: value.responseTimeMs,
    outcome: {
      predictionCorrect: value.outcome.predictionCorrect,
      boundaryViolations: [...value.outcome.boundaryViolations],
      selectionDiversity: value.outcome.selectionDiversity,
      reputationEarned: value.outcome.reputationEarned,
    },
    presentationOrder: [...value.presentationOrder],
    gameContext: {
      night: value.gameContext.night,
      customerId: value.gameContext.customerId,
      customerRole: value.gameContext.customerRole,
    },
  };
}
