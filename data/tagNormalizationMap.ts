// data/tagNormalizationMap.ts
// NovelIdeas tag normalization map
//
// Purpose:
// - Convert any raw swipe-card tag (e.g. "theme:identity_breakdown", "genre:scifi", "vibe:cozy")
//   into a CanonicalTag from NovelIdeas Canonical Vocabulary v1.0.
// - Fail-closed: if a tag cannot be mapped safely, return null so it does not pollute inference.
//
// Canonical source: NovelIdeas_Canonical_Vocabulary_v1.docx (exported to a union type below).

export type CanonicalTag =
  | "adventure"
  | "ai"
  | "animals"
  | "anthology"
  | "atmospheric"
  | "audiobook friendly"
  | "authority"
  | "betrayal"
  | "calm"
  | "comedy"
  | "coming of age"
  | "community"
  | "concise"
  | "courage"
  | "cozy"
  | "crime"
  | "dark"
  | "dinosaurs"
  | "drama"
  | "dystopian"
  | "early reader"
  | "emotional growth"
  | "energetic"
  | "epic"
  | "family"
  | "fantasy"
  | "fast-paced"
  | "film"
  | "friendship"
  | "gentle"
  | "graphic novel"
  | "heroic"
  | "high stakes"
  | "historical"
  | "hopeful"
  | "horror"
  | "human connection"
  | "identity"
  | "illustrated"
  | "kindness"
  | "love"
  | "melancholic"
  | "moral conflict"
  | "music"
  | "mystery"
  | "mythology"
  | "nature"
  | "nonfiction"
  | "nostalgia"
  | "ocean"
  | "outsider"
  | "picture book"
  | "playful"
  | "political"
  | "poverty"
  | "quirky"
  | "realistic"
  | "rebellion"
  | "redemption"
  | "regret"
  | "resilience"
  | "revenge"
  | "rivalry"
  | "robots"
  | "romance"
  | "satire"
  | "school"
  | "science fiction"
  | "self-destruction"
  | "self-expression"
  | "series"
  | "short chapters"
  | "short stories"
  | "slow-paced"
  | "social commentary"
  | "space"
  | "spooky"
  | "standalone"
  | "superheroes"
  | "survival"
  | "systemic injustice"
  | "thriller"
  | "time travel"
  | "uplifting"
  | "vehicles"
  | "vulnerability"
  | "war & society"
  | "warm"
  | "weird"
  | "western"
  | "whimsical"

  | "dog"
  | "cat"
  | "bear"
  | "rabbit"
  | "fox"
  | "monkey"
  | "unicorn"
  | "dragon"
  | "pirate"
  | "princess"
  | "castle"
  | "farm"
  | "zoo"
  | "jungle"
  | "treasure"
  | "chase"
  | "runaway"

  ;

const CANONICAL_SET = new Set<CanonicalTag>([
  "adventure",
  "ai",
  "animals",
  "anthology",
  "atmospheric",
  "audiobook friendly",
  "authority",
  "betrayal",
  "calm",
  "comedy",
  "coming of age",
  "community",
  "concise",
  "courage",
  "cozy",
  "crime",
  "dark",
  "dinosaurs",
  "drama",
  "dystopian",
  "early reader",
  "emotional growth",
  "energetic",
  "epic",
  "family",
  "fantasy",
  "fast-paced",
  "film",
  "friendship",
  "gentle",
  "graphic novel",
  "heroic",
  "high stakes",
  "historical",
  "hopeful",
  "horror",
  "human connection",
  "identity",
  "illustrated",
  "kindness",
  "love",
  "melancholic",
  "moral conflict",
  "music",
  "mystery",
  "mythology",
  "nature",
  "nonfiction",
  "nostalgia",
  "ocean",
  "outsider",
  "picture book",
  "playful",
  "political",
  "poverty",
  "quirky",
  "realistic",
  "rebellion",
  "redemption",
  "regret",
  "resilience",
  "revenge",
  "rivalry",
  "robots",
  "romance",
  "satire",
  "school",
  "science fiction",
  "self-destruction",
  "self-expression",
  "series",
  "short chapters",
  "short stories",
  "slow-paced",
  "social commentary",
  "space",
  "spooky",
  "standalone",
  "superheroes",
  "survival",
  "systemic injustice",
  "thriller",
  "time travel",
  "uplifting",
  "vehicles",
  "vulnerability",
  "war & society",
  "warm",
  "weird",
  "western",
  "whimsical",
  "dog",
  "cat",
  "bear",
  "rabbit",
  "fox",
  "monkey",
  "unicorn",
  "dragon",
  "pirate",
  "princess",
  "castle",
  "farm",
  "zoo",
  "jungle",
  "treasure",
  "chase",
  "runaway",
]);

// For removed / deprecated concepts (e.g., game mechanics), we explicitly return null.
type CanonicalOrNull = CanonicalTag | null;

// Maps "cleaned raw token" -> canonical tag (or null to drop).
export const tagNormalizationMap: Record<string, CanonicalOrNull> = {

  // --- Anchor nouns (positive-only) ---
  "dogs": "dog",
  "doggie": "dog",
  "doggy": "dog",
  "puppy": "dog",
  "puppies": "dog",
  "cats": "cat",
  "kitten": "cat",
  "kittens": "cat",
  "bears": "bear",
  "rabbits": "rabbit",
  "bunny": "rabbit",
  "bunnies": "rabbit",
  "foxes": "fox",
  "monkeys": "monkey",
  "unicorns": "unicorn",
  "pirates": "pirate",
  "princesses": "princess",
  "castles": "castle",
  "farms": "farm",
  "zoo": "zoo",
  "zoos": "zoo",
  "jungles": "jungle",
  "treasures": "treasure",
  "chasing": "chase",
  "chased": "chase",
  "escape": "runaway",
  "escaping": "runaway",

  // --- Core spelling / formatting normalization ---
  "scifi": "science fiction",
  "sci-fi": "science fiction",
  "sci fi": "science fiction",
  "science": "science fiction",
  "dystopia": "dystopian",
  "adventures": "adventure",
  "superhero": "superheroes",
  "superheroes": "superheroes",

  // --- Underscore to phrase normalization (common in deck tags) ---
  "coming_of_age": "coming of age",
  "self_expression": "self-expression",
  "self_destruction": "self-destruction",
  "emotional_growth": "emotional growth",
  "moral_conflict": "moral conflict",
  "high_stakes": "high stakes",
  "time_travel": "time travel",
  "short_chapters": "short chapters",
  "fast": "fast-paced",
  "slow": "slow-paced",
  "not_too_long": "concise",
  "audiobook_friendly": "audiobook friendly",
  "graphic_novel": "graphic novel",
  "picture_book": "picture book",
  "short_stories": "short stories",
  "early_reader": "early reader",

  // --- Theme consolidations (collapsed concepts) ---
  "identity_breakdown": "identity",
  "self_realization": "identity",
  "self_reflection": "identity",
  "self_confidence": "identity",
  "youth_voice": "coming of age",
  "youth_alienation": "outsider",
  "isolation": "outsider",
  "loneliness": "outsider",
  "outsider": "outsider",

  "healing": "emotional growth",
  "growth": "emotional growth",
  "quiet_emotional": "melancholic",
  "melancholic": "melancholic",
  "heartbreak": "regret",
  "emotional_closure": "regret",
  "reflection": "nostalgia",
  "reflective": "nostalgia",
  "memory": "nostalgia",

  "love_family": "love",
  "love_growth": "love",
  "love_loss": "love",
  "relationships": "human connection",
  "interpersonal": "human connection",
  "interpersonal_drama": "human connection",
  "human_experience": "human connection",
  "helping": "kindness",
  "empathy": "kindness",

  "anti_establishment": "rebellion",
  "resistance": "rebellion",
  "counterculture": "rebellion",
  "systems_critique": "systemic injustice",
  "poverty_systems": "poverty",
  "authority_control": "authority",
  "corporate_control": "authority",
  "war_society": "war & society",
  "crime_morality": "crime",

  // --- World / setting / misc ---
  "dragons": "fantasy",
  "magic": "fantasy",
  "magic_school": "fantasy",
  "underwater": "ocean",

  // --- Tone/vibe near-duplicates ---
  "comfort": "cozy",
  "soothing": "calm",
  "chill": "calm",
  "fun": "playful",
  "funny": "playful",
  "bright": "uplifting",
  "positive": "uplifting",
  "upbeat": "uplifting",
  "heartwarming": "warm",
  "sweet": "warm",
  "friends": "friendship",

  // --- Dropped: game mechanics & medium-only signals (describe with themes/vibes instead) ---
  "gaming": null,
  "game": null,
  "media:game": null,
  "rpg": null,
  "sandbox": null,
  "puzzle": null,
  "strategy": null,
  "open_world": null,
  "platformer": null,
  "roguelike": null,
  "racing": null,
  "tower_defense": null,
  "life_sim": null,
  "social_deduction": null,
  "metroidvania": null,

  // --- Dropped: non-canonical or too-vague tags ---
  "creative": null,
  "creativity": null,
  "curious": null,
  "curiosity": null,
  "imagination": null,
  "imaginative": null,
  "character": null,
  "character_driven": null,
  "narrative": null,
  "everyday": null,
  "indie": null,
  "kids": null,
  "reading": null,
  "lessons": null,
  "math": null,
  "patterns": null,
  "photography": null,
  "participation": null,
  "party": null,
  "routine": null,
  "songs": null,
  "technology": null,
  "time": null,
  "nightlife": null,
  "street_life": null,
  "urban_life": null,
  "urban_isolation": null,
  "urban_survival": null,
  "small_town": null,
  "race": null,
  "spiritual_emotional": null,
  "existential": null,
  "psychological": null,
  "philosophical": null,
  "morality": null,
  "womanhood": null,
};

// Normalize raw tag strings to a CanonicalTag (or null).
export function normalizeTag(raw: string | undefined | null): CanonicalOrNull {
  if (!raw) return null;

  // 1) strip category prefixes like "theme:", "genre:", etc.
  //    BUT: if a prefix exists and we don't explicitly support it, drop the tag.
  let s = String(raw).trim();
  const colonIdx = s.indexOf(":");
  if (colonIdx >= 0) {
    const key = s.slice(0, colonIdx).trim().toLowerCase();

    // Only allow structured prefixes that we understand.
    // Anything else (ex: "pacing:fast") should never enter the system.
    const ALLOWED_PREFIXES = new Set([
      "genre",
      "vibe",
      "format",
      "layout",
      "theme",
      "topic",
      "audience",
      "age",
      "media",
    ]);
    if (!ALLOWED_PREFIXES.has(key)) return null;

    s = s.slice(colonIdx + 1);
  }

  // 2) unify separators
  s = s.trim();
  if (!s) return null;

  // keep "&" because we have "war & society" canonically
  // convert underscores to spaces for lookup; we'll also check raw underscore form in the map
  const sUnderscore = s;
  const sSpace = s.replace(/_/g, " ").replace(/\s+/g, " ").trim();
  const sHyphen = sSpace.replace(/\s-\s/g, "-").trim();

  // 3) explicit map hits (try multiple forms)
  const mapped =
    tagNormalizationMap[sUnderscore] ??
    tagNormalizationMap[sSpace] ??
    tagNormalizationMap[sHyphen];

  if (mapped !== undefined) return mapped;

  // 4) accept if it exactly matches a canonical tag
  if (CANONICAL_SET.has(sSpace as CanonicalTag)) return sSpace as CanonicalTag;

  // 5) accept common hyphenated canonical forms
  if (CANONICAL_SET.has(sHyphen as CanonicalTag)) return sHyphen as CanonicalTag;

  return null;
}

// Convenience: normalize an array and drop nulls.
export function normalizeTags(rawTags: Array<string | null | undefined>): CanonicalTag[] {
  const out: CanonicalTag[] = [];
  for (const t of rawTags) {
    const nt = normalizeTag(t);
    if (nt) out.push(nt);
  }
  return out;
}
