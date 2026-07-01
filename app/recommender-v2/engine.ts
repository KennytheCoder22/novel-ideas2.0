import { buildDiagnosticReport, buildRecommendationResultV2, stageDiagnostic } from "./diagnostics";
import { normalizeSourceResults } from "./normalize";
import { buildSearchPlan } from "./searchPlan";
import { scoreCandidates } from "./score";
import { selectRecommendations } from "./select";
import { sourceAdapters } from "./sources";
import { buildTasteProfile } from "./tasteProfile";
import type { NormalizedCandidate, RecommendationResultV2, ScoredCandidate, SourceDiagnosticV2, SourcePlan, SourceResult, SourceStatusV2, SwipeSessionV2 } from "./types";

function nowIso(): string {
  return new Date().toISOString();
}

async function runWithTimeout<T>(timeoutMs: number, task: (signal: AbortSignal) => Promise<T>): Promise<{ value?: T; timedOut: boolean; error?: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return { value: await task(controller.signal), timedOut: false };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return { timedOut: controller.signal.aborted || /timeout|aborted/i.test(message), error: message };
  } finally {
    clearTimeout(timeout);
  }
}

function skippedResult(plan: SourcePlan, reason: string): SourceResult {
  const timestamp = nowIso();
  return {
    source: plan.source,
    status: "skipped",
    rawItems: [],
    diagnostics: {
      source: plan.source,
      status: "skipped",
      planned: plan.enabled,
      attempted: false,
      skippedReason: reason,
      timedOut: false,
      startedAt: timestamp,
      finishedAt: timestamp,
      elapsedMs: 0,
      rawCount: 0,
      queries: plan.intents.map((intent) => intent.query),
    },
  };
}

function failedResult(plan: SourcePlan, status: SourceStatusV2, reason: string, elapsedMs: number): SourceResult {
  const timestamp = nowIso();
  return {
    source: plan.source,
    status,
    rawItems: [],
    diagnostics: {
      source: plan.source,
      status,
      planned: true,
      attempted: true,
      failedReason: reason,
      timedOut: status === "timed_out",
      finishedAt: timestamp,
      elapsedMs,
      rawCount: 0,
      queries: plan.intents.map((intent) => intent.query),
    },
  };
}

function titleOf(value: unknown): string {
  const row = (value || {}) as Record<string, unknown>;
  return String(row.title || row.name || "").trim();
}

function uniqueTitles(values: unknown[], limit = 80): string[] {
  const seen = new Set<string>();
  const titles: string[] = [];
  for (const value of values) {
    const title = typeof value === "string" ? value.trim() : titleOf(value);
    const key = title.toLowerCase();
    if (!title || seen.has(key)) continue;
    seen.add(key);
    titles.push(title);
    if (titles.length >= limit) break;
  }
  return titles;
}

function markPipelineObjects(candidates: Array<NormalizedCandidate | ScoredCandidate>, stage: string, prefix: string): void {
  candidates.forEach((candidate, index) => {
    const existingStages = Array.isArray(candidate.diagnostics?.pipelineObservedStages) ? candidate.diagnostics.pipelineObservedStages.map(String) : [];
    candidate.diagnostics = {
      ...candidate.diagnostics,
      pipelineObjectId: candidate.diagnostics?.pipelineObjectId || `${prefix}:${index}:${candidate.id}`,
      pipelineObservedStages: [...existingStages, stage],
    };
    if (stage === "normalized") candidate.diagnostics.pipelineNormalizedObjectId = candidate.diagnostics.pipelineObjectId;
    if (stage === "scored") candidate.diagnostics.pipelineScoredObjectId = `${prefix}:scored:${index}:${candidate.id}`;
  });
}

function sourceItemKey(item: unknown): string {
  const row = (item || {}) as Record<string, unknown>;
  const title = String(row.title || "").trim().toLowerCase();
  return String(row.sourceId || row.key || row.workKey || `${title}:${Array.isArray(row.authors) ? row.authors[0] : ""}`).toLowerCase();
}

function mergeSourceItems(primary: unknown[], recovery: unknown[]): unknown[] {
  const byKey = new Map<string, unknown>();
  for (const item of [...primary, ...recovery]) {
    const key = sourceItemKey(item);
    if (!key) continue;
    const existing = byKey.get(key) as Record<string, unknown> | undefined;
    const row = item as Record<string, unknown>;
    if (!existing || (row.meaningfulTasteRecovery && !existing.meaningfulTasteRecovery)) byKey.set(key, item);
  }
  return Array.from(byKey.values());
}

function normalizedTokenText(value: unknown): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function expansionEvidenceAnchors(candidate: ScoredCandidate): string[] {
  const buckets = [
    candidate.genres,
    candidate.themes,
    candidate.diagnostics?.documentBackedTasteSignals,
    candidate.diagnostics?.documentOnlyTasteMatch,
    candidate.diagnostics?.routeAlignmentEvidenceFields,
  ].flatMap((value) => Array.isArray(value) ? value : []);
  const text = normalizedTokenText([
    ...buckets.map(String),
    candidate.description,
    JSON.stringify(candidate.raw || {}),
  ].join(" "));
  const anchors = [
    ["robot", /\brobots?\b|\bandroids?\b|\bautomatons?\b/],
    ["science", /\bscience\b|\bscientists?\b|\btechnology\b|\bengineering\b|\bexperiments?\b/],
    ["ocean", /\bocean\b|\bsea\b|\bmarine\b|\bunderwater\b|\bcoastal\b/],
    ["survival", /\bsurvival\b|\bsurvive\b|\bwilderness\b|\brescue\b/],
    ["family", /\bfamily\b|\bsiblings?\b|\bparents?\b/],
    ["superhero", /\bsuperhero(?:es)?\b|\bsuper\s*heroes\b|\bheroes\b|\bheroic\b/],
    ["school", /\bschool\b|\bclassroom\b|\bstudents?\b/],
    ["mystery", /\bmystery\b|\bdetective\b|\bclues?\b|\bsecrets?\b/],
    ["fantasy", /\bfantasy\b|\bmagic(?:al)?\b|\bquest\b|\bdragon\b/],
    ["friendship", /\bfriendship\b|\bfriends?\b/],
    ["adventure", /\badventure\b|\bquest\b|\bjourney\b/],
  ];
  return anchors.filter(([, pattern]) => (pattern as RegExp).test(text)).map(([anchor]) => anchor as string);
}

function repeatedExpansionTitleToken(selected: ScoredCandidate[]): string {
  const counts: Record<string, number> = {};
  for (const candidate of selected) {
    const tokens = new Set(normalizedTokenText(candidate.title).split(" ").filter((token) => /^(magic|magical|funny|humor|humour|adventure|friendship|friends?|witch|school)$/.test(token)));
    for (const token of tokens) counts[token] = Number(counts[token] || 0) + 1;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).find(([, count]) => count >= Math.min(3, selected.length))?.[0] || "";
}

function expansionWeakClusterTitles(selected: ScoredCandidate[], anchorsByTitle: Record<string, string[]>): string[] {
  const repeatedToken = repeatedExpansionTitleToken(selected);
  return selected.filter((candidate) => {
    const titleText = normalizedTokenText(candidate.title);
    const anchors = anchorsByTitle[candidate.title] || [];
    const fallbackish = /fallback|query_only|selected_fallback|default_or_weak/i.test(String(candidate.diagnostics?.finalSelectionReason || candidate.diagnostics?.fallbackDefaultStatus || ""));
    const characterPairRoot = /\b[a-z]{3,}\s+and\s+[a-z]{3,}\b/.test(titleText);
    const repeatedTokenMember = Boolean(repeatedToken && new RegExp(`\\b${repeatedToken}\\b`).test(titleText));
    return repeatedTokenMember || (fallbackish && anchors.length < 3) || (characterPairRoot && anchors.length < 3);
  }).map((candidate) => candidate.title);
}

function expansionFetchRows(diagnostics: SourceDiagnosticV2): Array<{ query: string; status: string; rawCount: number; error?: string }> {
  const attempted = new Set((Array.isArray(diagnostics.meaningfulTasteRecoveryQueriesAttempted) ? diagnostics.meaningfulTasteRecoveryQueriesAttempted : [])
    .map(String)
    .filter(Boolean));
  const fetches = Array.isArray(diagnostics.fetches) ? diagnostics.fetches : [];
  for (const fetch of fetches) {
    const query = String(fetch.query || "");
    if (query) attempted.add(query);
  }
  return Array.from(attempted).map((query) => {
    const matching = fetches.filter((fetch) => String(fetch.query || "") === query);
    const rawCount = matching.reduce((sum, fetch) => sum + Number(fetch.docsReturned || 0), 0);
    const failed = matching.find((fetch) => fetch.failedReason || fetch.timedOut);
    return {
      query,
      status: failed ? (failed.timedOut ? "timed_out" : "error") : rawCount > 0 ? "ok" : "empty",
      rawCount,
      error: failed?.failedReason,
    };
  });
}

function buildMiddleGradesPipelineAudit(sourceResults: SourceResult[], normalized: NormalizedCandidate[], scored: ScoredCandidate[], selected: ScoredCandidate[]): Record<string, unknown> | undefined {
  const openLibrary = sourceResults.find((result) => result.source === "openLibrary");
  if (!openLibrary) return undefined;
  const sourceDiagnostics = openLibrary.diagnostics as SourceDiagnosticV2;
  const rawDocTrace = Array.isArray(sourceDiagnostics.debugMiddleGradesRawDocTrace) ? sourceDiagnostics.debugMiddleGradesRawDocTrace as Record<string, unknown>[] : [];
  const rawTitles = uniqueTitles(sourceDiagnostics.rawTitles || []);
  const normalizedOpenLibrary = normalized.filter((candidate) => candidate.source === "openLibrary");
  const scoredOpenLibrary = scored.filter((candidate) => candidate.source === "openLibrary");
  const openLibraryDocsFetchedAcrossAllQueriesCount = Number(sourceDiagnostics.openLibraryDocsFetchedAcrossAllQueriesCount || sourceDiagnostics.rawApiResultCount || 0);
  const openLibraryDocsEligibleForScoringCount = Number(sourceDiagnostics.openLibraryDocsEligibleForScoringCount || openLibrary.rawItems.length || 0);
  const openLibraryDocsActuallyHandedToScoringCount = Number(sourceDiagnostics.openLibraryDocsActuallyHandedToScoringCount || openLibrary.rawItems.length || 0);
  const middleGradesExpandedPoolHandoffFailed = Boolean(
    sourceDiagnostics.middleGradesDeepDebugActive
    && openLibraryDocsFetchedAcrossAllQueriesCount > 20
    && scoredOpenLibrary.length < 10,
  );
  const middleGradesExpandedPoolFailureReason = middleGradesExpandedPoolHandoffFailed
    ? openLibraryDocsActuallyHandedToScoringCount > scoredOpenLibrary.length
      ? "expanded_pool_discarded_after_source_return_before_or_during_scoring"
      : sourceDiagnostics.openLibraryScoringHandoffSource === "source_final_5" || sourceDiagnostics.openLibraryScoringHandoffLimitedToSourceFinal
        ? "source_handoff_limited_to_source_final_5"
        : openLibraryDocsEligibleForScoringCount < 10
          ? "fetched_docs_rejected_before_scoring_eligibility"
          : "expanded_pool_handoff_under_minimum_scoring_count"
    : undefined;
  const selectedSet = new Set(selected);
  const selectedOpenLibrary = selected.filter((candidate) => candidate.source === "openLibrary");
  const rawRejected = rawDocTrace.filter((row) => row.accepted === false);
  const rawDropByTitle = rawRejected.map((row) => ({
    title: String(row.title || ""),
    query: row.query,
    reason: row.rejectionReason || "raw_doc_rejected_before_normalization",
    stage: row.stage,
  })).filter((row) => row.title);
  const scoredRejected = scoredOpenLibrary
    .filter((candidate) => !selectedSet.has(candidate))
    .map((candidate) => ({
      title: candidate.title,
      reason: candidate.rejectedReasons.length ? candidate.rejectedReasons.join(",") : "not_selected_after_ranking_and_selection",
      score: candidate.score,
      scoreBreakdown: candidate.scoreBreakdown,
      documentOnlyTasteMatch: candidate.diagnostics?.documentOnlyTasteMatch,
      queryTextSignalsRemovedFromTasteMatch: candidate.diagnostics?.queryTextSignalsRemovedFromTasteMatch,
    }));
  const duplicateTitles: string[] = [];
  const seenNormalized = new Set<string>();
  for (const candidate of normalizedOpenLibrary) {
    const key = candidate.title.toLowerCase();
    if (seenNormalized.has(key)) duplicateTitles.push(candidate.title);
    else seenNormalized.add(key);
  }
  const authorityDrops = rawDropByTitle.filter((row) => /artifact|authority|age_shape|inappropriate|local|reference|study|guide|activity|workbook/i.test(String(row.reason)));
  const routeLaneDrops = rawDropByTitle.filter((row) => /route|lane|query_only|missing_document|no_route|age_shape/i.test(String(row.reason)));
  const evidenceDrops = rawDropByTitle.filter((row) => /evidence|weak_doc|title_only|query_only|missing_document/i.test(String(row.reason)));
  const auditStages = [
    {
      stage: "raw_fetch",
      candidateCount: Number(sourceDiagnostics.rawApiResultCount || rawTitles.length || openLibrary.rawItems.length),
      titlesEntering: rawTitles,
      titlesLeaving: rawDropByTitle.map((row) => row.title),
      droppedCandidates: rawDropByTitle,
    },
    {
      stage: "normalized_documents",
      candidateCount: normalizedOpenLibrary.length,
      titlesEntering: uniqueTitles(openLibrary.rawItems),
      titlesLeaving: rawDropByTitle.map((row) => row.title),
      droppedCandidates: rawDropByTitle,
    },
    {
      stage: "post_deduplication",
      candidateCount: seenNormalized.size,
      titlesEntering: uniqueTitles(normalizedOpenLibrary),
      titlesLeaving: duplicateTitles,
      droppedCandidates: duplicateTitles.map((title) => ({ title, reason: "duplicate_normalized_title" })),
    },
    {
      stage: "post_authority_filtering",
      candidateCount: normalizedOpenLibrary.length,
      titlesEntering: uniqueTitles(normalizedOpenLibrary),
      titlesLeaving: authorityDrops.map((row) => row.title),
      droppedCandidates: authorityDrops,
    },
    {
      stage: "post_route_lane_filtering",
      candidateCount: normalizedOpenLibrary.length,
      titlesEntering: uniqueTitles(normalizedOpenLibrary),
      titlesLeaving: routeLaneDrops.map((row) => row.title),
      droppedCandidates: routeLaneDrops,
    },
    {
      stage: "post_evidence_filtering",
      candidateCount: scoredOpenLibrary.length,
      titlesEntering: uniqueTitles(scoredOpenLibrary),
      titlesLeaving: evidenceDrops.map((row) => row.title),
      droppedCandidates: evidenceDrops,
    },
    {
      stage: "post_ranking_eligibility",
      candidateCount: scoredOpenLibrary.length,
      titlesEntering: uniqueTitles(scoredOpenLibrary),
      titlesLeaving: scoredRejected.map((row) => row.title),
      droppedCandidates: scoredRejected,
    },
    {
      stage: "final_selection",
      candidateCount: selectedOpenLibrary.length,
      titlesEntering: uniqueTitles(scoredOpenLibrary),
      titlesLeaving: scoredRejected.map((row) => row.title),
      droppedCandidates: scoredRejected,
    },
  ];
  const stageCounts = auditStages.map((stage) => ({ stage: stage.stage, candidateCount: stage.candidateCount }));
  const largestDrop = stageCounts.slice(1).reduce<{ stage: string; droppedCount: number } | undefined>((largest, stage, index) => {
    const previous = stageCounts[index]?.candidateCount ?? stage.candidateCount;
    const droppedCount = Math.max(0, previous - stage.candidateCount);
    if (!largest || droppedCount > largest.droppedCount) return { stage: stage.stage, droppedCount };
    return largest;
  }, undefined);
  return {
    pipelineAuditAttachedToRecommendationPipeline: true,
    normalizedDocsCount: normalizedOpenLibrary.length,
    rankedDocsLength: scoredOpenLibrary.length,
    convertedDocsAvailableForScoringCount: normalizedOpenLibrary.length,
    scoredCandidateUniverseCount: scoredOpenLibrary.length,
    openLibraryDocsFetchedAcrossAllQueriesCount,
    openLibraryDocsEligibleForScoringCount,
    openLibraryDocsActuallyHandedToScoringCount,
    openLibraryScoringHandoffLimitedToSourceFinal: sourceDiagnostics.openLibraryScoringHandoffLimitedToSourceFinal,
    openLibraryScoringHandoffSource: sourceDiagnostics.openLibraryScoringHandoffSource,
    middleGradesExpandedPoolHandoffFailed,
    middleGradesExpandedPoolFailureReason,
    selectedRecommendationCountObservedByAudit: selected.length,
    selectedOpenLibraryRecommendationCountObservedByAudit: selectedOpenLibrary.length,
    selectedRecommendationObjectTrace: selected.map((candidate) => ({
      title: candidate.title,
      source: candidate.source,
      pipelineObjectId: candidate.diagnostics?.pipelineObjectId,
      pipelineNormalizedObjectId: candidate.diagnostics?.pipelineNormalizedObjectId,
      pipelineScoredObjectId: candidate.diagnostics?.pipelineScoredObjectId,
      pipelineObservedStages: candidate.diagnostics?.pipelineObservedStages,
    })),
    candidateArrayAssignments: [
      { assignment: "normalized = normalizeSourceResults(sourceResults)", count: normalized.length, openLibraryCount: normalizedOpenLibrary.length, reconstructedObjects: true },
      { assignment: "scored = scoreCandidates(normalized, tasteProfile)", count: scored.length, openLibraryCount: scoredOpenLibrary.length, reconstructedObjects: true, carriesNormalizedPipelineIds: scoredOpenLibrary.every((candidate) => Boolean(candidate.diagnostics?.pipelineNormalizedObjectId)) },
      { assignment: "selected = selectRecommendations(scored, tasteProfile, limit).selected", count: selected.length, openLibraryCount: selectedOpenLibrary.length, reconstructedObjects: false, selectedObjectsAreFromScoredArray: selected.every((candidate) => scored.includes(candidate)) },
      { assignment: "returned items = buildRecommendationResultV2(selected, diagnostics)", count: selected.length, openLibraryCount: selectedOpenLibrary.length, reconstructedObjects: false, note: "returned-layer root collapse may remove items after this audit stage but uses the same selected candidate objects" },
    ],
    recommendationsBuiltFromDifferentCollectionThanAudit: selected.length > 0 && scoredOpenLibrary.length === 0 && selectedOpenLibrary.length > 0,
    verifiedOpenLibraryPoolEnteredScoring: normalizedOpenLibrary.length === openLibrary.rawItems.length && scoredOpenLibrary.length === normalizedOpenLibrary.length,
    openLibraryRawItemsEnteringNormalization: openLibrary.rawItems.length,
    openLibraryNormalizedEnteringScoring: normalizedOpenLibrary.length,
    openLibraryScoredEnteringSelection: scoredOpenLibrary.length,
    descriptionDerivedEvidenceContributingToScoring: scoredOpenLibrary
      .filter((candidate) => candidate.description && (Number(candidate.scoreBreakdown.genreFacetMatch || 0) > 0 || Number(candidate.scoreBreakdown.positiveTasteMatch || 0) > 0))
      .map((candidate) => ({ title: candidate.title, description: candidate.description?.slice(0, 160), scoreBreakdown: candidate.scoreBreakdown, matchedSignals: candidate.matchedSignals }))
      .slice(0, 30),
    firstLikelyCollapseStage: largestDrop,
    stages: auditStages,
  };
}

export async function runRecommenderV2(session: SwipeSessionV2): Promise<RecommendationResultV2> {
  const startedAt = nowIso();
  const requestId = session.requestId || `v2-${Date.now()}`;
  const stages = [stageDiagnostic("engine_started", { swipeSignals: session.signals?.length || 0 })];

  const tasteProfile = buildTasteProfile(session);
  stages.push(stageDiagnostic("taste_profile_built", undefined, tasteProfile.diagnostics));
  const middleGradesDeepDebugActive = tasteProfile.ageBand === "preteens" && Boolean(tasteProfile.diagnostics.middleGradesDeepDebugActive);
  if (middleGradesDeepDebugActive) {
    stages.push(stageDiagnostic("middle_grades_deep_debug", undefined, {
      header: "MIDDLE GRADES DEEP DEBUG: ACTIVE",
      activationSource: tasteProfile.diagnostics.middleGradesDeepDebugActivationSource || "none",
      sourceBudgetMs: 180_000,
      perQueryBudgetMs: 20_000,
    }));
  }

  const searchPlan = buildSearchPlan(tasteProfile, session.enabledSources);
  stages.push(stageDiagnostic("search_plan_built", { intents: searchPlan.intents.length, sourcePlans: searchPlan.sourcePlans.length }, searchPlan.diagnostics));

  let sourceResults = await Promise.all(searchPlan.sourcePlans.map(async (plan) => {
    const adapter = sourceAdapters[plan.source];
    if (!plan.enabled) return skippedResult(plan, plan.skippedReason || "source_disabled");
    if (!adapter) return skippedResult(plan, "adapter_not_implemented");
    const sourceStartedAt = Date.now();
    const effectiveTimeoutMs = middleGradesDeepDebugActive && plan.source === "openLibrary" ? Math.max(plan.timeoutMs, 180_000) : plan.timeoutMs;
    const response = await runWithTimeout(effectiveTimeoutMs, (signal) => adapter.search({ ...plan, timeoutMs: effectiveTimeoutMs }, { profile: tasteProfile, signal }));
    const elapsedMs = Date.now() - sourceStartedAt;
    if (response.value) return response.value;
    return failedResult(plan, response.timedOut ? "timed_out" : "failed", response.error || "source_failed", elapsedMs);
  }));
  stages.push(stageDiagnostic("sources_completed", {
    attempted: sourceResults.filter((result) => result.diagnostics.attempted).length,
    raw: sourceResults.reduce((sum, result) => sum + result.rawItems.length, 0),
  }));

  let normalized = normalizeSourceResults(sourceResults);
  let scored = scoreCandidates(normalized, tasteProfile);
  let selection = selectRecommendations(scored, tasteProfile, session.limit || 10);
  let selected = selection.selected;
  let rejectedReasons = selection.rejectedReasons;

  const openLibrarySourceIndex = sourceResults.findIndex((result) => result.source === "openLibrary");
  const openLibrarySourceResult = openLibrarySourceIndex >= 0 ? sourceResults[openLibrarySourceIndex] : undefined;
  const scoredOpenLibraryCount = scored.filter((candidate) => candidate.source === "openLibrary").length;
  const shouldRunPostFinalEligibilityRecovery = middleGradesDeepDebugActive
    && tasteProfile.ageBand === "preteens"
    && Boolean(openLibrarySourceResult?.rawItems.length)
    && scoredOpenLibraryCount > 20
    && selected.length < 5;
  if (shouldRunPostFinalEligibilityRecovery && openLibrarySourceResult) {
    const openLibraryPlan = searchPlan.sourcePlans.find((plan) => plan.source === "openLibrary");
    const adapter = openLibraryPlan ? sourceAdapters[openLibraryPlan.source] : undefined;
    if (openLibraryPlan && adapter) {
      const recoveryProfile = {
        ...tasteProfile,
        diagnostics: {
          ...tasteProfile.diagnostics,
          forceMiddleGradesMeaningfulTasteRecovery: true,
          priorMiddleGradesRecoveryRejectedReasons: selection.rejectedReasons,
          priorMiddleGradesRecoverySourceDiagnostics: openLibrarySourceResult.diagnostics,
        },
      };
      const recoveryTimeoutMs = Math.max(openLibraryPlan.timeoutMs, 180_000);
      const recoveryResponse = await runWithTimeout(recoveryTimeoutMs, (signal) => adapter.search({ ...openLibraryPlan, timeoutMs: recoveryTimeoutMs }, { profile: recoveryProfile, signal }));
      if (recoveryResponse.value) {
        const recoveryResult = recoveryResponse.value;
        // Do not count raw recovery rows as accepted here; the exact final-selection
        // predicate runs after merge/scoring below, and only those selected recovery
        // rows are promoted into accepted recovery diagnostics.
        const recoveryAcceptedTitles: string[] = [];
        const mergedRawItems = mergeSourceItems(openLibrarySourceResult.rawItems, recoveryResult.rawItems);
        sourceResults = sourceResults.map((result, index) => index === openLibrarySourceIndex
          ? {
            ...recoveryResult,
            rawItems: mergedRawItems,
            diagnostics: {
              ...openLibrarySourceResult.diagnostics,
              ...recoveryResult.diagnostics,
              rawCount: mergedRawItems.length,
              normalizedCount: mergedRawItems.length,
              usableRowsAfterFiltering: mergedRawItems.length,
              meaningfulTasteRecoveryTriggered: true,
              meaningfulTasteRecoveryTriggerStage: "post_final_eligibility",
              meaningfulTasteRecoverySkippedReason: undefined,
              postFinalEligibilityUnderfillRecoveryTriggered: true,
              postFinalEligibilityRecoveryAcceptedTitles: recoveryAcceptedTitles,
              postFinalEligibilityRecoveryRejectedByReason: recoveryResult.diagnostics.meaningfulTasteRecoveryRejectedTitlesByReason || {},
            },
          }
          : result);
        normalized = normalizeSourceResults(sourceResults);
        scored = scoreCandidates(normalized, tasteProfile);
        selection = selectRecommendations(scored, tasteProfile, session.limit || 10);
        selected = selection.selected;
        rejectedReasons = selection.rejectedReasons;
        const recoveryDroppedByReason = (selection.rejectedReasons.meaningfulTasteRecoveryDroppedAfterMergeByReason || {}) as Record<string, string[]>;
        const recoverySurvivingFinalCount = selected.length;
        const recoveryDiagnostics = sourceResults[openLibrarySourceIndex]?.diagnostics;
        if (recoveryDiagnostics) {
          const recoveryAnchorByQuery = (recoveryDiagnostics.recoveryQueryAnchorByQuery || {}) as Record<string, string>;
          const recoveryAcceptedFinalByAnchor = selected
            .filter((candidate) => candidate.diagnostics?.meaningfulTasteRecovery || candidate.diagnostics?.scoringHandoffStage === "meaningful_taste_recovery")
            .reduce<Record<string, number>>((acc, candidate) => {
              const query = String(candidate.diagnostics?.queryText || "");
              const anchor = recoveryAnchorByQuery[query] || String(candidate.diagnostics?.queryFamily || "unknown");
              acc[anchor] = Number(acc[anchor] || 0) + 1;
              return acc;
            }, {});
          const actualRecoverySelectedTitles = selected
            .filter((candidate) => candidate.diagnostics?.meaningfulTasteRecovery || candidate.diagnostics?.scoringHandoffStage === "meaningful_taste_recovery")
            .map((candidate) => String(candidate.title || ""))
            .filter(Boolean);
          const predictedRecoverySurvivors = new Set(((recoveryDiagnostics.recoveryAcceptedLikelyFinalSurvivorTitles || []) as string[]).map((title) => String(title).toLowerCase()));
          const actualRecoverySurvivors = new Set(actualRecoverySelectedTitles.map((title) => title.toLowerCase()));
          const droppedRecoveryTitles = Object.values(recoveryDroppedByReason).flat().map((title) => String(title || "")).filter(Boolean);
          const droppedRecoveryTitleSet = new Set(droppedRecoveryTitles.map((title) => title.toLowerCase()));
          const predictedDrops = [...predictedRecoverySurvivors].filter((title) => !actualRecoverySurvivors.has(title));
          recoveryDiagnostics.recoveryFinalSurvivorPredictionMismatch = predictedDrops.length > 0;
          recoveryDiagnostics.postFinalEligibilityRecoveryAcceptedTitles = actualRecoverySelectedTitles;
          recoveryDiagnostics.meaningfulTasteRecoveryAcceptedTitles = actualRecoverySelectedTitles;
          recoveryDiagnostics.meaningfulTasteRecoveryFinalCount = actualRecoverySelectedTitles.length;
          recoveryDiagnostics.recoveryAcceptedLikelyFinalSurvivorTitles = actualRecoverySelectedTitles;
          recoveryDiagnostics.recoveryAcceptedButPredictedDropTitles = Array.from(new Set([...
            (((recoveryDiagnostics.recoveryAcceptedButPredictedDropTitles || []) as string[]).map((title) => String(title || "")).filter(Boolean)),
            ...droppedRecoveryTitles,
          ]));
          recoveryDiagnostics.recoveryEarlyFinalGateRejectedByReason = {
            ...((recoveryDiagnostics.recoveryEarlyFinalGateRejectedByReason || {}) as Record<string, string[]>),
            ...recoveryDroppedByReason,
          };
          recoveryDiagnostics.postFinalEligibilityRecoveryRejectedByReason = {
            ...((recoveryDiagnostics.postFinalEligibilityRecoveryRejectedByReason || {}) as Record<string, string[]>),
            ...recoveryDroppedByReason,
          };
          if (actualRecoverySelectedTitles.some((title) => droppedRecoveryTitleSet.has(title.toLowerCase()))) recoveryDiagnostics.recoveryFinalSurvivorPredictionMismatch = true;
          recoveryDiagnostics.meaningfulTasteRecoverySurvivingFinalCount = recoverySurvivingFinalCount;
          recoveryDiagnostics.meaningfulTasteRecoveryContinuedAfterRejectedMerge = recoverySurvivingFinalCount < 5 && Object.keys(recoveryDroppedByReason).length > 0;
          recoveryDiagnostics.meaningfulTasteRecoveryExhaustedQueries = recoverySurvivingFinalCount < 5 ? recoveryResult.diagnostics.meaningfulTasteRecoveryQueriesAttempted || [] : [];
          recoveryDiagnostics.meaningfulTasteRecoveryRejectedQueryFamilies = Object.keys(recoveryDroppedByReason);
          recoveryDiagnostics.recoverySuccessRequiresFinalEligibility = true;
          recoveryDiagnostics.underfilledAfterMeaningfulTasteRecovery = recoverySurvivingFinalCount < 5;
          recoveryDiagnostics.middleGradesRecoveryFinalShortfallReason = String((selection.rejectedReasons as Record<string, unknown>).middleGradesRecoveryFinalShortfallReason || (recoverySurvivingFinalCount < 5 ? "recovery_final_selection_underfilled" : "none"));
          recoveryDiagnostics.middleGradesRecoveryRejectedReasonCounts = ((selection.rejectedReasons as Record<string, unknown>).middleGradesRecoveryRejectedReasonCounts || {}) as Record<string, number>;
          recoveryDiagnostics.middleGradesRecoveryBestRejectedTitlesByReason = ((selection.rejectedReasons as Record<string, unknown>).middleGradesRecoveryBestRejectedTitlesByReason || {}) as Record<string, string[]>;
          recoveryDiagnostics.middleGradesRecoveryNextBestSelectableTitles = ((selection.rejectedReasons as Record<string, unknown>).middleGradesRecoveryNextBestSelectableTitles || []) as string[];
          recoveryDiagnostics.middleGradesRecoveryCouldHaveReachedFiveIfRelaxedGate = Boolean((selection.rejectedReasons as Record<string, unknown>).middleGradesRecoveryCouldHaveReachedFiveIfRelaxedGate);
          recoveryDiagnostics.middleGradesRecoveryRelaxedGateNeeded = String((selection.rejectedReasons as Record<string, unknown>).middleGradesRecoveryRelaxedGateNeeded || "none");
          recoveryDiagnostics.recoveryQueryFamilyAcceptedFinalCount = recoveryAcceptedFinalByAnchor;
        }
      } else {
        openLibrarySourceResult.diagnostics.meaningfulTasteRecoverySkippedReason = recoveryResponse.timedOut ? "post_final_eligibility_recovery_timed_out" : "post_final_eligibility_recovery_failed";
        openLibrarySourceResult.diagnostics.postFinalEligibilityUnderfillRecoveryTriggered = true;
        openLibrarySourceResult.diagnostics.recoverySuccessRequiresFinalEligibility = true;
        openLibrarySourceResult.diagnostics.underfilledAfterMeaningfulTasteRecovery = true;
        openLibrarySourceResult.diagnostics.middleGradesRecoveryFinalShortfallReason = recoveryResponse.timedOut ? "recovery_query_quality_timed_out" : "recovery_query_quality_failed";
        openLibrarySourceResult.diagnostics.middleGradesRecoveryRejectedReasonCounts = {};
        openLibrarySourceResult.diagnostics.middleGradesRecoveryBestRejectedTitlesByReason = {};
        openLibrarySourceResult.diagnostics.middleGradesRecoveryNextBestSelectableTitles = [];
        openLibrarySourceResult.diagnostics.middleGradesRecoveryCouldHaveReachedFiveIfRelaxedGate = false;
        openLibrarySourceResult.diagnostics.middleGradesRecoveryRelaxedGateNeeded = "none";
      }
    } else {
      openLibrarySourceResult.diagnostics.meaningfulTasteRecoverySkippedReason = "post_final_eligibility_openlibrary_plan_missing";
    }
  } else if (middleGradesDeepDebugActive && tasteProfile.ageBand === "preteens" && openLibrarySourceResult) {
    openLibrarySourceResult.diagnostics.meaningfulTasteRecoverySkippedReason = openLibrarySourceResult.diagnostics.meaningfulTasteRecoverySkippedReason || "post_final_eligibility_not_underfilled";
  }


  const currentOpenLibrarySourceResult = openLibrarySourceIndex >= 0 ? sourceResults[openLibrarySourceIndex] : undefined;
  const currentSelectionDiagnostics = selection.rejectedReasons as Record<string, unknown>;
  const reportedCleanCandidateCount = Number(currentSelectionDiagnostics.finalEligibilityCleanCandidateCount);
  const finalEligibilityCleanCandidateCount = Number.isFinite(reportedCleanCandidateCount)
    ? reportedCleanCandidateCount
    : selected.length;
  const middleGradesCleanCandidateUnderfilled = finalEligibilityCleanCandidateCount < 5
    || currentSelectionDiagnostics.lockQualityPass === false;
  const shouldRunCleanCandidateShortfallExpansion = tasteProfile.ageBand === "preteens"
    && Boolean(currentOpenLibrarySourceResult)
    && middleGradesCleanCandidateUnderfilled;
  if (shouldRunCleanCandidateShortfallExpansion && currentOpenLibrarySourceResult) {
    const openLibraryPlan = searchPlan.sourcePlans.find((plan) => plan.source === "openLibrary");
    const adapter = openLibraryPlan ? sourceAdapters[openLibraryPlan.source] : undefined;
    if (openLibraryPlan && adapter) {
      currentOpenLibrarySourceResult.diagnostics.cleanCandidateShortfallExpansionTriggered = true;
      const expansionProfile = {
        ...tasteProfile,
        diagnostics: {
          ...tasteProfile.diagnostics,
          forceMiddleGradesMeaningfulTasteRecovery: true,
          forceMiddleGradesCleanCandidateShortfallExpansion: true,
          debugMiddleGradesDeepTrace: true,
          middleGradesDeepDebugActive: true,
          priorMiddleGradesRecoveryRejectedReasons: selection.rejectedReasons,
          priorMiddleGradesRecoverySourceDiagnostics: currentOpenLibrarySourceResult.diagnostics,
        },
      };
      const expansionTimeoutMs = Math.max(openLibraryPlan.timeoutMs, 180_000);
      const expansionResponse = await runWithTimeout(expansionTimeoutMs, (signal) => adapter.search({ ...openLibraryPlan, timeoutMs: expansionTimeoutMs }, { profile: expansionProfile, signal }));
      if (expansionResponse.value) {
        const expansionResult = expansionResponse.value;
        const expansionRawItems = expansionResult.rawItems || [];
        const expansionAttemptedQueriesAllFetches = Array.from(new Set([
          ...((Array.isArray(expansionResult.diagnostics.meaningfulTasteRecoveryQueriesAttempted) ? expansionResult.diagnostics.meaningfulTasteRecoveryQueriesAttempted : []) as string[]),
          ...((Array.isArray(expansionResult.diagnostics.fetches) ? expansionResult.diagnostics.fetches : []).map((fetch) => String(fetch.query || "")).filter(Boolean)),
        ]));
        const expansionAttemptedQueries = Array.isArray(expansionResult.diagnostics.queries) && expansionResult.diagnostics.cleanCandidateShortfallExpansionTriggered
          ? (expansionResult.diagnostics.queries as string[])
          : expansionAttemptedQueriesAllFetches;
        const expansionFetchResultsByQuery = expansionFetchRows(expansionResult.diagnostics);
        const expansionRawCount = expansionFetchResultsByQuery.reduce((sum, row) => sum + Number(row.rawCount || 0), 0);
        const expansionKeys = new Set(expansionRawItems.map((item) => sourceItemKey(item)));
        const mergedRawItems = mergeSourceItems(currentOpenLibrarySourceResult.rawItems, expansionRawItems);
        const expansionMergedTitles = expansionRawItems
          .filter((item) => mergedRawItems.some((merged) => sourceItemKey(merged) === sourceItemKey(item)))
          .map((item) => titleOf(item))
          .filter(Boolean);
        const expansionMergeSkippedReason = expansionRawItems.length === 0
          ? "no_expansion_rows_returned_from_source"
          : expansionMergedTitles.length === 0
            ? "all_expansion_rows_duplicate_existing_source_items"
            : undefined;
        const expansionPreCapCandidateCount = Number(expansionResult.diagnostics.expansionPreCapCandidateCount || expansionRawItems.length);
        const expansionPostCapCandidateCount = Number(expansionResult.diagnostics.expansionPostCapCandidateCount || expansionRawItems.length);
        const expansionCapApplied = Boolean(expansionResult.diagnostics.expansionCapApplied ?? (expansionPostCapCandidateCount < expansionPreCapCandidateCount));
        const expansionCapReason = String(expansionResult.diagnostics.expansionCapReason || (expansionCapApplied ? "candidate_pool_limit" : "none"));
        sourceResults = sourceResults.map((result, index) => index === openLibrarySourceIndex
          ? {
            ...expansionResult,
            rawItems: mergedRawItems,
            diagnostics: {
              ...currentOpenLibrarySourceResult.diagnostics,
              ...expansionResult.diagnostics,
              rawCount: mergedRawItems.length,
              normalizedCount: mergedRawItems.length,
              usableRowsAfterFiltering: mergedRawItems.length,
              openLibraryDocsActuallyHandedToScoringCount: Math.max(
                Number(currentOpenLibrarySourceResult.diagnostics.openLibraryDocsActuallyHandedToScoringCount || 0),
                Number(expansionResult.diagnostics.openLibraryDocsActuallyHandedToScoringCount || 0),
              ),
              openLibraryDocsFetchedAcrossAllQueriesCount: Number(currentOpenLibrarySourceResult.diagnostics.openLibraryDocsFetchedAcrossAllQueriesCount || 0)
                + Number(expansionResult.diagnostics.openLibraryDocsFetchedAcrossAllQueriesCount || 0),
              cleanCandidateShortfallExpansionTriggered: true,
              expansionNotTriggeredReason: undefined,
              expansionFetchAttempted: true,
              expansionAttemptedQueries,
              recoveryConcreteFictionQueryUsed: expansionAttemptedQueries.some((query) => /\b(middle grade|children)\b/i.test(query)) || Boolean(currentOpenLibrarySourceResult.diagnostics.recoveryConcreteFictionQueryUsed),
              expansionFetchResultsByQuery,
              expansionRawCount,
              expansionConvertedCount: expansionRawItems.length,
              expansionPreCapCandidateCount,
              expansionPostCapCandidateCount,
              expansionCapApplied,
              expansionCapReason,
              expansionDroppedBeforeScoringByReason: expansionResult.diagnostics.expansionDroppedBeforeScoringByReason,
              expansionDroppedBeforeScoringTitles: expansionResult.diagnostics.expansionDroppedBeforeScoringTitles,
              expansionMergedTitles,
              expansionMergeSkippedReason,
              meaningfulTasteRecoveryTriggered: currentOpenLibrarySourceResult.diagnostics.meaningfulTasteRecoveryTriggered,
              meaningfulTasteRecoveryTriggerStage: currentOpenLibrarySourceResult.diagnostics.meaningfulTasteRecoveryTriggerStage,
              meaningfulTasteRecoverySkippedReason: currentOpenLibrarySourceResult.diagnostics.meaningfulTasteRecoverySkippedReason,
              meaningfulTasteRecoveryQueriesAttempted: currentOpenLibrarySourceResult.diagnostics.meaningfulTasteRecoveryQueriesAttempted,
              meaningfulTasteRecoveryAcceptedTitles: currentOpenLibrarySourceResult.diagnostics.meaningfulTasteRecoveryAcceptedTitles,
              recoveryFamilyScores: currentOpenLibrarySourceResult.diagnostics.recoveryFamilyScores,
              recoveryFamiliesSkippedByAvoidEvidence: currentOpenLibrarySourceResult.diagnostics.recoveryFamiliesSkippedByAvoidEvidence,
              recoveryFamiliesSkippedBySameRunLeakage: currentOpenLibrarySourceResult.diagnostics.recoveryFamiliesSkippedBySameRunLeakage,
              recoveryFamiliesSelectedForExecution: currentOpenLibrarySourceResult.diagnostics.recoveryFamiliesSelectedForExecution,
              recoveryFamilyExecutionOrderReason: currentOpenLibrarySourceResult.diagnostics.recoveryFamilyExecutionOrderReason,
              recoveryFamilyYieldByFamily: currentOpenLibrarySourceResult.diagnostics.recoveryFamilyYieldByFamily,
              recoveryEarlyFinalGateApplied: currentOpenLibrarySourceResult.diagnostics.recoveryEarlyFinalGateApplied,
              recoveryEarlyFinalGateRejectedByReason: currentOpenLibrarySourceResult.diagnostics.recoveryEarlyFinalGateRejectedByReason,
              recoveryAcceptedLikelyFinalSurvivorTitles: currentOpenLibrarySourceResult.diagnostics.recoveryAcceptedLikelyFinalSurvivorTitles,
              recoveryAcceptedButPredictedDropTitles: currentOpenLibrarySourceResult.diagnostics.recoveryAcceptedButPredictedDropTitles,
              recoveryFinalSurvivorPredictionMismatch: currentOpenLibrarySourceResult.diagnostics.recoveryFinalSurvivorPredictionMismatch,
            },
          }
          : result);
        normalized = normalizeSourceResults(sourceResults);
        scored = scoreCandidates(normalized, tasteProfile);
        selection = selectRecommendations(scored, tasteProfile, session.limit || 10);
        selected = selection.selected;
        rejectedReasons = selection.rejectedReasons;
        const preGateExpansionSelectedCandidates = selected.filter((candidate) => expansionKeys.has(sourceItemKey(candidate)));
        const preGateExpansionSelectedTitles = preGateExpansionSelectedCandidates.map((candidate) => candidate.title);
        const expansionSelectedEvidenceAnchorsByTitle = Object.fromEntries(selected.map((candidate) => [candidate.title, expansionEvidenceAnchors(candidate)]));
        const expansionDistinctEvidenceAnchorCount = new Set(Object.values(expansionSelectedEvidenceAnchorsByTitle).flat()).size;
        const repeatedExpansionToken = repeatedExpansionTitleToken(selected);
        const expansionWeakClusterSelectedTitles = expansionWeakClusterTitles(preGateExpansionSelectedCandidates, expansionSelectedEvidenceAnchorsByTitle);
        const expansionLockQualityFailReasons: string[] = [];
        if (selected.length < 5) expansionLockQualityFailReasons.push("final_items_length_not_five");
        if (repeatedExpansionToken) expansionLockQualityFailReasons.push(`repeated_title_token_cluster:${repeatedExpansionToken}`);
        if (expansionDistinctEvidenceAnchorCount < 3) expansionLockQualityFailReasons.push("fewer_than_three_distinct_evidence_anchors");
        if (expansionWeakClusterSelectedTitles.length > 0) expansionLockQualityFailReasons.push("weak_cluster_survivors_selected");
        const expansionLockQualityPass = expansionLockQualityFailReasons.length === 0;
        if (!expansionLockQualityPass && preGateExpansionSelectedCandidates.length > 0) {
          const dropTitles = new Set(preGateExpansionSelectedTitles);
          selected = selected.filter((candidate) => !dropTitles.has(candidate.title));
          rejectedReasons.expansion_lock_quality_removed_weak_cluster_titles = expansionWeakClusterSelectedTitles.length;
          rejectedReasons.expansion_lock_quality_removed_selected_expansion_titles = dropTitles.size;
          (rejectedReasons as Record<string, unknown>).lockQualityPass = false;
          (rejectedReasons as Record<string, unknown>).lockQualityFailReasons = [
            ...((((rejectedReasons as Record<string, unknown>).lockQualityFailReasons as string[] | undefined) || [])),
            ...expansionLockQualityFailReasons,
          ];
        }
        const expansionAcceptedFinalCandidates = expansionLockQualityPass
          ? selected.filter((candidate) => expansionKeys.has(sourceItemKey(candidate)))
          : [];
        const expansionCandidatesAcceptedFinal = expansionAcceptedFinalCandidates.map((candidate) => candidate.title);
        const expansionSelectedTitles = expansionCandidatesAcceptedFinal;
        if (expansionCandidatesAcceptedFinal.length === 0 && preGateExpansionSelectedCandidates.length > 0) {
          (rejectedReasons as Record<string, unknown>).lockQualityPass = false;
          (rejectedReasons as Record<string, unknown>).lockQualityFailReasons = [
            ...((((rejectedReasons as Record<string, unknown>).lockQualityFailReasons as string[] | undefined) || [])),
            "expansion_selected_titles_failed_final_acceptance",
          ];
        }
        const expansionScoredCandidates = scored.filter((candidate) => expansionKeys.has(sourceItemKey(candidate)));
        const expansionScoredScoreByTitle = Object.fromEntries(expansionScoredCandidates.map((candidate) => [candidate.title, Math.round(candidate.score * 1000) / 1000]));
        const expansionCandidatePrimaryRejectionReason = (candidate: ScoredCandidate): string => {
          const reasons = candidate.rejectedReasons.filter((reason) => reason && reason !== "selected");
          if (reasons.includes("middle_grades_query_only_score_cap_applied")) return "middle_grades_query_only_score_cap_applied";
          if (reasons.includes("zero_doc_backed_taste_match")) return "zero_doc_backed_taste_match";
          if (reasons.includes("title_only_route_evidence_missing_support")) return "title_only_route_evidence_missing_support";
          if (reasons.includes("middle_grades_missing_route_or_fiction_evidence")) return "middle_grades_missing_route_or_fiction_evidence";
          if (reasons.includes("non_positive_score")) return "non_positive_score";
          return reasons[0] || (expansionSelectedTitles.includes(candidate.title) ? "accepted_final" : "ranked_below_final_selection");
        };
        const expansionFinalEligibilityRejectionReasonByTitle = Object.fromEntries(
          expansionScoredCandidates
            .filter((candidate) => !expansionSelectedTitles.includes(candidate.title))
            .map((candidate) => [candidate.title, expansionCandidatePrimaryRejectionReason(candidate)]),
        );
        const expansionFinalEligibilityRejectionStage = Object.fromEntries(
          expansionScoredCandidates.map((candidate) => {
            const reason = expansionCandidatePrimaryRejectionReason(candidate);
            const stage = expansionSelectedTitles.includes(candidate.title)
              ? "accepted_final"
              : /query_only_score_cap|zero_doc_backed|title_only|missing_route_or_fiction/.test(reason)
                ? "final_eligibility"
                : /non_positive|humor|artifact|duplicate/.test(reason)
                  ? "safety_or_quality_filter"
                  : "ranking_or_lock_quality";
            return [candidate.title, stage];
          }),
        );
        const expansionWouldPassIfQueryOnlyCapIgnoredTitles = expansionScoredCandidates
          .filter((candidate) => candidate.rejectedReasons.includes("middle_grades_query_only_score_cap_applied") && expansionEvidenceAnchors(candidate).length >= 2 && candidate.score >= 0)
          .map((candidate) => candidate.title);
        const expansionRouteFictionSupportButRejectedTitles = expansionScoredCandidates
          .filter((candidate) => !expansionSelectedTitles.includes(candidate.title))
          .filter((candidate) => expansionEvidenceAnchors(candidate).length >= 2 && candidate.score >= 0)
          .filter((candidate) => !candidate.rejectedReasons.some((reason) => /artifact|adult_or_ya|humor_keyword|duplicate|non_positive/.test(reason)))
          .map((candidate) => candidate.title);
        const expansionCandidatesSurvivedFiltersCount = expansionScoredCandidates
          .filter((candidate) => candidate.score >= 0)
          .filter((candidate) => !candidate.rejectedReasons.some((reason) => /artifact|adult_or_ya|humor_keyword|duplicate|non_positive|query_only_score_cap/.test(reason)))
          .length;
        const expansionFinalEligibilityEvidenceAuditByTitle = Object.fromEntries(expansionScoredCandidates.map((candidate) => {
          const raw = (candidate.raw || {}) as Record<string, unknown>;
          const rawList = (value: unknown): string[] => Array.isArray(value) ? value.map(String).filter(Boolean) : typeof value === "string" && value.trim() ? [value.trim()] : [];
          const rawDescription = typeof raw.description === "string"
            ? raw.description
            : typeof (raw.description as { value?: unknown } | undefined)?.value === "string"
              ? String((raw.description as { value: string }).value)
              : typeof raw.summary === "string"
                ? raw.summary
                : "";
          const rawFirstSentence = rawList(raw.first_sentence);
          const rawSubjects = Array.from(new Set([
            ...rawList(raw.subject),
            ...rawList(raw.subjects),
            ...rawList(raw.subject_facet),
            ...rawList(raw.subject_key),
          ]));
          const rawText = normalizedTokenText(JSON.stringify(candidate.raw || {}));
          const routeEvidenceFields = Array.isArray(candidate.diagnostics?.routeAlignmentEvidenceFields)
            ? candidate.diagnostics.routeAlignmentEvidenceFields.map(String)
            : [];
          const documentBackedTasteSignals = Array.from(new Set([
            ...(Array.isArray(candidate.diagnostics?.documentBackedTasteSignals) ? candidate.diagnostics.documentBackedTasteSignals.map(String) : []),
            ...(Array.isArray(candidate.diagnostics?.documentOnlyTasteMatch) ? candidate.diagnostics.documentOnlyTasteMatch.map(String) : []),
          ]));
          const hasFictionAgeEvidence = /\b(middle grade|middle school|juvenile|children'?s|chapter book|ages?\s*(?:8|9|10|11|12)|grades?\s*(?:3|4|5|6|7))\b/.test(rawText)
            && /\b(fiction|novel|story|chapter book|adventure|fantasy|mystery|humor|humour|comedy)\b/.test(rawText);
          const missingEvidenceFieldOrFailedPredicate = routeEvidenceFields.filter((field) => !["title", "subtitle"].includes(field)).length === 0
            ? documentBackedTasteSignals.length === 0
              ? "missing_non_title_route_evidence_and_document_backed_taste_signal"
              : "missing_non_title_route_evidence"
            : !hasFictionAgeEvidence
              ? "missing_middle_grade_fiction_age_metadata"
              : candidate.rejectedReasons.includes("middle_grades_query_only_score_cap_applied")
                ? "query_only_score_cap_applied"
                : expansionCandidatePrimaryRejectionReason(candidate);
          const queryOnlyCapExplanation = candidate.rejectedReasons.includes("middle_grades_query_only_score_cap_applied")
            ? routeEvidenceFields.length === 0
              ? "source_query_matched_route_family_but_no_openlibrary_subject_description_or_first_sentence_route_evidence_matched"
              : documentBackedTasteSignals.length === 0
                ? "route_evidence_found_but_no_profile_taste_signal_matched_openlibrary_metadata"
                : "route_or_taste_metadata_was_present_but_final_query_only_cap_remained_applied"
            : undefined;
          return [candidate.title, {
            score: Math.round(candidate.score * 1000) / 1000,
            sourceQuery: String(candidate.diagnostics?.queryText || ""),
            matchedRouteFamily: String(candidate.diagnostics?.queryFamily || candidate.diagnostics?.routingReason || ""),
            rawSubjects,
            rawFirstSentence,
            rawDescription,
            routeEvidenceFields,
            documentBackedTasteSignals,
            hasFictionAgeEvidence,
            missingEvidenceFieldOrFailedPredicate,
            queryOnlyCapExplanation,
            rejectedReasons: candidate.rejectedReasons,
          }];
        }));
        const expansionCandidatesRejectedByReason = expansionScoredCandidates
          .filter((candidate) => !expansionSelectedTitles.includes(candidate.title))
          .reduce<Record<string, string[]>>((acc, candidate) => {
            const reason = expansionCandidatePrimaryRejectionReason(candidate);
            acc[reason] = [...(acc[reason] || []), candidate.title];
            return acc;
          }, {});
        const expansionSelectedRejectedByReason = preGateExpansionSelectedCandidates
          .filter((candidate) => !selected.some((row) => row.title === candidate.title))
          .reduce<Record<string, string[]>>((acc, candidate) => {
            const reason = expansionWeakClusterSelectedTitles.includes(candidate.title)
              ? "expansion_lock_quality_weak_cluster"
              : candidate.rejectedReasons.find(Boolean) || "expansion_lock_quality_removed";
            acc[reason] = [...(acc[reason] || []), candidate.title];
            return acc;
          }, {});
        const expansionFetchFailureReason = expansionRawCount === 0
          ? "expansion_fetches_returned_zero_raw_docs"
          : expansionRawItems.length === 0
            ? "expansion_source_filters_converted_zero_rows"
            : expansionScoredCandidates.length === 0
              ? "expansion_merged_rows_did_not_enter_scoring"
              : undefined;
        const expansionDiagnostics = sourceResults[openLibrarySourceIndex]?.diagnostics;
        if (expansionDiagnostics) {
          expansionDiagnostics.cleanCandidateShortfallExpansionTriggered = true;
          expansionDiagnostics.expansionNotTriggeredReason = undefined;
          expansionDiagnostics.expansionFetchAttempted = true;
          expansionDiagnostics.expansionAttemptedQueries = expansionAttemptedQueries;
          expansionDiagnostics.expansionFetchResultsByQuery = expansionFetchResultsByQuery;
          expansionDiagnostics.expansionRawCount = expansionRawCount;
          expansionDiagnostics.expansionConvertedCount = expansionRawItems.length;
          expansionDiagnostics.expansionMergedCandidateCount = expansionScoredCandidates.length;
          expansionDiagnostics.expansionMergedTitles = expansionMergedTitles;
          expansionDiagnostics.expansionPreCapCandidateCount = expansionPreCapCandidateCount;
          expansionDiagnostics.expansionPostCapCandidateCount = expansionPostCapCandidateCount;
          expansionDiagnostics.expansionCapApplied = expansionCapApplied;
          expansionDiagnostics.expansionCapReason = expansionCapReason;
          expansionDiagnostics.expansionDroppedBeforeScoringByReason = expansionResult.diagnostics.expansionDroppedBeforeScoringByReason || {};
          expansionDiagnostics.expansionDroppedBeforeScoringTitles = expansionResult.diagnostics.expansionDroppedBeforeScoringTitles || {};
          expansionDiagnostics.expansionScoredScoreByTitle = expansionScoredScoreByTitle;
          expansionDiagnostics.expansionFinalEligibilityRejectionStage = expansionFinalEligibilityRejectionStage;
          expansionDiagnostics.expansionFinalEligibilityRejectionReasonByTitle = expansionFinalEligibilityRejectionReasonByTitle;
          expansionDiagnostics.expansionWouldPassIfQueryOnlyCapIgnoredTitles = expansionWouldPassIfQueryOnlyCapIgnoredTitles;
          expansionDiagnostics.expansionRouteFictionSupportButRejectedTitles = expansionRouteFictionSupportButRejectedTitles;
          expansionDiagnostics.expansionCandidatesSurvivedFiltersCount = expansionCandidatesSurvivedFiltersCount;
          expansionDiagnostics.expansionFinalEligibilityEvidenceAuditByTitle = expansionFinalEligibilityEvidenceAuditByTitle;
          expansionDiagnostics.expansionFetchFailureReason = expansionFetchFailureReason;
          expansionDiagnostics.expansionMergeSkippedReason = expansionMergeSkippedReason || (expansionScoredCandidates.length === 0 && expansionRawItems.length > 0 ? "merged_rows_missing_from_scoring_after_normalization" : undefined);
          expansionDiagnostics.expansionCandidatesEnteredScoringCount = expansionScoredCandidates.length;
          expansionDiagnostics.expansionCleanEligibleCount = expansionCandidatesAcceptedFinal.length;
          expansionDiagnostics.finalEligibilityGateApplied = true;
          expansionDiagnostics.expansionCandidatesAcceptedFinal = expansionCandidatesAcceptedFinal;
          expansionDiagnostics.expansionSelectedTitles = expansionSelectedTitles;
          expansionDiagnostics.expansionCandidatesRejectedByReason = expansionCandidatesRejectedByReason;
          expansionDiagnostics.expansionSelectedRejectedByReason = expansionSelectedRejectedByReason;
          expansionDiagnostics.expansionLockQualityPass = expansionLockQualityPass;
          expansionDiagnostics.expansionLockQualityFailReasons = expansionLockQualityFailReasons;
          expansionDiagnostics.expansionSelectedEvidenceAnchorsByTitle = expansionSelectedEvidenceAnchorsByTitle;
          expansionDiagnostics.expansionDistinctEvidenceAnchorCount = expansionDistinctEvidenceAnchorCount;
          expansionDiagnostics.expansionWeakClusterSelectedTitles = expansionWeakClusterSelectedTitles;
          expansionDiagnostics.expansionContinuedAfterWeakCluster = !expansionLockQualityPass && expansionWeakClusterSelectedTitles.length > 0;
          expansionDiagnostics.underfilledAfterMeaningfulTasteRecovery = selected.length < 5;
          expansionDiagnostics.middleGradesRecoveryFinalShortfallReason = selected.length < 5
            ? String((selection.rejectedReasons as Record<string, unknown>).middleGradesRecoveryFinalShortfallReason || "clean_candidate_shortfall_expansion_underfilled")
            : "none";
        }
      } else {
        currentOpenLibrarySourceResult.diagnostics.cleanCandidateShortfallExpansionTriggered = true;
        currentOpenLibrarySourceResult.diagnostics.expansionNotTriggeredReason = undefined;
        currentOpenLibrarySourceResult.diagnostics.expansionFetchAttempted = true;
        currentOpenLibrarySourceResult.diagnostics.expansionAttemptedQueries = [];
        currentOpenLibrarySourceResult.diagnostics.expansionFetchResultsByQuery = [];
        currentOpenLibrarySourceResult.diagnostics.expansionRawCount = 0;
        currentOpenLibrarySourceResult.diagnostics.expansionConvertedCount = 0;
        currentOpenLibrarySourceResult.diagnostics.expansionMergedCandidateCount = 0;
        currentOpenLibrarySourceResult.diagnostics.expansionMergedTitles = [];
        currentOpenLibrarySourceResult.diagnostics.expansionFetchFailureReason = expansionResponse.timedOut ? "clean_candidate_shortfall_expansion_timed_out" : "clean_candidate_shortfall_expansion_failed";
        currentOpenLibrarySourceResult.diagnostics.expansionMergeSkippedReason = "expansion_fetch_failed_before_merge";
        currentOpenLibrarySourceResult.diagnostics.expansionCandidatesEnteredScoringCount = 0;
        currentOpenLibrarySourceResult.diagnostics.expansionCleanEligibleCount = 0;
        currentOpenLibrarySourceResult.diagnostics.finalEligibilityGateApplied = false;
        currentOpenLibrarySourceResult.diagnostics.expansionCandidatesAcceptedFinal = [];
        currentOpenLibrarySourceResult.diagnostics.expansionSelectedTitles = [];
        currentOpenLibrarySourceResult.diagnostics.expansionCandidatesRejectedByReason = {};
        currentOpenLibrarySourceResult.diagnostics.expansionSelectedRejectedByReason = {};
        currentOpenLibrarySourceResult.diagnostics.middleGradesRecoveryFinalShortfallReason = expansionResponse.timedOut ? "clean_candidate_shortfall_expansion_timed_out" : "clean_candidate_shortfall_expansion_failed";
      }
    } else {
      currentOpenLibrarySourceResult.diagnostics.cleanCandidateShortfallExpansionTriggered = false;
      currentOpenLibrarySourceResult.diagnostics.expansionNotTriggeredReason = "missing_openlibrary_expansion_plan_or_adapter";
      currentOpenLibrarySourceResult.diagnostics.expansionFetchAttempted = false;
      currentOpenLibrarySourceResult.diagnostics.expansionAttemptedQueries = [];
      currentOpenLibrarySourceResult.diagnostics.expansionFetchResultsByQuery = [];
      currentOpenLibrarySourceResult.diagnostics.expansionRawCount = 0;
      currentOpenLibrarySourceResult.diagnostics.expansionConvertedCount = 0;
      currentOpenLibrarySourceResult.diagnostics.expansionMergedCandidateCount = 0;
      currentOpenLibrarySourceResult.diagnostics.expansionMergedTitles = [];
      currentOpenLibrarySourceResult.diagnostics.expansionFetchFailureReason = undefined;
      currentOpenLibrarySourceResult.diagnostics.expansionMergeSkippedReason = "missing_openlibrary_expansion_plan_or_adapter";
      currentOpenLibrarySourceResult.diagnostics.expansionCandidatesEnteredScoringCount = 0;
      currentOpenLibrarySourceResult.diagnostics.expansionCleanEligibleCount = 0;
      currentOpenLibrarySourceResult.diagnostics.finalEligibilityGateApplied = false;
      currentOpenLibrarySourceResult.diagnostics.expansionCandidatesAcceptedFinal = [];
      currentOpenLibrarySourceResult.diagnostics.expansionSelectedTitles = [];
      currentOpenLibrarySourceResult.diagnostics.expansionCandidatesRejectedByReason = {};
      currentOpenLibrarySourceResult.diagnostics.expansionSelectedRejectedByReason = {};
    }
  } else if (tasteProfile.ageBand === "preteens" && currentOpenLibrarySourceResult) {
    currentOpenLibrarySourceResult.diagnostics.cleanCandidateShortfallExpansionTriggered = false;
    currentOpenLibrarySourceResult.diagnostics.expansionNotTriggeredReason = middleGradesCleanCandidateUnderfilled
      ? "openlibrary_source_unavailable"
      : "final_eligibility_not_underfilled";
    currentOpenLibrarySourceResult.diagnostics.expansionFetchAttempted = false;
    currentOpenLibrarySourceResult.diagnostics.expansionAttemptedQueries = [];
    currentOpenLibrarySourceResult.diagnostics.expansionFetchResultsByQuery = [];
    currentOpenLibrarySourceResult.diagnostics.expansionRawCount = 0;
    currentOpenLibrarySourceResult.diagnostics.expansionConvertedCount = 0;
    currentOpenLibrarySourceResult.diagnostics.expansionMergedCandidateCount = 0;
    currentOpenLibrarySourceResult.diagnostics.expansionMergedTitles = [];
    currentOpenLibrarySourceResult.diagnostics.expansionFetchFailureReason = undefined;
    currentOpenLibrarySourceResult.diagnostics.expansionMergeSkippedReason = "expansion_not_triggered";
    currentOpenLibrarySourceResult.diagnostics.expansionCandidatesEnteredScoringCount = 0;
    currentOpenLibrarySourceResult.diagnostics.expansionCleanEligibleCount = 0;
    currentOpenLibrarySourceResult.diagnostics.finalEligibilityGateApplied = false;
    currentOpenLibrarySourceResult.diagnostics.expansionCandidatesAcceptedFinal = [];
    currentOpenLibrarySourceResult.diagnostics.expansionSelectedTitles = [];
    currentOpenLibrarySourceResult.diagnostics.expansionCandidatesRejectedByReason = {};
    currentOpenLibrarySourceResult.diagnostics.expansionSelectedRejectedByReason = {};
  }

  markPipelineObjects(normalized, "normalized", requestId);
  stages.push(stageDiagnostic("normalized", { normalized: normalized.length }));

  markPipelineObjects(scored, "scored", requestId);
  stages.push(stageDiagnostic("scored", { scored: scored.length }));

  markPipelineObjects(selected, "selected", requestId);
  stages.push(stageDiagnostic("selected", { selected: selected.length }, { rejectedReasons }));
  if (middleGradesDeepDebugActive) {
    const audit = buildMiddleGradesPipelineAudit(sourceResults, normalized, scored, selected);
    if (audit) stages.push(stageDiagnostic("middle_grades_candidate_pool_audit", undefined, audit));
  }

  const finishedAt = nowIso();
  const diagnostics = buildDiagnosticReport({
    requestId,
    startedAt,
    finishedAt,
    stages,
    tasteProfile,
    searchPlan,
    sources: sourceResults.map((result) => result.diagnostics),
    rejectedReasons,
    finalItems: selected,
  });
  return buildRecommendationResultV2(selected, diagnostics);
}

export async function runRecommenderV2Debug(): Promise<RecommendationResultV2> {
  return runRecommenderV2({
    requestId: "debug-mock-v2",
    ageBand: "teens",
    limit: 5,
    enabledSources: { mock: true },
    signals: [
      { action: "like", title: "Mock Gothic Mystery", genres: ["mystery"], tones: ["atmospheric"], themes: ["secrets"], characterDynamics: ["found family"], format: "book", source: "mock" },
      { action: "dislike", title: "Mock Grimdark", tones: ["bleak"], themes: ["nihilism"], format: "book", source: "mock" },
    ],
  });
}
