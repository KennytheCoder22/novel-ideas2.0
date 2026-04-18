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
  if (/(science fiction|sci-fi|fantasy|speculative|dystopian|space opera|haunted|horror|technology|ai)/.test(text)) return "speculative";
  if (/(romance|love story|rom-com|rom com)/.test(text)) return "romance";
  if (/(historical|period fiction|gilded age|19th century|world war)/.test(text)) return "historical";
  return "general";
}

function looksLikeFictionCandidate(doc: any, bucketPlan: any): boolean {
  const title = normalizeText(doc?.title ?? doc?.volumeInfo?.title);
  const categories = collectCategoryText(doc);
  const description = collectDescriptionText(doc);
  const author = normalizeText(
    doc?.author_name ?? doc?.authors ?? doc?.author ?? doc?.authorName ?? doc?.volumeInfo?.authors
  );
  const combined = [title, categories, description, author].filter(Boolean).join(" ");
  const family = inferRouterFamily(bucketPlan);
  const laneKind = normalizeText((doc as any)?.laneKind ?? (doc as any)?.diagnostics?.laneKind);

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
    /\bfinding list of books\b/,
    /\bgeneral catalogue\b/,
    /\bcatalogue of english prose fiction\b/,
    /^\s*the book lady\s*$/,
    /\bpopular fiction\b/,
    /\bcentury of the .*novel\b/,
    /\bnovels? and tales\b/,
    /\bnovels? and related works\b/,
    /\brelated works\b/,
    /\bcomplete works\b/,
    /\bcollected works\b/,
    /\brestif'?s novels\b/,
    /\bthe crime novel\b/,
    /\bmystery fiction\b/,
    /\bcrime fiction\b/,
    /\bdetective fiction\b/,
    /\bi'?m looking for a book\b/,
    /\bthe new international encyclop(?:ae|a)e?dia\b/,
    /\btrue stories?\b/,
    /\bsea stories?\b/,
    /\bsteamboat stories?\b/,
    /\bsurvival bible\b/,
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
    /\bnovels?\b.*\b(criticism|study|history|analysis)\b/,
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
    /\bcollected essays\b/,
    /\bthis reference\b/,
    /\bnon[- ]fiction\b/,
    /\bmemoir\b/,
    /\bbiograph(?:y|ical)\b/,
    /\bchronicles the real\b/,
    /\btrue story\b/,
  ];

  if (hardRejectTitlePatterns.some((rx) => rx.test(title))) return false;
  if (hardRejectCategoryPatterns.some((rx) => rx.test(categories))) return false;
  if (hardRejectDescriptionPatterns.some((rx) => rx.test(description))) return false;
  if (/\bliterature\b/.test(categories) && !/\bfiction\b/.test(categories)) return false;

  const bookCultureReject =
    /\b(book lady|readers'? advisory|popular fiction|books and reading|literary culture|book review|writing speculative fiction)\b/.test(title) ||
    /\b(readers'? advisory|books and reading|book clubs?|library science|literary criticism|popular fiction)\b/.test(categories) ||
    /\b(readers'? advisory|about books|guide for readers|history of horror literature|literary reference)\b/.test(description);

  if (bookCultureReject) return false;

  const fictionPositive =
    /\b(fiction|novel|thriller|mystery novel|crime thriller|detective novel|suspense|dystopian|survival horror|science fiction|fantasy|horror novel|romance novel|historical fiction|literary fiction|young adult fiction|domestic suspense|psychological thriller|psychological suspense|police procedural|noir)\b/.test(combined);

  if (!fictionPositive) return false;

  const strongNarrative =
    /\b(follows|story of|when .* discovers|when .* realizes|investigates|must survive|must solve|must uncover|finds herself|finds himself|drawn into|haunted by|obsession|secret|killer|murder|missing|disappearance)\b/.test(description);

  const titleStorySignal =
    /\b(novel|thriller|suspense|psychological thriller|psychological suspense|domestic suspense|crime thriller|mystery novel|detective novel|horror novel)\b/.test(title) ||
    /\b(book\s*#?\d+|series)\b/.test(title);

  if (!strongNarrative && !titleStorySignal && description.length < 140) return false;

  if (laneKind === "strict-filtered") {
    const strictMetaReject =
      /\b(novels? and tales|related works|complete works|collected works|works of|encyclop|fiction theory|crime novel|mystery fiction|detective fiction|bibliograph|reference|reader|guide|handbook|study|criticism|analysis|summary|review|anthology|collection|book clubs?|books and reading|essays?)\b/.test(combined);

    const strictKeepSignal =
      /\b(novel|thriller|suspense|psychological thriller|psychological suspense|domestic suspense|crime thriller|mystery novel|detective novel|horror novel|police procedural|noir)\b/.test(combined) || strongNarrative;

    if (strictMetaReject || !strictKeepSignal) return false;
  }

  if (family === "speculative") {
    const speculativePositive =
      /\b(science fiction|fantasy|dystopian|speculative|space|spaceship|alien|robot|android|ai|artificial intelligence|future|time travel|portal|parallel world|magic|magical|haunted|ghost|horror|thriller|survival)\b/.test(combined);

    const speculativeReject =
      /\b(bookshop mysteries|family names|family science|theme in .* fiction|science fact\/science fiction|analog science|public library|publishers weekly|books?\s*\d+\s*-\s*\d+)\b/.test(combined);

    if (!speculativePositive) return false;
    if (speculativeReject) return false;
  }

  if (family === "thriller") {
    const thrillerPositive =
      /\b(thriller|crime thriller|mystery novel|detective novel|suspense|psychological|murder|serial killer|investigation|police procedural|noir|survival horror|domestic suspense|psychological suspense|psychological thriller|missing|disappearance|secret)\b/.test(combined);

    const thrillerMetaReject =
      /\b(the crime novel|mystery fiction|crime fiction|detective fiction|encyclop|study|criticism|analysis|related works|novels and tales|works of|books and reading)\b/.test(combined);

    if (!thrillerPositive) return false;
    if (thrillerMetaReject) return false;
  }

  if (family === "historical") {
    const historicalPositive =
      /\b(historical fiction|historical novel|period fiction|victorian|edwardian|civil war|world war|regency|gilded age)\b/.test(combined);
    if (!historicalPositive) return false;
  }

  if (family === "romance") {
    const romancePositive = /\b(romance novel|love story|romantic suspense|romantic thriller)\b/.test(combined);
    if (!romancePositive) return false;
  }

  return true;
}

const MIN_RATINGS = 20;

function hasMinimumRatings(doc: any): boolean {
  const ratings =
    Number(doc?.ratingsCount) ||
    Number(doc?.volumeInfo?.ratingsCount) ||
    Number(doc?.hardcover?.ratings_count) ||
    0;

  const pageCount =
    Number(doc?.pageCount) ||
    Number(doc?.volumeInfo?.pageCount) ||
    0;

  const hasDescription = String(
    doc?.description ||
    doc?.volumeInfo?.description ||
    ""
  ).trim().length > 120;

  if (ratings >= MIN_RATINGS) return true;
  if (pageCount >= 180 && hasDescription) return true;

  return false;
}

export function filterCandidates(docs: RecommendationDoc[], bucketPlan: any): RecommendationDoc[] {
  const inputDocs = Array.isArray(docs) ? docs : [];
  const filtered: RecommendationDoc[] = [];

  for (const doc of inputDocs) {
    if (!looksLikeFictionCandidate(doc, bucketPlan)) continue;
    if (!hasMinimumRatings(doc)) continue;
    filtered.push(doc);
  }

  return filtered;
}

export default filterCandidates;