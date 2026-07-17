import type { CandidateFormatV2, NormalizedCandidate, SourceIdV2, SourceResult } from "./types";

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item || "").trim()).filter(Boolean) : [];
}

function normalizeFormat(value: unknown): CandidateFormatV2 {
  const raw = String(value || "unknown").trim() as CandidateFormatV2;
  return ["book", "manga", "comic", "graphicNovel", "anime", "unknown"].includes(raw) ? raw : "unknown";
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
        maturityBand: String(row.maturityBand || row.maturity || "").trim() || undefined,
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
          authors: row.authors || row.author_name || row.creators,
        },
      });
    }
    result.diagnostics.normalizedCount = candidates.filter((candidate) => candidate.source === result.source).length;
  }
  return candidates;
}
