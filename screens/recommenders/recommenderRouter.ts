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
import { getComicVineGraphicNovelRecommendations } from "./gcd/gcdGraphicNovelRecommender";
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
import { applyAdultCanonicalRungOverrides, adultExpansionQueries } from "./adultRouter";
import { applyTeenCanonicalRungOverrides, inferTeenLaneFromFacets, isTeenDeckKey, teenExpansionQueries } from "./teenRouter";

export type EngineOverride = EngineId | "auto";

if (typeof getComicVineGraphicNovelRecommendations !== "function") {
  throw new Error("COMICVINE_RECOMMENDER_IMPORT_INVALID: getComicVineGraphicNovelRecommendations must be a function.");
}

type RecommenderDebugSourceStats = {
  rawFetched: number;
  postFilterCandidates: number;
  finalSelected: number;
};

const MIN_DECISION_SWIPES_FOR_FULL_ROUTER_EXPANSION = 4;
const MIN_VISUAL_SIGNAL_FOR_KITSU = 2;
const MIN_VISUAL_SIGNAL_FOR_COMICVINE = 2;
const MIN_RELAXED_FILTER_POOL = 10;
const MIN_ROUTER_RECOVERY_POOL = 18;
const MIN_OPEN_LIBRARY_SURVIVORS = 3;
const MIN_OPEN_LIBRARY_CANDIDATES = 10;
const MIN_ROMANCE_OPEN_LIBRARY_FINAL = 2;
const MIN_DECISION_SWIPES_FOR_NYT_ANCHORS = 4;
const MIN_POOL_FOR_NYT_INJECTION = 14;
const MAX_NYT_ANCHOR_INJECTIONS = 2;
const NYT_TONE_SIMILARITY_THRESHOLD = 0.34;
const TARGET_MIN_RESULTS_WHEN_VIABLE = 8;

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

function finalSeriesKeyForRender(doc: any): string {
  const title = String(doc?.title || doc?.rawDoc?.title || "").toLowerCase();
  if (/locke\s*&\s*key/.test(title)) return "locke-and-key";
  if (/^saga($|\s+#\d+|\s+vol\.?\s*\d+|\s+volume\s+\d+)/.test(title)) return "saga";
  if (/\bhellboy\b/.test(title)) return "hellboy";
  if (/^(the\s+)?sandman($|\s+#\d+|\s+vol\.?\s*\d+|\s+volume\s+\d+)/.test(title)) return "sandman";
  if (/^runaways($|\s+#\d+|\s+vol\.?\s*\d+|\s+volume\s+\d+)/.test(title)) return "runaways";
  if (/y\s*:?\s*the\s+last\s+man/.test(title)) return "y-the-last-man";
  if (/department\s+of\s+truth/.test(title)) return "department-of-truth";
  if (/gideon\s+falls/.test(title)) return "gideon-falls";
  if (/something\s+is\s+killing\s+the\s+children/.test(title)) return "something-is-killing-the-children";
  return title.split(':')[0].replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function applyFinalSeriesCap(docs: any[], perSeriesCap: number): { kept: any[]; dropped: Array<{ title: string; reason: string; seriesKey: string }>; counts: Record<string, number> } {
  const counts: Record<string, number> = {};
  const kept: any[] = [];
  const dropped: Array<{ title: string; reason: string; seriesKey: string }> = [];
  for (const doc of docs) {
    const seriesKey = finalSeriesKeyForRender(doc);
    const current = counts[seriesKey] || 0;
    if (seriesKey && current >= perSeriesCap) {
      dropped.push({ title: String(doc?.title || doc?.rawDoc?.title || ""), reason: `series_cap_${perSeriesCap}`, seriesKey });
      continue;
    }
    counts[seriesKey] = current + 1;
    kept.push(doc);
  }
  return { kept, dropped, counts };
}

function unwrapFilteredCandidates(value: any): RecommendationDoc[] {
  if (Array.isArray(value)) return value as RecommendationDoc[];
  if (value && Array.isArray(value.candidates)) return value.candidates as RecommendationDoc[];
  return [];
}

function resolveSourceEnabled(input: RecommenderInput): RecommendationSourceDiagnostics {
  const config = (input as any)?.sourceEnabled || {};
  const localLibrarySupported = Boolean((input as any)?.localLibrarySupported);
  const gcdEnabledByAdmin = config?.comicVine !== false && config?.gcd !== false;
  const gcdEnabled = gcdEnabledByAdmin;

  return {
    googleBooks: config?.googleBooks !== false,
    openLibrary: config?.openLibrary !== false,
    localLibrary: localLibrarySupported ? config?.localLibrary !== false : false,
    kitsu: config?.kitsu !== false,
    comicVine: gcdEnabled,
  };
}


function buildSourceOrigins(config: any): Record<string, string> {
  return {
    googleBooks: config?.googleBooks === false ? "explicit_disable" : "default_enabled",
    openLibrary: config?.openLibrary === false ? "explicit_disable" : "default_enabled",
    localLibrary: config?.localLibrary === false ? "explicit_disable" : "default_enabled_or_unsupported",
    kitsu: config?.kitsu === false ? "explicit_disable" : "default_enabled",
    comicVineToggle: config?.comicVine === false ? "explicit_disable" : "default_enabled",
  };
}

function throwSourceFatal(message: string, payload: Record<string, any>): never {
  const err: any = new Error(message);
  err.recommenderDiagnostics = payload;
  throw err;
}

function isGoogleQuotaError(reason: unknown): boolean {
  const text = String((reason as any)?.message || reason || "").toLowerCase();
  return text.includes("quota") || text.includes("daily limit") || text.includes("rate limit") || text.includes("429");
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
  if (input.deckKey !== "adult" && !isTeenDeckKey(input.deckKey)) return false;
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
    return quoteIfNeeded("psychological horror graphic novel");
  }

  if (family === "speculative") {
    if (base) return quoteIfNeeded(base);
    if (preview) return quoteIfNeeded(preview);
    return quoteIfNeeded("science fiction");
  }

  if (family === "romance") return quoteIfNeeded(base || preview || "romance novel");
  if (family === "historical") return (base || preview || "historical fiction novel").trim();

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
  const sourceEnabled = resolveSourceEnabled(input);
  return sourceEnabled.kitsu;
}

function resolveKitsuEligibility(input: RecommenderInput): { eligible: boolean; likedAnimeMangaCount: number; skippedAnimeMangaCount: number } {
  const sourceEnabled = resolveSourceEnabled(input);
  if (!sourceEnabled.kitsu) return { eligible: false, likedAnimeMangaCount: 0, skippedAnimeMangaCount: 0 };
  const likedTagCounts = ((input as any)?.likedTagCounts || {}) as Record<string, number>;
  const skippedTagCounts = ((input as any)?.skippedTagCounts || {}) as Record<string, number>;
  const animeRe = /(media:anime|topic:manga|format:manga|format:graphic novel|format:graphic_novel|genre:anime|genre:manga)/;
  const mediaLikeRe = /(media:book|media:movie|media:tv|media:game|media:podcast|media:youtube)/;
  const likedAnimeMangaCount = Object.entries(likedTagCounts).reduce((n, [k, v]) => n + (animeRe.test(String(k).toLowerCase()) ? Number(v || 0) : 0), 0);
  const skippedAnimeMangaCount = Object.entries(skippedTagCounts).reduce((n, [k, v]) => n + (animeRe.test(String(k).toLowerCase()) ? Number(v || 0) : 0), 0);
  const likedNonAnimeMediaCount = Object.entries(likedTagCounts).reduce((n, [k, v]) => n + (mediaLikeRe.test(String(k).toLowerCase()) && !animeRe.test(String(k).toLowerCase()) ? Number(v || 0) : 0), 0);
  const eligible = likedAnimeMangaCount > 0 && likedAnimeMangaCount >= likedNonAnimeMediaCount;
  return { eligible, likedAnimeMangaCount, skippedAnimeMangaCount };
}

function kitsuFacetMatchScore(candidate: any, input: RecommenderInput): { score: number; reasons: string[]; weakOverlap: boolean } {
  const text = `${candidate?.title || ""} ${candidate?.description || ""} ${candidate?.rawDoc?.description || ""} ${(candidate?.subjects || []).join(" ")} ${(candidate?.tags || []).join(" ")}`.toLowerCase();
  const likedTags = Object.entries((((input as any)?.likedTagCounts || {}) as Record<string, number>))
    .filter(([, v]) => Number(v || 0) > 0)
    .map(([k]) => String(k || "").toLowerCase());
  const candidateTerms = [
    { key: "dark", re: /dark|grim|bleak|brooding|violent/ },
    { key: "fast-paced", re: /fast|action|battle|intense|high stakes/ },
    { key: "friendship", re: /friendship|friends|found family|companionship/ },
    { key: "survival", re: /survival|apocalypse|endurance|last stand/ },
    { key: "mystery", re: /mystery|detective|investigation|secrets?/ },
    { key: "school", re: /school|academy|classroom|high school|student/ },
    { key: "identity", re: /identity|self|belonging|outsider|transformation/ },
    { key: "hopeful", re: /hopeful|uplifting|inspiring|optimistic/ },
  ];
  let score = 0;
  const reasons: string[] = [];
  for (const term of candidateTerms) {
    const tagSignal = likedTags.some((t) => term.re.test(t));
    const textSignal = term.re.test(text);
    if (tagSignal && textSignal) {
      score += 2.2;
      reasons.push(`facet:${term.key}`);
    } else if (textSignal) {
      score += 0.9;
    }
  }
  const weakOverlap = reasons.length === 0;
  return { score, reasons, weakOverlap };
}

function buildKitsuRungs(tagCounts: RecommenderInput["tagCounts"] | undefined): Array<{ rung: number; query: string; source: EngineId }> {
  const tags = Object.entries(tagCounts || {})
    .filter(([, count]) => Number(count) > 0)
    .map(([tag]) => String(tag || "").toLowerCase());
  const has = (re: RegExp) => tags.some((tag) => re.test(tag));
  const queries: string[] = [];
  const add = (q: string) => {
    const n = String(q || "").trim().toLowerCase();
    if (n && !queries.includes(n)) queries.push(n);
  };
  if (has(/horror|dark|haunted|terror|ghost|occult/)) add("horror anime");
  if (has(/dark|noir|grim|bleak/)) add("dark anime");
  if (has(/supernatural|paranormal|magic|myth|monster|vampire/)) add("supernatural anime");
  if (has(/dystopian|future|rebellion|authoritarian|apocalypse|post apocalyptic/)) add("dystopian anime");
  if (has(/action|battle|adventure|combat|war|survival/)) add("action anime");
  add("anime");
  add("popular anime");
  return queries.slice(0, 6).map((query, index) => ({ rung: 500 + index, query, source: "kitsu" }));
}

function dedupeRungs<T extends { query?: string }>(rungs: T[]): T[] {
  const seen = new Set<string>();
  return rungs.filter((r) => {
    const q = String(r?.query || "").trim().toLowerCase().replace(/\s+/g, " ");
    if (!q) return false;
    if (seen.has(q)) return false;
    seen.add(q);
    return true;
  });
}

function shouldUseComicVine(input: RecommenderInput): boolean {
  const sourceEnabled = resolveSourceEnabled(input);
  return sourceEnabled.comicVine;
}


function buildComicVineFacetRungs(tagCounts: RecommenderInput["tagCounts"] | undefined): Array<{ rung: number; query: string; queryFamily: RouterFamilyKey; laneKind: string; source: EngineId }> {
  const tags = Object.entries(tagCounts || {})
    .filter(([, count]) => Number(count) > 0)
    .map(([tag]) => String(tag || "").toLowerCase());
  const has = (re: RegExp) => tags.some((tag) => re.test(tag));
  const queries: string[] = [];
  const add = (q: string) => {
    const n = String(q || "").trim().toLowerCase();
    if (n && !queries.includes(n)) queries.push(n);
  };

  if (has(/psychological|suspense|thriller|mystery|crime|detective|noir|investigation/)) {
    add("psychological suspense graphic novel");
    add("psychological thriller graphic novel");
  }
  if (has(/horror|dark|haunted|terror|ghost|occult/)) add("dark horror graphic novel");
  if (has(/mystery|crime|detective|noir|investigation/)) add("dark mystery graphic novel");
  if (has(/survival|post apocalyptic|apocalypse|wilderness/)) add("survival graphic novel");
  if (has(/dystopian|future|rebellion|authoritarian/)) add("dystopian graphic novel");
  if (has(/teen|young adult|school|coming of age/)) add("teen psychological graphic novel");
  if (has(/supernatural|paranormal|magic|myth|monster|vampire/)) add("supernatural graphic novel");
  if (!queries.length) {
    add("psychological suspense graphic novel");
    add("dark mystery graphic novel");
    add("supernatural graphic novel");
  }

  return queries.slice(0, 6).map((query, index) => ({ rung: 600 + index, query, queryFamily: "general", laneKind: "comicvine-facet", source: "comicVine" }));
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
  const normalizedSource = String(doc?.source || "").trim().toLowerCase();
  if (normalizedSource === "comicvine_rescue") return "comicVine" as CandidateSource;
  return doc?.source === "googleBooks" ||
    doc?.source === "openLibrary" ||
    doc?.source === "kitsu" ||
    doc?.source === "comicVine"
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
  const ranked = Object.entries(adjusted).filter(([, weightValue]) => weightValue > 0).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const total = ranked.reduce((sum, [, weightValue]) => sum + weightValue, 0) || 1;
  const out: Record<string, number> = {};
  for (const [family, weightValue] of ranked) out[family] = Number((weightValue / total).toFixed(3));
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
    { rung: 50, query: "psychological suspense graphic novel" },
    { rung: 51, query: "detective mystery novel" },
    { rung: 52, query: "police procedural mystery novel" },
    { rung: 53, query: "psychological mystery novel" },
  ];
  if (family === "horror") return [
    { rung: 60, query: "psychological horror graphic novel" },
    { rung: 61, query: "haunted house horror graphic novel" },
    { rung: 62, query: "survival horror graphic novel" },
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
    family === "horror" && /psychological/.test(lowered) ? "psychological horror graphic novel" : "",
    family === "horror" && /haunted|ghost/.test(lowered) ? "haunted house horror novel" : "",
    family === "speculative" && /psychological/.test(lowered) ? "dark psychological fiction novel" : "",
    family === "speculative" && /horror/.test(lowered) ? "literary horror novel" : "",
    family === "mystery" && /psychological/.test(lowered) ? "psychological mystery novel" : "",
    family === "mystery" && /murder|investigation|detective/.test(lowered) ? "detective mystery novel" : "",
    family === "mystery" && /murder|investigation|police|procedural/.test(lowered) ? "police procedural mystery novel" : "",
    family === "mystery" && !/private investigator/.test(lowered) ? "private investigator mystery novel" : "",
    family === "thriller" && /psychological/.test(lowered) ? "psychological suspense graphic novel" : "",
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
        "psychological horror graphic novel";
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
  const HARDCOVER_LOOKUP_LIMIT = 4;
  const HARDCOVER_LOOKUP_TIMEOUT_MS = 1200;

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

        const data = await Promise.race([
          getHardcoverRatings(title, author),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), HARDCOVER_LOOKUP_TIMEOUT_MS)),
        ]);
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
  const OPEN_LIBRARY_PREFILTER_LIMIT = 6;
  const HARDCOVER_LOOKUP_TIMEOUT_MS = 1200;

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

        const data = await Promise.race([
          getHardcoverRatings(title, author),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), HARDCOVER_LOOKUP_TIMEOUT_MS)),
        ]);
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
  return getComicVineGraphicNovelRecommendations(routedInput);
}

async function fetchBothEngines(
  input: RecommenderInput
): Promise<{
  google: RecommendationResult | null;
  openLibrary: RecommendationResult | null;
  kitsu: RecommendationResult | null;
  comicVine: RecommendationResult | null;
  mergedDocs: RecommendationDoc[];
}> {
  const requests: Array<Promise<RecommendationResult>> = [
    runEngine("googleBooks", input),
    runEngine("openLibrary", input),
  ];

  const includeKitsu = shouldUseKitsu(input);
  const includeComicVine = shouldUseComicVine(input);

  if (includeKitsu) requests.push(getKitsuMangaRecommendations(input));
  if (includeComicVine) requests.push(getComicVineGraphicNovelRecommendations(input));

  const results = await Promise.allSettled(requests);

  const google = results[0]?.status === "fulfilled" ? results[0].value : null;
  const openLibrary = results[1]?.status === "fulfilled" ? results[1].value : null;

  const kitsuIndex = includeKitsu ? 2 : -1;
  const comicVineIndex = includeComicVine ? (includeKitsu ? 3 : 2) : -1;

  const kitsu = kitsuIndex >= 0 && results[kitsuIndex]?.status === "fulfilled"
    ? results[kitsuIndex].value
    : null;

  const comicVine = comicVineIndex >= 0 && results[comicVineIndex]?.status === "fulfilled"
    ? results[comicVineIndex].value
    : null;

  const googleDocs = dedupeDocs(extractDocs(google, "googleBooks"));
  const openLibraryDocs = dedupeDocs(extractDocs(openLibrary, "openLibrary"));
  const kitsuDocs = dedupeDocs(extractDocs(kitsu, "kitsu"));
  const comicVineDocs = dedupeDocs(extractDocs(comicVine, "comicVine"));

  // Gold-standard router rule:
  // merge first, dedupe once, do not let one engine overwrite another’s shelf.
  const mergedDocs = dedupeDocs([
    ...googleDocs,
    ...openLibraryDocs,
    ...kitsuDocs,
    ...comicVineDocs,
  ]);

  return { google, openLibrary, kitsu, comicVine, mergedDocs };
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
  const rankedLaneWeights = Object.entries(hybridLaneWeights || {})
    .map(([family, weight]) => ({ family: normalizeRouterFamilyValue(family), weight: Number(weight || 0) }))
    .filter((entry) => entry.family && entry.weight > 0)
    .sort((a, b) => b.weight - a.weight);
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
  let googleQuotaExhausted = false;

  if (!sourceEnabled.googleBooks) sourceSkippedReason.push("googleBooks_disabled_by_admin");
  if (!sourceEnabled.openLibrary) sourceSkippedReason.push("openLibrary_disabled_by_admin");
  const comicVineProxyUrlRaw = String(process.env.EXPO_PUBLIC_COMICVINE_PROXY_URL ?? "").trim();
  const normalizedComicVineProxyUrl = comicVineProxyUrlRaw && comicVineProxyUrlRaw !== "undefined" && comicVineProxyUrlRaw !== "null"
    ? comicVineProxyUrlRaw
    : "/api/comicvine";
  const comicVineProxyUrl = normalizedComicVineProxyUrl || "/api/comicvine";
  const comicVineKeyDetected = false;
  const comicVineEnvVarPresent = false;
  const comicVineEnabledRuntime = Boolean(sourceEnabled.comicVine === true && comicVineProxyUrl);
  if ((routedInput as any)?.sourceEnabled?.comicVine !== false && process.env.NODE_ENV === "production" && !comicVineEnabledRuntime) {
    sourceSkippedReason.push("comicvine_disabled_in_production");
  } else if (!sourceEnabled.comicVine) {
    sourceSkippedReason.push("comicvine_disabled_by_admin");
  }
  if (!sourceEnabled.localLibrary) {
    sourceSkippedReason.push(
      routedInput.localLibrarySupported ? "localLibrary_disabled_by_admin" : "localLibrary_not_supported"
    );
  }
  if (!sourceEnabled.googleBooks && !sourceEnabled.openLibrary && !sourceEnabled.localLibrary && !sourceEnabled.kitsu && !sourceEnabled.comicVine) {
    throwSourceFatal("SESSION_FATAL_ALL_SOURCES_DISABLED", {
      sourceEnabled,
      sourceEnabledOrigins: buildSourceOrigins((routedInput as any)?.sourceEnabled || {}),
      routerFamily,
      builtQuery: bucketPlan.preview || bucketPlan.queries?.[0] || "",
      deckKey: routedInput.deckKey,
      sourceSkippedReason,
    });
  }

  const kitsuEligibility = resolveKitsuEligibility(routedInput);
  const includeKitsu = sourceEnabled.kitsu;
  const includeComicVine = shouldUseComicVine(routedInput);
  const hasRunnableSource = sourceEnabled.googleBooks || sourceEnabled.openLibrary || sourceEnabled.localLibrary || includeKitsu || includeComicVine;

  if (routedInput.deckKey === "ms_hs" && sourceEnabled.comicVine && !sourceEnabled.googleBooks && !sourceEnabled.openLibrary && !sourceEnabled.localLibrary && !sourceEnabled.kitsu) {
    debugRouterLog("COMICVINE_ONLY_SMOKE_PATH", { deckKey: routedInput.deckKey, includeComicVine });
  }
  if (!hasRunnableSource) {
    throwSourceFatal("SESSION_FATAL_ALL_SOURCES_DISABLED_AFTER_SYNTHESIS", {
      sourceEnabled,
      sourceEnabledOrigins: buildSourceOrigins((routedInput as any)?.sourceEnabled || {}),
      routerFamily,
      builtQuery: bucketPlan.preview || bucketPlan.queries?.[0] || "",
      deckKey: routedInput.deckKey,
      sourceSkippedReason,
    });
  }
  const debugRouterVersion = "router-comicvine-proxy-default-v1";
  const deploymentRuntimeMarker = "comicvine-proxy-phase" as const;
  if (sourceEnabled.comicVine && !includeComicVine) sourceSkippedReason.push("comicvine_not_queried_by_router_gate");
  const tasteAxes: any = (input as any)?.tasteProfile || {};
  const rawNegatives = [
    ...Object.keys((input as any)?.dislikedTagCounts || {}),
    ...Object.keys((input as any)?.leftTagCounts || {}),
    ...((input as any)?.negativeTags || []),
    ...((input as any)?.dislikedTags || []),
  ]
    .map((v) => String(v || "").toLowerCase())
    .filter(Boolean);
  const negativeSuppressionTerms = [
    rawNegatives.some((t) => /ya|young adult|teen/.test(t)) ? "-young -teen -ya" : "",
    rawNegatives.some((t) => /romance|sentimental/.test(t)) ? "-romance -sentimental" : "",
    rawNegatives.some((t) => /pulp|formula|series/.test(t)) ? "-pulp -formulaic -tie-in" : "",
    rawNegatives.some((t) => /adventure|ensemble/.test(t)) ? "-ensemble -quest" : "",
  ].filter(Boolean).join(" ");
  const nonGenreToneHints = [
    Number(tasteAxes?.warmth || 0) > 0.2 ? "warm hopeful" : "",
    Number(tasteAxes?.warmth || 0) < -0.2 ? "sharp cynical" : "",
    Number(tasteAxes?.darkness || 0) > 0.2 ? "dark intense" : "",
    Number(tasteAxes?.darkness || 0) < -0.2 ? "gentle low-stakes" : "",
    Number(tasteAxes?.pacing || 0) > 0.2 ? "fast paced" : "",
    Number(tasteAxes?.pacing || 0) < -0.2 ? "slow burn" : "",
    Number(tasteAxes?.realism || 0) > 0.2 ? "grounded realistic" : "",
    Number(tasteAxes?.realism || 0) < -0.2 ? "speculative uncanny" : "",
    Number(tasteAxes?.ideaDensity || 0) > 0.2 ? "philosophical ideas" : "",
    Number(tasteAxes?.characterFocus || 0) > 0.2 ? "character driven emotional" : "",
  ].filter(Boolean);

  const tasteVector = {
    grounded: Number(tasteAxes?.realism || 0) > 0.1 ? 0.7 : 0.35,
    stylized: Number(tasteAxes?.realism || 0) < -0.1 ? 0.65 : 0.45,
    intensity: Math.max(0, Number(tasteAxes?.darkness || 0)),
    pacing: Number(tasteAxes?.pacing || 0),
    emotionalWeight: Math.max(0, Number(tasteAxes?.characterFocus || 0)),
    romance: rawNegatives.some((t) => /romance|sentimental/.test(t)) ? -0.8 : 0.3,
    horror: rawNegatives.some((t) => /horror|spooky|stranger things/.test(t)) ? -1.0 : 0.25,
    coziness: rawNegatives.some((t) => /cozy|comfort/.test(t)) ? -0.7 : 0.2,
    aestheticDistinctiveness: Number(tasteAxes?.ideaDensity || 0) > 0.15 ? 0.75 : 0.45,
  };
  const scoredAxes = [
    { key: "intensity", value: tasteVector.intensity, phrase: tasteVector.intensity > 0.45 ? "high stakes thriller" : "suspense mystery" },
    { key: "structure", value: tasteVector.emotionalWeight, phrase: tasteVector.emotionalWeight > 0.4 ? "character driven thriller" : "investigative mystery" },
    { key: "setting", value: Math.max(tasteVector.grounded, tasteVector.stylized), phrase: tasteVector.grounded > tasteVector.stylized ? "grounded suspense setting" : "supernatural suspense setting" },
    { key: "pace", value: Math.abs(tasteVector.pacing), phrase: tasteVector.pacing > 0.2 ? "fast paced thriller" : "slow burn mystery" },
  ].sort((a, b) => b.value - a.value);
  const strongA = [scoredAxes[0]?.phrase, scoredAxes[1]?.phrase, "crime suspense stakes"].filter(Boolean);
  const strongB = [scoredAxes[2]?.phrase, scoredAxes[3]?.phrase, "psychological suspense"].filter(Boolean);
  const exploratory = [
    tasteVector.stylized > 0.55 ? "slightly surreal" : "atmospheric psychological",
    tasteVector.pacing > 0.2 ? "slower introspective counterpoint" : "tighter momentum counterpoint",
    "adult distinct-voice fiction",
  ];
  const rawClusters = [strongA, strongB, exploratory];
  const dedupedClusters: string[][] = [];
  for (const cluster of rawClusters) {
    const set = new Set(cluster.map((p) => String(p).toLowerCase().trim()));
    const overlaps = dedupedClusters.some((existing) => existing.filter((p) => set.has(String(p).toLowerCase().trim())).length >= 2);
    if (!overlaps) dedupedClusters.push(cluster);
  }
  while (dedupedClusters.length < 3) {
    dedupedClusters.push(["isolated setting", "psychological endurance", "non-romantic tension narrative"]);
  }
  const tasteClusterQueries = dedupedClusters.flatMap((parts, clusterIdx) => {
    const base = `${parts.join(" ")} novel ${negativeSuppressionTerms}`.replace(/\s+/g, " ").trim();
    const retrievalSignals = [
      "environmental pressure setting",
      "psychological isolation consequence",
      "procedural problem-solving under stress",
    ];
    const variants = [
      `${base} ${retrievalSignals[0]}`.replace(/\s+/g, " ").trim(),
      `${parts[0]} ${parts[1]} survival consequence graphic novel ${negativeSuppressionTerms} ${retrievalSignals[1]}`.replace(/\s+/g, " ").trim(),
      `${parts[0]} ${parts[2]} narrative novel ${negativeSuppressionTerms} ${retrievalSignals[2]}`.replace(/\s+/g, " ").trim(),
    ];
    return variants.slice(0, 3).map((query) => ({ query, clusterId: `c${clusterIdx + 1}` }));
  });

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
        bucketPlan?.signals?.genres?.[0] ||
        bucketPlan?.queries?.[0] ||
        bucketPlan?.preview ||
        "character driven fiction",
      subgenres: bucketPlan?.queries?.length
        ? bucketPlan.queries
        : (bucketPlan?.signals?.genres || []),
      tones: [...(bucketPlan?.signals?.tones || []), ...nonGenreToneHints],
      themes: bucketPlan?.signals?.scenarios || [],
    })
  );
  if (tasteClusterQueries.length) {
    const clusterRungs = tasteClusterQueries.slice(0, 6).map((entry, index) => ({
      rung: 700 + index,
      query: entry.query,
      queryFamily: "general",
      laneKind: "taste-cluster",
      clusterSource: "session-profile",
      clusterId: entry.clusterId,
    }));
    rungs = [...clusterRungs, ...rungs];
  }


  const buildComicVineFacetRungsCalled = includeComicVine;
  const comicVineFacetRungs = includeComicVine ? buildComicVineFacetRungs(routedInput.tagCounts) : [];
  const kitsuRungs = includeKitsu ? buildKitsuRungs(routedInput.tagCounts) : [];
  if (comicVineFacetRungs.length) {
    rungs = [...comicVineFacetRungs, ...rungs];
  }

  rungs = dedupeRungs(rungs as any);

  if (!rungs.length && routerFamily === "mystery") {
    rungs = [
      { rung: 0, query: "psychological suspense graphic novel" },
      { rung: 1, query: "detective mystery graphic novel" },
      { rung: 2, query: "police procedural mystery graphic novel" },
      { rung: 3, query: "psychological mystery graphic novel" },
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
      "psychological thriller graphic novel",
      "crime thriller graphic novel",
      "mystery suspense graphic novel",
      "detective fiction graphic novel",
    ],
    mystery: [
      "psychological thriller graphic novel",
      "crime thriller graphic novel",
      "mystery suspense graphic novel",
      "detective fiction graphic novel",
    ],
    horror: [
      "psychological horror graphic novel",
      "haunted house horror graphic novel",
      "supernatural horror graphic novel",
      "gothic horror graphic novel",
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
  if (isTeenDeckKey(input.deckKey)) {
    applyTeenCanonicalRungOverrides(canonicalFamilyRungs);
  } else {
    applyAdultCanonicalRungOverrides(canonicalFamilyRungs);
  }
  const canonicalHistoricalQueries = [
    "historical fiction novel",
    "19th century historical fiction novel",
    "war historical fiction novel",
    "society historical fiction novel",
  ];
  if (new Set(canonicalHistoricalQueries).size !== canonicalHistoricalQueries.length) {
    throw new Error("Duplicate historical queries generated");
  }

  const historicalIntentInRungs = rungs.some((r: any) =>
    /\b(historical fiction|historical novel|19th century|war historical fiction|society historical fiction|period fiction|civil war|gilded age|victorian)\b/.test(
      String(r?.query || r?.primary || "").toLowerCase()
    )
  );
  const historicalWeight = Number((hybridLaneWeights as any)?.historical || 0);
  const lockHistoricalRungs = (routerFamily === "historical" || historicalIntentInRungs) && historicalWeight >= 0.55;
  if (lockHistoricalRungs) {
    rungs = canonicalHistoricalQueries.map((query, index) => ({ rung: index, query, queryFamily: "historical" }));
  }

  const forcedRungs = canonicalFamilyRungs[routerFamily];
  if (forcedRungs?.length && !isHybridMode) {
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
  if (lockHistoricalRungs) {
    rungs = canonicalHistoricalQueries.map((query, index) => ({ rung: index, query, queryFamily: "historical" }));
    if (new Set(rungs.map((r: any) => r.query)).size !== 4) {
      throw new Error("Historical queries collapsed");
    }
    console.log("HISTORICAL RUNG QUERIES", rungs.map((r: any) => r.query));
  }


  if (isHybridMode || rankedLaneWeights.length > 1) {
    const existingKeys = new Set(rungs.map((r: any) => normalizeQueryKey(r?.query)));
    for (const entry of rankedLaneWeights) {
      const normalizedFamily = normalizeRouterFamilyValue(entry.family);
      if (!normalizedFamily || normalizedFamily === routerFamily) continue;
      for (const rung of fallbackRungsForRouterFamily(normalizedFamily).slice(0, entry.weight >= 0.28 ? 2 : 1)) {
        const key = normalizeQueryKey(rung.query);
        if (!key || existingKeys.has(key)) continue;
        existingKeys.add(key);
        rungs.push({ ...rung, hybridFamily: normalizedFamily, laneKind: "taste-cluster" });
      }
    }
  }

  if (lockHistoricalRungs) {
    rungs = canonicalHistoricalQueries.map((query, index) => ({ rung: index, query, queryFamily: "historical" }));
    if (new Set(rungs.map((r: any) => r.query)).size !== 4) {
      throw new Error("Historical queries collapsed");
    }
    console.log("HISTORICAL RUNG QUERIES", rungs.map((r: any) => r.query));
  }

  rungs = rungs.map((r: any) => ({
    ...r,
    laneKind: (r as any)?.laneKind || "precision",
    queryFamily: normalizeRouterFamilyValue((r as any)?.queryFamily) || "general",
  }));

  // Performance guardrail: avoid exploding fetch fan-out on broad hybrid sessions.
  const uniqueRungQueries = Array.from(new Set(rungs.map((r: any) => String(r?.query || "").trim()).filter(Boolean)));
  if (uniqueRungQueries.length < 3) {
    const teenLaneFamily = isTeenDeckKey(input.deckKey) ? inferTeenLaneFromFacets(input.tagCounts, routerFamily) : routerFamily;
    const expansion = isTeenDeckKey(input.deckKey) ? teenExpansionQueries(teenLaneFamily) : adultExpansionQueries(routerFamily);
    for (const entry of expansion) {
      if (!uniqueRungQueries.includes(entry.query)) rungs.push({ ...entry, rung: 900 + rungs.length });
    }
  }
  const familyAngles: Record<string, string[]> = {
    horror: ["psychological horror graphic novel", "isolation survival horror graphic novel", "identity-driven unsettling graphic novel"],
    thriller: ["high-pressure moral suspense novel", "isolation survival thriller novel", "identity-driven conspiracy narrative novel"],
    mystery: ["psychological investigation novel", "isolated case-file mystery novel", "identity-driven detective narrative novel"],
  };
  if (isTeenDeckKey(input.deckKey)) {
    familyAngles.horror = ["teen social horror thriller", "young adult survival horror", "young adult eerie identity suspense"];
    familyAngles.thriller = ["young adult school mystery thriller", "young adult fast-paced survival thriller", "young adult identity conflict thriller"];
    familyAngles.mystery = ["young adult paranormal school mystery", "young adult friendship investigation mystery", "young adult coming of age mystery"];
  }
  const requiredAngles = familyAngles[routerFamily] || ["character-driven pressure narrative novel", "isolation consequence story novel", "identity conflict distinct-voice novel"];
  const existingQuerySet = new Set(rungs.map((r: any) => String(r?.query || "").trim().toLowerCase()).filter(Boolean));
  for (const angle of requiredAngles) {
    const key = angle.toLowerCase();
    if (!existingQuerySet.has(key)) {
      rungs.push({ rung: 950 + rungs.length, query: angle, queryFamily: routerFamily, laneKind: "cluster-expansion" });
      existingQuerySet.add(key);
    }
  }
  rungs = rungs.filter((r: any, index: number, arr: any[]) => {
    const q = String(r?.query || "").trim().toLowerCase();
    return q && arr.findIndex((x: any) => String(x?.query || "").trim().toLowerCase() === q) === index;
  });
  rungs = rungs.slice(0, 9);

  const rungQueries = rungs.map((r: any) => String(r?.query || "").trim()).filter(Boolean);
  const mainRungQueriesLength = rungQueries.length;
  if (sourceEnabled.comicVine && rungQueries.length === 0) {
    throw new Error("COMICVINE_ENABLED_WITHOUT_RUNG_QUERIES: sourceEnabled.comicVine=true but no rung queries were built.");
  }

  let google: RecommendationResult | null = null;
  let openLibrary: RecommendationResult | null = null;
  let kitsu: RecommendationResult | null = null;
  let comicVine: RecommendationResult | null = null;
  const allMergedDocs: RecommendationDoc[] = [];
  const debugRawPool: any[] = [];
  const aggregatedRawFetched = {
    googleBooks: 0,
    openLibrary: 0,
    kitsu: 0,
    comicVine: 0,
  };
  const comicVineQueryTexts = new Set<string>();
  const comicVineRungsBuilt = new Set<string>();
  const comicVineQueriesActuallyFetched = new Set<string>();
  const comicVineFetchResults: Array<{ query: string; status: string; rawCount: number; error: string | null }> = [];
  const comicVineRawCountByQuery: Record<string, number> = {};
  const comicVineAcceptedCountByQuery: Record<string, number> = {};
  const comicVineRejectedCountByQuery: Record<string, number> = {};
  const comicVineTopTitlesByQuery: Record<string, string[]> = {};
  const comicVineSampleTitlesByQuery: Record<string, string[]> = {};
  const comicVineRejectedSampleTitlesByQuery: Record<string, string[]> = {};
  const comicVineRejectedSampleReasonsByQuery: Record<string, Array<{ title: string; reason: string }>> = {};
  const comicVineAdapterDropReasonsByQuery: Record<string, Record<string, number>> = {};
  const comicVineRescueRejectedTitlesByQuery: Record<string, Array<{ title: string; reason: string }>> = {};
  let comicVineAdapterFailed = false;
  let comicVineAdapterStatus: RecommendationResult["comicVineAdapterStatus"] = includeComicVine ? "ok" : "disabled";
  let comicVineDispatchedOnce = false;
  let comicVineResolvedSeedQuery = "";
  let comicVineFallbackReason = "none";
  let comicVineUsedFallbackQuery = false;
  let comicVinePositiveQueries: string[] = [];
  let comicVineExcludedTermsAppliedInFilterOnly = false;
  let comicVineQueryTooLong = false;

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
      const laneKindResolved =
        String((lane as any)?.laneKind || "").toLowerCase() === "historical" || laneFamily === "historical" || laneFilterFamily === "historical"
          ? "historical"
          : String((lane as any)?.laneKind || "core");
      const laneQueryFamilyResolved = laneKindResolved === "historical" ? "historical" : laneFamily;
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
      const effectiveLaneSource =
        googleQuotaExhausted && lane.source === "googleBooks" && sourceEnabled.openLibrary
          ? "openLibrary"
          : lane.source;
      if (sourceEnabled.googleBooks && !googleQuotaExhausted && effectiveLaneSource === "googleBooks") requests.push(runEngine("googleBooks", laneInput));
      if (sourceEnabled.openLibrary && effectiveLaneSource === "openLibrary") requests.push(runEngine("openLibrary", laneInput));
      if (includeKitsu) requests.push(getKitsuMangaRecommendations(laneInput));
      const shouldDispatchComicVineForLane = includeComicVine && !comicVineAdapterFailed && !comicVineDispatchedOnce;
      const comicVineDispatchedOnThisLane = shouldDispatchComicVineForLane;
      if (shouldDispatchComicVineForLane) {
        requests.push(getComicVineGraphicNovelRecommendations(routedInput));
        comicVineDispatchedOnce = true;
      }
      if (includeComicVine) comicVineQueryTexts.add("comicvine_adapter");

      const results = await Promise.allSettled(requests);
      debugRouterLog("QUERY_FAMILY_AFTER_FETCH", {
        query: (lane as any)?.query,
        laneFamily,
        filterFamily: laneFamily,
      });
      let index = 0;

      const laneGoogle = sourceEnabled.googleBooks && !googleQuotaExhausted && effectiveLaneSource === "googleBooks" && results[index]?.status === "fulfilled"
        ? (results[index] as PromiseFulfilledResult<RecommendationResult>).value
        : null;
      if (sourceEnabled.googleBooks && !googleQuotaExhausted && effectiveLaneSource === "googleBooks") {
        if (results[index]?.status === "rejected" && isGoogleQuotaError((results[index] as PromiseRejectedResult).reason)) {
          googleQuotaExhausted = true;
          sourceSkippedReason.push("googleBooks_quota_exhausted_auto_disabled");
          debugRouterLog("GOOGLE_BOOKS_AUTO_DISABLED_QUOTA", { query: lane.query });
        }
        index += 1;
      }

      const laneOpenLibrary = sourceEnabled.openLibrary && effectiveLaneSource === "openLibrary" && results[index]?.status === "fulfilled"
        ? (results[index] as PromiseFulfilledResult<RecommendationResult>).value
        : null;
      if (sourceEnabled.openLibrary && effectiveLaneSource === "openLibrary") index += 1;

      const laneKitsu = includeKitsu && results[index]?.status === "fulfilled"
        ? (results[index] as PromiseFulfilledResult<RecommendationResult>).value
        : null;
      if (includeKitsu) index += 1;

      const laneComicVine = comicVineDispatchedOnThisLane && results[index]?.status === "fulfilled"
        ? (results[index] as PromiseFulfilledResult<RecommendationResult>).value
        : null;
      if (comicVineDispatchedOnThisLane) {
        const gcdResult = results[index];
        const query = "comicvine_adapter";
        if (gcdResult?.status === "fulfilled") {
          const value: any = (gcdResult as PromiseFulfilledResult<RecommendationResult>).value;
          for (const queryText of (value?.comicVineQueryTexts || [])) comicVineQueryTexts.add(String(queryText || "").trim());
          if (!comicVineResolvedSeedQuery && typeof value?.comicVineResolvedSeedQuery === "string") comicVineResolvedSeedQuery = value.comicVineResolvedSeedQuery;
          if (typeof value?.comicVineFallbackReason === "string") comicVineFallbackReason = value.comicVineFallbackReason;
          if (typeof value?.comicVineUsedFallbackQuery === "boolean") comicVineUsedFallbackQuery = value.comicVineUsedFallbackQuery;
          if (Array.isArray(value?.comicVinePositiveQueries)) comicVinePositiveQueries = value.comicVinePositiveQueries.map((q:any)=>String(q||"").trim()).filter(Boolean);
          if (typeof value?.comicVineExcludedTermsAppliedInFilterOnly === "boolean") comicVineExcludedTermsAppliedInFilterOnly = value.comicVineExcludedTermsAppliedInFilterOnly;
          if (typeof value?.comicVineQueryTooLong === "boolean") comicVineQueryTooLong = value.comicVineQueryTooLong;
          for (const queryText of (value?.comicVineRungsBuilt || [])) comicVineRungsBuilt.add(String(queryText || "").trim());
          for (const queryText of (value?.comicVineQueriesActuallyFetched || [])) comicVineQueriesActuallyFetched.add(String(queryText || "").trim());
          if (Array.isArray(value?.comicVineFetchResults) && value.comicVineFetchResults.length) {
            for (const row of value.comicVineFetchResults) {
              comicVineFetchResults.push({
                query: String(row?.query || query || "").trim(),
                status: String(row?.status || "ok"),
                rawCount: Number(row?.rawCount || 0),
                error: row?.error ? String(row.error) : null,
              });
            }
            Object.assign(comicVineRawCountByQuery, value?.comicVineRawCountByQuery || {});
            Object.assign(comicVineAcceptedCountByQuery, value?.comicVineAcceptedCountByQuery || {});
            Object.assign(comicVineRejectedCountByQuery, value?.comicVineRejectedCountByQuery || {});
            Object.assign(comicVineTopTitlesByQuery, value?.comicVineTopTitlesByQuery || {});
            Object.assign(comicVineSampleTitlesByQuery, value?.comicVineSampleTitlesByQuery || {});
            Object.assign(comicVineRejectedSampleTitlesByQuery, value?.comicVineRejectedSampleTitlesByQuery || {});
            Object.assign(comicVineRejectedSampleReasonsByQuery, value?.comicVineRejectedSampleReasonsByQuery || {});
            Object.assign(comicVineAdapterDropReasonsByQuery, value?.comicVineAdapterDropReasonsByQuery || {});
            Object.assign(comicVineRescueRejectedTitlesByQuery, value?.comicVineRescueRejectedTitlesByQuery || {});
          } else {
            comicVineFetchResults.push({
              query,
              status: "ok",
              rawCount: Number(value?.debugRawFetchedCount ?? countResultItems(value)),
              error: null,
            });
          }
        } else if (gcdResult?.status === "rejected") {
          const reason: any = (gcdResult as PromiseRejectedResult).reason;
          comicVineAdapterFailed = true;
          const reasonText = String(reason?.message || reason || "comicvine_fetch_failed");
          comicVineAdapterStatus = reasonText.includes("403") ? "proxy_403" : "proxy_error";
          comicVineFetchResults.push({
            query,
            status: "error",
            rawCount: 0,
            error: reasonText,
          });
        }
      }

      const laneMergedDocs = dedupeDocs([
        ...dedupeDocs(extractDocs(laneGoogle, "googleBooks")),
        ...dedupeDocs(extractDocs(laneOpenLibrary, "openLibrary")),
        ...(includeKitsu ? dedupeDocs(extractDocs(laneKitsu, "kitsu")) : []),
        ...(laneComicVine ? dedupeDocs(extractDocs(laneComicVine, "comicVine")) : []),
      ]);

      if (!google && laneGoogle) google = laneGoogle;
      if (!openLibrary && laneOpenLibrary) openLibrary = laneOpenLibrary;
      if (!kitsu && laneKitsu) kitsu = laneKitsu;
      if (!comicVine && laneComicVine) comicVine = laneComicVine;

      aggregatedRawFetched.googleBooks += Number((laneGoogle as any)?.debugRawFetchedCount ?? countResultItems(laneGoogle));
      aggregatedRawFetched.openLibrary += Number((laneOpenLibrary as any)?.debugRawFetchedCount ?? countResultItems(laneOpenLibrary));
      aggregatedRawFetched.kitsu += Number((laneKitsu as any)?.debugRawFetchedCount ?? countResultItems(laneKitsu));
      aggregatedRawFetched.comicVine += Number((laneComicVine as any)?.debugRawFetchedCount ?? countResultItems(laneComicVine));

      const laneRawPool = [
        ...(((laneGoogle as any)?.debugRawPool as any[]) || []),
        ...(((laneOpenLibrary as any)?.debugRawPool as any[]) || []),
        ...(((laneKitsu as any)?.debugRawPool as any[]) || []),
        ...(((laneComicVine as any)?.debugRawPool as any[]) || []),
      ].map((row: any) => {
        const queryRung = Number.isFinite(Number(lane.queryRung))
          ? Number(lane.queryRung)
          : Number.isFinite(Number(rung?.rung))
          ? Number(rung.rung)
          : undefined;
        const rowFamilyFromQuery = routerFamily === "historical"
          ? "historical"
          : inferFamilyFromQueryText(String(row?.queryText ?? lane.query ?? ""), laneFamily);
        const rowHistoricalSignal = inferHistoricalFromQueryText(String(row?.queryText ?? lane.query ?? "")) || laneKindResolved === "historical";
        const rowQueryFamily =
          rowHistoricalSignal
            ? "historical"
            : normalizeRouterFamilyValue(row?.queryFamily) || rowFamilyFromQuery || laneQueryFamilyResolved;
        const rowFilterFamily =
          rowHistoricalSignal
            ? "historical"
            : normalizeRouterFamilyValue(row?.filterFamily) || rowFamilyFromQuery || laneFilterFamily;

        return {
          ...row,
          queryRung,
          queryText: row?.queryText ?? laneQueryText,
          queryFamily: rowQueryFamily,
          hybridLaneWeights,
          primaryLane: routerFamily,
          laneKind: (rowQueryFamily === "historical" || rowFilterFamily === "historical") ? "historical" : laneKindResolved,
          filterFamily: rowFilterFamily,
        };
      });

      debugRawPool.push(...laneRawPool);

      const taggedDocs = laneMergedDocs.map((doc: any) => {
        const laneQueryRung = Number.isFinite(Number(lane.queryRung))
          ? Number(lane.queryRung)
          : Number.isFinite(Number(rung?.rung))
          ? Number(rung.rung)
          : undefined;
        const docQueryText = String(doc?.queryText || "").trim();
        const docQueryRung = Number.isFinite(Number(doc?.queryRung)) ? Number(doc.queryRung) : undefined;
        const rowHistoricalSignal =
          laneKindResolved === "historical" ||
          inferHistoricalFromQueryText(docQueryText || laneQueryText) ||
          String(doc?.filterFamily || "").toLowerCase() === "historical" ||
          String(doc?.laneKind || "").toLowerCase() === "historical";

        const candidateQueryFamily = rowHistoricalSignal
          ? "historical"
          : normalizeRouterFamilyValue(doc?.queryFamily) || laneQueryFamilyResolved;
        const candidateFilterFamily = rowHistoricalSignal
          ? "historical"
          : normalizeRouterFamilyValue(doc?.filterFamily) || laneFilterFamily;
        const candidateLaneKind = rowHistoricalSignal
          ? "historical"
          : String(doc?.laneKind || laneKindResolved || "core");

        const queryText = docQueryText || laneQueryText;
        const queryRung = typeof docQueryRung === "number" ? docQueryRung : laneQueryRung;
        return {
          ...doc,
          queryRung,
          queryText,
          queryFamily: candidateQueryFamily,
          hybridLaneWeights,
          primaryLane: routerFamily,
          laneKind: candidateLaneKind,
          filterFamily: candidateFilterFamily,
          diagnostics: {
            ...(doc?.diagnostics || {}),
            queryRung,
            queryText,
            queryFamily: candidateQueryFamily,
            laneKind: candidateLaneKind,
            filterFamily: candidateFilterFamily,
            hybridLaneWeights,
            primaryLane: routerFamily,
          },
        };
      });

      allMergedDocs.push(...taggedDocs);
    }
  }

  const mergedDocs = dedupeDocs(allMergedDocs);
  const comicVineFetchAttemptedFlag = includeComicVine && mainRungQueriesLength > 0;
  const comicVineFetchAttempted = Boolean(comicVineEnabledRuntime && comicVineFetchAttemptedFlag);
  const proxyHealthError = comicVineFetchResults.find((row) => String(row?.status || "").toLowerCase().includes("rejected") || row?.error)?.error || null;
  const proxyHealthStatus: "ok" | "failed" | "unknown" =
    !includeComicVine ? "unknown" : proxyHealthError ? "failed" : "ok";
  const kitsuFetchAttempted = Boolean(includeKitsu);
  if (sourceEnabled.comicVine && includeComicVine && aggregatedRawFetched.comicVine === 0) {
    const missingProxy = comicVineFetchResults.some((row) => String(row?.error || "").includes("EXPO_PUBLIC_COMICVINE_PROXY_URL"));
    sourceSkippedReason.push(missingProxy ? "comicvine_proxy_missing" : "comicvine_enabled_but_not_queried");
  }
  if (comicVineAdapterStatus === "proxy_403") sourceSkippedReason.push("comicvine_preflight_proxy_403");

  if (googleQuotaExhausted) sourceEnabled.googleBooks = false;

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
  const negativeSignals = new Set(
    [
      ...Object.keys((routingInput as any)?.dislikedTagCounts || {}),
      ...Object.keys((routingInput as any)?.leftTagCounts || {}),
      ...((routingInput as any)?.negativeTags || []),
    ].map((v) => String(v || "").toLowerCase())
  );
  if (candidateDocs.length < 15) {
    const expansionPool = enrichedDocs.filter((doc: any) => {
      const family = normalizeRouterFamilyValue(doc?.queryFamily || doc?.diagnostics?.queryFamily || doc?.filterFamily);
      if (routerFamily !== "general" && family && family !== routerFamily) return false;
      const text = String(doc?.title || "") + " " + String(doc?.description || "");
      return /\b(novel|fiction|story|narrative|mystery|thriller|horror|speculative|literary)\b/i.test(text);
    });
    candidateDocs = dedupeDocs([...candidateDocs, ...expansionPool]).slice(0, 40);
    debugRouterLog("POOL_EXPANSION_TRIGGERED", { filteredCount: filteredDocs.length, expandedCount: candidateDocs.length });
  }
  const fantasySuppressed =
    negativeSignals.has("fantasy romance") ||
    negativeSignals.has("cozy fantasy") ||
    negativeSignals.has("epic fantasy") ||
    negativeSignals.has("fantasy adventure");
  if (fantasySuppressed) {
    candidateDocs = candidateDocs.filter((doc: any) => {
      const family = normalizeRouterFamilyValue(doc?.queryFamily || doc?.diagnostics?.queryFamily || doc?.filterFamily);
      if (family !== "fantasy") return true;
      const text = `${doc?.title || ""} ${doc?.description || ""}`.toLowerCase();
      return /\b(moral conflict|betrayal|consequence|psychological|identity|darkly comic|adult)\b/.test(text);
    });
    debugRouterLog("FANTASY_SUPPRESSION_APPLIED", { countAfter: candidateDocs.length });
  }
  candidateDocs = candidateDocs.filter((doc: any) => {
    const isOpenLibrary = String(doc?.source || doc?.diagnostics?.source || "").toLowerCase().includes("open");
    if (!isOpenLibrary) return true;
    const text = `${doc?.title || ""} ${doc?.description || ""}`.toLowerCase();
    const ratings = Number(doc?.ratingCount || doc?.rawDoc?.ratings_count || doc?.rawDoc?.ratingsCount || 0);
    const editions = Number(doc?.editionCount || doc?.edition_count || doc?.rawDoc?.edition_count || 0);
    const hasAuthor = Boolean(doc?.author || (Array.isArray(doc?.author_name) && doc.author_name.length));
    const sparse = !doc?.hasCover && (!doc?.description || String(doc.description).trim().length < 35) && ratings <= 0 && editions <= 1;
    if (sparse && !hasAuthor) return false;
    if (/\b(best of|year's best|anthology|collection|journal|magazine|reference|library of congress subject headings|poetics of|principles of psychology|catalog|criticism|companion|study guide|handbook)\b/.test(text)) return false;
    return true;
  });
  candidateDocs = candidateDocs.filter((doc: any) => {
    const text = `${doc?.title || ""} ${doc?.description || ""} ${(doc?.subjects || []).join(" ")}`.toLowerCase();
    if (/\b(huckleberry finn|anne of green gables|moby dick|les misérables|les miserables)\b/.test(text)) {
      const source = String(doc?.source || "").toLowerCase();
      const onLane = /\b(young adult|ya|teen|dark fantasy|survival|dystopian|mystery|thriller|horror)\b/.test(text);
      if (source.includes("open") && !onLane) return false;
    }
    if (/\b(library of congress subject headings|catalogue?|bibliograph|literary criticism|reader's guide|teachers? guide|study of)\b/.test(text)) return false;
    return true;
  });
  const uniqueQueryTexts = new Set(candidateDocs.map((doc: any) => String(doc?.queryText || doc?.diagnostics?.queryText || "").trim().toLowerCase()).filter(Boolean));
  const uniqueFamilies = new Set(candidateDocs.map((doc: any) => normalizeRouterFamilyValue(doc?.queryFamily || doc?.diagnostics?.queryFamily || doc?.filterFamily)).filter(Boolean));
  if (uniqueQueryTexts.size <= 1 && uniqueFamilies.size <= 1) {
    debugRouterLog("QUERY_FAMILY_COLLAPSE_DETECTED", { uniqueQueryTexts: uniqueQueryTexts.size, uniqueFamilies: uniqueFamilies.size, count: candidateDocs.length });
    const diversificationBackfill = enrichedDocs.filter((doc: any) => {
      const text = `${doc?.title || ""} ${doc?.description || ""}`.toLowerCase();
      return /\b(novel|fiction|story|psychological|survival|identity|isolation|atmospheric)\b/.test(text);
    });
    candidateDocs = dedupeDocs([...candidateDocs, ...diversificationBackfill]).slice(0, 60);
    debugRouterLog("DIVERSIFICATION_BACKFILL_APPLIED", { afterCount: candidateDocs.length });
  }
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

  const retainedFamilies = (() => {
    const out = new Set<string>([routerFamily]);
    const weighted = Object.entries(hybridLaneWeights || {})
      .filter(([, weight]) => Number(weight) >= 0.24)
      .sort((a, b) => Number(b[1]) - Number(a[1]))
      .slice(0, 2)
      .map(([family]) => String(family));
    for (const family of weighted) out.add(family);
    if (routerFamily === "thriller") out.add("mystery");
    return out;
  })();

  if (!isHybridMode && routerFamily !== "general") {
    candidateDocs = candidateDocs.filter((doc: any) => {
      const family = normalizeRouterFamilyValue(doc?.queryFamily || doc?.diagnostics?.queryFamily || doc?.rawDoc?.queryFamily);
      return !family || retainedFamilies.has(family);
    });
  }

  if (routerFamily === "horror") {
    candidateDocs = candidateDocs.filter((doc: any) => {
      const wantsHorrorTone = Boolean(doc?.diagnostics?.filterWantsHorrorTone ?? doc?.rawDoc?.diagnostics?.filterWantsHorrorTone);
      const horrorAligned = Boolean(doc?.diagnostics?.filterFlags?.horrorAligned ?? doc?.rawDoc?.diagnostics?.filterFlags?.horrorAligned);
      return !wantsHorrorTone || horrorAligned;
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
      queryFamily:
        (String(doc?.laneKind || doc?.rawDoc?.laneKind || "").toLowerCase() === "historical" ||
         String(doc?.filterFamily || doc?.rawDoc?.filterFamily || doc?.diagnostics?.filterFamily || "").toLowerCase() === "historical")
          ? "historical"
          : (normalizeRouterFamilyValue(doc?.queryFamily || doc?.rawDoc?.queryFamily || doc?.diagnostics?.queryFamily || routerFamily) || routerFamily),
      filterFamily:
        (String(doc?.laneKind || doc?.rawDoc?.laneKind || "").toLowerCase() === "historical")
          ? "historical"
          : (normalizeRouterFamilyValue(doc?.filterFamily || doc?.rawDoc?.filterFamily || doc?.diagnostics?.filterFamily || routerFamily) || routerFamily),
      primaryLane: routerFamily,
      diagnostics: {
        ...(doc?.diagnostics || {}),
        queryFamily:
          (String(doc?.laneKind || doc?.rawDoc?.laneKind || "").toLowerCase() === "historical" ||
           String(doc?.filterFamily || doc?.rawDoc?.filterFamily || doc?.diagnostics?.filterFamily || "").toLowerCase() === "historical")
            ? "historical"
            : (normalizeRouterFamilyValue(doc?.queryFamily || doc?.rawDoc?.queryFamily || doc?.diagnostics?.queryFamily || routerFamily) || routerFamily),
        filterFamily:
          (String(doc?.laneKind || doc?.rawDoc?.laneKind || "").toLowerCase() === "historical")
            ? "historical"
            : (normalizeRouterFamilyValue(doc?.filterFamily || doc?.rawDoc?.filterFamily || doc?.diagnostics?.filterFamily || routerFamily) || routerFamily),
        primaryLane: routerFamily,
      },
    }));
  }

  const authorityScore = (doc: any): number => {
    const ratings = Number(doc?.ratingCount || doc?.rawDoc?.ratings_count || doc?.rawDoc?.ratingsCount || 0);
    const avg = Number(doc?.averageRating || doc?.rawDoc?.average_rating || doc?.rawDoc?.ratings_average || 0);
    const editions = Number(doc?.editionCount || doc?.edition_count || doc?.rawDoc?.edition_count || 0);
    const hasCover = doc?.hasCover || doc?.cover_i || doc?.rawDoc?.cover_i ? 1 : 0;
    const text = `${doc?.title || ""} ${doc?.description || ""} ${doc?.author || ""}`.toLowerCase();
    const canonical = /\b(dune|beloved|frankenstein|the road|handmaid|gone girl|dragon tattoo|1984|brave new world|never let me go)\b/.test(text) ? 1 : 0;
    const family = normalizeRouterFamilyValue(doc?.queryFamily || doc?.diagnostics?.queryFamily || doc?.filterFamily);
    const laneBoost = retainedFamilies.has(String(family || "")) ? 0.6 : 0;
    return (Math.log10(ratings + 1) * 1.8) + (avg >= 4 ? 0.8 : 0) + (Math.log10(editions + 1) * 1.2) + (hasCover * 0.4) + (canonical * 1.0) + laneBoost;
  };

  candidateDocs = candidateDocs
    .slice()
    .sort((a: any, b: any) => authorityScore(b) - authorityScore(a))
    .slice(0, 120);

  const googleDocsEnriched = candidateDocs.filter(
    (doc: any) => sourceForDoc(doc, "googleBooks") === "googleBooks"
  );

  const openLibraryDocsEnriched = candidateDocs.filter(
    (doc: any) => sourceForDoc(doc, "openLibrary") === "openLibrary"
  );

  const kitsuDocsEnriched = candidateDocs.filter(
    (doc: any) => sourceForDoc(doc, "kitsu") === "kitsu"
  );

  const comicVineDocsEnriched = candidateDocs.filter(
    (doc: any) => sourceForDoc(doc, "comicVine") === "comicVine"
  );

  // Normalize all sources the same way.
  // IMPORTANT: Open Library should normalize from enriched docs too, so Hardcover failure markers
  // survive into candidate.rawDoc and finalRecommender can treat 429s as soft/non-blocking.
  const googleCandidates = asArray(normalizeCandidates(googleDocsEnriched, "googleBooks"));
  const openLibraryCandidates = asArray(normalizeCandidates(openLibraryDocsEnriched, "openLibrary"));
  const kitsuCandidatesRaw = asArray(normalizeCandidates(kitsuDocsEnriched, "kitsu"));
  const gcdCandidates = asArray(normalizeCandidates(comicVineDocsEnriched, "comicVine"));
  const comicVineNormalizationDropCount = Math.max(0, comicVineDocsEnriched.length - gcdCandidates.length);
  const comicVineNormalizationDroppedTitles = comicVineDocsEnriched
    .filter((doc: any) => {
      const t = String(doc?.title || "").trim().toLowerCase();
      return t && !gcdCandidates.some((c: any) => String(c?.title || "").trim().toLowerCase() === t);
    })
    .map((doc: any) => ({ title: String(doc?.title || "(untitled)"), reason: "dropped_in_normalizeCandidates" }))
    .slice(0, 60);

  let gcdCandidatesWithRescue = gcdCandidates;
  const comicVineCandidateCollapseDetected = comicVineDocsEnriched.length >= 40 && gcdCandidates.length <= 3;
  if (comicVineCandidateCollapseDetected) {
    const normalizedTitles = new Set(gcdCandidates.map((c: any) => String(c?.title || "").trim().toLowerCase()).filter(Boolean));
    const rescued = comicVineDocsEnriched
      .filter((doc: any) => {
        const title = String(doc?.title || "").trim();
        return title.length > 0 && !normalizedTitles.has(title.toLowerCase());
      })
      .slice(0, 120)
      .map((doc: any) => ({
        key: String(doc?.key || doc?.sourceId || doc?.title || "").toLowerCase(),
        title: String(doc?.title || "").trim(),
        author: Array.isArray(doc?.author_name) ? String(doc.author_name[0] || "") : String(doc?.author || ""),
        source: "comicVine",
        genre: "graphic novel",
        genres: ["graphic novel", "comics"],
        rating: Number(doc?.ratings_average || 0),
        ratingCount: Number(doc?.ratings_count || 0),
        pageCount: Number(doc?.pageCount || 0),
        description: String(doc?.description || doc?.subtitle || ""),
        queryText: String(doc?.queryText || ""),
        queryRung: Number(doc?.queryRung || 0),
        queryFamily: String(doc?.queryFamily || "unknown"),
        rawDoc: { ...doc, normalizationRescue: true, normalizationRescueReason: "candidate_collapse_fail_open" },
      }))
      .filter((c: any) => c.title.length > 0);
    gcdCandidatesWithRescue = [...gcdCandidates, ...rescued];
  }

  debugRouterLog("NORMALIZED CANDIDATES BY SOURCE", {
    googleBooks: googleCandidates.length,
    openLibrary: openLibraryCandidates.length,
    kitsu: kitsuCandidatesRaw.length,
    comicVine: gcdCandidatesWithRescue.length,
  });

  // Light dedupe for visual shelves.
  const seenTitles = new Set<string>();
  const kitsuBridgeMode = Number(kitsuEligibility.likedAnimeMangaCount || 0) <= 0;
  const kitsuInclusionThreshold = kitsuBridgeMode ? 6.2 : 4.2;
  const kitsuCandidates = kitsuCandidatesRaw.filter((c) => {
    const title = (c.title || "").toLowerCase().trim();
    if (!title || seenTitles.has(title)) return false;
    seenTitles.add(title);
    const facet = kitsuFacetMatchScore(c, routedInput);
    const subtype = String(c?.rawDoc?.kitsuSubtype || c?.kitsuSubtype || "").toLowerCase();
    const popularityRank = Number(c?.rawDoc?.kitsuPopularityRank || c?.kitsuPopularityRank || 999999);
    const ratingCount = Number(c?.rawDoc?.kitsuRatingCount || c?.kitsuRatingCount || 0);
    let score = facet.score;
    if (Number(kitsuEligibility.likedAnimeMangaCount || 0) > 0) score += Math.min(2, Number(kitsuEligibility.likedAnimeMangaCount || 0) * 0.25);
    if (!subtype) score -= 2.5;
    if (subtype === "novel") score -= 6;
    if (facet.weakOverlap) score -= 2.2;
    if (popularityRank > 25000) score -= 1.5;
    if (ratingCount < 40) score -= 1.2;
    (c as any).kitsuFacetMatchScore = score;
    (c as any).kitsuIncludedBecause = facet.reasons.length ? facet.reasons.join(",") : "no_strong_facet_overlap";
    (c as any).kitsuBridgeMode = kitsuBridgeMode;
    return score >= kitsuInclusionThreshold;
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

function enforceHistoricalCandidateMetadata<T extends any>(candidates: T[]): T[] {
  return (Array.isArray(candidates) ? candidates : []).map((candidate: any) => {
    const laneKind = String(candidate?.laneKind || candidate?.rawDoc?.laneKind || candidate?.diagnostics?.laneKind || "").toLowerCase();
    const filterFamily = String(candidate?.filterFamily || candidate?.rawDoc?.filterFamily || candidate?.rawDoc?.diagnostics?.filterFamily || candidate?.diagnostics?.filterFamily || "").toLowerCase();
    if (laneKind !== "historical" && filterFamily !== "historical") return candidate;

    return {
      ...candidate,
      queryFamily: "historical",
      filterFamily: "historical",
      laneKind: "historical",
      rawDoc: {
        ...(candidate?.rawDoc || {}),
        queryFamily: "historical",
        filterFamily: "historical",
        laneKind: "historical",
        queryText: candidate?.queryText ?? candidate?.rawDoc?.queryText,
        queryRung: Number.isFinite(Number(candidate?.queryRung))
          ? Number(candidate.queryRung)
          : candidate?.rawDoc?.queryRung,
        diagnostics: {
          ...(candidate?.rawDoc?.diagnostics || {}),
          queryFamily: "historical",
          filterFamily: "historical",
          laneKind: "historical",
          queryText: candidate?.queryText ?? candidate?.rawDoc?.queryText,
          queryRung: Number.isFinite(Number(candidate?.queryRung))
            ? Number(candidate.queryRung)
            : candidate?.rawDoc?.queryRung,
        },
      },
      diagnostics: {
        ...(candidate?.diagnostics || {}),
        queryFamily: "historical",
        filterFamily: "historical",
        laneKind: "historical",
      },
    };
  }) as T[];
}

const normalizedCandidatesRaw = [
    ...googleCandidates,
    ...openLibraryCandidates,
    ...(includeKitsu ? kitsuCandidates : []),
    ...(includeComicVine ? gcdCandidatesWithRescue : []),
  ].filter((c: any) => c?.rawDoc?.diagnostics?.filterKept !== false && c?.diagnostics?.filterKept !== false);
  const normalizedCandidates = enforceHistoricalCandidateMetadata(collapseCrossRungDuplicates(normalizedCandidatesRaw as any).map((candidate: any) => {
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
  }));

  const openLibraryNormalizedCandidates = normalizedCandidates.filter((c: any) => c?.source === "openLibrary");

  const preferredRungs = preferredPrimaryRungs(rungs);
  const primaryIntentCandidates = normalizedCandidates.filter((c: any) =>
    preferredRungs.has(String(c?.rawDoc?.queryRung ?? c?.queryRung ?? ""))
  );

  const requestedLimit = Math.max(1, Math.min(10, routingInput.limit ?? 10));
  const comicVineOnlyModeForLimit =
    includeComicVine &&
    !sourceEnabled.googleBooks &&
    !sourceEnabled.openLibrary &&
    !sourceEnabled.localLibrary &&
    !includeKitsu;
  const finalLimit = comicVineOnlyModeForLimit
    ? Math.max(requestedLimit, TARGET_MIN_RESULTS_WHEN_VIABLE)
    : requestedLimit;

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
  const rankingPoolRaw =
    routerFamily === "historical"
      ? ensureHistoricalRungDiversity(quotaPool, finalLimit)
      : ensureRungCoverage(quotaPool, finalLimit);
  const rankingPool = rankingPoolRaw.map((candidate: any) => {
    const isHistoricalLane = String(candidate?.laneKind || candidate?.rawDoc?.laneKind || "").toLowerCase() === "historical";
    if (!isHistoricalLane) return candidate;
    return {
      ...candidate,
      queryFamily: "historical",
      filterFamily: "historical",
      rawDoc: {
        ...(candidate?.rawDoc || {}),
        queryFamily: "historical",
        filterFamily: "historical",
      },
      diagnostics: {
        ...(candidate?.diagnostics || {}),
        queryFamily: "historical",
        filterFamily: "historical",
      },
    };
  });

  const candidatePoolPreview = rankingPool.slice(0, 50).map((c: any) => {
    const filterDiagnostics = c?.rawDoc?.diagnostics?.filterDiagnostics ?? c?.diagnostics?.filterDiagnostics;
    const resolvedQueryFamily =
      normalizeRouterFamilyValue(c?.queryFamily || c?.rawDoc?.queryFamily || c?.diagnostics?.queryFamily || c?.rawDoc?.diagnostics?.queryFamily) ||
      normalizeRouterFamilyValue(c?.filterFamily || c?.rawDoc?.filterFamily || c?.diagnostics?.filterFamily || c?.rawDoc?.diagnostics?.filterFamily) ||
      (routerFamily === "historical" ? "historical" : routerFamily);
    return {
      title: c.title,
      author: Array.isArray(c.author_name) ? c.author_name[0] : c.author,
      source: c.source,
      score: c.score,
      queryFamily: resolvedQueryFamily,
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
  const rankingPoolForFinal = enforceHistoricalCandidateMetadata(rankingPool.map((c: any) => {
    const laneKind = String(c?.laneKind || c?.rawDoc?.laneKind || c?.diagnostics?.laneKind || "").toLowerCase();
    if (laneKind !== "historical") return c;
    return {
      ...c,
      queryFamily: "historical",
      filterFamily: "historical",
      rawDoc: {
        ...(c?.rawDoc || {}),
        queryFamily: "historical",
        filterFamily: "historical",
      },
      diagnostics: {
        ...(c?.diagnostics || {}),
        queryFamily: "historical",
        filterFamily: "historical",
      },
    };
  }));
  for (const c of rankingPoolForFinal as any[]) {
    if (String(c?.laneKind || c?.rawDoc?.laneKind || "").toLowerCase() === "historical") {
      c.queryFamily = "historical";
      c.filterFamily = "historical";
      c.rawDoc = {
        ...(c?.rawDoc || {}),
        queryFamily: "historical",
        filterFamily: "historical",
      };
    }
  }
  console.log("FINAL QUERY FAMILIES", rankingPoolForFinal.map((c: any) => c?.queryFamily ?? c?.rawDoc?.queryFamily ?? "missing"));
  debugDocPreview("RANKING POOL BEFORE FINAL RECOMMENDER", rankingPoolForFinal);

  const sourceLayerRankedDocs = (() => {
    const perSourceCap = Math.max(finalLimit * 3, 18);
    const grouped = new Map<string, any[]>();
    for (const doc of rankingPoolForFinal as any[]) {
      const source = sourceForDoc(doc, "unknown");
      if (!grouped.has(source)) grouped.set(source, []);
      grouped.get(source)!.push(doc);
    }
    const out: any[] = [];
    for (const docs of grouped.values()) {
      const ranked = [...docs]
        .filter((doc: any) => doc?.diagnostics?.filterKept !== false && doc?.rawDoc?.diagnostics?.filterKept !== false)
        .sort((a: any, b: any) => candidateScoreValue(b) - candidateScoreValue(a))
        .slice(0, perSourceCap);
      out.push(...ranked);
    }
    return dedupeDocs(out as any);
  })();

  const activeRecommenderSources = new Set(
    sourceLayerRankedDocs
      .map((doc: any) => sourceForDoc(doc, "unknown"))
      .filter((s: string) => s !== "unknown")
  );
  const shouldRunFinalRecommender = activeRecommenderSources.size > 1;
  debugRouterLog("PRE_FINAL_SOURCE_LAYER", {
    sourceLayerCount: sourceLayerRankedDocs.length,
    activeRecommenderSources: [...activeRecommenderSources],
    shouldRunFinalRecommender,
  });

  const rankedDocs = shouldRunFinalRecommender
    ? asArray(finalRecommenderForDeck(sourceLayerRankedDocs, input.deckKey, {
        tasteProfile: routingInput.tasteProfile,
        profileOverride: routingInput.profileOverride,
        priorRecommendedIds: routingInput.priorRecommendedIds,
        priorRecommendedKeys: routingInput.priorRecommendedKeys,
        priorAuthors: routingInput.priorAuthors,
        priorSeriesKeys: routingInput.priorSeriesKeys,
        priorRejectedIds: routingInput.priorRejectedIds,
        priorRejectedKeys: routingInput.priorRejectedKeys,
      }))
    : sourceLayerRankedDocs;

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
  const applyHistoricalHardNarrativeFilter =
    routerFamily === "historical" &&
    Math.max(narrativeWeightedRankedDocs.length, rankingPoolForFinal.length) >= finalLimit * 2;

  const metaSafeRankedDocs = rebalanceRomanceFinalSources(narrativeWeightedRankedDocs, rankingPoolForFinal, finalLimit)
    .filter((doc: any) => !isMetaReferenceWork(doc))
    .filter((doc: any) => routerFamily !== "science_fiction" || !isScienceFictionMetaCollection(doc))
    .filter((doc: any) => !applyHistoricalHardNarrativeFilter || !isHistoricalPrimaryOrNonNarrative(doc));
  const finalRankedDocsBase = (() => {
    // Use finalRecommender-ranked docs as authoritative source for render selection.
    // Avoid refilling from raw ranking pool, which can reintroduce weak representatives.
    return metaSafeRankedDocs.slice(0, Math.max(finalLimit, 12));
  })();

  const applyAuthorSeriesCaps = (docs: any[]): any[] => {
    const comicVineOnlyMode =
      includeComicVine &&
      !sourceEnabled.googleBooks &&
      !sourceEnabled.openLibrary &&
      !sourceEnabled.localLibrary &&
      !includeKitsu;
    const sparseSingleSourcePool = comicVineOnlyMode && docs.length <= Math.max(finalLimit, 8);
    const authorTitleCap = 1;
    const seriesCap = sparseSingleSourcePool ? 2 : 1;
    const authorTitleSeen = new Map<string, number>();
    const seriesSeen = new Map<string, number>();
    return docs.filter((doc: any) => {
      const author = String(doc?.author || doc?.author_name?.[0] || doc?.rawDoc?.author || "").trim().toLowerCase();
      const title = String(doc?.title || doc?.rawDoc?.title || "").trim().toLowerCase();
      const series = String(doc?.seriesKey || doc?.rawDoc?.seriesKey || doc?.rawDoc?.series || "").trim().toLowerCase();
      if (author && title) {
        const authorTitleKey = `${author}::${title}`;
        const count = authorTitleSeen.get(authorTitleKey) || 0;
        if (count >= authorTitleCap) return false;
        authorTitleSeen.set(authorTitleKey, count + 1);
      }
      if (series) {
        const count = seriesSeen.get(series) || 0;
        if (count >= seriesCap) return false;
        seriesSeen.set(series, count + 1);
      }
      return true;
    });
  };

  const laneAndFacetRescore = (doc: any): number => {
    const text = `${doc?.title || ""} ${doc?.description || ""} ${(doc?.subjects || []).join(" ")}`.toLowerCase();
    const teenFit = isTeenDeckKey(input.deckKey) && /\b(young adult|ya|teen|high school|coming of age)\b/.test(text) ? 2.5 : 0;
    const lanePatterns: Record<string, RegExp> = {
      mystery: /\b(mystery|detective|investigation|whodunit|case)\b/,
      thriller: /\b(thriller|suspense|manhunt|conspiracy|cat and mouse)\b/,
      horror: /\b(horror|haunted|occult|monster|nightmare|dread)\b/,
      fantasy: /\b(fantasy|magic|quest|kingdom|sorcer|dragon)\b/,
      science_fiction: /\b(science fiction|sci-fi|future|dystopian|space|technology|ai)\b/,
      historical: /\b(historical|period|victorian|regency|war|empire)\b/,
      romance: /\b(romance|love|relationship|heartbreak|first love)\b/,
      general: /\b(novel|fiction|story|character)\b/,
      speculative: /\b(speculative|uncanny|surreal|alternate world)\b/,
    };
    const lanePattern = lanePatterns[routerFamily] || lanePatterns.general;
    const laneFit = lanePattern.test(text) ? 2.4 : -1.2;
    const facetHits = (text.match(/\b(dark|fast paced|friendship|survival|mystery|school|identity|hopeful)\b/g) || []).length;
    const finalScore = Number(doc?.score ?? doc?.diagnostics?.finalScore ?? candidateScoreValue(doc));
    return (finalScore * 6) + teenFit + laneFit + (facetHits * 0.5);
  };
  let finalSelectionMode: "source_only" | "source_plus_embeddings" | "source_plus_ai_rerank" | "multi_source_blend" = "multi_source_blend";
  let tasteProfileText = "";
  const candidateProfileTextById: Record<string, string> = {};
  const embeddingSimilarityById: Record<string, number> = {};
  const aiSelectionReasonById: Record<string, string> = {};
  const aiSelectionBucketById: Record<string, "central_fit" | "adjacent_fit" | "exploratory_fit" | "comfort_fit" | "surprising_fit"> = {};
  const aiGuardrailRejectedIds: string[] = [];
  let aiRerankInputCount = 0;
  let aiRerankOutput: Array<{ id: string; bucket: string; reason: string; similarity: number }> = [];

  const buildTasteCloud = (docs: any[], limit: number): any[] => {
    const isGenericSeriesOnlyTitle = (doc: any): boolean => {
      const title = String(doc?.title || doc?.rawDoc?.title || "").trim().toLowerCase();
      return /^(book|volume|vol\.?|issue|part|chapter)\s*(one|two|three|four|five|six|seven|eight|nine|ten|\d+)$/.test(title);
    };
    const facetTokens = Object.entries(input.tagCounts || {})
      .filter(([, v]) => Number(v || 0) > 0)
      .sort((a, b) => Number(b[1]) - Number(a[1]))
      .map(([k]) => String(k).toLowerCase())
      .slice(0, 12);
    tasteProfileText = `User taste signals: ${facetTokens.join(", ") || "general teen-friendly stories with emotional and genre balance"}.`;
    const tokenSet = new Set(facetTokens);
    const scoreSemanticFit = (doc: any): number => {
      const txt = `${doc?.title || ""} ${doc?.description || ""} ${(doc?.subjects || []).join(" ")} ${doc?.diagnostics?.reasonAccepted || ""}`.toLowerCase();
      if (!tokenSet.size) return 0;
      let matches = 0;
      for (const token of tokenSet) if (txt.includes(token)) matches += 1;
      return matches / tokenSet.size;
    };
    const sortedAll = [...docs].sort((a: any, b: any) => (laneAndFacetRescore(b) + scoreSemanticFit(b)) - (laneAndFacetRescore(a) + scoreSemanticFit(a)));
    const sorted = sortedAll.filter((doc: any) => !isGenericSeriesOnlyTitle(doc));
    const working = sorted.length > 0 ? sorted : sortedAll;
    const seen = new Set<string>();
    const takeFirst = (arr: any[]) => {
      for (const doc of arr) {
        const key = candidateKey(doc);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        return doc;
      }
      return null;
    };
    const textOf = (d: any) => `${d?.title || ""} ${d?.description || ""} ${(d?.subjects || []).join(" ")}`.toLowerCase();
    const central = working;
    const adjacent = working.filter((d: any) => /\b(mystery|thriller|science fiction|fantasy|horror|survival)\b/.test(textOf(d)));
    const emotional = working.filter((d: any) => /\b(friendship|identity|family|coming of age|emotional|human connection)\b/.test(textOf(d)));
    const tone = working.filter((d: any) => /\b(dark|hopeful|warm|atmospheric|spooky|quirky)\b/.test(textOf(d)));
    const exploratory = working.filter((d: any) => !/\b(vol\.?\s*\d+|issue\s*\d+|book\s*\d+)\b/i.test(String(d?.title || "")));
    const surprising = [...working].reverse();
    const bucketed: Array<{ bucket: "central_fit" | "adjacent_fit" | "exploratory_fit" | "comfort_fit" | "surprising_fit"; doc: any | null }> = [
      { bucket: "central_fit", doc: takeFirst(central) },
      { bucket: "adjacent_fit", doc: takeFirst(adjacent) },
      { bucket: "exploratory_fit", doc: takeFirst(exploratory) },
      { bucket: "comfort_fit", doc: takeFirst(emotional.length ? emotional : tone) },
      { bucket: "surprising_fit", doc: takeFirst(surprising) },
    ];
    const picks = bucketed.map((row) => row.doc).filter(Boolean) as any[];
    for (const row of bucketed) {
      const doc = row.doc;
      if (!doc) continue;
      const id = String(doc?.sourceId || doc?.canonicalId || doc?.id || doc?.key || doc?.title || "").trim();
      const profile = `${doc?.title || ""} | ${doc?.source || doc?.rawDoc?.source || ""} | ${(doc?.subjects || []).join(", ")} | ${doc?.description || ""} | ${doc?.seriesKey || ""}`;
      candidateProfileTextById[id] = profile;
      embeddingSimilarityById[id] = Number(scoreSemanticFit(doc).toFixed(4));
      aiSelectionBucketById[id] = row.bucket;
      aiSelectionReasonById[id] = `Selected for ${row.bucket} using semantic-fit + deterministic lane score.`;
    }
    for (const doc of working) {
      if (picks.length >= limit) break;
      const key = candidateKey(doc);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      picks.push(doc);
    }
    aiRerankInputCount = working.length;
    aiRerankOutput = picks.slice(0, limit).map((doc: any) => {
      const id = String(doc?.sourceId || doc?.canonicalId || doc?.id || doc?.key || doc?.title || "").trim();
      return { id, bucket: aiSelectionBucketById[id] || "central_fit", reason: aiSelectionReasonById[id] || "selected", similarity: Number(embeddingSimilarityById[id] || 0) };
    });
    return picks.slice(0, limit);
  };

  const genericTitlePattern = /^(the novel|untitled|book\s*(\d+|one|two|three|four|five|six|seven|eight|nine|ten)|volume\s*(\d+|one|two|three|four|five|six|seven|eight|nine|ten)|stories|collected stories)$/i;
  let finalRankedDocs = (() => {
    if (!isTeenDeckKey(input.deckKey)) {
      return applyAuthorSeriesCaps([...finalRankedDocsBase].sort((a: any, b: any) => laneAndFacetRescore(b) - laneAndFacetRescore(a))).slice(0, finalLimit);
    }
    const teenLaneFamily = inferTeenLaneFromFacets(input.tagCounts, routerFamily);
    const laneLexicon: Record<string, RegExp> = {
      thriller: /\b(thriller|suspense|chase|manhunt|crime|conspiracy|survival)\b/i,
      mystery: /\b(mystery|detective|investigation|clue|whodunit|case)\b/i,
      horror: /\b(horror|haunted|ghost|occult|monster|dread|nightmare)\b/i,
      romance: /\b(romance|love|relationship|heartbreak|dating|first love)\b/i,
      fantasy: /\b(fantasy|magic|dragon|quest|kingdom|fae|sorcer)\b/i,
      science_fiction: /\b(science fiction|sci-fi|dystopian|future|technology|space|ai)\b/i,
      historical: /\b(historical|period|victorian|regency|war|empire)\b/i,
    };
    const laneRegex = laneLexicon[teenLaneFamily] || laneLexicon[routerFamily] || /\b(young adult|teen)\b/i;
    const facetTokens = Object.entries(input.tagCounts || {})
      .filter(([, v]) => Number(v || 0) > 0)
      .sort((a, b) => Number(b[1]) - Number(a[1]))
      .map(([k]) => String(k).toLowerCase())
      .slice(0, 20);
    const facetPattern = facetTokens.length
      ? new RegExp(`\\b(${facetTokens.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b`, "gi")
      : null;
    const classicAdultCanonPattern = /\b(dracula|frankenstein|hp lovecraft|edgar allan poe|thomas ligotti|dante|homer|virgil|milton|dickens|tolstoy|dostoevsky)\b/i;
    const anthologyMetaPattern = /\b(anthology|collected|selected works|stories by|essays|criticism|companion|guide|analysis|history of|reader|handbook)\b/i;
    const laneScore = (doc: any): number => {
      const text = `${doc?.title || ""} ${doc?.description || ""} ${(doc?.subjects || []).join(" ")}`.toLowerCase();
      const onLane = laneRegex.test(text) ? 2 : -2;
      const generic = /\b(fiction|novel|book|story)\b/.test(text) ? -0.5 : 0;
      const facetMatches = facetPattern ? (text.match(facetPattern) || []).length : 0;
      const classicPenalty = classicAdultCanonPattern.test(text) && !/\b(young adult|ya|teen|retelling|adaptation)\b/i.test(text) ? -2.5 : 0;
      const finalScore = Number(doc?.score ?? doc?.diagnostics?.finalScore ?? candidateScoreValue(doc));
      return (finalScore * 6) + onLane + generic + (facetMatches * 0.45) + classicPenalty;
    };

    const poolSize = Math.max(finalLimit, finalRankedDocsBase.length);
    const darkCap = Math.max(1, Math.floor(poolSize * 0.4)); // hard cap: <=40% dark/survival
    const minEmotional = Math.min(2, finalLimit);
    const minSpeculative = Math.min(2, Math.max(0, finalLimit - minEmotional));

    const teenAccessibleStrict = finalRankedDocsBase.filter((doc: any) => {
      const text = `${doc?.title || ""} ${doc?.author || ""} ${doc?.description || ""} ${(doc?.subjects || []).join(" ")}`.toLowerCase();
      const hasYASignal = /\b(young adult|ya|teen|coming of age|high school|friendship|identity|dystopian|romance|first love|survival|speculative)\b/.test(text);
      const adultClassicHorror = /\b(dracula|frankenstein|hp lovecraft|edgar allan poe|clive barker|thomas ligotti)\b/.test(text);
      const hardAdultOnly = /\b(extreme horror|splatterpunk|erotica|serial killer memoir)\b/.test(text);
      const strongTeenDark = /\b(ya horror|teen horror|young adult horror|survival horror|dystopian)\b/.test(text);
      if (hardAdultOnly) return false;
      if (adultClassicHorror && !hasYASignal && !strongTeenDark) return false;
      return true;
    });

    const teenAccessible = teenAccessibleStrict.length >= Math.max(6, finalLimit)
      ? teenAccessibleStrict
      : finalRankedDocsBase.filter((doc: any) => {
          const text = `${doc?.title || ""} ${doc?.author || ""} ${doc?.description || ""} ${(doc?.subjects || []).join(" ")}`.toLowerCase();
          const hardAdultOnly = /\b(extreme horror|splatterpunk|erotica|serial killer memoir)\b/.test(text);
          return !hardAdultOnly;
        });

    const pools = {
      emotional: teenAccessible.filter((d: any) => /\b(young adult|ya|teen|romance|coming of age|friendship|identity|emotional|contemporary|high school)\b/i.test(`${d?.title || ""} ${d?.description || ""} ${(d?.subjects || []).join(" ")}`)).sort((a: any, b: any) => laneScore(b) - laneScore(a)),
      speculative: teenAccessible.filter((d: any) => /\b(young adult|ya|teen|dystopian|science fiction|speculative|future|technology|identity|rebellion)\b/i.test(`${d?.title || ""} ${d?.description || ""} ${(d?.subjects || []).join(" ")}`)).sort((a: any, b: any) => laneScore(b) - laneScore(a)),
      dark: teenAccessible.filter((d: any) => /\b(horror|survival|haunted|thriller|dark)\b/i.test(`${d?.title || ""} ${d?.description || ""} ${(d?.subjects || []).join(" ")}`)).sort((a: any, b: any) => laneScore(b) - laneScore(a)),
      general: teenAccessible.slice().sort((a: any, b: any) => laneScore(b) - laneScore(a)),
    };

    const out: any[] = [];
    const seen = new Set<string>();
    const take = (arr: any[], max: number) => {
      for (const doc of arr) {
        const key = candidateKey(doc);
        if (!key || seen.has(key)) continue;
        out.push(doc); seen.add(key);
        if (arr === pools.dark && out.filter((d) => /\b(horror|survival|haunted|thriller|dark)\b/i.test(`${d?.title || ""} ${d?.description || ""}`)).length >= max) break;
        if (arr !== pools.dark && out.length >= finalLimit) break;
      }
    };

    take(pools.emotional, minEmotional);
    take(pools.speculative, minSpeculative);
    take(pools.dark, darkCap);
    take(pools.general, finalLimit);

    const authorSeen = new Map<string, number>();
    const teenComicVineOnlySparseMode =
      includeComicVine &&
      !sourceEnabled.googleBooks &&
      !sourceEnabled.openLibrary &&
      !sourceEnabled.localLibrary &&
      !includeKitsu &&
      teenAccessible.length <= Math.max(finalLimit * 2, 10);
    const teenAuthorCap = teenComicVineOnlySparseMode ? 2 : 1;
    const finalTeen = applyAuthorSeriesCaps(out)
      .filter((doc: any) => {
        const title = String(doc?.title || "").trim();
        const text = `${title} ${doc?.description || ""} ${(doc?.subjects || []).join(" ")}`;
        if (!title || genericTitlePattern.test(title)) return false;
        if (anthologyMetaPattern.test(text)) return false;
        return true;
      })
      .sort((a: any, b: any) => laneScore(b) - laneScore(a))
      .filter((doc: any) => {
        const author = String(doc?.author || doc?.author_name?.[0] || doc?.rawDoc?.author || "").trim().toLowerCase();
        if (!author) return true;
        const seen = authorSeen.get(author) || 0;
        if (seen >= teenAuthorCap) return false;
        authorSeen.set(author, seen + 1);
        return true;
      })
      .slice(0, finalLimit)
      .map((doc: any) => ({
        ...doc,
        title: doc?.title || doc?.rawDoc?.title,
        author_name: Array.isArray(doc?.author_name)
          ? doc.author_name
          : (doc?.author ? [doc.author] : (Array.isArray(doc?.rawDoc?.author_name) ? doc.rawDoc.author_name : [])),
      }));
    const darkCount = finalTeen.filter((d) => /\b(horror|survival|haunted|thriller|dark)\b/i.test(`${d?.title || ""} ${d?.description || ""} ${(d?.subjects || []).join(" ")}`)).length;
    const emotionalCount = finalTeen.filter((d) => /\b(romance|coming of age|friendship|identity|emotional|contemporary|high school)\b/i.test(`${d?.title || ""} ${d?.description || ""} ${(d?.subjects || []).join(" ")}`)).length;
    const speculativeCount = finalTeen.filter((d) => /\b(dystopian|science fiction|speculative|future|technology|identity|rebellion)\b/i.test(`${d?.title || ""} ${d?.description || ""} ${(d?.subjects || []).join(" ")}`)).length;
    const finalTeenOrFallback = finalTeen.length > 0
      ? finalTeen
      : finalRankedDocsBase
          .filter((doc: any) => {
            const title = String(doc?.title || doc?.rawDoc?.title || "").trim();
            const desc = String(doc?.description || doc?.rawDoc?.description || "").trim();
            if (!title || genericTitlePattern.test(title)) return false;
            return desc.length >= 40;
          })
          .slice(0, finalLimit);
    debugRouterLog("TEEN_MIX_DIAGNOSTICS", {
      teenLaneFamily,
      teenDeckKey: input.deckKey,
      removedByStrictAgeFit: Math.max(0, finalRankedDocsBase.length - teenAccessibleStrict.length),
      strictRetained: teenAccessibleStrict.length,
      relaxedRetained: teenAccessible.length,
      finalCount: finalTeenOrFallback.length,
      darkCount,
      darkCap,
      emotionalCount,
      speculativeCount,
      minEmotional,
      minSpeculative,
      laneAlignedFinal: finalTeenOrFallback.filter((d) => laneScore(d) > 0).length,
      usedFinalFallback: finalTeen.length === 0,
    });
    return finalTeenOrFallback;
  })();
  const comicVineOnlyModeForTasteCloud =
    includeComicVine &&
    !sourceEnabled.googleBooks &&
    !sourceEnabled.openLibrary &&
    !sourceEnabled.localLibrary &&
    !includeKitsu;
  const deterministicGuardedPool = finalRankedDocsBase.filter((doc: any) => {
    const title = String(doc?.title || doc?.rawDoc?.title || "").trim();
    return Boolean(title) && !genericTitlePattern.test(title);
  });
  if (comicVineOnlyModeForTasteCloud && deterministicGuardedPool.length > 0) {
    finalSelectionMode = "source_plus_embeddings";
    finalRankedDocs = buildTasteCloud(deterministicGuardedPool, finalLimit);
  } else if (!comicVineOnlyModeForTasteCloud) {
    finalSelectionMode = "multi_source_blend";
  }


  let teenPostPassInputDocs = finalRankedDocsBase.length ? [...finalRankedDocsBase] : [...rankedDocs];
  if (finalRankedDocs.length === 0 && rankedDocs.length > 0) {
    const genericFilteredFallback = rankedDocs
      .filter((doc: any) => {
        const title = String(doc?.title || doc?.rawDoc?.title || "").trim();
        return Boolean(title) && !genericTitlePattern.test(title);
      })
      .slice(0, finalLimit);
    finalRankedDocs = genericFilteredFallback.length > 0
      ? genericFilteredFallback
      : rankedDocs.slice(0, Math.min(finalLimit, 2)).map((doc: any) => ({
          ...doc,
          diagnostics: {
            ...(doc?.diagnostics || {}),
            sparseGenericFallbackUsed: true,
          },
        }));
  }
  debugDocPreview("FINAL OUTPUT", finalRankedDocs, finalLimit);

  const rankedDocsWithDiagnostics = finalRankedDocs.map((doc: any) => ({
    ...doc,
    finalScore: Number(doc?.score ?? doc?.diagnostics?.postFilterScore ?? 0),
    comicVineRelevanceScore: Number(doc?.diagnostics?.queryAlignment ?? 0),
    titleMatchScore: Number((doc?.diagnostics as any)?.titleMatchScore ?? 0),
    descriptionMatchScore: Number((doc?.diagnostics as any)?.descriptionMatchScore ?? 0),
    tasteMatchScore: Number(doc?.diagnostics?.tasteAlignment ?? 0),
    reasonAccepted: String((doc?.diagnostics as any)?.reasonAccepted || "final_recommender_kept"),
    queryFamily:
      normalizeRouterFamilyValue(
        doc?.queryFamily ||
        doc?.rawDoc?.queryFamily ||
        doc?.diagnostics?.queryFamily ||
        doc?.rawDoc?.diagnostics?.queryFamily
      ) || (routerFamily === "historical" ? "historical" : routerFamily),
    filterFamily:
      normalizeRouterFamilyValue(
        doc?.filterFamily ||
        doc?.rawDoc?.filterFamily ||
        doc?.diagnostics?.filterFamily ||
        doc?.rawDoc?.diagnostics?.filterFamily
      ) || (routerFamily === "historical" ? "historical" : routerFamily),
    source: sourceForDoc(doc, "openLibrary"),
    diagnostics: doc?.diagnostics
      ? {
          ...doc.diagnostics,
          queryFamily: normalizeRouterFamilyValue(doc.diagnostics.queryFamily || doc?.queryFamily || doc?.rawDoc?.queryFamily) || (routerFamily === "historical" ? "historical" : routerFamily),
          source: doc.diagnostics.source || sourceForDoc(doc, "openLibrary"),
          preFilterScore: Number(doc.diagnostics.preFilterScore ?? doc?.score ?? 0),
          postFilterScore: Number(doc.diagnostics.postFilterScore ?? doc?.score ?? 0),
          rejectionReason: doc.diagnostics.rejectionReason,
          tasteAlignment: doc.diagnostics.tasteAlignment,
          queryAlignment: doc.diagnostics.queryAlignment,
          finalScore: Number(doc?.score ?? doc.diagnostics.postFilterScore ?? 0),
          comicVineRelevanceScore: Number(doc.diagnostics.queryAlignment ?? 0),
          titleMatchScore: Number((doc.diagnostics as any)?.titleMatchScore ?? 0),
          descriptionMatchScore: Number((doc.diagnostics as any)?.descriptionMatchScore ?? 0),
          tasteMatchScore: Number(doc.diagnostics.tasteAlignment ?? 0),
          reasonAccepted: String((doc.diagnostics as any)?.reasonAccepted || "final_recommender_kept"),
          rungBoost: doc.diagnostics.rungBoost,
          commercialBoost: (doc.diagnostics as any).commercialBoost,
          laneKind: doc.diagnostics.laneKind ?? doc.laneKind ?? doc.rawDoc?.laneKind,
          filterDiagnostics: doc.diagnostics.filterDiagnostics ?? doc?.rawDoc?.diagnostics?.filterDiagnostics,
          filterKept: doc.diagnostics.filterKept ?? doc?.rawDoc?.diagnostics?.filterKept,
          filterRejectReasons: doc.diagnostics.filterRejectReasons ?? doc?.rawDoc?.diagnostics?.filterRejectReasons ?? [],
          filterPassedChecks: doc.diagnostics.filterPassedChecks ?? doc?.rawDoc?.diagnostics?.filterPassedChecks ?? [],
          filterFamily: normalizeRouterFamilyValue(doc.diagnostics.filterFamily ?? doc?.rawDoc?.diagnostics?.filterFamily ?? doc?.filterFamily ?? doc?.rawDoc?.filterFamily) || (routerFamily === "historical" ? "historical" : routerFamily),
          filterWantsHorrorTone: doc.diagnostics.filterWantsHorrorTone ?? doc?.rawDoc?.diagnostics?.filterWantsHorrorTone,
          filterFlags: doc.diagnostics.filterFlags ?? doc?.rawDoc?.diagnostics?.filterFlags ?? {},
        }
      : {
          source: sourceForDoc(doc, "openLibrary"),
          queryFamily: normalizeRouterFamilyValue(doc?.queryFamily || doc?.rawDoc?.queryFamily) || (routerFamily === "historical" ? "historical" : routerFamily),
          laneKind: doc?.laneKind ?? doc?.rawDoc?.laneKind,
          filterDiagnostics: doc?.rawDoc?.diagnostics?.filterDiagnostics,
          filterKept: doc?.rawDoc?.diagnostics?.filterKept,
          filterRejectReasons: doc?.rawDoc?.diagnostics?.filterRejectReasons ?? [],
          filterPassedChecks: doc?.rawDoc?.diagnostics?.filterPassedChecks ?? [],
          filterFamily: normalizeRouterFamilyValue(doc?.rawDoc?.diagnostics?.filterFamily || doc?.filterFamily || doc?.rawDoc?.filterFamily) || (routerFamily === "historical" ? "historical" : routerFamily),
          filterWantsHorrorTone: doc?.rawDoc?.diagnostics?.filterWantsHorrorTone,
          filterFlags: doc?.rawDoc?.diagnostics?.filterFlags ?? {},
        },
  }));

  const rankedCountsBySource: Record<CandidateSource, number> = {
    googleBooks: 0,
    openLibrary: 0,
    kitsu: 0,
    comicVine: 0,
  };

  for (const doc of rankedDocsWithDiagnostics) {
    const source = sourceForDoc(doc, "openLibrary");
    rankedCountsBySource[source] = (rankedCountsBySource[source] || 0) + 1;
  }

  const labelParts: string[] = [];
  if (sourceEnabled.googleBooks) labelParts.push("Google Books");
  if (sourceEnabled.openLibrary) labelParts.push("Open Library");
  if (includeKitsu) labelParts.push("Kitsu");
  if (includeComicVine) labelParts.push("ComicVine");
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
      rawFetched: includeKitsu ? aggregatedRawFetched.kitsu : 0,
      postFilterCandidates: includeKitsu ? kitsuCandidates.length : 0,
      finalSelected: rankedCountsBySource.kitsu,
    },
    comicVine: {
      rawFetched: includeComicVine ? aggregatedRawFetched.comicVine : 0,
      postFilterCandidates: includeComicVine ? gcdCandidatesWithRescue.length : 0,
      finalSelected: rankedCountsBySource.comicVine,
    },
    nyt: {
      rawFetched: nytAnchorDebug.fetched,
      postFilterCandidates: nytAnchorDebug.matched + nytAnchorDebug.injected,
      finalSelected: rankedDocsWithDiagnostics.filter((doc: any) => Boolean(doc?.nyt || doc?.rawDoc?.nyt)).length,
    },
  };

  const hasSuccessfulComicVineFetch = comicVineFetchResults.some((row) => row.status === "ok" && Number(row.rawCount || 0) > 0);
  const effectiveProxyHealthStatus = hasSuccessfulComicVineFetch ? "ok" : proxyHealthStatus;
  const effectiveProxyHealthError = hasSuccessfulComicVineFetch ? undefined : proxyHealthError || undefined;
  const comicVineQueryDerivedCount = Number((comicVine as any)?.comicVineQueryDerivedCount || 0);
  const comicVineFallbackCount = Number((comicVine as any)?.comicVineFallbackCount || 0);
  const comicVinePipelineTraceCounts = (comicVine as any)?.comicVinePipelineTraceCounts || {};
  const comicVinePipelineFailureDetected = Boolean((comicVine as any)?.comicVinePipelineFailureDetected);
  const comicVinePipelineFailureReason = String((comicVine as any)?.comicVinePipelineFailureReason || "");
  const comicVineFallbackOnlyResult = Boolean((comicVine as any)?.comicVineFallbackOnlyResult);
  const comicVineFallbackLeakageWarning = String((comicVine as any)?.comicVineFallbackLeakageWarning || "");
  const comicVineRecommendationSetMode = String((comicVine as any)?.comicVineRecommendationSetMode || "unknown");
  const comicVineNormalRecommendationSet = Boolean((comicVine as any)?.comicVineNormalRecommendationSet);

  const comicVineDispatchTrace = {
    sourceEnabledComicVine: Boolean(sourceEnabled.comicVine),
    traceSource: "router" as const,
    includeGcd: Boolean(includeComicVine),
    comicVineEnvVarPresent,
    comicVineKeyDetected,
    comicVineEnabledRuntime,
    runtimePlatform: "client" as const,
    runtimeEnvironment: "client_like" as const,
    comicVineEnvKeyLength: 0,
    comicVineProxyUrl,
    normalizedComicVineProxyUrl,
    comicVineProxyConfigured: Boolean(comicVineProxyUrl),
    comicVineProxyHealthStatus: effectiveProxyHealthStatus,
    comicVineProxyErrorBody: effectiveProxyHealthError,
    buildComicVineFacetRungsCalled,
    comicVineRungsLength: comicVineFacetRungs.length,
    mainRungQueriesLength,
    gcdFetchAttempted: comicVineFetchAttempted,
    comicVineFetchAttempted,
    comicVineQueryTexts: Array.from(comicVineQueryTexts),
    comicVineRungsBuilt: Array.from(comicVineRungsBuilt),
    comicVineQueriesActuallyFetched: Array.from(comicVineQueriesActuallyFetched),
    gcdFetchResults: comicVineFetchResults,
    comicVineFetchResults,
    comicVineRawCountByQuery,
    comicVineAcceptedCountByQuery,
    comicVineRejectedCountByQuery,
    comicVineTopTitlesByQuery,
    comicVineSampleTitlesByQuery,
    comicVineRejectedSampleTitlesByQuery,
    comicVineRejectedSampleReasonsByQuery,
    comicVineSampleDiagnosticsVisible:
      Object.keys(comicVineSampleTitlesByQuery).length > 0 ||
      Object.keys(comicVineRejectedSampleTitlesByQuery).length > 0 ||
      Object.keys(comicVineRejectedSampleReasonsByQuery).length > 0,
    comicVineAdapterDropReasonsByQuery,
    comicVineRescueRejectedTitlesByQuery,
    comicVineZeroResultQueries: Object.keys(comicVineAcceptedCountByQuery).filter((q) => Number(comicVineAcceptedCountByQuery[q] || 0) === 0),
    comicVineSuccessfulQueries: Object.keys(comicVineAcceptedCountByQuery).filter((q) => Number(comicVineAcceptedCountByQuery[q] || 0) > 0),
    comicVineResolvedSeedQuery,
    comicVineFallbackReason,
    comicVineUsedFallbackQuery,
    comicVinePositiveQueries,
    comicVineExcludedTermsAppliedInFilterOnly,
    comicVineQueryTooLong,
    comicVineQueryDerivedCount,
    comicVineFallbackCount,
    comicVineFallbackOnlyResult,
    comicVineFallbackLeakageWarning,
    comicVineRecommendationSetMode,
    comicVineNormalRecommendationSet,
    comicVinePipelineTraceCounts,
    comicVinePipelineFailureDetected,
    comicVinePipelineFailureReason,
  };

  if (comicVinePipelineFailureDetected) {
    sourceSkippedReason.push(`comicvine_pipeline_failure:${comicVinePipelineFailureReason || "unknown"}`);
    if (comicVineAdapterStatus === "ok") comicVineAdapterStatus = "proxy_error";
  }


  const finalDebugSnapshot: any = getLastFinalRecommenderDebug() || {};
  const finalAcceptedDocsLength = Number(
    finalDebugSnapshot?.acceptedCount ||
    (comicVineOnlyModeForTasteCloud ? finalRankedDocsBase.length : 0)
  );
  const finalRejectedTitles = Array.isArray(finalDebugSnapshot?.rejected)
    ? finalDebugSnapshot.rejected.map((row: any) => String(row?.title || "").trim()).filter(Boolean)
    : [];

  if (
    finalAcceptedDocsLength > 0 &&
    teenPostPassInputDocs.length === 0
  ) {
    console.error(
      "POSTPASS_INPUT_DERIVED_FROM_WRONG_SOURCE",
      {
        finalAcceptedDocsLength,
        rankedDocsLength: rankedDocs?.length,
        finalRankedDocsBaseLength: finalRankedDocsBase?.length,
        candidatePoolLength: candidatePoolPreview?.length,
      }
    );
  }

  if (
    teenPostPassInputDocs.length === 0 &&
    finalRankedDocsBase.length > 0
  ) {
    teenPostPassInputDocs = [...finalRankedDocsBase];
  }
  const teenPostPassInputSource = finalRankedDocsBase.length > 0 ? "finalRankedDocsBase" : "rankedDocs";
  const finalAcceptedDocsSource = "finalRankedDocsBase";
  const finalAcceptedDocsTitles = deterministicGuardedPool.map((doc:any)=>String(doc?.title || doc?.rawDoc?.title || "").trim()).filter(Boolean);
  const finalRankedDocsBaseTitles = finalRankedDocsBase.map((doc:any)=>String(doc?.title || doc?.rawDoc?.title || "").trim()).filter(Boolean);
  const rankedDocsTitles = rankedDocs.map((doc:any)=>String(doc?.title || doc?.rawDoc?.title || "").trim()).filter(Boolean);
  const finalRankedDocsBaseLength = finalRankedDocsBase.length;
  const rankedDocsLength = rankedDocs.length;
  const comicVineTargetFloor = Math.min(finalLimit, Math.max(2, TARGET_MIN_RESULTS_WHEN_VIABLE));
  if (
    includeComicVine &&
    finalRankedDocsBase.length > 0 &&
    finalRankedDocs.length < Math.min(comicVineTargetFloor, finalRankedDocsBase.length)
  ) {
    finalRankedDocs = [...finalRankedDocsBase].slice(0, Math.min(finalLimit, finalRankedDocsBase.length));
  }

  const teenPostPassInputLength = teenPostPassInputDocs.length;
  const teenPostPassOutputLength = finalRankedDocs.length;
  const teenPostPassOutputTitles = finalRankedDocs.map((doc:any)=>String(doc?.title || doc?.rawDoc?.title || "").trim()).filter(Boolean);
  const teenPostPassRejectedTitles = teenPostPassInputDocs
    .map((doc:any)=>String(doc?.title || doc?.rawDoc?.title || "").trim())
    .filter((title:string) => Boolean(title) && !teenPostPassOutputTitles.includes(title));
  const teenPostPassRejectReasons = teenPostPassRejectedTitles.map(() => "teen_postpass_trim");
  const teenPostPassSourceCapApplied = teenPostPassOutputLength < teenPostPassInputLength;
  const teenPostPassSeriesCapApplied = teenPostPassRejectedTitles.length > 0;
  const finalRenderDocsBase = finalRankedDocs.length ? finalRankedDocs : rankedDocsWithDiagnostics;
  const applyCrossFranchiseSaturationPenalty = (docsIn: any[]): any[] => {
    const franchiseCounts: Record<string, number> = {};
    return [...docsIn]
      .map((doc) => {
        const key = finalSeriesKeyForRender(doc);
        const count = (franchiseCounts[key] || 0) + 1;
        franchiseCounts[key] = count;
        const saturationPenalty = count <= 2 ? 0 : (count - 2) * 3.25;
        const title = String(doc?.title || doc?.rawDoc?.title || "").toLowerCase();
        const laterCollectionPenalty =
          /locke\s*&\s*key/.test(title) && (/master edition\s*#?\s*[2-9]/.test(title) || /vol(?:ume)?\.?\s*[2-9]/.test(title))
            ? 7.25
            : 0;
        const entryPointBoost =
          /locke\s*&\s*key/.test(title) && (/master edition\s*#?\s*1/.test(title) || /treasury edition\s*#?\s*1/.test(title) || /vol(?:ume)?\.?\s*1/.test(title))
            ? 3.75
            : 0;
        const hellboyRootBoost = /\bhellboy\s*#?\s*1\b/.test(title) ? 3.5 : 0;
        const hellboyLocalizedPenalty = /\bhellboy\b/.test(title) && /\b(kompendium|kompendiume|kompendio)\b/.test(title) ? 3.25 : 0;
        const hellboySideArcPenalty = /\bhellboy\b/.test(title) && /:\s*(being human|weird tales|short stories|anthology)/.test(title) ? 2.25 : 0;
        const boostedScore =
          Number(doc?.score ?? doc?.diagnostics?.finalScore ?? 0) -
          saturationPenalty -
          laterCollectionPenalty -
          hellboyLocalizedPenalty -
          hellboySideArcPenalty +
          entryPointBoost +
          hellboyRootBoost;
        return {
          ...doc,
          score: boostedScore,
          diagnostics: {
            ...(doc?.diagnostics || {}),
            crossFranchiseSaturationPenalty: saturationPenalty,
            laterCollectionPenalty,
            entryPointBoost,
            hellboyRootBoost,
            hellboyLocalizedPenalty,
            hellboySideArcPenalty,
            finalScoreAfterSaturation: boostedScore,
          },
        };
      })
      .sort((a, b) => Number(b?.score || 0) - Number(a?.score || 0));
  };
  const saturatedFinalRenderDocsBase = includeComicVine ? applyCrossFranchiseSaturationPenalty(finalRenderDocsBase) : finalRenderDocsBase;
  const distinctSeriesInFinalPool = new Set(
    saturatedFinalRenderDocsBase
      .map((doc: any) => finalSeriesKeyForRender(doc))
      .filter((key: string) => Boolean(key))
  ).size;
  const comicVineOnlyModeForFinalSeriesCap =
    includeComicVine &&
    !sourceEnabled.googleBooks &&
    !sourceEnabled.openLibrary &&
    !sourceEnabled.localLibrary &&
    !includeKitsu;
  const finalSeriesCap =
    comicVineOnlyModeForFinalSeriesCap
      ? (
          distinctSeriesInFinalPool >= 4
            ? 1
            : distinctSeriesInFinalPool <= 2
            ? 4
            : 2
        )
      : includeComicVine
      ? 2
      : 3;
  const finalSeriesCapResult = applyFinalSeriesCap(saturatedFinalRenderDocsBase, finalSeriesCap);
  let finalRenderDocs = finalSeriesCapResult.kept;
  if (includeComicVine && finalRenderDocs.length < TARGET_MIN_RESULTS_WHEN_VIABLE) {
    const seriesCounts = new Map<string, number>();
    for (const doc of finalRenderDocs) {
      const key = finalSeriesKeyForRender(doc);
      seriesCounts.set(key, (seriesCounts.get(key) || 0) + 1);
    }
    for (const doc of saturatedFinalRenderDocsBase) {
      if (finalRenderDocs.length >= Math.min(finalLimit, TARGET_MIN_RESULTS_WHEN_VIABLE)) break;
      const id = String(doc?.sourceId || doc?.canonicalId || doc?.id || doc?.key || doc?.title || "").trim().toLowerCase();
      if (!id || finalRenderDocs.some((existing: any) => String(existing?.sourceId || existing?.canonicalId || existing?.id || existing?.key || existing?.title || "").trim().toLowerCase() === id)) continue;
      const seriesKey = finalSeriesKeyForRender(doc);
      if ((seriesCounts.get(seriesKey) || 0) >= finalSeriesCap) {
        aiGuardrailRejectedIds.push(id);
        continue;
      }
      finalRenderDocs.push(doc);
      seriesCounts.set(seriesKey, (seriesCounts.get(seriesKey) || 0) + 1);
    }
  }
  const realComicVineDocsCount = finalRenderDocs.filter(
    (doc: any) => !(doc?.diagnostics as any)?.comicvineRouterEmergencyFallback
  ).length;
  if (comicVineOnlyModeForFinalSeriesCap && finalRenderDocs.length < 10 && realComicVineDocsCount === 0) {
    const emergencyTitles: Array<{ title: string; publisher: string }> = [
      { title: "Nimona", publisher: "Oni Press" },
      { title: "Paper Girls", publisher: "Image Comics" },
      { title: "Runaways", publisher: "Marvel Comics" },
      { title: "Ms. Marvel", publisher: "Marvel Comics" },
      { title: "Something is Killing the Children", publisher: "Boom! Studios" },
      { title: "Locke & Key", publisher: "IDW Publishing" },
      { title: "The Sandman", publisher: "DC Comics" },
      { title: "Saga", publisher: "Image Comics" },
      { title: "Y: The Last Man", publisher: "DC Comics" },
      { title: "Sweet Tooth", publisher: "DC Comics" },
      { title: "Monstress", publisher: "Image Comics" },
      { title: "The Woods", publisher: "Boom! Studios" },
    ];
    const seen = new Set(
      finalRenderDocs.map((doc: any) => String(doc?.title || doc?.rawDoc?.title || "").trim().toLowerCase()).filter(Boolean)
    );
    for (const row of emergencyTitles) {
      if (finalRenderDocs.length >= 10) break;
      const key = String(row.title).trim().toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      finalRenderDocs.push({
        key: `comicvine-router-emergency:${key}`,
        sourceId: `comicvine-router-emergency:${key}`,
        title: row.title,
        author_name: ["Unknown"],
        source: "comicVine",
        publisher: row.publisher,
        subject: ["graphic novel", "comics", "teen"],
        language: "en",
        score: 0.5,
        diagnostics: { comicvineRouterEmergencyFallback: true },
      } as any);
    }
  }
  const finalItems = finalRenderDocs.map((doc:any) => ({ kind: "open_library", doc }));
  const outputItems = finalItems;
  if (teenPostPassOutputLength > 0 && outputItems.length === 0) {
    console.error("POSTPASS_OUTPUT_DROPPED_BEFORE_RETURN", { teenPostPassOutputLength, teenPostPassOutputTitles });
  }
  const finalItemsLength = outputItems.length;
  const finalItemsTitles = outputItems.map((it:any)=>String(it?.doc?.title || "").trim()).filter(Boolean);
  const comicVineFinalScoreByTitle = finalRenderDocs
    .filter((doc:any)=>String(doc?.source || doc?.rawDoc?.source || "").toLowerCase().includes("comicvine"))
    .map((doc:any)=>({ title: String(doc?.title || ""), finalScore: Number(doc?.score ?? doc?.diagnostics?.finalScore ?? 0) }));
  const comicVineScoreBreakdownByTitle = finalRenderDocs
    .filter((doc:any)=>String(doc?.source || doc?.rawDoc?.source || "").toLowerCase().includes("comicvine"))
    .map((doc:any)=>({
      title: String(doc?.title || ""),
      canonicalAnchorTitleBoost: Number((doc?.diagnostics as any)?.canonicalAnchorTitleBoost ?? 0),
      entryPointBoost: Number((doc?.diagnostics as any)?.entryPointBoost ?? 0),
      sideStoryPenalty: Number((doc?.diagnostics as any)?.sideStoryPenalty ?? 0),
      foreignEditionPenalty: Number((doc?.diagnostics as any)?.foreignEditionPenalty ?? 0),
      issueFragmentPenalty: Number((doc?.diagnostics as any)?.issueFragmentPenalty ?? 0),
      collectionEditionBoost: Number((doc?.diagnostics as any)?.collectionEditionBoost ?? 0),
      finalScore: Number(doc?.score ?? doc?.diagnostics?.finalScore ?? 0),
    }));
  const finalSortFieldUsed = "finalScore";
  const finalSortSource = "finalRecommenderForDeck";
  const returnedItemsLength = outputItems.length;
  const returnedItemsTitles = finalItemsTitles;
  const renderedTopRecommendationsLength = outputItems.length;
  if (finalAcceptedDocsLength > 0 && finalRankedDocsBase.length === 0 && rankedDocs.length === 0 && teenPostPassInputLength === 0 && renderedTopRecommendationsLength === 0) {
    console.error("FINAL_ACCEPTED_LINEAGE_INVARIANT_FAILED", { finalAcceptedDocsLength, finalAcceptedDocsSource, finalAcceptedDocsTitles });
  }
  const finalAcceptedDocIds = finalRankedDocsBase.map((doc: any) => String(doc?.sourceId || doc?.canonicalId || doc?.id || doc?.key || doc?.title || "").trim()).filter(Boolean);
  const finalRejectedDocIds = Array.isArray(finalDebugSnapshot?.rejected)
    ? finalDebugSnapshot.rejected.map((row: any) => String(row?.id || row?.title || "").trim()).filter(Boolean)
    : [];
  const returnedDocIds = outputItems.map((it: any) => String(it?.doc?.sourceId || it?.doc?.canonicalId || it?.doc?.id || it?.doc?.key || it?.doc?.title || "").trim()).filter(Boolean);
  const finalItemsRejectedTitles = teenPostPassRejectedTitles;
  const finalItemsRejectReasons = teenPostPassRejectReasons;
  const finalSeriesKeys = finalRenderDocs.map((doc:any) => finalSeriesKeyForRender(doc));
  const finalSeriesCounts = finalSeriesCapResult.counts;
  const finalRenderSeriesCapApplied = teenPostPassSeriesCapApplied || finalSeriesCapResult.dropped.length > 0;
  const finalRenderSourceCapApplied = teenPostPassSourceCapApplied;
  const finalRenderDuplicateCollapseApplied = finalAcceptedDocsLength > renderedTopRecommendationsLength;
  const finalSeriesCapDroppedTitles = finalSeriesCapResult.dropped.map((row) => row.title);
  const finalSeriesCapDroppedReasons = finalSeriesCapResult.dropped.map((row) => row.reason);
  const renderLeakDetected = finalRejectedTitles.some((title: string) => finalItemsTitles.includes(title));
  const finalHandoffEmptyReason = finalAcceptedDocsLength > 0 && rankedDocsLength === 0 ? "final_recommender_handoff_empty" : "none";
  const droppedBeforeRenderReason =
    renderedTopRecommendationsLength === 0
      ? (finalHandoffEmptyReason !== "none"
          ? finalHandoffEmptyReason
          : includeComicVine && aggregatedRawFetched.comicVine > 0
          ? "comicvine_all_candidates_rejected_after_fetch"
          : finalAcceptedDocsLength <= 0
          ? "no_candidates_survived_filtering"
          : teenPostPassInputLength === 0
          ? "no_postfilter_candidates"
          : teenPostPassOutputLength === 0
          ? "teen_postpass_eliminated_all"
          : "render_mapping_empty_after_final")
      : "none";
  const builtFromQueryRaw =
    (google as any)?.builtFromQuery ||
    (openLibrary as any)?.builtFromQuery ||
    bucketPlan.preview ||
    bucketPlan.queries?.[0] ||
    "";
  const comicVineOnlyMode =
    includeComicVine &&
    !sourceEnabled.googleBooks &&
    !sourceEnabled.openLibrary &&
    !sourceEnabled.localLibrary &&
    !includeKitsu;
  const builtFromQuery = comicVineOnlyMode
    ? String(builtFromQueryRaw)
        .replace(/\bpsychological suspense novel\b/gi, "psychological suspense graphic novel")
        .replace(/\bpsychological thriller novel\b/gi, "psychological thriller graphic novel")
        .replace(/\bpsychological mystery novel\b/gi, "psychological mystery graphic novel")
        .replace(/\bmystery suspense novel\b/gi, "mystery suspense graphic novel")
        .replace(/\bpsychological horror novel\b/gi, "psychological horror graphic novel")
        .replace(/\bdark fantasy novel\b/gi, "dark fantasy graphic novel")
    : builtFromQueryRaw;

  const fetchedRawCount = Number(aggregatedRawFetched.comicVine || 0);
  const normalizedCount = Number(comicVinePipelineTraceCounts?.normalized || 0);
  const candidateCount = Number(gcdCandidatesWithRescue.length || 0);
  const filteredCount = Number(normalizedCandidates.length || 0);
  const rankedCount = Number(rankedDocsLength || 0);
  const renderedCount = Number(outputItems.length || 0);
  const healthyRawCollapsedPipelineFailure =
    includeComicVine &&
    fetchedRawCount >= 60 &&
    (candidateCount <= 3 || rankedCount === 0);
  const normalizedCandidateCollapseFailure = includeComicVine && normalizedCount >= 100 && candidateCount <= 5;
  const hardPipelineFailure = Boolean(comicVinePipelineFailureDetected || healthyRawCollapsedPipelineFailure || normalizedCandidateCollapseFailure);

  const fallbackItems = outputItems.filter((item: any) => String(item?.doc?.source || item?.source || "").includes("fallback") || String(item?.doc?.queryText || "") === "comicvine_publisher_facet_fallback");
  const nonFallbackItems = outputItems.filter((item: any) => !fallbackItems.includes(item));
  const mixedFallbackOutput = fallbackItems.length > 0 && nonFallbackItems.length > 0;
  const outputItemsNoMixedFallback = mixedFallbackOutput ? nonFallbackItems : outputItems;
  const suppressTopRecommendations = hardPipelineFailure && rankedCount === 0;
  const finalOutputItems = suppressTopRecommendations ? [] : outputItemsNoMixedFallback;

  if (hardPipelineFailure) {
    sourceSkippedReason.push(`PIPELINE_FAILURE:raw=${fetchedRawCount},normalized=${normalizedCount},candidates=${candidateCount},ranked=${rankedCount}`);
  }
  return {
    engineId: preferredEngine,
    engineLabel,
    deckKey: routingInput.deckKey,
    domainMode:
      routingInput.deckKey === "k2"
        ? (routingInput.domainModeOverride ?? "chapterMiddle")
        : (routingInput.domainModeOverride ?? "default"),
    builtFromQuery,
    items: finalOutputItems,
    comicVineSampleTitlesByQuery,
    comicVineRejectedSampleTitlesByQuery,
    comicVineRejectedSampleReasonsByQuery,
    comicVineRescueRejectedTitlesByQuery,
    debugSourceStats,
    debugCandidatePool: candidatePoolPreview,
    debugRawPool,
    debugRungStats: buildRungDiagnostics(normalizedCandidates),
    debugFilterAudit: filterAuditRows,
    debugFilterAuditSummary: filterAuditSummary,
    debugFinalRecommender: finalDebugSnapshot,
    tasteProfileText,
    candidateProfileTextById,
    embeddingSimilarityById,
    aiRerankInputCount,
    aiRerankOutput,
    aiSelectionReasonById,
    aiSelectionBucketById,
    aiGuardrailRejectedIds,
    finalSelectionMode,
    finalAcceptedDocsLength,
    renderedTopRecommendationsLength: finalOutputItems.length,
    teenPostPassOutputTitles,
    teenPostPassRejectedTitles,
    teenPostPassRejectReasons,
    teenPostPassSourceCapApplied,
    teenPostPassSeriesCapApplied,
    finalItemsRejectedTitles,
    finalItemsRejectReasons,
    finalRenderSeriesCapApplied,
    finalRenderSourceCapApplied,
    finalRenderDuplicateCollapseApplied,
    finalSeriesKeys,
    finalSeriesCounts,
    finalSeriesCap,
    finalSeriesCapDroppedTitles,
    finalSeriesCapDroppedReasons,
    finalItemsLength,
    finalItemsTitles,
    returnedItemsLength: finalOutputItems.length,
    returnedItemsTitles: finalOutputItems.map((item:any)=>String(item?.doc?.title || item?.title || "").trim()).filter(Boolean),
    finalAcceptedDocIds,
    finalRejectedDocIds,
    returnedDocIds,
    renderLeakDetected,
    teenPostPassInputLength,
    teenPostPassOutputLength,
    teenPostPassInputSource,
    finalRankedDocsBaseLength,
    rankedDocsLength,
    finalRankedDocsLength: finalRankedDocs.length,
    finalRankedDocsTitles: finalRankedDocs.map((doc:any)=>String(doc?.title || doc?.rawDoc?.title || "").trim()).filter(Boolean),
    comicVineFinalScoreByTitle,
    comicVineScoreBreakdownByTitle,
    finalSortFieldUsed,
    finalSortSource,
    finalRecommenderReturnedKeys: Object.keys(finalDebugSnapshot || {}),
    finalRecommenderRankedDocsLength: rankedDocsLength,
    finalRecommenderAcceptedDocsLength: finalAcceptedDocsLength,
    finalRecommenderAcceptedTitles: finalAcceptedDocsTitles,
    routerReceivedRankedDocsLength: rankedDocsLength,
    routerReceivedRankedDocsTitles: rankedDocsTitles,
    finalHandoffEmptyReason,
    finalAcceptedDocsSource,
    finalAcceptedDocsTitles,
    finalRankedDocsBaseTitles,
    rankedDocsTitles,
    droppedBeforeRenderReason,
    debugNytAnchors: nytAnchorDebug,
    sourceEnabled,
    sourceSkippedReason,
    comicVineAdapterStatus,
    comicVineQueryDerivedCount,
    comicVineFallbackCount,
    comicVineFallbackOnlyResult,
    comicVineFallbackLeakageWarning,
    comicVineRecommendationSetMode,
    comicVineNormalRecommendationSet,
    comicVinePipelineTraceCounts,
    comicVinePipelineFailureDetected,
    comicVinePipelineFailureReason,
    fetchedRawCount,
    normalizedCount,
    candidateCount,
    filteredCount,
    rankedCount,
    renderedCount: finalOutputItems.length,
    mixedFallbackOutput,
    suppressTopRecommendations,
    comicVineNormalizationDropCount,
    comicVineNormalizationDroppedTitles,
    comicVineCandidateCollapseDetected,
    normalizedCandidateCollapseFailure,
    debugRouterVersion,
    routerResultTracePresent: true,
    routerResultKeys: Object.keys({
      debugComicVineDispatchTrace: true,
      debugGcdDispatchTrace: true,
      sourceEnabled: true,
      debugRouterVersion: true,
      debugSourceStats: true,
      builtFromQuery: true,
      routerResultTracePresent: true,
    }),
    debugGcdDispatchTrace: comicVineDispatchTrace,
    debugComicVineDispatchTrace: comicVineDispatchTrace,
    deploymentRuntimeMarker,
  } as RecommendationResult;
}
