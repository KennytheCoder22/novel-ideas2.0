import type { RecommendationDoc } from './types';

export type CandidateSource = 'googleBooks' | 'openLibrary' | 'kitsu' | 'comicVine';

export type FormatCategory = 'manga' | 'graphic_novel' | 'comic' | 'prose';

export type Candidate = {
  queryRung?: number;
  queryText?: string;
  queryFamily?: string;
  filterFamily?: string;
  laneKind?: string;
  id: string;
  title: string;
  author: string;
  authors: string[];
  subtitle?: string;
  description?: string;
  subjects: string[];
  genres: string[];
  publicationYear: number;
  ratingCount?: number;
  averageRating?: number;
  pageCount: number;
  editionCount: number;
  publisher: string;
  language: string[];
  hasCover: boolean;
  rawDoc: RecommendationDoc;
  source: CandidateSource;
  formatCategory: FormatCategory;
};

function asArray(value: any): string[] {
  if (Array.isArray(value)) return value.map((v) => String(v || '').trim()).filter(Boolean);
  if (value == null || value === '') return [];
  return [String(value).trim()].filter(Boolean);
}

function normalizeText(value: unknown): string {
  if (Array.isArray(value)) return value.map(normalizeText).join(' ').toLowerCase();
  if (value == null) return '';
  return String(value).toLowerCase();
}

function cleanQueryText(value: unknown): string {
  return String(value || '')
    .toLowerCase()
    .replace(/^['"]|['"]$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function inferHistoricalQueryRung(rawDoc: any): number | undefined {
  const queryText = cleanQueryText(
    rawDoc?.queryText ??
    rawDoc?.diagnostics?.queryText ??
    rawDoc?.rawQuery ??
    rawDoc?.query
  );

  if (!queryText) return undefined;
  if (/\bhistorical fiction novel\b/.test(queryText) && !/\b(19th century|war|society)\b/.test(queryText)) return 0;
  if (/\b19th century historical fiction novel\b/.test(queryText)) return 1;
  if (/\bwar historical fiction novel\b/.test(queryText)) return 2;
  if (/\bsociety historical fiction novel\b/.test(queryText)) return 3;

  return undefined;
}

function inferQueryFamily(rawDoc: any): string | undefined {
  const explicit = String(
    rawDoc?.queryFamily ??
    rawDoc?.diagnostics?.queryFamily ??
    rawDoc?.filterFamily ??
    rawDoc?.diagnostics?.filterFamily ??
    ''
  ).toLowerCase().trim();

  if (explicit && explicit !== 'unknown') return explicit;

  const laneKind = String(rawDoc?.laneKind ?? rawDoc?.diagnostics?.laneKind ?? '').toLowerCase().trim();
  if (laneKind === 'historical') return 'historical';

  const queryText = cleanQueryText(
    rawDoc?.queryText ??
    rawDoc?.diagnostics?.queryText ??
    rawDoc?.rawQuery ??
    rawDoc?.query
  );

  if (/\b(historical fiction novel|19th century historical fiction novel|war historical fiction novel|society historical fiction novel|historical fiction|historical novel|period fiction|19th century|american historical|american novel|gilded age|victorian|western historical)\b/.test(queryText)) {
    return 'historical';
  }
  if (/\bhistorical\b/.test(queryText)) return 'historical';

  return explicit || undefined;
}

function getQueryRung(rawDoc: any): number | undefined {
  const explicitRaw = rawDoc?.queryRung ?? rawDoc?.diagnostics?.queryRung;
  const explicit = Number.isFinite(Number(explicitRaw)) ? Number(explicitRaw) : undefined;
  const inferredHistorical = inferHistoricalQueryRung(rawDoc);

  // Historical query text is the stable identity at the API boundary. Some
  // upstream paths currently stamp every historical row as rung 0.
  if (typeof inferredHistorical === 'number') return inferredHistorical;

  return explicit;
}

function getQueryText(rawDoc: any): string | undefined {
  return typeof rawDoc?.queryText === 'string'
    ? rawDoc.queryText
    : typeof rawDoc?.diagnostics?.queryText === 'string'
      ? rawDoc.diagnostics.queryText
      : undefined;
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
  if (description && typeof description === 'object' && typeof description.text === 'string') {
    return description.text.trim();
  }
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

function getRatings(rawDoc: any): { averageRating?: number; ratingCount?: number } {
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

  const averageRating = Number.isFinite(Number(averageRaw))
    ? Math.max(0, Math.min(5, Number(averageRaw)))
    : undefined;

  const ratingCount = Number.isFinite(Number(countRaw))
    ? Math.max(0, Number(countRaw))
    : undefined;

  return { averageRating, ratingCount };
}

function getPageCount(rawDoc: any): number {
  const pageCount = rawDoc?.pageCount ?? rawDoc?.volumeInfo?.pageCount;
  return Number.isFinite(Number(pageCount)) ? Math.max(0, Number(pageCount)) : 0;
}

function getEditionCount(rawDoc: any): number {
  const editionCount = rawDoc?.edition_count ?? rawDoc?.editionCount;
  return Number.isFinite(Number(editionCount)) ? Math.max(0, Number(editionCount)) : 0;
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

  if (!title) return false;

  const hardRejectTitlePatterns = [
    /\breadings?\s+in\b.*\b(novel|fiction|literature)\b/,
    /\bcentury\s+readings?\s+in\b.*\bnovel\b/,
    /\b(life|women|race|gender|class)\s+in\b.*\bfiction\b/,
    /\bredefining\b.*\bfiction\b/,
    /\b(columbian|latin american|irish|english|british|american)\b.*\bhistorical\s+fiction\b/,
    /\b(columbian|american|english|british|historical)\s+novels?\b/,
    /\bshort stories\b/,
    /\bhorror stories\b/,
    /\bstories of\b/,
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
    /\btransactions of\b/,
    /\bthe nation\b/,
    /\bthe athenaeum\b/,
    /\bt\.?\s*p\.?'?s weekly\b/,
    /\bpunch\b/,
    /\bbook news monthly\b/,
    /\bfilm year book\b/,
    /\bfilm daily year book\b/,
    /\bthe publisher and bookseller\b/,
    /\bthe author & journalist\b/,
    /\bcontemporaries in fiction\b/,
    /\bnovels & novelists\b/,
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
    /\bhistory and criticism\b/,
    /\breadings?\b/,
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
    /\bfantasy\b/,
    /\bscience fiction\b/,
    /\bhorror\b/,
    /\bromance\b/,
    /\bthriller\b/,
    /\bmystery\b/,
    /\bcrime\b/,
    /\bdetective\b/,
    /\bsuspense\b/,
    /\bpsychological\b/,
    /\bmanga\b/,
    /\bgraphic novel\b/,
    /\bcomic\b/,
    /\bfollows\b/,
    /\btells the story\b/,
    /\bstory of\b/,
    /\bwhen\b.*\bdiscovers?\b/,
  ];

  if (hardRejectTitlePatterns.some((rx) => rx.test(title))) return false;
  if (hardRejectCategoryPatterns.some((rx) => rx.test(categories))) return false;
  // Soft ignore instead of hard reject
const descriptionLooksAcademic = hardRejectDescriptionPatterns.some((rx) => rx.test(description));

  const hasFictionSignal = fictionPositivePatterns.some(
    (rx) => rx.test(title) || rx.test(categories) || rx.test(description) || rx.test(combined)
  );

  const hasNarrativeSignal =
    /\b(novel|follows|tells the story|journey|survival|investigation)\b/.test(combined);

  const titleLooksPeriodical =
    /\bweekly\b|\bathenaeum\b|\bnation\b|\boutlook\b|\bpunch\b|\btransactions\b|\bbook news monthly\b|\bfilm year book\b|\bauthor & journalist\b/.test(title);

  return hasFictionSignal || (hasNarrativeSignal && !titleLooksPeriodical && /\b(novel|fiction|thriller|mystery|suspense)\b/.test(combined));
}

function isClearlyNotABookCandidate(candidate: Candidate): boolean {
  const title = String(candidate?.title || '').toLowerCase().trim();
  const publisher = String(candidate?.publisher || '').toLowerCase().trim();
  const subjects = Array.isArray(candidate?.subjects) ? candidate.subjects.join(' ').toLowerCase() : '';
  const description = String(candidate?.description || '').toLowerCase();

  if (!title || title.length < 3) return true;
  if (/\bboxed set\b|\bomnibus\b|\b350\+\b|\bcollection\b|\banthology\b/.test(title)) return true;

  // Only reject extremely short content (pamphlets)
if (candidate.pageCount > 0 && candidate.pageCount < 30) return true;

  // HARD REJECT: low-signal generic horror-story spam
  if (/\bhorror story\b/.test(title) && candidate.pageCount > 0 && candidate.pageCount < 120) return true;

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
    /\bbraille books?\b/,
    /\bcumulated fiction index\b/,
    /\btechnique of the mystery story\b/,
    /\breaders?\s+advisory\b/,
    /\bguide to genre fiction\b/,
    /\bmammoth book\b/,
  ];

  const hardRejectPublisherPatterns = [
    /\bencyclop(a|e)dia britannica\b/,
    /\bnew statesman\b/,
    /\btimes literary supplement\b/,
    /\bbooklist\b/,
  ];

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
  if (metadataLooksReference) return true;

  return false;
}


function hasLegitSeriesAuthority(candidate: Candidate): boolean {
  const ratings = Number(candidate?.ratingCount || 0);
  const avg = Number(candidate?.averageRating || 0);
  const publisher = String(candidate?.publisher || '').toLowerCase().trim();
  return (
    ratings >= 75 ||
    avg >= 4.2 ||
    /\b(penguin|random house|knopf|doubleday|viking|harper|macmillan|tor|simon\s*&?\s*schuster|hachette|st\.? martin|ballantine)\b/.test(publisher)
  );
}

function isWeakSeriesSpamCandidate(candidate: Candidate): boolean {
  const title = String(candidate?.title || '').toLowerCase().trim();
  const hasSeriesMarker = /\b(book|volume|vol\.?|part)\s*\d+\b|\bseries\b/.test(title);
  if (!hasSeriesMarker) return false;
  const hasShape = candidate.pageCount >= 120 && String(candidate?.description || '').trim().length > 120;
  return !hasLegitSeriesAuthority(candidate) && !hasShape;
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

function isNoCoverLowQualityMetaCandidate(candidate: Candidate): boolean {
  if (candidate.hasCover) return false;

  const title = String(candidate.title || '').toLowerCase().trim();
  const subjects = Array.isArray(candidate.subjects) ? candidate.subjects.join(' ').toLowerCase() : '';
  const description = String(candidate.description || '').toLowerCase();
  const combined = [title, subjects, description, candidate.publisher].filter(Boolean).join(' ').toLowerCase();
  const ratings = Number(candidate.ratingCount || 0);
  const avg = Number(candidate.averageRating || 0);

  const metaShape =
    /(readings?|reader|criticism|critical|study|studies|analysis|essays?|companion|guide|reference|bibliography|catalogue?|catalog|survey|history of|history and criticism|in fiction|historical novels?|literary criticism)/.test(combined) ||
    /(readings?.*(novel|fiction|literature)|century readings?.*novel|redefining.*fiction|(life|women|race|gender|class).*in fiction)/.test(title);

  const weakShape =
    !description ||
    description.trim().length < 80 ||
    (candidate.pageCount > 0 && candidate.pageCount < 120) ||
    (candidate.pageCount === 0 && ratings === 0);

  const authority = ratings >= 20 || avg >= 4.0 || hasLegitSeriesAuthority(candidate);
  return metaShape || (weakShape && !authority && !/\b(novel|follows|story of|thriller|mystery|horror|fantasy|romance)\b/.test(description));
}

function hasCanonicalScienceFictionTitle(title: string): boolean {
  return /\b(dune|foundation|neuromancer|the left hand of darkness|the dispossessed|the lathe of heaven|parable of the sower|kindred|fahrenheit 451|brave new world|nineteen eighty[-\s]?four|1984|we|the time machine|the war of the worlds|the handmaid'?s tale|the testaments|klara and the sun|never let me go|the road|ready player one|annihilation|the power|the passage|the giver|the hunger games|the ballad of songbirds and snakes|a voyage to arcturus)\b/.test(title);
}

function hasCanonicalScienceFictionAuthor(author: string): boolean {
  return /\b(ursula k\.? le guin|octavia (e\. )?butler|philip k\.? dick|isaac asimov|arthur c\.? clarke|frank herbert|ray bradbury|william gibson|neal stephenson|george orwell|aldous huxley|h\. ?g\. ?wells|h g wells|margaret atwood|kazuo ishiguro|jeff vandermeer|cormac mccarthy|lois lowry|suzanne collins|ernest cline|naomi alderman|yevgeny zamyatin|evgenii zamyatin|mary shelley|justin cronin|ling ma)\b/.test(author);
}

function detectFormatCategory(
  rawDoc: any,
  source: CandidateSource,
  subjects: string[]
): FormatCategory {
  const subjectText = subjects.join(' ').toLowerCase();

  if (source === 'kitsu') return 'manga';
  if (source === 'comicVine') return 'comic';
  if (subjectText.includes('manga')) return 'manga';
  if (subjectText.includes('graphic novel') || subjectText.includes('graphic novels')) return 'graphic_novel';
  if (subjectText.includes('comic') || subjectText.includes('comics')) return 'comic';

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
  const queryText = getQueryText(rawDoc);
  const queryRung = getQueryRung(rawDoc);
  const normalizedQueryFamily = inferQueryFamily(rawDoc);
  const normalizedFilterFamily = normalizeText((rawDoc as any)?.filterFamily ?? (rawDoc as any)?.diagnostics?.filterFamily).trim() || undefined;
  const normalizedLaneKind = normalizeText((rawDoc as any)?.laneKind ?? (rawDoc as any)?.diagnostics?.laneKind).trim() || undefined;
  const historicalSignal =
    source === 'openLibrary' && (
      normalizedQueryFamily === 'historical' ||
      normalizedFilterFamily === 'historical' ||
      normalizedLaneKind === 'historical' ||
      /\b(historical fiction novel|19th century historical fiction novel|war historical fiction novel|society historical fiction novel|historical fiction|historical novel|period fiction)\b/.test(cleanQueryText(queryText))
    );

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
        v.includes('historical') ||
        v.includes('period fiction') ||
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
    queryRung,
    queryText,
    queryFamily: historicalSignal ? 'historical' : normalizedQueryFamily,
    filterFamily: historicalSignal ? 'historical' : normalizedFilterFamily,
    laneKind: historicalSignal ? 'historical' : normalizedLaneKind,
  };
}

export function normalizeCandidates(rawDocs: RecommendationDoc[], source: CandidateSource): Candidate[] {
  return (Array.isArray(rawDocs) ? rawDocs : [])
    .map((rawDoc) => normalizeCandidate(rawDoc, source))
    .filter((candidate) => !isClearlyNotABookCandidate(candidate))
    // Keep sparse/no-cover candidates in the candidate pool.
    // finalRecommender should decide whether they fit the user's taste strongly enough.
    .filter((candidate) => {
      if (candidate.source === 'openLibrary') {
        const text = [
          String(candidate.title || '').toLowerCase(),
          String(candidate.description || '').toLowerCase(),
          Array.isArray(candidate.subjects) ? candidate.subjects.join(' ').toLowerCase() : '',
          Array.isArray(candidate.genres) ? candidate.genres.join(' ').toLowerCase() : '',
        ].join(' ');

        const fantasySignal =
          /\b(fantasy|magic|wizard|witch|dragon|fae|mythic|quest|kingdom|sword|sorcery|epic fantasy|high fantasy|dark fantasy)\b/.test(text);

        const classicFantasyTitle =
          /\b(the hobbit|the fellowship of the ring|the two towers|the return of the king|a wizard of earthsea|dragonflight|the name of the wind)\b/.test(
            String(candidate.title || '').toLowerCase()
          );

        const historicalLaneCandidate =
          candidate.queryFamily === 'historical' ||
          /\b(historical fiction novel|19th century historical fiction novel|war historical fiction novel|society historical fiction novel)\b/.test(
            cleanQueryText(candidate.queryText)
          );

        const scienceFictionLaneCandidate =
          candidate.queryFamily === 'science_fiction' ||
          /\b(science fiction|dystopian|space opera|speculative)\b/.test(cleanQueryText(candidate.queryText));

        const canonicalScienceFiction =
          scienceFictionLaneCandidate &&
          (hasCanonicalScienceFictionTitle(String(candidate.title || '').toLowerCase()) ||
            hasCanonicalScienceFictionAuthor(String(candidate.author || '').toLowerCase()));

        const filterKept =
          candidate?.rawDoc?.diagnostics?.filterKept !== false &&
          candidate?.rawDoc?.rawDoc?.diagnostics?.filterKept !== false;
        if (filterKept) return Boolean(candidate.title) && Boolean(candidate.author);

        return Boolean(candidate.title) && Boolean(candidate.author) && !isClearlyNotABookCandidate(candidate) && (
          looksLikeFictionCandidate(candidate.rawDoc) ||
          fantasySignal ||
          classicFantasyTitle ||
          historicalLaneCandidate ||
          canonicalScienceFiction
        );
      }

      return looksLikeFictionCandidate(candidate.rawDoc);
    });
}
