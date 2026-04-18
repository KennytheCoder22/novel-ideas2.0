import type { RecommendationDoc } from "./types";

type RouterFamily = "thriller" | "speculative" | "romance" | "historical" | "general";

type FilterDiagnostics = {
  kept: boolean;
  family: RouterFamily;
  wantsHorrorTone: boolean;
  title: string;
  pageCount: number;
  ratingsCount: number;
  hasDescription: boolean;
  hasRealLength: boolean;
  passedChecks: string[];
  rejectReasons: string[];
  flags: {
    fictionPositive: boolean;
    strongNarrative: boolean;
    genericTitle: boolean;
    speculativePositive: boolean;
    thrillerPositive: boolean;
    horrorAligned: boolean;
    historicalPositive: boolean;
    romancePositive: boolean;
  };
};

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

function inferRouterFamily(bucketPlan: any): RouterFamily {
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

  if (/(haunted|ghost|supernatural|occult|monster|creature|apocalypse|post-apocalyptic|zombie|survival horror|body horror|psychological horror|horror|science fiction|sci-fi|fantasy|speculative|dystopian|space opera|technology|ai)/.test(text)) return "speculative";
  if (/(thriller|mystery|crime|detective|suspense|psychological|murder|investigation)/.test(text)) return "thriller";
  if (/(romance|love story|rom-com|rom com)/.test(text)) return "romance";
  if (/(historical|period fiction|gilded age|19th century|world war)/.test(text)) return "historical";
  return "general";
}

function wantsHorrorTone(bucketPlan: any): boolean {
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

  return /(horror|haunted|ghost|supernatural|occult|monster|creature|zombie|body horror|psychological horror|survival horror|terror|dread|eerie|disturbing|dark fantasy)/.test(text);
}

function buildFilterDiagnostics(doc: any, bucketPlan: any): FilterDiagnostics {
  const title = normalizeText(doc?.title ?? doc?.volumeInfo?.title);
  const categories = collectCategoryText(doc);
  const description = collectDescriptionText(doc);
  const author = normalizeText(
    doc?.author_name ?? doc?.authors ?? doc?.author ?? doc?.authorName ?? doc?.volumeInfo?.authors
  );
  const combined = [title, categories, description, author].filter(Boolean).join(" ");
  const family = inferRouterFamily(bucketPlan);
  const horrorToneWanted = wantsHorrorTone(bucketPlan);

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
    /\bnovels? and tales?\b/,
    /\brelated works?\b/,
    /^\s*restif'?s novels\s*$/,
    /^\s*the crime novel\s*$/,
    /^\s*mystery fiction\s*$/,
    /^\s*crime fiction\s*$/,
    /i['’]?m looking for a book/,
    /\btrue stories?\b/,
    /\bsea stories?\b/,
    /\bsteamboat stories?\b/,
    /\bsurvival bible\b/,
    /\bdictionary of\b/,
    /\bhistorical dictionary\b/,
    /\bguide to united states popular culture\b/,
    /\bfuture of the novel\b/,
    /\bnovelists?\b/,
    /\bnovel vs\.? fiction\b/,
    /\bnovels? and (other works|related works|stories|tales)\b/,
    /\bfamous authors on their methods\b/,
    /\bon their methods\b/,
    /\bselected novels? and plays\b/,
    /\bintroduction to the novels? of\b/,
    /\bdevelopment of .* novel\b/,
    /\benglish gothic novel\b/,
    /\bgothic novel:\s*texts\b/,
    /\bnovel:\s*texts\b/,
    /\btexts\s*$/,
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
    /\btexts\b/,
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
    /\breal[- ]life\b/,
    /\btrue story\b/,
    /\bnon[- ]fiction\b/,
    /\bmemoir\b/,
    /\bbiograph(?:y|ical)\b/,
  ];

  const pageCount = Number(doc?.pageCount) || Number(doc?.volumeInfo?.pageCount) || 0;
  const ratingsCount =
    Number(doc?.ratingsCount) ||
    Number(doc?.volumeInfo?.ratingsCount) ||
    Number(doc?.hardcover?.ratings_count) ||
    0;
  const hasDescription = String(doc?.description || doc?.volumeInfo?.description || "").trim().length > 120;
  const hasRealLength = pageCount >= 120;

  const fictionPositive =
    /\b(fiction|novel|thriller|suspense|dystopian|survival|science fiction|fantasy|horror|romance|historical fiction|literary fiction|young adult)\b/.test(
      combined
    );

  const strongNarrative =
    /\b(novel|thriller|horror|suspense|fiction)\b/.test(title) ||
    /\b(follows|story of|when .* discovers|must survive|after .* happens|trapped in|haunted by|must confront|investigates|must uncover)\b/.test(description);

  const genericTitle =
    /^\s*novels?\b/.test(title) ||
    /^\s*novelists?\b/.test(title) ||
    /\bnovels?\s+of\b/.test(title) ||
    /\bnovels?\s+and\s+(tales|stories|other works|related works)\b/.test(title) ||
    /\bfuture of the novel\b/.test(title);

  const speculativePositive =
    /\b(science fiction|fantasy|dystopian|speculative|space|spaceship|alien|robot|android|ai|artificial intelligence|future|time travel|portal|parallel world|magic|magical|haunted|ghost|supernatural|occult|monster|creature|horror|survival horror|terror|dread)\b/.test(
      combined
    );

  const thrillerPositive =
    /\b(thriller|suspense|psychological|murder|serial killer|investigation|police procedural|noir|survival)\b/.test(
      combined
    );

  const horrorAligned =
    /\b(horror|haunted|ghost|supernatural|occult|monster|creature|survival horror|terror|dread|eerie|disturbing|dark fantasy)\b/.test(combined);

  const historicalPositive =
    /\b(historical fiction|historical novel|period fiction|victorian|edwardian|civil war|world war|regency|gilded age)\b/.test(
      combined
    );

  const romancePositive = /\b(romance|love story|romantic)\b/.test(combined);

  const diagnostics: FilterDiagnostics = {
    kept: false,
    family,
    wantsHorrorTone: horrorToneWanted,
    title,
    pageCount,
    ratingsCount,
    hasDescription,
    hasRealLength,
    passedChecks: [],
    rejectReasons: [],
    flags: {
      fictionPositive,
      strongNarrative,
      genericTitle,
      speculativePositive,
      thrillerPositive,
      horrorAligned,
      historicalPositive,
      romancePositive,
    },
  };

  if (!title) diagnostics.rejectReasons.push("missing_title");
  if (hardRejectTitlePatterns.some((rx) => rx.test(title))) diagnostics.rejectReasons.push("hard_reject_title");
  if (hardRejectCategoryPatterns.some((rx) => rx.test(categories))) diagnostics.rejectReasons.push("hard_reject_category");
  if (hardRejectDescriptionPatterns.some((rx) => rx.test(description))) diagnostics.rejectReasons.push("hard_reject_description");
  if (/\bliterature\b/.test(categories) && !/\bfiction\b/.test(categories)) diagnostics.rejectReasons.push("literature_without_fiction");

  const bookCultureReject =
    /\b(book lady|readers'? advisory|popular fiction|books and reading|literary culture|book review|writing speculative fiction)\b/.test(title) ||
    /\b(readers'? advisory|books and reading|book clubs?|library science|literary criticism|popular fiction)\b/.test(categories) ||
    /\b(readers'? advisory|about books|guide for readers|history of horror literature|literary reference)\b/.test(description);
  if (bookCultureReject) diagnostics.rejectReasons.push("book_culture_reference");

  const academicNovelStudyReject =
    /\b(english gothic novel|gothic novel:\s*texts|novel:\s*texts)\b/.test(title) ||
    (/\btexts\b/.test(title) && /\b(literature|criticism|studies)\b/.test(categories + " " + description));
  if (academicNovelStudyReject) diagnostics.rejectReasons.push("academic_novel_study");

  const novelMetaReject =
    /\b(future of the novel|novelists?|novel vs\.? fiction|famous authors on their methods|introduction to the novels? of|development of .* novel|selected novels? and plays|novels? and (other works|related works|stories|tales))\b/.test(combined);
  if (novelMetaReject) diagnostics.rejectReasons.push("novel_meta_reference");

  if (!fictionPositive) diagnostics.rejectReasons.push("missing_fiction_signal");
  if (genericTitle) diagnostics.rejectReasons.push("generic_title");
  if (!strongNarrative) diagnostics.rejectReasons.push("missing_narrative_signal");
  if (!hasRealLength && !hasDescription) diagnostics.rejectReasons.push("insufficient_length_or_description");

  if (family === "speculative") {
    const speculativeReject =
      /\b(bookshop mysteries|family names|family science|theme in .* fiction|science fact\/science fiction|analog science|public library|publishers weekly|books?\s*\d+\s*-\s*\d+|historical dictionary|guide to|popular culture)\b/.test(
        combined
      );
    if (!speculativePositive) diagnostics.rejectReasons.push("missing_speculative_signal");
    if (speculativeReject) diagnostics.rejectReasons.push("speculative_off_profile_reference");
  }

  if (family === "thriller") {
    if (!thrillerPositive) diagnostics.rejectReasons.push("missing_thriller_signal");
    if (horrorToneWanted && !horrorAligned) diagnostics.rejectReasons.push("missing_horror_alignment");
  }

  if (family === "historical" && !historicalPositive) diagnostics.rejectReasons.push("missing_historical_signal");
  if (family === "romance" && !romancePositive) diagnostics.rejectReasons.push("missing_romance_signal");

  if (fictionPositive) diagnostics.passedChecks.push("fiction_positive");
  if (strongNarrative) diagnostics.passedChecks.push("strong_narrative");
  if (hasRealLength || hasDescription) diagnostics.passedChecks.push("minimum_shape");

  return diagnostics;
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
  if (pageCount >= 240 && String(doc?.title || doc?.volumeInfo?.title || "").trim().length > 0 && hasDescription) return true;

  return false;
}

function attachDiagnostics(doc: RecommendationDoc, diagnostics: FilterDiagnostics): RecommendationDoc {
  const existing = (doc as any)?.diagnostics || {};
  return {
    ...(doc as any),
    diagnostics: {
      ...existing,
      filterDiagnostics: diagnostics,
      filterKept: diagnostics.kept,
      filterRejectReasons: diagnostics.rejectReasons,
      filterPassedChecks: diagnostics.passedChecks,
      filterFamily: diagnostics.family,
      filterWantsHorrorTone: diagnostics.wantsHorrorTone,
      filterFlags: diagnostics.flags,
      pageCount: diagnostics.pageCount,
      ratingsCount: diagnostics.ratingsCount,
    },
  } as RecommendationDoc;
}

export function filterCandidates(docs: RecommendationDoc[], bucketPlan: any): RecommendationDoc[] {
  const inputDocs = Array.isArray(docs) ? docs : [];
  const filtered: RecommendationDoc[] = [];

  for (const doc of inputDocs) {
    const diagnostics = buildFilterDiagnostics(doc, bucketPlan);

    if (diagnostics.rejectReasons.length === 0) {
      diagnostics.passedChecks.push("passed_content_gate");
    }

    if (diagnostics.rejectReasons.length > 0) {
      diagnostics.kept = false;
      filtered.push(...[]);
      Object.assign(doc as any, attachDiagnostics(doc, diagnostics));
      continue;
    }

    if (!hasMinimumRatings(doc)) {
      diagnostics.rejectReasons.push("below_ratings_floor");
      diagnostics.kept = false;
      Object.assign(doc as any, attachDiagnostics(doc, diagnostics));
      continue;
    }

    diagnostics.passedChecks.push("passed_ratings_gate");
    diagnostics.kept = true;

    const withDiagnostics = attachDiagnostics(doc, diagnostics);
    Object.assign(doc as any, withDiagnostics);
    filtered.push(withDiagnostics);
  }

  return filtered;
}

export default filterCandidates;
