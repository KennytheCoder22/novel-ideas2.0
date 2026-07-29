/**
 * #203 canonical-cue promotion novelty/equivalence gate.
 *
 * Goal:
 * - Determine whether Adult and Teen "canonical cue promotion" are behaviorally
 *   equivalent duplication or materially different mechanisms.
 * - Emit a machine-readable decision artifact before any consolidation work.
 *
 * Usage:
 *   node scripts/run-v2-googlebooks-203-canonical-cue-equivalence-gate.mjs
 *
 * Outputs:
 *   scripts/output/googlebooks-203-canonical-cue-equivalence-gate.json
 *   scripts/output/googlebooks-203-canonical-cue-equivalence-gate.csv
 */

import { createRequire } from "node:module";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const outDir = resolve(scriptDir, "output");

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

function normalized(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function mapObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function arrayValue(value) {
  return Array.isArray(value) ? value : [];
}

function mkProfile(ageBand, likedSignals = [], dislikedSignals = []) {
  const toWeighted = (value, kind) => ({ value, weight: 1, evidence: [`${kind}:${ageBand}:${value}`] });
  return {
    ageBand,
    maturityBand: ageBand,
    genreFamily: likedSignals.map((value) => toWeighted(value, "like")),
    tone: [],
    pacing: [],
    themes: [],
    characterDynamics: [],
    formatPreference: [{ value: "book", weight: 1, evidence: [`format:${ageBand}:book`] }],
    avoidSignals: dislikedSignals.map((value) => toWeighted(value, "dislike")),
    sourceHints: ["googleBooks"],
    diagnostics: {},
  };
}

function mkCandidate(input) {
  const genres = Array.isArray(input.genres) ? input.genres : ["Fiction / General"];
  const description = String(input.description || "");
  const subtitle = String(input.subtitle || "");
  const title = String(input.title || "Untitled");
  const maturityBand = input.maturityBand || "adult";
  return {
    id: `gb-203-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    source: "googleBooks",
    sourceId: title,
    title,
    subtitle,
    creators: ["Gate Fixture Author"],
    description,
    formats: ["book"],
    genres,
    themes: [],
    tones: [],
    characterDynamics: [],
    maturityBand,
    publicationYear: 2024,
    sourceUrl: "https://books.google.example/203-gate",
    raw: {
      subtitle,
      description,
      volumeInfo: {
        subtitle,
        description,
        categories: genres,
        maturityRating: "NOT_MATURE",
        printType: "BOOK",
        language: "en",
        publishedDate: "2024",
      },
    },
    diagnostics: {
      googleBooksPublicationShape: "novel",
      googleBooksPublicationShapeEvidence: ["gate_fixture_novel"],
      googleBooksPublicationShapePrecedenceDecision: "novel_supported_by_story_level_evidence",
      googleBooksStoryLevelNarrativeEvidence: ["narrative_synopsis"],
      queryText: "fiction novel",
      queryFamily: "general",
      facets: ["fiction"],
      googleBooksAudienceBand: maturityBand === "teens" ? "teens" : "adult",
      googleBooksContentMaturity: "not_mature",
      googleBooksSourceMaturityRating: "NOT_MATURE",
    },
  };
}

function gatherAdultObservability(rejectedReasons, title) {
  const byTitlePromotions = mapObject(rejectedReasons.adultGoogleBooksCanonicalNarrativeFamilyPromotionsByTitle);
  const byTitleEvidence = mapObject(rejectedReasons.adultGoogleBooksCanonicalNarrativeFamilyPromotionEvidenceByTitle);
  const byTitleFields = mapObject(rejectedReasons.adultGoogleBooksCanonicalNarrativeFamilyPromotionFieldByTitle);
  const byTitlePhrases = mapObject(rejectedReasons.adultGoogleBooksCanonicalNarrativeFamilyPromotionPhraseByTitle);
  const byTitleDecision = mapObject(rejectedReasons.adultGoogleBooksCanonicalNarrativeFamilyPromotionDecisionByTitle);
  const meaningfulPassed = mapObject(rejectedReasons.adultGoogleBooksMeaningfulTastePassedByTitle);
  const finalEligibility = mapObject(rejectedReasons.googleBooksFinalEligibilityDecisionByTitle);
  return {
    promotionFamilies: arrayValue(byTitlePromotions[title]).map(String),
    promotionEvidence: arrayValue(byTitleEvidence[title]),
    promotionFields: arrayValue(byTitleFields[title]).map(String),
    promotionPhrases: arrayValue(byTitlePhrases[title]).map(String),
    promotionDecisions: arrayValue(byTitleDecision[title]),
    meaningfulTastePassed: meaningfulPassed[title] === true,
    finalEligibilityDecision: String(finalEligibility[title] || ""),
  };
}

function gatherTeenObservability(rejectedReasons, title) {
  const signalFieldsByTitle = mapObject(rejectedReasons.teenGoogleBooksSignalFieldsByTitle);
  const docNativeSpecificByTitle = mapObject(rejectedReasons.teenGoogleBooksDocumentNativeSpecificSignalsByTitle);
  const classificationByTitle = mapObject(rejectedReasons.teenGoogleBooksMeaningfulTasteClassificationByTitle);
  const finalEligibility = mapObject(rejectedReasons.googleBooksFinalEligibilityDecisionByTitle);
  return {
    signalFields: mapObject(signalFieldsByTitle[title]),
    documentNativeSpecificSignals: arrayValue(docNativeSpecificByTitle[title]).map(String),
    meaningfulClassification: String(classificationByTitle[title] || ""),
    finalEligibilityDecision: String(finalEligibility[title] || ""),
    hasCanonicalPromotionDiagnostics:
      Object.prototype.hasOwnProperty.call(rejectedReasons, "teenGoogleBooksCanonicalNarrativeFamilyPromotionsByTitle")
      || Object.prototype.hasOwnProperty.call(rejectedReasons, "teenGoogleBooksCanonicalNarrativeFamilyPromotionEvidenceByTitle"),
  };
}

function runFixtureCase(testCase) {
  const baseCandidate = mkCandidate(testCase);
  const adultCandidate = { ...baseCandidate, maturityBand: "adult" };
  const teenCandidate = { ...baseCandidate, maturityBand: "teens" };

  const adultProfile = mkProfile("adult", testCase.likedSignals || [], testCase.dislikedSignals || []);
  const teenProfile = mkProfile("teens", testCase.likedSignals || [], testCase.dislikedSignals || []);

  const adultScored = scoreCandidates([adultCandidate], adultProfile);
  const teenScored = scoreCandidates([teenCandidate], teenProfile);
  const adultSel = selectRecommendations(adultScored, adultProfile, 5);
  const teenSel = selectRecommendations(teenScored, teenProfile, 5);

  const adultObs = gatherAdultObservability(adultSel.rejectedReasons || {}, adultCandidate.title);
  const teenObs = gatherTeenObservability(teenSel.rejectedReasons || {}, teenCandidate.title);

  const anyAdultPromotionApplied = adultObs.promotionDecisions.some((entry) => String(entry?.applied || "").toLowerCase() === "true" || entry?.applied === true);
  const adultEligibilityChangedByPromotion = adultObs.promotionDecisions.some((entry) => {
    const before = normalized(entry?.finalEligibilityBefore || "");
    const after = normalized(entry?.finalEligibilityAfter || "");
    return Boolean(before && after && before !== after);
  });
  const adultMeaningfulChangedByPromotion = adultObs.promotionDecisions.some((entry) => {
    const before = normalized(entry?.meaningfulAlignmentBefore || "");
    const after = normalized(entry?.meaningfulAlignmentAfter || "");
    return Boolean(before && after && before !== after);
  });

  return {
    caseId: testCase.caseId,
    label: testCase.label,
    cueSituation: testCase.cueSituation,
    adult: {
      promotionFamilies: adultObs.promotionFamilies,
      promotionFields: adultObs.promotionFields,
      promotionPhrases: adultObs.promotionPhrases,
      promotionDecisionCount: adultObs.promotionDecisions.length,
      promotionApplied: anyAdultPromotionApplied,
      meaningfulTastePassed: adultObs.meaningfulTastePassed,
      finalEligibilityDecision: adultObs.finalEligibilityDecision,
      eligibilityChangedByPromotion: adultEligibilityChangedByPromotion,
      meaningfulAlignmentChangedByPromotion: adultMeaningfulChangedByPromotion,
      promotionDecisions: adultObs.promotionDecisions,
    },
    teen: {
      hasCanonicalPromotionDiagnostics: teenObs.hasCanonicalPromotionDiagnostics,
      signalFields: teenObs.signalFields,
      documentNativeSpecificSignals: teenObs.documentNativeSpecificSignals,
      meaningfulClassification: teenObs.meaningfulClassification,
      finalEligibilityDecision: teenObs.finalEligibilityDecision,
    },
  };
}

function staticInventoryFromSource() {
  const sourcePath = resolve(appDir, "select.ts");
  const source = readFileSync(sourcePath, "utf8");
  const lines = source.split(/\r?\n/);

  const hasAdultPromotionFunction = /function\s+adultGoogleBooksCanonicalNarrativeFamilyPromotions\s*\(/.test(source);
  const hasAdultAgeGuard = /profile\?\.ageBand\s*!==\s*"adult"/.test(source);
  const hasTeenCanonicalPromotionFunction = /function\s+teenGoogleBooksCanonicalNarrativeFamilyPromotions\s*\(/.test(source);
  const hasTeenCanonicalPromotionDiagnostics = /teenGoogleBooksCanonicalNarrativeFamilyPromotionsByTitle/.test(source);

  const adultCueCount = lines.filter((line) => line.includes("ADULT_GOOGLEBOOKS_NARRATIVE_CUES")).length > 0
    ? (source.match(/phrase:\s*"/g) || []).length
    : 0;
  const canonicalCueSetSize = (() => {
    const start = source.indexOf("const ADULT_GOOGLEBOOKS_CANONICAL_NARRATIVE_CUES = new Set([");
    if (start < 0) return 0;
    const end = source.indexOf("]);", start);
    if (end < 0) return 0;
    const block = source.slice(start, end);
    return (block.match(/"/g) || []).length / 2;
  })();

  return {
    sourcePath,
    hasAdultPromotionFunction,
    hasAdultAgeGuard,
    hasTeenCanonicalPromotionFunction,
    hasTeenCanonicalPromotionDiagnostics,
    adultCueDefinitionApproxCount: adultCueCount,
    adultCanonicalCueSetSize: canonicalCueSetSize,
    adultUsesFields: ["title", "subtitle", "categories", "genres", "description (filtered segments)"],
    teenExposedSignalsField: "teenGoogleBooksDocumentNativeSpecificSignalsByTitle",
  };
}

const fixtureCases = [
  {
    caseId: "cue-present-description",
    label: "canonical cue present and mapped",
    cueSituation: "canonical cue present and mapped",
    title: "The Glass Corridor",
    subtitle: "",
    description: "A mystery novel follows a detective investigating a murder in a locked mansion.",
    genres: ["Fiction / Mystery & Detective / Traditional", "Fiction / Thrillers / Suspense"],
    likedSignals: ["mystery", "thriller", "detective"],
  },
  {
    caseId: "cue-absent",
    label: "canonical cue absent",
    cueSituation: "canonical cue absent",
    title: "The Quiet Classroom",
    subtitle: "",
    description: "A reflective coming-of-age novel set in a small town high school.",
    genres: ["Fiction / Literary"],
    likedSignals: ["mystery", "thriller"],
  },
  {
    caseId: "cue-ambiguous",
    label: "ambiguous cue",
    cueSituation: "ambiguous cue",
    title: "Perfect for Readers",
    subtitle: "",
    description: "A gripping page turner perfect for readers who love bold storytelling.",
    genres: ["Fiction / General"],
    likedSignals: ["thriller"],
  },
  {
    caseId: "cue-negated",
    label: "negated cue",
    cueSituation: "negated cue",
    title: "Not a Thriller",
    subtitle: "",
    description: "This is not a thriller and not a mystery, but a family story about grief.",
    genres: ["Fiction / Literary"],
    likedSignals: ["thriller", "mystery"],
  },
  {
    caseId: "cue-title",
    label: "cue in title",
    cueSituation: "cue in title",
    title: "Murder at Blackwater Hall",
    subtitle: "",
    description: "A young lawyer returns home and uncovers old secrets.",
    genres: ["Fiction / General"],
    likedSignals: ["mystery", "murder"],
  },
  {
    caseId: "cue-subtitle",
    label: "cue in subtitle",
    cueSituation: "cue in subtitle",
    title: "Silver Ash",
    subtitle: "A Suspense Novel",
    description: "A journalist finds a missing witness list tied to a decades-old case.",
    genres: ["Fiction / General"],
    likedSignals: ["suspense", "thriller"],
  },
  {
    caseId: "cue-categories",
    label: "cue in category",
    cueSituation: "cue in category",
    title: "City of Hollow Lamps",
    subtitle: "",
    description: "A woman returns to her hometown to resolve a family inheritance dispute.",
    genres: ["Fiction / Thrillers / Suspense", "Fiction / Mystery & Detective / Women Sleuths"],
    likedSignals: ["thriller", "mystery"],
  },
  {
    caseId: "cue-multiple-competing",
    label: "multiple competing cues",
    cueSituation: "multiple competing cues",
    title: "Broken Crowns",
    subtitle: "",
    description: "A historical romance with murder, conspiracy, and supernatural rumors across rival courts.",
    genres: ["Fiction / Historical", "Fiction / Romance / Historical"],
    likedSignals: ["romance", "historical", "mystery", "horror"],
  },
  {
    caseId: "cue-already-present-family",
    label: "already-present family evidence",
    cueSituation: "already-present family evidence",
    title: "The Final Detective",
    subtitle: "",
    description: "A detective thriller where every suspect has a motive.",
    genres: ["Fiction / Mystery & Detective / Police Procedural"],
    likedSignals: ["detective", "thriller", "mystery"],
  },
  {
    caseId: "cue-eligibility-change-or-diagnostic-only",
    label: "promotion changes eligibility or remains diagnostic-only",
    cueSituation: "promotion changes eligibility or diagnostic-only",
    title: "Orbit of Silence",
    subtitle: "",
    description: "An astronaut uncovers a conspiracy on a distant station after a sabotage event.",
    genres: ["Fiction / General"],
    likedSignals: ["science fiction", "conspiracy"],
  },
];

const fixtureRows = fixtureCases.map(runFixtureCase);
const inventory = staticInventoryFromSource();

const aggregate = {
  fixtureCount: fixtureRows.length,
  adultCasesWithPromotionEvidence: fixtureRows.filter((row) => row.adult.promotionDecisionCount > 0).length,
  adultCasesWithAppliedPromotion: fixtureRows.filter((row) => row.adult.promotionApplied).length,
  adultCasesWithEligibilityChangeByPromotion: fixtureRows.filter((row) => row.adult.eligibilityChangedByPromotion).length,
  adultCasesWithMeaningfulAlignmentChangeByPromotion: fixtureRows.filter((row) => row.adult.meaningfulAlignmentChangedByPromotion).length,
  teenCasesWithCanonicalPromotionDiagnostics: fixtureRows.filter((row) => row.teen.hasCanonicalPromotionDiagnostics).length,
  teenCasesWithDocumentNativeSpecificSignals: fixtureRows.filter((row) => row.teen.documentNativeSpecificSignals.length > 0).length,
};

const equivalentBehavior =
  inventory.hasAdultPromotionFunction
  && inventory.hasTeenCanonicalPromotionFunction
  && aggregate.adultCasesWithAppliedPromotion > 0
  && aggregate.teenCasesWithCanonicalPromotionDiagnostics > 0;

const decision = equivalentBehavior
  ? {
      decision: "equivalent_duplication",
      recommendation: "Proceed to #203 parity baseline and narrow shared extraction.",
      rationale: "Adult and Teen both expose a canonical-promotion mechanism with comparable promotion-side diagnostics.",
    }
  : {
      decision: "materially_different_behavior_reclassify",
      recommendation: "Do not consolidate #203 as equivalent duplication; treat as shared-mechanism/different-policy or reclassify.",
      rationale: "Adult has production canonical-family promotion with explicit promotion decisions; Teen exposes document-native specific signals without canonical-promotion diagnostics/mechanism.",
    };

const result = {
  generatedAt: new Date().toISOString(),
  capability: "#203 Canonical cue promotion",
  inventory,
  aggregate,
  fixtureRows,
  decision,
  equivalenceAnswer: equivalentBehavior
    ? "same semantic operation with different policy wrappers"
    : "genuinely different behavior (Adult production promotion vs Teen signal classification)",
};

mkdirSync(outDir, { recursive: true });
const jsonOut = resolve(outDir, "googlebooks-203-canonical-cue-equivalence-gate.json");
const csvOut = resolve(outDir, "googlebooks-203-canonical-cue-equivalence-gate.csv");

writeFileSync(jsonOut, JSON.stringify(result, null, 2));

const header = [
  "caseId",
  "label",
  "cueSituation",
  "adultPromotionDecisionCount",
  "adultPromotionApplied",
  "adultMeaningfulTastePassed",
  "adultFinalEligibilityDecision",
  "adultEligibilityChangedByPromotion",
  "adultMeaningfulAlignmentChangedByPromotion",
  "teenHasCanonicalPromotionDiagnostics",
  "teenDocumentNativeSpecificSignalsCount",
  "teenMeaningfulClassification",
  "teenFinalEligibilityDecision",
].join(",");

const rows = fixtureRows.map((row) => [
  row.caseId,
  `"${row.label.replace(/"/g, "\"\"")}"`,
  `"${row.cueSituation.replace(/"/g, "\"\"")}"`,
  row.adult.promotionDecisionCount,
  row.adult.promotionApplied ? "true" : "false",
  row.adult.meaningfulTastePassed ? "true" : "false",
  `"${String(row.adult.finalEligibilityDecision || "").replace(/"/g, "\"\"")}"`,
  row.adult.eligibilityChangedByPromotion ? "true" : "false",
  row.adult.meaningfulAlignmentChangedByPromotion ? "true" : "false",
  row.teen.hasCanonicalPromotionDiagnostics ? "true" : "false",
  row.teen.documentNativeSpecificSignals.length,
  `"${String(row.teen.meaningfulClassification || "").replace(/"/g, "\"\"")}"`,
  `"${String(row.teen.finalEligibilityDecision || "").replace(/"/g, "\"\"")}"`,
].join(","));

writeFileSync(csvOut, [header, ...rows].join("\n"));

console.log("=== GOOGLE BOOKS #203 CANONICAL-CUE EQUIVALENCE GATE ===");
console.log(`Fixtures: ${aggregate.fixtureCount}`);
console.log(`Adult promotion evidence cases: ${aggregate.adultCasesWithPromotionEvidence}`);
console.log(`Adult applied-promotion cases: ${aggregate.adultCasesWithAppliedPromotion}`);
console.log(`Adult eligibility changed by promotion: ${aggregate.adultCasesWithEligibilityChangeByPromotion}`);
console.log(`Adult meaningful-alignment changed by promotion: ${aggregate.adultCasesWithMeaningfulAlignmentChangeByPromotion}`);
console.log(`Teen canonical-promotion diagnostics cases: ${aggregate.teenCasesWithCanonicalPromotionDiagnostics}`);
console.log(`Teen document-native specific-signal cases: ${aggregate.teenCasesWithDocumentNativeSpecificSignals}`);
console.log(`Decision: ${decision.decision}`);
console.log(`Rationale: ${decision.rationale}`);
console.log(`JSON written to: ${jsonOut}`);
console.log(`CSV written to: ${csvOut}`);
