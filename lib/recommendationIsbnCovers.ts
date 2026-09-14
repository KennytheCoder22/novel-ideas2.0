// Shared ISBN artwork fallback used by the main app and recommendation games.
export function normalizeIsbn(value: unknown): string | null {
  const normalized = String(value || "").replace(/[^0-9Xx]/g, "").toUpperCase();
  if (!normalized) return null;
  if (/^\d{13}$/.test(normalized)) return normalized;
  if (/^\d{9}[\dX]$/.test(normalized)) return normalized;
  return null;
}

function uniqueIsbnCandidates(values: unknown[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const normalized = normalizeIsbn(value);
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(normalized);
  }
  return out;
}

export function coverUrlFromIsbn(isbn: unknown): string | null {
  const normalized = normalizeIsbn(isbn);
  if (!normalized) return null;
  return `https://covers.openlibrary.org/b/isbn/${normalized}-L.jpg?default=false`;
}

export function recommendationIsbnCandidates(doc: any): string[] {
  const raw = doc?.raw && typeof doc.raw === "object" ? doc.raw : {};
  const volumeInfo = doc?.volumeInfo && typeof doc.volumeInfo === "object" ? doc.volumeInfo : {};
  const rawVolumeInfo = raw?.volumeInfo && typeof raw.volumeInfo === "object" ? raw.volumeInfo : {};
  const volumeIndustryIdentifiers = Array.isArray(volumeInfo?.industryIdentifiers) ? volumeInfo.industryIdentifiers : [];
  const rawVolumeIndustryIdentifiers = Array.isArray(rawVolumeInfo?.industryIdentifiers) ? rawVolumeInfo.industryIdentifiers : [];
  const identifierValues = [...volumeIndustryIdentifiers, ...rawVolumeIndustryIdentifiers]
    .map((entry: any) => (entry && typeof entry === "object" ? entry.identifier : ""))
    .filter(Boolean);
  return uniqueIsbnCandidates([
    doc?.isbn13,
    doc?.isbn10,
    doc?.isbn,
    doc?.localCollectionIsbn13,
    doc?.localCollectionIsbn10,
    raw?.isbn13,
    raw?.isbn10,
    raw?.isbn,
    raw?.localCollectionIsbn13,
    raw?.localCollectionIsbn10,
    ...identifierValues,
  ]);
}

