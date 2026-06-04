import type { SourceAdapterV2, SourceIdV2 } from "../types";
import { mockSourceAdapter } from "./mockSource";
import { openLibrarySourceAdapter } from "./openLibrarySource";

export const sourceAdapters: Record<SourceIdV2, SourceAdapterV2 | null> = {
  mock: mockSourceAdapter,
  googleBooks: null,
  openLibrary: openLibrarySourceAdapter,
  kitsu: null,
  comicVine: null,
  localLibrary: null,
  nyt: null,
};

export { mockSourceAdapter, openLibrarySourceAdapter };
