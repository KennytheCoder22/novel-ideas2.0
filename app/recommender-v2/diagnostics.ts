import type { DiagnosticReportV2, RecommendationResultV2, ScoredCandidate, SearchPlan, SourceDiagnosticV2, StageDiagnosticV2, TasteProfile } from "./types";

export function stageDiagnostic(stage: string, counts?: Record<string, number>, details?: Record<string, unknown>): StageDiagnosticV2 {
  return { stage, status: "ok", counts, details };
}

export function buildDiagnosticReport(input: {
  requestId: string;
  startedAt: string;
  finishedAt: string;
  stages: StageDiagnosticV2[];
  tasteProfile: TasteProfile;
  searchPlan: SearchPlan;
  sources: SourceDiagnosticV2[];
  rejectedReasons: Record<string, number>;
  finalItems: ScoredCandidate[];
}): DiagnosticReportV2 {
  return {
    requestId: input.requestId,
    startedAt: input.startedAt,
    finishedAt: input.finishedAt,
    elapsedMs: Date.parse(input.finishedAt) - Date.parse(input.startedAt),
    stages: input.stages,
    tasteProfile: input.tasteProfile,
    searchPlan: input.searchPlan,
    sources: input.sources,
    rejectedReasons: input.rejectedReasons,
    finalSelectionTitles: input.finalItems.map((item) => item.title),
  };
}

export function buildRecommendationResultV2(items: ScoredCandidate[], diagnostics: DiagnosticReportV2): RecommendationResultV2 {
  return {
    engineVersion: "recommender-v2-openlibrary-baseline",
    items,
    diagnostics,
  };
}
