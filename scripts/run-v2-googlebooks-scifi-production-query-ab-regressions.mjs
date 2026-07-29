import { compareVariantRows, extractProductionMetrics } from "./lib/googlebooks-scifi-production-ab.mjs";

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}\nExpected: ${JSON.stringify(expected)}\nActual: ${JSON.stringify(actual)}`);
  }
}

function assertDeepEqual(actual, expected, message) {
  const actualText = JSON.stringify(actual);
  const expectedText = JSON.stringify(expected);
  if (actualText !== expectedText) {
    throw new Error(`${message}\nExpected: ${expectedText}\nActual: ${actualText}`);
  }
}

const mockResult = {
  items: [
    { title: "Skyward", score: 7.1 },
    { title: "Cinder", score: 6.5 },
    { title: "Legend", score: 6.2 },
  ],
  diagnostics: {
    stages: [{ stage: "scored", counts: { scored: 8 } }],
    sources: [{
      source: "googleBooks",
      fetches: [
        { query: "young adult science fiction novel", queryCascadeIndex: 0, status: "succeeded", rawApiCount: 20, acceptedAfterSourcePolicy: 3 },
        { query: "young adult mystery novel", queryCascadeIndex: 1, status: "succeeded", rawApiCount: 20, acceptedAfterSourcePolicy: 2 },
      ],
      googleBooksRejectedCountByQueryAndReason: {
        "young adult science fiction novel": {
          gb_publication_shape_nonfiction: 6,
          gb_publication_shape_reference: 2,
          missing_author: 1,
        },
      },
      googleBooksQueryResultQualityByQuery: {
        "young adult science fiction novel": {
          enteredRankingCount: 4,
        },
      },
      googleBooksQueryByTitle: {
        Skyward: "young adult science fiction novel",
        Cinder: "young adult science fiction novel",
        Legend: "young adult mystery novel",
      },
    }],
  },
};

const baseline = extractProductionMetrics({
  variant: "baseline",
  profileId: "fixture",
  profileLabel: "Fixture profile",
  result: mockResult,
  limit: 6,
});

assertEqual(baseline.rawApiCount, 20, "primary raw count should map from primary fetch");
assertEqual(baseline.acceptedAfterSourcePolicy, 3, "primary accepted count should map from primary fetch");
assertEqual(baseline.scoredCandidates, 4, "scored candidates should come from query quality row");
assertEqual(baseline.totalScoredCandidates, 8, "total scored should come from scored stage");
assertEqual(baseline.selectedFromPrimaryQuery, 2, "selected-from-primary count should use query-by-title");
assertDeepEqual(
  baseline.publicationShapeDropHistogram,
  {
    gb_publication_shape_nonfiction: 6,
    gb_publication_shape_reference: 2,
  },
  "publication-shape histogram should keep only publication-shape reasons",
);

const candidate = {
  ...baseline,
  variant: "candidate",
  acceptedAfterSourcePolicy: 6,
  scoredCandidates: 6,
  selectedRecommendations: 4,
  fallbackUsed: false,
  finalRecommendationQuality: { averageScore: 6.7, minScore: 6.1, maxScore: 7.4 },
  primaryQuery: "\"young adult\" dystopian novel",
};

const comparison = compareVariantRows(baseline, candidate);
assertEqual(comparison.acceptedAfterSourcePolicyDelta, 3, "accepted delta should be candidate-baseline");
assertEqual(comparison.fallbackImproved, true, "fallback should be marked improved when candidate removes fallback");
assertEqual(comparison.meetsPromotionSignals, true, "promotion signal should pass when accepted improves and quality does not regress");

console.log("PASS run-v2-googlebooks-scifi-production-query-ab-regressions");

