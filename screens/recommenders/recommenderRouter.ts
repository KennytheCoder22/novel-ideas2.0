import type { EngineId, RecommenderInput, RecommendationResult, DomainMode, RecommendationDoc } from "./types";
import { getGoogleBooksRecommendations } from "./googleBooks/googleBooksRecommender";
import { getOpenLibraryRecommendations } from "./openLibrary/openLibraryRecommender";
import { getKitsuMangaRecommendations } from "./kitsu/kitsuMangaRecommender";
import { getGcdGraphicNovelRecommendations } from "./gcd/gcdGraphicNovelRecommender";
import { normalizeCandidates, type CandidateSource } from "./normalizeCandidate";
import { finalRecommenderForDeck } from "./finalRecommender";
import { getHardcoverRatings } from "../../services/hardcover/hardcoverRatings";
import { buildBucketPlanFromTaste } from "./buildBucketPlanFromTaste";
import { buildDescriptiveQueriesFromTaste } from "./buildDescriptiveQueriesFromTaste";

export type EngineOverride = EngineId | "auto";
type RecommenderDebugSourceStats = { rawFetched: number; postFilterCandidates: number; finalSelected: number; };

function dedupeNonEmptyQueries(values: Array<string | undefined | null>): string[] {
  const seen = new Set<string>(); const out: string[] = [];
  for (const value of values) {
    const cleaned = String(value || "").replace(/\s+/g, " ").trim();
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key); out.push(cleaned);
  }
  return out;
}
function buildRouterBucketPlan(input: RecommenderInput) {
  const descriptivePlan = buildDescriptiveQueriesFromTaste(input);
  const translatedBucketPlan = buildBucketPlanFromTaste(input);
  const primaryQueries = Array.isArray(translatedBucketPlan?.queries) ? translatedBucketPlan.queries : [];
  const secondaryQueries = Array.isArray(descriptivePlan?.queries) ? descriptivePlan.queries : [];
  const queries = dedupeNonEmptyQueries([...primaryQueries, ...secondaryQueries.slice(0, 1)]);
  return {
    rungs: translatedBucketPlan?.rungs || [],
    queries,
    preview: translatedBucketPlan?.preview || primaryQueries[0] || descriptivePlan?.preview || secondaryQueries[0] || "",
    strategy: translatedBucketPlan?.strategy && descriptivePlan?.strategy ? `${translatedBucketPlan.strategy}+${descriptivePlan.strategy}` : translatedBucketPlan?.strategy || descriptivePlan?.strategy || "router-bucket-plan",
    signals: descriptivePlan?.signals,
  };
}
function chooseEngine(input: RecommenderInput, override?: EngineOverride): EngineId {
  if (override && override !== "auto") return override;
  if (input.deckKey === "k2") return "openLibrary";
  return "googleBooks";
}
function teenVisualSignalWeight(tagCounts: RecommenderInput["tagCounts"] | undefined): number {
  return Number(tagCounts?.["topic:manga"] || 0) + Number(tagCounts?.["media:anime"] || 0) + Number(tagCounts?.["format:graphic_novel"] || 0) + Number(tagCounts?.["format:graphic novel"] || 0) + Number(tagCounts?.["genre:superheroes"] || 0);
}
function shouldUseKitsu(input: RecommenderInput): boolean { return input.deckKey === "ms_hs" && teenVisualSignalWeight(input.tagCounts) >= 1; }
function shouldUseGcd(input: RecommenderInput): boolean { return input.deckKey === "ms_hs" && teenVisualSignalWeight(input.tagCounts) >= 1; }

function extractDocs(result: RecommendationResult | null | undefined, fallbackSource: CandidateSource): RecommendationDoc[] {
  if (!result) return [];
  const itemDocs = Array.isArray((result as any).items) ? (result as any).items.map((item: any) => item?.doc ? { ...item.doc, source: item.doc?.source || fallbackSource } : null).filter(Boolean) : [];
  const recommendations = Array.isArray((result as any).recommendations) ? (result as any).recommendations.map((doc: any) => doc ? { ...doc, source: doc?.source || fallbackSource } : null).filter(Boolean) : [];
  const docs = Array.isArray((result as any).docs) ? (result as any).docs.map((doc: any) => doc ? { ...doc, source: doc?.source || fallbackSource } : null).filter(Boolean) : [];
  return [...itemDocs, ...recommendations, ...docs].filter((doc: any) => doc && typeof doc === "object" && typeof doc.title === "string" && doc.title.trim());
}
function sourceForDoc(doc: any, fallbackSource: CandidateSource): CandidateSource {
  return doc?.source === "googleBooks" || doc?.source === "openLibrary" || doc?.source === "kitsu" || doc?.source === "gcd" ? doc.source : fallbackSource;
}
function dedupeDocs(docs: RecommendationDoc[]): RecommendationDoc[] {
  const seen = new Set<string>(); const out: RecommendationDoc[] = [];
  for (const doc of docs) {
    const title = String((doc as any)?.title || "").trim().toLowerCase();
    const author = Array.isArray((doc as any)?.author_name) && (doc as any).author_name.length > 0 ? String((doc as any).author_name[0] || "").trim().toLowerCase() : String((doc as any)?.author || "").trim().toLowerCase();
    const key = String((doc as any)?.key || (doc as any)?.id || "").trim().toLowerCase() || `${title}|${author}`;
    if (!key || seen.has(key)) continue;
    seen.add(key); out.push(doc);
  }
  return out;
}
function countResultItems(result: RecommendationResult | null | undefined): number {
  if (!result) return 0;
  if (Array.isArray((result as any).items)) return (result as any).items.length;
  if (Array.isArray((result as any).recommendations)) return (result as any).recommendations.length;
  if (Array.isArray((result as any).docs)) return (result as any).docs.length;
  return 0;
}
function attachHardcoverFailureMarker(doc: RecommendationDoc): RecommendationDoc {
  return { ...doc, hardcover: { ...(doc as any)?.hardcover, failed: true } } as any;
}
async function enrichWithHardcover(docs: RecommendationDoc[]): Promise<RecommendationDoc[]> {
  return Promise.all(docs.map(async (doc) => {
    try {
      const title = doc.title;
      const author = Array.isArray(doc.author_name) ? doc.author_name[0] : undefined;
      if (!title) return doc;
      const data = await getHardcoverRatings(title, author);
      if (!data) return doc;
      return { ...doc, hardcover: { rating: data.rating, ratings_count: data.ratings_count } } as any;
    } catch { return attachHardcoverFailureMarker(doc); }
  }));
}
async function runEngine(engine: EngineId, input: RecommenderInput): Promise<RecommendationResult> {
  if (engine === "googleBooks") return getGoogleBooksRecommendations(input);
  const domainModeOverride: DomainMode | undefined = input.deckKey === "k2" ? (input.domainModeOverride ?? "chapterMiddle") : input.domainModeOverride;
  const routedInput: RecommenderInput = domainModeOverride === input.domainModeOverride ? input : { ...input, domainModeOverride };
  if (engine === "openLibrary") return getOpenLibraryRecommendations(routedInput);
  if (engine === "kitsu") return getKitsuMangaRecommendations(routedInput);
  return getGcdGraphicNovelRecommendations(routedInput);
}
async function fetchBothEngines(input: RecommenderInput): Promise<{ google: RecommendationResult | null; openLibrary: RecommendationResult | null; kitsu: RecommendationResult | null; gcd: RecommendationResult | null; mergedDocs: RecommendationDoc[]; }> {
  const requests: Array<Promise<RecommendationResult>> = [runEngine("googleBooks", input), runEngine("openLibrary", input)];
  const includeKitsu = shouldUseKitsu(input); const includeGcd = shouldUseGcd(input);
  if (includeKitsu) requests.push(getKitsuMangaRecommendations(input));
  if (includeGcd) requests.push(getGcdGraphicNovelRecommendations(input));
  const results = await Promise.allSettled(requests);
  const google = results[0]?.status === "fulfilled" ? results[0].value : null;
  const openLibrary = results[1]?.status === "fulfilled" ? results[1].value : null;
  const kitsuIndex = includeKitsu ? 2 : -1;
  const gcdIndex = includeGcd ? (includeKitsu ? 3 : 2) : -1;
  const kitsu = kitsuIndex >= 0 && results[kitsuIndex]?.status === "fulfilled" ? results[kitsuIndex].value : null;
  const gcd = gcdIndex >= 0 && results[gcdIndex]?.status === "fulfilled" ? results[gcdIndex].value : null;
  const mergedDocs = dedupeDocs([...dedupeDocs(extractDocs(google, "googleBooks")), ...dedupeDocs(extractDocs(openLibrary, "openLibrary")), ...dedupeDocs(extractDocs(kitsu, "kitsu")), ...dedupeDocs(extractDocs(gcd, "gcd"))]);
  return { google, openLibrary, kitsu, gcd, mergedDocs };
}
export async function getRecommendations(input: RecommenderInput, override?: EngineOverride): Promise<RecommendationResult> {
  const preferredEngine = chooseEngine(input, override);
  const bucketPlan = buildRouterBucketPlan(input);
  const routedInput: RecommenderInput = { ...input, bucketPlan };
  const includeKitsu = shouldUseKitsu(routedInput);
  const includeGcd = shouldUseGcd(routedInput);
  const { google, openLibrary, kitsu, gcd, mergedDocs } = await fetchBothEngines(routedInput);
  const enrichedDocs = await enrichWithHardcover(mergedDocs);
  const googleCandidates = normalizeCandidates(enrichedDocs.filter((doc: any) => sourceForDoc(doc, "googleBooks") === "googleBooks"), "googleBooks");
  const openLibraryCandidates = normalizeCandidates(enrichedDocs.filter((doc: any) => sourceForDoc(doc, "openLibrary") === "openLibrary"), "openLibrary");
  const kitsuCandidatesRaw = normalizeCandidates(enrichedDocs.filter((doc: any) => sourceForDoc(doc, "kitsu") === "kitsu"), "kitsu");
  const gcdCandidates = normalizeCandidates(enrichedDocs.filter((doc: any) => sourceForDoc(doc, "gcd") === "gcd"), "gcd");
  const seenTitles = new Set<string>();
  const kitsuCandidates = kitsuCandidatesRaw.filter((c) => { const title = (c.title || "").toLowerCase().trim(); if (!title || seenTitles.has(title)) return false; seenTitles.add(title); return true; });
  const normalizedCandidates = [...googleCandidates, ...openLibraryCandidates, ...(includeKitsu ? kitsuCandidates : []), ...(includeGcd ? gcdCandidates : [])];
  const rankedDocs = finalRecommenderForDeck(normalizedCandidates, input.deckKey, { tasteProfile: input.tasteProfile, profileOverride: input.profileOverride, priorRecommendedIds: input.priorRecommendedIds, priorRecommendedKeys: input.priorRecommendedKeys, priorAuthors: input.priorAuthors, priorSeriesKeys: input.priorSeriesKeys, priorRejectedIds: input.priorRejectedIds, priorRejectedKeys: input.priorRejectedKeys });
  const rankedDocsWithDiagnostics = rankedDocs.map((doc: any) => ({ ...doc, source: sourceForDoc(doc, "openLibrary"), diagnostics: doc?.diagnostics ? { source: doc.diagnostics.source || sourceForDoc(doc, "openLibrary"), preFilterScore: doc.diagnostics.preFilterScore, postFilterScore: doc.diagnostics.postFilterScore, rejectionReason: doc.diagnostics.rejectionReason } : undefined }));
  const rankedCountsBySource: Record<CandidateSource, number> = { googleBooks: 0, openLibrary: 0, kitsu: 0, gcd: 0 };
  for (const doc of rankedDocsWithDiagnostics) { const source = sourceForDoc(doc, "openLibrary"); rankedCountsBySource[source] = (rankedCountsBySource[source] || 0) + 1; }
  const engineLabel = includeKitsu && includeGcd ? "Google Books + Open Library + Kitsu + GCD" : includeKitsu ? "Google Books + Open Library + Kitsu" : includeGcd ? "Google Books + Open Library + GCD" : "Google Books + Open Library";
  const debugSourceStats: Record<string, RecommenderDebugSourceStats> = {
    googleBooks: { rawFetched: countResultItems(google), postFilterCandidates: googleCandidates.length, finalSelected: rankedCountsBySource.googleBooks },
    openLibrary: { rawFetched: countResultItems(openLibrary), postFilterCandidates: openLibraryCandidates.length, finalSelected: rankedCountsBySource.openLibrary },
    kitsu: { rawFetched: includeKitsu ? countResultItems(kitsu) : 0, postFilterCandidates: includeKitsu ? kitsuCandidates.length : 0, finalSelected: rankedCountsBySource.kitsu },
    gcd: { rawFetched: includeGcd ? countResultItems(gcd) : 0, postFilterCandidates: includeGcd ? gcdCandidates.length : 0, finalSelected: rankedCountsBySource.gcd },
  };
  return { engineId: preferredEngine, engineLabel, deckKey: input.deckKey, domainMode: input.deckKey === "k2" ? (input.domainModeOverride ?? "chapterMiddle") : (input.domainModeOverride ?? "default"), builtFromQuery: bucketPlan.preview || bucketPlan.queries?.[0] || (google as any)?.builtFromQuery || (openLibrary as any)?.builtFromQuery || "", items: rankedDocsWithDiagnostics.map((doc) => ({ kind: "open_library", doc })), debugSourceStats } as RecommendationResult;
}
