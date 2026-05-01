import type { RecommenderInput } from "./types";
import { extractQuerySignals } from "./tasteToQuerySignals";
import { QUERY_TRANSLATIONS } from "./queryTranslations";
import { build20QRungs, rungToPreviewQuery } from "./build20QRungs";
import { buildDescriptiveQueriesFromTaste } from "./buildDescriptiveQueriesFromTaste";

type Family = "fantasy_family" | "horror_family" | "mystery_family" | "thriller_family" | "science_fiction_family" | "speculative_family" | "romance_family" | "historical_family" | "general_family";

type HypothesisLike = {
  label?: string;
  query?: string;
  parts?: string[];
  score?: number;
};

type TraitVector = {
  tone: Record<string, number>;
  genre: Record<string, number>;
  mood: Record<string, number>;
  excludes: Record<string, number>;
};

function getSwipeActionForRouting(value: any): string {
  return String(
    value?.action ??
    value?.decision ??
    value?.type ??
    value?.swipe ??
    value?.feedback ??
    value?.rating ??
    ""
  ).toLowerCase().trim();
}

function isSkippedSwipeForRouting(value: any): boolean {
  const action = getSwipeActionForRouting(value);
  return action === "skip" || action === "skipped" || action === "pass";
}

function isNegativeSwipeForRouting(value: any): boolean {
  const action = getSwipeActionForRouting(value);
  return action === "dislike" || action === "left" || action === "thumbs_down" || action === "down" || action === "no";
}

function isPositiveSwipeForRouting(value: any): boolean {
  const action = getSwipeActionForRouting(value);
  return action === "like" || action === "right" || action === "thumbs_up" || action === "up" || action === "yes";
}

function collectSwipeTagsForRouting(value: any): string[] {
  const sources = [
    value?.tags,
    value?.card?.tags,
    value?.item?.tags,
    value?.media?.tags,
    value?.doc?.tags,
    value?.signalTags,
  ];

  const out: string[] = [];
  for (const source of sources) {
    if (Array.isArray(source)) {
      for (const tag of source) {
        const cleaned = String(tag || "").toLowerCase().trim();
        if (cleaned) out.push(cleaned);
      }
    }
  }
  return Array.from(new Set(out));
}

function findSwipeArraysForRouting(input: any): any[][] {
  const candidates = [
    input?.swipeHistory,
    input?.swipes,
    input?.cards,
    input?.session?.swipeHistory,
    input?.session?.swipes,
    input?.tasteProfile?.swipeHistory,
    input?.tasteProfile?.evidence?.swipeHistory,
    input?.tasteProfile?.evidence?.swipes,
  ];
  return candidates.filter((value) => Array.isArray(value));
}

function accumulateTrait(target: Record<string, number>, key: string, delta: number): void {
  if (!key || !Number.isFinite(delta) || delta === 0) return;
  target[key] = Number((target[key] || 0) + delta);
}

function extractCardTraitsForRouting(swipe: any): { tone: string[]; genre: string[]; mood: string[]; exclude: string[] } {
  const tags = collectSwipeTagsForRouting(swipe);
  const traits = {
    tone: [] as string[],
    genre: [] as string[],
    mood: [] as string[],
    exclude: [] as string[],
  };

  for (const raw of tags) {
    const tag = String(raw || "").toLowerCase().trim();
    if (!tag) continue;
    const cleaned = tag.replace(/^(tone|vibe|mood|genre|theme|exclude_if_disliked):/, "");
    if (/^(tone|vibe):/.test(tag) || /\b(atmospheric|whimsical|surreal|dark|gentle|melancholic|stylized|quirky|dreamlike)\b/.test(cleaned)) traits.tone.push(cleaned);
    if (/^genre:/.test(tag) || /\b(horror|thriller|mystery|fantasy|science fiction|romance|historical|literary)\b/.test(cleaned)) traits.genre.push(cleaned);
    if (/^mood:/.test(tag) || /\b(emotionally resonant|emotionally_resonant|introspective|reflective|philosophical|human)\b/.test(cleaned)) traits.mood.push(cleaned.replace(/\s+/g, "_"));
    if (/^exclude_if_disliked:/.test(tag) || /\b(ya nostalgia|melodrama|franchise adventure)\b/.test(cleaned)) traits.exclude.push(cleaned.replace(/\s+/g, "_"));
  }

  return traits;
}

function buildSwipeTraitVector(input: any): TraitVector {
  const vector: TraitVector = { tone: {}, genre: {}, mood: {}, excludes: {} };
  const swipeArrays = findSwipeArraysForRouting(input);
  if (!swipeArrays.length) return vector;
  const swipes = swipeArrays.reduce((best, current) => current.length > best.length ? current : best, [] as any[]);

  for (const swipe of swipes) {
    const action = getSwipeActionForRouting(swipe);
    const traits = extractCardTraitsForRouting(swipe);
    const like = isPositiveSwipeForRouting(swipe);
    const dislike = isNegativeSwipeForRouting(swipe);
    const skip = isSkippedSwipeForRouting(swipe);
    const weight = like ? 1 : dislike ? -0.8 : skip ? 0.15 : 0;
    if (!weight) continue;
    for (const tone of traits.tone) accumulateTrait(vector.tone, tone, weight * 3);
    for (const genre of traits.genre) accumulateTrait(vector.genre, genre, weight * 1.4);
    for (const mood of traits.mood) accumulateTrait(vector.mood, mood, weight * 2.4);
    if (dislike) {
      for (const ex of traits.exclude) accumulateTrait(vector.excludes, ex, 3);
    }
    // repeated skips become weak negative signal
    if (skip && action) {
      const repeated = Number(vector.excludes[`skip:${action}`] || 0) + 1;
      vector.excludes[`skip:${action}`] = repeated;
    }
  }

  return vector;
}

function buildDecisionTagCountsForRouting(swipes: any[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const swipe of swipes) {
    if (isSkippedSwipeForRouting(swipe)) continue;
    const sign = isNegativeSwipeForRouting(swipe) ? -1 : isPositiveSwipeForRouting(swipe) ? 1 : 0;
    if (!sign) continue;
    for (const tag of collectSwipeTagsForRouting(swipe)) {
      counts[tag] = (counts[tag] || 0) + sign;
    }
  }
  return counts;
}

function removeSkippedSwipeEvidenceForRouting<T extends RecommenderInput>(input: T): T {
  const swipeArrays = findSwipeArraysForRouting(input as any);
  if (!swipeArrays.length) return input;

  const primarySwipes = swipeArrays.reduce((best, current) => current.length > best.length ? current : best, [] as any[]);
  const decisionSwipes = primarySwipes.filter((swipe) => !isSkippedSwipeForRouting(swipe));
  const decisionTagCounts = buildDecisionTagCountsForRouting(primarySwipes);
  const hasDecisionTagCounts = Object.keys(decisionTagCounts).length > 0;

  const next: any = {
    ...(input as any),
    swipeHistory: Array.isArray((input as any).swipeHistory) ? (input as any).swipeHistory.filter((swipe: any) => !isSkippedSwipeForRouting(swipe)) : (input as any).swipeHistory,
    swipes: Array.isArray((input as any).swipes) ? (input as any).swipes.filter((swipe: any) => !isSkippedSwipeForRouting(swipe)) : (input as any).swipes,
    cards: Array.isArray((input as any).cards) ? (input as any).cards.filter((swipe: any) => !isSkippedSwipeForRouting(swipe)) : (input as any).cards,
  };

  if ((input as any).session && typeof (input as any).session === "object") {
    next.session = {
      ...(input as any).session,
      swipeHistory: Array.isArray((input as any).session.swipeHistory) ? (input as any).session.swipeHistory.filter((swipe: any) => !isSkippedSwipeForRouting(swipe)) : (input as any).session.swipeHistory,
      swipes: Array.isArray((input as any).session.swipes) ? (input as any).session.swipes.filter((swipe: any) => !isSkippedSwipeForRouting(swipe)) : (input as any).session.swipes,
    };
  }

  if (hasDecisionTagCounts) {
    next.tagCounts = decisionTagCounts;
  }

  if ((input as any).tasteProfile && typeof (input as any).tasteProfile === "object") {
    next.tasteProfile = {
      ...(input as any).tasteProfile,
      ...(hasDecisionTagCounts ? { runningTagCounts: decisionTagCounts, tagCounts: decisionTagCounts } : {}),
      swipeHistory: Array.isArray((input as any).tasteProfile.swipeHistory) ? (input as any).tasteProfile.swipeHistory.filter((swipe: any) => !isSkippedSwipeForRouting(swipe)) : (input as any).tasteProfile.swipeHistory,
      evidence: {
        ...((input as any).tasteProfile.evidence || {}),
        swipes: decisionSwipes.length,
        feedback: decisionSwipes.filter((swipe) => isPositiveSwipeForRouting(swipe) || isNegativeSwipeForRouting(swipe)).length,
        swipeHistory: Array.isArray((input as any).tasteProfile.evidence?.swipeHistory) ? (input as any).tasteProfile.evidence.swipeHistory.filter((swipe: any) => !isSkippedSwipeForRouting(swipe)) : (input as any).tasteProfile.evidence?.swipeHistory,
      },
    };
  }

  return next as T;
}


const FANTASY_DRIFT_TERMS = /\b(science fiction|sci[- ]?fi|space opera|dystopian|horror|thriller|mystery|detective|crime|romance|historical fiction)\b/i;
const FANTASY_CORE_TERMS = /\b(fantasy|epic fantasy|high fantasy|dark fantasy|magic|magical|wizard|witch|dragon|fae|fairy|mythic|quest|kingdom|sword|sorcery)\b/i;
const HORROR_DRIFT_TERMS = /\b(science fiction|sci[- ]?fi|space opera|dystopian|fantasy romance|romance|historical fiction|cozy mystery)\b/i;
const HORROR_CORE_TERMS = /\b(horror|psychological horror|survival horror|haunted|ghost|supernatural|occult|possession|monster|terror|dread|eerie|disturbing)\b/i;
const THRILLER_DRIFT_TERMS = /\b(romance|romantic|fantasy romance|paranormal romance|urban romance|fantasy|magical|magic|witch|dragon|demon|fae|fairy|vampire|werewolf|shifter|office romance|faith-based|christian fiction)\b/i;
const THRILLER_CORE_TERMS = /\b(crime|thriller|psychological thriller|psychological suspense|serial killer|missing person|crime conspiracy|manhunt|fugitive|legal thriller|spy thriller)\b/i;
const MYSTERY_DRIFT_TERMS = /\b(romance|romantic|fantasy romance|paranormal romance|urban romance|fantasy|magical|magic|witch|dragon|demon|fae|fairy|vampire|werewolf|shifter|office romance|faith-based|christian fiction|science fiction|space opera)\b/i;
const MYSTERY_CORE_TERMS = /\b(mystery|detective|detective mystery|psychological suspense|psychological mystery|investigation|police procedural mystery|private investigator|cold case|police procedural|whodunit|noir)\b/i;

function topKeys(obj: Record<string, number>, limit: number): string[] {
  return Object.entries(obj)
    .filter(([, score]) => score > 0.05)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit || 3)
    .map(([key]) => key);
}

function expand(keys: string[], dictionary: Record<string, readonly string[] | string[]>): string[] {
  return keys.flatMap((key) => dictionary[key] || []);
}

function dedupeQueries(queries: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const query of queries) {
    const cleaned = String(query || "").replace(/\s+/g, " ").trim();
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(cleaned);
  }

  return out;
}

function filterCompatibleQueries(queries: string[], family: Family): string[] {
  if (family === "general_family") return dedupeQueries(queries);
  return dedupeQueries(queries).filter((query) => isFamilyCompatibleQuery(query, family));
}

function translateSignalBucket(
  keys: string[],
  dictionary: Record<string, readonly string[] | string[]>,
  family: Family
): string[] {
  return filterCompatibleQueries(expand(keys, dictionary), family);
}
function familyForGenres(genreKeys: string[]): Family {
  if (genreKeys.some((key) => ["mystery", "detective"].includes(key))) return "mystery_family";
  if (genreKeys.some((key) => ["crime", "thriller"].includes(key))) return "thriller_family";
  if (genreKeys.some((key) => ["science fiction", "dystopian"].includes(key))) return "science_fiction_family";
  if (genreKeys.includes("fantasy")) return "fantasy_family";
  if (genreKeys.includes("horror")) return "horror_family";
  if (genreKeys.includes("romance")) return "romance_family";
  if (genreKeys.includes("historical fiction") || genreKeys.includes("historical")) return "historical_family";
  return "general_family";
}

function isFamilyCompatibleQuery(query: string, family: Family): boolean {
  const q = String(query || "").toLowerCase();
  if (!q) return false;

  if (family === "mystery_family") {
    if (/\bscience fiction\b|\bfantasy\b|\bhorror\b|\bromance\b|\bhistorical fiction\b/.test(q)) return false;
    if (MYSTERY_DRIFT_TERMS.test(q)) return false;
    if (/\b(serial killer investigation thriller|crime conspiracy thriller|spy thriller|legal thriller|manhunt thriller|fugitive thriller)\b/.test(q)) return false;
    return MYSTERY_CORE_TERMS.test(q);
  }
  if (family === "thriller_family") {
    if (/\bscience fiction\b|\bfantasy\b|\bhorror\b|\bromance\b|\bhistorical fiction\b/.test(q)) return false;
    if (THRILLER_DRIFT_TERMS.test(q)) return false;
    if (/\bpsychological mystery\b|\bprivate investigator mystery\b|\bcold case mystery\b/.test(q)) return false;
    return THRILLER_CORE_TERMS.test(q);
  }
  if (family === "science_fiction_family") {
    if (/\bfantasy\b|\bhorror\b|\bromance\b|\bhistorical fiction\b/.test(q)) return false;
    if (/\bcrime thriller\b|\bdetective mystery\b|\bmystery thriller\b|\bserial killer\b|\bmanhunt\b|\bfugitive\b/.test(q) && !/\bscience fiction\b|\bdystopian\b|\bspace opera\b|\bartificial intelligence\b|\bai\b/.test(q)) return false;
    return /\bscience fiction\b|\bdystopian\b|\bspace opera\b|\bartificial intelligence\b|\bai\b/.test(q);
  }
  if (family === "fantasy_family") {
    if (FANTASY_DRIFT_TERMS.test(q) && !FANTASY_CORE_TERMS.test(q)) return false;
    return FANTASY_CORE_TERMS.test(q);
  }
  if (family === "horror_family") {
    if (HORROR_DRIFT_TERMS.test(q) && !HORROR_CORE_TERMS.test(q)) return false;
    return HORROR_CORE_TERMS.test(q);
  }
  if (family === "speculative_family") {
    if (/\bcrime thriller\b|\bdetective mystery\b|\bmystery thriller\b/.test(q)) return false;
    return /\bscience fiction\b|\bfantasy\b|\bhorror\b/.test(q);
  }
  if (family === "romance_family") return /\bromance\b/.test(q);
  if (family === "historical_family") {
    if (/\b(science fiction|fantasy|horror|romance|thriller|mystery|detective)\b/.test(q) && !/\bhistorical\b/.test(q)) return false;
    return /\b(historical|period fiction|victorian|edwardian|gilded age|19th century|civil war|world war|regency)\b/.test(q);
  }
  return true;
}

function familyCompatibleHypotheses(hypotheses: HypothesisLike[], family: Family): HypothesisLike[] {
  return hypotheses.filter((hypothesis) => isFamilyCompatibleQuery(hypothesis.query || "", family));
}

function guaranteedFamilyFallbacks(family: Family): string[] {
  if (family === "mystery_family") return [
    "psychological suspense novel",
    "detective mystery novel",
    "police procedural mystery novel",
    "psychological mystery novel",
    "cold case mystery novel",
  ];
  if (family === "science_fiction_family") return ["science fiction novel", "dystopian science fiction novel", "space opera science fiction", "psychological science fiction novel"];
  if (family === "fantasy_family") return ["epic fantasy novel", "high fantasy novel", "magic fantasy novel", "quest fantasy novel", "character driven fantasy novel"];
  if (family === "horror_family") return ["psychological horror novel", "survival horror novel", "haunted house horror novel", "supernatural horror novel"];
  if (family === "speculative_family") return ["science fiction novel", "epic fantasy novel", "psychological horror novel"];
  if (family === "thriller_family") return ["missing person thriller novel", "serial killer investigation thriller novel", "crime conspiracy thriller novel", "obsession psychological thriller novel", "procedural crime thriller novel"];
  if (family === "historical_family") return [
    "historical fiction novel",
    "period fiction novel",
    "literary historical fiction novel",
    "war historical fiction novel",
    "family saga historical fiction novel",
  ];
  if (family === "romance_family") return [
    "second chance romance novel",
    "forbidden love romance novel",
    "fantasy romance novel",
    "gothic romance novel",
    "historical romance novel",
    "emotional romance novel",
  ];
  return ["fiction novel"];
}


function buildIsolatedHistoricalBucketPlan(input: RecommenderInput, descriptive: ReturnType<typeof buildDescriptiveQueriesFromTaste>, hypotheses: HypothesisLike[]) {
  const isolatedHypotheses = familyCompatibleHypotheses(hypotheses, "historical_family");
  const activeHypotheses = isolatedHypotheses.length ? isolatedHypotheses : hypotheses.filter((h) => /\bhistorical\b/i.test(h?.query || h?.label || ""));

  const rungs = build20QRungs({
    baseGenre: "historical fiction",
    subgenres: [
      "historical fiction",
      "period fiction",
      "literary historical fiction",
      "war historical fiction",
      "family saga historical fiction",
    ],
    themes: [],
    tones: [],
    hypotheses: activeHypotheses,
  }, 4);

  const rungQueries = dedupeQueries(rungs.map((r) => rungToPreviewQuery(r)));
  const queries = dedupeQueries([
    ...rungQueries,
    ...guaranteedFamilyFallbacks("historical_family"),
  ]).slice(0, 6);

  return {
    rungs,
    queries,
    preview: queries[0] || descriptive.preview || "historical fiction novel",
    strategy: "20q-isolated-historical-plan",
    family: "historical_family" as Family,
    lane: "historical",
    hypotheses: activeHypotheses,
  };
}

export function buildBucketPlanFromTaste(input: RecommenderInput) {
  const routingInput = removeSkippedSwipeEvidenceForRouting(input);
  const signals = extractQuerySignals(routingInput);
  const traitVector = buildSwipeTraitVector(routingInput);
  for (const [k, v] of Object.entries(traitVector.tone)) signals.tone[k] = Number(signals.tone[k] || 0) + v;
  for (const [k, v] of Object.entries(traitVector.genre)) signals.genre[k] = Number(signals.genre[k] || 0) + v;
  for (const [k, v] of Object.entries(traitVector.mood)) signals.theme[k] = Number(signals.theme[k] || 0) + v;
  const descriptive = buildDescriptiveQueriesFromTaste(routingInput);

  const genreKeys = topKeys(signals.genre, 5);
  const toneKeys = topKeys(signals.tone, 4);
  const scenarioKeys = topKeys(signals.scenario, 3);
  const themeKeys = topKeys(signals.theme, 3);

  let family = familyForGenres(genreKeys);

  const descriptiveQueriesLower = (descriptive.queries || []).map((q) => String(q).toLowerCase());
  const descriptiveBlob = descriptiveQueriesLower.join(" ");
  const warmthAxis = Number((routingInput as any)?.tasteProfile?.axes?.warmth ?? 0);
  const darknessAxis = Number((routingInput as any)?.tasteProfile?.axes?.darkness ?? 0);
  const hasWarmLowDarkProfile =
    Number.isFinite(warmthAxis) &&
    Number.isFinite(darknessAxis) &&
    warmthAxis >= 0.2 &&
    darknessAxis <= -0.2;

  const toneBlob = [...toneKeys, ...descriptiveQueriesLower].join(" ");
  const literaryWhimsicalTone = /\b(whimsical|offbeat|quirky|atmospheric|dreamlike|surreal|philosophical|reflective|contemplative|human|character[-\s]?driven|literary|gentle|tender|warm|melancholic)\b/.test(toneBlob);
  const groundedHumanTone = /\b(grounded|introspective|emotionally\s+weighty|emotional|morally\s+complex|character[-\s]?driven|human[-\s]?centered|serious|quiet|realist|literary|philosophical)\b/.test(toneBlob);
  const hardHorrorNative = /psychological horror|survival horror|haunted|ghost|supernatural|occult|possession|monster|dread/.test(descriptiveBlob);
  const horrorSignalPresent =
    genreKeys.includes("horror") ||
    descriptiveQueriesLower.some((q) => /horror|haunted|ghost|supernatural|occult|possession/.test(q));
  const horrorSuppressedByTone = (groundedHumanTone || literaryWhimsicalTone) && !hardHorrorNative;
  const isHorror = !horrorSuppressedByTone && horrorSignalPresent;

  const hardFantasyNative = /epic fantasy|high fantasy|dark fantasy|magic|wizard|witch|dragon|fae|fairy|mythic|sword|sorcery|quest fantasy/.test(descriptiveBlob);
  const fantasySignalPresent =
    genreKeys.includes("fantasy") ||
    descriptiveQueriesLower.some((q) => /fantasy|magic|dragon|wizard|witch|fae|mythic/.test(q));
  const fantasySuppressedByTone = groundedHumanTone && !hardFantasyNative;
  const isFantasy = !fantasySuppressedByTone && fantasySignalPresent;

  const romanceSignalPresent =
    genreKeys.includes("romance") ||
    descriptiveQueriesLower.some((q) => /romance|love story|relationship|second chance romance|forbidden love romance|historical romance|gothic romance|fantasy romance|emotional romance/.test(q));

  const hardMysteryNative = /psychological mystery|murder investigation|crime detective|private investigator|cold case|whodunit|detective mystery|police procedural mystery/.test(descriptiveBlob);

  const mysterySignalPresent =
    genreKeys.some((key) => ["mystery", "detective"].includes(key)) ||
    descriptiveQueriesLower.some((q) => /psychological mystery|murder investigation|crime detective|private investigator|cold case|detective mystery|police procedural mystery/.test(q));

  const hardThrillerNative = /psychological thriller|crime thriller|serial killer|missing person|missing child|fbi|crime conspiracy|conspiracy thriller|manhunt|fugitive|abduction|spy thriller|legal thriller/.test(descriptiveBlob);

  const thrillerSignalPresent =
    genreKeys.some((key) => ["crime", "thriller"].includes(key)) ||
    descriptiveQueriesLower.some((q) => /thriller|crime thriller|serial killer|missing person|crime conspiracy|procedural crime thriller|suspense/.test(q));

  const hardThrillerIntent =
    hardThrillerNative ||
    genreKeys.some((key) => ["crime", "thriller"].includes(key)) ||
    descriptiveQueriesLower.some((q) => /serial killer|missing person|missing child|crime conspiracy|manhunt|fugitive|abduction|spy thriller|legal thriller/.test(q));

  const mysterySuppressedByTone = literaryWhimsicalTone && !hardMysteryNative;
  const isMystery = !mysterySuppressedByTone && mysterySignalPresent && (!romanceSignalPresent || hardMysteryNative);
  const thrillerSuppressedByTone = (hasWarmLowDarkProfile || literaryWhimsicalTone) && !hardThrillerIntent;
  const isThriller =
    !thrillerSuppressedByTone &&
    !isMystery &&
    thrillerSignalPresent &&
    (!romanceSignalPresent || hardThrillerNative);

  const isRomance = romanceSignalPresent;

  const isHistorical =
    genreKeys.includes("historical fiction") ||
    genreKeys.includes("historical") ||
    descriptiveQueriesLower.some((q) => /historical fiction|historical romance|period fiction|gilded age|regency|victorian/.test(q));

  const hardScienceFictionNative = /science fiction|space opera|dystopian|cyberpunk|post-apocalyptic|artificial intelligence|\bai\b/.test(descriptiveBlob);
  const scienceFictionSignalPresent =
    genreKeys.some((key) => ["science fiction", "dystopian"].includes(key)) ||
    descriptiveQueriesLower.some((q) => /science fiction|dystopian|space opera|artificial intelligence|\bai\b/.test(q));
  const scienceFictionSuppressedByTone = groundedHumanTone && !hardScienceFictionNative;

  const isScienceFiction =
    !isHorror &&
    !isFantasy &&
    !scienceFictionSuppressedByTone &&
    scienceFictionSignalPresent;

  if (isHorror) {
    family = "horror_family";
  } else if (isFantasy) {
    family = "fantasy_family";
  } else if (isScienceFiction) {
    family = "science_fiction_family";
  } else if (isRomance) {
    family = "romance_family";
  } else if (isMystery) {
    family = "mystery_family";
  } else if (isThriller) {
    family = "thriller_family";
  } else if (isHistorical) {
    family = "historical_family";
  }

  let lane: string = family;
  if (isHorror) lane = "horror";
  else if (isFantasy) lane = "fantasy";
  else if (isScienceFiction) lane = "science_fiction";
  else if (isRomance) lane = "romance";
  else if (isMystery) lane = "mystery";
  else if (isThriller) lane = "thriller";
  else if (isHistorical) lane = "historical";

  const translatedGenres = translateSignalBucket(
    genreKeys,
    QUERY_TRANSLATIONS.genre as unknown as Record<string, readonly string[] | string[]>,
    family
  );

  const translatedTones = dedupeQueries(
    expand(
      toneKeys,
      QUERY_TRANSLATIONS.tone as unknown as Record<string, readonly string[] | string[]>
    )
  );

  const translatedScenarios = dedupeQueries([
    ...expand(
      scenarioKeys,
      QUERY_TRANSLATIONS.scenario as unknown as Record<string, readonly string[] | string[]>
    ),
    ...expand(
      themeKeys,
      QUERY_TRANSLATIONS.scenario as unknown as Record<string, readonly string[] | string[]>
    ),
  ]);

  const descriptiveQueries = filterCompatibleQueries(
    dedupeQueries(descriptive.queries || []),
    family
  );

  const descriptiveHypotheses = (descriptive.hypotheses || []) as HypothesisLike[];
  if (family === "historical_family" || lane === "historical") {
    return buildIsolatedHistoricalBucketPlan(routingInput, descriptive, descriptiveHypotheses);
  }

  const hypotheses = familyCompatibleHypotheses(descriptiveHypotheses, family);
  const activeHypotheses = hypotheses.length ? hypotheses : descriptiveHypotheses;

  const baseGenre =
    translatedGenres[0] ||
    activeHypotheses[0]?.query ||
    descriptiveQueries[0] ||
    guaranteedFamilyFallbacks(family)[0] ||
    "fiction novel";

  const subgenres = filterCompatibleQueries([
    ...translatedGenres,
    ...descriptiveQueries,
    ...activeHypotheses.map((h) => h.query || "").filter(Boolean),
  ], family).slice(0, 6);

  const rungs = build20QRungs({
    baseGenre,
    subgenres,
    themes: translatedScenarios,
    tones: translatedTones,
    hypotheses: activeHypotheses,
  }, 4);

  const rungQueries = dedupeQueries(rungs.map((r) => rungToPreviewQuery(r)));
  const queries = dedupeQueries([
    ...descriptiveQueries,
    ...rungQueries,
    ...guaranteedFamilyFallbacks(family),
  ]).slice(0, 6);

  return {
    rungs,
    queries,
    preview: queries[0] || descriptive.preview || baseGenre,
    strategy: `20q-signal-bucket-plan:${family}`,
    family,
    lane,
    hypotheses: activeHypotheses,
  };
}

export default buildBucketPlanFromTaste;
