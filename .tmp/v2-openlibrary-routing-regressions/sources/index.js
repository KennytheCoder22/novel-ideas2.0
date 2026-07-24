"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.nytSourceAdapter = exports.comicVineSourceAdapter = exports.kitsuSourceAdapter = exports.openLibrarySourceAdapter = exports.googleBooksSourceAdapter = exports.mockSourceAdapter = exports.sourceAdapters = void 0;
const mockSource_1 = require("./mockSource");
Object.defineProperty(exports, "mockSourceAdapter", { enumerable: true, get: function () { return mockSource_1.mockSourceAdapter; } });
const googleBooksSource_1 = require("./googleBooksSource");
Object.defineProperty(exports, "googleBooksSourceAdapter", { enumerable: true, get: function () { return googleBooksSource_1.googleBooksSourceAdapter; } });
const openLibrarySource_1 = require("./openLibrarySource");
Object.defineProperty(exports, "openLibrarySourceAdapter", { enumerable: true, get: function () { return openLibrarySource_1.openLibrarySourceAdapter; } });
const kitsuSource_1 = require("./kitsuSource");
Object.defineProperty(exports, "kitsuSourceAdapter", { enumerable: true, get: function () { return kitsuSource_1.kitsuSourceAdapter; } });
const comicVineSource_1 = require("./comicVineSource");
Object.defineProperty(exports, "comicVineSourceAdapter", { enumerable: true, get: function () { return comicVineSource_1.comicVineSourceAdapter; } });
const nytSource_1 = require("./nytSource");
Object.defineProperty(exports, "nytSourceAdapter", { enumerable: true, get: function () { return nytSource_1.nytSourceAdapter; } });
exports.sourceAdapters = {
    mock: mockSource_1.mockSourceAdapter,
    googleBooks: googleBooksSource_1.googleBooksSourceAdapter,
    openLibrary: openLibrarySource_1.openLibrarySourceAdapter,
    kitsu: kitsuSource_1.kitsuSourceAdapter,
    comicVine: comicVineSource_1.comicVineSourceAdapter,
    localLibrary: null,
    nyt: nytSource_1.nytSourceAdapter,
};
