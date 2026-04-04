// /screens/recommenders/taste/types.ts
//
// Shared Taste DNA types. Keep these focused on stable contracts so all
// recommenders can consume the same user-preference model.

export const TASTE_AXES = [
  "warmth",
  "darkness",
  "humor",
  "complexity",
  "characterFocus",
  "pacing",
  "ideaDensity",
  "realism",
] as const;

export type TasteAxis = (typeof TASTE_AXES)[number];

// Axis values are normalized to roughly -1..1.
// Positive pacing means faster / more kinetic.
// Positive realism means more grounded / realistic.
export type TasteVector = Record<TasteAxis, number>;

export type TasteEvidence = {
  swipes: number;
  tagSignals: number;
  feedbackEvents: number;
  ratedItems: number;
};

export type TasteProfile = {
  axes: TasteVector;
  confidence: number; // normalized 0..1
  evidence: TasteEvidence;
};

// Per-item trait map used when the app knows something about a rated / skipped
// recommendation. This is optional for v1, but it gives us a clean place to
// plug in star ratings later without redesigning the builder.
export type ItemTasteTraits = Partial<TasteVector>;

export type ItemTasteTraitMap = Record<string, ItemTasteTraits>;

export type SemanticSwipeTraits = {
  contentTraits?: string[];
  toneTraits?: string[];
  characterTraits?: string[];
  storyTraits?: string[];
  aversionTraits?: string[];
};

export type TasteFeedbackKind = "already_read" | "not_interested" | "next";

export type TasteFeedbackEvent = {
  itemId: string;
  kind: TasteFeedbackKind;
  rating?: 1 | 2 | 3 | 4 | 5;
};

export type TasteBuilderInput = {
  tagCounts: Record<string, number>;
  feedback?: TasteFeedbackEvent[];
  itemTraitsById?: ItemTasteTraitMap;
  swipedItemTraits?: Array<ItemTasteTraits | SemanticSwipeTraits>;
};
