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


function rawTextParts(candidate: NormalizedCandidate): { description: string; firstSentence: string; subjects: string } {
  const raw = (candidate.raw || {}) as Record<string, unknown>;
  const rawDescription = typeof raw.description === "string"
    ? raw.description
    : typeof (raw.description as { value?: unknown } | undefined)?.value === "string"
      ? String((raw.description as { value: string }).value)
      : "";
  const firstSentence = Array.isArray(raw.first_sentence) ? raw.first_sentence.map(String).join(" ") : typeof raw.first_sentence === "string" ? raw.first_sentence : "";
  const rawSubjects = [raw.subject, raw.subjects, raw.subject_facet, raw.subject_key]
    .flatMap((value) => Array.isArray(value) ? value.map(String) : typeof value === "string" ? [value] : []);
  return {
    description: [candidate.description, rawDescription].filter(Boolean).join(" ").toLowerCase(),
    firstSentence: firstSentence.toLowerCase(),
    subjects: rawSubjects.join(" ").toLowerCase(),
  };
}

function kidsNarrativeSemanticEvidence(candidate: NormalizedCandidate, matches: WeightedSignalV2[]): { score: number; signals: string[] } {
  const parts = rawTextParts(candidate);
  const narrativeText = [parts.description, parts.firstSentence].join(" ");
  const subjectsText = parts.subjects;
  const signals = new Set<string>();
  let score = 0;
  for (const signal of matches) {
    const value = normalized(signal.value);
    if (!value || isKidsGenericTasteSignal(signal)) continue;
    if (signalPresentInText(narrativeText, value)) {
      signals.add(signal.value);
      score += 1.5;
    } else if (signalPresentInText(subjectsText, value)) {
      signals.add(signal.value);
      score += 0.2;
    }
  }
  if (/\b(story|stories|tale|tales|adventure|journey|friendship|friends?|silly|funny|laugh|imagin|wonder|character|characters|monster|magic|school|family|community)\b/.test(narrativeText)) score += 0.8;
  return { score: Math.min(5.5, Math.round(score * 1000) / 1000), signals: [...signals] };
}

function candidateMetadataText(candidate: NormalizedCandidate): string {
  const { description: rawDescription, firstSentence, subjects } = rawTextParts(candidate);
  const rawSubjects = subjects ? [subjects] : [];
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

type MetadataSignalField = {
  field: string;
  text: string;
};

type SemanticSignalFieldInput = {
  field: string;
  values: string[];
};

type AdultGoogleBooksSignalMatchTrace = {
  signal: string;
  normalizedSignal: string;
  field: string;
  matchedText: string;
  method: string;
  signalBucket: string;
  accepted: boolean;
  reason?: string;
};

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function semanticSignalMatchedFieldsByField(
  fields: SemanticSignalFieldInput[],
  signal: string,
  options?: { normalizeSignal?: boolean; normalizeFieldText?: boolean },
): string[] {
  const normalizeSignal = options?.normalizeSignal !== false;
  const normalizeFieldText = options?.normalizeFieldText !== false;
  const value = normalizeSignal ? normalized(signal) : String(signal || "");
  if (!value) return [];
  const matched: string[] = [];
  for (const field of fields) {
    const values = Array.isArray(field.values) ? field.values : [];
    if (values.some((entry) => {
      const text = normalizeFieldText ? String(entry || "").toLowerCase() : String(entry || "");
      return signalPresentInText(text, value);
    })) matched.push(field.field);
  }
  return matched;
}

function candidateMetadataFields(candidate: NormalizedCandidate): MetadataSignalField[] {
  const { description: rawDescription, firstSentence, subjects } = rawTextParts(candidate);
  const fields: MetadataSignalField[] = [
    { field: "title", text: candidate.title },
    { field: "subtitle", text: candidate.subtitle || "" },
    { field: "description", text: candidate.description || "" },
    { field: "rawDescription", text: rawDescription },
    { field: "firstSentence", text: firstSentence },
    { field: "subjects", text: subjects },
    { field: "creators", text: candidate.creators.join(" ") },
    { field: "genres", text: candidate.genres.join(" ") },
    { field: "themes", text: candidate.themes.join(" ") },
    { field: "tones", text: candidate.tones.join(" ") },
    { field: "characterDynamics", text: candidate.characterDynamics.join(" ") },
    { field: "formats", text: candidate.formats.join(" ") },
  ];
  return fields
    .map((entry) => ({ field: entry.field, text: String(entry.text || "") }))
    .filter((entry) => entry.text.trim().length > 0);
}

function shortSignalAliasMatches(signal: string, text: string): { matchedText: string; method: string } | undefined {
  const patterns: Record<string, Array<{ pattern: RegExp; method: string }>> = {
    ai: [
      { pattern: /(^|[^\p{L}\p{N}])(artificial\s+intelligence)(?=$|[^\p{L}\p{N}])/iu, method: "approved_alias_phrase" },
      { pattern: /(^|[^\p{L}\p{N}])(a\s*\.?\s*i\.?)(?=$|[^\p{L}\p{N}])/iu, method: "punctuated_acronym_token" },
    ],
    rpg: [
      { pattern: /(^|[^\p{L}\p{N}])(role[-\s]?playing\s+game)(?=$|[^\p{L}\p{N}])/iu, method: "approved_alias_phrase" },
    ],
    tv: [
      { pattern: /(^|[^\p{L}\p{N}])(television)(?=$|[^\p{L}\p{N}])/iu, method: "approved_alias_phrase" },
    ],
  };
  for (const { pattern, method } of patterns[signal] || []) {
    const match = pattern.exec(text);
    if (match?.[2]) return { matchedText: match[2], method };
  }
  return undefined;
}

function shortSignalTokenMatch(signal: string, text: string): string | undefined {
  const pattern = new RegExp(`(^|[^\\p{L}\\p{N}])(${escapeRegExp(signal)})(?=$|[^\\p{L}\\p{N}])`, "iu");
  const match = pattern.exec(text);
  return match?.[2];
}

function shortSignalEmbeddedMatches(signal: string, text: string): string[] {
  const pattern = new RegExp(`[\\p{L}\\p{N}]*${escapeRegExp(signal)}[\\p{L}\\p{N}]*`, "giu");
  const matches: string[] = [];
  for (const match of text.matchAll(pattern)) {
    const token = String(match[0] || "");
    if (!token) continue;
    const acceptedToken = shortSignalTokenMatch(signal, token);
    if (normalized(token) === signal || normalized(acceptedToken) === signal) continue;
    matches.push(token);
  }
  return uniqueStrings(matches).slice(0, 5);
}

function adultGoogleBooksSignalMatch(
  combinedText: string,
  fields: MetadataSignalField[],
  signal: WeightedSignalV2,
  signalBucket: string,
  trace: AdultGoogleBooksSignalMatchTrace[],
): boolean {
  const value = normalized(signal.value);
  if (!value) return false;
  const isShortSignal = value.length <= 3;

  if (!isShortSignal) {
    if (!signalPresentInText(combinedText, value)) return false;
    const matchedFields = semanticSignalMatchedFieldsByField(
      fields.map((field) => ({ field: field.field, values: [field.text] })),
      value,
      { normalizeSignal: false, normalizeFieldText: true },
    );
    const matchedField = matchedFields[0];
    trace.push({
      signal: signal.value,
      normalizedSignal: value,
      field: matchedField || "combinedMetadata",
      matchedText: value,
      method: "existing_semantic_match",
      signalBucket,
      accepted: true,
    });
    return true;
  }

  for (const field of fields) {
    const fieldText = field.text;
    const tokenMatch = shortSignalTokenMatch(value, fieldText);
    if (tokenMatch) {
      trace.push({
        signal: signal.value,
        normalizedSignal: value,
        field: field.field,
        matchedText: tokenMatch,
        method: "unicode_token_boundary",
        signalBucket,
        accepted: true,
      });
      return true;
    }
    const aliasMatch = shortSignalAliasMatches(value, fieldText);
    if (aliasMatch) {
      trace.push({
        signal: signal.value,
        normalizedSignal: value,
        field: field.field,
        matchedText: aliasMatch.matchedText,
        method: aliasMatch.method,
        signalBucket,
        accepted: true,
      });
      return true;
    }
  }

  for (const field of fields) {
    for (const embedded of shortSignalEmbeddedMatches(value, field.text)) {
      trace.push({
        signal: signal.value,
        normalizedSignal: value,
        field: field.field,
        matchedText: embedded,
        method: "rejected_embedded_substring",
        signalBucket,
        accepted: false,
        reason: "short_signal_requires_token_boundary_or_approved_alias",
      });
    }
  }
  return false;
}

function adultGoogleBooksSignalMatches(
  combinedText: string,
  fields: MetadataSignalField[],
  signals: WeightedSignalV2[],
  signalBucket: string,
  trace: AdultGoogleBooksSignalMatchTrace[],
): WeightedSignalV2[] {
  return signals.filter((signal) => adultGoogleBooksSignalMatch(combinedText, fields, signal, signalBucket, trace));
}

function adultGoogleBooksTraceBySignal(
  trace: AdultGoogleBooksSignalMatchTrace[],
  key: keyof Pick<AdultGoogleBooksSignalMatchTrace, "field" | "matchedText" | "method">,
): Record<string, string[]> {
  return trace
    .filter((entry) => entry.accepted)
    .reduce<Record<string, string[]>>((acc, entry) => {
      const signal = entry.normalizedSignal || normalized(entry.signal);
      const value = String(entry[key] || "");
      if (!signal || !value) return acc;
      acc[signal] = uniqueStrings([...(acc[signal] || []), value]);
      return acc;
    }, {});
}

function hasStrongTeenMetadata(text: string): boolean {
  return /\b(young adult|juvenile fiction|teen|adolescent|high school|coming of age)\b/.test(text);
}

function hasStrongGenreMetadata(text: string): boolean {
  return /\b(dystopian|dystopia|science fiction|horror|thriller|mystery|historical fiction|fantasy|paranormal|survival|adventure)\b/.test(text);
}

function hasMainstreamFictionPublisher(text: string): boolean {
  return /\b(penguin|random house|knopf|doubleday|viking|harper|macmillan|tor|simon\s*&?\s*schuster|hachette|st\.? martin|ballantine|minotaur|mysterious press|little brown|grand central|sourcebooks|kensington|crooked lane|berkley|delacorte|del rey|orbit|ace|roc|anchor|scribner|atria|william morrow|putnam|mulholland|flatiron)\b/.test(text);
}

function adultGoogleBooksNarrativeEvidence(candidate: NormalizedCandidate): { score: number; signals: string[] } {
  if (candidate.source !== "googleBooks") return { score: 0, signals: [] };
  const raw = (candidate.raw || {}) as Record<string, unknown>;
  const publisherText = normalized(String(raw.publisher || ""));
  const categoryText = normalized(candidate.genres.join(" "));
  const descriptionText = normalized(candidate.description || "");
  const titleText = normalized([candidate.title, candidate.subtitle].filter(Boolean).join(" "));
  const signals: string[] = [];
  let score = 0;

  const fictionCategory = /\b(fiction|novel|stories|detective and mystery|mystery|thriller|fantasy|science fiction|historical fiction|romance fiction|horror tales|adventure stories|speculative)\b/.test(categoryText);
  const novelDescriptor = /\b(novel|fiction|thriller|mystery|fantasy|romance|science fiction|historical fiction|horror|saga)\b/.test(`${titleText} ${descriptionText}`);
  const narrativeSummary = descriptionText.length >= 80
    && /\b(follows|story of|tells the story|centers on|must survive|must uncover|must confront|must choose|must save|when\b|after\b|before\b|protagonist|heroine|hero|detective|character|characters|sisters?|brothers?|family saga)\b/.test(descriptionText);
  const fictionPublisher = hasMainstreamFictionPublisher(publisherText);
  const artifactShape = /\b(writer'?s market|writers'? handbook|guide to literary agents|catalog(?:ue)?|bibliograph(?:y|ies)|literary criticism|study guide|teacher'?s guide|conference proceedings?|government reports?|directory|textbook|reference|handbook|manual)\b/.test(`${titleText} ${categoryText} ${descriptionText}`);
  const nonNarrativeCategory = /\b(nonfiction|non-fiction|biography|autobiography|memoir|essays?|history|philosophy|reference|business|language arts|education|study aids?|travel|self-help|psychology|political science|social science|science|medical|technology|computers?)\b/.test(categoryText)
    && !/\b(true crime|narrative nonfiction)\b/.test(categoryText);

  if (fictionCategory) {
    score += 1.2;
    signals.push("fictionCategory");
  }
  if (novelDescriptor) {
    score += 0.65;
    signals.push("novelDescriptor");
  }
  if (narrativeSummary) {
    score += 0.9;
    signals.push("narrativeSummary");
  }
  if (fictionPublisher) {
    score += 0.35;
    signals.push("fictionPublisher");
  }
  if (candidate.publicationYear && candidate.publicationYear >= 1980) {
    score += 0.15;
    signals.push("modernPublication");
  }
  if (artifactShape && !(fictionCategory || narrativeSummary)) {
    score -= 5;
    signals.push("artifactShape");
  }
  if (nonNarrativeCategory && !(fictionCategory || narrativeSummary)) {
    score -= 3.5;
    signals.push("nonNarrativeCategory");
  }
  return { score, signals };
}

export function signalPresentInText(text: string, value: string): boolean {
  if (!value) return false;
  if (text.includes(value)) return true;
  const hasAdventure = /\b(adventures?|quest|quests|journeys?|explor(?:e|es|ing|ation)|survival|expedition)\b/.test(text);
  const hasFamily = /\b(family|families|parents?|siblings?|mother|father|grandparents?|cousins?|home)\b/.test(text);
  const hasMystery = /\b(mystery|mysteries|detective|clue|clues|case|cases|secret|secrets|puzzle|puzzles|investigat(?:e|es|ion|ions))\b/.test(text);
  const hasScienceFiction = /\b(science fiction|sci fi|sci-fi|space|robot|robots?|robotics|androids?|technology|inventions?|laboratory|lab|experiment|experiments?|scientist|scientists)\b/.test(text);
  const hasSuperhero = /\b(superheroes?|super hero|superpowered|super-powered|powers?|cape|masked hero|masked heroes)\b/.test(text);
  const hasSchool = /\b(school|classroom|classmates?|students?|teachers?|middle school)\b/.test(text);
  const hasOcean = /\b(ocean|sea|marine|island|underwater|coast|beach)\b/.test(text);
  const hasSurvival = /\b(survival|survive|survives|wilderness|wild|forest|island|stranded)\b/.test(text);
  if (/\b(family adventure|adventure family)\b/.test(value)) return hasFamily && hasAdventure;
  if (/\b(mystery adventure|adventure mystery)\b/.test(value)) return hasMystery && hasAdventure;
  if (/\b(science fiction adventure|science adventure|sci fi adventure|sci-fi adventure|robot adventure)\b/.test(value)) return hasScienceFiction && hasAdventure;
  if (/\b(superhero adventure|super hero adventure)\b/.test(value)) return hasSuperhero && hasAdventure;
  if (/\b(school mystery|mystery school)\b/.test(value)) return hasSchool && hasMystery;
  if (/\b(ocean adventure|adventure ocean|sea adventure|island adventure)\b/.test(value)) return hasOcean && hasAdventure;
  if (/\b(survival adventure|adventure survival)\b/.test(value)) return hasSurvival && hasAdventure;
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
    superhero: /\b(superheroes?|super hero|superpowered|super-powered|powers?|cape|masked hero|masked heroes)\b/,
    mystery: /\b(mystery|mysteries|detective|clue|clues|case|cases|secret|secrets|puzzle|puzzles|investigat(?:e|es|ion|ions))\b/,
    ocean: /\b(ocean|sea|marine|island|underwater|coast|beach)\b/,
    "science fiction": /\b(science fiction|sci fi|sci-fi|space|robot|robots?|robotics|androids?|technology|inventions?|laboratory|lab|experiment|experiments?|scientist|scientists)\b/,
    "sci fi": /\b(science fiction|sci fi|sci-fi|space|robot|robots?|robotics|androids?|technology|inventions?|laboratory|lab|experiment|experiments?|scientist|scientists)\b/,
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


function isKidsGenericTasteSignal(signal: WeightedSignalV2): boolean {
  const value = normalized(signal.value);
  return /^(?:animal|animals|picture|pictures|picture book|picture books|children|childrens|book|books|story|stories|juvenile fiction|juvenile literature|fiction|adventure)$/.test(value);
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

export function ageSuitabilityScore(candidate: NormalizedCandidate, profile: TasteProfile): number {
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
  const adultOpenLibrary = candidate.source === "openLibrary" && profile.ageBand === "adult";
  const openLibraryMetadataOnlyEvidence = candidate.source === "openLibrary"
    && (profile.ageBand === "preteens" || profile.ageBand === "teens" || profile.ageBand === "adult");
  const adultGoogleBooksMetadataOnlyEvidence = candidate.source === "googleBooks" && profile.ageBand === "adult";
  const text = openLibraryMetadataOnlyEvidence || adultGoogleBooksMetadataOnlyEvidence ? metadataText : candidateText(candidate);
  const normalizedTitle = normalized(candidate.title);
  const raw = (candidate.raw || {}) as Record<string, unknown>;
  const metadataCount = candidate.genres.length + candidate.themes.length;
  const authorCount = candidate.creators.length;
  const uniqueSubjectCount = new Set([...candidate.genres, ...candidate.themes].map(normalized)).size;
  const titleWordCount = normalizedTitle.split(" ").filter(Boolean).length;
  const strongTeenMetadata = hasStrongTeenMetadata(metadataText);
  const strongGenreMetadata = hasStrongGenreMetadata(metadataText);
  let score = adultOpenLibrary ? 0 : querySpecificityScore(candidate);
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
    const matchedSignals: string[] = [];
    const scoreBreakdown: Record<string, number> = { base: 1 };

    const middleGradesOpenLibrary = profile.ageBand === "preteens" && candidate.source === "openLibrary";
    const kidsOpenLibrary = profile.ageBand === "kids" && candidate.source === "openLibrary";
    const teenOpenLibrary = profile.ageBand === "teens" && candidate.source === "openLibrary";
    const adultOpenLibrary = profile.ageBand === "adult" && candidate.source === "openLibrary";
    const adultGoogleBooks = profile.ageBand === "adult" && candidate.source === "googleBooks";
    const metadataOnlyEvidence = middleGradesOpenLibrary || kidsOpenLibrary || teenOpenLibrary || adultOpenLibrary || adultGoogleBooks;
    const text = metadataOnlyEvidence ? metadataText : fullText;
    const adultGoogleBooksFields = adultGoogleBooks ? candidateMetadataFields(candidate) : [];
    const adultGoogleBooksSignalTrace: AdultGoogleBooksSignalMatchTrace[] = [];
    const matchSignals = (signals: WeightedSignalV2[], signalBucket: string): WeightedSignalV2[] => adultGoogleBooks
      ? adultGoogleBooksSignalMatches(text, adultGoogleBooksFields, signals, signalBucket, adultGoogleBooksSignalTrace)
      : signalMatches(text, signals);
    const rawGenreMatches = matchSignals(profile.genreFamily, "genreFamily");
    const rawThemeMatches = matchSignals(profile.themes, "themes");
    const rawToneMatches = matchSignals(profile.tone, "tone");
    const rawCharacterMatches = matchSignals(profile.characterDynamics, "characterDynamics");
    const rawFormatMatches = matchSignals(profile.formatPreference, "formatPreference");
    const filterGenericMatches = (matches: WeightedSignalV2[]) => middleGradesOpenLibrary
      ? matches.filter((signal) => !isMiddleGradesGenericTasteSignal(signal))
      : kidsOpenLibrary
        ? matches.filter((signal) => !isKidsGenericTasteSignal(signal))
        : matches;
    const removedGenericTasteSignals = middleGradesOpenLibrary || kidsOpenLibrary
      ? [...rawGenreMatches, ...rawThemeMatches, ...rawToneMatches, ...rawCharacterMatches, ...rawFormatMatches]
        .filter((signal) => middleGradesOpenLibrary ? isMiddleGradesGenericTasteSignal(signal) : isKidsGenericTasteSignal(signal))
        .map((signal) => signal.value)
      : [];
    const genreMatches = filterGenericMatches(rawGenreMatches);
    const themeMatches = filterGenericMatches(rawThemeMatches);
    const toneMatches = filterGenericMatches(rawToneMatches);
    const characterMatches = filterGenericMatches(rawCharacterMatches);
    const formatMatches = filterGenericMatches(rawFormatMatches);
    const avoidMatches = matchSignals(profile.avoidSignals, "avoidSignals");
    const positiveMatches = [...themeMatches, ...toneMatches, ...characterMatches, ...formatMatches];
    const fullPositiveMatches = [...signalMatches(fullText, profile.themes), ...signalMatches(fullText, profile.tone), ...signalMatches(fullText, profile.characterDynamics), ...signalMatches(fullText, profile.formatPreference)];
    const rawTasteMatchCount = rawGenreMatches.length + rawThemeMatches.length + rawToneMatches.length + rawCharacterMatches.length + rawFormatMatches.length;
    const genericOnlyTasteMatch = (middleGradesOpenLibrary || kidsOpenLibrary) && rawTasteMatchCount > 0 && genreMatches.length + positiveMatches.length === 0;
    const removedQueryTextSignals = metadataOnlyEvidence
      ? [...signalMatches(fullText, profile.genreFamily), ...fullPositiveMatches]
        .filter((signal) => ![...genreMatches, ...positiveMatches].some((kept) => normalized(kept.value) === normalized(signal.value)))
        .filter((signal) => middleGradesOpenLibrary
          ? !isMiddleGradesGenericTasteSignal(signal)
          : kidsOpenLibrary
            ? !isKidsGenericTasteSignal(signal)
            : true)
        .map((signal) => signal.value)
      : [];
    const googleBooksNarrativeEvidence = adultGoogleBooks ? adultGoogleBooksNarrativeEvidence(candidate) : { score: 0, signals: [] };
    const adultGoogleBooksShortSubstringMatches = adultGoogleBooksSignalTrace
      .filter((entry) => entry.method === "rejected_embedded_substring");

    const allPositiveMatches = [...genreMatches, ...themeMatches, ...toneMatches, ...characterMatches, ...formatMatches];
    const kidsNarrativeEvidence = kidsOpenLibrary ? kidsNarrativeSemanticEvidence(candidate, allPositiveMatches) : { score: 0, signals: [] };
    addSignalBucket(genreMatches, kidsOpenLibrary ? 0.7 : 3, matchedSignals, scoreBreakdown, "genreFacetMatch");
    addSignalBucket(themeMatches, kidsOpenLibrary ? 0.45 : 1.7, matchedSignals, scoreBreakdown, "positiveTasteMatch");
    addSignalBucket(toneMatches, kidsOpenLibrary ? 0.4 : 1.2, matchedSignals, scoreBreakdown, "positiveTasteMatch");
    addSignalBucket(characterMatches, kidsOpenLibrary ? 0.8 : 1.7, matchedSignals, scoreBreakdown, "positiveTasteMatch");
    addSignalBucket(formatMatches, kidsOpenLibrary ? 0.25 : 0.8, matchedSignals, scoreBreakdown, "positiveTasteMatch");
    if (kidsNarrativeEvidence.score > 0) scoreBreakdown.narrativeSemanticEvidence = kidsNarrativeEvidence.score;
    addAvoidSignalBucket(avoidMatches, matchedSignals, scoreBreakdown);

    const suitabilityScore = ageSuitabilityScore(candidate, profile);
    scoreBreakdown.ageTeenSuitability = suitabilityScore;
    scoreBreakdown.ageBandSuitability = suitabilityScore;
    scoreBreakdown.sourceQualityRelevance = sourceQualityRelevanceScore(candidate, profile, genreMatches, positiveMatches);
    scoreBreakdown.queryRungBonus = queryRungBonus(candidate);
    if (googleBooksNarrativeEvidence.score) scoreBreakdown.googleBooksNarrativePreference = googleBooksNarrativeEvidence.score;
    if (genericOnlyTasteMatch) scoreBreakdown.genericOnlyTasteMatchPenalty = kidsOpenLibrary ? -1.25 : -0.9;

    const score = Object.entries(scoreBreakdown).reduce((sum, [key, value]) => sum + (key === "ageBandSuitability" ? 0 : Number(value || 0)), 0);
    const metadataBackedMatchedLikedSignals = [...genreMatches, ...positiveMatches].map((signal) => signal.value);
    const metadataBackedMatchedDislikedSignals = avoidMatches.map((signal) => signal.value);
    const positiveTasteScore = Number(scoreBreakdown.genreFacetMatch || 0) + Number(scoreBreakdown.positiveTasteMatch || 0);
    return {
      ...candidate,
      score,
      matchedSignals,
      rejectedReasons: [],
      scoreBreakdown,
      diagnostics: {
        ...candidate.diagnostics,
        queryTextSignalsRemovedFromTasteMatch: removedQueryTextSignals,
        documentOnlyTasteMatch: metadataBackedMatchedLikedSignals,
        genericTasteSignalsRemoved: Array.from(new Set(removedGenericTasteSignals)),
        genericOnlyTasteMatch,
        documentBackedTasteSignals: metadataBackedMatchedLikedSignals,
        narrativeSemanticSignals: kidsNarrativeEvidence.signals,
        googleBooksNarrativeSignals: googleBooksNarrativeEvidence.signals,
        metadataBackedMatchedLikedSignals,
        metadataBackedMatchedDislikedSignals,
        positiveTasteScore,
        sourceQualityScore: Number(scoreBreakdown.sourceQualityRelevance || 0),
        queryRungBonus: Number(scoreBreakdown.queryRungBonus || 0),
        totalScore: score,
        finalRankingReason: teenOpenLibrary
          ? "teen_openlibrary_ranked_by_metadata_only_document_evidence"
          : adultOpenLibrary
            ? "adult_openlibrary_ranked_by_metadata_only_document_evidence"
            : adultGoogleBooks
             ? "adult_googlebooks_ranked_by_document_metadata"
            : undefined,
        teenOpenLibraryMetadataOnlyEvidence: teenOpenLibrary || undefined,
        teenOpenLibraryExcludedRetrievalEvidence: teenOpenLibrary ? ["diagnostics.queryText", "diagnostics.queryFamily", "diagnostics.facets"] : undefined,
        adultOpenLibraryMetadataOnlyEvidence: adultOpenLibrary || undefined,
        adultOpenLibraryExcludedRetrievalEvidence: adultOpenLibrary ? ["diagnostics.queryText", "diagnostics.queryFamily", "diagnostics.facets"] : undefined,
        adultGoogleBooksMetadataOnlyEvidence: adultGoogleBooks || undefined,
        adultGoogleBooksExcludedRetrievalEvidence: adultGoogleBooks ? ["diagnostics.queryText", "diagnostics.queryFamily", "diagnostics.facets"] : undefined,
        adultGoogleBooksSignalMatchTrace: adultGoogleBooks ? adultGoogleBooksSignalTrace : undefined,
        adultGoogleBooksSignalMatchedField: adultGoogleBooks ? adultGoogleBooksTraceBySignal(adultGoogleBooksSignalTrace, "field") : undefined,
        adultGoogleBooksSignalMatchedText: adultGoogleBooks ? adultGoogleBooksTraceBySignal(adultGoogleBooksSignalTrace, "matchedText") : undefined,
        adultGoogleBooksSignalMatchMethod: adultGoogleBooks ? adultGoogleBooksTraceBySignal(adultGoogleBooksSignalTrace, "method") : undefined,
        adultGoogleBooksShortSignalSubstringMatches: adultGoogleBooks ? adultGoogleBooksShortSubstringMatches : undefined,
        adultGoogleBooksRejectedShortSignalMatches: adultGoogleBooks ? adultGoogleBooksShortSubstringMatches : undefined,
      },
    };
  }).sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
}
