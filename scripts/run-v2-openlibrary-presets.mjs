import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const PRESETS = [
  { deck: "Teen Fantasy OL-F1", ageBand: "teens", signals: [
    { action: "like", title: "Magic Academy", genres: ["fantasy"], themes: ["school", "action"], format: "book" },
    { action: "like", title: "Action Quest", genres: ["fantasy"], themes: ["adventure"], format: "book" },
  ] },
  { deck: "Teen A", ageBand: "teens", signals: [
    { action: "like", title: "Percy Jackson", genres: ["fantasy", "adventure"], themes: ["mythology", "school"], format: "book" },
    { action: "like", title: "Scythe", genres: ["science fiction", "dystopian"], themes: ["action", "ethical conflict"], format: "book" },
    { action: "like", title: "Spy School", genres: ["comedy", "action"], themes: ["school", "mission"], format: "book" },
  ] },
  { deck: "Teen B", ageBand: "teens", signals: [
    { action: "like", title: "Fangirl", genres: ["contemporary", "romance"], themes: ["coming of age"], format: "book" },
    { action: "like", title: "The Summer I Turned Pretty", genres: ["romance", "contemporary"], themes: ["family", "relationships"], format: "book" },
    { action: "like", title: "Percy Jackson", genres: ["fantasy", "adventure"], themes: ["mythology"], format: "book" },
  ] },
  { deck: "Teen C", ageBand: "teens", signals: [
    { action: "like", title: "Five Nights at Freddy's", genres: ["horror", "mystery"], themes: ["survival", "psychological"], format: "book" },
    { action: "like", title: "The Inheritance Games", genres: ["mystery", "thriller"], themes: ["puzzles"], format: "book" },
    { action: "like", title: "A Deadly Education", genres: ["fantasy", "horror"], themes: ["school", "survival"], format: "book" },
  ] },
  { deck: "Adult A", ageBand: "adult", signals: [
    { action: "like", title: "Gone Girl", genres: ["psychological thriller", "mystery"], themes: ["crime", "suspense"], format: "book" },
    { action: "like", title: "The Girl with the Dragon Tattoo", genres: ["crime", "thriller"], themes: ["investigation"], format: "book" },
    { action: "like", title: "The Secret History", genres: ["literary fiction", "crime drama"], themes: ["dark academia"], format: "book" },
  ] },
  { deck: "Adult B", ageBand: "adult", signals: [
    { action: "like", title: "All Systems Red", genres: ["science fiction", "adventure"], themes: ["space", "humor"], format: "book" },
    { action: "like", title: "Legends & Lattes", genres: ["cozy fantasy", "fantasy"], themes: ["comfort", "found family"], format: "book" },
    { action: "like", title: "The Long Way to a Small Angry Planet", genres: ["science fiction"], themes: ["found family", "adventure"], format: "book" },
  ] },
  { deck: "Adult C", ageBand: "adult", signals: [
    { action: "like", title: "11/22/63", genres: ["historical fiction", "science fiction"], themes: ["drama", "alternate history"], format: "book" },
    { action: "like", title: "The Plot Against America", genres: ["historical fiction"], themes: ["political", "drama"], format: "book" },
    { action: "like", title: "Dark Matter", genres: ["science fiction", "thriller"], themes: ["suspense"], format: "book" },
  ] },
  { deck: "MG A placeholder", ageBand: "preteens", signals: [], placeholder: true },
  { deck: "K-2 A placeholder", ageBand: "kids", signals: [], placeholder: true },
];
const TEEN_FANTASY_COMPOSITION_QUERIES = [
  "fantasy action adventure",
  "young adult fantasy",
  "young adult fantasy adventure",
  "young adult contemporary fantasy",
  "young adult fantasy fiction",
  "teen fantasy fiction",
  "young adult magical adventure",
  "young adult fantasy series",
  "teen fantasy adventure",
];
const LEADING_TEEN_FANTASY_QUERIES = new Set([
  "young adult magical adventure",
  "young adult fantasy series",
  "teen fantasy adventure",
]);
const TEEN_FANTASY_PHASE_2_QUERIES = [
  "young adult fantasy series",
  "young adult magical adventure",
  "teen fantasy adventure",
];
const TEEN_FANTASY_PHASE_2_STRATEGIES = [
  { id: "B", label: "series-only anchor", queries: ["young adult fantasy series"] },
  { id: "C", label: "magical-adventure-only anchor", queries: ["young adult magical adventure"] },
  { id: "D", label: "series + magical-adventure", queries: ["young adult fantasy series", "young adult magical adventure"] },
  { id: "E", label: "series + magical-adventure + teen fantasy adventure", queries: TEEN_FANTASY_PHASE_2_QUERIES },
];

const TEEN_FANTASY_QUALITY_BY_TITLE = new Map([
  ["thirteenth child", { classification: "Strong Teen Fantasy", sequel: "first-in-series" }],
  ["a darker shade of magic", { classification: "Adult/crossover concern", sequel: "first-in-series", adultPressure: true }],
  ["the inquisitor's tale", { classification: "Acceptable crossover", sequel: "standalone", youngerReaderPressure: true }],
  ["stanley's christmas adventure", { classification: "False positive", sequel: "later-series entry", youngerReaderPressure: true }],
  ["sufficiently advanced magic", { classification: "Adult/crossover concern", sequel: "first-in-series", adultPressure: true }],
  ["wild magic", { classification: "Strong Teen Fantasy", sequel: "first-in-series" }],
  ["carry on", { classification: "Strong Teen Fantasy", sequel: "first-in-series" }],
  ["goldenhand", { classification: "Weak fit", sequel: "later-series entry" }],
  ["beautiful creatures", { classification: "Strong Teen Fantasy", sequel: "first-in-series" }],
  ["beautiful creatures (beautiful creatures series, book 1)", { classification: "Strong Teen Fantasy", sequel: "first-in-series" }],
  ["a curse for true love", { classification: "Weak fit", sequel: "later-series entry" }],
  ["i shall wear midnight", { classification: "Strong Teen Fantasy", sequel: "later-series entry" }],
  ["teen titans", { classification: "Weak fit", sequel: "unclear" }],
  ["the princess bride", { classification: "Acceptable crossover", sequel: "standalone" }],
]);

const HARD_ARTIFACT_TITLE = /\b(crime and punishment notes|the poet and the murderer|mystery in the mainstream|study notes?|notes on|study aids?|study guides?|companions? to|criticism|critical essays?|literary history|bibliograph(?:y|ies)|true crime nonfiction)\b/i;
const OUT_DIR = ".tmp/v2-openlibrary-presets";
const TS_FILES = [
  "app/recommender-v2/engine.ts",
  "app/recommender-v2/diagnostics.ts",
  "app/recommender-v2/normalize.ts",
  "app/recommender-v2/searchPlan.ts",
  "app/recommender-v2/score.ts",
  "app/recommender-v2/select.ts",
  "app/recommender-v2/tasteProfile.ts",
  "app/recommender-v2/types.ts",
  "app/recommender-v2/sources/index.ts",
  "app/recommender-v2/sources/openLibrarySource.ts",
  "app/recommender-v2/sources/openLibraryProfiles.ts",
  "app/recommender-v2/sources/mockSource.ts",
];

function stageCount(result, stage, key) {
  const row = result.diagnostics.stages.find((item) => item.stage === stage);
  return Number(row?.counts?.[key] || 0);
}

function topReasons(rejectedReasons) {
  return Object.entries(rejectedReasons || {})
    .filter(([reason]) => !reason.startsWith("adult_query_family_"))
    .sort((a, b) => Number(b[1]) - Number(a[1]))
    .slice(0, 5)
    .map(([reason, count]) => `${reason}:${count}`);
}

function summarizeFetches(source) {
  const fetches = (source?.fetches || []).filter((fetch) => !fetch.diagnosticOnly);
  return fetches.length ? `${fetches.filter((fetch) => fetch.timedOut).length}/${fetches.length} timeouts` : "0/0 timeouts";
}

function summarizeFetchPaths(source) {
  const fetches = (source?.fetches || []).filter((fetch) => !fetch.diagnosticOnly);
  return [...new Set(fetches.map((fetch) => fetch.fetchPath || "missing"))];
}

function summarizeProxyAttempts(source) {
  const attempts = (source?.fetches || [])
    .filter((fetch) => !fetch.diagnosticOnly && Number.isFinite(Number(fetch.proxyAttempts)))
    .map((fetch) => Number(fetch.proxyAttempts));
  return attempts;
}

function summarizeClientTimeouts(source) {
  return (source?.fetches || [])
    .filter((fetch) => !fetch.diagnosticOnly && Number.isFinite(Number(fetch.clientTimeoutMs)))
    .map((fetch) => Number(fetch.clientTimeoutMs));
}

function openLibraryProxyConfigured() {
  return Boolean(process.env.OPEN_LIBRARY_PROXY_BASE_URL || process.env.EXPO_PUBLIC_OPEN_LIBRARY_PROXY_BASE_URL || process.env.VERCEL_URL);
}

function allMainFetchesTimedOut(source) {
  const fetches = (source?.fetches || []).filter((fetch) => !fetch.diagnosticOnly);
  return fetches.length > 0 && fetches.every((fetch) => fetch.timedOut);
}

function familyDiagnostics(rejectedReasons) {
  return Object.keys(rejectedReasons || {})
    .filter((reason) => /^adult_query_family_(scored|selected|acceptance_pct)_/.test(reason))
    .sort()
    .map((reason) => `${reason}:${rejectedReasons[reason]}`);
}

function passFail(preset, result, source) {
  const count = result.items.length;
  const titles = result.items.map((item) => item.title).join(" | ");
  const expectedProfile = preset.ageBand === "teens" ? "teen" : preset.ageBand === "adult" ? "adult" : preset.ageBand === "preteens" ? "middleGrades" : "k2";
  const wrongProfile = source?.openLibraryAgeProfile !== expectedProfile;
  const cleanCount = count >= 3 && count <= 5;
  const zeroAllowed = count === 0 && allMainFetchesTimedOut(source);
  return !HARD_ARTIFACT_TITLE.test(titles) && !wrongProfile && (cleanCount || zeroAllowed) ? "PASS" : "FAIL";
}

function printSummary(preset, result) {
  const source = result.diagnostics.sources.find((row) => row.source === "openLibrary");
  const routing = source?.openLibraryQueryRouting || {};
  const rejectedReasons = result.diagnostics.rejectedReasons || {};
  console.log(JSON.stringify({
    deck: preset.deck,
    pass: passFail(preset, result, source),
    ageProfile: source?.openLibraryAgeProfile || "missing",
    routingReason: String(routing.reason || "missing"),
    queries: source?.queries || [],
    sourceStatus: source?.status || "missing",
    raw: source?.rawCount || 0,
    sessionReportHeader: source?.sessionReportHeader || result.diagnostics.sessionReportHeader,
    middleGradesDeepDebugActive: source?.middleGradesDeepDebugActive || false,
    middleGradesDeepDebugActivationSource: source?.middleGradesDeepDebugActivationSource || "none",
    debugMiddleGradesBudgetMs: source?.debugMiddleGradesBudgetMs,
    debugMiddleGradesPerQueryBudgetMs: source?.debugMiddleGradesPerQueryBudgetMs,
    normalized: stageCount(result, "normalized", "normalized"),
    scored: stageCount(result, "scored", "scored"),
    selected: result.items.length,
    finalItemsLength: result.diagnostics.finalItemsLength ?? result.items.length,
    returnedItemsLength: result.diagnostics.returnedItemsLength ?? result.items.length,
    returnedItemsTitles: result.diagnostics.returnedItemsTitles || result.items.map((item) => item.title),
    returnedItemsStageBoundary: result.diagnostics.returnedItemsStageBoundary,
    finalTitles: result.items.map((item) => item.title),
    artifactSuppressedTitles: source?.artifactSuppressedTitles || [],
    topRejectionReasons: topReasons(rejectedReasons),
    timeoutSummary: summarizeFetches(source),
    fetchPaths: summarizeFetchPaths(source),
    proxyAttempts: summarizeProxyAttempts(source),
    clientTimeouts: summarizeClientTimeouts(source),
    openLibraryProxyConfigured: openLibraryProxyConfigured(),
    perQueryWaterfall: (source?.fetches || [])
      .filter((fetch) => !fetch.diagnosticOnly)
      .map((fetch) => ({
        query: fetch.query,
        queryCascadeIndex: fetch.queryCascadeIndex,
        fetchPath: fetch.fetchPath,
        timedOut: Boolean(fetch.timedOut),
        failedReason: fetch.failedReason,
        docsReturned: Number(fetch.docsReturned || 0),
        rawRetrieved: Number(fetch.rawRetrieved || 0),
        structuralRejects: Number(fetch.structuralRejects || 0),
        acceptedAfterSourcePolicy: Number(fetch.acceptedAfterSourcePolicy || 0),
        mergedCandidates: Number(fetch.mergedCandidates || 0),
        finalContribution: Number(fetch.finalContribution || 0),
      })),
    perQueryAcceptedTotal: (source?.fetches || []).reduce((sum, fetch) => sum + Number(fetch.acceptedAfterSourcePolicy || 0), 0),
    aggregateAcceptedTotal: Number(source?.openLibraryDocsEligibleForScoringCount || 0),
    perQueryMergedTotal: (source?.fetches || []).reduce((sum, fetch) => sum + Number(fetch.mergedCandidates || 0), 0),
    aggregateMergedTotal: Number(source?.rawCount || 0),
    finalRejectionHistogram: rejectedReasons.teenOpenLibraryFinalRejectionHistogram || {},
    finalRejectionAudit: rejectedReasons.teenOpenLibraryFinalRejectionAudit || [],
    adultFamilyDiagnostics: familyDiagnostics(rejectedReasons),
  }));
}

function selectedPresets() {
  if (process.argv.includes("--teen-fantasy-ol-f1")) return PRESETS.filter((preset) => preset.deck === "Teen Fantasy OL-F1");
  if (process.argv.includes("--adult-only")) return PRESETS.filter((preset) => preset.ageBand === "adult");
  if (process.argv.includes("--teen-only")) return PRESETS.filter((preset) => preset.ageBand === "teens");
  return PRESETS;
}

function middleGradesDeepDebugRequested() {
  return process.argv.includes("--middle-grades-deep-debug") || process.env.MIDDLE_GRADES_DEEP_DEBUG === "1" || process.env.MIDDLE_GRADES_DEEP_DEBUG === "true";
}

function middleGradesDebugPresetSignals() {
  return [
    { action: "like", title: "Dog Man", genres: ["graphic novel", "humor", "adventure"], themes: ["friendship", "playful"], format: "graphicNovel" },
    { action: "like", title: "Flora & Ulysses", genres: ["humor", "adventure"], themes: ["friendship", "community"], format: "book" },
    { action: "like", title: "From the Mixed-Up Files", genres: ["adventure", "mystery"], themes: ["siblings", "independence"], format: "book" },
    { action: "skip", title: "Generic Fantasy Skip", genres: ["fantasy"], themes: ["magic"], format: "book" },
  ];
}

function deepDebugDiagnosticsForPreset(preset) {
  if (preset.ageBand !== "preteens" || !middleGradesDeepDebugRequested()) return undefined;
  return {
    middleGradesDeepDebugExpected: true,
    debugMiddleGradesDeepTrace: true,
    debugMiddleGradesNoTimeouts: true,
    middleGradesDeepDebugActivationSource: "preset",
  };
}

function printOfflineManifest() {
  for (const preset of selectedPresets()) {
    console.log(JSON.stringify({ deck: preset.deck, ageBand: preset.ageBand, status: preset.placeholder ? "placeholder" : "manual_live_run_available" }));
  }
}

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

async function runTeenFantasyComposition({
  buildTasteProfile,
  openLibrarySourceAdapter,
  normalizeSourceResults,
  scoreCandidates,
  selectRecommendations,
  applyOpenLibraryPerQueryFinalLineage,
}) {
  const preset = PRESETS.find((row) => row.deck === "Teen Fantasy OL-F1");
  const matrix = [];
  let sunshineAudit;

  for (const [queryIndex, query] of TEEN_FANTASY_COMPOSITION_QUERIES.entries()) {
    const profile = buildTasteProfile({
      ageBand: "teens",
      signals: preset.signals,
      limit: 5,
      diagnostics: {
        forceTeenPostFinalEligibilityRecovery: true,
        forceTeenPostFinalEligibilityRecoveryQueries: [query],
        forceTeenPostFinalEligibilityRecoveryQueryOffset: queryIndex,
        disableTeenSourceUnderfillRecovery: true,
      },
    });
    const plan = {
      source: "openLibrary",
      enabled: true,
      status: "planned",
      timeoutMs: 8_000,
      intents: [{ id: `ol-f1-composition-${queryIndex}`, query, facets: [], priority: 1, rationale: ["OL-F1 controlled composition"] }],
    };
    const sourceResult = await openLibrarySourceAdapter.search(plan, { profile });
    const normalized = normalizeSourceResults([sourceResult]);
    const scored = scoreCandidates(normalized, profile);
    const selection = selectRecommendations(scored, profile, 5);
    applyOpenLibraryPerQueryFinalLineage([sourceResult], selection.selected);

    const audit = selection.rejectedReasons.teenOpenLibraryFinalRejectionAudit || [];
    const fetch = (sourceResult.diagnostics.fetches || []).find((row) => !row.diagnosticOnly && String(row.query || "").toLowerCase() === query.toLowerCase())
      || (sourceResult.diagnostics.fetches || []).find((row) => !row.diagnosticOnly);
    const documentFantasyRows = audit.filter((row) => (row.positiveTasteEvidence || []).some((signal) => /fantasy|magic|magical/i.test(String(signal))));
    const teenEvidenceRows = audit.filter((row) => (row.authoritySignals || []).length > 0 || (row.reliableTeenFitSignals || []).length > 0);
    const bookOnlyRows = audit.filter((row) => (row.positiveTasteEvidence || []).length === 0 && (row.allMetadataBackedLikedSignals || []).every((signal) => String(signal).toLowerCase() === "book"));
    const ambiguousRows = audit.filter((row) => (row.nonNarrativeShapeReasons || []).length > 0 || (row.adultOrCrossoverShapeReasons || []).length > 0);
    const finalEligibleRows = audit.filter((row) => row.finalEligibilityAllowed);
    const share = (value) => scored.length ? Math.round((value / scored.length) * 1000) / 10 : 0;
    const eligibleCandidateQualityAudit = LEADING_TEEN_FANTASY_QUERIES.has(query)
      ? scored
        .filter((candidate) => candidate.diagnostics?.teenOpenLibraryFinalEligibilityAllowed === true)
        .map((candidate) => {
          const sourceItem = candidate.raw || {};
          const raw = sourceItem.rawOpenLibraryDoc || {};
          const contentSignals = Array.isArray(candidate.diagnostics?.teenOpenLibraryContentSignals) ? candidate.diagnostics.teenOpenLibraryContentSignals.map(String) : [];
          const authoritySignals = Array.isArray(candidate.diagnostics?.teenOpenLibraryAuthoritySignals) ? candidate.diagnostics.teenOpenLibraryAuthoritySignals.map(String) : [];
          const reliableTeenFitSignals = Array.isArray(candidate.diagnostics?.teenOpenLibraryReliableTeenFitSignals) ? candidate.diagnostics.teenOpenLibraryReliableTeenFitSignals.map(String) : [];
          const adultOrCrossoverShapeReasons = Array.isArray(candidate.diagnostics?.teenOpenLibraryAdultOrCrossoverShapeReasons) ? candidate.diagnostics.teenOpenLibraryAdultOrCrossoverShapeReasons.map(String) : [];
          const nonNarrativeShapeReasons = Array.isArray(candidate.diagnostics?.teenOpenLibraryNonNarrativeShapeReasons) ? candidate.diagnostics.teenOpenLibraryNonNarrativeShapeReasons.map(String) : [];
          const sameTitleCandidates = scored.filter((row) => String(row.title || "").trim().toLowerCase() === String(candidate.title || "").trim().toLowerCase());
          const survivalBasis = contentSignals.length >= 2
            ? "multiple_document_backed_content_signals"
            : contentSignals.length === 1 && reliableTeenFitSignals.length > 0 && candidate.diagnostics?.teenOpenLibraryNarrativeFictionShape
              ? "single_content_signal_with_reliable_teen_fit_and_narrative_shape"
              : "distinctive_document_backed_content_signal";
          return {
            title: candidate.title,
            sourceId: candidate.sourceId,
            workKey: raw.key,
            editionKeys: raw.edition_key,
            authors: raw.author_name || candidate.creators,
            firstPublishYear: raw.first_publish_year || candidate.publicationYear,
            publisher: raw.publisher,
            originatingQuery: String(candidate.diagnostics?.queryText || query),
            score: Math.round(candidate.score * 1000) / 1000,
            fantasyEvidence: contentSignals.filter((signal) => /fantasy|magic|magical/i.test(signal)),
            allDocumentBackedTasteEvidence: contentSignals,
            teenAuthorityEvidence: authoritySignals,
            reliableTeenFitEvidence: reliableTeenFitSignals,
            maturityAssessmentInputs: {
              subjects: raw.subject,
              description: typeof raw.description === "string" ? raw.description.slice(0, 900) : raw.description,
              firstSentence: raw.first_sentence,
              adultOrCrossoverShapeReasons,
            },
            publicationShape: {
              narrativeFictionShape: Boolean(candidate.diagnostics?.teenOpenLibraryNarrativeFictionShape),
              nonNarrativeShapeReasons,
            },
            duplicateStatus: {
              sameNormalizedTitleCount: sameTitleCandidates.length,
              sameNormalizedTitleSourceIds: sameTitleCandidates.map((row) => row.sourceId),
              selectedAfterDeduplication: selection.selected.includes(candidate),
            },
            survivedEligibilityBecause: survivalBasis,
          };
        })
      : [];

    matrix.push({
      query,
      fetchStatus: fetch?.timedOut ? "timed_out" : fetch?.failedReason ? "failed" : "succeeded",
      rawRetrieved: Number(fetch?.rawRetrieved || 0),
      structuralRejects: Number(fetch?.structuralRejects || 0),
      acceptedAfterSourcePolicy: Number(fetch?.acceptedAfterSourcePolicy || 0),
      mergedCandidates: Number(fetch?.mergedCandidates || 0),
      documentBackedFantasyEvidence: documentFantasyRows.length,
      documentBackedFantasySharePct: share(documentFantasyRows.length),
      teenAuthorityOrFitEvidence: teenEvidenceRows.length,
      teenAuthorityOrFitSharePct: share(teenEvidenceRows.length),
      bookOnlyCandidates: bookOnlyRows.length,
      ambiguousPublicationShapes: ambiguousRows.map((row) => ({ title: row.title, reasons: [...(row.nonNarrativeShapeReasons || []), ...(row.adultOrCrossoverShapeReasons || [])] })),
      scoredCandidates: scored.length,
      finalEligibleCandidates: finalEligibleRows.length,
      finalEligibleSharePct: share(finalEligibleRows.length),
      finalEligibleTitles: finalEligibleRows.map((row) => row.title),
      finalContribution: Number(fetch?.finalContribution || 0),
      rejectionHistogram: selection.rejectedReasons.teenOpenLibraryFinalRejectionHistogram || {},
      eligibleCandidateQualityAudit,
    });

    if (!sunshineAudit) {
      const sunshineItem = sourceResult.rawItems.find((row) => String(row?.title || "").toLowerCase() === "sunshine");
      const sunshineRow = audit.find((row) => String(row?.title || "").toLowerCase() === "sunshine");
      if (sunshineItem && sunshineRow) {
        const raw = sunshineItem.rawOpenLibraryDoc || {};
        sunshineAudit = {
          query,
          key: raw.key,
          title: raw.title,
          subtitle: raw.subtitle,
          author_name: raw.author_name,
          first_publish_year: raw.first_publish_year,
          publisher: raw.publisher,
          subject: raw.subject,
          subject_facet: raw.subject_facet,
          subject_key: raw.subject_key,
          description: raw.description,
          first_sentence: raw.first_sentence,
          classification: sunshineRow,
        };
      }
    }
  }

  console.log(JSON.stringify({ experiment: "OL-F1 Teen Fantasy retrieval composition", matrix, sunshineAudit }));
}
async function main() {
  if (process.argv.includes("--offline")) {
    printOfflineManifest();
    return;
  }
  compileHarnessDependencies();
  const { applyOpenLibraryPerQueryFinalLineage, mergeOpenLibrarySourceItemsForDiagnostics, runRecommenderV2 } = await import(pathToFileURL(`${process.cwd()}/${OUT_DIR}/engine.js`).href);
  if (process.argv.includes("--teen-fantasy-stability")) {
    const [tasteProfileModule, openLibraryModule] = await Promise.all([
      import(pathToFileURL(`${process.cwd()}/${OUT_DIR}/tasteProfile.js`).href),
      import(pathToFileURL(`${process.cwd()}/${OUT_DIR}/sources/openLibrarySource.js`).href),
    ]);
    await runTeenFantasyStability({
      buildTasteProfile: tasteProfileModule.buildTasteProfile,
      openLibrarySourceAdapter: openLibraryModule.openLibrarySourceAdapter,
    });
    return;
  }
  if (process.argv.includes("--teen-fantasy-phase-2")) {
    const [tasteProfileModule, openLibraryModule, normalizeModule, scoreModule, selectModule] = await Promise.all([
      import(pathToFileURL(`${process.cwd()}/${OUT_DIR}/tasteProfile.js`).href),
      import(pathToFileURL(`${process.cwd()}/${OUT_DIR}/sources/openLibrarySource.js`).href),
      import(pathToFileURL(`${process.cwd()}/${OUT_DIR}/normalize.js`).href),
      import(pathToFileURL(`${process.cwd()}/${OUT_DIR}/score.js`).href),
      import(pathToFileURL(`${process.cwd()}/${OUT_DIR}/select.js`).href),
    ]);
    await runTeenFantasyPhase2({
      buildTasteProfile: tasteProfileModule.buildTasteProfile,
      openLibrarySourceAdapter: openLibraryModule.openLibrarySourceAdapter,
      normalizeSourceResults: normalizeModule.normalizeSourceResults,
      scoreCandidates: scoreModule.scoreCandidates,
      selectRecommendations: selectModule.selectRecommendations,
      applyOpenLibraryPerQueryFinalLineage,
      mergeOpenLibrarySourceItemsForDiagnostics,
      runRecommenderV2,
    });
    return;
  }
  if (process.argv.includes("--teen-fantasy-composition")) {
    const [tasteProfileModule, openLibraryModule, normalizeModule, scoreModule, selectModule] = await Promise.all([
      import(pathToFileURL(`${process.cwd()}/${OUT_DIR}/tasteProfile.js`).href),
      import(pathToFileURL(`${process.cwd()}/${OUT_DIR}/sources/openLibrarySource.js`).href),
      import(pathToFileURL(`${process.cwd()}/${OUT_DIR}/normalize.js`).href),
      import(pathToFileURL(`${process.cwd()}/${OUT_DIR}/score.js`).href),
      import(pathToFileURL(`${process.cwd()}/${OUT_DIR}/select.js`).href),
    ]);
    await runTeenFantasyComposition({
      buildTasteProfile: tasteProfileModule.buildTasteProfile,
      openLibrarySourceAdapter: openLibraryModule.openLibrarySourceAdapter,
      normalizeSourceResults: normalizeModule.normalizeSourceResults,
      scoreCandidates: scoreModule.scoreCandidates,
      selectRecommendations: selectModule.selectRecommendations,
      applyOpenLibraryPerQueryFinalLineage,
    });
    return;
  }
  for (const preset of selectedPresets()) {
    const shouldRunMiddleGradesPlaceholderForDebug = preset.placeholder && preset.ageBand === "preteens" && middleGradesDeepDebugRequested();
    if (preset.placeholder && !shouldRunMiddleGradesPlaceholderForDebug) {
      console.log(JSON.stringify({ deck: preset.deck, ageProfile: preset.ageBand, pass: "PLACEHOLDER", note: "profile preset reserved for later MG/K-2 work" }));
      continue;
    }
    try {
      const diagnostics = deepDebugDiagnosticsForPreset(preset);
      const result = await runRecommenderV2({
        requestId: `v2-openlibrary-preset-${preset.deck.replace(/\s+/g, "-").toLowerCase()}`,
        ageBand: preset.ageBand,
        limit: 5,
        enabledSources: { mock: false, openLibrary: true },
        signals: shouldRunMiddleGradesPlaceholderForDebug ? middleGradesDebugPresetSignals() : preset.signals,
        diagnostics,
      });
      printSummary(preset, result);
      const source = result.diagnostics.sources.find((row) => row.source === "openLibrary");
      if (diagnostics?.middleGradesDeepDebugExpected && !source?.middleGradesDeepDebugActive) {
        console.log(JSON.stringify({
          deck: preset.deck,
          pass: "FAIL",
          sessionReportHeader: "MIDDLE GRADES DEEP DEBUG REQUESTED BUT NOT ACTIVATED",
          middleGradesDeepDebugRequestedButNotActivated: true,
          middleGradesDeepDebugActivationFailureReason: source?.middleGradesDeepDebugActivationFailureReason || "openlibrary_source_missing_or_inactive",
        }));
        process.exitCode = 1;
      }
    } catch (error) {
      console.log(JSON.stringify({ deck: preset.deck, pass: "FAIL", error: error instanceof Error ? error.message : String(error) }));
      process.exitCode = 1;
    }
  }
}

await main();
function titleKey(value) {
  return String(value || "").trim().toLowerCase();
}

function phase2CandidateAudit(candidate, allCandidates) {
  const raw = candidate.raw?.rawOpenLibraryDoc || candidate.raw || {};
  const title = String(candidate.title || "");
  const known = TEEN_FANTASY_QUALITY_BY_TITLE.get(titleKey(title));
  const sameTitle = allCandidates.filter((row) => titleKey(row.title) === titleKey(title));
  const adultReasons = Array.isArray(candidate.diagnostics?.teenOpenLibraryAdultOrCrossoverShapeReasons)
    ? candidate.diagnostics.teenOpenLibraryAdultOrCrossoverShapeReasons.map(String)
    : [];
  const teenEvidence = [
    ...(Array.isArray(candidate.diagnostics?.teenOpenLibraryAuthoritySignals) ? candidate.diagnostics.teenOpenLibraryAuthoritySignals : []),
    ...(Array.isArray(candidate.diagnostics?.teenOpenLibraryReliableTeenFitSignals) ? candidate.diagnostics.teenOpenLibraryReliableTeenFitSignals : []),
  ].map(String);
  return {
    title,
    sourceId: candidate.sourceId,
    workKey: raw.key,
    originatingQuery: String(candidate.diagnostics?.queryText || candidate.raw?.queryText || "unknown"),
    score: Math.round(Number(candidate.score || 0) * 1000) / 1000,
    qualityClassification: known?.classification || "Unclassified",
    sequelClassification: known?.sequel || "unclear",
    adultPressure: Boolean(known?.adultPressure),
    youngerReaderPressure: Boolean(known?.youngerReaderPressure),
    duplicatePressure: sameTitle.length > 1,
    diagnosticAdultShapeFlags: adultReasons,
    sameTitleCandidateCount: sameTitle.length,
    fantasyEvidence: (candidate.diagnostics?.teenOpenLibraryContentSignals || []).filter((signal) => /fantasy|magic|magical/i.test(String(signal))),
    teenEvidence,
    maturityAssessment: {
      adultOrCrossoverShapeReasons: adultReasons,
      reliableTeenFitSignals: candidate.diagnostics?.teenOpenLibraryReliableTeenFitSignals || [],
    },
    publicationShape: {
      narrativeFictionShape: Boolean(candidate.diagnostics?.teenOpenLibraryNarrativeFictionShape),
      nonNarrativeShapeReasons: candidate.diagnostics?.teenOpenLibraryNonNarrativeShapeReasons || [],
    },
    survivedEligibilityBecause: candidate.diagnostics?.teenOpenLibraryFinalEligibilityReason || "allowed_by_existing_final_eligibility",
  };
}

function phase2PressureSummary(audit) {
  const sequelHistogram = { standalone: 0, "first-in-series": 0, "later-series entry": 0, unclear: 0 };
  for (const row of audit) sequelHistogram[row.sequelClassification] = Number(sequelHistogram[row.sequelClassification] || 0) + 1;
  const strongOrAcceptable = audit.filter((row) => row.qualityClassification === "Strong Teen Fantasy" || row.qualityClassification === "Acceptable crossover").length;
  return {
    precisionAudit: {
      strongOrAcceptable,
      audited: audit.length,
      precisionPct: audit.length ? Math.round((strongOrAcceptable / audit.length) * 1000) / 10 : 0,
      classifications: audit.reduce((counts, row) => ({ ...counts, [row.qualityClassification]: Number(counts[row.qualityClassification] || 0) + 1 }), {}),
    },
    sequelHistogram,
    adultPressure: audit.filter((row) => row.adultPressure).map((row) => row.title),
    diagnosticAdultShapeFlagPressure: audit.filter((row) => row.diagnosticAdultShapeFlags?.length).map((row) => ({ title: row.title, flags: row.diagnosticAdultShapeFlags })),
    duplicatePressure: audit.filter((row) => row.duplicatePressure).map((row) => row.title),
    youngerReaderPressure: audit.filter((row) => row.youngerReaderPressure).map((row) => row.title),
  };
}

function phase2StrategySummary({ id, label, queries, sourceResult, scored, selection, applyOpenLibraryPerQueryFinalLineage }) {
  applyOpenLibraryPerQueryFinalLineage([sourceResult], selection.selected);
  const eligible = scored.filter((candidate) => candidate.diagnostics?.teenOpenLibraryFinalEligibilityAllowed === true);
  const selected = selection.selected.filter((candidate) => candidate.source === "openLibrary");
  const audit = selected.map((candidate) => phase2CandidateAudit(candidate, scored));
  const fetches = (sourceResult.diagnostics?.fetches || []).filter((fetch) => !fetch.diagnosticOnly);
  return {
    strategy: id,
    label,
    queries,
    retrievalComposition: {
      rawRetrieved: fetches.reduce((sum, fetch) => sum + Number(fetch.rawRetrieved || 0), 0),
      structuralRejects: fetches.reduce((sum, fetch) => sum + Number(fetch.structuralRejects || 0), 0),
      acceptedAfterSourcePolicy: fetches.reduce((sum, fetch) => sum + Number(fetch.acceptedAfterSourcePolicy || 0), 0),
      mergedCandidates: sourceResult.rawItems.length,
      perQuery: fetches.map((fetch) => ({
        query: fetch.query,
        timedOut: Boolean(fetch.timedOut),
        failedReason: fetch.failedReason,
        rawRetrieved: Number(fetch.rawRetrieved || 0),
        structuralRejects: Number(fetch.structuralRejects || 0),
        acceptedAfterSourcePolicy: Number(fetch.acceptedAfterSourcePolicy || 0),
        mergedCandidates: Number(fetch.mergedCandidates || 0),
        finalContribution: Number(fetch.finalContribution || 0),
      })),
    },
    scoredCandidates: scored.length,
    finalEligible: eligible.length,
    finalEligibleTitles: eligible.map((candidate) => candidate.title),
    finalContribution: selected.length,
    finalTitles: selected.map((candidate) => candidate.title),
    ...phase2PressureSummary(audit),
    finalCandidateAudit: audit,
  };
}

async function runTeenFantasyPhase2({
  buildTasteProfile,
  openLibrarySourceAdapter,
  normalizeSourceResults,
  scoreCandidates,
  selectRecommendations,
  applyOpenLibraryPerQueryFinalLineage,
  mergeOpenLibrarySourceItemsForDiagnostics,
  runRecommenderV2,
}) {
  const preset = PRESETS.find((row) => row.deck === "Teen Fantasy OL-F1");
  const profile = buildTasteProfile({ ageBand: "teens", signals: preset.signals, limit: 5 });
  const captured = new Map();
  for (const [queryIndex, query] of TEEN_FANTASY_PHASE_2_QUERIES.entries()) {
    const queryProfile = buildTasteProfile({
      ageBand: "teens",
      signals: preset.signals,
      limit: 5,
      diagnostics: {
        forceTeenPostFinalEligibilityRecovery: true,
        forceTeenPostFinalEligibilityRecoveryQueries: [query],
        forceTeenPostFinalEligibilityRecoveryQueryOffset: queryIndex,
        disableTeenSourceUnderfillRecovery: true,
      },
    });
    const plan = {
      source: "openLibrary",
      enabled: true,
      status: "planned",
      timeoutMs: 8_000,
      intents: [{ id: `ol-f1-phase-2-${queryIndex}`, query, facets: [], priority: 1, rationale: ["OL-F1 Phase 2 controlled pool"] }],
    };
    captured.set(query, await openLibrarySourceAdapter.search(plan, { profile: queryProfile }));
  }

  const strategies = [];
  const production = await runRecommenderV2({
    requestId: "v2-openlibrary-ol-f1-phase-2-production-baseline",
    ageBand: "teens",
    limit: 5,
    enabledSources: { mock: false, openLibrary: true },
    signals: preset.signals,
  });
  const productionSource = production.diagnostics.sources.find((row) => row.source === "openLibrary");
  const productionFetches = (productionSource?.fetches || []).filter((fetch) => !fetch.diagnosticOnly);
  const productionAudit = production.items.map((item) => {
    const known = TEEN_FANTASY_QUALITY_BY_TITLE.get(titleKey(item.title));
    return {
      title: item.title,
      qualityClassification: known?.classification || "Unclassified",
      sequelClassification: known?.sequel || "unclear",
      adultPressure: Boolean(known?.adultPressure),
      youngerReaderPressure: Boolean(known?.youngerReaderPressure),
      duplicatePressure: false,
    };
  });
  strategies.push({
    strategy: "A",
    label: "current production sequence",
    queries: productionSource?.queries || [],
    retrievalComposition: {
      rawRetrieved: productionFetches.reduce((sum, fetch) => sum + Number(fetch.rawRetrieved || 0), 0),
      structuralRejects: productionFetches.reduce((sum, fetch) => sum + Number(fetch.structuralRejects || 0), 0),
      acceptedAfterSourcePolicy: productionFetches.reduce((sum, fetch) => sum + Number(fetch.acceptedAfterSourcePolicy || 0), 0),
      mergedCandidates: Number(productionSource?.rawCount || 0),
      perQuery: productionFetches.map((fetch) => ({
        query: fetch.query,
        timedOut: Boolean(fetch.timedOut),
        failedReason: fetch.failedReason,
        rawRetrieved: Number(fetch.rawRetrieved || 0),
        structuralRejects: Number(fetch.structuralRejects || 0),
        acceptedAfterSourcePolicy: Number(fetch.acceptedAfterSourcePolicy || 0),
        mergedCandidates: Number(fetch.mergedCandidates || 0),
        finalContribution: Number(fetch.finalContribution || 0),
      })),
    },
    finalEligible: Number(production.diagnostics.rejectedReasons?.teenOpenLibraryFinalRejectionAudit?.filter((row) => row.finalEligibilityAllowed).length || 0),
    finalContribution: production.items.length,
    finalTitles: production.items.map((item) => item.title),
    ...phase2PressureSummary(productionAudit),
    finalCandidateAudit: productionAudit,
  });

  for (const strategy of TEEN_FANTASY_PHASE_2_STRATEGIES) {
    const sourceResults = strategy.queries.map((query) => captured.get(query));
    const mergedRawItems = mergeOpenLibrarySourceItemsForDiagnostics(sourceResults.map((sourceResult) => sourceResult?.rawItems || []));
    const mergedSourceResult = {
      ...sourceResults[0],
      rawItems: mergedRawItems,
      diagnostics: {
        ...sourceResults[0].diagnostics,
        rawCount: mergedRawItems.length,
        fetches: sourceResults.flatMap((sourceResult) => sourceResult?.diagnostics?.fetches || []),
      },
    };
    const normalized = normalizeSourceResults([mergedSourceResult]);
    const scored = scoreCandidates(normalized, profile);
    const selection = selectRecommendations(scored, profile, 5);
    strategies.push(phase2StrategySummary({
      ...strategy,
      sourceResult: mergedSourceResult,
      scored,
      selection,
      applyOpenLibraryPerQueryFinalLineage,
    }));
  }

  console.log(JSON.stringify({
    experiment: "OL-F1 Phase 2 Teen Fantasy retrieval combinations",
    control: "B-E reuse one captured source pool per query; differences are merge/selection-only",
    strategies,
  }));
}

async function runTeenFantasyStability({ buildTasteProfile, openLibrarySourceAdapter }) {
  const preset = PRESETS.find((row) => row.deck === "Teen Fantasy OL-F1");
  const queries = [
    "young adult fantasy series",
    "young adult magical adventure",
    "teen fantasy adventure",
  ];
  const orders = [
    queries,
    [queries[1], queries[2], queries[0]],
    [queries[2], queries[0], queries[1]],
    queries,
  ];
  const baselineByQuery = new Map();
  const attempts = [];

  for (const [roundIndex, order] of orders.entries()) {
    for (const [orderIndex, query] of order.entries()) {
      const queryIndex = queries.indexOf(query);
      const profile = buildTasteProfile({
        ageBand: "teens",
        signals: preset.signals,
        limit: 5,
        diagnostics: {
          forceTeenPostFinalEligibilityRecovery: true,
          forceTeenPostFinalEligibilityRecoveryQueries: [query],
          forceTeenPostFinalEligibilityRecoveryQueryOffset: queryIndex,
          disableTeenSourceUnderfillRecovery: true,
        },
      });
      const plan = {
        source: "openLibrary",
        enabled: true,
        status: "planned",
        timeoutMs: 8_000,
        intents: [{ id: `ol-f1a-${roundIndex}-${orderIndex}`, query, facets: [], priority: 1, rationale: ["OL-F1A identical-request stability"] }],
      };
      const callStartedAt = new Date().toISOString();
      const startedMs = Date.now();
      const sourceResult = await openLibrarySourceAdapter.search(plan, { profile });
      const adapterElapsedMs = Date.now() - startedMs;
      const fetches = (sourceResult.diagnostics?.fetches || []).filter((fetch) => !fetch.diagnosticOnly && String(fetch.query || "").toLowerCase() === query.toLowerCase());
      const terminalFetch = fetches[fetches.length - 1] || {};
      const returnedWorkIds = Array.isArray(terminalFetch.returnedWorkIds) ? terminalFetch.returnedWorkIds.map(String) : [];
      if (!baselineByQuery.has(query) && returnedWorkIds.length) baselineByQuery.set(query, returnedWorkIds);
      const baseline = baselineByQuery.get(query) || [];
      const acceptedWorkIds = sourceResult.rawItems.map((item) => String(item?.sourceId || item?.key || "")).filter(Boolean);
      attempts.push({
        round: roundIndex + 1,
        requestOrder: orderIndex + 1,
        query,
        callStartedAt,
        adapterElapsedMs,
        sourceStatus: sourceResult.status,
        exactRequest: terminalFetch.requestUrl,
        fetchPath: terminalFetch.fetchPath,
        clientTimeoutMs: terminalFetch.clientTimeoutMs,
        attemptNumber: terminalFetch.attemptNumber,
        retryAttempted: Boolean(terminalFetch.retryAttempted || fetches.length > 1),
        retrySucceeded: Boolean(terminalFetch.retrySucceeded),
        fetchAttemptsForQuery: fetches.length,
        proxyAttempts: terminalFetch.proxyAttempts,
        timedOut: Boolean(terminalFetch.timedOut),
        failedReason: terminalFetch.failedReason,
        abortOrigin: terminalFetch.abortOrigin,
        abortReason: terminalFetch.abortReason,
        fetchStartedAt: terminalFetch.fetchStartedAt,
        fetchFinishedAt: terminalFetch.fetchFinishedAt,
        elapsedMs: terminalFetch.elapsedMs,
        httpStatus: terminalFetch.httpStatus,
        responseHeadersReceived: terminalFetch.responseHeadersReceived,
        bodyCompleted: terminalFetch.bodyCompleted,
        cache: {
          date: terminalFetch.responseDate,
          cacheControl: terminalFetch.responseCacheControl,
          age: terminalFetch.responseCacheAge,
          via: terminalFetch.responseVia,
          etag: terminalFetch.responseEtag,
          lastModified: terminalFetch.responseLastModified,
          xCache: terminalFetch.responseXCache,
        },
        documentCount: Number(terminalFetch.docsReturned || 0),
        returnedWorkIds,
        returnedWorkTitles: terminalFetch.returnedWorkTitles || [],
        missingVsFirstSuccessful: baseline.filter((id) => !returnedWorkIds.includes(id)),
        addedVsFirstSuccessful: returnedWorkIds.filter((id) => !baseline.includes(id)),
        orderChangedVsFirstSuccessful: baseline.length === returnedWorkIds.length && baseline.some((id, index) => returnedWorkIds[index] !== id),
        acceptedAfterSourcePolicy: Number(terminalFetch.acceptedAfterSourcePolicy || 0),
        acceptedWorkIds,
      });
    }
  }

  console.log(JSON.stringify({
    experiment: "OL-F1A Open Library identical-request stability",
    profile: preset.deck,
    rounds: orders.length,
    orderRotated: true,
    attempts,
  }));
}
