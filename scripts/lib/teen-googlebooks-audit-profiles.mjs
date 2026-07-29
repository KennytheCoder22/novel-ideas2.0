// 26 Teen Google Books audit profiles across 8 genre families.
// Each profile uses only signal fields the recommender accepts.
// The `family` label is metadata for reporting; the actual query family is
// captured from the live result's fetch-diagnostic `queryFamily` field.

export const TEEN_AUDIT_PROFILES = [
  // ── MYSTERY / THRILLER (4 profiles) ──────────────────────────────────────

  {
    id: "mystery-classic-whodunit",
    label: "Classic whodunit mystery",
    family: "mystery",
    ageBand: "teens",
    signals: [
      { action: "like", title: "Truly Devious", source: "googleBooks", format: "book", genres: ["mystery"], tones: ["suspenseful"], themes: ["investigation", "whodunit"] },
      { action: "like", title: "One of Us Is Lying", source: "googleBooks", format: "book", genres: ["mystery"], tones: ["dramatic"], themes: ["secrets", "suspects"] },
      { action: "like", title: "A Good Girl's Guide to Murder", source: "googleBooks", format: "book", genres: ["mystery"], tones: ["tense"], themes: ["true crime", "investigation"] },
      { action: "dislike", title: "Twilight", source: "googleBooks", format: "book", genres: ["romance", "fantasy"], tones: ["romantic"] },
      { action: "dislike", title: "The Hunger Games", source: "googleBooks", format: "book", genres: ["science fiction"], tones: ["bleak"] },
      { action: "skip", title: "Harry Potter and the Sorcerer's Stone", source: "googleBooks", format: "book", genres: ["fantasy"] },
    ],
  },
  {
    id: "mystery-psychological-thriller",
    label: "Psychological thriller mystery",
    family: "mystery",
    ageBand: "teens",
    signals: [
      { action: "like", title: "We Were Liars", source: "googleBooks", format: "book", genres: ["mystery"], tones: ["atmospheric", "suspenseful"], themes: ["memory", "family secrets"] },
      { action: "like", title: "The Female of the Species", source: "googleBooks", format: "book", genres: ["mystery", "thriller"], tones: ["dark", "tense"], themes: ["revenge"] },
      { action: "like", title: "Allegedly", source: "googleBooks", format: "book", genres: ["thriller", "mystery"], tones: ["unsettling"], themes: ["unreliable narrator"] },
      { action: "dislike", title: "Eragon", source: "googleBooks", format: "book", genres: ["fantasy"], tones: ["adventurous"] },
      { action: "dislike", title: "City of Bones", source: "googleBooks", format: "book", genres: ["fantasy"], tones: ["action-packed"] },
    ],
  },
  {
    id: "mystery-detective-crime",
    label: "Detective and crime mystery",
    family: "mystery",
    ageBand: "teens",
    signals: [
      { action: "like", title: "I Am the Messenger", source: "googleBooks", format: "book", genres: ["mystery", "general"], tones: ["introspective"], themes: ["helping others", "identity"] },
      { action: "like", title: "The Westing Game", source: "googleBooks", format: "book", genres: ["mystery"], tones: ["clever"], themes: ["puzzles", "clues", "competition"] },
      { action: "like", title: "Holes", source: "googleBooks", format: "book", genres: ["mystery", "adventure"], tones: ["quirky"], themes: ["justice", "secrets"] },
      { action: "dislike", title: "Breaking Dawn", source: "googleBooks", format: "book", genres: ["romance", "fantasy"] },
      { action: "skip", title: "Catching Fire", source: "googleBooks", format: "book", genres: ["science fiction"] },
    ],
  },
  {
    id: "mystery-cozy-amateur",
    label: "Cozy amateur-sleuth mystery",
    family: "mystery",
    ageBand: "teens",
    signals: [
      { action: "like", title: "The Inheritance Games", source: "googleBooks", format: "book", genres: ["mystery"], tones: ["fun", "page-turning"], themes: ["puzzles", "inheritance"] },
      { action: "like", title: "Sadie", source: "googleBooks", format: "book", genres: ["mystery"], tones: ["urgent", "suspenseful"], themes: ["missing persons", "justice"] },
      { action: "dislike", title: "Divergent", source: "googleBooks", format: "book", genres: ["science fiction"], tones: ["grim"] },
      { action: "dislike", title: "Maze Runner", source: "googleBooks", format: "book", genres: ["science fiction"], tones: ["dark"] },
      { action: "skip", title: "Shadow and Bone", source: "googleBooks", format: "book", genres: ["fantasy"] },
    ],
  },

  // ── FANTASY (4 profiles) ──────────────────────────────────────────────────

  {
    id: "fantasy-high-epic",
    label: "High epic fantasy",
    family: "fantasy",
    ageBand: "teens",
    signals: [
      { action: "like", title: "Eragon", source: "googleBooks", format: "book", genres: ["fantasy"], tones: ["epic", "adventurous"], themes: ["chosen one", "dragons"] },
      { action: "like", title: "Throne of Glass", source: "googleBooks", format: "book", genres: ["fantasy"], tones: ["action-packed"], themes: ["assassin", "magic"] },
      { action: "like", title: "The Name of the Wind", source: "googleBooks", format: "book", genres: ["fantasy"], tones: ["lyrical"], themes: ["magic school", "legend"] },
      { action: "dislike", title: "The Fault in Our Stars", source: "googleBooks", format: "book", genres: ["general", "contemporary"], tones: ["tearjerker"] },
      { action: "dislike", title: "Looking for Alaska", source: "googleBooks", format: "book", genres: ["general", "contemporary"] },
      { action: "skip", title: "Ender's Game", source: "googleBooks", format: "book", genres: ["science fiction"] },
    ],
  },
  {
    id: "fantasy-urban-paranormal",
    label: "Urban paranormal fantasy",
    family: "fantasy",
    ageBand: "teens",
    signals: [
      { action: "like", title: "City of Bones", source: "googleBooks", format: "book", genres: ["fantasy"], tones: ["action-packed"], themes: ["shadowhunters", "demons", "urban magic"] },
      { action: "like", title: "Daughter of Smoke and Bone", source: "googleBooks", format: "book", genres: ["fantasy"], tones: ["lush", "atmospheric"], themes: ["angels and demons", "forbidden love"] },
      { action: "like", title: "Strange the Dreamer", source: "googleBooks", format: "book", genres: ["fantasy"], tones: ["gorgeous"], themes: ["gods", "mythology", "wonder"] },
      { action: "dislike", title: "The Giver", source: "googleBooks", format: "book", genres: ["science fiction"], tones: ["somber"] },
      { action: "skip", title: "Divergent", source: "googleBooks", format: "book", genres: ["science fiction"] },
    ],
  },
  {
    id: "fantasy-dark-court",
    label: "Dark court and fae fantasy",
    family: "fantasy",
    ageBand: "teens",
    signals: [
      { action: "like", title: "The Cruel Prince", source: "googleBooks", format: "book", genres: ["fantasy"], tones: ["dark", "tense"], themes: ["fae", "power", "survival"] },
      { action: "like", title: "A Court of Thorns and Roses", source: "googleBooks", format: "book", genres: ["fantasy"], tones: ["romantic", "dark"], themes: ["fae", "beauty and the beast retelling"] },
      { action: "like", title: "An Ember in the Ashes", source: "googleBooks", format: "book", genres: ["fantasy"], tones: ["brutal"], themes: ["oppression", "empire", "rebellion"] },
      { action: "dislike", title: "The Hate U Give", source: "googleBooks", format: "book", genres: ["general", "contemporary"] },
      { action: "dislike", title: "Speak", source: "googleBooks", format: "book", genres: ["general", "contemporary"] },
    ],
  },
  {
    id: "fantasy-fairy-tale-retelling",
    label: "Fairy tale retelling fantasy",
    family: "fantasy",
    ageBand: "teens",
    signals: [
      { action: "like", title: "Cinder", source: "googleBooks", format: "book", genres: ["fantasy", "science fiction"], tones: ["fun"], themes: ["Cinderella retelling", "cyborg"] },
      { action: "like", title: "The School for Good and Evil", source: "googleBooks", format: "book", genres: ["fantasy"], tones: ["whimsical"], themes: ["fairy tale", "good vs evil"] },
      { action: "like", title: "Heartless", source: "googleBooks", format: "book", genres: ["fantasy"], tones: ["dark", "lush"], themes: ["Alice in Wonderland", "origin story"] },
      { action: "dislike", title: "The Maze Runner", source: "googleBooks", format: "book", genres: ["science fiction"] },
      { action: "skip", title: "Scythe", source: "googleBooks", format: "book", genres: ["science fiction"] },
    ],
  },

  // ── HORROR (3 profiles) ───────────────────────────────────────────────────

  {
    id: "horror-supernatural-ghost",
    label: "Supernatural and ghost horror",
    family: "horror",
    ageBand: "teens",
    signals: [
      { action: "like", title: "Miss Peregrine's Home for Peculiar Children", source: "googleBooks", format: "book", genres: ["horror", "fantasy"], tones: ["eerie"], themes: ["peculiar children", "time loop", "monsters"] },
      { action: "like", title: "Coraline", source: "googleBooks", format: "book", genres: ["horror", "fantasy"], tones: ["creepy", "dark"], themes: ["parallel world", "button eyes"] },
      { action: "like", title: "The Haunting of Hill House", source: "googleBooks", format: "book", genres: ["horror"], tones: ["atmospheric", "dread-filled"], themes: ["haunted house", "psychological"] },
      { action: "dislike", title: "Twilight", source: "googleBooks", format: "book", genres: ["romance", "fantasy"], tones: ["romantic"] },
      { action: "dislike", title: "The Fault in Our Stars", source: "googleBooks", format: "book", genres: ["general", "contemporary"] },
    ],
  },
  {
    id: "horror-gothic-dark",
    label: "Gothic and dark horror",
    family: "horror",
    ageBand: "teens",
    signals: [
      { action: "like", title: "Dracula", source: "googleBooks", format: "book", genres: ["horror"], tones: ["gothic", "atmospheric"], themes: ["vampires", "epistolary"] },
      { action: "like", title: "The Picture of Dorian Gray", source: "googleBooks", format: "book", genres: ["horror", "general"], tones: ["dark", "witty"], themes: ["vanity", "corruption", "art"] },
      { action: "like", title: "Frankenstein", source: "googleBooks", format: "book", genres: ["horror", "science fiction"], tones: ["gothic"], themes: ["creation", "responsibility"] },
      { action: "dislike", title: "Eragon", source: "googleBooks", format: "book", genres: ["fantasy"], tones: ["adventurous"] },
      { action: "skip", title: "The Giver", source: "googleBooks", format: "book", genres: ["science fiction"] },
    ],
  },
  {
    id: "horror-psychological-thriller",
    label: "Psychological and body horror",
    family: "horror",
    ageBand: "teens",
    signals: [
      { action: "like", title: "The Merciless", source: "googleBooks", format: "book", genres: ["horror"], tones: ["disturbing", "tense"], themes: ["exorcism", "mean girls", "paranoia"] },
      { action: "like", title: "Wilder Girls", source: "googleBooks", format: "book", genres: ["horror", "science fiction"], tones: ["visceral", "eerie"], themes: ["body horror", "friendship", "survival"] },
      { action: "dislike", title: "Anna and the French Kiss", source: "googleBooks", format: "book", genres: ["romance", "general"] },
      { action: "dislike", title: "Eleanor and Park", source: "googleBooks", format: "book", genres: ["romance", "general"] },
      { action: "skip", title: "Throne of Glass", source: "googleBooks", format: "book", genres: ["fantasy"] },
    ],
  },

  // ── SCIENCE FICTION (3 profiles) ─────────────────────────────────────────

  {
    id: "scifi-space-opera",
    label: "Space opera science fiction",
    family: "science_fiction",
    ageBand: "teens",
    signals: [
      { action: "like", title: "Skyward", source: "googleBooks", format: "book", genres: ["science fiction"], tones: ["adventurous", "hopeful"], themes: ["pilots", "alien war"] },
      { action: "like", title: "Aurora Rising", source: "googleBooks", format: "book", genres: ["science fiction"], tones: ["fast-paced"], themes: ["found family", "space crew"] },
      { action: "like", title: "Ender's Game", source: "googleBooks", format: "book", genres: ["science fiction"], tones: ["intense"], themes: ["military strategy", "gifted children"] },
      { action: "dislike", title: "Speak", source: "googleBooks", format: "book", genres: ["general", "contemporary"] },
      { action: "dislike", title: "The Hate U Give", source: "googleBooks", format: "book", genres: ["general", "contemporary"] },
    ],
  },
  {
    id: "scifi-dystopian",
    label: "Dystopian science fiction",
    family: "science_fiction",
    ageBand: "teens",
    signals: [
      { action: "like", title: "Legend", source: "googleBooks", format: "book", genres: ["science fiction"], tones: ["tense", "action-packed"], themes: ["dystopia", "rebellion"] },
      { action: "like", title: "Scythe", source: "googleBooks", format: "book", genres: ["science fiction"], tones: ["tense", "philosophical"], themes: ["death", "utopia turned dystopia"] },
      { action: "dislike", title: "Station Eleven", source: "googleBooks", format: "book", genres: ["science fiction"], tones: ["literary", "slow"] },
      { action: "dislike", title: "City of Bones", source: "googleBooks", format: "book", genres: ["fantasy"] },
      { action: "skip", title: "The Cruel Prince", source: "googleBooks", format: "book", genres: ["fantasy"] },
    ],
  },
  {
    id: "scifi-speculative-mixed",
    label: "Speculative and tech science fiction",
    family: "science_fiction",
    ageBand: "teens",
    signals: [
      { action: "like", title: "The 5th Wave", source: "googleBooks", format: "book", genres: ["science fiction"], tones: ["urgent", "dark"], themes: ["alien invasion", "survival"] },
      { action: "like", title: "Illuminae", source: "googleBooks", format: "book", genres: ["science fiction"], tones: ["propulsive"], themes: ["AI", "space disaster", "documents"] },
      { action: "dislike", title: "The Fault in Our Stars", source: "googleBooks", format: "book", genres: ["general", "contemporary"] },
      { action: "dislike", title: "Anna and the French Kiss", source: "googleBooks", format: "book", genres: ["romance"] },
      { action: "skip", title: "Truly Devious", source: "googleBooks", format: "book", genres: ["mystery"] },
    ],
  },

  // ── CONTEMPORARY / REALISTIC (3 profiles) ────────────────────────────────

  {
    id: "contemporary-coming-of-age",
    label: "Coming-of-age contemporary",
    family: "contemporary",
    ageBand: "teens",
    signals: [
      { action: "like", title: "The Perks of Being a Wallflower", source: "googleBooks", format: "book", genres: ["general", "contemporary"], tones: ["heartfelt"], themes: ["identity", "mental health", "friendship"] },
      { action: "like", title: "Thirteen Reasons Why", source: "googleBooks", format: "book", genres: ["general", "contemporary"], tones: ["intense"], themes: ["grief", "teen issues", "consequences"] },
      { action: "like", title: "Eleanor and Park", source: "googleBooks", format: "book", genres: ["romance", "general"], tones: ["tender"], themes: ["first love", "outcasts"] },
      { action: "dislike", title: "Harry Potter and the Chamber of Secrets", source: "googleBooks", format: "book", genres: ["fantasy"] },
      { action: "dislike", title: "Eragon", source: "googleBooks", format: "book", genres: ["fantasy"] },
    ],
  },
  {
    id: "contemporary-issues-social",
    label: "Social issues contemporary",
    family: "contemporary",
    ageBand: "teens",
    signals: [
      { action: "like", title: "The Hate U Give", source: "googleBooks", format: "book", genres: ["general", "contemporary"], tones: ["powerful"], themes: ["racism", "police brutality", "identity"] },
      { action: "like", title: "Speak", source: "googleBooks", format: "book", genres: ["general", "contemporary"], tones: ["raw"], themes: ["trauma", "silence", "recovery"] },
      { action: "like", title: "All American Boys", source: "googleBooks", format: "book", genres: ["general", "contemporary"], tones: ["urgent"], themes: ["racism", "justice", "community"] },
      { action: "dislike", title: "Twilight", source: "googleBooks", format: "book", genres: ["romance", "fantasy"] },
      { action: "skip", title: "The Hunger Games", source: "googleBooks", format: "book", genres: ["science fiction"] },
    ],
  },
  {
    id: "contemporary-friendship-family",
    label: "Friendship and family contemporary",
    family: "contemporary",
    ageBand: "teens",
    signals: [
      { action: "like", title: "To All the Boys I've Loved Before", source: "googleBooks", format: "book", genres: ["romance", "general"], tones: ["sweet", "fun"], themes: ["first love", "letters", "family"] },
      { action: "like", title: "The Sun Is Also a Star", source: "googleBooks", format: "book", genres: ["romance", "general"], tones: ["lyrical"], themes: ["fate", "love", "immigration"] },
      { action: "dislike", title: "Game of Thrones", source: "googleBooks", format: "book", genres: ["fantasy"], tones: ["brutal"] },
      { action: "dislike", title: "Ender's Game", source: "googleBooks", format: "book", genres: ["science fiction"] },
      { action: "skip", title: "Miss Peregrine's Home for Peculiar Children", source: "googleBooks", format: "book", genres: ["horror"] },
    ],
  },

  // ── HISTORICAL FICTION (3 profiles) ──────────────────────────────────────

  {
    id: "historical-war-era",
    label: "War-era historical fiction",
    family: "historical",
    ageBand: "teens",
    signals: [
      { action: "like", title: "The Book Thief", source: "googleBooks", format: "book", genres: ["historical fiction", "general"], tones: ["lyrical", "heartbreaking"], themes: ["World War II", "books", "death as narrator"] },
      { action: "like", title: "Between Shades of Gray", source: "googleBooks", format: "book", genres: ["historical fiction"], tones: ["harrowing"], themes: ["Soviet occupation", "survival", "Lithuania"] },
      { action: "like", title: "Wolf by Wolf", source: "googleBooks", format: "book", genres: ["historical fiction", "fantasy"], tones: ["gripping"], themes: ["alternate WWII", "motorcycle race", "identity"] },
      { action: "dislike", title: "City of Bones", source: "googleBooks", format: "book", genres: ["fantasy"] },
      { action: "dislike", title: "Scythe", source: "googleBooks", format: "book", genres: ["science fiction"] },
    ],
  },
  {
    id: "historical-adventure-exploration",
    label: "Historical adventure and exploration",
    family: "historical",
    ageBand: "teens",
    signals: [
      { action: "like", title: "Pirates!", source: "googleBooks", format: "book", genres: ["historical fiction", "adventure"], tones: ["swashbuckling"], themes: ["pirates", "high seas"] },
      { action: "like", title: "The Witch of Blackbird Pond", source: "googleBooks", format: "book", genres: ["historical fiction"], tones: ["atmospheric"], themes: ["Puritan New England", "outsider", "belonging"] },
      { action: "like", title: "Johnny Tremain", source: "googleBooks", format: "book", genres: ["historical fiction", "adventure"], tones: ["patriotic"], themes: ["American Revolution", "coming of age"] },
      { action: "dislike", title: "Twilight", source: "googleBooks", format: "book", genres: ["romance", "fantasy"] },
      { action: "skip", title: "The Fault in Our Stars", source: "googleBooks", format: "book", genres: ["general", "contemporary"] },
    ],
  },
  {
    id: "historical-drama-social",
    label: "Historical social drama",
    family: "historical",
    ageBand: "teens",
    signals: [
      { action: "like", title: "Code Name Verity", source: "googleBooks", format: "book", genres: ["historical fiction"], tones: ["devastating", "twisty"], themes: ["friendship", "WWII", "spy"] },
      { action: "like", title: "The Kite Runner", source: "googleBooks", format: "book", genres: ["historical fiction", "general"], tones: ["devastating"], themes: ["friendship", "guilt", "Afghanistan"] },
      { action: "dislike", title: "The Cruel Prince", source: "googleBooks", format: "book", genres: ["fantasy"] },
      { action: "dislike", title: "Illuminae", source: "googleBooks", format: "book", genres: ["science fiction"] },
    ],
  },

  // ── ROMANCE (3 profiles) ──────────────────────────────────────────────────

  {
    id: "romance-contemporary-sweet",
    label: "Sweet contemporary romance",
    family: "romance",
    ageBand: "teens",
    signals: [
      { action: "like", title: "Anna and the French Kiss", source: "googleBooks", format: "book", genres: ["romance", "general"], tones: ["fun", "swoony"], themes: ["Paris", "study abroad", "first love"] },
      { action: "like", title: "P.S. I Like You", source: "googleBooks", format: "book", genres: ["romance", "general"], tones: ["cute", "witty"], themes: ["music", "pen pals", "enemies to lovers"] },
      { action: "like", title: "The DUFF", source: "googleBooks", format: "book", genres: ["romance", "general"], tones: ["funny", "heartfelt"], themes: ["self-esteem", "first love"] },
      { action: "dislike", title: "Dracula", source: "googleBooks", format: "book", genres: ["horror"] },
      { action: "dislike", title: "Ender's Game", source: "googleBooks", format: "book", genres: ["science fiction"] },
    ],
  },
  {
    id: "romance-fantasy-slow-burn",
    label: "Fantasy slow-burn romance",
    family: "romance",
    ageBand: "teens",
    signals: [
      { action: "like", title: "A Court of Mist and Fury", source: "googleBooks", format: "book", genres: ["fantasy", "romance"], tones: ["slow-burn", "epic"], themes: ["fae", "trauma recovery", "love"] },
      { action: "like", title: "Flame in the Mist", source: "googleBooks", format: "book", genres: ["historical fiction", "romance", "fantasy"], tones: ["atmospheric"], themes: ["feudal Japan", "disguise", "revenge"] },
      { action: "dislike", title: "The Perks of Being a Wallflower", source: "googleBooks", format: "book", genres: ["general", "contemporary"] },
      { action: "dislike", title: "The Maze Runner", source: "googleBooks", format: "book", genres: ["science fiction"] },
      { action: "skip", title: "Ender's Game", source: "googleBooks", format: "book", genres: ["science fiction"] },
    ],
  },
  {
    id: "romance-royals-enemies",
    label: "Royals and enemies-to-lovers romance",
    family: "romance",
    ageBand: "teens",
    signals: [
      { action: "like", title: "Red, White and Royal Blue", source: "googleBooks", format: "book", genres: ["romance", "general"], tones: ["charming", "fun"], themes: ["royalty", "politics", "enemies to lovers"] },
      { action: "like", title: "The Selection", source: "googleBooks", format: "book", genres: ["romance", "science fiction"], tones: ["fun"], themes: ["competition", "prince", "dystopian romance"] },
      { action: "dislike", title: "The Haunting of Hill House", source: "googleBooks", format: "book", genres: ["horror"] },
      { action: "dislike", title: "Eragon", source: "googleBooks", format: "book", genres: ["fantasy"] },
    ],
  },

  // ── GENERAL / MIXED (3 profiles) ─────────────────────────────────────────

  {
    id: "general-adventure-action",
    label: "Adventure and action general",
    family: "general",
    ageBand: "teens",
    signals: [
      { action: "like", title: "The Maze Runner", source: "googleBooks", format: "book", genres: ["science fiction", "adventure"], tones: ["fast-paced"], themes: ["survival", "mystery", "group dynamics"] },
      { action: "like", title: "Hatchet", source: "googleBooks", format: "book", genres: ["adventure", "general"], tones: ["gripping"], themes: ["survival", "wilderness", "self-reliance"] },
      { action: "like", title: "My Side of the Mountain", source: "googleBooks", format: "book", genres: ["adventure", "general"], tones: ["peaceful"], themes: ["wilderness", "independence"] },
      { action: "dislike", title: "Twilight", source: "googleBooks", format: "book", genres: ["romance", "fantasy"] },
      { action: "skip", title: "Thirteen Reasons Why", source: "googleBooks", format: "book", genres: ["general", "contemporary"] },
    ],
  },
  {
    id: "general-mixed-broad",
    label: "Broad mixed-genre general",
    family: "general",
    ageBand: "teens",
    signals: [
      { action: "like", title: "Inkheart", source: "googleBooks", format: "book", genres: ["fantasy", "adventure"], tones: ["magical"], themes: ["books within books", "reading magic"] },
      { action: "like", title: "A Wrinkle in Time", source: "googleBooks", format: "book", genres: ["science fiction", "fantasy"], tones: ["wonder-filled"], themes: ["time travel", "family", "love"] },
      { action: "like", title: "The Golden Compass", source: "googleBooks", format: "book", genres: ["fantasy"], tones: ["epic"], themes: ["daemons", "free will", "parallel worlds"] },
      { action: "dislike", title: "The Hate U Give", source: "googleBooks", format: "book", genres: ["general", "contemporary"] },
      { action: "dislike", title: "Anna and the French Kiss", source: "googleBooks", format: "book", genres: ["romance"] },
    ],
  },
  {
    id: "general-weak-minimal",
    label: "Weak minimal signals general",
    family: "general",
    ageBand: "teens",
    signals: [
      { action: "like", title: "Keeper of the Lost Cities", source: "googleBooks", format: "book", genres: ["fantasy"], tones: ["fun"], themes: ["academy"] },
      { action: "skip", title: "Percy Jackson and the Olympians", source: "googleBooks", format: "book", genres: ["fantasy"], themes: ["mythology"] },
      { action: "skip", title: "One Crazy Summer", source: "googleBooks", format: "book", genres: ["general"] },
    ],
  },
];
