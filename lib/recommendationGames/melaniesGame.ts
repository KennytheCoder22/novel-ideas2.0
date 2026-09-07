import type { AgeBandV2, SwipeSignalV2 } from "../../app/recommender-v2";

export const MELANIES_GAME_VERSION = "melanies_game_v1" as const;
export const MELANIES_GAME_BANK_VERSION = "melanies_concepts_v1" as const;
export const MELANIES_GAME_SAVE_SCHEMA = "melanies_game_save_v1" as const;
export const MELANIES_GAME_EVIDENCE_SCHEMA = "melanies_game_evidence_v1" as const;

export type MelanieDimension =
  | "speculation"
  | "darkness"
  | "humor"
  | "romance"
  | "mystery"
  | "scale"
  | "emotion"
  | "pace"
  | "character";

export type MelanieAttributes = Record<MelanieDimension, -2 | -1 | 0 | 1 | 2> & {
  genres: string[];
  tones: string[];
  themes: string[];
  dynamics: string[];
  settings: string[];
};

export type MelanieConcept = {
  id: string;
  ageBand: AgeBandV2;
  title: string;
  synopsis: string;
  palette: readonly [string, string];
  attributes: MelanieAttributes;
};

type ConceptSeed = [
  id: string,
  title: string,
  synopsis: string,
  genres: string[],
  tones: string[],
  themes: string[],
  dynamics: string[],
  settings: string[],
  axes: [number, number, number, number, number, number, number, number, number],
];

const PALETTES: readonly (readonly [string, string])[] = [
  ["#ffbd67", "#542f6f"], ["#62d8d5", "#183b63"], ["#e783a9", "#523157"], ["#bfdc71", "#254c48"],
  ["#f4d06f", "#734735"], ["#8db9ff", "#263869"], ["#f59b72", "#633047"], ["#a4e6c1", "#2e5261"],
];

const seeds: Record<AgeBandV2, ConceptSeed[]> = {
  kids: [
    ["k-cloud-library", "The Library Above the Clouds", "A shy kite-maker discovers a floating library whose books can change tomorrow's weather.", ["fantasy", "adventure"], ["hopeful", "whimsical"], ["courage", "books"], ["friendship"], ["sky", "library"], [2, -2, 1, -2, 1, 1, 1, 0, 1]],
    ["k-lunchbox-detectives", "The Lunchbox Detectives", "Two best friends investigate why everyone's lunches are being swapped before the school bell rings.", ["mystery", "realistic fiction"], ["funny", "warm"], ["school", "problem solving"], ["friendship"], ["school"], [-2, -2, 2, -2, 2, -2, 0, 1, 1]],
    ["k-moon-whale", "The Moon Whale", "A child sails across a silver sea to return a lost baby whale to the moon.", ["fantasy", "adventure"], ["gentle", "wonder-filled"], ["kindness", "journey"], ["companionship"], ["ocean", "moon"], [2, -2, 0, -2, 0, 1, 2, 0, 1]],
    ["k-garden-robots", "Robots in the Radish Patch", "A gardening club builds tiny robots that become much better at growing trouble than vegetables.", ["science fiction", "comedy"], ["playful", "bright"], ["invention", "teamwork"], ["ensemble cast"], ["garden", "school"], [1, -2, 2, -2, 0, -1, 0, 2, 0]],
    ["k-night-bus", "The Night Bus to Anywhere", "A brave passenger boards a bus whose next stop is chosen by the story they tell.", ["fantasy", "adventure"], ["cozy", "curious"], ["storytelling", "courage"], ["found family"], ["magical city"], [2, -1, 1, -2, 1, 1, 1, 1, 1]],
    ["k-dinosaur-neighbor", "My Neighbor Is a Dinosaur", "A careful kid tries to keep the enormous new neighbor's identity secret during the town picnic.", ["comedy", "fantasy"], ["silly", "warm"], ["belonging", "secrets"], ["friendship"], ["small town"], [1, -2, 2, -2, 1, -1, 1, 1, 2]],
    ["k-clock-mice", "The Clock Tower Mice", "A family of mice must repair the town clock before a storm arrives at midnight.", ["adventure"], ["tense", "hopeful"], ["family", "ingenuity"], ["family"], ["clock tower"], [0, 0, 0, -2, 1, 0, 1, 2, 1]],
    ["k-sea-post", "Postcards from the Deep", "A young diver follows mysterious postcards to creatures building a city beneath the reef.", ["adventure", "mystery"], ["wonder-filled", "gentle"], ["discovery", "ocean"], ["companionship"], ["underwater"], [1, -1, 0, -2, 2, 1, 1, 1, 0]],
    ["k-wild-choir", "The Wildwood Choir", "Forest animals who cannot agree on a song learn to make music without sounding the same.", ["animal story"], ["funny", "heartfelt"], ["creativity", "cooperation"], ["ensemble cast"], ["forest"], [0, -2, 2, -2, 0, -1, 2, 0, 2]],
    ["k-castle-puddles", "The Castle of Puddles", "A practical princess must save a soggy kingdom using maps, boots, and one very stubborn duck.", ["fantasy", "comedy"], ["playful", "adventurous"], ["leadership", "problem solving"], ["companionship"], ["kingdom"], [2, -1, 2, -2, 0, 1, 0, 2, 0]],
    ["k-secret-seed", "The Secret in the Seed Packet", "A child plants an unlabeled seed and wakes to find a doorway growing in the backyard.", ["fantasy", "mystery"], ["gentle", "curious"], ["nature", "discovery"], ["family"], ["home", "hidden world"], [2, -2, 0, -2, 2, 0, 1, 0, 2]],
    ["k-snow-day", "The Longest Snow Day", "Three siblings turn a power outage into a neighborhood-wide quest for warmth and pancakes.", ["realistic fiction", "adventure"], ["cozy", "funny"], ["community", "resourcefulness"], ["family", "community"], ["neighborhood"], [-2, -1, 2, -2, 0, -1, 1, 1, 2]],
    ["k-paper-dragon", "The Paper Dragon Parade", "An artist's paper dragon comes alive and refuses to follow the parade route.", ["fantasy", "comedy"], ["colorful", "playful"], ["art", "independence"], ["friendship"], ["city festival"], [2, -2, 2, -2, 0, 0, 1, 2, 1]],
    ["k-island-race", "Race Around Pebble Island", "A cautious rabbit and a fearless turtle enter a race where every shortcut hides a puzzle.", ["animal story", "adventure"], ["exciting", "funny"], ["perseverance", "puzzles"], ["rivals"], ["island"], [0, -1, 1, -2, 1, 1, 0, 2, 0]],
    ["k-grandma-map", "Grandma's Impossible Map", "A grandchild follows a hand-drawn map through ordinary places that hold extraordinary family stories.", ["realistic fiction"], ["warm", "reflective"], ["family", "memory"], ["family"], ["town"], [-1, -2, 0, -2, 0, -1, 2, -1, 2]],
    ["k-monster-window", "The Monster Outside My Window", "A nervous child realizes the nightly monster is trying to warn the whole apartment building.", ["fantasy", "mystery"], ["spooky", "hopeful"], ["bravery", "misunderstanding"], ["community"], ["apartment building"], [2, 1, 0, -2, 2, 0, 1, 1, 1]],
  ],
  preteens: [
    ["p-lost-frequency", "The Lost Frequency", "Three friends build a radio that receives broadcasts from their town exactly one week in the future.", ["science fiction", "mystery"], ["tense", "clever"], ["friendship", "consequences"], ["friendship"], ["small town"], [2, 0, 0, -2, 2, 0, 1, 2, 1]],
    ["p-dragons-debate", "Dragons on the Debate Team", "A rule-following student discovers the new debate champions are dragons hiding in plain sight.", ["fantasy", "comedy"], ["funny", "energetic"], ["school", "belonging"], ["rivals", "team"], ["school"], [2, -1, 2, -2, 1, -1, 0, 2, 1]],
    ["p-below-station", "Below Platform Nine", "A subway explorer finds a sealed station where forgotten city stories keep walking.", ["urban fantasy", "mystery"], ["atmospheric", "spooky"], ["memory", "city"], ["companionship"], ["underground city"], [2, 1, 0, -2, 2, 0, 2, 1, 1]],
    ["p-zero-gravity", "Zero-Gravity Summer", "Cousins at an orbital camp race to repair a garden before the station loses its food supply.", ["science fiction", "adventure"], ["exciting", "hopeful"], ["family", "survival"], ["family", "team"], ["space station"], [2, 0, 1, -2, 0, 1, 1, 2, 0]],
    ["p-river-secret", "The River Keeps a Secret", "A young kayaker searches for a missing environmental scientist along a river that floods overnight.", ["realistic mystery", "adventure"], ["tense", "grounded"], ["environment", "courage"], ["family"], ["river wilderness"], [-2, 1, 0, -2, 2, 1, 1, 2, 0]],
    ["p-bakery-ghost", "The Ghost in the Bakery", "A skeptical baker's apprentice must solve a century-old recipe before a friendly ghost fades away.", ["mystery", "fantasy"], ["cozy", "heartfelt"], ["food", "memory"], ["intergenerational friendship"], ["bakery"], [1, -1, 1, -2, 2, -1, 2, 0, 2]],
    ["p-rulebook", "The Rulebook for Runaways", "Four students trapped overnight in a museum invent rules for surviving exhibits that refuse to stay still.", ["adventure", "fantasy"], ["funny", "suspenseful"], ["teamwork", "history"], ["ensemble cast"], ["museum"], [2, 0, 2, -2, 1, 0, 1, 2, 0]],
    ["p-lake-house", "Messages from Lake House", "A new kid finds notes hidden in a rental cottage from someone who stayed there twenty years earlier.", ["realistic fiction", "mystery"], ["nostalgic", "gentle"], ["identity", "family"], ["friendship"], ["lakeside town"], [-2, -1, 0, -1, 2, -1, 2, -1, 2]],
    ["p-moth-kingdom", "The Kingdom of Moths", "A reluctant heir enters a moonlit kingdom where promises become visible wings.", ["fantasy"], ["lush", "melancholic"], ["duty", "freedom"], ["family"], ["enchanted kingdom"], [2, 0, 0, 0, 1, 2, 2, 0, 2]],
    ["p-skate-code", "The Skatepark Code", "A coder and a skateboarder team up to expose who is sabotaging their community competition.", ["realistic fiction", "mystery"], ["fast", "funny"], ["community", "fairness"], ["friendship"], ["city"], [-2, -1, 1, -2, 2, -1, 1, 2, 1]],
    ["p-last-treehouse", "The Last Treehouse", "Neighbors defend an enormous treehouse while uncovering why every bird in town has vanished.", ["adventure", "mystery"], ["hopeful", "urgent"], ["environment", "community"], ["ensemble cast"], ["suburb", "forest"], [-1, 0, 0, -2, 2, 0, 1, 2, 0]],
    ["p-pocket-universe", "A Universe in My Pocket", "A science fair project opens a tiny universe whose inhabitants start sending requests for help.", ["science fiction"], ["wonder-filled", "thoughtful"], ["responsibility", "invention"], ["solitary"], ["school", "micro-universe"], [2, 0, 0, -2, 1, 2, 2, 0, 2]],
    ["p-midnight-league", "The Midnight League", "Young athletes discover their championship opponents practice impossible sports after dark.", ["sports", "fantasy"], ["energetic", "mysterious"], ["competition", "confidence"], ["team", "rivals"], ["city"], [1, 0, 1, -2, 1, 0, 0, 2, 0]],
    ["p-coral-cipher", "The Coral Cipher", "A puzzle-loving diver decodes a warning hidden in the changing colors of a coral reef.", ["adventure", "mystery"], ["bright", "suspenseful"], ["environment", "puzzles"], ["family"], ["island", "ocean"], [-1, 0, 0, -2, 2, 1, 1, 2, 1]],
    ["p-ordinary-hero", "An Extremely Ordinary Hero", "The only child without powers at hero school may be the only one who notices the villain's simple trick.", ["fantasy", "comedy"], ["funny", "hopeful"], ["identity", "ingenuity"], ["school friends"], ["hero school"], [2, -1, 2, -2, 1, 0, 1, 2, 2]],
    ["p-winter-letters", "Letters from the Winter Road", "Siblings crossing the country to find their father receive letters predicting each stop before they arrive.", ["road adventure", "mystery"], ["emotional", "tense"], ["family", "hope"], ["family"], ["road trip"], [-1, 1, 0, -2, 2, 1, 2, 1, 2]],
  ],
  teens: [
    ["t-memory-orchard", "The Glass Orchard", "A botanist's daughter discovers that an abandoned greenhouse grows fruit containing other people's memories.", ["speculative fiction", "mystery"], ["lush", "unsettling"], ["memory", "identity"], ["family"], ["greenhouse"], [2, 1, 0, 0, 2, 0, 2, 0, 2]],
    ["t-last-train", "The Last Train North", "A student boards an overnight train where every passenger remembers a different version of the same missing town.", ["mystery", "speculative fiction"], ["atmospheric", "tense"], ["truth", "memory"], ["ensemble cast"], ["train"], [2, 1, 0, 0, 2, 1, 2, 1, 1]],
    ["t-borrowed-summer", "The Borrowed Summer", "Two former best friends share one last summer job restoring a closed seaside theater.", ["contemporary fiction", "romance"], ["bittersweet", "warm"], ["friendship", "second chances"], ["friends to lovers"], ["seaside town"], [-2, -1, 1, 2, 0, -1, 2, -1, 2]],
    ["t-archive-zero", "Archive Zero", "Teen hackers uncover a public archive that has quietly erased one person from every year of history.", ["science fiction", "thriller"], ["urgent", "cerebral"], ["power", "history"], ["team"], ["near-future city"], [1, 1, 0, 0, 2, 2, 1, 2, 0]],
    ["t-sunken-saint", "The Sunken Saint", "A skeptical diver joins a pilgrimage to a drowned city that appears for one night each decade.", ["fantasy", "adventure"], ["mythic", "melancholic"], ["faith", "loss"], ["rivals"], ["drowned city"], [2, 1, 0, 1, 1, 2, 2, 1, 1]],
    ["t-breakup-club", "The Breakup Club", "Four students make a pact to avoid romance and immediately become tangled in everyone else's love stories.", ["contemporary fiction", "comedy"], ["funny", "heartfelt"], ["friendship", "love"], ["ensemble cast", "romance"], ["school"], [-2, -1, 2, 2, 0, -1, 2, 1, 2]],
    ["t-wolves-signal", "When the Wolves Signal", "A wilderness volunteer follows impossible radio calls during a week-long search for a missing hiker.", ["thriller", "mystery"], ["dark", "claustrophobic"], ["survival", "trust"], ["solitary"], ["mountains"], [0, 2, 0, 0, 2, 0, 2, 2, 2]],
    ["t-paper-rebellion", "The Paper Rebellion", "In a city where laws rewrite themselves nightly, student printers circulate a newspaper that cannot be altered.", ["dystopian", "fantasy"], ["defiant", "fast"], ["resistance", "truth"], ["found family"], ["fantasy city"], [2, 1, 1, 1, 1, 2, 1, 2, 0]],
    ["t-orbit-hearts", "Hearts in Low Orbit", "Rival cadets stranded on a damaged moon shuttle must trust each other before their oxygen runs out.", ["science fiction", "romance"], ["tense", "witty"], ["trust", "survival"], ["rivals to lovers"], ["space"], [2, 1, 1, 2, 0, 1, 2, 2, 1]],
    ["t-small-gods", "Small Gods of Cedar Street", "Neighborhood teens discover that every neglected place has a minor god who remembers who abandoned it.", ["urban fantasy"], ["strange", "hopeful"], ["community", "belonging"], ["ensemble cast"], ["neighborhood"], [2, 0, 1, 0, 1, 0, 2, 0, 2]],
    ["t-dead-language", "A Language for the Dead", "A scholarship student at an elite school learns its oldest debate club can speak with historical witnesses.", ["dark academia", "mystery"], ["gothic", "cerebral"], ["ambition", "truth"], ["rivals"], ["boarding school"], [2, 1, 0, 1, 2, 0, 2, -1, 2]],
    ["t-fire-season", "Fire Season", "Two siblings on opposite sides of a town conflict race to expose the cause of suspicious wildfires.", ["contemporary thriller"], ["urgent", "emotional"], ["family", "environment"], ["family"], ["rural town"], [-2, 1, 0, 0, 2, 0, 2, 2, 1]],
    ["t-monster-documentary", "A Documentary About Monsters", "A student film crew discovers their fake monster footage keeps capturing something real in the background.", ["horror", "comedy"], ["creepy", "funny"], ["art", "fear"], ["friend group"], ["small town"], [1, 2, 2, 0, 2, -1, 1, 2, 0]],
    ["t-deep-blue", "Deep Blue Static", "A competitive swimmer begins hearing music underwater that leads to a decades-old local secret.", ["contemporary mystery"], ["dreamlike", "intense"], ["ambition", "grief"], ["family"], ["coastal city"], [-1, 1, 0, 1, 2, -1, 2, 1, 2]],
    ["t-crownless", "The Crownless Tournament", "Heirs from rival kingdoms compete for a throne until one contestant proposes that nobody should win.", ["fantasy"], ["epic", "clever"], ["power", "loyalty"], ["rivals", "ensemble cast"], ["kingdoms"], [2, 1, 1, 1, 1, 2, 1, 2, 0]],
    ["t-after-party", "After the Last Party", "Five friends reconstruct one missing hour from the party that ended their final summer together.", ["contemporary mystery"], ["bittersweet", "suspenseful"], ["friendship", "memory"], ["ensemble cast"], ["lake town"], [-2, 1, 0, 1, 2, -1, 2, 0, 2]],
  ],
  adult: [
    ["a-north-train", "The Last Train North", "A woman boards an overnight train where every passenger remembers a different version of the same missing town.", ["literary mystery", "speculative fiction"], ["atmospheric", "unsettling"], ["memory", "truth"], ["ensemble cast"], ["train", "remote town"], [2, 1, 0, 0, 2, 1, 2, 0, 2]],
    ["a-glass-orchard", "The Glass Orchard", "A botanist discovers that trees in an abandoned greenhouse grow fruit containing other people's memories.", ["speculative fiction", "mystery"], ["lush", "melancholic"], ["memory", "ethics"], ["solitary"], ["greenhouse"], [2, 1, 0, 0, 2, 0, 2, -1, 2]],
    ["a-second-kitchen", "The Second Kitchen", "Estranged siblings inherit a restaurant that serves one forgotten meal from each diner's past.", ["contemporary fiction", "magical realism"], ["warm", "bittersweet"], ["family", "food"], ["family"], ["city restaurant"], [1, -1, 1, 1, 0, -1, 2, -1, 2]],
    ["a-quiet-coup", "The Quiet Coup", "A municipal clerk notices tiny changes in public records that point to a government takeover nobody else can see.", ["political thriller"], ["tense", "cerebral"], ["power", "truth"], ["solitary"], ["capital city"], [-1, 2, 0, 0, 2, 2, 1, 1, 2]],
    ["a-house-tides", "The House That Kept the Tides", "Three generations return to a coastal home whose rooms rearrange themselves with the moon.", ["family saga", "magical realism"], ["gothic", "emotional"], ["inheritance", "family"], ["family"], ["coastal house"], [1, 1, 0, 1, 1, 0, 2, -1, 2]],
    ["a-courier-mars", "The Last Courier on Mars", "A cynical courier crosses abandoned settlements to deliver a package addressed to someone born tomorrow.", ["science fiction", "adventure"], ["wry", "lonely"], ["hope", "survival"], ["solitary"], ["Mars"], [2, 0, 1, 0, 1, 2, 1, 2, 0]],
    ["a-village-murders", "The Village Murder Society", "Retired neighbors investigate a suspicious death while fiercely competing over the annual garden prize.", ["cozy mystery", "comedy"], ["witty", "cozy"], ["community", "aging"], ["ensemble cast"], ["village"], [-2, -1, 2, 0, 2, -1, 1, 0, 1]],
    ["a-salt-parliament", "The Parliament of Salt", "A diplomat must negotiate peace among island nations as the ocean begins returning their buried histories.", ["fantasy", "political fiction"], ["epic", "reflective"], ["history", "power"], ["ensemble cast"], ["island nations"], [2, 1, 0, 1, 1, 2, 2, -1, 1]],
    ["a-unfinished-film", "The Unfinished Film", "A film editor discovers that discarded footage from a vanished director predicts crimes before they happen.", ["thriller", "mystery"], ["dark", "propulsive"], ["art", "obsession"], ["solitary"], ["film studio", "city"], [0, 2, 0, 0, 2, 0, 2, 2, 2]],
    ["a-three-weddings", "Three Weddings and a Flood", "Former friends reunite for a wedding weekend just as a flood cuts their hotel off from the world.", ["romantic comedy", "contemporary fiction"], ["funny", "warm"], ["friendship", "second chances"], ["ensemble cast", "romance"], ["country hotel"], [-2, -1, 2, 2, 0, -1, 2, 1, 2]],
    ["a-hollow-archive", "The Hollow Archive", "An archivist catalogs letters from a failed polar expedition and realizes one writer is still answering.", ["historical mystery", "horror"], ["bleak", "atmospheric"], ["isolation", "history"], ["solitary"], ["archive", "polar landscape"], [1, 2, 0, 0, 2, 0, 2, -1, 2]],
    ["a-algorithm-love", "The Compatibility Error", "Two engineers ordered apart by a perfect matchmaking system decide to test whether it can be wrong.", ["romance", "science fiction"], ["witty", "thoughtful"], ["choice", "technology"], ["romance"], ["near-future city"], [1, -1, 2, 2, 0, -1, 2, 0, 2]],
    ["a-wildfire-line", "The Wildfire Line", "A rookie investigator joins a remote fire crew after a blaze exposes evidence of a decades-old disappearance.", ["mystery", "adventure"], ["intense", "grounded"], ["community", "justice"], ["team"], ["mountains"], [-2, 1, 0, 0, 2, 1, 2, 2, 1]],
    ["a-city-sleeps", "When the City Sleeps", "Every resident falls asleep for one hour except six strangers who must decide what to do with the silence.", ["speculative fiction"], ["surreal", "intimate"], ["morality", "loneliness"], ["ensemble cast"], ["city"], [2, 0, 0, 1, 1, 0, 2, -1, 2]],
    ["a-false-biographer", "The False Biographer", "A writer hired to polish a celebrated scientist's life finds proof that the greatest discovery belonged to someone else.", ["literary mystery"], ["cerebral", "tense"], ["ambition", "authorship"], ["rivals"], ["university"], [-2, 1, 0, 0, 2, -1, 2, -1, 2]],
    ["a-after-harvest", "After the Harvest Moon", "A widowed farmer and a traveling astronomer search for the source of lights beneath the fields.", ["romance", "speculative fiction"], ["tender", "mysterious"], ["grief", "renewal"], ["romance"], ["rural valley"], [1, 0, 0, 2, 2, -1, 2, -1, 2]],
  ],
};

const DIMENSIONS: MelanieDimension[] = [
  "speculation", "darkness", "humor", "romance", "mystery", "scale", "emotion", "pace", "character",
];

function makeConcept(ageBand: AgeBandV2, seed: ConceptSeed, index: number): MelanieConcept {
  const [id, title, synopsis, genres, tones, themes, dynamics, settings, axes] = seed;
  return {
    id,
    ageBand,
    title,
    synopsis,
    palette: PALETTES[index % PALETTES.length],
    attributes: {
      genres, tones, themes, dynamics, settings,
      speculation: axes[0] as MelanieAttributes["speculation"],
      darkness: axes[1] as MelanieAttributes["darkness"],
      humor: axes[2] as MelanieAttributes["humor"],
      romance: axes[3] as MelanieAttributes["romance"],
      mystery: axes[4] as MelanieAttributes["mystery"],
      scale: axes[5] as MelanieAttributes["scale"],
      emotion: axes[6] as MelanieAttributes["emotion"],
      pace: axes[7] as MelanieAttributes["pace"],
      character: axes[8] as MelanieAttributes["character"],
    },
  };
}

export const MELANIES_CONCEPTS: Record<AgeBandV2, MelanieConcept[]> = {
  kids: seeds.kids.map((seed, index) => makeConcept("kids", seed, index)),
  preteens: seeds.preteens.map((seed, index) => makeConcept("preteens", seed, index)),
  teens: seeds.teens.map((seed, index) => makeConcept("teens", seed, index)),
  adult: seeds.adult.map((seed, index) => makeConcept("adult", seed, index)),
};

export type MelaniePresentationEvidence = {
  schemaVersion: typeof MELANIES_GAME_EVIDENCE_SCHEMA;
  presentationId: string;
  round: 1 | 2 | 3;
  occurredAt: string;
  presented: { id: string; attributes: MelanieAttributes }[];
  selectedIds: string[];
  nonSelectedIds: string[];
  ranking: string[];
  survivorIds: string[];
  challengerIds: string[];
  outcomes: { winnerId: string; loserId: string; distinguishingDimensions: MelanieDimension[] }[];
  context: {
    anonymousPlayerId: string;
    libraryId: string;
    ageBand: AgeBandV2;
    gameSessionId: string;
    bankVersion: typeof MELANIES_GAME_BANK_VERSION;
  };
};

export type MelanieRecommendationSnapshot = {
  id: string;
  source: string;
  sourceId: string | null;
  title: string;
  author: string;
  rank: number;
  position: "strongest" | "strong" | "adventurous";
  coverUrl: string | null;
  description: string | null;
  reason: string;
};

export type MelanieStage = "choose-1" | "rank-1" | "choose-2" | "rank-2" | "final" | "recommendations";

export type MelanieGameState = {
  schemaVersion: typeof MELANIES_GAME_SAVE_SCHEMA;
  gameVersion: typeof MELANIES_GAME_VERSION;
  bankVersion: typeof MELANIES_GAME_BANK_VERSION;
  anonymousPlayerId: string;
  libraryId: string;
  ageBand: AgeBandV2;
  gameSessionId: string;
  introDismissed: boolean;
  stage: MelanieStage;
  currentConceptIds: string[];
  selectedIds: string[];
  ranking: string[];
  survivorIds: string[];
  seenConceptIds: string[];
  evidence: MelaniePresentationEvidence[];
  recommendations: MelanieRecommendationSnapshot[];
  recommendationShownAt: string | null;
  finalRecommendationRanking: string[];
  finalPreferredBookId: string | null;
  finalFeedbackInteracted: boolean;
  feedbackRecorded: boolean;
  startedAt: string;
  updatedAt: string;
};

function hash(value: string): number {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result = Math.imul(result ^ value.charCodeAt(index), 16777619);
  }
  return result >>> 0;
}

function deterministicOrder<T extends { id: string }>(values: readonly T[], seed: string): T[] {
  return [...values].sort((left, right) => hash(`${seed}:${left.id}`) - hash(`${seed}:${right.id}`) || left.id.localeCompare(right.id));
}

export function createMelanieGameSessionId(now = Date.now(), entropy = Math.random()): string {
  return `melanie-${now.toString(36)}-${Math.floor(entropy * 0xffffffff).toString(36).padStart(6, "0")}`;
}

export function createInitialMelanieGame(args: {
  anonymousPlayerId: string;
  libraryId: string;
  ageBand: AgeBandV2;
  gameSessionId?: string;
  now?: string;
}): MelanieGameState {
  const now = args.now || new Date().toISOString();
  const gameSessionId = args.gameSessionId || createMelanieGameSessionId();
  const seed = `${args.anonymousPlayerId}:${args.libraryId}:${args.ageBand}:${gameSessionId}:opening`;
  const currentConceptIds = deterministicOrder(MELANIES_CONCEPTS[args.ageBand], seed).slice(0, 6).map((concept) => concept.id);
  return {
    schemaVersion: MELANIES_GAME_SAVE_SCHEMA,
    gameVersion: MELANIES_GAME_VERSION,
    bankVersion: MELANIES_GAME_BANK_VERSION,
    anonymousPlayerId: args.anonymousPlayerId,
    libraryId: args.libraryId,
    ageBand: args.ageBand,
    gameSessionId,
    introDismissed: false,
    stage: "choose-1",
    currentConceptIds,
    selectedIds: [],
    ranking: [],
    survivorIds: [],
    seenConceptIds: currentConceptIds,
    evidence: [],
    recommendations: [],
    recommendationShownAt: null,
    finalRecommendationRanking: [],
    finalPreferredBookId: null,
    finalFeedbackInteracted: false,
    feedbackRecorded: false,
    startedAt: now,
    updatedAt: now,
  };
}

export function conceptIndex(ageBand: AgeBandV2): Map<string, MelanieConcept> {
  return new Map(MELANIES_CONCEPTS[ageBand].map((concept) => [concept.id, concept]));
}

export function selectMelanieConcepts(state: MelanieGameState, selectedIds: readonly string[], now = new Date().toISOString()): MelanieGameState {
  if (state.stage !== "choose-1" && state.stage !== "choose-2" && state.stage !== "final") return state;
  const unique = [...new Set(selectedIds)].filter((id) => state.currentConceptIds.includes(id)).slice(0, 3);
  if (!unique.length) return state;
  return {
    ...state,
    selectedIds: unique,
    ranking: unique,
    stage: state.stage === "choose-1" ? "rank-1" : state.stage === "choose-2" ? "rank-2" : "final",
    updatedAt: now,
  };
}

export function updateMelanieFinalSelection(
  state: MelanieGameState,
  selectedIds: readonly string[],
  now = new Date().toISOString(),
): MelanieGameState {
  if (state.stage !== "final") return state;
  const unique = [...new Set(selectedIds)].filter((id) => state.currentConceptIds.includes(id)).slice(0, 3);
  return { ...state, selectedIds: unique, ranking: unique, updatedAt: now };
}

export function reorderMelanieRanking(state: MelanieGameState, conceptId: string, direction: -1 | 1, now = new Date().toISOString()): MelanieGameState {
  const index = state.ranking.indexOf(conceptId);
  const nextIndex = index + direction;
  if (index < 0 || nextIndex < 0 || nextIndex >= state.ranking.length) return state;
  const ranking = [...state.ranking];
  [ranking[index], ranking[nextIndex]] = [ranking[nextIndex], ranking[index]];
  return { ...state, ranking, updatedAt: now };
}

type EvidenceScores = {
  dimensions: Record<MelanieDimension, number>;
  conceptScores: Record<string, number>;
  observations: number;
};

export function scoreMelanieEvidence(evidence: readonly MelaniePresentationEvidence[]): EvidenceScores {
  const dimensions = Object.fromEntries(DIMENSIONS.map((dimension) => [dimension, 0])) as Record<MelanieDimension, number>;
  const conceptScores: Record<string, number> = {};
  let observations = 0;
  for (const presentation of evidence) {
    const snapshots = new Map(presentation.presented.map((concept) => [concept.id, concept]));
    for (const conceptId of presentation.nonSelectedIds) {
      const concept = snapshots.get(conceptId);
      if (!concept) continue;
      conceptScores[conceptId] = (conceptScores[conceptId] || 0) - 0.18;
      for (const dimension of DIMENSIONS) dimensions[dimension] -= concept.attributes[dimension] * 0.045;
      observations += 0.18;
    }
    presentation.ranking.forEach((conceptId, rank) => {
      const concept = snapshots.get(conceptId);
      if (!concept) return;
      const selectedWeight = Math.max(0.62, 1 - rank * 0.18);
      const survivalWeight = presentation.round > 1 && presentation.survivorIds.includes(conceptId) ? 0.25 : 0;
      const weight = selectedWeight + survivalWeight;
      conceptScores[conceptId] = (conceptScores[conceptId] || 0) + weight;
      for (const dimension of DIMENSIONS) dimensions[dimension] += concept.attributes[dimension] * weight;
      observations += weight;
    });
    for (const outcome of presentation.outcomes) {
      const winner = snapshots.get(outcome.winnerId);
      const loser = snapshots.get(outcome.loserId);
      if (!winner || !loser) continue;
      for (const dimension of outcome.distinguishingDimensions) {
        dimensions[dimension] += (winner.attributes[dimension] - loser.attributes[dimension]) * 0.08;
      }
    }
  }
  const dampener = Math.max(1, Math.sqrt(observations));
  for (const dimension of DIMENSIONS) dimensions[dimension] /= dampener;
  return { dimensions, conceptScores, observations };
}

function distinguishingDimensions(winner: MelanieConcept, loser: MelanieConcept): MelanieDimension[] {
  return DIMENSIONS.filter((dimension) => Math.abs(winner.attributes[dimension] - loser.attributes[dimension]) >= 2);
}

function createPresentation(
  state: MelanieGameState,
  round: 1 | 2 | 3,
  ranking: readonly string[],
  now: string,
): MelaniePresentationEvidence {
  const index = conceptIndex(state.ageBand);
  const selectedIds = [...ranking];
  const nonSelectedIds = state.currentConceptIds.filter((id) => !selectedIds.includes(id));
  const outcomes = selectedIds.flatMap((winnerId) => nonSelectedIds.map((loserId) => {
    const winner = index.get(winnerId)!;
    const loser = index.get(loserId)!;
    return { winnerId, loserId, distinguishingDimensions: distinguishingDimensions(winner, loser) };
  }));
  return {
    schemaVersion: MELANIES_GAME_EVIDENCE_SCHEMA,
    presentationId: `${state.gameSessionId}:round-${round}`,
    round,
    occurredAt: now,
    presented: state.currentConceptIds.map((id) => {
      const concept = index.get(id);
      if (!concept) throw new Error(`unknown_melanie_concept:${id}`);
      return { id, attributes: concept.attributes };
    }),
    selectedIds,
    nonSelectedIds,
    ranking: [...ranking],
    survivorIds: state.survivorIds.filter((id) => state.currentConceptIds.includes(id)),
    challengerIds: state.currentConceptIds.filter((id) => !state.survivorIds.includes(id)),
    outcomes,
    context: {
      anonymousPlayerId: state.anonymousPlayerId,
      libraryId: state.libraryId,
      ageBand: state.ageBand,
      gameSessionId: state.gameSessionId,
      bankVersion: MELANIES_GAME_BANK_VERSION,
    },
  };
}

function candidateDiscriminatorScore(candidate: MelanieConcept, survivors: readonly MelanieConcept[], scores: EvidenceScores): number {
  const survivorMean = (dimension: MelanieDimension) => (
    survivors.reduce((sum, survivor) => sum + survivor.attributes[dimension], 0) / Math.max(1, survivors.length)
  );
  let discriminator = 0;
  let adjacency = 0;
  for (const dimension of DIMENSIONS) {
    const certainty = Math.abs(scores.dimensions[dimension]);
    const uncertaintyWeight = 1 / (1 + certainty);
    discriminator += Math.abs(candidate.attributes[dimension] - survivorMean(dimension)) * uncertaintyWeight;
    adjacency += candidate.attributes[dimension] * scores.dimensions[dimension] * 0.08;
  }
  return discriminator + Math.max(-1, Math.min(1.5, adjacency));
}

export function chooseAdaptiveChallengers(
  state: MelanieGameState,
  survivors: readonly string[],
  round: 2 | 3,
  count = 4,
): string[] {
  const pool = MELANIES_CONCEPTS[state.ageBand];
  const index = conceptIndex(state.ageBand);
  const survivorConcepts = survivors.map((id) => index.get(id)).filter((value): value is MelanieConcept => Boolean(value));
  const scores = scoreMelanieEvidence(state.evidence);
  const unseen = pool.filter((concept) => !state.seenConceptIds.includes(concept.id) && !survivors.includes(concept.id));
  return unseen
    .map((concept) => ({
      concept,
      score: candidateDiscriminatorScore(concept, survivorConcepts, scores),
      tie: hash(`${state.gameSessionId}:round-${round}:${concept.id}`),
    }))
    .sort((left, right) => right.score - left.score || left.tie - right.tie || left.concept.id.localeCompare(right.concept.id))
    .slice(0, count)
    .map(({ concept }) => concept.id);
}

export function completeMelanieRanking(state: MelanieGameState, now = new Date().toISOString()): MelanieGameState {
  if (state.stage !== "rank-1" && state.stage !== "rank-2") return state;
  if (!state.ranking.length || state.ranking.some((id) => !state.selectedIds.includes(id))) return state;
  const round = state.stage === "rank-1" ? 1 : 2;
  const presentation = createPresentation(state, round, state.ranking, now);
  const evidence = [...state.evidence, presentation];
  const scored = scoreMelanieEvidence(evidence);
  const survivors = [...state.ranking]
    .sort((left, right) => (scored.conceptScores[right] || 0) - (scored.conceptScores[left] || 0)
      || state.ranking.indexOf(left) - state.ranking.indexOf(right))
    .slice(0, Math.min(2, state.ranking.length));
  const withEvidence = { ...state, evidence, survivorIds: survivors };
  const nextRound = round === 1 ? 2 : 3;
  const challengers = chooseAdaptiveChallengers(withEvidence, survivors, nextRound, 4);
  const currentConceptIds = [...survivors, ...challengers];
  return {
    ...withEvidence,
    stage: round === 1 ? "choose-2" : "final",
    currentConceptIds,
    selectedIds: [],
    ranking: [],
    seenConceptIds: [...new Set([...state.seenConceptIds, ...currentConceptIds])],
    updatedAt: now,
  };
}

export function completeMelanieFinal(state: MelanieGameState, now = new Date().toISOString()): MelanieGameState {
  if (state.stage !== "final" || !state.ranking.length) return state;
  const presentation = createPresentation(state, 3, state.ranking, now);
  return {
    ...state,
    evidence: [...state.evidence, presentation],
    survivorIds: state.ranking.slice(0, 2),
    stage: "recommendations",
    updatedAt: now,
  };
}

function semanticTags(attributes: MelanieAttributes): Pick<SwipeSignalV2, "genres" | "tones" | "themes" | "characterDynamics" | "tags"> {
  const pace = attributes.pace >= 1 ? "fast-paced" : attributes.pace <= -1 ? "slow-paced" : "steady-paced";
  const scale = attributes.scale >= 1 ? "large-scale" : attributes.scale <= -1 ? "intimate" : "mid-scale";
  return {
    genres: [...attributes.genres],
    tones: [...attributes.tones],
    themes: [...attributes.themes, scale],
    characterDynamics: [...attributes.dynamics],
    tags: [...attributes.settings, pace],
  };
}

export function adaptMelanieEvidenceToSignals(evidence: readonly MelaniePresentationEvidence[]): SwipeSignalV2[] {
  return evidence.flatMap((presentation) => {
    const snapshots = new Map(presentation.presented.map((concept) => [concept.id, concept]));
    const selected: SwipeSignalV2[] = [];
    presentation.ranking.forEach((id, rank) => {
      const concept = snapshots.get(id);
      if (!concept) return;
      const survivalBonus = presentation.round > 1 && presentation.survivorIds.includes(id) ? 0.2 : 0;
      selected.push({
        id: `melanies-game:${presentation.presentationId}:${id}:selected`,
        title: id,
        action: "like" as const,
        source: "melanies_game",
        format: "book" as const,
        ...semanticTags(concept.attributes),
        weight: Math.max(0.6, 1 - rank * 0.18) + survivalBonus,
      });
    });
    const passed: SwipeSignalV2[] = [];
    presentation.nonSelectedIds.forEach((id) => {
      const concept = snapshots.get(id);
      if (!concept) return;
      passed.push({
        id: `melanies-game:${presentation.presentationId}:${id}:passed`,
        title: id,
        action: "dislike" as const,
        source: "melanies_game",
        format: "book" as const,
        ...semanticTags(concept.attributes),
        weight: 0.18,
      });
    });
    return [...selected, ...passed];
  });
}

export function applyMelanieRecommendations(
  state: MelanieGameState,
  recommendations: readonly MelanieRecommendationSnapshot[],
  shownAt = new Date().toISOString(),
): MelanieGameState {
  if (state.stage !== "recommendations") return state;
  return {
    ...state,
    recommendations: [...recommendations],
    recommendationShownAt: shownAt,
    finalRecommendationRanking: recommendations.map((book) => book.id),
    finalFeedbackInteracted: false,
    updatedAt: shownAt,
  };
}

export function rankMelanieRecommendation(
  state: MelanieGameState,
  bookId: string,
  direction: -1 | 1,
  now = new Date().toISOString(),
): MelanieGameState {
  const index = state.finalRecommendationRanking.indexOf(bookId);
  const nextIndex = index + direction;
  if (index < 0 || nextIndex < 0 || nextIndex >= state.finalRecommendationRanking.length) return state;
  const ranking = [...state.finalRecommendationRanking];
  [ranking[index], ranking[nextIndex]] = [ranking[nextIndex], ranking[index]];
  return {
    ...state,
    finalRecommendationRanking: ranking,
    finalPreferredBookId: ranking[0],
    finalFeedbackInteracted: true,
    updatedAt: now,
  };
}

export function chooseMelanieRecommendation(
  state: MelanieGameState,
  bookId: string | null,
  now = new Date().toISOString(),
): MelanieGameState {
  if (bookId !== null && !state.recommendations.some((book) => book.id === bookId)) return state;
  return { ...state, finalPreferredBookId: bookId, finalFeedbackInteracted: true, updatedAt: now };
}

export function isMelanieEvidenceEvent(value: unknown): value is MelaniePresentationEvidence {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const event = value as Partial<MelaniePresentationEvidence>;
  const exactKeys = (record: object, keys: readonly string[]) => {
    const actual = Object.keys(record).sort();
    const expected = [...keys].sort();
    return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
  };
  if (!exactKeys(value, [
    "schemaVersion", "presentationId", "round", "occurredAt", "presented", "selectedIds",
    "nonSelectedIds", "ranking", "survivorIds", "challengerIds", "outcomes", "context",
  ])) return false;
  if (!event.context || typeof event.context !== "object" || !exactKeys(event.context, [
    "anonymousPlayerId", "libraryId", "ageBand", "gameSessionId", "bankVersion",
  ])) return false;
  const ageBand = event.context.ageBand;
  if (!["kids", "preteens", "teens", "adult"].includes(String(ageBand))) return false;
  const authored = conceptIndex(ageBand as AgeBandV2);
  const arraysAreUniqueStrings = (items: unknown, maximum: number): items is string[] => (
    Array.isArray(items) && items.length <= maximum
    && items.every((item) => typeof item === "string")
    && new Set(items).size === items.length
  );
  if (!Array.isArray(event.presented) || event.presented.length < 3 || event.presented.length > 6) return false;
  for (const item of event.presented) {
    if (!item || typeof item !== "object" || !exactKeys(item, ["id", "attributes"])) return false;
    const concept = authored.get(item.id);
    if (!concept || JSON.stringify(item.attributes) !== JSON.stringify(concept.attributes)) return false;
  }
  const presentedIds = new Set(event.presented.map((item) => item.id));
  if (
    !arraysAreUniqueStrings(event.selectedIds, 3) || event.selectedIds.length < 1
    || !arraysAreUniqueStrings(event.nonSelectedIds, 6)
    || !arraysAreUniqueStrings(event.ranking, 3)
    || !arraysAreUniqueStrings(event.survivorIds, 2)
    || !arraysAreUniqueStrings(event.challengerIds, 6)
    || event.ranking.length !== event.selectedIds.length
    || event.ranking.some((id) => !event.selectedIds!.includes(id))
    || [...event.selectedIds, ...event.nonSelectedIds].some((id) => !presentedIds.has(id))
    || new Set([...event.selectedIds, ...event.nonSelectedIds]).size !== presentedIds.size
  ) return false;
  if (!Array.isArray(event.outcomes) || event.outcomes.length > 18) return false;
  if (!event.outcomes.every((outcome) => outcome && typeof outcome === "object"
    && exactKeys(outcome, ["winnerId", "loserId", "distinguishingDimensions"])
    && event.selectedIds!.includes(outcome.winnerId)
    && event.nonSelectedIds!.includes(outcome.loserId)
    && Array.isArray(outcome.distinguishingDimensions)
    && outcome.distinguishingDimensions.every((dimension) => DIMENSIONS.includes(dimension)))) return false;
  return event.schemaVersion === MELANIES_GAME_EVIDENCE_SCHEMA
    && typeof event.presentationId === "string"
    && (event.round === 1 || event.round === 2 || event.round === 3)
    && typeof event.occurredAt === "string" && Number.isFinite(Date.parse(event.occurredAt))
    && typeof event.context.anonymousPlayerId === "string" && event.context.anonymousPlayerId.length <= 160
    && typeof event.context.libraryId === "string" && event.context.libraryId.length <= 160
    && typeof event.context.gameSessionId === "string" && event.context.gameSessionId.length <= 160
    && event.context.bankVersion === MELANIES_GAME_BANK_VERSION
    && event.presentationId === `${event.context?.gameSessionId}:round-${event.round}`;
}

export function restoreMelanieGameState(
  raw: string | null,
  expected: { anonymousPlayerId: string; libraryId: string; ageBand: AgeBandV2 },
): MelanieGameState | null {
  if (!raw) return null;
  try {
    const state = JSON.parse(raw) as MelanieGameState;
    const poolIds = new Set(MELANIES_CONCEPTS[expected.ageBand].map((concept) => concept.id));
    const recommendationIds = new Set<string>();
    const validRecommendations = Array.isArray(state.recommendations)
      && state.recommendations.length <= 3
      && state.recommendations.every((book) => {
        if (!book || typeof book !== "object") return false;
        const keys = Object.keys(book).sort();
        const expectedKeys = [
          "author", "coverUrl", "description", "id", "position", "rank", "reason", "source", "sourceId", "title",
        ].sort();
        if (keys.length !== expectedKeys.length || !keys.every((key, index) => key === expectedKeys[index])) return false;
        if (
          typeof book.id !== "string" || !book.id
          || typeof book.source !== "string" || !book.source
          || (book.sourceId !== null && typeof book.sourceId !== "string")
          || typeof book.title !== "string" || !book.title
          || typeof book.author !== "string"
          || !Number.isInteger(book.rank) || book.rank < 1
          || !["strongest", "strong", "adventurous"].includes(book.position)
          || (book.coverUrl !== null && typeof book.coverUrl !== "string")
          || (book.description !== null && typeof book.description !== "string")
          || typeof book.reason !== "string"
          || recommendationIds.has(book.id)
        ) return false;
        recommendationIds.add(book.id);
        return true;
      });
    if (
      state.schemaVersion !== MELANIES_GAME_SAVE_SCHEMA
      || state.gameVersion !== MELANIES_GAME_VERSION
      || state.bankVersion !== MELANIES_GAME_BANK_VERSION
      || state.anonymousPlayerId !== expected.anonymousPlayerId
      || state.libraryId !== expected.libraryId
      || state.ageBand !== expected.ageBand
      || !["choose-1", "rank-1", "choose-2", "rank-2", "final", "recommendations"].includes(state.stage)
      || !Array.isArray(state.currentConceptIds) || state.currentConceptIds.some((id) => !poolIds.has(id))
      || !Array.isArray(state.selectedIds) || state.selectedIds.some((id) => !poolIds.has(id))
      || !Array.isArray(state.ranking) || state.ranking.some((id) => !poolIds.has(id))
      || !Array.isArray(state.survivorIds) || state.survivorIds.some((id) => !poolIds.has(id))
      || !Array.isArray(state.seenConceptIds) || state.seenConceptIds.some((id) => !poolIds.has(id))
      || !Array.isArray(state.evidence) || !state.evidence.every(isMelanieEvidenceEvent)
      || !validRecommendations
      || (state.recommendationShownAt !== null && !Number.isFinite(Date.parse(state.recommendationShownAt)))
      || !Array.isArray(state.finalRecommendationRanking)
      || state.finalRecommendationRanking.length !== recommendationIds.size
      || new Set(state.finalRecommendationRanking).size !== state.finalRecommendationRanking.length
      || state.finalRecommendationRanking.some((id) => !recommendationIds.has(id))
      || (state.finalPreferredBookId !== null && !recommendationIds.has(state.finalPreferredBookId))
      || typeof state.finalFeedbackInteracted !== "boolean"
      || typeof state.feedbackRecorded !== "boolean"
      || typeof state.gameSessionId !== "string"
      || typeof state.introDismissed !== "boolean"
      || !Number.isFinite(Date.parse(state.startedAt)) || !Number.isFinite(Date.parse(state.updatedAt))
    ) return null;
    return state;
  } catch {
    return null;
  }
}
