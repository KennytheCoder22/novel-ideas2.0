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
  const known = text.match(/\b(one piece|naruto|throne of glass|divergent|maze runner|twilight|grande ritorno|diadem|chosen|wild robot|ricky ricotta)\b/);
  if (known) return known[1];
  return rootTitle(candidate.title);
}

function collectionRootKey(candidate: ScoredCandidate): string {
  const title = normalized(candidate.title.split(/[:;(\[]/)[0] || candidate.title);
  if (!title) return "";
  const characterPairRoot = title.match(/\b([a-z]{3,})\s+and\s+([a-z]{3,})\b/)?.[0] || "";
  if (characterPairRoot) return characterPairRoot;
  const hasCollectionMarker = /\b(complete|collected|collection|collections|collector s|collectors|treasury|storybook|stories|tales|adventures|books?|omnibus|anthology|library|set|boxed|box)\b/.test(title);
  if (!hasCollectionMarker) return "";
  const root = title
    .replace(/\b(the|a|an)\b/g, " ")
    .replace(/\b(complete|collected|collection|collections|collector s|collectors|treasury|storybook|stories|tales|adventures|books?|chapter|chapters|volume|vol|omnibus|anthology|library|set|boxed|box)\b/g, " ")
    .replace(/\b\d+\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return root.split(" ").length >= 2 ? root : "";
}

function finalReturnedRootKey(candidate: ScoredCandidate): string {
  return collectionRootKey(candidate);
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
  const sourceQueryText = normalized([candidate.diagnostics?.queryText, candidate.diagnostics?.queryFamily].filter(Boolean).join(" "));
  const canUseRecoveryEvidencePattern = !candidate.diagnostics?.emergencyFallback && candidate.diagnostics?.fallbackAlignment !== "anti_zero";
  if (/\b(science adventure|science fiction|sci fi|sci-fi|space|dystopian|dystopia)\b/.test(routeText)) return /\b(science|scientist|experiment|space|planet|galaxy|robot|robots?|technology|invention|dystopian|dystopia|sci fi|sci-fi|science fiction|nonfiction|animals?|nature|wildlife|wolf|wolves)\b/;
  if (/\b(robot|ai|artificial intelligence|superhero|superheroes)\b/.test(routeText)) return /\b(robot|robots?|ai|artificial intelligence|technology|invention|superhero|superheroes|powers?)\b/;
  if (/\b(animal adventure|animals?|nature|wildlife)\b/.test(routeText)) return /\b(animal|animals|dog|cat|horse|wolf|wolves|wildlife|nature|forest|woods|survival|cozy|community|farm|creature|creatures)\b/;
  if (/\b(school adventure|school story|school|classroom|children s school stories)\b/.test(routeText)) return /\b(school|class|classroom|teacher|student|students|friendship|friends?|community|family|comedy|funny|humor|humour)\b/;
  if (canUseRecoveryEvidencePattern && /\b(superhero|super hero)\b/.test(sourceQueryText) && /\b(friendship|friends?|adventure)\b/.test(sourceQueryText)) return /\b(superhero|super hero|heroes|hero|powers?|friendship|friends?|team|adventure|quest)\b/;
  if (canUseRecoveryEvidencePattern && /\b(ocean|sea|island)\b/.test(sourceQueryText) && /\b(friendship|friends?|adventure|fantasy)\b/.test(sourceQueryText)) return /\b(ocean|sea|island|marine|friendship|friends?|adventure|quest|fantasy|magic|magical)\b/;
  if (canUseRecoveryEvidencePattern && /\b(science|robot|technology)\b/.test(sourceQueryText) && /\b(adventure|friendship|fiction)\b/.test(sourceQueryText)) return /\b(science|scientist|experiment|robot|robots?|technology|invention|friendship|friends?|adventure|quest)\b/;
  if (canUseRecoveryEvidencePattern && /\b(fantasy|magic|magical|mythology)\b/.test(sourceQueryText) && /\b(friendship|friends?|adventure|family)\b/.test(sourceQueryText)) return /\b(fantasy|magic|magical|wizard|witch|fairy|fairies|dragon|quest|kingdom|hero|heroic|myth|myths|mythology|adventure|friendship|friends?|family|school)\b/;
  if (/\b(friendship|community)\b/.test(routeText)) return /\b(friendship|friends?|community|school|family|team|classroom)\b/;
  if (/\b(fantasy mystery|mystery adventure|mystery|detective)\b/.test(routeText)) return /\b(mystery|detective|clue|clues|case|secret|secrets|puzzle|investigate|investigation)\b/;
  if (/\b(humor|funny|funny family|fantasy humor)\b/.test(routeText)) return /\b(humor|humour|funny|comedy|comic|joke|laugh|laughs|giggle|silly|school|friendship|friends?|family|quest|adventure|trail)\b/;
  if (/\b(fantasy adventure|family fantasy|fantasy|magic|magical)\b/.test(routeText)) return /\b(fantasy|magic|magical|wizard|witch|dragon|quest|kingdom|hero|heroic|adventure)\b/;
  if (/\b(contemporary|realistic)\b/.test(routeText)) return /\b(realistic|contemporary|school|classroom|friendship|friends?|family|community)\b/;
  return undefined;
}

type MiddleGradesDocumentEvidenceTier = "strong_evidence" | "medium_evidence" | "weak_evidence" | "query_only";

function middleGradesEvidenceTierRank(tier: MiddleGradesDocumentEvidenceTier): number {
  if (tier === "strong_evidence") return 3;
  if (tier === "medium_evidence") return 2;
  if (tier === "weak_evidence") return 1;
  return 0;
}

function middleGradesRouteAlignmentEvidence(candidate: ScoredCandidate): { queryLevel: boolean; documentLevel: boolean; fields: string[]; evidenceTextByField: Record<string, string>; tier: MiddleGradesDocumentEvidenceTier; demotedReason?: string } {
  if (candidate.source !== "openLibrary" || !/middle_grades_/i.test(String(candidate.diagnostics?.routingReason || ""))) return { queryLevel: false, documentLevel: false, fields: [], evidenceTextByField: {}, tier: "query_only" };
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
  const matchedFields = pattern ? docFields.filter(([, value]) => pattern.test(value)) : [];
  const fields = matchedFields.map(([field]) => field);
  const evidenceTextByField = Object.fromEntries(matchedFields.map(([field, value]) => [field, value.slice(0, 180)]));
  const titleSubtitleText = normalized([candidate.title, candidate.subtitle].filter(Boolean).join(" "));
  const humorTitleOnlyWithoutAgeEvidence = /humor|funny|comedy/i.test([candidate.diagnostics?.routingReason, candidate.diagnostics?.queryText, candidate.diagnostics?.queryFamily].filter(Boolean).join(" "))
    && fields.length > 0
    && /\b(funny|humor|humour|comedy|comic|joke|laugh|giggle)\b/.test(titleSubtitleText)
    && !middleGradesNonHumorAlignment(candidate)
    && !middleGradesFictionAgeEvidence(candidate);
  const documentLevel = fields.length > 0 && !humorTitleOnlyWithoutAgeEvidence;
  const richFields = fields.filter((field) => ["subjects", "description", "genres", "themes", "characterDynamics"].includes(field));
  const titleFields = fields.filter((field) => ["title", "subtitle"].includes(field));
  const tier: MiddleGradesDocumentEvidenceTier = richFields.length > 0 && (titleFields.length > 0 || richFields.some((field) => ["subjects", "description"].includes(field)))
    ? "strong_evidence"
    : titleFields.length > 0 && middleGradesFictionAgeEvidence(candidate)
      ? "medium_evidence"
      : titleFields.length > 0
        ? "weak_evidence"
        : "query_only";
  return {
    queryLevel,
    documentLevel,
    fields,
    evidenceTextByField,
    tier,
    demotedReason: humorTitleOnlyWithoutAgeEvidence ? "humor_keyword_title_only_without_age_or_doc_evidence" : queryLevel && !documentLevel ? "query_level_only_no_document_evidence" : undefined,
  };
}

function isMiddleGradesRouteAlignedSuccessCandidate(candidate: ScoredCandidate): boolean {
  if (candidate.source !== "openLibrary" || !/middle_grades_/i.test(String(candidate.diagnostics?.routingReason || ""))) return false;
  if (isMiddleGradesAntiZeroFallbackCandidate(candidate)) return false;
  const evidence = middleGradesRouteAlignmentEvidence(candidate);
  if (!evidence.documentLevel) return false;
  if (evidence.tier === "weak_evidence") return false;
  if (evidence.fields.length > 0 && evidence.fields.every((field) => field === "title" || field === "subtitle")) return false;
  return true;
}



function isMiddleGradesOpenLibraryCandidate(candidate: ScoredCandidate): boolean {
  return candidate.source === "openLibrary" && /middle_grades_/i.test(String(candidate.diagnostics?.routingReason || ""));
}

function middleGradesFictionAgeEvidence(candidate: ScoredCandidate): boolean {
  const text = middleGradesRawText(candidate);
  return /\b(middle grade|middle school|juvenile|children'?s|chapter book|ages?\s*(?:8|9|10|11|12)|grades?\s*(?:3|4|5|6|7))\b/.test(text)
    && /\b(fiction|novel|story|chapter book|adventure|fantasy|mystery|humor|humour|comedy)\b/.test(text);
}

function isMiddleGradesReferenceOrLocalHistoryArtifact(candidate: ScoredCandidate): boolean {
  if (!isMiddleGradesOpenLibraryCandidate(candidate)) return false;
  const evidence = middleGradesRouteAlignmentEvidence(candidate);
  if (evidence.documentLevel) return false;
  const text = middleGradesRawText(candidate);
  const referenceOrLocalHistory = /\b(history of|local history|state history|city history|county history|municipal|bibliograph(?:y|ies)|reference|encyclopedia|gazetteer|directory|atlas|handbook|manual|guide to|guidebook|archives?)\b/.test(text);
  const nonfictionLeaning = /\b(nonfiction|non fiction|history|reference|bibliography|academic|scholarly|government|municipal|county|state|local)\b/.test(text);
  const middleGradeFiction = middleGradesFictionAgeEvidence(candidate);
  return referenceOrLocalHistory && nonfictionLeaning && !middleGradeFiction;
}


function isMiddleGradesHumorRouteCandidate(candidate: ScoredCandidate): boolean {
  return /humor|funny|comedy/i.test([candidate.diagnostics?.routingReason, candidate.diagnostics?.queryText, candidate.diagnostics?.queryFamily].filter(Boolean).join(" "));
}

function middleGradesNonHumorAlignment(candidate: ScoredCandidate): boolean {
  const text = middleGradesRawText(candidate);
  return /\b(adventure|friendship|friends?|community|survival|school|family|quest|team)\b/.test(text);
}

function middleGradesAdultOrYaHumorLeakage(candidate: ScoredCandidate): boolean {
  if (!isMiddleGradesHumorRouteCandidate(candidate)) return false;
  if (middleGradesFictionAgeEvidence(candidate)) return false;
  const text = middleGradesRawText(candidate);
  return /\b(young adult|ya fiction|adult fiction|literary fiction|high school|college|suicide|depression|mental hospital|play|drama|classic literature|moliere|satire)\b/.test(text);
}

function middleGradesHumorKeywordOnlyLeakage(candidate: ScoredCandidate): boolean {
  if (!isMiddleGradesHumorRouteCandidate(candidate)) return false;
  const evidence = middleGradesRouteAlignmentEvidence(candidate);
  if (evidence.fields.length === 0) return false;
  const titleText = normalized([candidate.title, candidate.subtitle].filter(Boolean).join(" "));
  if (!/\b(funny|humor|humour|comedy|comic|joke|laugh|giggle)\b/.test(titleText)) return false;
  return !middleGradesFictionAgeEvidence(candidate) && !middleGradesNonHumorAlignment(candidate);
}

function middleGradesTitleOnlyRouteEvidence(candidate: ScoredCandidate): boolean {
  const evidence = middleGradesRouteAlignmentEvidence(candidate);
  return evidence.fields.length > 0 && evidence.fields.every((field) => field === "title" || field === "subtitle");
}

function middleGradesSupportedRouteEvidenceFields(candidate: ScoredCandidate): string[] {
  const evidence = middleGradesRouteAlignmentEvidence(candidate);
  return evidence.fields.filter((field) => !["title", "subtitle"].includes(field));
}

function middleGradesFinalEligibility(candidate: ScoredCandidate): { allowed: boolean; evidence: string[]; rejectedReason?: string; emergencyOverride?: boolean } {
  if (!isMiddleGradesOpenLibraryCandidate(candidate)) return { allowed: true, evidence: ["not_middle_grades_openlibrary"] };
  if (isMiddleGradesReferenceOrLocalHistoryArtifact(candidate)) return { allowed: false, evidence: [], rejectedReason: "middle_grades_reference_or_local_history_artifact" };
  if (middleGradesAdultOrYaHumorLeakage(candidate)) return { allowed: false, evidence: [], rejectedReason: "adult_or_ya_humor_leakage" };
  if (middleGradesHumorKeywordOnlyLeakage(candidate)) return { allowed: false, evidence: [], rejectedReason: "humor_keyword_only_leakage" };
  const routeEvidence = middleGradesRouteAlignmentEvidence(candidate);
  const supportedFields = middleGradesSupportedRouteEvidenceFields(candidate);
  const hasIndependentSupport = supportedFields.length > 0 || routeEvidence.fields.length >= 2 && !middleGradesTitleOnlyRouteEvidence(candidate);
  if (routeEvidence.documentLevel && routeEvidence.fields.length > 0 && hasIndependentSupport) return { allowed: true, evidence: routeEvidence.fields.map((field) => `document_route:${field}`) };
  if (middleGradesFictionAgeEvidence(candidate) && hasIndependentSupport) return { allowed: true, evidence: ["middle_grade_fiction_metadata", ...routeEvidence.fields.map((field) => `document_route:${field}`)] };
  if (middleGradesTitleOnlyRouteEvidence(candidate)) return { allowed: false, evidence: routeEvidence.fields.map((field) => `document_route:${field}`), rejectedReason: "title_only_route_evidence_missing_support" };
  if (isMiddleGradesAntiZeroFallbackCandidate(candidate)) return { allowed: true, evidence: ["explicit_emergency_fallback"], emergencyOverride: true };
  if (routeEvidence.queryLevel && !routeEvidence.documentLevel) return { allowed: false, evidence: [], rejectedReason: "middle_grades_query_only_missing_document_evidence" };
  return { allowed: false, evidence: [], rejectedReason: "middle_grades_missing_route_or_fiction_evidence" };
}

function applyMiddleGradesQueryOnlyScoreCaps(candidates: ScoredCandidate[], profile: TasteProfile, rejectedReasons: Record<string, number>): void {
  if (profile.ageBand !== "preteens") return;
  const queryOnlyScoreCapAppliedByTitle: Record<string, boolean> = {};
  const queryOnlyScoreCapReasonByTitle: Record<string, string> = {};
  let missingDocumentEvidenceCount = 0;
  for (const candidate of candidates) {
    if (!isMiddleGradesOpenLibraryCandidate(candidate)) continue;
    const routeEvidence = middleGradesRouteAlignmentEvidence(candidate);
    if (!routeEvidence.queryLevel || routeEvidence.documentLevel || routeEvidence.fields.length > 0) continue;
    const breakdown = candidate.scoreBreakdown || {};
    const beforeGenre = Number(breakdown.genreFacetMatch || 0);
    const beforePositive = Number(breakdown.positiveTasteMatch || 0);
    const beforeRung = Number(breakdown.queryRungBonus || 0);
    const cappedGenre = Math.min(beforeGenre, 0.15);
    const cappedPositive = Math.min(beforePositive, 0.35);
    const cappedRung = Math.min(beforeRung, 0);
    breakdown.genreFacetMatch = cappedGenre;
    breakdown.positiveTasteMatch = cappedPositive;
    breakdown.queryRungBonus = cappedRung;
    breakdown.queryOnlyEvidencePenalty = Math.min(Number(breakdown.queryOnlyEvidencePenalty || 0), -4);
    const delta = (cappedGenre - beforeGenre) + (cappedPositive - beforePositive) + (cappedRung - beforeRung) + Number(breakdown.queryOnlyEvidencePenalty || 0);
    candidate.score = Math.round((candidate.score + delta) * 1000) / 1000;
    candidate.scoreBreakdown = breakdown;
    candidate.rejectedReasons.push("middle_grades_query_only_score_cap_applied");
    candidate.diagnostics.queryOnlyScoreCapApplied = true;
    candidate.diagnostics.queryOnlyScoreCapReason = "query_level_route_match_without_document_evidence";
    queryOnlyScoreCapAppliedByTitle[candidate.title] = true;
    queryOnlyScoreCapReasonByTitle[candidate.title] = "query_level_route_match_without_document_evidence";
    missingDocumentEvidenceCount += 1;
  }
  if (missingDocumentEvidenceCount > 0) {
    (rejectedReasons as Record<string, unknown>).queryOnlyScoreCapAppliedByTitle = queryOnlyScoreCapAppliedByTitle;
    (rejectedReasons as Record<string, unknown>).queryOnlyScoreCapReasonByTitle = queryOnlyScoreCapReasonByTitle;
    rejectedReasons.documentEvidenceRequiredButMissingCount = missingDocumentEvidenceCount;
  }
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
  if (evidence.tier === "strong_evidence") score += 2.5;
  else if (evidence.tier === "medium_evidence") score += 1.5;
  else if (evidence.tier === "weak_evidence") score += 0.35;
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
  if (evidence.tier === "weak_evidence") penalty += 0.8;
  if (/\b(middle grade adventure|fantasy adventure|school adventure|school story|science adventure|animal adventure|humor|funny)\b/.test(text) && Number(breakdown.genreFacetMatch || 0) <= 0) penalty += 0.7;
  if (/\b(school story|school adventure|humor|funny|middle grade humor|children s funny books)\b/.test(text) && Number(breakdown.genreFacetMatch || 0) <= 0 && (!candidate.matchedSignals || candidate.matchedSignals.length === 0)) penalty += 0.9;
  return Math.round(penalty * 1000) / 1000;
}


function middleGradesSelectionScore(candidate: ScoredCandidate, profile: TasteProfile): number {
  if (profile.ageBand !== "preteens") return candidate.score;
  return candidate.score + (middleGradesRouteAlignmentScore(candidate) * 1.2) - (middleGradesFallbackPenalty(candidate) * 1.4);
}

function middleGradesTasteAlignment(candidate: ScoredCandidate): number {
  const breakdown = candidate.scoreBreakdown || {};
  const matchedSignals = Array.isArray(candidate.matchedSignals) ? candidate.matchedSignals.length : 0;
  return Math.round((
    Number(breakdown.positiveTasteMatch || 0)
    + Number(breakdown.genreFacetMatch || 0)
    + Number(breakdown.themeMatch || 0)
    + Number(breakdown.toneMatch || 0)
    + matchedSignals * 0.25
  ) * 1000) / 1000;
}

function isMiddleGradesFallbackOrDefaultCandidate(candidate: ScoredCandidate): boolean {
  const evidence = middleGradesRouteAlignmentEvidence(candidate);
  return isMiddleGradesAntiZeroFallbackCandidate(candidate)
    || (evidence.queryLevel && !evidence.documentLevel)
    || middleGradesFallbackPenalty(candidate) > 0
    || isMiddleGradesHumorDefaultQueryFamily(candidate)
    || isMiddleGradesContemporarySchoolDefaultCandidate(candidate);
}

function middleGradesDocumentBackedTasteSignals(candidate: ScoredCandidate): string[] {
  const signals = Array.isArray(candidate.diagnostics?.documentBackedTasteSignals)
    ? candidate.diagnostics.documentBackedTasteSignals.map(String)
    : Array.isArray(candidate.diagnostics?.documentOnlyTasteMatch)
      ? candidate.diagnostics.documentOnlyTasteMatch.map(String)
      : [];
  return signals.map(normalized).filter(Boolean);
}

function asStringList(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item || "").trim()).filter(Boolean) : typeof value === "string" && value.trim() ? [value.trim()] : [];
}

function rawOpenLibraryDescription(raw: Record<string, unknown>): string {
  const description = typeof raw.description === "string"
    ? raw.description
    : typeof (raw.description as { value?: unknown } | undefined)?.value === "string"
      ? String((raw.description as { value: string }).value)
      : "";
  return description || asStringList(raw.first_sentence).join(" ");
}

function profilePositiveSignals(profile: TasteProfile): string[] {
  return [...profile.genreFamily, ...profile.themes, ...profile.tone, ...profile.characterDynamics, ...profile.formatPreference]
    .filter((signal) => Number(signal.weight || 0) > 0)
    .map((signal) => String(signal.value || ""))
    .filter(Boolean);
}

function middleGradesZeroTasteEvidenceAudit(candidate: ScoredCandidate, profile: TasteProfile): Record<string, unknown> {
  const raw = (candidate.raw || {}) as Record<string, unknown>;
  const rawSubjects = Array.from(new Set([
    ...asStringList(raw.subject),
    ...asStringList(raw.subjects),
    ...asStringList(raw.subject_facet),
  ]));
  const rawDescription = rawOpenLibraryDescription(raw);
  const normalizedDocumentText = normalized([
    candidate.title,
    candidate.subtitle,
    candidate.description,
    rawDescription,
    ...rawSubjects,
    ...asStringList(candidate.genres),
    ...asStringList(candidate.themes),
    ...asStringList(candidate.tones),
    ...asStringList(candidate.characterDynamics),
  ].join(" "));
  const queryText = normalized([candidate.diagnostics?.queryText, candidate.diagnostics?.queryFamily].filter(Boolean).join(" "));
  const positiveSignals = profilePositiveSignals(profile);
  const matchedLikedSignalsBeforeEvidenceGate = positiveSignals.filter((signal) => {
    const value = normalized(signal);
    return Boolean(value && (normalizedDocumentText.includes(value) || queryText.includes(value)));
  });
  const documentBackedSignals = new Set(middleGradesDocumentBackedTasteSignals(candidate));
  const signalEvidenceFailures = matchedLikedSignalsBeforeEvidenceGate.reduce<Record<string, string>>((acc, signal) => {
    const value = normalized(signal);
    if (!value) return acc;
    if (documentBackedSignals.has(value)) return acc;
    if (queryText.includes(value) && !normalizedDocumentText.includes(value)) acc[signal] = "matched_only_query_or_family_text_not_document_metadata";
    else if (!normalizedDocumentText.includes(value)) acc[signal] = "missing_from_title_description_subjects_genres_themes";
    else acc[signal] = "present_in_document_text_but_not_credited_by_document_backed_signal_extraction";
    return acc;
  }, {});
  return {
    title: candidate.title,
    sourceQuery: String(candidate.diagnostics?.queryText || candidate.diagnostics?.queryFamily || ""),
    rawSubjects,
    rawFirstSentenceOrDescription: rawDescription,
    normalizedGenres: asStringList(candidate.genres),
    normalizedThemes: asStringList(candidate.themes),
    normalizedTags: [...asStringList(candidate.tones), ...asStringList(candidate.characterDynamics), ...asStringList(candidate.formats)],
    matchedLikedSignalsBeforeEvidenceGate,
    documentBackedTasteSignals: Array.from(documentBackedSignals),
    signalEvidenceFailures,
    missingEvidenceFieldOrFailedPredicate: Object.keys(signalEvidenceFailures).length > 0
      ? "matched_signals_failed_document_backed_credit"
      : rawSubjects.length === 0 && !rawDescription
        ? "missing_subjects_and_description"
        : "no_profile_liked_signal_present_in_document_metadata",
    rejectedReasons: candidate.rejectedReasons,
  };
}

function isMiddleGradesExplicitEmergencyFallback(candidate: ScoredCandidate): boolean {
  return Boolean(candidate.diagnostics?.emergencyFallback) || candidate.rejectedReasons.includes("accepted_middle_grades_zero_final_items_guard") || candidate.rejectedReasons.includes("emergency_fallback_zero_taste_fill");
}

function middleGradesMeaningfulTasteEligibility(candidate: ScoredCandidate, allowExplicitEmergency = false): { allowed: boolean; reason?: "zero_doc_backed_taste_match" | "broad_adventure_only_taste_match" } {
  if (candidate.source !== "openLibrary") return { allowed: true };
  if (allowExplicitEmergency && isMiddleGradesExplicitEmergencyFallback(candidate)) return { allowed: true };
  if (middleGradesCleanExpansionRouteFictionSupport(candidate)) return { allowed: true };
  const hasDocumentBackedTasteDiagnostics = Array.isArray(candidate.diagnostics?.documentBackedTasteSignals) || Array.isArray(candidate.diagnostics?.documentOnlyTasteMatch);
  if (!hasDocumentBackedTasteDiagnostics) return { allowed: true };
  const breakdown = candidate.scoreBreakdown || {};
  const tasteScore = Number(breakdown.genreFacetMatch || 0) + Number(breakdown.positiveTasteMatch || 0);
  if (tasteScore <= 0) return { allowed: false, reason: "zero_doc_backed_taste_match" };
  const backedSignals = middleGradesDocumentBackedTasteSignals(candidate);
  if (backedSignals.length > 0 && backedSignals.every((signal) => signal === "adventure")) return { allowed: false, reason: "broad_adventure_only_taste_match" };
  return { allowed: true };
}

function isMiddleGradesCleanExpansionCandidate(candidate: ScoredCandidate): boolean {
  return Boolean(candidate.diagnostics?.cleanCandidateShortfallExpansion)
    || candidate.diagnostics?.scoringHandoffStage === "clean_candidate_shortfall_expansion"
    || candidate.diagnostics?.scoringHandoffSource === "clean_candidate_shortfall_expansion";
}

function middleGradesCleanExpansionRouteFictionSupport(candidate: ScoredCandidate): boolean {
  if (!isMiddleGradesCleanExpansionCandidate(candidate)) return false;
  const finalEligibility = middleGradesFinalEligibility(candidate);
  if (!finalEligibility.allowed) return false;
  if (!middleGradesFictionAgeEvidence(candidate)) return false;
  if (middleGradesSupportedRouteEvidenceFields(candidate).length === 0) return false;
  if (candidate.score < 0) return false;
  if (candidate.rejectedReasons.includes("middle_grades_query_only_score_cap_applied")) return false;
  if (candidate.rejectedReasons.includes("humor_keyword_only_leakage")) return false;
  if (candidate.rejectedReasons.includes("non_positive_score")) return false;
  return true;
}

function applyMiddleGradesMeaningfulTasteFinalGate(selected: ScoredCandidate[], rejectedReasons: Record<string, number>, profile: TasteProfile): void {
  if (profile.ageBand !== "preteens") return;
  for (let index = selected.length - 1; index >= 0; index -= 1) {
    const candidate = selected[index];
    const eligibility = middleGradesMeaningfulTasteEligibility(candidate);
    if (eligibility.allowed) continue;
    if (isMiddleGradesExplicitEmergencyFallback(candidate)) {
      if (!candidate.rejectedReasons.includes("emergency_fallback_zero_taste_fill")) candidate.rejectedReasons.push("emergency_fallback_zero_taste_fill");
      rejectedReasons.emergency_fallback_zero_taste_fill = Number(rejectedReasons.emergency_fallback_zero_taste_fill || 0) + 1;
      continue;
    }
    selected.splice(index, 1);
    candidate.rejectedReasons.push(eligibility.reason || "middle_grades_missing_meaningful_taste_evidence");
    rejectedReasons[eligibility.reason || "middle_grades_missing_meaningful_taste_evidence"] = Number(rejectedReasons[eligibility.reason || "middle_grades_missing_meaningful_taste_evidence"] || 0) + 1;
  }
}

function middleGradesQualityAuditRow(candidate: ScoredCandidate, selected: Set<ScoredCandidate>, selectedRoots: Set<string>, profile: TasteProfile, rejectionReason?: string): Record<string, unknown> {
  const evidence = middleGradesRouteAlignmentEvidence(candidate);
  const eligibility = middleGradesFinalEligibility(candidate);
  const root = finalReturnedRootKey(candidate) || seriesKey(candidate);
  return {
    title: candidate.title,
    sourceQuery: String(candidate.diagnostics?.queryText || candidate.diagnostics?.queryFamily || ""),
    routeEvidenceTier: evidence.tier,
    documentEvidenceFields: evidence.fields,
    tasteSignalsMatched: candidate.matchedSignals || [],
    tasteAlignmentScore: middleGradesTasteAlignment(candidate),
    score: candidate.score,
    adjustedSelectionScore: middleGradesSelectionScore(candidate, profile),
    scoreComponents: candidate.scoreBreakdown || {},
    fallbackDefaultStatus: isMiddleGradesFallbackOrDefaultCandidate(candidate)
      ? (isMiddleGradesAntiZeroFallbackCandidate(candidate) ? "fallback" : "default_or_weak_evidence")
      : "route_aligned",
    sameRootCollectionRoot: root,
    finalEligibilityAllowed: eligibility.allowed,
    finalEligibilityEvidence: eligibility.evidence,
    finalEligibilityRejectedReason: eligibility.rejectedReason,
    selected: selected.has(candidate),
    rejectionReason: rejectionReason || candidate.rejectedReasons.join(",") || (selected.has(candidate) ? "selected" : "not_selected_after_ranking_and_diversity"),
    wouldImproveSlateDiversity: !root || !selectedRoots.has(root),
  };
}

function applyMiddleGradesFallbackEvidencePrecedence(rankedCandidates: ScoredCandidate[], selected: ScoredCandidate[], rejectedReasons: Record<string, number>, profile: TasteProfile): void {
  if (profile.ageBand !== "preteens" || selected.length === 0) return;
  const diagnostics = rejectedReasons as Record<string, unknown>;
  const selectedSet = () => new Set(selected);
  const selectedTitles = () => new Set(selected.map((candidate) => normalized(candidate.title)));
  const selectedRoots = () => new Set(selected.map((candidate) => finalReturnedRootKey(candidate) || seriesKey(candidate)).filter(Boolean));
  const explanations: Record<string, string> = {};
  for (let index = 0; index < selected.length; index += 1) {
    const fallback = selected[index];
    if (!isMiddleGradesFallbackOrDefaultCandidate(fallback)) continue;
    const fallbackTierRank = middleGradesEvidenceTierRank(middleGradesRouteAlignmentEvidence(fallback).tier);
    const fallbackTaste = middleGradesTasteAlignment(fallback);
    const stronger = rankedCandidates.find((candidate) => {
      if (selectedSet().has(candidate)) return false;
      if (!isMiddleGradesOpenLibraryCandidate(candidate)) return false;
      if (!candidate.title.trim()) return false;
      if (candidate.maturityBand && String(candidate.maturityBand) !== profile.maturityBand) return false;
      if (rejectReason(candidate, profile)) return false;
      const eligibility = middleGradesFinalEligibility(candidate);
      if (!eligibility.allowed) return false;
      const evidence = middleGradesRouteAlignmentEvidence(candidate);
      if (middleGradesEvidenceTierRank(evidence.tier) <= fallbackTierRank) return false;
      if (middleGradesTasteAlignment(candidate) + 0.001 < fallbackTaste) return false;
      if (selectedTitles().has(normalized(candidate.title))) {
        explanations[fallback.title] = `stronger_evidence_candidate_${candidate.title}_blocked_by_duplicate_title`;
        return false;
      }
      const root = finalReturnedRootKey(candidate) || seriesKey(candidate);
      if (root && selectedRoots().has(root)) {
        explanations[fallback.title] = `stronger_evidence_candidate_${candidate.title}_blocked_by_duplicate_root_${root}`;
        return false;
      }
      return true;
    });
    if (!stronger) {
      explanations[fallback.title] ||= "no_stronger_document_evidence_candidate_with_equal_or_better_taste_alignment_survived_safety_diversity_gates";
      continue;
    }
    fallback.rejectedReasons.push("middle_grades_fallback_default_replaced_by_stronger_document_evidence");
    stronger.rejectedReasons.push("middle_grades_stronger_document_evidence_selected_over_fallback_default");
    selected[index] = stronger;
    explanations[fallback.title] = `replaced_by_${stronger.title}_stronger_document_evidence_equal_or_better_taste`;
    rejectedReasons.middle_grades_fallback_default_replaced_by_stronger_document_evidence = Number(rejectedReasons.middle_grades_fallback_default_replaced_by_stronger_document_evidence || 0) + 1;
  }
  diagnostics.middleGradesFallbackDefaultPrecedenceExplanations = explanations;
}

function applyMiddleGradesMediumStrongEvidencePreference(rankedCandidates: ScoredCandidate[], selected: ScoredCandidate[], rejectedReasons: Record<string, number>, profile: TasteProfile): void {
  if (profile.ageBand !== "preteens" || selected.length === 0) return;
  const selectedTitles = () => new Set(selected.map((candidate) => normalized(candidate.title)));
  const selectedRoots = () => new Set(selected.map((candidate) => finalReturnedRootKey(candidate) || seriesKey(candidate)).filter(Boolean));
  const mediumStrongPool = rankedCandidates
    .filter((candidate) => {
      if (selected.includes(candidate)) return false;
      const evidence = middleGradesRouteAlignmentEvidence(candidate);
      if (middleGradesEvidenceTierRank(evidence.tier) < middleGradesEvidenceTierRank("medium_evidence")) return false;
      if (isMiddleGradesTitleOnlyEvidence(candidate)) return false;
      if (rejectReason(candidate, profile)) return false;
      if (!middleGradesFinalEligibility(candidate).allowed) return false;
      if (selectedTitles().has(normalized(candidate.title))) return false;
      const root = finalReturnedRootKey(candidate) || seriesKey(candidate);
      if (root && selectedRoots().has(root)) return false;
      return true;
    })
    .sort((a, b) => middleGradesSelectionScore(b, profile) - middleGradesSelectionScore(a, profile));
  for (const candidate of mediumStrongPool) {
    const replacementIndex = selected
      .map((row, index) => ({ row, index, tier: middleGradesRouteAlignmentEvidence(row).tier, adjusted: middleGradesSelectionScore(row, profile) }))
      .filter(({ row, tier }) => isMiddleGradesTitleOnlyEvidence(row) || tier === "weak_evidence" || isMiddleGradesFallbackOrDefaultCandidate(row))
      .sort((a, b) => middleGradesEvidenceTierRank(a.tier) - middleGradesEvidenceTierRank(b.tier) || a.adjusted - b.adjusted)[0]?.index;
    if (replacementIndex === undefined) break;
    selected[replacementIndex].rejectedReasons.push("middle_grades_weak_evidence_replaced_by_medium_strong_document_evidence");
    candidate.rejectedReasons.push("middle_grades_medium_strong_document_evidence_selected_over_weak_fallback");
    selected[replacementIndex] = candidate;
    rejectedReasons.middle_grades_medium_strong_evidence_replacements = Number(rejectedReasons.middle_grades_medium_strong_evidence_replacements || 0) + 1;
  }
}

function applyMiddleGradesFinalCountRecovery(rankedCandidates: ScoredCandidate[], selected: ScoredCandidate[], rejectedReasons: Record<string, number>, profile: TasteProfile, limit: number): void {
  if (profile.ageBand !== "preteens" || selected.length >= Math.min(5, limit)) return;
  const target = Math.min(5, limit);
  const selectedTitles = () => new Set(selected.map((candidate) => normalized(candidate.title)));
  const selectedRoots = () => new Set(selected.map(seriesKey).filter(Boolean));
  const safePool = rankedCandidates.filter((candidate) => {
    if (selected.includes(candidate)) return false;
    if (candidate.source !== "openLibrary" || !/middle_grades_/i.test(String(candidate.diagnostics?.routingReason || ""))) return false;
    if (!candidate.title.trim()) return false;
    if (candidate.maturityBand && String(candidate.maturityBand) !== profile.maturityBand) return false;
    if (selectedTitles().has(normalized(candidate.title))) return false;
    const rootKey = seriesKey(candidate);
    if (rootKey && selectedRoots().has(rootKey)) return false;
    const eligibility = middleGradesFinalEligibility(candidate);
    if (!eligibility.allowed) return false;
    const breakdown = candidate.scoreBreakdown || {};
    const ageSuitability = Number(breakdown.ageTeenSuitability || breakdown.ageBandSuitability || 0);
    const preciseAvoid = Number(breakdown.avoidSignalPenalty || 0);
    return candidate.score > -8 && ageSuitability > -4 && preciseAvoid > -4;
  }).sort((a, b) => middleGradesSelectionScore(b, profile) - middleGradesSelectionScore(a, profile));
  rejectedReasons.middle_grades_final_count_recovery_candidates = safePool.length;
  for (const candidate of safePool) {
    if (selected.length >= target) break;
    if (selectedTitles().has(normalized(candidate.title))) continue;
    const rootKey = seriesKey(candidate);
    if (rootKey && selectedRoots().has(rootKey)) continue;
    const reason = rejectReason(candidate, profile);
    candidate.rejectedReasons.push(reason === "non_positive_score" ? "middle_grades_final_count_recovery_low_score_safe_candidate" : "middle_grades_final_count_recovery_safe_candidate");
    rejectedReasons.middle_grades_final_count_recovery_accepted = Number(rejectedReasons.middle_grades_final_count_recovery_accepted || 0) + 1;
    selected.push(candidate);
  }
  if (selected.length < target) {
    (rejectedReasons as Record<string, unknown>).underfillRecoveryStoppedReason = safePool.length ? "safe_recovery_candidates_exhausted_before_target" : "no_safe_recovery_candidates_remaining";
  } else {
    (rejectedReasons as Record<string, unknown>).underfillRecoveryStoppedReason = "count_contract_satisfied_after_final_recovery";
  }
  (rejectedReasons as Record<string, unknown>).remainingUnattemptedReliableFallbacks = safePool
    .filter((candidate) => !selected.includes(candidate))
    .map((candidate) => String(candidate.diagnostics?.queryText || candidate.diagnostics?.queryFamily || "unknown"))
    .filter((value, index, array) => value && array.indexOf(value) === index)
    .slice(0, 8);
}

function applyMiddleGradesFinalReturnedRootCollapseAndRecovery(rankedCandidates: ScoredCandidate[], selected: ScoredCandidate[], rejectedReasons: Record<string, number>, profile: TasteProfile, limit: number): void {
  if (profile.ageBand !== "preteens" || selected.length === 0) return;
  const diagnostics = rejectedReasons as Record<string, unknown>;
  const target = Math.min(5, limit);
  const beforeCount = selected.length;
  const seenReturnedRoots = new Set<string>();
  const collapsedTitles: string[] = [];
  for (let index = 0; index < selected.length; index += 1) {
    const candidate = selected[index];
    const rootKey = finalReturnedRootKey(candidate);
    if (!rootKey) continue;
    if (seenReturnedRoots.has(rootKey)) {
      collapsedTitles.push(candidate.title);
      candidate.rejectedReasons.push("middle_grades_final_returned_root_collapsed");
      selected.splice(index, 1);
      index -= 1;
      continue;
    }
    seenReturnedRoots.add(rootKey);
  }

  if (collapsedTitles.length > 0) {
    diagnostics.finalReturnedRootCollapseApplied = true;
    diagnostics.finalReturnedRootCollapsedTitles = collapsedTitles;
    rejectedReasons.middle_grades_final_returned_root_collapsed = collapsedTitles.length;
  }
  const rootCollapseCausedUnderfill = collapsedTitles.length > 0 && beforeCount >= target && selected.length < target;
  if (rootCollapseCausedUnderfill) diagnostics.rootCollapseCausedUnderfill = true;

  if (selected.length >= target) return;
  const selectedTitles = () => new Set(selected.map((candidate) => normalized(candidate.title)));
  const selectedRoots = () => new Set(selected.map(finalReturnedRootKey).filter(Boolean));
  const safeRoutePool = rankedCandidates.filter((candidate) => {
    if (selected.includes(candidate)) return false;
    if (candidate.source !== "openLibrary" || !/middle_grades_/i.test(String(candidate.diagnostics?.routingReason || ""))) return false;
    if (!candidate.title.trim()) return false;
    if (candidate.maturityBand && String(candidate.maturityBand) !== profile.maturityBand) return false;
    if (selectedTitles().has(normalized(candidate.title))) return false;
    const rootKey = finalReturnedRootKey(candidate);
    if (rootKey && selectedRoots().has(rootKey)) return false;
    if (rejectReason(candidate, profile)) return false;
    const eligibility = middleGradesFinalEligibility(candidate);
    if (!eligibility.allowed) return false;
    const breakdown = candidate.scoreBreakdown || {};
    const ageSuitability = Number(breakdown.ageTeenSuitability || breakdown.ageBandSuitability || 0);
    const preciseAvoid = Number(breakdown.avoidSignalPenalty || 0);
    return candidate.score > -8 && ageSuitability > -4 && preciseAvoid > -4;
  }).sort((a, b) => middleGradesSelectionScore(b, profile) - middleGradesSelectionScore(a, profile));

  if (rankedCandidates.some((candidate) => candidate.source === "openLibrary") && safeRoutePool.length > 0) {
    diagnostics.underfillWithRawDocsAndQueriesRemaining = true;
  }
  if (rootCollapseCausedUnderfill && safeRoutePool.length > 0) diagnostics.recoveryAfterRootCollapseAttempted = true;

  for (const candidate of safeRoutePool) {
    if (selected.length >= target) break;
    const rootKey = finalReturnedRootKey(candidate);
    if (selectedTitles().has(normalized(candidate.title)) || (rootKey && selectedRoots().has(rootKey))) continue;
    candidate.rejectedReasons.push(rootCollapseCausedUnderfill ? "middle_grades_recovery_after_root_collapse_accepted" : "middle_grades_underfill_with_raw_docs_recovery_accepted");
    selected.push(candidate);
    if (rootCollapseCausedUnderfill) rejectedReasons.recoveryAfterRootCollapseAcceptedCount = Number(rejectedReasons.recoveryAfterRootCollapseAcceptedCount || 0) + 1;
    rejectedReasons.middle_grades_underfill_with_raw_docs_recovery_accepted = Number(rejectedReasons.middle_grades_underfill_with_raw_docs_recovery_accepted || 0) + 1;
  }
}


function isMiddleGradesTitleOnlyEvidence(candidate: ScoredCandidate): boolean {
  const evidence = middleGradesRouteAlignmentEvidence(candidate);
  if (evidence.tier === "query_only") return false;
  return evidence.fields.length > 0 && evidence.fields.every((field) => field === "title" || field === "subtitle");
}

function applyMiddleGradesTitleOnlyEvidenceCap(rankedCandidates: ScoredCandidate[], selected: ScoredCandidate[], rejectedReasons: Record<string, number>, profile: TasteProfile): void {
  if (profile.ageBand !== "preteens") return;
  const maxTitleOnly = 3;
  const selectedTitleOnly = () => selected.filter(isMiddleGradesTitleOnlyEvidence);
  if (selectedTitleOnly().length <= maxTitleOnly) return;
  const selectedTitles = () => new Set(selected.map((candidate) => normalized(candidate.title)));
  const selectedRoots = () => new Set(selected.map(seriesKey).filter(Boolean));
  const richerEvidencePool = rankedCandidates.filter((candidate) => {
    if (!isMiddleGradesOpenLibraryCandidate(candidate)) return false;
    if (selected.includes(candidate)) return false;
    if (rejectReason(candidate, profile)) return false;
    if (selectedTitles().has(normalized(candidate.title))) return false;
    const rootKey = seriesKey(candidate);
    if (rootKey && selectedRoots().has(rootKey)) return false;
    const evidence = middleGradesRouteAlignmentEvidence(candidate);
    return evidence.documentLevel && evidence.tier !== "query_only" && !isMiddleGradesTitleOnlyEvidence(candidate);
  }).sort((a, b) => {
    const tierDelta = middleGradesEvidenceTierRank(middleGradesRouteAlignmentEvidence(b).tier) - middleGradesEvidenceTierRank(middleGradesRouteAlignmentEvidence(a).tier);
    return tierDelta || middleGradesSelectionScore(b, profile) - middleGradesSelectionScore(a, profile);
  });
  if (!richerEvidencePool.length) return;
  rejectedReasons.middle_grades_title_only_selected_before_cap = selectedTitleOnly().length;
  rejectedReasons.middle_grades_richer_document_evidence_replacement_candidates = richerEvidencePool.length;
  for (const candidate of richerEvidencePool) {
    if (selectedTitleOnly().length <= maxTitleOnly) break;
    const replacementIndex = selected
      .map((row, index) => ({ row, index, adjusted: middleGradesSelectionScore(row, profile) }))
      .filter(({ row }) => isMiddleGradesTitleOnlyEvidence(row))
      .sort((a, b) => a.adjusted - b.adjusted)[0]?.index;
    if (replacementIndex === undefined) break;
    selected[replacementIndex].rejectedReasons.push("middle_grades_title_only_replaced_by_richer_document_evidence");
    candidate.rejectedReasons.push("middle_grades_richer_document_evidence_selected_over_title_only");
    selected[replacementIndex] = candidate;
    rejectedReasons.middle_grades_title_only_replacements = Number(rejectedReasons.middle_grades_title_only_replacements || 0) + 1;
  }
  rejectedReasons.middle_grades_title_only_selected_after_cap = selectedTitleOnly().length;
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
      .map((row, index) => ({ row, index, adjusted: middleGradesSelectionScore(row, profile), alignment: middleGradesRouteAlignmentScore(row), fallbackPenalty: middleGradesFallbackPenalty(row), tierRank: middleGradesEvidenceTierRank(middleGradesRouteAlignmentEvidence(row).tier) }))
      .filter(({ row, alignment, fallbackPenalty, tierRank }) => row.source === "openLibrary" && /middle_grades_/i.test(String(row.diagnostics?.routingReason || "")) && (fallbackPenalty > 0 || alignment < middleGradesRouteAlignmentScore(candidate) || tierRank < middleGradesEvidenceTierRank(middleGradesRouteAlignmentEvidence(candidate).tier)))
      .sort((a, b) => a.adjusted - b.adjusted)[0]?.index;
    if (replacementIndex === undefined) break;
    const replaced = selected[replacementIndex];
    const candidateTierRank = middleGradesEvidenceTierRank(middleGradesRouteAlignmentEvidence(candidate).tier);
    const replacedTierRank = middleGradesEvidenceTierRank(middleGradesRouteAlignmentEvidence(replaced).tier);
    if (candidateTierRank <= replacedTierRank && candidateAdjusted + 0.35 < middleGradesSelectionScore(replaced, profile)) continue;
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
  const queryTextSignalsRemovedFromTasteMatchByTitle: Record<string, string[]> = {};
  const documentOnlyTasteMatchByTitle: Record<string, string[]> = {};
  const fallbackPenaltyByTitle: Record<string, number> = {};
  const finalSelectionReasonByTitle: Record<string, string> = {};
  const candidateTasteMatchScoreByTitle: Record<string, number> = {};
  const candidateTastePenaltyByTitle: Record<string, number> = {};
  const candidateMatchedLikedSignalsByTitle: Record<string, string[]> = {};
  const candidateMatchedDislikedSignalsByTitle: Record<string, string[]> = {};
  const finalScoreComponentsByTitle: Record<string, Record<string, number>> = {};
  const finalRankingReasonByTitle: Record<string, string> = {};
  const middleGradesScoredCandidateAttribution: Array<Record<string, unknown>> = [];
  const genericTasteSignalsRemovedByTitle: Record<string, string[]> = {};
  const documentBackedTasteSignalsByTitle: Record<string, string[]> = {};
  const genericOnlyTasteMatchTitles: string[] = [];
  const queryLevelRouteAlignmentByTitle: Record<string, boolean> = {};
  const documentLevelRouteAlignmentByTitle: Record<string, boolean> = {};
  const routeAlignmentEvidenceFieldsByTitle: Record<string, string[]> = {};
  const documentEvidenceTierByTitle: Record<string, MiddleGradesDocumentEvidenceTier> = {};
  const documentEvidenceTextByTitle: Record<string, Record<string, string>> = {};
  const routeAlignmentDemotedReasonByTitle: Record<string, string> = {};
  const finalEligibilityEvidenceByTitle: Record<string, string[]> = {};
  const finalEligibilityEvidenceFieldCountByTitle: Record<string, number> = {};
  const emergencyFallbackOverrideUsedByTitle: Record<string, string> = {};
  const routeAlignedCandidateRejectedForFallbackReason: Record<string, string> = {};
  const finalEligibilityRejectedQueryOnlyTitles: string[] = [];
  const humorKeywordOnlyLeakageByTitle: Record<string, boolean> = {};
  const humorKeywordOnlyRejectedTitles: string[] = [];
  const preteenAgeShapeEvidenceByTitle: Record<string, boolean> = {};
  const adultOrYaHumorLeakageRejectedTitles: string[] = [];
  for (const candidate of rankedCandidates) {
    const routeEvidence = middleGradesRouteAlignmentEvidence(candidate);
    const finalEligibility = middleGradesFinalEligibility(candidate);
    const scoreBreakdown = candidate.scoreBreakdown || {};
    const matchedSignals = Array.isArray(candidate.matchedSignals) ? candidate.matchedSignals.map(String) : [];
    const matchedLikedSignals = matchedSignals.filter((signal) => !/^avoidSignalPenalty:/i.test(signal));
    const matchedDislikedSignals = matchedSignals.filter((signal) => /^avoidSignalPenalty:/i.test(signal));
    const genreTasteScore = Math.round((
      Number(scoreBreakdown.genreFacetMatch || 0)
      + Number(scoreBreakdown.positiveTasteMatch || 0)
    ) * 1000) / 1000;
    const penaltyScore = Math.round((
      Number(scoreBreakdown.avoidSignalPenalty || 0)
      + Number(scoreBreakdown.broadAvoidSignalPenalty || 0)
      - middleGradesFallbackPenalty(candidate)
    ) * 1000) / 1000;
    routeAlignmentScoreByTitle[candidate.title] = middleGradesRouteAlignmentScore(candidate);
    genreFacetMatchScoreByTitle[candidate.title] = Number(candidate.scoreBreakdown?.genreFacetMatch || 0);
    candidateTasteMatchScoreByTitle[candidate.title] = genreTasteScore;
    candidateTastePenaltyByTitle[candidate.title] = penaltyScore;
    candidateMatchedLikedSignalsByTitle[candidate.title] = matchedLikedSignals;
    candidateMatchedDislikedSignalsByTitle[candidate.title] = matchedDislikedSignals;
    genericTasteSignalsRemovedByTitle[candidate.title] = Array.isArray(candidate.diagnostics?.genericTasteSignalsRemoved) ? candidate.diagnostics.genericTasteSignalsRemoved.map(String) : [];
    documentBackedTasteSignalsByTitle[candidate.title] = Array.isArray(candidate.diagnostics?.documentBackedTasteSignals) ? candidate.diagnostics.documentBackedTasteSignals.map(String) : [];
    if (candidate.diagnostics?.genericOnlyTasteMatch) genericOnlyTasteMatchTitles.push(candidate.title);
    finalScoreComponentsByTitle[candidate.title] = {
      ...scoreBreakdown,
      genreTasteScore,
      penaltyScore,
      finalScore: candidate.score,
      adjustedSelectionScore: middleGradesSelectionScore(candidate, profile),
      routeAlignmentScore: routeAlignmentScoreByTitle[candidate.title],
      fallbackPenalty: middleGradesFallbackPenalty(candidate),
      genericOnlyTasteMatchPenalty: Number(scoreBreakdown.genericOnlyTasteMatchPenalty || 0),
    };
    queryTextSignalsRemovedFromTasteMatchByTitle[candidate.title] = Array.isArray(candidate.diagnostics?.queryTextSignalsRemovedFromTasteMatch) ? candidate.diagnostics.queryTextSignalsRemovedFromTasteMatch.map(String) : [];
    documentOnlyTasteMatchByTitle[candidate.title] = Array.isArray(candidate.diagnostics?.documentOnlyTasteMatch) ? candidate.diagnostics.documentOnlyTasteMatch.map(String) : [];
    fallbackPenaltyByTitle[candidate.title] = middleGradesFallbackPenalty(candidate);
    queryLevelRouteAlignmentByTitle[candidate.title] = routeEvidence.queryLevel;
    documentLevelRouteAlignmentByTitle[candidate.title] = routeEvidence.documentLevel;
    routeAlignmentEvidenceFieldsByTitle[candidate.title] = routeEvidence.fields;
    documentEvidenceTierByTitle[candidate.title] = routeEvidence.tier;
    documentEvidenceTextByTitle[candidate.title] = routeEvidence.evidenceTextByField;
    finalEligibilityEvidenceByTitle[candidate.title] = finalEligibility.evidence;
    finalEligibilityEvidenceFieldCountByTitle[candidate.title] = routeEvidence.fields.length;
    preteenAgeShapeEvidenceByTitle[candidate.title] = middleGradesFictionAgeEvidence(candidate);
    humorKeywordOnlyLeakageByTitle[candidate.title] = middleGradesHumorKeywordOnlyLeakage(candidate);
    if (finalEligibility.rejectedReason === "humor_keyword_only_leakage") humorKeywordOnlyRejectedTitles.push(candidate.title);
    if (finalEligibility.rejectedReason === "adult_or_ya_humor_leakage") adultOrYaHumorLeakageRejectedTitles.push(candidate.title);
    if (finalEligibility.emergencyOverride && selectedTitles.has(normalized(candidate.title))) emergencyFallbackOverrideUsedByTitle[candidate.title] = "explicit_emergency_fallback_after_better_options_failed";
    if (!finalEligibility.allowed && routeEvidence.queryLevel && !routeEvidence.documentLevel) finalEligibilityRejectedQueryOnlyTitles.push(candidate.title);
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
    finalRankingReasonByTitle[candidate.title] = finalSelectionReasonByTitle[candidate.title];
    middleGradesScoredCandidateAttribution.push({
      title: candidate.title,
      sourceQuery: String(candidate.diagnostics?.queryText || candidate.diagnostics?.queryFamily || ""),
      documentEvidenceFields: routeEvidence.fields,
      documentEvidenceText: routeEvidence.evidenceTextByField,
      evidenceTier: routeEvidence.tier,
      matchedLikedSignals,
      matchedDislikedSignals,
      genericTasteSignalsRemoved: genericTasteSignalsRemovedByTitle[candidate.title],
      documentBackedTasteSignals: documentBackedTasteSignalsByTitle[candidate.title],
      genericOnlyTasteMatch: Boolean(candidate.diagnostics?.genericOnlyTasteMatch),
      genreTasteScore,
      penaltyScore,
      finalScore: candidate.score,
      finalRankingReason: finalRankingReasonByTitle[candidate.title],
      selected: selectedTitles.has(normalized(candidate.title)),
      rejectionReason: selectedTitles.has(normalized(candidate.title))
        ? "selected"
        : candidate.rejectedReasons.join(",") || finalSelectionReasonByTitle[candidate.title] || "not_selected_after_ranking_and_selection",
    });
    candidate.diagnostics.routeAlignmentScore = routeAlignmentScoreByTitle[candidate.title];
    candidate.diagnostics.genreFacetMatchScore = genreFacetMatchScoreByTitle[candidate.title];
    candidate.diagnostics.fallbackPenalty = fallbackPenaltyByTitle[candidate.title];
    candidate.diagnostics.finalSelectionReason = finalSelectionReasonByTitle[candidate.title];
    candidate.diagnostics.queryLevelRouteAlignment = routeEvidence.queryLevel;
    candidate.diagnostics.documentLevelRouteAlignment = routeEvidence.documentLevel;
    candidate.diagnostics.routeAlignmentEvidenceFields = routeEvidence.fields;
    candidate.diagnostics.documentEvidenceTier = routeEvidence.tier;
    candidate.diagnostics.documentEvidenceText = routeEvidence.evidenceTextByField;
    candidate.diagnostics.finalEligibilityEvidence = finalEligibility.evidence;
    if (finalEligibility.emergencyOverride && selectedTitles.has(normalized(candidate.title))) candidate.diagnostics.emergencyFallbackOverrideUsed = true;
    if (routeEvidence.demotedReason) candidate.diagnostics.routeAlignmentDemotedReason = routeEvidence.demotedReason;
  }
  const selectedHasFallback = selected.some((candidate) => isMiddleGradesAntiZeroFallbackCandidate(candidate) || (middleGradesRouteAlignmentEvidence(candidate).queryLevel && !middleGradesRouteAlignmentEvidence(candidate).documentLevel));
  const rejectedRouteAlignedForFallback = rankedCandidates.filter((candidate) => !selectedTitles.has(normalized(candidate.title)) && isMiddleGradesRouteAlignedSuccessCandidate(candidate));
  if (selectedHasFallback) {
    for (const candidate of rejectedRouteAlignedForFallback) routeAlignedCandidateRejectedForFallbackReason[candidate.title] = candidate.rejectedReasons.join(",") || "route_aligned_candidate_lost_to_fallback_selection";
  }
  const rejectedRouteAligned = rankedCandidates
    .filter((candidate) => !selectedTitles.has(normalized(candidate.title)) && isMiddleGradesRouteAlignedSuccessCandidate(candidate))
    .sort((a, b) => middleGradesSelectionScore(b, profile) - middleGradesSelectionScore(a, profile))
    .slice(0, 8)
    .map((candidate) => candidate.title);
  const selectedSetForAudit = new Set(selected);
  const selectedRootsForAudit = new Set(selected.map((candidate) => finalReturnedRootKey(candidate) || seriesKey(candidate)).filter(Boolean));
  const returnedItemQualityAudit = selected.map((candidate) => middleGradesQualityAuditRow(candidate, selectedSetForAudit, selectedRootsForAudit, profile, "selected"));
  const topRejectedQualityAudit = rankedCandidates
    .filter((candidate) => !selectedSetForAudit.has(candidate))
    .map((candidate) => ({
      candidate,
      evidenceRank: middleGradesEvidenceTierRank(middleGradesRouteAlignmentEvidence(candidate).tier),
      tasteAlignment: middleGradesTasteAlignment(candidate),
      adjustedScore: middleGradesSelectionScore(candidate, profile),
    }))
    .sort((a, b) => b.evidenceRank - a.evidenceRank || b.tasteAlignment - a.tasteAlignment || b.adjustedScore - a.adjustedScore)
    .slice(0, 20)
    .map(({ candidate }) => middleGradesQualityAuditRow(candidate, selectedSetForAudit, selectedRootsForAudit, profile));
  const strongEvidenceRejected = rankedCandidates
    .filter((candidate) => !selectedTitles.has(normalized(candidate.title)) && middleGradesRouteAlignmentEvidence(candidate).tier === "strong_evidence")
    .sort((a, b) => middleGradesSelectionScore(b, profile) - middleGradesSelectionScore(a, profile));
  const weakEvidenceSelectedOverStrongEvidence = selected.some((candidate) => middleGradesRouteAlignmentEvidence(candidate).tier === "weak_evidence") && strongEvidenceRejected.length > 0;
  const selectedRouteAlignedCount = selected.filter(isMiddleGradesRouteAlignedSuccessCandidate).length;
  const selectedTitleOnlyCount = selected.filter(isMiddleGradesTitleOnlyEvidence).length;
  const selectedMediumStrongEvidenceCount = selected.filter((candidate) => {
    const evidence = middleGradesRouteAlignmentEvidence(candidate);
    return !isMiddleGradesTitleOnlyEvidence(candidate) && middleGradesEvidenceTierRank(evidence.tier) >= middleGradesEvidenceTierRank("medium_evidence");
  }).length;
  const weakEvidenceOnlySlate = selected.length > 0 && selected.every((candidate) => {
    const evidence = middleGradesRouteAlignmentEvidence(candidate);
    return isMiddleGradesTitleOnlyEvidence(candidate) || evidence.tier === "weak_evidence";
  });
  const titleOnlySeriesCounts: Record<string, number> = {};
  for (const candidate of selected.filter(isMiddleGradesTitleOnlyEvidence)) {
    const key = seriesKey(candidate);
    if (key) titleOnlySeriesCounts[key] = Number(titleOnlySeriesCounts[key] || 0) + 1;
  }
  const sameSeriesTitleOnlyClusterDetected = Object.values(titleOnlySeriesCounts).some((count) => count >= 2);
  const titleOnlyEvidenceFinalEligibleTitles = selected
    .filter((candidate) => middleGradesTitleOnlyRouteEvidence(candidate) && middleGradesFinalEligibility(candidate).allowed)
    .map((candidate) => candidate.title);
  const repeatedTitleTokenCounts = selected.reduce<Record<string, number>>((acc, candidate) => {
    const titleTokens = new Set(normalized(candidate.title).split(" ").filter((token) => /^(magic|magical|funny|humor|humour|adventure|friendship|friends?)$/.test(token)));
    for (const token of titleTokens) acc[token] = Number(acc[token] || 0) + 1;
    return acc;
  }, {});
  const repeatedTitleTokenClusterToken = Object.entries(repeatedTitleTokenCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "";
  const repeatedTitleTokenClusterDetected = Boolean(repeatedTitleTokenClusterToken && Number(repeatedTitleTokenCounts[repeatedTitleTokenClusterToken] || 0) >= Math.min(3, selected.length));
  const selectedNonHumorAlignmentCount = selected.filter(middleGradesNonHumorAlignment).length;
  const genericFunnySlateDetected = selected.length >= 5 && selectedNonHumorAlignmentCount === 0 && selected.every((candidate) => isMiddleGradesHumorRouteCandidate(candidate) || /funny|humor|comedy/i.test(String(candidate.title || "")));
  const selectedFallbackCount = selected.filter((candidate) => isMiddleGradesAntiZeroFallbackCandidate(candidate) || (middleGradesRouteAlignmentEvidence(candidate).queryLevel && !middleGradesRouteAlignmentEvidence(candidate).documentLevel)).length;
  const hasRepeatedClusterTitleToken = (candidate: ScoredCandidate): boolean => Boolean(
    repeatedTitleTokenClusterDetected
      && repeatedTitleTokenClusterToken
      && normalized(candidate.title).split(" ").includes(repeatedTitleTokenClusterToken)
  );
  const isCleanFinalEligibleCandidate = (candidate: ScoredCandidate): boolean => {
    const finalEligibility = middleGradesFinalEligibility(candidate);
    const tasteEligibility = middleGradesMeaningfulTasteEligibility(candidate, true);
    const routeEvidence = middleGradesRouteAlignmentEvidence(candidate);
    const cleanExpansionRouteFictionSupport = middleGradesCleanExpansionRouteFictionSupport(candidate);
    return finalEligibility.allowed
      && (tasteEligibility.allowed || cleanExpansionRouteFictionSupport)
      && middleGradesEvidenceTierRank(routeEvidence.tier) >= middleGradesEvidenceTierRank("medium_evidence")
      && (cleanExpansionRouteFictionSupport ? candidate.score >= 0 : candidate.score > 0)
      && !candidate.rejectedReasons.includes("middle_grades_query_only_score_cap_applied")
      && !candidate.rejectedReasons.includes("humor_keyword_only_leakage")
      && !candidate.rejectedReasons.includes("broad_adventure_only_taste_match")
      && !candidate.rejectedReasons.includes("non_positive_score")
      && !hasRepeatedClusterTitleToken(candidate)
      && !isMiddleGradesAntiZeroFallbackCandidate(candidate)
      && !(routeEvidence.queryLevel && !routeEvidence.documentLevel)
      && !isMiddleGradesTitleOnlyEvidence(candidate);
  };
  const finalEligibilityAcceptedTitles = selected.filter(isCleanFinalEligibleCandidate).map((candidate) => candidate.title);
  const finalEligibilityCleanCandidateCount = finalEligibilityAcceptedTitles.length;
  const rejectedRouteAlignedCount = rankedCandidates.filter((candidate) => !selectedTitles.has(normalized(candidate.title)) && isMiddleGradesRouteAlignedSuccessCandidate(candidate)).length;
  const zeroTasteRejectedCandidates = rankedCandidates
    .filter((candidate) => !selectedTitles.has(normalized(candidate.title)) && candidate.rejectedReasons.includes("zero_doc_backed_taste_match"));
  const zeroTasteCandidateRejectedTitles = zeroTasteRejectedCandidates
    .map((candidate) => candidate.title);
  const middleGradesTopZeroDocBackedTasteAudit = zeroTasteRejectedCandidates
    .slice(0, 20)
    .map((candidate) => middleGradesZeroTasteEvidenceAudit(candidate, profile));
  const broadAdventureOnlyRejectedTitles = rankedCandidates
    .filter((candidate) => !selectedTitles.has(normalized(candidate.title)) && candidate.rejectedReasons.includes("broad_adventure_only_taste_match"))
    .map((candidate) => candidate.title);
  const meaningfulTasteEligibleTitles = rankedCandidates
    .filter(isCleanFinalEligibleCandidate)
    .map((candidate) => candidate.title);
  const underfilledBecauseOnlyWeakOrZeroTaste = selected.length < 5 && (zeroTasteCandidateRejectedTitles.length > 0 || broadAdventureOnlyRejectedTitles.length > 0);
  const emergencyFallbackUsedForZeroTasteFill = selected.some((candidate) => candidate.rejectedReasons.includes("accepted_middle_grades_zero_final_items_guard") && !middleGradesMeaningfulTasteEligibility(candidate).allowed);
  const meaningfulTasteRecoveryCandidates = rankedCandidates.filter((candidate) => candidate.diagnostics?.meaningfulTasteRecovery || candidate.diagnostics?.scoringHandoffStage === "meaningful_taste_recovery");
  const meaningfulTasteRecoverySelectedTitles = selected
    .filter((candidate) => candidate.diagnostics?.meaningfulTasteRecovery || candidate.diagnostics?.scoringHandoffStage === "meaningful_taste_recovery")
    .map((candidate) => candidate.title);
  const meaningfulTasteRecoveryDroppedAfterMergeByReason = meaningfulTasteRecoveryCandidates
    .filter((candidate) => !selectedTitles.has(normalized(candidate.title)))
    .reduce<Record<string, string[]>>((acc, candidate) => {
      const reason = candidate.rejectedReasons.find((entry) => entry !== "selected") || rejectReason(candidate, profile) || "ranked_below_final_selection";
      acc[reason] = [...(acc[reason] || []), candidate.title];
      return acc;
    }, {});
  const meaningfulTasteRecoveryAcceptedButNotReturnedTitles = meaningfulTasteRecoveryCandidates
    .filter((candidate) => !selectedTitles.has(normalized(candidate.title)))
    .map((candidate) => candidate.title);
  const selectedRootKeysForRecovery = new Set(selected.map((candidate) => finalReturnedRootKey(candidate) || seriesKey(candidate)).filter(Boolean));
  const recoveryShortfallGateReason = (candidate: ScoredCandidate): string => {
    if (selectedTitles.has(normalized(candidate.title))) return "selected";
    const joinedRejected = candidate.rejectedReasons.join(",");
    if (/query_only_score_cap|query_only/i.test(joinedRejected)) return "recovery_query_quality_query_only_cap";
    if (/humor_keyword_only_leakage|adult_or_ya_humor_leakage/i.test(joinedRejected)) return "humor_or_leakage_rejection";
    if (/duplicate|same_root|same_series|root_collapsed/i.test(joinedRejected)) return "duplicate_root_suppression";
    const finalEligibility = middleGradesFinalEligibility(candidate);
    if (!finalEligibility.allowed) {
      if (/query_only|missing.*document|evidence/i.test(String(finalEligibility.rejectedReason || ""))) return "missing_document_evidence";
      if (/humor|leakage/i.test(String(finalEligibility.rejectedReason || ""))) return "humor_or_leakage_rejection";
      return `final_eligibility_${finalEligibility.rejectedReason || "rejected"}`;
    }
    const tasteEligibility = middleGradesMeaningfulTasteEligibility(candidate, true);
    if (!tasteEligibility.allowed) return "missing_document_backed_taste_evidence";
    if (candidate.score <= 0 && !isContemporaryLowScoreAcceptable(candidate, profile)) return "non_positive_scoring";
    const rootKey = finalReturnedRootKey(candidate) || seriesKey(candidate);
    if (rootKey && selectedRootKeysForRecovery.has(rootKey)) return "duplicate_root_suppression";
    return "ranked_below_final_selection";
  };
  const recoveryRejectedRows = meaningfulTasteRecoveryCandidates
    .filter((candidate) => !selectedTitles.has(normalized(candidate.title)))
    .map((candidate) => ({ candidate, reason: recoveryShortfallGateReason(candidate) }))
    .sort((a, b) => middleGradesSelectionScore(b.candidate, profile) - middleGradesSelectionScore(a.candidate, profile));
  const middleGradesRecoveryRejectedReasonCounts = recoveryRejectedRows.reduce<Record<string, number>>((acc, row) => {
    acc[row.reason] = Number(acc[row.reason] || 0) + 1;
    return acc;
  }, {});
  const middleGradesRecoveryBestRejectedTitlesByReason = recoveryRejectedRows.reduce<Record<string, string[]>>((acc, row) => {
    acc[row.reason] = [...(acc[row.reason] || []), row.candidate.title].slice(0, 5);
    return acc;
  }, {});
  const middleGradesRecoveryNextBestSelectableTitles = recoveryRejectedRows
    .filter((row) => row.reason === "ranked_below_final_selection")
    .slice(0, Math.max(0, 5 - selected.length))
    .map((row) => row.candidate.title);
  const recoveryTopRejectedReason = Object.entries(middleGradesRecoveryRejectedReasonCounts)
    .sort((a, b) => b[1] - a[1])[0]?.[0];
  const middleGradesRecoveryCouldHaveReachedFiveIfRelaxedGate = selected.length < 5 && selected.length + recoveryRejectedRows.length >= 5;
  const middleGradesRecoveryFinalShortfallReason = selected.length >= 5
    ? "none"
    : recoveryTopRejectedReason || (meaningfulTasteRecoveryCandidates.length ? "recovery_candidates_ranked_below_or_unavailable" : "no_recovery_candidates_merged");
  const middleGradesRecoveryRelaxedGateNeeded = middleGradesRecoveryCouldHaveReachedFiveIfRelaxedGate ? middleGradesRecoveryFinalShortfallReason : "none";
  const finalCountContractStatus = selected.length === 0
    ? "zero_result_failure"
    : selected.length >= Math.min(5, selected.length || 5) && selected.length >= 5
      ? selectedMediumStrongEvidenceCount <= 0
        ? "full_weak_evidence"
        : selectedRouteAlignedCount >= selected.length && selectedMediumStrongEvidenceCount > 0
          ? "full_route_aligned"
          : selectedRouteAlignedCount === 0
            ? "full_fallback_only"
            : "full_mixed_recovery"
      : selectedRouteAlignedCount === 0
        ? "underfilled_fallback_only"
        : "underfilled_mixed";
  const documentRouteAlignmentEvidenceMissingButTrueCount = Object.values(documentLevelRouteAlignmentByTitle)
    .filter(Boolean).length - Object.values(routeAlignmentEvidenceFieldsByTitle).filter((fields) => fields.length > 0).length;
  const selectedGenericAdventureCount = selected.filter((candidate) => /(^|\b)middle grade adventure(\b|$)/i.test(String(candidate.diagnostics?.queryText || ""))).length;
  const genericAdventureUsedAsLastResortOnly = selectedGenericAdventureCount === 0 || selected.length < 5 || selectedRouteAlignedCount >= 2;
  const lockQualityFailReasons: string[] = [];
  if (selected.length !== 5) lockQualityFailReasons.push("final_items_length_not_five");
  if (finalCountContractStatus === "underfilled_fallback_only" || finalCountContractStatus === "full_fallback_only" || finalCountContractStatus === "full_weak_evidence") lockQualityFailReasons.push(finalCountContractStatus);
  if (weakEvidenceOnlySlate) lockQualityFailReasons.push("weak_evidence_only_slate");
  if (selectedTitleOnlyCount > 0 && selectedMediumStrongEvidenceCount === 0) lockQualityFailReasons.push("title_only_slate_downgraded_lock_quality");
  if (underfilledBecauseOnlyWeakOrZeroTaste) lockQualityFailReasons.push("underfilled_because_only_weak_or_zero_taste");
  if (emergencyFallbackUsedForZeroTasteFill) lockQualityFailReasons.push("emergency_fallback_used_for_zero_taste_fill");
  if (sameSeriesTitleOnlyClusterDetected) lockQualityFailReasons.push("same_series_title_only_cluster_detected");
  if (repeatedTitleTokenClusterDetected) lockQualityFailReasons.push("repeated_title_token_cluster_detected");
  if (finalCountContractStatus === "full_mixed_recovery" && selectedRouteAlignedCount < 2) lockQualityFailReasons.push("mixed_recovery_has_fewer_than_two_route_aligned_items");
  if (documentRouteAlignmentEvidenceMissingButTrueCount > 0) lockQualityFailReasons.push("document_route_alignment_missing_evidence_fields");
  if (rejectedReasons.genericDefaultSlateDetected && selected.length >= 5) lockQualityFailReasons.push("generic_default_slate_detected_without_true_shortage");
  if (!genericAdventureUsedAsLastResortOnly) lockQualityFailReasons.push("generic_adventure_used_before_last_resort");
  if (weakEvidenceSelectedOverStrongEvidence) lockQualityFailReasons.push("weak_evidence_selected_over_strong_evidence");
  if (genericFunnySlateDetected) lockQualityFailReasons.push("generic_funny_slate_detected_without_non_humor_alignment");
  const lockQualityPass = lockQualityFailReasons.length === 0;
  diagnostics.routeAlignmentScoreByTitle = routeAlignmentScoreByTitle;
  diagnostics.genreFacetMatchScoreByTitle = genreFacetMatchScoreByTitle;
  diagnostics.candidateTasteMatchScoreByTitle = candidateTasteMatchScoreByTitle;
  diagnostics.candidateTastePenaltyByTitle = candidateTastePenaltyByTitle;
  diagnostics.candidateMatchedLikedSignalsByTitle = candidateMatchedLikedSignalsByTitle;
  diagnostics.candidateMatchedDislikedSignalsByTitle = candidateMatchedDislikedSignalsByTitle;
  diagnostics.finalScoreComponentsByTitle = finalScoreComponentsByTitle;
  diagnostics.finalRankingReasonByTitle = finalRankingReasonByTitle;
  diagnostics.rankedDocsTitles = rankedCandidates.map((candidate) => candidate.title);
  diagnostics.finalEligibilityAcceptedTitles = finalEligibilityAcceptedTitles;
  diagnostics.finalEligibilityCleanCandidateCount = finalEligibilityCleanCandidateCount;
  diagnostics.middleGradesScoredCandidateAttribution = middleGradesScoredCandidateAttribution;
  diagnostics.genericTasteSignalsRemovedByTitle = genericTasteSignalsRemovedByTitle;
  diagnostics.genericOnlyTasteMatchTitles = genericOnlyTasteMatchTitles;
  diagnostics.documentBackedTasteSignalsByTitle = documentBackedTasteSignalsByTitle;
  diagnostics.selectedGenericOnlyTasteMatchCount = selected.filter((candidate) => candidate.diagnostics?.genericOnlyTasteMatch).length;
  diagnostics.zeroTasteCandidateRejectedTitles = zeroTasteCandidateRejectedTitles;
  diagnostics.middleGradesTopZeroDocBackedTasteAudit = middleGradesTopZeroDocBackedTasteAudit;
  diagnostics.broadAdventureOnlyRejectedTitles = broadAdventureOnlyRejectedTitles;
  diagnostics.meaningfulTasteEligibleTitles = meaningfulTasteEligibleTitles;
  diagnostics.underfilledBecauseOnlyWeakOrZeroTaste = underfilledBecauseOnlyWeakOrZeroTaste;
  diagnostics.emergencyFallbackUsedForZeroTasteFill = emergencyFallbackUsedForZeroTasteFill;
  diagnostics.meaningfulTasteRecoveryMergedIntoScoring = meaningfulTasteRecoveryCandidates.length > 0;
  diagnostics.meaningfulTasteRecoveryMergedCandidateCount = meaningfulTasteRecoveryCandidates.length;
  diagnostics.meaningfulTasteRecoveryDroppedAfterMergeByReason = meaningfulTasteRecoveryDroppedAfterMergeByReason;
  diagnostics.meaningfulTasteRecoveryAcceptedButNotReturnedTitles = meaningfulTasteRecoveryAcceptedButNotReturnedTitles;
  diagnostics.meaningfulTasteRecoveryFinalSelectionCount = meaningfulTasteRecoverySelectedTitles.length;
  diagnostics.middleGradesRecoveryFinalShortfallReason = middleGradesRecoveryFinalShortfallReason;
  diagnostics.middleGradesRecoveryRejectedReasonCounts = middleGradesRecoveryRejectedReasonCounts;
  diagnostics.middleGradesRecoveryBestRejectedTitlesByReason = middleGradesRecoveryBestRejectedTitlesByReason;
  diagnostics.middleGradesRecoveryNextBestSelectableTitles = middleGradesRecoveryNextBestSelectableTitles;
  diagnostics.middleGradesRecoveryCouldHaveReachedFiveIfRelaxedGate = middleGradesRecoveryCouldHaveReachedFiveIfRelaxedGate;
  diagnostics.middleGradesRecoveryRelaxedGateNeeded = middleGradesRecoveryRelaxedGateNeeded;
  diagnostics.queryTextSignalsRemovedFromTasteMatchByTitle = queryTextSignalsRemovedFromTasteMatchByTitle;
  diagnostics.documentOnlyTasteMatchByTitle = documentOnlyTasteMatchByTitle;
  diagnostics.fallbackPenaltyByTitle = fallbackPenaltyByTitle;
  diagnostics.finalSelectionReasonByTitle = finalSelectionReasonByTitle;
  diagnostics.middleGradesReturnedItemQualityAudit = returnedItemQualityAudit;
  diagnostics.middleGradesTopRejectedQualityAudit = topRejectedQualityAudit;
  diagnostics.queryLevelRouteAlignmentByTitle = queryLevelRouteAlignmentByTitle;
  diagnostics.documentLevelRouteAlignmentByTitle = documentLevelRouteAlignmentByTitle;
  diagnostics.routeAlignmentEvidenceFieldsByTitle = routeAlignmentEvidenceFieldsByTitle;
  diagnostics.documentEvidenceTierByTitle = documentEvidenceTierByTitle;
  diagnostics.documentEvidenceTextByTitle = documentEvidenceTextByTitle;
  diagnostics.routeAlignmentDemotedReasonByTitle = routeAlignmentDemotedReasonByTitle;
  diagnostics.finalEligibilityEvidenceByTitle = finalEligibilityEvidenceByTitle;
  diagnostics.finalEligibilityEvidenceFieldCountByTitle = finalEligibilityEvidenceFieldCountByTitle;
  diagnostics.titleOnlyEvidenceFinalEligibleTitles = titleOnlyEvidenceFinalEligibleTitles;
  diagnostics.repeatedTitleTokenClusterDetected = repeatedTitleTokenClusterDetected;
  diagnostics.repeatedTitleTokenClusterToken = repeatedTitleTokenClusterToken || undefined;
  diagnostics.finalEligibilityRejectedQueryOnlyTitles = finalEligibilityRejectedQueryOnlyTitles;
  diagnostics.humorKeywordOnlyLeakageByTitle = humorKeywordOnlyLeakageByTitle;
  diagnostics.humorKeywordOnlyRejectedTitles = humorKeywordOnlyRejectedTitles;
  diagnostics.preteenAgeShapeEvidenceByTitle = preteenAgeShapeEvidenceByTitle;
  diagnostics.adultOrYaHumorLeakageRejectedTitles = adultOrYaHumorLeakageRejectedTitles;
  diagnostics.routeAlignedCandidateRejectedForFallbackReason = routeAlignedCandidateRejectedForFallbackReason;
  diagnostics.emergencyFallbackOverrideUsedByTitle = emergencyFallbackOverrideUsedByTitle;
  diagnostics.falseRouteAlignedDueToQueryOnlyCount = Object.keys(routeAlignmentDemotedReasonByTitle).length;
  diagnostics.documentRouteAlignmentEvidenceMissingButTrueCount = Math.max(0, documentRouteAlignmentEvidenceMissingButTrueCount);
  diagnostics.weakEvidenceOnlySlate = weakEvidenceOnlySlate;
  diagnostics.titleOnlySlateDowngradedLockQuality = selectedTitleOnlyCount > 0 && selectedMediumStrongEvidenceCount === 0;
  diagnostics.selectedTitleOnlyCount = selectedTitleOnlyCount;
  diagnostics.selectedMediumStrongEvidenceCount = selectedMediumStrongEvidenceCount;
  diagnostics.mediumStrongEvidenceTargetCount = 5;
  diagnostics.weakEvidenceFinalizedBecause = selectedMediumStrongEvidenceCount >= 5
    ? "medium_strong_evidence_target_satisfied"
    : "medium_strong_evidence_target_not_met_after_selection_pool_exhausted";
  diagnostics.weakEvidenceReturnedOnlyAfterEvidenceSearchExhausted = selectedMediumStrongEvidenceCount < 5;
  diagnostics.sameSeriesTitleOnlyClusterDetected = sameSeriesTitleOnlyClusterDetected;
  diagnostics.finalCountContractStatus = finalCountContractStatus;
  diagnostics.genericAdventureUsedAsLastResortOnly = genericAdventureUsedAsLastResortOnly;
  diagnostics.selectedNonHumorAlignmentCount = selectedNonHumorAlignmentCount;
  diagnostics.genericFunnySlateDetected = genericFunnySlateDetected;
  diagnostics.genericFunnySlateLockQualityBlocked = genericFunnySlateDetected;
  diagnostics.lockQualityPass = lockQualityPass;
  diagnostics.lockQualityFailReasons = lockQualityFailReasons;
  diagnostics.strongEvidenceRejectedTitles = strongEvidenceRejected.slice(0, 8).map((candidate) => candidate.title);
  diagnostics.strongEvidenceRejectedReasons = Object.fromEntries(strongEvidenceRejected.slice(0, 8).map((candidate) => [candidate.title, candidate.rejectedReasons.join(",") || "strong_evidence_candidate_not_selected"]));
  diagnostics.weakEvidenceSelectedOverStrongEvidence = weakEvidenceSelectedOverStrongEvidence;
  diagnostics.evidenceGateTooStrictSuspected = selected.length < 5 && strongEvidenceRejected.length > 0;
  diagnostics.evidenceGateTooLooseSuspected = weakEvidenceSelectedOverStrongEvidence || (selected.some((candidate) => middleGradesRouteAlignmentEvidence(candidate).tier === "weak_evidence") && Boolean(rejectedReasons.genericDefaultSlateDetected));
  if (!diagnostics.underfillRecoveryStoppedReason) diagnostics.underfillRecoveryStoppedReason = selected.length >= 5 ? "count_contract_satisfied" : "not_enough_safe_candidates_after_selection";
  if (!diagnostics.remainingUnattemptedReliableFallbacks) diagnostics.remainingUnattemptedReliableFallbacks = [];
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
  if (profile.ageBand === "preteens") {
    const eligibility = middleGradesFinalEligibility(candidate);
    if (!eligibility.allowed) return eligibility.rejectedReason || "middle_grades_final_eligibility_missing_evidence";
    const tasteEligibility = middleGradesMeaningfulTasteEligibility(candidate, true);
    if (!tasteEligibility.allowed) return tasteEligibility.reason || "middle_grades_missing_meaningful_taste_evidence";
  }
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

  applyMiddleGradesQueryOnlyScoreCaps(candidates, profile, rejectedReasons);
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
      const eligibility = middleGradesFinalEligibility(candidate);
      if (!eligibility.allowed) return false;
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
  applyMiddleGradesTitleOnlyEvidenceCap(rankedCandidates, selected, rejectedReasons, profile);
  applyMiddleGradesFallbackEvidencePrecedence(rankedCandidates, selected, rejectedReasons, profile);
  applyMiddleGradesMediumStrongEvidencePreference(rankedCandidates, selected, rejectedReasons, profile);
  applyMiddleGradesFinalCountRecovery(rankedCandidates, selected, rejectedReasons, profile, limit);
  applyMiddleGradesFinalReturnedRootCollapseAndRecovery(rankedCandidates, selected, rejectedReasons, profile, limit);
  applyMiddleGradesMeaningfulTasteFinalGate(selected, rejectedReasons, profile);

  addMiddleGradesSlateDiagnostics(selected, rejectedReasons, profile);
  addMiddleGradesSelectionObservability(rankedCandidates, selected, rejectedReasons, profile);
  addAdultFamilyDiagnostics(rankedCandidates, selected, rejectedReasons, profile);

  return { selected, rejectedReasons };
}
