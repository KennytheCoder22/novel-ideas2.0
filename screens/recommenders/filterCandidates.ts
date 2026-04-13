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

function inferFamily(bucketPlan: any): "thriller" | "speculative" | "romance" | "historical" | "general" {
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
  if (/(science fiction|sci-fi|fantasy|speculative|dystopian|space opera|haunted|horror|survival)/.test(text)) return "speculative";
  if (/(romance|love story|rom-com|rom com)/.test(text)) return "romance";
  if (/(historical|period fiction|gilded age|19th century|world war)/.test(text)) return "historical";
  return "general";
}

function sourceForDoc(doc: any): "googleBooks" | "openLibrary" | "kitsu" | "gcd" {
  if (doc?.source === "googleBooks" || doc?.source === "openLibrary" || doc?.source === "kitsu" || doc?.source === "gcd") {
    return doc.source;
  }
  return "openLibrary";
}

function looksLikeFictionCandidate(doc: any): boolean {
  const title = normalizeText(doc?.title ?? doc?.volumeInfo?.title);
  const categories = collectCategoryText(doc);
  const description = collectDescriptionText(doc);
  const author = normalizeText(
    doc?.author_name ?? doc?.authors ?? doc?.author ?? doc?.authorName ?? doc?.volumeInfo?.authors
  );
  const combined = [title, categories, description, author].filter(Boolean).join(" ");

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

  const fictionPositive =
    /\b(fiction|novel|thriller|mystery|crime|detective|suspense|dystopian|survival|science fiction|fantasy|horror)\b/.test(
      `${title} ${categories} ${description}`
    );

  const narrativePositive =
    /\b(follows|story of|when .* discovers|investigates|must survive|after .* collapse)\b/.test(description) ||
    /\b(novel|fiction)\b/.test(title);

  return fictionPositive || narrativePositive;
}

function hasLegitCommercialAuthority(doc: any): boolean {
  const ratingsCount = Number(doc?.ratingsCount || doc?.volumeInfo?.ratingsCount || 0);
  const avgRating = Number(doc?.averageRating || doc?.volumeInfo?.averageRating || 0);
  const commercialSignals = (doc as any)?.commercialSignals;
  const publisher = normalizeText(doc?.publisher ?? doc?.volumeInfo?.publisher);

  return (
    ratingsCount >= 250 ||
    avgRating >= 4.2 ||
    Boolean(commercialSignals?.bestseller) ||
    Number(commercialSignals?.awards || 0) > 0 ||
    Number(commercialSignals?.popularityTier || 0) >= 2 ||
    /\b(penguin|random house|knopf|doubleday|viking|harper|macmillan|tor|simon\s*&?\s*schuster|hachette|st\.? martin|ballantine)\b/.test(publisher)
  );
}

function looksLikeLowValueGoogleBooksThriller(doc: any): boolean {
  const title = normalizeText(doc?.title ?? doc?.volumeInfo?.title);
  const description = collectDescriptionText(doc);
  const categories = collectCategoryText(doc);
  const publisher = normalizeText(doc?.publisher ?? doc?.volumeInfo?.publisher);
  const combined = [title, categories, description, publisher].filter(Boolean).join(" ");

  const shortOrTieInSignals =
    /\b(prequel|short prequel|short novel|novella|short story|tie[-\s]?in|book\s*0\b|episode)\b/.test(combined);

  const genericPackagingSignals =
    /\b(gripping|unputdownable|jaw[-\s]?dropping|twisty|pulse[-\s]?pounding|page[-\s]?turner|book\s*1\b|series starter|a .* thriller)\b/.test(combined);

  const genericTitleSignals =
    /\b(ashes of alibi|wish me dead|murder in [a-z]+|crime scene|high crimes)\b/.test(title);

  const weakAuthority = !hasLegitCommercialAuthority(doc);

  return shortOrTieInSignals || genericTitleSignals || (genericPackagingSignals && weakAuthority);
}

function looksLikeAnchorLaneCandidate(doc: any, bucketPlan: any): boolean {
  if (!looksLikeFictionCandidate(doc)) return false;

  const title = normalizeText(doc?.title ?? doc?.volumeInfo?.title);
  const categories = collectCategoryText(doc);
  const description = collectDescriptionText(doc);
  const combined = [title, categories, description].filter(Boolean).join(" ");
  const family = inferFamily(bucketPlan);

  const hardRejectPatterns = [
    /\bwrite a bestselling\b/,
    /\bguide\b/,
    /\bcompanion\b/,
    /\bseo for authors\b/,
    /\bwriter'?s market\b/,
    /\bbook review\b/,
    /\bpublishers? weekly\b/,
    /\bnew york times book review\b/,
    /\bbookselling\b/,
    /\bcompanion to\b/,
    /\bbest american mystery\b/,
    /\bbest new horror\b/,
    /\bbestsellers?\b/,
    /\bboxed set\b/,
    /\bcollection\b/,
  ];

  if (hardRejectPatterns.some((rx) => rx.test(title) || rx.test(combined))) return false;

  if (family === "thriller") {
    const thrillerSignal =
      /\b(thriller|crime|mystery|detective|suspense|psychological|murder|investigation|serial killer|domestic suspense)\b/.test(combined);
    const antiSignals =
      /\b(horror|ghost|haunted|zombie|monster|science fiction|fantasy|dragon|magic)\b/.test(combined);
    return thrillerSignal && !antiSignals;
  }

  if (family === "speculative") {
    return /\b(novel|fiction|dystopian|science fiction|survival|post-apocalyptic|fantasy|horror)\b/.test(combined);
  }

  return true;
}

function looksLikeOpenLibraryPrecisionCandidate(doc: any, bucketPlan: any): boolean {
  if (!looksLikeFictionCandidate(doc)) return false;

  const title = normalizeText(doc?.title ?? doc?.volumeInfo?.title);
  const categories = collectCategoryText(doc);
  const description = collectDescriptionText(doc);
  const combined = [title, categories, description].filter(Boolean).join(" ");
  const family = inferFamily(bucketPlan);

  if (/\b(shakespeare|romeo and juliet|complete works|plays\b|poems?\b|sonnets?\b)\b/.test(combined)) return false;

  if (family === "thriller") {
    const strongSignal =
      /\b(thriller|crime|mystery|detective|suspense|psychological|murder|investigation|serial killer|domestic suspense|legal thriller|police procedural|noir|missing person|procedural)\b/.test(combined);

    const groundedBacklistSignal =
      /\b(realistic|grounded|procedural|investigator|case|disappearance|missing|noir)\b/.test(combined);

    const weakOrOffGenre = /\b(romance|poetry)\b/.test(combined);
    return (strongSignal || groundedBacklistSignal) && !weakOrOffGenre;
  }

  if (family === "speculative") {
    return /\b(dystopian|survival|science fiction|post-apocalyptic|novel|fiction|fantasy|horror)\b/.test(combined);
  }

  return true;
}

function looksLikeGoogleBooksFamilyCandidate(doc: any, bucketPlan: any): boolean {
  if (!looksLikeFictionCandidate(doc)) return false;

  const categories = collectCategoryText(doc);
  const description = collectDescriptionText(doc);
  const combined = [categories, description].filter(Boolean).join(" ");
  const family = inferFamily(bucketPlan);

  if (family === "thriller") {
    const cozyOrHumorousSignals =
      /\b(cozy|cosy|humorous|funny|comic|comedic|gentle mystery|small town|culinary mystery)\b/.test(combined);

    const faithBasedSignals =
      /\b(faith-based|christian fiction|inspirational fiction|amish fiction|forbidden love)\b/.test(combined);

    const strongSuspenseSignals =
      /\b(psychological|psychological suspense|domestic suspense|thriller|crime thriller|serial killer|missing|disappearance|investigation|detective|police procedural|legal thriller|gripping|twist|obsession|secret|noir|procedural)\b/.test(combined);

    const weakNarrativeShape =
      !/\b(missing|disappearance|investigation|detective|case|killer|murder|obsession|secret|procedural|noir|psychological)\b/.test(combined);

    if (cozyOrHumorousSignals) return false;
    if (faithBasedSignals && !strongSuspenseSignals) return false;
    if (looksLikeLowValueGoogleBooksThriller(doc)) return false;
    if (!strongSuspenseSignals) return false;
    if (weakNarrativeShape && !hasLegitCommercialAuthority(doc)) return false;
    return true;
  }

  if (family === "speculative") {
    const speculativeSignals =
      /\b(dystopian|survival|post-apocalyptic|apocalypse|science fiction|sci-fi|novel|fiction)\b/.test(combined);
    const academicSignals =
      /\b(studies|criticism|analysis|guide|encyclopedia|handbook|proceedings|journal)\b/.test(combined);
    return speculativeSignals && !academicSignals;
  }

  return true;
}

export function filterCandidates(docs: RecommendationDoc[], bucketPlan: any): RecommendationDoc[] {
  const inputDocs = Array.isArray(docs) ? docs : [];
  const filtered: RecommendationDoc[] = [];

  for (const doc of inputDocs) {
    const source = sourceForDoc(doc);
    const laneKind = doc?.laneKind ?? doc?.diagnostics?.laneKind ?? doc?.rawDoc?.laneKind;

    if (!looksLikeFictionCandidate(doc)) continue;

    if (laneKind === "anchor" && !looksLikeAnchorLaneCandidate(doc, bucketPlan)) continue;

    if (source === "googleBooks" && !looksLikeGoogleBooksFamilyCandidate(doc, bucketPlan)) continue;
    if (source === "openLibrary" && !looksLikeOpenLibraryPrecisionCandidate(doc, bucketPlan)) continue;

    filtered.push(doc);
  }

  return filtered;
}

export default filterCandidates;
