type Listener = () => void;

const RUNTIME_LIBRARY_NAME_STORAGE_KEY = "novelideas_runtime_library_name_v1";
let libraryName = "";
const listeners = new Set<Listener>();

function readStoredLibraryName(): string {
  try {
    if (typeof window === "undefined" || typeof window.sessionStorage === "undefined") return "";
    return String(window.sessionStorage.getItem(RUNTIME_LIBRARY_NAME_STORAGE_KEY) || "");
  } catch {
    return "";
  }
}

function storeLibraryName(name: string): void {
  try {
    if (typeof window === "undefined" || typeof window.sessionStorage === "undefined") return;
    if (name) window.sessionStorage.setItem(RUNTIME_LIBRARY_NAME_STORAGE_KEY, name);
    else window.sessionStorage.removeItem(RUNTIME_LIBRARY_NAME_STORAGE_KEY);
  } catch {
    // ignore browser storage failures
  }
}

export function getRuntimeLibraryName(): string {
  if (!libraryName) {
    libraryName = readStoredLibraryName();
  }
  return libraryName;
}

export function setRuntimeLibraryName(name: string): void {
  libraryName = name ?? "";
  storeLibraryName(libraryName);
  listeners.forEach((l) => l());
}

export function subscribeRuntimeLibraryName(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
