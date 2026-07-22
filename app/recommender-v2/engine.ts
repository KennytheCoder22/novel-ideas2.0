import { buildDiagnosticReport, buildRecommendationResultV2, stageDiagnostic } from "./diagnostics";
import { normalizeSourceResults } from "./normalize";
import { buildSearchPlan } from "./searchPlan";
import { ageSuitabilityScore, scoreCandidates } from "./score";
import { kidsGoogleBooksPreScoringEligibility, selectRecommendations } from "./select";
import { annotatePreteenGoogleBooksPublicationIdentity, preteenGoogleBooksPublicationIdentityAudit } from "./preteenGoogleBooksPublicationIdentity";
import type { PreteenGoogleBooksPublicationIdentityAudit } from "./preteenGoogleBooksPublicationIdentity";
import { sourceAdapters } from "./sources";
import { buildTasteProfile } from "./tasteProfile";
import type { AgeBandV2, NormalizedCandidate, RecommendationResultV2, ScoredCandidate, SearchPlan, SourceDiagnosticV2, SourcePlan, SourceResult, SourceStatusV2, SwipeSessionV2, TasteProfile } from "./types";

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

// Diagnostics-only entry point for controlled retrieval-composition audits.
// Production recommendation flows continue to call mergeSourceItems directly.
export function mergeOpenLibrarySourceItemsForDiagnostics(groups: unknown[][]): unknown[] {
  return groups.reduce((merged, group) => mergeSourceItems(merged, group), [] as unknown[]);
}

function uniqueStrings(values: unknown[], limit = 80): string[] {
  const seen = new Set<string>();
  const strings: string[] = [];
  for (const value of values) {
    const text = String(value || "").trim();
    const key = text.toLowerCase();
    if (!text || seen.has(key)) continue;
    seen.add(key);
    strings.push(text);
    if (strings.length >= limit) break;
  }
  return strings;
}

type GoogleBooksInfrastructureStatus =
  | "available"
  | "shared"
  | "age_specific"
  | "missing"
  | "bypassed"
  | "disabled"
  | "attempted"
  | "succeeded"
  | "failed";

type GoogleBooksNonAdultAgeBand = Exclude<AgeBandV2, "adult">;

type GoogleBooksAgeBandInfrastructureDiagnostics = {
  googleBooksAgeBandInfrastructureByDeck: Record<string, Record<string, unknown>>;
  googleBooksAgeBandQueryPlanningByDeck: Record<string, Record<string, unknown>>;
  googleBooksAgeBandDispatchByDeck: Record<string, Record<string, unknown>>;
  googleBooksAgeBandNormalizationByDeck: Record<string, Record<string, unknown>>;
  googleBooksAgeBandScoringHandoffByDeck: Record<string, Record<string, unknown>>;
  googleBooksAgeBandEligibilityHandoffByDeck: Record<string, Record<string, unknown>>;
  googleBooksAgeBandFinalSelectionHandoffByDeck: Record<string, Record<string, unknown>>;
  googleBooksAgeBandRenderedTitlesByDeck: Record<string, string[]>;
  googleBooksAgeBandDropStageByTitle: Record<string, string>;
  googleBooksAgeBandDropReasonByTitle: Record<string, string>;
  googleBooksStageDecisionByTitle: Record<string, Record<string, string>>;
  googleBooksStageReasonByTitle: Record<string, Record<string, string>>;
  googleBooksStageGateByTitle: Record<string, Record<string, string>>;
  googleBooksStageOrder: string[];
  googleBooksAgeBandInfrastructureGaps: Record<string, string[]>;
  googleBooksAgeBandInfrastructureSummary: Record<string, unknown>;
  googleBooksAudienceBandByTitle: Record<string, string>;
  googleBooksContentMaturityByTitle: Record<string, string>;
  googleBooksSourceMaturityRatingByTitle: Record<string, string>;
  googleBooksRequestedDeckByTitle: Record<string, string>;
  googleBooksAgeSuitabilityDecisionByTitle: Record<string, string>;
  googleBooksMaturityDecisionByTitle: Record<string, string>;
  googleBooksAudienceMaturityComparisonByTitle: Record<string, unknown>;
  googleBooksAudienceMaturityMismatchTitles: string[];
  googleBooksAudienceMaturitySemanticChanges: string[];
};

const GOOGLE_BOOKS_NON_ADULT_AGE_BANDS: GoogleBooksNonAdultAgeBand[] = ["kids", "preteens", "teens"];

function emptyGoogleBooksAgeBandRuntimeRow(ageBand: GoogleBooksNonAdultAgeBand, currentAgeBand: AgeBandV2): Record<string, unknown> {
  return {
    status: "bypassed" as GoogleBooksInfrastructureStatus,
    reason: ageBand === currentAgeBand ? "not_evaluated" : "not_current_session_age_band",
    currentAgeBand,
  };
}

function googleBooksAgeBandInfrastructureMap(): Record<string, Record<string, unknown>> {
  const shared = {
    queryPlanning: {
      status: "shared" as GoogleBooksInfrastructureStatus,
      file: "app/recommender-v2/searchPlan.ts",
      note: "buildGoogleBooksIntents emits age-prefixed Google Books queries for non-Adult age bands.",
    },
    dispatch: {
      status: "shared" as GoogleBooksInfrastructureStatus,
      file: "app/recommender-v2/engine.ts",
      note: "runRecommenderV2 dispatches any enabled googleBooks source plan through sourceAdapters.googleBooks.",
    },
    fetchAdapter: {
      status: "shared" as GoogleBooksInfrastructureStatus,
      file: "app/recommender-v2/sources/googleBooksSource.ts",
      note: "The V2 adapter accepts all age bands; Adult-only fetch-query rewriting is bypassed for younger age bands.",
    },
    normalization: {
      status: "shared" as GoogleBooksInfrastructureStatus,
      file: "app/recommender-v2/normalize.ts",
      note: "normalizeSourceResults converts accepted Google Books rows into the shared NormalizedCandidate model.",
    },
    scoring: {
      status: "shared" as GoogleBooksInfrastructureStatus,
      file: "app/recommender-v2/score.ts",
      note: "scoreCandidates scores Google Books candidates for all age bands.",
    },
    ageSuitability: {
      status: "shared" as GoogleBooksInfrastructureStatus,
      file: "app/recommender-v2/score.ts",
      note: "ageSuitabilityScore contributes age-band suitability for all sources.",
    },
    publicationArtifacts: {
      status: "shared" as GoogleBooksInfrastructureStatus,
      file: "app/recommender-v2/sources/googleBooksSource.ts",
      note: "Publication-shape filtering currently runs in the shared Google Books adapter; it is not tuned here for younger age bands.",
    },
    sourceQuality: {
      status: "shared" as GoogleBooksInfrastructureStatus,
      file: "app/recommender-v2/score.ts",
      note: "sourceQualityRelevanceScore is calculated for all Google Books candidates.",
    },
    seriesDuplication: {
      status: "shared" as GoogleBooksInfrastructureStatus,
      file: "app/recommender-v2/select.ts",
      note: "Generic title, author, and series-root diversity is shared; Adult Google Books cluster handling remains Adult-only.",
    },
    countsLineage: {
      status: "available" as GoogleBooksInfrastructureStatus,
      file: "app/recommender-v2/engine.ts",
      note: "This audit reports query, dispatch, normalization, scoring, eligibility, selection, wrapper, and renderer handoff counts.",
    },
    wrapperRenderer: {
      status: "available" as GoogleBooksInfrastructureStatus,
      file: "screens/SwipeDeckScreen.tsx",
      note: "The V2 diagnostic wrapper exposes Google Books wrapper and renderer title handoffs.",
    },
    googleBooksOnlyRegression: {
      status: "available" as GoogleBooksInfrastructureStatus,
      file: "scripts/run-v2-googlebooks-age-band-infrastructure-audit-regressions.mjs",
      note: "Deterministic Google Books-only infrastructure fixtures cover Kids, Pre-Teens, and Teens.",
    },
  };
  return {
    kids: {
      ...shared,
      finalEligibility: {
        status: "age_specific" as GoogleBooksInfrastructureStatus,
        file: "app/recommender-v2/select.ts",
        note: "Kids use the shared Kids clean-final gate for all sources, including Google Books.",
      },
      meaningfulTasteAlignment: {
        status: "missing" as GoogleBooksInfrastructureStatus,
        file: "app/recommender-v2/select.ts",
        note: "No Google Books-specific Kids meaningful-taste final gate exists; only general scoring and Kids clean-final checks apply.",
      },
      googleBooksMetadataOnlyTasteEvidence: {
        status: "missing" as GoogleBooksInfrastructureStatus,
        file: "app/recommender-v2/score.ts",
        note: "Metadata-only scoring isolation is Adult Google Books-only; Kids Google Books still uses full candidateText.",
      },
    },
    preteens: {
      ...shared,
      finalEligibility: {
        status: "missing" as GoogleBooksInfrastructureStatus,
        file: "app/recommender-v2/select.ts",
        note: "Pre-Teen final eligibility helpers are called, but the current middle-grades rules allow non-Open-Library candidates through without Google Books-specific checks.",
      },
      meaningfulTasteAlignment: {
        status: "missing" as GoogleBooksInfrastructureStatus,
        file: "app/recommender-v2/select.ts",
        note: "middleGradesMeaningfulTasteEligibility is Open Library-only; Pre-Teen Google Books has no source-specific meaningful-taste gate.",
      },
      googleBooksMetadataOnlyTasteEvidence: {
        status: "missing" as GoogleBooksInfrastructureStatus,
        file: "app/recommender-v2/score.ts",
        note: "Metadata-only scoring isolation is Adult Google Books-only; Pre-Teen Google Books still uses full candidateText.",
      },
    },
    teens: {
      ...shared,
      finalEligibility: {
        status: "missing" as GoogleBooksInfrastructureStatus,
        file: "app/recommender-v2/select.ts",
        note: "Teen Open Library has a Teen-specific final gate, but Teen Google Books has no source-specific final eligibility gate.",
      },
      meaningfulTasteAlignment: {
        status: "missing" as GoogleBooksInfrastructureStatus,
        file: "app/recommender-v2/select.ts",
        note: "Teen Google Books has no Teen-specific meaningful metadata taste gate; Teen Open Library-only rules do not apply.",
      },
      googleBooksMetadataOnlyTasteEvidence: {
        status: "missing" as GoogleBooksInfrastructureStatus,
        file: "app/recommender-v2/score.ts",
        note: "Metadata-only scoring isolation is Adult Google Books-only; Teen Google Books still uses full candidateText.",
      },
    },
  };
}

function googleBooksAgeBandFutureGaps(): Record<string, string[]> {
  const common = [
    "Publication-shape filtering is shared but Adult-designed; younger age-band quality rules should be audited before tuning.",
    "Reading-level evidence and age-category reliability are not independently validated for Google Books.",
    "Graphic novel, manga, and light-novel handling should be age-band-specific future work.",
    "Series-entry preference for younger readers is not Google Books-specific.",
  ];
  return {
    kids: [
      ...common,
      "Picture-book versus chapter-book identity is not modeled for Google Books.",
      "Early-reader identity is not modeled for Google Books.",
      "Juvenile nonfiction, activity-book, workbook, and classroom artifact leakage needs a Kids-specific source audit.",
    ],
    preteens: [
      ...common,
      "Middle-grade versus YA distinction is not Google Books-specific.",
      "School-assignment and classroom artifact suppression needs Google Books validation.",
      "Middle-grade mature-content protection should not reuse Adult or Teen thresholds directly.",
    ],
    teens: [
      ...common,
      "YA versus Adult crossover and mature-content protection is not modeled for Teen Google Books.",
      "Teen Google Books does not yet have a Teen-specific final meaningful-taste gate.",
      "Teen source tuning must stay separate from the frozen Teen Open Library path.",
    ],
  };
}

function googleBooksStatusFromSourceResult(result: SourceResult | undefined): GoogleBooksInfrastructureStatus {
  if (!result) return "failed";
  if (result.status === "skipped") return result.diagnostics?.skippedReason === "source_disabled" ? "disabled" : "bypassed";
  if (result.status === "succeeded") return "succeeded";
  if (result.status === "empty") return "failed";
  if (result.status === "failed" || result.status === "timed_out") return "failed";
  return result.diagnostics?.attempted ? "attempted" : "available";
}

function googleBooksFailureStageForReason(reason: string): string {
  if (/preteen_googlebooks_publication_identity/i.test(reason)) return "publication-identity_rejection";
  if (/publication_shape|artifact|reference|study|guide|catalog|periodical|anthology|nonfiction/i.test(reason)) return "publication-shape_rejection";
  if (/mature|maturity|age|juvenile|k2|middle_grades.*(?:final|non_narrative)|adult_or_ya|leakage/i.test(reason)) return "age_suitability_rejection";
  if (/taste|meaningful|family|evidence|query_only|document/i.test(reason)) return "taste-alignment_rejection";
  if (/duplicate|same_author|same_series|same_root|cluster|deferred|ranked_below|not_selected/i.test(reason)) return "final-selection_loss";
  if (/non_positive_score/i.test(reason)) return "scoring_or_final-selection_loss";
  return "final-selection_loss";
}

function googleBooksHandoffStatus(entered: number, exited: number, failureReason: string): Record<string, unknown> {
  if (entered === 0) return { status: "bypassed" as GoogleBooksInfrastructureStatus, reason: "no_googlebooks_candidates_entered_stage", entered, exited };
  if (exited === 0) return { status: "failed" as GoogleBooksInfrastructureStatus, reason: failureReason, entered, exited };
  return { status: "succeeded" as GoogleBooksInfrastructureStatus, entered, exited };
}

function googleBooksSelectedTitleSet(selected: ScoredCandidate[]): Set<string> {
  return new Set(selected.filter((candidate) => candidate.source === "googleBooks").map((candidate) => normalizedTokenText(candidate.title)));
}

function googleBooksSourceMaturityRatingFromRow(row: Record<string, unknown>): string {
  const explicit = String(row.sourceMaturityRating || row.maturityRating || "").trim();
  if (explicit) return explicit;
  const maturityBand = String(row.maturityBand || row.maturity || "").trim();
  return /^(?:NOT_MATURE|MATURE|EXPLICIT_MATURE)$/i.test(maturityBand) ? maturityBand : "";
}

function googleBooksContentMaturityFromRating(value: unknown): "mature" | "not_mature" | "unknown" {
  const raw = String(value || "").trim().toUpperCase();
  if (raw === "MATURE" || raw === "EXPLICIT_MATURE") return "mature";
  if (raw === "NOT_MATURE") return "not_mature";
  return "unknown";
}

function googleBooksAudienceBandFromRow(row: Record<string, unknown>): string {
  return String(row.audienceBand || row.ageBand || "").trim();
}

export function buildGoogleBooksAgeBandInfrastructureDiagnostics(input: {
  profile: TasteProfile;
  searchPlan: SearchPlan;
  sourceResults: SourceResult[];
  normalizedCandidates: NormalizedCandidate[];
  scoredCandidates: ScoredCandidate[];
  selectedCandidates: ScoredCandidate[];
  returnedTitles?: string[];
  selectionDiagnostics?: Record<string, unknown>;
}): GoogleBooksAgeBandInfrastructureDiagnostics {
  const currentAgeBand = input.profile.ageBand;
  const currentDeck = GOOGLE_BOOKS_NON_ADULT_AGE_BANDS.includes(currentAgeBand as GoogleBooksNonAdultAgeBand)
    ? currentAgeBand as GoogleBooksNonAdultAgeBand
    : undefined;
  const infrastructureByDeck = googleBooksAgeBandInfrastructureMap();
  const queryPlanningByDeck: Record<string, Record<string, unknown>> = {};
  const dispatchByDeck: Record<string, Record<string, unknown>> = {};
  const normalizationByDeck: Record<string, Record<string, unknown>> = {};
  const scoringHandoffByDeck: Record<string, Record<string, unknown>> = {};
  const eligibilityHandoffByDeck: Record<string, Record<string, unknown>> = {};
  const finalSelectionHandoffByDeck: Record<string, Record<string, unknown>> = {};
  const renderedTitlesByDeck: Record<string, string[]> = {};
  const dropStageByTitle: Record<string, string> = {};
  const dropReasonByTitle: Record<string, string> = {};
  const audienceBandByTitle: Record<string, string> = {};
  const contentMaturityByTitle: Record<string, string> = {};
  const sourceMaturityRatingByTitle: Record<string, string> = {};
  const requestedDeckByTitle: Record<string, string> = {};
  const ageSuitabilityDecisionByTitle: Record<string, string> = {};
  const maturityDecisionByTitle: Record<string, string> = {};
  const audienceMaturityComparisonByTitle: Record<string, unknown> = {};
  const audienceMaturityMismatchTitles: string[] = [];
  const selectedGoogleBooksTitleSet = googleBooksSelectedTitleSet(input.selectedCandidates);

  const recordGoogleBooksAudienceMaturity = (title: string, row: Record<string, unknown>, candidate?: ScoredCandidate | NormalizedCandidate): void => {
    if (!title) return;
    const diagnostics = (candidate?.diagnostics || {}) as Record<string, unknown>;
    const sourceMaturityRating = String(diagnostics.googleBooksSourceMaturityRating || googleBooksSourceMaturityRatingFromRow(row)).trim();
    const contentMaturity = String(diagnostics.googleBooksContentMaturity || row.contentMaturity || googleBooksContentMaturityFromRating(sourceMaturityRating));
    const audienceBand = String(diagnostics.googleBooksAudienceBand || googleBooksAudienceBandFromRow(row)).trim();
    const candidateMaturityBand = String(candidate?.maturityBand || row.normalizedMaturityBand || "").trim();
    audienceBandByTitle[title] = audienceBand || "(none)";
    contentMaturityByTitle[title] = contentMaturity || "unknown";
    sourceMaturityRatingByTitle[title] = sourceMaturityRating || "(none)";
    requestedDeckByTitle[title] = currentAgeBand;
    audienceMaturityComparisonByTitle[title] = {
      requestedDeck: currentAgeBand,
      sourceAudienceBand: audienceBand || "(none)",
      normalizedCandidateMaturityBand: candidateMaturityBand || "(none)",
      contentMaturity: contentMaturity || "unknown",
      sourceMaturityRating: sourceMaturityRating || "(none)",
      semanticComparison: "requested_deck_and_source_audience_are_separate_from_content_maturity",
    };
    const scoredCandidate = candidate && "scoreBreakdown" in candidate ? candidate as ScoredCandidate : undefined;
    if (scoredCandidate) {
      const reason = scoredCandidate.rejectedReasons.find((entry) => entry !== "selected") || "";
      const selected = selectedGoogleBooksTitleSet.has(normalizedTokenText(title));
      const ageScore = Number(scoredCandidate.scoreBreakdown?.ageTeenSuitability ?? scoredCandidate.scoreBreakdown?.ageBandSuitability ?? 0);
      ageSuitabilityDecisionByTitle[title] = selected
        ? `selected_with_age_suitability=${Number.isFinite(ageScore) ? ageScore : 0}`
        : reason
          ? `not_selected:${reason}:age_suitability=${Number.isFinite(ageScore) ? ageScore : 0}`
          : `ranked_below_final_selection:age_suitability=${Number.isFinite(ageScore) ? ageScore : 0}`;
      if (reason === "maturity_band_mismatch") audienceMaturityMismatchTitles.push(title);
      if (contentMaturity === "mature" && (currentAgeBand === "kids" || currentAgeBand === "preteens")) {
        maturityDecisionByTitle[title] = /^googlebooks_mature_content_not_allowed/.test(reason)
          ? `explicit_mature_content_rejected_for_${currentAgeBand}`
          : `explicit_mature_content_requires_${currentAgeBand}_policy_review`;
      } else if (contentMaturity === "mature" && currentAgeBand === "teens") {
        maturityDecisionByTitle[title] = "explicit_mature_content_tracked_separately_for_teens";
      } else if (contentMaturity === "mature" && currentAgeBand === "adult") {
        maturityDecisionByTitle[title] = "explicit_mature_content_allowed_for_adult_deck";
      } else if (contentMaturity === "not_mature") {
        maturityDecisionByTitle[title] = `not_mature_content_allowed_for_${currentAgeBand}_deck`;
      } else {
        maturityDecisionByTitle[title] = "unknown_maturity_preserved_without_deck_inference";
      }
    } else {
      ageSuitabilityDecisionByTitle[title] = "not_scored";
      maturityDecisionByTitle[title] = contentMaturity === "not_mature"
        ? `not_mature_content_allowed_for_${currentAgeBand}_deck`
        : contentMaturity === "mature"
          ? `explicit_mature_content_observed_for_${currentAgeBand}_deck`
          : "unknown_maturity_preserved_without_deck_inference";
    }
  };

  const googleBooksResultForMaturity = input.sourceResults.find((result) => result.source === "googleBooks");
  for (const item of googleBooksResultForMaturity?.rawItems || []) {
    const row = (item || {}) as Record<string, unknown>;
    recordGoogleBooksAudienceMaturity(titleOf(row), row);
  }
  for (const candidate of input.normalizedCandidates.filter((candidate) => candidate.source === "googleBooks")) {
    recordGoogleBooksAudienceMaturity(candidate.title, (candidate.raw || {}) as Record<string, unknown>, candidate);
  }
  for (const candidate of input.scoredCandidates.filter((candidate) => candidate.source === "googleBooks")) {
    recordGoogleBooksAudienceMaturity(candidate.title, (candidate.raw || {}) as Record<string, unknown>, candidate);
  }

  const sharedSourceDiagnostics = (googleBooksResultForMaturity?.diagnostics || {}) as SourceDiagnosticV2;
  const selectionDiagnostics = input.selectionDiagnostics || {};
  const sourcePublicationRejectedByTitle = {
    ...((sharedSourceDiagnostics.googleBooksPublicationShapeRejectedBeforeRankingByTitle || {}) as Record<string, string>),
    ...((sharedSourceDiagnostics.googleBooksGenericCategoryRejectedBeforeRankingByTitle || {}) as Record<string, string>),
    ...((sharedSourceDiagnostics.googleBooksSubjectOfStudyRejectedBeforeRankingByTitle || {}) as Record<string, string>),
    ...((selectionDiagnostics.googleBooksRejectedBeforeRankingReason || {}) as Record<string, string>),
  };
  const preScoringRejectedByTitle = {
    ...((selectionDiagnostics.googleBooksRejectedBeforeRankingReason || {}) as Record<string, string>),
    ...((sharedSourceDiagnostics.preteenGoogleBooksPublicationIdentityRejectedBeforeScoringByTitle || {}) as Record<string, string>),
    ...((sharedSourceDiagnostics.kidsGoogleBooksRejectedBeforeScoringByTitle || {}) as Record<string, string>),
    ...((sharedSourceDiagnostics.teensGoogleBooksRejectedBeforeScoringByTitle || {}) as Record<string, string>),
  };
  const finalEligibilityDecisionByTitle = (selectionDiagnostics.googleBooksFinalEligibilityDecisionByTitle || {}) as Record<string, string>;
  const finalEligibilityReasonByTitle = (selectionDiagnostics.googleBooksFinalEligibilityReasonByTitle || {}) as Record<string, string>;
  const finalEligibilityGateByTitle = (selectionDiagnostics.googleBooksFinalEligibilityGateByTitle || {}) as Record<string, string>;
  const finalSelectionDecisionByTitle = (selectionDiagnostics.googleBooksFinalSelectionDecisionByTitle || {}) as Record<string, string>;
  const finalSelectionReasonByTitle = (selectionDiagnostics.googleBooksFinalSelectionExclusionReasonByTitle || {}) as Record<string, string>;
  const normalizedSet = new Set(input.normalizedCandidates.filter((row) => row.source === "googleBooks").map((row) => normalizedTokenText(row.title)));
  const scoredSet = new Set(input.scoredCandidates.filter((row) => row.source === "googleBooks").map((row) => normalizedTokenText(row.title)));
  const selectedSetForStages = googleBooksSelectedTitleSet(input.selectedCandidates);
  const renderedSetForStages = new Set(uniqueStrings(input.returnedTitles || input.selectedCandidates.filter((row) => row.source === "googleBooks").map((row) => row.title), 120).map(normalizedTokenText));
  const rawTitlesForStages = uniqueStrings((googleBooksResultForMaturity?.rawItems || []).map((row) => titleOf((row || {}) as Record<string, unknown>)), 120);
  const stageTitleUniverse = uniqueStrings([
    ...rawTitlesForStages,
    ...Object.keys(sourcePublicationRejectedByTitle),
    ...Object.keys(preScoringRejectedByTitle),
    ...input.normalizedCandidates.filter((row) => row.source === "googleBooks").map((row) => row.title),
    ...input.scoredCandidates.filter((row) => row.source === "googleBooks").map((row) => row.title),
    ...Object.keys(finalEligibilityDecisionByTitle),
    ...Object.keys(finalSelectionDecisionByTitle),
    ...input.selectedCandidates.filter((row) => row.source === "googleBooks").map((row) => row.title),
  ], 240);
  const googleBooksStageOrder = [
    "source_admission",
    "normalization",
    "publication_identity_or_shape_policy",
    "audience_maturity_policy",
    "pre_scoring",
    "scoring_admission",
    "ranking",
    "final_eligibility",
    "selection",
    "rendering",
  ];
  const googleBooksStageDecisionByTitle: Record<string, Record<string, string>> = {};
  const googleBooksStageReasonByTitle: Record<string, Record<string, string>> = {};
  const googleBooksStageGateByTitle: Record<string, Record<string, string>> = {};
  const preteenRescueAppliedByTitle = (sharedSourceDiagnostics.preteenGoogleBooksPublicationShapeRescueAppliedByTitle || {}) as Record<string, boolean>;
  const preteenRescueReasonByTitle = (sharedSourceDiagnostics.preteenGoogleBooksPublicationShapeRescueReasonByTitle || {}) as Record<string, string>;
  for (const title of stageTitleUniverse) {
    const key = normalizedTokenText(title);
    const publicationRejectReason = sourcePublicationRejectedByTitle[title] || "";
    const preScoringRejectReason = preScoringRejectedByTitle[title] || "";
    const finalDecision = finalEligibilityDecisionByTitle[title] || "";
    const finalReason = finalEligibilityReasonByTitle[title] || "";
    const finalGate = finalEligibilityGateByTitle[title] || (currentAgeBand === "adult" ? "adult_googlebooks_final_eligibility" : `${currentAgeBand}_googlebooks_final_eligibility`);
    const selectionDecision = finalSelectionDecisionByTitle[title] || "";
    const selected = selectedSetForStages.has(key);
    const rendered = renderedSetForStages.has(key);
    const normalized = normalizedSet.has(key);
    const scored = scoredSet.has(key);
    const rescued = Boolean(preteenRescueAppliedByTitle[title]);
    const contentMaturity = contentMaturityByTitle[title] || "unknown";
    googleBooksStageDecisionByTitle[title] = {
      source_admission: "admitted",
      normalization: publicationRejectReason ? "not_reached" : normalized || Boolean(preScoringRejectReason) ? "admitted" : "not_emitted",
      publication_identity_or_shape_policy: publicationRejectReason ? "rejected" : rescued ? "rescued" : "passed",
      audience_maturity_policy: /mature|maturity|age_suitability|^k2_/i.test(preScoringRejectReason) ? "rejected" : contentMaturity === "mature" && currentAgeBand === "teens" ? "tracked" : "passed",
      pre_scoring: publicationRejectReason ? "not_reached" : preScoringRejectReason ? "rejected" : normalized ? "entered" : "not_reached",
      scoring_admission: scored ? "entered" : "not_reached",
      ranking: scored ? "entered" : "not_reached",
      final_eligibility: finalDecision || (scored ? "not_reported" : "not_reached"),
      selection: selected ? "selected" : selectionDecision || (scored ? "not_selected" : "not_reached"),
      rendering: rendered ? "rendered" : selected ? "not_rendered" : "not_reached",
    };
    googleBooksStageReasonByTitle[title] = {
      source_admission: "googlebooks_source_candidate_observed",
      normalization: publicationRejectReason ? publicationRejectReason : normalized || Boolean(preScoringRejectReason) ? "normalized_candidate_emitted" : "normalization_candidate_not_emitted",
      publication_identity_or_shape_policy: publicationRejectReason || (rescued ? preteenRescueReasonByTitle[title] || "preteen_narrative_rescue_applied" : "publication_policy_passed"),
      audience_maturity_policy: /mature|maturity|age_suitability|^k2_/i.test(preScoringRejectReason) ? preScoringRejectReason : contentMaturity === "mature" && currentAgeBand === "teens" ? "explicit_mature_content_tracked_separately_for_teens" : maturityDecisionByTitle[title] || "audience_maturity_policy_passed",
      pre_scoring: publicationRejectReason || preScoringRejectReason || (normalized ? "entered_scoring_candidate_pool" : "not_reached"),
      scoring_admission: scored ? "score_candidates_admitted" : publicationRejectReason || preScoringRejectReason || "not_reached",
      ranking: scored ? "ranked_candidate_emitted" : publicationRejectReason || preScoringRejectReason || "not_reached",
      final_eligibility: finalReason || (scored ? "final_eligibility_diagnostics_missing" : publicationRejectReason || preScoringRejectReason || "not_reached"),
      selection: selected ? "selected_for_final_slate" : finalSelectionReasonByTitle[title] || selectionDecision || finalReason || publicationRejectReason || preScoringRejectReason || "not_selected",
      rendering: rendered ? "present_in_renderer_output" : selected ? "selected_candidate_missing_from_renderer_output" : "not_reached",
    };
    googleBooksStageGateByTitle[title] = {
      source_admission: "googlebooks_source_adapter",
      normalization: "shared_googlebooks_normalization",
      publication_identity_or_shape_policy: rescued ? "preteen_publication_shape_narrative_rescue" : "googlebooks_publication_identity_or_shape_policy",
      audience_maturity_policy: `${currentAgeBand}_googlebooks_audience_maturity_policy`,
      pre_scoring: preScoringRejectReason ? `${currentAgeBand}_googlebooks_pre_scoring_gate` : "shared_googlebooks_pre_scoring_boundary",
      scoring_admission: "shared_score_candidates_admission",
      ranking: "shared_googlebooks_ranking_boundary",
      final_eligibility: finalGate,
      selection: "shared_googlebooks_final_selection",
      rendering: "googlebooks_renderer_output",
    };
  }

  for (const ageBand of GOOGLE_BOOKS_NON_ADULT_AGE_BANDS) {
    queryPlanningByDeck[ageBand] = emptyGoogleBooksAgeBandRuntimeRow(ageBand, currentAgeBand);
    dispatchByDeck[ageBand] = emptyGoogleBooksAgeBandRuntimeRow(ageBand, currentAgeBand);
    normalizationByDeck[ageBand] = emptyGoogleBooksAgeBandRuntimeRow(ageBand, currentAgeBand);
    scoringHandoffByDeck[ageBand] = emptyGoogleBooksAgeBandRuntimeRow(ageBand, currentAgeBand);
    eligibilityHandoffByDeck[ageBand] = emptyGoogleBooksAgeBandRuntimeRow(ageBand, currentAgeBand);
    finalSelectionHandoffByDeck[ageBand] = emptyGoogleBooksAgeBandRuntimeRow(ageBand, currentAgeBand);
    renderedTitlesByDeck[ageBand] = [];
  }

  if (currentDeck) {
    const googleBooksPlan = input.searchPlan.sourcePlans.find((plan) => plan.source === "googleBooks");
    const googleBooksResult = input.sourceResults.find((result) => result.source === "googleBooks");
    const sourceDiagnostics = googleBooksResult?.diagnostics as SourceDiagnosticV2 | undefined;
    const normalizedGoogleBooks = input.normalizedCandidates.filter((candidate) => candidate.source === "googleBooks");
    const scoredGoogleBooks = input.scoredCandidates.filter((candidate) => candidate.source === "googleBooks");
    const selectedGoogleBooks = input.selectedCandidates.filter((candidate) => candidate.source === "googleBooks");
    const selectedSet = googleBooksSelectedTitleSet(input.selectedCandidates);
    const returnedTitles = uniqueStrings(input.returnedTitles || selectedGoogleBooks.map((candidate) => candidate.title), 120);
    const sourceRejectedBeforeRanking = {
      ...((sourceDiagnostics?.googleBooksPublicationShapeRejectedBeforeRankingByTitle || {}) as Record<string, string>),
      ...((sourceDiagnostics?.googleBooksGenericCategoryRejectedBeforeRankingByTitle || {}) as Record<string, string>),
      ...((sourceDiagnostics?.googleBooksSubjectOfStudyRejectedBeforeRankingByTitle || {}) as Record<string, string>),
      ...((sourceDiagnostics?.preteenGoogleBooksPublicationIdentityRejectedBeforeScoringByTitle || {}) as Record<string, string>),
      ...((sourceDiagnostics?.kidsGoogleBooksRejectedBeforeScoringByTitle || {}) as Record<string, string>),
      ...((sourceDiagnostics?.teensGoogleBooksRejectedBeforeScoringByTitle || {}) as Record<string, string>),
    };
    const sourceStatus = googleBooksStatusFromSourceResult(googleBooksResult);
    const plannedQueries = googleBooksPlan?.intents.map((intent) => intent.query).filter(Boolean) || [];
    const attemptedQueries = sourceDiagnostics?.googleBooksQueriesAttempted || sourceDiagnostics?.queries || [];
    const rawCount = Number(sourceDiagnostics?.rawApiResultCount ?? sourceDiagnostics?.rawCount ?? googleBooksResult?.rawItems.length ?? 0);
    const rawAcceptedCount = Number(googleBooksResult?.rawItems.length || 0);
    const normalizedCount = normalizedGoogleBooks.length;
    const scoredCount = scoredGoogleBooks.length;
    const selectedCount = selectedGoogleBooks.length;
    const sourceAgeLabels = uniqueStrings((googleBooksResult?.rawItems || []).map((item) => (item as Record<string, unknown>)?.ageBand), 20);
    const maturityBandValues = uniqueStrings(normalizedGoogleBooks.map((candidate) => candidate.maturityBand), 20);

    queryPlanningByDeck[currentDeck] = {
      status: !googleBooksPlan
        ? "failed"
        : !googleBooksPlan.enabled
          ? "disabled"
          : plannedQueries.length
            ? "succeeded"
            : "failed",
      sourcePlanPresent: Boolean(googleBooksPlan),
      enabled: Boolean(googleBooksPlan?.enabled),
      plannedQueryCount: plannedQueries.length,
      plannedQueries,
      skippedReason: googleBooksPlan?.skippedReason || "",
      failureKind: !googleBooksPlan
        ? "query_planning_failure"
        : !googleBooksPlan.enabled
          ? "source_disabled"
          : plannedQueries.length
            ? ""
            : "query_planning_failure_no_googlebooks_intents",
    };
    dispatchByDeck[currentDeck] = {
      status: sourceStatus,
      sourceResultPresent: Boolean(googleBooksResult),
      attempted: Boolean(sourceDiagnostics?.attempted),
      sourceStatus: googleBooksResult?.status || "missing",
      skippedReason: sourceDiagnostics?.skippedReason || "",
      failedReason: sourceDiagnostics?.failedReason || "",
      timedOut: Boolean(sourceDiagnostics?.timedOut),
      attemptedQueries,
      rawApiResultCount: rawCount,
      rawAcceptedCount,
      failureKind: !googleBooksResult
        ? "dispatch_failure_missing_source_result"
        : googleBooksResult.status === "failed" || googleBooksResult.status === "timed_out"
          ? "fetch_failure"
          : googleBooksResult.status === "empty"
            ? "fetch_empty"
            : "",
    };
    normalizationByDeck[currentDeck] = {
      ...googleBooksHandoffStatus(rawAcceptedCount, normalizedCount, "normalization_failure"),
      rawAcceptedCount,
      normalizedCount,
      ageBandLabelsPreservedInRawRows: sourceAgeLabels.length === 0 || sourceAgeLabels.every((label) => label === currentDeck),
      rawAgeBandLabels: sourceAgeLabels,
      normalizedMaturityBandValues: maturityBandValues,
      normalizedContentMaturityValues: uniqueStrings(normalizedGoogleBooks.map((candidate) => candidate.diagnostics?.googleBooksContentMaturity), 20),
      sourceMaturityRatingValues: uniqueStrings(normalizedGoogleBooks.map((candidate) => candidate.diagnostics?.googleBooksSourceMaturityRating), 20),
      note: "V2 normalization keeps Google Books source maturityRating as content maturity and does not compare NOT_MATURE to requested age-band labels.",
    };
    scoringHandoffByDeck[currentDeck] = {
      ...googleBooksHandoffStatus(normalizedCount, scoredCount, "scoring_handoff_failure"),
      normalizedCount,
      scoredCount,
      scoredTitles: uniqueStrings(scoredGoogleBooks.map((candidate) => candidate.title), 120),
      sourceQualityEvaluated: scoredGoogleBooks.every((candidate) => Number.isFinite(Number(candidate.scoreBreakdown?.sourceQualityRelevance))),
      ageSuitabilityEvaluated: scoredGoogleBooks.every((candidate) => Number.isFinite(Number(candidate.scoreBreakdown?.ageTeenSuitability ?? candidate.scoreBreakdown?.ageBandSuitability))),
    };
    eligibilityHandoffByDeck[currentDeck] = {
      status: scoredCount > 0 ? "attempted" : "bypassed",
      scoredCount,
      rejectedCount: scoredGoogleBooks.filter((candidate) => !selectedSet.has(normalizedTokenText(candidate.title)) && candidate.rejectedReasons.length > 0).length,
      cleanCandidateCount: selectedCount,
      finalEligibilityApplied: infrastructureByDeck[currentDeck]?.finalEligibility,
      meaningfulTasteAlignmentApplied: infrastructureByDeck[currentDeck]?.meaningfulTasteAlignment,
    };
    finalSelectionHandoffByDeck[currentDeck] = {
      ...googleBooksHandoffStatus(scoredCount, selectedCount, "final-selection_loss"),
      scoredCount,
      selectedCount,
      selectedTitles: selectedGoogleBooks.map((candidate) => candidate.title),
    };
    renderedTitlesByDeck[currentDeck] = returnedTitles;

    for (const [title, reason] of Object.entries(sourceRejectedBeforeRanking)) {
      dropStageByTitle[title] = googleBooksFailureStageForReason(reason);
      dropReasonByTitle[title] = reason;
    }
    for (const candidate of normalizedGoogleBooks) {
      if (scoredGoogleBooks.some((row) => normalizedTokenText(row.title) === normalizedTokenText(candidate.title))) continue;
      dropStageByTitle[candidate.title] = "scoring_handoff_failure";
      dropReasonByTitle[candidate.title] = "normalized_googlebooks_candidate_missing_from_scoring";
    }
    for (const candidate of scoredGoogleBooks) {
      if (selectedSet.has(normalizedTokenText(candidate.title))) {
        dropStageByTitle[candidate.title] = "rendered_handoff";
        dropReasonByTitle[candidate.title] = "selected_googlebooks_candidate";
        continue;
      }
      const reason = candidate.rejectedReasons.find((entry) => entry !== "selected") || "ranked_below_final_selection";
      dropStageByTitle[candidate.title] = googleBooksFailureStageForReason(reason);
      dropReasonByTitle[candidate.title] = reason;
    }
  }

  return {
    googleBooksAgeBandInfrastructureByDeck: infrastructureByDeck,
    googleBooksAgeBandQueryPlanningByDeck: queryPlanningByDeck,
    googleBooksAgeBandDispatchByDeck: dispatchByDeck,
    googleBooksAgeBandNormalizationByDeck: normalizationByDeck,
    googleBooksAgeBandScoringHandoffByDeck: scoringHandoffByDeck,
    googleBooksAgeBandEligibilityHandoffByDeck: eligibilityHandoffByDeck,
    googleBooksAgeBandFinalSelectionHandoffByDeck: finalSelectionHandoffByDeck,
    googleBooksAgeBandRenderedTitlesByDeck: renderedTitlesByDeck,
    googleBooksAgeBandDropStageByTitle: dropStageByTitle,
    googleBooksAgeBandDropReasonByTitle: dropReasonByTitle,
    googleBooksStageDecisionByTitle,
    googleBooksStageReasonByTitle,
    googleBooksStageGateByTitle,
    googleBooksStageOrder,
    googleBooksAgeBandInfrastructureGaps: googleBooksAgeBandFutureGaps(),
    googleBooksAgeBandInfrastructureSummary: {
      scope: "diagnostic_only_googlebooks_non_adult_infrastructure_audit",
      currentAgeBand,
      currentDeck: currentDeck || "adult_or_unknown",
      productionBehaviorChanged: false,
      sharedInfrastructureAvailable: [
        "query_planning",
        "dispatch",
        "fetch_adapter",
        "normalization",
        "scoring",
        "age_suitability_score",
        "source_quality_score",
        "generic_selection_diversity",
        "session_count_lineage",
      ],
      adultOnlyAssumptionsNotReused: [
        "Adult Google Books metadata-only semantic matcher",
        "Adult Google Books final meaningful-alignment gate",
        "Adult Google Books identity enforcement",
        "Adult Google Books narrative-strength ranking",
        "Adult Google Books cluster diversity",
        "Adult query rewriting with subject:fiction and exclusion terms",
      ],
      recommendedImplementationSequence: [
        "Verify each younger age band can produce Google Books rows with appropriate age metadata.",
        "Decide whether Google Books maturityRating should be treated separately from app ageBand labels.",
        "Add age-band-specific publication-shape and artifact audits before quality tuning.",
        "Only after those audits, design Kids, Pre-Teen, or Teen Google Books final eligibility gates independently.",
      ],
    },
    googleBooksAudienceBandByTitle: audienceBandByTitle,
    googleBooksContentMaturityByTitle: contentMaturityByTitle,
    googleBooksSourceMaturityRatingByTitle: sourceMaturityRatingByTitle,
    googleBooksRequestedDeckByTitle: requestedDeckByTitle,
    googleBooksAgeSuitabilityDecisionByTitle: ageSuitabilityDecisionByTitle,
    googleBooksMaturityDecisionByTitle: maturityDecisionByTitle,
    googleBooksAudienceMaturityComparisonByTitle: audienceMaturityComparisonByTitle,
    googleBooksAudienceMaturityMismatchTitles: Array.from(new Set(audienceMaturityMismatchTitles)),
    googleBooksAudienceMaturitySemanticChanges: [
      "google_books_maturity_rating_preserved_as_source_maturity_rating",
      "google_books_not_mature_mapped_to_content_maturity_not_age_band",
      "requested_deck_age_band_kept_separate_from_content_maturity",
      "explicit_mature_google_books_content_rejected_for_kids_and_preteens",
      "unknown_google_books_maturity_is_not_treated_as_mature_or_as_a_deck_label",
    ],
  };
}

type AdultGoogleBooksNormalizationDiagnostics = {
  googleBooksNormalizedRejectReasonByTitle: Record<string, string>;
  googleBooksNormalizationEligibilityByTitle: Record<string, boolean>;
  googleBooksNarrativeEvidenceByTitle: Record<string, string[]>;
  googleBooksAnthologyEvidenceByTitle: Record<string, string[]>;
  googleBooksReferenceEvidenceByTitle: Record<string, string[]>;
  googleBooksPublisherEvidenceByTitle: Record<string, string[]>;
  googleBooksPublicationShapeByTitle: Record<string, string>;
  googleBooksNarrativeConfidenceByTitle: Record<string, number>;
  googleBooksPublicationShapeEvidenceByTitle: Record<string, string[]>;
  googleBooksNarrativePriorityAdjustmentByTitle: Record<string, number>;
  googleBooksPublicationShapeRejectedBeforeRankingByTitle: Record<string, string>;
  googleBooksDominantPublicationShapeEvidenceByTitle: Record<string, string[]>;
  googleBooksOverriddenNarrativeEvidenceByTitle: Record<string, string[]>;
  googleBooksPublicationShapePrecedenceDecisionByTitle: Record<string, string>;
  googleBooksExplicitNonNarrativeIdentityByTitle: Record<string, string[]>;
  googleBooksStoryLevelNarrativeEvidenceByTitle: Record<string, string[]>;
  googleBooksGenericCategoryTitleByTitle: Record<string, boolean>;
  googleBooksGenericCategoryEvidenceByTitle: Record<string, string[]>;
  googleBooksGenericCategoryRejectedBeforeRankingByTitle: Record<string, string>;
  googleBooksUnknownShapeEligibilityByTitle: Record<string, boolean>;
  googleBooksUnknownShapeEvidenceByTitle: Record<string, string[]>;
  googleBooksUnknownShapeRejectedReasonByTitle: Record<string, string>;
  googleBooksUnknownStoryEvidenceCountByTitle: Record<string, number>;
  googleBooksUnknownStoryEvidenceFamiliesByTitle: Record<string, string[]>;
  googleBooksUnknownNarrativeCorroborationByTitle: Record<string, string[]>;
  googleBooksUnknownEligibilityThresholdDecisionByTitle: Record<string, string>;
  googleBooksSubjectOfStudyTitleByTitle: Record<string, boolean>;
  googleBooksSubjectOfStudyEvidenceByTitle: Record<string, string[]>;
  googleBooksSubjectOfStudyRejectedBeforeRankingByTitle: Record<string, string>;
  googleBooksCuratedBookGuideIdentityByTitle: Record<string, boolean>;
  googleBooksCuratedBookGuideEvidenceByTitle: Record<string, string[]>;
  googleBooksPeriodicalIdentityEvidenceByTitle: Record<string, string[]>;
  googleBooksPeriodicalIdentityDecisionByTitle: Record<string, string>;
  googleBooksEnteredRanking: string[];
  googleBooksRejectedBeforeRankingReason: Record<string, string>;
};

function normalizedLowerText(value: unknown): string {
  return String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function adultGoogleBooksNarrativeEvidenceFromNormalized(candidate: NormalizedCandidate): string[] {
  const title = normalizedLowerText(candidate.title);
  const subtitle = normalizedLowerText(candidate.subtitle || "");
  const description = normalizedLowerText(candidate.description || "");
  const combined = `${title} ${subtitle} ${description}`.trim();
  const evidence: string[] = [];
  if (/\ba novel\b/.test(combined)) evidence.push("novel_identity_marker");
  if (/\b(?:follows|story of|tells the story|centers on|must survive|must uncover|must confront|must choose|must save|protagonist|heroine|hero|detective|characters?|family saga)\b/.test(description)) {
    evidence.push("character_event_synopsis_shape");
  }
  if (/\b(?:thriller|mystery|fantasy|romance|science fiction|historical fiction|horror)\b/.test(`${subtitle} ${description}`)) {
    evidence.push("genre_narrative_description_marker");
  }
  return Array.from(new Set(evidence));
}

function adultGoogleBooksAnthologyEvidenceFromNormalized(candidate: NormalizedCandidate): string[] {
  const title = normalizedLowerText(candidate.title);
  const subtitle = normalizedLowerText(candidate.subtitle || "");
  const description = normalizedLowerText(candidate.description || "");
  const combined = `${title} ${subtitle} ${description}`.trim();
  const evidence: string[] = [];
  if (/\b(?:year'?s best|best of the year|best in science fiction|annual antholog(?:y|ies)|annual collection)\b/.test(combined)) {
    evidence.push("annual_or_best_of_collection_shape");
  }
  if (/\b(?:antholog(?:y|ies)|collection of stories|selected by|edited by|editor)\b/.test(combined)) {
    evidence.push("anthology_editorial_shape");
  }
  return Array.from(new Set(evidence));
}

function adultGoogleBooksReferenceEvidenceFromNormalized(candidate: NormalizedCandidate): string[] {
  const title = normalizedLowerText(candidate.title);
  const subtitle = normalizedLowerText(candidate.subtitle || "");
  const description = normalizedLowerText(candidate.description || "");
  const genres = (candidate.genres || []).map((value) => normalizedLowerText(value)).join(" | ");
  const combined = `${title} ${subtitle} ${description} ${genres}`.trim();
  const evidence: string[] = [];
  if (/\b(?:encyclop(?:a)?edia|encyclopedic|dictionary|directory|compendium|handbook|reference guide|bibliograph(?:y|ies)|survey|companion to)\b/.test(combined)) {
    evidence.push("reference_work_shape");
  }
  if (/\b(?:literary criticism|history and criticism|critical (?:study|analysis|essays?)|scholarship|studies in)\b/.test(combined)) {
    evidence.push("criticism_or_scholarship_shape");
  }
  if (/\b(?:guide to|introduction to|for students|for teachers|study guide|textbook|workbook|course text|exam prep(?:aration)?|certification (?:exam|guide|prep))\b/.test(combined)) {
    evidence.push("instructional_reference_shape");
  }
  return Array.from(new Set(evidence));
}

function adultGoogleBooksPublisherEvidenceFromNormalized(candidate: NormalizedCandidate): string[] {
  const title = normalizedLowerText(candidate.title);
  const publisher = normalizedLowerText((candidate.raw as Record<string, unknown> | undefined)?.publisher || "");
  const evidence: string[] = [];
  if (publisher && (title === publisher || title.includes(`${publisher} `) || title.endsWith(` ${publisher}`))) {
    evidence.push("title_matches_publisher_identity");
  }
  if (/^\s*[a-z0-9'&.\- ]+\b(?:press|books|book company|publishing|publishers|house|imprint)\s*$/.test(title)) {
    evidence.push("publisher_or_imprint_title_shape");
  }
  if (/\b(?:publisher(?:'s)? catalog|publishing catalog|book catalog|catalogue)\b/.test(title)) {
    evidence.push("publisher_catalog_shape");
  }
  return Array.from(new Set(evidence));
}

const ADULT_GOOGLE_BOOKS_NON_NARRATIVE_PUBLICATION_SHAPES = new Set([
  "reference",
  "critical_study",
  "academic_text",
  "interview_collection",
  "author_commentary",
  "writing_guide",
  "readers_advisory",
  "genre_survey",
  "literary_history",
  "public_domain_compilation",
  "nonfiction",
  "anthology",
  "essay_collection",
  "periodical",
  "production_history",
  "miscellany",
  "generic_category_catalog",
]);

function adultGoogleBooksShapeDiagnostics(candidate: NormalizedCandidate): {
  shape: string;
  narrativeConfidence: number;
  evidence: string[];
  narrativePriorityAdjustment: number;
  dominantPublicationShapeEvidence: string[];
  overriddenNarrativeEvidence: string[];
  publicationShapePrecedenceDecision: string;
  explicitNonNarrativeIdentity: string[];
  storyLevelNarrativeEvidence: string[];
  genericCategoryTitle: boolean;
  genericCategoryEvidence: string[];
  unknownShapeEligibility: boolean;
  unknownShapeEvidence: string[];
  unknownShapeRejectedReason: string;
  unknownStoryEvidenceCount: number;
  unknownStoryEvidenceFamilies: string[];
  unknownNarrativeCorroboration: string[];
  unknownEligibilityThresholdDecision: string;
  subjectOfStudyTitle: boolean;
  subjectOfStudyEvidence: string[];
  curatedBookGuideIdentity: boolean;
  curatedBookGuideEvidence: string[];
  periodicalIdentityEvidence: string[];
  periodicalIdentityDecision: string;
} {
  const raw = (candidate.raw || {}) as Record<string, unknown>;
  const diagnostics = candidate.diagnostics || {};
  const shape = String(diagnostics.googleBooksPublicationShape || raw.googleBooksPublicationShape || "unknown");
  const narrativeConfidence = Number(diagnostics.googleBooksNarrativeConfidence ?? raw.googleBooksNarrativeConfidence ?? 0);
  const narrativePriorityAdjustment = Number(diagnostics.googleBooksNarrativePriorityAdjustment ?? raw.googleBooksNarrativePriorityAdjustment ?? 0);
  const evidenceValue = diagnostics.googleBooksPublicationShapeEvidence || raw.googleBooksPublicationShapeEvidence;
  const evidence = Array.isArray(evidenceValue) ? evidenceValue.map((item) => String(item || "")).filter(Boolean) : [];
  const dominantEvidenceValue = diagnostics.googleBooksDominantPublicationShapeEvidence || raw.googleBooksDominantPublicationShapeEvidence;
  const overriddenEvidenceValue = diagnostics.googleBooksOverriddenNarrativeEvidence || raw.googleBooksOverriddenNarrativeEvidence;
  const explicitIdentityValue = diagnostics.googleBooksExplicitNonNarrativeIdentity || raw.googleBooksExplicitNonNarrativeIdentity;
  const storyEvidenceValue = diagnostics.googleBooksStoryLevelNarrativeEvidence || raw.googleBooksStoryLevelNarrativeEvidence;
  const genericEvidenceValue = diagnostics.googleBooksGenericCategoryEvidence || raw.googleBooksGenericCategoryEvidence;
  const unknownEvidenceValue = diagnostics.googleBooksUnknownShapeEvidence || raw.googleBooksUnknownShapeEvidence;
  const unknownStoryFamiliesValue = diagnostics.googleBooksUnknownStoryEvidenceFamilies || raw.googleBooksUnknownStoryEvidenceFamilies;
  const unknownCorroborationValue = diagnostics.googleBooksUnknownNarrativeCorroboration || raw.googleBooksUnknownNarrativeCorroboration;
  const subjectOfStudyEvidenceValue = diagnostics.googleBooksSubjectOfStudyEvidence || raw.googleBooksSubjectOfStudyEvidence;
  const curatedBookGuideEvidenceValue = diagnostics.googleBooksCuratedBookGuideEvidence || raw.googleBooksCuratedBookGuideEvidence;
  const periodicalIdentityEvidenceValue = diagnostics.googleBooksPeriodicalIdentityEvidence || raw.googleBooksPeriodicalIdentityEvidence;
  return {
    shape,
    narrativeConfidence: Number.isFinite(narrativeConfidence) ? narrativeConfidence : 0,
    evidence,
    narrativePriorityAdjustment: Number.isFinite(narrativePriorityAdjustment) ? narrativePriorityAdjustment : 0,
    dominantPublicationShapeEvidence: Array.isArray(dominantEvidenceValue) ? dominantEvidenceValue.map((item) => String(item || "")).filter(Boolean) : [],
    overriddenNarrativeEvidence: Array.isArray(overriddenEvidenceValue) ? overriddenEvidenceValue.map((item) => String(item || "")).filter(Boolean) : [],
    publicationShapePrecedenceDecision: String(diagnostics.googleBooksPublicationShapePrecedenceDecision || raw.googleBooksPublicationShapePrecedenceDecision || ""),
    explicitNonNarrativeIdentity: Array.isArray(explicitIdentityValue) ? explicitIdentityValue.map((item) => String(item || "")).filter(Boolean) : [],
    storyLevelNarrativeEvidence: Array.isArray(storyEvidenceValue) ? storyEvidenceValue.map((item) => String(item || "")).filter(Boolean) : [],
    genericCategoryTitle: Boolean(diagnostics.googleBooksGenericCategoryTitle ?? raw.googleBooksGenericCategoryTitle),
    genericCategoryEvidence: Array.isArray(genericEvidenceValue) ? genericEvidenceValue.map((item) => String(item || "")).filter(Boolean) : [],
    unknownShapeEligibility: Boolean(diagnostics.googleBooksUnknownShapeEligibility ?? raw.googleBooksUnknownShapeEligibility),
    unknownShapeEvidence: Array.isArray(unknownEvidenceValue) ? unknownEvidenceValue.map((item) => String(item || "")).filter(Boolean) : [],
    unknownShapeRejectedReason: String(diagnostics.googleBooksUnknownShapeRejectedReason || raw.googleBooksUnknownShapeRejectedReason || ""),
    unknownStoryEvidenceCount: Number(diagnostics.googleBooksUnknownStoryEvidenceCount ?? raw.googleBooksUnknownStoryEvidenceCount ?? 0),
    unknownStoryEvidenceFamilies: Array.isArray(unknownStoryFamiliesValue) ? unknownStoryFamiliesValue.map((item) => String(item || "")).filter(Boolean) : [],
    unknownNarrativeCorroboration: Array.isArray(unknownCorroborationValue) ? unknownCorroborationValue.map((item) => String(item || "")).filter(Boolean) : [],
    unknownEligibilityThresholdDecision: String(diagnostics.googleBooksUnknownEligibilityThresholdDecision || raw.googleBooksUnknownEligibilityThresholdDecision || ""),
    subjectOfStudyTitle: Boolean(diagnostics.googleBooksSubjectOfStudyTitle ?? raw.googleBooksSubjectOfStudyTitle),
    subjectOfStudyEvidence: Array.isArray(subjectOfStudyEvidenceValue) ? subjectOfStudyEvidenceValue.map((item) => String(item || "")).filter(Boolean) : [],
    curatedBookGuideIdentity: Boolean(diagnostics.googleBooksCuratedBookGuideIdentity ?? raw.googleBooksCuratedBookGuideIdentity),
    curatedBookGuideEvidence: Array.isArray(curatedBookGuideEvidenceValue) ? curatedBookGuideEvidenceValue.map((item) => String(item || "")).filter(Boolean) : [],
    periodicalIdentityEvidence: Array.isArray(periodicalIdentityEvidenceValue) ? periodicalIdentityEvidenceValue.map((item) => String(item || "")).filter(Boolean) : [],
    periodicalIdentityDecision: String(diagnostics.googleBooksPeriodicalIdentityDecision || raw.googleBooksPeriodicalIdentityDecision || ""),
  };
}

function adultGoogleBooksPublicationShapeRejectReason(shapeDiagnostics: ReturnType<typeof adultGoogleBooksShapeDiagnostics>): string {
  if (ADULT_GOOGLE_BOOKS_NON_NARRATIVE_PUBLICATION_SHAPES.has(shapeDiagnostics.shape)) {
    return `publication_shape_${shapeDiagnostics.shape}`;
  }
  if (shapeDiagnostics.shape === "unknown" && !shapeDiagnostics.unknownShapeEligibility) {
    return shapeDiagnostics.unknownShapeRejectedReason || "publication_shape_unknown_insufficient_narrative_identity";
  }
  return "";
}

function applyAdultGoogleBooksNormalizationGate(candidates: NormalizedCandidate[], profile: TasteProfile): { candidates: NormalizedCandidate[]; diagnostics: AdultGoogleBooksNormalizationDiagnostics } {
  const diagnostics: AdultGoogleBooksNormalizationDiagnostics = {
    googleBooksNormalizedRejectReasonByTitle: {},
    googleBooksNormalizationEligibilityByTitle: {},
    googleBooksNarrativeEvidenceByTitle: {},
    googleBooksAnthologyEvidenceByTitle: {},
    googleBooksReferenceEvidenceByTitle: {},
    googleBooksPublisherEvidenceByTitle: {},
    googleBooksPublicationShapeByTitle: {},
    googleBooksNarrativeConfidenceByTitle: {},
    googleBooksPublicationShapeEvidenceByTitle: {},
    googleBooksNarrativePriorityAdjustmentByTitle: {},
    googleBooksPublicationShapeRejectedBeforeRankingByTitle: {},
    googleBooksDominantPublicationShapeEvidenceByTitle: {},
    googleBooksOverriddenNarrativeEvidenceByTitle: {},
    googleBooksPublicationShapePrecedenceDecisionByTitle: {},
    googleBooksExplicitNonNarrativeIdentityByTitle: {},
    googleBooksStoryLevelNarrativeEvidenceByTitle: {},
    googleBooksGenericCategoryTitleByTitle: {},
    googleBooksGenericCategoryEvidenceByTitle: {},
    googleBooksGenericCategoryRejectedBeforeRankingByTitle: {},
    googleBooksUnknownShapeEligibilityByTitle: {},
    googleBooksUnknownShapeEvidenceByTitle: {},
    googleBooksUnknownShapeRejectedReasonByTitle: {},
    googleBooksUnknownStoryEvidenceCountByTitle: {},
    googleBooksUnknownStoryEvidenceFamiliesByTitle: {},
    googleBooksUnknownNarrativeCorroborationByTitle: {},
    googleBooksUnknownEligibilityThresholdDecisionByTitle: {},
    googleBooksSubjectOfStudyTitleByTitle: {},
    googleBooksSubjectOfStudyEvidenceByTitle: {},
    googleBooksSubjectOfStudyRejectedBeforeRankingByTitle: {},
    googleBooksCuratedBookGuideIdentityByTitle: {},
    googleBooksCuratedBookGuideEvidenceByTitle: {},
    googleBooksPeriodicalIdentityEvidenceByTitle: {},
    googleBooksPeriodicalIdentityDecisionByTitle: {},
    googleBooksEnteredRanking: [],
    googleBooksRejectedBeforeRankingReason: {},
  };
  if (profile.ageBand !== "adult") {
    return { candidates, diagnostics };
  }
  const filtered: NormalizedCandidate[] = [];
  for (const candidate of candidates) {
    if (candidate.source !== "googleBooks") {
      filtered.push(candidate);
      continue;
    }
    const title = String(candidate.title || "").trim();
    if (!title) continue;
    const narrativeEvidence = adultGoogleBooksNarrativeEvidenceFromNormalized(candidate);
    const anthologyEvidence = adultGoogleBooksAnthologyEvidenceFromNormalized(candidate);
    const referenceEvidence = adultGoogleBooksReferenceEvidenceFromNormalized(candidate);
    const publisherEvidence = adultGoogleBooksPublisherEvidenceFromNormalized(candidate);
    const shapeDiagnostics = adultGoogleBooksShapeDiagnostics(candidate);
    // series_installment with story-level evidence: exempt from all normalization-gate
    // reference/scholarship checks (no contradictory identity present).
    const confirmedNarrativeSeriesInstallment = shapeDiagnostics.shape === "series_installment"
      && shapeDiagnostics.storyLevelNarrativeEvidence.length > 0
      && shapeDiagnostics.explicitNonNarrativeIdentity.length === 0;
    // novel with story-level evidence: exempt only from incidental reference/companion/survey
    // words, but NOT from hard instructional identity (study guide, textbook, workbook,
    // exam-prep, certification) which contradicts a narrative publication identity.
    const hasHardInstructionalEvidence = referenceEvidence.includes("instructional_reference_shape");
    const confirmedNarrativeIdentityFromShape = confirmedNarrativeSeriesInstallment
      || (shapeDiagnostics.shape === "novel"
        && shapeDiagnostics.storyLevelNarrativeEvidence.length > 0
        && shapeDiagnostics.explicitNonNarrativeIdentity.length === 0
        && !hasHardInstructionalEvidence);
    const publicationShapeRejectReason = adultGoogleBooksPublicationShapeRejectReason(shapeDiagnostics);
    let rejectReason = "";
    if (publicationShapeRejectReason) rejectReason = publicationShapeRejectReason;
    else if (anthologyEvidence.length > 0) rejectReason = "anthology_or_best_of_reference_shape";
    else if (referenceEvidence.length > 0 && !confirmedNarrativeIdentityFromShape) rejectReason = "reference_or_scholarship_shape";
    else if (publisherEvidence.length > 0 && narrativeEvidence.length === 0) rejectReason = "publisher_identity_without_narrative_evidence";

    const eligible = !rejectReason;
    diagnostics.googleBooksNormalizationEligibilityByTitle[title] = eligible;
    diagnostics.googleBooksNarrativeEvidenceByTitle[title] = narrativeEvidence;
    diagnostics.googleBooksAnthologyEvidenceByTitle[title] = anthologyEvidence;
    diagnostics.googleBooksReferenceEvidenceByTitle[title] = referenceEvidence;
    diagnostics.googleBooksPublisherEvidenceByTitle[title] = publisherEvidence;
    diagnostics.googleBooksPublicationShapeByTitle[title] = shapeDiagnostics.shape;
    diagnostics.googleBooksNarrativeConfidenceByTitle[title] = shapeDiagnostics.narrativeConfidence;
    diagnostics.googleBooksPublicationShapeEvidenceByTitle[title] = shapeDiagnostics.evidence;
    diagnostics.googleBooksNarrativePriorityAdjustmentByTitle[title] = shapeDiagnostics.narrativePriorityAdjustment;
    diagnostics.googleBooksDominantPublicationShapeEvidenceByTitle[title] = shapeDiagnostics.dominantPublicationShapeEvidence;
    diagnostics.googleBooksOverriddenNarrativeEvidenceByTitle[title] = shapeDiagnostics.overriddenNarrativeEvidence;
    diagnostics.googleBooksPublicationShapePrecedenceDecisionByTitle[title] = shapeDiagnostics.publicationShapePrecedenceDecision;
    diagnostics.googleBooksExplicitNonNarrativeIdentityByTitle[title] = shapeDiagnostics.explicitNonNarrativeIdentity;
    diagnostics.googleBooksStoryLevelNarrativeEvidenceByTitle[title] = shapeDiagnostics.storyLevelNarrativeEvidence;
    diagnostics.googleBooksGenericCategoryTitleByTitle[title] = shapeDiagnostics.genericCategoryTitle;
    diagnostics.googleBooksGenericCategoryEvidenceByTitle[title] = shapeDiagnostics.genericCategoryEvidence;
    diagnostics.googleBooksUnknownShapeEligibilityByTitle[title] = shapeDiagnostics.unknownShapeEligibility;
    diagnostics.googleBooksUnknownShapeEvidenceByTitle[title] = shapeDiagnostics.unknownShapeEvidence;
    if (shapeDiagnostics.unknownShapeRejectedReason) diagnostics.googleBooksUnknownShapeRejectedReasonByTitle[title] = shapeDiagnostics.unknownShapeRejectedReason;
    diagnostics.googleBooksUnknownStoryEvidenceCountByTitle[title] = shapeDiagnostics.unknownStoryEvidenceCount;
    diagnostics.googleBooksUnknownStoryEvidenceFamiliesByTitle[title] = shapeDiagnostics.unknownStoryEvidenceFamilies;
    diagnostics.googleBooksUnknownNarrativeCorroborationByTitle[title] = shapeDiagnostics.unknownNarrativeCorroboration;
    diagnostics.googleBooksUnknownEligibilityThresholdDecisionByTitle[title] = shapeDiagnostics.unknownEligibilityThresholdDecision;
    diagnostics.googleBooksSubjectOfStudyTitleByTitle[title] = shapeDiagnostics.subjectOfStudyTitle;
    diagnostics.googleBooksSubjectOfStudyEvidenceByTitle[title] = shapeDiagnostics.subjectOfStudyEvidence;
    diagnostics.googleBooksCuratedBookGuideIdentityByTitle[title] = shapeDiagnostics.curatedBookGuideIdentity;
    diagnostics.googleBooksCuratedBookGuideEvidenceByTitle[title] = shapeDiagnostics.curatedBookGuideEvidence;
    diagnostics.googleBooksPeriodicalIdentityEvidenceByTitle[title] = shapeDiagnostics.periodicalIdentityEvidence;
    diagnostics.googleBooksPeriodicalIdentityDecisionByTitle[title] = shapeDiagnostics.periodicalIdentityDecision;
    diagnostics.googleBooksNormalizedRejectReasonByTitle[title] = eligible ? "entered_ranking" : rejectReason;
    if (eligible) {
      diagnostics.googleBooksEnteredRanking.push(title);
      filtered.push(candidate);
    } else {
      diagnostics.googleBooksRejectedBeforeRankingReason[title] = rejectReason;
      if (publicationShapeRejectReason) diagnostics.googleBooksPublicationShapeRejectedBeforeRankingByTitle[title] = publicationShapeRejectReason;
      if (publicationShapeRejectReason === "publication_shape_generic_category_catalog") diagnostics.googleBooksGenericCategoryRejectedBeforeRankingByTitle[title] = publicationShapeRejectReason;
      if (shapeDiagnostics.subjectOfStudyTitle && publicationShapeRejectReason) diagnostics.googleBooksSubjectOfStudyRejectedBeforeRankingByTitle[title] = publicationShapeRejectReason;
    }
  }
  diagnostics.googleBooksEnteredRanking = uniqueStrings(diagnostics.googleBooksEnteredRanking, 80);
  return { candidates: filtered, diagnostics };
}

type PreteenGoogleBooksPublicationIdentityPreScoringDiagnostics = {
  auditByTitle: Record<string, PreteenGoogleBooksPublicationIdentityAudit>;
  rejectedBeforeScoringByTitle: Record<string, string>;
  enteredScoringTitles: string[];
};

function emptyPreteenGoogleBooksPublicationIdentityPreScoringDiagnostics(): PreteenGoogleBooksPublicationIdentityPreScoringDiagnostics {
  return { auditByTitle: {}, rejectedBeforeScoringByTitle: {}, enteredScoringTitles: [] };
}

export function applyPreteenGoogleBooksPublicationIdentityPreScoringGate(
  candidates: NormalizedCandidate[],
  profile: TasteProfile,
): { candidates: NormalizedCandidate[]; diagnostics: PreteenGoogleBooksPublicationIdentityPreScoringDiagnostics } {
  const diagnostics = emptyPreteenGoogleBooksPublicationIdentityPreScoringDiagnostics();
  if (profile.ageBand !== "preteens") return { candidates, diagnostics };

  const filtered: NormalizedCandidate[] = [];
  for (const candidate of candidates) {
    if (candidate.source !== "googleBooks") {
      filtered.push(candidate);
      continue;
    }
    const title = String(candidate.title || "").trim();
    if (!title) continue;
    const audit = preteenGoogleBooksPublicationIdentityAudit(candidate);
    annotatePreteenGoogleBooksPublicationIdentity(candidate, audit);
    diagnostics.auditByTitle[title] = audit;
    if (audit.allowed) {
      diagnostics.enteredScoringTitles.push(title);
      filtered.push(candidate);
    } else {
      diagnostics.rejectedBeforeScoringByTitle[title] = audit.reason;
    }
  }
  diagnostics.enteredScoringTitles = uniqueStrings(diagnostics.enteredScoringTitles, 120);
  return { candidates: filtered, diagnostics };
}

function preteenGoogleBooksPublicationIdentityPreScoringObservability(
  diagnostics: PreteenGoogleBooksPublicationIdentityPreScoringDiagnostics,
): Record<string, unknown> {
  const identityByTitle: Record<string, string> = {};
  const confidenceByTitle: Record<string, number> = {};
  const evidenceByTitle: Record<string, string[]> = {};
  const narrativeEvidenceByTitle: Record<string, string[]> = {};
  const artifactEvidenceByTitle: Record<string, string[]> = {};
  const narrativeConfidenceSourceByTitle: Record<string, string[]> = {};
  const trustedFieldEvidenceByTitle: Record<string, string[]> = {};
  const overriddenNarrativeEvidenceByTitle: Record<string, string[]> = {};
  const decisionByTitle: Record<string, string> = {};
  const reasonByTitle: Record<string, string> = {};
  const recommendedFuturePolicyByTitle: Record<string, string> = {};
  for (const [title, audit] of Object.entries(diagnostics.auditByTitle)) {
    identityByTitle[title] = audit.identity;
    confidenceByTitle[title] = audit.confidence;
    evidenceByTitle[title] = audit.evidence;
    narrativeEvidenceByTitle[title] = audit.narrativeEvidence;
    artifactEvidenceByTitle[title] = audit.artifactEvidence;
    narrativeConfidenceSourceByTitle[title] = audit.narrativeConfidenceSource;
    trustedFieldEvidenceByTitle[title] = audit.trustedFieldEvidence;
    overriddenNarrativeEvidenceByTitle[title] = audit.overriddenNarrativeEvidence;
    decisionByTitle[title] = audit.allowed ? "entered_scoring" : "rejected";
    reasonByTitle[title] = audit.reason;
    recommendedFuturePolicyByTitle[title] = audit.recommendedFuturePolicyDecision;
  }
  const rejectedTitles = Object.keys(diagnostics.rejectedBeforeScoringByTitle);
  return {
    preteenGoogleBooksPublicationIdentityByTitle: identityByTitle,
    preteenGoogleBooksPublicationIdentityConfidenceByTitle: confidenceByTitle,
    preteenGoogleBooksPublicationIdentityEvidenceByTitle: evidenceByTitle,
    preteenGoogleBooksPublicationNarrativeEvidenceByTitle: narrativeEvidenceByTitle,
    preteenGoogleBooksPublicationArtifactEvidenceByTitle: artifactEvidenceByTitle,
    preteenGoogleBooksPublicationNarrativeConfidenceSourceByTitle: narrativeConfidenceSourceByTitle,
    preteenGoogleBooksPublicationTrustedFieldEvidenceByTitle: trustedFieldEvidenceByTitle,
    preteenGoogleBooksPublicationOverriddenNarrativeEvidenceByTitle: overriddenNarrativeEvidenceByTitle,
    preteenGoogleBooksPublicationDecisionByTitle: decisionByTitle,
    preteenGoogleBooksPublicationReasonByTitle: reasonByTitle,
    preteenGoogleBooksPublicationRecommendedFuturePolicyByTitle: recommendedFuturePolicyByTitle,
    preteenGoogleBooksPublicationRejectedTitles: rejectedTitles,
    preteenGoogleBooksPublicationIdentityRejectedBeforeScoringByTitle: diagnostics.rejectedBeforeScoringByTitle,
    preteenGoogleBooksPublicationIdentityEnteredScoringTitles: diagnostics.enteredScoringTitles,
    preteenGoogleBooksPublicationIdentityPreScoringSummary: {
      scope: "preteen_googlebooks_recognized_publication_identity_pre_scoring_enforcement",
      consideredCount: Object.keys(diagnostics.auditByTitle).length,
      rejectedBeforeScoringCount: rejectedTitles.length,
      enteredScoringCount: diagnostics.enteredScoringTitles.length,
      classifierRulesChanged: false,
      ageSuitabilityRulesChanged: false,
      scoringOrSelectionRulesChanged: false,
    },
  };
}

function mergePreteenGoogleBooksPublicationIdentityPreScoringObservability(
  target: Record<string, unknown>,
  observability: Record<string, unknown>,
): void {
  const recordFields = [
    "preteenGoogleBooksPublicationIdentityByTitle",
    "preteenGoogleBooksPublicationIdentityConfidenceByTitle",
    "preteenGoogleBooksPublicationIdentityEvidenceByTitle",
    "preteenGoogleBooksPublicationNarrativeEvidenceByTitle",
    "preteenGoogleBooksPublicationArtifactEvidenceByTitle",
    "preteenGoogleBooksPublicationNarrativeConfidenceSourceByTitle",
    "preteenGoogleBooksPublicationTrustedFieldEvidenceByTitle",
    "preteenGoogleBooksPublicationOverriddenNarrativeEvidenceByTitle",
    "preteenGoogleBooksPublicationDecisionByTitle",
    "preteenGoogleBooksPublicationReasonByTitle",
    "preteenGoogleBooksPublicationRecommendedFuturePolicyByTitle",
  ];
  for (const field of recordFields) {
    target[field] = {
      ...((observability[field] || {}) as Record<string, unknown>),
      ...((target[field] || {}) as Record<string, unknown>),
    };
  }
  target.preteenGoogleBooksPublicationRejectedTitles = uniqueStrings([
    ...((observability.preteenGoogleBooksPublicationRejectedTitles || []) as string[]),
    ...((target.preteenGoogleBooksPublicationRejectedTitles || []) as string[]),
  ], 120);
  target.preteenGoogleBooksPublicationIdentityRejectedBeforeScoringByTitle = observability.preteenGoogleBooksPublicationIdentityRejectedBeforeScoringByTitle || {};
  target.preteenGoogleBooksPublicationIdentityEnteredScoringTitles = observability.preteenGoogleBooksPublicationIdentityEnteredScoringTitles || [];
  target.preteenGoogleBooksPublicationIdentityPreScoringSummary = observability.preteenGoogleBooksPublicationIdentityPreScoringSummary || {};
  for (const reason of Object.values((observability.preteenGoogleBooksPublicationIdentityRejectedBeforeScoringByTitle || {}) as Record<string, string>)) {
    target[reason] = Number(target[reason] || 0) + 1;
  }
}

type TeensGoogleBooksPreScoringDiagnostics = {
  ageSuitabilityScoreByTitle: Record<string, number>;
  decisionByTitle: Record<string, string>;
  rejectedBeforeScoringByTitle: Record<string, string>;
  enteredScoringTitles: string[];
};

const TEENS_GOOGLE_BOOKS_CONCLUSIVE_AGE_SUITABILITY_MAX = -4.5;

function emptyTeensGoogleBooksPreScoringDiagnostics(): TeensGoogleBooksPreScoringDiagnostics {
  return { ageSuitabilityScoreByTitle: {}, decisionByTitle: {}, rejectedBeforeScoringByTitle: {}, enteredScoringTitles: [] };
}

export function applyTeensGoogleBooksPreScoringGate(
  candidates: NormalizedCandidate[],
  profile: TasteProfile,
): { candidates: NormalizedCandidate[]; diagnostics: TeensGoogleBooksPreScoringDiagnostics } {
  const diagnostics = emptyTeensGoogleBooksPreScoringDiagnostics();
  if (profile.ageBand !== "teens") return { candidates, diagnostics };
  const filtered: NormalizedCandidate[] = [];
  for (const candidate of candidates) {
    if (candidate.source !== "googleBooks") {
      filtered.push(candidate);
      continue;
    }
    const title = String(candidate.title || "").trim();
    if (!title) continue;
    const suitability = ageSuitabilityScore(candidate, profile);
    diagnostics.ageSuitabilityScoreByTitle[title] = suitability;
    if (suitability <= TEENS_GOOGLE_BOOKS_CONCLUSIVE_AGE_SUITABILITY_MAX) {
      const reason = "teen_googlebooks_conclusive_age_suitability_rejection";
      diagnostics.decisionByTitle[title] = reason;
      diagnostics.rejectedBeforeScoringByTitle[title] = reason;
    } else {
      diagnostics.decisionByTitle[title] = "teen_googlebooks_pre_scoring_age_suitability_passed";
      diagnostics.enteredScoringTitles.push(title);
      filtered.push(candidate);
    }
  }
  diagnostics.enteredScoringTitles = uniqueStrings(diagnostics.enteredScoringTitles, 120);
  return { candidates: filtered, diagnostics };
}

function teensGoogleBooksPreScoringObservability(diagnostics: TeensGoogleBooksPreScoringDiagnostics): Record<string, unknown> {
  return {
    teensGoogleBooksPreScoringAgeSuitabilityScoreByTitle: diagnostics.ageSuitabilityScoreByTitle,
    teensGoogleBooksPreScoringDecisionByTitle: diagnostics.decisionByTitle,
    teensGoogleBooksRejectedBeforeScoringByTitle: diagnostics.rejectedBeforeScoringByTitle,
    teensGoogleBooksEnteredScoringTitles: diagnostics.enteredScoringTitles,
    teensGoogleBooksPreScoringSummary: {
      scope: "teens_googlebooks_conclusive_age_suitability_pre_scoring_enforcement",
      consideredCount: Object.keys(diagnostics.decisionByTitle).length,
      rejectedBeforeScoringCount: Object.keys(diagnostics.rejectedBeforeScoringByTitle).length,
      enteredScoringCount: diagnostics.enteredScoringTitles.length,
      conclusiveAgeSuitabilityMaximum: TEENS_GOOGLE_BOOKS_CONCLUSIVE_AGE_SUITABILITY_MAX,
      explicitMaturePolicy: "tracked_separately_not_rejected",
      classifierRulesChanged: false,
      rescuePolicyChanged: false,
      scoringOrRankingRulesChanged: false,
    },
  };
}

type KidsGoogleBooksPreScoringDiagnostics = {
  decisionByTitle: Record<string, string>;
  rejectedBeforeScoringByTitle: Record<string, string>;
  enteredScoringTitles: string[];
};

function emptyKidsGoogleBooksPreScoringDiagnostics(): KidsGoogleBooksPreScoringDiagnostics {
  return { decisionByTitle: {}, rejectedBeforeScoringByTitle: {}, enteredScoringTitles: [] };
}

export function applyKidsGoogleBooksPreScoringGate(
  candidates: NormalizedCandidate[],
  profile: TasteProfile,
): { candidates: NormalizedCandidate[]; diagnostics: KidsGoogleBooksPreScoringDiagnostics } {
  const diagnostics = emptyKidsGoogleBooksPreScoringDiagnostics();
  if (profile.ageBand !== "kids") return { candidates, diagnostics };
  const filtered: NormalizedCandidate[] = [];
  for (const candidate of candidates) {
    if (candidate.source !== "googleBooks") {
      filtered.push(candidate);
      continue;
    }
    const title = String(candidate.title || "").trim();
    if (!title) continue;
    const eligibility = kidsGoogleBooksPreScoringEligibility(candidate, profile);
    diagnostics.decisionByTitle[title] = eligibility.reason;
    if (eligibility.allowed) {
      diagnostics.enteredScoringTitles.push(title);
      filtered.push(candidate);
    } else {
      diagnostics.rejectedBeforeScoringByTitle[title] = eligibility.reason;
    }
  }
  diagnostics.enteredScoringTitles = uniqueStrings(diagnostics.enteredScoringTitles, 120);
  return { candidates: filtered, diagnostics };
}

function kidsGoogleBooksPreScoringObservability(diagnostics: KidsGoogleBooksPreScoringDiagnostics): Record<string, unknown> {
  return {
    kidsGoogleBooksPreScoringDecisionByTitle: diagnostics.decisionByTitle,
    kidsGoogleBooksRejectedBeforeScoringByTitle: diagnostics.rejectedBeforeScoringByTitle,
    kidsGoogleBooksEnteredScoringTitles: diagnostics.enteredScoringTitles,
    kidsGoogleBooksPreScoringSummary: {
      scope: "kids_googlebooks_conclusive_identity_and_age_suitability_pre_scoring_enforcement",
      consideredCount: Object.keys(diagnostics.decisionByTitle).length,
      rejectedBeforeScoringCount: Object.keys(diagnostics.rejectedBeforeScoringByTitle).length,
      enteredScoringCount: diagnostics.enteredScoringTitles.length,
      classifierRulesChanged: false,
      rescuePolicyChanged: false,
      scoringOrRankingRulesChanged: false,
    },
  };
}

function mergeNumberRecords(primary?: Record<string, number>, secondary?: Record<string, number>): Record<string, number> | undefined {
  const merged: Record<string, number> = {};
  for (const [key, value] of Object.entries(primary || {})) merged[key] = Number(merged[key] || 0) + Number(value || 0);
  for (const [key, value] of Object.entries(secondary || {})) merged[key] = Number(merged[key] || 0) + Number(value || 0);
  return Object.keys(merged).length ? merged : undefined;
}

function teenOpenLibraryCleanCount(selection: { rejectedReasons: Record<string, number> }, selected: ScoredCandidate[]): number {
  const diagnostics = selection.rejectedReasons as Record<string, unknown>;
  const reported = Number(diagnostics.finalEligibilityCleanCandidateCount);
  if (Number.isFinite(reported)) return reported;
  return selected.filter((candidate) => candidate.source === "openLibrary").length;
}

function hasLikedEvidence(row: { evidence?: string[] }): boolean {
  return Array.isArray(row.evidence) && row.evidence.some((item) => String(item || "").startsWith("like:"));
}

function independentLikedWeight(profile: TasteProfile, pattern: RegExp): number {
  const weightByLikedItem = new Map<string, number>();
  const rows = [...profile.genreFamily, ...profile.themes, ...profile.characterDynamics, ...profile.tone];
  for (const row of rows) {
    const value = String(row.value || "").toLowerCase();
    if (!pattern.test(value) || !hasLikedEvidence(row)) continue;
    for (const item of row.evidence) {
      const key = String(item || "").toLowerCase();
      if (!key.startsWith("like:")) continue;
      weightByLikedItem.set(key, Math.max(weightByLikedItem.get(key) || 0, Math.abs(Number(row.weight || 0))));
    }
  }
  return [...weightByLikedItem.values()].reduce((sum, weight) => sum + weight, 0);
}

function teenOpenLibraryAttemptedQueries(diagnostics: SourceDiagnosticV2): Set<string> {
  const attempted = new Set<string>();
  for (const query of Array.isArray(diagnostics.queries) ? diagnostics.queries : []) {
    const key = String(query || "").trim().toLowerCase();
    if (key) attempted.add(key);
  }
  for (const fetch of Array.isArray(diagnostics.fetches) ? diagnostics.fetches : []) {
    const key = String(fetch.query || "").trim().toLowerCase();
    if (key) attempted.add(key);
  }
  return attempted;
}

function teenOpenLibraryPostFinalRecoveryQueries(profile: TasteProfile, diagnostics: SourceDiagnosticV2, limit = 3): string[] {
  const weights = {
    fantasy: independentLikedWeight(profile, /\b(fantasy|magic|magical)\b/),
    paranormal: independentLikedWeight(profile, /\b(paranormal|supernatural)\b/),
    mystery: independentLikedWeight(profile, /\b(mystery|detective|suspense|thriller)\b/),
    thriller: independentLikedWeight(profile, /\b(thriller|suspense)\b/),
    crime: independentLikedWeight(profile, /\b(crime|detective)\b/),
    superhero: independentLikedWeight(profile, /\b(superhero|superheroes|super hero|super-powered|superpowered|dc comics|marvel)\b/),
    contemporary: independentLikedWeight(profile, /\b(contemporary|realistic|coming[-\s]of[-\s]age|school|identity)\b/),
    romance: independentLikedWeight(profile, /\b(romance|romantic)\b/),
    dystopian: independentLikedWeight(profile, /\b(dystopia|dystopian)\b/),
    speculative: independentLikedWeight(profile, /\b(science fiction|sci-fi|speculative|space)\b/),
    survival: independentLikedWeight(profile, /\b(survival|survive)\b/),
    historical: independentLikedWeight(profile, /\b(historical|history|period)\b/),
    adventure: independentLikedWeight(profile, /\b(action|adventure|quest)\b/),
    horror: independentLikedWeight(profile, /\b(horror)\b/),
    sports: independentLikedWeight(profile, /\b(sports?|basketball|soccer|football|baseball|volleyball|track|athletic|athlete|competition)\b/),
    school: independentLikedWeight(profile, /\b(school|academy|campus|boarding school|magic school|magical school)\b/),
  };
  type TeenRecoveryFamily = keyof typeof weights;
  type TeenRecoveryCandidate = {
    query: string;
    score: number;
    required: TeenRecoveryFamily[];
    requiredAny?: TeenRecoveryFamily[];
    primaryFamily: TeenRecoveryFamily;
    priority: number;
  };
  const attempted = teenOpenLibraryAttemptedQueries(diagnostics);
  const candidates: TeenRecoveryCandidate[] = [
    { query: "young adult superhero mystery", score: weights.superhero + Math.max(weights.crime, weights.mystery), required: ["superhero"], requiredAny: ["crime", "mystery"], primaryFamily: "superhero", priority: 0 },
    { query: "young adult superhero fiction", score: weights.superhero, required: ["superhero"], primaryFamily: "superhero", priority: 1 },
    { query: "young adult crime thriller", score: weights.crime + Math.max(weights.thriller, weights.mystery), required: ["crime"], requiredAny: ["thriller", "mystery"], primaryFamily: "crime", priority: 2 },
    { query: "young adult fantasy mystery", score: weights.fantasy + weights.mystery, required: ["fantasy", "mystery"], primaryFamily: "fantasy", priority: 3 },
    { query: "young adult paranormal fantasy", score: weights.paranormal + weights.fantasy, required: ["paranormal", "fantasy"], primaryFamily: "paranormal", priority: 4 },
    { query: "young adult paranormal mystery", score: weights.paranormal + weights.mystery, required: ["paranormal", "mystery"], primaryFamily: "paranormal", priority: 5 },
    { query: "young adult contemporary fantasy", score: weights.contemporary + weights.fantasy, required: ["contemporary", "fantasy"], primaryFamily: "contemporary", priority: 6 },
    { query: "young adult dystopian thriller", score: weights.dystopian + Math.max(weights.thriller, weights.survival, weights.mystery), required: ["dystopian"], primaryFamily: "dystopian", priority: 7 },
    { query: "young adult science fiction adventure", score: weights.speculative + weights.adventure, required: ["speculative", "adventure"], primaryFamily: "speculative", priority: 8 },
    { query: "young adult science fiction thriller", score: weights.speculative + weights.thriller, required: ["speculative", "thriller"], primaryFamily: "speculative", priority: 9 },
    { query: "young adult historical adventure", score: weights.historical + weights.adventure, required: ["historical", "adventure"], primaryFamily: "historical", priority: 10 },
    { query: "young adult school mystery", score: weights.school + weights.mystery, required: ["school", "mystery"], primaryFamily: "school", priority: 11 },
    { query: "young adult mystery thriller", score: weights.mystery + weights.thriller, required: ["mystery", "thriller"], primaryFamily: "mystery", priority: 12 },
    { query: "young adult contemporary romance", score: weights.contemporary + weights.romance, required: ["contemporary", "romance"], primaryFamily: "romance", priority: 13 },
    { query: "young adult fantasy adventure", score: weights.fantasy + weights.adventure, required: ["fantasy", "adventure"], primaryFamily: "fantasy", priority: 14 },
    { query: "young adult horror", score: weights.horror, required: ["horror"], primaryFamily: "horror", priority: 15 },
    { query: "young adult sports fiction", score: weights.sports, required: ["sports"], primaryFamily: "sports", priority: 16 },
  ];
  const isSupported = (candidate: TeenRecoveryCandidate): boolean => candidate.score > 0
    && candidate.required.every((family) => weights[family] > 0)
    && (!candidate.requiredAny || candidate.requiredAny.some((family) => weights[family] > 0));
  const compareCandidates = (a: TeenRecoveryCandidate, b: TeenRecoveryCandidate): number => b.score - a.score
    || a.priority - b.priority
    || a.query.localeCompare(b.query);
  const supportedCandidates = candidates.filter(isSupported);
  const removedAsAlreadyAttempted = supportedCandidates.filter((candidate) => attempted.has(candidate.query.toLowerCase()));
  const viableCandidates = supportedCandidates
    .filter((candidate) => !attempted.has(candidate.query.toLowerCase()))
    .sort(compareCandidates);
  const bestByFamily = new Map<TeenRecoveryFamily, TeenRecoveryCandidate>();
  for (const candidate of viableCandidates) {
    if (!bestByFamily.has(candidate.primaryFamily)) bestByFamily.set(candidate.primaryFamily, candidate);
  }
  const familyRepresentatives = [...bestByFamily.values()].sort(compareCandidates);
  const selectedCandidates = familyRepresentatives.slice(0, limit);
  const selectedSet = new Set(selectedCandidates.map((candidate) => candidate.query));
  const secondaryVariants: TeenRecoveryCandidate[] = [];
  if (selectedCandidates.length < limit) {
    for (const candidate of viableCandidates) {
      if (selectedCandidates.length >= limit) break;
      if (selectedSet.has(candidate.query)) continue;
      selectedCandidates.push(candidate);
      selectedSet.add(candidate.query);
      secondaryVariants.push(candidate);
    }
  }
  const diagnosticsRecord = diagnostics as unknown as Record<string, unknown>;
  diagnosticsRecord.teenRecoveryLikedFamilyWeights = weights;
  diagnosticsRecord.teenRecoveryGeneratedCandidates = candidates.map((candidate) => ({
    query: candidate.query,
    score: candidate.score,
    primaryFamily: candidate.primaryFamily,
    required: candidate.required,
    requiredAny: candidate.requiredAny || [],
    supported: isSupported(candidate),
    alreadyAttempted: attempted.has(candidate.query.toLowerCase()),
  }));
  diagnosticsRecord.teenRecoveryCandidatePrimaryFamily = candidates.reduce<Record<string, string>>((acc, candidate) => {
    acc[candidate.query] = candidate.primaryFamily;
    return acc;
  }, {});
  diagnosticsRecord.teenRecoveryCandidatesRemovedAsAlreadyAttempted = removedAsAlreadyAttempted.map((candidate) => candidate.query);
  diagnosticsRecord.teenRecoveryBestQueryByFamily = [...bestByFamily.entries()].reduce<Record<string, string>>((acc, [family, candidate]) => {
    acc[family] = candidate.query;
    return acc;
  }, {});
  diagnosticsRecord.teenRecoverySelectedDistinctFamilies = Array.from(new Set(selectedCandidates.map((candidate) => candidate.primaryFamily)));
  diagnosticsRecord.teenRecoverySecondaryVariantsUsed = secondaryVariants.map((candidate) => candidate.query);
  diagnosticsRecord.teenRecoveryFinalQueries = selectedCandidates.map((candidate) => candidate.query);
  return selectedCandidates.map((candidate) => candidate.query);
}

function primaryAuthorFromRawItem(item: unknown): string {
  const row = (item || {}) as Record<string, unknown>;
  const authors = Array.isArray(row.creators)
    ? row.creators
    : Array.isArray(row.authors)
      ? row.authors
      : Array.isArray(row.author_name)
        ? row.author_name
        : [];
  return normalizedTokenText(String(authors[0] || ""));
}

function teenRecoverySeriesRootTitle(value: unknown): string {
  return normalizedTokenText(value)
    .replace(/\b(book|volume|vol|part|episode|chapter)\s*\d+.*$/g, "")
    .replace(/\b\d+\b/g, "")
    .replace(/\b(the|a|an)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function teenRecoverySelectedDedupeKeys(selected: ScoredCandidate[]): {
  titles: Set<string>;
  sourceKeys: Set<string>;
  authors: Set<string>;
  seriesRoots: Set<string>;
} {
  const openLibrarySelected = selected.filter((candidate) => candidate.source === "openLibrary");
  return {
    titles: new Set(openLibrarySelected.map((candidate) => normalizedTokenText(candidate.title)).filter(Boolean)),
    sourceKeys: new Set(openLibrarySelected.map((candidate) => String(candidate.sourceId || candidate.id || "").toLowerCase()).filter(Boolean)),
    authors: new Set(openLibrarySelected.map((candidate) => normalizedTokenText(candidate.creators[0] || "")).filter(Boolean)),
    seriesRoots: new Set(openLibrarySelected.map((candidate) => teenRecoverySeriesRootTitle(candidate.title)).filter((root) => root.length >= 4)),
  };
}

function filterTeenRecoveryItemsAgainstSelected(rawItems: unknown[], selected: ScoredCandidate[]): unknown[] {
  const keys = teenRecoverySelectedDedupeKeys(selected);
  return rawItems.filter((item) => {
    const row = (item || {}) as Record<string, unknown>;
    const titleKey = normalizedTokenText(row.title);
    const sourceKey = String(row.sourceId || row.key || row.id || "").toLowerCase();
    const authorKey = primaryAuthorFromRawItem(row);
    const seriesRoot = teenRecoverySeriesRootTitle(row.title);
    if (titleKey && keys.titles.has(titleKey)) return false;
    if (sourceKey && keys.sourceKeys.has(sourceKey)) return false;
    if (authorKey && keys.authors.has(authorKey)) return false;
    if (seriesRoot.length >= 4 && keys.seriesRoots.has(seriesRoot)) return false;
    return true;
  });
}

function markTeenPostFinalRecoveryItems(rawItems: unknown[], query: string): unknown[] {
  return rawItems.map((item) => ({
    ...(item as Record<string, unknown>),
    postFinalEligibilityRecovery: true,
    scoringHandoffStage: "teen_post_final_eligibility_recovery",
    postFinalEligibilityRecoveryQuery: query,
  }));
}

function isTeenPostFinalRecoveryCandidate(candidate: ScoredCandidate): boolean {
  return Boolean(candidate.diagnostics?.postFinalEligibilityRecovery || (candidate.raw as Record<string, unknown> | undefined)?.postFinalEligibilityRecovery);
}

function teenRecoveryRejectedByReason(scored: ScoredCandidate[], selected: ScoredCandidate[]): Record<string, string[]> {
  const selectedIds = new Set(selected.map((candidate) => candidate.id));
  const rejected: Record<string, string[]> = {};
  for (const candidate of scored) {
    if (!isTeenPostFinalRecoveryCandidate(candidate) || selectedIds.has(candidate.id)) continue;
    const reason = String(
      candidate.diagnostics?.teenOpenLibraryFinalEligibilityReason
      || candidate.rejectedReasons.find((entry) => entry !== "selected")
      || "ranked_below_final_selection"
    );
    rejected[reason] = [...(rejected[reason] || []), candidate.title];
  }
  return rejected;
}

function adultOpenLibraryCleanCount(selection: { rejectedReasons: Record<string, number> }, selected: ScoredCandidate[]): number {
  const diagnostics = selection.rejectedReasons as Record<string, unknown>;
  const reported = Number(diagnostics.finalEligibilityCleanCandidateCount);
  if (Number.isFinite(reported)) return reported;
  return selected.filter((candidate) => candidate.source === "openLibrary").length;
}

function independentLikedStats(profile: TasteProfile, pattern: RegExp): { weight: number; itemCount: number } {
  const weightByLikedItem = new Map<string, number>();
  const rows = [...profile.genreFamily, ...profile.themes, ...profile.characterDynamics, ...profile.tone];
  for (const row of rows) {
    const value = String(row.value || "").toLowerCase();
    if (!pattern.test(value) || !hasLikedEvidence(row)) continue;
    for (const item of row.evidence) {
      const key = String(item || "").toLowerCase();
      if (!key.startsWith("like:")) continue;
      weightByLikedItem.set(key, Math.max(weightByLikedItem.get(key) || 0, Math.abs(Number(row.weight || 0))));
    }
  }
  return {
    weight: [...weightByLikedItem.values()].reduce((sum, weight) => sum + weight, 0),
    itemCount: weightByLikedItem.size,
  };
}

function adultOpenLibraryAttemptedQueries(diagnostics: SourceDiagnosticV2): Set<string> {
  const attempted = new Set<string>();
  for (const query of Array.isArray(diagnostics.queries) ? diagnostics.queries : []) {
    const key = String(query || "").trim().toLowerCase();
    if (key) attempted.add(key);
  }
  for (const fetch of Array.isArray(diagnostics.fetches) ? diagnostics.fetches : []) {
    const key = String(fetch.query || "").trim().toLowerCase();
    if (key) attempted.add(key);
  }
  return attempted;
}

function adultOpenLibraryPostFinalRecoveryQueries(profile: TasteProfile, diagnostics: SourceDiagnosticV2, limit = 3): string[] {
  const stats = {
    fantasy: independentLikedStats(profile, /\b(fantasy|magic|magical|dark fantasy|epic fantasy|magical realism)\b/),
    mythology: independentLikedStats(profile, /\b(myth|mythology|mythological|gods?|legend|folklore)\b/),
    science_fiction: independentLikedStats(profile, /\b(science fiction|sci-fi|speculative|space|dystopia|dystopian|alternate history)\b/),
    historical: independentLikedStats(profile, /\b(historical|history|period)\b/),
    mystery_thriller: independentLikedStats(profile, /\b(mystery|thriller|suspense|detective|noir)\b/),
    crime: independentLikedStats(profile, /\b(crime|detective|noir)\b/),
    horror: independentLikedStats(profile, /\b(horror|ghost|occult|supernatural|gothic)\b/),
    romance: independentLikedStats(profile, /\b(romance|romantic|love story)\b/),
    drama_contemporary: independentLikedStats(profile, /\b(drama|literary|family|relationships?|book club|realistic|contemporary|human connection)\b/),
    family_context: independentLikedStats(profile, /\b(family|relationships?|domestic|human connection)\b/),
    comedy: independentLikedStats(profile, /\b(comedy|comic|humou?r|funny|satire|witty)\b/),
    adventure: independentLikedStats(profile, /\b(adventure|action|quest)\b/),
    survival: independentLikedStats(profile, /\b(survival|survive|survivor|post-apocalyptic|post apocalyptic)\b/),
    philosophical: independentLikedStats(profile, /\b(philosophy|philosophical|existential|ethics|metaphysical)\b/),
    sports: independentLikedStats(profile, /\b(sports?|basketball|soccer|football|baseball|athletic|athlete|competition)\b/),
  };
  const weights = Object.entries(stats).reduce<Record<string, number>>((acc, [family, value]) => {
    acc[family] = value.weight;
    return acc;
  }, {});
  const itemCounts = Object.entries(stats).reduce<Record<string, number>>((acc, [family, value]) => {
    acc[family] = value.itemCount;
    return acc;
  }, {});
  type AdultRecoveryFamily = keyof typeof stats;
  type AdultRecoveryCandidate = {
    query: string;
    score: number;
    required: AdultRecoveryFamily[];
    requiredAny?: AdultRecoveryFamily[];
    primaryFamily: AdultRecoveryFamily;
    priority: number;
  };
  const attempted = adultOpenLibraryAttemptedQueries(diagnostics);
  const candidates: AdultRecoveryCandidate[] = [
    { query: "science fiction thriller novel", score: weights.science_fiction + weights.mystery_thriller, required: ["science_fiction", "mystery_thriller"], primaryFamily: "science_fiction", priority: 0 },
    { query: "adult science fiction novel", score: weights.science_fiction, required: ["science_fiction"], primaryFamily: "science_fiction", priority: 1 },
    { query: "mythological fantasy novel", score: weights.fantasy + weights.mythology, required: ["fantasy", "mythology"], primaryFamily: "fantasy", priority: 2 },
    { query: "adult fantasy novel", score: weights.fantasy, required: ["fantasy"], primaryFamily: "fantasy", priority: 3 },
    { query: "historical drama novel", score: weights.historical + weights.drama_contemporary, required: ["historical", "drama_contemporary"], primaryFamily: "historical", priority: 4 },
    { query: "historical fiction novel", score: weights.historical, required: ["historical"], primaryFamily: "historical", priority: 5 },
    { query: "crime thriller novel", score: weights.crime + weights.mystery_thriller, required: ["crime", "mystery_thriller"], primaryFamily: "crime", priority: 6 },
    { query: "adult mystery thriller", score: weights.mystery_thriller, required: ["mystery_thriller"], primaryFamily: "mystery_thriller", priority: 7 },
    { query: "gothic horror novel", score: weights.horror + Math.max(weights.historical, weights.fantasy), required: ["horror"], requiredAny: ["historical", "fantasy"], primaryFamily: "horror", priority: 8 },
    { query: "adult horror novel", score: weights.horror, required: ["horror"], primaryFamily: "horror", priority: 9 },
    { query: "adult romance novel", score: weights.romance, required: ["romance"], primaryFamily: "romance", priority: 10 },
    { query: "domestic drama novel", score: weights.drama_contemporary + weights.family_context, required: ["drama_contemporary", "family_context"], primaryFamily: "drama_contemporary", priority: 11 },
    { query: "contemporary literary fiction", score: weights.drama_contemporary, required: ["drama_contemporary"], primaryFamily: "drama_contemporary", priority: 12 },
    { query: "comic novel", score: weights.comedy, required: ["comedy"], primaryFamily: "comedy", priority: 13 },
    { query: "philosophical fiction", score: weights.philosophical, required: ["philosophical"], primaryFamily: "philosophical", priority: 14 },
    { query: "survival fiction", score: weights.survival, required: ["survival"], primaryFamily: "survival", priority: 15 },
    { query: "adventure novel", score: weights.adventure, required: ["adventure"], primaryFamily: "adventure", priority: 16 },
    { query: "sports fiction novel", score: weights.sports, required: ["sports"], primaryFamily: "sports", priority: 17 },
  ];
  const isSupported = (candidate: AdultRecoveryCandidate): boolean => candidate.score > 0
    && candidate.required.every((family) => weights[family] > 0)
    && (!candidate.requiredAny || candidate.requiredAny.some((family) => weights[family] > 0));
  const compareCandidates = (a: AdultRecoveryCandidate, b: AdultRecoveryCandidate): number => b.score - a.score
    || a.priority - b.priority
    || a.query.localeCompare(b.query);
  const supportedCandidates = candidates.filter(isSupported);
  const uniqueSupportedCandidates: AdultRecoveryCandidate[] = [];
  const seenQueries = new Set<string>();
  for (const candidate of supportedCandidates) {
    const key = candidate.query.toLowerCase();
    if (seenQueries.has(key)) continue;
    seenQueries.add(key);
    uniqueSupportedCandidates.push(candidate);
  }
  const removedAsAlreadyAttempted = uniqueSupportedCandidates.filter((candidate) => attempted.has(candidate.query.toLowerCase()));
  const viableCandidates = uniqueSupportedCandidates
    .filter((candidate) => !attempted.has(candidate.query.toLowerCase()))
    .sort(compareCandidates);
  const bestByFamily = new Map<AdultRecoveryFamily, AdultRecoveryCandidate>();
  for (const candidate of viableCandidates) {
    if (!bestByFamily.has(candidate.primaryFamily)) bestByFamily.set(candidate.primaryFamily, candidate);
  }
  const familyRepresentatives = [...bestByFamily.values()].sort(compareCandidates);
  const selectedCandidates = familyRepresentatives.slice(0, limit);
  const selectedSet = new Set(selectedCandidates.map((candidate) => candidate.query));
  const secondaryVariants: AdultRecoveryCandidate[] = [];
  if (selectedCandidates.length < limit) {
    for (const candidate of viableCandidates) {
      if (selectedCandidates.length >= limit) break;
      if (selectedSet.has(candidate.query)) continue;
      selectedCandidates.push(candidate);
      selectedSet.add(candidate.query);
      secondaryVariants.push(candidate);
    }
  }
  const diagnosticsRecord = diagnostics as unknown as Record<string, unknown>;
  diagnosticsRecord.adultPostFinalRecoveryLikedFamilyWeights = weights;
  diagnosticsRecord.adultPostFinalRecoveryLikedItemCountsByFamily = itemCounts;
  diagnosticsRecord.adultPostFinalRecoveryGeneratedCandidates = candidates.map((candidate) => ({
    query: candidate.query,
    score: candidate.score,
    primaryFamily: candidate.primaryFamily,
    required: candidate.required,
    requiredAny: candidate.requiredAny || [],
    supported: isSupported(candidate),
    alreadyAttempted: attempted.has(candidate.query.toLowerCase()),
  }));
  diagnosticsRecord.adultPostFinalRecoveryCandidatePrimaryFamily = candidates.reduce<Record<string, string>>((acc, candidate) => {
    acc[candidate.query] = candidate.primaryFamily;
    return acc;
  }, {});
  diagnosticsRecord.adultPostFinalRecoveryRemovedAlreadyAttempted = removedAsAlreadyAttempted.map((candidate) => candidate.query);
  diagnosticsRecord.adultPostFinalRecoveryBestQueryByFamily = [...bestByFamily.entries()].reduce<Record<string, string>>((acc, [family, candidate]) => {
    acc[family] = candidate.query;
    return acc;
  }, {});
  diagnosticsRecord.adultPostFinalRecoverySelectedDistinctFamilies = Array.from(new Set(selectedCandidates.map((candidate) => candidate.primaryFamily)));
  diagnosticsRecord.adultPostFinalRecoverySecondaryVariantsUsed = secondaryVariants.map((candidate) => candidate.query);
  diagnosticsRecord.adultPostFinalRecoveryFinalQueries = selectedCandidates.map((candidate) => candidate.query);
  return selectedCandidates.map((candidate) => candidate.query);
}

function adultRecoveryTitleAuthorKey(item: unknown): string {
  const row = (item || {}) as Record<string, unknown>;
  const title = normalizedTokenText(row.title);
  const author = primaryAuthorFromRawItem(row);
  return title && author ? `${title}:${author}` : "";
}

function filterAdultRecoveryItemsAgainstExisting(rawItems: unknown[], existingItems: unknown[]): unknown[] {
  const sourceKeys = new Set(existingItems.map(sourceItemKey).filter(Boolean));
  const titleAuthorKeys = new Set(existingItems.map(adultRecoveryTitleAuthorKey).filter(Boolean));
  return rawItems.filter((item) => {
    const sourceKey = sourceItemKey(item);
    const titleAuthorKey = adultRecoveryTitleAuthorKey(item);
    if (sourceKey && sourceKeys.has(sourceKey)) return false;
    if (titleAuthorKey && titleAuthorKeys.has(titleAuthorKey)) return false;
    return true;
  });
}

function markAdultPostFinalRecoveryItems(rawItems: unknown[], query: string): unknown[] {
  return rawItems.map((item) => ({
    ...(item as Record<string, unknown>),
    adultPostFinalEligibilityRecovery: true,
    postFinalEligibilityRecovery: true,
    scoringHandoffStage: "adult_post_final_eligibility_recovery",
    adultPostFinalEligibilityRecoveryQuery: query,
  }));
}

function isAdultPostFinalRecoveryCandidate(candidate: ScoredCandidate): boolean {
  return Boolean(candidate.diagnostics?.adultPostFinalEligibilityRecovery || (candidate.raw as Record<string, unknown> | undefined)?.adultPostFinalEligibilityRecovery);
}

function adultRecoveryRejectedByReason(scored: ScoredCandidate[], selected: ScoredCandidate[]): Record<string, string[]> {
  const selectedIds = new Set(selected.map((candidate) => candidate.id));
  const rejected: Record<string, string[]> = {};
  for (const candidate of scored) {
    if (!isAdultPostFinalRecoveryCandidate(candidate) || selectedIds.has(candidate.id)) continue;
    const reason = String(
      candidate.diagnostics?.adultOpenLibraryFinalEligibilityReason
      || candidate.rejectedReasons.find((entry) => entry !== "selected")
      || "ranked_below_final_selection"
    );
    rejected[reason] = [...(rejected[reason] || []), candidate.title];
  }
  return rejected;
}

function capAdultRecoverySelection(selected: ScoredCandidate[], capLimit: number): ScoredCandidate[] {
  const protectedInitial = selected.filter(
    (candidate) => candidate.source === "openLibrary" && !isAdultPostFinalRecoveryCandidate(candidate),
  );

  const protectedIds = new Set(protectedInitial.map((c) => c.id));
  const remaining = selected.filter((candidate) => !protectedIds.has(candidate.id));

  return [...protectedInitial, ...remaining].slice(0, capLimit);
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

function openLibraryFinalLineageKey(query: unknown, queryCascadeIndex: unknown): string {
  const normalizedQuery = String(query || "").toLowerCase().replace(/\s+/g, " ").trim();
  const normalizedIndex = Number.isFinite(Number(queryCascadeIndex)) ? String(Number(queryCascadeIndex)) : "";
  return `${normalizedIndex}:${normalizedQuery}`;
}

function openLibraryFinalLineageItem(item: unknown): { key: string; title: string } {
  const row = (item || {}) as Record<string, unknown>;
  const diagnostics = (row.diagnostics || {}) as Record<string, unknown>;
  const raw = (row.raw || {}) as Record<string, unknown>;
  const query = diagnostics.queryText || row.queryText || raw.queryText || raw.postFinalEligibilityRecoveryQuery;
  const queryCascadeIndex = diagnostics.queryCascadeIndex ?? row.queryCascadeIndex ?? raw.queryCascadeIndex;
  return {
    key: openLibraryFinalLineageKey(query, queryCascadeIndex),
    title: String(row.title || raw.title || "").trim(),
  };
}

function addOpenLibraryFinalLineageItem(
  groups: Map<string, { count: number; titles: string[] }>,
  item: unknown,
): void {
  const lineage = openLibraryFinalLineageItem(item);
  if (!lineage.key || lineage.key === ":") return;
  const group = groups.get(lineage.key) || { count: 0, titles: [] };
  group.count += 1;
  if (lineage.title && !group.titles.includes(lineage.title)) group.titles.push(lineage.title);
  groups.set(lineage.key, group);
}

export function applyOpenLibraryPerQueryFinalLineage(sourceResults: SourceResult[], selected: ScoredCandidate[]): void {
  const openLibrary = sourceResults.find((result) => result.source === "openLibrary");
  const fetches = openLibrary?.diagnostics.fetches || [];
  if (!openLibrary || !fetches.length) return;

  const mergedByQuery = new Map<string, { count: number; titles: string[] }>();
  const finalByQuery = new Map<string, { count: number; titles: string[] }>();
  for (const item of openLibrary.rawItems) addOpenLibraryFinalLineageItem(mergedByQuery, item);
  for (const candidate of selected.filter((row) => row.source === "openLibrary")) addOpenLibraryFinalLineageItem(finalByQuery, candidate);

  for (const fetch of fetches) {
    fetch.mergedCandidates = 0;
    fetch.finalContribution = 0;
    fetch.mergedCandidateTitles = [];
    fetch.finalContributionTitles = [];
  }

  const keys = new Set([...mergedByQuery.keys(), ...finalByQuery.keys()]);
  for (const key of keys) {
    const matching = fetches.filter((fetch) => !fetch.diagnosticOnly && openLibraryFinalLineageKey(fetch.query, fetch.queryCascadeIndex) === key);
    const target = [...matching].reverse().find((fetch) => Number(fetch.acceptedAfterSourcePolicy || 0) > 0)
      || [...matching].reverse().find((fetch) => !fetch.timedOut && !fetch.failedReason && Number(fetch.docsReturned || 0) > 0)
      || matching[matching.length - 1];
    if (!target) continue;
    const merged = mergedByQuery.get(key) || { count: 0, titles: [] };
    const final = finalByQuery.get(key) || { count: 0, titles: [] };
    target.mergedCandidates = merged.count;
    target.mergedCandidateTitles = merged.titles;
    target.finalContribution = final.count;
    target.finalContributionTitles = final.titles;
  }
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
  let adultGoogleBooksNormalizationDiagnostics: AdultGoogleBooksNormalizationDiagnostics = {
    googleBooksNormalizedRejectReasonByTitle: {},
    googleBooksNormalizationEligibilityByTitle: {},
    googleBooksNarrativeEvidenceByTitle: {},
    googleBooksAnthologyEvidenceByTitle: {},
    googleBooksReferenceEvidenceByTitle: {},
    googleBooksPublisherEvidenceByTitle: {},
    googleBooksPublicationShapeByTitle: {},
    googleBooksNarrativeConfidenceByTitle: {},
    googleBooksPublicationShapeEvidenceByTitle: {},
    googleBooksNarrativePriorityAdjustmentByTitle: {},
    googleBooksPublicationShapeRejectedBeforeRankingByTitle: {},
    googleBooksDominantPublicationShapeEvidenceByTitle: {},
    googleBooksOverriddenNarrativeEvidenceByTitle: {},
    googleBooksPublicationShapePrecedenceDecisionByTitle: {},
    googleBooksExplicitNonNarrativeIdentityByTitle: {},
    googleBooksStoryLevelNarrativeEvidenceByTitle: {},
    googleBooksGenericCategoryTitleByTitle: {},
    googleBooksGenericCategoryEvidenceByTitle: {},
    googleBooksGenericCategoryRejectedBeforeRankingByTitle: {},
    googleBooksUnknownShapeEligibilityByTitle: {},
    googleBooksUnknownShapeEvidenceByTitle: {},
    googleBooksUnknownShapeRejectedReasonByTitle: {},
    googleBooksUnknownStoryEvidenceCountByTitle: {},
    googleBooksUnknownStoryEvidenceFamiliesByTitle: {},
    googleBooksUnknownNarrativeCorroborationByTitle: {},
    googleBooksUnknownEligibilityThresholdDecisionByTitle: {},
    googleBooksSubjectOfStudyTitleByTitle: {},
    googleBooksSubjectOfStudyEvidenceByTitle: {},
    googleBooksSubjectOfStudyRejectedBeforeRankingByTitle: {},
    googleBooksCuratedBookGuideIdentityByTitle: {},
    googleBooksCuratedBookGuideEvidenceByTitle: {},
    googleBooksPeriodicalIdentityEvidenceByTitle: {},
    googleBooksPeriodicalIdentityDecisionByTitle: {},
    googleBooksEnteredRanking: [],
    googleBooksRejectedBeforeRankingReason: {},
  };
  let preteenGoogleBooksPublicationIdentityPreScoringGate = {
    candidates: normalized,
    diagnostics: emptyPreteenGoogleBooksPublicationIdentityPreScoringDiagnostics(),
  };
  let kidsGoogleBooksPreScoringGate = {
    candidates: normalized,
    diagnostics: emptyKidsGoogleBooksPreScoringDiagnostics(),
  };
  let teensGoogleBooksPreScoringGate = {
    candidates: normalized,
    diagnostics: emptyTeensGoogleBooksPreScoringDiagnostics(),
  };
  let adultGoogleBooksNormalizationGate = applyAdultGoogleBooksNormalizationGate(normalized, tasteProfile);
  normalized = adultGoogleBooksNormalizationGate.candidates;
  adultGoogleBooksNormalizationDiagnostics = adultGoogleBooksNormalizationGate.diagnostics;
  preteenGoogleBooksPublicationIdentityPreScoringGate = applyPreteenGoogleBooksPublicationIdentityPreScoringGate(normalized, tasteProfile);
  normalized = preteenGoogleBooksPublicationIdentityPreScoringGate.candidates;
  kidsGoogleBooksPreScoringGate = applyKidsGoogleBooksPreScoringGate(normalized, tasteProfile);
  normalized = kidsGoogleBooksPreScoringGate.candidates;
  teensGoogleBooksPreScoringGate = applyTeensGoogleBooksPreScoringGate(normalized, tasteProfile);
  normalized = teensGoogleBooksPreScoringGate.candidates;
  let scored = scoreCandidates(normalized, tasteProfile);
  let selection = selectRecommendations(scored, tasteProfile, session.limit || 10);
  let selected = selection.selected;
  let rejectedReasons = selection.rejectedReasons;

  const openLibrarySourceIndex = sourceResults.findIndex((result) => result.source === "openLibrary");
  const openLibrarySourceResult = openLibrarySourceIndex >= 0 ? sourceResults[openLibrarySourceIndex] : undefined;
  const scoredOpenLibraryCount = scored.filter((candidate) => candidate.source === "openLibrary").length;
  const teenPostFinalEligibilityTarget = Math.min(5, session.limit || 10);
  const initialTeenOpenLibraryCleanCount = teenOpenLibraryCleanCount(selection, selected);
  const shouldRunTeenPostFinalEligibilityRecovery = tasteProfile.ageBand === "teens"
    && Boolean(openLibrarySourceResult)
    && initialTeenOpenLibraryCleanCount < teenPostFinalEligibilityTarget;
  if (shouldRunTeenPostFinalEligibilityRecovery && openLibrarySourceResult) {
    const openLibraryPlan = searchPlan.sourcePlans.find((plan) => plan.source === "openLibrary");
    const adapter = openLibraryPlan ? sourceAdapters[openLibraryPlan.source] : undefined;
    const diagnostics = openLibrarySourceResult.diagnostics;
    diagnostics.postFinalEligibilityUnderfillRecoveryTriggered = true;
    diagnostics.postFinalEligibilityRecoveryTriggerCount = initialTeenOpenLibraryCleanCount;
    diagnostics.postFinalEligibilityRecoveryQueriesAttempted = [];
    diagnostics.postFinalEligibilityRecoveryFetchCountByQuery = {};
    diagnostics.postFinalEligibilityRecoveryConvertedCount = 0;
    diagnostics.postFinalEligibilityRecoveryEnteredScoringTitles = [];
    diagnostics.postFinalEligibilityRecoveryAcceptedTitles = [];
    diagnostics.postFinalEligibilityRecoveryRejectedByReason = {};
    diagnostics.postFinalEligibilityRecoveryFinalCount = initialTeenOpenLibraryCleanCount;
    diagnostics.postFinalEligibilityRecoveryStoppedReason = "not_started";
    diagnostics.meaningfulTasteRecoveryTriggered = true;
    diagnostics.meaningfulTasteRecoveryTriggerStage = "post_final_eligibility";
    diagnostics.meaningfulTasteRecoveryQueriesAttempted = [];
    diagnostics.meaningfulTasteRecoveryAcceptedTitles = [];
    diagnostics.meaningfulTasteRecoveryFinalCount = 0;
    diagnostics.recoverySuccessRequiresFinalEligibility = true;

    if (!openLibraryPlan || !adapter) {
      diagnostics.postFinalEligibilityRecoveryStoppedReason = "openlibrary_plan_missing";
      diagnostics.meaningfulTasteRecoverySkippedReason = "post_final_eligibility_openlibrary_plan_missing";
    } else {
      const recoveryQueries = teenOpenLibraryPostFinalRecoveryQueries(tasteProfile, diagnostics, 3);
      if (!recoveryQueries.length) {
        diagnostics.postFinalEligibilityRecoveryStoppedReason = "no_unattempted_liked_family_queries";
        diagnostics.meaningfulTasteRecoverySkippedReason = "post_final_eligibility_no_unattempted_liked_family_queries";
      }

      for (const [recoveryIndex, recoveryQuery] of recoveryQueries.entries()) {
        if (teenOpenLibraryCleanCount(selection, selected) >= teenPostFinalEligibilityTarget) {
          diagnostics.postFinalEligibilityRecoveryStoppedReason = "reached_five";
          break;
        }
        const previousSourceResults = sourceResults;
        const previousNormalized = normalized;
        const previousScored = scored;
        const previousSelection = selection;
        const previousSelected = selected;
        const previousRejectedReasons = rejectedReasons;
        const previousCleanCount = teenOpenLibraryCleanCount(selection, selected);
        const previousAcceptedTitles = new Set((((selection.rejectedReasons as Record<string, unknown>).finalEligibilityAcceptedTitles || []) as string[]).map(normalizedTokenText));

        const recoveryPlan: SourcePlan = {
          ...openLibraryPlan,
          intents: [{
            id: `teen-post-final-eligibility-recovery-${recoveryIndex + 1}`,
            query: recoveryQuery,
            facets: [],
            priority: 100 - recoveryIndex,
            rationale: ["Teen Open Library post-final eligibility recovery"],
          }],
        };
        const recoveryProfile: TasteProfile = {
          ...tasteProfile,
          diagnostics: {
            ...tasteProfile.diagnostics,
            forceTeenPostFinalEligibilityRecovery: true,
            forceTeenPostFinalEligibilityRecoveryQueries: [recoveryQuery],
            forceTeenPostFinalEligibilityRecoveryQueryOffset: (sourceResults[openLibrarySourceIndex]?.diagnostics.fetches || []).filter((fetch) => !fetch.diagnosticOnly).length + recoveryIndex,
            disableTeenSourceUnderfillRecovery: true,
          },
        };
        const recoveryDiagnostics = sourceResults[openLibrarySourceIndex]?.diagnostics || diagnostics;
        recoveryDiagnostics.postFinalEligibilityRecoveryQueriesAttempted = uniqueStrings([
          ...((recoveryDiagnostics.postFinalEligibilityRecoveryQueriesAttempted || []) as string[]),
          recoveryQuery,
        ], 3);
        recoveryDiagnostics.meaningfulTasteRecoveryQueriesAttempted = recoveryDiagnostics.postFinalEligibilityRecoveryQueriesAttempted;

        const recoveryResponse = await runWithTimeout(openLibraryPlan.timeoutMs, (signal) => adapter.search(recoveryPlan, { profile: recoveryProfile, signal }));
        if (!recoveryResponse.value) {
          recoveryDiagnostics.postFinalEligibilityRecoveryStoppedReason = recoveryResponse.timedOut ? "query_timed_out" : "query_failed";
          recoveryDiagnostics.meaningfulTasteRecoverySkippedReason = recoveryResponse.timedOut ? "post_final_eligibility_recovery_timed_out" : "post_final_eligibility_recovery_failed";
          continue;
        }

        const recoveryResult = recoveryResponse.value;
        const fetchedForQuery = (recoveryResult.diagnostics.fetches || [])
          .filter((fetch) => String(fetch.query || "").toLowerCase() === recoveryQuery.toLowerCase())
          .reduce((sum, fetch) => sum + Number(fetch.docsReturned || 0), 0)
          || Number(recoveryResult.diagnostics.rawApiResultCount || 0);
        const fetchCountByQuery = {
          ...((recoveryDiagnostics.postFinalEligibilityRecoveryFetchCountByQuery || {}) as Record<string, number>),
          [recoveryQuery]: fetchedForQuery,
        };
        const markedRecoveryItems = markTeenPostFinalRecoveryItems(
          filterTeenRecoveryItemsAgainstSelected(recoveryResult.rawItems, selected),
          recoveryQuery,
        );
        const sourceRejectedRecoveryByReason = Object.entries(recoveryResult.diagnostics.dropReasons || {})
          .filter(([, count]) => Number(count || 0) > 0)
          .reduce<Record<string, string[]>>((acc, [reason, count]) => {
            acc[reason] = [`${Number(count || 0)} source rows`];
            return acc;
          }, {});
        const currentOpenLibraryResult = sourceResults[openLibrarySourceIndex] || openLibrarySourceResult;
        const existingKeys = new Set(currentOpenLibraryResult.rawItems.map(sourceItemKey));
        const recoveryItemsEnteringScoring = markedRecoveryItems.filter((item) => {
          const key = sourceItemKey(item);
          return key && !existingKeys.has(key);
        });
        const mergedRawItems = mergeSourceItems(currentOpenLibraryResult.rawItems, markedRecoveryItems).slice(0, 20);
        const enteredTitles = uniqueStrings([
          ...((recoveryDiagnostics.postFinalEligibilityRecoveryEnteredScoringTitles || []) as string[]),
          ...recoveryItemsEnteringScoring.map(titleOf),
        ], 40);
        const mergedDiagnostics: SourceDiagnosticV2 = {
          ...currentOpenLibraryResult.diagnostics,
          status: mergedRawItems.length ? "succeeded" : currentOpenLibraryResult.status,
          rawCount: mergedRawItems.length,
          normalizedCount: mergedRawItems.length,
          usableRowsAfterFiltering: mergedRawItems.length,
          queries: uniqueStrings([...(currentOpenLibraryResult.diagnostics.queries || []), ...(recoveryResult.diagnostics.queries || [])], 20),
          rawTitles: uniqueStrings([...(currentOpenLibraryResult.diagnostics.rawTitles || []), ...(recoveryResult.diagnostics.rawTitles || []), ...markedRecoveryItems.map(titleOf)], 80),
          firstReturnedTitles: uniqueStrings(mergedRawItems.map(titleOf), 5),
          rawApiResultCount: Number(currentOpenLibraryResult.diagnostics.rawApiResultCount || 0) + Number(recoveryResult.diagnostics.rawApiResultCount || 0),
          droppedBeforeDocCount: Number(currentOpenLibraryResult.diagnostics.droppedBeforeDocCount || 0) + Number(recoveryResult.diagnostics.droppedBeforeDocCount || 0),
          dropReasons: mergeNumberRecords(currentOpenLibraryResult.diagnostics.dropReasons, recoveryResult.diagnostics.dropReasons),
          fetches: [...(currentOpenLibraryResult.diagnostics.fetches || []), ...(recoveryResult.diagnostics.fetches || [])],
          artifactSuppressedTitles: uniqueStrings([...(currentOpenLibraryResult.diagnostics.artifactSuppressedTitles || []), ...(recoveryResult.diagnostics.artifactSuppressedTitles || [])], 80),
          seriesSuppressedTitles: uniqueStrings([...(currentOpenLibraryResult.diagnostics.seriesSuppressedTitles || []), ...(recoveryResult.diagnostics.seriesSuppressedTitles || [])], 80),
          openLibraryDocsFetchedAcrossAllQueriesCount: Number(currentOpenLibraryResult.diagnostics.openLibraryDocsFetchedAcrossAllQueriesCount || 0) + Number(recoveryResult.diagnostics.openLibraryDocsFetchedAcrossAllQueriesCount || recoveryResult.diagnostics.rawApiResultCount || 0),
          openLibraryDocsEligibleForScoringCount: Number(currentOpenLibraryResult.diagnostics.openLibraryDocsEligibleForScoringCount || currentOpenLibraryResult.rawItems.length) + Number(recoveryResult.diagnostics.openLibraryDocsEligibleForScoringCount || recoveryResult.rawItems.length),
          openLibraryDocsActuallyHandedToScoringCount: mergedRawItems.length,
          postFinalEligibilityUnderfillRecoveryTriggered: true,
          postFinalEligibilityRecoveryTriggerCount: initialTeenOpenLibraryCleanCount,
          postFinalEligibilityRecoveryQueriesAttempted: recoveryDiagnostics.postFinalEligibilityRecoveryQueriesAttempted,
          postFinalEligibilityRecoveryFetchCountByQuery: fetchCountByQuery,
          postFinalEligibilityRecoveryConvertedCount: Number(recoveryDiagnostics.postFinalEligibilityRecoveryConvertedCount || 0) + recoveryResult.rawItems.length,
          postFinalEligibilityRecoveryEnteredScoringTitles: enteredTitles,
          postFinalEligibilityRecoveryAcceptedTitles: recoveryDiagnostics.postFinalEligibilityRecoveryAcceptedTitles || [],
          postFinalEligibilityRecoveryRejectedByReason: {
            ...((recoveryDiagnostics.postFinalEligibilityRecoveryRejectedByReason || {}) as Record<string, string[]>),
            ...sourceRejectedRecoveryByReason,
          },
          postFinalEligibilityRecoveryFinalCount: teenOpenLibraryCleanCount(selection, selected),
          postFinalEligibilityRecoveryStoppedReason: "queries_exhausted",
          meaningfulTasteRecoveryTriggered: true,
          meaningfulTasteRecoveryTriggerStage: "post_final_eligibility",
          meaningfulTasteRecoveryQueriesAttempted: recoveryDiagnostics.postFinalEligibilityRecoveryQueriesAttempted,
          meaningfulTasteRecoveryAcceptedTitles: recoveryDiagnostics.postFinalEligibilityRecoveryAcceptedTitles || [],
          meaningfulTasteRecoveryFinalCount: Number(recoveryDiagnostics.meaningfulTasteRecoveryFinalCount || 0),
          recoverySuccessRequiresFinalEligibility: true,
        };
        sourceResults = sourceResults.map((result, index) => index === openLibrarySourceIndex
          ? { ...currentOpenLibraryResult, status: mergedRawItems.length ? "succeeded" : currentOpenLibraryResult.status, rawItems: mergedRawItems, diagnostics: mergedDiagnostics }
          : result);

        normalized = normalizeSourceResults(sourceResults);
        adultGoogleBooksNormalizationGate = applyAdultGoogleBooksNormalizationGate(normalized, tasteProfile);
        normalized = adultGoogleBooksNormalizationGate.candidates;
        adultGoogleBooksNormalizationDiagnostics = adultGoogleBooksNormalizationGate.diagnostics;
        preteenGoogleBooksPublicationIdentityPreScoringGate = applyPreteenGoogleBooksPublicationIdentityPreScoringGate(normalized, tasteProfile);
        normalized = preteenGoogleBooksPublicationIdentityPreScoringGate.candidates;
        kidsGoogleBooksPreScoringGate = applyKidsGoogleBooksPreScoringGate(normalized, tasteProfile);
        normalized = kidsGoogleBooksPreScoringGate.candidates;
        teensGoogleBooksPreScoringGate = applyTeensGoogleBooksPreScoringGate(normalized, tasteProfile);
        normalized = teensGoogleBooksPreScoringGate.candidates;
        scored = scoreCandidates(normalized, tasteProfile);
        selection = selectRecommendations(scored, tasteProfile, session.limit || 10);
        selected = selection.selected;
        rejectedReasons = selection.rejectedReasons;

        const finalAcceptedTitles = new Set((((selection.rejectedReasons as Record<string, unknown>).finalEligibilityAcceptedTitles || []) as string[]).map(normalizedTokenText));
        const finalCleanCountAfterRecovery = teenOpenLibraryCleanCount(selection, selected);
        const lostPreviouslyAcceptedTitle = [...previousAcceptedTitles].some((title) => title && !finalAcceptedTitles.has(title));
        if (previousCleanCount > 0 && (finalCleanCountAfterRecovery < previousCleanCount || lostPreviouslyAcceptedTitle)) {
          const attemptedDiagnostics = sourceResults[openLibrarySourceIndex]?.diagnostics;
          sourceResults = previousSourceResults.map((result, index) => index === openLibrarySourceIndex
            ? {
              ...result,
              diagnostics: {
                ...result.diagnostics,
                postFinalEligibilityUnderfillRecoveryTriggered: true,
                postFinalEligibilityRecoveryTriggerCount: initialTeenOpenLibraryCleanCount,
                postFinalEligibilityRecoveryQueriesAttempted: attemptedDiagnostics?.postFinalEligibilityRecoveryQueriesAttempted || recoveryDiagnostics.postFinalEligibilityRecoveryQueriesAttempted,
                postFinalEligibilityRecoveryFetchCountByQuery: attemptedDiagnostics?.postFinalEligibilityRecoveryFetchCountByQuery || recoveryDiagnostics.postFinalEligibilityRecoveryFetchCountByQuery,
                postFinalEligibilityRecoveryConvertedCount: attemptedDiagnostics?.postFinalEligibilityRecoveryConvertedCount || recoveryDiagnostics.postFinalEligibilityRecoveryConvertedCount,
                postFinalEligibilityRecoveryEnteredScoringTitles: attemptedDiagnostics?.postFinalEligibilityRecoveryEnteredScoringTitles || recoveryDiagnostics.postFinalEligibilityRecoveryEnteredScoringTitles,
                postFinalEligibilityRecoveryAcceptedTitles: previousSelected.filter(isTeenPostFinalRecoveryCandidate).map((candidate) => candidate.title),
                postFinalEligibilityRecoveryRejectedByReason: attemptedDiagnostics?.postFinalEligibilityRecoveryRejectedByReason || {},
                postFinalEligibilityRecoveryFinalCount: previousCleanCount,
                postFinalEligibilityRecoveryStoppedReason: "recovery_would_reduce_clean_count",
                meaningfulTasteRecoveryTriggered: true,
                meaningfulTasteRecoveryTriggerStage: "post_final_eligibility",
                meaningfulTasteRecoveryQueriesAttempted: attemptedDiagnostics?.postFinalEligibilityRecoveryQueriesAttempted || recoveryDiagnostics.postFinalEligibilityRecoveryQueriesAttempted,
                meaningfulTasteRecoveryAcceptedTitles: previousSelected.filter(isTeenPostFinalRecoveryCandidate).map((candidate) => candidate.title),
                meaningfulTasteRecoveryFinalCount: previousSelected.filter(isTeenPostFinalRecoveryCandidate).length,
                meaningfulTasteRecoverySurvivingFinalCount: previousCleanCount,
                underfilledAfterMeaningfulTasteRecovery: previousCleanCount < teenPostFinalEligibilityTarget,
                recoverySuccessRequiresFinalEligibility: true,
              },
            }
            : result);
          normalized = previousNormalized;
          scored = previousScored;
          selection = previousSelection;
          selected = previousSelected;
          rejectedReasons = previousRejectedReasons;
          break;
        }

        const finalRecoveryDiagnostics = sourceResults[openLibrarySourceIndex]?.diagnostics;
        if (finalRecoveryDiagnostics) {
          const recoverySelectedTitles = selected
            .filter(isTeenPostFinalRecoveryCandidate)
            .map((candidate) => candidate.title);
          const recoveryRejectedByReason = {
            ...sourceRejectedRecoveryByReason,
            ...teenRecoveryRejectedByReason(scored, selected),
          };
          const finalCleanCount = teenOpenLibraryCleanCount(selection, selected);
          finalRecoveryDiagnostics.postFinalEligibilityRecoveryAcceptedTitles = recoverySelectedTitles;
          finalRecoveryDiagnostics.postFinalEligibilityRecoveryRejectedByReason = recoveryRejectedByReason;
          finalRecoveryDiagnostics.postFinalEligibilityRecoveryFinalCount = finalCleanCount;
          finalRecoveryDiagnostics.postFinalEligibilityRecoveryStoppedReason = finalCleanCount >= teenPostFinalEligibilityTarget ? "reached_five" : "queries_exhausted";
          finalRecoveryDiagnostics.meaningfulTasteRecoveryAcceptedTitles = recoverySelectedTitles;
          finalRecoveryDiagnostics.meaningfulTasteRecoveryFinalCount = recoverySelectedTitles.length;
          finalRecoveryDiagnostics.meaningfulTasteRecoverySurvivingFinalCount = finalCleanCount;
          finalRecoveryDiagnostics.underfilledAfterMeaningfulTasteRecovery = finalCleanCount < teenPostFinalEligibilityTarget;
        }
      }
    }
  } else if (tasteProfile.ageBand === "teens" && openLibrarySourceResult) {
    openLibrarySourceResult.diagnostics.postFinalEligibilityUnderfillRecoveryTriggered = false;
    openLibrarySourceResult.diagnostics.postFinalEligibilityRecoveryTriggerCount = initialTeenOpenLibraryCleanCount;
    openLibrarySourceResult.diagnostics.postFinalEligibilityRecoveryFinalCount = initialTeenOpenLibraryCleanCount;
    openLibrarySourceResult.diagnostics.postFinalEligibilityRecoveryStoppedReason = "not_underfilled";
  }

  const adultPostFinalEligibilityTarget = Math.min(5, session.limit || 10);
  const initialAdultOpenLibraryCleanCount = adultOpenLibraryCleanCount(selection, selected);
  const shouldRunAdultPostFinalEligibilityRecovery = tasteProfile.ageBand === "adult"
    && Boolean(openLibrarySourceResult)
    && initialAdultOpenLibraryCleanCount < adultPostFinalEligibilityTarget;
  if (shouldRunAdultPostFinalEligibilityRecovery && openLibrarySourceResult) {
    const openLibraryPlan = searchPlan.sourcePlans.find((plan) => plan.source === "openLibrary");
    const adapter = openLibraryPlan ? sourceAdapters[openLibraryPlan.source] : undefined;
    const diagnostics = openLibrarySourceResult.diagnostics;
    const initialAcceptedTitles = uniqueStrings((((selection.rejectedReasons as Record<string, unknown>).finalEligibilityAcceptedTitles || []) as string[]), 20);
    let protectedAcceptedTitleSet = new Set(initialAcceptedTitles.map(normalizedTokenText));
    diagnostics.adultPostFinalRecoveryTriggered = true;
    diagnostics.adultPostFinalRecoveryInitialCleanCount = initialAdultOpenLibraryCleanCount;
    diagnostics.adultPostFinalRecoveryTargetCount = adultPostFinalEligibilityTarget;
    diagnostics.adultPostFinalRecoveryQueriesAttempted = [];
    diagnostics.adultPostFinalRecoveryFetchResultsByQuery = {};
    diagnostics.adultPostFinalRecoveryFetchedRawCountByQuery = {};
    diagnostics.adultPostFinalRecoveryConvertedCountByQuery = {};
    diagnostics.adultPostFinalRecoveryMergedCandidateCount = openLibrarySourceResult.rawItems.length;
    diagnostics.adultPostFinalRecoveryMergedTitles = uniqueStrings(openLibrarySourceResult.rawItems.map(titleOf), 40);
    diagnostics.adultPostFinalRecoveryAcceptedTitles = [];
    diagnostics.adultPostFinalRecoveryRejectedByReason = {};
    diagnostics.adultPostFinalRecoveryPreservedInitialTitles = initialAcceptedTitles;
    diagnostics.adultPostFinalRecoveryMissingInitialTitles = [];
    diagnostics.adultPostFinalRecoveryNoWorseningGuardPassed = true;
    diagnostics.adultPostFinalRecoveryRolledBackQueries = [];
    diagnostics.adultPostFinalRecoveryFinalCleanCount = initialAdultOpenLibraryCleanCount;
    diagnostics.adultPostFinalRecoveryStoppedReason = "not_started";
    diagnostics.postFinalEligibilityUnderfillRecoveryTriggered = true;
    diagnostics.postFinalEligibilityRecoveryTriggerCount = initialAdultOpenLibraryCleanCount;
    diagnostics.postFinalEligibilityRecoveryAcceptedTitles = [];
    diagnostics.postFinalEligibilityRecoveryRejectedByReason = {};
    diagnostics.postFinalEligibilityRecoveryFinalCount = initialAdultOpenLibraryCleanCount;
    diagnostics.recoverySuccessRequiresFinalEligibility = true;

    if (!openLibraryPlan || !adapter) {
      diagnostics.adultPostFinalRecoveryStoppedReason = "fetch_failed";
      diagnostics.postFinalEligibilityRecoveryStoppedReason = "fetch_failed";
    } else {
      const recoveryQueries = adultOpenLibraryPostFinalRecoveryQueries(tasteProfile, diagnostics, 3);
      if (!recoveryQueries.length) {
        const diagnosticsMap = diagnostics as unknown as Record<string, unknown>;
        const generated = Array.isArray(diagnosticsMap.adultPostFinalRecoveryGeneratedCandidates)
          ? (diagnosticsMap.adultPostFinalRecoveryGeneratedCandidates as Array<Record<string, unknown>>)
          : [];
        const hasSupported = generated.some((candidate) => Boolean(candidate.supported));
        diagnostics.adultPostFinalRecoveryStoppedReason = hasSupported ? "all_queries_already_attempted" : "no_liked_supported_queries";
        diagnostics.postFinalEligibilityRecoveryStoppedReason = diagnostics.adultPostFinalRecoveryStoppedReason;
      }

      for (const [recoveryIndex, recoveryQuery] of recoveryQueries.entries()) {
        if (adultOpenLibraryCleanCount(selection, selected) >= adultPostFinalEligibilityTarget) {
          diagnostics.adultPostFinalRecoveryStoppedReason = "target_reached";
          diagnostics.postFinalEligibilityRecoveryStoppedReason = "target_reached";
          break;
        }
        const previousSourceResults = sourceResults;
        const previousNormalized = normalized;
        const previousScored = scored;
        const previousSelection = selection;
        const previousSelected = selected;
        const previousRejectedReasons = rejectedReasons;
        const previousCleanCount = adultOpenLibraryCleanCount(selection, selected);
        const previousProtectedAcceptedTitleSet = new Set(protectedAcceptedTitleSet);

        const recoveryPlan: SourcePlan = {
          ...openLibraryPlan,
          intents: [{
            id: `adult-post-final-eligibility-recovery-${recoveryIndex + 1}`,
            query: recoveryQuery,
            facets: [],
            priority: 100 - recoveryIndex,
            rationale: ["Adult Open Library post-final eligibility recovery"],
          }],
        };
        const recoveryProfile: TasteProfile = {
          ...tasteProfile,
          diagnostics: {
            ...tasteProfile.diagnostics,
            forceAdultPostFinalEligibilityRecovery: true,
            forceAdultPostFinalEligibilityRecoveryQueries: [recoveryQuery],
            forceAdultPostFinalEligibilityRecoveryQueryOffset: (sourceResults[openLibrarySourceIndex]?.diagnostics.fetches || []).filter((fetch) => !fetch.diagnosticOnly).length + recoveryIndex,
          },
        };
        const recoveryDiagnostics = sourceResults[openLibrarySourceIndex]?.diagnostics || diagnostics;
        recoveryDiagnostics.adultPostFinalRecoveryQueriesAttempted = uniqueStrings([
          ...((recoveryDiagnostics.adultPostFinalRecoveryQueriesAttempted || []) as string[]),
          recoveryQuery,
        ], 3);
        recoveryDiagnostics.postFinalEligibilityRecoveryQueriesAttempted = recoveryDiagnostics.adultPostFinalRecoveryQueriesAttempted;

        const recoveryResponse = await runWithTimeout(openLibraryPlan.timeoutMs, (signal) => adapter.search(recoveryPlan, { profile: recoveryProfile, signal }));
        if (!recoveryResponse.value) {
          const reason = recoveryResponse.timedOut ? "query_limit_reached" : "fetch_failed";
          recoveryDiagnostics.adultPostFinalRecoveryStoppedReason = reason;
          recoveryDiagnostics.postFinalEligibilityRecoveryStoppedReason = reason;
          continue;
        }

        const recoveryResult = recoveryResponse.value;
        const fetchedForQuery = (recoveryResult.diagnostics.fetches || [])
          .filter((fetch) => String(fetch.query || "").toLowerCase() === recoveryQuery.toLowerCase())
          .reduce((sum, fetch) => sum + Number(fetch.docsReturned || 0), 0)
          || Number(recoveryResult.diagnostics.rawApiResultCount || 0);
        const fetchCountByQuery = {
          ...((recoveryDiagnostics.adultPostFinalRecoveryFetchResultsByQuery || {}) as Record<string, number>),
          [recoveryQuery]: fetchedForQuery,
        };
        const fetchedRawCountByQuery = {
          ...((recoveryDiagnostics.adultPostFinalRecoveryFetchedRawCountByQuery || {}) as Record<string, number>),
          [recoveryQuery]: fetchedForQuery,
        };
        const convertedCountByQuery = {
          ...((recoveryDiagnostics.adultPostFinalRecoveryConvertedCountByQuery || {}) as Record<string, number>),
          [recoveryQuery]: recoveryResult.rawItems.length,
        };
        const currentOpenLibraryResult = sourceResults[openLibrarySourceIndex] || openLibrarySourceResult;
        const markedRecoveryItems = markAdultPostFinalRecoveryItems(
          filterAdultRecoveryItemsAgainstExisting(recoveryResult.rawItems, currentOpenLibraryResult.rawItems),
          recoveryQuery,
        );
        const sourceRejectedRecoveryByReason = Object.entries(recoveryResult.diagnostics.dropReasons || {})
          .filter(([, count]) => Number(count || 0) > 0)
          .reduce<Record<string, string[]>>((acc, [reason, count]) => {
            acc[reason] = [`${Number(count || 0)} source rows`];
            return acc;
          }, {});
        const existingKeys = new Set(currentOpenLibraryResult.rawItems.map(sourceItemKey));
        const existingTitleAuthorKeys = new Set(currentOpenLibraryResult.rawItems.map(adultRecoveryTitleAuthorKey).filter(Boolean));
        const recoveryItemsEnteringScoring = markedRecoveryItems.filter((item) => {
          const key = sourceItemKey(item);
          const titleAuthorKey = adultRecoveryTitleAuthorKey(item);
          return Boolean((key && !existingKeys.has(key)) || (titleAuthorKey && !existingTitleAuthorKeys.has(titleAuthorKey)));
        });
        const mergedRawItems = mergeSourceItems(currentOpenLibraryResult.rawItems, markedRecoveryItems).slice(0, 30);
        const enteredTitles = uniqueStrings([
          ...((recoveryDiagnostics.postFinalEligibilityRecoveryEnteredScoringTitles || []) as string[]),
          ...recoveryItemsEnteringScoring.map(titleOf),
        ], 40);
        const mergedDiagnostics: SourceDiagnosticV2 = {
          ...currentOpenLibraryResult.diagnostics,
          status: mergedRawItems.length ? "succeeded" : currentOpenLibraryResult.status,
          rawCount: mergedRawItems.length,
          normalizedCount: mergedRawItems.length,
          usableRowsAfterFiltering: mergedRawItems.length,
          queries: uniqueStrings([...(currentOpenLibraryResult.diagnostics.queries || []), ...(recoveryResult.diagnostics.queries || [])], 20),
          rawTitles: uniqueStrings([...(currentOpenLibraryResult.diagnostics.rawTitles || []), ...(recoveryResult.diagnostics.rawTitles || []), ...markedRecoveryItems.map(titleOf)], 80),
          firstReturnedTitles: uniqueStrings(mergedRawItems.map(titleOf), 5),
          rawApiResultCount: Number(currentOpenLibraryResult.diagnostics.rawApiResultCount || 0) + Number(recoveryResult.diagnostics.rawApiResultCount || 0),
          droppedBeforeDocCount: Number(currentOpenLibraryResult.diagnostics.droppedBeforeDocCount || 0) + Number(recoveryResult.diagnostics.droppedBeforeDocCount || 0),
          dropReasons: mergeNumberRecords(currentOpenLibraryResult.diagnostics.dropReasons, recoveryResult.diagnostics.dropReasons),
          fetches: [...(currentOpenLibraryResult.diagnostics.fetches || []), ...(recoveryResult.diagnostics.fetches || [])],
          artifactSuppressedTitles: uniqueStrings([...(currentOpenLibraryResult.diagnostics.artifactSuppressedTitles || []), ...(recoveryResult.diagnostics.artifactSuppressedTitles || [])], 80),
          seriesSuppressedTitles: uniqueStrings([...(currentOpenLibraryResult.diagnostics.seriesSuppressedTitles || []), ...(recoveryResult.diagnostics.seriesSuppressedTitles || [])], 80),
          openLibraryDocsFetchedAcrossAllQueriesCount: Number(currentOpenLibraryResult.diagnostics.openLibraryDocsFetchedAcrossAllQueriesCount || 0) + Number(recoveryResult.diagnostics.openLibraryDocsFetchedAcrossAllQueriesCount || recoveryResult.diagnostics.rawApiResultCount || 0),
          openLibraryDocsEligibleForScoringCount: Number(currentOpenLibraryResult.diagnostics.openLibraryDocsEligibleForScoringCount || currentOpenLibraryResult.rawItems.length) + Number(recoveryResult.diagnostics.openLibraryDocsEligibleForScoringCount || recoveryResult.rawItems.length),
          openLibraryDocsActuallyHandedToScoringCount: mergedRawItems.length,
          adultPostFinalRecoveryTriggered: true,
          adultPostFinalRecoveryInitialCleanCount: initialAdultOpenLibraryCleanCount,
          adultPostFinalRecoveryTargetCount: adultPostFinalEligibilityTarget,
          adultPostFinalRecoveryQueriesAttempted: recoveryDiagnostics.adultPostFinalRecoveryQueriesAttempted,
          adultPostFinalRecoveryFetchResultsByQuery: fetchCountByQuery,
          adultPostFinalRecoveryFetchedRawCountByQuery: fetchedRawCountByQuery,
          adultPostFinalRecoveryConvertedCountByQuery: convertedCountByQuery,
          adultPostFinalRecoveryMergedCandidateCount: mergedRawItems.length,
          adultPostFinalRecoveryMergedTitles: uniqueStrings(mergedRawItems.map(titleOf), 40),
          adultPostFinalRecoveryAcceptedTitles: recoveryDiagnostics.adultPostFinalRecoveryAcceptedTitles || [],
          adultPostFinalRecoveryRejectedByReason: {
            ...((recoveryDiagnostics.adultPostFinalRecoveryRejectedByReason || {}) as Record<string, string[]>),
            ...sourceRejectedRecoveryByReason,
          },
          adultPostFinalRecoveryPreservedInitialTitles: recoveryDiagnostics.adultPostFinalRecoveryPreservedInitialTitles || initialAcceptedTitles,
          adultPostFinalRecoveryMissingInitialTitles: recoveryDiagnostics.adultPostFinalRecoveryMissingInitialTitles || [],
          adultPostFinalRecoveryNoWorseningGuardPassed: true,
          adultPostFinalRecoveryRolledBackQueries: recoveryDiagnostics.adultPostFinalRecoveryRolledBackQueries || [],
          adultPostFinalRecoveryFinalCleanCount: adultOpenLibraryCleanCount(selection, selected),
          adultPostFinalRecoveryStoppedReason: "query_limit_reached",
          postFinalEligibilityUnderfillRecoveryTriggered: true,
          postFinalEligibilityRecoveryTriggerCount: initialAdultOpenLibraryCleanCount,
          postFinalEligibilityRecoveryQueriesAttempted: recoveryDiagnostics.adultPostFinalRecoveryQueriesAttempted,
          postFinalEligibilityRecoveryFetchCountByQuery: fetchCountByQuery,
          postFinalEligibilityRecoveryConvertedCount: Number(recoveryDiagnostics.postFinalEligibilityRecoveryConvertedCount || 0) + recoveryResult.rawItems.length,
          postFinalEligibilityRecoveryEnteredScoringTitles: enteredTitles,
          postFinalEligibilityRecoveryAcceptedTitles: recoveryDiagnostics.postFinalEligibilityRecoveryAcceptedTitles || [],
          postFinalEligibilityRecoveryRejectedByReason: {
            ...((recoveryDiagnostics.postFinalEligibilityRecoveryRejectedByReason || {}) as Record<string, string[]>),
            ...sourceRejectedRecoveryByReason,
          },
          postFinalEligibilityRecoveryFinalCount: adultOpenLibraryCleanCount(selection, selected),
          postFinalEligibilityRecoveryStoppedReason: "query_limit_reached",
          recoverySuccessRequiresFinalEligibility: true,
        };
        sourceResults = sourceResults.map((result, index) => index === openLibrarySourceIndex
          ? { ...currentOpenLibraryResult, status: mergedRawItems.length ? "succeeded" : currentOpenLibraryResult.status, rawItems: mergedRawItems, diagnostics: mergedDiagnostics }
          : result);

        normalized = normalizeSourceResults(sourceResults);
        adultGoogleBooksNormalizationGate = applyAdultGoogleBooksNormalizationGate(normalized, tasteProfile);
        normalized = adultGoogleBooksNormalizationGate.candidates;
        adultGoogleBooksNormalizationDiagnostics = adultGoogleBooksNormalizationGate.diagnostics;
        preteenGoogleBooksPublicationIdentityPreScoringGate = applyPreteenGoogleBooksPublicationIdentityPreScoringGate(normalized, tasteProfile);
        normalized = preteenGoogleBooksPublicationIdentityPreScoringGate.candidates;
        kidsGoogleBooksPreScoringGate = applyKidsGoogleBooksPreScoringGate(normalized, tasteProfile);
        normalized = kidsGoogleBooksPreScoringGate.candidates;
        teensGoogleBooksPreScoringGate = applyTeensGoogleBooksPreScoringGate(normalized, tasteProfile);
        normalized = teensGoogleBooksPreScoringGate.candidates;
        scored = scoreCandidates(normalized, tasteProfile);
        selection = selectRecommendations(scored, tasteProfile, session.limit || 10);
        selected = selection.selected;
        rejectedReasons = selection.rejectedReasons;

        // Cap Adult recovery selection to min(5, session.limit) after each merge/rescore/reselect iteration
        const cappedSelected = capAdultRecoverySelection(selected, Math.min(5, session.limit || 10));
        if (cappedSelected.length !== selected.length) {
          // Record Google Books titles removed by the Open Library priority cap so the stage-lineage
          // diagnostics correctly attribute the drop to this cap rather than showing a generic
          // missing_in_next_googlebooks_stage gap.
          const droppedByCapCandidates = selected.filter((c) => !cappedSelected.some((s) => s.id === c.id));
          const droppedGbTitles = droppedByCapCandidates.filter((c) => c.source === "googleBooks").map((c) => c.title);
          if (droppedGbTitles.length > 0) {
            const rr = rejectedReasons as Record<string, unknown>;
            rr.googleBooksCapDroppedTitles = [
              ...((rr.googleBooksCapDroppedTitles || []) as string[]),
              ...droppedGbTitles,
            ];
            // Correct the finalAcceptedDocs snapshot so it only contains titles that survived the cap.
            const capDropSet = new Set(droppedGbTitles.map((t) => t.toLowerCase()));
            const acceptedTitles = (rr.adultGoogleBooksAcceptedTitles || []) as string[];
            rr.adultGoogleBooksAcceptedTitles = acceptedTitles.filter((t) => !capDropSet.has(t.toLowerCase()));
            // Update the per-title gate diagnostics for the cap-dropped titles.
            const gate = ((rr.googleBooksPostRankingGateByTitle || {}) as Record<string, string>);
            const gateReason = ((rr.googleBooksPostRankingGateReasonByTitle || {}) as Record<string, string>);
            const finalDecision = ((rr.googleBooksFinalSelectionDecisionByTitle || {}) as Record<string, string>);
            const finalExclusion = ((rr.googleBooksFinalSelectionExclusionReasonByTitle || {}) as Record<string, string>);
            for (const capTitle of droppedGbTitles) {
              gate[capTitle] = "adult_recovery_openlibrary_priority_cap";
              gateReason[capTitle] = "adult_recovery_openlibrary_priority_cap";
              finalDecision[capTitle] = "deferred_by_cap";
              finalExclusion[capTitle] = "adult_recovery_openlibrary_priority_cap";
            }
            rr.googleBooksPostRankingGateByTitle = gate;
            rr.googleBooksPostRankingGateReasonByTitle = gateReason;
            rr.googleBooksFinalSelectionDecisionByTitle = finalDecision;
            rr.googleBooksFinalSelectionExclusionReasonByTitle = finalExclusion;
          }
          selected = cappedSelected;
          selection.selected = cappedSelected;
        }

        const finalAcceptedTitleValues = (((selection.rejectedReasons as Record<string, unknown>).finalEligibilityAcceptedTitles || []) as string[]);
        const finalAcceptedTitles = new Set(finalAcceptedTitleValues.map(normalizedTokenText));
        const finalCleanCountAfterRecovery = adultOpenLibraryCleanCount(selection, selected);
        const missingProtectedTitles = [...previousProtectedAcceptedTitleSet].filter((title) => title && !finalAcceptedTitles.has(title));
        if (finalCleanCountAfterRecovery < previousCleanCount || missingProtectedTitles.length > 0) {
          const attemptedDiagnostics = sourceResults[openLibrarySourceIndex]?.diagnostics;
          sourceResults = previousSourceResults.map((result, index) => index === openLibrarySourceIndex
            ? {
              ...result,
              diagnostics: {
                ...result.diagnostics,
                adultPostFinalRecoveryTriggered: true,
                adultPostFinalRecoveryInitialCleanCount: initialAdultOpenLibraryCleanCount,
                adultPostFinalRecoveryTargetCount: adultPostFinalEligibilityTarget,
                adultPostFinalRecoveryQueriesAttempted: attemptedDiagnostics?.adultPostFinalRecoveryQueriesAttempted || recoveryDiagnostics.adultPostFinalRecoveryQueriesAttempted,
                adultPostFinalRecoveryFetchResultsByQuery: attemptedDiagnostics?.adultPostFinalRecoveryFetchResultsByQuery || recoveryDiagnostics.adultPostFinalRecoveryFetchResultsByQuery,
                adultPostFinalRecoveryFetchedRawCountByQuery: attemptedDiagnostics?.adultPostFinalRecoveryFetchedRawCountByQuery || recoveryDiagnostics.adultPostFinalRecoveryFetchedRawCountByQuery,
                adultPostFinalRecoveryConvertedCountByQuery: attemptedDiagnostics?.adultPostFinalRecoveryConvertedCountByQuery || recoveryDiagnostics.adultPostFinalRecoveryConvertedCountByQuery,
                adultPostFinalRecoveryMergedCandidateCount: result.rawItems.length,
                adultPostFinalRecoveryMergedTitles: uniqueStrings(result.rawItems.map(titleOf), 40),
                adultPostFinalRecoveryAcceptedTitles: previousSelected.filter(isAdultPostFinalRecoveryCandidate).map((candidate) => candidate.title),
                adultPostFinalRecoveryRejectedByReason: attemptedDiagnostics?.adultPostFinalRecoveryRejectedByReason || {},
                adultPostFinalRecoveryPreservedInitialTitles: initialAcceptedTitles.filter((title) => previousProtectedAcceptedTitleSet.has(normalizedTokenText(title))),
                adultPostFinalRecoveryMissingInitialTitles: missingProtectedTitles,
                adultPostFinalRecoveryNoWorseningGuardPassed: false,
                adultPostFinalRecoveryRolledBackQueries: uniqueStrings([...(attemptedDiagnostics?.adultPostFinalRecoveryRolledBackQueries || []), recoveryQuery], 10),
                adultPostFinalRecoveryFinalCleanCount: previousCleanCount,
                adultPostFinalRecoveryStoppedReason: "no_worsening_guard_failed",
                postFinalEligibilityUnderfillRecoveryTriggered: true,
                postFinalEligibilityRecoveryTriggerCount: initialAdultOpenLibraryCleanCount,
                postFinalEligibilityRecoveryQueriesAttempted: attemptedDiagnostics?.adultPostFinalRecoveryQueriesAttempted || recoveryDiagnostics.adultPostFinalRecoveryQueriesAttempted,
                postFinalEligibilityRecoveryAcceptedTitles: previousSelected.filter(isAdultPostFinalRecoveryCandidate).map((candidate) => candidate.title),
                postFinalEligibilityRecoveryRejectedByReason: attemptedDiagnostics?.adultPostFinalRecoveryRejectedByReason || {},
                postFinalEligibilityRecoveryFinalCount: previousCleanCount,
                postFinalEligibilityRecoveryStoppedReason: "no_worsening_guard_failed",
                recoverySuccessRequiresFinalEligibility: true,
              },
            }
            : result);
          normalized = previousNormalized;
          scored = previousScored;
          selection = previousSelection;
          selected = previousSelected;
          rejectedReasons = previousRejectedReasons;
          break;
        }

        protectedAcceptedTitleSet = new Set([...protectedAcceptedTitleSet, ...finalAcceptedTitles]);
        const finalRecoveryDiagnostics = sourceResults[openLibrarySourceIndex]?.diagnostics;
        if (finalRecoveryDiagnostics) {
          const recoverySelectedTitles = selected
            .filter(isAdultPostFinalRecoveryCandidate)
            .map((candidate) => candidate.title);
          const recoveryRejectedByReason = {
            ...sourceRejectedRecoveryByReason,
            ...adultRecoveryRejectedByReason(scored, selected),
          };
          const finalCleanCount = adultOpenLibraryCleanCount(selection, selected);
          const preservedInitialTitles = initialAcceptedTitles.filter((title) => finalAcceptedTitles.has(normalizedTokenText(title)));
          const missingInitialTitles = initialAcceptedTitles.filter((title) => !finalAcceptedTitles.has(normalizedTokenText(title)));
          finalRecoveryDiagnostics.adultPostFinalRecoveryAcceptedTitles = recoverySelectedTitles;
          finalRecoveryDiagnostics.adultPostFinalRecoveryRejectedByReason = recoveryRejectedByReason;
          finalRecoveryDiagnostics.adultPostFinalRecoveryPreservedInitialTitles = preservedInitialTitles;
          finalRecoveryDiagnostics.adultPostFinalRecoveryMissingInitialTitles = missingInitialTitles;
          finalRecoveryDiagnostics.adultPostFinalRecoveryNoWorseningGuardPassed = true;
          finalRecoveryDiagnostics.adultPostFinalRecoveryFinalCleanCount = finalCleanCount;
          finalRecoveryDiagnostics.adultPostFinalRecoveryStoppedReason = finalCleanCount >= adultPostFinalEligibilityTarget
            ? "target_reached"
            : recoveryItemsEnteringScoring.length === 0
              ? "no_new_candidates"
              : recoverySelectedTitles.length === 0
                ? "all_recovery_candidates_rejected"
                : "query_limit_reached";
          finalRecoveryDiagnostics.postFinalEligibilityRecoveryAcceptedTitles = recoverySelectedTitles;
          finalRecoveryDiagnostics.postFinalEligibilityRecoveryRejectedByReason = recoveryRejectedByReason;
          finalRecoveryDiagnostics.postFinalEligibilityRecoveryFinalCount = finalCleanCount;
          finalRecoveryDiagnostics.postFinalEligibilityRecoveryStoppedReason = finalRecoveryDiagnostics.adultPostFinalRecoveryStoppedReason;
        }
      }
    }
  } else if (tasteProfile.ageBand === "adult" && openLibrarySourceResult) {
    openLibrarySourceResult.diagnostics.adultPostFinalRecoveryTriggered = false;
    openLibrarySourceResult.diagnostics.adultPostFinalRecoveryInitialCleanCount = initialAdultOpenLibraryCleanCount;
    openLibrarySourceResult.diagnostics.adultPostFinalRecoveryTargetCount = adultPostFinalEligibilityTarget;
    openLibrarySourceResult.diagnostics.adultPostFinalRecoveryFinalCleanCount = initialAdultOpenLibraryCleanCount;
    openLibrarySourceResult.diagnostics.adultPostFinalRecoveryStoppedReason = "not_underfilled";
  }

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
        adultGoogleBooksNormalizationGate = applyAdultGoogleBooksNormalizationGate(normalized, tasteProfile);
        normalized = adultGoogleBooksNormalizationGate.candidates;
        adultGoogleBooksNormalizationDiagnostics = adultGoogleBooksNormalizationGate.diagnostics;
        preteenGoogleBooksPublicationIdentityPreScoringGate = applyPreteenGoogleBooksPublicationIdentityPreScoringGate(normalized, tasteProfile);
        normalized = preteenGoogleBooksPublicationIdentityPreScoringGate.candidates;
        kidsGoogleBooksPreScoringGate = applyKidsGoogleBooksPreScoringGate(normalized, tasteProfile);
        normalized = kidsGoogleBooksPreScoringGate.candidates;
        teensGoogleBooksPreScoringGate = applyTeensGoogleBooksPreScoringGate(normalized, tasteProfile);
        normalized = teensGoogleBooksPreScoringGate.candidates;
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
  const cleanCandidateUnderfilled = finalEligibilityCleanCandidateCount < 5
    || currentSelectionDiagnostics.lockQualityPass === false;
  const cleanShortfallExpansionSupported = tasteProfile.ageBand === "preteens" || tasteProfile.ageBand === "kids";
  const shouldRunCleanCandidateShortfallExpansion = cleanShortfallExpansionSupported
    && Boolean(currentOpenLibrarySourceResult)
    && cleanCandidateUnderfilled;
  if (shouldRunCleanCandidateShortfallExpansion && currentOpenLibrarySourceResult) {
    const openLibraryPlan = searchPlan.sourcePlans.find((plan) => plan.source === "openLibrary");
    const adapter = openLibraryPlan ? sourceAdapters[openLibraryPlan.source] : undefined;
    if (openLibraryPlan && adapter) {
      currentOpenLibrarySourceResult.diagnostics.cleanCandidateShortfallExpansionTriggered = true;
      const expansionProfile = {
        ...tasteProfile,
        diagnostics: {
          ...tasteProfile.diagnostics,
          forceMiddleGradesMeaningfulTasteRecovery: tasteProfile.ageBand === "preteens",
          forceMiddleGradesCleanCandidateShortfallExpansion: tasteProfile.ageBand === "preteens",
          forceKidsCleanCandidateShortfallExpansion: tasteProfile.ageBand === "kids",
          debugMiddleGradesDeepTrace: tasteProfile.ageBand === "preteens",
          middleGradesDeepDebugActive: tasteProfile.ageBand === "preteens",
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
        adultGoogleBooksNormalizationGate = applyAdultGoogleBooksNormalizationGate(normalized, tasteProfile);
        normalized = adultGoogleBooksNormalizationGate.candidates;
        adultGoogleBooksNormalizationDiagnostics = adultGoogleBooksNormalizationGate.diagnostics;
        preteenGoogleBooksPublicationIdentityPreScoringGate = applyPreteenGoogleBooksPublicationIdentityPreScoringGate(normalized, tasteProfile);
        normalized = preteenGoogleBooksPublicationIdentityPreScoringGate.candidates;
        kidsGoogleBooksPreScoringGate = applyKidsGoogleBooksPreScoringGate(normalized, tasteProfile);
        normalized = kidsGoogleBooksPreScoringGate.candidates;
        teensGoogleBooksPreScoringGate = applyTeensGoogleBooksPreScoringGate(normalized, tasteProfile);
        normalized = teensGoogleBooksPreScoringGate.candidates;
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
          expansionDiagnostics.meaningfulTasteRecoverySurvivingFinalCount = selected.length;
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
  } else if ((tasteProfile.ageBand === "preteens" || tasteProfile.ageBand === "kids") && currentOpenLibrarySourceResult) {
    currentOpenLibrarySourceResult.diagnostics.cleanCandidateShortfallExpansionTriggered = false;
    currentOpenLibrarySourceResult.diagnostics.expansionNotTriggeredReason = cleanCandidateUnderfilled
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

  const preteenGoogleBooksPublicationIdentityObservability = preteenGoogleBooksPublicationIdentityPreScoringObservability(
    preteenGoogleBooksPublicationIdentityPreScoringGate.diagnostics,
  );
  mergePreteenGoogleBooksPublicationIdentityPreScoringObservability(
    rejectedReasons as Record<string, unknown>,
    preteenGoogleBooksPublicationIdentityObservability,
  );
  const preteenGoogleBooksSourceResult = sourceResults.find((result) => result.source === "googleBooks");
  if (preteenGoogleBooksSourceResult && tasteProfile.ageBand === "preteens") {
    Object.assign(preteenGoogleBooksSourceResult.diagnostics as unknown as Record<string, unknown>, preteenGoogleBooksPublicationIdentityObservability);
  }

  const kidsGoogleBooksObservability = kidsGoogleBooksPreScoringObservability(kidsGoogleBooksPreScoringGate.diagnostics);
  Object.assign(rejectedReasons as Record<string, unknown>, kidsGoogleBooksObservability);
  for (const reason of Object.values(kidsGoogleBooksPreScoringGate.diagnostics.rejectedBeforeScoringByTitle)) {
    (rejectedReasons as Record<string, unknown>)[reason] = Number((rejectedReasons as Record<string, unknown>)[reason] || 0) + 1;
  }
  const kidsGoogleBooksSourceResult = sourceResults.find((result) => result.source === "googleBooks");
  if (kidsGoogleBooksSourceResult && tasteProfile.ageBand === "kids") {
    Object.assign(kidsGoogleBooksSourceResult.diagnostics as unknown as Record<string, unknown>, kidsGoogleBooksObservability);
  }

  const teensGoogleBooksObservability = teensGoogleBooksPreScoringObservability(teensGoogleBooksPreScoringGate.diagnostics);
  Object.assign(rejectedReasons as Record<string, unknown>, teensGoogleBooksObservability);
  for (const reason of Object.values(teensGoogleBooksPreScoringGate.diagnostics.rejectedBeforeScoringByTitle)) {
    (rejectedReasons as Record<string, unknown>)[reason] = Number((rejectedReasons as Record<string, unknown>)[reason] || 0) + 1;
  }
  const teensGoogleBooksSourceResult = sourceResults.find((result) => result.source === "googleBooks");
  if (teensGoogleBooksSourceResult && tasteProfile.ageBand === "teens") {
    Object.assign(teensGoogleBooksSourceResult.diagnostics as unknown as Record<string, unknown>, teensGoogleBooksObservability);
  }

  markPipelineObjects(normalized, "normalized", requestId);
  stages.push(stageDiagnostic("normalized", { normalized: normalized.length }));

  markPipelineObjects(scored, "scored", requestId);
  stages.push(stageDiagnostic("scored", { scored: scored.length }));

  const googleBooksRankedCandidateTitles = uniqueStrings(
    scored
      .filter((candidate) => candidate.source === "googleBooks")
      .map((candidate) => candidate.title),
    120,
  );
  const googleBooksFinalEligibilityDecisionByTitle = ((rejectedReasons as Record<string, unknown>).googleBooksFinalEligibilityDecisionByTitle || {}) as Record<string, unknown>;
  const googleBooksEligibilityReasonByTitle = ((rejectedReasons as Record<string, unknown>).adultGoogleBooksEligibilityReasonByTitle || {}) as Record<string, unknown>;
  const googleBooksFinalEligibilityTitles = uniqueStrings(
    [
      ...Object.entries(googleBooksFinalEligibilityDecisionByTitle)
        .filter(([, decision]) => String(decision || "") === "accepted")
        .map(([title]) => title),
      ...Object.entries(googleBooksEligibilityReasonByTitle)
        .filter(([, reason]) => String(reason || "").startsWith("adult_googlebooks_minimal_final_gate_passed"))
        .map(([title]) => title),
    ],
    120,
  );
  const googleBooksSourceResultForDiagnostics = sourceResults.find((result) => result.source === "googleBooks");
  if (googleBooksSourceResultForDiagnostics) {
    const sourceDiagnostics = googleBooksSourceResultForDiagnostics.diagnostics as unknown as Record<string, unknown>;
    const queryByTitle = (sourceDiagnostics.googleBooksQueryByTitle || {}) as Record<string, string>;
    const queryResultQualityByQuery = { ...((sourceDiagnostics.googleBooksQueryResultQualityByQuery || {}) as Record<string, Record<string, unknown>>) };
    const rankedSet = new Set(googleBooksRankedCandidateTitles.map((title) => normalizedTokenText(title)));
    const preScoringRejectedSet = new Set([
      ...Object.keys(preteenGoogleBooksPublicationIdentityPreScoringGate.diagnostics.rejectedBeforeScoringByTitle),
      ...Object.keys(kidsGoogleBooksPreScoringGate.diagnostics.rejectedBeforeScoringByTitle),
      ...Object.keys(teensGoogleBooksPreScoringGate.diagnostics.rejectedBeforeScoringByTitle),
    ].map((title) => normalizedTokenText(title)));
    const finalEligibilitySet = new Set(googleBooksFinalEligibilityTitles.map((title) => normalizedTokenText(title)));
    const selectedSet = new Set(selected.filter((candidate) => candidate.source === "googleBooks").map((candidate) => normalizedTokenText(candidate.title)));
    for (const [title, query] of Object.entries(queryByTitle)) {
      const normalizedTitle = normalizedTokenText(title);
      const queryKey = String(query || "");
      if (!queryKey) continue;
      const row = (queryResultQualityByQuery[queryKey] || { query: queryKey }) as Record<string, unknown>;
      const enteredRankingTitles = uniqueStrings([
        ...(((row.enteredRankingTitles || []) as string[]).filter((candidateTitle) => !preScoringRejectedSet.has(normalizedTokenText(candidateTitle)))),
        ...(rankedSet.has(normalizedTitle) && !preScoringRejectedSet.has(normalizedTitle) ? [title] : []),
      ], 120);
      const enteredFinalEligibilityTitles = uniqueStrings([
        ...(((row.enteredFinalEligibilityTitles || []) as string[]).filter((candidateTitle) => !preScoringRejectedSet.has(normalizedTokenText(candidateTitle)))),
        ...(finalEligibilitySet.has(normalizedTitle) && !preScoringRejectedSet.has(normalizedTitle) ? [title] : []),
      ], 120);
      const acceptedRecommendationTitles = uniqueStrings([
        ...(((row.acceptedRecommendationTitles || []) as string[]).filter((candidateTitle) => !preScoringRejectedSet.has(normalizedTokenText(candidateTitle)))),
        ...(selectedSet.has(normalizedTitle) && !preScoringRejectedSet.has(normalizedTitle) ? [title] : []),
      ], 120);
      row.enteredRankingTitles = enteredRankingTitles;
      row.enteredFinalEligibilityTitles = enteredFinalEligibilityTitles;
      row.acceptedRecommendationTitles = acceptedRecommendationTitles;
      row.enteredRankingCount = enteredRankingTitles.length;
      row.finalEligibilityCandidateCount = enteredFinalEligibilityTitles.length;
      row.acceptedRecommendationCount = acceptedRecommendationTitles.length;
      queryResultQualityByQuery[queryKey] = row;
    }
    sourceDiagnostics.googleBooksQueryResultQualityByQuery = queryResultQualityByQuery;
    sourceDiagnostics.adultGoogleBooksQueryQualityByQuery = queryResultQualityByQuery;
    sourceDiagnostics.googleBooksRankedCandidateTitles = googleBooksRankedCandidateTitles;
    sourceDiagnostics.googleBooksFinalEligibilityTitles = googleBooksFinalEligibilityTitles;
  }

  const rejectedReasonsWithGoogleBooksNormalization = rejectedReasons as Record<string, unknown>;
  rejectedReasonsWithGoogleBooksNormalization.googleBooksNormalizedRejectReasonByTitle = adultGoogleBooksNormalizationDiagnostics.googleBooksNormalizedRejectReasonByTitle;
  rejectedReasonsWithGoogleBooksNormalization.googleBooksNormalizationEligibilityByTitle = adultGoogleBooksNormalizationDiagnostics.googleBooksNormalizationEligibilityByTitle;
  rejectedReasonsWithGoogleBooksNormalization.googleBooksNarrativeEvidenceByTitle = adultGoogleBooksNormalizationDiagnostics.googleBooksNarrativeEvidenceByTitle;
  rejectedReasonsWithGoogleBooksNormalization.googleBooksAnthologyEvidenceByTitle = adultGoogleBooksNormalizationDiagnostics.googleBooksAnthologyEvidenceByTitle;
  rejectedReasonsWithGoogleBooksNormalization.googleBooksReferenceEvidenceByTitle = adultGoogleBooksNormalizationDiagnostics.googleBooksReferenceEvidenceByTitle;
  rejectedReasonsWithGoogleBooksNormalization.googleBooksPublisherEvidenceByTitle = adultGoogleBooksNormalizationDiagnostics.googleBooksPublisherEvidenceByTitle;
  rejectedReasonsWithGoogleBooksNormalization.googleBooksPublicationShapeByTitle = adultGoogleBooksNormalizationDiagnostics.googleBooksPublicationShapeByTitle;
  rejectedReasonsWithGoogleBooksNormalization.googleBooksNarrativeConfidenceByTitle = adultGoogleBooksNormalizationDiagnostics.googleBooksNarrativeConfidenceByTitle;
  rejectedReasonsWithGoogleBooksNormalization.googleBooksPublicationShapeEvidenceByTitle = adultGoogleBooksNormalizationDiagnostics.googleBooksPublicationShapeEvidenceByTitle;
  rejectedReasonsWithGoogleBooksNormalization.googleBooksNarrativePriorityAdjustmentByTitle = adultGoogleBooksNormalizationDiagnostics.googleBooksNarrativePriorityAdjustmentByTitle;
  rejectedReasonsWithGoogleBooksNormalization.googleBooksPublicationShapeRejectedBeforeRankingByTitle = adultGoogleBooksNormalizationDiagnostics.googleBooksPublicationShapeRejectedBeforeRankingByTitle;
  rejectedReasonsWithGoogleBooksNormalization.googleBooksDominantPublicationShapeEvidenceByTitle = adultGoogleBooksNormalizationDiagnostics.googleBooksDominantPublicationShapeEvidenceByTitle;
  rejectedReasonsWithGoogleBooksNormalization.googleBooksOverriddenNarrativeEvidenceByTitle = adultGoogleBooksNormalizationDiagnostics.googleBooksOverriddenNarrativeEvidenceByTitle;
  rejectedReasonsWithGoogleBooksNormalization.googleBooksPublicationShapePrecedenceDecisionByTitle = adultGoogleBooksNormalizationDiagnostics.googleBooksPublicationShapePrecedenceDecisionByTitle;
  rejectedReasonsWithGoogleBooksNormalization.googleBooksExplicitNonNarrativeIdentityByTitle = adultGoogleBooksNormalizationDiagnostics.googleBooksExplicitNonNarrativeIdentityByTitle;
  rejectedReasonsWithGoogleBooksNormalization.googleBooksStoryLevelNarrativeEvidenceByTitle = adultGoogleBooksNormalizationDiagnostics.googleBooksStoryLevelNarrativeEvidenceByTitle;
  rejectedReasonsWithGoogleBooksNormalization.googleBooksGenericCategoryTitleByTitle = adultGoogleBooksNormalizationDiagnostics.googleBooksGenericCategoryTitleByTitle;
  rejectedReasonsWithGoogleBooksNormalization.googleBooksGenericCategoryEvidenceByTitle = adultGoogleBooksNormalizationDiagnostics.googleBooksGenericCategoryEvidenceByTitle;
  rejectedReasonsWithGoogleBooksNormalization.googleBooksGenericCategoryRejectedBeforeRankingByTitle = adultGoogleBooksNormalizationDiagnostics.googleBooksGenericCategoryRejectedBeforeRankingByTitle;
  rejectedReasonsWithGoogleBooksNormalization.googleBooksUnknownShapeEligibilityByTitle = adultGoogleBooksNormalizationDiagnostics.googleBooksUnknownShapeEligibilityByTitle;
  rejectedReasonsWithGoogleBooksNormalization.googleBooksUnknownShapeEvidenceByTitle = adultGoogleBooksNormalizationDiagnostics.googleBooksUnknownShapeEvidenceByTitle;
  rejectedReasonsWithGoogleBooksNormalization.googleBooksUnknownShapeRejectedReasonByTitle = adultGoogleBooksNormalizationDiagnostics.googleBooksUnknownShapeRejectedReasonByTitle;
  rejectedReasonsWithGoogleBooksNormalization.googleBooksUnknownStoryEvidenceCountByTitle = adultGoogleBooksNormalizationDiagnostics.googleBooksUnknownStoryEvidenceCountByTitle;
  rejectedReasonsWithGoogleBooksNormalization.googleBooksUnknownStoryEvidenceFamiliesByTitle = adultGoogleBooksNormalizationDiagnostics.googleBooksUnknownStoryEvidenceFamiliesByTitle;
  rejectedReasonsWithGoogleBooksNormalization.googleBooksUnknownNarrativeCorroborationByTitle = adultGoogleBooksNormalizationDiagnostics.googleBooksUnknownNarrativeCorroborationByTitle;
  rejectedReasonsWithGoogleBooksNormalization.googleBooksUnknownEligibilityThresholdDecisionByTitle = adultGoogleBooksNormalizationDiagnostics.googleBooksUnknownEligibilityThresholdDecisionByTitle;
  rejectedReasonsWithGoogleBooksNormalization.googleBooksSubjectOfStudyTitleByTitle = adultGoogleBooksNormalizationDiagnostics.googleBooksSubjectOfStudyTitleByTitle;
  rejectedReasonsWithGoogleBooksNormalization.googleBooksSubjectOfStudyEvidenceByTitle = adultGoogleBooksNormalizationDiagnostics.googleBooksSubjectOfStudyEvidenceByTitle;
  rejectedReasonsWithGoogleBooksNormalization.googleBooksSubjectOfStudyRejectedBeforeRankingByTitle = adultGoogleBooksNormalizationDiagnostics.googleBooksSubjectOfStudyRejectedBeforeRankingByTitle;
  rejectedReasonsWithGoogleBooksNormalization.googleBooksCuratedBookGuideIdentityByTitle = adultGoogleBooksNormalizationDiagnostics.googleBooksCuratedBookGuideIdentityByTitle;
  rejectedReasonsWithGoogleBooksNormalization.googleBooksCuratedBookGuideEvidenceByTitle = adultGoogleBooksNormalizationDiagnostics.googleBooksCuratedBookGuideEvidenceByTitle;
  rejectedReasonsWithGoogleBooksNormalization.googleBooksPeriodicalIdentityEvidenceByTitle = adultGoogleBooksNormalizationDiagnostics.googleBooksPeriodicalIdentityEvidenceByTitle;
  rejectedReasonsWithGoogleBooksNormalization.googleBooksPeriodicalIdentityDecisionByTitle = adultGoogleBooksNormalizationDiagnostics.googleBooksPeriodicalIdentityDecisionByTitle;
  rejectedReasonsWithGoogleBooksNormalization.googleBooksRankedCandidateTitles = googleBooksRankedCandidateTitles;
  rejectedReasonsWithGoogleBooksNormalization.googleBooksEnteredRanking = adultGoogleBooksNormalizationDiagnostics.googleBooksEnteredRanking;
  rejectedReasonsWithGoogleBooksNormalization.googleBooksRejectedBeforeRankingReason = adultGoogleBooksNormalizationDiagnostics.googleBooksRejectedBeforeRankingReason;
  Object.assign(rejectedReasonsWithGoogleBooksNormalization, buildGoogleBooksAgeBandInfrastructureDiagnostics({
    profile: tasteProfile,
    searchPlan,
    sourceResults,
    normalizedCandidates: normalized,
    scoredCandidates: scored,
    selectedCandidates: selected,
    selectionDiagnostics: rejectedReasons as Record<string, unknown>,
  }));

  const preteenRescueSourceResult = sourceResults.find((result) => result.source === "googleBooks");
  if (preteenRescueSourceResult && tasteProfile.ageBand === "preteens") {
    const sourceDiagnostics = preteenRescueSourceResult.diagnostics as unknown as Record<string, unknown>;
    const rescuedTitles = uniqueStrings((sourceDiagnostics.preteenGoogleBooksPublicationShapeRescuedTitles || []) as string[], 120);
    const scoredTitleSet = new Set(scored.filter((candidate) => candidate.source === "googleBooks").map((candidate) => normalizedTokenText(candidate.title)));
    const selectedTitleSet = new Set(selected.filter((candidate) => candidate.source === "googleBooks").map((candidate) => normalizedTokenText(candidate.title)));
    const enteredScoringTitles = rescuedTitles.filter((title) => scoredTitleSet.has(normalizedTokenText(title)));
    const selectedRescuedTitles = rescuedTitles.filter((title) => selectedTitleSet.has(normalizedTokenText(title)));
    const downstreamDropReasonByTitle = (rejectedReasonsWithGoogleBooksNormalization.googleBooksAgeBandDropReasonByTitle || {}) as Record<string, string>;
    const notSelectedReasonByTitle: Record<string, string> = {};
    for (const title of rescuedTitles) {
      if (selectedTitleSet.has(normalizedTokenText(title))) continue;
      notSelectedReasonByTitle[title] = downstreamDropReasonByTitle[title]
        || (scoredTitleSet.has(normalizedTokenText(title))
          ? "not_selected_after_scoring_and_downstream_selection"
          : "did_not_reach_scoring_after_source_rescue");
    }
    const existingSummary = (sourceDiagnostics.preteenGoogleBooksPublicationShapeRescueSummary || {}) as Record<string, unknown>;
    const rescueSummary = {
      ...existingSummary,
      enteredScoringCount: enteredScoringTitles.length,
      laterSelectedCount: selectedRescuedTitles.length,
      laterNotSelectedCount: Object.keys(notSelectedReasonByTitle).length,
      scoringCandidateCountChange: enteredScoringTitles.length,
      finalRecommendationCountChange: selectedRescuedTitles.length,
      automaticFinalAcceptance: false,
    };
    sourceDiagnostics.preteenGoogleBooksPublicationShapeRescueEnteredScoringTitles = enteredScoringTitles;
    sourceDiagnostics.preteenGoogleBooksPublicationShapeRescueSelectedTitles = selectedRescuedTitles;
    sourceDiagnostics.preteenGoogleBooksPublicationShapeRescueNotSelectedReasonByTitle = notSelectedReasonByTitle;
    sourceDiagnostics.preteenGoogleBooksPublicationShapeRescueSummary = rescueSummary;
    rejectedReasonsWithGoogleBooksNormalization.preteenGoogleBooksPublicationShapeRescueAppliedByTitle = sourceDiagnostics.preteenGoogleBooksPublicationShapeRescueAppliedByTitle || {};
    rejectedReasonsWithGoogleBooksNormalization.preteenGoogleBooksPublicationShapeRescueReasonByTitle = sourceDiagnostics.preteenGoogleBooksPublicationShapeRescueReasonByTitle || {};
    rejectedReasonsWithGoogleBooksNormalization.preteenGoogleBooksPublicationShapeRescueEvidenceByTitle = sourceDiagnostics.preteenGoogleBooksPublicationShapeRescueEvidenceByTitle || {};
    rejectedReasonsWithGoogleBooksNormalization.preteenGoogleBooksPublicationShapeRescuedTitles = rescuedTitles;
    rejectedReasonsWithGoogleBooksNormalization.preteenGoogleBooksPublicationShapeRescueRejectedTitles = sourceDiagnostics.preteenGoogleBooksPublicationShapeRescueRejectedTitles || [];
    rejectedReasonsWithGoogleBooksNormalization.preteenGoogleBooksPublicationShapeRescueRejectedReasonByTitle = sourceDiagnostics.preteenGoogleBooksPublicationShapeRescueRejectedReasonByTitle || {};
    rejectedReasonsWithGoogleBooksNormalization.preteenGoogleBooksPublicationShapeRescueEnteredScoringTitles = enteredScoringTitles;
    rejectedReasonsWithGoogleBooksNormalization.preteenGoogleBooksPublicationShapeRescueSelectedTitles = selectedRescuedTitles;
    rejectedReasonsWithGoogleBooksNormalization.preteenGoogleBooksPublicationShapeRescueNotSelectedReasonByTitle = notSelectedReasonByTitle;
    rejectedReasonsWithGoogleBooksNormalization.preteenGoogleBooksPublicationShapeRescueSummary = rescueSummary;
  }
  if (tasteProfile.ageBand === "teens") {
    applyOpenLibraryPerQueryFinalLineage(sourceResults, selected);
  }
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
