/**
 * Mystery primary query publication-shape audit.
 *
 * Runs the three mystery-G profiles through the production pipeline and
 * builds a gate-by-gate waterfall for the `young adult mystery fiction novel`
 * primary query:
 *
 *   20 raw API results
 *   ↓ structural (malformed / dedup / missing metadata)
 *   ↓ publication identity
 *   ↓ artifact / other source-policy
 *   ↓ acceptedAfterSourcePolicy = 3
 *
 * Then classifies each rejected title as:
 *   G1 — retrieval failure: Google Books returned non-narrative content;
 *         our filter is correct.
 *   G2 — downstream rejection: the title appears to be a legitimate
 *         narrative mystery; our filter may be over-rejecting.
 *   ambiguous — evidence is mixed.
 *
 * G1 >> G2 → the bottleneck is the query term (retrieval failure).
 * G2 >> G1 → the bottleneck is the publication identity gate (downstream
 *             rejection); a targeted relaxation may recover candidates.
 *
 * Read-only diagnostic.  No recommendation-policy changes.
 */

import { createRequire } from "node:module";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const outDir = resolve(scriptDir, "output");

const { runRecommenderV2 } = require(resolve(repoRoot, "app/recommender-v2/engine.ts"));

function parseDotEnv(path) {
  try {
    const raw = readFileSync(path, "utf8");
    const out = {};
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const idx = trimmed.indexOf("=");
      if (idx <= 0) continue;
      out[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
    }
    return out;
  } catch {
    return {};
  }
}

const localEnv = parseDotEnv(resolve(repoRoot, ".env"));
if (!process.env.EXPO_PUBLIC_GOOGLE_BOOKS_API_KEY && localEnv.EXPO_PUBLIC_GOOGLE_BOOKS_API_KEY) {
  process.env.EXPO_PUBLIC_GOOGLE_BOOKS_API_KEY = localEnv.EXPO_PUBLIC_GOOGLE_BOOKS_API_KEY;
}
if (!process.env.GOOGLE_BOOKS_API_KEY && localEnv.GOOGLE_BOOKS_API_KEY) {
  process.env.GOOGLE_BOOKS_API_KEY = localEnv.GOOGLE_BOOKS_API_KEY;
}

function asObject(v) { return v && typeof v === "object" && !Array.isArray(v) ? v : {}; }
function asArray(v) { return Array.isArray(v) ? v : []; }
function asNum(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }
function asStr(v) { return String(v == null ? "" : v); }

// ── G1/G2 classification ──────────────────────────────────────────────────────
// G1 — retrieval failure: title is genuinely non-narrative, rejection correct.
// G2 — downstream rejection: title appears to be a narrative mystery novel.
// ambiguous — evidence is mixed.

// Narrative confidence thresholds (based on source scoring: +1/+3 per signal)
const G2_NARRATIVE_CONFIDENCE_THRESHOLD = 3; // ≥3 suggests real narrative signals
const G1_NARRATIVE_CONFIDENCE_THRESHOLD = 1; // ≤1 suggests little narrative evidence

// Rejection reasons that unambiguously indicate non-narrative meta-content
// (books ABOUT mystery, not mystery NOVELS). These are definitively G1 —
// the query term is attracting the wrong class of book.
const DEFINITE_G1_REASONS = new Set([
  "publication_shape_writing_guide",
  "publication_shape_critical_study",
  "publication_shape_reference",
  "publication_shape_genre_survey",
  "publication_shape_nonfiction",
  "publication_shape_catalog",
  "publication_shape_anthology",
  "publication_shape_textbook",
  "publication_shape_academic_study",
  "publication_shape_curated_book_guide",
  "publication_shape_periodical",
]);

function classifyReasonG1G2(rejectionReason, narrativeConf) {
  if (DEFINITE_G1_REASONS.has(asStr(rejectionReason))) return "G1_retrieval_failure";
  // Unknown/insufficient identity: depends on narrative evidence in metadata.
  if (asStr(rejectionReason) === "publication_shape_unknown_insufficient_narrative_identity") {
    return asNum(narrativeConf) >= G2_NARRATIVE_CONFIDENCE_THRESHOLD
      ? "G2_downstream_rejection"
      : "ambiguous";
  }
  // Fallback to confidence-based classification.
  const nc = asNum(narrativeConf);
  if (nc >= G2_NARRATIVE_CONFIDENCE_THRESHOLD) return "G2_downstream_rejection";
  if (nc <= G1_NARRATIVE_CONFIDENCE_THRESHOLD) return "G1_retrieval_failure";
  return "ambiguous";
}

// Also used by the rejection-reason histogram classifier (reason-level, no per-title nc)
function classifyReasonCategoryG1G2(rejectionReason) {
  if (DEFINITE_G1_REASONS.has(asStr(rejectionReason))) return "G1";
  if (asStr(rejectionReason) === "publication_shape_unknown_insufficient_narrative_identity") return "ambiguous";
  return "G1"; // all other publication_shape_* are non-narrative
}

// ── Waterfall builder ─────────────────────────────────────────────────────────
// Categorises rejectionReasons into named gates.
const STRUCTURAL_REASONS = new Set([
  "non_book_response_shape",
  "malformed_api_record",
  "duplicate_volume_id",
  "missing_title",
  "missing_author",
  "missing_volume_info",
]);
const ARTIFACT_REASONS = new Set([
  "artifact_series_title_pattern",
  "artifact_box_set_pattern",
  "artifact_omnibus_pattern",
  "artifact_complete_collection",
  "artifact_anthology",
]);

function buildWaterfall(rawApiCount, rejectionReasons, acceptedCount) {
  let structural = 0;
  let publication = 0;
  let artifact = 0;
  let other = 0;
  for (const [reason, count] of Object.entries(asObject(rejectionReasons))) {
    const n = asNum(count);
    if (STRUCTURAL_REASONS.has(reason)) structural += n;
    else if (reason.startsWith("publication_shape_")) publication += n;
    else if (ARTIFACT_REASONS.has(reason) || reason.startsWith("artifact_")) artifact += n;
    else other += n;
  }
  const afterStructural = rawApiCount - structural;
  const afterPublication = afterStructural - publication;
  const afterArtifact = afterPublication - artifact;
  const afterOther = afterArtifact - other;
  // The largest single-gate drop
  const drops = [
    { gate: "structural", drop: structural },
    { gate: "publication_identity", drop: publication },
    { gate: "artifact", drop: artifact },
    { gate: "other_source_policy", drop: other },
  ];
  const biggestDrop = [...drops].sort((a, b) => b.drop - a.drop)[0];
  return {
    rawApiCount,
    structural,
    afterStructural,
    publication,
    afterPublication,
    artifact,
    afterArtifact,
    other,
    afterOther,
    accepted: acceptedCount,
    biggestDropGate: biggestDrop.gate,
    biggestDropCount: biggestDrop.drop,
  };
}

// ── Per-title extractor ───────────────────────────────────────────────────────
// Note: queryByTitle is populated ONLY for accepted titles (line 2055 in
// googleBooksSource.ts fires after source-policy acceptance). Rejected titles
// are NOT queryByTitle-attributed. Per-title maps (shapeByTitle, ncByTitle,
// rejectedByTitle) accumulate across ALL queries in the run. We report them
// with a queryAttribution note rather than filtering to primary query only —
// the count-level waterfall via perQueryQuality is the authoritative
// per-query source of truth.

function extractTitleRows(gbSource, primaryQuery) {
  const queryByTitle = asObject(gbSource.googleBooksQueryByTitle);
  const shapeByTitle = asObject(gbSource.googleBooksPublicationShapeByTitle);
  const ncByTitle = asObject(gbSource.googleBooksNarrativeConfidenceByTitle);
  const rejectedByTitle = asObject(gbSource.googleBooksPublicationShapeRejectedBeforeRankingByTitle);
  const qualityByQuery = asObject(gbSource.googleBooksQueryResultQualityByQuery);
  const primaryQuality = asObject(qualityByQuery[primaryQuery]);
  const acceptedTitles = new Set(asArray(primaryQuality.acceptedRecommendationTitles).map(asStr));

  const rows = [];

  // Accepted titles: confirmed primary-query attribution via queryByTitle.
  for (const [title, query] of Object.entries(queryByTitle)) {
    if (asStr(query) !== primaryQuery) continue;
    rows.push({
      title,
      shape: asStr(shapeByTitle[title] || "unknown"),
      narrativeConfidence: asNum(ncByTitle[title]),
      rejectionReason: null,
      gate: null,
      g1g2: null,
      accepted: true,
      queryAttribution: "primary_confirmed",
    });
  }

  // Rejected titles: from publicationShapeRejectedBeforeRankingByTitle which
  // covers all queries. Query attribution is mixed (primary + fallback).
  // The per-query rejection counts in `perQueryQuality[primaryQuery].rejectionReasons`
  // are the authoritative primary-query numbers; these titles provide the names.
  for (const [title, rejectionReason] of Object.entries(rejectedByTitle)) {
    const nc = asNum(ncByTitle[title]);
    const shape = asStr(shapeByTitle[title] || "unknown");
    const g1g2 = classifyReasonG1G2(rejectionReason, nc);
    const gate = rejectionReason.startsWith("publication_shape_") ? "publication_identity"
      : ARTIFACT_REASONS.has(rejectionReason) || rejectionReason.startsWith("artifact_") ? "artifact"
      : "other_source_policy";
    rows.push({
      title,
      shape,
      narrativeConfidence: nc,
      rejectionReason,
      gate,
      g1g2,
      accepted: false,
      queryAttribution: "mixed_all_queries",
    });
  }

  return rows;
}

// ── Mystery profiles (the 3 G-bucket profiles from the expanded audit) ────────

const MYSTERY_PROFILES = [
  {
    id: "mystery-classic-whodunit",
    label: "Classic whodunit mystery",
    ageBand: "teens",
    signals: [
      { action: "like", title: "Truly Devious", source: "googleBooks", format: "book", genres: ["mystery"], tones: ["suspenseful"], themes: ["investigation", "whodunit"] },
      { action: "like", title: "One of Us Is Lying", source: "googleBooks", format: "book", genres: ["mystery"], tones: ["dramatic"], themes: ["secrets", "suspects"] },
      { action: "like", title: "A Good Girl's Guide to Murder", source: "googleBooks", format: "book", genres: ["mystery"], tones: ["tense"], themes: ["true crime", "investigation"] },
      { action: "dislike", title: "Twilight", source: "googleBooks", format: "book", genres: ["romance", "fantasy"], tones: ["romantic"] },
      { action: "dislike", title: "The Hunger Games", source: "googleBooks", format: "book", genres: ["science fiction"], tones: ["bleak"] },
      { action: "skip", title: "Harry Potter and the Sorcerer's Stone", source: "googleBooks", format: "book", genres: ["fantasy"] },
    ],
  },
  {
    id: "mystery-psychological-thriller",
    label: "Psychological thriller mystery",
    ageBand: "teens",
    signals: [
      { action: "like", title: "We Were Liars", source: "googleBooks", format: "book", genres: ["mystery"], tones: ["atmospheric", "suspenseful"], themes: ["memory", "family secrets"] },
      { action: "like", title: "The Female of the Species", source: "googleBooks", format: "book", genres: ["mystery", "thriller"], tones: ["dark", "tense"], themes: ["revenge"] },
      { action: "like", title: "Allegedly", source: "googleBooks", format: "book", genres: ["thriller", "mystery"], tones: ["unsettling"], themes: ["unreliable narrator"] },
      { action: "dislike", title: "Eragon", source: "googleBooks", format: "book", genres: ["fantasy"], tones: ["adventurous"] },
      { action: "dislike", title: "City of Bones", source: "googleBooks", format: "book", genres: ["fantasy"], tones: ["action-packed"] },
    ],
  },
  {
    id: "mystery-cozy-amateur",
    label: "Cozy amateur-sleuth mystery",
    ageBand: "teens",
    signals: [
      { action: "like", title: "The Inheritance Games", source: "googleBooks", format: "book", genres: ["mystery"], tones: ["fun", "page-turning"], themes: ["puzzles", "inheritance"] },
      { action: "like", title: "Sadie", source: "googleBooks", format: "book", genres: ["mystery"], tones: ["urgent", "suspenseful"], themes: ["missing persons", "justice"] },
      { action: "dislike", title: "Divergent", source: "googleBooks", format: "book", genres: ["science fiction"], tones: ["grim"] },
      { action: "dislike", title: "Maze Runner", source: "googleBooks", format: "book", genres: ["science fiction"], tones: ["dark"] },
      { action: "skip", title: "Shadow and Bone", source: "googleBooks", format: "book", genres: ["fantasy"] },
    ],
  },
];

// ── Run ───────────────────────────────────────────────────────────────────────

console.log("Mystery primary query publication-shape audit");
console.log("Primary query: young adult mystery fiction novel");
console.log(`Profiles: ${MYSTERY_PROFILES.length}\n`);

const runResults = [];

for (const profile of MYSTERY_PROFILES) {
  process.stdout.write(`  [${profile.id}] running... `);
  const result = await runRecommenderV2({
    requestId: `mystery-pub-shape-audit-${profile.id}`,
    ageBand: profile.ageBand,
    limit: 6,
    enabledSources: {
      googleBooks: true,
      openLibrary: false,
      kitsu: false,
      comicVine: false,
      localLibrary: false,
      nyt: false,
      mock: false,
    },
    signals: profile.signals,
  });

  const sources = asArray(result?.diagnostics?.sources);
  const gbSource = asObject(sources.find((s) => asStr(asObject(s).source) === "googleBooks"));
  const fetchDiagnostics = asArray(gbSource.googleBooksSourceFetchDiagnostics);
  const primaryFetch = asObject(fetchDiagnostics.find((f) => asNum(asObject(f).queryCascadeIndex) === 0));
  const primaryQuery = asStr(primaryFetch.originalPlannedQuery || primaryFetch.query);
  const qualityByQuery = asObject(gbSource.googleBooksQueryResultQualityByQuery);
  const primaryQuality = asObject(qualityByQuery[primaryQuery]);

  const waterfall = buildWaterfall(
    asNum(primaryFetch.rawApiCount),
    primaryQuality.rejectionReasons,
    asNum(primaryFetch.acceptedAfterSourcePolicy),
  );

  const titleRows = extractTitleRows(gbSource, primaryQuery);

  console.log(`done — ${titleRows.length} titles analyzed, accepted=${waterfall.accepted}`);

  runResults.push({
    profileId: profile.id,
    profileLabel: profile.label,
    primaryQuery,
    waterfall,
    rejectionReasons: asObject(primaryQuality.rejectionReasons),
    publicationShapeHistogram: asObject(primaryQuality.publicationShapeHistogram),
    rejectedShapeHistogram: asObject(primaryQuality.rejectedShapeHistogram),
    titleRows,
  });
}

// ── Aggregate across 3 runs ───────────────────────────────────────────────────

// Merge title rows: keep union of all observed titles (API may vary slightly
// between runs due to result ordering/caching).
const titleMap = new Map();
for (const run of runResults) {
  for (const row of run.titleRows) {
    if (!titleMap.has(row.title)) {
      titleMap.set(row.title, { ...row, observedInRuns: 1 });
    } else {
      titleMap.get(row.title).observedInRuns += 1;
    }
  }
}
const allTitles = [...titleMap.values()].sort((a, b) => {
  // Sort: accepted first, then by g1g2 category
  if (a.accepted !== b.accepted) return a.accepted ? -1 : 1;
  return String(a.g1g2 || "").localeCompare(String(b.g1g2 || ""));
});

// Average waterfall across runs (should be identical since same primary query)
const avgWaterfall = {
  rawApiCount: Math.round(runResults.reduce((s, r) => s + r.waterfall.rawApiCount, 0) / runResults.length),
  structural: Math.round(runResults.reduce((s, r) => s + r.waterfall.structural, 0) / runResults.length),
  publication: Math.round(runResults.reduce((s, r) => s + r.waterfall.publication, 0) / runResults.length),
  artifact: Math.round(runResults.reduce((s, r) => s + r.waterfall.artifact, 0) / runResults.length),
  other: Math.round(runResults.reduce((s, r) => s + r.waterfall.other, 0) / runResults.length),
  accepted: Math.round(runResults.reduce((s, r) => s + r.waterfall.accepted, 0) / runResults.length),
  biggestDropGate: runResults[0].waterfall.biggestDropGate,
  biggestDropCount: runResults[0].waterfall.biggestDropCount,
};

// Merge rejection-reason histograms (average)
const mergedRejectionReasons = {};
for (const run of runResults) {
  for (const [reason, count] of Object.entries(run.rejectionReasons)) {
    mergedRejectionReasons[reason] = (mergedRejectionReasons[reason] || 0) + asNum(count);
  }
}
for (const key of Object.keys(mergedRejectionReasons)) {
  mergedRejectionReasons[key] = Number((mergedRejectionReasons[key] / runResults.length).toFixed(1));
}

// G1/G2 counts across all unique titles (rejected only)
const rejectedTitles = allTitles.filter((t) => !t.accepted);
const g1Count = rejectedTitles.filter((t) => t.g1g2 === "G1_retrieval_failure").length;
const g2Count = rejectedTitles.filter((t) => t.g1g2 === "G2_downstream_rejection").length;
const ambiguousCount = rejectedTitles.filter((t) => t.g1g2 === "ambiguous").length;

// Structural rejects have no title data — estimate from waterfall
const namedRejectedCount = rejectedTitles.length;
const structuralOnly = Math.max(0, avgWaterfall.structural - (allTitles.length - namedRejectedCount - allTitles.filter((t) => t.accepted).length));

// ── Write outputs ─────────────────────────────────────────────────────────────

mkdirSync(outDir, { recursive: true });

const jsonOut = resolve(outDir, "mystery-primary-query-publication-shape-audit.json");
const summaryOut = resolve(outDir, "mystery-primary-query-publication-shape-audit-summary.txt");

writeFileSync(jsonOut, JSON.stringify({
  generatedAt: new Date().toISOString(),
  primaryQuery: MYSTERY_PROFILES[0] ? "young adult mystery fiction novel" : "",
  profilesRun: MYSTERY_PROFILES.length,
  averageWaterfall: avgWaterfall,
  mergedRejectionReasons,
  g1Count,
  g2Count,
  ambiguousCount,
  namedRejectedTitles: namedRejectedCount,
  uniqueTitlesObserved: allTitles.length,
  acceptedTitlesCount: allTitles.filter((t) => t.accepted).length,
  titleRows: allTitles,
  runs: runResults.map((r) => ({ profileId: r.profileId, waterfall: r.waterfall, rejectionReasons: r.rejectionReasons })),
}, null, 2));

// ── Summary text ──────────────────────────────────────────────────────────────

function fmtBar(label, count, total, width = 20) {
  const filled = total > 0 ? Math.round((count / total) * width) : 0;
  return `${label.padEnd(32)} ${String(count).padStart(3)}/${total}  ${"█".repeat(filled)}${"░".repeat(width - filled)}`;
}

const summaryLines = [
  "═══════════════════════════════════════════════════════════════════",
  " Mystery primary query — publication-shape waterfall audit",
  " Query: young adult mystery fiction novel",
  "═══════════════════════════════════════════════════════════════════",
  "",
  `Profiles run ......................... ${runResults.length}`,
  `Unique titles analyzed ............... ${allTitles.length}`,
  "",
  "── Gate-by-gate waterfall (averaged across 3 runs) ─────────────────",
  `  ${avgWaterfall.rawApiCount}  raw Google Books results`,
  `  ↓  structural (malformed/dedup/missing)  -${avgWaterfall.structural}`,
  `  ${avgWaterfall.rawApiCount - avgWaterfall.structural}  entered publication analysis`,
  `  ↓  publication identity gate             -${avgWaterfall.publication}`,
  `  ${avgWaterfall.rawApiCount - avgWaterfall.structural - avgWaterfall.publication}  passed publication identity`,
  `  ↓  artifact / other source-policy        -${avgWaterfall.artifact + avgWaterfall.other}`,
  `  ${avgWaterfall.accepted}  acceptedAfterSourcePolicy  ← target for improvement`,
  "",
  `  Biggest drop gate: ${avgWaterfall.biggestDropGate} (−${avgWaterfall.biggestDropCount})`,
  "",
  "── Rejection reason breakdown ───────────────────────────────────────",
  ...Object.entries(mergedRejectionReasons)
    .sort(([, a], [, b]) => b - a)
    .map(([reason, count]) => `  ${reason.padEnd(52)} avg ${count}`),
  "",
  "── Publication shape histogram (all 20 books) ───────────────────────",
  ...(() => {
    const merged = {};
    for (const run of runResults) {
      for (const [shape, count] of Object.entries(run.publicationShapeHistogram)) {
        merged[shape] = (merged[shape] || 0) + asNum(count);
      }
    }
    return Object.entries(merged)
      .sort(([, a], [, b]) => b - a)
      .map(([shape, total]) => `  ${shape.padEnd(44)} ${(total / runResults.length).toFixed(1)} avg`);
  })(),
  "",
  "── G1 / G2 classification of rejection reasons (reason-level) ──────",
  ...(() => {
    const byCategory = { G1: 0, G2: 0, ambiguous: 0 };
    for (const [reason, count] of Object.entries(mergedRejectionReasons)) {
      if (STRUCTURAL_REASONS.has(reason)) continue; // structural, not classified
      const cat = classifyReasonCategoryG1G2(reason);
      byCategory[cat] = (byCategory[cat] || 0) + count;
    }
    return [
      `  G1 (non-narrative class clearly wrong for query)  ${byCategory.G1.toFixed(1)} avg`,
      `  G2 (narrative title incorrectly rejected)         ${byCategory.G2.toFixed(1)} avg`,
      `  Ambiguous (insufficient metadata)                 ${byCategory.ambiguous.toFixed(1)} avg`,
    ];
  })(),
  "",
  "── G1 / G2 classification of rejected named titles ─────────────────",
  `  Note: rejected title names come from publicationShapeRejectedBeforeRankingByTitle`,
  `  which spans ALL queries (primary + fallback); count-level waterfall above`,
  `  is the authoritative per-primary-query source.`,
  `  G1 retrieval failure (correct rejection)  ${g1Count}`,
  `  G2 downstream rejection (false reject)    ${g2Count}`,
  `  Ambiguous                                  ${ambiguousCount}`,
  `  Structural (no title data)                 ${avgWaterfall.structural}`,
  "",
  g1Count > g2Count * 2
    ? "  VERDICT: G1 dominant — retrieval failure. Primary query returns\n  non-narrative content. Query term is the bottleneck."
    : g2Count > g1Count * 2
      ? "  VERDICT: G2 dominant — downstream rejection. Filter is over-rejecting\n  narrative mystery novels. Publication identity is the bottleneck."
      : `  VERDICT: Mixed (G1=${g1Count} G2=${g2Count} ambiguous=${ambiguousCount}). Evidence does not\n  clearly point to one mechanism.`,
  "",
  "── Per-title detail ─────────────────────────────────────────────────",
  "  [✓ = accepted (primary query) | G1 = retrieval failure | G2 = false reject | ? = ambiguous]",
  "  Note: rejected titles are from all queries (queryAttribution: mixed_all_queries).",
  "",
  ...allTitles.map((row) => {
    const status = row.accepted ? "✓ " : row.g1g2 === "G1_retrieval_failure" ? "G1" : row.g1g2 === "G2_downstream_rejection" ? "G2" : "? ";
    const rejStr = row.rejectionReason ? ` [${row.rejectionReason}]` : "";
    return `  ${status}  nc=${String(row.narrativeConfidence).padStart(4)}  ${row.shape.padEnd(42)} ${row.title.slice(0, 60)}${rejStr}`;
  }),
  "",
  "═══════════════════════════════════════════════════════════════════",
];

writeFileSync(summaryOut, `${summaryLines.join("\n")}\n`);

console.log(`\nJSON:    ${jsonOut}`);
console.log(`Summary: ${summaryOut}`);
