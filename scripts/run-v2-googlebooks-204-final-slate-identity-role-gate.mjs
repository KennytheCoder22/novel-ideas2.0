/**
 * #204 final-slate identity role/equivalence gate.
 *
 * Purpose:
 * - Determine whether Adult and Teen final-slate identity systems are
 *   behaviorally equivalent duplication or different semantic roles.
 * - Emit a machine-readable decision artifact before any #204 extraction work.
 *
 * Usage:
 *   node scripts/run-v2-googlebooks-204-final-slate-identity-role-gate.mjs
 *
 * Outputs:
 *   scripts/output/googlebooks-204-final-slate-identity-role-gate.json
 *   scripts/output/googlebooks-204-final-slate-identity-role-gate.csv
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

const {
  adultGoogleBooksFinalSlateIdentityAudit,
  adultGoogleBooksIdentityEnforcement,
  selectRecommendations,
} = require(resolve(repoRoot, "app/recommender-v2/select.ts"));

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

function profile(ageBand, likedSignals = ["mystery", "thriller"]) {
  return {
    ageBand,
    maturityBand: ageBand,
    genreFamily: likedSignals.map((value) => ({ value, weight: 1, evidence: [`like:${ageBand}:${value}`] })),
    tone: [],
    themes: [],
    characterDynamics: [],
    formatPreference: [],
    avoidSignals: [],
    diagnostics: {},
  };
}

function candidate({
  id,
  title,
  subtitle = "",
  description,
  categories = [],
  publicationShape = "novel",
  publisher = "Gate House",
  maturityBand = "adult",
  score = 8,
  diagnostics = {},
}) {
  return {
    id: `googleBooks:${id}`,
    source: "googleBooks",
    sourceId: id,
    title,
    subtitle,
    creators: ["Gate Author"],
    description,
    formats: ["book"],
    genres: categories,
    themes: [],
    tones: [],
    characterDynamics: [],
    publicationYear: 2024,
    maturityBand,
    sourceUrl: "",
    raw: {
      id,
      googleBooksPublicationShape: publicationShape,
      volumeInfo: {
        title,
        subtitle,
        authors: ["Gate Author"],
        description,
        categories,
        publisher,
        publishedDate: "2024",
        pageCount: 320,
        printType: "BOOK",
        language: "en",
        maturityRating: "NOT_MATURE",
      },
    },
    diagnostics: {
      googleBooksPublicationShape: publicationShape,
      googleBooksPublicationShapeEvidence: publicationShape === "novel"
        ? ["novel_or_narrative_fiction_shape"]
        : [`${publicationShape}_fixture`],
      googleBooksPublicationShapePrecedenceDecision: publicationShape === "novel"
        ? "novel_supported_by_story_level_evidence"
        : `${publicationShape}_identity_overrides_narrative_signals`,
      googleBooksStoryLevelNarrativeEvidence: publicationShape === "novel" || publicationShape === "series_installment"
        ? ["story_level_description"]
        : [],
      googleBooksNarrativeConfidence: publicationShape === "novel" || publicationShape === "series_installment" ? 6.2 : 2.2,
      googleBooksContentMaturity: "not_mature",
      googleBooksSourceMaturityRating: "NOT_MATURE",
      positiveTasteScore: 4,
      sourceQualityScore: 2,
      metadataBackedMatchedLikedSignals: ["mystery", "thriller"],
      metadataBackedMatchedDislikedSignals: [],
      queryText: "young adult mystery thriller",
      originalPlannedQuery: "young adult mystery thriller",
      queryFamily: "mystery",
      googleBooksAudienceBand: maturityBand === "teens" ? "teens" : "adult",
      ...diagnostics,
    },
    score,
    matchedSignals: ["mystery", "thriller"],
    rejectedReasons: [],
    scoreBreakdown: {
      genreFacetMatch: 2,
      positiveTasteMatch: 4,
      sourceQualityRelevance: 2,
      avoidSignalPenalty: 0,
      broadAvoidSignalPenalty: 0,
    },
  };
}

function adultEligibilityStub(allowed = true, reason = "adult_googlebooks_final_eligible") {
  return {
    allowed,
    reason,
    artifactReasons: [],
    referenceSurveyReasons: [],
    encyclopediaReferenceReasons: [],
    multiVolumeReferenceCorroboration: [],
    annualAnthologyReasons: [],
    anthologyCorroboration: [],
    instructionalCraftReasons: [],
    narrativeEvidence: allowed ? ["story_level_description"] : [],
    credibleFictionSignals: allowed ? ["fiction_category"] : [],
    workIdentitySignals: allowed ? ["novel_identity"] : [],
    documentBackedLikedSignals: allowed ? ["mystery", "thriller"] : [],
    documentBackedDislikedSignals: [],
    positiveNetTasteFamilies: allowed ? ["mystery_crime_thriller"] : [],
    meaningfulTastePassed: allowed,
    meaningfulTasteFailureReason: allowed ? "" : reason,
    strongNarrativeOverrideBlockedByTaste: false,
    sourceQualityScore: 2,
    sourceQualityFailureReasons: [],
    strongNarrativeOverrideApplied: false,
    periodicalCorroboration: [],
    allCandidateTasteFamilies: allowed ? ["mystery_crime_thriller"] : [],
    negativeNetTasteFamilies: [],
    tasteEvidenceSource: "metadata",
    likedSignalCount: allowed ? 2 : 0,
    threshold: "default",
    specificToneThemeLikedSignals: [],
    broadToneLikedSignals: [],
    contextOnlyLikedSignals: [],
    productionDecisionReason: "",
    canonicalNarrativeFamilyPromotions: [],
    canonicalMissingFamilyBefore: [],
    canonicalMissingFamilyAfter: [],
  };
}

function runAdult(caseDef) {
  const c = { ...caseDef.candidate, maturityBand: "adult" };
  const prof = profile("adult", caseDef.likedSignals || ["mystery", "thriller"]);
  const audit = adultGoogleBooksFinalSlateIdentityAudit(c, {
    eligibility: adultEligibilityStub(true, "adult_googlebooks_final_eligible"),
    finalEligibilityDecision: "accepted",
    finalEligibilityReason: "adult_googlebooks_final_eligible",
    finalSelectionDecision: "selected",
    rendered: true,
  });
  const enforcement = adultGoogleBooksIdentityEnforcement(c, adultEligibilityStub(true, "adult_googlebooks_final_eligible"));
  const selected = selectRecommendations([c], prof, 5);
  const diagnostics = mapObject(selected.rejectedReasons);
  const byTitleIdentity = mapObject(diagnostics.adultGoogleBooksFinalSlateIdentityByTitle);
  const byTitleConfidence = mapObject(diagnostics.adultGoogleBooksFinalSlateIdentityConfidenceByTitle);
  const byTitleAgreement = mapObject(diagnostics.adultGoogleBooksFinalSlateIdentityAgreementByTitle);
  const byTitleEvidence = mapObject(diagnostics.adultGoogleBooksFinalSlateIdentityEvidenceByTitle);
  const byTitleEnforcementDecision = mapObject(diagnostics.adultGoogleBooksIdentityEnforcementDecisionByTitle);
  const byTitleEnforcementReason = mapObject(diagnostics.adultGoogleBooksIdentityEnforcementReasonByTitle);
  const finalEligibilityDecisionByTitle = mapObject(diagnostics.googleBooksFinalEligibilityDecisionByTitle);
  const finalEligibilityReasonByTitle = mapObject(diagnostics.googleBooksFinalEligibilityReasonByTitle);
  const finalSelectionDecisionByTitle = mapObject(diagnostics.googleBooksFinalSelectionDecisionByTitle);

  return {
    auditIdentity: audit.identity,
    auditConfidence: Number(audit.confidence || 0),
    auditAgreement: audit.agreement,
    auditRootCause: audit.rootCause,
    auditEvidenceNonEmptyBuckets: Object.values(mapObject(audit.evidence)).filter((v) => Array.isArray(v) && v.length > 0).length,
    enforcementDecision: enforcement.decision,
    enforcementReason: enforcement.reason,
    identityByTitle: String(byTitleIdentity[c.title] || ""),
    confidenceByTitle: Number(byTitleConfidence[c.title] || 0),
    agreementByTitle: String(byTitleAgreement[c.title] || ""),
    evidenceByTitle: mapObject(byTitleEvidence[c.title]),
    productionEnforcementDecisionByTitle: String(byTitleEnforcementDecision[c.title] || ""),
    productionEnforcementReasonByTitle: String(byTitleEnforcementReason[c.title] || ""),
    finalEligibilityDecisionByTitle: String(finalEligibilityDecisionByTitle[c.title] || ""),
    finalEligibilityReasonByTitle: String(finalEligibilityReasonByTitle[c.title] || ""),
    finalSelectionDecisionByTitle: String(finalSelectionDecisionByTitle[c.title] || ""),
  };
}

function runTeen(caseDef) {
  const c = { ...caseDef.candidate, maturityBand: "teens", diagnostics: { ...caseDef.candidate.diagnostics, googleBooksAudienceBand: "teens" } };
  const prof = profile("teens", caseDef.likedSignals || ["mystery", "thriller"]);
  const selected = selectRecommendations([c], prof, 5);
  const diagnostics = mapObject(selected.rejectedReasons);

  const pubDecisionByTitle = mapObject(diagnostics.teenGoogleBooksPublicationIdentityDecisionByTitle);
  const pubReasonByTitle = mapObject(diagnostics.teenGoogleBooksPublicationIdentityReasonByTitle);
  const pubClassByTitle = mapObject(diagnostics.teenGoogleBooksPublicationIdentityClassificationByTitle);
  const pubEvidenceByTitle = mapObject(diagnostics.teenGoogleBooksPublicationIdentityEvidenceByTitle);
  const finalEligibilityDecisionByTitle = mapObject(diagnostics.googleBooksFinalEligibilityDecisionByTitle);
  const finalEligibilityReasonByTitle = mapObject(diagnostics.googleBooksFinalEligibilityReasonByTitle);
  const finalSelectionDecisionByTitle = mapObject(diagnostics.googleBooksFinalSelectionDecisionByTitle);

  return {
    identityDecisionByTitle: String(pubDecisionByTitle[c.title] || ""),
    identityReasonByTitle: String(pubReasonByTitle[c.title] || ""),
    identityClassificationByTitle: String(pubClassByTitle[c.title] || ""),
    identityEvidenceByTitle: arrayValue(pubEvidenceByTitle[c.title]).map(String),
    finalEligibilityDecisionByTitle: String(finalEligibilityDecisionByTitle[c.title] || ""),
    finalEligibilityReasonByTitle: String(finalEligibilityReasonByTitle[c.title] || ""),
    finalSelectionDecisionByTitle: String(finalSelectionDecisionByTitle[c.title] || ""),
    productionEnforcementObserved:
      String(finalEligibilityReasonByTitle[c.title] || "").startsWith("teen_googlebooks_publication_identity_"),
  };
}

const fixtureCases = [
  {
    caseId: "narrative-novel",
    label: "narrative novel",
    candidate: candidate({
      id: "novel-river-house",
      title: "The River House",
      description: "A psychological thriller follows a detective returning home to uncover a murder.",
      categories: ["Fiction / Thrillers / Psychological", "Fiction / Mystery & Detective"],
      publicationShape: "novel",
    }),
  },
  {
    caseId: "series-installment",
    label: "series installment",
    candidate: candidate({
      id: "series-dark-harbor",
      title: "Dark Harbor (A Mara Vale Mystery - Book 2)",
      description: "Detective Mara Vale investigates a coastal murder in book two of the series.",
      categories: ["Fiction / Mystery & Detective", "Fiction / Thrillers / Suspense"],
      publicationShape: "series_installment",
    }),
  },
  {
    caseId: "story-collection-anthology",
    label: "story collection or anthology",
    candidate: candidate({
      id: "short-story-collection",
      title: "Night Roads: A Short Story Collection",
      description: "A short story collection of eerie tales and haunted roads.",
      categories: ["Fiction / Short Stories", "Fiction / Horror"],
      publicationShape: "story_collection",
    }),
  },
  {
    caseId: "literary-study-criticism",
    label: "literary study or criticism",
    candidate: candidate({
      id: "food-atwood",
      title: "Food in Margaret Atwood's Speculative Fiction",
      description: "A critical study examining food, politics, and identity in Atwood's fiction.",
      categories: ["Literary Criticism / Women Authors", "Literary Criticism / Science Fiction & Fantasy"],
      publicationShape: "critical_study",
      diagnostics: {
        googleBooksSubjectOfStudyTitle: true,
      },
    }),
  },
  {
    caseId: "companion-guide",
    label: "companion/guide",
    candidate: candidate({
      id: "movie-companion",
      title: "The Hollow Crown Official Movie Companion",
      description: "An official illustrated movie companion to the celebrated adaptation.",
      categories: ["Reference / Guides", "Film / Companion"],
      publicationShape: "writing_guide",
      diagnostics: {
        googleBooksCuratedBookGuideIdentity: true,
      },
    }),
  },
  {
    caseId: "catalog-promotional-collection",
    label: "catalog or promotional collection",
    candidate: candidate({
      id: "debut-catalog",
      title: "Spring 2024 Young Adult Debut Novels",
      description: "A seasonal catalog of debut novels and promotional highlights.",
      categories: ["Fiction / General"],
      publicationShape: "catalog",
      diagnostics: {
        googleBooksGenericCategoryTitle: true,
      },
    }),
  },
  {
    caseId: "generic-category-title",
    label: "generic category title",
    candidate: candidate({
      id: "thriller-novels",
      title: "Thriller Novels",
      description: "An overview of thriller novels and suspense books.",
      categories: ["Fiction / Thrillers"],
      publicationShape: "catalog",
      diagnostics: {
        googleBooksGenericCategoryTitle: true,
      },
    }),
  },
  {
    caseId: "periodical",
    label: "periodical",
    candidate: candidate({
      id: "horror-quarterly",
      title: "Horror Quarterly Review",
      description: "A periodical issue featuring editorials and serialized content.",
      categories: ["Fiction / Horror", "Periodicals"],
      publicationShape: "periodical",
    }),
  },
  {
    caseId: "ambiguous-unknown-shape",
    label: "ambiguous/unknown publication shape",
    candidate: candidate({
      id: "unclear-record",
      title: "Unclear Metadata Record",
      description: "Sparse metadata without clear story or publication identity.",
      categories: ["Fiction"],
      publicationShape: "unknown",
      diagnostics: {
        googleBooksStoryLevelNarrativeEvidence: [],
        googleBooksNarrativeConfidence: 2.1,
      },
    }),
  },
  {
    caseId: "conflicting-narrative-artifact",
    label: "conflicting narrative and artifact evidence",
    candidate: candidate({
      id: "writers-market-thriller",
      title: "Writers Market for Thriller Fiction",
      description: "A guide to literary agents that also discusses thriller trends and mystery themes.",
      categories: ["Reference / Writing", "Fiction / Thrillers"],
      publicationShape: "writing_guide",
      diagnostics: {
        googleBooksCuratedBookGuideIdentity: true,
      },
    }),
  },
];

const rows = fixtureCases.map((entry) => {
  const adult = runAdult(entry);
  const teen = runTeen(entry);
  return {
    caseId: entry.caseId,
    label: entry.label,
    adult,
    teen,
  };
});

const aggregate = {
  fixtureCount: rows.length,
  adultDistinctIdentities: Array.from(new Set(rows.map((row) => row.adult.auditIdentity).filter(Boolean))).sort(),
  teenDistinctClassifications: Array.from(new Set(rows.map((row) => row.teen.identityClassificationByTitle).filter(Boolean))).sort(),
  adultRejectedByIdentityEnforcementCount: rows.filter((row) => row.adult.enforcementDecision === "rejected").length,
  teenRejectedByPublicationIdentityCount: rows.filter((row) => row.teen.productionEnforcementObserved).length,
  adultHasAgreementAuditSignals: rows.some((row) => row.adult.auditAgreement && row.adult.auditAgreement !== "identity_agrees_with_current_behavior"),
  teenHasAgreementAuditSignals: false,
  adultProductionEnforcementByTitlePresent: rows.some((row) => Boolean(row.adult.productionEnforcementDecisionByTitle)),
  teenProductionEnforcementByEligibilityReasonPresent: rows.some((row) => row.teen.productionEnforcementObserved),
};

const sourceSelectPath = resolve(repoRoot, "app/recommender-v2/select.ts");
const selectSource = readFileSync(sourceSelectPath, "utf8");
const inventory = {
  sourcePath: sourceSelectPath,
  hasAdultFinalSlateAuditFunction: /export function adultGoogleBooksFinalSlateIdentityAudit\(/.test(selectSource),
  hasAdultIdentityEnforcementFunction: /export function adultGoogleBooksIdentityEnforcement\(/.test(selectSource),
  hasTeenPublicationIdentityAuditFunction: /function teenGoogleBooksPublicationIdentityAudit\(/.test(selectSource),
  hasTeenPublicationIdentityByTitleDiagnostics: /teenGoogleBooksPublicationIdentityDecisionByTitle/.test(selectSource),
  adultFinalSlateIdentityDiagnosticMaps: [
    "adultGoogleBooksFinalSlateIdentityByTitle",
    "adultGoogleBooksFinalSlateIdentityConfidenceByTitle",
    "adultGoogleBooksFinalSlateIdentityAgreementByTitle",
    "adultGoogleBooksIdentityEnforcementDecisionByTitle",
    "adultGoogleBooksIdentityEnforcementReasonByTitle",
  ],
  teenPublicationIdentityDiagnosticMaps: [
    "teenGoogleBooksPublicationIdentityDecisionByTitle",
    "teenGoogleBooksPublicationIdentityReasonByTitle",
    "teenGoogleBooksPublicationIdentityClassificationByTitle",
    "teenGoogleBooksPublicationIdentityEvidenceByTitle",
  ],
};

let decision = "behaviorally_equivalent_duplication";
let rationale = "Adult and Teen identity systems appear equivalent in classifier and enforcement role.";

if (!aggregate.teenProductionEnforcementByEligibilityReasonPresent && aggregate.adultProductionEnforcementByTitlePresent) {
  decision = "adult_only_capability_age_specific";
  rationale = "Adult identity mechanism enforces production decisions while Teen lacks production enforcement evidence.";
} else if (
  aggregate.adultProductionEnforcementByTitlePresent
  && aggregate.teenProductionEnforcementByEligibilityReasonPresent
  && aggregate.adultHasAgreementAuditSignals
) {
  decision = "adult_production_audit_teen_eligibility_policy";
  rationale = "Adult combines broad final-slate audit diagnostics with identity enforcement, while Teen applies publication-identity as direct final-eligibility policy with narrower classification semantics.";
} else if (aggregate.adultProductionEnforcementByTitlePresent && aggregate.teenProductionEnforcementByEligibilityReasonPresent) {
  decision = "shared_classifier_age_specific_enforcement";
  rationale = "Both bands enforce publication identity, but enforcement semantics are age-policy specific.";
}

const result = {
  generatedAt: new Date().toISOString(),
  capability: "#204 Final slate identity auditing",
  inventory,
  aggregate,
  rows,
  decision: {
    decision,
    rationale,
    outcomes: {
      behaviorally_equivalent_duplication: "Freeze parity and consolidate.",
      shared_classifier_age_specific_enforcement: "Extract identity assessment mechanism only; keep separate age-policy enforcement wrappers.",
      adult_production_audit_teen_eligibility_policy: "Reclassify as different semantics; do not force parity-preserving consolidation.",
      adult_only_capability_age_specific: "Keep age-specific and remove from active consolidation.",
    },
  },
};

mkdirSync(outDir, { recursive: true });
const jsonOut = resolve(outDir, "googlebooks-204-final-slate-identity-role-gate.json");
const csvOut = resolve(outDir, "googlebooks-204-final-slate-identity-role-gate.csv");
writeFileSync(jsonOut, JSON.stringify(result, null, 2));

const header = [
  "caseId",
  "label",
  "adultAuditIdentity",
  "adultAuditConfidence",
  "adultAuditAgreement",
  "adultEnforcementDecision",
  "adultFinalEligibilityReason",
  "adultFinalSelectionDecision",
  "teenIdentityDecision",
  "teenIdentityReason",
  "teenIdentityClassification",
  "teenFinalEligibilityReason",
  "teenFinalSelectionDecision",
  "teenProductionEnforcementObserved",
].join(",");

const csvRows = rows.map((row) => [
  row.caseId,
  `"${row.label.replace(/"/g, "\"\"")}"`,
  row.adult.auditIdentity,
  String(row.adult.auditConfidence),
  row.adult.auditAgreement,
  row.adult.enforcementDecision,
  `"${String(row.adult.finalEligibilityReasonByTitle || "").replace(/"/g, "\"\"")}"`,
  row.adult.finalSelectionDecisionByTitle,
  row.teen.identityDecisionByTitle,
  `"${String(row.teen.identityReasonByTitle || "").replace(/"/g, "\"\"")}"`,
  row.teen.identityClassificationByTitle,
  `"${String(row.teen.finalEligibilityReasonByTitle || "").replace(/"/g, "\"\"")}"`,
  row.teen.finalSelectionDecisionByTitle,
  row.teen.productionEnforcementObserved ? "true" : "false",
].join(","));
writeFileSync(csvOut, [header, ...csvRows].join("\n"));

console.log("=== GOOGLE BOOKS #204 FINAL-SLATE IDENTITY ROLE GATE ===");
console.log(`Fixtures: ${aggregate.fixtureCount}`);
console.log(`Adult identities observed: ${aggregate.adultDistinctIdentities.join(" | ") || "(none)"}`);
console.log(`Teen classifications observed: ${aggregate.teenDistinctClassifications.join(" | ") || "(none)"}`);
console.log(`Adult identity rejections: ${aggregate.adultRejectedByIdentityEnforcementCount}`);
console.log(`Teen publication-identity rejections: ${aggregate.teenRejectedByPublicationIdentityCount}`);
console.log(`Decision: ${decision}`);
console.log(`Rationale: ${rationale}`);
console.log(`JSON written to: ${jsonOut}`);
console.log(`CSV written to: ${csvOut}`);
