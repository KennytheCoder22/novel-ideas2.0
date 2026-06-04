import type { CandidateFormatV2, NormalizedCandidate, SourceIdV2, SourceResult } from "./types";

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item || "").trim()).filter(Boolean) : [];
}

function normalizeFormat(value: unknown): CandidateFormatV2 {
  const raw = String(value || "unknown").trim() as CandidateFormatV2;
  return ["book", "manga", "comic", "graphicNovel", "anime", "unknown"].includes(raw) ? raw : "unknown";
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
        description: String(row.description || row.summary || "").trim() || undefined,
        formats: asStringArray(row.formats).map(normalizeFormat),
        genres: asStringArray(row.genres),
        themes: asStringArray(row.themes),
        tones: asStringArray(row.tones),
        characterDynamics: asStringArray(row.characterDynamics),
        maturityBand: String(row.maturityBand || row.maturity || "").trim() || undefined,
        publicationYear: Number.isFinite(Number(row.publicationYear || row.first_publish_year)) ? Number(row.publicationYear || row.first_publish_year) : undefined,
        sourceUrl: String(row.sourceUrl || row.url || "").trim() || undefined,
        raw,
        diagnostics: { sourceStatus: result.status, queryText: row.queryText },
      });
    }
    result.diagnostics.normalizedCount = candidates.filter((candidate) => candidate.source === result.source).length;
  }
  return candidates;
}
