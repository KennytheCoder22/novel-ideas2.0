import { deterministicHash } from "./hash";
import { dedupeAcceptedRecords } from "./dedupe";
import { buildSummary } from "./report";
import { normalizeRow } from "./normalize";
import type {
  LocalCollectionArtifact,
  LocalCollectionMarcImportInput,
  LocalCollectionNormalizedRecord,
  LocalCollectionRejectedRecord,
  LocalCollectionWarningCode,
} from "./types";

interface MarcDataField {
  tag: string;
  ind1: string;
  ind2: string;
  subfields: Array<{ code: string; value: string }>;
}

interface ParsedMarcRecord {
  recordNumber: number;
  leader: string;
  controlFields: Record<string, string[]>;
  dataFields: Record<string, MarcDataField[]>;
}

const RECORD_TERMINATOR = 0x1d;
const FIELD_TERMINATOR = 0x1e;
const SUBFIELD_DELIMITER = 0x1f;
const decoder = new TextDecoder("utf-8");

function clean(value: unknown): string {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function parseAsciiNumber(bytes: Uint8Array): number | undefined {
  let value = 0;
  for (let i = 0; i < bytes.length; i += 1) {
    const ch = bytes[i];
    if (ch < 0x30 || ch > 0x39) return undefined;
    value = value * 10 + (ch - 0x30);
  }
  return value;
}

function decodeSlice(bytes: Uint8Array, start: number, end: number): string {
  return decoder.decode(bytes.slice(start, end));
}

function isValidIsbn10(value: string): boolean {
  if (!/^\d{9}[\dX]$/.test(value)) return false;
  let sum = 0;
  for (let i = 0; i < 10; i += 1) {
    const ch = value[i];
    const digit = ch === "X" && i === 9 ? 10 : Number(ch);
    if (!Number.isInteger(digit)) return false;
    sum += (10 - i) * digit;
  }
  return sum % 11 === 0;
}

function isValidIsbn13(value: string): boolean {
  if (!/^\d{13}$/.test(value)) return false;
  let sum = 0;
  for (let i = 0; i < 12; i += 1) {
    sum += Number(value[i]) * (i % 2 === 0 ? 1 : 3);
  }
  const check = (10 - (sum % 10)) % 10;
  return check === Number(value[12]);
}

function normalizeIsbnCandidate(value: string): string {
  return clean(value).toUpperCase().replace(/[^0-9X]/g, "");
}

function firstSubfield(field: MarcDataField | undefined, code: string): string | undefined {
  if (!field) return undefined;
  const found = field.subfields.find((sub) => sub.code === code);
  return clean(found?.value || "") || undefined;
}

function allSubfields(fields: MarcDataField[] | undefined, code: string): string[] {
  if (!fields?.length) return [];
  const out: string[] = [];
  for (const field of fields) {
    for (const sub of field.subfields) {
      if (sub.code === code) {
        const value = clean(sub.value);
        if (value) out.push(value);
      }
    }
  }
  return out;
}

function parseMarcRecords(bytes: Uint8Array): { records: ParsedMarcRecord[]; malformedCount: number } {
  const records: ParsedMarcRecord[] = [];
  let malformedCount = 0;
  let offset = 0;
  let recordNumber = 0;

  while (offset < bytes.length) {
    while (offset < bytes.length && (bytes[offset] === 0x00 || bytes[offset] === 0x0a || bytes[offset] === 0x0d)) {
      offset += 1;
    }
    if (offset >= bytes.length) break;
    if (offset + 24 > bytes.length) {
      malformedCount += 1;
      break;
    }

    const leaderBytes = bytes.slice(offset, offset + 24);
    const recordLength = parseAsciiNumber(leaderBytes.slice(0, 5));
    if (!recordLength || recordLength <= 24 || offset + recordLength > bytes.length) {
      malformedCount += 1;
      const nextRecord = bytes.indexOf(RECORD_TERMINATOR, offset);
      if (nextRecord < 0) break;
      offset = nextRecord + 1;
      continue;
    }

    const recordBytes = bytes.slice(offset, offset + recordLength);
    offset += recordLength;
    if (recordBytes[recordBytes.length - 1] !== RECORD_TERMINATOR) {
      malformedCount += 1;
      continue;
    }

    const baseAddress = parseAsciiNumber(recordBytes.slice(12, 17));
    if (!baseAddress || baseAddress <= 24 || baseAddress > recordBytes.length) {
      malformedCount += 1;
      continue;
    }
    if (recordBytes[baseAddress - 1] !== FIELD_TERMINATOR) {
      malformedCount += 1;
      continue;
    }

    const directory = recordBytes.slice(24, baseAddress - 1);
    if (directory.length % 12 !== 0) {
      malformedCount += 1;
      continue;
    }

    recordNumber += 1;
    const parsed: ParsedMarcRecord = {
      recordNumber,
      leader: decodeSlice(recordBytes, 0, 24),
      controlFields: {},
      dataFields: {},
    };

    let directoryMalformed = false;
    for (let i = 0; i < directory.length; i += 12) {
      const entry = directory.slice(i, i + 12);
      const tag = decodeSlice(entry, 0, 3);
      const fieldLength = parseAsciiNumber(entry.slice(3, 7));
      const fieldStart = parseAsciiNumber(entry.slice(7, 12));
      if (!fieldLength || fieldStart === undefined) {
        directoryMalformed = true;
        break;
      }

      const start = baseAddress + fieldStart;
      const end = start + fieldLength;
      if (start < baseAddress || end > recordBytes.length || fieldLength <= 1) {
        directoryMalformed = true;
        break;
      }

      const fieldBytes = recordBytes.slice(start, end);
      if (fieldBytes[fieldBytes.length - 1] !== FIELD_TERMINATOR) {
        directoryMalformed = true;
        break;
      }

      if (/^\d{3}$/.test(tag) && Number(tag) < 10) {
        const value = clean(decoder.decode(fieldBytes.slice(0, fieldBytes.length - 1)));
        if (!parsed.controlFields[tag]) parsed.controlFields[tag] = [];
        parsed.controlFields[tag].push(value);
        continue;
      }

      if (fieldBytes.length < 3) {
        directoryMalformed = true;
        break;
      }

      const ind1 = String.fromCharCode(fieldBytes[0] || 0x20);
      const ind2 = String.fromCharCode(fieldBytes[1] || 0x20);
      const payload = fieldBytes.slice(2, fieldBytes.length - 1);
      const subfields: Array<{ code: string; value: string }> = [];
      let cursor = 0;

      while (cursor < payload.length) {
        const marker = payload[cursor];
        if (marker !== SUBFIELD_DELIMITER) {
          cursor += 1;
          continue;
        }
        const code = String.fromCharCode(payload[cursor + 1] || 0x3f);
        let valueStart = cursor + 2;
        let valueEnd = valueStart;
        while (valueEnd < payload.length && payload[valueEnd] !== SUBFIELD_DELIMITER) {
          valueEnd += 1;
        }
        const value = clean(decoder.decode(payload.slice(valueStart, valueEnd)));
        subfields.push({ code, value });
        cursor = valueEnd;
      }

      if (!parsed.dataFields[tag]) parsed.dataFields[tag] = [];
      parsed.dataFields[tag].push({ tag, ind1, ind2, subfields });
    }

    if (directoryMalformed) {
      malformedCount += 1;
      continue;
    }

    records.push(parsed);
  }

  return { records, malformedCount };
}

function pickIsbn(record: ParsedMarcRecord): string | undefined {
  const candidates = [
    ...allSubfields(record.dataFields["020"], "a"),
    ...allSubfields(record.dataFields["020"], "z"),
  ];
  for (const candidate of candidates) {
    const normalized = normalizeIsbnCandidate(candidate);
    if (normalized.length === 10 && isValidIsbn10(normalized)) return normalized;
    if (normalized.length === 13 && isValidIsbn13(normalized)) return normalized;
  }
  return undefined;
}

function composeTitle(record: ParsedMarcRecord): string {
  const field245 = record.dataFields["245"]?.[0];
  if (!field245) return "";
  const values = ["a", "b", "n", "p"]
    .map((code) => firstSubfield(field245, code))
    .filter((value): value is string => Boolean(value));
  return clean(values.join(" "));
}

function deriveAuthor(record: ParsedMarcRecord): string {
  return (
    firstSubfield(record.dataFields["100"]?.[0], "a") ||
    firstSubfield(record.dataFields["110"]?.[0], "a") ||
    firstSubfield(record.dataFields["111"]?.[0], "a") ||
    firstSubfield(record.dataFields["700"]?.[0], "a") ||
    ""
  );
}

function deriveAudienceAndReadingLevel(record: ParsedMarcRecord): { audience?: string; readingLevel?: string } {
  const values = allSubfields(record.dataFields["521"], "a");
  let audience: string | undefined;
  let readingLevel: string | undefined;
  for (const value of values) {
    if (!readingLevel && /^\d+(\.\d+)?$/.test(value)) {
      readingLevel = value;
      continue;
    }
    if (!audience) audience = value;
  }
  return { audience, readingLevel };
}

function parseAvailabilityFromPacked(rawPacked: string | undefined): string | undefined {
  const packed = clean(rawPacked || "");
  if (!packed) return undefined;
  const marker = packed.match(/(?:^|@)a([^@]+)/i);
  return clean(marker?.[1] || "") || undefined;
}

function deriveFormatFromLeader(leader: string): string {
  const type = leader[6] || "";
  if (type === "g") return "video";
  if (type === "j") return "cd";
  if (type === "m") return "kit";
  if (type === "a" || type === "t") return "book";
  return "";
}

function normalizeMarcUrlCandidate(value: string): string | undefined {
  const normalized = clean(value).replace(/^http:\/\//i, "https://");
  if (!normalized) return undefined;
  try {
    const parsed = new URL(normalized);
    if (!/^https?:$/i.test(parsed.protocol)) return undefined;
    if (!parsed.hostname || !parsed.pathname || parsed.pathname === "/") return undefined;
    return parsed.toString();
  } catch {
    return undefined;
  }
}

function looksLikeCoverUrl(url: string): boolean {
  return (
    /perma-bound\.com\/ws\/image\/cover\//i.test(url) ||
    /netread\.com\/.+\/image\/.+\.(?:jpe?g|png|gif)(?:$|\?)/i.test(url) ||
    /\/image\/.+\.(?:jpe?g|png|gif)(?:$|\?)/i.test(url)
  );
}

function pickCoverUrl(record: ParsedMarcRecord): string | undefined {
  const urls = allSubfields(record.dataFields["856"], "u");
  for (const value of urls) {
    const normalized = normalizeMarcUrlCandidate(value);
    if (normalized && looksLikeCoverUrl(normalized)) return normalized;
  }
  return undefined;
}

function toUint8Array(input: Uint8Array | ArrayBuffer): Uint8Array {
  if (input instanceof Uint8Array) return input;
  return new Uint8Array(input);
}

export function importLocalCollectionMarc(input: LocalCollectionMarcImportInput): LocalCollectionArtifact {
  const sourceFilename = String(input.sourceFilename || "").trim() || "collection.mrc";
  const importTimestamp = String(input.importTimestamp || "").trim() || new Date().toISOString();
  const bytes = toUint8Array(input.marcBinary);
  const { records, malformedCount } = parseMarcRecords(bytes);

  const headers = [
    "title",
    "author",
    "isbn",
    "publicationYear",
    "publicationDate",
    "audience",
    "readingLevel",
    "shelvingLocation",
    "localPlacement",
    "coverUrl",
    "callNumber",
    "copies",
    "availability",
    "sourceRowId",
    "format",
    "marcLeader",
    "marc001",
    "marc852x",
  ];
  const headerMap = Object.fromEntries(headers.map((header, idx) => [header, idx]));

  const accepted: LocalCollectionNormalizedRecord[] = [];
  const rejected: LocalCollectionRejectedRecord[] = [];
  const warnings: Array<{ code: LocalCollectionWarningCode; detail: string; rowNumber: number; localId?: string }> = [];

  for (let i = 0; i < records.length; i += 1) {
    const record = records[i];
    const rowNumber = i + 2;
    const controlNumber = clean(record.controlFields["001"]?.[0] || "") || `marc-record-${record.recordNumber}`;
    const holdings = record.dataFields["852"] || [];
    const primaryHolding = holdings.find((field) => firstSubfield(field, "b")) || holdings[0];
    const shelvingLocation = firstSubfield(primaryHolding, "b") || "";
    const callNumber = firstSubfield(primaryHolding, "h") || "";
    const packedValues = holdings.map((field) => firstSubfield(field, "x")).filter((v): v is string => Boolean(v));
    const availability = parseAvailabilityFromPacked(packedValues[0]) || packedValues[0] || "";
    const localPlacement = firstSubfield(record.dataFields["900"]?.[0], "a") || "";
    const coverUrl = pickCoverUrl(record) || "";
    const publicationDate = firstSubfield(record.dataFields["264"]?.[0], "c") || firstSubfield(record.dataFields["260"]?.[0], "c") || "";
    const { audience, readingLevel } = deriveAudienceAndReadingLevel(record);

    const row = [
      composeTitle(record),
      deriveAuthor(record),
      pickIsbn(record) || "",
      publicationDate,
      publicationDate,
      audience || "",
      readingLevel || "",
      shelvingLocation,
      localPlacement,
      coverUrl,
      callNumber,
      String(Math.max(1, holdings.length)),
      availability,
      controlNumber,
      deriveFormatFromLeader(record.leader),
      record.leader,
      controlNumber,
      packedValues.join(" || "),
    ];

    const normalized = normalizeRow(rowNumber, row, headers, headerMap);
    if (normalized.accepted) {
      normalized.accepted.sourceFormat = "marc21";
      normalized.accepted.marcRecordControlNumber = controlNumber;
      normalized.accepted.coverUrl = coverUrl || normalized.accepted.coverUrl;
      normalized.accepted.localPlacement = localPlacement || normalized.accepted.localPlacement;
      normalized.accepted.marcHoldings = holdings.map((field) => ({
        locationCode: firstSubfield(field, "a"),
        collection: firstSubfield(field, "b"),
        callNumber: firstSubfield(field, "h"),
        copyId: firstSubfield(field, "p"),
        rawPacked: firstSubfield(field, "x"),
      }));
      accepted.push(normalized.accepted);
    }
    if (normalized.rejected) rejected.push(normalized.rejected);
    if (normalized.warnings.length) warnings.push(...normalized.warnings);
  }

  if (records.length === 0) {
    rejected.push({
      reason: "unsupported_record_shape",
      detail: "no MARC records could be parsed from the file",
    });
  }
  if (malformedCount > 0) {
    rejected.push({
      reason: "malformed_row",
      detail: `encountered ${malformedCount} malformed MARC record(s) during parse`,
    });
  }

  const deduped = dedupeAcceptedRecords(accepted);
  rejected.push(...deduped.duplicateRejects);

  const summary = buildSummary(
    records.length,
    deduped.acceptedRecords,
    rejected,
    deduped.mergedDuplicatesOrCopies,
    warnings.length
  );

  const artifactBase: Omit<LocalCollectionArtifact, "deterministicContentHash"> = {
    metadata: {
      schemaVersion: "local_collection_import_v1",
      sourceFormat: "marc21",
      importTimestamp,
      sourceFilename,
      collectionName: input.collectionName,
      libraryId: input.libraryId,
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
      sourceFormat: artifactBase.metadata.sourceFormat || "marc21",
    }),
  };
}
