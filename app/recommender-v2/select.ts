import type { ScoredCandidate, TasteProfile } from "./types";

function normalized(value: unknown): string {
  return String(value || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function rootTitle(title: string): string {
  return normalized(title)
    .replace(/\b(the hunger games|catching fire|mockingjay)\b.*$/, "hunger games")
    .replace(/\b(grande ritorno|diadem|chosen)\b.*$/, "$1")
    .replace(/\b(volume|vol|book|part|chapter)\s*\d+\b/g, " ")
    .replace(/\b\d+\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function seriesKey(candidate: ScoredCandidate): string {
  const text = normalized([candidate.title, candidate.subtitle, candidate.diagnostics?.queryText, candidate.diagnostics?.queryFamily].filter(Boolean).join(" "));
  if (/\b(hunger games|catching fire|mockingjay)\b/.test(text)) return "hunger games";
  const known = text.match(/\b(one piece|naruto|throne of glass|divergent|maze runner|twilight|grande ritorno|diadem|chosen)\b/);
  if (known) return known[1];
  return rootTitle(candidate.title);
}

function primaryAuthor(candidate: ScoredCandidate): string {
  return normalized(candidate.creators[0] || "");
}

function recurringOpenLibraryClusterKey(candidate: ScoredCandidate): string {
  if (candidate.source !== "openLibrary") return "";
  const text = normalized([candidate.title, candidate.subtitle, candidate.creators.join(" ")].filter(Boolean).join(" "));
  const known = text.match(/\b(max porter|echoes and ashes|raven s sight|ravens sight)\b/);
  return known ? known[1] : "";
}

function isContemporaryLowScoreAcceptable(candidate: ScoredCandidate, profile: TasteProfile): boolean {
  if (profile.ageBand !== "teens") return false;
  const text = normalized([candidate.diagnostics?.queryFamily, candidate.diagnostics?.queryText, candidate.title, candidate.subtitle].filter(Boolean).join(" "));
  return candidate.score > -1.5 && /\b(contemporary|realistic|coming of age|teen realistic fiction|school|drama)\b/.test(text);
}

function needsAdultWeakOpenLibraryEmptySlateFallback(candidate: ScoredCandidate, profile: TasteProfile): boolean {
  if (profile.ageBand !== "adult" || candidate.source !== "openLibrary") return false;
  const breakdown = candidate.scoreBreakdown || {};
  const metadataCount = candidate.genres.length + candidate.themes.length;
  const sourceQuality = Number(breakdown.sourceQualityRelevance || 0);
  return metadataCount <= 2 && sourceQuality <= -2.5 && candidate.score < 2.5;
}

function adultQueryFamily(candidate: ScoredCandidate): string {
  const text = normalized([candidate.diagnostics?.queryText, candidate.diagnostics?.queryFamily].filter(Boolean).join(" "));
  if (/\b(science fiction|sci fi|speculative|dystopia|dystopian|space)\b/.test(text)) return "speculative";
  if (/\b(cozy|cosy)\b/.test(text)) return "cozy_fantasy";
  if (/\bfantasy\b/.test(text)) return "fantasy";
  if (/\b(historical|history|period)\b/.test(text)) return "historical";
  if (/\b(crime|mystery|thriller|detective|noir|suspense)\b/.test(text)) return "crime_thriller";
  if (/\bhorror\b/.test(text)) return "horror";
  return "other";
}

function adultSignalWeight(profile: TasteProfile, pattern: RegExp): number {
  return [...profile.genreFamily, ...profile.themes].reduce((sum, row) => {
    if (!pattern.test(normalized(row.value))) return sum;
    const evidence = Array.isArray(row.evidence) ? row.evidence : [];
    const allSkip = evidence.length > 0 && evidence.every((item) => String(item || "").startsWith("skip:"));
    return sum + Math.abs(Number(row.weight || 0)) * (allSkip ? 0.2 : 1);
  }, 0);
}

function adultSpeculativeReserveTarget(candidates: ScoredCandidate[], profile: TasteProfile): number {
  if (profile.ageBand !== "adult") return 0;
  const usesSpeculativeRoute = candidates.some((candidate) => ["adult_scifi", "adult_historical_speculative_thriller"].includes(String(candidate.diagnostics?.routingReason || "")));
  if (!usesSpeculativeRoute) return 0;
  const speculativeWeight = adultSignalWeight(profile, /\b(science fiction|sci fi|sci-fi|speculative|space|dystopia|dystopian|alternate history)\b/);
  const cozyFantasyWeight = adultSignalWeight(profile, /\b(fantasy|magic|cozy|cosy|comfort|whimsical|slice of life|low stakes|lighthearted)\b/);
  if (speculativeWeight <= 0) return 0;
  return speculativeWeight >= cozyFantasyWeight ? 2 : 1;
}

function addAdultFamilyDiagnostics(candidates: ScoredCandidate[], selected: ScoredCandidate[], rejectedReasons: Record<string, number>, profile: TasteProfile): void {
  if (profile.ageBand !== "adult") return;
  const scoredCounts: Record<string, number> = {};
  const selectedCounts: Record<string, number> = {};
  for (const candidate of candidates) scoredCounts[adultQueryFamily(candidate)] = Number(scoredCounts[adultQueryFamily(candidate)] || 0) + 1;
  for (const candidate of selected) selectedCounts[adultQueryFamily(candidate)] = Number(selectedCounts[adultQueryFamily(candidate)] || 0) + 1;
  for (const family of Object.keys(scoredCounts)) {
    const scored = scoredCounts[family];
    const accepted = Number(selectedCounts[family] || 0);
    rejectedReasons[`adult_query_family_scored_${family}`] = scored;
    rejectedReasons[`adult_query_family_selected_${family}`] = accepted;
    rejectedReasons[`adult_query_family_rejected_${family}`] = Math.max(0, scored - accepted);
    rejectedReasons[`adult_query_family_acceptance_pct_${family}`] = scored ? Math.round((accepted / scored) * 100) : 0;
  }
}

function applyAdultSpeculativeFamilyBalance(rankedCandidates: ScoredCandidate[], selected: ScoredCandidate[], rejectedReasons: Record<string, number>, profile: TasteProfile, limit: number): void {
  const reserveTarget = adultSpeculativeReserveTarget(rankedCandidates, profile);
  if (reserveTarget <= 0) return;
  let selectedSpeculative = selected.filter((candidate) => adultQueryFamily(candidate) === "speculative").length;
  if (selectedSpeculative >= reserveTarget) return;
  const selectedSet = new Set(selected);
  const selectedTitles = new Set(selected.map((candidate) => normalized(candidate.title)));
  const speculativePool = rankedCandidates.filter((candidate) => {
    if (selectedSet.has(candidate) || selectedTitles.has(normalized(candidate.title))) return false;
    if (adultQueryFamily(candidate) !== "speculative") return false;
    if (rejectReason(candidate, profile)) return false;
    if (needsAdultWeakOpenLibraryEmptySlateFallback(candidate, profile)) return false;
    return candidate.score > 0;
  });
  rejectedReasons.adult_speculative_family_balance_target = reserveTarget;
  rejectedReasons.adult_speculative_family_balance_candidates = speculativePool.length;
  for (const candidate of speculativePool) {
    if (selectedSpeculative >= reserveTarget || selected.length >= Math.max(3, Math.min(5, limit))) break;
    candidate.rejectedReasons.push("accepted_adult_speculative_family_balance");
    selected.push(candidate);
    selectedSet.add(candidate);
    selectedTitles.add(normalized(candidate.title));
    selectedSpeculative += 1;
    rejectedReasons.accepted_adult_speculative_family_balance = Number(rejectedReasons.accepted_adult_speculative_family_balance || 0) + 1;
  }
  for (const candidate of speculativePool) {
    if (selectedSpeculative >= reserveTarget) break;
    if (selectedSet.has(candidate)) continue;
    const replacementIndex = selected
      .map((row, index) => ({ row, index }))
      .filter(({ row }) => !["speculative", "historical"].includes(adultQueryFamily(row)))
      .sort((a, b) => a.row.score - b.row.score)[0]?.index;
    if (replacementIndex === undefined) break;
    const replaced = selected[replacementIndex];
    replaced.rejectedReasons.push("adult_speculative_family_balance_replaced_by_speculative");
    candidate.rejectedReasons.push("accepted_adult_speculative_family_balance");
    selected[replacementIndex] = candidate;
    selectedSet.add(candidate);
    selectedTitles.add(normalized(candidate.title));
    selectedSpeculative += 1;
    rejectedReasons.adult_speculative_family_balance_replacements = Number(rejectedReasons.adult_speculative_family_balance_replacements || 0) + 1;
    rejectedReasons.accepted_adult_speculative_family_balance = Number(rejectedReasons.accepted_adult_speculative_family_balance || 0) + 1;
  }
}

function rejectReason(candidate: ScoredCandidate, profile: TasteProfile): string | null {
  if (!candidate.title.trim()) return "missing_title";
  if (candidate.score <= 0 && !isContemporaryLowScoreAcceptable(candidate, profile)) return "non_positive_score";
  if (candidate.maturityBand && String(candidate.maturityBand) !== profile.maturityBand && profile.ageBand !== "adult") return "maturity_band_mismatch";
  return null;
}

function nonPositiveScoreDetail(candidate: ScoredCandidate): string {
  const breakdown = candidate.scoreBreakdown || {};
  return [
    "non_positive_score_detail",
    `score=${candidate.score.toFixed(2)}`,
    `genre=${Number(breakdown.genreFacetMatch || 0).toFixed(2)}`,
    `positive=${Number(breakdown.positiveTasteMatch || 0).toFixed(2)}`,
    `avoid=${Number(breakdown.avoidSignalPenalty || 0).toFixed(2)}`,
    `broadAvoid=${Number(breakdown.broadAvoidSignalPenalty || 0).toFixed(2)}`,
    `age=${Number(breakdown.ageTeenSuitability || 0).toFixed(2)}`,
    `sourceQuality=${Number(breakdown.sourceQualityRelevance || 0).toFixed(2)}`,
    `queryRung=${Number(breakdown.queryRungBonus || 0).toFixed(2)}`,
  ].join(":");
}

function isLowScoreRescueCandidate(candidate: ScoredCandidate): boolean {
  const breakdown = candidate.scoreBreakdown || {};
  const sourceQuality = Number(breakdown.sourceQualityRelevance || 0);
  const genreMatch = Number(breakdown.genreFacetMatch || 0);
  const positiveMatch = Number(breakdown.positiveTasteMatch || 0);
  const ageSuitability = Number(breakdown.ageTeenSuitability || 0);
  const queryRung = Number(breakdown.queryRungBonus || 0);
  const preciseAvoid = Number(breakdown.avoidSignalPenalty || 0);
  return candidate.score > -4 && ageSuitability > -3 && preciseAvoid > -3.5 && (sourceQuality >= 1.1 || genreMatch > 0 || positiveMatch > 0 || queryRung >= 0.55);
}

function recordRejected(candidate: ScoredCandidate, rejectedReasons: Record<string, number>, reason: string): void {
  candidate.rejectedReasons.push(reason);
  rejectedReasons[reason] = Number(rejectedReasons[reason] || 0) + 1;
}

export function selectRecommendations(candidates: ScoredCandidate[], profile: TasteProfile, limit = 10): { selected: ScoredCandidate[]; rejectedReasons: Record<string, number> } {
  const rejectedReasons: Record<string, number> = {};
  const selected: ScoredCandidate[] = [];
  const deferred: { candidate: ScoredCandidate; reason: string }[] = [];
  const lowScoreRescue: ScoredCandidate[] = [];
  const adultWeakOpenLibraryCandidates: ScoredCandidate[] = [];
  const seenTitles = new Set<string>();
  const seenAuthors = new Set<string>();
  const seenSeries = new Set<string>();
  const seenRecurringOpenLibraryClusters = new Set<string>();

  const rankedCandidates = [...candidates].sort((a, b) => b.score - a.score);

  for (const candidate of rankedCandidates) {
    const reason = rejectReason(candidate, profile);
    if (reason) {
      recordRejected(candidate, rejectedReasons, reason);
      if (reason === "non_positive_score") {
        candidate.rejectedReasons.push(nonPositiveScoreDetail(candidate));
        if (isLowScoreRescueCandidate(candidate)) lowScoreRescue.push(candidate);
      }
      continue;
    }
    if (needsAdultWeakOpenLibraryEmptySlateFallback(candidate, profile)) {
      adultWeakOpenLibraryCandidates.push(candidate);
      rejectedReasons.adult_weak_openlibrary_source_quality_deferred = Number(rejectedReasons.adult_weak_openlibrary_source_quality_deferred || 0) + 1;
      continue;
    }
    if (candidate.score <= 0) {
      candidate.rejectedReasons.push("accepted_despite_low_score");
      rejectedReasons.accepted_despite_low_score = Number(rejectedReasons.accepted_despite_low_score || 0) + 1;
    }
    const titleKey = normalized(candidate.title);
    if (seenTitles.has(titleKey)) {
      recordRejected(candidate, rejectedReasons, "duplicate_title");
      continue;
    }
    const authorKey = primaryAuthor(candidate);
    if (authorKey && seenAuthors.has(authorKey)) {
      deferred.push({ candidate, reason: "same_author_deferred" });
      continue;
    }
    const rootKey = seriesKey(candidate);
    if (rootKey && seenSeries.has(rootKey)) {
      deferred.push({ candidate, reason: "same_series_or_root_deferred" });
      continue;
    }
    const recurringClusterKey = recurringOpenLibraryClusterKey(candidate);
    if (recurringClusterKey && (selected.length > 0 || seenRecurringOpenLibraryClusters.has(recurringClusterKey))) {
      deferred.push({ candidate, reason: "recurring_openlibrary_cluster_deferred" });
      continue;
    }
    seenTitles.add(titleKey);
    if (authorKey) seenAuthors.add(authorKey);
    if (rootKey) seenSeries.add(rootKey);
    if (recurringClusterKey) seenRecurringOpenLibraryClusters.add(recurringClusterKey);
    selected.push(candidate);
    if (selected.length >= limit) break;
  }

  if (selected.length === 0 && lowScoreRescue.length > 0) {
    rejectedReasons.low_score_rescue_candidates_available = lowScoreRescue.length;
    for (const candidate of lowScoreRescue.sort((a, b) => b.score - a.score)) {
      const titleKey = normalized(candidate.title);
      const authorKey = primaryAuthor(candidate);
      const rootKey = seriesKey(candidate);
      const recurringClusterKey = recurringOpenLibraryClusterKey(candidate);
      if (seenTitles.has(titleKey) || (authorKey && seenAuthors.has(authorKey)) || (rootKey && seenSeries.has(rootKey)) || (recurringClusterKey && seenRecurringOpenLibraryClusters.has(recurringClusterKey))) continue;
      candidate.rejectedReasons.push("accepted_low_score_rescue_source_quality_or_query_alignment");
      rejectedReasons.accepted_low_score_rescue = Number(rejectedReasons.accepted_low_score_rescue || 0) + 1;
      seenTitles.add(titleKey);
      if (authorKey) seenAuthors.add(authorKey);
      if (rootKey) seenSeries.add(rootKey);
      if (recurringClusterKey) seenRecurringOpenLibraryClusters.add(recurringClusterKey);
      selected.push(candidate);
      if (selected.length >= Math.min(5, Math.max(3, lowScoreRescue.length))) break;
    }
  }

  if (selected.length === 0 && adultWeakOpenLibraryCandidates.length > 0) {
    const candidate = adultWeakOpenLibraryCandidates.sort((a, b) => b.score - a.score)[0];
    candidate.rejectedReasons.push("accepted_empty_slate_adult_weak_openlibrary_fallback");
    rejectedReasons.accepted_empty_slate_adult_weak_openlibrary_fallback = 1;
    selected.push(candidate);
  }

  const underfillTarget = deferred.length > 0
    ? Math.min(profile.ageBand === "adult" ? 5 : 3, limit)
    : (selected.length === 0 ? 1 : selected.length);
  if (selected.length < underfillTarget) {
    rejectedReasons.underfill_deferred_available = deferred.length;
    for (const row of deferred) {
      const titleKey = normalized(row.candidate.title);
      if (seenTitles.has(titleKey)) continue;
      if (row.reason === "recurring_openlibrary_cluster_deferred") {
        row.candidate.rejectedReasons.push("underfill_blocked_recurring_openlibrary_cluster");
        rejectedReasons.underfill_blocked_recurring_openlibrary_cluster = Number(rejectedReasons.underfill_blocked_recurring_openlibrary_cluster || 0) + 1;
        continue;
      }
      row.candidate.rejectedReasons.push(`underfill_relaxed_diversity:${row.reason}`);
      rejectedReasons.underfill_relaxed_diversity = Number(rejectedReasons.underfill_relaxed_diversity || 0) + 1;
      seenTitles.add(titleKey);
      selected.push(row.candidate);
      if (selected.length >= underfillTarget) break;
    }
  } else if (deferred.length > 0) {
    rejectedReasons.underfill_deferred_available = deferred.length;
    rejectedReasons.underfill_blocked_by_minimum_acceptable_slate = deferred.length;
  }

  applyAdultSpeculativeFamilyBalance(rankedCandidates, selected, rejectedReasons, profile, limit);

  for (const row of deferred) {
    if (!selected.includes(row.candidate)) recordRejected(row.candidate, rejectedReasons, row.reason);
  }
  for (const candidate of adultWeakOpenLibraryCandidates) {
    if (!selected.includes(candidate)) recordRejected(candidate, rejectedReasons, "adult_weak_openlibrary_source_quality");
  }

  const openLibraryOnlySlate = selected.length > 0 && selected.every((candidate) => candidate.source === "openLibrary");
  const meaningfulQualityCount = selected.filter((candidate) => {
    const breakdown = candidate.scoreBreakdown || {};
    const avoidTotal = Number(breakdown.avoidSignalPenalty || 0) + Number(breakdown.broadAvoidSignalPenalty || 0);
    return candidate.score >= 5 && Number(breakdown.sourceQualityRelevance || 0) >= 1.5 && Number(breakdown.ageTeenSuitability || 0) >= 0.35 && avoidTotal > -1.2;
  }).length;
  if (openLibraryOnlySlate && selected.length > 5 && meaningfulQualityCount < 6) {
    const removed = selected.splice(5);
    rejectedReasons.openlibrary_quality_cap_weak_slate = removed.length;
    for (const candidate of removed) recordRejected(candidate, rejectedReasons, "openlibrary_quality_cap_weak_slate");
  }

  addAdultFamilyDiagnostics(rankedCandidates, selected, rejectedReasons, profile);

  return { selected, rejectedReasons };
}
