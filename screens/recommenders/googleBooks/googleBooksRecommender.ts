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


const GOOGLE_BOOKS_PROCUREMENT_NEGATIVE_TERMS = [
  "boxed set",
  "box set",
  "omnibus",
  "anthology",
  "collection",
  "guide",
  "handbook",
  "reference",
  "criticism",
  "analysis",
  "study guide",
  "readers advisory",
  "magazine",
  "journal",
  "catalog",
  "catalogue",
  "bibliography",
  "biography",
  "memoir",
  "essays",
  "textbook",
  "textbooks",
  "companion",
  "companions",
  "series starter",
  "book 1",
  "book one",
  "fbi suspense thriller",
  "fbi thriller",
];

function addGoogleBooksProcurementHygiene(query: string): string {
  const q = normalizeStoredQueryText(query);
  if (!q || q.startsWith("subject:")) return q;

  const alreadyHasNegatives = /\s-\w+/.test(q);
  const negatives = GOOGLE_BOOKS_PROCUREMENT_NEGATIVE_TERMS
    .filter((term) => !q.includes(`-${term.replace(/\s+/g, "-")}`))
    .map((term) => term.includes(" ") ? `-"${term}"` : `-${term}`)
    .join(" ");

  // Keep user/taste intent intact, but bias Google Books away from things a
  // patron cannot reasonably buy or find on a physical shelf.
  return alreadyHasNegatives ? q : `${q} ${negatives}`.replace(/\s+/g, " ").trim();
}

function hasIndustryIdentifier(doc: any): boolean {
  const identifiers = doc?.volumeInfo?.industryIdentifiers;
  return Array.isArray(identifiers) && identifiers.some((id: any) => String(id?.identifier || "").trim());
}

function hasGoogleBooksPurchaseSignal(doc: any): boolean {
  const saleInfo = doc?.saleInfo || doc?.volumeInfo?.saleInfo || {};
  const accessInfo = doc?.accessInfo || doc?.volumeInfo?.accessInfo || {};
  const saleability = String(saleInfo?.saleability || "").toUpperCase();

  return Boolean(
    saleInfo?.buyLink ||
    saleability === "FOR_SALE" ||
    saleInfo?.isEbook ||
    accessInfo?.epub?.isAvailable ||
    accessInfo?.pdf?.isAvailable
  );
}

function hasMainstreamPublisherSignal(doc: any): boolean {
  const publisher = normalizeText(doc?.publisher ?? doc?.volumeInfo?.publisher);
  return /\b(penguin|random house|knopf|doubleday|viking|harper|macmillan|tor|simon\s*&?\s*schuster|hachette|st\.? martin|ballantine|minotaur|mysterious press|little brown|grand central|sourcebooks|kensington|crooked lane|berkley|delacorte|del rey|orbit|ace|roc|anchor|scribner|atria|william morrow|putnam|mulholland|flatiron)\b/.test(publisher);
}

function hasShelfAvailabilitySignal(doc: any): boolean {
  const year = Number(doc?.first_publish_year || 0);
  const ratings = Number(doc?.ratingsCount ?? doc?.volumeInfo?.ratingsCount ?? 0);
  const hasCover = hasGoogleBooksCoverSignal(doc);
  const hasId = hasIndustryIdentifier(doc);
  const hasPurchase = hasGoogleBooksPurchaseSignal(doc);
  const mainstreamPublisher = hasMainstreamPublisherSignal(doc);

  return Boolean(
    hasPurchase ||
    (hasId && hasCover && year >= 1990) ||
    (mainstreamPublisher && hasCover && year >= 1980) ||
    ratings >= 25
  );
}

function looksLikeLowProcurementGoogleBooksCandidate(doc: any): boolean {
  const year = Number(doc?.first_publish_year || 0);
  const ratings = Number(doc?.ratingsCount ?? doc?.volumeInfo?.ratingsCount ?? 0);
  const hasCover = hasGoogleBooksCoverSignal(doc);
  const hasId = hasIndustryIdentifier(doc);
  const mainstreamPublisher = hasMainstreamPublisherSignal(doc);

  // Allow canonical/backlist items through elsewhere by publisher/ratings; reject
  // only the obscure metadata-thin rows that are unlikely to be findable in stores.
  if (hasShelfAvailabilitySignal(doc)) return false;
  if (year > 0 && year < 1980 && !mainstreamPublisher && ratings < 25) return true;
  if (!hasId && !hasCover && ratings < 25) return true;
  return false;
}

const GOOGLE_BOOKS_REFERENCE_TITLE_PAT = /\b(guide|writer'?s market|studies in|literature|review|digest|catalog|catalogue|bibliography|anthology|encyclopedia|dictionary|handbook|manual|journal|periodical|proceedings|transactions|magazine|bulletin|report|annual report|yearbook|readings?|reader|criticism|critical|redefining|history and criticism|summary|study guide|textbook)\b/i;
const GOOGLE_BOOKS_REFERENCE_CATEGORY_PAT = /\b(literary criticism|criticism|bibliography|reference|study aids|language arts|language and literature|periodicals|essays|authorship|creative writing|journals|magazines|reports|proceedings|transactions|history and criticism|readings?|encyclopedia|textbook|study guide)\b/i;
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

function hasGoogleBooksCoverSignal(doc: any): boolean {
  if (Boolean(doc?.cover_i)) return true;
  const imageLinks = doc?.imageLinks ?? doc?.volumeInfo?.imageLinks;
  return Boolean(imageLinks?.thumbnail || imageLinks?.smallThumbnail || imageLinks?.small || imageLinks?.medium || imageLinks?.large);
}

function looksLikeNoCoverMetaGoogleBooksCandidate(doc: any): boolean {
  if (hasGoogleBooksCoverSignal(doc)) return false;

  const title = normalizeText(doc?.title);
  const subtitle = normalizeText(doc?.subtitle);
  const description = normalizeText(doc?.description);
  const categories = [
    ...(Array.isArray(doc?.subject) ? doc.subject : []),
    ...(Array.isArray(doc?.subjects) ? doc.subjects : []),
    ...(Array.isArray(doc?.categories) ? doc.categories : []),
    ...(Array.isArray(doc?.volumeInfo?.categories) ? doc.volumeInfo.categories : []),
  ].map((v: any) => normalizeText(v)).join(" | ");
  const text = [title, subtitle, description, categories].filter(Boolean).join(" | ");
  const pageCount = Number(doc?.pageCount ?? doc?.volumeInfo?.pageCount ?? 0);
  const ratingsCount = Number(doc?.ratingsCount ?? doc?.volumeInfo?.ratingsCount ?? 0);

  const metaShape =
    looksLikeGoogleBooksReference(doc) ||
    /\b(readings?|reader|criticism|critical|study|studies|analysis|essays?|companion|guide|reference|bibliography|catalogue?|catalog|survey|history of|history and criticism|in fiction|historical novels?|literary criticism)\b/.test(text) ||
    /\b(readings?\b.*\b(novel|fiction|literature)|century readings?\b.*\bnovel|redefining\b.*\bfiction|(life|women|race|gender|class)\b.*\bin fiction)\b/.test(title);

  const weakShape = pageCount === 0 || pageCount < 120 || ratingsCount === 0;
  return metaShape || (weakShape && /\b(novel|fiction|literature)\b/.test(text) && !/\b(follows|story of|thriller|mystery|horror|fantasy|romance)\b/.test(description));
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
  if (looksLikeNoCoverMetaGoogleBooksCandidate(doc)) return true;

  if (/\b(test|ebook|sample|preview|canary)\b/i.test(title)) return true;
  if (/\b(abstracts|theses|dissertations|index|journal|proceedings|transactions|bulletin|report|yearbook|catalog|catalogue|encyclopedia|dictionary|textbook)\b/i.test(title)) return true;
  if (/\b(abstracts|theses|dissertations|proceedings|transactions|bulletin|report|catalog|catalogue|encyclopedia|dictionary|textbook|literary criticism)\b/i.test(text)) return true;
  if (/\b(summary|study guide|teacher'?s guide|lesson plans?|cliffsnotes|sparknotes|book notes?)\b/i.test(text)) return true;
  if (/\b(how to write|writing workbook|writing prompts?|author workbook)\b/i.test(text)) return true;

  if (/\b(film|films|cinema|movie|movies|screen|hollywood|hitchcock)\b/i.test(text)) return true;
  if (/\b(criticism|critical|history of|studies in|analysis)\b/i.test(text)) return true;
  if (/\b(contemporary .* novel)\b/i.test(title)) return true;

  if (GOOGLE_BOOKS_LIGHT_HARD_REJECT_TITLE_PAT.test(title) || GOOGLE_BOOKS_LIGHT_HARD_REJECT_TITLE_PAT.test(subtitle)) return true;
  if (/\b(best american|year'?s best|boxed set|box set|bundle|bundles|omnibus|complete novels?|collected works|guide to writing|how to write|write a bestseller|writer'?s handbook|writers'? market|readers'? advisory|advisory guide|pocket guide|review digest)\b/i.test(title) || /\b(best american|year'?s best|boxed set|box set|bundle|bundles|omnibus|guide to writing|how to write|write a bestseller)\b/i.test(subtitle)) return true;
  if (GOOGLE_BOOKS_GENERIC_BUCKET_TITLE_PAT.test(title)) return true;

  if (title.length > 140) return true;

  const tropeRepeats = (title.match(/thriller|romance|fantasy|mystery|suspense/gi) || []).length;
  if (tropeRepeats > 3) return true;

  const seriesMatch = title.match(/\bbook\s*(\d+)\b/i);
  if (seriesMatch) {
    const n = parseInt(seriesMatch[1], 10);
    const lowAuthority = Number(doc?.ratingsCount ?? doc?.volumeInfo?.ratingsCount ?? 0) < 25;
    if (n >= 2 && lowAuthority && /\b(fbi|detective|crime|thriller|suspense)\b/i.test(text)) {
      return true;
    }
  }

  const formulaAuthor = /\b(blake pierce|ava strong|jack mars|morgan rice|harper lin)\b/i.test(author);
  const formulaTitle = /\b(a|an)\s+[a-z]+\s+(fbi|detective|crime|mystery|suspense)\s+thriller\b/i.test(title);
  const lowAuthority = Number(doc?.ratingsCount ?? doc?.volumeInfo?.ratingsCount ?? 0) < 25;
  const zeroRating = Number(doc?.ratingsCount ?? doc?.volumeInfo?.ratingsCount ?? 0) <= 0;
  const strongCommercialAuthority =
    hasShelfAvailabilitySignal(doc) ||
    hasMainstreamPublisherSignal(doc) ||
    Number(doc?.ratingsCount ?? doc?.volumeInfo?.ratingsCount ?? 0) >= 120;
  if ((formulaAuthor || formulaTitle) && lowAuthority && !strongCommercialAuthority) return true;
  if (zeroRating && (formulaAuthor || /\b(book|volume|part)\s*\d+\b/i.test(title)) && /\b(fbi|detective|crime|thriller|suspense)\b/i.test(text) && !strongCommercialAuthority) return true;

  if (/\b(paranormal romance|fantasy romance|urban romance|office romance)\b/i.test(text) && /\bcrime thriller|mystery thriller|psychological thriller|detective\b/i.test(text)) {
    return true;
  }

  // HARD REJECT: low-quality horror-story spam
  if (/\bhorror story\b/.test(title) && /\b(scary|ghost|paranormal|supernatural)\b/.test(text)) {
    return true;
  }

  // HARD REJECT: generic paranormal/scary-ghost packaging
  if (/\bscary ghosts?\b|\bparanormal horror story\b/.test(text)) {
    return true;
  }

  // HARD REJECT: writing / author advice bleed
  if (/\b(write a novel|how to write|writer'?s market|writing guide|writing handbook)\b/.test(text)) {
    return true;
  }

  // HARD REJECT: horror-adjacent reference books
  if (/\b(dictionary|companion|guide|handbook)\b/.test(title) && /\b(horror|fiction|literature)\b/.test(text)) {
    return true;
  }

  return false;
}


function isClearlyNotNarrativeBook(doc: any): boolean {
  const text = [
    doc?.title,
    doc?.subtitle,
    doc?.description,
    ...(Array.isArray(doc?.volumeInfo?.categories) ? doc.volumeInfo.categories : []),
    ...(Array.isArray(doc?.categories) ? doc.categories : []),
    ...(Array.isArray(doc?.subject) ? doc.subject : []),
    ...(Array.isArray(doc?.subjects) ? doc.subjects : []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (!text) return false;

  if (/\b(workbook|textbook|study guide|manual|handbook|guide|reference)\b/.test(text)) return true;
  if (/\b(essay|essays|philosophy|treatise|apology for|scepticism|critique)\b/.test(text)) return true;
  if (/\b(erotic|bdsm|explicit|taboo|alpha male|virgin|first time)\b/.test(text)) return true;
  if (/\b(history of|themes in|study of|analysis of)\b/.test(text)) return true;

  return false;
}

function looksLikeLowAuthorityLegacyLibraryTitle(doc: any): boolean {
  const year = Number(doc?.first_publish_year || 0);
  const ratings = Number(doc?.ratingsCount ?? doc?.volumeInfo?.ratingsCount ?? 0);
  const publisher = normalizeText(doc?.publisher ?? doc?.volumeInfo?.publisher);
  const text = normalizeText([doc?.title, doc?.subtitle, doc?.description].filter(Boolean).join(" "));
  const strongAuthority = hasShelfAvailabilitySignal(doc) || hasMainstreamPublisherSignal(doc) || ratings >= 50;
  if (strongAuthority) return false;
  if (year > 0 && year < 1975 && ratings === 0) return true;
  if (/\b(public library|library edition|catalog card|reference desk|circulation)\b/.test(`${publisher} ${text}`)) return true;
  return false;
}

function hasStrongAuthoritySignal(doc: any): boolean {
  const ratings = Number(doc?.ratingsCount ?? doc?.volumeInfo?.ratingsCount ?? 0);
  return Boolean(
    hasShelfAvailabilitySignal(doc) ||
    hasMainstreamPublisherSignal(doc) ||
    ratings >= 120 ||
    doc?.saleInfo?.buyLink ||
    String(doc?.saleability || doc?.saleInfo?.saleability || "").toUpperCase() === "FOR_SALE"
  );
}

function hasStrongNarrativeShapeSignal(doc: any): boolean {
  const title = normalizeText(doc?.title ?? doc?.volumeInfo?.title);
  const description = normalizeText(doc?.description ?? doc?.volumeInfo?.description);
  const pageCount = Number(doc?.pageCount ?? doc?.volumeInfo?.pageCount ?? 0);
  const hasNarrativeLexicon =
    /\b(thriller|mystery|crime|suspense|horror|fantasy|science fiction|novel|fiction)\b/.test(title) ||
    /\b(follows|story of|must uncover|must survive|investigates|killer|missing|case|obsession|conspiracy|haunted)\b/.test(description);
  return hasNarrativeLexicon && (pageCount >= 140 || description.length > 180);
}

function capRawDocsPerAuthor(docs: any[], queryFamily: string, maxPerAuthor = 2): any[] {
  const out: any[] = [];
  const authorCounts = new Map<string, number>();
  for (const doc of Array.isArray(docs) ? docs : []) {
    const author = normalizeText(Array.isArray(doc?.author_name) ? doc.author_name[0] : doc?.volumeInfo?.authors?.[0]) || "unknown";
    const key = `${queryFamily}:${author}`;
    const count = authorCounts.get(key) || 0;
    if (count >= maxPerAuthor) continue;
    authorCounts.set(key, count + 1);
    out.push(doc);
  }
  return out;
}

function enforceEarlyIntakeQualityAndDiversity(docs: any[], queryFamily: string): any[] {
  const primarySeeded = (Array.isArray(docs) ? docs : []).filter((doc) => {
    if (!doc?.title) return false;
    if (looksLikeGoogleBooksReference(doc)) return false;
    if (isClearlyNotNarrativeBook(doc)) return false;
    if (looksLikeLowAuthorityLegacyLibraryTitle(doc)) return false;
    if (isGarbageGoogleBooksCandidate(doc)) return false;
    const ratings = Number(doc?.ratingsCount ?? doc?.volumeInfo?.ratingsCount ?? 0);
    if (ratings === 0 && !(hasStrongAuthoritySignal(doc) || hasStrongNarrativeShapeSignal(doc))) return false;
    return true;
  });

  // If strict intake gets too thin, widen early intake slightly and let downstream
  // final filters/ranking enforce stricter quality floors.
  const seeded = primarySeeded.length >= 12
    ? primarySeeded
    : (Array.isArray(docs) ? docs : []).filter((doc) => {
        if (!doc?.title) return false;
        if (looksLikeGoogleBooksReference(doc)) return false;
        if (isClearlyNotNarrativeBook(doc)) return false;
        if (looksLikeLowAuthorityLegacyLibraryTitle(doc)) return false;
        const ratings = Number(doc?.ratingsCount ?? doc?.volumeInfo?.ratingsCount ?? 0);
        if (ratings === 0 && !(hasStrongAuthoritySignal(doc) || hasStrongNarrativeShapeSignal(doc))) return false;
        return true;
      });

  const capped: any[] = [];
  const authorCounts = new Map<string, number>();
  for (const doc of seeded) {
    const author = normalizeText(Array.isArray(doc?.author_name) ? doc.author_name[0] : doc?.volumeInfo?.authors?.[0]) || "unknown";
    const ratings = Number(doc?.ratingsCount ?? doc?.volumeInfo?.ratingsCount ?? 0);
    const maxPerAuthor = ratings === 0 && !hasStrongAuthoritySignal(doc) ? 1 : 2;
    const key = `${queryFamily}:${author}`;
    const count = authorCounts.get(key) || 0;
    if (count >= maxPerAuthor) continue;
    authorCounts.set(key, count + 1);
    capped.push(doc);
  }

  const total = capped.length;
  if (total < 4) return capped;

  let dominantKey = "";
  let dominantCount = 0;
  authorCounts.forEach((count, key) => {
    if (count > dominantCount) {
      dominantCount = count;
      dominantKey = key;
    }
  });
  if (dominantCount / total <= 0.3) return capped;

  const maxAllowedDominant = Math.max(1, Math.floor(total * 0.3));
  let keptDominant = 0;
  return capped.filter((doc) => {
    const author = normalizeText(Array.isArray(doc?.author_name) ? doc.author_name[0] : doc?.volumeInfo?.authors?.[0]) || "unknown";
    const key = `${queryFamily}:${author}`;
    if (key !== dominantKey) return true;
    if (keptDominant >= maxAllowedDominant) return false;
    keptDominant += 1;
    return true;
  });
}

function buildAuthorityBackfillQueries(queryFamily: string): string[] {
  if (queryFamily === "thriller") {
    return [
      'inauthor:"Gillian Flynn" psychological thriller novel',
      'inauthor:"Dennis Lehane" thriller novel',
      'inauthor:"Thomas Harris" thriller novel',
      '"shutter island" thriller novel',
      '"gone girl" thriller novel',
    ];
  }
  if (queryFamily === "mystery") {
    return [
      'inauthor:"Tana French" mystery novel',
      'inauthor:"Louise Penny" detective mystery novel',
      '"the girl with the dragon tattoo" mystery novel',
    ];
  }
  return [
    'bestseller fiction novel',
    'award winning fiction novel',
  ];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryDelayMs(attempt: number, status?: number): number {
  const base = status === 429 ? 1250 : 700;
  const jitter = Math.floor(Math.random() * 250);
  return base * Math.pow(2, attempt) + jitter;
}

async function fetchJsonWithRetry(url: string, timeoutMs: number, retries = 4): Promise<any> {
  let attempt = 0;
  while (attempt <= retries) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const resp = await fetch(url, { signal: controller.signal, headers: { Accept: "application/json" } });
      if (resp.status === 429 || resp.status === 503) {
        if (attempt === retries) {
          const body = await resp.text().catch(() => "");
          throw new Error(
            body
              ? `Google Books ${resp.status} ${body}`
              : `Google Books ${resp.status}`
          );
        }
        await sleep(retryDelayMs(attempt, resp.status));
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
      await sleep(retryDelayMs(attempt));
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


function decisionSwipeCount(input: RecommenderInput): number {
  return Number((input as any)?.tasteProfile?.evidence?.swipes || 0);
}

function hasStrong20QSession(input: RecommenderInput): boolean {
  return decisionSwipeCount(input) >= 4;
}








function rungToGoogleBooksQuery(rung: StructuredFetchRung): string {
  const base = String(rung?.query || rung?.primary || "").toLowerCase().trim();
  return base || "fiction novel";
}

function getBucketQueries(deckKey: DeckKey, input: RecommenderInput): string[] {
  const isVisualDominant = visualSignalWeight(input.tagCounts) >= 4 && hasStrong20QSession(input);

  if (isVisualDominant) {
    return dedupeQueries([
      'subject:manga',
      'subject:"graphic novel"',
      'subject:comics',
    ]);
  }

  if (deckKey === "k2") {
    return dedupeQueries([
      `subject:"children's fiction"`,
      `subject:"middle grade fiction"`,
      `subject:"chapter books"`,
    ]);
  }

  if (deckKey === "ms_hs") {
    return dedupeQueries([
      `subject:"young adult fiction"`,
      "young adult novel",
    ]);
  }

  if (deckKey === "36") {
    return dedupeQueries([
      `subject:"middle grade fiction"`,
      `subject:"juvenile fiction"`,
      `subject:"chapter books"`,
    ]);
  }

  return dedupeQueries([
    "fiction novel",
    "contemporary fiction novel",
  ]);
}

function getGoogleBooksApiKey(): string {
  return process.env.EXPO_PUBLIC_GOOGLE_BOOKS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_BOOKS_API_KEY || process.env.VITE_GOOGLE_BOOKS_API_KEY || process.env.GOOGLE_BOOKS_API_KEY || "";
}

function toGoogleBooksQuery(query: string): string {
  const q = normalizeStoredQueryText(query);
  if (!q) return "";
  return q
    .replace(/\s-\w[\w-]*/g, " ")
    .replace(/\s-\"[^\"]+\"/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildToneAwareEngineQueries(query: string, input: RecommenderInput): string[] {
  const q = normalizeStoredQueryText(query);
  if (!q) return [];

  const axes = (input as any)?.tasteProfile?.axes || {};
  const darkness = Number(axes?.darkness || 0);
  const warmth = Number(axes?.warmth || 0);
  const characterFocus = Number(axes?.characterFocus || 0);
  const complexity = Number(axes?.complexity || 0);
  const realism = Number(axes?.realism || 0);
  const pacing = Number(axes?.pacing || 0);
  const isSubjectQuery = q.startsWith("subject:");

  const variants: string[] = [q];
  const push = (candidate: string) => {
    const normalized = normalizeStoredQueryText(candidate);
    if (!normalized || variants.includes(normalized)) return;
    variants.push(normalized);
  };

  if (!isSubjectQuery && darkness >= 0.35 && !/\b(dark|grim|noir|psychological)\b/.test(q)) {
    push(`psychological ${q}`);
  }
  if (!isSubjectQuery && (warmth >= 0.2 || characterFocus >= 0.25) && /\b(thriller|mystery|suspense|science fiction|fantasy)\b/.test(q) && !/\b(character driven|emotional|relationship)\b/.test(q)) {
    push(`character driven emotional ${q}`);
  }
  if (!isSubjectQuery && complexity >= 0.3 && !/\b(literary|political|conspiracy|family saga)\b/.test(q)) {
    push(`literary ${q}`);
  }
  if (!isSubjectQuery && realism >= 0.3 && warmth < 0.15 && characterFocus < 0.2 && /\b(mystery|crime|thriller|detective)\b/.test(q) && !/\b(procedural|grounded)\b/.test(q)) {
    push(`procedural ${q}`);
  }
  if (!isSubjectQuery && pacing >= 0.3 && /\b(thriller|mystery|horror|survival)\b/.test(q) && !/\b(fast paced|high stakes)\b/.test(q)) {
    push(`fast paced ${q}`);
  }

  return dedupeQueries(variants).slice(0, 3);
}

function inferQueryFamilyFromText(query: string): "thriller" | "mystery" | "horror" | "science_fiction" | "fantasy" | "romance" | "historical" | "general" {
  const q = normalizeStoredQueryText(query);
  if (/\b(thriller|suspense|conspiracy|manhunt|abduction)\b/.test(q)) return "thriller";
  if (/\b(mystery|detective|whodunit|private investigator)\b/.test(q)) return "mystery";
  if (/\b(horror|haunted|occult|ghost|supernatural)\b/.test(q)) return "horror";
  if (/\b(science fiction|dystopian|space opera|speculative)\b/.test(q)) return "science_fiction";
  if (/\b(fantasy|magic|dragon|gothic fantasy)\b/.test(q)) return "fantasy";
  if (/\b(romance|love story|relationship)\b/.test(q)) return "romance";
  if (/\b(historical|period fiction|civil war|19th century)\b/.test(q)) return "historical";
  return "general";
}

async function googleBooksSearch(query: string, limit: number, timeoutMs: number): Promise<any[]> {
  const q = toGoogleBooksQuery(query);
  if (!q) return [];
  const maxResults = Math.max(1, Math.min(10, Number(limit) || 10));
  const apiKey = getGoogleBooksApiKey();
  const params = new URLSearchParams({ q, maxResults: String(maxResults), orderBy: "relevance", printType: "books", projection: "full", langRestrict: "en" });
  if (apiKey) params.set("key", apiKey);
  const url = `https://www.googleapis.com/books/v1/volumes?${params.toString()}`;
  const json = await fetchJsonWithRetry(url, timeoutMs, 2);
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
      industryIdentifiers: Array.isArray(volumeInfo.industryIdentifiers) ? volumeInfo.industryIdentifiers : undefined,
      isbn13: Array.isArray(volumeInfo.industryIdentifiers) ? volumeInfo.industryIdentifiers.find((id: any) => id?.type === "ISBN_13")?.identifier : undefined,
      isbn10: Array.isArray(volumeInfo.industryIdentifiers) ? volumeInfo.industryIdentifiers.find((id: any) => id?.type === "ISBN_10")?.identifier : undefined,
      saleInfo,
      accessInfo,
      buyLink: typeof saleInfo?.buyLink === "string" ? saleInfo.buyLink : undefined,
      saleability: typeof saleInfo?.saleability === "string" ? saleInfo.saleability : undefined,
      procurementSignals: {
        hasIndustryIdentifier: Array.isArray(volumeInfo.industryIdentifiers) && volumeInfo.industryIdentifiers.some((id: any) => String(id?.identifier || "").trim()),
        hasPurchaseSignal: Boolean(saleInfo?.buyLink || saleInfo?.isEbook || accessInfo?.epub?.isAvailable || accessInfo?.pdf?.isAvailable),
        hasShelfAvailabilitySignal: false,
      },
      volumeInfo,
    };
  }).filter((doc: any) => doc && doc.title);
}

export async function getGoogleBooksRecommendations(input: RecommenderInput): Promise<RecommendationResult> {
  const deckKey = input.deckKey;
  const finalLimit = Math.max(1, Math.min(40, input.limit ?? 12));
  const fetchLimit = Math.max(24, Math.min(80, finalLimit * 4));
  const timeoutMs = Math.max(1000, Math.min(12000, input.timeoutMs ?? 8000));
  const domainMode = deckKeyToDomainMode(deckKey);

  const explicitBucketPlan = (input as any)?.bucketPlan as { queries?: string[]; rungs?: StructuredFetchRung[] } | undefined;
  const planQueries = Array.isArray(explicitBucketPlan?.rungs) && explicitBucketPlan!.rungs!.length > 0
    ? explicitBucketPlan!.rungs!.map(rungToGoogleBooksQuery)
    : (Array.isArray(explicitBucketPlan?.queries) && explicitBucketPlan?.queries?.length
      ? dedupeQueries(explicitBucketPlan.queries)
      : getBucketQueries(deckKey, input));

  const queriesToTry = planQueries.length ? planQueries : getBucketQueries(deckKey, input);
  const builtFromQuery = normalizeStoredQueryText(queriesToTry[0] || "");
  const minCandidateFloor = Math.max(10, Math.min(fetchLimit, Number((input as any)?.minCandidateFloor ?? 0) || 0));
  const collectedDocsRaw: any[] = [];
  const rawPoolRows: any[] = [];
  const seenKeys = new Set<string>();
  let primaryDocsRaw: any[] = [];
  let totalRawFetched = 0;
  const minQueryPassesBeforeEarlyExit = Math.min(2, queriesToTry.length);

  for (let queryIndex = 0; queryIndex < queriesToTry.length; queryIndex += 1) {
    const q = normalizeStoredQueryText(queriesToTry[queryIndex]);
    const queryFamily = inferQueryFamilyFromText(q);
    const laneKind = "precision";
    const engineQueries = buildToneAwareEngineQueries(q, input);
    const queryRawDocs: any[] = [];

    for (const engineQuery of engineQueries) {
      let rawDocs: any[] = [];

      try {
        rawDocs = await googleBooksSearch(engineQuery, fetchLimit, timeoutMs);
      } catch (err: any) {
        // Retry with a simplified payload before declaring source failure.
        const simplifiedQuery = normalizeStoredQueryText(engineQuery)
          .replace(/\s-\w[\w-]*/g, " ")
          .replace(/\s-\"[^\"]+\"/g, " ")
          .replace(/\s+/g, " ")
          .trim();
        if (simplifiedQuery && simplifiedQuery !== normalizeStoredQueryText(engineQuery)) {
          try {
            rawDocs = await googleBooksSearch(simplifiedQuery, fetchLimit, timeoutMs);
          } catch {
            rawDocs = [];
          }
        }

        if (!Array.isArray(rawDocs) || rawDocs.length === 0) {
          console.error("GoogleBooks fetch failed", {
            engineQuery,
            simplifiedQuery,
            queryIndex,
            builtFromQuery,
            message: err?.message || String(err || "unknown error"),
          });

          rawPoolRows.push({
            title: "[GOOGLE_BOOKS_FETCH_ERROR]",
            author: undefined,
            source: "googleBooks",
            queryText: q,
            engineQueryText: engineQuery,
            queryRung: queryIndex,
            laneKind,
            error: err?.message || String(err || "unknown error"),
          });

          rawDocs = [];
        }
      }
      const rawAuthorCappedDocs = capRawDocsPerAuthor(rawDocs, queryFamily, 2);

      const intakeDocs = enforceEarlyIntakeQualityAndDiversity(rawAuthorCappedDocs, queryFamily);
      totalRawFetched += Array.isArray(intakeDocs) ? intakeDocs.length : 0;
      for (const rawDoc of Array.isArray(intakeDocs) ? intakeDocs : []) {
        rawPoolRows.push({
          title: rawDoc?.title,
          author: Array.isArray(rawDoc?.author_name) ? rawDoc.author_name[0] : undefined,
          source: "googleBooks",
          queryText: q,
          engineQueryText: engineQuery,
          queryRung: queryIndex,
          laneKind,
        });
      }
      queryRawDocs.push(...(Array.isArray(intakeDocs) ? intakeDocs : []));
    }

    const dedupedQueryRawDocs: any[] = [];
    const seenQueryKeys = new Set<string>();
    for (const rawDoc of queryRawDocs) {
      const key = String(rawDoc?.key || rawDoc?.id || rawDoc?.title || "");
      if (!key || seenQueryKeys.has(key)) continue;
      seenQueryKeys.add(key);
      dedupedQueryRawDocs.push(rawDoc);
    }

    const admittedDocsRaw = dedupedQueryRawDocs.filter((doc: any) => {
      const publisher = doc?.publisher ?? doc?.volumeInfo?.publisher;
      if (isHardSelfPublished(publisher)) return false;
      if (looksLikeGoogleBooksReference(doc)) return false;
      if (isGarbageGoogleBooksCandidate(doc)) return false;
      if (isClearlyNotNarrativeBook(doc)) return false;
      if (looksLikeLowProcurementGoogleBooksCandidate(doc)) return false;
      if (looksLikeLowAuthorityLegacyLibraryTitle(doc)) return false;
      return true;
    });

    const cappedByAuthor: any[] = [];
    const authorCounts = new Map<string, number>();
    for (const doc of admittedDocsRaw) {
      const author = normalizeText(Array.isArray(doc?.author_name) ? doc.author_name[0] : doc?.volumeInfo?.authors?.[0]);
      const ratings = Number(doc?.ratingsCount ?? doc?.volumeInfo?.ratingsCount ?? 0);
      const strongAuthority = hasShelfAvailabilitySignal(doc) || hasMainstreamPublisherSignal(doc) || ratings >= 120;
      const lowAuthority = ratings <= 5 && !strongAuthority;
      const maxPerAuthor = lowAuthority ? 1 : 2;
      const key = `${queryFamily}:${author || "unknown"}`;
      const current = authorCounts.get(key) || 0;
      if (current >= maxPerAuthor) continue;
      authorCounts.set(key, current + 1);
      cappedByAuthor.push(doc);
    }

    if (queryIndex === 0) primaryDocsRaw = cappedByAuthor;

    const shouldBackfillFromThisQuery = queryIndex === 0 || collectedDocsRaw.length < Math.max(minCandidateFloor, finalLimit * 2);
    if (shouldBackfillFromThisQuery) {
      for (const doc of cappedByAuthor) {
        const key = String(doc?.key || doc?.id || `${doc?.title || "unknown"}|${queryIndex}`);
        if (seenKeys.has(key)) continue;
        seenKeys.add(key);
        collectedDocsRaw.push({ ...doc, queryRung: queryIndex, queryText: q, source: "googleBooks", laneKind });
      }
    }

    const enoughCandidates = collectedDocsRaw.length >= Math.max(finalLimit, minCandidateFloor);
    if (queryIndex + 1 >= minQueryPassesBeforeEarlyExit && enoughCandidates) break;
  }

  const primaryFamily = inferQueryFamilyFromText(queriesToTry[0] || "");
  if (collectedDocsRaw.length < Math.max(10, finalLimit)) {
    for (const authorityQuery of buildAuthorityBackfillQueries(primaryFamily).slice(0, 3)) {
      let fallbackDocs: any[] = [];
      try {
        fallbackDocs = await googleBooksSearch(authorityQuery, fetchLimit, timeoutMs);
      } catch {
        fallbackDocs = [];
      }
      const intakeDocs = enforceEarlyIntakeQualityAndDiversity(capRawDocsPerAuthor(fallbackDocs, primaryFamily, 2), primaryFamily);
      for (const doc of intakeDocs) {
        const key = String(doc?.key || doc?.id || `${doc?.title || "unknown"}|authority_backfill`);
        if (seenKeys.has(key)) continue;
        seenKeys.add(key);
        collectedDocsRaw.push({
          ...doc,
          queryRung: 98,
          queryText: normalizeStoredQueryText(authorityQuery),
          source: "googleBooks",
          laneKind: "authority_backfill",
        });
      }
      if (collectedDocsRaw.length >= Math.max(10, finalLimit * 2)) break;
    }
  }

  const docsRaw = collectedDocsRaw.length
    ? collectedDocsRaw
    : primaryDocsRaw.map((doc: any) => ({
        ...doc,
        queryRung: 0,
        queryText: builtFromQuery,
        source: "googleBooks",
        laneKind: "precision",
      }));

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
    laneKind: typeof doc.laneKind === "string" ? doc.laneKind : undefined,
    subtitle: typeof doc.subtitle === "string" ? doc.subtitle : undefined,
    description: typeof doc.description === "string" ? doc.description : undefined,
    averageRating: typeof doc.averageRating === "number" ? doc.averageRating : undefined,
    ratingsCount: typeof doc.ratingsCount === "number" ? doc.ratingsCount : undefined,
    industryIdentifiers: Array.isArray(doc.industryIdentifiers) ? doc.industryIdentifiers : Array.isArray(doc.volumeInfo?.industryIdentifiers) ? doc.volumeInfo.industryIdentifiers : undefined,
    isbn13: doc.isbn13,
    isbn10: doc.isbn10,
    buyLink: doc.buyLink,
    saleability: doc.saleability,
    saleInfo: doc.saleInfo,
    accessInfo: doc.accessInfo,
    procurementSignals: {
      ...(doc.procurementSignals || {}),
      hasIndustryIdentifier: hasIndustryIdentifier(doc),
      hasPurchaseSignal: hasGoogleBooksPurchaseSignal(doc),
      hasShelfAvailabilitySignal: hasShelfAvailabilitySignal(doc),
      hasMainstreamPublisherSignal: hasMainstreamPublisherSignal(doc),
    },
    volumeInfo: doc.volumeInfo,
  } as any));

  console.log("GoogleBooks queriesToTry", queriesToTry);
  console.log("GoogleBooks totalRawFetched", totalRawFetched);

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
