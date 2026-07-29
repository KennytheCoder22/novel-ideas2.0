import {
  buildTeenGoogleBooksFallbackRootCauseBreakdown,
  parseTeenGoogleBooksRunsFromReportText,
  extractMetricsFromLiveResult,
  classifyFallbackState,
  classifyConfidence,
} from "./lib/teen-googlebooks-fallback-root-cause.mjs";

let failures = 0;
function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    console.error(`FAIL: ${message}\n  Expected: ${JSON.stringify(expected)}\n  Actual:   ${JSON.stringify(actual)}`);
    failures += 1;
  }
}
function assertNotNull(actual, message) {
  if (actual == null) {
    console.error(`FAIL: ${message} — got ${JSON.stringify(actual)}`);
    failures += 1;
  }
}

// ── Session-report text path (backward-compat) ────────────────────────────────

const syntheticReport = `SESSION REPORT
Deck: Teens School
presetTestName:Synthetic
googleBooksSourceFetchDiagnostics: [{"query":"q1","queryCascadeIndex":0,"acceptedAfterSourcePolicy":3,"rawApiCount":20},{"query":"q2","queryCascadeIndex":1,"acceptedAfterSourcePolicy":2,"rawApiCount":20}]
googleBooksQueryResultQualityByQuery: {"q1":{"acceptedCandidateCount":3,"acceptedRecommendationCount":3,"acceptedRecommendationTitles":["A","B","C"],"rejectedCandidateCount":17,"rejectionReasons":{"publication_shape_nonfiction":2},"narrativeCandidateCount":3},"q2":{"acceptedCandidateCount":2,"acceptedRecommendationCount":1,"acceptedRecommendationTitles":["D"],"rejectedCandidateCount":18,"rejectionReasons":{"publication_shape_nonfiction":1},"narrativeCandidateCount":2}}
googleBooksFinalSelectionExclusionReasonByTitle: {"C":"same_author_deferred"}
teenGoogleBooksMeaningfulTasteClassificationByTitle: {"A":"strong_match","B":"strong_match","C":"query_supported_but_weak"}
finalSelectedTitles: ["A","B","D"]
`;

const runs = parseTeenGoogleBooksRunsFromReportText(syntheticReport, "synthetic.txt");
assertEqual(runs.length, 1, "should parse one teen run");
assertEqual(runs[0].bucket, "E_diversity_filtering", "diversity exclusions with secondary selection should classify as E");

const breakdown = buildTeenGoogleBooksFallbackRootCauseBreakdown(runs);
assertEqual(breakdown.totalRuns, 1, "breakdown should include one run");
assertEqual(breakdown.bucketCounts.E_diversity_filtering, 1, "bucket count should include one diversity case");

// ── New fields on text-parsed run ────────────────────────────────────────────

// primaryAccepted=3, finalSelectedCount=3, secondarySelected=1 → diversity is
// proximate cause.  primaryAccepted (3) < HEALTHY_PRIMARY_DEPTH (4) so
// secondary contributor should flag underlying recall weakness.
assertEqual(runs[0].fallbackState, "fallback_selected", "fallback state: secondary selected but primary could fill");
assertEqual(runs[0].secondaryContributor, "B_insufficient_recall_underlying", "shallow primary recall should be flagged as secondary contributor");

// ── classifyFallbackState unit tests ─────────────────────────────────────────

assertEqual(
  classifyFallbackState({ secondaryAccepted: 0, secondarySelected: 0, primarySelected: 6, finalSelectedCount: 6 }),
  "fallback_not_activated",
  "no secondary accepted → fallback_not_activated",
);
assertEqual(
  classifyFallbackState({ secondaryAccepted: 3, secondarySelected: 0, primarySelected: 6, finalSelectedCount: 6 }),
  "fallback_activated_not_selected",
  "secondary accepted but not selected → fallback_activated_not_selected",
);
assertEqual(
  classifyFallbackState({ secondaryAccepted: 3, secondarySelected: 2, primarySelected: 6, finalSelectedCount: 6 }),
  "fallback_selected",
  "secondary selected and primary also fills slate → fallback_selected",
);
assertEqual(
  classifyFallbackState({ secondaryAccepted: 3, secondarySelected: 2, primarySelected: 4, finalSelectedCount: 6 }),
  "fallback_required_for_minimum_slate",
  "primary underfills without secondary → fallback_required_for_minimum_slate",
);

// ── classifyConfidence unit tests ─────────────────────────────────────────────

assertEqual(
  classifyConfidence("A_primary_query_succeeded", { primaryAccepted: 6, secondaryAccepted: 0, finalSelectedCount: 6, primaryPublicationRejectShare: 0.1, primaryWeakShare: 0.0, diversityExclusionCount: 0 }, true),
  "high",
  "clean primary-only run → high confidence",
);
assertEqual(
  classifyConfidence("C_publication_filtering", { primaryAccepted: 2, secondaryAccepted: 1, finalSelectedCount: 3, primaryPublicationRejectShare: 0.5, primaryWeakShare: 0.0, diversityExclusionCount: 0 }, false),
  "low",
  "missing required fields → low confidence",
);
assertEqual(
  classifyConfidence("C_publication_filtering", { primaryAccepted: 2, secondaryAccepted: 1, finalSelectedCount: 3, primaryPublicationRejectShare: 0.55, primaryWeakShare: 0.0, diversityExclusionCount: 0 }, true),
  "medium",
  "publication reject share near 0.5 threshold → medium confidence",
);
assertEqual(
  classifyConfidence("B_insufficient_recall", { primaryAccepted: 0, secondaryAccepted: 0, finalSelectedCount: 0, primaryPublicationRejectShare: 0, primaryWeakShare: 0, diversityExclusionCount: 0 }, true),
  "low",
  "total stall (zero accepted/selected) → low confidence",
);

// ── extractMetricsFromLiveResult unit test ────────────────────────────────────

const mockLiveResult = {
  items: [
    { title: "Book Alpha" },
    { title: "Book Beta" },
  ],
  diagnostics: {
    sources: [
      {
        source: "googleBooks",
        googleBooksSourceFetchDiagnostics: [
          { query: "q1", originalPlannedQuery: "q1", queryCascadeIndex: 0, acceptedAfterSourcePolicy: 5, rawApiCount: 30, queryFamily: "mystery" },
          { query: "q2", originalPlannedQuery: "q2", queryCascadeIndex: 1, acceptedAfterSourcePolicy: 2, rawApiCount: 20 },
        ],
        googleBooksQueryResultQualityByQuery: {
          q1: { acceptedRecommendationCount: 1, acceptedRecommendationTitles: ["Book Alpha"], rejectedCandidateCount: 10, rejectionReasons: { publication_shape_nonfiction: 6 }, narrativeCandidateCount: 4 },
          q2: { acceptedRecommendationCount: 1, acceptedRecommendationTitles: ["Book Beta"], rejectedCandidateCount: 8, rejectionReasons: {}, narrativeCandidateCount: 2 },
        },
      },
    ],
    rejectedReasons: {
      googleBooksFinalSelectionExclusionReasonByTitle: {},
      teenGoogleBooksMeaningfulTasteClassificationByTitle: { "Book Alpha": "strong_match", "Book Beta": "strong_match" },
    },
  },
};

const liveMetrics = extractMetricsFromLiveResult(mockLiveResult, "test-profile", "Test Profile");
assertNotNull(liveMetrics, "extractMetricsFromLiveResult should return metrics for a valid result");
assertEqual(liveMetrics.profileId, "test-profile", "profileId should be preserved");
assertEqual(liveMetrics.queryFamily, "mystery", "queryFamily from fetch diagnostic should be captured");
// primaryPublicationRejectShare = 6/10 = 0.6 ≥ 0.5, secondarySelected=1 > 0,
// secondaryAccepted=2 > primaryAccepted=5 is false; secondarySelected=1 > primarySelected=1 is false;
// primaryAccepted(5) >= finalSelectedCount(2) → check diversity: 0 → check taste: weak=0 → F_ranking_selection
// Wait — primaryAccepted=5, finalSelectedCount=2, secondarySelected=1, so secondarySelected!=0
// primaryAccepted(5) >= finalSelectedCount(2) → yes → diversityExclusionCount=0 → primaryWeakShare=0 → F_ranking_selection
assertEqual(liveMetrics.bucket, "F_ranking_selection", "should classify as ranking/selection when primary has capacity and no diversity/taste issues");
// fallback: secondaryAccepted=2 > 0, secondarySelected=1 > 0, primarySelected=1 >= finalSelectedCount=2? 1<2 → required
assertEqual(liveMetrics.fallbackState, "fallback_required_for_minimum_slate", "fallback required since primary selected < final count");

// ── Breakdown extended fields ─────────────────────────────────────────────────

const breakdown2 = buildTeenGoogleBooksFallbackRootCauseBreakdown([runs[0], liveMetrics]);
assertEqual(breakdown2.totalRuns, 2, "breakdown should include both runs");
assertEqual(typeof breakdown2.fallbackStateCounts, "object", "fallbackStateCounts should be present");
assertEqual(typeof breakdown2.bucketCountsAmongFallbackSelected, "object", "bucketCountsAmongFallbackSelected should be present");
assertEqual(typeof breakdown2.bucketCountsHighConfidence, "object", "bucketCountsHighConfidence should be present");
assertEqual(typeof breakdown2.queryFamilyBreakdown, "object", "queryFamilyBreakdown should be present");
assertEqual(typeof breakdown2.dominance, "object", "dominance assessment should be present");

if (failures > 0) {
  console.error(`\n${failures} test(s) FAILED.`);
  process.exit(1);
}
console.log("PASS run-v2-teen-googlebooks-fallback-root-cause-breakdown-regressions");

