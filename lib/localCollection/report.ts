import type { LocalCollectionImportSummary, LocalCollectionNormalizedRecord, LocalCollectionRejectedRecord } from "./types";

export function buildSummary(
  totalRows: number,
  acceptedRecords: LocalCollectionNormalizedRecord[],
  rejectedRecords: LocalCollectionRejectedRecord[],
  mergedDuplicatesOrCopies: number,
  warningCount: number
): LocalCollectionImportSummary {
  let titlesMissingCovers = 0;
  let titlesMissingIsbns = 0;
  let titlesMissingAudienceOrShelfMetadata = 0;

  for (const record of acceptedRecords) {
    if (!record.coverUrl) titlesMissingCovers += 1;
    if (!record.isbn10 && !record.isbn13) titlesMissingIsbns += 1;
    if (!record.audience && !record.readingLevel && !record.shelvingLocation) titlesMissingAudienceOrShelfMetadata += 1;
  }

  return {
    totalRows,
    acceptedTitles: acceptedRecords.length,
    mergedDuplicatesOrCopies,
    rejectedRows: rejectedRecords.length,
    warnings: warningCount,
    titlesMissingCovers,
    titlesMissingIsbns,
    titlesMissingAudienceOrShelfMetadata: titlesMissingAudienceOrShelfMetadata,
  };
}
