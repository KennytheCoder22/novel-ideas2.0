export const RECOMMENDATION_CERTIFICATION_SUITE_V1 = {
  suiteName: "Recommendation Certification Suite",
  version: "v1",
  dateEstablished: "2026-07-27",
  diagnosticMetricLabels: {
    eligibleForScoring: "Eligible for Scoring",
    candidatesPassedToScoring: "Candidates Passed to Scoring",
    finalRecommendations: "Final Recommendations",
  },
  tiers: {
    stableFixtures: [
      {
        fixtureId: "adult_a",
        profileName: "Adult A",
        purpose: "Full-pass control",
        subsystemProtected: "End-to-end baseline control",
      },
      {
        fixtureId: "adult_b",
        profileName: "Adult B",
        purpose: "Full-pass with recovery-assisted completion",
        subsystemProtected: "Recovery-assisted completion behavior",
      },
      {
        fixtureId: "adult_c",
        profileName: "Adult C",
        purpose: "Underfill + rollback/no-worsening event",
        subsystemProtected: "Rollback/no-worsening safety behavior",
      },
    ],
    randomFixtures: [
      {
        fixtureId: "random_77209",
        profileName: "Random Seed 77209",
        randomSeed: 77209,
        purpose: "Metadata sparsity (high admission, zero final)",
        subsystemProtected: "Metadata-evidence final eligibility gate",
      },
    ],
    weirdFixtures: [
      {
        fixtureId: "weird_fantasy_military_history",
        profileName: "Fantasy + Military History (corrected polarity)",
        purpose: "Fixture polarity regression",
        subsystemProtected: "Profile signal polarity -> route-family mapping",
        correctedFixtureDefinition: {
          likes: ["fantasy", "military history", "war strategy"],
          dislikes: ["cozy romance", "domestic drama"],
          note: "Fantasy and Military History are intentionally encoded as likes.",
        },
      },
      {
        fixtureId: "weird_highly_contradictory",
        profileName: "Highly Contradictory",
        purpose: "Route balancing under contradictory signals",
        subsystemProtected: "Route planner conflict balancing",
      },
      {
        fixtureId: "weird_cozy_fantasy_true_crime",
        profileName: "Cozy Fantasy but also True Crime",
        purpose: "High admission -> zero final, context-only collapse",
        subsystemProtected: "Final eligibility context sufficiency",
      },
      {
        fixtureId: "weird_manga_not_anime",
        profileName: "Manga but not anime",
        purpose: "Zero final + stage-boundary metric visibility",
        subsystemProtected: "Stage boundary observability consistency",
      },
    ],
  },
};

export function flattenSuiteFixtureInventory(suite = RECOMMENDATION_CERTIFICATION_SUITE_V1) {
  return [
    ...suite.tiers.stableFixtures,
    ...suite.tiers.randomFixtures,
    ...suite.tiers.weirdFixtures,
  ];
}
