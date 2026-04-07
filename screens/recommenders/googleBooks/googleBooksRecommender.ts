// /screens/recommenders/googleBooks/googleBooksRecommender.ts
//
// Google Books recommendation engine.
// Thin fetcher only: fetch broad bucket queries and return raw docs.
// Ranking, normalization, dedupe, novelty, and final selection belong downstream.

import type { RecommenderInput, RecommendationResult, RecommendationDoc, DeckKey } from "../types";

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

function normalizeText(value: any): string {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

const GOOGLE_BOOKS_REFERENCE_TITLE_PAT =
  /\b(guide|writer'?s market|studies in|literature|review|digest|catalog|catalogue|bibliography|anthology|encyclopedia|handbook|manual|journal|periodical|proceedings|transactions|magazine|bulletin|report|annual report|yearbook)\b/i;

const GOOGLE_BOOKS_REFERENCE_CATEGORY_PAT =
  /\b(literary criticism|criticism|bibliography|reference|study aids|language arts|language and literature|periodicals|essays|authorship|creative writing|journals|magazines|reports|proceedings|transactions)\b/i;

const GOOGLE_BOOKS_REFERENCE_AUTHOR_PAT =
  /\b(university|press|society|association|department of|review|journal)\b/i;

function looksLikeGoogleBooksReference(doc: any): boolean {
  const title = normalizeText(doc?.title);
  const subtitle = normalizeText(doc?.subtitle);
  const description = normalizeText(doc?.description);
  const publisher = normalizeText(doc?.publisher ?? doc?.volumeInfo?.publisher);

  const authors = Array.isArray(doc?.author_name)
    ? doc.author_name.map((a: any) => normalizeText(a)).join(" | ")
    : "";

  const categories = [
    ...(Array.isArray(doc?.subject) ? doc.subject : []),
    ...(Array.isArray(doc?.subjects) ? doc.subjects : []),
    ...(Array.isArray(doc?.categories) ? doc.categories : []),
    ...(Array.isArray(doc?.volumeInfo?.categories) ? doc.volumeInfo.categories : []),
  ]
    .map((v: any) => normalizeText(v))
    .join(" | ");

  const text = [title, subtitle, description, publisher, authors, categories]
    .filter(Boolean)
    .join(" | ");

  if (!text) return false;

  if (GOOGLE_BOOKS_REFERENCE_TITLE_PAT.test(title)) return true;
  if (GOOGLE_BOOKS_REFERENCE_CATEGORY_PAT.test(categories)) return true;

  if (
    /\b(best fiction|short story writer'?s market|writer'?s market|studies in language and literature|publishers weekly|living age)\b/i.test(
      text
    )
  ) {
    return true;
  }

  if (
    GOOGLE_BOOKS_REFERENCE_AUTHOR_PAT.test(authors) &&
    GOOGLE_BOOKS_REFERENCE_CATEGORY_PAT.test(categories)
  ) {
    return true;
  }

  return false;
}

function looksLikeCatalogOrCollectionTitle(title: any): boolean {
  const t = normalizeText(title);
  if (!t) return false;

  return /\b(library|catalog|catalogue|bulletin|handbook|manual|encyclopedia|reference|companion|report|yearbook|anthology|collection|collected works|selected works|short stories|great short stories|stories of|books for all|among our books|essential information)\b/i.test(t);
}

function hasExplicitFictionSignal(doc: any): boolean {
  const categories = [
    ...(Array.isArray(doc?.subject) ? doc.subject : []),
    ...(Array.isArray(doc?.subjects) ? doc.subjects : []),
    ...(Array.isArray(doc?.categories) ? doc.categories : []),
    ...(Array.isArray(doc?.volumeInfo?.categories) ? doc.volumeInfo.categories : []),
  ]
    .map((v: any) => normalizeText(v))
    .join(" | ");

  const title = normalizeText(doc?.title);
  const subtitle = normalizeText(doc?.subtitle);
  const description = normalizeText(doc?.description);
  const text = [title, subtitle, description, categories].filter(Boolean).join(" | ");

  return /\b(fiction|novel|thriller|mystery|crime|detective|suspense|psychological thriller|murder)\b/i.test(text);
}

async function fetchJsonWithRetry(url: string, timeoutMs: number, retries = 3): Promise<any> {
  let attempt = 0;

  while (attempt <= retries) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const resp = await fetch(url, {
        signal: controller.signal,
        headers: { Accept: "application/json" },
      });

      if (resp.status === 429) {
        if (attempt === retries) {
          const body = await resp.text().catch(() => "");
          throw new Error(body ? `Google Books 429 ${body}` : "Google Books 429");
        }
        await new Promise((resolve) => setTimeout(resolve, 500 * Math.pow(2, attempt)));
        attempt += 1;
        continue;
      }

      if (!resp.ok) {
        const body = await resp.text().catch(() => "");
        const message = body ? `Google Books error: ${resp.status} ${body}` : `Google Books error: ${resp.status}`;
        throw new Error(message);
      }

      return await resp.json();
    } catch (err) {
      if (attempt === retries) throw err;
      await new Promise((resolve) => setTimeout(resolve, 500 * Math.pow(2, attempt)));
      attempt += 1;
    } finally {
      clearTimeout(timer);
    }
  }

  throw new Error("Google Books retry loop exhausted");
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
    "crime thriller novel",
    "psychological thriller novel",
    "serial killer thriller novel",
    "legal thriller novel",
    "detective thriller novel",
    "murder mystery novel",
    "spy thriller novel",
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

type GoogleBooksSearchOptions = {
  orderBy?: "relevance" | "newest";
  langRestrict?: string;
  timeoutMs?: number;
};

function getGoogleBooksApiKey(): string {
  return (
    process.env.EXPO_PUBLIC_GOOGLE_BOOKS_API_KEY ||
    process.env.NEXT_PUBLIC_GOOGLE_BOOKS_API_KEY ||
    process.env.VITE_GOOGLE_BOOKS_API_KEY ||
    process.env.GOOGLE_BOOKS_API_KEY ||
    ""
  );
}

function toGoogleBooksQuery(query: string): string {
  let q = String(query || "").toLowerCase();
  if (!q.trim()) return "";

  // Strip negative filter syntax and other unsupported query operators
  q = q.replace(/-\w+/g, " ");

  // Remove weak / misleading adjectives and scenario terms that create noisy lexical matches
  q = q
    .replace(/\bdark\b/g, "")
    .replace(/\bfunny\b/g, "")
    .replace(/\bgritty\b/g, "")
    .replace(/\bgrounded\b/g, "")
    .replace(/\bintense\b/g, "")
    .replace(/\bsocietal\b/g, "")
    .replace(/\bsurvival\b/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (q.startsWith("subject:")) {
    const subject = q.slice("subject:".length).trim().replace(/^"+|"+$/g, "");
    return `subject:${subject}`;
  }

  // Compress rich descriptive queries into a few engine-friendly genre anchors
  if (q.includes("dystopian")) return "dystopian science fiction novel";
  if (q.includes("science fiction")) return "science fiction novel";
  if (q.includes("thriller")) return "thriller novel";
  if (q.includes("romance")) return "romance novel";
  if (q.includes("fantasy")) return "fantasy novel";
  if (q.includes("horror")) return "horror novel";
  if (q.includes("mystery")) return "mystery novel";
  if (q.includes("crime")) return "crime thriller novel";
  if (q.includes("historical")) return "historical fiction novel";

  return q;
}

async function googleBooksSearch(
  query: string,
  limit: number,
  options: GoogleBooksSearchOptions = {}
): Promise<any[]> {
  const q = toGoogleBooksQuery(query);
  if (!q) return [];

  const maxResults = Math.max(1, Math.min(40, Number(limit) || 10));
  const timeoutMs = Math.max(1000, Math.min(30000, options.timeoutMs ?? 15000));
  const orderBy = options.orderBy ?? "relevance";
  const langRestrict = options.langRestrict || "en";
  const apiKey = getGoogleBooksApiKey();

  const params = new URLSearchParams({
    q,
    maxResults: String(maxResults),
    orderBy,
    printType: "books",
    projection: "full",
    langRestrict,
  });

  if (apiKey) {
    params.set("key", apiKey);
  }

  const url = `https://www.googleapis.com/books/v1/volumes?${params.toString()}`;
  const json = await fetchJsonWithRetry(url, timeoutMs);
  const items = Array.isArray(json?.items) ? json.items : [];

  return items
    .map((item: any) => {
      const volumeInfo = item?.volumeInfo ?? {};
      const accessInfo = item?.accessInfo ?? {};
      const saleInfo = item?.saleInfo ?? {};
      const searchInfo = item?.searchInfo ?? {};
      const authors = Array.isArray(volumeInfo.authors) ? volumeInfo.authors : [];
      const categories = Array.isArray(volumeInfo.categories) ? volumeInfo.categories : [];
      const imageLinks = volumeInfo.imageLinks ?? {};

      return {
        id: item?.id,
        key: item?.id,
        title: volumeInfo.title,
        subtitle: volumeInfo.subtitle,
        author_name: authors.length ? authors : undefined,
        first_publish_year:
          typeof volumeInfo.publishedDate === "string" && /^\d{4}/.test(volumeInfo.publishedDate)
            ? Number(volumeInfo.publishedDate.slice(0, 4))
            : undefined,
        publisher: volumeInfo.publisher,
        description:
          typeof volumeInfo.description === "string"
            ? volumeInfo.description
            : typeof searchInfo?.textSnippet === "string"
              ? searchInfo.textSnippet
              : undefined,
        averageRating: typeof volumeInfo.averageRating === "number" ? volumeInfo.averageRating : undefined,
        ratingsCount: typeof volumeInfo.ratingsCount === "number" ? volumeInfo.ratingsCount : undefined,
        pageCount: typeof volumeInfo.pageCount === "number" ? volumeInfo.pageCount : undefined,
        edition_count: 1,
        cover_i: imageLinks.thumbnail || imageLinks.smallThumbnail,
        subject: categories.length ? categories : undefined,
        subjects: categories.length ? categories : undefined,
        categories,
        language: typeof volumeInfo.language === "string" ? [volumeInfo.language] : undefined,
        ebook_access:
          accessInfo?.epub?.isAvailable
            ? "epub"
            : accessInfo?.pdf?.isAvailable
              ? "pdf"
              : saleInfo?.isEbook
                ? "ebook"
                : "no_ebook",
        volumeInfo,
      };
    })
    .filter((doc: any) => doc && doc.title);
}

export async function getGoogleBooksRecommendations(input: RecommenderInput): Promise<RecommendationResult> {
  const deckKey = input.deckKey;
  const finalLimit = Math.max(1, Math.min(40, input.limit ?? 12));
  const fetchLimit = Math.max(60, Math.min(200, finalLimit * 6));
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
  const minQueryPassesBeforeEarlyExit = Math.min(4, queriesToTry.length);

  for (let queryIndex = 0; queryIndex < queriesToTry.length; queryIndex += 1) {
    const q = queriesToTry[queryIndex];
    const rawDocs = await googleBooksSearch(q, fetchLimit, {
      orderBy: "relevance",
      langRestrict: "en",
      timeoutMs,
    });

    const admittedDocsRaw = (Array.isArray(rawDocs) ? rawDocs : []).filter((doc: any) => {
      const publisher = doc?.publisher ?? doc?.volumeInfo?.publisher;

      if (isHardSelfPublished(publisher)) return false;
      if (looksLikeGoogleBooksReference(doc)) return false;

      return true;
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

    const enoughCandidates =
      collectedDocsRaw.length >= Math.max(fetchLimit, minCandidateFloor);

    if (queryIndex + 1 >= minQueryPassesBeforeEarlyExit && enoughCandidates) break;
  }

  const docsRaw = collectedDocsRaw.length
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
