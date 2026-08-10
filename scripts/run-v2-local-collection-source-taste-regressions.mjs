/**
 * Regression suite: Local Collection source taste-profile sensitivity.
 *
 * Verifies that two materially different swipe sessions (horror/thriller vs romance/comedy)
 * produce meaningfully different candidate rankings from the same local collection.
 *
 * Root cause being guarded against:
 *   localLibrarySource.ts previously only matched tokenized intent-query strings against
 *   record metadata text. When a library uses broad shelving (e.g., "Adult Fiction" rather
 *   than genre-subdivided sections), all records scored 0 and the fallback was alphabetical
 *   order — producing the same top-200 candidate pool regardless of swipe session.
 *
 * Fix: scoreByTasteProfile() directly scores catalog metadata against the TasteProfile's
 * genreFamily/tone/themes/avoidSignals weighted signals. Titles are intentionally excluded:
 * a word in a title is not reliable semantic metadata and must not dominate sparse catalogs.
 */

import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");

// ---------------------------------------------------------------------------
// Assertion helper
// ---------------------------------------------------------------------------

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function check(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => ({ name, pass: true }));
}

// ---------------------------------------------------------------------------
// Build a synthetic local-collection collection with genre-specific shelving
// ---------------------------------------------------------------------------

// Records where shelvingLocation identifies the genre (library uses genre-subdivided shelving).
function makeGenreShelfRecords() {
  const genres = [
    { genre: "horror mystery", titles: ["Darkness Falls", "The Haunting Hour", "Creep", "Night Fear", "Shadow House"] },
    { genre: "thriller suspense", titles: ["The Long Chase", "Cold Pursuit", "Final Warning", "Death Run", "Kill Switch"] },
    { genre: "romance fiction", titles: ["Love Unbound", "Hearts Aligned", "Ever After", "Sweet Reunion", "Tender Vows"] },
    { genre: "comedy humor", titles: ["Laughing Matters", "The Funny Bone", "Jest Best", "Wit and Charm", "Silly Season"] },
    { genre: "science fiction", titles: ["Orbit Decay", "Beyond Stars", "Neural Dreams", "Void Protocol", "The Ship"] },
  ];
  const records = [];
  let id = 1;
  for (const { genre, titles } of genres) {
    for (const title of titles) {
      records.push({
        localId: `rec${id++}`,
        title,
        author: `Author ${id}`,
        audience: "Adult",
        readingLevel: "Adult",
        shelvingLocation: `Adult Fiction / ${genre}`,
        localPlacement: genre,
        callNumber: `FIC ${genre.split(" ")[0].toUpperCase()}`,
        copies: 1,
        publicationYear: 2020,
      });
    }
  }
  return records;
}

// Records where shelvingLocation is only "Adult Fiction" (broad shelving — no genre info).
// Title words must not be promoted as though they were catalog genre/tone evidence.
function makeBroadShelfRecords() {
  const titles = [
    // Horror/thriller themed titles
    { title: "The Monster Under the Bed", theme: "horror" },
    { title: "Ghost Protocol", theme: "horror" },
    { title: "Silent Screams", theme: "horror" },
    { title: "The Psycho Path", theme: "thriller" },
    { title: "Chase the Dark", theme: "thriller" },
    // Romance themed titles
    { title: "Always and Forever", theme: "romance" },
    { title: "My Heart Belongs", theme: "romance" },
    { title: "Love in the City", theme: "romance" },
    { title: "The Wedding Day", theme: "romance" },
    { title: "Sweet Nothings", theme: "romance" },
    // Sci-fi themed titles
    { title: "Robot Uprising", theme: "sci-fi" },
    { title: "Mars Base One", theme: "sci-fi" },
    { title: "The AI Awakens", theme: "sci-fi" },
    // Padding – generic adult fiction (broad shelf, no genre info anywhere)
    { title: "A Story of Summer", theme: "general" },
    { title: "The Garden House", theme: "general" },
    { title: "Blue Sky Days", theme: "general" },
    { title: "Mountain Road", theme: "general" },
    { title: "Ocean Voices", theme: "general" },
  ];
  return titles.map(({ title }, i) => ({
    localId: `broad${i + 1}`,
    title,
    author: `Writer ${i + 1}`,
    audience: "Adult",
    readingLevel: "Adult",
    shelvingLocation: "Adult Fiction",       // ← only broad shelving — the failure case
    localPlacement: "General Fiction",
    callNumber: `FIC ${title[0]}`,
    copies: 1,
    publicationYear: 2019,
  }));
}

// ---------------------------------------------------------------------------
// Minimal taste-profile and search-plan construction (mirrors engine internals)
// ---------------------------------------------------------------------------

function makeWeighted(value, weight) {
  return { value, weight, evidence: [] };
}

function makeHorrorThrilerProfile() {
  return {
    ageBand: "adult",
    maturityBand: "adult",
    genreFamily: [
      makeWeighted("horror", 3),
      makeWeighted("thriller", 2.5),
      makeWeighted("mystery", 1.5),
    ],
    tone: [
      makeWeighted("dark", 2),
      makeWeighted("suspenseful", 1.5),
    ],
    themes: [
      makeWeighted("psychological", 1),
    ],
    characterDynamics: [],
    formatPreference: [makeWeighted("book", 0.5)],
    avoidSignals: [makeWeighted("romance", 2), makeWeighted("comedy", 1.5)],
    sourceHints: [],
    diagnostics: {},
  };
}

function makeRomanceComedyProfile() {
  return {
    ageBand: "adult",
    maturityBand: "adult",
    genreFamily: [
      makeWeighted("romance", 3),
      makeWeighted("comedy", 2.5),
    ],
    tone: [
      makeWeighted("warm", 2),
      makeWeighted("funny", 1.5),
    ],
    themes: [
      makeWeighted("love", 1),
    ],
    characterDynamics: [],
    formatPreference: [makeWeighted("book", 0.5)],
    avoidSignals: [makeWeighted("horror", 2), makeWeighted("thriller", 1.5)],
    sourceHints: [],
    diagnostics: {},
  };
}

function makeSourcePlan(profile) {
  const genres = profile.genreFamily.slice(0, 2).map((g) => g.value);
  const primaryQuery = genres.join(" ") || "adult reader discovery";
  return {
    source: "localLibrary",
    enabled: true,
    status: "planned",
    timeoutMs: 2500,
    intents: [
      {
        id: "primary-taste",
        query: primaryQuery,
        facets: genres,
        priority: 1,
        rationale: ["built_from_top_taste_profile_signals"],
      },
      {
        id: "format-maturity",
        query: "adult book",
        facets: ["adult"],
        priority: 0.7,
        rationale: ["maturity_and_format_safety_net"],
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Load the actual localLibrarySource adapter for pure-logic testing.
// We stub loadLocalCollectionRecommendationArtifact and getRuntimeLibraryId.
// ---------------------------------------------------------------------------

// Stub out external dependencies before requiring the source module.
// The TS transpiler will pick up require() calls from within the module.
const Module = require("module");
const originalLoad = Module._load;

let stubbedRecords = [];

Module._load = function(request, parent, isMain) {
  if (request.endsWith("storage") || request.includes("localCollection/storage")) {
    return {
      loadLocalCollectionRecommendationArtifact: async () => ({
        schemaVersion: "local_collection_recommendation_v1",
        createdAt: new Date().toISOString(),
        metadata: { schemaVersion: "local_collection_import_v1", importTimestamp: new Date().toISOString(), sourceFilename: "fixture.csv" },
        deterministicContentHash: "fixture",
        summary: { totalRows: stubbedRecords.length, acceptedTitles: stubbedRecords.length },
        records: stubbedRecords,
      }),
    };
  }
  if (request.endsWith("runtimeConfig") || request.includes("runtimeConfig")) {
    return { getRuntimeLibraryId: () => "yvhs-library" };
  }
  return originalLoad.apply(this, arguments);
};

const { localLibrarySourceAdapter } = require(resolve(repoRoot, "app", "recommender-v2", "sources", "localLibrarySource.ts"));
const { scoreCandidates } = require(resolve(repoRoot, "app", "recommender-v2", "score.ts"));

Module._load = originalLoad;

// ---------------------------------------------------------------------------
// Helper: run adapter and return ordered candidate titles
// ---------------------------------------------------------------------------

async function runAdapter(records, profile) {
  stubbedRecords = records;
  Module._load = function(req, parent, isMain) {
    if (req.endsWith("storage") || req.includes("localCollection/storage")) {
      return {
        loadLocalCollectionRecommendationArtifact: async () => ({
          schemaVersion: "local_collection_recommendation_v1",
          createdAt: new Date().toISOString(),
          metadata: { schemaVersion: "local_collection_import_v1", importTimestamp: new Date().toISOString(), sourceFilename: "fixture.csv" },
          deterministicContentHash: "fixture",
          summary: { totalRows: records.length, acceptedTitles: records.length },
          records,
        }),
      };
    }
    if (req.endsWith("runtimeConfig") || req.includes("runtimeConfig")) {
      return { getRuntimeLibraryId: () => "yvhs-library" };
    }
    return originalLoad.apply(this, arguments);
  };

  const plan = makeSourcePlan(profile);
  const result = await localLibrarySourceAdapter.search(plan, { profile });
  Module._load = originalLoad;
  return result.rawItems.map((item) => item.title);
}

// ---------------------------------------------------------------------------
// Source structural invariant checks (text-based, no runtime needed)
// ---------------------------------------------------------------------------

const sourceSrc = readFileSync(resolve(repoRoot, "app", "recommender-v2", "sources", "localLibrarySource.ts"), "utf8");

const checks = [];

// S1 – context.profile is actually used (not silently ignored)
checks.push(check("S1_context_profile_used_in_ranking", () => {
  assert(sourceSrc.includes("context.profile"), "localLibrarySource must use context.profile in ranking");
  assert(sourceSrc.includes("scoreByTasteProfile"), "localLibrarySource must define scoreByTasteProfile");
  assert(sourceSrc.includes("profile.genreFamily"), "scoreByTasteProfile must consult profile.genreFamily");
  assert(sourceSrc.includes("profile.avoidSignals"), "scoreByTasteProfile must apply avoidSignals penalties");
}));

// S2 – rankByProfile replaces rankByIntentMatches
checks.push(check("S2_rankByProfile_uses_combined_score", () => {
  assert(!sourceSrc.includes("rankByIntentMatches"), "old rankByIntentMatches function must not be present");
  assert(sourceSrc.includes("rankByProfile"), "rankByProfile must be the scoring entry point");
  assert(sourceSrc.includes("intentScore + profileScore"), "combined score must sum intent and profile contributions");
}));

// S3 – withPositiveScore not withMatches (naming signals intent)
checks.push(check("S3_fallback_filter_uses_withPositiveScore", () => {
  assert(!sourceSrc.includes("withMatches"), "old withMatches variable must be replaced");
  assert(sourceSrc.includes("withPositiveScore"), "positive-score filter must be named withPositiveScore");
}));

checks.push(check("S4_title_and_author_excluded_from_catalog_taste_haystack", () => {
  const functionStart = sourceSrc.indexOf("function recordCatalogHaystack");
  const functionEnd = sourceSrc.indexOf("\n}", functionStart);
  const catalogHaystack = sourceSrc.slice(functionStart, functionEnd);
  assert(functionStart >= 0, "recordCatalogHaystack must exist");
  assert(!catalogHaystack.includes("record.title"), "title must not be catalog taste evidence");
  assert(!catalogHaystack.includes("record.author"), "author name must not be catalog taste evidence");
}));

// ---------------------------------------------------------------------------
// Behavioral tests — genre-specific shelving (easy case: intent tokens match)
// ---------------------------------------------------------------------------

const genreRecords = makeGenreShelfRecords();

checks.push(check("B1_horror_profile_ranks_horror_titles_first_with_genre_shelving", async () => {
  const horrorProfile = makeHorrorThrilerProfile();
  const titles = await runAdapter(genreRecords, horrorProfile);
  const top5 = titles.slice(0, 5);
  const horrorTitles = new Set(["Darkness Falls", "The Haunting Hour", "Creep", "Night Fear", "Shadow House", "The Long Chase", "Cold Pursuit", "Final Warning", "Death Run", "Kill Switch"]);
  const horrorInTop5 = top5.filter((t) => horrorTitles.has(t)).length;
  assert(horrorInTop5 >= 3, `horror/thriller profile should have ≥3 horror/thriller titles in top 5, got ${horrorInTop5}: [${top5.join(", ")}]`);
}));

checks.push(check("B2_romance_profile_ranks_romance_titles_first_with_genre_shelving", async () => {
  const romanceProfile = makeRomanceComedyProfile();
  const titles = await runAdapter(genreRecords, romanceProfile);
  const top5 = titles.slice(0, 5);
  const romanceTitles = new Set(["Love Unbound", "Hearts Aligned", "Ever After", "Sweet Reunion", "Tender Vows", "Laughing Matters", "The Funny Bone", "Jest Best", "Wit and Charm", "Silly Season"]);
  const romanceInTop5 = top5.filter((t) => romanceTitles.has(t)).length;
  assert(romanceInTop5 >= 3, `romance/comedy profile should have ≥3 romance/comedy titles in top 5, got ${romanceInTop5}: [${top5.join(", ")}]`);
}));

checks.push(check("B3_different_profiles_produce_different_rankings_genre_shelving", async () => {
  const horrorProfile = makeHorrorThrilerProfile();
  const romanceProfile = makeRomanceComedyProfile();
  const horrorTitles = await runAdapter(genreRecords, horrorProfile);
  const romanceTitles = await runAdapter(genreRecords, romanceProfile);
  assert(horrorTitles[0] !== romanceTitles[0], `top recommendation must differ: horror=${horrorTitles[0]}, romance=${romanceTitles[0]}`);
  const overlap = horrorTitles.slice(0, 5).filter((t) => romanceTitles.slice(0, 5).includes(t)).length;
  assert(overlap <= 2, `top-5 overlap between horror and romance sessions should be ≤2, got ${overlap}`);
}));

// ---------------------------------------------------------------------------
// Behavioral tests — broad shelving and title-only false evidence
// ---------------------------------------------------------------------------

const broadRecords = makeBroadShelfRecords();

checks.push(check("B4_title_words_do_not_create_positive_catalog_scores", async () => {
  const horrorProfile = makeHorrorThrilerProfile();
  stubbedRecords = [
    {
      localId: "title-only-dark",
      title: "Dark Horror Night",
      author: "Writer One",
      audience: "Readers",
      readingLevel: "",
      shelvingLocation: "General",
      localPlacement: "",
      callNumber: "FIC W",
      copies: 1,
      publicationYear: 2020,
    },
    {
      localId: "title-only-neutral",
      title: "Summer Morning",
      author: "Writer Two",
      audience: "Readers",
      readingLevel: "",
      shelvingLocation: "General",
      localPlacement: "",
      callNumber: "FIC W",
      copies: 1,
      publicationYear: 2020,
    },
  ];
  const plan = {
    source: "localLibrary",
    enabled: true,
    status: "planned",
    timeoutMs: 2500,
    intents: [{
      id: "primary-taste",
      query: "horror thriller dark",
      facets: ["horror", "thriller"],
      priority: 1,
      rationale: ["fixture"],
    }],
  };
  const result = await localLibrarySourceAdapter.search(plan, { profile: horrorProfile });
  assert(
    result.diagnostics.localCollectionPositiveScoreCount === 0,
    `title-only genre/tone words must not create positive catalog scores: ${result.diagnostics.localCollectionPositiveScoreCount}`,
  );
}));

checks.push(check("B5_opposite_profiles_do_not_reorder_title_only_catalog", async () => {
  const horrorProfile = makeHorrorThrilerProfile();
  const romanceProfile = makeRomanceComedyProfile();
  const horrorTitles = await runAdapter(broadRecords, horrorProfile);
  const romanceTitles = await runAdapter(broadRecords, romanceProfile);
  assert(
    JSON.stringify(horrorTitles) === JSON.stringify(romanceTitles),
    `title-only words must not change source ordering: horror=[${horrorTitles.slice(0, 5).join(", ")}] romance=[${romanceTitles.slice(0, 5).join(", ")}]`,
  );
}));

checks.push(check("B6_dark_title_cluster_does_not_monopolize_sparse_source_pool", async () => {
  const horrorProfile = makeHorrorThrilerProfile();
  const records = Array.from({ length: 80 }, (_, index) => ({
    localId: `dark-cluster-${index + 1}`,
    title: index < 40 ? `Dark Story ${String(index + 1).padStart(2, "0")}` : `Library Story ${String(index + 1).padStart(2, "0")}`,
    author: `Writer ${index + 1}`,
    audience: "Teen",
    readingLevel: "High School",
    shelvingLocation: "Fiction",
    localPlacement: "",
    callNumber: `FIC W${index + 1}`,
    copies: 1,
    publicationYear: 2020,
  }));
  const titles = await runAdapter(records, horrorProfile);
  const darkCount = titles.slice(0, 20).filter((title) => /\bdark\b/i.test(title)).length;
  assert(
    darkCount < 15,
    `stable sparse-catalog fallback must not return an overwhelmingly Dark-title pool: ${darkCount}/20`,
  );
}));

checks.push(check("B7_title_only_dark_signal_is_not_reintroduced_during_scoring", () => {
  const profile = makeHorrorThrilerProfile();
  const [candidate] = scoreCandidates([{
    id: "localLibrary:title-only-dark",
    sourceId: "title-only-dark",
    source: "localLibrary",
    title: "Dark Horror Night",
    subtitle: "",
    description: "",
    creators: ["Writer One"],
    genres: ["General", "Readers"],
    themes: [],
    tones: [],
    characterDynamics: [],
    formats: ["book"],
    publicationYear: 2020,
    raw: {},
    diagnostics: {
      queryText: "horror thriller dark",
      queryFamily: "local_collection_text_match",
      facets: ["horror", "thriller"],
    },
  }], profile);
  assert(candidate.diagnostics.localLibraryTitleExcludedFromTasteMatch === true, "local title-exclusion diagnostic missing");
  const matchedSignals = candidate.diagnostics.documentBackedTasteSignals;
  assert(!matchedSignals.includes("dark"), `title-backed dark signal leaked into scoring: ${matchedSignals.join(", ")}`);
  assert(!matchedSignals.includes("horror"), `title-backed horror signal leaked into scoring: ${matchedSignals.join(", ")}`);
  assert(
    matchedSignals.length === 1 && matchedSignals[0] === "book",
    `only the document-backed book format should match: ${matchedSignals.join(", ")}`,
  );
}));

// ---------------------------------------------------------------------------
// Run all checks (async-aware)
// ---------------------------------------------------------------------------

const results = [];
for (const check of checks) {
  if (typeof check.then === "function") {
    results.push(await check);
  } else {
    results.push(check);
  }
}

// Handle any checks that returned promises
const resolved = [];
for (const r of results) {
  if (r && typeof r.then === "function") {
    resolved.push(await r);
  } else {
    resolved.push(r);
  }
}

console.log(JSON.stringify({
  pass: true,
  checkCount: resolved.length,
  checks: resolved,
}, null, 2));
