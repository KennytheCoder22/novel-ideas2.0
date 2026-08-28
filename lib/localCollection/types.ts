export type LocalCollectionRejectReason =
  | "missing_title"
  | "missing_or_untrustworthy_author"
  | "invalid_isbn"
  | "non_book_non_narrative_artifact"
  | "duplicate_merged"
  | "malformed_row"
  | "unsupported_record_shape"
  | "insufficient_identity";

export type LocalCollectionWarningCode =
  | "invalid_publication_year"
  | "missing_cover_url"
  | "missing_isbn"
  | "missing_audience_or_shelf_metadata";

export type LocalCollectionSourceFormat = "csv" | "marc21";

export interface LocalCollectionRawRow {
  rowNumber: number;
  sourceRowId?: string;
  raw: Record<string, string>;
}

export interface LocalCollectionNormalizedRecord {
  localId: string;
  workKey: string;
  editionKey: string;
  sourceFormat?: LocalCollectionSourceFormat;
  marcRecordControlNumber?: string;
  title: string;
  titleNormalized: string;
  author: string;
  authorNormalized: string;
  description?: string;
  isbn10?: string;
  isbn13?: string;
  publicationYear?: number;
  publicationDate?: string;
  audience?: string;
  readingLevel?: string;
  subjects?: string[];
  genres?: string[];
  shelvingLocation?: string;
  localPlacement?: string;
  callNumber?: string;
  copies: number;
  availability?: string;
  coverUrl?: string;
  marcHoldings?: Array<{
    locationCode?: string;
    collection?: string;
    callNumber?: string;
    copyId?: string;
    rawPacked?: string;
  }>;
  sourceRowId?: string;
  sourceRowNumbers: number[];
  sourceRows: LocalCollectionRawRow[];
  warnings: LocalCollectionWarningCode[];
}

export interface LocalCollectionRejectedRecord {
  rowNumber?: number;
  sourceRowId?: string;
  reason: LocalCollectionRejectReason;
  detail: string;
  raw?: Record<string, string>;
}

export interface LocalCollectionImportSummary {
  totalRows: number;
  acceptedTitles: number;
  mergedDuplicatesOrCopies: number;
  rejectedRows: number;
  warnings: number;
  titlesMissingCovers: number;
  titlesMissingIsbns: number;
  titlesMissingAudienceOrShelfMetadata: number;
}

export interface LocalCollectionArtifactMetadata {
  schemaVersion: "local_collection_import_v1";
  importTimestamp: string;
  sourceFilename: string;
  sourceFormat?: LocalCollectionSourceFormat;
  collectionName?: string;
  libraryId?: string;
}

export interface LocalCollectionArtifact {
  metadata: LocalCollectionArtifactMetadata;
  acceptedRecords: LocalCollectionNormalizedRecord[];
  rejectedRecords: LocalCollectionRejectedRecord[];
  warnings: Array<{ code: LocalCollectionWarningCode; localId: string; rowNumber: number; detail: string }>;
  summary: LocalCollectionImportSummary;
  deterministicContentHash: string;
}

export interface LocalCollectionImportInput {
  csvText: string;
  sourceFilename: string;
  importTimestamp?: string;
  collectionName?: string;
  libraryId?: string;
}

export interface LocalCollectionMarcImportInput {
  marcBinary: Uint8Array | ArrayBuffer;
  sourceFilename: string;
  importTimestamp?: string;
  collectionName?: string;
  libraryId?: string;
}
