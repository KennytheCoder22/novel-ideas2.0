// Adapts each game's own native evidence into the client-side production recommender's
// `SwipeSignalV2` shape. These adapters never invent a second recommender: they only reshape
// evidence the games already collect so it can be handed to the real `runRecommenderV2` engine.
//
// - Media Mania and The Last Bookshop reference real cross-media/book identities, so their
//   adapters are tagged `"cross_media"`.
// - The Unwritten Map and The Alchemist's Cascade only ever expose taste-vector/tag semantics with
//   no real-world media identity, so their adapters are tagged `"semantic_only"`.
import type { CandidateFormatV2, SwipeSignalV2 } from "../../app/recommender-v2";
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

type SemanticFields = Pick<SwipeSignalV2, "genres" | "tones" | "themes" | "characterDynamics" | "tags"> & {
  format?: CandidateFormatV2;
};

const GENRE_TAGS: Record<string, string> = {
  adventure: "adventure",
  animals: "animals",
  comic: "comedy",
  comedy: "comedy",
  crime: "mystery",
  dystopian: "dystopian",
  fantastical: "fantasy",
  fantasy: "fantasy",
  funny: "comedy",
  ghosts: "horror",
  horror: "horror",
  historical: "historical",
  magical: "fantasy",
  mystery: "mystery",
  mythic: "mythology",
  romance: "romance",
  "science fiction": "science fiction",
  "science-fantasy": "science fiction",
  space: "science fiction",
  surreal: "fantasy",
  thriller: "thriller",
  western: "western",
};

const TONE_TAGS: Record<string, string> = {
  absurd: "playful",
  atmospheric: "atmospheric",
  celebratory: "joyful",
  cozy: "cozy",
  dark: "dark",
  dramatic: "dramatic",
  exhilarating: "exciting",
  gentle: "gentle",
  grim: "dark",
  hopeful: "hopeful",
  intimate: "intimate",
  melancholy: "melancholic",
  playful: "playful",
  poignant: "emotionally rich",
  reflective: "reflective",
  tense: "tense",
  warm: "warm",
  whimsical: "whimsical",
};

const PACING_TAGS: Record<string, string> = {
  fast: "fast-paced",
  kinetic: "fast-paced",
  patient: "slow-paced",
  quiet: "slow-paced",
  slow: "slow-paced",
  urgent: "fast-paced",
};

const CHARACTER_TAGS: Record<string, string> = {
  companion: "companionship",
  community: "community",
  ensemble: "ensemble cast",
  family: "family",
  "found-family": "found family",
  friendship: "friendship",
  rivals: "rivals",
  solitary: "solitary",
};

function unique(values: readonly string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function semanticFieldsFromTags(tags: readonly string[]): SemanticFields {
  const genres: string[] = [];
  const tones: string[] = [];
  const themes: string[] = [];
  const characterDynamics: string[] = [];
  const pacing: string[] = [];
  let format: CandidateFormatV2 | undefined;
  for (const rawTag of tags) {
    let tag = String(rawTag || "").trim().toLowerCase();
    if (!tag) continue;
    const separator = tag.indexOf(":");
    if (separator > 0) {
      const prefix = tag.slice(0, separator);
      const value = tag.slice(separator + 1).trim().replace(/_/g, " ");
      if (!value) continue;
      if (prefix === "genre") {
        genres.push(GENRE_TAGS[value] || value);
        continue;
      }
      if (prefix === "tone") {
        tones.push(TONE_TAGS[value] || value);
        continue;
      }
      if (prefix === "theme" || prefix === "topic") {
        themes.push(value);
        continue;
      }
      if (prefix === "format") {
        if (/graphic novel/.test(value)) format = "graphicNovel";
        else if (/comic/.test(value)) format = "comic";
        else if (/\b(book|reader|nonfiction)\b/.test(value)) format = "book";
        continue;
      }
      if (prefix === "pacing") {
        pacing.push(value === "high" ? "fast-paced" : value === "low" ? "slow-paced" : "steady-paced");
        continue;
      }
      if (prefix === "darkness") {
        tones.push(value === "high" ? "dark" : value === "low" ? "uplifting" : "balanced");
        continue;
      }
      if (prefix === "warmth") {
        tones.push(value === "high" ? "warm" : value === "low" ? "unsentimental" : "balanced");
        continue;
      }
      if (prefix === "realism") {
        genres.push(value === "high" ? "realistic fiction" : value === "low" ? "fantasy" : "fiction");
        continue;
      }
      if (prefix === "characterfocus") {
        themes.push(value === "high" ? "character-driven" : value === "low" ? "plot-driven" : "balanced");
        continue;
      }
      if (prefix === "ideadensity") {
        themes.push(value === "high" ? "thought-provoking" : value === "low" ? "accessible" : "balanced");
        continue;
      }
      if (prefix === "vibe") tag = value;
      else if (prefix === "facet" || prefix === "layout" || prefix === "publisher" || prefix === "source_universe") continue;
      else tag = value;
    }
    if (GENRE_TAGS[tag]) genres.push(GENRE_TAGS[tag]);
    else if (TONE_TAGS[tag]) tones.push(TONE_TAGS[tag]);
    else if (PACING_TAGS[tag]) pacing.push(PACING_TAGS[tag]);
    else if (CHARACTER_TAGS[tag]) characterDynamics.push(CHARACTER_TAGS[tag]);
    else themes.push(tag.replace(/-/g, " "));
  }
  return {
    genres: unique(genres),
    tones: unique(tones),
    themes: unique(themes),
    characterDynamics: unique(characterDynamics),
    tags: unique(pacing),
    format,
  };
}

function semanticFieldsFromTasteVector(vector: TasteVector | CascadeTasteVector): SemanticFields {
  const genres: string[] = [];
  const tones: string[] = [];
  const themes: string[] = [];
  const characterDynamics: string[] = [];
  const pacing: string[] = [];
  for (const [axis, rawValue] of Object.entries(vector)) {
    if (typeof rawValue !== "number") continue;
    const positive = rawValue > 0;
    if (axis === "humor") {
      tones.push(positive ? "humorous" : "serious");
      if (positive) genres.push("comedy");
    } else if (axis === "imagination") {
      themes.push(positive ? "imaginative" : "realistic");
      if (positive) genres.push("fantasy");
    } else if (axis === "intensity") {
      tones.push(positive ? "adventurous" : "gentle");
    } else if (axis === "novelty") {
      themes.push(positive ? "surprising" : "familiar");
    } else if (axis === "social_energy") {
      characterDynamics.push(positive ? "community" : "solitary");
    } else if (axis === "structure") {
      themes.push(positive ? "thoughtfully structured" : "exploratory");
    } else if (axis === "emotional_depth") {
      themes.push(positive ? "emotionally rich" : "lighthearted");
    } else if (axis === "pace") {
      pacing.push(positive ? "fast-paced" : "slow-paced");
    } else if (axis === "challenge") {
      themes.push(positive ? "puzzle-solving" : "accessible");
    } else if (axis === "visual_aesthetic") {
      tones.push(positive ? "atmospheric" : "understated");
    }
  }
  return {
    genres: unique(genres),
    tones: unique(tones),
    themes: unique(themes),
    characterDynamics: unique(characterDynamics),
    tags: unique(pacing),
  };
}

function mergeSemanticFields(...fields: SemanticFields[]): SemanticFields {
  return {
    genres: unique(fields.flatMap((value) => value.genres || [])),
    tones: unique(fields.flatMap((value) => value.tones || [])),
    themes: unique(fields.flatMap((value) => value.themes || [])),
    characterDynamics: unique(fields.flatMap((value) => value.characterDynamics || [])),
    tags: unique(fields.flatMap((value) => value.tags || [])),
    format: fields.map((value) => value.format).find(Boolean),
  };
}

function pitchCharmFields(pitchCharm: string): SemanticFields {
  if (pitchCharm === "mood") return { tones: ["atmospheric"] };
  if (pitchCharm === "world") return { themes: ["immersive world"] };
  if (pitchCharm === "pace") return { tags: ["fast-paced"] };
  if (pitchCharm === "surprise") return { themes: ["surprising"] };
  return {};
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
      ...semanticFieldsFromTags(item.traitKeys || []),
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
    const semantics = mergeSemanticFields(
      semanticFieldsFromTags(work.tags),
      workId === args.predictedWorkId ? pitchCharmFields(args.pitchCharm) : {},
    );
    const signal: SwipeSignalV2 = {
      id: work.id,
      title: work.title,
      action: "like",
      source: "the_last_bookshop",
      ...semantics,
      format: "book",
      weight: workId === args.predictedWorkId ? 1.5 : 1,
    };
    return signal;
  }).filter((signal): signal is SwipeSignalV2 => Boolean(signal));
}

/** The Unwritten Map evidence adapter: derives a single semantic signal from the option the player
 * actually selected (never a skipped or later-undone decision), combining the authored scenario's
 * option tags with its taste vector. There is no real book/media identity to attach, so this is
 * `"semantic_only"` evidence. */
export function adaptUnwrittenMapChoiceToSignal(args: {
  scenarioId: string;
  option: Pick<MapChoice, "id" | "label" | "tags" | "tasteVector">;
}): SwipeSignalV2 {
  const semantics = mergeSemanticFields(
    semanticFieldsFromTags(args.option.tags),
    semanticFieldsFromTasteVector(args.option.tasteVector),
  );
  return {
    id: `unwritten-map:${args.scenarioId}:${args.option.id}`,
    title: args.option.label,
    action: "like",
    source: "unwritten_map",
    ...semantics,
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
  const semantics = mergeSemanticFields(
    semanticFieldsFromTags(option.tags),
    semanticFieldsFromTasteVector(option.tasteVector),
  );
  return {
    id: `alchemists-cascade:catalyst:${option.id}`,
    title: option.title,
    action: "like",
    source: "alchemists_cascade",
    ...semantics,
    weight: 1,
  };
}
