type Listener = () => void;

let libraryName = "";
const listeners = new Set<Listener>();

export function getRuntimeLibraryName(): string {
  return libraryName;
}

export function setRuntimeLibraryName(name: string): void {
  libraryName = name ?? "";
  listeners.forEach((l) => l());
}

export function subscribeRuntimeLibraryName(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
