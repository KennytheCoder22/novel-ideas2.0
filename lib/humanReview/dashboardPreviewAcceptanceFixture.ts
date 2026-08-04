import {
  buildHumanReviewDashboardData,
  type HumanReviewDashboardFilters,
} from "./dashboard";

export const PREVIEW_ACCEPTANCE_FIXTURE_STORAGE_MODE = "preview_acceptance_fixture";

const FIXTURE_SNAPSHOTS: Array<Record<string, any>> = [
  {
    schemaVersion: "human_review_snapshot_v1",
    snapshotId: "hrs-preview-adult-openlibrary",
    profileId: "runtime-adult-preview-openlibrary",
    rubricVersion: "v1",
    engineVersion: "preview-fixture",
    capturedAt: "2026-08-02T17:00:00.000Z",
    ageBand: "adult",
    deckKey: "adult",
    swipeSignalCount: 4,
    swipeSignals: [
      { action: "like" },
      { action: "like" },
      { action: "dislike" },
      { action: "skip" },
    ],
    recommendationItems: [
      {
        rank: 1,
        title: "The Lantern Archive",
        author: "Ava Sterling",
        source: "openLibrary",
        sourceId: "ol-preview-lantern",
        matchedSignals: ["genreFacetMatch:fantasy", "positiveTasteMatch:found_family"],
      },
    ],
  },
  {
    schemaVersion: "human_review_snapshot_v1",
    snapshotId: "hrs-preview-teen-googlebooks",
    profileId: "runtime-teens-preview-googlebooks",
    rubricVersion: "v1",
    engineVersion: "preview-fixture",
    capturedAt: "2026-08-01T16:00:00.000Z",
    ageBand: "teens",
    deckKey: "ms_hs",
    swipeSignalCount: 3,
    swipeSignals: [
      { action: "like" },
      { action: "like" },
      { action: "skip" },
    ],
    recommendationItems: [
      {
        rank: 1,
        title: "Signal in the Stacks",
        author: "Morgan Hale",
        source: "googleBooks",
        sourceId: "gb-preview-signal",
        matchedSignals: ["genreFacetMatch:science_fiction", "positiveTasteMatch:fast_pacing"],
      },
    ],
  },
  {
    schemaVersion: "human_review_snapshot_v1",
    snapshotId: "hrs-preview-synthetic-baseline",
    profileId: "fixture-adult-preview-study",
    rubricVersion: "v1",
    engineVersion: "preview-fixture",
    capturedAt: "2026-07-31T12:00:00.000Z",
    ageBand: "adult",
    deckKey: "adult",
    swipeSignalCount: 1,
    swipeSignals: [{ action: "like" }],
    recommendationItems: [
      {
        rank: 1,
        title: "Baseline Control Title",
        author: "Fixture Author",
        source: "mock",
        sourceId: "fixture-mock-001",
        matchedSignals: ["genreFacetMatch:fantasy"],
      },
    ],
  },
];

const FIXTURE_REVIEWS: Array<Record<string, any>> = [
  {
    schemaVersion: "human_review_record_v1",
    reviewId: "hr-preview-adult-a",
    snapshotId: "hrs-preview-adult-openlibrary",
    profileId: "runtime-adult-preview-openlibrary",
    rubricId: "novelideas-human-review",
    rubricVersion: "v1",
    reviewerId: "preview-reviewer-alpha",
    createdAt: "2026-08-02T18:00:00.000Z",
    itemReviews: [
      {
        rank: 1,
        title: "The Lantern Archive",
        overallScore: 5,
        decision: "recommend",
        familiarity: "never_heard_of_it",
        expectedEnjoyment: 5,
        criteriaRatings: { taste_alignment: 5, novelty: 4, confidence: 4 },
        concernTags: ["tone_mismatch"],
        notes: "Compelling enough to try despite tonal questions.",
      },
    ],
    summary: {
      wouldUseSlate: true,
      wouldUseSlateDecision: "yes",
      notes: "Strong fantasy fit overall.",
      slateConcernTags: ["tone_mismatch"],
    },
  },
  {
    schemaVersion: "human_review_record_v1",
    reviewId: "hr-preview-adult-b",
    snapshotId: "hrs-preview-adult-openlibrary",
    profileId: "runtime-adult-preview-openlibrary",
    rubricId: "novelideas-human-review",
    rubricVersion: "v1",
    reviewerId: "preview-reviewer-beta",
    createdAt: "2026-08-02T19:30:00.000Z",
    itemReviews: [
      {
        rank: 1,
        title: "The Lantern Archive",
        overallScore: 2,
        decision: "not_recommended",
        familiarity: "heard_of_it",
        expectedEnjoyment: 2,
        criteriaRatings: { taste_alignment: 2, novelty: 3, confidence: 5 },
        concernTags: ["tone_mismatch", "slow_pacing"],
        notes: "Tone and pace felt misaligned.",
      },
    ],
    summary: {
      wouldUseSlate: false,
      wouldUseSlateDecision: "no",
      notes: "This slate needs stronger pacing variety.",
      slateConcernTags: ["slow_pacing"],
    },
  },
  {
    schemaVersion: "human_review_record_v1",
    reviewId: "hr-preview-teen-a",
    snapshotId: "hrs-preview-teen-googlebooks",
    profileId: "runtime-teens-preview-googlebooks",
    rubricId: "novelideas-human-review",
    rubricVersion: "v1",
    reviewerId: "preview-reviewer-gamma",
    createdAt: "2026-08-01T17:15:00.000Z",
    itemReviews: [
      {
        rank: 1,
        title: "Signal in the Stacks",
        overallScore: 4,
        decision: "weak_recommend",
        familiarity: "tried_but_did_not_finish",
        expectedEnjoyment: 4,
        criteriaRatings: { taste_alignment: 4, novelty: 5, confidence: 3 },
        concernTags: ["slow_pacing"],
        notes: "Interesting premise, but pacing may be a hurdle.",
      },
    ],
    summary: {
      wouldUseSlate: true,
      wouldUseSlateDecision: "yes",
      notes: "Worth keeping for teen sci-fi readers.",
      slateConcernTags: ["slow_pacing"],
    },
  },
  {
    schemaVersion: "human_review_record_v1",
    reviewId: "hr-preview-synthetic-a",
    snapshotId: "hrs-preview-synthetic-baseline",
    profileId: "fixture-adult-preview-study",
    rubricId: "novelideas-human-review",
    rubricVersion: "v1",
    reviewerId: "preview-study-reviewer",
    createdAt: "2026-07-31T13:00:00.000Z",
    reviewScope: {
      studyId: "preview-acceptance-fixture-study",
      ageBand: "adult",
    },
    itemReviews: [
      {
        rank: 1,
        title: "Baseline Control Title",
        overallScore: 4,
        decision: "recommend",
        familiarity: "never_heard_of_it",
        expectedEnjoyment: 4,
        criteriaRatings: { taste_alignment: 4, novelty: 4, confidence: 4 },
        concernTags: ["insufficient_information"],
        notes: "Synthetic baseline fixture.",
      },
    ],
    summary: {
      wouldUseSlate: true,
      wouldUseSlateDecision: "yes",
      notes: "Synthetic certification baseline.",
    },
  },
];

export function buildPreviewAcceptanceDashboardFixture(filters: HumanReviewDashboardFilters) {
  return buildHumanReviewDashboardData({
    filters,
    snapshots: FIXTURE_SNAPSHOTS,
    reviews: FIXTURE_REVIEWS,
  });
}
