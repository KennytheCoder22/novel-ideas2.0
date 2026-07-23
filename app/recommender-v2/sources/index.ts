import type { SourceAdapterV2, SourceIdV2 } from "../types";
import { mockSourceAdapter } from "./mockSource";
import { googleBooksSourceAdapter } from "./googleBooksSource";
import { openLibrarySourceAdapter } from "./openLibrarySource";
import { kitsuSourceAdapter } from "./kitsuSource";
import { comicVineSourceAdapter } from "./comicVineSource";
import { nytSourceAdapter } from "./nytSource";

export const sourceAdapters: Record<SourceIdV2, SourceAdapterV2 | null> = {
  mock: mockSourceAdapter,
  googleBooks: googleBooksSourceAdapter,
  openLibrary: openLibrarySourceAdapter,
  kitsu: kitsuSourceAdapter,
  comicVine: comicVineSourceAdapter,
  localLibrary: null,
  nyt: nytSourceAdapter,
};

export { mockSourceAdapter, googleBooksSourceAdapter, openLibrarySourceAdapter, kitsuSourceAdapter, comicVineSourceAdapter, nytSourceAdapter };
