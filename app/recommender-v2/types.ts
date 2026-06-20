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
  middleGradesAgeShapeDiagnostics?: Record<string, unknown>;
  middleGradesDelayedRetryAttempted?: boolean;
  middleGradesDelayedRetrySkippedReason?: string;
  middleGradesDelayedRetryTimeoutMs?: number;
  middleGradesTimeoutBudgetRemainingBeforeRetry?: number;
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
  finalCountContractStatus?: "satisfied" | "underfilled_after_recovery" | "zero_after_recovery";
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
