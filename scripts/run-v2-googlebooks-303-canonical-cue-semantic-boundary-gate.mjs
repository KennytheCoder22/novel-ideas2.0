/**
 * #303 canonical-cue semantic-boundary gate.
 *
 * Goal:
 * - Separate detection, normalization, and policy layers for canonical cues.
 * - Determine whether Adult/Teen produce the same normalized canonical evidence
 *   before age-band policy is applied.
 *
 * Usage:
 *   node scripts/run-v2-googlebooks-303-canonical-cue-semantic-boundary-gate.mjs
 *
 * Outputs:
 *   scripts/output/googlebooks-303-canonical-cue-semantic-boundary-gate.json
 *   scripts/output/googlebooks-303-canonical-cue-semantic-boundary-gate.csv
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

const { scoreCandidates } = require(resolve(repoRoot, "app/recommender-v2/score.ts"));
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

function arrayValue(value) {
  return Array.isArray(value) ? value : [];
}

function parseCueLexicon(selectSource) {
  const cueRows = [];
  const cuePattern = /\{\s*family:\s*"([^"]+)",\s*phrase:\s*"([^"]+)",\s*pattern:\s*\/(.+?)\/([gimsuy]*)\s*\}/g;
  let match;
  while ((match = cuePattern.exec(selectSource)) !== null) {
    cueRows.push({
      family: match[1],
      phrase: match[2],
      regex: new RegExp(match[3], match[4] || ""),
    });
  }

  const blockValues = (startMarker) => {
    const start = selectSource.indexOf(startMarker);
    if (start < 0) return [];
    const end = selectSource.indexOf("]);", start);
    if (end < 0) return [];
    const block = selectSource.slice(start, end);
    return Array.from(block.matchAll(/"([^"]+)"/g)).map((row) => row[1]);
  };

  const canonicalPhrases = new Set(blockValues("const ADULT_GOOGLEBOOKS_CANONICAL_NARRATIVE_CUES = new Set(["));
  const aliasPhrases = new Set(blockValues("const ADULT_GOOGLEBOOKS_GENUINE_ALIAS_CUE_PHRASES = new Set(["));
  const phraseFamilyMap = new Map(cueRows.map((row) => [normalized(row.phrase), row.family]));
  return { cueRows, canonicalPhrases, aliasPhrases, phraseFamilyMap };
}

function profile(ageBand, likes = [], dislikes = []) {
  const signals = [
    ...likes.map((value, index) => ({
      title: `${ageBand}-liked-${index + 1}-${value}`,
      action: "like",
      genres: [value],
      tags: [value],
      source: "mock",
      format: "book",
    })),
    ...dislikes.map((value, index) => ({
      title: `${ageBand}-disliked-${index + 1}-${value}`,
      action: "dislike",
      genres: [value],
      tags: [value],
      source: "mock",
      format: "book",
    })),
  ];
  return buildTasteProfile({ ageBand, enabledSources: { googleBooks: true }, signals });
}

function candidate(input, ageBand) {
  const id = String(input.caseId || "case");
  const title = String(input.title || "Untitled");
  const subtitle = String(input.subtitle || "");
  const description = String(input.description || "");
  const categories = Array.isArray(input.categories) ? input.categories.map(String) : ["Fiction / General"];
  const publicationShape = String(input.publicationShape || "novel");
  const maturityBand = ageBand === "teens" ? "teens" : "adult";
  return {
    id: `gb303-${id}-${ageBand}`,
    source: "googleBooks",
    sourceId: `${id}-${ageBand}`,
    title,
    subtitle,
    creators: ["Gate Fixture Author"],
    description,
    formats: ["book"],
    genres: categories,
    themes: [],
    tones: [],
    characterDynamics: [],
    maturityBand,
    publicationYear: 2024,
    sourceUrl: "",
    raw: {
      id: `${id}-${ageBand}`,
      subtitle,
      description,
      googleBooksPublicationShape: publicationShape,
      volumeInfo: {
        title,
        subtitle,
        description,
        categories,
        maturityRating: "NOT_MATURE",
        printType: "BOOK",
        language: "en",
      },
    },
    diagnostics: {
      googleBooksPublicationShape: publicationShape,
      googleBooksPublicationShapeEvidence: publicationShape === "novel" ? ["novel_or_narrative_fiction_shape"] : [`${publicationShape}_fixture`],
      googleBooksPublicationShapePrecedenceDecision: publicationShape === "novel"
        ? "novel_supported_by_story_level_evidence"
        : `${publicationShape}_identity_overrides_narrative_signals`,
      googleBooksStoryLevelNarrativeEvidence: publicationShape === "novel" ? ["story_level_description"] : [],
      queryText: ageBand === "teens" ? "young adult mystery thriller" : "adult mystery thriller",
      originalPlannedQuery: ageBand === "teens" ? "young adult mystery thriller" : "adult mystery thriller",
      queryFamily: "mystery",
      facets: ["mystery", "thriller"],
      googleBooksAudienceBand: maturityBand,
      googleBooksContentMaturity: "not_mature",
      googleBooksSourceMaturityRating: "NOT_MATURE",
      ...(input.candidateDiagnostics && typeof input.candidateDiagnostics === "object" ? input.candidateDiagnostics : {}),
    },
    score: Number(input.score || 8),
    scoreBreakdown: {
      genreFacetMatch: Number(input.genreFacetMatch || 2),
      positiveTasteMatch: Number(input.positiveTasteMatch || 3),
      sourceQualityRelevance: 1.5,
      avoidSignalPenalty: Number(input.avoidSignalPenalty || 0),
      broadAvoidSignalPenalty: 0,
    },
    rejectedReasons: [],
  };
}

function fieldTextByName(candidateRow, field) {
  if (field === "title") return String(candidateRow.title || "");
  if (field === "subtitle") return String(candidateRow.subtitle || "");
  if (field === "categories") return (Array.isArray(candidateRow.genres) ? candidateRow.genres : []).join(" | ");
  if (field === "description") return String(candidateRow.description || "");
  return "";
}

function detectSharedNormalization(candidateRow, lexicon) {
  const fields = [
    { name: "title", text: fieldTextByName(candidateRow, "title") },
    { name: "subtitle", text: fieldTextByName(candidateRow, "subtitle") },
    { name: "categories", text: fieldTextByName(candidateRow, "categories") },
    { name: "description", text: fieldTextByName(candidateRow, "description") },
  ];
  const records = [];
  for (const cue of lexicon.cueRows) {
    for (const field of fields) {
      if (!field.text) continue;
      if (!cue.regex.test(field.text)) continue;
      const phraseKey = normalized(cue.phrase);
      const normalizationReason = lexicon.canonicalPhrases.has(phraseKey)
        ? "canonical_phrase"
        : lexicon.aliasPhrases.has(phraseKey)
          ? "approved_alias_phrase"
          : "cue_lexicon_mapping";
      records.push({
        detectedCue: cue.phrase,
        matchedField: field.name,
        matchedText: field.text.slice(0, 180),
        matchMethod: "cue_regex_pattern",
        canonicalFamily: cue.family,
        normalizationReason,
        confidence: 1,
      });
    }
  }
  return records;
}

function teenFamilyForSignal(signal, lexicon) {
  const key = normalized(signal);
  if (lexicon.phraseFamilyMap.has(key)) return lexicon.phraseFamilyMap.get(key);
  const regexMatch = lexicon.cueRows.find((row) => row.regex.test(key));
  return regexMatch ? regexMatch.family : "";
}

function confidenceFromTeenClassification(classification) {
  if (classification === "strong_match") return 1;
  if (classification === "defensible_secondary_match") return 0.7;
  if (classification === "query_supported_but_weak") return 0.4;
  if (classification === "actively_conflicting") return 0.2;
  return 0.1;
}

function adultRecordsFromDiagnostics(diagnostics, title) {
  const promotionEvidenceByTitle = mapObject(diagnostics.adultGoogleBooksCanonicalNarrativeFamilyPromotionEvidenceByTitle);
  const parserConfidenceByTitle = mapObject(diagnostics.adultGoogleBooksParserConfidenceByTitle);
  const rows = arrayValue(promotionEvidenceByTitle[title]);
  const parserConfidence = Number(parserConfidenceByTitle[title] || 0);
  return rows.map((row) => ({
    detectedCue: String(row?.phrase || ""),
    matchedField: String(row?.field || ""),
    matchedText: String(row?.matchedText || ""),
    matchMethod: "adult_canonical_cue_promotion_regex",
    canonicalFamily: String(row?.expectedFamily || ""),
    normalizationReason: String(row?.canonicalRule || row?.decision || ""),
    confidence: parserConfidence,
    promotionApplied: Boolean(row?.applied),
    policyEffect: {
      promotedAs: String(row?.promotedAs || ""),
      productionPolarity: String(row?.productionPolarity || ""),
      decision: String(row?.decision || ""),
    },
  }));
}

function teenRecordsFromDiagnostics(diagnostics, title, candidateRow, lexicon) {
  const signalFieldsByTitle = mapObject(diagnostics.teenGoogleBooksSignalFieldsByTitle);
  const docNativeByTitle = mapObject(diagnostics.teenGoogleBooksDocumentNativeSpecificSignalsByTitle);
  const classificationByTitle = mapObject(diagnostics.teenGoogleBooksMeaningfulTasteClassificationByTitle);
  const tasteTierReasonByTitle = mapObject(diagnostics.teenGoogleBooksTasteTierSelectionReasonByTitle);
  const signalFields = mapObject(signalFieldsByTitle[title]);
  const docSignals = unique(docNativeByTitle[title] || []);
  const classification = String(classificationByTitle[title] || "");
  const records = [];
  for (const signal of docSignals) {
    const fields = unique(signalFields[signal] || []);
    const family = String(teenFamilyForSignal(signal, lexicon) || "");
    const phraseKey = normalized(signal);
    const normalizationReason = !family
      ? "no_canonical_mapping"
      : lexicon.canonicalPhrases.has(phraseKey)
        ? "canonical_phrase"
        : lexicon.aliasPhrases.has(phraseKey)
          ? "approved_alias_phrase"
          : "cue_lexicon_mapping";
    for (const field of fields) {
      records.push({
        detectedCue: signal,
        matchedField: field,
        matchedText: fieldTextByName(candidateRow, field).slice(0, 180),
        matchMethod: "teen_signal_field_match",
        canonicalFamily: family,
        normalizationReason,
        confidence: confidenceFromTeenClassification(classification),
        promotionApplied: false,
        policyEffect: {
          classification,
          tierReason: String(tasteTierReasonByTitle[title] || ""),
        },
      });
    }
  }
  return records;
}

function canonicalKey(record) {
  return `${normalized(record.detectedCue)}|${normalized(record.matchedField)}|${normalized(record.canonicalFamily)}`;
}

function runFixture(fixture, lexicon) {
  const adultProfile = profile("adult", fixture.profileLikedSignals || fixture.likedSignals || [], fixture.profileDislikedSignals || fixture.dislikedSignals || []);
  const teenProfile = profile("teens", fixture.profileLikedSignals || fixture.likedSignals || [], fixture.profileDislikedSignals || fixture.dislikedSignals || []);
  const adultCandidate = candidate(fixture, "adult");
  const teenCandidate = candidate(fixture, "teens");
  const adultSelection = selectRecommendations(scoreCandidates([adultCandidate], adultProfile), adultProfile, 5);
  const teenSelection = selectRecommendations(scoreCandidates([teenCandidate], teenProfile), teenProfile, 5);
  const adultDiagnostics = mapObject(adultSelection.rejectedReasons);
  const teenDiagnostics = mapObject(teenSelection.rejectedReasons);

  const sharedRecords = detectSharedNormalization(adultCandidate, lexicon);
  const adultRecords = adultRecordsFromDiagnostics(adultDiagnostics, adultCandidate.title);
  const teenRecords = teenRecordsFromDiagnostics(teenDiagnostics, teenCandidate.title, teenCandidate, lexicon);
  const adultCanonical = adultRecords.filter((row) => row.canonicalFamily).map(canonicalKey);
  const teenCanonical = teenRecords.filter((row) => row.canonicalFamily).map(canonicalKey);
  const adultSet = new Set(adultCanonical);
  const teenSet = new Set(teenCanonical);

  const adultOnly = unique(adultCanonical.filter((key) => !teenSet.has(key)));
  const teenOnly = unique(teenCanonical.filter((key) => !adultSet.has(key)));
  const shared = unique(adultCanonical.filter((key) => teenSet.has(key)));
  const parityAtNormalization = adultOnly.length === 0 && teenOnly.length === 0;

  return {
    caseId: fixture.caseId,
    label: fixture.label,
    expectedScenario: fixture.expectedScenario,
    sharedNormalizationOracle: sharedRecords,
    adult: { records: adultRecords },
    teen: { records: teenRecords },
    normalizationComparison: {
      adultCanonicalCount: adultCanonical.length,
      teenCanonicalCount: teenCanonical.length,
      sharedCanonicalCount: shared.length,
      adultOnlyCanonicalKeys: adultOnly,
      teenOnlyCanonicalKeys: teenOnly,
      parityAtNormalization,
    },
  };
}

const fixtures = [
  {
    caseId: "direct-canonical-phrase",
    label: "direct canonical phrase",
    expectedScenario: "cue maps directly to canonical family",
    title: "Harbor Mystery",
    subtitle: "",
    description: "A mystery thriller follows a detective through a conspiracy.",
    categories: ["Fiction / Mystery & Detective"],
    likedSignals: ["mystery", "thriller", "detective", "conspiracy"],
  },
  {
    caseId: "approved-alias",
    label: "approved alias",
    expectedScenario: "alias phrase normalizes to canonical family",
    title: "Night Shift",
    subtitle: "",
    description: "A serial killer investigation terrifies a small city.",
    categories: ["Fiction / Thrillers"],
    likedSignals: ["serial killer", "investigation", "thriller"],
  },
  {
    caseId: "punctuation-acronym-variants",
    label: "punctuation and acronym variants",
    expectedScenario: "sci-fi punctuation variants should map consistently",
    title: "Orbital Rain",
    subtitle: "A Sci-Fi survival novel",
    description: "A science fiction crew fights for survival in deep space.",
    categories: ["Fiction / Science Fiction / General"],
    likedSignals: ["sci-fi", "science fiction", "survival", "space"],
  },
  {
    caseId: "cue-in-title-subtitle-categories-description",
    label: "cue in title/subtitle/categories/description",
    expectedScenario: "field detection coverage across primary metadata fields",
    title: "Ghost Harbor",
    subtitle: "A Horror Novel",
    description: "A haunted town confronts a ghostly force.",
    categories: ["Fiction / Horror / Supernatural"],
    likedSignals: ["ghost", "horror", "haunted", "supernatural"],
  },
  {
    caseId: "multiple-cues-one-family",
    label: "multiple cues map to one family",
    expectedScenario: "multiple phrase variants normalize to same family",
    title: "Cold Evidence",
    subtitle: "",
    description: "A detective investigates murder and crime in a noir city.",
    categories: ["Fiction / Mystery & Detective"],
    likedSignals: ["detective", "investigation", "murder", "crime", "noir"],
  },
  {
    caseId: "ambiguous-multi-family-cue-set",
    label: "cue set spans multiple families",
    expectedScenario: "same record includes cross-family cues",
    title: "Broken Crowns",
    subtitle: "",
    description: "A historical romance with murder and supernatural rumors.",
    categories: ["Fiction / Historical", "Fiction / Romance / Historical"],
    likedSignals: ["historical", "romance", "murder", "supernatural"],
  },
  {
    caseId: "already-present-family-evidence",
    label: "already-present family evidence",
    expectedScenario: "promotion may be redundant after extraction",
    title: "The Final Detective",
    subtitle: "",
    description: "A detective thriller where every suspect has a motive.",
    categories: ["Fiction / Mystery & Detective / Police Procedural"],
    likedSignals: ["detective", "thriller", "mystery"],
  },
  {
    caseId: "negated-or-contextual-mention",
    label: "negated/contextual mention",
    expectedScenario: "context can alter downstream policy usage",
    title: "Not a Thriller",
    subtitle: "",
    description: "This is not a thriller and not a mystery, but a family drama.",
    categories: ["Fiction / Literary"],
    likedSignals: ["thriller", "mystery", "drama"],
  },
  {
    caseId: "weak-generic-must-not-promote",
    label: "weak generic phrase",
    expectedScenario: "generic promotional language should not canonically promote",
    title: "Perfect for Readers",
    subtitle: "",
    description: "A gripping page turner perfect for readers who love bold storytelling.",
    categories: ["Fiction / General"],
    likedSignals: ["gripping", "page-turner", "perfect for readers"],
  },
  {
    caseId: "conflicting-positive-negative-cues",
    label: "conflicting positive and negative cues",
    expectedScenario: "same family receives both support and conflict signals",
    title: "Dark Corridor",
    subtitle: "",
    description: "A mystery thriller with hated detective tropes and serial murders.",
    categories: ["Fiction / Mystery & Detective"],
    likedSignals: ["mystery", "thriller", "detective", "murder"],
    dislikedSignals: ["mystery", "thriller"],
    profileDislikedSignals: ["mystery", "thriller"],
    avoidSignalPenalty: -3.5,
  },
  {
    caseId: "no-match-control",
    label: "no-match control",
    expectedScenario: "no canonical cue detection",
    title: "Plain Ledger",
    subtitle: "",
    description: "A general nonfiction account of municipal finance.",
    categories: ["Business & Economics / Accounting"],
    likedSignals: ["finance"],
  },
];

const selectSource = readFileSync(selectSourcePath, "utf8");
const lexicon = parseCueLexicon(selectSource);
const rows = fixtures.map((fixture) => runFixture(fixture, lexicon));

const aggregate = {
  fixtureCount: rows.length,
  adultCanonicalRecords: rows.reduce((sum, row) => sum + row.normalizationComparison.adultCanonicalCount, 0),
  teenCanonicalRecords: rows.reduce((sum, row) => sum + row.normalizationComparison.teenCanonicalCount, 0),
  sharedCanonicalRecords: rows.reduce((sum, row) => sum + row.normalizationComparison.sharedCanonicalCount, 0),
  parityFixtureCount: rows.filter((row) => row.normalizationComparison.parityAtNormalization).length,
  nonParityFixtureCount: rows.filter((row) => !row.normalizationComparison.parityAtNormalization).length,
  adultOnlyCanonicalKeyCount: rows.reduce((sum, row) => sum + row.normalizationComparison.adultOnlyCanonicalKeys.length, 0),
  teenOnlyCanonicalKeyCount: rows.reduce((sum, row) => sum + row.normalizationComparison.teenOnlyCanonicalKeys.length, 0),
  teenCanonicalCoverageRate: rows.reduce((sum, row) => sum + row.normalizationComparison.sharedCanonicalCount, 0)
    / Math.max(1, rows.reduce((sum, row) => sum + row.normalizationComparison.adultCanonicalCount, 0)),
};

const inventory = {
  sourcePath: selectSourcePath,
  hasAdultCanonicalCueLexicon: /const ADULT_GOOGLEBOOKS_NARRATIVE_CUES/.test(selectSource),
  hasAdultCanonicalPromotionFunction: /function adultGoogleBooksCanonicalNarrativeFamilyPromotions\(/.test(selectSource),
  hasTeenCanonicalCueLexicon: /const TEEN_GOOGLEBOOKS_NARRATIVE_CUES/.test(selectSource),
  hasTeenCanonicalPromotionFunction: /function teenGoogleBooksCanonicalNarrativeFamilyPromotions\(/.test(selectSource),
  hasTeenCanonicalNormalizationDiagnostics: /teenGoogleBooksCanonicalNarrativeFamilyPromotionsByTitle/.test(selectSource),
  hasTeenSignalFieldDiagnostics: /teenGoogleBooksSignalFieldsByTitle/.test(selectSource),
};

let decision = "policy_contaminated_transform_split";
let rationale = "Adult canonical cue path and Teen signal path do not emit equivalent normalized canonical evidence prior to policy.";

if (aggregate.adultCanonicalRecords > 0 && aggregate.teenCanonicalRecords === 0) {
  decision = "adult_only_canonicalization_capability";
  rationale = "Adult exposes canonicalization behavior while Teen exposes no canonical family normalization output.";
} else if (aggregate.nonParityFixtureCount === 0 && aggregate.adultCanonicalRecords === aggregate.teenCanonicalRecords) {
  decision = "parity_candidate";
  rationale = "Adult and Teen produce identical canonical detection+normalization outputs before policy across all fixtures.";
} else if (
  aggregate.teenCanonicalCoverageRate >= 0.9
  && inventory.hasTeenSignalFieldDiagnostics
  && !inventory.hasTeenCanonicalCueLexicon
) {
  decision = "shared_semantic_transform_with_age_specific_policy_wrappers";
  rationale = "Detection/normalization mostly align at canonical-family level, but Teen currently routes through a different policy-facing surface; extract shared transform and keep separate policy wrappers.";
}

const result = {
  generatedAt: new Date().toISOString(),
  capability: "#303 Canonical cue promotion semantic boundary gate",
  inventory,
  aggregate,
  rows,
  decision: {
    decision,
    rationale,
    outcomes: {
      shared_semantic_transform_with_age_specific_policy_wrappers: "Extract shared detection+normalization primitive only; keep Adult/Teen policy wrappers separate.",
      policy_contaminated_transform_split: "Reclassify as semantic split; do not force consolidation.",
      parity_candidate: "Freeze parity baseline and proceed with narrow consolidation.",
      adult_only_canonicalization_capability: "Keep age-specific and remove from active consolidation.",
    },
  },
};

mkdirSync(outDir, { recursive: true });
const jsonOut = resolve(outDir, "googlebooks-303-canonical-cue-semantic-boundary-gate.json");
const csvOut = resolve(outDir, "googlebooks-303-canonical-cue-semantic-boundary-gate.csv");
writeFileSync(jsonOut, JSON.stringify(result, null, 2));

const header = [
  "caseId",
  "label",
  "adultCanonicalCount",
  "teenCanonicalCount",
  "sharedCanonicalCount",
  "parityAtNormalization",
  "adultOnlyKeys",
  "teenOnlyKeys",
].join(",");

const csvRows = rows.map((row) => [
  row.caseId,
  `"${row.label.replace(/"/g, "\"\"")}"`,
  row.normalizationComparison.adultCanonicalCount,
  row.normalizationComparison.teenCanonicalCount,
  row.normalizationComparison.sharedCanonicalCount,
  row.normalizationComparison.parityAtNormalization ? "true" : "false",
  `"${row.normalizationComparison.adultOnlyCanonicalKeys.join(" | ").replace(/"/g, "\"\"")}"`,
  `"${row.normalizationComparison.teenOnlyCanonicalKeys.join(" | ").replace(/"/g, "\"\"")}"`,
].join(","));
writeFileSync(csvOut, [header, ...csvRows].join("\n"));

console.log("=== GOOGLE BOOKS #303 CANONICAL-CUE SEMANTIC BOUNDARY GATE ===");
console.log(`Fixtures: ${aggregate.fixtureCount}`);
console.log(`Adult canonical records: ${aggregate.adultCanonicalRecords}`);
console.log(`Teen canonical records: ${aggregate.teenCanonicalRecords}`);
console.log(`Shared canonical records: ${aggregate.sharedCanonicalRecords}`);
console.log(`Normalization parity fixtures: ${aggregate.parityFixtureCount}/${aggregate.fixtureCount}`);
console.log(`Teen canonical coverage rate: ${Math.round(aggregate.teenCanonicalCoverageRate * 1000) / 1000}`);
console.log(`Decision: ${decision}`);
console.log(`Rationale: ${rationale}`);
console.log(`JSON written to: ${jsonOut}`);
console.log(`CSV written to: ${csvOut}`);
