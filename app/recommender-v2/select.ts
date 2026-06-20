import type { ScoredCandidate, TasteProfile } from "./types";

function normalized(value: unknown): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function rootTitle(title: string): string {
  return normalized(title)
    .replace(/\b(illustrated|annotated|unabridged|abridged|complete|collector'?s?|deluxe|special|critical|revised|updated|movie tie in|tie in|edition|editions|version|versions|translation|translated|spanish|french|german|italian|romanian|penguin|oxford|cambridge|modern library|classics?|classic)\b/g, " ")
    .replace(/\b(a|an|the|new)\b(?=\s+\w+\s*$)/g, " ")
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
  const text = normalized([candidate.title, candidate.subtitle, (candidate.creators || []).join(" ")].filter(Boolean).join(" "));
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

function isMiddleGradesFantasyHumorCandidate(candidate: ScoredCandidate): boolean {
  return candidate.source === "openLibrary" && /middle_grades_fantasy_humor/i.test(String(candidate.diagnostics?.routingReason || ""));
}

function isMiddleGradesFantasyHumorAlignedCandidate(candidate: ScoredCandidate): boolean {
  if (!isMiddleGradesFantasyHumorCandidate(candidate)) return false;
  const queryText = normalized([candidate.diagnostics?.queryText, candidate.diagnostics?.queryFamily].filter(Boolean).join(" "));
  const fallbackText = normalized([candidate.title, candidate.subtitle].filter(Boolean).join(" "));
  if (/\b(adventure|fantasy adventure|friendship)\b/.test(queryText) && !/\b(humor|funny)\b/.test(queryText)) return true;
  return !queryText && /\b(adventure|fantasy adventure|friendship)\b/.test(fallbackText) && !/\b(humor|funny)\b/.test(fallbackText);
}

function isMiddleGradesFantasyHumorDefaultCandidate(candidate: ScoredCandidate): boolean {
  if (!isMiddleGradesFantasyHumorCandidate(candidate)) return false;
  const text = normalized([candidate.diagnostics?.queryText, candidate.diagnostics?.queryFamily, candidate.title, candidate.subtitle].filter(Boolean).join(" "));
  return /\b(humor|funny)\b/.test(text);
}

function isMiddleGradesAntiZeroFallbackCandidate(candidate: ScoredCandidate): boolean {
  if (candidate.source !== "openLibrary" || !/middle_grades_/i.test(String(candidate.diagnostics?.routingReason || ""))) return false;
  return Boolean(candidate.diagnostics?.emergencyFallback)
    || candidate.diagnostics?.fallbackAlignment === "anti_zero"
    || /_(?:delayed_final_retry|final_safe_recovery)$/i.test(String(candidate.diagnostics?.routingReason || ""));
}

function middleGradesRawText(candidate: ScoredCandidate): string {
  const raw = candidate.raw as any;
  const rawDescription = typeof raw?.description === "string" ? raw.description : raw?.description?.value;
  return normalized([
    candidate.title,
    candidate.subtitle,
    candidate.description,
    (candidate.creators || []).join(" "),
    (candidate.genres || []).join(" "),
    (candidate.themes || []).join(" "),
    (candidate.tones || []).join(" "),
    (candidate.characterDynamics || []).join(" "),
    Array.isArray(raw?.subject) ? raw.subject.join(" ") : raw?.subject,
    Array.isArray(raw?.subjects) ? raw.subjects.join(" ") : raw?.subjects,
    Array.isArray(raw?.subject_facet) ? raw.subject_facet.join(" ") : raw?.subject_facet,
    rawDescription,
  ].filter(Boolean).join(" "));
}

function middleGradesQueryText(candidate: ScoredCandidate): string {
  return normalized([candidate.diagnostics?.queryText, candidate.diagnostics?.queryFamily, candidate.diagnostics?.routingReason].filter(Boolean).join(" "));
}

function middleGradesRouteEvidencePattern(candidate: ScoredCandidate): RegExp | undefined {
  const queryText = middleGradesQueryText(candidate);
  const routeKey = middleGradesRouteKey(candidate);
  const routeText = `${routeKey} ${queryText}`;
  if (/\b(science adventure|science fiction|sci fi|sci-fi|space|dystopian|dystopia)\b/.test(routeText)) return /\b(science|scientist|experiment|space|planet|galaxy|robot|robots?|technology|invention|dystopian|dystopia|sci fi|sci-fi|science fiction|nonfiction)\b/;
  if (/\b(robot|ai|artificial intelligence|superhero|superheroes)\b/.test(routeText)) return /\b(robot|robots?|ai|artificial intelligence|technology|invention|superhero|superheroes|powers?)\b/;
  if (/\b(animal adventure|animals?|nature|wildlife)\b/.test(routeText)) return /\b(animal|animals|dog|cat|horse|wolf|wolves|wildlife|nature|forest|woods|survival|cozy|community|farm|creature|creatures)\b/;
  if (/\b(school adventure|school story|school|classroom|children s school stories)\b/.test(routeText)) return /\b(school|class|classroom|teacher|student|students|friendship|friends?|community|family|comedy|funny|humor|humour)\b/;
  if (/\b(friendship|community)\b/.test(routeText)) return /\b(friendship|friends?|community|school|family|team|classroom)\b/;
  if (/\b(fantasy mystery|mystery adventure|mystery|detective)\b/.test(routeText)) return /\b(mystery|detective|clue|clues|case|secret|secrets|puzzle|investigate|investigation)\b/;
  if (/\b(humor|funny|funny family|fantasy humor)\b/.test(routeText)) return /\b(humor|humour|funny|comedy|comic|joke|laugh|school|friendship|friends?|family)\b/;
  if (/\b(fantasy adventure|family fantasy|fantasy|magic|magical)\b/.test(routeText)) return /\b(fantasy|magic|magical|wizard|witch|dragon|quest|kingdom|hero|heroic|adventure)\b/;
  if (/\b(contemporary|realistic)\b/.test(routeText)) return /\b(realistic|contemporary|school|classroom|friendship|friends?|family|community)\b/;
  return undefined;
}

function middleGradesRouteAlignmentEvidence(candidate: ScoredCandidate): { queryLevel: boolean; documentLevel: boolean; fields: string[]; demotedReason?: string } {
  if (candidate.source !== "openLibrary" || !/middle_grades_/i.test(String(candidate.diagnostics?.routingReason || ""))) return { queryLevel: false, documentLevel: false, fields: [] };
  const pattern = middleGradesRouteEvidencePattern(candidate);
  const queryText = middleGradesQueryText(candidate);
  const raw = candidate.raw as any;
  const rawDescription = typeof raw?.description === "string" ? raw.description : raw?.description?.value;
  const docFields: Array<[string, string]> = [
    ["title", normalized(candidate.title)],
    ["subtitle", normalized(candidate.subtitle)],
    ["description", normalized([candidate.description, rawDescription].filter(Boolean).join(" "))],
    ["genres", normalized((candidate.genres || []).join(" "))],
    ["themes", normalized((candidate.themes || []).join(" "))],
    ["tones", normalized((candidate.tones || []).join(" "))],
    ["characterDynamics", normalized((candidate.characterDynamics || []).join(" "))],
    ["subjects", normalized([Array.isArray(raw?.subject) ? raw.subject.join(" ") : raw?.subject, Array.isArray(raw?.subjects) ? raw.subjects.join(" ") : raw?.subjects, Array.isArray(raw?.subject_facet) ? raw.subject_facet.join(" ") : raw?.subject_facet].filter(Boolean).join(" "))],
  ];
  const queryLevel = pattern ? pattern.test(queryText) : false;
  const fields = pattern ? docFields.filter(([, value]) => pattern.test(value)).map(([field]) => field) : [];
  const documentLevel = fields.length > 0 || Number(candidate.scoreBreakdown?.genreFacetMatch || 0) > 0;
  return {
    queryLevel,
    documentLevel,
    fields,
    demotedReason: queryLevel && !documentLevel ? "query_level_only_no_document_evidence" : undefined,
  };
}

function isMiddleGradesRouteAlignedSuccessCandidate(candidate: ScoredCandidate): boolean {
  if (candidate.source !== "openLibrary" || !/middle_grades_/i.test(String(candidate.diagnostics?.routingReason || ""))) return false;
  if (isMiddleGradesAntiZeroFallbackCandidate(candidate)) return false;
  return middleGradesRouteAlignmentEvidence(candidate).documentLevel;
}


function addMiddleGradesSlateDiagnostics(selected: ScoredCandidate[], rejectedReasons: Record<string, number>, profile: TasteProfile): void {
  if (profile.ageBand !== "preteens" || selected.length === 0) return;
  const averageGenreFacetMatch = selected.reduce((sum, candidate) => sum + Number(candidate.scoreBreakdown?.genreFacetMatch || 0), 0) / selected.length;
  const roundedAverage = Math.round(averageGenreFacetMatch * 1000) / 1000;
  const antiZeroCount = selected.filter(isMiddleGradesAntiZeroFallbackCandidate).length;
  const genericDefaults = selected.filter((candidate) => {
    const text = normalized([candidate.diagnostics?.queryText, candidate.diagnostics?.queryFamily, candidate.title, candidate.subtitle].filter(Boolean).join(" "));
    const evidenceText = normalized([candidate.title, candidate.subtitle, candidate.description, (candidate.genres || []).join(" "), (candidate.themes || []).join(" ")].filter(Boolean).join(" "));
    return /\b(humor|funny|school story|school adventure|adventure)\b/.test(text)
      && !/\b(friendship|family|contemporary|realistic|mystery|ai|robot|superhero|science|nature|animal)\b/.test(evidenceText);
  });
  const fallbackSpecificityScore = selected.reduce((sum, candidate) => {
    const text = normalized([candidate.diagnostics?.queryText, candidate.diagnostics?.queryFamily, candidate.title, candidate.subtitle, (candidate.genres || []).join(" "), (candidate.themes || []).join(" ")].filter(Boolean).join(" "));
    let score = 0;
    if (/\b(friendship|family|contemporary|realistic|school|mystery|ai|robot|superhero|animal|nature|science fiction|dystopian)\b/.test(text)) score += 1;
    if (/\b(fantasy adventure|family fantasy|funny family|school adventure|mystery adventure|friendship adventure|animal adventure|robot|superhero)\b/.test(text)) score += 1;
    if (isMiddleGradesAntiZeroFallbackCandidate(candidate)) score -= 0.25;
    return sum + score;
  }, 0) / selected.length;
  rejectedReasons.slateGenreFacetMatchAverage = roundedAverage;
  rejectedReasons.fallbackSlateSpecificityScore = Math.round(fallbackSpecificityScore * 1000) / 1000;
  if (antiZeroCount >= Math.ceil(selected.length / 2) && roundedAverage <= 0) {
    rejectedReasons.middle_grades_mostly_fallback_zero_genre_match_penalty = antiZeroCount;
    for (const candidate of selected.filter(isMiddleGradesAntiZeroFallbackCandidate)) candidate.rejectedReasons.push("middle_grades_mostly_fallback_zero_genre_match_penalty");
  }
  if (genericDefaults.length >= Math.min(4, selected.length)) {
    rejectedReasons.genericDefaultSlateDetected = 1;
    rejectedReasons.genericDefaultSlateReason_query_text_without_doc_specificity = genericDefaults.length;
    for (const candidate of genericDefaults) candidate.rejectedReasons.push("generic_default_slate_detected_query_text_without_doc_specificity");
  }
  for (const candidate of selected) {
    candidate.diagnostics.slateGenreFacetMatchAverage = roundedAverage;
    candidate.diagnostics.fallbackSlateSpecificityScore = Math.round(fallbackSpecificityScore * 1000) / 1000;
    candidate.diagnostics.genericDefaultSlateDetected = genericDefaults.length >= Math.min(4, selected.length);
    if (genericDefaults.length >= Math.min(4, selected.length)) candidate.diagnostics.genericDefaultSlateReason = "query_text_without_doc_specificity";
  }
}

function applyMiddleGradesAntiZeroFallbackGate(rankedCandidates: ScoredCandidate[], selected: ScoredCandidate[], rejectedReasons: Record<string, number>, profile: TasteProfile): void {
  if (profile.ageBand !== "preteens") return;
  const selectedAntiZero = selected.filter(isMiddleGradesAntiZeroFallbackCandidate);
  if (!selectedAntiZero.length) {
    const routeAlignedCount = selected.filter(isMiddleGradesRouteAlignedSuccessCandidate).length;
    if (routeAlignedCount > 0) rejectedReasons.middle_grades_route_aligned_success = routeAlignedCount;
    return;
  }
  const selectedTitles = () => new Set(selected.map((candidate) => normalized(candidate.title)));
  const selectedRoots = () => new Set(selected.map(seriesKey).filter(Boolean));
  const safeRouteAlignedPool = rankedCandidates.filter((candidate) => {
    if (!isMiddleGradesRouteAlignedSuccessCandidate(candidate)) return false;
    if (selected.includes(candidate)) return false;
    if (rejectReason(candidate, profile)) return false;
    if (selectedTitles().has(normalized(candidate.title))) return false;
    const rootKey = seriesKey(candidate);
    if (rootKey && selectedRoots().has(rootKey)) return false;
    return true;
  });
  rejectedReasons.middle_grades_anti_zero_fallback_success = selectedAntiZero.length;
  if (selected.filter(isMiddleGradesRouteAlignedSuccessCandidate).length === 0 && safeRouteAlignedPool.length === 0) {
    rejectedReasons.middle_grades_fallback_only_slate = 1;
    for (const candidate of selectedAntiZero) candidate.rejectedReasons.push("middle_grades_anti_zero_fallback_only_slate");
    return;
  }
  for (const candidate of safeRouteAlignedPool) {
    const replacementIndex = selected
      .map((row, index) => ({ row, index }))
      .filter(({ row }) => isMiddleGradesAntiZeroFallbackCandidate(row))
      .sort((a, b) => a.row.score - b.row.score)[0]?.index;
    if (replacementIndex === undefined) break;
    const titleKey = normalized(candidate.title);
    const rootKey = seriesKey(candidate);
    if (selectedTitles().has(titleKey) || (rootKey && selectedRoots().has(rootKey))) continue;
    selected[replacementIndex].rejectedReasons.push("middle_grades_anti_zero_fallback_replaced_by_route_aligned");
    candidate.rejectedReasons.push("middle_grades_route_aligned_success_recovered_from_anti_zero");
    selected[replacementIndex] = candidate;
    rejectedReasons.middle_grades_anti_zero_fallback_replacements = Number(rejectedReasons.middle_grades_anti_zero_fallback_replacements || 0) + 1;
  }
  const routeAlignedCount = selected.filter(isMiddleGradesRouteAlignedSuccessCandidate).length;
  if (routeAlignedCount > 0) rejectedReasons.middle_grades_route_aligned_success = routeAlignedCount;
  const remainingAntiZero = selected.filter(isMiddleGradesAntiZeroFallbackCandidate).length;
  if (remainingAntiZero > 0) rejectedReasons.middle_grades_anti_zero_fallback_success = remainingAntiZero;
}

function middleGradesRouteKey(candidate: ScoredCandidate): string {
  return String(candidate.diagnostics?.routingReason || "")
    .replace(/_(?:age_anchored_recovery|delayed_final_retry|final_safe_recovery|locked_underfill_recovery)$/i, "");
}


function middleGradesHumorCapBucketKey(candidate: ScoredCandidate): string {
  const routeKey = middleGradesRouteKey(candidate);
  if (/mystery|contemporary_school/i.test(routeKey)) return routeKey;
  if (/humor|adventure/i.test(routeKey)) return "middle_grades_humor_adventure";
  return routeKey;
}

function isMiddleGradesHumorDefaultQueryFamily(candidate: ScoredCandidate): boolean {
  if (candidate.source !== "openLibrary" || !/middle_grades_/i.test(String(candidate.diagnostics?.routingReason || ""))) return false;
  const text = normalized([
    candidate.diagnostics?.queryText,
    candidate.diagnostics?.queryFamily,
    candidate.title,
    candidate.subtitle,
    ...(candidate.genres || []),
    ...(candidate.themes || []),
  ].filter(Boolean).join(" "));
  return /\b(humor|humorous|funny|comedy|comic)\b/.test(text);
}

function isMiddleGradesHumorCapAlternative(candidate: ScoredCandidate): boolean {
  if (candidate.source !== "openLibrary" || !/middle_grades_/i.test(String(candidate.diagnostics?.routingReason || ""))) return false;
  if (isMiddleGradesHumorDefaultQueryFamily(candidate)) return false;
  const text = normalized([
    candidate.diagnostics?.queryText,
    candidate.diagnostics?.queryFamily,
    candidate.title,
    candidate.subtitle,
    ...(candidate.genres || []),
    ...(candidate.themes || []),
  ].filter(Boolean).join(" "));
  return /\b(adventure|fantasy adventure|friendship|school)\b/.test(text);
}

function applyMiddleGradesHumorDefaultCap(rankedCandidates: ScoredCandidate[], selected: ScoredCandidate[], rejectedReasons: Record<string, number>, profile: TasteProfile): void {
  if (profile.ageBand !== "preteens") return;
  const selectedTitles = () => new Set(selected.map((candidate) => normalized(candidate.title)));
  const selectedRoots = () => new Set(selected.map(seriesKey).filter(Boolean));
  const routeKeys = Array.from(new Set(rankedCandidates
    .filter((candidate) => candidate.source === "openLibrary" && /middle_grades_/i.test(String(candidate.diagnostics?.routingReason || "")))
    .map(middleGradesHumorCapBucketKey)
    .filter((key) => !/mystery|contemporary_school/i.test(key))
    .filter((key) => /humor|adventure/i.test(key)))).slice(0, 12);
  for (const routeKey of routeKeys) {
    const routeCandidates = rankedCandidates.filter((candidate) => middleGradesHumorCapBucketKey(candidate) === routeKey);
    if (!routeCandidates.length) continue;
    const selectedDefaults = selected.filter((candidate) => middleGradesHumorCapBucketKey(candidate) === routeKey && isMiddleGradesHumorDefaultQueryFamily(candidate));
    if (selectedDefaults.length <= 3) continue;
    const safeAlignedPool = routeCandidates.filter((candidate) => {
      if (!isMiddleGradesHumorCapAlternative(candidate)) return false;
      if (rejectReason(candidate, profile)) return false;
      return true;
    });
    if (safeAlignedPool.length < 2) continue;
    const safeReplacementAlternatives = safeAlignedPool.filter((candidate) => {
      if (selected.includes(candidate)) return false;
      if (selectedTitles().has(normalized(candidate.title))) return false;
      const rootKey = seriesKey(candidate);
      if (rootKey && selectedRoots().has(rootKey)) return false;
      return true;
    });
    rejectedReasons.middle_grades_humor_default_query_family_candidates = safeAlignedPool.length;
    for (const candidate of safeReplacementAlternatives) {
      const currentDefaults = selected.filter((row) => middleGradesHumorCapBucketKey(row) === routeKey && isMiddleGradesHumorDefaultQueryFamily(row));
      if (currentDefaults.length <= 3) break;
      const replacementIndex = selected
        .map((row, index) => ({ row, index }))
        .filter(({ row }) => middleGradesHumorCapBucketKey(row) === routeKey && isMiddleGradesHumorDefaultQueryFamily(row))
        .sort((a, b) => a.row.score - b.row.score)[0]?.index;
      if (replacementIndex === undefined) break;
      const titleKey = normalized(candidate.title);
      const rootKey = seriesKey(candidate);
      if (selectedTitles().has(titleKey) || (rootKey && selectedRoots().has(rootKey))) continue;
      selected[replacementIndex].rejectedReasons.push("middle_grades_humor_default_query_family_replaced_by_alternative");
      candidate.rejectedReasons.push("middle_grades_humor_default_query_family_cap_accepted");
      selected[replacementIndex] = candidate;
      rejectedReasons.middle_grades_humor_default_query_family_replacements = Number(rejectedReasons.middle_grades_humor_default_query_family_replacements || 0) + 1;
      rejectedReasons.middle_grades_humor_default_query_family_cap_accepted = Number(rejectedReasons.middle_grades_humor_default_query_family_cap_accepted || 0) + 1;
    }
  }
}

function isMiddleGradesContemporarySchoolDefaultCandidate(candidate: ScoredCandidate): boolean {
  if (!isMiddleGradesContemporarySchoolCandidate(candidate)) return false;
  const text = normalized([candidate.diagnostics?.queryText, candidate.diagnostics?.queryFamily, candidate.title, candidate.subtitle].filter(Boolean).join(" "));
  if (/\b(humor|humorous|funny)\b/.test(text)) return true;
  return /\bschool\b/.test(text) && !/\b(realistic|friendship|family|family life|classroom|contemporary)\b/.test(text);
}

function isMiddleGradesContemporarySchoolSaferAlignedCandidate(candidate: ScoredCandidate): boolean {
  if (!isMiddleGradesContemporarySchoolCandidate(candidate)) return false;
  if (isMiddleGradesContemporarySchoolDefaultCandidate(candidate)) return false;
  const text = normalized([candidate.diagnostics?.queryText, candidate.diagnostics?.queryFamily, candidate.title, candidate.subtitle].filter(Boolean).join(" "));
  return /\b(realistic|school|friendship|classroom|family|family life|contemporary)\b/.test(text);
}

function applyMiddleGradesContemporarySchoolDefaultCap(rankedCandidates: ScoredCandidate[], selected: ScoredCandidate[], rejectedReasons: Record<string, number>, profile: TasteProfile): void {
  if (profile.ageBand !== "preteens") return;
  const selectedDefaults = selected.filter(isMiddleGradesContemporarySchoolDefaultCandidate);
  if (selectedDefaults.length <= 3) return;
  const selectedTitles = () => new Set(selected.map((candidate) => normalized(candidate.title)));
  const selectedRoots = () => new Set(selected.map(seriesKey).filter(Boolean));
  const safeAlignedPool = rankedCandidates.filter((candidate) => {
    if (!isMiddleGradesContemporarySchoolSaferAlignedCandidate(candidate)) return false;
    if (selected.includes(candidate)) return false;
    if (rejectReason(candidate, profile)) return false;
    if (selectedTitles().has(normalized(candidate.title))) return false;
    const rootKey = seriesKey(candidate);
    if (rootKey && selectedRoots().has(rootKey)) return false;
    return true;
  });
  if (!safeAlignedPool.length) return;
  rejectedReasons.middle_grades_contemporary_school_default_cap_candidates = safeAlignedPool.length;
  for (const candidate of safeAlignedPool) {
    if (selected.filter(isMiddleGradesContemporarySchoolDefaultCandidate).length <= 3) break;
    const replacementIndex = selected
      .map((row, index) => ({ row, index }))
      .filter(({ row }) => isMiddleGradesContemporarySchoolDefaultCandidate(row))
      .sort((a, b) => a.row.score - b.row.score)[0]?.index;
    if (replacementIndex === undefined) break;
    const titleKey = normalized(candidate.title);
    const rootKey = seriesKey(candidate);
    if (selectedTitles().has(titleKey) || (rootKey && selectedRoots().has(rootKey))) continue;
    selected[replacementIndex].rejectedReasons.push("middle_grades_contemporary_school_default_replaced_by_aligned");
    candidate.rejectedReasons.push("middle_grades_contemporary_school_default_cap_accepted");
    selected[replacementIndex] = candidate;
    rejectedReasons.middle_grades_contemporary_school_default_cap_replacements = Number(rejectedReasons.middle_grades_contemporary_school_default_cap_replacements || 0) + 1;
    rejectedReasons.middle_grades_contemporary_school_default_cap_accepted = Number(rejectedReasons.middle_grades_contemporary_school_default_cap_accepted || 0) + 1;
  }
}

function applyMiddleGradesFantasyHumorAlignedBalance(rankedCandidates: ScoredCandidate[], selected: ScoredCandidate[], rejectedReasons: Record<string, number>, profile: TasteProfile, limit: number): void {
  if (profile.ageBand !== "preteens") return;
  const routeCandidates = rankedCandidates.filter(isMiddleGradesFantasyHumorCandidate);
  if (!routeCandidates.length) return;
  const selectedTitles = () => new Set(selected.map((candidate) => normalized(candidate.title)));
  const selectedRoots = () => new Set(selected.map(seriesKey).filter(Boolean));
  const safeAlignedPool = routeCandidates.filter((candidate) => {
    if (!isMiddleGradesFantasyHumorAlignedCandidate(candidate)) return false;
    if (selected.includes(candidate)) return false;
    if (rejectReason(candidate, profile)) return false;
    if (selectedTitles().has(normalized(candidate.title))) return false;
    const rootKey = seriesKey(candidate);
    if (rootKey && selectedRoots().has(rootKey)) return false;
    return true;
  });
  const targetAligned = Math.min(2, selected.filter(isMiddleGradesFantasyHumorAlignedCandidate).length + safeAlignedPool.length);
  if (targetAligned < 2 || selected.filter(isMiddleGradesFantasyHumorAlignedCandidate).length >= targetAligned) return;
  rejectedReasons.middle_grades_fantasy_humor_aligned_balance_candidates = safeAlignedPool.length;
  for (const candidate of safeAlignedPool) {
    if (selected.filter(isMiddleGradesFantasyHumorAlignedCandidate).length >= targetAligned) break;
    const titleKey = normalized(candidate.title);
    const rootKey = seriesKey(candidate);
    if (selectedTitles().has(titleKey) || (rootKey && selectedRoots().has(rootKey))) continue;
    if (selected.length < limit) {
      candidate.rejectedReasons.push("middle_grades_fantasy_humor_aligned_balance_accepted");
      rejectedReasons.middle_grades_fantasy_humor_aligned_balance_accepted = Number(rejectedReasons.middle_grades_fantasy_humor_aligned_balance_accepted || 0) + 1;
      selected.push(candidate);
      continue;
    }
    const replacementIndex = selected
      .map((row, index) => ({ row, index }))
      .filter(({ row }) => isMiddleGradesFantasyHumorDefaultCandidate(row) && !isMiddleGradesFantasyHumorAlignedCandidate(row))
      .sort((a, b) => a.row.score - b.row.score)[0]?.index;
    const fallbackReplacementIndex = replacementIndex ?? selected
      .map((row, index) => ({ row, index }))
      .filter(({ row }) => !isMiddleGradesFantasyHumorAlignedCandidate(row))
      .sort((a, b) => a.row.score - b.row.score)[0]?.index;
    if (fallbackReplacementIndex === undefined) break;
    selected[fallbackReplacementIndex].rejectedReasons.push("middle_grades_fantasy_humor_aligned_balance_replaced_by_aligned");
    candidate.rejectedReasons.push("middle_grades_fantasy_humor_aligned_balance_accepted");
    selected[fallbackReplacementIndex] = candidate;
    rejectedReasons.middle_grades_fantasy_humor_aligned_balance_replacements = Number(rejectedReasons.middle_grades_fantasy_humor_aligned_balance_replacements || 0) + 1;
    rejectedReasons.middle_grades_fantasy_humor_aligned_balance_accepted = Number(rejectedReasons.middle_grades_fantasy_humor_aligned_balance_accepted || 0) + 1;
  }
}

function isMiddleGradesContemporarySchoolCandidate(candidate: ScoredCandidate): boolean {
  return candidate.source === "openLibrary" && /middle_grades_contemporary_school/i.test(String(candidate.diagnostics?.routingReason || ""));
}

function isMiddleGradesContemporarySchoolAlignedCandidate(candidate: ScoredCandidate): boolean {
  if (!isMiddleGradesContemporarySchoolCandidate(candidate)) return false;
  const text = normalized([candidate.diagnostics?.queryText, candidate.diagnostics?.queryFamily, candidate.title, candidate.subtitle].filter(Boolean).join(" "));
  return /\b(realistic|school|friendship|classroom|family|family life|contemporary)\b/.test(text);
}

function isMiddleGradesContemporarySchoolAdventureFallback(candidate: ScoredCandidate): boolean {
  if (!isMiddleGradesContemporarySchoolCandidate(candidate)) return false;
  const text = normalized([candidate.diagnostics?.queryText, candidate.diagnostics?.queryFamily, candidate.title, candidate.subtitle].filter(Boolean).join(" "));
  return /\b(adventure|fantasy|magic|magical|quest)\b/.test(text) && !isMiddleGradesContemporarySchoolAlignedCandidate(candidate);
}

function applyMiddleGradesContemporarySchoolAlignment(rankedCandidates: ScoredCandidate[], selected: ScoredCandidate[], rejectedReasons: Record<string, number>, profile: TasteProfile): void {
  if (profile.ageBand !== "preteens") return;
  const routeCandidates = rankedCandidates.filter(isMiddleGradesContemporarySchoolCandidate);
  if (!routeCandidates.some(isMiddleGradesContemporarySchoolAdventureFallback)) return;
  const selectedTitles = () => new Set(selected.map((candidate) => normalized(candidate.title)));
  const selectedRoots = () => new Set(selected.map(seriesKey).filter(Boolean));
  const safeAlignedPool = routeCandidates.filter((candidate) => {
    if (!isMiddleGradesContemporarySchoolAlignedCandidate(candidate)) return false;
    if (selected.includes(candidate)) return false;
    if (rejectReason(candidate, profile)) return false;
    if (selectedTitles().has(normalized(candidate.title))) return false;
    const rootKey = seriesKey(candidate);
    if (rootKey && selectedRoots().has(rootKey)) return false;
    return true;
  });
  if (!safeAlignedPool.length) return;
  rejectedReasons.middle_grades_contemporary_school_alignment_candidates = safeAlignedPool.length;
  for (const candidate of safeAlignedPool) {
    const replacementIndex = selected
      .map((row, index) => ({ row, index }))
      .filter(({ row }) => isMiddleGradesContemporarySchoolAdventureFallback(row))
      .sort((a, b) => a.row.score - b.row.score)[0]?.index;
    if (replacementIndex === undefined) break;
    const titleKey = normalized(candidate.title);
    const rootKey = seriesKey(candidate);
    if (selectedTitles().has(titleKey) || (rootKey && selectedRoots().has(rootKey))) continue;
    selected[replacementIndex].rejectedReasons.push("middle_grades_contemporary_school_alignment_replaced_by_aligned");
    candidate.rejectedReasons.push("middle_grades_contemporary_school_alignment_accepted");
    selected[replacementIndex] = candidate;
    rejectedReasons.middle_grades_contemporary_school_alignment_replacements = Number(rejectedReasons.middle_grades_contemporary_school_alignment_replacements || 0) + 1;
    rejectedReasons.middle_grades_contemporary_school_alignment_accepted = Number(rejectedReasons.middle_grades_contemporary_school_alignment_accepted || 0) + 1;
  }
}


function middleGradesRouteAlignmentScore(candidate: ScoredCandidate): number {
  if (candidate.source !== "openLibrary" || !/middle_grades_/i.test(String(candidate.diagnostics?.routingReason || ""))) return 0;
  const breakdown = candidate.scoreBreakdown || {};
  const routeKey = middleGradesRouteKey(candidate);
  const docText = middleGradesRawText(candidate);
  const evidence = middleGradesRouteAlignmentEvidence(candidate);
  let score = 0;
  if (evidence.documentLevel) score += 1.6;
  if (/fantasy_humor|humor/i.test(routeKey) && /\b(humor|funny|friendship|school|family|comedy|adventure)\b/.test(docText)) score += 0.7;
  if (/contemporary_school|contemporary|school|realistic/i.test(routeKey) && /\b(realistic|contemporary|school|classroom|friendship|family)\b/.test(docText)) score += 0.9;
  if (/mystery/i.test(routeKey) && /\b(mystery|detective|clue|school mystery)\b/.test(docText)) score += 0.9;
  if (/\b(ai|robot|superhero|animal|nature|dystopian|science fiction|space|nonfiction)\b/.test(docText)) score += 0.5;
  if (evidence.queryLevel && !evidence.documentLevel) score -= 1.1;
  score += Math.min(1, Math.max(0, Number(breakdown.genreFacetMatch || 0) / 3));
  if (isMiddleGradesAntiZeroFallbackCandidate(candidate)) score -= 0.8;
  return Math.round(score * 1000) / 1000;
}

function middleGradesFallbackPenalty(candidate: ScoredCandidate): number {
  if (candidate.source !== "openLibrary" || !/middle_grades_/i.test(String(candidate.diagnostics?.routingReason || ""))) return 0;
  const breakdown = candidate.scoreBreakdown || {};
  const text = normalized([candidate.diagnostics?.queryText, candidate.diagnostics?.queryFamily, candidate.title, candidate.subtitle].filter(Boolean).join(" "));
  const evidence = middleGradesRouteAlignmentEvidence(candidate);
  let penalty = 0;
  if (isMiddleGradesAntiZeroFallbackCandidate(candidate)) penalty += 1.1;
  if (evidence.queryLevel && !evidence.documentLevel) penalty += 1.2;
  if (/\b(middle grade adventure|fantasy adventure|school adventure|school story|science adventure|animal adventure|humor|funny)\b/.test(text) && Number(breakdown.genreFacetMatch || 0) <= 0) penalty += 0.7;
  if (/\b(school story|school adventure|humor|funny|middle grade humor|children s funny books)\b/.test(text) && Number(breakdown.genreFacetMatch || 0) <= 0 && (!candidate.matchedSignals || candidate.matchedSignals.length === 0)) penalty += 0.9;
  return Math.round(penalty * 1000) / 1000;
}


function middleGradesSelectionScore(candidate: ScoredCandidate, profile: TasteProfile): number {
  if (profile.ageBand !== "preteens") return candidate.score;
  return candidate.score + (middleGradesRouteAlignmentScore(candidate) * 1.2) - (middleGradesFallbackPenalty(candidate) * 1.4);
}


function applyMiddleGradesRouteAlignmentReplacement(rankedCandidates: ScoredCandidate[], selected: ScoredCandidate[], rejectedReasons: Record<string, number>, profile: TasteProfile): void {
  if (profile.ageBand !== "preteens") return;
  const selectedTitles = () => new Set(selected.map((candidate) => normalized(candidate.title)));
  const selectedRoots = () => new Set(selected.map(seriesKey).filter(Boolean));
  const routeAlignedPool = rankedCandidates.filter((candidate) => {
    if (!isMiddleGradesRouteAlignedSuccessCandidate(candidate)) return false;
    if (isMiddleGradesHumorDefaultQueryFamily(candidate) || isMiddleGradesContemporarySchoolDefaultCandidate(candidate)) return false;
    if (selected.includes(candidate)) return false;
    if (rejectReason(candidate, profile)) return false;
    if (selectedTitles().has(normalized(candidate.title))) return false;
    const rootKey = seriesKey(candidate);
    if (rootKey && selectedRoots().has(rootKey)) return false;
    return true;
  }).sort((a, b) => middleGradesSelectionScore(b, profile) - middleGradesSelectionScore(a, profile));
  if (!routeAlignedPool.length) return;
  rejectedReasons.top_rejected_route_aligned_candidates_available = routeAlignedPool.length;
  for (const candidate of routeAlignedPool) {
    const candidateAdjusted = middleGradesSelectionScore(candidate, profile);
    const replacementIndex = selected
      .map((row, index) => ({ row, index, adjusted: middleGradesSelectionScore(row, profile), alignment: middleGradesRouteAlignmentScore(row), fallbackPenalty: middleGradesFallbackPenalty(row) }))
      .filter(({ row, alignment, fallbackPenalty }) => row.source === "openLibrary" && /middle_grades_/i.test(String(row.diagnostics?.routingReason || "")) && (fallbackPenalty > 0 || alignment < middleGradesRouteAlignmentScore(candidate)))
      .sort((a, b) => a.adjusted - b.adjusted)[0]?.index;
    if (replacementIndex === undefined) break;
    const replaced = selected[replacementIndex];
    if (candidateAdjusted + 0.35 < middleGradesSelectionScore(replaced, profile)) continue;
    replaced.rejectedReasons.push("middle_grades_route_aligned_replaced_weaker_generic_or_fallback");
    candidate.rejectedReasons.push("middle_grades_route_aligned_selected_over_generic_or_fallback");
    selected[replacementIndex] = candidate;
    rejectedReasons.middle_grades_route_aligned_replacements = Number(rejectedReasons.middle_grades_route_aligned_replacements || 0) + 1;
  }
}

function addMiddleGradesSelectionObservability(rankedCandidates: ScoredCandidate[], selected: ScoredCandidate[], rejectedReasons: Record<string, number>, profile: TasteProfile): void {
  if (profile.ageBand !== "preteens") return;
  const diagnostics = rejectedReasons as Record<string, unknown>;
  const selectedTitles = new Set(selected.map((candidate) => normalized(candidate.title)));
  const routeAlignmentScoreByTitle: Record<string, number> = {};
  const genreFacetMatchScoreByTitle: Record<string, number> = {};
  const fallbackPenaltyByTitle: Record<string, number> = {};
  const finalSelectionReasonByTitle: Record<string, string> = {};
  const queryLevelRouteAlignmentByTitle: Record<string, boolean> = {};
  const documentLevelRouteAlignmentByTitle: Record<string, boolean> = {};
  const routeAlignmentEvidenceFieldsByTitle: Record<string, string[]> = {};
  const routeAlignmentDemotedReasonByTitle: Record<string, string> = {};
  for (const candidate of rankedCandidates) {
    const routeEvidence = middleGradesRouteAlignmentEvidence(candidate);
    routeAlignmentScoreByTitle[candidate.title] = middleGradesRouteAlignmentScore(candidate);
    genreFacetMatchScoreByTitle[candidate.title] = Number(candidate.scoreBreakdown?.genreFacetMatch || 0);
    fallbackPenaltyByTitle[candidate.title] = middleGradesFallbackPenalty(candidate);
    queryLevelRouteAlignmentByTitle[candidate.title] = routeEvidence.queryLevel;
    documentLevelRouteAlignmentByTitle[candidate.title] = routeEvidence.documentLevel;
    routeAlignmentEvidenceFieldsByTitle[candidate.title] = routeEvidence.fields;
    if (routeEvidence.demotedReason) routeAlignmentDemotedReasonByTitle[candidate.title] = routeEvidence.demotedReason;
    const queryOnlyRouteMatch = routeEvidence.queryLevel && !routeEvidence.documentLevel;
    if (selectedTitles.has(normalized(candidate.title))) {
      finalSelectionReasonByTitle[candidate.title] = isMiddleGradesAntiZeroFallbackCandidate(candidate)
        ? "selected_fallback_candidate"
        : queryOnlyRouteMatch
          ? "selected_query_only_fallback_candidate"
          : isMiddleGradesRouteAlignedSuccessCandidate(candidate)
            ? "selected_route_aligned_candidate"
            : "selected_ranked_candidate";
    } else if (isMiddleGradesRouteAlignedSuccessCandidate(candidate)) {
      finalSelectionReasonByTitle[candidate.title] = "rejected_or_deferred_route_aligned_candidate";
    } else if (isMiddleGradesAntiZeroFallbackCandidate(candidate) || queryOnlyRouteMatch) {
      finalSelectionReasonByTitle[candidate.title] = "rejected_or_deferred_fallback_candidate";
    } else {
      finalSelectionReasonByTitle[candidate.title] = "rejected_or_deferred_candidate";
    }
    candidate.diagnostics.routeAlignmentScore = routeAlignmentScoreByTitle[candidate.title];
    candidate.diagnostics.genreFacetMatchScore = genreFacetMatchScoreByTitle[candidate.title];
    candidate.diagnostics.fallbackPenalty = fallbackPenaltyByTitle[candidate.title];
    candidate.diagnostics.finalSelectionReason = finalSelectionReasonByTitle[candidate.title];
    candidate.diagnostics.queryLevelRouteAlignment = routeEvidence.queryLevel;
    candidate.diagnostics.documentLevelRouteAlignment = routeEvidence.documentLevel;
    candidate.diagnostics.routeAlignmentEvidenceFields = routeEvidence.fields;
    if (routeEvidence.demotedReason) candidate.diagnostics.routeAlignmentDemotedReason = routeEvidence.demotedReason;
  }
  const rejectedRouteAligned = rankedCandidates
    .filter((candidate) => !selectedTitles.has(normalized(candidate.title)) && isMiddleGradesRouteAlignedSuccessCandidate(candidate))
    .sort((a, b) => middleGradesSelectionScore(b, profile) - middleGradesSelectionScore(a, profile))
    .slice(0, 8)
    .map((candidate) => candidate.title);
  const selectedRouteAlignedCount = selected.filter(isMiddleGradesRouteAlignedSuccessCandidate).length;
  const selectedFallbackCount = selected.filter((candidate) => isMiddleGradesAntiZeroFallbackCandidate(candidate) || (middleGradesRouteAlignmentEvidence(candidate).queryLevel && !middleGradesRouteAlignmentEvidence(candidate).documentLevel)).length;
  const rejectedRouteAlignedCount = rankedCandidates.filter((candidate) => !selectedTitles.has(normalized(candidate.title)) && isMiddleGradesRouteAlignedSuccessCandidate(candidate)).length;
  const finalCountContractStatus = selected.length === 0
    ? "zero_result_failure"
    : selected.length >= Math.min(5, selected.length || 5) && selected.length >= 5
      ? selectedRouteAlignedCount >= selected.length
        ? "full_route_aligned"
        : selectedRouteAlignedCount === 0
          ? "full_fallback_only"
          : "full_mixed_recovery"
      : selectedRouteAlignedCount === 0
        ? "underfilled_fallback_only"
        : "underfilled_mixed";
  diagnostics.routeAlignmentScoreByTitle = routeAlignmentScoreByTitle;
  diagnostics.genreFacetMatchScoreByTitle = genreFacetMatchScoreByTitle;
  diagnostics.fallbackPenaltyByTitle = fallbackPenaltyByTitle;
  diagnostics.finalSelectionReasonByTitle = finalSelectionReasonByTitle;
  diagnostics.queryLevelRouteAlignmentByTitle = queryLevelRouteAlignmentByTitle;
  diagnostics.documentLevelRouteAlignmentByTitle = documentLevelRouteAlignmentByTitle;
  diagnostics.routeAlignmentEvidenceFieldsByTitle = routeAlignmentEvidenceFieldsByTitle;
  diagnostics.routeAlignmentDemotedReasonByTitle = routeAlignmentDemotedReasonByTitle;
  diagnostics.falseRouteAlignedDueToQueryOnlyCount = Object.keys(routeAlignmentDemotedReasonByTitle).length;
  diagnostics.finalCountContractStatus = finalCountContractStatus;
  diagnostics.topRejectedRouteAlignedCandidates = rejectedRouteAligned;
  diagnostics.selectedVsRejectedRouteAlignmentSummary = {
    selectedRouteAlignedCount,
    selectedFallbackCount,
    rejectedRouteAlignedCount,
    fallbackSurvivedWithRejectedRouteAligned: selectedFallbackCount > 0 && rejectedRouteAlignedCount > 0,
  };
  if (selectedFallbackCount > 0 && rejectedRouteAlignedCount > 0) rejectedReasons.middle_grades_fallback_survived_with_route_aligned_available = selectedFallbackCount;
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

  if (selected.length === 0 && profile.ageBand === "preteens") {
    const middleGradesEmergency = rankedCandidates.find((candidate) => {
      if (candidate.source !== "openLibrary") return false;
      if (!candidate.title.trim()) return false;
      if (candidate.maturityBand && String(candidate.maturityBand) !== profile.maturityBand) return false;
      const breakdown = candidate.scoreBreakdown || {};
      const ageSuitability = Number(breakdown.ageTeenSuitability || breakdown.ageBandSuitability || 0);
      const preciseAvoid = Number(breakdown.avoidSignalPenalty || 0);
      return candidate.score > -8 && ageSuitability > -4 && preciseAvoid > -4;
    });
    if (middleGradesEmergency) {
      middleGradesEmergency.rejectedReasons.push("accepted_middle_grades_zero_final_items_guard");
      rejectedReasons.accepted_middle_grades_zero_final_items_guard = 1;
      selected.push(middleGradesEmergency);
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
      if (row.reason === "recurring_openlibrary_cluster_deferred" || row.reason === "same_series_or_root_deferred") {
        const blockedReason = row.reason === "same_series_or_root_deferred" ? "underfill_blocked_same_root_variant" : "underfill_blocked_recurring_openlibrary_cluster";
        row.candidate.rejectedReasons.push(blockedReason);
        rejectedReasons[blockedReason] = Number(rejectedReasons[blockedReason] || 0) + 1;
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

  if (profile.ageBand === "teens" && selected.length < Math.min(5, limit) && candidates.some((candidate) => candidate.source === "openLibrary")) {
    const teenOpenLibraryTarget = Math.min(5, limit);
    rejectedReasons.teen_openlibrary_underfill_deferred_available = deferred.filter((row) => row.candidate.source === "openLibrary").length;
    for (const row of deferred) {
      if (selected.length >= teenOpenLibraryTarget) break;
      if (row.candidate.source !== "openLibrary") continue;
      if (selected.includes(row.candidate)) continue;
      const titleKey = normalized(row.candidate.title);
      if (seenTitles.has(titleKey)) continue;
      if (row.reason === "same_series_or_root_deferred") {
        row.candidate.rejectedReasons.push("teen_openlibrary_underfill_blocked_same_root_variant");
        rejectedReasons.teen_openlibrary_underfill_blocked_same_root_variant = Number(rejectedReasons.teen_openlibrary_underfill_blocked_same_root_variant || 0) + 1;
        continue;
      }
      row.candidate.rejectedReasons.push(`teen_openlibrary_underfill_relaxed_diversity:${row.reason}`);
      rejectedReasons.teen_openlibrary_underfill_relaxed_diversity = Number(rejectedReasons.teen_openlibrary_underfill_relaxed_diversity || 0) + 1;
      seenTitles.add(titleKey);
      selected.push(row.candidate);
    }
    for (const candidate of rankedCandidates) {
      if (selected.length >= teenOpenLibraryTarget) break;
      if (candidate.source !== "openLibrary") continue;
      if (selected.includes(candidate)) continue;
      if (rejectReason(candidate, profile)) continue;
      const titleKey = normalized(candidate.title);
      if (seenTitles.has(titleKey)) continue;
      const rootKey = seriesKey(candidate);
      if (rootKey && seenSeries.has(rootKey)) {
        candidate.rejectedReasons.push("teen_openlibrary_underfill_blocked_same_root_variant");
        rejectedReasons.teen_openlibrary_underfill_blocked_same_root_variant = Number(rejectedReasons.teen_openlibrary_underfill_blocked_same_root_variant || 0) + 1;
        continue;
      }
      candidate.rejectedReasons.push("teen_openlibrary_underfill_safe_candidate_accepted");
      rejectedReasons.teen_openlibrary_underfill_safe_candidate_accepted = Number(rejectedReasons.teen_openlibrary_underfill_safe_candidate_accepted || 0) + 1;
      seenTitles.add(titleKey);
      if (rootKey) seenSeries.add(rootKey);
      selected.push(candidate);
    }
  }

  if (profile.ageBand === "preteens" && selected.length < Math.min(5, limit) && candidates.some((candidate) => candidate.source === "openLibrary")) {
    const middleGradesOpenLibraryTarget = Math.min(5, limit);
    rejectedReasons.middle_grades_openlibrary_underfill_deferred_available = deferred.filter((row) => row.candidate.source === "openLibrary").length;
    for (const row of deferred) {
      if (selected.length >= middleGradesOpenLibraryTarget) break;
      if (row.candidate.source !== "openLibrary") continue;
      if (selected.includes(row.candidate)) continue;
      const titleKey = normalized(row.candidate.title);
      if (seenTitles.has(titleKey)) continue;
      if (row.reason === "same_series_or_root_deferred") {
        row.candidate.rejectedReasons.push("middle_grades_openlibrary_underfill_blocked_same_root_variant");
        rejectedReasons.middle_grades_openlibrary_underfill_blocked_same_root_variant = Number(rejectedReasons.middle_grades_openlibrary_underfill_blocked_same_root_variant || 0) + 1;
        continue;
      }
      row.candidate.rejectedReasons.push(`middle_grades_openlibrary_underfill_relaxed_diversity:${row.reason}`);
      rejectedReasons.middle_grades_openlibrary_underfill_relaxed_diversity = Number(rejectedReasons.middle_grades_openlibrary_underfill_relaxed_diversity || 0) + 1;
      seenTitles.add(titleKey);
      selected.push(row.candidate);
    }
    for (const candidate of rankedCandidates) {
      if (selected.length >= middleGradesOpenLibraryTarget) break;
      if (candidate.source !== "openLibrary") continue;
      if (selected.includes(candidate)) continue;
      if (rejectReason(candidate, profile)) continue;
      const titleKey = normalized(candidate.title);
      if (seenTitles.has(titleKey)) continue;
      const rootKey = seriesKey(candidate);
      if (rootKey && seenSeries.has(rootKey)) {
        candidate.rejectedReasons.push("middle_grades_openlibrary_underfill_blocked_same_root_variant");
        rejectedReasons.middle_grades_openlibrary_underfill_blocked_same_root_variant = Number(rejectedReasons.middle_grades_openlibrary_underfill_blocked_same_root_variant || 0) + 1;
        continue;
      }
      candidate.rejectedReasons.push("middle_grades_openlibrary_underfill_safe_candidate_accepted");
      rejectedReasons.middle_grades_openlibrary_underfill_safe_candidate_accepted = Number(rejectedReasons.middle_grades_openlibrary_underfill_safe_candidate_accepted || 0) + 1;
      seenTitles.add(titleKey);
      if (rootKey) seenSeries.add(rootKey);
      selected.push(candidate);
    }
  }

  applyMiddleGradesAntiZeroFallbackGate(rankedCandidates, selected, rejectedReasons, profile);
  applyMiddleGradesContemporarySchoolAlignment(rankedCandidates, selected, rejectedReasons, profile);
  applyMiddleGradesFantasyHumorAlignedBalance(rankedCandidates, selected, rejectedReasons, profile, limit);
  applyMiddleGradesHumorDefaultCap(rankedCandidates, selected, rejectedReasons, profile);
  applyMiddleGradesContemporarySchoolDefaultCap(rankedCandidates, selected, rejectedReasons, profile);
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

  applyMiddleGradesHumorDefaultCap(rankedCandidates, selected, rejectedReasons, profile);
  applyMiddleGradesAntiZeroFallbackGate(rankedCandidates, selected, rejectedReasons, profile);
  applyMiddleGradesRouteAlignmentReplacement(rankedCandidates, selected, rejectedReasons, profile);

  addMiddleGradesSlateDiagnostics(selected, rejectedReasons, profile);
  addMiddleGradesSelectionObservability(rankedCandidates, selected, rejectedReasons, profile);
  addAdultFamilyDiagnostics(rankedCandidates, selected, rejectedReasons, profile);

  return { selected, rejectedReasons };
}
