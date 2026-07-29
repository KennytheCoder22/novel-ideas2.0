// ─── Shared utilities ────────────────────────────────────────────────────────

function mapObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function arrayValue(value) {
  return Array.isArray(value) ? value : [];
}

function toNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

// ─── Session-report text parsing (backward-compatible) ────────────────────────

function parseJsonLine(lines, prefix, fallback) {
  const marker = `${prefix}:`;
  const line = lines.find((entry) => entry.startsWith(marker));
  if (!line) return fallback;
  const raw = line.slice(marker.length).trim();
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function parseScalarLine(lines, prefix) {
  const marker = `${prefix}:`;
  const line = lines.find((entry) => entry.startsWith(marker));
  return line ? line.slice(marker.length).trim() : "";
}

// ─── Shared classification helpers ───────────────────────────────────────────

// Primary queries that produce fewer than this many accepted candidates are
// treated as recall-shallow even when they are the proximate cause.
const HEALTHY_PRIMARY_DEPTH = 4;

function publicationRejectShare(primaryQuality) {
  const rejectedTotal = toNumber(primaryQuality.rejectedCandidateCount);
  if (!rejectedTotal) return 0;
  const reasons = mapObject(primaryQuality.rejectionReasons);
  const publicationRejects = Object.entries(reasons)
    .filter(([key]) => String(key).startsWith("publication_shape_"))
    .reduce((sum, [, count]) => sum + toNumber(count), 0);
  return publicationRejects / rejectedTotal;
}

function countDiversityExclusions(exclusionReasonByTitle) {
  const reasons = Object.values(mapObject(exclusionReasonByTitle)).map((value) => String(value || ""));
  return reasons.filter((reason) => /same_author|same_series|duplicate|root|deferred/i.test(reason)).length;
}

function weakPrimaryShare(primaryQuality, classificationByTitle) {
  const acceptedTitles = arrayValue(primaryQuality.acceptedRecommendationTitles).map((value) => String(value || ""));
  if (acceptedTitles.length === 0) return 0;
  const weakCount = acceptedTitles.filter((title) => String(classificationByTitle[title] || "") === "query_supported_but_weak").length;
  return weakCount / acceptedTitles.length;
}

// ─── Primary bucket classifier ───────────────────────────────────────────────

function classifyBucket(metrics) {
  if (metrics.secondarySelected === 0) return "A_primary_query_succeeded";

  if (metrics.primaryAccepted >= metrics.finalSelectedCount) {
    if (metrics.diversityExclusionCount > 0) return "E_diversity_filtering";
    if (metrics.primaryWeakShare >= 0.6) return "D_taste_filtering";
    return "F_ranking_selection";
  }

  if (metrics.secondaryAccepted > metrics.primaryAccepted || metrics.secondarySelected > metrics.primarySelected) {
    return "G_query_mismatch";
  }
  if (metrics.primaryPublicationRejectShare >= 0.5) return "C_publication_filtering";
  return "B_insufficient_recall";
}

// ─── Secondary contributor (proximate vs underlying cause) ───────────────────

// Records a contributing factor that is distinct from the proximate bucket.
// Prevents "diversity" from concealing weak primary recall (user concern noted
// for Test A).
function classifySecondaryContributor(bucket, metrics) {
  if (bucket === "A_primary_query_succeeded") return null;
  // Diversity is the proximate cause, but shallow recall is the underlying one.
  if (bucket === "E_diversity_filtering" && metrics.primaryAccepted < HEALTHY_PRIMARY_DEPTH) {
    return "B_insufficient_recall_underlying";
  }
  // Query mismatch is proximate, but publication filtering also contributed.
  if (bucket === "G_query_mismatch" && metrics.primaryPublicationRejectShare >= 0.3) {
    return "C_publication_filtering_contributing";
  }
  return null;
}

// ─── Fallback state classifier ───────────────────────────────────────────────

export function classifyFallbackState(metrics) {
  if (metrics.secondaryAccepted === 0) return "fallback_not_activated";
  if (metrics.secondarySelected === 0) return "fallback_activated_not_selected";
  // Secondary contributed to the final slate.
  if (metrics.primarySelected < metrics.finalSelectedCount) {
    // Without fallback the slate would have been shorter.
    return "fallback_required_for_minimum_slate";
  }
  return "fallback_selected";
}

// ─── Confidence classifier ───────────────────────────────────────────────────

export function classifyConfidence(bucket, metrics, hasRequiredFields) {
  if (!hasRequiredFields) return "low";
  // Total stall — impossible to classify meaningfully.
  if (metrics.primaryAccepted === 0 && metrics.secondaryAccepted === 0) return "low";
  if (metrics.finalSelectedCount === 0) return "low";

  // Borderline thresholds that make the bucket assignment less certain.
  const pubShare = metrics.primaryPublicationRejectShare;
  const pubBorderline = pubShare > 0.35 && pubShare < 0.65;
  const weakBorderline = metrics.primaryWeakShare >= 0.4 && metrics.primaryWeakShare < 0.8;
  // A single diversity exclusion with low primary depth is genuinely ambiguous
  // (bucket E vs B).
  const diversityAmbiguous =
    bucket === "E_diversity_filtering" &&
    metrics.diversityExclusionCount === 1 &&
    metrics.primaryAccepted < HEALTHY_PRIMARY_DEPTH;

  if (pubBorderline || weakBorderline || diversityAmbiguous) return "medium";
  return "high";
}

// ─── Shared metrics builder ───────────────────────────────────────────────────

function buildRunRecord(base, primaryFetch, secondaryFetches, primaryQuality, queryQualityByQuery, finalSelectionExclusions, classificationByTitle, finalSelectedTitles) {
  const primaryQuery = String(primaryFetch.originalPlannedQuery || primaryFetch.query || "").trim();
  const secondaryQueries = secondaryFetches
    .map((row) => String(row.originalPlannedQuery || row.query || "").trim())
    .filter(Boolean);
  const secondarySelected = secondaryQueries.reduce(
    (sum, query) => sum + toNumber(mapObject(queryQualityByQuery[query]).acceptedRecommendationCount),
    0,
  );
  const secondaryAccepted = secondaryFetches.reduce((sum, row) => sum + toNumber(row.acceptedAfterSourcePolicy), 0);
  const primarySelected = toNumber(primaryQuality.acceptedRecommendationCount);

  const metrics = {
    ...base,
    primaryQuery,
    queryFamily: String(primaryFetch.queryFamily || "").trim() || null,
    primaryAccepted: toNumber(primaryFetch.acceptedAfterSourcePolicy ?? primaryQuality.acceptedCandidateCount),
    primarySelected,
    secondaryAccepted,
    secondarySelected,
    finalSelectedCount: finalSelectedTitles.length,
    primaryPublicationRejectShare: publicationRejectShare(primaryQuality),
    primaryWeakShare: weakPrimaryShare(primaryQuality, classificationByTitle),
    diversityExclusionCount: countDiversityExclusions(finalSelectionExclusions),
    primaryRawApiCount: toNumber(primaryFetch.rawApiCount),
    primaryNarrativeCandidates: toNumber(primaryQuality.narrativeCandidateCount),
    secondaryQueryCount: secondaryQueries.length,
  };

  const hasRequiredFields =
    Object.keys(queryQualityByQuery).length > 0 &&
    finalSelectedTitles.length > 0;

  const bucket = classifyBucket(metrics);
  const secondaryContributor = classifySecondaryContributor(bucket, metrics);
  const fallbackState = classifyFallbackState(metrics);
  const confidence = classifyConfidence(bucket, metrics, hasRequiredFields);

  return { ...metrics, bucket, secondaryContributor, fallbackState, confidence };
}

// ─── Aggregate helpers ────────────────────────────────────────────────────────

const EMPTY_BUCKETS = () => ({
  A_primary_query_succeeded: 0,
  B_insufficient_recall: 0,
  C_publication_filtering: 0,
  D_taste_filtering: 0,
  E_diversity_filtering: 0,
  F_ranking_selection: 0,
  G_query_mismatch: 0,
});

function summarizeBucketCounts(rows) {
  const buckets = EMPTY_BUCKETS();
  for (const row of rows) {
    if (Object.prototype.hasOwnProperty.call(buckets, row.bucket)) {
      buckets[row.bucket] += 1;
    }
  }
  return buckets;
}

function summarizeFallbackStateCounts(rows) {
  const counts = {
    fallback_not_activated: 0,
    fallback_activated_not_selected: 0,
    fallback_selected: 0,
    fallback_required_for_minimum_slate: 0,
  };
  for (const row of rows) {
    if (Object.prototype.hasOwnProperty.call(counts, row.fallbackState)) {
      counts[row.fallbackState] += 1;
    }
  }
  return counts;
}

function buildQueryFamilyBreakdown(rows) {
  const byFamily = {};
  for (const row of rows) {
    const family = String(row.queryFamily || "unknown");
    if (!byFamily[family]) byFamily[family] = { count: 0, bucketCounts: EMPTY_BUCKETS() };
    byFamily[family].count += 1;
    if (Object.prototype.hasOwnProperty.call(byFamily[family].bucketCounts, row.bucket)) {
      byFamily[family].bucketCounts[row.bucket] += 1;
    }
  }
  return byFamily;
}

function assessDominance(highConfidenceBucketCounts, totalHighConfidence) {
  const entries = Object.entries(highConfidenceBucketCounts).sort(([, a], [, b]) => b - a);
  if (entries.length < 2) {
    return { isDominant: false, reason: "insufficient_bucket_diversity" };
  }
  const [[leadBucket, leadCount], [runnerUpBucket, runnerUpCount]] = entries;
  const pctLead = totalHighConfidence > 0 ? leadCount / totalHighConfidence : 0;
  const pctRunnerUp = totalHighConfidence > 0 ? runnerUpCount / totalHighConfidence : 0;
  const pctDelta = pctLead - pctRunnerUp;
  const countDelta = leadCount - runnerUpCount;
  const isDominant = leadCount >= 10 && (countDelta >= 5 || pctDelta >= 0.15);
  return {
    leadBucket,
    leadCount,
    runnerUpBucket,
    runnerUpCount,
    countDelta,
    pctDelta: Number(pctDelta.toFixed(3)),
    isDominant,
    dominanceNote: isDominant
      ? `${leadBucket} clears the engineering dominance threshold`
      : leadCount < 10
        ? `${leadBucket} has only ${leadCount} high-confidence examples (need ≥10)`
        : `${leadBucket} leads by ${countDelta} runs / ${(pctDelta * 100).toFixed(1)} ppts — below 5-run / 15-ppt threshold`,
  };
}

// ─── Session-report text path (backward-compatible) ──────────────────────────

export function parseTeenGoogleBooksRunsFromReportText(reportText, reportName = "report") {
  const blocks = String(reportText || "")
    .split(/\r?\n(?=SESSION REPORT)/)
    .map((entry) => entry.trim())
    .filter(Boolean);
  const runs = [];
  for (const block of blocks) {
    const lines = block.split(/\r?\n/);
    const deck = parseScalarLine(lines, "Deck");
    if (!/teens/i.test(deck)) continue;
    const fetchDiagnostics = arrayValue(parseJsonLine(lines, "googleBooksSourceFetchDiagnostics", []));
    if (fetchDiagnostics.length === 0) continue;
    const sortedFetch = [...fetchDiagnostics].sort(
      (a, b) => toNumber(a?.queryCascadeIndex ?? a?.attemptNumber) - toNumber(b?.queryCascadeIndex ?? b?.attemptNumber),
    );
    const queryQualityByQuery = mapObject(parseJsonLine(lines, "googleBooksQueryResultQualityByQuery", {}));
    const finalSelectionExclusions = mapObject(parseJsonLine(lines, "googleBooksFinalSelectionExclusionReasonByTitle", {}));
    const classificationByTitle = mapObject(parseJsonLine(lines, "teenGoogleBooksMeaningfulTasteClassificationByTitle", {}));
    const finalSelectedTitles = arrayValue(parseJsonLine(lines, "finalSelectedTitles", []));

    const primaryFetch = sortedFetch[0] || {};
    const secondaryFetches = sortedFetch.slice(1);
    const primaryQuery = String(primaryFetch.originalPlannedQuery || primaryFetch.query || "").trim();
    const primaryQuality = mapObject(queryQualityByQuery[primaryQuery]);

    runs.push(buildRunRecord(
      { report: reportName, presetTestName: parseScalarLine(lines, "presetTestName"), deck },
      primaryFetch,
      secondaryFetches,
      primaryQuality,
      queryQualityByQuery,
      finalSelectionExclusions,
      classificationByTitle,
      finalSelectedTitles,
    ));
  }
  return runs;
}

// ─── Live-result path (for expanded production audit) ────────────────────────

export function extractMetricsFromLiveResult(result, profileId, profileLabel) {
  const sources = arrayValue(result?.diagnostics?.sources);
  const gbSource = mapObject(sources.find((s) => String(mapObject(s).source) === "googleBooks"));
  const fetchDiagnostics = arrayValue(gbSource.googleBooksSourceFetchDiagnostics);
  if (fetchDiagnostics.length === 0) return null;

  const sortedFetch = [...fetchDiagnostics].sort(
    (a, b) => toNumber(mapObject(a).queryCascadeIndex) - toNumber(mapObject(b).queryCascadeIndex),
  );
  const primaryFetch = mapObject(sortedFetch[0]);
  const secondaryFetches = sortedFetch.slice(1).map(mapObject);

  const queryQualityByQuery = mapObject(gbSource.googleBooksQueryResultQualityByQuery);
  const selectionDiagnostics = mapObject(result?.diagnostics?.rejectedReasons);
  const finalSelectionExclusions = mapObject(selectionDiagnostics.googleBooksFinalSelectionExclusionReasonByTitle);
  const classificationByTitle = mapObject(selectionDiagnostics.teenGoogleBooksMeaningfulTasteClassificationByTitle);
  const finalSelectedTitles = arrayValue(result?.items).map((item) => String(mapObject(item).title || "")).filter(Boolean);

  const primaryQuery = String(primaryFetch.originalPlannedQuery || primaryFetch.query || "").trim();
  const primaryQuality = mapObject(queryQualityByQuery[primaryQuery]);

  return buildRunRecord(
    { profileId, profileLabel, source: "live_result" },
    primaryFetch,
    secondaryFetches,
    primaryQuality,
    queryQualityByQuery,
    finalSelectionExclusions,
    classificationByTitle,
    finalSelectedTitles,
  );
}

// ─── Breakdown report builder ─────────────────────────────────────────────────

export function buildTeenGoogleBooksFallbackRootCauseBreakdown(runs) {
  const rows = arrayValue(runs);

  const highConfidenceRows = rows.filter((r) => r.confidence === "high");
  const fallbackSelectedRows = rows.filter(
    (r) => r.fallbackState === "fallback_selected" || r.fallbackState === "fallback_required_for_minimum_slate",
  );
  const ambiguousRows = rows.filter((r) => r.confidence === "low");

  const highConfidenceBucketCounts = summarizeBucketCounts(highConfidenceRows);
  const dominance = assessDominance(highConfidenceBucketCounts, highConfidenceRows.length);

  return {
    totalRuns: rows.length,
    classifiableRuns: rows.filter((r) => r.confidence !== "low").length,
    ambiguousRuns: ambiguousRows.length,
    bucketCounts: summarizeBucketCounts(rows),
    fallbackStateCounts: summarizeFallbackStateCounts(rows),
    bucketCountsAmongFallbackSelected: summarizeBucketCounts(fallbackSelectedRows),
    bucketCountsHighConfidence: highConfidenceBucketCounts,
    queryFamilyBreakdown: buildQueryFamilyBreakdown(rows),
    dominance,
    runs: rows,
  };
}

