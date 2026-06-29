export type AgeBandV2 = "kids" | "preteens" | "teens" | "adult";

export type SourceIdV2 = "mock" | "googleBooks" | "openLibrary" | "kitsu" | "comicVine" | "localLibrary" | "nyt";

export type SourceStatusV2 = "planned" | "attempted" | "skipped" | "succeeded" | "failed" | "timed_out" | "empty";

export type CandidateFormatV2 = "book" | "manga" | "comic" | "graphicNovel" | "anime" | "unknown";

export interface SwipeSignalV2 {
  id?: string;
  title?: string;
  action: "like" | "dislike" | "skip";
  source?: string;
  format?: CandidateFormatV2;
  tags?: string[];
  genres?: string[];
  tones?: string[];
  themes?: string[];
  characterDynamics?: string[];
  maturity?: AgeBandV2 | string;
  weight?: number;
}

export interface SwipeSessionV2 {
  deckKey?: string;
  ageBand: AgeBandV2;
  signals: SwipeSignalV2[];
  limit?: number;
  enabledSources?: Partial<Record<SourceIdV2, boolean>>;
  requestId?: string;
  debugMiddleGradesDeepTrace?: boolean;
  debugMiddleGradesNoTimeouts?: boolean;
  diagnostics?: Record<string, unknown>;
}

export interface WeightedSignalV2 {
  value: string;
  weight: number;
  evidence: string[];
}

export interface TasteProfile {
  ageBand: AgeBandV2;
  tone: WeightedSignalV2[];
  pacing: WeightedSignalV2[];
  genreFamily: WeightedSignalV2[];
  themes: WeightedSignalV2[];
  characterDynamics: WeightedSignalV2[];
  formatPreference: WeightedSignalV2[];
  maturityBand: AgeBandV2;
  avoidSignals: WeightedSignalV2[];
  sourceHints: SourceIdV2[];
  diagnostics: Record<string, unknown>;
}

export interface SearchIntentV2 {
  id: string;
  query: string;
  facets: string[];
  priority: number;
  rationale: string[];
}

export interface SourcePlan {
  source: SourceIdV2;
  enabled: boolean;
  status: SourceStatusV2;
  intents: SearchIntentV2[];
  skippedReason?: string;
  timeoutMs: number;
}

export interface SearchPlan {
  intents: SearchIntentV2[];
  sourcePlans: SourcePlan[];
  diagnostics: Record<string, unknown>;
}


export interface SourceFetchDiagnosticV2 {
  query: string;
  fetchStartedAt?: string;
  fetchFinishedAt?: string;
  attemptNumber?: number;
  requestStart?: string;
  requestEnd?: string;
  abortReason?: string;
  abortOrigin?: "local_timeout" | "router_or_parent" | "parent_already_aborted" | "fetch_abort_without_local_signal" | "unknown";
  abortControllerId?: string;
  abortControllerCreatedAt?: string;
  abortControllerAbortedAt?: string;
  abortControllerLifetimeMs?: number;
  abortControllerSharedWithPreviousFetch?: boolean;
  parentSignalPresent?: boolean;
  parentSignalAbortedAtStart?: boolean;
  parentSignalAbortedAtEnd?: boolean;
  timeoutBudgetRemainingAtFetchStartMs?: number;
  sourceBudgetRemainingAtFetchStartMs?: number;
  responseHeadersReceived?: string;
  bodyStarted?: string;
  bodyCompleted?: string;
  clientTimeoutMs?: number;
  proxyRetryWindowEnabled?: boolean;
  elapsedMs?: number;
  timedOut: boolean;
  httpStatus?: number;
  fetchPath?: "direct" | "proxy";
  proxyAttempts?: number;
  responseBodyPrefix?: string;
  failedReason?: string;
  docsReturned?: number;
  firstReturnedTitles?: string[];
  responseShape?: "docs_array" | "missing_docs_array";
  diagnosticOnly?: boolean;
  originalPlannedQuery?: string;
  queryCascadeIndex?: number;
  queryFamily?: string;
  facets?: string[];
  firstRunFetchTimeout?: boolean;
  retryAttempted?: boolean;
  retrySucceeded?: boolean;
  proxyColdStartSuspected?: boolean;
}

export interface SourceDiagnosticV2 {
  source: SourceIdV2;
  status: SourceStatusV2;
  planned: boolean;
  attempted: boolean;
  skippedReason?: string;
  failedReason?: string;
  emptyReason?: string;
  openLibraryProbeRan?: boolean;
  timedOut: boolean;
  startedAt?: string;
  finishedAt?: string;
  elapsedMs?: number;
  rawCount: number;
  normalizedCount?: number;
  queries: string[];
  rawTitles?: string[];
  firstReturnedTitles?: string[];
  rawApiResultCount?: number;
  droppedBeforeDocCount?: number;
  dropReasons?: Record<string, number>;
  openLibraryTopUpRan?: boolean;
  openLibraryTopUpTarget?: number;
  openLibraryFallbackQueriesExhausted?: boolean;
  usableRowsAfterFiltering?: number;
  openLibraryQueryRouting?: Record<string, unknown>;
  openLibraryAgeProfile?: string;
  openLibraryProfileLabel?: string;
  firstRunFetchTimeout?: boolean;
  retryAttempted?: boolean;
  retrySucceeded?: boolean;
  proxyColdStartSuspected?: boolean;
  fetches?: SourceFetchDiagnosticV2[];
  rawItemPreview?: Record<string, unknown>[];
  artifactSuppressedTitles?: string[];
  seriesSuppressedTitles?: string[];
  sameRootCollectionCollapsedTitles?: string[];
  selectedUniqueRootCount?: number;
  duplicateRootBlockedReturnedTitle?: string[];
  middleGradesAgeShapeDiagnostics?: Record<string, unknown>;
  middleGradesDelayedRetryAttempted?: boolean;
  middleGradesDelayedRetrySkippedReason?: string;
  middleGradesDelayedRetryTimeoutMs?: number;
  middleGradesTimeoutBudgetRemainingBeforeRetry?: number;
  perQueryBudgetReserved?: Record<string, number>;
  skippedRemainingQueriesDueToBudgetExhaustion?: boolean;
  plannedSpecificQueriesUnattemptedAtTimeout?: string[];
  middleGradesRouteAlignedSuccessCount?: number;
  middleGradesAntiZeroFallbackSuccessCount?: number;
  middleGradesFallbackOnlySlate?: boolean;
  middleGradesAntiZeroFallbackShapedQuery?: string;
  middleGradesAntiZeroFallbackShapingSignals?: string[];
  fallbackCandidateQueries?: string[];
  fallbackQueryScores?: Record<string, number>;
  fallbackQueryReliability?: Record<string, number>;
  positiveEvidenceByFallbackQuery?: Record<string, string[]>;
  avoidEvidenceByFallbackQuery?: Record<string, string[]>;
  selectedFallbackQueryReason?: string;
  whyHigherTasteFallbackLost?: string;
  whySelectedFallbackTimedOutOrSucceeded?: string[];
  fallbackAttemptOrder?: string[];
  remainingBudgetBeforeEachFallback?: Record<string, number>;
  lockQualityStatus?: "route_aligned_success" | "mixed_recovery_success" | "fallback_only_success" | "fallback_only_low_confidence" | "zero_result_failure";
  whyFallbackOnlyAcceptedAsFinal?: string;
  routeAlignedRecoveryAttemptedAfterFallback?: boolean;
  routeAlignedRecoverySkippedReason?: string;
  slateGenreFacetMatchAverage?: number;
  fallbackSlateSpecificityScore?: number;
  genericDefaultSlateDetected?: boolean;
  genericDefaultSlateReason?: string;
  strongerSignalDroppedFromFallbackQuery?: string;
  underfillSafeRecoveryAttempted?: boolean;
  underfillSafeRecoveryQueries?: string[];
  underfillSafeRecoveryAcceptedCount?: number;
  underfillSafeRecoverySkippedReason?: string;
  profileSpecificQueriesAttempted?: string[];
  profileSpecificQueriesTimedOut?: number;
  profileSpecificQueriesAcceptedCount?: number;
  targetedQueryBatchByRoute?: string[];
  targetedQueryFamilyScoreByFamily?: Record<string, number>;
  targetedQueryFamilyLikedEvidenceByFamily?: Record<string, string[]>;
  targetedQueryFamilySkipEvidenceByFamily?: Record<string, string[]>;
  targetedQueryFamilyAvoidEvidenceByFamily?: Record<string, string[]>;
  firstBatchChosenBecause?: string;
  skipOnlyFamilyPromotedToFirstBatch?: boolean;
  firstBatchSkipOnlyFamilyBlocked?: boolean;
  skippedFantasyPromotedToFirstBatch?: boolean;
  likedEvidenceFirstBatchFamilies?: string[];
  likedEvidenceQueryFamiliesAttemptedBeforeSkipOnlyRecovery?: string[];
  docsReturnedButAllDropped?: number;
  allDroppedContinuationQuery?: string[];
  reliableVariantAttempted?: string[];
  reliableVariantAcceptedCount?: number;
  firstBatchSpecificQueryTimedOutCount?: number;
  firstBatchReliableVariantUsed?: boolean;
  middleGradesFetchMode?: "sequential" | "parallel" | "staggered";
  firstBatchParallelQueries?: string[];
  firstBatchParallelAcceptedCount?: number;
  repeatedProxyAbortCount?: number;
  directFallbackAttemptedAfterProxyAbort?: boolean;
  proxyTimedOutThenDirectAttemptedSameQuery?: boolean;
  directFetchReturnedRawButAllRejected?: number;
  sameFamilyContinuationAfterAllRejected?: boolean;
  sameFamilyContinuationQueriesAttempted?: string[];
  recoverySkippedInsufficientBudget?: boolean;
  minimumViableRecoveryBudgetMs?: number;
  actualRemainingBudgetBeforeRecoveryMs?: number;
  targetedQueriesAttempted?: string[];
  targetedQueriesAcceptedCount?: number;
  targetedQueriesRejectedByReason?: Record<string, number>;
  broadFallbackStartedBeforeTargetedExhaustion?: boolean;
  underfilledDespiteTargetedQueriesRemaining?: boolean;
  underfilledAtFourDespiteAlignedCandidates?: boolean;
  underfillRecoveryAttemptedAfterFour?: boolean;
  underfillRecoveryAcceptedAfterFour?: number;
  underfilledWithSameFamilyQueriesRemaining?: boolean;
  rawRejectedButContinuationSkippedReason?: string;
  underfilledAfterDirectUsableDocs?: boolean;
  directUsableDocsButRecoveryContinued?: boolean;
  underfillStopReasonDetailed?: string;
  finalUnderfillTargetedExhaustionReason?: string;
  fallbackStartedOnlyAfterProfileQueriesExhausted?: boolean;
  lockQualityRetryAttempted?: boolean;
  lockQualityRetryQueries?: string[];
  lockQualityRetryAcceptedCount?: number;
  finalReturnedDespiteLockQualityFailReason?: string;
  evidenceAwareRecoveryQueries?: string[];
  evidenceAwareRecoveryRemainingQueries?: string[];
  evidenceAwareRecoveryAttempted?: boolean;
  evidenceAwareRecoveryAcceptedCount?: number;
  openLibraryCandidatePoolBeforeEarlyCap?: number;
  openLibraryCandidatePoolAfterEarlyCap?: number;
  earlyCandidateCapApplied?: boolean;
  earlyCandidateCapSuppressedTitles?: string[];
  mediumStrongCandidatesSeenAcrossAllQueries?: string[];
  weakFallbackCandidatesHeldBack?: string[];
  openLibraryDocsFetchedAcrossAllQueriesCount?: number;
  openLibraryDocsEligibleForScoringCount?: number;
  openLibraryDocsActuallyHandedToScoringCount?: number;
  openLibraryScoringHandoffLimitedToSourceFinal?: boolean;
  openLibraryScoringHandoffSuppressedTitles?: string[];
  openLibraryScoringHandoffSource?: "source_final_5" | "expanded_debug_pool" | "production_pool";
  middleGradesExpandedPoolHandoffFailed?: boolean;
  middleGradesExpandedPoolFailureReason?: string;
  mediumStrongEvidenceTargetCount?: number;
  mediumStrongEvidenceSearchContinued?: boolean;
  mediumStrongEvidenceQueriesAttempted?: string[];
  mediumStrongEvidenceAcceptedTitles?: string[];
  weakEvidenceFinalizedBecause?: string;
  weakEvidenceReturnedOnlyAfterEvidenceSearchExhausted?: boolean;
  meaningfulTasteRecoveryTriggered?: boolean;
  meaningfulTasteRecoveryTriggerStage?: "source" | "post_final_eligibility";
  meaningfulTasteRecoverySkippedReason?: string;
  meaningfulTasteRecoveryQueriesAttempted?: string[];
  meaningfulTasteRecoveryAcceptedTitles?: string[];
  meaningfulTasteRecoveryRejectedTitlesByReason?: Record<string, string[]>;
  meaningfulTasteRecoveryFinalCount?: number;
  underfilledAfterMeaningfulTasteRecovery?: boolean;
  postFinalEligibilityUnderfillRecoveryTriggered?: boolean;
  postFinalEligibilityRecoveryAcceptedTitles?: string[];
  postFinalEligibilityRecoveryRejectedByReason?: Record<string, string[]>;
  meaningfulTasteRecoverySurvivingFinalCount?: number;
  meaningfulTasteRecoveryContinuedAfterRejectedMerge?: boolean;
  meaningfulTasteRecoveryExhaustedQueries?: string[];
  meaningfulTasteRecoveryRejectedQueryFamilies?: string[];
  recoverySuccessRequiresFinalEligibility?: boolean;
  middleGradesRecoveryFinalShortfallReason?: string;
  middleGradesRecoveryRejectedReasonCounts?: Record<string, number>;
  middleGradesRecoveryBestRejectedTitlesByReason?: Record<string, string[]>;
  middleGradesRecoveryNextBestSelectableTitles?: string[];
  middleGradesRecoveryCouldHaveReachedFiveIfRelaxedGate?: boolean;
  middleGradesRecoveryRelaxedGateNeeded?: string;
  recoveryQueryAnchorByQuery?: Record<string, string>;
  recoveryHumorUsedAsAnchorBlocked?: boolean;
  recoveryConcreteFictionQueryUsed?: boolean;
  recoveryQueryFamilyAcceptedFinalCount?: Record<string, number>;
  recoveryQueryFamilyRejectedForLeakageCount?: Record<string, number>;
  recoveryFamilyScores?: Array<{ query: string; family: string; anchors: string[]; score: number; reason: string; skippedReason?: string }>;
  recoveryFamiliesSkippedByAvoidEvidence?: Record<string, string>;
  recoveryFamiliesSkippedBySameRunLeakage?: Record<string, string>;
  recoveryFamiliesSelectedForExecution?: string[];
  recoveryFamilyExecutionOrderReason?: Record<string, string>;
  recoveryFamilyYieldByFamily?: Record<string, number>;
  queryOnlyRejectedThenRecoveredCount?: number;
  brittleQueryTimedOutThenShortQueryAttempted?: boolean;
  underfillDespiteUnattemptedEvidenceQueries?: boolean;
  rejectedAllRowsAsQueryOnly?: boolean;
  queryOnlyRejectionTriggeredContinuation?: boolean;
  unattemptedSpecificQueriesAfterQueryOnlyRejection?: string[];
  continuedAfterQueryOnlyRejectionQueries?: string[];
  continuedAfterQueryOnlyRejectionAcceptedCount?: number;
  recoveryExhaustionReasonDetailed?: string;
  debugMiddleGradesDeepTraceEnabled?: boolean;
  debugMiddleGradesNoTimeouts?: boolean;
  middleGradesDeepDebugActive?: boolean;
  middleGradesDeepDebugActivationSource?: "profile" | "url" | "localStorage" | "preset" | "none";
  middleGradesDeepDebugRequestedButNotActivated?: boolean;
  middleGradesDeepDebugActivationFailureReason?: string;
  sessionReportHeader?: string;
  debugMiddleGradesBudgetMs?: number;
  debugMiddleGradesPerQueryBudgetMs?: number;
  debugMiddleGradesPlannedQueries?: Record<string, unknown>[];
  debugMiddleGradesFetchTrace?: Record<string, unknown>[];
  debugMiddleGradesRawDocTrace?: Record<string, unknown>[];
  debugMiddleGradesNormalizedCandidateTrace?: Record<string, unknown>[];
  debugMiddleGradesSelectionTrace?: Record<string, unknown>[];
  debugMiddleGradesCompactSummary?: Record<string, unknown>;
  humorKeywordOnlyLeakageByTitle?: Record<string, boolean>;
  humorKeywordOnlyRejectedTitles?: string[];
  preteenAgeShapeEvidenceByTitle?: Record<string, boolean>;
  selectedNonHumorAlignmentCount?: number;
  genericFunnySlateDetected?: boolean;
  genericFunnySlateLockQualityBlocked?: boolean;
  adultOrYaHumorLeakageRejectedTitles?: string[];
  finalCountContractStatus?: "full_route_aligned" | "full_mixed_recovery" | "full_fallback_only" | "full_weak_evidence" | "underfilled_mixed" | "underfilled_fallback_only" | "zero_result_failure";
}

export interface SourceResult {
  source: SourceIdV2;
  status: SourceStatusV2;
  rawItems: unknown[];
  diagnostics: SourceDiagnosticV2;
}

export interface NormalizedCandidate {
  id: string;
  source: SourceIdV2;
  sourceId?: string;
  title: string;
  subtitle?: string;
  creators: string[];
  description?: string;
  formats: CandidateFormatV2[];
  genres: string[];
  themes: string[];
  tones: string[];
  characterDynamics: string[];
  maturityBand?: AgeBandV2 | string;
  publicationYear?: number;
  sourceUrl?: string;
  raw: unknown;
  diagnostics: Record<string, unknown>;
}

export interface ScoredCandidate extends NormalizedCandidate {
  score: number;
  matchedSignals: string[];
  rejectedReasons: string[];
  scoreBreakdown: Record<string, number>;
}

export interface StageDiagnosticV2 {
  stage: string;
  status: "ok" | "warning" | "error";
  message?: string;
  counts?: Record<string, number>;
  details?: Record<string, unknown>;
}

export interface DiagnosticReportV2 {
  requestId: string;
  startedAt: string;
  finishedAt: string;
  elapsedMs: number;
  stages: StageDiagnosticV2[];
  tasteProfile: TasteProfile;
  searchPlan: SearchPlan;
  sources: SourceDiagnosticV2[];
  rejectedReasons: Record<string, number>;
  finalSelectionTitles: string[];
  finalItemsLength?: number;
  returnedItemsLength?: number;
  returnedItemsTitles?: string[];
  returnedItemsStageBoundary?: string;
  middleGradesReturnedLayerRootCollapseApplied?: boolean;
  middleGradesReturnedLayerRootCollapsedTitles?: string[];
  middleGradesReturnedLayerRootCollapseCausedUnderfill?: boolean;
  returnedItemPipelineObjectIds?: string[];
  returnedItemPipelineScoredObjectIds?: string[];
  sessionReportHeader?: string;
}

export interface RecommendationResultV2 {
  engineVersion: "recommender-v2-openlibrary-baseline";
  items: ScoredCandidate[];
  diagnostics: DiagnosticReportV2;
}

export interface SourceAdapterV2 {
  source: SourceIdV2;
  search(plan: SourcePlan, context: { profile: TasteProfile; signal?: AbortSignal }): Promise<SourceResult>;
}
