/**
 * OL-M1: Teen Open Library Mystery Maturity Boundary — Deterministic Regression Suite
 *
 * Validates the selection-layer gate added in OL-M1:
 *   teen_openlibrary_adult_or_crossover_shape_without_independent_teen_authority
 *
 * Scope: selection only — no retrieval, routing, scoring, or source behavior changes.
 * Target: app/recommender-v2/select.ts (teen OL final eligibility path)
 */

import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const OUT_DIR = ".tmp/v2-ol-m1-maturity-boundary-regressions";
const TS_FILES = [
  "app/recommender-v2/tasteProfile.ts",
  "app/recommender-v2/diagnostics.ts",
  "app/recommender-v2/types.ts",
  "app/recommender-v2/engine.ts",
  "app/recommender-v2/select.ts",
  "app/recommender-v2/score.ts",
  "app/recommender-v2/normalize.ts",
  "app/recommender-v2/sources/openLibrarySource.ts",
  "app/recommender-v2/sources/openLibraryProfiles.ts",
];

function compileHarnessDependencies() {
  execFileSync("node", [
    "node_modules/typescript/bin/tsc",
    "--target", "es2020",
    "--module", "commonjs",
    "--moduleResolution", "node",
    "--skipLibCheck",
    "--esModuleInterop",
    "--outDir", OUT_DIR,
    ...TS_FILES,
  ], { stdio: "pipe" });
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

function fakeScoredCandidate(overrides = {}) {
  const title = overrides.title || "Teen OL M1 Candidate";
  return {
    id: overrides.id || title.toLowerCase().replace(/\s+/g, "-"),
    source: overrides.source || "openLibrary",
    title,
    subtitle: overrides.subtitle || "",
    creators: overrides.creators || ["Test Author"],
    description: overrides.description || "",
    coverUrl: overrides.coverUrl || "",
    maturityBand: overrides.maturityBand,
    genres: overrides.genres || ["Mystery"],
    themes: overrides.themes || ["Thriller"],
    score: overrides.score ?? 9,
    matchedSignals: overrides.matchedSignals || [],
    scoreBreakdown: overrides.scoreBreakdown || { sourceQualityRelevance: 2, ageTeenSuitability: 1 },
    diagnostics: overrides.diagnostics || {
      queryText: "teen mystery thriller",
      queryFamily: "mystery_thriller",
      routingReason: "dominant_psychological_mystery_drama",
      metadataBackedMatchedLikedSignals: ["mystery", "thriller"],
      metadataBackedMatchedDislikedSignals: [],
      positiveTasteScore: 3.7,
    },
    rejectedReasons: [],
    raw: overrides.raw || {},
  };
}

async function main() {
  compileHarnessDependencies();

  const { buildTasteProfile } = await import(pathToFileURL(`${process.cwd()}/${OUT_DIR}/tasteProfile.js`).href);
  const { selectRecommendations } = await import(pathToFileURL(`${process.cwd()}/${OUT_DIR}/select.js`).href);

  const teenMysteryProfile = buildTasteProfile({
    ageBand: "teens",
    signals: [
      { action: "like", title: "Murder Mystery Thriller", genres: ["mystery"], themes: ["thriller", "suspense"], format: "book" },
    ],
  });

  // ── Case 1: REJECT ──────────────────────────────────────────────────────────
  // Adult/crossover romance-shaped candidate backed only by generic YA authority.
  // Subjects: "Young adult fiction" (generic), "Adult romance fiction" (adult shape)
  // Expected: rejected with teen_openlibrary_adult_or_crossover_shape_without_independent_teen_authority
  const adultCrossoverCandidate = fakeScoredCandidate({
    id: "adult-crossover-mystery",
    title: "Our Fault",
    score: 11.4,
    description: "A dark romance crossover with mystery suspense for adults. A young adult fiction novel.",
    genres: ["Mystery", "Thriller"],
    themes: ["Romance"],
    raw: {
      subject: ["Young adult fiction", "Mystery fiction", "Thrillers and suspense", "Adult romance fiction", "Enemies to lovers"],
      description: "A dark romance crossover with mystery suspense for adults.",
      first_publish_year: 2021,
      publisher: ["General Adult Fiction"],
    },
    diagnostics: {
      queryText: "teen mystery thriller",
      queryFamily: "mystery_thriller",
      routingReason: "dominant_psychological_mystery_drama",
      metadataBackedMatchedLikedSignals: ["mystery", "thriller", "book"],
      metadataBackedMatchedDislikedSignals: [],
      positiveTasteScore: 3.7,
    },
    scoreBreakdown: { sourceQualityRelevance: 2.1, ageTeenSuitability: 1, genreFacetMatch: 2, positiveTasteMatch: 1.7 },
  });

  const rejectResult = selectRecommendations([adultCrossoverCandidate], teenMysteryProfile, 1);
  assertEqual(rejectResult.selected.length, 0, "[OL-M1-R1] teen mystery selection should reject adult/crossover romance shapes backed only by generic YA authority");
  assertEqual(
    Number(rejectResult.rejectedReasons.teen_openlibrary_adult_or_crossover_shape_without_independent_teen_authority || 0) >= 1,
    true,
    "[OL-M1-R2] maturity boundary rejection must emit explicit reason code",
  );
  console.log(JSON.stringify({ name: "OL-M1-R1,R2: adult/crossover romance with generic YA authority is rejected", pass: true, rejectedReasons: rejectResult.rejectedReasons }));

  // ── Case 2: ACCEPT — independent teen authority present ────────────────────
  // Same adult/crossover shape signal but also has a strong independent teen authority signal
  // (e.g. "american young adult horror fiction" or a grade-level marker).
  // Expected: gate does NOT fire — candidate may proceed to other eligibility checks.
  const independentAuthorityCandidate = fakeScoredCandidate({
    id: "independent-authority-mystery",
    title: "Teen Mystery With Authority",
    score: 10.5,
    description: "A dark romance mystery written explicitly for high school readers.",
    genres: ["Mystery"],
    themes: ["Romance"],
    raw: {
      subject: ["Young adult fiction", "Mystery fiction", "Enemies to lovers", "Adult romance fiction", "High school fiction", "grades 9 and up"],
      description: "A YA mystery debut for grade 9 readers with romance and dark themes.",
      first_publish_year: 2022,
      publisher: ["Teen Pulse"],
    },
    diagnostics: {
      queryText: "teen mystery thriller",
      queryFamily: "mystery_thriller",
      routingReason: "dominant_psychological_mystery_drama",
      metadataBackedMatchedLikedSignals: ["mystery", "thriller"],
      metadataBackedMatchedDislikedSignals: [],
      positiveTasteScore: 3.2,
    },
    scoreBreakdown: { sourceQualityRelevance: 2.0, ageTeenSuitability: 1.5, genreFacetMatch: 2, positiveTasteMatch: 1.5 },
  });

  const acceptResult = selectRecommendations([independentAuthorityCandidate], teenMysteryProfile, 1);
  // The gate must NOT fire when independent teen authority is present.
  // (Another gate may still reject for other reasons, so we check reason code absence, not selected.length.)
  assertEqual(
    Number(acceptResult.rejectedReasons.teen_openlibrary_adult_or_crossover_shape_without_independent_teen_authority || 0),
    0,
    "[OL-M1-R3] maturity boundary gate must not fire when independent teen authority evidence is present",
  );
  console.log(JSON.stringify({ name: "OL-M1-R3: adult/crossover shape with independent teen authority does not trigger gate", pass: true, rejectedReasons: acceptResult.rejectedReasons }));

  // ── Case 3: ACCEPT — no adult/crossover shape at all ──────────────────────
  // Clean teen mystery candidate with no adult/crossover shape signals.
  // Expected: gate does not fire; candidate is accepted.
  const cleanTeenCandidate = fakeScoredCandidate({
    id: "clean-teen-mystery",
    title: "Lock and Key",
    score: 10.2,
    description: "A teen mystery novel with suspense and psychological thriller elements.",
    genres: ["Mystery"],
    themes: ["Thriller", "Suspense"],
    raw: {
      subject: ["Young adult fiction", "Mystery fiction", "Thrillers and suspense", "Teen fiction", "High school"],
      description: "A YA mystery debut with psychological thriller and school drama.",
      first_publish_year: 2023,
      publisher: ["Simon Pulse"],
    },
    diagnostics: {
      queryText: "teen mystery thriller",
      queryFamily: "mystery_thriller",
      routingReason: "dominant_psychological_mystery_drama",
      metadataBackedMatchedLikedSignals: ["mystery", "thriller"],
      metadataBackedMatchedDislikedSignals: [],
      positiveTasteScore: 3.5,
    },
    scoreBreakdown: { sourceQualityRelevance: 2.5, ageTeenSuitability: 1.5, genreFacetMatch: 2, positiveTasteMatch: 2 },
  });

  const cleanResult = selectRecommendations([cleanTeenCandidate], teenMysteryProfile, 1);
  assertEqual(
    Number(cleanResult.rejectedReasons.teen_openlibrary_adult_or_crossover_shape_without_independent_teen_authority || 0),
    0,
    "[OL-M1-R4] maturity boundary gate must not fire for clean teen mystery candidates",
  );
  console.log(JSON.stringify({ name: "OL-M1-R4: clean teen mystery candidate is not blocked by OL-M1 gate", pass: true, selected: cleanResult.selected.length, rejectedReasons: cleanResult.rejectedReasons }));

  // ── Case 4: REJECT — multiple candidates, only adult/crossover blocked ─────
  // Mixed slate: one adult/crossover (no independent authority), one clean teen.
  // Expected: clean teen selected, adult/crossover rejected with OL-M1 reason.
  const mixedResult = selectRecommendations(
    [
      { ...adultCrossoverCandidate, score: 14, id: "mixed-adult" },
      { ...cleanTeenCandidate, score: 12, id: "mixed-clean" },
    ],
    teenMysteryProfile,
    2,
  );
  assertEqual(
    Number(mixedResult.rejectedReasons.teen_openlibrary_adult_or_crossover_shape_without_independent_teen_authority || 0) >= 1,
    true,
    "[OL-M1-R5] mixed slate: adult/crossover candidate must be rejected with OL-M1 reason",
  );
  console.log(JSON.stringify({ name: "OL-M1-R5: mixed slate rejects adult/crossover and may accept clean teen", pass: true, selected: mixedResult.selected.length, rejectedReasons: mixedResult.rejectedReasons }));

  console.log(JSON.stringify({ name: "OL-M1 maturity boundary regression suite", result: "ALL_PASS", cases: 5 }));
}

await main();
