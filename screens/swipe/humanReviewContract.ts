import type { AgeBandV2, SwipeSignalV2 } from "../../app/recommender-v2";

export type HumanReviewDecision = "recommend" | "weak_recommend" | "not_recommended";
export type HumanReviewSlateDecision = "yes" | "no" | "unsure";

export type HumanReviewConcernTag =
  | "too_mature"
  | "poor_series_entry"
  | "wrong_genre_or_tone"
  | "redundant_with_another_result"
  | "insufficient_information";

export const HUMAN_REVIEW_CONCERN_OPTIONS: Array<{ tag: HumanReviewConcernTag; label: string }> = [
  { tag: "too_mature", label: "Too mature" },
  { tag: "poor_series_entry", label: "Poor series entry" },
  { tag: "wrong_genre_or_tone", label: "Wrong genre or tone" },
  { tag: "redundant_with_another_result", label: "Redundant with another result" },
  { tag: "insufficient_information", label: "Insufficient information" },
];

export interface HumanReviewSlateItem {
  rank: number;
  title: string;
  author: string;
  source?: string;
  coverUrl?: string;
}

export interface HumanReviewSnapshotV1 {
  schemaVersion: "human_review_snapshot_v1";
  snapshotId: string;
  profileId: string;
  profileVersion: number;
  manifestVersion: "runtime-v1";
  rubricVersion: "v1";
  engineVersion: string;
  capturedAt: string;
  ageBand: AgeBandV2;
  deckKey: string;
  swipeSignalCount: number;
  swipeSignals: Array<Pick<SwipeSignalV2, "id" | "title" | "action" | "source" | "format">>;
  recommendationItems: HumanReviewSlateItem[];
}

export interface HumanReviewItemFormEntry {
  rank: number;
  title: string;
  tasteAlignment: number;
  novelty: number;
  confidence: number;
  decision: HumanReviewDecision;
  concerns: HumanReviewConcernTag[];
  notes?: string;
}

export interface HumanReviewSlateForm {
  reviewerId: string;
  itemReviews: HumanReviewItemFormEntry[];
  wouldUseSlate: HumanReviewSlateDecision;
  notes?: string;
}

export interface HumanReviewRecordV1 {
  schemaVersion: "human_review_record_v1";
  reviewId: string;
  snapshotId: string;
  profileId: string;
  rubricId: "novelideas-human-review";
  rubricVersion: "v1";
  reviewerId: string;
  createdAt: string;
  itemReviews: Array<{
    rank: number;
    title: string;
    overallScore: number;
    decision: HumanReviewDecision;
    criteriaRatings: {
      taste_alignment: number;
      novelty: number;
      confidence: number;
    };
    concernTags?: HumanReviewConcernTag[];
    notes?: string;
  }>;
  summary: {
    wouldUseSlate: boolean | null;
    wouldUseSlateDecision: HumanReviewSlateDecision;
    notes?: string;
  };
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => stableValue(item));
  if (!value || typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    out[key] = stableValue((value as Record<string, unknown>)[key]);
  }
  return out;
}

function stableStringify(value: unknown): string {
  return JSON.stringify(stableValue(value));
}

function fnv1aHex(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function deterministicHash(input: unknown, repeat = 3): string {
  const text = stableStringify(input);
  let out = "";
  for (let i = 0; i < repeat; i += 1) {
    out += fnv1aHex(`${i}:${text}`);
  }
  return out;
}

function nowIso(): string {
  return new Date().toISOString();
}

function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 1;
  const rounded = Math.round(value);
  if (rounded < 1) return 1;
  if (rounded > 5) return 5;
  return rounded;
}

export function createHumanReviewSnapshot(args: {
  ageBand: AgeBandV2;
  deckKey: string;
  engineVersion: string;
  swipeSignals: SwipeSignalV2[];
  recommendationItems: HumanReviewSlateItem[];
}): HumanReviewSnapshotV1 {
  const profileFingerprint = deterministicHash({
    ageBand: args.ageBand,
    deckKey: args.deckKey,
    swipeSignals: args.swipeSignals.map((signal) => ({
      id: signal.id || "",
      title: signal.title || "",
      action: signal.action,
      source: signal.source || "",
      format: signal.format || "book",
    })),
  }, 2);
  const profileId = `runtime-${args.ageBand}-${profileFingerprint.slice(0, 12)}`;
  const snapshotFingerprint = deterministicHash({
    profileId,
    engineVersion: args.engineVersion || "unknown",
    recommendationItems: args.recommendationItems.map((item) => ({
      rank: item.rank,
      title: item.title,
      author: item.author,
      source: item.source || "",
    })),
  }, 2);

  return {
    schemaVersion: "human_review_snapshot_v1",
    snapshotId: `hrs-${snapshotFingerprint.slice(0, 16)}`,
    profileId,
    profileVersion: 1,
    manifestVersion: "runtime-v1",
    rubricVersion: "v1",
    engineVersion: args.engineVersion || "unknown",
    capturedAt: nowIso(),
    ageBand: args.ageBand,
    deckKey: args.deckKey,
    swipeSignalCount: args.swipeSignals.length,
    swipeSignals: args.swipeSignals.map((signal) => ({
      id: signal.id,
      title: signal.title,
      action: signal.action,
      source: signal.source,
      format: signal.format,
    })),
    recommendationItems: args.recommendationItems.map((item) => ({
      rank: item.rank,
      title: item.title,
      author: item.author,
      source: item.source,
      coverUrl: item.coverUrl,
    })),
  };
}

export function createDefaultHumanReviewForm(snapshot: HumanReviewSnapshotV1): HumanReviewSlateForm {
  return {
    reviewerId: "",
    wouldUseSlate: "unsure",
    notes: "",
    itemReviews: snapshot.recommendationItems.map((item) => ({
      rank: item.rank,
      title: item.title,
      tasteAlignment: 3,
      novelty: 3,
      confidence: 3,
      decision: "weak_recommend" as HumanReviewDecision,
      concerns: [],
      notes: "",
    })),
  };
}

export function createHumanReviewRecordFromForm(args: {
  snapshot: HumanReviewSnapshotV1;
  form: HumanReviewSlateForm;
}): HumanReviewRecordV1 {
  const normalizedReviewer = String(args.form.reviewerId || "").trim();
  if (!normalizedReviewer) throw new Error("missing_reviewer_id");
  const normalizedItems = args.form.itemReviews
    .slice()
    .sort((a, b) => a.rank - b.rank)
    .map((item) => ({
      rank: item.rank,
      title: String(item.title || "").trim(),
      overallScore: clampScore((item.tasteAlignment + item.novelty + item.confidence) / 3),
      decision: item.decision,
      criteriaRatings: {
        taste_alignment: clampScore(item.tasteAlignment),
        novelty: clampScore(item.novelty),
        confidence: clampScore(item.confidence),
      },
      concernTags: item.concerns,
      notes: String(item.notes || "").trim(),
    }));

  const fingerprint = deterministicHash({
    snapshotId: args.snapshot.snapshotId,
    profileId: args.snapshot.profileId,
    reviewerId: normalizedReviewer.toLowerCase(),
    itemReviews: normalizedItems,
    slateDecision: args.form.wouldUseSlate,
    notes: String(args.form.notes || "").trim(),
  }, 2);

  const wouldUseSlate = args.form.wouldUseSlate === "yes" ? true : args.form.wouldUseSlate === "no" ? false : null;

  return {
    schemaVersion: "human_review_record_v1",
    reviewId: `hr-${args.snapshot.snapshotId.slice(0, 8)}-${fingerprint.slice(0, 10)}`,
    snapshotId: args.snapshot.snapshotId,
    profileId: args.snapshot.profileId,
    rubricId: "novelideas-human-review",
    rubricVersion: "v1",
    reviewerId: normalizedReviewer,
    createdAt: nowIso(),
    itemReviews: normalizedItems,
    summary: {
      wouldUseSlate,
      wouldUseSlateDecision: args.form.wouldUseSlate,
      notes: String(args.form.notes || "").trim(),
    },
  };
}
