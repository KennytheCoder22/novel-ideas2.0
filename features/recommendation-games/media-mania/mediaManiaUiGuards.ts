import {
  MEDIA_MANIA_AGE_BANDS,
  changeMediaManiaAgeBand,
  type MediaManiaAgeBand,
  type MediaManiaCatalogItem,
  type MediaManiaState,
} from "./mediaManiaCore.mjs";

export function normalizeMediaManiaAgeBand(value: unknown): MediaManiaAgeBand {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "adult") return "adults";
  return MEDIA_MANIA_AGE_BANDS.includes(normalized as MediaManiaAgeBand)
    ? normalized as MediaManiaAgeBand
    : "teens";
}

export function isMediaManiaGameplayKeyboardBlocked(args: {
  repeat: boolean;
  locked: boolean;
  hintVisible: boolean;
  recommendationRewardVisible: boolean;
  hasCurrentRound: boolean;
  unlockOffered: boolean;
}): boolean {
  return args.repeat
    || args.locked
    || args.hintVisible
    || args.recommendationRewardVisible
    || !args.hasCurrentRound
    || args.unlockOffered;
}

export function reconcileMediaManiaRouteAge(
  state: MediaManiaState,
  routeAgeBand: MediaManiaAgeBand,
  catalog: MediaManiaCatalogItem[],
): ReturnType<typeof changeMediaManiaAgeBand> | null {
  return state.ageBand === routeAgeBand
    ? null
    : changeMediaManiaAgeBand(state, routeAgeBand, catalog);
}
