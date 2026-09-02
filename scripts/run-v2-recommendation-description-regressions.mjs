import { createRequire } from "node:module";
import { Buffer } from "node:buffer";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

const require = createRequire(import.meta.url);
const ts = require("typescript");

require.extensions[".ts"] = (module, filename) => {
  const source = readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      moduleResolution: ts.ModuleResolutionKind.Node10,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
  }).outputText;
  module._compile(output, filename);
};

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { normalizeSourceResults } = require(resolve(root, "app", "recommender-v2", "normalize.ts"));
const { importLocalCollectionCsv } = require(resolve(root, "lib", "localCollection", "index.ts"));
const { buildRecommendationArtifact } = require(resolve(root, "lib", "localCollection", "storage.ts"));
const {
  DESCRIPTION_FALLBACK,
  cleanRecommendationDescription,
  recommendationDescriptionExcerpt,
} = require(resolve(root, "screens", "swipe", "recommendationDescription.ts"));
const { encodeGzipBase64Json } = require(resolve(root, "lib", "librarySharing", "client.ts"));

const swipeSource = readFileSync(resolve(root, "screens", "SwipeDeckScreen.tsx"), "utf8");
const sourceFiles = {
  googleBooks: readFileSync(resolve(root, "app", "recommender-v2", "sources", "googleBooksSource.ts"), "utf8"),
  openLibrary: readFileSync(resolve(root, "app", "recommender-v2", "sources", "openLibrarySource.ts"), "utf8"),
  kitsu: readFileSync(resolve(root, "app", "recommender-v2", "sources", "kitsuSource.ts"), "utf8"),
  comicVine: readFileSync(resolve(root, "app", "recommender-v2", "sources", "comicVineSource.ts"), "utf8"),
  nyt: readFileSync(resolve(root, "app", "recommender-v2", "sources", "nytSource.ts"), "utf8"),
  localLibrary: readFileSync(resolve(root, "app", "recommender-v2", "sources", "localLibrarySource.ts"), "utf8"),
};
const localCollectionStorageSource = readFileSync(resolve(root, "lib", "localCollection", "storage.ts"), "utf8");
const localCollectionPresentationSource = readFileSync(resolve(root, "lib", "localCollection", "presentation.ts"), "utf8");
const librarySharingClientSource = readFileSync(resolve(root, "lib", "librarySharing", "client.ts"), "utf8");
const localCollectionApiSource = readFileSync(resolve(root, "api", "local-collection.ts"), "utf8");
const adminSource = readFileSync(resolve(root, "app", "app_admin-web.tsx"), "utf8");

let passed = 0;
let failed = 0;

function check(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
    passed += 1;
  } catch (error) {
    console.error(`FAIL ${name}: ${error instanceof Error ? error.message : String(error)}`);
    failed += 1;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

check("normalized candidate preserves a common description field", () => {
  const [candidate] = normalizeSourceResults([{
    source: "googleBooks",
    status: "succeeded",
    rawItems: [{
      id: "gb:1",
      title: "Known Book",
      authors: ["Known Author"],
      description: "<p>A factual publisher description.</p>",
      formats: ["book"],
    }],
    diagnostics: { source: "googleBooks", status: "succeeded", planned: true, attempted: true, timedOut: false, rawCount: 1, queries: [] },
  }]);
  assert(candidate?.description === "<p>A factual publisher description.</p>", "description was not preserved");
  assert(candidate?.displayDescription === candidate?.description, "common display description was not normalized");
});

check("presentation cleaning removes markup and decodes entities", () => {
  const cleaned = cleanRecommendationDescription("<p>A story &amp; a mystery.</p><script>bad()</script>");
  assert(cleaned === "A story & a mystery.", `unexpected cleaned description: ${cleaned}`);
});

check("presentation excerpt is bounded to five sentences", () => {
  const excerpt = recommendationDescriptionExcerpt("One. Two. Three. Four. Five. Six.");
  assert(excerpt === "One. Two. Three. Four. Five.", `unexpected excerpt: ${excerpt}`);
});

check("missing descriptions use the explicit fallback", () => {
  assert(recommendationDescriptionExcerpt("") === DESCRIPTION_FALLBACK, "missing-description fallback changed");
});

check("Local Collection items without descriptions remain explicitly empty", () => {
  const [candidate] = normalizeSourceResults([{
    source: "localLibrary",
    status: "succeeded",
    rawItems: [{
      id: "local:without-description",
      title: "Local Book Without Summary",
      authors: ["Known Local Author"],
      formats: ["book"],
    }],
    diagnostics: { source: "localLibrary", status: "succeeded", planned: true, attempted: true, timedOut: false, rawCount: 1, queries: [] },
  }]);
  assert(candidate?.description === undefined, "missing local description entered scoring metadata");
  assert(candidate?.displayDescription === undefined, "missing local description was fabricated");
  assert(recommendationDescriptionExcerpt(candidate?.displayDescription) === DESCRIPTION_FALLBACK, "missing local description did not use the graceful fallback");
});

check("CSV summary aliases persist into recommendation records", () => {
  const artifact = importLocalCollectionCsv({
    csvText: [
      "Title,Author,ISBN,Summary",
      "Known Local Book,Known Local Author,9780306406157,A catalog-provided summary.",
    ].join("\n"),
    sourceFilename: "descriptions.csv",
    importTimestamp: "2026-08-27T00:00:00.000Z",
  });

  check("Local Collection descriptions remain presentation-only", () => {
    const [candidate] = normalizeSourceResults([{
      source: "localLibrary",
      status: "succeeded",
      rawItems: [{
        id: "local:1",
        title: "Known Local Book",
        authors: ["Known Local Author"],
        description: "A librarian-provided annotation.",
        formats: ["book"],
      }],
      diagnostics: { source: "localLibrary", status: "succeeded", planned: true, attempted: true, timedOut: false, rawCount: 1, queries: [] },
    }]);
    assert(candidate?.description === undefined, "Local Collection description entered scoring metadata");
    assert(candidate?.displayDescription === "A librarian-provided annotation.", "Local Collection display description was lost");
  });
  const recommendationArtifact = buildRecommendationArtifact(artifact);
  assert(
    recommendationArtifact.records[0]?.description === "A catalog-provided summary.",
    "CSV summary did not survive normalization and recommendation storage",
  );
});

check("all enabled source adapters use existing description metadata", () => {
  assert(sourceFiles.googleBooks.includes("description: description || undefined"), "Google Books description is not forwarded");
  assert(sourceFiles.openLibrary.includes("description,"), "Open Library description is not forwarded");
  assert(sourceFiles.kitsu.includes("description: synopsis || undefined"), "Kitsu synopsis is not forwarded");
  assert(sourceFiles.comicVine.includes("description: description || undefined"), "Comic Vine description is not forwarded");
  assert(sourceFiles.nyt.includes("description: book.description"), "NYT description is not forwarded");
  assert(
    sourceFiles.localLibrary.includes("adaptLocalCollectionSourceRecord") &&
      localCollectionPresentationSource.includes("description: record.description"),
    "Local Collection description is not forwarded",
  );
});

check("recommendation card exposes complementary About and Save controls", () => {
  assert(swipeSource.includes('accessibilityLabel="About this book"'), "About this book control is missing");
  assert(swipeSource.includes("style={styles.aboutRecommendationButton}"), "upper-left About control style is missing");
  assert(swipeSource.includes("localCollectionDetailDescription(candidate)"), "renderer does not use the shared presentation-safe description adapter");
  assert(swipeSource.includes("style={[styles.saveRecommendationButton, currentRecommendationSaved && styles.saveRecommendationButtonSaved]}"), "existing Save control changed");
  assert(swipeSource.includes('accessibilityLabel={currentRecommendationSaved ? "Saved to My List" : "Save recommendation to My List"}'), "Save behavior accessibility contract changed");
});

check("description opens in a closable modal without navigation", () => {
  assert(swipeSource.includes("setShowRecommendationDescription(true)"), "description modal does not open");
  assert(swipeSource.includes("setShowRecommendationDescription(false)"), "description modal does not close");
  assert(swipeSource.includes("}, [currentRecKey]);"), "description modal does not reset when the recommendation changes");
  assert(swipeSource.includes("recommendationDescriptionScroll"), "long descriptions are not scroll-contained");
  assert(!/About this book[\s\S]{0,500}(?:router\.|Linking\.)/.test(swipeSource), "description control navigates away");
});

check("oversized description artifacts use authenticated compressed shared publishing", () => {
  assert(localCollectionStorageSource.includes("useCompression"), "oversized collection routing is missing");
  assert(localCollectionStorageSource.includes("saveCompressedSharedLibraryCollectionWithDiagnostics"), "oversized collections are not compressed");
  assert(librarySharingClientSource.includes('new CompressionStream("gzip")'), "browser gzip encoding is missing");
  assert(localCollectionApiSource.includes('body.artifactEncoding !== "gzip-base64"'), "API compressed payload contract is missing");
  assert(localCollectionApiSource.includes("gunzipSync"), "API does not decode compressed artifacts");
  assert(localCollectionApiSource.includes("gzipSync"), "API does not compress private-Blob fallback responses");
  assert(localCollectionApiSource.includes('req.query.compressed'), "API compressed read fallback is missing");
  assert(librarySharingClientSource.includes('searchParams.set("compressed", "1")'), "client does not use compressed private-Blob reads");
  assert(localCollectionApiSource.includes("MAX_DECOMPRESSED_ARTIFACT_BYTES"), "compressed upload expansion limit is missing");
  assert(adminSource.includes("Published and verified using compressed transfer"), "admin does not report compressed publishing");
  assert(!adminSource.includes("Shared publish blocked:"), "admin still blocks description-rich shared artifacts");
});

const compressedFixture = await encodeGzipBase64Json({
  schemaVersion: "local_collection_recommendation_v1",
  records: [{ localId: "local-1", title: "Known Local Book", description: "A catalog summary survives compressed publishing." }],
});
check("compressed shared publishing preserves description content", () => {
  assert(typeof compressedFixture === "string" && compressedFixture.length > 0, "fixture was not compressed");
  const decoded = JSON.parse(gunzipSync(Buffer.from(compressedFixture, "base64")).toString("utf8"));
  assert(
    decoded.records[0].description === "A catalog summary survives compressed publishing.",
    "description changed during compressed transport",
  );
});

console.log(`\nRecommendation description regressions: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
