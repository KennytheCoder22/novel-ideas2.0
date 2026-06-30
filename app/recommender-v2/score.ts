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
  const raw = (candidate.raw || {}) as Record<string, unknown>;
  const rawDescription = typeof raw.description === "string"
    ? raw.description
    : typeof (raw.description as { value?: unknown } | undefined)?.value === "string"
      ? String((raw.description as { value: string }).value)
      : "";
  const firstSentence = Array.isArray(raw.first_sentence) ? raw.first_sentence.map(String).join(" ") : typeof raw.first_sentence === "string" ? raw.first_sentence : "";
  const rawSubjects = [raw.subject, raw.subjects, raw.subject_facet]
    .flatMap((value) => Array.isArray(value) ? value.map(String) : typeof value === "string" ? [value] : []);
  return [
    candidate.title,
    candidate.subtitle,
    candidate.description,
    rawDescription,
    firstSentence,
    ...rawSubjects,
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

function signalPresentInText(text: string, value: string): boolean {
  if (!value) return false;
  if (text.includes(value)) return true;
  const variants: Record<string, RegExp> = {
    adventure: /\b(adventures?|quest|quests|journeys?|explor(?:e|es|ing|ation)|survival|expedition)\b/,
    comedy: /\b(comedy|comic|humou?r|funny|jokes?|laughs?|giggles?|silly|playful)\b/,
    funny: /\b(comedy|comic|humou?r|funny|jokes?|laughs?|giggles?|silly|playful)\b/,
    playful: /\b(playful|silly|funny|humou?r|comic|comedy|laughs?|giggles?|quirky|weird)\b/,
    weird: /\b(weird|quirky|strange|unusual|odd|offbeat|playful|silly)\b/,
    family: /\b(family|families|parents?|siblings?|mother|father|grandparents?|cousins?|home)\b/,
    friendship: /\b(friendship|friends?|classmates?|team|companions?|allies)\b/,
    friends: /\b(friendship|friends?|classmates?|team|companions?|allies)\b/,
    heroic: /\b(heroic|heroes|hero|heroine|champions?|brave|courage)\b/,
    hero: /\b(heroic|heroes|hero|heroine|champions?|brave|courage)\b/,
    fantasy: /\b(fantasy|magic|magical|wizard|witch|witches|fairy|fairies|dragon|dragons|kingdom|spell|spells|enchanted|enchantment)\b/,
    magic: /\b(fantasy|magic|magical|wizard|witch|witches|fairy|fairies|spell|spells|enchanted|enchantment)\b/,
    mythology: /\b(mythology|mythological|myths?|legends?|gods?|goddesses|demigods?)\b/,
    myth: /\b(mythology|mythological|myths?|legends?|gods?|goddesses|demigods?)\b/,
    dragon: /\b(dragons?|dragonriders?)\b/,
    school: /\b(school|classroom|classmates?|students?|teachers?|public school|middle school)\b/,
    superhero: /\b(superheroes?|super hero|powers?|cape|masked hero)\b/,
    ocean: /\b(ocean|sea|marine|island|underwater|coast|beach)\b/,
    science: /\b(science|scientist|scientists|experiments?|technology|inventions?|robots?|robotics|engineering|laboratory|lab)\b/,
    nonfiction: /\b(nonfiction|non fiction|facts?|science|experiments?|activities|guide|history|biography)\b/,
    concise: /\b(short|brief|concise|quick|guide|facts?|introduction|summary)\b/,
    robot: /\b(robots?|robotics|androids?|automatons?|artificial intelligence|ai)\b/,
    survival: /\b(survival|survive|survives|wilderness|wild|forest|island|stranded)\b/,
    animal: /\b(animals?|wildlife|creatures?|dog|cat|squirrel|squirrels|wolf|wolves|horse|horses)\b/,
    animals: /\b(animals?|wildlife|creatures?|dog|cat|squirrel|squirrels|wolf|wolves|horse|horses)\b/,
    community: /\b(community|neighbors?|neighbourhood|neighborhood|town|village|team|club)\b/,
  };
  return Boolean(variants[value]?.test(text));
}

function signalMatches(text: string, signals: WeightedSignalV2[]): WeightedSignalV2[] {
  return signals.filter((signal) => {
    const value = normalized(signal.value);
    return signalPresentInText(text, value);
  });
}

const BROAD_AVOID_SIGNAL = /^(book|books|novel|novels|fiction|story|stories|teen|teens|young adult|ya|series|fantasy|dystopia|dystopian|adventure|romance|drama|comedy|mystery)$/i;
const MIDDLE_GRADES_GENERIC_TASTE_SIGNAL = /^(book|books|preteens? book|preteens? books|children|childrens?|children s|children'?s|middle grade|middle grades|fiction|novel|novels|story|stories|series)$/i;

function isMiddleGradesGenericTasteSignal(signal: WeightedSignalV2): boolean {
  return MIDDLE_GRADES_GENERIC_TASTE_SIGNAL.test(normalized(signal.value));
}

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
  const text = candidateMetadataText(candidate);
  if (profile.ageBand === "adult") {
    if (/\b(juvenile fiction|children'?s books?|easy readers?|middle grade|rainbow magic)\b/.test(text)) return -2;
    return 0.5;
  }
  if (profile.ageBand !== "teens") return 0.25;
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
  const metadataText = candidateMetadataText(candidate);
  const text = profile.ageBand === "preteens" && candidate.source === "openLibrary" ? metadataText : candidateText(candidate);
  const normalizedTitle = normalized(candidate.title);
  const raw = (candidate.raw || {}) as Record<string, unknown>;
  const metadataCount = candidate.genres.length + candidate.themes.length;
  const authorCount = candidate.creators.length;
  const uniqueSubjectCount = new Set([...candidate.genres, ...candidate.themes].map(normalized)).size;
  const titleWordCount = normalizedTitle.split(" ").filter(Boolean).length;
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
  if (metadataCount >= 14 && candidate.creators.length > 0 && strongGenreMetadata) score += 0.3;
  if (profile.ageBand === "adult" && authorCount === 1 && uniqueSubjectCount >= 8 && strongGenreMetadata) score += 0.35;
  if (profile.ageBand === "adult" && titleWordCount >= 2 && titleWordCount <= 6 && uniqueSubjectCount >= 6) score += 0.25;
  if (profile.ageBand === "adult" && titleWordCount >= 10 && !strongGenreMetadata) score -= 0.7;
  if (profile.ageBand === "adult" && authorCount === 0) score -= 0.5;
  if (metadataCount <= 2) score -= 1.25;
  if (metadataCount <= 5 && !strongGenreMetadata) score -= 0.8;
  if (metadataCount <= 6 && !strongTeenMetadata) score -= 0.45;
  if (genreMatches.length > 0) score += 0.7 + Math.min(0.35, genreMatches.length * 0.08);
  if (positiveMatches.length > 0) score += 0.4 + Math.min(0.3, positiveMatches.length * 0.06);
  if (strongTeenMetadata) score += 0.25;
  if (normalizedTitle.split(" ").length >= 3 && strongGenreMetadata) score += 0.15;
  if (normalizedTitle.split(" ").length <= 2 && !strongTeenMetadata && !strongGenreMetadata) score -= 0.7;
  if (/^(deception|departures|the departures|end is here|the end is here|refigurations of freedom|tell freedom i said hello|facility|fang)$/.test(normalizedTitle) && metadataCount < 12) score -= 2.8;
  if (profile.ageBand === "teens" && /\b(my secret garden|sexual fantasies|women\s+sexual fantasies)\b/.test(text)) score -= 8;
  if (metadataCount <= 4 && !strongTeenMetadata && !strongGenreMetadata) score -= 1.2;
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
  if (profile.ageBand === "adult" && /\b(corpus of ancient near eastern seals|archaeological catalog|museum collections?|crime and punishment notes|the poet and the murderer|mystery in the mainstream|study notes?|notes on|book notes?|study aids?|companions? to|criticism|critical essays?|literary history|bibliograph(?:y|ies)|true crime nonfiction|wizardry and wild romance|king of flesh and bone|married to a pirate|pirate romance|dark romance|dark romantasy|monster romance|reverse harem|writing guide|horror criticism|genre history)\b/.test(text)) score -= 5;
  if (profile.ageBand === "adult" && metadataCount <= 5 && !strongGenreMetadata) score -= 0.6;
  if (/^[A-Z0-9\s:;,'!?.-]{12,}$/.test(candidate.title) && candidate.title !== candidate.title.toLowerCase()) score -= 1.25;
  if (/^[A-Z][a-z]+\s+[A-Z][a-z]+$/.test(candidate.title) && metadataCount <= 2) score -= 1.5;
  if (genreMatches.length === 0 && positiveMatches.length === 0) score -= 1.5;
  return score;
}

export function scoreCandidates(candidates: NormalizedCandidate[], profile: TasteProfile): ScoredCandidate[] {
  return candidates.map((candidate) => {
    const fullText = candidateText(candidate);
    const metadataText = candidateMetadataText(candidate);
    const text = profile.ageBand === "preteens" && candidate.source === "openLibrary" ? metadataText : fullText;
    const matchedSignals: string[] = [];
    const scoreBreakdown: Record<string, number> = { base: 1 };

    const middleGradesOpenLibrary = profile.ageBand === "preteens" && candidate.source === "openLibrary";
    const rawGenreMatches = signalMatches(text, profile.genreFamily);
    const rawThemeMatches = signalMatches(text, profile.themes);
    const rawToneMatches = signalMatches(text, profile.tone);
    const rawCharacterMatches = signalMatches(text, profile.characterDynamics);
    const rawFormatMatches = signalMatches(text, profile.formatPreference);
    const filterGenericMatches = (matches: WeightedSignalV2[]) => middleGradesOpenLibrary ? matches.filter((signal) => !isMiddleGradesGenericTasteSignal(signal)) : matches;
    const removedGenericTasteSignals = middleGradesOpenLibrary
      ? [...rawGenreMatches, ...rawThemeMatches, ...rawToneMatches, ...rawCharacterMatches, ...rawFormatMatches]
        .filter(isMiddleGradesGenericTasteSignal)
        .map((signal) => signal.value)
      : [];
    const genreMatches = filterGenericMatches(rawGenreMatches);
    const themeMatches = filterGenericMatches(rawThemeMatches);
    const toneMatches = filterGenericMatches(rawToneMatches);
    const characterMatches = filterGenericMatches(rawCharacterMatches);
    const formatMatches = filterGenericMatches(rawFormatMatches);
    const avoidMatches = signalMatches(text, profile.avoidSignals);
    const positiveMatches = [...themeMatches, ...toneMatches, ...characterMatches, ...formatMatches];
    const fullPositiveMatches = [...signalMatches(fullText, profile.themes), ...signalMatches(fullText, profile.tone), ...signalMatches(fullText, profile.characterDynamics), ...signalMatches(fullText, profile.formatPreference)];
    const rawTasteMatchCount = rawGenreMatches.length + rawThemeMatches.length + rawToneMatches.length + rawCharacterMatches.length + rawFormatMatches.length;
    const genericOnlyTasteMatch = middleGradesOpenLibrary && rawTasteMatchCount > 0 && genreMatches.length + positiveMatches.length === 0;
    const removedQueryTextSignals = middleGradesOpenLibrary
      ? [...signalMatches(fullText, profile.genreFamily), ...fullPositiveMatches]
        .filter((signal) => ![...genreMatches, ...positiveMatches].some((kept) => normalized(kept.value) === normalized(signal.value)))
        .filter((signal) => !isMiddleGradesGenericTasteSignal(signal))
        .map((signal) => signal.value)
      : [];

    addSignalBucket(genreMatches, 3, matchedSignals, scoreBreakdown, "genreFacetMatch");
    addSignalBucket(themeMatches, 1.7, matchedSignals, scoreBreakdown, "positiveTasteMatch");
    addSignalBucket(toneMatches, 1.2, matchedSignals, scoreBreakdown, "positiveTasteMatch");
    addSignalBucket(characterMatches, 1.7, matchedSignals, scoreBreakdown, "positiveTasteMatch");
    addSignalBucket(formatMatches, 0.8, matchedSignals, scoreBreakdown, "positiveTasteMatch");
    addAvoidSignalBucket(avoidMatches, matchedSignals, scoreBreakdown);

    const suitabilityScore = ageSuitabilityScore(candidate, profile);
    scoreBreakdown.ageTeenSuitability = suitabilityScore;
    scoreBreakdown.ageBandSuitability = suitabilityScore;
    scoreBreakdown.sourceQualityRelevance = sourceQualityRelevanceScore(candidate, profile, genreMatches, positiveMatches);
    scoreBreakdown.queryRungBonus = queryRungBonus(candidate);
    if (genericOnlyTasteMatch) scoreBreakdown.genericOnlyTasteMatchPenalty = -0.9;

    const score = Object.entries(scoreBreakdown).reduce((sum, [key, value]) => sum + (key === "ageBandSuitability" ? 0 : Number(value || 0)), 0);
    return {
      ...candidate,
      score,
      matchedSignals,
      rejectedReasons: [],
      scoreBreakdown,
      diagnostics: {
        ...candidate.diagnostics,
        queryTextSignalsRemovedFromTasteMatch: removedQueryTextSignals,
        documentOnlyTasteMatch: [...genreMatches, ...positiveMatches].map((signal) => signal.value),
        genericTasteSignalsRemoved: Array.from(new Set(removedGenericTasteSignals)),
        genericOnlyTasteMatch,
        documentBackedTasteSignals: [...genreMatches, ...positiveMatches].map((signal) => signal.value),
      },
    };
  }).sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
}
