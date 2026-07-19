/**
 * Regression tests for Pre-Teen Google Books publication identity enforcement.
 *
 * These fixtures exercise selection directly so they prove production behavior:
 * hard Google Books publication impostors are rejected for Pre-Teens, while
 * ordinary middle-grade narrative candidates remain eligible.
 */
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

function assertNotIncludes(values, unexpected, message) {
  if (Array.isArray(values) && values.includes(unexpected)) {
    throw new Error(`${message}: expected ${JSON.stringify(values)} not to include ${JSON.stringify(unexpected)}`);
  }
}

const v2Dir = resolve("app/recommender-v2");
const { selectRecommendations } = require(resolve(v2Dir, "select.ts"));
const { preteenGoogleBooksPublicationIdentityAudit } = require(resolve(v2Dir, "preteenGoogleBooksPublicationIdentity.ts"));

const profile = {
  ageBand: "preteens",
  maturityBand: "preteens",
  genreFamily: [
    { value: "fantasy", weight: 2, evidence: ["like:middle-grade-fixture"] },
    { value: "adventure", weight: 2, evidence: ["like:middle-grade-fixture"] },
  ],
  tone: [],
  pacing: [],
  themes: [{ value: "friendship", weight: 1, evidence: ["like:middle-grade-fixture"] }],
  characterDynamics: [],
  formatPreference: [{ value: "book", weight: 1, evidence: ["like:middle-grade-fixture"] }],
  avoidSignals: [],
  sourceHints: ["googleBooks"],
  diagnostics: {},
};

function googleBookCandidate(title, description, categories, overrides = {}) {
  const id = title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return {
    id: `googleBooks:${id}`,
    source: "googleBooks",
    sourceId: id,
    title,
    subtitle: overrides.subtitle || "",
    creators: overrides.creators || ["Regression Author"],
    description,
    formats: ["book"],
    genres: categories,
    themes: ["friendship"],
    tones: [],
    characterDynamics: [],
    maturityBand: "preteens",
    publicationYear: overrides.publicationYear || 2024,
    sourceUrl: `https://books.google.example/${id}`,
    raw: {
      publisher: overrides.publisher || "Scholastic",
      pageCount: overrides.pageCount || 224,
      volumeInfo: {
        title,
        subtitle: overrides.subtitle || undefined,
        authors: overrides.creators || ["Regression Author"],
        description,
        categories,
        publisher: overrides.publisher || "Scholastic",
        publishedDate: String(overrides.publicationYear || 2024),
        pageCount: overrides.pageCount || 224,
        printType: "BOOK",
        maturityRating: "NOT_MATURE",
        industryIdentifiers: [{ type: "ISBN_13", identifier: "9780000000001" }],
      },
    },
    diagnostics: { queryText: "middle grade fantasy adventure", queryFamily: "fantasy" },
    score: overrides.score || 12,
    matchedSignals: ["fantasy", "adventure"],
    rejectedReasons: [],
    scoreBreakdown: {
      genreFacetMatch: 3,
      positiveTasteMatch: 4,
      sourceQualityRelevance: 2,
      ageTeenSuitability: 0.8,
    },
    ...overrides.candidateOverrides,
  };
}

const genuineNovel = googleBookCandidate(
  "The Clockwork Cave",
  "A middle grade fantasy novel follows Mira and her friends as they discover a hidden cave, solve a puzzle, and face a dangerous magical adventure.",
  ["Juvenile Fiction / Fantasy & Magic", "Juvenile Fiction / Action & Adventure", "Middle grade fiction"],
);

const schoolPublication = googleBookCandidate(
  "School Publication",
  "A school publication featuring student writing, classroom reports, school news, and middle grade stories from a local institution.",
  ["Education / Schools", "Juvenile Nonfiction / School & Education"],
  { publisher: "School Publications Office", pageCount: 96, score: 14 },
);

const middleGradeSampler = googleBookCandidate(
  "Awesome Adventures for Kids Middle Grade Sampler",
  "A free middle grade sampler with preview chapters, excerpts, and sneak peeks from upcoming adventure books for young readers.",
  ["Juvenile Fiction / Action & Adventure", "Juvenile Fiction / Fantasy & Magic"],
  { publisher: "Kids Preview Press", pageCount: 64, score: 13 },
);

const narrativeSamplerName = googleBookCandidate(
  "The Sampler's Quest",
  "A middle grade fantasy novel follows Sampler, a clever apprentice, as she protects her friends and solves an ancient magical mystery.",
  ["Juvenile Fiction / Fantasy & Magic", "Juvenile Fiction / Action & Adventure"],
  { score: 11 },
);
const stateSchoolLibraryList = googleBookCandidate(
  "List of Books for School Libraries in the State of Wisconsin",
  "An institutional list of recommended books for school libraries, prepared for educators and library collections across the state.",
  ["Education / Library & Information Science", "Reference / Bibliographies"],
  { publisher: "Wisconsin Department of Public Instruction", pageCount: 128, score: 16 },
);

const highSchoolLibraryList = googleBookCandidate(
  "List of Books for High School Libraries of the State of Wisconsin",
  "A state school-library book list for high school library collections, classroom selection, and institutional purchasing.",
  ["Education / Secondary", "Reference / Bibliographies"],
  { publisher: "State Library Commission", pageCount: 144, score: 15 },
);

const narrativeSchoolTitle = googleBookCandidate(
  "The School of Hidden Stars",
  "A middle grade fantasy novel follows Lina through a mysterious school where she must solve a magical puzzle and save her friends.",
  ["Juvenile Fiction / Fantasy & Magic", "Juvenile Fiction / Action & Adventure"],
  { score: 10 },
);

const narrativeLibraryTitle = googleBookCandidate(
  "The Library at Moonlit Lake",
  "A middle grade adventure story follows two friends who discover a secret library, face a dangerous riddle, and protect a hidden world.",
  ["Juvenile Fiction / Action & Adventure", "Juvenile Fiction / Fantasy & Magic"],
  { score: 11 },
);

{
  const schoolAudit = preteenGoogleBooksPublicationIdentityAudit(schoolPublication);
  assertEqual(schoolAudit.identity, "school_publication", "School Publication should be identified as school publication");
  assertEqual(schoolAudit.allowed, false, "School Publication should be rejected by Pre-Teen Google Books identity");
  assertIncludes(schoolAudit.artifactEvidence, "school_publication_identity", "School Publication should expose school-publication evidence");
  assertIncludes(schoolAudit.overriddenNarrativeEvidence, "story_level_or_fiction_language", "School Publication should explain which narrative-looking evidence was overridden");

  const samplerAudit = preteenGoogleBooksPublicationIdentityAudit(middleGradeSampler);
  assertEqual(samplerAudit.identity, "sampler", "Middle Grade Sampler should be identified as sampler");
  assertEqual(samplerAudit.allowed, false, "Promotional sampler should be rejected by Pre-Teen Google Books identity");
  assertIncludes(samplerAudit.artifactEvidence, "sampler_title_with_preview_or_excerpt_metadata", "Sampler should expose preview/excerpt evidence");

  const narrativeAudit = preteenGoogleBooksPublicationIdentityAudit(narrativeSamplerName);
  assertEqual(narrativeAudit.allowed, true, "Narrative title containing Sampler's should not be rejected as a sampler");
  const stateLibraryListAudit = preteenGoogleBooksPublicationIdentityAudit(stateSchoolLibraryList);
  assertEqual(stateLibraryListAudit.identity, "institutional_library_list", "State school-library book list should be identified as institutional library list");
  assertEqual(stateLibraryListAudit.allowed, false, "State school-library book list should be rejected by Pre-Teen Google Books identity");
  assertIncludes(stateLibraryListAudit.artifactEvidence, "institutional_school_library_book_list_identity", "State school-library book list should expose institutional list evidence");

  const highSchoolLibraryListAudit = preteenGoogleBooksPublicationIdentityAudit(highSchoolLibraryList);
  assertEqual(highSchoolLibraryListAudit.identity, "institutional_library_list", "High-school library book list should be identified as institutional library list");
  assertEqual(highSchoolLibraryListAudit.allowed, false, "High-school library book list should be rejected by Pre-Teen Google Books identity");
  assertIncludes(highSchoolLibraryListAudit.artifactEvidence, "institutional_school_library_book_list_identity", "High-school library book list should expose institutional list evidence");

  const schoolNarrativeAudit = preteenGoogleBooksPublicationIdentityAudit(narrativeSchoolTitle);
  assertEqual(schoolNarrativeAudit.allowed, true, "Narrative title containing school should not be rejected as a school-library list");

  const libraryNarrativeAudit = preteenGoogleBooksPublicationIdentityAudit(narrativeLibraryTitle);
  assertEqual(libraryNarrativeAudit.allowed, true, "Narrative title containing library should not be rejected as a school-library list");
  console.log("PASS: Pre-Teen Google Books publication identity classifier explains artifact and narrative evidence");
}

{
  const selection = selectRecommendations([
    schoolPublication,
    middleGradeSampler,
    stateSchoolLibraryList,
    highSchoolLibraryList,
    genuineNovel,
    narrativeSamplerName,
    narrativeSchoolTitle,
    narrativeLibraryTitle,
  ], profile, 5);
  const selectedTitles = selection.selected.map((candidate) => candidate.title);
  assertIncludes(selectedTitles, "The Clockwork Cave", "Genuine middle-grade novel should remain selectable");
  assertIncludes(selectedTitles, "The Sampler's Quest", "Narrative title containing Sampler's should remain selectable");
  assertNotIncludes(selectedTitles, "School Publication", "School Publication should not reach the final Pre-Teen slate");
  assertNotIncludes(selectedTitles, "Awesome Adventures for Kids Middle Grade Sampler", "Promotional sampler should not reach the final Pre-Teen slate");
  assertNotIncludes(selectedTitles, "List of Books for School Libraries in the State of Wisconsin", "School-library book list should not reach the final Pre-Teen slate");
  assertNotIncludes(selectedTitles, "List of Books for High School Libraries of the State of Wisconsin", "High-school library book list should not reach the final Pre-Teen slate");

  const diagnostics = selection.rejectedReasons;
  assertEqual(
    diagnostics.preteenGoogleBooksPublicationDecisionByTitle?.["School Publication"],
    "rejected",
    "School Publication should have Pre-Teen publication rejection diagnostics",
  );
  assertEqual(
    diagnostics.preteenGoogleBooksPublicationReasonByTitle?.["School Publication"],
    "preteen_googlebooks_publication_identity_rejected_school_publication",
    "School Publication should expose stable rejection reason",
  );
  assertEqual(
    diagnostics.preteenGoogleBooksPublicationReasonByTitle?.["Awesome Adventures for Kids Middle Grade Sampler"],
    "preteen_googlebooks_publication_identity_rejected_sampler",
    "Sampler should expose stable rejection reason",
  );
  assertEqual(
    diagnostics.preteenGoogleBooksPublicationReasonByTitle?.["List of Books for School Libraries in the State of Wisconsin"],
    "preteen_googlebooks_publication_identity_rejected_institutional_library_list",
    "School-library book list should expose stable rejection reason",
  );
  assertEqual(
    diagnostics.preteenGoogleBooksPublicationReasonByTitle?.["List of Books for High School Libraries of the State of Wisconsin"],
    "preteen_googlebooks_publication_identity_rejected_institutional_library_list",
    "High-school library book list should expose stable rejection reason",
  );
  assertEqual(
    diagnostics.preteenGoogleBooksPublicationDecisionByTitle?.["The Clockwork Cave"],
    "selected",
    "Genuine middle-grade novel should have selected diagnostics",
  );
  const schoolControlSelection = selectRecommendations([schoolPublication, narrativeSchoolTitle], profile, 5);
  const schoolControlTitles = schoolControlSelection.selected.map((candidate) => candidate.title);
  assertIncludes(schoolControlTitles, "The School of Hidden Stars", "Narrative title containing school should remain selectable");
  assertNotIncludes(schoolControlTitles, "School Publication", "School Publication should still reject in the school-control slate");

  const libraryControlSelection = selectRecommendations([stateSchoolLibraryList, narrativeLibraryTitle], profile, 5);
  const libraryControlTitles = libraryControlSelection.selected.map((candidate) => candidate.title);
  assertIncludes(libraryControlTitles, "The Library at Moonlit Lake", "Narrative title containing library should remain selectable");
  assertNotIncludes(libraryControlTitles, "List of Books for School Libraries in the State of Wisconsin", "School-library book list should still reject in the library-control slate");
  console.log("PASS: Pre-Teen Google Books publication identity changes final slate only for hard impostors");
}

console.log("All Pre-Teen Google Books publication identity regressions passed.");
