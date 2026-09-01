export type LocalCollectionPresentationRecord = {
  localId?: string;
  title?: string;
  author?: string;
  description?: string;
  publicationYear?: number;
  shelvingLocation?: string;
  audience?: string;
  localPlacement?: string;
  coverUrl?: string;
  callNumber?: string;
  availability?: string;
  copies?: number;
  isbn10?: string;
  isbn13?: string;
  marcHoldings?: unknown;
};

export function adaptLocalCollectionSourceRecord(
  record: LocalCollectionPresentationRecord,
  options: {
    audienceBand?: string;
    queryText?: string;
    facets?: string[];
    tieBreakOrder?: number;
  } = {},
): Record<string, unknown> {
  const queryText = options.queryText || "local collection";
  return {
    id: `localLibrary:${record.localId || ""}`,
    sourceId: record.localId,
    title: record.title,
    authors: record.author ? [record.author] : [],
    description: record.description,
    publicationYear: record.publicationYear,
    formats: ["book"],
    genres: [record.shelvingLocation, record.audience].filter(Boolean),
    themes: [record.localPlacement].filter(Boolean),
    maturityBand: options.audienceBand,
    audienceBand: options.audienceBand,
    coverUrl: record.coverUrl,
    sourceUrl: undefined,
    queryText,
    originalPlannedQuery: queryText,
    queryFamily: "local_collection_text_match",
    queryCascadeIndex: 0,
    localCollectionTieBreakOrder: options.tieBreakOrder,
    facets: options.facets || [],
    callNumber: record.callNumber,
    subLocation: record.shelvingLocation || record.localPlacement,
    shelvingLocation: record.shelvingLocation,
    localPlacement: record.localPlacement,
    localCollectionCallNumber: record.callNumber,
    localCollectionPlacement: record.localPlacement,
    localCollectionAvailability: record.availability,
    localCollectionCopies: Math.max(1, Number(record.copies || 1) || 1),
    isbn: record.isbn13 || record.isbn10,
    isbn10: record.isbn10,
    isbn13: record.isbn13,
    localCollectionIsbn10: record.isbn10,
    localCollectionIsbn13: record.isbn13,
    marcHoldings: record.marcHoldings,
  };
}

export function localCollectionDetailDescription(record: {
  description?: unknown;
  displayDescription?: unknown;
}): string | undefined {
  return String(record.displayDescription || record.description || "").trim() || undefined;
}
