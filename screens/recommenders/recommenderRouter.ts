import type {
  EngineId,
  RecommenderInput,
  RecommendationResult,
  DomainMode,
  RecommendationDoc,
  CommercialSignals,
} from "./types";

import { getGoogleBooksRecommendations } from "./googleBooks/googleBooksRecommender";
import { getOpenLibraryRecommendations } from "./openLibrary/openLibraryRecommender";
import { getKitsuMangaRecommendations } from "./kitsu/kitsuMangaRecommender";
import { getGcdGraphicNovelRecommendations } from "./gcd/gcdGraphicNovelRecommender";
import { normalizeCandidates, type CandidateSource } from "./normalizeCandidate";
import { finalRecommenderForDeck } from "./finalRecommender";
import { getHardcoverRatings } from "../../services/hardcover/hardcoverRatings";
import { getNytBestsellerBooks } from "../../services/bestsellers/nytClient";
import { adaptNytBooksToRecommendationDocs } from "../../services/bestsellers/nytAdapter";
import { mergeBestsellerDocs } from "../../services/bestsellers/bestsellerMatcher";
import { buildBucketPlanFromTaste } from "./buildBucketPlanFromTaste";
import { buildDescriptiveQueriesFromTaste } from "./buildDescriptiveQueriesFromTaste";
import { build20QRungs } from "./build20QRungs";

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

  // Gold-standard router rule:
  // prefer the descriptive query hypothesis as primary; use translated buckets
  // only as expansion, never as a replacement.
  const primaryQueries = Array.isArray(descriptivePlan?.queries) ? descriptivePlan.queries : [];
  const secondaryQueries = Array.isArray(translatedBucketPlan?.queries) ? translatedBucketPlan.queries : [];

  const queries = dedupeNonEmptyQueries([
    ...primaryQueries,
    ...secondaryQueries,
  ]);

  return {
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


function inferRouterFamily(bucketPlan: any): "thriller" | "speculative" | "romance" | "historical" | "general" {
  const text = [
    bucketPlan?.preview,
    ...(Array.isArray(bucketPlan?.queries) ? bucketPlan.queries : []),
    ...(Array.isArray(bucketPlan?.signals?.genres) ? bucketPlan.signals.genres : []),
    ...(Array.isArray(bucketPlan?.signals?.tones) ? bucketPlan.signals.tones : []),
    ...(Array.isArray(bucketPlan?.signals?.scenarios) ? bucketPlan.signals.scenarios : []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (/(thriller|mystery|crime|detective|suspense|psychological|murder|investigation)/.test(text)) return "thriller";
  if (/(science fiction|sci-fi|fantasy|speculative|dystopian|space opera|haunted|horror)/.test(text)) return "speculative";
  if (/(romance|love story|rom-com|rom com)/.test(text)) return "romance";
  if (/(historical|period fiction|gilded age|19th century|world war)/.test(text)) return "historical";
  return "general";
}

function buildAnchorLaneQuery(bucketPlan: any): string {
  const family = inferRouterFamily(bucketPlan);
  const queryText = String(bucketPlan?.preview || bucketPlan?.queries?.[0] || "").toLowerCase();

  // Lane 90 = commercial anchor lane:
  // keep the phrasing shelf-facing and reader-facing, not award/reference-facing.
  if (family === "thriller") {
    if (queryText.includes("psychological")) return "bestselling thriller novel";
    if (queryText.includes("crime")) return "bestselling crime thriller";
    if (queryText.includes("mystery")) return "bestselling mystery thriller";
    if (queryText.includes("detective")) return "bestselling thriller novel";
    return "bestselling thriller novel";
  }

  if (family === "speculative") {
    if (queryText.includes("fantasy")) return "fantasy novel";
    if (queryText.includes("horror")) return "horror novel";
    return "science fiction novel";
  }

  if (family === "romance") return "romance novel";
  if (family === "historical") return "historical fiction novel";
  return "commercial fiction novel";
}


function buildNytListNamesFromProfile(profile: any): string[] {
  const mediaType = String(profile?.mediaType || "books").toLowerCase();
  if (mediaType !== "books") return [];

  const ageBand = String(
    profile?.ageBand ||
      profile?.readerAgeBand ||
      profile?.audience ||
      ""
  ).toLowerCase();

  const genres = [
    ...(Array.isArray(profile?.genres) ? profile.genres : []),
    ...(Array.isArray(profile?.favoriteGenres) ? profile.favoriteGenres : []),
    ...(Array.isArray(profile?.tags) ? profile.tags : []),
    ...(Array.isArray(profile?.signals?.genres) ? profile.signals.genres : []),
  ]
    .map((value) => String(value || "").toLowerCase().trim())
    .filter(Boolean);

  const joined = genres.join(" ");
  const out = new Set<string>();

  if (ageBand.includes("teen") || ageBand.includes("young adult") || ageBand.includes("ya")) {
    out.add("young-adult-hardcover");
  } else {
    out.add("hardcover-fiction");
  }

  if (joined.includes("romance")) {
    out.add("combined-print-and-e-book-fiction");
  }

  if (joined.includes("fantasy")) {
    out.add("hardcover-fiction");
  }

  if (joined.includes("mystery") || joined.includes("thriller") || joined.includes("crime")) {
    out.add("combined-print-and-e-book-fiction");
  }

  if (joined.includes("historical")) {
    out.add("hardcover-fiction");
  }

  return Array.from(out);
}

function withAnchorLane(rungs: any[], bucketPlan: any) {
  const anchorQuery = buildAnchorLaneQuery(bucketPlan);
  const seen = new Set(
    (Array.isArray(rungs) ? rungs : [])
      .map((r: any) => String(r?.query || "").trim().toLowerCase())
      .filter(Boolean)
  );

  const base = (Array.isArray(rungs) ? rungs : []).map((r: any) => ({ ...r, laneKind: "precision" }));
  if (!anchorQuery || seen.has(anchorQuery.toLowerCase())) return base;

  return [
    ...base,
    {
      rung: 90,
      query: anchorQuery,
      laneKind: "anchor",
      anchorLane: true,
    },
  ];
}

function recognizabilityScore(doc: any): number {
  const title = normalizeText(doc?.title ?? doc?.volumeInfo?.title);
  const description = collectDescriptionText(doc);
  const categories = collectCategoryText(doc);

  const googleRatings = Number((doc as any)?.ratingsCount || (doc as any)?.volumeInfo?.ratingsCount || 0);
  const hardcoverRatings = Number((doc as any)?.hardcover?.ratings_count || 0);
  const avgRating = Number((doc as any)?.averageRating || (doc as any)?.hardcover?.rating || 0);
  const year = Number((doc as any)?.first_publish_year || 0);
  const commercialSignals = (doc as any)?.commercialSignals;

  let score = 0;
  score += Math.min(googleRatings, 5000) / 250;
  score += Math.min(hardcoverRatings, 5000) / 250;
  if (avgRating >= 4) score += 1.5;
  if (year >= 1990) score += 0.5;
  if (/bestselling|award[- ]winning|international bestseller|new york times bestseller/.test(`${title} ${description} ${categories}`)) score += 3;
  if (commercialSignals) {
    if (commercialSignals.bestseller) score += 4;
    if (Number(commercialSignals.awards || 0) > 0) score += Math.min(Number(commercialSignals.awards || 0), 2) * 2;
    score += Math.min(Number(commercialSignals.popularityTier || 0), 3);
    score += Math.min(Number(commercialSignals.sourceCount || 0), 2) * 0.5;
  }
  return score;
}

function blendAnchorLane(rankedDocs: any[], finalLimit = 10): any[] {
  const docs = Array.isArray(rankedDocs) ? rankedDocs : [];
  if (!docs.length) return docs;

  const anchorDocs = docs.filter((doc: any) => {
    const laneKind = doc?.diagnostics?.laneKind ?? doc?.laneKind ?? doc?.rawDoc?.laneKind;
    return laneKind === "anchor";
  });

  if (!anchorDocs.length) return docs.slice(0, finalLimit);

  const sortedAnchors = [...anchorDocs].sort((a: any, b: any) => recognizabilityScore(b) - recognizabilityScore(a));
  const selectedAnchors = sortedAnchors.slice(0, 1);

  const used = new Set<string>();
  const output: any[] = [];

  const keyFor = (doc: any) =>
    String(
      doc?.key ||
      doc?.id ||
      `${doc?.title || ""}|${Array.isArray(doc?.author_name) ? doc.author_name[0] : doc?.author || ""}`
    )
      .trim()
      .toLowerCase();

  const pushUnique = (doc: any) => {
    const key = keyFor(doc);
    if (!key || used.has(key)) return;
    used.add(key);
    output.push(doc);
  };

  // Place strongest anchor early to establish trust.
  if (selectedAnchors[0]) pushUnique(selectedAnchors[0]);

  for (const doc of docs) {
    if (output.length >= finalLimit) break;
    pushUnique(doc);
  }

  if (selectedAnchors[1] && output.length < finalLimit) {
    const key = keyFor(selectedAnchors[1]);
    if (key && !used.has(key)) {
      if (output.length >= 3) output.splice(3, 0, selectedAnchors[1]);
      else output.push(selectedAnchors[1]);
      used.add(key);
    }
  }

  return output.slice(0, finalLimit);
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

  if (family === "thriller") {
    if (rung?.rung === 0) return quoteIfNeeded("psychological suspense fiction");

    if (rung?.rung === 1) {
      if (base.includes("crime")) return quoteIfNeeded("crime fiction");
      return quoteIfNeeded("psychological thriller");
    }

    if (rung?.rung === 2) {
      if (base.includes("murder") || base.includes("investigation")) {
        return quoteIfNeeded("mystery fiction");
      }
      return quoteIfNeeded("crime fiction");
    }

    if (rung?.rung === 3) return quoteIfNeeded("suspense fiction");

    // Rung 90 is the commercial / airport-paperback lane.
if (rung?.rung === 90) {
  return quoteIfNeeded("crime thriller");
}

    return quoteIfNeeded("suspense fiction");
  }

  if (family === "speculative") {
    if (base.includes("science fiction")) return quoteIfNeeded("science fiction");
    if (base.includes("fantasy")) return quoteIfNeeded("fantasy fiction");
    if (base.includes("horror")) return quoteIfNeeded("horror fiction");
  }

  if (family === "romance") return quoteIfNeeded("romance fiction");
  if (family === "historical") return quoteIfNeeded("historical fiction");

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
  if (hardRejectSpecificTitlePatterns.some((rx) => rx.test(title))) return false;
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
  if (engine === "googleBooks") return getGoogleBooksRecommendations(input);

  const domainModeOverride: DomainMode | undefined =
    input.deckKey === "k2" ? (input.domainModeOverride ?? "chapterMiddle") : input.domainModeOverride;

  const routedInput: RecommenderInput =
    domainModeOverride === input.domainModeOverride ? input : { ...input, domainModeOverride };

  if (engine === "openLibrary") return getOpenLibraryRecommendations(routedInput);
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
  const preferredEngine = chooseEngine(input, override);
  const bucketPlan = buildRouterBucketPlan(input);

  // Gold-standard 20Q router:
  // always carry the bucket plan forward, but do not let the router collapse to one engine.
  const routedInput: RecommenderInput = { ...input, bucketPlan };

  const includeKitsu = shouldUseKitsu(routedInput);
  const includeGcd = shouldUseGcd(routedInput);

  const rungs = withAnchorLane(
    build20QRungs({
      ageBand:
        input.deckKey === "adult"
          ? "adult"
          : input.deckKey === "ms_hs"
          ? "teen"
          : input.deckKey === "36"
          ? "pre-teen"
          : "kids",
      family:
        inferRouterFamily(bucketPlan) === "thriller"
          ? "thriller_family"
          : inferRouterFamily(bucketPlan) === "speculative"
          ? "speculative_family"
          : inferRouterFamily(bucketPlan) === "romance"
          ? "romance_family"
          : inferRouterFamily(bucketPlan) === "historical"
          ? "historical_family"
          : "general_family",
      baseGenre:
        bucketPlan?.preview ||
        bucketPlan?.queries?.[0] ||
        "fiction",
      subgenres: bucketPlan?.queries?.length
        ? bucketPlan.queries
        : (bucketPlan?.signals?.genres || []),
      tones: bucketPlan?.signals?.tones || [],
      themes: bucketPlan?.signals?.scenarios || [],
    }),
    bucketPlan
  );

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
    const openLibraryQuery = openLibraryQueryForRung(rung, bucketPlan);

    const googleInput: RecommenderInput = {
      ...routedInput,
      bucketPlan: {
        ...bucketPlan,
        queries: [rung.query],
        preview: rung.query,
      },
    };

    const openLibraryInput: RecommenderInput = {
      ...routedInput,
      bucketPlan: {
        ...bucketPlan,
        queries: [openLibraryQuery],
        preview: openLibraryQuery,
      },
    };

    const [googleResult, openLibraryResult, kitsuResult, gcdResult] = await Promise.allSettled([
      runEngine("googleBooks", googleInput),
      runEngine("openLibrary", openLibraryInput),
      ...(includeKitsu ? [getKitsuMangaRecommendations(googleInput)] : []),
      ...(includeGcd ? [getGcdGraphicNovelRecommendations(googleInput)] : []),
    ]);

    const rungResults = {
      google: googleResult.status === "fulfilled" ? googleResult.value : null,
      openLibrary: openLibraryResult.status === "fulfilled" ? openLibraryResult.value : null,
      kitsu: includeKitsu
        ? ((kitsuResult.status === "fulfilled" ? kitsuResult.value : null) as RecommendationResult | null)
        : null,
      gcd: includeGcd
        ? (((includeKitsu ? gcdResult : kitsuResult).status === "fulfilled"
            ? (includeKitsu ? gcdResult : kitsuResult).value
            : null) as RecommendationResult | null)
        : null,
      mergedDocs: dedupeDocs([
        ...dedupeDocs(extractDocs(googleResult.status === "fulfilled" ? googleResult.value : null, "googleBooks")),
        ...dedupeDocs(extractDocs(openLibraryResult.status === "fulfilled" ? openLibraryResult.value : null, "openLibrary")),
        ...(includeKitsu
          ? dedupeDocs(extractDocs(kitsuResult.status === "fulfilled" ? kitsuResult.value : null, "kitsu"))
          : []),
        ...(includeGcd
          ? dedupeDocs(extractDocs(((includeKitsu ? gcdResult : kitsuResult).status === "fulfilled"
              ? (includeKitsu ? gcdResult : kitsuResult).value
              : null), "gcd"))
          : []),
      ]),
    };


    if (!google && rungResults.google) google = rungResults.google;
    if (!openLibrary && rungResults.openLibrary) openLibrary = rungResults.openLibrary;
    if (!kitsu && rungResults.kitsu) kitsu = rungResults.kitsu;
    if (!gcd && rungResults.gcd) gcd = rungResults.gcd;

    aggregatedRawFetched.googleBooks += Number((rungResults.google as any)?.debugRawFetchedCount ?? countResultItems(rungResults.google));
    aggregatedRawFetched.openLibrary += Number((rungResults.openLibrary as any)?.debugRawFetchedCount ?? countResultItems(rungResults.openLibrary));
    aggregatedRawFetched.kitsu += Number((rungResults.kitsu as any)?.debugRawFetchedCount ?? countResultItems(rungResults.kitsu));
    aggregatedRawFetched.gcd += Number((rungResults.gcd as any)?.debugRawFetchedCount ?? countResultItems(rungResults.gcd));

    const rungRawPool = [
      ...(((rungResults.google as any)?.debugRawPool as any[]) || []),
      ...(((rungResults.openLibrary as any)?.debugRawPool as any[]) || []),
      ...(((rungResults.kitsu as any)?.debugRawPool as any[]) || []),
      ...(((rungResults.gcd as any)?.debugRawPool as any[]) || []),
    ].map((row: any) => ({
      ...row,
      queryRung: rung.rung,
      queryText: row?.source === "openLibrary" ? openLibraryQuery : (row?.queryText ?? rung.query),
      laneKind: rung.laneKind ?? "precision",
    }));

    debugRawPool.push(...rungRawPool);

    const taggedDocs = rungResults.mergedDocs.map((doc: any) => {
      const routedQueryText = sourceForDoc(doc, "openLibrary") === "openLibrary" ? openLibraryQuery : rung.query;
      return {
        ...doc,
        queryRung: rung.rung,
        queryText: routedQueryText,
        laneKind: rung.laneKind ?? "precision",
        diagnostics: {
          ...(doc?.diagnostics || {}),
          queryRung: rung.rung,
          queryText: routedQueryText,
          laneKind: rung.laneKind ?? "precision",
        },
      };
    });

    allMergedDocs.push(...taggedDocs);
  }

  const mergedDocs = dedupeDocs(allMergedDocs);

  // Hardcover enrichment is non-blocking and runs AFTER merging.
  const hardcoverEnrichedDocs = await enrichWithHardcover(mergedDocs);
  const enrichedDocs = enrichWithCommercialSignals(hardcoverEnrichedDocs);

  let bestsellerMergedDocs = enrichedDocs;

  try {
    const bestsellerLaneEnabled =
      (input as any)?.mediaType === undefined
        ? true
        : String((input as any)?.mediaType || "").toLowerCase() === "books";

    if (bestsellerLaneEnabled) {
      const nytListNames = buildNytListNamesFromProfile({
        mediaType: (input as any)?.mediaType || "books",
        ageBand:
          input.deckKey === "adult"
            ? "adult"
            : input.deckKey === "ms_hs"
            ? "teen"
            : input.deckKey === "36"
            ? "pre-teen"
            : "kids",
        genres: bucketPlan?.signals?.genres || [],
        favoriteGenres: bucketPlan?.queries || [],
        tags: Object.keys(input.tagCounts || {}),
        signals: bucketPlan?.signals,
      });

      if (nytListNames.length) {
        const nytBooks = await getNytBestsellerBooks({
          listNames: nytListNames,
          date: "current",
          maxPerList: 12,
        });

        if (nytBooks.length) {
          const nytDocs = adaptNytBooksToRecommendationDocs(nytBooks);
          const mergeResult = mergeBestsellerDocs(
            Array.isArray(enrichedDocs) ? enrichedDocs : [],
            nytDocs,
            { allowInjections: true }
          );

          bestsellerMergedDocs = mergeResult.docs;

          if (__DEV__) {
            console.log("[recommenderRouter] bestseller merge", {
              nytLists: nytListNames,
              nytFetched: nytBooks.length,
              nytAdapted: nytDocs.length,
              matchedCount: mergeResult.matchedCount,
              injectedCount: mergeResult.injectedCount,
              finalCount: bestsellerMergedDocs.length,
            });
          }
        }
      }
    }
  } catch (error) {
    if (__DEV__) {
      console.warn("[recommenderRouter] bestseller lane failed", error);
    }
  }

  // Preserve source slices after enrichment.
const googleDocsEnriched = bestsellerMergedDocs.filter(
  (doc: any) =>
    sourceForDoc(doc, "googleBooks") === "googleBooks" &&
    looksLikeFictionCandidate(doc)
);

const openLibraryDocsEnriched = bestsellerMergedDocs.filter(
  (doc: any) =>
    sourceForDoc(doc, "openLibrary") === "openLibrary" &&
    looksLikeFictionCandidate(doc)
);
const kitsuDocsEnriched = bestsellerMergedDocs.filter(
  (doc: any) =>
    sourceForDoc(doc, "kitsu") === "kitsu" &&
    looksLikeFictionCandidate(doc)
);

const gcdDocsEnriched = bestsellerMergedDocs.filter(
  (doc: any) =>
    sourceForDoc(doc, "gcd") === "gcd" &&
    looksLikeFictionCandidate(doc)
);

  // Normalize all sources the same way.
  // IMPORTANT: Open Library should normalize from enriched docs too, so Hardcover failure markers
  // survive into candidate.rawDoc and finalRecommender can treat 429s as soft/non-blocking.
  const googleCandidates = normalizeCandidates(googleDocsEnriched, "googleBooks");
  const openLibraryCandidates = normalizeCandidates(openLibraryDocsEnriched, "openLibrary");
  const kitsuCandidatesRaw = normalizeCandidates(kitsuDocsEnriched, "kitsu");
  const gcdCandidates = normalizeCandidates(gcdDocsEnriched, "gcd");

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
    queryText: c?.rawDoc?.queryText ?? c?.queryText,
    queryRung: c?.rawDoc?.queryRung ?? c?.queryRung,
    laneKind: c?.rawDoc?.laneKind ?? c?.laneKind ?? c?.diagnostics?.laneKind,
    commercialSignals: c?.commercialSignals ?? c?.rawDoc?.commercialSignals,
  }));

  // 20Q philosophy:
  // router gathers a broad but sane shelf;
  // finalRecommender performs the actual preference-aware magic.
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

  const blendedRankedDocs = blendAnchorLane(rankedDocs, Math.max(1, Math.min(10, input.limit ?? 10)));

  const rankedDocsWithDiagnostics = blendedRankedDocs.map((doc: any) => ({
    ...doc,
    source: sourceForDoc(doc, "openLibrary"),
    diagnostics: doc?.diagnostics
      ? {
          source: doc.diagnostics.source || sourceForDoc(doc, "openLibrary"),
          preFilterScore: doc.diagnostics.preFilterScore,
          postFilterScore: doc.diagnostics.postFilterScore,
          rejectionReason: doc.diagnostics.rejectionReason,
          tasteAlignment: doc.diagnostics.tasteAlignment,
          queryAlignment: doc.diagnostics.queryAlignment,
          rungBoost: doc.diagnostics.rungBoost,
          commercialBoost: (doc.diagnostics as any).commercialBoost,
          laneKind: doc.diagnostics.laneKind ?? doc.laneKind ?? doc.rawDoc?.laneKind,
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
    gcd: {
      rawFetched: includeGcd ? aggregatedRawFetched.gcd : 0,
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
    debugRawPool,
    debugRungStats: buildRungDiagnostics(normalizedCandidates),
  } as RecommendationResult;
}