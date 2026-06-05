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

function isContemporaryLowScoreAcceptable(candidate: ScoredCandidate, profile: TasteProfile): boolean {
  if (profile.ageBand !== "teens") return false;
  const text = normalized([candidate.diagnostics?.queryFamily, candidate.diagnostics?.queryText, candidate.title, candidate.subtitle].filter(Boolean).join(" "));
  return candidate.score > -1.5 && /\b(contemporary|realistic|coming of age|teen realistic fiction|school|drama)\b/.test(text);
}

function rejectReason(candidate: ScoredCandidate, profile: TasteProfile): string | null {
  if (!candidate.title.trim()) return "missing_title";
  if (candidate.score <= 0 && !isContemporaryLowScoreAcceptable(candidate, profile)) return "non_positive_score";
  if (candidate.maturityBand && String(candidate.maturityBand) !== profile.maturityBand && profile.ageBand !== "adult") return "maturity_band_mismatch";
  return null;
}

function recordRejected(candidate: ScoredCandidate, rejectedReasons: Record<string, number>, reason: string): void {
  candidate.rejectedReasons.push(reason);
  rejectedReasons[reason] = Number(rejectedReasons[reason] || 0) + 1;
}

export function selectRecommendations(candidates: ScoredCandidate[], profile: TasteProfile, limit = 10): { selected: ScoredCandidate[]; rejectedReasons: Record<string, number> } {
  const rejectedReasons: Record<string, number> = {};
  const selected: ScoredCandidate[] = [];
  const deferred: { candidate: ScoredCandidate; reason: string }[] = [];
  const seenTitles = new Set<string>();
  const seenAuthors = new Set<string>();
  const seenSeries = new Set<string>();

  for (const candidate of candidates) {
    const reason = rejectReason(candidate, profile);
    if (reason) {
      recordRejected(candidate, rejectedReasons, reason);
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
    seenTitles.add(titleKey);
    if (authorKey) seenAuthors.add(authorKey);
    if (rootKey) seenSeries.add(rootKey);
    selected.push(candidate);
    if (selected.length >= limit) break;
  }

  const underfillTarget = selected.length === 0 ? 1 : selected.length;
  if (selected.length < underfillTarget) {
    rejectedReasons.underfill_deferred_available = deferred.length;
    for (const row of deferred) {
      const titleKey = normalized(row.candidate.title);
      if (seenTitles.has(titleKey)) continue;
      row.candidate.rejectedReasons.push(`underfill_allowed_empty_slate:${row.reason}`);
      rejectedReasons.underfill_allowed_empty_slate = Number(rejectedReasons.underfill_allowed_empty_slate || 0) + 1;
      seenTitles.add(titleKey);
      selected.push(row.candidate);
      if (selected.length >= underfillTarget) break;
    }
  } else if (deferred.length > 0) {
    rejectedReasons.underfill_deferred_available = deferred.length;
    rejectedReasons.underfill_blocked_by_minimum_acceptable_slate = deferred.length;
  }

  for (const row of deferred) {
    if (!selected.includes(row.candidate)) recordRejected(row.candidate, rejectedReasons, row.reason);
  }

  return { selected, rejectedReasons };
}
