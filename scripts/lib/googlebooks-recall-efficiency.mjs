function mapObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function arrayValue(value) {
  return Array.isArray(value) ? value : [];
}

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function parseMapLine(lines, prefix) {
  const marker = `${prefix}:`;
  const line = lines.find((entry) => entry.startsWith(marker));
  if (!line) return {};
  const raw = line.slice(marker.length).trim();
  try {
    return mapObject(JSON.parse(raw));
  } catch {
    return {};
  }
}

function parseArrayLine(lines, prefix) {
  const marker = `${prefix}:`;
  const line = lines.find((entry) => entry.startsWith(marker));
  if (!line) return [];
  const raw = line.slice(marker.length).trim();
  try {
    return arrayValue(JSON.parse(raw));
  } catch {
    return [];
  }
}

function toNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function pct(numerator, denominator) {
  if (!denominator) return 0;
  return Number(((numerator / denominator) * 100).toFixed(1));
}

function mergeCountMaps(target, source) {
  for (const [key, value] of Object.entries(mapObject(source))) {
    target[key] = toNumber(target[key]) + toNumber(value);
  }
}

function dominantKeyFromCountMap(counts) {
  let bestKey = "";
  let bestCount = -1;
  for (const key of Object.keys(counts).sort()) {
    const count = toNumber(counts[key]);
    if (count > bestCount) {
      bestCount = count;
      bestKey = key;
    }
  }
  return { key: bestKey, count: bestCount > 0 ? bestCount : 0 };
}

function dominantLossStage(row) {
  const losses = [
    { stage: "pre_publication", loss: Math.max(0, row.rawApiResults - row.narrativeCandidates) },
    { stage: "publication_identity", loss: Math.max(0, row.narrativeCandidates - row.publicationIdentityPasses) },
    { stage: "scoring", loss: Math.max(0, row.publicationIdentityPasses - row.scoredCandidates) },
    { stage: "selection", loss: Math.max(0, row.scoredCandidates - row.selectedRecommendations) },
  ];
  let winner = losses[0];
  for (const candidate of losses.slice(1)) {
    if (candidate.loss > winner.loss) winner = candidate;
  }
  return winner;
}

function unknownNarrativeRejectionCount(rejectionReasons) {
  const keys = [
    "publication_shape_unknown_insufficient_story_evidence",
    "publication_shape_unknown_insufficient_narrative_identity",
  ];
  let total = 0;
  for (const key of keys) total += toNumber(rejectionReasons[key]);
  return total;
}

export function classifyLikelyAction(row) {
  const dominantLoss = dominantLossStage(row);
  const healthy =
    row.rawApiResults > 0 &&
    row.selectedRecommendations >= 3 &&
    row.publicationSurvival >= 40 &&
    row.selectionEfficiency >= 70 &&
    row.overallRecallEfficiency >= 10;

  if (healthy || dominantLoss.loss === 0) return "No action";
  if (dominantLoss.stage === "scoring") return "Scoring refinement";
  if (dominantLoss.stage === "selection") return "Selection refinement";
  if (dominantLoss.stage === "publication_identity") return "Publication identity refinement";

  const unknownNarrativeCount = unknownNarrativeRejectionCount(row.rejectionReasonHistogram);
  const publicationShapeRejectionCount = Object.entries(row.rejectionReasonHistogram)
    .filter(([key]) => key.startsWith("publication_shape_"))
    .reduce((sum, [, value]) => sum + toNumber(value), 0);

  if (unknownNarrativeCount > 0 && unknownNarrativeCount * 2 >= publicationShapeRejectionCount) {
    return "Narrative extraction refinement";
  }
  return "Query refinement";
}

export function parseRecallQueryRowsFromReportText(reportText, reportName = "report") {
  const lines = String(reportText || "").split(/\r?\n/);
  const sourceFetch = parseArrayLine(lines, "googleBooksSourceFetchDiagnostics")
    .sort((a, b) => toNumber(a?.queryCascadeIndex ?? a?.attemptNumber) - toNumber(b?.queryCascadeIndex ?? b?.attemptNumber));
  const queryQuality = parseMapLine(lines, "googleBooksQueryResultQualityByQuery");

  const rows = [];
  for (const fetchRow of sourceFetch) {
    const query = String(fetchRow?.query || "").trim();
    if (!query) continue;
    const family = normalize(fetchRow?.queryFamily || "unknown");
    const qualityRow = mapObject(queryQuality[query]);
    const publicationIdentityPasses = toNumber(fetchRow?.acceptedAfterSourcePolicy ?? qualityRow.acceptedCandidateCount);
    const narrativeCandidates = Math.max(
      toNumber(qualityRow.narrativeCandidateCount),
      publicationIdentityPasses,
    );
    rows.push({
      report: reportName,
      family,
      query,
      rawApiResults: toNumber(fetchRow?.rawApiCount ?? qualityRow.rawResultCount),
      narrativeCandidates,
      publicationIdentityPasses,
      scoredCandidates: toNumber(
        qualityRow.enteredRankingCount ??
        qualityRow.scoredCandidateCount ??
        qualityRow.acceptedCandidateCount,
      ),
      selectedRecommendations: toNumber(
        qualityRow.acceptedRecommendationCount ??
        arrayValue(qualityRow.acceptedRecommendationTitles).length,
      ),
      publicationShapeRejectionHistogram: mapObject(qualityRow.rejectedShapeHistogram),
      rejectionReasonHistogram: mapObject(qualityRow.rejectionReasons),
    });
  }
  return rows;
}

export function buildRecallEfficiencyReportFromQueryRows(queryRows) {
  const familyMap = new Map();
  for (const row of queryRows) {
    const family = normalize(row.family || "unknown");
    if (!familyMap.has(family)) {
      familyMap.set(family, {
        queryFamily: family,
        queryCount: 0,
        rawApiResults: 0,
        narrativeCandidates: 0,
        publicationIdentityPasses: 0,
        scoredCandidates: 0,
        selectedRecommendations: 0,
        publicationShapeRejectionHistogram: {},
        rejectionReasonHistogram: {},
      });
    }
    const bucket = familyMap.get(family);
    bucket.queryCount += 1;
    bucket.rawApiResults += toNumber(row.rawApiResults);
    bucket.narrativeCandidates += toNumber(row.narrativeCandidates);
    bucket.publicationIdentityPasses += toNumber(row.publicationIdentityPasses);
    bucket.scoredCandidates += toNumber(row.scoredCandidates);
    bucket.selectedRecommendations += toNumber(row.selectedRecommendations);
    mergeCountMaps(bucket.publicationShapeRejectionHistogram, row.publicationShapeRejectionHistogram);
    mergeCountMaps(bucket.rejectionReasonHistogram, row.rejectionReasonHistogram);
  }

  const familyRows = Array.from(familyMap.values()).map((row) => {
    const narrativeYield = pct(row.narrativeCandidates, row.rawApiResults);
    const publicationSurvival = pct(row.publicationIdentityPasses, row.narrativeCandidates);
    const selectionEfficiency = pct(row.selectedRecommendations, row.scoredCandidates);
    const overallRecallEfficiency = pct(row.selectedRecommendations, row.rawApiResults);
    const dominantRejection = dominantKeyFromCountMap(row.rejectionReasonHistogram);
    const dominantLoss = dominantLossStage({
      ...row,
      narrativeYield,
      publicationSurvival,
      selectionEfficiency,
      overallRecallEfficiency,
    });
    const enriched = {
      ...row,
      narrativeYield,
      publicationSurvival,
      selectionEfficiency,
      overallRecallEfficiency,
      dominantRejectionReason: dominantRejection.key || "none",
      dominantRejectionCount: dominantRejection.count,
      dominantLossStage: dominantLoss.stage,
      dominantLossCount: dominantLoss.loss,
    };
    return {
      ...enriched,
      likelyAction: classifyLikelyAction(enriched),
    };
  }).sort((a, b) =>
    b.dominantLossCount - a.dominantLossCount ||
    a.overallRecallEfficiency - b.overallRecallEfficiency ||
    a.queryFamily.localeCompare(b.queryFamily),
  );

  const summaryByRecallLoss = familyRows.map((row) => ({
    queryFamily: row.queryFamily,
    recallLossCount: row.rawApiResults - row.selectedRecommendations,
    recallLossRate: Number((100 - row.overallRecallEfficiency).toFixed(1)),
    dominantLossStage: row.dominantLossStage,
    likelyAction: row.likelyAction,
  })).sort((a, b) => b.recallLossCount - a.recallLossCount || b.recallLossRate - a.recallLossRate);

  return {
    familyRows,
    summaryByRecallLoss,
    totals: {
      families: familyRows.length,
      queryRows: queryRows.length,
      rawApiResults: familyRows.reduce((sum, row) => sum + row.rawApiResults, 0),
      selectedRecommendations: familyRows.reduce((sum, row) => sum + row.selectedRecommendations, 0),
    },
  };
}

export function buildRecallEfficiencyReportFromReports(reports) {
  const queryRows = [];
  for (const report of reports) {
    const rows = parseRecallQueryRowsFromReportText(report.text, report.name);
    queryRows.push(...rows);
  }
  return {
    queryRows,
    ...buildRecallEfficiencyReportFromQueryRows(queryRows),
  };
}
