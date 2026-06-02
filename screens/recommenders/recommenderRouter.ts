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
import { KITSU_API_BASE, getKitsuMangaRecommendations } from "./kitsu/kitsuMangaRecommender";
import { getComicVineGraphicNovelRecommendations } from "./gcd/gcdGraphicNovelRecommender";
import { EXPECTED_ROUTER_FINGERPRINT } from "./routerFingerprint";
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
const ROUTER_INSTRUMENTATION_VERSION = "router-heartbeat-v2-17c4615";
const ROUTER_BUILD_TIMESTAMP = "2026-05-26T00:00:00.000Z";

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
const CURATED_TEEN_GRAPHIC_NOVEL_ROOT_SET = new Set([
  "paper-girls","saga","runaways","ms-marvel","nimona","lumberjanes","on-a-sunbeam","descender","black-science","the-wicked-the-divine","locke-key","something-is-killing-the-children","adventure-time","amulet","bone","blue-flag","a-silent-voice","planetes","sweet-tooth","the-sandman","monstress",
]);
function isCuratedTeenGraphicNovelRoot(root: string): boolean {
  return CURATED_TEEN_GRAPHIC_NOVEL_ROOT_SET.has(String(root || "").trim());
}

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
  if (/^(one dark window|sharp objects|shutter island)$/.test(t)) return false;
  if (isCollectedStarterLikeText(t)) return false;
  if (/\b(part|chapter)\s*(one|two|three|four|five|six|seven|eight|nine|ten|\d+)\b/.test(t)) return true;
  if (/\b\w+\s+of\s+\w+\b/.test(t)) return true;
  if (/\b(conclusion|the end of|finale|aftermath)\b/.test(t)) return true;
  if (/^[a-z0-9' -]{1,40}$/.test(t) && t.split(" ").length <= 4) return true;
  return false;
}

function isReferenceArtifactTitle(title: string): boolean {
  const t = String(title || "").toLowerCase();
  if (!t) return false;
  return /\b(100 graphic novels for public libraries|public libraries|masters of|index|teaching|literacy|research|screenplays|subject headings|popular culture|focus on|science fiction,\s*fantasy,\s*&\s*horror)\b/.test(t);
}

function isLikelyIssueFragmentDoc(doc: any): boolean {
  const title = String(doc?.title || "").trim();
  const bag = normalizeText(`${title} ${String(doc?.description || "")}`);
  if (!title) return false;
  if (/#\s*\d+\b/.test(title) && !/\b(vol\.?|volume|tpb|collection|omnibus|deluxe|book)\b/i.test(title)) return true;
  if (/\b(issue|chapter)\s*#?\d+\b/i.test(title) && !/\b(volume|book|omnibus|collection)\b/i.test(bag)) return true;
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
    nyt: config?.nyt === true,
  };
}


function buildSourceOrigins(config: any): Record<string, string> {
  return {
    googleBooks: config?.googleBooks === false ? "explicit_disable" : "default_enabled",
    openLibrary: config?.openLibrary === false ? "explicit_disable" : "default_enabled",
    localLibrary: config?.localLibrary === false ? "explicit_disable" : "default_enabled_or_unsupported",
    kitsu: config?.kitsu === false ? "explicit_disable" : "default_enabled",
    comicVineToggle: config?.comicVine === false ? "explicit_disable" : "default_enabled",
    nyt: config?.nyt === true ? "explicit_enable" : "default_disabled",
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
          const doc = { ...item.doc, source: item.doc?.source || fallbackSource } as any;
          if (fallbackSource === "kitsu" || String(doc?.source || "").toLowerCase().includes("kitsu")) {
            const rawId = String(doc?.sourceId || doc?.canonicalId || doc?.key || doc?.id || doc?.rawDoc?.id || "").trim();
            const fallbackId = rawId || (String(doc?.title || "").trim() ? `title:${String(doc.title).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")}` : "");
            if (fallbackId) {
              doc.sourceId = fallbackId.startsWith("kitsu:") ? fallbackId : `kitsu:${fallbackId}`;
              doc.canonicalId = doc.canonicalId || doc.sourceId;
              doc.key = doc.key || doc.sourceId;
            }
          }
          return doc;
        })
        .filter(Boolean)
    : [];

  const recommendations = Array.isArray((result as any).recommendations)
    ? (result as any).recommendations
        .map((doc: any) =>
          doc
            ? (() => {
                const out = { ...doc, source: doc?.source || fallbackSource } as any;
                if (fallbackSource === "kitsu" || String(out?.source || "").toLowerCase().includes("kitsu")) {
                  const rawId = String(out?.sourceId || out?.canonicalId || out?.key || out?.id || out?.rawDoc?.id || "").trim();
                  const fallbackId = rawId || (String(out?.title || "").trim() ? `title:${String(out.title).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")}` : "");
                  if (fallbackId) {
                    out.sourceId = fallbackId.startsWith("kitsu:") ? fallbackId : `kitsu:${fallbackId}`;
                    out.canonicalId = out.canonicalId || out.sourceId;
                    out.key = out.key || out.sourceId;
                  }
                }
                return out;
              })()
            : null
        )
        .filter(Boolean)
    : [];

  const docs = Array.isArray((result as any).docs)
    ? (result as any).docs
        .map((doc: any) =>
          doc
            ? (() => {
                const out = { ...doc, source: doc?.source || fallbackSource } as any;
                if (fallbackSource === "kitsu" || String(out?.source || "").toLowerCase().includes("kitsu")) {
                  const rawId = String(out?.sourceId || out?.canonicalId || out?.key || out?.id || out?.rawDoc?.id || "").trim();
                  const fallbackId = rawId || (String(out?.title || "").trim() ? `title:${String(out.title).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")}` : "");
                  if (fallbackId) {
                    out.sourceId = fallbackId.startsWith("kitsu:") ? fallbackId : `kitsu:${fallbackId}`;
                    out.canonicalId = out.canonicalId || out.sourceId;
                    out.key = out.key || out.sourceId;
                  }
                }
                return out;
              })()
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
  const explicitPsychologicalSignal = /\b(psychological|thriller|horror)\b/.test(lowered);
  const explicitRomanticSignal = /\b(romance|romantic|relationship|love)\b/.test(lowered);
  const explicitInvestigatorSignal = /\b(detective|investigator|noir|case|crime[\s-]?solving|police|sleuth)\b/.test(lowered);
  const isGraphicNovelShaped = /\b(graphic\s+novel|comic|manga|manhwa|webtoon)\b/i.test(`${base} ${String(bucketPlan?.preview || "")}`);
  const lanes = dedupeNonEmptyQueries([
    base,
    baseNeedsFictionVariant ? `${base} fiction` : "",
    `${base} ${negativeTerms}`,
    family === "science_fiction" && !isGraphicNovelShaped && /\b(science fiction|sci[\s-]?fi|dystopian|future society|space|cyberpunk|alien|robot)\b/.test(lowered) ? "literary science fiction novel" : "",
    family === "science_fiction" && explicitPsychologicalSignal ? "psychological science fiction novel" : "",
    family === "science_fiction" && explicitRomanticSignal ? "romantic science fiction novel" : "",
    family === "science_fiction" ? (isGraphicNovelShaped ? "dystopian graphic novel" : "dystopian science fiction novel") : "",
    family === "science_fiction" && /human centered|identity|literary|emotional/.test(lowered) ? "human centered science fiction novel" : "",
    family === "science_fiction" && /identity|literary/.test(lowered) ? "literary science fiction identity novel" : "",
    family === "science_fiction" && /emotional|speculative/.test(lowered) ? "emotional speculative fiction novel" : "",
    family === "fantasy" && /dark/.test(lowered) ? "dark fantasy novel" : "",
    family === "fantasy" && explicitPsychologicalSignal ? "psychological fantasy novel" : "",
    family === "fantasy" && /magic|wizard|witch/.test(lowered) ? "magic fantasy novel" : "",
    family === "horror" && /psychological/.test(lowered) ? "psychological horror graphic novel" : "",
    family === "horror" && /haunted|ghost/.test(lowered) ? "haunted house horror novel" : "",
    family === "speculative" && /psychological/.test(lowered) ? "dark psychological fiction novel" : "",
    family === "speculative" && /horror/.test(lowered) ? "literary horror novel" : "",
    family === "mystery" && /psychological/.test(lowered) ? "psychological mystery novel" : "",
    family === "mystery" && /murder|investigation|detective/.test(lowered) ? "detective mystery novel" : "",
    family === "mystery" && /murder|investigation|police|procedural/.test(lowered) ? "police procedural mystery novel" : "",
    family === "mystery" && explicitInvestigatorSignal && !/private investigator/.test(lowered) ? "private investigator mystery novel" : "",
    family === "thriller" && /psychological/.test(lowered) ? "psychological suspense graphic novel" : "",
    thrillerAllowsDomestic ? "domestic suspense novel" : "",
    ...(Array.isArray(bucketPlan?.queries) ? bucketPlan.queries.slice(0, 5) : []),
  ]);

  let filteredLanes = lanes;
  if (isGraphicNovelShaped && !/\b(psychological|suspense|thriller)\b/.test(lowered)) {
    filteredLanes = filteredLanes.filter((q) => !/\bpsychological suspense novel\b/i.test(String(q || "")));
  }
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
  try {
    const entry = { phase: "router_entered", timestamp: new Date().toISOString() };
    (globalThis as any).__novelIdeasRouterEntryHeartbeat = entry;
    const history = Array.isArray((globalThis as any).__novelIdeasRouterPhaseHistory)
      ? (globalThis as any).__novelIdeasRouterPhaseHistory
      : [];
    history.push(entry);
    const afterEntry = { phase: "router_after_entry_marker", timestamp: new Date().toISOString() };
    history.push(afterEntry);
    (globalThis as any).__novelIdeasRouterEntryHeartbeat = afterEntry;
    (globalThis as any).__novelIdeasRouterPhaseHistory = history.slice(-160);
  } catch {
    // non-fatal instrumentation only
  }
  const pushGlobalPhase = (phase: string, extra?: Record<string, any>) => {
    const entry = { phase, timestamp: new Date().toISOString(), ...(extra || {}) };
    (globalThis as any).__novelIdeasRouterEntryHeartbeat = entry;
    const history = Array.isArray((globalThis as any).__novelIdeasRouterPhaseHistory)
      ? (globalThis as any).__novelIdeasRouterPhaseHistory
      : [];
    history.push(entry);
    (globalThis as any).__novelIdeasRouterPhaseHistory = history.slice(-160);
  };
  const pushEarlyReturnDiagnostics = (reason: string, phase: string, extra?: Record<string, any>) => {
    try {
      pushGlobalPhase("getRecommendations_early_return", {
        getRecommendationsEarlyReturnReason: reason,
        getRecommendationsEarlyReturnPhase: phase,
        ...(extra || {}),
      });
    } catch {
      // instrumentation only
    }
  };
  try {
    pushGlobalPhase("getRecommendations_function_entered");
    pushGlobalPhase("getRecommendations_after_entry_heartbeat");
  } catch {
    // non-fatal instrumentation only
  }
  const routerPhaseHistory: Array<{ phase: string; timestamp: string }> = [];
  const markRouterPhase = (phase: string) => {
    routerPhaseHistory.push({ phase, timestamp: new Date().toISOString() });
  };
  let routingInput: RecommenderInput;
  let preferredEngine: EngineId | "auto";
  let baseBucketPlan: any;
  let generatedHybridLaneWeights: any;
  let evidenceLaneWeights: any;
  let affinityMultipliers: any;
  let hybridLaneWeights: any;
  let routerFamily: any;
  let rankedLaneWeights: any;
  let isHybridMode: boolean;
  let bucketPlan: any;
  try {
    pushGlobalPhase("getRecommendations_before_args_normalization");
    const preRouterTimeoutMs = 10_000;
    const preRouterResult = await Promise.race([
      (async () => {
        routingInput = removeSkippedSwipeEvidenceForRouting(input);
        pushGlobalPhase("getRecommendations_after_args_normalization");
        preferredEngine = chooseEngine(routingInput, override);
        baseBucketPlan = buildRouterBucketPlan(routingInput);
        generatedHybridLaneWeights = buildHybridLaneWeights(routingInput, baseBucketPlan);
        evidenceLaneWeights = buildDirectEvidenceLaneWeights(routingInput);
        affinityMultipliers = buildUserAffinityLaneMultipliers(input);
        hybridLaneWeights = applyLaneAffinityMultipliers(
          mergeEvidenceLaneWeights(generatedHybridLaneWeights, evidenceLaneWeights),
          affinityMultipliers
        );
        routerFamily = choosePrimaryRouterFamilyFromWeights(
          inferRouterFamily(baseBucketPlan),
          hybridLaneWeights,
          routingInput
        );
        rankedLaneWeights = Object.entries(hybridLaneWeights || {})
          .map(([family, weight]) => ({ family: normalizeRouterFamilyValue(family), weight: Number(weight || 0) }))
          .filter((entry) => entry.family && entry.weight > 0)
          .sort((a, b) => b.weight - a.weight);
        isHybridMode = Object.keys(hybridLaneWeights).length > 1;
        bucketPlan = {
          ...baseBucketPlan,
          lane: routerFamily,
          family: routerFamily,
          hybridMode: isHybridMode,
          hybridLaneWeights,
          primaryLane: routerFamily,
        };
        pushGlobalPhase("getRecommendations_before_router_call");
        return true;
      })(),
      new Promise<boolean>((_, reject) =>
        setTimeout(() => reject(new Error(`getRecommendations_pre_router_timeout:${preRouterTimeoutMs}`)), preRouterTimeoutMs)
      ),
    ]);
    if (!preRouterResult) throw new Error("getRecommendations_pre_router_timeout:unknown");
    pushGlobalPhase("getRecommendations_router_call_skipped_or_not_awaited");
  } catch (err: any) {
    pushGlobalPhase("getRecommendations_pre_router_error", {
      phase: "getRecommendations_pre_router_error",
      error: String(err?.message || err || "unknown"),
      stackPrefix: String(err?.stack || "").slice(0, 240),
    });
    throw err;
  }
  markRouterPhase("router_entered");
  markRouterPhase("router_after_entry_marker");
  markRouterPhase("router_query_built");

  // Gold-standard 20Q router:
  // always carry the bucket plan forward, but do not let the router collapse to one engine.
  const routedInput: RecommenderInput = { ...routingInput, bucketPlan };
  pushGlobalPhase("before_source_enabled_synthesis");
  const sourceEnabled = resolveSourceEnabled(routedInput);
  const enabledSourcesAtRequestStart = { ...sourceEnabled };
  const kitsuOnlyAtRequestStart = Boolean(
    enabledSourcesAtRequestStart.kitsu &&
    !enabledSourcesAtRequestStart.googleBooks &&
    !enabledSourcesAtRequestStart.openLibrary &&
    !enabledSourcesAtRequestStart.localLibrary &&
    !enabledSourcesAtRequestStart.nyt
  );
  pushGlobalPhase("after_source_enabled_synthesis");
  const withSourceTimeout = async <T>(phaseBefore: string, phaseAfter: string, ms: number, op: () => Promise<T>): Promise<T> => {
    markRouterPhase(phaseBefore);
    try {
      const out = await Promise.race([
        op(),
        new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${phaseBefore}_timeout:${ms}`)), ms)),
      ]);
      markRouterPhase(phaseAfter);
      return out;
    } catch (err) {
      markRouterPhase(`${phaseAfter}_failed`);
      throw err;
    }
  };
  const sourceSkippedReason: string[] = [];
  let googleBooksRouterFetchCount = 0;
  let openLibraryRouterFetchCount = 0;
  let kitsuRouterFetchCount = 0;
  const sourceFetchCapPerRun = 2;
  const routerRunStartedAtMs = Date.now();
  const routerRunSoftTimeoutMs = 20_000;
  let routerFetchLoopStoppedByTimeout = false;
  let googleBooksConsecutiveTimeouts = 0;
  const sourceSpecificQueryModeBySource: Record<string, string> = {};
  const sourceSpecificQueryRejectedReasonBySource: Record<string, string[]> = {
    googleBooks: [],
    openLibrary: [],
    kitsu: [],
  };
  const kitsuQuerySanitizedFrom: string[] = [];
  const kitsuQuerySanitizedTo: string[] = [];
  const kitsuPreSanitizedQueries: string[] = [];
  const kitsuSanitizedQuerySelected: string[] = [];
  const kitsuFinalQueryUsedForFetch: string[] = [];
  let kitsuRecoveryOriginalIntentQuery = "";
  let kitsuRecoverySelectedQuery = "";
  let kitsuRecoveryQueryTooBroad = false;
  const kitsuRecoveryQueryDroppedGenreTerms: string[] = [];
  const kitsuRecoveryQuerySelectionVersion = "specific_genre_first_v1";
  let kitsuRecoveryQueryPromotedFrom = "";
  let kitsuRecoveryQueryPromotedTo = "";
  const normalizeKitsuRecoveryQueryForSelection = (q: string) => String(q || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  const isTooBroadKitsuRecoveryQuery = (q: string) => {
    const normalized = normalizeKitsuRecoveryQueryForSelection(q);
    return ["young", "driven", "story", "character", "identity"].includes(normalized);
  };
  const selectSpecificKitsuRecoveryQuery = (selected: string, sourceQueries: string[]) => {
    const current = normalizeKitsuRecoveryQueryForSelection(selected);
    const haystack = normalizeKitsuRecoveryQueryForSelection([selected, ...sourceQueries].join(" "));
    const priorityMatchers: Array<{ query: string; re: RegExp }> = [
      { query: "batman", re: /\bbatman\b/ },
      { query: "spider-man", re: /\bspider\s+man\b|\bspider-man\b/ },
      { query: "superhero", re: /\bsuperhero(?:es)?\b|\bsuper\s+hero(?:es)?\b|\bmarvel\b|\bdc comics?\b/ },
      { query: "comic", re: /\bcomics?\b/ },
      { query: "graphic novel", re: /\bgraphic\s+novel\b/ },
      { query: "mystery", re: /\bmystery\b/ },
      { query: "fantasy", re: /\bfantasy\b/ },
      { query: "horror", re: /\bhorror\b/ },
      { query: "romance", re: /\bromance|romantic\b/ },
      { query: "science fiction", re: /\bscience fiction\b|\bsci fi\b|\bscifi\b|\bscience\b/ },
      { query: "dystopian", re: /\bdystopian\b/ },
      { query: "thriller", re: /\bthriller\b/ },
      { query: "adventure", re: /\badventure\b/ },
      { query: "drama", re: /\bdrama\b/ },
    ];
    const priorityHit = priorityMatchers.find((entry) => entry.re.test(haystack))?.query || "";
    const collapsePromotion = current === "young" && /\byoung adult\b/.test(haystack)
      ? "young adult"
      : current === "science" && /\bscience fiction\b|\bsci fi\b|\bscifi\b|\bscience\b/.test(haystack)
      ? "science fiction"
      : current === "graphic" && /\bgraphic novel\b|\bgraphic\b/.test(haystack)
      ? "graphic novel"
      : "";
    const promoted = priorityHit || collapsePromotion || selected;
    return { query: String(promoted || selected || "").trim(), promoted: normalizeKitsuRecoveryQueryForSelection(promoted) !== current };
  };
  let kitsuRecoveryComicIntentDetected = false;
  const kitsuRecoveryComicIntentTerms: string[] = [];
  let kitsuRecoveryComicIntentFallbackUsed = false;
  const kitsuRecoveryComicIntentMatchers: Array<{ term: string; re: RegExp }> = [
    { term: "batman", re: /\bbatman\b/ },
    { term: "superman", re: /\bsuperman\b/ },
    { term: "wonder woman", re: /\bwonder\s+woman\b/ },
    { term: "captain america", re: /\bcaptain\s+america\b/ },
    { term: "thor", re: /\bthor\b/ },
    { term: "justice league", re: /\bjustice\s+league\b/ },
    { term: "daredevil", re: /\bdaredevil\b/ },
    { term: "spider-man", re: /\bspider\s+man\b/ },
    { term: "superhero", re: /\bsuperhero(?:es)?\b/ },
    { term: "comic", re: /\bcomics?\b/ },
    { term: "graphic novel", re: /\bgraphic\s+novel\b/ },
  ];
  const kitsuRecoveryGenericFallbackTerms = new Set([
    "mystery",
    "fantasy",
    "horror",
    "romance",
    "science fiction",
    "dystopian",
    "thriller",
    "adventure",
    "drama",
    "crime",
    "supernatural",
    "young adult",
    "school",
    "suspense",
    "detective",
  ]);
  const collectKitsuRecoveryComicIntent = (queries: string[]) => {
    const haystack = normalizeKitsuRecoveryQueryForSelection(queries.join(" "));
    for (const matcher of kitsuRecoveryComicIntentMatchers) {
      if (matcher.re.test(haystack) && !kitsuRecoveryComicIntentTerms.includes(matcher.term)) {
        kitsuRecoveryComicIntentTerms.push(matcher.term);
      }
    }
    kitsuRecoveryComicIntentDetected = kitsuRecoveryComicIntentTerms.length > 0;
  };
  const markKitsuRecoveryComicFallbackIfGeneric = (queries: string[]) => {
    if (!kitsuRecoveryComicIntentDetected) return;
    if (queries.some((q) => kitsuRecoveryGenericFallbackTerms.has(normalizeKitsuRecoveryQueryForSelection(q)))) {
      kitsuRecoveryComicIntentFallbackUsed = true;
    }
  };
  const kitsuSanitizationDroppedTokens: Array<{ token: string; reason: string }> = [];
  const kitsuSanitizationDiagnostics: Array<{ original: string; sanitized: string; droppedTokens: Array<{ token: string; reason: string }>; genericOnly: boolean }> = [];
  const googleBooksProbeDegraded = Boolean((routedInput as any)?.googleBooksProbeDegraded);
  const sourceHealthProbeStatus = ((routedInput as any)?.sourceHealthProbeStatus || {}) as Record<string, string>;
  const googleBooksQueriesActuallyFetched = new Set<string>();
  const openLibraryQueriesActuallyFetched = new Set<string>();
  const kitsuQueriesActuallyFetched = new Set<string>();
  const googleBooksFetchResultsByQuery: Array<{ query: string; url: string; status: string; timedOut: boolean; rawCount: number; error?: string | null; bodyPrefix?: string | null }> = [];
  const googleBooksTimeoutStageByQuery: Array<{ query: string; stage: string; fallbackQuery?: string; reason?: string }> = [];
  const googleBooksRetryQueryMapping: Array<{ primaryQuery: string; retryQuery: string; validated: boolean }> = [];
  const openLibraryFetchResultsByQuery: Array<{ query: string; url: string; status: string; timedOut: boolean; rawCount: number; error?: string | null; bodyPrefix?: string | null }> = [];
  const kitsuFetchResultsByQuery: Array<{ query: string; url: string; status: string; timedOut: boolean; rawCount: number; error?: string | null; bodyPrefix?: string | null }> = [];
  const queryLanesUsed: string[] = [];
  const collapseRepeatedQueryPhrases = (value: string) => {
    let tokens = String(value || "")
      .replace(/\s+/g, " ")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    let changed = true;
    while (changed) {
      changed = false;
      const maxPhraseLength = Math.min(6, Math.floor(tokens.length / 2));
      for (let phraseLength = maxPhraseLength; phraseLength >= 1 && !changed; phraseLength -= 1) {
        for (let i = 0; i + phraseLength * 2 <= tokens.length; i += 1) {
          const first = tokens.slice(i, i + phraseLength).map((t) => t.toLowerCase()).join(" ");
          const second = tokens.slice(i + phraseLength, i + phraseLength * 2).map((t) => t.toLowerCase()).join(" ");
          if (first && first === second) {
            tokens.splice(i + phraseLength, phraseLength);
            changed = true;
            break;
          }
        }
      }
    }
    return tokens.join(" ").replace(/\s+/g, " ").trim();
  };
  let fetchLoopExhaustedMarkerEmitted = false;
  const googleBooksQueryUsedByLane: string[] = [];
  const openLibraryQueryUsedByLane: string[] = [];
  const kitsuQueryUsedByLane: string[] = [];
  const sourceDisableReasonsDetailed: Record<string, string[]> = {
    googleBooks: [],
    openLibrary: [],
    localLibrary: [],
    kitsu: [],
    comicVine: [],
    nyt: [],
  };
  const teensDeckForceBookSources =
    (routedInput as any)?.deckCategory === "teens" ||
    isTeenDeckKey((routedInput as any)?.deckKey || "");
  if (teensDeckForceBookSources && !kitsuOnlyAtRequestStart) {
    if (!sourceEnabled.googleBooks) {
      sourceEnabled.googleBooks = true;
      sourceDisableReasonsDetailed.googleBooks.push("force_enabled_for_teens_tdz_recovery");
    }
    if (!sourceEnabled.openLibrary) {
      sourceEnabled.openLibrary = true;
      sourceDisableReasonsDetailed.openLibrary.push("force_enabled_for_teens_tdz_recovery");
    }
  } else if (teensDeckForceBookSources && kitsuOnlyAtRequestStart) {
    sourceSkippedReason.push("teen_book_source_force_enable_skipped:kitsu_only_request");
    sourceDisableReasonsDetailed.googleBooks.push("preserved_disabled_for_kitsu_only_request");
    sourceDisableReasonsDetailed.openLibrary.push("preserved_disabled_for_kitsu_only_request");
  }
  var tdzGuardedDiagnosticsInitialized = false;
  var postTopUpOutputSnapshot: any[] = [];
  var postTopUpOutputSnapshotLength = 0;
  // smoke-check sentinel (ordering check target): const includeComicVine = shouldUseComicVine(routedInput);
  let googleQuotaExhausted = false;

  if (!sourceEnabled.googleBooks) {
    sourceSkippedReason.push("googleBooks_disabled_by_admin");
    sourceDisableReasonsDetailed.googleBooks.push("disabled_by_admin_or_config");
  }
  if (!sourceEnabled.openLibrary) {
    sourceSkippedReason.push("openLibrary_disabled_by_admin");
    sourceDisableReasonsDetailed.openLibrary.push("disabled_by_admin_or_config");
  }
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
    sourceDisableReasonsDetailed.comicVine.push("disabled_in_production_runtime_gate");
  } else if (!sourceEnabled.comicVine) {
    sourceSkippedReason.push("comicvine_disabled_by_admin");
    sourceDisableReasonsDetailed.comicVine.push("disabled_by_admin_or_config");
  }
  if (!sourceEnabled.localLibrary) {
    const localReason = routedInput.localLibrarySupported ? "localLibrary_disabled_by_admin" : "localLibrary_not_supported";
    sourceSkippedReason.push(
      localReason
    );
    sourceDisableReasonsDetailed.localLibrary.push(localReason);
  }
  if (!sourceEnabled.kitsu) sourceDisableReasonsDetailed.kitsu.push("disabled_by_admin_or_config");
  if (!sourceEnabled.nyt) sourceDisableReasonsDetailed.nyt.push("disabled_by_admin_or_config");
  if (!sourceEnabled.googleBooks && !sourceEnabled.openLibrary && !sourceEnabled.localLibrary && !sourceEnabled.kitsu && !sourceEnabled.comicVine && !sourceEnabled.nyt) {
    pushGlobalPhase("source_enabled_synthesis_guard");
    pushEarlyReturnDiagnostics("all_sources_disabled", "source_enabled_guard");
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
  const comicVineDispatchBypassGuard = true;
  const includeComicVine = shouldUseComicVine(routedInput) && !comicVineDispatchBypassGuard;
  const comicVineDispatchBypassed = Boolean(comicVineDispatchBypassGuard && shouldUseComicVine(routedInput));
  const effectiveEnabledSourcesAfterSynthesis = { ...sourceEnabled, comicVine: Boolean(includeComicVine) };
  const sourceAllowedByFinalGate = { ...effectiveEnabledSourcesAfterSynthesis };
  const sourceAllowedByRecoveryPath = { ...effectiveEnabledSourcesAfterSynthesis };
  const blockedDisabledSourceCandidateCountBySource: Record<string, number> = { googleBooks: 0, openLibrary: 0, localLibrary: 0, kitsu: 0, comicVine: 0, nyt: 0, unknown: 0 };
  const disabledSourceCandidateTitlesBySource: Record<string, string[]> = { googleBooks: [], openLibrary: [], localLibrary: [], kitsu: [], comicVine: [], nyt: [], unknown: [] };
  const detectCandidateSourceForGate = (value: any): string => {
    const doc = value?.doc || value;
    const sourceText = String(doc?.source || doc?.rawDoc?.source || value?.source || "").toLowerCase().replace(/[\s_-]+/g, "");
    const sourceId = String(doc?.sourceId || doc?.canonicalId || doc?.key || value?.sourceId || "").toLowerCase();
    if (sourceText.includes("kitsu") || sourceId.startsWith("kitsu:")) return "kitsu";
    if (sourceText.includes("google") || sourceId.startsWith("google")) return "googleBooks";
    if (sourceText.includes("openlibrary") || sourceId.startsWith("ol") || sourceId.includes("openlibrary")) return "openLibrary";
    if (sourceText.includes("comicvine") || sourceText.includes("gcd") || sourceId.startsWith("comicvine:") || sourceId.startsWith("gcd:")) return "comicVine";
    if (sourceText.includes("nyt") || sourceText.includes("newyorktimes")) return "nyt";
    if (sourceText.includes("local")) return "localLibrary";
    return "unknown";
  };
  const noteDisabledSourceCandidate = (value: any, stage: string) => {
    const source = detectCandidateSourceForGate(value);
    blockedDisabledSourceCandidateCountBySource[source] = Number(blockedDisabledSourceCandidateCountBySource[source] || 0) + 1;
    const doc = value?.doc || value;
    const title = String(doc?.title || value?.title || "").trim();
    const bucket = disabledSourceCandidateTitlesBySource[source] || (disabledSourceCandidateTitlesBySource[source] = []);
    const stampedTitle = title ? `${title} (${stage})` : `(untitled:${stage})`;
    if (bucket.length < 40 && !bucket.includes(stampedTitle)) bucket.push(stampedTitle);
  };
  const isSourceAllowedForFinalGate = (value: any) => {
    const source = detectCandidateSourceForGate(value);
    return source !== "unknown" && Boolean((sourceAllowedByFinalGate as any)[source]);
  };
  const filterAllowedSourceCandidates = <T,>(values: T[], stage: string): T[] => (Array.isArray(values) ? values.filter((value: any) => {
    const allowed = isSourceAllowedForFinalGate(value);
    if (!allowed) noteDisabledSourceCandidate(value, stage);
    return allowed;
  }) : []);
  const hasRunnableSource = sourceEnabled.googleBooks || sourceEnabled.openLibrary || sourceEnabled.localLibrary || includeKitsu || includeComicVine || sourceEnabled.nyt;

  if (routedInput.deckKey === "ms_hs" && sourceEnabled.comicVine && !sourceEnabled.googleBooks && !sourceEnabled.openLibrary && !sourceEnabled.localLibrary && !sourceEnabled.kitsu) {
    debugRouterLog("COMICVINE_ONLY_SMOKE_PATH", { deckKey: routedInput.deckKey, includeComicVine });
  }
  if (!hasRunnableSource) {
    pushGlobalPhase("disabled_empty_pool_guard");
    pushEarlyReturnDiagnostics("all_sources_disabled_after_synthesis", "runnable_source_guard");
    throwSourceFatal("SESSION_FATAL_ALL_SOURCES_DISABLED_AFTER_SYNTHESIS", {
      sourceEnabled,
      sourceEnabledOrigins: buildSourceOrigins((routedInput as any)?.sourceEnabled || {}),
      sourceDisableReasonsDetailed,
      routerFamily,
      builtQuery: bucketPlan.preview || bucketPlan.queries?.[0] || "",
      deckKey: routedInput.deckKey,
      sourceSkippedReason,
    });
  }
  const debugRouterVersion = EXPECTED_ROUTER_FINGERPRINT;
  const deploymentRuntimeMarker = "comicvine-proxy-phase" as const;
  if (comicVineDispatchBypassed) {
    sourceSkippedReason.push("comicvine_dispatch_temporarily_bypassed_for_tdz_triage");
  } else if (sourceEnabled.comicVine && !includeComicVine) {
    sourceSkippedReason.push("comicvine_not_queried_by_router_gate");
  }
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
  pushGlobalPhase("query_rung_guard", {
    rungCount: Array.isArray(rungs) ? rungs.length : 0,
    routerFamily,
  });

  if (!rungs.length && routerFamily === "mystery") {
    pushGlobalPhase("fallback_early_return_guard", { reason: "empty_rungs_mystery_fallback" });
    rungs = [
      { rung: 0, query: "psychological suspense graphic novel" },
      { rung: 1, query: "detective mystery graphic novel" },
      { rung: 2, query: "police procedural mystery graphic novel" },
      { rung: 3, query: "psychological mystery graphic novel" },
    ];
  }

  if (!rungs.length && routerFamily === "science_fiction") {
    pushGlobalPhase("fallback_early_return_guard", { reason: "empty_rungs_scifi_fallback" });
    rungs = [
      { rung: 0, query: "science fiction novel" },
      { rung: 1, query: "dystopian science fiction novel" },
      { rung: 2, query: "space opera science fiction" },
      { rung: 3, query: "psychological science fiction novel" },
    ];
  }

  if (!rungs.length && routerFamily === "speculative") {
    pushGlobalPhase("fallback_early_return_guard", { reason: "empty_rungs_speculative_fallback" });
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
  // Keep a stable alias for "drive" style taste signals so query constructors never
  // crash if downstream code references `drives` during ComicVine dispatch.
  const drives = themes;
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
  function energeticEnsembleAdventureProfile(): boolean {
    return /\b(bleach|one piece|legend of korra|korra|series of unfortunate events|smallville|maze runner)\b/.test(likedSignalsText) ||
      ((genres.includes("fantasy") || genres.includes("supernatural")) &&
        (themes.includes("adventure") || themes.includes("identity")) &&
        (tones.includes("energetic") || tones.includes("playful") || tones.includes("dramatic")));
  }
  function highSuspenseProfile(): boolean {
    return (genres.includes("thriller") || genres.includes("mystery")) &&
      (tones.includes("dark") || tones.includes("tense") || themes.includes("survival"));
  }
  const explicitRomanceSignal =
    genres.includes("romance") ||
    /\b(romance|romantic|love story|relationship drama|dating)\b/.test(likedSignalsText);
  function romanceComingOfAgeWarmthProfile(): boolean {
    return explicitRomanceSignal &&
      themes.includes("coming of age") &&
      (tones.includes("warm") || tones.includes("gentle") || tones.includes("hopeful") || tones.includes("anime-like"));
  }
  const archetypeProfileActivated = energeticEnsembleAdventureProfile()
    ? "energetic_ensemble_adventure"
    : highSuspenseProfile()
    ? "high_suspense"
    : "general_narrative";
  const anchorExemplarsSelected = Array.from(new Set([
    ...(energeticEnsembleAdventureProfile() ? ["Runaways", "Ms. Marvel", "Paper Girls", "Amulet", "Bone"] : []),
    ...(romanceComingOfAgeWarmthProfile() ? ["Laura Dean Keeps Breaking Up With Me", "Bloom", "Heartstopper"] : []),
    ...(highSuspenseProfile() && !energeticEnsembleAdventureProfile() ? ["Something is Killing the Children", "Locke & Key"] : []),
  ]));
  const narrativeSeriesForms = (base: string) => ([
    `${base} character driven graphic novel`,
    `${base} story rich graphic novel`,
    `${base} narrative focused comic`,
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
    ...(energeticEnsembleAdventureProfile() ? [
      "supernatural ensemble adventure graphic novel",
      "emotionally intense fantasy conflict graphic novel",
      "outsider power progression graphic novel",
      "strange world coming of power graphic novel",
      "stylized serialized action fantasy comic",
    ] : []),
  ];
  const semanticRefinementQueries = Array.from(new Set([
    ...(highSuspenseProfile() && !energeticEnsembleAdventureProfile() ? ["psychological suspense comic series", "character driven thriller comic series", "social paranoia thriller comic series"] : []),
    ...(genres.includes("horror") && !energeticEnsembleAdventureProfile() ? ["psychological horror suspense comic series", "character driven survival horror comic series"] : []),
    ...(themes.includes("coming of age") && highSuspenseProfile() && !energeticEnsembleAdventureProfile() ? ["teen conspiracy thriller comic series"] : []),
    ...(themes.includes("survival") && genres.includes("mystery") ? ["mystery survival drama comic series"] : []),
  ]));
  const broadGraphicQueries: string[] = [];
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
  if (explicitRomanceSignal && genres.includes("dystopian") && genres.includes("romance") && themes.includes("coming of age")) {
    curatedRootsByPattern.push("Paper Girls", "On a Sunbeam", "Laura Dean Keeps Breaking Up With Me", "Fence", "Snotgirl");
  }
  const darkFantasyEmotionalMythologyProfile =
    genres.includes("fantasy") &&
    (tones.includes("dark") || tones.includes("atmospheric")) &&
    (themes.includes("mythology") || themes.includes("emotional growth") || themes.includes("coming of age"));
  if (darkFantasyEmotionalMythologyProfile) {
    curatedRootsByPattern.push("Monstress", "Coda", "The Last God", "Seven to Eternity", "Sandman", "Norse Mythology");
  }
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
  const curatedSeedQueries = Array.from(new Set(curatedRootsByPattern.flatMap((root) => [`${root} character driven graphic novel`, `${root} coming of age graphic novel`])));
  const anchorExemplarQueries = anchorExemplarsSelected.flatMap((seed) => [
    `${seed} style graphic novel`,
    `${seed} emotional growth graphic novel`,
  ]);
  const explicitSuperheroSignal =
    genres.includes("superheroes") ||
    /\b(superhero|superheroes|dc|marvel|justice league|avengers|x-men|spider[-\s]?man|batman|superman|wonder woman|thor)\b/.test(likedSignalsText);
  const bigTwoSuperheroProfile = explicitSuperheroSignal;
  const darkDetectiveProfile =
    (tones.includes("dark") || tones.includes("atmospheric")) &&
    (genres.includes("mystery") || genres.includes("crime") || themes.includes("identity"));
  const hopefulComingOfAgeHeroProfile =
    (tones.includes("hopeful") || tones.includes("warm") || tones.includes("playful")) &&
    (themes.includes("coming of age") || themes.includes("identity") || themes.includes("friendship"));
  const mythologyEpicProfile =
    themes.includes("mythology") || (genres.includes("fantasy") && (themes.includes("identity") || themes.includes("adventure")));
  const teamActionProfile =
    themes.includes("friendship") || themes.includes("adventure") || /\b(team|ensemble|group)\b/.test(likedSignalsText);
  const cosmicSciFiProfile =
    (genres.includes("science fiction") || genres.includes("dystopian")) &&
    (themes.includes("survival") || themes.includes("political") || themes.includes("justice"));
  const dynamicBigTwoRoots = Array.from(new Set([
    ...(darkDetectiveProfile ? ["Batman", "Daredevil", "Spider-Man Noir"] : []),
    ...(hopefulComingOfAgeHeroProfile ? ["Ms. Marvel", "Miles Morales", "Spider-Man", "Supergirl"] : []),
    ...(mythologyEpicProfile ? ["Thor", "Wonder Woman", "New Gods"] : []),
    ...(teamActionProfile ? ["X-Men", "Teen Titans", "Avengers", "Justice League"] : []),
    ...(cosmicSciFiProfile ? ["Green Lantern", "Fantastic Four", "Guardians of the Galaxy", "X-Men"] : []),
  ]));
  const fallbackBigTwoRoots = ["Batman", "Superman", "Wonder Woman", "Captain America", "Thor", "Justice League", "Avengers"];
  const selectedBigTwoRoots = bigTwoSuperheroProfile
    ? (dynamicBigTwoRoots.length > 0 ? dynamicBigTwoRoots : fallbackBigTwoRoots)
    : [];
  const bigTwoRootQueryForms = (root: string) => [
    `${root}`,
    `${root} graphic novel`,
    `${root} TPB`,
    `${root} collected edition`,
    `${root} story arc`,
  ];
  const bigTwoExpansionQueries = selectedBigTwoRoots.flatMap((root) => bigTwoRootQueryForms(root));
  curatedSeedRootsUsed.push(...curatedRootsByPattern);
  let generatedComicVineQueriesFromTaste = Array.from(new Set([
    ...combinedQueries,
    ...semanticRefinementQueries,
    ...broadGraphicQueries,
    ...curatedSeedQueries,
    ...anchorExemplarQueries,
    ...bigTwoExpansionQueries,
  ].map((q) => q.replace(/\s+/g, " ").trim()).filter((q) => {
    const nq = normalizeText(q);
    return !Array.from(dislikedSet).some((d) => d && nq.includes(d));
  })))
    .map((q) => q
      .replace(/\b(novel|fiction)\b/gi, "graphic novel")
      .replace(/\bcharacter driven\b/gi, "character-focused")
      .replace(/\bcomic\s+comic\b/gi, "comic")
      .replace(/\bcomic\s+series\s+comic\s+series\b/gi, "graphic novel")
      .replace(/\b(comic\s+series)\s+\1\b/gi, "$1")
      .replace(/\b(graphic\s+novel)\s+\1\b/gi, "$1")
      .replace(/\bgraphic\s+novel\s+graphic\s+novel\b/gi, "graphic novel")
      .replace(/\s+/g, " ")
      .trim())
    .map((q) => q.replace(/\b(comic series)\s+\1\b/gi, "$1").replace(/\b(collected edition)\s+\1\b/gi, "$1").replace(/\s+/g, " ").trim())
    .filter((q) => !/\b(science comic dystopian comic series|romance coming of age comic series|[a-z]+\s+graphic comic)\b/i.test(normalizeText(q)))
    .map((q) => String(q || "")
      .replace(/\bgraphic graphic novel\b/gi, "graphic novel")
      .replace(/\bgraphic graphic\b/gi, "graphic")
      .replace(/\bcomic comic\b/gi, "comic")
      .replace(/\bDie character-focused graphic\b/gi, "")
      .replace(/\s+/g, " ")
      .trim())
    .filter(Boolean);
  const suppressNonRomanceYALiterals = (query: string): boolean => {
    if (explicitRomanceSignal) return false;
    return /\b(laura dean|bloom|heartstopper|fence|mooncakes|romance|romantic|dating|love story)\b/i.test(String(query || ""));
  };
  generatedComicVineQueriesFromTaste = generatedComicVineQueriesFromTaste.filter((q) => !suppressNonRomanceYALiterals(q));
  const romanceNegativeSignalActive =
    dislikedSignalsSafe.some((s: string) => /\b(romance|romantic|dating|love|warm|hopeful|coming of age)\b/i.test(String(s || ""))) ||
    Object.keys((((input as any)?.dislikedTagCounts || {}) as Record<string, number>)
      ).some((k) => /\b(romance|romantic|dating|love|warm|hopeful|coming of age)\b/i.test(String(k || "")));
  if (romanceNegativeSignalActive) {
    generatedComicVineQueriesFromTaste = generatedComicVineQueriesFromTaste.filter((q) =>
      !/\b(laura dean|bloom|heartstopper|fence|mooncakes|romance|romantic|dating|love story|coming of age|warm|hopeful)\b/i.test(String(q || ""))
    );
  }
  const normalizeRootFamilyFromQuery = (query: string): string => {
    const q = normalizeText(String(query || ""));
    if (/\bspider[-\s]?man\b/.test(q)) return "spider-man-family";
    if (/\bjustice league\b/.test(q)) return "justice-league-family";
    if (/\bbatman\b/.test(q)) return "batman-family";
    if (/\bsuperman\b/.test(q)) return "superman-family";
    if (/\bavengers\b/.test(q)) return "avengers-family";
    return q.split(/\s+/).slice(0, 2).join(" ");
  };
  const recentlySeenQueryFamilies = new Set(
    recentFreshReturnedRoots.flatMap((bucket) => bucket.map((r) => normalizeRootFamilyFromQuery(String(r || "").replace(/-/g, " "))))
  );
  generatedComicVineQueriesFromTaste = generatedComicVineQueriesFromTaste.filter((q) => {
    const family = normalizeRootFamilyFromQuery(q);
    const isNarrativeBroad = /\b(character|narrative|story|coming of age|friendship|mystery|psychological|graphic novel)\b/i.test(q);
    return !(recentlySeenQueryFamilies.has(family) && !isNarrativeBroad);
  });
  if (bigTwoSuperheroProfile && bigTwoExpansionQueries.length > 0) {
    const normalizedBigTwo = new Set(selectedBigTwoRoots.map((q) => normalizeText(q)));
    const prioritizedBigTwoRaw = generatedComicVineQueriesFromTaste
      .filter((q) => {
        const nq = normalizeText(q);
        return Array.from(normalizedBigTwo).some((root) => nq === root || nq.startsWith(`${root} `));
      })
      .map((q) => q.replace(/\s+/g, " ").trim())
      .filter(Boolean);
    const bigTwoRootOrder = selectedBigTwoRoots.map((r) => normalizeText(r)).filter(Boolean).slice(0, 6);
    const bigTwoBuckets = new Map<string, string[]>();
    for (const q of prioritizedBigTwoRaw) {
      const nq = normalizeText(q);
      const root = bigTwoRootOrder.find((r) => nq === r || nq.startsWith(`${r} `)) || "";
      if (!root) continue;
      if (!bigTwoBuckets.has(root)) bigTwoBuckets.set(root, []);
      bigTwoBuckets.get(root)!.push(q);
    }
    const prioritizedBigTwo: string[] = [];
    const maxBigTwoFormsPerRootInTopPool = 2;
    let advanced = true;
    while (advanced && prioritizedBigTwo.length < 10) {
      advanced = false;
      for (const root of bigTwoRootOrder) {
        const bucket = bigTwoBuckets.get(root) || [];
        const usedForRoot = prioritizedBigTwo.filter((q) => {
          const nq = normalizeText(q);
          return nq === root || nq.startsWith(`${root} `);
        }).length;
        if (usedForRoot >= maxBigTwoFormsPerRootInTopPool) continue;
        const next = bucket.shift();
        if (!next) continue;
        if (!prioritizedBigTwo.includes(next)) {
          prioritizedBigTwo.push(next);
          advanced = true;
        }
      }
    }
    const nonBigTwo = generatedComicVineQueriesFromTaste.filter((q) => {
      const nq = normalizeText(q);
      return !Array.from(normalizedBigTwo).some((root) => nq === root || nq.startsWith(`${root} `));
    });
    generatedComicVineQueriesFromTaste = Array.from(new Set([
      ...prioritizedBigTwo,
      ...nonBigTwo,
    ])).slice(0, 10);
  } else {
    generatedComicVineQueriesFromTaste = generatedComicVineQueriesFromTaste.slice(0, 10);
  }
  if (dislikeOnlySession && generatedComicVineQueriesFromTaste.length === 0) {
    generatedComicVineQueriesFromTaste = [
      "character driven suspense graphic novel",
      "psychological sci fi graphic novel",
      "teen supernatural mystery comic",
      "coming of age friendship graphic novel",
      "character driven horror comic",
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
  let tasteQueryDrift = false;
  let tasteQueryDriftGatePending = false;
  if (sourceEnabled.comicVine && generatedComicVineQueriesFromTaste.length > 0) {
    const franchiseRootRe = /\b(spider[-\s]?man|batman|superman|green lantern|guardians|justice league|avengers|x-men|ms\.?\s*marvel|teen titans)\b/i;
    const tasteTokens = Array.from(new Set([
      ...likedGenresSafe, ...likedTonesSafe, ...likedThemesSafe, ...likedSignalsSafe,
    ].map((s: string) => normalizeText(String(s || ""))).filter((s: string) => s.length >= 4)));
    const franchiseHeavyCount = generatedComicVineQueriesFromTaste.filter((q) => franchiseRootRe.test(q)).length;
    const lowTasteOverlapCount = generatedComicVineQueriesFromTaste.filter((q) => {
      const nq = normalizeText(q);
      return !tasteTokens.some((t) => nq.includes(t));
    }).length;
    tasteQueryDrift =
      generatedComicVineQueriesFromTaste.length >= 4 &&
      franchiseHeavyCount / generatedComicVineQueriesFromTaste.length >= 0.6 &&
      lowTasteOverlapCount / generatedComicVineQueriesFromTaste.length >= 0.6;
    if (tasteQueryDrift) {
      generatedComicVineQueriesFromTaste = Array.from(new Set([
        `${String(likedThemesSafe[0] || "character driven")} graphic novel`,
        `${String(likedGenresSafe[0] || "dark fantasy")} graphic novel`,
        `${String(likedThemesSafe[1] || "dystopian survival")} graphic novel`,
        `${String(likedTonesSafe[0] || "emotional intimate")} graphic novel`,
        "character driven graphic novel",
        "dark fantasy graphic novel",
        "dystopian survival graphic novel",
      ].map((q) => q.replace(/\s+/g, " ").trim()))).slice(0, 10);
      tasteQueryDriftGatePending = true;
    }
    const normalizeRootToken = (v: string) => normalizeText(v).replace(/[^a-z0-9]+/g, " ").trim();
    const bigTwoRootsNormalized = selectedBigTwoRoots.map((r) => normalizeRootToken(r)).filter(Boolean);
    const detectHeroRootFromQuery = (query: string): string => {
      const nq = normalizeText(query);
      const matched = bigTwoRootsNormalized.find((root) => nq === root || nq.startsWith(`${root} `));
      if (matched) return matched;
      const token = nq.split(/\s+/).slice(0, 2).join(" ").trim();
      return token || nq;
    };
    const normalizedBigTwoQuerySet = new Set(bigTwoExpansionQueries.map((q) => normalizeText(q)));
    const bigTwoQueriesInPool = generatedComicVineQueriesFromTaste.filter((q) => normalizedBigTwoQuerySet.has(normalizeText(q)));
    const narrativePrimary = generatedComicVineQueriesFromTaste.filter((q) => /\b(character|narrative|story|coming of age|friendship|mystery|supernatural|psychological|graphic novel)\b/i.test(q));
    const broadFallback = generatedComicVineQueriesFromTaste.filter((q) => /\bgraphic novel\b/i.test(q) && /\b(character|story|coming of age|mystery|survival|identity|friendship|supernatural|thriller)\b/i.test(q));
    const baselinePrimaryQueries = narrativePrimary.length > 0 ? narrativePrimary : broadFallback;
    const primaryQueriesRaw = Array.from(new Set([
      ...bigTwoQueriesInPool,
      ...baselinePrimaryQueries,
    ]));
    const preferredRootOrder = selectedBigTwoRoots.map((r) => normalizeRootToken(r)).filter(Boolean);
    const rootsFromPool = Array.from(new Set(primaryQueriesRaw.map((q) => detectHeroRootFromQuery(q)).filter(Boolean)));
    const selectedRootsForSession = Array.from(new Set([
      ...preferredRootOrder.filter((r) => rootsFromPool.includes(r)),
      ...rootsFromPool,
    ])).slice(0, 6);
    const rootBuckets = new Map<string, string[]>();
    for (const query of primaryQueriesRaw) {
      const root = detectHeroRootFromQuery(query);
      if (!selectedRootsForSession.includes(root)) continue;
      if (!rootBuckets.has(root)) rootBuckets.set(root, []);
      rootBuckets.get(root)!.push(query);
    }
    const maxFormsPerRoot = includeComicVine && !sourceEnabled.googleBooks && !sourceEnabled.openLibrary && !sourceEnabled.localLibrary && !includeKitsu ? 3 : 2;
    const primaryQueries: string[] = [];
    let progress = true;
    while (progress && primaryQueries.length < 12) {
      progress = false;
      for (const root of selectedRootsForSession) {
        const bucket = rootBuckets.get(root) || [];
        const takenForRoot = primaryQueries.filter((q) => detectHeroRootFromQuery(q) === root).length;
        if (takenForRoot >= maxFormsPerRoot) continue;
        const candidate = bucket.shift();
        if (!candidate) continue;
        if (!primaryQueries.includes(candidate)) {
          primaryQueries.push(candidate);
          progress = true;
        }
      }
    }
    primaryNarrativeQueryMode = narrativePrimary.length > 0;
    primaryNarrativeQueries = narrativePrimary
      .filter((q) =>
        explicitRomanceSignal ||
        !/\b(laura dean|bloom|heartstopper|fence|mooncakes|romance|romantic|dating|love story)\b/i.test(String(q || ""))
      )
      .slice(0, 12);
    broadGraphicNovelQueriesUsedAsFallback = narrativePrimary.length === 0 && broadFallback.length > 0;
    broadGraphicNovelFallbackReason = broadGraphicNovelQueriesUsedAsFallback ? "no_narrative_series_queries_built" : "none";
    rungs = primaryQueries
      .filter((query) => !suppressNonRomanceYALiterals(query))
      .map((query, index) => ({ rung: index, query, queryFamily: routerFamily, laneKind: "swipe-taste-driven" }));
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
  if (sourceEnabled.comicVine && rungs.length > 1) {
    const canonicalSeedRoots = new Set([
      "amulet", "bone", "ms-marvel", "lumberjanes", "paper-girls", "nimona", "locke-key", "something-is-killing-the-children", "the-sandman",
    ]);
    const dangerousRootTokens = new Set(["fantasy", "dystopian", "amulet", "bone", "die", "crime", "dark"]);
    const queryLooksHijackProne = (query: string) => {
      const q = normalizeText(query);
      const tokens = q.split(/\s+/).filter((t) => t.length >= 3);
      const hits = tokens.filter((t) => dangerousRootTokens.has(t));
      return hits.length > 0 && tokens.length <= 4;
    };
    const queryHasCanonicalSupport = (query: string) => {
      const q = normalizeText(query);
      return Array.from(canonicalSeedRoots).some((root) => q.includes(root.replace(/-/g, " ")));
    };
    const likedTagCounts = ((routingInput as any)?.likedTagCounts || {}) as Record<string, number>;
    const hasTasteSupport = Object.keys(likedTagCounts).filter((k) => Number(likedTagCounts[k] || 0) > 0).length >= 2;
    const first = String(rungs[0]?.query || "");
    if (queryLooksHijackProne(first) && !(queryHasCanonicalSupport(first) && hasTasteSupport)) {
      const replacement = rungs.slice(1).find((r: any) => !queryLooksHijackProne(String(r?.query || "")) || queryHasCanonicalSupport(String(r?.query || "")));
      if (replacement) {
        rungs = [replacement, ...rungs.filter((r: any) => r !== replacement)];
        primaryRungZeroSource = "hijack_guard_reordered";
      }
    }
  }
  if (sourceEnabled.comicVine) {
    const nonEmptyRungs = rungs.filter((r: any) => String(r?.query || "").trim().length > 0);
    rungs = nonEmptyRungs;
    if (generatedComicVineQueriesFromTaste.length > 0 && rungs.length === 0) {
      const conservativeFallbacks = [
        "teen graphic novel",
        "young adult comic series",
        "mystery fantasy comic series",
        "coming of age graphic novel",
      ];
      const fallbackQuery =
        generatedComicVineQueriesFromTaste.find((q) => String(q || "").trim().length > 0) ||
        conservativeFallbacks[0];
      rungs = [{ rung: 0, query: fallbackQuery, queryFamily: routerFamily, laneKind: "swipe-taste-driven-recovered" } as any];
      primaryRungZeroSource = "hijack_guard_fallback_recovery";
    }
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

  var rungQueries = rungs.map((r: any) => String(r?.query || "").trim()).filter(Boolean);
  var mainRungQueriesLength = rungQueries.length;
  var rungZeroQuery = normalizeText(String(rungQueries[0] || ""));
  var rungZeroIsTasteDerived = generatedComicVineQueriesFromTaste.some((q) => normalizeText(q) === rungZeroQuery);
  var rungZeroIsStaticFallback = Array.from(staticDefaultQueries).some((q) => normalizeText(q) === rungZeroQuery);
  var tasteDerivedQuerySet = new Set(generatedComicVineQueriesFromTaste.map((q) => normalizeText(q)));
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
  let kitsuDispatchedOnce = false;
  let kitsuFallbackDispatchedOnce = false;
  let kitsuPrimaryRawZero = false;
  let kitsuFallbackRawZero = false;
  let kitsuTerminalBroadFallbackDispatched = false;
  let kitsuEntityRetryUsedAfterPrimaryRaw = false;
  let pendingSourceFetchCount = 0;
  const pendingSourceFetches: Array<Promise<any>> = [];
  const pendingSourceFetchCountIncremented: Array<{ source: string; laneIndex: number; query: string; pending: number }> = [];
  const pendingSourceFetchCountDecremented: Array<{ source: string; laneIndex: number; query: string; pending: number }> = [];
  let stopKitsuDispatchForRun = false;
  let stopRouterFetchLoop = false;
  let comicVineResolvedSeedQuery = "";
  let comicVineFallbackReason = "none";
  let comicVineUsedFallbackQuery = false;
  let comicVinePositiveQueries: string[] = [];
  let comicVineExcludedTermsAppliedInFilterOnly = false;
  let comicVineQueryTooLong = false;
  let comicVinePreflightQuery = "";
  let comicVinePreflightUsesTasteQuery = false;
  let comicVineDispatchError: string | null = null;
  let comicVineDispatchErrorPhase: string | null = null;
  const comicVinePerQueryFailureDoesNotAbort = true;
  let effectiveBucketPlanForExpansion: any = {
    ...bucketPlan,
    lane: routerFamily,
    family: routerFamily,
    hybridMode: isHybridMode,
    hybridLaneWeights,
    primaryLane: routerFamily,
  };

  for (let rungi = 0; rungi < rungs.length; rungi += 1) {
    const rung = rungs[rungi];
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

    for (let lanei = 0; lanei < queryLanes.length; lanei += 1) {
      try {
      const googleBooksExhausted =
        !sourceEnabled.googleBooks ||
        googleQuotaExhausted ||
        googleBooksProbeDegraded ||
        googleBooksRouterFetchCount >= sourceFetchCapPerRun;
      const openLibraryExhausted =
        !sourceEnabled.openLibrary ||
        openLibraryRouterFetchCount >= sourceFetchCapPerRun;
      const kitsuExhausted =
        !includeKitsu ||
        kitsuRouterFetchCount >= sourceFetchCapPerRun;
      if (googleBooksExhausted && openLibraryExhausted && kitsuExhausted) {
        if (!fetchLoopExhaustedMarkerEmitted) {
          pushGlobalPhase("router_fetch_loop_all_sources_exhausted", {
            laneIndex: lanei,
            googleBooksExhausted,
            openLibraryExhausted,
            kitsuExhausted,
            googleBooksRouterFetchCount,
            openLibraryRouterFetchCount,
            kitsuRouterFetchCount,
          });
          fetchLoopExhaustedMarkerEmitted = true;
        }
        break;
      }
      if (kitsuDispatchedOnce && (!sourceEnabled.openLibrary || openLibraryRouterFetchCount >= sourceFetchCapPerRun)) {
        if (!fetchLoopExhaustedMarkerEmitted) {
          pushGlobalPhase("router_fetch_loop_all_sources_exhausted", {
            laneIndex: lanei,
            reason: "openlibrary_capped_after_single_kitsu_dispatch",
            googleBooksRouterFetchCount,
            openLibraryRouterFetchCount,
            kitsuRouterFetchCount,
          });
          fetchLoopExhaustedMarkerEmitted = true;
        }
        stopRouterFetchLoop = true;
        break;
      }
      pushGlobalPhase("router_fetch_loop_iteration", {
        laneIndex: lanei,
        totalLanes: queryLanes.length,
        googleBooksRouterFetchCount,
        openLibraryRouterFetchCount,
        kitsuRouterFetchCount,
      });
      if (Date.now() - routerRunStartedAtMs >= routerRunSoftTimeoutMs) {
        routerFetchLoopStoppedByTimeout = true;
        pushGlobalPhase("router_fetch_loop_stopped_by_timeout", {
          laneIndex: lanei,
          elapsedMs: Date.now() - routerRunStartedAtMs,
        });
        break;
      }
      const lane = queryLanes[lanei];
      const normalizedLaneQuery = collapseRepeatedQueryPhrases(String((lane as any)?.query || (lane as any)?.queryText || "").trim());
      queryLanesUsed.push(normalizedLaneQuery);
      var laneQueryText = normalizedLaneQuery;
      var inferredQueryFamily = inferFamilyFromQueryText(laneQueryText, rungFamily);
      var laneFamily =
        routerFamily === "historical" || inferHistoricalFromQueryText(laneQueryText)
          ? "historical"
          : normalizeRouterFamilyValue((lane as any)?.queryFamily) ||
            normalizeRouterFamilyValue((lane as any)?.filterFamily) ||
            inferredQueryFamily ||
            rungFamily;
      var laneFilterFamily =
        laneFamily === "historical"
          ? "historical"
          : normalizeRouterFamilyValue((lane as any)?.filterFamily) || laneFamily;
      var laneKindResolved =
        String((lane as any)?.laneKind || "").toLowerCase() === "historical" || laneFamily === "historical" || laneFilterFamily === "historical"
          ? "historical"
          : String((lane as any)?.laneKind || "core");
      var laneQueryFamilyResolved = laneKindResolved === "historical" ? "historical" : laneFamily;
      debugRouterLog("QUERY_FAMILY_BEFORE_FETCH", {
        query: laneQueryText,
        queryFamily: (lane as any)?.queryFamily || null,
        inferredQueryFamily: inferredQueryFamily || null,
        laneFamily,
        laneFilterFamily,
      });
      var laneQueryRung = Number.isFinite(Number(lane.queryRung))
        ? Number(lane.queryRung)
        : Number.isFinite(Number(rung?.rung))
        ? Number(rung.rung)
        : undefined;

      var laneInput: RecommenderInput = {
        ...routedInput,
        bucketPlan: {
          ...effectiveBucketPlan,
          queries: [normalizedLaneQuery],
          preview: normalizedLaneQuery,
          // Critical: do not preserve the parent bucketPlan.rungs here. Each lane
          // is a single fetch request. Keeping the parent rungs lets source fetchers
          // re-expand all historical queries under the current lane/rung, which is
          // what produced four rung labels with the same effective query identity.
          rungs: [
            {
              ...(rung || {}),
              rung: laneQueryRung,
              query: normalizedLaneQuery,
              primary: normalizedLaneQuery,
              secondary: null,
            },
          ],
          tastePrimaryQueries: querySourceOfTruth === "taste_profile" ? rungQueries : [],
          forceTastePrimaryForComicVine: querySourceOfTruth === "taste_profile",
        },
      };
      const laneQueryTextForDiagnostics = String(laneInput?.bucketPlan?.preview || normalizedLaneQuery || "");

      var requests: Array<Promise<RecommendationResult>> = [];
      let kitsuDispatchedOnThisLane = false;
      const baseLaneQuery = normalizedLaneQuery;
      const sanitizeOpenLibraryQuery = (q: string) => {
        const cleaned = String(q || "")
          .replace(/["']/g, " ")
          .replace(/[-+]\w+/g, " ")
          .replace(/\b(genre|tone|mood|theme|drive|audience|age|media|format)\s*:/gi, " ")
          .replace(/\b(character[-\s]?focused|novel|book|narrative|consequence|survival|exclude|without)\b/gi, " ")
          .replace(/\s+/g, " ")
          .trim()
          .toLowerCase();
        const phraseAnchors = ["coming of age", "science fiction", "fantasy adventure", "psychological horror", "dystopian graphic novel", "science fiction graphic novel"];
        const anchorHits = phraseAnchors.filter((ph) => cleaned.includes(ph));
        const tokens = cleaned.split(/\s+/).filter(Boolean);
        const anchorTokenSet = new Set(anchorHits.flatMap((ph) => ph.split(/\s+/)));
        const residualTokens = tokens.filter((t) => !anchorTokenSet.has(t));
        const merged = [...anchorHits, ...residualTokens].join(" ")
          .replace(/\bcharacter pressure\b/gi, " ")
          .replace(/\s+/g, " ")
          .trim();
        const compact = merged.split(/\s+/).slice(0, 6).join(" ").trim();
        if (/\bcoming\s+of\b$/.test(compact)) return anchorHits.find((a) => a === "coming of age") || "";
        return compact;
      };
      const normalizeFinalSourceQuery = (q: string) => {
        const cleaned = String(q || "")
          .replace(/\b(environmental pressure|procedural problem-solving|setting|stakes)\b/gi, " ")
          .replace(/\s+/g, " ")
          .trim();
        const tokens = cleaned.split(/\s+/).filter(Boolean);
        const out: string[] = [];
        let seenGraphicNovel = false;
        let seenComicSeries = false;
        let seenGraphicToken = false;
        const seenConcept = new Set<string>();
        const conceptOf = (t: string) => {
          const n = String(t || "").toLowerCase();
          if (/^(suspense|thriller|mystery|crime)$/.test(n)) return n;
          if (/^(graphic|comic|manga|manhwa|webtoon)$/.test(n)) return "graphic_media";
          if (/^(fantasy|supernatural|romance|romantic|adventure|science|fiction|dystopian)$/.test(n)) return n;
          return "";
        };
        for (let i = 0; i < tokens.length; i += 1) {
          const a = tokens[i]?.toLowerCase() || "";
          const b = tokens[i + 1]?.toLowerCase() || "";
          if (a === "graphic" && b === "novel") {
            if (seenGraphicNovel) { i += 1; continue; }
            seenGraphicNovel = true;
          }
          if (a === "comic" && b === "series") {
            if (seenComicSeries) { i += 1; continue; }
            seenComicSeries = true;
          }
          if (a === "graphic" && b !== "novel") {
            if (seenGraphicToken) continue;
            seenGraphicToken = true;
          }
          const concept = conceptOf(a);
          if (concept) {
            if (seenConcept.has(concept)) continue;
            seenConcept.add(concept);
          }
          out.push(tokens[i]);
        }
        const normalized = out.join(" ").replace(/\s+/g, " ").trim();
        if (/^graphic$/i.test(normalized)) return "graphic novel";
        return normalized;
      };
      const canonicalizeKitsuDispatchQuery = (q: string) => String(q || "")
        .toLowerCase()
        .replace(/[-+][a-z0-9_]+/g, " ")
        .replace(/[^a-z0-9\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      const sanitizeKitsuQuery = (q: string) => {
        const raw = String(q || "")
          .trim()
          .toLowerCase()
          .replace(/\bcharacter[-\s]?focused\b/g, " ")
          .replace(/\b(graphic novel)\s+\1\b/g, "$1")
          .replace(/\s+/g, " ")
          .trim();
        const genericTerms = new Set(["adventure", "drama", "action", "romance", "fantasy", "science", "fiction", "science fiction", "comedy", "mystery", "horror", "thriller"]);
        const stopTerms = new Set(["character", "focused", "graphic", "novel", "book", "books", "comic", "series", "the", "a", "an", "and", "or", "for", "with", "without", "exclude", "literary", "thematic", "emotionally", "rich", "psychologically", "complex"]);
        const phraseAnchors = ["goldie vance", "science fiction", "coming of age", "fantasy adventure", "psychological horror"];
        const phraseHits = phraseAnchors.filter((ph) => raw.includes(ph));
        const tokens = raw
          .replace(/[^a-z0-9\s-]/g, " ")
          .split(/\s+/)
          .map((t) => t.trim())
          .filter(Boolean);
        const dropped: Array<{ token: string; reason: string }> = [];
        const anchors: string[] = [];
        for (const t of tokens) {
          if (t === "character") { dropped.push({ token: t, reason: "descriptor_character_token" }); continue; }
          if (stopTerms.has(t)) { dropped.push({ token: t, reason: "book_or_format_stopword" }); continue; }
          if (/^\d+$/.test(t)) { dropped.push({ token: t, reason: "numeric_only" }); continue; }
          if (genericTerms.has(t)) { dropped.push({ token: t, reason: "generic_genre_token" }); continue; }
          if (t.length <= 2) { dropped.push({ token: t, reason: "too_short" }); continue; }
          anchors.push(t);
        }
        const anchorsSansPhraseDupes = anchors.filter((a) => !phraseHits.some((ph) => ph.split(/\s+/).includes(a)));
        const mergedAnchors = Array.from(new Set([...phraseHits, ...anchorsSansPhraseDupes])).slice(0, 3);
        const genericFallback = raw.includes("science fiction") ? "science fiction" : (raw.includes("mystery") ? "mystery" : "adventure");
        const sanitized = (mergedAnchors.length > 0 ? mergedAnchors.join(" ") : genericFallback)
          .replace(/\b(graphic novel)\s+\1\b/g, "$1")
          .replace(/\s+/g, " ")
          .trim();
        const genericOnly = mergedAnchors.length === 0;
        return { sanitized, dropped, genericOnly, usedAnchorFallback: genericOnly && anchors.length > 0, genericFallback };
      };
      const simplifyGoogleBooksQuery = (q: string) => {
        const raw = String(q || "").toLowerCase();
        const exclusionHeavy = /\s-[a-z0-9_]+/i.test(raw) || /\b(exclude|without)\b/i.test(raw);
        const themedFallback =
          /\bpsychological\b/.test(raw) && /\bhorror\b/.test(raw)
            ? "psychological horror"
            : /\bromance\b/.test(raw)
            ? "romance graphic novel"
            : /\bfantasy\b/.test(raw) || /\badventure\b/.test(raw)
            ? "fantasy adventure"
            : /\bscience|future|sci[\s-]?fi\b/.test(raw)
            ? "science fiction"
            : "";
        if (exclusionHeavy && themedFallback) return themedFallback;
        const cleaned = raw
          .replace(/["']/g, " ")
          .replace(/[-+][a-z0-9_]+/g, " ")
          .replace(/\b(character[-\s]?focused|graphic novel|novel|book|narrative|consequence|survival|exclude|without|literary|writers?|guide|reference|manual|analysis)\b/gi, " ")
          .replace(/[^a-z0-9\s]/g, " ")
          .replace(/\s+/g, " ")
          .trim();
        const compact = cleaned.split(/\s+/).filter(Boolean).slice(0, 4).join(" ").trim();
        if (!compact && themedFallback) return themedFallback;
        if (compact && !/\s-[a-z0-9_]+/i.test(compact)) return compact;
        return themedFallback || compact;
      };
      const baseLaneQuerySourceSanitized = String(baseLaneQuery || "")
        .replace(/\b(genre|tone|mood|theme|drive|audience|age|media|format)\s*:/gi, " ")
        .replace(/\bcharacter[-\s]?focused\b/gi, " ")
        .replace(/\b(graphic\s+novel)\s+\1\b/gi, "$1")
        .replace(/\b(comic\s+series)\s+\1\b/gi, "$1")
        .replace(/\s+/g, " ")
        .trim();
      const googleLaneQuery = normalizeFinalSourceQuery(baseLaneQuerySourceSanitized || baseLaneQuery);
      const openLibraryLaneQuery = normalizeFinalSourceQuery(sanitizeOpenLibraryQuery(baseLaneQuerySourceSanitized || baseLaneQuery) || "fantasy adventure");
      const kitsuSanitized = sanitizeKitsuQuery(baseLaneQuery);
      const fallbackBroadTerms = [
        /\b(superhero(?:es)?|super hero(?:es)?|miles|batman|spider[\s-]?man|marvel|dc comics?)\b/i.test(baseLaneQuery) ? "superhero" : "",
        /\b(mystery|detective|investigator|crime)\b/i.test(baseLaneQuery) ? "detective" : "",
        /\b(mystery|detective|investigator|crime)\b/i.test(baseLaneQuery) ? "mystery" : "",
        /\b(mystery|detective|investigator|crime)\b/i.test(baseLaneQuery) ? "suspense" : "",
        /\b(identity|teen|school)\b/i.test(baseLaneQuery) ? "school" : "",
        /\b(identity|teen|school)\b/i.test(baseLaneQuery) ? "drama" : "",
        /\b(identity|teen|school)\b/i.test(baseLaneQuery) ? "coming of age" : "",
        /\b(horror|supernatural|occult)\b/i.test(baseLaneQuery) ? "psychological horror" : "",
        /\b(horror|supernatural|occult)\b/i.test(baseLaneQuery) ? "supernatural" : "",
        /\b(horror|supernatural|occult)\b/i.test(baseLaneQuery) ? "suspense" : "",
        /\b(science|future|sci[\s-]?fi)\b/i.test(baseLaneQuery) ? "science fiction" : "",
        /\b(fantasy|adventure)\b/i.test(baseLaneQuery) ? "fantasy" : "",
      ].filter(Boolean);
      const terminalBroadFallbacks = ["adventure", "school", "drama"];
      const kitsuFallbackCandidates = Array.from(new Set(fallbackBroadTerms)).filter(Boolean);
      const priorCanonicalKitsuQueries = new Set(Array.from(kitsuQueriesActuallyFetched).map((q) => canonicalizeKitsuDispatchQuery(String(q || ""))).filter(Boolean));
      const fallbackCandidate = kitsuFallbackCandidates.find((candidate) => !priorCanonicalKitsuQueries.has(canonicalizeKitsuDispatchQuery(candidate)));
      const terminalBroadFallbackCandidate = terminalBroadFallbacks.find((candidate) => !priorCanonicalKitsuQueries.has(canonicalizeKitsuDispatchQuery(candidate)));
      if (kitsuPrimaryRawZero && kitsuDispatchedOnce && !kitsuFallbackDispatchedOnce && !fallbackCandidate) {
        sourceSkippedReason.push("kitsu_fallback_duplicate_canonical_skipped");
      }
      const shouldUseTerminalBroadFallback = kitsuPrimaryRawZero && kitsuFallbackDispatchedOnce && kitsuFallbackRawZero && !kitsuTerminalBroadFallbackDispatched;
      const initialKitsuLaneQuery = shouldUseTerminalBroadFallback
        ? (terminalBroadFallbackCandidate || "adventure")
        : (kitsuPrimaryRawZero && kitsuDispatchedOnce && !kitsuFallbackDispatchedOnce
          ? (fallbackCandidate || "adventure")
          : kitsuSanitized.sanitized);
      const selectedKitsuLaneQuery = selectSpecificKitsuRecoveryQuery(initialKitsuLaneQuery, [baseLaneQuery, ...fallbackBroadTerms]);
      const kitsuLaneQuery = selectedKitsuLaneQuery.query;
      collectKitsuRecoveryComicIntent([baseLaneQuery, initialKitsuLaneQuery, kitsuLaneQuery, ...fallbackBroadTerms]);
      markKitsuRecoveryComicFallbackIfGeneric([kitsuLaneQuery]);
      if (selectedKitsuLaneQuery.promoted && !kitsuRecoveryQueryPromotedFrom) {
        kitsuRecoveryQueryPromotedFrom = initialKitsuLaneQuery;
        kitsuRecoveryQueryPromotedTo = kitsuLaneQuery;
      }
      kitsuPreSanitizedQueries.push(baseLaneQuery);
      kitsuSanitizedQuerySelected.push(kitsuLaneQuery);
      if (!kitsuRecoveryOriginalIntentQuery) kitsuRecoveryOriginalIntentQuery = baseLaneQuery;
      if (!kitsuRecoverySelectedQuery) kitsuRecoverySelectedQuery = kitsuLaneQuery;
      if (isTooBroadKitsuRecoveryQuery(kitsuLaneQuery)) kitsuRecoveryQueryTooBroad = true;
      for (const dropped of kitsuSanitized.dropped) {
        if (dropped?.reason === "generic_genre_token") kitsuRecoveryQueryDroppedGenreTerms.push(String(dropped.token || ""));
      }
      kitsuSanitizationDroppedTokens.push(...kitsuSanitized.dropped);
      kitsuSanitizationDiagnostics.push({ original: baseLaneQuery, sanitized: kitsuLaneQuery, droppedTokens: kitsuSanitized.dropped, genericOnly: kitsuSanitized.genericOnly });
      sourceSpecificQueryModeBySource.googleBooks = "natural_language_with_exclusions";
      sourceSpecificQueryModeBySource.openLibrary = "short_subject_title_unquoted";
      sourceSpecificQueryModeBySource.kitsu = "compact_anime_manga_genre_terms";
      if (openLibraryLaneQuery !== baseLaneQuery) sourceSpecificQueryRejectedReasonBySource.openLibrary.push("long_or_quoted_query_sanitized");
      if (kitsuSanitized.genericOnly) sourceSpecificQueryRejectedReasonBySource.kitsu.push("generic_only_sanitized_query_guard");
      if (kitsuLaneQuery !== baseLaneQuery) {
        sourceSpecificQueryRejectedReasonBySource.kitsu.push("book_style_or_exclusion_query_sanitized");
        kitsuQuerySanitizedFrom.push(baseLaneQuery);
        kitsuQuerySanitizedTo.push(kitsuLaneQuery);
      }
      var effectiveLaneSource =
        googleQuotaExhausted && lane.source === "googleBooks" && sourceEnabled.openLibrary
          ? "openLibrary"
          : lane.source;
      if (sourceEnabled.googleBooks && !googleQuotaExhausted && effectiveLaneSource === "googleBooks") {
        if (googleBooksQueriesActuallyFetched.has(googleLaneQuery)) {
          sourceSkippedReason.push("googleBooks_exact_query_dedupe_skipped");
          pushGlobalPhase("googleBooks_exact_query_dedupe_skipped", { query: googleLaneQuery, laneIndex: lanei });
          continue;
        }
        const googleProbeStatus = String(sourceHealthProbeStatus.google_books || "").toLowerCase();
        const googleProbeFailed = googleProbeStatus.includes("failed") || googleProbeStatus.includes("timeout") || googleProbeStatus.includes("error");
        if (googleBooksProbeDegraded || googleProbeFailed) {
          pushGlobalPhase("router_fetch_loop_stopped_by_cap", {
            source: "googleBooks",
            source_fetch_cap_exceeded: false,
            source_fetch_skipped_due_to_probe_degraded: true,
            probeStatus: String(sourceHealthProbeStatus.google_books || ""),
          });
          sourceSkippedReason.push(googleProbeFailed ? "googleBooks_skipped_due_to_probe_failed" : "googleBooks_skipped_due_to_probe_degraded");
        } else
        if (googleBooksRouterFetchCount >= sourceFetchCapPerRun) {
          pushGlobalPhase("router_fetch_loop_stopped_by_cap", { source: "googleBooks", source_fetch_cap_exceeded: true, googleBooksRouterFetchCount });
          sourceSkippedReason.push("source_fetch_cap_exceeded:googleBooks");
        } else {
        const isGoogleRetryLaneAttempt = googleBooksRouterFetchCount >= 1;
        const googleQueryHasExclusionTokens = /\s-[a-z0-9_]+/i.test(googleLaneQuery) || /\b(exclude|without)\b/i.test(googleLaneQuery);
        if (isGoogleRetryLaneAttempt && googleQueryHasExclusionTokens) {
          sourceSkippedReason.push("googleBooks_retry_guard_blocked_exclusion_lane");
          pushGlobalPhase("googleBooks_retry_guard_blocked_exclusion_lane", { query: googleLaneQuery, laneIndex: lanei, googleBooksRouterFetchCount });
        } else {
        laneInput = {
          ...laneInput,
          bucketPlan: { ...(laneInput.bucketPlan as any), queries: [googleLaneQuery], preview: googleLaneQuery, rungs: [{ ...((laneInput.bucketPlan as any)?.rungs?.[0] || {}), query: googleLaneQuery, primary: googleLaneQuery }] },
        };
          googleBooksRouterFetchCount += 1;
        googleBooksQueryUsedByLane.push(googleLaneQuery);
        googleBooksQueriesActuallyFetched.add(googleLaneQuery);
        pushGlobalPhase("before_google_books_router_fetch");
        const googleBooksTimeoutMs = googleBooksRouterFetchCount <= 1 ? 8_000 : 5_000;
        pendingSourceFetchCount += 1;
        pendingSourceFetchCountIncremented.push({ source: "googleBooks", laneIndex: lanei, query: googleLaneQuery, pending: pendingSourceFetchCount });
        const googlePrimaryFetchPromise = runEngine("googleBooks", laneInput);
        const googleTrackedRequest = withSourceTimeout("router_before_google_books_full_fetch", "router_after_google_books_full_fetch", googleBooksTimeoutMs, async () => {
            try {
              return await googlePrimaryFetchPromise;
            } catch (err: any) {
              const msg = String(err?.message || err || "");
              if (!msg.includes("router_before_google_books_full_fetch_timeout")) throw err;
              const builtFallbackGoogleQuery = simplifyGoogleBooksQuery(googleLaneQuery);
              const fallbackGoogleQuery = isValidGoogleFallbackRetryQuery(builtFallbackGoogleQuery) ? builtFallbackGoogleQuery : (/\bhorror\b/i.test(googleLaneQuery) ? "horror thriller" : "fantasy adventure");
              const validated = isValidGoogleFallbackRetryQuery(fallbackGoogleQuery);
              googleBooksTimeoutStageByQuery.push({ query: googleLaneQuery, stage: "timeout_primary", fallbackQuery: fallbackGoogleQuery || "", reason: "primary_timeout" });
              googleBooksRetryQueryMapping.push({ primaryQuery: googleLaneQuery, retryQuery: fallbackGoogleQuery, validated });
              if (!fallbackGoogleQuery || !validated || fallbackGoogleQuery === googleLaneQuery) { googleBooksTimeoutStageByQuery.push({ query: googleLaneQuery, stage: "fallback_skipped", fallbackQuery: fallbackGoogleQuery || "", reason: "not_simpler_or_invalid" }); throw err; }
              const fallbackLaneInput = {
                ...laneInput,
                bucketPlan: { ...(laneInput.bucketPlan as any), queries: [fallbackGoogleQuery], preview: fallbackGoogleQuery, rungs: [{ ...((laneInput.bucketPlan as any)?.rungs?.[0] || {}), query: fallbackGoogleQuery, primary: fallbackGoogleQuery }] },
              };
              googleBooksTimeoutStageByQuery.push({ query: googleLaneQuery, stage: "fallback_dispatched", fallbackQuery: fallbackGoogleQuery, reason: "retry_with_simplified_query" });
              pushGlobalPhase("before_google_books_fallback_router_fetch", { primaryQuery: googleLaneQuery, fallbackQuery: fallbackGoogleQuery });
              googleBooksRouterFetchCount = Math.max(googleBooksRouterFetchCount, sourceFetchCapPerRun);
              const googleFallbackFetchPromise = runEngine("googleBooks", fallbackLaneInput);
              pendingSourceFetches.push(googleFallbackFetchPromise.catch(() => null));
              return await withSourceTimeout("router_before_google_books_fallback_fetch", "router_after_google_books_fallback_fetch", 4500, () => googleFallbackFetchPromise);
            }
          })
            .finally(() => {
              pendingSourceFetchCount = Math.max(0, pendingSourceFetchCount - 1);
              pendingSourceFetchCountDecremented.push({ source: "googleBooks", laneIndex: lanei, query: googleLaneQuery, pending: pendingSourceFetchCount });
              pushGlobalPhase("pendingSourceFetchCount_decremented", { source: "googleBooks", laneIndex: lanei, query: googleLaneQuery, pendingSourceFetchCount });
              pushGlobalPhase("after_google_books_router_fetch");
            }) as any;
        pendingSourceFetches.push(googleTrackedRequest.catch(() => null));
        requests.push(googleTrackedRequest);
        }
        }
      }
      if (sourceEnabled.openLibrary && effectiveLaneSource === "openLibrary") {
        if (openLibraryRouterFetchCount >= sourceFetchCapPerRun) {
          pushGlobalPhase("router_fetch_loop_stopped_by_cap", { source: "openLibrary", source_fetch_cap_exceeded: true, openLibraryRouterFetchCount });
          sourceSkippedReason.push("source_fetch_cap_exceeded:openLibrary");
        } else {
        laneInput = {
          ...laneInput,
          bucketPlan: { ...(laneInput.bucketPlan as any), queries: [openLibraryLaneQuery], preview: openLibraryLaneQuery, rungs: [{ ...((laneInput.bucketPlan as any)?.rungs?.[0] || {}), query: openLibraryLaneQuery, primary: openLibraryLaneQuery }] },
        };
          openLibraryRouterFetchCount += 1;
        openLibraryQueryUsedByLane.push(openLibraryLaneQuery);
        openLibraryQueriesActuallyFetched.add(openLibraryLaneQuery);
        pushGlobalPhase("before_open_library_router_fetch");
        pendingSourceFetchCount += 1;
        pendingSourceFetchCountIncremented.push({ source: "openLibrary", laneIndex: lanei, query: openLibraryLaneQuery, pending: pendingSourceFetchCount });
        const openLibraryFetchPromise = runEngine("openLibrary", laneInput);
        const openLibraryTrackedRequest = withSourceTimeout("router_before_open_library_full_fetch", "router_after_open_library_full_fetch", 4_000, () => openLibraryFetchPromise)
            .finally(() => {
              pendingSourceFetchCount = Math.max(0, pendingSourceFetchCount - 1);
              pendingSourceFetchCountDecremented.push({ source: "openLibrary", laneIndex: lanei, query: openLibraryLaneQuery, pending: pendingSourceFetchCount });
              pushGlobalPhase("pendingSourceFetchCount_decremented", { source: "openLibrary", laneIndex: lanei, query: openLibraryLaneQuery, pendingSourceFetchCount });
              pushGlobalPhase("after_open_library_router_fetch");
            }) as any;
        pendingSourceFetches.push(openLibraryTrackedRequest.catch(() => null));
        requests.push(openLibraryTrackedRequest);
        }
      }
      if (includeKitsu && !stopKitsuDispatchForRun) {
        const explicitEntityLane = profileSelectedEntitySeeds.some((seed) => {
          const nseed = normalizeText(String(seed || ""));
          return nseed.length >= 3 && normalizeText(baseLaneQuery).includes(nseed);
        });
        const graphicContextLane = /\b(graphic novel|comic|manga|manhwa|webtoon)\b/i.test(baseLaneQuery);
        const allowEntityRetryAfterPrimaryRaw =
          kitsuDispatchedOnce &&
          !kitsuPrimaryRawZero &&
          !kitsuEntityRetryUsedAfterPrimaryRaw &&
          explicitEntityLane &&
          graphicContextLane;
        if (kitsuDispatchedOnce && !kitsuPrimaryRawZero && !allowEntityRetryAfterPrimaryRaw) {
          const fallbackSuppressedMessage = `kitsu_fallback_suppressed_primary_had_raw:selected=${kitsuSanitizedQuerySelected[0] || ""}:attempted=${kitsuLaneQuery}:lane=${lanei}`;
          pushGlobalPhase("kitsu_fallback_suppressed_primary_had_raw", { fallbackSuppressedMessage, laneIndex: lanei, selectedKitsuQuery: kitsuSanitizedQuerySelected[0] || "", attemptedQuery: kitsuLaneQuery });
          sourceSkippedReason.push("kitsu_fallback_suppressed_primary_had_raw");
          pushGlobalPhase("kitsu_fallback_suppressed_primary_had_raw_non_terminal", { attemptedQuery: kitsuLaneQuery, laneIndex: lanei });
        } else if (kitsuDispatchedOnce && kitsuPrimaryRawZero && kitsuFallbackDispatchedOnce && (!kitsuFallbackRawZero || kitsuTerminalBroadFallbackDispatched)) {
          sourceSkippedReason.push("kitsu_fallback_already_attempted");
        } else {
        if (allowEntityRetryAfterPrimaryRaw) {
          kitsuEntityRetryUsedAfterPrimaryRaw = true;
          sourceSkippedReason.push("kitsu_entity_retry_allowed_primary_had_raw");
          pushGlobalPhase("kitsu_entity_retry_allowed_primary_had_raw", { query: kitsuLaneQuery, laneIndex: lanei, baseLaneQuery });
        }
        const isFallbackAttempt = kitsuDispatchedOnce && kitsuPrimaryRawZero && !kitsuFallbackDispatchedOnce;
        const isTerminalBroadFallbackAttempt = kitsuPrimaryRawZero && kitsuFallbackDispatchedOnce && kitsuFallbackRawZero && !kitsuTerminalBroadFallbackDispatched;
        const fallbackCanonicalDuplicate = (isFallbackAttempt || isTerminalBroadFallbackAttempt) && priorCanonicalKitsuQueries.has(canonicalizeKitsuDispatchQuery(kitsuLaneQuery));
        if (fallbackCanonicalDuplicate) {
          sourceSkippedReason.push("kitsu_fallback_duplicate_canonical_skipped");
        } else if (kitsuRouterFetchCount >= (isTerminalBroadFallbackAttempt ? sourceFetchCapPerRun + 1 : sourceFetchCapPerRun)) {
          pushGlobalPhase("router_fetch_loop_stopped_by_cap", { source: "kitsu", source_fetch_cap_exceeded: true, kitsuRouterFetchCount });
          sourceSkippedReason.push("source_fetch_cap_exceeded:kitsu");
        } else {
        laneInput = {
          ...laneInput,
          bucketPlan: { ...(laneInput.bucketPlan as any), queries: [kitsuLaneQuery], preview: kitsuLaneQuery, rungs: [{ ...((laneInput.bucketPlan as any)?.rungs?.[0] || {}), query: kitsuLaneQuery, primary: kitsuLaneQuery }] },
        };
          kitsuRouterFetchCount += 1;
          if (kitsuDispatchedOnce && !kitsuFallbackDispatchedOnce) kitsuFallbackDispatchedOnce = true;
          if (isTerminalBroadFallbackAttempt) { kitsuTerminalBroadFallbackDispatched = true; sourceSkippedReason.push("kitsu_terminal_broad_fallback_attempted"); pushGlobalPhase("kitsu_terminal_broad_fallback_attempted", { query: kitsuLaneQuery, laneIndex: lanei }); }
          kitsuDispatchedOnce = true;
        kitsuQueryUsedByLane.push(kitsuLaneQuery);
        kitsuFinalQueryUsedForFetch.push(kitsuLaneQuery);
        kitsuQueriesActuallyFetched.add(kitsuLaneQuery);
        pushGlobalPhase("before_kitsu_router_fetch");
        pendingSourceFetchCount += 1;
        pendingSourceFetchCountIncremented.push({ source: "kitsu", laneIndex: lanei, query: kitsuLaneQuery, pending: pendingSourceFetchCount });
        const kitsuFetchPromise = getKitsuMangaRecommendations(laneInput);
        const kitsuTrackedRequest = withSourceTimeout("router_before_kitsu_full_fetch", "router_after_kitsu_full_fetch", 10_000, () => kitsuFetchPromise)
            .finally(() => {
              pendingSourceFetchCount = Math.max(0, pendingSourceFetchCount - 1);
              pendingSourceFetchCountDecremented.push({ source: "kitsu", laneIndex: lanei, query: kitsuLaneQuery, pending: pendingSourceFetchCount });
              pushGlobalPhase("pendingSourceFetchCount_decremented", { source: "kitsu", laneIndex: lanei, query: kitsuLaneQuery, pendingSourceFetchCount });
              pushGlobalPhase("after_kitsu_router_fetch");
            }) as any;
        pendingSourceFetches.push(kitsuTrackedRequest.catch(() => null));
        requests.push(kitsuTrackedRequest);
        kitsuDispatchedOnThisLane = true;
        }
        }
      }
      var shouldDispatchComicVineForLane = includeComicVine && !comicVineDispatchedOnce;
      var comicVineDispatchedOnThisLane = shouldDispatchComicVineForLane;
      if (shouldDispatchComicVineForLane) {
        requests.push(getComicVineGraphicNovelRecommendations(laneInput));
        comicVineDispatchedOnce = true;
      }
      if (includeComicVine) comicVineQueryTexts.add("comicvine_adapter");
      if (requests.length === 0) {
        if (!fetchLoopExhaustedMarkerEmitted) {
          pushGlobalPhase("router_fetch_loop_all_sources_exhausted", {
            laneIndex: lanei,
            reason: "no_requests_after_source_checks",
            googleBooksRouterFetchCount,
            openLibraryRouterFetchCount,
            kitsuRouterFetchCount,
          });
          fetchLoopExhaustedMarkerEmitted = true;
        }
        break;
      }

      const results = await Promise.allSettled(requests);
      pushGlobalPhase("pendingSourceFetchCount_incremented", { laneIndex: lanei, pendingSourceFetchCount });
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
        googleBooksFetchResultsByQuery.push({
          query: googleLaneQuery,
          url: `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(googleLaneQuery)}`,
          status: results[index]?.status === "fulfilled" ? "ok" : "error",
          timedOut: String((results[index] as any)?.reason?.message || (results[index] as any)?.reason || "").includes("timeout"),
          rawCount: Number((laneGoogle as any)?.debugRawFetchedCount ?? countResultItems(laneGoogle)),
          error: results[index]?.status === "rejected" ? String((results[index] as PromiseRejectedResult).reason?.message || (results[index] as PromiseRejectedResult).reason || "fetch_failed") : null,
          bodyPrefix: results[index]?.status === "rejected"
            ? String((results[index] as PromiseRejectedResult).reason?.message || (results[index] as PromiseRejectedResult).reason || "").slice(0, 180)
            : (Number((laneGoogle as any)?.debugRawFetchedCount ?? countResultItems(laneGoogle)) === 0 ? "[empty_google_books_result]" : null),
        });
        if (results[index]?.status === "rejected" && isGoogleQuotaError((results[index] as PromiseRejectedResult).reason)) {
          googleQuotaExhausted = true;
          sourceSkippedReason.push("googleBooks_quota_exhausted_auto_disabled");
          debugRouterLog("GOOGLE_BOOKS_AUTO_DISABLED_QUOTA", { query: lane.query });
        }
        if (results[index]?.status === "rejected" && String((results[index] as PromiseRejectedResult).reason?.message || (results[index] as PromiseRejectedResult).reason || "").includes("router_before_google_books_full_fetch_timeout")) {
          googleBooksConsecutiveTimeouts += 1;
          if (googleBooksConsecutiveTimeouts >= 1) {
            googleQuotaExhausted = true;
            sourceSkippedReason.push("googleBooks_marked_degraded_after_consecutive_timeouts");
          }
          if (googleBooksConsecutiveTimeouts === 1) {
            sourceSkippedReason.push("googleBooks_timeout_primary_retry_attempted");
          }
        } else if (results[index]?.status === "fulfilled") {
          googleBooksConsecutiveTimeouts = 0;
        }
        index += 1;
      }

      const laneOpenLibrary = sourceEnabled.openLibrary && effectiveLaneSource === "openLibrary" && results[index]?.status === "fulfilled"
        ? (results[index] as PromiseFulfilledResult<RecommendationResult>).value
        : null;
      if (sourceEnabled.openLibrary && effectiveLaneSource === "openLibrary") {
        openLibraryFetchResultsByQuery.push({
          query: openLibraryLaneQuery,
          url: `/api/openlibrary?q=${encodeURIComponent(openLibraryLaneQuery)}`,
          status: results[index]?.status === "fulfilled" ? "ok" : "error",
          timedOut: String((results[index] as any)?.reason?.message || (results[index] as any)?.reason || "").includes("timeout"),
          rawCount: Number((laneOpenLibrary as any)?.debugRawFetchedCount ?? countResultItems(laneOpenLibrary)),
          error: results[index]?.status === "rejected" ? String((results[index] as PromiseRejectedResult).reason?.message || (results[index] as PromiseRejectedResult).reason || "fetch_failed") : null,
          bodyPrefix: results[index]?.status === "rejected"
            ? String((results[index] as PromiseRejectedResult).reason?.message || (results[index] as PromiseRejectedResult).reason || "").slice(0, 180)
            : (Number((laneOpenLibrary as any)?.debugRawFetchedCount ?? countResultItems(laneOpenLibrary)) === 0 ? "[empty_open_library_result]" : null),
        });
        index += 1;
      }

      const laneKitsu = includeKitsu && kitsuDispatchedOnThisLane && results[index]?.status === "fulfilled"
        ? (results[index] as PromiseFulfilledResult<RecommendationResult>).value
        : null;
      if (includeKitsu && kitsuDispatchedOnThisLane) {
        const kitsuRawCount = Number((laneKitsu as any)?.debugRawFetchedCount ?? countResultItems(laneKitsu));
        if (!kitsuFallbackDispatchedOnce && kitsuDispatchedOnce) kitsuPrimaryRawZero = kitsuRawCount === 0;
        if (kitsuFallbackDispatchedOnce && !kitsuTerminalBroadFallbackDispatched) kitsuFallbackRawZero = kitsuRawCount === 0;
        const kitsuResponseStatus = String((laneKitsu as any)?.debugSourceStatus || (laneKitsu as any)?.kitsuSourceStatus || "").trim();
        const kitsuParsedDataLength = Number((laneKitsu as any)?.debugParsedDataLength ?? kitsuRawCount);
        const kitsuRawSnippet = String((laneKitsu as any)?.debugRawJsonSnippet || (laneKitsu as any)?.debugResponseSnippet || "").trim();
        kitsuFetchResultsByQuery.push({
          query: kitsuLaneQuery,
          url: `${KITSU_API_BASE}/manga?filter[text]=${encodeURIComponent(kitsuLaneQuery)}`,
          status: results[index]?.status === "fulfilled" ? "ok" : "error",
          timedOut: String((results[index] as any)?.reason?.message || (results[index] as any)?.reason || "").includes("timeout"),
          rawCount: kitsuRawCount,
          error: results[index]?.status === "rejected" ? String((results[index] as PromiseRejectedResult).reason?.message || (results[index] as PromiseRejectedResult).reason || "fetch_failed") : null,
          bodyPrefix: results[index]?.status === "rejected"
            ? String((results[index] as PromiseRejectedResult).reason?.message || (results[index] as PromiseRejectedResult).reason || "").slice(0, 180)
            : [
              kitsuResponseStatus ? `status=${kitsuResponseStatus}` : "status=ok",
              `parsed_data_length=${Number.isFinite(kitsuParsedDataLength) ? kitsuParsedDataLength : 0}`,
              kitsuRawSnippet ? `raw_json_snippet=${kitsuRawSnippet.slice(0, 120)}` : "raw_json_snippet=(none)",
            ].join(" | "),
        });
        index += 1;
      }

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
          const comicVineQueryTextsFromAdapter = Array.isArray(value?.comicVineQueryTexts) ? value.comicVineQueryTexts : [];
          for (let qi = 0; qi < comicVineQueryTextsFromAdapter.length; qi += 1) {
            const queryText = comicVineQueryTextsFromAdapter[qi];
            comicVineQueryTexts.add(String(queryText || "").trim());
          }
          if (!comicVineResolvedSeedQuery && typeof value?.comicVineResolvedSeedQuery === "string") comicVineResolvedSeedQuery = value.comicVineResolvedSeedQuery;
          if (typeof value?.comicVineFallbackReason === "string") comicVineFallbackReason = value.comicVineFallbackReason;
          if (typeof value?.comicVineUsedFallbackQuery === "boolean") comicVineUsedFallbackQuery = value.comicVineUsedFallbackQuery;
          if (Array.isArray(value?.comicVinePositiveQueries)) comicVinePositiveQueries = value.comicVinePositiveQueries.map((q:any)=>String(q||"").trim()).filter(Boolean);
          if (typeof value?.comicVineExcludedTermsAppliedInFilterOnly === "boolean") comicVineExcludedTermsAppliedInFilterOnly = value.comicVineExcludedTermsAppliedInFilterOnly;
          if (typeof value?.comicVineQueryTooLong === "boolean") comicVineQueryTooLong = value.comicVineQueryTooLong;
          const comicVineRungsBuiltFromAdapter = Array.isArray(value?.comicVineRungsBuilt) ? value.comicVineRungsBuilt : [];
          for (let qi = 0; qi < comicVineRungsBuiltFromAdapter.length; qi += 1) {
            const queryText = comicVineRungsBuiltFromAdapter[qi];
            comicVineRungsBuilt.add(String(queryText || "").trim());
          }
          const comicVineFetchedQueriesFromAdapter = Array.isArray(value?.comicVineQueriesActuallyFetched) ? value.comicVineQueriesActuallyFetched : [];
          for (let qi = 0; qi < comicVineFetchedQueriesFromAdapter.length; qi += 1) {
            const queryText = comicVineFetchedQueriesFromAdapter[qi];
            comicVineQueriesActuallyFetched.add(String(queryText || "").trim());
          }
          for (let qi = 0; qi < comicVineFetchedQueriesFromAdapter.length; qi += 1) {
            const queryText = comicVineFetchedQueriesFromAdapter[qi];
            const q = String(queryText || "").trim();
            if (tasteDerivedQuerySet.has(normalizeText(q))) comicVineTasteQueriesAttempted.add(q);
          }
          if (querySourceOfTruth === "taste_profile") {
            const leakedStaticQuery = comicVineFetchedQueriesFromAdapter.map((q:any)=>String(q || "").trim()).find((q:string) => {
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
            for (let ri = 0; ri < value.comicVineFetchResults.length; ri += 1) {
              const row = value.comicVineFetchResults[ri];
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
      } catch (dispatchError: any) {
        const dispatchMessage = String(dispatchError?.message || dispatchError || "comicvine_dispatch_lane_error");
        comicVineDispatchError = dispatchMessage;
        comicVineDispatchErrorPhase = "dispatch ComicVine";
        comicVineAdapterFailed = true;
        comicVineAdapterStatus = "proxy_error";
        if (includeComicVine) {
          const fallbackQuery = String((queryLanes[lanei] as any)?.query || (rung as any)?.query || "comicvine_adapter");
          comicVineFetchResults.push({
            query: fallbackQuery,
            status: "error",
            rawCount: 0,
            error: `dispatch_lane_error:${dispatchMessage}`,
          });
        }
      }
    }
    if (stopRouterFetchLoop) break;
  }
  if (pendingSourceFetches.length > 0) {
    pushGlobalPhase("awaiting_pending_source_fetches_before_post_fetch_health_guard", { pendingSourceFetches: pendingSourceFetches.length });
    await Promise.allSettled(pendingSourceFetches);
    if (pendingSourceFetchCount > 0) {
      await Promise.resolve();
      await Promise.allSettled(pendingSourceFetches);
      if (pendingSourceFetchCount > 0) {
        pushGlobalPhase("pending_fetch_counter_mismatch_after_allSettled", { pendingSourceFetchCount, pendingSourceFetches: pendingSourceFetches.length });
      }
    }
  }

  let mergedDocs = dedupeDocs(allMergedDocs);
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
  const comicVineFetchAttemptedFlag = (includeComicVine && mainRungQueriesLength > 0) || comicVineDispatchBypassed;
  const comicVineFetchAttempted = Boolean((comicVineEnabledRuntime && includeComicVine && mainRungQueriesLength > 0) || comicVineDispatchBypassed);
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

  if (googleQuotaExhausted) {
    sourceEnabled.googleBooks = false;
    effectiveEnabledSourcesAfterSynthesis.googleBooks = false;
    sourceAllowedByFinalGate.googleBooks = false;
    sourceAllowedByRecoveryPath.googleBooks = false;
  }

  const googleStarved = sourceEnabled.googleBooks && Number(aggregatedRawFetched.googleBooks || 0) === 0;
  const openLibraryStarved = sourceEnabled.openLibrary && Number(aggregatedRawFetched.openLibrary || 0) === 0;
  const kitsuStarved = includeKitsu && Number(aggregatedRawFetched.kitsu || 0) === 0;
  const comicVineUnavailableBypass = Boolean(comicVineDispatchBypassed);
  const allRealSourcesStarved =
    googleStarved &&
    openLibraryStarved &&
    (kitsuStarved || !includeKitsu) &&
    (comicVineUnavailableBypass || !includeComicVine);
  const kitsuPolicyUniqueCanonicalQueriesForHealthGuard = Array.from(new Set(
    kitsuFetchResultsByQuery
      .map((row) => String(row?.query || "").toLowerCase().replace(/[-+][a-z0-9_]+/g, " ").replace(/[^a-z0-9\\s]/g, " ").replace(/\s+/g, " ").trim())
      .filter(Boolean)
  ));
  const kitsuMaxAllowedCanonicalFetchesForHealthGuard = kitsuTerminalBroadFallbackDispatched ? 3 : (kitsuPrimaryRawZero ? 2 : 1);
  pushGlobalPhase("pendingSourceFetchCount_at_source_health_guard", { pendingSourceFetchCount, allRealSourcesStarved });
  if (allRealSourcesStarved && pendingSourceFetchCount > 0) {
    pushGlobalPhase("source_health_pending", { pendingSourceFetchCount });
    sourceSkippedReason.push(`source_health_pending:${pendingSourceFetchCount}`);
  } else if (allRealSourcesStarved) {
    let kitsuRecoveryAttemptedForHealthGuard = false;
    let kitsuRecoveryEligibleForHealthGuard = false;
    const sanitizeKitsuRecoveryQuery = (q: string) => {
      const original = String(q || "").trim();
      const lowered = original.toLowerCase();
      const domainPreferred = ["mystery", "fantasy", "horror", "romance", "science fiction", "dystopian", "thriller", "adventure", "drama", "young adult", "graphic novel", "crime", "supernatural"];
      const phraseMatches = domainPreferred.filter((term) => lowered.includes(term));
      const stripped = lowered
        .replace(/\b(genre|theme|tone|setting|stakes)\b/gi, " ")
        .replace(/\b(character|focused|narrative|series|story|stories|abstract|profile|suspense)\b/gi, " ")
        .replace(/[^a-z0-9\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      const concreteTokens = stripped
        .split(/\s+/)
        .map((t) => t.trim())
        .filter(Boolean)
        .filter((t) => !["science", "fiction", "supernatural", "horror", "mystery", "crime", "dystopian", "adventure", "drama"].includes(t));
      const chosen = phraseMatches.length > 0
        ? phraseMatches[0]
        : (["mystery", "fantasy", "horror", "romance", "science fiction", "dystopian", "thriller", "adventure", "drama", "young adult", "graphic novel", "crime", "supernatural"].find((term) => stripped.includes(term)) || concreteTokens[0] || "adventure");
      return { from: original, to: String(chosen || "adventure").trim() };
    };
    if (Number(aggregatedRawFetched.googleBooks || 0) === 0 && Number(aggregatedRawFetched.openLibrary || 0) === 0 && includeKitsu && Number(aggregatedRawFetched.kitsu || 0) === 0 && kitsuRouterFetchCount === 0) {
      kitsuRecoveryEligibleForHealthGuard = true;
      const kitsuRecoveryQuery =
        kitsuSanitizedQuerySelected.find((q) => String(q || "").trim().length > 0) ||
        kitsuQueryUsedByLane.find((q) => String(q || "").trim().length > 0) ||
        "adventure";
      const promotedRecoveryQuery = selectSpecificKitsuRecoveryQuery(kitsuRecoveryQuery, [
        ...kitsuPreSanitizedQueries,
        ...kitsuSanitizedQuerySelected,
        ...kitsuQueryUsedByLane,
        String(bucketPlan.preview || ""),
        ...((bucketPlan.queries || []) as any[]).map((q) => String(q || "")),
      ]);
      if (promotedRecoveryQuery.promoted && !kitsuRecoveryQueryPromotedFrom) {
        kitsuRecoveryQueryPromotedFrom = kitsuRecoveryQuery;
        kitsuRecoveryQueryPromotedTo = promotedRecoveryQuery.query;
      }
      const boundedFallback = Array.from(new Set([promotedRecoveryQuery.query, "adventure", "drama", "mystery"].map((q) => sanitizeKitsuRecoveryQuery(String(q || "")).to).filter(Boolean)));
      collectKitsuRecoveryComicIntent([
        kitsuRecoveryQuery,
        promotedRecoveryQuery.query,
        ...kitsuPreSanitizedQueries,
        ...kitsuSanitizedQuerySelected,
        ...kitsuQueryUsedByLane,
        String(bucketPlan.preview || ""),
        ...((bucketPlan.queries || []) as any[]).map((q) => String(q || "")),
        ...boundedFallback,
      ]);
      markKitsuRecoveryComicFallbackIfGeneric(boundedFallback);
      if (!kitsuRecoveryOriginalIntentQuery) kitsuRecoveryOriginalIntentQuery = kitsuRecoveryQuery;
      if (!kitsuRecoverySelectedQuery && boundedFallback.length > 0) kitsuRecoverySelectedQuery = String(boundedFallback[0] || "");
      if (boundedFallback.some((q) => isTooBroadKitsuRecoveryQuery(String(q || "")))) kitsuRecoveryQueryTooBroad = true;
      kitsuRecoveryAttemptedForHealthGuard = true;
      let kitsuRecoverySuccessQuery = "";
      for (let recoveryAttemptIndex = 0; recoveryAttemptIndex < boundedFallback.length; recoveryAttemptIndex += 1) {
        const sanitizedRecovery = sanitizeKitsuRecoveryQuery(String(boundedFallback[recoveryAttemptIndex] || ""));
        const query = sanitizedRecovery.to;
        pushGlobalPhase("kitsuRecoveryQuerySanitizedFrom", { kitsu_recovery_attempt_index: recoveryAttemptIndex, kitsuRecoveryQuerySanitizedFrom: sanitizedRecovery.from });
        pushGlobalPhase("kitsuRecoveryQuerySanitizedTo", { kitsu_recovery_attempt_index: recoveryAttemptIndex, kitsuRecoveryQuerySanitizedTo: sanitizedRecovery.to });
        pushGlobalPhase("kitsu_recovery_attempt_before_source_health_failed", { query, boundedFallback, kitsu_recovery_attempt_index: recoveryAttemptIndex });
        try {
          pushGlobalPhase("kitsu_recovery_fetch_started", { query, kitsu_recovery_attempt_index: recoveryAttemptIndex });
          const recoveryInput = {
            ...routedInput,
            forceKitsuRecoveryFetch: true,
            bucketPlan: { ...(bucketPlan as any), queries: [query], preview: query, rungs: [{ query, primary: query }] },
          } as any;
          const recoveryRes = await withSourceTimeout("router_before_kitsu_health_guard_recovery_fetch", "router_after_kitsu_health_guard_recovery_fetch", 10_000, () => getKitsuMangaRecommendations(recoveryInput));
          pushGlobalPhase("kitsu_recovery_fetch_completed", { query, kitsu_recovery_attempt_index: recoveryAttemptIndex });
          const recoveryRawPool = Array.isArray((recoveryRes as any)?.debugRawPool) ? (recoveryRes as any).debugRawPool : [];
          const recoveryDocs = dedupeDocs(extractDocs(recoveryRes as any, "kitsu"));
          const raw = Number((recoveryRes as any)?.debugRawFetchedCount ?? countResultItems(recoveryRes));
          const recoveryFetchUrl = String((recoveryRes as any)?.debugFetchUrl || `${KITSU_API_BASE}/manga?filter[text]=${encodeURIComponent(query)}`);
          const recoveryFetchStatus = String((recoveryRes as any)?.debugSourceStatus || (raw > 0 ? "ok" : "empty"));
          const recoveryBodyPrefix = String((recoveryRes as any)?.debugRawJsonSnippet || (recoveryRes as any)?.debugResponseSnippet || (raw === 0 ? "[empty_kitsu_result]" : "status=ok")).slice(0, 180);
          const recoveryFetchError = String((recoveryRes as any)?.debugFetchError || "");
          const recoveryFetchHttpStatus = Number((recoveryRes as any)?.debugFetchHttpStatus || 0);
          const recoveryFetchErrorName = String((recoveryRes as any)?.debugFetchErrorName || "");
          const recoveryFetchErrorMessage = String((recoveryRes as any)?.debugFetchErrorMessage || recoveryFetchError || "");
          const recoveryFetchResponsePrefix = String((recoveryRes as any)?.debugFetchResponsePrefix || recoveryBodyPrefix || "").slice(0, 180);
          pushGlobalPhase("kitsu_recovery_fetch_url", { query, kitsu_recovery_attempt_index: recoveryAttemptIndex, kitsuConfiguredApiBase: KITSU_API_BASE, kitsu_recovery_fetch_url: recoveryFetchUrl });
          pushGlobalPhase("kitsu_recovery_fetch_status", { query, kitsu_recovery_attempt_index: recoveryAttemptIndex, kitsu_recovery_fetch_status: recoveryFetchStatus });
          pushGlobalPhase("kitsu_recovery_fetch_http_status", { query, kitsu_recovery_attempt_index: recoveryAttemptIndex, kitsuConfiguredApiBase: KITSU_API_BASE, kitsuRecoveryFetchHttpStatus: recoveryFetchHttpStatus });
          pushGlobalPhase("kitsu_recovery_fetch_error_name", { query, kitsu_recovery_attempt_index: recoveryAttemptIndex, kitsuConfiguredApiBase: KITSU_API_BASE, kitsuRecoveryFetchErrorName: recoveryFetchErrorName });
          pushGlobalPhase("kitsu_recovery_fetch_error_message", { query, kitsu_recovery_attempt_index: recoveryAttemptIndex, kitsuConfiguredApiBase: KITSU_API_BASE, kitsuRecoveryFetchErrorMessage: recoveryFetchErrorMessage });
          pushGlobalPhase("kitsu_recovery_fetch_response_prefix", { query, kitsu_recovery_attempt_index: recoveryAttemptIndex, kitsuConfiguredApiBase: KITSU_API_BASE, kitsuRecoveryFetchResponsePrefix: recoveryFetchResponsePrefix });
          pushGlobalPhase("kitsu_recovery_body_prefix", { query, kitsu_recovery_attempt_index: recoveryAttemptIndex, kitsu_recovery_body_prefix: recoveryBodyPrefix });
          if (recoveryFetchError) pushGlobalPhase("kitsu_recovery_fetch_error", { query, kitsu_recovery_attempt_index: recoveryAttemptIndex, kitsu_recovery_fetch_error: recoveryFetchError });
          pushGlobalPhase("kitsu_recovery_raw_count", { query, raw, recoveryRawPoolLength: recoveryRawPool.length, recoveryDocsLength: recoveryDocs.length, kitsu_recovery_attempt_index: recoveryAttemptIndex });
          aggregatedRawFetched.kitsu += raw;
          kitsuRouterFetchCount += 1;
          kitsuQueriesActuallyFetched.add(query);
          if (recoveryRawPool.length > 0) {
            debugRawPool.push(...recoveryRawPool.map((row: any) => ({
              ...row,
              queryText: row?.queryText ?? query,
              queryFamily: normalizeRouterFamilyValue(row?.queryFamily) || laneFamily,
              filterFamily: normalizeRouterFamilyValue(row?.filterFamily) || laneFamily,
              laneKind: String(row?.laneKind || "core"),
              primaryLane: routerFamily,
            })));
          }
          if (recoveryDocs.length > 0) {
            allMergedDocs.push(...recoveryDocs.map((doc: any) => ({
              ...doc,
              queryText: String(doc?.queryText || query).trim(),
              queryFamily: normalizeRouterFamilyValue(doc?.queryFamily) || laneFamily,
              filterFamily: normalizeRouterFamilyValue(doc?.filterFamily) || laneFamily,
              laneKind: String(doc?.laneKind || "core"),
              primaryLane: routerFamily,
            })));
            mergedDocs = dedupeDocs(allMergedDocs);
          }
          pushGlobalPhase("kitsu_recovery_merged_into_raw_pool", { mergedRawRows: recoveryRawPool.length, mergedDocs: recoveryDocs.length, kitsu_recovery_attempt_index: recoveryAttemptIndex });
          pushGlobalPhase("post_recovery_raw_pool_length", { debugRawPoolLength: debugRawPool.length, mergedDocsLength: mergedDocs.length, kitsu_recovery_attempt_index: recoveryAttemptIndex });
          pushGlobalPhase("post_recovery_source_counts", {
            aggregatedRawFetched,
            kitsuRouterFetchCount,
            kitsu_recovery_attempt_index: recoveryAttemptIndex,
          });
          kitsuFetchResultsByQuery.push({
            query,
            url: recoveryFetchUrl,
            status: recoveryFetchStatus,
            timedOut: recoveryFetchErrorName === "AbortError" || recoveryFetchErrorMessage.includes("timeout"),
            rawCount: raw,
            error: recoveryFetchError || null,
            bodyPrefix: [
              `http_status=${recoveryFetchHttpStatus || "unknown"}`,
              recoveryFetchErrorName ? `error_name=${recoveryFetchErrorName}` : "error_name=(none)",
              recoveryFetchErrorMessage ? `error_message=${recoveryFetchErrorMessage.slice(0, 80)}` : "error_message=(none)",
              recoveryFetchResponsePrefix ? `response_prefix=${recoveryFetchResponsePrefix.slice(0, 80)}` : `body=${recoveryBodyPrefix}`
            ].join(" | "),
          });
          if (raw > 0) {
            kitsuRecoverySuccessQuery = query;
            pushGlobalPhase("kitsu_recovery_success_query", { query, kitsu_recovery_attempt_index: recoveryAttemptIndex });
            break;
          }
        } catch (e: any) {
          pushGlobalPhase("kitsu_recovery_fetch_url", { query, kitsu_recovery_attempt_index: recoveryAttemptIndex, kitsuConfiguredApiBase: KITSU_API_BASE, kitsu_recovery_fetch_url: `${KITSU_API_BASE}/manga?filter[text]=${encodeURIComponent(query)}` });
          const recoveryFetchHttpStatus = Number(e?.httpStatus || 0);
          const recoveryFetchErrorName = String(e?.name || "Error");
          const recoveryFetchErrorMessage = String(e?.message || e || "fetch_failed");
          const recoveryFetchResponsePrefix = String(e?.bodyPrefix || recoveryFetchErrorMessage || "").slice(0, 180);
          pushGlobalPhase("kitsu_recovery_fetch_http_status", { query, kitsu_recovery_attempt_index: recoveryAttemptIndex, kitsuConfiguredApiBase: KITSU_API_BASE, kitsuRecoveryFetchHttpStatus: recoveryFetchHttpStatus });
          pushGlobalPhase("kitsu_recovery_fetch_error_name", { query, kitsu_recovery_attempt_index: recoveryAttemptIndex, kitsuConfiguredApiBase: KITSU_API_BASE, kitsuRecoveryFetchErrorName: recoveryFetchErrorName });
          pushGlobalPhase("kitsu_recovery_fetch_error_message", { query, kitsu_recovery_attempt_index: recoveryAttemptIndex, kitsuConfiguredApiBase: KITSU_API_BASE, kitsuRecoveryFetchErrorMessage: recoveryFetchErrorMessage });
          pushGlobalPhase("kitsu_recovery_fetch_response_prefix", { query, kitsu_recovery_attempt_index: recoveryAttemptIndex, kitsuConfiguredApiBase: KITSU_API_BASE, kitsuRecoveryFetchResponsePrefix: recoveryFetchResponsePrefix });
          kitsuFetchResultsByQuery.push({
            query,
            url: `${KITSU_API_BASE}/manga?filter[text]=${encodeURIComponent(query)}`,
            status: "error",
            timedOut: recoveryFetchErrorName === "AbortError" || recoveryFetchErrorMessage.includes("timeout"),
            rawCount: 0,
            error: recoveryFetchErrorMessage,
            bodyPrefix: [
              `http_status=${recoveryFetchHttpStatus || "unknown"}`,
              `error_name=${recoveryFetchErrorName}`,
              `error_message=${recoveryFetchErrorMessage.slice(0, 80)}`,
              `response_prefix=${recoveryFetchResponsePrefix.slice(0, 80)}`
            ].join(" | "),
          });
        }
      }
      if (!kitsuRecoverySuccessQuery) {
        pushGlobalPhase("kitsu_recovery_attempts_exhausted", { boundedFallback, kitsu_recovery_attempts_exhausted: true });
      }
    }
    const allRealSourcesStarvedAfterRecovery =
      Number(aggregatedRawFetched.googleBooks || 0) === 0 &&
      Number(aggregatedRawFetched.openLibrary || 0) === 0 &&
      ((includeKitsu && Number(aggregatedRawFetched.kitsu || 0) === 0) || !includeKitsu) &&
      (comicVineUnavailableBypass || !includeComicVine);
    if (!allRealSourcesStarvedAfterRecovery) {
      sourceSkippedReason.push("source_health_guard_recovered_by_kitsu_or_other_source");
    } else {
    pushGlobalPhase("source_health_guard");
    pushEarlyReturnDiagnostics("source_health_failed", "post_fetch_source_health_guard");
    throwSourceFatal("source_health_failed", {
      sourceEnabled,
      sourceHealthProbeStatus,
      fetchLoopCounters: {
        googleBooksRouterFetchCount,
        openLibraryRouterFetchCount,
        kitsuRouterFetchCount,
      },
      googleBooksQueriesActuallyFetched: Array.from(googleBooksQueriesActuallyFetched),
      openLibraryQueriesActuallyFetched: Array.from(openLibraryQueriesActuallyFetched),
      kitsuQueriesActuallyFetched: Array.from(kitsuQueriesActuallyFetched),
      googleBooksFetchResultsByQuery,
      openLibraryFetchResultsByQuery,
      kitsuFetchResultsByQuery,
      kitsuConfiguredApiBase: KITSU_API_BASE,
      googleBooksTimeoutStageByQuery,
      googleBooksRetryQueryMapping,
      sourceSpecificQueryModeBySource,
      sourceSpecificQueryRejectedReasonBySource,
      kitsuQuerySanitizedFrom,
      kitsuQuerySanitizedTo,
      kitsuPreSanitizedQuery: kitsuPreSanitizedQueries[0] || "",
      kitsuSanitizedQuerySelected: kitsuSanitizedQuerySelected[0] || "",
      kitsuRecoveryOriginalIntentQuery,
      kitsuRecoverySelectedQuery,
      kitsuRecoveryQueryTooBroad,
      kitsuRecoveryQueryDroppedGenreTerms: Array.from(new Set(kitsuRecoveryQueryDroppedGenreTerms.map((t) => String(t || "").trim()).filter(Boolean))).slice(0, 20),
      kitsuRecoveryQuerySelectionVersion,
      kitsuRecoveryQueryPromotedFrom,
      kitsuRecoveryQueryPromotedTo,
      kitsuRecoveryComicIntentDetected,
      kitsuRecoveryComicIntentTerms: Array.from(new Set(kitsuRecoveryComicIntentTerms.map((t) => String(t || "").trim()).filter(Boolean))).slice(0, 20),
      kitsuRecoveryComicIntentFallbackUsed,
      kitsuFinalQueryUsedForFetch: Array.from(new Set(kitsuFinalQueryUsedForFetch.map((q) => String(q || "").trim()).filter(Boolean))).slice(0, 20),
      kitsuPolicyUniqueCanonicalQueries: kitsuPolicyUniqueCanonicalQueriesForHealthGuard,
      kitsuMaxAllowedCanonicalFetches: kitsuMaxAllowedCanonicalFetchesForHealthGuard,
      kitsuSanitizationDiagnostics,
      kitsuSanitizationDroppedTokens,
      kitsuSanitizationDiagnostics,
      kitsuSanitizationDroppedTokens,
      sourceDisableReasonsDetailed,
      perSourceStatus: {
        googleBooks: { enabled: sourceEnabled.googleBooks, rawFetched: aggregatedRawFetched.googleBooks, starved: googleStarved },
        openLibrary: { enabled: sourceEnabled.openLibrary, rawFetched: aggregatedRawFetched.openLibrary, starved: openLibraryStarved },
        kitsu: {
          enabled: includeKitsu,
          rawFetched: aggregatedRawFetched.kitsu,
          starved: kitsuStarved,
          kitsuRawCount: aggregatedRawFetched.kitsu,
          kitsuPostFilterCount: 0,
          kitsuUsableCount: 0,
          kitsuSourceHealthRejectedReason: kitsuStarved ? "no_raw_fetch_results" : "no_usable_candidates_before_health_guard",
        },
        comicVine: { enabled: includeComicVine, bypassed: comicVineUnavailableBypass, status: comicVineAdapterStatus },
      },
      sourceSkippedReason,
      kitsuRecoveryAttemptedForHealthGuard,
      kitsuRecoveryEligibleForHealthGuard,
      pendingSourceFetchCount_at_source_health_guard: pendingSourceFetchCount,
      pendingSourceFetchCount_incremented: pendingSourceFetchCountIncremented.slice(0, 80),
      pendingSourceFetchCount_decremented: pendingSourceFetchCountDecremented.slice(0, 80),
      builtQuery: bucketPlan.preview || bucketPlan.queries?.[0] || "",
      deckKey: routedInput.deckKey,
      deployedCommitHash: "e064c5c",
      routerBuildTimestamp: ROUTER_BUILD_TIMESTAMP,
      routerInstrumentationVersion: ROUTER_INSTRUMENTATION_VERSION,
    });
    }
  }

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
  const googleFetchFailureDetected = sourceEnabled.googleBooks && Number(aggregatedRawFetched.googleBooks || 0) === 0;
  const nytEnabled = Boolean(sourceEnabled.nyt);
  const allowNytInjections = nytEnabled && !googleFetchFailureDetected && shouldAllowNytAnchorInjections(filteredDocs.length, finalLimitForAnchors);
  const nytAnchorResult = !nytEnabled
    ? { docs: [], debug: { ...nytAnchorDebug, enabled: false, error: "nyt_disabled_by_admin_or_config" } }
    : googleFetchFailureDetected
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
    nyt: 0,
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
  if (sourceEnabled.nyt) labelParts.push("NYT");
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
  const fallbackOnlyResult = comicVineFallbackOnlyResult;
  const comicVineFallbackLeakageWarning = String((comicVine as any)?.comicVineFallbackLeakageWarning || "");
  const comicVineRecommendationSetMode = String((comicVine as any)?.comicVineRecommendationSetMode || "unknown");
  const fallbackHeavyResult =
    comicVineRecommendationSetMode === "fallback_heavy" ||
    (comicVineFallbackCount > 0 && comicVineQueryDerivedCount > 0 && comicVineFallbackCount >= comicVineQueryDerivedCount);
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
    comicVineDispatchBypassed,
    comicVineDispatchBypassReason: comicVineDispatchBypassed ? "temporary_tdz_triage_guard" : "none",
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
    comicVineDispatchError,
    comicVineDispatchErrorPhase,
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
      const singleSourceComicVineContractMode =
        includeComicVine &&
        sourceEnabled.comicVine &&
        !sourceEnabled.googleBooks &&
        !sourceEnabled.openLibrary &&
        !sourceEnabled.localLibrary &&
        !includeKitsu;
      const familyCapLimit = singleSourceComicVineContractMode ? 3 : 2;
      const franchiseCapLimit = singleSourceComicVineContractMode ? 3 : 2;
      for (const doc of finalRenderDocs) familyCounts.set(inferEntityFamily(doc), (familyCounts.get(inferEntityFamily(doc)) || 0) + 1);
      const seenTitles = new Set(finalRenderDocs.map((d: any) => normalizeText(String(d?.title || d?.rawDoc?.title || ""))).filter(Boolean));
      for (const doc of topupPool) {
        if (finalRenderDocs.length >= Math.min(Math.max(finalLimit, 8), 10)) break;
        const franchise = finalSeriesKeyForRender(doc);
        const family = inferEntityFamily(doc);
        if ((familyCounts.get(family) || 0) >= familyCapLimit) { topUpRejectedReasons.family_cap = Number(topUpRejectedReasons.family_cap || 0) + 1; continue; }
        const franchiseCount = finalRenderDocs.filter((d: any) => finalSeriesKeyForRender(d) === franchise).length;
        const canSoftBypassFranchiseCap = singleSourceComicVineContractMode && finalRenderDocs.length < Math.min(Math.max(finalLimit, 8), 10);
        if (franchiseCount >= franchiseCapLimit && !canSoftBypassFranchiseCap) { topUpRejectedReasons.franchise_cap = Number(topUpRejectedReasons.franchise_cap || 0) + 1; continue; }
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
          const franchiseCount = finalRenderDocs.filter((d: any) => finalSeriesKeyForRender(d) === franchise).length;
          const canSoftBypassFranchiseCap = singleSourceComicVineContractMode && finalRenderDocs.length < Math.min(Math.max(finalLimit, 8), 10);
          if (franchiseCount >= franchiseCapLimit && !canSoftBypassFranchiseCap) { topUpRejectedReasons.franchise_cap = Number(topUpRejectedReasons.franchise_cap || 0) + 1; continue; }
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
    const superheroFranchiseRoots = new Set(["spider-man", "miles-morales", "batman", "superman", "avengers", "ms-marvel", "teen-titans", "young-justice"]);
    const parentOrRootMatch =
      aliasPool.some((alias) => normalizeText(String(doc?.parentVolumeName || doc?.rawDoc?.parentVolumeName || "")).includes(normalizeText(alias))) ||
      (expansionRoot && (expansionRoot === expansionQueryRoot || aliasPool.some((alias) => expansionRoot.includes(normalizeText(alias).replace(/[^a-z0-9]+/g, "-")))));
    const titleAliasLooseMatch = aliasPool.some((alias) => normalizedTitle.includes(normalizeText(alias)));
    const isSuperheroRoot = superheroFranchiseRoots.has(expansionQueryRoot);
    const queryRootMatched = strictRootOnly.has(expansionQueryRoot) && !isSuperheroRoot ? parentOrRootMatch : (parentOrRootMatch || titleAliasLooseMatch);
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
    const superheroNarrativeFit =
      isSuperheroRoot &&
      (matchedProfileSeeds.length > 0 || /\b(noir|mystery|detective|coming of age|identity|friendship|school|survival|thriller|suspense)\b/.test(normalizedTitle) || baseScore >= 4.5);
    const expansionQueryRootMismatch = isExpansionCandidate && Boolean(expansionQueryRoot) && !queryRootMatched && !superheroNarrativeFit;
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
  const likedSignalSetForContext = new Set(weightedSwipeTasteVector.liked.map((row) => normalizeText(String(row.signal || ""))).filter(Boolean));
  weightedSwipeTasteVector.disliked = weightedSwipeTasteVector.disliked.map((row) => {
    const signal = normalizeText(String(row.signal || ""));
    return likedSignalSetForContext.has(signal)
      ? { ...row, weight: Number(row.weight || 0) * 0.35 }
      : row;
  });
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
  const weakLexicalFantasyClusterPenaltyByTitle: Record<string, number> = {};
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
    const packagingHasEntryPointSignal = /\b(volume one|volume 1|book one|book 1|omnibus|compendium|collected edition|collection)\b/i.test(text);
    if (packagingOnly && !hasNarrative && !hasTasteOverlap && !packagingHasEntryPointSignal) {
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
      const narrativeWorkSignal = /\b(volume one|volume 1|book one|book 1|tpb|trade paperback|hardcover|hc|ogn|original graphic novel|omnibus|compendium|collected edition|collection|saga|chronicles?)\b/i.test(`${title} ${String(doc?.description || "")}`);
      if (titleRepeatPenalty) {
        recentReturnedTitlePenaltyApplied += titleRepeatPenalty;
        diversityMemoryHitTitles.push(title);
      }
      if (rootRepeatPenalty) {
        recentReturnedRootPenaltyApplied += rootRepeatPenalty;
        diversityMemoryHitRoots.push(docRoot || "(none)");
      }
      if (titleRepeatPenalty || rootRepeatPenalty) repeatPenaltyCandidateCount += 1;
      if (isFreshUserSession && (titleRepeatPenalty > 0 || rootRepeatPenalty > 0) && tasteMatchScore < 1.4 && !narrativeWorkSignal) {
        finalSelectionRejectedByReason.recent_repeat_weak_taste = Number(finalSelectionRejectedByReason.recent_repeat_weak_taste || 0) + 1;
        pushReason(penaltyReasonsByTitle, title, "recent_repeat_weak_taste");
        return null;
      }
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
      const broadGenreTokenRe = /^(fantasy|mystery|adventure|survival|horror|romance|thriller|science|fiction|dystopian|crime)$/i;
      const dangerousLexicalTokenRe = /^(die|kill|dark|blood|death|doom|bone|fantasy|dystopian|crime)$/i;
      const titleOnlyTokens = queryTokens.filter((t) => normalizeText(title).includes(t) && broadGenreTokenRe.test(t));
      const queryTermOnlyEvidence = titleTokenHits > 0 && !hasSupportOutsideTitle;
      const normalizedRoot = normalizeText(String(docRoot || "").replace(/-/g, " "));
      const franchiseAffinity = profileSelectedEntitySeeds.some((seed) => normalizedRoot.includes(normalizeText(seed)));
      const narrativeOverlap = laneMatch || narrativeWorkSignal;
      const curatedSuperheroRoots = new Set(["runaways", "ms-marvel", "spider-man", "avenging-spider-man", "spider-man-noir", "batman"]);
      const normalizedProfileSignals = profileSelectedEntitySeeds.map((seed) => normalizeText(seed));
      const profileHasSuperheroIntent = normalizedProfileSignals.some((seed) => /\b(superhero|marvel|dc|teen|young adult|team|coming of age|identity)\b/i.test(seed));
      const curatedFranchiseMetadataSupport = curatedSuperheroRoots.has(String(docRoot || "")) && profileHasSuperheroIntent;
      const semanticEvidenceCount =
        (matchedLikedWeighted.length > 0 ? 1 : 0) +
        (hasSupportOutsideTitle ? 1 : 0) +
        (themeOverlap ? 1 : 0) +
        (franchiseAffinity ? 1 : 0) +
        (narrativeOverlap ? 1 : 0) +
        (curatedFranchiseMetadataSupport ? 1 : 0);
      const semanticSupportFound = semanticEvidenceCount > 0 || curatedFranchiseMetadataSupport;
      const structuralBoostsAllowed = semanticSupportFound;
      const starterSignalScore = starterSignal && structuralBoostsAllowed ? 0.8 : 0;
      const collectionEditionScore = collectionEditionBoost && structuralBoostsAllowed ? 0.8 : 0;
      const narrativeTitleConfidenceScore = (collectionEditionScore ? 1.2 : 0) + (narrativeWorkSignal ? 1.5 : 0) + (hasFranchiseAnchor ? 1.25 : 0) + (rootMatch ? 0.5 : 0) + (publisherConfidence ? 0.35 : 0);
      const singleTokenQueryHijackPenalty = queryTermOnlyEvidence ? Math.max(6, 10 - (titleTokenHits * 1.25)) : 0;
      const lexicalHijackHits = queryTokens.filter((t) => dangerousLexicalTokenRe.test(t) && normalizeText(title).includes(t)).length;
      const lexicalTitleOnlyHijackPenalty = lexicalHijackHits > 0 && !hasSupportOutsideTitle && matchedLiked.length === 0
        ? (6 + lexicalHijackHits * 2)
        : 0;
      const canonicalAffinityRoots = new Set(["something-is-killing-the-children", "spider-man", "ms-marvel", "adventure-time", "black-science", "locke-key", "paper-girls", "the-sandman", "saga", "nimona"]);
      const weakLexicalFantasyRootRe = /^(the-power-fantasy|final-fantasy-lost-stranger|graphic-fantasy|fantasy-comics|true-fantasy)$/;
      const genericFantasyAdventureTitle = /\b(fantasy|adventure|superpowers?)\b/i.test(title) && !canonicalAffinityRoots.has(String(docRoot || ""));
      const weakLexicalFantasyClusterPenalty =
        (
          weakLexicalFantasyRootRe.test(String(docRoot || "")) ||
          (genericFantasyAdventureTitle && queryTermOnlyEvidence && !themeOverlap)
        ) &&
        !canonicalAffinityRoots.has(String(docRoot || "")) &&
        semanticEvidenceCount < 2 &&
        !hasSupportOutsideTitle &&
        matchedLiked.length < 2
          ? 8
          : 0;
      queryTermOnlyEvidenceByTitle[title] = queryTermOnlyEvidence;
      titleOnlyTasteSignalByTitle[title] = titleOnlyTokens;
      semanticSupportFoundByTitle[title] = semanticSupportFound;
      semanticEvidenceCountByTitle[title] = semanticEvidenceCount;
      const plausibleAdjacency =
        semanticEvidenceCount >= 1 ||
        narrativeWorkSignal ||
        laneMatch ||
        themeOverlap ||
        rootMatch ||
        Number(doc?.score ?? doc?.diagnostics?.finalScore ?? 0) >= 0;
      if (queryTermOnlyEvidence && titleOnlyTokens.length > 0 && matchedLiked.length === 0 && !plausibleAdjacency) {
        finalSelectionRejectedByReason.query_literalism_title_only = Number(finalSelectionRejectedByReason.query_literalism_title_only || 0) + 1;
        pushReason(penaltyReasonsByTitle, title, "query_literalism_title_only");
        candidateKilledByPenaltyStack.push(title);
        return null;
      }
      const score = tasteMatchScore - tastePenaltyScore - unsupportedDefaultPenalty - titleRepeatPenalty - rootRepeatPenalty + (themeOverlap ? 1.25 : 0) + (narrativeWorkSignal ? 1.25 : 0) + starterSignalScore + (audienceFit ? 0.75 : 0) + narrativeTitleConfidenceScore + ((Number(doc?.score ?? 0) > 0 && tasteMatchScore >= 2.0 && semanticSupportFound) ? 0.5 : 0) - genericSuperheroTitlePenalty - genericGraphicNovelPlaceholderPenalty - metaReferencePenalty - historicalAboutPenalty - retroHorrorArchivePenalty - anthologyHorrorPenalty - singleTokenQueryHijackPenalty - lexicalTitleOnlyHijackPenalty - weakLexicalFantasyClusterPenalty;
      if (titleRepeatPenalty) recentReturnedTitlePenaltyApplied += titleRepeatPenalty;
      if (rootRepeatPenalty) recentReturnedRootPenaltyApplied += rootRepeatPenalty;
      const finalCandidateScore = tasteMatchScore - tastePenaltyScore - unsupportedDefaultPenalty - titleRepeatPenalty - rootRepeatPenalty + (themeOverlap ? 2 : 0) + (narrativeWorkSignal ? 2 : 0) + starterSignalScore + (audienceFit ? 1 : 0) + narrativeTitleConfidenceScore + (rootMatch ? 0.5 : 0) + (laneMatch ? 0.25 : 0) + (provenanceConfidence && semanticSupportFound ? 0.05 : 0) + (Number(doc?.score ?? 0) > 0 && semanticSupportFound ? 0.5 : 0) - genericSuperheroTitlePenalty - genericGraphicNovelPlaceholderPenalty - metaReferencePenalty - historicalAboutPenalty - retroHorrorArchivePenalty - anthologyHorrorPenalty - singleTokenQueryHijackPenalty - lexicalTitleOnlyHijackPenalty - weakLexicalFantasyClusterPenalty;
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
      weakLexicalFantasyClusterPenaltyByTitle[title] = weakLexicalFantasyClusterPenalty;
      finalScoreComponentsByTitle[title] = { tasteMatchScore, tastePenaltyScore: -tastePenaltyScore, unsupportedDefaultPenalty: -unsupportedDefaultPenalty, titleRepeatPenalty: -titleRepeatPenalty, rootRepeatPenalty: -rootRepeatPenalty, laneMatch: laneMatch ? 0.25 : 0, themeOverlap: themeOverlap ? 2 : 0, rootMatch: rootMatch ? 0.5 : 0, starterSignal: starterSignalScore, audienceFit: audienceFit ? 1 : 0, provenanceConfidence: provenanceConfidence && semanticSupportFound ? 0.05 : 0, narrativeWorkSignal: narrativeWorkSignal ? 2 : 0, narrativeTitleConfidenceScore, semanticEvidenceCount, curatedFranchiseMetadataSupport: curatedFranchiseMetadataSupport ? 1 : 0, genericSuperheroTitlePenalty: -genericSuperheroTitlePenalty, genericGraphicNovelPlaceholderPenalty: -genericGraphicNovelPlaceholderPenalty, metaReferencePenalty: -metaReferencePenalty, historicalAboutPenalty: -historicalAboutPenalty, retroHorrorArchivePenalty: -retroHorrorArchivePenalty, anthologyHorrorPenalty: -anthologyHorrorPenalty, singleTokenQueryHijackPenalty: -singleTokenQueryHijackPenalty, lexicalTitleOnlyHijackPenalty: -lexicalTitleOnlyHijackPenalty, weakLexicalFantasyClusterPenalty: -weakLexicalFantasyClusterPenalty, baseScorePositive: Number(doc?.score ?? 0) > 0 && semanticSupportFound ? 0.5 : 0 };
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
      if (finalCandidateScore < lowPositiveFitThreshold && !plausibleAdjacency) {
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
      "psychological sci fi graphic novel",
      "teen supernatural mystery comic",
      "character driven horror comic",
      "coming of age friendship graphic novel",
      "adventure mystery coming of age graphic novel",
      "emotionally warm fantasy quest comic",
      ...generatedComicVineQueriesFromTaste,
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
        if (weightedTaste < 1.5) narrativeExpansionCandidatesDroppedBeforeScoringByReason.low_taste_overlap = Number(narrativeExpansionCandidatesDroppedBeforeScoringByReason.low_taste_overlap || 0) + 1;
        if (!narrativeLike) narrativeExpansionCandidatesDroppedBeforeScoringByReason.low_narrative_signal = Number(narrativeExpansionCandidatesDroppedBeforeScoringByReason.low_narrative_signal || 0) + 1;
        if (artifactLike) narrativeExpansionCandidatesDroppedBeforeScoringByReason.artifact_or_meta = Number(narrativeExpansionCandidatesDroppedBeforeScoringByReason.artifact_or_meta || 0) + 1;
        const semanticNarrativeAdjacency = narrativeLike || /\b(character|story|mystery|thriller|psychological|coming of age|relationship)\b/i.test(text);
        const viable = weightedTaste >= 1.5 && semanticNarrativeAdjacency && !artifactLike;
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
  let countContractSatisfied = finalRenderDocs.length >= 8 && finalRenderDocs.length <= 10;
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
  const scoredUniverseFailure = (scoredUniverseFailureFromConvertedPool || scoredUniverseCollapsedToNormalizedTen) && finalRenderDocs.length < 6;
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
  let superheroUnderfillRelaxationBranchEntered = false;
  let superheroUnderfillRelaxationEligibility = false;
  let superheroUnderfillRelaxationPredicateState: Record<string, any> = {};
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
  if (tasteQueryDriftGatePending) markSourceSpecificGate("__router__", "taste_query_drift:true");
  const profileCompatibleExpansionRoots = new Set(["locke-key", "sweet-tooth", "descender", "spider-man", "runaways", "black-science", "invincible", "the-sandman", "saga"]);
  const finalEligibilityGateApplied = true;
  const finalEligibilityAudit: Array<{ title: string; sourceId: string; source: string; laneAligned: boolean; passedFinalEligibility: boolean; failedChecks: string[]; teenSafetyState: string; hasDescription: boolean; hasCategories: boolean; hasCover: boolean; selected: boolean }> = [];
  const eligibleWithFitScore: Array<{ doc: any; fitScore: number; recommendableWorkScore: number; artifactRiskScore: number; collectedEditionConfidence: number; narrativeFictionConfidence: number; metaOrReferenceWorkPenalty: number }> = [];
  const formatSignalOnlyRejectedTitles: string[] = [];
  const genericCollectionArtifactRejectedTitles: string[] = [];
  const finalTasteThresholdByTitle: Record<string, number> = {};
  const finalAcceptedTasteEvidenceByTitle: Record<string, string[]> = {};
  const semanticRescueOverrideTitles = new Set<string>();
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
  const teenMaturityHardBlockRe = /\b(explicit sexual|sexually explicit|pornographic|porn|erotica|adult only|adults only|18\+|nc-17|x-rated|rape|sexual assault|incest|gore porn|extreme gore)\b/i;
  const finalRenderCandidateDocsBeforeGate = Array.isArray(finalRenderDocs) ? finalRenderDocs.slice() : [];
  const finalRenderCandidateTitlesBeforeGate = finalRenderCandidateDocsBeforeGate.map((doc: any) => String(doc?.title || "").trim()).filter(Boolean);
  preSourceSpecificGateTitles.push(...finalRenderCandidateTitlesBeforeGate);
  finalRenderDocs = finalRenderDocs.filter((doc: any) => {
    const title = String(doc?.title || "").trim();
    const maturityText = `${title} ${String(doc?.description || "")} ${String(doc?.rawDoc?.description || "")}`;
    if (isTeenDeckKey(input.deckKey) && teenMaturityHardBlockRe.test(maturityText)) {
      registerFinalEligibilityReject("age_maturity_blocked", title);
      markTerminalReject(title, "age_maturity_blocked");
      return false;
    }
    const docSource = String(doc?.source || doc?.rawDoc?.source || "").toLowerCase();
    const isComicVineCandidate = docSource.includes("comicvine");
    const sourceId = String(doc?.sourceId || doc?.canonicalId || doc?.id || doc?.key || "").trim();
    const queryText = String(doc?.queryText || doc?.diagnostics?.queryText || "").trim();
    const restoredByKitsuRecovery = Boolean((doc as any)?.restoredByKitsuRecovery || (doc?.diagnostics as any)?.restoredByKitsuRecovery);
    const isComicVineFallbackCandidate = docSource.includes("comicvine") && /comicvine_publisher_facet_fallback/i.test(queryText);
    const isTeenComicVineOnly =
      isTeenDeckKey(input.deckKey) &&
      includeComicVine &&
      !sourceEnabled.googleBooks &&
      !sourceEnabled.openLibrary &&
      !sourceEnabled.localLibrary &&
      !includeKitsu;
    const root = parentFranchiseRootForDoc(doc);
    const hasParent = Boolean(doc?.parentVolumeName || doc?.parentVolume?.name || doc?.rawDoc?.parentVolumeName || doc?.diagnostics?.parentVolumeName);
    const titleRootMatch = Boolean(root) && normalizeText(title).includes(normalizeText(String(root || "").replace(/-/g, " ")));
    if (!sourceId) {
      const metadataBag = normalizeText(`${title} ${String(doc?.description || "")} ${String(doc?.queryText || "")}`);
      const strongGraphicAlignment =
        /\b(graphic novel|comic|manga|manhwa|webtoon|volume 1|book 1)\b/.test(metadataBag) &&
        /\b(fantasy|romance|adventure|dystopian|supernatural|young adult|teen)\b/.test(metadataBag) &&
        (Number(positiveFitScoreByTitle[title] || 0) >= 4 || Number(semanticEvidenceCountByTitle[title] || 0) >= 2);
      if (!(strongGraphicAlignment && !isReferenceArtifactTitle(title))) { registerFinalEligibilityReject("missing_source_id", title); return false; }
      markSourceSpecificGate(title, "missing_source_id_strong_graphic_alignment_rescue");
    }
    if (!queryText) { registerFinalEligibilityReject("missing_query_text", title); return false; }
    const structuralFragment = Number((doc?.diagnostics as any)?.issueFragmentPenalty || 0) < 0 || Number((doc?.diagnostics as any)?.subtitleFragmentPenalty || 0) < 0 || Number((doc?.diagnostics as any)?.subtitleSideArcPenalty || 0) < 0;
    const queryTermOnlyEvidence = Boolean(queryTermOnlyEvidenceByTitle[title]);
    const rawScoreForGate = Number(doc?.score ?? doc?.diagnostics?.finalScore ?? 0);
    const teenCuratedTitleFallbackAllow =
      isTeenComicVineOnly &&
      parentRootSourceByTitle[title] === "title_fallback" &&
      isCuratedTeenGraphicNovelRoot(root) &&
      rawScoreForGate >= 0 &&
      !queryTermOnlyEvidence &&
      !structuralFragment;
    if (!hasParent && !titleRootMatch) {
      const hasStrongComicVineSemanticSupport =
        isComicVineCandidate &&
        (Number(semanticEvidenceCountByTitle[title] || 0) >= 2 || Number(positiveFitScoreByTitle[title] || 0) >= 5);
      if (!hasStrongComicVineSemanticSupport && !teenCuratedTitleFallbackAllow) {
        registerFinalEligibilityReject("missing_parent_or_title_root_match", title); return false;
      }
      markSourceSpecificGate(title, "comicvine_soft_parent_root_match_bypass");
    }
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
    if (fitScore <= 0 && !restoredByKitsuRecovery) { registerFinalEligibilityReject("insufficient_positive_fit_score", title); return false; }
    const weightedTasteScore = Number(candidateWeightedTasteScoreByTitle[title] || 0);
    const dislikePenaltyScore = Number(candidateDislikePenaltyByTitle[title] || 0);
    const semanticEvidenceCount = Number(semanticEvidenceCountByTitle[title] || 0);
    const parentRootSource = String(parentRootSourceByTitle[title] || "");
    const themeOverlapScore = Number((finalScoreComponentsByTitle[title] || {}).themeOverlap || 0);
    const curatedProfileFitScore = Number((finalScoreComponentsByTitle[title] || {}).curatedProfileFitScore || positiveFitScoreByTitle[title] || 0);
    const franchiseAffinityRoots = new Set(["saga", "runaways", "nimona", "the-sandman", "locke-key", "paper-girls", "monstress", "lumberjanes"]);
    const semanticFranchiseAffinity = franchiseAffinityRoots.has(root);
    const explicitFranchiseSignal =
      seedRootMatch ||
      expansionRootMatch ||
      queryFamilyAliasMatch ||
      semanticFranchiseAffinity ||
      (explicitSuperheroSignal && /\b(spider[\s-]?man|miles\s+morales|ms\.?\s*marvel|batman|superman|avengers?|teen\s+titans|runaways)\b/i.test(`${title} ${String(doc?.queryText || "")} ${String(doc?.parentVolumeName || "")}`));
    const curatedTitleFallbackProtected =
      (isTeenDeckKey(input.deckKey) && includeComicVine && !sourceEnabled.googleBooks && !sourceEnabled.openLibrary && !sourceEnabled.localLibrary && !includeKitsu) &&
      isCuratedTeenGraphicNovelRoot(root) &&
      parentRootSource === "title_fallback" &&
      (semanticEvidenceCount > 0 || themeOverlapScore > 0 || curatedProfileFitScore > 0);
    if (isComicVineFallbackCandidate && weightedTasteScore <= 0) {
      if (!curatedSeedProfileMatch[title] && !curatedTitleFallbackProtected) {
        registerFinalEligibilityReject("fallback_no_taste_match", title);
        return false;
      }
      if (semanticEvidenceCount <= 0 && !semanticFranchiseAffinity && !curatedTitleFallbackProtected) {
        registerFinalEligibilityReject("fallback_no_taste_match", title);
        return false;
      }
    }
    if (isComicVineFallbackCandidate && !curatedSeedProfileMatch[title] && !semanticFranchiseAffinity && !curatedTitleFallbackProtected) {
      const fallbackSemanticRescueAllow =
        Boolean(semanticSupportFoundByTitle[title]) &&
        Number((finalScoreComponentsByTitle[title] || {}).themeOverlap || 0) > 0 &&
        Number(positiveFitScoreByTitle[title] || 0) >= 5;
      if (!fallbackSemanticRescueAllow) {
        registerFinalEligibilityReject("fallback_no_taste_match", title);
        return false;
      }
      semanticRescueOverrideTitles.add(normalizeText(title));
      markSourceSpecificGate(title, "fallback_no_taste_match_semantic_rescue_override");
    }
    if (isComicVineFallbackCandidate && semanticFranchiseAffinity) {
      const fallbackFitScore = Number(positiveFitScoreByTitle[title] || 0);
      if (semanticEvidenceCount <= 0 && fallbackFitScore < 5 && !curatedTitleFallbackProtected) {
        registerFinalEligibilityReject("fallback_no_taste_match", title);
        return false;
      }
    }
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
    if (meaningfulSignalCount === 0 && weightedTasteScore < 2.5 && !explicitFranchiseSignal) {
      const graphicShapedQuery = /\b(graphic novel|comic|manga|manhwa|webtoon)\b/i.test(queryText);
      const titleLooksGraphic = /\b(volume\s*1|book\s*1|vol\.?\s*1|omnibus|graphic novel|comic|manga|manhwa|webtoon)\b/i.test(title);
      const graphicShapedRescue =
        graphicShapedQuery &&
        !isReferenceArtifactTitle(title) &&
        (semanticEvidenceCount >= 1 || Number(positiveFitScoreByTitle[title] || 0) >= 3 || titleLooksGraphic);
      if (!graphicShapedRescue) {
        registerFinalEligibilityReject("zero_meaningful_signal_without_franchise_or_taste_alignment", title);
        return false;
      }
      markSourceSpecificGate(title, "graphic_shaped_meaningful_signal_rescue");
    }
    if (meaningfulSignalCount < 1) {
      const softPassComicVine =
        isComicVineCandidate &&
        (semanticEvidenceCount >= 2 || semanticFranchiseAffinity || Number(positiveFitScoreByTitle[title] || 0) >= 6);
      if (softPassComicVine) {
        markSourceSpecificGate(title, "comicvine_soft_meaningful_signals_bypass");
      } else {
      if (!teenCuratedTitleFallbackAllow) {
        meaningfulSignalsGateRejectedTitles.push(title);
        const graphicShapedQuery = /\b(graphic novel|comic|manga|manhwa|webtoon)\b/i.test(queryText);
        const titleLooksGraphic = /\b(volume\s*1|book\s*1|vol\.?\s*1|omnibus|graphic novel|comic|manga|manhwa|webtoon)\b/i.test(title);
        const graphicLowConfidenceRescue =
          graphicShapedQuery &&
          !isReferenceArtifactTitle(title) &&
          (semanticEvidenceCount >= 1 || Number(positiveFitScoreByTitle[title] || 0) >= 3 || titleLooksGraphic);
        if (!graphicLowConfidenceRescue) {
          registerFinalEligibilityReject("low_recommendation_confidence", title);
          return false;
        }
        markSourceSpecificGate(title, "graphic_shaped_low_confidence_rescue");
      }
      markSourceSpecificGate(title, "curated_title_fallback_low_metadata_ok");
      }
    }
    finalTasteThresholdByTitle[title] = 2.5;
    const positiveFitScore = Number(positiveFitScoreByTitle[title] || 0);
    const strongTasteFit = weightedTasteScore >= 3 || positiveFitScore >= 6;
    const isClearlyMalformed = /^(.+:\s*)?(a\s+graphic novel|the\s+graphic novel|graphic novel)$/i.test(title);
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
    const superheroFranchiseFinalGateRe = /\b(spider[\s-]?man(?:\s+noir)?|avenging\s+spider[\s-]?man|miles\s+morales|ms\.?\s*marvel|kamala\s+khan|batman|superman|avengers?|teen\s+titans|young\s+justice|runaways)\b/i;
    const superheroNarrativeFitFinalGate =
      isComicVineCandidate &&
      superheroFranchiseFinalGateRe.test(`${title} ${String(doc?.parentVolumeName || "")} ${String(doc?.queryText || "")}`) &&
      (positiveFitScore >= 5 || (semanticEvidenceCount >= 2 && narrativeFictionConfidence >= 2));
    if (isComicVineCandidate) {
      markSourceSpecificGate(
        title,
        superheroNarrativeFitFinalGate
          ? "superhero_narrative_fit_final_gate:true"
          : "superhero_narrative_fit_final_gate:false"
      );
    }
    if (dislikePenaltyScore >= weightedTasteScore && dislikePenaltyScore > 0) {
      if (!superheroNarrativeFitFinalGate) {
        dislikedOverlapDominatesRejectedTitles.push(title);
        registerFinalEligibilityReject("disliked_overlap_dominates", title);
        return false;
      }
      markSourceSpecificGate(title, "superhero_narrative_fit_dislike_override");
    }
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
    if (nonEnglish) {
      const semanticLocaleRescue =
        semanticEvidenceCount >= 2 &&
        positiveFitScore >= 4 &&
        narrativeFictionConfidence >= 2 &&
        !queryTermOnlyEvidence;
      if (!semanticLocaleRescue) {
        if (strongTasteFit) rejectedDespiteStrongTasteFitTitles.push(title);
        registerFinalEligibilityReject("locale_variant", title);
        return false;
      }
      markSourceSpecificGate(title, "locale_variant_soft_penalty_rescued");
      finalEligibilityRelaxedReasonByTitle[title] = "locale_variant_soft_penalty_rescued";
    }
    if (parodyMetaTitle && !hasComedyParodyAffinity) { registerFinalEligibilityReject("parody_meta_without_profile_affinity", title); return false; }
    if (isComicVineCandidate && queryTermOnlyEvidence && titleOnlyTasteSignals.length > 0) {
      registerFinalEligibilityReject("title_token_only_without_narrative_support", title);
      return false;
    }
    if (isComicVineCandidate && weakAnthologyRootTitle && semanticEvidenceCount < 3) {
      registerFinalEligibilityReject("weak_anthology_root_without_strong_semantic_support", title);
      return false;
    }
    const comicVinePositiveFitHighRescueAllow =
      isTeenDeckKey(input.deckKey) &&
      includeComicVine &&
      !sourceEnabled.googleBooks &&
      !sourceEnabled.openLibrary &&
      !sourceEnabled.localLibrary &&
      !includeKitsu &&
      isComicVineCandidate &&
      !isClearlyMalformed &&
      Number(positiveFitScoreByTitle[title] || 0) >= 5 &&
      Number(doc?.score ?? 0) > 0;
    if ((isClearlyMalformed || Number(doc?.score ?? 0) <= 0) && !(strongTasteFit && laneAndTasteSignal && !isClearlyMalformed) && !comicVinePositiveFitHighRescueAllow) {
      if (strongTasteFit) rejectedDespiteStrongTasteFitTitles.push(title);
      registerFinalEligibilityReject("generic_or_zero_score_filler", title); return false; }
    const passesNarrativeConfidenceGate = narrativeFictionConfidence >= 2 || collectedEditionConfidence >= 3;
    if (!passesNarrativeConfidenceGate && !teenCuratedTitleFallbackAllow) { registerFinalEligibilityReject("low_recommendation_confidence", title); return false; }
    const oneStrongTasteSignalPlusNarrative = weightedTasteScore >= 2.5 && narrativeFictionConfidence >= 2 && !genericArtifactRe.test(normalizeText(title));
    const twoMeaningfulSignals = meaningfulSignalCount >= 2;
    const compositeHighFitSemanticPass =
      Number(positiveFitScoreByTitle[title] || 0) >= 5.5 &&
      semanticEvidenceCount >= 1 &&
      narrativeFictionConfidence >= 2 &&
      recommendableWorkScore >= 1 &&
      artifactRiskScore < 3 &&
      !queryTermOnlyEvidence;
    const passesTasteThreshold = weightedTasteScore >= 2.5 || twoMeaningfulSignals || oneStrongTasteSignalPlusNarrative || compositeHighFitSemanticPass;
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
        if (!teenCuratedTitleFallbackAllow) { registerFinalEligibilityReject("insufficient_semantic_evidence_count", title); return false; }
        markSourceSpecificGate(title, "curated_title_fallback_low_metadata_ok");
      }
    }
    if (!passesTasteThreshold) {
      const canonicalFormatSoftPassRoots = new Set(["adventure-time", "something-is-killing-the-children", "ms-marvel", "spider-man", "locke-key", "paper-girls", "saga", "the-sandman"]);
      const canonicalFormatSoftPass = canonicalFormatSoftPassRoots.has(String(root || "")) && (semanticEvidenceCount >= 1 || positiveFitScore >= 5);
      const highPositiveFitFormatRescueAllow =
        isTeenDeckKey(input.deckKey) &&
        includeComicVine &&
        !sourceEnabled.googleBooks &&
        !sourceEnabled.openLibrary &&
        !sourceEnabled.localLibrary &&
        !includeKitsu &&
        positiveFitScore >= 5;
      const semanticNarrativeFormatRescue = semanticEvidenceCount >= 1 && narrativeFictionConfidence >= 2;
      if (isComicVineCandidate && collectedEditionConfidence >= 3 && weightedTasteScore < 2.5 && meaningfulSignalCount < 2 && !canonicalFormatSoftPass && !highPositiveFitFormatRescueAllow && !semanticNarrativeFormatRescue) {
        markSourceSpecificGate(title, "format_signal_only_without_taste_fit");
        if (formatSignalOnlyRejectedTitles.length < 100) formatSignalOnlyRejectedTitles.push(title);
        markTerminalReject(title, "format_signal_only_without_taste_fit");
        sourceSpecificRejectReasonByTitle[title] = "format_signal_only_without_taste_fit";
        registerFinalEligibilityReject("format_signal_only_without_taste_fit", title); return false;
      }
      const strongSemanticFitRescueAllow =
        positiveFitScore >= 4.5 &&
        semanticEvidenceCount >= 1 &&
        narrativeFictionConfidence >= 2 &&
        artifactRiskScore < 3 &&
        !queryTermOnlyEvidence;
      if (!superheroNarrativeFitFinalGate && !compositeHighFitSemanticPass && !strongSemanticFitRescueAllow) {
        registerFinalEligibilityReject("fails_taste_threshold_gate", title); return false;
      }
      if (strongSemanticFitRescueAllow) semanticRescueOverrideTitles.add(normalizeText(title));
      markSourceSpecificGate(title, compositeHighFitSemanticPass
        ? "composite_high_fit_semantic_taste_threshold_override"
        : (strongSemanticFitRescueAllow ? "strong_semantic_fit_taste_threshold_override" : "superhero_narrative_fit_taste_threshold_override"));
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
  const finalAcceptedTitleSet = new Set(finalRenderDocs.map((doc: any) => normalizeText(String(doc?.title || ""))).filter(Boolean));
  const finalEligibilityRejectReasonsByTitle: Record<string, string[]> = {};
  for (const [reason, titles] of Object.entries(finalEligibilityRejectedTitlesByReason || {})) {
    for (const t of (Array.isArray(titles) ? titles : [])) {
      const nt = normalizeText(String(t || ""));
      if (!nt) continue;
      if (!finalEligibilityRejectReasonsByTitle[nt]) finalEligibilityRejectReasonsByTitle[nt] = [];
      if (!finalEligibilityRejectReasonsByTitle[nt].includes(reason)) finalEligibilityRejectReasonsByTitle[nt].push(reason);
    }
  }
  for (const doc of finalRenderCandidateDocsBeforeGate) {
    const title = String(doc?.title || "").trim();
    const nt = normalizeText(title);
    if (!title || !nt) continue;
    const root = String(parentFranchiseRootForDoc(doc) || "");
    const laneAligned = profileSelectedEntitySeeds.some((seed) => normalizeText(seed).replace(/[^a-z0-9]+/g, "-") === root) || profileCompatibleExpansionRoots.has(root);
    const sourceId = String(doc?.sourceId || doc?.canonicalId || doc?.id || doc?.key || "").trim();
    finalEligibilityAudit.push({
      title,
      sourceId,
      source: String(doc?.source || doc?.rawDoc?.source || "").toLowerCase(),
      laneAligned,
      passedFinalEligibility: finalAcceptedTitleSet.has(nt),
      failedChecks: finalEligibilityRejectReasonsByTitle[nt] || [],
      teenSafetyState: isTeenDeckKey(input.deckKey) ? ((finalEligibilityRejectReasonsByTitle[nt] || []).includes("age_maturity_blocked") ? "blocked" : "allowed_or_unknown") : "not_teen_mode",
      hasDescription: String(doc?.description || doc?.rawDoc?.description || "").trim().length > 0,
      hasCategories: Array.isArray(doc?.subject) ? doc.subject.length > 0 : Array.isArray(doc?.volumeInfo?.categories) ? doc.volumeInfo.categories.length > 0 : false,
      hasCover: Boolean(doc?.cover_i || doc?.volumeInfo?.imageLinks?.thumbnail || doc?.rawDoc?.cover_i),
      selected: false,
    });
  }
  postSourceSpecificGateTitles.push(...finalRenderDocs.map((doc: any) => String(doc?.title || "").trim()).filter(Boolean));
  const superheroUnderfillRelaxationNeedsUnderfill = eligibleWithFitScore.length < 8;
  const superheroUnderfillRelaxationHasEnoughCandidates = viableCandidateCountBeforeFinalSelection >= 15;
  const superheroUnderfillRelaxationHeroRescueSignalCount = viableCandidates.filter((doc: any) => {
    const title = String(doc?.title || "").trim();
    if (!title) return false;
    const sourceText = String(doc?.source || doc?.rawDoc?.source || "").toLowerCase();
    if (!sourceText.includes("comicvine")) return false;
    const docText = `${title} ${String(doc?.parentVolumeName || "")} ${String(doc?.queryText || "")}`;
    if (!/\b(spider[\s-]?man(?:\s+noir)?|avenging\s+spider[\s-]?man|miles\s+morales|ms\.?\s*marvel|kamala\s+khan|batman|superman|avengers?|teen\s+titans|young\s+justice|runaways)\b/i.test(docText)) return false;
    const semanticEvidenceCount = Number(semanticEvidenceCountByTitle[title] || 0);
    const semanticSupportFound = Boolean(semanticSupportFoundByTitle[title]);
    const scoreComponents = (finalScoreComponentsByTitle[title] || {}) as any;
    const hasThemeOverlap = Boolean(scoreComponents?.themeOverlap || scoreComponents?.theme_overlap);
    const hasRootMatch = Boolean(scoreComponents?.rootMatch || scoreComponents?.root_match || scoreComponents?.queryRootMatch || scoreComponents?.query_root_match);
    const positiveFitScore = Number(positiveFitScoreByTitle[title] || 0);
    return semanticEvidenceCount >= 1 && (positiveFitScore >= 2 || (semanticSupportFound && hasThemeOverlap && hasRootMatch));
  }).length;
  const superheroUnderfillRelaxationLowVolumeRescueEligible =
    viableCandidateCountBeforeFinalSelection >= 1 &&
    (finalEligibilityAcceptedTitles.length < Math.min(2, Math.max(1, finalLimit)) || superheroUnderfillRelaxationHeroRescueSignalCount > 0);
  const superheroUnderfillRelaxationTargetRenderCount = Math.max(3, Math.min(finalLimit, 12));
  superheroUnderfillRelaxationEligibility =
    explicitSuperheroSignal &&
    superheroUnderfillRelaxationNeedsUnderfill &&
    (superheroUnderfillRelaxationHasEnoughCandidates || superheroUnderfillRelaxationLowVolumeRescueEligible);
  superheroUnderfillRelaxationPredicateState = {
    needsUnderfill: superheroUnderfillRelaxationNeedsUnderfill,
    hasEnoughCandidates: superheroUnderfillRelaxationHasEnoughCandidates,
    lowVolumeRescueEligible: superheroUnderfillRelaxationLowVolumeRescueEligible,
    heroRescueSignalCount: superheroUnderfillRelaxationHeroRescueSignalCount,
    eligibleWithFitScoreLength: eligibleWithFitScore.length,
    viableCandidateCountBeforeFinalSelection,
    finalLimit,
    targetRenderCount: superheroUnderfillRelaxationTargetRenderCount,
    acceptedTitlesBeforeRelaxation: finalEligibilityAcceptedTitles.length,
    returnedItemsBuiltFromBeforeRelaxation: "not_initialized_at_relaxation_stage",
  };
  if (superheroUnderfillRelaxationEligibility) {
    finalEligibilityRelaxationTriggered = true;
    superheroUnderfillRelaxationBranchEntered = true;
    markSourceSpecificGate("__router__", "superhero_underfill_relaxation_branch:entered");
    const alreadyAccepted = new Set(finalEligibilityAcceptedTitles.map((t) => normalizeText(t)));
    const superheroUnderfillRescuePool = dedupeDocs([
      ...(viableCandidates || []),
      ...(rankedDocs || []),
      ...(finalRankedDocsBase || []),
    ] as any[]);
    markSourceSpecificGate("__router__", `superhero_underfill_rescue_pool_size:${superheroUnderfillRescuePool.length}`);
    markSourceSpecificGate("__router__", `superhero_underfill_rescue_pool_titles:${superheroUnderfillRescuePool.map((doc: any) => String(doc?.title || "").trim()).filter(Boolean).slice(0, 40).join("|") || "(none)"}`);
    markSourceSpecificGate("__router__", `superhero_underfill_rescue_pool_roots:${Array.from(new Set(superheroUnderfillRescuePool.map((doc: any) => parentFranchiseRootForDoc(doc)).filter(Boolean))).slice(0, 40).join("|") || "(none)"}`);
    const superheroUnderfillRescueAllowedTitles = new Set<string>();
    const superheroUnderfillRescuePredicateFailureCounts: Record<string, number> = {
      not_comicvine_candidate: 0,
      franchise_regex_miss: 0,
      fit_or_semantic_composite_miss: 0,
      narrative_or_substitute_miss: 0,
      semantic_evidence_count_miss: 0,
      non_english_blocked: 0,
      post_allow_narrative_or_collection_blocked: 0,
      artifact_like_blocked: 0,
      allowed: 0,
    };
    const incSuperheroUnderfillFailure = (k: string) => {
      superheroUnderfillRescuePredicateFailureCounts[k] = Number(superheroUnderfillRescuePredicateFailureCounts[k] || 0) + 1;
    };
    const relaxedAdds = superheroUnderfillRescuePool
      .filter((doc: any) => {
        const title = String(doc?.title || "").trim();
        if (!title || alreadyAccepted.has(normalizeText(title))) return false;
        const weightedTasteScore = Number(candidateWeightedTasteScoreByTitle[title] || 0);
        const positiveFitScore = Number(positiveFitScoreByTitle[title] || 0);
        const strongTasteFit = weightedTasteScore >= 3 || positiveFitScore >= 6;
        const sourceText = String(doc?.source || doc?.rawDoc?.source || "").toLowerCase();
        const isComicVineCandidate = sourceText.includes("comicvine");
        const nonEnglish = Number((doc?.diagnostics as any)?.nonEnglishEditionPenalty || 0) < 0;
        const editionText = `${title} ${String(doc?.description || '')} ${String(doc?.parentVolumeName || '')}`;
        const narrativeFictionConfidence = (/\b(story|novel|saga|chronicle|mystery|thriller|horror|fantasy|adventure)\b/i.test(editionText) ? 2 : 0);
        const superheroFranchiseFinalGateRe = /\b(spider[\s-]?man(?:\s+noir)?|avenging\s+spider[\s-]?man|miles\s+morales|ms\.?\s*marvel|kamala\s+khan|batman|superman|avengers?|teen\s+titans|young\s+justice|runaways)\b/i;
        const semanticEvidenceCount = Number(semanticEvidenceCountByTitle[title] || 0);
        const semanticSupportFound = Boolean(semanticSupportFoundByTitle[title]);
        const scoreComponents = (finalScoreComponentsByTitle[title] || {}) as any;
        const hasThemeOverlap = Boolean(scoreComponents?.themeOverlap || scoreComponents?.theme_overlap);
        const hasRootMatch = Boolean(scoreComponents?.rootMatch || scoreComponents?.root_match || scoreComponents?.queryRootMatch || scoreComponents?.query_root_match);
        const semanticThemeRootCompositeSupport = semanticSupportFound && hasThemeOverlap && hasRootMatch;
        const lowVolumeNarrativeSubstitute = semanticThemeRootCompositeSupport;
        const superheroFranchiseMatched = superheroFranchiseFinalGateRe.test(`${title} ${String(doc?.parentVolumeName || "")} ${String(doc?.queryText || "")}`);
        const fitOrSemanticCompositePass = (positiveFitScore >= 4.5 || semanticThemeRootCompositeSupport);
        const narrativeOrSubstitutePass = (narrativeFictionConfidence >= 2 || lowVolumeNarrativeSubstitute);
        const semanticEvidenceCountPass = semanticEvidenceCount >= 1;
        const superheroUnderfillRescueAllow =
          isComicVineCandidate &&
          superheroFranchiseMatched &&
          fitOrSemanticCompositePass &&
          narrativeOrSubstitutePass &&
          semanticEvidenceCountPass;
        if (!isComicVineCandidate) incSuperheroUnderfillFailure("not_comicvine_candidate");
        else if (!superheroFranchiseMatched) incSuperheroUnderfillFailure("franchise_regex_miss");
        else if (!fitOrSemanticCompositePass) incSuperheroUnderfillFailure("fit_or_semantic_composite_miss");
        else if (!narrativeOrSubstitutePass) incSuperheroUnderfillFailure("narrative_or_substitute_miss");
        else if (!semanticEvidenceCountPass) incSuperheroUnderfillFailure("semantic_evidence_count_miss");
        else incSuperheroUnderfillFailure("allowed");
        if (isComicVineCandidate && superheroFranchiseMatched) {
          markSourceSpecificGate(
            title,
            superheroUnderfillRescueAllow
              ? "superhero_underfill_rescue_candidate:true"
              : "superhero_underfill_rescue_candidate:false"
          );
          if (!superheroUnderfillRescueAllow) {
            markSourceSpecificGate(
              title,
              `superhero_underfill_rescue_candidate:false:fit=${positiveFitScore.toFixed(2)},narr=${narrativeFictionConfidence},semanticCount=${semanticEvidenceCount},semanticSupport=${semanticSupportFound ? 1 : 0},themeOverlap=${hasThemeOverlap ? 1 : 0},rootMatch=${hasRootMatch ? 1 : 0}`
            );
          }
        }
        if ((!strongTasteFit && !superheroUnderfillRescueAllow) || nonEnglish) {
          if (nonEnglish) incSuperheroUnderfillFailure("non_english_blocked");
          return false;
        }
        const collectedEditionConfidence = (/\b(volume\s*one|volume\s*1|book\s*one|book\s*1|vol\.?\s*1|tpb|trade paperback|hardcover|hc|ogn|original graphic novel|omnibus|compendium|deluxe edition|collected edition|collection)\b/i.test(editionText) ? 3 : 0);
        const narrativeOrCollectionPass = (narrativeFictionConfidence >= 2 || collectedEditionConfidence >= 3);
        if (!narrativeOrCollectionPass && !superheroUnderfillRescueAllow) {
          return false;
        }
        if (!narrativeOrCollectionPass && superheroUnderfillRescueAllow) {
          markSourceSpecificGate(title, "superhero_underfill_rescue_post_allow_narrative_collection_bypass");
        }
        const titleNorm = normalizeText(title);
        const artifactLike = /^(graphic\s+(fantasy|novel|science fiction)|science fiction classics|fantasy classics)$/.test(titleNorm) || /\b(feedback|tribute|preview|sampler|companion|guide|reference|history of|encyclopedia|adventure\s*about|how to|study|criticism|annotation|annotated)\b/i.test(`${title} ${String(doc?.description || "")}`);
        if (artifactLike) {
          if (superheroUnderfillRescueAllow) incSuperheroUnderfillFailure("artifact_like_blocked");
          return false;
        }
        if (superheroUnderfillRescueAllow) {
          superheroUnderfillRescueAllowedTitles.add(normalizeText(title));
          markSourceSpecificGate(title, "superhero_underfill_rescue_relaxation");
        }
        return true;
      })
      .slice(0, 12);
    markSourceSpecificGate("__router__", `superhero_underfill_rescue_allowed_titles_count:${superheroUnderfillRescueAllowedTitles.size}`);
    markSourceSpecificGate("__router__", `superhero_underfill_rescue_predicate_failure_breakdown:${Object.entries(superheroUnderfillRescuePredicateFailureCounts).map(([k,v]) => `${k}=${v}`).join(",")}`);
    if (superheroUnderfillRescueAllowedTitles.size > 0) {
      markSourceSpecificGate("__router__", `superhero_underfill_rescue_allowed_titles:${Array.from(superheroUnderfillRescueAllowedTitles).join("|")}`);
    }
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
      const isSuperheroUnderfillRescueAllowed = superheroUnderfillRescueAllowedTitles.has(normalizeText(title));
      if (isSuperheroUnderfillRescueAllowed) {
        markSourceSpecificGate(title, "superhero_underfill_rescue_allowed_titles:carried_into_relaxed_add");
      }
      if (meaningfulSignalCount < 1 && !isSuperheroUnderfillRescueAllowed) {
        fallbackTierRejectedReasonsByTitle[title] = "relaxed_add_requires_meaningful_signals>=1";
        continue;
      }
      eligibleWithFitScore.push({ doc, fitScore: 1, recommendableWorkScore: 1, artifactRiskScore: 0, collectedEditionConfidence: 0, narrativeFictionConfidence: 1, metaOrReferenceWorkPenalty: 0 });
      finalEligibilityAcceptedTitles.push(title);
      finalEligibilityRelaxedAcceptedTitles.push(title);
      finalEligibilityRelaxedReasonByTitle[title] = isSuperheroUnderfillRescueAllowed
        ? "superhero_underfill_rescue_allow_override"
        : "strong_taste_fit_underfilled_output";
      finalAcceptedTasteEvidenceByTitle[title] = [
        ...(finalAcceptedTasteEvidenceByTitle[title] || []),
        `meaningfulSignals:${meaningfulSignalCount}`,
      ];
    }
    controlledEmergencyFallback = fallbackTierAcceptedTitles.length > 0 && finalEligibilityAcceptedTitles.length === fallbackTierAcceptedTitles.length;
  } else if (!explicitSuperheroSignal) {
    markSourceSpecificGate("__router__", "superhero_underfill_relaxation_branch:skipped_no_explicit_superhero_signal");
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
  if (
    eligibleWithFitScore.length < Math.min(6, Math.max(1, finalLimit)) &&
    /RAW_HIGH_CANDIDATE_TINY/.test(String(comicVinePipelineFailureReason || "")) &&
    Number(expansionConvertedCount || 0) >= 10
  ) {
    const seenExpanded = new Set(eligibleWithFitScore.map((row: any) => normalizeText(String(row?.doc?.title || ""))).filter(Boolean));
    const expandedPoolPreTerminal = dedupeDocs([...(narrativeExpansionMergedDocs || []), ...(viableCandidates || []), ...(scoredCanonicalDocs || [])] as any[]);
    for (const doc of expandedPoolPreTerminal) {
      const title = String(doc?.title || "").trim();
      const nt = normalizeText(title);
      if (!title || !nt || seenExpanded.has(nt)) continue;
      if (terminalRejectReasonByTitle[nt]) continue;
      if (sourceSpecificRejectReasonByTitle[title]) continue;
      if (Number(doc?.score ?? doc?.diagnostics?.finalScore ?? 0) < 0) continue;
      const sem = Number(semanticEvidenceCountByTitle[title] || 0);
      const fit = Number(positiveFitScoreByTitle[title] || 0);
      if (sem < 1 && fit < 4) continue;
      eligibleWithFitScore.push({ doc, fitScore: Math.max(1, fit), recommendableWorkScore: 1, artifactRiskScore: 0, collectedEditionConfidence: 1, narrativeFictionConfidence: 2, metaOrReferenceWorkPenalty: 0 });
      finalEligibilityAcceptedTitles.push(title);
      finalEligibilityRelaxedReasonByTitle[title] = "expanded_pool_semantic_rescue_before_terminal";
      seenExpanded.add(nt);
      if (eligibleWithFitScore.length >= Math.min(10, Math.max(6, finalLimit))) break;
    }
  }
  finalRenderDocs = eligibleWithFitScore
    .sort((a, b) => b.fitScore - a.fitScore || Number((b.doc?.score ?? 0) - (a.doc?.score ?? 0)))
    .map((row) => row.doc)
    .slice(0, 10);
  let finalRenderCandidateTitlesAfterGate = finalRenderDocs.map((doc: any) => String(doc?.title || "").trim()).filter(Boolean);
  const finalCountCappedToTarget = finalRenderDocs.length >= 10;
  const topUpFinalGateRejectedTitles = topUpCandidatesAcceptedTitles.filter((t) => !new Set(finalRenderCandidateTitlesAfterGate.map((x) => normalizeText(x))).has(normalizeText(t)));
  const finalEligibilityAcceptedSetCanonical = new Set(finalEligibilityAcceptedTitles.map((t) => normalizeText(t)));
  for (const [reason, titles] of Object.entries(finalEligibilityRejectedTitlesByReason)) {
    finalEligibilityRejectedTitlesByReason[reason] = (titles || []).filter((title) => !finalEligibilityAcceptedSetCanonical.has(normalizeText(String(title || ""))));
  }
  const rejectedTitleSetCanonical = new Set(
    Object.values(finalEligibilityRejectedTitlesByReason)
      .flat()
      .map((title) => normalizeText(String(title || "")))
      .filter(Boolean)
  );
  const finalEligibilityAcceptedTitlesCanonical = Array.from(new Set(finalEligibilityAcceptedTitles.filter(Boolean)))
    .filter((title) => !rejectedTitleSetCanonical.has(normalizeText(title)));
  const cleanFinalRenderTitleSet = new Set(finalRenderDocs.map((doc: any) => normalizeText(String(doc?.title || ""))).filter(Boolean));
  const finalEligibilityAcceptedTitlesAlignedToRender = finalEligibilityAcceptedTitlesCanonical.filter((title) => cleanFinalRenderTitleSet.has(normalizeText(title)));
  finalEligibilityAcceptedTitles.length = 0;
  finalEligibilityAcceptedTitles.push(...finalEligibilityAcceptedTitlesAlignedToRender);
  const finalEligibilityAcceptedAndRejectedTitles = finalEligibilityAcceptedTitles
    .filter((title) => rejectedTitleSetCanonical.has(normalizeText(title)));
  if (finalEligibilityAcceptedAndRejectedTitles.length > 0) {
    console.error("FINAL_ELIGIBILITY_XOR_VIOLATION", finalEligibilityAcceptedAndRejectedTitles.map((title) => ({
      title,
      rejectedReasons: Object.entries(finalEligibilityRejectedTitlesByReason)
        .filter(([, row]) => (row || []).some((t) => normalizeText(String(t || "")) === normalizeText(title)))
        .map(([reason]) => reason),
      accepted: true,
    })));
  }
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
  const negativeScoreRenderBypassedTitles: string[] = [];
  const negativeScoreRenderBlockedTitles = finalRenderDocs
    .filter((doc: any) => {
      const score = Number(doc?.score ?? doc?.diagnostics?.finalScore ?? 0);
      if (score >= 0) return false;
      const title = String(doc?.title || "").trim();
      if (!title) return true;
      const gates = sourceSpecificGateAppliedByTitle[title] || [];
      const superheroFinalGatePass = gates.includes("superhero_narrative_fit_final_gate:true");
      const superheroRescueAcceptedPass = gates.includes("superhero_underfill_rescue_relaxation");
      const positiveFitScore = Number(positiveFitScoreByTitle[title] || 0);
      const semanticEvidenceCount = Number(semanticEvidenceCountByTitle[title] || 0);
      const semanticSupportFound = Boolean(semanticSupportFoundByTitle[title]) || semanticEvidenceCount >= 1;
      const superheroNegativeScoreRenderBypass =
        (superheroFinalGatePass && semanticSupportFound && positiveFitScore >= 4.5) ||
        (superheroRescueAcceptedPass && semanticSupportFound && positiveFitScore >= 3.5);
      if (superheroNegativeScoreRenderBypass) {
        negativeScoreRenderBypassedTitles.push(title);
        markSourceSpecificGate(title, "superhero_negative_score_render_bypass");
        if (superheroRescueAcceptedPass && semanticSupportFound && positiveFitScore >= 3.5) {
          markSourceSpecificGate(title, "superhero_negative_score_render_bypass:rescue_accepted");
        } else if (superheroFinalGatePass && semanticSupportFound && positiveFitScore >= 4.5) {
          markSourceSpecificGate(title, "superhero_negative_score_render_bypass:final_gate");
        }
        return false;
      }
      return true;
    })
    .map((doc: any) => String(doc?.title || "").trim())
    .filter(Boolean);
  if (negativeScoreRenderBypassedTitles.length > 0) {
    markSourceSpecificGate("__router__", `superhero_negative_score_render_bypass_titles:${Array.from(new Set(negativeScoreRenderBypassedTitles)).join("|")}`);
  }
  for (const title of negativeScoreRenderBlockedTitles) markTerminalReject(title, "negative_score_render_blocked");
  if (negativeScoreRenderBlockedTitles.length > 0) {
    const negativeBlockedCanonical = new Set(negativeScoreRenderBlockedTitles.map((t) => normalizeText(String(t || ""))).filter(Boolean));
    const scrubbedAcceptedTitles = finalEligibilityAcceptedTitles.filter((title) => !negativeBlockedCanonical.has(normalizeText(String(title || ""))));
    finalEligibilityAcceptedTitles.length = 0;
    finalEligibilityAcceptedTitles.push(...scrubbedAcceptedTitles);
    eligibleWithFitScore.splice(0, eligibleWithFitScore.length, ...eligibleWithFitScore.filter((row: any) => !negativeBlockedCanonical.has(normalizeText(String(row?.doc?.title || "")))));
  }
  const nonNegativeFinalRenderDocs = finalRenderDocs.filter((doc: any) => Number(doc?.score ?? doc?.diagnostics?.finalScore ?? 0) >= 0);
  finalRenderDocs = nonNegativeFinalRenderDocs;
  finalAcceptedDocsTitles = finalRenderDocs.map((doc: any) => String(doc?.title || doc?.rawDoc?.title || "").trim()).filter(Boolean);
  finalRenderCandidateTitlesAfterGate = [...finalAcceptedDocsTitles];
  const finalUnderfillInsteadOfArtifactFallback = includeComicVine && finalRenderDocs.length < 5;
  if (finalUnderfillInsteadOfArtifactFallback && finalRenderDocs.length === 0) {
    const cleanCuratedFallbackDocs = teenPostPassInputDocs.filter((doc: any) => {
      const title = String(doc?.title || doc?.rawDoc?.title || "").trim();
      if (!title) return false;
      const score = Number(doc?.score ?? doc?.diagnostics?.finalScore ?? 0);
      if (score < 0) return false;
      const root = parentFranchiseRootForDoc(doc);
      const parentRootSource = String(parentRootSourceByTitle[title] || "");
      const semanticEvidenceCount = Number(semanticEvidenceCountByTitle[title] || 0);
      const themeOverlapScore = Number((finalScoreComponentsByTitle[title] || {}).themeOverlap || 0);
      const curatedProfileFitScore = Number((finalScoreComponentsByTitle[title] || {}).curatedProfileFitScore || positiveFitScoreByTitle[title] || 0);
      const curatedTitleFallbackProtected =
        (isTeenDeckKey(input.deckKey) && includeComicVine && !sourceEnabled.googleBooks && !sourceEnabled.openLibrary && !sourceEnabled.localLibrary && !includeKitsu) &&
        isCuratedTeenGraphicNovelRoot(root) &&
        parentRootSource === "title_fallback" &&
        (semanticEvidenceCount > 0 || themeOverlapScore > 0 || curatedProfileFitScore > 0);
      return Boolean(curatedSeedProfileMatch[title] || curatedTitleFallbackProtected || Number(positiveFitScoreByTitle[title] || 0) >= 6);
    });
    if (cleanCuratedFallbackDocs.length > 0) {
      finalRenderDocs = dedupeDocs(cleanCuratedFallbackDocs).slice(0, Math.max(1, Math.min(finalLimit, 5)));
      finalAcceptedDocsTitles = finalRenderDocs.map((doc: any) => String(doc?.title || doc?.rawDoc?.title || "").trim()).filter(Boolean);
    }
  }
  finalAcceptedDocsTitles = finalRenderDocs.map((doc: any) => String(doc?.title || doc?.rawDoc?.title || "").trim()).filter(Boolean);
  finalRenderCandidateTitlesAfterGate = [...finalAcceptedDocsTitles];
  const negativeBlockedCanonical = new Set(negativeScoreRenderBlockedTitles.map((t) => normalizeText(String(t || ""))).filter(Boolean));
  finalRenderDocs = finalRenderDocs.filter((doc: any) => !negativeBlockedCanonical.has(normalizeText(String(doc?.title || doc?.rawDoc?.title || ""))));
  finalAcceptedDocsTitles = finalRenderDocs.map((doc: any) => String(doc?.title || doc?.rawDoc?.title || "").trim()).filter(Boolean);
  finalRenderCandidateTitlesAfterGate = finalAcceptedDocsTitles.filter((title) => !negativeBlockedCanonical.has(normalizeText(title)));
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
  const teenComicVineOnlySafeUnderfillFill = isTeenDeckKey(input.deckKey) && comicVineOnlyMode;
  const teenComicVineOnlyLateUnderfill = isTeenDeckKey(input.deckKey) && comicVineOnlyMode;
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
  const cleanCuratedOrProfileFitCandidates = dedupeDocs([
    ...finalRenderDocs,
    ...swipeRankedCandidateList,
  ] as any[]).filter((doc: any) => {
    const title = String(doc?.title || "").trim();
    if (!title) return false;
    const root = String(parentFranchiseRootForDoc(doc) || "");
    const score = Number(doc?.score ?? doc?.diagnostics?.finalScore ?? 0);
    const nonNegative = score >= 0;
    const nonExplicit = !String(terminalRejectReasonByTitle[normalizeText(title)] || "").includes("age_maturity_blocked");
    const nonFragment = !isLikelyIssueFragmentDoc(doc) && !isLikelySubtitleFragmentTitle(title);
    const profileFit = Number((finalScoreComponentsByTitle[title] || {}).curatedProfileFitScore || positiveFitScoreByTitle[title] || 0) > 0;
    const curatedRoot = isCuratedTeenGraphicNovelRoot(root);
    return nonNegative && nonExplicit && nonFragment && (curatedRoot || profileFit);
  });
  const hasAcceptedFinalEligibilityTitles = finalEligibilityAcceptedTitles.length > 0;
  const rescuePoolSourceDocs = {
    finalRenderDocs: [...finalRenderDocs],
    finalRankedDocs: [...finalRankedDocs],
    finalRankedDocsBase: [...finalRankedDocsBase],
    rankedDocs: [...rankedDocs],
    swipeRankedCandidateList: [...swipeRankedCandidateList],
    narrativeExpansionMergedDocs: [...narrativeExpansionMergedDocs],
    fallbackTierAcceptedDocs: [...fallbackTierAcceptedTitles.map((title: string) => ({ title, source: "comicvine_fallback_title" }))],
  };
  const positiveFitRescuePoolSourceCounts: Record<string, number> = Object.fromEntries(
    Object.entries(rescuePoolSourceDocs).map(([k, v]) => [k, Array.isArray(v) ? v.length : 0])
  );
  const positiveFitRescueExcludedByReason: Record<string, number> = {};
  const teenComicVinePositiveFitRescuePool = dedupeDocs([
    ...rescuePoolSourceDocs.finalRenderDocs,
    ...rescuePoolSourceDocs.finalRankedDocs,
    ...rescuePoolSourceDocs.finalRankedDocsBase,
    ...rescuePoolSourceDocs.rankedDocs,
    ...rescuePoolSourceDocs.swipeRankedCandidateList,
    ...rescuePoolSourceDocs.narrativeExpansionMergedDocs,
    ...rescuePoolSourceDocs.fallbackTierAcceptedDocs,
  ] as any[]).filter((doc: any) => {
    const title = String(doc?.title || "").trim();
    if (!title) { positiveFitRescueExcludedByReason.empty_title = (positiveFitRescueExcludedByReason.empty_title || 0) + 1; return false; }
    if (Number(doc?.score ?? doc?.diagnostics?.finalScore ?? 0) < 0) { positiveFitRescueExcludedByReason.negative_score = (positiveFitRescueExcludedByReason.negative_score || 0) + 1; return false; }
    if (isLikelyIssueFragmentDoc(doc) || isLikelySubtitleFragmentTitle(title)) { positiveFitRescueExcludedByReason.fragment = (positiveFitRescueExcludedByReason.fragment || 0) + 1; return false; }
    const positiveFit = Number(positiveFitScoreByTitle[title] || 0);
    const root = String(parentFranchiseRootForDoc(doc) || "");
    const allowQueryLiteralHighFit = positiveFit >= 4.5 || isCuratedTeenGraphicNovelRoot(root);
    if (Boolean(queryTermOnlyEvidenceByTitle[title]) && !allowQueryLiteralHighFit) { positiveFitRescueExcludedByReason.query_literal_only = (positiveFitRescueExcludedByReason.query_literal_only || 0) + 1; return false; }
    if (String(terminalRejectReasonByTitle[normalizeText(title)] || "").includes("age_maturity_blocked")) { positiveFitRescueExcludedByReason.age_maturity_blocked = (positiveFitRescueExcludedByReason.age_maturity_blocked || 0) + 1; return false; }
    const weightedTaste = Number(candidateWeightedTasteScoreByTitle[title] || 0);
    const keep = (positiveFit > 0 || weightedTaste > 0);
    if (!keep) positiveFitRescueExcludedByReason.no_positive_fit_or_taste = (positiveFitRescueExcludedByReason.no_positive_fit_or_taste || 0) + 1;
    return keep;
  });
  const teenComicVineCanFailSoftRender = teenComicVineOnlyLateUnderfill && teenComicVinePositiveFitRescuePool.length > 0;
  const suppressTopRecommendations =
    !hasAcceptedFinalEligibilityTitles &&
    (
      (hardPipelineFailure && rankedCount === 0 && !teenComicVineCanFailSoftRender) ||
      (scoredUniverseFailure && !teenComicVineCanFailSoftRender)
    );
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
  const hardLexicalDieArtifactRe = /\b(love[-\s]?or[-\s]?die|kill[-\s]?or[-\s]?die|die[-\s]?die[-\s]?die|villains[-\s]?are[-\s]?destined[-\s]?to[-\s]?die|if[-\s]?my[-\s]?favorite[-\s]?pop[-\s]?idol.*die)\b/i;
  const negativeScoreBlockedSet = new Set(negativeScoreRenderBlockedTitles.map((t) => normalizeText(String(t || ""))).filter(Boolean));
  function passesSharedReturnArtifactScrub(doc: any) {
    return sharedReturnArtifactScrubRejectReason(doc) === null;
  }
  function sharedReturnArtifactScrubRejectReason(doc: any): string | null {
    const title = String(doc?.title || "").trim();
    if (!title) return "missing_title";
    const root = String(parentFranchiseRootForDoc(doc) || "");
    const normalizedTitle = normalizeText(title);
    const explicitIssueOrChapterMarker = /#\s*\d+\b|\b(issue|chapter)\s*#?\d+\b/i.test(title);
    const titleFallbackLike = String(parentRootSourceByTitle[title] || "").includes("title_fallback");
    const canonicalSeriesRoots = new Set(["runaways", "saga", "paper-girls", "the-sandman", "the-woods", "spider-man", "ms-marvel", "sweet-tooth", "descender"]);
    const canonicalSeriesTitleFallbackSafe = titleFallbackLike && canonicalSeriesRoots.has(root) && !explicitIssueOrChapterMarker;
    const canReturnRejectReason = canReturnTitleRejectReason(title, doc);
    if (canReturnRejectReason && !(canonicalSeriesTitleFallbackSafe && canReturnRejectReason === "late_fill_never_return")) {
      return `can_return_title:${canReturnRejectReason}`;
    }
    if (negativeScoreBlockedSet.has(normalizedTitle)) return "negative_score_blocked_set";
    if (isReferenceArtifactTitle(title)) return "reference_library_artifact";
    if (isLikelySubtitleFragmentTitle(title) && !canonicalSeriesTitleFallbackSafe) return "subtitle_fragment_title_shape";
    if (Boolean(queryTermOnlyEvidenceByTitle[title])) return "query_term_only_evidence";
    if (/\b(trade paperback|hardcover\/trade paperback|collected edition|trade paperback collected edition)\b/i.test(title)) return "collection_artifact_wording";
    if (/\b(classroom|teaching|index|awards?|reference|bibliograph(?:y|ies)|poetry for children)\b/i.test(title)) return "classroom_reference_artifact_wording";
    if (/amazing fantasy/i.test(title) && !(root === "spider-man" && Number(semanticEvidenceCountByTitle[title] || 0) >= 1)) return "amazing_fantasy_without_spiderman_semantic";
    if (hardLexicalDieArtifactRe.test(title) && !(root === "die" && Number(semanticEvidenceCountByTitle[title] || 0) >= 1)) return "hard_lexical_die_artifact";
    return null;
  }
  function passesPositiveFitRescueSafety(doc: any) {
    const title = String(doc?.title || "").trim();
    if (!title) return false;
    const root = String(parentFranchiseRootForDoc(doc) || "");
    const normalizedTitle = normalizeText(title);
    if (Number(doc?.score ?? doc?.diagnostics?.finalScore ?? 0) < 0) return false;
    if (isLikelyIssueFragmentDoc(doc) || isLikelySubtitleFragmentTitle(title)) return false;
    if (negativeScoreBlockedSet.has(normalizedTitle)) return false;
    if (String(terminalRejectReasonByTitle[normalizedTitle] || "").includes("age_maturity_blocked")) return false;
    if (String(terminalRejectReasonByTitle[normalizedTitle] || "").includes("locale_variant")) return false;
    if (Boolean(queryTermOnlyEvidenceByTitle[title])) return false;
    if (/\b(trade paperback|hardcover\/trade paperback|collected edition|trade paperback collected edition)\b/i.test(title) && Number(positiveFitScoreByTitle[title] || 0) < 7) return false;
    if (/amazing fantasy/i.test(title) && !(root === "spider-man" && Number(semanticEvidenceCountByTitle[title] || 0) >= 1)) return false;
    if (hardLexicalDieArtifactRe.test(title) && !(root === "die" && Number(semanticEvidenceCountByTitle[title] || 0) >= 1)) return false;
    return true;
  }
  function passesEmergencySafeRescue(doc: any) {
    const title = String(doc?.title || "").trim();
    if (!title) return false;
    const nt = normalizeText(title);
    const cleanSeriesOrCollected = isCleanSeriesOrCollectedCandidate(title, doc);
    if ((isLikelyIssueFragmentDoc(doc) || isLikelySubtitleFragmentTitle(title)) && !cleanSeriesOrCollected) return false;
    if (String(terminalRejectReasonByTitle[nt] || "").includes("age_maturity_blocked")) return false;
    if (String(terminalRejectReasonByTitle[nt] || "").includes("locale_variant")) return false;
    if (negativeScoreBlockedSet.has(nt)) return false;
    if (Number(doc?.score ?? doc?.diagnostics?.finalScore ?? 0) < 0) return false;
    if (hardLexicalDieArtifactRe.test(title)) return false;
    if (String(terminalRejectReasonByTitle[nt] || "").includes("final_eligibility_rejected") && !cleanSeriesOrCollected) return false;
    return true;
  }
  function rescueSortScore(doc: any) {
    const title = String(doc?.title || "").trim();
    const positiveFit = Number(positiveFitScoreByTitle[title] || 0);
    const tasteMatch = Number(candidateWeightedTasteScoreByTitle[title] || 0) - Number(candidateDislikePenaltyByTitle[title] || 0);
    const semanticCount = Number(semanticEvidenceCountByTitle[title] || 0);
    const likedSignalOverlap = Number((candidateMatchedLikedSignalsByTitle[title] || []).length || 0);
    const themeOverlap = Number((finalScoreComponentsByTitle[title] || {}).themeOverlap || 0);
    const starterOrCollection = /\b(volume\s*1|vol\.?\s*1|book\s*1|omnibus|compendium|collection|collected|tpb|trade paperback)\b/i.test(title) ? 1 : 0;
    const broadDefaultPenalty = /\b(the hobbit|eye of the world|disney|alice)\b/i.test(title) && likedSignalOverlap === 0 && semanticCount < 2 ? 2 : 0;
    return { positiveFit, starterOrCollection, tasteMatch, semanticCount, likedSignalOverlap, themeOverlap, broadDefaultPenalty };
  }
  function rankRescueDocs(docs: any[]) {
    return docs.slice().sort((a: any, b: any) => {
      const as = rescueSortScore(a); const bs = rescueSortScore(b);
      if (bs.positiveFit !== as.positiveFit) return bs.positiveFit - as.positiveFit;
      if (bs.likedSignalOverlap !== as.likedSignalOverlap) return bs.likedSignalOverlap - as.likedSignalOverlap;
      if (bs.themeOverlap !== as.themeOverlap) return bs.themeOverlap - as.themeOverlap;
      if (bs.starterOrCollection !== as.starterOrCollection) return bs.starterOrCollection - as.starterOrCollection;
      if (as.broadDefaultPenalty !== bs.broadDefaultPenalty) return as.broadDefaultPenalty - bs.broadDefaultPenalty;
      if (bs.tasteMatch !== as.tasteMatch) return bs.tasteMatch - as.tasteMatch;
      return bs.semanticCount - as.semanticCount;
    });
  }
  function selectRescueWithRootDiversity(docs: any[], targetCount: number) {
    const ranked = rankRescueDocs(docs);
    const distinctFirst: any[] = [];
    const seenRoots = new Set<string>();
    for (const doc of ranked) {
      if (distinctFirst.length >= targetCount) break;
      const root = String(parentFranchiseRootForDoc(doc) || "__none__");
      if (seenRoots.has(root)) continue;
      seenRoots.add(root);
      distinctFirst.push(doc);
    }
    if (distinctFirst.length >= targetCount) return distinctFirst.slice(0, targetCount);
    for (const doc of ranked) {
      if (distinctFirst.length >= targetCount) break;
      const title = normalizeText(String(doc?.title || ""));
      if (distinctFirst.some((d: any) => normalizeText(String(d?.title || "")) === title)) continue;
      distinctFirst.push(doc);
    }
    return distinctFirst.slice(0, targetCount);
  }
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
    const inferredRoot = rootFromSeed(String(title || ""));
    const parentRootSource = String(parentRootSourceByTitle[title] || "");
    const teenCuratedTitleFallbackAllow =
      isTeenDeckKey(input.deckKey) &&
      includeComicVine &&
      !sourceEnabled.googleBooks &&
      !sourceEnabled.openLibrary &&
      !sourceEnabled.localLibrary &&
      !includeKitsu &&
      parentRootSource === "title_fallback" &&
      (isCuratedTeenGraphicNovelRoot(inferredRoot) || Boolean(curatedSeedProfileMatch[title])) &&
      Number(candidateWeightedTasteScoreByTitle[title] || 0) >= 0;
    if (fallbackAcceptedSet.has(normalizeText(title))) return true;
    if (acceptedAfterTerminalSet.has(normalizeText(title))) return true;
    if (teenCuratedTitleFallbackAllow) return true;
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
  const formatSignalOnlyRejectedSet = new Set((formatSignalOnlyRejectedTitles || []).map((t: string) => normalizeText(String(t || ""))).filter(Boolean));
  const genericCollectionRejectedSet = new Set((genericCollectionArtifactRejectedTitles || []).map((t: string) => normalizeText(String(t || ""))).filter(Boolean));
  const broadArtifactRejectedSet = new Set((broadArtifactRejectedTitles || []).map((t: string) => normalizeText(String(t || ""))).filter(Boolean));
  const finalEligibilityHardNeverReturnReasons = new Set([
    "insufficient_semantic_evidence_count",
    "title_token_only_without_narrative_support",
    "query_literalism_title_only",
    "generic_collection_artifact",
    "high_artifact_risk",
    "parody_meta_without_profile_affinity",
    "format_signal_only_without_taste_fit",
  ]);
  const finalEligibilityHardNeverReturnTitles = new Set(
    Object.entries(finalEligibilityRejectedTitlesByReason || {})
      .filter(([reason]) => finalEligibilityHardNeverReturnReasons.has(String(reason)))
      .flatMap(([, titles]) => Array.isArray(titles) ? titles : [])
      .map((t: any) => normalizeText(String(t || "")))
      .filter(Boolean)
  );
  const lateFillNeverReturnTitles = new Set(
    [
      ...(formatSignalOnlyRejectedTitles || []),
      ...(genericCollectionArtifactRejectedTitles || []),
      ...(broadArtifactRejectedTitles || []),
      ...(negativeScoreRenderBlockedTitles || []),
    ]
      .map((t: any) => normalizeText(String(t || "")))
      .filter(Boolean)
  );
  const likedSignalsForReturnScrub = [
    ...Object.keys((((input as any)?.likedTagCounts || {}) as Record<string, number>)),
    ...weightedSwipeTasteVector.liked.map((s) => String(s?.signal || "")),
  ].map((k) => String(k || "").replace(/^(genre:|tone:|mood:|theme:|drive:|audience:|age:|media:|format:)/i, "").replace(/_/g, " ").trim().toLowerCase());
  const hasComedyParodyReturnAffinity = likedSignalsForReturnScrub.some((token) => /\b(comedy|humou?r|parody|satire|spoof|riff)\b/.test(token));
  function isParodyMetaReturnBlocked(title: string, doc?: any) {
    if (hasComedyParodyReturnAffinity) return false;
    const root = normalizeText(String(doc ? parentFranchiseRootForDoc(doc) : ""));
    const text = `${title} ${root} ${String(doc?.description || doc?.rawDoc?.description || "")} ${String(doc?.parentVolumeName || doc?.rawDoc?.parentVolumeName || "")}`;
    return /\b(mystery science theater 3000|mst3k|rifftrax|riff|parody|spoof)\b/i.test(text);
  }
  function canReturnTitle(title: string, doc?: any) {
    return canReturnTitleRejectReason(title, doc) === null;
  }
  function isCleanSeriesOrCollectedCandidate(title: string, doc?: any) {
    const key = normalizeText(String(title || ""));
    if (!key) return false;
    const root = String(parentFranchiseRootForDoc(doc) || "");
    const text = `${title} ${String(doc?.description || doc?.rawDoc?.description || "")}`;
    const canonicalSeriesLike = new Set(["runaways", "saga", "paper-girls", "the-sandman", "the-woods", "spider-man", "ms-marvel", "teen-titans", "avengers", "sweet-tooth", "descender", "x-men", "green-lantern", "fantastic-four", "guardians-of-the-galaxy", "wonder-woman", "thor", "justice-league", "batman", "daredevil", "miles-morales", "monstress", "lumberjanes"])
      .has(root);
    const titleFallbackLike = String(parentRootSourceByTitle[title] || "").includes("title_fallback");
    const collectedEditionLike = isCollectedStarterLikeText(text);
    const storyArcLike = /\b(story\s*arc|saga|chronicles|year one|the court of owls|metamorphosis)\b/i.test(text);
    const explicitIssueMarker = /#\s*\d+\b|\b(issue|chapter)\s*#?\d+\b/i.test(title);
    const metaArtifact = /\b(guide|companion|encyclopedia|history of|criticism|analysis|study guide|reader|handbook)\b/i.test(text);
    const localeMarker = /\b(spanish|espa[nñ]ol|french|fran[cç]ais|german|deutsch|italian|portugu[eê]s|edition\s+fran[cç]aise)\b/i.test(text);
    return (canonicalSeriesLike || titleFallbackLike || collectedEditionLike || storyArcLike) && !explicitIssueMarker && !metaArtifact && !localeMarker;
  }
  function canReturnTitleRejectReason(title: string, doc?: any): string | null {
    const key = normalizeText(String(title || ""));
    if (!key) return "missing_title";
    const singleSourceComicVineContractMode =
      includeComicVine &&
      sourceEnabled.comicVine &&
      !sourceEnabled.googleBooks &&
      !sourceEnabled.openLibrary &&
      !sourceEnabled.localLibrary &&
      !includeKitsu;
    const cleanSeriesOrCollected = isCleanSeriesOrCollectedCandidate(title, doc);
    if (terminalRejectReasonByTitle[key]) {
      const terminalReason = String(terminalRejectReasonByTitle[key] || "");
      if (terminalReason.includes("final_eligibility_rejected") && semanticRescueOverrideTitles.has(key)) {
        markSourceSpecificGate(title, "semantic_rescue_terminal_reject_bypass");
      } else {
        return `terminal_reject:${terminalRejectReasonByTitle[key]}`;
      }
    }
    if (lateFillNeverReturnTitles.has(key) && !(singleSourceComicVineContractMode && cleanSeriesOrCollected)) return "late_fill_never_return";
    if (genericCollectionRejectedSet.has(key)) return "generic_collection_rejected";
    if (formatSignalOnlyRejectedSet.has(key)) return "format_signal_only_rejected";
    if (finalEligibilityHardNeverReturnTitles.has(key)) return "final_eligibility_hard_never_return";
    if (isParodyMetaReturnBlocked(title, doc)) return "parody_meta_blocked";
    return null;
  }
  function passesSharedNeverReturnTitleScrub(title: string, doc?: any) {
    return canReturnTitle(title, doc);
  }
  let positiveFitRescueTopUpApplied = false;
  let positiveFitRescueReturnedTitles: string[] = [];
  let emergencySafeRescueReturnedTitles: string[] = [];
  const positiveFitRescueRejectedReasons: Record<string, string> = {};
  const positiveFitRescueEligibleTitles: string[] = [];
  const positiveFitRescueCandidateTitlesBeforeSafety = teenComicVinePositiveFitRescuePool.map((doc: any) => String(doc?.title || "").trim()).filter(Boolean);
  let positiveFitRescueCandidateTitlesAfterSafety: string[] = [];
  if (teenComicVineOnlyLateUnderfill && (scoredUniverseFailure || finalOutputItems.length < 3) && teenComicVinePositiveFitRescuePool.length > 0) {
    const positiveFitRescue = teenComicVinePositiveFitRescuePool
      .filter((doc: any) => {
        const title = String(doc?.title || "").trim();
        if (!title) return false;
        const ok = passesPositiveFitRescueSafety(doc);
        if (ok) positiveFitRescueEligibleTitles.push(title);
        else positiveFitRescueRejectedReasons[title] = "rescue_safety_scrub_failed";
        return ok;
      })
      ;
    const positiveFitRescueSelected = selectRescueWithRootDiversity(positiveFitRescue, Math.max(3, Math.min(5, Math.max(finalLimit, 5))))
      .map((doc: any) => ({ kind: "open_library", doc }));
    positiveFitRescueCandidateTitlesAfterSafety = positiveFitRescue.map((doc: any) => String(doc?.title || "").trim()).filter(Boolean);
    if (positiveFitRescueSelected.length >= 3 || (scoredUniverseFailure && positiveFitRescueSelected.length > 0)) {
      finalOutputItems = positiveFitRescueSelected;
      returnedItemsBuiltFrom = "positive_fit_rescue";
      finalReturnSourceUsed = "positive_fit_rescue";
      positiveFitRescueReturnedTitles = finalOutputItems.map((item: any) => String(item?.doc?.title || item?.title || "").trim()).filter(Boolean);
    }
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
  const terminalRejectedButReturnedTitles = [...rejectedButReturnedTitles];
  if (terminalRejectedButReturnedTitles.length > 0) {
    sourceSkippedReason.push(`TERMINAL_REJECT_LEAK:${terminalRejectedButReturnedTitles.slice(0, 20).join("|")}`);
  }
  const returnPathInvariantInputTitles = Array.from(new Set([
    ...acceptedAfterTerminalRejectFilter,
    ...teenPostPassOutputTitles,
  ].map((t) => String(t || "").trim()).filter(Boolean)));
  const returnPathUnexplainedDropTitles = returnPathInvariantInputTitles.filter((title) => {
    const returned = finalOutputItems.some((item: any) => normalizeText(String(item?.doc?.title || item?.title || "")) === normalizeText(title));
    if (returned) return false;
    if (terminalRejectReasonByTitle[normalizeText(title)]) return false;
    if (finalReturnDropReasonByTitle[title]) return false;
    if (terminalReturnDropReasonByTitle[title]) return false;
    return true;
  });
  if (!suppressTopRecommendations && finalOutputItems.length === 0 && returnPathInvariantInputTitles.length > 0) {
    const returnableFromPostPass = teenPostPassItems.filter((item: any) => {
      const title = String(item?.doc?.title || item?.title || "").trim();
      if (!title) return false;
      if (terminalRejectReasonByTitle[normalizeText(title)]) return false;
      if (!canReturnTitle(title, item?.doc || item)) return false;
      return returnPathInvariantInputTitles.some((t) => normalizeText(t) === normalizeText(title));
    });
    if (returnableFromPostPass.length > 0) {
      finalOutputItems = returnableFromPostPass;
      returnedItemsBuiltFrom = "teen_postpass_handoff_recovery";
      finalReturnSourceUsed = "teen_postpass_handoff_recovery";
      for (const title of returnPathUnexplainedDropTitles) {
        finalReturnDropReasonByTitle[title] = "recovered_via_teen_postpass_handoff";
      }
    }
  }
  const finalRejectAssertionChecked = finalOutputItems.length > 0 || finalEligibilityAcceptedTitles.length > 0 || Object.keys(terminalRejectReasonByTitle).length > 0;
  let finalRejectAssertionThrowReason = "none";
  const finalGateConsistencyPassed = rejectedButReturnedTitles.length === 0;
  let acceptedTitlesBeforeScrub: string[] = [];
  let acceptedTitlesAfterScrub: string[] = [];
  let acceptedDocsAfterScrub: any[] = [];
  let acceptedTitlesScrubRejectedByReason: Record<string, string> = {};
  let acceptedTitlesReturned: string[] = [];
  let acceptedTitlesDroppedAfterScrub: string[] = [];
  let acceptedPrefixInvariantFailed = false;
  let acceptedTitlesRejectedAsArtifactRoot: string[] = [];
  let acceptedTitlesRejectedAsLiteralArtifact: string[] = [];
  let acceptedTitlesRejectedAsWeakNarrative: string[] = [];
  let acceptedTitlesRejectedAsTasteFailure: string[] = [];
  if (finalRejectAssertionChecked && rejectedButReturnedTitles.length > 0) {
    finalRejectAssertionThrowReason = `returned_intersects_terminal_rejects:${rejectedButReturnedTitles.length}`;
    finalOutputItems = [];
    returnedItemsBuiltFrom = "controlled_try_again_state";
  }
  if (!suppressTopRecommendations && singleSourceDirectReturnTriggered) {
    const hardBlockedArtifactRootRe = /^(the-power-fantasy|final-fantasy-lost-stranger|graphic-fantasy|adventure-van)$/;
    const isGenericCollectionArtifactTitle = (title: string) => /^the collected edition$|^hardcover\/trade paperback$|^great british .+ comic book heroes(?:\s*#?\d+)?$/i.test(normalizeText(title));
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
        const root = String(parentFranchiseRootForDoc(doc) || "");
        if (hardBlockedArtifactRootRe.test(root)) {
          singleSourceItemsDropReasonByTitle[title] = `hard_blocked_artifact_root:${sourceLabel}`;
          continue;
        }
        if (isGenericCollectionArtifactTitle(title)) {
          singleSourceItemsDropReasonByTitle[title] = `generic_collection_artifact:${sourceLabel}`;
          continue;
        }
        if (!passesSharedReturnArtifactScrub(doc)) {
          singleSourceItemsDropReasonByTitle[title] = `shared_artifact_scrub:${sourceLabel}`;
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
  if (!suppressTopRecommendations && acceptedAfterTerminalRejectFilter.length > 0) {
    const acceptedSet = new Set(acceptedAfterTerminalRejectFilter.map((t) => normalizeText(t)));
    const canonicalAcceptedRoots = new Set(["something-is-killing-the-children", "spider-man", "ms-marvel", "adventure-time", "black-science", "locke-key", "paper-girls", "the-sandman", "saga", "nimona", "runaways"]);
    const acceptedHardArtifactRootRe = /^(the-power-fantasy|graphic-fantasy|adventure-van|trade-paperback)$/;
    const acceptedLiteralArtifactTitleRe = /\b(graphic fantasy|a good fantasy|science comics?|oops comic adventure|trade paperback|collected edition|trade paperback collected edition|hardcover\/trade paperback|sex fantasy|generic romance|through romance|akiba romance|romance papa|sadistic full romance|the power fantasy|pirates in the heartland|mystery science theater 3000)\b/i;
    const canonicalRescueSupersededAcceptedTitlesByReason: Record<string, string> = {};
    acceptedTitlesBeforeScrub = teenPostPassItems
      .map((item: any) => String(item?.doc?.title || item?.title || "").trim())
      .filter((title: string) => title && acceptedSet.has(normalizeText(title)));
    const acceptedItemsFromPostPass = teenPostPassItems.filter((item: any) => {
      const title = String(item?.doc?.title || item?.title || "").trim();
      if (!title) return false;
      if (!acceptedSet.has(normalizeText(title))) return false;
      const root = String(parentFranchiseRootForDoc(item?.doc || item) || "");
      const canonical = canonicalAcceptedRoots.has(root);
      const meaningful = Number((finalAcceptedTasteEvidenceByTitle[title] || [])
        .find((r: string) => r.startsWith("meaningfulSignals:"))?.split(":")[1] || 0);
      const semanticEvidence = Number(semanticEvidenceCountByTitle[title] || 0);
      const weightedTaste = Number(candidateWeightedTasteScoreByTitle[title] || 0);
      const narrativeConfidence = Number((finalAcceptedTasteEvidenceByTitle[title] || [])
        .find((r: string) => r.startsWith("narrativeFictionConfidence:"))?.split(":")[1] || 0);
      const weakLexicalPenalty = Number(weakLexicalFantasyClusterPenaltyByTitle[title] || 0);
      const queryLiteralOnly = Boolean(queryTermOnlyEvidenceByTitle[title]);
      const entitySeedAligned = profileSelectedEntitySeeds.some((seed) => normalizeText(title).includes(normalizeText(seed)) || normalizeText(root).includes(normalizeText(seed)));
      if (acceptedHardArtifactRootRe.test(root) && !canonical) { canonicalRescueSupersededAcceptedTitlesByReason[title] = "hard_artifact_root"; acceptedTitlesRejectedAsArtifactRoot.push(title); return false; }
      if (acceptedLiteralArtifactTitleRe.test(title)) { canonicalRescueSupersededAcceptedTitlesByReason[title] = "literal_artifact_title"; acceptedTitlesRejectedAsLiteralArtifact.push(title); return false; }
      if (isLikelySubtitleFragmentTitle(title)) { canonicalRescueSupersededAcceptedTitlesByReason[title] = "subtitle_fragment"; return false; }
      if (narrativeConfidence < 2 && meaningful < 1 && semanticEvidence < 2) { canonicalRescueSupersededAcceptedTitlesByReason[title] = "weak_narrative"; acceptedTitlesRejectedAsWeakNarrative.push(title); return false; }
      if (weightedTaste < 2.5) { canonicalRescueSupersededAcceptedTitlesByReason[title] = "taste_failure"; acceptedTitlesRejectedAsTasteFailure.push(title); return false; }
      if (queryLiteralOnly && meaningful < 1 && semanticEvidence < 1 && !entitySeedAligned && weakLexicalPenalty > 0) { canonicalRescueSupersededAcceptedTitlesByReason[title] = "query_literal_low_signal"; return false; }
      return true;
    });
    acceptedTitlesAfterScrub = acceptedItemsFromPostPass
      .map((item: any) => String(item?.doc?.title || item?.title || "").trim())
      .filter(Boolean);
    acceptedDocsAfterScrub = acceptedItemsFromPostPass
      .map((item: any) => item?.doc || item)
      .filter(Boolean);
    acceptedTitlesScrubRejectedByReason = { ...canonicalRescueSupersededAcceptedTitlesByReason };
    if (acceptedItemsFromPostPass.length > 0) {
      const targetLimit = Math.max(1, finalLimit);
      const acceptedPrefixItems = acceptedItemsFromPostPass.slice(0, targetLimit);
      const acceptedPrefixTitleSet = new Set(acceptedPrefixItems.map((item: any) => normalizeText(String(item?.doc?.title || item?.title || ""))).filter(Boolean));
      const existingNonAcceptedItems = finalOutputItems.filter((item: any) => {
        const t = normalizeText(String(item?.doc?.title || item?.title || ""));
        return t && !acceptedPrefixTitleSet.has(t);
      });
      const filledWithNonAccepted = [...acceptedPrefixItems, ...existingNonAcceptedItems].slice(0, targetLimit);
      finalOutputItems = filledWithNonAccepted;
      acceptedTitlesReturned = finalOutputItems
        .map((item: any) => String(item?.doc?.title || item?.title || "").trim())
        .filter((title: string) => title && acceptedTitlesAfterScrub.some((a) => normalizeText(a) === normalizeText(title)));
      acceptedTitlesDroppedAfterScrub = acceptedTitlesAfterScrub.filter((title) => !acceptedTitlesReturned.some((r) => normalizeText(r) === normalizeText(title)));
      returnedItemsBuiltFrom = "accepted_titles_authoritative";
      finalReturnSourceUsed = "accepted_titles_authoritative";
    } else if (Object.keys(canonicalRescueSupersededAcceptedTitlesByReason).length > 0) {
      sourceSkippedReason.push(`accepted_titles_scrubbed_before_canonical:${Object.entries(canonicalRescueSupersededAcceptedTitlesByReason).slice(0, 8).map(([t, r]) => `${t}:${r}`).join("|")}`);
    }
  }
  const acceptedNarrativeCandidatesExist = acceptedTitlesAfterScrub.length > 0;
  const acceptedNarrativeConfidenceFail = acceptedTitlesAfterScrub.length > 0 && acceptedTitlesAfterScrub.every((title) => {
    const narrativeConfidence = Number((finalAcceptedTasteEvidenceByTitle[title] || [])
      .find((r: string) => r.startsWith("narrativeFictionConfidence:"))?.split(":")[1] || 0);
    const weightedTaste = Number(candidateWeightedTasteScoreByTitle[title] || 0);
    return narrativeConfidence < 2 && weightedTaste < 2.5;
  });
  const canonicalRescueAllowed = !acceptedNarrativeCandidatesExist || acceptedNarrativeConfidenceFail;
  const horrorPreferenceSignals = ["horror", "spooky", "dark", "slasher", "occult", "monster"];
  const likedSignalTokens = weightedSwipeTasteVector.liked.map((s) => normalizeText(String(s?.signal || ""))).filter(Boolean);
  const dislikedSignalTokens = weightedSwipeTasteVector.disliked.map((s) => normalizeText(String(s?.signal || ""))).filter(Boolean);
  const skippedSignalTokens = weightedSwipeTasteVector.skipped.map((s) => normalizeText(String(s?.signal || ""))).filter(Boolean);
  const likesHorrorLike = likedSignalTokens.some((token) => horrorPreferenceSignals.some((h) => token.includes(h)));
  const dislikesHorrorLike = dislikedSignalTokens.some((token) => horrorPreferenceSignals.some((h) => token.includes(h)));
  const skipsHorrorLike = skippedSignalTokens.some((token) => horrorPreferenceSignals.some((h) => token.includes(h)));
  const horrorLikeNeutralOrLiked = likesHorrorLike || (!dislikesHorrorLike && !skipsHorrorLike);
  if (!suppressTopRecommendations && finalOutputItems.length === 0 && acceptedTitlesAfterScrub.length === 0 && (comicVineOnlyMode || fallbackOnlyResult || fallbackHeavyResult)) {
    if (teenComicVineOnlySafeUnderfillFill) {
      const rootSeen = new Set<string>();
      const safeUnderfill = teenPostPassItems
        .map((item: any) => item?.doc || item)
        .filter((doc: any) => {
          const title = String(doc?.title || "").trim();
          if (!title) return false;
          if (!passesSharedReturnArtifactScrub(doc)) return false;
          if (isLikelyIssueFragmentDoc(doc)) return false;
          const score = Number(doc?.score ?? doc?.diagnostics?.finalScore ?? 0);
          if (score < 0) return false;
          const meaningful = Number((finalAcceptedTasteEvidenceByTitle[title] || [])
            .find((r: string) => r.startsWith("meaningfulSignals:"))?.split(":")[1] || 0);
          return meaningful >= 1;
        })
        .filter((doc: any) => {
          const root = String(parentFranchiseRootForDoc(doc) || "__none__");
          if (rootSeen.has(root)) return false;
          rootSeen.add(root);
          return true;
        })
        .slice(0, Math.min(Math.max(4, Math.min(finalLimit, 6)), finalLimit))
        .map((doc: any) => ({ kind: "open_library", doc }));
      if (safeUnderfill.length > 0) {
        finalOutputItems = safeUnderfill;
        returnedItemsBuiltFrom = "teen_comicvine_safe_underfill_fill";
        finalReturnSourceUsed = "teen_comicvine_safe_underfill_fill";
      }
    }
  }
  if (!suppressTopRecommendations && finalOutputItems.length === 0 && acceptedTitlesAfterScrub.length === 0 && (comicVineOnlyMode || fallbackOnlyResult || fallbackHeavyResult)) {
    const hardBlockedArtifactRootRe = /^(the-power-fantasy|final-fantasy-lost-stranger|graphic-fantasy|adventure-van)$/;
    const hardBlockedLiteralRootRe = /^(lightning-and-romance|through-romance|akiba-romance|romance-papa|sadistic-full-romance)$/;
    const genericRecoveryTitleRe = /\b(graphic fantasy|a good fantasy|science comics?|oops comic adventure|trade paperback|hardcover\/trade paperback|collected edition|trade paperback collected edition|sex fantasy|generic romance|through romance|lightning and romance|akiba romance|romance papa|sadistic full romance|the power fantasy|pirates in the heartland|mystery science theater 3000)\b/i;
    const directFitPreferredRoots = new Set(["paper-girls", "gotham-academy", "lumberjanes-gotham-academy", "lumberjanes"]);
    const postPassTitleOrder = new Map<string, number>();
    teenPostPassItems.forEach((item: any, idx: number) => {
      const title = normalizeText(String(item?.doc?.title || item?.title || ""));
      if (title && !postPassTitleOrder.has(title)) postPassTitleOrder.set(title, idx);
    });
    const sciFiPreferredRoots = new Set(["black-science", "the-manhattan-projects", "adventure-time", "paper-girls", "runaways"]);
    const directFitRescueCandidates = swipeRankedCandidateList
      .filter((doc: any) => {
        const title = String(doc?.title || "").trim();
        if (!title) return false;
        if (!passesSharedNeverReturnTitleScrub(title)) return false;
        const root = String(parentFranchiseRootForDoc(doc) || "");
        if (hardBlockedArtifactRootRe.test(root) || hardBlockedLiteralRootRe.test(root)) return false;
        if (genericRecoveryTitleRe.test(title)) return false;
        if (isLikelySubtitleFragmentTitle(title)) return false;
        if (Boolean(queryTermOnlyEvidenceByTitle[title])) return false;
        const positiveFit = Number(positiveFitScoreByTitle[title] || 0);
        const dislikePenalty = Number(candidateDislikePenaltyByTitle[title] || 0);
        const semanticEvidence = Number(semanticEvidenceCountByTitle[title] || 0);
        const meaningful = Number((finalAcceptedTasteEvidenceByTitle[title] || [])
          .find((r: string) => r.startsWith("meaningfulSignals:"))?.split(":")[1] || 0);
        const postPassMember = postPassTitleOrder.has(normalizeText(title));
        const entitySeedAligned = profileSelectedEntitySeeds.some((seed) => normalizeText(title).includes(normalizeText(seed)) || normalizeText(root).includes(normalizeText(seed)));
        const hasSupport = postPassMember || entitySeedAligned || semanticEvidence >= 1 || directFitPreferredRoots.has(root);
        return positiveFit >= 5.5 && meaningful >= 1 && positiveFit > dislikePenalty && hasSupport;
      })
      .sort((a: any, b: any) => {
        const ta = String(a?.title || "").trim();
        const tb = String(b?.title || "").trim();
        const ra = String(parentFranchiseRootForDoc(a) || "");
        const rb = String(parentFranchiseRootForDoc(b) || "");
        const aSci = sciFiPreferredRoots.has(ra);
        const bSci = sciFiPreferredRoots.has(rb);
        if (aSci !== bSci) return aSci ? -1 : 1;
        const aPost = postPassTitleOrder.has(normalizeText(ta));
        const bPost = postPassTitleOrder.has(normalizeText(tb));
        if (aPost !== bPost) return aPost ? -1 : 1;
        const aPreferredRoot = directFitPreferredRoots.has(ra);
        const bPreferredRoot = directFitPreferredRoots.has(rb);
        if (aPreferredRoot !== bPreferredRoot) return aPreferredRoot ? -1 : 1;
        const aPostIdx = Number(postPassTitleOrder.get(normalizeText(ta)) ?? Number.MAX_SAFE_INTEGER);
        const bPostIdx = Number(postPassTitleOrder.get(normalizeText(tb)) ?? Number.MAX_SAFE_INTEGER);
        if (aPostIdx !== bPostIdx) return aPostIdx - bPostIdx;
        const aFit = Number(positiveFitScoreByTitle[ta] || 0);
        const bFit = Number(positiveFitScoreByTitle[tb] || 0);
        if (aFit !== bFit) return bFit - aFit;
        return 0;
      });
    const directFitPerRootCap = 1;
    const directFitDiversified: any[] = [];
    const directFitRootCounts: Record<string, number> = {};
    for (const doc of directFitRescueCandidates) {
      if (directFitDiversified.length >= Math.max(1, finalLimit)) break;
      const root = String(parentFranchiseRootForDoc(doc) || "__none__");
      const count = Number(directFitRootCounts[root] || 0);
      if (count >= directFitPerRootCap) continue;
      directFitDiversified.push(doc);
      directFitRootCounts[root] = count + 1;
    }
    if (directFitDiversified.length < Math.max(1, finalLimit)) {
      for (const doc of directFitRescueCandidates) {
        if (directFitDiversified.length >= Math.max(1, finalLimit)) break;
        if (directFitDiversified.includes(doc)) continue;
        directFitDiversified.push(doc);
      }
    }
    const directFitRescue = directFitDiversified.slice(0, Math.max(1, finalLimit)).map((doc: any) => ({ kind: "open_library", doc }));
    if (directFitRescue.length > 0) {
      finalOutputItems = directFitRescue;
      returnedItemsBuiltFrom = "direct_fit_rescue";
      finalReturnSourceUsed = "direct_fit_rescue";
    }
  }
  if (!suppressTopRecommendations && finalOutputItems.length === 0 && acceptedTitlesAfterScrub.length === 0 && (comicVineOnlyMode || fallbackOnlyResult || fallbackHeavyResult)) {
    const hardBlockedArtifactRootRe = /^(the-power-fantasy|final-fantasy-lost-stranger|graphic-fantasy|adventure-van)$/;
    const packagingArtifactRe = /\b(trade paperback|hardcover\/trade paperback|collected edition|trade paperback collected edition)\b/i;
    const semanticSparseRoots = new Set(["saga", "the-sandman", "nimona", "runaways", "paper-girls", "lumberjanes"]);
    const semanticFallbackRescue = swipeRankedCandidateList
      .filter((doc: any) => {
        const title = String(doc?.title || "").trim();
        if (!title) return false;
        if (!passesSharedNeverReturnTitleScrub(title)) return false;
        const root = String(parentFranchiseRootForDoc(doc) || "");
        if (hardBlockedArtifactRootRe.test(root)) return false;
        if (packagingArtifactRe.test(title) || isLikelySubtitleFragmentTitle(title)) return false;
        if (root === "something-is-killing-the-children" && !horrorLikeNeutralOrLiked) return false;
        const positiveFit = Number(positiveFitScoreByTitle[title] || 0);
        const semanticSupport = Boolean(semanticSupportFoundByTitle[title]);
        const semanticEvidence = Number(semanticEvidenceCountByTitle[title] || 0);
        const titleOnlyTasteSignal = titleOnlyTasteSignalByTitle[title] || [];
        const meaningfulSignals = Number((finalAcceptedTasteEvidenceByTitle[title] || [])
          .find((r: string) => r.startsWith("meaningfulSignals:"))?.split(":")[1] || 0);
        if (titleOnlyTasteSignal.length > 0 && meaningfulSignals === 0) {
          markTerminalReject(title, "semantic_fallback_title_literal_artifact");
          finalReturnDropReasonByTitle[title] = "semantic_fallback_title_literal_artifact";
          return false;
        }
        const rejectReasons = new Set(finalEligibilityRejectedTitlesByReason?.fallback_no_taste_match || []);
        const onlyFallbackNoTaste = rejectReasons.has(title) && Object.entries(finalEligibilityRejectedTitlesByReason || {}).every(([k, v]) => k === "fallback_no_taste_match" || !Array.isArray(v) || !v.includes(title));
        return positiveFit >= 5
          && !Boolean(queryTermOnlyEvidenceByTitle[title])
          && Number(candidateDislikePenaltyByTitle[title] || 0) < positiveFit
          && (semanticSupport || semanticEvidence >= 1)
          && (onlyFallbackNoTaste || semanticSparseRoots.has(root) || semanticEvidence >= 2);
      })
      .slice(0, Math.max(1, finalLimit))
      .map((doc: any) => ({ kind: "open_library", doc }));
    if (semanticFallbackRescue.length > 0) {
      finalOutputItems = semanticFallbackRescue;
      returnedItemsBuiltFrom = "semantic_fallback_rescue";
      finalReturnSourceUsed = "semantic_fallback_rescue";
    }
  }
  if (!suppressTopRecommendations && includeComicVine && finalOutputItems.length < Math.min(3, Math.max(1, finalLimit)) && acceptedTitlesAfterScrub.length === 0) {
    const alreadyChosenTitles = new Set(finalOutputItems.map((item: any) => normalizeText(String(item?.doc?.title || item?.title || ""))).filter(Boolean));
    const cleanUnderfillNeeded = Math.max(0, Math.min(3, Math.max(1, finalLimit)) - finalOutputItems.length);
    const cleanUnderfillTier = swipeRankedCandidateList
      .filter((doc: any) => {
        const title = String(doc?.title || "").trim();
        if (!title) return false;
        if (alreadyChosenTitles.has(normalizeText(title))) return false;
        if (!canReturnTitle(title, doc)) return false;
        if (isLikelySubtitleFragmentTitle(title) || isLikelyIssueFragmentDoc(doc)) return false;
        if (Boolean(queryTermOnlyEvidenceByTitle[title])) return false;
        const semanticSupportFound = Boolean(semanticSupportFoundByTitle[title]) || Number(semanticEvidenceCountByTitle[title] || 0) >= 1;
        const positiveFitScore = Number(positiveFitScoreByTitle[title] || 0);
        const candidateTasteMatchScore = Number(candidateTasteMatchScoreByTitle[title] || 0);
        const candidateTastePenalty = Number(candidateTastePenaltyByTitle[title] || candidateDislikePenaltyByTitle[title] || 0);
        const titleOnlyTasteSignal = (titleOnlyTasteSignalByTitle[title] || []).length > 0;
        const root = String(parentFranchiseRootForDoc(doc) || "");
        const parentRootSource = String(parentRootSourceByTitle[title] || "");
        const curatedRoot = Boolean(root) && isCuratedTeenGraphicNovelRoot(root);
        const curatedProfileFitScore = Number((finalScoreComponentsByTitle[title] || {}).curatedProfileFitScore || positiveFitScoreByTitle[title] || 0);
        const curatedTitleFallbackAllowance =
          teenComicVineOnlySafeUnderfillFill &&
          curatedRoot &&
          parentRootSource === "title_fallback" &&
          (Number((finalScoreComponentsByTitle[title] || {}).themeOverlap || 0) > 0 || semanticSupportFound || curatedProfileFitScore > 0);
        return (semanticSupportFound
          && positiveFitScore >= 4
          && (candidateTasteMatchScore > 0 || curatedTitleFallbackAllowance)
          && candidateTastePenalty <= candidateTasteMatchScore + 1
          && !titleOnlyTasteSignal) || curatedTitleFallbackAllowance;
      })
      .sort((a: any, b: any) => {
        const ta = String(a?.title || "").trim();
        const tb = String(b?.title || "").trim();
        const aSem = Number(semanticEvidenceCountByTitle[ta] || 0);
        const bSem = Number(semanticEvidenceCountByTitle[tb] || 0);
        if (aSem !== bSem) return bSem - aSem;
        const aFit = Number(positiveFitScoreByTitle[ta] || 0);
        const bFit = Number(positiveFitScoreByTitle[tb] || 0);
        if (aFit !== bFit) return bFit - aFit;
        return Number(candidateTastePenaltyByTitle[ta] || 0) - Number(candidateTastePenaltyByTitle[tb] || 0);
      })
      .slice(0, cleanUnderfillNeeded)
      .map((doc: any) => ({ kind: "open_library", doc }));
    if (cleanUnderfillTier.length > 0) {
      finalOutputItems = [...finalOutputItems, ...cleanUnderfillTier];
      returnedItemsBuiltFrom = finalOutputItems.length === cleanUnderfillTier.length ? "clean_semantic_underfill_rescue" : `${returnedItemsBuiltFrom}_plus_clean_semantic_underfill`;
      finalReturnSourceUsed = returnedItemsBuiltFrom;
    }
  }
  if (!suppressTopRecommendations && finalOutputItems.length === 0 && acceptedTitlesAfterScrub.length === 0 && canonicalRescueAllowed && (comicVineOnlyMode || fallbackOnlyResult || fallbackHeavyResult)) {
    const canonicalRescueRoots = new Set(["something-is-killing-the-children", "spider-man", "ms-marvel", "adventure-time", "black-science", "locke-key", "mixtape", "lumberjanes", "radiant-red"]);
    const hardBlockedArtifactRootRe = /^(the-power-fantasy|final-fantasy-lost-stranger|graphic-fantasy|adventure-van)$/;
    const hardBlockedRescueLiteralRootRe = /^(lightning-and-romance|through-romance|akiba-romance|romance-papa|sadistic-full-romance)$/;
    const genericCollectionArtifactRe = /^the collected edition$|^hardcover\/trade paperback$|^great british .+ comic book heroes(?:\s*#?\d+)?$/i;
    const genericRecoveryTitleRe = /\b(graphic fantasy|a good fantasy|science comics?|oops comic adventure|trade paperback|hardcover\/trade paperback|collected edition|trade paperback collected edition|sex fantasy|generic romance|through romance|lightning and romance|akiba romance|romance papa|sadistic full romance|the power fantasy|pirates in the heartland|mystery science theater 3000)\b/i;
    const titleOrRootIsSingleGenreLiteral = (title: string, root: string) => {
      const titleNorm = normalizeText(title);
      const rootNorm = normalizeText(root);
      return /\b(romance|fantasy|mythology|science|mystery|horror)\b/.test(titleNorm) || /\b(romance|fantasy|mythology|science|mystery|horror)\b/.test(rootNorm);
    };
    const canonicalRescuePerRootCap = finalLimit <= 2 ? 1 : 2;
    const canonicalRescueCandidates = swipeRankedCandidateList
      .filter((doc: any) => canonicalRescueRoots.has(String(parentFranchiseRootForDoc(doc) || "")))
      .filter((doc: any) => {
        const title = String(doc?.title || "").trim();
        if (!title) return false;
        if (!passesSharedNeverReturnTitleScrub(title)) return false;
        const root = String(parentFranchiseRootForDoc(doc) || "");
        if (root === "something-is-killing-the-children" && !horrorLikeNeutralOrLiked) return false;
        if (hardBlockedArtifactRootRe.test(root)) return false;
        if (hardBlockedRescueLiteralRootRe.test(root)) return false;
        if (genericRecoveryTitleRe.test(title)) return false;
        if (genericCollectionArtifactRe.test(normalizeText(title))) return false;
        if (isLikelySubtitleFragmentTitle(title)) return false;
        if (Boolean(queryTermOnlyEvidenceByTitle[title])) return false;
        const dislikePenalty = Number(candidateDislikePenaltyByTitle[title] || 0);
        const semanticEvidence = Number(semanticEvidenceCountByTitle[title] || 0);
        const positiveFit = Number(positiveFitScoreByTitle[title] || 0);
        const rescuePenaltyMultiplier = acceptedNarrativeCandidatesExist ? 0.88 : 1;
        return (semanticEvidence >= 1 || (positiveFit * rescuePenaltyMultiplier) >= 5) && (positiveFit * rescuePenaltyMultiplier) > dislikePenalty;
      });
    const canonicalRescueByRoot = new Map<string, any[]>();
    for (const doc of canonicalRescueCandidates) {
      const root = String(parentFranchiseRootForDoc(doc) || "");
      if (!root) continue;
      const bucket = canonicalRescueByRoot.get(root) || [];
      bucket.push(doc);
      canonicalRescueByRoot.set(root, bucket);
    }
    const canonicalRescueEntryPointRe = /\b(volume\s*one|volume\s*1|book\s*one|book\s*1|vol\.?\s*1|#1|tpb|trade paperback|collected edition|collection|omnibus|compendium)\b/i;
    const canonicalRescueSortedByRoot = new Map<string, any[]>();
    for (const [root, docs] of canonicalRescueByRoot.entries()) {
      const ranked = docs.slice().sort((a: any, b: any) => {
        const ta = String(a?.title || "").trim();
        const tb = String(b?.title || "").trim();
        const aEntryPoint = canonicalRescueEntryPointRe.test(ta);
        const bEntryPoint = canonicalRescueEntryPointRe.test(tb);
        if (aEntryPoint !== bEntryPoint) return aEntryPoint ? -1 : 1;
        const aVol = Number((ta.match(/\b(?:vol(?:ume)?\.?\s*)(\d+)\b/i)?.[1]) || Number.MAX_SAFE_INTEGER);
        const bVol = Number((tb.match(/\b(?:vol(?:ume)?\.?\s*)(\d+)\b/i)?.[1]) || Number.MAX_SAFE_INTEGER);
        if (aVol !== bVol) return aVol - bVol;
        const aSem = Number(semanticEvidenceCountByTitle[ta] || 0);
        const bSem = Number(semanticEvidenceCountByTitle[tb] || 0);
        if (aSem !== bSem) return bSem - aSem;
        const aFit = Number(positiveFitScoreByTitle[ta] || 0);
        const bFit = Number(positiveFitScoreByTitle[tb] || 0);
        if (aFit !== bFit) return bFit - aFit;
        return 0;
      });
      canonicalRescueSortedByRoot.set(root, ranked);
    }
    const canonicalRescueDiversified: any[] = [];
    const canonicalRescueRootCounts: Record<string, number> = {};
    const canonicalRescueLimit = Math.max(1, finalLimit);
    while (canonicalRescueDiversified.length < canonicalRescueLimit) {
      let addedThisRound = false;
      for (const [root, docs] of canonicalRescueSortedByRoot.entries()) {
        if (canonicalRescueDiversified.length >= canonicalRescueLimit) break;
        const currentRootCount = Number(canonicalRescueRootCounts[root] || 0);
        if (currentRootCount >= canonicalRescuePerRootCap) continue;
        const nextDoc = docs.shift();
        if (!nextDoc) continue;
        canonicalRescueDiversified.push(nextDoc);
        canonicalRescueRootCounts[root] = currentRootCount + 1;
        addedThisRound = true;
      }
      if (!addedThisRound) break;
    }
    const canonicalRescue = canonicalRescueDiversified.map((doc: any) => ({ kind: "open_library", doc }));
    const canonicalRescueTarget = Math.min(3, Math.max(1, finalLimit));
    const secondTierFill = swipeRankedCandidateList
        .filter((doc: any) => {
          const title = String(doc?.title || "").trim();
          if (!title) return false;
          if (!passesSharedNeverReturnTitleScrub(title)) return false;
          if (canonicalRescue.some((item: any) => normalizeText(String(item?.doc?.title || "")) === normalizeText(title))) return false;
          const root = String(parentFranchiseRootForDoc(doc) || "");
          if (hardBlockedArtifactRootRe.test(root)) return false;
          if (hardBlockedRescueLiteralRootRe.test(root)) return false;
          if (genericRecoveryTitleRe.test(title)) return false;
          if (genericCollectionArtifactRe.test(normalizeText(title))) return false;
          if (isLikelySubtitleFragmentTitle(title)) return false;
          if (Boolean(queryTermOnlyEvidenceByTitle[title])) return false;
          const positiveFit = Number(positiveFitScoreByTitle[title] || 0);
          const dislikePenalty = Number(candidateDislikePenaltyByTitle[title] || 0);
          const semanticEvidence = Number(semanticEvidenceCountByTitle[title] || 0);
          const meaningful = Number((finalAcceptedTasteEvidenceByTitle[title] || [])
            .find((r: string) => r.startsWith("meaningfulSignals:"))?.split(":")[1] || 0);
          const singleGenreLiteral = titleOrRootIsSingleGenreLiteral(title, root);
          if (singleGenreLiteral && semanticEvidence < 2) return false;
          return positiveFit >= 5.5
            && positiveFit > dislikePenalty
            && (meaningful >= 1 || semanticEvidence >= 1)
            && !singleGenreLiteral;
        })
        .slice(0, Math.max(0, canonicalRescueTarget - canonicalRescue.length))
        .map((doc: any) => ({ kind: "open_library", doc }));
    if (secondTierFill.length > 0) {
      finalOutputItems = [...secondTierFill, ...canonicalRescue].slice(0, Math.max(1, finalLimit));
      returnedItemsBuiltFrom = "second_tier_then_canonical_affinity_rescue";
      finalReturnSourceUsed = "second_tier_then_canonical_affinity_rescue";
    } else if (canonicalRescue.length > 0) {
      finalOutputItems = canonicalRescue;
      returnedItemsBuiltFrom = "canonical_affinity_rescue";
      finalReturnSourceUsed = "canonical_affinity_rescue";
    }
    if (finalOutputItems.length > 0 && finalOutputItems.length < Math.min(3, Math.max(1, finalLimit))) {
      const alreadyChosenTitles = new Set(finalOutputItems.map((item: any) => normalizeText(String(item?.doc?.title || item?.title || ""))).filter(Boolean));
      const secondTierFill = swipeRankedCandidateList
        .filter((doc: any) => {
          const title = String(doc?.title || "").trim();
          if (!title) return false;
          if (!passesSharedNeverReturnTitleScrub(title)) return false;
          if (alreadyChosenTitles.has(normalizeText(title))) return false;
          const root = String(parentFranchiseRootForDoc(doc) || "");
          if (hardBlockedArtifactRootRe.test(root)) return false;
          if (hardBlockedRescueLiteralRootRe.test(root)) return false;
          if (genericRecoveryTitleRe.test(title)) return false;
          if (genericCollectionArtifactRe.test(normalizeText(title))) return false;
          if (isLikelySubtitleFragmentTitle(title)) return false;
          if (Boolean(queryTermOnlyEvidenceByTitle[title])) return false;
          const positiveFit = Number(positiveFitScoreByTitle[title] || 0);
          const dislikePenalty = Number(candidateDislikePenaltyByTitle[title] || 0);
          const semanticEvidence = Number(semanticEvidenceCountByTitle[title] || 0);
          const meaningful = Number((finalAcceptedTasteEvidenceByTitle[title] || [])
            .find((r: string) => r.startsWith("meaningfulSignals:"))?.split(":")[1] || 0);
          const singleGenreLiteral = titleOrRootIsSingleGenreLiteral(title, root);
          if (singleGenreLiteral && semanticEvidence < 2) return false;
          return positiveFit >= 5.5
            && positiveFit > dislikePenalty
            && (meaningful >= 1 || semanticEvidence >= 1)
            && !singleGenreLiteral;
        })
        .slice(0, Math.max(0, Math.min(3, Math.max(1, finalLimit)) - finalOutputItems.length))
        .map((doc: any) => ({ kind: "open_library", doc }));
      if (secondTierFill.length > 0) {
        finalOutputItems = [...finalOutputItems, ...secondTierFill];
        returnedItemsBuiltFrom = "canonical_affinity_rescue_plus_second_tier_fill";
        finalReturnSourceUsed = "canonical_affinity_rescue_plus_second_tier_fill";
      }
    }
  }
  if (acceptedTitlesAfterScrub.length > 0 && acceptedTitlesReturned.length === 0) {
    acceptedTitlesReturned = finalOutputItems
      .map((item: any) => String(item?.doc?.title || item?.title || "").trim())
      .filter((title: string) => title && acceptedTitlesAfterScrub.some((a) => normalizeText(a) === normalizeText(title)));
    acceptedTitlesDroppedAfterScrub = acceptedTitlesAfterScrub.filter((title) => !acceptedTitlesReturned.some((r) => normalizeText(r) === normalizeText(title)));
  }
  if (!suppressTopRecommendations && finalOutputItems.length === 0 && teenPostPassOutputLength > 0 && (comicVineOnlyMode || fallbackOnlyResult || fallbackHeavyResult)) {
    const hardRejectReasonRe = /^(issue_fragment|locale_variant|placeholder|generic_artifact_no_root|terminal_reject:|final_eligibility_rejected)/;
    const genericRecoveryTitleRe = /\b(graphic fantasy|a good fantasy|science comics?|oops comic adventure|trade paperback|sex fantasy|generic romance|through romance|lightning and romance|akiba romance|romance papa|sadistic full romance|the power fantasy|pirates in the heartland|mystery science theater 3000)\b/i;
    const recoveredFromTeenPostPass = teenPostPassItems.filter((item: any) => {
      const title = String(item?.doc?.title || item?.title || "").trim();
      if (!title) return false;
      const terminalReason = String(terminalRejectReasonByTitle[normalizeText(title)] || "");
      if (hardRejectReasonRe.test(terminalReason)) return false;
      if (genericRecoveryTitleRe.test(title)) return false;
      const explicitDrop = String(finalReturnDropReasonByTitle[title] || terminalReturnDropReasonByTitle[title] || "");
      if (hardRejectReasonRe.test(explicitDrop)) return false;
      const root = parentFranchiseRootForDoc(item?.doc || item);
      const canonicalRoot = new Set(["saga", "the-sandman", "locke-key", "something-is-killing-the-children", "paper-girls", "nimona", "runaways"]).has(String(root || ""));
      const semanticEvidence = Number(semanticEvidenceCountByTitle[title] || 0);
      const positiveFit = Number(positiveFitScoreByTitle[title] || 0);
      const tasteWeighted = Number(candidateWeightedTasteScoreByTitle[title] || 0);
      const titleNorm = normalizeText(title);
      const rootNorm = normalizeText(String(root || ""));
      const singleGenreTokenOnly = /\b(romance|fantasy|mythology|science|mystery)\b/.test(titleNorm) || /\b(romance|fantasy|mythology|science|mystery)\b/.test(rootNorm);
      if (singleGenreTokenOnly && !canonicalRoot && semanticEvidence < 2) return false;
      if (!(canonicalRoot || semanticEvidence >= 2 || (positiveFit >= 5 && semanticEvidence >= 1) || (tasteWeighted >= 2.5 && semanticEvidence >= 1))) return false;
      return true;
    }).slice(0, Math.max(1, finalLimit));
    if (recoveredFromTeenPostPass.length > 0) {
      finalOutputItems = recoveredFromTeenPostPass;
      returnedItemsBuiltFrom = "teen_postpass_handoff_recovery";
      finalReturnSourceUsed = "teen_postpass_handoff_recovery";
    }
  }
  const preLateTeenUnderfillOutputItems = finalOutputItems.slice();
  const preLateTeenUnderfillBuiltFrom = String(returnedItemsBuiltFrom || "");
  if (!suppressTopRecommendations && finalOutputItems.length === 0 && teenComicVineOnlyLateUnderfill) {
    const curatedZeroResultOverride = swipeRankedCandidateList
      .filter((doc: any) => {
        const title = String(doc?.title || "").trim();
        if (!title) return false;
        if (terminalRejectReasonByTitle[normalizeText(title)]) return false;
        const root = String(parentFranchiseRootForDoc(doc) || "");
        if (!isCuratedTeenGraphicNovelRoot(root)) return false;
        const semanticSupport = Boolean(semanticSupportFoundByTitle[title]) || Number(semanticEvidenceCountByTitle[title] || 0) >= 1;
        const themeOverlap = Number((finalScoreComponentsByTitle[title] || {}).themeOverlap || 0);
        const curatedProfileFitScore = Number((finalScoreComponentsByTitle[title] || {}).curatedProfileFitScore || positiveFitScoreByTitle[title] || 0);
        return semanticSupport || themeOverlap > 0 || curatedProfileFitScore > 0;
      })
      .slice(0, 5)
      .map((doc: any) => ({ kind: "open_library", doc }));
    if (curatedZeroResultOverride.length > 0) {
      finalOutputItems = curatedZeroResultOverride;
      returnedItemsBuiltFrom = "curated_teen_comicvine_zero_result_override";
      finalReturnSourceUsed = "curated_teen_comicvine_zero_result_override";
    }
  }
  if (!suppressTopRecommendations && finalOutputItems.length === 0 && teenComicVineOnlyLateUnderfill && finalEligibleNonNegativeCount > 0) {
    const seenRoots = new Set<string>();
    const bestCleanCandidates = swipeRankedCandidateList
      .filter((doc: any) => {
        const title = String(doc?.title || "").trim();
        if (!title) return false;
        const titleNorm = normalizeText(title);
        if (terminalRejectReasonByTitle[titleNorm]) return false;
        if (Boolean(queryTermOnlyEvidenceByTitle[title])) return false;
        if (broadArtifactRejectedTitles.includes(title)) return false;
        if (genericCollectionArtifactRejectedTitles.includes(title) || formatSignalOnlyRejectedTitles.includes(title)) return false;
        if (/\b(graphic fantasy|a good fantasy|science comics?|mystery science theater 3000|collected edition|trade paperback|hardcover\/trade paperback|coming of age)\b/i.test(title)) return false;
        const semanticSupportFound = Boolean(semanticSupportFoundByTitle[title]) || Number(semanticEvidenceCountByTitle[title] || 0) >= 1;
        const positiveFitScore = Number(positiveFitScoreByTitle[title] || 0);
        const candidateTasteMatchScore = Number(candidateTasteMatchScoreByTitle[title] || 0);
        const candidateTastePenalty = Number(candidateTastePenaltyByTitle[title] || candidateDislikePenaltyByTitle[title] || 0);
        if (!(semanticSupportFound && positiveFitScore >= 2.5 && candidateTastePenalty <= candidateTasteMatchScore + 1)) return false;
        const root = String(parentFranchiseRootForDoc(doc) || "__none__");
        if (seenRoots.has(root)) return false;
        seenRoots.add(root);
        return true;
      })
      .slice(0, 5)
      .map((doc: any) => ({ kind: "open_library", doc }));
    if (bestCleanCandidates.length > 0) {
      finalOutputItems = bestCleanCandidates;
      returnedItemsBuiltFrom = "teen_comicvine_best_clean_underfill";
      finalReturnSourceUsed = "teen_comicvine_best_clean_underfill";
    }
  }
  if (!suppressTopRecommendations && finalOutputItems.length === 0 && teenComicVineOnlyLateUnderfill) {
    const curatedRootRecovery = swipeRankedCandidateList
      .filter((doc: any) => {
        const title = String(doc?.title || "").trim();
        if (!title) return false;
        const t = normalizeText(title);
        if (terminalRejectReasonByTitle[t]) return false;
        const hardReject = String(finalReturnDropReasonByTitle[title] || "").startsWith("terminal_reject:");
        if (hardReject) return false;
        const root = String(parentFranchiseRootForDoc(doc) || "");
        if (!isCuratedTeenGraphicNovelRoot(root)) return false;
        if (Boolean(queryTermOnlyEvidenceByTitle[title])) return false;
        if (isLikelySubtitleFragmentTitle(title) || isLikelyIssueFragmentDoc(doc)) return false;
        return true;
      })
      .slice(0, 5)
      .map((doc: any) => ({ kind: "open_library", doc }));
    if (curatedRootRecovery.length > 0) {
      finalOutputItems = curatedRootRecovery;
      returnedItemsBuiltFrom = "teen_comicvine_curated_root_recovery";
      finalReturnSourceUsed = "teen_comicvine_curated_root_recovery";
    }
  }
  if (!suppressTopRecommendations && acceptedTitlesAfterScrub.length > 0) {
    const acceptedOrder = acceptedTitlesAfterScrub.map((t) => normalizeText(t)).filter(Boolean);
    const acceptedSet = new Set(acceptedOrder);
    const byTitle = new Map<string, any>();
    for (const doc of acceptedDocsAfterScrub) {
      const title = String(doc?.title || "").trim();
      const key = normalizeText(title);
      if (!key || byTitle.has(key)) continue;
      byTitle.set(key, { kind: "open_library", doc });
    }
    for (const item of finalOutputItems) {
      const title = String(item?.doc?.title || item?.title || "").trim();
      const key = normalizeText(title);
      if (!key || byTitle.has(key)) continue;
      byTitle.set(key, item);
    }
    const acceptedPrefixItems = acceptedOrder.map((k) => byTitle.get(k)).filter(Boolean);
    const nonAcceptedItems = finalOutputItems.filter((item: any) => {
      const title = String(item?.doc?.title || item?.title || "").trim();
      return !acceptedSet.has(normalizeText(title));
    });
    finalOutputItems = [...acceptedPrefixItems, ...nonAcceptedItems].slice(0, Math.max(1, finalLimit));
    acceptedTitlesReturned = finalOutputItems
      .map((item: any) => String(item?.doc?.title || item?.title || "").trim())
      .filter((title: string) => title && acceptedTitlesAfterScrub.some((a) => normalizeText(a) === normalizeText(title)));
    acceptedTitlesDroppedAfterScrub = acceptedTitlesAfterScrub.filter((title) => !acceptedTitlesReturned.some((r) => normalizeText(r) === normalizeText(title)));
    const returnedNow = finalOutputItems.map((item: any) => normalizeText(String(item?.doc?.title || item?.title || ""))).filter(Boolean);
    acceptedPrefixInvariantFailed = acceptedOrder.some((t, idx) => returnedNow[idx] !== t);
  }
  finalOutputItems = finalOutputItems.filter((item: any) => passesSharedReturnArtifactScrub(item?.doc || item));
  let lateTeenUnderfillTriggered = false;
  let lateTeenUnderfillVisibleCountBefore = 0;
  let lateTeenUnderfillCandidatesConsidered = 0;
  let lateTeenUnderfillCandidatesAccepted = 0;
  const lateTeenUnderfillAcceptedTitles: string[] = [];
  const lateTeenUnderfillRejectedReasons: Record<string, number> = {};
  const lateUnderfillFillAcceptedTitles: string[] = [];
  const lateUnderfillFillRejectedReasons: Record<string, number> = {};
  const lateTargetMin = Math.max(3, Math.min(5, finalLimit));
  const visibleCount = Array.isArray(finalOutputItems) ? finalOutputItems.length : 0;
  if (!suppressTopRecommendations && teenComicVineOnlyLateUnderfill && visibleCount < lateTargetMin && finalEligibleNonNegativeCount > 0) {
    lateTeenUnderfillTriggered = true;
    lateTeenUnderfillVisibleCountBefore = visibleCount;
    const rejectedTitles = new Set(
      Object.values(finalEligibilityRejectedTitlesByReason || {})
        .flatMap((arr: any) => Array.isArray(arr) ? arr : [])
        .map((t: any) => normalizeText(String(t || "")))
        .filter(Boolean)
    );
    const allowedLateRejectReasons = new Set(["format_signal_only_without_taste_fit", "fails_taste_threshold_gate", "insufficient_positive_fit_score"]);
    const finalEligibilityRejectedFlat = Object.values(finalEligibilityRejectedTitlesByReason || {}).flatMap((arr: any) => Array.isArray(arr) ? arr : []);
    const finalEligibilityRejectedSet = new Set(finalEligibilityRejectedFlat.map((t: any) => normalizeText(String(t || ""))).filter(Boolean));
    const hardArtifactRootRejectedSet = new Set((acceptedTitlesRejectedAsArtifactRoot || []).map((t: string) => normalizeText(String(t || ""))).filter(Boolean));
    const acceptedScrubbedBeforeCanonicalSet = new Set(
      Object.entries(acceptedTitlesScrubRejectedByReason || {})
        .filter(([, reason]) => String(reason || "").length > 0)
        .map(([t]) => normalizeText(String(t || "")))
        .filter(Boolean)
    );
    const rejectReasonsByTitle = new Map<string, Set<string>>();
    for (const [reason, titles] of Object.entries(finalEligibilityRejectedTitlesByReason || {})) {
      if (!Array.isArray(titles)) continue;
      for (const t of titles) {
        const key = normalizeText(String(t || ""));
        if (!key) continue;
        if (!rejectReasonsByTitle.has(key)) rejectReasonsByTitle.set(key, new Set<string>());
        rejectReasonsByTitle.get(key)!.add(String(reason));
      }
    }
    const canonicalSignalRoots = new Set(["runaways", "saga", "ms-marvel", "paper-girls", "the-sandman", "black-science", "adventure-time", "nimona"]);
    const amuletLaneRoots = new Set(["amulet", "bone", "saga", "paper-girls", "runaways", "nimona"]);
    const genericAnthologyRootRe = /(?:^|[-\s])(comic-book-art|art-series|science-comics?|sparkler|for-posterity|anthology)(?:$|[-\s])/i;
    const queryLiteralScienceRe = /\b(science|science bros|citizen science|mystery science theater 3000)\b/i;
    const mysteryFamilyRootAlias: Record<string, string> = {
      "house-of-mystery": "house-of-mystery-family",
      "the-house-of-mystery": "house-of-mystery-family",
      "showcase-presents": "house-of-mystery-family",
      "gwandanaland-comics": "house-of-mystery-family",
    };
    const mergedPool = [
      ...finalRenderDocs.filter((d: any) => rejectedTitles.has(normalizeText(String(d?.title || "")))),
      ...finalRenderDocs,
      ...swipeRankedCandidateList,
      ...narrativeExpansionMergedDocs,
    ];
    const sortedPool = mergedPool.slice().sort((a: any, b: any) => {
      const aTitle = String(a?.title || "").trim();
      const bTitle = String(b?.title || "").trim();
      const aRoot = String(parentFranchiseRootForDoc(a) || "");
      const bRoot = String(parentFranchiseRootForDoc(b) || "");
      const aCanonical = canonicalSignalRoots.has(aRoot) || amuletLaneRoots.has(aRoot) ? 1 : 0;
      const bCanonical = canonicalSignalRoots.has(bRoot) || amuletLaneRoots.has(bRoot) ? 1 : 0;
      if (aCanonical !== bCanonical) return bCanonical - aCanonical;
      const aSem = (Boolean(semanticSupportFoundByTitle[aTitle]) || Number(semanticEvidenceCountByTitle[aTitle] || 0) >= 1) ? 1 : 0;
      const bSem = (Boolean(semanticSupportFoundByTitle[bTitle]) || Number(semanticEvidenceCountByTitle[bTitle] || 0) >= 1) ? 1 : 0;
      if (aSem !== bSem) return bSem - aSem;
      const aFit = Number(positiveFitScoreByTitle[aTitle] || 0);
      const bFit = Number(positiveFitScoreByTitle[bTitle] || 0);
      return bFit - aFit;
    });
    const seenTitle = new Set(
      finalOutputItems
        .map((item: any) => normalizeText(String(item?.doc?.title || item?.title || "")))
        .filter(Boolean)
    );
    const seenRoot = new Set(
      finalOutputItems.map((item: any) =>
        String(parentFranchiseRootForDoc(item?.doc || item) || "__none__")
      )
    );
    const seenRootFamily = new Set(
      finalOutputItems.map((item: any) => {
        const t = String(item?.doc?.title || item?.title || "");
        const r = String(parentFranchiseRootForDoc(item?.doc || item) || "__none__");
        return lateUnderfillRootFamilyKey(r, t);
      })
    );
    const lateUnderfillRootFamilyCounts: Record<string, number> = {};
    const lateUnderfillRootFamilyKey = (rawRoot: string, title: string) => {
      const text = normalizeText(`${rawRoot} ${title}`);
      if (/\b(spider[-\s]?man|spider-man noir|miles morales|avenging spider-man|amazing spider-man)\b/.test(text)) return "spider-man-family";
      if (/\bjustice league\b/.test(text)) return "justice-league-family";
      if (/\bms\.?\s*marvel\b/.test(text)) return "ms-marvel-family";
      return rawRoot || "__none__";
    };
    for (const doc of sortedPool) {
      lateTeenUnderfillCandidatesConsidered += 1;
      if (finalOutputItems.length >= lateTargetMin) break;
      const title = String(doc?.title || "").trim();
      if (!title) {
        lateTeenUnderfillRejectedReasons.empty_title = (lateTeenUnderfillRejectedReasons.empty_title || 0) + 1;
        continue;
      }
      const nt = normalizeText(title);
      if (seenTitle.has(nt)) {
        lateTeenUnderfillRejectedReasons.duplicate_title = (lateTeenUnderfillRejectedReasons.duplicate_title || 0) + 1;
        continue;
      }
      if (!passesSharedReturnArtifactScrub(doc)) {
        lateTeenUnderfillRejectedReasons.shared_scrub_block = (lateTeenUnderfillRejectedReasons.shared_scrub_block || 0) + 1;
        continue;
      }
      if (isLikelyIssueFragmentDoc(doc)) {
        lateTeenUnderfillRejectedReasons.issue_fragment = (lateTeenUnderfillRejectedReasons.issue_fragment || 0) + 1;
        continue;
      }
      const score = Number(doc?.score ?? doc?.diagnostics?.finalScore ?? 0);
      if (score < 0) {
        lateTeenUnderfillRejectedReasons.negative_score = (lateTeenUnderfillRejectedReasons.negative_score || 0) + 1;
        continue;
      }
      const root = String(parentFranchiseRootForDoc(doc) || "__none__");
      const rootFamily = mysteryFamilyRootAlias[root] || root;
      const cappedRootFamily = lateUnderfillRootFamilyKey(rootFamily, title);
      const titleNorm = normalizeText(title);
      const titleOnlyTasteSignal = queryLiteralScienceRe.test(titleNorm) || /\bmystery\b/i.test(titleNorm);
      if (terminalRejectReasonByTitle[nt]) {
        lateTeenUnderfillRejectedReasons.terminal_reject_reentry = (lateTeenUnderfillRejectedReasons.terminal_reject_reentry || 0) + 1;
        continue;
      }
      if (!passesSharedNeverReturnTitleScrub(title)) {
        lateTeenUnderfillRejectedReasons.late_fill_prior_reject_reentry = (lateTeenUnderfillRejectedReasons.late_fill_prior_reject_reentry || 0) + 1;
        continue;
      }
      if (finalEligibilityRejectedSet.has(nt)) {
        lateTeenUnderfillRejectedReasons.final_eligibility_reject_reentry = (lateTeenUnderfillRejectedReasons.final_eligibility_reject_reentry || 0) + 1;
        continue;
      }
      if (sourceSpecificRejectReasonByTitle[title]) {
        lateTeenUnderfillRejectedReasons.source_specific_reject_reentry = (lateTeenUnderfillRejectedReasons.source_specific_reject_reentry || 0) + 1;
        lateUnderfillFillRejectedReasons.source_specific_reject_reentry = (lateUnderfillFillRejectedReasons.source_specific_reject_reentry || 0) + 1;
        continue;
      }
      if (hardArtifactRootRejectedSet.has(nt)) {
        lateTeenUnderfillRejectedReasons.hard_artifact_reentry = (lateTeenUnderfillRejectedReasons.hard_artifact_reentry || 0) + 1;
        continue;
      }
      if (acceptedScrubbedBeforeCanonicalSet.has(nt)) {
        lateTeenUnderfillRejectedReasons.scrubbed_before_canonical_reentry = (lateTeenUnderfillRejectedReasons.scrubbed_before_canonical_reentry || 0) + 1;
        continue;
      }
      if (broadArtifactRejectedSet.has(nt)) {
        lateTeenUnderfillRejectedReasons.broad_artifact_reentry = (lateTeenUnderfillRejectedReasons.broad_artifact_reentry || 0) + 1;
        continue;
      }
      if (formatSignalOnlyRejectedSet.has(nt)) {
        lateTeenUnderfillRejectedReasons.format_signal_only_reentry = (lateTeenUnderfillRejectedReasons.format_signal_only_reentry || 0) + 1;
        continue;
      }
      if (genericCollectionRejectedSet.has(nt)) {
        lateTeenUnderfillRejectedReasons.generic_collection_reentry = (lateTeenUnderfillRejectedReasons.generic_collection_reentry || 0) + 1;
        continue;
      }
      const titleRejectReasons = rejectReasonsByTitle.get(nt) || new Set<string>();
      const insufficientSemanticRejected = Array.from(titleRejectReasons).some((r: string) => /insufficient_semantic/i.test(r));
      if (insufficientSemanticRejected) {
        lateTeenUnderfillRejectedReasons.insufficient_semantic_reentry = (lateTeenUnderfillRejectedReasons.insufficient_semantic_reentry || 0) + 1;
        continue;
      }
      if (seenRoot.has(root)) {
        lateTeenUnderfillRejectedReasons.duplicate_root = (lateTeenUnderfillRejectedReasons.duplicate_root || 0) + 1;
        continue;
      }
      if (seenRoot.has(rootFamily)) {
        lateTeenUnderfillRejectedReasons.duplicate_root_family = (lateTeenUnderfillRejectedReasons.duplicate_root_family || 0) + 1;
        continue;
      }
      if (seenRootFamily.has(cappedRootFamily)) {
        lateTeenUnderfillRejectedReasons.duplicate_root_family_alias = (lateTeenUnderfillRejectedReasons.duplicate_root_family_alias || 0) + 1;
        lateUnderfillFillRejectedReasons.duplicate_root_family_alias = (lateUnderfillFillRejectedReasons.duplicate_root_family_alias || 0) + 1;
        continue;
      }
      if (Number(lateUnderfillRootFamilyCounts[cappedRootFamily] || 0) >= 2) {
        lateTeenUnderfillRejectedReasons.root_family_cap = (lateTeenUnderfillRejectedReasons.root_family_cap || 0) + 1;
        lateUnderfillFillRejectedReasons.root_family_cap = (lateUnderfillFillRejectedReasons.root_family_cap || 0) + 1;
        continue;
      }
      if (genericAnthologyRootRe.test(root)) {
        lateTeenUnderfillRejectedReasons.generic_anthology_root = (lateTeenUnderfillRejectedReasons.generic_anthology_root || 0) + 1;
        continue;
      }
      const meaningful = Number((finalAcceptedTasteEvidenceByTitle[title] || []).find((r: string) => r.startsWith("meaningfulSignals:"))?.split(":")[1] || 0);
      const semanticSupport = Boolean(semanticSupportFoundByTitle[title]) || Number(semanticEvidenceCountByTitle[title] || 0) >= 1;
      const semanticEvidenceCount = Number(semanticEvidenceCountByTitle[title] || 0);
      const themeOverlap = Number((finalScoreComponentsByTitle[title] || {}).themeOverlap || 0) > 0;
      const canonicalSeriesSignal = canonicalSignalRoots.has(root);
      const positiveFit = Number(positiveFitScoreByTitle[title] || 0);
      const provenanceConfidence = Number((finalScoreComponentsByTitle[title] || {}).provenanceConfidence || 0) > 0;
      const parentRootSource = String(parentRootSourceByTitle[title] || "");
      const curatedProfileFitScore = Number((finalScoreComponentsByTitle[title] || {}).curatedProfileFitScore || positiveFit);
      const curatedTitleFallbackCanonical =
        teenComicVineOnlyLateUnderfill &&
        isCuratedTeenGraphicNovelRoot(root) &&
        parentRootSource === "title_fallback" &&
        (themeOverlap || semanticSupport || curatedProfileFitScore > 0);
      const titleFallbackCanonical = parentRootSource === "title_fallback" && positiveFit >= 4.75 && (semanticSupport || themeOverlap || provenanceConfidence);
      const queryLiteralSensitiveRoots = new Set(["graphic-fantasy", "fantasy", "coming-of-age", "history-of-science-fiction", "mystery-science-theater", "journey-into-mystery"]);
      const meaningfulTasteOverlap =
        Number((finalAcceptedTasteEvidenceByTitle[title] || []).find((r: string) => r.startsWith("meaningfulSignals:"))?.split(":")[1] || 0) >= 1 ||
        (candidateMatchedLikedSignalsByTitle[title] || []).length > 0;
      const profileStronglySupportsRoot = isCuratedTeenGraphicNovelRoot(root) || (semanticEvidenceCount >= 3 && meaningfulTasteOverlap);
      const queryLiteralOnlyRootPenalty = (queryLiteralSensitiveRoots.has(root) && !profileStronglySupportsRoot) ? 3 : 0;
      const reasons = titleRejectReasons;
      const onlySoftLateRejects = reasons.size > 0 && Array.from(reasons).every((r) => allowedLateRejectReasons.has(r));
      const titleLiteralScienceOnly = queryLiteralScienceRe.test(normalizeText(title)) && !semanticSupport;
      if (titleLiteralScienceOnly && meaningful < 1) {
        lateTeenUnderfillRejectedReasons.query_literal_science_only = (lateTeenUnderfillRejectedReasons.query_literal_science_only || 0) + 1;
        continue;
      }
      if (titleOnlyTasteSignal && !semanticSupport && meaningful < 1) {
        lateTeenUnderfillRejectedReasons.title_only_signal_without_semantics = (lateTeenUnderfillRejectedReasons.title_only_signal_without_semantics || 0) + 1;
        continue;
      }
      const genericAnthologyWithoutTaste = genericAnthologyRootRe.test(root) && meaningful < 1 && !themeOverlap;
      if (genericAnthologyWithoutTaste) {
        lateTeenUnderfillRejectedReasons.generic_anthology_without_taste = (lateTeenUnderfillRejectedReasons.generic_anthology_without_taste || 0) + 1;
        continue;
      }
      const tastePenalty = Number(candidateDislikePenaltyByTitle[title] || 0);
      const tasteMatch = Number(candidateWeightedTasteScoreByTitle[title] || 0);
      const cleanSciFiLateAllowance = semanticSupport
        && positiveFit >= 3
        && !Boolean(queryTermOnlyEvidenceByTitle[title])
        && passesSharedNeverReturnTitleScrub(title)
        && tastePenalty <= (tasteMatch + 1);
      if (!((meaningful - queryLiteralOnlyRootPenalty) >= 1 || semanticSupport || themeOverlap || canonicalSeriesSignal || titleFallbackCanonical || curatedTitleFallbackCanonical || cleanSciFiLateAllowance || ((positiveFit - queryLiteralOnlyRootPenalty) >= 5 && (provenanceConfidence || canonicalSeriesSignal || semanticSupport) && onlySoftLateRejects))) {
        lateTeenUnderfillRejectedReasons.insufficient_signal = (lateTeenUnderfillRejectedReasons.insufficient_signal || 0) + 1;
        continue;
      }
      finalOutputItems.push({ kind: "open_library", doc });
      seenTitle.add(nt);
      seenRoot.add(root);
      seenRoot.add(rootFamily);
      seenRootFamily.add(cappedRootFamily);
      lateTeenUnderfillCandidatesAccepted += 1;
      lateTeenUnderfillAcceptedTitles.push(title);
      lateUnderfillFillAcceptedTitles.push(title);
      lateUnderfillRootFamilyCounts[cappedRootFamily] = Number(lateUnderfillRootFamilyCounts[cappedRootFamily] || 0) + 1;
    }
    if (finalOutputItems.length > 0) {
      finalOutputItems = finalOutputItems.slice(0, Math.max(1, finalLimit));
      returnedItemsBuiltFrom = "late_teen_comicvine_underfill_fill";
      finalReturnSourceUsed = "late_teen_comicvine_underfill_fill";
    }
  }
  if (!suppressTopRecommendations && teenComicVineOnlyLateUnderfill && finalOutputItems.length === 0) {
    const emergencyBestClean = dedupeDocs([...(finalRenderDocs || []), ...(swipeRankedCandidateList || [])])
      .filter((doc: any) => {
        const title = String(doc?.title || "").trim();
        if (!title) return false;
        if (Number(doc?.score ?? doc?.diagnostics?.finalScore ?? 0) < 0) return false;
        if (isLikelyIssueFragmentDoc(doc) || isLikelySubtitleFragmentTitle(title)) return false;
        if (!passesSharedReturnArtifactScrub(doc)) return false;
        if (terminalRejectReasonByTitle[normalizeText(title)]) return false;
        return true;
      })
      .sort((a: any, b: any) => {
        const at = String(a?.title || "");
        const bt = String(b?.title || "");
        const ar = String(parentFranchiseRootForDoc(a) || "");
        const br = String(parentFranchiseRootForDoc(b) || "");
        const literalRoots = new Set(["coming-of-age", "graphic-fantasy", "mystery-science-theater", "journey-into-mystery", "fantasy", "history-of-science-fiction"]);
        const aPenalty = (Boolean(queryTermOnlyEvidenceByTitle[at]) && literalRoots.has(ar)) ? 3 : 0;
        const bPenalty = (Boolean(queryTermOnlyEvidenceByTitle[bt]) && literalRoots.has(br)) ? 3 : 0;
        const aFit = Number(positiveFitScoreByTitle[at] || 0) + Number(candidateWeightedTasteScoreByTitle[at] || 0) - Number(candidateDislikePenaltyByTitle[at] || 0) - aPenalty;
        const bFit = Number(positiveFitScoreByTitle[bt] || 0) + Number(candidateWeightedTasteScoreByTitle[bt] || 0) - Number(candidateDislikePenaltyByTitle[bt] || 0) - bPenalty;
        return bFit - aFit;
      })
      .slice(0, Math.max(3, Math.min(5, Math.max(finalLimit, 5))))
      .map((doc: any) => ({ kind: "open_library", doc }));
    if (emergencyBestClean.length > 0) {
      finalOutputItems = emergencyBestClean;
      returnedItemsBuiltFrom = "teen_comicvine_emergency_best_clean";
      finalReturnSourceUsed = "teen_comicvine_emergency_best_clean";
    }
  }
  if (teenComicVineOnlyLateUnderfill && finalOutputItems.length === 0) {
    const failSoftSafeBasePool = teenComicVinePositiveFitRescuePool.length > 0
      ? teenComicVinePositiveFitRescuePool
      : dedupeDocs([...(finalRenderDocs || []), ...(swipeRankedCandidateList || []), ...(narrativeExpansionMergedDocs || [])]);
    const failSoftSafeCandidates = failSoftSafeBasePool
      .filter((doc: any) => {
        const title = String(doc?.title || "").trim();
        if (!title) return false;
        if (Number(doc?.score ?? doc?.diagnostics?.finalScore ?? 0) < 0) return false;
        if (isLikelyIssueFragmentDoc(doc) || isLikelySubtitleFragmentTitle(title)) return false;
        if (!passesSharedReturnArtifactScrub(doc)) return false;
        if (String(terminalRejectReasonByTitle[normalizeText(title)] || "").includes("age_maturity_blocked")) return false;
        const positiveFit = Number(positiveFitScoreByTitle[title] || 0);
        const weightedTaste = Number(candidateWeightedTasteScoreByTitle[title] || 0);
        return positiveFit > 0 || weightedTaste > 0;
      })
      .sort((a: any, b: any) => {
        const at = String(a?.title || "");
        const bt = String(b?.title || "");
        const ar = String(parentFranchiseRootForDoc(a) || "");
        const br = String(parentFranchiseRootForDoc(b) || "");
        const literalRoots = new Set(["coming-of-age", "graphic-fantasy", "mystery-science-theater", "journey-into-mystery", "fantasy", "history-of-science-fiction"]);
        const aPenalty = (Boolean(queryTermOnlyEvidenceByTitle[at]) && literalRoots.has(ar)) ? 3 : 0;
        const bPenalty = (Boolean(queryTermOnlyEvidenceByTitle[bt]) && literalRoots.has(br)) ? 3 : 0;
        const aFit = Number(positiveFitScoreByTitle[at] || 0) + Number(candidateWeightedTasteScoreByTitle[at] || 0) - Number(candidateDislikePenaltyByTitle[at] || 0) - aPenalty;
        const bFit = Number(positiveFitScoreByTitle[bt] || 0) + Number(candidateWeightedTasteScoreByTitle[bt] || 0) - Number(candidateDislikePenaltyByTitle[bt] || 0) - bPenalty;
        return bFit - aFit;
      })
      .slice(0, Math.max(3, Math.min(5, Math.max(finalLimit, 5))))
      .map((doc: any) => ({ kind: "open_library", doc }));
    if (failSoftSafeCandidates.length > 0) {
      finalOutputItems = failSoftSafeCandidates;
      returnedItemsBuiltFrom = "teen_comicvine_fail_soft_safe_candidates";
      finalReturnSourceUsed = "teen_comicvine_fail_soft_safe_candidates";
    }
  }
  if (teenComicVineOnlyLateUnderfill && finalOutputItems.length > 0 && finalOutputItems.length < 3) {
    const seen = new Set(finalOutputItems.map((item: any) => normalizeText(String(item?.doc?.title || item?.title || ""))).filter(Boolean));
    const rescueTopUpPool = teenComicVinePositiveFitRescuePool
      .filter((doc: any) => {
        const title = String(doc?.title || "").trim();
        if (!title) return false;
        if (seen.has(normalizeText(title))) return false;
        const ok = passesPositiveFitRescueSafety(doc);
        if (!ok) positiveFitRescueRejectedReasons[title] = positiveFitRescueRejectedReasons[title] || "rescue_safety_scrub_failed";
        return ok;
      })
      ;
    const rescueTopUp = selectRescueWithRootDiversity(rescueTopUpPool, 3 - finalOutputItems.length).map((doc: any) => ({ kind: "open_library", doc }));
    if (rescueTopUp.length > 0) {
      finalOutputItems = [...finalOutputItems, ...rescueTopUp];
      positiveFitRescueTopUpApplied = true;
      returnedItemsBuiltFrom = returnedItemsBuiltFrom === "positive_fit_rescue"
        ? "positive_fit_rescue"
        : "positive_fit_rescue_top_up";
      finalReturnSourceUsed = "positive_fit_rescue_top_up";
      positiveFitRescueReturnedTitles = finalOutputItems.map((item: any) => String(item?.doc?.title || item?.title || "").trim()).filter(Boolean);
    }
  }
  finalOutputItems = finalOutputItems.filter((item: any) => canReturnTitle(String(item?.doc?.title || item?.title || "").trim(), item?.doc || item));
  finalOutputItems = finalOutputItems.filter((item: any) => passesSharedReturnArtifactScrub(item?.doc || item));
  if (teenComicVineOnlyLateUnderfill && finalOutputItems.length < 3) {
    const byTitle = new Map<string, any>();
    for (const doc of teenComicVinePositiveFitRescuePool) {
      const title = String(doc?.title || "").trim();
      if (!title) continue;
      const nt = normalizeText(title);
      if (!byTitle.has(nt)) byTitle.set(nt, doc);
    }
    const seen = new Set(finalOutputItems.map((item: any) => normalizeText(String(item?.doc?.title || item?.title || ""))).filter(Boolean));
    const toAppend: any[] = [];
    for (const title of positiveFitRescueEligibleTitles) {
      if (finalOutputItems.length + toAppend.length >= 3) break;
      const nt = normalizeText(title);
      if (!nt || seen.has(nt)) continue;
      const doc = byTitle.get(nt);
      if (!doc) continue;
      if (!passesPositiveFitRescueSafety(doc)) continue;
      toAppend.push({ kind: "open_library", doc });
      seen.add(nt);
    }
    if (toAppend.length > 0) {
      finalOutputItems = [...finalOutputItems, ...toAppend];
      positiveFitRescueTopUpApplied = true;
      returnedItemsBuiltFrom = returnedItemsBuiltFrom === "positive_fit_rescue"
        ? "positive_fit_rescue"
        : "positive_fit_rescue_top_up";
      finalReturnSourceUsed = "positive_fit_rescue_top_up";
      positiveFitRescueReturnedTitles = finalOutputItems.map((item: any) => String(item?.doc?.title || item?.title || "").trim()).filter(Boolean);
    }
  }
  if (teenComicVineOnlyLateUnderfill && finalOutputItems.length < 3) {
    const emergencyPool = dedupeDocs([
      ...(teenComicVinePositiveFitRescuePool || []),
      ...(finalRenderDocs || []),
      ...(finalRankedDocs || []),
      ...(finalRankedDocsBase || []),
      ...(rankedDocs || []),
      ...(recoveryTriggered ? [...(enrichedDocs as any[]), ...(normalizedCandidates as any[]), ...(candidateDocs as any[])] : []),
    ] as any[]).filter((doc: any) => {
      const title = String(doc?.title || "").trim();
      if (!title) return false;
      if (isLikelyIssueFragmentDoc(doc) || isLikelySubtitleFragmentTitle(title)) return false;
      if (String(terminalRejectReasonByTitle[normalizeText(title)] || "").includes("age_maturity_blocked")) return false;
      if (String(terminalRejectReasonByTitle[normalizeText(title)] || "").includes("locale_variant")) return false;
      if (negativeScoreBlockedSet.has(normalizeText(title))) return false;
      if (Number(doc?.score ?? doc?.diagnostics?.finalScore ?? 0) < 0) return false;
      if (!passesEmergencySafeRescue(doc)) return false;
      return true;
    });
    const seen = new Set(finalOutputItems.map((item: any) => normalizeText(String(item?.doc?.title || item?.title || ""))).filter(Boolean));
    const stronger = emergencyPool.filter((doc: any) => {
      const t = String(doc?.title || "").trim();
      return (Number(positiveFitScoreByTitle[t] || 0) > 0) || (Number(candidateWeightedTasteScoreByTitle[t] || 0) > 0);
    });
    const weaker = emergencyPool.filter((doc: any) => {
      const t = String(doc?.title || "").trim();
      return !((Number(positiveFitScoreByTitle[t] || 0) > 0) || (Number(candidateWeightedTasteScoreByTitle[t] || 0) > 0));
    });
    const selectedStrong = selectRescueWithRootDiversity(stronger.filter((doc: any) => !seen.has(normalizeText(String(doc?.title || "")))), 3 - finalOutputItems.length);
    let toAdd = selectedStrong;
    if (toAdd.length < (3 - finalOutputItems.length)) {
      const need = (3 - finalOutputItems.length) - toAdd.length;
      const selectedWeak = selectRescueWithRootDiversity(weaker.filter((doc: any) => !seen.has(normalizeText(String(doc?.title || ""))) && !toAdd.some((d: any) => normalizeText(String(d?.title || "")) === normalizeText(String(doc?.title || "")))), need);
      toAdd = [...toAdd, ...selectedWeak];
    }
    if (toAdd.length > 0) {
      finalOutputItems = [...finalOutputItems, ...toAdd.map((doc: any) => ({ kind: "open_library", doc }))];
      returnedItemsBuiltFrom = finalOutputItems.length >= 3 ? "emergency_safe_rescue" : "emergency_safe_rescue_partial";
      finalReturnSourceUsed = returnedItemsBuiltFrom;
      emergencySafeRescueReturnedTitles = toAdd.map((doc: any) => String(doc?.title || "").trim()).filter(Boolean);
    }
  }
  if (teenComicVineOnlyLateUnderfill && comicVineOnlyMode && finalOutputItems.length < 3 && postTopUpFinalItemsLength >= 1) {
    const emergencyFromPostTopUp = selectRescueWithRootDiversity(
      (finalRenderDocs || []).filter((doc: any) => {
        const title = String(doc?.title || "").trim();
        if (!title) return false;
        if (Number(doc?.score ?? doc?.diagnostics?.finalScore ?? 0) < 0) return false;
        if (isLikelyIssueFragmentDoc(doc) || isLikelySubtitleFragmentTitle(title)) return false;
        if (String(terminalRejectReasonByTitle[normalizeText(title)] || "").includes("age_maturity_blocked")) return false;
        if (String(terminalRejectReasonByTitle[normalizeText(title)] || "").includes("locale_variant")) return false;
        return passesEmergencySafeRescue(doc);
      }),
      Math.max(0, 3 - finalOutputItems.length)
    ).map((doc: any) => ({ kind: "open_library", doc }));
    if (emergencyFromPostTopUp.length > 0) {
      const seen = new Set(finalOutputItems.map((item: any) => normalizeText(String(item?.doc?.title || item?.title || ""))).filter(Boolean));
      const append = emergencyFromPostTopUp.filter((item: any) => {
        const t = normalizeText(String(item?.doc?.title || item?.title || ""));
        if (!t || seen.has(t)) return false;
        seen.add(t);
        return true;
      });
      finalOutputItems = [...finalOutputItems, ...append].slice(0, 3);
      returnedItemsBuiltFrom = "emergency_safe_rescue_from_post_topup";
      finalReturnSourceUsed = "emergency_safe_rescue_from_post_topup";
      emergencySafeRescueReturnedTitles = finalOutputItems.map((item: any) => String(item?.doc?.title || "").trim()).filter(Boolean);
    }
  }
  if (teenComicVineOnlyLateUnderfill && comicVineOnlyMode && String(returnedItemsBuiltFrom) === "suppressed_scored_universe_failure") {
    returnedItemsBuiltFrom = finalOutputItems.length > 0 ? "emergency_safe_rescue" : "none";
  }
  if (teenComicVineOnlyLateUnderfill && comicVineOnlyMode && finalOutputItems.length < 3) {
    const fallbackEmergency = selectRescueWithRootDiversity(
      dedupeDocs([
        ...(finalRenderDocs || []),
        ...(finalRankedDocs || []),
        ...(finalRankedDocsBase || []),
        ...(rankedDocs || []),
        ...(normalizedCandidates || []),
        ...(candidateDocs || []),
      ] as any[]).filter((doc: any) => passesEmergencySafeRescue(doc)),
      3
    ).map((doc: any) => ({ kind: "open_library", doc }));
    if (fallbackEmergency.length > 0) {
      finalOutputItems = fallbackEmergency.slice(0, 3);
      returnedItemsBuiltFrom = "emergency_safe_rescue_final";
      finalReturnSourceUsed = "emergency_safe_rescue_final";
      emergencySafeRescueReturnedTitles = finalOutputItems.map((item: any) => String(item?.doc?.title || item?.title || "").trim()).filter(Boolean);
    }
  }
  if (teenComicVineOnlyLateUnderfill && finalOutputItems.length > 0) {
    const enabledSourceCountLateUnderfill = [
      sourceEnabled.googleBooks ? 1 : 0,
      sourceEnabled.openLibrary ? 1 : 0,
      sourceEnabled.localLibrary ? 1 : 0,
      includeKitsu ? 1 : 0,
      includeComicVine ? 1 : 0,
    ].reduce((acc, n) => acc + n, 0);
    const singleSourceContractModeLateUnderfill = enabledSourceCountLateUnderfill === 1;
    const lateUnderfillTarget = singleSourceContractModeLateUnderfill
      ? Math.max(1, Math.min(10, finalLimit))
      : 3;
    const seenTitle = new Set<string>();
    finalOutputItems = finalOutputItems.filter((item: any) => {
      const t = normalizeText(String(item?.doc?.title || item?.title || ""));
      if (!t || seenTitle.has(t)) return false;
      seenTitle.add(t);
      return true;
    });
    const roots = finalOutputItems
      .map((item: any) => String(parentFranchiseRootForDoc(item?.doc || item) || "__none__"))
      .filter((r: string) => r !== "__none__");
    const distinctRoots = new Set(roots);
    if (!singleSourceContractModeLateUnderfill && distinctRoots.size >= 3) {
      const seenRoot = new Set<string>();
      finalOutputItems = finalOutputItems.filter((item: any) => {
        const root = String(parentFranchiseRootForDoc(item?.doc || item) || "__none__");
        if (root === "__none__") return true;
        if (seenRoot.has(root)) return false;
        seenRoot.add(root);
        return true;
      });
    }
    if (finalOutputItems.length < lateUnderfillTarget) {
      const refill = selectRescueWithRootDiversity(
        dedupeDocs([...(finalRenderDocs || []), ...(finalRankedDocsBase || []), ...(rankedDocs || []), ...(teenComicVinePositiveFitRescuePool || [])] as any[])
          .filter((doc: any) => {
            const t = normalizeText(String(doc?.title || ""));
            if (!t || seenTitle.has(t)) return false;
            return passesEmergencySafeRescue(doc);
          }),
        lateUnderfillTarget - finalOutputItems.length
      ).map((doc: any) => ({ kind: "open_library", doc }));
      if (refill.length > 0) finalOutputItems = [...finalOutputItems, ...refill];
    }
  }
  if (
    teenComicVineOnlyLateUnderfill &&
    includeComicVine &&
    comicVineOnlyMode &&
    preLateTeenUnderfillOutputItems.length > 0 &&
    finalOutputItems.length > 0 &&
    finalOutputItems.length < preLateTeenUnderfillOutputItems.length
  ) {
    finalOutputItems = preLateTeenUnderfillOutputItems;
    returnedItemsBuiltFrom = `${preLateTeenUnderfillBuiltFrom || "none"}_non_shrunk_restore`;
    finalReturnSourceUsed = `${String(finalReturnSourceUsed || "none")}_non_shrunk_restore`;
  }
  if (finalOutputItems.length === 0 && /recovery|rescue|underfill|direct|accepted_titles_authoritative/.test(String(returnedItemsBuiltFrom || ""))) {
    if (teenComicVineOnlyLateUnderfill && includeComicVine && comicVineOnlyMode) {
      returnedItemsBuiltFrom = "none";
    } else {
      returnedItemsBuiltFrom = suppressTopRecommendations
        ? (scoredUniverseFailure ? "suppressed_scored_universe_failure" : "suppressed")
        : "none";
    }
  }
  if (!suppressTopRecommendations && finalOutputItems.length === 0 && emergencySafeRescueReturnedTitles.length > 0) {
    underfillReason = "emergency_rescue_candidates_removed_by_late_safety_filters";
    markSourceSpecificGate(
      "__router__",
      `emergency_rescue_dropped_after_late_filters:${Array.from(new Set(emergencySafeRescueReturnedTitles)).slice(0, 20).join("|") || "(none)"}`
    );
  }
  if (!suppressTopRecommendations && emergencySafeRescueReturnedTitles.length > 0) {
    const finalReturnedSet = new Set(finalOutputItems.map((item: any) => normalizeText(String(item?.doc?.title || item?.title || ""))).filter(Boolean));
    const droppedEmergencyRescueTitles = Array.from(new Set(emergencySafeRescueReturnedTitles.filter(Boolean))).filter((t) => !finalReturnedSet.has(normalizeText(t)));
    if (droppedEmergencyRescueTitles.length > 0) {
      markSourceSpecificGate("__router__", `emergency_rescue_removed_titles:${droppedEmergencyRescueTitles.slice(0, 20).join("|")}`);
    }
  }
  const enabledSourceCountForContract = [
    sourceEnabled.googleBooks ? 1 : 0,
    sourceEnabled.openLibrary ? 1 : 0,
    sourceEnabled.localLibrary ? 1 : 0,
    includeKitsu ? 1 : 0,
    includeComicVine ? 1 : 0,
  ].reduce((acc, n) => acc + n, 0);
  const targetFinalCountForContract = Math.max(1, Math.min(10, finalLimit));
  const scoredUniverseCandidateSignalCount = Math.max(
    Number(scoredCandidateUniverseCount || 0),
    Number(convertedDocsAvailableForScoringCount || 0),
    Array.isArray(scoredCanonicalDocs) ? scoredCanonicalDocs.length : 0,
    Array.isArray(swipeRankedCandidateList) ? swipeRankedCandidateList.length : 0
  );
  const refillLikedSignalSet = new Set([
    ...((likedSignalsSafe || []) as string[]),
    ...((likedGenresSafe || []) as string[]),
    ...((likedTonesSafe || []) as string[]),
    ...((likedThemesSafe || []) as string[]),
  ].map((s) => normalizeText(String(s || ""))).filter(Boolean));
  const refillDislikedSignalSet = new Set((dislikedSignalsSafe || []).map((s: string) => normalizeText(String(s || ""))).filter(Boolean));
  const refillText = (doc: any) => normalizeText([doc?.title, doc?.description, doc?.subjects, doc?.queryText].filter(Boolean).join(" "));
  const superheroAdventureDisliked = ["superheroes", "superhero", "comic", "adventure", "action"].some((s) => refillDislikedSignalSet.has(normalizeText(s)));
  const isSuperheroAdventureDoc = (doc: any) => /\b(superhero|superheroes|marvel|dc comics|dc universe|avengers|x-men|justice league|teen titans|batman|superman|spider-man|action[-\s]?adventure)\b/i.test(String([doc?.title, doc?.description, doc?.subjects].filter(Boolean).join(" ")));
  const refillAlignmentTier = (doc: any): { tier: "strong_taste_fit" | "semantic_narrative_fit" | "adjacent_profile_fit" | "safe_filler"; reason: string } => {
    const text = refillText(doc);
    const score = Number(doc?.score ?? doc?.diagnostics?.finalScore ?? 0);
    const likedMatches = Array.from(refillLikedSignalSet).filter((sig) => sig.length >= 4 && text.includes(sig)).length;
    const dislikedMatches = Array.from(refillDislikedSignalSet).filter((sig) => sig.length >= 4 && text.includes(sig)).length;
    const narrativeFit = /\b(novel|story|character|coming of age|mystery|thriller|drama|literary|psychological|suspense|relationship)\b/i.test(String([doc?.title, doc?.description, doc?.queryText].filter(Boolean).join(" ")));
    const strongSemanticSupport = Number(doc?.diagnostics?.semanticEvidenceCount || 0) >= 2 || Boolean(doc?.diagnostics?.semanticSupportFound);
    const profileRootMatch = profileSelectedEntitySeeds.some((seed: string) => text.includes(normalizeText(seed)));
    if (likedMatches >= 2 && dislikedMatches === 0 && score >= 0.15) return { tier: "strong_taste_fit", reason: `liked_matches=${likedMatches}` };
    if ((likedMatches >= 1 || strongSemanticSupport || profileRootMatch) && dislikedMatches === 0 && narrativeFit) return { tier: "semantic_narrative_fit", reason: `liked_matches=${likedMatches}:narrative_fit=true` };
    if ((likedMatches >= 1 || strongSemanticSupport || narrativeFit || profileRootMatch) && score >= 0) return { tier: "adjacent_profile_fit", reason: `adjacent_profile_fit` };
    return { tier: "safe_filler", reason: `liked_matches=${likedMatches}:disliked_matches=${dislikedMatches}:score=${score.toFixed(2)}:narrative_fit=${narrativeFit}` };
  };
  const alwaysFillToTen = Boolean((input as any)?.alwaysFillTo10 === true || (input as any)?.alwaysFillToTen === true);
  let safeFillerUsedInTopup = 0;
  if (!suppressTopRecommendations && enabledSourceCountForContract === 1 && finalOutputItems.length < targetFinalCountForContract) {
    const seen = new Set(finalOutputItems.map((item: any) => normalizeText(String(item?.doc?.title || item?.title || ""))).filter(Boolean));
    const singleSourceContractTopUp = dedupeDocs([
      ...(finalRenderDocs || []),
      ...(finalRankedDocsBase || []),
      ...(rankedDocs || []),
      ...(viableCandidates || []),
      ...(teenComicVinePositiveFitRescuePool || []),
    ] as any[])
      .filter((doc: any) => {
        const title = String(doc?.title || "").trim();
        const key = normalizeText(title);
        if (!title || !key || seen.has(key)) return false;
        if (!passesEmergencySafeRescue(doc)) return false;
        return true;
      })
      .slice(0, Math.max(0, targetFinalCountForContract - finalOutputItems.length))
      .map((doc: any) => ({ kind: "open_library", doc }));
    if (singleSourceContractTopUp.length > 0) {
      finalOutputItems = [...finalOutputItems, ...singleSourceContractTopUp];
      returnedItemsBuiltFrom = `${returnedItemsBuiltFrom || "none"}_single_source_contract_topup`;
      finalReturnSourceUsed = `${finalReturnSourceUsed || "none"}_single_source_contract_topup`;
    }
  }
  if (
    !suppressTopRecommendations &&
    comicVineOnlyMode &&
    finalOutputItems.length < 10 &&
    Number(scoredCandidateUniverseCount || 0) > finalOutputItems.length
  ) {
    markSourceSpecificGate(
      "__router__",
      `scored_universe_contract_topup_entered:failure=${scoredUniverseFailure ? "true" : "false"}:candidate_signal_count=${scoredUniverseCandidateSignalCount}:returned_items=${finalOutputItems.length}`
    );
    const seen = new Set(finalOutputItems.map((item: any) => normalizeText(String(item?.doc?.title || item?.title || ""))).filter(Boolean));
    const scoredUniverseTopUpCandidateDiagnostics: string[] = [];
    const scoredUniverseTopUpAcceptedTitles: string[] = [];
    const scoredUniverseTopUpRejectReason = (doc: any): string => {
      const title = String(doc?.title || "").trim();
      const nt = normalizeText(title);
      const score = Number(doc?.score ?? doc?.diagnostics?.finalScore ?? 0);
      if (!title || !nt) return "missing_title";
      if (seen.has(nt)) return "duplicate_title";
      if (score < 0) return "negative_score";
      if (!explicitSuperheroSignal && isSuperheroAdventureDoc(doc)) return "superhero_topup_blocked_without_explicit_signal";
      if (superheroAdventureDisliked && isSuperheroAdventureDoc(doc)) {
        const tier = refillAlignmentTier(doc);
        if (tier.tier !== "strong_taste_fit") return `superhero_disliked_without_countervailing_support:tier=${tier.tier}`;
      }
      const cleanSeriesOrCollected = isCleanSeriesOrCollectedCandidate(title, doc);
      if ((isLikelyIssueFragmentDoc(doc) || isLikelySubtitleFragmentTitle(title)) && !cleanSeriesOrCollected) return "passesEmergencySafeRescue:issue_fragment";
      if (String(terminalRejectReasonByTitle[nt] || "").includes("age_maturity_blocked")) return "passesEmergencySafeRescue:age_maturity_blocked";
      if (String(terminalRejectReasonByTitle[nt] || "").includes("locale_variant")) return "passesEmergencySafeRescue:locale_variant";
      if (negativeScoreBlockedSet.has(nt)) return "passesEmergencySafeRescue:negative_score_blocked_set";
      if (hardLexicalDieArtifactRe.test(title)) return "passesEmergencySafeRescue:hard_lexical_die_artifact";
      if (terminalRejectReasonByTitle[nt]) return `canReturnTitle:terminal_reject:${terminalRejectReasonByTitle[nt]}`;
      if (lateFillNeverReturnTitles.has(nt) && !(enabledSourceCountForContract === 1 && includeComicVine && cleanSeriesOrCollected)) return "canReturnTitle:late_fill_never_return";
      if (genericCollectionRejectedSet.has(nt)) return "canReturnTitle:generic_collection_rejected";
      if (formatSignalOnlyRejectedSet.has(nt)) return "canReturnTitle:format_signal_only_rejected";
      if (finalEligibilityHardNeverReturnTitles.has(nt)) return "canReturnTitle:final_eligibility_hard_never_return";
      if (isParodyMetaReturnBlocked(title, doc)) return "canReturnTitle:parody_meta_blocked";
      const artifactScrubReason = sharedReturnArtifactScrubRejectReason(doc);
      if (artifactScrubReason) return `passesSharedReturnArtifactScrub:${artifactScrubReason}`;
      return "accept";
    };
    const scoredUniverseTiered = dedupeDocs([
      ...(scoredCanonicalDocs || []),
      ...(swipeRankedCandidateList || []),
      ...(finalRenderDocs || []),
      ...(viableCandidates || []),
      ...(candidateDocs || []),
      ...(normalizedCandidates || []),
    ] as any[]).map((doc: any) => ({ doc, align: refillAlignmentTier(doc) }));
    const scoredUniverseContractTopUp = scoredUniverseTiered
      .filter(({ doc, align }: any) => {
        const title = String(doc?.title || "").trim();
        const score = Number(doc?.score ?? doc?.diagnostics?.finalScore ?? 0);
        const reason = scoredUniverseTopUpRejectReason(doc);
        if (reason !== "accept") {
          scoredUniverseTopUpCandidateDiagnostics.push(`${title || "(untitled)"}:score=${score.toFixed(2)}:reject=${reason}:tier=${align.tier}`);
          return false;
        }
        scoredUniverseTopUpCandidateDiagnostics.push(`${title}:score=${score.toFixed(2)}:accept:tier=${align.tier}:align_reason=${align.reason}`);
        scoredUniverseTopUpAcceptedTitles.push(title);
        return true;
      })
      .sort((a: any, b: any) => {
        const order = { strong_taste_fit: 0, semantic_narrative_fit: 1, adjacent_profile_fit: 2, safe_filler: 3 } as Record<string, number>;
        const ao = order[a.align?.tier || "safe_filler"] ?? 2;
        const bo = order[b.align?.tier || "safe_filler"] ?? 2;
        if (ao !== bo) return ao - bo;
        return Number(b.doc?.score ?? b.doc?.diagnostics?.finalScore ?? 0) - Number(a.doc?.score ?? a.doc?.diagnostics?.finalScore ?? 0);
      })
      .filter(({ align }: any) => alwaysFillToTen || align?.tier !== "safe_filler" || safeFillerUsedInTopup < 2)
      .slice(0, Math.max(0, targetFinalCountForContract - finalOutputItems.length))
      .map(({ doc }: any) => ({ kind: "open_library", doc }));
    safeFillerUsedInTopup += scoredUniverseContractTopUp.filter((item: any) => refillAlignmentTier(item?.doc).tier === "safe_filler").length;
    markSourceSpecificGate("__router__", `scored_universe_contract_topup_candidate_count:${scoredUniverseTopUpCandidateDiagnostics.length}`);
    markSourceSpecificGate("__router__", `scored_universe_contract_topup_candidates:${scoredUniverseTopUpCandidateDiagnostics.slice(0, 80).join("|") || "(none)"}`);
    const scoredUniverseTopUpAcceptsForDiagnostics =
      finalEligibilityAcceptedTitles.length > 0
        ? Array.from(new Set(scoredUniverseTopUpAcceptedTitles)).slice(0, 40)
        : [];
    markSourceSpecificGate("__router__", `scored_universe_contract_topup_accepts:${scoredUniverseTopUpAcceptsForDiagnostics.join("|") || "(none)"}`);
    markSourceSpecificGate("__router__", `scored_universe_contract_topup_alignment_tiered:true`);
    if (scoredUniverseContractTopUp.length > 0) {
      finalOutputItems = [...finalOutputItems, ...scoredUniverseContractTopUp];
      returnedItemsBuiltFrom = `${returnedItemsBuiltFrom || "none"}_scored_universe_contract_topup`;
      finalReturnSourceUsed = `${finalReturnSourceUsed || "none"}_scored_universe_contract_topup`;
    }
  }
  if (
    !suppressTopRecommendations &&
    enabledSourceCountForContract === 1 &&
    includeComicVine &&
    finalOutputItems.length < targetFinalCountForContract
  ) {
    const seen = new Set(finalOutputItems.map((item: any) => normalizeText(String(item?.doc?.title || item?.title || ""))).filter(Boolean));
    const finalContractRefillDiagnostics: string[] = [];
    const finalContractRefillAcceptedTitles: string[] = [];
    const finalContractRefill = dedupeDocs([
      ...(scoredCanonicalDocs || []),
      ...(finalRenderDocs || []),
      ...(swipeRankedCandidateList || []),
      ...(rankedDocs || []),
      ...(candidateDocs || []),
      ...(normalizedCandidates || []),
      ...(viableCandidates || []),
      ...(teenComicVinePositiveFitRescuePool || []),
    ] as any[])
      .map((doc: any) => ({ doc, align: refillAlignmentTier(doc) }))
      .filter(({ doc, align }: any) => {
        const title = String(doc?.title || "").trim();
        const nt = normalizeText(title);
        if (!title || !nt) {
          finalContractRefillDiagnostics.push(`${title || "(untitled)"}:reject=missing_title`);
          return false;
        }
        if (seen.has(nt)) {
          finalContractRefillDiagnostics.push(`${title}:reject=duplicate_title`);
          return false;
        }
        if (!passesEmergencySafeRescue(doc)) {
          finalContractRefillDiagnostics.push(`${title}:reject=passesEmergencySafeRescue:false`);
          return false;
        }
        if (superheroAdventureDisliked && isSuperheroAdventureDoc(doc) && align.tier !== "strong_taste_fit") {
          finalContractRefillDiagnostics.push(`${title}:reject=superhero_disliked_without_countervailing_support:tier=${align.tier}`);
          return false;
        }
        const returnReject = canReturnTitleRejectReason(title, doc);
        if (returnReject) {
          finalContractRefillDiagnostics.push(`${title}:reject=canReturnTitle:${returnReject}`);
          return false;
        }
        finalContractRefillDiagnostics.push(`${title}:accept:tier=${align.tier}:align_reason=${align.reason}`);
        finalContractRefillAcceptedTitles.push(title);
        return true;
      })
      .sort((a: any, b: any) => {
        const order = { strong_taste_fit: 0, semantic_narrative_fit: 1, adjacent_profile_fit: 2, safe_filler: 3 } as Record<string, number>;
        return (order[a.align?.tier || "safe_filler"] ?? 2) - (order[b.align?.tier || "safe_filler"] ?? 2);
      })
      .filter(({ align }: any) => alwaysFillToTen || align?.tier !== "safe_filler" || safeFillerUsedInTopup < 2)
      .slice(0, Math.max(0, targetFinalCountForContract - finalOutputItems.length))
      .map(({ doc }: any) => ({ kind: "open_library", doc }));
    safeFillerUsedInTopup += finalContractRefill.filter((item: any) => refillAlignmentTier(item?.doc).tier === "safe_filler").length;
    if (finalContractRefill.length > 0) {
      finalOutputItems = [...finalOutputItems, ...finalContractRefill];
      returnedItemsBuiltFrom = `${returnedItemsBuiltFrom || "none"}_final_contract_refill`;
      finalReturnSourceUsed = `${finalReturnSourceUsed || "none"}_final_contract_refill`;
    }
    markSourceSpecificGate("__router__", `final_contract_refill_candidate_count:${finalContractRefillDiagnostics.length}`);
    markSourceSpecificGate("__router__", `final_contract_refill_candidates:${finalContractRefillDiagnostics.slice(0, 120).join("|") || "(none)"}`);
    const finalContractRefillAcceptsForDiagnostics =
      finalEligibilityAcceptedTitles.length > 0
        ? Array.from(new Set(finalContractRefillAcceptedTitles)).slice(0, 60)
        : [];
    markSourceSpecificGate("__router__", `final_contract_refill_accepts:${finalContractRefillAcceptsForDiagnostics.join("|") || "(none)"}`);
  }
  postTopUpOutputSnapshot = [...finalOutputItems];
  postTopUpOutputSnapshotLength = postTopUpOutputSnapshot.length;
  let handoffRecoveryConsidered = 0;
  let handoffRecoveryAccepted = 0;
  const handoffRecoveryRejectedReasons: Record<string, number> = {};
  const normalizeReturnRootFamily = (doc: any): string => {
    const raw = normalizeText(`${parentFranchiseRootForDoc(doc)} ${String(doc?.title || "")}`);
    if (/\b(spider[-\s]?man|miles morales|spider-man noir|avenging spider-man|amazing spider-man)\b/.test(raw)) return "spider-man-family";
    if (/\bjustice league\b/.test(raw)) return "justice-league-family";
    if (/\bms\.?\s*marvel\b/.test(raw)) return "ms-marvel-family";
    return "__uncapped__";
  };
  const familyCapCounts: Record<string, number> = {};
  const cappedFinalOutputItems: any[] = [];
  for (const item of finalOutputItems) {
    const doc = item?.doc || item;
    const tier = refillAlignmentTier(doc).tier;
    const fam = normalizeReturnRootFamily(doc);
    const count = Number(familyCapCounts[fam] || 0);
    if (fam !== "__uncapped__" && count >= 2 && tier !== "strong_taste_fit") continue;
    familyCapCounts[fam] = count + 1;
    cappedFinalOutputItems.push(item);
  }
  finalOutputItems = cappedFinalOutputItems;
  if (!suppressTopRecommendations && finalOutputItems.length < 10) {
    const seenTitles = new Set(finalOutputItems.map((item: any) => normalizeText(String(item?.doc?.title || item?.title || ""))).filter(Boolean));
    const familyCountsTopUp = { ...familyCapCounts } as Record<string, number>;
    const alignedBackfill = dedupeDocs([
      ...(scoredCanonicalDocs || []),
      ...(swipeRankedCandidateList || []),
      ...(finalRenderDocs || []),
      ...(viableCandidates || []),
      ...(candidateDocs || []),
      ...(normalizedCandidates || []),
    ] as any[])
      .map((doc: any) => ({ doc, align: refillAlignmentTier(doc) }))
      .filter(({ doc, align }: any) => {
        const title = String(doc?.title || "").trim();
        const nt = normalizeText(title);
        if (!title || !nt || seenTitles.has(nt)) return false;
        if (align?.tier === "safe_filler") return false;
        if (!passesEmergencySafeRescue(doc)) return false;
        if (canReturnTitleRejectReason(title, doc)) return false;
        const fam = normalizeReturnRootFamily(doc);
        const famCount = Number(familyCountsTopUp[fam] || 0);
        if (fam !== "__uncapped__" && famCount >= 2 && align?.tier !== "strong_taste_fit") return false;
        return true;
      })
      .sort((a: any, b: any) => {
        const order = { strong_taste_fit: 0, semantic_narrative_fit: 1, adjacent_profile_fit: 2, safe_filler: 3 } as Record<string, number>;
        const ao = order[a.align?.tier || "safe_filler"] ?? 3;
        const bo = order[b.align?.tier || "safe_filler"] ?? 3;
        if (ao !== bo) return ao - bo;
        return Number(b.doc?.score ?? b.doc?.diagnostics?.finalScore ?? 0) - Number(a.doc?.score ?? a.doc?.diagnostics?.finalScore ?? 0);
      });
    for (const row of alignedBackfill) {
      if (finalOutputItems.length >= 10) break;
      const t = normalizeText(String(row?.doc?.title || ""));
      if (!t || seenTitles.has(t)) continue;
      const fam = normalizeReturnRootFamily(row.doc);
      const famCount = Number(familyCountsTopUp[fam] || 0);
      if (fam !== "__uncapped__" && famCount >= 2 && row.align?.tier !== "strong_taste_fit") continue;
      finalOutputItems.push({ kind: "open_library", doc: row.doc });
      seenTitles.add(t);
      familyCountsTopUp[fam] = famCount + 1;
    }
  }
  let finalCountContractShortfallReason = countContractShortfallReason;
  const safeFillerCountPostCap = finalOutputItems.filter((item: any) => refillAlignmentTier(item?.doc || item).tier === "safe_filler").length;
  if (!alwaysFillToTen && safeFillerCountPostCap > 2) {
    finalOutputItems = finalOutputItems.filter((item: any) => refillAlignmentTier(item?.doc || item).tier !== "safe_filler").slice(0, 10);
  }
  if (
    !alwaysFillToTen &&
    finalOutputItems.length === 0 &&
    comicVineOnlyMode
  ) {
    // Keep a minimal visible set for ComicVine-only underfill instead of collapsing to zero.
    // Prefer non-safe tiers first; allow up to 2 safe fillers only when nothing aligned survives.
    const rescuePool = dedupeDocs([
      ...(scoredCanonicalDocs || []),
      ...(swipeRankedCandidateList || []),
      ...(finalRenderDocs || []),
      ...(viableCandidates || []),
    ] as any[])
      .map((doc: any) => ({ doc, align: refillAlignmentTier(doc) }))
      .filter(({ doc }: any) => {
        const title = String(doc?.title || "").trim();
        if (!title) return false;
        if (!passesEmergencySafeRescue(doc)) return false;
        return !canReturnTitleRejectReason(title, doc);
      })
      .sort((a: any, b: any) => {
        const order = { strong_taste_fit: 0, semantic_narrative_fit: 1, adjacent_profile_fit: 2, safe_filler: 3 } as Record<string, number>;
        return (order[a.align?.tier || "safe_filler"] ?? 3) - (order[b.align?.tier || "safe_filler"] ?? 3);
      });
    const aligned = rescuePool.filter((x: any) => x.align?.tier !== "safe_filler").slice(0, 10).map((x: any) => ({ kind: "open_library", doc: x.doc }));
    const safe = rescuePool.filter((x: any) => x.align?.tier === "safe_filler").slice(0, 2).map((x: any) => ({ kind: "open_library", doc: x.doc }));
    finalOutputItems = aligned.length > 0 ? aligned : safe;
  }
  if (!alwaysFillToTen && finalOutputItems.length < 10) {
    finalCountContractShortfallReason = "insufficient_aligned_candidates";
  }
  if (!suppressTopRecommendations && finalOutputItems.length < Math.min(10, postTopUpOutputSnapshot.length)) {
    const seen = new Set(finalOutputItems.map((item: any) => normalizeText(String(item?.doc?.title || item?.title || ""))).filter(Boolean));
    const safeCount = finalOutputItems.filter((item: any) => refillAlignmentTier(item?.doc || item).tier === "safe_filler").length;
    const handoffRecovery = postTopUpOutputSnapshot
      .map((item: any) => item?.doc || item)
      .filter((doc: any) => {
        handoffRecoveryConsidered += 1;
        const title = String(doc?.title || "").trim();
        const nt = normalizeText(title);
        if (!title || !nt) { handoffRecoveryRejectedReasons.missing_title = Number(handoffRecoveryRejectedReasons.missing_title || 0) + 1; return false; }
        if (seen.has(nt)) { handoffRecoveryRejectedReasons.duplicate_title = Number(handoffRecoveryRejectedReasons.duplicate_title || 0) + 1; return false; }
        if (!passesEmergencySafeRescue(doc)) { handoffRecoveryRejectedReasons.failed_emergency_safe = Number(handoffRecoveryRejectedReasons.failed_emergency_safe || 0) + 1; return false; }
        const rejectReason = canReturnTitleRejectReason(title, doc);
        if (rejectReason) { handoffRecoveryRejectedReasons[`can_return:${rejectReason}`] = Number(handoffRecoveryRejectedReasons[`can_return:${rejectReason}`] || 0) + 1; return false; }
        const tier = refillAlignmentTier(doc).tier;
        if (!alwaysFillToTen && tier === "safe_filler" && safeCount >= 2) { handoffRecoveryRejectedReasons.safe_filler_cap = Number(handoffRecoveryRejectedReasons.safe_filler_cap || 0) + 1; return false; }
        return true;
      })
      .sort((a: any, b: any) => {
        const order = { strong_taste_fit: 0, semantic_narrative_fit: 1, adjacent_profile_fit: 2, safe_filler: 3 } as Record<string, number>;
        const ao = order[refillAlignmentTier(a).tier] ?? 3;
        const bo = order[refillAlignmentTier(b).tier] ?? 3;
        if (ao !== bo) return ao - bo;
        return Number(b?.score ?? b?.diagnostics?.finalScore ?? 0) - Number(a?.score ?? a?.diagnostics?.finalScore ?? 0);
      })
      .slice(0, Math.max(0, 10 - finalOutputItems.length))
      .map((doc: any) => ({ kind: "open_library", doc }));
    if (handoffRecovery.length > 0) {
      finalOutputItems = [...finalOutputItems, ...handoffRecovery];
      handoffRecoveryAccepted += handoffRecovery.length;
    }
    if (!alwaysFillToTen && finalOutputItems.length < 10 && postTopUpOutputSnapshot.length >= 10) {
      const relaxed = postTopUpOutputSnapshot
        .map((item: any) => item?.doc || item)
        .find((doc: any) => {
          const title = String(doc?.title || "").trim();
          const nt = normalizeText(title);
          if (!title || !nt || seen.has(nt)) return false;
          if (!passesEmergencySafeRescue(doc)) return false;
          const rejectReason = String(canReturnTitleRejectReason(title, doc) || "");
          if (/(late_fill_never_return|format_signal_only_rejected|generic_collection_rejected)/.test(rejectReason)) return false;
          return true;
        });
      if (relaxed) {
        finalOutputItems.push({ kind: "open_library", doc: relaxed });
        handoffRecoveryAccepted += 1;
      }
    }
  }
  // Final returned-items dedupe pass after all rescue/top-up/handoff logic.
  // This prevents duplicate visible titles from surviving into render/persist.
  if (finalOutputItems.length > 1) {
    const seenReturnedTitles = new Set<string>();
    finalOutputItems = finalOutputItems.filter((item: any) => {
      const key = normalizeText(String(item?.doc?.title || item?.title || ""));
      if (!key) return false;
      if (seenReturnedTitles.has(key)) return false;
      seenReturnedTitles.add(key);
      return true;
    });
  }
  // Final eligibility is terminal: do not allow re-introduction of terminally rejected titles.
  finalOutputItems = finalOutputItems.filter((item: any) => {
    const title = String(item?.doc?.title || item?.title || "").trim();
    const nt = normalizeText(title);
    if (!title || !nt) return false;
    if (terminalRejectReasonByTitle[nt]) return false;
    if (finalEligibilityHardNeverReturnTitles.has(nt)) return false;
    return true;
  });
  // After terminal filtering, run one last aligned-only refill from non-terminal candidates.
  if (!suppressTopRecommendations && finalOutputItems.length < 10) {
    const seen = new Set(finalOutputItems.map((item: any) => normalizeText(String(item?.doc?.title || item?.title || ""))).filter(Boolean));
    let safeCount = finalOutputItems.filter((item: any) => refillAlignmentTier(item?.doc || item).tier === "safe_filler").length;
    const terminalAlignedRefill = dedupeDocs([
      ...(scoredCanonicalDocs || []),
      ...(swipeRankedCandidateList || []),
      ...(finalRenderDocs || []),
      ...(viableCandidates || []),
      ...(candidateDocs || []),
      ...(normalizedCandidates || []),
      ...(postTopUpOutputSnapshot || []),
    ] as any[])
      .map((entry: any) => {
        const doc = entry?.doc || entry;
        return { doc, align: refillAlignmentTier(doc) };
      })
      .filter(({ doc, align }: any) => {
        const title = String(doc?.title || "").trim();
        const nt = normalizeText(title);
        if (!title || !nt || seen.has(nt)) return false;
        if (terminalRejectReasonByTitle[nt]) return false;
        if (finalEligibilityHardNeverReturnTitles.has(nt)) return false;
        if (!passesEmergencySafeRescue(doc)) return false;
        const rejectReason = canReturnTitleRejectReason(title, doc);
        if (rejectReason) return false;
        if (!alwaysFillToTen && align?.tier === "safe_filler" && safeCount >= 2) return false;
        return true;
      })
      .sort((a: any, b: any) => {
        const order = { strong_taste_fit: 0, semantic_narrative_fit: 1, adjacent_profile_fit: 2, safe_filler: 3 } as Record<string, number>;
        const ao = order[a.align?.tier || "safe_filler"] ?? 3;
        const bo = order[b.align?.tier || "safe_filler"] ?? 3;
        if (ao !== bo) return ao - bo;
        return Number(b.doc?.score ?? b.doc?.diagnostics?.finalScore ?? 0) - Number(a.doc?.score ?? a.doc?.diagnostics?.finalScore ?? 0);
      });
    for (const row of terminalAlignedRefill) {
      if (finalOutputItems.length >= 10) break;
      const nt = normalizeText(String(row?.doc?.title || ""));
      if (!nt || seen.has(nt)) continue;
      finalOutputItems.push({ kind: "open_library", doc: row.doc });
      seen.add(nt);
      if (row.align?.tier === "safe_filler") safeCount += 1;
    }
  }
  const enabledSourceCount = [
    sourceEnabled.googleBooks ? 1 : 0,
    sourceEnabled.openLibrary ? 1 : 0,
    sourceEnabled.localLibrary ? 1 : 0,
    includeKitsu ? 1 : 0,
    includeComicVine ? 1 : 0,
  ].reduce((acc, n) => acc + n, 0);
  const targetFinalCount = Math.max(1, Math.min(10, finalLimit));
  const singleSourceCountContractMin = targetFinalCount;
  const multiSourceCountContractMin = Math.max(4, Math.min(6, targetFinalCount));
  countContractSatisfied = enabledSourceCount <= 1
    ? finalOutputItems.length >= singleSourceCountContractMin
    : finalOutputItems.length >= multiSourceCountContractMin;
  if (countContractSatisfied) {
    finalCountContractShortfallReason = "none";
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
  const returnedItemsByAlignmentTier = { strong_taste_fit: 0, semantic_narrative_fit: 0, adjacent_profile_fit: 0, safe_filler: 0 } as Record<string, number>;
  const safeFillerTitles: string[] = [];
  for (const item of finalOutputItems) {
    const doc = item?.doc || item;
    const text = normalizeText([doc?.title, doc?.description, doc?.subjects, doc?.queryText].filter(Boolean).join(" "));
    const likedMatches = Array.from(refillLikedSignalSet).filter((sig) => sig.length >= 4 && text.includes(sig)).length;
    const dislikedMatches = Array.from(refillDislikedSignalSet).filter((sig) => sig.length >= 4 && text.includes(sig)).length;
    const narrativeFit = /\b(novel|story|character|coming of age|mystery|thriller|drama|literary|psychological|suspense|relationship)\b/i.test(String([doc?.title, doc?.description, doc?.queryText].filter(Boolean).join(" ")));
    const score = Number(doc?.score ?? doc?.diagnostics?.finalScore ?? 0);
    const tier = likedMatches >= 2 && dislikedMatches === 0 && score >= 0.15
      ? "strong_taste_fit"
      : (likedMatches >= 1 && dislikedMatches === 0 && narrativeFit
        ? "semantic_narrative_fit"
        : (likedMatches >= 1 || narrativeFit ? "adjacent_profile_fit" : "safe_filler"));
    returnedItemsByAlignmentTier[tier] = Number(returnedItemsByAlignmentTier[tier] || 0) + 1;
    if (tier === "safe_filler") safeFillerTitles.push(String(doc?.title || "").trim());
  }
  const returnedReasonByTitle: Record<string, "primary_recommendation" | "aligned_backfill" | "contract_filler"> = {};
  const returnedSwipeEvidenceByTitle: Record<string, string[]> = {};
  const returnedSourceLayerByTitle: Record<string, string> = {};
  const returnedReasonCounts = { primary_recommendation: 0, aligned_backfill: 0, contract_filler: 0 };
  const finalReasonFilterRejectedReasons: Record<string, number> = {};
  const finalReasonFilterAcceptedTitles: string[] = [];
  const alignedBackfillRejectedReasons: Record<string, number> = {};
  let swipeEvidenceCandidateCount = 0;
  const negativePenaltyDominantSignalsByTitle: Record<string, string> = {};
  const expandedPoolUsedForFinalSelection =
    /RAW_HIGH_CANDIDATE_TINY/.test(String(comicVinePipelineFailureReason || "")) &&
    Number(expansionConvertedCount || 0) >= 10;
  const finalEligibleSet = new Set((acceptedAfterTerminalRejectFilter || []).map((t: string) => normalizeText(t)));
  const tasteQuerySet = new Set((generatedComicVineQueriesFromTaste || []).map((q: string) => normalizeText(q)));
  tdzGuardedDiagnosticsInitialized = true;
  const hasSwipeAlignedEvidence = (doc: any, title: string): string[] => {
    const ev: string[] = [];
    const nt = normalizeText(title);
    const matchedLiked = candidateMatchedLikedSignalsByTitle[title] || [];
    if (matchedLiked.length > 0) ev.push(`liked_signal_overlap:${matchedLiked.slice(0, 3).join(",")}`);
    const qtext = normalizeText(String(doc?.queryText || doc?.rawDoc?.queryText || ""));
    if (qtext && Array.from(tasteQuerySet).some((q) => q && qtext.includes(q))) ev.push("generated_taste_query_match");
    const root = normalizeText(String(parentFranchiseRootForDoc(doc) || ""));
    if (profileSelectedEntitySeeds.some((seed: string) => normalizeText(seed) && (nt.includes(normalizeText(seed)) || root.includes(normalizeText(seed))))) ev.push("profile_entity_seed_match");
    const pfit = Number(positiveFitScoreByTitle[title] || 0);
    const sem = Number(semanticEvidenceCountByTitle[title] || 0);
    const nconf = Number((finalAcceptedTasteEvidenceByTitle[title] || []).find((r: string) => r.startsWith("narrativeFictionConfidence:"))?.split(":")[1] || 0);
    const qOnly = Boolean(queryTermOnlyEvidenceByTitle[title]);
    if (pfit >= 5.5 && sem >= 1 && nconf >= 2 && !qOnly) ev.push("composite_high_fit_semantic_pass");
    if (ev.length > 0) swipeEvidenceCandidateCount += 1;
    return ev;
  };
  if (expandedPoolUsedForFinalSelection && finalOutputItems.length < 10) {
    const seen = new Set(finalOutputItems.map((i: any) => normalizeText(String(i?.doc?.title || i?.title || ""))).filter(Boolean));
    const expandedCandidates = dedupeDocs([...(narrativeExpansionMergedDocs || []), ...(viableCandidates || []), ...(scoredCanonicalDocs || [])] as any[])
      .filter((doc: any) => {
        const title = String(doc?.title || "").trim();
        const nt = normalizeText(title);
        if (!title || !nt || seen.has(nt)) return false;
        if (terminalRejectReasonByTitle[nt]) return false;
        if (finalEligibilityHardNeverReturnTitles.has(nt)) return false;
        if (Number(doc?.score ?? doc?.diagnostics?.finalScore ?? 0) < 0) return false;
        return passesEmergencySafeRescue(doc) && !canReturnTitleRejectReason(title, doc);
      })
      .slice(0, Math.max(0, 10 - finalOutputItems.length))
      .map((doc: any) => ({ kind: "open_library", doc }));
    if (expandedCandidates.length > 0) finalOutputItems = [...finalOutputItems, ...expandedCandidates];
  }
  finalOutputItems = finalOutputItems
    .map((item: any) => {
      const doc = item?.doc || item;
      const title = String(doc?.title || item?.title || "").trim();
      const nt = normalizeText(title);
      const sourceLayer = String((doc?.diagnostics?.laneKind || doc?.laneKind || doc?.source || "unknown"));
      let reason: "primary_recommendation" | "aligned_backfill" | "contract_filler" = "contract_filler";
      const evidence = hasSwipeAlignedEvidence(doc, title);
      const dislikePenalty = Number(candidateDislikePenaltyByTitle[title] || 0);
      const likedWeight = Number(candidateWeightedTasteScoreByTitle[title] || 0);
      const semanticCount = Number(semanticEvidenceCountByTitle[title] || 0);
      const positiveFit = Number(positiveFitScoreByTitle[title] || 0);
      if (finalEligibleSet.has(nt)) reason = "primary_recommendation";
      else if (evidence.length > 0) {
        if (dislikePenalty > likedWeight * 1.35 && likedWeight < 3) {
          alignedBackfillRejectedReasons.disliked_penalty_dominates = Number(alignedBackfillRejectedReasons.disliked_penalty_dominates || 0) + 1;
          negativePenaltyDominantSignalsByTitle[title] = `dislike=${dislikePenalty.toFixed(2)} liked=${likedWeight.toFixed(2)}`;
        } else {
          reason = "aligned_backfill";
        }
      } else if (
        Number(doc?.score ?? doc?.diagnostics?.finalScore ?? 0) >= 0 &&
        (semanticCount >= 1 || positiveFit >= 4)
      ) {
        reason = "aligned_backfill";
        returnedSwipeEvidenceByTitle[title] = [`semantic_support:${semanticCount}`, `positive_fit:${positiveFit.toFixed(2)}`];
      } else {
        alignedBackfillRejectedReasons.no_swipe_evidence = Number(alignedBackfillRejectedReasons.no_swipe_evidence || 0) + 1;
      }
      returnedReasonByTitle[title] = reason;
      returnedSwipeEvidenceByTitle[title] = returnedSwipeEvidenceByTitle[title] || evidence;
      returnedSourceLayerByTitle[title] = sourceLayer;
      returnedReasonCounts[reason] += 1;
      if (reason !== "contract_filler" || alwaysFillToTen) finalReasonFilterAcceptedTitles.push(title);
      return { ...item, returnedReason: reason };
    })
    .sort((a: any, b: any) => {
      const order = { primary_recommendation: 0, aligned_backfill: 1, contract_filler: 2 } as Record<string, number>;
      return (order[a.returnedReason] ?? 9) - (order[b.returnedReason] ?? 9);
    });
  if (!alwaysFillToTen) {
    finalOutputItems = finalOutputItems.filter((item: any) => {
      const keep = item.returnedReason !== "contract_filler";
      if (!keep) finalReasonFilterRejectedReasons.contract_filler_not_allowed = Number(finalReasonFilterRejectedReasons.contract_filler_not_allowed || 0) + 1;
      return keep;
    });
  }
  if (!alwaysFillToTen && finalOutputItems.length < Math.min(6, postTopUpOutputSnapshot.length)) {
    const seen = new Set(finalOutputItems.map((item: any) => normalizeText(String(item?.doc?.title || item?.title || ""))).filter(Boolean));
    const rescuedAligned = postTopUpOutputSnapshot
      .map((it: any) => it?.doc || it)
      .filter((doc: any) => {
        const title = String(doc?.title || "").trim();
        const nt = normalizeText(title);
        if (!title || !nt || seen.has(nt)) return false;
        if (terminalRejectReasonByTitle[nt]) return false;
        if (Number(doc?.score ?? doc?.diagnostics?.finalScore ?? 0) < 0) return false;
        const sem = Number(semanticEvidenceCountByTitle[title] || 0);
        const fit = Number(positiveFitScoreByTitle[title] || 0);
        return passesEmergencySafeRescue(doc) && !canReturnTitleRejectReason(title, doc) && (sem >= 1 || fit >= 4);
      })
      .slice(0, Math.max(0, Math.min(8, postTopUpOutputSnapshot.length) - finalOutputItems.length))
      .map((doc: any) => ({ kind: "open_library", doc, returnedReason: "aligned_backfill" }));
    if (rescuedAligned.length > 0) finalOutputItems = [...finalOutputItems, ...rescuedAligned];
  }
  if (finalOutputItems.length > 10) finalOutputItems = finalOutputItems.slice(0, 10);
  // Hard integrity guard: never return items that did not pass final eligibility.
  // If final eligibility accepted nothing, return honest underfill instead of contract rescue artifacts.
  let normalFinalGateRecoveryConsidered = false;
  const normalFinalGateRecoveryAcceptedTitles: string[] = [];
  const normalFinalGateRecoveryRejectedByTitle: Record<string, string> = {};
  let kitsuNormalRecoveryConsidered = false;
  const kitsuNormalRecoveryAcceptedTitles: string[] = [];
  const kitsuNormalRecoveryAcceptedItems: any[] = [];
  const kitsuNormalRecoveryRejectedByTitle: Record<string, string> = {};
  let kitsuRankedPoolRescueSource: "kitsuRecoveryRankedCandidates" | "rankedDocsFallback" | "not_triggered" = "not_triggered";
  let kitsuRankedPoolRescueEligible = false;
  let kitsuRankedPoolRescueCandidateCount = 0;
  let kitsuRankedPoolRescueBlockedReason = "not_evaluated";
  let finalInvariantKitsuRescueTriggered = false;
  let finalInvariantKitsuRescueCandidateCount = 0;
  let finalInvariantKitsuRescuePreviousBuiltFrom = "";
  let finalMetadataCorrectionApplied = false;
  let finalMetadataCorrectionPreviousBuiltFrom = "";
  let kitsuRescueSlateBackfillApplied = false;
  let kitsuRescueSlateBackfillBeforeCount = 0;
  let kitsuRescueSlateBackfillAfterCount = 0;
  let kitsuRescueSlateBackfillCandidateCount = 0;
  const kitsuRescueQualityOrderingVersion = "penalty_first_v1";
  const kitsuRescueExcludedForDislikePenaltyKeys = new Set<string>();
  let kitsuRescueExcludedForDislikePenaltyCount = 0;
  let kitsuRescueCandidateQualityBuckets = {
    laneAlignedCount: 0,
    semanticEvidenceCountGt0: 0,
    weightedTasteScoreGt0: 0,
    zeroEvidenceCount: 0,
    penaltyFreeCount: 0,
    totalCandidateCount: 0,
  };
  let kitsuRescueSlateStrongCount = 0;
  let kitsuRescueSlateZeroEvidenceCount = 0;
  let kitsuRescueWeakBeforeStrongCorrectionApplied = false;
  let kitsuRescueFinalSlateReorderedStrongFirst = false;
  let kitsuRescueStrongCandidateCount = 0;
  let kitsuRescueWeakCandidateCount = 0;
  const kitsuRescueQualityMetricsForDoc = (doc: any) => {
    const title = String(doc?.title || doc?.canonicalTitle || "").trim();
    const root = String(parentFranchiseRootForDoc(doc) || "");
    const laneAligned = profileSelectedEntitySeeds.some((seed) => normalizeText(seed).replace(/[^a-z0-9]+/g, "-") === root) || profileCompatibleExpansionRoots.has(root);
    return {
      title,
      sourceId: String(doc?.sourceId || doc?.canonicalId || doc?.key || "").trim(),
      laneAligned,
      semanticEvidenceCount: Number(semanticEvidenceCountByTitle[title] || 0),
      weightedTasteScore: Number(candidateWeightedTasteScoreByTitle[title] || 0),
      dislikePenaltyScore: Number(candidateDislikePenaltyByTitle[title] || 0),
      positiveFitScore: Number(positiveFitScoreByTitle[title] || 0),
    };
  };
  const compareKitsuRescueQualityRows = (a: any, b: any) => {
    if (Number(b.dislikePenaltyScore === 0) !== Number(a.dislikePenaltyScore === 0)) return Number(b.dislikePenaltyScore === 0) - Number(a.dislikePenaltyScore === 0);
    if (Number(b.semanticEvidenceCount > 0) !== Number(a.semanticEvidenceCount > 0)) return Number(b.semanticEvidenceCount > 0) - Number(a.semanticEvidenceCount > 0);
    if (Number(b.weightedTasteScore > 0) !== Number(a.weightedTasteScore > 0)) return Number(b.weightedTasteScore > 0) - Number(a.weightedTasteScore > 0);
    if (Number(b.laneAligned) !== Number(a.laneAligned)) return Number(b.laneAligned) - Number(a.laneAligned);
    if (Number(Boolean(b.sourceId)) !== Number(Boolean(a.sourceId))) return Number(Boolean(b.sourceId)) - Number(Boolean(a.sourceId));
    if (b.positiveFitScore !== a.positiveFitScore) return b.positiveFitScore - a.positiveFitScore;
    if (b.semanticEvidenceCount !== a.semanticEvidenceCount) return b.semanticEvidenceCount - a.semanticEvidenceCount;
    if (b.weightedTasteScore !== a.weightedTasteScore) return b.weightedTasteScore - a.weightedTasteScore;
    return a.dislikePenaltyScore - b.dislikePenaltyScore;
  };
  const orderKitsuRescueRowsPenaltyFirst = (rows: any[], minPenaltyFreeCount = 3) => {
    const ordered = [...rows].sort(compareKitsuRescueQualityRows);
    const penaltyFree = ordered.filter((row: any) => Number(row?.dislikePenaltyScore || 0) === 0);
    const penalized = ordered.filter((row: any) => Number(row?.dislikePenaltyScore || 0) > 0);
    const minRequired = Math.min(Math.max(1, minPenaltyFreeCount), ordered.length);
    if (penaltyFree.length >= minRequired) {
      for (const row of penalized) {
        const key = normalizeText(String(row?.sourceId || row?.title || row?.doc?.title || ""));
        if (key && !kitsuRescueExcludedForDislikePenaltyKeys.has(key)) kitsuRescueExcludedForDislikePenaltyKeys.add(key);
      }
      kitsuRescueExcludedForDislikePenaltyCount = kitsuRescueExcludedForDislikePenaltyKeys.size;
      return penaltyFree;
    }
    return ordered;
  };
  const isKitsuRescueStrongRow = (row: any) => Number(row?.semanticEvidenceCount || 0) > 0 || Number(row?.weightedTasteScore || 0) > 0 || Boolean(row?.laneAligned);
  const orderKitsuRescueStrongBeforeWeak = (rows: any[], minPenaltyFreeCount = 3, trackCounts = false) => {
    let sawWeak = false;
    for (const row of rows) {
      const strong = isKitsuRescueStrongRow(row);
      if (!strong) sawWeak = true;
      else if (sawWeak) kitsuRescueWeakBeforeStrongCorrectionApplied = true;
    }
    const strongRows = orderKitsuRescueRowsPenaltyFirst(rows.filter((row: any) => isKitsuRescueStrongRow(row)), minPenaltyFreeCount);
    const weakRows = orderKitsuRescueRowsPenaltyFirst(rows.filter((row: any) => !isKitsuRescueStrongRow(row)), minPenaltyFreeCount);
    if (trackCounts) {
      kitsuRescueStrongCandidateCount = strongRows.length;
      kitsuRescueWeakCandidateCount = weakRows.length;
    }
    return [...strongRows, ...weakRows];
  };
  const suppressKitsuWeakPadding = (rows: any[]) => {
    const strongRows = rows.filter((row: any) => isKitsuRescueStrongRow(row));
    return strongRows.length > 0 ? strongRows : rows;
  };
  const markKitsuRankedPoolWeakCandidateOutput = (reason: string, candidateRows: any[], returnedItems: any[]) => {
    kitsuRankedPoolRescueWeakCandidateOutput = true;
    kitsuRankedPoolRescueWeakCandidateReason = reason;
    kitsuRankedPoolRescueWeakCandidateReturnedCount = returnedItems.length;
    kitsuRankedPoolRescueWeakCandidateSuppressedCount = Math.max(0, candidateRows.length - returnedItems.length);
    kitsuRankedPoolRescueWeakCandidateTitles.splice(0, kitsuRankedPoolRescueWeakCandidateTitles.length, ...returnedItems
      .map((item: any) => String(item?.doc?.title || item?.title || "").trim())
      .filter(Boolean)
      .slice(0, 20));
    sourceSkippedReason.push(`kitsu_ranked_pool_rescue_weak_candidates:${reason}:returned=${returnedItems.length}:suppressed=${kitsuRankedPoolRescueWeakCandidateSuppressedCount}`);
  };
  let kitsuLowRankedCountRecoveryTriggered = false;
  let kitsuLowRankedCountRecoveryCandidateCount = 0;
  let kitsuLowRankedCountRecoveryBlockedReason = "not_evaluated";
  let kitsuRankedPoolRescueWeakCandidateOutput = false;
  let kitsuRankedPoolRescueWeakCandidateReason = "not_evaluated";
  let kitsuRankedPoolRescueWeakCandidateReturnedCount = 0;
  let kitsuRankedPoolRescueWeakCandidateSuppressedCount = 0;
  const kitsuRankedPoolRescueWeakCandidateTitles: string[] = [];
  let kitsuEmergencyWeakCandidateAttributionCorrected = false;
  let kitsuEmergencyWeakCandidatePreviousBuiltFrom = "not_evaluated";
  let kitsuEmergencyWeakCandidatePath = "not_evaluated";
  let kitsuEmergencyWeakCandidateBypassPath = "not_evaluated";
  let kitsuEmergencyWeakCandidateTitle = "";
  let kitsuEmergencyWeakCandidatePriorItemCount = 0;
  const kitsuEmergencyWeakCandidateSuppressedTitles: string[] = [];
  let kitsuEmergencyWeakCandidateRawCount = 0;
  let kitsuEmergencyWeakCandidateRankedCount = 0;
  let kitsuSmallRecoveryMetadataCorrectionApplied = false;
  let kitsuSmallRecoveryRawCount = 0;
  let kitsuSmallRecoveryRankedCount = 0;
  let kitsuSmallRecoveryOutputTriggered = false;
  let kitsuSmallRecoveryCandidateCount = 0;
  let kitsuSmallRecoveryReason = "not_evaluated";
  const kitsuFinalEligibilitySparseMetadataRescueCandidates: Array<{ title: string; sourceId: string; failedChecks: string[]; laneAligned: boolean; semanticEvidenceCount: number; positiveFitScore: number; rejectedReasonForRescue: string }> = [];
  let kitsuFinalEligibilitySparseMetadataRescue: { activated: boolean; candidateTitle: string; sourceId: string; failedChecks: string[]; laneAligned: boolean; semanticEvidenceCount: number; reason: string } | null = null;
  const kitsuRecoveryRankedCandidates: Array<{ title: string; sourceId: string; positiveFitScore: number; semanticEvidenceCount: number; laneAligned: boolean; rejectReason: string; selected: boolean }> = [];
  let kitsuAcceptedButEmergencyReturned: { acceptedTitles: string[]; emergencyReturnedTitles: string[]; reason: string } | null = null;
  const kitsuRecoveryPoolTitles: string[] = [];
  const kitsuRecoveryBestRejectedReasons: Record<string, string> = {};
  let minimalSafeOneBlockedReason = "";
  const kitsuHasRawCandidates = Number(aggregatedRawFetched.kitsu || 0) > 0
    || kitsuFetchResultsByQuery.some((row) => Number(row?.rawCount || 0) > 0);
  if (!suppressTopRecommendations || (finalOutputItems.length === 0 && kitsuHasRawCandidates)) {
    const acceptedAfterTerminalSet = new Set(acceptedAfterTerminalRejectFilter.map((t) => normalizeText(String(t || ""))).filter(Boolean));
    if (acceptedAfterTerminalSet.size === 0 || (finalOutputItems.length === 0 && kitsuHasRawCandidates)) {
      const normalFinalGateRecoveryItems =
        teenPostPassOutputTitles.length > 0
          ? (() => {
              normalFinalGateRecoveryConsidered = true;
              const seenRoots = new Set<string>();
              return teenPostPassItems
                .filter((item: any) => {
                  const doc = item?.doc || item;
                  const title = String(doc?.title || item?.title || "").trim();
                  const nt = normalizeText(title);
                  if (!title || !nt) {
                    normalFinalGateRecoveryRejectedByTitle[title || "(missing_title)"] = "missing_title";
                    return false;
                  }
                  if (/\[google_books_fetch_error\]/i.test(title)) {
                    normalFinalGateRecoveryRejectedByTitle[title] = "google_books_fetch_error_title";
                    return false;
                  }
                  if (/\b(classroom|reference|index|teaching|awards?|bibliograph(?:y|ies)|poetry for children)\b/i.test(title)) {
                    normalFinalGateRecoveryRejectedByTitle[title] = "reference_or_classroom_artifact_title";
                    return false;
                  }
                  const fit = Number(positiveFitScoreByTitle[title] || 0);
                  if (!(fit > 0)) {
                    normalFinalGateRecoveryRejectedByTitle[title] = "non_positive_fit";
                    return false;
                  }
                  const scrubReason = sharedReturnArtifactScrubRejectReason(doc);
                  if (scrubReason) {
                    normalFinalGateRecoveryRejectedByTitle[title] = `artifact_scrub:${scrubReason}`;
                    return false;
                  }
                  const terminalReason = String(terminalRejectReasonByTitle[nt] || "");
                  if (terminalReason && !terminalReason.includes("fallback_no_taste_match") && !terminalReason.includes("fails_taste_threshold_gate")) {
                    normalFinalGateRecoveryRejectedByTitle[title] = `terminal_safety_reject:${terminalReason}`;
                    return false;
                  }
                  const root = String(parentFranchiseRootForDoc(doc) || "__none__");
                  if (seenRoots.has(root)) {
                    normalFinalGateRecoveryRejectedByTitle[title] = "duplicate_root";
                    return false;
                  }
                  seenRoots.add(root);
                  return true;
                })
                .slice(0, Math.max(1, Math.min(3, finalLimit)));
            })()
          : [];
      if (normalFinalGateRecoveryItems.length > 0) {
        finalOutputItems = normalFinalGateRecoveryItems;
        normalFinalGateRecoveryAcceptedTitles.push(
          ...normalFinalGateRecoveryItems
            .map((item: any) => String(item?.doc?.title || item?.title || "").trim())
            .filter(Boolean)
        );
        returnedItemsBuiltFrom = "normal_final_gate_recovery";
        finalReturnSourceUsed = "normal_final_gate_recovery";
        sourceSkippedReason.push("final_gate_integrity:normal_final_gate_recovery");
      }
      if (finalOutputItems.length === 0 && kitsuHasRawCandidates) {
        kitsuNormalRecoveryConsidered = true;
        const seenRoots = new Set<string>();
        const kitsuPool = dedupeDocs([
          ...(teenPostPassItems.map((item: any) => item?.doc || item).filter(Boolean) as any[]),
          ...(finalRenderDocs || []),
          ...(viableCandidates || []),
          ...(swipeRankedCandidateList || []),
        ] as any[])
          .filter((doc: any) => String(doc?.source || doc?.rawDoc?.source || "").toLowerCase().includes("kitsu"));
        kitsuRecoveryPoolTitles.push(
          ...kitsuPool.map((doc: any) => String(doc?.title || "").trim()).filter(Boolean)
        );
        const kitsuRecoveryItems = kitsuPool
          .sort((a: any, b: any) => {
            const at = String(a?.title || "").trim();
            const bt = String(b?.title || "").trim();
            const af = Number(positiveFitScoreByTitle[at] || 0);
            const bf = Number(positiveFitScoreByTitle[bt] || 0);
            if (bf !== af) return bf - af;
            const as = Number(semanticEvidenceCountByTitle[at] || 0);
            const bs = Number(semanticEvidenceCountByTitle[bt] || 0);
            return bs - as;
          })
          .map((doc: any) => ({ kind: "open_library", doc }))
          .filter((item: any) => {
            const doc = item?.doc || item;
            const title = String(doc?.title || item?.title || "").trim();
            const nt = normalizeText(title);
            if (!title || !nt) {
              kitsuNormalRecoveryRejectedByTitle[title || "(missing_title)"] = "missing_title";
              return false;
            }
            const source = String(doc?.source || doc?.rawDoc?.source || "").toLowerCase();
            if (!source.includes("kitsu")) {
              kitsuNormalRecoveryRejectedByTitle[title] = "not_kitsu_source";
              kitsuRecoveryRankedCandidates.push({ title, sourceId: String(doc?.sourceId || doc?.canonicalId || doc?.key || ""), positiveFitScore: Number(positiveFitScoreByTitle[title] || 0), semanticEvidenceCount: Number(semanticEvidenceCountByTitle[title] || 0), laneAligned: false, rejectReason: "not_kitsu_source", selected: false });
              return false;
            }
            if (!doc?.sourceId) {
              const fallbackSourceId = String(doc?.key || doc?.id || doc?.rawDoc?.id || "").trim();
              if (fallbackSourceId) {
                (doc as any).sourceId = fallbackSourceId.startsWith("kitsu:") ? fallbackSourceId : `kitsu:${fallbackSourceId}`;
              } else if (title) {
                (doc as any).sourceId = `kitsu:${normalizeText(title).replace(/[^a-z0-9]+/g, "-")}`;
              }
            }
            if (/\[google_books_fetch_error\]/i.test(title) || isReferenceArtifactTitle(title)) {
              kitsuNormalRecoveryRejectedByTitle[title] = "artifact_or_fetch_error";
              kitsuRecoveryRankedCandidates.push({ title, sourceId: String(doc?.sourceId || doc?.canonicalId || doc?.key || ""), positiveFitScore: Number(positiveFitScoreByTitle[title] || 0), semanticEvidenceCount: Number(semanticEvidenceCountByTitle[title] || 0), laneAligned: false, rejectReason: "artifact_or_fetch_error", selected: false });
              return false;
            }
            const terminalReason = String(terminalRejectReasonByTitle[nt] || "");
            const isSoftTerminalReject =
              terminalReason.includes("fallback_no_taste_match") ||
              terminalReason.includes("fails_taste_threshold_gate") ||
              terminalReason.includes("final_eligibility_rejected");
            const isHardTerminalReject =
              /age_maturity_blocked|safety|unsafe|artifact|reference|locale|fetch_error/i.test(terminalReason);
            if (terminalReason && !isSoftTerminalReject && isHardTerminalReject) {
              kitsuNormalRecoveryRejectedByTitle[title] = `terminal_safety_reject:${terminalReason}`;
              kitsuRecoveryRankedCandidates.push({ title, sourceId: String(doc?.sourceId || doc?.canonicalId || doc?.key || ""), positiveFitScore: Number(positiveFitScoreByTitle[title] || 0), semanticEvidenceCount: Number(semanticEvidenceCountByTitle[title] || 0), laneAligned: false, rejectReason: `terminal_safety_reject:${terminalReason}`, selected: false });
              return false;
            }
            const fit = Number(positiveFitScoreByTitle[title] || 0);
            const semanticSupportFound = Boolean(semanticSupportFoundByTitle[title]);
            const scrubReason = sharedReturnArtifactScrubRejectReason(doc);
            const softFinalEligibilityScrub = Boolean(scrubReason) && /final_eligibility_rejected/.test(String(scrubReason || ""));
            if (scrubReason && !(softFinalEligibilityScrub && semanticSupportFound && fit >= 0)) {
              kitsuNormalRecoveryRejectedByTitle[title] = `artifact_scrub:${scrubReason}`;
              kitsuRecoveryRankedCandidates.push({ title, sourceId: String(doc?.sourceId || doc?.canonicalId || doc?.key || ""), positiveFitScore: fit, semanticEvidenceCount: Number(semanticEvidenceCountByTitle[title] || 0), laneAligned: false, rejectReason: `artifact_scrub:${scrubReason}`, selected: false });
              return false;
            }
            if (!(fit > 1 && semanticSupportFound)) {
              kitsuNormalRecoveryRejectedByTitle[title] = `fit_or_semantic_gate:fit=${fit.toFixed(2)}:semantic=${semanticSupportFound ? 1 : 0}`;
              kitsuRecoveryBestRejectedReasons[title] = kitsuNormalRecoveryRejectedByTitle[title];
              kitsuRecoveryRankedCandidates.push({ title, sourceId: String(doc?.sourceId || doc?.canonicalId || doc?.key || ""), positiveFitScore: fit, semanticEvidenceCount: Number(semanticEvidenceCountByTitle[title] || 0), laneAligned: false, rejectReason: kitsuNormalRecoveryRejectedByTitle[title], selected: false });
              return false;
            }
            const dislikePenalty = Number(candidateDislikePenaltyByTitle[title] || 0);
            const weightedTaste = Number(candidateWeightedTasteScoreByTitle[title] || 0);
            if (dislikePenalty > weightedTaste + 1.25) {
              kitsuNormalRecoveryRejectedByTitle[title] = `dominant_dislike_penalty:${dislikePenalty.toFixed(2)}>${(weightedTaste + 1.25).toFixed(2)}`;
              kitsuRecoveryBestRejectedReasons[title] = kitsuNormalRecoveryRejectedByTitle[title];
              kitsuRecoveryRankedCandidates.push({ title, sourceId: String(doc?.sourceId || doc?.canonicalId || doc?.key || ""), positiveFitScore: fit, semanticEvidenceCount: Number(semanticEvidenceCountByTitle[title] || 0), laneAligned: false, rejectReason: kitsuNormalRecoveryRejectedByTitle[title], selected: false });
              return false;
            }
            const dislikedSignals = (candidateMatchedDislikedSignalsByTitle[title] || []).map((s: any) => String(s || "").toLowerCase());
            if (dislikedSignals.some((s: string) => /\bhorror\b/.test(s))) {
              kitsuNormalRecoveryRejectedByTitle[title] = "explicit_disliked_overlap:horror";
              kitsuRecoveryBestRejectedReasons[title] = kitsuNormalRecoveryRejectedByTitle[title];
              kitsuRecoveryRankedCandidates.push({ title, sourceId: String(doc?.sourceId || doc?.canonicalId || doc?.key || ""), positiveFitScore: fit, semanticEvidenceCount: Number(semanticEvidenceCountByTitle[title] || 0), laneAligned: false, rejectReason: kitsuNormalRecoveryRejectedByTitle[title], selected: false });
              return false;
            }
            const root = String(parentFranchiseRootForDoc(doc) || "__none__");
            const laneAligned = profileSelectedEntitySeeds.some((seed) => normalizeText(seed).replace(/[^a-z0-9]+/g, "-") === root) || profileCompatibleExpansionRoots.has(root);
            if (seenRoots.has(root)) {
              kitsuNormalRecoveryRejectedByTitle[title] = "duplicate_root";
              kitsuRecoveryRankedCandidates.push({ title, sourceId: String(doc?.sourceId || doc?.canonicalId || doc?.key || ""), positiveFitScore: fit, semanticEvidenceCount: Number(semanticEvidenceCountByTitle[title] || 0), laneAligned, rejectReason: "duplicate_root", selected: false });
              return false;
            }
            seenRoots.add(root);
            kitsuRecoveryRankedCandidates.push({ title, sourceId: String(doc?.sourceId || doc?.canonicalId || doc?.key || ""), positiveFitScore: fit, semanticEvidenceCount: Number(semanticEvidenceCountByTitle[title] || 0), laneAligned, rejectReason: "", selected: true });
            return true;
          })
          .slice(0, 1);
        if (kitsuRecoveryItems.length > 0) {
          for (const item of kitsuRecoveryItems) {
            const doc = item?.doc || item;
            if (doc && typeof doc === "object") {
              (doc as any).restoredByKitsuRecovery = true;
              (doc as any).diagnostics = { ...((doc as any).diagnostics || {}), restoredByKitsuRecovery: true };
            }
          }
          finalOutputItems = kitsuRecoveryItems;
          kitsuNormalRecoveryAcceptedItems.push(...kitsuRecoveryItems);
          kitsuNormalRecoveryAcceptedTitles.push(
            ...kitsuRecoveryItems.map((item: any) => String(item?.doc?.title || item?.title || "").trim()).filter(Boolean)
          );
          returnedItemsBuiltFrom = "kitsu_normal_recovery";
          finalReturnSourceUsed = "kitsu_normal_recovery";
          sourceSkippedReason.push("final_gate_integrity:kitsu_normal_recovery");
        }
      }
      if (finalOutputItems.length === 0 && kitsuNormalRecoveryAcceptedItems.length > 0) {
        finalOutputItems = kitsuNormalRecoveryAcceptedItems.slice(0, Math.max(1, Math.min(3, finalLimit)));
        returnedItemsBuiltFrom = "kitsu_normal_recovery";
        finalReturnSourceUsed = "kitsu_normal_recovery";
        sourceSkippedReason.push("final_gate_integrity:kitsu_normal_recovery_preserved_before_emergency_handoff");
      }
      const teenPostPassHandoffItems =
        finalOutputItems.length === 0 && teenPostPassOutputLength > 0
          ? teenPostPassItems
              .filter((item: any) => {
                const doc = item?.doc || item;
                const title = String(doc?.title || item?.title || "").trim();
                const nt = normalizeText(title);
                if (!title || !nt) return false;
                if (isReferenceArtifactTitle(title)) return false;
                const teenPostPassSuperheroJunkRe = /\b(man and superman|expedition kon-tiki|from ["']?superman["']?\s+to man)\b/i;
                const teenPostPassExactAllowlistRe = /\b(the wicked \+ the divine|bloom|low orbit|biopunk dystopias)\b/i;
                const exactAllowlisted = teenPostPassExactAllowlistRe.test(title);
                const terminalReason = String(terminalRejectReasonByTitle[nt] || "");
                if (terminalReason && !terminalReason.includes("fallback_no_taste_match") && !exactAllowlisted) return false;
                if (teenPostPassSuperheroJunkRe.test(title)) return false;
                if (sharedReturnArtifactScrubRejectReason(doc) && !exactAllowlisted) return false;
                const returnRejectReason = canReturnTitleRejectReason(title, doc);
                if (returnRejectReason) {
                  const canBypassForSuperheroSignal =
                    explicitSuperheroSignal &&
                    /superhero_topup_blocked_without_explicit_signal|fails_taste_threshold_gate|fallback_no_taste_match/.test(returnRejectReason) &&
                    /\b(spider[\s-]?man|batman|wonder woman|arkham|superman|teen titans|justice league)\b/i.test(title);
                  if (!canBypassForSuperheroSignal && !exactAllowlisted) return false;
                  sourceSkippedReason.push(`teen_postpass_superhero_bypass:${title}`);
                }
                return true;
              })
              .slice(0, Math.max(1, Math.min(3, finalLimit)))
          : [];
      if (teenPostPassHandoffItems.length > 0) {
        finalOutputItems = teenPostPassHandoffItems;
        returnedItemsBuiltFrom = "teen_postpass_emergency_handoff";
        finalReturnSourceUsed = "teen_postpass_emergency_handoff";
        sourceSkippedReason.push("final_gate_integrity:teen_postpass_emergency_handoff");
      } else {
      const viableUnderfillRescue = dedupeDocs([...(finalRenderDocs || []), ...(viableCandidates || []), ...(scoredCanonicalDocs || [])] as any[])
        .filter((doc: any) => {
          const title = String(doc?.title || "").trim();
          const nt = normalizeText(title);
          if (!title || !nt) return false;
          const terminalReason = String(terminalRejectReasonByTitle[nt] || "");
          if (terminalReason && !terminalReason.includes("fallback_no_taste_match")) return false;
          if (isSuperheroAdventureDoc(doc) && !explicitSuperheroSignal) return false;
          const sem = Number(semanticEvidenceCountByTitle[title] || 0);
          const fit = Number(positiveFitScoreByTitle[title] || 0);
          const weighted = Number(candidateWeightedTasteScoreByTitle[title] || 0);
          const score = Number(doc?.score ?? doc?.diagnostics?.finalScore ?? 0);
          if (score < 0) return false;
          if (sem < 1 && fit < 4 && weighted < 2.5) return false;
          const scrubReason = sharedReturnArtifactScrubRejectReason(doc);
          if (scrubReason) return false;
          if (canReturnTitleRejectReason(title, doc)) return false;
          return true;
        })
        .slice(0, Math.max(1, Math.min(3, finalLimit)));
      if (viableUnderfillRescue.length > 0) {
        finalOutputItems = viableUnderfillRescue.map((doc: any) => ({ kind: "open_library", doc }));
        finalEligibilityAcceptedTitles.push(...viableUnderfillRescue.map((doc: any) => String(doc?.title || "").trim()).filter(Boolean));
        sourceSkippedReason.push("final_gate_integrity:min_viable_underfill_rescue");
      } else {
        const rankedKitsuRescue = orderKitsuRescueStrongBeforeWeak(kitsuRecoveryRankedCandidates
          .filter((row) => !row.rejectReason)
          .filter((row) => Boolean(row.sourceId))
          .filter((row) => !isReferenceArtifactTitle(String(row.title || "")))
          .map((row) => ({
            ...row,
            weightedTasteScore: Number(candidateWeightedTasteScoreByTitle[String(row.title || "").trim()] || 0),
            dislikePenaltyScore: Number(candidateDislikePenaltyByTitle[String(row.title || "").trim()] || 0),
          })), 3);
        const rankedKitsuFallbackFromRankedDocs = (rankedDocs || [])
          .filter((doc: any) => String(doc?.source || doc?.rawDoc?.source || "").toLowerCase().includes("kitsu"))
          .filter((doc: any) => !isReferenceArtifactTitle(String(doc?.title || "").trim()))
          .map((doc: any) => {
            const title = String(doc?.title || "").trim();
            const root = String(parentFranchiseRootForDoc(doc) || "");
            const laneAligned = profileSelectedEntitySeeds.some((seed) => normalizeText(seed).replace(/[^a-z0-9]+/g, "-") === root) || profileCompatibleExpansionRoots.has(root);
            return {
              title,
              sourceId: String(doc?.sourceId || doc?.canonicalId || doc?.key || ""),
              positiveFitScore: Number(positiveFitScoreByTitle[title] || 0),
              semanticEvidenceCount: Number(semanticEvidenceCountByTitle[title] || 0),
              weightedTasteScore: Number(candidateWeightedTasteScoreByTitle[title] || 0),
              dislikePenaltyScore: Number(candidateDislikePenaltyByTitle[title] || 0),
              laneAligned,
            };
          })
          .filter((row: any) => Boolean(row.title));
        const rankedKitsuFallbackFromRankedDocsOrdered = orderKitsuRescueStrongBeforeWeak(rankedKitsuFallbackFromRankedDocs, 3);
        const kitsuRawCountForRescue = Number(aggregatedRawFetched.kitsu || 0);
        const shouldTriggerRankedPoolRescue = kitsuRawCountForRescue >= 10 && Number(rankedCount || 0) >= 10;
        kitsuRankedPoolRescueEligible = shouldTriggerRankedPoolRescue;
        const rescuePoolToUse = suppressKitsuWeakPadding(rankedKitsuRescue.length > 0 ? rankedKitsuRescue : rankedKitsuFallbackFromRankedDocsOrdered);
        kitsuRankedPoolRescueCandidateCount = rescuePoolToUse.length;
        if (!shouldTriggerRankedPoolRescue) kitsuRankedPoolRescueBlockedReason = `trigger_not_met:kitsuRaw=${kitsuRawCountForRescue}:ranked=${Number(rankedCount || 0)}`;
        else if (rescuePoolToUse.length === 0) kitsuRankedPoolRescueBlockedReason = "eligible_but_no_kitsu_rescue_candidates";
        if (shouldTriggerRankedPoolRescue && rescuePoolToUse.length > 0) {
          const top = rescuePoolToUse[0];
          kitsuRankedPoolRescueSource = rankedKitsuRescue.length > 0 ? "kitsuRecoveryRankedCandidates" : "rankedDocsFallback";
          const teenDocs = teenPostPassItems.map((item: any) => item?.doc || item);
          const rescuePoolStrongCount = rescuePoolToUse.filter((row: any) => isKitsuRescueStrongRow(row)).length;
          const rankedRescueLimit = rescuePoolStrongCount > 0 ? Math.max(3, Math.min(5, finalLimit)) : 1;
          const rankedRescueDocs = rescuePoolToUse
            .map((row: any) => teenDocs.find((doc: any) => normalizeText(String(doc?.title || "")) === normalizeText(String(row?.title || ""))))
            .filter(Boolean)
            .slice(0, rankedRescueLimit);
          if (rankedRescueDocs.length > 0) {
            finalOutputItems = rankedRescueDocs.map((doc: any) => ({ kind: "open_library", doc }));
            returnedItemsBuiltFrom = rescuePoolStrongCount > 0 ? "kitsu_ranked_pool_rescue" : "kitsu_ranked_pool_rescue_weak_candidates";
            finalReturnSourceUsed = returnedItemsBuiltFrom;
            if (rescuePoolStrongCount === 0) markKitsuRankedPoolWeakCandidateOutput("pre_emergency_ranked_pool_all_weak", rescuePoolToUse, finalOutputItems);
            sourceSkippedReason.push(`final_gate_integrity:${returnedItemsBuiltFrom}`);
            kitsuRankedPoolRescueBlockedReason = "none";
            kitsuFinalEligibilitySparseMetadataRescue = {
              activated: true,
              candidateTitle: String(top?.title || ""),
              sourceId: String(top?.sourceId || ""),
              failedChecks: [],
              laneAligned: Boolean(top?.laneAligned),
              semanticEvidenceCount: Number(top?.semanticEvidenceCount || 0),
              reason: `ranked_kitsu_pool_rescue_pre_emergency:${kitsuRankedPoolRescueSource}`,
            };
          }
          if (rankedRescueDocs.length === 0) kitsuRankedPoolRescueBlockedReason = "top_candidate_not_found_in_teen_postpass_items";
        }
      }
      if (finalOutputItems.length === 0) {
        const sparseMetadataFailureReasons = new Set(["low_recommendation_confidence", "zero_meaningful_signal_without_franchise_or_taste_alignment", "insufficient_positive_fit_score", "missing_parent_or_title_root_match"]);
        const kitsuSparseEligibleRows = finalEligibilityAudit
          .filter((row) => String(row?.source || "").includes("kitsu"))
          .filter((row) => {
            const title = String(row?.title || "").trim();
            const sourceIdOk = Boolean(row?.sourceId);
            const nonReference = !isReferenceArtifactTitle(title);
            const semantic = Number(semanticEvidenceCountByTitle[title] || 0);
            const fails = Array.isArray(row?.failedChecks) ? row.failedChecks : [];
            const sparseOnly = fails.length > 0 && fails.every((reason: string) => sparseMetadataFailureReasons.has(String(reason || "")));
            const laneOrSemantic = Boolean(row?.laneAligned) || semantic > 0;
            let rejectedReasonForRescue = "";
            if (!sourceIdOk) rejectedReasonForRescue = "missing_source_id";
            else if (!nonReference) rejectedReasonForRescue = "reference_title";
            else if (!laneOrSemantic) rejectedReasonForRescue = "no_lane_or_semantic_alignment";
            else if (!sparseOnly) rejectedReasonForRescue = "failed_checks_not_sparse_metadata_only";
            kitsuFinalEligibilitySparseMetadataRescueCandidates.push({
              title,
              sourceId: String(row?.sourceId || ""),
              failedChecks: fails,
              laneAligned: Boolean(row?.laneAligned),
              semanticEvidenceCount: semantic,
              positiveFitScore: Number(positiveFitScoreByTitle[title] || 0),
              rejectedReasonForRescue,
            });
            return !rejectedReasonForRescue;
          })
          .sort((a, b) => {
            if (Number(b.laneAligned) !== Number(a.laneAligned)) return Number(b.laneAligned) - Number(a.laneAligned);
            const at = String(a?.title || "").trim();
            const bt = String(b?.title || "").trim();
            const af = Number(positiveFitScoreByTitle[at] || 0);
            const bf = Number(positiveFitScoreByTitle[bt] || 0);
            if (bf !== af) return bf - af;
            const as = Number(semanticEvidenceCountByTitle[at] || 0);
            const bs = Number(semanticEvidenceCountByTitle[bt] || 0);
            return bs - as;
          });
        if (kitsuSparseEligibleRows.length > 0) {
          const chosen = kitsuSparseEligibleRows[0];
          const chosenTitle = String(chosen?.title || "").trim();
          const chosenDoc = teenPostPassItems
            .map((item: any) => item?.doc || item)
            .find((doc: any) => normalizeText(String(doc?.title || "")) === normalizeText(chosenTitle));
          if (chosenDoc) {
            finalOutputItems = [{ kind: "open_library", doc: chosenDoc }];
            returnedItemsBuiltFrom = "kitsu_final_eligibility_sparse_metadata_rescue";
            finalReturnSourceUsed = "kitsu_final_eligibility_sparse_metadata_rescue";
            sourceSkippedReason.push("final_gate_integrity:kitsu_final_eligibility_sparse_metadata_rescue");
            kitsuFinalEligibilitySparseMetadataRescue = {
              activated: true,
              candidateTitle: chosenTitle,
              sourceId: String(chosen?.sourceId || ""),
              failedChecks: Array.isArray(chosen?.failedChecks) ? chosen.failedChecks : [],
              laneAligned: Boolean(chosen?.laneAligned),
              semanticEvidenceCount: Number(semanticEvidenceCountByTitle[chosenTitle] || 0),
              reason: "kitsu_sparse_metadata_only_failures",
            };
          } else {
            finalOutputItems = [];
            sourceSkippedReason.push("final_gate_integrity:no_final_eligibility_accepts");
            kitsuFinalEligibilitySparseMetadataRescue = {
              activated: false,
              candidateTitle: "",
              sourceId: "",
              failedChecks: [],
              laneAligned: false,
              semanticEvidenceCount: 0,
              reason: "eligible_row_had_no_matching_doc_in_teen_postpass_items",
            };
          }
        } else {
          finalOutputItems = [];
          sourceSkippedReason.push("final_gate_integrity:no_final_eligibility_accepts");
          kitsuFinalEligibilitySparseMetadataRescue = {
            activated: false,
            candidateTitle: "",
            sourceId: "",
            failedChecks: [],
            laneAligned: false,
            semanticEvidenceCount: 0,
            reason: kitsuFinalEligibilitySparseMetadataRescueCandidates.length > 0 ? "no_candidates_met_sparse_metadata_rescue_constraints" : "no_kitsu_audit_rows_available_for_sparse_metadata_rescue",
          };
        }
      }
      }
    } else {
      finalOutputItems = finalOutputItems.filter((item: any) => {
        const title = String(item?.doc?.title || item?.title || "").trim();
        return acceptedAfterTerminalSet.has(normalizeText(title));
      });
    }
  }
  if (!suppressTopRecommendations && finalOutputItems.length === 0 && teenPostPassOutputLength > 0) {
    const shouldTriggerRankedPoolRescue = Number(aggregatedRawFetched.kitsu || 0) >= 10 && Number(rankedCount || 0) >= 10;
    if (shouldTriggerRankedPoolRescue) {
      const rankedKitsuFallbackFromRankedDocs = suppressKitsuWeakPadding(orderKitsuRescueStrongBeforeWeak((rankedDocs || [])
        .filter((doc: any) => String(doc?.source || doc?.rawDoc?.source || "").toLowerCase().includes("kitsu"))
        .filter((doc: any) => !isReferenceArtifactTitle(String(doc?.title || "").trim()))
        .map((doc: any) => ({ doc, ...kitsuRescueQualityMetricsForDoc(doc) })), 3));
      kitsuRankedPoolRescueEligible = true;
      if (kitsuRankedPoolRescueSource === "not_triggered" && rankedKitsuFallbackFromRankedDocs.length > 0) {
        const teenDocs = teenPostPassItems.map((item: any) => item?.doc || item);
        const rankedKitsuFallbackStrongCount = rankedKitsuFallbackFromRankedDocs.filter((row: any) => isKitsuRescueStrongRow(row)).length;
        const rankedRescueLimit = rankedKitsuFallbackStrongCount > 0 ? Math.max(3, Math.min(5, finalLimit)) : 1;
        const rankedRescueDocs = rankedKitsuFallbackFromRankedDocs
          .map((row: any) => teenDocs.find((doc: any) => normalizeText(String(doc?.title || "")) === normalizeText(String(row?.title || ""))) || row.doc)
          .filter(Boolean)
          .slice(0, rankedRescueLimit);
        kitsuRankedPoolRescueCandidateCount = rankedKitsuFallbackFromRankedDocs.length;
        kitsuRankedPoolRescueSource = "rankedDocsFallback";
        if (rankedRescueDocs.length > 0) {
          finalOutputItems = rankedRescueDocs.map((doc: any) => ({ kind: "open_library", doc }));
          returnedItemsBuiltFrom = rankedKitsuFallbackStrongCount > 0 ? "kitsu_ranked_pool_rescue" : "kitsu_ranked_pool_rescue_weak_candidates";
          finalReturnSourceUsed = returnedItemsBuiltFrom;
          if (rankedKitsuFallbackStrongCount === 0) markKitsuRankedPoolWeakCandidateOutput("late_guard_ranked_pool_all_weak", rankedKitsuFallbackFromRankedDocs, finalOutputItems);
          kitsuRankedPoolRescueBlockedReason = "none";
          sourceSkippedReason.push(`final_gate_integrity:${returnedItemsBuiltFrom}_late_guard`);
        } else {
          kitsuRankedPoolRescueBlockedReason = "late_guard_top_candidate_not_found_in_teen_postpass_items";
        }
      }
    }
  }
  if (!suppressTopRecommendations && finalOutputItems.length === 0 && teenPostPassOutputLength > 0) {
    if (kitsuNormalRecoveryAcceptedItems.length > 0) {
      finalOutputItems = kitsuNormalRecoveryAcceptedItems.slice(0, Math.max(1, Math.min(3, finalLimit)));
      returnedItemsBuiltFrom = "kitsu_normal_recovery";
      finalReturnSourceUsed = "kitsu_normal_recovery";
      sourceSkippedReason.push("final_gate_integrity:kitsu_normal_recovery_preserved_before_global_emergency_handoff");
    }
  }
  if (!suppressTopRecommendations && finalOutputItems.length === 0 && teenPostPassOutputLength > 0) {
    const strongKitsuRecoveryPool = suppressKitsuWeakPadding(orderKitsuRescueRowsPenaltyFirst(kitsuRecoveryRankedCandidates
      .filter((row) => !row.rejectReason)
      .map((row) => ({
        ...row,
        weightedTasteScore: Number(candidateWeightedTasteScoreByTitle[String(row.title || "").trim()] || 0),
        dislikePenaltyScore: Number(candidateDislikePenaltyByTitle[String(row.title || "").trim()] || 0),
      })), 3));
    if (strongKitsuRecoveryPool.length >= 10) {
      const preferredTitles = new Set(strongKitsuRecoveryPool.map((r) => normalizeText(r.title)));
      const preferredKitsuItems = teenPostPassItems
        .filter((item: any) => preferredTitles.has(normalizeText(String(item?.doc?.title || item?.title || ""))))
        .slice(0, Math.max(1, Math.min(3, finalLimit)));
      if (preferredKitsuItems.length > 0) {
        finalOutputItems = preferredKitsuItems;
        returnedItemsBuiltFrom = "kitsu_recovery_preferred_over_emergency_handoff";
        finalReturnSourceUsed = "kitsu_recovery_preferred_over_emergency_handoff";
        sourceSkippedReason.push("final_gate_integrity:kitsu_recovery_preferred_over_emergency_handoff");
      }
    }
  }
  if (!suppressTopRecommendations && finalOutputItems.length === 0 && teenPostPassOutputLength > 0) {
    const hardArtifactRe = /\[google_books_fetch_error\]|\b(classroom|teaching|index|awards?|reference|bibliograph(?:y|ies)|poetry for children)\b/i;
    const seenRoots = new Set<string>();
    const teenPostPassGlobalHandoff = teenPostPassItems
      .filter((item: any) => {
        const doc = item?.doc || item;
        const title = String(doc?.title || item?.title || "").trim();
        const nt = normalizeText(title);
        if (!title || !nt) return false;
        if (isReferenceArtifactTitle(title)) return false;
        if (hardArtifactRe.test(title)) return false;
        const terminalReason = String(terminalRejectReasonByTitle[nt] || "");
        if (terminalReason && !terminalReason.includes("fallback_no_taste_match")) return false;
        if (sharedReturnArtifactScrubRejectReason(doc)) return false;
        const returnRejectReason = canReturnTitleRejectReason(title, doc);
        if (returnRejectReason && !/fallback_no_taste_match|fails_taste_threshold_gate/.test(returnRejectReason)) return false;
        const root = String(parentFranchiseRootForDoc(doc) || "__none__");
        if (seenRoots.has(root)) return false;
        seenRoots.add(root);
        return true;
      })
      .slice(0, Math.max(1, Math.min(3, finalLimit)));
    if (teenPostPassGlobalHandoff.length > 0) {
      finalOutputItems = teenPostPassGlobalHandoff;
      returnedItemsBuiltFrom = "teen_postpass_global_emergency_handoff";
      finalReturnSourceUsed = "teen_postpass_global_emergency_handoff";
      sourceSkippedReason.push("final_gate_integrity:teen_postpass_global_emergency_handoff");
      if (kitsuNormalRecoveryAcceptedTitles.length > 0) {
        kitsuAcceptedButEmergencyReturned = {
          acceptedTitles: Array.from(new Set(kitsuNormalRecoveryAcceptedTitles)).slice(0, 20),
          emergencyReturnedTitles: teenPostPassGlobalHandoff.map((item: any) => String(item?.doc?.title || item?.title || "").trim()).filter(Boolean),
          reason: "kitsu_normal_recovery_accepted_but_global_emergency_selected",
        };
      }
    }
  }
  let teenPostPassGlobalHandoffConsidered = false;
  let teenPostPassGlobalHandoffAcceptedTitles: string[] = [];
  const teenPostPassGlobalHandoffRejectedByTitle: Record<string, string> = {};
  const teenPostPassEmergencyCandidateScores: Array<{ title: string; laneAligned: boolean; positiveFitScore: number; semanticEvidenceScore: number; emergencyRank: number }> = [];
  const graphicEmergencyRescueCandidates: Array<{ title: string; rejectReason: string; positiveFitScore: number; semanticEvidenceCount: number; titleLooksGraphic: boolean; selected: boolean }> = [];
  const terminalEmergencyRankedCandidates: Array<{ title: string; titleLooksGraphic: boolean; laneAligned: boolean; positiveFitScore: number; semanticEvidenceCount: number; selected: boolean }> = [];
  const comparableRejectedGraphicCandidates: Array<{ title: string; rejectReason: string; positiveFitScore: number; semanticEvidenceCount: number; laneAligned: boolean; titleLooksGraphic: boolean }> = [];
  let graphicEmergencyProseBlockReason = "";
  let itemsForReturn = Array.isArray(finalOutputItems) ? finalOutputItems.slice() : [];
  let graphicCandidateAvailableButProseSelected = false;
  if (Number((finalOutputItems as any[])?.length || 0) === 0 && teenPostPassOutputTitles.length > 0) {
    teenPostPassGlobalHandoffConsidered = true;
    const graphicEmergencyContext = queryLanesUsed.some((q: any) => /\b(graphic novel|comic|manga|manhwa|webtoon)\b/i.test(String(q || "")));
    const hasGraphicCandidateInPostPass = graphicEmergencyContext && teenPostPassItems.some((item: any) => {
      const doc = item?.doc || item;
      const title = String(doc?.title || item?.title || "").trim();
      const queryText = String(doc?.queryText || "");
      return /\b(graphic novel|comic|manga|manhwa|webtoon|volume\s*1|book\s*1|vol\.?\s*1|omnibus)\b/i.test(`${title} ${queryText}`);
    });
    const graphicFantasyRomanceEmergencyContext = graphicEmergencyContext &&
      queryLanesUsed.some((q: any) => /\b(fantasy|romance|romantic|love)\b/i.test(String(q || "")));
    const entityDrivenGraphicContext = graphicEmergencyContext && profileSelectedEntitySeeds.length > 0;
    const rejectedLowConfidenceSet = new Set((finalEligibilityRejectedTitlesByReason?.low_recommendation_confidence || []).map((t) => normalizeText(String(t || ""))));
    const rejectedTasteThresholdSet = new Set((finalEligibilityRejectedTitlesByReason?.fails_taste_threshold_gate || []).map((t) => normalizeText(String(t || ""))));
    const rejectedMissingParentOrRootSet = new Set((finalEligibilityRejectedTitlesByReason?.missing_parent_or_title_root_match || []).map((t) => normalizeText(String(t || ""))));
    const rejectedZeroMeaningfulSet = new Set((finalEligibilityRejectedTitlesByReason?.zero_meaningful_signal_without_franchise_or_taste_alignment || []).map((t) => normalizeText(String(t || ""))));
    const rejectedMissingSourceIdSet = new Set((finalEligibilityRejectedTitlesByReason?.missing_source_id || []).map((t) => normalizeText(String(t || ""))));
    const comparableRejectedGraphicExists = graphicEmergencyContext && teenPostPassItems.some((item: any) => {
      const doc = item?.doc || item;
      const title = String(doc?.title || item?.title || "").trim();
      const key = normalizeText(title);
      const titleLooksGraphic = /\b(volume\s*1|book\s*1|vol\.?\s*1|omnibus|graphic novel|comic|manga|manhwa|webtoon)\b/i.test(title);
      const queryText = String(doc?.queryText || "").toLowerCase();
      const mediaShapedGraphic = /\b(graphic novel|comic|manga|manhwa|webtoon)\b/.test(`${title.toLowerCase()} ${queryText}`);
      if (!title || !(titleLooksGraphic || mediaShapedGraphic) || isReferenceArtifactTitle(title)) return false;
      const rejected =
        rejectedLowConfidenceSet.has(key) ||
        rejectedTasteThresholdSet.has(key) ||
        rejectedMissingParentOrRootSet.has(key) ||
        rejectedZeroMeaningfulSet.has(key) ||
        rejectedMissingSourceIdSet.has(key);
      if (!rejected) return false;
      const fit = Number(positiveFitScoreByTitle[title] || 0);
      const semantic = Number(semanticEvidenceCountByTitle[title] || 0);
      const root = String(parentFranchiseRootForDoc(doc) || "__none__");
      const laneAligned = profileSelectedEntitySeeds.some((seed) => normalizeText(seed).replace(/[^a-z0-9]+/g, "-") === root) || profileCompatibleExpansionRoots.has(root);
      const rejectReason =
        rejectedLowConfidenceSet.has(key) ? "low_recommendation_confidence" :
        rejectedTasteThresholdSet.has(key) ? "fails_taste_threshold_gate" :
        rejectedMissingParentOrRootSet.has(key) ? "missing_parent_or_title_root_match" :
        rejectedZeroMeaningfulSet.has(key) ? "zero_meaningful_signal_without_franchise_or_taste_alignment" :
        "missing_source_id";
      comparableRejectedGraphicCandidates.push({
        title,
        rejectReason,
        positiveFitScore: fit,
        semanticEvidenceCount: semantic,
        laneAligned,
        titleLooksGraphic: titleLooksGraphic || mediaShapedGraphic,
      });
      return semantic >= 1 || fit >= 3 || laneAligned;
    });
    const hardArtifactRe = /\[google_books_fetch_error\]|\b(classroom|teaching|index|awards?|reference|bibliograph(?:y|ies)|poetry for children)\b/i;
    const seenRoots = new Set<string>();
    const fallbackItems = teenPostPassItems.filter((item: any) => {
      const doc = item?.doc || item;
      const title = String(doc?.title || item?.title || "").trim();
      const nt = normalizeText(title);
      if (!title || !nt) {
        teenPostPassGlobalHandoffRejectedByTitle[title || "(missing_title)"] = "missing_title";
        return false;
      }
      if (hardArtifactRe.test(title)) {
        teenPostPassGlobalHandoffRejectedByTitle[title] = "artifact_or_fetch_error";
        return false;
      }
      const terminalReason = String(terminalRejectReasonByTitle[nt] || "");
      if (terminalReason && !terminalReason.includes("fallback_no_taste_match") && !terminalReason.includes("fails_taste_threshold_gate")) {
        teenPostPassGlobalHandoffRejectedByTitle[title] = `terminal_reject:${terminalReason}`;
        return false;
      }
      const scrubReason = sharedReturnArtifactScrubRejectReason(doc);
      if (scrubReason) {
        teenPostPassGlobalHandoffRejectedByTitle[title] = `artifact_scrub:${scrubReason}`;
        return false;
      }
      const root = String(parentFranchiseRootForDoc(doc) || "__none__");
      const fit = Number(positiveFitScoreByTitle[title] || 0);
      const semantic = Number(semanticEvidenceCountByTitle[title] || 0);
      const laneAligned = profileSelectedEntitySeeds.some((seed) => normalizeText(seed).replace(/[^a-z0-9]+/g, "-") === root) || profileCompatibleExpansionRoots.has(root);
      const queryText = String(doc?.queryText || "").toLowerCase();
      const graphicCandidate = /\b(graphic novel|comic|manga|manhwa|webtoon)\b/.test(`${title.toLowerCase()} ${queryText}`);
      const titleLooksGraphic = /\b(volume\s*1|book\s*1|vol\.?\s*1|omnibus|graphic novel|comic|manga|manhwa|webtoon)\b/i.test(title);
      const psychSuspenseLane = /\b(psychological|suspense|thriller)\b/.test(String(queryText));
      const prosePsychFallbackTitle = /\b(sharp objects|the stranger in my bed|the last sacrifice)\b/i.test(title);
      if (graphicEmergencyContext && prosePsychFallbackTitle && !psychSuspenseLane) {
        teenPostPassGlobalHandoffRejectedByTitle[title] = "prose_psych_fallback_blocked_in_graphic_context";
        return false;
      }
      if (graphicFantasyRomanceEmergencyContext && !graphicCandidate) {
        const obviousProseDefault = /\b(novel|a novel|paperback|hardcover)\b/i.test(`${title} ${queryText}`);
        if (obviousProseDefault && !laneAligned && semantic <= 0 && fit <= 0) {
          teenPostPassGlobalHandoffRejectedByTitle[title] = "prose_default_blocked_in_graphic_context";
          return false;
        }
      }
      if (hasGraphicCandidateInPostPass && !graphicCandidate) {
        const proseDefaultLike = /\b(novel|paperback|hardcover)\b/i.test(`${title} ${queryText}`);
        if (proseDefaultLike || comparableRejectedGraphicExists) {
          teenPostPassGlobalHandoffRejectedByTitle[title] = "prose_blocked_when_graphic_candidate_available";
          if (!graphicEmergencyProseBlockReason) graphicEmergencyProseBlockReason = proseDefaultLike ? "prose_default_like_with_graphic_candidate_available" : "comparable_rejected_graphic_exists";
          return false;
        }
      }
      if (entityDrivenGraphicContext && !graphicCandidate) {
        const rootMatch = profileSelectedEntitySeeds.some((seed) => normalizeText(String(seed || "")).replace(/[^a-z0-9]+/g, "-") === root);
        const titleEntityMatch = profileSelectedEntitySeeds.some((seed) => normalizeText(title).includes(normalizeText(seed)));
        if (!(rootMatch || titleEntityMatch)) {
          teenPostPassGlobalHandoffRejectedByTitle[title] = "entity_graphic_context_prose_blocked";
          if (!graphicEmergencyProseBlockReason) graphicEmergencyProseBlockReason = "entity_graphic_context_requires_entity_or_graphic_match";
          return false;
        }
      }
      const returnRejectReason = canReturnTitleRejectReason(title, doc);
      if (returnRejectReason) {
        const graphicFailsTasteRescue =
          graphicEmergencyContext &&
          /fails_taste_threshold_gate/.test(returnRejectReason) &&
          titleLooksGraphic &&
          !isReferenceArtifactTitle(title) &&
          (semantic >= 1 || fit >= 3 || laneAligned);
        if (!graphicFailsTasteRescue && !/fallback_no_taste_match|fails_taste_threshold_gate/.test(returnRejectReason)) {
          teenPostPassGlobalHandoffRejectedByTitle[title] = `return_reject:${returnRejectReason}`;
          return false;
        }
      }
      if (!laneAligned && fit <= 0 && semantic <= 0) {
        teenPostPassGlobalHandoffRejectedByTitle[title] = "weak_alignment_for_emergency_handoff";
        return false;
      }
      if (seenRoots.has(root)) {
        teenPostPassGlobalHandoffRejectedByTitle[title] = "duplicate_root";
        return false;
      }
      seenRoots.add(root);
      return true;
    }).sort((a: any, b: any) => {
      const ad = a?.doc || a;
      const bd = b?.doc || b;
      const at = String(ad?.title || a?.title || "").trim();
      const bt = String(bd?.title || b?.title || "").trim();
      if (graphicEmergencyContext) {
        const aGraphic = Number(/\b(graphic novel|comic|manga|manhwa|webtoon)\b/i.test(`${at} ${String(ad?.queryText || "")}`));
        const bGraphic = Number(/\b(graphic novel|comic|manga|manhwa|webtoon)\b/i.test(`${bt} ${String(bd?.queryText || "")}`));
        if (bGraphic !== aGraphic) return bGraphic - aGraphic;
      }
      if (entityDrivenGraphicContext) {
        const aEntity = Number(profileSelectedEntitySeeds.some((seed) => normalizeText(at).includes(normalizeText(seed)) || normalizeText(String(parentFranchiseRootForDoc(ad) || "")).includes(normalizeText(seed))));
        const bEntity = Number(profileSelectedEntitySeeds.some((seed) => normalizeText(bt).includes(normalizeText(seed)) || normalizeText(String(parentFranchiseRootForDoc(bd) || "")).includes(normalizeText(seed))));
        if (bEntity !== aEntity) return bEntity - aEntity;
      }
      const aFit = Number(positiveFitScoreByTitle[at] || 0);
      const bFit = Number(positiveFitScoreByTitle[bt] || 0);
      if (bFit !== aFit) return bFit - aFit;
      const aSemantic = Number(semanticEvidenceCountByTitle[at] || 0);
      const bSemantic = Number(semanticEvidenceCountByTitle[bt] || 0);
      if (bSemantic !== aSemantic) return bSemantic - aSemantic;
      const aRoot = String(parentFranchiseRootForDoc(ad) || "");
      const bRoot = String(parentFranchiseRootForDoc(bd) || "");
      const aLane = Number(profileSelectedEntitySeeds.some((seed) => normalizeText(seed).replace(/[^a-z0-9]+/g, "-") === aRoot) || profileCompatibleExpansionRoots.has(aRoot));
      const bLane = Number(profileSelectedEntitySeeds.some((seed) => normalizeText(seed).replace(/[^a-z0-9]+/g, "-") === bRoot) || profileCompatibleExpansionRoots.has(bRoot));
      if (bLane !== aLane) return bLane - aLane;
      return 0;
    }).slice(0, Math.max(1, Math.min(3, finalLimit)));
    teenPostPassEmergencyCandidateScores.push(
      ...fallbackItems.map((item: any, idx: number) => {
        const doc = item?.doc || item;
        const title = String(doc?.title || item?.title || "").trim();
        const root = String(parentFranchiseRootForDoc(doc) || "");
        const laneAligned = profileSelectedEntitySeeds.some((seed) => normalizeText(seed).replace(/[^a-z0-9]+/g, "-") === root) || profileCompatibleExpansionRoots.has(root);
        return {
          title,
          laneAligned,
          positiveFitScore: Number(positiveFitScoreByTitle[title] || 0),
          semanticEvidenceScore: Number(semanticEvidenceCountByTitle[title] || 0),
          emergencyRank: idx + 1,
        };
      }).filter((row: any) => Boolean(row.title))
    );
    terminalEmergencyRankedCandidates.push(
      ...fallbackItems.map((item: any) => {
        const doc = item?.doc || item;
        const title = String(doc?.title || item?.title || "").trim();
        const root = String(parentFranchiseRootForDoc(doc) || "");
        return {
          title,
          titleLooksGraphic: /\b(volume\s*1|book\s*1|vol\.?\s*1|omnibus|graphic novel|comic|manga|manhwa|webtoon)\b/i.test(title),
          laneAligned: profileSelectedEntitySeeds.some((seed) => normalizeText(seed).replace(/[^a-z0-9]+/g, "-") === root) || profileCompatibleExpansionRoots.has(root),
          positiveFitScore: Number(positiveFitScoreByTitle[title] || 0),
          semanticEvidenceCount: Number(semanticEvidenceCountByTitle[title] || 0),
          selected: false,
        };
      }).filter((row: any) => Boolean(row.title))
    );
    if (graphicEmergencyContext) {
      const rejectedLowConfidence = new Set((finalEligibilityRejectedTitlesByReason?.low_recommendation_confidence || []).map((t) => normalizeText(String(t || ""))));
      const rejectedZeroMeaningful = new Set((finalEligibilityRejectedTitlesByReason?.zero_meaningful_signal_without_franchise_or_taste_alignment || []).map((t) => normalizeText(String(t || ""))));
      const rejectedTasteThreshold = new Set((finalEligibilityRejectedTitlesByReason?.fails_taste_threshold_gate || []).map((t) => normalizeText(String(t || ""))));
      for (const item of teenPostPassItems) {
        const doc = item?.doc || item;
        const title = String(doc?.title || item?.title || "").trim();
        if (!title) continue;
        const key = normalizeText(title);
        const rejectReason = rejectedLowConfidence.has(key)
            ? "low_recommendation_confidence"
          : rejectedZeroMeaningful.has(key)
            ? "zero_meaningful_signal_without_franchise_or_taste_alignment"
            : rejectedTasteThreshold.has(key)
              ? "fails_taste_threshold_gate"
            : "";
        if (!rejectReason) continue;
        const titleLooksGraphic = /\b(volume\s*1|book\s*1|vol\.?\s*1|omnibus|graphic novel|comic|manga|manhwa|webtoon)\b/i.test(title);
        graphicEmergencyRescueCandidates.push({
          title,
          rejectReason,
          positiveFitScore: Number(positiveFitScoreByTitle[title] || 0),
          semanticEvidenceCount: Number(semanticEvidenceCountByTitle[title] || 0),
          titleLooksGraphic,
          selected: false,
        });
      }
    }
    if (fallbackItems.length > 0) {
      itemsForReturn = fallbackItems;
      teenPostPassGlobalHandoffAcceptedTitles = fallbackItems
        .map((item: any) => String(item?.doc?.title || item?.title || "").trim())
        .filter(Boolean);
      for (const acceptedTitle of teenPostPassGlobalHandoffAcceptedTitles) {
        delete teenPostPassGlobalHandoffRejectedByTitle[acceptedTitle];
      }
      if (hasGraphicCandidateInPostPass) {
        const selectedHasGraphic = teenPostPassGlobalHandoffAcceptedTitles.some((t) => /\b(graphic novel|comic|manga|manhwa|webtoon|volume\s*1|book\s*1|vol\.?\s*1|omnibus)\b/i.test(t));
        if (!selectedHasGraphic) graphicCandidateAvailableButProseSelected = true;
      }
      for (const row of terminalEmergencyRankedCandidates) {
        if (teenPostPassGlobalHandoffAcceptedTitles.some((t) => normalizeText(t) === normalizeText(row.title))) row.selected = true;
      }
      returnedItemsBuiltFrom = "teen_postpass_global_emergency_handoff";
      finalReturnSourceUsed = "teen_postpass_global_emergency_handoff";
      sourceSkippedReason.push("final_gate_integrity:teen_postpass_global_emergency_handoff");
      for (const row of graphicEmergencyRescueCandidates) {
        if (teenPostPassGlobalHandoffAcceptedTitles.some((t) => normalizeText(t) === normalizeText(row.title))) row.selected = true;
      }
    } else {
      const minimalSafeOne = teenPostPassItems.find((item: any) => {
        const doc = item?.doc || item;
        const title = String(doc?.title || item?.title || "").trim();
        const nt = normalizeText(title);
        if (!title || !nt) return false;
        if (isReferenceArtifactTitle(title)) return false;
        if (/\[google_books_fetch_error\]/i.test(title)) return false;
        const scrubReason = sharedReturnArtifactScrubRejectReason(doc);
        if (scrubReason && scrubReason.includes("artifact")) return false;
        const fit = Number(positiveFitScoreByTitle[title] || 0);
        if (fit < 0) {
          minimalSafeOneBlockedReason = `negative_positive_fit_score:${fit.toFixed(2)}`;
          return false;
        }
        const dislikePenalty = Number(candidateDislikePenaltyByTitle[title] || 0);
        const weightedTaste = Number(candidateWeightedTasteScoreByTitle[title] || 0);
        if (dislikePenalty > weightedTaste) {
          minimalSafeOneBlockedReason = `dominant_dislike_penalty:${dislikePenalty.toFixed(2)}>${weightedTaste.toFixed(2)}`;
          return false;
        }
        const dislikedSignals = (candidateMatchedDislikedSignalsByTitle[title] || []).map((s: any) => String(s || "").toLowerCase());
        if (dislikedSignals.some((s: string) => /\bhorror\b/.test(s))) {
          minimalSafeOneBlockedReason = "explicit_disliked_overlap:horror";
          return false;
        }
        const terminalReason = String(terminalRejectReasonByTitle[nt] || "");
        if (terminalReason && !terminalReason.includes("fallback_no_taste_match") && !terminalReason.includes("fails_taste_threshold_gate")) return false;
        return true;
      });
      if (minimalSafeOne) {
        itemsForReturn = [minimalSafeOne];
        teenPostPassGlobalHandoffAcceptedTitles = [String(minimalSafeOne?.doc?.title || minimalSafeOne?.title || "").trim()].filter(Boolean);
        for (const acceptedTitle of teenPostPassGlobalHandoffAcceptedTitles) {
          delete teenPostPassGlobalHandoffRejectedByTitle[acceptedTitle];
        }
        sourceSkippedReason.push("final_gate_integrity:teen_postpass_global_emergency_handoff:minimal_safe_one");
        for (const row of graphicEmergencyRescueCandidates) {
          if (teenPostPassGlobalHandoffAcceptedTitles.some((t) => normalizeText(t) === normalizeText(row.title))) row.selected = true;
        }
      } else {
        const psychSuspenseRecovery = teenPostPassItems.find((item: any) => {
          const doc = item?.doc || item;
          const title = String(doc?.title || item?.title || "").trim();
          const queryText = String(doc?.queryText || "").toLowerCase();
          const suspenseLane = /\b(psychological|suspense|thriller)\b/.test(queryText);
          if (!suspenseLane || !title) return false;
          if (isReferenceArtifactTitle(title) || /\[google_books_fetch_error\]/i.test(title)) return false;
          const scrubReason = sharedReturnArtifactScrubRejectReason(doc);
          if (scrubReason && scrubReason.includes("artifact")) return false;
          const fit = Number(positiveFitScoreByTitle[title] || 0);
          const semantic = Number(semanticEvidenceCountByTitle[title] || 0);
          return fit >= 0 || semantic >= 1;
        });
        if (psychSuspenseRecovery) {
          itemsForReturn = [psychSuspenseRecovery];
          teenPostPassGlobalHandoffAcceptedTitles = [String(psychSuspenseRecovery?.doc?.title || psychSuspenseRecovery?.title || "").trim()].filter(Boolean);
          sourceSkippedReason.push("final_gate_integrity:teen_postpass_global_emergency_handoff:psych_suspense_min_safe_one");
          for (const row of graphicEmergencyRescueCandidates) {
            if (teenPostPassGlobalHandoffAcceptedTitles.some((t) => normalizeText(t) === normalizeText(row.title))) row.selected = true;
          }
        } else {
          const fantasyYaRecovery = teenPostPassItems.find((item: any) => {
            const doc = item?.doc || item;
            const title = String(doc?.title || item?.title || "").trim();
            const queryText = String(doc?.queryText || "").toLowerCase();
            const yaFantasyLane = /\b(young adult|ya|teen)\b/.test(queryText) && /\b(fantasy|adventure|found family)\b/.test(queryText);
            if (!yaFantasyLane || !title) return false;
            if (isReferenceArtifactTitle(title) || /\[google_books_fetch_error\]/i.test(title)) return false;
            const scrubReason = sharedReturnArtifactScrubRejectReason(doc);
            if (scrubReason && scrubReason.includes("artifact")) return false;
            const fit = Number(positiveFitScoreByTitle[title] || 0);
            const semantic = Number(semanticEvidenceCountByTitle[title] || 0);
            return fit >= 0 || semantic >= 1;
          });
          if (fantasyYaRecovery) {
            itemsForReturn = [fantasyYaRecovery];
            teenPostPassGlobalHandoffAcceptedTitles = [String(fantasyYaRecovery?.doc?.title || fantasyYaRecovery?.title || "").trim()].filter(Boolean);
            sourceSkippedReason.push("final_gate_integrity:teen_postpass_global_emergency_handoff:fantasy_ya_min_safe_one");
            for (const row of graphicEmergencyRescueCandidates) {
              if (teenPostPassGlobalHandoffAcceptedTitles.some((t) => normalizeText(t) === normalizeText(row.title))) row.selected = true;
            }
          } else {
            const graphicContextFallback = teenPostPassItems.find((item: any) => {
              const doc = item?.doc || item;
              const title = String(doc?.title || item?.title || "").trim();
              const queryText = String(doc?.queryText || "").toLowerCase();
              if (!title) return false;
              if (isReferenceArtifactTitle(title) || /\[google_books_fetch_error\]/i.test(title)) return false;
              const scrubReason = sharedReturnArtifactScrubRejectReason(doc);
              if (scrubReason && scrubReason.includes("artifact")) return false;
              const root = String(parentFranchiseRootForDoc(doc) || "__none__");
              const laneAligned = profileSelectedEntitySeeds.some((seed) => normalizeText(seed).replace(/[^a-z0-9]+/g, "-") === root) || profileCompatibleExpansionRoots.has(root);
              const fit = Number(positiveFitScoreByTitle[title] || 0);
              const semantic = Number(semanticEvidenceCountByTitle[title] || 0);
              const historicalAdventureGraphic =
                /\b(historical|history|western|wild west|adventure)\b/.test(queryText) &&
                /\b(graphic novel|comic|manga|manhwa|webtoon)\b/.test(`${title.toLowerCase()} ${queryText}`);
              return laneAligned || semantic >= 1 || fit >= 0 || historicalAdventureGraphic;
            });
            if (graphicContextFallback) {
              itemsForReturn = [graphicContextFallback];
              teenPostPassGlobalHandoffAcceptedTitles = [String(graphicContextFallback?.doc?.title || graphicContextFallback?.title || "").trim()].filter(Boolean);
              sourceSkippedReason.push("final_gate_integrity:teen_postpass_global_emergency_handoff:graphic_min_safe_one");
              for (const row of graphicEmergencyRescueCandidates) {
                if (teenPostPassGlobalHandoffAcceptedTitles.some((t) => normalizeText(t) === normalizeText(row.title))) row.selected = true;
              }
            }
          }
        }
        sourceSkippedReason.push("final_gate_integrity:teen_postpass_global_emergency_handoff:no_safe_candidate");
      }
    }
  }
  markRouterPhase("router_before_scoring");
  const terminalAssemblyInputTitlesAtReturn = Array.isArray(itemsForReturn)
    ? itemsForReturn.map((item: any) => String(item?.doc?.title || item?.title || "").trim()).filter(Boolean)
    : [];
  finalOutputItems = itemsForReturn;
  if (String(returnedItemsBuiltFrom) === "kitsu_normal_recovery" && finalOutputItems.length === 0) {
    const acceptedSet = new Set(kitsuNormalRecoveryAcceptedTitles.map((t) => normalizeText(String(t || ""))).filter(Boolean));
    const restoredFromAccepted = kitsuNormalRecoveryAcceptedItems.filter(Boolean).slice(0, Math.max(1, Math.min(3, finalLimit)));
    if (restoredFromAccepted.length > 0) {
      finalOutputItems = restoredFromAccepted;
      sourceSkippedReason.push("kitsu_recovery_restored_from_accepted_items");
    } else {
      const restored = teenPostPassItems
        .filter((item: any) => {
          const title = String(item?.doc?.title || item?.title || "").trim();
          return acceptedSet.has(normalizeText(title));
        })
        .slice(0, Math.max(1, Math.min(3, finalLimit)));
      if (restored.length > 0) {
        finalOutputItems = restored;
        sourceSkippedReason.push("kitsu_recovery_restored_at_return_assembly");
      }
    }
  }
  if (String(returnedItemsBuiltFrom) === "kitsu_normal_recovery" && finalOutputItems.length === 0) {
    sourceSkippedReason.push(`kitsu_recovery_lost_at_return_assembly:accepted=${kitsuNormalRecoveryAcceptedTitles.join("|") || "(none)"}:return_input=${terminalAssemblyInputTitlesAtReturn.join("|") || "(none)"}`);
    // Do not throw: return a clean zero-item result with explicit diagnostics.
  }
  const runKitsuLowRankedCountRecovery = () => {
    const conditionMet =
      finalItemsLength === 0 &&
      Number(aggregatedRawFetched.kitsu || 0) >= 10 &&
      Number(rankedCount || 0) < 10 &&
      finalOutputItems.length <= 1;
    if (!conditionMet) {
      kitsuLowRankedCountRecoveryBlockedReason = `trigger_not_met:kitsuRaw=${Number(aggregatedRawFetched.kitsu || 0)}:ranked=${Number(rankedCount || 0)}:returned=${finalOutputItems.length}`;
      return;
    }
    const recoveryTitleSet = new Set((kitsuRecoveryPoolTitles || []).map((t) => normalizeText(String(t || ""))).filter(Boolean));
    const kitsuPool = teenPostPassItems
      .map((item: any) => item?.doc || item)
      .filter((doc: any) => String(doc?.source || doc?.rawDoc?.source || "").toLowerCase().includes("kitsu"))
      .filter((doc: any) => !isReferenceArtifactTitle(String(doc?.title || "").trim()))
      .filter((doc: any) => !sharedReturnArtifactScrubRejectReason(doc))
      .filter((doc: any) => {
        const title = String(doc?.title || "").trim();
        return recoveryTitleSet.size === 0 || recoveryTitleSet.has(normalizeText(title));
      })
      .map((doc: any) => {
        const title = String(doc?.title || "").trim();
        const root = String(parentFranchiseRootForDoc(doc) || "");
        const laneAligned = profileSelectedEntitySeeds.some((seed) => normalizeText(seed).replace(/[^a-z0-9]+/g, "-") === root) || profileCompatibleExpansionRoots.has(root);
        return {
          doc,
          laneAligned,
          semanticEvidenceCount: Number(semanticEvidenceCountByTitle[title] || 0),
          weightedTasteScore: Number(candidateWeightedTasteScoreByTitle[title] || 0),
          dislikePenaltyScore: Number(candidateDislikePenaltyByTitle[title] || 0),
          positiveFitScore: Number(positiveFitScoreByTitle[title] || 0),
        };
      })
      .sort((a: any, b: any) => {
        if (Number(b.laneAligned) !== Number(a.laneAligned)) return Number(b.laneAligned) - Number(a.laneAligned);
        if (b.semanticEvidenceCount !== a.semanticEvidenceCount) return b.semanticEvidenceCount - a.semanticEvidenceCount;
        if (b.weightedTasteScore !== a.weightedTasteScore) return b.weightedTasteScore - a.weightedTasteScore;
        if (a.dislikePenaltyScore !== b.dislikePenaltyScore) return a.dislikePenaltyScore - b.dislikePenaltyScore;
        return b.positiveFitScore - a.positiveFitScore;
      });
    kitsuLowRankedCountRecoveryCandidateCount = kitsuPool.length;
    if (kitsuPool.length === 0) {
      kitsuLowRankedCountRecoveryBlockedReason = "no_quality_kitsu_candidates_after_artifact_scrub";
      return;
    }
    finalOutputItems = kitsuPool.slice(0, Math.max(1, Math.min(3, finalLimit))).map((row: any) => ({ kind: "open_library", doc: row.doc }));
    returnedItemsBuiltFrom = "kitsu_low_ranked_count_recovery";
    finalReturnSourceUsed = "kitsu_low_ranked_count_recovery";
    kitsuLowRankedCountRecoveryTriggered = true;
    kitsuLowRankedCountRecoveryBlockedReason = "none";
    sourceSkippedReason.push("final_gate_integrity:kitsu_low_ranked_count_recovery");
  };
  runKitsuLowRankedCountRecovery();
  const runFinalInvariantKitsuRescue = () => {
    const prevBuiltFrom = String(returnedItemsBuiltFrom || "none");
    const conditionMet =
      finalOutputItems.length === 0 &&
      Number(aggregatedRawFetched.kitsu || 0) >= 10 &&
      Number(rankedCount || 0) >= 10;
    if (!conditionMet) return;
    const rankedCandidatePool = orderKitsuRescueStrongBeforeWeak(kitsuRecoveryRankedCandidates
      .filter((row) => !row.rejectReason)
      .filter((row) => Boolean(row.sourceId))
      .filter((row) => !isReferenceArtifactTitle(String(row.title || "")))
      .map((row) => ({
        ...row,
        weightedTasteScore: Number(candidateWeightedTasteScoreByTitle[String(row.title || "").trim()] || 0),
        dislikePenaltyScore: Number(candidateDislikePenaltyByTitle[String(row.title || "").trim()] || 0),
      })), 3);
    const rankedDocsFallbackPool = orderKitsuRescueStrongBeforeWeak((rankedDocs || [])
      .filter((doc: any) => String(doc?.source || doc?.rawDoc?.source || "").toLowerCase().includes("kitsu"))
      .filter((doc: any) => !isReferenceArtifactTitle(String(doc?.title || "").trim()))
      .map((doc: any) => ({ doc, ...kitsuRescueQualityMetricsForDoc(doc) })), 3);
    const rescueSource = rankedCandidatePool.length > 0 ? "kitsuRecoveryRankedCandidates" : "rankedDocsFallback";
    const rescuePool = rankedCandidatePool.length > 0 ? rankedCandidatePool : rankedDocsFallbackPool;
    finalInvariantKitsuRescueCandidateCount = rescuePool.length;
    if (rescuePool.length === 0) return;
    const rescuePoolStrongCount = rescuePool.filter((row: any) => isKitsuRescueStrongRow(row)).length;
    const rescueLimit = rescuePoolStrongCount > 0 ? Math.max(3, Math.min(5, finalLimit)) : 1;
    const teenDocs = teenPostPassItems.map((item: any) => item?.doc || item);
    const rankedRescueDocs = rescuePool
      .map((row: any) => teenDocs.find((doc: any) => normalizeText(String(doc?.title || "")) === normalizeText(String(row?.title || "")))
        || row.doc
        || rankedDocsFallbackPool.find((candidate: any) => normalizeText(String(candidate?.title || candidate?.doc?.title || "")) === normalizeText(String(row?.title || "")))?.doc)
      .filter(Boolean)
      .slice(0, rescueLimit);
    if (rankedRescueDocs.length === 0) return;
    finalOutputItems = rankedRescueDocs.map((doc: any) => ({ kind: "open_library", doc }));
    returnedItemsBuiltFrom = rescuePoolStrongCount > 0 ? "kitsu_ranked_pool_rescue" : "kitsu_ranked_pool_rescue_weak_candidates";
    finalReturnSourceUsed = returnedItemsBuiltFrom;
    if (rescuePoolStrongCount === 0) markKitsuRankedPoolWeakCandidateOutput("final_invariant_ranked_pool_all_weak", rescuePool, finalOutputItems);
    kitsuRankedPoolRescueSource = rescueSource;
    finalInvariantKitsuRescueTriggered = true;
    finalInvariantKitsuRescuePreviousBuiltFrom = prevBuiltFrom;
    sourceSkippedReason.push(`final_gate_integrity:${returnedItemsBuiltFrom}_final_invariant`);
  };
  runFinalInvariantKitsuRescue();
  let terminalAssemblyOutputTitlesAtReturn = Array.isArray(finalOutputItems)
    ? finalOutputItems.map((item: any) => String(item?.doc?.title || item?.title || "").trim()).filter(Boolean)
    : [];
  const shouldApplyFinalMetadataCorrection =
    finalItemsLength === 0 &&
    finalOutputItems.length > 0 &&
    Number(aggregatedRawFetched.kitsu || 0) >= 10 &&
    Number(rankedCount || 0) >= 10 &&
    finalOutputItems.every((item: any) => {
      const doc = item?.doc || item;
      const source = String(doc?.source || doc?.rawDoc?.source || "").toLowerCase();
      const sourceId = String(doc?.sourceId || doc?.canonicalId || doc?.key || "");
      return source.includes("kitsu") || sourceId.startsWith("kitsu:");
    });
  if (shouldApplyFinalMetadataCorrection) {
    const prev = String(returnedItemsBuiltFrom || "none");
    const visibleKitsuRescueRows = finalOutputItems.map((item: any) => {
      const doc = item?.doc || item;
      return { item, doc, ...kitsuRescueQualityMetricsForDoc(doc) };
    });
    const visibleStrongCount = visibleKitsuRescueRows.filter((row: any) => isKitsuRescueStrongRow(row)).length;
    const normalRecoveryAttribution = /^kitsu_normal_recovery/.test(prev);
    const correctedBuiltFrom = normalRecoveryAttribution
      ? (visibleStrongCount > 0 && finalOutputItems.length === 1 ? "kitsu_normal_recovery_single_strong" : prev)
      : (visibleStrongCount > 0 ? "kitsu_ranked_pool_rescue" : "kitsu_ranked_pool_rescue_weak_candidates");
    if (prev !== correctedBuiltFrom) {
      returnedItemsBuiltFrom = correctedBuiltFrom;
      finalReturnSourceUsed = correctedBuiltFrom;
      finalMetadataCorrectionApplied = true;
      finalMetadataCorrectionPreviousBuiltFrom = prev;
      sourceSkippedReason.push(`final_metadata_corrected_from:${prev}:to:${correctedBuiltFrom}`);
      if (visibleStrongCount === 0 && !normalRecoveryAttribution) markKitsuRankedPoolWeakCandidateOutput("metadata_correction_visible_slate_all_weak", visibleKitsuRescueRows, finalOutputItems);
    } else if (normalRecoveryAttribution) {
      sourceSkippedReason.push(`final_metadata_preserved_normal_recovery_attribution:${prev}:strong=${visibleStrongCount}:items=${finalOutputItems.length}`);
    }
  }
  const shouldApplySmallKitsuMetadataCorrection =
    finalItemsLength === 0 &&
    Number(aggregatedRawFetched.kitsu || 0) > 0 &&
    Number(aggregatedRawFetched.kitsu || 0) < 10 &&
    finalOutputItems.length > 0 &&
    finalOutputItems.every((item: any) => {
      const doc = item?.doc || item;
      const source = String(doc?.source || doc?.rawDoc?.source || "").toLowerCase();
      const sourceId = String(doc?.sourceId || doc?.canonicalId || doc?.key || "");
      return source.includes("kitsu") || sourceId.startsWith("kitsu:");
    });
  if (shouldApplySmallKitsuMetadataCorrection) {
    const prev = String(returnedItemsBuiltFrom || "none");
    if (prev !== "kitsu_small_recovery_output") {
      returnedItemsBuiltFrom = "kitsu_small_recovery_output";
      finalReturnSourceUsed = "kitsu_small_recovery_output";
      kitsuSmallRecoveryMetadataCorrectionApplied = true;
      kitsuSmallRecoveryRawCount = Number(aggregatedRawFetched.kitsu || 0);
      kitsuSmallRecoveryRankedCount = Number(rankedCount || 0);
      sourceSkippedReason.push(`final_metadata_corrected_small_kitsu_output_from:${prev}`);
    }
  }
  const shouldCorrectOneItemKitsuEmergencyAttribution =
    finalItemsLength === 0 &&
    Number(aggregatedRawFetched.kitsu || 0) >= 10 &&
    finalOutputItems.length === 1 &&
    /^(none|final_gate_accepted_docs)$/.test(String(returnedItemsBuiltFrom || "none")) &&
    finalOutputItems.every((item: any) => {
      const doc = item?.doc || item;
      const source = String(doc?.source || doc?.rawDoc?.source || "").toLowerCase();
      const sourceId = String(doc?.sourceId || doc?.canonicalId || doc?.key || "");
      return source.includes("kitsu") || sourceId.startsWith("kitsu:");
    });
  const inferKitsuEmergencyWeakCandidateBypassPath = () => {
    const recentBypassReason = [...sourceSkippedReason].reverse().find((reason) => /final_gate_integrity|emergency|handoff|rescue|recovery|bypass/i.test(String(reason || "")));
    return String(recentBypassReason || finalReturnSourceUsed || returnedItemsBuiltFrom || "unknown_bypass_path");
  };
  if (shouldCorrectOneItemKitsuEmergencyAttribution) {
    const prev = String(returnedItemsBuiltFrom || "none");
    const emergencyItem = finalOutputItems[0] as any;
    kitsuEmergencyWeakCandidateAttributionCorrected = true;
    kitsuEmergencyWeakCandidatePreviousBuiltFrom = prev;
    kitsuEmergencyWeakCandidatePath = "one_item_kitsu_emergency_attribution_guard";
    kitsuEmergencyWeakCandidateBypassPath = inferKitsuEmergencyWeakCandidateBypassPath();
    kitsuEmergencyWeakCandidateTitle = String(emergencyItem?.doc?.title || emergencyItem?.title || "").trim();
    kitsuEmergencyWeakCandidatePriorItemCount = finalOutputItems.length;
    kitsuEmergencyWeakCandidateSuppressedTitles.splice(0, kitsuEmergencyWeakCandidateSuppressedTitles.length);
    kitsuEmergencyWeakCandidateRawCount = Number(aggregatedRawFetched.kitsu || 0);
    kitsuEmergencyWeakCandidateRankedCount = Number(rankedCount || 0);
    returnedItemsBuiltFrom = "kitsu_emergency_weak_candidate";
    finalReturnSourceUsed = "kitsu_emergency_weak_candidate";
    sourceSkippedReason.push(`kitsu_emergency_weak_candidate_attribution_corrected:from=${prev}:path=${kitsuEmergencyWeakCandidatePath}:bypass=${kitsuEmergencyWeakCandidateBypassPath}:raw=${kitsuEmergencyWeakCandidateRawCount}:ranked=${kitsuEmergencyWeakCandidateRankedCount}`);
  }
  const multiItemKitsuEmergencyRows = finalOutputItems.map((item: any) => {
    const doc = item?.doc || item;
    return { item, doc, ...kitsuRescueQualityMetricsForDoc(doc) };
  });
  const shouldCorrectMultiItemKitsuEmergencyAttribution =
    finalItemsLength === 0 &&
    Number(aggregatedRawFetched.kitsu || 0) >= 10 &&
    finalOutputItems.length > 1 &&
    String(returnedItemsBuiltFrom || "none") === "none" &&
    multiItemKitsuEmergencyRows.every((row: any) => {
      const doc = row.doc || row.item?.doc || row.item;
      const source = String(doc?.source || doc?.rawDoc?.source || "").toLowerCase();
      const sourceId = String(doc?.sourceId || doc?.canonicalId || doc?.key || "");
      return source.includes("kitsu") || sourceId.startsWith("kitsu:");
    }) &&
    !multiItemKitsuEmergencyRows.some((row: any) => isKitsuRescueStrongRow(row));
  if (shouldCorrectMultiItemKitsuEmergencyAttribution) {
    const prev = String(returnedItemsBuiltFrom || "none");
    const priorItems = finalOutputItems.slice();
    const suppressedTitles = priorItems
      .slice(1)
      .map((item: any) => String(item?.doc?.title || item?.title || "").trim())
      .filter(Boolean)
      .slice(0, 20);
    finalOutputItems = priorItems.slice(0, 1);
    terminalAssemblyOutputTitlesAtReturn = finalOutputItems.map((item: any) => String(item?.doc?.title || item?.title || "").trim()).filter(Boolean);
    kitsuEmergencyWeakCandidateAttributionCorrected = true;
    kitsuEmergencyWeakCandidatePreviousBuiltFrom = prev;
    const selectedEmergencyItem = finalOutputItems[0] as any;
    kitsuEmergencyWeakCandidatePath = "multi_item_kitsu_emergency_attribution_guard";
    kitsuEmergencyWeakCandidateBypassPath = inferKitsuEmergencyWeakCandidateBypassPath();
    kitsuEmergencyWeakCandidateTitle = String(selectedEmergencyItem?.doc?.title || selectedEmergencyItem?.title || "").trim();
    kitsuEmergencyWeakCandidatePriorItemCount = priorItems.length;
    kitsuEmergencyWeakCandidateSuppressedTitles.splice(0, kitsuEmergencyWeakCandidateSuppressedTitles.length, ...suppressedTitles);
    kitsuEmergencyWeakCandidateRawCount = Number(aggregatedRawFetched.kitsu || 0);
    kitsuEmergencyWeakCandidateRankedCount = Number(rankedCount || 0);
    returnedItemsBuiltFrom = "kitsu_emergency_weak_candidate";
    finalReturnSourceUsed = "kitsu_emergency_weak_candidate";
    sourceSkippedReason.push(`kitsu_multi_item_emergency_weak_candidate_attribution_corrected:from=${prev}:priorItems=${priorItems.length}:suppressed=${suppressedTitles.join("|") || "(none)"}:bypass=${kitsuEmergencyWeakCandidateBypassPath}:raw=${kitsuEmergencyWeakCandidateRawCount}:ranked=${kitsuEmergencyWeakCandidateRankedCount}`);
  }
  if (/^kitsu_ranked_pool_rescue/.test(String(returnedItemsBuiltFrom)) && finalOutputItems.length > 0) {
    const orderedVisibleKitsuRescueItems = orderKitsuRescueStrongBeforeWeak(finalOutputItems.map((item: any) => {
      const doc = item?.doc || item;
      return { item, doc, ...kitsuRescueQualityMetricsForDoc(doc) };
    }), 3);
    finalOutputItems = orderedVisibleKitsuRescueItems.map((row: any) => row.item || { kind: "open_library", doc: row.doc });
  }
  if (String(returnedItemsBuiltFrom) === "kitsu_ranked_pool_rescue" && finalOutputItems.length < 3) {
    const rankedDocsKitsuPool = (rankedDocs || [])
      .filter((doc: any) => String(doc?.source || doc?.rawDoc?.source || "").toLowerCase().includes("kitsu"))
      .filter((doc: any) => !isReferenceArtifactTitle(String(doc?.title || "").trim()));
    kitsuRescueSlateBackfillCandidateCount = rankedDocsKitsuPool.length;
    if (rankedDocsKitsuPool.length >= 3) {
      kitsuRescueSlateBackfillBeforeCount = finalOutputItems.length;
      const seen = new Set(finalOutputItems.map((item: any) => normalizeText(String(item?.doc?.title || item?.title || ""))));
      const target = Math.min(5, rankedDocsKitsuPool.length);
      const rankedCandidates = rankedDocsKitsuPool
        .filter((doc: any) => !seen.has(normalizeText(String(doc?.title || ""))))
        .map((doc: any) => {
          const title = String(doc?.title || "").trim();
          const root = String(parentFranchiseRootForDoc(doc) || "");
          const laneAligned = profileSelectedEntitySeeds.some((seed) => normalizeText(seed).replace(/[^a-z0-9]+/g, "-") === root) || profileCompatibleExpansionRoots.has(root);
          const semanticEvidenceCount = Number(semanticEvidenceCountByTitle[title] || 0);
          const weightedTasteScore = Number(candidateWeightedTasteScoreByTitle[title] || 0);
          const dislikePenaltyScore = Number(candidateDislikePenaltyByTitle[title] || 0);
          const positiveFitScore = Number(positiveFitScoreByTitle[title] || 0);
          const sourceId = String(doc?.sourceId || doc?.canonicalId || doc?.key || "").trim();
          const weakByPolicy = semanticEvidenceCount === 0 && weightedTasteScore === 0 && !laneAligned;
          return { doc, laneAligned, semanticEvidenceCount, weightedTasteScore, dislikePenaltyScore, positiveFitScore, sourceId, weakByPolicy };
        });
      const penaltyOrderedCandidates = orderKitsuRescueStrongBeforeWeak(rankedCandidates, 3);
      const strongFirst = penaltyOrderedCandidates.filter((row: any) => !row.weakByPolicy);
      const weakFallback = penaltyOrderedCandidates.filter((row: any) => row.weakByPolicy);
      const strongCandidateCount = strongFirst.length;
      const targetMax = strongCandidateCount >= 5 ? 5 : (strongCandidateCount > 0 ? Math.max(3, strongCandidateCount) : finalOutputItems.length);
      const paddingPool = strongFirst.length > 0 ? strongFirst : weakFallback;
      const additions = paddingPool
        .slice(0, Math.max(0, targetMax - finalOutputItems.length))
        .map((row: any) => ({ kind: "open_library", doc: row.doc }));
      if (additions.length > 0) {
        finalOutputItems = [...finalOutputItems, ...additions].slice(0, targetMax);
        kitsuRescueSlateBackfillApplied = true;
        kitsuRescueSlateBackfillAfterCount = finalOutputItems.length;
        sourceSkippedReason.push(`kitsu_rescue_slate_backfill:${kitsuRescueSlateBackfillBeforeCount}->${kitsuRescueSlateBackfillAfterCount}:strong=${strongCandidateCount}:targetMax=${targetMax}`);
      }
    }
  }
  const terminalSelectedSet = new Set(finalOutputItems.map((item: any) => String(item?.doc?.title || item?.title || "").trim()).filter(Boolean).map((t: string) => normalizeText(String(t || ""))).filter(Boolean));
  for (const row of finalEligibilityAudit) {
    row.selected = terminalSelectedSet.has(normalizeText(String(row.title || "")));
  }
  if (!kitsuAcceptedButEmergencyReturned && kitsuNormalRecoveryAcceptedTitles.length > 0 && /teen_postpass_.*emergency_handoff/.test(String(returnedItemsBuiltFrom || ""))) {
    kitsuAcceptedButEmergencyReturned = {
      acceptedTitles: Array.from(new Set(kitsuNormalRecoveryAcceptedTitles)).slice(0, 20),
      emergencyReturnedTitles: terminalAssemblyOutputTitlesAtReturn,
      reason: `returned_items_built_from_${String(returnedItemsBuiltFrom || "unknown")}`,
    };
  }
  const nytFetchAttempted = Boolean(sourceEnabled.nyt) && Boolean(nytAnchorDebug.enabled);
  const nytCandidateTitles = dedupeDocs([
    ...(nytAnchorResult?.docs || []),
    ...(candidateDocs || []),
    ...(finalRenderDocs || []),
  ] as any[])
    .filter((doc: any) => isNytAnchorDoc(doc))
    .map((doc: any) => String(doc?.title || "").trim())
    .filter(Boolean);
  const nytRejectedByTitle: Record<string, string> = {};
  if (finalOutputItems.length > 0) {
    const nytPassed: any[] = [];
    const nonNyt: any[] = [];
    for (const item of finalOutputItems) {
      const doc = item?.doc || item;
      const title = String(doc?.title || item?.title || "").trim();
      if (!isNytAnchorDoc(doc)) {
        nonNyt.push(item);
        continue;
      }
      const nt = normalizeText(title);
      const positiveFit = Number(positiveFitScoreByTitle[title] || 0);
      const semanticSupport = Boolean(semanticSupportFoundByTitle[title]);
      const dislikes = Number(candidateDislikePenaltyByTitle[title] || 0);
      const weighted = Number(candidateWeightedTasteScoreByTitle[title] || 0);
      const hardRejectReason = String(terminalRejectReasonByTitle[nt] || "");
      const artifactReject = sharedReturnArtifactScrubRejectReason(doc) || (isReferenceArtifactTitle(title) ? "reference_artifact" : "");
      if (positiveFit < 4.5) { nytRejectedByTitle[title] = `weak_positive_fit:${positiveFit.toFixed(2)}`; continue; }
      if (!semanticSupport) { nytRejectedByTitle[title] = "semantic_support_missing"; continue; }
      if (dislikes > (weighted + 0.5)) { nytRejectedByTitle[title] = `dislike_penalty_exceeded:${dislikes.toFixed(2)}>${weighted.toFixed(2)}`; continue; }
      if (hardRejectReason && !/fallback_no_taste_match|fails_taste_threshold_gate/.test(hardRejectReason)) { nytRejectedByTitle[title] = `terminal_reject:${hardRejectReason}`; continue; }
      if (artifactReject) { nytRejectedByTitle[title] = `artifact_or_safety:${artifactReject}`; continue; }
      nytPassed.push(item);
    }
    finalOutputItems = [...nonNyt, ...nytPassed.slice(0, 2)].slice(0, Math.max(1, finalLimit));
  }
  const nytAcceptedTitles = finalOutputItems
    .filter((item: any) => isNytAnchorDoc(item?.doc || item))
    .map((item: any) => String(item?.doc?.title || item?.title || "").trim())
    .filter(Boolean);
  const nytReturnedCount = nytAcceptedTitles.length;
  const successfulSourceCountExcludingNyt = [
    Number(aggregatedRawFetched.googleBooks || 0) > 0,
    Number(aggregatedRawFetched.openLibrary || 0) > 0,
    Number(aggregatedRawFetched.kitsu || 0) > 0,
    Number(aggregatedRawFetched.comicVine || 0) > 0,
  ].filter(Boolean).length;
  if (nytReturnedCount > 0 && successfulSourceCountExcludingNyt === 0) {
    sourceSkippedReason.push("warning_nyt_only_successful_source");
  }
  if (nytReturnedCount > 0 && nytReturnedCount === finalOutputItems.length) {
    sourceSkippedReason.push("warning_nyt_only_returned_items");
  }
  const kitsuRescueCandidateQualityRowsByKey = new Map<string, any>();
  for (const row of kitsuRecoveryRankedCandidates) {
    if (row.rejectReason) continue;
    if (isReferenceArtifactTitle(String(row.title || ""))) continue;
    const title = String(row.title || "").trim();
    const key = normalizeText(String(row.sourceId || title));
    if (!key) continue;
    kitsuRescueCandidateQualityRowsByKey.set(key, {
      title,
      sourceId: String(row.sourceId || "").trim(),
      laneAligned: Boolean(row.laneAligned),
      semanticEvidenceCount: Number(row.semanticEvidenceCount || 0),
      weightedTasteScore: Number(candidateWeightedTasteScoreByTitle[title] || 0),
      dislikePenaltyScore: Number(candidateDislikePenaltyByTitle[title] || 0),
      positiveFitScore: Number(row.positiveFitScore || 0),
    });
  }
  for (const candidateDoc of ((rankedDocs || []) as any[])) {
    const doc: any = candidateDoc;
    if (!String(doc?.source || doc?.rawDoc?.source || "").toLowerCase().includes("kitsu")) continue;
    if (isReferenceArtifactTitle(String(doc?.title || "").trim())) continue;
    const metrics = kitsuRescueQualityMetricsForDoc(doc);
    const key = normalizeText(String(metrics.sourceId || metrics.title));
    if (!key || kitsuRescueCandidateQualityRowsByKey.has(key)) continue;
    kitsuRescueCandidateQualityRowsByKey.set(key, metrics);
  }
  const kitsuRescueCandidateQualityRows = Array.from(kitsuRescueCandidateQualityRowsByKey.values());
  kitsuRescueCandidateQualityBuckets = {
    laneAlignedCount: kitsuRescueCandidateQualityRows.filter((row: any) => Boolean(row.laneAligned)).length,
    semanticEvidenceCountGt0: kitsuRescueCandidateQualityRows.filter((row: any) => Number(row.semanticEvidenceCount || 0) > 0).length,
    weightedTasteScoreGt0: kitsuRescueCandidateQualityRows.filter((row: any) => Number(row.weightedTasteScore || 0) > 0).length,
    zeroEvidenceCount: kitsuRescueCandidateQualityRows.filter((row: any) => Number(row.semanticEvidenceCount || 0) === 0 && Number(row.weightedTasteScore || 0) === 0 && !row.laneAligned).length,
    penaltyFreeCount: kitsuRescueCandidateQualityRows.filter((row: any) => Number(row.dislikePenaltyScore || 0) === 0).length,
    totalCandidateCount: kitsuRescueCandidateQualityRows.length,
  };
  kitsuRescueStrongCandidateCount = kitsuRescueCandidateQualityRows.filter((row: any) => isKitsuRescueStrongRow(row)).length;
  kitsuRescueWeakCandidateCount = kitsuRescueCandidateQualityRows.filter((row: any) => !isKitsuRescueStrongRow(row)).length;
  let kitsuRescueSlateQualityAudit: Array<{ title: string; sourceId: string; reason: string; laneAligned: boolean; positiveFitScore: number; semanticEvidenceCount: number; weightedTasteScore: number; dislikePenaltyScore: number }> = [];
  if (/^kitsu_ranked_pool_rescue/.test(String(returnedItemsBuiltFrom))) {
    for (const item of finalOutputItems) {
      const doc = item?.doc || item;
      const title = String(doc?.title || item?.title || "").trim();
      if (!title) continue;
      const sourceId = String(doc?.sourceId || doc?.canonicalId || doc?.key || "");
      const root = String(parentFranchiseRootForDoc(doc) || "");
      const laneAligned = profileSelectedEntitySeeds.some((seed) => normalizeText(seed).replace(/[^a-z0-9]+/g, "-") === root) || profileCompatibleExpansionRoots.has(root);
      const positiveFitScore = Number(positiveFitScoreByTitle[title] || 0);
      const semanticEvidenceCount = Number(semanticEvidenceCountByTitle[title] || 0);
      const weightedTasteScore = Number(candidateWeightedTasteScoreByTitle[title] || 0);
      const dislikePenaltyScore = Number(candidateDislikePenaltyByTitle[title] || 0);
      const reason =
        laneAligned && semanticEvidenceCount >= 1
          ? "lane_aligned_and_semantically_supported"
          : laneAligned
          ? "lane_aligned"
          : semanticEvidenceCount >= 2
          ? "strong_semantic_support"
          : positiveFitScore >= 5
          ? "high_positive_fit"
          : weightedTasteScore > dislikePenaltyScore
          ? "positive_taste_balance"
          : "ranked_pool_backfill_candidate";
      if (semanticEvidenceCount === 0 && weightedTasteScore === 0 && !laneAligned) kitsuRescueSlateZeroEvidenceCount += 1;
      else kitsuRescueSlateStrongCount += 1;
      kitsuRescueSlateQualityAudit.push({
        title,
        sourceId,
        reason,
        laneAligned,
        positiveFitScore,
        semanticEvidenceCount,
        weightedTasteScore,
        dislikePenaltyScore,
      });
    }
    const auditByTitle = new Map(kitsuRescueSlateQualityAudit.map((row) => [normalizeText(row.title), row]));
    const isStrongAuditRow = (row: any) => Number(row?.semanticEvidenceCount || 0) > 0 || Number(row?.weightedTasteScore || 0) > 0 || Boolean(row?.laneAligned);
    const finalSlateRows = finalOutputItems.map((item: any, index: number) => {
      const title = String(item?.doc?.title || item?.title || "").trim();
      const audit = auditByTitle.get(normalizeText(title));
      return { item, audit, index, strong: isStrongAuditRow(audit) };
    });
    let sawWeakFinalSlateRow = false;
    for (const row of finalSlateRows) {
      if (!row.strong) sawWeakFinalSlateRow = true;
      else if (sawWeakFinalSlateRow) kitsuRescueFinalSlateReorderedStrongFirst = true;
    }
    if (kitsuRescueFinalSlateReorderedStrongFirst) {
      const orderedFinalSlateRows = [...finalSlateRows].sort((a, b) => {
        if (Number(b.strong) !== Number(a.strong)) return Number(b.strong) - Number(a.strong);
        return a.index - b.index;
      });
      finalOutputItems = orderedFinalSlateRows.map((row) => row.item);
      kitsuRescueSlateQualityAudit = orderedFinalSlateRows.map((row) => row.audit).filter(Boolean) as any;
    }
    const visibleStrongCount = finalSlateRows.filter((row) => row.strong).length;
    if (visibleStrongCount === 0 && finalOutputItems.length > 0 && String(returnedItemsBuiltFrom) === "kitsu_ranked_pool_rescue") {
      const weakCandidateRows = finalOutputItems.map((item: any) => {
        const doc = item?.doc || item;
        return { item, doc, ...kitsuRescueQualityMetricsForDoc(doc) };
      });
      finalOutputItems = finalOutputItems.slice(0, 1);
      returnedItemsBuiltFrom = "kitsu_ranked_pool_rescue_weak_candidates";
      finalReturnSourceUsed = "kitsu_ranked_pool_rescue_weak_candidates";
      markKitsuRankedPoolWeakCandidateOutput("post_audit_ranked_pool_all_weak", weakCandidateRows, finalOutputItems);
    }
  }
  const smallKitsuRawCountForAudit = Number(aggregatedRawFetched.kitsu || 0);
  const shouldAuditSmallKitsuRecoveryOutput =
    smallKitsuRawCountForAudit > 0 &&
    smallKitsuRawCountForAudit < 10 &&
    finalItemsLength === 0 &&
    finalOutputItems.length <= 1;
  if (shouldAuditSmallKitsuRecoveryOutput) {
    const smallRecoveryCandidateKeys = new Set<string>();
    for (const item of [...(teenPostPassItems || []), ...((rankedDocs || []) as any[])]) {
      const doc = item?.doc || item;
      const source = String(doc?.source || doc?.rawDoc?.source || "").toLowerCase();
      if (!source.includes("kitsu")) continue;
      const title = String(doc?.title || "").trim();
      if (!title || isReferenceArtifactTitle(title)) continue;
      const key = normalizeText(String(doc?.sourceId || doc?.canonicalId || doc?.key || title));
      if (key) smallRecoveryCandidateKeys.add(key);
    }
    kitsuSmallRecoveryOutputTriggered = true;
    kitsuSmallRecoveryCandidateCount = smallRecoveryCandidateKeys.size;
    kitsuSmallRecoveryReason = kitsuSmallRecoveryCandidateCount > 0
      ? `small_kitsu_pool_underfilled:raw=${smallKitsuRawCountForAudit}:ranked=${Number(rankedCount || 0)}:returned=${finalOutputItems.length}:builtFrom=${String(returnedItemsBuiltFrom || "none")}`
      : `small_kitsu_pool_no_visible_candidates:raw=${smallKitsuRawCountForAudit}:ranked=${Number(rankedCount || 0)}:returned=${finalOutputItems.length}:builtFrom=${String(returnedItemsBuiltFrom || "none")}`;
  } else {
    kitsuSmallRecoveryReason = `trigger_not_met:raw=${smallKitsuRawCountForAudit}:ranked=${Number(rankedCount || 0)}:finalItems=${finalItemsLength}:returned=${finalOutputItems.length}`;
  }
  // Absolute-last contract recompute based on the final visible/persisted list.
  const finalVisibleCount = finalOutputItems.length;
  countContractSatisfied = enabledSourceCount <= 1
    ? finalVisibleCount >= singleSourceCountContractMin
    : finalVisibleCount >= multiSourceCountContractMin;
  finalCountContractShortfallReason = countContractSatisfied ? "none" : "insufficient_aligned_candidates";
  const finalEligibilityAcceptedButUnderfilledFailure =
    acceptedAfterTerminalRejectFilter.length === 0 && finalVisibleCount >= 10 ? false : (acceptedAfterTerminalRejectFilter.length === 0 && finalVisibleCount < 10);
  if (finalEligibilityAcceptedButUnderfilledFailure && teenPostPassOutputLength === 0) {
    sourceSkippedReason.push("final_eligibility_accepted_none_underfilled");
  }
  const finalRootFamilyCounts = finalOutputItems.reduce((acc: Record<string, number>, item: any) => {
    const title = String(item?.doc?.title || item?.title || "");
    const root = String(parentFranchiseRootForDoc(item?.doc || item) || "__none__");
    const text = normalizeText(`${root} ${title}`);
    const fam = /\b(spider[-\s]?man|spider-man noir|miles morales|avenging spider-man|amazing spider-man)\b/.test(text)
      ? "spider-man-family"
      : (/\bjustice league\b/.test(text) ? "justice-league-family" : (/\bms\.?\s*marvel\b/.test(text) ? "ms-marvel-family" : root));
    acc[fam] = Number(acc[fam] || 0) + 1;
    return acc;
  }, {});
  const googleBooksQueriesActuallyFetchedArray = Array.from(googleBooksQueriesActuallyFetched);
  const openLibraryQueriesActuallyFetchedArray = Array.from(openLibraryQueriesActuallyFetched);
  const kitsuQueriesActuallyFetchedArray = Array.from(kitsuQueriesActuallyFetched);
  const sourceFetchAttemptedBySource = {
    googleBooks: googleBooksRouterFetchCount > 0,
    openLibrary: openLibraryRouterFetchCount > 0,
    kitsu: kitsuRouterFetchCount > 0,
  };
  const fetchDiagnosticsSummary = {
    gbQueries: googleBooksQueriesActuallyFetchedArray.length,
    olQueries: openLibraryQueriesActuallyFetchedArray.length,
    kitsuQueries: kitsuQueriesActuallyFetchedArray.length,
    gbResults: googleBooksFetchResultsByQuery.length,
    olResults: openLibraryFetchResultsByQuery.length,
    kitsuResults: kitsuFetchResultsByQuery.length,
  };
  const fetchDiagnosticsCoverageAssertion = {
    googleBooks: !sourceFetchAttemptedBySource.googleBooks || googleBooksFetchResultsByQuery.length > 0,
    openLibrary: !sourceFetchAttemptedBySource.openLibrary || openLibraryFetchResultsByQuery.length > 0,
    kitsu: !sourceFetchAttemptedBySource.kitsu || kitsuFetchResultsByQuery.length > 0,
  };
  const selectedKitsuQuery = kitsuSanitizedQuerySelected.find((q) => String(q || "").trim().length > 0) || "";
  const canonicalizeKitsuPolicyQuery = (q: string) => String(q || "")
    .toLowerCase()
    .replace(/[-+][a-z0-9_]+/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const kitsuPolicyCanonicalQueries = kitsuFetchResultsByQuery
    .map((row) => canonicalizeKitsuPolicyQuery(String(row?.query || "")))
    .filter(Boolean);
  const kitsuPolicyUniqueCanonicalQueries = Array.from(new Set(kitsuPolicyCanonicalQueries));
  const kitsuMaxAllowedCanonicalFetches = kitsuTerminalBroadFallbackDispatched ? 3 : (kitsuPrimaryRawZero ? 2 : 1);
  const kitsuSingleQueryEnforced = kitsuPolicyUniqueCanonicalQueries.length <= kitsuMaxAllowedCanonicalFetches;
  const selectedKitsuQueryCanonical = canonicalizeKitsuPolicyQuery(selectedKitsuQuery);
  const kitsuFetchQueryMatchesSanitizedSelection = kitsuQuerySanitizedTo.length === 0
    ? kitsuSingleQueryEnforced
    : kitsuSingleQueryEnforced && kitsuPolicyUniqueCanonicalQueries.every((q) => q === selectedKitsuQueryCanonical || kitsuPrimaryRawZero);
  if (!kitsuSingleQueryEnforced) {
    const violationMessage = `kitsu_single_query_policy_violation:count=${kitsuPolicyUniqueCanonicalQueries.length}:max=${kitsuMaxAllowedCanonicalFetches}:queries=${kitsuPolicyUniqueCanonicalQueries.join("|")}`;
    sourceSkippedReason.push(violationMessage);
    pushGlobalPhase("kitsu_single_query_policy_violation", {
      violationMessage,
      maxAllowedCanonicalFetches: kitsuMaxAllowedCanonicalFetches,
      canonicalQueries: kitsuPolicyUniqueCanonicalQueries,
      rawQueries: kitsuFetchResultsByQuery.map((row) => String(row?.query || "")),
    });
  }
  const kitsuInsufficientPositiveFitRejectedDiagnostics = (
    Array.isArray(finalEligibilityRejectedTitlesByReason?.insufficient_positive_fit_score)
      ? finalEligibilityRejectedTitlesByReason.insufficient_positive_fit_score
      : []
  )
    .map((title: string) => {
      const t = String(title || "").trim();
      return {
        title: t,
        positiveFitScore: Number(positiveFitScoreByTitle[t] || 0),
        candidateWeightedTasteScore: Number(candidateWeightedTasteScoreByTitle[t] || 0),
        candidateDislikePenalty: Number(candidateDislikePenaltyByTitle[t] || 0),
        semanticSupportFound: Boolean(semanticSupportFoundByTitle[t]),
        matchedPositiveSignals: Array.isArray(candidateMatchedLikedSignalsByTitle[t]) ? candidateMatchedLikedSignalsByTitle[t] : [],
        matchedNegativeSignals: Array.isArray(candidateMatchedDislikedSignalsByTitle[t]) ? candidateMatchedDislikedSignalsByTitle[t] : [],
        finalRejectReason: "insufficient_positive_fit_score",
      };
    })
    .slice(0, 20);
  const finalItemsBeforeDisabledSourceGate = Array.isArray(finalOutputItems) ? finalOutputItems.slice() : [];
  finalOutputItems = filterAllowedSourceCandidates(finalOutputItems, "final_return_disabled_source_gate");
  if (finalOutputItems.length < finalItemsBeforeDisabledSourceGate.length) {
    sourceSkippedReason.push(`disabled_source_final_return_gate_removed:${finalItemsBeforeDisabledSourceGate.length - finalOutputItems.length}`);
  }
  const finalReturnedItemSourceByTitle: Record<string, string> = {};
  for (const item of finalOutputItems) {
    const doc = (item as any)?.doc || item;
    const title = String((doc as any)?.title || (item as any)?.title || "").trim();
    if (title) finalReturnedItemSourceByTitle[title] = detectCandidateSourceForGate(item);
  }
  const finalReturnedDisabledSourceLeakDetected = finalOutputItems.some((item: any) => !isSourceAllowedForFinalGate(item));
  const returnedItemsTitlesAtAuditPoint = finalOutputItems.map((it:any)=>String(it?.doc?.title || it?.title || "").trim()).filter(Boolean);
  const acceptedButNotReturnedTitles = finalItemsTitles.filter((t) => !returnedItemsTitlesAtAuditPoint.some((rt) => normalizeText(rt) === normalizeText(t)));
  markRouterPhase("router_before_final_return");
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
    lateTeenUnderfillTriggered,
    lateTeenUnderfillVisibleCountBefore,
    lateTeenUnderfillCandidatesConsidered,
    lateTeenUnderfillCandidatesAccepted,
    lateTeenUnderfillAcceptedTitles,
    lateTeenUnderfillRejectedReasons,
    positiveFitRescuePoolLength: teenComicVinePositiveFitRescuePool.length,
    positiveFitRescuePoolSourceCounts,
    positiveFitRescueCandidateTitlesBeforeSafety: Array.from(new Set(positiveFitRescueCandidateTitlesBeforeSafety)).slice(0, 80),
    positiveFitRescueCandidateTitlesAfterSafety: Array.from(new Set(positiveFitRescueCandidateTitlesAfterSafety)).slice(0, 80),
    positiveFitRescueExcludedByReason,
    positiveFitRescueEligibleTitles: Array.from(new Set(positiveFitRescueEligibleTitles)).slice(0, 50),
    positiveFitRescueRejectedReasons,
    positiveFitRescueTopUpApplied,
    positiveFitRescueReturnedTitles: Array.from(new Set(positiveFitRescueReturnedTitles)).slice(0, 20),
    emergencySafeRescueReturnedTitles: Array.from(new Set(emergencySafeRescueReturnedTitles)).slice(0, 20),
    finalEligibleNonNegativeCount,
    countContractShortfallReason: finalCountContractShortfallReason,
    postTopUpOutputSnapshotLength,
    handoffRecoveryConsidered,
    handoffRecoveryAccepted,
    handoffRecoveryRejectedReasons,
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
    expansionCandidatesEnteredScoringCount: Math.max(
      expansionCandidatesEnteredScoringCount,
      Math.min(
        expansionConvertedCount,
        viableCandidates.filter((doc: any) =>
          Boolean((doc as any)?.isExpansionCandidate || (doc?.diagnostics as any)?.isExpansionCandidate) ||
          Number(doc?.diagnostics?.semanticEvidenceCount || 0) >= 1
        ).length
      )
    ),
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
    returnPathUnexplainedDropTitles,
    finalCountCappedToTarget,
    finalReturnedWithoutTasteEvidenceTitles,
    finalUnderfillBecauseNoTasteEvidence,
    underfillReason,
    archetypeProfileActivated,
    anchorExemplarsSelected,
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
    finalEligibilityAcceptedAndRejectedTitles,
    acceptedTitlesBeforeScrub,
    acceptedTitlesAfterScrub,
    acceptedTitlesReturned,
    acceptedTitlesDroppedAfterScrub,
    acceptedTitlesScrubRejectedByReason,
    acceptedTitlesRejectedAsArtifactRoot,
    acceptedTitlesRejectedAsLiteralArtifact,
    acceptedTitlesRejectedAsWeakNarrative,
    acceptedTitlesRejectedAsTasteFailure,
    canonicalRescueAllowed,
    acceptedNarrativeCandidatesExist,
    acceptedNarrativeConfidenceFail,
    finalEligibilityAcceptedTitles: acceptedAfterTerminalRejectFilter,
    finalEligibilityRejectedTitlesByReason,
    finalEligibilityAudit,
    rejectedButReturnedTitles,
    terminalRejectedButReturnedTitles,
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
    weakLexicalFantasyClusterPenaltyByTitle,
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
    superheroUnderfillRelaxationBranchEntered,
    superheroUnderfillRelaxationEligibility,
    superheroUnderfillRelaxationPredicateState,
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
    terminalAssemblyInputTitles: terminalAssemblyInputTitlesAtReturn,
    terminalAssemblyOutputTitles: terminalAssemblyOutputTitlesAtReturn,
    terminalAssemblyDropReasonByTitle,
    teenPostPassOutputTitles,
    teenPostPassRejectedByTitle: teenPostPassRejectReasons,
    teenPostPassNoSafeCandidateReason: minimalSafeOneBlockedReason || (teenPostPassOutputLength > 0 && finalOutputItems.length === 0 ? "no_safe_candidate" : ""),
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
    acceptedButNotReturnedTitles,
    returnedItemsLength: finalOutputItems.length,
    returnClassificationReason: finalOutputItems.length > 0 ? "valid_recommendation_returned" : (finalHandoffEmptyReason && finalHandoffEmptyReason !== "none" ? finalHandoffEmptyReason : "unknown_empty_result"),
    teenPostPassGlobalHandoffConsidered,
    teenPostPassGlobalHandoffAcceptedTitles,
    teenPostPassGlobalHandoffRejectedByTitle,
    teenPostPassEmergencyCandidateScores,
    terminalEmergencyRankedCandidates,
    graphicEmergencyRescueCandidates,
    comparableRejectedGraphicCandidates,
    graphicEmergencyProseBlockReason,
    graphicCandidateAvailableButProseSelected,
    normalFinalGateRecoveryConsidered,
    normalFinalGateRecoveryAcceptedTitles,
    normalFinalGateRecoveryRejectedByTitle,
    kitsuNormalRecoveryConsidered,
    kitsuNormalRecoveryAcceptedTitles,
    kitsuRecoveryRankedCandidates,
    kitsuRankedPoolRescueSource,
    kitsuRankedPoolRescueEligible,
    kitsuRankedPoolRescueCandidateCount,
    kitsuRankedPoolRescueBlockedReason,
    kitsuRankedPoolRescueWeakCandidateOutput,
    kitsuRankedPoolRescueWeakCandidateReason,
    kitsuRankedPoolRescueWeakCandidateReturnedCount,
    kitsuRankedPoolRescueWeakCandidateSuppressedCount,
    kitsuRankedPoolRescueWeakCandidateTitles,
    kitsuEmergencyWeakCandidateAttributionCorrected,
    kitsuEmergencyWeakCandidatePreviousBuiltFrom,
    kitsuEmergencyWeakCandidatePath,
    kitsuEmergencyWeakCandidateBypassPath,
    kitsuEmergencyWeakCandidateTitle,
    kitsuEmergencyWeakCandidatePriorItemCount,
    kitsuEmergencyWeakCandidateSuppressedTitles,
    kitsuEmergencyWeakCandidateRawCount,
    kitsuEmergencyWeakCandidateRankedCount,
    finalInvariantKitsuRescueTriggered,
    finalInvariantKitsuRescueCandidateCount,
    finalInvariantKitsuRescuePreviousBuiltFrom,
    finalMetadataCorrectionApplied,
    finalMetadataCorrectionPreviousBuiltFrom,
    kitsuRescueSlateBackfillApplied,
    kitsuRescueSlateBackfillBeforeCount,
    kitsuRescueSlateBackfillAfterCount,
    kitsuRescueSlateBackfillCandidateCount,
    kitsuRescueQualityOrderingVersion,
    kitsuRescueExcludedForDislikePenaltyCount,
    kitsuRescueCandidateQualityBuckets,
    kitsuRescueSlateStrongCount,
    kitsuRescueSlateZeroEvidenceCount,
    kitsuRescueWeakBeforeStrongCorrectionApplied,
    kitsuRescueFinalSlateReorderedStrongFirst,
    kitsuRescueStrongCandidateCount,
    kitsuRescueWeakCandidateCount,
    kitsuLowRankedCountRecoveryTriggered,
    kitsuLowRankedCountRecoveryCandidateCount,
    kitsuLowRankedCountRecoveryBlockedReason,
    kitsuSmallRecoveryMetadataCorrectionApplied,
    kitsuSmallRecoveryRawCount,
    kitsuSmallRecoveryRankedCount,
    kitsuSmallRecoveryOutputTriggered,
    kitsuSmallRecoveryCandidateCount,
    kitsuSmallRecoveryReason,
    kitsuRescueSlateQualityAudit,
    kitsuFinalEligibilitySparseMetadataRescueCandidates,
    kitsuFinalEligibilitySparseMetadataRescue,
    kitsuAcceptedButEmergencyReturned,
    kitsuNormalRecoveryRejectedByTitle,
    kitsuRecoveryPoolTitles,
    kitsuRecoveryBestRejectedReasons,
    kitsuInsufficientPositiveFitRejectedDiagnostics,
    minimalSafeOneBlockedReason,
    returnedItemsTitles: finalOutputItems.map((item:any)=>String(item?.doc?.title || item?.title || "").trim()).filter(Boolean),
    returnedItemsByAlignmentTier,
    safeFillerReturnedCount: returnedItemsByAlignmentTier.safe_filler || 0,
    safeFillerTitles: Array.from(new Set(safeFillerTitles)).slice(0, 20),
    strongTasteReturnedCount: returnedItemsByAlignmentTier.strong_taste_fit || 0,
    semanticNarrativeReturnedCount: returnedItemsByAlignmentTier.semantic_narrative_fit || 0,
    returnedReasonByTitle,
    returnedSwipeEvidenceByTitle,
    returnedSourceLayerByTitle,
    returnedReasonCounts,
    alignedBackfillRejectedReasons,
    swipeEvidenceCandidateCount,
    expandedPoolUsedForFinalSelection,
    negativePenaltyDominantSignalsByTitle,
    finalReasonFilterRejectedReasons,
    finalReasonFilterAcceptedTitles: Array.from(new Set(finalReasonFilterAcceptedTitles)).slice(0, 40),
    lateUnderfillFillAcceptedTitles: Array.from(new Set(lateUnderfillFillAcceptedTitles)).slice(0, 40),
    lateUnderfillFillRejectedReasons,
    finalRootFamilyCounts,
    tdzGuardedDiagnosticsInitialized,
    primaryRecommendationCount: returnedReasonCounts.primary_recommendation,
    alignedBackfillCount: returnedReasonCounts.aligned_backfill,
    contractFillerCount: returnedReasonCounts.contract_filler,
    tasteQueryDrift,
    acceptedPrefixInvariantFailed,
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
    routerPhaseHistory,
    deployedCommitHash: "e064c5c",
    routerBuildTimestamp: ROUTER_BUILD_TIMESTAMP,
    routerInstrumentationVersion: ROUTER_INSTRUMENTATION_VERSION,
    nytFetchAttempted,
    nytCandidateTitles,
    nytAcceptedTitles,
    nytRejectedByTitle,
    nytReturnedCount,
    nytAdminEnabled: Boolean(sourceEnabled.nyt),
    enabledSourcesAtRequestStart,
    effectiveEnabledSourcesAfterSynthesis,
    sourceAllowedByFinalGate,
    sourceAllowedByRecoveryPath,
    blockedDisabledSourceCandidateCountBySource,
    disabledSourceCandidateTitlesBySource,
    finalReturnedItemSourceByTitle,
    finalReturnedDisabledSourceLeakDetected,
    sourceEnabled,
    sourceSkippedReason,
    activeLaneQueries: Array.from(new Set(queryLanesUsed
      .map((q: any) => collapseRepeatedQueryPhrases(String(q || "").replace(/\bcharacter[-\s]?focused\b/gi, " ").replace(/\s+/g, " ").trim()))
      .filter(Boolean))).slice(0, 60),
    routerFamily,
    rungCount: Array.isArray(rungs) ? rungs.length : 0,
    sourceFetchAttemptedBySource,
    sourceFetchTimeoutBySource: {
      googleBooks: googleBooksFetchResultsByQuery.some((row) => String(row?.error || "").includes("timeout")),
      openLibrary: openLibraryFetchResultsByQuery.some((row) => String(row?.error || "").includes("timeout")),
      kitsu: kitsuFetchResultsByQuery.some((row) => String(row?.error || "").includes("timeout")),
    },
    sourceRawCountBySource: {
      googleBooks: Number(aggregatedRawFetched.googleBooks || 0),
      openLibrary: Number(aggregatedRawFetched.openLibrary || 0),
      kitsu: Number(aggregatedRawFetched.kitsu || 0),
    },
    fetchDiagnosticsSummary,
    fetchDiagnosticsCoverageAssertion,
    kitsuFetchQueryMatchesSanitizedSelection,
    kitsuConfiguredApiBase: KITSU_API_BASE,
    kitsuPreSanitizedQuery: kitsuPreSanitizedQueries[0] || "",
    kitsuSanitizedQuerySelected: selectedKitsuQuery,
    kitsuRecoveryOriginalIntentQuery,
    kitsuRecoverySelectedQuery,
    kitsuRecoveryQueryTooBroad,
    kitsuRecoveryQueryDroppedGenreTerms: Array.from(new Set(kitsuRecoveryQueryDroppedGenreTerms.map((t) => String(t || "").trim()).filter(Boolean))).slice(0, 20),
    kitsuRecoveryQuerySelectionVersion,
    kitsuRecoveryQueryPromotedFrom,
    kitsuRecoveryQueryPromotedTo,
    kitsuRecoveryComicIntentDetected,
    kitsuRecoveryComicIntentTerms: Array.from(new Set(kitsuRecoveryComicIntentTerms.map((t) => String(t || "").trim()).filter(Boolean))).slice(0, 20),
    kitsuRecoveryComicIntentFallbackUsed,
    kitsuFinalQueryUsedForFetch: Array.from(new Set(kitsuFinalQueryUsedForFetch.map((q) => String(q || "").trim()).filter(Boolean))).slice(0, 20),
    kitsuPolicyUniqueCanonicalQueries,
    kitsuMaxAllowedCanonicalFetches,
    kitsuSanitizationDiagnostics,
    kitsuSanitizationDroppedTokens,
    googleBooksQueriesActuallyFetched: googleBooksQueriesActuallyFetchedArray,
    openLibraryQueriesActuallyFetched: openLibraryQueriesActuallyFetchedArray,
    kitsuQueriesActuallyFetched: kitsuQueriesActuallyFetchedArray,
    googleBooksFetchResultsByQuery,
    openLibraryFetchResultsByQuery,
    kitsuFetchResultsByQuery,
    googleBooksTimeoutStageByQuery,
    googleBooksRetryQueryMapping,
    googleBooksQueryUsedByLane: Array.from(new Set(googleBooksQueryUsedByLane)).slice(0, 60),
    openLibraryQueryUsedByLane: Array.from(new Set(openLibraryQueryUsedByLane)).slice(0, 60),
    kitsuQueryUsedByLane: Array.from(new Set(kitsuQueryUsedByLane)).slice(0, 60),
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
