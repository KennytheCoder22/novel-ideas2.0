export type SwipeDeckCardType =
  | "genre"
  | "topic"
  | "vibe"
  | "pace"
  | "format"
  | "character"
  | "world"
  | "access"
  // Allow non-prompt card types used as media/book signals.
  | "media"
  | "book";

export type AgeSignal = "younger" | "neutral" | "older";

export type TasteAxis =
  | "warmth"
  | "darkness"
  | "pacing"
  | "realism"
  | "characterFocus"
  | "ideaDensity";

export type TasteTraits = Partial<Record<TasteAxis, number>>;
export type SignalLevel = -2 | -1 | 0 | 1 | 2;

export interface SwipeCardSignalMetadata {
  audienceFit: SignalLevel;
  genreInterest: SignalLevel;
  toneVibe: SignalLevel;
  storyEngine: SignalLevel;
  credibilityCraft: SignalLevel;
}

export interface SwipeCardReasonMetadata {
  like: string[];
  dislike: string[];
}


/**
 * UI-only fields. Nothing in `display` should ever affect recommendation output.
 */
export interface SwipeDeckCardDisplay {
  mediaType?: string; // "Book", "Movie", "Game", etc. (chyron only)
  studio?: string;
  publisher?: string;
  year?: number;
  format?: string; // "Picture Book", "Graphic Novel", etc. (display only)
  ageRating?: string;
  // Allow additional display-only metadata without breaking typing.
  [key: string]: unknown;
}

/**
 * Recommendation-only fields. This is the *only* swipe signal that may feed TagCounts.
 */
export interface SwipeDeckCardOutput {
  genre: string[];
  vibes: string[];
  ageSignal?: AgeSignal; // Kids / Pre-Teen only (stored, not used in query yet)
}

export interface SwipeDeckCard {
  /**
   * Many cards in the app are prompt-style (id/type/prompt/tags),
   * but some "signal" cards (movies/TV/games) and fallback cards
   * are title/author based. Keep this flexible to match runtime behavior.
   */
  id?: string;
  type?: SwipeDeckCardType;

  // Prompt-style cards
  prompt?: string;

  // Title-style cards (media or book signals)
  title?: string;
  author?: string;
  genre?: string;

  // Legacy tag list (deprecated for new decks). Prefer `output`.
  tags?: string[];

  // New split model
  display?: SwipeDeckCardDisplay;
  output?: SwipeDeckCardOutput;

  // New: 20Q-aligned structured trait evidence.
  // These values represent how strongly this card signals each taste axis.
  // Recommended range is roughly -1 to 1.
  tasteTraits?: TasteTraits;
  signals?: SwipeCardSignalMetadata;
  reasons?: SwipeCardReasonMetadata;

  // Optional media/cover metadata used by SwipeDeckScreen
  wikiTitle?: string;
  imageUri?: string;
  olWorkId?: string;

  // Allow future expansion without breaking typing.
  [key: string]: unknown;
}

export interface SwipeDeckRules {
  targetSwipesBeforeRecommend: number;
  allowUpToSwipesBeforeRecommend: number;

  /**
   * Optional in some deck modules; the app treats missing as "true_random_each_session".
   */
  shuffle?: "true_random_each_session";
}

export interface SwipeDeck {
  deckKey: "k2" | "36" | "ms_hs" | "adult";
  deckLabel: string;

  /**
   * Optional for backward compatibility with older deck modules.
   */
  version?: number;

  rules: SwipeDeckRules;
  cards: SwipeDeckCard[];
}

// ------------------------------
// Tag weighting (optional, non-breaking)
// ------------------------------
// These types support *weighted* tag inference without changing existing deck data.
// Deck cards can continue using `tags: string[]`.
//
// A "canonical tag string" is a prefixed token like: "genre:fantasy", "vibe:cozy".
export type TagPrefix = "genre" | "vibe" | "topic" | "theme" | "format" | "pacing";
export type CanonicalTagString = `${TagPrefix}:${string}`;

// Raw counts (existing pipeline)
export type TagCounts = Record<string, number>;

// Weighted counts/scores (new tuning layer)
export type TagScores = Record<CanonicalTagString, number>;

// A simple weighting config you can tweak per age-band.
export type TagWeightConfig = Partial<Record<TagPrefix, number>>;

// Example default: emphasize story DNA over format/pacing.
export const DEFAULT_TAG_WEIGHTS: TagWeightConfig = {
  theme: 1.2,
  genre: 1.1,
  vibe: 1.0,
  topic: 0.9,
  pacing: 0.7,
  format: 0.4,
};
