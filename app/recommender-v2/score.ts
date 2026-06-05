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

function candidateMetadataText(candidate: NormalizedCandidate): string {
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
  ].join(" ").toLowerCase();
}

function hasStrongTeenMetadata(text: string): boolean {
  return /\b(young adult|juvenile fiction|teen|adolescent|high school|coming of age)\b/.test(text);
}

function hasStrongGenreMetadata(text: string): boolean {
  return /\b(dystopian|dystopia|science fiction|horror|thriller|mystery|historical fiction|fantasy|paranormal|survival|adventure)\b/.test(text);
}

function signalMatches(text: string, signals: WeightedSignalV2[]): WeightedSignalV2[] {
  return signals.filter((signal) => {
    const value = normalized(signal.value);
    return Boolean(value && text.includes(value));
  });
}

const BROAD_AVOID_SIGNAL = /^(book|books|novel|novels|fiction|story|stories|teen|teens|young adult|ya|series|fantasy|dystopia|dystopian|adventure|romance|drama|comedy|mystery)$/i;

function addAvoidSignalBucket(matches: WeightedSignalV2[], matched: string[], breakdown: Record<string, number>): void {
  let broadPenalty = 0;
  let precisePenalty = 0;
  for (const signal of matches) {
    const value = normalized(signal.value);
    if (!value) continue;
    if (BROAD_AVOID_SIGNAL.test(value)) {
      broadPenalty -= Math.min(0.8, Math.max(0.2, Math.abs(signal.weight) * 0.35));
      matched.push(`avoidSignalPenalty:broad:${signal.value}`);
    } else {
      precisePenalty -= Math.min(4, Math.max(1, Math.abs(signal.weight) * 2.25));
      matched.push(`avoidSignalPenalty:precise:${signal.value}`);
    }
  }
  if (broadPenalty) breakdown.broadAvoidSignalPenalty = Number(breakdown.broadAvoidSignalPenalty || 0) + Math.max(-1.6, broadPenalty);
  if (precisePenalty) breakdown.avoidSignalPenalty = Number(breakdown.avoidSignalPenalty || 0) + precisePenalty;
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
  const text = candidateMetadataText(candidate);
  const normalizedTitle = normalized(candidate.title);
  if (/\b(lolita|nabokov|erotic|erotica|pornography|incest|sexual abuse)\b/.test(text)) return -6;
  if (/\b(demoness|vixen|seductress|sensual|forbidden desire|dark lover|new adult|adult romance|college romance|bret easton ellis|the informers|icebreaker|midnight fantasies|blaze|harlequin|silhouette desire)\b/.test(text)) return -4.5;
  if (/^(the clown hunt|clown hunt|pope|phantoms)$/.test(normalizedTitle) && !hasStrongTeenMetadata(text)) return -2.5;
  if (hasStrongTeenMetadata(text)) return 1;
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
  let score = Math.min(1, matches.length * 0.25);
  if (/^(young adult fantasy|fantasy|mystery novel)$/i.test(query.trim()) && matches.length <= 1) score -= 0.6;
  return score;
}

function sourceQualityRelevanceScore(candidate: NormalizedCandidate, profile: TasteProfile, genreMatches: WeightedSignalV2[], positiveMatches: WeightedSignalV2[]): number {
  const text = candidateText(candidate);
  const metadataText = candidateMetadataText(candidate);
  const normalizedTitle = normalized(candidate.title);
  const raw = (candidate.raw || {}) as Record<string, unknown>;
  const metadataCount = candidate.genres.length + candidate.themes.length;
  const strongTeenMetadata = hasStrongTeenMetadata(metadataText);
  const strongGenreMetadata = hasStrongGenreMetadata(metadataText);
  let score = querySpecificityScore(candidate);
  if (candidate.creators.length > 0) score += 0.4;
  else score -= 1;
  if (candidate.sourceUrl) score += 0.2;
  if (candidate.sourceId) score += 0.2;
  if (candidate.publicationYear && candidate.publicationYear >= 1950) score += 0.25;
  if (raw.cover_i) score += 0.15;
  if (metadataCount >= 8 && candidate.creators.length > 0 && candidate.sourceId) score += 0.75;
  if (metadataCount >= 12) score += 0.2;
  if (metadataCount >= 16) score += 0.15;
  if (metadataCount >= 10 && strongTeenMetadata && strongGenreMetadata) score += 0.45;
  if (metadataCount <= 2) score -= 1.25;
  if (metadataCount <= 5 && !strongGenreMetadata) score -= 0.8;
  if (genreMatches.length > 0) score += 0.7 + Math.min(0.35, genreMatches.length * 0.08);
  if (positiveMatches.length > 0) score += 0.4 + Math.min(0.3, positiveMatches.length * 0.06);
  if (strongTeenMetadata) score += 0.25;
  if (normalizedTitle.split(" ").length <= 2 && !strongTeenMetadata && !strongGenreMetadata) score -= 0.7;
  if (/^(deception|departures|the departures|end is here|the end is here)$/.test(normalizedTitle) && metadataCount < 12) score -= 2.4;
  if (/^(the clown hunt|clown hunt|pope|phantoms)$/.test(normalizedTitle) && profile.ageBand === "teens" && !strongTeenMetadata) score -= 3.2;
  if (/\b(survival guide|survival handbook|survival manual|field guide|handbook|choose your own adventure|mountain survival|star trek survival|kane chronicles survival guide|survival of the richest|cultural survival|survival culture|survival skills?)\b/.test(text) && !strongTeenMetadata) score -= 5;
  if (profile.ageBand === "teens" && /\b(king of flesh and bone|married to a pirate|flesh and bone|dark romance|dark romantasy|monster romance|alien sex|alien romance|alien lover|pirate romance|captive bride|reverse harem|why choose|possessive alpha|mafia romance)\b/.test(text) && !strongTeenMetadata) score -= 5;
  if (/\b(library programs? for teens|library programming|programs? for teens|teen programs?|genre guide|curriculum|classroom|lesson plans?|activity book|activities for teens|teacher'?s? guide|study guide|reader'?s? advisory|book lists? for teens|guides?[^.]{0,40}for teens|for teens[^.]{0,40}(guides?|nonfiction|curriculum|programming|activities))\b/.test(text)) score -= 6;
  if (/\b(echoes and ashes|raven'?s sight|max porter)\b/.test(text)) score -= 1.4;
  if (/\b(coloring|colouring|workbook|worksheet|activity book|teacher'?s? guide|study guide)\b/.test(text)) score -= 4;
  if (/\b(playing with fantasy|fantasy drama book)\b/.test(text)) score -= 3;
  if (/\bgo to hell\b/.test(text) && !/\b(young adult|juvenile fiction|teen|adolescent|dystopian|science fiction|fantasy|horror|mystery|thriller|adventure)\b/.test(text)) score -= 4;
  if (/\bdrunk\b/.test(text) && genreMatches.length === 0) score -= 2.5;
  if (profile.ageBand === "teens" && /\b(demoness|vixen|seductress|sensual|new adult|adult romance|college romance|bret easton ellis|the informers|icebreaker|midnight fantasies|blaze|harlequin|silhouette desire)\b/.test(text)) score -= 2.5;
  if (/^[A-Z0-9\s:;,'!?.-]{12,}$/.test(candidate.title) && candidate.title !== candidate.title.toLowerCase()) score -= 1.25;
  if (/^[A-Z][a-z]+\s+[A-Z][a-z]+$/.test(candidate.title) && metadataCount <= 2) score -= 1.5;
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
    addAvoidSignalBucket(avoidMatches, matchedSignals, scoreBreakdown);

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
