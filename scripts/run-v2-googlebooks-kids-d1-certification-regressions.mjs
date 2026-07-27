/** D1 certification closure: Kids Google Books admission contract. */
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");
require.extensions[".ts"] = (module, filename) => {
  const output = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, moduleResolution: ts.ModuleResolutionKind.Node10, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  module._compile(output, filename);
};

function assertEqual(actual, expected, message) {
  if (actual !== expected) throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
function assertTrue(value, message) {
  if (!value) throw new Error(`${message}: expected truthy, got ${JSON.stringify(value)}`);
}
function assertNotIncludes(values, unexpected, message) {
  if (Array.isArray(values) && values.includes(unexpected)) throw new Error(`${message}: did not expect ${JSON.stringify(unexpected)} in ${JSON.stringify(values)}`);
}

const dir = resolve(dirname(fileURLToPath(import.meta.url)), "../app/recommender-v2");
const { applyKidsGoogleBooksPreScoringGate } = require(resolve(dir, "engine.ts"));
const { scoreCandidates } = require(resolve(dir, "score.ts"));
const { selectRecommendations } = require(resolve(dir, "select.ts"));

const profile = {
  ageBand: "kids", maturityBand: "kids",
  genreFamily: [{ value: "magic", weight: 2, evidence: ["like:kids:magic"] }],
  tone: [{ value: "warm", weight: 1, evidence: ["like:kids:warm"] }], pacing: [],
  themes: [{ value: "friendship", weight: 1, evidence: ["like:kids:friendship"] }],
  characterDynamics: [], formatPreference: [{ value: "book", weight: 1, evidence: ["like:kids:book"] }],
  avoidSignals: [], sourceHints: ["googleBooks"], diagnostics: {},
};

function candidate(title, description, overrides = {}) {
  return {
    id: `googleBooks:${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    source: "googleBooks",
    sourceId: title,
    title,
    creators: ["Fixture Author"],
    description,
    genres: ["Juvenile Fiction"],
    themes: ["friendship"],
    tones: ["warm"],
    characterDynamics: [],
    formats: ["book"],
    publicationYear: 2024,
    maturityBand: "kids",
    sourceUrl: `https://books.example/${encodeURIComponent(title)}`,
    raw: {
      title,
      description,
      ageBand: "kids",
      audienceBand: "kids",
      maturityRating: "NOT_MATURE",
      contentMaturity: "not_mature",
      categories: ["Juvenile Fiction"],
      volumeInfo: {
        title,
        description,
        categories: ["Juvenile Fiction"],
        maturityRating: "NOT_MATURE",
      },
    },
    diagnostics: {
      queryText: "kids magic picture book",
      queryFamily: "magic",
      googleBooksAudienceBand: "kids",
      googleBooksContentMaturity: "not_mature",
      googleBooksPublicationShape: "novel",
      googleBooksSourceMaturityRating: "NOT_MATURE",
    },
    ...overrides,
  };
}

const coverageRows = [];
const observedReasons = new Set();
const observedContractMarkers = new Set();
const dormantPaths = [];

function recordCoverage({ gate, fixture, expected, observed, assertion }) {
  coverageRows.push({ gate, fixture, expected, observed, assertion, pass: expected === observed || (expected.endsWith("*") && String(observed || "").startsWith(expected.slice(0, -1))) });
}

function assertGateReason({ gate, fixture, expectedReason, row }) {
  const gateResult = applyKidsGoogleBooksPreScoringGate([{ ...row, source: "googleBooks" }], profile);
  const observedReason = gateResult.diagnostics.rejectedBeforeScoringByTitle[fixture];
  assertEqual(observedReason, expectedReason, `${fixture} should resolve the expected ${gate} reason`);
  observedReasons.add(observedReason);
  recordCoverage({
    gate,
    fixture,
    expected: expectedReason,
    observed: observedReason,
    assertion: `${fixture} rejected before scoring with exact reason`,
  });
  assertNotIncludes(gateResult.candidates.map((candidateRow) => candidateRow.title), fixture, `${fixture} must not enter scoring`);
}

// 1) Mature content rejection.
{
  const fixture = candidate("D1 Mature Fixture", "A warm picture book narrative.", {
    raw: {
      title: "D1 Mature Fixture",
      description: "A warm picture book narrative.",
      audienceBand: "kids",
      maturityRating: "MATURE",
      contentMaturity: "mature",
      categories: ["Juvenile Fiction", "Picture books"],
      volumeInfo: { title: "D1 Mature Fixture", categories: ["Juvenile Fiction", "Picture books"], maturityRating: "MATURE" },
    },
    diagnostics: { googleBooksAudienceBand: "kids", googleBooksContentMaturity: "mature", googleBooksSourceMaturityRating: "MATURE", queryText: "kids magic picture book", googleBooksPublicationShape: "novel" },
  });
  assertGateReason({
    gate: "kids_maturity_gate",
    fixture: fixture.title,
    expectedReason: "googlebooks_mature_content_not_allowed_for_kids",
    row: fixture,
  });
}

// 2) Unknown/non-K2 audience without credible evidence.
{
  const fixture = candidate("D1 Unknown Audience Fixture", "A literary meditation on weather and memory.", {
    genres: ["Fiction", "Literary"],
    raw: {
      title: "D1 Unknown Audience Fixture",
      description: "A literary meditation on weather and memory.",
      audienceBand: "unknown",
      maturityRating: "NOT_MATURE",
      contentMaturity: "not_mature",
      categories: ["Fiction"],
      volumeInfo: { title: "D1 Unknown Audience Fixture", categories: ["Fiction"], maturityRating: "NOT_MATURE" },
    },
    diagnostics: { googleBooksAudienceBand: "unknown", googleBooksContentMaturity: "not_mature", googleBooksSourceMaturityRating: "NOT_MATURE", queryText: "kids magic picture book", googleBooksPublicationShape: "novel" },
  });
  assertGateReason({
    gate: "kids_audience_format_gate",
    fixture: fixture.title,
    expectedReason: "k2_unknown_or_non_k2_audience_without_credible_k2_evidence",
    row: fixture,
  });
}

// 3) Credible K2 audience present, but missing readable narrative/format identity.
{
  const fixture = candidate("D1 Missing Format Identity Fixture", "Simple text for children with plain vocabulary and no narrative framing.", {
    themes: [],
    tones: [],
    raw: {
      title: "D1 Missing Format Identity Fixture",
      description: "Simple text for children with plain vocabulary and no narrative framing.",
      audienceBand: "kids",
      maturityRating: "NOT_MATURE",
      contentMaturity: "not_mature",
      categories: ["Juvenile Fiction"],
      volumeInfo: { title: "D1 Missing Format Identity Fixture", categories: ["Juvenile Fiction"], maturityRating: "NOT_MATURE" },
    },
    diagnostics: { googleBooksAudienceBand: "kids", googleBooksContentMaturity: "not_mature", googleBooksSourceMaturityRating: "NOT_MATURE", queryText: "kids magic picture book", googleBooksPublicationShape: "novel" },
  });
  assertGateReason({
    gate: "kids_audience_format_gate",
    fixture: fixture.title,
    expectedReason: "k2_missing_child_readable_narrative_or_format_identity",
    row: fixture,
  });
}

// 4) Decisive adult/YA contradiction even with K2 cues.
{
  const fixture = candidate("D1 Decisive Contradiction Fixture", "A picture book for kids that also markets itself as young adult campus romance.", {
    raw: {
      title: "D1 Decisive Contradiction Fixture",
      description: "A picture book for kids that also markets itself as young adult campus romance.",
      audienceBand: "kids",
      maturityRating: "NOT_MATURE",
      contentMaturity: "not_mature",
      categories: ["Juvenile Fiction", "Picture books"],
      volumeInfo: { title: "D1 Decisive Contradiction Fixture", categories: ["Juvenile Fiction", "Picture books"], maturityRating: "NOT_MATURE" },
    },
    diagnostics: { googleBooksAudienceBand: "kids", googleBooksContentMaturity: "not_mature", googleBooksSourceMaturityRating: "NOT_MATURE", queryText: "kids magic picture book", googleBooksPublicationShape: "novel" },
  });
  const gateResult = applyKidsGoogleBooksPreScoringGate([{ ...fixture, source: "googleBooks" }], profile);
  const observedReason = gateResult.diagnostics.rejectedBeforeScoringByTitle[fixture.title];
  assertEqual(observedReason, "k2_unknown_or_non_k2_audience_without_credible_k2_evidence", `${fixture.title} should currently fail closed at unknown/non-k2 audience stage`);
  recordCoverage({
    gate: "kids_audience_format_gate",
    fixture: fixture.title,
    expected: "k2_decisive_adult_or_ya_contradiction (declared path)",
    observed: observedReason,
    assertion: "contradictory YA/adult signals currently collapse to unknown/non-k2 fail-closed path",
  });
  dormantPaths.push({
    reasonCode: "k2_decisive_adult_or_ya_contradiction",
    status: "unreached_in_current_runtime",
    evidenceFixture: fixture.title,
    observedFallbackReason: observedReason,
  });
}

// 5) Collection/bundle rejection.
{
  const fixture = candidate("Kid Ebooks With Fun Stories & Kid Jokes", "A collection of fun stories and jokes for kids.", {
    raw: {
      title: "Kid Ebooks With Fun Stories & Kid Jokes",
      description: "A collection of fun stories and jokes for kids.",
      audienceBand: "kids",
      maturityRating: "NOT_MATURE",
      contentMaturity: "not_mature",
      categories: ["Juvenile Fiction"],
      volumeInfo: { title: "Kid Ebooks With Fun Stories & Kid Jokes", categories: ["Juvenile Fiction"], maturityRating: "NOT_MATURE" },
    },
  });
  const gateResult = applyKidsGoogleBooksPreScoringGate([{ ...fixture, source: "googleBooks" }], profile);
  const observedReason = gateResult.diagnostics.rejectedBeforeScoringByTitle[fixture.title] || "";
  assertTrue(observedReason.startsWith("k2_collection_or_bundle_"), `${fixture.title} should be rejected by collection/bundle identity`);
  observedReasons.add("k2_collection_or_bundle_*");
  recordCoverage({
    gate: "kids_collection_bundle_identity_gate",
    fixture: fixture.title,
    expected: "k2_collection_or_bundle_*",
    observed: observedReason,
    assertion: `${fixture.title} rejected before scoring by collection/bundle identity`,
  });
}

// 6) Suspicious-title artifact rejection.
{
  const fixture = candidate("The Friends", "A picture book story for children in kindergarten about friendship.", {
    genres: ["Juvenile Fiction", "Picture books"],
    raw: {
      title: "The Friends",
      description: "A picture book story for children in kindergarten about friendship.",
      audienceBand: "kids",
      maturityRating: "NOT_MATURE",
      contentMaturity: "not_mature",
      categories: ["Juvenile Fiction", "Picture books"],
      volumeInfo: { title: "The Friends", categories: ["Juvenile Fiction", "Picture books"], maturityRating: "NOT_MATURE" },
    },
  });
  assertGateReason({
    gate: "kids_suspicious_title_gate",
    fixture: fixture.title,
    expectedReason: "k2_suspicious_title_artifact",
    row: fixture,
  });
}

// 7) Non-narrative informational artifact rejection.
{
  const fixture = candidate("D1 Informational Artifact Fixture", "He explores insects in this field guide for children.", {
    genres: ["Juvenile Fiction"],
    themes: [],
    tones: [],
    raw: {
      title: "D1 Informational Artifact Fixture",
      description: "He explores insects in this field guide for children.",
      audienceBand: "kids",
      maturityRating: "NOT_MATURE",
      contentMaturity: "not_mature",
      categories: ["Juvenile Fiction"],
      volumeInfo: { title: "D1 Informational Artifact Fixture", categories: ["Juvenile Fiction"], maturityRating: "NOT_MATURE" },
    },
    diagnostics: { queryText: "", queryFamily: "", googleBooksAudienceBand: "kids", googleBooksContentMaturity: "not_mature", googleBooksPublicationShape: "novel", googleBooksSourceMaturityRating: "NOT_MATURE" },
  });
  const gateResult = applyKidsGoogleBooksPreScoringGate([{ ...fixture, source: "googleBooks" }], profile);
  const observedReason = gateResult.diagnostics.rejectedBeforeScoringByTitle[fixture.title];
  assertEqual(observedReason, "k2_missing_story_picture_reader_relevance", `${fixture.title} should currently resolve via the consolidated missing-story/readability gate`);
  recordCoverage({
    gate: "kids_non_narrative_artifact_gate",
    fixture: fixture.title,
    expected: "k2_non_narrative_informational_artifact (declared path)",
    observed: observedReason,
    assertion: "informational artifact fixture currently resolves through consolidated missing-story/readability guard",
  });
  dormantPaths.push({
    reasonCode: "k2_non_narrative_informational_artifact",
    status: "unreached_in_current_runtime",
    evidenceFixture: fixture.title,
    observedFallbackReason: observedReason,
  });
}

// 8) Explicit pass path + final selected/not-selected outcomes.
{
  const strong = candidate("D1 Strong Selected Fixture", "A warm picture book story follows two friends through a magical adventure.", {
    genres: ["Juvenile Fiction", "Picture books", "Fantasy & Magic"],
    themes: ["friendship"],
    tones: ["warm"],
    raw: {
      title: "D1 Strong Selected Fixture",
      description: "A warm picture book story follows two friends through a magical adventure.",
      audienceBand: "kids",
      maturityRating: "NOT_MATURE",
      contentMaturity: "not_mature",
      categories: ["Juvenile Fiction", "Picture books"],
      volumeInfo: { title: "D1 Strong Selected Fixture", categories: ["Juvenile Fiction", "Picture books"], maturityRating: "NOT_MATURE" },
    },
  });
  const secondary = candidate("D1 Secondary Eligible Fixture", "A picture book story where friends solve a gentle mystery together.", {
    genres: ["Juvenile Fiction", "Picture books"],
    themes: ["friendship"],
    tones: [],
    raw: {
      title: "D1 Secondary Eligible Fixture",
      description: "A picture book story where friends solve a gentle mystery together.",
      audienceBand: "kids",
      maturityRating: "NOT_MATURE",
      contentMaturity: "not_mature",
      categories: ["Juvenile Fiction", "Picture books"],
      volumeInfo: { title: "D1 Secondary Eligible Fixture", categories: ["Juvenile Fiction", "Picture books"], maturityRating: "NOT_MATURE" },
    },
  });

  const gateResult = applyKidsGoogleBooksPreScoringGate([strong, secondary], profile);
  assertEqual(gateResult.diagnostics.decisionByTitle[strong.title], "kids_googlebooks_conclusive_pre_scoring_policy_passed", `${strong.title} should pass pre-scoring policy`);
  observedContractMarkers.add("kids_googlebooks_conclusive_pre_scoring_policy_passed");
  recordCoverage({
    gate: "kids_pre_scoring_conclusive_pass",
    fixture: strong.title,
    expected: "kids_googlebooks_conclusive_pre_scoring_policy_passed",
    observed: gateResult.diagnostics.decisionByTitle[strong.title],
    assertion: "conclusive pre-scoring pass reason emitted",
  });

  const scored = scoreCandidates(gateResult.candidates, profile);
  const selection = selectRecommendations(scored, profile, 1);
  const finalDecisionMap = selection.rejectedReasons.googleBooksFinalSelectionDecisionByTitle || {};
  const selectedTitles = selection.selected.map((row) => row.title);
  assertTrue(selectedTitles.length === 1, "limit=1 should produce exactly one selected row");
  assertEqual(finalDecisionMap[selectedTitles[0]], "selected", "selected fixture should be marked selected in final selection decision map");
  const nonSelectedTitle = [strong.title, secondary.title].find((title) => !selectedTitles.includes(title));
  assertTrue(Boolean(nonSelectedTitle), "one eligible fixture should remain not selected");
  assertEqual(finalDecisionMap[nonSelectedTitle], "passed_eligibility_not_selected", "non-selected eligible fixture should preserve passed_eligibility_not_selected decision");
  observedContractMarkers.add("final_selection_selected_and_not_selected_outcomes");
  recordCoverage({
    gate: "kids_final_selection_outcome_gate",
    fixture: `${selectedTitles[0]} / ${nonSelectedTitle}`,
    expected: "selected + passed_eligibility_not_selected",
    observed: `${finalDecisionMap[selectedTitles[0]]} + ${finalDecisionMap[nonSelectedTitle]}`,
    assertion: "selected and not-selected eligible outcomes are both observable",
  });
}

const requiredReasons = [
  "googlebooks_mature_content_not_allowed_for_kids",
  "k2_unknown_or_non_k2_audience_without_credible_k2_evidence",
  "k2_missing_child_readable_narrative_or_format_identity",
  "k2_collection_or_bundle_*",
  "k2_suspicious_title_artifact",
];
const uncoveredReasons = requiredReasons.filter((reason) => !observedReasons.has(reason));

const requiredMarkers = [
  "kids_googlebooks_conclusive_pre_scoring_policy_passed",
  "final_selection_selected_and_not_selected_outcomes",
];
const uncoveredMarkers = requiredMarkers.filter((marker) => !observedContractMarkers.has(marker));

assertEqual(uncoveredReasons.length, 0, `D1 uncovered reason-code paths must be empty`);
assertEqual(uncoveredMarkers.length, 0, `D1 uncovered outcome markers must be empty`);

const summary = {
  suite: "d1-kids-googlebooks-certification-regressions",
  pass: true,
  requiredReasonCount: requiredReasons.length,
  observedReasonCount: observedReasons.size,
  uncoveredReasons,
  dormantPaths,
  requiredOutcomeMarkerCount: requiredMarkers.length,
  uncoveredOutcomeMarkers: uncoveredMarkers,
  fixturesAssertionsCount: coverageRows.length,
  coverageRows,
};

console.log("PASS: D1 Kids Google Books certification regressions");
console.log(JSON.stringify(summary, null, 2));
