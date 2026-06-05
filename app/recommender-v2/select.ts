import type { ScoredCandidate, TasteProfile } from "./types";

function normalized(value: unknown): string {
  return String(value || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function rootTitle(title: string): string {
  return normalized(title)
    .replace(/\b(the hunger games|catching fire|mockingjay)\b.*$/, "hunger games")
    .replace(/\b(volume|vol|book|part|chapter)\s*\d+\b/g, " ")
    .replace(/\b\d+\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function seriesKey(candidate: ScoredCandidate): string {
  const text = normalized([candidate.title, candidate.subtitle, candidate.diagnostics?.queryText, candidate.diagnostics?.queryFamily].filter(Boolean).join(" "));
  const known = text.match(/\b(hunger games|one piece|naruto|throne of glass|divergent|maze runner|twilight)\b/);
  if (known) return known[1];
  return rootTitle(candidate.title);
}

function primaryAuthor(candidate: ScoredCandidate): string {
  return normalized(candidate.creators[0] || "");
}

function rejectReason(candidate: ScoredCandidate, profile: TasteProfile): string | null {
  if (!candidate.title.trim()) return "missing_title";
  if (candidate.score <= 0) return "non_positive_score";
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

  if (selected.length < limit) {
    for (const row of deferred) {
      const titleKey = normalized(row.candidate.title);
      if (seenTitles.has(titleKey)) continue;
      row.candidate.rejectedReasons.push(`underfill_allowed:${row.reason}`);
      seenTitles.add(titleKey);
      selected.push(row.candidate);
      if (selected.length >= limit) break;
    }
  }

  for (const row of deferred) {
    if (!selected.includes(row.candidate)) recordRejected(row.candidate, rejectedReasons, row.reason);
  }

  return { selected, rejectedReasons };
}
