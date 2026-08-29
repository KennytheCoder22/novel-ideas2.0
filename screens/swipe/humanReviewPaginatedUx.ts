import type { HumanReviewItemFormEntry, HumanReviewSlateForm } from "./humanReviewContract";

export const HUMAN_REVIEW_DRAFT_SCHEMA_VERSION = "human_review_draft_v1";
const HUMAN_REVIEW_DRAFT_STORAGE_PREFIX = "novelideas_human_review_draft_v1:";

export function shouldDisplayHumanReviewSwipeGroup(
  reviewMode: "self_session" | "anonymous_session" | undefined,
  group: "liked" | "disliked" | "skipped",
): boolean {
  return reviewMode !== "anonymous_session" || group !== "skipped";
}

export interface HumanReviewDraftV1 {
  schemaVersion: typeof HUMAN_REVIEW_DRAFT_SCHEMA_VERSION;
  snapshotId: string;
  stepIndex: number;
  form: HumanReviewSlateForm;
  stepStartedAtByRank: Record<string, string>;
  stepCompletedAtByRank: Record<string, string>;
  updatedAt: string;
}

export function humanReviewDraftStorageKey(snapshotId: string): string {
  return `${HUMAN_REVIEW_DRAFT_STORAGE_PREFIX}${String(snapshotId || "").trim()}`;
}

export function isHumanReviewItemStepComplete(item: HumanReviewItemFormEntry): boolean {
  return typeof item.expectedEnjoyment === "number" && item.expectedEnjoyment >= 1 && item.expectedEnjoyment <= 5;
}

export function allHumanReviewItemStepsComplete(form: HumanReviewSlateForm): boolean {
  return form.itemReviews.every((item) => isHumanReviewItemStepComplete(item));
}

export function clampHumanReviewStepIndex(stepIndex: number, totalRecommendations: number): number {
  if (!Number.isFinite(stepIndex)) return 0;
  const max = Math.max(0, totalRecommendations);
  const rounded = Math.round(stepIndex);
  if (rounded < 0) return 0;
  if (rounded > max) return max;
  return rounded;
}

export function getHumanReviewProgressLabel(stepIndex: number, totalRecommendations: number): string {
  const safeTotal = Math.max(1, totalRecommendations);
  const recommendationIndex = Math.min(Math.max(1, stepIndex + 1), safeTotal);
  return `Recommendation ${recommendationIndex} of ${safeTotal}`;
}

export function buildHumanReviewDraft(args: {
  snapshotId: string;
  form: HumanReviewSlateForm;
  stepIndex: number;
  stepStartedAtByRank: Record<string, string>;
  stepCompletedAtByRank: Record<string, string>;
  updatedAt: string;
}): HumanReviewDraftV1 {
  return {
    schemaVersion: HUMAN_REVIEW_DRAFT_SCHEMA_VERSION,
    snapshotId: String(args.snapshotId || "").trim(),
    stepIndex: clampHumanReviewStepIndex(args.stepIndex, args.form.itemReviews.length),
    form: args.form,
    stepStartedAtByRank: { ...args.stepStartedAtByRank },
    stepCompletedAtByRank: { ...args.stepCompletedAtByRank },
    updatedAt: args.updatedAt,
  };
}

export function restoreHumanReviewDraft(args: {
  rawDraft: string;
  snapshotId: string;
  defaultForm: HumanReviewSlateForm;
}): HumanReviewDraftV1 | null {
  if (!args.rawDraft) return null;
  try {
    const parsed = JSON.parse(args.rawDraft) as Partial<HumanReviewDraftV1>;
    if (!parsed || parsed.schemaVersion !== HUMAN_REVIEW_DRAFT_SCHEMA_VERSION) return null;
    if (String(parsed.snapshotId || "").trim() !== String(args.snapshotId || "").trim()) return null;
    if (!parsed.form || !Array.isArray(parsed.form.itemReviews)) return null;

    const defaultByRank = new Map(args.defaultForm.itemReviews.map((item) => [item.rank, item]));
    const savedByRank = new Map(
      parsed.form.itemReviews
        .filter((item): item is HumanReviewItemFormEntry => Boolean(item && typeof item.rank === "number"))
        .map((item) => [item.rank, item])
    );

    const restoredItems = args.defaultForm.itemReviews.map((baseItem) => {
      const savedItem = savedByRank.get(baseItem.rank);
      if (!savedItem) return baseItem;
      return {
        ...baseItem,
        ...savedItem,
        rank: baseItem.rank,
        title: baseItem.title,
      };
    });

    if (restoredItems.length !== defaultByRank.size) return null;

    return {
      schemaVersion: HUMAN_REVIEW_DRAFT_SCHEMA_VERSION,
      snapshotId: String(parsed.snapshotId || ""),
      stepIndex: clampHumanReviewStepIndex(Number(parsed.stepIndex || 0), restoredItems.length),
      form: {
        ...args.defaultForm,
        ...parsed.form,
        itemReviews: restoredItems,
      },
      stepStartedAtByRank:
        parsed.stepStartedAtByRank && typeof parsed.stepStartedAtByRank === "object"
          ? { ...parsed.stepStartedAtByRank }
          : {},
      stepCompletedAtByRank:
        parsed.stepCompletedAtByRank && typeof parsed.stepCompletedAtByRank === "object"
          ? { ...parsed.stepCompletedAtByRank }
          : {},
      updatedAt: String(parsed.updatedAt || ""),
    };
  } catch {
    return null;
  }
}

export function prepareHumanReviewModalState(args: {
  snapshotId: string;
  form: HumanReviewSlateForm;
  rawDraft: string;
  nowIso: string;
  isTestingMode: boolean;
  anonymousReviewerId?: string;
}): {
  effectiveForm: HumanReviewSlateForm;
  initialStepIndex: number;
  initialStartedAtByRank: Record<string, string>;
  initialCompletedAtByRank: Record<string, string>;
} {
  const baseForm =
    args.isTestingMode && args.anonymousReviewerId
      ? { ...args.form, reviewerId: args.anonymousReviewerId }
      : args.form;

  const restoredDraft = restoreHumanReviewDraft({
    rawDraft: args.rawDraft,
    snapshotId: args.snapshotId,
    defaultForm: baseForm,
  });
  const restoredForm = restoredDraft?.form || baseForm;
  const effectiveForm =
    args.isTestingMode && args.anonymousReviewerId
      ? { ...restoredForm, reviewerId: args.anonymousReviewerId }
      : restoredForm;
  const totalRecommendations = effectiveForm.itemReviews.length;
  const initialStepIndex = restoredDraft
    ? clampHumanReviewStepIndex(restoredDraft.stepIndex, totalRecommendations)
    : 0;
  const initialStartedAtByRank =
    restoredDraft?.stepStartedAtByRank && Object.keys(restoredDraft.stepStartedAtByRank).length
      ? restoredDraft.stepStartedAtByRank
      : totalRecommendations > 0
        ? { "1": args.nowIso }
        : {};
  const initialCompletedAtByRank = restoredDraft?.stepCompletedAtByRank || {};

  return {
    effectiveForm,
    initialStepIndex,
    initialStartedAtByRank,
    initialCompletedAtByRank,
  };
}

export function estimateRemainingReviewSeconds(args: {
  totalRecommendations: number;
  stepStartedAtByRank: Record<string, string>;
  stepCompletedAtByRank: Record<string, string>;
}): number | null {
  const total = Math.max(0, args.totalRecommendations);
  const completedEntries = Object.entries(args.stepCompletedAtByRank)
    .map(([rankText, completedAt]) => ({
      rank: Number(rankText),
      completedMs: Date.parse(completedAt),
      startedMs: Date.parse(args.stepStartedAtByRank[rankText] || ""),
    }))
    .filter((entry) => Number.isFinite(entry.rank) && Number.isFinite(entry.completedMs) && Number.isFinite(entry.startedMs))
    .sort((a, b) => a.rank - b.rank);

  if (!completedEntries.length) return null;

  const durations = completedEntries
    .map((entry) => Math.max(1, Math.round((entry.completedMs - entry.startedMs) / 1000)))
    .filter((seconds) => Number.isFinite(seconds) && seconds > 0);

  if (!durations.length) return null;

  const completedCount = completedEntries.length;
  const remainingCount = Math.max(0, total - completedCount);
  if (remainingCount === 0) return 0;

  const avgSecondsPerStep = durations.reduce((sum, seconds) => sum + seconds, 0) / durations.length;
  return Math.max(1, Math.round(avgSecondsPerStep * remainingCount));
}

export function formatRemainingReviewTime(seconds: number | null): string {
  if (seconds == null) return "Time remaining estimate will appear after your first completed recommendation.";
  if (seconds <= 0) return "All recommendation steps complete.";
  if (seconds < 60) return `About ${seconds}s remaining`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  if (remainder === 0) return `About ${minutes}m remaining`;
  return `About ${minutes}m ${remainder}s remaining`;
}

const VIBE_GENRE_PATTERNS: Array<[string, string[]]> = [
  ["fantasy", ["magic", "wizard", "dragon", "spell", "realm", "enchant", "fae", "fairy", "sorcerer", "mythic"]],
  ["sci-fi", ["space", "galaxy", "alien", "robot", "planet", "cosmos", "quantum", "android", "dystopian"]],
  ["mystery or thriller", ["murder", "detective", "crime", "killer", "thriller", "suspect", "investigation", "noir"]],
  ["adventure", ["quest", "expedition", "journey", "explorer", "voyage", "discover", "hunt", "survival"]],
  ["romance", ["love", "heart", "kiss", "soulmate", "forever", "desire", "falling", "wedding"]],
  ["horror", ["horror", "ghost", "haunt", "demon", "undead", "nightmare", "curse", "sinister", "dread", "terror"]],
  ["historical fiction", ["king", "queen", "emperor", "empire", "medieval", "ancient", "war", "battle", "revolution", "victorian"]],
];

function inferGenreFromTitles(items: Array<{ title: string }>): string | null {
  const allWords = items.flatMap((item) =>
    item.title
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length > 2)
  );
  for (const [genre, keywords] of VIBE_GENRE_PATTERNS) {
    const hitCount = keywords.filter((kw) => allWords.some((w) => w.includes(kw))).length;
    if (hitCount >= 2 || (hitCount >= 1 && items.length >= 4)) return genre;
  }
  return null;
}

/**
 * Derives a short plain-language vibe sentence for the "What you swiped" section.
 * Uses engineSignals (top liked genre/tone tokens) for the liked row; falls back to
 * title-keyword inference or a count-based neutral line. No network calls.
 */
export function computeSwipeVibeSummary(
  items: Array<{ title: string }>,
  engineSignals: string[],
  mode: "liked" | "disliked"
): string {
  if (!items.length) return "";
  if (mode === "liked") {
    const signals = engineSignals.map((s) => s.trim().toLowerCase()).filter(Boolean);
    if (signals.length >= 2) {
      return `You seem to enjoy ${signals[0]} and ${signals[1]} stories.`;
    }
    if (signals.length === 1) {
      return `You seem to enjoy ${signals[0]} stories.`;
    }
    const inferred = inferGenreFromTitles(items);
    if (inferred) return `You seem to gravitate toward ${inferred} stories.`;
    return items.length >= 5
      ? "You have a clear sense of what you enjoy."
      : "These caught your attention while swiping.";
  } else {
    const inferred = inferGenreFromTitles(items);
    if (inferred) return `You tended to pass on ${inferred} picks.`;
    if (items.length >= 6) return "You were selective and passed on quite a few picks.";
    if (items.length >= 3) return "You passed on several picks that didn\u2019t resonate.";
    return "A few picks didn\u2019t feel like a fit.";
  }
}
