import type { AgeBandV2 } from "../types";

export type OpenLibraryAgeProfileKey = "teen" | "adult" | "middleGrades" | "k2";

export interface OpenLibraryAgeProfile {
  key: OpenLibraryAgeProfileKey;
  ageBand: AgeBandV2;
  behaviorLabel: string;
  queryLimit: number;
  docLimit: number;
  minCleanDocs: number;
  docsPerQuery: number;
  diagnosticProbeQuery: string;
  perQueryTimeoutMs: number;
  probeTimeoutMs: number;
  probeReserveBufferMs: number;
  commonArtifactReasonLabels: string[];
  ageSpecificArtifactReasonLabels: string[];
  lockedBaseline: boolean;
}

const COMMON_ARTIFACT_REASON_LABELS = [
  "artifact_title",
  "literary_analysis_artifact",
  "programming_guide_artifact",
  "survival_guide_artifact",
  "literal_title_match_artifact",
  "author_name_title_drift",
  "keyword_stuffed_marketing_artifact",
  "media_study_artifact",
  "adult_profile_artifact",
];

const TEEN_ARTIFACT_REASON_LABELS = [
  "adult_dark_romance_artifact",
  "weak_odd_title_teen_fit",
  "teen_inappropriate_content",
  "too_young_for_teen_artifact",
];

const MIDDLE_GRADES_ARTIFACT_REASON_LABELS = [
  "middle_grades_age_shape_mismatch",
];

const BASE_OPEN_LIBRARY_PROFILE = {
  queryLimit: 4,
  docLimit: 10,
  minCleanDocs: 6,
  docsPerQuery: 8,
  perQueryTimeoutMs: 2_000,
  probeTimeoutMs: 1_500,
  probeReserveBufferMs: 250,
  commonArtifactReasonLabels: COMMON_ARTIFACT_REASON_LABELS,
  lockedBaseline: false,
};

export const OPEN_LIBRARY_AGE_PROFILES: Record<AgeBandV2, OpenLibraryAgeProfile> = {
  teens: {
    ...BASE_OPEN_LIBRARY_PROFILE,
    key: "teen",
    ageBand: "teens",
    behaviorLabel: "teen_openlibrary_locked_baseline",
    diagnosticProbeQuery: "fantasy",
    ageSpecificArtifactReasonLabels: TEEN_ARTIFACT_REASON_LABELS,
    lockedBaseline: true,
  },
  adult: {
    ...BASE_OPEN_LIBRARY_PROFILE,
    key: "adult",
    ageBand: "adult",
    behaviorLabel: "adult_openlibrary_locked_baseline",
    diagnosticProbeQuery: "fiction",
    ageSpecificArtifactReasonLabels: [],
    lockedBaseline: true,
  },
  preteens: {
    ...BASE_OPEN_LIBRARY_PROFILE,
    key: "middleGrades",
    ageBand: "preteens",
    behaviorLabel: "middle_grades_openlibrary_profile_pending",
    queryLimit: 14,
    perQueryTimeoutMs: 7_500,
    diagnosticProbeQuery: "middle grade fantasy",
    ageSpecificArtifactReasonLabels: MIDDLE_GRADES_ARTIFACT_REASON_LABELS,
  },
  kids: {
    ...BASE_OPEN_LIBRARY_PROFILE,
    key: "k2",
    ageBand: "kids",
    behaviorLabel: "k2_openlibrary_profile_pending",
    diagnosticProbeQuery: "easy reader",
    ageSpecificArtifactReasonLabels: [],
  },
};

export const DEFAULT_OPEN_LIBRARY_PROFILE = OPEN_LIBRARY_AGE_PROFILES.teens;

export function openLibraryProfileForAgeBand(ageBand: AgeBandV2): OpenLibraryAgeProfile {
  return OPEN_LIBRARY_AGE_PROFILES[ageBand] || DEFAULT_OPEN_LIBRARY_PROFILE;
}

export function openLibraryArtifactReasonLabels(profile: OpenLibraryAgeProfile): Set<string> {
  return new Set([...profile.commonArtifactReasonLabels, ...profile.ageSpecificArtifactReasonLabels]);
}
