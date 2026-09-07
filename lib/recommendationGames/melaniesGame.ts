import type { AgeBandV2, SwipeSignalV2 } from "../../app/recommender-v2";
import { ADDITIONAL_MELANIE_CONCEPTS } from "./melaniesGameExpandedConcepts";

export const MELANIES_GAME_VERSION = "melanies_game_v1" as const;
export const MELANIES_GAME_BANK_VERSION = "melanies_concepts_v2" as const;
export const MELANIES_GAME_SAVE_SCHEMA = "melanies_game_save_v1" as const;
export const MELANIES_GAME_EVIDENCE_SCHEMA = "melanies_game_evidence_v2" as const;

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

export type MelaniePremiseFamily =
  | "quest" | "investigation" | "competition" | "rescue" | "survival" | "community-change"
  | "relationship-repair" | "identity-discovery" | "heist" | "creation" | "stewardship"
  | "political-struggle" | "journey" | "workplace-crisis" | "inheritance" | "conspiracy"
  | "coming-of-age" | "historical-reckoning" | "ethical-dilemma" | "second-chance";
export type MelanieCentralActivity =
  | "explore" | "investigate" | "build" | "protect" | "perform" | "compete" | "escape" | "solve"
  | "care" | "negotiate" | "create" | "survive" | "travel" | "organize" | "rescue" | "restore"
  | "teach" | "reconcile" | "rebel" | "lead" | "discover" | "hide" | "adapt" | "document" | "cook";
export type MelanieSettingClass =
  | "home" | "school" | "small-town" | "city" | "wilderness" | "coast" | "sea" | "space"
  | "other-world" | "historical" | "workplace" | "institution" | "transit" | "performance"
  | "sports" | "archive" | "garden" | "island" | "underground" | "digital" | "political";
export type MelanieProtagonistRole =
  | "student" | "apprentice" | "caretaker" | "outsider" | "investigator" | "performer" | "athlete"
  | "scientist" | "artist" | "leader" | "worker" | "parent" | "sibling" | "friend" | "traveler"
  | "teacher" | "healer" | "organizer" | "scholar" | "survivor" | "ruler" | "rebel" | "guardian";
export type MelanieNarrativeEngine =
  | "clue-chain" | "escalating-trials" | "deadline-mission" | "relationship-negotiation"
  | "resource-management" | "rivalry-ladder" | "journey-encounters" | "secret-uncovering"
  | "community-project" | "moral-choice" | "training-progression" | "cause-and-effect-discovery"
  | "political-maneuvering" | "survival-pressure" | "creative-process" | "alternating-perspectives"
  | "procedural-problem-solving" | "transformation-consequences" | "cat-and-mouse"
  | "memory-reconstruction";
export type MelanieRelationshipShape =
  | "solo" | "friendship" | "siblings" | "family" | "found-family" | "rivals" | "mentor-student"
  | "team" | "romantic-pair" | "community" | "parent-child" | "colleagues" | "adversaries"
  | "intergenerational";
export type MelanieSpeculativeDevice =
  | "none" | "magic-object" | "sentient-place" | "time-distortion" | "memory-technology"
  | "alternate-world" | "mythic-being" | "transformation" | "artificial-intelligence"
  | "future-technology" | "ghost" | "living-nature" | "impossible-creature" | "prophecy"
  | "parallel-reality" | "communicating-animal" | "supernatural-rule";
export type MelanieStakesShape =
  | "personal-belonging" | "relationship" | "family" | "community" | "livelihood" | "freedom"
  | "survival" | "truth" | "justice" | "environment" | "identity" | "public-duty" | "legacy"
  | "competition" | "creative-goal" | "rescue" | "political" | "ethical";
export type MelanieSocialFocus = "individual" | "pair" | "family" | "team" | "community" | "society";
export type MelanieCoverMotif =
  | "animal" | "archive" | "art" | "book" | "castle" | "city" | "clock" | "coast" | "desert"
  | "fire" | "food" | "forest" | "garden" | "ghost" | "history" | "home" | "journey" | "machine"
  | "magic" | "moon" | "mountain" | "music" | "mystery" | "performance" | "politics"
  | "romance" | "school" | "science" | "sea" | "signal" | "space" | "sport" | "storm" | "train";

export const MELANIE_SEMANTIC_TAXONOMY = {
  premiseFamily: [
    "quest", "investigation", "competition", "rescue", "survival", "community-change",
    "relationship-repair", "identity-discovery", "heist", "creation", "stewardship",
    "political-struggle", "journey", "workplace-crisis", "inheritance", "conspiracy",
    "coming-of-age", "historical-reckoning", "ethical-dilemma", "second-chance",
  ] satisfies readonly MelaniePremiseFamily[],
  centralActivities: [
    "explore", "investigate", "build", "protect", "perform", "compete", "escape", "solve", "care",
    "negotiate", "create", "survive", "travel", "organize", "rescue", "restore", "teach", "reconcile",
    "rebel", "lead", "discover", "hide", "adapt", "document", "cook",
  ] satisfies readonly MelanieCentralActivity[],
  settingClasses: [
    "home", "school", "small-town", "city", "wilderness", "coast", "sea", "space", "other-world",
    "historical", "workplace", "institution", "transit", "performance", "sports", "archive", "garden",
    "island", "underground", "digital", "political",
  ] satisfies readonly MelanieSettingClass[],
  protagonistRoles: [
    "student", "apprentice", "caretaker", "outsider", "investigator", "performer", "athlete",
    "scientist", "artist", "leader", "worker", "parent", "sibling", "friend", "traveler", "teacher",
    "healer", "organizer", "scholar", "survivor", "ruler", "rebel", "guardian",
  ] satisfies readonly MelanieProtagonistRole[],
  narrativeEngine: [
    "clue-chain", "escalating-trials", "deadline-mission", "relationship-negotiation",
    "resource-management", "rivalry-ladder", "journey-encounters", "secret-uncovering",
    "community-project", "moral-choice", "training-progression", "cause-and-effect-discovery",
    "political-maneuvering", "survival-pressure", "creative-process", "alternating-perspectives",
    "procedural-problem-solving", "transformation-consequences", "cat-and-mouse", "memory-reconstruction",
  ] satisfies readonly MelanieNarrativeEngine[],
  relationshipShapes: [
    "solo", "friendship", "siblings", "family", "found-family", "rivals", "mentor-student", "team",
    "romantic-pair", "community", "parent-child", "colleagues", "adversaries", "intergenerational",
  ] satisfies readonly MelanieRelationshipShape[],
  speculativeDevices: [
    "none", "magic-object", "sentient-place", "time-distortion", "memory-technology", "alternate-world",
    "mythic-being", "transformation", "artificial-intelligence", "future-technology", "ghost",
    "living-nature", "impossible-creature", "prophecy", "parallel-reality", "communicating-animal",
    "supernatural-rule",
  ] satisfies readonly MelanieSpeculativeDevice[],
  stakesShapes: [
    "personal-belonging", "relationship", "family", "community", "livelihood", "freedom", "survival",
    "truth", "justice", "environment", "identity", "public-duty", "legacy", "competition",
    "creative-goal", "rescue", "political", "ethical",
  ] satisfies readonly MelanieStakesShape[],
  socialFocus: ["individual", "pair", "family", "team", "community", "society"] satisfies readonly MelanieSocialFocus[],
} as const;

export type MelanieSemanticFingerprint = {
  premiseFamily: MelaniePremiseFamily;
  centralActivities: MelanieCentralActivity[];
  settingClasses: MelanieSettingClass[];
  protagonistRoles: MelanieProtagonistRole[];
  narrativeEngine: MelanieNarrativeEngine;
  relationshipShapes: MelanieRelationshipShape[];
  speculativeDevices: MelanieSpeculativeDevice[];
  stakesShapes: MelanieStakesShape[];
  keyCoverMotifs: MelanieCoverMotif[];
  socialFocus: MelanieSocialFocus;
};

export type MelanieConcept = {
  id: string;
  ageBand: AgeBandV2;
  title: string;
  synopsis: string;
  palette: readonly [string, string];
  attributes: MelanieAttributes;
  semantic: MelanieSemanticFingerprint;
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

type SemanticSeed = [
  premiseFamily: MelaniePremiseFamily,
  centralActivities: MelanieCentralActivity[],
  settingClasses: MelanieSettingClass[],
  protagonistRoles: MelanieProtagonistRole[],
  narrativeEngine: MelanieNarrativeEngine,
  relationshipShapes: MelanieRelationshipShape[],
  speculativeDevices: MelanieSpeculativeDevice[],
  stakesShapes: MelanieStakesShape[],
  keyCoverMotifs: MelanieCoverMotif[],
  socialFocus: MelanieSocialFocus,
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
    ["k-island-race", "Race Around Pebble Island", "A cautious rabbit and a fearless turtle enter a race where every shortcut hides a puzzle.", ["animal story", "adventure"], ["exciting", "funny"], ["perseverance", "puzzles"], ["rivals"], ["island"], [0, -1, 1, -2, 1, 1, 0, 2, -1]],
    ["k-grandma-map", "Grandma's Impossible Map", "A grandchild follows a hand-drawn map through ordinary places that hold extraordinary family stories.", ["realistic fiction"], ["warm", "reflective"], ["family", "memory"], ["family"], ["town"], [-1, -2, 0, -2, 0, -1, 2, -1, 2]],
    ["k-monster-window", "The Monster Outside My Window", "A nervous child realizes the nightly monster is trying to warn the whole apartment building.", ["fantasy", "mystery"], ["spooky", "hopeful"], ["bravery", "misunderstanding"], ["community"], ["apartment building"], [2, 1, 0, -2, 2, 0, 1, 1, 1]],
  ],
  preteens: [
    ["p-lost-frequency", "The Lost Frequency", "Three friends build a radio that receives broadcasts from their town exactly one week in the future.", ["science fiction", "mystery"], ["tense", "clever"], ["friendship", "consequences"], ["friendship"], ["small town"], [2, 0, 0, -2, 2, 0, 1, 2, 1]],
    ["p-dragons-debate", "Dragons on the Debate Team", "A rule-following student discovers the new debate champions are dragons hiding in plain sight.", ["fantasy", "comedy"], ["funny", "energetic"], ["school", "belonging"], ["rivals", "team"], ["school"], [2, -1, 2, -2, 1, -1, -1, 2, 1]],
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
    ["p-midnight-league", "The Midnight League", "Young athletes discover their championship opponents practice impossible sports after dark.", ["sports", "fantasy"], ["energetic", "mysterious"], ["competition", "confidence"], ["team", "rivals"], ["city"], [1, 0, 1, -2, 1, 0, 0, 2, -1]],
    ["p-coral-cipher", "The Coral Cipher", "A puzzle-loving diver decodes a warning hidden in the changing colors of a coral reef.", ["adventure", "mystery"], ["bright", "suspenseful"], ["environment", "puzzles"], ["family"], ["island", "ocean"], [-1, 0, 0, -2, 2, 1, 1, 2, 1]],
    ["p-ordinary-hero", "An Extremely Ordinary Hero", "The only child without powers at hero school may be the only one who notices the villain's simple trick.", ["fantasy", "comedy"], ["funny", "hopeful"], ["identity", "ingenuity"], ["school friends"], ["hero school"], [2, -1, 2, -2, 1, 0, 1, 2, 2]],
    ["p-winter-letters", "Letters from the Winter Road", "Siblings crossing the country to find their father receive letters predicting each stop before they arrive.", ["road adventure", "mystery"], ["emotional", "tense"], ["family", "hope"], ["family"], ["road trip"], [-1, 1, 0, -2, 2, 1, 2, 1, 2]],
  ],
  teens: [
    ["t-memory-orchard", "The Glass Orchard", "A botanist's daughter discovers that an abandoned greenhouse grows fruit containing other people's memories.", ["speculative fiction", "mystery"], ["lush", "unsettling"], ["memory", "identity"], ["family"], ["greenhouse"], [2, 1, 0, 0, 2, 0, 2, 0, 2]],
    ["t-last-train", "The Last Train North", "A student boards an overnight train where every passenger remembers a different version of the same missing town.", ["mystery", "speculative fiction"], ["atmospheric", "tense"], ["truth", "memory"], ["ensemble cast"], ["train"], [2, 1, 0, 0, 2, 1, 2, 1, 1]],
    ["t-borrowed-summer", "The Borrowed Summer", "Two former best friends share one last summer job restoring a closed seaside theater.", ["contemporary fiction", "romance"], ["bittersweet", "warm"], ["friendship", "second chances"], ["friends to lovers"], ["seaside town"], [-2, -1, 1, 2, 0, -1, 2, -1, 2]],
    ["t-archive-zero", "Archive Zero", "Teen hackers uncover a public archive that has quietly erased one person from every year of history.", ["science fiction", "thriller"], ["urgent", "cerebral"], ["power", "history"], ["team"], ["near-future city"], [1, 1, 0, 0, 2, 2, -1, 2, -1]],
    ["t-sunken-saint", "The Sunken Saint", "A skeptical diver joins a pilgrimage to a drowned city that appears for one night each decade.", ["fantasy", "adventure"], ["mythic", "melancholic"], ["faith", "loss"], ["rivals"], ["drowned city"], [2, 1, 0, 1, 1, 2, 2, 1, 1]],
    ["t-breakup-club", "The Breakup Club", "Four students make a pact to avoid romance and immediately become tangled in everyone else's love stories.", ["contemporary fiction", "comedy"], ["funny", "heartfelt"], ["friendship", "love"], ["ensemble cast", "romance"], ["school"], [-2, -1, 2, 2, 0, -1, 2, 1, 2]],
    ["t-wolves-signal", "When the Wolves Signal", "A wilderness volunteer follows impossible radio calls during a week-long search for a missing hiker.", ["thriller", "mystery"], ["dark", "claustrophobic"], ["survival", "trust"], ["solitary"], ["mountains"], [0, 2, -1, 0, 2, 0, 2, 2, 2]],
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
    ["a-north-train", "Passengers of the Vanished Line", "A rail historian joins a midnight route whose silent travelers carry tickets from stations erased decades ago.", ["literary mystery", "speculative fiction"], ["atmospheric", "unsettling"], ["memory", "truth"], ["ensemble cast"], ["train", "remote town"], [2, 1, 0, 0, 2, 1, 2, 0, 2]],
    ["a-glass-orchard", "The Memory Harvest", "An estranged horticulturist inherits a sealed conservatory where tasting its impossible fruit reveals the secrets her family buried.", ["speculative fiction", "mystery"], ["lush", "melancholic"], ["memory", "ethics"], ["solitary"], ["greenhouse"], [2, 1, 0, 0, 2, 0, 2, -1, 2]],
    ["a-second-kitchen", "The Second Kitchen", "Estranged siblings inherit a restaurant that serves one forgotten meal from each diner's past.", ["contemporary fiction", "magical realism"], ["warm", "bittersweet"], ["family", "food"], ["family"], ["city restaurant"], [1, -1, 1, 1, 0, -1, 2, -1, 2]],
    ["a-quiet-coup", "The Quiet Coup", "A municipal clerk notices tiny changes in public records that point to a government takeover nobody else can see.", ["political thriller"], ["tense", "cerebral"], ["power", "truth"], ["solitary"], ["capital city"], [-1, 2, 0, -1, 2, 2, 1, 1, 2]],
    ["a-house-tides", "The House That Kept the Tides", "Three generations return to a coastal home whose rooms rearrange themselves with the moon.", ["family saga", "magical realism"], ["gothic", "emotional"], ["inheritance", "family"], ["family"], ["coastal house"], [1, 1, 0, 1, 1, 0, 2, -1, 2]],
    ["a-courier-mars", "The Last Courier on Mars", "A cynical courier crosses abandoned settlements to deliver a package addressed to someone born tomorrow.", ["science fiction", "adventure"], ["wry", "lonely"], ["hope", "survival"], ["solitary"], ["Mars"], [2, 0, 1, 0, 1, 2, -1, 2, -1]],
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

const SEMANTIC_SEEDS: Record<string, SemanticSeed> = {
  "k-cloud-library": ["quest", ["discover", "protect"], ["other-world"], ["artist"], "cause-and-effect-discovery", ["friendship"], ["sentient-place"], ["public-duty"], ["book", "storm", "magic"], "pair"],
  "k-lunchbox-detectives": ["investigation", ["investigate", "solve"], ["school"], ["student", "investigator"], "clue-chain", ["friendship"], ["none"], ["truth"], ["food", "school"], "pair"],
  "k-moon-whale": ["rescue", ["travel", "rescue"], ["sea"], ["guardian", "traveler"], "journey-encounters", ["friendship"], ["mythic-being"], ["rescue"], ["sea", "moon", "animal"], "pair"],
  "k-garden-robots": ["creation", ["build", "care"], ["garden", "school"], ["student", "scientist"], "transformation-consequences", ["team"], ["artificial-intelligence"], ["community"], ["machine", "garden"], "team"],
  "k-night-bus": ["journey", ["travel", "perform"], ["transit", "city"], ["traveler"], "journey-encounters", ["found-family"], ["supernatural-rule"], ["personal-belonging"], ["journey", "book"], "community"],
  "k-dinosaur-neighbor": ["identity-discovery", ["hide", "protect"], ["small-town"], ["friend", "outsider"], "cat-and-mouse", ["friendship"], ["impossible-creature"], ["personal-belonging"], ["animal", "home"], "pair"],
  "k-clock-mice": ["rescue", ["restore", "survive"], ["city"], ["caretaker"], "deadline-mission", ["family"], ["communicating-animal"], ["community"], ["clock", "storm", "city"], "family"],
  "k-sea-post": ["investigation", ["explore", "investigate"], ["sea"], ["investigator", "traveler"], "clue-chain", ["friendship"], ["impossible-creature"], ["truth"], ["sea", "mystery"], "pair"],
  "k-wild-choir": ["creation", ["perform", "reconcile"], ["wilderness", "performance"], ["performer"], "creative-process", ["team"], ["communicating-animal"], ["creative-goal"], ["music", "forest", "animal"], "team"],
  "k-castle-puddles": ["rescue", ["lead", "solve"], ["other-world"], ["ruler", "leader"], "deadline-mission", ["friendship"], ["living-nature"], ["public-duty"], ["castle", "storm"], "community"],
  "k-secret-seed": ["quest", ["discover", "explore"], ["home", "other-world"], ["student", "traveler"], "journey-encounters", ["family"], ["magic-object"], ["identity"], ["garden", "magic"], "individual"],
  "k-snow-day": ["survival", ["organize", "cook"], ["home", "small-town"], ["sibling", "organizer"], "resource-management", ["siblings", "community"], ["none"], ["community"], ["home", "food", "storm"], "community"],
  "k-paper-dragon": ["identity-discovery", ["create", "protect"], ["performance", "city"], ["artist"], "transformation-consequences", ["friendship"], ["transformation"], ["creative-goal"], ["art", "magic"], "pair"],
  "k-island-race": ["competition", ["compete", "solve"], ["island", "sports"], ["athlete"], "rivalry-ladder", ["rivals"], ["communicating-animal"], ["competition"], ["sport", "sea", "animal"], "pair"],
  "k-grandma-map": ["historical-reckoning", ["travel", "document"], ["small-town"], ["traveler"], "memory-reconstruction", ["intergenerational", "family"], ["none"], ["legacy"], ["journey", "history"], "family"],
  "k-monster-window": ["rescue", ["investigate", "protect"], ["city", "home"], ["outsider", "guardian"], "clue-chain", ["community"], ["impossible-creature"], ["community"], ["ghost", "home"], "community"],

  "p-lost-frequency": ["ethical-dilemma", ["build", "investigate"], ["small-town"], ["student", "scientist"], "cause-and-effect-discovery", ["friendship"], ["time-distortion"], ["ethical"], ["signal", "clock", "machine"], "team"],
  "p-dragons-debate": ["identity-discovery", ["compete", "hide"], ["school"], ["student"], "rivalry-ladder", ["rivals", "team"], ["mythic-being"], ["personal-belonging"], ["school", "animal"], "team"],
  "p-below-station": ["historical-reckoning", ["explore", "document"], ["underground", "city"], ["traveler", "scholar"], "journey-encounters", ["friendship"], ["ghost"], ["legacy"], ["train", "ghost", "history"], "pair"],
  "p-zero-gravity": ["survival", ["restore", "care"], ["space"], ["student", "scientist"], "resource-management", ["family", "team"], ["future-technology"], ["survival"], ["space", "garden"], "team"],
  "p-river-secret": ["rescue", ["investigate", "rescue"], ["wilderness"], ["athlete", "investigator"], "deadline-mission", ["family"], ["none"], ["rescue", "environment"], ["sea", "forest"], "pair"],
  "p-bakery-ghost": ["historical-reckoning", ["cook", "solve"], ["workplace"], ["apprentice"], "clue-chain", ["intergenerational"], ["ghost"], ["legacy"], ["food", "ghost"], "pair"],
  "p-rulebook": ["survival", ["survive", "adapt"], ["institution", "historical"], ["student"], "escalating-trials", ["team"], ["supernatural-rule"], ["freedom"], ["history", "magic"], "team"],
  "p-lake-house": ["identity-discovery", ["investigate", "reconcile"], ["coast", "home"], ["outsider"], "memory-reconstruction", ["friendship"], ["none"], ["family", "identity"], ["home", "history"], "pair"],
  "p-moth-kingdom": ["political-struggle", ["negotiate", "lead"], ["other-world"], ["ruler", "outsider"], "moral-choice", ["family"], ["supernatural-rule"], ["freedom", "public-duty"], ["castle", "moon", "animal"], "society"],
  "p-skate-code": ["investigation", ["investigate", "protect"], ["city", "sports"], ["athlete", "scientist"], "cat-and-mouse", ["friendship"], ["none"], ["justice", "competition"], ["sport", "machine"], "pair"],
  "p-last-treehouse": ["stewardship", ["protect", "investigate"], ["small-town", "wilderness"], ["organizer"], "community-project", ["community"], ["none"], ["environment"], ["forest", "animal"], "community"],
  "p-pocket-universe": ["ethical-dilemma", ["build", "rescue"], ["school", "other-world"], ["student", "scientist"], "cause-and-effect-discovery", ["solo"], ["alternate-world"], ["ethical", "rescue"], ["space", "science", "machine"], "individual"],
  "p-midnight-league": ["competition", ["compete", "investigate"], ["sports", "city"], ["athlete"], "rivalry-ladder", ["team", "rivals"], ["supernatural-rule"], ["competition"], ["sport", "moon"], "team"],
  "p-coral-cipher": ["investigation", ["solve", "protect"], ["sea", "island"], ["investigator"], "clue-chain", ["family"], ["none"], ["environment"], ["sea", "mystery"], "pair"],
  "p-ordinary-hero": ["identity-discovery", ["investigate", "solve"], ["school"], ["student", "outsider"], "secret-uncovering", ["friendship"], ["supernatural-rule"], ["personal-belonging"], ["school", "magic"], "team"],
  "p-winter-letters": ["rescue", ["travel", "investigate"], ["transit"], ["sibling", "traveler"], "journey-encounters", ["siblings", "family"], ["prophecy"], ["family", "rescue"], ["journey", "book"], "family"],

  "t-memory-orchard": ["identity-discovery", ["investigate", "care"], ["garden"], ["scientist"], "memory-reconstruction", ["family"], ["memory-technology"], ["identity"], ["garden", "mystery"], "individual"],
  "t-last-train": ["investigation", ["travel", "investigate"], ["transit", "small-town"], ["student", "traveler"], "alternating-perspectives", ["community"], ["parallel-reality"], ["truth"], ["train", "mystery"], "community"],
  "t-borrowed-summer": ["relationship-repair", ["restore", "perform"], ["coast", "performance"], ["worker", "performer"], "relationship-negotiation", ["romantic-pair", "friendship"], ["none"], ["relationship", "creative-goal"], ["performance", "coast"], "pair"],
  "t-archive-zero": ["conspiracy", ["investigate", "rebel"], ["digital", "city"], ["student", "investigator"], "cat-and-mouse", ["team"], ["future-technology"], ["truth", "justice"], ["archive", "machine"], "team"],
  "t-sunken-saint": ["quest", ["explore", "travel"], ["sea", "historical"], ["outsider", "traveler"], "journey-encounters", ["rivals"], ["sentient-place"], ["truth"], ["sea", "history"], "team"],
  "t-breakup-club": ["coming-of-age", ["reconcile", "hide"], ["school"], ["student", "friend"], "alternating-perspectives", ["friendship", "romantic-pair"], ["none"], ["relationship"], ["school", "romance"], "team"],
  "t-wolves-signal": ["rescue", ["survive", "investigate"], ["wilderness"], ["guardian", "investigator"], "survival-pressure", ["solo"], ["supernatural-rule"], ["survival", "rescue"], ["signal", "mountain"], "individual"],
  "t-paper-rebellion": ["political-struggle", ["rebel", "organize"], ["city", "political"], ["student", "rebel"], "political-maneuvering", ["found-family"], ["supernatural-rule"], ["freedom", "truth"], ["book", "politics"], "society"],
  "t-orbit-hearts": ["survival", ["survive", "restore"], ["space"], ["student", "traveler"], "deadline-mission", ["rivals", "romantic-pair"], ["future-technology"], ["survival", "relationship"], ["space", "romance"], "pair"],
  "t-small-gods": ["stewardship", ["discover", "protect"], ["small-town"], ["student", "guardian"], "community-project", ["community"], ["mythic-being"], ["community", "legacy"], ["city", "magic"], "community"],
  "t-dead-language": ["historical-reckoning", ["investigate", "compete"], ["school", "historical"], ["student", "scholar"], "secret-uncovering", ["rivals"], ["ghost"], ["truth", "identity"], ["school", "ghost"], "pair"],
  "t-fire-season": ["investigation", ["investigate", "reconcile"], ["small-town", "wilderness"], ["sibling", "investigator"], "clue-chain", ["siblings", "family"], ["none"], ["environment", "justice"], ["fire", "forest"], "family"],
  "t-monster-documentary": ["creation", ["create", "document"], ["small-town"], ["student", "artist"], "creative-process", ["team", "friendship"], ["impossible-creature"], ["truth", "creative-goal"], ["art", "ghost"], "team"],
  "t-deep-blue": ["identity-discovery", ["compete", "investigate"], ["coast", "sports"], ["athlete"], "memory-reconstruction", ["family"], ["none"], ["identity", "truth"], ["sport", "sea", "music"], "individual"],
  "t-crownless": ["political-struggle", ["compete", "rebel"], ["other-world", "political"], ["ruler", "rebel"], "rivalry-ladder", ["rivals"], ["none"], ["political", "freedom"], ["castle", "politics"], "society"],
  "t-after-party": ["relationship-repair", ["investigate", "reconcile"], ["small-town"], ["student", "friend"], "memory-reconstruction", ["friendship"], ["none"], ["relationship", "truth"], ["home", "mystery"], "team"],

  "a-north-train": ["historical-reckoning", ["travel", "investigate"], ["transit", "historical"], ["scholar", "traveler"], "alternating-perspectives", ["community"], ["ghost"], ["truth", "legacy"], ["train", "ghost"], "community"],
  "a-glass-orchard": ["inheritance", ["care", "investigate"], ["garden", "home"], ["scientist", "outsider"], "memory-reconstruction", ["family"], ["memory-technology"], ["family", "ethical"], ["garden", "mystery"], "family"],
  "a-second-kitchen": ["relationship-repair", ["cook", "reconcile"], ["workplace", "city"], ["sibling", "worker"], "relationship-negotiation", ["siblings", "family"], ["magic-object"], ["family", "livelihood"], ["food", "home"], "family"],
  "a-quiet-coup": ["conspiracy", ["investigate", "document"], ["political", "city"], ["worker", "investigator"], "cat-and-mouse", ["solo"], ["none"], ["political", "truth"], ["archive", "politics"], "individual"],
  "a-house-tides": ["inheritance", ["reconcile", "discover"], ["coast", "home"], ["parent", "caretaker"], "alternating-perspectives", ["family", "intergenerational"], ["sentient-place"], ["family", "legacy"], ["home", "moon"], "family"],
  "a-courier-mars": ["journey", ["travel", "survive"], ["space", "wilderness"], ["worker", "traveler"], "journey-encounters", ["solo"], ["future-technology", "time-distortion"], ["survival", "ethical"], ["space", "journey"], "individual"],
  "a-village-murders": ["investigation", ["investigate", "compete"], ["small-town", "garden"], ["investigator"], "clue-chain", ["community", "rivals"], ["none"], ["truth", "competition"], ["mystery", "garden"], "community"],
  "a-salt-parliament": ["political-struggle", ["negotiate", "lead"], ["island", "political"], ["leader"], "political-maneuvering", ["adversaries", "community"], ["living-nature"], ["political", "legacy"], ["sea", "politics"], "society"],
  "a-unfinished-film": ["conspiracy", ["create", "investigate"], ["workplace", "city"], ["artist", "investigator"], "cat-and-mouse", ["solo"], ["prophecy"], ["truth", "survival"], ["art", "mystery"], "individual"],
  "a-three-weddings": ["second-chance", ["reconcile", "survive"], ["workplace", "coast"], ["friend"], "relationship-negotiation", ["friendship", "romantic-pair"], ["none"], ["relationship"], ["romance", "storm", "home"], "community"],
  "a-hollow-archive": ["historical-reckoning", ["document", "investigate"], ["archive", "wilderness"], ["scholar", "investigator"], "secret-uncovering", ["solo"], ["ghost"], ["truth", "legacy"], ["archive", "ghost"], "individual"],
  "a-algorithm-love": ["ethical-dilemma", ["investigate", "rebel"], ["city", "digital"], ["scientist"], "cause-and-effect-discovery", ["romantic-pair"], ["artificial-intelligence"], ["relationship", "freedom"], ["romance", "machine"], "pair"],
  "a-wildfire-line": ["investigation", ["investigate", "survive"], ["wilderness"], ["investigator", "worker"], "procedural-problem-solving", ["team"], ["none"], ["justice", "survival"], ["fire", "mountain"], "team"],
  "a-city-sleeps": ["ethical-dilemma", ["explore", "negotiate"], ["city"], ["outsider"], "moral-choice", ["community"], ["supernatural-rule"], ["ethical", "community"], ["city", "clock"], "community"],
  "a-false-biographer": ["historical-reckoning", ["document", "investigate"], ["institution"], ["artist", "scholar"], "secret-uncovering", ["rivals"], ["none"], ["truth", "legacy"], ["book", "science"], "pair"],
  "a-after-harvest": ["second-chance", ["investigate", "care"], ["wilderness", "garden"], ["caretaker", "scientist"], "cause-and-effect-discovery", ["romantic-pair"], ["future-technology"], ["relationship", "truth"], ["science", "garden"], "pair"],
};

const DIMENSIONS: MelanieDimension[] = [
  "speculation", "darkness", "humor", "romance", "mystery", "scale", "emotion", "pace", "character",
];

function makeConcept(ageBand: AgeBandV2, seed: ConceptSeed, index: number): MelanieConcept {
  const [id, title, synopsis, genres, tones, themes, dynamics, settings, axes] = seed;
  const semanticSeed = SEMANTIC_SEEDS[id];
  if (!semanticSeed) throw new Error(`missing_melanie_semantic_fingerprint:${id}`);
  const [
    premiseFamily, centralActivities, settingClasses, protagonistRoles, narrativeEngine,
    relationshipShapes, speculativeDevices, stakesShapes, keyCoverMotifs, socialFocus,
  ] = semanticSeed;
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
    semantic: {
      premiseFamily,
      centralActivities,
      settingClasses,
      protagonistRoles,
      narrativeEngine,
      relationshipShapes,
      speculativeDevices,
      stakesShapes,
      keyCoverMotifs,
      socialFocus,
    },
  };
}

export const MELANIES_CONCEPTS: Record<AgeBandV2, MelanieConcept[]> = {
  kids: [
    ...seeds.kids.map((seed, index) => makeConcept("kids", seed, index)),
    ...ADDITIONAL_MELANIE_CONCEPTS.kids,
  ],
  preteens: [
    ...seeds.preteens.map((seed, index) => makeConcept("preteens", seed, index)),
    ...ADDITIONAL_MELANIE_CONCEPTS.preteens,
  ],
  teens: [
    ...seeds.teens.map((seed, index) => makeConcept("teens", seed, index)),
    ...ADDITIONAL_MELANIE_CONCEPTS.teens,
  ],
  adult: [
    ...seeds.adult.map((seed, index) => makeConcept("adult", seed, index)),
    ...ADDITIONAL_MELANIE_CONCEPTS.adult,
  ],
};

export type MelaniePresentationEvidence = {
  schemaVersion: typeof MELANIES_GAME_EVIDENCE_SCHEMA;
  presentationId: string;
  round: 1 | 2 | 3;
  occurredAt: string;
  presented: { id: string; attributes: MelanieAttributes; semantic: MelanieSemanticFingerprint }[];
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

function facetOverlap<T extends string>(left: readonly T[], right: readonly T[]): number {
  const union = new Set([...left, ...right]);
  if (!union.size) return 0;
  return [...new Set(left)].filter((value) => right.includes(value)).length / union.size;
}

export function melanieSemanticSimilarity(left: MelanieConcept, right: MelanieConcept): number {
  const a = left.semantic;
  const b = right.semantic;
  return (
    (a.premiseFamily === b.premiseFamily ? 0.2 : 0)
    + (a.narrativeEngine === b.narrativeEngine ? 0.2 : 0)
    + facetOverlap(a.centralActivities, b.centralActivities) * 0.12
    + facetOverlap(a.settingClasses, b.settingClasses) * 0.1
    + facetOverlap(a.protagonistRoles, b.protagonistRoles) * 0.08
    + facetOverlap(a.relationshipShapes, b.relationshipShapes) * 0.07
    + facetOverlap(a.speculativeDevices, b.speculativeDevices) * 0.09
    + facetOverlap(a.stakesShapes, b.stakesShapes) * 0.08
    + (a.socialFocus === b.socialFocus ? 0.06 : 0)
  );
}

export function selectSemanticallyDiverseConcepts(
  rankedCandidates: readonly { concept: MelanieConcept; relevance: number; tie: number }[],
  anchors: readonly MelanieConcept[],
  count: number,
): MelanieConcept[] {
  const remaining = [...rankedCandidates];
  const selected: MelanieConcept[] = [];
  const rankedRelevance = new Map(
    [...remaining]
      .sort((left, right) => right.relevance - left.relevance || left.tie - right.tie || left.concept.id.localeCompare(right.concept.id))
      .map((candidate, index) => [candidate.concept.id, 1 - index / Math.max(1, remaining.length - 1)]),
  );
  while (selected.length < count && remaining.length) {
    const comparison = [...anchors, ...selected];
    const familyCounts = new Map<MelaniePremiseFamily, number>();
    const engineCounts = new Map<MelanieNarrativeEngine, number>();
    const signatures = new Set<string>();
    for (const concept of comparison) {
      familyCounts.set(concept.semantic.premiseFamily, (familyCounts.get(concept.semantic.premiseFamily) || 0) + 1);
      engineCounts.set(concept.semantic.narrativeEngine, (engineCounts.get(concept.semantic.narrativeEngine) || 0) + 1);
      signatures.add(`${concept.semantic.premiseFamily}:${concept.semantic.narrativeEngine}`);
    }
    const strict = remaining.filter(({ concept }) => (
      (familyCounts.get(concept.semantic.premiseFamily) || 0) < 1
      && (engineCounts.get(concept.semantic.narrativeEngine) || 0) < 1
      && !signatures.has(`${concept.semantic.premiseFamily}:${concept.semantic.narrativeEngine}`)
      && comparison.every((existing) => melanieSemanticSimilarity(concept, existing) < 0.72)
    ));
    const capped = remaining.filter(({ concept }) => (
      (familyCounts.get(concept.semantic.premiseFamily) || 0) < 2
      && (engineCounts.get(concept.semantic.narrativeEngine) || 0) < 2
    ));
    const familyCapped = remaining.filter(({ concept }) => (
      (familyCounts.get(concept.semantic.premiseFamily) || 0) < 2
    ));
    const source = strict.length ? strict : capped.length ? capped : familyCapped.length ? familyCapped : remaining;
    source.sort((left, right) => {
      const utility = (candidate: typeof left) => {
        const maxOverlap = comparison.length
          ? Math.max(...comparison.map((concept) => melanieSemanticSimilarity(candidate.concept, concept)))
          : 0;
        const familyRepeat = familyCounts.get(candidate.concept.semantic.premiseFamily) || 0;
        const engineRepeat = engineCounts.get(candidate.concept.semantic.narrativeEngine) || 0;
        return (rankedRelevance.get(candidate.concept.id) || 0) - maxOverlap * 0.72 - familyRepeat * 0.22 - engineRepeat * 0.26;
      };
      return utility(right) - utility(left) || left.tie - right.tie || left.concept.id.localeCompare(right.concept.id);
    });
    const winner = source[0];
    selected.push(winner.concept);
    remaining.splice(remaining.findIndex(({ concept }) => concept.id === winner.concept.id), 1);
  }
  return selected;
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
  const ordered = deterministicOrder(MELANIES_CONCEPTS[args.ageBand], seed);
  const currentConceptIds = selectSemanticallyDiverseConcepts(
    ordered.map((concept, index) => ({ concept, relevance: ordered.length - index, tie: hash(`${seed}:${concept.id}`) })),
    [],
    6,
  ).map((concept) => concept.id);
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
      return { id, attributes: concept.attributes, semantic: concept.semantic };
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
  const scored = unseen
    .map((concept) => ({
      concept,
      relevance: candidateDiscriminatorScore(concept, survivorConcepts, scores),
      tie: hash(`${state.gameSessionId}:round-${round}:${concept.id}`),
    }));
  return selectSemanticallyDiverseConcepts(scored, survivorConcepts, count).map((concept) => concept.id);
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
    if (!item || typeof item !== "object" || !exactKeys(item, ["id", "attributes", "semantic"])) return false;
    const concept = authored.get(item.id);
    if (
      !concept
      || JSON.stringify(item.attributes) !== JSON.stringify(concept.attributes)
      || JSON.stringify(item.semantic) !== JSON.stringify(concept.semantic)
    ) return false;
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
