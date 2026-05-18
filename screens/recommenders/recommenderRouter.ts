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

const RECENT_FRESH_HISTORY_LIMIT = 6;
const recentFreshReturnedTitles: string[][] = [];
const recentFreshReturnedRoots: string[][] = [];
const recentFreshTasteSignatures: string[] = [];
let previousPrimaryTasteQueryPoolTitles: string[] = [];
let previousPrimaryTasteQueryPoolRoots: string[] = [];
let previousStaticRungPoolRoots: string[] = [];

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
  if (/something\s+is\s+killing\s+the\s+children.*\bdeluxe\b/.test(title)) return "something-is-killing-the-children";
  return title.split(':')[0].replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function parentFranchiseRootForDoc(doc: any): string {
  const parentMeta =
    doc?.parentVolumeName ||
    doc?.parentVolume?.name ||
    doc?.canonicalParentTitle ||
    doc?.series ||
    doc?.rawDoc?.parentVolumeName ||
    doc?.rawDoc?.parentVolume?.name ||
    doc?.rawDoc?.canonicalParentTitle ||
    doc?.rawDoc?.series ||
    doc?.rawDoc?.rawDoc?.parentVolumeName ||
    doc?.rawDoc?.rawDoc?.parentVolume?.name ||
    doc?.rawDoc?.rawDoc?.canonicalParentTitle ||
    doc?.rawDoc?.rawDoc?.series ||
    doc?.diagnostics?.parentVolumeName ||
    doc?.rawDoc?.diagnostics?.parentVolumeName ||
    doc?.rawDoc?.rawDoc?.diagnostics?.parentVolumeName ||
    "";
  const parent = String(parentMeta || "").toLowerCase();
  const fallback = finalSeriesKeyForRender(doc);
  const raw = (parent.trim() ? parent : fallback).split(":")[0].replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  if (raw === "walking-dead" || raw === "the-walking-dead") return "the-walking-dead";
  return raw;
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

function enrichComicVineStructuralMetadata(docs: RecommendationDoc[]): RecommendationDoc[] {
  return asArray(docs).map((doc: any) => {
    const title = String(doc?.title || "");
    const subtitle = String(doc?.subtitle || "");
    const parent = String(doc?.parentVolumeName || doc?.rawDoc?.parentVolumeName || doc?.diagnostics?.parentVolumeName || doc?.rawDoc?.diagnostics?.parentVolumeName || "").trim();
    const bag = normalizeText(`${title} ${subtitle}`);
    const issueLike = /#\s*\d+\b/.test(title) && !/\b(vol\.?|volume|tpb|collection|omnibus|deluxe|book)\b/i.test(title);
    const collectedLike = /\b(volume one|volume 1|book one|book 1|tpb|collection|omnibus|deluxe|anthology|marvel-verse)\b/i.test(bag);
    const entryPointLike = /\b(volume one|volume 1|book one|book 1|#1)\b/i.test(bag);
    return {
      ...doc,
      parentVolumeName: parent || doc?.parentVolumeName,
      diagnostics: {
        ...(doc?.diagnostics || {}),
        gcdStructuralEnriched: true,
        gcdIssueLike: issueLike,
        gcdCollectedLike: collectedLike,
        gcdEntryPointLike: entryPointLike,
        gcdParentRoot: parent ? parent.split(":")[0].trim() : undefined,
      },
    };
  });
}

function isCollectedStarterLikeText(text: string): boolean {
  return /\b(volume one|volume 1|book one|book 1|tpb|trade paperback|omnibus|collection|compendium|master edition|treasury edition|deluxe edition)\b/i.test(text);
}

function isLikelySubtitleFragmentTitle(title: string): boolean {
  const t = normalizeText(String(title || ""));
  if (!t) return false;
  if (isCollectedStarterLikeText(t)) return false;
  if (/\b(part|chapter)\s*(one|two|three|four|five|six|seven|eight|nine|ten|\d+)\b/.test(t)) return true;
  if (/\b\w+\s+of\s+\w+\b/.test(t)) return true;
  if (/\b(conclusion|the end of|finale|aftermath)\b/.test(t)) return true;
  if (/^[a-z0-9' -]{1,40}$/.test(t) && t.split(" ").length <= 4) return true;
  return false;
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

  const tagEntries = Object.entries((input.tagCounts || routingInput.tagCounts || {}) as Record<string, number>).filter(([, v]) => Number(v || 0) > 0);
  const swipeSignalCount = tagEntries.reduce((acc, [, v]) => acc + Number(v || 0), 0);

  const genericSignalPattern = /^(audience:|age:|media:|format:|series$|facet:|source:|universe:)/;
  const likedWeightedSignals = Object.entries(((routingInput as any)?.tagCounts || {}) as Record<string, number>)
    .map(([signal, weight]) => ({ signal: String(signal || ""), weight: Number(weight || 0) }))
    .filter((row) => row.weight > 0)
    .sort((a, b) => b.weight - a.weight);
  const combinedDislikedTagCounts = {
    ...(((routingInput as any)?.dislikedTagCounts || {}) as Record<string, number>),
    ...Object.fromEntries(Object.entries((((routingInput as any)?.leftTagCounts || {}) as Record<string, number>)).map(([k, v]) => [k, Number(v || 0) + Number((((routingInput as any)?.dislikedTagCounts || {}) as any)?.[k] || 0)])),
  } as Record<string, number>;
  const dislikedWeightedSignals = Object.entries(combinedDislikedTagCounts)
    .map(([signal, weight]) => ({ signal: String(signal || ""), weight: Number(weight || 0) }))
    .filter((row) => row.weight > 0)
    .sort((a, b) => b.weight - a.weight);
  const skippedWeightedSignals = Object.entries((((routingInput as any)?.skippedTagCounts || {}) as Record<string, number>))
    .map(([signal, weight]) => ({ signal: String(signal || ""), weight: Number(weight || 0) }))
    .filter((row) => row.weight > 0)
    .sort((a, b) => b.weight - a.weight);

  const genreLexicon = ["fantasy", "adventure", "horror", "thriller", "mystery", "dystopian", "romance", "science fiction", "superheroes", "crime", "historical"];
  const toneLexicon = ["dark", "hopeful", "warm", "fast-paced", "spooky", "gentle", "playful", "energetic", "atmospheric"];
  const themeLexicon = ["survival", "identity", "friendship", "coming of age", "systemic injustice", "mythology", "school", "family", "political", "war & society"];
  const normalizeSignal = (v: string) => normalizeText(String(v || "").replace(/^(genre:|tone:|mood:|theme:|drive:)/, "").replace(/_/g, " ").trim());
  const canonicalize = (v: string) => normalizeSignal(v).replace(/\s*&\s*/g, " and ");
  const matchesLexicon = (signal: string, lexicon: string[]) => {
    const n = canonicalize(signal);
    return lexicon.find((token) => {
      const t = canonicalize(token);
      return n === t || n.includes(t) || t.includes(n);
    }) || "";
  };
  const nonGenericLikedSignals = likedWeightedSignals.map((r) => r.signal).filter((s) => !genericSignalPattern.test(normalizeText(s)));

  const likedGenres = Array.from(new Set(nonGenericLikedSignals.map((s) => matchesLexicon(s, genreLexicon)).filter(Boolean))).map((v) => `genre:${v}`);
  const likedTones = Array.from(new Set(nonGenericLikedSignals.map((s) => matchesLexicon(s, toneLexicon)).filter(Boolean))).map((v) => `tone:${v}`);
  const likedThemes = Array.from(new Set(nonGenericLikedSignals.map((s) => matchesLexicon(s, themeLexicon)).filter(Boolean))).map((v) => `theme:${v}`);

  const tasteProfileSummary = {
    likedGenres: likedGenres.slice(0, 6),
    likedTones: likedTones.slice(0, 6),
    likedThemes: likedThemes.slice(0, 6),
    dislikedSignals: dislikedWeightedSignals.map((r) => r.signal).slice(0, 8),
    skippedSignals: skippedWeightedSignals.map((r) => r.signal).slice(0, 8),
  };

  const weightedLikedSignalsPresentButNotPromoted = nonGenericLikedSignals.length > 0 && (tasteProfileSummary.likedGenres.length + tasteProfileSummary.likedTones.length + tasteProfileSummary.likedThemes.length) === 0;
  const dislikeOnlySession = swipeSignalCount > 0 && likedWeightedSignals.length === 0 && dislikedWeightedSignals.length > 0;
  const dislikeProfileBuilt = dislikedWeightedSignals.length > 0;
  const dislikedSignalsPromoted = dislikedWeightedSignals.map((r) => r.signal).slice(0, 20);
  const retrievalSuppressedByDislikedSignals: string[] = [];
  let fallbackBlockedByDislikeOnlySession = false;
  const tasteProfileBuildFailure =
    weightedLikedSignalsPresentButNotPromoted || (
      tasteProfileSummary.likedGenres.length === 0 &&
      tasteProfileSummary.likedTones.length === 0 &&
      tasteProfileSummary.likedThemes.length === 0 &&
      tasteProfileSummary.dislikedSignals.length === 0 &&
      tasteProfileSummary.skippedSignals.length === 0
    );
  const tasteProfileBuildFailureReason = weightedLikedSignalsPresentButNotPromoted
    ? "weighted liked signals not promoted"
    : (tasteProfileBuildFailure
      ? (swipeSignalCount > 8 ? "swipe_signals_present_but_profile_empty" : "no_swipe_signals_resolved_from_tagcounts_or_taste_profile")
      : "none");
  if (swipeSignalCount > 8 && tasteProfileBuildFailure) {
    console.error("Taste profile unexpectedly empty", { swipeSignalCount, tagEntryCount: tagEntries.length, nonGenericLikedSignals: nonGenericLikedSignals.slice(0, 20) });
  }
  const preDispatchTasteProfileSummary = tasteProfileSummary;
  const preDispatchGeneratedQueries: string[] = [];
  const likedSignalsSafe = Array.isArray((tasteProfileSummary as any)?.likedSignals) ? (tasteProfileSummary as any).likedSignals : [];
  const dislikedSignalsSafe = Array.isArray((tasteProfileSummary as any)?.dislikedSignals) ? (tasteProfileSummary as any).dislikedSignals : [];
  const likedGenresSafe = Array.isArray((tasteProfileSummary as any)?.likedGenres) ? (tasteProfileSummary as any).likedGenres : [];
  const likedTonesSafe = Array.isArray((tasteProfileSummary as any)?.likedTones) ? (tasteProfileSummary as any).likedTones : [];
  const likedThemesSafe = Array.isArray((tasteProfileSummary as any)?.likedThemes) ? (tasteProfileSummary as any).likedThemes : [];
  const likedTagCountsSafe = (((input as any)?.likedTagCounts || {}) as Record<string, number>);
  const dislikedSet = new Set(dislikedSignalsSafe.map((s: string) => normalizeText(s)));
  const genres = likedGenresSafe.map((s: string) => s.replace(/^genre:/, "").replace(/_/g, " ").trim()).filter(Boolean);
  const tones = likedTonesSafe.map((s: string) => s.replace(/^(tone:|mood:)/, "").replace(/_/g, " ").trim()).filter(Boolean);
  const themes = likedThemesSafe.map((s: string) => s.replace(/^(theme:|drive:)/, "").replace(/_/g, " ").trim()).filter(Boolean);
  const likedSignalsText = normalizeText([
    ...likedSignalsSafe,
    ...Object.keys(likedTagCountsSafe),
  ].join(" "));
  const eerieArchetypeProfile =
    /\b(hollow knight|slay the spire|good place|existential|surreal|atmospheric|lore)\b/.test(likedSignalsText) ||
    ((genres.includes("fantasy") || genres.includes("mystery")) && (tones.includes("dark") || tones.includes("atmospheric")));
  const socialMysteryProfile =
    /\b(veronica mars|social|investigation|detective|school mystery)\b/.test(likedSignalsText) ||
    (genres.includes("mystery") && (themes.includes("coming of age") || themes.includes("social")));
  const narrativeSeriesForms = (base: string) => ([
    `${base} comic series`,
    `${base} collected edition`,
    `${base} comic volume 1`,
    `${base} trade paperback`,
    `${base} limited series`,
  ]);
  const combinedQueries = [
    ...(genres.length >= 2 ? narrativeSeriesForms(`${genres[0]} ${genres[1]}`) : []),
    ...(genres.includes("superheroes") && genres.includes("fantasy") ? ["superhero fantasy comic"] : []),
    ...(genres.includes("mystery") && genres.includes("fantasy") ? narrativeSeriesForms("mystery fantasy") : []),
    ...(genres.includes("dystopian") && themes.includes("survival") ? narrativeSeriesForms("dystopian survival") : []),
    ...(genres.includes("dystopian") && genres.includes("thriller") ? narrativeSeriesForms("dystopian thriller") : []),
    ...(genres.includes("mystery") && genres.includes("thriller") ? narrativeSeriesForms("mystery thriller") : []),
    ...(genres.includes("romance") && themes.includes("coming of age") ? narrativeSeriesForms("romance coming of age") : []),
    ...(genres.includes("fantasy") && themes.includes("mythology") ? narrativeSeriesForms("fantasy mythology") : []),
  ];
  const semanticRefinementQueries = Array.from(new Set([
    ...(genres.includes("thriller") || genres.includes("mystery") ? ["psychological suspense comic series", "character driven thriller comic series", "social paranoia thriller comic series"] : []),
    ...(genres.includes("horror") ? ["psychological horror suspense comic series", "character driven survival horror comic series"] : []),
    ...(themes.includes("coming of age") && (genres.includes("thriller") || genres.includes("mystery")) ? ["teen conspiracy thriller comic series"] : []),
    ...(themes.includes("survival") && genres.includes("mystery") ? ["mystery survival drama comic series"] : []),
  ]));
  const broadGraphicQueries = Array.from(new Set([
    ...genres.map((v) => `${v} graphic novel`),
    ...tones.map((v) => `${v} graphic novel`),
    ...themes.map((v) => `${v} graphic novel`),
  ]));
  const curatedSeedRootsUsed: string[] = [];
  const curatedSeedMatchesFound: string[] = [];
  let candidateGenerationMode: "taste_narrative" | "taste_plus_curated" | "broad_only" | "static_fallback" = "static_fallback";
  let queryGeneratedGoodCandidateCount = 0;
  let queryGeneratedArtifactCount = 0;
  const curatedRootsByPattern: string[] = [];
  if (genres.includes("fantasy") && genres.includes("adventure")) curatedRootsByPattern.push("Amulet", "Bone", "Wynd", "Lightfall", "The Last Kids on Earth");
  if (genres.includes("mystery") && (genres.includes("crime") || themes.includes("historical"))) curatedRootsByPattern.push("Goldie Vance", "Enola Holmes", "Stumptown", "Blacksad");
  if ((genres.includes("fantasy") || genres.includes("supernatural")) && tones.includes("gentle") && themes.includes("coming of age")) curatedRootsByPattern.push("Natsume", "The Tea Dragon Society", "Witch Hat Atelier");
  if (genres.includes("dystopian") && genres.includes("mystery") && themes.includes("survival")) curatedRootsByPattern.push("Lazarus", "Sweet Tooth", "Y: The Last Man", "The Walking Dead");
  if (genres.includes("fantasy") && genres.includes("mystery") && (tones.includes("atmospheric") || tones.includes("dark"))) curatedRootsByPattern.push("Locke & Key", "The Sandman", "Monstress", "The Woods");
  if (genres.includes("romance") && themes.includes("coming of age") && genres.includes("superheroes")) curatedRootsByPattern.push("Ms. Marvel", "Runaways", "Young Avengers", "Lumberjanes");
  if (genres.includes("mystery") && genres.includes("dystopian") && (themes.includes("teen") || themes.includes("coming of age"))) {
    curatedRootsByPattern.push("Paper Girls", "Morning Glories", "Gotham Academy", "The Woods", "The Unwritten");
  }
  if (genres.includes("mystery") && genres.includes("thriller") && (genres.includes("horror") || themes.includes("survival"))) {
    curatedRootsByPattern.push("Something is Killing the Children", "Locke & Key", "Wytches", "Nailbiter", "Harrow County");
  }
  if (genres.includes("dystopian") && genres.includes("romance") && themes.includes("coming of age")) {
    curatedRootsByPattern.push("Paper Girls", "On a Sunbeam", "Laura Dean Keeps Breaking Up With Me", "Fence", "Snotgirl");
  }
  const darkFantasyEmotionalMythologyProfile =
    genres.includes("fantasy") &&
    (tones.includes("dark") || tones.includes("atmospheric")) &&
    (themes.includes("mythology") || themes.includes("emotional growth") || themes.includes("coming of age"));
  if (darkFantasyEmotionalMythologyProfile) {
    curatedRootsByPattern.push("Monstress", "Coda", "The Last God", "Seven to Eternity", "Sandman", "Norse Mythology");
  }
  const romanceComingOfAgeWarmthProfile =
    genres.includes("romance") &&
    themes.includes("coming of age") &&
    (tones.includes("warm") || tones.includes("gentle") || tones.includes("hopeful") || tones.includes("anime-like"));
  if (romanceComingOfAgeWarmthProfile) {
    curatedRootsByPattern.push("Laura Dean Keeps Breaking Up With Me", "Bloom", "Heartstopper", "Fence", "Mooncakes");
  }
  const fantasyDystopianIdentityPoliticalProfile =
    genres.includes("fantasy") &&
    genres.includes("dystopian") &&
    (themes.includes("identity") || themes.includes("political") || themes.includes("politics"));
  if (fantasyDystopianIdentityPoliticalProfile) {
    curatedRootsByPattern.push("Paper Girls", "Wynd", "The Woods", "On a Sunbeam", "Die", "East of West");
  }
  if (eerieArchetypeProfile) {
    curatedRootsByPattern.push("Die", "Monstress", "Coda", "The Last God", "Seven to Eternity", "The Wicked + The Divine", "Sandman Universe", "Gideon Falls");
  }
  if (socialMysteryProfile) {
    curatedRootsByPattern.push("Gotham Academy", "Paper Girls", "The Fade Out", "Blacksad", "Velvet");
  }
  const curatedSeedQueries = Array.from(new Set(curatedRootsByPattern.flatMap((root) => [`${root} comic series`, `${root} volume 1`, `${root} collected edition`])));
  curatedSeedRootsUsed.push(...curatedRootsByPattern);
  let generatedComicVineQueriesFromTaste = Array.from(new Set([
    ...combinedQueries,
    ...semanticRefinementQueries,
    ...broadGraphicQueries,
    ...curatedSeedQueries,
  ].map((q) => q.replace(/\s+/g, " ").trim()).filter((q) => {
    const nq = normalizeText(q);
    return !Array.from(dislikedSet).some((d) => d && nq.includes(d));
  })))
    .map((q) => q.replace(/\b(comic series)\s+\1\b/gi, "$1").replace(/\b(collected edition)\s+\1\b/gi, "$1").replace(/\s+/g, " ").trim())
    .slice(0, 10);
  if (dislikeOnlySession && generatedComicVineQueriesFromTaste.length === 0) {
    generatedComicVineQueriesFromTaste = [
      "grounded character driven comic series",
      "literary suspense comic collected edition",
      "non-fantasy contemporary comic collected edition",
      "realistic mystery comic series",
      "slice of life comic collected edition",
    ];
  }
  const staticDefaultQueries = new Set(["something is killing the children", "sweet tooth", "ms. marvel", "psychological suspense graphic novel"]);
  let staticDefaultQueriesUsed = false;
  let staticDefaultQueriesSuppressedReason = "none";
  let querySourceOfTruth: "taste_profile" | "fallback_static" | "expansion_static" | "error" = "fallback_static";
  let tasteQueriesUsedForPrimaryFetch = false;
  let tasteQueryPoolUsedAsPrimary = false;
  let primaryTasteQueryPoolTitles: string[] = [];
  let primaryTasteQueryPoolRoots: string[] = [];
  let staticRungPoolRoots: string[] = [];
  let preFilterPoolBuiltFrom = "unknown";
  let preFilterPoolOverlapWithPreviousSession = 0;
  let tasteQueriesBlockedByReason = "none";
  let finalRungQueriesSource = "existing_rungs";
  let primaryNarrativeQueryMode = false;
  let primaryNarrativeQueries: string[] = [];
  let broadGraphicNovelQueriesUsedAsFallback = false;
  let broadGraphicNovelFallbackReason = "none";
  let primaryTasteQueryOverrideApplied = false;
  let primaryTasteQueryOverrideBlockedReason = "not_evaluated";
  let primaryRungZeroSource = "none";
  if (sourceEnabled.comicVine && generatedComicVineQueriesFromTaste.length > 0) {
    const narrativePrimary = generatedComicVineQueriesFromTaste.filter((q) => /\b(comic series|collected edition|volume 1|trade paperback|limited series)\b/i.test(q));
    const broadFallback = generatedComicVineQueriesFromTaste.filter((q) => /\bgraphic novel\b/i.test(q));
    const primaryQueries = narrativePrimary.length > 0 ? narrativePrimary : broadFallback;
    primaryNarrativeQueryMode = narrativePrimary.length > 0;
    primaryNarrativeQueries = narrativePrimary.slice(0, 12);
    broadGraphicNovelQueriesUsedAsFallback = narrativePrimary.length === 0 && broadFallback.length > 0;
    broadGraphicNovelFallbackReason = broadGraphicNovelQueriesUsedAsFallback ? "no_narrative_series_queries_built" : "none";
    rungs = primaryQueries.map((query, index) => ({ rung: index, query, queryFamily: routerFamily, laneKind: "swipe-taste-driven" }));
    staticDefaultQueriesSuppressedReason = "replaced_with_swipe_taste_queries";
    querySourceOfTruth = "taste_profile";
    tasteQueriesUsedForPrimaryFetch = true;
    finalRungQueriesSource = "taste_profile";
    tasteQueryPoolUsedAsPrimary = true;
    primaryTasteQueryOverrideApplied = true;
    primaryTasteQueryOverrideBlockedReason = "none";
    candidateGenerationMode = curatedSeedQueries.length > 0 ? "taste_plus_curated" : (narrativePrimary.length > 0 ? "taste_narrative" : "broad_only");
    rungs = rungs.filter((r: any) => !Array.from(staticDefaultQueries).some((seed) => normalizeText(String(r?.query || "")).includes(normalizeText(seed))));
  }
  rungs = rungs.filter((r: any) => {
    const q = normalizeText(String(r?.query || ""));
    if (Array.from(dislikedSet).some((d) => d && q.includes(d))) {
      retrievalSuppressedByDislikedSignals.push(String(r?.query || ""));
      return false;
    }
    const usedStatic = Array.from(staticDefaultQueries).some((seed) => q.includes(normalizeText(seed)));
    if (usedStatic) staticDefaultQueriesUsed = true;
    if (generatedComicVineQueriesFromTaste.length > 0 && usedStatic) return false;
    return true;
  });
  if (tasteProfileBuildFailure) {
    staticDefaultQueriesSuppressedReason = "taste_profile_build_failure_static_defaults_suppressed";
    rungs = rungs.filter((r: any) => !Array.from(staticDefaultQueries).some((seed) => normalizeText(String(r?.query || "")).includes(normalizeText(seed))));
  } else if (generatedComicVineQueriesFromTaste.length === 0) {
    staticDefaultQueriesSuppressedReason = "no_taste_specific_queries";
    tasteQueriesBlockedByReason = "generated_queries_empty";
    finalRungQueriesSource = dislikeOnlySession ? "dislike_only_exploration" : "fallback_static";
    primaryTasteQueryOverrideBlockedReason = "generated_queries_empty";
    if (dislikeOnlySession) {
      fallbackBlockedByDislikeOnlySession = true;
      rungs = rungs.filter((r: any) => !Array.from(staticDefaultQueries).some((seed) => normalizeText(String(r?.query || "")).includes(normalizeText(seed))));
    }
    candidateGenerationMode = "static_fallback";
  }

  const rungQueries = rungs.map((r: any) => String(r?.query || "").trim()).filter(Boolean);
  const mainRungQueriesLength = rungQueries.length;
  const rungZeroQuery = normalizeText(String(rungQueries[0] || ""));
  const rungZeroIsTasteDerived = generatedComicVineQueriesFromTaste.some((q) => normalizeText(q) === rungZeroQuery);
  const rungZeroIsStaticFallback = Array.from(staticDefaultQueries).some((q) => normalizeText(q) === rungZeroQuery);
  const tasteDerivedQuerySet = new Set(generatedComicVineQueriesFromTaste.map((q) => normalizeText(q)));
  primaryRungZeroSource = rungQueries.length === 0 ? "none" : (rungZeroIsTasteDerived ? "taste_profile" : (rungZeroIsStaticFallback ? "fallback_static" : "legacy_or_other"));
  if (sourceEnabled.comicVine && generatedComicVineQueriesFromTaste.length > 0 && (!rungZeroIsTasteDerived || querySourceOfTruth !== "taste_profile")) {
    throw new Error(`TASTE_QUERY_OVERRIDE_FAILED: generated taste queries exist but primary rung remained non-taste (rung0=${String(rungQueries[0] || "")}, source=${querySourceOfTruth})`);
  }
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
  const comicVineTasteQueriesAttempted = new Set<string>();
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
  let comicVinePreflightQuery = "";
  let comicVinePreflightUsesTasteQuery = false;
  const comicVinePerQueryFailureDoesNotAbort = true;
  let effectiveBucketPlanForExpansion: any = {
    ...bucketPlan,
    lane: routerFamily,
    family: routerFamily,
    hybridMode: isHybridMode,
    hybridLaneWeights,
    primaryLane: routerFamily,
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
    effectiveBucketPlanForExpansion = effectiveBucketPlan;
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
          tastePrimaryQueries: querySourceOfTruth === "taste_profile" ? rungQueries : [],
          forceTastePrimaryForComicVine: querySourceOfTruth === "taste_profile",
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
      const shouldDispatchComicVineForLane = includeComicVine && !comicVineDispatchedOnce;
      const comicVineDispatchedOnThisLane = shouldDispatchComicVineForLane;
      if (shouldDispatchComicVineForLane) {
        requests.push(getComicVineGraphicNovelRecommendations(laneInput));
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
        const query = String(lane.query || "comicvine_adapter");
        comicVinePreflightQuery = comicVinePreflightQuery || query;
        comicVinePreflightUsesTasteQuery = comicVinePreflightUsesTasteQuery || tasteDerivedQuerySet.has(normalizeText(query));
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
          for (const queryText of (value?.comicVineQueriesActuallyFetched || [])) {
            const q = String(queryText || "").trim();
            if (tasteDerivedQuerySet.has(normalizeText(q))) comicVineTasteQueriesAttempted.add(q);
          }
          if (querySourceOfTruth === "taste_profile") {
            const leakedStaticQuery = (value?.comicVineQueriesActuallyFetched || []).map((q:any)=>String(q || "").trim()).find((q:string) => {
              const nq = normalizeText(q);
              const isTaste = tasteDerivedQuerySet.has(nq);
              const isStatic = Array.from(staticDefaultQueries).some((seed) => normalizeText(seed) === nq);
              return !isTaste && isStatic;
            });
            if (leakedStaticQuery) {
              throw new Error(`TASTE_QUERY_STATIC_LEAKAGE: source=taste_profile but static query fetched (${leakedStaticQuery})`);
            }
          }
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
  const normalizeTitleForPool = (doc: any) => normalizeText(String(doc?.title || doc?.rawDoc?.title || ""));
  primaryTasteQueryPoolTitles = mergedDocs
    .filter((d: any) => String(d?.laneKind || "").includes("swipe-taste") || generatedComicVineQueriesFromTaste.some((q) => normalizeText(String(d?.queryText || "")).includes(normalizeText(q))))
    .map((d: any) => normalizeTitleForPool(d))
    .filter(Boolean);
  primaryTasteQueryPoolRoots = Array.from(new Set(mergedDocs
    .filter((d: any) => String(d?.laneKind || "").includes("swipe-taste") || generatedComicVineQueriesFromTaste.some((q) => normalizeText(String(d?.queryText || "")).includes(normalizeText(q))))
    .map((d: any) => parentFranchiseRootForDoc(d))
    .filter(Boolean)));
  staticRungPoolRoots = Array.from(new Set(mergedDocs
    .filter((d: any) => Array.from(staticDefaultQueries).some((seed) => normalizeText(String(d?.queryText || "")).includes(normalizeText(seed))))
    .map((d: any) => parentFranchiseRootForDoc(d))
    .filter(Boolean)));
  preFilterPoolBuiltFrom = tasteQueryPoolUsedAsPrimary ? "taste_profile" : "legacy_or_fallback";
  const currentPoolTitleSet = new Set(primaryTasteQueryPoolTitles);
  const prevPoolTitleSet = new Set(previousPrimaryTasteQueryPoolTitles);
  const overlap = Array.from(currentPoolTitleSet).filter((t) => prevPoolTitleSet.has(t)).length;
  preFilterPoolOverlapWithPreviousSession = overlap;
  previousPrimaryTasteQueryPoolTitles = Array.from(currentPoolTitleSet).slice(0, 200);
  previousPrimaryTasteQueryPoolRoots = Array.from(new Set(primaryTasteQueryPoolRoots)).slice(0, 100);
  previousStaticRungPoolRoots = Array.from(new Set(staticRungPoolRoots)).slice(0, 100);
  const comicVineFetchAttemptedFlag = includeComicVine && mainRungQueriesLength > 0;
  const comicVineFetchAttempted = Boolean(comicVineEnabledRuntime && comicVineFetchAttemptedFlag);
  const proxyHealthError = comicVineFetchResults.find((row) => String(row?.status || "").toLowerCase().includes("rejected") || row?.error)?.error || null;
  const proxyHealthStatus: "ok" | "failed" | "unknown" =
    !includeComicVine ? "unknown" : proxyHealthError ? "failed" : "ok";
  const kitsuFetchAttempted = Boolean(includeKitsu);
  const tasteQueriesNonEmpty = generatedComicVineQueriesFromTaste.length > 0;
  const attemptedTasteQueriesCount = Array.from(comicVineTasteQueriesAttempted).length;
  const allTasteQueriesAttemptedAndFailed = tasteQueriesNonEmpty &&
    generatedComicVineQueriesFromTaste.every((q) =>
      comicVineFetchResults.some((row) => normalizeText(String(row?.query || "")) === normalizeText(q) && String(row?.status || "").toLowerCase() === "error")
    );
  if (sourceEnabled.comicVine && includeComicVine && aggregatedRawFetched.comicVine === 0) {
    const missingProxy = comicVineFetchResults.some((row) => String(row?.error || "").includes("EXPO_PUBLIC_COMICVINE_PROXY_URL"));
    if (missingProxy) sourceSkippedReason.push("comicvine_proxy_missing");
    else if (!tasteQueriesNonEmpty || allTasteQueriesAttemptedAndFailed || attemptedTasteQueriesCount === 0) sourceSkippedReason.push("comicvine_enabled_but_not_queried");
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
  const commerciallyEnrichedDocs = enrichWithCommercialSignals(hardcoverEnrichedDocs);
  let expansionFetchAttempted = false;
  let cleanCandidateShortfallExpansionTriggered = false;
  let expansionFetchResultsByQuery: Array<{ query: string; status: string; rawCount: number; error?: string }> = [];
  let expansionRawCount = 0;
  let expansionConvertedCount = 0;
  let expansionMergedCandidateCount = 0;
  let expansionCleanEligibleCount = 0;
  let expansionSelectedTitles: string[] = [];
  let expansionNotTriggeredReason = "not_evaluated";
  const expansionExcludedRoots: string[] = [];
  const expansionRootDiversityCandidates: string[] = [];
  const expansionRejectedAsSaturatedRoot: Record<string, number> = {};
  const expansionSelectedRootCounts: Record<string, number> = {};
  const blockedExpansionQueryFragments = /(aftermath|vainqueurs|opportunity|all her monsters|storm the gates|the last stand|the road back)/i;
  const prioritizedExpansionRoots = ["locke-key", "sweet-tooth", "the-sandman", "runaways", "descender", "miles-morales", "spider-man", "black-science", "saga", "invincible"];
  const rootFromSeed = (v: string) => normalizeText(String(v || "")).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const selectedStarterRoots = new Set(
    commerciallyEnrichedDocs
      .filter((d: any) => /\b(volume one|volume 1|book one|book 1|compendium|collection|omnibus|treasury|master edition)\b/i.test(String(d?.title || "")))
      .map((d: any) => parentFranchiseRootForDoc(d))
      .filter(Boolean)
  );
  const expansionConvertedByQuery: Record<string, number> = {};
  const expansionDroppedByQueryReason: Record<string, Record<string, number>> = {};
  const expansionMergedTitlesByQuery: Record<string, string[]> = {};
  let expansionDistinctRootsBeforeSelection: string[] = [];
  let narrativeExpansionTriggered = false;
  let narrativeExpansionReason = "not_needed";
  let narrativeExpansionQueries: string[] = [];
  let narrativeExpansionRawCount = 0;
  let narrativeExpansionConvertedCount = 0;
  let narrativeExpansionViableCount = 0;
  let narrativeExpansionAcceptedTitles: string[] = [];
  let finalUnderfillAfterNarrativeExpansion = false;
  let narrativeExpansionCandidatesEnteredScoringCount = 0;
  const narrativeExpansionCandidatesDroppedBeforeScoringByReason: Record<string, number> = {};
  let narrativeExpansionCandidatesSurvivedScoringCount = 0;
  const narrativeExpansionCandidatesRejectedByFinalEligibilityReason: Record<string, number> = {};
  const narrativeExpansionFinalAcceptedTitles: string[] = [];
  let narrativeExpansionMergedDocs: any[] = [];
  const runExpansionQueries = async (queries: string[]): Promise<any[]> => {
    const allDocs: any[] = [];
    for (let idx = 0; idx < queries.length; idx += 1) {
      const q = queries[idx];
      try {
        const perQueryResult: any = await getComicVineGraphicNovelRecommendations({
          ...routedInput,
          bucketPlan: {
            ...(effectiveBucketPlanForExpansion || {}),
            queries: [q],
            preview: q,
            rungs: [{ rung: idx + 1, query: q, primary: q, secondary: null, queryFamily: (effectiveBucketPlanForExpansion as any)?.family || routerFamily }],
          },
        });
        const perItems = Array.isArray(perQueryResult?.items) ? perQueryResult.items : [];
        const perDocs = perItems.map((it: any) => it?.doc).filter(Boolean);
        expansionFetchResultsByQuery.push({ query: q, status: perDocs.length ? "ok" : "final_empty", rawCount: Number(perQueryResult?.debugRawFetchedCount || perDocs.length || 0) });
        expansionConvertedByQuery[q] = perDocs.length;
        expansionMergedTitlesByQuery[q] = perDocs.map((d: any) => String(d?.title || "")).filter(Boolean).slice(0, 10);
        allDocs.push(...perDocs);
      } catch (e: any) {
        expansionFetchResultsByQuery.push({ query: q, status: "error", rawCount: 0, error: String(e?.message || e) });
        expansionConvertedByQuery[q] = 0;
        expansionDroppedByQueryReason[q] = { fetch_error: 1 };
      }
    }
    return allDocs;
  };
  let enrichedDocs = enrichComicVineStructuralMetadata(commerciallyEnrichedDocs);
  if (includeComicVine) {
    const cleanEligibleBaseline = commerciallyEnrichedDocs.filter((doc: any) => {
      const t = normalizeText(`${doc?.title || ""} ${doc?.subtitle || ""}`);
      return Boolean(t) && !/^(the\s+walking\s+dead:\s*\.\.\.|\.\.\.)$/i.test(String(doc?.title || "").trim());
    });
    expansionCleanEligibleCount = cleanEligibleBaseline.length;
    if (cleanEligibleBaseline.length < 8) {
      cleanCandidateShortfallExpansionTriggered = true;
      expansionNotTriggeredReason = "clean_eligible_below_threshold";
      const candidateSeeds = Array.from(new Set([
        ...prioritizedExpansionRoots.map((r) => r.replace(/-/g, " ")),
        ...(Array.isArray(bucketPlan?.queries) ? bucketPlan.queries : []),
        ...(Array.isArray(rungs) ? rungs.map((r: any) => r?.query) : []),
      ].map((v) => String(v || "").trim()).filter(Boolean)));
      const expansionSeedQueries = candidateSeeds.filter((q) => {
        const root = rootFromSeed(q);
        if (!root) return false;
        expansionRootDiversityCandidates.push(root);
        if (blockedExpansionQueryFragments.test(q)) return false;
        if (selectedStarterRoots.has(root)) {
          expansionExcludedRoots.push(root);
          expansionRejectedAsSaturatedRoot[root] = Number(expansionRejectedAsSaturatedRoot[root] || 0) + 1;
          return false;
        }
        return true;
      }).slice(0, 8);
      if (expansionSeedQueries.length > 0) {
        expansionFetchAttempted = true;
        const expansionInput: RecommenderInput = {
          ...routedInput,
          bucketPlan: { ...(effectiveBucketPlanForExpansion || {}), queries: expansionSeedQueries },
        };
        try {
          expansionFetchResultsByQuery = [];
          const expansionDocs = await runExpansionQueries(expansionSeedQueries);
          expansionRawCount = expansionFetchResultsByQuery.reduce((acc, row) => acc + Number(row.rawCount || 0), 0);
          expansionConvertedCount = expansionDocs.length;
          expansionSelectedTitles = expansionDocs.map((d: any) => String(d?.title || '')).filter(Boolean).slice(0, 20);
          expansionDistinctRootsBeforeSelection = Array.from(new Set(expansionDocs.map((d: any) => parentFranchiseRootForDoc(d)).filter(Boolean)));
          for (const d of expansionDocs) {
            const root = parentFranchiseRootForDoc(d);
            if (!root) continue;
            expansionSelectedRootCounts[root] = Number(expansionSelectedRootCounts[root] || 0) + 1;
          }
          const filteredExpansionDocs = expansionDocs.filter((d: any) => {
            const root = parentFranchiseRootForDoc(d);
            if (["something-is-killing-the-children", "ms-marvel"].includes(root)) return false;
            return true;
          });
          const merged = dedupeDocs([...(commerciallyEnrichedDocs as any[]), ...filteredExpansionDocs]);
          expansionMergedCandidateCount = merged.length;
          enrichedDocs = enrichComicVineStructuralMetadata(merged);
        } catch (e: any) {
          expansionFetchResultsByQuery = expansionSeedQueries.map((q) => ({ query: q, status: 'error', rawCount: 0, error: String(e?.message || e) }));
          expansionNotTriggeredReason = "early_expansion_fetch_error";
        }
      } else {
        expansionNotTriggeredReason = "no_expansion_seed_queries";
      }
    } else {
      expansionNotTriggeredReason = "clean_eligible_sufficient";
    }
  }

  // Strict 20Q router:
  // taste comes only from 20Q-derived rungs. NYT is allowed only after filtering
  // as a procurement/commercial anchor, never as query or taste evidence.
  const filteredDocs = unwrapFilteredCandidates(filterCandidates(enrichedDocs, bucketPlan));
  debugDocPreview("FILTERED CANDIDATE POOL", filteredDocs);
  debugRouterLog("FILTER COLLAPSE CHECK", { rawCount: enrichedDocs.length, filteredCount: filteredDocs.length });
  const filterAuditRows = buildFilterAuditRows(enrichedDocs);
  const filterAuditSummary = summarizeFilterAudit(filterAuditRows);
  const filterKeptDocs = enrichedDocs.filter((doc: any) => doc?.diagnostics?.filterKept === true || doc?.rawDoc?.diagnostics?.filterKept === true);
  const filterKeptDocsTitles = filterKeptDocs.map((doc: any) => String(doc?.title || doc?.rawDoc?.title || "").trim()).filter(Boolean);
  const normalizedDocsCount = enrichedDocs.length;
  const postCanonicalizationCount = filteredDocs.length;
  const stageDropReasons = {
    canonicalization: summarizeReasonCounts(enrichedDocs, filteredDocs),
    deduplication: {} as Record<string, number>,
    authorityFilter: {} as Record<string, number>,
    laneFilter: {} as Record<string, number>,
    shapeGate: {} as Record<string, number>,
    finalShaping: {} as Record<string, number>,
  };

  // Centralized filtering rule:
  // filterCandidates is the only keep/reject authority for fetched candidates.
  // NYT bypasses this as a capped post-filter procurement signal only.
  let candidateDocs = filteredDocs;
  const candidatePoolDropReasons: Array<{ title: string; reason: string }> = [];
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
  const candidateDocKeys = new Set(candidateDocs.map((doc: any) => candidateKey(doc)));
  for (const kept of filterKeptDocs) {
    const key = candidateKey(kept);
    if (!key || candidateDocKeys.has(key)) continue;
    candidateDocs.push(kept);
    candidateDocKeys.add(key);
    candidatePoolDropReasons.push({ title: String(kept?.title || kept?.rawDoc?.title || "").trim(), reason: "restored_from_filter_kept_handoff" });
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
  const postAuthorityFilterCount = candidateDocs.length;
  stageDropReasons.authorityFilter = summarizeReasonCounts(filteredDocs, candidateDocs);
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
  const postLaneFilterCount = candidateDocs.length;
  stageDropReasons.laneFilter = summarizeReasonCounts(filteredDocs, candidateDocs);
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
  // ComicVine-resilient rescue: keep recognizable series/collection entries alive for ranking.
  if (includeComicVine && candidateDocs.length < 20) {
    const seen = new Set(candidateDocs.map((doc: any) => candidateKey(doc)));
    const largestComicVinePool = dedupeDocs([
      ...((debugRawPool as any[]) || []),
      ...enrichedDocs,
    ] as any);
    const rescuePool = largestComicVinePool.filter((doc: any) => {
      const source = String(doc?.source || doc?.rawDoc?.source || "").toLowerCase().replace(/\s+/g, "");
      if (!(source.includes("comicvine") || source.includes("comicvine_rescue"))) return false;
      const title = String(doc?.title || "").trim();
      if (!title) return false;
      if (/#\s*\d+\b/.test(title) && !/\b(vol\.?|volume|tpb|collection|omnibus|deluxe)\b/i.test(title)) return false;
      return true;
    });
    for (const doc of rescuePool) {
      const key = candidateKey(doc);
      if (!key || seen.has(key)) continue;
      candidateDocs.push(doc);
      seen.add(key);
      if (candidateDocs.length >= 40) break;
    }
  }
  const postShapeGateCount = candidateDocs.length;
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

  debugRouterLog("NORMALIZED CANDIDATES BY SOURCE", {
    googleBooks: googleCandidates.length,
    openLibrary: openLibraryCandidates.length,
    kitsu: kitsuCandidatesRaw.length,
    comicVine: gcdCandidates.length,
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

function summarizeReasonCounts(before: any[], after: any[]): Record<string, number> {
  const kept = new Set((after || []).map((d: any) => candidateKey(d)).filter(Boolean));
  const out: Record<string, number> = {};
  for (const doc of before || []) {
    const key = candidateKey(doc);
    if (!key || kept.has(key)) continue;
    const reasons = (doc?.diagnostics?.filterRejectReasons || doc?.rawDoc?.diagnostics?.filterRejectReasons || []) as string[];
    if (Array.isArray(reasons) && reasons.length) {
      for (const r of reasons) out[String(r)] = Number(out[String(r)] || 0) + 1;
    } else {
      out["dropped_without_explicit_reason"] = Number(out["dropped_without_explicit_reason"] || 0) + 1;
    }
  }
  return out;
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
    ...(includeComicVine ? gcdCandidates : []),
  ].filter((c: any) => c?.rawDoc?.diagnostics?.filterKept !== false && c?.diagnostics?.filterKept !== false);
  const normalizedCandidateKeys = new Set(normalizedCandidatesRaw.map((c: any) => candidateKey(c)));
  for (const kept of filterKeptDocs) {
    const key = candidateKey(kept);
    if (!key || normalizedCandidateKeys.has(key)) continue;
    normalizedCandidatesRaw.push(kept);
    normalizedCandidateKeys.add(key);
    candidatePoolDropReasons.push({ title: String(kept?.title || kept?.rawDoc?.title || "").trim(), reason: "restored_into_normalized_candidates" });
  }
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
  const postDeduplicationCount = normalizedCandidates.length;
  stageDropReasons.deduplication = summarizeReasonCounts(normalizedCandidatesRaw, normalizedCandidates);

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
  const shouldRunFinalRecommender = sourceLayerRankedDocs.length > 0 && (activeRecommenderSources.size > 1 || includeComicVine);
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
  const finalRecommenderInputCount = sourceLayerRankedDocs.length;
  const rankedDropReasons: Array<{ title: string; reason: string }> = [];
  if (rankedDocs.length === 0 && sourceLayerRankedDocs.length > 0) {
    rankedDropReasons.push({ title: "(multiple)", reason: "final_recommender_returned_empty" });
  }

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
  const postFinalShapingCount = finalRankedDocsBase.length;
  const shapedDropReasons: Array<{ title: string; reason: string }> = [];
  if (metaSafeRankedDocs.length === 0 && postFilteredRankedDocs.length > 0) {
    shapedDropReasons.push({ title: "(multiple)", reason: "meta_or_family_shaping_removed_all" });
  }

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
      postFilterCandidates: includeComicVine ? gcdCandidates.length : 0,
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
  const comicVineProtectedTokenFilteredCount = Number((comicVine as any)?.protectedTokenFilteredCount || 0);
  const comicVineSuperheroSuppressionActive = Boolean((comicVine as any)?.superheroSuppressionActive);
  const comicVineStrongSuperheroEvidence = Boolean((comicVine as any)?.strongSuperheroEvidence);
  const comicVineSelectedAnchors = Array.isArray((comicVine as any)?.selectedComicVineAnchors) ? (comicVine as any).selectedComicVineAnchors : [];
  const comicVineFranchiseTriggerDebug = (comicVine as any)?.franchiseTriggerDebug || (comicVine as any)?.franchiseTriggerProvenance || [];
  const comicVineFetchedRawTotal = Number((comicVine as any)?.comicVineFetchedRawTotal || 0);
  const comicVineRawRowsBeforeDocConversion = Number((comicVine as any)?.comicVineRawRowsBeforeDocConversion || 0);
  const comicVineDocConversionAttemptCount = Number((comicVine as any)?.comicVineDocConversionAttemptCount || 0);
  const comicVineDocConversionSuccessCount = Number((comicVine as any)?.comicVineDocConversionSuccessCount || 0);
  const gcdStructuralEnrichmentCount = (enrichedDocs as any[]).filter((d: any) => Boolean((d?.diagnostics as any)?.gcdStructuralEnriched)).length;
  const gcdEntryPointLikeCount = (enrichedDocs as any[]).filter((d: any) => Boolean((d?.diagnostics as any)?.gcdEntryPointLike)).length;
  const gcdCollectedLikeCount = (enrichedDocs as any[]).filter((d: any) => Boolean((d?.diagnostics as any)?.gcdCollectedLike)).length;
  const gcdIssueLikeCount = (enrichedDocs as any[]).filter((d: any) => Boolean((d?.diagnostics as any)?.gcdIssueLike)).length;
  const comicVineDocConversionDropReasons = (comicVine as any)?.comicVineDocConversionDropReasons || {};
  const comicVineConvertedDocTitles = Array.isArray((comicVine as any)?.comicVineConvertedDocTitles) ? (comicVine as any).comicVineConvertedDocTitles : [];
  const comicVineTitleMergeDebug = Array.isArray((comicVine as any)?.comicVineTitleMergeDebug) ? (comicVine as any).comicVineTitleMergeDebug : [];
  const comicVineContentEmptyDropCount = Number((comicVine as any)?.comicVineContentEmptyDropCount || 0);
  const comicVineCanonicalEmptyDropCount = Number((comicVine as any)?.comicVineCanonicalEmptyDropCount || 0);
  const comicVineFinalEmptyDropCount = Number((comicVine as any)?.comicVineFinalEmptyDropCount || 0);
  const blockedSuperheroQueryRe = /^(teen titans|young justice|ms\.?\s*marvel|spider-man|miles morales|batman)(\b| )/i;
  const resolvedComicVineQueryTexts = Array.from(comicVineQueryTexts).filter((q) =>
    !(comicVineSuperheroSuppressionActive && !comicVineStrongSuperheroEvidence && blockedSuperheroQueryRe.test(String(q || "").toLowerCase()))
  );
  const resolvedComicVineRungsBuilt = Array.from(comicVineRungsBuilt).filter((q) =>
    !(comicVineSuperheroSuppressionActive && !comicVineStrongSuperheroEvidence && blockedSuperheroQueryRe.test(String(q || "").toLowerCase()))
  );

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
    comicVineQueryTexts: resolvedComicVineQueryTexts,
    comicVineRungsBuilt: resolvedComicVineRungsBuilt,
    comicVineQueriesActuallyFetched: Array.from(comicVineQueriesActuallyFetched),
    comicVinePreflightQuery,
    comicVinePreflightUsesTasteQuery,
    comicVinePerQueryFailureDoesNotAbort,
    comicVineTasteQueriesAttempted: Array.from(comicVineTasteQueriesAttempted),
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
    protectedTokenFilteredCount: comicVineProtectedTokenFilteredCount,
    superheroSuppressionActive: comicVineSuperheroSuppressionActive,
    strongSuperheroEvidence: comicVineStrongSuperheroEvidence,
    selectedComicVineAnchors: comicVineSelectedAnchors,
    franchiseTriggerDebug: comicVineFranchiseTriggerDebug,
    comicVineFetchedRawTotal,
    comicVineRawRowsBeforeDocConversion,
    comicVineDocConversionAttemptCount,
    comicVineDocConversionSuccessCount,
    gcdStructuralEnrichmentCount,
    gcdEntryPointLikeCount,
    gcdCollectedLikeCount,
    gcdIssueLikeCount,
    comicVineDocConversionDropReasons,
    comicVineConvertedDocTitles,
    comicVineTitleMergeDebug,
    comicVineContentEmptyDropCount,
    comicVineCanonicalEmptyDropCount,
    comicVineFinalEmptyDropCount,
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
  let teenPostPassInputSource = finalRankedDocsBase.length > 0 ? "finalRankedDocsBase" : "rankedDocs";
  let finalAcceptedDocsSource = "finalRankedDocsBase";
  let finalAcceptedDocsTitles = deterministicGuardedPool.map((doc:any)=>String(doc?.title || doc?.rawDoc?.title || "").trim()).filter(Boolean);
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
  const finalRenderDocsBase = finalRankedDocs.length ? finalRankedDocs : (rankedDocsWithDiagnostics.length ? rankedDocsWithDiagnostics : filterKeptDocs);
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
  const preTopUpFinalItemsLength = finalRenderDocs.length;
  let topUpCandidatesConsideredLength = 0;
  let topUpCandidatesAcceptedLength = 0;
  const topUpCandidatesAcceptedTitles: string[] = [];
  const topUpRejectedReasons: Record<string, number> = {};
  let topUpSourceRankedDocsLength = 0;
  let topUpSourceCandidateDocsLength = 0;
  let topUpSourceNormalizedCandidatesLength = 0;
  let topUpSourceEnrichedDocsLength = 0;
  let topUpSourceDebugRawPoolLength = 0;
  let topUpMergedPoolBeforeFiltersLength = 0;
  let topUpMergedPoolAfterDedupeLength = 0;
  let topUpMergedPoolAfterQualityFiltersLength = 0;
  const topUpQualityRejectedReasons: Record<string, number> = {};
  const topUpQualityRejectedTitlesByReason: Record<string, string[]> = {};
  const nonComicVineCandidateDroppedByComicVineRule: string[] = [];
  let comicVineScopedRulesAppliedCount = 0;
  let nonComicVineReturnedBeforeComicVine = 0;
  let nonComicVineReturnedAfterComicVine = 0;
  let entitySeedConvertedCount = 0;
  let entitySeedTopUpEligibleCount = 0;
  const entitySeedTopUpRejectedReasons: Record<string, number> = {};
  const entitySeedTopUpRejectedTitlesByReason: Record<string, string[]> = {};
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
  if (includeComicVine && finalRenderDocs.length > 0) {
    const byFranchise = new Map<string, number>();
    for (const doc of finalRenderDocs) {
      const key = finalSeriesKeyForRender(doc);
      byFranchise.set(key, (byFranchise.get(key) || 0) + 1);
    }
    finalRenderDocs = finalRenderDocs.filter((doc: any) => {
      const key = finalSeriesKeyForRender(doc);
      const count = byFranchise.get(key) || 0;
      if (count <= 2) return true;
      byFranchise.set(key, count - 1);
      return false;
    });
    const distinctFranchises = new Set(finalRenderDocs.map((doc: any) => finalSeriesKeyForRender(doc)).filter(Boolean));
    if ((distinctFranchises.size <= 1 || finalRenderDocs.length < 8) && includeComicVine) {
      const seenIds = new Set(finalRenderDocs.map((d: any) => String(d?.sourceId || d?.key || d?.title || "").toLowerCase()));
      const seenFranchises = new Set(finalRenderDocs.map((d: any) => finalSeriesKeyForRender(d)));
      const entitySeedPriority = [
        "ms. marvel", "spider-man", "walking dead", "descender", "black science", "runaways", "batman", "teen titans", "invincible", "guardians of the galaxy", "miles morales",
      ];
      const knownGoodAnchors = [
        "saga", "paper girls", "locke & key", "the sandman", "something is killing the children", "sweet tooth", "nimona", "amulet", "bone", "monstress",
      ];
      const allowlistForGenericTitle = new Set([...knownGoodAnchors, ...entitySeedPriority].map((v) => normalizeText(v)));
      const genericBroadTitleRe = /^(.+:\s*)?(a\s+graphic novel|the\s+graphic novel|graphic novel)$/i;
      const moodAlignedPriority = [
        "something is killing the children", "walking dead", "descender", "black science", "runaways", "batman", "spider-man", "ms. marvel",
      ];
      const inferEntityFamily = (doc: any): string => {
        const t = normalizeText(`${doc?.title || ""} ${doc?.rawDoc?.queryText || doc?.queryText || ""}`);
        const seed = [...moodAlignedPriority, ...entitySeedPriority, ...knownGoodAnchors].find((s) => t.includes(normalizeText(s)));
        return seed || finalSeriesKeyForRender(doc) || "unknown";
      };
      const convertedComicVineDocs = Array.isArray((comicVine as any)?.items)
        ? (comicVine as any).items.map((it: any) => it?.doc).filter(Boolean)
        : [];
      topUpSourceRankedDocsLength = (rankedDocs as any[])?.length || 0;
      topUpSourceCandidateDocsLength = (candidateDocs as any[])?.length || 0;
      topUpSourceNormalizedCandidatesLength = (normalizedCandidates as any[])?.length || 0;
      topUpSourceEnrichedDocsLength = (enrichedDocs as any[])?.length || 0;
      topUpSourceDebugRawPoolLength = ((debugRawPool as any[]) || []).length;
      const topupSourceRaw = [
        ...(rankedDocs as any[]),
        ...(candidateDocs as any[]),
        ...(normalizedCandidates as any[]),
        ...(enrichedDocs as any[]),
        ...((debugRawPool as any[]) || []),
        ...convertedComicVineDocs,
      ] as any[];
      topUpMergedPoolBeforeFiltersLength = topupSourceRaw.length;
      const topupSources = dedupeDocs(topupSourceRaw as any);
      topUpMergedPoolAfterDedupeLength = topupSources.length;
      const registerTopupReject = (reason: string, title: string) => {
        topUpQualityRejectedReasons[reason] = Number(topUpQualityRejectedReasons[reason] || 0) + 1;
        if (!topUpQualityRejectedTitlesByReason[reason]) topUpQualityRejectedTitlesByReason[reason] = [];
        if (title && topUpQualityRejectedTitlesByReason[reason].length < 12) topUpQualityRejectedTitlesByReason[reason].push(title);
      };
      const topupPool = topupSources.filter((doc: any) => {
        const source = String(doc?.source || doc?.rawDoc?.source || "").toLowerCase();
        if (!source.includes("comicvine")) return true;
        comicVineScopedRulesAppliedCount += 1;
        const title = String(doc?.title || "").trim();
        if (!title) { registerTopupReject("missing_title", "(untitled)"); return false; }
        const normalizedTitle = normalizeText(title);
        const normalizedQueryText = normalizeText(String(doc?.queryText || doc?.rawDoc?.queryText || ""));
        const isEntitySeedDoc = entitySeedPriority.some((seed) => normalizedTitle.includes(normalizeText(seed)) || normalizedQueryText.includes(normalizeText(seed)));
        if (isEntitySeedDoc) entitySeedConvertedCount += 1;
        if (genericBroadTitleRe.test(title) && !Array.from(allowlistForGenericTitle).some((needle) => normalizedTitle.includes(needle))) { registerTopupReject("generic_broad_artifact", title); return false; }
        if (/#\s*\d+\b/.test(title) && !/\b(vol\.?|volume|tpb|collection|omnibus|deluxe|book)\b/i.test(title)) {
          if (isEntitySeedDoc && /\b(collection|tpb|omnibus|deluxe|book|volume)\b/i.test(String(doc?.subtitle || doc?.rawDoc?.subtitle || ""))) {
            entitySeedTopUpEligibleCount += 1;
          } else {
            registerTopupReject("single_issue_spam", title);
            if (isEntitySeedDoc) {
              entitySeedTopUpRejectedReasons.single_issue_spam = Number(entitySeedTopUpRejectedReasons.single_issue_spam || 0) + 1;
              if (!entitySeedTopUpRejectedTitlesByReason.single_issue_spam) entitySeedTopUpRejectedTitlesByReason.single_issue_spam = [];
              if (entitySeedTopUpRejectedTitlesByReason.single_issue_spam.length < 12) entitySeedTopUpRejectedTitlesByReason.single_issue_spam.push(title);
            }
            return false;
          }
        }
        const rejectReasons = (doc?.diagnostics?.filterRejectReasons || doc?.rawDoc?.diagnostics?.filterRejectReasons || []) as string[];
        const isRecognizableEntity = [...moodAlignedPriority, ...entitySeedPriority, ...knownGoodAnchors].some((seed) => normalizedTitle.includes(normalizeText(seed)));
        const collectedEditionLike = /\b(tpb|omnibus|volume|vol\.|deluxe|book|collection)\b/i.test(title);
        if (Array.isArray(rejectReasons) && rejectReasons.includes("below_shape_floor") && !(isRecognizableEntity || collectedEditionLike)) {
          registerTopupReject("below_shape_floor_non_entity", title);
          if (isEntitySeedDoc) {
            entitySeedTopUpRejectedReasons.below_shape_floor_non_entity = Number(entitySeedTopUpRejectedReasons.below_shape_floor_non_entity || 0) + 1;
            if (!entitySeedTopUpRejectedTitlesByReason.below_shape_floor_non_entity) entitySeedTopUpRejectedTitlesByReason.below_shape_floor_non_entity = [];
            if (entitySeedTopUpRejectedTitlesByReason.below_shape_floor_non_entity.length < 12) entitySeedTopUpRejectedTitlesByReason.below_shape_floor_non_entity.push(title);
          }
          return false;
        }
        const id = String(doc?.sourceId || doc?.key || doc?.title || "").toLowerCase();
        if (!id || seenIds.has(id)) {
          registerTopupReject("duplicate_id", title);
          if (isEntitySeedDoc) {
            entitySeedTopUpRejectedReasons.duplicate_id = Number(entitySeedTopUpRejectedReasons.duplicate_id || 0) + 1;
            if (!entitySeedTopUpRejectedTitlesByReason.duplicate_id) entitySeedTopUpRejectedTitlesByReason.duplicate_id = [];
            if (entitySeedTopUpRejectedTitlesByReason.duplicate_id.length < 12) entitySeedTopUpRejectedTitlesByReason.duplicate_id.push(title);
          }
          return false;
        }
        if (isEntitySeedDoc) entitySeedTopUpEligibleCount += 1;
        return true;
      }).sort((a: any, b: any) => {
        const qa = normalizeText(String(a?.queryText || a?.rawDoc?.queryText || ""));
        const qb = normalizeText(String(b?.queryText || b?.rawDoc?.queryText || ""));
        const ta = normalizeText(String(a?.title || ""));
        const tb = normalizeText(String(b?.title || ""));
        const score = (q: string, t: string) => {
          if (entitySeedPriority.some((seed) => q === seed || q.startsWith(seed + " ") || t.includes(seed))) return 3;
          if (knownGoodAnchors.some((seed) => q === seed || q.startsWith(seed + " ") || t.includes(seed))) return 2;
          if (/\b(psychological|suspense|thriller|graphic novel)\b/.test(q)) return 0;
          return 1;
        };
        return score(qb, tb) - score(qa, ta);
      });
      topUpMergedPoolAfterQualityFiltersLength = topupPool.length;
      topUpCandidatesConsideredLength += topupPool.length;
      const familyCounts = new Map<string, number>();
      for (const doc of finalRenderDocs) familyCounts.set(inferEntityFamily(doc), (familyCounts.get(inferEntityFamily(doc)) || 0) + 1);
      const seenTitles = new Set(finalRenderDocs.map((d: any) => normalizeText(String(d?.title || d?.rawDoc?.title || ""))).filter(Boolean));
      for (const doc of topupPool) {
        if (finalRenderDocs.length >= Math.min(Math.max(finalLimit, 8), 10)) break;
        const franchise = finalSeriesKeyForRender(doc);
        const family = inferEntityFamily(doc);
        if ((familyCounts.get(family) || 0) >= 2) { topUpRejectedReasons.family_cap = Number(topUpRejectedReasons.family_cap || 0) + 1; continue; }
        if (finalRenderDocs.filter((d: any) => finalSeriesKeyForRender(d) === franchise).length >= 2) { topUpRejectedReasons.franchise_cap = Number(topUpRejectedReasons.franchise_cap || 0) + 1; continue; }
        const normalizedTitle = normalizeText(String(doc?.title || doc?.rawDoc?.title || ""));
        if (!normalizedTitle || seenTitles.has(normalizedTitle)) { topUpRejectedReasons.duplicate_title = Number(topUpRejectedReasons.duplicate_title || 0) + 1; continue; }
        finalRenderDocs.push(doc);
        topUpCandidatesAcceptedLength += 1;
        topUpCandidatesAcceptedTitles.push(String(doc?.title || doc?.rawDoc?.title || "").trim());
        seenIds.add(String(doc?.sourceId || doc?.key || doc?.title || "").toLowerCase());
        seenFranchises.add(franchise);
        familyCounts.set(family, (familyCounts.get(family) || 0) + 1);
        seenTitles.add(normalizedTitle);
      }
      // Second pass: if still under-filled, allow remaining entity-family docs before broad artifacts.
      if (finalRenderDocs.length < 8) {
        for (const doc of topupPool) {
          if (finalRenderDocs.length >= Math.min(Math.max(finalLimit, 8), 10)) break;
          const id = String(doc?.sourceId || doc?.key || doc?.title || "").toLowerCase();
          if (!id || seenIds.has(id)) continue;
          const qa = normalizeText(String(doc?.queryText || doc?.rawDoc?.queryText || ""));
          if (/\b(psychological|suspense|thriller|graphic novel)\b/.test(qa) && !entitySeedPriority.some((s) => qa.includes(s))) { topUpRejectedReasons.broad_phrase_artifact = Number(topUpRejectedReasons.broad_phrase_artifact || 0) + 1; continue; }
          const franchise = finalSeriesKeyForRender(doc);
          if (finalRenderDocs.filter((d: any) => finalSeriesKeyForRender(d) === franchise).length >= 2) { topUpRejectedReasons.franchise_cap = Number(topUpRejectedReasons.franchise_cap || 0) + 1; continue; }
          const normalizedTitle = normalizeText(String(doc?.title || doc?.rawDoc?.title || ""));
          if (!normalizedTitle || seenTitles.has(normalizedTitle)) { topUpRejectedReasons.duplicate_title = Number(topUpRejectedReasons.duplicate_title || 0) + 1; continue; }
          finalRenderDocs.push(doc);
          topUpCandidatesAcceptedLength += 1;
          topUpCandidatesAcceptedTitles.push(String(doc?.title || doc?.rawDoc?.title || "").trim());
          seenIds.add(id);
          seenTitles.add(normalizedTitle);
        }
      }
    }
  }
  let recoveryTriggered = false;
  let recoveryInputPoolLength = 0;
  let recoveryEntitySeedMatches = 0;
  const recoveryRejectedReasons: Record<string, number> = {};
  const franchiseCapBlockedTitles: string[] = [];
  const recoveryDiversificationAttempts: string[] = [];
  if (includeComicVine && finalRenderDocs.length < 8) {
    recoveryTriggered = true;
    const entityPriority = [
      "something is killing the children", "locke & key", "the sandman", "sweet tooth", "the walking dead", "hellboy", "black science", "descender", "runaways", "ms. marvel", "saga", "invincible",
    ];
    const broadPhraseQueryRe = /\b(literary science graphic novel|psychological suspense graphic novel|teen graphic novel|science fiction graphic novel|graphic horror novel)\b/i;
    const genericBroadTitleRe = /^(.+:\s*)?(a\s+graphic novel|the\s+graphic novel|graphic novel)$/i;
    const pool = dedupeDocs([
      ...(enrichedDocs as any[]),
      ...(normalizedCandidates as any[]),
      ...(candidateDocs as any[]),
      ...((debugRawPool as any[]) || []),
      ...(((comicVine as any)?.items || []).map((it: any) => it?.doc).filter(Boolean)),
    ] as any);
    recoveryInputPoolLength = pool.length;
    const selected: any[] = [];
    const seenTitles = new Set<string>();
    const add = (doc: any) => {
      const title = normalizeText(String(doc?.title || doc?.rawDoc?.title || ""));
      if (!title || seenTitles.has(title)) return false;
      if (selected.filter((d: any) => finalSeriesKeyForRender(d) === finalSeriesKeyForRender(doc)).length >= 2) return false;
      selected.push(doc); seenTitles.add(title); return true;
    };
    const sorted = pool.sort((a: any, b: any) => {
      const score = (doc: any) => {
        const tRaw = String(doc?.title || "");
        const t = normalizeText(tRaw);
        const q = normalizeText(String(doc?.queryText || doc?.rawDoc?.queryText || ""));
        const entityHit = entityPriority.findIndex((e) => t.includes(e) || q.includes(e));
        let s = entityHit >= 0 ? 100 - entityHit : 20;
        if (/\b(volume one|vol\.?\s*1|book one|book 1)\b/i.test(tRaw)) s += 12;
        if (/\b(volume|vol\.?|book|part)\s*(seven|eight|7|8)\b/i.test(tRaw)) s -= 8;
        if (/\b(clockworks|omega)\b/i.test(tRaw)) s -= 6;
        if (/\bgraphic (horror|fantasy) novel\b/i.test(tRaw)) s -= 10;
        if (/\bthe hobbit\b/i.test(tRaw) && !/\bfantasy\b/.test(q)) s -= 8;
        if (/\b#\s*\d+\b/.test(tRaw) && !/\b(vol\.?|volume|tpb|collection|omnibus|deluxe|book)\b/i.test(tRaw)) s -= 14;
        if (/\b(español|french|deutsch|italiano|japanese)\b/i.test(String(doc?.subtitle || doc?.rawDoc?.subtitle || ""))) s -= 10;
        (doc as any).entryPointRankReason = s;
        return s;
      };
      return score(b) - score(a);
    });
    const familySeen = new Set<string>();
    // Pass 1: diversify, max 1 per family until we have attempted broad coverage.
    for (const doc of sorted) {
      if (selected.length >= Math.min(Math.max(finalLimit, 8), 10)) break;
      const title = String(doc?.title || "").trim();
      const q = String(doc?.queryText || doc?.rawDoc?.queryText || "");
      const norm = normalizeText(title);
      const entityHit = entityPriority.some((e) => norm.includes(e) || normalizeText(q).includes(e));
      if (entityHit) recoveryEntitySeedMatches += 1;
      if (/#\s*\d+\b/.test(title) && !/\b(vol\.?|volume|tpb|collection|omnibus|deluxe|book)\b/i.test(title)) { recoveryRejectedReasons.issue_spam = (recoveryRejectedReasons.issue_spam||0)+1; continue; }
      if (broadPhraseQueryRe.test(q) && genericBroadTitleRe.test(title)) { recoveryRejectedReasons.generic_broad_artifact = (recoveryRejectedReasons.generic_broad_artifact||0)+1; continue; }
      if (!entityHit && broadPhraseQueryRe.test(q) && selected.filter((d: any) => broadPhraseQueryRe.test(String(d?.queryText || d?.rawDoc?.queryText || ""))).length >= 1) { recoveryRejectedReasons.broad_phrase_cap = (recoveryRejectedReasons.broad_phrase_cap||0)+1; continue; }
      const family = finalSeriesKeyForRender(doc);
      recoveryDiversificationAttempts.push(`${family}:${String(doc?.title || "")}`);
      if (selected.length < 8 && familySeen.has(family)) {
        recoveryRejectedReasons.family_diversify_hold = (recoveryRejectedReasons.family_diversify_hold||0)+1;
        continue;
      }
      if (add(doc)) familySeen.add(family);
    }
    // Pass 2: if still short, allow up to 2 per family while maintaining quality gates.
    if (selected.length < 8) {
      for (const doc of sorted) {
        if (selected.length >= Math.min(Math.max(finalLimit, 8), 10)) break;
        const family = finalSeriesKeyForRender(doc);
        if (selected.filter((d: any) => finalSeriesKeyForRender(d) === family).length >= 2) {
          if (franchiseCapBlockedTitles.length < 20) franchiseCapBlockedTitles.push(String(doc?.title || ""));
          continue;
        }
        const title = String(doc?.title || "").trim();
        const q = String(doc?.queryText || doc?.rawDoc?.queryText || "");
        if (/#\s*\d+\b/.test(title) && !/\b(vol\.?|volume|tpb|collection|omnibus|deluxe|book)\b/i.test(title)) continue;
        if (broadPhraseQueryRe.test(q) && genericBroadTitleRe.test(title)) continue;
        add(doc);
      }
    }
    if (selected.length >= 8) finalRenderDocs = selected;
  }
  if (includeComicVine && finalRenderDocs.length > 0) {
    const entitySeedAllowlist = [
      "ms. marvel", "walking dead", "runaways", "descender", "black science", "scott pilgrim", "spider-man", "batman",
      "something is killing the children", "sweet tooth", "sandman", "saga", "paper girls",
    ];
    const broadPhraseQueryRe = /\b(literary science graphic novel|psychological suspense graphic novel|teen graphic novel|science fiction graphic novel)\b/i;
    const genericGraphicNovelTitleRe = /^(.+:\s*)?(a\s+graphic novel|the\s+graphic novel|graphic novel)$/i;
    const beforeFilterLength = finalRenderDocs.length;
    finalRenderDocs = finalRenderDocs.filter((doc: any) => {
      const title = String(doc?.title || doc?.rawDoc?.title || "").trim();
      const queryText = String(doc?.queryText || doc?.rawDoc?.queryText || "").trim();
      const normalizedTitle = normalizeText(title);
      const isEntitySeedDoc = entitySeedAllowlist.some((seed) => normalizedTitle.includes(normalizeText(seed)) || normalizeText(queryText).includes(normalizeText(seed)));
      if (!broadPhraseQueryRe.test(queryText)) return true;
      if (!genericGraphicNovelTitleRe.test(title)) return true;
      return isEntitySeedDoc;
    });
    if (beforeFilterLength > finalRenderDocs.length) {
      topUpRejectedReasons.generic_broad_artifact_hard_rule = Number(topUpRejectedReasons.generic_broad_artifact_hard_rule || 0) + (beforeFilterLength - finalRenderDocs.length);
    }
    if (finalRenderDocs.length < 8) {
      const seen = new Set(finalRenderDocs.map((doc: any) => String(doc?.sourceId || doc?.key || doc?.title || "").toLowerCase()));
      const entityBackfillPool = dedupeDocs((debugRawPool as any[]) || []).filter((doc: any) => {
        const title = String(doc?.title || "").trim();
        const queryText = String(doc?.queryText || doc?.rawDoc?.queryText || "").trim();
        const normalizedTitle = normalizeText(title);
        if (!title) return false;
        if (seen.has(String(doc?.sourceId || doc?.key || doc?.title || "").toLowerCase())) return false;
        return entitySeedAllowlist.some((seed) => normalizedTitle.includes(normalizeText(seed)) || normalizeText(queryText).includes(normalizeText(seed)));
      });
      for (const doc of entityBackfillPool) {
        if (finalRenderDocs.length >= Math.min(Math.max(finalLimit, 8), 10)) break;
        const franchise = finalSeriesKeyForRender(doc);
        if (finalRenderDocs.filter((d: any) => finalSeriesKeyForRender(d) === franchise).length >= 2) continue;
        finalRenderDocs.push(doc);
        seen.add(String(doc?.sourceId || doc?.key || doc?.title || "").toLowerCase());
      }
    }
  }
  finalRenderDocs = dedupeDocs(finalRenderDocs as any).filter((doc: any, idx: number, arr: any[]) => {
    const title = normalizeText(String(doc?.title || doc?.rawDoc?.title || ""));
    if (!title) return true;
    return arr.findIndex((row: any) => normalizeText(String(row?.title || row?.rawDoc?.title || "")) === title) === idx;
  });
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
  const graphicKeywordWeights = Object.entries((routingInput.tagCounts || {}) as Record<string, number>)
    .filter(([k, v]) => k.startsWith("graphicNovel:") && Number(v) > 0)
    .sort((a, b) => Number(b[1]) - Number(a[1]))
    .slice(0, 3);
  const keywordRegex: Record<string, RegExp> = {
    superhero: /\b(superhero|superheroes|spider-man|batman|smallville|marvel|dc)\b/,
    fantasy: /\b(fantasy|dragon|magic|wizard|myth|sword)\b/,
    sci_fi: /\b(sci[- ]?fi|science fiction|future|space|cyberpunk|robot|ai)\b/,
    dystopian: /\b(dystopian|apocalypse|rebellion|authoritarian)\b/,
    romance: /\b(romance|love|relationship)\b/,
    mystery: /\b(mystery|detective|investigation|noir)\b/,
    horror: /\b(horror|haunted|ghost|terror|occult)\b/,
    adventure: /\b(adventure|quest|journey)\b/,
    action: /\b(action|fight|battle|war)\b/,
  };
  const docMatchesKeyword = (doc: any, keyword: string): boolean => {
    const bag = [
      String(doc?.title || ""), String(doc?.series || ""), String(doc?.queryText || ""),
      ...(Array.isArray(doc?.subject) ? doc.subject.map((x: any) => String(x || "")) : []),
    ].join(" ").toLowerCase();
    if (!/\b(graphic novel|comic|comics|tpb|ogn|manga)\b/.test(bag)) return false;
    const re = keywordRegex[keyword];
    return re ? re.test(bag) : bag.includes(keyword.replace(/_/g, " "));
  };
  if (graphicKeywordWeights.length > 0 && finalRenderDocs.length > 0) {
    const minComicVineFinalCount = includeComicVine ? Math.min(10, Math.max(finalLimit, 8)) : finalLimit;
    const total = graphicKeywordWeights.reduce((sum, [, v]) => sum + Number(v), 0) || 1;
    const quotas = graphicKeywordWeights.map(([k, v]) => ({
      keyword: k.replace("graphicNovel:", ""),
      target: Math.max(1, Math.round((Number(v) / total) * finalLimit)),
    }));
    const chosen: any[] = [];
    const chosenIds = new Set<string>();
    for (const quota of quotas) {
      const pool = finalRenderDocs.filter((doc: any) => docMatchesKeyword(doc, quota.keyword));
      for (const doc of pool) {
        const id = String(doc?.sourceId || doc?.key || doc?.title || "");
        if (!id || chosenIds.has(id)) continue;
        chosen.push(doc);
        chosenIds.add(id);
        if (chosen.filter((d: any) => docMatchesKeyword(d, quota.keyword)).length >= quota.target) break;
      }
    }
    for (const doc of finalRenderDocs) {
      const id = String(doc?.sourceId || doc?.key || doc?.title || "");
      if (!id || chosenIds.has(id)) continue;
      chosen.push(doc);
      chosenIds.add(id);
      if (chosen.length >= finalLimit) break;
    }
    finalRenderDocs = chosen.slice(0, minComicVineFinalCount);
  }
  if (includeComicVine && finalRenderDocs.length > 0) {
    const entitySeedPrimary = [
      "something is killing the children", "locke & key", "the sandman", "sweet tooth", "walking dead", "hellboy", "black science", "descender", "runaways",
      "ms. marvel",
    ];
    const broadPhraseQueryRe = /\b(literary science graphic novel|psychological suspense graphic novel|teen graphic novel|science fiction graphic novel|graphic horror novel)\b/i;
    const genericBroadTitleRe = /^(.+:\s*)?(a\s+graphic novel|the\s+graphic novel|graphic novel)$/i;
    const isEntitySeedDoc = (doc: any) => {
      const title = normalizeText(String(doc?.title || doc?.rawDoc?.title || ""));
      const q = normalizeText(String(doc?.queryText || doc?.rawDoc?.queryText || ""));
      return entitySeedPrimary.some((seed) => title.includes(normalizeText(seed)) || q.includes(normalizeText(seed)));
    };
    const isBroadPhraseDoc = (doc: any) => broadPhraseQueryRe.test(String(doc?.queryText || doc?.rawDoc?.queryText || ""));
    const isGenericBroadArtifact = (doc: any) => genericBroadTitleRe.test(String(doc?.title || doc?.rawDoc?.title || "").trim());
    const universe = dedupeDocs([
      ...finalRenderDocs,
      ...(rankedDocs as any[]),
      ...(candidateDocs as any[]),
      ...((debugRawPool as any[]) || []),
    ] as any).filter((doc: any) => {
      if (isBroadPhraseDoc(doc) && isGenericBroadArtifact(doc)) return false;
      if (/#\s*\d+\b/.test(String(doc?.title || "")) && !/\b(vol\.?|volume|tpb|collection|omnibus|deluxe|book)\b/i.test(String(doc?.title || ""))) return false;
      return true;
    });
    const entityDocs = universe.filter((doc: any) => isEntitySeedDoc(doc));
    const nonBroadDocs = universe.filter((doc: any) => !isBroadPhraseDoc(doc) && !isEntitySeedDoc(doc));
    const broadDocs = universe.filter((doc: any) => isBroadPhraseDoc(doc) && !isGenericBroadArtifact(doc));
    const targetCount = Math.min(Math.max(finalLimit, 8), 10);
    const rebuilt: any[] = [];
    const seenTitles = new Set<string>();
    const addDoc = (doc: any) => {
      const title = normalizeText(String(doc?.title || doc?.rawDoc?.title || ""));
      if (!title || seenTitles.has(title)) return false;
      if (rebuilt.filter((d: any) => finalSeriesKeyForRender(d) === finalSeriesKeyForRender(doc)).length >= 2) return false;
      rebuilt.push(doc);
      seenTitles.add(title);
      return true;
    };
    for (const doc of entityDocs) { if (rebuilt.length >= targetCount) break; addDoc(doc); }
    for (const doc of nonBroadDocs) { if (rebuilt.length >= targetCount) break; addDoc(doc); }
    let broadUsed = 0;
    for (const doc of broadDocs) {
      if (rebuilt.length >= targetCount) break;
      if (broadUsed >= 1) break;
      if (addDoc(doc)) broadUsed += 1;
    }
    if (rebuilt.length >= 5) finalRenderDocs = rebuilt;
  }
  if (includeComicVine && !expansionFetchAttempted && candidateDocs.length < 30) {
    cleanCandidateShortfallExpansionTriggered = true;
    const tasteExpansionSeeds = generatedComicVineQueriesFromTaste.length > 0
      ? generatedComicVineQueriesFromTaste.map((q) => q.replace(/\s*graphic novel\s*$/i, "").trim()).filter(Boolean)
      : [];
    const preScoringExpansionSeeds = Array.from(new Set((tasteExpansionSeeds.length > 0 ? tasteExpansionSeeds : [
      "Locke & Key", "Sweet Tooth", "Spider-Man", "Descender", "Runaways", "Black Science", "Saga", "The Sandman", "Invincible",
    ]).map((v) => String(v || "").trim()).filter(Boolean))).filter((q) => {
      const root = rootFromSeed(q);
      if (!root || blockedExpansionQueryFragments.test(q)) return false;
      if (selectedStarterRoots.has(root)) return false;
      return true;
    }).slice(0, 8);
    if (preScoringExpansionSeeds.length > 0) {
      expansionFetchAttempted = true;
      if (tasteExpansionSeeds.length === 0 && querySourceOfTruth !== "taste_profile") querySourceOfTruth = "expansion_static";
      expansionFetchResultsByQuery = [];
      const preScoringExpansionDocs = await runExpansionQueries(preScoringExpansionSeeds);
      const taggedExpansionDocs = preScoringExpansionDocs.map((doc: any) => ({
        ...doc,
        isExpansionCandidate: true,
        expansionQueryText: String(doc?.queryText || "expansion"),
        expansionRoot: parentFranchiseRootForDoc(doc),
        diagnostics: { ...(doc?.diagnostics || {}), isExpansionCandidate: true, expansionQueryText: String(doc?.queryText || "expansion"), expansionRoot: parentFranchiseRootForDoc(doc) },
      }));
      expansionRawCount += expansionFetchResultsByQuery.reduce((acc, row) => acc + Number(row.rawCount || 0), 0);
      expansionConvertedCount += taggedExpansionDocs.length;
      expansionDistinctRootsBeforeSelection = Array.from(new Set([...expansionDistinctRootsBeforeSelection, ...taggedExpansionDocs.map((d: any) => parentFranchiseRootForDoc(d)).filter(Boolean)]));
      enrichedDocs = enrichComicVineStructuralMetadata(dedupeDocs([...(enrichedDocs as any[]), ...taggedExpansionDocs]));
      candidateDocs = dedupeDocs([...(candidateDocs as any[]), ...taggedExpansionDocs]);
      expansionMergedCandidateCount = Math.max(expansionMergedCandidateCount, candidateDocs.length);
    }
  }
  const anchorFranchises = [
    "something is killing the children", "locke & key", "walking dead", "sweet tooth", "descender", "runaways", "batman", "spider-man", "ms. marvel",
  ];
  const convertedComicVineDocsForScoring = Array.isArray((comicVine as any)?.comicVineConvertedDocsForScoring)
    ? (comicVine as any).comicVineConvertedDocsForScoring.filter(Boolean)
    : [];
  const convertedDocsAvailableForScoringCount = convertedComicVineDocsForScoring.length;
  const profileTextForSeeds = normalizeText(String(tasteProfileText || ""));
  const profileSelectedEntitySeeds =
    /\b(horror|dark|survival|apocalypse)\b/.test(profileTextForSeeds)
      ? ["something is killing the children", "locke & key", "walking dead", "sweet tooth"]
      : /\b(superhero|identity|coming of age|teen hero)\b/.test(profileTextForSeeds)
        ? ["ms. marvel", "miles morales", "runaways"]
        : /\b(sci[- ]?fi|science fiction|idea|speculative|survival)\b/.test(profileTextForSeeds)
          ? ["descender", "black science", "saga", "invincible"]
          : ["sandman", "amulet", "nimona"];
  const scoringUniverse = dedupeDocs([
    ...finalRenderDocs,
    ...narrativeExpansionMergedDocs,
    ...(enrichedDocs as any[]),
    ...(normalizedCandidates as any[]),
    ...(candidateDocs as any[]),
    ...((debugRawPool as any[]) || []),
    ...(finalRankedDocsBase as any[]),
    ...convertedComicVineDocsForScoring,
  ] as any);
  const scoredCandidateUniverseSources = Array.from(new Set(scoringUniverse.map((d: any) => String(d?.source || d?.rawDoc?.source || "unknown"))));
  const scoredCandidateUniverseFranchiseRoots = Array.from(new Set(scoringUniverse.map((d: any) => parentFranchiseRootForDoc(d)).filter(Boolean)));
  const scoringPassInputCount = scoringUniverse.length;
  const knownCanonicalFranchises = [...anchorFranchises, ...profileSelectedEntitySeeds];
  const broadArtifactRejectedTitles: string[] = [];
  const sideArcRejectedTitles: string[] = [];
  const duplicateTitleRejectedTitles: string[] = [];
  const negativeScoreRejectedTitles: string[] = [];
  const untranslatedEditionRejectedTitles: string[] = [];
  const semanticBreadthSelections: string[] = [];
  const adjacentSeedExpansionCandidates: string[] = [];
  const seedSaturationPenaltyApplied: Record<string, number> = {};
  const expansionQueryRootMismatchRejectedTitles: string[] = [];
  const expansionFalsePositiveRejectedTitles: string[] = [];
  const expansionLocaleRejectedTitles: string[] = [];
  const expansionWeakFillerRejectedTitles: string[] = [];
  const sameParentSoftDuplicateRejectedTitles: string[] = [];
  const expansionAliasMap: Record<string, string[]> = {
    "spider-man": ["spider-man", "spiderman", "peter parker", "miles morales"],
    "sweet-tooth": ["sweet tooth", "gus"],
    "locke-key": ["locke & key", "locke and key", "keyhouse"],
    "the-sandman": ["sandman", "dream of the endless", "morpheus"],
    "descender": ["descender", "tim-21"],
    "runaways": ["runaways"],
    "black-science": ["black science"],
    "invincible": ["invincible", "mark grayson"],
    "saga": ["saga", "alana", "marko", "hazel"],
  };
  const expansionQueryToRoot = (query: string) => rootFromSeed(String(query || "").replace(/\bgraphic novel\b/gi, "").trim());
  const parentFranchiseRootByTitle: Record<string, string> = {};
  const parentRootSourceByTitle: Record<string, string> = {};
  const normalizedParentRootAliases: Record<string, string> = { "walking-dead": "the-walking-dead", "the-walking-dead": "the-walking-dead" };
  const subtitleOnlyParentFragmentRejectedTitles: string[] = [];
  let parentMetadataUsedForRootCount = 0;
  const subtitleFragmentInheritedParentRootTitles: string[] = [];
  const subtitleFragmentRejectedTitles: string[] = [];
  const fragmentAcceptedBecauseCollectedEditionTitles: string[] = [];
  let zeroScoreBroadFillersUsed = 0;
  const entitySeedCandidatesFoundBySeed: Record<string, number> = {};
  const entitySeedCandidatesSelected: string[] = [];
  let entryPointCandidatesFound = 0;
  let entryPointCandidatesSuppressed = 0;
  const finalSuppressedByBetterEntryPoint: string[] = [];
  const suppressedGlobalSeedReason = /\b(horror|dark|survival|apocalypse)\b/.test(profileTextForSeeds) ? "none" : "profile_not_horror";
  const scoredCanonicalDocs = scoringUniverse.map((doc: any) => {
    const title = String(doc?.title || doc?.rawDoc?.title || "");
    const subtitle = String(doc?.subtitle || doc?.rawDoc?.subtitle || "");
    const normalizedTitle = normalizeText(`${title} ${subtitle}`);
    const parentFranchiseRoot = parentFranchiseRootForDoc(doc);
    const parentMetadataValue =
      doc?.parentVolumeName ||
      doc?.parentVolume?.name ||
      doc?.rawDoc?.parentVolumeName ||
      doc?.rawDoc?.parentVolume?.name ||
      doc?.rawDoc?.rawDoc?.parentVolumeName ||
      doc?.rawDoc?.rawDoc?.parentVolume?.name ||
      doc?.diagnostics?.parentVolumeName ||
      doc?.rawDoc?.diagnostics?.parentVolumeName ||
      doc?.rawDoc?.rawDoc?.diagnostics?.parentVolumeName ||
      "";
    const hasParentMetadata = Boolean(parentMetadataValue);
    if (hasParentMetadata) parentMetadataUsedForRootCount += 1;
    parentFranchiseRootByTitle[title] = parentFranchiseRoot;
    parentRootSourceByTitle[title] = String(hasParentMetadata ? "parentVolumeName" : "title_fallback");
    const franchise = normalizeText(parentFranchiseRoot || "");
    const isAnchorFranchise = anchorFranchises.some((seed) => franchise.includes(normalizeText(seed)));
    const entryPointBoost =
      /\b(volume one|volume 1|book one|book 1)\b/i.test(title) || /#1\b/i.test(title)
        ? 14
        : isAnchorFranchise && /\btpb\b/i.test(title)
          ? 8
          : 0;
    if (entryPointBoost > 0) entryPointCandidatesFound += 1;
    const lateVolumePenalty = /\b(volume|book)\s*(5|6|7|8|9|10|11|12)\b/i.test(normalizedTitle) || /#(20|30|40|50|60|70|80|90)\b/.test(title) ? -16 : 0;
    const sideStoryPenalty =
      /\b(all her monsters|omega|clockworks|mecca conclusion|silk road|boss rush)\b/i.test(normalizedTitle)
        ? -22
        : 0;
    const genericArtifactPenalty = /^graphic horror novel\b/i.test(title) || /^graphic fantasy\b/i.test(title) || /^the graphic novel$/i.test(title.trim()) ? -20 : 0;
    const broadArtifactTitle =
      /:\s*graphic novel$/i.test(title) ||
      /^.+:\s*the graphic novel/i.test(title) ||
      /^.+\sgraphic novel$/i.test(title);
    const issueFragmentPenalty = /#\s*\d+\b/.test(title) && !/\b(vol\.?|volume|tpb|collection|omnibus|deluxe|book)\b/i.test(title) ? -12 : 0;
    const subtitleSideArcPenalty = /\b(after the flood|the road to war|the ratio part|one night only|election day|mecca conclusion|silk road|boss rush)\b/i.test(normalizedTitle)
      && !/\b(volume one|volume 1|book one|book 1|omnibus|collection|anthology|marvel-verse)\b/i.test(normalizedTitle) ? -30 : 0;
    const collectedStarterLike = isCollectedStarterLikeText(`${title} ${subtitle}`);
    const subtitleFragmentLike = hasParentMetadata && isLikelySubtitleFragmentTitle(title);
    if (subtitleFragmentLike && !subtitleFragmentInheritedParentRootTitles.includes(title)) subtitleFragmentInheritedParentRootTitles.push(title);
    if (subtitleFragmentLike && collectedStarterLike && !fragmentAcceptedBecauseCollectedEditionTitles.includes(title)) fragmentAcceptedBecauseCollectedEditionTitles.push(title);
    const subtitleFragmentPenalty = subtitleFragmentLike && !collectedStarterLike ? -26 : 0;
    const walkingDeadSubtitleFragmentPenalty =
      parentFranchiseRoot === "the-walking-dead" &&
      /\b(storm the gates|the last stand|the farm house|the road back|the rotten core|aftermath|vainqueurs|opportunity|conquered|betrayed|a gathering|found|eugene tinkers|confrontation)\b/i.test(normalizedTitle) &&
      !/\b(volume|vol\.?|book|collection|omnibus|treasury|master edition|compendium)\b/i.test(normalizedTitle)
        ? -34
        : 0;
    const canonicalAnchorTitleBoost = isAnchorFranchise ? 10 : 0;
    const isSIKTC = /\bsomething is killing the children\b/i.test(normalizedTitle);
    const matchedProfileSeeds = profileSelectedEntitySeeds.filter((seed) => normalizedTitle.includes(normalizeText(seed)));
    const isExpansionCandidate = Boolean((doc as any)?.isExpansionCandidate || (doc as any)?.diagnostics?.isExpansionCandidate);
    const expansionQueryRoot = expansionQueryToRoot(String((doc as any)?.expansionQueryText || (doc as any)?.queryText || ""));
    const expansionRoot = parentFranchiseRootForDoc(doc);
    const aliasPool = expansionAliasMap[expansionQueryRoot] || [expansionQueryRoot.replace(/-/g, " ")];
    const strictRootOnly = new Set(["saga", "sweet-tooth", "spider-man", "miles-morales"]);
    const parentOrRootMatch =
      aliasPool.some((alias) => normalizeText(String(doc?.parentVolumeName || doc?.rawDoc?.parentVolumeName || "")).includes(normalizeText(alias))) ||
      (expansionRoot && (expansionRoot === expansionQueryRoot || aliasPool.some((alias) => expansionRoot.includes(normalizeText(alias).replace(/[^a-z0-9]+/g, "-")))));
    const titleAliasLooseMatch = aliasPool.some((alias) => normalizedTitle.includes(normalizeText(alias)));
    const queryRootMatched = strictRootOnly.has(expansionQueryRoot) ? parentOrRootMatch : (parentOrRootMatch || titleAliasLooseMatch);
    matchedProfileSeeds.forEach((seed) => {
      entitySeedCandidatesFoundBySeed[seed] = (entitySeedCandidatesFoundBySeed[seed] || 0) + 1;
    });
    const profileSeedBoost = matchedProfileSeeds.length > 0 ? 8 : 0;
    const hasProfileGenreMatch = /\b(horror|dark|survival|apocalypse|superhero|coming of age|sci[- ]?fi|science fiction|speculative)\b/.test(normalizedTitle);
    const hasAuthorityMetadata = Boolean((doc as any)?.author || (doc as any)?.author_name?.length || (doc as any)?.publisher || (doc as any)?.isbn);
    const hasNonGenericTitle = !broadArtifactTitle && !/^the graphic novel$/i.test(title.trim());
    const isKnownCanonicalFranchise = knownCanonicalFranchises.some((seed) => franchise.includes(normalizeText(seed)) || normalizedTitle.includes(normalizeText(seed)));
    const broadArtifactPenalty = broadArtifactTitle && !isKnownCanonicalFranchise && matchedProfileSeeds.length === 0 ? -24 : 0;
    const hasPositiveSignal = matchedProfileSeeds.length > 0 || isKnownCanonicalFranchise || hasProfileGenreMatch || hasNonGenericTitle || hasAuthorityMetadata;
    const globalSeedSuppression = isSIKTC && suppressedGlobalSeedReason !== "none" ? -28 : 0;
    const priorSeriesPenalty = (routingInput.priorSeriesKeys || []).some((k) => normalizeText(String(k || "")) === franchise) ? -20 : 0;
    const nonEnglishEditionPenalty =
      /\b(uhrwerke|schlüssel|willkommen|psychospiele|die schattenkrone)\b/i.test(normalizedTitle) ||
      (Array.isArray((doc as any)?.language) && (doc as any).language.length > 0 && !(doc as any).language.includes("eng"))
        ? -22
        : 0;
    const heuristicScore =
      entryPointBoost + canonicalAnchorTitleBoost + profileSeedBoost + sideStoryPenalty + subtitleSideArcPenalty + subtitleFragmentPenalty + walkingDeadSubtitleFragmentPenalty + issueFragmentPenalty + genericArtifactPenalty + broadArtifactPenalty + lateVolumePenalty + globalSeedSuppression + priorSeriesPenalty;
    const baseScore = Number(doc?.score ?? doc?.diagnostics?.finalScore ?? 0);
    const isKnownTranslatedLocale = /\b(maschinenmond|uhrwerke|schlüssel|willkommen|psychospiele|die schattenkrone)\b/i.test(String(title));
    const hasEnglishAlternativeInUniverse = scoringUniverse.some((d: any) => parentFranchiseRootForDoc(d) === expansionRoot && !/\b(maschinenmond|uhrwerke|schlüssel|willkommen|psychospiele|die schattenkrone)\b/i.test(String(d?.title || "")));
    const weakHobbitFiller = /\bthe hobbit\b/i.test(title) && !(/\b(fantasy|adventure)\b/.test(profileTextForSeeds) || ["fantasy", "adventure"].includes(routerFamily));
    const expansionQueryRootMismatch = isExpansionCandidate && Boolean(expansionQueryRoot) && !queryRootMatched;
    const shouldRejectAsBroadArtifact = (broadArtifactTitle && !hasPositiveSignal && !isKnownCanonicalFranchise) || weakHobbitFiller || expansionQueryRootMismatch || (isExpansionCandidate && isKnownTranslatedLocale && hasEnglishAlternativeInUniverse);
    if (expansionQueryRootMismatch) {
      expansionQueryRootMismatchRejectedTitles.push(title);
      expansionFalsePositiveRejectedTitles.push(title);
    }
    if (isExpansionCandidate && isKnownTranslatedLocale && hasEnglishAlternativeInUniverse) expansionLocaleRejectedTitles.push(title);
    if (weakHobbitFiller) expansionWeakFillerRejectedTitles.push(title);
    if (shouldRejectAsBroadArtifact) broadArtifactRejectedTitles.push(title);
    return {
      ...doc,
      score: baseScore + heuristicScore + nonEnglishEditionPenalty,
      rejectedInScoredRebuild: shouldRejectAsBroadArtifact,
      diagnostics: {
        ...(doc?.diagnostics || {}),
        entryPointBoost,
        canonicalAnchorTitleBoost,
        sideStoryPenalty,
        issueFragmentPenalty,
        subtitleSideArcPenalty,
        subtitleFragmentPenalty,
        walkingDeadSubtitleFragmentPenalty,
        broadArtifactPenalty,
        nonEnglishEditionPenalty,
        profileSeedBoost,
        hasPositiveSignal,
        broadArtifactTitle,
        globalSeedSuppression,
        priorSeriesPenalty,
        rejectedInScoredRebuild: shouldRejectAsBroadArtifact,
        finalScore: baseScore + heuristicScore + nonEnglishEditionPenalty,
      },
    };
  });
  const scoringPassApplied = scoringPassInputCount > 0;
  const scoringPassOutputCount = scoredCanonicalDocs.length;
  const topScoredTitles = [...scoredCanonicalDocs]
    .sort((a: any, b: any) => Number(b?.score || 0) - Number(a?.score || 0))
    .slice(0, 10)
    .map((doc: any) => ({ title: String(doc?.title || ""), score: Number(doc?.score || 0) }));
  const scoredUniversePreviewTitles = [...scoredCanonicalDocs]
    .sort((a: any, b: any) => Number(b?.score || 0) - Number(a?.score || 0))
    .slice(0, 40)
    .map((doc: any) => String(doc?.title || "").trim())
    .filter(Boolean);
  finalRenderDocs = scoredCanonicalDocs.filter((doc: any) => !Boolean((doc as any)?.rejectedInScoredRebuild));
  const positiveFitScoreByTitle: Record<string, number> = {};
  const positiveFitReasonsByTitle: Record<string, string[]> = {};
  const penaltyReasonsByTitle: Record<string, string[]> = {};
  const finalSelectionRejectedByReason: Record<string, number> = {};
  const genericTasteSignals = new Set(["audience:teen", "age:mshs", "media:movie", "media:tv", "film", "series", "format", "family", "identity", "dark"]);
  const ignoredGenericTasteSignals: string[] = [];
  const extractWeightedSignals = (obj: Record<string, any>, kind: "liked" | "disliked" | "skipped") => {
    return Object.entries(obj || {})
      .map(([k, v]) => ({ signal: String(k), weight: Number(v || 0) }))
      .filter((row) => row.weight > 0)
      .map((row) => {
        if (genericTasteSignals.has(row.signal)) {
          ignoredGenericTasteSignals.push(`${kind}:${row.signal}`);
          row.weight = row.weight * 0.15;
        } else if (/^genre:/.test(row.signal)) row.weight = row.weight * 3.2;
        else if (/^(tone:|mood:)/.test(row.signal)) row.weight = row.weight * 2.6;
        else if (/^(theme:|drive:)/.test(row.signal)) row.weight = row.weight * 2.4;
        else if (/^(universe:|source:)/.test(row.signal)) row.weight = row.weight * 1.5;
        else if (/^(media:|format:)/.test(row.signal)) row.weight = row.weight * 0.7;
        else if (/^(audience:|age:)/.test(row.signal)) row.weight = row.weight * 0.2;
        else row.weight = row.weight * 1.0;
        return row;
      })
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 30);
  };
  const weightedSwipeTasteVector = {
    liked: extractWeightedSignals((routingInput as any)?.tagCounts || {}, "liked"),
    disliked: extractWeightedSignals(combinedDislikedTagCounts || {}, "disliked"),
    skipped: extractWeightedSignals((routingInput as any)?.skippedTagCounts || {}, "skipped"),
  };
  const dislikedSignalsFromSwipeHistory = Array.from(new Set(
    (Array.isArray((routingInput as any)?.swipeHistory) ? (routingInput as any).swipeHistory : [])
      .filter((swipe: any) => isNegativeSwipeForRouting(swipe))
      .flatMap((swipe: any) => collectSwipeTagsForRouting(swipe))
      .map((tag: string) => normalizeText(String(tag || "")))
      .filter(Boolean)
  ));
  if (weightedSwipeTasteVector.disliked.length === 0 && dislikedSignalsFromSwipeHistory.length > 0) {
    weightedSwipeTasteVector.disliked = dislikedSignalsFromSwipeHistory.slice(0, 30).map((signal) => ({ signal, weight: 1.5 }));
  }
  const swipeTasteVector = {
    liked: weightedSwipeTasteVector.liked.map((s) => s.signal),
    disliked: weightedSwipeTasteVector.disliked.map((s) => s.signal),
    skipped: weightedSwipeTasteVector.skipped.map((s) => s.signal),
  };
  const dislikeProfileBuildFailure = ((Object.keys((routingInput as any)?.leftTagCounts || {}).length > 0) || (Object.keys((routingInput as any)?.dislikedTagCounts || {}).length > 0)) && weightedSwipeTasteVector.disliked.length === 0;
  const dislikeProfileBuildFailureReason = dislikeProfileBuildFailure ? "left swipes present but disliked signals empty after swipeHistory promotion" : "none";
  const candidateTasteMatchScoreByTitle: Record<string, number> = {};
  const candidateTastePenaltyByTitle: Record<string, number> = {};
  const candidateMatchedLikedSignalsByTitle: Record<string, string[]> = {};
  const candidateMatchedDislikedSignalsByTitle: Record<string, string[]> = {};
  const finalScoreComponentsByTitle: Record<string, Record<string, number>> = {};
  const candidateWeightedTasteScoreByTitle: Record<string, number> = {};
  const candidateDislikePenaltyByTitle: Record<string, number> = {};
  const candidateSkipPenaltyByTitle: Record<string, number> = {};
  const singleTokenQueryHijackPenaltyByTitle: Record<string, number> = {};
  const queryTermOnlyEvidenceByTitle: Record<string, boolean> = {};
  const titleOnlyTasteSignalByTitle: Record<string, string[]> = {};
  const semanticSupportFoundByTitle: Record<string, boolean> = {};
  const semanticEvidenceCountByTitle: Record<string, number> = {};
  const finalRankingReasonByTitle: Record<string, string[]> = {};
  const placeholderPenaltyAppliedTitles: string[] = [];
  const narrativeTitleConfidenceByTitle: Record<string, number> = {};
  const lowPositiveFitThresholdByCandidate: Record<string, number> = {};
  const candidateKilledByPenaltyStack: string[] = [];
  const semanticEligibilityRejectedReason: Record<string, string> = {};
  const genericRootSuppressed: string[] = [];
  const rootBoostSuppressed: string[] = [];
  const narrativeEvidenceScore: Record<string, number> = {};
  const structuralOnlyMatch: string[] = [];
  let recentReturnedTitlePenaltyApplied = 0;
  let recentReturnedRootPenaltyApplied = 0;
  let repeatedTitleSuppressed = 0;
  let repeatedRootSuppressed = 0;
  let crossSessionDiversityApplied = false;
  let crossSessionDiversityBypassedReason = "not_fresh_session";
  const diversityMemoryHitTitles: string[] = [];
  const diversityMemoryHitRoots: string[] = [];
  let diversityPenaltyStage = "pre-collapse_scoring";
  let diversitySuppressionStage = "post-score_pre-final-collapse";
  let repeatPenaltyCandidateCount = 0;
  const isFreshUserSession = !Array.isArray((input as any)?.priorRecommendedIds) || (input as any).priorRecommendedIds.length === 0;
  const tasteSignature = normalizeText(JSON.stringify({
    genres: tasteProfileSummary.likedGenres,
    tones: tasteProfileSummary.likedTones,
    themes: tasteProfileSummary.likedThemes,
  }));

  const pushReason = (bucket: Record<string, string[]>, title: string, reason: string) => {
    if (!bucket[title]) bucket[title] = [];
    if (!bucket[title].includes(reason)) bucket[title].push(reason);
  };
  const hardInvalid = (doc: any): string => {
    const title = String(doc?.title || "").trim();
    const root = parentFranchiseRootForDoc(doc);
    if (!title || /^\.\.\.$/.test(title) || /^\s*(the\s+walking\s+dead:)?\s*\.\.\.\s*$/.test(title)) return "placeholder";
    if (/#\s*\d+\b/.test(title) && !/\b(vol\.?|volume|tpb|collection|omnibus|book)\b/i.test(title)) return "issue_fragment";
    if (Number((doc?.diagnostics as any)?.nonEnglishEditionPenalty || 0) < 0 && finalRenderDocs.some((d: any) => parentFranchiseRootForDoc(d) === root && Number((d?.diagnostics as any)?.nonEnglishEditionPenalty || 0) >= 0)) return "locale_variant";
    if (/^(.+:\s*)?(a\s+graphic novel|the\s+graphic novel|graphic novel)$/i.test(title) && !root) return "generic_artifact_no_root";
    return "";
  };
  const genericNarrativeRoots = new Set(["fantasy","survival","horror","mystery","adventure","dark","apocalypse","thriller","science-fiction","science fiction"]);
  const semanticPrefiltered = finalRenderDocs.filter((doc: any) => {
    const title = String(doc?.title || "").trim();
    const text = normalizeText(`${title} ${String(doc?.description || "")}`);
    const packagingOnly = /\b(limited series|collected edition|trade paperback|hardcover|tpb|collection|archives?|anthology)\b/i.test(text);
    const hasNarrative = /\b(story|character|conspiracy|investigation|psychological|survival|identity|relationship|journey|murder|mystery|thriller)\b/i.test(text);
    const hasTasteOverlap = weightedSwipeTasteVector.liked.some((row) => text.includes(normalizeText(row.signal)));
    narrativeEvidenceScore[title] = (hasNarrative ? 1 : 0) + (hasTasteOverlap ? 1 : 0);
    if (packagingOnly && !hasNarrative && !hasTasteOverlap) {
      semanticEligibilityRejectedReason[title] = "packaging_only_without_narrative_or_taste";
      structuralOnlyMatch.push(title);
      return false;
    }
    return true;
  });
  const viableCandidates = semanticPrefiltered
    .map((doc: any) => {
      const title = String(doc?.title || "");
      const invalidReason = hardInvalid(doc);
      if (invalidReason) {
        finalSelectionRejectedByReason[invalidReason] = Number(finalSelectionRejectedByReason[invalidReason] || 0) + 1;
        pushReason(penaltyReasonsByTitle, title, invalidReason);
        return null;
      }
      const text = normalizeText(`${title} ${String(doc?.description || "")}`);
      const queryText = normalizeText(String(doc?.queryText || doc?.rawDoc?.queryText || ""));
      const matchedLikedWeighted = weightedSwipeTasteVector.liked.filter((row) => text.includes(normalizeText(row.signal)));
      const matchedDislikedWeighted = weightedSwipeTasteVector.disliked.filter((row) => text.includes(normalizeText(row.signal)));
      const matchedSkippedWeighted = weightedSwipeTasteVector.skipped.filter((row) => text.includes(normalizeText(row.signal)));
      const matchedLiked = matchedLikedWeighted.map((r) => r.signal).slice(0, 8);
      const matchedDisliked = matchedDislikedWeighted.map((r) => r.signal).slice(0, 8);
      const matchedSkipped = matchedSkippedWeighted.map((r) => r.signal).slice(0, 8);
      const tasteMatchScore = matchedLikedWeighted.reduce((acc, row) => acc + row.weight, 0);
      const dislikePenalty = matchedDislikedWeighted.reduce((acc, row) => acc + row.weight * 1.25, 0);
      const skipPenalty = matchedSkippedWeighted.reduce((acc, row) => acc + row.weight * 0.45, 0);
      const tastePenaltyScore = dislikePenalty + skipPenalty;
      const laneMatch = /\b(thriller|mystery|science fiction|superhero|fantasy|adventure|coming of age|psychological|speculative)\b/.test(text);
      const themeOverlap = profileSelectedEntitySeeds.some((seed) => text.includes(normalizeText(seed)));
      const root = parentFranchiseRootForDoc(doc);
      const isGenericRoot = genericNarrativeRoots.has(String(root || "").toLowerCase());
      if (isGenericRoot && title) genericRootSuppressed.push(title);
      const rootMatch = !isGenericRoot && Boolean(root);
      const starterSignal = /\b(volume one|volume 1|book one|book 1|tpb|collection|compendium|omnibus)\b/i.test(title);
      const audienceFit = /\b(teen|young adult|adult)\b/i.test(`${title} ${String(doc?.description || "")}`);
      const provenanceConfidence = Boolean(doc?.sourceId || doc?.queryText || doc?.parentVolumeName);
      const defaultRoot = ["something-is-killing-the-children", "sweet-tooth", "ms-marvel", "the-walking-dead"].includes(parentFranchiseRootForDoc(doc));
      const unsupportedDefaultPenalty = defaultRoot && matchedLiked.length === 0 ? 3 : 0;
      const normalizedTitle = normalizeText(title);
      const docRoot = parentFranchiseRootForDoc(doc);
      const seenRecentTitle = recentFreshReturnedTitles.some((bucket) => bucket.includes(normalizedTitle));
      const seenRecentRoot = recentFreshReturnedRoots.some((bucket) => bucket.includes(docRoot));
      const titleRepeatPenalty = isFreshUserSession && seenRecentTitle ? 16 : 0;
      const rootRepeatPenalty = isFreshUserSession && seenRecentRoot ? 6 : 0;
      if (titleRepeatPenalty) {
        recentReturnedTitlePenaltyApplied += titleRepeatPenalty;
        diversityMemoryHitTitles.push(title);
      }
      if (rootRepeatPenalty) {
        recentReturnedRootPenaltyApplied += rootRepeatPenalty;
        diversityMemoryHitRoots.push(docRoot || "(none)");
      }
      if (titleRepeatPenalty || rootRepeatPenalty) repeatPenaltyCandidateCount += 1;
      if (isFreshUserSession && (titleRepeatPenalty > 0 || rootRepeatPenalty > 0) && tasteMatchScore < 2.25) {
        finalSelectionRejectedByReason.recent_repeat_weak_taste = Number(finalSelectionRejectedByReason.recent_repeat_weak_taste || 0) + 1;
        pushReason(penaltyReasonsByTitle, title, "recent_repeat_weak_taste");
        return null;
      }
      const narrativeWorkSignal = /\b(volume one|volume 1|book one|book 1|tpb|trade paperback|hardcover|hc|ogn|original graphic novel|omnibus|compendium|collected edition|collection|saga|chronicles?)\b/i.test(`${title} ${String(doc?.description || "")}`);
      const hasFranchiseAnchor = profileSelectedEntitySeeds.some((seed) => normalizeText(title).includes(normalizeText(seed)));
      const publisherConfidence = /\b(image|dark horse|boom|dc|marvel|idw|vertigo)\b/i.test(`${String(doc?.publisher || "")} ${String((doc as any)?.rawDoc?.publisher || "")}`);
      const collectionEditionBoost = /\b(volume|vol\.|book|tpb|trade paperback|hardcover|hc|ogn|omnibus|compendium|collected edition)\b/i.test(title) ? 1 : 0;
      if (isGenericRoot && title) rootBoostSuppressed.push(title);
      const genericSuperheroTitlePenalty = /\bsuperhero(es)?\b/i.test(title) && !/\b(spider-man|batman|ms\.?\s*marvel|invincible|runaways|x-men|avengers)\b/i.test(title) ? 2.5 : 0;
      const strongTasteOverlap = tasteMatchScore >= 3;
      const looksGenericPlaceholder = /\b(graphic novel|science fiction|fantasy)\b/i.test(title) && title.split(/\s+/).length <= 8;
      const skipPlaceholderPenalty = starterSignal || collectionEditionBoost > 0 || narrativeWorkSignal || hasFranchiseAnchor || strongTasteOverlap || rootMatch;
      const genericGraphicNovelPlaceholderPenalty = looksGenericPlaceholder && !skipPlaceholderPenalty ? 2 : 0;
      if (genericGraphicNovelPlaceholderPenalty > 0) placeholderPenaltyAppliedTitles.push(title);
      const metaReferencePenalty = /\b(feedback|preview|anthology|collection of|history of|reference|guide|companion|educational|study|criticism)\b/i.test(`${title} ${String(doc?.description || "")}`) ? 3 : 0;
      const retroHorrorArchivePenalty = /\b(crypt of horror|tomb of horror|vault of horror|haunt of horror|horror city|ec comics|archives?)\b/i.test(`${title} ${String(doc?.description || "")}`) ? 5.5 : 0;
      const anthologyHorrorPenalty = /\b(horror anthology|anthology of horror|collected horror stories|horror archives?)\b/i.test(`${title} ${String(doc?.description || "")}`) ? 4 : 0;
      const historicalAboutPenalty = /\bhistorical graphic novel about\b/i.test(title) ? 3 : 0;
      const queryTokens = queryText.split(/\s+/).filter((t) => t.length >= 4 && !/\b(comic|series|collected|edition|volume|trade|paperback|graphic|novel)\b/.test(t));
      const titleTokenHits = queryTokens.filter((t) => normalizeText(title).includes(t)).length;
      const hasSupportOutsideTitle = queryTokens.some((t) => normalizeText(String(doc?.description || "")).includes(t) || normalizeText(String(doc?.publisher || "")).includes(t));
      const broadGenreTokenRe = /^(fantasy|mystery|adventure|survival|horror|romance|thriller|science|fiction|dystopian)$/i;
      const titleOnlyTokens = queryTokens.filter((t) => normalizeText(title).includes(t) && broadGenreTokenRe.test(t));
      const queryTermOnlyEvidence = titleTokenHits > 0 && !hasSupportOutsideTitle;
      const normalizedRoot = normalizeText(String(docRoot || "").replace(/-/g, " "));
      const franchiseAffinity = profileSelectedEntitySeeds.some((seed) => normalizedRoot.includes(normalizeText(seed)));
      const narrativeOverlap = laneMatch || narrativeWorkSignal;
      const semanticEvidenceCount =
        (matchedLikedWeighted.length > 0 ? 1 : 0) +
        (hasSupportOutsideTitle ? 1 : 0) +
        (themeOverlap ? 1 : 0) +
        (franchiseAffinity ? 1 : 0) +
        (narrativeOverlap ? 1 : 0);
      const semanticSupportFound = semanticEvidenceCount > 0;
      const structuralBoostsAllowed = semanticSupportFound;
      const starterSignalScore = starterSignal && structuralBoostsAllowed ? 0.8 : 0;
      const collectionEditionScore = collectionEditionBoost && structuralBoostsAllowed ? 0.8 : 0;
      const narrativeTitleConfidenceScore = (collectionEditionScore ? 1.2 : 0) + (narrativeWorkSignal ? 1.5 : 0) + (hasFranchiseAnchor ? 1.25 : 0) + (rootMatch ? 0.5 : 0) + (publisherConfidence ? 0.35 : 0);
      const singleTokenQueryHijackPenalty = queryTermOnlyEvidence ? Math.max(6, 10 - (titleTokenHits * 1.25)) : 0;
      queryTermOnlyEvidenceByTitle[title] = queryTermOnlyEvidence;
      titleOnlyTasteSignalByTitle[title] = titleOnlyTokens;
      semanticSupportFoundByTitle[title] = semanticSupportFound;
      semanticEvidenceCountByTitle[title] = semanticEvidenceCount;
      if (queryTermOnlyEvidence && titleOnlyTokens.length > 0 && matchedLiked.length === 0) {
        finalSelectionRejectedByReason.query_literalism_title_only = Number(finalSelectionRejectedByReason.query_literalism_title_only || 0) + 1;
        pushReason(penaltyReasonsByTitle, title, "query_literalism_title_only");
        candidateKilledByPenaltyStack.push(title);
        return null;
      }
      const score = tasteMatchScore - tastePenaltyScore - unsupportedDefaultPenalty - titleRepeatPenalty - rootRepeatPenalty + (themeOverlap ? 1.25 : 0) + (narrativeWorkSignal ? 1.25 : 0) + starterSignalScore + (audienceFit ? 0.75 : 0) + narrativeTitleConfidenceScore + ((Number(doc?.score ?? 0) > 0 && tasteMatchScore >= 2.0 && semanticSupportFound) ? 0.5 : 0) - genericSuperheroTitlePenalty - genericGraphicNovelPlaceholderPenalty - metaReferencePenalty - historicalAboutPenalty - retroHorrorArchivePenalty - anthologyHorrorPenalty - singleTokenQueryHijackPenalty;
      if (titleRepeatPenalty) recentReturnedTitlePenaltyApplied += titleRepeatPenalty;
      if (rootRepeatPenalty) recentReturnedRootPenaltyApplied += rootRepeatPenalty;
      const finalCandidateScore = tasteMatchScore - tastePenaltyScore - unsupportedDefaultPenalty - titleRepeatPenalty - rootRepeatPenalty + (themeOverlap ? 2 : 0) + (narrativeWorkSignal ? 2 : 0) + starterSignalScore + (audienceFit ? 1 : 0) + narrativeTitleConfidenceScore + (rootMatch ? 0.5 : 0) + (laneMatch ? 0.25 : 0) + (provenanceConfidence && semanticSupportFound ? 0.05 : 0) + (Number(doc?.score ?? 0) > 0 && semanticSupportFound ? 0.5 : 0) - genericSuperheroTitlePenalty - genericGraphicNovelPlaceholderPenalty - metaReferencePenalty - historicalAboutPenalty - retroHorrorArchivePenalty - anthologyHorrorPenalty - singleTokenQueryHijackPenalty;
      narrativeTitleConfidenceByTitle[title] = narrativeTitleConfidenceScore;
      const lowPositiveFitThreshold = Boolean((doc as any)?.isExpansionCandidate || (doc?.diagnostics as any)?.isExpansionCandidate) ? 1.25 : 2;
      lowPositiveFitThresholdByCandidate[title] = lowPositiveFitThreshold;
      positiveFitScoreByTitle[title] = finalCandidateScore;
      candidateTasteMatchScoreByTitle[title] = tasteMatchScore;
      candidateTastePenaltyByTitle[title] = tastePenaltyScore;
      candidateMatchedLikedSignalsByTitle[title] = matchedLiked;
      candidateMatchedDislikedSignalsByTitle[title] = matchedDisliked;
      candidateWeightedTasteScoreByTitle[title] = tasteMatchScore;
      candidateDislikePenaltyByTitle[title] = dislikePenalty;
      candidateSkipPenaltyByTitle[title] = skipPenalty;
      singleTokenQueryHijackPenaltyByTitle[title] = singleTokenQueryHijackPenalty;
      finalScoreComponentsByTitle[title] = { tasteMatchScore, tastePenaltyScore: -tastePenaltyScore, unsupportedDefaultPenalty: -unsupportedDefaultPenalty, titleRepeatPenalty: -titleRepeatPenalty, rootRepeatPenalty: -rootRepeatPenalty, laneMatch: laneMatch ? 0.25 : 0, themeOverlap: themeOverlap ? 2 : 0, rootMatch: rootMatch ? 0.5 : 0, starterSignal: starterSignalScore, audienceFit: audienceFit ? 1 : 0, provenanceConfidence: provenanceConfidence && semanticSupportFound ? 0.05 : 0, narrativeWorkSignal: narrativeWorkSignal ? 2 : 0, narrativeTitleConfidenceScore, semanticEvidenceCount, genericSuperheroTitlePenalty: -genericSuperheroTitlePenalty, genericGraphicNovelPlaceholderPenalty: -genericGraphicNovelPlaceholderPenalty, metaReferencePenalty: -metaReferencePenalty, historicalAboutPenalty: -historicalAboutPenalty, retroHorrorArchivePenalty: -retroHorrorArchivePenalty, anthologyHorrorPenalty: -anthologyHorrorPenalty, singleTokenQueryHijackPenalty: -singleTokenQueryHijackPenalty, baseScorePositive: Number(doc?.score ?? 0) > 0 && semanticSupportFound ? 0.5 : 0 };
      finalRankingReasonByTitle[title] = [
        ...(tasteMatchScore > 0 ? ["liked_overlap"] : []),
        ...(dislikePenalty > 0 ? ["disliked_overlap_penalty"] : []),
        ...(skipPenalty > 0 ? ["skip_overlap_penalty"] : []),
        ...(laneMatch ? ["lane_match"] : []),
        ...(themeOverlap ? ["theme_overlap"] : []),
      ];
      const reasons: string[] = [];
      if (laneMatch) reasons.push("lane_match");
      if (themeOverlap) reasons.push("theme_overlap");
      if (rootMatch) reasons.push("root_match");
      if (starterSignal) reasons.push("starter_or_collection");
      if (audienceFit) reasons.push("audience_fit");
      if (provenanceConfidence) reasons.push("provenance_confidence");
      positiveFitReasonsByTitle[title] = reasons;
      if (finalCandidateScore < lowPositiveFitThreshold) {
        finalSelectionRejectedByReason.low_positive_fit = Number(finalSelectionRejectedByReason.low_positive_fit || 0) + 1;
        pushReason(penaltyReasonsByTitle, title, "low_positive_fit");
        if ((genericGraphicNovelPlaceholderPenalty + metaReferencePenalty + historicalAboutPenalty) >= 3 && strongTasteOverlap) candidateKilledByPenaltyStack.push(title);
        return null;
      }
      return { ...doc, positiveFitScore: finalCandidateScore };
    })
    .filter(Boolean) as any[];
  finalRenderDocs = viableCandidates.sort((a: any, b: any) => Number(b?.positiveFitScore || 0) - Number(a?.positiveFitScore || 0));
  if (isFreshUserSession) {
    crossSessionDiversityApplied = true;
    crossSessionDiversityBypassedReason = "none";
    const previousTaste = recentFreshTasteSignatures[recentFreshTasteSignatures.length - 1] || "";
    const highlySimilarTaste = previousTaste && previousTaste === tasteSignature;
    const titleSeenSet = new Set(recentFreshReturnedTitles.flat());
    const rootSeenSet = new Set(recentFreshReturnedRoots.flat());
    const diversified: any[] = [];
    for (const doc of finalRenderDocs) {
      const title = normalizeText(String(doc?.title || ""));
      const root = parentFranchiseRootForDoc(doc);
      const isRepeatedTitle = titleSeenSet.has(title);
      const isRepeatedRoot = rootSeenSet.has(root);
      if (isRepeatedTitle) {
        const strongestByMargin = Number(doc?.positiveFitScore || 0) >= Number((finalRenderDocs[1]?.positiveFitScore ?? 0)) + 10;
        if (!(highlySimilarTaste && strongestByMargin)) {
          repeatedTitleSuppressed += 1;
          continue;
        }
      }
      if (isRepeatedRoot && !isRepeatedTitle) {
        const docScore = Number(doc?.positiveFitScore || 0);
        if (docScore < 12) {
          repeatedRootSuppressed += 1;
          continue;
        }
      }
      diversified.push(doc);
    }
    finalRenderDocs = diversified;
  }
  const swipeRankedCandidateList = [...finalRenderDocs];
  const viableCandidateCountBeforeFinalSelection = finalRenderDocs.length;
  const viableCandidateRootsBeforeFinalSelection = Array.from(new Set(finalRenderDocs.map((d: any) => parentFranchiseRootForDoc(d)).filter(Boolean)));
  if (includeComicVine && (viableCandidateCountBeforeFinalSelection < 12 || expansionCleanEligibleCount < 8)) {
    narrativeExpansionTriggered = true;
    narrativeExpansionReason = viableCandidateCountBeforeFinalSelection < 12 ? "viable_candidates_below_threshold" : "clean_candidates_below_threshold";
    const narrativeSeedQueries = Array.from(new Set([
      "fantasy adventure comic series",
      "ya fantasy comic collected edition",
      "teen horror comic collected edition",
      "dystopian survival comic series",
      "superhero mystery comic collected edition",
      "science fiction adventure comic series",
      ...generatedComicVineQueriesFromTaste.map((q) => `${q.replace(/\s*graphic novel\s*$/i, "").trim()} comic series`),
      ...generatedComicVineQueriesFromTaste.map((q) => `${q.replace(/\s*graphic novel\s*$/i, "").trim()} collected edition`),
    ].map((q) => q.replace(/\s+/g, " ").trim()).filter(Boolean))).slice(0, 10);
    narrativeExpansionQueries = narrativeSeedQueries;
    try {
      const narrativeDocs = await runExpansionQueries(narrativeSeedQueries);
      narrativeExpansionRawCount = expansionFetchResultsByQuery.reduce((acc, row) => acc + Number(row.rawCount || 0), 0);
      narrativeExpansionConvertedCount = narrativeDocs.length;
      const acceptedNarrativeDocs = narrativeDocs.filter((doc: any) => {
        const title = String(doc?.title || "").trim();
        const text = normalizeText(`${title} ${String(doc?.description || "")}`);
        narrativeExpansionCandidatesEnteredScoringCount += 1;
        if (!title) {
          narrativeExpansionCandidatesDroppedBeforeScoringByReason.missing_title = Number(narrativeExpansionCandidatesDroppedBeforeScoringByReason.missing_title || 0) + 1;
          return false;
        }
        const weightedTaste = weightedSwipeTasteVector.liked.reduce((acc, row) => acc + (text.includes(normalizeText(row.signal)) ? Number(row.weight || 0) : 0), 0);
        const narrativeLike = /\b(volume|book|tpb|omnibus|collection|collected edition|graphic novel|saga|chronicle|adventure|mystery|thriller|horror|fantasy|science fiction)\b/i.test(`${title} ${String(doc?.description || "")}`);
        const artifactLike = /\b(feedback|preview|guide|reference|history of|encyclopedia|study|criticism|anthology|collection of)\b/i.test(`${title} ${String(doc?.description || "")}`);
        if (weightedTaste < 2.5) narrativeExpansionCandidatesDroppedBeforeScoringByReason.low_taste_overlap = Number(narrativeExpansionCandidatesDroppedBeforeScoringByReason.low_taste_overlap || 0) + 1;
        if (!narrativeLike) narrativeExpansionCandidatesDroppedBeforeScoringByReason.low_narrative_signal = Number(narrativeExpansionCandidatesDroppedBeforeScoringByReason.low_narrative_signal || 0) + 1;
        if (artifactLike) narrativeExpansionCandidatesDroppedBeforeScoringByReason.artifact_or_meta = Number(narrativeExpansionCandidatesDroppedBeforeScoringByReason.artifact_or_meta || 0) + 1;
        const viable = weightedTaste >= 2.5 && narrativeLike && !artifactLike;
        if (viable) {
          const score = weightedTaste + (narrativeLike ? 2 : 0) + (/\b(volume one|volume 1|book one|book 1|tpb|collected edition|omnibus)\b/i.test(title) ? 1.5 : 0);
          positiveFitScoreByTitle[title] = Math.max(Number(positiveFitScoreByTitle[title] || 0), score);
          candidateWeightedTasteScoreByTitle[title] = Math.max(Number(candidateWeightedTasteScoreByTitle[title] || 0), weightedTaste);
          narrativeExpansionAcceptedTitles.push(title);
          narrativeExpansionCandidatesSurvivedScoringCount += 1;
        }
        return viable;
      });
      narrativeExpansionViableCount = acceptedNarrativeDocs.length;
      narrativeExpansionMergedDocs = acceptedNarrativeDocs.map((doc: any) => ({
        ...doc,
        isExpansionCandidate: true,
        diagnostics: { ...(doc?.diagnostics || {}), isExpansionCandidate: true, narrativeExpansionCandidate: true },
      }));
      finalRenderDocs = dedupeDocs([...finalRenderDocs, ...narrativeExpansionMergedDocs]).slice(0, 60);
      if (acceptedNarrativeDocs.length > 0 && expansionCandidatesEnteredScoringCount === 0) {
        expansionMergedButNotScoredReason = "narrative_expansion_docs_merged_but_not_scored";
      }
    } catch (e: any) {
      narrativeExpansionReason = `fetch_error:${String(e?.message || e)}`;
    }
  }
  const scoredCandidateUniverseCount = scoringUniverse.length;
  const expansionTitleSetForScoring = new Set(expansionSelectedTitles.map((t) => normalizeText(String(t || ""))));
  const preferredExpansionRoots = new Set(["locke-key", "sweet-tooth", "descender", "spider-man", "runaways", "black-science", "invincible", "the-sandman"]);
  let expansionCandidatesEnteredScoringCount = 0;
  let expansionCandidatesSurvivedFiltersCount = 0;
  const expansionCandidatesRejectedByReason: Record<string, number> = {};
  const expansionCandidatesAcceptedFinal: string[] = [];
  const candidateDiversityFloorTarget = includeComicVine ? 30 : 20;
  const postTopUpFinalItemsLength = finalRenderDocs.length;
  const recoveryFinalItemsLength = finalRenderDocs.length;
  const emergencySparseMode = false;
  const finalEligibleNonNegativeCount = finalRenderDocs.filter((doc: any) => Number(doc?.score ?? doc?.diagnostics?.finalScore ?? 0) >= 0).length;
  const finalFranchiseFamilies = Array.from(new Set(finalRenderDocs.map((doc: any) => finalSeriesKeyForRender(doc)).filter(Boolean)));
  const broadArtifactCount = finalRenderDocs.filter((doc: any) => /^(.+:\s*)?(a\s+graphic novel|the\s+graphic novel|graphic novel)$/i.test(String(doc?.title || ""))).length;
  if (finalFranchiseFamilies.length <= 2 || broadArtifactCount >= 2) {
    recoveryRejectedReasons.post_assembly_quality_guard_rebuild = (recoveryRejectedReasons.post_assembly_quality_guard_rebuild || 0) + 1;
  }
  const antiCollapseSelected: any[] = [];
  const qualityRecoveryReasons: string[] = [];
  const seedFamilyCounts: Record<string, number> = {};
  let walkingDeadSelectedCount = 0;
  let relaxedBreadthBackfillTriggered = false;
  const relaxedBreadthBackfillCandidates: string[] = [];
  const relaxedBreadthBackfillSelected: string[] = [];
  const relaxedBreadthBackfillRejectedReasons: Record<string, number> = {};
  let relaxationStageReached = "strict_high_quality_selected_results";
  let relaxationCandidatesConsidered = 0;
  let relaxationCandidatesSelected = 0;
  const relaxationRejectedReasons: Record<string, number> = {};
  const registerRelaxedReject = (reason: string) => {
    relaxedBreadthBackfillRejectedReasons[reason] = Number(relaxedBreadthBackfillRejectedReasons[reason] || 0) + 1;
    relaxationRejectedReasons[reason] = Number(relaxationRejectedReasons[reason] || 0) + 1;
  };
  const hasStarterInUniverse = (family: string) =>
    scoredCanonicalDocs.some((d: any) =>
      parentFranchiseRootForDoc(d) === family &&
      /\b(volume one|volume 1|book one|book 1|compendium|collection|omnibus|treasury|master edition)\b/i.test(String(d?.title || ""))
    );
  const isLateVolumeWhenStarterExists = (doc: any, family: string) =>
    hasStarterInUniverse(family) &&
    (/\b(volume|book)\s*(5|6|7|8|9|10|11|12|13|14|15|16)\b/i.test(String(doc?.title || "")) ||
      /\bbook\s*sixteen\b/i.test(String(doc?.title || "")));
  const isHardBlockedRelaxationCandidate = (doc: any, selected: any[]) => {
    const title = String(doc?.title || "");
    const family = parentFranchiseRootForDoc(doc);
    if (Number(doc?.score ?? doc?.diagnostics?.finalScore ?? 0) < 0) return "negative_score";
    if (Number((doc?.diagnostics as any)?.nonEnglishEditionPenalty || 0) < 0 && selected.some((d: any) => parentFranchiseRootForDoc(d) === family && Number((d?.diagnostics as any)?.nonEnglishEditionPenalty || 0) >= 0)) return "non_english_when_english_exists";
    if (Number((doc?.diagnostics as any)?.issueFragmentPenalty || 0) < 0 || Number((doc?.diagnostics as any)?.subtitleFragmentPenalty || 0) < 0 || Number((doc?.diagnostics as any)?.subtitleSideArcPenalty || 0) < 0 || Number((doc?.diagnostics as any)?.walkingDeadSubtitleFragmentPenalty || 0) < 0) return "fragment";
    if (/^\s*(\.\.\.|the\s+walking\s+dead:\s*\.\.\.)\s*$/i.test(title) || /^(.+:\s*)?(a\s+graphic novel|the\s+graphic novel|graphic novel)$/i.test(title)) return "placeholder_or_generic";
    if (isLateVolumeWhenStarterExists(doc, family)) return "late_volume_when_starter_exists";
    return "";
  };
  const hasWalkingDeadStarter = finalRenderDocs.some((d: any) => parentFranchiseRootForDoc(d) === "the-walking-dead" && /\b(volume one|volume 1|book one|book 1|compendium|collection|omnibus|treasury|master edition)\b/i.test(String(d?.title || "")));
  for (const doc of [...finalRenderDocs].sort((a: any, b: any) => Number(b?.score || 0) - Number(a?.score || 0))) {
    const family = parentFranchiseRootForDoc(doc);
    const matchingSeed = profileSelectedEntitySeeds.find((seed) => normalizeText(String(doc?.title || "")).includes(normalizeText(seed)) || family.includes(normalizeText(seed).replace(/[^a-z0-9]+/g, "-")));
    const seedCount = matchingSeed ? Number(seedFamilyCounts[matchingSeed] || 0) : 0;
    const saturationPenalty = seedCount >= 2 ? 18 : seedCount >= 1 ? 8 : 0;
    if (matchingSeed && saturationPenalty > 0) seedSaturationPenaltyApplied[matchingSeed] = (seedSaturationPenaltyApplied[matchingSeed] || 0) + saturationPenalty;
    const docRoot = parentFranchiseRootForDoc(doc);
    const isExpansionDoc = Boolean((doc as any)?.isExpansionCandidate || (doc?.diagnostics as any)?.isExpansionCandidate || expansionTitleSetForScoring.has(normalizeText(String(doc?.title || ""))));
    if (isExpansionDoc) expansionCandidatesEnteredScoringCount += 1;
    const expansionDiversityBonus = isExpansionDoc && preferredExpansionRoots.has(docRoot) && finalRenderDocs.length < 8 ? 14 : 0;
    const incumbentPenalty = finalRenderDocs.length < 8 && ["something-is-killing-the-children", "ms-marvel"].includes(docRoot) ? 24 : 0;
    const docScore = Number(doc?.score ?? doc?.diagnostics?.finalScore ?? 0) - saturationPenalty + expansionDiversityBonus - incumbentPenalty;
    const isNonEnglishEdition = Number((doc?.diagnostics as any)?.nonEnglishEditionPenalty || 0) < 0;
    if (isNonEnglishEdition && finalRenderDocs.some((d: any) => parentFranchiseRootForDoc(d) === family && Number(((d?.diagnostics as any)?.nonEnglishEditionPenalty || 0)) >= 0)) { untranslatedEditionRejectedTitles.push(String(doc?.title || "")); if (isExpansionDoc) expansionCandidatesRejectedByReason.non_english = Number(expansionCandidatesRejectedByReason.non_english || 0) + 1; continue; }
    if (!emergencySparseMode && docScore < 0) { negativeScoreRejectedTitles.push(String(doc?.title || "")); if (isExpansionDoc) expansionCandidatesRejectedByReason.negative_score = Number(expansionCandidatesRejectedByReason.negative_score || 0) + 1; continue; }
    const familyCount = antiCollapseSelected.filter((d: any) => parentFranchiseRootForDoc(d) === family).length;
    const hasStarterLikeSignal = /\b(volume one|volume 1|book one|book 1|omnibus|collection|anthology|marvel-verse)\b/i.test(String(doc?.title || ""));
    if (/marvel-verse:\s*ms\.?\s*marvel/i.test(String(doc?.title || "")) && antiCollapseSelected.some((d: any) => /ms\.?\s*marvel:\s*volume\s*(1|one)/i.test(String(d?.title || "")))) {
      if (antiCollapseSelected.length < 8) { sameParentSoftDuplicateRejectedTitles.push(String(doc?.title || "")); continue; }
    }
    const hasParentMetadata = Boolean(
      (doc as any)?.parentVolumeName ||
      (doc as any)?.parentVolume?.name ||
      (doc as any)?.rawDoc?.parentVolumeName ||
      (doc as any)?.rawDoc?.parentVolume?.name ||
      (doc as any)?.rawDoc?.rawDoc?.parentVolumeName ||
      (doc as any)?.rawDoc?.rawDoc?.parentVolume?.name ||
      (doc as any)?.diagnostics?.parentVolumeName ||
      (doc as any)?.rawDoc?.diagnostics?.parentVolumeName ||
      (doc as any)?.rawDoc?.rawDoc?.diagnostics?.parentVolumeName
    );
    const subtitleFragmentLike = hasParentMetadata && isLikelySubtitleFragmentTitle(String(doc?.title || ""));
    if (/^\s*(the\s+walking\s+dead:)?\s*\.\.\.\s*$/i.test(String(doc?.title || ""))) { subtitleFragmentRejectedTitles.push(String(doc?.title || "")); continue; }
    if (subtitleFragmentLike && !hasStarterLikeSignal) { subtitleFragmentRejectedTitles.push(String(doc?.title || "")); continue; }
    if (family === "the-walking-dead") {
      const subtitleOnlyWalkingDeadFragment =
        !/\b(volume|vol\.?|book|collection|omnibus|treasury|master edition|compendium)\b/i.test(String(doc?.title || "")) &&
        /\b(storm the gates|the last stand|the farm house|the road back|the rotten core|aftermath|vainqueurs|opportunity|conquered|betrayed|a gathering|found|eugene tinkers|confrontation)\b/i.test(String(doc?.title || ""));
      if (subtitleOnlyWalkingDeadFragment) { subtitleOnlyParentFragmentRejectedTitles.push(String(doc?.title || "")); continue; }
      if (!hasWalkingDeadStarter && walkingDeadSelectedCount >= 1) { subtitleOnlyParentFragmentRejectedTitles.push(String(doc?.title || "")); continue; }
    }
    if (familyCount >= 1 && !hasStarterLikeSignal) { sideArcRejectedTitles.push(String(doc?.title || "")); if (isExpansionDoc) expansionCandidatesRejectedByReason.side_arc = Number(expansionCandidatesRejectedByReason.side_arc || 0) + 1; continue; }
    if (familyCount >= 1) { if (isExpansionDoc) expansionCandidatesRejectedByReason.family_saturated = Number(expansionCandidatesRejectedByReason.family_saturated || 0) + 1; continue; }
    const normalizedTitle = normalizeText(String(doc?.title || ""));
    if (antiCollapseSelected.some((d: any) => normalizeText(String(d?.title || "")) === normalizedTitle)) { duplicateTitleRejectedTitles.push(String(doc?.title || "")); continue; }
    const isSideArc = /\b(all her monsters|omega|clockworks|mecca conclusion|silk road|boss rush)\b/i.test(String(doc?.title || ""));
    if (isSideArc && antiCollapseSelected.some((d: any) => finalSeriesKeyForRender(d) === family && /\b(all her monsters|omega|clockworks|mecca conclusion|silk road|boss rush)\b/i.test(String(d?.title || "")))) { finalSuppressedByBetterEntryPoint.push(String(doc?.title || "")); entryPointCandidatesSuppressed += 1; continue; }
    const hasVolumeOne = hasStarterInUniverse(family);
    if (hasVolumeOne && (/\b(volume|book)\s*(5|6|7|8|9|10|11|12|13|14|15|16)\b/i.test(String(doc?.title || "")) || /\bbook\s*sixteen\b/i.test(String(doc?.title || "")) || /\ball her monsters\b/i.test(String(doc?.title || "")))) { finalSuppressedByBetterEntryPoint.push(String(doc?.title || "")); entryPointCandidatesSuppressed += 1; continue; }
    const hasPenalty = Number((doc?.diagnostics as any)?.sideStoryPenalty || 0) < 0 || Number((doc?.diagnostics as any)?.issueFragmentPenalty || 0) < 0 || /^graphic horror novel\b/i.test(String(doc?.title || "")) || /^graphic fantasy\b/i.test(String(doc?.title || ""));
    const hasUnpenalizedAlternative = finalRenderDocs.some((d: any) => parentFranchiseRootForDoc(d) !== family && Number((d?.diagnostics as any)?.sideStoryPenalty || 0) >= 0 && Number((d?.diagnostics as any)?.issueFragmentPenalty || 0) >= 0);
    if (hasPenalty && hasUnpenalizedAlternative && antiCollapseSelected.length < 8) continue;
    const isBroadArtifact = /:\s*graphic novel$/i.test(String(doc?.title || "")) || /^.+:\s*the graphic novel/i.test(String(doc?.title || "")) || /^.+\sgraphic novel$/i.test(String(doc?.title || ""));
    if (isBroadArtifact && Number(doc?.score || 0) <= 0) {
      if (zeroScoreBroadFillersUsed >= 1) continue;
      zeroScoreBroadFillersUsed += 1;
    }
    antiCollapseSelected.push(doc);
    if (isExpansionDoc) expansionCandidatesSurvivedFiltersCount += 1;
    if (family === "the-walking-dead") walkingDeadSelectedCount += 1;
    if (matchingSeed) {
      seedFamilyCounts[matchingSeed] = seedCount + 1;
      if (!semanticBreadthSelections.includes(matchingSeed)) semanticBreadthSelections.push(matchingSeed);
    }
    if (!matchingSeed) {
      const adjacent = ["descender", "saga", "sweet tooth", "runaways", "invincible", "sandman", "black science", "walking dead"].find((seed) => normalizeText(String(doc?.title || "")).includes(normalizeText(seed)) || family.includes(normalizeText(seed).replace(/[^a-z0-9]+/g, "-")));
      if (adjacent && !adjacentSeedExpansionCandidates.includes(adjacent)) adjacentSeedExpansionCandidates.push(adjacent);
    }
    const selectedSeed = profileSelectedEntitySeeds.find((seed) => normalizeText(String(doc?.title || "")).includes(normalizeText(seed)));
    if (selectedSeed && !entitySeedCandidatesSelected.includes(selectedSeed)) entitySeedCandidatesSelected.push(selectedSeed);
    if (antiCollapseSelected.length >= Math.min(Math.max(finalLimit, 8), 10)) break;
  }
  if (antiCollapseSelected.length >= 8) finalRenderDocs = antiCollapseSelected;
  else finalRenderDocs = antiCollapseSelected;
  for (const doc of finalRenderDocs) {
    if (expansionTitleSetForScoring.has(normalizeText(String(doc?.title || "")))) expansionCandidatesAcceptedFinal.push(String(doc?.title || ""));
  }
  relaxationCandidatesConsidered += [...finalRenderDocs].length;
  relaxationCandidatesSelected = finalRenderDocs.length;
  if (finalEligibleNonNegativeCount >= 8 && finalRenderDocs.length < 8) {
    relaxedBreadthBackfillTriggered = true;
    relaxationStageReached = "adjacent_profile_seed_backfill";
    const selectedTitleSet = new Set(finalRenderDocs.map((d: any) => normalizeText(String(d?.title || ""))));
    const adjacentSeeds = ["locke & key", "sweet tooth", "the walking dead", "descender", "sandman", "runaways", "black science"];
    const backfillPool = [...scoredCanonicalDocs]
      .filter((doc: any) => Number(doc?.score ?? doc?.diagnostics?.finalScore ?? 0) >= 0)
      .sort((a: any, b: any) => Number(b?.score || 0) - Number(a?.score || 0));
    for (const doc of backfillPool) {
      if (finalRenderDocs.length >= 8) break;
      relaxationCandidatesConsidered += 1;
      const title = String(doc?.title || "");
      const nTitle = normalizeText(title);
      if (!title || selectedTitleSet.has(nTitle)) { registerRelaxedReject("duplicate"); continue; }
      const hardBlockReason = isHardBlockedRelaxationCandidate(doc, finalRenderDocs);
      if (hardBlockReason) { registerRelaxedReject(hardBlockReason); continue; }
      const family = parentFranchiseRootForDoc(doc);
      const matchingAdjacentSeed = adjacentSeeds.find((seed) => nTitle.includes(normalizeText(seed)) || family.includes(normalizeText(seed).replace(/[^a-z0-9]+/g, "-")));
      if (!matchingAdjacentSeed) { registerRelaxedReject("not_adjacent_seed"); continue; }
      if (matchingAdjacentSeed === "the walking dead" && !/\b(volume one|volume 1|book one|book 1|compendium|collection|omnibus|treasury|master edition)\b/i.test(title)) { registerRelaxedReject("walking_dead_not_clean_starter"); continue; }
      relaxedBreadthBackfillCandidates.push(title);
      finalRenderDocs.push(doc);
      relaxationCandidatesSelected += 1;
      selectedTitleSet.add(nTitle);
      relaxedBreadthBackfillSelected.push(title);
    }
  }
  if (finalRenderDocs.length < 8) {
    relaxationStageReached = "broader_profile_compatible_query_family_backfill";
    const selectedTitleSet = new Set(finalRenderDocs.map((d: any) => normalizeText(String(d?.title || ""))));
    for (const doc of [...scoredCanonicalDocs].sort((a: any, b: any) => Number(b?.score || 0) - Number(a?.score || 0))) {
      if (finalRenderDocs.length >= 8) break;
      relaxationCandidatesConsidered += 1;
      const title = String(doc?.title || "").trim();
      const nTitle = normalizeText(title);
      const family = parentFranchiseRootForDoc(doc);
      if (!title || selectedTitleSet.has(nTitle)) { registerRelaxedReject("broader_duplicate"); continue; }
      if (!String((doc as any)?.queryText || (doc as any)?.diagnostics?.queryText || "").trim() || !String((doc as any)?.source || "").trim()) { registerRelaxedReject("missing_query_or_source"); continue; }
      const hardBlockReason = isHardBlockedRelaxationCandidate(doc, finalRenderDocs);
      if (hardBlockReason) { registerRelaxedReject(hardBlockReason); continue; }
      if (finalRenderDocs.filter((d: any) => parentFranchiseRootForDoc(d) === family).length >= 1) { registerRelaxedReject("franchise_cap_strict"); continue; }
      finalRenderDocs.push(doc);
      selectedTitleSet.add(nTitle);
      relaxationCandidatesSelected += 1;
    }
  }
  if (finalRenderDocs.length < 8) {
    relaxationStageReached = "slightly_loosen_franchise_cap";
    const selectedTitleSet = new Set(finalRenderDocs.map((d: any) => normalizeText(String(d?.title || ""))));
    const allDistinctFamilies = Array.from(new Set(scoredCanonicalDocs.map((d: any) => parentFranchiseRootForDoc(d)).filter(Boolean)));
    const exhaustedDistinctFamilies = allDistinctFamilies.every((family) => finalRenderDocs.some((d: any) => parentFranchiseRootForDoc(d) === family));
    for (const doc of [...scoredCanonicalDocs].sort((a: any, b: any) => Number(b?.score || 0) - Number(a?.score || 0))) {
      if (finalRenderDocs.length >= 8) break;
      relaxationCandidatesConsidered += 1;
      const title = String(doc?.title || "").trim();
      const nTitle = normalizeText(title);
      const family = parentFranchiseRootForDoc(doc);
      if (!title || selectedTitleSet.has(nTitle)) { registerRelaxedReject("loosen_duplicate"); continue; }
      const hardBlockReason = isHardBlockedRelaxationCandidate(doc, finalRenderDocs);
      if (hardBlockReason) { registerRelaxedReject(hardBlockReason); continue; }
      if (!exhaustedDistinctFamilies && finalRenderDocs.filter((d: any) => parentFranchiseRootForDoc(d) === family).length >= 1) { registerRelaxedReject("franchise2_only_after_exhausted"); continue; }
      if (finalRenderDocs.filter((d: any) => parentFranchiseRootForDoc(d) === family).length >= 2) { registerRelaxedReject("franchise_cap_loosened"); continue; }
      finalRenderDocs.push(doc);
      selectedTitleSet.add(nTitle);
      relaxationCandidatesSelected += 1;
    }
  }
  if (finalRenderDocs.length < 8) {
    relaxationStageReached = "allow_metadata_thin_structurally_clean";
  }
  const adjacentSeedTitlesFromScoredUniverse = Array.from(
    new Set(
      scoredCanonicalDocs
        .map((doc: any) => String(doc?.title || ""))
        .filter((title: string) => /\b(locke\s*&\s*key|sweet tooth|walking dead|descender|sandman|runaways|black science)\b/i.test(title))
    )
  );
  adjacentSeedExpansionCandidates.push(...adjacentSeedTitlesFromScoredUniverse);
  const countContractSatisfied = finalRenderDocs.length >= 8 && finalRenderDocs.length <= 10;
  const countContractShortfallReason =
    countContractSatisfied
      ? "none"
      : finalEligibleNonNegativeCount < 8
        ? "insufficient_non_negative_candidates"
        : finalRenderDocs.length >= 8
          ? "contract_met_only_with_invalid_fillers_prevented"
          : "selection_constraints_after_quality_filters";
  const familyCounts = finalRenderDocs.reduce((acc: Record<string, number>, d: any) => {
    const k = parentFranchiseRootForDoc(d) || "__none__";
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {});
  if (Object.values(familyCounts).some((n) => n >= 3)) qualityRecoveryReasons.push("franchise_overfill");
  if (finalRenderDocs.some((d: any) => /\b(all her monsters|omega|clockworks|mecca conclusion|silk road|boss rush|after the flood|the road to war|the ratio part|one night only|election day)\b/i.test(String(d?.title || "")) && finalRenderDocs.some((x: any) => parentFranchiseRootForDoc(x) === parentFranchiseRootForDoc(d) && /\b(volume one|volume 1|book one|book 1)\b/i.test(String(x?.title || ""))))) qualityRecoveryReasons.push("side_arc_with_core_entry");
  if (scoredCandidateUniverseCount < candidateDiversityFloorTarget) {
    qualityRecoveryReasons.push("candidate_diversity_floor_not_met");
  }
  const qualityRecoveryTriggered = qualityRecoveryReasons.length > 0;
  const qualityRecoveryReason = qualityRecoveryReasons.join(",");
  const scoredUniverseFailureFromConvertedPool =
    comicVineDocConversionSuccessCount > 100 && scoredCandidateUniverseCount < 30;
  const scoredUniverseCollapsedToNormalizedTen = normalizedCandidates.length === 10 && scoredCandidateUniverseCount <= 10;
  const scoredUniverseFailure = scoredUniverseFailureFromConvertedPool || scoredUniverseCollapsedToNormalizedTen;
  const scoredUniverseFailureReason = scoredUniverseFailure
    ? (scoredUniverseFailureFromConvertedPool
      ? "wide converted pool not used"
      : "scored universe collapsed to normalized docs")
    : "none";
  if (scoredUniverseFailure) {
    qualityRecoveryReasons.push("scored_universe_failure");
    recoveryRejectedReasons.scored_universe_failure = (recoveryRejectedReasons.scored_universe_failure || 0) + 1;
    console.warn("SCORED_UNIVERSE_FAILURE", {
      scoredCandidateUniverseCount,
      comicVineDocConversionSuccessCount,
      normalizedCandidatesLength: normalizedCandidates.length,
      scoredUniverseFailureReason,
    });
  }
  const preRenderTitles = finalRenderDocs.map((doc: any) => String(doc?.title || "").trim()).filter(Boolean);
  const hasSIKTCVol1 = scoredCanonicalDocs.some((d: any) => /something is killing the children:\s*volume\s*1|something is killing the children:\s*volume one/i.test(String(d?.title || "")));
  const hasMsMarvelVol1 = scoredCanonicalDocs.some((d: any) => /ms\.?\s*marvel:\s*volume\s*1|ms\.?\s*marvel:\s*volume one/i.test(String(d?.title || "")));
  if (hasSIKTCVol1) {
    finalRenderDocs = finalRenderDocs.filter((d: any) => !/something is killing the children:\s*volume\s*(7|8)|all her monsters/i.test(String(d?.title || "")));
  }
  if (hasMsMarvelVol1) {
    finalRenderDocs = finalRenderDocs.filter((d: any) => !/ms\.?\s*marvel:\s*volume\s*(4|5)/i.test(String(d?.title || "")));
  }
  // Swipe-first final authority:
  // final render must be derived from swipe-ranked viable candidates, not legacy
  // top-up/recovery survivors that can reintroduce static-root bias.
  if (swipeRankedCandidateList.length > 0) {
    const selected: any[] = [];
    const rootCounts: Record<string, number> = {};
    for (const doc of swipeRankedCandidateList) {
      const root = parentFranchiseRootForDoc(doc) || "__none__";
      if (rootCounts[root] >= 2) continue;
      const title = String(doc?.title || "");
      if (selected.some((s: any) => normalizeText(String(s?.title || "")) === normalizeText(title))) continue;
      selected.push(doc);
      rootCounts[root] = Number(rootCounts[root] || 0) + 1;
      if (selected.length >= Math.min(Math.max(finalLimit, 8), 10)) break;
    }
    finalRenderDocs = selected;
  }
  const finalEligibilityRejectedTitlesByReason: Record<string, string[]> = {};
  const finalEligibilityAcceptedTitles: string[] = [];
  const cleanCandidateButNotAcceptedReasonByTitle: Record<string, string> = {};
  const acceptedEvidenceButMissingFromFinalEligibilityTitles: string[] = [];
  const narrativeExpansionAcceptedTitleSet = new Set(narrativeExpansionAcceptedTitles.map((t) => normalizeText(t)));
  let finalEligibilityRelaxationTriggered = false;
  const finalEligibilityRelaxedAcceptedTitles: string[] = [];
  const finalEligibilityRelaxedReasonByTitle: Record<string, string> = {};
  const nearMissSemanticEvidenceTitles: string[] = [];
  const nearMissSemanticEvidenceReasons: Record<string, string> = {};
  const fallbackTierAcceptedTitles: string[] = [];
  const fallbackTierRejectedReasonsByTitle: Record<string, string> = {};
  let fallbackTierTriggered = false;
  let fallbackTierCandidateCount = 0;
  let controlledEmergencyFallback = false;
  const sourceSpecificGateAppliedByTitle: Record<string, string[]> = {};
  const sourceSpecificRejectReasonByTitle: Record<string, string> = {};
  const curatedSeedProfileMatch: Record<string, boolean> = {};
  const curatedSeedReason: Record<string, string> = {};
  const curatedSeedMatchedArchetype: Record<string, string> = {};
  const preSourceSpecificGateTitles: string[] = [];
  const postSourceSpecificGateTitles: string[] = [];
  const rejectedDespiteStrongTasteFitTitles: string[] = [];
  const registerFinalEligibilityReject = (reason: string, title: string) => {
    if (!finalEligibilityRejectedTitlesByReason[reason]) finalEligibilityRejectedTitlesByReason[reason] = [];
    if (title && finalEligibilityRejectedTitlesByReason[reason].length < 40) finalEligibilityRejectedTitlesByReason[reason].push(title);
    if (title && narrativeExpansionAcceptedTitleSet.has(normalizeText(title))) {
      narrativeExpansionCandidatesRejectedByFinalEligibilityReason[reason] = Number(narrativeExpansionCandidatesRejectedByFinalEligibilityReason[reason] || 0) + 1;
    }
  };
  const markSourceSpecificGate = (title: string, rule: string) => {
    if (!sourceSpecificGateAppliedByTitle[title]) sourceSpecificGateAppliedByTitle[title] = [];
    if (!sourceSpecificGateAppliedByTitle[title].includes(rule)) sourceSpecificGateAppliedByTitle[title].push(rule);
  };
  const profileCompatibleExpansionRoots = new Set(["locke-key", "sweet-tooth", "descender", "spider-man", "runaways", "black-science", "invincible", "the-sandman", "saga"]);
  const finalEligibilityGateApplied = true;
  const eligibleWithFitScore: Array<{ doc: any; fitScore: number; recommendableWorkScore: number; artifactRiskScore: number; collectedEditionConfidence: number; narrativeFictionConfidence: number; metaOrReferenceWorkPenalty: number }> = [];
  const formatSignalOnlyRejectedTitles: string[] = [];
  const genericCollectionArtifactRejectedTitles: string[] = [];
  const finalTasteThresholdByTitle: Record<string, number> = {};
  const finalAcceptedTasteEvidenceByTitle: Record<string, string[]> = {};
  const meaningfulSignalsGateRejectedTitles: string[] = [];
  const dislikedOverlapDominatesRejectedTitles: string[] = [];
  const acceptedEvidenceButFinalRejectedReasonByTitle: Record<string, string> = {};
  const finalReturnedWithoutTasteEvidenceTitles: string[] = [];
  let finalUnderfillBecauseNoTasteEvidence = false;
  let underfillReason: "transport_failure" | "query_literalism" | "semantic_gate_rejected_all" | "insufficient_candidate_metadata" | "taste_conflict" | "comicvine_fallback_only" | "none" = "none";
  let expansionMergedButNotScoredReason = "none";
  const terminalRejectReasonByTitle: Record<string, string> = {};
  const markTerminalReject = (title: string, reason: string) => {
    const key = normalizeText(String(title || ""));
    if (!key) return;
    if (!terminalRejectReasonByTitle[key]) terminalRejectReasonByTitle[key] = reason;
  };
  const finalRenderCandidateTitlesBeforeGate = finalRenderDocs.map((doc: any) => String(doc?.title || "").trim()).filter(Boolean);
  preSourceSpecificGateTitles.push(...finalRenderCandidateTitlesBeforeGate);
  finalRenderDocs = finalRenderDocs.filter((doc: any) => {
    const title = String(doc?.title || "").trim();
    const docSource = String(doc?.source || doc?.rawDoc?.source || "").toLowerCase();
    const isComicVineCandidate = docSource.includes("comicvine");
    const sourceId = String(doc?.sourceId || doc?.id || doc?.key || "").trim();
    const queryText = String(doc?.queryText || doc?.diagnostics?.queryText || "").trim();
    const isComicVineFallbackCandidate = docSource.includes("comicvine") && /comicvine_publisher_facet_fallback/i.test(queryText);
    const root = parentFranchiseRootForDoc(doc);
    const hasParent = Boolean(doc?.parentVolumeName || doc?.parentVolume?.name || doc?.rawDoc?.parentVolumeName || doc?.diagnostics?.parentVolumeName);
    const titleRootMatch = Boolean(root) && normalizeText(title).includes(normalizeText(String(root || "").replace(/-/g, " ")));
    if (!sourceId) { registerFinalEligibilityReject("missing_source_id", title); return false; }
    if (!queryText) { registerFinalEligibilityReject("missing_query_text", title); return false; }
    if (!hasParent && !titleRootMatch) { registerFinalEligibilityReject("missing_parent_or_title_root_match", title); return false; }
    const seedRootMatch = profileSelectedEntitySeeds.some((seed) => normalizeText(seed).replace(/[^a-z0-9]+/g, "-") === root);
    const expansionRootMatch = profileCompatibleExpansionRoots.has(root);
    const genreSet = new Set(genres.map((g) => normalizeText(g)));
    const themeSet = new Set(themes.map((t) => normalizeText(t)));
    const toneSet = new Set(tones.map((t) => normalizeText(t)));
    const fallbackArchetypes: Array<{ archetype: string; roots: string[]; check: () => boolean; reason: string }> = [
      { archetype: "dark_fantasy_emotional_mythology", roots: ["monstress", "coda", "the-last-god", "seven-to-eternity", "sandman", "norse-mythology"], check: () => genreSet.has("fantasy") && (toneSet.has("dark") || toneSet.has("atmospheric")) && (themeSet.has("mythology") || themeSet.has("emotional growth") || themeSet.has("coming of age")), reason: "profile_dark_fantasy_emotional_mythology" },
      { archetype: "romance_coming_of_age_warmth", roots: ["laura-dean-keeps-breaking-up-with-me", "bloom", "heartstopper", "fence", "mooncakes"], check: () => genreSet.has("romance") && themeSet.has("coming of age") && (toneSet.has("warm") || toneSet.has("gentle") || toneSet.has("hopeful") || toneSet.has("anime-like")), reason: "profile_romance_coming_of_age_warmth" },
      { archetype: "fantasy_dystopian_identity_political", roots: ["paper-girls", "wynd", "the-woods", "on-a-sunbeam", "die", "east-of-west"], check: () => genreSet.has("fantasy") && genreSet.has("dystopian") && (themeSet.has("identity") || themeSet.has("political") || themeSet.has("politics")), reason: "profile_fantasy_dystopian_identity_political" },
    ];
    const matchedArchetype = fallbackArchetypes.find((row) => row.check() && row.roots.includes(root));
    curatedSeedMatchedArchetype[title] = matchedArchetype?.archetype || "none";
    curatedSeedProfileMatch[title] = Boolean(matchedArchetype);
    curatedSeedReason[title] = matchedArchetype?.reason || "none";
    const queryRoot = rootFromSeed(String((doc as any)?.expansionQueryText || queryText).replace(/\bgraphic novel\b/gi, "").trim());
    const aliasPool = expansionAliasMap[queryRoot] || [];
    const queryFamilyAliasMatch = aliasPool.some((alias) => normalizeText(title).includes(normalizeText(alias))) || aliasPool.some((alias) => normalizeText(String(doc?.parentVolumeName || "")).includes(normalizeText(alias)));
    if (!(seedRootMatch || expansionRootMatch || Boolean(root) || queryFamilyAliasMatch)) { registerFinalEligibilityReject("no_positive_root_alignment", title); return false; }
    const strongScore = Number(doc?.score ?? doc?.diagnostics?.finalScore ?? 0) >= 8;
    const starterLike = /\b(volume one|volume 1|book one|book 1|tpb|collection|compendium|omnibus)\b/i.test(title);
    const textBag = normalizeText(`${title} ${String(doc?.description || "")}`);
    const laneSignal = /\b(horror|thriller|mystery|science fiction|superhero|fantasy|adventure|coming of age|psychological|speculative)\b/i.test(textBag);
    const themeSignal = profileSelectedEntitySeeds.some((seed) => textBag.includes(normalizeText(seed)));
    const fitScore = (laneSignal ? 2 : 0) + (themeSignal ? 2 : 0) + (seedRootMatch ? 2 : 0) + (starterLike ? 1 : 0) + (strongScore ? 2 : 0) + (expansionRootMatch ? 1 : 0);
    if (fitScore <= 0) { registerFinalEligibilityReject("insufficient_positive_fit_score", title); return false; }
    const weightedTasteScore = Number(candidateWeightedTasteScoreByTitle[title] || 0);
    const dislikePenaltyScore = Number(candidateDislikePenaltyByTitle[title] || 0);
    const semanticEvidenceCount = Number(semanticEvidenceCountByTitle[title] || 0);
    if (isComicVineFallbackCandidate && weightedTasteScore <= 0) {
      if (!curatedSeedProfileMatch[title]) {
        registerFinalEligibilityReject("fallback_no_taste_match", title);
        return false;
      }
      if (semanticEvidenceCount <= 0) {
        registerFinalEligibilityReject("fallback_no_taste_match", title);
        return false;
      }
    }
    if (isComicVineFallbackCandidate && !curatedSeedProfileMatch[title]) {
      registerFinalEligibilityReject("fallback_no_taste_match", title);
      return false;
    }
    const queryTermOnlyEvidence = Boolean(queryTermOnlyEvidenceByTitle[title]);
    const titleOnlyTasteSignals = titleOnlyTasteSignalByTitle[title] || [];
    const weakAnthologyRootTitle = /\b(house of mystery|showcase presents|mystery men|mystery club)\b/i.test(title);
    const likedSignalsRaw = (((input as any)?.likedTagCounts || {}) as Record<string, number>);
    const genericTasteSignalRe = /^(fantasy|adventure|mystery|crime|thriller|horror|science fiction|romance|superhero|comics?|graphic novel)$/i;
    const matchedMeaningfulLikedSignals = Object.keys(likedSignalsRaw)
      .map((k) => String(k || "").replace(/^(genre:|tone:|mood:|theme:|drive:|audience:|age:|media:|format:)/i, "").replace(/_/g, " ").trim())
      .filter((token) => token.length >= 4 && !genericTasteSignalRe.test(token))
      .filter((token) => textBag.includes(normalizeText(token)));
    const hasComedyParodyAffinity = Object.keys(likedSignalsRaw)
      .map((k) => String(k || "").replace(/^(genre:|tone:|mood:|theme:|drive:|audience:|age:|media:|format:)/i, "").replace(/_/g, " ").trim().toLowerCase())
      .some((token) => /\b(comedy|humor|parody|satire|spoof)\b/.test(token));
    const meaningfulSignalCount = Array.from(new Set(matchedMeaningfulLikedSignals)).length;
    if (meaningfulSignalCount < 1) {
      meaningfulSignalsGateRejectedTitles.push(title);
      registerFinalEligibilityReject("meaningful_signals_required", title);
      return false;
    }
    if (dislikePenaltyScore >= weightedTasteScore && dislikePenaltyScore > 0) {
      dislikedOverlapDominatesRejectedTitles.push(title);
      registerFinalEligibilityReject("disliked_overlap_dominates", title);
      return false;
    }
    finalTasteThresholdByTitle[title] = 2.5;
    const positiveFitScore = Number(positiveFitScoreByTitle[title] || 0);
    const strongTasteFit = weightedTasteScore >= 3 || positiveFitScore >= 6;
    const isClearlyMalformed = /^(.+:\s*)?(a\s+graphic novel|the\s+graphic novel|graphic novel)$/i.test(title);
    const structuralFragment = Number((doc?.diagnostics as any)?.issueFragmentPenalty || 0) < 0 || Number((doc?.diagnostics as any)?.subtitleFragmentPenalty || 0) < 0 || Number((doc?.diagnostics as any)?.subtitleSideArcPenalty || 0) < 0;
    const nonEnglish = Number((doc?.diagnostics as any)?.nonEnglishEditionPenalty || 0) < 0;
    const laneAndTasteSignal = laneSignal && weightedTasteScore > 0;
    const recommendableEditionRe = /\b(volume\s*one|volume\s*1|book\s*one|book\s*1|vol\.?\s*1|tpb|trade paperback|hardcover|hc|ogn|original graphic novel|omnibus|compendium|deluxe edition|collected edition|collection)\b/i;
    const issueOnlyRe = /(#\s*\d+\b|\bissue\s*#?\s*\d+\b)/i;
    const genericArtifactRe = /^(graphic\s+(fantasy|novel|science fiction)|science fiction classics|fantasy classics)$/i;
    const genericCollectionArtifactRe = /^the collected edition$|^hardcover\/trade paperback$|^great british .+ comic book heroes(?:\s*#?\d+)?$/i;
    const metaRefRe = /\b(feedback|tribute|preview|sampler|companion|guide|reference|history of|encyclopedia|adventure\s*about|how to|study|criticism|annotation|annotated|archive|canon|anthology)\b/i;
    const narrativeSignalRe = /\b(story|novel|saga|chronicle|mystery|thriller|horror|fantasy|adventure)\b/i;
    const editionText = `${title} ${String(doc?.description || '')} ${String(doc?.parentVolumeName || '')}`;
    const collectedEditionConfidence = (recommendableEditionRe.test(editionText) ? 3 : 0) + (hasParent ? 1 : 0) - (issueOnlyRe.test(title) ? 2 : 0);
    const narrativeFictionConfidence = (narrativeSignalRe.test(editionText) ? 2 : 0) + (laneSignal ? 1 : 0) + (themeSignal ? 1 : 0);
    const metaOrReferenceWorkPenalty = (metaRefRe.test(editionText) ? 4 : 0) + (genericArtifactRe.test(normalizeText(title)) ? 3 : 0);
    const parodyMetaTitle = /\b(mystery science theater 3000|mst3k|riff|rifftrax|parody|spoof)\b/i.test(`${title} ${String(doc?.description || "")}`);
    const artifactRiskScore = (issueOnlyRe.test(title) ? 3 : 0) + (isClearlyMalformed ? 4 : 0) + metaOrReferenceWorkPenalty + (structuralFragment ? 2 : 0);
    const recommendableWorkScore = collectedEditionConfidence + narrativeFictionConfidence - artifactRiskScore;
    if (isComicVineCandidate && (genericCollectionArtifactRe.test(normalizeText(title)) || /gwandanaland comics/i.test(title))) {
      markSourceSpecificGate(title, "generic_collection_artifact");
      if (genericCollectionArtifactRejectedTitles.length < 100) genericCollectionArtifactRejectedTitles.push(title);
      markTerminalReject(title, "generic_collection_artifact");
      sourceSpecificRejectReasonByTitle[title] = "generic_collection_artifact";
      registerFinalEligibilityReject("generic_collection_artifact", title); return false;
    }
    if (structuralFragment && !strongTasteFit) { registerFinalEligibilityReject("structural_fragment", title); return false; }
    if (artifactRiskScore >= 6 && !/\b(nonfiction|memoir|essay|history)\b/i.test(String((input as any)?.deckKey || ""))) {
      if (strongTasteFit) rejectedDespiteStrongTasteFitTitles.push(title);
      registerFinalEligibilityReject("high_artifact_risk", title); return false;
    }
    if (nonEnglish) { if (strongTasteFit) rejectedDespiteStrongTasteFitTitles.push(title); registerFinalEligibilityReject("locale_variant", title); return false; }
    if (parodyMetaTitle && !hasComedyParodyAffinity) { registerFinalEligibilityReject("parody_meta_without_profile_affinity", title); return false; }
    if (isComicVineCandidate && queryTermOnlyEvidence && titleOnlyTasteSignals.length > 0) {
      registerFinalEligibilityReject("title_token_only_without_narrative_support", title);
      return false;
    }
    if (isComicVineCandidate && weakAnthologyRootTitle && semanticEvidenceCount < 3) {
      registerFinalEligibilityReject("weak_anthology_root_without_strong_semantic_support", title);
      return false;
    }
    if ((isClearlyMalformed || Number(doc?.score ?? 0) <= 0) && !(strongTasteFit && laneAndTasteSignal && !isClearlyMalformed)) {
      if (strongTasteFit) rejectedDespiteStrongTasteFitTitles.push(title);
      registerFinalEligibilityReject("generic_or_zero_score_filler", title); return false; }
    const passesNarrativeConfidenceGate = narrativeFictionConfidence >= 2 || collectedEditionConfidence >= 3;
    if (!passesNarrativeConfidenceGate) { registerFinalEligibilityReject("narrative_confidence_too_low", title); return false; }
    const oneStrongTasteSignalPlusNarrative = weightedTasteScore >= 2.5 && narrativeFictionConfidence >= 2 && !genericArtifactRe.test(normalizeText(title));
    const twoMeaningfulSignals = meaningfulSignalCount >= 2;
    const passesTasteThreshold = weightedTasteScore >= 2.5 || twoMeaningfulSignals || oneStrongTasteSignalPlusNarrative;
    if (isComicVineCandidate && semanticEvidenceCount < 2) {
      markSourceSpecificGate(title, "semantic_evidence_count_gate");
      const hasTitleOnlyTasteSignal = Boolean(queryTermOnlyEvidenceByTitle[title] && (titleOnlyTasteSignalByTitle[title] || []).length > 0);
      const dislikedOverlapPenalty = Number(candidateDislikePenaltyByTitle[title] || 0);
      const hasDislikedOverlap = dislikedOverlapPenalty > 0.8;
      const hasArtifactRisk = artifactRiskScore > 0;
      const fallbackEligible =
        semanticEvidenceCount === 1 &&
        narrativeFictionConfidence >= 3 &&
        !hasArtifactRisk &&
        !hasTitleOnlyTasteSignal &&
        !hasDislikedOverlap;
      fallbackTierCandidateCount += 1;
      if (fallbackEligible) {
        nearMissSemanticEvidenceTitles.push(title);
        nearMissSemanticEvidenceReasons[title] = "semanticEvidenceCount=1_but_high_narrative_low_risk_minor_dislike_tolerated";
      } else {
        nearMissSemanticEvidenceTitles.push(title);
        const rejectReason = [
          `semanticEvidenceCount:${semanticEvidenceCount}`,
          `narrativeFictionConfidence:${narrativeFictionConfidence}`,
          `artifactRiskScore:${artifactRiskScore}`,
          `titleOnlyTasteSignal:${hasTitleOnlyTasteSignal}`,
          `dislikedOverlapPenalty:${dislikedOverlapPenalty.toFixed(2)}`,
        ].join(",");
        nearMissSemanticEvidenceReasons[title] = rejectReason;
        fallbackTierRejectedReasonsByTitle[title] = rejectReason;
        sourceSpecificRejectReasonByTitle[title] = `semantic_evidence_count_gate:${rejectReason}`;
        registerFinalEligibilityReject("insufficient_semantic_evidence_count", title); return false;
      }
    }
    if (!passesTasteThreshold) {
      if (isComicVineCandidate && collectedEditionConfidence >= 3 && weightedTasteScore < 2.5 && meaningfulSignalCount < 2) {
        markSourceSpecificGate(title, "format_signal_only_without_taste_fit");
        if (formatSignalOnlyRejectedTitles.length < 100) formatSignalOnlyRejectedTitles.push(title);
        markTerminalReject(title, "format_signal_only_without_taste_fit");
        sourceSpecificRejectReasonByTitle[title] = "format_signal_only_without_taste_fit";
        registerFinalEligibilityReject("format_signal_only_without_taste_fit", title); return false;
      }
      registerFinalEligibilityReject("fails_taste_threshold_gate", title); return false;
    }
    if (!strongTasteFit && recommendableWorkScore < 1) { registerFinalEligibilityReject("low_recommendable_work_score", title); return false; }
    finalAcceptedTasteEvidenceByTitle[title] = [
      `weightedTasteScore:${weightedTasteScore.toFixed(2)}`,
      `meaningfulSignals:${meaningfulSignalCount}`,
      `narrativeFictionConfidence:${narrativeFictionConfidence}`,
    ];
    eligibleWithFitScore.push({ doc, fitScore, recommendableWorkScore, artifactRiskScore, collectedEditionConfidence, narrativeFictionConfidence, metaOrReferenceWorkPenalty });
    finalEligibilityAcceptedTitles.push(title);
    if (narrativeExpansionAcceptedTitleSet.has(normalizeText(title))) narrativeExpansionFinalAcceptedTitles.push(title);
    return true;
  });
  postSourceSpecificGateTitles.push(...finalRenderDocs.map((doc: any) => String(doc?.title || "").trim()).filter(Boolean));
  if (eligibleWithFitScore.length < 8 && viableCandidateCountBeforeFinalSelection >= 15) {
    finalEligibilityRelaxationTriggered = true;
    const alreadyAccepted = new Set(finalEligibilityAcceptedTitles.map((t) => normalizeText(t)));
    const relaxedAdds = viableCandidates
      .filter((doc: any) => {
        const title = String(doc?.title || "").trim();
        if (!title || alreadyAccepted.has(normalizeText(title))) return false;
        const weightedTasteScore = Number(candidateWeightedTasteScoreByTitle[title] || 0);
        const positiveFitScore = Number(positiveFitScoreByTitle[title] || 0);
        const strongTasteFit = weightedTasteScore >= 3 || positiveFitScore >= 6;
        const nonEnglish = Number((doc?.diagnostics as any)?.nonEnglishEditionPenalty || 0) < 0;
        if (!strongTasteFit || nonEnglish) return false;
        const editionText = `${title} ${String(doc?.description || '')} ${String(doc?.parentVolumeName || '')}`;
        const collectedEditionConfidence = (/\b(volume\s*one|volume\s*1|book\s*one|book\s*1|vol\.?\s*1|tpb|trade paperback|hardcover|hc|ogn|original graphic novel|omnibus|compendium|deluxe edition|collected edition|collection)\b/i.test(editionText) ? 3 : 0);
        const narrativeFictionConfidence = (/\b(story|novel|saga|chronicle|mystery|thriller|horror|fantasy|adventure)\b/i.test(editionText) ? 2 : 0);
        if (!(narrativeFictionConfidence >= 2 || collectedEditionConfidence >= 3)) return false;
        const titleNorm = normalizeText(title);
        const artifactLike = /^(graphic\s+(fantasy|novel|science fiction)|science fiction classics|fantasy classics)$/.test(titleNorm) || /\b(feedback|tribute|preview|sampler|companion|guide|reference|history of|encyclopedia|adventure\s*about|how to|study|criticism|annotation|annotated)\b/i.test(`${title} ${String(doc?.description || "")}`);
        if (artifactLike) return false;
        return true;
      })
      .slice(0, 12);
    for (const doc of relaxedAdds) {
      const title = String(doc?.title || "").trim();
      const textBag = normalizeText(`${title} ${String(doc?.description || "")}`);
      const likedSignalsRaw = (((input as any)?.likedTagCounts || {}) as Record<string, number>);
      const genericTasteSignalRe = /^(fantasy|adventure|mystery|crime|thriller|horror|science fiction|romance|superhero|comics?|graphic novel)$/i;
      const meaningfulSignalCount = Array.from(new Set(
        Object.keys(likedSignalsRaw)
          .map((k) => String(k || "").replace(/^(genre:|tone:|mood:|theme:|drive:|audience:|age:|media:|format:)/i, "").replace(/_/g, " ").trim())
          .filter((token) => token.length >= 4 && !genericTasteSignalRe.test(token))
          .filter((token) => textBag.includes(normalizeText(token)))
      )).length;
      if (meaningfulSignalCount < 1) {
        fallbackTierRejectedReasonsByTitle[title] = "relaxed_add_requires_meaningful_signals>=1";
        continue;
      }
      eligibleWithFitScore.push({ doc, fitScore: 1, recommendableWorkScore: 1, artifactRiskScore: 0, collectedEditionConfidence: 0, narrativeFictionConfidence: 1, metaOrReferenceWorkPenalty: 0 });
      finalEligibilityAcceptedTitles.push(title);
      finalEligibilityRelaxedAcceptedTitles.push(title);
      finalEligibilityRelaxedReasonByTitle[title] = "strong_taste_fit_underfilled_output";
      finalAcceptedTasteEvidenceByTitle[title] = [
        ...(finalAcceptedTasteEvidenceByTitle[title] || []),
        `meaningfulSignals:${meaningfulSignalCount}`,
      ];
    }
  }
  if (eligibleWithFitScore.length === 0 && nearMissSemanticEvidenceTitles.length > 0) {
    fallbackTierTriggered = true;
    const nearMissSet = new Set(nearMissSemanticEvidenceTitles.map((t) => normalizeText(t)));
    const fallbackAdds = viableCandidates
      .filter((doc: any) => nearMissSet.has(normalizeText(String(doc?.title || ""))))
      .slice(0, Math.min(6, finalLimit));
    for (const doc of fallbackAdds) {
      const title = String(doc?.title || "").trim();
      if (!title) continue;
      const alreadyAccepted = eligibleWithFitScore.some((row) => normalizeText(String(row?.doc?.title || "")) === normalizeText(title));
      if (alreadyAccepted) continue;
      const likedSignalsRaw = (((input as any)?.likedTagCounts || {}) as Record<string, number>);
      const genericTasteSignalRe = /^(fantasy|adventure|mystery|crime|thriller|horror|science fiction|romance|superhero|comics?|graphic novel)$/i;
      const textBag = normalizeText(`${title} ${String(doc?.description || "")}`);
      const meaningfulSignalCount = Array.from(new Set(
        Object.keys(likedSignalsRaw)
          .map((k) => String(k || "").replace(/^(genre:|tone:|mood:|theme:|drive:|audience:|age:|media:|format:)/i, "").replace(/_/g, " ").trim())
          .filter((token) => token.length >= 4 && !genericTasteSignalRe.test(token))
          .filter((token) => textBag.includes(normalizeText(token)))
      )).length;
      if (meaningfulSignalCount < 1) {
        fallbackTierRejectedReasonsByTitle[title] = "fallback_requires_meaningful_signals>=1";
        continue;
      }
      eligibleWithFitScore.push({ doc, fitScore: 0.5, recommendableWorkScore: 1, artifactRiskScore: 0, collectedEditionConfidence: 2, narrativeFictionConfidence: 3, metaOrReferenceWorkPenalty: 0 });
      fallbackTierAcceptedTitles.push(title);
      finalEligibilityAcceptedTitles.push(title);
      finalEligibilityRelaxedReasonByTitle[title] = "fallback_semantic_evidence_count_1";
      finalAcceptedTasteEvidenceByTitle[title] = [
        ...(finalAcceptedTasteEvidenceByTitle[title] || []),
        `meaningfulSignals:${meaningfulSignalCount}`,
      ];
    }
    controlledEmergencyFallback = fallbackTierAcceptedTitles.length > 0 && finalEligibilityAcceptedTitles.length === fallbackTierAcceptedTitles.length;
  }
  finalRenderDocs = eligibleWithFitScore
    .sort((a, b) => b.fitScore - a.fitScore || Number((b.doc?.score ?? 0) - (a.doc?.score ?? 0)))
    .map((row) => row.doc)
    .slice(0, 10);
  const finalRenderCandidateTitlesAfterGate = finalRenderDocs.map((doc: any) => String(doc?.title || "").trim()).filter(Boolean);
  const finalCountCappedToTarget = finalRenderDocs.length >= 10;
  const topUpFinalGateRejectedTitles = topUpCandidatesAcceptedTitles.filter((t) => !new Set(finalRenderCandidateTitlesAfterGate.map((x) => normalizeText(x))).has(normalizeText(t)));
  const finalEligibilityAcceptedTitlesBeforeTerminal = Array.from(new Set(finalEligibilityAcceptedTitles.filter(Boolean)));
  const finalEligibilityAcceptedSetBeforeTerminal = new Set(finalEligibilityAcceptedTitlesBeforeTerminal.map((t) => normalizeText(t)));
  for (const row of Object.values(finalEligibilityRejectedTitlesByReason || {})) {
    for (const title of row || []) {
      const t = String(title || "").trim();
      if (!t) continue;
      if (finalEligibilityAcceptedSetBeforeTerminal.has(normalizeText(t))) continue;
      markTerminalReject(t, "final_eligibility_rejected");
    }
  }
  const finalRootSecondEntryReasons: Record<string, string> = {};
  const finalRootDuplicateCounts: Record<string, number> = {};
  const byRoot = new Map<string, any[]>();
  for (const doc of finalRenderDocs) {
    const root = parentFranchiseRootForDoc(doc) || "__none__";
    if (!byRoot.has(root)) byRoot.set(root, []);
    byRoot.get(root)!.push(doc);
  }
  const diversifiedFinal: any[] = [];
  for (const [, docs] of byRoot.entries()) {
    const sorted = [...docs].sort((a: any, b: any) => Number(b?.score || 0) - Number(a?.score || 0));
    if (sorted[0]) diversifiedFinal.push(sorted[0]);
  }
  const remainingPool = Array.from(byRoot.entries()).flatMap(([root, docs]) =>
    docs
      .sort((a: any, b: any) => Number(b?.score || 0) - Number(a?.score || 0))
      .slice(1)
      .map((doc: any) => ({ root, doc }))
  );
  for (const { root, doc } of remainingPool) {
    if (diversifiedFinal.length >= Math.min(Math.max(finalLimit, 8), 10)) break;
    const rootCount = diversifiedFinal.filter((d: any) => parentFranchiseRootForDoc(d) === root).length;
    if (rootCount >= 2) continue;
    const title = String(doc?.title || "");
    const starterLike = /\b(volume one|volume 1|book one|book 1)\b/i.test(title);
    const collectedLike = /\b(compendium|collection|omnibus|tpb)\b/i.test(title);
    const sideArcLike = /\b(all her monsters|omega|clockworks|mecca conclusion|silk road|boss rush)\b/i.test(title) || Number((doc?.diagnostics as any)?.sideStoryPenalty || 0) < 0;
    const translatedLike = Number((doc?.diagnostics as any)?.nonEnglishEditionPenalty || 0) < 0;
    if (sideArcLike || translatedLike) continue;
    if (!(starterLike || collectedLike)) continue;
    diversifiedFinal.push(doc);
    finalRootSecondEntryReasons[root] = starterLike && collectedLike ? "starter_plus_collected" : (starterLike ? "starter_plus_alt_entry" : "collected_plus_starter_present");
  }
  finalRenderDocs = diversifiedFinal;
  for (const doc of finalRenderDocs) {
    const root = parentFranchiseRootForDoc(doc) || "__none__";
    finalRootDuplicateCounts[root] = Number(finalRootDuplicateCounts[root] || 0) + 1;
  }
  const finalRootDiversityCount = Object.keys(finalRootDuplicateCounts).length;
  const finalEligibilityCleanCandidateCount = finalRenderDocs.length;
  finalUnderfillAfterNarrativeExpansion = narrativeExpansionTriggered && finalEligibilityCleanCandidateCount < 6;
  teenPostPassInputDocs = [...finalRenderDocs];
  teenPostPassInputSource = "scoredRebuild";
  finalAcceptedDocsSource = "scoredRebuild";
  finalAcceptedDocsTitles = finalRenderDocs.map((doc: any) => String(doc?.title || doc?.rawDoc?.title || "").trim()).filter(Boolean);
  const scoredRebuildUsedForRender = true;
  const renderSource = "scored_rebuild";
  const overwrittenAfterScoredRebuild = false;
  const negativeScoreRenderBlockedTitles = finalRenderDocs
    .filter((doc: any) => Number(doc?.score ?? doc?.diagnostics?.finalScore ?? 0) < 0)
    .map((doc: any) => String(doc?.title || "").trim())
    .filter(Boolean);
  for (const title of negativeScoreRenderBlockedTitles) markTerminalReject(title, "negative_score_render_blocked");
  finalRenderDocs = finalRenderDocs.filter((doc: any) => Number(doc?.score ?? doc?.diagnostics?.finalScore ?? 0) >= 0);
  const finalUnderfillInsteadOfArtifactFallback = includeComicVine && finalRenderDocs.length < 5;
  if (finalUnderfillInsteadOfArtifactFallback) finalRenderDocs = [];
  const finalItems = finalRenderDocs.map((doc:any) => ({ kind: "open_library", doc }));
  const outputItems = finalItems;
  if (teenPostPassOutputLength > 0 && outputItems.length === 0) {
    console.error("POSTPASS_OUTPUT_DROPPED_BEFORE_RETURN", { teenPostPassOutputLength, teenPostPassOutputTitles });
  }
  const finalItemsLength = outputItems.length;
  const finalItemsTitles = outputItems.map((it:any)=>String(it?.doc?.title || "").trim()).filter(Boolean);
  const postRenderTitles = finalItemsTitles;
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
  if (includeComicVine && returnedItemsLength < 8) {
    cleanCandidateShortfallExpansionTriggered = true;
    if (!expansionFetchAttempted) {
      const terminalTasteExpansionSeeds = generatedComicVineQueriesFromTaste.map((q) => q.replace(/\s*graphic novel\s*$/i, "").trim()).filter(Boolean);
      const expansionSeedQueries = Array.from(new Set([
        ...terminalTasteExpansionSeeds,
        ...profileSelectedEntitySeeds,
        ...adjacentSeedExpansionCandidates,
        ...(Array.isArray(bucketPlan?.queries) ? bucketPlan.queries : []),
        ...(Array.isArray(rungs) ? rungs.map((r: any) => r?.query) : []),
      ].map((v) => String(v || "").trim()).filter(Boolean))).filter((q) => {
        const root = rootFromSeed(q);
        if (!root || blockedExpansionQueryFragments.test(q)) return false;
        if (selectedStarterRoots.has(root)) {
          expansionExcludedRoots.push(root);
          expansionRejectedAsSaturatedRoot[root] = Number(expansionRejectedAsSaturatedRoot[root] || 0) + 1;
          return false;
        }
        return true;
      }).slice(0, 8);
      if (expansionSeedQueries.length > 0) {
        expansionFetchAttempted = true;
        try {
          expansionFetchResultsByQuery = [];
          const expansionDocs = await runExpansionQueries(expansionSeedQueries);
          expansionRawCount += expansionFetchResultsByQuery.reduce((acc, row) => acc + Number(row.rawCount || 0), 0);
          expansionConvertedCount += expansionDocs.length;
          expansionSelectedTitles = Array.from(new Set([...expansionSelectedTitles, ...expansionDocs.map((d: any) => String(d?.title || "")).filter(Boolean)])).slice(0, 20);
          expansionDistinctRootsBeforeSelection = Array.from(new Set([...expansionDistinctRootsBeforeSelection, ...expansionDocs.map((d: any) => parentFranchiseRootForDoc(d)).filter(Boolean)]));
          for (const d of expansionDocs) {
            const root = parentFranchiseRootForDoc(d);
            if (!root) continue;
            expansionSelectedRootCounts[root] = Number(expansionSelectedRootCounts[root] || 0) + 1;
          }
          expansionMergedCandidateCount = Math.max(expansionMergedCandidateCount, dedupeDocs([...(enrichedDocs as any[]), ...expansionDocs]).length);
          expansionNotTriggeredReason = expansionDocs.length > 0 ? "post_selection_underfill_expansion_attempted" : "post_selection_underfill_expansion_empty";
        } catch (e: any) {
          expansionFetchResultsByQuery = expansionSeedQueries.map((q) => ({ query: q, status: "error", rawCount: 0, error: String(e?.message || e) }));
          expansionNotTriggeredReason = "post_selection_underfill_expansion_error";
        }
      } else {
        expansionNotTriggeredReason = "post_selection_underfill_no_seed_queries";
      }
    }
  }
  const returnedItemsTitles = finalItemsTitles;
  const diversityMemorySessionSize = recentFreshReturnedTitles.length;
  if (isFreshUserSession) {
    const normalizedReturnedTitles = returnedItemsTitles.map((t) => normalizeText(t)).filter(Boolean);
    const returnedRoots = Array.from(new Set(finalRenderDocs.map((doc: any) => parentFranchiseRootForDoc(doc)).filter(Boolean)));
    recentFreshReturnedTitles.push(normalizedReturnedTitles);
    recentFreshReturnedRoots.push(returnedRoots);
    recentFreshTasteSignatures.push(tasteSignature);
    while (recentFreshReturnedTitles.length > RECENT_FRESH_HISTORY_LIMIT) recentFreshReturnedTitles.shift();
    while (recentFreshReturnedRoots.length > RECENT_FRESH_HISTORY_LIMIT) recentFreshReturnedRoots.shift();
    while (recentFreshTasteSignatures.length > RECENT_FRESH_HISTORY_LIMIT) recentFreshTasteSignatures.shift();
  }

  const renderedTopRecommendationsLength = outputItems.length;
  if (finalAcceptedDocsLength > 0 && finalRankedDocsBase.length === 0 && rankedDocs.length === 0 && teenPostPassInputLength === 0 && renderedTopRecommendationsLength === 0) {
    console.error("FINAL_ACCEPTED_LINEAGE_INVARIANT_FAILED", { finalAcceptedDocsLength, finalAcceptedDocsSource, finalAcceptedDocsTitles });
  }
  const finalAcceptedDocIds = finalRenderDocs.map((doc: any) => String(doc?.sourceId || doc?.canonicalId || doc?.id || doc?.key || doc?.title || "").trim()).filter(Boolean);
  const finalRejectedDocIds = Array.isArray(finalDebugSnapshot?.rejected)
    ? finalDebugSnapshot.rejected.map((row: any) => String(row?.id || row?.title || "").trim()).filter(Boolean)
    : [];
  const returnedDocIds = outputItems.map((it: any) => String(it?.doc?.sourceId || it?.doc?.canonicalId || it?.doc?.id || it?.doc?.key || it?.doc?.title || "").trim()).filter(Boolean);
  const finalItemsRejectedTitles = teenPostPassRejectedTitles;
  const finalItemsRejectReasons = teenPostPassRejectReasons;
  const finalSeriesKeys = finalRenderDocs.map((doc:any) => parentFranchiseRootForDoc(doc));
  const selectedParentFranchiseCounts = finalRenderDocs.reduce((acc: Record<string, number>, doc: any) => {
    const k = parentFranchiseRootForDoc(doc) || "__none__";
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {});
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
  const expansionDropStageSummary =
    expansionRawCount > 0 && expansionCandidatesAcceptedFinal.length === 0
      ? JSON.stringify({
          expansionRawCount,
          expansionConvertedCount,
          expansionCandidatesEnteredScoringCount,
          expansionCandidatesSurvivedFiltersCount,
          expansionCandidatesRejectedByReason,
          narrativeExpansionCandidatesDroppedBeforeScoringByReason,
          narrativeExpansionCandidatesRejectedByFinalEligibilityReason,
        })
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
  const candidateCount = Number(gcdCandidates.length || 0);
  const filteredCount = Number(normalizedCandidates.length || 0);
  const rankedCount = Number(rankedDocsLength || 0);
  const renderedCount = Number(outputItems.length || 0);
  const healthyRawCollapsedPipelineFailure =
    includeComicVine &&
    fetchedRawCount >= 60 &&
    (candidateCount <= 3 || rankedCount === 0);
  const hardPipelineFailure = Boolean(comicVinePipelineFailureDetected || healthyRawCollapsedPipelineFailure);

  const fallbackItems = outputItems.filter((item: any) => String(item?.doc?.source || item?.source || "").includes("fallback") || String(item?.doc?.queryText || "") === "comicvine_publisher_facet_fallback");
  const nonFallbackItems = outputItems.filter((item: any) => !fallbackItems.includes(item));
  const mixedFallbackOutput = fallbackItems.length > 0 && nonFallbackItems.length > 0;
  const usedEmergencyFallback = fallbackItems.length > 0;
  const preFallbackCandidateCount = candidateCount;
  const preFallbackRankedCount = rankedCount;
  const preFallbackAcceptedCount = finalAcceptedDocsLength;
  const fallbackSource = fallbackItems.length > 0
    ? (mixedFallbackOutput ? "comicvine_mixed_fallback" : "comicvine_publisher_facet_fallback")
    : "none";
  const fallbackReason = !usedEmergencyFallback
    ? "none"
    : (includeComicVine && fetchedRawCount > 0 && preFallbackAcceptedCount === 0)
      ? "comicvine_raw_results_rejected_during_shaping"
      : hardPipelineFailure
        ? "comicvine_pipeline_failure"
        : "insufficient_query_derived_results";
  const outputItemsNoMixedFallback = mixedFallbackOutput ? nonFallbackItems : outputItems;
  const suppressTopRecommendations = (hardPipelineFailure && rankedCount === 0) || scoredUniverseFailure;
  const gatedFinalItems = finalRenderDocs.map((doc:any) => ({ kind: "open_library", doc }));
  const sourceLaneInputCount = {
    googleBooks: finalRenderDocs.filter((doc: any) => String(doc?.source || doc?.rawDoc?.source || "").toLowerCase().includes("google")).length,
    openLibrary: finalRenderDocs.filter((doc: any) => String(doc?.source || doc?.rawDoc?.source || "").toLowerCase().includes("openlibrary")).length,
    kitsu: finalRenderDocs.filter((doc: any) => String(doc?.source || doc?.rawDoc?.source || "").toLowerCase().includes("kitsu")).length,
    comicVine: finalRenderDocs.filter((doc: any) => String(doc?.source || doc?.rawDoc?.source || "").toLowerCase().includes("comicvine")).length,
  };
  const googleBooksApprovedCandidates = finalRenderDocs.filter((doc: any) => String(doc?.source || doc?.rawDoc?.source || "").toLowerCase().includes("google"));
  const openLibraryApprovedCandidates = finalRenderDocs.filter((doc: any) => String(doc?.source || doc?.rawDoc?.source || "").toLowerCase().includes("openlibrary"));
  const kitsuApprovedCandidates = finalRenderDocs.filter((doc: any) => String(doc?.source || doc?.rawDoc?.source || "").toLowerCase().includes("kitsu"));
  const comicVineApprovedCandidates = finalRenderDocs.filter((doc: any) => String(doc?.source || doc?.rawDoc?.source || "").toLowerCase().includes("comicvine"));
  const sourceLaneApprovedCount = {
    googleBooks: googleBooksApprovedCandidates.length,
    openLibrary: openLibraryApprovedCandidates.length,
    kitsu: kitsuApprovedCandidates.length,
    comicVine: comicVineApprovedCandidates.length,
  };
  const sourceLaneRejectedReasonBySource = {
    googleBooks: [] as string[],
    openLibrary: [] as string[],
    kitsu: [] as string[],
    comicVine: [] as string[],
  };
  const teenPostPassItems = finalRankedDocs.map((doc:any) => ({ kind: "open_library", doc }));
  const finalAcceptedDocsItems = finalRenderDocs.map((doc:any) => ({ kind: "open_library", doc }));
  const acceptedTitleSet = new Set(finalEligibilityAcceptedTitles.map((t) => normalizeText(String(t || ""))));
  const acceptedDocPool = dedupeDocs([
    ...finalRenderDocs,
    ...finalRankedDocs,
    ...outputItems.map((it: any) => it?.doc).filter(Boolean),
  ] as any[]);
  const finalGateAcceptedItems = acceptedDocPool
    .filter((doc: any) => acceptedTitleSet.has(normalizeText(String(doc?.title || ""))))
    .map((doc:any) => ({ kind: "open_library", doc }));
  const terminalAssemblyBaseItems =
    finalGateAcceptedItems.length > 0
      ? finalGateAcceptedItems
      : finalAcceptedDocsItems.length > 0
        ? finalAcceptedDocsItems
        : teenPostPassItems.length > 0
          ? teenPostPassItems
          : gatedFinalItems;
  const activeSources = [
    sourceEnabled.googleBooks ? "googleBooks" : null,
    sourceEnabled.openLibrary ? "openLibrary" : null,
    includeKitsu ? "kitsu" : null,
    includeComicVine ? "comicVine" : null,
  ].filter(Boolean) as string[];
  const singleSourceMode = activeSources.length === 1;
  const singleSource = singleSourceMode ? activeSources[0] : "";
  const singleSourceItems =
    singleSource === "googleBooks" ? googleBooksApprovedCandidates :
    singleSource === "openLibrary" ? openLibraryApprovedCandidates :
    singleSource === "kitsu" ? kitsuApprovedCandidates :
    singleSource === "comicVine" ? comicVineApprovedCandidates :
    [];
  let finalOutputItems = suppressTopRecommendations ? [] : terminalAssemblyBaseItems;
  let singleSourceDirectReturnTriggered = false;
  let singleSourceDirectReturnTitles: string[] = [];
  let singleSourceItemsLengthBeforeReturn = singleSourceItems.length;
  let singleSourceItemsTitlesBeforeReturn = singleSourceItems.map((doc: any) => String(doc?.title || "").trim()).filter(Boolean);
  let singleSourceItemsBuiltFrom = "source_lane_approved_candidates";
  const singleSourceItemsDropReasonByTitle: Record<string, string> = {};
  const singleSourceReturnedPassedFinalEligibilityByTitle: Record<string, boolean> = {};
  let singleSourceFallbackPoolUsed = "none";
  const singleSourceFallbackRejectedBecauseNotFinalEligible: string[] = [];
  let finalReturnSourceUsed = "final_gate_accepted_docs";
  const finalReturnDropReasonByTitle: Record<string, string> = {};
  if (!suppressTopRecommendations && singleSourceMode) {
    finalOutputItems = singleSourceItems.map((doc: any) => ({ kind: "open_library", doc }));
    singleSourceDirectReturnTriggered = true;
    singleSourceDirectReturnTitles = finalOutputItems.map((item: any) => String(item?.doc?.title || "").trim()).filter(Boolean);
    finalReturnSourceUsed = `single_source:${singleSource}`;
  }
  const finalGateAcceptedDocsCount = finalGateAcceptedItems.length;
  const terminalAssemblyInputCount = finalOutputItems.length;
  const terminalAssemblyInputTitles = finalOutputItems.map((item:any)=>String(item?.doc?.title || item?.title || "").trim()).filter(Boolean);
  nonComicVineReturnedBeforeComicVine = finalOutputItems.filter((item: any) => {
    const s = String(item?.doc?.source || item?.source || "").toLowerCase();
    return s && !s.includes("comicvine");
  }).length;
  const terminalAssemblyDropReasonByTitle: Record<string, string> = {};
  const terminalReturnDropReasonByTitle: Record<string, string> = {};
  let returnedItemsBuiltFrom = suppressTopRecommendations
    ? (scoredUniverseFailure ? "suppressed_scored_universe_failure" : "suppressed")
    : "final_gate_accepted_docs";
  const finalEligibilityAcceptedSet = new Set(finalEligibilityAcceptedTitles.map((t) => normalizeText(t)));
  const returnedItemPassedFinalGateByTitle: Record<string, boolean> = {};
  const finalRenderBypassBlockedTitles: string[] = [];
  for (const item of outputItemsNoMixedFallback) {
    const t = String(item?.doc?.title || item?.title || "").trim();
    if (!t) continue;
    const ok = finalEligibilityAcceptedSet.has(normalizeText(t));
    returnedItemPassedFinalGateByTitle[t] = ok;
    if (!ok) finalRenderBypassBlockedTitles.push(t);
  }
  for (const title of finalRenderBypassBlockedTitles) markTerminalReject(title, "final_render_bypass_blocked");
  const acceptedAfterTerminalRejectFilter = finalEligibilityAcceptedTitles.filter((t) => !terminalRejectReasonByTitle[normalizeText(t)]);
  const finalEligibilityAcceptedTitlesAfterTerminal = Array.from(new Set(acceptedAfterTerminalRejectFilter.filter(Boolean)));
  const rejectedButAcceptedTitles = finalEligibilityAcceptedTitles.filter((t) => Boolean(terminalRejectReasonByTitle[normalizeText(t)]));
  finalOutputItems = finalOutputItems.filter((item: any) => {
    const t = String(item?.doc?.title || item?.title || "").trim();
    const keep = !terminalRejectReasonByTitle[normalizeText(t)];
    if (!keep) finalReturnDropReasonByTitle[t] = `terminal_reject:${terminalRejectReasonByTitle[normalizeText(t)]}`;
    return keep;
  });
  const acceptedEvidenceMap = finalAcceptedTasteEvidenceByTitle;
  const fallbackAcceptedSet = new Set(fallbackTierAcceptedTitles.map((t) => normalizeText(t)));
  const acceptedAfterTerminalSet = new Set(acceptedAfterTerminalRejectFilter.map((t) => normalizeText(t)));
  const meaningfulEvidence = (title: string) => {
    const weighted = Number(candidateWeightedTasteScoreByTitle[title] || 0);
    const evidenceRows = acceptedEvidenceMap[title] || [];
    const meaningfulSignals = Number((evidenceRows.find((r) => r.startsWith("meaningfulSignals:")) || "meaningfulSignals:0").split(":")[1] || 0);
    const narrative = Number((evidenceRows.find((r) => r.startsWith("narrativeFictionConfidence:")) || "narrativeFictionConfidence:0").split(":")[1] || 0);
    if (fallbackAcceptedSet.has(normalizeText(title))) return true;
    if (acceptedAfterTerminalSet.has(normalizeText(title))) return true;
    return weighted >= 2.5 || meaningfulSignals >= 2 || (weighted >= 2.5 && narrative >= 2);
  };
  const preEvidenceFilteredTitles = finalOutputItems.map((item:any)=>String(item?.doc?.title || item?.title || "").trim()).filter(Boolean);
  finalOutputItems = finalOutputItems.filter((item: any) => {
    const title = String(item?.doc?.title || item?.title || "").trim();
    if (!title) return false;
    const ok = meaningfulEvidence(title);
    if (!ok) {
      finalReturnedWithoutTasteEvidenceTitles.push(title);
      terminalReturnDropReasonByTitle[title] = "post_gate_meaningful_evidence_filter";
      terminalAssemblyDropReasonByTitle[title] = "post_gate_meaningful_evidence_filter";
      finalReturnDropReasonByTitle[title] = "post_gate_meaningful_evidence_filter";
    }
    return ok;
  });
  if (!suppressTopRecommendations && acceptedAfterTerminalRejectFilter.length > 0 && finalOutputItems.length === 0) {
    const acceptedSet = new Set(acceptedAfterTerminalRejectFilter.map((t) => normalizeText(t)));
    finalOutputItems = terminalAssemblyBaseItems.filter((item: any) => acceptedSet.has(normalizeText(String(item?.doc?.title || item?.title || ""))));
    if (finalOutputItems.length > 0) returnedItemsBuiltFrom = "terminal_base_fail_open";
    if (finalOutputItems.length > 0) finalReturnSourceUsed = "terminal_base_fail_open";
  }
  const terminalAssemblyOutputCount = finalOutputItems.length;
  const terminalAssemblyOutputTitles = finalOutputItems.map((item:any)=>String(item?.doc?.title || item?.title || "").trim()).filter(Boolean);
  const finalRecommenderInputBySource = sourceLaneApprovedCount;
  const finalRecommenderOutputBySource = {
    googleBooks: finalOutputItems.filter((item: any) => String(item?.doc?.source || item?.source || "").toLowerCase().includes("google")).length,
    openLibrary: finalOutputItems.filter((item: any) => String(item?.doc?.source || item?.source || "").toLowerCase().includes("openlibrary")).length,
    kitsu: finalOutputItems.filter((item: any) => String(item?.doc?.source || item?.source || "").toLowerCase().includes("kitsu")).length,
    comicVine: finalOutputItems.filter((item: any) => String(item?.doc?.source || item?.source || "").toLowerCase().includes("comicvine")).length,
  };
  const approvedLaneCandidateTitlesBySource = {
    googleBooks: googleBooksApprovedCandidates.map((d: any) => String(d?.title || "").trim()).filter(Boolean),
    openLibrary: openLibraryApprovedCandidates.map((d: any) => String(d?.title || "").trim()).filter(Boolean),
    kitsu: kitsuApprovedCandidates.map((d: any) => String(d?.title || "").trim()).filter(Boolean),
    comicVine: comicVineApprovedCandidates.map((d: any) => String(d?.title || "").trim()).filter(Boolean),
  };
  nonComicVineReturnedAfterComicVine = finalOutputItems.filter((item: any) => {
    const s = String(item?.doc?.source || item?.source || "").toLowerCase();
    return s && !s.includes("comicvine");
  }).length;
  if (!suppressTopRecommendations && gatedFinalItems.length > 0 && finalOutputItems.length === 0) {
    finalUnderfillBecauseNoTasteEvidence = true;
    underfillReason = "semantic_gate_rejected_all";
  }
  if (!suppressTopRecommendations && finalOutputItems.length === 0 && aggregatedRawFetched.comicVine <= 0 && includeComicVine) underfillReason = "transport_failure";
  if (!suppressTopRecommendations && finalOutputItems.length === 0 && includeComicVine && hardPipelineFailure && normalizedCount === 0 && fetchedRawCount > 0) underfillReason = "comicvine_fallback_only";
  if (!suppressTopRecommendations && finalOutputItems.length === 0 && finalReturnedWithoutTasteEvidenceTitles.length > 0) underfillReason = "query_literalism";
  if (!suppressTopRecommendations && finalOutputItems.length === 0 && Object.values(queryTermOnlyEvidenceByTitle).some(Boolean)) underfillReason = "query_literalism";
  if (!suppressTopRecommendations && finalOutputItems.length === 0 && Object.keys(candidateMatchedLikedSignalsByTitle).length === 0) underfillReason = "insufficient_candidate_metadata";
  if (!suppressTopRecommendations && finalOutputItems.length === 0 && weightedSwipeTasteVector.disliked.length > 0 && weightedSwipeTasteVector.liked.length === 0) underfillReason = "taste_conflict";
  const returnedItemsTitlesPostTerminal = finalOutputItems.map((item:any)=>String(item?.doc?.title || item?.title || "").trim()).filter(Boolean);
  for (const title of acceptedAfterTerminalRejectFilter) {
    const returned = returnedItemsTitlesPostTerminal.some((t) => normalizeText(t) === normalizeText(title));
    if (!returned && !terminalReturnDropReasonByTitle[title]) {
      const wasPreEvidence = preEvidenceFilteredTitles.some((t) => normalizeText(t) === normalizeText(title));
      terminalReturnDropReasonByTitle[title] = wasPreEvidence
        ? "dropped_after_terminal_filter_unknown"
        : "missing_from_gated_final_items";
    }
  }
  for (const [title, evidence] of Object.entries(finalAcceptedTasteEvidenceByTitle)) {
    const accepted = acceptedAfterTerminalRejectFilter.some((t) => normalizeText(t) === normalizeText(title));
    if (accepted) continue;
    acceptedEvidenceButMissingFromFinalEligibilityTitles.push(title);
    if (terminalRejectReasonByTitle[normalizeText(title)]) {
      acceptedEvidenceButFinalRejectedReasonByTitle[title] = `terminal_reject:${terminalRejectReasonByTitle[normalizeText(title)]}`;
      continue;
    }
    const rejectedReasons = Object.entries(finalEligibilityRejectedTitlesByReason)
      .filter(([, titles]) => (titles || []).some((t) => normalizeText(String(t || "")) === normalizeText(title)))
      .map(([reason]) => reason);
    acceptedEvidenceButFinalRejectedReasonByTitle[title] = rejectedReasons.length > 0
      ? `final_gate_rejected:${rejectedReasons.join("|")}`
      : `not_in_final_accepted_unknown:${(evidence || []).join(",")}`;
  }
  const acceptedAfterTerminalSetForReason = new Set(finalEligibilityAcceptedTitlesAfterTerminal.map((t) => normalizeText(t)));
  for (const doc of finalRenderDocs) {
    const title = String(doc?.title || "").trim();
    if (!title) continue;
    if (acceptedAfterTerminalSetForReason.has(normalizeText(title))) continue;
    if (terminalRejectReasonByTitle[normalizeText(title)]) {
      cleanCandidateButNotAcceptedReasonByTitle[title] = `terminal_reject:${terminalRejectReasonByTitle[normalizeText(title)]}`;
      continue;
    }
    const rejectedReasons = Object.entries(finalEligibilityRejectedTitlesByReason)
      .filter(([, titles]) => (titles || []).some((t) => normalizeText(String(t || "")) === normalizeText(title)))
      .map(([reason]) => reason);
    cleanCandidateButNotAcceptedReasonByTitle[title] = rejectedReasons.length > 0 ? `final_gate_rejected:${rejectedReasons.join("|")}` : "not_in_final_accepted_unknown";
  }
  const rejectedButReturnedTitles = returnedItemsTitlesPostTerminal.filter((t) => Boolean(terminalRejectReasonByTitle[normalizeText(t)]));
  const finalRejectAssertionChecked = finalOutputItems.length > 0 || finalEligibilityAcceptedTitles.length > 0 || Object.keys(terminalRejectReasonByTitle).length > 0;
  let finalRejectAssertionThrowReason = "none";
  const finalGateConsistencyPassed = rejectedButReturnedTitles.length === 0;
  if (finalRejectAssertionChecked && rejectedButReturnedTitles.length > 0) {
    finalRejectAssertionThrowReason = `returned_intersects_terminal_rejects:${rejectedButReturnedTitles.length}`;
    finalOutputItems = [];
    returnedItemsBuiltFrom = "controlled_try_again_state";
  }
  if (!suppressTopRecommendations && singleSourceDirectReturnTriggered) {
    const acceptedSet = new Set(acceptedAfterTerminalRejectFilter.map((t) => normalizeText(t)));
    let dynamicSingleSourceItems = singleSourceItems.filter((doc: any) => acceptedSet.has(normalizeText(String(doc?.title || ""))));
    if (singleSource === "comicVine") {
      dynamicSingleSourceItems = dynamicSingleSourceItems.filter((doc: any) => {
        const title = String(doc?.title || "").trim();
        const weighted = Number(candidateWeightedTasteScoreByTitle[title] || 0);
        const dislike = Number(candidateDislikePenaltyByTitle[title] || 0);
        const semanticCount = Number(semanticEvidenceCountByTitle[title] || 0);
        const evidenceRows = finalAcceptedTasteEvidenceByTitle[title] || [];
        const meaningful = Number((evidenceRows.find((r) => r.startsWith("meaningfulSignals:")) || "meaningfulSignals:0").split(":")[1] || 0);
        return meaningful >= 1 && semanticCount >= 2 && weighted > dislike;
      });
      singleSourceItemsBuiltFrom = "comicvine_lane_final_gate_approved";
    } else {
      singleSourceItemsBuiltFrom = "source_lane_final_gate_approved";
    }
    singleSourceItemsLengthBeforeReturn = dynamicSingleSourceItems.length;
    singleSourceItemsTitlesBeforeReturn = dynamicSingleSourceItems.map((doc: any) => String(doc?.title || "").trim()).filter(Boolean);
    if (singleSourceItems.length > 0 && dynamicSingleSourceItems.length === 0) {
      for (const doc of singleSourceItems) singleSourceItemsDropReasonByTitle[String(doc?.title || "")] = "dropped_before_single_source_return";
    }
    const titleNeedsStrongNarrativeEvidence = (title: string) => {
      const t = String(title || "").trim().toLowerCase();
      if (!t) return false;
      if (/\btrade\s*paperback\b/i.test(t)) return true;
      if (/\bvolume\s*one\b/i.test(t) && /\bsuperpowers\b/i.test(t)) return true;
      if (/\bsex\s*fantasy\b/i.test(t)) return true;
      if (/\bfinal\s*fantasy\b/i.test(t)) return true;
      if (/\bamazing\s*fantasy\b/i.test(t)) return true;
      if (/\bromance\b/i.test(t) && !/\b(romantic|romance\s+(drama|comedy|thriller|mystery|horror|fantasy|sci[-\s]?fi))\b/i.test(t)) return true;
      return false;
    };
    const hasStrongNarrativeEvidence = (title: string) => {
      const evidenceRows = finalAcceptedTasteEvidenceByTitle[title] || [];
      const meaningful = Number((evidenceRows.find((r) => r.startsWith("meaningfulSignals:")) || "meaningfulSignals:0").split(":")[1] || 0);
      const narrative = Number((evidenceRows.find((r) => r.startsWith("narrativeFictionConfidence:")) || "narrativeFictionConfidence:0").split(":")[1] || 0);
      const semanticCount = Number(semanticEvidenceCountByTitle[title] || 0);
      const weighted = Number(candidateWeightedTasteScoreByTitle[title] || 0);
      return narrative >= 3 || (meaningful >= 3 && semanticCount >= 3) || (weighted >= 3.5 && meaningful >= 2 && semanticCount >= 2);
    };
    const enforceFinalEligibilityAndQuality = (docs: any[], sourceLabel: string) => {
      const acceptedSet = new Set(acceptedAfterTerminalRejectFilter.map((t) => normalizeText(t)));
      const next: any[] = [];
      for (const doc of docs) {
        const title = String(doc?.title || "").trim();
        if (!title) continue;
        const finalEligible = acceptedSet.has(normalizeText(title));
        singleSourceReturnedPassedFinalEligibilityByTitle[title] = finalEligible;
        if (!finalEligible) {
          singleSourceFallbackRejectedBecauseNotFinalEligible.push(title);
          continue;
        }
        if (titleNeedsStrongNarrativeEvidence(title) && !hasStrongNarrativeEvidence(title)) {
          singleSourceItemsDropReasonByTitle[title] = `quality_guard_weak_narrative:${sourceLabel}`;
          continue;
        }
        next.push(doc);
      }
      return next;
    };
    if (dynamicSingleSourceItems.length === 0 && finalAcceptedDocsItems.length > 0) {
      singleSourceFallbackPoolUsed = "finalAcceptedDocsItems";
      dynamicSingleSourceItems = enforceFinalEligibilityAndQuality(finalAcceptedDocsItems.map((row: any) => row?.doc).filter(Boolean), "finalAcceptedDocsItems");
      singleSourceItemsBuiltFrom = "finalAcceptedDocsItems_fallback";
    }
    if (dynamicSingleSourceItems.length === 0 && teenPostPassItems.length > 0) {
      singleSourceFallbackPoolUsed = "teenPostPassItems";
      dynamicSingleSourceItems = enforceFinalEligibilityAndQuality(teenPostPassItems.map((row: any) => row?.doc).filter(Boolean), "teenPostPassItems");
      singleSourceItemsBuiltFrom = "teenPostPassItems_fallback";
    }
    if (dynamicSingleSourceItems.length === 0 && finalRenderDocs.length > 0) {
      singleSourceFallbackPoolUsed = "finalRenderDocs";
      dynamicSingleSourceItems = enforceFinalEligibilityAndQuality(finalRenderDocs, "finalRenderDocs");
      singleSourceItemsBuiltFrom = "finalRenderDocs_fallback";
    }
    dynamicSingleSourceItems = enforceFinalEligibilityAndQuality(dynamicSingleSourceItems, "singleSourcePrimary");
    finalOutputItems = dynamicSingleSourceItems.map((doc: any) => ({ kind: "open_library", doc }));
    returnedItemsBuiltFrom = "single_source_lane_direct";
    finalReturnSourceUsed = `single_source_direct:${singleSource}`;
  }
  if (finalRenderBypassBlockedTitles.length > 0) {
    console.error("FINAL_RENDER_BYPASS", { titles: finalRenderBypassBlockedTitles.slice(0, 30) });
  }
  const finalRenderSourceList = ["finalEligibilityAcceptedTitles", "finalAcceptedDocsAfterGate", "topUpOnlyIfPassedFinalGate"];
  curatedSeedMatchesFound.push(
    ...Array.from(new Set(finalRenderDocs
      .map((doc: any) => String(doc?.title || "").trim())
      .filter((title) => curatedSeedRootsUsed.some((root) => normalizeText(title).includes(normalizeText(root))))))
  );
  queryGeneratedGoodCandidateCount = finalEligibilityAcceptedTitles.length;
  queryGeneratedArtifactCount = Object.values(finalEligibilityRejectedTitlesByReason || {}).reduce((acc, row) => acc + (Array.isArray(row) ? row.length : 0), 0);
  const hasEvidenceFinalMismatch = Object.keys(acceptedEvidenceButFinalRejectedReasonByTitle).length > 0 && acceptedAfterTerminalRejectFilter.length === 0;
  const qaFailureClass =
    finalEligibilityAcceptedTitles.length > 0 && finalOutputItems.length === 0
      ? "handoff_failure"
      : hasEvidenceFinalMismatch
        ? "evidence_final_gate_mismatch"
      : finalEligibilityAcceptedTitles.length === 0
        ? "no_final_eligible_candidates"
        : "none";

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
    preTopUpFinalItemsLength,
    topUpCandidatesConsideredLength,
    topUpCandidatesAcceptedLength,
    topUpRejectedReasons,
    topUpSourceRankedDocsLength,
    topUpSourceCandidateDocsLength,
    topUpSourceNormalizedCandidatesLength,
    topUpSourceEnrichedDocsLength,
    topUpSourceDebugRawPoolLength,
    topUpMergedPoolBeforeFiltersLength,
    topUpMergedPoolAfterDedupeLength,
    topUpMergedPoolAfterQualityFiltersLength,
    topUpQualityRejectedReasons,
    topUpQualityRejectedTitlesByReason,
    entitySeedConvertedCount,
    entitySeedTopUpEligibleCount,
    entitySeedTopUpRejectedReasons,
    entitySeedTopUpRejectedTitlesByReason,
    postTopUpFinalItemsLength,
    recoveryTriggered,
    recoveryInputPoolLength,
    recoveryEntitySeedMatches,
    recoveryRejectedReasons,
    recoveryFinalItemsLength,
    countContractSatisfied,
    finalEligibleNonNegativeCount,
    countContractShortfallReason,
    scoringPassApplied,
    scoringPassInputCount,
    scoringPassOutputCount,
    topScoredTitles,
    entryPointCandidatesFound,
    entryPointCandidatesSuppressed,
    qualityRecoveryTriggered,
    qualityRecoveryReason,
    scoredUniverseFailure,
    scoredUniverseFailureReason,
    scoredUniversePreviewTitles,
    finalSuppressedByBetterEntryPoint,
    scoredRebuildUsedForRender,
    renderSource,
    preRenderTitles,
    postRenderTitles,
    overwrittenAfterScoredRebuild,
    scoredCandidateUniverseCount,
    convertedDocsAvailableForScoringCount,
    gcdStructuralEnrichmentCount,
    gcdEntryPointLikeCount,
    gcdCollectedLikeCount,
    gcdIssueLikeCount,
    scoredCandidateUniverseSources,
    scoredCandidateUniverseFranchiseRoots,
    broadArtifactRejectedTitles,
    zeroScoreBroadFillersUsed,
    entitySeedCandidatesFoundBySeed,
    entitySeedCandidatesSelected,
    selectedFranchiseRoots: Array.from(new Set(finalRenderDocs.map((d: any) => parentFranchiseRootForDoc(d)).filter(Boolean))),
    parentFranchiseRootByTitle,
    parentRootSourceByTitle,
    normalizedParentRootAliases,
    subtitleOnlyParentFragmentRejectedTitles,
    parentMetadataUsedForRootCount,
    expansionFetchAttempted,
    expansionFetchResultsByQuery,
    expansionMergedCandidateCount,
    cleanCandidateShortfallExpansionTriggered,
    expansionRawCount,
    expansionConvertedCount,
    expansionCleanEligibleCount,
    expansionSelectedTitles,
    expansionExcludedRoots,
    expansionRootDiversityCandidates,
    expansionRejectedAsSaturatedRoot,
    expansionSelectedRootCounts,
    expansionConvertedByQuery,
    expansionDroppedByQueryReason,
    expansionMergedTitlesByQuery,
    expansionDistinctRootsBeforeSelection,
    expansionCandidatesEnteredScoringCount,
    expansionCandidatesSurvivedFiltersCount,
    expansionCandidatesRejectedByReason,
    expansionCandidatesAcceptedFinal,
    expansionQueryRootMismatchRejectedTitles,
    expansionFalsePositiveRejectedTitles,
    expansionLocaleRejectedTitles,
    expansionWeakFillerRejectedTitles,
    narrativeExpansionTriggered,
    narrativeExpansionReason,
    narrativeExpansionQueries,
    narrativeExpansionRawCount,
    narrativeExpansionConvertedCount,
    narrativeExpansionViableCount,
    narrativeExpansionAcceptedTitles,
    narrativeExpansionCandidatesEnteredScoringCount,
    narrativeExpansionCandidatesDroppedBeforeScoringByReason,
    narrativeExpansionCandidatesSurvivedScoringCount,
    narrativeExpansionCandidatesRejectedByFinalEligibilityReason,
    narrativeExpansionFinalAcceptedTitles,
    finalUnderfillAfterNarrativeExpansion,
    primaryNarrativeQueryMode,
    primaryNarrativeQueries,
    broadGraphicNovelQueriesUsedAsFallback,
    broadGraphicNovelFallbackReason,
    negativeScoreRenderBlockedTitles,
    finalUnderfillInsteadOfArtifactFallback,
    expansionDropStageSummary,
    formatSignalOnlyRejectedTitles,
    genericCollectionArtifactRejectedTitles,
    finalTasteThresholdByTitle,
    finalAcceptedTasteEvidenceByTitle,
    acceptedEvidenceButFinalRejectedReasonByTitle,
    acceptedEvidenceButMissingFromFinalEligibilityTitles,
    cleanCandidateButNotAcceptedReasonByTitle,
    finalCountCappedToTarget,
    finalReturnedWithoutTasteEvidenceTitles,
    finalUnderfillBecauseNoTasteEvidence,
    underfillReason,
    expansionMergedButNotScoredReason,
    finalRenderSourceList,
    finalRenderCandidateTitlesBeforeGate,
    finalRenderCandidateTitlesAfterGate,
    finalRenderBypassBlockedTitles,
    topUpFinalGateRejectedTitles,
    returnedItemPassedFinalGateByTitle,
    sameParentSoftDuplicateRejectedTitles,
    finalEligibilityGateApplied,
    finalEligibilityCleanCandidateCount,
    finalEligibilityAcceptedTitlesBeforeTerminal,
    finalEligibilityAcceptedTitlesAfterTerminal,
    finalEligibilityAcceptedTitles: acceptedAfterTerminalRejectFilter,
    finalEligibilityRejectedTitlesByReason,
    rejectedButReturnedTitles,
    rejectedButAcceptedTitles,
    terminalRejectReasonByTitle,
    finalGateConsistencyPassed,
    finalRejectAssertionChecked,
    finalRejectAssertionThrowReason,
    finalEligibilityRelaxationTriggered,
    finalEligibilityRelaxedAcceptedTitles,
    finalEligibilityRelaxedReasonByTitle,
    rejectedDespiteStrongTasteFitTitles,
    finalRootDiversityCount,
    finalRootDuplicateCounts,
    finalRootSecondEntryReasons,
    viableCandidateCountBeforeFinalSelection,
    viableCandidateRootsBeforeFinalSelection,
    positiveFitScoreByTitle,
    positiveFitReasonsByTitle,
    penaltyReasonsByTitle,
    finalSelectionRejectedByReason,
    swipeTasteVector,
    weightedSwipeTasteVector,
    dislikedSignalsFromSwipeHistory,
    ignoredGenericTasteSignals,
    candidateTasteMatchScoreByTitle,
    candidateTastePenaltyByTitle,
    candidateMatchedLikedSignalsByTitle,
    candidateMatchedDislikedSignalsByTitle,
    candidateWeightedTasteScoreByTitle,
    candidateDislikePenaltyByTitle,
    candidateSkipPenaltyByTitle,
    singleTokenQueryHijackPenaltyByTitle,
    queryTermOnlyEvidenceByTitle,
    titleOnlyTasteSignalByTitle,
    semanticSupportFoundByTitle,
    semanticEvidenceCountByTitle,
    nearMissSemanticEvidenceTitles,
    nearMissSemanticEvidenceReasons,
    fallbackTierAcceptedTitles,
    fallbackTierTriggered,
    fallbackTierCandidateCount,
    fallbackTierRejectedReasonsByTitle,
    meaningfulSignalsGateRejectedTitles,
    dislikedOverlapDominatesRejectedTitles,
    controlledEmergencyFallback,
    sourceSpecificGateAppliedByTitle,
    sourceSpecificRejectReasonByTitle,
    curatedSeedProfileMatch,
    curatedSeedReason,
    curatedSeedMatchedArchetype,
    nonComicVineCandidateDroppedByComicVineRule,
    nonComicVineDroppedByComicVineRule: nonComicVineCandidateDroppedByComicVineRule,
    nonComicVineReturnedBeforeComicVine,
    nonComicVineReturnedAfterComicVine,
    comicVineScopedRulesAppliedCount,
    sourceLaneInputCount,
    sourceLaneApprovedCount,
    sourceLaneRejectedReasonBySource,
    approvedLaneCandidateTitlesBySource,
    finalRecommenderInputBySource,
    finalRecommenderOutputBySource,
    singleSourceDirectReturnTriggered,
    singleSourceDirectReturnTitles,
    singleSourceItemsLengthBeforeReturn,
    singleSourceItemsTitlesBeforeReturn,
    singleSourceItemsBuiltFrom,
    singleSourceItemsDropReasonByTitle,
    singleSourceReturnedPassedFinalEligibilityByTitle,
    singleSourceFallbackPoolUsed,
    singleSourceFallbackRejectedBecauseNotFinalEligible,
    finalReturnSourceUsed,
    finalReturnDropReasonByTitle,
    preSourceSpecificGateTitles,
    postSourceSpecificGateTitles,
    placeholderPenaltyAppliedTitles,
    narrativeTitleConfidenceByTitle,
    lowPositiveFitThresholdByCandidate,
    candidateKilledByPenaltyStack,
    finalRankingReasonByTitle,
    finalScoreComponentsByTitle,
    semanticEligibilityRejectedReason,
    genericRootSuppressed,
    rootBoostSuppressed,
    narrativeEvidenceScore,
    structuralOnlyMatch,
    tasteProfileSummary,
    dislikeProfileBuilt,
    dislikeProfileBuildFailure,
    dislikeProfileBuildFailureReason,
    dislikedSignalsPromoted,
    dislikeOnlySession,
    fallbackBlockedByDislikeOnlySession,
    retrievalSuppressedByDislikedSignals,
    candidateGenerationMode,
    curatedSeedRootsUsed,
    curatedSeedMatchesFound,
    queryGeneratedGoodCandidateCount,
    queryGeneratedArtifactCount,
    generatedComicVineQueriesFromTaste,
    querySourceOfTruth,
    tasteQueriesUsedForPrimaryFetch,
    tasteQueriesBlockedByReason,
    finalRungQueriesSource,
    primaryTasteQueryOverrideApplied,
    primaryTasteQueryOverrideBlockedReason,
    primaryRungZeroSource,
    primaryTasteQueryPoolRoots,
    primaryTasteQueryPoolTitles: primaryTasteQueryPoolTitles.slice(0, 80),
    staticRungPoolRoots,
    tasteQueryPoolUsedAsPrimary,
    preFilterPoolOverlapWithPreviousSession,
    preFilterPoolBuiltFrom,
    recentReturnedTitlePenaltyApplied,
    recentReturnedRootPenaltyApplied,
    repeatedTitleSuppressed,
    repeatedRootSuppressed,
    crossSessionDiversityApplied,
    crossSessionDiversityBypassedReason,
    diversityMemoryHitTitles: Array.from(new Set(diversityMemoryHitTitles.map((t) => String(t || "").trim()).filter(Boolean))).slice(0, 25),
    diversityMemoryHitRoots: Array.from(new Set(diversityMemoryHitRoots.map((r) => String(r || "").trim()).filter(Boolean))).slice(0, 25),
    diversityPenaltyStage,
    diversitySuppressionStage,
    diversityMemorySessionSize,
    repeatPenaltyCandidateCount,
    staticDefaultQueriesUsed,
    staticDefaultQueriesSuppressedReason,
    tasteProfileBuildFailure,
    tasteProfileBuildFailureReason,
    preDispatchTasteProfileSummary,
    preDispatchGeneratedQueries,
    expansionNotTriggeredReason,
    subtitleFragmentInheritedParentRootTitles,
    subtitleFragmentRejectedTitles,
    fragmentAcceptedBecauseCollectedEditionTitles,
    sideArcRejectedTitles,
    selectedParentFranchiseCounts,
    duplicateTitleRejectedTitles,
    negativeScoreRejectedTitles,
    untranslatedEditionRejectedTitles,
    semanticBreadthSelections,
    adjacentSeedExpansionCandidates,
    seedSaturationPenaltyApplied,
    relaxedBreadthBackfillTriggered,
    relaxedBreadthBackfillCandidates,
    relaxedBreadthBackfillSelected,
    relaxedBreadthBackfillRejectedReasons,
    relaxationStageReached,
    relaxationCandidatesConsidered,
    relaxationCandidatesSelected,
    relaxationRejectedReasons,
    suppressedGlobalSeedReason,
    profileSelectedEntitySeeds,
    finalFranchiseFamilies,
    franchiseCapBlockedTitles,
    recoveryDiversificationAttempts,
    returnedItemsBuiltFrom,
    finalGateAcceptedDocsCount,
    terminalAssemblyInputCount,
    terminalAssemblyOutputCount,
    terminalAssemblyInputTitles,
    terminalAssemblyOutputTitles,
    terminalAssemblyDropReasonByTitle,
    teenPostPassOutputTitles,
    finalGateAcceptedTitles: acceptedAfterTerminalRejectFilter,
    returnedItemsTitlesPostTerminal,
    terminalReturnDropReasonByTitle,
    qaFailureClass,
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
    filterKeptDocsLength: filterKeptDocs.length,
    filterKeptDocsTitles,
    candidatePoolInputLength: candidateDocs.length,
    candidatePoolDropReasons,
    rankedInputLength: sourceLayerRankedDocs.length,
    rankedDropReasons,
    shapedInputLength: postFilteredRankedDocs.length,
    shapedDropReasons,
    normalizedDocsCount,
    postCanonicalizationCount,
    postDeduplicationCount,
    postAuthorityFilterCount,
    postLaneFilterCount,
    postShapeGateCount,
    postFinalShapingCount,
    finalRecommenderInputCount,
    stageDropReasons,
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
    usedEmergencyFallback,
    fallbackReason,
    fallbackSource,
    preFallbackCandidateCount,
    preFallbackRankedCount,
    preFallbackAcceptedCount,
    suppressTopRecommendations,
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
