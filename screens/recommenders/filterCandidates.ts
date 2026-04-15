import type { RecommendationDoc } from "./types";

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

  if (!title) return false;

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
    /\bpublishers?\s+weekly\b/,
    /\bjournal\b/,
    /\bmagazine\b/,
    /\bnewsweek\b/,
    /\bbibliograph(?:y|ies)\b/,
    /\brevision series\b/,
    /\bhow to write\b/,
    /\bwriter'?s market\b/,
    /\bbook review\b/,
    /\bstudy guide\b/,
    /\bboxed set\b/,
    /\bomnibus\b/,
    /\byear'?s best\b/,
    /\bbest american\b/,
    /\btrue crime\b/,
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
    /\bliterature\b/,
    /\bstudies\b/,
    /\btheory\b/,
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
    /\bwritten for students\b/,
    /\btextbook\b/,
    /\bworkbook\b/,
    /\bstudy guide\b/,
    /\bresearch\b/,
    /\bproceedings\b/,
  ];

  if (hardRejectTitlePatterns.some((rx) => rx.test(title))) return false;
  if (hardRejectCategoryPatterns.some((rx) => rx.test(categories))) return false;
  if (hardRejectDescriptionPatterns.some((rx) => rx.test(description))) return false;

  const combined = [title, categories, description, author].filter(Boolean).join(" ");

  const fictionPositive =
    /\b(fiction|novel|thriller|mystery|crime|detective|suspense|dystopian|survival|science fiction|fantasy|horror|romance|historical fiction|literary fiction|young adult)\b/.test(
      combined
    );

  const narrativePositive =
    /\b(follows|story of|when .* discovers|investigates|must survive|after .* collapse)\b/.test(description) ||
    /\b(novel|fiction)\b/.test(title);

  return fictionPositive || narrativePositive;
}

export function filterCandidates(docs: RecommendationDoc[], _bucketPlan: any): RecommendationDoc[] {
  const inputDocs = Array.isArray(docs) ? docs : [];
  const filtered: RecommendationDoc[] = [];

  for (const doc of inputDocs) {
    if (!looksLikeFictionCandidate(doc)) continue;
    filtered.push(doc);
  }

  return filtered;
}

export default filterCandidates;
