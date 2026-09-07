import type { MelanieConcept, MelanieCoverMotif } from "./melaniesGame";

export const MELANIE_COVER_ART_VERSION = "melanie_cover_art_v2" as const;

export const MELANIE_COVER_SUBJECTS = [
  "animal",
  "archive",
  "art",
  "book",
  "castle",
  "city",
  "clock",
  "coast",
  "desert",
  "fire",
  "food",
  "forest",
  "garden",
  "ghost",
  "history",
  "home",
  "journey",
  "machine",
  "magic",
  "moon",
  "mountain",
  "music",
  "mystery",
  "performance",
  "politics",
  "romance",
  "school",
  "science",
  "sea",
  "signal",
  "space",
  "sport",
  "storm",
  "train",
] as const satisfies readonly MelanieCoverMotif[];

export type MelanieCoverSubject = MelanieCoverMotif;
export type MelanieCoverComposition = "arch" | "constellation" | "diagonal" | "horizon" | "portal" | "split" | "tower";
export type MelanieCoverFrame = "botanical" | "celestial" | "geometric" | "gothic" | "maritime";

export type MelanieCoverArtDefinition = {
  version: typeof MELANIE_COVER_ART_VERSION;
  assetId: string;
  primarySubject: MelanieCoverSubject;
  secondarySubject: MelanieCoverSubject;
  composition: MelanieCoverComposition;
  frame: MelanieCoverFrame;
  sceneSeed: number;
  horizonPercent: number;
  primaryXPercent: number;
  secondaryXPercent: number;
  starCount: number;
};

const COMPOSITIONS: readonly MelanieCoverComposition[] = ["arch", "constellation", "diagonal", "horizon", "portal", "split", "tower"];
const FRAMES: readonly MelanieCoverFrame[] = ["botanical", "celestial", "geometric", "gothic", "maritime"];

function hash(value: string): number {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result = Math.imul(result ^ value.charCodeAt(index), 16777619);
  }
  return result >>> 0;
}

export function coverSubjectsForConcept(concept: MelanieConcept): MelanieCoverSubject[] {
  return [...new Set(concept.semantic.keyCoverMotifs)];
}

export function createMelanieCoverArt(concept: MelanieConcept): MelanieCoverArtDefinition {
  const sceneSeed = hash([
    MELANIE_COVER_ART_VERSION,
    concept.synopsis,
    concept.semantic.premiseFamily,
    ...concept.semantic.centralActivities,
    ...concept.semantic.settingClasses,
    ...concept.semantic.protagonistRoles,
    concept.semantic.narrativeEngine,
    ...concept.semantic.speculativeDevices,
    ...concept.semantic.keyCoverMotifs,
  ].join("|"));
  const subjects = coverSubjectsForConcept(concept);
  if (subjects.length < 2) throw new Error(`melanie_cover_requires_two_semantic_motifs:${concept.id}`);
  const primaryIndex = sceneSeed % subjects.length;
  const secondaryIndex = (primaryIndex + 1 + ((sceneSeed >>> 5) % (subjects.length - 1))) % subjects.length;
  return {
    version: MELANIE_COVER_ART_VERSION,
    assetId: `${MELANIE_COVER_ART_VERSION}:${concept.id}`,
    primarySubject: subjects[primaryIndex],
    secondarySubject: subjects[secondaryIndex],
    composition: COMPOSITIONS[(sceneSeed >>> 3) % COMPOSITIONS.length],
    frame: FRAMES[(sceneSeed >>> 7) % FRAMES.length],
    sceneSeed,
    horizonPercent: 42 + ((sceneSeed >>> 11) % 27),
    primaryXPercent: 24 + ((sceneSeed >>> 16) % 27),
    secondaryXPercent: 61 + ((sceneSeed >>> 21) % 22),
    starCount: 2 + ((sceneSeed >>> 26) % 6),
  };
}

export function melanieCoverArtFingerprint(art: MelanieCoverArtDefinition): string {
  return [
    art.primarySubject,
    art.secondarySubject,
    art.composition,
    art.frame,
    art.sceneSeed,
    art.horizonPercent,
    art.primaryXPercent,
    art.secondaryXPercent,
    art.starCount,
  ].join("|");
}
