"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.openLibrarySourceAdapter = exports.mockSourceAdapter = exports.sourceAdapters = void 0;
const mockSource_1 = require("./mockSource");
Object.defineProperty(exports, "mockSourceAdapter", { enumerable: true, get: function () { return mockSource_1.mockSourceAdapter; } });
const openLibrarySource_1 = require("./openLibrarySource");
Object.defineProperty(exports, "openLibrarySourceAdapter", { enumerable: true, get: function () { return openLibrarySource_1.openLibrarySourceAdapter; } });
exports.sourceAdapters = {
    mock: mockSource_1.mockSourceAdapter,
    googleBooks: null,
    openLibrary: openLibrarySource_1.openLibrarySourceAdapter,
    kitsu: null,
    comicVine: null,
    localLibrary: null,
    nyt: null,
};
