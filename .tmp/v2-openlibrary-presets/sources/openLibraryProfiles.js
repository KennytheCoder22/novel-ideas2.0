"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_OPEN_LIBRARY_PROFILE = exports.OPEN_LIBRARY_AGE_PROFILES = void 0;
exports.openLibraryProfileForAgeBand = openLibraryProfileForAgeBand;
exports.openLibraryArtifactReasonLabels = openLibraryArtifactReasonLabels;
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
const K2_ARTIFACT_REASON_LABELS = [
    "k2_age_shape_mismatch",
];
const BASE_OPEN_LIBRARY_PROFILE = {
    queryLimit: 4,
    docLimit: 10,
    minCleanDocs: 6,
    docsPerQuery: 8,
    perQueryTimeoutMs: 2000,
    probeTimeoutMs: 1500,
    probeReserveBufferMs: 250,
    commonArtifactReasonLabels: COMMON_ARTIFACT_REASON_LABELS,
    lockedBaseline: false,
};
exports.OPEN_LIBRARY_AGE_PROFILES = {
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
        behaviorLabel: "middle_grades_openlibrary_locked_baseline",
        queryLimit: 14,
        perQueryTimeoutMs: 7500,
        diagnosticProbeQuery: "middle grade fantasy",
        ageSpecificArtifactReasonLabels: MIDDLE_GRADES_ARTIFACT_REASON_LABELS,
        lockedBaseline: true,
    },
    kids: {
        ...BASE_OPEN_LIBRARY_PROFILE,
        key: "k2",
        ageBand: "kids",
        behaviorLabel: "k2_openlibrary_profile_pending",
        queryLimit: 12,
        docLimit: 24,
        docsPerQuery: 12,
        minCleanDocs: 18,
        diagnosticProbeQuery: "easy reader",
        ageSpecificArtifactReasonLabels: K2_ARTIFACT_REASON_LABELS,
    },
};
exports.DEFAULT_OPEN_LIBRARY_PROFILE = exports.OPEN_LIBRARY_AGE_PROFILES.teens;
function openLibraryProfileForAgeBand(ageBand) {
    return exports.OPEN_LIBRARY_AGE_PROFILES[ageBand] || exports.DEFAULT_OPEN_LIBRARY_PROFILE;
}
function openLibraryArtifactReasonLabels(profile) {
    return new Set([...profile.commonArtifactReasonLabels, ...profile.ageSpecificArtifactReasonLabels]);
}
