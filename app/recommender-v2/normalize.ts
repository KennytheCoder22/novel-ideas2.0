import type { AgeBandV2, CandidateFormatV2, NormalizedCandidate, SourceIdV2, SourceResult } from "./types";

const AGE_BAND_VALUES = new Set<AgeBandV2>(["kids", "preteens", "teens", "adult"]);
const GOOGLE_BOOKS_MATURITY_RATINGS = new Set(["MATURE", "NOT_MATURE"]);

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item || "").trim()).filter(Boolean) : [];
}

function normalizeFormat(value: unknown): CandidateFormatV2 {
  const raw = String(value || "unknown").trim() as CandidateFormatV2;
  return ["book", "manga", "comic", "graphicNovel", "anime", "unknown"].includes(raw) ? raw : "unknown";
}

function ageBandValue(value: unknown): AgeBandV2 | undefined {
  const raw = String(value || "").trim();
  return AGE_BAND_VALUES.has(raw as AgeBandV2) ? raw as AgeBandV2 : undefined;
}

function googleBooksSourceMaturityRating(row: Record<string, unknown>): string {
  const explicit = String(row.sourceMaturityRating || row.maturityRating || "").trim();
  if (explicit) return explicit;
  const maturityBand = String(row.maturityBand || row.maturity || "").trim();
  return GOOGLE_BOOKS_MATURITY_RATINGS.has(maturityBand.toUpperCase()) ? maturityBand : "";
}

function googleBooksContentMaturityFromRating(value: unknown): "mature" | "not_mature" | "unknown" {
  const raw = String(value || "").trim().toUpperCase();
  if (raw === "MATURE" || raw === "EXPLICIT_MATURE") return "mature";
  if (raw === "NOT_MATURE") return "not_mature";
  return "unknown";
}

function normalizeMaturityBand(source: SourceIdV2, row: Record<string, unknown>): string | undefined {
  const rawMaturityBand = String(row.maturityBand || row.maturity || "").trim();
  if (source !== "googleBooks") return rawMaturityBand || undefined;

  const sourceAudienceBand = ageBandValue(row.audienceBand) || ageBandValue(row.ageBand);
  const sourceMaturityBand = ageBandValue(rawMaturityBand);
  if (sourceAudienceBand === "adult") {
    return rawMaturityBand || undefined;
  }
  return sourceMaturityBand || sourceAudienceBand || undefined;
}

function normalizeDescription(row: Record<string, unknown>): string | undefined {
  const rawDescription = typeof row.description === "string"
    ? row.description
    : typeof (row.description as { value?: unknown } | undefined)?.value === "string"
      ? String((row.description as { value: string }).value)
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

export function normalizeSourceResults(results: SourceResult[]): NormalizedCandidate[] {
  const candidates: NormalizedCandidate[] = [];
  for (const result of results) {
    for (const raw of result.rawItems) {
      const row = (raw || {}) as Record<string, unknown>;
      const title = String(row.title || row.name || "").trim();
      if (!title) continue;
      const source = result.source as SourceIdV2;
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
          googleBooksAudienceBand: source === "googleBooks" ? (String(row.audienceBand || row.ageBand || "").trim() || undefined) : undefined,
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
