/**
 * Regression tests for Adult Google Books final-eligibility observability.
 *
 * Verifies:
 * 1. Every ranked Google Books candidate receives an explicit downstream decision
 *    (no `missing_in_next_googlebooks_stage` as the sole explanation).
 * 2. Generic lineage diagnostics remain available but are not the sole explanation.
 * 3. `On Behalf of the Firm`-style candidates expose the real final-eligibility decision.
 * 4. A `novel`-shaped candidate whose description mentions reference-adjacent words
 *    is NOT rejected by `reference_or_scholarship_shape` (Interesting Times fix).
 * 5. Frozen publication-shape controls still reject correctly.
 * 6. No previously rejected guide/criticism/reference/anthology becomes eligible.
 */
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const require = createRequire(import.meta.url);
const ts = require("typescript");

require.extensions[".ts"] = (module, filename) => {
  const source = readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      moduleResolution: ts.ModuleResolutionKind.Node10,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;
  module._compile(output, filename);
};

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertNotEqual(actual, unexpected, message) {
  if (actual === unexpected) {
    throw new Error(`${message}: value should not be ${JSON.stringify(unexpected)}`);
  }
}

function assertTruthy(value, message) {
  if (!value) throw new Error(`${message}: expected truthy, got ${JSON.stringify(value)}`);
}

function assertIncludes(values, expected, message) {
  if (!Array.isArray(values) || !values.includes(expected)) {
    throw new Error(`${message}: expected ${JSON.stringify(values)} to include ${JSON.stringify(expected)}`);
  }
}

function googleBook(id, title, description, categories, publisher = "Test Publisher", publishedDate = "2020", subtitleOverride = "") {
  return {
    kind: "books#volume",
    id,
    volumeInfo: {
      title,
      subtitle: subtitleOverride || undefined,
      authors: ["Regression Author"],
      description,
      categories,
      publisher,
      publishedDate,
      pageCount: 320,
      printType: "BOOK",
      language: "en",
      industryIdentifiers: [{ type: "ISBN_13", identifier: `978000000${id.padStart(4, "0")}` }],
      averageRating: 4.1,
      ratingsCount: 1200,
    },
  };
}

// --- Fixtures ---

// Genuine novel — publication shape: novel — description mentions "companion" (reference-adjacent word)
// Represents the "Interesting Times" class of false positive: frozen shape=novel must survive.
const interestingTimesLike = googleBook(
  "it-001",
  "The Curious Expedition",
  "When wizard Rincewind is sent as an unwilling companion to a distant empire, he must navigate danger and absurdity in this fantasy novel. A companion to the tradition of satirical fantasy, follows characters through comic adventures.",
  ["Fiction / Fantasy / Humorous", "Fiction / Satire"],
  "Corgi Books",
  "1994",
);
// Force the publication-shape classifier to classify it as `novel`.
interestingTimesLike.volumeInfo._overridePublicationShape = "novel";
interestingTimesLike.volumeInfo._overrideStoryLevelNarrativeEvidence = ["character_event_synopsis"];

// Genuine fiction novel with taste signals — should pass all gates.
const onBehalfOfFirm = googleBook(
  "obotf-001",
  "On Behalf of the Firm",
  "A hard-boiled detective story follows a private investigator as she must uncover corporate secrets and survive a dangerous conspiracy in this noir thriller.",
  ["Fiction / Mystery & Detective / Hard-Boiled", "Fiction / Thrillers / Suspense"],
  "Noir House",
  "2019",
);

// Sandman Vol. 6 — graphic novel / comics.  No fiction categories that the adapter can use.
const sandmanVol6 = googleBook(
  "sandman-6",
  "The Sandman Vol. 6: Fables and Reflections",
  "Neil Gaiman's The Sandman continues with a collection of mythological tales and reflections across time and history.",
  ["Comics & Graphic Novels / Superheroes", "Comics & Graphic Novels / Fantasy"],
  "DC Comics",
  "1993",
);

// Control: encyclopedia — must be rejected before or at final eligibility.
const encyclopediaControl = googleBook(
  "enc-001",
  "The Encyclopedia of Science Fiction and Fantasy",
  "A comprehensive encyclopedic reference covering science fiction and fantasy authors, works, themes, and movements in alphabetical order.",
  ["Reference / Encyclopedias", "Literary Criticism / Science Fiction & Fantasy"],
  "Reference Press",
  "2010",
);

// Control: annual anthology — must be rejected.
const anthologyControl = googleBook(
  "anth-001",
  "Best Science Fiction and Fantasy of the Year",
  "An annual anthology collecting the year's best science fiction and fantasy stories, selected and edited by a noted editor.",
  ["Fiction / Science Fiction / Collections & Anthologies", "Fiction / Fantasy / Collections & Anthologies"],
  "Night Shade",
  "2018",
);

// Control: writing guide — must be rejected.
const writingGuideControl = googleBook(
  "wg-001",
  "How to Write a Thriller Novel",
  "A craft guide teaching writers plotting, suspense, character development, and revision techniques for thriller writing.",
  ["Language Arts & Disciplines / Writing", "Reference"],
  "Writer Craft Press",
  "2015",
);

const fixtures = [
  interestingTimesLike,
  onBehalfOfFirm,
  sandmanVol6,
  encyclopediaControl,
  anthologyControl,
  writingGuideControl,
];

globalThis.fetch = async () => ({
  ok: true,
  status: 200,
  text: async () => JSON.stringify({ totalItems: fixtures.length, items: fixtures }),
});

const { runRecommenderV2 } = require(resolve("app/recommender-v2/engine.ts"));

const result = await runRecommenderV2({
  requestId: "googlebooks-final-eligibility-regression",
  ageBand: "adult",
  enabledSources: {
    mock: false,
    googleBooks: true,
    openLibrary: false,
    kitsu: false,
    comicVine: false,
    localLibrary: false,
    nyt: false,
  },
  signals: [
    { action: "like", title: "The Big Sleep", genres: ["Noir", "Mystery"], tags: ["adult", "mystery", "thriller", "noir", "detective"] },
    { action: "like", title: "Gone Girl", genres: ["Psychological Thriller"], tags: ["adult", "thriller", "suspense"] },
  ],
});

const diagnostics = result.diagnostics.rejectedReasons || {};
const sourceDiagnostics = (result.diagnostics.sources || []).find((s) => s.source === "googleBooks") || {};

// Post-ranking decision maps.
const postRankingGate = diagnostics.googleBooksPostRankingGateByTitle || {};
const postRankingReason = diagnostics.googleBooksPostRankingGateReasonByTitle || {};
const finalEligibilityDecision = diagnostics.googleBooksFinalEligibilityDecisionByTitle || {};
const finalEligibilityReason = diagnostics.googleBooksFinalEligibilityReasonByTitle || {};
const finalSelectionDecision = diagnostics.googleBooksFinalSelectionDecisionByTitle || {};
const rejectedBeforeRanking = diagnostics.googleBooksRejectedBeforeRankingReason || {};
const shapes = { ...(sourceDiagnostics.googleBooksPublicationShapeByTitle || {}), ...(diagnostics.googleBooksPublicationShapeByTitle || {}) };
const normalizationEligibility = diagnostics.googleBooksNormalizationEligibilityByTitle || {};
const enteredRanking = diagnostics.googleBooksEnteredRanking || [];

// ── Test 1: Controls must still be rejected before ranking ───────────────────
assertEqual(
  Boolean(rejectedBeforeRanking["The Encyclopedia of Science Fiction and Fantasy"] || !normalizationEligibility["The Encyclopedia of Science Fiction and Fantasy"]),
  true,
  "encyclopedia control must be rejected at or before normalization gate",
);
assertEqual(
  Boolean(rejectedBeforeRanking["Best Science Fiction and Fantasy of the Year"] || !normalizationEligibility["Best Science Fiction and Fantasy of the Year"]),
  true,
  "annual anthology control must be rejected at or before normalization gate",
);
assertEqual(
  Boolean(rejectedBeforeRanking["How to Write a Thriller Novel"] || shapes["How to Write a Thriller Novel"] !== "novel"),
  true,
  "writing guide control must be rejected before ranking or not classified as novel",
);

// ── Test 2: Interesting-Times-class novel must survive normalization gate ─────
// A `novel`-shaped candidate with story-level evidence must NOT be rejected as
// reference_or_scholarship_shape merely because its description mentions "companion".
assertNotEqual(
  rejectedBeforeRanking["The Curious Expedition"],
  "reference_or_scholarship_shape",
  "novel-shaped candidate with companion/reference words in description must NOT be reclassified as reference_or_scholarship_shape",
);

// ── Test 3: Every ranked candidate must have an explicit downstream decision ──
for (const title of enteredRanking) {
  assertTruthy(
    postRankingGate[title] || finalEligibilityDecision[title],
    `ranked candidate "${title}" must have an explicit post-ranking gate or final-eligibility decision`,
  );
  assertNotEqual(
    String(postRankingReason[title] || ""),
    "missing_in_next_googlebooks_stage",
    `ranked candidate "${title}" must not use generic lineage reason as its only explanation`,
  );
}

// ── Test 4: Accepted candidates must show "selected" as their gate outcome ────
const accepted = diagnostics.adultGoogleBooksAcceptedTitles || [];
for (const title of accepted) {
  assertEqual(postRankingGate[title], "selected", `accepted title "${title}" must have gate=selected`);
  assertEqual(postRankingReason[title], "accepted", `accepted title "${title}" must have reason=accepted`);
}

// ── Test 5: finalSelectionDecision must be present for eligibility-passing titles ──
for (const title of enteredRanking) {
  if (finalEligibilityDecision[title] === "accepted") {
    assertTruthy(
      finalSelectionDecision[title],
      `title "${title}" passed eligibility so must have a finalSelectionDecision`,
    );
  }
}

// ── Test 6: On-Behalf-of-Firm style - any title with "missing_in_next" in dropped reason is a failure ──
const droppedReasonByTitle = (result.diagnostics.rejectedReasons?.googleBooksDroppedReasonByTitle) || {};
for (const [title, reason] of Object.entries(droppedReasonByTitle)) {
  if (String(reason || "") === "missing_in_next_googlebooks_stage") {
    // If still present, we must have a real reason elsewhere.
    const hasRealReason = Boolean(finalEligibilityReason[title] || postRankingReason[title]);
    assertTruthy(
      hasRealReason,
      `title "${title}" has generic lineage reason but no real decision in finalEligibilityReason or postRankingReason`,
    );
  }
}

console.log(JSON.stringify({
  name: "adult google books final eligibility observability regressions",
  pass: true,
  enteredRanking,
  accepted,
  postRankingGate,
  finalEligibilityDecision,
  rejectedBeforeRanking,
}, null, 2));
