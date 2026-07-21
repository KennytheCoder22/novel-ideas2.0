/**
 * #205 counterfactual final-slate role/equivalence gate.
 *
 * Purpose:
 * - Determine whether Adult and Teen counterfactual final-slate diagnostics model
 *   the same hypothetical policy change or materially different questions.
 * - Emit a machine-readable decision artifact before any #205 extraction work.
 *
 * Usage:
 *   node scripts/run-v2-googlebooks-205-counterfactual-final-slate-role-gate.mjs
 *
 * Outputs:
 *   scripts/output/googlebooks-205-counterfactual-final-slate-role-gate.json
 *   scripts/output/googlebooks-205-counterfactual-final-slate-role-gate.csv
 */

import { createRequire } from "node:module";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const outDir = resolve(scriptDir, "output");
const selectSourcePath = resolve(repoRoot, "app/recommender-v2/select.ts");

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

const { selectRecommendations } = require(resolve(repoRoot, "app/recommender-v2/select.ts"));
const { buildTasteProfile } = require(resolve(repoRoot, "app/recommender-v2/tasteProfile.ts"));

function normalized(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function unique(values) {
  return Array.from(new Set((Array.isArray(values) ? values : []).map((value) => String(value || ""))));
}

function mapObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function profile(ageBand, liked = ["mystery", "thriller"], disliked = []) {
  const signals = [
    ...liked.map((value, index) => ({
      title: `${ageBand}-liked-${index + 1}-${value}`,
      action: "like",
      genres: [value],
      tags: [value],
      source: "mock",
      format: "book",
    })),
    ...disliked.map((value, index) => ({
      title: `${ageBand}-disliked-${index + 1}-${value}`,
      action: "dislike",
      genres: [value],
      tags: [value],
      source: "mock",
      format: "book",
    })),
  ];
  return buildTasteProfile({
    ageBand,
    enabledSources: { googleBooks: true },
    signals,
  });
}

function candidate({
  id,
  title,
  score = 5,
  subtitle = "",
  description = "",
  categories = ["Fiction / General"],
  publicationShape = "novel",
  likedSignals = [],
  dislikedSignals = [],
  queryText = "young adult mystery thriller",
  audienceBand = "teens",
  sourceMaturityRating = "NOT_MATURE",
  contentMaturity = "not_mature",
  scoreBreakdown = {},
  diagnostics = {},
}) {
  return {
    id: `gb205-${id}`,
    source: "googleBooks",
    sourceId: id,
    title,
    subtitle,
    creators: ["Gate Fixture Author"],
    description,
    formats: ["book"],
    genres: categories,
    themes: [],
    tones: [],
    characterDynamics: [],
    publicationYear: 2024,
    maturityBand: audienceBand,
    sourceUrl: "",
    raw: {
      id,
      googleBooksPublicationShape: publicationShape,
      volumeInfo: {
        title,
        subtitle,
        authors: ["Gate Fixture Author"],
        description,
        categories,
        publisher: "Gate House",
        publishedDate: "2024",
        pageCount: 320,
        printType: "BOOK",
        language: "en",
        maturityRating: sourceMaturityRating,
      },
    },
    diagnostics: {
      metadataBackedMatchedLikedSignals: likedSignals,
      metadataBackedMatchedDislikedSignals: dislikedSignals,
      documentBackedTasteSignals: likedSignals,
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
      googleBooksNarrativeConfidence: publicationShape === "novel" || publicationShape === "series_installment" ? 6.4 : 2.1,
      googleBooksAudienceBand: audienceBand,
      googleBooksSourceMaturityRating: sourceMaturityRating,
      googleBooksContentMaturity: contentMaturity,
      queryText,
      originalPlannedQuery: queryText,
      queryFamily: "mystery",
      facets: ["mystery", "thriller"],
      ...diagnostics,
    },
    score,
    scoreBreakdown: {
      genreFacetMatch: 1.5,
      positiveTasteMatch: 2.5,
      sourceQualityRelevance: 1.2,
      avoidSignalPenalty: 0,
      broadAvoidSignalPenalty: 0,
      ...scoreBreakdown,
    },
    rejectedReasons: [],
  };
}

function setDiff(actual, expected) {
  const actualSet = new Set((actual || []).map((v) => normalized(v)));
  const expectedSet = new Set((expected || []).map((v) => normalized(v)));
  return {
    newlyAdmitted: (expected || []).filter((v) => !actualSet.has(normalized(v))),
    newlyRemoved: (actual || []).filter((v) => !expectedSet.has(normalized(v))),
  };
}

function runBand(ageBand, caseDef) {
  const p = profile(ageBand, caseDef.profileLikedSignals || ["mystery", "thriller"], caseDef.profileDislikedSignals || []);
  const candidates = (caseDef.candidates || []).map((row) => candidate({
    ...row,
    audienceBand: ageBand,
  }));
  const { selected, rejectedReasons } = selectRecommendations(candidates, p, 5);
  const diagnostics = mapObject(rejectedReasons);
  const actualFinalTitles = (selected || []).filter((row) => row.source === "googleBooks").map((row) => row.title);
  const underfillActual = actualFinalTitles.length < 5;

  const finalEligibilityReasonByTitle = mapObject(diagnostics.googleBooksFinalEligibilityReasonByTitle);
  const finalSelectionReasonByTitle = mapObject(diagnostics.googleBooksFinalSelectionExclusionReasonByTitle);

  if (ageBand === "teens") {
    const counterfactualFinalTitles = unique(diagnostics.teenGoogleBooksCounterfactualFinalTitles || []);
    const counterfactualUnderfill = diagnostics.teenGoogleBooksCounterfactualUnderfill === true;
    const tasteTierReasonByTitle = mapObject(diagnostics.teenGoogleBooksTasteTierSelectionReasonByTitle);
    const weakUnderfillByTitle = mapObject(diagnostics.teenGoogleBooksWeakCandidateUsedForUnderfillByTitle);
    const withoutQueryDerivedByTitle = mapObject(diagnostics.teenGoogleBooksWouldPassWithoutQueryDerivedEvidenceByTitle);
    const diffs = setDiff(actualFinalTitles, counterfactualFinalTitles);
    const rankingOrderChangedSameMembers =
      diffs.newlyAdmitted.length === 0
      && diffs.newlyRemoved.length === 0
      && actualFinalTitles.length === counterfactualFinalTitles.length
      && actualFinalTitles.some((title, index) => normalized(title) !== normalized(counterfactualFinalTitles[index]));

    return {
      actualFinalTitles,
      counterfactualFinalTitles,
      newlyAdmittedTitles: diffs.newlyAdmitted,
      newlyRemovedTitles: diffs.newlyRemoved,
      rankingOrderChangedSameMembers,
      finalCountDelta: counterfactualFinalTitles.length - actualFinalTitles.length,
      underfillActual,
      underfillCounterfactual: counterfactualUnderfill,
      underfillDelta: Number(counterfactualUnderfill) - Number(underfillActual),
      eligibilityChangeReasonsByTitle: Object.fromEntries(Object.keys(tasteTierReasonByTitle).map((title) => [
        title,
        String(tasteTierReasonByTitle[title] || finalEligibilityReasonByTitle[title] || finalSelectionReasonByTitle[title] || ""),
      ])),
      policyEffects: {
        altersEvidenceThresholds: Object.values(tasteTierReasonByTitle).some((reason) => /strong|secondary|weak/i.test(String(reason || ""))),
        altersPolarityHandling: false,
        altersIdentityEnforcement: Object.values(finalEligibilityReasonByTitle).some((reason) => String(reason || "").includes("publication_identity")),
        altersWeakCandidateRescue: Object.values(weakUnderfillByTitle).some((value) => value === true),
        altersQueryDerivedEvidenceTreatment: Object.values(withoutQueryDerivedByTitle).some((value) => value === false),
      },
      role: {
        diagnosticOnlyCounterfactual: true,
        productionSelectionDrivenByCounterfactual: false,
      },
      diagnosticsSubset: {
        teenGoogleBooksCounterfactualFinalCount: Number(diagnostics.teenGoogleBooksCounterfactualFinalCount || 0),
        teenGoogleBooksStrongOrSecondaryAvailableCount: Number(diagnostics.teenGoogleBooksStrongOrSecondaryAvailableCount || 0),
      },
    };
  }

  const weightedNewPass = unique(diagnostics.adultTasteWeightedCounterfactualNewPassTitles || []);
  const weightedNewFail = unique(diagnostics.adultTasteWeightedCounterfactualNewFailTitles || []);
  const weightedCounterfactualCandidateDecisionByTitle = mapObject(diagnostics.adultTasteWeightedCounterfactualCandidateDecisionByTitle);
  const weightedCounterfactualDerivedFinal = unique(
    [...actualFinalTitles, ...weightedNewPass].filter((title) => !weightedNewFail.some((drop) => normalized(drop) === normalized(title))),
  );
  const diffs = setDiff(actualFinalTitles, weightedCounterfactualDerivedFinal);

  return {
    actualFinalTitles,
    counterfactualFinalTitles: weightedCounterfactualDerivedFinal,
    newlyAdmittedTitles: diffs.newlyAdmitted,
    newlyRemovedTitles: diffs.newlyRemoved,
    rankingOrderChangedSameMembers: false,
    finalCountDelta: weightedCounterfactualDerivedFinal.length - actualFinalTitles.length,
    underfillActual,
    underfillCounterfactual: weightedCounterfactualDerivedFinal.length < 5,
    underfillDelta: Number(weightedCounterfactualDerivedFinal.length < 5) - Number(underfillActual),
    eligibilityChangeReasonsByTitle: Object.fromEntries(Object.keys(weightedCounterfactualCandidateDecisionByTitle).map((title) => [
      title,
      String(weightedCounterfactualCandidateDecisionByTitle[title]?.reason || finalEligibilityReasonByTitle[title] || finalSelectionReasonByTitle[title] || ""),
    ])),
    policyEffects: {
      altersEvidenceThresholds: false,
      altersPolarityHandling: Object.keys(weightedCounterfactualCandidateDecisionByTitle).length > 0,
      altersIdentityEnforcement: Object.values(finalEligibilityReasonByTitle).some((reason) => String(reason || "").includes("identity")),
      altersWeakCandidateRescue: false,
      altersQueryDerivedEvidenceTreatment: false,
    },
    role: {
      diagnosticOnlyCounterfactual: true,
      productionSelectionDrivenByCounterfactual: false,
    },
    diagnosticsSubset: {
      adultTasteWeightedCounterfactualNewPassTitles: weightedNewPass,
      adultTasteWeightedCounterfactualNewFailTitles: weightedNewFail,
      adultTasteWeightedProductionNewPassTitles: unique(diagnostics.adultTasteWeightedProductionNewPassTitles || []),
      adultTasteWeightedProductionNewFailTitles: unique(diagnostics.adultTasteWeightedProductionNewFailTitles || []),
    },
  };
}

const fixtureCases = [
  {
    caseId: "no-counterfactual-difference",
    label: "no counterfactual difference",
    candidates: [
      { id: "same-1", title: "Steel Harbor", description: "A mystery novel with a detective uncovering corruption.", categories: ["Fiction / Mystery & Detective"], likedSignals: ["mystery"], score: 9 },
      { id: "same-2", title: "Ashline Files", description: "A thriller novel follows a journalist and detective.", categories: ["Fiction / Thrillers"], likedSignals: ["thriller", "detective"], score: 8.5 },
      { id: "same-3", title: "Bright Avenue", description: "A mystery about a missing heir and family secrets.", categories: ["Fiction / Mystery"], likedSignals: ["mystery"], score: 8.1 },
    ],
  },
  {
    caseId: "one-newly-admitted-title",
    label: "one newly admitted title",
    candidates: [
      { id: "admit-1", title: "Top Ranked Unrelated", description: "A general history volume.", categories: ["History"], likedSignals: [], score: 9.9 },
      { id: "admit-2", title: "Strong Mystery Alpha", description: "A detective mystery novel in a coastal town.", categories: ["Fiction / Mystery & Detective"], likedSignals: ["mystery"], score: 9.1 },
      { id: "admit-3", title: "Strong Mystery Beta", description: "A thriller mystery with police procedural clues.", categories: ["Fiction / Thrillers"], likedSignals: ["mystery", "thriller"], score: 8.8 },
      { id: "admit-4", title: "Strong Mystery Gamma", description: "A detective follows coded letters to solve murders.", categories: ["Fiction / Mystery"], likedSignals: ["detective"], score: 8.3 },
      { id: "admit-5", title: "Strong Mystery Delta", description: "A suspense novel about a missing witness.", categories: ["Fiction / Thrillers / Suspense"], likedSignals: ["thriller"], score: 8.2 },
      { id: "admit-6", title: "Strong Mystery Epsilon", description: "A detective drama with conspiracy elements.", categories: ["Fiction / Mystery"], likedSignals: ["mystery"], score: 8.0 },
    ],
  },
  {
    caseId: "one-newly-removed-title",
    label: "one newly removed title",
    candidates: [
      { id: "remove-1", title: "Weak Query Match Prime", description: "A plain catalog entry without signal words.", categories: ["Fiction / General"], likedSignals: ["mystery"], score: 9.7 },
      { id: "remove-2", title: "Strong Match One", description: "A detective mystery novel with clear narrative arc.", categories: ["Fiction / Mystery"], likedSignals: ["mystery"], score: 9.0 },
      { id: "remove-3", title: "Strong Match Two", description: "A thriller novel where detective evidence drives plot.", categories: ["Fiction / Thrillers"], likedSignals: ["thriller"], score: 8.9 },
      { id: "remove-4", title: "Strong Match Three", description: "A mystery police procedural with suspects.", categories: ["Fiction / Mystery"], likedSignals: ["mystery"], score: 8.8 },
      { id: "remove-5", title: "Strong Match Four", description: "A suspense narrative centered on a murder trial.", categories: ["Fiction / Thrillers / Suspense"], likedSignals: ["thriller"], score: 8.7 },
      { id: "remove-6", title: "Strong Match Five", description: "A detective team uncovers a hidden ring.", categories: ["Fiction / Mystery"], likedSignals: ["detective"], score: 8.6 },
    ],
  },
  {
    caseId: "ranking-only-change",
    label: "ranking-only change",
    candidates: [
      { id: "rank-1", title: "Secondary Ranked First", description: "An atmospheric suspense story.", categories: ["Fiction / General"], likedSignals: ["atmospheric"], score: 9.6 },
      { id: "rank-2", title: "Strong Ranked Second", description: "A detective mystery in a locked city.", categories: ["Fiction / Mystery"], likedSignals: ["mystery"], score: 9.1 },
      { id: "rank-3", title: "Strong Ranked Third", description: "A thriller detective uncovers a conspiracy.", categories: ["Fiction / Thrillers"], likedSignals: ["thriller", "detective"], score: 8.9 },
      { id: "rank-4", title: "Secondary Ranked Fourth", description: "A moody coming-of-age suspense narrative.", categories: ["Fiction / General"], likedSignals: ["moody"], score: 8.6 },
      { id: "rank-5", title: "Strong Ranked Fifth", description: "A mystery investigation through coded diaries.", categories: ["Fiction / Mystery"], likedSignals: ["mystery"], score: 8.3 },
    ],
  },
  {
    caseId: "underfill-to-full",
    label: "underfilled slate becoming full",
    candidates: [
      { id: "uf-1", title: "Strong Core One", description: "A detective mystery novel.", categories: ["Fiction / Mystery"], likedSignals: ["mystery"], score: 8.9 },
      { id: "uf-2", title: "Strong Core Two", description: "A thriller novel with police pursuit.", categories: ["Fiction / Thrillers"], likedSignals: ["thriller"], score: 8.7 },
      { id: "uf-3", title: "Weak Fill One", description: "General fiction without signal anchors.", categories: ["Fiction / General"], likedSignals: ["mystery"], score: 8.5 },
      { id: "uf-4", title: "Weak Fill Two", description: "General fiction entry.", categories: ["Fiction / General"], likedSignals: ["thriller"], score: 8.3 },
      { id: "uf-5", title: "Weak Fill Three", description: "Sparse listing with little metadata.", categories: ["Fiction / General"], likedSignals: ["detective"], score: 8.0 },
    ],
  },
  {
    caseId: "full-to-underfill",
    label: "full slate becoming underfilled",
    profileDislikedSignals: ["mystery", "thriller"],
    candidates: [
      { id: "fu-1", title: "Conflicting One", description: "A mystery novel", categories: ["Fiction / Mystery"], likedSignals: ["mystery"], dislikedSignals: ["mystery"], score: 9.2, scoreBreakdown: { avoidSignalPenalty: -4 } },
      { id: "fu-2", title: "Conflicting Two", description: "A thriller novel", categories: ["Fiction / Thrillers"], likedSignals: ["thriller"], dislikedSignals: ["thriller"], score: 9.1, scoreBreakdown: { avoidSignalPenalty: -4 } },
      { id: "fu-3", title: "Conflicting Three", description: "A detective novel", categories: ["Fiction / Mystery"], likedSignals: ["detective"], dislikedSignals: ["mystery"], score: 9.0, scoreBreakdown: { avoidSignalPenalty: -3.5 } },
      { id: "fu-4", title: "Conflicting Four", description: "A suspense novel", categories: ["Fiction / Thrillers"], likedSignals: ["thriller"], dislikedSignals: ["thriller"], score: 8.9, scoreBreakdown: { avoidSignalPenalty: -3.8 } },
      { id: "fu-5", title: "Conflicting Five", description: "A mystery story", categories: ["Fiction / Mystery"], likedSignals: ["mystery"], dislikedSignals: ["mystery"], score: 8.7, scoreBreakdown: { avoidSignalPenalty: -3.5 } },
    ],
  },
  {
    caseId: "identity-policy-counterfactual",
    label: "identity-policy counterfactual",
    candidates: [
      { id: "id-1", title: "Accepted Novel", description: "A detective mystery novel.", categories: ["Fiction / Mystery"], likedSignals: ["mystery"], publicationShape: "novel", score: 9.1 },
      { id: "id-2", title: "Rejected Literary Study", description: "A critical study of thriller fiction.", categories: ["Literary Criticism / Mystery"], likedSignals: ["mystery"], publicationShape: "critical_study", score: 8.9 },
      { id: "id-3", title: "Rejected Companion Guide", description: "An official companion guide.", categories: ["Reference / Guides"], likedSignals: ["thriller"], publicationShape: "writing_guide", score: 8.5 },
    ],
  },
  {
    caseId: "taste-threshold-counterfactual",
    label: "taste-threshold counterfactual",
    candidates: [
      { id: "tt-1", title: "Strong Threshold One", description: "A detective mystery with crime clues.", categories: ["Fiction / Mystery"], likedSignals: ["mystery"], score: 9.3 },
      { id: "tt-2", title: "Secondary Threshold Two", description: "An atmospheric suspense narrative.", categories: ["Fiction / General"], likedSignals: ["atmospheric"], score: 9.2 },
      { id: "tt-3", title: "Weak Threshold Three", description: "A sparse fiction listing.", categories: ["Fiction / General"], likedSignals: ["mystery"], score: 9.0 },
      { id: "tt-4", title: "Weak Threshold Four", description: "A thin metadata thriller record.", categories: ["Fiction / General"], likedSignals: ["thriller"], score: 8.9 },
      { id: "tt-5", title: "Weak Threshold Five", description: "A short description.", categories: ["Fiction / General"], likedSignals: ["detective"], score: 8.7 },
    ],
  },
  {
    caseId: "weak-evidence-rescue-counterfactual",
    label: "weak-evidence rescue counterfactual",
    candidates: [
      { id: "wr-1", title: "Strong Rescue One", description: "A mystery detective novel.", categories: ["Fiction / Mystery"], likedSignals: ["mystery"], score: 9.4 },
      { id: "wr-2", title: "Strong Rescue Two", description: "A thriller detective novel.", categories: ["Fiction / Thrillers"], likedSignals: ["thriller"], score: 9.2 },
      { id: "wr-3", title: "Weak Rescue Three", description: "General fiction listing.", categories: ["Fiction / General"], likedSignals: ["mystery"], score: 9.0 },
      { id: "wr-4", title: "Weak Rescue Four", description: "General fiction listing.", categories: ["Fiction / General"], likedSignals: ["thriller"], score: 8.8 },
      { id: "wr-5", title: "Weak Rescue Five", description: "General fiction listing.", categories: ["Fiction / General"], likedSignals: ["detective"], score: 8.7 },
      { id: "wr-6", title: "Unrelated Tail", description: "No taste overlap", categories: ["History"], likedSignals: [], score: 8.0 },
    ],
  },
  {
    caseId: "multiple-simultaneous-changes",
    label: "multiple simultaneous changes",
    profileDislikedSignals: ["mystery"],
    candidates: [
      { id: "mc-1", title: "Strong Winner", description: "A detective mystery with clear narrative evidence.", categories: ["Fiction / Mystery"], likedSignals: ["mystery", "detective"], score: 9.5 },
      { id: "mc-2", title: "Secondary Winner", description: "A moody suspense story.", categories: ["Fiction / General"], likedSignals: ["moody"], score: 9.3 },
      { id: "mc-3", title: "Weak Underfill Candidate", description: "A sparse fiction listing.", categories: ["Fiction / General"], likedSignals: ["mystery"], score: 9.1 },
      { id: "mc-4", title: "Identity Rejected Candidate", description: "A companion guide to mysteries.", categories: ["Reference / Guides"], likedSignals: ["mystery"], publicationShape: "writing_guide", score: 9.0 },
      { id: "mc-5", title: "Conflicting Candidate", description: "A mystery text with avoid overlap.", categories: ["Fiction / Mystery"], likedSignals: ["mystery"], dislikedSignals: ["mystery"], score: 8.9, scoreBreakdown: { avoidSignalPenalty: -3.8 } },
      { id: "mc-6", title: "Unrelated Candidate", description: "A broad catalog listing.", categories: ["History"], likedSignals: [], score: 8.6 },
    ],
  },
];

const rows = fixtureCases.map((entry) => ({
  caseId: entry.caseId,
  label: entry.label,
  adult: runBand("adult", entry),
  teen: runBand("teens", entry),
}));

const aggregate = {
  fixtureCount: rows.length,
  adultCasesWithCounterfactualSlateDelta: rows.filter((row) => row.adult.newlyAdmittedTitles.length > 0 || row.adult.newlyRemovedTitles.length > 0).length,
  teenCasesWithCounterfactualSlateDelta: rows.filter((row) => row.teen.newlyAdmittedTitles.length > 0 || row.teen.newlyRemovedTitles.length > 0).length,
  adultCasesWithPolarityPolicyEffect: rows.filter((row) => row.adult.policyEffects.altersPolarityHandling).length,
  teenCasesWithWeakUnderfillEffect: rows.filter((row) => row.teen.policyEffects.altersWeakCandidateRescue).length,
  teenCasesWithQueryDerivedEvidenceEffect: rows.filter((row) => row.teen.policyEffects.altersQueryDerivedEvidenceTreatment).length,
  adultCasesWithQueryDerivedEvidenceEffect: rows.filter((row) => row.adult.policyEffects.altersQueryDerivedEvidenceTreatment).length,
  teenCasesWithIdentityEligibilityExclusion: rows.filter((row) => row.teen.policyEffects.altersIdentityEnforcement).length,
  adultCasesWithIdentityEligibilityExclusion: rows.filter((row) => row.adult.policyEffects.altersIdentityEnforcement).length,
};

const selectSource = readFileSync(selectSourcePath, "utf8");
const inventory = {
  sourcePath: selectSourcePath,
  hasAdultWeightedCounterfactualDiagnostics: /adultTasteWeightedCounterfactualCandidateDecisionByTitle/.test(selectSource),
  hasTeenCounterfactualFinalSlateDiagnostics: /teenGoogleBooksCounterfactualFinalTitles/.test(selectSource),
  hasAdultCounterfactualFinalTitlesDiagnostic: /adultGoogleBooksCounterfactualFinalTitles/.test(selectSource),
  hasTeenCounterfactualUsesTiering: /teenGoogleBooksStrongCandidates[\s\S]*teenGoogleBooksWeakCandidates/.test(selectSource),
  hasAdultCounterfactualUsesWeightedPolarity: /adultGoogleBooksWeightedCounterfactualDecision\(/.test(selectSource),
  teenCounterfactualDiagnosticOnlyExport: /diagnostics\.teenGoogleBooksCounterfactualFinalTitles\s*=/.test(selectSource),
  adultWeightedCounterfactualDiagnosticOnlyExport: /diagnostics\.adultTasteWeightedCounterfactualCandidateDecisionByTitle\s*=/.test(selectSource),
};

let decision = "equivalent_duplication";
let rationale = "Adult and Teen counterfactuals appear to model the same hypothetical final-slate operation.";

const teenUsesTiering = aggregate.teenCasesWithWeakUnderfillEffect > 0 || inventory.hasTeenCounterfactualUsesTiering;
const adultUsesPolarity = aggregate.adultCasesWithPolarityPolicyEffect > 0 || inventory.hasAdultCounterfactualUsesWeightedPolarity;
const teenUsesQueryEvidenceTreatment = aggregate.teenCasesWithQueryDerivedEvidenceEffect > 0;
const adultUsesQueryEvidenceTreatment = aggregate.adultCasesWithQueryDerivedEvidenceEffect > 0;

if (
  inventory.teenCounterfactualDiagnosticOnlyExport
  && inventory.adultWeightedCounterfactualDiagnosticOnlyExport
  && teenUsesTiering
  && adultUsesPolarity
  && (teenUsesQueryEvidenceTreatment || aggregate.teenCasesWithWeakUnderfillEffect > 0)
) {
  decision = "different_hypothetical_questions";
  rationale = "Teen counterfactual models tiered final-slate composition (strong/secondary/weak-underfill and query-derived evidence treatment), while Adult counterfactual models weighted-polarity family decisions per candidate. They answer different hypothetical questions despite similar naming.";
} else if (teenUsesTiering && !adultUsesPolarity) {
  decision = "adult_production_teen_diagnostic_only";
  rationale = "Teen exposes counterfactual slate simulation while Adult lacks equivalent counterfactual production-role behavior.";
} else if (adultUsesPolarity && !teenUsesTiering) {
  decision = "same_counterfactual_engine_different_policy_parameters";
  rationale = "Both expose counterfactual behavior but observed differences are policy-parameterized rather than semantic.";
}

const result = {
  generatedAt: new Date().toISOString(),
  capability: "#205 Counterfactual final slate",
  inventory,
  aggregate,
  rows,
  decision: {
    decision,
    rationale,
    outcomes: {
      same_counterfactual_engine_different_policy_parameters: "Extract simulation framework only and keep separate policy parameters.",
      equivalent_duplication: "Freeze parity and consolidate.",
      different_hypothetical_questions: "Reclassify as same-name/different-semantics; do not force parity-preserving consolidation.",
      adult_production_teen_diagnostic_only: "Reclassify as adult-production/teen-diagnostic asymmetry.",
    },
  },
};

mkdirSync(outDir, { recursive: true });
const jsonOut = resolve(outDir, "googlebooks-205-counterfactual-final-slate-role-gate.json");
const csvOut = resolve(outDir, "googlebooks-205-counterfactual-final-slate-role-gate.csv");
writeFileSync(jsonOut, JSON.stringify(result, null, 2));

const header = [
  "caseId",
  "label",
  "adultActualFinalCount",
  "adultCounterfactualFinalCount",
  "adultNewlyAdmittedCount",
  "adultNewlyRemovedCount",
  "adultPolarityEffect",
  "adultWeakRescueEffect",
  "teenActualFinalCount",
  "teenCounterfactualFinalCount",
  "teenNewlyAdmittedCount",
  "teenNewlyRemovedCount",
  "teenRankingOrderChangedSameMembers",
  "teenWeakRescueEffect",
  "teenQueryDerivedEvidenceEffect",
  "teenIdentityEffect",
].join(",");

const csvRows = rows.map((row) => [
  row.caseId,
  `"${row.label.replace(/"/g, "\"\"")}"`,
  row.adult.actualFinalTitles.length,
  row.adult.counterfactualFinalTitles.length,
  row.adult.newlyAdmittedTitles.length,
  row.adult.newlyRemovedTitles.length,
  row.adult.policyEffects.altersPolarityHandling ? "true" : "false",
  row.adult.policyEffects.altersWeakCandidateRescue ? "true" : "false",
  row.teen.actualFinalTitles.length,
  row.teen.counterfactualFinalTitles.length,
  row.teen.newlyAdmittedTitles.length,
  row.teen.newlyRemovedTitles.length,
  row.teen.rankingOrderChangedSameMembers ? "true" : "false",
  row.teen.policyEffects.altersWeakCandidateRescue ? "true" : "false",
  row.teen.policyEffects.altersQueryDerivedEvidenceTreatment ? "true" : "false",
  row.teen.policyEffects.altersIdentityEnforcement ? "true" : "false",
].join(","));
writeFileSync(csvOut, [header, ...csvRows].join("\n"));

console.log("=== GOOGLE BOOKS #205 COUNTERFACTUAL FINAL-SLATE ROLE GATE ===");
console.log(`Fixtures: ${aggregate.fixtureCount}`);
console.log(`Adult counterfactual slate-delta cases: ${aggregate.adultCasesWithCounterfactualSlateDelta}`);
console.log(`Teen counterfactual slate-delta cases: ${aggregate.teenCasesWithCounterfactualSlateDelta}`);
console.log(`Adult polarity-effect cases: ${aggregate.adultCasesWithPolarityPolicyEffect}`);
console.log(`Teen weak-underfill cases: ${aggregate.teenCasesWithWeakUnderfillEffect}`);
console.log(`Teen query-derived-evidence-effect cases: ${aggregate.teenCasesWithQueryDerivedEvidenceEffect}`);
console.log(`Decision: ${decision}`);
console.log(`Rationale: ${rationale}`);
console.log(`JSON written to: ${jsonOut}`);
console.log(`CSV written to: ${csvOut}`);
