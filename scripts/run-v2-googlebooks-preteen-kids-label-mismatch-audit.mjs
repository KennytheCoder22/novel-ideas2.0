/**
 * Pre-Teen Google Books kids-label mismatch audit (report-driven)
 *
 * Diagnostic-only:
 * - parses exported session reports
 * - isolates titles with sourceAudienceBand="kids" rejected for maturity_band_mismatch
 * - classifies each rejected title:
 *   clearly_k2 | clearly_preteen | works_for_both | ambiguous
 * - computes evidence-combination rates
 *
 * Usage:
 *   node scripts/run-v2-googlebooks-preteen-kids-label-mismatch-audit.mjs --report <path> [--report <path> ...]
 *
 * Output:
 *   scripts/output/preteen-kids-label-mismatch-audit.json
 *   scripts/output/preteen-kids-label-mismatch-audit.csv
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(scriptDir, "output");
const historyPath = resolve(outDir, "preteen-kids-label-mismatch-history.json");

function argValues(flag) {
  const values = [];
  for (let i = 0; i < process.argv.length; i += 1) {
    if (process.argv[i] === flag && process.argv[i + 1]) values.push(process.argv[i + 1]);
  }
  return values;
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function mapObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function arrayValue(value) {
  return Array.isArray(value) ? value : [];
}

function parseReportMap(lines, prefix) {
  const marker = `${prefix}:`;
  const line = lines.find((entry) => entry.startsWith(marker));
  if (!line) return {};
  const raw = line.slice(marker.length).trim();
  try {
    return mapObject(JSON.parse(raw));
  } catch {
    return {};
  }
}

function parsePageCount(evidenceList) {
  for (const token of arrayValue(evidenceList)) {
    if (typeof token !== "string") continue;
    const match = token.match(/^page_count:(\d+)$/i);
    if (match) return Number(match[1]);
  }
  return null;
}

function classifyMismatch(record) {
  const confidence = Number(record.identityConfidence || 0);
  const pageCount = Number(record.pageCount || 0);
  const shape = String(record.publicationShape || "");
  const hasStoryEvidence = record.identityEvidence.includes("story_level_or_fiction_language");
  const hasMiddleGradeEvidence = record.identityEvidence.includes("middle_grade_metadata");
  const hasJuvenileFictionEvidence = record.identityEvidence.includes("juvenile_fiction_category");
  const strongNarrative = hasStoryEvidence || hasMiddleGradeEvidence || confidence >= 0.85;
  const chapterBookLength = pageCount >= 120;
  const shortBook = pageCount > 0 && pageCount < 100;
  const shapeNovelLike = shape === "novel" || shape === "series_installment";
  const shapeAmbiguous = shape === "unknown" || record.shapeRescued;

  if (record.identity !== "middle_grade_novel") {
    if (shortBook && !strongNarrative) {
      return { label: "clearly_k2", reason: "non_middle_grade_identity_with_short_length_and_weak_narrative_corroboration" };
    }
    return { label: "ambiguous", reason: "non_middle_grade_identity_or_insufficient_identity_alignment" };
  }

  if (confidence >= 0.8 && strongNarrative && chapterBookLength && shapeNovelLike) {
    return { label: "clearly_preteen", reason: "middle_grade_identity_with_strong_narrative_and_chapter_book_length" };
  }

  if (confidence >= 0.65 && hasJuvenileFictionEvidence && pageCount >= 80) {
    return { label: "works_for_both", reason: "middle_grade_identity_with_juvenile_fiction_signals_but_not_high_enough_for_clear_preteen" };
  }

  if (shapeAmbiguous || confidence < 0.65) {
    return { label: "ambiguous", reason: "shape_or_identity_confidence_too_ambiguous_for_confident_placement" };
  }

  if (shortBook && !hasMiddleGradeEvidence) {
    return { label: "clearly_k2", reason: "short_length_without_middle_grade_corroboration" };
  }

  return { label: "ambiguous", reason: "mixed_signals_without_clean_k2_or_preteen_boundary" };
}

function initCombinationCounter() {
  return { total: 0, clearlyPreteen: 0, worksForBoth: 0, clearlyK2: 0, ambiguous: 0 };
}

function bumpCombination(bucket, classification) {
  bucket.total += 1;
  if (classification === "clearly_preteen") bucket.clearlyPreteen += 1;
  else if (classification === "works_for_both") bucket.worksForBoth += 1;
  else if (classification === "clearly_k2") bucket.clearlyK2 += 1;
  else bucket.ambiguous += 1;
}

function withRates(bucket) {
  const total = Number(bucket.total || 0);
  const clearlyPreteenRate = total > 0 ? Number(((bucket.clearlyPreteen / total) * 100).toFixed(1)) : 0;
  const preteenOrBothRate = total > 0 ? Number((((bucket.clearlyPreteen + bucket.worksForBoth) / total) * 100).toFixed(1)) : 0;
  return { ...bucket, clearlyPreteenRate, preteenOrBothRate };
}

const reportPaths = argValues("--report");
if (reportPaths.length === 0) {
  throw new Error("No reports provided. Use --report <path> [--report <path> ...]");
}
const resetHistory = hasFlag("--reset-history");

const perReport = [];
const byTitle = new Map();
let totalKidsAudienceTitlesObserved = 0;

for (const reportPath of reportPaths) {
  const lines = readFileSync(reportPath, "utf8").split(/\r?\n/);
  const reportName = basename(reportPath);

  const audienceBandByTitle = parseReportMap(lines, "googleBooksAudienceBandByTitle");
  const requestedDeckByTitle = parseReportMap(lines, "googleBooksRequestedDeckByTitle");
  const droppedReasonByTitle = parseReportMap(lines, "googleBooksDroppedReasonByTitle");
  const finalReasonByTitle = parseReportMap(lines, "googleBooksFinalEligibilityReasonByTitle");
  const finalDecisionByTitle = parseReportMap(lines, "googleBooksFinalEligibilityDecisionByTitle");
  const publicationShapeByTitle = parseReportMap(lines, "googleBooksPublicationShapeByTitle");
  const stageDecisionByTitle = parseReportMap(lines, "googleBooksStageDecisionByTitle");
  const identityByTitle = parseReportMap(lines, "preteenGoogleBooksPublicationIdentityByTitle");
  const identityConfidenceByTitle = parseReportMap(lines, "preteenGoogleBooksPublicationIdentityConfidenceByTitle");
  const identityEvidenceByTitle = parseReportMap(lines, "preteenGoogleBooksPublicationIdentityEvidenceByTitle");
  const trustedEvidenceByTitle = parseReportMap(lines, "preteenGoogleBooksPublicationTrustedFieldEvidenceByTitle");
  const contentMaturityByTitle = parseReportMap(lines, "googleBooksContentMaturityByTitle");
  const sourceMaturityByTitle = parseReportMap(lines, "googleBooksSourceMaturityRatingByTitle");
  const maturityDecisionByTitle = parseReportMap(lines, "googleBooksMaturityDecisionByTitle");
  const ageSuitabilityDecisionByTitle = parseReportMap(lines, "googleBooksAgeSuitabilityDecisionByTitle");
  const finalEvidenceByTitle = parseReportMap(lines, "googleBooksFinalEligibilityEvidenceByTitle");

  const titles = Object.keys(audienceBandByTitle);
  const kidsTitles = titles.filter((title) => String(audienceBandByTitle[title] || "").toLowerCase() === "kids");
  totalKidsAudienceTitlesObserved += kidsTitles.length;

  const mismatchTitles = kidsTitles.filter((title) => {
    const requested = String(requestedDeckByTitle[title] || "").toLowerCase();
    const dropped = String(droppedReasonByTitle[title] || "");
    const final = String(finalReasonByTitle[title] || "");
    return requested === "preteens" && (dropped === "maturity_band_mismatch" || final === "maturity_band_mismatch");
  });

  const reportRows = [];
  for (const title of mismatchTitles) {
    const mergedEvidence = [
      ...arrayValue(identityEvidenceByTitle[title]),
      ...arrayValue(trustedEvidenceByTitle[title]),
    ].filter((token) => typeof token === "string");
    const identityEvidence = [...new Set(mergedEvidence)];
    const pageCount = parsePageCount(identityEvidence);
    const stageDecision = mapObject(stageDecisionByTitle[title]);
    const shapeRescued = String(stageDecision.publication_identity_or_shape_policy || "") === "rescued";
    const row = {
      title,
      report: reportName,
      audienceBand: String(audienceBandByTitle[title] || ""),
      requestedDeck: String(requestedDeckByTitle[title] || ""),
      finalDecision: String(finalDecisionByTitle[title] || ""),
      finalReason: String(finalReasonByTitle[title] || droppedReasonByTitle[title] || ""),
      publicationShape: String(publicationShapeByTitle[title] || ""),
      shapeRescued,
      identity: String(identityByTitle[title] || ""),
      identityConfidence: Number(identityConfidenceByTitle[title] || 0),
      identityEvidence,
      pageCount,
      contentMaturity: String(contentMaturityByTitle[title] || ""),
      sourceMaturityRating: String(sourceMaturityByTitle[title] || ""),
      maturityDecision: String(maturityDecisionByTitle[title] || ""),
      ageSuitabilityDecision: String(ageSuitabilityDecisionByTitle[title] || ""),
      finalEligibilityEvidence: arrayValue(finalEvidenceByTitle[title]),
    };
    const classification = classifyMismatch(row);
    row.classification = classification.label;
    row.classificationReason = classification.reason;
    reportRows.push(row);

    const existing = byTitle.get(title);
    if (!existing) {
      byTitle.set(title, { ...row, reports: [reportName] });
    } else {
      existing.reports = [...new Set([...existing.reports, reportName])];
      if (row.identityConfidence > existing.identityConfidence) {
        byTitle.set(title, { ...row, reports: existing.reports });
      }
    }
  }

  perReport.push({
    report: reportName,
    kidsAudienceTitleCount: kidsTitles.length,
    kidsAudienceMismatchRejectCount: mismatchTitles.length,
    rows: reportRows,
  });
}

const uniqueRows = Array.from(byTitle.values()).sort((a, b) => a.title.localeCompare(b.title));
const totalMismatchRejects = uniqueRows.length;
const clearlyK2Count = uniqueRows.filter((row) => row.classification === "clearly_k2").length;
const clearlyPreteenCount = uniqueRows.filter((row) => row.classification === "clearly_preteen").length;
const worksForBothCount = uniqueRows.filter((row) => row.classification === "works_for_both").length;
const ambiguousCount = uniqueRows.filter((row) => row.classification === "ambiguous").length;
const preteenOrBothCount = clearlyPreteenCount + worksForBothCount;

const combinations = {
  middle_grade_plus_strong_narrative: initCombinationCounter(),
  middle_grade_plus_strong_narrative_plus_chapter_book_length: initCombinationCounter(),
  rescued_or_unknown_publication_shape: initCombinationCounter(),
  low_identity_confidence: initCombinationCounter(),
};

for (const row of uniqueRows) {
  const confidence = Number(row.identityConfidence || 0);
  const pageCount = Number(row.pageCount || 0);
  const shape = String(row.publicationShape || "");
  const evidence = row.identityEvidence || [];
  const strongNarrative = confidence >= 0.8 || evidence.includes("story_level_or_fiction_language") || evidence.includes("middle_grade_metadata");
  const chapterBook = pageCount >= 120;
  const rescuedOrUnknownShape = row.shapeRescued || shape === "unknown";
  const lowConfidence = confidence < 0.8;

  if (row.identity === "middle_grade_novel" && strongNarrative) {
    bumpCombination(combinations.middle_grade_plus_strong_narrative, row.classification);
  }
  if (row.identity === "middle_grade_novel" && strongNarrative && chapterBook) {
    bumpCombination(combinations.middle_grade_plus_strong_narrative_plus_chapter_book_length, row.classification);
  }
  if (rescuedOrUnknownShape) {
    bumpCombination(combinations.rescued_or_unknown_publication_shape, row.classification);
  }
  if (lowConfidence) {
    bumpCombination(combinations.low_identity_confidence, row.classification);
  }
}

const evidenceCombinationTable = Object.fromEntries(
  Object.entries(combinations).map(([key, bucket]) => [key, withRates(bucket)]),
);

const mismatchFalseRejectRate = totalMismatchRejects > 0
  ? Number(((preteenOrBothCount / totalMismatchRejects) * 100).toFixed(1))
  : 0;
const kidsAudiencePreteenOrBothRate = totalKidsAudienceTitlesObserved > 0
  ? Number(((preteenOrBothCount / totalKidsAudienceTitlesObserved) * 100).toFixed(1))
  : 0;

console.log("=== PRETEEN GOOGLE BOOKS KIDS-LABEL MISMATCH AUDIT ===");
console.log(`reports analyzed: ${reportPaths.length}`);
console.log(`kids-labeled titles observed across reports: ${totalKidsAudienceTitlesObserved}`);
console.log(`unique kids-labeled mismatch rejects: ${totalMismatchRejects}`);
console.log(`  clearly_preteen: ${clearlyPreteenCount}`);
console.log(`  works_for_both: ${worksForBothCount}`);
console.log(`  clearly_k2: ${clearlyK2Count}`);
console.log(`  ambiguous: ${ambiguousCount}`);
console.log(`estimated false-reject rate among mismatch rejects (clearly_preteen + works_for_both): ${mismatchFalseRejectRate}%`);
console.log(`preteen-or-both share among all observed kids-labeled titles: ${kidsAudiencePreteenOrBothRate}%`);
console.log("\n=== EVIDENCE COMBINATION RATES (Clearly Pre-Teen %, Pre-Teen-or-Both %) ===");
for (const [name, row] of Object.entries(evidenceCombinationTable)) {
  console.log(`  ${name}: total=${row.total}, clearly_preteen_rate=${row.clearlyPreteenRate}%, preteen_or_both_rate=${row.preteenOrBothRate}%`);
}

mkdirSync(outDir, { recursive: true });
const jsonOut = resolve(outDir, "preteen-kids-label-mismatch-audit.json");
const csvOut = resolve(outDir, "preteen-kids-label-mismatch-audit.csv");

const output = {
  generatedAt: new Date().toISOString(),
  inputs: reportPaths,
  reports: perReport,
  aggregate: {
    kidsAudienceTitlesObservedAcrossReports: totalKidsAudienceTitlesObserved,
    uniqueKidsAudienceMismatchRejectCount: totalMismatchRejects,
    classificationCounts: {
      clearly_k2: clearlyK2Count,
      clearly_preteen: clearlyPreteenCount,
      works_for_both: worksForBothCount,
      ambiguous: ambiguousCount,
    },
    mismatchFalseRejectRatePercent: mismatchFalseRejectRate,
    kidsAudiencePreteenOrBothRatePercent: kidsAudiencePreteenOrBothRate,
    evidenceCombinationTable,
  },
  uniqueRows,
};
writeFileSync(jsonOut, JSON.stringify(output, null, 2));
console.log(`JSON written to: ${jsonOut}`);

const csvHeader = [
  "title",
  "reports",
  "classification",
  "classificationReason",
  "requestedDeck",
  "audienceBand",
  "finalReason",
  "finalDecision",
  "identity",
  "identityConfidence",
  "publicationShape",
  "shapeRescued",
  "pageCount",
  "contentMaturity",
  "sourceMaturityRating",
  "maturityDecision",
  "ageSuitabilityDecision",
  "identityEvidence",
].join(",");

const csvRows = uniqueRows.map((row) => [
  `"${String(row.title || "").replace(/"/g, "\"\"")}"`,
  `"${(row.reports || []).join(" | ").replace(/"/g, "\"\"")}"`,
  row.classification,
  row.classificationReason,
  row.requestedDeck,
  row.audienceBand,
  row.finalReason,
  row.finalDecision,
  row.identity,
  row.identityConfidence,
  row.publicationShape,
  row.shapeRescued ? "true" : "false",
  row.pageCount ?? "",
  row.contentMaturity,
  row.sourceMaturityRating,
  row.maturityDecision,
  `"${String(row.ageSuitabilityDecision || "").replace(/"/g, "\"\"")}"`,
  `"${(row.identityEvidence || []).join(" | ").replace(/"/g, "\"\"")}"`,
].join(","));

writeFileSync(csvOut, [csvHeader, ...csvRows].join("\n"));
console.log(`CSV written to: ${csvOut}`);

const observationRows = perReport.flatMap((report) => report.rows || []);
const runAt = new Date().toISOString();

let history = {
  generatedAt: runAt,
  runs: [],
  seenObservationKeys: [],
  uniqueTitleRegistry: {},
  lifetimeCounts: {
    uniqueTitleTotal: 0,
    clearly_k2: 0,
    clearly_preteen: 0,
    works_for_both: 0,
    ambiguous: 0,
  },
};

if (!resetHistory && existsSync(historyPath)) {
  try {
    const parsed = JSON.parse(readFileSync(historyPath, "utf8"));
    if (parsed && typeof parsed === "object" && parsed.uniqueTitleRegistry) {
      history = { ...history, ...parsed };
    }
    // Old schema without uniqueTitleRegistry is intentionally ignored (starts fresh)
  } catch {
    // keep fresh history on parse failure
  }
}

const seenObs = new Set(arrayValue(history.seenObservationKeys).map((v) => String(v)));
if (!history.uniqueTitleRegistry || typeof history.uniqueTitleRegistry !== "object") {
  history.uniqueTitleRegistry = {};
}
const registry = history.uniqueTitleRegistry;

let newlyAddedObs = 0;
let newlyAddedTitles = 0;

for (const row of observationRows) {
  const obsKey = `${row.report}::${row.title}`;
  if (!seenObs.has(obsKey)) {
    seenObs.add(obsKey);
    newlyAddedObs += 1;
  }

  if (!registry[row.title]) {
    // First time we see this title — add to registry and bump unique-title counts
    registry[row.title] = {
      classification: row.classification,
      identityConfidence: row.identityConfidence,
      firstSeenAt: runAt,
      lastSeenAt: runAt,
    };
    newlyAddedTitles += 1;
    history.lifetimeCounts.uniqueTitleTotal += 1;
    if (row.classification === "clearly_k2") history.lifetimeCounts.clearly_k2 += 1;
    else if (row.classification === "clearly_preteen") history.lifetimeCounts.clearly_preteen += 1;
    else if (row.classification === "works_for_both") history.lifetimeCounts.works_for_both += 1;
    else history.lifetimeCounts.ambiguous += 1;
  } else {
    // Subsequent observation of the same title — update lastSeenAt
    registry[row.title].lastSeenAt = runAt;
    // If this run has higher identity confidence, update classification
    const prevConf = Number(registry[row.title].identityConfidence || 0);
    if (row.identityConfidence > prevConf) {
      const oldClass = registry[row.title].classification;
      const newClass = row.classification;
      registry[row.title].classification = newClass;
      registry[row.title].identityConfidence = row.identityConfidence;
      if (oldClass !== newClass) {
        if (oldClass === "clearly_k2") history.lifetimeCounts.clearly_k2 -= 1;
        else if (oldClass === "clearly_preteen") history.lifetimeCounts.clearly_preteen -= 1;
        else if (oldClass === "works_for_both") history.lifetimeCounts.works_for_both -= 1;
        else history.lifetimeCounts.ambiguous -= 1;
        if (newClass === "clearly_k2") history.lifetimeCounts.clearly_k2 += 1;
        else if (newClass === "clearly_preteen") history.lifetimeCounts.clearly_preteen += 1;
        else if (newClass === "works_for_both") history.lifetimeCounts.works_for_both += 1;
        else history.lifetimeCounts.ambiguous += 1;
      }
    }
  }
}

history.generatedAt = runAt;
history.seenObservationKeys = Array.from(seenObs);
history.runs = [
  ...arrayValue(history.runs),
  {
    runAt,
    reports: reportPaths,
    addedObservations: newlyAddedObs,
    newlyAddedUniqueTitles: newlyAddedTitles,
    currentRunCounts: {
      total: totalMismatchRejects,
      clearly_k2: clearlyK2Count,
      clearly_preteen: clearlyPreteenCount,
      works_for_both: worksForBothCount,
      ambiguous: ambiguousCount,
    },
  },
];

writeFileSync(historyPath, JSON.stringify(history, null, 2));
console.log(`History written to: ${historyPath}`);

const lifetimeTotal = history.lifetimeCounts.uniqueTitleTotal;
const lifetimePreteenOrBoth = history.lifetimeCounts.clearly_preteen + history.lifetimeCounts.works_for_both;
const allDates = Object.values(registry)
  .flatMap((r) => [r.firstSeenAt, r.lastSeenAt])
  .filter(Boolean)
  .sort();
const firstSeen = allDates.length > 0 ? allDates[0].slice(0, 10) : "(none)";
const lastSeen = runAt.slice(0, 10);

console.log("\n=== LIFETIME KIDS-LABELED MISMATCH SUMMARY (unique titles) ===");
console.log("| Metric                 | Running total |");
console.log("| ---------------------- | ------------- |");
console.log(`| Unique mismatch titles | ${String(lifetimeTotal).padStart(13)} |`);
console.log(`| Clearly K-2            | ${String(history.lifetimeCounts.clearly_k2).padStart(13)} |`);
console.log(`| Works for both         | ${String(history.lifetimeCounts.works_for_both).padStart(13)} |`);
console.log(`| Clearly Pre-Teen       | ${String(history.lifetimeCounts.clearly_preteen).padStart(13)} |`);
console.log(`| Ambiguous              | ${String(history.lifetimeCounts.ambiguous).padStart(13)} |`);
console.log(`| Pre-Teen or both       | ${String(lifetimePreteenOrBoth).padStart(13)} |`);
console.log(`| First-seen date        | ${firstSeen.padStart(13)} |`);
console.log(`| Last-seen date         | ${lastSeen.padStart(13)} |`);
if (lifetimeTotal >= 30) {
  console.log(`\nNOTE: ${lifetimeTotal} unique titles — strong evidence; difficult to dismiss if pattern holds.`);
} else if (lifetimeTotal >= 20) {
  console.log(`\nNOTE: ${lifetimeTotal} unique titles — strong evidence.`);
} else if (lifetimeTotal >= 10) {
  console.log(`\nNOTE: ${lifetimeTotal} unique titles — sufficient to begin discussing policy changes.`);
} else {
  console.log(`\nNOTE: ${lifetimeTotal} unique titles (target: 10 to start discussion, 20 for strong evidence, 30+ to act).`);
}