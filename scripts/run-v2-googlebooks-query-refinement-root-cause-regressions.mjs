import {
  analyzeQueryPopulation,
  inferPrimaryCause,
  mapPublicationShapeBucket,
  sortQueriesForComparison,
} from "./lib/googlebooks-query-refinement-analysis.mjs";

function assertEqual(actual, expected, message) {
  if (actual !== expected) throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

function assertDeepEqual(actual, expected, message) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${message}: expected ${e}, got ${a}`);
}

assertEqual(mapPublicationShapeBucket("novel", []), "narrative_novel", "novel bucket");
assertEqual(mapPublicationShapeBucket("story_collection", []), "short_story_collection", "story collection bucket");
assertEqual(mapPublicationShapeBucket("anthology", []), "anthology", "anthology bucket");
assertEqual(
  mapPublicationShapeBucket("critical_study", ["Literary Criticism / Science Fiction"]),
  "literary_criticism",
  "literary criticism bucket",
);
assertEqual(mapPublicationShapeBucket("critical_study", ["Fiction"]), "critical_study", "critical study bucket");
assertEqual(mapPublicationShapeBucket("reference", []), "reference_work", "reference bucket");
assertEqual(mapPublicationShapeBucket("nonfiction", []), "nonfiction", "nonfiction bucket");
assertEqual(mapPublicationShapeBucket("unknown", []), "unknown_insufficient_narrative_identity", "unknown bucket");

const makeRow = (shape, pass = false, rejectionReason = "") => ({ shape, categories: [], isNarrativeCandidate: shape === "novel" || shape === "story_collection", publicationPass: pass, rejectionReason });

const baseline = analyzeQueryPopulation({
  family: "science_fiction",
  queryLabel: "current",
  query: "q0",
  rawRows: [
    makeRow("critical_study", false, "publication_shape_critical_study"),
    makeRow("writing_guide", false, "publication_shape_writing_guide"),
    makeRow("unknown", false, "publication_shape_unknown_insufficient_narrative_identity"),
    makeRow("novel", false, "missing_author"),
  ],
  classifyRow: (row) => row,
});
assertEqual(baseline.rawApiResults, 4, "raw count");
assertEqual(baseline.narrativeCandidates, 1, "narrative count");
assertEqual(baseline.publicationIdentityPasses, 0, "publication pass count");
assertEqual(baseline.dominantReject, "missing_author", "dominant reject alphabetical tiebreak");

const altBetter = analyzeQueryPopulation({
  family: "science_fiction",
  queryLabel: "alt_1",
  query: "q1",
  rawRows: [
    makeRow("novel", true),
    makeRow("novel", true),
    makeRow("story_collection", true),
    makeRow("critical_study", false, "publication_shape_critical_study"),
  ],
  classifyRow: (row) => row,
});
const altUnknown = analyzeQueryPopulation({
  family: "science_fiction",
  queryLabel: "alt_2",
  query: "q2",
  rawRows: [
    makeRow("unknown", false, "publication_shape_unknown_insufficient_narrative_identity"),
    makeRow("unknown", false, "publication_shape_unknown_insufficient_story_evidence"),
    makeRow("novel", false, "missing_author"),
  ],
  classifyRow: (row) => row,
});

const ranked = sortQueriesForComparison([baseline, altBetter, altUnknown]);
assertEqual(ranked[0].queryLabel, "alt_1", "ranking by publication pass then narrative yield");
assertEqual(inferPrimaryCause([baseline, altBetter, altUnknown]), "poor query wording", "query wording cause");
const strictBaseline = analyzeQueryPopulation({
  family: "science_fiction",
  queryLabel: "current",
  query: "q-strict",
  rawRows: [
    makeRow("unknown", false, "publication_shape_unknown_insufficient_narrative_identity"),
    makeRow("unknown", false, "publication_shape_unknown_insufficient_story_evidence"),
    makeRow("unknown", false, "publication_shape_unknown_insufficient_narrative_identity"),
    makeRow("novel", false, "missing_author"),
  ],
  classifyRow: (row) => row,
});
assertEqual(inferPrimaryCause([strictBaseline, altUnknown]), "overly strict publication-identity rules", "strict rules cause");

const allLowA = analyzeQueryPopulation({
  family: "general",
  queryLabel: "current",
  query: "q3",
  rawRows: [makeRow("critical_study", false, "publication_shape_critical_study"), makeRow("reference", false, "publication_shape_reference")],
  classifyRow: (row) => row,
});
const allLowB = analyzeQueryPopulation({
  family: "general",
  queryLabel: "alt_1",
  query: "q4",
  rawRows: [makeRow("critical_study", false, "publication_shape_critical_study"), makeRow("reference", false, "publication_shape_reference")],
  classifyRow: (row) => row,
});
assertEqual(inferPrimaryCause([allLowA, allLowB]), "google books catalog bias", "catalog bias cause");

assertDeepEqual(
  baseline.publicationShapeDistributionCount,
  {
    narrative_novel: 1,
    short_story_collection: 0,
    anthology: 0,
    critical_study: 1,
    literary_criticism: 0,
    writing_guide: 1,
    reference_work: 0,
    nonfiction: 0,
    unknown_insufficient_narrative_identity: 1,
    other: 0,
  },
  "distribution counts",
);

console.log(JSON.stringify({
  name: "googlebooks-query-refinement-root-cause-regressions",
  pass: true,
  ranked: ranked.map((row) => ({ queryLabel: row.queryLabel, publicationIdentityPasses: row.publicationIdentityPasses, narrativeYield: row.narrativeYield })),
}, null, 2));
