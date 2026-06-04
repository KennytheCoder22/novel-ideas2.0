import type { SourceAdapterV2, SourceIdV2 } from "../types";
import { mockSourceAdapter } from "./mockSource";

export const sourceAdapters: Record<SourceIdV2, SourceAdapterV2 | null> = {
  mock: mockSourceAdapter,
  googleBooks: null,
  openLibrary: null,
  kitsu: null,
  comicVine: null,
  localLibrary: null,
  nyt: null,
};

export { mockSourceAdapter };
