import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const require = createRequire(import.meta.url);
const ts = require("typescript");

require.extensions[".ts"] = (module, filename) => {
  const source = readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      moduleResolution: ts.ModuleResolutionKind.Node10,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;
  module._compile(output, filename);
};

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertIncludes(values, expected, message) {
  if (!Array.isArray(values) || !values.includes(expected)) {
    throw new Error(`${message}: expected ${JSON.stringify(values)} to include ${JSON.stringify(expected)}`);
  }
}

function googleBook(id, title, description, categories, publisher = "Test Publisher") {
  return {
    kind: "books#volume",
    id,
    volumeInfo: {
      title,
      authors: ["Regression Author"],
      description,
      categories,
      publisher,
      publishedDate: "2024",
      pageCount: 320,
      printType: "BOOK",
      language: "en",
      industryIdentifiers: [{ type: "ISBN_13", identifier: `978000000${id.padStart(4, "0")}` }],
    },
  };
}

const ellaDarkTitles = [
  ["ella-10", "Girl, Escaped (An Ella Dark FBI Suspense Thriller\u2014Book 10)"],
  ["ella-2", "Girl, Taken (An Ella Dark FBI Suspense Thriller\u2014Book 2)"],
  ["ella-4", "Girl, Silenced (An Ella Dark FBI Suspense Thriller\u2014Book 4)"],
  ["ella-5", "Girl, Vanished (An Ella Dark FBI Suspense Thriller\u2014Book 5)"],
  ["ella-3", "Girl, Hunted (An Ella Dark FBI Suspense Thriller\u2014Book 3)"],
  ["ella-6", "Girl, Erased (An Ella Dark FBI Suspense Thriller\u2014Book 6)"],
];

const fixtures = [
  ...ellaDarkTitles.map(([id, title]) => googleBook(
    id,
    title,
    "When FBI agent Ella Dark hunts a serial killer, she must uncover a dangerous pattern, confront old secrets, and survive a case that threatens everyone around her.",
    ["Fiction / Thrillers / Suspense", "Fiction / Mystery & Detective / Women Sleuths"],
    "Blake Pierce",
  )),
  googleBook(
    "guide-top-100",
    "The Guide to the Top 100 Mystery & Thriller Books",
    "A curated guide ranking the top mystery and thriller books, with reviews, recommendations, and readers advisory notes for fans of the genre.",
    ["Fiction / Mystery & Detective", "Reference / Bibliographies & Indexes"],
    "Readers Advisory Press",
  ),
  googleBook(
    "megapack-science-fantasy",
    "The Science-Fantasy MEGAPACK\u00ae: 4 Classic Novels",
    "A bundled MEGAPACK collection of four classic novels of science-fantasy adventure by multiple authors.",
    ["Fiction / Science Fiction / Collections & Anthologies", "Fiction / Fantasy / Collections & Anthologies"],
    "Wildside Press",
  ),
  googleBook(
    "megapack-price",
    "The E. Hoffmann Price Fantasy & Science Fiction MEGAPACK\u00ae",
    "A genre MEGAPACK collecting fantasy and science fiction stories, tales, and short fiction by E. Hoffmann Price.",
    ["Fiction / Science Fiction / Collections & Anthologies", "Fiction / Fantasy / Collections & Anthologies"],
    "Wildside Press",
  ),
  googleBook(
    "megapack-ardath",
    "The Second Ardath Mayhar MEGAPACK\u00ae: 27 Science Fiction & Fantasy Tales",
    "An omnibus MEGAPACK collection of 27 science fiction and fantasy tales, stories, and short works.",
    ["Fiction / Science Fiction / Collections & Anthologies", "Fiction / Fantasy / Collections & Anthologies"],
    "Wildside Press",
  ),
  googleBook(
    "best-american-2022",
    "The Best American Science Fiction and Fantasy 2022",
    "Award-winning author and guest editor Rebecca Roanhorse and series editor John Joseph Adams select twenty pieces that represent the best examples of the form published the previous year.",
    ["Fiction"],
    "HarperCollins",
  ),
  googleBook(
    "technique-mystery",
    "The Technique of the Mystery Story",
    "A craft and writing study examining mystery story technique, plotting, structure, criticism, and methods for writers.",
    ["Language Arts & Disciplines / Writing", "Literary Criticism / Mystery & Detective"],
    "Writer Craft Press",
  ),
  googleBook(
    "writing-guide",
    "How to Write a Mystery Thriller",
    "This writing guide teaches plotting, character development, suspense structure, and revision exercises for writers.",
    ["Language Arts & Disciplines / Writing", "Reference"],
    "Writer Craft Press",
  ),
  googleBook(
    "literary-study",
    "Studies in Detective Fiction",
    "This scholarly study examines detective fiction, literary criticism, genre history, and critical interpretations of mystery novels.",
    ["Literary Criticism / Mystery & Detective", "Literary Criticism / History"],
    "Academic Press",
  ),
  // --- academic criticism titles that should classify as critical_study, not novel ---
  googleBook(
    "criticism-hunger-games-nature",
    "Concepts of Nature in Young Adult Dystopian Fiction. Suzanne Collins' The Hunger Games Series",
    "A seminar paper analyzing the representation of nature in Suzanne Collins' dystopian fiction. The paper examines the characters' relationship with nature and the symbolic role of the environment.",
    ["Literary Criticism / Fiction in English", "Language Arts & Disciplines"],
    "GRIN Verlag",
  ),
  googleBook(
    "criticism-american-war",
    "Omar El Akkad's \"American War\". A Child's Perspective on War",
    "Academic study exploring a child's perspective and representation of trauma in El Akkad's novel.",
    ["Literary Criticism / Fiction in English"],
    "GRIN Verlag",
  ),
  googleBook(
    "criticism-blade-runner",
    "Blade Runner and the Cyberpunk Narrative",
    "An academic exploration of cyberpunk themes and narrative structure in Blade Runner fiction and science fiction.",
    ["Literary Criticism / Science Fiction & Fantasy", "Language Arts & Disciplines"],
    "Academic Press",
  ),
  googleBook(
    "criticism-orwell-repression",
    "Sexual repression in Orwell's Nineteen Eighty-Four",
    "A study of sexual repression, power, and surveillance in George Orwell's dystopian novel.",
    ["Literary Criticism / Fiction in English", "Language Arts & Disciplines"],
    "GRIN Verlag",
  ),
  googleBook(
    "criticism-maze-runner",
    "Visions of the Wasteland in Maze Runner",
    "An academic reading of post-apocalyptic landscape, survival, and ecology in the Maze Runner series.",
    ["Literary Criticism / Science Fiction & Fantasy"],
    "GRIN Verlag",
  ),
  // --- genuine novel: should NOT be affected by new patterns ---
  googleBook(
    "visions-of-heat",
    "Visions of Heat",
    "A young woman discovers her latent ability and must navigate a world where power and desire intersect in unexpected ways.",
    ["Fiction / Fantasy / Paranormal & Urban", "Fiction / Romance / Paranormal"],
    "Berkley",
  ),
];

globalThis.fetch = async () => ({
  ok: true,
  status: 200,
  text: async () => JSON.stringify({ totalItems: fixtures.length, items: fixtures }),
});

const { runRecommenderV2 } = require(resolve("app/recommender-v2/engine.ts"));

const result = await runRecommenderV2({
  requestId: "googlebooks-publication-shape-regression",
  ageBand: "adult",
  enabledSources: {
    mock: false,
    googleBooks: true,
    openLibrary: false,
    kitsu: false,
    comicVine: false,
    localLibrary: false,
    nyt: false,
  },
  signals: [
    { action: "like", title: "The Silent Patient", genres: ["Psychological Thriller"], tags: ["adult", "mystery", "thriller"] },
    { action: "like", title: "Criminal", genres: ["Crime"], tags: ["adult", "crime", "mystery"] },
  ],
});

const diagnostics = result.diagnostics.rejectedReasons || {};
const sourceDiagnostics = (result.diagnostics.sources || []).find((source) => source.source === "googleBooks") || {};
const shapes = { ...(sourceDiagnostics.googleBooksPublicationShapeByTitle || {}), ...(diagnostics.googleBooksPublicationShapeByTitle || {}) };
const normalizedReasons = diagnostics.googleBooksNormalizedRejectReasonByTitle || {};
const rejectedBeforeRanking = {
  ...(sourceDiagnostics.googleBooksPublicationShapeRejectedBeforeRankingByTitle || {}),
  ...(diagnostics.googleBooksPublicationShapeRejectedBeforeRankingByTitle || {}),
};
const enteredRanking = diagnostics.googleBooksEnteredRanking || [];
const shapeEvidence = sourceDiagnostics.googleBooksDominantPublicationShapeEvidenceByTitle || {};

for (const [, title] of ellaDarkTitles) {
  assertEqual(shapes[title], "series_installment", `${title} should classify as a series installment`);
  assertEqual(normalizedReasons[title], "entered_ranking", `${title} should survive the publication/reference gate`);
  assertIncludes(enteredRanking, title, `${title} should enter ranking`);
}

assertEqual(shapes["The Guide to the Top 100 Mystery & Thriller Books"], "readers_advisory", "curated guide should classify as readers advisory");
assertEqual(rejectedBeforeRanking["The Guide to the Top 100 Mystery & Thriller Books"], "publication_shape_readers_advisory", "curated guide should reject before ranking");
assertEqual(shapes["The Science-Fantasy MEGAPACK\u00ae: 4 Classic Novels"], "anthology", "science-fantasy MEGAPACK should classify as anthology");
assertEqual(rejectedBeforeRanking["The Science-Fantasy MEGAPACK\u00ae: 4 Classic Novels"], "publication_shape_anthology", "science-fantasy MEGAPACK should reject before ranking");
assertEqual(shapes["The E. Hoffmann Price Fantasy & Science Fiction MEGAPACK\u00ae"], "anthology", "author/genre MEGAPACK should classify as anthology");
assertEqual(rejectedBeforeRanking["The E. Hoffmann Price Fantasy & Science Fiction MEGAPACK\u00ae"], "publication_shape_anthology", "author/genre MEGAPACK should reject before ranking");
assertEqual(shapes["The Second Ardath Mayhar MEGAPACK\u00ae: 27 Science Fiction & Fantasy Tales"], "anthology", "tales MEGAPACK should classify as anthology");
assertEqual(rejectedBeforeRanking["The Second Ardath Mayhar MEGAPACK\u00ae: 27 Science Fiction & Fantasy Tales"], "publication_shape_anthology", "tales MEGAPACK should reject before ranking");
assertEqual(shapes["The Best American Science Fiction and Fantasy 2022"], "anthology", "annual Best American volume should classify as anthology");
assertEqual(rejectedBeforeRanking["The Best American Science Fiction and Fantasy 2022"], "publication_shape_anthology", "annual Best American volume should reject before ranking");
assertIncludes(shapeEvidence["The Best American Science Fiction and Fantasy 2022"], "best_american_annual_title_shape", "annual Best American title evidence should be exposed");
assertIncludes(shapeEvidence["The Best American Science Fiction and Fantasy 2022"], "annual_anthology_editor_selection_description", "editor-selection metadata should corroborate annual anthology identity");
assertEqual(shapes["The Technique of the Mystery Story"], "writing_guide", "technique title should classify as writing guide");
assertEqual(rejectedBeforeRanking["The Technique of the Mystery Story"], "publication_shape_writing_guide", "technique title should reject before ranking");
assertEqual(shapes["How to Write a Mystery Thriller"], "writing_guide", "writing guide should classify as writing guide");
assertEqual(rejectedBeforeRanking["How to Write a Mystery Thriller"], "publication_shape_writing_guide", "writing guide should reject before ranking");
assertEqual(shapes["Studies in Detective Fiction"], "critical_study", "literary study should classify as critical study");
assertEqual(rejectedBeforeRanking["Studies in Detective Fiction"], "publication_shape_critical_study", "literary study should reject before ranking");

// Academic criticism pattern regressions
assertEqual(shapes["Concepts of Nature in Young Adult Dystopian Fiction. Suzanne Collins' The Hunger Games Series"], "critical_study", "study-topic-in-work title should classify as critical study");
assertEqual(rejectedBeforeRanking["Concepts of Nature in Young Adult Dystopian Fiction. Suzanne Collins' The Hunger Games Series"], "publication_shape_critical_study", "study-topic-in-work title should reject before ranking");

assertEqual(shapes["Omar El Akkad's \"American War\". A Child's Perspective on War"], "critical_study", "quoted-work-study title should classify as critical study");
assertEqual(rejectedBeforeRanking["Omar El Akkad's \"American War\". A Child's Perspective on War"], "publication_shape_critical_study", "quoted-work-study title should reject before ranking");

assertEqual(shapes["Blade Runner and the Cyberpunk Narrative"], "critical_study", "cyberpunk concept study should classify as critical study");
assertEqual(rejectedBeforeRanking["Blade Runner and the Cyberpunk Narrative"], "publication_shape_critical_study", "cyberpunk concept study should reject before ranking");

assertEqual(shapes["Sexual repression in Orwell's Nineteen Eighty-Four"], "critical_study", "academic-concept-in-author-work title should classify as critical study");
assertEqual(rejectedBeforeRanking["Sexual repression in Orwell's Nineteen Eighty-Four"], "publication_shape_critical_study", "academic-concept-in-author-work title should reject before ranking");

assertEqual(shapes["Visions of the Wasteland in Maze Runner"], "critical_study", "visions-of-X-in-Y title should classify as critical study");
assertEqual(rejectedBeforeRanking["Visions of the Wasteland in Maze Runner"], "publication_shape_critical_study", "visions-of-X-in-Y title should reject before ranking");

// Genuine novel regression: "Visions of Heat" must not be caught
const visionsOfHeatShape = shapes["Visions of Heat"];
if (visionsOfHeatShape === "critical_study" || visionsOfHeatShape === "academic_text") {
  throw new Error(`Genuine novel "Visions of Heat" must not be classified as ${visionsOfHeatShape}`);
}
const visionsOfHeatRejected = rejectedBeforeRanking["Visions of Heat"];
if (visionsOfHeatRejected) {
  throw new Error(`Genuine novel "Visions of Heat" must not be rejected before ranking, got: ${visionsOfHeatRejected}`);
}

console.log(JSON.stringify({
  name: "adult google books publication shape regressions",
  pass: true,
  enteredRanking,
  rejectedBeforeRanking,
}, null, 2));
