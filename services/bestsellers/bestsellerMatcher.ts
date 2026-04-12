// /services/bestsellers/bestsellerMatcher.ts

import type { RecommendationDoc } from "../../screens/recommenders/types";

export type BestsellerMergeOptions = {
  allowInjections?: boolean;
};

export type BestsellerMergeResult = {
  docs: RecommendationDoc[];
  matchedCount: number;
  injectedCount: number;
};

function normalizeText(value: unknown): string {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeIsbn(value: unknown): string {
  return String(value || "").replace(/[^0-9xX]/g, "").toUpperCase().trim();
}

function cleanString(value: unknown): string {
  return String(value || "").trim();
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => cleanString(item)).filter(Boolean);
  }

  const cleaned = cleanString(value);
  return cleaned ? [cleaned] : [];
}

function getAuthorList(doc: any): string[] {
  const raw =
    doc?.author_name ??
    doc?.authors ??
    doc?.author ??
    doc?.authorName ??
    doc?.volumeInfo?.authors ??
    [];

  if (Array.isArray(raw)) {
    return raw.map((value) => cleanString(typeof value === "string" ? value : value?.name)).filter(Boolean);
  }

  const single = cleanString(raw);
  return single ? [single] : [];
}

function getPrimaryAuthor(doc: any): string {
  return getAuthorList(doc)[0] || "";
}

function getTitle(doc: any): string {
  return cleanString(doc?.title || doc?.volumeInfo?.title);
}

function getDescription(doc: any): string {
  const raw = doc?.description ?? doc?.volumeInfo?.description;
  if (typeof raw === "string") return raw.trim();
  if (raw && typeof raw === "object" && typeof raw.text === "string") return raw.text.trim();
  return "";
}

function getPublisherArray(doc: any): string[] {
  return asStringArray(doc?.publisher ?? doc?.volumeInfo?.publisher);
}

function getSubjectArray(doc: any): string[] {
  return [
    ...asStringArray(doc?.subject),
    ...asStringArray(doc?.subjects),
    ...asStringArray(doc?.categories),
    ...asStringArray(doc?.volumeInfo?.categories),
    ...asStringArray(doc?.volumeInfo?.subjects),
  ];
}

function getIndustryIdentifiers(doc: any): string[] {
  const identifiers = Array.isArray(doc?.volumeInfo?.industryIdentifiers)
    ? doc.volumeInfo.industryIdentifiers
    : [];

  return identifiers
    .map((item: any) => normalizeIsbn(item?.identifier))
    .filter(Boolean);
}

function getDocIsbns(doc: any): string[] {
  const raw = [
    ...asStringArray(doc?.isbn13),
    ...asStringArray(doc?.isbn10),
    ...asStringArray(doc?.primary_isbn13),
    ...asStringArray(doc?.primary_isbn10),
    ...getIndustryIdentifiers(doc),
  ];

  return Array.from(new Set(raw.map((value) => normalizeIsbn(value)).filter(Boolean)));
}

function titleAuthorKey(doc: any): string {
  const title = normalizeText(getTitle(doc));
  const author = normalizeText(getPrimaryAuthor(doc));
  return title && author ? `${title}|${author}` : "";
}

function mergeUniqueStrings(left: string[], right: string[]): string[] | undefined {
  const merged = Array.from(new Set([...left, ...right].map((value) => cleanString(value)).filter(Boolean)));
  return merged.length ? merged : undefined;
}

function mergeCommercialSignals(existing: any, incoming: any) {
  const left = existing?.commercialSignals || {};
  const right = incoming?.commercialSignals || {};
  const leftSourceCount = Number(left?.sourceCount || 0);
  const rightSourceCount = Number(right?.sourceCount || 0);

  return {
    ...left,
    ...right,
    bestseller: Boolean(left?.bestseller || right?.bestseller),
    awards: Math.max(Number(left?.awards || 0), Number(right?.awards || 0)),
    popularityTier: Math.max(Number(left?.popularityTier || 0), Number(right?.popularityTier || 0)),
    sourceCount: Math.max(leftSourceCount, rightSourceCount, leftSourceCount + rightSourceCount),
  };
}

function mergeDocs(existing: RecommendationDoc, incoming: RecommendationDoc): RecommendationDoc {
  const merged = {
    ...incoming,
    ...existing,
    author_name: mergeUniqueStrings(
      getAuthorList(existing),
      getAuthorList(incoming)
    ),
    subject: mergeUniqueStrings(
      getSubjectArray(existing),
      getSubjectArray(incoming)
    ),
    language: mergeUniqueStrings(
      asStringArray((existing as any)?.language),
      asStringArray((incoming as any)?.language)
    ),
    publisher: mergeUniqueStrings(
      getPublisherArray(existing),
      getPublisherArray(incoming)
    ),
    isbn10: mergeUniqueStrings(
      asStringArray((existing as any)?.isbn10),
      asStringArray((incoming as any)?.isbn10)
    ),
    isbn13: mergeUniqueStrings(
      asStringArray((existing as any)?.isbn13),
      asStringArray((incoming as any)?.isbn13)
    ),
    description: getDescription(existing) || getDescription(incoming) || undefined,
    cover_i: (existing as any)?.cover_i || (incoming as any)?.cover_i || undefined,
    edition_count:
      Number.isFinite(Number((existing as any)?.edition_count))
        ? Number((existing as any)?.edition_count)
        : Number.isFinite(Number((incoming as any)?.edition_count))
        ? Number((incoming as any)?.edition_count)
        : undefined,
    commercialSignals: mergeCommercialSignals(existing, incoming),
    nyt: {
      ...((incoming as any)?.nyt || {}),
      ...((existing as any)?.nyt || {}),
    },
    source:
      (existing as any)?.source === "googleBooks" ||
      (existing as any)?.source === "openLibrary" ||
      (existing as any)?.source === "kitsu" ||
      (existing as any)?.source === "gcd"
        ? (existing as any).source
        : (incoming as any)?.source || "openLibrary",
    queryRung:
      Number.isFinite(Number((existing as any)?.queryRung))
        ? Number((existing as any)?.queryRung)
        : Number.isFinite(Number((incoming as any)?.queryRung))
        ? Number((incoming as any)?.queryRung)
        : undefined,
    queryText:
      typeof (existing as any)?.queryText === "string" && (existing as any).queryText.trim()
        ? (existing as any).queryText
        : typeof (incoming as any)?.queryText === "string"
        ? (incoming as any).queryText
        : undefined,
    laneKind:
      typeof (existing as any)?.laneKind === "string" && (existing as any).laneKind.trim()
        ? (existing as any).laneKind
        : typeof (incoming as any)?.laneKind === "string"
        ? (incoming as any).laneKind
        : undefined,
  } as RecommendationDoc;

  return merged;
}

function documentText(doc: any): string {
  return [
    getTitle(doc),
    getDescription(doc),
    ...getSubjectArray(doc),
    ...getPublisherArray(doc),
    cleanString(doc?.queryText),
    cleanString(doc?.subtitle),
    cleanString(doc?.series),
    cleanString(doc?.volumeInfo?.subtitle),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function countPatternHits(text: string, patterns: RegExp[]): number {
  let hits = 0;
  for (const pattern of patterns) {
    if (pattern.test(text)) hits += 1;
  }
  return hits;
}

function inferSessionFamily(existingDocs: RecommendationDoc[]): "thriller" | "romance" | "speculative" | "historical" | "general" {
  const combinedText = (Array.isArray(existingDocs) ? existingDocs : [])
    .slice(0, 60)
    .map((doc) => documentText(doc))
    .join(" ");

  const thrillerHits = countPatternHits(combinedText, [
    /\bthriller\b/,
    /\bmystery\b/,
    /\bcrime\b/,
    /\bdetective\b/,
    /\bsuspense\b/,
    /\bpsychological\b/,
    /\bmurder\b/,
    /\binvestigation\b/,
    /\bdomestic suspense\b/,
  ]);

  const speculativeHits = countPatternHits(combinedText, [
    /\bfantasy\b/,
    /\bscience fiction\b/,
    /\bsci fi\b/,
    /\bspeculative\b/,
    /\bdystopian\b/,
    /\bspace opera\b/,
    /\bhorror\b/,
    /\bhaunted\b/,
    /\bmagic\b/,
  ]);

  const romanceHits = countPatternHits(combinedText, [
    /\bromance\b/,
    /\bromantic\b/,
    /\blove story\b/,
    /\brelationship fiction\b/,
  ]);

  const historicalHits = countPatternHits(combinedText, [
    /\bhistorical\b/,
    /\bworld war\b/,
    /\b19th century\b/,
    /\bperiod fiction\b/,
  ]);

  const scored = [
    { family: "thriller" as const, hits: thrillerHits },
    { family: "speculative" as const, hits: speculativeHits },
    { family: "romance" as const, hits: romanceHits },
    { family: "historical" as const, hits: historicalHits },
  ].sort((a, b) => b.hits - a.hits);

  if (!scored[0] || scored[0].hits <= 0) return "general";
  return scored[0].family;
}

function matchesFamily(doc: RecommendationDoc, family: "thriller" | "romance" | "speculative" | "historical" | "general"): boolean {
  if (family === "general") return true;

  const text = documentText(doc);

  const fictionPositive = /\b(novel|fiction|thriller|mystery|crime|detective|suspense|romance|fantasy|science fiction|historical fiction)\b/.test(text);
  if (!fictionPositive) return false;

  const referenceNegative = /\b(guide|handbook|encyclopedia|analysis|criticism|study guide|reference|bookselling|publishers weekly|book review|writers market|literary agents|companion|manual|textbook)\b/.test(text);
  if (referenceNegative) return false;

  if (family === "thriller") {
    const positive = countPatternHits(text, [
      /\bthriller\b/,
      /\bmystery\b/,
      /\bcrime\b/,
      /\bdetective\b/,
      /\bsuspense\b/,
      /\bpsychological\b/,
      /\bmurder\b/,
      /\binvestigation\b/,
      /\bserial killer\b/,
      /\bdomestic suspense\b/,
      /\bpolice procedural\b/,
    ]);

    const negative = countPatternHits(text, [
      /\blitrpg\b/,
      /\bdungeon\b/,
      /\bdragon\b/,
      /\bfae\b/,
      /\bmagic\b/,
      /\bspace opera\b/,
      /\bepic fantasy\b/,
      /\bromantasy\b/,
      /\bcozy fantasy\b/,
      /\bpoems?\b/,
      /\bplays?\b/,
      /\bsonnets?\b/,
    ]);

    return positive >= 1 && negative === 0;
  }

  if (family === "speculative") {
    return countPatternHits(text, [
      /\bfantasy\b/,
      /\bscience fiction\b/,
      /\bsci fi\b/,
      /\bspeculative\b/,
      /\bdystopian\b/,
      /\bmagic\b/,
      /\bhorror\b/,
    ]) >= 1;
  }

  if (family === "romance") {
    return countPatternHits(text, [
      /\bromance\b/,
      /\bromantic\b/,
      /\blove story\b/,
      /\brelationship fiction\b/,
    ]) >= 1;
  }

  if (family === "historical") {
    return countPatternHits(text, [
      /\bhistorical\b/,
      /\bhistorical fiction\b/,
      /\bperiod fiction\b/,
      /\bworld war\b/,
      /\b19th century\b/,
    ]) >= 1;
  }

  return true;
}

export function mergeBestsellerDocs(
  existingDocs: RecommendationDoc[],
  bestsellerDocs: RecommendationDoc[],
  options?: BestsellerMergeOptions
): BestsellerMergeResult {
  const allowInjections = options?.allowInjections !== false;
  const docs = Array.isArray(existingDocs) ? [...existingDocs] : [];
  const sessionFamily = inferSessionFamily(docs);

  const byIsbn = new Map<string, number>();
  const byTitleAuthor = new Map<string, number>();

  for (let i = 0; i < docs.length; i += 1) {
    const doc = docs[i];

    for (const isbn of getDocIsbns(doc)) {
      if (!byIsbn.has(isbn)) byIsbn.set(isbn, i);
    }

    const identity = titleAuthorKey(doc);
    if (identity && !byTitleAuthor.has(identity)) {
      byTitleAuthor.set(identity, i);
    }
  }

  let matchedCount = 0;
  let injectedCount = 0;

  for (const bestsellerDoc of Array.isArray(bestsellerDocs) ? bestsellerDocs : []) {
    if (!bestsellerDoc || !getTitle(bestsellerDoc)) continue;

    const isbnMatches = getDocIsbns(bestsellerDoc)
      .map((isbn) => byIsbn.get(isbn))
      .filter((index): index is number => Number.isInteger(index));

    const identity = titleAuthorKey(bestsellerDoc);
    const identityMatch = identity ? byTitleAuthor.get(identity) : undefined;

    const targetIndex = isbnMatches[0] ?? identityMatch;

    if (Number.isInteger(targetIndex)) {
      docs[targetIndex] = mergeDocs(docs[targetIndex], bestsellerDoc);
      matchedCount += 1;
      continue;
    }

    if (!allowInjections) continue;
    if (!matchesFamily(bestsellerDoc, sessionFamily)) continue;

    const injected = {
      ...bestsellerDoc,
      source:
        (bestsellerDoc as any)?.source === "googleBooks" ||
        (bestsellerDoc as any)?.source === "openLibrary" ||
        (bestsellerDoc as any)?.source === "kitsu" ||
        (bestsellerDoc as any)?.source === "gcd"
          ? (bestsellerDoc as any).source
          : "openLibrary",
      queryRung: Number.isFinite(Number((bestsellerDoc as any)?.queryRung))
        ? Number((bestsellerDoc as any)?.queryRung)
        : 90,
      laneKind:
        typeof (bestsellerDoc as any)?.laneKind === "string" && (bestsellerDoc as any)?.laneKind.trim()
          ? (bestsellerDoc as any).laneKind
          : "anchor",
    } as RecommendationDoc;

    const newIndex = docs.push(injected) - 1;
    injectedCount += 1;

    for (const isbn of getDocIsbns(injected)) {
      if (!byIsbn.has(isbn)) byIsbn.set(isbn, newIndex);
    }

    const injectedIdentity = titleAuthorKey(injected);
    if (injectedIdentity && !byTitleAuthor.has(injectedIdentity)) {
      byTitleAuthor.set(injectedIdentity, newIndex);
    }
  }

  return {
    docs,
    matchedCount,
    injectedCount,
  };
}
