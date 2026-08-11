export const PATRON_ID_STORAGE_KEY: string;

export function createPatronId(): string;
export function pipelineUserIdForPatron(patronId: string, deckKey: string, libraryId?: string): string;
export function pipelineSessionIdForPatron(patronId: string, deckKey: string, sessionNonce: number, libraryId?: string): string;
export function recommendationHistoryKeyForPatron(patronId: string, deckKey: string, libraryId?: string): string;
export function redactedPatronId(patronId: string): string;
export function clearPatronRecordStores(...stores: Array<Record<string, unknown>>): void;

export function readOrCreatePatronId(
  storage: Pick<Storage, "getItem" | "setItem"> | null,
  createId?: () => string,
): string;
export function resetPatronIdentity(
  storage: Pick<Storage, "getItem" | "setItem"> | null,
  createId?: () => string,
): { previousId: string; nextId: string };

type AsyncPatronStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
};

export function readOrCreatePatronIdAsync(
  storage: AsyncPatronStorage,
  createId?: () => string,
): Promise<string>;
export function resetPatronIdentityAsync(
  storage: AsyncPatronStorage,
  createId?: () => string,
): Promise<{ previousId: string; nextId: string }>;
