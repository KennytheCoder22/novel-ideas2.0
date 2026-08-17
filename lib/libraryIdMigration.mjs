export const YVHS_LIBRARY_ID = "yvhs";
export const LEGACY_YVHS_LIBRARY_ID = "y";

export function canonicalLibraryId(value) {
  const id = String(value || "").trim();
  const lowerId = id.toLowerCase();
  return lowerId === LEGACY_YVHS_LIBRARY_ID || lowerId === YVHS_LIBRARY_ID
    ? YVHS_LIBRARY_ID
    : id;
}

export function libraryIdReadCandidates(value) {
  const canonicalId = canonicalLibraryId(value);
  if (!canonicalId) return [];
  return canonicalId.toLowerCase() === YVHS_LIBRARY_ID
    ? [YVHS_LIBRARY_ID, LEGACY_YVHS_LIBRARY_ID]
    : [canonicalId];
}

export function isLegacyYvhsLibraryId(value) {
  return String(value || "").trim().toLowerCase() === LEGACY_YVHS_LIBRARY_ID;
}
