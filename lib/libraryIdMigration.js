const YVHS_LIBRARY_ID = "yvhs";
const LEGACY_YVHS_LIBRARY_ID = "y";

function canonicalLibraryId(value) {
  const id = String(value || "").trim();
  const lowerId = id.toLowerCase();
  return lowerId === LEGACY_YVHS_LIBRARY_ID || lowerId === YVHS_LIBRARY_ID
    ? YVHS_LIBRARY_ID
    : id;
}

function libraryIdReadCandidates(value) {
  const canonicalId = canonicalLibraryId(value);
  if (!canonicalId) return [];
  return canonicalId.toLowerCase() === YVHS_LIBRARY_ID
    ? [YVHS_LIBRARY_ID, LEGACY_YVHS_LIBRARY_ID]
    : [canonicalId];
}

function isLegacyYvhsLibraryId(value) {
  return String(value || "").trim().toLowerCase() === LEGACY_YVHS_LIBRARY_ID;
}

exports.YVHS_LIBRARY_ID = YVHS_LIBRARY_ID;
exports.LEGACY_YVHS_LIBRARY_ID = LEGACY_YVHS_LIBRARY_ID;
exports.canonicalLibraryId = canonicalLibraryId;
exports.libraryIdReadCandidates = libraryIdReadCandidates;
exports.isLegacyYvhsLibraryId = isLegacyYvhsLibraryId;
