// /screens/recommenders/taste/tasteProfileBuilder.ts
//
// Build a cross-media Taste DNA profile from swipe tags first, then optionally
// refine it with semantic swipe traits, recommendation feedback, and star ratings.

import type {
  ItemTasteTraitMap,
  ItemTasteTraits,
  SemanticSwipeTraits,
  TasteAxis,
  TasteBuilderInput,
  TasteFeedbackEvent,
  TasteProfile,
  TasteVector,
} from "./types";
import { TASTE_AXES } from "./types";

const AXIS_PREFIX_WEIGHTS: Record<string, number> = {
  vibe: 1.25,
  mood: 1.25,
  tone: 1.2,
  trope: 1.05,
  theme: 1.0,
  genre: 0.9,
  setting: 0.7,
  topic: 0.85,
  format: 0.8,
  media: 0.9,
  layout: 0.25,
};

const IGNORED_PREFIXES = new Set(["age", "audience"]);
const BASELINE_VECTOR: TasteVector = {
  warmth: 0,
  darkness: 0,
  humor: 0,
  complexity: 0,
  characterFocus: 0,
  pacing: 0,
  ideaDensity: 0,
  realism: 0,
};

// Conservative semantic weights:
// semantic augments tag signal, but does not dominate it.
const SEMANTIC_CHANNEL_WEIGHTS = {
  contentTraits: 0.22,
  toneTraits: 0.26,
  characterTraits: 0.24,
  storyTraits: 0.24,
  aversionTraits: -0.16,
} as const;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function emptyVector(): TasteVector {
  return { ...BASELINE_VECTOR };
}

export function emptyTasteProfile(): TasteProfile {
  return {
    axes: emptyVector(),
    confidence: 0,
    evidence: {
      swipes: 0,
      tagSignals: 0,
      feedbackEvents: 0,
      ratedItems: 0,
    },
  };
}

function normalizeToken(raw: string): string {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/^['"]+|['"]+$/g, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

function parseStructuredTag(tag: string): { prefix?: string; value: string } {
  const raw = normalizeToken(tag);
  const idx = raw.indexOf(":");
  if (idx <= 0) return { value: raw };

  const prefix = normalizeToken(raw.slice(0, idx));
  const value = normalizeToken(raw.slice(idx + 1));
  return { prefix, value };
}

function addContribution(target: TasteVector, axis: TasteAxis, amount: number): void {
  target[axis] += amount;
}

function contributesAny(text: string, words: string[]): boolean {
  return words.some((word) => text.includes(word));
}

function tagToAxisContributions(tag: string): Partial<TasteVector> {
  const out: Partial<TasteVector> = {};
  const { prefix, value } = parseStructuredTag(tag);

  if (!value || (prefix && IGNORED_PREFIXES.has(prefix))) return out;

  const text = value;

  if (contributesAny(text, ["cozy", "hopeful", "uplifting", "warm", "wholesome", "healing", "heartfelt", "tender", "sincere", "comfort"])) {
    out.warmth = (out.warmth || 0) + 1.2;
  }
  if (contributesAny(text, ["dark", "bleak", "grim", "tragic", "nihilist", "horror", "haunting", "violent", "disturbing", "brooding"])) {
    out.darkness = (out.darkness || 0) + 1.2;
  }
  if (contributesAny(text, ["funny", "humor", "humorous", "witty", "playful", "comic", "satirical", "silly"])) {
    out.humor = (out.humor || 0) + 1.2;
  }
  if (contributesAny(text, ["complex", "cerebral", "literary", "layered", "challenging", "smart", "sophisticated", "mind bending", "mindbending"])) {
    out.complexity = (out.complexity || 0) + 1.15;
  }
  if (contributesAny(text, ["character driven", "character", "relationship", "intimate", "coming of age", "family", "emotional", "romance"])) {
    out.characterFocus = (out.characterFocus || 0) + 1.15;
  }
  if (contributesAny(text, ["fast paced", "fast", "kinetic", "action", "propulsive", "thriller", "urgent", "adventure"])) {
    out.pacing = (out.pacing || 0) + 1.15;
  }
  if (contributesAny(text, ["slow burn", "slow", "meditative", "gentle", "quiet"])) {
    out.pacing = (out.pacing || 0) - 1.0;
  }
  if (contributesAny(text, ["philosophical", "thought provoking", "thoughtful", "big ideas", "idea driven", "speculative", "political", "science", "cerebral"])) {
    out.ideaDensity = (out.ideaDensity || 0) + 1.15;
  }
  if (contributesAny(text, ["realistic", "grounded", "contemporary", "historical", "slice of life", "true to life"])) {
    out.realism = (out.realism || 0) + 1.1;
  }
  if (contributesAny(text, ["fantasy", "fantastical", "magical", "surreal", "dreamlike", "science fiction", "sci fi", "supernatural"])) {
    out.realism = (out.realism || 0) - 1.1;
  }

  if (prefix === "genre") {
    if (contributesAny(text, ["comedy"])) out.humor = (out.humor || 0) + 0.9;
    if (contributesAny(text, ["thriller", "action"])) out.pacing = (out.pacing || 0) + 0.9;
    if (contributesAny(text, ["literary"])) out.complexity = (out.complexity || 0) + 0.8;
    if (contributesAny(text, ["romance", "drama"])) out.characterFocus = (out.characterFocus || 0) + 0.8;
    if (contributesAny(text, ["fantasy", "science fiction", "sci fi"])) out.realism = (out.realism || 0) - 0.8;
    if (contributesAny(text, ["historical", "contemporary"])) out.realism = (out.realism || 0) + 0.8;
  }

  if (prefix === "media") {
    if (contributesAny(text, ["anime", "manga"])) {
      out.pacing = (out.pacing || 0) + 0.9;
      out.characterFocus = (out.characterFocus || 0) + 0.55;
      out.realism = (out.realism || 0) - 0.45;
    }
  }

  if (prefix === "format") {
    if (contributesAny(text, ["graphic novel", "comic", "comics"])) {
      out.pacing = (out.pacing || 0) + 0.55;
      out.characterFocus = (out.characterFocus || 0) + 0.35;
      out.realism = (out.realism || 0) - 0.2;
    }
  }

  if (prefix === "topic") {
    if (contributesAny(text, ["manga"])) {
      out.pacing = (out.pacing || 0) + 0.7;
      out.characterFocus = (out.characterFocus || 0) + 0.35;
      out.realism = (out.realism || 0) - 0.3;
    }
  }

  return out;
}

function applyWeightedTraits(target: TasteVector, traits: ItemTasteTraits, scale: number): void {
  for (const axis of TASTE_AXES) {
    const value = traits[axis];
    if (typeof value === "number" && Number.isFinite(value)) {
      target[axis] += value * scale;
    }
  }
}

function profileFromTagCounts(tagCounts: Record<string, number>): { vector: TasteVector; signals: number; swipes: number } {
  const vector = emptyVector();
  let signalCount = 0;
  let swipes = 0;

  for (const [rawTag, rawWeight] of Object.entries(tagCounts || {})) {
    const weight = Number(rawWeight || 0);
    if (!rawTag || !Number.isFinite(weight) || weight === 0) continue;

    const { prefix } = parseStructuredTag(rawTag);
    if (prefix && IGNORED_PREFIXES.has(prefix)) continue;

    const axisWeight = prefix ? (AXIS_PREFIX_WEIGHTS[prefix] ?? 1) : 1;
    const contributions = tagToAxisContributions(rawTag);

    let touched = false;
    for (const axis of TASTE_AXES) {
      const amount = contributions[axis];
      if (typeof amount === "number" && amount !== 0) {
        addContribution(vector, axis, amount * weight * axisWeight);
        touched = true;
      }
    }

    if (touched) {
      signalCount += 1;
      swipes += Math.abs(weight);
    }
  }

  return { vector, signals: signalCount, swipes };
}

/**
 * Conservative semantic augmentation.
 * Converts semantic swipe evidence into axis nudges using the same tag parser,
 * but at lower channel-specific weights than raw tagCounts.
 */
function itemTraitsFromSemanticLike(input: SemanticSwipeTraits): ItemTasteTraits {
  const traits: ItemTasteTraits = {};

  const applyTokens = (
    tokens: string[] | undefined,
    syntheticPrefix: string,
    weight: number
  ) => {
    for (const raw of tokens || []) {
      const normalized = normalizeToken(raw);
      if (!normalized) continue;

      const contributions = tagToAxisContributions(`${syntheticPrefix}:${normalized}`);
      for (const axis of TASTE_AXES) {
        const amount = contributions[axis];
        if (typeof amount === "number" && amount !== 0) {
          traits[axis] = (traits[axis] || 0) + amount * weight;
        }
      }
    }
  };

  applyTokens(input.contentTraits, "theme", SEMANTIC_CHANNEL_WEIGHTS.contentTraits);
  applyTokens(input.toneTraits, "vibe", SEMANTIC_CHANNEL_WEIGHTS.toneTraits);
  applyTokens(input.characterTraits, "theme", SEMANTIC_CHANNEL_WEIGHTS.characterTraits);
  applyTokens(input.storyTraits, "theme", SEMANTIC_CHANNEL_WEIGHTS.storyTraits);
  applyTokens(input.aversionTraits, "theme", SEMANTIC_CHANNEL_WEIGHTS.aversionTraits);

  return traits;
}

function isItemTasteTraits(value: ItemTasteTraits | SemanticSwipeTraits): value is ItemTasteTraits {
  if (!value || typeof value !== "object") return false;
  return TASTE_AXES.some((axis) => axis in value);
}

function applySemanticSwipeTraits(
  profile: TasteProfile,
  swipedItemTraits: Array<ItemTasteTraits | SemanticSwipeTraits> = []
): TasteProfile {
  if (!swipedItemTraits.length) return profile;

  const next: TasteProfile = {
    axes: { ...profile.axes },
    confidence: profile.confidence,
    evidence: { ...profile.evidence },
  };

  for (const entry of swipedItemTraits) {
    const normalizedTraits = isItemTasteTraits(entry)
      ? entry
      : itemTraitsFromSemanticLike(entry);

    applyWeightedTraits(next.axes, normalizedTraits, 1);
    next.evidence.tagSignals += 1;
    next.evidence.swipes += 1;
  }

  return normalizeTasteProfile(next);
}

function feedbackScalar(event: TasteFeedbackEvent): number {
  if (event.kind === "not_interested") return -0.7;
  if (event.kind === "already_read") {
    const rating = typeof event.rating === "number" ? event.rating : 3;
    return ((rating - 3) / 2) * 1.2;
  }
  return 0;
}

export function applyFeedbackToTasteProfile(
  profile: TasteProfile,
  feedback: TasteFeedbackEvent[] = [],
  itemTraitsById: ItemTasteTraitMap = {}
): TasteProfile {
  if (!feedback.length) return profile;

  const next: TasteProfile = {
    axes: { ...profile.axes },
    confidence: profile.confidence,
    evidence: { ...profile.evidence },
  };

  for (const event of feedback) {
    next.evidence.feedbackEvents += 1;
    if (event.kind === "already_read" && typeof event.rating === "number") {
      next.evidence.ratedItems += 1;
    }

    const traits = itemTraitsById[event.itemId];
    if (!traits) continue;

    const scalar = feedbackScalar(event);
    if (!scalar) continue;

    applyWeightedTraits(next.axes, traits, scalar);
  }

  return normalizeTasteProfile(next);
}

export function normalizeTasteProfile(profile: TasteProfile): TasteProfile {
  const next: TasteProfile = {
    axes: emptyVector(),
    confidence: 0,
    evidence: { ...profile.evidence },
  };

  for (const axis of TASTE_AXES) {
    const raw = profile.axes[axis] || 0;
    const normalized = raw / (1 + Math.abs(raw));
    next.axes[axis] = clamp(normalized, -1, 1);
  }

  const evidenceScore =
    next.evidence.swipes * 0.05 +
    next.evidence.tagSignals * 0.08 +
    next.evidence.feedbackEvents * 0.1 +
    next.evidence.ratedItems * 0.15;

  next.confidence = clamp(evidenceScore, 0, 1);
  return next;
}

export function buildTasteProfile(input: TasteBuilderInput): TasteProfile {
  const base = buildTasteProfileFromTagCounts(input.tagCounts || {});
  const withSemantic = applySemanticSwipeTraits(base, input.swipedItemTraits || []);

  let withDirect = withSemantic;

  // NEW: direct tasteTraits support
  if ((input as any).directTraits && Array.isArray((input as any).directTraits)) {
    for (const traits of (input as any).directTraits) {
      applyWeightedTraits(withDirect.axes, traits, 1.2);
      withDirect.evidence.tagSignals += 1;
      withDirect.evidence.swipes += 1;
    }
  }

  return applyFeedbackToTasteProfile(
    withDirect,
    input.feedback || [],
    input.itemTraitsById || {}
  );
}

export function buildTasteProfile(input: TasteBuilderInput): TasteProfile {
  const base = buildTasteProfileFromTagCounts(input.tagCounts || {});
  const withSemantic = applySemanticSwipeTraits(base, input.swipedItemTraits || []);
  return applyFeedbackToTasteProfile(
    withSemantic,
    input.feedback || [],
    input.itemTraitsById || {}
  );
}
