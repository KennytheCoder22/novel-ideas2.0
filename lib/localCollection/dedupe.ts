import type { LocalCollectionNormalizedRecord, LocalCollectionRejectedRecord, LocalCollectionWarningCode } from "./types";

function mergeText(primary?: string, secondary?: string): string | undefined {
  return primary || secondary || undefined;
}

function mergeWarnings(a: LocalCollectionWarningCode[], b: LocalCollectionWarningCode[]): LocalCollectionWarningCode[] {
  return Array.from(new Set([...(a || []), ...(b || [])])) as LocalCollectionWarningCode[];
}

export function dedupeAcceptedRecords(records: LocalCollectionNormalizedRecord[]): {
  acceptedRecords: LocalCollectionNormalizedRecord[];
  mergedDuplicatesOrCopies: number;
  duplicateRejects: LocalCollectionRejectedRecord[];
} {
  const byEdition = new Map<string, LocalCollectionNormalizedRecord>();
  const byWorkWithoutIsbn = new Map<string, LocalCollectionNormalizedRecord>();
  const duplicateRejects: LocalCollectionRejectedRecord[] = [];
  let merged = 0;

  for (const record of records) {
    const withIsbn = Boolean(record.isbn10 || record.isbn13);
    const editionKey = record.editionKey;
    const workKey = record.workKey;
    const candidateKey = withIsbn ? `edition:${editionKey}` : `work:${workKey}`;

    const existing = withIsbn
      ? byEdition.get(candidateKey)
      : byWorkWithoutIsbn.get(candidateKey);

    if (!existing) {
      if (withIsbn) byEdition.set(candidateKey, record);
      else byWorkWithoutIsbn.set(candidateKey, record);
      continue;
    }

    merged += 1;
    existing.copies += record.copies;
    existing.sourceRowNumbers = Array.from(new Set([...existing.sourceRowNumbers, ...record.sourceRowNumbers])).sort((a, b) => a - b);
    existing.sourceRows = [...existing.sourceRows, ...record.sourceRows];
    existing.warnings = mergeWarnings(existing.warnings, record.warnings);
    existing.coverUrl = mergeText(existing.coverUrl, record.coverUrl);
    existing.description = mergeText(existing.description, record.description);
    existing.audience = mergeText(existing.audience, record.audience);
    existing.readingLevel = mergeText(existing.readingLevel, record.readingLevel);
    existing.shelvingLocation = mergeText(existing.shelvingLocation, record.shelvingLocation);
    const subjects = Array.from(new Set([...(existing.subjects || []), ...(record.subjects || [])]));
    const genres = Array.from(new Set([...(existing.genres || []), ...(record.genres || [])]));
    if (subjects.length) existing.subjects = subjects;
    if (genres.length) existing.genres = genres;
    existing.localPlacement = mergeText(existing.localPlacement, record.localPlacement);
    existing.callNumber = mergeText(existing.callNumber, record.callNumber);
    existing.availability = mergeText(existing.availability, record.availability);
    existing.publicationDate = mergeText(existing.publicationDate, record.publicationDate);
    existing.publicationYear = existing.publicationYear || record.publicationYear;
    if (record.marcRecordControlNumber && !existing.marcRecordControlNumber) {
      existing.marcRecordControlNumber = record.marcRecordControlNumber;
    }
    if (record.sourceFormat && !existing.sourceFormat) {
      existing.sourceFormat = record.sourceFormat;
    }
    if (record.marcHoldings?.length) {
      existing.marcHoldings = [...(existing.marcHoldings || []), ...record.marcHoldings];
    }

    duplicateRejects.push({
      rowNumber: record.sourceRowNumbers[0],
      sourceRowId: record.sourceRowId,
      reason: "duplicate_merged",
      detail: `merged into localId ${existing.localId}`,
      raw: record.sourceRows[0]?.raw,
    });
  }

  const acceptedRecords = [...byEdition.values(), ...byWorkWithoutIsbn.values()]
    .sort((a, b) => a.localId.localeCompare(b.localId));

  return { acceptedRecords, mergedDuplicatesOrCopies: merged, duplicateRejects };
}
