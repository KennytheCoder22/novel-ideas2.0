import assert from "node:assert/strict";
import test from "node:test";

import { runRecommenderV2 } from "../app/recommender-v2/engine";
import { selectRecommendations } from "../app/recommender-v2/select";
import { applyFinalStudentContentSafetyGate } from "../app/recommender-v2/studentContentSafety";
import type { AgeBandV2, ScoredCandidate, TasteProfile } from "../app/recommender-v2/types";

function candidate(overrides: Partial<ScoredCandidate> = {}): ScoredCandidate {
  return {
    id: overrides.id || "candidate",
    source: overrides.source || "googleBooks",
    title: overrides.title || "A Candidate Book",
    creators: overrides.creators || ["Test Author"],
    description: overrides.description,
    displayDescription: overrides.displayDescription,
    formats: overrides.formats || ["book"],
    genres: overrides.genres || [],
    themes: overrides.themes || [],
    tones: overrides.tones || [],
    characterDynamics: overrides.characterDynamics || [],
    maturityBand: overrides.maturityBand,
    raw: overrides.raw || {},
    diagnostics: overrides.diagnostics || {},
    score: overrides.score ?? 10,
    matchedSignals: overrides.matchedSignals || [],
    rejectedReasons: overrides.rejectedReasons || [],
    scoreBreakdown: overrides.scoreBreakdown || { sourceQualityRelevance: 2, ageBandSuitability: 2 },
  };
}

function profile(ageBand: AgeBandV2): TasteProfile {
  return {
    ageBand,
    tone: [],
    pacing: [],
    genreFamily: [],
    themes: [],
    characterDynamics: [],
    formatPreference: [],
    maturityBand: ageBand,
    avoidSignals: [],
    sourceHints: [],
    diagnostics: {},
  };
}

for (const ageBand of ["kids", "preteens", "teens"] as const) {
  test(`${ageBand}: obvious erotica is rejected`, () => {
    const result = applyFinalStudentContentSafetyGate([
      candidate({ title: "Unsafe Candidate", raw: { volumeInfo: { categories: ["Erotica"] } } }),
    ], ageBand);
    assert.equal(result.eligibleCandidates.length, 0);
    assert.equal(result.diagnostics.rejectedCandidates[0]?.ruleId, "erotica_or_pornography");
  });

  test(`${ageBand}: clearly adult sexual material is rejected`, () => {
    const result = applyFinalStudentContentSafetyGate([
      candidate({ description: "An adult novel containing explicit sexual content." }),
    ], ageBand);
    assert.equal(result.eligibleCandidates.length, 0);
    assert.equal(result.diagnostics.rejectedCandidates[0]?.ruleId, "explicit_sexual_content");
  });

  test(`${ageBand}: explicit mature classification with weak metadata fails closed`, () => {
    const result = applyFinalStudentContentSafetyGate([
      candidate({ title: "Sparse Metadata", description: undefined, raw: { contentMaturity: "MATURE" } }),
    ], ageBand);
    assert.equal(result.eligibleCandidates.length, 0);
    assert.equal(result.diagnostics.rejectedCandidates[0]?.ruleId, "explicit_adult_maturity");
  });
}

test("explicit sexual violence is rejected for student decks", () => {
  const result = applyFinalStudentContentSafetyGate([
    candidate({ description: "Includes graphic depictions of sexual assault." }),
  ], "teens");
  assert.equal(result.eligibleCandidates.length, 0);
  assert.equal(result.diagnostics.rejectedCandidates[0]?.ruleId, "explicit_sexual_violence");
});

test("graphic and extreme violence is rejected", () => {
  const result = applyFinalStudentContentSafetyGate([
    candidate({ genres: ["Splatterpunk"], description: "A horror story with extreme gore." }),
  ], "teens");
  assert.equal(result.eligibleCandidates.length, 0);
  assert.match(result.diagnostics.rejectedCandidates[0]?.ruleId || "", /graphic_or_extreme_violence|extreme_gore_or_torture/);
});

test("ordinary YA violence is not automatically rejected for Teens", () => {
  const result = applyFinalStudentContentSafetyGate([
    candidate({ description: "Teen heroes fight monsters in a dangerous battle and protect their town.", genres: ["Young Adult", "Fantasy", "Adventure"] }),
  ], "teens");
  assert.equal(result.eligibleCandidates.length, 1);
});

test("war and historical violence are not automatically rejected", () => {
  const result = applyFinalStudentContentSafetyGate([
    candidate({ description: "A historical novel about a family surviving war, occupation, and loss.", genres: ["History", "War stories"] }),
  ], "preteens");
  assert.equal(result.eligibleCandidates.length, 1);
});

test("racism, grief, mental health, crime, and abuse themes are not automatically rejected", () => {
  const result = applyFinalStudentContentSafetyGate([
    candidate({
      description: "Friends confront racism, grief, anxiety, domestic abuse, and a crime in their community.",
      themes: ["racism", "grief", "mental health", "abuse", "crime"],
    }),
  ], "teens");
  assert.equal(result.eligibleCandidates.length, 1);
});

test("neutral incomplete metadata is allowed rather than rejected", () => {
  const result = applyFinalStudentContentSafetyGate([candidate({ description: undefined })], "kids");
  assert.equal(result.eligibleCandidates.length, 1);
  assert.equal(result.diagnostics.missingMetadataAllowedCount, 1);
});

test("snake-case source maturity fields are inspected", () => {
  const result = applyFinalStudentContentSafetyGate([
    candidate({ raw: { source_metadata: { age_rating: "Adults Only" } } }),
  ], "teens");
  assert.equal(result.eligibleCandidates.length, 0);
  assert.equal(result.diagnostics.rejectedCandidates[0]?.ruleId, "explicit_adult_maturity");
});

test("Kids rules are stricter than Teen rules for non-graphic gore", () => {
  const sourceCandidate = candidate({ description: "A spooky adventure with some gore." });
  assert.equal(applyFinalStudentContentSafetyGate([sourceCandidate], "kids").eligibleCandidates.length, 0);
  assert.equal(applyFinalStudentContentSafetyGate([candidate({ description: "A spooky adventure with some gore." })], "teens").eligibleCandidates.length, 1);
});

test("Adult candidates bypass student rules without changing object identity or order", () => {
  const candidates = [
    candidate({ id: "one", description: "Explicit sexual content." }),
    candidate({ id: "two", raw: { contentMaturity: "MATURE" } }),
  ];
  const result = applyFinalStudentContentSafetyGate(candidates, "adult");
  assert.equal(result.diagnostics.applied, false);
  assert.deepEqual(result.eligibleCandidates, candidates);
  assert.equal(result.eligibleCandidates[0], candidates[0]);
  assert.equal(result.eligibleCandidates[1], candidates[1]);
});

test("diagnostics record title, source, age, reason, rule, and matched signal", () => {
  const result = applyFinalStudentContentSafetyGate([
    candidate({ title: "Diagnostic Candidate", source: "openLibrary", raw: { subject: ["Pornography"] } }),
  ], "preteens");
  const diagnostic = result.diagnostics.rejectedCandidates[0];
  assert.equal(diagnostic?.title, "Diagnostic Candidate");
  assert.equal(diagnostic?.source, "openLibrary");
  assert.equal(diagnostic?.ageBand, "preteens");
  assert.ok(diagnostic?.rejectionReason);
  assert.equal(diagnostic?.ruleId, "erotica_or_pornography");
  assert.ok(diagnostic?.matchedSignals.length);
});

test("the shared final selector cannot rescue a rejected high-scoring student candidate", () => {
  const unsafe = candidate({
    id: "unsafe",
    source: "mock",
    title: "Unsafe High Score",
    description: "An explicit sexual content anthology.",
    score: 100,
  });
  const selection = selectRecommendations([unsafe], profile("teens"), 5);
  assert.equal(selection.selected.length, 0);
  assert.equal(selection.rejectedReasons.student_content_safety_rejected, 1);
  const diagnostics = (selection.rejectedReasons as unknown as Record<string, unknown>).studentContentSafety as {
    rejectedCandidates: { title: string; ruleId: string }[];
  };
  assert.deepEqual(diagnostics.rejectedCandidates.map((row) => row.title), ["Unsafe High Score"]);
  assert.equal(diagnostics.rejectedCandidates[0]?.ruleId, "explicit_sexual_content");
});

test("engine diagnostics expose aggregate and per-source safety-gate results", async () => {
  const result = await runRecommenderV2({
    requestId: "student-safety-diagnostics-test",
    ageBand: "teens",
    limit: 3,
    enabledSources: {
      mock: true,
      googleBooks: false,
      openLibrary: false,
      kitsu: false,
      comicVine: false,
      localLibrary: false,
      nyt: false,
    },
    signals: [
      { action: "like", title: "Mock Mystery", genres: ["mystery"], format: "book" },
    ],
  });
  assert.equal(result.diagnostics.studentContentSafety?.applied, true);
  assert.equal(result.diagnostics.studentContentSafety?.ageBand, "teens");
  const mockDiagnostics = result.diagnostics.sources.find((source) => source.source === "mock");
  assert.equal(mockDiagnostics?.studentContentSafetyGateApplied, true);
  assert.equal(mockDiagnostics?.studentContentSafetyPolicyVersion, "student-content-safety-v1");
  assert.equal(typeof mockDiagnostics?.studentContentSafetyRejectedCount, "number");
});
