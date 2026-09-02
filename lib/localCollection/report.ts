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
  let titlesWithAuthors = 0;
  let titlesWithIsbns = 0;
  let titlesWithDescriptions = 0;
  let titlesWithResolvableCovers = 0;
  let titlesWithCallNumbers = 0;
  let titlesWithAudienceOrShelfMetadata = 0;

  for (const record of acceptedRecords) {
    if (record.author) titlesWithAuthors += 1;
    if (record.isbn10 || record.isbn13) titlesWithIsbns += 1;
    if (record.description) titlesWithDescriptions += 1;
    if (record.coverUrl || record.isbn10 || record.isbn13) titlesWithResolvableCovers += 1;
    if (record.callNumber) titlesWithCallNumbers += 1;
    if (record.audience || record.readingLevel || record.shelvingLocation || record.localPlacement) {
      titlesWithAudienceOrShelfMetadata += 1;
    }
    if (!record.coverUrl) titlesMissingCovers += 1;
    if (!record.isbn10 && !record.isbn13) titlesMissingIsbns += 1;
    if (!record.audience && !record.readingLevel && !record.shelvingLocation && !record.localPlacement) {
      titlesMissingAudienceOrShelfMetadata += 1;
    }
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
    titlesWithAuthors,
    titlesWithIsbns,
    titlesWithDescriptions,
    titlesWithResolvableCovers,
    titlesWithCallNumbers,
    titlesWithAudienceOrShelfMetadata,
    duplicateRate: totalRows > 0 ? mergedDuplicatesOrCopies / totalRows : 0,
  };
}
