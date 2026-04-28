import type {
  EngineId,
  RecommenderInput,
  RecommendationResult,
  DomainMode,
  RecommendationDoc,
  CommercialSignals,
  RecommendationSourceDiagnostics,
} from "./types";

import { getGoogleBooksRecommendations } from "./googleBooks/googleBooksRecommender";
import { getOpenLibraryRecommendations } from "./openLibrary/openLibraryRecommender";
import { getKitsuMangaRecommendations } from "./kitsu/kitsuMangaRecommender";
import { getGcdGraphicNovelRecommendations } from "./gcd/gcdGraphicNovelRecommender";
import { normalizeCandidates, type CandidateSource } from "./normalizeCandidate";
import { finalRecommenderForDeck, getLastFinalRecommenderDebug } from "./finalRecommender";
import { getHardcoverRatings } from "../../services/hardcover/hardcoverRatings";
import { buildBucketPlanFromTaste } from "./buildBucketPlanFromTaste";
import { buildDescriptiveQueriesFromTaste } from "./buildDescriptiveQueriesFromTaste";
import { build20QRungs } from "./build20QRungs";
import { filterCandidates } from "./filterCandidates";
import { getNytBestsellerBooks } from "../../services/bestsellers/nytClient";
import { adaptNytBooksToRecommendationDocs } from "../../services/bestsellers/nytAdapter";
import { mergeBestsellerDocs } from "../../services/bestsellers/bestsellerMatcher";

export type EngineOverride = EngineId | "auto";

type RecommenderDebugSourceStats = {
  rawFetched: number;
  postFilterCandidates: number;
  finalSelected: number;
};

const MIN_DECISION_SWIPES_FOR_FULL_ROUTER_EXPANSION = 4;
const MIN_VISUAL_SIGNAL_FOR_KITSU = 2;
const MIN_VISUAL_SIGNAL_FOR_GCD = 2;
const MIN_RELAXED_FILTER_POOL = 10;
const MIN_ROUTER_RECOVERY_POOL = 18;
const MIN_OPEN_LIBRARY_SURVIVORS = 3;
const MIN_OPEN_LIBRARY_CANDIDATES = 10;
const MIN_ROMANCE_OPEN_LIBRARY_FINAL = 2;
const MIN_DECISION_SWIPES_FOR_NYT_ANCHORS = 4;
const MIN_POOL_FOR_NYT_INJECTION = 14;
const MAX_NYT_ANCHOR_INJECTIONS = 2;
const NYT_TONE_SIMILARITY_THRESHOLD = 0.34;

// Temporary validation logging for the taste-shaped query rollout.
// Set to false after query/fetch/filter/final behavior is confirmed stable.
const DEBUG_RECOMMENDER_VALIDATION = true;

function debugRouterLog(label: string, payload?: unknown): void {
  if (!DEBUG_RECOMMENDER_VALIDATION) return;
  if (payload === undefined) console.log(`[RECOMMENDER DEBUG] ${label}`);
  else console.log(`[RECOMMENDER DEBUG] ${label}`, payload);
}

function debugDocPreview(label: string, docs: any[], limit = 10): void {
  if (!DEBUG_RECOMMENDER_VALIDATION) return;
  const safeDocs = Array.isArray(docs) ? docs : [];
  console.log(`[RECOMMENDER DEBUG] ${label} COUNT:`, safeDocs.length);
  safeDocs.slice(0, limit).forEach((doc, index) => {
    const author = Array.isArray(doc?.author_name) ? doc.author_name[0] : doc?.author;
    console.log(`[RECOMMENDER DEBUG] ${label} ${index + 1}:`, doc?.title, "|", author, "|", doc?.source ?? doc?.rawDoc?.source);
  });
}

function asArray<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

function unwrapFilteredCandidates(value: any): RecommendationDoc[] {
  if (Array.isArray(value)) return value as RecommendationDoc[];
  if (value && Array.isArray(value.candidates)) return value.candidates as RecommendationDoc[];
  return [];
}

function resolveSourceEnabled(input: RecommenderInput): RecommendationSourceDiagnostics {
  const config = (input as any)?.sourceEnabled || {};
  const localLibrarySupported = Boolean((input as any)?.localLibrarySupported);
  return {
    googleBooks: config?.googleBooks !== false,
    openLibrary: config?.openLibrary !== false,
    localLibrary: localLibrarySupported ? config?.localLibrary !== false : false,
  };
}

type NytAnchorDebug = {
  enabled: boolean;
  fetched: number;
  matched: number;
  injected: number;
  allowInjections: boolean;
  lists: string[];
  error?: string;
};

function nytListsForRouterFamily(family: RouterFamilyKey): string[] {
  if (family === "romance") {
    return ["combined-print-and-e-book-fiction", "trade-fiction-paperback"];
  }

  if (family === "science_fiction" || family === "speculative" || family === "fantasy" || family === "horror") {
    return ["combined-print-and-e-book-fiction", "hardcover-fiction", "trade-fiction-paperback"];
  }

  if (family === "mystery" || family === "thriller") {
    return ["combined-print-and-e-book-fiction", "hardcover-fiction", "trade-fiction-paperback"];
  }

  if (family === "historical") {
    return ["combined-print-and-e-book-fiction", "trade-fiction-paperback"];
  }

  return ["combined-print-and-e-book-fiction", "hardcover-fiction"];
}

function shouldUseNytAnchors(input: RecommenderInput): boolean {
  if (input.deckKey !== "adult" && input.deckKey !== "ms_hs") return false;
  return decisionSwipeCountFromTasteProfile(input) >= MIN_DECISION_SWIPES_FOR_NYT_ANCHORS;
}

function shouldAllowNytAnchorInjections(filteredCount: number, finalLimit: number): boolean {
  return filteredCount < Math.max(MIN_POOL_FOR_NYT_INJECTION, finalLimit * 2);
}

function inferFamilyFromQueryText(query: string, fallback: RouterFamilyKey): RouterFamilyKey {
  const q = String(query || "").toLowerCase();
  if (!q) return fallback;
  if (/\b(psychological thriller|crime thriller|conspiracy thriller|fugitive thriller|manhunt thriller|abduction thriller|thriller)\b/.test(q)) return "thriller";
  if (/\b(psychological mystery|detective mystery|cold case mystery|mystery)\b/.test(q)) return "mystery";
  if (/\b(psychological horror|survival horror|haunted|horror)\b/.test(q)) return "horror";
  if (/\b(science fiction|dystopian|space opera|speculative)\b/.test(q)) return "science_fiction";
  if (/\b(epic fantasy|dark fantasy|magic fantasy|fantasy)\b/.test(q)) return "fantasy";
  if (/\b(historical fiction|historical novel|period fiction|historical|19th century|victorian|gilded age|civil war|world war|american historical|american novel|western historical)\b/.test(q)) return "historical";
  if (/\b(romance|love story|second chance romance|gothic romance|historical romance)\b/.test(q)) return "romance";
  return fallback;
}

function inferHistoricalFromQueryText(query: string): boolean {
  const q = String(query || "").toLowerCase();
  return /\b(historical fiction novel|historical fiction|19th century|war historical fiction|society historical fiction|civil war|american historical|american novel|gilded age|victorian|western historical)\b/.test(q);
}

function isMetaReferenceWork(doc: any): boolean {
  const title = String(doc?.title ?? doc?.rawDoc?.title ?? "").toLowerCase();
  const categories = [
    doc?.categories,
    doc?.subject,
    doc?.subjects,
    doc?.genre,
    doc?.genres,
    doc?.rawDoc?.categories,
    doc?.rawDoc?.subject,
    doc?.rawDoc?.subjects,
    doc?.rawDoc?.genre,
    doc?.rawDoc?.genres,
  ].flatMap((value: any) => (Array.isArray(value) ? value : [value])).filter(Boolean).join(" ").toLowerCase();
  const description = String(doc?.description ?? doc?.rawDoc?.description ?? "").toLowerCase();
  const combined = `${title} ${categories} ${description}`.trim();

  return /\b(letter|letters|log|reconsidered|commentary|criticism|analysis|study|studies|guide|companion|readalong|history|lives|meditations|tao te ching|selected works|complete works|collected works|reference|history and criticism|study guide|bibliograph(?:y|ies)|encyclopedia|catalog(?:ue)?|handbook|guide to)\b/.test(combined);
}

function isScienceFictionMetaCollection(doc: any): boolean {
  const text = [
    doc?.title,
    doc?.description,
    doc?.subtitle,
    ...(Array.isArray(doc?.subject) ? doc.subject : []),
    ...(Array.isArray(doc?.subjects) ? doc.subjects : []),
    doc?.rawDoc?.title,
    doc?.rawDoc?.description,
    doc?.rawDoc?.subtitle,
  ].filter(Boolean).join(" ").toLowerCase();

  return /\b(collection|anthology|hall of fame|selected|complete|stories|short|volume|criticism|essays|language of|guide|companion|baker['’]?s dozen)\b/.test(text);
}

function scienceFictionNarrativeQualityScore(doc: any): number {
  const text = [
    doc?.title,
    doc?.description,
    doc?.subtitle,
    ...(Array.isArray(doc?.subject) ? doc.subject : []),
    ...(Array.isArray(doc?.subjects) ? doc.subjects : []),
  ].filter(Boolean).join(" ").toLowerCase();
  const pageCount = Number(doc?.pageCount ?? doc?.rawDoc?.pageCount ?? doc?.rawDoc?.number_of_pages_median ?? 0);
  let score = 0;
  if (/\b(novel|book \d+|trilogy|series)\b/.test(text)) score += 2;
  if (pageCount >= 140) score += 1;
  if (pageCount > 0 && pageCount < 90) score -= 2;
  if (/\b(collection|anthology|stories|short stories|essays|criticism|language of|guide|companion|hall of fame)\b/.test(text)) score -= 4;
  return score;
}

function isHistoricalPrimaryOrNonNarrative(doc: any): boolean {
  const text = [
    doc?.title,
    doc?.description,
    doc?.subtitle,
    ...(Array.isArray(doc?.subject) ? doc.subject : []),
    ...(Array.isArray(doc?.subjects) ? doc.subjects : []),
    doc?.rawDoc?.title,
    doc?.rawDoc?.description,
  ].filter(Boolean).join(" ").toLowerCase();

  const banned = /\b(history|meditations|art of war|biography|essays|letters|philosophy|primary source|treatise|herodotus|marcus aurelius)\b/.test(text);
  const bleed = /\b(harry potter|fantasy|wizard|witch|dragon|magic school|science fiction|time machine|space opera|dystopian)\b/.test(text);
  const historicalSignal = /\b(historical fiction|historical novel|19th century|victorian|war|monarchy|empire|society|regency|gilded age|civil war)\b/.test(text);
  const narrativeNovelSignal = /\b(novel|fiction|story of|follows)\b/.test(text);
  return banned || bleed || (!historicalSignal && !narrativeNovelSignal);
}

function historicalNarrativeQualityScore(doc: any): number {
  const text = [
    doc?.title,
    doc?.description,
    ...(Array.isArray(doc?.subject) ? doc.subject : []),
    ...(Array.isArray(doc?.subjects) ? doc.subjects : []),
  ].filter(Boolean).join(" ").toLowerCase();
  let score = 0;
  if (/\b(historical fiction|historical novel)\b/.test(text)) score += 3;
  if (/\b(19th century|war|monarchy|society|victorian|civil war|gilded age)\b/.test(text)) score += 2;
  if (/\b(classics?|classic literature)\b/.test(text) && !/\b(historical fiction|historical novel)\b/.test(text)) score -= 1;
  if (/\b(fantasy|science fiction|dystopian|wizard|dragon|space opera)\b/.test(text)) score -= 3;
  if (/\b(philosophy|meditations|history|biography|essays|letters)\b/.test(text)) score -= 4;
  return score;
}

function nytAnchorMatchesFamily(doc: RecommendationDoc, family: RouterFamilyKey): boolean {
  const narrativeText = [doc?.title, doc?.description].filter(Boolean).join(" ").toLowerCase();
  const text = [
    doc?.title,
    doc?.description,
    ...(Array.isArray((doc as any)?.subject) ? (doc as any).subject : []),
    (doc as any)?.nyt?.display_name,
    (doc as any)?.nyt?.list_name,
  ].filter(Boolean).join(" ").toLowerCase();
  if (!text) return false;

  if (family === "thriller") return /\b(thriller|suspense|crime|murder|killer|investigation|detective|fbi|conspiracy|manhunt|abduction)\b/.test(narrativeText);
  if (family === "mystery") return /\b(mystery|detective|investigation|crime|whodunit|private investigator)\b/.test(narrativeText);
  if (family === "horror") return /\b(horror|haunted|ghost|supernatural|occult|dread|nightmare)\b/.test(text);
  if (family === "science_fiction" || family === "speculative") return /\b(science fiction|sci-fi|dystopian|speculative|space|alien|time travel|ai|artificial intelligence)\b/.test(text);
  if (family === "fantasy") return /\b(fantasy|magic|dragon|sorcer|witch|fae|epic fantasy|dark fantasy)\b/.test(text);
  if (family === "historical") return /\b(historical|period fiction|world war|civil war|victorian|regency|gilded age)\b/.test(text);
  if (family === "romance") return /\b(romance|love|relationship|second chance|forbidden love)\b/.test(text);
  return false;
}

function collectRouterToneTokens(input: RecommenderInput): string[] {
  const bucketPlan: any = (input as any)?.bucketPlan || {};
  const fromSignals = Array.isArray(bucketPlan?.signals?.tones) ? bucketPlan.signals.tones : [];
  const fromQueries = Array.isArray(bucketPlan?.queries) ? bucketPlan.queries.slice(0, 6) : [];
  const seed = [bucketPlan?.preview, ...fromSignals, ...fromQueries].filter(Boolean).join(" ").toLowerCase();
  const tokens = seed.match(/\b(gritty|dark|bleak|tense|fast|slow|cozy|warm|emotional|brooding|suspenseful|atmospheric|twisty|literary|romantic|hopeful|intense|violent|haunting)\b/g) || [];
  return Array.from(new Set(tokens));
}

function nytAnchorToneSimilarity(doc: RecommendationDoc, toneTokens: string[]): number {
  if (!toneTokens.length) return 0;
  const text = [
    doc?.title,
    doc?.description,
    ...(Array.isArray((doc as any)?.subject) ? (doc as any).subject : []),
    ...(Array.isArray((doc as any)?.subjects) ? (doc as any).subjects : []),
  ].filter(Boolean).join(" ").toLowerCase();
  if (!text) return 0;
  let hits = 0;
  for (const token of toneTokens) {
    if (text.includes(token)) hits += 1;
  }
  return hits / toneTokens.length;
}

function isNytAnchorDoc(doc: RecommendationDoc): boolean {
  return Boolean((doc as any)?.nyt || (doc as any)?.commercialSignals?.bestseller) &&
    String((doc as any)?.laneKind || "").toLowerCase() === "anchor";
}

function capNytAnchorInjections(docs: RecommendationDoc[], maxAnchors = MAX_NYT_ANCHOR_INJECTIONS): RecommendationDoc[] {
  let anchorCount = 0;
  return (Array.isArray(docs) ? docs : []).filter((doc) => {
    if (!isNytAnchorDoc(doc)) return true;
    anchorCount += 1;
    return anchorCount <= maxAnchors;
  });
}

async function fetchNytAnchorDocs(
  input: RecommenderInput,
  family: RouterFamilyKey
): Promise<{ docs: RecommendationDoc[]; debug: NytAnchorDebug }> {
  const lists = nytListsForRouterFamily(family);
  const debug: NytAnchorDebug = {
    enabled: shouldUseNytAnchors(input),
    fetched: 0,
    matched: 0,
    injected: 0,
    allowInjections: false,
    lists,
  };

  if (!debug.enabled) return { docs: [], debug };

  try {
    const books = await getNytBestsellerBooks({
      listNames: lists,
      date: "current",
      maxPerList: 10,
      timeoutMs: 4500,
    });

    debug.fetched = books.length;
    const docs = adaptNytBooksToRecommendationDocs(books).map((doc) => ({
      ...doc,
      queryFamily: family,
      primaryLane: family,
      diagnostics: {
        ...((doc as any)?.diagnostics || {}),
        queryFamily: family,
        primaryLane: family,
        laneKind: "anchor",
        commercialBoost: "nyt-bestseller-anchor",
      },
    })) as RecommendationDoc[];

    const toneTokens = collectRouterToneTokens(input);
    const familyMatchedDocs = docs.filter((doc) => {
      const familyMatch = nytAnchorMatchesFamily(doc, family);
      const toneSimilarity = nytAnchorToneSimilarity(doc, toneTokens);
      (doc as any).nytToneSimilarity = toneSimilarity;
      return familyMatch || toneSimilarity >= NYT_TONE_SIMILARITY_THRESHOLD;
    });

    return { docs: familyMatchedDocs, debug };
  } catch (error: any) {
    debug.error = typeof error?.message === "string" ? error.message : "NYT bestseller fetch failed";
    return { docs: [], debug };
  }
}


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



function dedupeNonEmptyQueries(values: Array<string | undefined | null>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const value of values) {
    const cleaned = String(value || "").replace(/\s+/g, " ").trim();
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(cleaned);
  }

  return out;
}

function normalizeQueryKey(value: unknown): string {
  return String(value || "")
    .toLowerCase()
    .replace(/["']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function preferredPrimaryRungs(rungs: any[]): Set<string> {
  const primaryQueryKey = normalizeQueryKey(rungs?.[0]?.query);
  if (!primaryQueryKey) return new Set<string>();

  return new Set(
    (Array.isArray(rungs) ? rungs : [])
      .filter((r) => normalizeQueryKey(r?.query) === primaryQueryKey)
      .map((r) => String(r?.rung))
      .filter(Boolean)
  );
}

function decisionSwipeCountFromTasteProfile(input: RecommenderInput): number {
  return Number((input as any)?.tasteProfile?.evidence?.swipes || 0);
}

function hasStrong20QSession(input: RecommenderInput): boolean {
  return decisionSwipeCountFromTasteProfile(input) >= MIN_DECISION_SWIPES_FOR_FULL_ROUTER_EXPANSION;
}

function buildRouterBucketPlan(input: RecommenderInput) {
  const routingInput = removeSkippedSwipeEvidenceForRouting(input);
  const descriptivePlan = buildDescriptiveQueriesFromTaste(routingInput);
  const translatedBucketPlan = buildBucketPlanFromTaste(routingInput);

  // Gold-standard router rule:
  // prefer the descriptive query hypothesis as primary; use translated buckets
  // only as expansion, never as a replacement.
  const primaryQueries = Array.isArray(descriptivePlan?.queries) ? descriptivePlan.queries : [];
  const directEvidenceWeights = buildDirectEvidenceLaneWeights(routingInput);
  const hasDirectHistoricalEvidence = Number(directEvidenceWeights.historical || 0) > 0;
  const secondaryQueries = (Array.isArray(translatedBucketPlan?.queries) ? translatedBucketPlan.queries : [])
    .filter((query: string) => {
      if (hasDirectHistoricalEvidence) return true;
      return !/\b(19th century|civil war historical|family saga historical|literary historical|historical fiction|historical novel|period fiction)\b/i.test(String(query || ""));
    });

  const queries = dedupeNonEmptyQueries([
    ...primaryQueries,
    ...secondaryQueries,
  ]).slice(0, 4);

  debugRouterLog("ROUTER QUERY PLAN", {
    deckKey: (routingInput as any)?.deckKey,
    domainModeOverride: (routingInput as any)?.domainModeOverride,
    primaryQueryCount: primaryQueries.length,
    secondaryQueryCount: secondaryQueries.length,
    finalQueryCount: queries.length,
    queries,
  });

  const preview =
    descriptivePlan?.preview ||
    primaryQueries[0] ||
    secondaryQueries[0] ||
    (!hasDirectHistoricalEvidence ? "" : translatedBucketPlan?.preview) ||
    queries[0] ||
    "";

  const intentText = [
    descriptivePlan?.lane,
    descriptivePlan?.family,
    translatedBucketPlan?.lane,
    translatedBucketPlan?.family,
    preview,
    ...queries,
    ...(Array.isArray(descriptivePlan?.signals?.genres) ? descriptivePlan.signals.genres : []),
    ...(Array.isArray(translatedBucketPlan?.signals?.genres) ? translatedBucketPlan.signals.genres : []),
    ...(Array.isArray(descriptivePlan?.signals?.tones) ? descriptivePlan.signals.tones : []),
    ...(Array.isArray(translatedBucketPlan?.signals?.tones) ? translatedBucketPlan.signals.tones : []),
    ...(Array.isArray(descriptivePlan?.signals?.scenarios) ? descriptivePlan.signals.scenarios : []),
    ...(Array.isArray(translatedBucketPlan?.signals?.scenarios) ? translatedBucketPlan.signals.scenarios : []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const explicitFamily = String(
    descriptivePlan?.lane ||
    descriptivePlan?.family ||
    translatedBucketPlan?.lane ||
    translatedBucketPlan?.family ||
    ""
  ).toLowerCase();

  // Keep the active 20Q family stable from fetch through filter/final scoring.
  // Mystery and thriller share many words; thriller-intent sessions should not
  // collapse to mystery merely because the query contains murder/detective/case.
  const hasHorrorIntent =
    /\b(psychological horror|survival horror|haunted house horror|horror|haunted|ghost|supernatural|occult|possession|monster|terror|dread|gothic horror)\b/.test(intentText);
  const hasThrillerIntent =
    /\b(thriller|psychological suspense|domestic suspense|serial killer|missing person|missing child|abduction|fbi|manhunt|fugitive|crime conspiracy|spy thriller|legal thriller)\b/.test(intentText);

  const resolvedFamily =
    hasHorrorIntent
      ? "horror"
      : hasThrillerIntent
      ? "thriller"
      : /\bfantasy\b|\bmagic\b|\bdragon\b|\bquest\b/.test(intentText)
      ? "fantasy"
      : /\bscience fiction\b|\bsci-fi\b|\bdystopian\b|\bspace opera\b/.test(intentText)
      ? "science_fiction"
      : /\bromance novel\b|\bromantic fiction\b|\bgenre:romance\b|\bregency romance\b/.test(intentText)
      ? "romance"
      : hasDirectHistoricalEvidence && /\bhistorical\b|\bperiod fiction\b|\bgilded age\b|\b19th century\b/.test(intentText)
      ? "historical"
      : /\bmystery\b|\bwhodunit\b|\bprivate investigator\b|\bcold case\b|\bdetective mystery\b/.test(intentText)
      ? "mystery"
      : ["fantasy", "horror", "mystery", "thriller", "romance", "historical", "science_fiction", "speculative", "general"].includes(explicitFamily) && (explicitFamily !== "historical" || hasDirectHistoricalEvidence)
      ? explicitFamily
      : (hasDirectHistoricalEvidence ? (translatedBucketPlan?.lane || translatedBucketPlan?.family) : "") || "general";

  return {
    ...translatedBucketPlan,
    queries,
    preview,
    strategy:
      descriptivePlan?.strategy && translatedBucketPlan?.strategy
        ? `${descriptivePlan.strategy}+${translatedBucketPlan?.strategy}`
        : descriptivePlan?.strategy || translatedBucketPlan?.strategy || "router-bucket-plan",
    signals: translatedBucketPlan?.signals || descriptivePlan?.signals,
    hypotheses: translatedBucketPlan?.hypotheses || descriptivePlan?.hypotheses,
    family: resolvedFamily,
    lane: resolvedFamily,
    rungs: translatedBucketPlan?.rungs,
  };
}


function inferRouterFamily(bucketPlan: any): "fantasy" | "horror" | "mystery" | "thriller" | "science_fiction" | "speculative" | "romance" | "historical" | "general" {
  const explicitLane = String(bucketPlan?.lane || "").toLowerCase();

  if (explicitLane === "fantasy") return "fantasy";
  if (explicitLane === "horror") return "horror";
  if (explicitLane === "mystery") return "mystery";
  if (explicitLane === "thriller") return "thriller";
  if (explicitLane === "romance") return "romance";
  if (explicitLane === "historical") return "historical";
  if (explicitLane === "science_fiction" || explicitLane === "science_fiction_family") return "science_fiction";
  if (explicitLane === "speculative" || explicitLane === "speculative_family") return "speculative";
  if (explicitLane === "general" || explicitLane === "general_family") return "general";

  return "general";
}



function quoteIfNeeded(value: string): string {
  const cleaned = String(value || "").trim();
  if (!cleaned) return "";
  return /^".*"$/.test(cleaned) ? cleaned : `"${cleaned}"`;
}

function openLibraryQueryForRung(rung: any, bucketPlan: any): string {
  const family = inferRouterFamily(bucketPlan);
  const base = String(rung?.query || "").trim().toLowerCase();
  const preview = String(bucketPlan?.preview || "").trim().toLowerCase();

  if (family === "mystery") {
    if (base) return quoteIfNeeded(base);
    if (preview.includes("psychological")) return quoteIfNeeded("psychological mystery");
    if (preview.includes("detective")) return quoteIfNeeded("detective mystery");
    if (preview.includes("cold case")) return quoteIfNeeded("cold case mystery");
    return quoteIfNeeded(preview || "psychological mystery novel");
  }

  if (family === "thriller") {
    // Preserve the actual rung phrasing for Open Library so it can compete on the same intent.
    if (base) return quoteIfNeeded(base);

    if (rung?.rung === 90) {
      if (preview.includes("crime")) return quoteIfNeeded("crime thriller");
      if (preview.includes("psychological")) return quoteIfNeeded("psychological thriller");
      return quoteIfNeeded("thriller novel");
    }

    return quoteIfNeeded(preview || "crime thriller novel");
  }

  if (family === "science_fiction") {
    if (base) return quoteIfNeeded(base);
    if (preview) return quoteIfNeeded(preview);
    return quoteIfNeeded("science fiction novel");
  }

  if (family === "fantasy") {
    if (base) return quoteIfNeeded(base);
    if (preview) return quoteIfNeeded(preview);
    return quoteIfNeeded("epic fantasy novel");
  }

  if (family === "horror") {
    if (base) return quoteIfNeeded(base);
    if (preview) return quoteIfNeeded(preview);
    return quoteIfNeeded("psychological horror novel");
  }

  if (family === "speculative") {
    if (base) return quoteIfNeeded(base);
    if (preview) return quoteIfNeeded(preview);
    return quoteIfNeeded("science fiction");
  }

  if (family === "romance") return quoteIfNeeded(base || preview || "romance novel");
  if (family === "historical") return quoteIfNeeded(base || preview || "historical fiction novel");

  return quoteIfNeeded(base || preview || "fiction");
}


function chooseEngine(input: RecommenderInput, override?: EngineOverride): EngineId {
  if (override && override !== "auto") return override;
  if (input.deckKey === "k2") return "openLibrary";
  return "googleBooks";
}

function teenVisualSignalWeight(tagCounts: RecommenderInput["tagCounts"] | undefined): number {
  return Number(tagCounts?.["topic:manga"] || 0) +
    Number(tagCounts?.["media:anime"] || 0) +
    Number(tagCounts?.["format:graphic_novel"] || 0) +
    Number(tagCounts?.["format:graphic novel"] || 0) +
    Number(tagCounts?.["genre:superheroes"] || 0);
}

function shouldUseKitsu(input: RecommenderInput): boolean {
  return input.deckKey === "ms_hs" && teenVisualSignalWeight(input.tagCounts) >= MIN_VISUAL_SIGNAL_FOR_KITSU && hasStrong20QSession(input);
}

function shouldUseGcd(input: RecommenderInput): boolean {
  return input.deckKey === "ms_hs" && teenVisualSignalWeight(input.tagCounts) >= MIN_VISUAL_SIGNAL_FOR_GCD && hasStrong20QSession(input);
}

function extractDocs(
  result: RecommendationResult | null | undefined,
  fallbackSource: CandidateSource
): RecommendationDoc[] {
  if (!result) return [];

  const itemDocs = Array.isArray((result as any).items)
    ? (result as any).items
        .map((item: any) => {
          if (!item?.doc) return null;
          return {
            ...item.doc,
            source: item.doc?.source || fallbackSource,
          };
        })
        .filter(Boolean)
    : [];

  const recommendations = Array.isArray((result as any).recommendations)
    ? (result as any).recommendations
        .map((doc: any) =>
          doc
            ? {
                ...doc,
                source: doc?.source || fallbackSource,
              }
            : null
        )
        .filter(Boolean)
    : [];

  const docs = Array.isArray((result as any).docs)
    ? (result as any).docs
        .map((doc: any) =>
          doc
            ? {
                ...doc,
                source: doc?.source || fallbackSource,
              }
            : null
        )
        .filter(Boolean)
    : [];

  return [...itemDocs, ...recommendations, ...docs].filter(
    (doc: any) => doc && typeof doc === "object" && typeof doc.title === "string" && doc.title.trim()
  );
}

function normalizeText(value: unknown): string {
  if (Array.isArray(value)) return value.map(normalizeText).join(" ").toLowerCase();
  if (value == null) return "";
  return String(value).toLowerCase();
}

function collectCategoryText(doc: any): string {
  return [
    normalizeText(doc?.categories),
    normalizeText(doc?.subjects),
    normalizeText(doc?.subject),
    normalizeText(doc?.genre),
    normalizeText(doc?.genres),
    normalizeText(doc?.volumeInfo?.categories),
    normalizeText(doc?.volumeInfo?.subjects),
  ]
    .filter(Boolean)
    .join(" ");
}

function collectDescriptionText(doc: any): string {
  return [
    normalizeText(doc?.description),
    normalizeText(doc?.subtitle),
    normalizeText(doc?.notes),
    normalizeText(doc?.first_sentence),
    normalizeText(doc?.excerpt),
    normalizeText(doc?.volumeInfo?.description),
    normalizeText(doc?.volumeInfo?.subtitle),
  ]
    .filter(Boolean)
    .join(" ");
}

function looksLikeFictionCandidate(doc: any): boolean {
  const title = normalizeText(doc?.title ?? doc?.volumeInfo?.title);
  const categories = collectCategoryText(doc);
  const description = collectDescriptionText(doc);
  const author = normalizeText(
    doc?.author_name ?? doc?.authors ?? doc?.author ?? doc?.authorName ?? doc?.volumeInfo?.authors
  );
  const combined = [title, categories, description, author].filter(Boolean).join(" ");

  const hardRejectTitlePatterns = [
    /\bguide\b/,
    /\bcompanion\b/,
    /\banalysis\b/,
    /\bcritic(?:ism|al)\b/,
    /\bintroduction to\b/,
    /\bsource\s*book\b/,
    /\bhandbook\b/,
    /\bmanual\b/,
    /\breference\b/,
    /\bcatalog(?:ue)?\b/,
    /\bencyclopedia\b/,
    /\banthology\b/,
    /\bcollection\b/,
    /\bessays?\b/,
    /\babout the author\b/,
    /\bpublishers?\s+weekly\b/,
    /\bjournal\b/,
    /\bmagazine\b/,
    /\bnewsweek\b/,
    /\bvoice of youth advocates\b/,
    /\btalking books?\b/,
    /\bbook dealers?\b/,
    /\bcontemporary authors\b/,
    /\bright book,\s*right time\b/,
    /\bvideo source book\b/,
    /\btopics\b/,
    /\byoung adult fiction index\b/,
    /\bbooks for tired eyes\b/,
    /\bkindle cash machine\b/,
    /\bcareers? for\b/,
    /\bpresenting young adult\b/,
    /\bsourcebook\b/,
    /\bbibliograph(?:y|ies)\b/,
    /\brevision series\b/,
    /\bthe .*novels of\b/,
    /\bdevelopment of the .*novel\b/,
    /\bhistory of\b/,
    /\bstudy of\b/,
    /\bguide to writing\b/,
    /\bhow to write\b/,
    /\bwriting .*novels\b/,
    /\babout\b.*\bnovels\b/,
    /\bnovels?\b.*\bof\b/,
    /\bcollected\b/,
    /\bselected\b/,
    /\bcomplete works\b/,
    /\bthree .*novels\b/,
    /\bfour .*novels\b/,
    /\bbest .*novels\b/,
    /\bgreat .*novels\b/,
    /\btrue crime\b/,
    /\bcrime fiction\b/,
    /\bdetective fiction\b/,
    /\bmystery fiction\b/,
  ];

  const hardRejectSpecificTitlePatterns = [
    /\buncle silas\b/,
    /\bgreatest .*detectives\b/,
    /\bultimate collection\b/,
    /\bboxed set\b/,
    /\bbest american mystery\b/,
    /\byear'?s best\b/,
    /\bstudy guide\b/,
    /\bcrime fiction in\b/,
    /\bwriters since\b/,
    /\bguide to genre fiction\b/,
  ];

  const hardRejectCategoryPatterns = [
    /\bliterary criticism\b/,
    /\bstudy aids?\b/,
    /\breference\b/,
    /\blanguage arts\b/,
    /\bbibliograph(?:y|ies)\b/,
    /\beducation\b/,
    /\bbooks and reading\b/,
    /\bauthors?\b/,
    /\bpublishing\b/,
    /\blibraries\b/,
    /\bbooksellers?\b/,
    /\bperiodicals?\b/,
    /\bessays?\b/,
    /\bcriticism\b/,
    /\bnonfiction\b/,
    /\bbiography\b/,
    /\bmemoir\b/,
    /\bcrime fiction\b/,
    /\bliterature\b/,
    /\bstudies\b/,
    /\btheory\b/,
    /\b20th century\b/,
    /\b21st century\b/,
    /\btrue crime\b/,
    /\bcrime fiction\b/,
    /\bdetective fiction\b/,
    /\bmystery fiction\b/,
    /\bfilm\b/,
    /\bfilms\b/,
    /\bmovie\b/,
    /\bmovies\b/,
    /\btelevision\b/,
    /\btv series\b/,
  ];

  const hardRejectDescriptionPatterns = [
    /\bexplores?\b/,
    /\bexamines?\b/,
    /\banalyzes?\b/,
    /\bguide to\b/,
    /\bintroduction to\b/,
    /\breference for\b/,
    /\bresource for\b/,
    /\bhow to\b/,
    /\blearn how to\b/,
    /\bwritten for students\b/,
    /\btextbook\b/,
    /\bworkbook\b/,
    /\bstudy guide\b/,
    /\bcritical\b/,
    /\bessays?\b/,
    /\bresearch\b/,
  ];

  const additionalRejectPatterns = [
    /\bwriting and selling\b/,
    /\bhow to write\b/,
    /\bwriting (a|your)\b/,
    /\bpublishing\b/,
    /\bpublishers?\b/,
    /\bbook marketing\b/,
    /\bliterary market\b/,
    /\bfilm (study|studies)\b/,
    /\bcinema studies\b/,
    /\bmedia studies\b/,
    /\bcultural studies\b/,
    /\bmilitary history\b/,
    /\bworld war\b/,
    /\bhistory of (the )?(world|war|military)\b/,
    /\bbattle of\b/,
    /\bmilitary\b/,
    /\bstrategy\b/,
    /\bwarfare\b/,
    /\bregiment\b/,
    /\barmy\b/,
    /\bnavy\b/,
    /\b186\d\b/,
    /\b18\d{2}\b/,
    /\btrue crime\b/,
    /\bcrime fiction\b/,
    /\bdetective fiction\b/,
    /\bmystery fiction\b/,
    /\breader'?s advisory\b/,
    /\bfilm\b/,
    /\bfilms\b/,
    /\bmovie\b/,
    /\bmovies\b/,
    /\btelevision\b/,
    /\btv series\b/,
  ];

  const fictionPositivePatterns = [
    /\bfiction\b/,
    /\bnovel\b/,
    /\bthriller\b/,
    /\bmystery\b/,
    /\bcrime\b/,
    /\bdetective\b/,
    /\bsuspense\b/,
    /\bpsychological\b/,
    /\bmurder\b/,
    /\bserial killer\b/,
    /\binvestigation\b/,
    /\bpolice\b/,
    /\binspector\b/,
    /\bprivate investigator\b/,
    /\bfollows\b/,
    /\btells the story\b/,
    /\bstory of\b/,
    /\bwhen\b.*\bdiscovers?\b/,
    /\bmanga\b/,
    /\bgraphic novel\b/,
    /\bcomic\b/,
  ];

  const obviousReferenceSeriesPatterns = [
    /\bpublishers?\s+weekly\b/,
    /\bnewsweek\b/,
    /\bcontemporary authors\b/,
    /\babout the author\b/,
    /\bsource book\b/,
    /\btalking book\b/,
    /\btopics\b/,
    /\bguide\b/,
    /\bhandbook\b/,
    /\bcatalog(?:ue)?\b/,
    /\bmagazine\b/,
    /\bjournal\b/,
    /\breview\b/,
    /\bweekly\b/,
  ];

  if (!title) return false;

// HARD KILL: meta-literary / genre-study titles that masquerade as fiction
const metaLiteraryTitlePatterns = [
  /^\s*the\s+(crime|gothic|american|english|modern|historical|victorian|detective|mystery|thriller|horror)\s+novel\b/,
  /\bnovel\b.*\b(criticism|history|study|studies|tradition|form|genre)\b/,
  /\b(the|a)\s+.*\s+novel\s+(in|of)\b/,
];

if (metaLiteraryTitlePatterns.some((rx) => rx.test(title))) return false;

  if (hardRejectTitlePatterns.some((rx) => rx.test(title))) return false;
  if (hardRejectSpecificTitlePatterns.some((rx) => rx.test(title))) return false;
  if (hardRejectCategoryPatterns.some((rx) => rx.test(categories))) return false;
  if (hardRejectDescriptionPatterns.some((rx) => rx.test(description))) return false;
  if (additionalRejectPatterns.some((rx) => rx.test(combined))) return false;
  if (obviousReferenceSeriesPatterns.some((rx) => rx.test(combined))) return false;

  const hasPositiveFictionSignal = fictionPositivePatterns.some(
    (rx) => rx.test(title) || rx.test(categories) || rx.test(description)
  );

const hasStrongNarrativeSignal =
  /\b(thriller|mystery|crime|detective|suspense)\b/.test(title) ||
  /\b(follows|story of|when .* discovers|investigates|haunted|killer|disappearance|obsession)\b/.test(description);

  return hasPositiveFictionSignal && hasStrongNarrativeSignal;
}



function hasLegitCommercialAuthority(doc: any): boolean {
  const ratingsCount = Number(doc?.ratingsCount || doc?.volumeInfo?.ratingsCount || 0);
  const avgRating = Number(doc?.averageRating || doc?.volumeInfo?.averageRating || 0);
  const commercialSignals = (doc as any)?.commercialSignals;
  const publisher = normalizeText(doc?.publisher ?? doc?.volumeInfo?.publisher);

  return (
    ratingsCount >= 250 ||
    avgRating >= 4.2 ||
    Boolean(commercialSignals?.bestseller) ||
    Number(commercialSignals?.awards || 0) > 0 ||
    Number(commercialSignals?.popularityTier || 0) >= 2 ||
    /\b(penguin|random house|knopf|doubleday|viking|harper|macmillan|tor|simon\s*&?\s*schuster|hachette|st\.? martin|ballantine)\b/.test(publisher)
  );
}

function looksLikeLowValueGoogleBooksThriller(doc: any): boolean {
  const title = normalizeText(doc?.title ?? doc?.volumeInfo?.title);
  const description = collectDescriptionText(doc);
  const categories = collectCategoryText(doc);
  const publisher = normalizeText(doc?.publisher ?? doc?.volumeInfo?.publisher);
  const combined = [title, categories, description, publisher].filter(Boolean).join(" ");

  const shortOrTieInSignals =
    /\b(prequel|short prequel|short novel|novella|short story|tie[-\s]?in|book\s*0\b|episode)\b/.test(combined);

  const genericPackagingSignals =
    /\b(gripping|unputdownable|jaw[-\s]?dropping|twisty|pulse[-\s]?pounding|page[-\s]?turner|book\s*1\b|series starter|a .* thriller)\b/.test(combined);

  const genericTitleSignals =
    /\b(ashes of alibi|wish me dead|murder in [a-z]+|crime scene|high crimes)\b/.test(title);

  const weakAuthority = !hasLegitCommercialAuthority(doc);

  return shortOrTieInSignals || genericTitleSignals || (genericPackagingSignals && weakAuthority);
}

function looksLikeGoogleBooksFamilyCandidate(doc: any, bucketPlan: any): boolean {
  if (!looksLikeFictionCandidate(doc)) return false;
  if (/\bthe .* novel\b/.test(normalizeText(doc?.title))) return false;

  const categories = collectCategoryText(doc);
  const description = collectDescriptionText(doc);
  const combined = [categories, description].filter(Boolean).join(" ");
  const family = inferRouterFamily(bucketPlan);

  if (family === "mystery") {
    const cozyOrHumorousSignals =
      /\b(cozy|cosy|humorous|funny|comic|comedic|gentle mystery|culinary mystery)\b/.test(combined);

    const trueCrimeSignals = /\b(true crime|memoir|nonfiction)\b/.test(combined);

    const strongMysterySignals =
      /\b(mystery|detective|investigation|murder|private investigator|pi\b|inspector|whodunit|case|cold case|police procedural|psychological mystery|crime detective)\b/.test(combined);

    const weakNarrativeShape =
      !/\b(case|investigation|detective|murder|missing|clue|suspect|victim|private investigator|inspector|whodunit|cold case)\b/.test(combined);

    if (cozyOrHumorousSignals) return false;
    if (trueCrimeSignals) return false;
    if (!strongMysterySignals) return false;
    if (weakNarrativeShape && !hasLegitCommercialAuthority(doc)) return false;

    return true;
  }

  if (family === "thriller") {
    const cozyOrHumorousSignals =
      /\b(cozy|cosy|humorous|funny|comic|comedic|gentle mystery|malice domestic|small town|comfort read|culinary mystery)\b/.test(combined);

    const faithBasedSignals =
      /\b(faith-based|christian fiction|inspirational fiction|amish fiction|forbidden love)\b/.test(combined);

    const strongSuspenseSignals =
      /\b(psychological|psychological suspense|domestic suspense|thriller|crime thriller|serial killer|missing|disappearance|investigation|detective|police procedural|legal thriller|gripping|twist|obsession|secret|noir|procedural)\b/.test(combined);

    const weakNarrativeShape =
      !/\b(missing|disappearance|investigation|detective|case|killer|murder|obsession|secret|procedural|noir|psychological)\b/.test(combined);

    if (cozyOrHumorousSignals) return false;
    if (faithBasedSignals && !strongSuspenseSignals) return false;
    if (looksLikeLowValueGoogleBooksThriller(doc)) return false;
    if (!strongSuspenseSignals) return false;
    if (weakNarrativeShape && !hasLegitCommercialAuthority(doc)) return false;

    return true;
  }

  return true;
}


function looksLikeOpenLibraryPrecisionCandidate(doc: any, bucketPlan: any): boolean {
  if (!looksLikeFictionCandidate(doc)) return false;

  const title = normalizeText(doc?.title ?? doc?.volumeInfo?.title);
  const categories = collectCategoryText(doc);
  const description = collectDescriptionText(doc);
  const combined = [title, categories, description].filter(Boolean).join(" ");
  const family = inferRouterFamily(bucketPlan);

  if (/\b(shakespeare|romeo and juliet|complete works|plays\b|poems?\b|sonnets?\b)\b/.test(combined)) return false;

  if (family === "mystery") {
    const strongSignal =
      /\b(mystery|detective|investigation|murder|private investigator|inspector|whodunit|case|cold case|police procedural|psychological mystery|crime detective|missing person)\b/.test(combined);

    const groundedBacklistSignal =
      /\b(detective|investigator|case|mystery|procedural|inspector|missing|noir|private investigator)\b/.test(combined);

    const weakOrOffGenre =
      /\b(romance|poetry|true crime)\b/.test(combined);

    return (strongSignal || groundedBacklistSignal) && !weakOrOffGenre;
  }

  if (family === "thriller") {
    const strongSignal =
      /\b(thriller|crime|mystery|detective|suspense|psychological|murder|investigation|serial killer|domestic suspense|legal thriller|police procedural|noir|missing person|procedural)\b/.test(combined);

    const groundedBacklistSignal =
      /\b(realistic|grounded|procedural|investigator|case|disappearance|missing|noir)\b/.test(combined);

    const weakOrOffGenre =
      /\b(romance|poetry)\b/.test(combined);

    return (strongSignal || groundedBacklistSignal) && !weakOrOffGenre;
  }

  return true;
}

function sourceForDoc(doc: any, fallbackSource: CandidateSource): CandidateSource {
  return doc?.source === "googleBooks" ||
    doc?.source === "openLibrary" ||
    doc?.source === "kitsu" ||
    doc?.source === "gcd"
    ? doc.source
    : fallbackSource;
}

function dedupeDocs(docs: RecommendationDoc[]): RecommendationDoc[] {
  const seen = new Set<string>();
  const out: RecommendationDoc[] = [];

  for (const doc of docs) {
    const title = String((doc as any)?.title || "").trim().toLowerCase();
    const author =
      Array.isArray((doc as any)?.author_name) && (doc as any).author_name.length > 0
        ? String((doc as any).author_name[0] || "").trim().toLowerCase()
        : String((doc as any)?.author || "").trim().toLowerCase();

    const key =
      String((doc as any)?.key || (doc as any)?.id || "").trim().toLowerCase() ||
      `${title}|${author}`;

    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(doc);
  }

  return out;
}

type RouterQueryLane = {
  query: string;
  laneKind: string;
  source: CandidateSource | "all";
  queryFamily?: RouterFamilyKey;
  filterFamily?: RouterFamilyKey;
  queryRung?: number;
};


type RouterFamilyKey = ReturnType<typeof inferRouterFamily>;

const ROUTER_FAMILIES: RouterFamilyKey[] = [
  "fantasy",
  "horror",
  "mystery",
  "thriller",
  "science_fiction",
  "romance",
  "historical",
];

function normalizeRouterFamilyValue(value: unknown): RouterFamilyKey | null {
  const cleaned = String(value || "").toLowerCase().trim();
  if (cleaned === "science_fiction_family") return "science_fiction";
  if (cleaned === "speculative_family") return "speculative";
  const withoutFamily = cleaned.replace(/_family$/, "");
  if ([...ROUTER_FAMILIES, "speculative", "general"].includes(withoutFamily as RouterFamilyKey)) {
    return withoutFamily as RouterFamilyKey;
  }
  return null;
}

function collectHybridSignalText(input: RecommenderInput, bucketPlan: any): string {
  const safeJson = (value: unknown) => {
    try { return JSON.stringify(value || {}); } catch { return ""; }
  };

  return [
    safeJson((input as any)?.tagCounts),
    safeJson((input as any)?.tasteProfile),
    safeJson((input as any)?.profileOverride),
    safeJson(bucketPlan?.signals),
    safeJson(bucketPlan?.hypotheses),
    String(bucketPlan?.preview || ""),
    ...(Array.isArray(bucketPlan?.queries) ? bucketPlan.queries : []),
  ].join(" ").toLowerCase();
}


function buildDirectEvidenceLaneWeights(input: RecommenderInput): Record<string, number> {
  const scores: Record<string, number> = {
    fantasy: 0,
    horror: 0,
    mystery: 0,
    thriller: 0,
    science_fiction: 0,
    romance: 0,
    historical: 0,
  };

  const sources = [
    (input as any)?.tagCounts,
    (input as any)?.tasteProfile?.runningTagCounts,
    (input as any)?.tasteProfile?.tagCounts,
  ].filter((value) => value && typeof value === "object" && !Array.isArray(value));

  for (const source of sources) {
    for (const [rawKey, rawValue] of Object.entries(source)) {
      const numeric = Number(rawValue);
      if (!Number.isFinite(numeric) || numeric === 0) continue;

      const rawKeyText = String(rawKey || "").toLowerCase().trim();
      const key = rawKeyText.replace(/^genre:/, "").trim();

      // Direct swipe evidence only. Do not let generated query text, fallback rungs,
      // or broad literary/drama wording manufacture the primary lane.
      if (/science fiction|sci-fi|sci fi|dystopian|space opera|ai|artificial intelligence|robot|android|alien|time travel|interstellar/.test(key)) {
        scores.science_fiction += numeric * 1.35;
      }
      if (/mystery|detective|investigation|crime|case|murder|whodunit|private investigator|cold case/.test(key)) {
        scores.mystery += numeric * 1.3;
      }
      if (/thriller|suspense|serial killer|psychological|missing person|abduction|manhunt|fugitive/.test(key)) {
        scores.thriller += numeric * 1.25;
      }
      if (/horror|spooky|haunted|ghost|supernatural|gothic|occult|possession|monster|terror|dread/.test(key)) {
        scores.horror += numeric * 1.2;
      }
      if (/fantasy|magic|wizard|witch|dragon|fae|mythic|quest|kingdom|sorcery/.test(key)) {
        scores.fantasy += numeric * 1.2;
      }

      // Romance should only become a book lane from explicit book/genre-romance evidence,
      // not from cross-media relationship tags.
      if (/^genre:romance$/.test(rawKeyText) || /romance novel|romantic fiction|regency romance/.test(key)) {
        scores.romance += numeric;
      }

      // Historical must be explicit positive evidence. Grounded, realistic, family,
      // drama, literary, or social/political tags are not enough.
      if (/^genre:historical$/.test(rawKeyText) || /\bhistorical fiction\b|\bhistorical novel\b|\bperiod fiction\b|\bgilded age\b|\bcivil war historical\b|\b19th century\b/.test(key)) {
        scores.historical += numeric * 1.15;
      }
    }
  }

  const positive = Object.entries(scores)
    .filter(([, score]) => score > 0)
    .sort((a, b) => b[1] - a[1]);

  if (!positive.length) return {};

  const selected = positive.slice(0, 3).filter(([, score], index) => {
    if (index === 0) return score >= 0.75;
    return score >= 0.75 && score >= positive[0][1] * 0.38;
  });

  const total = selected.reduce((sum, [, score]) => sum + score, 0) || 1;
  const out: Record<string, number> = {};
  for (const [family, score] of selected) {
    out[family] = Number((score / total).toFixed(3));
  }

  return out;
}

function familyForTagText(text: string): RouterFamilyKey | null {
  const key = String(text || "").toLowerCase();
  if (!key) return null;
  if (/science fiction|sci-fi|sci fi|dystopian|space opera|alien|robot|ai/.test(key)) return "science_fiction";
  if (/fantasy|magic|dragon|fae|wizard|witch|epic/.test(key)) return "fantasy";
  if (/horror|haunted|ghost|occult|supernatural|terror|dread/.test(key)) return "horror";
  if (/thriller|suspense|psychological thriller|serial killer|manhunt|abduction/.test(key)) return "thriller";
  if (/mystery|detective|investigation|crime|whodunit|procedural/.test(key)) return "mystery";
  if (/historical|period fiction|victorian|civil war|world war/.test(key)) return "historical";
  if (/romance|love story|relationship|courtship/.test(key)) return "romance";
  return null;
}

function buildUserAffinityLaneMultipliers(input: RecommenderInput): Record<string, number> {
  const swipeArrays = findSwipeArraysForRouting(input as any);
  const primarySwipes = swipeArrays.reduce((best, current) => current.length > best.length ? current : best, [] as any[]);
  if (!primarySwipes.length) return {};

  const scores: Record<string, number> = {};
  for (const swipe of primarySwipes) {
    const action = getSwipeActionForRouting(swipe);
    const tags = collectSwipeTagsForRouting(swipe);
    const text = [action, ...tags].join(" ");
    const family = familyForTagText(text);
    if (!family) continue;
    const delta =
      isPositiveSwipeForRouting(swipe) ? 1.35 :
      isNegativeSwipeForRouting(swipe) ? -1.15 :
      isSkippedSwipeForRouting(swipe) ? -0.75 :
      0;
    if (!delta) continue;
    scores[family] = (scores[family] || 0) + delta;
  }

  const multipliers: Record<string, number> = {};
  for (const [family, score] of Object.entries(scores)) {
    if (score <= -2) multipliers[family] = 0.45;
    else if (score < 0) multipliers[family] = 0.72;
    else if (score >= 2) multipliers[family] = 1.3;
    else multipliers[family] = 1.08;
  }

  // Adjacent grounded/psychological boost when fantasy/horror are repeatedly skipped.
  if ((scores.fantasy || 0) <= -2 || (scores.horror || 0) <= -2) {
    multipliers.thriller = Math.max(multipliers.thriller || 1, 1.2);
    multipliers.mystery = Math.max(multipliers.mystery || 1, 1.15);
    multipliers.historical = Math.max(multipliers.historical || 1, 1.1);
  }

  return multipliers;
}

function applyLaneAffinityMultipliers(
  laneWeights: Record<string, number>,
  affinityMultipliers: Record<string, number>
): Record<string, number> {
  if (!Object.keys(laneWeights || {}).length) return laneWeights;
  const adjusted: Record<string, number> = {};
  for (const [family, weight] of Object.entries(laneWeights || {})) {
    const multiplier = Number(affinityMultipliers?.[family] || 1);
    adjusted[family] = Math.max(0, Number(weight) * multiplier);
  }
  const ranked = Object.entries(adjusted).filter(([, w]) => w > 0).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const total = ranked.reduce((sum, [, w]) => sum + w, 0) || 1;
  const out: Record<string, number> = {};
  for (const [family, w] of ranked) out[family] = Number((w / total).toFixed(3));
  return out;
}

function choosePrimaryRouterFamilyFromWeights(
  fallbackFamily: RouterFamilyKey,
  laneWeights: Record<string, number>,
  input: RecommenderInput
): RouterFamilyKey {
  const ranked = Object.entries(laneWeights || {})
    .map(([family, weight]) => [normalizeRouterFamilyValue(family), Number(weight)] as [RouterFamilyKey | null, number])
    .filter(([family, weight]) => Boolean(family) && Number.isFinite(weight) && weight > 0) as [RouterFamilyKey, number][];

  if (!ranked.length) return fallbackFamily;

  ranked.sort((a, b) => b[1] - a[1]);

  const directHistorical = buildDirectEvidenceLaneWeights(input).historical || 0;
  const topNonHistorical = ranked.find(([family]) => family !== "historical");

  // Historical is a valid lane, but it should not be the default landing zone
  // for mixed grounded/literary/drama sessions. It must have direct positive
  // evidence to become primary.
  if (ranked[0][0] === "historical" && directHistorical <= 0 && topNonHistorical) {
    return topNonHistorical[0];
  }

  return ranked[0][0];
}

function mergeEvidenceLaneWeights(
  generatedWeights: Record<string, number>,
  evidenceWeights: Record<string, number>
): Record<string, number> {
  if (!Object.keys(evidenceWeights || {}).length) return generatedWeights;

  const merged: Record<string, number> = {};

  for (const [family, weight] of Object.entries(evidenceWeights)) {
    const numeric = Number(weight);
    if (Number.isFinite(numeric) && numeric > 0) merged[family] = numeric * 1.35;
  }

  for (const [family, weight] of Object.entries(generatedWeights || {})) {
    const normalized = normalizeRouterFamilyValue(family);
    const numeric = Number(weight);
    if (!normalized || !Number.isFinite(numeric) || numeric <= 0) continue;

    // Generated historical text is often a fallback artifact. Only keep it when
    // direct swipe evidence also supports historical.
    if (normalized === "historical" && !evidenceWeights.historical) continue;

    merged[normalized] = (merged[normalized] || 0) + numeric * 0.35;
  }

  const ranked = Object.entries(merged)
    .filter(([, weight]) => weight > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  const total = ranked.reduce((sum, [, weight]) => sum + weight, 0) || 1;
  const out: Record<string, number> = {};
  for (const [family, weight] of ranked) out[family] = Number((weight / total).toFixed(3));
  return out;
}

function buildHybridLaneWeights(input: RecommenderInput, bucketPlan: any): Record<string, number> {
  const text = collectHybridSignalText(input, bucketPlan);
  const scores: Record<string, number> = {
    fantasy: 0,
    horror: 0,
    mystery: 0,
    thriller: 0,
    science_fiction: 0,
    romance: 0,
    historical: 0,
  };

  const patterns: Array<[keyof typeof scores, RegExp, number]> = [
    ["thriller", /\b(thriller|suspense|psychological thriller|serial killer|missing person|manhunt|fugitive|crime conspiracy|legal thriller|spy thriller|abduction)\b/g, 1.5],
    ["mystery", /\b(mystery|detective|whodunit|private investigator|cold case|murder investigation|crime detective|case|investigation)\b/g, 1.35],
    ["horror", /\b(horror|haunted|ghost|supernatural|occult|possession|monster|terror|dread|gothic|vampire|zombie)\b/g, 1.45],
    ["fantasy", /\b(fantasy|magic|magical|wizard|witch|dragon|fae|mythic|quest|kingdom|sword|sorcery)\b/g, 1.4],
    ["science_fiction", /\b(science fiction|sci-fi|sci fi|dystopian|space opera|ai|artificial intelligence|robot|android|alien|future|time travel|interstellar)\b/g, 1.45],
    ["romance", /\b(genre:romance|romance novel|romantic fiction|regency romance|duke|earl|wallflower|rake|second chance romance|forbidden love romance)\b/g, 1.0],
    ["historical", /\b(historical|historical fiction|period fiction|victorian|edwardian|gilded age|civil war|world war|19th century|family saga|frontier|revolution)\b/g, 1.25],
  ];

  for (const [family, rx, weight] of patterns) {
    const matches = text.match(rx);
    if (matches?.length) scores[family] += matches.length * weight;
  }

  const applyNumericLaneSignals = (value: any, multiplier = 2) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return;
    for (const [rawKey, rawValue] of Object.entries(value)) {
      const numeric = Number(rawValue);
      if (!Number.isFinite(numeric) || numeric === 0) continue;
      const rawKeyText = String(rawKey || "").toLowerCase().trim();
      const key = rawKeyText.replace(/^genre:/, "").trim();
      const lane =
        /science fiction|sci-fi|sci fi|dystopian|space opera/.test(key) ? "science_fiction" :
        /horror|haunted|ghost|supernatural|gothic/.test(key) ? "horror" :
        /thriller|suspense|serial killer|psychological/.test(key) ? "thriller" :
        /mystery|detective|investigation|crime/.test(key) ? "mystery" :
        /fantasy|magic|dragon/.test(key) ? "fantasy" :
        (/^genre:romance$/.test(rawKeyText) || /romance novel|romantic fiction|regency romance/.test(key)) ? "romance" :
        /historical|period|civil war|world war/.test(key) ? "historical" :
        null;
      if (lane && scores[lane] !== undefined) scores[lane] += numeric * multiplier;
    }
  };

  applyNumericLaneSignals((input as any)?.tagCounts, 2.4);
  applyNumericLaneSignals((input as any)?.tasteProfile?.runningTagCounts, 2.4);
  applyNumericLaneSignals((input as any)?.tasteProfile?.tagCounts, 1.8);

  const explicit = normalizeRouterFamilyValue(bucketPlan?.lane || bucketPlan?.family);
  if (explicit && scores[explicit] !== undefined) scores[explicit] += 2.5;

  const ranked = Object.entries(scores)
    .filter(([, score]) => score > 0)
    .sort((a, b) => b[1] - a[1]);

  if (!ranked.length) return { [inferRouterFamily(bucketPlan)]: 1 };

  const total = ranked.reduce((sum, [, score]) => sum + score, 0) || 1;
  const normalized = ranked.map(([family, score]) => [family, score / total] as [string, number]);
  const [topFamily, topWeight] = normalized[0];
  const secondWeight = normalized[1]?.[1] || 0;

  const isHybrid = topWeight < 0.62 && secondWeight >= 0.16;
  if (!isHybrid) return { [topFamily]: 1 };

  const out: Record<string, number> = {};
  let selectedTotal = 0;
  for (const [family, weight] of normalized.slice(0, 3)) {
    if (weight < 0.12) continue;
    out[family] = weight;
    selectedTotal += weight;
  }

  for (const family of Object.keys(out)) out[family] = Number((out[family] / selectedTotal).toFixed(3));
  return Object.keys(out).length > 1 ? out : { [topFamily]: 1 };
}

function fallbackRungsForRouterFamily(family: RouterFamilyKey): any[] {
  if (family === "thriller") return [
    { rung: 40, query: "psychological thriller novel" },
    { rung: 41, query: "crime thriller novel" },
    { rung: 42, query: "serial killer investigation thriller novel" },
  ];
  if (family === "mystery") return [
    { rung: 50, query: "psychological suspense novel" },
    { rung: 51, query: "detective mystery novel" },
    { rung: 52, query: "police procedural mystery novel" },
    { rung: 53, query: "psychological mystery novel" },
  ];
  if (family === "horror") return [
    { rung: 60, query: "psychological horror novel" },
    { rung: 61, query: "haunted house horror novel" },
    { rung: 62, query: "survival horror novel" },
  ];
  if (family === "fantasy") return [
    { rung: 70, query: "epic fantasy novel" },
    { rung: 71, query: "dark fantasy novel" },
    { rung: 72, query: "magic fantasy novel" },
  ];
  if (family === "science_fiction") return [
    { rung: 80, query: "science fiction novel" },
    { rung: 81, query: "dystopian science fiction novel" },
    { rung: 82, query: "space opera science fiction novel" },
    { rung: 83, query: "survival science fiction novel" },
  ];
  if (family === "romance") return [
    { rung: 90, query: "romance novel" },
    { rung: 91, query: "emotional romance novel" },
    { rung: 92, query: "historical romance novel" },
    { rung: 93, query: "second chance romance novel" },
  ];
  if (family === "historical") return [
    { rung: 100, query: "historical fiction novel" },
    { rung: 101, query: "19th century historical fiction novel" },
    { rung: 102, query: "war historical fiction novel" },
    { rung: 103, query: "society historical fiction novel" },
  ];
  return [{ rung: 999, query: "fiction novel" }];
}

function rungNegativeTerms(family: ReturnType<typeof inferRouterFamily>): string {
  const base = [
    "-writers", "-writer", "-writing", "-guide", "-reference", "-bibliography", "-analysis",
    "-criticism", "-review", "-summary", "-workbook", "-anthology", "-anthologies", "-collection",
    "-collections", "-philosophy", "-study", "-studies", "-literature", "-encyclopedia", "-handbook",
    "-catalog", "-magazine", "-journal", "-readers", "-reader",
  ];

  if (family === "mystery") base.unshift("-true-crime", "-cozy", "-humorous", "-spy", "-conspiracy");
  if (family === "thriller") base.unshift("-true-crime", "-cozy", "-humorous");

  return base.join(" ");
}


function capRouterQueryLanes(lanes: RouterQueryLane[]): RouterQueryLane[] {
  const googleLanes = lanes.filter((lane) => lane.source === "googleBooks");
  const openLibraryLanes = lanes.filter((lane) => lane.source === "openLibrary");
  const otherLanes = lanes.filter((lane) => lane.source !== "googleBooks" && lane.source !== "openLibrary");

  // Keep the latency guardrail, but never let Google Books consume the entire
  // lane budget. Open Library is the main diversity/sanity-check source for
  // adult prose recommendations, and slicing after appending OL lanes caused
  // OL to be cut off before it could run.
  if (openLibraryLanes.length > 0) {
    return [
      ...googleLanes.slice(0, 3),
      ...openLibraryLanes.slice(0, 1),
      ...otherLanes.slice(0, 1),
    ].slice(0, 4);
  }

  return [
    ...googleLanes.slice(0, 4),
    ...otherLanes.slice(0, 1),
  ].slice(0, 4);
}

function buildHighDiversityQueryLanes(rung: any, bucketPlan: any): RouterQueryLane[] {
  const family = inferRouterFamily(bucketPlan);
  let base = String(rung?.query || "").trim();
  base = base
    .replace(/\b(fantasy|horror|thriller|mystery|science fiction)\s+\1\b/gi, "$1")
    .replace(/\s+/g, " ")
    .trim();
  const lowered = base.toLowerCase();
  const negativeTerms = rungNegativeTerms(family);

  function isHorrorQuery(q: string): boolean {
    return /(horror|haunted|ghost|supernatural|occult|possession|creepy|terror)/i.test(q);
  }

  if (family === "historical") {
    const historicalBase = base || String(bucketPlan?.preview || "historical fiction novel").trim();
    const openLibraryQuery = openLibraryQueryForRung({ ...rung, query: historicalBase }, bucketPlan);
    const lanes = dedupeNonEmptyQueries([
      historicalBase,
      /\b(fiction|novel)\b/i.test(historicalBase) ? "" : `${historicalBase} novel`,
      `${historicalBase} ${negativeTerms}`,
    ]);

    const mapped: RouterQueryLane[] = lanes.map((query) => {
      const q = query.toLowerCase();
      return {
        query,
        laneKind: q.includes("-guide") || q.includes("-reference") || q.includes("-criticism") ? "strict-filtered" : "core",
        source: "googleBooks",
        queryFamily: family,
        filterFamily: family,
        queryRung: Number.isFinite(Number(rung?.rung)) ? Number(rung.rung) : undefined,
      } as RouterQueryLane;
    });

    if (openLibraryQuery) {
      const queryRung = Number.isFinite(Number(rung?.rung)) ? Number(rung.rung) : undefined;
      mapped.push({ query: openLibraryQuery, laneKind: "core", source: "openLibrary", queryFamily: family, filterFamily: family, queryRung });
      mapped.push({ query: openLibraryQuery, laneKind: "ol-backfill", source: "openLibrary", queryFamily: family, filterFamily: family, queryRung });
    }

    return capRouterQueryLanes(mapped);
  }

  const thrillerAllowsDomestic =
    family === "thriller" &&
    /domestic|family secret|marriage|betrayal|relationship/.test(
      String(base || "") + " " + String(bucketPlan?.preview || "")
    ) &&
    !/serial killer|procedural|fbi|investigation|detective|crime conspiracy|manhunt|fugitive/.test(
      String(base || "") + " " + String(bucketPlan?.preview || "")
    );

  const baseNeedsFictionVariant = base && !/\b(novel|fiction)\b/i.test(base);
  const lanes = dedupeNonEmptyQueries([
    base,
    baseNeedsFictionVariant ? `${base} fiction` : "",
    `${base} ${negativeTerms}`,
    family === "science_fiction" ? "literary science fiction novel" : "",
    family === "science_fiction" ? "psychological science fiction novel" : "",
    family === "science_fiction" ? "romantic science fiction novel" : "",
    family === "science_fiction" ? "dystopian science fiction novel" : "",
    family === "science_fiction" && /human centered|identity|literary|emotional/.test(lowered) ? "human centered science fiction novel" : "",
    family === "science_fiction" && /identity|literary/.test(lowered) ? "literary science fiction identity novel" : "",
    family === "science_fiction" && /emotional|speculative/.test(lowered) ? "emotional speculative fiction novel" : "",
    family === "fantasy" && /dark/.test(lowered) ? "dark fantasy novel" : "",
    family === "fantasy" && /magic|wizard|witch/.test(lowered) ? "magic fantasy novel" : "",
    family === "horror" && /psychological/.test(lowered) ? "psychological horror novel" : "",
    family === "horror" && /haunted|ghost/.test(lowered) ? "haunted house horror novel" : "",
    family === "speculative" && /psychological/.test(lowered) ? "dark psychological fiction novel" : "",
    family === "speculative" && /horror/.test(lowered) ? "literary horror novel" : "",
    family === "mystery" && /psychological/.test(lowered) ? "psychological mystery novel" : "",
    family === "mystery" && /murder|investigation|detective/.test(lowered) ? "detective mystery novel" : "",
    family === "mystery" && /murder|investigation|police|procedural/.test(lowered) ? "police procedural mystery novel" : "",
    family === "mystery" && !/private investigator/.test(lowered) ? "private investigator mystery novel" : "",
    family === "thriller" && /psychological/.test(lowered) ? "psychological suspense novel" : "",
    thrillerAllowsDomestic ? "domestic suspense novel" : "",
    ...(Array.isArray(bucketPlan?.queries) ? bucketPlan.queries.slice(0, 5) : []),
  ]);

  let filteredLanes = lanes;
  if (family === "horror") {
    filteredLanes = lanes.filter((query) => isHorrorQuery(query));
  }

  if (family === "fantasy") {
    filteredLanes = lanes.filter((query) => /fantasy|magic|wizard|witch|dragon|fae|mythic|quest|kingdom|sword|sorcery/i.test(query));
  }

  const mapped: RouterQueryLane[] = filteredLanes
    .map((query) => {
      const q = query.toLowerCase();
      let laneKind = "core";
      if (q.includes(negativeTerms.split(" ")[0]?.replace(/^-/, "") || "__nope__") || q.includes("-guide") || q.includes("-reference")) {
        laneKind = "strict-filtered";
      } else if (/literary horror/.test(q)) {
        laneKind = "literary-alt";
      } else if (/dark psychological fiction|psychological suspense|domestic suspense/.test(q)) {
        laneKind = "dark-alt";
      } else if (q !== lowered && q.includes("fiction")) {
        laneKind = "fiction-variant";
      } else if (q !== lowered) {
        laneKind = "bucket-alt";
      }

      if (family === "horror" && (laneKind === "strict-filtered" || laneKind === "fiction-variant" || laneKind === "literary-alt" || laneKind === "dark-alt")) {
        return null;
      }

      return {
        query,
        laneKind,
        source: "googleBooks",
        queryFamily: family,
        filterFamily: family,
        queryRung: Number.isFinite(Number(rung?.rung)) ? Number(rung.rung) : undefined,
      } as RouterQueryLane;
    })
    .filter(Boolean) as RouterQueryLane[];

  const openLibraryQuery = openLibraryQueryForRung(rung, bucketPlan);
  if (openLibraryQuery && !(family === "horror" && !isHorrorQuery(openLibraryQuery))) {
    const queryRung = Number.isFinite(Number(rung?.rung)) ? Number(rung.rung) : undefined;
    mapped.push({ query: openLibraryQuery, laneKind: "core", source: "openLibrary", queryFamily: family, filterFamily: family, queryRung });
    mapped.push({ query: openLibraryQuery, laneKind: "ol-backfill", source: "openLibrary", queryFamily: family, filterFamily: family, queryRung });
    if (family === "thriller" || family === "mystery" || family === "horror") {
      const simpleFallbackQuery =
        family === "thriller" ? "psychological thriller novel" :
        family === "mystery" ? "detective mystery novel" :
        "psychological horror novel";
      if (normalizeQueryKey(simpleFallbackQuery) !== normalizeQueryKey(openLibraryQuery)) {
        mapped.push({ query: simpleFallbackQuery, laneKind: "ol-backfill", source: "openLibrary", queryFamily: family, filterFamily: family, queryRung });
      }
    }
  }

  return capRouterQueryLanes(mapped);
}

function candidateKey(candidate: any): string {
  const title = String(candidate?.title || "").trim().toLowerCase();
  const author = Array.isArray(candidate?.author_name) && candidate.author_name.length > 0
    ? String(candidate.author_name[0] || "").trim().toLowerCase()
    : String(candidate?.author || "").trim().toLowerCase();
  return String(candidate?.id || candidate?.key || "").trim().toLowerCase() || `${title}|${author}`;
}

function candidateScoreValue(candidate: any): number {
  const raw = Number(candidate?.score ?? candidate?.diagnostics?.postFilterScore ?? candidate?.diagnostics?.preFilterScore ?? 0);
  return Number.isFinite(raw) ? raw : 0;
}

function normalizeWorkToken(value: unknown): string {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function collapseCrossRungDuplicates<T extends { title?: string; author?: string; author_name?: string[]; rawDoc?: any; queryRung?: number }>(docs: T[]): T[] {
  const bestByWork = new Map<string, T>();
  const rankFor = (doc: any) => Number(doc?.rawDoc?.queryRung ?? doc?.queryRung ?? 999);

  for (const doc of Array.isArray(docs) ? docs : []) {
    const title = normalizeWorkToken(doc?.title ?? doc?.rawDoc?.title);
    const author = normalizeWorkToken(Array.isArray(doc?.author_name) ? doc.author_name[0] : doc?.author ?? doc?.rawDoc?.author);
    if (!title) continue;
    const key = `${title}|${author}`;
    const existing = bestByWork.get(key);
    if (!existing) {
      bestByWork.set(key, doc);
      continue;
    }
    const rungCurrent = rankFor(doc);
    const rungExisting = rankFor(existing);
    if (rungCurrent < rungExisting) {
      bestByWork.set(key, doc);
      continue;
    }
    if (rungCurrent === rungExisting && candidateScoreValue(doc) > candidateScoreValue(existing)) {
      bestByWork.set(key, doc);
    }
  }

  return Array.from(bestByWork.values());
}


function rawAuthorText(doc: any): string {
  const value =
    doc?.author ??
    doc?.rawDoc?.author ??
    (Array.isArray(doc?.author_name) ? doc.author_name[0] : doc?.author_name) ??
    (Array.isArray(doc?.rawDoc?.author_name) ? doc.rawDoc.author_name[0] : doc?.rawDoc?.author_name) ??
    (Array.isArray(doc?.volumeInfo?.authors) ? doc.volumeInfo.authors[0] : doc?.volumeInfo?.authors) ??
    "";
  return normalizeText(value);
}

function hasStrongRomanceOpenLibraryFinalShape(doc: any): boolean {
  const title = normalizeText(doc?.title ?? doc?.rawDoc?.title ?? doc?.volumeInfo?.title);
  const author = rawAuthorText(doc);
  const queryText = normalizeText(doc?.rawDoc?.queryText ?? doc?.queryText);
  const diagnostics = doc?.rawDoc?.diagnostics?.filterDiagnostics ?? doc?.diagnostics?.filterDiagnostics ?? {};
  const passedChecks = doc?.rawDoc?.diagnostics?.filterPassedChecks ?? doc?.diagnostics?.filterPassedChecks ?? [];
  const explicitRomance = /\b(romance|love|bride|wedding|marriage|duke|earl|regency|courtship|kiss|heart|lover|wallflower|rake|mail order)\b/.test(title + " " + queryText);
  const canonical = /\b(pride and prejudice|persuasion|sense and sensibility|emma|northanger abbey|rebecca|outlander|the flame and the flower|secrets of a summer night|devil in winter|love in the afternoon|the viscount who loved me|romancing mister bridgerton|lord of scoundrels)\b/.test(title);
  const authorAffinity = Boolean(diagnostics?.flags?.authorAffinity) || /\b(jane austen|georgette heyer|julia quinn|lisa kleypas|lorretta chase|mary balogh|tessa dare|eloisa james|nora roberts|debbie macomber|johanna lindsey|julie garwood|kathleen e\.? woodiwiss|sherry thomas|virginia henley|rosemary rogers|ava march|heather graham|anne gracie|julia london|beverly jenkins)\b/.test(author);
  const weakPackaging = /\b(complete .* novels? in one|boxed set|collection|unknown author)\b/.test(title + " " + author);
  return !weakPackaging && (canonical || authorAffinity || (explicitRomance && passedChecks.includes("openlibrary_romance_recovery")));
}

function buildLaneQuotaPool(candidates: any[], finalLimit: number): any[] {
  const targetSize = Math.max(finalLimit * 4, 30);
  const lanePriority = ["core", "ol-backfill", "strict-filtered", "dark-alt", "literary-alt", "fiction-variant", "bucket-alt"];
  const grouped = new Map<string, any[]>();

  for (const candidate of candidates) {
    const lane = String(candidate?.rawDoc?.laneKind ?? candidate?.laneKind ?? candidate?.diagnostics?.laneKind ?? "core");
    if (!grouped.has(lane)) grouped.set(lane, []);
    grouped.get(lane)!.push(candidate);
  }

  for (const [lane, items] of grouped.entries()) {
    grouped.set(lane, [...items].sort((a, b) => {
      const rungA = Number(a?.rawDoc?.queryRung ?? a?.queryRung ?? 999);
      const rungB = Number(b?.rawDoc?.queryRung ?? b?.queryRung ?? 999);
      return candidateScoreValue(b) - candidateScoreValue(a) || rungA - rungB;
    }));
  }

  const orderedLanes = [
    ...lanePriority.filter((lane) => grouped.has(lane)),
    ...Array.from(grouped.keys()).filter((lane) => !lanePriority.includes(lane)),
  ];

  const selected: any[] = [];
  const seen = new Set<string>();

  for (const lane of orderedLanes) {
    const pick = grouped.get(lane)?.shift();
    if (!pick) continue;
    const key = candidateKey(pick);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    selected.push(pick);
  }

  while (selected.length < targetSize) {
    let progressed = false;
    for (const lane of orderedLanes) {
      const bucket = grouped.get(lane);
      if (!bucket?.length) continue;
      const pick = bucket.shift();
      if (!pick) continue;
      const key = candidateKey(pick);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      selected.push(pick);
      progressed = true;
      if (selected.length >= targetSize) break;
    }
    if (!progressed) break;
  }

  return selected;
}




function ensureRungCoverage(candidates: any[], finalLimit: number): any[] {
  const byRung = new Map<string, any[]>();

  for (const candidate of candidates) {
    const rung = String(candidate?.rawDoc?.queryRung ?? candidate?.queryRung ?? "unknown");
    if (!byRung.has(rung)) byRung.set(rung, []);
    byRung.get(rung)!.push(candidate);
  }

  const selected: any[] = [];
  const seen = new Set<string>();

  for (const [_, items] of byRung.entries()) {
    const pick = items
      .slice()
      .sort((a, b) => candidateScoreValue(b) - candidateScoreValue(a))[0];
    if (!pick) continue;
    const key = candidateKey(pick);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    selected.push(pick);
    if (selected.length >= finalLimit) break;
  }

  for (const candidate of candidates) {
    const key = candidateKey(candidate);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    selected.push(candidate);
    if (selected.length >= Math.max(finalLimit * 4, finalLimit)) break;
  }

  return selected;
}


function ensureHistoricalRungDiversity(candidates: any[], finalLimit: number): any[] {
  const targetSize = Math.max(finalLimit * 4, finalLimit);
  const byRung = new Map<string, any[]>();

  for (const candidate of candidates) {
    const rung = String(candidate?.rawDoc?.queryRung ?? candidate?.queryRung ?? "unknown");
    if (!byRung.has(rung)) byRung.set(rung, []);
    byRung.get(rung)!.push(candidate);
  }

  for (const [rung, items] of byRung.entries()) {
    byRung.set(rung, [...items].sort((a, b) => candidateScoreValue(b) - candidateScoreValue(a)));
  }

  const orderedRungs = [
    "0",
    "1",
    "2",
    "3",
    ...Array.from(byRung.keys()).filter((rung) => !["0", "1", "2", "3"].includes(rung)),
  ].filter((rung, index, arr) => byRung.has(rung) && arr.indexOf(rung) === index);

  const selected: any[] = [];
  const seen = new Set<string>();

  for (const rung of orderedRungs) {
    const bucket = byRung.get(rung) || [];
    const pick = bucket.find((candidate) => {
      const key = candidateKey(candidate);
      return key && !seen.has(key);
    });

    if (!pick) continue;
    const key = candidateKey(pick);
    seen.add(key);
    selected.push(pick);
    if (selected.length >= Math.min(finalLimit, orderedRungs.length)) break;
  }

  while (selected.length < targetSize) {
    let progressed = false;

    for (const rung of orderedRungs) {
      const bucket = byRung.get(rung) || [];
      const pick = bucket.find((candidate) => {
        const key = candidateKey(candidate);
        return key && !seen.has(key);
      });

      if (!pick) continue;
      const key = candidateKey(pick);
      seen.add(key);
      selected.push(pick);
      progressed = true;

      if (selected.length >= targetSize) break;
    }

    if (!progressed) break;
  }

  return selected.length ? selected : candidates;
}

function enforceAuthorDiversity(candidates: any[], maxPerAuthor = 1): any[] {
  const counts = new Map<string, number>();
  const out: any[] = [];

  for (const c of candidates) {
    const author =
      Array.isArray(c?.author_name) && c.author_name.length > 0
        ? c.author_name[0]
        : c?.author;

    const key = String(author || "").toLowerCase().trim();
    const count = counts.get(key) || 0;

    if (count >= maxPerAuthor) continue;

    counts.set(key, count + 1);
    out.push(c);
  }

  return out;
}

function enforceLaneDiversity(candidates: any[], minLanes = 3): any[] {
  const lanes = new Map<string, any[]>();

  for (const c of candidates) {
    const lane = String(c?.rawDoc?.laneKind ?? c?.laneKind ?? c?.diagnostics?.laneKind ?? "core");
    if (!lanes.has(lane)) lanes.set(lane, []);
    lanes.get(lane)!.push(c);
  }

  if (lanes.size >= minLanes) return candidates;

  return candidates;
}

function countResultItems(result: RecommendationResult | null | undefined): number {
  if (!result) return 0;
  if (Array.isArray((result as any).items)) return (result as any).items.length;
  if (Array.isArray((result as any).recommendations)) return (result as any).recommendations.length;
  if (Array.isArray((result as any).docs)) return (result as any).docs.length;
  return 0;
}

function buildFilterAuditRows(docs: RecommendationDoc[]): any[] {
  return (Array.isArray(docs) ? docs : []).slice(0, 250).map((doc: any) => {
    const filterDiagnostics = doc?.diagnostics?.filterDiagnostics || {};
    return {
      title: doc?.title,
      author: Array.isArray(doc?.author_name) ? doc.author_name[0] : doc?.author,
      source: doc?.source,
      queryText: doc?.queryText ?? doc?.diagnostics?.queryText,
      queryRung: doc?.queryRung ?? doc?.diagnostics?.queryRung,
      laneKind: doc?.laneKind ?? doc?.diagnostics?.laneKind,
      kept: Boolean(doc?.diagnostics?.filterKept),
      rejectReasons: Array.isArray(doc?.diagnostics?.filterRejectReasons) ? doc.diagnostics.filterRejectReasons : [],
      passedChecks: Array.isArray(doc?.diagnostics?.filterPassedChecks) ? doc.diagnostics.filterPassedChecks : [],
      filterFamily: doc?.diagnostics?.filterFamily ?? filterDiagnostics?.family,
      wantsHorrorTone: doc?.diagnostics?.filterWantsHorrorTone ?? filterDiagnostics?.wantsHorrorTone,
      flags: doc?.diagnostics?.filterFlags ?? filterDiagnostics?.flags ?? {},
      pageCount: doc?.diagnostics?.pageCount,
      ratingsCount: doc?.diagnostics?.ratingsCount,
    };
  });
}

function summarizeFilterAudit(rows: any[]) {
  const summary = {
    kept: 0,
    rejected: 0,
    reasons: {} as Record<string, number>,
  };

  for (const row of Array.isArray(rows) ? rows : []) {
    if (row?.kept) summary.kept += 1;
    else summary.rejected += 1;

    for (const reason of Array.isArray(row?.rejectReasons) ? row.rejectReasons : []) {
      summary.reasons[reason] = (summary.reasons[reason] || 0) + 1;
    }
  }

  return summary;
}

function hasHardcoverFailureShape(value: unknown): boolean {
  try {
    const text = typeof value === "string" ? value : JSON.stringify(value || {});
    const lower = text.toLowerCase();
    return lower.includes("hardcover api request failed") || lower.includes('"status":429') || lower.includes("status:429");
  } catch {
    return false;
  }
}


function hardcoverLookupPriority(doc: RecommendationDoc): number {
  const title = normalizeText(doc?.title ?? doc?.volumeInfo?.title);
  const categories = collectCategoryText(doc);
  const description = collectDescriptionText(doc);
  const combined = [title, categories, description].filter(Boolean).join(" ");

  let score = 0;
  if (/\bnovel\b|\bfiction\b|\bthriller\b|\bmystery\b|\bcrime\b|\bdetective\b|\bsuspense\b/.test(combined)) score += 4;
  if (/\bguide\b|\bindex\b|\breference\b|\bcriticism\b|\bencyclopedia\b|\bmagazine\b|\bjournal\b|\bbooklist\b/.test(combined)) score -= 6;
  if (doc?.hardcover && !hasHardcoverFailureShape(doc?.hardcover)) score += 2;
  if (Array.isArray((doc as any)?.author_name) && (doc as any).author_name.length > 0) score += 1;
  if (typeof (doc as any)?.author === "string" && (doc as any)?.author.trim()) score += 1;
  if ((doc as any)?.queryRung === 0) score += 2;
  if ((doc as any)?.queryRung === 1) score += 1;
  return score;
}

function attachHardcoverFailureMarker(doc: RecommendationDoc): RecommendationDoc {
  return {
    ...doc,
    hardcover: {
      ...(doc as any)?.hardcover,
      failed: true,
    },
  } as any;
}

async function enrichWithHardcover(docs: RecommendationDoc[]): Promise<RecommendationDoc[]> {
  // Gold-standard router rule:
  // Hardcover is enrichment only. Never block, never drop, never downgrade shelf eligibility.
  // Cap lookups now that fetch runs per rung.
  const HARDCOVER_LOOKUP_LIMIT = 12;

  const indexedDocs = docs.map((doc, index) => ({ doc, index }));
  const prioritized = [...indexedDocs].sort(
    (a, b) => hardcoverLookupPriority(b.doc) - hardcoverLookupPriority(a.doc)
  );
  const selectedIndexes = new Set(
    prioritized.slice(0, HARDCOVER_LOOKUP_LIMIT).map((entry) => entry.index)
  );

  const enriched = await Promise.all(
    indexedDocs.map(async ({ doc, index }) => {
      if (!selectedIndexes.has(index)) return doc;

      try {
        const title = doc.title;
        const author = Array.isArray(doc.author_name) ? doc.author_name[0] : undefined;
        if (!title) return doc;

        const data = await getHardcoverRatings(title, author);
        if (!data) return doc;

        return {
          ...doc,
          hardcover: {
            rating: data.rating,
            ratings_count: data.ratings_count,
          },
        } as any;
      } catch {
        return attachHardcoverFailureMarker(doc);
      }
    })
  );

  return enriched;
}


async function enrichOpenLibraryBeforeFiltering(docs: RecommendationDoc[]): Promise<RecommendationDoc[]> {
  // Open Library often has sparse page/description/rating metadata. Give OL rows
  // a lightweight Hardcover pass BEFORE filterCandidates so the central filter
  // can judge them with the same authority signals available to Google Books.
  const OPEN_LIBRARY_PREFILTER_LIMIT = 30;

  const indexedDocs = docs.map((doc, index) => ({ doc, index }));
  const openLibraryIndexes = indexedDocs
    .filter(({ doc }) => sourceForDoc(doc, "openLibrary") === "openLibrary")
    .sort((a, b) => hardcoverLookupPriority(b.doc) - hardcoverLookupPriority(a.doc))
    .slice(0, OPEN_LIBRARY_PREFILTER_LIMIT)
    .map((entry) => entry.index);

  const selectedIndexes = new Set(openLibraryIndexes);
  if (!selectedIndexes.size) return docs;

  const enriched = await Promise.all(
    indexedDocs.map(async ({ doc, index }) => {
      if (!selectedIndexes.has(index)) return doc;
      if ((doc as any)?.hardcover && !hasHardcoverFailureShape((doc as any).hardcover)) return doc;

      try {
        const title = doc.title;
        const author = Array.isArray((doc as any).author_name)
          ? (doc as any).author_name[0]
          : (doc as any).author;
        if (!title) return doc;

        const data = await getHardcoverRatings(title, author);
        if (!data) return doc;

        return {
          ...doc,
          hardcover: {
            ...((doc as any)?.hardcover || {}),
            rating: data.rating,
            ratings_count: data.ratings_count,
            prefilter: true,
          },
        } as any;
      } catch {
        return attachHardcoverFailureMarker(doc);
      }
    })
  );

  return enriched;
}

function inferCommercialSignals(doc: RecommendationDoc): CommercialSignals {
  const title = normalizeText(doc?.title ?? (doc as any)?.volumeInfo?.title);
  const description = collectDescriptionText(doc);
  const categories = collectCategoryText(doc);
  const publisher = normalizeText((doc as any)?.publisher ?? (doc as any)?.volumeInfo?.publisher);
  const combined = [title, description, categories, publisher].filter(Boolean).join(" ");

  const googleRatings = Number((doc as any)?.ratingsCount || (doc as any)?.volumeInfo?.ratingsCount || 0);
  const hardcoverRatings = Number((doc as any)?.hardcover?.ratings_count || 0);
  const avgRating = Number((doc as any)?.averageRating || (doc as any)?.volumeInfo?.averageRating || (doc as any)?.hardcover?.rating || 0);

  let bestseller = false;
  let awards = 0;
  let popularityTier = 0;
  let sourceCount = 0;

  if (/\b(new york times bestseller|nyt bestseller|international bestseller|usa today bestseller|publishers weekly bestseller|indiebound bestseller|national bestseller)\b/.test(combined)) {
    bestseller = true;
    sourceCount += 1;
  }

  const awardMatches = combined.match(/\b(award[- ]winning|booker|pulitzer|national book award|edgar award|hugo award|nebula award|goodreads choice award|carnegie medal|newbery medal|printz award)\b/g);
  if (awardMatches?.length) {
    awards = Math.min(3, awardMatches.length);
    sourceCount += 1;
  }

  if (googleRatings >= 5000 || hardcoverRatings >= 5000) popularityTier = 3;
  else if (googleRatings >= 1000 || hardcoverRatings >= 1000) popularityTier = 2;
  else if (googleRatings >= 200 || hardcoverRatings >= 200 || avgRating >= 4.2) popularityTier = 1;

  if (/\b(penguin random house|harpercollins|macmillan|hachette|simon\s*&?\s*schuster|knopf|doubleday|viking|ballantine|st\. martin'?s|tor)\b/.test(combined)) {
    sourceCount += 1;
  }

  return {
    bestseller,
    awards,
    popularityTier,
    sourceCount,
  };
}

function enrichWithCommercialSignals(docs: RecommendationDoc[]): RecommendationDoc[] {
  return docs.map((doc) => ({
    ...doc,
    commercialSignals: {
      ...(doc as any)?.commercialSignals,
      ...inferCommercialSignals(doc),
    },
  }));
}

async function runEngine(engine: EngineId, input: RecommenderInput): Promise<RecommendationResult> {
  if (engine === "googleBooks") {
    debugRouterLog("SENDING QUERIES TO GOOGLE BOOKS", {
      deckKey: (input as any)?.deckKey,
      domainModeOverride: (input as any)?.domainModeOverride,
      queries: (input as any)?.queries ?? (input as any)?.bucketPlan?.queries,
      query: (input as any)?.query,
    });
    return getGoogleBooksRecommendations(input);
  }

  const domainModeOverride: DomainMode | undefined =
    input.deckKey === "k2" ? (input.domainModeOverride ?? "chapterMiddle") : input.domainModeOverride;

  const routedInput: RecommenderInput =
    domainModeOverride === input.domainModeOverride ? input : { ...input, domainModeOverride };

  if (engine === "openLibrary") {
    debugRouterLog("SENDING QUERIES TO OPEN LIBRARY", {
      deckKey: (routedInput as any)?.deckKey,
      domainModeOverride: (routedInput as any)?.domainModeOverride,
      queries: (routedInput as any)?.queries ?? (routedInput as any)?.bucketPlan?.queries,
      query: (routedInput as any)?.query,
    });
    return getOpenLibraryRecommendations(routedInput);
  }
  if (engine === "kitsu") return getKitsuMangaRecommendations(routedInput);
  return getGcdGraphicNovelRecommendations(routedInput);
}

async function fetchBothEngines(
  input: RecommenderInput
): Promise<{
  google: RecommendationResult | null;
  openLibrary: RecommendationResult | null;
  kitsu: RecommendationResult | null;
  gcd: RecommendationResult | null;
  mergedDocs: RecommendationDoc[];
}> {
  const requests: Array<Promise<RecommendationResult>> = [
    runEngine("googleBooks", input),
    runEngine("openLibrary", input),
  ];

  const includeKitsu = shouldUseKitsu(input);
  const includeGcd = shouldUseGcd(input);

  if (includeKitsu) requests.push(getKitsuMangaRecommendations(input));
  if (includeGcd) requests.push(getGcdGraphicNovelRecommendations(input));

  const results = await Promise.allSettled(requests);

  const google = results[0]?.status === "fulfilled" ? results[0].value : null;
  const openLibrary = results[1]?.status === "fulfilled" ? results[1].value : null;

  const kitsuIndex = includeKitsu ? 2 : -1;
  const gcdIndex = includeGcd ? (includeKitsu ? 3 : 2) : -1;

  const kitsu = kitsuIndex >= 0 && results[kitsuIndex]?.status === "fulfilled"
    ? results[kitsuIndex].value
    : null;

  const gcd = gcdIndex >= 0 && results[gcdIndex]?.status === "fulfilled"
    ? results[gcdIndex].value
    : null;

  const googleDocs = dedupeDocs(extractDocs(google, "googleBooks"));
  const openLibraryDocs = dedupeDocs(extractDocs(openLibrary, "openLibrary"));
  const kitsuDocs = dedupeDocs(extractDocs(kitsu, "kitsu"));
  const gcdDocs = dedupeDocs(extractDocs(gcd, "gcd"));

  // Gold-standard router rule:
  // merge first, dedupe once, do not let one engine overwrite another’s shelf.
  const mergedDocs = dedupeDocs([
    ...googleDocs,
    ...openLibraryDocs,
    ...kitsuDocs,
    ...gcdDocs,
  ]);

  return { google, openLibrary, kitsu, gcd, mergedDocs };
}

export async function getRecommendations(
  input: RecommenderInput,
  override?: EngineOverride
): Promise<RecommendationResult> {
  const routingInput = removeSkippedSwipeEvidenceForRouting(input);
  const preferredEngine = chooseEngine(routingInput, override);
  const baseBucketPlan = buildRouterBucketPlan(routingInput);
  const generatedHybridLaneWeights = buildHybridLaneWeights(routingInput, baseBucketPlan);
  const evidenceLaneWeights = buildDirectEvidenceLaneWeights(routingInput);
  const affinityMultipliers = buildUserAffinityLaneMultipliers(input);
  const hybridLaneWeights = applyLaneAffinityMultipliers(
    mergeEvidenceLaneWeights(generatedHybridLaneWeights, evidenceLaneWeights),
    affinityMultipliers
  );
  const routerFamily = choosePrimaryRouterFamilyFromWeights(
    inferRouterFamily(baseBucketPlan),
    hybridLaneWeights,
    routingInput
  );
  const isHybridMode = Object.keys(hybridLaneWeights).length > 1;
  const bucketPlan = {
    ...baseBucketPlan,
    lane: routerFamily,
    family: routerFamily,
    hybridMode: isHybridMode,
    hybridLaneWeights,
    primaryLane: routerFamily,
  };

  // Gold-standard 20Q router:
  // always carry the bucket plan forward, but do not let the router collapse to one engine.
  const routedInput: RecommenderInput = { ...routingInput, bucketPlan };
  const sourceEnabled = resolveSourceEnabled(routedInput);
  const sourceSkippedReason: string[] = [];

  if (!sourceEnabled.googleBooks) sourceSkippedReason.push("googleBooks_disabled_by_admin");
  if (!sourceEnabled.openLibrary) sourceSkippedReason.push("openLibrary_disabled_by_admin");
  if (!sourceEnabled.localLibrary) {
    sourceSkippedReason.push(
      routedInput.localLibrarySupported ? "localLibrary_disabled_by_admin" : "localLibrary_not_supported"
    );
  }
  if (!sourceEnabled.googleBooks && !sourceEnabled.openLibrary && !sourceEnabled.localLibrary) {
    throw new Error("All recommendation sources are disabled. Enable at least one source in Admin.");
  }

  const includeKitsu = shouldUseKitsu(routedInput);
  const includeGcd = shouldUseGcd(routedInput);
  let rungs = asArray(
    build20QRungs({
      ageBand:
        routingInput.deckKey === "adult"
          ? "adult"
          : routingInput.deckKey === "ms_hs"
          ? "teen"
          : routingInput.deckKey === "36"
          ? "pre-teen"
          : "kids",
      family:
        routerFamily === "horror"
          ? "speculative_family"
          : routerFamily === "mystery"
          ? "mystery_family"
          : routerFamily === "thriller"
          ? "thriller_family"
          : routerFamily === "science_fiction"
          ? "science_fiction_family"
          : routerFamily === "speculative"
          ? "speculative_family"
          : routerFamily === "romance"
          ? "romance_family"
          : routerFamily === "historical"
          ? "historical_family"
          : "general_family",
      baseGenre:
        fallbackRungsForRouterFamily(routerFamily)?.[0]?.query ||
        bucketPlan?.signals?.genres?.[0] ||
        bucketPlan?.queries?.[0] ||
        bucketPlan?.preview ||
        "fiction",
      subgenres: bucketPlan?.queries?.length
        ? bucketPlan.queries
        : (bucketPlan?.signals?.genres || []),
      tones: bucketPlan?.signals?.tones || [],
      themes: bucketPlan?.signals?.scenarios || [],
    })
  );

  if (!rungs.length && routerFamily === "mystery") {
    rungs = [
      { rung: 0, query: "psychological suspense novel" },
      { rung: 1, query: "detective mystery novel" },
      { rung: 2, query: "police procedural mystery novel" },
      { rung: 3, query: "psychological mystery novel" },
    ];
  }

  if (!rungs.length && routerFamily === "science_fiction") {
    rungs = [
      { rung: 0, query: "science fiction novel" },
      { rung: 1, query: "dystopian science fiction novel" },
      { rung: 2, query: "space opera science fiction" },
      { rung: 3, query: "psychological science fiction novel" },
    ];
  }

  if (!rungs.length && routerFamily === "speculative") {
    rungs = [
      { rung: 0, query: "epic fantasy novel" },
      { rung: 1, query: "dark fantasy novel" },
      { rung: 2, query: "magic fantasy novel" },
    ];
  }

  const canonicalFamilyRungs: Record<string, string[]> = {
    historical: [
      "historical fiction novel",
      "19th century historical fiction novel",
      "war historical fiction novel",
      "society historical fiction novel",
    ],
    thriller: [
      "psychological thriller novel",
      "crime thriller novel",
      "mystery suspense novel",
      "detective fiction novel",
    ],
    mystery: [
      "psychological thriller novel",
      "crime thriller novel",
      "mystery suspense novel",
      "detective fiction novel",
    ],
    horror: [
      "psychological horror novel",
      "haunted house horror novel",
      "supernatural horror novel",
      "gothic horror novel",
    ],
    romance: [
      "young adult romance novel",
      "coming of age romance novel",
      "contemporary romance novel",
      "school romance novel",
    ],
    fantasy: [
      "epic fantasy novel",
      "high fantasy novel",
      "dragon fantasy novel",
      "quest fantasy novel",
    ],
    science_fiction: [
      "science fiction novel",
      "dystopian science fiction novel",
      "space opera science fiction novel",
      "survival science fiction novel",
    ],
  };
  const forcedRungs = canonicalFamilyRungs[routerFamily];
  if (forcedRungs?.length) {
    rungs = forcedRungs.map((query, index) => ({ rung: index, query, queryFamily: routerFamily }));
  }

  const ensureUniqueRungQueries = (rungList: any[], family: RouterFamilyKey) => {
    const seen = new Set<string>();
    const fallback = (canonicalFamilyRungs[family] || []).map((q) => String(q || "").trim()).filter(Boolean);
    return (Array.isArray(rungList) ? rungList : []).map((r: any, index: number) => {
      const current = String(r?.query || "").trim();
      const key = normalizeQueryKey(current);
      if (key && !seen.has(key)) {
        seen.add(key);
        return r;
      }
      const replacement = fallback.find((q) => {
        const qKey = normalizeQueryKey(q);
        return Boolean(qKey) && !seen.has(qKey);
      }) || `${family.replace("_", " ")} novel ${index + 1}`;
      seen.add(normalizeQueryKey(replacement));
      return { ...r, query: replacement };
    });
  };
  rungs = ensureUniqueRungQueries(rungs, routerFamily);


  if (isHybridMode) {
    const existingKeys = new Set(rungs.map((r: any) => normalizeQueryKey(r?.query)));
    for (const family of Object.keys(hybridLaneWeights)) {
      const normalizedFamily = normalizeRouterFamilyValue(family);
      if (!normalizedFamily || normalizedFamily === routerFamily) continue;
      for (const rung of fallbackRungsForRouterFamily(normalizedFamily).slice(0, 2)) {
        const key = normalizeQueryKey(rung.query);
        if (!key || existingKeys.has(key)) continue;
        existingKeys.add(key);
        rungs.push({ ...rung, hybridFamily: normalizedFamily });
      }
    }
  }

  rungs = rungs.map((r: any) => ({ ...r, laneKind: "precision", queryFamily: normalizeRouterFamilyValue((r as any)?.queryFamily) || routerFamily }));

  // Performance guardrail: avoid exploding fetch fan-out on broad hybrid sessions.
  rungs = rungs.slice(0, 4);

  let google: RecommendationResult | null = null;
  let openLibrary: RecommendationResult | null = null;
  let kitsu: RecommendationResult | null = null;
  let gcd: RecommendationResult | null = null;
  const allMergedDocs: RecommendationDoc[] = [];
  const debugRawPool: any[] = [];
  const aggregatedRawFetched = {
    googleBooks: 0,
    openLibrary: 0,
    kitsu: 0,
    gcd: 0,
  };

  for (const rung of rungs) {
    const rungFamily = normalizeRouterFamilyValue((rung as any)?.hybridFamily) || routerFamily;
    const effectiveBucketPlan = {
      ...bucketPlan,
      lane: rungFamily,
      family: rungFamily,
      hybridMode: isHybridMode,
      hybridLaneWeights,
      primaryLane: routerFamily,
    };
    const queryLanes = asArray(buildHighDiversityQueryLanes(rung, effectiveBucketPlan));

    for (const lane of queryLanes) {
      const laneQueryText = String((lane as any)?.query || (lane as any)?.queryText || "");
      const inferredQueryFamily = inferFamilyFromQueryText(laneQueryText, rungFamily);
      const laneFamily =
        routerFamily === "historical" || inferHistoricalFromQueryText(laneQueryText)
          ? "historical"
          : normalizeRouterFamilyValue((lane as any)?.queryFamily) ||
            normalizeRouterFamilyValue((lane as any)?.filterFamily) ||
            inferredQueryFamily ||
            rungFamily;
      const laneFilterFamily =
        laneFamily === "historical"
          ? "historical"
          : normalizeRouterFamilyValue((lane as any)?.filterFamily) || laneFamily;
      debugRouterLog("QUERY_FAMILY_BEFORE_FETCH", {
        query: laneQueryText,
        queryFamily: (lane as any)?.queryFamily || null,
        inferredQueryFamily: inferredQueryFamily || null,
        laneFamily,
        laneFilterFamily,
      });
      const laneQueryRung = Number.isFinite(Number(lane.queryRung))
        ? Number(lane.queryRung)
        : Number.isFinite(Number(rung?.rung))
        ? Number(rung.rung)
        : undefined;

      const laneInput: RecommenderInput = {
        ...routedInput,
        bucketPlan: {
          ...effectiveBucketPlan,
          queries: [lane.query],
          preview: lane.query,
          // Critical: do not preserve the parent bucketPlan.rungs here. Each lane
          // is a single fetch request. Keeping the parent rungs lets source fetchers
          // re-expand all historical queries under the current lane/rung, which is
          // what produced four rung labels with the same effective query identity.
          rungs: [
            {
              ...(rung || {}),
              rung: laneQueryRung,
              query: lane.query,
              primary: lane.query,
              secondary: null,
            },
          ],
        },
      };

      const requests: Array<Promise<RecommendationResult>> = [];
      if (sourceEnabled.googleBooks && lane.source === "googleBooks") requests.push(runEngine("googleBooks", laneInput));
      if (sourceEnabled.openLibrary && lane.source === "openLibrary") requests.push(runEngine("openLibrary", laneInput));
      if (sourceEnabled.googleBooks && includeKitsu && lane.source === "googleBooks") requests.push(getKitsuMangaRecommendations(laneInput));
      if (sourceEnabled.googleBooks && includeGcd && lane.source === "googleBooks") requests.push(getGcdGraphicNovelRecommendations(laneInput));

      const results = await Promise.allSettled(requests);
      debugRouterLog("QUERY_FAMILY_AFTER_FETCH", {
        query: (lane as any)?.query,
        laneFamily,
        filterFamily: laneFamily,
      });
      let index = 0;

      const laneGoogle = sourceEnabled.googleBooks && lane.source === "googleBooks" && results[index]?.status === "fulfilled"
        ? (results[index] as PromiseFulfilledResult<RecommendationResult>).value
        : null;
      if (sourceEnabled.googleBooks && lane.source === "googleBooks") index += 1;

      const laneOpenLibrary = sourceEnabled.openLibrary && lane.source === "openLibrary" && results[index]?.status === "fulfilled"
        ? (results[index] as PromiseFulfilledResult<RecommendationResult>).value
        : null;
      if (sourceEnabled.openLibrary && lane.source === "openLibrary") index += 1;

      const laneKitsu = sourceEnabled.googleBooks && includeKitsu && lane.source === "googleBooks" && results[index]?.status === "fulfilled"
        ? (results[index] as PromiseFulfilledResult<RecommendationResult>).value
        : null;
      if (sourceEnabled.googleBooks && includeKitsu && lane.source === "googleBooks") index += 1;

      const laneGcd = sourceEnabled.googleBooks && includeGcd && lane.source === "googleBooks" && results[index]?.status === "fulfilled"
        ? (results[index] as PromiseFulfilledResult<RecommendationResult>).value
        : null;

      const laneMergedDocs = dedupeDocs([
        ...dedupeDocs(extractDocs(laneGoogle, "googleBooks")),
        ...dedupeDocs(extractDocs(laneOpenLibrary, "openLibrary")),
        ...(sourceEnabled.googleBooks && includeKitsu && lane.source === "googleBooks" ? dedupeDocs(extractDocs(laneKitsu, "kitsu")) : []),
        ...(sourceEnabled.googleBooks && includeGcd && lane.source === "googleBooks" ? dedupeDocs(extractDocs(laneGcd, "gcd")) : []),
      ]);

      if (!google && laneGoogle) google = laneGoogle;
      if (!openLibrary && laneOpenLibrary) openLibrary = laneOpenLibrary;
      if (!kitsu && laneKitsu) kitsu = laneKitsu;
      if (!gcd && laneGcd) gcd = laneGcd;

      aggregatedRawFetched.googleBooks += Number((laneGoogle as any)?.debugRawFetchedCount ?? countResultItems(laneGoogle));
      aggregatedRawFetched.openLibrary += Number((laneOpenLibrary as any)?.debugRawFetchedCount ?? countResultItems(laneOpenLibrary));
      aggregatedRawFetched.kitsu += Number((laneKitsu as any)?.debugRawFetchedCount ?? countResultItems(laneKitsu));
      aggregatedRawFetched.gcd += Number((laneGcd as any)?.debugRawFetchedCount ?? countResultItems(laneGcd));

      const laneRawPool = [
        ...(((laneGoogle as any)?.debugRawPool as any[]) || []),
        ...(((laneOpenLibrary as any)?.debugRawPool as any[]) || []),
        ...(((laneKitsu as any)?.debugRawPool as any[]) || []),
        ...(((laneGcd as any)?.debugRawPool as any[]) || []),
      ].map((row: any) => {
        const queryRung = Number.isFinite(Number(lane.queryRung))
          ? Number(lane.queryRung)
          : Number.isFinite(Number(rung?.rung))
          ? Number(rung.rung)
          : undefined;
        const rowFamilyFromQuery = routerFamily === "historical"
          ? "historical"
          : inferFamilyFromQueryText(String(row?.queryText ?? lane.query ?? ""), laneFamily);
        const rowHistoricalSignal = inferHistoricalFromQueryText(String(row?.queryText ?? lane.query ?? ""));
        const rowQueryFamily =
          rowHistoricalSignal
            ? "historical"
            : normalizeRouterFamilyValue(row?.queryFamily) || rowFamilyFromQuery || laneFamily;
        const rowFilterFamily =
          rowHistoricalSignal
            ? "historical"
            : normalizeRouterFamilyValue(row?.filterFamily) || rowFamilyFromQuery || laneFilterFamily;

        return {
          ...row,
          queryRung,
          queryText: row?.queryText ?? lane.query,
          queryFamily: rowQueryFamily,
          hybridLaneWeights,
          primaryLane: routerFamily,
          laneKind: (rowQueryFamily === "historical" || rowFilterFamily === "historical") ? "historical" : lane.laneKind,
          filterFamily: rowFilterFamily,
        };
      });

      debugRawPool.push(...laneRawPool);

      const taggedDocs = laneMergedDocs.map((doc: any) => {
        const queryRung = Number.isFinite(Number(lane.queryRung))
          ? Number(lane.queryRung)
          : Number.isFinite(Number(rung?.rung))
          ? Number(rung.rung)
          : undefined;

        return {
          ...doc,
          queryRung,
          queryText: lane.query,
          queryFamily: laneFamily,
          hybridLaneWeights,
          primaryLane: routerFamily,
          laneKind: (laneFamily === "historical" || laneFilterFamily === "historical") ? "historical" : lane.laneKind,
          filterFamily: laneFilterFamily,
          diagnostics: {
            ...(doc?.diagnostics || {}),
            queryRung,
            queryText: lane.query,
            queryFamily: laneFamily,
            laneKind: (laneFamily === "historical" || laneFilterFamily === "historical") ? "historical" : lane.laneKind,
            filterFamily: laneFilterFamily,
            hybridLaneWeights,
            primaryLane: routerFamily,
          },
        };
      });

      allMergedDocs.push(...taggedDocs);
    }
  }

  const mergedDocs = dedupeDocs(allMergedDocs);

  debugDocPreview("RAW MERGED CANDIDATE POOL BEFORE FILTERING", mergedDocs);
  debugRouterLog("RAW FETCHED BY SOURCE", aggregatedRawFetched);

  // Open Library gets a lightweight Hardcover pass BEFORE filtering. This is
  // enrichment-only: it never drops rows, but it gives filterCandidates earlier
  // authority signals for sparse OL records.
  const openLibraryPrefilterEnrichedDocs = await enrichOpenLibraryBeforeFiltering(mergedDocs);

  // Hardcover enrichment is non-blocking and runs AFTER merging.
  const hardcoverEnrichedDocs = await enrichWithHardcover(openLibraryPrefilterEnrichedDocs);
  const enrichedDocs = enrichWithCommercialSignals(hardcoverEnrichedDocs);

  // Strict 20Q router:
  // taste comes only from 20Q-derived rungs. NYT is allowed only after filtering
  // as a procurement/commercial anchor, never as query or taste evidence.
  const filteredDocs = unwrapFilteredCandidates(filterCandidates(enrichedDocs, bucketPlan));
  debugDocPreview("FILTERED CANDIDATE POOL", filteredDocs);
  debugRouterLog("FILTER COLLAPSE CHECK", { rawCount: enrichedDocs.length, filteredCount: filteredDocs.length });
  const filterAuditRows = buildFilterAuditRows(enrichedDocs);
  const filterAuditSummary = summarizeFilterAudit(filterAuditRows);

  // Centralized filtering rule:
  // filterCandidates is the only keep/reject authority for fetched candidates.
  // NYT bypasses this as a capped post-filter procurement signal only.
  let candidateDocs = filteredDocs;
  let nytAnchorDebug: NytAnchorDebug = {
    enabled: false,
    fetched: 0,
    matched: 0,
    injected: 0,
    allowInjections: false,
    lists: [],
  };

  const finalLimitForAnchors = Math.max(1, Math.min(10, routingInput.limit ?? 10));
  const googleFetchFailureDetected = Number(aggregatedRawFetched.googleBooks || 0) === 0;
  const allowNytInjections = !googleFetchFailureDetected && shouldAllowNytAnchorInjections(filteredDocs.length, finalLimitForAnchors);
  const nytAnchorResult = googleFetchFailureDetected
    ? { docs: [], debug: { ...nytAnchorDebug, enabled: false, error: "google_books_fetch_failure_detected" } }
    : await fetchNytAnchorDocs(routedInput, routerFamily);
  nytAnchorDebug = { ...nytAnchorResult.debug, allowInjections: allowNytInjections };

  if (nytAnchorResult.docs.length) {
    const mergedBestsellers = mergeBestsellerDocs(candidateDocs, nytAnchorResult.docs, {
      allowInjections: allowNytInjections,
    });

    candidateDocs = capNytAnchorInjections(mergedBestsellers.docs);
    candidateDocs = candidateDocs.filter((doc) => {
      if (!isNytAnchorDoc(doc)) return true;
      const familyMatch = nytAnchorMatchesFamily(doc, routerFamily);
      const toneSimilarity = Number((doc as any)?.nytToneSimilarity || 0);
      return familyMatch || toneSimilarity >= NYT_TONE_SIMILARITY_THRESHOLD;
    });
    nytAnchorDebug = {
      ...nytAnchorDebug,
      matched: mergedBestsellers.matchedCount,
      injected: Math.min(mergedBestsellers.injectedCount, MAX_NYT_ANCHOR_INJECTIONS),
    };

    debugRouterLog("NYT PROCUREMENT ANCHORS", nytAnchorDebug);
    debugDocPreview("CANDIDATE POOL AFTER NYT PROCUREMENT ANCHORS", candidateDocs);
  }

  if (!isHybridMode && routerFamily === "thriller") {
    candidateDocs = candidateDocs.filter((doc: any) => {
      const family = normalizeRouterFamilyValue(doc?.queryFamily || doc?.diagnostics?.queryFamily || doc?.rawDoc?.queryFamily);
      return !family || family === "thriller" || family === "mystery";
    });
  }

  if (!isHybridMode && routerFamily === "romance") {
    const explicitFantasyRomance = /\bfantasy romance\b/.test(
      [
        ...(Array.isArray(bucketPlan?.queries) ? bucketPlan.queries : []),
        ...(Array.isArray(rungs) ? rungs.map((r: any) => r?.query) : []),
        bucketPlan?.preview,
      ].filter(Boolean).join(" ").toLowerCase()
    );

    if (!explicitFantasyRomance) {
      candidateDocs = candidateDocs.filter((doc: any) => {
        const text = [
          doc?.title,
          doc?.description,
          doc?.genre,
          ...(Array.isArray(doc?.subject) ? doc.subject : []),
          ...(Array.isArray(doc?.subjects) ? doc.subjects : []),
          doc?.rawDoc?.title,
          doc?.rawDoc?.description,
        ].filter(Boolean).join(" ").toLowerCase();
        const fantasyHeavy = /\b(epic fantasy|high fantasy|dragon|wizard|witch|fae|sorcery|magic kingdom|quest fantasy)\b/.test(text);
        const romanceNative = /\b(romance|love story|courtship|relationship|second chance|enemies to lovers|wedding|marriage)\b/.test(text);
        return !fantasyHeavy || romanceNative;
      });
    }
  }

  if (!isHybridMode) {
    candidateDocs = candidateDocs.map((doc: any) => ({
      ...doc,
      queryFamily: routerFamily,
      primaryLane: routerFamily,
      diagnostics: {
        ...(doc?.diagnostics || {}),
        queryFamily: routerFamily,
        primaryLane: routerFamily,
      },
    }));
  }

  const googleDocsEnriched = candidateDocs.filter(
    (doc: any) => sourceForDoc(doc, "googleBooks") === "googleBooks"
  );

  const openLibraryDocsEnriched = candidateDocs.filter(
    (doc: any) => sourceForDoc(doc, "openLibrary") === "openLibrary"
  );

  const kitsuDocsEnriched = candidateDocs.filter(
    (doc: any) => sourceForDoc(doc, "kitsu") === "kitsu"
  );

  const gcdDocsEnriched = candidateDocs.filter(
    (doc: any) => sourceForDoc(doc, "gcd") === "gcd"
  );

  // Normalize all sources the same way.
  // IMPORTANT: Open Library should normalize from enriched docs too, so Hardcover failure markers
  // survive into candidate.rawDoc and finalRecommender can treat 429s as soft/non-blocking.
  const googleCandidates = asArray(normalizeCandidates(googleDocsEnriched, "googleBooks"));
  const openLibraryCandidates = asArray(normalizeCandidates(openLibraryDocsEnriched, "openLibrary"));
  const kitsuCandidatesRaw = asArray(normalizeCandidates(kitsuDocsEnriched, "kitsu"));
  const gcdCandidates = asArray(normalizeCandidates(gcdDocsEnriched, "gcd"));

  debugRouterLog("NORMALIZED CANDIDATES BY SOURCE", {
    googleBooks: googleCandidates.length,
    openLibrary: openLibraryCandidates.length,
    kitsu: kitsuCandidatesRaw.length,
    gcd: gcdCandidates.length,
  });

  // Light dedupe for visual shelves.
  const seenTitles = new Set<string>();
  const kitsuCandidates = kitsuCandidatesRaw.filter((c) => {
    const title = (c.title || "").toLowerCase().trim();
    if (!title || seenTitles.has(title)) return false;
    seenTitles.add(title);
    return true;
  });

  

function buildRungDiagnostics(candidates: any[]) {
  const byRung: Record<string, number> = {};
  const byRungSource: Record<string, Record<string, number>> = {};

  for (const c of candidates) {
    const rung = String(c?.rawDoc?.queryRung ?? c?.queryRung ?? "unknown");
    const source = c?.source ?? "unknown";

    byRung[rung] = (byRung[rung] || 0) + 1;

    if (!byRungSource[rung]) byRungSource[rung] = {};
    byRungSource[rung][source] = (byRungSource[rung][source] || 0) + 1;
  }

  return {
    byRung,
    byRungSource,
    total: candidates.length,
  };
}

const normalizedCandidatesRaw = [
    ...googleCandidates,
    ...openLibraryCandidates,
    ...(includeKitsu ? kitsuCandidates : []),
    ...(includeGcd ? gcdCandidates : []),
  ].filter((c: any) => c?.rawDoc?.diagnostics?.filterKept !== false && c?.diagnostics?.filterKept !== false);
  const normalizedCandidates = collapseCrossRungDuplicates(normalizedCandidatesRaw as any).map((candidate: any) => {
    const inferredQueryFamily =
      normalizeRouterFamilyValue(
        candidate?.queryFamily ||
        candidate?.rawDoc?.queryFamily ||
        candidate?.rawDoc?.diagnostics?.queryFamily ||
        candidate?.rawDoc?.filterFamily ||
        candidate?.rawDoc?.diagnostics?.filterFamily
      ) ||
      inferFamilyFromQueryText(
        String(candidate?.queryText || candidate?.rawDoc?.queryText || ""),
        routerFamily
      ) ||
      routerFamily;

    const queryFamily = routerFamily === "historical" ? "historical" : inferredQueryFamily;
    const filterFamily = routerFamily === "historical"
      ? "historical"
      : normalizeRouterFamilyValue(candidate?.filterFamily || candidate?.rawDoc?.filterFamily || candidate?.rawDoc?.diagnostics?.filterFamily) || queryFamily;
    const laneKind = queryFamily === "historical"
      ? "historical"
      : (candidate?.laneKind || candidate?.rawDoc?.laneKind || candidate?.rawDoc?.diagnostics?.laneKind);

    return {
      ...candidate,
      queryFamily,
      filterFamily,
      laneKind,
      rawDoc: {
        ...(candidate?.rawDoc || {}),
        queryFamily,
        filterFamily,
        laneKind,
        diagnostics: {
          ...(candidate?.rawDoc?.diagnostics || {}),
          queryFamily,
          filterFamily,
          laneKind,
        },
      },
    };
  });

  const openLibraryNormalizedCandidates = normalizedCandidates.filter((c: any) => c?.source === "openLibrary");

  const preferredRungs = preferredPrimaryRungs(rungs);
  const primaryIntentCandidates = normalizedCandidates.filter((c: any) =>
    preferredRungs.has(String(c?.rawDoc?.queryRung ?? c?.queryRung ?? ""))
  );

  const finalLimit = Math.max(1, Math.min(10, routingInput.limit ?? 10));

  let basePool = dedupeDocs([
    ...primaryIntentCandidates,
    ...normalizedCandidates,
  ] as any);

  if (basePool.length < finalLimit * 2) {
    const qualitySorted = [...normalizedCandidates].sort((a: any, b: any) => {
      return (
        romanceCanonicalScore(b) - romanceCanonicalScore(a) ||
        candidateScoreValue(b) - candidateScoreValue(a)
      );
    });

    basePool = dedupeDocs([
      ...basePool,
      ...qualitySorted,
    ] as any);
  }

  const basePoolOpenLibraryCount = basePool.filter((c: any) => c?.source === "openLibrary").length;
  if (basePoolOpenLibraryCount < MIN_OPEN_LIBRARY_CANDIDATES) {
    const existing = new Set(basePool.map((c: any) => candidateKey(c)));
    for (const candidate of openLibraryNormalizedCandidates) {
      const key = candidateKey(candidate);
      if (!key || existing.has(key)) continue;
      basePool.push(candidate);
      existing.add(key);
      if (basePool.filter((c: any) => c?.source === "openLibrary").length >= MIN_OPEN_LIBRARY_CANDIDATES) break;
    }
  }

  if (basePool.length < MIN_ROUTER_RECOVERY_POOL) {
    const existing = new Set(basePool.map((c: any) => candidateKey(c)));
    const recoveryFeed = [...normalizedCandidates].sort((a: any, b: any) => {
      const rungA = Number(a?.rawDoc?.queryRung ?? a?.queryRung ?? 999);
      const rungB = Number(b?.rawDoc?.queryRung ?? b?.queryRung ?? 999);
      return candidateScoreValue(b) - candidateScoreValue(a) || rungA - rungB;
    });

    for (const candidate of recoveryFeed) {
      const key = candidateKey(candidate);
      if (!key || existing.has(key)) continue;
      basePool.push(candidate);
      existing.add(key);
      if (basePool.length >= MIN_ROUTER_RECOVERY_POOL) break;
    }
  }

  const quotaPool = buildLaneQuotaPool(basePool, finalLimit);
  const rankingPool =
    routerFamily === "historical"
      ? ensureHistoricalRungDiversity(quotaPool, finalLimit)
      : ensureRungCoverage(quotaPool, finalLimit);

  const candidatePoolPreview = rankingPool.slice(0, 50).map((c: any) => {
    const filterDiagnostics = c?.rawDoc?.diagnostics?.filterDiagnostics ?? c?.diagnostics?.filterDiagnostics;
    return {
      title: c.title,
      author: Array.isArray(c.author_name) ? c.author_name[0] : c.author,
      source: c.source,
      score: c.score,
      queryText: c?.rawDoc?.queryText ?? c?.queryText,
      queryRung: c?.rawDoc?.queryRung ?? c?.queryRung,
      laneKind: c?.rawDoc?.laneKind ?? c?.laneKind ?? c?.diagnostics?.laneKind,
      commercialSignals: c?.commercialSignals ?? c?.rawDoc?.commercialSignals,
      filterKept: c?.rawDoc?.diagnostics?.filterKept ?? c?.diagnostics?.filterKept,
      filterRejectReasons: c?.rawDoc?.diagnostics?.filterRejectReasons ?? c?.diagnostics?.filterRejectReasons ?? [],
      filterPassedChecks: c?.rawDoc?.diagnostics?.filterPassedChecks ?? c?.diagnostics?.filterPassedChecks ?? [],
      filterFamily: c?.rawDoc?.diagnostics?.filterFamily ?? c?.diagnostics?.filterFamily ?? filterDiagnostics?.family,
      filterFlags: c?.rawDoc?.diagnostics?.filterFlags ?? c?.diagnostics?.filterFlags ?? filterDiagnostics?.flags ?? {},
    };
  });

  function romanceCanonicalScore(doc: any): number {
    const title = normalizeText(doc?.title ?? doc?.rawDoc?.title ?? doc?.volumeInfo?.title);
    const author = rawAuthorText(doc);
    let score = 0;
    if (/\b(jane austen|georgette heyer|julia quinn|lisa kleypas|lorretta chase|mary balogh|tessa dare|eloisa james|nora roberts|debbie macomber|johanna lindsey|julie garwood|kathleen e\.? woodiwiss|sherry thomas|virginia henley|rosemary rogers|ava march|heather graham|anne gracie|julia london|beverly jenkins)\b/.test(author)) score += 3;
    if (/\b(pride and prejudice|persuasion|sense and sensibility|emma|northanger abbey|rebecca|outlander|the flame and the flower|secrets of a summer night|devil in winter|love in the afternoon|the viscount who loved me|romancing mister bridgerton|lord of scoundrels|the hating game|book lovers|people we meet on vacation|the kiss quotient|a court of thorns and roses|the night circus)\b/.test(title)) score += 4;
    if (/\b(complete .* novels? in one|boxed set|collection|unknown author)\b/.test(title + " " + author)) score -= 3;
    const commercial = Number(doc?.commercialSignals?.popularityTier || doc?.rawDoc?.commercialSignals?.popularityTier || 0);
    score += Math.min(2, commercial);
    return score;
  }

  function rebalanceRomanceFinalSources(ranked: any[], rankingPoolSource: any[], finalLimitValue: number): any[] {
    if (routerFamily !== "romance") return ranked.slice(0, finalLimitValue);

    const initial = [...ranked.slice(0, finalLimitValue)];
    const targetOl = Math.min(MIN_ROMANCE_OPEN_LIBRARY_FINAL, finalLimitValue);
    const olCount = initial.filter((doc: any) => sourceForDoc(doc, "openLibrary") === "openLibrary").length;
    if (olCount >= targetOl) return initial;

    const needed = targetOl - olCount;
    const poolOL = rankingPoolSource
      .filter((doc: any) => sourceForDoc(doc, "openLibrary") === "openLibrary")
      .filter((doc: any) => !(initial.some((picked: any) => candidateKey(picked) === candidateKey(doc))))
      .filter((doc: any) => hasStrongRomanceOpenLibraryFinalShape(doc))
      .sort((a: any, b: any) => romanceCanonicalScore(b) - romanceCanonicalScore(a) || candidateScoreValue(b) - candidateScoreValue(a));

    const replaceable = initial
      .map((doc: any, idx: number) => ({ doc, idx }))
      .filter(({ doc }) => sourceForDoc(doc, "openLibrary") !== "openLibrary")
      .sort((a: any, b: any) => romanceCanonicalScore(a.doc) - romanceCanonicalScore(b.doc) || candidateScoreValue(a.doc) - candidateScoreValue(b.doc));

    let inserted = 0;
    for (let i = 0; i < replaceable.length && inserted < needed && inserted < poolOL.length; i += 1) {
      const incoming = poolOL[inserted];
      if (romanceCanonicalScore(incoming) < romanceCanonicalScore(replaceable[i].doc)) continue;
      initial[replaceable[i].idx] = incoming;
      inserted += 1;
    }

    return dedupeDocs(initial as any).slice(0, finalLimitValue) as any[];
  }

  // 20Q philosophy:
  // router gathers a broad but sane shelf;
  // finalRecommender performs the actual preference-aware magic.
  debugDocPreview("RANKING POOL BEFORE FINAL RECOMMENDER", rankingPool);

  const rankedDocs = asArray(finalRecommenderForDeck(rankingPool, input.deckKey, {
    tasteProfile: routingInput.tasteProfile,
    profileOverride: routingInput.profileOverride,
    priorRecommendedIds: routingInput.priorRecommendedIds,
    priorRecommendedKeys: routingInput.priorRecommendedKeys,
    priorAuthors: routingInput.priorAuthors,
    priorSeriesKeys: routingInput.priorSeriesKeys,
    priorRejectedIds: routingInput.priorRejectedIds,
    priorRejectedKeys: routingInput.priorRejectedKeys,
  }));

  const postFilteredRankedDocs = rankedDocs
    .filter((doc: any) => doc?.diagnostics?.filterKept !== false && doc?.rawDoc?.diagnostics?.filterKept !== false);

  const narrativeWeightedRankedDocs =
    routerFamily === "science_fiction"
      ? [...postFilteredRankedDocs].sort((a: any, b: any) =>
          (scienceFictionNarrativeQualityScore(b) - scienceFictionNarrativeQualityScore(a)) ||
          (candidateScoreValue(b) - candidateScoreValue(a))
        )
      : routerFamily === "historical"
      ? [...postFilteredRankedDocs].sort((a: any, b: any) =>
          (historicalNarrativeQualityScore(b) - historicalNarrativeQualityScore(a)) ||
          (candidateScoreValue(b) - candidateScoreValue(a))
        )
      : postFilteredRankedDocs;

  const metaSafeRankedDocs = rebalanceRomanceFinalSources(narrativeWeightedRankedDocs, rankingPool, finalLimit)
    .filter((doc: any) => !isMetaReferenceWork(doc))
    .filter((doc: any) => routerFamily !== "science_fiction" || !isScienceFictionMetaCollection(doc))
    .filter((doc: any) => routerFamily !== "historical" || !isHistoricalPrimaryOrNonNarrative(doc));
  const finalRankedDocs = (() => {
    if (metaSafeRankedDocs.length >= finalLimit) return metaSafeRankedDocs.slice(0, finalLimit);
    const existing = new Set(metaSafeRankedDocs.map((doc: any) => candidateKey(doc)));
    const refill = rankingPool
      .filter((doc: any) => !isMetaReferenceWork(doc))
      .filter((doc: any) => routerFamily !== "science_fiction" || !isScienceFictionMetaCollection(doc))
      .filter((doc: any) => routerFamily !== "historical" || !isHistoricalPrimaryOrNonNarrative(doc))
      .filter((doc: any) => {
        const key = candidateKey(doc);
        return Boolean(key) && !existing.has(key);
      });
    return dedupeDocs([...metaSafeRankedDocs, ...refill] as any).slice(0, finalLimit) as any[];
  })();

  debugDocPreview("FINAL OUTPUT", finalRankedDocs, finalLimit);

  const rankedDocsWithDiagnostics = finalRankedDocs.map((doc: any) => ({
    ...doc,
    source: sourceForDoc(doc, "openLibrary"),
    diagnostics: doc?.diagnostics
      ? {
          ...doc.diagnostics,
          source: doc.diagnostics.source || sourceForDoc(doc, "openLibrary"),
          preFilterScore: doc.diagnostics.preFilterScore,
          postFilterScore: doc.diagnostics.postFilterScore,
          rejectionReason: doc.diagnostics.rejectionReason,
          tasteAlignment: doc.diagnostics.tasteAlignment,
          queryAlignment: doc.diagnostics.queryAlignment,
          rungBoost: doc.diagnostics.rungBoost,
          commercialBoost: (doc.diagnostics as any).commercialBoost,
          laneKind: doc.diagnostics.laneKind ?? doc.laneKind ?? doc.rawDoc?.laneKind,
          filterDiagnostics: doc.diagnostics.filterDiagnostics ?? doc?.rawDoc?.diagnostics?.filterDiagnostics,
          filterKept: doc.diagnostics.filterKept ?? doc?.rawDoc?.diagnostics?.filterKept,
          filterRejectReasons: doc.diagnostics.filterRejectReasons ?? doc?.rawDoc?.diagnostics?.filterRejectReasons ?? [],
          filterPassedChecks: doc.diagnostics.filterPassedChecks ?? doc?.rawDoc?.diagnostics?.filterPassedChecks ?? [],
          filterFamily: doc.diagnostics.filterFamily ?? doc?.rawDoc?.diagnostics?.filterFamily,
          filterWantsHorrorTone: doc.diagnostics.filterWantsHorrorTone ?? doc?.rawDoc?.diagnostics?.filterWantsHorrorTone,
          filterFlags: doc.diagnostics.filterFlags ?? doc?.rawDoc?.diagnostics?.filterFlags ?? {},
        }
      : {
          source: sourceForDoc(doc, "openLibrary"),
          laneKind: doc?.laneKind ?? doc?.rawDoc?.laneKind,
          filterDiagnostics: doc?.rawDoc?.diagnostics?.filterDiagnostics,
          filterKept: doc?.rawDoc?.diagnostics?.filterKept,
          filterRejectReasons: doc?.rawDoc?.diagnostics?.filterRejectReasons ?? [],
          filterPassedChecks: doc?.rawDoc?.diagnostics?.filterPassedChecks ?? [],
          filterFamily: doc?.rawDoc?.diagnostics?.filterFamily,
          filterWantsHorrorTone: doc?.rawDoc?.diagnostics?.filterWantsHorrorTone,
          filterFlags: doc?.rawDoc?.diagnostics?.filterFlags ?? {},
        },
  }));

  const rankedCountsBySource: Record<CandidateSource, number> = {
    googleBooks: 0,
    openLibrary: 0,
    kitsu: 0,
    gcd: 0,
  };

  for (const doc of rankedDocsWithDiagnostics) {
    const source = sourceForDoc(doc, "openLibrary");
    rankedCountsBySource[source] = (rankedCountsBySource[source] || 0) + 1;
  }

  const labelParts: string[] = [];
  if (sourceEnabled.googleBooks) labelParts.push("Google Books");
  if (sourceEnabled.openLibrary) labelParts.push("Open Library");
  if (sourceEnabled.googleBooks && includeKitsu) labelParts.push("Kitsu");
  if (sourceEnabled.googleBooks && includeGcd) labelParts.push("GCD");
  if (sourceEnabled.localLibrary) labelParts.push("Local Library");
  const engineLabel = labelParts.join(" + ") || "No enabled sources";

  const debugSourceStats: Record<string, RecommenderDebugSourceStats> = {
    googleBooks: {
      rawFetched: aggregatedRawFetched.googleBooks,
      postFilterCandidates: googleCandidates.length,
      finalSelected: rankedCountsBySource.googleBooks,
    },
    openLibrary: {
      rawFetched: aggregatedRawFetched.openLibrary,
      postFilterCandidates: openLibraryCandidates.length,
      finalSelected: rankedCountsBySource.openLibrary,
    },
    kitsu: {
      rawFetched: sourceEnabled.googleBooks && includeKitsu ? aggregatedRawFetched.kitsu : 0,
      postFilterCandidates: sourceEnabled.googleBooks && includeKitsu ? kitsuCandidates.length : 0,
      finalSelected: rankedCountsBySource.kitsu,
    },
    gcd: {
      rawFetched: sourceEnabled.googleBooks && includeGcd ? aggregatedRawFetched.gcd : 0,
      postFilterCandidates: sourceEnabled.googleBooks && includeGcd ? gcdCandidates.length : 0,
      finalSelected: rankedCountsBySource.gcd,
    },
    nyt: {
      rawFetched: nytAnchorDebug.fetched,
      postFilterCandidates: nytAnchorDebug.matched + nytAnchorDebug.injected,
      finalSelected: rankedDocsWithDiagnostics.filter((doc: any) => Boolean(doc?.nyt || doc?.rawDoc?.nyt)).length,
    },
  };

  return {
    engineId: preferredEngine,
    engineLabel,
    deckKey: routingInput.deckKey,
    domainMode:
      routingInput.deckKey === "k2"
        ? (routingInput.domainModeOverride ?? "chapterMiddle")
        : (routingInput.domainModeOverride ?? "default"),
    builtFromQuery:
      (google as any)?.builtFromQuery ||
      (openLibrary as any)?.builtFromQuery ||
      bucketPlan.preview ||
      bucketPlan.queries?.[0] ||
      "",
    items: rankedDocsWithDiagnostics.map((doc) => ({ kind: "open_library", doc })),
    debugSourceStats,
    debugCandidatePool: candidatePoolPreview,
    debugRawPool,
    debugRungStats: buildRungDiagnostics(normalizedCandidates),
    debugFilterAudit: filterAuditRows,
    debugFilterAuditSummary: filterAuditSummary,
    debugFinalRecommender: getLastFinalRecommenderDebug(),
    debugNytAnchors: nytAnchorDebug,
    sourceEnabled,
    sourceSkippedReason,
  } as RecommendationResult;
}
