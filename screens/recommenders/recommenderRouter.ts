import type {
  EngineId,
  RecommenderInput,
  RecommendationResult,
  DomainMode,
  RecommendationDoc,
} from "./types";

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

type RecommenderDebugSourceStats = {
  rawFetched: number;
  postFilterCandidates: number;
  finalSelected: number;
};

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

function buildRouterBucketPlan(input: RecommenderInput) {
  const descriptivePlan = buildDescriptiveQueriesFromTaste(input);
  const translatedBucketPlan = buildBucketPlanFromTaste(input);

  const primaryQueries = Array.isArray(descriptivePlan?.queries) ? descriptivePlan.queries : [];
  const secondaryQueries = Array.isArray(translatedBucketPlan?.queries) ? translatedBucketPlan.queries : [];

  const queries = dedupeNonEmptyQueries([
    ...primaryQueries,
    ...secondaryQueries,
  ]);

  return {
    ...translatedBucketPlan,
    queries,
    preview:
      descriptivePlan?.preview ||
      primaryQueries[0] ||
      translatedBucketPlan?.queries?.[0] ||
      queries[0] ||
      "",
    strategy:
      descriptivePlan?.strategy && translatedBucketPlan?.strategy
        ? `${descriptivePlan.strategy}+${translatedBucketPlan.strategy}`
        : descriptivePlan?.strategy || translatedBucketPlan?.strategy || "router-bucket-plan",
    signals: descriptivePlan?.signals,
  };
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
  return input.deckKey === "ms_hs" && teenVisualSignalWeight(input.tagCounts) >= 1;
}

function shouldUseGcd(input: RecommenderInput): boolean {
  return input.deckKey === "ms_hs" && teenVisualSignalWeight(input.tagCounts) >= 1;
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
    /\barmchair detective\b/,
    /\bmovie maker\b/,
    /\bclassic detective novels?\b/,
    /\bmystery && detective novels?\b/,
    /\bdetective novels?\b/,
    /\birish detective novel\b/,
  ];

  const hardRejectCategoryPatterns = [
    /\bliterary criticism\b/,
    /\bstudy aids?\b/,
    /\breference\b/,
    /\blanguage arts\b/,
    /\bbibliograph(?:y|ies)\b/,
    /\beducation\b/,
    /\bbooks && reading\b/,
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

  if (hardRejectTitlePatterns.some((rx) => rx.test(title))) return false;
  if (hardRejectCategoryPatterns.some((rx) => rx.test(categories))) return false;
  if (hardRejectDescriptionPatterns.some((rx) => rx.test(description))) return false;
  if (obviousReferenceSeriesPatterns.some((rx) => rx.test(combined))) return false;

  const hasPositiveFictionSignal = fictionPositivePatterns.some(
    (rx) => rx.test(title) || rx.test(categories) || rx.test(description)
  );

  return hasPositiveFictionSignal;
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

function countResultItems(result: RecommendationResult | null | undefined): number {
  if (!result) return 0;
  if (Array.isArray((result as any).items)) return (result as any).items.length;
  if (Array.isArray((result as any).recommendations)) return (result as any).recommendations.length;
  if (Array.isArray((result as any).docs)) return (result as any).docs.length;
  return 0;
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
  const enriched = await Promise.all(
    docs.map(async (doc) => {
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

async function runEngine(engine: EngineId, input: RecommenderInput): Promise<RecommendationResult> {
  if (engine === "googleBooks") return getGoogleBooksRecommendations(input);

  const domainModeOverride: DomainMode | undefined =
    input.deckKey === "k2" ? (input.domainModeOverride ?? "chapterMiddle") : input.domainModeOverride;

  const routedInput: RecommenderInput =
    domainModeOverride === input.domainModeOverride ? input : { ...input, domainModeOverride };

  if (engine === "openLibrary") return getOpenLibraryRecommendations(routedInput);
  if (engine === "kitsu") return getKitsuMangaRecommendations(input);
  return getGcdGraphicNovelRecommendations(input);
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
    :
    null;

  const gcd = gcdIndex >= 0 && results[gcdIndex]?.status === "fulfilled"
    ? results[gcdIndex].value
    :
    null;

  const googleDocs = = dedupeDocs(extractDocs(google, "googleBooks"));
  const openLibraryDocs = dedupeDocs(extractDocs(openLibrary, "openLibrary"));
  const kitsuDocs = dedupeDocs(extractDocs(kitsu, "kitsu"));
  const gcdDocs = dedupeDocs(extractDocs(gcd, "gcd"));

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
  const preferredEngine = chooseEngine(input, override);
  const bucketPlan = buildRouterBucketPlan(input);

  const routedInput: RecommenderInput = { ...input, bucketPlan };

  const includeKitsu = shouldUseKitsu(routedInput);
  const includeGcd = shouldUseGcd(routedInput);

  const { google, openLibrary, kitsu, gcd, mergedDocs } = await fetchBothEngines(routedInput);

  const enrichedDocs = await enrichWithHardcover(mergedDocs);

  const googleDocsEnriched = enrichedDocs.filter(
    (doc: any) =>
      sourceForDoc(doc, "googleBooks") === "googleBooks" &&
      looksLikeFictionCandidate(doc)
  );

  const openLibraryDocsEnriched = enrichedDocs.filter(
    (doc: any) =>
      sourceForDoc(doc, "openLibrary") === "openLibrary" &&
      looksLikeFictionCandidate(doc)
  );
  const kitsuDocsEnriched = enrichedDocs.filter(
    (doc: any) =>
      sourceForDoc(doc, "kitsu") === "kitsu" &&
      looksLikeFictionCandidate(doc)
  );

  const gcdDocsEnriched = enrichedDocs.filter(
    (doc: any) =>
      sourceForDoc(doc, "gcd") === "gcd" &&
      looksLikeFictionCandidate(doc)
  );

  const googleCandidates = normalizeCandidates(googleDocsEnriched, "googleBooks");
  const openLibraryCandidates = normalizeCandidates(openLibraryDocsEnriched, "openLibrary");
  const kitsuCandidatesRaw = normalizeCandidates(kitsuDocsEnriched, "kitsu");
  const gcdCandidates = normalizeCandidates(gcdDocsEnriched, "gcd");

  const seenTitles = new Set<string>();
  const kitsuCandidates = kitsuCandidatesRaw.filter((c) => {
    const title = (c.title || "").toLowerCase().trim();
    if (!title || seenTitles.has(title)) return false;
    seenTitles.add(title);
    return true;
  });

  const normalizedCandidates = [
    ...googleCandidates,
    ...openLibraryCandidates,
    ...(includeKitsu ? kitsuCandidates : []),
    ...(includeGcd ? gcdCandidates : []),
  ];

  const candidatePoolPreview = normalizedCandidates.slice(0, 50).map((c: any) => ({
    title: c.title,
    author: Array.isArray(c.author_name) ? c.author_name[0] : c.author,
    source: c.source,
    score: c.score,
  }));

  const rankedDocs = finalRecommenderForDeck(normalizedCandidates, input.deckKey, {
    tasteProfile: input.tasteProfile,
    profileOverride: input.profileOverride,
    priorRecommendedIds: input.priorRecommendedIds,
    priorRecommendedKeys: input.priorRecommendedKeys,
    priorAuthors: input.priorAuthors,
    priorSeriesKeys: input.priorSeriesKeys,
    priorRejectedIds: input.priorRejectedIds,
    priorRejectedKeys: input.priorRejectedKeys,
  });

  const rankedDocsWithDiagnostics = rankedDocs.map((doc: any) => ({
    ...doc,
    source: sourceForDoc(doc, "openLibrary"),
    diagnostics: doc?.diagnostics
      ? {
          source: doc.diagnostics.source || sourceForDoc(doc, "openLibrary"),
          preFilterScore: doc.diagnostics.preFilterScore,
          postFilterScore: doc.diagnostics.postFilterScore,
          rejectionReason: doc.diagnostics.rejectionReason,
        }
      : undefined,
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

  const engineLabel =
    includeKitsu && includeGcd
      ? "Google Books + Open Library + Kitsu + GCD"
      : includeKitsu
      ? "Google Books + Open Library + Kitsu"
      : includeGcd
      ? "Google Books + Open Library + GCD"
      : "Google Books + Open Library";

  const debugSourceStats: Record<string, RecommenderDebugSourceStats> = {
    googleBooks: {
      rawFetched: countResultItems(google),
      postFilterCandidates: googleCandidates.length,
      finalSelected: rankedCountsBySource.googleBooks,
    },
    openLibrary: {
      rawFetched: countResultItems(openLibrary),
      postFilterCandidates: openLibraryCandidates.length,
      finalSelected: rankedCountsBySource.openLibrary,
    },
    kitsu: {
      rawFetched: includeKitsu ? countResultItems(kitsu) : 0,
      postFilterCandidates: includeKitsu ? kitsuCandidates.length : 0,
      finalSelected: rankedCountsBySource.kitsu,
    },
    gcd: {
      rawFetched: includeGcd ? countResultItems(gcd) : 0,
      postFilterCandidates: includeGcd ? gcdCandidates.length : 0,
      finalSelected: rankedCountsBySource.gcd,
    },
  };

  return {
    engineId: preferredEngine,
    engineLabel,
    deckKey: input.deckKey,
    domainMode:
      input.deckKey === "k2"
        ? (input.domainModeOverride ?? "chapterMiddle")
        : (input.domainModeOverride ?? "default"),
    builtFromQuery:
      (google as any)?.builtFromQuery ||
      (openLibrary as any)?.builtFromQuery ||
      bucketPlan.preview ||
      bucketPlan.queries?.[0] ||
      "",
    items: rankedDocsWithDiagnostics.map((doc) => ({ kind: "open_library", doc })),
    debugSourceStats,
    debugCandidatePool: candidatePoolPreview,
  } as RecommendationResult;
}
