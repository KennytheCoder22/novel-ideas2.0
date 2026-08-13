import { deterministicHash } from "./hash";
import type {
  LocalCollectionRawRow,
  LocalCollectionRejectedRecord,
  LocalCollectionWarningCode,
  LocalCollectionNormalizedRecord,
} from "./types";

const HEADER_ALIASES: Record<string, string[]> = {
  title: ["title", "book title", "name"],
  author: ["author", "authors", "creator", "creators", "primary author"],
  isbn10: ["isbn10", "isbn-10", "isbn 10"],
  isbn13: ["isbn13", "isbn-13", "isbn 13", "ean"],
  isbn: ["isbn", "identifier", "isbn/ean"],
  publicationYear: ["publication year", "publish year", "year", "pub year"],
  publicationDate: ["publication date", "publish date", "date"],
  audience: ["audience", "age band", "age", "target audience"],
  readingLevel: ["reading level", "grade level", "lexile"],
  subjects: ["subject", "subjects", "topic", "topics", "subject headings"],
  genres: ["genre", "genres", "category", "categories"],
  shelvingLocation: ["shelving location", "shelf", "location", "collection"],
  localPlacement: ["local placement", "placement", "local location", "room", "classroom"],
  callNumber: ["call number", "callno", "call #"],
  copies: ["copies", "copy count", "holdings", "quantity", "available copies"],
  availability: ["availability", "status"],
  coverUrl: ["cover", "cover url", "cover image", "thumbnail", "image"],
  sourceRowId: ["source row id", "row id", "record id", "id"],
  format: ["format", "material type", "media type"],
};

function normalizeHeader(value: string): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, " ");
}

export function mapHeaderIndices(headers: string[]): Record<string, number> {
  const normalized = headers.map(normalizeHeader);
  const out: Record<string, number> = {};
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    const idx = normalized.findIndex((h) => aliases.includes(h));
    if (idx >= 0) out[field] = idx;
  }
  return out;
}

function clean(value: unknown): string {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function canonical(value: string): string {
  return clean(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseCopies(value: string): number {
  const n = Number(clean(value));
  if (!Number.isFinite(n) || n <= 0) return 1;
  return Math.max(1, Math.floor(n));
}

function parseTerms(value: string): string[] {
  return Array.from(new Set(
    clean(value).split(/[|;,]/).map((term) => clean(term)).filter(Boolean)
  ));
}

function normalizeIsbn(rawValue: string): { isbn10?: string; isbn13?: string; invalid: boolean } {
  const raw = clean(rawValue).toUpperCase().replace(/[^0-9X]/g, "");
  if (!raw) return { invalid: false };
  if (raw.length === 10) {
    let sum = 0;
    for (let i = 0; i < 10; i += 1) {
      const ch = raw[i];
      const digit = ch === "X" && i === 9 ? 10 : Number(ch);
      if (!Number.isInteger(digit)) return { invalid: true };
      sum += (10 - i) * digit;
    }
    if (sum % 11 !== 0) return { invalid: true };
    return { isbn10: raw, isbn13: isbn10To13(raw), invalid: false };
  }
  if (raw.length === 13) {
    if (!/^\d{13}$/.test(raw)) return { invalid: true };
    let sum = 0;
    for (let i = 0; i < 12; i += 1) {
      sum += Number(raw[i]) * (i % 2 === 0 ? 1 : 3);
    }
    const check = (10 - (sum % 10)) % 10;
    if (check !== Number(raw[12])) return { invalid: true };
    return { isbn13: raw, isbn10: isbn13To10(raw), invalid: false };
  }
  return { invalid: true };
}

function isbn10To13(isbn10: string): string {
  const base = `978${isbn10.slice(0, 9)}`;
  let sum = 0;
  for (let i = 0; i < 12; i += 1) sum += Number(base[i]) * (i % 2 === 0 ? 1 : 3);
  const check = (10 - (sum % 10)) % 10;
  return `${base}${check}`;
}

function isbn13To10(isbn13: string): string | undefined {
  if (!isbn13.startsWith("978")) return undefined;
  const base = isbn13.slice(3, 12);
  let sum = 0;
  for (let i = 0; i < 9; i += 1) sum += Number(base[i]) * (10 - i);
  const check = (11 - (sum % 11)) % 11;
  const checkChar = check === 10 ? "X" : String(check);
  return `${base}${checkChar}`;
}

function parsePublicationYear(value: string): number | undefined {
  const raw = clean(value);
  if (!raw) return undefined;
  const year = Number((raw.match(/\b(1\d{3}|20\d{2})\b/) || [])[0] || "");
  if (!Number.isInteger(year)) return undefined;
  return year;
}

export interface NormalizeRowResult {
  accepted?: LocalCollectionNormalizedRecord;
  rejected?: LocalCollectionRejectedRecord;
  warnings: Array<{ code: LocalCollectionWarningCode; detail: string; rowNumber: number; localId?: string }>;
}

export function normalizeRow(
  rowNumber: number,
  row: string[],
  headers: string[],
  headerMap: Record<string, number>
): NormalizeRowResult {
  const read = (field: string): string => {
    const idx = headerMap[field];
    return idx === undefined ? "" : clean(row[idx] || "");
  };
  const raw: Record<string, string> = {};
  headers.forEach((header, idx) => {
    raw[header] = String(row[idx] || "");
  });
  const rawRow: LocalCollectionRawRow = {
    rowNumber,
    sourceRowId: read("sourceRowId") || undefined,
    raw,
  };

  const title = clean(read("title"));
  if (!title) {
    return { rejected: { rowNumber, sourceRowId: rawRow.sourceRowId, reason: "missing_title", detail: "title is required", raw }, warnings: [] };
  }
  const author = clean(read("author"));
  if (!author) {
    return {
      rejected: {
        rowNumber,
        sourceRowId: rawRow.sourceRowId,
        reason: "missing_or_untrustworthy_author",
        detail: "author is required for Local Collection admission",
        raw,
      },
      warnings: [],
    };
  }

  const combinedIsbn = clean(read("isbn13") || read("isbn10") || read("isbn"));
  const isbn = normalizeIsbn(combinedIsbn);
  if (isbn.invalid) {
    return { rejected: { rowNumber, sourceRowId: rawRow.sourceRowId, reason: "invalid_isbn", detail: "ISBN must be valid ISBN-10 or ISBN-13", raw }, warnings: [] };
  }

  const format = canonical(read("format"));
  if (/\b(dvd|blu ray|video|cd|magazine|periodical|kit|newspaper)\b/.test(format)) {
    return { rejected: { rowNumber, sourceRowId: rawRow.sourceRowId, reason: "non_book_non_narrative_artifact", detail: "record appears to be a non-book artifact", raw }, warnings: [] };
  }

  const titleNormalized = canonical(title).replace(/\b(a|an|the)\b/g, " ").replace(/\s+/g, " ").trim();
  const authorNormalized = canonical(author);
  const publicationDate = clean(read("publicationDate")) || undefined;
  const publicationYear = parsePublicationYear(read("publicationYear") || publicationDate || "");
  const warnings: Array<{ code: LocalCollectionWarningCode; detail: string; rowNumber: number; localId?: string }> = [];

  if ((read("publicationYear") || publicationDate) && !publicationYear) {
    warnings.push({ code: "invalid_publication_year", detail: "publication year could not be parsed", rowNumber });
  }

  const audience = clean(read("audience")) || undefined;
  const readingLevel = clean(read("readingLevel")) || undefined;
  const subjects = parseTerms(read("subjects"));
  const genres = parseTerms(read("genres"));
  const shelvingLocation = clean(read("shelvingLocation")) || undefined;
  const localPlacement = clean(read("localPlacement")) || undefined;
  const callNumber = clean(read("callNumber")) || undefined;
  const availability = clean(read("availability")) || undefined;
  const coverUrl = clean(read("coverUrl")) || undefined;

  const workKey = `${titleNormalized}|${authorNormalized}`;
  const editionIdentity = isbn.isbn13 || isbn.isbn10 || `${workKey}|${publicationYear || "unknown"}`;
  const editionKey = canonical(editionIdentity);
  const localId = `lc_${deterministicHash({ workKey, editionKey })}`;

  const warningCodes: LocalCollectionWarningCode[] = [];
  if (!coverUrl) {
    warningCodes.push("missing_cover_url");
    warnings.push({ code: "missing_cover_url", detail: "cover URL missing", rowNumber, localId });
  }
  if (!isbn.isbn13 && !isbn.isbn10) {
    warningCodes.push("missing_isbn");
    warnings.push({ code: "missing_isbn", detail: "ISBN missing", rowNumber, localId });
  }
  if (!audience && !readingLevel && !shelvingLocation && !localPlacement) {
    warningCodes.push("missing_audience_or_shelf_metadata");
    warnings.push({
      code: "missing_audience_or_shelf_metadata",
      detail: "audience/reading-level/shelf metadata missing",
      rowNumber,
      localId,
    });
  }

  return {
    accepted: {
      localId,
      workKey,
      editionKey,
      title,
      titleNormalized,
      author,
      authorNormalized,
      isbn10: isbn.isbn10,
      isbn13: isbn.isbn13,
      publicationYear,
      publicationDate,
      audience,
      readingLevel,
      subjects: subjects.length ? subjects : undefined,
      genres: genres.length ? genres : undefined,
      shelvingLocation,
      localPlacement,
      callNumber,
      copies: parseCopies(read("copies")),
      availability,
      coverUrl,
      sourceRowId: rawRow.sourceRowId,
      sourceRowNumbers: [rowNumber],
      sourceRows: [rawRow],
      warnings: warningCodes,
    },
    warnings,
  };
}
