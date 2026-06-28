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

function buildMiddleGradesPipelineAudit(sourceResults: SourceResult[], normalized: NormalizedCandidate[], scored: ScoredCandidate[], selected: ScoredCandidate[]): Record<string, unknown> | undefined {
  const openLibrary = sourceResults.find((result) => result.source === "openLibrary");
  if (!openLibrary) return undefined;
  const sourceDiagnostics = openLibrary.diagnostics as SourceDiagnosticV2;
  const rawDocTrace = Array.isArray(sourceDiagnostics.debugMiddleGradesRawDocTrace) ? sourceDiagnostics.debugMiddleGradesRawDocTrace as Record<string, unknown>[] : [];
  const rawTitles = uniqueTitles(sourceDiagnostics.rawTitles || []);
  const normalizedOpenLibrary = normalized.filter((candidate) => candidate.source === "openLibrary");
  const scoredOpenLibrary = scored.filter((candidate) => candidate.source === "openLibrary");
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

  const sourceResults = await Promise.all(searchPlan.sourcePlans.map(async (plan) => {
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

  const normalized = normalizeSourceResults(sourceResults);
  markPipelineObjects(normalized, "normalized", requestId);
  stages.push(stageDiagnostic("normalized", { normalized: normalized.length }));

  const scored = scoreCandidates(normalized, tasteProfile);
  markPipelineObjects(scored, "scored", requestId);
  stages.push(stageDiagnostic("scored", { scored: scored.length }));

  const { selected, rejectedReasons } = selectRecommendations(scored, tasteProfile, session.limit || 10);
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
