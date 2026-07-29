import { buildRecallEfficiencyReportFromQueryRows } from "./lib/googlebooks-recall-efficiency.mjs";

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertDeepEqual(actual, expected, message) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    throw new Error(`${message}: expected ${e}, got ${a}`);
  }
}

function familyRow(rows, family) {
  const row = rows.find((entry) => entry.queryFamily === family);
  if (!row) throw new Error(`Missing family row: ${family}`);
  return row;
}

const queryRows = [
  {
    report: "r1",
    family: "science_fiction",
    query: "young adult science fiction novel",
    rawApiResults: 20,
    narrativeCandidates: 2,
    publicationIdentityPasses: 0,
    scoredCandidates: 0,
    selectedRecommendations: 0,
    publicationShapeRejectionHistogram: { critical_study: 8, reference: 2 },
    rejectionReasonHistogram: { publication_shape_critical_study: 8, publication_shape_reference: 2 },
  },
  {
    report: "r2",
    family: "science_fiction",
    query: "ya sci fi books",
    rawApiResults: 10,
    narrativeCandidates: 1,
    publicationIdentityPasses: 0,
    scoredCandidates: 0,
    selectedRecommendations: 0,
    publicationShapeRejectionHistogram: { writing_guide: 3 },
    rejectionReasonHistogram: { publication_shape_writing_guide: 3 },
  },
  {
    report: "r1",
    family: "mystery",
    query: "young adult mystery fiction novel",
    rawApiResults: 20,
    narrativeCandidates: 8,
    publicationIdentityPasses: 4,
    scoredCandidates: 4,
    selectedRecommendations: 3,
    publicationShapeRejectionHistogram: { reference: 3 },
    rejectionReasonHistogram: { publication_shape_reference: 3 },
  },
  {
    report: "r1",
    family: "literary",
    query: "young adult literary fiction novel",
    rawApiResults: 20,
    narrativeCandidates: 1,
    publicationIdentityPasses: 1,
    scoredCandidates: 1,
    selectedRecommendations: 1,
    publicationShapeRejectionHistogram: { unknown: 8 },
    rejectionReasonHistogram: {
      publication_shape_unknown_insufficient_story_evidence: 6,
      publication_shape_unknown_insufficient_narrative_identity: 4,
    },
  },
  {
    report: "r1",
    family: "horror",
    query: "young adult horror fiction novel",
    rawApiResults: 20,
    narrativeCandidates: 12,
    publicationIdentityPasses: 2,
    scoredCandidates: 2,
    selectedRecommendations: 2,
    publicationShapeRejectionHistogram: { anthology: 5 },
    rejectionReasonHistogram: { publication_shape_anthology: 5 },
  },
  {
    report: "r1",
    family: "fantasy",
    query: "young adult fantasy fiction novel",
    rawApiResults: 20,
    narrativeCandidates: 18,
    publicationIdentityPasses: 16,
    scoredCandidates: 2,
    selectedRecommendations: 2,
    publicationShapeRejectionHistogram: { reference: 1 },
    rejectionReasonHistogram: { publication_shape_reference: 1 },
  },
  {
    report: "r1",
    family: "thriller",
    query: "young adult thriller fiction novel",
    rawApiResults: 20,
    narrativeCandidates: 20,
    publicationIdentityPasses: 20,
    scoredCandidates: 20,
    selectedRecommendations: 2,
    publicationShapeRejectionHistogram: { critical_study: 1 },
    rejectionReasonHistogram: { publication_shape_critical_study: 1 },
  },
];

const report = buildRecallEfficiencyReportFromQueryRows(queryRows);
const rows = report.familyRows;

assertEqual(rows.length, 6, "family grouping count");

const science = familyRow(rows, "science_fiction");
assertEqual(science.rawApiResults, 30, "science raw aggregate");
assertEqual(science.queryCount, 2, "science query count");
assertEqual(science.narrativeCandidates, 3, "science narrative aggregate");
assertEqual(science.publicationIdentityPasses, 0, "science publication pass aggregate");
assertEqual(science.selectedRecommendations, 0, "science selected aggregate");
assertDeepEqual(
  science.publicationShapeRejectionHistogram,
  { critical_study: 8, reference: 2, writing_guide: 3 },
  "science rejection histogram stable",
);
assertEqual(science.dominantRejectionReason, "publication_shape_critical_study", "science dominant rejection");
assertEqual(science.likelyAction, "Query refinement", "science likely action");

const literary = familyRow(rows, "literary");
assertEqual(literary.likelyAction, "Narrative extraction refinement", "literary likely action");

const horror = familyRow(rows, "horror");
assertEqual(horror.likelyAction, "Publication identity refinement", "horror likely action");

const fantasy = familyRow(rows, "fantasy");
assertEqual(fantasy.likelyAction, "Scoring refinement", "fantasy likely action");

const thriller = familyRow(rows, "thriller");
assertEqual(thriller.likelyAction, "Selection refinement", "thriller likely action");

const mystery = familyRow(rows, "mystery");
assertEqual(mystery.likelyAction, "No action", "mystery likely action");
assertEqual(mystery.narrativeYield, 40, "mystery narrative yield");
assertEqual(mystery.publicationSurvival, 50, "mystery publication survival");
assertEqual(mystery.selectionEfficiency, 75, "mystery selection efficiency");
assertEqual(mystery.overallRecallEfficiency, 15, "mystery overall recall efficiency");

console.log(JSON.stringify({
  name: "googlebooks-recall-efficiency-regressions",
  pass: true,
  totals: report.totals,
  summaryByRecallLoss: report.summaryByRecallLoss,
}, null, 2));
