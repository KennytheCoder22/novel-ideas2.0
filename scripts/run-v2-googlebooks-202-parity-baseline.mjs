/**
 * #202 parity-baseline capture script.
 *
 * Captures the CURRENT behavior of the two semantic phrase extraction
 * implementations before any consolidation work begins on #202.
 *
 *   Adult: adultGoogleBooksSignalMatch* fields (score.ts + select.ts)
 *   Teen:  teenGoogleBooksSignalFieldsByTitle (select.ts)
 *
 * All fixtures are deterministic synthetic candidates; no live Google Books
 * API calls are made.  The baseline artifact is the pre-change oracle for the
 * #202 parity comparator.
 *
 * Usage:
 *   node scripts/run-v2-googlebooks-202-parity-baseline.mjs
 *
 * Outputs:
 *   scripts/output/googlebooks-202-parity-baseline.json
 *   scripts/output/googlebooks-202-parity-baseline.csv
 */

import { createRequire } from "node:module";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const outDir = resolve(scriptDir, "output");

// ---------------------------------------------------------------------------
// TypeScript loader
// ---------------------------------------------------------------------------

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

const appDir = resolve(repoRoot, "app/recommender-v2");
const { scoreCandidates } = require(resolve(appDir, "score.ts"));
const { selectRecommendations } = require(resolve(appDir, "select.ts"));

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function contentSignature(value) {
  return createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex")
    .slice(0, 16);
}

function mapObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function arrayValue(value) {
  return Array.isArray(value) ? value : [];
}

// ---------------------------------------------------------------------------
// Prerequisite regression checks (code-driven scripts only)
// ---------------------------------------------------------------------------

function runPrerequisite(scriptName) {
  const scriptPath = resolve(scriptDir, scriptName);
  const result = spawnSync(process.execPath, [scriptPath], {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: 60000,
  });
  if (result.status === 0 && !result.error) return { status: "pass", output: String(result.stdout || "").trim().split("\n").at(-1) || "pass" };
  const errText = String(result.stderr || result.stdout || result.error?.message || "unknown error").trim().split("\n").at(0) || "failed";
  return { status: "fail", error: errText };
}

// ---------------------------------------------------------------------------
// Adult fixture helpers
// ---------------------------------------------------------------------------

function adultProfile(likedSignals, dislikedSignals = []) {
  return {
    ageBand: "adult",
    maturityBand: "adult",
    genreFamily: likedSignals.map((value) => ({ value, weight: 1, evidence: [`like:${value}`] })),
    tone: [],
    pacing: [],
    themes: [],
    characterDynamics: [],
    formatPreference: [],
    avoidSignals: dislikedSignals.map((value) => ({ value, weight: 1, evidence: [`dislike:${value}`] })),
    sourceHints: ["googleBooks"],
    diagnostics: {},
  };
}

function adultCandidate(title, description, genres = ["Fiction / Thrillers / Suspense"]) {
  return {
    id: `gb-202-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    source: "googleBooks",
    sourceId: title,
    title,
    subtitle: "",
    creators: ["Baseline Author"],
    description,
    formats: ["book"],
    genres,
    themes: [],
    tones: [],
    characterDynamics: [],
    maturityBand: "adult",
    publicationYear: 2024,
    sourceUrl: "https://books.google.example/202-baseline",
    raw: {
      publisher: "Baseline House",
      volumeInfo: {
        publisher: "Baseline House",
        publishedDate: "2024",
        categories: genres,
        maturityRating: "NOT_MATURE",
        printType: "BOOK",
        language: "en",
      },
    },
    diagnostics: {
      googleBooksPublicationShape: "novel",
      googleBooksPublicationShapeEvidence: ["baseline_fixture"],
      googleBooksPublicationShapePrecedenceDecision: "novel_supported_by_story_level_evidence",
      googleBooksStoryLevelNarrativeEvidence: ["narrative_synopsis"],
      queryText: "fiction thriller",
      queryFamily: "thriller",
      facets: ["thriller"],
    },
  };
}

function captureAdultFixture(fixtureName, signals, candidate, dislikedSignals = []) {
  const profile = adultProfile(signals, dislikedSignals);
  const scored = scoreCandidates([candidate], profile)[0];
  const { rejectedReasons } = selectRecommendations([scored], profile, 1);

  const scoredFields = {
    metadataBackedMatchedLikedSignals: arrayValue(scored.diagnostics?.metadataBackedMatchedLikedSignals),
    metadataBackedMatchedDislikedSignals: arrayValue(scored.diagnostics?.metadataBackedMatchedDislikedSignals),
    adultGoogleBooksSignalMatchTrace: arrayValue(scored.diagnostics?.adultGoogleBooksSignalMatchTrace),
    adultGoogleBooksSignalMatchedField: mapObject(scored.diagnostics?.adultGoogleBooksSignalMatchedField),
    adultGoogleBooksSignalMatchedText: mapObject(scored.diagnostics?.adultGoogleBooksSignalMatchedText),
    adultGoogleBooksSignalMatchMethod: mapObject(scored.diagnostics?.adultGoogleBooksSignalMatchMethod),
    adultGoogleBooksRejectedShortSignalMatches: arrayValue(scored.diagnostics?.adultGoogleBooksRejectedShortSignalMatches),
  };

  const selectionFields = {
    adultGoogleBooksSignalMatchTraceByTitle: mapObject(rejectedReasons?.adultGoogleBooksSignalMatchTraceByTitle),
    adultGoogleBooksSignalMatchedFieldByTitle: mapObject(rejectedReasons?.adultGoogleBooksSignalMatchedFieldByTitle),
    adultGoogleBooksSignalMatchedTextByTitle: mapObject(rejectedReasons?.adultGoogleBooksSignalMatchedTextByTitle),
    adultGoogleBooksSignalMatchMethodByTitle: mapObject(rejectedReasons?.adultGoogleBooksSignalMatchMethodByTitle),
  };

  const candidateTitle = candidate.title;
  const perTitle = {
    matchedTrace: arrayValue(selectionFields.adultGoogleBooksSignalMatchTraceByTitle[candidateTitle]),
    matchedFields: mapObject(selectionFields.adultGoogleBooksSignalMatchedFieldByTitle[candidateTitle]),
    matchedTexts: mapObject(selectionFields.adultGoogleBooksSignalMatchedTextByTitle[candidateTitle]),
    matchedMethods: mapObject(selectionFields.adultGoogleBooksSignalMatchMethodByTitle[candidateTitle]),
  };

  return {
    fixtureName,
    candidateTitle,
    ageBand: "adult",
    likedSignals: signals,
    dislikedSignals,
    score: Number(scored.score || 0),
    scoredFields,
    perTitle,
    contentSignature: contentSignature({ scoredFields, perTitle }),
  };
}

// ---------------------------------------------------------------------------
// Teen fixture helpers
// ---------------------------------------------------------------------------

function teenProfile(likedSignals, dislikedSignals = []) {
  return {
    ageBand: "teens",
    maturityBand: "teens",
    genreFamily: likedSignals.map((value) => ({ value, weight: 1, evidence: [`like:teens:${value}`] })),
    tone: [],
    pacing: [],
    themes: [],
    characterDynamics: [],
    formatPreference: [],
    avoidSignals: dislikedSignals.map((value) => ({ value, weight: 1, evidence: [`dislike:teens:${value}`] })),
    sourceHints: ["googleBooks"],
    diagnostics: {},
  };
}

function teenCandidate(title, description, genres = ["Young Adult Fiction"], subtitleText = "") {
  return {
    id: `gb-202-teen-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    source: "googleBooks",
    sourceId: title,
    title,
    subtitle: subtitleText,
    creators: ["Teen Baseline Author"],
    description,
    formats: ["book"],
    genres,
    themes: [],
    tones: [],
    characterDynamics: [],
    maturityBand: "teens",
    publicationYear: 2023,
    sourceUrl: "https://books.google.example/202-teen-baseline",
    raw: {
      publisher: "Teen Baseline House",
      subtitle: subtitleText,
      volumeInfo: {
        publisher: "Teen Baseline House",
        publishedDate: "2023",
        categories: genres,
        maturityRating: "NOT_MATURE",
        printType: "BOOK",
        language: "en",
        description,
      },
    },
    diagnostics: {
      googleBooksPublicationShape: "novel",
      googleBooksPublicationShapeEvidence: ["baseline_fixture"],
      googleBooksPublicationShapePrecedenceDecision: "novel_supported_by_story_level_evidence",
      googleBooksStoryLevelNarrativeEvidence: ["narrative_synopsis"],
      googleBooksAudienceBand: "teens",
      googleBooksContentMaturity: "not_mature",
      queryText: "young adult fiction",
      queryFamily: "contemporary",
      facets: ["ya"],
    },
  };
}

function captureTeenFixture(fixtureName, signals, candidate) {
  const profile = teenProfile(signals);
  const scored = scoreCandidates([candidate], profile)[0];
  const { rejectedReasons } = selectRecommendations([scored], profile, 1);

  const candidateTitle = candidate.title;
  const signalFieldsByTitle = mapObject(rejectedReasons?.teenGoogleBooksSignalFieldsByTitle);
  const perTitleSignalFields = mapObject(signalFieldsByTitle[candidateTitle]);

  return {
    fixtureName,
    candidateTitle,
    ageBand: "teen",
    likedSignals: signals,
    score: Number(scored.score || 0),
    selectionFields: {
      teenGoogleBooksSignalFieldsByTitle: signalFieldsByTitle,
    },
    perTitleSignalFields,
    contentSignature: contentSignature({ perTitleSignalFields }),
  };
}

// ---------------------------------------------------------------------------
// Run prerequisite regressions
// ---------------------------------------------------------------------------

console.log("=== GOOGLE BOOKS #202 PARITY BASELINE ===");
console.log("Running prerequisite regressions...");

const shortSignalResult = runPrerequisite("run-v2-googlebooks-short-signal-boundary-regressions.mjs");
const queryQualityResult = runPrerequisite("run-v2-googlebooks-query-quality-regressions.mjs");

console.log(`  short-signal-boundary-regressions: ${shortSignalResult.status}`);
console.log(`  query-quality-regressions:         ${queryQualityResult.status}`);
console.log(`  teen-weak-metadata-sufficiency-audit: skipped_requires_report_args`);

const prerequisiteRegressions = {
  "run-v2-googlebooks-short-signal-boundary-regressions.mjs": shortSignalResult,
  "run-v2-googlebooks-query-quality-regressions.mjs": queryQualityResult,
  "run-v2-googlebooks-teen-weak-metadata-sufficiency-audit.mjs": {
    status: "skipped_requires_report_args",
    note: "Report-driven audit; must be run separately with --report <path> flags and compared output-to-output.",
  },
};

const prerequisiteCodeDrivenPassed =
  shortSignalResult.status === "pass" && queryQualityResult.status === "pass";

// ---------------------------------------------------------------------------
// Capture Adult fixtures
// ---------------------------------------------------------------------------

console.log("\nCapturing adult signal extraction fixtures...");

const adultFixtures = [

  // --- Method: unicode_token_boundary ---
  captureAdultFixture(
    "adult_ai_token_boundary",
    ["ai"],
    adultCandidate(
      "AI Token Boundary",
      "An AI system begins to make impossible choices that no human could predict.",
      ["Fiction / Science Fiction / General"],
    ),
  ),

  // --- Method: punctuated_acronym_token ---
  captureAdultFixture(
    "adult_ai_punctuated_acronym",
    ["ai"],
    adultCandidate(
      "AI Punctuated Acronym",
      "An A.I. experiment begins to make impossible choices and reorders society.",
      ["Fiction / Science Fiction / General"],
    ),
  ),

  // --- Method: approved_alias_phrase ---
  captureAdultFixture(
    "adult_ai_alias_phrase",
    ["ai"],
    adultCandidate(
      "AI Alias Phrase",
      "An artificial intelligence begins to make impossible choices that threaten civilization.",
      ["Fiction / Science Fiction / General"],
    ),
  ),

  // --- Rejected: substring embedding ---
  captureAdultFixture(
    "adult_ai_substring_reject",
    ["ai"],
    adultCandidate(
      "AI Substring Reject",
      "The captain said that against certain odds the trail disappeared, yet everyone remained calm.",
      ["Fiction / Thrillers / Suspense"],
    ),
  ),

  // --- Short signal: valid standalone token ---
  captureAdultFixture(
    "adult_war_valid_standalone",
    ["war"],
    adultCandidate(
      "War Valid Standalone",
      "A war changes a divided family forever as opposing sides discover a shared humanity.",
      ["Fiction / War & Military", "Fiction / Historical Fiction"],
    ),
  ),

  // --- Short signal: invalid embedded ---
  captureAdultFixture(
    "adult_war_invalid_embedded",
    ["war"],
    adultCandidate(
      "War Invalid Embedded",
      "A warmhearted neighbor changes a divided family forever in this touching drama.",
      ["Fiction / Contemporary", "Fiction / Family Life"],
    ),
  ),

  // --- Multiword signal ---
  captureAdultFixture(
    "adult_science_fiction_multiword",
    ["science fiction"],
    adultCandidate(
      "Science Fiction Multiword",
      "A science fiction novel follows an investigator through near-future cities.",
      ["Fiction / Science Fiction / Thriller", "Fiction / Action & Adventure"],
    ),
  ),

  // --- Psychological thriller multiword ---
  captureAdultFixture(
    "adult_psychological_thriller_multiword",
    ["psychological thriller"],
    adultCandidate(
      "Psychological Thriller Multiword",
      "A psychological thriller about memory loss and identity in an isolated mountain town.",
      ["Fiction / Thrillers / Psychological", "Fiction / Mystery & Detective"],
    ),
  ),

  // --- Disliked signal avoid side ---
  captureAdultFixture(
    "adult_disliked_art_embedded",
    ["thriller"],
    adultCandidate(
      "Disliked Art Embedded",
      "An art heist thriller follows a former detective uncovering corruption.",
      ["Fiction / Thrillers / Suspense"],
    ),
    ["art"],
  ),

  // --- Multi-signal trace (canonical trace candidate) ---
  captureAdultFixture(
    "adult_multi_signal_trace",
    ["ai", "thriller"],
    adultCandidate(
      "Multi Signal Trace",
      "An AI-driven thriller follows a detective unraveling a conspiracy in a surveillance state.",
      ["Fiction / Thrillers / Suspense", "Fiction / Science Fiction / Cyberpunk"],
    ),
  ),

  // --- Signal in description + in categories ---
  captureAdultFixture(
    "adult_signal_in_category",
    ["dark fantasy"],
    adultCandidate(
      "Signal In Category",
      "A detective investigates a series of mysterious disappearances in a grim historical setting.",
      ["Fiction / Dark Fantasy", "Fiction / Mystery & Detective"],
    ),
  ),

  // --- Role-playing game approved alias ---
  captureAdultFixture(
    "adult_rpg_alias",
    ["rpg"],
    adultCandidate(
      "RPG Alias",
      "A role-playing game writer is pulled into a conspiracy spanning three continents.",
      ["Fiction / Thrillers / Suspense", "Fiction / Fantasy"],
    ),
  ),

];

console.log(`  Adult fixtures captured: ${adultFixtures.length}`);

// ---------------------------------------------------------------------------
// Capture Teen fixtures
// ---------------------------------------------------------------------------

console.log("\nCapturing teen signal extraction fixtures...");

const teenFixtures = [

  // --- Signal only in description ---
  captureTeenFixture(
    "teen_signal_description_only",
    ["dystopian"],
    teenCandidate(
      "Teen Dystopian Description",
      "A dystopian society forces young citizens to choose between obedience and survival.",
      ["Young Adult Fiction / Fantasy & Magic"],
    ),
  ),

  // --- Signal only in categories ---
  captureTeenFixture(
    "teen_signal_category_only",
    ["mystery"],
    teenCandidate(
      "Teen Mystery Category",
      "A teenager investigates an unsolved disappearance in her small town.",
      ["Young Adult Fiction / Mystery & Detective Stories", "Young Adult Fiction / Contemporary"],
    ),
  ),

  // --- Signal in title ---
  captureTeenFixture(
    "teen_signal_title",
    ["fantasy"],
    teenCandidate(
      "Fantasy Quest Teen",
      "A group of unlikely friends embarks on an impossible journey to restore balance.",
      ["Young Adult Fiction / Adventure"],
    ),
  ),

  // --- Signal in both description and categories ---
  captureTeenFixture(
    "teen_signal_multi_field",
    ["romance"],
    teenCandidate(
      "Teen Romance Multi Field",
      "A romance blossoms between rivals forced together by a school science project.",
      ["Young Adult Fiction / Romance / Contemporary", "Young Adult Fiction / Contemporary"],
    ),
  ),

  // --- Signal in subtitle only ---
  captureTeenFixture(
    "teen_signal_subtitle_only",
    ["thriller"],
    teenCandidate(
      "Teen Subtitle Fixture",
      "Two friends must work together to expose the truth before someone gets hurt.",
      ["Young Adult Fiction / Contemporary"],
      "A Thriller Novel",
    ),
  ),

  // --- Signal absent (no match expected) ---
  captureTeenFixture(
    "teen_signal_no_match",
    ["science fiction"],
    teenCandidate(
      "Teen No Match",
      "A coming-of-age story about finding courage in an ordinary small town.",
      ["Young Adult Fiction / Contemporary"],
    ),
  ),

  // --- Multiword signal ---
  captureTeenFixture(
    "teen_signal_multiword",
    ["young adult"],
    teenCandidate(
      "Teen Multiword YA",
      "This young adult novel follows a girl navigating high school and identity.",
      ["Young Adult Fiction / Social Themes"],
    ),
  ),

];

console.log(`  Teen fixtures captured: ${teenFixtures.length}`);

// ---------------------------------------------------------------------------
// Commit metadata
// ---------------------------------------------------------------------------

let baselineCommit = "unknown";
try {
  const { spawnSync: spawn } = await import("node:child_process");
  const result = spawn("git", ["rev-parse", "HEAD"], { cwd: repoRoot, encoding: "utf8" });
  if (result.status === 0) baselineCommit = String(result.stdout || "").trim();
} catch {
  baselineCommit = "unknown";
}

// ---------------------------------------------------------------------------
// Content signature over complete fixture set
// ---------------------------------------------------------------------------

const overallAdultSignature = contentSignature(adultFixtures.map((f) => f.contentSignature));
const overallTeenSignature = contentSignature(teenFixtures.map((f) => f.contentSignature));
const overallSignature = contentSignature([overallAdultSignature, overallTeenSignature]);

const baselineComplete = prerequisiteCodeDrivenPassed;

// ---------------------------------------------------------------------------
// Assemble output
// ---------------------------------------------------------------------------

const output = {
  generatedAt: new Date().toISOString(),
  baselineCommit,
  fixtureCorpusVersion: "202-v1",
  prerequisiteRegressions,
  baselineComplete,
  baselineCompleteNote: baselineComplete
    ? "All code-driven prerequisite regressions passed. Baseline is ready for use as a parity oracle."
    : "One or more code-driven prerequisite regressions FAILED. Do not proceed with #202 implementation until prerequisites pass.",
  signatures: {
    overallBaseline: overallSignature,
    adultFixtureSet: overallAdultSignature,
    teenFixtureSet: overallTeenSignature,
  },
  adultFixtures,
  teenFixtures,
};

mkdirSync(outDir, { recursive: true });

const jsonOut = resolve(outDir, "googlebooks-202-parity-baseline.json");
const csvOut = resolve(outDir, "googlebooks-202-parity-baseline.csv");

writeFileSync(jsonOut, JSON.stringify(output, null, 2));

// Build CSV: one row per fixture
const csvHeader = [
  "fixtureName",
  "ageBand",
  "candidateTitle",
  "likedSignals",
  "dislikedSignals",
  "score",
  "matchedLikedSignals",
  "rejectedShortMatchCount",
  "signalMatchMethodCount",
  "perTitleFieldsOrSignals",
  "contentSignature",
].join(",");

const csvRows = [
  ...adultFixtures.map((f) => {
    const disliked = (f.dislikedSignals || []).join(";");
    const likedMatched = (f.scoredFields?.metadataBackedMatchedLikedSignals || []).join(";");
    const rejectedCount = (f.scoredFields?.adultGoogleBooksRejectedShortSignalMatches || []).length;
    const methodKeys = Object.keys(f.perTitle?.matchedMethods || {}).join(";");
    const fieldKeys = Object.entries(mapObject(f.perTitle?.matchedFields || {}))
      .map(([sig, fields]) => `${sig}:${arrayValue(fields).join("+")}`)
      .join(";");
    return [
      `"${f.fixtureName}"`,
      f.ageBand,
      `"${f.candidateTitle}"`,
      `"${(f.likedSignals || []).join(";")}"`,
      `"${disliked}"`,
      String(f.score),
      `"${likedMatched}"`,
      String(rejectedCount),
      `"${methodKeys}"`,
      `"${fieldKeys}"`,
      f.contentSignature,
    ].join(",");
  }),
  ...teenFixtures.map((f) => {
    const signalCount = Object.keys(f.perTitleSignalFields || {}).length;
    const fieldSummary = Object.entries(mapObject(f.perTitleSignalFields || {}))
      .map(([sig, fields]) => `${sig}:${arrayValue(fields).join("+")}`)
      .join(";");
    return [
      `"${f.fixtureName}"`,
      f.ageBand,
      `"${f.candidateTitle}"`,
      `"${(f.likedSignals || []).join(";")}"`,
      `""`,
      String(f.score),
      `"${signalCount} matched signals"`,
      `0`,
      `""`,
      `"${fieldSummary}"`,
      f.contentSignature,
    ].join(",");
  }),
];

writeFileSync(csvOut, [csvHeader, ...csvRows].join("\n"));

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

const failedPrereqs = Object.entries(prerequisiteRegressions)
  .filter(([, v]) => v.status === "fail")
  .map(([k]) => k);

console.log(`\n=== BASELINE SUMMARY ===`);
console.log(`Baseline commit:        ${baselineCommit}`);
console.log(`Fixture corpus version: 202-v1`);
console.log(`Adult fixtures:         ${adultFixtures.length}`);
console.log(`Teen fixtures:          ${teenFixtures.length}`);
console.log(`Prerequisite status:`);
for (const [name, result] of Object.entries(prerequisiteRegressions)) {
  console.log(`  ${name}: ${result.status}`);
}
console.log(`Baseline complete: ${baselineComplete}`);
if (failedPrereqs.length > 0) {
  console.log(`\nFAILED prerequisites: ${failedPrereqs.join(", ")}`);
  console.log("Do not proceed with #202 implementation until prerequisites pass.");
} else {
  console.log("\nAll code-driven prerequisites passed. Baseline ready for comparison.");
}
console.log(`Overall signature:  ${overallSignature}`);
console.log(`JSON written to: ${jsonOut}`);
console.log(`CSV written to:  ${csvOut}`);
