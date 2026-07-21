function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function pct(numerator, denominator) {
  if (!denominator) return 0;
  return Number(((numerator / denominator) * 100).toFixed(1));
}

function increment(map, key, amount = 1) {
  if (!key) return;
  map[key] = toNumber(map[key]) + amount;
}

export function isLikelyLegitimateNarrative(analysis) {
  const shape = String(analysis.publicationShape || "");
  if (shape === "novel" || shape === "series_installment" || shape === "story_collection") return true;
  if (shape !== "unknown") return false;
  const explicitNonNarrative = Array.isArray(analysis.explicitNonNarrativeIdentity) ? analysis.explicitNonNarrativeIdentity.length : 0;
  if (explicitNonNarrative > 0) return false;
  const storySignals = Array.isArray(analysis.storyLevelNarrativeEvidence) ? analysis.storyLevelNarrativeEvidence.length : 0;
  const unknownSignals = Array.isArray(analysis.unknownShapeEvidence) ? analysis.unknownShapeEvidence.length : 0;
  const confidence = toNumber(analysis.narrativeConfidence);
  return storySignals >= 2 || (storySignals >= 1 && unknownSignals >= 2) || confidence >= 1.25;
}

export function buildPublicationIdentityRuleHistogram(rejectionReasonsByQuery, query) {
  const row = (rejectionReasonsByQuery && typeof rejectionReasonsByQuery === "object")
    ? (rejectionReasonsByQuery[query] || {})
    : {};
  const histogram = {};
  for (const [reason, count] of Object.entries(row)) {
    if (!String(reason).startsWith("publication_shape_")) continue;
    histogram[String(reason)] = toNumber(count);
  }
  return histogram;
}

export function summarizeRuleLoss(ruleHistogram) {
  const total = Object.values(ruleHistogram).reduce((sum, value) => sum + toNumber(value), 0);
  const rows = Object.entries(ruleHistogram)
    .map(([rule, count]) => ({
      rule,
      rejectedCount: toNumber(count),
      rejectedPct: pct(toNumber(count), total),
    }))
    .sort((a, b) => b.rejectedCount - a.rejectedCount || a.rule.localeCompare(b.rule));
  return { totalRejectedByPublicationIdentity: total, rows };
}

export function simulateSingleRuleRelaxations({ rows, baselinePassCount, topRules }) {
  const simulations = [];
  const sourceRows = Array.isArray(rows) ? rows : [];
  for (const rule of topRules) {
    const admittedRows = sourceRows.filter((row) =>
      String(row.publicationShapeDropReason || "") === rule
      && !String(row.artifactDropReason || ""),
    );
    const additionalCandidates = admittedRows.length;
    const likelyNarrativeAdds = admittedRows.filter((row) => isLikelyLegitimateNarrative(row)).length;
    const likelyFalseAcceptAdds = additionalCandidates - likelyNarrativeAdds;
    simulations.push({
      relaxedRule: rule,
      baselinePublicationPasses: baselinePassCount,
      simulatedPublicationPasses: baselinePassCount + additionalCandidates,
      additionalCandidates,
      likelyNarrativeAdds,
      likelyFalseAcceptAdds,
      falseAcceptRatePct: pct(likelyFalseAcceptAdds, additionalCandidates),
      publicationPassLiftPct: pct(additionalCandidates, baselinePassCount || additionalCandidates),
    });
  }
  simulations.sort((a, b) =>
    b.additionalCandidates - a.additionalCandidates
    || a.likelyFalseAcceptAdds - b.likelyFalseAcceptAdds
    || a.relaxedRule.localeCompare(b.relaxedRule),
  );
  return simulations;
}

export function chooseBestSingleRule(simulations) {
  if (!Array.isArray(simulations) || simulations.length === 0) return undefined;
  const viable = simulations.filter((row) =>
    row.additionalCandidates > 0
    && row.likelyNarrativeAdds > row.likelyFalseAcceptAdds,
  );
  if (viable.length === 0) return undefined;
  return [...viable].sort((a, b) =>
    (b.likelyNarrativeAdds - b.likelyFalseAcceptAdds) - (a.likelyNarrativeAdds - a.likelyFalseAcceptAdds)
    || b.additionalCandidates - a.additionalCandidates
    || a.likelyFalseAcceptAdds - b.likelyFalseAcceptAdds
    || a.relaxedRule.localeCompare(b.relaxedRule),
  )[0];
}

export function buildShapeDistribution(rows) {
  const distribution = {};
  const total = Array.isArray(rows) ? rows.length : 0;
  for (const row of Array.isArray(rows) ? rows : []) {
    increment(distribution, String(row.publicationShape || "unknown"));
  }
  const percents = Object.fromEntries(
    Object.entries(distribution).map(([shape, count]) => [shape, pct(toNumber(count), total)]),
  );
  return { count: distribution, percent: percents };
}
