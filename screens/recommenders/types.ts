// /screens/recommenders/types.ts
//
// Shared recommendation engine contracts.
// NOTE: Keep this file small and stable. All engines + router depend on it.

export type EngineId = "googleBooks" | "openLibrary" | "kitsu" | "gcd";

export type DomainMode = "default" | "picture" | "earlyReader" | "chapterMiddle";

export type DeckKey = "k2" | "36" | "ms_hs" | "adult";

export type TagCounts = Record<string, number>;

export type TasteAxis =
  | "warmth"
  | "darkness"
  | "humor"
  | "complexity"
  | "characterFocus"
  | "pacing"
  | "ideaDensity"
  | "realism";

export type TasteProfile = {
  axes: Partial<Record<TasteAxis, number>>;
  confidence?: number;
};

export type RecommendationDoc = {
  key?: string;
  id?: string;
  title?: string;
  author_name?: string[];
  first_publish_year?: number;
  cover_i?: number | string;
  // Optional engine-specific fields (safe to ignore in UI)
  subject?: string[];
  subtitle?: string;
  description?: string;
  edition_count?: number;
  language?: string[];
  ebook_access?: string;
};

export type RecommendationItem = {
  kind: "open_library"; // legacy UI expects this shape
  doc: RecommendationDoc;
};

export type RecommendationResult = {
  engineId: EngineId;
  engineLabel: string;
  deckKey: DeckKey;
  domainMode?: DomainMode;
  builtFromQuery: string;
  items: RecommendationItem[];
};

export type RecommenderProfileOverride = Record<string, number | undefined>;

export type RecommenderInput = {
  deckKey: DeckKey;
  tagCounts: TagCounts;
  tasteProfile?: TasteProfile;
  limit?: number;
  timeoutMs?: number;
  minCandidateFloor?: number;
  // Optional overrides (debug/testing)
  domainModeOverride?: DomainMode;
  profileOverride?: RecommenderProfileOverride;
  priorRecommendedIds?: string[];
  priorRecommendedKeys?: string[];
  priorAuthors?: string[];
  priorSeriesKeys?: string[];
  priorRejectedIds?: string[];
  priorRejectedKeys?: string[];
};
