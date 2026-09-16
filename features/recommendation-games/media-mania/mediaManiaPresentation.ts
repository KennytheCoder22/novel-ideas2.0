import type { MediaManiaState } from "./mediaManiaCore.mjs";

export type MediaManiaEnvironmentScene = "landing" | "like" | "dislike" | "unlock";

export const MEDIA_MANIA_ENVIRONMENT_ASSETS = {
  landing: "landing.webp",
  like: "like.webp",
  dislike: "dislike.webp",
  unlock: "landing.webp",
} as const satisfies Record<MediaManiaEnvironmentScene, string>;

export function mediaManiaEnvironmentScene(
  state: Pick<MediaManiaState, "startingSource" | "unlockStatus" | "currentRound">,
): MediaManiaEnvironmentScene {
  if (!state.startingSource) return "landing";
  if (state.unlockStatus === "offered") return "unlock";
  return state.currentRound?.roundType === "DISLIKE" ? "dislike" : "like";
}

