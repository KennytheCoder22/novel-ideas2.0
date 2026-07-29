/**
 * Regressions for the expanded fallback audit infrastructure.
 * Tests only the library functions — no live API calls.
 */

import {
  extractMetricsFromLiveResult,
  buildTeenGoogleBooksFallbackRootCauseBreakdown,
  classifyFallbackState,
  classifyConfidence,
} from "./lib/teen-googlebooks-fallback-root-cause.mjs";
import { TEEN_AUDIT_PROFILES } from "./lib/teen-googlebooks-audit-profiles.mjs";

let failures = 0;
function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    console.error(`FAIL: ${message}\n  Expected: ${JSON.stringify(expected)}\n  Actual:   ${JSON.stringify(actual)}`);
    failures += 1;
  }
}
function assertTrue(condition, message) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    failures += 1;
  }
}

// ── Profile corpus sanity ─────────────────────────────────────────────────────

assertTrue(TEEN_AUDIT_PROFILES.length >= 25, `Profile corpus should have ≥25 entries (got ${TEEN_AUDIT_PROFILES.length})`);

const profileIds = TEEN_AUDIT_PROFILES.map((p) => p.id);
const uniqueIds = new Set(profileIds);
assertEqual(uniqueIds.size, profileIds.length, "all profile IDs should be unique");

const familyCounts = {};
for (const p of TEEN_AUDIT_PROFILES) {
  familyCounts[p.family] = (familyCounts[p.family] || 0) + 1;
}
const families = Object.keys(familyCounts);
assertTrue(families.length >= 6, `Should cover ≥6 query families (got ${families.length}: ${families.join(", ")})`);

for (const p of TEEN_AUDIT_PROFILES) {
  assertTrue(p.ageBand === "teens", `Profile ${p.id} must have ageBand "teens"`);
  assertTrue(Array.isArray(p.signals) && p.signals.length >= 2, `Profile ${p.id} must have ≥2 signals`);
}

// ── classifyFallbackState ─────────────────────────────────────────────────────

assertEqual(
  classifyFallbackState({ secondaryAccepted: 0, secondarySelected: 0, primarySelected: 5, finalSelectedCount: 5 }),
  "fallback_not_activated", "no secondary → not_activated",
);
assertEqual(
  classifyFallbackState({ secondaryAccepted: 4, secondarySelected: 0, primarySelected: 6, finalSelectedCount: 6 }),
  "fallback_activated_not_selected", "secondary accepted but not in final → activated_not_selected",
);
assertEqual(
  classifyFallbackState({ secondaryAccepted: 2, secondarySelected: 1, primarySelected: 6, finalSelectedCount: 6 }),
  "fallback_selected", "secondary in final, primary also fills → fallback_selected",
);
assertEqual(
  classifyFallbackState({ secondaryAccepted: 3, secondarySelected: 3, primarySelected: 3, finalSelectedCount: 6 }),
  "fallback_required_for_minimum_slate", "primary alone underfills → required",
);

// ── classifyConfidence ────────────────────────────────────────────────────────

assertEqual(
  classifyConfidence("A_primary_query_succeeded",
    { primaryAccepted: 8, secondaryAccepted: 0, finalSelectedCount: 6, primaryPublicationRejectShare: 0.05, primaryWeakShare: 0, diversityExclusionCount: 0 },
    true),
  "high", "clean A run → high",
);
assertEqual(
  classifyConfidence("B_insufficient_recall",
    { primaryAccepted: 2, secondaryAccepted: 3, finalSelectedCount: 5, primaryPublicationRejectShare: 0.1, primaryWeakShare: 0.1, diversityExclusionCount: 0 },
    false),
  "low", "missing required fields → low",
);
assertEqual(
  classifyConfidence("C_publication_filtering",
    { primaryAccepted: 3, secondaryAccepted: 2, finalSelectedCount: 5, primaryPublicationRejectShare: 0.52, primaryWeakShare: 0, diversityExclusionCount: 0 },
    true),
  "medium", "pub reject share near 0.5 → medium",
);
assertEqual(
  classifyConfidence("E_diversity_filtering",
    { primaryAccepted: 3, secondaryAccepted: 2, finalSelectedCount: 5, primaryPublicationRejectShare: 0.05, primaryWeakShare: 0, diversityExclusionCount: 1 },
    true),
  "medium", "single diversity exclusion with shallow primary → medium (E vs B ambiguous)",
);

// ── extractMetricsFromLiveResult ──────────────────────────────────────────────

const mockResult = {
  items: [{ title: "Alpha" }, { title: "Beta" }, { title: "Gamma" }],
  diagnostics: {
    sources: [
      {
        source: "googleBooks",
        googleBooksSourceFetchDiagnostics: [
          { query: "q1", originalPlannedQuery: "q1", queryCascadeIndex: 0, acceptedAfterSourcePolicy: 6, rawApiCount: 35, queryFamily: "fantasy" },
        ],
        googleBooksQueryResultQualityByQuery: {
          q1: {
            acceptedRecommendationCount: 3,
            acceptedRecommendationTitles: ["Alpha", "Beta", "Gamma"],
            rejectedCandidateCount: 20,
            rejectionReasons: { publication_shape_nonfiction: 3 },
            narrativeCandidateCount: 6,
          },
        },
      },
    ],
    rejectedReasons: {
      googleBooksFinalSelectionExclusionReasonByTitle: {},
      teenGoogleBooksMeaningfulTasteClassificationByTitle: { Alpha: "strong_match", Beta: "strong_match", Gamma: "strong_match" },
    },
  },
};

const metrics = extractMetricsFromLiveResult(mockResult, "profile-x", "Profile X");
assertTrue(metrics !== null, "extractMetricsFromLiveResult should return metrics");
assertEqual(metrics.bucket, "A_primary_query_succeeded", "no secondary → A");
assertEqual(metrics.fallbackState, "fallback_not_activated", "no secondary → fallback_not_activated");
assertEqual(metrics.queryFamily, "fantasy", "queryFamily from fetch diagnostic");
assertEqual(metrics.confidence, "high", "clean primary run → high confidence");
assertEqual(metrics.secondaryContributor, null, "no secondary contributor for A bucket");

// ── buildTeenGoogleBooksFallbackRootCauseBreakdown with extended tables ───────

const rows = [metrics];
const bd = buildTeenGoogleBooksFallbackRootCauseBreakdown(rows);
assertTrue(typeof bd.fallbackStateCounts === "object", "fallbackStateCounts present");
assertTrue(typeof bd.bucketCountsAmongFallbackSelected === "object", "bucketCountsAmongFallbackSelected present");
assertTrue(typeof bd.bucketCountsHighConfidence === "object", "bucketCountsHighConfidence present");
assertTrue(typeof bd.queryFamilyBreakdown === "object", "queryFamilyBreakdown present");
assertTrue(typeof bd.queryFamilyBreakdown.fantasy === "object", "fantasy family present in breakdown");
assertEqual(bd.queryFamilyBreakdown.fantasy.count, 1, "fantasy family count");
assertTrue(typeof bd.dominance === "object", "dominance assessment present");
assertEqual(bd.dominance.isDominant, false, "single run cannot be dominant");

// ── null handling ─────────────────────────────────────────────────────────────

const nullResult = extractMetricsFromLiveResult(null, "none", "None");
assertEqual(nullResult, null, "null result → null metrics");

const emptySourcesResult = { items: [], diagnostics: { sources: [], rejectedReasons: {} } };
const emptyMetrics = extractMetricsFromLiveResult(emptySourcesResult, "empty", "Empty");
assertEqual(emptyMetrics, null, "no GB source → null metrics");

if (failures > 0) {
  console.error(`\n${failures} test(s) FAILED.`);
  process.exit(1);
}
console.log("PASS run-v2-teen-googlebooks-expanded-fallback-audit-regressions");
