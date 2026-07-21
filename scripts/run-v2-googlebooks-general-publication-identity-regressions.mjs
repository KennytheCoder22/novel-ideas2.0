import {
  buildPublicationIdentityRuleHistogram,
  chooseBestSingleRule,
  isLikelyLegitimateNarrative,
  simulateSingleRuleRelaxations,
  summarizeRuleLoss,
} from "./lib/googlebooks-general-publication-identity-diagnostic.mjs";

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}\nExpected: ${JSON.stringify(expected)}\nActual: ${JSON.stringify(actual)}`);
  }
}

const histogram = buildPublicationIdentityRuleHistogram({
  "young adult contemporary fiction novel": {
    publication_shape_unknown_insufficient_narrative_identity: 5,
    publication_shape_critical_study: 2,
    missing_author: 3,
  },
}, "young adult contemporary fiction novel");

assertEqual(
  JSON.stringify(histogram),
  JSON.stringify({
    publication_shape_unknown_insufficient_narrative_identity: 5,
    publication_shape_critical_study: 2,
  }),
  "rule histogram should include only publication-shape rules",
);

const ruleSummary = summarizeRuleLoss(histogram);
assertEqual(ruleSummary.totalRejectedByPublicationIdentity, 7, "total rejected should sum publication-shape rules");
assertEqual(ruleSummary.rows[0].rule, "publication_shape_unknown_insufficient_narrative_identity", "largest rejection should sort first");

const analyzedRows = [
  {
    publicationShape: "unknown",
    publicationShapeDropReason: "publication_shape_unknown_insufficient_narrative_identity",
    artifactDropReason: "",
    explicitNonNarrativeIdentity: [],
    storyLevelNarrativeEvidence: ["story_signal_a", "story_signal_b"],
    unknownShapeEvidence: ["u1", "u2"],
    narrativeConfidence: 1.3,
  },
  {
    publicationShape: "critical_study",
    publicationShapeDropReason: "publication_shape_critical_study",
    artifactDropReason: "",
    explicitNonNarrativeIdentity: ["critical_study_title_signal"],
    storyLevelNarrativeEvidence: [],
    unknownShapeEvidence: [],
    narrativeConfidence: -1.2,
  },
];

assertEqual(isLikelyLegitimateNarrative(analyzedRows[0]), true, "unknown with strong narrative evidence should be likely legitimate");
assertEqual(isLikelyLegitimateNarrative(analyzedRows[1]), false, "critical study should not be likely legitimate");

const simulations = simulateSingleRuleRelaxations({
  rows: analyzedRows,
  baselinePassCount: 3,
  topRules: [
    "publication_shape_unknown_insufficient_narrative_identity",
    "publication_shape_critical_study",
  ],
});
assertEqual(simulations[0].additionalCandidates, 1, "top simulation should admit one additional candidate");
const best = chooseBestSingleRule(simulations);
assertEqual(best.relaxedRule, "publication_shape_unknown_insufficient_narrative_identity", "best rule should favor additional candidates with lower false accepts");

console.log("PASS run-v2-googlebooks-general-publication-identity-regressions");

