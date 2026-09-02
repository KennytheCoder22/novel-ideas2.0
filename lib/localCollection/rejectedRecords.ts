import { deterministicHash } from "./hash";
import type {
  LocalCollectionArtifact,
  LocalCollectionRejectReason,
  LocalCollectionRejectedRecord,
} from "./types";

export type RejectedRecordFixability =
  | "fixable_in_catalog"
  | "review_source_record"
  | "reexport_required";

export type LocalCollectionRejectedRecordDiagnostic = {
  diagnosticId: string;
  title?: string;
  author?: string;
  isbn?: string;
  controlNumber?: string;
  callNumber?: string;
  sourceIdentifier: string;
  sourceRowNumber?: number;
  reasonCode: Exclude<LocalCollectionRejectReason, "duplicate_merged">;
  reasonLabel: string;
  fixability: RejectedRecordFixability;
  fixabilityLabel: string;
  detail: string;
  rawDetails?: Record<string, string>;
};

export type LocalCollectionRejectedRecordsReport = {
  schemaVersion: "local_collection_rejected_records_v1";
  libraryId: string;
  artifactId: string;
  createdAt: string;
  rejectedCount: number;
  duplicatesMerged: number;
  records: LocalCollectionRejectedRecordDiagnostic[];
  reportChecksum: string;
};

export type LocalCollectionRejectedRecordsPage = LocalCollectionRejectedRecordsReport & {
  offset: number;
  pageChecksum: string;
};

export function rejectedRecordsReportChecksum(
  report: Omit<LocalCollectionRejectedRecordsReport, "reportChecksum">,
): string {
  return `fnv1a32:${deterministicHash(report)}`;
}

export function rejectedRecordsPageChecksum(
  page: Omit<LocalCollectionRejectedRecordsPage, "pageChecksum">,
): string {
  return `fnv1a32:${deterministicHash(page)}`;
}

export function rejectedRecordsReportPages(
  report: LocalCollectionRejectedRecordsReport,
  pageSize: number = 100,
): LocalCollectionRejectedRecordsPage[] {
  const size = Math.min(100, Math.max(1, Math.floor(pageSize)));
  const maxPageBytes = 3 * 1024 * 1024;
  const encodedSize = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).byteLength;
  const buildPage = (offset: number, records: LocalCollectionRejectedRecordDiagnostic[]) => {
    const pageBase = {
      ...report,
      records,
      offset,
    };
    return {
      ...pageBase,
      pageChecksum: rejectedRecordsPageChecksum(pageBase),
    };
  };
  if (!report.records.length) return [buildPage(0, [])];
  const pages: LocalCollectionRejectedRecordsPage[] = [];
  let offset = 0;
  while (offset < report.records.length) {
    let end = Math.min(report.records.length, offset + size);
    let page = buildPage(offset, report.records.slice(offset, end));
    while (end > offset + 1 && encodedSize(page) > maxPageBytes) {
      end -= 1;
      page = buildPage(offset, report.records.slice(offset, end));
    }
    if (encodedSize(page) > maxPageBytes) {
      throw new Error("rejected_records_page_too_large");
    }
    pages.push(page);
    offset = end;
  }
  return pages;
}

const FIELD_ALIASES = {
  title: ["title", "book title", "name"],
  author: ["author", "authors", "creator", "creators", "primary author"],
  isbn: ["isbn", "isbn10", "isbn-10", "isbn 10", "isbn13", "isbn-13", "isbn 13", "ean", "identifier", "isbn/ean"],
  controlNumber: ["marc001", "control number", "controlnumber", "bibliographic record number", "bibliographic id", "bib id", "bib number"],
  callNumber: ["call number", "callnumber", "call no", "call #", "callnumber"],
  sourceIdentifier: ["source row id", "source id", "record id", "barcode", "copy id", "marc001"],
} as const;

const REASON_DETAILS: Record<Exclude<LocalCollectionRejectReason, "duplicate_merged">, {
  label: string;
  fixability: RejectedRecordFixability;
  fixabilityLabel: string;
}> = {
  missing_title: {
    label: "Missing title",
    fixability: "fixable_in_catalog",
    fixabilityLabel: "Fixable in the source catalog",
  },
  missing_or_untrustworthy_author: {
    label: "Missing usable author",
    fixability: "fixable_in_catalog",
    fixabilityLabel: "Usually fixable in the source catalog",
  },
  invalid_isbn: {
    label: "Invalid ISBN",
    fixability: "fixable_in_catalog",
    fixabilityLabel: "Fixable in the source catalog",
  },
  non_book_non_narrative_artifact: {
    label: "Unsupported record type",
    fixability: "review_source_record",
    fixabilityLabel: "Review whether this record belongs in the export",
  },
  malformed_row: {
    label: "Malformed bibliographic record",
    fixability: "review_source_record",
    fixabilityLabel: "Review the source record or export",
  },
  unsupported_source_encoding: {
    label: "Invalid or unsupported encoding",
    fixability: "reexport_required",
    fixabilityLabel: "Re-export this collection as UTF-8 MARC",
  },
  unsupported_record_shape: {
    label: "Unsupported record shape",
    fixability: "review_source_record",
    fixabilityLabel: "Review the export format",
  },
  insufficient_identity: {
    label: "Missing usable identity",
    fixability: "fixable_in_catalog",
    fixabilityLabel: "Add enough title, author, or identifier data",
  },
};

function normalizedRaw(raw: Record<string, string> | undefined): Map<string, string> {
  return new Map(
    Object.entries(raw || {}).map(([key, value]) => [
      key.toLowerCase().trim(),
      String(value || "").replace(/\s+/g, " ").trim(),
    ]),
  );
}

function boundedText(value: unknown, maxLength: number = 500): string | undefined {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text ? text.slice(0, maxLength) : undefined;
}

function readRaw(raw: Map<string, string>, aliases: readonly string[]): string | undefined {
  for (const alias of aliases) {
    const value = raw.get(alias);
    if (value) return boundedText(value);
  }
  return undefined;
}

function boundedRawDetails(raw: Record<string, string> | undefined): Record<string, string> | undefined {
  if (!raw) return undefined;
  const entries = Object.entries(raw)
    .slice(0, 40)
    .map(([key, value]) => [key.slice(0, 120), String(value || "").slice(0, 500)]);
  return entries.length ? Object.fromEntries(entries) : undefined;
}

function toDiagnostic(record: LocalCollectionRejectedRecord, index: number): LocalCollectionRejectedRecordDiagnostic | null {
  if (record.reason === "duplicate_merged") return null;
  const raw = normalizedRaw(record.raw);
  const reason = REASON_DETAILS[record.reason];
  const controlNumber = readRaw(raw, FIELD_ALIASES.controlNumber);
  const sourceIdentifier =
    boundedText(record.sourceRowId) ||
    readRaw(raw, FIELD_ALIASES.sourceIdentifier) ||
    controlNumber ||
    (record.rowNumber ? `row-${record.rowNumber}` : `rejected-${index + 1}`);
  const diagnostic = {
    diagnosticId: `rejected_${deterministicHash({
      sourceIdentifier,
      rowNumber: record.rowNumber || 0,
      reason: record.reason,
      index,
    })}`,
    title: readRaw(raw, FIELD_ALIASES.title),
    author: readRaw(raw, FIELD_ALIASES.author),
    isbn: readRaw(raw, FIELD_ALIASES.isbn),
    controlNumber,
    callNumber: readRaw(raw, FIELD_ALIASES.callNumber),
    sourceIdentifier,
    sourceRowNumber: record.rowNumber,
    reasonCode: record.reason,
    reasonLabel: reason.label,
    fixability: reason.fixability,
    fixabilityLabel: reason.fixabilityLabel,
    detail: boundedText(record.detail, 1_000) || reason.label,
    rawDetails: boundedRawDetails(record.raw),
  } satisfies LocalCollectionRejectedRecordDiagnostic;
  return diagnostic;
}

export function buildRejectedRecordsReport(
  artifact: LocalCollectionArtifact,
  libraryId: string,
  artifactId: string,
): LocalCollectionRejectedRecordsReport {
  const records = artifact.rejectedRecords
    .map(toDiagnostic)
    .filter((record): record is LocalCollectionRejectedRecordDiagnostic => Boolean(record));
  const reportBase = {
    schemaVersion: "local_collection_rejected_records_v1" as const,
    libraryId,
    artifactId,
    createdAt: artifact.metadata.importTimestamp,
    rejectedCount: records.length,
    duplicatesMerged: Math.max(0, Number(artifact.summary.mergedDuplicatesOrCopies || 0)),
    records,
  };
  return {
    ...reportBase,
    reportChecksum: rejectedRecordsReportChecksum(reportBase),
  };
}

function csvCell(value: unknown): string {
  const original = String(value || "");
  const text = /^[=+\-@]/.test(original.trimStart()) ? `'${original}` : original;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function rejectedRecordsReportToCsv(report: LocalCollectionRejectedRecordsReport): string {
  const headers = [
    "Title",
    "Author",
    "ISBN",
    "Control Number",
    "Call Number",
    "Source Identifier",
    "Source Row",
    "Rejection Reason",
    "Reason Code",
    "Fixability / Status",
    "Detail",
    "Artifact ID",
    "Library ID",
  ];
  const rows = report.records.map((record) => [
    record.title,
    record.author,
    record.isbn,
    record.controlNumber,
    record.callNumber,
    record.sourceIdentifier,
    record.sourceRowNumber,
    record.reasonLabel,
    record.reasonCode,
    record.fixabilityLabel,
    record.detail,
    report.artifactId,
    report.libraryId,
  ]);
  return [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
}
