import type { NormalizedCandidate, ScoredCandidate, TasteProfile, WeightedSignalV2 } from "./types";

function candidateText(candidate: NormalizedCandidate): string {
  return [
    candidate.title,
    candidate.subtitle,
    candidate.description,
    ...candidate.genres,
    ...candidate.themes,
    ...candidate.tones,
    ...candidate.characterDynamics,
    ...candidate.formats,
  ].join(" ").toLowerCase();
}

function applySignalMatches(text: string, signals: WeightedSignalV2[], multiplier: number, matched: string[], breakdown: Record<string, number>, bucket: string): void {
  for (const signal of signals) {
    if (!signal.value || !text.includes(signal.value.toLowerCase())) continue;
    const points = signal.weight * multiplier;
    breakdown[bucket] = Number(breakdown[bucket] || 0) + points;
    matched.push(`${bucket}:${signal.value}`);
  }
}

export function scoreCandidates(candidates: NormalizedCandidate[], profile: TasteProfile): ScoredCandidate[] {
  return candidates.map((candidate) => {
    const text = candidateText(candidate);
    const matchedSignals: string[] = [];
    const scoreBreakdown: Record<string, number> = { base: 1 };
    applySignalMatches(text, profile.genreFamily, 3, matchedSignals, scoreBreakdown, "genre");
    applySignalMatches(text, profile.themes, 2, matchedSignals, scoreBreakdown, "theme");
    applySignalMatches(text, profile.tone, 1.5, matchedSignals, scoreBreakdown, "tone");
    applySignalMatches(text, profile.characterDynamics, 2, matchedSignals, scoreBreakdown, "character");
    applySignalMatches(text, profile.formatPreference, 1, matchedSignals, scoreBreakdown, "format");
    applySignalMatches(text, profile.avoidSignals, -4, matchedSignals, scoreBreakdown, "avoid");
    const score = Object.values(scoreBreakdown).reduce((sum, value) => sum + Number(value || 0), 0);
    return {
      ...candidate,
      score,
      matchedSignals,
      rejectedReasons: [],
      scoreBreakdown,
    };
  }).sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
}
