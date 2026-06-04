import type { ScoredCandidate, TasteProfile } from "./types";

function rejectReason(candidate: ScoredCandidate, profile: TasteProfile): string | null {
  if (!candidate.title.trim()) return "missing_title";
  if (candidate.score <= 0) return "non_positive_score";
  if (candidate.maturityBand && String(candidate.maturityBand) !== profile.maturityBand && profile.ageBand !== "adult") return "maturity_band_mismatch";
  return null;
}

export function selectRecommendations(candidates: ScoredCandidate[], profile: TasteProfile, limit = 10): { selected: ScoredCandidate[]; rejectedReasons: Record<string, number> } {
  const rejectedReasons: Record<string, number> = {};
  const selected: ScoredCandidate[] = [];
  const seenTitles = new Set<string>();
  for (const candidate of candidates) {
    const reason = rejectReason(candidate, profile);
    if (reason) {
      candidate.rejectedReasons.push(reason);
      rejectedReasons[reason] = Number(rejectedReasons[reason] || 0) + 1;
      continue;
    }
    const titleKey = candidate.title.toLowerCase();
    if (seenTitles.has(titleKey)) {
      candidate.rejectedReasons.push("duplicate_title");
      rejectedReasons.duplicate_title = Number(rejectedReasons.duplicate_title || 0) + 1;
      continue;
    }
    seenTitles.add(titleKey);
    selected.push(candidate);
    if (selected.length >= limit) break;
  }
  return { selected, rejectedReasons };
}
