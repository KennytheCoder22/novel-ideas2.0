import { deterministicHash } from "./hash";
import { parseCsv } from "./importCsv";
import { importLocalCollectionMarc } from "./importMarc";
import { dedupeAcceptedRecords } from "./dedupe";
import { buildSummary } from "./report";
import { mapHeaderIndices, normalizeRow } from "./normalize";
import type {
  LocalCollectionArtifact,
  LocalCollectionImportInput,
  LocalCollectionMarcImportInput,
  LocalCollectionNormalizedRecord,
  LocalCollectionRejectedRecord,
  LocalCollectionWarningCode,
} from "./types";

function utf8Bytes(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

export function importLocalCollectionCsv(input: LocalCollectionImportInput): LocalCollectionArtifact {
  const sourceFilename = String(input.sourceFilename || "").trim() || "collection.csv";
  const importTimestamp = String(input.importTimestamp || "").trim() || new Date().toISOString();
  const parsed = parseCsv(input.csvText);

  const headerMap = mapHeaderIndices(parsed.headers);
  const accepted: LocalCollectionNormalizedRecord[] = [];
  const rejected: LocalCollectionRejectedRecord[] = [];
  const warnings: Array<{ code: LocalCollectionWarningCode; detail: string; rowNumber: number; localId?: string }> = [];

  if (parsed.headers.length === 0) {
    rejected.push({
      reason: "unsupported_record_shape",
      detail: "missing header row",
    });
  }

  if (parsed.malformed) {
    rejected.push({
      reason: "malformed_row",
      detail: "CSV contains malformed quoted fields",
    });
  }

  for (let i = 0; i < parsed.rows.length; i += 1) {
    const rowNumber = i + 2;
    const row = parsed.rows[i];
    const normalized = normalizeRow(rowNumber, row, parsed.headers, headerMap);
    if (normalized.accepted) accepted.push(normalized.accepted);
    if (normalized.rejected) rejected.push(normalized.rejected);
    if (normalized.warnings.length) warnings.push(...normalized.warnings);
  }

  const deduped = dedupeAcceptedRecords(accepted);
  rejected.push(...deduped.duplicateRejects);

  const summary = buildSummary(
    parsed.rows.length,
    deduped.acceptedRecords,
    rejected,
    deduped.mergedDuplicatesOrCopies,
    warnings.length
  );

  const artifactBase: Omit<LocalCollectionArtifact, "deterministicContentHash"> = {
    metadata: {
      schemaVersion: "local_collection_import_v2",
      importerVersion: "local_collection_import_v2",
      sourceFormat: "csv",
      sourceEncoding: "utf-8",
      originalUploadBytes: utf8Bytes(input.csvText),
      importTimestamp,
      sourceFilename,
      collectionName: input.collectionName,
      libraryId: input.libraryId,
      provenance: {
        unmappedCsvHeaders: parsed.headers.filter((_header, index) => !Object.values(headerMap).includes(index)).slice(0, 100),
      },
    },
    acceptedRecords: deduped.acceptedRecords,
    rejectedRecords: rejected,
    warnings: warnings.map((warning) => ({
      code: warning.code,
      localId: warning.localId || "unknown",
      rowNumber: warning.rowNumber,
      detail: warning.detail,
    })),
    summary,
  };

  return {
    ...artifactBase,
    deterministicContentHash: deterministicHash({
      acceptedRecords: artifactBase.acceptedRecords,
      rejectedRecords: artifactBase.rejectedRecords,
      warnings: artifactBase.warnings,
      summary: artifactBase.summary,
      sourceFilename: artifactBase.metadata.sourceFilename,
      collectionName: artifactBase.metadata.collectionName || "",
      libraryId: artifactBase.metadata.libraryId || "",
      schemaVersion: artifactBase.metadata.schemaVersion,
    }),
  };
}

export type {
  LocalCollectionArtifact,
  LocalCollectionImportInput,
  LocalCollectionMarcImportInput,
  LocalCollectionImportSummary,
  LocalCollectionHealth,
  LocalCollectionHealthStatus,
  LocalCollectionPublishStatus,
  LocalCollectionVersionMetadata,
  LocalCollectionNormalizedRecord,
  LocalCollectionRejectedRecord,
  LocalCollectionRejectReason,
  LocalCollectionSourceFormat,
  LocalCollectionWarningCode,
} from "./types";

export { importLocalCollectionMarc };
