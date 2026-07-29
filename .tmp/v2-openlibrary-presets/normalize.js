"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeSourceResults = normalizeSourceResults;
const preteenGoogleBooksPublicationIdentity_1 = require("./preteenGoogleBooksPublicationIdentity");
const AGE_BAND_VALUES = new Set(["kids", "preteens", "teens", "adult"]);
const GOOGLE_BOOKS_MATURITY_RATINGS = new Set(["MATURE", "NOT_MATURE"]);
function asStringArray(value) {
    return Array.isArray(value) ? value.map((item) => String(item || "").trim()).filter(Boolean) : [];
}
function normalizeFormat(value) {
    const raw = String(value || "unknown").trim();
    return ["book", "manga", "comic", "graphicNovel", "anime", "unknown"].includes(raw) ? raw : "unknown";
}
function ageBandValue(value) {
    const raw = String(value || "").trim();
    return AGE_BAND_VALUES.has(raw) ? raw : undefined;
}
function googleBooksSourceMaturityRating(row) {
    const explicit = String(row.sourceMaturityRating || row.maturityRating || "").trim();
    if (explicit)
        return explicit;
    const maturityBand = String(row.maturityBand || row.maturity || "").trim();
    return GOOGLE_BOOKS_MATURITY_RATINGS.has(maturityBand.toUpperCase()) ? maturityBand : "";
}
function googleBooksContentMaturityFromRating(value) {
    const raw = String(value || "").trim().toUpperCase();
    if (raw === "MATURE" || raw === "EXPLICIT_MATURE")
        return "mature";
    if (raw === "NOT_MATURE")
        return "not_mature";
    return "unknown";
}
function googleBooksIsNotMature(row) {
    const rating = String(googleBooksSourceMaturityRating(row) || "").trim().toUpperCase();
    return rating === "NOT_MATURE";
}
function googleBooksCombinedMetadataText(row) {
    const volumeInfo = row.volumeInfo && typeof row.volumeInfo === "object"
        ? row.volumeInfo
        : {};
    const categories = asStringArray(volumeInfo.categories || row.genres);
    return [
        row.title,
        row.subtitle,
        row.description,
        volumeInfo.description,
        categories.join(" | "),
        volumeInfo.publisher || row.publisher,
    ]
        .map((value) => String(value || "").toLowerCase())
        .join(" ");
}
function googleBooksHasExplicitEarlyReaderMarkers(row) {
    const text = googleBooksCombinedMetadataText(row);
    return /\b(picture books?|board books?|early readers?|easy readers?|beginning readers?|leveled readers?|learn to read|read aloud|phonics readers?|kindergarten|preschool|grades?\s*(?:k|1|2)\b|grade\s*(?:k|1|2)\b)\b/.test(text);
}
function preteenGoogleBooksHighConfidenceMiddleGradeNovel(row) {
    const volumeInfo = row.volumeInfo && typeof row.volumeInfo === "object"
        ? row.volumeInfo
        : {};
    const audit = (0, preteenGoogleBooksPublicationIdentity_1.preteenGoogleBooksPublicationIdentityAudit)({
        id: String(row.id || row.sourceId || "googleBooks:normalize-audit"),
        source: "googleBooks",
        sourceId: String(row.sourceId || row.id || "normalize-audit"),
        title: String(row.title || volumeInfo.title || "").trim(),
        subtitle: String(row.subtitle || volumeInfo.subtitle || "").trim() || undefined,
        creators: asStringArray(row.creators || row.authors || volumeInfo.authors),
        description: normalizeDescription(row),
        formats: ["book"],
        genres: asStringArray(row.genres || volumeInfo.categories),
        themes: asStringArray(row.themes),
        tones: asStringArray(row.tones),
        characterDynamics: asStringArray(row.characterDynamics),
        maturityBand: String(row.maturityBand || row.maturity || "").trim() || undefined,
        publicationYear: Number.isFinite(Number(row.publicationYear || row.first_publish_year)) ? Number(row.publicationYear || row.first_publish_year) : undefined,
        sourceUrl: String(row.sourceUrl || row.url || "").trim() || undefined,
        raw: {
            ...row,
            volumeInfo,
        },
        diagnostics: {},
    });
    return audit.allowed && audit.identity === "middle_grade_novel" && audit.confidence >= 0.85;
}
function normalizedGoogleBooksAudienceBandForMaturity(row, sourceAudienceBand) {
    const policyOverride = String(row.googleBooksAudiencePolicyOverride || "").trim();
    if (policyOverride === "strict_preserve_source_audience")
        return sourceAudienceBand;
    const requestedDeck = ageBandValue(row.requestedAgeBand || row.ageBand);
    if (requestedDeck !== "preteens")
        return sourceAudienceBand;
    if (!googleBooksIsNotMature(row))
        return sourceAudienceBand;
    if (sourceAudienceBand === "kids") {
        // Pre-Teen policy: keep explicit K-2 / early-reader markers as kids, but
        // treat broad Juvenile Fiction labels as unknown so they can be evaluated.
        return googleBooksHasExplicitEarlyReaderMarkers(row) ? sourceAudienceBand : undefined;
    }
    if ((sourceAudienceBand === "teens" || sourceAudienceBand === "adult") && preteenGoogleBooksHighConfidenceMiddleGradeNovel(row)) {
        return undefined;
    }
    return sourceAudienceBand;
}
function normalizeMaturityBand(source, row) {
    const rawMaturityBand = String(row.maturityBand || row.maturity || "").trim();
    if (source !== "googleBooks")
        return rawMaturityBand || undefined;
    const sourceAudienceBand = ageBandValue(row.audienceBand);
    const sourceMaturityBand = ageBandValue(rawMaturityBand);
    const requestedDeck = ageBandValue(row.requestedAgeBand || row.ageBand);
    if (requestedDeck === "adult" && sourceAudienceBand === "adult") {
        return rawMaturityBand || undefined;
    }
    const effectiveAudienceBand = normalizedGoogleBooksAudienceBandForMaturity(row, sourceAudienceBand);
    return sourceMaturityBand || effectiveAudienceBand || undefined;
}
function normalizeDescription(row) {
    const rawDescription = typeof row.description === "string"
        ? row.description
        : typeof row.description?.value === "string"
            ? String(row.description.value)
            : typeof row.summary === "string"
                ? row.summary
                : "";
    const firstSentence = Array.isArray(row.first_sentence)
        ? row.first_sentence.map((item) => String(item || "").trim()).filter(Boolean).join(" ")
        : typeof row.first_sentence === "string"
            ? row.first_sentence
            : "";
    const text = (rawDescription || firstSentence).trim();
    return text || undefined;
}
function normalizeSourceResults(results) {
    const candidates = [];
    for (const result of results) {
        for (const raw of result.rawItems) {
            const row = (raw || {});
            const title = String(row.title || row.name || "").trim();
            if (!title)
                continue;
            const source = result.source;
            const id = String(row.id || row.sourceId || `${source}:${title}`).trim();
            const sourceMaturityRating = source === "googleBooks" ? googleBooksSourceMaturityRating(row) : "";
            candidates.push({
                id,
                source,
                sourceId: String(row.sourceId || row.id || "").trim() || undefined,
                title,
                subtitle: String(row.subtitle || "").trim() || undefined,
                creators: asStringArray(row.creators || row.authors || row.author_name),
                description: normalizeDescription(row),
                formats: asStringArray(row.formats).map(normalizeFormat),
                genres: asStringArray(row.genres),
                themes: Array.from(new Set([...asStringArray(row.themes), ...asStringArray(row.meaningfulTasteRecoveryDocumentSignals)])),
                tones: asStringArray(row.tones),
                characterDynamics: asStringArray(row.characterDynamics),
                maturityBand: normalizeMaturityBand(source, row),
                publicationYear: Number.isFinite(Number(row.publicationYear || row.first_publish_year)) ? Number(row.publicationYear || row.first_publish_year) : undefined,
                sourceUrl: String(row.sourceUrl || row.url || "").trim() || undefined,
                raw,
                diagnostics: {
                    sourceStatus: result.status,
                    queryText: row.queryText,
                    originalPlannedQuery: row.originalPlannedQuery,
                    simplifiedOpenLibraryQuery: row.simplifiedOpenLibraryQuery,
                    queryCascadeIndex: row.queryCascadeIndex,
                    queryFamily: row.queryFamily,
                    routingReason: row.routingReason,
                    facets: row.facets,
                    meaningfulTasteRecovery: row.meaningfulTasteRecovery,
                    meaningfulTasteRecoveryDocumentSignals: row.meaningfulTasteRecoveryDocumentSignals,
                    scoringHandoffStage: row.scoringHandoffStage,
                    postFinalEligibilityRecovery: row.postFinalEligibilityRecovery,
                    adultPostFinalEligibilityRecovery: row.adultPostFinalEligibilityRecovery,
                    adultPostFinalEligibilityRecoveryQuery: row.adultPostFinalEligibilityRecoveryQuery,
                    emergencyFallback: row.emergencyFallback,
                    googleBooksPublicationShape: row.googleBooksPublicationShape,
                    googleBooksNarrativeConfidence: row.googleBooksNarrativeConfidence,
                    googleBooksPublicationShapeEvidence: row.googleBooksPublicationShapeEvidence,
                    googleBooksNarrativePriorityAdjustment: row.googleBooksNarrativePriorityAdjustment,
                    googleBooksDominantPublicationShapeEvidence: row.googleBooksDominantPublicationShapeEvidence,
                    googleBooksOverriddenNarrativeEvidence: row.googleBooksOverriddenNarrativeEvidence,
                    googleBooksPublicationShapePrecedenceDecision: row.googleBooksPublicationShapePrecedenceDecision,
                    googleBooksExplicitNonNarrativeIdentity: row.googleBooksExplicitNonNarrativeIdentity,
                    googleBooksStoryLevelNarrativeEvidence: row.googleBooksStoryLevelNarrativeEvidence,
                    googleBooksGenericCategoryTitle: row.googleBooksGenericCategoryTitle,
                    googleBooksGenericCategoryEvidence: row.googleBooksGenericCategoryEvidence,
                    googleBooksUnknownShapeEligibility: row.googleBooksUnknownShapeEligibility,
                    googleBooksUnknownShapeEvidence: row.googleBooksUnknownShapeEvidence,
                    googleBooksUnknownShapeRejectedReason: row.googleBooksUnknownShapeRejectedReason,
                    googleBooksUnknownStoryEvidenceCount: row.googleBooksUnknownStoryEvidenceCount,
                    googleBooksUnknownStoryEvidenceFamilies: row.googleBooksUnknownStoryEvidenceFamilies,
                    googleBooksUnknownNarrativeCorroboration: row.googleBooksUnknownNarrativeCorroboration,
                    googleBooksUnknownEligibilityThresholdDecision: row.googleBooksUnknownEligibilityThresholdDecision,
                    googleBooksSubjectOfStudyTitle: row.googleBooksSubjectOfStudyTitle,
                    googleBooksSubjectOfStudyEvidence: row.googleBooksSubjectOfStudyEvidence,
                    googleBooksCuratedBookGuideIdentity: row.googleBooksCuratedBookGuideIdentity,
                    googleBooksCuratedBookGuideEvidence: row.googleBooksCuratedBookGuideEvidence,
                    googleBooksPeriodicalIdentityEvidence: row.googleBooksPeriodicalIdentityEvidence,
                    googleBooksPeriodicalIdentityDecision: row.googleBooksPeriodicalIdentityDecision,
                    preteenGoogleBooksPublicationShapeRescueApplied: row.preteenGoogleBooksPublicationShapeRescueApplied,
                    preteenGoogleBooksPublicationShapeRescueReason: row.preteenGoogleBooksPublicationShapeRescueReason,
                    preteenGoogleBooksPublicationShapeRescueEvidence: row.preteenGoogleBooksPublicationShapeRescueEvidence,
                    googleBooksAudienceBand: source === "googleBooks" ? (String(row.audienceBand || "").trim() || undefined) : undefined,
                    googleBooksRequestedDeck: source === "googleBooks" ? (String(row.requestedAgeBand || row.ageBand || "").trim() || undefined) : undefined,
                    googleBooksContentMaturity: source === "googleBooks" ? String(row.contentMaturity || googleBooksContentMaturityFromRating(sourceMaturityRating)) : undefined,
                    googleBooksSourceMaturityRating: source === "googleBooks" ? (sourceMaturityRating || undefined) : undefined,
                    authors: row.authors || row.author_name || row.creators,
                },
            });
        }
        result.diagnostics.normalizedCount = candidates.filter((candidate) => candidate.source === result.source).length;
    }
    return candidates;
}
