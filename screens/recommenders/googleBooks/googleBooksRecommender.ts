// /screens/recommenders/googleBooks/googleBooksRecommender.ts
//
// Google Books recommendation engine.
// Thin fetcher only: fetch broad bucket queries and return raw docs.
// Ranking, normalization, dedupe, novelty, and final selection belong downstream.

import type { RecommenderInput, RecommendationResult, RecommendationDoc, DeckKey } from "../types";
import {
  openLibrarySearch as googleBooksSearch,
} from "../../swipe/openLibraryFromTags";

function normalizePublisherText(value: any): string {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

const HARD_SELF_PUBLISH_PAT = /(independently published|self[- ]published|createspace|kindle direct publishing|\bkdp\b|amazon digital services|amazon kdp|lulu\.com|lulu press|blurb|smashwords|draft2digital|authorhouse|xlibris|iuniverse|bookbaby|notion press|balboa press|trafford|whitmore publishing)/i;

function isHardSelfPublished(publisher: any): boolean {
  const p = normalizePublisherText(publisher);
  if (!p) return false;
  return HARD_SELF_PUBLISH_PAT.test(p);
}

function deckKeyToDomainMode(deckKey: DeckKey): RecommendationResult["domainMode"] {
  if (deckKey === "k2") return "chapterMiddle";
  return "default";
}

function visualSignalWeight(tagCounts: RecommenderInput["tagCounts"] | undefined): number {
  return (
    Number((tagCounts as any)?.["topic:manga"] || 0) +
    Number((tagCounts as any)?.["format:graphic_novel"] || 0) +
    Number((tagCounts as any)?.["format:graphic novel"] || 0) +
    Number((tagCounts as any)?.["media:anime"] || 0) +
    Number((tagCounts as any)?.["genre:superheroes"] || 0)
  );
}

function dedupeQueries(queries: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const query of queries) {
    const trimmed = String(query || "").trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }

  return out;
}

const ADULT_BUCKET_QUERY_PACKS: Record<string, string[]> = {
  sci_fi: [
    "subject:science_fiction",
    "space opera science fiction",
    "dystopian science fiction",
    "science fiction novel",
  ],
  fantasy: [
    "subject:fantasy",
    "epic fantasy novel",
    "dark fantasy novel",
    "magic fantasy novel",
  ],
  mystery_detective: [
    "murder investigation novel",
    "crime detective fiction",
  ],
  thriller: [
    "psychological thriller novel",
    "spy thriller novel",
    "crime thriller novel",
    "thriller novel",
  ],
  romance: [
    "romance novel",
    "contemporary romance novel",
    "historical romance novel",
    "romantic fiction",
  ],
  horror: [
    "horror novel",
    "haunted house horror novel",
    "survival horror novel",
    "supernatural horror novel",
  ],
  historical_fiction: [
    "historical fiction novel",
    "war historical fiction novel",
    "19th century historical fiction novel",
    "historical drama novel",
  ],
  literary_fiction: [
    "literary fiction novel",
    "contemporary literary fiction",
    "character-driven literary novel",
    "family drama literary novel",
  ],
  general_contemporary: [
    "contemporary fiction novel",
    "general fiction novel",
    "family life novel",
    "modern life novel",
  ],
};

function normalizeBucketId(value: any): string {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[\/]+/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, "_");
}

function getBucketQueriesFromPlan(bucketId: any): string[] | undefined {
  const normalized = normalizeBucketId(bucketId);

  if (!normalized) return undefined;

  const aliases: Record<string, string> = {
    sci_fi: "sci_fi",
    scifi: "sci_fi",
    science_fiction: "sci_fi",
    fantasy: "fantasy",
    mystery: "mystery_detective",
    detective: "mystery_detective",
    mystery_detective: "mystery_detective",
    mystery_and_detective: "mystery_detective",
    thriller: "thriller",
    romance: "romance",
    horror: "horror",
    historical_fiction: "historical_fiction",
    historical: "historical_fiction",
    literary_fiction: "literary_fiction",
    literary: "literary_fiction",
    general_contemporary: "general_contemporary",
    general_fiction: "general_contemporary",
    contemporary: "general_contemporary",
    contemporary_fiction: "general_contemporary",
  };

  const canonicalKey = aliases[normalized] || normalized;
  const queries = ADULT_BUCKET_QUERY_PACKS[canonicalKey];

  return queries ? dedupeQueries(queries) : undefined;
}

function getBucketQueries(deckKey: DeckKey, input: RecommenderInput): string[] {
  const isVisualDominant = visualSignalWeight(input.tagCounts) >= 4;

  if (isVisualDominant) {
    return dedupeQueries([
      'subject:manga',
      'subject:"graphic novel"',
      "subject:comics",
      "subject:fiction",
    ]);
  }

  if (deckKey === "k2") {
    return dedupeQueries([
      `subject:"children's fiction"`,
      `subject:"middle grade fiction"`,
      `subject:"early reader books"`,
      `subject:"chapter books"`,
    ]);
  }

  if (deckKey === "ms_hs") {
    return dedupeQueries([
      `subject:"young adult fiction"`,
      `subject:"teen fiction"`,
      `subject:"coming of age fiction"`,
      `subject:"young adult bestseller"`,
    ]);
  }

  if (deckKey === "36") {
    return dedupeQueries([
      `subject:"middle grade fiction"`,
      `subject:"juvenile fiction"`,
      `subject:"chapter books"`,
      `subject:"children's fiction"`,
    ]);
  }

  return dedupeQueries([
    "subject:fiction",
    `subject:"bestseller fiction"`,
    `subject:"award winning fiction"`,
    `subject:"contemporary fiction"`,
  ]);
}

export async function getGoogleBooksRecommendations(input: RecommenderInput): Promise<RecommendationResult> {
  const deckKey = input.deckKey;
  const finalLimit = Math.max(1, Math.min(40, input.limit ?? 12));
  const fetchLimit = Math.max(20, Math.min(120, Math.max(finalLimit * 4, input.limit ?? 12)));
  const timeoutMs = Math.max(1000, Math.min(30000, input.timeoutMs ?? 15000));
  const domainMode = deckKeyToDomainMode(deckKey);

  const explicitBucketPlan = (input as any)?.bucketPlan as { queries?: string[]; bucketId?: string } | undefined;
  const planQueries = Array.isArray(explicitBucketPlan?.queries) && explicitBucketPlan?.queries.length
    ? dedupeQueries(explicitBucketPlan.queries)
    : getBucketQueriesFromPlan(explicitBucketPlan?.bucketId);
  const queriesToTry = planQueries?.length ? planQueries : getBucketQueries(deckKey, input);
  const builtFromQuery = queriesToTry[0] || "";

  const minCandidateFloor = Math.max(
    0,
    Math.min(fetchLimit, Number((input as any)?.minCandidateFloor ?? 0) || 0)
  );

  const collectedDocsRaw: any[] = [];
  const seenKeys = new Set<string>();
  let primaryDocsRaw: any[] = [];

  for (let queryIndex = 0; queryIndex < queriesToTry.length; queryIndex += 1) {
    const q = queriesToTry[queryIndex];
    const rawDocs = await googleBooksSearch(q, fetchLimit, {
      orderBy: "relevance",
      langRestrict: "en",
      timeoutMs,
    });

    const admittedDocsRaw = (Array.isArray(rawDocs) ? rawDocs : []).filter((doc: any) => {
      const publisher = doc?.publisher ?? doc?.volumeInfo?.publisher;
      return !isHardSelfPublished(publisher);
    });

    if (queryIndex === 0) {
      primaryDocsRaw = admittedDocsRaw;
    }

    const shouldBackfillFromThisQuery =
      queryIndex === 0 || collectedDocsRaw.length < Math.max(minCandidateFloor, finalLimit * 2);

    if (shouldBackfillFromThisQuery) {
      for (const doc of admittedDocsRaw) {
        const key = String(doc?.key || doc?.id || `${doc?.title || "unknown"}|${queryIndex}`);
        if (seenKeys.has(key)) continue;
        seenKeys.add(key);
        collectedDocsRaw.push({
          ...doc,
          queryRung: queryIndex,
          queryText: q,
          source: "googleBooks",
        });
      }
    }

    if (queryIndex === 0 && primaryDocsRaw.length >= Math.max(1, minCandidateFloor)) break;
    if (collectedDocsRaw.length >= Math.max(fetchLimit, minCandidateFloor)) break;
  }

  const docsRaw =
    primaryDocsRaw.length >= Math.max(1, minCandidateFloor)
      ? primaryDocsRaw.map((doc: any) => ({
          ...doc,
          queryRung: 0,
          queryText: builtFromQuery,
          source: "googleBooks",
        }))
      : collectedDocsRaw.length
        ? collectedDocsRaw
        : primaryDocsRaw.map((doc: any) => ({
            ...doc,
            queryRung: 0,
            queryText: builtFromQuery,
            source: "googleBooks",
          }));

  const docs: RecommendationDoc[] = docsRaw
    .filter((doc: any) => doc && doc.title)
    .map((doc: any) => ({
      key: doc.key ?? doc.id,
      title: doc.title,
      author_name: Array.isArray(doc.author_name) ? doc.author_name : undefined,
      first_publish_year:
        typeof doc.first_publish_year === "number" ? doc.first_publish_year : undefined,
      cover_i: doc.cover_i,
      subject: Array.isArray(doc.subject)
        ? doc.subject
        : Array.isArray(doc.subjects)
          ? doc.subjects
          : Array.isArray(doc.categories)
            ? doc.categories
            : Array.isArray(doc.volumeInfo?.categories)
              ? doc.volumeInfo.categories
              : undefined,
      edition_count:
        typeof doc.edition_count === "number"
          ? doc.edition_count
          : typeof doc.editionCount === "number"
            ? doc.editionCount
            : undefined,
      publisher: doc.publisher,
      language: Array.isArray(doc.language)
        ? doc.language
        : typeof doc.volumeInfo?.language === "string"
          ? [doc.volumeInfo.language]
          : undefined,
      ebook_access: typeof doc.ebook_access === "string" ? doc.ebook_access : undefined,
      source: "googleBooks",
      queryRung: Number.isFinite(Number(doc.queryRung)) ? Number(doc.queryRung) : undefined,
      queryText: typeof doc.queryText === "string" ? doc.queryText : undefined,
      subtitle: typeof doc.subtitle === "string" ? doc.subtitle : undefined,
      description: typeof doc.description === "string" ? doc.description : undefined,
      averageRating: typeof doc.averageRating === "number" ? doc.averageRating : undefined,
      ratingsCount: typeof doc.ratingsCount === "number" ? doc.ratingsCount : undefined,
      volumeInfo: doc.volumeInfo,
    } as any));

  return {
    engineId: "googleBooks",
    engineLabel: "Google Books",
    deckKey,
    domainMode,
    builtFromQuery,
    items: docs.map((doc) => ({ kind: "open_library", doc })),
  };
}
