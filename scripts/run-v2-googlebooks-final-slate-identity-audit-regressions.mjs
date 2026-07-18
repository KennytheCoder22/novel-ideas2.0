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

function assertNotIncludes(values, expected, message) {
  if (Array.isArray(values) && values.includes(expected)) {
    throw new Error(`${message}: expected ${JSON.stringify(values)} not to include ${JSON.stringify(expected)}`);
  }
}

function assertTruthy(value, message) {
  if (!value) throw new Error(`${message}: expected truthy, got ${JSON.stringify(value)}`);
}

const {
  adultGoogleBooksFinalSlateIdentityAudit,
  adultGoogleBooksIdentityEnforcement,
  selectRecommendations,
} = require(resolve("app/recommender-v2/select.ts"));

function candidate({
  id,
  title,
  subtitle = "",
  description,
  categories,
  publisher = "Regression House",
  authors = ["Regression Author"],
  shape = "novel",
  storyEvidence = ["story_level_description"],
  score = 8,
  likedSignals = ["mystery", "thriller"],
  dislikedSignals = [],
}) {
  return {
    id: `googleBooks:${id}`,
    source: "googleBooks",
    sourceId: id,
    title,
    subtitle,
    creators: authors,
    description,
    formats: ["book"],
    genres: categories,
    themes: [],
    tones: [],
    characterDynamics: [],
    publicationYear: 2022,
    sourceUrl: "",
    raw: {
      id,
      volumeInfo: {
        title,
        subtitle,
        authors,
        description,
        categories,
        publisher,
        publishedDate: "2022",
        pageCount: 320,
        printType: "BOOK",
        language: "en",
        industryIdentifiers: [{ type: "ISBN_13", identifier: "9780000000000" }],
      },
    },
    diagnostics: {
      googleBooksPublicationShape: shape,
      googleBooksPublicationShapeEvidence: shape === "novel" ? ["novel_or_narrative_fiction_shape"] : [`${shape}_fixture`],
      googleBooksPublicationShapePrecedenceDecision: shape === "novel"
        ? "novel_supported_by_story_level_evidence"
        : `${shape}_identity_overrides_narrative_signals`,
      googleBooksStoryLevelNarrativeEvidence: storyEvidence,
      googleBooksNarrativeConfidence: 0.8,
      positiveTasteScore: 4,
      sourceQualityScore: 2,
      metadataBackedMatchedLikedSignals: likedSignals,
      metadataBackedMatchedDislikedSignals: dislikedSignals,
    },
    score,
    matchedSignals: likedSignals,
    rejectedReasons: [],
    scoreBreakdown: {
      genreFacetMatch: 2,
      positiveTasteMatch: 4,
      sourceQualityRelevance: 2,
      avoidSignalPenalty: 0,
      broadAvoidSignalPenalty: 0,
    },
  };
}

function eligibility(allowed, reason) {
  return {
    allowed,
    reason,
    artifactReasons: [],
    referenceSurveyReasons: [],
    encyclopediaReferenceReasons: [],
    multiVolumeReferenceCorroboration: [],
    annualAnthologyReasons: [],
    anthologyCorroboration: [],
    instructionalCraftReasons: [],
    narrativeEvidence: allowed ? ["story_level_description"] : [],
    credibleFictionSignals: allowed ? ["fiction_category"] : [],
    workIdentitySignals: allowed ? ["novel_identity"] : [],
    documentBackedLikedSignals: allowed ? ["mystery", "thriller"] : [],
    documentBackedDislikedSignals: [],
    positiveNetTasteFamilies: allowed ? ["mystery_crime_thriller"] : [],
    meaningfulTastePassed: allowed,
    meaningfulTasteFailureReason: allowed ? "" : reason,
    strongNarrativeOverrideBlockedByTaste: false,
    sourceQualityScore: 2,
    sourceQualityFailureReasons: [],
    strongNarrativeOverrideApplied: false,
    periodicalCorroboration: [],
    allCandidateTasteFamilies: allowed ? ["mystery_crime_thriller"] : [],
    negativeNetTasteFamilies: [],
    tasteEvidenceSource: "metadata",
    likedSignalCount: allowed ? 2 : 0,
    threshold: "default",
    specificToneThemeLikedSignals: [],
    broadToneLikedSignals: [],
    contextOnlyLikedSignals: [],
    productionDecisionReason: "",
    canonicalNarrativeFamilyPromotions: [],
    canonicalMissingFamilyBefore: [],
    canonicalMissingFamilyAfter: [],
  };
}

const cases = [
  {
    name: "food criticism",
    expected: "literary_criticism_or_subject_study",
    candidate: candidate({
      id: "food-atwood",
      title: "Food in Margaret Atwood's Speculative Fiction",
      description: "A critical study examining food, politics, and identity in Margaret Atwood's speculative fiction, with scholarly analysis of her novels.",
      categories: ["Literary Criticism / Women Authors", "Literary Criticism / Science Fiction & Fantasy"],
      publisher: "Critical Studies Press",
      shape: "novel",
    }),
  },
  {
    name: "greatest books collection",
    expected: "omnibus_or_boxed_collection",
    candidate: candidate({
      id: "greatest-verne",
      title: "The Greatest Adventure Books of All Time - Jules Verne Collection",
      description: "A collected bundle of classic adventure books and novels by Jules Verne.",
      categories: ["Fiction / Action & Adventure", "Fiction / Classics"],
      publisher: "Classic Collections",
      shape: "novel",
    }),
  },
  {
    name: "mammoth annual anthology",
    expected: "best_of_or_annual_collection",
    candidate: candidate({
      id: "mammoth-horror",
      title: "The Mammoth Book of Best New Horror 11",
      description: "An annual anthology of the year's best new horror stories, edited by a leading genre editor and featuring multiple contributors.",
      categories: ["Fiction / Horror", "Fiction / Anthologies"],
      shape: "novel",
    }),
  },
  {
    name: "normal novel with reviews",
    expected: "individual_narrative_work",
    candidate: candidate({
      id: "reviewed-novel",
      title: "The River House",
      description: "A psychological thriller follows a detective returning home to uncover a murder and confront a family secret. Reviewers call it gripping.",
      categories: ["Fiction / Thrillers / Psychological", "Fiction / Mystery & Detective"],
      shape: "novel",
    }),
  },
  {
    name: "numbered series novel",
    expected: "narrative_series_volume",
    candidate: candidate({
      id: "series-book-2",
      title: "Dark Harbor (A Mara Vale Mystery - Book 2)",
      description: "Detective Mara Vale investigates a coastal murder in the second novel of a suspense series.",
      categories: ["Fiction / Mystery & Detective", "Fiction / Thrillers / Suspense"],
      shape: "novel",
    }),
  },
  {
    name: "short story collection",
    expected: "short_story_collection",
    candidate: candidate({
      id: "short-stories",
      title: "Night Roads: A Short Story Collection",
      description: "A short story collection of eerie tales about lonely roads, hidden crimes, and haunted towns.",
      categories: ["Fiction / Short Stories", "Fiction / Horror"],
      shape: "novel",
    }),
  },
];

const identityEnforcementCases = [
  {
    name: "ordinary novel still passes",
    expectedIdentity: "individual_narrative_work",
    expectedDecision: "accepted",
    candidate: candidate({
      id: "enforce-novel",
      title: "The River House",
      description: "A psychological thriller follows a detective returning home to uncover a murder and confront a family secret.",
      categories: ["Fiction / Thrillers / Psychological", "Fiction / Mystery & Detective"],
      authors: ["Regression Author One"],
      shape: "novel",
    }),
  },
  {
    name: "series volume still passes",
    expectedIdentity: "narrative_series_volume",
    expectedDecision: "accepted",
    candidate: candidate({
      id: "enforce-series",
      title: "Dark Harbor (A Mara Vale Mystery - Book 2)",
      description: "Detective Mara Vale investigates a coastal murder in the second novel of a suspense series.",
      categories: ["Fiction / Mystery & Detective", "Fiction / Thrillers / Suspense"],
      authors: ["Regression Author Two"],
      shape: "novel",
    }),
  },
  {
    name: "omnibus now rejected",
    expectedIdentity: "omnibus_or_boxed_collection",
    expectedDecision: "rejected",
    candidate: candidate({
      id: "enforce-omnibus",
      title: "The Greatest Adventure Books of All Time - Jules Verne Collection",
      description: "A collected bundle of classic adventure books and novels by Jules Verne.",
      categories: ["Fiction / Action & Adventure", "Fiction / Classics"],
      publisher: "Classic Collections",
      shape: "novel",
    }),
  },
  {
    name: "boxed collection now rejected",
    expectedIdentity: "omnibus_or_boxed_collection",
    expectedDecision: "rejected",
    candidate: candidate({
      id: "enforce-boxed",
      title: "The Shadow Case Files Boxed Omnibus Collection",
      description: "A boxed omnibus collection bundling the first three mystery novels in the Shadow Case Files series.",
      categories: ["Fiction / Mystery & Detective", "Fiction / Collections"],
      publisher: "Bundle Press",
      shape: "novel",
    }),
  },
  {
    name: "best-of collection rejected",
    expectedIdentity: "best_of_or_annual_collection",
    expectedDecision: "rejected",
    candidate: candidate({
      id: "enforce-best-of",
      title: "The Mammoth Book of Best New Horror 11",
      description: "An annual anthology of the year's best new horror stories, edited by a leading genre editor and featuring multiple contributors.",
      categories: ["Fiction / Horror", "Fiction / Anthologies"],
      shape: "novel",
    }),
  },
  {
    name: "literary criticism rejected",
    expectedIdentity: "literary_criticism_or_subject_study",
    expectedDecision: "rejected",
    candidate: candidate({
      id: "enforce-criticism",
      title: "Food in Margaret Atwood's Speculative Fiction",
      description: "A critical study examining food, politics, and identity in Margaret Atwood's speculative fiction, with scholarly analysis of her novels.",
      categories: ["Literary Criticism / Women Authors", "Literary Criticism / Science Fiction & Fantasy"],
      publisher: "Critical Studies Press",
      shape: "novel",
    }),
  },
  {
    name: "subject study rejected",
    expectedIdentity: "literary_criticism_or_subject_study",
    expectedDecision: "rejected",
    candidate: candidate({
      id: "enforce-subject-study",
      title: "Alienation, Apocalypse and the Postmodern Condition in I Am Legend by Richard Matheson",
      description: "A scholarly analysis of alienation, apocalypse, and postmodern themes in Richard Matheson's novel.",
      categories: ["Literary Criticism / Science Fiction & Fantasy", "Literary Criticism / American"],
      publisher: "Critical Studies Press",
      shape: "novel",
    }),
  },
  {
    name: "unknown identity unchanged",
    expectedIdentity: "identity_uncertain",
    expectedDecision: "unchanged",
    candidate: candidate({
      id: "enforce-unknown",
      title: "Unclear Metadata Record",
      description: "Sparse metadata without clear story or publication identity.",
      categories: ["Fiction"],
      shape: "unknown",
      storyEvidence: [],
    }),
  },
];

for (const row of cases) {
  const audit = adultGoogleBooksFinalSlateIdentityAudit(row.candidate, {
    eligibility: eligibility(true, "adult_googlebooks_final_eligible"),
    finalEligibilityDecision: "accepted",
    finalEligibilityReason: "adult_googlebooks_final_eligible",
    finalSelectionDecision: "selected",
    rendered: true,
  });
  assertEqual(audit.identity, row.expected, `${row.name} identity`);
  assertTruthy(audit.confidence > 0.6, `${row.name} should have useful confidence`);
}

const enforcementResults = {};
for (const row of identityEnforcementCases) {
  const audit = adultGoogleBooksFinalSlateIdentityAudit(row.candidate, {
    eligibility: eligibility(true, "adult_googlebooks_final_eligible"),
    finalEligibilityDecision: "accepted",
    finalEligibilityReason: "adult_googlebooks_final_eligible",
    finalSelectionDecision: "selected",
    rendered: true,
  });
  const enforcement = adultGoogleBooksIdentityEnforcement(row.candidate, eligibility(true, "adult_googlebooks_final_eligible"));
  assertEqual(audit.identity, row.expectedIdentity, `${row.name} identity`);
  assertEqual(enforcement.decision, row.expectedDecision, `${row.name} enforcement decision`);
  enforcementResults[row.candidate.title] = {
    identity: audit.identity,
    decision: enforcement.decision,
    reason: enforcement.reason,
  };
}

const edgeLike = candidate({
  id: "edge-dark-water",
  title: "Edge of Dark Water",
  description: "A dark psychological thriller follows three friends who discover a body and flee downriver while a killer follows them.",
  categories: ["Fiction / Thrillers / Psychological", "Fiction / Mystery & Detective"],
  shape: "unknown",
  storyEvidence: ["plot_setup_description"],
  likedSignals: [],
});
const edgeAudit = adultGoogleBooksFinalSlateIdentityAudit(edgeLike, {
  eligibility: eligibility(false, "adult_googlebooks_missing_meaningful_document_taste_alignment"),
  finalEligibilityDecision: "rejected",
  finalEligibilityReason: "adult_googlebooks_missing_meaningful_document_taste_alignment",
  finalSelectionDecision: "",
  rendered: false,
});
assertEqual(edgeAudit.identity, "individual_narrative_work", "Edge-of-Dark-Water-shaped candidate should audit as narrative");
assertEqual(edgeAudit.agreement, "likely_narrative_false_reject", "Edge-of-Dark-Water-shaped candidate should flag likely narrative false reject");

const stableCandidate = candidate({
  id: "stable-output",
  title: "Stable Output Candidate",
  description: "A mystery thriller follows a detective through a dangerous investigation.",
  categories: ["Fiction / Mystery & Detective", "Fiction / Thrillers / Suspense"],
});
const profile = {
  ageBand: "adult",
  genreFamily: [{ value: "mystery", weight: 1 }, { value: "thriller", weight: 1 }],
  tone: [],
  themes: [],
  characterDynamics: [],
  formatPreference: [],
  avoidSignals: [],
  diagnostics: {},
};
const beforeAuditSelected = selectRecommendations([stableCandidate], profile, 5).selected.map((item) => item.title);
adultGoogleBooksFinalSlateIdentityAudit(stableCandidate, {
  eligibility: eligibility(true, "adult_googlebooks_final_eligible"),
  finalEligibilityDecision: "accepted",
  finalSelectionDecision: "selected",
  rendered: true,
});
const afterAuditSelected = selectRecommendations([stableCandidate], profile, 5).selected.map((item) => item.title);
assertEqual(JSON.stringify(afterAuditSelected), JSON.stringify(beforeAuditSelected), "audit helper must not alter recommendation output");
assertIncludes(beforeAuditSelected, "Stable Output Candidate", "stable candidate should remain selected");

const selectedWithIdentityEnforcement = selectRecommendations(
  [
    identityEnforcementCases[0].candidate,
    identityEnforcementCases[1].candidate,
    identityEnforcementCases[2].candidate,
    identityEnforcementCases[3].candidate,
    identityEnforcementCases[4].candidate,
    identityEnforcementCases[5].candidate,
    identityEnforcementCases[6].candidate,
  ],
  profile,
  10,
).selected.map((item) => item.title);
assertIncludes(selectedWithIdentityEnforcement, "The River House", "ordinary novel should remain selectable");
assertIncludes(selectedWithIdentityEnforcement, "Dark Harbor (A Mara Vale Mystery - Book 2)", "series volume should remain selectable");
assertNotIncludes(selectedWithIdentityEnforcement, "The Greatest Adventure Books of All Time - Jules Verne Collection", "omnibus should be rejected by identity enforcement");
assertNotIncludes(selectedWithIdentityEnforcement, "The Shadow Case Files Boxed Omnibus Collection", "boxed collection should be rejected by identity enforcement");
assertNotIncludes(selectedWithIdentityEnforcement, "The Mammoth Book of Best New Horror 11", "best-of collection should be rejected by identity enforcement");
assertNotIncludes(selectedWithIdentityEnforcement, "Food in Margaret Atwood's Speculative Fiction", "literary criticism should be rejected by identity enforcement");
assertNotIncludes(selectedWithIdentityEnforcement, "Alienation, Apocalypse and the Postmodern Condition in I Am Legend by Richard Matheson", "subject study should be rejected by identity enforcement");

console.log(JSON.stringify({
  name: "adult google books final-slate identity audit regressions",
  pass: true,
  identities: Object.fromEntries(cases.map((row) => [row.candidate.title, row.expected])),
  identityEnforcement: enforcementResults,
  identityEnforcementSelectedTitles: selectedWithIdentityEnforcement,
  edgeAgreement: edgeAudit.agreement,
  stableSelected: afterAuditSelected,
}, null, 2));
