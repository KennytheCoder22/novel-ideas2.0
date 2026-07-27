/** D2 certification closure: Pre-Teen Google Books admission contract. */
import { spawnSync } from "node:child_process";
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
  if (actual !== expected) throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
function assertTrue(value, message) {
  if (!value) throw new Error(`${message}: expected truthy, got ${JSON.stringify(value)}`);
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

function runSuite(scriptPath) {
  const child = spawnSync(process.execPath, [scriptPath], { encoding: "utf8", stdio: "pipe" });
  if (child.status !== 0) {
    throw new Error(`Suite failed: ${scriptPath}\n${child.stdout || ""}\n${child.stderr || ""}`);
  }
  return {
    script: scriptPath,
    status: "pass",
    stdoutTail: String(child.stdout || "").trim().split(/\r?\n/).slice(-12),
  };
}

const v2Dir = resolve("app/recommender-v2");
const { selectRecommendations } = require(resolve(v2Dir, "select.ts"));
const { preteenGoogleBooksPublicationIdentityAudit } = require(resolve(v2Dir, "preteenGoogleBooksPublicationIdentity.ts"));
const { applyPreteenGoogleBooksPublicationIdentityPreScoringGate } = require(resolve(v2Dir, "engine.ts"));

const prerequisiteSuites = [
  "scripts/run-v2-googlebooks-preteen-publication-identity-regressions.mjs",
  "scripts/run-v2-googlebooks-preteen-publication-shape-narrative-rescue-regressions.mjs",
];
const prerequisiteResults = prerequisiteSuites.map(runSuite);

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

const schoolPublication = googleBookCandidate(
  "School Publication",
  "A school publication featuring student writing, classroom reports, and school news.",
  ["Education / Schools", "Juvenile Nonfiction / School & Education"],
  { publisher: "School Publications Office", pageCount: 96, score: 14 },
);
const middleGradeSampler = googleBookCandidate(
  "Awesome Adventures for Kids Middle Grade Sampler",
  "A free middle grade sampler with preview chapters and sneak peeks.",
  ["Juvenile Fiction / Action & Adventure", "Juvenile Fiction / Fantasy & Magic"],
  { publisher: "Kids Preview Press", pageCount: 64, score: 13 },
);
const stateSchoolLibraryList = googleBookCandidate(
  "List of Books for School Libraries in the State of Wisconsin",
  "An institutional list of recommended books for school libraries.",
  ["Education / Library & Information Science", "Reference / Bibliographies"],
  { publisher: "Wisconsin Department of Public Instruction", pageCount: 128, score: 16 },
);
const goldStarList = googleBookCandidate(
  "Gold Star List of American Fiction",
  "A selective survey recommending notable works for readers and libraries.",
  ["Fiction"],
);
const genuineNovel = googleBookCandidate(
  "The Clockwork Cave",
  "A middle grade fantasy novel follows Mira and her friends as they discover a hidden cave and solve a magical mystery.",
  ["Juvenile Fiction / Fantasy & Magic", "Juvenile Fiction / Action & Adventure", "Middle grade fiction"],
);

const coverageRows = [];
const coveredReasonCodes = new Set();
const declaredButUnreached = [];

function row(gate, fixture, expected, observed, assertion, status = "covered") {
  coverageRows.push({ gate, fixture, expected, observed, assertion, status });
}

{
  const schoolAudit = preteenGoogleBooksPublicationIdentityAudit(schoolPublication);
  assertEqual(schoolAudit.reason, "preteen_googlebooks_publication_identity_rejected_school_publication", "School publication reason should be stable");
  coveredReasonCodes.add(schoolAudit.reason);
  row("preteen_publication_identity_classifier", schoolPublication.title, "preteen_googlebooks_publication_identity_rejected_school_publication", schoolAudit.reason, "school publication classifier reason");

  const samplerAudit = preteenGoogleBooksPublicationIdentityAudit(middleGradeSampler);
  assertEqual(samplerAudit.reason, "preteen_googlebooks_publication_identity_rejected_sampler", "Sampler reason should be stable");
  coveredReasonCodes.add(samplerAudit.reason);
  row("preteen_publication_identity_classifier", middleGradeSampler.title, "preteen_googlebooks_publication_identity_rejected_sampler", samplerAudit.reason, "sampler classifier reason");

  const institutionalAudit = preteenGoogleBooksPublicationIdentityAudit(stateSchoolLibraryList);
  assertEqual(institutionalAudit.reason, "preteen_googlebooks_publication_identity_rejected_institutional_library_list", "Institutional library list reason should be stable");
  coveredReasonCodes.add(institutionalAudit.reason);
  row("preteen_publication_identity_classifier", stateSchoolLibraryList.title, "preteen_googlebooks_publication_identity_rejected_institutional_library_list", institutionalAudit.reason, "institutional list classifier reason");

  const catalogAudit = preteenGoogleBooksPublicationIdentityAudit(goldStarList);
  assertEqual(catalogAudit.reason, "preteen_googlebooks_publication_identity_rejected_catalog", "Catalog reason should be stable");
  coveredReasonCodes.add(catalogAudit.reason);
  row("preteen_publication_identity_classifier", goldStarList.title, "preteen_googlebooks_publication_identity_rejected_catalog", catalogAudit.reason, "catalog classifier reason");
}

{
  const gateInput = [middleGradeSampler, schoolPublication, stateSchoolLibraryList, genuineNovel];
  const preteenGate = applyPreteenGoogleBooksPublicationIdentityPreScoringGate(gateInput, profile);
  const entered = preteenGate.candidates.map((candidate) => candidate.title);
  assertNotIncludes(entered, middleGradeSampler.title, "Sampler should be removed before scoring");
  assertNotIncludes(entered, schoolPublication.title, "School publication should be removed before scoring");
  assertNotIncludes(entered, stateSchoolLibraryList.title, "Institutional list should be removed before scoring");
  assertIncludes(entered, genuineNovel.title, "Genuine narrative should enter scoring");
  row("preteen_pre_scoring_gate", "preteen gate input set", "artifact fixtures rejected, narrative control allowed", "artifact fixtures rejected, narrative control allowed", "pre-scoring boundary behaves as expected");

  const otherProfiles = ["kids", "teens", "adult"];
  for (const ageBand of otherProfiles) {
    const bypass = applyPreteenGoogleBooksPublicationIdentityPreScoringGate(gateInput, { ...profile, ageBand, maturityBand: ageBand });
    assertIncludes(bypass.candidates.map((candidate) => candidate.title), middleGradeSampler.title, `${ageBand} should bypass preteen-only enforcement`);
  }
  row("preteen_scope_guard", "non-preteen profiles", "preteen gate bypassed", "preteen gate bypassed", "scope isolation preserved");
}

{
  const selection = selectRecommendations([schoolPublication, middleGradeSampler, stateSchoolLibraryList, genuineNovel], profile, 3);
  const selectedTitles = selection.selected.map((candidate) => candidate.title);
  assertIncludes(selectedTitles, genuineNovel.title, "Narrative control should survive to selection");
  assertNotIncludes(selectedTitles, schoolPublication.title, "School publication should not survive selection");
  row("preteen_selection_outcome", "selection control slate", "narrative selected, impostors excluded", "narrative selected, impostors excluded", "downstream selection maintains gate decisions");
}

// Rescue coverage is asserted by the prerequisite rescue suite.
const rescueCoveredBySuite = [
  "preteen_unknown_shape_rescued_by_corroborated_narrative_identity",
  "hard_artifact_evidence_present",
  "preteen_identity_not_rescuable_narrative",
];
for (const reason of rescueCoveredBySuite) coveredReasonCodes.add(reason);
row("preteen_unknown_shape_rescue", "suite:run-v2-googlebooks-preteen-publication-shape-narrative-rescue-regressions", "rescue and reject branches asserted", "pass", "source rescue applied/rejected branches and downstream scoring/selection outcomes asserted");

const requiredReasons = [
  "preteen_googlebooks_publication_identity_rejected_school_publication",
  "preteen_googlebooks_publication_identity_rejected_sampler",
  "preteen_googlebooks_publication_identity_rejected_institutional_library_list",
  "preteen_googlebooks_publication_identity_rejected_catalog",
  "preteen_unknown_shape_rescued_by_corroborated_narrative_identity",
  "hard_artifact_evidence_present",
  "preteen_identity_not_rescuable_narrative",
];
const uncoveredReasons = requiredReasons.filter((reason) => !coveredReasonCodes.has(reason));
assertEqual(uncoveredReasons.length, 0, "D2 uncovered reason-code paths must be empty");

const declaredNotDirectlyAsserted = [
  "not_rescuable_unknown_shape_reason",
  "preteen_identity_classifier_rejected",
  "title_only_or_no_substantive_narrative_metadata",
  "fewer_than_two_independent_evidence_families",
];
for (const reason of declaredNotDirectlyAsserted) {
  declaredButUnreached.push({
    reasonCode: reason,
    status: "declared_but_not_directly_asserted_in_d2_baseline",
    note: "No deterministic fixture in D2 baseline suite currently asserts this branch directly.",
  });
}

const summary = {
  suite: "d2-preteen-googlebooks-certification-regressions",
  pass: true,
  prerequisiteSuites: prerequisiteResults,
  requiredReasonCount: requiredReasons.length,
  uncoveredReasons,
  declaredButUnreached,
  coverageRows,
};

console.log("PASS: D2 Pre-Teen Google Books certification regressions");
console.log(JSON.stringify(summary, null, 2));
