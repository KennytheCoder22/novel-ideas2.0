export const MIN_NEW_LIBRARY_ID_LENGTH = 3;

const PATRON_LIBRARIES_STORAGE_KEY = "novelideas_patron_libraries_v1";
const ADMIN_LIBRARIES_STORAGE_KEY = "novelideas_admin_libraries_v1";

export type SavedLibrary = {
  libraryId: string;
  libraryName: string;
  hostedPath: string;
};

type LibraryStorage = Pick<Storage, "getItem" | "setItem">;

export function normalizeHostedLibraryId(raw: string): string {
  return normalizeHostedLibraryRouteId(raw).slice(0, 40);
}

export function normalizeHostedLibraryRouteId(raw: string): string {
  return String(raw || "")
    .trim()
    .replace(/[^a-z0-9_-]/gi, "");
}

export function validateLibraryIdForSave(
  raw: string,
  existingScopeId: string = "",
): { valid: boolean; normalizedId: string; message: string } {
  const normalizedId = normalizeHostedLibraryId(raw);
  const normalizedExistingScope = normalizeHostedLibraryId(existingScopeId);
  if (!normalizedId) {
    return { valid: false, normalizedId, message: "Library ID is required." };
  }
  if (
    normalizedId.length < MIN_NEW_LIBRARY_ID_LENGTH
    && normalizedId.toLowerCase() !== normalizedExistingScope.toLowerCase()
  ) {
    return {
      valid: false,
      normalizedId,
      message: `New Library IDs must be at least ${MIN_NEW_LIBRARY_ID_LENGTH} characters after normalization.`,
    };
  }
  return { valid: true, normalizedId, message: "" };
}

function readLibraries(storage: LibraryStorage | null, key: string): SavedLibrary[] {
  if (!storage) return [];
  try {
    const parsed = JSON.parse(storage.getItem(key) || "[]");
    if (!Array.isArray(parsed)) return [];
    const byId = new Map<string, SavedLibrary>();
    for (const item of parsed) {
      const libraryId = normalizeHostedLibraryRouteId(item?.libraryId);
      const libraryName = String(item?.libraryName || "").trim();
      if (!libraryId || !libraryName) continue;
      byId.set(libraryId.toLowerCase(), {
        libraryId,
        libraryName,
        hostedPath: `/${encodeURIComponent(libraryId)}`,
      });
    }
    return [...byId.values()].sort((a, b) => a.libraryName.localeCompare(b.libraryName));
  } catch {
    return [];
  }
}

function rememberLibrary(
  storage: LibraryStorage | null,
  key: string,
  library: Pick<SavedLibrary, "libraryId" | "libraryName">,
): SavedLibrary[] {
  if (!storage) return [];
  const libraryId = normalizeHostedLibraryRouteId(library.libraryId);
  const libraryName = String(library.libraryName || "").trim();
  if (!libraryId || !libraryName) return readLibraries(storage, key);
  const next = readLibraries(storage, key).filter(
    (item) => item.libraryId.toLowerCase() !== libraryId.toLowerCase(),
  );
  next.push({ libraryId, libraryName, hostedPath: `/${encodeURIComponent(libraryId)}` });
  next.sort((a, b) => a.libraryName.localeCompare(b.libraryName));
  storage.setItem(key, JSON.stringify(next));
  return next;
}

export function readPatronLibraries(storage: LibraryStorage | null): SavedLibrary[] {
  return readLibraries(storage, PATRON_LIBRARIES_STORAGE_KEY);
}

export function rememberPatronLibrary(
  storage: LibraryStorage | null,
  library: Pick<SavedLibrary, "libraryId" | "libraryName">,
): SavedLibrary[] {
  return rememberLibrary(storage, PATRON_LIBRARIES_STORAGE_KEY, library);
}

export function readAdminLibraries(storage: LibraryStorage | null): SavedLibrary[] {
  return readLibraries(storage, ADMIN_LIBRARIES_STORAGE_KEY);
}

export function rememberAdminLibrary(
  storage: LibraryStorage | null,
  library: Pick<SavedLibrary, "libraryId" | "libraryName">,
): SavedLibrary[] {
  return rememberLibrary(storage, ADMIN_LIBRARIES_STORAGE_KEY, library);
}
