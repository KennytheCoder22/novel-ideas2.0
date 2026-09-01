export type LocalCollectionRejectReason =
  | "missing_title"
  | "missing_or_untrustworthy_author"
  | "invalid_isbn"
  | "non_book_non_narrative_artifact"
  | "duplicate_merged"
  | "malformed_row"
  | "unsupported_source_encoding"
  | "unsupported_record_shape"
  | "insufficient_identity";

export type LocalCollectionWarningCode =
  | "invalid_publication_year"
  | "missing_cover_url"
  | "missing_isbn"
  | "missing_audience_or_shelf_metadata";

export type LocalCollectionSourceFormat = "csv" | "marc21";
export type LocalCollectionSourceEncoding = "utf-8" | "marc-8" | "unknown";
export type LocalCollectionHealthStatus = "ready" | "ready_with_warnings" | "failed";
export type LocalCollectionPublishStatus = "not_published" | "publishing" | "verified" | "failed" | "local_only";

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
  titlesWithAuthors?: number;
  titlesWithIsbns?: number;
  titlesWithDescriptions?: number;
  titlesWithResolvableCovers?: number;
  titlesWithCallNumbers?: number;
  titlesWithAudienceOrShelfMetadata?: number;
  duplicateRate?: number;
}

export interface LocalCollectionArtifactMetadata {
  schemaVersion: "local_collection_import_v1" | "local_collection_import_v2";
  importerVersion?: "local_collection_import_v2";
  importTimestamp: string;
  sourceFilename: string;
  sourceFormat?: LocalCollectionSourceFormat;
  sourceEncoding?: LocalCollectionSourceEncoding;
  originalUploadBytes?: number;
  collectionName?: string;
  libraryId?: string;
  provenance?: {
    unmappedCsvHeaders?: string[];
    marcTags?: string[];
    unrecognizedMarcTags?: string[];
    sampleUnrecognizedMarcFields?: Array<{
      recordNumber: number;
      tag: string;
      values: string[];
    }>;
  };
}

export interface LocalCollectionHealthMetrics {
  totalRecords: number;
  importedRecords: number;
  rejectedRecords: number;
  usableTitles: number;
  authorsPresent: number;
  usableIsbns: number;
  descriptionsPresent: number;
  coversResolvable: number;
  callNumbersPresent: number;
  duplicateRecords: number;
  duplicateRate: number;
  audienceMetadataPresent: number;
}

export interface LocalCollectionSmokeIssue {
  localId: string;
  field: "title" | "author" | "description" | "callNumber" | "cover";
  stage: "normalization" | "artifact_adapter" | "published_readback" | "detail_adapter";
  message: string;
}

export interface LocalCollectionSmokeTest {
  sampleSize: number;
  passed: boolean;
  issues: LocalCollectionSmokeIssue[];
}

export interface LocalCollectionHealth {
  status: LocalCollectionHealthStatus;
  publishStatus: LocalCollectionPublishStatus;
  metrics: LocalCollectionHealthMetrics;
  warnings: string[];
  failures: string[];
  originalUploadBytes: number;
  artifactBytes: number;
  compressedArtifactBytes: number;
  smokeTest?: LocalCollectionSmokeTest;
}

export interface LocalCollectionVersionMetadata {
  schemaVersion: "local_collection_artifact_v2";
  artifactId: string;
  libraryId: string;
  uploadedAt: string;
  importerVersion: "local_collection_import_v2";
  sourceFormat: LocalCollectionSourceFormat;
  sourceFilename: string;
  recordCount: number;
  importedCount: number;
  contentChecksum: string;
  originalUploadBytes: number;
  artifactBytes: number;
  compressedArtifactBytes: number;
  publishStatus: LocalCollectionPublishStatus;
  healthStatus: LocalCollectionHealthStatus;
  previousArtifact?: {
    artifactId: string;
    uploadedAt: string;
    importedCount: number;
    contentChecksum: string;
  };
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
