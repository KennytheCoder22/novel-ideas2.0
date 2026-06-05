import type { NormalizedCandidate, ScoredCandidate, TasteProfile, WeightedSignalV2 } from "./types";

function candidateText(candidate: NormalizedCandidate): string {
  return [
    candidate.title,
    candidate.subtitle,
    candidate.description,
    ...candidate.creators,
    ...candidate.genres,
    ...candidate.themes,
    ...candidate.tones,
    ...candidate.characterDynamics,
    ...candidate.formats,
    String(candidate.diagnostics?.queryText || ""),
    String(candidate.diagnostics?.queryFamily || ""),
    ...(Array.isArray(candidate.diagnostics?.facets) ? candidate.diagnostics.facets.map(String) : []),
  ].join(" ").toLowerCase();
}

function normalized(value: unknown): string {
  return String(value || "").toLowerCase().replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ").trim();
}

function signalMatches(text: string, signals: WeightedSignalV2[]): WeightedSignalV2[] {
  return signals.filter((signal) => {
    const value = normalized(signal.value);
    return Boolean(value && text.includes(value));
  });
}

function addSignalBucket(matches: WeightedSignalV2[], multiplier: number, matched: string[], breakdown: Record<string, number>, bucket: string): void {
  for (const signal of matches) {
    const magnitude = Math.abs(signal.weight) * Math.abs(multiplier);
    const points = multiplier < 0 ? -magnitude : magnitude;
    breakdown[bucket] = Number(breakdown[bucket] || 0) + points;
    matched.push(`${bucket}:${signal.value}`);
  }
}

function queryRungBonus(candidate: NormalizedCandidate): number {
  const rung = Number(candidate.diagnostics?.queryCascadeIndex ?? candidate.diagnostics?.queryRung ?? 2);
  if (!Number.isFinite(rung) || rung <= 0) return 1;
  if (rung === 1) return 0.55;
  return 0.2;
}

function ageSuitabilityScore(candidate: NormalizedCandidate, profile: TasteProfile): number {
  if (profile.ageBand !== "teens") return 0.25;
  const text = candidateText(candidate);
  if (/\b(lolita|nabokov|erotic|erotica|pornography|incest|sexual abuse)\b/.test(text)) return -6;
  if (/\b(demoness|vixen|seductress|sensual|forbidden desire|dark lover|new adult|adult romance|college romance|bret easton ellis|the informers|icebreaker|midnight fantasies|blaze|harlequin|silhouette desire)\b/.test(text)) return -4.5;
  if (/\b(young adult|juvenile|teen|adolescent|coming of age|school)\b/.test(text)) return 1;
  if (candidate.publicationYear && candidate.publicationYear >= 2000) return 0.8;
  if (candidate.publicationYear && candidate.publicationYear >= 1950) return 0.35;
  return -0.5;
}

function meaningfulTokens(value: string): string[] {
  return normalized(value).split(" ").filter((token) => token.length >= 4 && !/^(young|adult|book|novel|story|fiction)$/.test(token));
}

function querySpecificityScore(candidate: NormalizedCandidate): number {
  const query = String(candidate.diagnostics?.queryText || "");
  const queryTokens = meaningfulTokens(query);
  if (!queryTokens.length) return 0;
  const itemTokens = new Set(meaningfulTokens([candidate.title, candidate.subtitle, candidate.description, ...candidate.genres, ...candidate.themes].join(" ")));
  const matches = queryTokens.filter((token) => itemTokens.has(token));
  let score = Math.min(1.4, matches.length * 0.35);
  if (/^(young adult fantasy|fantasy)$/i.test(query.trim()) && matches.length <= 1) score -= 0.6;
  return score;
}

function sourceQualityRelevanceScore(candidate: NormalizedCandidate, profile: TasteProfile, genreMatches: WeightedSignalV2[], positiveMatches: WeightedSignalV2[]): number {
  const text = candidateText(candidate);
  let score = querySpecificityScore(candidate);
  if (candidate.creators.length > 0) score += 0.4;
  if (candidate.sourceUrl) score += 0.2;
  if (candidate.publicationYear && candidate.publicationYear >= 1950) score += 0.25;
  if (genreMatches.length > 0) score += 0.7;
  if (positiveMatches.length > 0) score += 0.4;
  if (/\b(coloring|colouring|workbook|worksheet|activity book|teacher'?s? guide|study guide)\b/.test(text)) score -= 4;
  if (/\bdrunk\b/.test(text) && genreMatches.length === 0) score -= 2.5;
  if (profile.ageBand === "teens" && /\b(demoness|vixen|seductress|sensual|new adult|adult romance|college romance|bret easton ellis|the informers|icebreaker|midnight fantasies|blaze|harlequin|silhouette desire)\b/.test(text)) score -= 2.5;
  if (/^[A-Z0-9\s:;,'!?.-]{12,}$/.test(candidate.title) && candidate.title !== candidate.title.toLowerCase()) score -= 1.25;
  if (genreMatches.length === 0 && positiveMatches.length === 0) score -= 1.5;
  return score;
}

export function scoreCandidates(candidates: NormalizedCandidate[], profile: TasteProfile): ScoredCandidate[] {
  return candidates.map((candidate) => {
    const text = candidateText(candidate);
    const matchedSignals: string[] = [];
    const scoreBreakdown: Record<string, number> = { base: 1 };

    const genreMatches = signalMatches(text, profile.genreFamily);
    const themeMatches = signalMatches(text, profile.themes);
    const toneMatches = signalMatches(text, profile.tone);
    const characterMatches = signalMatches(text, profile.characterDynamics);
    const formatMatches = signalMatches(text, profile.formatPreference);
    const avoidMatches = signalMatches(text, profile.avoidSignals);
    const positiveMatches = [...themeMatches, ...toneMatches, ...characterMatches, ...formatMatches];

    addSignalBucket(genreMatches, 3, matchedSignals, scoreBreakdown, "genreFacetMatch");
    addSignalBucket(themeMatches, 1.7, matchedSignals, scoreBreakdown, "positiveTasteMatch");
    addSignalBucket(toneMatches, 1.2, matchedSignals, scoreBreakdown, "positiveTasteMatch");
    addSignalBucket(characterMatches, 1.7, matchedSignals, scoreBreakdown, "positiveTasteMatch");
    addSignalBucket(formatMatches, 0.8, matchedSignals, scoreBreakdown, "positiveTasteMatch");
    addSignalBucket(avoidMatches, -4, matchedSignals, scoreBreakdown, "avoidSignalPenalty");

    scoreBreakdown.ageTeenSuitability = ageSuitabilityScore(candidate, profile);
    scoreBreakdown.sourceQualityRelevance = sourceQualityRelevanceScore(candidate, profile, genreMatches, positiveMatches);
    scoreBreakdown.queryRungBonus = queryRungBonus(candidate);

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
