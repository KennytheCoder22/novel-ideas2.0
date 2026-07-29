/**
 * #303 semantic-core-only gate (policy removed).
 *
 * Goal:
 * - Compare only cue detection + canonical normalization between Adult and Teen.
 * - Ignore policy-dependent layers (promotion/eligibility/scoring/polarity/rescue).
 *
 * Usage:
 *   node scripts/run-v2-googlebooks-303-semantic-core-only-gate.mjs
 *
 * Outputs:
 *   scripts/output/googlebooks-303-semantic-core-only-gate.json
 *   scripts/output/googlebooks-303-semantic-core-only-gate.csv
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

const { semanticSignalMatchedFieldsByField } = require(resolve(repoRoot, "app/recommender-v2/score.ts"));

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

function fieldRows(fixture) {
  const categories = Array.isArray(fixture.categories) ? fixture.categories.map(String) : [];
  return [
    { field: "title", values: [String(fixture.title || "")] },
    { field: "subtitle", values: [String(fixture.subtitle || "")] },
    { field: "description", values: [String(fixture.description || "")] },
    { field: "categories", values: categories },
    { field: "genres", values: categories },
  ];
}

function matchedText(fieldValues, regex) {
  for (const value of fieldValues) {
    const text = String(value || "");
    const match = regex.exec(text);
    if (match && match[0]) return match[0];
  }
  return "";
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
  const phraseFamilyMap = new Map(cueRows.map((row) => [normalized(row.phrase), row.family]));
  return { cueRows, phraseFamilyMap };
}

function adultDetectionAndNormalization(fixture, lexicon) {
  const rows = [];
  const fields = fieldRows(fixture);
  for (const cue of lexicon.cueRows) {
    for (const field of fields) {
      const values = Array.isArray(field.values) ? field.values : [];
      const anyMatched = values.some((value) => cue.regex.test(String(value || "")));
      if (!anyMatched) continue;
      rows.push({
        detectedCue: cue.phrase,
        matchedField: field.field,
        matchedText: matchedText(values, cue.regex).slice(0, 180),
        matchMethod: "regex_pattern_match",
        canonicalFamily: cue.family,
        normalizationConfidence: 1,
      });
    }
  }
  return rows;
}

function teenDetectionAndNormalization(fixture, lexicon) {
  const rows = [];
  const fields = fieldRows(fixture);
  for (const cue of lexicon.cueRows) {
    const matchedFields = semanticSignalMatchedFieldsByField(fields, cue.phrase, {
      normalizeSignal: false,
      normalizeFieldText: false,
    });
    for (const fieldName of matchedFields) {
      const field = fields.find((entry) => entry.field === fieldName);
      rows.push({
        detectedCue: cue.phrase,
        matchedField: fieldName,
        matchedText: String((field?.values || []).join(" | ") || "").slice(0, 180),
        matchMethod: "signal_field_token_match",
        canonicalFamily: String(lexicon.phraseFamilyMap.get(normalized(cue.phrase)) || ""),
        normalizationConfidence: 1,
      });
    }
  }
  return rows;
}

function recordKey(record) {
  return [
    normalized(record.detectedCue),
    normalized(record.matchedField),
    normalized(record.matchedText),
    normalized(record.matchMethod),
    normalized(record.canonicalFamily),
    String(Number(record.normalizationConfidence || 0)),
  ].join("|");
}

function compareFixture(fixture, lexicon) {
  const adultRecords = adultDetectionAndNormalization(fixture, lexicon);
  const teenRecords = teenDetectionAndNormalization(fixture, lexicon);
  const adultKeys = unique(adultRecords.map(recordKey));
  const teenKeys = unique(teenRecords.map(recordKey));
  const adultSet = new Set(adultKeys);
  const teenSet = new Set(teenKeys);
  const adultOnly = adultKeys.filter((key) => !teenSet.has(key));
  const teenOnly = teenKeys.filter((key) => !adultSet.has(key));
  const shared = adultKeys.filter((key) => teenSet.has(key));
  return {
    caseId: fixture.caseId,
    label: fixture.label,
    adultRecords,
    teenRecords,
    comparison: {
      adultRecordCount: adultKeys.length,
      teenRecordCount: teenKeys.length,
      sharedRecordCount: shared.length,
      parity: adultOnly.length === 0 && teenOnly.length === 0,
      adultOnlyRecordKeys: adultOnly,
      teenOnlyRecordKeys: teenOnly,
    },
  };
}

const fixtures = [
  {
    caseId: "direct-canonical-phrase",
    label: "direct canonical phrase",
    title: "Harbor Mystery",
    subtitle: "",
    description: "A mystery thriller follows a detective through a conspiracy.",
    categories: ["Fiction / Mystery & Detective"],
  },
  {
    caseId: "approved-alias",
    label: "approved alias",
    title: "Night Shift",
    subtitle: "",
    description: "A serial killer investigation terrifies a small city.",
    categories: ["Fiction / Thrillers"],
  },
  {
    caseId: "punctuation-acronym-variants",
    label: "punctuation and acronym variants",
    title: "Orbital Rain",
    subtitle: "A Sci-Fi survival novel",
    description: "A science fiction crew fights for survival in deep space.",
    categories: ["Fiction / Science Fiction / General"],
  },
  {
    caseId: "cue-in-title-subtitle-categories-description",
    label: "cue in title/subtitle/categories/description",
    title: "Ghost Harbor",
    subtitle: "A Horror Novel",
    description: "A haunted town confronts a ghostly force.",
    categories: ["Fiction / Horror / Supernatural"],
  },
  {
    caseId: "multiple-cues-one-family",
    label: "multiple cues map to one family",
    title: "Cold Evidence",
    subtitle: "",
    description: "A detective investigates murder and crime in a noir city.",
    categories: ["Fiction / Mystery & Detective"],
  },
  {
    caseId: "ambiguous-multi-family-cue-set",
    label: "cue set spans multiple families",
    title: "Broken Crowns",
    subtitle: "",
    description: "A historical romance with murder and supernatural rumors.",
    categories: ["Fiction / Historical", "Fiction / Romance / Historical"],
  },
  {
    caseId: "already-present-family-evidence",
    label: "already-present family evidence",
    title: "The Final Detective",
    subtitle: "",
    description: "A detective thriller where every suspect has a motive.",
    categories: ["Fiction / Mystery & Detective / Police Procedural"],
  },
  {
    caseId: "negated-or-contextual-mention",
    label: "negated/contextual mention",
    title: "Not a Thriller",
    subtitle: "",
    description: "This is not a thriller and not a mystery, but a family drama.",
    categories: ["Fiction / Literary"],
  },
  {
    caseId: "weak-generic-must-not-promote",
    label: "weak generic phrase",
    title: "Perfect for Readers",
    subtitle: "",
    description: "A gripping page turner perfect for readers who love bold storytelling.",
    categories: ["Fiction / General"],
  },
  {
    caseId: "conflicting-positive-negative-cues",
    label: "conflicting positive and negative cues",
    title: "Dark Corridor",
    subtitle: "",
    description: "A mystery thriller with detective clues and serial murders.",
    categories: ["Fiction / Mystery & Detective"],
  },
  {
    caseId: "no-match-control",
    label: "no-match control",
    title: "Plain Ledger",
    subtitle: "",
    description: "A general nonfiction account of municipal finance.",
    categories: ["Business & Economics / Accounting"],
  },
];

const selectSource = readFileSync(selectSourcePath, "utf8");
const lexicon = parseCueLexicon(selectSource);
const rows = fixtures.map((fixture) => compareFixture(fixture, lexicon));

const aggregate = {
  fixtureCount: rows.length,
  parityFixtureCount: rows.filter((row) => row.comparison.parity).length,
  nonParityFixtureCount: rows.filter((row) => !row.comparison.parity).length,
  totalAdultRecords: rows.reduce((sum, row) => sum + row.comparison.adultRecordCount, 0),
  totalTeenRecords: rows.reduce((sum, row) => sum + row.comparison.teenRecordCount, 0),
  totalSharedRecords: rows.reduce((sum, row) => sum + row.comparison.sharedRecordCount, 0),
  recordParityRatio: rows.reduce((sum, row) => sum + row.comparison.sharedRecordCount, 0)
    / Math.max(1, rows.reduce((sum, row) => sum + row.comparison.adultRecordCount, 0)),
};

let decision = "semantic_extraction_differs";
let rationale = "Detection/normalization records differ between Adult regex extraction and Teen signal-field extraction when policy layers are removed.";
if (aggregate.nonParityFixtureCount === 0 && aggregate.totalAdultRecords === aggregate.totalTeenRecords) {
  decision = "shared_semantic_core_hidden_inside_policy";
  rationale = "Detection and normalization are equivalent across fixtures; divergence is policy-layer only.";
}

const result = {
  generatedAt: new Date().toISOString(),
  capability: "#303 semantic core only",
  question: "If policy is removed, do Adult and Teen still produce the same canonical evidence records?",
  aggregate,
  rows,
  decision: {
    decision,
    rationale,
    outcomes: {
      shared_semantic_core_hidden_inside_policy: "Extract shared semantic normalization engine and keep age-specific policy wrappers.",
      semantic_extraction_differs: "Keep #303 classified as same_name_different_semantics; do not pursue shared normalization engine.",
    },
  },
};

mkdirSync(outDir, { recursive: true });
const jsonOut = resolve(outDir, "googlebooks-303-semantic-core-only-gate.json");
const csvOut = resolve(outDir, "googlebooks-303-semantic-core-only-gate.csv");
writeFileSync(jsonOut, JSON.stringify(result, null, 2));

const header = [
  "caseId",
  "label",
  "adultRecordCount",
  "teenRecordCount",
  "sharedRecordCount",
  "parity",
].join(",");
const csvRows = rows.map((row) => [
  row.caseId,
  `"${row.label.replace(/"/g, "\"\"")}"`,
  row.comparison.adultRecordCount,
  row.comparison.teenRecordCount,
  row.comparison.sharedRecordCount,
  row.comparison.parity ? "true" : "false",
].join(","));
writeFileSync(csvOut, [header, ...csvRows].join("\n"));

console.log("=== GOOGLE BOOKS #303 SEMANTIC CORE ONLY GATE ===");
console.log(`Fixtures: ${aggregate.fixtureCount}`);
console.log(`Parity fixtures: ${aggregate.parityFixtureCount}/${aggregate.fixtureCount}`);
console.log(`Record parity ratio: ${Math.round(aggregate.recordParityRatio * 1000) / 1000}`);
console.log(`Decision: ${decision}`);
console.log(`Rationale: ${rationale}`);
console.log(`JSON written to: ${jsonOut}`);
console.log(`CSV written to: ${csvOut}`);
