// Adapts each game's own native evidence into the client-side production recommender's
// `SwipeSignalV2` shape. These adapters never invent a second recommender: they only reshape
// evidence the games already collect so it can be handed to the real `runRecommenderV2` engine.
//
// - Media Mania and The Last Bookshop reference real cross-media/book identities, so their
//   adapters are tagged `"cross_media"`.
// - The Unwritten Map and The Alchemist's Cascade only ever expose taste-vector/tag semantics with
//   no real-world media identity, so their adapters are tagged `"semantic_only"`.
import type { SwipeSignalV2 } from "../../app/recommender-v2";
import type { LastBookshopWork } from "./lastBookshop";
import type { CascadeTasteVector, CatalystOption } from "./alchemistsCascade";
import type { MapChoice, TasteVector } from "./unwrittenMap";
import type { GameRecommendationEvidenceMode } from "./gameRecommendationFeedback";

export const MEDIA_MANIA_EVIDENCE_MODE: GameRecommendationEvidenceMode = "cross_media";
export const LAST_BOOKSHOP_EVIDENCE_MODE: GameRecommendationEvidenceMode = "cross_media";
export const UNWRITTEN_MAP_EVIDENCE_MODE: GameRecommendationEvidenceMode = "semantic_only";
export const ALCHEMISTS_CASCADE_EVIDENCE_MODE: GameRecommendationEvidenceMode = "semantic_only";

export type MediaManiaCatalogItemLike = {
  id: string;
  source: string;
  mediaSource: string;
  title: string;
  creator?: string;
  traitKeys?: string[];
};

function byId<T extends { id: string }>(catalog: readonly T[]): Map<string, T> {
  return new Map(catalog.map((item) => [item.id, item]));
}

/** Media Mania evidence adapter: positive/negative item IDs plus the catalog's own `traitKeys`.
 * Only IDs the caller has not already adapted should be passed in (native evidence dedupe is the
 * integration state's responsibility, not this pure function's). */
export function adaptMediaManiaEvidenceToSignals(args: {
  newPositiveItemIds: readonly string[];
  newNegativeItemIds: readonly string[];
  catalog: readonly MediaManiaCatalogItemLike[];
}): SwipeSignalV2[] {
  const index = byId(args.catalog);
  const toSignal = (id: string, action: "like" | "dislike"): SwipeSignalV2 | null => {
    const item = index.get(id);
    if (!item) return null;
    return {
      id: item.id,
      title: item.title,
      action,
      source: item.mediaSource,
      tags: [...(item.traitKeys || [])],
      weight: 1,
    };
  };
  return [
    ...args.newPositiveItemIds.map((id) => toSignal(id, "like")),
    ...args.newNegativeItemIds.map((id) => toSignal(id, "dislike")),
  ].filter((signal): signal is SwipeSignalV2 => Boolean(signal));
}

/** The Last Bookshop evidence adapter: signals derived only from the actual works the player
 * selected to pitch, which of those the player predicted the customer would choose, and the
 * chosen pitch charm - never from the simulated customer outcome or reputation/coin rewards. */
export function adaptLastBookshopEncounterToSignals(args: {
  selectedWorkIds: readonly string[];
  predictedWorkId: string;
  pitchCharm: string;
  works: readonly Pick<LastBookshopWork, "id" | "title" | "tags">[];
}): SwipeSignalV2[] {
  const index = byId(args.works);
  return args.selectedWorkIds.map((workId) => {
    const work = index.get(workId);
    if (!work) return null;
    const signal: SwipeSignalV2 = {
      id: work.id,
      title: work.title,
      action: "like",
      source: "the_last_bookshop",
      tags: [...work.tags, `pitch:${args.pitchCharm}`],
      weight: workId === args.predictedWorkId ? 1.5 : 1,
    };
    return signal;
  }).filter((signal): signal is SwipeSignalV2 => Boolean(signal));
}

function tasteVectorToThemes(vector: TasteVector | CascadeTasteVector): string[] {
  return Object.entries(vector)
    .filter(([, value]) => typeof value === "number")
    .map(([axis, value]) => `${axis}:${(value as number) > 0 ? "high" : "low"}`);
}

/** The Unwritten Map evidence adapter: derives a single semantic signal from the option the player
 * actually selected (never a skipped or later-undone decision), combining the authored scenario's
 * option tags with its taste vector. There is no real book/media identity to attach, so this is
 * `"semantic_only"` evidence. */
export function adaptUnwrittenMapChoiceToSignal(args: {
  scenarioId: string;
  option: Pick<MapChoice, "id" | "label" | "tags" | "tasteVector">;
}): SwipeSignalV2 {
  return {
    id: `unwritten-map:${args.scenarioId}:${args.option.id}`,
    title: args.option.label,
    action: "like",
    source: "unwritten_map",
    tags: [...args.option.tags],
    themes: tasteVectorToThemes(args.option.tasteVector),
    weight: 1,
  };
}

/** The Alchemist's Cascade evidence adapter: only eligible, mechanically-balanced catalyst
 * choices carry preference evidence (mirrors `CascadeEvidenceEvent.preferenceInference ===
 * "eligible_balanced_semantic_choice"`); ordinary match-3 mechanics, timing, and failed levels
 * never do, and this function must not be called for them. */
export function adaptAlchemistsCascadeCatalystToSignal(
  option: Pick<CatalystOption, "id" | "title" | "tags" | "tasteVector">,
): SwipeSignalV2 {
  return {
    id: `alchemists-cascade:catalyst:${option.id}`,
    title: option.title,
    action: "like",
    source: "alchemists_cascade",
    tags: [...option.tags],
    themes: tasteVectorToThemes(option.tasteVector),
    weight: 1,
  };
}
