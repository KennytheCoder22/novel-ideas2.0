function asNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function asObject(value) {
  return value && typeof value === "object" ? value : {};
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function titleKey(value) {
  return String(value || "").trim().toLowerCase();
}

function extractPrimaryPublicationDropHistogram(primaryQuery, rejectedByQuery) {
  const row = asObject(asObject(rejectedByQuery)[primaryQuery]);
  const out = {};
  for (const [reason, count] of Object.entries(row)) {
    if (!String(reason).startsWith("gb_publication_shape_")) continue;
    out[String(reason)] = asNumber(count);
  }
  return out;
}

function buildSelectedQuality(items) {
  const scores = asArray(items)
    .map((item) => asNumber(asObject(item).score))
    .filter((value) => Number.isFinite(value));
  if (!scores.length) return { averageScore: 0, minScore: 0, maxScore: 0 };
  const sum = scores.reduce((running, value) => running + value, 0);
  return {
    averageScore: Number((sum / scores.length).toFixed(3)),
    minScore: Number(Math.min(...scores).toFixed(3)),
    maxScore: Number(Math.max(...scores).toFixed(3)),
  };
}

export function extractProductionMetrics({ variant, profileId, profileLabel, result, limit }) {
  const diagnostics = asObject(asObject(result).diagnostics);
  const sources = asArray(diagnostics.sources);
  const googleBooks = asObject(sources.find((source) => asObject(source).source === "googleBooks"));
  const fetches = asArray(googleBooks.fetches);
  const successfulFetches = fetches.filter((fetch) => String(asObject(fetch).status || "") === "succeeded");
  const primaryFetch = asObject(fetches.find((fetch) => asNumber(asObject(fetch).queryCascadeIndex) === 0) || fetches[0] || {});
  const primaryQuery = String(primaryFetch.query || "");
  const fallbackUsed = successfulFetches.some((fetch) => asNumber(asObject(fetch).queryCascadeIndex) > 0 && asNumber(asObject(fetch).acceptedAfterSourcePolicy) > 0);
  const queryQualityByQuery = asObject(googleBooks.googleBooksQueryResultQualityByQuery);
  const primaryQuality = asObject(queryQualityByQuery[primaryQuery]);
  const queryByTitle = asObject(googleBooks.googleBooksQueryByTitle);
  const selectedItems = asArray(asObject(result).items);
  const selectedFromPrimaryCount = selectedItems.filter((item) => {
    const title = String(asObject(item).title || "");
    return String(queryByTitle[title] || queryByTitle[titleKey(title)] || "") === primaryQuery;
  }).length;
  const stageScored = asArray(diagnostics.stages).find((stage) => asObject(stage).stage === "scored");
  const totalScored = asNumber(asObject(asObject(stageScored).counts).scored);
  return {
    variant,
    profileId,
    profileLabel,
    primaryQuery,
    rawApiCount: asNumber(primaryFetch.rawApiCount),
    acceptedAfterSourcePolicy: asNumber(primaryFetch.acceptedAfterSourcePolicy),
    publicationShapeDropHistogram: extractPrimaryPublicationDropHistogram(primaryQuery, googleBooks.googleBooksRejectedCountByQueryAndReason),
    scoredCandidates: asNumber(primaryQuality.enteredRankingCount),
    totalScoredCandidates: totalScored,
    selectedRecommendations: selectedItems.length,
    selectedFromPrimaryQuery: selectedFromPrimaryCount,
    fallbackUsed,
    underfillOrStarvation: selectedItems.length < asNumber(limit || 0),
    finalRecommendationQuality: buildSelectedQuality(selectedItems),
  };
}

export function compareVariantRows(baselineRow, candidateRow) {
  const acceptedDelta = candidateRow.acceptedAfterSourcePolicy - baselineRow.acceptedAfterSourcePolicy;
  const scoredDelta = candidateRow.scoredCandidates - baselineRow.scoredCandidates;
  const selectedDelta = candidateRow.selectedRecommendations - baselineRow.selectedRecommendations;
  const qualityDelta = Number((candidateRow.finalRecommendationQuality.averageScore - baselineRow.finalRecommendationQuality.averageScore).toFixed(3));
  return {
    profileId: baselineRow.profileId,
    profileLabel: baselineRow.profileLabel,
    baselinePrimaryQuery: baselineRow.primaryQuery,
    candidatePrimaryQuery: candidateRow.primaryQuery,
    acceptedAfterSourcePolicyBaseline: baselineRow.acceptedAfterSourcePolicy,
    acceptedAfterSourcePolicyCandidate: candidateRow.acceptedAfterSourcePolicy,
    acceptedAfterSourcePolicyDelta: acceptedDelta,
    scoredCandidatesBaseline: baselineRow.scoredCandidates,
    scoredCandidatesCandidate: candidateRow.scoredCandidates,
    scoredCandidatesDelta: scoredDelta,
    selectedBaseline: baselineRow.selectedRecommendations,
    selectedCandidate: candidateRow.selectedRecommendations,
    selectedDelta,
    fallbackUsedBaseline: baselineRow.fallbackUsed,
    fallbackUsedCandidate: candidateRow.fallbackUsed,
    fallbackImproved: baselineRow.fallbackUsed && !candidateRow.fallbackUsed,
    qualityAverageBaseline: baselineRow.finalRecommendationQuality.averageScore,
    qualityAverageCandidate: candidateRow.finalRecommendationQuality.averageScore,
    qualityAverageDelta: qualityDelta,
    underfillBaseline: baselineRow.underfillOrStarvation,
    underfillCandidate: candidateRow.underfillOrStarvation,
    meetsPromotionSignals:
      acceptedDelta > 0
      && (!candidateRow.fallbackUsed || baselineRow.fallbackUsed)
      && qualityDelta >= 0,
  };
}

