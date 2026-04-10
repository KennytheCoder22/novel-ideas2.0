// PATCHED GoogleBooks recommender
// /screens/recommenders/googleBooks/googleBooksRecommender.ts
import type { RecommenderInput, RecommendationResult, RecommendationDoc, DeckKey, StructuredFetchRung } from "../types";

function normalizePublisherText(value: any): string {
  return String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
}

const HARD_SELF_PUBLISH_PAT = /(independently published|self[- ]published|createspace|kindle direct publishing|\bkdp\b|amazon digital services|amazon kdp|lulu\.com|lulu press|blurb|smashwords|draft2digital|authorhouse|xlibris|iuniverse|bookbaby|notion press|balboa press|trafford|whitmore publishing)/i;
function isHardSelfPublished(publisher: any): boolean {
  const p = normalizePublisherText(publisher);
  if (!p) return false;
  return HARD_SELF_PUBLISH_PAT.test(p);
}

function normalizeText(value: any): string {
  return String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function normalizeStoredQueryText(query: string): string {
  const raw = String(query || "")
    .replace(/["']/g, " ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  if (!raw) return "";

  const tokens = raw.split(" ").filter(Boolean);
  const deduped: string[] = [];
  for (const token of tokens) {
    if (deduped.length && deduped[deduped.length - 1] === token) continue;
    deduped.push(token);
  }
  return deduped.join(" ");
}

const GOOGLE_BOOKS_REFERENCE_TITLE_PAT = /\b(guide|writer'?s market|studies in|literature|review|digest|catalog|catalogue|bibliography|anthology|encyclopedia|handbook|manual|journal|periodical|proceedings|transactions|magazine|bulletin|report|annual report|yearbook)\b/i;
const GOOGLE_BOOKS_REFERENCE_CATEGORY_PAT = /\b(literary criticism|criticism|bibliography|reference|study aids|language arts|language and literature|periodicals|essays|authorship|creative writing|journals|magazines|reports|proceedings|transactions)\b/i;
const GOOGLE_BOOKS_REFERENCE_AUTHOR_PAT = /\b(university|press|society|association|department of|review|journal)\b/i;

const GOOGLE_BOOKS_LIGHT_HARD_REJECT_TITLE_PAT = /\b(boxed set|box set|omnibus|complete works?|selected works?|stories of the year|illustrated edition|collector'?s edition)\b/i;
const GOOGLE_BOOKS_GENERIC_BUCKET_TITLE_PAT = /^(real\s+)?(mystery|mysteries|thriller|thrillers|crime|detective)(\s+(and|&|\/))?(\s+(mystery|mysteries|thriller|thrillers|crime|detective))+$/i;

function looksLikeGoogleBooksReference(doc: any): boolean {
  const title = normalizeText(doc?.title);
  const subtitle = normalizeText(doc?.subtitle);
  const description = normalizeText(doc?.description);
  const publisher = normalizeText(doc?.publisher ?? doc?.volumeInfo?.publisher);
  const authors = Array.isArray(doc?.author_name) ? doc.author_name.map((a: any) => normalizeText(a)).join(" | ") : "";
  const categories = [
    ...(Array.isArray(doc?.subject) ? doc.subject : []),
    ...(Array.isArray(doc?.subjects) ? doc.subjects : []),
    ...(Array.isArray(doc?.categories) ? doc.categories : []),
    ...(Array.isArray(doc?.volumeInfo?.categories) ? doc.volumeInfo.categories : []),
  ].map((v: any) => normalizeText(v)).join(" | ");
  const text = [title, subtitle, description, publisher, authors, categories].filter(Boolean).join(" | ");

  if (!text) return false;
  if (GOOGLE_BOOKS_REFERENCE_TITLE_PAT.test(title)) return true;
  if (GOOGLE_BOOKS_REFERENCE_CATEGORY_PAT.test(categories)) return true;
  if (GOOGLE_BOOKS_REFERENCE_AUTHOR_PAT.test(authors) && GOOGLE_BOOKS_REFERENCE_CATEGORY_PAT.test(categories)) return true;
  return false;
}

function isGarbageGoogleBooksCandidate(doc: any): boolean {
  const title = normalizeText(doc?.title);
  const subtitle = normalizeText(doc?.subtitle);
  const author = Array.isArray(doc?.author_name)
    ? normalizeText(doc.author_name[0])
    : normalizeText(doc?.volumeInfo?.authors?.[0]);
  const publisher = normalizeText(doc?.publisher ?? doc?.volumeInfo?.publisher);
  const description = normalizeText(doc?.description);
  const categories = [
    ...(Array.isArray(doc?.subject) ? doc.subject : []),
    ...(Array.isArray(doc?.subjects) ? doc.subjects : []),
    ...(Array.isArray(doc?.categories) ? doc.categories : []),
    ...(Array.isArray(doc?.volumeInfo?.categories) ? doc.volumeInfo.categories : []),
  ].map((v: any) => normalizeText(v)).join(" | ");
  const text = [title, subtitle, author, publisher, description, categories].filter(Boolean).join(" | ");

  if (!title || !author) return true;
  if (author === "unknown" || author.length < 3) return true;

  if (/\b(test|ebook|sample|preview|canary)\b/i.test(title)) return true;
  if (/\b(abstracts|theses|dissertations|index|journal|proceedings|transactions|bulletin|report|yearbook|catalog|catalogue)\b/i.test(title)) return true;
  if (/\b(abstracts|theses|dissertations|proceedings|transactions|bulletin|report|catalog|catalogue)\b/i.test(text)) return true;

  if (/\b(film|films|cinema|movie|movies|screen|hollywood|hitchcock)\b/i.test(text)) return true;
  if (/\b(criticism|critical|history of|studies in|analysis)\b/i.test(text)) return true;
  if (/\b(contemporary .* novel)\b/i.test(title)) return true;

  if (GOOGLE_BOOKS_LIGHT_HARD_REJECT_TITLE_PAT.test(title) || GOOGLE_BOOKS_LIGHT_HARD_REJECT_TITLE_PAT.test(subtitle)) return true;
  if (GOOGLE_BOOKS_GENERIC_BUCKET_TITLE_PAT.test(title)) return true;

  if (title.length > 140) return true;

  const tropeRepeats = (title.match(/thriller|romance|fantasy|mystery|suspense/gi) || []).length;
  if (tropeRepeats > 3) return true;

  const seriesMatch = title.match(/\bbook\s*(\d+)\b/i);
  if (seriesMatch) {
    const n = parseInt(seriesMatch[1], 10);
    if (n >= 3 && /\b(fbi|detective|crime|thriller|suspense)\b/i.test(text)) {
      return true;
    }
  }

  if (/\b(paranormal romance|fantasy romance|urban romance|office romance)\b/i.test(text) && /\bcrime thriller|mystery thriller|psychological thriller|detective\b/i.test(text)) {
    return true;
  }

  return false;
}

async function fetchJsonWithRetry(url: string, timeoutMs: number, retries = 3): Promise<any> {
  let attempt = 0;
  while (attempt <= retries) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const resp = await fetch(url, { signal: controller.signal, headers: { Accept: "application/json" } });
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
        throw new Error(body ? `Google Books error: ${resp.status} ${body}` : `Google Books error: ${resp.status}`);
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
  return Number((tagCounts as any)?.["topic:manga"] || 0)
    + Number((tagCounts as any)?.["format:graphic_novel"] || 0)
    + Number((tagCounts as any)?.["format:graphic novel"] || 0)
    + Number((tagCounts as any)?.["media:anime"] || 0)
    + Number((tagCounts as any)?.["genre:superheroes"] || 0);
}

function dedupeQueries(queries: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const query of queries) {
    const trimmed = normalizeStoredQueryText(String(query || ""));
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

function rungToGoogleBooksQuery(rung: StructuredFetchRung): string {
  const primary = String(rung.primary || "").toLowerCase();
  const secondary = String(rung.secondary || "").toLowerCase();
  if (primary.includes("crime thriller")) return "crime thriller novel";
  if (primary.includes("mystery thriller")) return "mystery thriller novel";
  if (primary.includes("detective mystery")) return "detective mystery novel";
  if (primary.includes("science fiction")) return "science fiction novel";
  if (primary.includes("fantasy")) return "fantasy novel";
  if (primary.includes("horror")) return "horror novel";
  if (primary.includes("romance")) return "romance novel";
  if (primary.includes("historical")) return "historical fiction novel";
  if (primary.includes("thriller") && secondary.includes("crime")) return "crime thriller novel";
  if (primary.includes("thriller") && secondary.includes("mystery")) return "mystery thriller novel";
  if (primary.includes("thriller")) return "thriller novel";
  return primary || "fiction";
}

function getBucketQueries(deckKey: DeckKey, input: RecommenderInput): string[] {
  const isVisualDominant = visualSignalWeight(input.tagCounts) >= 4;
  if (isVisualDominant) return dedupeQueries(['subject:manga', 'subject:"graphic novel"', 'subject:comics', 'subject:fiction']);
  if (deckKey === "k2") return dedupeQueries([`subject:"children's fiction"`, `subject:"middle grade fiction"`, `subject:"early reader books"`, `subject:"chapter books"`]);
  if (deckKey === "ms_hs") return dedupeQueries([`subject:"young adult fiction"`, `crime thriller novel`, `epic fantasy novel`]);
  if (deckKey === "36") return dedupeQueries([`subject:"middle grade fiction"`, `subject:"juvenile fiction"`, `subject:"chapter books"`]);
  return dedupeQueries(["crime thriller novel", "mystery thriller novel", "contemporary fiction novel"]);
}

function getGoogleBooksApiKey(): string {
  return process.env.EXPO_PUBLIC_GOOGLE_BOOKS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_BOOKS_API_KEY || process.env.VITE_GOOGLE_BOOKS_API_KEY || process.env.GOOGLE_BOOKS_API_KEY || "";
}

function toGoogleBooksQuery(query: string): string {
  const q = normalizeStoredQueryText(query);
  if (!q) return "";
  if (q.startsWith("subject:")) return q;
  return q;
}

async function googleBooksSearch(query: string, limit: number, timeoutMs: number): Promise<any[]> {
  const q = toGoogleBooksQuery(query);
  if (!q) return [];
  const maxResults = Math.max(1, Math.min(40, Number(limit) || 10));
  const apiKey = getGoogleBooksApiKey();
  const params = new URLSearchParams({ q, maxResults: String(maxResults), orderBy: "relevance", printType: "books", projection: "full", langRestrict: "en" });
  if (apiKey) params.set("key", apiKey);
  const url = `https://www.googleapis.com/books/v1/volumes?${params.toString()}`;
  const json = await fetchJsonWithRetry(url, timeoutMs);
  const items = Array.isArray(json?.items) ? json.items : [];
  return items.map((item: any) => {
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
      first_publish_year: typeof volumeInfo.publishedDate === "string" && /^\d{4}/.test(volumeInfo.publishedDate)
        ? Number(volumeInfo.publishedDate.slice(0, 4))
        : undefined,
      publisher: volumeInfo.publisher,
      description: typeof volumeInfo.description === "string"
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
      ebook_access: accessInfo?.epub?.isAvailable ? "epub" : accessInfo?.pdf?.isAvailable ? "pdf" : saleInfo?.isEbook ? "ebook" : "no_ebook",
      volumeInfo,
    };
  }).filter((doc: any) => doc && doc.title);
}

export async function getGoogleBooksRecommendations(input: RecommenderInput): Promise<RecommendationResult> {
  const deckKey = input.deckKey;
  const finalLimit = Math.max(1, Math.min(40, input.limit ?? 12));
  const fetchLimit = Math.max(60, Math.min(200, finalLimit * 6));
  const timeoutMs = Math.max(1000, Math.min(30000, input.timeoutMs ?? 15000));
  const domainMode = deckKeyToDomainMode(deckKey);

  const explicitBucketPlan = (input as any)?.bucketPlan as { queries?: string[]; rungs?: StructuredFetchRung[] } | undefined;
  const planQueries = Array.isArray(explicitBucketPlan?.rungs) && explicitBucketPlan!.rungs!.length > 0
    ? explicitBucketPlan!.rungs!.map(rungToGoogleBooksQuery)
    : (Array.isArray(explicitBucketPlan?.queries) && explicitBucketPlan?.queries?.length
      ? dedupeQueries(explicitBucketPlan.queries)
      : getBucketQueries(deckKey, input));

  const queriesToTry = planQueries.length ? planQueries : getBucketQueries(deckKey, input);
  const builtFromQuery = normalizeStoredQueryText(queriesToTry[0] || "");
  const minCandidateFloor = Math.max(0, Math.min(fetchLimit, Number((input as any)?.minCandidateFloor ?? 0) || 0));
  const collectedDocsRaw: any[] = [];
  const rawPoolRows: any[] = [];
  const seenKeys = new Set<string>();
  let primaryDocsRaw: any[] = [];
  let totalRawFetched = 0;
  const minQueryPassesBeforeEarlyExit = Math.min(4, queriesToTry.length);

  for (let queryIndex = 0; queryIndex < queriesToTry.length; queryIndex += 1) {
    const q = normalizeStoredQueryText(queriesToTry[queryIndex]);
    const rawDocs = await googleBooksSearch(q, fetchLimit, timeoutMs);
    totalRawFetched += Array.isArray(rawDocs) ? rawDocs.length : 0;
    for (const rawDoc of Array.isArray(rawDocs) ? rawDocs : []) {
      rawPoolRows.push({
        title: rawDoc?.title,
        author: Array.isArray(rawDoc?.author_name) ? rawDoc.author_name[0] : undefined,
        source: "googleBooks",
        queryText: q,
        queryRung: queryIndex,
      });
    }
    const admittedDocsRaw = (Array.isArray(rawDocs) ? rawDocs : []).filter((doc: any) => {
      const publisher = doc?.publisher ?? doc?.volumeInfo?.publisher;
      if (isHardSelfPublished(publisher)) return false;
      if (looksLikeGoogleBooksReference(doc)) return false;
      if (isGarbageGoogleBooksCandidate(doc)) return false;
      return true;
    });

    if (queryIndex === 0) primaryDocsRaw = admittedDocsRaw;

    const shouldBackfillFromThisQuery = queryIndex === 0 || collectedDocsRaw.length < Math.max(minCandidateFloor, finalLimit * 2);
    if (shouldBackfillFromThisQuery) {
      for (const doc of admittedDocsRaw) {
        const key = String(doc?.key || doc?.id || `${doc?.title || "unknown"}|${queryIndex}`);
        if (seenKeys.has(key)) continue;
        seenKeys.add(key);
        collectedDocsRaw.push({ ...doc, queryRung: queryIndex, queryText: q, source: "googleBooks" });
      }
    }

    const enoughCandidates = collectedDocsRaw.length >= Math.max(fetchLimit, minCandidateFloor);
    if (queryIndex + 1 >= minQueryPassesBeforeEarlyExit && enoughCandidates) break;
  }

  const docsRaw = collectedDocsRaw.length
    ? collectedDocsRaw
    : primaryDocsRaw.map((doc: any) => ({ ...doc, queryRung: 0, queryText: builtFromQuery, source: "googleBooks" }));

  const docs: RecommendationDoc[] = docsRaw.filter((doc: any) => doc && doc.title).map((doc: any) => ({
    key: doc.key ?? doc.id,
    title: doc.title,
    author_name: Array.isArray(doc.author_name) ? doc.author_name : undefined,
    first_publish_year: typeof doc.first_publish_year === "number" ? doc.first_publish_year : undefined,
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
    edition_count: typeof doc.edition_count === "number" ? doc.edition_count : typeof doc.editionCount === "number" ? doc.editionCount : undefined,
    publisher: doc.publisher,
    language: Array.isArray(doc.language) ? doc.language : typeof doc.volumeInfo?.language === "string" ? [doc.volumeInfo.language] : undefined,
    ebook_access: typeof doc.ebook_access === "string" ? doc.ebook_access : undefined,
    source: "googleBooks",
    queryRung: Number.isFinite(Number(doc.queryRung)) ? Number(doc.queryRung) : undefined,
    queryText: typeof doc.queryText === "string" ? normalizeStoredQueryText(doc.queryText) : undefined,
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
    debugRawFetchedCount: totalRawFetched,
    debugRawPool: rawPoolRows,
  };
}

// PATCH APPLIED: revert to working baseline and add only lightweight query normalization + specific noise suppressors
