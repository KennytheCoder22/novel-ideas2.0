/**
 * Kids K-2 Google Books Ground-Truth Audit
 * Diagnostic-only: does not change production rules.
 *
 * Usage:
 *   GOOGLE_BOOKS_API_KEY=<key> node scripts/run-v2-googlebooks-kids-k2-ground-truth-audit.mjs
 *
 * Output:
 *   scripts/output/kids-k2-ground-truth-audit.json
 *   scripts/output/kids-k2-ground-truth-audit.csv
 */
import { createRequire } from "node:module";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");
require.extensions[".ts"] = (module, filename) => {
  const output = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, moduleResolution: ts.ModuleResolutionKind.Node10, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  module._compile(output, filename);
};

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoDir = resolve(scriptDir, "..");
const recommenderDir = resolve(repoDir, "app/recommender-v2");

const { analyzeGoogleBooksVolumeForAudit } = require(resolve(recommenderDir, "sources/googleBooksSource.ts"));
const { applyKidsGoogleBooksPreScoringGate } = require(resolve(recommenderDir, "engine.ts"));
const { scoreCandidates } = require(resolve(recommenderDir, "score.ts"));
const { selectRecommendations } = require(resolve(recommenderDir, "select.ts"));

const fixtureFile = resolve(scriptDir, "fixtures/kids-k2-ground-truth-books.json");
const fixtures = JSON.parse(readFileSync(fixtureFile, "utf8"));
const allBooks = [
  ...fixtures.knownGoodK2Books.map(b => ({ ...b, group: "positive" })),
  ...fixtures.negativeControls.map(b => ({ ...b, group: "negative" })),
];

const API_KEY = process.env.GOOGLE_BOOKS_API_KEY || "";
const API_BASE = "https://www.googleapis.com/books/v1/volumes";
const MAX_EDITIONS = 5;
const FETCH_DELAY_MS = 300; // be polite to the API

if (!API_KEY) {
  console.warn("WARNING: GOOGLE_BOOKS_API_KEY is not set. Requests will be unauthenticated and may be rate-limited.");
}

async function fetchEditions(title, author) {
  const query = `intitle:"${title}" inauthor:"${author}"`;
  const params = new URLSearchParams({
    q: query,
    maxResults: String(MAX_EDITIONS),
    orderBy: "relevance",
    printType: "books",
    projection: "full",
    langRestrict: "en",
  });
  if (API_KEY) params.set("key", API_KEY);
  const url = `${API_BASE}?${params.toString()}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return { error: `http_${res.status}`, items: [] };
    const json = await res.json();
    return { items: Array.isArray(json.items) ? json.items : [], totalItems: json.totalItems || 0, query };
  } catch (err) {
    return { error: String(err?.message || err), items: [] };
  }
}

// Neutral Kids profile for eligibility testing
const neutralKidsProfile = {
  ageBand: "kids", maturityBand: "kids",
  genreFamily: [
    { value: "fantasy", weight: 2, evidence: ["like:kids:fantasy"] },
    { value: "adventure", weight: 1, evidence: ["like:kids:adventure"] },
  ],
  tone: [{ value: "warm", weight: 1, evidence: ["like:kids:warm"] }],
  pacing: [],
  themes: [{ value: "friendship", weight: 1, evidence: ["like:kids:friendship"] }],
  characterDynamics: [],
  formatPreference: [{ value: "book", weight: 1, evidence: ["like:kids:book"] }],
  avoidSignals: [],
  sourceHints: ["googleBooks"],
  diagnostics: {},
};

function buildCandidate(volumeInfo, item, analysis, queryText) {
  const volumeId = String(item.id || "").trim();
  const title = analysis.title;
  return {
    id: `googleBooks:${volumeId}`,
    source: "googleBooks",
    sourceId: volumeId,
    title,
    subtitle: analysis.subtitle || undefined,
    creators: analysis.authors,
    description: analysis.description || undefined,
    genres: analysis.categories,
    themes: [],
    tones: [],
    characterDynamics: [],
    formats: ["book"],
    publicationYear: analysis.publicationYear,
    maturityBand: analysis.maturityRating,
    sourceUrl: String(volumeInfo.infoLink || "").trim() || undefined,
    raw: {
      id: volumeId,
      title,
      subtitle: analysis.subtitle,
      description: analysis.description,
      categories: analysis.categories,
      maturityRating: analysis.maturityRating,
      contentMaturity: analysis.contentMaturity,
      audienceBand: analysis.inferredAudienceBand,
      requestedAgeBand: "kids",
      pageCount: analysis.pageCount,
      printType: analysis.printType,
      publisher: analysis.publisher,
      publishedDate: String(volumeInfo.publishedDate || ""),
      industryIdentifiers: volumeInfo.industryIdentifiers || [],
      volumeInfo,
    },
    diagnostics: {
      queryText: queryText || `intitle:"${title}"`,
      queryFamily: "kids_audit",
      googleBooksPublicationShape: analysis.publicationShape,
      googleBooksSourceMaturityRating: analysis.maturityRating,
      googleBooksAudienceBand: analysis.inferredAudienceBand,
      googleBooksContentMaturity: analysis.contentMaturity,
      googleBooksIsbnPresent: analysis.hasIsbn,
    },
    score: 0,
    scoreBreakdown: {},
    matchedSignals: [],
  };
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runAudit() {
  const results = [];
  const errors = [];

  for (const book of allBooks) {
    console.log(`Querying: "${book.title}" by ${book.author} ...`);
    const fetched = await fetchEditions(book.title, book.author);
    if (fetched.error) {
      console.warn(`  ERROR: ${fetched.error}`);
      errors.push({ title: book.title, error: fetched.error });
      results.push({
        fixtureTitle: book.title,
        fixtureAuthor: book.author,
        expectedLabel: book.expectedLabel,
        category: book.category,
        group: book.group,
        notes: book.notes || "",
        editionsFound: 0,
        editions: [],
        overallDecision: "api_error",
        anyEditionAccepted: false,
        bestMatchVolumeId: null,
        editionSelectionMatters: false,
      });
      await sleep(FETCH_DELAY_MS);
      continue;
    }

    const editionResults = [];
    const query = fetched.query;

    for (const item of fetched.items) {
      if (!item || typeof item !== "object") continue;
      const volumeInfo = item.volumeInfo;
      if (!volumeInfo || typeof volumeInfo !== "object") continue;
      const title = String(volumeInfo.title || "").trim();
      if (!title) continue;

      const analysis = analyzeGoogleBooksVolumeForAudit(volumeInfo, item);
      const candidate = buildCandidate(volumeInfo, item, analysis, query);

      // Run through pre-scoring gate
      const gate = applyKidsGoogleBooksPreScoringGate([candidate], neutralKidsProfile);
      const passedPreScoring = gate.candidates.some(c => c.id === candidate.id || c.title === candidate.title);
      const preScoringRejectionReason = passedPreScoring ? null : (gate.diagnostics.rejectedBeforeScoringByTitle[title] || "unknown_rejection");
      const audienceReason = gate.diagnostics.audienceRejectionReasonByTitle?.[title] || null;

      let passedFinalGate = false;
      let finalRejectionReason = null;
      let tasteScore = 0;

      if (passedPreScoring) {
        const scored = scoreCandidates(gate.candidates, neutralKidsProfile);
        const scoredCandidate = scored.find(c => c.title === title);
        tasteScore = scoredCandidate ? (Math.round((
          Number(scoredCandidate.scoreBreakdown?.genreFacetMatch || 0)
          + Number(scoredCandidate.scoreBreakdown?.positiveTasteMatch || 0)
          + Number(scoredCandidate.scoreBreakdown?.toneMatch || 0)
          + Number(scoredCandidate.scoreBreakdown?.themeMatch || 0)
        ) * 1000) / 1000) : 0;
        const selection = selectRecommendations(scored, neutralKidsProfile, 10);
        passedFinalGate = selection.selected.some(c => c.title === title);
        if (!passedFinalGate) {
          finalRejectionReason = selection.diagnostics?.rejectedByTitleReason?.[title]
            || selection.diagnostics?.cleanFinalFailureByTitle?.[title]
            || "not_selected";
        }
      }

      const overallAdmission = passedPreScoring && passedFinalGate
        ? "accepted"
        : passedPreScoring
          ? "rejected_final_gate"
          : "rejected_pre_scoring";

      editionResults.push({
        volumeId: String(item.id || ""),
        title,
        subtitle: analysis.subtitle,
        authors: analysis.authors,
        publisher: analysis.publisher,
        publishedDate: String(volumeInfo.publishedDate || ""),
        publicationYear: analysis.publicationYear,
        description: analysis.description ? analysis.description.slice(0, 300) : "",
        categories: analysis.categories,
        pageCount: analysis.pageCount,
        printType: analysis.printType,
        maturityRating: analysis.maturityRating,
        inferredAudienceBand: analysis.inferredAudienceBand,
        hasIsbn: analysis.hasIsbn,
        hasDescription: analysis.hasDescription,
        language: String(volumeInfo.language || ""),
        // Shape analysis
        publicationShape: analysis.publicationShape,
        narrativeConfidence: analysis.narrativeConfidence,
        publicationShapeEvidence: analysis.publicationShapeEvidence,
        explicitNonNarrativeIdentity: analysis.explicitNonNarrativeIdentity,
        storyLevelNarrativeEvidence: analysis.storyLevelNarrativeEvidence,
        genericCategoryTitle: analysis.genericCategoryTitle,
        unknownShapeEligibility: analysis.unknownShapeEligibility,
        unknownShapeRejectedReason: analysis.unknownShapeRejectedReason,
        publicationShapeDropReason: analysis.publicationShapeDropReason || null,
        artifactDropReason: analysis.artifactDropReason || null,
        admittedAfterSourcePolicy: analysis.admittedAfterSourcePolicy,
        // Gate decisions
        passedPreScoring,
        preScoringRejectionReason,
        audienceReason,
        passedFinalGate,
        finalRejectionReason,
        overallAdmission,
        tasteScore,
        // Classifier decisions from gate diagnostics
        identityDecision: gate.diagnostics.identityDecisionByTitle?.[title] || null,
        identityRejectionReason: gate.diagnostics.identityRejectionReasonByTitle?.[title] || null,
        audienceFormatGateDecision: gate.diagnostics.audienceFormatGateDecisionByTitle?.[title] || null,
        kidsCollectionEvidence: gate.diagnostics.collectionEvidenceByTitle?.[title] || [],
        kidsAudienceEvidence: gate.diagnostics.audienceEvidenceByTitle?.[title] || [],
        kidsFormatEvidence: gate.diagnostics.formatEvidenceByTitle?.[title] || [],
      });
    }

    const anyAccepted = editionResults.some(e => e.overallAdmission === "accepted");
    const anyPassedPreScoring = editionResults.some(e => e.passedPreScoring);
    const admissionOutcomes = [...new Set(editionResults.map(e => e.overallAdmission))];
    const editionSelectionMatters = admissionOutcomes.length > 1;
    const bestMatch = editionResults.find(e => e.overallAdmission === "accepted")
      || editionResults.find(e => e.overallAdmission === "rejected_final_gate")
      || editionResults[0]
      || null;

    // Assess against expected label
    let labelMatch;
    if (book.expectedLabel === "should_accept") {
      labelMatch = anyAccepted ? "correct_accept" : anyPassedPreScoring ? "partial_pre_scoring_pass" : "false_reject";
    } else if (book.expectedLabel === "should_reject") {
      labelMatch = anyAccepted ? "false_accept" : "correct_reject";
    } else {
      labelMatch = anyAccepted ? "accepted_ambiguous" : "rejected_ambiguous";
    }

    results.push({
      fixtureTitle: book.title,
      fixtureAuthor: book.author,
      expectedLabel: book.expectedLabel,
      category: book.category,
      group: book.group,
      notes: book.notes || "",
      editionsFound: fetched.items.length,
      editions: editionResults,
      anyEditionAccepted: anyAccepted,
      bestMatchVolumeId: bestMatch?.volumeId || null,
      bestMatchAdmission: bestMatch?.overallAdmission || null,
      bestMatchPublicationShape: bestMatch?.publicationShape || null,
      bestMatchCategories: bestMatch?.categories || [],
      editionSelectionMatters,
      labelMatch,
    });

    await sleep(FETCH_DELAY_MS);
  }

  // Aggregate analysis
  const positiveBooks = results.filter(r => r.group === "positive");
  const negativeBooks = results.filter(r => r.group === "negative");

  const trueAccepts = positiveBooks.filter(r => r.labelMatch === "correct_accept").length;
  const falseRejects = positiveBooks.filter(r => r.labelMatch === "false_reject").length;
  const partialPassOnly = positiveBooks.filter(r => r.labelMatch === "partial_pre_scoring_pass").length;
  const trueRejects = negativeBooks.filter(r => r.labelMatch === "correct_reject").length;
  const falseAccepts = negativeBooks.filter(r => r.labelMatch === "false_accept").length;

  const acceptedEditions = results.flatMap(r => r.editions.filter(e => e.overallAdmission === "accepted"));
  const rejectedGoodEditions = results
    .filter(r => r.group === "positive" && !r.anyEditionAccepted)
    .flatMap(r => r.editions.slice(0, 1));

  function countField(editions, fieldSelector) {
    const counts = {};
    for (const e of editions) {
      const val = fieldSelector(e);
      if (val) counts[val] = (counts[val] || 0) + 1;
    }
    return counts;
  }

  const aggregate = {
    totalFixtures: results.length,
    positiveCount: positiveBooks.length,
    negativeCount: negativeBooks.length,
    positiveResults: {
      trueAccepts, falseRejects, partialPreScoringPassOnly: partialPassOnly,
      trueAcceptRate: positiveBooks.length ? Math.round(trueAccepts / positiveBooks.length * 100) : 0,
      falseRejectTitles: positiveBooks.filter(r => r.labelMatch === "false_reject").map(r => r.fixtureTitle),
      partialPassTitles: positiveBooks.filter(r => r.labelMatch === "partial_pre_scoring_pass").map(r => r.fixtureTitle),
    },
    negativeResults: {
      trueRejects, falseAccepts,
      trueRejectRate: negativeBooks.length ? Math.round(trueRejects / negativeBooks.length * 100) : 0,
      falseAcceptTitles: negativeBooks.filter(r => r.labelMatch === "false_accept").map(r => r.fixtureTitle),
    },
    editionSelectionMatters: results.filter(r => r.editionSelectionMatters).map(r => r.fixtureTitle),
    metadataFieldAnalysis: {
      acceptedEditionsPublicationShapes: countField(acceptedEditions, e => e.publicationShape),
      rejectedGoodEditionsPublicationShapes: countField(rejectedGoodEditions, e => e.publicationShape),
      acceptedEditionsHasIsbn: acceptedEditions.filter(e => e.hasIsbn).length + "/" + acceptedEditions.length,
      rejectedGoodEditionsHasIsbn: rejectedGoodEditions.filter(e => e.hasIsbn).length + "/" + rejectedGoodEditions.length,
      acceptedEditionsHasDescription: acceptedEditions.filter(e => e.hasDescription).length + "/" + acceptedEditions.length,
      rejectedGoodEditionsHasDescription: rejectedGoodEditions.filter(e => e.hasDescription).length + "/" + rejectedGoodEditions.length,
      acceptedEditionsInferredAudienceBands: countField(acceptedEditions, e => e.inferredAudienceBand),
      rejectedGoodEditionsInferredAudienceBands: countField(rejectedGoodEditions, e => e.inferredAudienceBand),
      acceptedEditionsPageCountBuckets: {
        "<=32": acceptedEditions.filter(e => e.pageCount && e.pageCount <= 32).length,
        "33-64": acceptedEditions.filter(e => e.pageCount && e.pageCount > 32 && e.pageCount <= 64).length,
        "65-128": acceptedEditions.filter(e => e.pageCount && e.pageCount > 64 && e.pageCount <= 128).length,
        ">128": acceptedEditions.filter(e => e.pageCount && e.pageCount > 128).length,
        "unknown": acceptedEditions.filter(e => !e.pageCount).length,
      },
    },
    topRejectionReasonsForGoodBooks: (() => {
      const counts = {};
      for (const ed of rejectedGoodEditions) {
        const r = ed.preScoringRejectionReason || ed.finalRejectionReason || "unknown";
        counts[r] = (counts[r] || 0) + 1;
      }
      return counts;
    })(),
    apiErrors: errors,
  };

  // Write JSON
  mkdirSync(resolve(scriptDir, "output"), { recursive: true });
  const jsonPath = resolve(scriptDir, "output/kids-k2-ground-truth-audit.json");
  writeFileSync(jsonPath, JSON.stringify({ generatedAt: new Date().toISOString(), aggregate, results }, null, 2), "utf8");
  console.log(`\nJSON written to: ${jsonPath}`);

  // Write CSV
  const csvLines = [
    "fixtureTitle,fixtureAuthor,expectedLabel,category,group,editionsFound,anyEditionAccepted,bestMatchAdmission,bestMatchPublicationShape,bestMatchCategoriesCount,editionSelectionMatters,labelMatch",
  ];
  for (const r of results) {
    csvLines.push([
      JSON.stringify(r.fixtureTitle),
      JSON.stringify(r.fixtureAuthor),
      r.expectedLabel,
      r.category,
      r.group,
      r.editionsFound,
      r.anyEditionAccepted,
      r.bestMatchAdmission || "",
      r.bestMatchPublicationShape || "",
      (r.bestMatchCategories || []).length,
      r.editionSelectionMatters,
      r.labelMatch,
    ].join(","));
  }
  const csvPath = resolve(scriptDir, "output/kids-k2-ground-truth-audit.csv");
  writeFileSync(csvPath, csvLines.join("\n"), "utf8");
  console.log(`CSV written to: ${csvPath}`);

  // Print aggregate summary
  console.log("\n=== AGGREGATE ANALYSIS ===");
  console.log(`Total fixtures: ${aggregate.totalFixtures} (positive: ${aggregate.positiveCount}, negative: ${aggregate.negativeCount})`);
  console.log(`\nPositive books (should_accept):`);
  console.log(`  True accepts: ${aggregate.positiveResults.trueAccepts} / ${aggregate.positiveCount} (${aggregate.positiveResults.trueAcceptRate}%)`);
  console.log(`  False rejects: ${aggregate.positiveResults.falseRejects}`);
  if (aggregate.positiveResults.falseRejectTitles.length) console.log(`    → ${aggregate.positiveResults.falseRejectTitles.join(", ")}`);
  console.log(`  Partial pass (pre-scoring only): ${aggregate.positiveResults.partialPreScoringPassOnly}`);
  if (aggregate.positiveResults.partialPassTitles.length) console.log(`    → ${aggregate.positiveResults.partialPassTitles.join(", ")}`);
  console.log(`\nNegative controls (should_reject):`);
  console.log(`  True rejects: ${aggregate.negativeResults.trueRejects} / ${aggregate.negativeCount} (${aggregate.negativeResults.trueRejectRate}%)`);
  console.log(`  False accepts: ${aggregate.negativeResults.falseAccepts}`);
  if (aggregate.negativeResults.falseAcceptTitles.length) console.log(`    → ${aggregate.negativeResults.falseAcceptTitles.join(", ")}`);
  if (aggregate.editionSelectionMatters.length) {
    console.log(`\nEdition selection materially changes outcome for: ${aggregate.editionSelectionMatters.join(", ")}`);
  }
  console.log("\nTop rejection reasons for good books:");
  for (const [reason, count] of Object.entries(aggregate.topRejectionReasonsForGoodBooks)) {
    console.log(`  ${reason}: ${count}`);
  }
  console.log("\nAccepted editions publication shapes:", aggregate.metadataFieldAnalysis.acceptedEditionsPublicationShapes);
  console.log("Rejected good editions publication shapes:", aggregate.metadataFieldAnalysis.rejectedGoodEditionsPublicationShapes);
  console.log("Has ISBN: accepted=", aggregate.metadataFieldAnalysis.acceptedEditionsHasIsbn, " rejected-good=", aggregate.metadataFieldAnalysis.rejectedGoodEditionsHasIsbn);
  console.log("Has description: accepted=", aggregate.metadataFieldAnalysis.acceptedEditionsHasDescription, " rejected-good=", aggregate.metadataFieldAnalysis.rejectedGoodEditionsHasDescription);
  console.log("Inferred audience band (accepted):", aggregate.metadataFieldAnalysis.acceptedEditionsInferredAudienceBands);
  console.log("Inferred audience band (rejected good):", aggregate.metadataFieldAnalysis.rejectedGoodEditionsInferredAudienceBands);
}

runAudit().catch(err => {
  console.error("Audit failed:", err);
  process.exit(1);
});
