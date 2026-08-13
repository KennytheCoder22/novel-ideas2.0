import type { LocalCollectionRecommendationRecord } from "./storage";

export type LocalCollectionSearchResult = LocalCollectionRecommendationRecord & {
  relevanceScore: number;
};

function normalizeText(value: unknown): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9x]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeIsbn(value: unknown): string {
  return String(value || "").toUpperCase().replace(/[^0-9X]/g, "");
}

function scoreField(field: string, query: string, terms: string[], weights: {
  exact: number;
  prefix: number;
  contains: number;
  term: number;
}): number {
  if (!field) return 0;
  if (field === query) return weights.exact;
  if (field.startsWith(query)) return weights.prefix;
  if (field.includes(query)) return weights.contains;
  return terms.reduce((score, term) => score + (field.includes(term) ? weights.term : 0), 0);
}

export function searchLocalCollection(
  records: LocalCollectionRecommendationRecord[],
  rawQuery: string,
  limit = 12,
): LocalCollectionSearchResult[] {
  const query = normalizeText(rawQuery);
  const queryIsbn = normalizeIsbn(rawQuery);
  if (!query && !queryIsbn) return [];
  const terms = query.split(" ").filter(Boolean);

  return records.map((record) => {
    const title = normalizeText(record.title);
    const author = normalizeText(record.author);
    const metadata = normalizeText([
      record.shelvingLocation,
      record.localPlacement,
      record.callNumber,
      record.audience,
      record.readingLevel,
      ...(record.subjects || []),
      ...(record.genres || []),
    ].join(" "));
    const isbnMatch = queryIsbn.length >= 10
      && [record.isbn10, record.isbn13].some((isbn) => normalizeIsbn(isbn) === queryIsbn);
    const relevanceScore =
      (isbnMatch ? 2000 : 0)
      + scoreField(title, query, terms, { exact: 1200, prefix: 900, contains: 700, term: 100 })
      + scoreField(author, query, terms, { exact: 1100, prefix: 800, contains: 600, term: 90 })
      + scoreField(metadata, query, terms, { exact: 500, prefix: 350, contains: 300, term: 60 });
    return { ...record, relevanceScore };
  })
    .filter((record) => record.relevanceScore > 0)
    .sort((left, right) =>
      right.relevanceScore - left.relevanceScore
      || left.title.localeCompare(right.title)
      || left.author.localeCompare(right.author)
      || left.localId.localeCompare(right.localId)
    )
    .slice(0, Math.max(1, limit));
}
