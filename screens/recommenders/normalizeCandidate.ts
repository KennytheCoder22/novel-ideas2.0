import type { CommercialSignals, RecommendationDoc } from './types';

export type CandidateSource = 'googleBooks' | 'openLibrary' | 'kitsu' | 'gcd';

export type FormatCategory = 'manga' | 'graphic_novel' | 'comic' | 'prose';

export type Candidate = {
  queryRung?: number;
  queryText?: string;
  queryTerms?: string[];
  id: string;
  title: string;
  author: string;
  authors: string[];
  subtitle?: string;
  description?: string;
  subjects: string[];
  genres: string[];
  publicationYear: number;
  ratingCount: number;
  averageRating: number;
  pageCount: number;
  editionCount: number;
  publisher: string;
  language: string[];
  hasCover: boolean;
  rawDoc: RecommendationDoc;
  source: CandidateSource;
  formatCategory: FormatCategory;
  hardcover?: any;
  commercialSignals?: CommercialSignals;
};

function asArray(value: any): string[] {
  if (Array.isArray(value)) return value.map((v) => String(v || '').trim()).filter(Boolean);
  if (value == null || value === '') return [];
  return [String(value).trim()].filter(Boolean);
}

function getTitle(rawDoc: any): string {
  return String(rawDoc?.title || rawDoc?.volumeInfo?.title || '').trim();
}

function getSubtitle(rawDoc: any): string {
  return String(rawDoc?.subtitle || rawDoc?.volumeInfo?.subtitle || '').trim();
}

function getDescription(rawDoc: any): string {
  const description = rawDoc?.description ?? rawDoc?.volumeInfo?.description ?? '';
  if (typeof description === 'string') return description.trim();
  if (description && typeof description === 'object' && typeof description.text === 'string') return description.text.trim();
  return '';
}

function getAuthors(rawDoc: any): string[] {
  const authors =
    rawDoc?.author_name ??
    rawDoc?.authors ??
    rawDoc?.volumeInfo?.authors ??
    rawDoc?.author ??
    rawDoc?.authorName ??
    [];

  if (Array.isArray(authors)) {
    return authors
      .map((author) => (typeof author === 'string' ? author : author?.name))
      .map((author) => String(author || '').trim())
      .filter(Boolean);
  }

  return authors ? [String(authors).trim()] : [];
}

function getPublisher(rawDoc: any): string {
  const publisher = rawDoc?.publisher ?? rawDoc?.volumeInfo?.publisher;
  if (Array.isArray(publisher)) return String(publisher[0] || '').trim();
  return String(publisher || '').trim();
}

function getPublicationYear(rawDoc: any): number {
  const raw =
    rawDoc?.first_publish_year ??
    rawDoc?.publishYear ??
    rawDoc?.publishedDate ??
    rawDoc?.publicationDate ??
    rawDoc?.volumeInfo?.publishedDate;

  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  const match = String(raw || '').match(/(18|19|20)\d{2}/);
  return match ? Number(match[0]) : 0;
}

function getRatings(rawDoc: any): { averageRating: number; ratingCount: number } {
  const averageRaw =
    rawDoc?.ratings?.summary?.average ??
    rawDoc?.ratingSummary?.average ??
    rawDoc?.openLibraryRatings?.summary?.average ??
    rawDoc?.hardcover?.rating ??
    rawDoc?.averageRating ??
    rawDoc?.volumeInfo?.averageRating;

  const countRaw =
    rawDoc?.ratings?.summary?.count ??
    rawDoc?.ratingSummary?.count ??
    rawDoc?.openLibraryRatings?.summary?.count ??
    rawDoc?.hardcover?.ratings_count ??
    rawDoc?.ratingsCount ??
    rawDoc?.volumeInfo?.ratingsCount;

  return {
    averageRating: Number.isFinite(Number(averageRaw)) ? Math.max(0, Math.min(5, Number(averageRaw))) : 0,
    ratingCount: Number.isFinite(Number(countRaw)) ? Math.max(0, Number(countRaw)) : 0,
  };
}

function getPageCount(rawDoc: any): number {
  const pageCount = rawDoc?.pageCount ?? rawDoc?.volumeInfo?.pageCount;
  return Number.isFinite(Number(pageCount)) ? Math.max(0, Number(pageCount)) : 0;
}

function getEditionCount(rawDoc: any): number {
  const editionCount = rawDoc?.edition_count ?? rawDoc?.editionCount;
  return Number.isFinite(Number(editionCount)) ? Math.max(0, Number(editionCount)) : 0;
}

const QUERY_STOPWORDS = new Set(['subject', 'fiction', 'novel', 'book', 'books', 'story', 'stories', 'the', 'and', 'for', 'with', 'about', 'from', 'into']);

function extractQueryTerms(queryText: any): string[] {
  const raw = String(queryText || '').toLowerCase();

  if (!raw.trim()) return [];

  const subjectMatches = Array.from(
    raw.matchAll(/subject:"([^"]+)"|subject:([a-z0-9_\-]+)/g)
  )
    .map((m) => (m[1] || m[2] || '').trim())
    .filter(Boolean);

  const cleanedFreeText = raw
    .replace(/subject:"[^"]+"|subject:[a-z0-9_\-]+/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

  const freeTextTerms = cleanedFreeText
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length >= 3)
    .filter((word) => !QUERY_STOPWORDS.has(word));

  return Array.from(new Set([...subjectMatches, ...freeTextTerms]));
}

function normalizeText(value: unknown): string {
  if (Array.isArray(value)) return value.map(normalizeText).join(' ').toLowerCase();
  if (value == null) return '';
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
    .join(' ');
}

function collectDescriptionText(doc: any): string {
  return [
    normalizeText(doc?.description),
    normalizeText(doc?.volumeInfo?.description),
    normalizeText(doc?.subtitle),
    normalizeText(doc?.volumeInfo?.subtitle),
    normalizeText(doc?.notes),
    normalizeText(doc?.first_sentence),
    normalizeText(doc?.excerpt),
  ]
    .filter(Boolean)
    .join(' ');
}

export function looksLikeFictionCandidate(doc: any): boolean {
  const title = normalizeText(doc?.title || doc?.volumeInfo?.title);
  const categories = collectCategoryText(doc);
  const description = collectDescriptionText(doc);
  const author = normalizeText(doc?.author_name ?? doc?.authors ?? doc?.author ?? doc?.volumeInfo?.authors);
  const combined = [title, categories, description, author].filter(Boolean).join(' ');

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


function isClearlyNotABookCandidate(candidate: Candidate): boolean {
  const title = String(candidate?.title || "").toLowerCase().trim();
  const publisher = String(candidate?.publisher || "").toLowerCase().trim();
  const subjects = Array.isArray(candidate?.subjects)
    ? candidate.subjects.join(" ").toLowerCase()
    : "";
  const description = String(candidate?.description || "").toLowerCase();

  if (!title || title.length < 3) return true;

  const hardRejectTitlePatterns = [
    /\bencyclop(a|e)dia\b/,
    /\bbooklist\b/,
    /\bliterary supplement\b/,
    /\bnew statesman\b/,
    /\bamerican book publishing record\b/,
    /\bquill\s*&\s*quire\b/,
    /\bbookmen\b/,
    /\bmagazine\b/,
    /\bjournal\b/,
    /\brecord\b/,
    /\bperiodical\b/,
    /\breview\b/,
    /\btimes literary supplement\b/,
    /\ba\.l\.a\. booklist\b/,
    /\bbook dealers\b/,
    /\bpublishers? weekly\b/,
  ];

  const hardRejectPublisherPatterns = [
    /\bencyclop(a|e)dia britannica\b/,
    /\bnew statesman\b/,
    /\btimes literary supplement\b/,
    /\bbooklist\b/,
  ];

  const genericPublicationTitle =
    /^[a-z\s&.\-]{1,25}$/.test(title) &&
    !/\b(novel|story|mystery|thriller|crime|fiction|detective|romance|fantasy|horror|manga|comic)\b/.test(title);

  const metadataLooksReference =
    /\bperiodicals?\b/.test(subjects) ||
    /\bliterary criticism\b/.test(subjects) ||
    /\breference\b/.test(subjects) ||
    /\bmagazines?\b/.test(subjects) ||
    /\bjournal\b/.test(subjects) ||
    /\breview\b/.test(subjects) ||
    /\bencyclop(a|e)dia\b/.test(description);

  if (hardRejectTitlePatterns.some((rx) => rx.test(title))) return true;
  if (hardRejectPublisherPatterns.some((rx) => rx.test(publisher))) return true;
  if (genericPublicationTitle) return true;
  if (metadataLooksReference) return true;

  return false;
}


function hasCover(rawDoc: any): boolean {
  if (rawDoc?.cover_i) return true;
  const imageLinks = rawDoc?.imageLinks ?? rawDoc?.volumeInfo?.imageLinks;
  return Boolean(
    imageLinks?.thumbnail ||
      imageLinks?.smallThumbnail ||
      imageLinks?.small ||
      imageLinks?.medium ||
      imageLinks?.large
  );
}

function detectFormatCategory(
  rawDoc: any,
  source: CandidateSource,
  subjects: string[]
): FormatCategory {
  const subjectText = subjects.join(' ').toLowerCase();

  if (source === 'kitsu') return 'manga';
  if (source === 'gcd') return 'comic';

  if (subjectText.includes('manga')) return 'manga';

  if (
    subjectText.includes('graphic novel') ||
    subjectText.includes('graphic novels')
  ) {
    return 'graphic_novel';
  }

  if (
    subjectText.includes('comic') ||
    subjectText.includes('comics')
  ) {
    return 'comic';
  }

  return 'prose';
}

export function normalizeCandidate(rawDoc: RecommendationDoc, source: CandidateSource): Candidate {
  const authors = getAuthors(rawDoc);
  const title = getTitle(rawDoc);
  const subtitle = getSubtitle(rawDoc);
  const description = getDescription(rawDoc);
  const subjects = [
    ...asArray((rawDoc as any)?.subject),
    ...asArray((rawDoc as any)?.subjects),
    ...asArray((rawDoc as any)?.categories),
    ...asArray((rawDoc as any)?.volumeInfo?.subjects),
    ...asArray((rawDoc as any)?.volumeInfo?.categories),
  ];
  const uniqueSubjects = Array.from(new Set(subjects.map((item) => item.trim()).filter(Boolean)));
  const formatCategory = detectFormatCategory(rawDoc, source, uniqueSubjects);
  const ratings = getRatings(rawDoc);

  return {
    id: String((rawDoc as any)?.id || (rawDoc as any)?.key || `${source}:${title}:${authors[0] || 'unknown'}`),
    title,
    author: authors[0] || 'Unknown',
    authors,
    subtitle: subtitle || undefined,
    description: description || undefined,
    subjects: uniqueSubjects,
    genres: uniqueSubjects.filter((s) => {
      const v = s.toLowerCase();

      return (
        v.includes('fiction') ||
        v.includes('mystery') ||
        v.includes('thriller') ||
        v.includes('suspense') ||
        v.includes('fantasy') ||
        v.includes('science fiction') ||
        v.includes('horror') ||
        v.includes('romance') ||
        v.includes('drama') ||
        v.includes('dystopian') ||
        v.includes('manga') ||
        v.includes('graphic novel') ||
        v.includes('graphic novels') ||
        v.includes('comics') ||
        v.includes('comic')
      );
    }),
    publicationYear: getPublicationYear(rawDoc),
    ratingCount: ratings.ratingCount,
    averageRating: ratings.averageRating,
    pageCount: getPageCount(rawDoc),
    editionCount: getEditionCount(rawDoc),
    publisher: getPublisher(rawDoc),
    language: asArray((rawDoc as any)?.language || (rawDoc as any)?.volumeInfo?.language),
    hasCover: hasCover(rawDoc),
    rawDoc,
    source,
    formatCategory,
    hardcover: (rawDoc as any)?.hardcover,
    commercialSignals: (rawDoc as any)?.commercialSignals,
    queryRung: Number.isFinite(Number((rawDoc as any)?.queryRung)) ? Number((rawDoc as any)?.queryRung) : undefined,
    queryText: typeof (rawDoc as any)?.queryText === 'string' ? (rawDoc as any).queryText : undefined,
    queryTerms: extractQueryTerms((rawDoc as any)?.queryText),
  };
}

export function normalizeCandidates(rawDocs: RecommendationDoc[], source: CandidateSource): Candidate[] {
  return (Array.isArray(rawDocs) ? rawDocs : [])
    .filter((rawDoc) => {
      if (source === 'openLibrary') {
        return !isClearlyNotABookCandidate(normalizeCandidate(rawDoc, source));
      }

      return looksLikeFictionCandidate(rawDoc);
    })
    .map((rawDoc) => normalizeCandidate(rawDoc, source))
    .filter((candidate) => !isClearlyNotABookCandidate(candidate));
}
