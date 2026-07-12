"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeSourceResults = normalizeSourceResults;
function asStringArray(value) {
    return Array.isArray(value) ? value.map((item) => String(item || "").trim()).filter(Boolean) : [];
}
function normalizeFormat(value) {
    const raw = String(value || "unknown").trim();
    return ["book", "manga", "comic", "graphicNovel", "anime", "unknown"].includes(raw) ? raw : "unknown";
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
                    emergencyFallback: row.emergencyFallback,
                    authors: row.authors || row.author_name || row.creators,
                },
            });
        }
        result.diagnostics.normalizedCount = candidates.filter((candidate) => candidate.source === result.source).length;
    }
    return candidates;
}
