import type { StoryTournament } from "./melaniesRealBooks";

export type MelanieArtworkPhase = "opening" | "ranking" | "challenger" | "reveal";

export function melanieArtworkPhase(
  phase: StoryTournament["phase"] | null,
  completedRounds: number,
): MelanieArtworkPhase {
  if (phase === "reveal") return "reveal";
  if (phase === "rank") return "ranking";
  return completedRounds > 0 ? "challenger" : "opening";
}
