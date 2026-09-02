import { loadLocalCollectionRecommendationArtifact, type LocalCollectionRecommendationRecord } from "../../../lib/localCollection/storage";
import { adaptLocalCollectionSourceRecord } from "../../../lib/localCollection/presentation";
import type { AgeBandV2, SourceAdapterV2, SourceDiagnosticV2, SourceFetchDiagnosticV2, SourcePlan, SourceResult, TasteProfile } from "../types";
import { getRuntimeLibraryId } from "../../../constants/runtimeConfig";

const MAX_LOCAL_LIBRARY_CANDIDATES = 200;

function nowIso(): string {
  return new Date().toISOString();
}

function tokenize(value: string): string[] {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3);
}

function inferAudienceBand(record: LocalCollectionRecommendationRecord): AgeBandV2 | undefined {
  const audience = String(record.audience || "").toLowerCase();
  const readingLevel = String(record.readingLevel || "").toLowerCase();
  const shelf = String(record.shelvingLocation || "").toLowerCase();
  const haystack = `${audience} ${readingLevel} ${shelf}`;
  if (/\b(adult|college|new adult)\b/.test(haystack)) return "adult";
  if (/\b(teen|ya|young adult|high school|grades?\s*(9|10|11|12))\b/.test(haystack)) return "teens";
  if (/\b(preteen|middle grade|middle school|grades?\s*(3|4|5|6|7|8))\b/.test(haystack)) return "preteens";
  if (/\b(kids?|juvenile|children|childrens?|k-2|k2|kindergarten|preschool|elementary)\b/.test(haystack)) return "kids";
  return undefined;
}

function recordCatalogHaystack(record: LocalCollectionRecommendationRecord): string {
  return [
    record.audience,
    record.readingLevel,
    record.shelvingLocation,
    record.localPlacement,
    record.callNumber,
  ].join(" ").toLowerCase();
}

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededHash(value: string): number {
  let hash = 1779033703 ^ value.length;
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(hash ^ value.charCodeAt(index), 3432918353);
    hash = (hash << 13) | (hash >>> 19);
  }
  hash = Math.imul(hash ^ (hash >>> 16), 2246822507);
  hash = Math.imul(hash ^ (hash >>> 13), 3266489909);
  return (hash ^ (hash >>> 16)) >>> 0;
}

function stableRecordOrder(record: LocalCollectionRecommendationRecord, diversitySeed = ""): number {
  const recordKey = `${record.localId}\u0000${record.title}`;
  return diversitySeed ? seededHash(`${diversitySeed}\u0000${recordKey}`) : stableHash(recordKey);
}

// Score only librarian/catalog metadata. A title word is not reliable evidence that a book
// has the corresponding genre, tone, or theme, and sparse collections otherwise over-rank
// clusters such as every title containing "Dark".
function scoreByTasteProfile(haystack: string, profile: TasteProfile): number {
  let score = 0;

  for (const signal of profile.genreFamily) {
    if (signal.weight <= 0) continue;
    const terms = tokenize(signal.value);
    if (!terms.length) continue;
    const matched = terms.filter((term) => haystack.includes(term));
    if (!matched.length) continue;
    score += signal.weight * (matched.length / terms.length);
  }

  for (const signal of profile.tone) {
    if (signal.weight <= 0) continue;
    const terms = tokenize(signal.value);
    if (!terms.length) continue;
    const matched = terms.filter((term) => haystack.includes(term));
    if (!matched.length) continue;
    score += signal.weight * 0.5 * (matched.length / terms.length);
  }

  for (const signal of profile.themes) {
    if (signal.weight <= 0) continue;
    const terms = tokenize(signal.value);
    if (!terms.length) continue;
    const matched = terms.filter((term) => haystack.includes(term));
    if (!matched.length) continue;
    score += signal.weight * 0.5 * (matched.length / terms.length);
  }

  for (const signal of profile.avoidSignals) {
    const terms = tokenize(signal.value);
    if (!terms.length) continue;
    const matched = terms.filter((term) => haystack.includes(term));
    if (!matched.length) continue;
    score -= Math.abs(signal.weight) * (matched.length / terms.length);
  }

  return score;
}

function rankByProfile(
  records: LocalCollectionRecommendationRecord[],
  plan: SourcePlan,
  profile: TasteProfile,
): Array<{
  record: LocalCollectionRecommendationRecord;
  score: number;
  queryText: string;
  facets: string[];
}> {
  const intentTerms = plan.intents.map((intent) => ({
    query: intent.query,
    facets: intent.facets,
    priority: Number(intent.priority || 0),
    terms: Array.from(new Set(tokenize(intent.query))),
  }));

  const fallbackQuery = plan.intents[0]?.query || "local collection";
  const fallbackFacets = plan.intents[0]?.facets || [];

  return records.map((record) => {
    const haystack = recordCatalogHaystack(record);

    // Intent-query text matching (exact token presence in metadata fields).
    let intentScore = 0;
    let bestQuery = "";
    let bestFacets: string[] = [];

    for (const intent of intentTerms) {
      if (!intent.terms.length) continue;
      const matched = intent.terms.filter((term) => haystack.includes(term));
      if (!matched.length) continue;
      const weighted = matched.length * Math.max(0.1, intent.priority);
      if (weighted > intentScore) {
        intentScore = weighted;
        bestQuery = intent.query;
        bestFacets = intent.facets;
      }
    }

    // Taste-profile scoring: uses the actual swipe-derived genreFamily / tone / themes /
    // avoidSignals signals directly against record metadata. This ensures two different swipe
    // sessions produce different candidate orderings even when the library uses broad
    // (non-genre-subdivided) shelving and intent-query tokens never appear verbatim.
    const profileScore = scoreByTasteProfile(haystack, profile);

    // Combined score: intent matches win when they fire; profile score provides meaningful
    // differentiation when intent tokens are absent from sparse metadata.
    const combinedScore = intentScore + profileScore * 0.4;

    return {
      record,
      score: combinedScore,
      queryText: intentScore > 0 ? bestQuery : (profileScore > 0 ? fallbackQuery : ""),
      facets: intentScore > 0 ? bestFacets : (profileScore > 0 ? fallbackFacets : []),
    };
  });
}

function diagnosticResult(
  plan: SourcePlan,
  status: SourceResult["status"],
  rawItems: SourceResult["rawItems"],
  fetches: SourceFetchDiagnosticV2[],
  details: Partial<SourceDiagnosticV2> = {},
): SourceResult {
  const finishedAt = nowIso();
  const diagnostics: SourceDiagnosticV2 = {
    source: "localLibrary",
    status,
    planned: true,
    attempted: true,
    timedOut: false,
    startedAt: details.startedAt || finishedAt,
    finishedAt,
    elapsedMs: Number(details.elapsedMs || 0),
    rawCount: rawItems.length,
    convertedCount: rawItems.length,
    queryAttemptCount: plan.intents.length,
    queryAttemptedCount: plan.intents.length,
    validEmptyResponseCount: status === "empty" ? 1 : 0,
    sourceStageEmptyReason: details.sourceStageEmptyReason,
    emptyReason: details.emptyReason,
    fetches,
    queries: plan.intents.map((intent) => intent.query),
  };

  return {
    source: "localLibrary",
    status,
    rawItems,
    diagnostics: {
      ...diagnostics,
      ...details,
      fetches,
      queries: plan.intents.map((intent) => intent.query),
    },
  };
}

export const localLibrarySourceAdapter: SourceAdapterV2 = {
  source: "localLibrary",
  async search(plan: SourcePlan, context: { profile: TasteProfile; signal?: AbortSignal; diversitySeed?: string }): Promise<SourceResult> {
    const startedAt = nowIso();
    const libraryId = getRuntimeLibraryId();
    if (context.signal?.aborted) {
      return diagnosticResult(
        plan,
        "failed",
        [],
        [{ query: "", timedOut: false, status: "aborted", aborted: true, failedReason: "source_aborted_before_local_collection_load" }],
        { startedAt, emptyReason: "source_aborted_before_local_collection_load", sourceStageEmptyReason: "source_aborted_before_local_collection_load" }
      );
    }

    const artifact = await loadLocalCollectionRecommendationArtifact(libraryId);
    const records = Array.isArray(artifact?.records) ? artifact.records : [];
    if (!records.length) {
      return diagnosticResult(
        plan,
        "empty",
        [],
        [{ query: "", timedOut: false, status: "empty", emptyResultReason: "local_collection_not_imported" }],
        {
          startedAt,
          emptyReason: "local_collection_not_imported",
          sourceStageEmptyReason: "local_collection_not_imported",
          localCollectionLibraryId: libraryId,
          localCollectionCurationTrusted: Boolean(context.profile.localLibraryCurationTrusted),
          localCollectionRecordCount: 0,
          localCollectionRankedCount: 0,
          localCollectionPositiveScoreCount: 0,
        } as Partial<SourceDiagnosticV2>
      );
    }

    const ranked = rankByProfile(records, plan, context.profile)
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        const stableDifference = stableRecordOrder(a.record, context.diversitySeed) - stableRecordOrder(b.record, context.diversitySeed);
        return stableDifference || a.record.title.localeCompare(b.record.title);
      });

    // Include all positively-scored rows first; fall back to the full ranked list only if
    // nothing scored at all (empty collection metadata). Never silently return an
    // alphabetically-fixed pool — the profile score should always provide some signal.
    const withPositiveScore = ranked.filter((row) => row.score > 0);
    const selectedRows = (withPositiveScore.length ? withPositiveScore : ranked).slice(0, MAX_LOCAL_LIBRARY_CANDIDATES);
    const fallbackQuery = plan.intents[0]?.query || "local collection";
    const fallbackFacets = plan.intents[0]?.facets || [];

    const rawItems = selectedRows.map((row) => {
      const record = row.record;
      // When the library is configured for exactly one age band, the librarian curated the
      // entire collection for that audience. Do not infer a different maturityBand from MARC
      // shelving labels — treat every valid record as eligible for the session's age band.
      const audienceBand = context.profile.localLibraryCurationTrusted
        ? undefined
        : inferAudienceBand(record);
      return adaptLocalCollectionSourceRecord(record, {
        audienceBand,
        queryText: row.queryText || fallbackQuery,
        tieBreakOrder: context.diversitySeed
          ? stableRecordOrder(record, context.diversitySeed)
          : undefined,
        facets: row.facets.length ? row.facets : fallbackFacets,
      });
    });

    const fetches: SourceFetchDiagnosticV2[] = [{
      query: fallbackQuery,
      timedOut: false,
      status: rawItems.length ? "succeeded" : "empty",
      docsReturned: records.length,
      rawRetrieved: records.length,
      rawApiCount: records.length,
      convertedCount: rawItems.length,
      queryFamily: "local_collection_text_match",
      facets: fallbackFacets,
      emptyResultReason: rawItems.length ? undefined : "local_collection_no_matching_titles",
      firstReturnedTitles: rawItems.slice(0, 12).map((item) => String(item.title || "")).filter(Boolean),
    }];

    return diagnosticResult(
      plan,
      rawItems.length ? "succeeded" : "empty",
      rawItems,
      fetches,
      {
        startedAt,
        emptyReason: rawItems.length ? undefined : "local_collection_no_matching_titles",
        sourceStageEmptyReason: rawItems.length ? undefined : "local_collection_no_matching_titles",
        localCollectionLibraryId: libraryId,
        localCollectionCurationTrusted: Boolean(context.profile.localLibraryCurationTrusted),
        localCollectionRecordCount: records.length,
        localCollectionRankedCount: ranked.length,
        localCollectionPositiveScoreCount: withPositiveScore.length,
        localCollectionRecordHash: artifact?.deterministicContentHash || "",
        localCollectionDiversitySeedApplied: Boolean(context.diversitySeed),
        localCollectionTieBreakerVersion: context.diversitySeed ? "patron_seed_v1" : "catalog_stable_v1",
      } as Partial<SourceDiagnosticV2>,
    );
  },
};
