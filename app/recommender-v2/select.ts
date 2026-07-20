import type { NormalizedCandidate, ScoredCandidate, TasteProfile } from "./types";
import { signalPresentInText } from "./score";
import { annotatePreteenGoogleBooksPublicationIdentity, preteenGoogleBooksPublicationIdentityAudit } from "./preteenGoogleBooksPublicationIdentity";

type DeferredCandidate = { candidate: ScoredCandidate; reason: string };
type TeenOpenLibrarySeriesPositionInfo = { seriesName: string; position: number; source: string };

function normalized(value: unknown): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function googleBooksContentMaturity(candidate: ScoredCandidate): "mature" | "not_mature" | "unknown" {
  if (candidate.source !== "googleBooks") return "unknown";
  const raw = (candidate.raw || {}) as Record<string, unknown>;
  const diagnostics = candidate.diagnostics || {};
  const explicit = String(diagnostics.googleBooksContentMaturity || raw.contentMaturity || "").trim().toLowerCase();
  if (explicit === "mature" || explicit === "not_mature") return explicit;
  const sourceRating = String(
    diagnostics.googleBooksSourceMaturityRating
    || raw.sourceMaturityRating
    || raw.maturityRating
    || raw.maturityBand
    || "",
  ).trim().toUpperCase();
  if (sourceRating === "MATURE" || sourceRating === "EXPLICIT_MATURE") return "mature";
  if (sourceRating === "NOT_MATURE") return "not_mature";
  return "unknown";
}

function googleBooksMaturityRejectReason(candidate: ScoredCandidate, profile: TasteProfile): string | null {
  if (candidate.source !== "googleBooks") return null;
  if (googleBooksContentMaturity(candidate) !== "mature") return null;
  if (profile.ageBand === "kids") return "googlebooks_mature_content_not_allowed_for_kids";
  if (profile.ageBand === "preteens") return "googlebooks_mature_content_not_allowed_for_preteens";
  return null;
}

type TeenGoogleBooksAudienceReconciliationAudit = {
  allowed: boolean;
  reason: string;
  evidence: string[];
};

type TeenGoogleBooksPublicationIdentityAudit = {
  allowed: boolean;
  reason: string;
  decision: string;
  classification: string;
  evidence: string[];
};

function teenGoogleBooksAudienceReconciliationAudit(candidate: ScoredCandidate, profile: TasteProfile): TeenGoogleBooksAudienceReconciliationAudit {
  if (profile.ageBand !== "teens" || candidate.source !== "googleBooks") {
    return { allowed: false, reason: "not_applicable", evidence: [] };
  }
  const diagnostics = (candidate.diagnostics || {}) as Record<string, unknown>;
  const raw = (candidate.raw || {}) as Record<string, unknown>;
  const sourceAudienceBand = String(diagnostics.googleBooksAudienceBand || raw.audienceBand || "").trim();
  const queryText = String(diagnostics.queryText || raw.queryText || "").trim().toLowerCase();
  const originalPlannedQuery = String(diagnostics.originalPlannedQuery || raw.originalPlannedQuery || "").trim().toLowerCase();
  const queryFamily = String(diagnostics.queryFamily || raw.queryFamily || "").trim();
  const publicationShape = String(diagnostics.googleBooksPublicationShape || raw.googleBooksPublicationShape || "").trim();
  const narrativeConfidence = Number(diagnostics.googleBooksNarrativeConfidence ?? raw.googleBooksNarrativeConfidence ?? 0);
  const storyEvidence = Array.isArray(diagnostics.googleBooksStoryLevelNarrativeEvidence)
    ? diagnostics.googleBooksStoryLevelNarrativeEvidence.map((entry) => String(entry || "")).filter(Boolean)
    : [];
  const explicitNonNarrativeIdentity = Array.isArray(diagnostics.googleBooksExplicitNonNarrativeIdentity)
    ? diagnostics.googleBooksExplicitNonNarrativeIdentity.map((entry) => String(entry || "")).filter(Boolean)
    : [];
  const subjectOfStudy = Boolean(diagnostics.googleBooksSubjectOfStudyTitle || raw.googleBooksSubjectOfStudyTitle);
  const curatedGuide = Boolean(diagnostics.googleBooksCuratedBookGuideIdentity || raw.googleBooksCuratedBookGuideIdentity);
  const genericCategory = Boolean(diagnostics.googleBooksGenericCategoryTitle || raw.googleBooksGenericCategoryTitle);
  const combinedText = [
    candidate.title,
    candidate.subtitle,
    candidate.description,
    raw.description,
    raw.subtitle,
    queryText,
    originalPlannedQuery,
    ...candidate.genres,
  ]
    .map((value) => String(value || "").toLowerCase())
    .join(" ");
  const hasEarlyReaderMarkers = /\b(picture books?|board books?|early readers?|easy readers?|beginning readers?|leveled readers?|learn to read|read aloud|phonics readers?|kindergarten|preschool|grades?\s*(?:k|1|2)\b|grade\s*(?:k|1|2)\b)\b/.test(combinedText);
  const teenQueryAligned = /\byoung adult\b/.test(queryText) || /\byoung adult\b/.test(originalPlannedQuery);
  const evidence = [
    `source_audience_band:${sourceAudienceBand || "unknown"}`,
    `query_family:${queryFamily || "unknown"}`,
    `query_alignment_young_adult:${teenQueryAligned ? "yes" : "no"}`,
    `publication_shape:${publicationShape || "unknown"}`,
    `narrative_confidence:${Number.isFinite(narrativeConfidence) ? narrativeConfidence : 0}`,
    `story_level_narrative_evidence_count:${storyEvidence.length}`,
    `explicit_non_narrative_identity_count:${explicitNonNarrativeIdentity.length}`,
    `subject_of_study:${subjectOfStudy ? "yes" : "no"}`,
    `curated_book_guide:${curatedGuide ? "yes" : "no"}`,
    `generic_category_title:${genericCategory ? "yes" : "no"}`,
    `early_reader_markers:${hasEarlyReaderMarkers ? "yes" : "no"}`,
  ];

  if (!["kids", "preteens"].includes(sourceAudienceBand)) return { allowed: false, reason: "teen_audience_reconciliation_source_label_not_kids_or_preteens", evidence };
  if (googleBooksContentMaturity(candidate) !== "not_mature") return { allowed: false, reason: "teen_audience_reconciliation_content_not_not_mature", evidence };
  if (!teenQueryAligned) return { allowed: false, reason: "teen_audience_reconciliation_not_from_teen_query", evidence };
  if (hasEarlyReaderMarkers) return { allowed: false, reason: "teen_audience_reconciliation_explicit_early_reader_markers", evidence };
  if (subjectOfStudy || curatedGuide || genericCategory || explicitNonNarrativeIdentity.length > 0) {
    return { allowed: false, reason: "teen_audience_reconciliation_non_narrative_identity_flags", evidence };
  }
  if (!["novel", "series_installment"].includes(publicationShape)) return { allowed: false, reason: "teen_audience_reconciliation_publication_shape_not_story_work", evidence };
  if (!Number.isFinite(narrativeConfidence) || narrativeConfidence < 5.5) return { allowed: false, reason: "teen_audience_reconciliation_narrative_confidence_below_threshold", evidence };
  if (storyEvidence.length < 2) return { allowed: false, reason: "teen_audience_reconciliation_insufficient_story_evidence", evidence };
  return { allowed: true, reason: "teen_googlebooks_audience_reconciliation_rescue", evidence };
}

function teenGoogleBooksPublicationIdentityAudit(candidate: ScoredCandidate, profile: TasteProfile): TeenGoogleBooksPublicationIdentityAudit {
  if (profile.ageBand !== "teens" || candidate.source !== "googleBooks") {
    return { allowed: true, reason: "not_applicable", decision: "not_applicable", classification: "not_applicable", evidence: [] };
  }
  const diagnostics = (candidate.diagnostics || {}) as Record<string, unknown>;
  const raw = (candidate.raw || {}) as Record<string, unknown>;
  const title = String(candidate.title || "").trim();
  const subtitle = String(candidate.subtitle || raw.subtitle || "").trim();
  const description = String(candidate.description || raw.description || "").trim();
  const publicationShape = String(diagnostics.googleBooksPublicationShape || raw.googleBooksPublicationShape || "").trim().toLowerCase();
  const explicitNonNarrativeIdentity = Array.isArray(diagnostics.googleBooksExplicitNonNarrativeIdentity)
    ? diagnostics.googleBooksExplicitNonNarrativeIdentity.map((entry) => String(entry || "")).filter(Boolean)
    : [];
  const subjectOfStudy = Boolean(diagnostics.googleBooksSubjectOfStudyTitle || raw.googleBooksSubjectOfStudyTitle);
  const curatedGuide = Boolean(diagnostics.googleBooksCuratedBookGuideIdentity || raw.googleBooksCuratedBookGuideIdentity);
  const genericCategory = Boolean(diagnostics.googleBooksGenericCategoryTitle || raw.googleBooksGenericCategoryTitle);
  const volumeInfo = raw.volumeInfo && typeof raw.volumeInfo === "object"
    ? raw.volumeInfo as Record<string, unknown>
    : {};
  const categories = [
    ...candidate.genres,
    ...(Array.isArray(volumeInfo.categories) ? volumeInfo.categories.map((entry) => String(entry || "")) : []),
  ].filter(Boolean);
  const text = [title, subtitle, description, categories.join(" | ")]
    .map((entry) => String(entry || "").toLowerCase())
    .join(" ");
  const evidence = [
    `publication_shape:${publicationShape || "unknown"}`,
    `explicit_non_narrative_identity_count:${explicitNonNarrativeIdentity.length}`,
    `subject_of_study:${subjectOfStudy ? "yes" : "no"}`,
    `curated_guide:${curatedGuide ? "yes" : "no"}`,
    `generic_category_title:${genericCategory ? "yes" : "no"}`,
  ];

  const reject = (reason: string, classification: string, patternEvidence?: string): TeenGoogleBooksPublicationIdentityAudit => ({
    allowed: false,
    reason,
    decision: "rejected",
    classification,
    evidence: patternEvidence ? [...evidence, `matched:${patternEvidence}`] : evidence,
  });

  if (subjectOfStudy) return reject("teen_googlebooks_publication_identity_subject_of_study_flag", "literary_criticism_or_study");
  if (curatedGuide) return reject("teen_googlebooks_publication_identity_curated_guide_flag", "guide_reference");
  if (genericCategory) return reject("teen_googlebooks_publication_identity_generic_category_flag", "catalog_or_promotional_collection");
  if (explicitNonNarrativeIdentity.length > 0) return reject("teen_googlebooks_publication_identity_explicit_non_narrative_identity_flag", "non_narrative_reference_or_compilation");

  if (/\b(official illustrated movie companion|official movie companion|movie companion|official companion)\b/.test(text)) {
    return reject("teen_googlebooks_publication_identity_supplemental_companion", "supplemental_companion_edition", "supplemental_companion_title_pattern");
  }
  if (/\b(the role of .* in the works of|special reference to|analysis of|study of|critical study|in the works of)\b/.test(text)) {
    return reject("teen_googlebooks_publication_identity_literary_study", "literary_criticism_or_study", "literary_study_pattern");
  }
  if (/\b(spring\s+\d{4}\s+young adult debut novels|debut novels|booklist'?s?\s+\d+\s+best\s+young\s+adult\s+books\s+since)\b/.test(text)) {
    return reject("teen_googlebooks_publication_identity_catalog_or_promotional_collection", "catalog_or_promotional_collection", "catalog_or_promotional_pattern");
  }
  if (/\b(writers?\s+market|guide to literary agents|literary agents? \d+(?:st|nd|rd|th)? edition|handbook)\b/.test(text)) {
    return reject("teen_googlebooks_publication_identity_guide_or_market_reference", "guide_reference", "guide_or_market_reference_pattern");
  }
  if (["writing_guide", "critical_study", "nonfiction", "public_domain_compilation"].includes(publicationShape)) {
    return reject("teen_googlebooks_publication_identity_non_narrative_shape", "non_narrative_reference_or_compilation", "non_narrative_publication_shape");
  }

  const classification = publicationShape === "series_installment"
    ? "series_installment"
    : publicationShape === "story_collection"
      ? "legitimate_short_story_anthology"
      : "narrative_novel_or_uncertain";
  return { allowed: true, reason: "teen_googlebooks_publication_identity_passed", decision: "passed", classification, evidence };
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

function adultGoogleBooksSeriesRoot(candidate: ScoredCandidate): string {
  if (candidate.source !== "googleBooks") return "";
  const text = normalized([candidate.subtitle, candidate.title].filter(Boolean).join(" "));
  const seriesToken = "(?:book|volume|vol|part)";
  const numberToken = "(?:\\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)";
  const prefixWithNumber = text.match(new RegExp(`\\b(.+?)\\s+${seriesToken}\\s+${numberToken}\\b`));
  if (prefixWithNumber && prefixWithNumber[1]) {
    return normalized(prefixWithNumber[1]).replace(/\b(?:an|a|the)\b/g, " ").replace(/\s+/g, " ").trim();
  }
  const explicitSeries = text.match(/\b(.+?)\s+(?:series|saga|chronicles)\b/);
  if (explicitSeries && explicitSeries[1]) {
    return normalized(explicitSeries[1]).replace(/\b(?:an|a|the)\b/g, " ").replace(/\s+/g, " ").trim();
  }
  const titledSeries = normalized(candidate.title).match(new RegExp(`\\b(.+?)\\s+${seriesToken}\\s+${numberToken}\\b`));
  if (titledSeries && titledSeries[1]) return normalized(titledSeries[1]);
  return seriesKey(candidate);
}

function adultGoogleBooksClusterKey(candidate: ScoredCandidate): string {
  if (candidate.source !== "googleBooks") return "";
  const text = normalized([candidate.subtitle, candidate.description, candidate.title].filter(Boolean).join(" "));
  const franchisePhrase = text.match(/\b([a-z]{3,}(?:\s+[a-z]{3,}){0,4}\s+(?:fbi|cia|detective|inspector|agent)\s+(?:suspense|thriller|mystery))\b/);
  if (franchisePhrase && franchisePhrase[1]) return franchisePhrase[1];
  const titleCluster = normalized(candidate.title).match(/^(girl|boy|woman|man)\s+[a-z]{3,}\b/);
  if (titleCluster && /\b(?:suspense|thriller|mystery|fbi|detective)\b/.test(text)) {
    return `${titleCluster[1]}_title_cluster_${(franchisePhrase && franchisePhrase[1]) ? franchisePhrase[1] : "crime"}`;
  }
  return "";
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

const ADULT_OPENLIBRARY_GENERIC_TASTE_SIGNAL = /^(adult|adults|fiction|novel|novels|story|stories)$/;
const ADULT_OPENLIBRARY_CONTEXT_ONLY_TASTE_SIGNAL = /^(book|books|ebook|ebooks|audiobook|audiobooks|series|movie|movies|film|films|tv|television|game|games|podcast|podcasts|anime|manga|comic|comics|graphic novel|graphic novels)$/;
const ADULT_OPENLIBRARY_SUPPLEMENTAL_TASTE_SIGNAL = /^(dark|epic|weird|fast paced|fast-paced|atmospheric|identity|hopeful|authority|rebellion|ai|nonfiction|non fiction)$/;
const ADULT_OPENLIBRARY_DISTINCTIVE_RAW_SIGNAL = /^(dystopia|dystopian|gothic|psychological horror|paranormal|mythology|mythological|survival|speculative|historical crime|science fiction thriller|sci fi thriller|sci-fi thriller|dark fantasy|supernatural|occult)$/;

type AdultOpenLibraryContentFamily =
  | "fantasy"
  | "science_fiction"
  | "mystery_crime_thriller"
  | "horror_paranormal"
  | "historical"
  | "romance"
  | "drama_contemporary"
  | "adventure_action"
  | "comedy";

type AdultOpenLibraryTasteEligibility = {
  allowed: boolean;
  reason?: string;
  allowedReason?: string;
  signals: string[];
  nonTitleSignals: string[];
  rawContentSignals: string[];
  contentSignals: string[];
  contextOnlySignals: string[];
  supplementalSignals: string[];
  meaningfulLikedContentSignals: string[];
  overlappingDislikedContentSignals: string[];
  nonOverlappingLikedContentSignals: string[];
  dislikeOverlapRatio: number;
  likedContentFamilies: string[];
  dislikedContentFamilies: string[];
  overlappingDislikedFamilies: string[];
  nonOverlappingLikedFamilies: string[];
  familyDislikeOverlapRatio: number;
  likedFamilyWeightByFamily: Record<string, number>;
  dislikedFamilyWeightByFamily: Record<string, number>;
  netFamilyWeightByFamily: Record<string, number>;
  likedItemCountByFamily: Record<string, number>;
  dislikedItemCountByFamily: Record<string, number>;
  positiveNetFamilies: string[];
  nonPositiveNetFamilies: string[];
  familySupportFieldsByFamily: Record<string, string[]>;
  familySupportEvidenceGroupsByFamily: Record<string, string[]>;
  strongAdultFitSignals: string[];
  narrativeFictionShape: boolean;
  narrativeShapeEvidence: string[];
  sparseNarrativeShapeApplied: boolean;
  sparseNarrativeShapeReason?: string;
  collectionShapeTrigger?: string;
  collectionShapeTriggerField?: string;
  collectionShapeCorroboration: string[];
  puzzleGameShapeReasons: string[];
  nonNarrativeShapeReasons: string[];
  sparseSingleFamilyExceptionConsidered: boolean;
  sparseSingleFamilyExceptionAllowed: boolean;
  sparseSingleFamilyExceptionReason?: string;
  credibleNarrativeGenreSubjectSignals: string[];
  sparseSingleFamilyBibliographicIdentity: string[];
  sparseSingleFamilyLikedItemCount?: number;
  sparseSingleFamilyNetWeight?: number;
  sparseExceptionPositiveNetFamily?: string;
  sparseExceptionIgnoredNonPositiveFamilies: string[];
  sparseExceptionYouthAudienceSignals: string[];
  sparseExceptionYouthAudienceBlocked: boolean;
  adultOpenLibrarySparseExceptionSupportEvidenceGroups?: string[];
  adultOpenLibrarySparseExceptionDislikedItemCount?: number;
  adultOpenLibrarySparseExceptionLikedWeight?: number;
  adultOpenLibrarySparseExceptionDislikedWeight?: number;
  adultOpenLibrarySparseExceptionProfileSupportPassed?: boolean;
  adultOpenLibrarySparseExceptionCredibleSubjectPassed?: boolean;
  adultOpenLibrarySparseExceptionBibliographicIdentityPassed?: boolean;
  adultOpenLibrarySparseExceptionSourceQualityScore?: number;
  adultOpenLibrarySparseExceptionSourceQualityPassed?: boolean;
  adultOpenLibrarySparseExceptionAgeSuitability?: number;
  adultOpenLibrarySparseExceptionAgeSuitabilityPassed?: boolean;
  adultOpenLibrarySparseExceptionYouthAudiencePassed?: boolean;
  adultOpenLibrarySparseExceptionNarrativeShape?: boolean;
  adultOpenLibrarySparseExceptionNarrativeShapePassed?: boolean;
  adultOpenLibrarySparseExceptionArtifactReasons?: string[];
  adultOpenLibrarySparseExceptionArtifactPassed?: boolean;
  adultOpenLibrarySparseExceptionFailedConditions?: string[];
};

type AdultOpenLibraryFamilyPolarity = {
  likedFamilyWeightByFamily: Record<string, number>;
  dislikedFamilyWeightByFamily: Record<string, number>;
  netFamilyWeightByFamily: Record<string, number>;
  likedItemCountByFamily: Record<string, number>;
  dislikedItemCountByFamily: Record<string, number>;
  positiveNetFamilies: string[];
  nonPositiveNetFamilies: string[];
};

function adultOpenLibraryDiagnosticSignals(candidate: ScoredCandidate, field: "metadataBackedMatchedLikedSignals" | "metadataBackedMatchedDislikedSignals"): string[] {
  const diagnosticSignals = candidate.diagnostics?.[field];
  return Array.isArray(diagnosticSignals) ? uniqueSignals(diagnosticSignals.map(String)) : [];
}

function adultOpenLibraryNonTitleMetadataValues(candidate: ScoredCandidate): string[] {
  const raw = (candidate.raw || {}) as Record<string, unknown>;
  return uniqueSignals([
    candidate.description,
    rawOpenLibraryDescription(raw),
    ...asStringList(raw.first_sentence),
    ...asStringList(raw.subject),
    ...asStringList(raw.subjects),
    ...asStringList(raw.subject_facet),
    ...asStringList(raw.subject_key),
    ...asStringList(candidate.genres),
    ...asStringList(candidate.themes),
    ...asStringList(candidate.tones),
    ...asStringList(candidate.characterDynamics),
    ...asStringList(candidate.formats),
    ...asStringList(candidate.creators),
    candidate.publicationYear,
    raw.first_publish_year,
    raw.publish_date,
    ...asStringList(raw.publisher),
    ...asStringList(raw.publishers),
    ...asStringList(raw.audience),
    ...asStringList(raw.audience_facet),
    candidate.maturityBand,
  ].map(normalized).filter(Boolean));
}

function adultOpenLibraryNonTitleMetadataText(candidate: ScoredCandidate): string {
  return adultOpenLibraryNonTitleMetadataValues(candidate).join(" ");
}

function adultOpenLibrarySignalSupportedByNonTitleMetadata(signal: string, metadataText: string): boolean {
  const value = normalized(signal);
  if (!value) return false;
  if (value === "ai") return /\b(artificial intelligence|machine intelligence|robots?|robotics|androids?|sentient computer|a i)\b/.test(metadataText);
  return signalPresentInText(metadataText, value);
}

function adultOpenLibraryPrimaryContentFamily(signal: string): AdultOpenLibraryContentFamily | "" {
  const value = normalized(signal);
  if (!value || ADULT_OPENLIBRARY_GENERIC_TASTE_SIGNAL.test(value) || ADULT_OPENLIBRARY_CONTEXT_ONLY_TASTE_SIGNAL.test(value) || ADULT_OPENLIBRARY_SUPPLEMENTAL_TASTE_SIGNAL.test(value)) return "";
  if (/\b(fantasy|magic|magical|mythology|mythological|dark fantasy|fantasy adventure|dragon|dragons)\b/.test(value)) return "fantasy";
  if (/\b(science fiction|sci fi|sci-fi|speculative|dystopia|dystopian|robot|robots|robotics|artificial intelligence|machine intelligence|android|androids|sentient computer)\b/.test(value)) return "science_fiction";
  if (/\b(mystery|crime|detective|thriller|suspense|noir|science fiction thriller|sci fi thriller|sci-fi thriller|historical crime)\b/.test(value)) return "mystery_crime_thriller";
  if (/\b(horror|gothic|paranormal|supernatural|psychological horror|occult)\b/.test(value)) return "horror_paranormal";
  if (/\b(history|historical)\b/.test(value)) return "historical";
  if (/\b(romance|romantic)\b/.test(value)) return "romance";
  if (/\b(drama|contemporary|realistic|literary)\b/.test(value)) return "drama_contemporary";
  if (/\b(adventure|action|survival|quest)\b/.test(value)) return "adventure_action";
  if (/\b(comedy|humor|funny)\b/.test(value)) return "comedy";
  return "";
}

function adultOpenLibraryContentFamilies(signals: string[]): string[] {
  return Array.from(new Set(signals.map(adultOpenLibraryPrimaryContentFamily).filter(Boolean)));
}

function adultOpenLibraryUniqueFamilies(families: string[]): string[] {
  return Array.from(new Set(families.filter(Boolean)));
}

function adultOpenLibraryFamilySupportedByText(family: string, text: string): boolean {
  switch (family) {
    case "fantasy":
      return /\b(fantasy|magic|magical|mythology|mythological|myths?|legends?|wizard|witch|witches|dragon|dragons|kingdom|spell|enchanted)\b/.test(text);
    case "science_fiction":
      return /\b(science fiction|sci fi|sci-fi|speculative fiction|dystopia|dystopian|space|robots?|robotics|androids?|artificial intelligence|machine intelligence|sentient computer|technology)\b/.test(text);
    case "mystery_crime_thriller":
      return /\b(mystery|mysteries|crime|criminal|detective|thriller|suspense|noir|investigation|investigations|case|cases)\b/.test(text);
    case "horror_paranormal":
      return /\b(horror|gothic|paranormal|supernatural|psychological horror|occult|ghosts?|haunted|terror)\b/.test(text);
    case "historical":
      return /\b(history|historical|period fiction|historical fiction)\b/.test(text);
    case "romance":
      return /\b(romance|romantic|love stories|love story)\b/.test(text);
    case "drama_contemporary":
      return /\b(drama|contemporary|realistic|literary fiction|domestic fiction)\b/.test(text);
    case "adventure_action":
      return /\b(adventure|adventures|action|quest|quests|survival|expedition)\b/.test(text);
    case "comedy":
      return /\b(comedy|humor|humour|funny|comic|satire|satirical)\b/.test(text);
    default:
      return false;
  }
}

function adultOpenLibraryMetadataFieldGroups(candidate: ScoredCandidate): Record<string, string> {
  const raw = (candidate.raw || {}) as Record<string, unknown>;
  return {
    description: uniqueSignals([
      candidate.description,
      rawOpenLibraryDescription(raw),
      ...asStringList(raw.first_sentence),
    ].map(normalized).filter(Boolean)).join(" "),
    subjects: uniqueSignals([
      ...asStringList(raw.subject),
      ...asStringList(raw.subjects),
      ...asStringList(raw.subject_facet),
      ...asStringList(raw.subject_key),
    ].map(normalized).filter(Boolean)).join(" "),
    normalized: uniqueSignals([
      ...asStringList(candidate.genres),
      ...asStringList(candidate.themes),
      ...asStringList(candidate.tones),
      ...asStringList(candidate.characterDynamics),
      ...asStringList(candidate.formats),
    ].map(normalized).filter(Boolean)).join(" "),
    publication: uniqueSignals([
      candidate.publicationYear,
      raw.first_publish_year,
      raw.publish_date,
      ...asStringList(raw.publisher),
      ...asStringList(raw.publishers),
      ...asStringList(raw.audience),
      ...asStringList(raw.audience_facet),
      candidate.maturityBand,
    ].map(normalized).filter(Boolean)).join(" "),
  };
}

function adultOpenLibraryMetadataEvidenceGroups(candidate: ScoredCandidate): Record<string, string> {
  const raw = (candidate.raw || {}) as Record<string, unknown>;
  return {
    subject_derived: uniqueSignals([
      ...asStringList(raw.subject),
      ...asStringList(raw.subjects),
      ...asStringList(raw.subject_facet),
      ...asStringList(raw.subject_key),
      ...asStringList(candidate.genres),
      ...asStringList(candidate.themes),
    ].map(normalized).filter(Boolean)).join(" "),
    description_derived: uniqueSignals([
      candidate.description,
      rawOpenLibraryDescription(raw),
      ...asStringList(raw.first_sentence),
    ].map(normalized).filter(Boolean)).join(" "),
    bibliographic: uniqueSignals([
      ...asStringList(raw.publisher),
      ...asStringList(raw.publishers),
      ...asStringList(raw.audience),
      ...asStringList(raw.audience_facet),
      candidate.maturityBand,
    ].map(normalized).filter(Boolean)).join(" "),
    creator_or_series: uniqueSignals([
      ...asStringList(candidate.creators),
      ...asStringList(raw.authors),
      ...asStringList(raw.author_name),
      ...asStringList(raw.creators),
      ...asStringList(raw.series),
    ].map(normalized).filter(Boolean)).join(" "),
  };
}

function adultOpenLibrarySubjectDerivedMetadataValues(candidate: ScoredCandidate): string[] {
  const raw = (candidate.raw || {}) as Record<string, unknown>;
  return uniqueSignals([
    ...asStringList(raw.subject),
    ...asStringList(raw.subjects),
    ...asStringList(raw.subject_facet),
    ...asStringList(raw.subject_key),
    ...asStringList(candidate.genres),
    ...asStringList(candidate.themes),
  ].map(normalized).filter(Boolean));
}

function adultOpenLibraryCredibleNarrativeGenreSubjectSignals(candidate: ScoredCandidate, family: string): string[] {
  const patterns: Record<string, RegExp> = {
    fantasy: /\b(fantasy fiction|fantasy novels?|fantasy stories|epic fantasy|dark fantasy)\b/g,
    science_fiction: /\b(science fiction|science fiction fiction|science fiction novels?|science fiction stories|dystopian fiction|speculative fiction)\b/g,
    mystery_crime_thriller: /\b(crime fiction|detective fiction|mystery fiction|mystery novels?|thrillers?|thriller fiction|suspense fiction)\b/g,
    historical: /\b(historical fiction|historical novels?)\b/g,
    romance: /\b(romance fiction|romance novels?)\b/g,
    horror_paranormal: /\b(horror fiction|horror tales|gothic fiction|gothic novels?)\b/g,
    drama_contemporary: /\b(contemporary fiction|literary fiction|domestic fiction)\b/g,
  };
  const pattern = patterns[family];
  if (!pattern) return [];
  const signals: string[] = [];
  for (const value of adultOpenLibrarySubjectDerivedMetadataValues(candidate)) {
    pattern.lastIndex = 0;
    signals.push(...(value.match(pattern) || []));
  }
  return uniqueSignals(signals);
}

function adultOpenLibrarySparseSingleFamilyBibliographicIdentity(candidate: ScoredCandidate): { qualified: boolean; signals: string[] } {
  const raw = (candidate.raw || {}) as Record<string, unknown>;
  const hasSourceIdentifier = Boolean(candidate.sourceId || raw.key || raw.workKey);
  const hasCreator = candidate.creators.length > 0
    || asStringList(raw.author_name).length > 0
    || asStringList(raw.authors).length > 0
    || asStringList(raw.creators).length > 0;
  const hasPublisher = asStringList(raw.publisher).length > 0 || asStringList(raw.publishers).length > 0;
  const hasPublicationYear = Boolean(candidate.publicationYear || raw.first_publish_year || raw.publish_date);
  const hasEditionIdentifier = asStringList(raw.cover_edition_key).length > 0
    || asStringList(raw.edition_key).length > 0
    || asStringList(raw.isbn).length > 0
    || asStringList(raw.isbn_10).length > 0
    || asStringList(raw.isbn_13).length > 0;
  const signals = [
    hasSourceIdentifier ? "source_identifier" : "",
    hasCreator ? "creator" : "",
    hasPublisher ? "publisher_or_imprint" : "",
    hasPublicationYear ? "publication_year" : "",
    hasEditionIdentifier ? "edition_identifier" : "",
  ].filter(Boolean);
  return {
    qualified: hasSourceIdentifier && hasCreator && (hasPublisher || hasPublicationYear || hasEditionIdentifier),
    signals,
  };
}

function adultOpenLibrarySparseExceptionYouthAudienceSignals(candidate: ScoredCandidate): string[] {
  const youthAudiencePattern = /\b(juvenile fiction|young adult fiction|ya fiction|teen fiction|teenage fiction|children s fiction|children s books|books for young readers|middle grade|school fiction|high school fiction)\b/;
  const gradeAudiencePattern = /\b(?:grade\s*(?:5|6|7|8)|grades?\s*(?:4\s*(?:to|-)?\s*6|5\s*(?:to|-)?\s*8)|ages?\s*(?:8\s*(?:to|-)?\s*12|9\s*(?:to|-)?\s*12|12\s*(?:to|-)?\s*17))\b/;
  const laterYouthSeriesPattern = /\b(?:young adult|ya|juvenile|middle grade|teen|children s)\b.*\b(?:series|book|volume|vol)\s*(?:[2-9]|\d{2,})\b|\b(?:series|book|volume|vol)\s*(?:[2-9]|\d{2,})\b.*\b(?:young adult|ya|juvenile|middle grade|teen|children s)\b/;
  const signals: string[] = [];
  for (const { field, text } of adultOpenLibraryShapeFields(candidate)) {
    if (field === "title" || field === "subtitle") continue;
    const audienceMatch = text.match(youthAudiencePattern)?.[0] || text.match(gradeAudiencePattern)?.[0] || "";
    if (audienceMatch) signals.push(`${field}:${audienceMatch}`);
    if (field === "series") {
      const seriesMatch = text.match(laterYouthSeriesPattern)?.[0] || "";
      if (seriesMatch) signals.push(`${field}:later_youth_series`);
    }
  }
  return uniqueSignals(signals);
}

function adultOpenLibraryFamilySupportFieldsByFamily(candidate: ScoredCandidate, families: string[]): Record<string, string[]> {
  const groups = adultOpenLibraryMetadataFieldGroups(candidate);
  const support: Record<string, string[]> = {};
  for (const family of families) {
    support[family] = Object.entries(groups)
      .filter(([, text]) => adultOpenLibraryFamilySupportedByText(family, text))
      .map(([field]) => field);
  }
  return support;
}

function adultOpenLibraryFamilySupportEvidenceGroupsByFamily(candidate: ScoredCandidate, families: string[]): Record<string, string[]> {
  const groups = adultOpenLibraryMetadataEvidenceGroups(candidate);
  const support: Record<string, string[]> = {};
  for (const family of families) {
    support[family] = Object.entries(groups)
      .filter(([, text]) => adultOpenLibraryFamilySupportedByText(family, text))
      .map(([group]) => group);
  }
  return support;
}

function adultOpenLibraryStrongAdultFitSignals(metadataValues: string[]): string[] {
  const signals: string[] = [];
  for (const value of metadataValues) {
    if (/\b(adult fiction|fiction for adults|adult fantasy|adult science fiction|adult sci fi|adult audience|general adult readership|adult readership|for adults)\b/.test(value)) {
      signals.push(value);
    }
  }
  return uniqueSignals(signals);
}

function adultOpenLibraryNormalBookBibliographicStructure(candidate: ScoredCandidate): boolean {
  const raw = (candidate.raw || {}) as Record<string, unknown>;
  return Boolean(
    candidate.sourceId
    || candidate.creators.length > 0
    || candidate.publicationYear
    || asStringList(raw.publisher).length
    || asStringList(raw.publishers).length,
  );
}

function adultOpenLibraryNarrativeFictionShape(
  candidate: ScoredCandidate,
  metadataText: string,
  nonNarrativeShapeReasons: string[],
  familySupportEvidenceGroupsByFamily: Record<string, string[]>,
  ageBandSuitability: number,
): {
  narrativeFictionShape: boolean;
  narrativeShapeEvidence: string[];
  sparseNarrativeShapeApplied: boolean;
  sparseNarrativeShapeReason?: string;
} {
  if (nonNarrativeShapeReasons.length > 0) {
    return { narrativeFictionShape: false, narrativeShapeEvidence: [], sparseNarrativeShapeApplied: false };
  }
  if (/\b(nonfiction|non fiction|biography|bibliography|reference|guide|manual|workbook|activity book|puzzle book|game book|criticism|analysis|study|studies|essays|informational)\b/.test(metadataText)) {
    return { narrativeFictionShape: false, narrativeShapeEvidence: [], sparseNarrativeShapeApplied: false };
  }
  if (/\b(fiction|novel|novels|literary fiction|fantasy|science fiction|sci fi|sci-fi|mystery|thriller|horror|romance|adventure fiction|historical fiction)\b/.test(metadataText)) {
    return { narrativeFictionShape: true, narrativeShapeEvidence: ["explicit_narrative_or_genre_fiction_metadata"], sparseNarrativeShapeApplied: false };
  }

  const credibleSparseFamilies = new Set([
    "fantasy",
    "science_fiction",
    "mystery_crime_thriller",
    "horror_paranormal",
    "historical",
    "romance",
    "drama_contemporary",
    "adventure_action",
  ]);
  const sparseFamilyEvidence = Object.entries(familySupportEvidenceGroupsByFamily)
    .filter(([family, groups]) => credibleSparseFamilies.has(family) && groups.some((group) => group === "subject_derived" || group === "bibliographic" || group === "creator_or_series"))
    .map(([family, groups]) => `${family}:${groups.join("+")}`);
  if (ageBandSuitability > -2 && adultOpenLibraryNormalBookBibliographicStructure(candidate) && sparseFamilyEvidence.length > 0) {
    return {
      narrativeFictionShape: true,
      narrativeShapeEvidence: ["normal_book_bibliographic_structure", ...sparseFamilyEvidence],
      sparseNarrativeShapeApplied: true,
      sparseNarrativeShapeReason: "adult_openlibrary_sparse_genre_novel_shape",
    };
  }

  return { narrativeFictionShape: false, narrativeShapeEvidence: [], sparseNarrativeShapeApplied: false };
}

function adultOpenLibraryFamilyEvidenceKey(value: unknown, action: "like" | "dislike"): string {
  const raw = String(value || "").toLowerCase().trim();
  const prefix = `${action}:`;
  if (!raw.startsWith(prefix)) return "";
  return normalized(raw.slice(prefix.length));
}

function adultOpenLibraryRoundWeight(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function adultOpenLibraryWeightTotalsByFamily(itemsByFamily: Record<string, Record<string, number>>): Record<string, number> {
  return Object.fromEntries(
    Object.entries(itemsByFamily).map(([family, itemWeights]) => [
      family,
      adultOpenLibraryRoundWeight(Object.values(itemWeights).reduce((sum, weight) => sum + weight, 0)),
    ]),
  );
}

function adultOpenLibraryItemCountsByFamily(itemsByFamily: Record<string, Record<string, number>>): Record<string, number> {
  return Object.fromEntries(Object.entries(itemsByFamily).map(([family, itemWeights]) => [family, Object.keys(itemWeights).length]));
}

function adultOpenLibraryAddFamilyEvidence(itemsByFamily: Record<string, Record<string, number>>, family: string, itemKey: string, weight: number): void {
  if (!family || !itemKey || weight <= 0) return;
  itemsByFamily[family] = itemsByFamily[family] || {};
  itemsByFamily[family][itemKey] = Math.max(Number(itemsByFamily[family][itemKey] || 0), weight);
}

function adultOpenLibraryProfileSignalRows(profile: TasteProfile): Array<{ value: string; weight: number; evidence: string[] }> {
  return [
    ...profile.genreFamily,
    ...profile.themes,
    ...profile.tone,
    ...profile.characterDynamics,
    ...profile.formatPreference,
    ...profile.avoidSignals,
  ].map((row) => ({
    value: String(row.value || ""),
    weight: Number(row.weight || 0),
    evidence: Array.isArray(row.evidence) ? row.evidence.map(String) : [],
  }));
}

function adultOpenLibraryFamilyPolarity(profile: TasteProfile, metadataText: string): AdultOpenLibraryFamilyPolarity {
  const likedItemsByFamily: Record<string, Record<string, number>> = {};
  const dislikedItemsByFamily: Record<string, Record<string, number>> = {};

  for (const row of adultOpenLibraryProfileSignalRows(profile)) {
    const family = adultOpenLibraryPrimaryContentFamily(row.value);
    if (!family || !adultOpenLibraryFamilySupportedByText(family, metadataText)) continue;
    const weight = Math.abs(Number(row.weight || 0));
    if (!Number.isFinite(weight) || weight <= 0) continue;
    for (const evidence of row.evidence) {
      const likedKey = adultOpenLibraryFamilyEvidenceKey(evidence, "like");
      if (likedKey) adultOpenLibraryAddFamilyEvidence(likedItemsByFamily, family, likedKey, weight);
      const dislikedKey = adultOpenLibraryFamilyEvidenceKey(evidence, "dislike");
      if (dislikedKey) adultOpenLibraryAddFamilyEvidence(dislikedItemsByFamily, family, dislikedKey, weight);
    }
  }

  const likedFamilyWeightByFamily = adultOpenLibraryWeightTotalsByFamily(likedItemsByFamily);
  const dislikedFamilyWeightByFamily = adultOpenLibraryWeightTotalsByFamily(dislikedItemsByFamily);
  const likedItemCountByFamily = adultOpenLibraryItemCountsByFamily(likedItemsByFamily);
  const dislikedItemCountByFamily = adultOpenLibraryItemCountsByFamily(dislikedItemsByFamily);
  const families = adultOpenLibraryUniqueFamilies([...Object.keys(likedFamilyWeightByFamily), ...Object.keys(dislikedFamilyWeightByFamily)]);
  const netFamilyWeightByFamily: Record<string, number> = {};
  for (const family of families) {
    netFamilyWeightByFamily[family] = adultOpenLibraryRoundWeight(Number(likedFamilyWeightByFamily[family] || 0) - Number(dislikedFamilyWeightByFamily[family] || 0));
  }
  return {
    likedFamilyWeightByFamily,
    dislikedFamilyWeightByFamily,
    netFamilyWeightByFamily,
    likedItemCountByFamily,
    dislikedItemCountByFamily,
    positiveNetFamilies: families.filter((family) => Number(netFamilyWeightByFamily[family] || 0) > 0),
    nonPositiveNetFamilies: families.filter((family) => Number(netFamilyWeightByFamily[family] || 0) <= 0),
  };
}

function adultOpenLibraryInstructionalWritingShapeReasons(candidate: ScoredCandidate, metadataText: string): string[] {
  const raw = (candidate.raw || {}) as Record<string, unknown>;
  const titleText = normalized([candidate.title, candidate.subtitle, raw.subtitle].filter(Boolean).join(" "));
  const instructionalWritingPattern = /\b(how to write|writing fiction|writing historical fiction|fiction writing|creative writing|writer s guide|writers guide|writing guide|handbook for writers|craft of fiction|writing manual|novel writing|plotting a novel|character development guide|guide to writing)\b/;
  const craftContextPattern = /\b(authorship|creative writing|writing|writers?|craft|guide|handbook|manual|plotting|character development|publishing|composition)\b/;
  const reasons: string[] = [];
  if (instructionalWritingPattern.test(metadataText) && craftContextPattern.test(metadataText)) reasons.push("adult_openlibrary_instructional_writing_artifact");
  if (instructionalWritingPattern.test(titleText) && craftContextPattern.test(metadataText)) reasons.push("adult_openlibrary_instructional_writing_artifact");
  return uniqueSignals(reasons);
}

type AdultOpenLibraryShapeField = { field: string; text: string };
type AdultOpenLibraryCollectionShapeEvidence = {
  reason?: string;
  trigger?: string;
  triggerField?: string;
  corroboration: string[];
};

function adultOpenLibraryShapeFields(candidate: ScoredCandidate): AdultOpenLibraryShapeField[] {
  const raw = (candidate.raw || {}) as Record<string, unknown>;
  const normalizedField = (field: string, values: unknown[]): AdultOpenLibraryShapeField => ({
    field,
    text: uniqueSignals(values.flatMap(asStringList).map(normalized).filter(Boolean)).join(" "),
  });
  return [
    normalizedField("title", [candidate.title]),
    normalizedField("subtitle", [candidate.subtitle, raw.subtitle]),
    normalizedField("description", [candidate.description, rawOpenLibraryDescription(raw)]),
    normalizedField("first_sentence", [raw.first_sentence]),
    normalizedField("subjects", [raw.subject, raw.subjects]),
    normalizedField("subject_facets", [raw.subject_facet]),
    normalizedField("subject_keys", [raw.subject_key]),
    normalizedField("normalized", [candidate.genres, candidate.themes, candidate.tones, candidate.characterDynamics, candidate.formats]),
    normalizedField("notes", [raw.notes, raw.note, raw.edition_notes, raw.work_notes]),
    normalizedField("publisher", [raw.publisher, raw.publishers]),
    normalizedField("creator", [candidate.creators, raw.authors, raw.author_name, raw.creators, raw.editor, raw.editors, raw.compiler, raw.compilers]),
    normalizedField("series", [raw.series]),
  ].filter((item) => item.text);
}

function adultOpenLibraryCollectionShapeEvidence(candidate: ScoredCandidate): AdultOpenLibraryCollectionShapeEvidence {
  const fields = adultOpenLibraryShapeFields(candidate);
  const strongPackagePattern = /\b(anthology|anthologies|collected stories|collected works|collected papers|complete stories|complete works|selected stories|selected works|selected papers|collection of stories|collection of short stories|short story collections?|fiction collections?|essay collections?|poetry collections?|omnibus)\b/;
  const titlePackagePattern = /\b(masterpieces|best of|year s best|years best|collected|complete works|selected stories|anthology|anthologies|omnibus)\b/;
  const genericCollectionContext = /\b(library collections?|special collections?|collection development|archival collections?|publisher collections?|museum collections?)\b/;
  const corroborationPattern = /\b(short stories|story collections?|fiction collections?|essay collections?|poetry collections?|multiple works|anthology|anthologies|collections?|editor|edited by|compiler|compiled by|collected works|collected stories|selected stories|complete stories)\b/;

  for (const { field, text } of fields) {
    if ((field === "title" || field === "subtitle") || genericCollectionContext.test(text)) continue;
    const match = text.match(strongPackagePattern);
    if (match) {
      return {
        reason: "packaged_collection_or_anthology_shape",
        trigger: match[0],
        triggerField: field,
        corroboration: [],
      };
    }
  }

  const titleField = fields.find((item) => item.field === "title");
  const subtitleField = fields.find((item) => item.field === "subtitle");
  const titleTrigger = [titleField, subtitleField].find((item) => item && titlePackagePattern.test(item.text));
  if (titleTrigger) {
    const corroboration = fields
      .filter((item) => item.field !== "title" && item.field !== "subtitle" && !genericCollectionContext.test(item.text) && corroborationPattern.test(item.text))
      .map((item) => `${item.field}:${item.text.match(corroborationPattern)?.[0] || "package_evidence"}`);
    if (candidate.creators.length > 1) corroboration.push("creator:multiple_authors");
    if (corroboration.length > 0) {
      return {
        reason: "packaged_collection_or_anthology_shape",
        trigger: titleTrigger.text.match(titlePackagePattern)?.[0],
        triggerField: titleTrigger.field,
        corroboration: uniqueSignals(corroboration),
      };
    }
  }

  return { corroboration: [] };
}

function adultOpenLibraryPuzzleGameShapeReasons(candidate: ScoredCandidate): string[] {
  const reasons: string[] = [];
  const fields = adultOpenLibraryShapeFields(candidate);
  const directPuzzleGamePattern = /\b(adventure games?|puzzle adventures?|picture puzzles?|interactive fiction|interactive adventures?|gamebooks?|game books?|activity books?|activity adventure|choose your path|choose your own adventure|solve the mystery|solve the mysteries|solve-the-mystery|juvenile recreation|children s puzzle book|puzzle books?|maze books?|quiz books?|brain games?|role playing game guide|role-playing game guide|game guides?)\b/;
  for (const { text } of fields) {
    if (directPuzzleGamePattern.test(text)) reasons.push("adult_openlibrary_juvenile_puzzle_or_game_book_artifact");
    if (/\bpuzzles?\b/.test(text) && /\b(activities|activity)\b/.test(text)) reasons.push("adult_openlibrary_juvenile_puzzle_or_game_book_artifact");
    if (/\badventure games?\b/.test(text) && /\b(juvenile|children|childrens|children s)\b/.test(text)) reasons.push("adult_openlibrary_juvenile_puzzle_or_game_book_artifact");
    if (/\bsolve (?:the )?mysteries?\b/.test(text) && /\b(activity|activities|puzzles?)\b/.test(text)) reasons.push("adult_openlibrary_juvenile_puzzle_or_game_book_artifact");
  }
  return uniqueSignals(reasons);
}

function adultOpenLibraryNonNarrativeShapeReasons(candidate: ScoredCandidate, metadataText: string, collectionShape: AdultOpenLibraryCollectionShapeEvidence, puzzleGameShapeReasons: string[]): string[] {
  const reasons: string[] = [];
  const criticismOrInstructionShape = /\b(essays|criticism|critical essays|analysis|study|studies|study guide|reader s guide|bibliography|workbook|teacher guide|curriculum)\b/.test(metadataText);
  if (collectionShape.reason) reasons.push(collectionShape.reason);
  reasons.push(...puzzleGameShapeReasons);
  if (criticismOrInstructionShape) reasons.push("criticism_instruction_or_activity_shape");
  reasons.push(...adultOpenLibraryInstructionalWritingShapeReasons(candidate, metadataText));
  return uniqueSignals(reasons);
}

function adultOpenLibraryMeaningfulTasteEligibility(candidate: ScoredCandidate, profile: TasteProfile): AdultOpenLibraryTasteEligibility {
  if (profile.ageBand !== "adult" || candidate.source !== "openLibrary") {
    return { allowed: true, signals: [], nonTitleSignals: [], rawContentSignals: [], contentSignals: [], contextOnlySignals: [], supplementalSignals: [], meaningfulLikedContentSignals: [], overlappingDislikedContentSignals: [], nonOverlappingLikedContentSignals: [], dislikeOverlapRatio: 0, likedContentFamilies: [], dislikedContentFamilies: [], overlappingDislikedFamilies: [], nonOverlappingLikedFamilies: [], familyDislikeOverlapRatio: 0, likedFamilyWeightByFamily: {}, dislikedFamilyWeightByFamily: {}, netFamilyWeightByFamily: {}, likedItemCountByFamily: {}, dislikedItemCountByFamily: {}, positiveNetFamilies: [], nonPositiveNetFamilies: [], familySupportFieldsByFamily: {}, familySupportEvidenceGroupsByFamily: {}, strongAdultFitSignals: [], narrativeFictionShape: false, narrativeShapeEvidence: [], sparseNarrativeShapeApplied: false, collectionShapeCorroboration: [], puzzleGameShapeReasons: [], nonNarrativeShapeReasons: [], sparseSingleFamilyExceptionConsidered: false, sparseSingleFamilyExceptionAllowed: false, credibleNarrativeGenreSubjectSignals: [], sparseSingleFamilyBibliographicIdentity: [], sparseExceptionIgnoredNonPositiveFamilies: [], sparseExceptionYouthAudienceSignals: [], sparseExceptionYouthAudienceBlocked: false };
  }

  const positiveTasteScore = Number(candidate.diagnostics?.positiveTasteScore ?? (Number(candidate.scoreBreakdown?.genreFacetMatch || 0) + Number(candidate.scoreBreakdown?.positiveTasteMatch || 0)));
  const likedSignals = adultOpenLibraryDiagnosticSignals(candidate, "metadataBackedMatchedLikedSignals");
  const dislikedSignals = adultOpenLibraryDiagnosticSignals(candidate, "metadataBackedMatchedDislikedSignals");
  const ageBandSuitability = Number(candidate.scoreBreakdown?.ageBandSuitability ?? candidate.scoreBreakdown?.ageTeenSuitability ?? 0);
  const nonTitleMetadataValues = adultOpenLibraryNonTitleMetadataValues(candidate);
  const nonTitleMetadataText = adultOpenLibraryNonTitleMetadataText(candidate);
  const collectionShape = adultOpenLibraryCollectionShapeEvidence(candidate);
  const puzzleGameShapeReasons = adultOpenLibraryPuzzleGameShapeReasons(candidate);
  const nonNarrativeShapeReasons = adultOpenLibraryNonNarrativeShapeReasons(candidate, nonTitleMetadataText, collectionShape, puzzleGameShapeReasons);
  const strongAdultFitSignals = adultOpenLibraryStrongAdultFitSignals(nonTitleMetadataValues);
  const familyPolarity = adultOpenLibraryFamilyPolarity(profile, nonTitleMetadataText);
  const baseResult = {
    signals: likedSignals,
    nonTitleSignals: [] as string[],
    rawContentSignals: [] as string[],
    contentSignals: [] as string[],
    contextOnlySignals: [] as string[],
    supplementalSignals: [] as string[],
    meaningfulLikedContentSignals: [] as string[],
    overlappingDislikedContentSignals: [] as string[],
    nonOverlappingLikedContentSignals: [] as string[],
    dislikeOverlapRatio: 0,
    likedContentFamilies: [] as string[],
    dislikedContentFamilies: [] as string[],
    overlappingDislikedFamilies: [] as string[],
    nonOverlappingLikedFamilies: [] as string[],
    familyDislikeOverlapRatio: 0,
    likedFamilyWeightByFamily: familyPolarity.likedFamilyWeightByFamily,
    dislikedFamilyWeightByFamily: familyPolarity.dislikedFamilyWeightByFamily,
    netFamilyWeightByFamily: familyPolarity.netFamilyWeightByFamily,
    likedItemCountByFamily: familyPolarity.likedItemCountByFamily,
    dislikedItemCountByFamily: familyPolarity.dislikedItemCountByFamily,
    positiveNetFamilies: [] as string[],
    nonPositiveNetFamilies: [] as string[],
    familySupportFieldsByFamily: {} as Record<string, string[]>,
    familySupportEvidenceGroupsByFamily: {} as Record<string, string[]>,
    strongAdultFitSignals,
    narrativeFictionShape: false,
    narrativeShapeEvidence: [] as string[],
    sparseNarrativeShapeApplied: false,
    sparseNarrativeShapeReason: undefined as string | undefined,
    collectionShapeTrigger: collectionShape.trigger,
    collectionShapeTriggerField: collectionShape.triggerField,
    collectionShapeCorroboration: collectionShape.corroboration,
    puzzleGameShapeReasons,
    nonNarrativeShapeReasons,
    sparseSingleFamilyExceptionConsidered: false,
    sparseSingleFamilyExceptionAllowed: false,
    sparseSingleFamilyExceptionReason: undefined as string | undefined,
    credibleNarrativeGenreSubjectSignals: [] as string[],
    sparseSingleFamilyBibliographicIdentity: [] as string[],
    sparseSingleFamilyLikedItemCount: undefined as number | undefined,
    sparseSingleFamilyNetWeight: undefined as number | undefined,
    sparseExceptionPositiveNetFamily: undefined as string | undefined,
    sparseExceptionIgnoredNonPositiveFamilies: [] as string[],
    sparseExceptionYouthAudienceSignals: [] as string[],
    sparseExceptionYouthAudienceBlocked: false,
    adultOpenLibrarySparseExceptionSupportEvidenceGroups: undefined as string[] | undefined,
    adultOpenLibrarySparseExceptionDislikedItemCount: undefined as number | undefined,
    adultOpenLibrarySparseExceptionLikedWeight: undefined as number | undefined,
    adultOpenLibrarySparseExceptionDislikedWeight: undefined as number | undefined,
    adultOpenLibrarySparseExceptionProfileSupportPassed: undefined as boolean | undefined,
    adultOpenLibrarySparseExceptionCredibleSubjectPassed: undefined as boolean | undefined,
    adultOpenLibrarySparseExceptionBibliographicIdentityPassed: undefined as boolean | undefined,
    adultOpenLibrarySparseExceptionSourceQualityScore: undefined as number | undefined,
    adultOpenLibrarySparseExceptionSourceQualityPassed: undefined as boolean | undefined,
    adultOpenLibrarySparseExceptionAgeSuitability: undefined as number | undefined,
    adultOpenLibrarySparseExceptionAgeSuitabilityPassed: undefined as boolean | undefined,
    adultOpenLibrarySparseExceptionYouthAudiencePassed: undefined as boolean | undefined,
    adultOpenLibrarySparseExceptionNarrativeShape: undefined as boolean | undefined,
    adultOpenLibrarySparseExceptionNarrativeShapePassed: undefined as boolean | undefined,
    adultOpenLibrarySparseExceptionArtifactReasons: undefined as string[] | undefined,
    adultOpenLibrarySparseExceptionArtifactPassed: undefined as boolean | undefined,
    adultOpenLibrarySparseExceptionFailedConditions: undefined as string[] | undefined,
  };

  if (positiveTasteScore <= 0) return { allowed: false, reason: "adult_openlibrary_no_positive_metadata_taste", ...baseResult };
  if (!likedSignals.length) return { allowed: false, reason: "adult_openlibrary_no_metadata_liked_signals", ...baseResult };

  const nonTitleLikedSignals = uniqueSignals(likedSignals.filter((signal) => adultOpenLibrarySignalSupportedByNonTitleMetadata(signal, nonTitleMetadataText)));
  const contextOnlySignals = nonTitleLikedSignals.filter((signal) => ADULT_OPENLIBRARY_GENERIC_TASTE_SIGNAL.test(signal) || ADULT_OPENLIBRARY_CONTEXT_ONLY_TASTE_SIGNAL.test(signal));
  const supplementalSignals = nonTitleLikedSignals.filter((signal) => {
    const value = normalized(signal);
    return !ADULT_OPENLIBRARY_GENERIC_TASTE_SIGNAL.test(value)
      && !ADULT_OPENLIBRARY_CONTEXT_ONLY_TASTE_SIGNAL.test(value)
      && !adultOpenLibraryPrimaryContentFamily(value);
  });
  const rawContentSignals = nonTitleLikedSignals.filter((signal) => !!adultOpenLibraryPrimaryContentFamily(signal));
  const likedContentFamilies = adultOpenLibraryContentFamilies(rawContentSignals);
  const dislikedNonTitleSignals = uniqueSignals(dislikedSignals
    .filter((signal) => !ADULT_OPENLIBRARY_GENERIC_TASTE_SIGNAL.test(signal) && !ADULT_OPENLIBRARY_CONTEXT_ONLY_TASTE_SIGNAL.test(signal))
    .filter((signal) => adultOpenLibrarySignalSupportedByNonTitleMetadata(signal, nonTitleMetadataText)));
  const dislikedContentFamilies = adultOpenLibraryContentFamilies(dislikedNonTitleSignals);
  const dislikedContentFamilySet = new Set(dislikedContentFamilies);
  const overlappingDislikedContentSignals = rawContentSignals.filter((signal) => {
    const family = adultOpenLibraryPrimaryContentFamily(signal);
    return !!family && dislikedContentFamilySet.has(family);
  });
  const nonOverlappingLikedContentSignals = rawContentSignals.filter((signal) => {
    const family = adultOpenLibraryPrimaryContentFamily(signal);
    return !!family && !dislikedContentFamilySet.has(family);
  });
  const overlappingDislikedFamilies = likedContentFamilies.filter((family) => dislikedContentFamilySet.has(family));
  const nonOverlappingLikedFamilies = likedContentFamilies.filter((family) => !dislikedContentFamilySet.has(family));
  const familyDislikeOverlapRatio = likedContentFamilies.length > 0 ? overlappingDislikedFamilies.length / likedContentFamilies.length : 0;
  const familySupportFieldsByFamily = adultOpenLibraryFamilySupportFieldsByFamily(candidate, likedContentFamilies);
  const familySupportEvidenceGroupsByFamily = adultOpenLibraryFamilySupportEvidenceGroupsByFamily(candidate, likedContentFamilies);
  const narrativeShape = adultOpenLibraryNarrativeFictionShape(candidate, nonTitleMetadataText, nonNarrativeShapeReasons, familySupportEvidenceGroupsByFamily, ageBandSuitability);
  const positiveNetFamilies = likedContentFamilies.filter((family) => Number(familyPolarity.netFamilyWeightByFamily[family] || 0) > 0);
  const nonPositiveNetFamilies = likedContentFamilies.filter((family) => Number(familyPolarity.netFamilyWeightByFamily[family] || 0) <= 0);
  const resultEvidence = {
    signals: likedSignals,
    nonTitleSignals: nonTitleLikedSignals,
    rawContentSignals,
    contentSignals: rawContentSignals,
    contextOnlySignals,
    supplementalSignals,
    meaningfulLikedContentSignals: rawContentSignals,
    overlappingDislikedContentSignals,
    nonOverlappingLikedContentSignals,
    dislikeOverlapRatio: familyDislikeOverlapRatio,
    likedContentFamilies,
    dislikedContentFamilies,
    overlappingDislikedFamilies,
    nonOverlappingLikedFamilies,
    familyDislikeOverlapRatio,
    likedFamilyWeightByFamily: familyPolarity.likedFamilyWeightByFamily,
    dislikedFamilyWeightByFamily: familyPolarity.dislikedFamilyWeightByFamily,
    netFamilyWeightByFamily: familyPolarity.netFamilyWeightByFamily,
    likedItemCountByFamily: familyPolarity.likedItemCountByFamily,
    dislikedItemCountByFamily: familyPolarity.dislikedItemCountByFamily,
    positiveNetFamilies,
    nonPositiveNetFamilies,
    familySupportFieldsByFamily,
    familySupportEvidenceGroupsByFamily,
    strongAdultFitSignals,
    narrativeFictionShape: narrativeShape.narrativeFictionShape,
    narrativeShapeEvidence: narrativeShape.narrativeShapeEvidence,
    sparseNarrativeShapeApplied: narrativeShape.sparseNarrativeShapeApplied,
    sparseNarrativeShapeReason: narrativeShape.sparseNarrativeShapeReason,
    collectionShapeTrigger: collectionShape.trigger,
    collectionShapeTriggerField: collectionShape.triggerField,
    collectionShapeCorroboration: collectionShape.corroboration,
    puzzleGameShapeReasons,
    nonNarrativeShapeReasons,
    sparseSingleFamilyExceptionConsidered: false,
    sparseSingleFamilyExceptionAllowed: false,
    sparseSingleFamilyExceptionReason: undefined as string | undefined,
    credibleNarrativeGenreSubjectSignals: [] as string[],
    sparseSingleFamilyBibliographicIdentity: [] as string[],
    sparseSingleFamilyLikedItemCount: undefined as number | undefined,
    sparseSingleFamilyNetWeight: undefined as number | undefined,
    sparseExceptionPositiveNetFamily: undefined as string | undefined,
    sparseExceptionIgnoredNonPositiveFamilies: [] as string[],
    sparseExceptionYouthAudienceSignals: [] as string[],
    sparseExceptionYouthAudienceBlocked: false,
  };

  if (nonNarrativeShapeReasons.includes("adult_openlibrary_instructional_writing_artifact")) return { allowed: false, reason: "adult_openlibrary_instructional_writing_artifact", ...resultEvidence };
  if (nonNarrativeShapeReasons.length > 0) return { allowed: false, reason: "adult_openlibrary_non_narrative_or_collection_artifact", ...resultEvidence };
  if (ageBandSuitability <= -2 && strongAdultFitSignals.length === 0) return { allowed: false, reason: "adult_openlibrary_strongly_juvenile_without_adult_fit", ...resultEvidence };
  if (!rawContentSignals.length) return { allowed: false, reason: nonTitleLikedSignals.length ? "adult_openlibrary_context_or_generic_only_metadata_taste" : "adult_openlibrary_title_only_metadata_taste", ...resultEvidence };
  if (likedContentFamilies.length === 1) {
    const family = likedContentFamilies[0];
    if (Number(familyPolarity.dislikedFamilyWeightByFamily[family] || 0) >= Number(familyPolarity.likedFamilyWeightByFamily[family] || 0)) {
      return { allowed: false, reason: "adult_openlibrary_single_family_nonpositive_net_support", ...resultEvidence };
    }
  }
  if (likedContentFamilies.length >= 2 && positiveNetFamilies.length === 0) {
    return { allowed: false, reason: "adult_openlibrary_no_positive_net_family_support", ...resultEvidence };
  }

  const distinctiveFamilies = adultOpenLibraryContentFamilies(rawContentSignals.filter((signal) => ADULT_OPENLIBRARY_DISTINCTIVE_RAW_SIGNAL.test(signal)));
  const positiveDistinctiveFamilies = distinctiveFamilies.filter((family) => positiveNetFamilies.includes(family));

  if (positiveDistinctiveFamilies.length > 0 || positiveNetFamilies.length >= 2) return { allowed: true, ...resultEvidence };
  const singleFamily = positiveNetFamilies[0] || likedContentFamilies[0] || "";
  const singleFamilySupportEvidenceGroups = familySupportEvidenceGroupsByFamily[singleFamily] || [];
  const sourceQualityScore = Number(candidate.diagnostics?.sourceQualityScore ?? candidate.scoreBreakdown?.sourceQualityRelevance ?? 0);
  const sparseSingleFamilyExceptionConsidered = Boolean(
    singleFamily
    && positiveNetFamilies.length === 1
    && singleFamilySupportEvidenceGroups.length >= 1
    && singleFamilySupportEvidenceGroups.includes("subject_derived"),
  );
  const credibleNarrativeGenreSubjectSignals = singleFamily
    ? adultOpenLibraryCredibleNarrativeGenreSubjectSignals(candidate, singleFamily)
    : [];
  const bibliographicIdentity = adultOpenLibrarySparseSingleFamilyBibliographicIdentity(candidate);
  const singleFamilyLikedItemCount = Number(familyPolarity.likedItemCountByFamily[singleFamily] || 0);
  const singleFamilyDislikedItemCount = Number(familyPolarity.dislikedItemCountByFamily[singleFamily] || 0);
  const singleFamilyLikedWeight = Number(familyPolarity.likedFamilyWeightByFamily[singleFamily] || 0);
  const singleFamilyDislikedWeight = Number(familyPolarity.dislikedFamilyWeightByFamily[singleFamily] || 0);
  const singleFamilyNetWeight = Number(familyPolarity.netFamilyWeightByFamily[singleFamily] || 0);
  const ignoredNonPositiveFamilies = likedContentFamilies.filter((family) => family !== singleFamily && Number(familyPolarity.netFamilyWeightByFamily[family] || 0) <= 0);
  const youthAudienceSignals = adultOpenLibrarySparseExceptionYouthAudienceSignals(candidate);
  const youthAudienceBlocked = youthAudienceSignals.length > 0;
  
  const sparseSingleFamilyProfileSupported = singleFamilyLikedItemCount >= 2
    && singleFamilyNetWeight >= 1
    && singleFamilyLikedWeight > singleFamilyDislikedWeight;
  
  const failedConditions: string[] = [];
  
  if (sparseSingleFamilyExceptionConsidered) {
    if (!singleFamilySupportEvidenceGroups.includes("subject_derived")) {
      failedConditions.push("missing_subject_derived_support");
    }
    if (!sparseSingleFamilyProfileSupported) {
      if (singleFamilyLikedItemCount < 2) failedConditions.push("liked_item_count_below_two");
      if (singleFamilyNetWeight < 1) failedConditions.push("net_family_weight_below_one");
      if (singleFamilyLikedWeight <= singleFamilyDislikedWeight) failedConditions.push("liked_weight_not_greater_than_disliked");
    }
    if (credibleNarrativeGenreSubjectSignals.length === 0) {
      failedConditions.push("missing_credible_narrative_subject");
    }
    if (!bibliographicIdentity.qualified) {
      failedConditions.push("bibliographic_identity_incomplete");
    }
    if (sourceQualityScore <= 0) {
      failedConditions.push("source_quality_not_positive");
    }
    if (ageBandSuitability <= -2) {
      failedConditions.push("strongly_juvenile");
    }
    if (youthAudienceBlocked) {
      failedConditions.push("youth_audience_blocked");
    }
    if (!narrativeShape.narrativeFictionShape) {
      failedConditions.push("narrative_shape_failed");
    }
  }
  
  const artifactReasons = [...nonNarrativeShapeReasons.filter((r) => r.includes("artifact") || r.includes("collection") || r.includes("instructional") || r.includes("puzzle"))];
  const artifactPassed = artifactReasons.length === 0;
  
  const sparseSingleFamilyEvidence = {
    sparseSingleFamilyExceptionConsidered,
    sparseSingleFamilyExceptionAllowed: false,
    sparseSingleFamilyExceptionReason: sparseSingleFamilyExceptionConsidered ? "adult_openlibrary_sparse_single_family_not_allowed" : "adult_openlibrary_sparse_single_family_not_considered",
    credibleNarrativeGenreSubjectSignals,
    sparseSingleFamilyBibliographicIdentity: bibliographicIdentity.signals,
    sparseSingleFamilyLikedItemCount: singleFamilyLikedItemCount || undefined,
    sparseSingleFamilyNetWeight: singleFamily ? adultOpenLibraryRoundWeight(singleFamilyNetWeight) : undefined,
    sparseExceptionPositiveNetFamily: sparseSingleFamilyExceptionConsidered ? singleFamily : undefined,
    sparseExceptionIgnoredNonPositiveFamilies: ignoredNonPositiveFamilies,
    sparseExceptionYouthAudienceSignals: youthAudienceSignals,
    sparseExceptionYouthAudienceBlocked: youthAudienceBlocked,
    adultOpenLibrarySparseExceptionSupportEvidenceGroups: sparseSingleFamilyExceptionConsidered ? singleFamilySupportEvidenceGroups : undefined,
    adultOpenLibrarySparseExceptionDislikedItemCount: sparseSingleFamilyExceptionConsidered ? singleFamilyDislikedItemCount || undefined : undefined,
    adultOpenLibrarySparseExceptionLikedWeight: sparseSingleFamilyExceptionConsidered ? adultOpenLibraryRoundWeight(singleFamilyLikedWeight) : undefined,
    adultOpenLibrarySparseExceptionDislikedWeight: sparseSingleFamilyExceptionConsidered ? adultOpenLibraryRoundWeight(singleFamilyDislikedWeight) : undefined,
    adultOpenLibrarySparseExceptionProfileSupportPassed: sparseSingleFamilyExceptionConsidered ? sparseSingleFamilyProfileSupported : undefined,
    adultOpenLibrarySparseExceptionCredibleSubjectPassed: sparseSingleFamilyExceptionConsidered ? credibleNarrativeGenreSubjectSignals.length > 0 : undefined,
    adultOpenLibrarySparseExceptionBibliographicIdentityPassed: sparseSingleFamilyExceptionConsidered ? bibliographicIdentity.qualified : undefined,
    adultOpenLibrarySparseExceptionSourceQualityScore: sparseSingleFamilyExceptionConsidered ? adultOpenLibraryRoundWeight(sourceQualityScore) : undefined,
    adultOpenLibrarySparseExceptionSourceQualityPassed: sparseSingleFamilyExceptionConsidered ? sourceQualityScore > 0 : undefined,
    adultOpenLibrarySparseExceptionAgeSuitability: sparseSingleFamilyExceptionConsidered ? ageBandSuitability : undefined,
    adultOpenLibrarySparseExceptionAgeSuitabilityPassed: sparseSingleFamilyExceptionConsidered ? ageBandSuitability > -2 : undefined,
    adultOpenLibrarySparseExceptionYouthAudiencePassed: sparseSingleFamilyExceptionConsidered ? !youthAudienceBlocked : undefined,
    adultOpenLibrarySparseExceptionNarrativeShape: sparseSingleFamilyExceptionConsidered ? narrativeShape.narrativeFictionShape : undefined,
    adultOpenLibrarySparseExceptionNarrativeShapePassed: sparseSingleFamilyExceptionConsidered ? narrativeShape.narrativeFictionShape : undefined,
    adultOpenLibrarySparseExceptionArtifactReasons: sparseSingleFamilyExceptionConsidered ? artifactReasons : undefined,
    adultOpenLibrarySparseExceptionArtifactPassed: sparseSingleFamilyExceptionConsidered ? artifactPassed : undefined,
    adultOpenLibrarySparseExceptionFailedConditions: sparseSingleFamilyExceptionConsidered && failedConditions.length > 0 ? failedConditions : undefined,
  };
  const strongSingleFamilySupport = narrativeShape.narrativeFictionShape
    && singleFamilySupportEvidenceGroups.length >= 2
    && singleFamilySupportEvidenceGroups.some((group) => group !== "bibliographic")
    && ageBandSuitability > -2
    && Number(familyPolarity.netFamilyWeightByFamily[singleFamily] || 0) > 0
    && !overlappingDislikedFamilies.includes(singleFamily);
  if (singleFamily && strongSingleFamilySupport) {
    return { allowed: true, allowedReason: "adult_openlibrary_single_family_strong_multifield_support", ...resultEvidence };
  }
  const sparseSingleFamilyAllowed = sparseSingleFamilyExceptionConsidered
    && singleFamilySupportEvidenceGroups.includes("subject_derived")
    && sparseSingleFamilyProfileSupported
    && credibleNarrativeGenreSubjectSignals.length > 0
    && bibliographicIdentity.qualified
    && sourceQualityScore > 0
    && ageBandSuitability > -2
    && !youthAudienceBlocked;
  if (singleFamily && sparseSingleFamilyAllowed) {
    const reason = "adult_openlibrary_sparse_single_family_profile_supported_narrative";
    return {
      allowed: true,
      allowedReason: reason,
      ...resultEvidence,
      narrativeFictionShape: true,
      narrativeShapeEvidence: [...resultEvidence.narrativeShapeEvidence, reason],
      sparseNarrativeShapeApplied: true,
      sparseNarrativeShapeReason: reason,
      ...sparseSingleFamilyEvidence,
      sparseSingleFamilyExceptionAllowed: true,
      sparseSingleFamilyExceptionReason: reason,
    };
  }
  if (sparseSingleFamilyExceptionConsidered && youthAudienceBlocked) {
    return { allowed: false, reason: "adult_openlibrary_sparse_exception_youth_audience_blocked", ...resultEvidence, ...sparseSingleFamilyEvidence, sparseSingleFamilyExceptionReason: "adult_openlibrary_sparse_exception_youth_audience_blocked" };
  }
  return { allowed: false, reason: "adult_openlibrary_single_broad_metadata_taste", ...resultEvidence, ...sparseSingleFamilyEvidence };
}

function addAdultOpenLibrarySelectionObservability(rankedCandidates: ScoredCandidate[], selected: ScoredCandidate[], rejectedReasons: Record<string, number>, profile: TasteProfile): void {
  if (profile.ageBand !== "adult" || !rankedCandidates.some((candidate) => candidate.source === "openLibrary")) return;
  const diagnostics = rejectedReasons as Record<string, unknown>;
  const selectedTitles = new Set(selected.map((candidate) => normalized(candidate.title)));
  const candidateTasteMatchScoreByTitle: Record<string, number> = {};
  const candidateTastePenaltyByTitle: Record<string, number> = {};
  const candidateMatchedLikedSignalsByTitle: Record<string, string[]> = {};
  const candidateMatchedDislikedSignalsByTitle: Record<string, string[]> = {};
  const metadataBackedLikedSignalsByTitle: Record<string, string[]> = {};
  const metadataBackedDislikedSignalsByTitle: Record<string, string[]> = {};
  const positiveTasteScoreByTitle: Record<string, number> = {};
  const finalScoreComponentsByTitle: Record<string, Record<string, number>> = {};
  const finalRankingReasonByTitle: Record<string, string> = {};
  const documentBackedTasteSignalsByTitle: Record<string, string[]> = {};
  const adultOpenLibraryRawContentSignals: Record<string, string[]> = {};
  const adultOpenLibraryContentSignals: Record<string, string[]> = {};
  const adultOpenLibraryContextOnlySignals: Record<string, string[]> = {};
  const adultOpenLibrarySupplementalSignals: Record<string, string[]> = {};
  const adultOpenLibraryNonTitleLikedSignalsByTitle: Record<string, string[]> = {};
  const adultOpenLibraryNonTitleDislikedSignalsByTitle: Record<string, string[]> = {};
  const adultOpenLibraryLikedContentFamilies: Record<string, string[]> = {};
  const adultOpenLibraryDislikedContentFamilies: Record<string, string[]> = {};
  const adultOpenLibraryOverlappingDislikedContentSignals: Record<string, string[]> = {};
  const adultOpenLibraryNonOverlappingLikedContentSignals: Record<string, string[]> = {};
  const adultOpenLibraryOverlappingDislikedFamilies: Record<string, string[]> = {};
  const adultOpenLibraryNonOverlappingLikedFamilies: Record<string, string[]> = {};
  const adultOpenLibraryDislikeOverlapRatio: Record<string, number> = {};
  const adultOpenLibraryFamilyDislikeOverlapRatio: Record<string, number> = {};
  const adultOpenLibraryLikedFamilyWeightByFamily: Record<string, Record<string, number>> = {};
  const adultOpenLibraryDislikedFamilyWeightByFamily: Record<string, Record<string, number>> = {};
  const adultOpenLibraryNetFamilyWeightByFamily: Record<string, Record<string, number>> = {};
  const adultOpenLibraryLikedItemCountByFamily: Record<string, Record<string, number>> = {};
  const adultOpenLibraryDislikedItemCountByFamily: Record<string, Record<string, number>> = {};
  const adultOpenLibraryPositiveNetFamilies: Record<string, string[]> = {};
  const adultOpenLibraryNonPositiveNetFamilies: Record<string, string[]> = {};
  const adultOpenLibraryFamilySupportFieldsByFamily: Record<string, Record<string, string[]>> = {};
  const adultOpenLibraryFamilySupportEvidenceGroupsByFamily: Record<string, Record<string, string[]>> = {};
  const adultOpenLibraryStrongAdultFitSignals: Record<string, string[]> = {};
  const adultOpenLibraryNarrativeShapeEvidence: Record<string, string[]> = {};
  const adultOpenLibrarySparseNarrativeShapeApplied: Record<string, boolean> = {};
  const adultOpenLibrarySparseNarrativeShapeReason: Record<string, string> = {};
  const adultOpenLibrarySparseSingleFamilyExceptionConsideredByTitle: Record<string, boolean> = {};
  const adultOpenLibrarySparseSingleFamilyExceptionAllowedByTitle: Record<string, boolean> = {};
  const adultOpenLibrarySparseSingleFamilyExceptionReasonByTitle: Record<string, string> = {};
  const adultOpenLibraryCredibleNarrativeGenreSubjectSignalsByTitle: Record<string, string[]> = {};
  const adultOpenLibrarySparseSingleFamilyBibliographicIdentityByTitle: Record<string, string[]> = {};
  const adultOpenLibrarySparseSingleFamilyLikedItemCountByTitle: Record<string, number> = {};
  const adultOpenLibrarySparseSingleFamilyNetWeightByTitle: Record<string, number> = {};
  const adultOpenLibrarySparseExceptionPositiveNetFamilyByTitle: Record<string, string> = {};
  const adultOpenLibrarySparseExceptionIgnoredNonPositiveFamiliesByTitle: Record<string, string[]> = {};
  const adultOpenLibrarySparseExceptionYouthAudienceSignalsByTitle: Record<string, string[]> = {};
  const adultOpenLibrarySparseExceptionYouthAudienceBlockedByTitle: Record<string, boolean> = {};
  const adultOpenLibrarySparseExceptionSupportEvidenceGroupsByTitle: Record<string, string[]> = {};
  const adultOpenLibrarySparseExceptionDislikedItemCountByTitle: Record<string, number> = {};
  const adultOpenLibrarySparseExceptionLikedWeightByTitle: Record<string, number> = {};
  const adultOpenLibrarySparseExceptionDislikedWeightByTitle: Record<string, number> = {};
  const adultOpenLibrarySparseExceptionProfileSupportPassedByTitle: Record<string, boolean> = {};
  const adultOpenLibrarySparseExceptionCredibleSubjectPassedByTitle: Record<string, boolean> = {};
  const adultOpenLibrarySparseExceptionBibliographicIdentityPassedByTitle: Record<string, boolean> = {};
  const adultOpenLibrarySparseExceptionSourceQualityScoreByTitle: Record<string, number> = {};
  const adultOpenLibrarySparseExceptionSourceQualityPassedByTitle: Record<string, boolean> = {};
  const adultOpenLibrarySparseExceptionAgeSuitabilityByTitle: Record<string, number> = {};
  const adultOpenLibrarySparseExceptionAgeSuitabilityPassedByTitle: Record<string, boolean> = {};
  const adultOpenLibrarySparseExceptionYouthAudiencePassedByTitle: Record<string, boolean> = {};
  const adultOpenLibrarySparseExceptionNarrativeShapeByTitle: Record<string, boolean> = {};
  const adultOpenLibrarySparseExceptionNarrativeShapePassedByTitle: Record<string, boolean> = {};
  const adultOpenLibrarySparseExceptionArtifactReasonsbyTitle: Record<string, string[]> = {};
  const adultOpenLibrarySparseExceptionArtifactPassedByTitle: Record<string, boolean> = {};
  const adultOpenLibrarySparseExceptionFailedConditionsByTitle: Record<string, string[]> = {};
  const adultOpenLibraryCollectionShapeTriggerByTitle: Record<string, string> = {};
  const adultOpenLibraryCollectionShapeTriggerFieldByTitle: Record<string, string> = {};
  const adultOpenLibraryCollectionShapeCorroborationByTitle: Record<string, string[]> = {};
  const adultOpenLibraryPuzzleGameShapeReasons: Record<string, string[]> = {};
  const adultOpenLibraryInstructionalShapeReasons: Record<string, string[]> = {};
  const adultOpenLibraryNonNarrativeShapeReasons: Record<string, string[]> = {};
  const adultOpenLibraryEligibilityAllowedByTitle: Record<string, boolean> = {};
  const adultOpenLibraryEligibilityReasonByTitle: Record<string, string> = {};
  const finalEligibilityRejectedTitlesByReason: Record<string, string[]> = {};
  const finalEligibilityAcceptedTitles: string[] = [];
  const meaningfulTasteEligibleTitles: string[] = [];
  for (const candidate of rankedCandidates.filter((row) => row.source === "openLibrary")) {
    const eligibility = adultOpenLibraryMeaningfulTasteEligibility(candidate, profile);
    const nonTitleMetadataText = adultOpenLibraryNonTitleMetadataText(candidate);
    const breakdown = candidate.scoreBreakdown || {};
    const likedSignals = Array.isArray(candidate.diagnostics?.metadataBackedMatchedLikedSignals)
      ? candidate.diagnostics.metadataBackedMatchedLikedSignals.map(String)
      : [];
    const dislikedSignals = Array.isArray(candidate.diagnostics?.metadataBackedMatchedDislikedSignals)
      ? candidate.diagnostics.metadataBackedMatchedDislikedSignals.map(String)
      : [];
    const positiveTasteScore = Number(candidate.diagnostics?.positiveTasteScore ?? (Number(breakdown.genreFacetMatch || 0) + Number(breakdown.positiveTasteMatch || 0)));
    const tastePenalty = Number(breakdown.avoidSignalPenalty || 0) + Number(breakdown.broadAvoidSignalPenalty || 0);
    candidateTasteMatchScoreByTitle[candidate.title] = Math.round(positiveTasteScore * 1000) / 1000;
    candidateTastePenaltyByTitle[candidate.title] = Math.round(tastePenalty * 1000) / 1000;
    candidateMatchedLikedSignalsByTitle[candidate.title] = likedSignals;
    candidateMatchedDislikedSignalsByTitle[candidate.title] = dislikedSignals;
    metadataBackedLikedSignalsByTitle[candidate.title] = likedSignals;
    metadataBackedDislikedSignalsByTitle[candidate.title] = dislikedSignals;
    positiveTasteScoreByTitle[candidate.title] = Math.round(positiveTasteScore * 1000) / 1000;
    documentBackedTasteSignalsByTitle[candidate.title] = eligibility.contentSignals;
    adultOpenLibraryRawContentSignals[candidate.title] = eligibility.rawContentSignals;
    adultOpenLibraryContentSignals[candidate.title] = eligibility.contentSignals;
    adultOpenLibraryContextOnlySignals[candidate.title] = eligibility.contextOnlySignals;
    adultOpenLibrarySupplementalSignals[candidate.title] = eligibility.supplementalSignals;
    adultOpenLibraryNonTitleLikedSignalsByTitle[candidate.title] = eligibility.nonTitleSignals;
    adultOpenLibraryNonTitleDislikedSignalsByTitle[candidate.title] = adultOpenLibraryDiagnosticSignals(candidate, "metadataBackedMatchedDislikedSignals")
      .filter((signal) => !ADULT_OPENLIBRARY_GENERIC_TASTE_SIGNAL.test(signal) && !ADULT_OPENLIBRARY_CONTEXT_ONLY_TASTE_SIGNAL.test(signal))
      .filter((signal) => adultOpenLibrarySignalSupportedByNonTitleMetadata(signal, nonTitleMetadataText));
    adultOpenLibraryLikedContentFamilies[candidate.title] = eligibility.likedContentFamilies;
    adultOpenLibraryDislikedContentFamilies[candidate.title] = eligibility.dislikedContentFamilies;
    adultOpenLibraryOverlappingDislikedContentSignals[candidate.title] = eligibility.overlappingDislikedContentSignals;
    adultOpenLibraryNonOverlappingLikedContentSignals[candidate.title] = eligibility.nonOverlappingLikedContentSignals;
    adultOpenLibraryOverlappingDislikedFamilies[candidate.title] = eligibility.overlappingDislikedFamilies;
    adultOpenLibraryNonOverlappingLikedFamilies[candidate.title] = eligibility.nonOverlappingLikedFamilies;
    adultOpenLibraryDislikeOverlapRatio[candidate.title] = Math.round(eligibility.dislikeOverlapRatio * 1000) / 1000;
    adultOpenLibraryFamilyDislikeOverlapRatio[candidate.title] = Math.round(eligibility.familyDislikeOverlapRatio * 1000) / 1000;
    adultOpenLibraryLikedFamilyWeightByFamily[candidate.title] = eligibility.likedFamilyWeightByFamily;
    adultOpenLibraryDislikedFamilyWeightByFamily[candidate.title] = eligibility.dislikedFamilyWeightByFamily;
    adultOpenLibraryNetFamilyWeightByFamily[candidate.title] = eligibility.netFamilyWeightByFamily;
    adultOpenLibraryLikedItemCountByFamily[candidate.title] = eligibility.likedItemCountByFamily;
    adultOpenLibraryDislikedItemCountByFamily[candidate.title] = eligibility.dislikedItemCountByFamily;
    adultOpenLibraryPositiveNetFamilies[candidate.title] = eligibility.positiveNetFamilies;
    adultOpenLibraryNonPositiveNetFamilies[candidate.title] = eligibility.nonPositiveNetFamilies;
    adultOpenLibraryFamilySupportFieldsByFamily[candidate.title] = eligibility.familySupportFieldsByFamily;
    adultOpenLibraryFamilySupportEvidenceGroupsByFamily[candidate.title] = eligibility.familySupportEvidenceGroupsByFamily;
    adultOpenLibraryStrongAdultFitSignals[candidate.title] = eligibility.strongAdultFitSignals;
    adultOpenLibraryNarrativeShapeEvidence[candidate.title] = eligibility.narrativeShapeEvidence;
    adultOpenLibrarySparseNarrativeShapeApplied[candidate.title] = eligibility.sparseNarrativeShapeApplied;
    if (eligibility.sparseNarrativeShapeReason) adultOpenLibrarySparseNarrativeShapeReason[candidate.title] = eligibility.sparseNarrativeShapeReason;
    adultOpenLibrarySparseSingleFamilyExceptionConsideredByTitle[candidate.title] = eligibility.sparseSingleFamilyExceptionConsidered;
    adultOpenLibrarySparseSingleFamilyExceptionAllowedByTitle[candidate.title] = eligibility.sparseSingleFamilyExceptionAllowed;
    if (eligibility.sparseSingleFamilyExceptionReason) adultOpenLibrarySparseSingleFamilyExceptionReasonByTitle[candidate.title] = eligibility.sparseSingleFamilyExceptionReason;
    adultOpenLibraryCredibleNarrativeGenreSubjectSignalsByTitle[candidate.title] = eligibility.credibleNarrativeGenreSubjectSignals;
    adultOpenLibrarySparseSingleFamilyBibliographicIdentityByTitle[candidate.title] = eligibility.sparseSingleFamilyBibliographicIdentity;
    if (typeof eligibility.sparseSingleFamilyLikedItemCount === "number") adultOpenLibrarySparseSingleFamilyLikedItemCountByTitle[candidate.title] = eligibility.sparseSingleFamilyLikedItemCount;
    if (typeof eligibility.sparseSingleFamilyNetWeight === "number") adultOpenLibrarySparseSingleFamilyNetWeightByTitle[candidate.title] = eligibility.sparseSingleFamilyNetWeight;
    if (eligibility.sparseExceptionPositiveNetFamily) adultOpenLibrarySparseExceptionPositiveNetFamilyByTitle[candidate.title] = eligibility.sparseExceptionPositiveNetFamily;
    adultOpenLibrarySparseExceptionIgnoredNonPositiveFamiliesByTitle[candidate.title] = eligibility.sparseExceptionIgnoredNonPositiveFamilies;
    adultOpenLibrarySparseExceptionYouthAudienceSignalsByTitle[candidate.title] = eligibility.sparseExceptionYouthAudienceSignals;
    adultOpenLibrarySparseExceptionYouthAudienceBlockedByTitle[candidate.title] = eligibility.sparseExceptionYouthAudienceBlocked;
    if (typeof eligibility.adultOpenLibrarySparseExceptionSupportEvidenceGroups !== "undefined") adultOpenLibrarySparseExceptionSupportEvidenceGroupsByTitle[candidate.title] = eligibility.adultOpenLibrarySparseExceptionSupportEvidenceGroups || [];
    if (typeof eligibility.adultOpenLibrarySparseExceptionDislikedItemCount === "number") adultOpenLibrarySparseExceptionDislikedItemCountByTitle[candidate.title] = eligibility.adultOpenLibrarySparseExceptionDislikedItemCount;
    if (typeof eligibility.adultOpenLibrarySparseExceptionLikedWeight === "number") adultOpenLibrarySparseExceptionLikedWeightByTitle[candidate.title] = eligibility.adultOpenLibrarySparseExceptionLikedWeight;
    if (typeof eligibility.adultOpenLibrarySparseExceptionDislikedWeight === "number") adultOpenLibrarySparseExceptionDislikedWeightByTitle[candidate.title] = eligibility.adultOpenLibrarySparseExceptionDislikedWeight;
    if (typeof eligibility.adultOpenLibrarySparseExceptionProfileSupportPassed === "boolean") adultOpenLibrarySparseExceptionProfileSupportPassedByTitle[candidate.title] = eligibility.adultOpenLibrarySparseExceptionProfileSupportPassed;
    if (typeof eligibility.adultOpenLibrarySparseExceptionCredibleSubjectPassed === "boolean") adultOpenLibrarySparseExceptionCredibleSubjectPassedByTitle[candidate.title] = eligibility.adultOpenLibrarySparseExceptionCredibleSubjectPassed;
    if (typeof eligibility.adultOpenLibrarySparseExceptionBibliographicIdentityPassed === "boolean") adultOpenLibrarySparseExceptionBibliographicIdentityPassedByTitle[candidate.title] = eligibility.adultOpenLibrarySparseExceptionBibliographicIdentityPassed;
    if (typeof eligibility.adultOpenLibrarySparseExceptionSourceQualityScore === "number") adultOpenLibrarySparseExceptionSourceQualityScoreByTitle[candidate.title] = eligibility.adultOpenLibrarySparseExceptionSourceQualityScore;
    if (typeof eligibility.adultOpenLibrarySparseExceptionSourceQualityPassed === "boolean") adultOpenLibrarySparseExceptionSourceQualityPassedByTitle[candidate.title] = eligibility.adultOpenLibrarySparseExceptionSourceQualityPassed;
    if (typeof eligibility.adultOpenLibrarySparseExceptionAgeSuitability === "number") adultOpenLibrarySparseExceptionAgeSuitabilityByTitle[candidate.title] = eligibility.adultOpenLibrarySparseExceptionAgeSuitability;
    if (typeof eligibility.adultOpenLibrarySparseExceptionAgeSuitabilityPassed === "boolean") adultOpenLibrarySparseExceptionAgeSuitabilityPassedByTitle[candidate.title] = eligibility.adultOpenLibrarySparseExceptionAgeSuitabilityPassed;
    if (typeof eligibility.adultOpenLibrarySparseExceptionYouthAudiencePassed === "boolean") adultOpenLibrarySparseExceptionYouthAudiencePassedByTitle[candidate.title] = eligibility.adultOpenLibrarySparseExceptionYouthAudiencePassed;
    if (typeof eligibility.adultOpenLibrarySparseExceptionNarrativeShape === "boolean") adultOpenLibrarySparseExceptionNarrativeShapeByTitle[candidate.title] = eligibility.adultOpenLibrarySparseExceptionNarrativeShape;
    if (typeof eligibility.adultOpenLibrarySparseExceptionNarrativeShapePassed === "boolean") adultOpenLibrarySparseExceptionNarrativeShapePassedByTitle[candidate.title] = eligibility.adultOpenLibrarySparseExceptionNarrativeShapePassed;
    if (Array.isArray(eligibility.adultOpenLibrarySparseExceptionArtifactReasons) && eligibility.adultOpenLibrarySparseExceptionArtifactReasons.length > 0) adultOpenLibrarySparseExceptionArtifactReasonsbyTitle[candidate.title] = eligibility.adultOpenLibrarySparseExceptionArtifactReasons;
    if (typeof eligibility.adultOpenLibrarySparseExceptionArtifactPassed === "boolean") adultOpenLibrarySparseExceptionArtifactPassedByTitle[candidate.title] = eligibility.adultOpenLibrarySparseExceptionArtifactPassed;
    if (Array.isArray(eligibility.adultOpenLibrarySparseExceptionFailedConditions) && eligibility.adultOpenLibrarySparseExceptionFailedConditions.length > 0) adultOpenLibrarySparseExceptionFailedConditionsByTitle[candidate.title] = eligibility.adultOpenLibrarySparseExceptionFailedConditions;
    if (eligibility.collectionShapeTrigger) adultOpenLibraryCollectionShapeTriggerByTitle[candidate.title] = eligibility.collectionShapeTrigger;
    if (eligibility.collectionShapeTriggerField) adultOpenLibraryCollectionShapeTriggerFieldByTitle[candidate.title] = eligibility.collectionShapeTriggerField;
    adultOpenLibraryCollectionShapeCorroborationByTitle[candidate.title] = eligibility.collectionShapeCorroboration;
    adultOpenLibraryPuzzleGameShapeReasons[candidate.title] = eligibility.puzzleGameShapeReasons;
    adultOpenLibraryInstructionalShapeReasons[candidate.title] = eligibility.nonNarrativeShapeReasons.filter((reason) => reason === "adult_openlibrary_instructional_writing_artifact");
    adultOpenLibraryNonNarrativeShapeReasons[candidate.title] = eligibility.nonNarrativeShapeReasons;
    adultOpenLibraryEligibilityAllowedByTitle[candidate.title] = eligibility.allowed;
    adultOpenLibraryEligibilityReasonByTitle[candidate.title] = eligibility.allowed
      ? eligibility.allowedReason || (selectedTitles.has(normalized(candidate.title)) ? "selected_clean_adult_openlibrary_candidate" : "eligible_not_selected")
      : eligibility.reason || "adult_openlibrary_no_meaningful_metadata_taste";
    finalScoreComponentsByTitle[candidate.title] = {
      ...breakdown,
      positiveTasteScore,
      sourceQualityScore: Number(candidate.diagnostics?.sourceQualityScore || breakdown.sourceQualityRelevance || 0),
      queryRungBonus: Number(candidate.diagnostics?.queryRungBonus || breakdown.queryRungBonus || 0),
      finalScore: candidate.score,
      adultOpenLibraryFinalEligible: eligibility.allowed ? 1 : 0,
      adultOpenLibraryContentSignalCount: eligibility.contentSignals.length,
      adultOpenLibraryLikedContentFamilyCount: eligibility.likedContentFamilies.length,
      adultOpenLibraryContextOnlySignalCount: eligibility.contextOnlySignals.length,
      adultOpenLibraryDislikeOverlapRatio: Math.round(eligibility.dislikeOverlapRatio * 1000) / 1000,
      adultOpenLibraryFamilyDislikeOverlapRatio: Math.round(eligibility.familyDislikeOverlapRatio * 1000) / 1000,
      adultOpenLibraryPositiveNetFamilyCount: eligibility.positiveNetFamilies.length,
      adultOpenLibraryNonPositiveNetFamilyCount: eligibility.nonPositiveNetFamilies.length,
      adultOpenLibraryStrongAdultFitSignalCount: eligibility.strongAdultFitSignals.length,
      adultOpenLibraryNarrativeFictionShape: eligibility.narrativeFictionShape ? 1 : 0,
      adultOpenLibrarySparseNarrativeShapeApplied: eligibility.sparseNarrativeShapeApplied ? 1 : 0,
      adultOpenLibrarySparseSingleFamilyExceptionConsidered: eligibility.sparseSingleFamilyExceptionConsidered ? 1 : 0,
      adultOpenLibrarySparseSingleFamilyExceptionAllowed: eligibility.sparseSingleFamilyExceptionAllowed ? 1 : 0,
      adultOpenLibrarySparseExceptionYouthAudienceBlocked: eligibility.sparseExceptionYouthAudienceBlocked ? 1 : 0,
      adultOpenLibraryNonNarrativeShapeCount: eligibility.nonNarrativeShapeReasons.length,
    };
    finalRankingReasonByTitle[candidate.title] = selectedTitles.has(normalized(candidate.title))
      ? "selected_adult_openlibrary_candidate"
      : candidate.rejectedReasons.join(",") || "ranked_below_final_selection";
    candidate.diagnostics.adultOpenLibraryFinalEligibilityAllowed = eligibility.allowed;
    candidate.diagnostics.adultOpenLibraryFinalEligibilityReason = adultOpenLibraryEligibilityReasonByTitle[candidate.title];
    candidate.diagnostics.adultOpenLibraryNonTitleTasteSignals = eligibility.nonTitleSignals;
    candidate.diagnostics.adultOpenLibraryRawContentSignals = eligibility.rawContentSignals;
    candidate.diagnostics.adultOpenLibraryContentSignals = eligibility.contentSignals;
    candidate.diagnostics.adultOpenLibraryContextOnlySignals = eligibility.contextOnlySignals;
    candidate.diagnostics.adultOpenLibrarySupplementalSignals = eligibility.supplementalSignals;
    candidate.diagnostics.adultOpenLibraryLikedContentFamilies = eligibility.likedContentFamilies;
    candidate.diagnostics.adultOpenLibraryDislikedContentFamilies = eligibility.dislikedContentFamilies;
    candidate.diagnostics.adultOpenLibraryOverlappingDislikedContentSignals = eligibility.overlappingDislikedContentSignals;
    candidate.diagnostics.adultOpenLibraryNonOverlappingLikedContentSignals = eligibility.nonOverlappingLikedContentSignals;
    candidate.diagnostics.adultOpenLibraryOverlappingDislikedFamilies = eligibility.overlappingDislikedFamilies;
    candidate.diagnostics.adultOpenLibraryNonOverlappingLikedFamilies = eligibility.nonOverlappingLikedFamilies;
    candidate.diagnostics.adultOpenLibraryDislikeOverlapRatio = eligibility.dislikeOverlapRatio;
    candidate.diagnostics.adultOpenLibraryFamilyDislikeOverlapRatio = eligibility.familyDislikeOverlapRatio;
    candidate.diagnostics.adultOpenLibraryLikedFamilyWeightByFamily = eligibility.likedFamilyWeightByFamily;
    candidate.diagnostics.adultOpenLibraryDislikedFamilyWeightByFamily = eligibility.dislikedFamilyWeightByFamily;
    candidate.diagnostics.adultOpenLibraryNetFamilyWeightByFamily = eligibility.netFamilyWeightByFamily;
    candidate.diagnostics.adultOpenLibraryLikedItemCountByFamily = eligibility.likedItemCountByFamily;
    candidate.diagnostics.adultOpenLibraryDislikedItemCountByFamily = eligibility.dislikedItemCountByFamily;
    candidate.diagnostics.adultOpenLibraryPositiveNetFamilies = eligibility.positiveNetFamilies;
    candidate.diagnostics.adultOpenLibraryNonPositiveNetFamilies = eligibility.nonPositiveNetFamilies;
    candidate.diagnostics.adultOpenLibraryFamilySupportFieldsByFamily = eligibility.familySupportFieldsByFamily;
    candidate.diagnostics.adultOpenLibraryFamilySupportEvidenceGroupsByFamily = eligibility.familySupportEvidenceGroupsByFamily;
    candidate.diagnostics.adultOpenLibraryStrongAdultFitSignals = eligibility.strongAdultFitSignals;
    candidate.diagnostics.adultOpenLibraryInstructionalShapeReasons = adultOpenLibraryInstructionalShapeReasons[candidate.title];
    candidate.diagnostics.adultOpenLibraryNarrativeFictionShape = eligibility.narrativeFictionShape;
    candidate.diagnostics.adultOpenLibraryNarrativeShapeEvidence = eligibility.narrativeShapeEvidence;
    candidate.diagnostics.adultOpenLibrarySparseNarrativeShapeApplied = eligibility.sparseNarrativeShapeApplied;
    candidate.diagnostics.adultOpenLibrarySparseNarrativeShapeReason = eligibility.sparseNarrativeShapeReason;
    candidate.diagnostics.adultOpenLibrarySparseSingleFamilyExceptionConsidered = eligibility.sparseSingleFamilyExceptionConsidered;
    candidate.diagnostics.adultOpenLibrarySparseSingleFamilyExceptionAllowed = eligibility.sparseSingleFamilyExceptionAllowed;
    candidate.diagnostics.adultOpenLibrarySparseSingleFamilyExceptionReason = eligibility.sparseSingleFamilyExceptionReason;
    candidate.diagnostics.adultOpenLibraryCredibleNarrativeGenreSubjectSignals = eligibility.credibleNarrativeGenreSubjectSignals;
    candidate.diagnostics.adultOpenLibrarySparseSingleFamilyBibliographicIdentity = eligibility.sparseSingleFamilyBibliographicIdentity;
    candidate.diagnostics.adultOpenLibrarySparseSingleFamilyLikedItemCount = eligibility.sparseSingleFamilyLikedItemCount;
    candidate.diagnostics.adultOpenLibrarySparseSingleFamilyNetWeight = eligibility.sparseSingleFamilyNetWeight;
    candidate.diagnostics.adultOpenLibrarySparseExceptionPositiveNetFamily = eligibility.sparseExceptionPositiveNetFamily;
    candidate.diagnostics.adultOpenLibrarySparseExceptionIgnoredNonPositiveFamilies = eligibility.sparseExceptionIgnoredNonPositiveFamilies;
    candidate.diagnostics.adultOpenLibrarySparseExceptionYouthAudienceSignals = eligibility.sparseExceptionYouthAudienceSignals;
    candidate.diagnostics.adultOpenLibrarySparseExceptionYouthAudienceBlocked = eligibility.sparseExceptionYouthAudienceBlocked;
    if (typeof eligibility.adultOpenLibrarySparseExceptionSupportEvidenceGroups !== "undefined") candidate.diagnostics.adultOpenLibrarySparseExceptionSupportEvidenceGroups = eligibility.adultOpenLibrarySparseExceptionSupportEvidenceGroups;
    if (typeof eligibility.adultOpenLibrarySparseExceptionDislikedItemCount === "number") candidate.diagnostics.adultOpenLibrarySparseExceptionDislikedItemCount = eligibility.adultOpenLibrarySparseExceptionDislikedItemCount;
    if (typeof eligibility.adultOpenLibrarySparseExceptionLikedWeight === "number") candidate.diagnostics.adultOpenLibrarySparseExceptionLikedWeight = eligibility.adultOpenLibrarySparseExceptionLikedWeight;
    if (typeof eligibility.adultOpenLibrarySparseExceptionDislikedWeight === "number") candidate.diagnostics.adultOpenLibrarySparseExceptionDislikedWeight = eligibility.adultOpenLibrarySparseExceptionDislikedWeight;
    if (typeof eligibility.adultOpenLibrarySparseExceptionProfileSupportPassed === "boolean") candidate.diagnostics.adultOpenLibrarySparseExceptionProfileSupportPassed = eligibility.adultOpenLibrarySparseExceptionProfileSupportPassed;
    if (typeof eligibility.adultOpenLibrarySparseExceptionCredibleSubjectPassed === "boolean") candidate.diagnostics.adultOpenLibrarySparseExceptionCredibleSubjectPassed = eligibility.adultOpenLibrarySparseExceptionCredibleSubjectPassed;
    if (typeof eligibility.adultOpenLibrarySparseExceptionBibliographicIdentityPassed === "boolean") candidate.diagnostics.adultOpenLibrarySparseExceptionBibliographicIdentityPassed = eligibility.adultOpenLibrarySparseExceptionBibliographicIdentityPassed;
    if (typeof eligibility.adultOpenLibrarySparseExceptionSourceQualityScore === "number") candidate.diagnostics.adultOpenLibrarySparseExceptionSourceQualityScore = eligibility.adultOpenLibrarySparseExceptionSourceQualityScore;
    if (typeof eligibility.adultOpenLibrarySparseExceptionSourceQualityPassed === "boolean") candidate.diagnostics.adultOpenLibrarySparseExceptionSourceQualityPassed = eligibility.adultOpenLibrarySparseExceptionSourceQualityPassed;
    if (typeof eligibility.adultOpenLibrarySparseExceptionAgeSuitability === "number") candidate.diagnostics.adultOpenLibrarySparseExceptionAgeSuitability = eligibility.adultOpenLibrarySparseExceptionAgeSuitability;
    if (typeof eligibility.adultOpenLibrarySparseExceptionAgeSuitabilityPassed === "boolean") candidate.diagnostics.adultOpenLibrarySparseExceptionAgeSuitabilityPassed = eligibility.adultOpenLibrarySparseExceptionAgeSuitabilityPassed;
    if (typeof eligibility.adultOpenLibrarySparseExceptionYouthAudiencePassed === "boolean") candidate.diagnostics.adultOpenLibrarySparseExceptionYouthAudiencePassed = eligibility.adultOpenLibrarySparseExceptionYouthAudiencePassed;
    if (typeof eligibility.adultOpenLibrarySparseExceptionNarrativeShape === "boolean") candidate.diagnostics.adultOpenLibrarySparseExceptionNarrativeShape = eligibility.adultOpenLibrarySparseExceptionNarrativeShape;
    if (typeof eligibility.adultOpenLibrarySparseExceptionNarrativeShapePassed === "boolean") candidate.diagnostics.adultOpenLibrarySparseExceptionNarrativeShapePassed = eligibility.adultOpenLibrarySparseExceptionNarrativeShapePassed;
    if (Array.isArray(eligibility.adultOpenLibrarySparseExceptionArtifactReasons)) candidate.diagnostics.adultOpenLibrarySparseExceptionArtifactReasons = eligibility.adultOpenLibrarySparseExceptionArtifactReasons;
    if (typeof eligibility.adultOpenLibrarySparseExceptionArtifactPassed === "boolean") candidate.diagnostics.adultOpenLibrarySparseExceptionArtifactPassed = eligibility.adultOpenLibrarySparseExceptionArtifactPassed;
    if (Array.isArray(eligibility.adultOpenLibrarySparseExceptionFailedConditions)) candidate.diagnostics.adultOpenLibrarySparseExceptionFailedConditions = eligibility.adultOpenLibrarySparseExceptionFailedConditions;
    candidate.diagnostics.adultOpenLibraryCollectionShapeTrigger = eligibility.collectionShapeTrigger;
    candidate.diagnostics.adultOpenLibraryCollectionShapeTriggerField = eligibility.collectionShapeTriggerField;
    candidate.diagnostics.adultOpenLibraryCollectionShapeCorroboration = eligibility.collectionShapeCorroboration;
    candidate.diagnostics.adultOpenLibraryPuzzleGameShapeReasons = eligibility.puzzleGameShapeReasons;
    candidate.diagnostics.adultOpenLibraryNonNarrativeShapeReasons = eligibility.nonNarrativeShapeReasons;
    if (eligibility.allowed) meaningfulTasteEligibleTitles.push(candidate.title);
    else {
      const reason = eligibility.reason || "adult_openlibrary_no_meaningful_metadata_taste";
      finalEligibilityRejectedTitlesByReason[reason] = [...(finalEligibilityRejectedTitlesByReason[reason] || []), candidate.title];
    }
    if (eligibility.allowed && selectedTitles.has(normalized(candidate.title))) finalEligibilityAcceptedTitles.push(candidate.title);
  }
  diagnostics.candidateTasteMatchScoreByTitle = candidateTasteMatchScoreByTitle;
  diagnostics.candidateTastePenaltyByTitle = candidateTastePenaltyByTitle;
  diagnostics.candidateMatchedLikedSignalsByTitle = candidateMatchedLikedSignalsByTitle;
  diagnostics.candidateMatchedDislikedSignalsByTitle = candidateMatchedDislikedSignalsByTitle;
  diagnostics.metadataBackedLikedSignalsByTitle = metadataBackedLikedSignalsByTitle;
  diagnostics.metadataBackedDislikedSignalsByTitle = metadataBackedDislikedSignalsByTitle;
  diagnostics.positiveTasteScoreByTitle = positiveTasteScoreByTitle;
  diagnostics.documentBackedTasteSignalsByTitle = documentBackedTasteSignalsByTitle;
  diagnostics.adultOpenLibraryRawContentSignals = adultOpenLibraryRawContentSignals;
  diagnostics.adultOpenLibraryContentSignals = adultOpenLibraryContentSignals;
  diagnostics.adultOpenLibraryContextOnlySignals = adultOpenLibraryContextOnlySignals;
  diagnostics.adultOpenLibrarySupplementalSignals = adultOpenLibrarySupplementalSignals;
  diagnostics.adultOpenLibraryNonTitleLikedSignalsByTitle = adultOpenLibraryNonTitleLikedSignalsByTitle;
  diagnostics.adultOpenLibraryNonTitleDislikedSignalsByTitle = adultOpenLibraryNonTitleDislikedSignalsByTitle;
  diagnostics.adultOpenLibraryLikedContentFamilies = adultOpenLibraryLikedContentFamilies;
  diagnostics.adultOpenLibraryDislikedContentFamilies = adultOpenLibraryDislikedContentFamilies;
  diagnostics.adultOpenLibraryOverlappingDislikedContentSignals = adultOpenLibraryOverlappingDislikedContentSignals;
  diagnostics.adultOpenLibraryNonOverlappingLikedContentSignals = adultOpenLibraryNonOverlappingLikedContentSignals;
  diagnostics.adultOpenLibraryOverlappingDislikedFamilies = adultOpenLibraryOverlappingDislikedFamilies;
  diagnostics.adultOpenLibraryNonOverlappingLikedFamilies = adultOpenLibraryNonOverlappingLikedFamilies;
  diagnostics.adultOpenLibraryDislikeOverlapRatio = adultOpenLibraryDislikeOverlapRatio;
  diagnostics.adultOpenLibraryFamilyDislikeOverlapRatio = adultOpenLibraryFamilyDislikeOverlapRatio;
  diagnostics.adultOpenLibraryLikedFamilyWeightByFamily = adultOpenLibraryLikedFamilyWeightByFamily;
  diagnostics.adultOpenLibraryDislikedFamilyWeightByFamily = adultOpenLibraryDislikedFamilyWeightByFamily;
  diagnostics.adultOpenLibraryNetFamilyWeightByFamily = adultOpenLibraryNetFamilyWeightByFamily;
  diagnostics.adultOpenLibraryLikedItemCountByFamily = adultOpenLibraryLikedItemCountByFamily;
  diagnostics.adultOpenLibraryDislikedItemCountByFamily = adultOpenLibraryDislikedItemCountByFamily;
  diagnostics.adultOpenLibraryPositiveNetFamilies = adultOpenLibraryPositiveNetFamilies;
  diagnostics.adultOpenLibraryNonPositiveNetFamilies = adultOpenLibraryNonPositiveNetFamilies;
  diagnostics.adultOpenLibraryFamilySupportFieldsByFamily = adultOpenLibraryFamilySupportFieldsByFamily;
  diagnostics.adultOpenLibraryFamilySupportEvidenceGroupsByFamily = adultOpenLibraryFamilySupportEvidenceGroupsByFamily;
  diagnostics.adultOpenLibraryStrongAdultFitSignals = adultOpenLibraryStrongAdultFitSignals;
  diagnostics.adultOpenLibraryNarrativeShapeEvidence = adultOpenLibraryNarrativeShapeEvidence;
  diagnostics.adultOpenLibrarySparseNarrativeShapeApplied = adultOpenLibrarySparseNarrativeShapeApplied;
  diagnostics.adultOpenLibrarySparseNarrativeShapeReason = adultOpenLibrarySparseNarrativeShapeReason;
  diagnostics.adultOpenLibrarySparseSingleFamilyExceptionConsideredByTitle = adultOpenLibrarySparseSingleFamilyExceptionConsideredByTitle;
  diagnostics.adultOpenLibrarySparseSingleFamilyExceptionAllowedByTitle = adultOpenLibrarySparseSingleFamilyExceptionAllowedByTitle;
  diagnostics.adultOpenLibrarySparseSingleFamilyExceptionReasonByTitle = adultOpenLibrarySparseSingleFamilyExceptionReasonByTitle;
  diagnostics.adultOpenLibraryCredibleNarrativeGenreSubjectSignalsByTitle = adultOpenLibraryCredibleNarrativeGenreSubjectSignalsByTitle;
  diagnostics.adultOpenLibrarySparseSingleFamilyBibliographicIdentityByTitle = adultOpenLibrarySparseSingleFamilyBibliographicIdentityByTitle;
  diagnostics.adultOpenLibrarySparseSingleFamilyLikedItemCountByTitle = adultOpenLibrarySparseSingleFamilyLikedItemCountByTitle;
  diagnostics.adultOpenLibrarySparseSingleFamilyNetWeightByTitle = adultOpenLibrarySparseSingleFamilyNetWeightByTitle;
  diagnostics.adultOpenLibrarySparseExceptionPositiveNetFamilyByTitle = adultOpenLibrarySparseExceptionPositiveNetFamilyByTitle;
  diagnostics.adultOpenLibrarySparseExceptionIgnoredNonPositiveFamiliesByTitle = adultOpenLibrarySparseExceptionIgnoredNonPositiveFamiliesByTitle;
  diagnostics.adultOpenLibrarySparseExceptionYouthAudienceSignalsByTitle = adultOpenLibrarySparseExceptionYouthAudienceSignalsByTitle;
  diagnostics.adultOpenLibrarySparseExceptionYouthAudienceBlockedByTitle = adultOpenLibrarySparseExceptionYouthAudienceBlockedByTitle;
  diagnostics.adultOpenLibrarySparseExceptionSupportEvidenceGroupsByTitle = adultOpenLibrarySparseExceptionSupportEvidenceGroupsByTitle;
  diagnostics.adultOpenLibrarySparseExceptionDislikedItemCountByTitle = adultOpenLibrarySparseExceptionDislikedItemCountByTitle;
  diagnostics.adultOpenLibrarySparseExceptionLikedWeightByTitle = adultOpenLibrarySparseExceptionLikedWeightByTitle;
  diagnostics.adultOpenLibrarySparseExceptionDislikedWeightByTitle = adultOpenLibrarySparseExceptionDislikedWeightByTitle;
  diagnostics.adultOpenLibrarySparseExceptionProfileSupportPassedByTitle = adultOpenLibrarySparseExceptionProfileSupportPassedByTitle;
  diagnostics.adultOpenLibrarySparseExceptionCredibleSubjectPassedByTitle = adultOpenLibrarySparseExceptionCredibleSubjectPassedByTitle;
  diagnostics.adultOpenLibrarySparseExceptionBibliographicIdentityPassedByTitle = adultOpenLibrarySparseExceptionBibliographicIdentityPassedByTitle;
  diagnostics.adultOpenLibrarySparseExceptionSourceQualityScoreByTitle = adultOpenLibrarySparseExceptionSourceQualityScoreByTitle;
  diagnostics.adultOpenLibrarySparseExceptionSourceQualityPassedByTitle = adultOpenLibrarySparseExceptionSourceQualityPassedByTitle;
  diagnostics.adultOpenLibrarySparseExceptionAgeSuitabilityByTitle = adultOpenLibrarySparseExceptionAgeSuitabilityByTitle;
  diagnostics.adultOpenLibrarySparseExceptionAgeSuitabilityPassedByTitle = adultOpenLibrarySparseExceptionAgeSuitabilityPassedByTitle;
  diagnostics.adultOpenLibrarySparseExceptionYouthAudiencePassedByTitle = adultOpenLibrarySparseExceptionYouthAudiencePassedByTitle;
  diagnostics.adultOpenLibrarySparseExceptionNarrativeShapeByTitle = adultOpenLibrarySparseExceptionNarrativeShapeByTitle;
  diagnostics.adultOpenLibrarySparseExceptionNarrativeShapePassedByTitle = adultOpenLibrarySparseExceptionNarrativeShapePassedByTitle;
  diagnostics.adultOpenLibrarySparseExceptionArtifactReasonsbyTitle = adultOpenLibrarySparseExceptionArtifactReasonsbyTitle;
  diagnostics.adultOpenLibrarySparseExceptionArtifactPassedByTitle = adultOpenLibrarySparseExceptionArtifactPassedByTitle;
  diagnostics.adultOpenLibrarySparseExceptionFailedConditionsByTitle = adultOpenLibrarySparseExceptionFailedConditionsByTitle;
  diagnostics.adultOpenLibraryCollectionShapeTriggerByTitle = adultOpenLibraryCollectionShapeTriggerByTitle;
  diagnostics.adultOpenLibraryCollectionShapeTriggerFieldByTitle = adultOpenLibraryCollectionShapeTriggerFieldByTitle;
  diagnostics.adultOpenLibraryCollectionShapeCorroborationByTitle = adultOpenLibraryCollectionShapeCorroborationByTitle;
  diagnostics.adultOpenLibraryPuzzleGameShapeReasons = adultOpenLibraryPuzzleGameShapeReasons;
  diagnostics.adultOpenLibraryInstructionalShapeReasons = adultOpenLibraryInstructionalShapeReasons;
  diagnostics.adultOpenLibraryNonNarrativeShapeReasons = adultOpenLibraryNonNarrativeShapeReasons;
  diagnostics.adultOpenLibraryEligibilityAllowedByTitle = adultOpenLibraryEligibilityAllowedByTitle;
  diagnostics.adultOpenLibraryEligibilityReasonByTitle = adultOpenLibraryEligibilityReasonByTitle;
  diagnostics.meaningfulTasteEligibleTitles = meaningfulTasteEligibleTitles;
  diagnostics.finalEligibilityAcceptedTitles = finalEligibilityAcceptedTitles;
  diagnostics.finalEligibilityRejectedTitlesByReason = finalEligibilityRejectedTitlesByReason;
  diagnostics.finalEligibilityCleanCandidateCount = finalEligibilityAcceptedTitles.length;
  diagnostics.finalScoreComponentsByTitle = finalScoreComponentsByTitle;
  diagnostics.finalRankingReasonByTitle = finalRankingReasonByTitle;
  diagnostics.finalEligibilityGateApplied = true;
  diagnostics.selectionFinalEligibilityGateApplied = true;
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
    Array.isArray(raw?.subject_key) ? raw.subject_key.join(" ") : raw?.subject_key,
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
  if (canUseRecoveryEvidencePattern && /\bfamily\b/.test(sourceQueryText) && /\badventure\b/.test(sourceQueryText)) return /\b(family|families|parents?|siblings?|home|superhero|super hero|heroes|hero|powers?|adventure|quest|journey|wild)\b/;
  if (canUseRecoveryEvidencePattern && /\b(ocean|sea|island)\b/.test(sourceQueryText) && /\b(friendship|friends?|adventure|fantasy)\b/.test(sourceQueryText)) return /\b(ocean|sea|island|marine|friendship|friends?|adventure|quest|fantasy|magic|magical)\b/;
  if (canUseRecoveryEvidencePattern && /\b(survival|survive|wilderness|forest|stranded)\b/.test(sourceQueryText) && /\b(adventure|friendship|fiction)\b/.test(sourceQueryText)) return /\b(survival|survive|survives|wilderness|wild|forest|island|stranded|adventure|quest|team|friendship|friends?)\b/;
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
    ["subjects", normalized([Array.isArray(raw?.subject) ? raw.subject.join(" ") : raw?.subject, Array.isArray(raw?.subjects) ? raw.subjects.join(" ") : raw?.subjects, Array.isArray(raw?.subject_facet) ? raw.subject_facet.join(" ") : raw?.subject_facet, Array.isArray(raw?.subject_key) ? raw.subject_key.join(" ") : raw?.subject_key].filter(Boolean).join(" "))],
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
  if (isMiddleGradesCleanExpansionCandidate(candidate)
    && !candidate.rejectedReasons.includes("middle_grades_query_only_score_cap_applied")
    && middleGradesFictionAgeEvidence(candidate)
    && middleGradesDocumentBackedTasteSignals(candidate).some((signal) => signal !== "adventure")
    && candidate.score >= 0) {
    return {
      allowed: true,
      evidence: ["clean_expansion_document_backed_taste_signal", "middle_grade_fiction_metadata", ...middleGradesDocumentBackedTasteSignals(candidate).map((signal) => `document_taste:${signal}`)],
    };
  }
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

function compareForInitialSelection(a: ScoredCandidate, b: ScoredCandidate, profile: TasteProfile): number {
  if (profile.ageBand === "kids") {
    return compareKidsFinalSelectionCandidates(a, b, profile);
  }
  if (profile.ageBand !== "preteens") return b.score - a.score;
  if (a.diagnostics?.meaningfulTasteRecovery || b.diagnostics?.meaningfulTasteRecovery
    || a.diagnostics?.scoringHandoffStage === "meaningful_taste_recovery"
    || b.diagnostics?.scoringHandoffStage === "meaningful_taste_recovery") {
    return b.score - a.score;
  }
  if (isMiddleGradesContemporarySchoolCandidate(a) || isMiddleGradesContemporarySchoolCandidate(b)
    || isMiddleGradesFantasyHumorCandidate(a) || isMiddleGradesFantasyHumorCandidate(b)
    || isMiddleGradesHumorDefaultQueryFamily(a) || isMiddleGradesHumorDefaultQueryFamily(b)) {
    return b.score - a.score;
  }
  return middleGradesSelectionScore(b, profile) - middleGradesSelectionScore(a, profile)
    || middleGradesEvidenceTierRank(middleGradesRouteAlignmentEvidence(b).tier) - middleGradesEvidenceTierRank(middleGradesRouteAlignmentEvidence(a).tier)
    || middleGradesTasteAlignment(b) - middleGradesTasteAlignment(a)
    || b.score - a.score
    || a.title.localeCompare(b.title);
}

type AdultGoogleBooksNarrativeStrengthResult = {
  score: number;
  components: Record<string, number>;
  evidence: Record<string, string[]>;
};

function adultGoogleBooksRawDescription(candidate: ScoredCandidate): string {
  const raw = (candidate.raw || {}) as Record<string, unknown>;
  const volumeInfo = raw.volumeInfo && typeof raw.volumeInfo === "object" ? raw.volumeInfo as Record<string, unknown> : {};
  return String(candidate.description || volumeInfo.description || "").trim();
}

function adultGoogleBooksNarrativeStrengthAdd(
  components: Record<string, number>,
  evidence: Record<string, string[]>,
  key: string,
  value: number,
  reason: string,
): void {
  if (value <= 0) return;
  components[key] = adultOpenLibraryRoundWeight(Number(components[key] || 0) + value);
  evidence[key] = Array.from(new Set([...(evidence[key] || []), reason]));
}

export function adultGoogleBooksNarrativeStrength(candidate: ScoredCandidate): AdultGoogleBooksNarrativeStrengthResult {
  if (candidate.source !== "googleBooks") return { score: 0, components: {}, evidence: {} };
  const fields = adultGoogleBooksMetadataFields(candidate);
  const descriptionRaw = adultGoogleBooksRawDescription(candidate);
  const description = normalized(descriptionRaw);
  const combined = normalized([
    fields.title,
    fields.subtitle,
    fields.description,
    fields.categories,
    fields.genres,
  ].filter(Boolean).join(" "));
  const components: Record<string, number> = {};
  const evidence: Record<string, string[]> = {};
  const words = description.split(/\s+/).filter(Boolean).length;
  const sentenceCount = descriptionRaw.split(/[.!?]+/).map((part) => part.trim()).filter(Boolean).length;

  if (words >= 180) adultGoogleBooksNarrativeStrengthAdd(components, evidence, "synopsisRichness", 0.8, `description_words:${words}`);
  else if (words >= 110) adultGoogleBooksNarrativeStrengthAdd(components, evidence, "synopsisRichness", 0.55, `description_words:${words}`);
  else if (words >= 60) adultGoogleBooksNarrativeStrengthAdd(components, evidence, "synopsisRichness", 0.3, `description_words:${words}`);
  if (sentenceCount >= 3) adultGoogleBooksNarrativeStrengthAdd(components, evidence, "synopsisStructure", 0.25, `description_sentences:${sentenceCount}`);

  const namedCharacterMatches = descriptionRaw.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\b/g) || [];
  const namedCharacterCount = Array.from(new Set(namedCharacterMatches.filter((name) =>
    !/\b(?:The|This|When|After|Before|But|And|For|From|With|In|On|A|An)\b/.test(name),
  ))).length;
  if (namedCharacterCount > 0) adultGoogleBooksNarrativeStrengthAdd(components, evidence, "identifiableProtagonist", 0.45, `named_character_count:${Math.min(namedCharacterCount, 4)}`);
  if (/\b(?:protagonist|hero(?:ine)?|detective|investigator|journalist|agent|soldier|witch|prince|princess|king|queen|sister|brother|mother|father|family)\b/.test(description)) {
    adultGoogleBooksNarrativeStrengthAdd(components, evidence, "identifiableProtagonist", 0.35, "role_or_relationship_character_anchor");
  }

  if (/\b(?:must|forced to|has to|discovers?|uncovers?|investigates?|confronts?|faces?|hunts?|pursues?|flees?|survives?|save|stop|prevent|protect|escape)\b/.test(description)) {
    adultGoogleBooksNarrativeStrengthAdd(components, evidence, "conflictSpecificity", 0.5, "active_conflict_or_goal_language");
  }
  if (/\b(?:murder|killer|crime|conspiracy|betrayal|secret|threat|danger|war|curse|trial|revenge|disappearance|body|death|attack)\b/.test(description)) {
    adultGoogleBooksNarrativeStrengthAdd(components, evidence, "conflictSpecificity", 0.45, "specific_conflict_terms");
  }

  if (/\b(?:in|on|across|beneath|inside)\s+(?:a|an|the)\s+(?:small town|city|village|kingdom|empire|planet|ship|island|coast|mountains?|forest|school|academy|estate|house|castle|colony|future|past)\b/.test(description)) {
    adultGoogleBooksNarrativeStrengthAdd(components, evidence, "settingSpecificity", 0.45, "anchored_setting_phrase");
  }
  if (/\b(?:kingdom|empire|realm|magic|magical|witch|dragon|gods?|mythology|space|planet|alien|future|dystopian|post-apocalyptic|colony|starship|cyberpunk)\b/.test(combined)) {
    adultGoogleBooksNarrativeStrengthAdd(components, evidence, "fantasyScienceFictionWorldbuilding", 0.4, "speculative_worldbuilding_metadata");
  }

  if (/\b(?:grief|love|family|betrayal|identity|guilt|trauma|redemption|loyalty|friendship|loss|survival|protect(?:s|ing)?|sacrifice)\b/.test(description)) {
    adultGoogleBooksNarrativeStrengthAdd(components, evidence, "emotionalStakes", 0.35, "emotional_or_relationship_stakes");
  }
  if (/\b(?:mystery|thriller|suspense|detective|investigation|case|clue|twist|secrets?|killer|murder)\b/.test(combined)) {
    adultGoogleBooksNarrativeStrengthAdd(components, evidence, "mysteryThrillerTension", 0.35, "mystery_thriller_tension_metadata");
  }
  if (/\b(?:horror|haunt(?:ed|ing)?|ghosts?|monsters?|terror|nightmare|evil|darkness|spooky|blood|curse)\b/.test(combined)) {
    adultGoogleBooksNarrativeStrengthAdd(components, evidence, "horrorAtmosphere", 0.3, "horror_atmosphere_metadata");
  }
  if (/\b(?:adventure|quest|journey|expedition|battle|chase|rescue|escape|survival|dangerous|race against time)\b/.test(combined)) {
    adultGoogleBooksNarrativeStrengthAdd(components, evidence, "adventureIntensity", 0.3, "adventure_or_survival_intensity");
  }
  if (/\b(?:historical|century|war|victorian|regency|medieval|ancient|roman|world war|civil war|period)\b/.test(combined)) {
    adultGoogleBooksNarrativeStrengthAdd(components, evidence, "historicalSpecificity", 0.25, "historical_or_period_specificity");
  }

  const rawScore = Object.values(components).reduce((sum, value) => sum + Number(value || 0), 0);
  const score = adultOpenLibraryRoundWeight(Math.min(2.5, rawScore));
  return { score, components, evidence };
}

function adultGoogleBooksNarrativeStrengthAdjustedSelectionScore(candidate: ScoredCandidate): number {
  return adultOpenLibraryRoundWeight(Number(candidate.score || 0) + Number(candidate.diagnostics?.adultGoogleBooksNarrativeStrengthScore || 0));
}

function adultGoogleBooksApplyNarrativeStrengthRanking(rankedCandidates: ScoredCandidate[], profile: TasteProfile): ScoredCandidate[] {
  if (profile.ageBand !== "adult" || !rankedCandidates.some((candidate) => candidate.source === "googleBooks")) return rankedCandidates;
  const baseRankByCandidate = new Map<ScoredCandidate, number>();
  rankedCandidates.forEach((candidate, index) => baseRankByCandidate.set(candidate, index + 1));
  const eligibleGoogleBooks = rankedCandidates.filter((candidate) => {
    if (candidate.source !== "googleBooks") return false;
    const strength = adultGoogleBooksNarrativeStrength(candidate);
    candidate.diagnostics.adultGoogleBooksNarrativeStrengthScore = strength.score;
    candidate.diagnostics.adultGoogleBooksNarrativeStrengthComponents = strength.components;
    candidate.diagnostics.adultGoogleBooksNarrativeStrengthEvidence = strength.evidence;
    candidate.diagnostics.adultGoogleBooksNarrativeStrengthBaseScore = adultOpenLibraryRoundWeight(Number(candidate.score || 0));
    candidate.diagnostics.adultGoogleBooksNarrativeStrengthRankBefore = baseRankByCandidate.get(candidate) || 0;
    const eligible = !rejectReason(candidate, profile);
    candidate.diagnostics.adultGoogleBooksNarrativeStrengthApplied = eligible;
    candidate.diagnostics.adultGoogleBooksNarrativeStrengthSelectionScore = eligible
      ? adultGoogleBooksNarrativeStrengthAdjustedSelectionScore(candidate)
      : adultOpenLibraryRoundWeight(Number(candidate.score || 0));
    return eligible;
  });
  if (eligibleGoogleBooks.length <= 1) {
    rankedCandidates.forEach((candidate, index) => {
      if (candidate.source === "googleBooks") candidate.diagnostics.adultGoogleBooksNarrativeStrengthRankAfter = index + 1;
    });
    return rankedCandidates;
  }

  const eligibleSet = new Set(eligibleGoogleBooks);
  const sortedEligibleGoogleBooks = [...eligibleGoogleBooks].sort((a, b) =>
    adultGoogleBooksNarrativeStrengthAdjustedSelectionScore(b) - adultGoogleBooksNarrativeStrengthAdjustedSelectionScore(a)
    || Number(b.score || 0) - Number(a.score || 0)
    || (baseRankByCandidate.get(a) || 0) - (baseRankByCandidate.get(b) || 0)
    || a.title.localeCompare(b.title),
  );
  const replacementQueue = [...sortedEligibleGoogleBooks];
  const reranked = rankedCandidates.map((candidate) =>
    eligibleSet.has(candidate) ? replacementQueue.shift() || candidate : candidate,
  );
  reranked.forEach((candidate, index) => {
    if (candidate.source !== "googleBooks") return;
    candidate.diagnostics.adultGoogleBooksNarrativeStrengthRankAfter = index + 1;
    candidate.diagnostics.adultGoogleBooksNarrativeStrengthRankDelta = Number(candidate.diagnostics.adultGoogleBooksNarrativeStrengthRankBefore || 0) - (index + 1);
  });
  return reranked;
}

function middleGradesRepresentativeText(candidate: ScoredCandidate): string {
  return normalized([
    candidate.title,
    candidate.subtitle,
    candidate.description,
    (candidate.creators || []).join(" "),
    candidate.diagnostics?.queryText,
    candidate.diagnostics?.queryFamily,
    candidate.diagnostics?.routingReason,
    middleGradesRawText(candidate),
  ].filter(Boolean).join(" "));
}

function isMiddleGradesCanonicalFranchiseTitle(candidate: ScoredCandidate): boolean {
  const title = normalized(candidate.title);
  return /^the hidden oracle$/.test(title)
    || /^the wild robot$/.test(title)
    || /^nevermoor$/.test(title)
    || /^masterminds$/.test(title)
    || /^keeper of the lost cities$/.test(title);
}

function middleGradesRepresentativePenalty(candidate: ScoredCandidate): number {
  if (!isMiddleGradesOpenLibraryCandidate(candidate)) return 0;
  const text = middleGradesRepresentativeText(candidate);
  const titleText = normalized(candidate.title);
  const rawTitle = String(candidate.title || "");
  let penalty = 0;
  if (/\b(companion|guide|guidebook|handbook|manual|confidential|insider|insider s|field guide|survival guide|encyclopedia|facts?|activity|workbook|journal|atlas|almanac|behind the scenes|making of|sampler|preview)\b/.test(text)) penalty += 6;
  if (/\b(complete|collected|collection|collections|treasury|storybook|stories|tales|adventures|omnibus|anthology|library|set|boxed|box)\b/.test(titleText)) penalty += 3;
  if (/\b(movie tie in|tie in|official tie in|video game|game guide)\b/.test(text)) penalty += 1.5;
  const trailingTitleNumber = Number(titleText.match(/\b(\d{1,2})\s*$/)?.[1] || 0);
  if (/#\s*(?:[3-9]|\d{2,})\b/.test(rawTitle)
    || /\b(book|volume|vol)\s*(?:[3-9]|\d{2,})\b/.test(text)
    || trailingTitleNumber >= 3) penalty += 3;
  if (/\b(nightfall|lodestar|neverseen)\b/.test(titleText) && /\b(shannon messenger|keeper|lost cities)\b/.test(text)) penalty += 3;
  if (/\b(book|volume|vol)\s*(1|one)\b/.test(text) || /\bfirst\b[a-z0-9 ]{0,60}\b(series|novel|book|installment)\b/.test(text)) penalty -= 1.5;
  if (isMiddleGradesCanonicalFranchiseTitle(candidate)) penalty -= 2;
  return Math.round(penalty * 1000) / 1000;
}

function middleGradesFranchiseKey(candidate: ScoredCandidate): string {
  if (!isMiddleGradesOpenLibraryCandidate(candidate)) return "";
  const text = middleGradesRepresentativeText(candidate);
  const author = primaryAuthor(candidate);
  if (/\b(rick riordan|percy jackson|camp half blood|half blood|trials of apollo|hidden oracle|heroes of olympus|olympus|greek gods|apollo)\b/.test(`${author} ${text}`)) return "rick_riordan_mythology";
  if (/\bdork diaries\b/.test(text)) return "dork_diaries";
  if (/\bdiary of an 8 bit warrior|8 bit warrior\b/.test(text)) return "diary_of_an_8_bit_warrior";
  if (/\b(keeper of the lost cities|keeper lost cities|lost cities|neverseen|nightfall|lodestar)\b/.test(text)) return "keeper_of_the_lost_cities";
  if (/\bwild robot\b/.test(text)) return "wild robot";
  if (/\bnevermoor|morrigan crow\b/.test(text)) return "nevermoor";
  if (/\bmasterminds\b/.test(text)) return "masterminds";
  if (/\bminecraft\b/.test(text)) return "minecraft";
  return "";
}

function middleGradesRepresentativeSelectionScore(candidate: ScoredCandidate, profile: TasteProfile): number {
  const tierRank = middleGradesEvidenceTierRank(middleGradesRouteAlignmentEvidence(candidate).tier);
  return Math.round((
    middleGradesSelectionScore(candidate, profile)
    + tierRank * 0.8
    + middleGradesTasteAlignment(candidate) * 0.15
    - middleGradesRepresentativePenalty(candidate)
  ) * 1000) / 1000;
}

function compareMiddleGradesRepresentativeCandidates(a: ScoredCandidate, b: ScoredCandidate, profile: TasteProfile): number {
  const franchiseA = middleGradesFranchiseKey(a);
  const franchiseB = middleGradesFranchiseKey(b);
  if (franchiseA && franchiseA === franchiseB) {
    const canonicalDelta = Number(isMiddleGradesCanonicalFranchiseTitle(b)) - Number(isMiddleGradesCanonicalFranchiseTitle(a));
    if (canonicalDelta) return canonicalDelta;
  }
  return middleGradesRepresentativeSelectionScore(b, profile) - middleGradesRepresentativeSelectionScore(a, profile);
}

function middleGradesSameRepresentativeCluster(a: ScoredCandidate, b: ScoredCandidate): boolean {
  const authorA = primaryAuthor(a);
  const authorB = primaryAuthor(b);
  const franchiseA = middleGradesFranchiseKey(a);
  const franchiseB = middleGradesFranchiseKey(b);
  return Boolean((franchiseA && franchiseA === franchiseB) || (authorA && authorA === authorB));
}

function middleGradesWouldConflictAfterRepresentativeSwap(candidate: ScoredCandidate, selected: ScoredCandidate[], replacementIndex: number): boolean {
  const titleKey = normalized(candidate.title);
  const rootKey = finalReturnedRootKey(candidate) || seriesKey(candidate);
  const franchiseKey = middleGradesFranchiseKey(candidate);
  const replacementFranchiseKey = selected[replacementIndex] ? middleGradesFranchiseKey(selected[replacementIndex]) : "";
  return selected.some((other, index) => {
    if (index === replacementIndex) return false;
    if (normalized(other.title) === titleKey) return true;
    const otherRootKey = finalReturnedRootKey(other) || seriesKey(other);
    if (rootKey && otherRootKey && rootKey === otherRootKey) return true;
    const otherFranchiseKey = middleGradesFranchiseKey(other);
    return Boolean(franchiseKey && otherFranchiseKey && franchiseKey === otherFranchiseKey && franchiseKey !== replacementFranchiseKey);
  });
}

function applyMiddleGradesFranchiseRepresentativePreference(rankedCandidates: ScoredCandidate[], selected: ScoredCandidate[], deferred: DeferredCandidate[], rejectedReasons: Record<string, number>, profile: TasteProfile): void {
  if (profile.ageBand !== "preteens" || selected.length === 0) return;
  const seenCandidates = new Set<ScoredCandidate>();
  const candidates = [...deferred.map((row) => row.candidate), ...rankedCandidates]
    .filter((candidate) => {
      if (seenCandidates.has(candidate)) return false;
      seenCandidates.add(candidate);
      return true;
    })
    .filter((candidate) => isMiddleGradesOpenLibraryCandidate(candidate))
    .filter((candidate) => !selected.includes(candidate))
    .filter((candidate) => !rejectReason(candidate, profile))
    .filter((candidate) => middleGradesFinalEligibility(candidate).allowed)
    .sort((a, b) => compareMiddleGradesRepresentativeCandidates(a, b, profile));

  for (const candidate of candidates) {
    const candidatePenalty = middleGradesRepresentativePenalty(candidate);
    const candidateScore = middleGradesRepresentativeSelectionScore(candidate, profile);
    const candidateTierRank = middleGradesEvidenceTierRank(middleGradesRouteAlignmentEvidence(candidate).tier);
    const replacement = selected
      .map((row, index) => ({ row, index }))
      .filter(({ row }) => isMiddleGradesOpenLibraryCandidate(row))
      .filter(({ row }) => middleGradesSameRepresentativeCluster(candidate, row))
      .filter(({ index }) => !middleGradesWouldConflictAfterRepresentativeSwap(candidate, selected, index))
      .map(({ row, index }) => ({
        row,
        index,
        selectedPenalty: middleGradesRepresentativePenalty(row),
        selectedScore: middleGradesRepresentativeSelectionScore(row, profile),
        selectedTierRank: middleGradesEvidenceTierRank(middleGradesRouteAlignmentEvidence(row).tier),
      }))
      .filter(({ row, selectedPenalty, selectedScore, selectedTierRank }) => {
        const representativeUpgrade = selectedPenalty >= candidatePenalty + 2.5;
        const canonicalUpgrade = isMiddleGradesCanonicalFranchiseTitle(candidate) && candidatePenalty < selectedPenalty;
        const scoreUpgrade = candidateScore >= selectedScore + 0.25;
        const evidenceCompatible = candidateTierRank >= selectedTierRank || candidateScore >= selectedScore + 1.5;
        return (scoreUpgrade || representativeUpgrade || canonicalUpgrade)
          && evidenceCompatible
          && candidate.score >= row.score - 8;
      })
      .sort((a, b) => b.selectedPenalty - a.selectedPenalty || a.selectedScore - b.selectedScore)[0];

    if (!replacement) continue;
    recordRejected(replacement.row, rejectedReasons, "middle_grades_replaced_by_stronger_franchise_representative");
    candidate.rejectedReasons.push("middle_grades_stronger_franchise_representative_selected");
    selected[replacement.index] = candidate;
    rejectedReasons.middle_grades_franchise_representative_replacements = Number(rejectedReasons.middle_grades_franchise_representative_replacements || 0) + 1;
  }
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
    ...asStringList(raw.subject_key),
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
  const backedTasteSignals = middleGradesDocumentBackedTasteSignals(candidate).filter((signal) => signal !== "adventure");
  if (middleGradesSupportedRouteEvidenceFields(candidate).length === 0 && backedTasteSignals.length === 0) return false;
  if (candidate.score < 0) return false;
  if (candidate.rejectedReasons.includes("middle_grades_query_only_score_cap_applied")) return false;
  if (candidate.rejectedReasons.includes("humor_keyword_only_leakage")) return false;
  if (candidate.rejectedReasons.includes("non_positive_score")) return false;
  return true;
}

function isMiddleGradesCleanFinalCandidate(candidate: ScoredCandidate): boolean {
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
    && !isMiddleGradesAntiZeroFallbackCandidate(candidate)
    && !(routeEvidence.queryLevel && !routeEvidence.documentLevel)
    && !isMiddleGradesTitleOnlyEvidence(candidate);
}

function applyMiddleGradesCleanFinalTopUp(rankedCandidates: ScoredCandidate[], selected: ScoredCandidate[], rejectedReasons: Record<string, number>, profile: TasteProfile, limit: number): void {
  if (profile.ageBand !== "preteens" || selected.length === 0) return;
  if (rankedCandidates.some((candidate) => candidate.diagnostics?.meaningfulTasteRecovery || candidate.diagnostics?.scoringHandoffStage === "meaningful_taste_recovery")) return;
  if (!rankedCandidates.some(isMiddleGradesCleanExpansionCandidate)) return;
  const target = Math.min(5, limit);
  if (target <= 0) return;
  const selectedTitles = () => new Set(selected.map((candidate) => normalized(candidate.title)));
  const selectedRoots = () => new Set(selected.map((candidate) => finalReturnedRootKey(candidate) || seriesKey(candidate)).filter(Boolean));
  const cleanCount = () => selected.filter(isMiddleGradesCleanFinalCandidate).length;
  const cleanPool = rankedCandidates
    .filter((candidate) => {
      if (selected.includes(candidate)) return false;
      if (!isMiddleGradesCleanFinalCandidate(candidate)) return false;
      if (candidate.maturityBand && String(candidate.maturityBand) !== profile.maturityBand) return false;
      if (rejectReason(candidate, profile)) return false;
      if (selectedTitles().has(normalized(candidate.title))) return false;
      const root = finalReturnedRootKey(candidate) || seriesKey(candidate);
      if (root && selectedRoots().has(root)) return false;
      return true;
    })
    .sort((a, b) => middleGradesSelectionScore(b, profile) - middleGradesSelectionScore(a, profile));
  for (const candidate of cleanPool) {
    if (cleanCount() >= target) break;
    const replacementIndex = selected
      .map((row, index) => ({ row, index, clean: isMiddleGradesCleanFinalCandidate(row), adjusted: middleGradesSelectionScore(row, profile) }))
      .filter(({ row, clean }) => !clean && !row.diagnostics?.meaningfulTasteRecovery && row.diagnostics?.scoringHandoffStage !== "meaningful_taste_recovery")
      .sort((a, b) => a.adjusted - b.adjusted)[0]?.index;
    if (replacementIndex === undefined) break;
    selected[replacementIndex].rejectedReasons.push("middle_grades_non_clean_final_replaced_by_clean_taste_match");
    candidate.rejectedReasons.push("middle_grades_clean_taste_match_selected_over_non_clean_final");
    selected[replacementIndex] = candidate;
    rejectedReasons.middle_grades_clean_final_top_up_replacements = Number(rejectedReasons.middle_grades_clean_final_top_up_replacements || 0) + 1;
  }
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
      .filter(({ row, tier }) => isMiddleGradesTitleOnlyEvidence(row)
        || tier === "weak_evidence"
        || (middleGradesEvidenceTierRank(tier) < middleGradesEvidenceTierRank("medium_evidence") && isMiddleGradesFallbackOrDefaultCandidate(row)))
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
  const isCleanFinalEligibleCandidate = (candidate: ScoredCandidate): boolean => isMiddleGradesCleanFinalCandidate(candidate)
    && !hasRepeatedClusterTitleToken(candidate);
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
  if (selected.length >= 5 && finalEligibilityCleanCandidateCount < 5 && meaningfulTasteRecoveryCandidates.length === 0) lockQualityFailReasons.push("final_clean_items_less_than_five");
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

function isKidsSuspiciousSelectionCandidate(candidate: ScoredCandidate): boolean {
  return /^(?:the )?(?:friends|lantern archive)$/i.test(String(candidate.title || "").trim());
}

function kidsTasteScore(candidate: ScoredCandidate): number {
  const breakdown = candidate.scoreBreakdown || {};
  return Math.round((
    Number(breakdown.genreFacetMatch || 0)
    + Number(breakdown.positiveTasteMatch || 0)
    + Number(breakdown.toneMatch || 0)
    + Number(breakdown.themeMatch || 0)
  ) * 1000) / 1000;
}

function kidsDistinctiveTasteSignals(candidate: ScoredCandidate): string[] {
  const matchedSignals = Array.isArray(candidate.matchedSignals) ? candidate.matchedSignals.map(String) : [];
  return matchedSignals
    .filter((signal) => !/^avoidSignalPenalty:/i.test(signal))
    .map((signal) => normalized(signal.replace(/^[^:]+:/, "")))
    .filter((signal) => signal && !/^(book|books|story|stories|children|juvenile fiction|picture|picture book|picture books|friendship|friends|fantasy|adventure|animal|animals|early reader|reader)$/.test(signal));
}

function kidsNonTitleDocumentText(candidate: ScoredCandidate): string {
  const raw = candidate.raw as any;
  const rawDescription = typeof raw?.description === "string" ? raw.description : raw?.description?.value;
  const firstSentence = Array.isArray(raw?.first_sentence) ? raw.first_sentence.join(" ") : raw?.first_sentence;
  return normalized([
    candidate.subtitle,
    candidate.description,
    (candidate.genres || []).join(" "),
    (candidate.themes || []).join(" "),
    (candidate.tones || []).join(" "),
    (candidate.characterDynamics || []).join(" "),
    Array.isArray(raw?.subject) ? raw.subject.join(" ") : raw?.subject,
    Array.isArray(raw?.subjects) ? raw.subjects.join(" ") : raw?.subjects,
    Array.isArray(raw?.subject_facet) ? raw.subject_facet.join(" ") : raw?.subject_facet,
    rawDescription,
    firstSentence,
  ].filter(Boolean).join(" ")).replace(/[\u2018\u2019\u201A\u201B\u2032\u2035]/g, "'");
}

function kidsHasStoryAgeShape(candidate: ScoredCandidate): boolean {
  const text = kidsNonTitleDocumentText(candidate);
  return /\b(picture books?|juvenile fiction|juvenile literature|children[ ']?s stories|children[ ']?s books?|easy readers?|early readers?|beginning readers?|beginner books?|read aloud|read alouds?|ages? [4-8]|grades? (?:k|1|2)|kindergarten|preschool)\b/.test(text);
}

function kidsHasStrongStoryReaderEvidence(candidate: ScoredCandidate): boolean {
  const text = normalized([candidate.title, candidate.subtitle, kidsNonTitleDocumentText(candidate)].filter(Boolean).join(" "));
  return /\b(picture books?|easy readers?|early readers?|beginning readers?|beginner books?|read aloud|read alouds?|ages? [4-8]|grades? (?:k|1|2)|kindergarten|preschool|level [12]|scholastic reader|i can read|step into reading)\b/.test(text);
}

function kidsDistinctiveSignalsSupportedByDocument(candidate: ScoredCandidate): string[] {
  const text = kidsNonTitleDocumentText(candidate);
  return kidsDistinctiveTasteSignals(candidate).filter((signal) => text.includes(signal));
}

function kidsWeakFallbackTitleShape(candidate: ScoredCandidate): boolean {
  const title = normalized([candidate.title, candidate.subtitle].filter(Boolean).join(" "));
  if (/\b(frog and toad|george and martha)\b/.test(title)) return false;
  return /^(?:the )?friends?$/.test(title)
    || /\b(?:are friends|two great friends|friend for life|friendship)\b/.test(title);
}

function kidsCollectionArtifactTitleShape(candidate: ScoredCandidate): boolean {
  const rawTitle = [candidate.title, candidate.subtitle].filter(Boolean).join(" ");
  const title = normalized(rawTitle);
  return /\//.test(rawTitle)
    || /\b(part of \d+ book set|book set|boxed set|box set|collection|treasury|anthology|omnibus|complete|collected|bind up|bindup)\b/.test(title);
}

function kidsObviousNonK2CleanLeakage(candidate: ScoredCandidate): boolean {
  const text = normalized([candidate.title, candidate.subtitle, kidsNonTitleDocumentText(candidate)].filter(Boolean).join(" "));
  if (/\bwatership down\b/.test(text)) return true;
  if (kidsCollectionArtifactTitleShape(candidate)) return true;
  if (/\b(adult coloring|adult colouring|for adults|adult picture book|young adult|teen|teens|ya)\b/.test(text)) return true;
  if (/\b(coloring|colouring|workbook|worksheet|activity book|activities|puzzles?|picture dictionary|dictionary|encyclopedia|reference|field guide|identification guide|guidebook|handbook|manual|first words|look and find|search and find|i spy|spot the)\b/.test(text)) return true;
  const nonStoryPictureArtifact = /\b(draw|drawing|how to draw|scenery|scenic|landscapes?|photographs?|photo book|poster book)\b/.test(text);
  const narrativeEvidence = /\b(story|stories|tale|tales|fiction|character|characters|read aloud|children s stories|juvenile fiction)\b/.test(text);
  return nonStoryPictureArtifact && !narrativeEvidence;
}

function kidsOlderClassicLeakage(candidate: ScoredCandidate): boolean {
  const text = normalized([candidate.title, candidate.subtitle, kidsNonTitleDocumentText(candidate)].filter(Boolean).join(" "));
  return /\b(chitty chitty bang bang|alice(?: s)? (?:adventures in )?wonderland|alice in wonderland|twice told tales)\b/.test(text);
}

function kidsPreferredK2FallbackTitle(candidate: ScoredCandidate): boolean {
  const title = normalized([candidate.title, candidate.subtitle].filter(Boolean).join(" "));
  return /\b(mr funny|beekle|harold(?: s)?|arthur(?: s| writes| adventure)|franklin|little bear|henry and mudge|george and martha|frog and toad|be kind|guess how much i love you|do unto otters)\b/.test(title);
}

function kidsWeakOrderingPenalty(candidate: ScoredCandidate): number {
  const text = normalized([candidate.title, candidate.subtitle, kidsNonTitleDocumentText(candidate)].filter(Boolean).join(" "));
  let penalty = 0;
  if (/\b(bible|biblical|jesus|moses|noah|christian|prayer|religion|saints?)\b/.test(text)) penalty += 4;
  if (/\b(folklore|folk tale|folktale|mythology|myths?|legend|legends)\b/.test(text)) penalty += 2;
  if (/\b(christmasaurus|mr mischief|madeleine|fawn|animal talent fairy|fairies|spider man|spiderman|superman|batman|star wars|pokemon|marvel|disney)\b/.test(text)) penalty += 3;
  if (/\bwho will be my friends\b/.test(text)) penalty += 3;
  if (kidsWeakFallbackTitleShape(candidate) && !kidsPreferredK2FallbackTitle(candidate)) penalty += 2;
  if (!kidsHasStrongStoryReaderEvidence(candidate) && !kidsDistinctiveSignalsSupportedByDocument(candidate).length && !kidsPreferredK2FallbackTitle(candidate)) penalty += 1.5;
  if (kidsTasteScore(candidate) < 0.75 && kidsDistinctiveSignalsSupportedByDocument(candidate).length === 0 && !kidsPreferredK2FallbackTitle(candidate)) penalty += 2;
  return penalty;
}

function kidsFinalSelectionScore(candidate: ScoredCandidate, profile: TasteProfile): number {
  const breakdown = candidate.scoreBreakdown || {};
  const documentBackedTasteCount = kidsDistinctiveSignalsSupportedByDocument(candidate).length;
  const profileCoverageCount = kidsCandidateCoverageSignals(candidate, profile).length;
  return (kidsPreferredK2FallbackTitle(candidate) ? 6 : 0)
    + documentBackedTasteCount * 3
    + profileCoverageCount * 2
    + (kidsHasStrongStoryReaderEvidence(candidate) ? 2 : 0)
    + (kidsHasStoryAgeShape(candidate) ? 1 : 0)
    + (kidsQueryAnchoredStoryCandidate(candidate) ? 0.75 : 0)
    + Math.max(0, kidsTasteScore(candidate))
    + Math.max(0, Number(breakdown.sourceQualityRelevance || 0)) * 0.5
    + candidate.score * 0.05
    - kidsWeakOrderingPenalty(candidate);
}

function compareKidsFinalSelectionCandidates(a: ScoredCandidate, b: ScoredCandidate, profile: TasteProfile): number {
  return kidsFinalSelectionScore(b, profile) - kidsFinalSelectionScore(a, profile)
    || kidsDistinctiveSignalsSupportedByDocument(b).length - kidsDistinctiveSignalsSupportedByDocument(a).length
    || kidsTasteScore(b) - kidsTasteScore(a)
    || b.score - a.score
    || a.title.localeCompare(b.title);
}

function kidsQueryAnchoredStoryCandidate(candidate: ScoredCandidate): boolean {
  const routeText = normalized([
    candidate.diagnostics?.queryText,
    candidate.diagnostics?.queryFamily,
    candidate.diagnostics?.routingReason,
  ].filter(Boolean).join(" "));
  return /\b(picture|picture books?|early readers?|easy readers?|beginning readers?|children picture|k2 openlibrary picture early reader|k2 clean candidate shortfall semantic expansion)\b/.test(routeText);
}

function kidsHighConfidenceK2Narrative(candidate: ScoredCandidate, documentBackedTaste: boolean): boolean {
  if (!kidsHasStoryAgeShape(candidate)) return false;
  if (kidsHasStrongStoryReaderEvidence(candidate)) return true;
  if (kidsOlderClassicLeakage(candidate) && !documentBackedTaste) return false;
  return false;
}


function profileExplicitlyRequestsNonfictionReference(profile: TasteProfile): boolean {
  const values = [
    ...profile.genreFamily,
    ...profile.themes,
    ...profile.tone,
    ...profile.characterDynamics,
    ...profile.formatPreference,
  ].filter((signal) => Number(signal.weight || 0) > 0)
    .filter((signal) => Array.isArray(signal.evidence) && signal.evidence.some((item) => String(item || "").startsWith("like:")))
    .map((signal) => normalized(signal.value))
    .join(" ");
  return /\b(nonfiction|non fiction|reference|atlas|encyclopedia|dictionary|activity|activities|puzzle|puzzles|coloring|colouring|word book|identification guide|field guide|guidebook|facts?)\b/.test(values);
}

function kidsNonNarrativeInformationalArtifact(candidate: ScoredCandidate): boolean {
  const text = normalized([candidate.title, candidate.subtitle, kidsNonTitleDocumentText(candidate), candidate.diagnostics?.queryText].filter(Boolean).join(" "));
  const informational = /\b(atlas|atlases|picture dictionary|dictionary|encyclopedia|reference|field guide|identification guide|guide to|guidebook|handbook|manual|activity book|activities|puzzles?|coloring|colouring|workbook|worksheet|word book|wordbook|concept book|first words|look and find|search and find|i spy|spot the|facts?|nonfiction|non fiction|informational)\b/.test(text);
  const narrative = /\b(story|stories|tale|tales|fiction|novel|chapter book|early reader|easy reader|picture book|read aloud|adventure|journey|friendship|friends?|character|characters)\b/.test(text);
  return informational && !narrative;
}

type KidsAudienceBand = "kids" | "preteens" | "teens" | "adult" | "unknown";
type KidsFormatIdentity = "picture_book" | "early_reader" | "beginning_chapter_book" | "read_aloud" | "juvenile_narrative" | "unknown";
type KidsGoogleBooksAudienceEligibility = {
  allowed: boolean;
  reason: string;
  inferredAudienceBand: KidsAudienceBand;
  audienceEvidence: string[];
  formatIdentity: KidsFormatIdentity;
  formatEvidence: string[];
  audienceDecision: string;
  audienceRejectionReason: string;
  requestContextExcludedFromEvidence: boolean;
  notMatureExcludedFromAgeEvidence: boolean;
  likelyBucket: "likely_k2" | "likely_adult_or_ya" | "ambiguous";
};

const KIDS_GOOGLE_BOOKS_NON_NARRATIVE_SHAPES = new Set([
  "critical_study",
  "academic_text",
  "author_commentary",
  "literary_history",
  "reference",
  "writing_guide",
  "readers_advisory",
  "periodical",
  "anthology",
  "essay_collection",
  "generic_category_catalog",
  "public_domain_compilation",
  "nonfiction",
  "miscellany",
]);

function kidsGoogleBooksCollectionOrBundleIdentity(candidate: ScoredCandidate): {
  identity: string;
  collectionEvidence: string[];
  singlePublicationEvidence: string[];
  marketingKeywordEvidence: string[];
  trustedIdentityFields: string[];
} {
  const rawTitle = [candidate.title, candidate.subtitle].filter(Boolean).join(" ");
  const titleText = normalized(rawTitle);
  const nonTitleText = kidsNonTitleDocumentText(candidate);
  const collectionEvidence: string[] = [];
  const singlePublicationEvidence: string[] = [];
  const marketingKeywordEvidence: string[] = [];
  const trustedIdentityFields: string[] = [];

  if (/\bebooks?\b/.test(titleText)) collectionEvidence.push("title_ebook_bundle_indicator");
  if (/\bfun stories\b/.test(titleText)) collectionEvidence.push("title_fun_stories_collection");
  if (/\bjoke books?\b|\bkid jokes?\b|\bkids? jokes?\b/.test(titleText)) collectionEvidence.push("title_joke_compilation");
  if (/\b\d+\s+(?:picture\s+)?books?\b/.test(titleText) && /\bfor kids\b/.test(titleText)) collectionEvidence.push("title_numbered_books_for_kids_catalog");
  if (/\bpicture books? for kids\b/.test(titleText)) collectionEvidence.push("title_picture_books_for_kids_catalog");
  if (/\bbooks about things kids love\b/.test(titleText)) collectionEvidence.push("title_books_about_catalog");
  if (/\bgreat books about\b/.test(titleText)) collectionEvidence.push("title_great_books_about_catalog");

  if (/\bkid ebooks?\b|\bkids? ebooks?\b/.test(titleText)) marketingKeywordEvidence.push("title_seo_kids_ebooks");
  if (/\bfor kids\b/.test(titleText) && /\bpicture books?\b/.test(titleText)) marketingKeywordEvidence.push("title_for_kids_with_picture_books_phrase");

  if (/\((?:cgtv\s+early reader|step into reading|i can read|ready to read|scholastic reader|level\s+[12])\)/i.test(rawTitle)) singlePublicationEvidence.push("series_reading_program_designation");
  if (/\((?:book\s+\d+|#\s*\d+|volume\s+\d+|part\s+\d+)\)/i.test(rawTitle)) singlePublicationEvidence.push("series_entry_designation");
  if (/\b(?:early reader|beginning reader|beginner book)\b/i.test(rawTitle) && !/\breaders?\b.*\bbooks?\b/i.test(rawTitle)) singlePublicationEvidence.push("single_format_designation_in_title");

  const categories: string[] = Array.isArray((candidate.raw as Record<string, unknown>)?.categories) ? (candidate.raw as Record<string, unknown[]>).categories as string[] : [];
  if (categories.some((cat) => /\bjuvenile fiction\b/i.test(String(cat)))) trustedIdentityFields.push("juvenile_fiction_category");
  if (categories.some((cat) => /\bearly reader\b|\bpicture books?\b/i.test(String(cat)))) trustedIdentityFields.push("children_format_category");
  if (String(nonTitleText).length > 0) trustedIdentityFields.push("non_title_text_present");

  const hasJokeCompilation = collectionEvidence.some((e) => e.includes("joke_compilation"));
  const hasFunStoriesCollection = collectionEvidence.some((e) => e.includes("fun_stories_collection"));
  const hasSeoEbooks = marketingKeywordEvidence.some((e) => e.includes("seo_kids_ebooks"));
  const hasEbookBundle = collectionEvidence.some((e) => e.includes("ebook_bundle_indicator"));
  const hasCatalogPattern = collectionEvidence.some((e) => e.includes("_catalog") || e.includes("numbered_books_for_kids"));
  const hasSingleEvidence = singlePublicationEvidence.length > 0;

  let identity: string;
  if (hasJokeCompilation || (hasFunStoriesCollection && (hasSeoEbooks || hasEbookBundle))) {
    identity = "activity_or_joke_compilation";
  } else if (hasCatalogPattern) {
    identity = "generic_bundle";
  } else if (hasFunStoriesCollection || hasEbookBundle) {
    identity = "story_collection";
  } else if (hasSingleEvidence) {
    identity = "single_story";
  } else {
    identity = "ambiguous";
  }

  return { identity, collectionEvidence, singlePublicationEvidence, marketingKeywordEvidence, trustedIdentityFields };
}

function kidsGoogleBooksAudienceEligibility(candidate: ScoredCandidate): KidsGoogleBooksAudienceEligibility {
  const titleText = normalized([candidate.title, candidate.subtitle].filter(Boolean).join(" "));
  const nonTitleText = kidsNonTitleDocumentText(candidate);
  const combined = [titleText, nonTitleText].join(" ");
  const shape = normalized(candidate.diagnostics?.googleBooksPublicationShape);
  const rawVolumeInfo = (candidate.raw && typeof candidate.raw === "object" && "volumeInfo" in (candidate.raw as object))
    ? ((candidate.raw as Record<string, unknown>).volumeInfo as Record<string, unknown> | undefined)
    : undefined;
  const pageCount = Number(rawVolumeInfo?.pageCount || 0) || undefined;
  const audienceEvidence: string[] = [];
  const formatEvidence: string[] = [];
  const contradictionEvidence: string[] = [];
  let formatIdentity: KidsFormatIdentity = "unknown";

  if (/\b(picture books?|picture book)\b/.test(combined)) {
    formatIdentity = "picture_book";
    formatEvidence.push("picture_book_identity");
  }
  if (/\b(early readers?|easy readers?|easy-to-read|easy to read|beginning readers?|beginner books?|i can read|step into reading|ready to read|ready-to-read|scholastic reader|level [12]|reading level [12]|reader level [12]|cgtv early reader)\b/.test(combined)) {
    formatIdentity = formatIdentity === "unknown" ? "early_reader" : formatIdentity;
    formatEvidence.push("early_reader_identity");
  }
  if (/\b(read aloud|read alouds?)\b/.test(combined)) {
    formatIdentity = formatIdentity === "unknown" ? "read_aloud" : formatIdentity;
    formatEvidence.push("read_aloud_identity");
  }
  if (/\b(chapter books?|beginning chapter)\b/.test(combined)) {
    formatIdentity = formatIdentity === "unknown" ? "beginning_chapter_book" : formatIdentity;
    formatEvidence.push("beginning_chapter_book_identity");
  }
  if (formatIdentity === "unknown" && /\b(story|stories|tale|tales|adventure|journey|friendship|friends?|character|characters)\b/.test(combined)) {
    formatIdentity = "juvenile_narrative";
    formatEvidence.push("juvenile_narrative_story_signals");
  }

  if (/\b(juvenile fiction|children[ ']?s fiction|children[ ']?s stories|picture books?)\b/.test(nonTitleText)) audienceEvidence.push("juvenile_or_childrens_fiction_category");
  if (/\b(ages?\s*(?:3|4|5|6|7|8)\b|grades?\s*(?:k|1|2)\b|kindergarten|preschool)\b/.test(nonTitleText)) audienceEvidence.push("k2_age_or_grade_metadata");
  if (/\b(middle grade|grades?\s*[3-8]|ages?\s*(?:9|10|11|12)\b)\b/.test(nonTitleText)) audienceEvidence.push("middle_grades_metadata");
  if (/\b(young adult|ya\b|teen(?:s|age|ager)?|high school|new adult)\b/.test(combined)) contradictionEvidence.push("ya_or_teen_audience_marker");
  if (/\b(adult fiction|for adults|college romance|new adult)\b/.test(combined)) contradictionEvidence.push("adult_audience_marker");
  if (/\b(comics? (?:and|&) graphic novels?|graphic novels?)\b/.test(nonTitleText) && !/\b(juvenile fiction|children[ ']?s fiction)\b/.test(nonTitleText)) contradictionEvidence.push("adult_or_general_graphic_novel_context");
  if (/\b(sandman|preludes and nocturnes|30th anniversary edition)\b/.test(combined)) contradictionEvidence.push("adult_graphic_novel_identity");
  if (/\b(poetry|poems?|literary criticism|history and criticism|critical studies?|essays?|anthology|reference|catalog|bibliograph(?:y|ies)|periodical)\b/.test(combined)) contradictionEvidence.push("academic_reference_or_non_narrative_identity");
  if (shape && KIDS_GOOGLE_BOOKS_NON_NARRATIVE_SHAPES.has(shape)) contradictionEvidence.push(`non_narrative_publication_shape:${shape}`);

  if (formatIdentity === "unknown" && audienceEvidence.includes("juvenile_or_childrens_fiction_category")) {
    // Only apply pronoun expansion when page count is unknown or within K-2 range.
    // Google Books labels YA novels (e.g., The Hunger Games) as "Juvenile Fiction", so
    // a known long page count (>100) is a decisive counter-signal.
    const knownLongBook = pageCount !== undefined && pageCount > 100;
    if (!knownLongBook && /\b(he|she|his|her|they|their)\b/.test(combined)) {
      formatIdentity = "juvenile_narrative";
      formatEvidence.push("juvenile_fiction_with_narrative_pronoun");
    }
  }

  let inferredAudienceBand: KidsAudienceBand = "unknown";
  if (contradictionEvidence.some((entry) => /ya_or_teen|adult_audience|adult_graphic|academic_reference|non_narrative/.test(entry))) {
    inferredAudienceBand = contradictionEvidence.some((entry) => /ya_or_teen/.test(entry)) ? "teens" : "adult";
  } else if (audienceEvidence.includes("k2_age_or_grade_metadata") || audienceEvidence.includes("juvenile_or_childrens_fiction_category")) {
    inferredAudienceBand = "kids";
  } else if (audienceEvidence.includes("middle_grades_metadata")) {
    inferredAudienceBand = "preteens";
  }

  const hasStrongK2Format = formatIdentity === "picture_book" || formatIdentity === "early_reader" || formatIdentity === "read_aloud" || formatIdentity === "beginning_chapter_book";
  const hasCredibleK2Audience = inferredAudienceBand === "kids";
  const hasDecisiveAdultOrYaContradiction = contradictionEvidence.length > 0;
  const hasNarrativeFormat = hasStrongK2Format || formatIdentity === "juvenile_narrative";
  const allowed = hasCredibleK2Audience && hasNarrativeFormat && !hasDecisiveAdultOrYaContradiction;

  const reason = !hasCredibleK2Audience
    ? "k2_unknown_or_non_k2_audience_without_credible_k2_evidence"
    : !hasNarrativeFormat
      ? "k2_missing_child_readable_narrative_or_format_identity"
      : hasDecisiveAdultOrYaContradiction
        ? "k2_decisive_adult_or_ya_contradiction"
        : "kids_googlebooks_independent_audience_and_format_passed";
  const audienceDecision = allowed
    ? "accepted_k2_independent_audience_and_format"
    : "rejected_k2_independent_audience_or_format";
  const audienceRejectionReason = allowed ? "" : reason;
  const likelyBucket = allowed
    ? "likely_k2"
    : hasDecisiveAdultOrYaContradiction || inferredAudienceBand === "adult" || inferredAudienceBand === "teens"
      ? "likely_adult_or_ya"
      : "ambiguous";

  return {
    allowed,
    reason,
    inferredAudienceBand,
    audienceEvidence: Array.from(new Set([...audienceEvidence, ...contradictionEvidence])),
    formatIdentity,
    formatEvidence: Array.from(new Set(formatEvidence)),
    audienceDecision,
    audienceRejectionReason,
    requestContextExcludedFromEvidence: true,
    notMatureExcludedFromAgeEvidence: true,
    likelyBucket,
  };
}

export function kidsGoogleBooksPreScoringEligibility(
  candidate: NormalizedCandidate,
  profile: TasteProfile,
): KidsGoogleBooksAudienceEligibility {
  if (profile.ageBand !== "kids" || candidate.source !== "googleBooks") {
    return {
      allowed: true,
      reason: "kids_googlebooks_pre_scoring_policy_not_applicable",
      inferredAudienceBand: "unknown",
      audienceEvidence: [],
      formatIdentity: "unknown",
      formatEvidence: [],
      audienceDecision: "policy_not_applicable",
      audienceRejectionReason: "",
      requestContextExcludedFromEvidence: true,
      notMatureExcludedFromAgeEvidence: true,
      likelyBucket: "ambiguous",
    };
  }
  const policyCandidate = candidate as ScoredCandidate;
  const audienceEligibility = kidsGoogleBooksAudienceEligibility(policyCandidate);
  policyCandidate.diagnostics = {
    ...policyCandidate.diagnostics,
    kidsGoogleBooksInferredAudienceBand: audienceEligibility.inferredAudienceBand,
    kidsGoogleBooksAudienceEvidence: audienceEligibility.audienceEvidence,
    kidsGoogleBooksFormatIdentity: audienceEligibility.formatIdentity,
    kidsGoogleBooksFormatEvidence: audienceEligibility.formatEvidence,
    kidsGoogleBooksAudienceDecision: audienceEligibility.audienceDecision,
    kidsGoogleBooksAudienceRejectionReason: audienceEligibility.audienceRejectionReason,
    kidsGoogleBooksRequestContextExcludedFromEvidence: audienceEligibility.requestContextExcludedFromEvidence,
    kidsGoogleBooksNotMatureExcludedFromAgeEvidence: audienceEligibility.notMatureExcludedFromAgeEvidence,
    kidsGoogleBooksAudienceFormatGateDecision: audienceEligibility.allowed
      ? "passed_k2_independent_audience_and_format"
      : `rejected:${audienceEligibility.reason}`,
  };
  const maturityReason = googleBooksMaturityRejectReason(policyCandidate, profile);
  if (maturityReason) return { ...audienceEligibility, allowed: false, reason: maturityReason, audienceRejectionReason: maturityReason };
  if (!audienceEligibility.allowed) return audienceEligibility;
  const identityResult = kidsGoogleBooksCollectionOrBundleIdentity(policyCandidate);
  policyCandidate.diagnostics = {
    ...policyCandidate.diagnostics,
    kidsGoogleBooksRecommendationIdentity: identityResult.identity,
    kidsGoogleBooksCollectionEvidence: identityResult.collectionEvidence,
    kidsGoogleBooksSinglePublicationEvidence: identityResult.singlePublicationEvidence,
    kidsGoogleBooksMarketingKeywordEvidence: identityResult.marketingKeywordEvidence,
    kidsGoogleBooksTrustedIdentityFields: identityResult.trustedIdentityFields,
  };
  const isRejectableCollection = identityResult.identity === "activity_or_joke_compilation"
    || identityResult.identity === "generic_bundle"
    || identityResult.identity === "story_collection";
  if (isRejectableCollection) {
    const collectionReason = `k2_collection_or_bundle_${identityResult.identity.replace(/-/g, "_")}`;
    return { ...audienceEligibility, allowed: false, reason: collectionReason, audienceRejectionReason: collectionReason };
  }
  if (isKidsSuspiciousSelectionCandidate(policyCandidate)) {
    return { ...audienceEligibility, allowed: false, reason: "k2_suspicious_title_artifact", audienceRejectionReason: "k2_suspicious_title_artifact" };
  }
  if (kidsNonNarrativeInformationalArtifact(policyCandidate) && !profileExplicitlyRequestsNonfictionReference(profile)) {
    return { ...audienceEligibility, allowed: false, reason: "k2_non_narrative_informational_artifact", audienceRejectionReason: "k2_non_narrative_informational_artifact" };
  }
  if (kidsObviousNonK2CleanLeakage(policyCandidate)) {
    return { ...audienceEligibility, allowed: false, reason: "k2_missing_story_picture_reader_relevance", audienceRejectionReason: "k2_missing_story_picture_reader_relevance" };
  }
  return { ...audienceEligibility, allowed: true, reason: "kids_googlebooks_conclusive_pre_scoring_policy_passed", audienceRejectionReason: "" };
}

function middleGradesNonNarrativeInformationalArtifact(candidate: ScoredCandidate): boolean {
  if (!isMiddleGradesOpenLibraryCandidate(candidate)) return false;
  const text = middleGradesRawText(candidate);
  const informational = /\b(atlas|atlases|picture dictionary|dictionary|encyclopedia|reference|field guide|identification guide|guide to|guidebook|handbook|manual|activity book|activities|puzzles?|coloring|colouring|workbook|worksheet|word book|wordbook|look and find|search and find|i spy|facts?|nonfiction|non fiction|informational)\b/.test(text);
  const narrative = middleGradesFictionAgeEvidence(candidate) || /\b(story|stories|tale|tales|fiction|novel|chapter book|adventure|mystery|fantasy|quest|friendship|friends?|school story)\b/.test(text);
  return informational && !narrative;
}

function isKidsCleanFinalCandidate(candidate: ScoredCandidate): boolean {
  return kidsCleanFinalCandidateWithEvidence(candidate).passed;
}

function kidsCleanFinalCandidateWithEvidence(candidate: ScoredCandidate): {
  passed: boolean;
  reason: string;
  evidence: string[];
  failedCheck: string;
} {
  const audienceEligibility = kidsGoogleBooksAudienceEligibility(candidate);
  if (!audienceEligibility.allowed) return { passed: false, reason: "k2_missing_story_picture_reader_relevance", evidence: ["failed_audience_format_gate"], failedCheck: "audience_format_gate" };
  const tasteScore = kidsTasteScore(candidate);
  if (candidate.score <= 0) return { passed: false, reason: "k2_missing_story_picture_reader_relevance", evidence: ["non_positive_score"], failedCheck: "non_positive_score" };
  if (isKidsSuspiciousSelectionCandidate(candidate)) return { passed: false, reason: "k2_missing_story_picture_reader_relevance", evidence: ["suspicious_candidate"], failedCheck: "suspicious_title" };
  if (tasteScore <= 0) return { passed: false, reason: "k2_missing_story_picture_reader_relevance", evidence: [`taste_score:${tasteScore}`], failedCheck: "zero_taste_score" };
  if (kidsNonNarrativeInformationalArtifact(candidate)) return { passed: false, reason: "k2_missing_story_picture_reader_relevance", evidence: ["non_narrative_informational_artifact"], failedCheck: "non_narrative_informational_artifact" };
  if (kidsObviousNonK2CleanLeakage(candidate)) return { passed: false, reason: "k2_missing_story_picture_reader_relevance", evidence: ["obvious_non_k2_leakage"], failedCheck: "obvious_non_k2_leakage" };
  const queryAnchoredForDiagnosticsOnly = kidsQueryAnchoredStoryCandidate(candidate);
  const storyAgeShape = kidsHasStoryAgeShape(candidate);
  if (!storyAgeShape) return { passed: false, reason: "k2_missing_story_picture_reader_relevance", evidence: ["no_story_age_shape"], failedCheck: "story_age_shape" };
  const documentBackedTaste = kidsDistinctiveSignalsSupportedByDocument(candidate).length > 0;
  if (kidsOlderClassicLeakage(candidate) && !kidsHasStrongStoryReaderEvidence(candidate)) return { passed: false, reason: "k2_missing_story_picture_reader_relevance", evidence: ["older_classic_leakage", "no_strong_story_reader_evidence"], failedCheck: "older_classic_leakage" };
  if (kidsWeakFallbackTitleShape(candidate) && !kidsHasStrongStoryReaderEvidence(candidate) && !documentBackedTaste) return { passed: false, reason: "k2_missing_story_picture_reader_relevance", evidence: ["weak_fallback_title_shape", "no_strong_story_reader_evidence", "no_document_backed_taste"], failedCheck: "weak_fallback_title_shape" };
  const passed = documentBackedTaste
    || kidsHighConfidenceK2Narrative(candidate, documentBackedTaste);
  if (!passed) return { passed: false, reason: "k2_missing_story_picture_reader_relevance", evidence: ["no_final_qualifying_condition_met", queryAnchoredForDiagnosticsOnly ? "query_anchored_retrieval_context_not_publication_evidence" : "not_query_anchored"], failedCheck: "final_qualifying_condition" };
  const passedBy = documentBackedTaste
    ? "document_backed_taste"
    : "high_confidence_k2_narrative";
  return { passed: true, reason: "kids_clean_final_gate_passed", evidence: [passedBy, storyAgeShape ? "has_story_age_shape" : "query_anchored", `taste_score:${tasteScore}`], failedCheck: "" };
}

function applyKidsCleanFinalTopUp(rankedCandidates: ScoredCandidate[], selected: ScoredCandidate[], rejectedReasons: Record<string, number>, profile: TasteProfile, limit: number): void {
  if (profile.ageBand !== "kids") return;
  const target = Math.min(5, limit);
  if (target <= 0) return;
  const selectedTitles = () => new Set(selected.map((candidate) => normalized(candidate.title)));
  const cleanPool = rankedCandidates
    .filter((candidate) => !selected.includes(candidate))
    .filter(isKidsCleanFinalCandidate)
    .filter((candidate) => !rejectReason(candidate, profile))
    .filter((candidate) => !selectedTitles().has(normalized(candidate.title)))
    .sort((a, b) => compareKidsFinalSelectionCandidates(a, b, profile));
  for (const candidate of cleanPool) {
    const cleanCount = selected.filter(isKidsCleanFinalCandidate).length;
    if (cleanCount >= target) break;
    const titleKey = normalized(candidate.title);
    if (selectedTitles().has(titleKey)) continue;
    if (selected.length < target) {
      candidate.rejectedReasons.push("k2_clean_final_top_up_appended_safe_candidate");
      selected.push(candidate);
      rejectedReasons.k2_clean_final_top_up_appended = Number(rejectedReasons.k2_clean_final_top_up_appended || 0) + 1;
      continue;
    }
    const replacementIndex = selected
      .map((row, index) => ({ row, index, clean: isKidsCleanFinalCandidate(row), taste: kidsTasteScore(row), distinctive: kidsDistinctiveTasteSignals(row).length }))
      .filter(({ clean }) => !clean)
      .sort((a, b) => a.distinctive - b.distinctive || a.taste - b.taste || a.row.score - b.row.score)[0]?.index;
    if (replacementIndex === undefined) break;
    const replaced = selected[replacementIndex];
    replaced.rejectedReasons.push("k2_clean_final_top_up_replaced_broad_candidate");
    candidate.rejectedReasons.push("k2_clean_final_top_up_selected_distinctive_candidate");
    selected[replacementIndex] = candidate;
    rejectedReasons.k2_clean_final_top_up_replacements = Number(rejectedReasons.k2_clean_final_top_up_replacements || 0) + 1;
  }
  for (const candidate of cleanPool) {
    if (selected.includes(candidate)) continue;
    const titleKey = normalized(candidate.title);
    if (selectedTitles().has(titleKey)) continue;
    const candidateScore = kidsFinalSelectionScore(candidate, profile);
    const replacementIndex = selected
      .map((row, index) => ({ row, index, clean: isKidsCleanFinalCandidate(row), orderScore: kidsFinalSelectionScore(row, profile) }))
      .filter(({ clean, orderScore }) => clean && candidateScore > orderScore + 0.75)
      .sort((a, b) => a.orderScore - b.orderScore || a.row.score - b.row.score)[0]?.index;
    if (replacementIndex === undefined) continue;
    const replaced = selected[replacementIndex];
    replaced.rejectedReasons.push("k2_clean_final_replaced_by_stronger_ordered_candidate");
    candidate.rejectedReasons.push("k2_clean_final_selected_by_ordering_preference");
    selected[replacementIndex] = candidate;
    rejectedReasons.k2_clean_final_ordering_replacements = Number(rejectedReasons.k2_clean_final_ordering_replacements || 0) + 1;
  }
}


function kidsProfileCoverageSignals(profile: TasteProfile): string[] {
  const generic = /^(book|books|story|stories|children|juvenile fiction|picture|picture book|picture books|friendship|friends|fantasy|adventure|animal|animals|early reader|reader|k2)$/;
  return [...profile.genreFamily, ...profile.themes, ...profile.tone, ...profile.characterDynamics, ...profile.formatPreference]
    .filter((signal) => Number(signal.weight || 0) > 0)
    .filter((signal) => Array.isArray(signal.evidence) && signal.evidence.some((item) => String(item || "").startsWith("like:")))
    .map((signal) => normalized(signal.value))
    .filter((signal) => signal && !generic.test(signal));
}

function kidsCandidateCoverageSignals(candidate: ScoredCandidate, profile: TasteProfile): string[] {
  const text = kidsNonTitleDocumentText(candidate);
  return Array.from(new Set(kidsProfileCoverageSignals(profile).filter((signal) => text.includes(signal)))).slice(0, 12);
}

function applyKidsProfileCoverageDiversification(rankedCandidates: ScoredCandidate[], selected: ScoredCandidate[], rejectedReasons: Record<string, number>, profile: TasteProfile, limit: number): void {
  if (profile.ageBand !== "kids" || selected.length < Math.min(3, limit)) return;
  const targetSignals = kidsProfileCoverageSignals(profile);
  if (targetSignals.length < 2) return;
  const selectedTitles = () => new Set(selected.map((candidate) => normalized(candidate.title)));
  const coverageCounts = () => {
    const counts = new Map<string, number>();
    for (const candidate of selected) {
      for (const signal of kidsCandidateCoverageSignals(candidate, profile)) counts.set(signal, (counts.get(signal) || 0) + 1);
    }
    return counts;
  };
  let replacements = 0;
  while (replacements < 2) {
    const counts = coverageCounts();
    const missingSignals = targetSignals.filter((signal) => !counts.has(signal));
    if (!missingSignals.length) break;
    const replacement = rankedCandidates
      .filter((candidate) => !selected.includes(candidate))
      .filter(isKidsCleanFinalCandidate)
      .filter((candidate) => !rejectReason(candidate, profile))
      .filter((candidate) => !selectedTitles().has(normalized(candidate.title)))
      .map((candidate) => ({ candidate, coveredMissing: kidsCandidateCoverageSignals(candidate, profile).filter((signal) => missingSignals.includes(signal)) }))
      .filter(({ coveredMissing }) => coveredMissing.length > 0)
      .sort((a, b) => b.coveredMissing.length - a.coveredMissing.length || b.candidate.score - a.candidate.score)[0];
    if (!replacement) break;
    const replaceIndex = selected
      .map((candidate, index) => {
        const covered = kidsCandidateCoverageSignals(candidate, profile);
        const redundant = covered.length === 0 || covered.every((signal) => (counts.get(signal) || 0) > 1);
        return { candidate, index, covered, redundant };
      })
      .filter(({ redundant }) => redundant)
      .sort((a, b) => a.covered.length - b.covered.length || a.candidate.score - b.candidate.score)[0]?.index;
    if (replaceIndex === undefined) break;
    const replaced = selected[replaceIndex];
    if (replacement.candidate.score < replaced.score - 5) break;
    replaced.rejectedReasons.push("k2_profile_coverage_replaced_redundant_facet_candidate");
    replacement.candidate.rejectedReasons.push(`k2_profile_coverage_selected:${replacement.coveredMissing.join("|")}`);
    selected[replaceIndex] = replacement.candidate;
    rejectedReasons.k2_profile_coverage_replacements = Number(rejectedReasons.k2_profile_coverage_replacements || 0) + 1;
    rejectedReasons.k2_profile_coverage_added_signals = Number(rejectedReasons.k2_profile_coverage_added_signals || 0) + replacement.coveredMissing.length;
    replacements += 1;
  }
}

function kidsQualityAuditRow(candidate: ScoredCandidate, selectedTitles: Set<string>, label = "candidate"): Record<string, unknown> {
  const breakdown = candidate.scoreBreakdown || {};
  const matchedSignals = Array.isArray(candidate.matchedSignals) ? candidate.matchedSignals.map(String) : [];
  return {
    title: candidate.title,
    source: candidate.source,
    query: String(candidate.diagnostics?.queryText || candidate.diagnostics?.queryFamily || ""),
    routingReason: String(candidate.diagnostics?.routingReason || ""),
    selected: selectedTitles.has(normalized(candidate.title)),
    label,
    score: candidate.score,
    tasteScore: kidsTasteScore(candidate),
    sourceQualityRelevance: Number(breakdown.sourceQualityRelevance || 0),
    ageSuitability: Number(breakdown.ageKidsSuitability || breakdown.ageSuitability || 0),
    positiveMatches: matchedSignals.filter((signal) => !/^avoidSignalPenalty:/i.test(signal)),
    avoidMatches: matchedSignals.filter((signal) => /^avoidSignalPenalty:/i.test(signal)),
    rejectedReason: selectedTitles.has(normalized(candidate.title))
      ? "selected"
      : candidate.rejectedReasons.join(",") || "ranked_below_final_selection",
  };
}

function addKidsSelectionObservability(rankedCandidates: ScoredCandidate[], selected: ScoredCandidate[], rejectedReasons: Record<string, number>, profile: TasteProfile): void {
  if (profile.ageBand !== "kids") return;
  const diagnostics = rejectedReasons as Record<string, unknown>;
  const selectedTitles = new Set(selected.map((candidate) => normalized(candidate.title)));
  const candidateTasteMatchScoreByTitle: Record<string, number> = {};
  const candidateMatchedLikedSignalsByTitle: Record<string, string[]> = {};
  const candidateMatchedDislikedSignalsByTitle: Record<string, string[]> = {};
  const finalScoreComponentsByTitle: Record<string, Record<string, number>> = {};
  const finalSelectionReasonByTitle: Record<string, string> = {};
  for (const candidate of rankedCandidates) {
    const matchedSignals = Array.isArray(candidate.matchedSignals) ? candidate.matchedSignals.map(String) : [];
    const likedSignals = matchedSignals.filter((signal) => !/^avoidSignalPenalty:/i.test(signal));
    const dislikedSignals = matchedSignals.filter((signal) => /^avoidSignalPenalty:/i.test(signal));
    const tasteScore = kidsTasteScore(candidate);
    candidateTasteMatchScoreByTitle[candidate.title] = tasteScore;
    candidateMatchedLikedSignalsByTitle[candidate.title] = likedSignals;
    candidateMatchedDislikedSignalsByTitle[candidate.title] = dislikedSignals;
    finalScoreComponentsByTitle[candidate.title] = {
      ...candidate.scoreBreakdown,
      tasteScore,
      distinctiveTasteSignalCount: kidsDistinctiveTasteSignals(candidate).length,
      documentSupportedDistinctiveTasteSignalCount: kidsDistinctiveSignalsSupportedByDocument(candidate).length,
      storyAgeShape: kidsHasStoryAgeShape(candidate) ? 1 : 0,
      nonNarrativeInformationalArtifact: kidsNonNarrativeInformationalArtifact(candidate) ? 1 : 0,
      profileCoverageSignalCount: kidsCandidateCoverageSignals(candidate, profile).length,
      cleanFinalEligible: isKidsCleanFinalCandidate(candidate) ? 1 : 0,
      finalScore: candidate.score,
    };
    finalSelectionReasonByTitle[candidate.title] = selectedTitles.has(normalized(candidate.title))
      ? "selected_kids_ranked_candidate"
      : candidate.rejectedReasons.join(",") || "ranked_below_final_selection";
    candidate.diagnostics.finalSelectionReason = finalSelectionReasonByTitle[candidate.title];
    candidate.diagnostics.kidsTasteScore = tasteScore;
  }

  const meaningfulTasteEligibleTitles = rankedCandidates
    .filter((candidate) => kidsTasteScore(candidate) > 0 || (Array.isArray(candidate.matchedSignals) && candidate.matchedSignals.some((signal) => !/^avoidSignalPenalty:/i.test(String(signal)))))
    .map((candidate) => candidate.title);
  const finalEligibilityAcceptedTitles = selected
    .filter(isKidsCleanFinalCandidate)
    .map((candidate) => candidate.title);
  const selectedSuspiciousTitles = selected.filter(isKidsSuspiciousSelectionCandidate).map((candidate) => candidate.title);
  const cleanUnderfilledSlate = selected.length > 0 && finalEligibilityAcceptedTitles.length === selected.length;
  const lockQualityFailReasons: string[] = [];
  if (selected.length < 5 && !cleanUnderfilledSlate) lockQualityFailReasons.push("final_items_length_less_than_five");
  if (finalEligibilityAcceptedTitles.length < Math.min(5, selected.length || 5)) lockQualityFailReasons.push("k2_clean_items_less_than_five");
  if (selectedSuspiciousTitles.length > 0) lockQualityFailReasons.push("k2_suspicious_title_selected");

  diagnostics.rankedDocsTitles = rankedCandidates.map((candidate) => candidate.title);
  diagnostics.finalEligibilityAcceptedTitles = finalEligibilityAcceptedTitles;
  diagnostics.finalEligibilityCleanCandidateCount = finalEligibilityAcceptedTitles.length;
  diagnostics.k2CleanUnderfilledSlatePreserved = cleanUnderfilledSlate;
  diagnostics.meaningfulTasteEligibleTitles = meaningfulTasteEligibleTitles;
  diagnostics.candidateTasteMatchScoreByTitle = candidateTasteMatchScoreByTitle;
  diagnostics.candidateMatchedLikedSignalsByTitle = candidateMatchedLikedSignalsByTitle;
  diagnostics.candidateMatchedDislikedSignalsByTitle = candidateMatchedDislikedSignalsByTitle;
  diagnostics.finalScoreComponentsByTitle = finalScoreComponentsByTitle;
  diagnostics.finalSelectionReasonByTitle = finalSelectionReasonByTitle;
  diagnostics.kidsProfileCoverageSignals = kidsProfileCoverageSignals(profile);
  diagnostics.kidsSelectedProfileCoverageByTitle = Object.fromEntries(selected.map((candidate) => [candidate.title, kidsCandidateCoverageSignals(candidate, profile)]));
  diagnostics.kidsReturnedItemQualityAudit = selected.map((candidate) => kidsQualityAuditRow(candidate, selectedTitles, "selected"));
  diagnostics.kidsTopRejectedQualityAudit = rankedCandidates
    .filter((candidate) => !selectedTitles.has(normalized(candidate.title)))
    .sort((a, b) => kidsTasteScore(b) - kidsTasteScore(a) || b.score - a.score)
    .slice(0, 12)
    .map((candidate) => kidsQualityAuditRow(candidate, selectedTitles));
  diagnostics.kidsSuspiciousSelectedTitles = selectedSuspiciousTitles;
  diagnostics.kidsLockQualityFailReasons = lockQualityFailReasons;
  diagnostics.lockQualityPass = lockQualityFailReasons.length === 0;
  diagnostics.lockQualityFailReasons = lockQualityFailReasons;
}

const TEEN_OPENLIBRARY_GENERIC_TASTE_SIGNAL = /^(teen|teens|young adult|ya|fiction|novel|novels|story|stories)$/;
const TEEN_OPENLIBRARY_CONTEXT_ONLY_TASTE_SIGNAL = /^(game|games|movie|movies|film|films|tv|television|series|anime|manga|comic|comics|graphic novel|graphic novels|book|books|ebook|ebooks|audiobook|audiobooks)$/;
const TEEN_OPENLIBRARY_BROAD_SINGLE_TASTE_SIGNAL = /^(action|adventure|mystery|fantasy|drama)$/;
const TEEN_OPENLIBRARY_AUTHORITY_BOUND_TASTE_SIGNAL = /^(contemporary|realistic|coming of age|school|identity)$/;
const TEEN_OPENLIBRARY_DISTINCTIVE_TASTE_SIGNAL = /^(dystopia|dystopian|science fiction|sci fi|thriller|survival|contemporary|realistic|school|identity|horror|romance|romantic|historical|history|crime|paranormal|psychological|competition|heist|sports?|sport|coming of age)$/;
const TEEN_OPENLIBRARY_SINGLE_SIGNAL_REQUIRES_STRONG_AUTHORITY = /^(action|adventure|fantasy|mystery|drama|crime|sports?|sport|horror)$/;

type TeenOpenLibraryTasteEligibility = {
  allowed: boolean;
  reason?: string;
  signals: string[];
  nonTitleSignals: string[];
  contentSignals: string[];
  contextOnlySignals: string[];
  authoritySignals: string[];
  strongAuthoritySignals: string[];
  weakAuthoritySignals: string[];
  exactStrongAuthoritySignals: string[];
  topicalAdolescentSignals: string[];
  authorityConflictSignals: string[];
  narrativeEvidenceSignals: string[];
  meaningfulLikedContentSignals: string[];
  overlappingDislikedContentSignals: string[];
  nonOverlappingLikedContentSignals: string[];
  dislikeOverlapRatio: number;
  reliableTeenFitSignals: string[];
  weakTeenFitSignals: string[];
  adultOrCrossoverShapeReasons: string[];
  likedDislikedOverlapSignals: string[];
  narrativeFictionShape: boolean;
  nonNarrativeShapeReasons: string[];
};

function teenOpenLibraryDiagnosticSignals(candidate: ScoredCandidate, field: "metadataBackedMatchedLikedSignals" | "metadataBackedMatchedDislikedSignals"): string[] {
  const diagnosticSignals = candidate.diagnostics?.[field];
  if (Array.isArray(diagnosticSignals)) return Array.from(new Set(diagnosticSignals.map(normalized).filter(Boolean)));
  if (field === "metadataBackedMatchedLikedSignals") return middleGradesDocumentBackedTasteSignals(candidate);
  return [];
}

function teenOpenLibraryNonTitleMetadataText(candidate: ScoredCandidate): string {
  return teenOpenLibraryNonTitleMetadataValues(candidate).join(" ");
}

function teenOpenLibraryNonTitleMetadataValues(candidate: ScoredCandidate): string[] {
  const raw = (candidate.raw || {}) as Record<string, unknown>;
  return uniqueSignals([
    candidate.description,
    rawOpenLibraryDescription(raw),
    ...asStringList(raw.subject),
    ...asStringList(raw.subjects),
    ...asStringList(raw.subject_facet),
    ...asStringList(raw.subject_key),
    ...asStringList(candidate.genres),
    ...asStringList(candidate.themes),
    ...asStringList(candidate.tones),
    ...asStringList(candidate.characterDynamics),
    ...asStringList(candidate.formats),
    ...asStringList(candidate.creators),
    candidate.publicationYear,
    raw.first_publish_year,
    raw.publish_date,
    ...asStringList(raw.publisher),
    ...asStringList(raw.publishers),
    ...asStringList(raw.audience),
    ...asStringList(raw.audience_facet),
    candidate.maturityBand,
  ].map(normalized).filter(Boolean));
}

function teenOpenLibrarySeriesNumber(value: string): number {
  const normalizedValue = normalized(value);
  const wordNumbers: Record<string, number> = {
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
    eleven: 11,
    twelve: 12,
  };
  if (/^\d{1,2}$/.test(normalizedValue)) return Number(normalizedValue);
  return wordNumbers[normalizedValue] || 0;
}

function cleanTeenOpenLibrarySeriesName(value: string, fallback: string): string {
  const cleaned = normalized(value)
    .replace(/\b(the|a|an)\b/g, " ")
    .replace(/\b(series|book|volume|vol|part|number|no)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || rootTitle(fallback);
}

function teenOpenLibrarySeriesPositionFromText(value: unknown, source: string, fallbackTitle: string): TeenOpenLibrarySeriesPositionInfo | null {
  const rawText = String(value || "");
  const text = normalized(value);
  if (!text) return null;
  const rawHash = rawText.match(/([A-Za-z][A-Za-z0-9'’:\-\s]{2,70}?)#\s*(\d{1,2})\b/);
  if (rawHash) {
    const position = teenOpenLibrarySeriesNumber(rawHash[2]);
    if (position > 1) return { seriesName: cleanTeenOpenLibrarySeriesName(rawHash[1], fallbackTitle), position, source };
  }
  const namedSeries = text.match(/\b(young bond|replica)\s*(?:series\s*)?(?:book\s*)?(?:#|no|number)?\s*(\d{1,2}|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/);
  if (namedSeries) {
    const position = teenOpenLibrarySeriesNumber(namedSeries[2]);
    if (position > 1) return { seriesName: cleanTeenOpenLibrarySeriesName(namedSeries[1], fallbackTitle), position, source };
  }
  const marker = text.match(/\b([a-z][a-z0-9 ]{2,70}?)\s*(?:series\s*)?(?:#|no|number|book|volume|vol|part)\s*(\d{1,2}|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/);
  if (marker) {
    const position = teenOpenLibrarySeriesNumber(marker[2]);
    if (position > 1) return { seriesName: cleanTeenOpenLibrarySeriesName(marker[1], fallbackTitle), position, source };
  }
  const bareHash = rawText.match(/#\s*(\d{1,2})\b/);
  if (bareHash) {
    const position = teenOpenLibrarySeriesNumber(bareHash[1]);
    if (position > 1) return { seriesName: rootTitle(fallbackTitle), position, source };
  }
  if (/\b(in the sequel|sequel to|the sequel to|second installment|second book)\b/.test(text)) {
    return { seriesName: rootTitle(fallbackTitle), position: 2, source };
  }
  return null;
}

function teenOpenLibrarySeriesPositionInfo(candidate: ScoredCandidate): TeenOpenLibrarySeriesPositionInfo | null {
  if (candidate.source !== "openLibrary") return null;
  const raw = (candidate.raw || {}) as Record<string, unknown>;
  const metadataValues = [
    ...asStringList(raw.series),
    ...asStringList(raw.series_name),
    ...asStringList(raw.series_title),
    rawOpenLibraryDescription(raw),
    ...asStringList(raw.first_sentence),
  ];
  for (const value of metadataValues) {
    const info = teenOpenLibrarySeriesPositionFromText(value, "metadata", candidate.title);
    if (info) return info;
  }
  const titleValues: Array<[unknown, string]> = [
    [candidate.title, "title"],
    [candidate.subtitle, "subtitle"],
    [raw.title, "title"],
    [raw.subtitle, "subtitle"],
  ];
  for (const [value, source] of titleValues) {
    const info = teenOpenLibrarySeriesPositionFromText(value, source, candidate.title);
    if (info) return info;
  }
  return null;
}

function teenOpenLibraryLaterSeriesWeakReason(candidate: ScoredCandidate, profile: TasteProfile): string | null {
  const eligibility = teenOpenLibraryMeaningfulTasteEligibility(candidate, profile);
  const raw = (candidate.raw || {}) as Record<string, unknown>;
  const metadataText = normalized([
    teenOpenLibraryNonTitleMetadataText(candidate),
    candidate.subtitle,
    raw.subtitle,
    ...asStringList(raw.series),
  ].filter(Boolean).join(" "));
  const onlyOneGenericOrBroadSignal = eligibility.contentSignals.length === 1
    && (
      TEEN_OPENLIBRARY_SINGLE_SIGNAL_REQUIRES_STRONG_AUTHORITY.test(eligibility.contentSignals[0])
      || TEEN_OPENLIBRARY_BROAD_SINGLE_TASTE_SIGNAL.test(eligibility.contentSignals[0])
    );
  const explicitAdultSeriesShape = /\b(adult series|adult novels?|novels for adults|fiction for adults|adult fantasy|adult science fiction|adult fiction)\b/.test(metadataText);
  const strongDislikedOverlap = eligibility.overlappingDislikedContentSignals.length > 0 && eligibility.dislikeOverlapRatio >= 0.5;
  if (
    onlyOneGenericOrBroadSignal
    || eligibility.reliableTeenFitSignals.length === 0
    || eligibility.adultOrCrossoverShapeReasons.length > 0
    || explicitAdultSeriesShape
    || strongDislikedOverlap
    || eligibility.nonNarrativeShapeReasons.length > 0
  ) {
    return "teen_openlibrary_later_series_without_strong_independent_fit";
  }
  return null;
}

function annotateTeenOpenLibrarySeriesDiagnostics(candidate: ScoredCandidate, info: TeenOpenLibrarySeriesPositionInfo): void {
  candidate.diagnostics.teenOpenLibrarySeriesName = info.seriesName;
  candidate.diagnostics.teenOpenLibrarySeriesPosition = info.position;
  candidate.diagnostics.teenOpenLibrarySeriesPositionSource = info.source;
}

function uniqueSignals(values: string[]): string[] {
  return Array.from(new Set(values.map(normalized).filter(Boolean)));
}

function teenOpenLibrarySignalSupportedByNonTitleMetadata(signal: string, metadataText: string): boolean {
  const value = normalized(signal);
  if (!value) return false;
  return signalPresentInText(metadataText, value);
}

function teenOpenLibraryAuthoritySignalsFromChecks(metadataText: string, checks: Array<[string, RegExp]>): string[] {
  const authoritySignals: string[] = [];
  for (const [label, pattern] of checks) {
    if (pattern.test(metadataText)) authoritySignals.push(label);
  }
  return uniqueSignals(authoritySignals);
}

function teenOpenLibraryFieldLocalSignals(metadataValues: string[], checks: Array<[string, RegExp]>): string[] {
  const signals: string[] = [];
  for (const value of metadataValues) {
    for (const [label, pattern] of checks) {
      if (pattern.test(value)) signals.push(label);
    }
  }
  return uniqueSignals(signals);
}

function teenOpenLibraryAuthorityConflictSignals(metadataValues: string[]): string[] {
  const hasChildrenYoungAdultCatalog = metadataValues.some((value) => /\bchildren s books young adult\b|\bchildren books young adult\b|\bchildren young adult\b/.test(value));
  const hasYoungerAudienceMetadata = metadataValues.some((value) => /\b(children grades? 4 6|grades? 4 6|middle grades?|juvenile literature)\b/.test(value));
  const signals: string[] = [];
  if (hasChildrenYoungAdultCatalog && hasYoungerAudienceMetadata) signals.push("children_books_young_adult_with_younger_audience");
  return signals;
}

function teenOpenLibraryExactStrongAuthoritySignals(metadataValues: string[]): string[] {
  const authorityConflictSignals = teenOpenLibraryAuthorityConflictSignals(metadataValues);
  const values = authorityConflictSignals.includes("children_books_young_adult_with_younger_audience")
    ? metadataValues.filter((value) => !/\bchildren s books young adult\b|\bchildren books young adult\b|\bchildren young adult\b/.test(value))
    : metadataValues;
  return teenOpenLibraryFieldLocalSignals(values, [
    ["american young adult fiction", /\bamerican young adult fiction\b/],
    ["young adult fiction", /\byoung adult fiction\b/],
    ["young adult", /\byoung adult(?: literature| books?)?\b/],
    ["teen fiction", /\bteens?(?: fiction| literature| books?)\b|\bteenage(?: fiction| literature| books?)\b/],
    ["adolescent fiction", /\badolescent fiction\b|\bfiction adolescent\b/],
    ["high school fiction", /\bhigh school fiction\b|\bfiction high school\b/],
    ["boarding school fiction", /\b(boarding school|boarding schools|preparatory school|prep school) fiction\b|\bfiction (boarding school|boarding schools|preparatory school|prep school)\b/],
    ["school fiction", /\bschool(?:s| students?)? fiction\b|\bfiction school(?:s| students?)?\b/],
  ]);
}

function teenOpenLibraryStrongAuthoritySignals(metadataValues: string[]): string[] {
  return teenOpenLibraryExactStrongAuthoritySignals(metadataValues);
}

function teenOpenLibraryTopicalAdolescentSignals(metadataValues: string[]): string[] {
  return teenOpenLibraryFieldLocalSignals(metadataValues, [
    ["adolescent", /\badolescent\b/],
    ["adolescence", /\badolescence\b/],
    ["teenage", /\bteenage\b/],
  ]).filter((signal) => !teenOpenLibraryExactStrongAuthoritySignals(metadataValues).includes(`${signal} fiction`));
}

function teenOpenLibraryWeakAuthoritySignals(metadataValues: string[]): string[] {
  return teenOpenLibraryFieldLocalSignals(metadataValues, [
    ["juvenile fiction", /\bjuvenile fiction\b/],
    ["juvenile literature", /\bjuvenile literature\b/],
    ["children's fiction", /\bchildren s fiction\b|\bchildrens fiction\b|\bchildren fiction\b/],
  ]);
}

function teenOpenLibraryAuthoritySignals(metadataValues: string[]): string[] {
  return uniqueSignals([...teenOpenLibraryStrongAuthoritySignals(metadataValues), ...teenOpenLibraryWeakAuthoritySignals(metadataValues)]);
}

function teenOpenLibraryReliableTeenFitSignals(metadataValues: string[], metadataText: string): string[] {
  const exactReliableAuthority = teenOpenLibraryExactStrongAuthoritySignals(metadataValues)
    .filter((signal) => signal !== "young adult");
  const audienceSignals = teenOpenLibraryFieldLocalSignals(metadataValues, [
    ["audience ages 12 and up", /\baudience ages? 1[2-8](?: and up)?\b|\bages? 1[2-8](?: and up)?\b/],
    ["teen grade audience", /\b(grades?|reading level grade) (7|8|9|10|11|12)\b/],
  ]);
  const imprintSignals = teenOpenLibraryFieldLocalSignals(metadataValues, [
    ["tor teen", /\btor teen\b/],
    ["simon pulse", /\bsimon pulse\b/],
    ["books for young readers", /\bbooks for young readers\b/],
    ["young listeners", /\byoung listeners\b/],
    ["teen imprint", /\b(teen|young adult) (imprint|publisher|publication)\b/],
  ]);
  const descriptionSignals: string[] = [];
  if (/\b(ya|young adult|teen) (debut|novel|fiction|fantasy|romance|thriller|mystery|horror)\b/.test(metadataText)) {
    descriptionSignals.push("description teen fiction");
  }
  return uniqueSignals([...exactReliableAuthority, ...audienceSignals, ...imprintSignals, ...descriptionSignals]);
}

function teenOpenLibraryWeakTeenFitSignals(metadataValues: string[], metadataText: string): string[] {
  const signals: string[] = [];
  if (teenOpenLibraryExactStrongAuthoritySignals(metadataValues).includes("young adult")) signals.push("bare young adult");
  signals.push(...teenOpenLibraryWeakAuthoritySignals(metadataValues));
  signals.push(...teenOpenLibraryTopicalAdolescentSignals(metadataValues));
  if (/\bteenager|teenage protagonist|teenage girl|teenage boy|teenage heroes?\b/.test(metadataText)) signals.push("teenage protagonist");
  signals.push(...teenOpenLibraryAuthorityConflictSignals(metadataValues));
  return uniqueSignals(signals);
}

function teenOpenLibraryAdultOrCrossoverShapeReasons(metadataText: string): string[] {
  const reasons: string[] = [];
  if (/\b(adult romance|contemporary adult romance|adult fiction)\b/.test(metadataText) && /\bromance\b/.test(metadataText)) {
    reasons.push("adult_romance_shape");
  }
  if (/\b(dark romance|mafia|underworld|arranged marriage|enemies to lovers)\b/.test(metadataText) && /\bromance\b/.test(metadataText)) {
    reasons.push("adult_or_crossover_romance_shape");
  }
  if (/\b(erotica|erotic|explicit sexual|sexual content|fornicat)\b/.test(metadataText)) {
    reasons.push("explicit_or_erotic_content_shape");
  }
  if (/\b(adult fantasy|adult science fiction|adult sci fi)\b/.test(metadataText)) {
    reasons.push("adult_genre_classification");
  }
  if (/\b(drunk|drunken|getting high|gets high|partying|intoxication|intoxicated)\b/.test(metadataText)) {
    reasons.push("mature_intoxication_partying_shape");
  }
  if (/\b(harlequin|carina press|mills boon)\b/.test(metadataText) && /\bromance\b/.test(metadataText)) {
    reasons.push("adult_romance_publisher_shape");
  }
  return uniqueSignals(reasons);
}

function teenOpenLibraryNarrativeEvidenceSignals(metadataValues: string[]): string[] {
  return teenOpenLibraryFieldLocalSignals(metadataValues, [
    ["young adult fiction", /\byoung adult fiction\b/],
    ["american young adult fiction", /\bamerican young adult fiction\b/],
    ["juvenile fiction", /\bjuvenile fiction\b/],
    ["teen fiction", /\bteen fiction\b/],
    ["adolescent fiction", /\badolescent fiction\b/],
    ["high school fiction", /\bhigh school fiction\b/],
    ["boarding school fiction", /\bboarding school fiction\b/],
    ["school fiction", /\bschool fiction\b/],
    ["fiction", /\bfiction\b/],
    ["novel", /\bnovels?\b/],
    ["stories", /\bstories\b/],
    ["horror stories", /\bhorror (stories|tales)\b/],
    ["fantasy fiction", /\bfantasy fiction\b/],
    ["science fiction", /\bscience fiction\b/],
    ["romance fiction", /\bromance fiction\b/],
    ["mystery fiction", /\bmystery fiction\b/],
    ["dystopian fiction", /\bdystopian fiction\b/],
    ["thriller suspense", /\bthrillers? and suspense\b/],
  ]);
}

function teenOpenLibraryNarrativeFictionShape(metadataValues: string[]): boolean {
  return teenOpenLibraryNarrativeEvidenceSignals(metadataValues).length > 0;
}

function teenOpenLibraryNonNarrativeShapeReasons(metadataText: string, hasTeenAuthority: boolean): string[] {
  const reasons: string[] = [];
  const checks: Array<[string, RegExp]> = [
    ["study_guide", /\bstudy guides?\b/],
    ["analysis", /\b(analysis|analyses|literary analysis|critical analysis|analysis of)\b/],
    ["criticism", /\b(criticism|critical studies?|critical essays?|literary criticism)\b/],
    ["workbook", /\bworkbooks?\b/],
    ["activity_book", /\b(activity books?|activities)\b/],
    ["puzzle_book", /\b(picture puzzles?|puzzle books?|puzzles)\b/],
    ["game_book", /\b(game books?|adventure games?|role playing games?|role playing guide|rpg guide|game guide)\b/],
    ["strategy_guide", /\b(strategy guides?|walkthroughs?)\b/],
    ["teacher_guide", /\b(teacher s guide|teacher guide|teaching guide|lesson plans?)\b/],
    ["curriculum", /\bcurricul(?:um|a)\b/],
    ["poetry_collection", /\b(poetry collection|poems|sports poetry|poetry anthology)\b/],
    ["essays", /\b(essays?|essay collections?)\b/],
    ["bibliography", /\bbibliograph(?:y|ies|ic)\b/],
    ["informational_literature", /\binformational literature\b/],
  ];
  for (const [label, pattern] of checks) {
    if (pattern.test(metadataText)) reasons.push(label);
  }
  if (/\b(anecdotes?|facetiae|satire etc)\b/.test(metadataText) && /\bsports?\b/.test(metadataText)) {
    reasons.push("sports_anecdotes_facetiae_collection");
  }
  if (/\bjuvenile literature\b/.test(metadataText) && /\b(sports?)\b/.test(metadataText) && /\b(anecdotes?|facetiae|humou?r|children grades? 4 6|general)\b/.test(metadataText)) {
    reasons.push("juvenile_sports_informational_literature");
  }
  if (/\bjuvenile literature\b/.test(metadataText) && /\b(nature|natural world|history|informational|environmental literature|culture)\b/.test(metadataText)) {
    reasons.push("juvenile_informational_literature");
  }
  const hasCollectionShape = /\b(antholog(?:y|ies)|collections?|collected works|writings|readings|essays?)\b/.test(metadataText);
  const hasClearNarrativeCollectionShape = /\b(short stories|fiction anthology|fiction collection|story collection|novel|novels|juvenile fiction|young adult fiction|teen fiction)\b/.test(metadataText);
  if (hasCollectionShape && !hasClearNarrativeCollectionShape) {
    reasons.push("nonfiction_or_unspecified_collection");
  }
  if (/\b(nature writing|natural world|cultural studies|environmental literature)\b/.test(metadataText) && (hasCollectionShape || /\b(nonfiction|non fiction|literature)\b/.test(metadataText))) {
    reasons.push("nature_culture_nonfiction_collection");
  }
  if (!hasTeenAuthority && /\b(classic literature|classics|literary|english literature|open syllabus|penguin popular classics|modern library|viking adult|adult fiction)\b/.test(metadataText) && /\b(fiction|novel|literature)\b/.test(metadataText)) {
    reasons.push("adult_classic_literary_shape_without_teen_authority");
  }
  if (!hasTeenAuthority && /\b(harlequin|carina press|mills boon|adult fiction|erotica|erotic stories|m m romance|gay romance|contemporary romance)\b/.test(metadataText) && /\bromance\b/.test(metadataText)) {
    reasons.push("adult_romance_shape_without_teen_authority");
  }
  if (!hasTeenAuthority && /\b(prepper|prepping)\b/.test(metadataText) && /\b(apocalypse|apocalyptic|post apocalyptic|survival)\b/.test(metadataText)) {
    reasons.push("generic_prepper_apocalypse_shape");
  }
  return uniqueSignals(reasons);
}

function teenOpenLibraryMeaningfulTasteEligibility(candidate: ScoredCandidate, profile: TasteProfile): TeenOpenLibraryTasteEligibility {
  if (profile.ageBand !== "teens" || candidate.source !== "openLibrary") {
    return { allowed: true, signals: [], nonTitleSignals: [], contentSignals: [], contextOnlySignals: [], authoritySignals: [], strongAuthoritySignals: [], weakAuthoritySignals: [], exactStrongAuthoritySignals: [], topicalAdolescentSignals: [], authorityConflictSignals: [], narrativeEvidenceSignals: [], meaningfulLikedContentSignals: [], overlappingDislikedContentSignals: [], nonOverlappingLikedContentSignals: [], dislikeOverlapRatio: 0, reliableTeenFitSignals: [], weakTeenFitSignals: [], adultOrCrossoverShapeReasons: [], likedDislikedOverlapSignals: [], narrativeFictionShape: false, nonNarrativeShapeReasons: [] };
  }
  const positiveTasteScore = Number(candidate.diagnostics?.positiveTasteScore ?? (Number(candidate.scoreBreakdown?.genreFacetMatch || 0) + Number(candidate.scoreBreakdown?.positiveTasteMatch || 0)));
  const likedSignals = teenOpenLibraryDiagnosticSignals(candidate, "metadataBackedMatchedLikedSignals");
  const dislikedSignals = teenOpenLibraryDiagnosticSignals(candidate, "metadataBackedMatchedDislikedSignals");
  const nonTitleMetadataValues = teenOpenLibraryNonTitleMetadataValues(candidate);
  const nonTitleMetadataText = teenOpenLibraryNonTitleMetadataText(candidate);
  const exactStrongAuthoritySignals = teenOpenLibraryExactStrongAuthoritySignals(nonTitleMetadataValues);
  const topicalAdolescentSignals = teenOpenLibraryTopicalAdolescentSignals(nonTitleMetadataValues);
  const authorityConflictSignals = teenOpenLibraryAuthorityConflictSignals(nonTitleMetadataValues);
  const strongAuthoritySignals = teenOpenLibraryStrongAuthoritySignals(nonTitleMetadataValues);
  const weakAuthoritySignals = teenOpenLibraryWeakAuthoritySignals(nonTitleMetadataValues);
  const authoritySignals = uniqueSignals([...strongAuthoritySignals, ...weakAuthoritySignals]);
  const hasTeenAuthority = authoritySignals.length > 0;
  const narrativeEvidenceSignals = teenOpenLibraryNarrativeEvidenceSignals(nonTitleMetadataValues);
  const narrativeFictionShape = teenOpenLibraryNarrativeFictionShape(nonTitleMetadataValues);
  const reliableTeenFitSignals = teenOpenLibraryReliableTeenFitSignals(nonTitleMetadataValues, nonTitleMetadataText);
  const weakTeenFitSignals = teenOpenLibraryWeakTeenFitSignals(nonTitleMetadataValues, nonTitleMetadataText);
  const adultOrCrossoverShapeReasons = teenOpenLibraryAdultOrCrossoverShapeReasons(nonTitleMetadataText);
  const hasReliableTeenFit = reliableTeenFitSignals.length > 0;
  const nonNarrativeShapeReasons = teenOpenLibraryNonNarrativeShapeReasons(nonTitleMetadataText, hasTeenAuthority);
  const baseResult = {
    signals: likedSignals,
    nonTitleSignals: [] as string[],
    contentSignals: [] as string[],
    contextOnlySignals: [] as string[],
    authoritySignals,
    strongAuthoritySignals,
    weakAuthoritySignals,
    exactStrongAuthoritySignals,
    topicalAdolescentSignals,
    authorityConflictSignals,
    narrativeEvidenceSignals,
    meaningfulLikedContentSignals: [] as string[],
    overlappingDislikedContentSignals: [] as string[],
    nonOverlappingLikedContentSignals: [] as string[],
    dislikeOverlapRatio: 0,
    reliableTeenFitSignals,
    weakTeenFitSignals,
    adultOrCrossoverShapeReasons,
    likedDislikedOverlapSignals: [] as string[],
    narrativeFictionShape,
    nonNarrativeShapeReasons,
  };
  if (positiveTasteScore <= 0) return { allowed: false, reason: "teen_openlibrary_no_positive_metadata_taste", ...baseResult };
  if (!likedSignals.length) return { allowed: false, reason: "teen_openlibrary_no_metadata_liked_signals", ...baseResult };

  const nonTitleLikedSignals = uniqueSignals(likedSignals.filter((signal) => teenOpenLibrarySignalSupportedByNonTitleMetadata(signal, nonTitleMetadataText)));
  const contextOnlySignals = nonTitleLikedSignals.filter((signal) => TEEN_OPENLIBRARY_CONTEXT_ONLY_TASTE_SIGNAL.test(signal));
  const contentSignals = nonTitleLikedSignals.filter((signal) => !TEEN_OPENLIBRARY_GENERIC_TASTE_SIGNAL.test(signal) && !TEEN_OPENLIBRARY_CONTEXT_ONLY_TASTE_SIGNAL.test(signal));
  const dislikedNonTitleSignals = uniqueSignals(dislikedSignals
    .filter((signal) => !TEEN_OPENLIBRARY_GENERIC_TASTE_SIGNAL.test(signal) && !TEEN_OPENLIBRARY_CONTEXT_ONLY_TASTE_SIGNAL.test(signal))
    .filter((signal) => teenOpenLibrarySignalSupportedByNonTitleMetadata(signal, nonTitleMetadataText)));
  const dislikedContentSignalSet = new Set(dislikedNonTitleSignals);
  const likedDislikedOverlapSignals = contentSignals.filter((signal) => dislikedContentSignalSet.has(signal));
  const nonOverlappingLikedContentSignals = contentSignals.filter((signal) => !dislikedContentSignalSet.has(signal));
  const dislikeOverlapRatio = contentSignals.length > 0 ? likedDislikedOverlapSignals.length / contentSignals.length : 0;
  const resultEvidence = {
    signals: likedSignals,
    nonTitleSignals: nonTitleLikedSignals,
    contentSignals,
    contextOnlySignals,
    authoritySignals,
    strongAuthoritySignals,
    weakAuthoritySignals,
    exactStrongAuthoritySignals,
    topicalAdolescentSignals,
    authorityConflictSignals,
    narrativeEvidenceSignals,
    meaningfulLikedContentSignals: contentSignals,
    overlappingDislikedContentSignals: likedDislikedOverlapSignals,
    nonOverlappingLikedContentSignals,
    dislikeOverlapRatio,
    reliableTeenFitSignals,
    weakTeenFitSignals,
    adultOrCrossoverShapeReasons,
    likedDislikedOverlapSignals,
    narrativeFictionShape,
    nonNarrativeShapeReasons,
  };
  if (nonNarrativeShapeReasons.length > 0) return { allowed: false, reason: "teen_openlibrary_non_narrative_or_adult_shape", ...resultEvidence };
  if (!contentSignals.length) return { allowed: false, reason: nonTitleLikedSignals.length ? "teen_openlibrary_context_or_generic_only_metadata_taste" : "teen_openlibrary_title_only_metadata_taste", ...resultEvidence };
  if (contentSignals.length === 1 && likedDislikedOverlapSignals.includes(contentSignals[0])) {
    return { allowed: false, reason: "teen_openlibrary_single_signal_negated_by_dislike", ...resultEvidence };
  }
  if (contentSignals.length >= 2 && dislikeOverlapRatio >= 0.5 && !hasReliableTeenFit) {
    return { allowed: false, reason: "teen_openlibrary_multi_signal_mostly_negated_without_reliable_teen_fit", ...resultEvidence };
  }

  const distinctiveSignals = contentSignals.filter((signal) => TEEN_OPENLIBRARY_DISTINCTIVE_TASTE_SIGNAL.test(signal) && (!TEEN_OPENLIBRARY_AUTHORITY_BOUND_TASTE_SIGNAL.test(signal) || (hasTeenAuthority && narrativeFictionShape)));
  const broadSignals = contentSignals.filter((signal) => TEEN_OPENLIBRARY_BROAD_SINGLE_TASTE_SIGNAL.test(signal));
  const authorityBoundSignals = contentSignals.filter((signal) => TEEN_OPENLIBRARY_AUTHORITY_BOUND_TASTE_SIGNAL.test(signal));
  const singleSignalRequiresStrongAuthority = contentSignals.length === 1 && TEEN_OPENLIBRARY_SINGLE_SIGNAL_REQUIRES_STRONG_AUTHORITY.test(contentSignals[0]);
  if (singleSignalRequiresStrongAuthority && !(narrativeFictionShape && hasReliableTeenFit)) {
    return { allowed: false, reason: "teen_openlibrary_single_generic_signal_without_strong_authority", ...resultEvidence };
  }
  const hasSingleBroadOrBorderlineAuthorityFallback =
    narrativeFictionShape
    && hasReliableTeenFit
    && (
      broadSignals.length >= 1
      || authorityBoundSignals.length >= 1
    );
  const hasAllowedTasteEvidence = distinctiveSignals.length > 0 || broadSignals.length >= 2 || hasSingleBroadOrBorderlineAuthorityFallback;
  if (!hasAllowedTasteEvidence) return { allowed: false, reason: "teen_openlibrary_single_broad_metadata_taste", ...resultEvidence };

  const preciseAvoidMagnitude = Math.abs(Number(candidate.scoreBreakdown?.avoidSignalPenalty || 0));
  if (dislikedNonTitleSignals.length > 0 && preciseAvoidMagnitude > positiveTasteScore && dislikedNonTitleSignals.length >= contentSignals.length) {
    return { allowed: false, reason: "teen_openlibrary_disliked_metadata_outweighs_liked", ...resultEvidence };
  }

  return { allowed: true, ...resultEvidence };
}

function addTeenOpenLibrarySelectionObservability(rankedCandidates: ScoredCandidate[], selected: ScoredCandidate[], rejectedReasons: Record<string, number>, profile: TasteProfile): void {
  if (profile.ageBand !== "teens" || !rankedCandidates.some((candidate) => candidate.source === "openLibrary")) return;
  const diagnostics = rejectedReasons as Record<string, unknown>;
  const selectedTitles = new Set(selected.map((candidate) => normalized(candidate.title)));
  const metadataBackedLikedSignalsByTitle: Record<string, string[]> = {};
  const metadataBackedDislikedSignalsByTitle: Record<string, string[]> = {};
  const teenOpenLibraryNonTitleLikedSignalsByTitle: Record<string, string[]> = {};
  const teenOpenLibraryContentSignals: Record<string, string[]> = {};
  const teenOpenLibraryContextOnlySignals: Record<string, string[]> = {};
  const teenOpenLibraryAuthoritySignals: Record<string, string[]> = {};
  const teenOpenLibraryStrongAuthoritySignals: Record<string, string[]> = {};
  const teenOpenLibraryWeakAuthoritySignals: Record<string, string[]> = {};
  const teenOpenLibraryExactStrongAuthoritySignals: Record<string, string[]> = {};
  const teenOpenLibraryTopicalAdolescentSignals: Record<string, string[]> = {};
  const teenOpenLibraryAuthorityConflictSignals: Record<string, string[]> = {};
  const teenOpenLibraryLikedDislikedOverlapSignals: Record<string, string[]> = {};
  const teenOpenLibraryNarrativeEvidenceSignals: Record<string, string[]> = {};
  const teenOpenLibraryMeaningfulLikedContentSignals: Record<string, string[]> = {};
  const teenOpenLibraryOverlappingDislikedContentSignals: Record<string, string[]> = {};
  const teenOpenLibraryNonOverlappingLikedContentSignals: Record<string, string[]> = {};
  const teenOpenLibraryDislikeOverlapRatio: Record<string, number> = {};
  const teenOpenLibraryReliableTeenFitSignals: Record<string, string[]> = {};
  const teenOpenLibraryWeakTeenFitSignals: Record<string, string[]> = {};
  const teenOpenLibraryAdultOrCrossoverShapeReasons: Record<string, string[]> = {};
  const teenOpenLibraryNarrativeFictionShape: Record<string, boolean> = {};
  const teenOpenLibraryNonNarrativeShapeReasons: Record<string, string[]> = {};
  const teenOpenLibrarySeriesNameByTitle: Record<string, string> = {};
  const teenOpenLibrarySeriesPositionByTitle: Record<string, number> = {};
  const teenOpenLibrarySeriesPositionSourceByTitle: Record<string, string> = {};
  const teenOpenLibraryLaterSeriesDeferredTitles: string[] = [];
  const teenOpenLibraryLaterSeriesAcceptedAfterUnderfillTitles: string[] = [];
  const teenOpenLibraryLaterSeriesRejectedByReason: Record<string, string[]> = {};
  const documentBackedTasteSignalsByTitle: Record<string, string[]> = {};
  const positiveTasteScoreByTitle: Record<string, number> = {};
  const teenOpenLibraryEligibilityAllowedByTitle: Record<string, boolean> = {};
  const teenOpenLibraryEligibilityReasonByTitle: Record<string, string> = {};
  const finalEligibilityRejectedTitlesByReason: Record<string, string[]> = {};
  const finalScoreComponentsByTitle: Record<string, Record<string, number>> = {};
  const finalRankingReasonByTitle: Record<string, string> = {};
  const finalEligibilityAcceptedTitles: string[] = [];
  const meaningfulTasteEligibleTitles: string[] = [];

  for (const candidate of rankedCandidates.filter((row) => row.source === "openLibrary")) {
    const eligibility = teenOpenLibraryMeaningfulTasteEligibility(candidate, profile);
    const seriesPositionInfo = teenOpenLibrarySeriesPositionInfo(candidate);
    if (seriesPositionInfo) {
      annotateTeenOpenLibrarySeriesDiagnostics(candidate, seriesPositionInfo);
      teenOpenLibrarySeriesNameByTitle[candidate.title] = seriesPositionInfo.seriesName;
      teenOpenLibrarySeriesPositionByTitle[candidate.title] = seriesPositionInfo.position;
      teenOpenLibrarySeriesPositionSourceByTitle[candidate.title] = seriesPositionInfo.source;
    }
    if (candidate.rejectedReasons.includes("teen_openlibrary_later_series_deferred")) {
      teenOpenLibraryLaterSeriesDeferredTitles.push(candidate.title);
    }
    if (candidate.rejectedReasons.includes("teen_openlibrary_later_series_accepted_after_underfill")) {
      teenOpenLibraryLaterSeriesAcceptedAfterUnderfillTitles.push(candidate.title);
    }
    if (candidate.rejectedReasons.includes("teen_openlibrary_later_series_without_strong_independent_fit")) {
      teenOpenLibraryLaterSeriesRejectedByReason.teen_openlibrary_later_series_without_strong_independent_fit = uniqueSignals([
        ...(teenOpenLibraryLaterSeriesRejectedByReason.teen_openlibrary_later_series_without_strong_independent_fit || []),
        candidate.title,
      ]);
    }
    const positiveTasteScore = Number(candidate.diagnostics?.positiveTasteScore ?? (Number(candidate.scoreBreakdown?.genreFacetMatch || 0) + Number(candidate.scoreBreakdown?.positiveTasteMatch || 0)));
    const nonTitleMetadataText = teenOpenLibraryNonTitleMetadataText(candidate);
    const nonTitleDislikedSignals = teenOpenLibraryDiagnosticSignals(candidate, "metadataBackedMatchedDislikedSignals")
      .filter((signal) => !TEEN_OPENLIBRARY_GENERIC_TASTE_SIGNAL.test(signal) && !TEEN_OPENLIBRARY_CONTEXT_ONLY_TASTE_SIGNAL.test(signal))
      .filter((signal) => teenOpenLibrarySignalSupportedByNonTitleMetadata(signal, nonTitleMetadataText));
    metadataBackedLikedSignalsByTitle[candidate.title] = eligibility.signals;
    metadataBackedDislikedSignalsByTitle[candidate.title] = teenOpenLibraryDiagnosticSignals(candidate, "metadataBackedMatchedDislikedSignals");
    teenOpenLibraryNonTitleLikedSignalsByTitle[candidate.title] = eligibility.nonTitleSignals;
    teenOpenLibraryContentSignals[candidate.title] = eligibility.contentSignals;
    teenOpenLibraryContextOnlySignals[candidate.title] = eligibility.contextOnlySignals;
    teenOpenLibraryAuthoritySignals[candidate.title] = eligibility.authoritySignals;
    teenOpenLibraryStrongAuthoritySignals[candidate.title] = eligibility.strongAuthoritySignals;
    teenOpenLibraryWeakAuthoritySignals[candidate.title] = eligibility.weakAuthoritySignals;
    teenOpenLibraryExactStrongAuthoritySignals[candidate.title] = eligibility.exactStrongAuthoritySignals;
    teenOpenLibraryTopicalAdolescentSignals[candidate.title] = eligibility.topicalAdolescentSignals;
    teenOpenLibraryAuthorityConflictSignals[candidate.title] = eligibility.authorityConflictSignals;
    teenOpenLibraryLikedDislikedOverlapSignals[candidate.title] = eligibility.likedDislikedOverlapSignals;
    teenOpenLibraryNarrativeEvidenceSignals[candidate.title] = eligibility.narrativeEvidenceSignals;
    teenOpenLibraryMeaningfulLikedContentSignals[candidate.title] = eligibility.meaningfulLikedContentSignals;
    teenOpenLibraryOverlappingDislikedContentSignals[candidate.title] = eligibility.overlappingDislikedContentSignals;
    teenOpenLibraryNonOverlappingLikedContentSignals[candidate.title] = eligibility.nonOverlappingLikedContentSignals;
    teenOpenLibraryDislikeOverlapRatio[candidate.title] = Math.round(eligibility.dislikeOverlapRatio * 1000) / 1000;
    teenOpenLibraryReliableTeenFitSignals[candidate.title] = eligibility.reliableTeenFitSignals;
    teenOpenLibraryWeakTeenFitSignals[candidate.title] = eligibility.weakTeenFitSignals;
    teenOpenLibraryAdultOrCrossoverShapeReasons[candidate.title] = eligibility.adultOrCrossoverShapeReasons;
    teenOpenLibraryNarrativeFictionShape[candidate.title] = eligibility.narrativeFictionShape;
    teenOpenLibraryNonNarrativeShapeReasons[candidate.title] = eligibility.nonNarrativeShapeReasons;
    documentBackedTasteSignalsByTitle[candidate.title] = eligibility.contentSignals;
    positiveTasteScoreByTitle[candidate.title] = Math.round(positiveTasteScore * 1000) / 1000;
    teenOpenLibraryEligibilityAllowedByTitle[candidate.title] = eligibility.allowed;
    teenOpenLibraryEligibilityReasonByTitle[candidate.title] = eligibility.allowed
      ? selectedTitles.has(normalized(candidate.title)) ? "selected_clean_teen_openlibrary_candidate" : "eligible_not_selected"
      : eligibility.reason || "teen_openlibrary_no_meaningful_metadata_taste";
    finalScoreComponentsByTitle[candidate.title] = {
      ...candidate.scoreBreakdown,
      positiveTasteScore,
      sourceQualityScore: Number(candidate.diagnostics?.sourceQualityScore || candidate.scoreBreakdown?.sourceQualityRelevance || 0),
      queryRungBonus: Number(candidate.diagnostics?.queryRungBonus || candidate.scoreBreakdown?.queryRungBonus || 0),
      finalScore: candidate.score,
      teenOpenLibraryFinalEligible: eligibility.allowed ? 1 : 0,
      teenOpenLibraryAuthoritySignalCount: eligibility.authoritySignals.length,
      teenOpenLibraryStrongAuthoritySignalCount: eligibility.strongAuthoritySignals.length,
      teenOpenLibraryWeakAuthoritySignalCount: eligibility.weakAuthoritySignals.length,
      teenOpenLibraryExactStrongAuthoritySignalCount: eligibility.exactStrongAuthoritySignals.length,
      teenOpenLibraryTopicalAdolescentSignalCount: eligibility.topicalAdolescentSignals.length,
      teenOpenLibraryAuthorityConflictSignalCount: eligibility.authorityConflictSignals.length,
      teenOpenLibraryLikedDislikedOverlapSignalCount: eligibility.likedDislikedOverlapSignals.length,
      teenOpenLibraryNarrativeEvidenceSignalCount: eligibility.narrativeEvidenceSignals.length,
      teenOpenLibraryDislikeOverlapRatio: Math.round(eligibility.dislikeOverlapRatio * 1000) / 1000,
      teenOpenLibraryReliableTeenFitSignalCount: eligibility.reliableTeenFitSignals.length,
      teenOpenLibraryWeakTeenFitSignalCount: eligibility.weakTeenFitSignals.length,
      teenOpenLibraryAdultOrCrossoverShapeCount: eligibility.adultOrCrossoverShapeReasons.length,
      teenOpenLibraryNarrativeFictionShape: eligibility.narrativeFictionShape ? 1 : 0,
      teenOpenLibraryNonNarrativeShapeCount: eligibility.nonNarrativeShapeReasons.length,
    };
    finalRankingReasonByTitle[candidate.title] = selectedTitles.has(normalized(candidate.title))
      ? "selected_clean_teen_openlibrary_candidate"
      : candidate.rejectedReasons.join(",") || teenOpenLibraryEligibilityReasonByTitle[candidate.title] || "ranked_below_final_selection";
    candidate.diagnostics.teenOpenLibraryFinalEligibilityAllowed = eligibility.allowed;
    candidate.diagnostics.teenOpenLibraryFinalEligibilityReason = teenOpenLibraryEligibilityReasonByTitle[candidate.title];
    candidate.diagnostics.teenOpenLibraryNonTitleTasteSignals = eligibility.nonTitleSignals;
    candidate.diagnostics.teenOpenLibraryContentSignals = eligibility.contentSignals;
    candidate.diagnostics.teenOpenLibraryContextOnlySignals = eligibility.contextOnlySignals;
    candidate.diagnostics.teenOpenLibraryAuthoritySignals = eligibility.authoritySignals;
    candidate.diagnostics.teenOpenLibraryStrongAuthoritySignals = eligibility.strongAuthoritySignals;
    candidate.diagnostics.teenOpenLibraryWeakAuthoritySignals = eligibility.weakAuthoritySignals;
    candidate.diagnostics.teenOpenLibraryExactStrongAuthoritySignals = eligibility.exactStrongAuthoritySignals;
    candidate.diagnostics.teenOpenLibraryTopicalAdolescentSignals = eligibility.topicalAdolescentSignals;
    candidate.diagnostics.teenOpenLibraryAuthorityConflictSignals = eligibility.authorityConflictSignals;
    candidate.diagnostics.teenOpenLibraryLikedDislikedOverlapSignals = eligibility.likedDislikedOverlapSignals;
    candidate.diagnostics.teenOpenLibraryNarrativeEvidenceSignals = eligibility.narrativeEvidenceSignals;
    candidate.diagnostics.teenOpenLibraryMeaningfulLikedContentSignals = eligibility.meaningfulLikedContentSignals;
    candidate.diagnostics.teenOpenLibraryOverlappingDislikedContentSignals = eligibility.overlappingDislikedContentSignals;
    candidate.diagnostics.teenOpenLibraryNonOverlappingLikedContentSignals = eligibility.nonOverlappingLikedContentSignals;
    candidate.diagnostics.teenOpenLibraryDislikeOverlapRatio = eligibility.dislikeOverlapRatio;
    candidate.diagnostics.teenOpenLibraryReliableTeenFitSignals = eligibility.reliableTeenFitSignals;
    candidate.diagnostics.teenOpenLibraryWeakTeenFitSignals = eligibility.weakTeenFitSignals;
    candidate.diagnostics.teenOpenLibraryAdultOrCrossoverShapeReasons = eligibility.adultOrCrossoverShapeReasons;
    candidate.diagnostics.teenOpenLibraryNarrativeFictionShape = eligibility.narrativeFictionShape;
    candidate.diagnostics.teenOpenLibraryNonNarrativeShapeReasons = eligibility.nonNarrativeShapeReasons;
    candidate.diagnostics.teenOpenLibraryNonTitleDislikedSignals = nonTitleDislikedSignals;
    if (eligibility.allowed) meaningfulTasteEligibleTitles.push(candidate.title);
    else {
      const reason = eligibility.reason || "teen_openlibrary_no_meaningful_metadata_taste";
      finalEligibilityRejectedTitlesByReason[reason] = [...(finalEligibilityRejectedTitlesByReason[reason] || []), candidate.title];
    }
    if (eligibility.allowed && selectedTitles.has(normalized(candidate.title))) finalEligibilityAcceptedTitles.push(candidate.title);
  }

  diagnostics.metadataBackedLikedSignalsByTitle = metadataBackedLikedSignalsByTitle;
  diagnostics.metadataBackedDislikedSignalsByTitle = metadataBackedDislikedSignalsByTitle;
  diagnostics.teenOpenLibraryNonTitleLikedSignalsByTitle = teenOpenLibraryNonTitleLikedSignalsByTitle;
  diagnostics.teenOpenLibraryContentSignals = teenOpenLibraryContentSignals;
  diagnostics.teenOpenLibraryContextOnlySignals = teenOpenLibraryContextOnlySignals;
  diagnostics.teenOpenLibraryAuthoritySignals = teenOpenLibraryAuthoritySignals;
  diagnostics.teenOpenLibraryStrongAuthoritySignals = teenOpenLibraryStrongAuthoritySignals;
  diagnostics.teenOpenLibraryWeakAuthoritySignals = teenOpenLibraryWeakAuthoritySignals;
  diagnostics.teenOpenLibraryExactStrongAuthoritySignals = teenOpenLibraryExactStrongAuthoritySignals;
  diagnostics.teenOpenLibraryTopicalAdolescentSignals = teenOpenLibraryTopicalAdolescentSignals;
  diagnostics.teenOpenLibraryAuthorityConflictSignals = teenOpenLibraryAuthorityConflictSignals;
  diagnostics.teenOpenLibraryLikedDislikedOverlapSignals = teenOpenLibraryLikedDislikedOverlapSignals;
  diagnostics.teenOpenLibraryNarrativeEvidenceSignals = teenOpenLibraryNarrativeEvidenceSignals;
  diagnostics.teenOpenLibraryMeaningfulLikedContentSignals = teenOpenLibraryMeaningfulLikedContentSignals;
  diagnostics.teenOpenLibraryOverlappingDislikedContentSignals = teenOpenLibraryOverlappingDislikedContentSignals;
  diagnostics.teenOpenLibraryNonOverlappingLikedContentSignals = teenOpenLibraryNonOverlappingLikedContentSignals;
  diagnostics.teenOpenLibraryDislikeOverlapRatio = teenOpenLibraryDislikeOverlapRatio;
  diagnostics.teenOpenLibraryReliableTeenFitSignals = teenOpenLibraryReliableTeenFitSignals;
  diagnostics.teenOpenLibraryWeakTeenFitSignals = teenOpenLibraryWeakTeenFitSignals;
  diagnostics.teenOpenLibraryAdultOrCrossoverShapeReasons = teenOpenLibraryAdultOrCrossoverShapeReasons;
  diagnostics.teenOpenLibraryNarrativeFictionShape = teenOpenLibraryNarrativeFictionShape;
  diagnostics.teenOpenLibraryNonNarrativeShapeReasons = teenOpenLibraryNonNarrativeShapeReasons;
  diagnostics.teenOpenLibrarySeriesNameByTitle = teenOpenLibrarySeriesNameByTitle;
  diagnostics.teenOpenLibrarySeriesPositionByTitle = teenOpenLibrarySeriesPositionByTitle;
  diagnostics.teenOpenLibrarySeriesPositionSourceByTitle = teenOpenLibrarySeriesPositionSourceByTitle;
  diagnostics.teenOpenLibraryLaterSeriesDeferredTitles = uniqueSignals(teenOpenLibraryLaterSeriesDeferredTitles);
  diagnostics.teenOpenLibraryLaterSeriesAcceptedAfterUnderfillTitles = uniqueSignals(teenOpenLibraryLaterSeriesAcceptedAfterUnderfillTitles);
  diagnostics.teenOpenLibraryLaterSeriesRejectedByReason = teenOpenLibraryLaterSeriesRejectedByReason;
}

function teenGoogleBooksSignalFieldMatches(candidate: ScoredCandidate, signal: string): string[] {
  const raw = (candidate.raw || {}) as Record<string, unknown>;
  const volumeInfo = raw.volumeInfo && typeof raw.volumeInfo === "object"
    ? raw.volumeInfo as Record<string, unknown>
    : {};
  const fields: Array<[string, string[]]> = [
    ["title", [candidate.title]],
    ["subtitle", [candidate.subtitle || String(raw.subtitle || "")]],
    ["description", [candidate.description || String(raw.description || ""), String(volumeInfo.description || "")]],
    ["categories", [
      ...candidate.genres,
      ...(Array.isArray(volumeInfo.categories) ? volumeInfo.categories.map((entry) => String(entry || "")) : []),
    ]],
  ];
  const matched: string[] = [];
  for (const [field, values] of fields) {
    if (values.some((value) => signalPresentInText(value, signal))) matched.push(field);
  }
  return matched;
}

function classifyTeenGoogleBooksMeaningfulTasteAlignment(input: {
  likedSignals: string[];
  dislikedSignals: string[];
  specificDocSignals: string[];
  hasDocGenre: boolean;
  netScore: number;
  categoryOnlySignals: string[];
}): "strong_match" | "defensible_secondary_match" | "query_supported_but_weak" | "unrelated" | "actively_conflicting" {
  const likedCount = input.likedSignals.length;
  const dislikedCount = input.dislikedSignals.length;
  const specificDocCount = input.specificDocSignals.length;
  if (dislikedCount > likedCount && input.netScore < 0) return "actively_conflicting";
  if (specificDocCount >= 1 && input.hasDocGenre && input.netScore > 0) return "strong_match";
  if (specificDocCount >= 2 && input.netScore > 0) return "strong_match";
  if (specificDocCount >= 1 && input.netScore >= 0) return "defensible_secondary_match";
  if (likedCount >= 1 && input.netScore >= 0) return "query_supported_but_weak";
  if (dislikedCount > 0 && input.netScore < -2) return "actively_conflicting";
  return "unrelated";
}

function addTeenGoogleBooksMeaningfulTasteObservability(rankedCandidates: ScoredCandidate[], selected: ScoredCandidate[], rejectedReasons: Record<string, number>, profile: TasteProfile): void {
  if (profile.ageBand !== "teens" || !rankedCandidates.some((candidate) => candidate.source === "googleBooks")) return;
  const diagnostics = rejectedReasons as Record<string, unknown>;
  const selectedTitles = new Set(selected.filter((candidate) => candidate.source === "googleBooks").map((candidate) => normalized(candidate.title)));
  const candidateTasteMatchScoreByTitle: Record<string, number> = {};
  const candidateTastePenaltyByTitle: Record<string, number> = {};
  const candidateMatchedLikedSignalsByTitle: Record<string, string[]> = {};
  const candidateMatchedDislikedSignalsByTitle: Record<string, string[]> = {};
  const documentBackedTasteSignalsByTitle: Record<string, string[]> = {};
  const teenGoogleBooksSignalFieldsByTitle: Record<string, Record<string, string[]>> = {};
  const teenGoogleBooksGenreSignalsByTitle: Record<string, string[]> = {};
  const teenGoogleBooksThemeSignalsByTitle: Record<string, string[]> = {};
  const teenGoogleBooksToneSignalsByTitle: Record<string, string[]> = {};
  const teenGoogleBooksCategoryOnlySignalsByTitle: Record<string, string[]> = {};
  const teenGoogleBooksQueryFamilyOnlySignalsByTitle: Record<string, string[]> = {};
  const teenGoogleBooksDocumentNativeSpecificSignalsByTitle: Record<string, string[]> = {};
  const teenGoogleBooksBroadToneOnlyByTitle: Record<string, boolean> = {};
  const teenGoogleBooksNetMeaningfulAlignmentScoreByTitle: Record<string, number> = {};
  const teenGoogleBooksWouldPassWithoutQueryDerivedEvidenceByTitle: Record<string, boolean> = {};
  const teenGoogleBooksMeaningfulTasteClassificationByTitle: Record<string, string> = {};
  const teenGoogleBooksMeaningfulTasteClassificationHistogram: Record<string, number> = {};
  const teenGoogleBooksMeaningfulTasteStrongMatches: string[] = [];
  const teenGoogleBooksMeaningfulTasteDefensibleSecondaryMatches: string[] = [];
  const teenGoogleBooksMeaningfulTasteQuerySupportedWeakMatches: string[] = [];
  const teenGoogleBooksMeaningfulTasteUnrelatedTitles: string[] = [];
  const teenGoogleBooksMeaningfulTasteActivelyConflictingTitles: string[] = [];

  const genreProfileSignals = new Set(profile.genreFamily.map((row) => normalized(row.value)));
  const themeProfileSignals = new Set(profile.themes.map((row) => normalized(row.value)));
  const toneProfileSignals = new Set(profile.tone.map((row) => normalized(row.value)));
  const broadTonePattern = /^(dramatic?|drama|dark|warm|hopeful|emotional|atmospheric|intense|gritty|uplifting|playful|moody)$/;
  const genericContextSignals = new Set(["indie genre", "mshs", "teen", "book", "fiction", "school", "drama", "family", "identity", "film", "comedy", "community", "series", "young adult", "ya"]);

  for (const candidate of rankedCandidates.filter((row) => row.source === "googleBooks")) {
    const title = candidate.title;
    const likedSignals = uniqueSignals((Array.isArray(candidate.diagnostics?.metadataBackedMatchedLikedSignals) ? candidate.diagnostics.metadataBackedMatchedLikedSignals : []).map(String));
    const dislikedSignals = uniqueSignals((Array.isArray(candidate.diagnostics?.metadataBackedMatchedDislikedSignals) ? candidate.diagnostics.metadataBackedMatchedDislikedSignals : []).map(String));
    const documentBackedSignals = uniqueSignals((Array.isArray(candidate.diagnostics?.documentBackedTasteSignals) ? candidate.diagnostics.documentBackedTasteSignals : likedSignals).map(String));
    const positiveTasteScore = Number(candidate.diagnostics?.positiveTasteScore ?? (Number(candidate.scoreBreakdown?.genreFacetMatch || 0) + Number(candidate.scoreBreakdown?.positiveTasteMatch || 0)));
    const avoidPenalty = Math.abs(Number(candidate.scoreBreakdown?.avoidSignalPenalty || 0));
    const netAlignmentScore = Math.round((positiveTasteScore - avoidPenalty) * 1000) / 1000;
    const genreSignals = likedSignals.filter((signal) => genreProfileSignals.has(normalized(signal)));
    const themeSignals = likedSignals.filter((signal) => themeProfileSignals.has(normalized(signal)));
    const toneSignals = likedSignals.filter((signal) => toneProfileSignals.has(normalized(signal)) || broadTonePattern.test(normalized(signal)));
    const signalFieldMatches: Record<string, string[]> = {};
    const categoryOnlySignals = likedSignals.filter((signal) => {
      const fields = teenGoogleBooksSignalFieldMatches(candidate, signal);
      signalFieldMatches[signal] = fields;
      return fields.length > 0 && fields.every((field) => field === "categories");
    });
    const queryFamilyOnlySignals = likedSignals.filter((signal) => {
      const fields = signalFieldMatches[signal] || teenGoogleBooksSignalFieldMatches(candidate, signal);
      signalFieldMatches[signal] = fields;
      return fields.length === 0;
    });
    const documentNativeSignals = likedSignals.filter((signal) => (signalFieldMatches[signal] || []).length > 0);
    const candidateNativeSpecificSignals = documentNativeSignals.filter((signal) => !genericContextSignals.has(normalized(signal)));
    const docGenreSignals = candidateNativeSpecificSignals.filter((signal) => genreProfileSignals.has(normalized(signal)));
    const hasDocGenre = docGenreSignals.length >= 1;
    const broadToneOnly = likedSignals.length > 0 && toneSignals.length === likedSignals.length && genreSignals.length === 0 && themeSignals.length === 0;
    const wouldPassWithoutQueryDerivedEvidence = candidateNativeSpecificSignals.length >= 1;
    const classification = classifyTeenGoogleBooksMeaningfulTasteAlignment({
      likedSignals,
      dislikedSignals,
      specificDocSignals: candidateNativeSpecificSignals,
      hasDocGenre,
      netScore: netAlignmentScore,
      categoryOnlySignals,
    });

    candidateTasteMatchScoreByTitle[title] = Math.round(positiveTasteScore * 1000) / 1000;
    candidateTastePenaltyByTitle[title] = Math.round(avoidPenalty * 1000) / 1000;
    candidateMatchedLikedSignalsByTitle[title] = likedSignals;
    candidateMatchedDislikedSignalsByTitle[title] = dislikedSignals;
    documentBackedTasteSignalsByTitle[title] = candidateNativeSpecificSignals;
    teenGoogleBooksSignalFieldsByTitle[title] = signalFieldMatches;
    teenGoogleBooksGenreSignalsByTitle[title] = genreSignals;
    teenGoogleBooksThemeSignalsByTitle[title] = themeSignals;
    teenGoogleBooksToneSignalsByTitle[title] = toneSignals;
    teenGoogleBooksCategoryOnlySignalsByTitle[title] = categoryOnlySignals;
    teenGoogleBooksQueryFamilyOnlySignalsByTitle[title] = queryFamilyOnlySignals;
    teenGoogleBooksDocumentNativeSpecificSignalsByTitle[title] = candidateNativeSpecificSignals;
    teenGoogleBooksBroadToneOnlyByTitle[title] = broadToneOnly;
    teenGoogleBooksNetMeaningfulAlignmentScoreByTitle[title] = netAlignmentScore;
    teenGoogleBooksWouldPassWithoutQueryDerivedEvidenceByTitle[title] = wouldPassWithoutQueryDerivedEvidence;
    teenGoogleBooksMeaningfulTasteClassificationByTitle[title] = classification;
    teenGoogleBooksMeaningfulTasteClassificationHistogram[classification] = Number(teenGoogleBooksMeaningfulTasteClassificationHistogram[classification] || 0) + 1;
    if (classification === "strong_match") teenGoogleBooksMeaningfulTasteStrongMatches.push(title);
    else if (classification === "defensible_secondary_match") teenGoogleBooksMeaningfulTasteDefensibleSecondaryMatches.push(title);
    else if (classification === "query_supported_but_weak") teenGoogleBooksMeaningfulTasteQuerySupportedWeakMatches.push(title);
    else if (classification === "unrelated") teenGoogleBooksMeaningfulTasteUnrelatedTitles.push(title);
    else if (classification === "actively_conflicting") teenGoogleBooksMeaningfulTasteActivelyConflictingTitles.push(title);

    candidate.diagnostics = {
      ...(candidate.diagnostics || {}),
      teenGoogleBooksMeaningfulTasteClassification: classification,
      teenGoogleBooksNetMeaningfulAlignmentScore: netAlignmentScore,
      teenGoogleBooksWouldPassWithoutQueryDerivedEvidence: wouldPassWithoutQueryDerivedEvidence,
      teenGoogleBooksSignalFieldMatches: signalFieldMatches,
      teenGoogleBooksCategoryOnlySignals: categoryOnlySignals,
      teenGoogleBooksQueryFamilyOnlySignals: queryFamilyOnlySignals,
      teenGoogleBooksBroadToneOnly: broadToneOnly,
      teenGoogleBooksSelectedFinal: selectedTitles.has(normalized(title)),
    };
  }

  diagnostics.candidateTasteMatchScoreByTitle = candidateTasteMatchScoreByTitle;
  diagnostics.candidateTastePenaltyByTitle = candidateTastePenaltyByTitle;
  diagnostics.candidateMatchedLikedSignalsByTitle = candidateMatchedLikedSignalsByTitle;
  diagnostics.candidateMatchedDislikedSignalsByTitle = candidateMatchedDislikedSignalsByTitle;
  diagnostics.documentBackedTasteSignalsByTitle = documentBackedTasteSignalsByTitle;
  diagnostics.teenGoogleBooksSignalFieldsByTitle = teenGoogleBooksSignalFieldsByTitle;
  diagnostics.teenGoogleBooksGenreSignalsByTitle = teenGoogleBooksGenreSignalsByTitle;
  diagnostics.teenGoogleBooksThemeSignalsByTitle = teenGoogleBooksThemeSignalsByTitle;
  diagnostics.teenGoogleBooksToneSignalsByTitle = teenGoogleBooksToneSignalsByTitle;
  diagnostics.teenGoogleBooksCategoryOnlySignalsByTitle = teenGoogleBooksCategoryOnlySignalsByTitle;
  diagnostics.teenGoogleBooksQueryFamilyOnlySignalsByTitle = teenGoogleBooksQueryFamilyOnlySignalsByTitle;
  diagnostics.teenGoogleBooksDocumentNativeSpecificSignalsByTitle = teenGoogleBooksDocumentNativeSpecificSignalsByTitle;
  diagnostics.teenGoogleBooksBroadToneOnlyByTitle = teenGoogleBooksBroadToneOnlyByTitle;
  diagnostics.teenGoogleBooksNetMeaningfulAlignmentScoreByTitle = teenGoogleBooksNetMeaningfulAlignmentScoreByTitle;
  diagnostics.teenGoogleBooksWouldPassWithoutQueryDerivedEvidenceByTitle = teenGoogleBooksWouldPassWithoutQueryDerivedEvidenceByTitle;
  diagnostics.teenGoogleBooksMeaningfulTasteClassificationByTitle = teenGoogleBooksMeaningfulTasteClassificationByTitle;
  diagnostics.teenGoogleBooksMeaningfulTasteClassificationHistogram = teenGoogleBooksMeaningfulTasteClassificationHistogram;
  diagnostics.teenGoogleBooksMeaningfulTasteStrongMatches = uniqueSignals(teenGoogleBooksMeaningfulTasteStrongMatches);
  diagnostics.teenGoogleBooksMeaningfulTasteDefensibleSecondaryMatches = uniqueSignals(teenGoogleBooksMeaningfulTasteDefensibleSecondaryMatches);
  diagnostics.teenGoogleBooksMeaningfulTasteQuerySupportedWeakMatches = uniqueSignals(teenGoogleBooksMeaningfulTasteQuerySupportedWeakMatches);
  diagnostics.teenGoogleBooksMeaningfulTasteUnrelatedTitles = uniqueSignals(teenGoogleBooksMeaningfulTasteUnrelatedTitles);
  diagnostics.teenGoogleBooksMeaningfulTasteActivelyConflictingTitles = uniqueSignals(teenGoogleBooksMeaningfulTasteActivelyConflictingTitles);
}

type AdultGoogleBooksEligibility = {
  allowed: boolean;
  reason: string;
  artifactReasons: string[];
  referenceSurveyReasons: string[];
  encyclopediaReferenceReasons: string[];
  multiVolumeReferenceCorroboration: string[];
  annualAnthologyReasons: string[];
  anthologyCorroboration: string[];
  instructionalCraftReasons: string[];
  narrativeEvidence: string[];
  credibleFictionSignals: string[];
  workIdentitySignals: string[];
  documentBackedLikedSignals: string[];
  documentBackedDislikedSignals: string[];
  positiveNetTasteFamilies: string[];
  meaningfulTastePassed: boolean;
  meaningfulTasteFailureReason: string;
  strongNarrativeOverrideBlockedByTaste: boolean;
  sourceQualityScore: number;
  sourceQualityFailureReasons: string[];
  strongNarrativeOverrideApplied: boolean;
  periodicalCorroboration: string[];
  // Extended taste-alignment diagnostics — propagated from adultGoogleBooksMeaningfulTasteEligibility.
  allCandidateTasteFamilies: string[];
  negativeNetTasteFamilies: string[];
  tasteEvidenceSource: string;
  likedSignalCount: number;
  threshold: string;
  specificToneThemeLikedSignals: string[];
  broadToneLikedSignals: string[];
  contextOnlyLikedSignals: string[];
  productionDecisionReason: string;
  canonicalNarrativeFamilyPromotions: AdultGoogleBooksCanonicalNarrativeFamilyPromotion[];
  canonicalMissingFamilyBefore: { phrase: string; family: AdultOpenLibraryContentFamily; fields: string[] }[];
  canonicalMissingFamilyAfter: { phrase: string; family: AdultOpenLibraryContentFamily; fields: string[] }[];
};

function adultGoogleBooksMetadataFields(candidate: ScoredCandidate): { title: string; subtitle: string; description: string; categories: string; genres: string; combined: string } {
  const raw = (candidate.raw || {}) as Record<string, unknown>;
  const volumeInfo = (raw.volumeInfo && typeof raw.volumeInfo === "object") ? (raw.volumeInfo as Record<string, unknown>) : {};
  const categories = Array.isArray(volumeInfo.categories) ? volumeInfo.categories.map(String).join(" ") : "";
  const title = normalized(candidate.title);
  const subtitle = normalized(candidate.subtitle);
  const rawDescription = typeof raw.description === "string"
    ? raw.description
    : typeof (raw.description as { value?: unknown } | undefined)?.value === "string"
      ? String((raw.description as { value: string }).value)
      : typeof volumeInfo.description === "string"
        ? String(volumeInfo.description)
        : "";
  const description = normalized(candidate.description || rawDescription || "");
  const genres = normalized((candidate.genres || []).join(" "));
  const combined = normalized([title, subtitle, description, categories, genres].filter(Boolean).join(" "));
  return { title, subtitle, description, categories: normalized(categories), genres, combined };
}

function adultGoogleBooksFirstClassFictionCategories(candidate: ScoredCandidate): string[] {
  const raw = (candidate.raw || {}) as Record<string, unknown>;
  const volumeInfo = (raw.volumeInfo && typeof raw.volumeInfo === "object") ? (raw.volumeInfo as Record<string, unknown>) : {};
  const cats = Array.isArray(volumeInfo.categories) ? volumeInfo.categories.map(String) : [];
  // A first-class fiction category starts with a recognized fiction genre label.
  // "Literary Criticism / Science Fiction" is NOT first-class; "Fiction / Fantasy" IS.
  return cats.filter((c) => /^(?:fiction\b|detective and mystery|mystery stories?|horror tales?|adventure stories?|crime fiction|romance\b|thriller\b|fantasy\b|science fiction\b|speculative fiction\b)/i.test(c.trim()));
}

function adultGoogleBooksPeriodicalCorroboration(candidate: ScoredCandidate): string[] {
  const fields = adultGoogleBooksMetadataFields(candidate);
  const signals: string[] = [];
  if (/\bmagazine\b/.test(fields.title)) signals.push("title_magazine");
  if (/\bjournal\b/.test(fields.title)) signals.push("title_journal");
  if (/\bissue\b/.test(fields.title)) signals.push("title_issue");
  if (/\b(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{4}\b/.test(fields.title)) signals.push("title_month_year");
  if (/\b(periodicals?|serial publications?|magazines?|journals?)\b/.test(fields.categories)) signals.push("category_periodical");
  if (/\b(?:monthly|bimonthly|quarterly|special issue|annual issue)\b/.test(fields.description)) signals.push("description_periodical_shape");
  if (/\bissn\b/.test(fields.combined)) signals.push("issn_marker");
  return Array.from(new Set(signals));
}

function adultGoogleBooksArtifactReasons(candidate: ScoredCandidate): string[] {
  const fields = adultGoogleBooksMetadataFields(candidate);
  const reasons: string[] = [];
  const annualAnthologyPhrase = /\b(year'?s best|years best|best of the year|annual (?:collection|antholog(?:y|ies))|(?:\d{1,2}(?:st|nd|rd|th)\s+)?annual collection)\b/;
  const anthologyMarker = /\b(antholog(?:y|ies)|edited collection)\b/;
  const anthologyCorroboration = /\b(annual|year'?s best|years best|best of the year|edited by|editor(?:ial)?|selected by)\b/;
  if (
    annualAnthologyPhrase.test(fields.title)
    || annualAnthologyPhrase.test(fields.subtitle)
    || ((anthologyMarker.test(fields.title) || anthologyMarker.test(fields.subtitle)) && anthologyCorroboration.test(`${fields.subtitle} ${fields.categories} ${fields.description}`))
  ) {
    reasons.push("adult_googlebooks_artifact_annual_anthology_collection");
  }
  if (/\b(writer'?s market|writers'? handbook|guide to literary agents|children'?s writer'?s and illustrator'?s market|places to sell manuscripts?|markets?\s+for\s+writ(?:er|ers)|manuscript markets?|publishing opportunities|literary agents?\s+guide|writer directory|submission guide)\b/.test(fields.combined)) {
    reasons.push("adult_googlebooks_artifact_writer_reference");
  }
  if (/\b(history of(?: [a-z-]+){0,4} literature|history of literature|literary history|criticism and interpretation|critical studies?|critical study|companion to|presenting young adult fiction|presenting young adult horror fiction|authors and artists for young adults|book reviews? of fiction|reviews? of fiction)\b/.test(fields.combined)) {
    reasons.push("adult_googlebooks_artifact_literary_criticism_reference");
  }
  if (/\b(proceedings of|conference proceedings|teacher resources?|teacher'?s guide|study guide|workbook|textbook|directory|bibliograph(?:y|ies)|reference books?)\b/.test(fields.combined)) {
    reasons.push("adult_googlebooks_artifact_instructional_reference");
  }
  // Reject when Google Books itself classifies the work under Literary Criticism.
  if (/\bliterary criticism\b/.test(fields.categories)) {
    reasons.push("adult_googlebooks_artifact_literary_criticism_category");
  }
  // Reject academic/critical titles whose subject framing is in the title itself.
  if (
    /\bthrough\s+(?:(?:\w+\s+){0,5})(?:literature|fiction)\b/.test(fields.title)
    || /\b(?:understanding|exploring|examining|study\s+of|analysis\s+of)\s+(?:(?:\w+\s+){0,5})(?:through|in|via)\b/.test(fields.title)
    || /\b(?:understanding|exploring|examining)\s+(?:(?:\w+\s+){0,5})(?:literature|fiction)\b/.test(fields.title)
  ) {
    reasons.push("adult_googlebooks_artifact_academic_criticism_title");
  }
  // Reject periodicals and magazine issues.
  // A bare "Vol. N" is not sufficient by itself (e.g., numbered fiction series volumes).
  const periodicalCorroboration = adultGoogleBooksPeriodicalCorroboration(candidate);
  if (periodicalCorroboration.length > 0) {
    reasons.push("adult_googlebooks_artifact_periodical");
  }
  // Reject writer/author directories when no first-class fiction category corroborates novel identity.
  const firstClassFictionForArtifact = adultGoogleBooksFirstClassFictionCategories(candidate);
  if (
    firstClassFictionForArtifact.length === 0
    && /\b(?:fantasy|science[- ]fiction|horror|mystery|thriller|romance)\s+writers?\b/.test(fields.title)
  ) {
    reasons.push("adult_googlebooks_artifact_writer_directory");
  }
  return Array.from(new Set(reasons));
}

function adultGoogleBooksReferenceSurveyReasons(candidate: ScoredCandidate): string[] {
  const fields = adultGoogleBooksMetadataFields(candidate);
  const reasons: string[] = [];
  const titleSubtitle = `${fields.title} ${fields.subtitle}`.trim();
  const corroboration = `${fields.categories} ${fields.description}`.trim();
  if (/\b(?:book reviews?|reviews? of|review of)\b/.test(titleSubtitle)) {
    reasons.push("adult_googlebooks_reference_survey_review_shape");
  }
  if (
    /\b(?:genre (?:guide|reference|survey)|critical overview|encyclopedic overview|overview of (?:science fiction|fantasy|mystery|thriller|horror|speculative fiction)|reader'?s guide|critical guide|companion to)\b/.test(titleSubtitle)
    && /\b(?:reference|survey|overview|criticism|history|scholar|study|studies|bibliograph|guide|companion)\b/.test(corroboration)
  ) {
    reasons.push("adult_googlebooks_reference_survey_guide_overview_shape");
  }
  if (
    /\bmasterpieces? of (?:science fiction|fantasy|mystery|thriller|horror|speculative fiction|enchantment)\b/.test(titleSubtitle)
    && /\b(?:antholog|edited|collection|survey|reference|criticism|history|companion|guide|overview|selected by|editor)\b/.test(corroboration)
  ) {
    reasons.push("adult_googlebooks_reference_survey_masterpieces_collection_shape");
  }
  if (
    /\b(?:nordic|scandinavian|canadian|american|british|european|french|german|japanese|latin american|african|australian|irish|scottish|regional|national)\s+speculative fiction\b/.test(titleSubtitle)
    && /\b(?:criticism|history|survey|scholar|bibliograph|edited|studies|reference|antholog|companion|guide|overview)\b/.test(corroboration)
  ) {
    reasons.push("adult_googlebooks_reference_survey_regional_speculative_shape");
  }
  if (
    /\b(?:top|best)\s+\d+\s+(?:science fiction|fantasy|mystery|thriller|horror|speculative fiction)?\s*(?:books?|novels?)\b/.test(titleSubtitle)
    || (/\b(?:best|top)\s+(?:science fiction|fantasy|mystery|thriller|horror|speculative fiction)\s+(?:books?|novels?)\b/.test(titleSubtitle)
      && /\b(?:guide|ranking|ranked|list|overview|survey|reference)\b/.test(corroboration))
  ) {
    reasons.push("adult_googlebooks_reference_survey_best_books_shape");
  }
  return Array.from(new Set(reasons));
}

function adultGoogleBooksEncyclopediaReferenceSignals(candidate: ScoredCandidate): { reasons: string[]; multiVolumeCorroboration: string[] } {
  const fields = adultGoogleBooksMetadataFields(candidate);
  const reasons: string[] = [];
  const titleSubtitle = `${fields.title} ${fields.subtitle}`.trim();
  const corroboration = `${fields.categories} ${fields.description}`.trim();
  const combined = `${titleSubtitle} ${corroboration}`.trim();
  const genreScope = /\b(?:science fiction|fantasy|speculative fiction|mystery|thriller|horror|romance)\b/;
  const referenceShape = /\b(?:reference|encyclop(?:a)?edia|encyclopedic|survey|handbook|guide|dictionary|directory|bibliograph(?:y|ies)|compendium|contributors?|entries|alphabetical)\b/;
  const multiVolumeMarker = /\b(?:\[\s*\d+\s*volumes?\s*\]|\d+\s*-\s*volumes?|\d+\s+volumes?)\b/;
  const alphaRangeMarker = /\b(?:a\s*-\s*z|p\s*-\s*z|[a-z]\s*-\s*[a-z])\b/;
  const multiVolumeCorroboration: string[] = [];

  if (/\b(?:encyclop(?:a)?edia|encyclopedic)\b/.test(titleSubtitle) && (genreScope.test(combined) || referenceShape.test(corroboration))) {
    reasons.push("adult_googlebooks_reference_survey_encyclopedia_shape");
  }
  if (
    /\b(?:encyclop(?:a)?edia of|reference encyclop(?:a)?edia|encyclopedic reference)\b/.test(titleSubtitle)
    && (genreScope.test(combined) || referenceShape.test(corroboration))
  ) {
    reasons.push("adult_googlebooks_reference_survey_reference_encyclopedia_shape");
  }
  if (
    /\b(?:compendium|dictionary|directory|handbook|reference guide|guide to)\b/.test(titleSubtitle)
    && /\b(?:science fiction|fantasy|speculative fiction|mystery|thriller|horror|romance)\b/.test(combined)
    && referenceShape.test(corroboration)
  ) {
    reasons.push("adult_googlebooks_reference_survey_compendium_dictionary_shape");
  }
  if (
    /\b(?:authors?|writers?|movements?|themes?|history|scholarship|studies)\b/.test(titleSubtitle)
    && /\b(?:science fiction|fantasy|speculative fiction)\b/.test(titleSubtitle)
    && /\b(?:reference|survey|overview|scholar|study|studies|bibliograph|guide|companion|history)\b/.test(corroboration)
  ) {
    reasons.push("adult_googlebooks_reference_survey_broad_scholarship_shape");
  }

  if (multiVolumeMarker.test(titleSubtitle)) multiVolumeCorroboration.push("multi_volume_marker");
  if (alphaRangeMarker.test(titleSubtitle)) multiVolumeCorroboration.push("alphabetical_or_range_marker");
  if (referenceShape.test(corroboration)) multiVolumeCorroboration.push("reference_metadata");
  if (/\b(?:contributors?|entries|alphabetical|a-z|p-z)\b/.test(corroboration)) multiVolumeCorroboration.push("entry_or_contributor_metadata");
  if (/\b(?:women|men|authors?|writers?)\s+in\s+(?:science fiction|fantasy|speculative fiction)\b/.test(titleSubtitle)) {
    multiVolumeCorroboration.push("survey_subject_group_title_shape");
  }
  if (
    multiVolumeMarker.test(titleSubtitle)
    && multiVolumeCorroboration.length > 1
    && (genreScope.test(combined) || referenceShape.test(corroboration))
  ) {
    reasons.push("adult_googlebooks_reference_survey_multi_volume_reference_shape");
  }

  return { reasons: Array.from(new Set(reasons)), multiVolumeCorroboration: Array.from(new Set(multiVolumeCorroboration)) };
}

function adultGoogleBooksAnnualAnthologySignals(candidate: ScoredCandidate): { reasons: string[]; corroboration: string[] } {
  const fields = adultGoogleBooksMetadataFields(candidate);
  const titleSubtitle = `${fields.title} ${fields.subtitle}`.trim();
  const metadata = `${fields.categories} ${fields.description}`.trim();
  const reasons: string[] = [];
  const corroboration: string[] = [];
  const annualTitleShape = /\b(?:best\s+(?:science fiction(?: and fantasy)?|fantasy|horror|mystery(?: stories)?)\s+of\s+the\s+year|year'?s\s+best(?:\s+stories?)?|best\s+of\s+the\s+year|annual\s+antholog(?:y|ies)|antholog(?:y|ies)\s+volume|annual\s+collection)\b/;
  const anthologyMetadataShape = /\b(?:antholog(?:y|ies)|collection|edited by|editor(?:ial)?|stories from multiple authors|multiple authors|contributors?|annual|yearbook|selected by)\b/;
  const genreScope = /\b(?:science fiction|fantasy|speculative fiction|horror|mystery|thriller|crime)\b/;

  if (annualTitleShape.test(titleSubtitle)) corroboration.push("annual_or_best_of_title_shape");
  if (anthologyMetadataShape.test(metadata)) corroboration.push("anthology_or_edited_metadata");
  if (genreScope.test(`${titleSubtitle} ${metadata}`)) corroboration.push("genre_scope_metadata");
  if (/\b(?:\d+\s*#?\s*\d+|#\s*\d+)\b/.test(titleSubtitle)) corroboration.push("numbered_annual_issue_shape");

  if (annualTitleShape.test(titleSubtitle) && (genreScope.test(titleSubtitle) || anthologyMetadataShape.test(metadata))) {
    reasons.push("adult_googlebooks_artifact_annual_best_of_anthology");
  } else if (anthologyMetadataShape.test(metadata) && /\b(?:best|year'?s best|best of the year|annual)\b/.test(`${titleSubtitle} ${metadata}`) && genreScope.test(`${titleSubtitle} ${metadata}`)) {
    reasons.push("adult_googlebooks_artifact_annual_best_of_anthology");
  }
  return { reasons: Array.from(new Set(reasons)), corroboration: Array.from(new Set(corroboration)) };
}

function adultGoogleBooksInstructionalCraftReasons(candidate: ScoredCandidate): string[] {
  const fields = adultGoogleBooksMetadataFields(candidate);
  const reasons: string[] = [];
  const titleSubtitle = `${fields.title} ${fields.subtitle}`.trim();
  const categoryText = fields.categories;
  const descriptionText = fields.description;
  const craftTitlePhrase = /\b(?:technique(?:s)? of (?:the )?(?:mystery story|fiction|fiction writing|novel(?: writing)?|storytelling|narrative)|art of fiction writing|craft of fiction|how to write (?:mysteries?|fiction|novels?|suspense|romance|science fiction)|writing (?:the )?(?:mystery novel|fiction|novels?|suspense|romance|science fiction)|guide to writing|handbook for writers?|plotting the novel|creating characters?|storytelling techniques?|narrative techniques?|history of (?:the )?mystery story|analysis of (?:the )?mystery story)\b/;
  if (craftTitlePhrase.test(titleSubtitle)) {
    reasons.push("adult_googlebooks_instructional_craft_title_shape");
  }
  const craftMetadataCorroboration = /\b(?:creative writing|authorship|language arts|composition|reference|study aids?|literary criticism|criticism and interpretation|history and criticism|education|teaching)\b/.test(categoryText)
    && /\b(?:how to|guide|handbook|teaches|teaching|learn to|step by step|explains|instruction|workbook|for writers?|writing craft|story craft|narrative technique|plot development|character creation)\b/.test(descriptionText);
  if (craftMetadataCorroboration) {
    reasons.push("adult_googlebooks_instructional_craft_metadata_shape");
  }
  return Array.from(new Set(reasons));
}

type AdultGoogleBooksFinalSlateIdentity =
  | "individual_narrative_work"
  | "narrative_series_volume"
  | "short_story_collection"
  | "multi_author_anthology"
  | "single_author_collection"
  | "best_of_or_annual_collection"
  | "omnibus_or_boxed_collection"
  | "literary_criticism_or_subject_study"
  | "academic_or_scholarly_text"
  | "reading_guide_or_companion"
  | "bibliography_catalog_or_reference"
  | "periodical_or_serial_issue"
  | "juvenile_or_incompatible_audience"
  | "promotional_or_publisher_artifact"
  | "identity_uncertain";

type AdultGoogleBooksFinalSlateIdentityAgreement =
  | "identity_agrees_with_current_behavior"
  | "likely_non_narrative_false_accept"
  | "likely_collection_false_accept"
  | "likely_narrative_false_reject"
  | "uncertain_identity_needs_review";

type AdultGoogleBooksFinalSlateIdentityAuditContext = {
  eligibility?: AdultGoogleBooksEligibility;
  finalEligibilityDecision?: string;
  finalEligibilityReason?: string;
  finalSelectionDecision?: string;
  rendered?: boolean;
};

type AdultGoogleBooksFinalSlateIdentityAuditResult = {
  identity: AdultGoogleBooksFinalSlateIdentity;
  confidence: number;
  evidence: Record<string, string[]>;
  agreement: AdultGoogleBooksFinalSlateIdentityAgreement;
  rootCause: string;
  summary: Record<string, unknown>;
};

type AdultGoogleBooksIdentityEnforcementDecision = "accepted" | "rejected" | "unchanged";

type AdultGoogleBooksIdentityEnforcementResult = {
  identity: AdultGoogleBooksFinalSlateIdentity;
  decision: AdultGoogleBooksIdentityEnforcementDecision;
  reason: string;
};

function adultGoogleBooksCandidateVolumeInfo(candidate: ScoredCandidate): Record<string, unknown> {
  const raw = (candidate.raw || {}) as Record<string, unknown>;
  return raw.volumeInfo && typeof raw.volumeInfo === "object" ? raw.volumeInfo as Record<string, unknown> : {};
}

function adultGoogleBooksDiagnosticStrings(candidate: ScoredCandidate, key: string): string[] {
  const raw = (candidate.raw || {}) as Record<string, unknown>;
  const value = candidate.diagnostics?.[key] || raw[key];
  return Array.isArray(value) ? uniqueSignals(value.map((item) => String(item || ""))) : [];
}

function adultGoogleBooksCurrentPublicationShape(candidate: ScoredCandidate): string {
  const raw = (candidate.raw || {}) as Record<string, unknown>;
  return String(candidate.diagnostics?.googleBooksPublicationShape || raw.googleBooksPublicationShape || "unknown");
}

function adultGoogleBooksCurrentPublicationShapePrecedenceDecision(candidate: ScoredCandidate): string {
  const raw = (candidate.raw || {}) as Record<string, unknown>;
  return String(candidate.diagnostics?.googleBooksPublicationShapePrecedenceDecision || raw.googleBooksPublicationShapePrecedenceDecision || "");
}

function adultGoogleBooksFinalSlateIdentityEvidenceContainer(candidate: ScoredCandidate, eligibility?: AdultGoogleBooksEligibility): Record<string, string[]> {
  const raw = (candidate.raw || {}) as Record<string, unknown>;
  const volumeInfo = adultGoogleBooksCandidateVolumeInfo(candidate);
  const identifiers = Array.isArray(volumeInfo.industryIdentifiers) ? volumeInfo.industryIdentifiers : [];
  const evidence: Record<string, string[]> = {
    titleIdentityEvidence: [],
    subtitleIdentityEvidence: [],
    categoryIdentityEvidence: [],
    descriptionIdentityEvidence: [],
    narrativeSynopsisEvidence: [],
    academicFraming: [],
    editorContributorFraming: [],
    storiesByFraming: [],
    collectionAnthologyEvidence: [],
    subjectOfAuthorFraming: [],
    publisherEvidence: [],
    recordQualityEvidence: [
      ...(identifiers.length > 0 ? ["isbn_present"] : []),
      ...(Number(volumeInfo.pageCount || 0) > 0 ? [`page_count:${Number(volumeInfo.pageCount || 0)}`] : []),
      ...(String(volumeInfo.publisher || "").trim() ? [`publisher:${String(volumeInfo.publisher || "").trim()}`] : []),
      ...(String(volumeInfo.publishedDate || raw.publicationYear || "").trim() ? [`published:${String(volumeInfo.publishedDate || raw.publicationYear || "").trim()}`] : []),
    ],
    currentPublicationShapeEvidence: adultGoogleBooksDiagnosticStrings(candidate, "googleBooksPublicationShapeEvidence"),
    currentDominantPublicationShapeEvidence: adultGoogleBooksDiagnosticStrings(candidate, "googleBooksDominantPublicationShapeEvidence"),
    currentStoryLevelNarrativeEvidence: adultGoogleBooksDiagnosticStrings(candidate, "googleBooksStoryLevelNarrativeEvidence"),
    finalEligibilityEvidence: eligibility
      ? uniqueSignals([
        ...eligibility.artifactReasons,
        ...eligibility.referenceSurveyReasons,
        ...eligibility.encyclopediaReferenceReasons,
        ...eligibility.annualAnthologyReasons,
        ...eligibility.anthologyCorroboration,
        ...eligibility.instructionalCraftReasons,
        ...eligibility.narrativeEvidence,
        ...eligibility.workIdentitySignals,
        ...eligibility.credibleFictionSignals,
        ...eligibility.sourceQualityFailureReasons,
      ])
      : [],
  };
  return evidence;
}

function adultGoogleBooksPushEvidence(evidence: Record<string, string[]>, key: string, value: string): void {
  if (!value) return;
  evidence[key] = uniqueSignals([...(evidence[key] || []), value]);
}

function adultGoogleBooksIdentityConfidence(evidence: Record<string, string[]>, base: number): number {
  const buckets = Object.values(evidence).filter((items) => Array.isArray(items) && items.length > 0).length;
  return adultOpenLibraryRoundWeight(Math.min(0.98, base + Math.min(0.18, buckets * 0.025)));
}

function adultGoogleBooksFinalSlateIdentityRootCause(
  identity: AdultGoogleBooksFinalSlateIdentity,
  agreement: AdultGoogleBooksFinalSlateIdentityAgreement,
  currentShape: string,
  finalEligibilityReason: string,
): string {
  if (agreement === "likely_narrative_false_reject") {
    return finalEligibilityReason || "narrative_identity_failed_existing_final_eligibility";
  }
  if (agreement === "likely_collection_false_accept") {
    return currentShape === "novel"
      ? "publication_shape_novel_missed_collection_identity"
      : "final_eligibility_allowed_collection_identity";
  }
  if (agreement === "likely_non_narrative_false_accept") {
    return currentShape === "novel"
      ? `publication_shape_novel_missed_${identity}`
      : `final_eligibility_allowed_${identity}`;
  }
  if (agreement === "uncertain_identity_needs_review") return "audit_identity_uncertain";
  return "identity_agrees_with_current_behavior";
}

export function adultGoogleBooksFinalSlateIdentityAudit(
  candidate: ScoredCandidate,
  context: AdultGoogleBooksFinalSlateIdentityAuditContext = {},
): AdultGoogleBooksFinalSlateIdentityAuditResult {
  const fields = adultGoogleBooksMetadataFields(candidate);
  const volumeInfo = adultGoogleBooksCandidateVolumeInfo(candidate);
  const titleSubtitle = `${fields.title} ${fields.subtitle}`.trim();
  const description = fields.description;
  const categories = fields.categories;
  const publisher = normalized(volumeInfo.publisher);
  const authors = uniqueSignals([
    ...(Array.isArray(volumeInfo.authors) ? volumeInfo.authors.map(String) : []),
    ...(candidate.creators || []),
  ]);
  const currentShape = adultGoogleBooksCurrentPublicationShape(candidate);
  const precedenceDecision = adultGoogleBooksCurrentPublicationShapePrecedenceDecision(candidate);
  const evidence = adultGoogleBooksFinalSlateIdentityEvidenceContainer(candidate, context.eligibility);
  const finalEligibilityDecision = context.finalEligibilityDecision || (context.eligibility ? context.eligibility.allowed ? "accepted" : "rejected" : "");
  const finalEligibilityReason = context.finalEligibilityReason || context.eligibility?.reason || "";
  const finalSelectionDecision = context.finalSelectionDecision || "";
  const rendered = Boolean(context.rendered || finalSelectionDecision === "selected");
  const finalAccepted = finalEligibilityDecision === "accepted" || context.eligibility?.allowed === true;

  const periodicalSignals = adultGoogleBooksPeriodicalCorroboration(candidate);
  for (const signal of periodicalSignals) adultGoogleBooksPushEvidence(evidence, "descriptionIdentityEvidence", signal);
  const referenceSurveyReasons = adultGoogleBooksReferenceSurveyReasons(candidate);
  for (const reason of referenceSurveyReasons) adultGoogleBooksPushEvidence(evidence, "categoryIdentityEvidence", reason);
  const encyclopediaSignals = adultGoogleBooksEncyclopediaReferenceSignals(candidate);
  for (const reason of encyclopediaSignals.reasons) adultGoogleBooksPushEvidence(evidence, "categoryIdentityEvidence", reason);
  for (const reason of encyclopediaSignals.multiVolumeCorroboration) adultGoogleBooksPushEvidence(evidence, "categoryIdentityEvidence", reason);
  const annualAnthologySignals = adultGoogleBooksAnnualAnthologySignals(candidate);
  for (const reason of annualAnthologySignals.reasons) adultGoogleBooksPushEvidence(evidence, "collectionAnthologyEvidence", reason);
  for (const reason of annualAnthologySignals.corroboration) adultGoogleBooksPushEvidence(evidence, "collectionAnthologyEvidence", reason);
  for (const reason of adultGoogleBooksInstructionalCraftReasons(candidate)) adultGoogleBooksPushEvidence(evidence, "academicFraming", reason);
  for (const reason of context.eligibility?.artifactReasons || adultGoogleBooksArtifactReasons(candidate)) adultGoogleBooksPushEvidence(evidence, "categoryIdentityEvidence", reason);

  if (/\b(?:periodical|serial publications?|magazines?|journals?)\b/.test(categories)) adultGoogleBooksPushEvidence(evidence, "categoryIdentityEvidence", "category_periodical_identity");
  if (/\b(?:articles?|contributors?|editorials?|issue|volume|serial|periodical)\b/.test(description) && /\b(?:review|journal|magazine|mercury|quarterly|gazette|bulletin)\b/.test(titleSubtitle)) {
    adultGoogleBooksPushEvidence(evidence, "descriptionIdentityEvidence", "periodical_publication_framing");
  }
  if (/\b(?:guide to|top\s+\d+|best|essential|must read|must-read|greatest)\b.{0,60}\b(?:books?|novels?|reads|stories)\b/.test(titleSubtitle)) {
    adultGoogleBooksPushEvidence(evidence, "titleIdentityEvidence", "curated_books_or_readers_advisory_title_shape");
  }
  if (/\b(?:reader'?s advisory|readers advisory|companion|guide|handbook|bibliograph(?:y|ies)|catalog|catalogue|reference|encyclop(?:a)?edia|dictionary|directory)\b/.test(`${titleSubtitle} ${categories} ${description}`)) {
    adultGoogleBooksPushEvidence(evidence, "categoryIdentityEvidence", "reference_or_companion_framing");
  }
  if (/\b(?:food|politics|gender|race|ecofeminist|alienation|apocalypse|postmodern|systems?|methods?|comparison|study|studies|analysis|reading|teaching|understanding|interpretation|themes?)\b.{0,80}\b(?:fiction|novels?|literature|horror|science fiction|speculative fiction)\b/.test(titleSubtitle)) {
    adultGoogleBooksPushEvidence(evidence, "academicFraming", "subject_of_study_title_framing");
  }
  if (/\b(?:in|of)\s+[a-z0-9 ]{2,60}(?:'s|s)\s+(?:fiction|novels?|works?|writing)\b/.test(titleSubtitle)) {
    adultGoogleBooksPushEvidence(evidence, "subjectOfAuthorFraming", "author_or_work_subject_framing");
  }
  if (/\b(?:literary criticism|criticism and interpretation|history and criticism|academic|scholarly|monograph|thesis|dissertation|study|studies|analysis)\b/.test(`${categories} ${description}`)) {
    adultGoogleBooksPushEvidence(evidence, "academicFraming", "academic_or_criticism_metadata");
  }
  if (/\b(?:university press|routledge|palgrave|cambridge scholars|oxford university press|academic)\b/.test(publisher)) {
    adultGoogleBooksPushEvidence(evidence, "publisherEvidence", "academic_publisher");
  }
  if (/\b(?:edited by|editor(?:s|ial)?|selected by|contributors?|multiple authors|featuring stories by)\b/.test(`${titleSubtitle} ${description}`)) {
    adultGoogleBooksPushEvidence(evidence, "editorContributorFraming", "editor_or_contributor_framing");
  }
  if (/\b(?:stories by|tales by|short stories by|collection of stories|story collection)\b/.test(`${titleSubtitle} ${description}`)) {
    adultGoogleBooksPushEvidence(evidence, "storiesByFraming", "stories_by_or_short_story_collection_framing");
  }
  if (/\b(?:mammoth book|year'?s best|best new|best of|annual|antholog(?:y|ies)|omnibus|boxed set|box set|megapack|collection|collected|complete works|classic novels|greatest .* books)\b/.test(titleSubtitle)) {
    adultGoogleBooksPushEvidence(evidence, "collectionAnthologyEvidence", "collection_or_anthology_title_shape");
  }
  if (/\b(?:juvenile fiction|young adult|teen|children'?s books?|children'?s fiction|middle grade)\b/.test(categories)) {
    adultGoogleBooksPushEvidence(evidence, "categoryIdentityEvidence", "juvenile_or_incompatible_audience_metadata");
  }
  if (/\b(?:sampler|preview|excerpt|promotional|publisher'?s catalog|coming soon|advance reader)\b/.test(`${titleSubtitle} ${description}`)) {
    adultGoogleBooksPushEvidence(evidence, "descriptionIdentityEvidence", "promotional_or_publisher_artifact_framing");
  }
  if (/\b(?:a novel|this novel|novel follows|thriller follows|mystery follows|fantasy follows|story follows|protagonist|detective|investigator|must uncover|must survive|murder|killer|conspiracy|quest|kingdom|empire|family secret|dark psychological thriller)\b/.test(description)) {
    adultGoogleBooksPushEvidence(evidence, "narrativeSynopsisEvidence", "story_level_description");
  }
  if (/\b(?:fiction|mystery|thriller|fantasy|science fiction|horror|romance|historical fiction|crime)\b/.test(categories)) {
    adultGoogleBooksPushEvidence(evidence, "categoryIdentityEvidence", "fiction_or_genre_category");
  }
  if (/\b(?:book|volume|vol|part|#)\s*(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/.test(titleSubtitle) && /\b(?:novel|thriller|mystery|suspense|series|saga)\b/.test(`${titleSubtitle} ${description}`)) {
    adultGoogleBooksPushEvidence(evidence, "titleIdentityEvidence", "numbered_narrative_series_volume");
  }

  let identity: AdultGoogleBooksFinalSlateIdentity = "identity_uncertain";
  let confidence = 0.48;
  const allIdentityEvidenceText = Object.values(evidence).flat().join(" ");
  if (periodicalSignals.length > 0 || currentShape === "periodical") {
    identity = "periodical_or_serial_issue";
    confidence = 0.86;
  } else if (evidence.collectionAnthologyEvidence.some((item) => /annual|best|year|mammoth/.test(item)) || currentShape === "anthology" && /\b(?:best|annual|mammoth)\b/.test(titleSubtitle)) {
    identity = "best_of_or_annual_collection";
    confidence = 0.86;
  } else if (/\b(?:short stories|short story collection|story collection|collection of stories|tales)\b/.test(titleSubtitle)) {
    identity = "short_story_collection";
    confidence = 0.74;
  } else if (evidence.storiesByFraming.length > 0 && authors.length <= 1) {
    identity = "single_author_collection";
    confidence = 0.78;
  } else if (evidence.collectionAnthologyEvidence.some((item) => /omnibus|boxed|megapack|classic novels|greatest|collection/.test(item)) && /\b(?:novels?|books?|works?|megapack|collection)\b/.test(titleSubtitle)) {
    identity = "omnibus_or_boxed_collection";
    confidence = 0.83;
  } else if (/\b(?:writer reference|reference|encyclopedia|catalog|bibliograph|curated|advisory)\b/.test(allIdentityEvidenceText)) {
    identity = /\b(?:advisory|companion|guide)\b/.test(allIdentityEvidenceText) ? "reading_guide_or_companion" : "bibliography_catalog_or_reference";
    confidence = 0.84;
  } else if (evidence.academicFraming.some((item) => /\b(?:instructional|craft|writing)\b/.test(item))) {
    identity = "reading_guide_or_companion";
    confidence = 0.82;
  } else if (evidence.academicFraming.length > 0 || evidence.subjectOfAuthorFraming.length > 0 || ["critical_study", "literary_history", "author_commentary", "production_history"].includes(currentShape)) {
    identity = evidence.publisherEvidence.includes("academic publisher") || currentShape === "academic_text" ? "academic_or_scholarly_text" : "literary_criticism_or_subject_study";
    confidence = 0.85;
  } else if (evidence.editorContributorFraming.length > 0 || currentShape === "anthology") {
    identity = "multi_author_anthology";
    confidence = 0.82;
  } else if (evidence.categoryIdentityEvidence.includes("juvenile_or_incompatible_audience_metadata")) {
    identity = "juvenile_or_incompatible_audience";
    confidence = 0.76;
  } else if (evidence.descriptionIdentityEvidence.includes("promotional_or_publisher_artifact_framing")) {
    identity = "promotional_or_publisher_artifact";
    confidence = 0.8;
  } else if (evidence.titleIdentityEvidence.includes("numbered_narrative_series_volume") || (adultGoogleBooksSeriesRoot(candidate) && /\b(?:book|volume|vol|part|#)\s*(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/.test(titleSubtitle))) {
    identity = "narrative_series_volume";
    confidence = 0.78;
  } else if (evidence.narrativeSynopsisEvidence.length > 0 || currentShape === "novel") {
    identity = "individual_narrative_work";
    confidence = currentShape === "novel" ? 0.72 : 0.68;
  }

  confidence = adultGoogleBooksIdentityConfidence(evidence, confidence);
  const narrativeIdentities = new Set<AdultGoogleBooksFinalSlateIdentity>(["individual_narrative_work", "narrative_series_volume"]);
  const collectionIdentities = new Set<AdultGoogleBooksFinalSlateIdentity>(["short_story_collection", "multi_author_anthology", "single_author_collection", "best_of_or_annual_collection", "omnibus_or_boxed_collection"]);
  const acceptedOrRendered = finalAccepted || rendered || finalSelectionDecision === "selected";
  let agreement: AdultGoogleBooksFinalSlateIdentityAgreement = "identity_agrees_with_current_behavior";
  if (identity === "identity_uncertain") {
    agreement = "uncertain_identity_needs_review";
  } else if (acceptedOrRendered && collectionIdentities.has(identity)) {
    agreement = "likely_collection_false_accept";
  } else if (acceptedOrRendered && !narrativeIdentities.has(identity)) {
    agreement = "likely_non_narrative_false_accept";
  } else if (!finalAccepted && narrativeIdentities.has(identity)) {
    agreement = "likely_narrative_false_reject";
  }

  const rootCause = adultGoogleBooksFinalSlateIdentityRootCause(identity, agreement, currentShape, finalEligibilityReason);
  return {
    identity,
    confidence,
    evidence,
    agreement,
    rootCause,
    summary: {
      auditedIdentity: identity,
      confidence,
      currentPublicationShape: currentShape,
      currentPublicationShapePrecedenceDecision: precedenceDecision,
      finalEligibilityDecision: finalEligibilityDecision || "(unknown)",
      finalEligibilityReason: finalEligibilityReason || "(none)",
      finalSelectionDecision: finalSelectionDecision || "(unknown)",
      rendered,
      agreement,
      reasonForDisagreement: agreement === "identity_agrees_with_current_behavior" ? "" : rootCause,
      smallestExistingRuleThatAppearsToHaveFailed: rootCause,
      evidenceFields: evidence,
    },
  };
}

function adultGoogleBooksIdentityEnforcementForIdentity(identity: AdultGoogleBooksFinalSlateIdentity): AdultGoogleBooksIdentityEnforcementResult {
  if (identity === "individual_narrative_work" || identity === "narrative_series_volume") {
    return {
      identity,
      decision: "accepted",
      reason: `adult_googlebooks_identity_accepted_${identity}`,
    };
  }

  if (
    identity === "omnibus_or_boxed_collection"
    || identity === "best_of_or_annual_collection"
    || identity === "literary_criticism_or_subject_study"
  ) {
    return {
      identity,
      decision: "rejected",
      reason: `adult_googlebooks_identity_rejected_${identity}`,
    };
  }

  return {
    identity,
    decision: "unchanged",
    reason: `adult_googlebooks_identity_unenforced_${identity}`,
  };
}

export function adultGoogleBooksIdentityEnforcement(candidate: ScoredCandidate, eligibility?: AdultGoogleBooksEligibility): AdultGoogleBooksIdentityEnforcementResult {
  const audit = adultGoogleBooksFinalSlateIdentityAudit(candidate, {
    eligibility,
    finalEligibilityDecision: eligibility ? eligibility.allowed ? "accepted" : "rejected" : "",
    finalEligibilityReason: eligibility?.reason || "",
  });
  return adultGoogleBooksIdentityEnforcementForIdentity(audit.identity);
}

function adultGoogleBooksDocumentBackedSignals(candidate: ScoredCandidate, field: "metadataBackedMatchedLikedSignals" | "metadataBackedMatchedDislikedSignals"): string[] {
  const values = candidate.diagnostics?.[field];
  return Array.isArray(values) ? uniqueSignals(values.map(String)) : [];
}

type AdultTasteProductionPolarityEntry = {
  decision?: string;
  overlap?: boolean;
  productionLiked?: boolean;
  productionAvoid?: boolean;
  reason?: string;
  positiveWeight?: number;
  negativeWeight?: number;
  netWeight?: number;
  positiveCount?: number;
  negativeCount?: number;
};

function adultTasteProductionPolarity(profile?: TasteProfile): Record<string, AdultTasteProductionPolarityEntry> {
  const raw = profile?.diagnostics?.adultTasteProductionPolarityByFamily;
  return raw && typeof raw === "object" && !Array.isArray(raw)
    ? raw as Record<string, AdultTasteProductionPolarityEntry>
    : {};
}

function adultTasteProductionPolarityExplanations(profile?: TasteProfile): Record<string, Record<string, unknown>> {
  const raw = profile?.diagnostics?.adultTasteProductionPolarityExplanationByFamily;
  return raw && typeof raw === "object" && !Array.isArray(raw)
    ? raw as Record<string, Record<string, unknown>>
    : {};
}

function adultGoogleBooksProductionNonPositiveFamilyPresenceRule(explanation: Record<string, unknown> | undefined): string {
  if (!explanation) return "";
  const decision = String(explanation.decision || "");
  const rule = String(explanation.productionRule || "");
  const finalPolarity = String(explanation.finalProductionPolarity || "");
  if (finalPolarity === "liked") return "";
  if (decision === "mixed_neutral" || decision === "mixed_negative" || decision === "true_avoid" || decision === "insufficient_evidence") {
    return rule || decision;
  }
  return "";
}

type AdultGoogleBooksPolarityCounterfactualKind =
  | "neutral_to_positive_counterfactual"
  | "soft_negative_to_neutral_counterfactual"
  | "soft_negative_to_positive_counterfactual"
  | "clear_avoid_removed_counterfactual";

type AdultGoogleBooksPolarityCausalityState =
  | "family_positive_support"
  | "family_positive_support_suppressed"
  | "family_soft_negative_nondecisive"
  | "family_neutral_nondecisive"
  | "family_clear_avoid_nondecisive"
  | "candidate_rejection_decisive_neutral"
  | "candidate_rejection_decisive_soft_negative"
  | "candidate_rejection_decisive_clear_avoid"
  | "candidate_rejection_multi_factor"
  | "candidate_rejection_unrelated_to_polarity";

function adultGoogleBooksFamilySignalsForEligibility(eligibility: AdultGoogleBooksEligibility, family: string, polarity: "liked" | "disliked"): string[] {
  const signals = polarity === "liked" ? eligibility.documentBackedLikedSignals : eligibility.documentBackedDislikedSignals;
  return signals.filter((signal) => adultOpenLibraryPrimaryContentFamily(signal) === family);
}

function adultGoogleBooksProfileWithCounterfactualFamily(
  profile: TasteProfile,
  family: string,
  kind: AdultGoogleBooksPolarityCounterfactualKind,
): TasteProfile {
  const polarity = adultTasteProductionPolarity(profile);
  const explanations = adultTasteProductionPolarityExplanations(profile);
  const current = polarity[family] || {};
  const currentExplanation = explanations[family] || {};
  const positiveContribution = Number(currentExplanation.positiveContribution || current.positiveWeight || 0);
  let decision = String(current.decision || currentExplanation.decision || "");
  let productionLiked = Boolean(current.productionLiked);
  let productionAvoid = Boolean(current.productionAvoid);
  let finalProductionPolarity = String(currentExplanation.finalProductionPolarity || "");

  if (kind === "neutral_to_positive_counterfactual" || kind === "soft_negative_to_positive_counterfactual") {
    decision = "mixed_positive";
    productionLiked = true;
    productionAvoid = false;
    finalProductionPolarity = "liked";
  } else if (kind === "soft_negative_to_neutral_counterfactual") {
    decision = "mixed_neutral";
    productionLiked = false;
    productionAvoid = false;
    finalProductionPolarity = "neutral";
  } else if (kind === "clear_avoid_removed_counterfactual") {
    decision = positiveContribution > 0 ? "weakly_liked" : "insufficient_evidence";
    productionLiked = positiveContribution > 0;
    productionAvoid = false;
    finalProductionPolarity = positiveContribution > 0 ? "liked" : "neutral";
  }

  const updatedPolarity = {
    ...polarity,
    [family]: {
      ...current,
      decision,
      overlap: kind === "clear_avoid_removed_counterfactual" ? positiveContribution > 0 : true,
      productionLiked,
      productionAvoid,
      reason: kind,
    },
  };
  const updatedExplanations = {
    ...explanations,
    [family]: {
      ...currentExplanation,
      family,
      decision,
      productionRule: kind,
      finalProductionPolarity,
      productionLiked,
      productionAvoid,
    },
  };

  return {
    ...profile,
    diagnostics: {
      ...(profile.diagnostics || {}),
      adultTasteProductionPolarityByFamily: updatedPolarity,
      adultTasteProductionPolarityExplanationByFamily: updatedExplanations,
    },
  };
}

function adultGoogleBooksCandidateWithoutDislikedFamily(candidate: ScoredCandidate, family: string): ScoredCandidate {
  const diagnostics = { ...(candidate.diagnostics || {}) };
  const dislikedSignals = Array.isArray(diagnostics.metadataBackedMatchedDislikedSignals)
    ? diagnostics.metadataBackedMatchedDislikedSignals.map(String)
    : [];
  diagnostics.metadataBackedMatchedDislikedSignals = dislikedSignals
    .filter((signal) => adultOpenLibraryPrimaryContentFamily(signal) !== family);
  return {
    ...candidate,
    diagnostics,
  };
}

function adultGoogleBooksOtherCounterfactualFailureReasons(eligibility: AdultGoogleBooksEligibility): string[] {
  return Array.from(new Set([
    eligibility.reason,
    eligibility.meaningfulTasteFailureReason,
    ...eligibility.sourceQualityFailureReasons,
    ...eligibility.artifactReasons,
    ...eligibility.referenceSurveyReasons,
    ...eligibility.instructionalCraftReasons,
  ].map(String).filter((reason) => reason && reason !== "not_applicable")));
}

function adultGoogleBooksCounterfactualKindsForDecision(decision: string): AdultGoogleBooksPolarityCounterfactualKind[] {
  if (decision === "mixed_neutral") return ["neutral_to_positive_counterfactual"];
  if (decision === "mixed_negative") return ["soft_negative_to_neutral_counterfactual", "soft_negative_to_positive_counterfactual"];
  if (decision === "true_avoid") return ["clear_avoid_removed_counterfactual"];
  return [];
}

function adultGoogleBooksPolarityCausalityForCandidate(
  candidate: ScoredCandidate,
  profile: TasteProfile,
  eligibility: AdultGoogleBooksEligibility,
  productionPolarityExplanations: Record<string, Record<string, unknown>>,
): {
  familyEffects: Record<string, unknown>[];
  positiveSupportSuppressed: Record<string, unknown>[];
  nondecisiveEffects: Record<string, unknown>[];
  decisiveRejection?: Record<string, unknown>;
  multiFactorRejection?: Record<string, unknown>;
  unrelatedRejection?: Record<string, unknown>;
  causalityState?: AdultGoogleBooksPolarityCausalityState | "accepted_not_rejected";
  counterfactuals: Record<string, unknown>[];
  counterfactualPass: boolean;
  counterfactualStillFail: boolean;
  decisiveRule?: string;
} {
  const familyKeys = Array.from(new Set(eligibility.allCandidateTasteFamilies.map(String).filter(Boolean)));
  const positiveFamilySet = new Set(eligibility.positiveNetTasteFamilies);
  const counterfactuals: Record<string, unknown>[] = [];
  const familyEffects: Record<string, unknown>[] = [];
  const positiveSupportSuppressed: Record<string, unknown>[] = [];
  const nondecisiveEffects: Record<string, unknown>[] = [];
  const decisiveCandidates: Record<string, unknown>[] = [];
  const isMissingMeaningfulTaste = !eligibility.allowed && eligibility.reason === "adult_googlebooks_missing_meaningful_document_taste_alignment";

  for (const family of familyKeys) {
    const explanation = productionPolarityExplanations[family] || {};
    const decision = String(explanation.decision || "");
    const productionRule = String(explanation.productionRule || "");
    const likedSignals = adultGoogleBooksFamilySignalsForEligibility(eligibility, family, "liked");
    const dislikedSignals = adultGoogleBooksFamilySignalsForEligibility(eligibility, family, "disliked");
    let familyEffectState: AdultGoogleBooksPolarityCausalityState = positiveFamilySet.has(family)
      ? "family_positive_support"
      : likedSignals.length > 0
        ? "family_positive_support_suppressed"
        : "candidate_rejection_unrelated_to_polarity";
    if (positiveFamilySet.has(family)) {
      familyEffectState = "family_positive_support";
    } else if (eligibility.allowed && decision === "mixed_neutral") {
      familyEffectState = "family_neutral_nondecisive";
    } else if (eligibility.allowed && decision === "mixed_negative") {
      familyEffectState = "family_soft_negative_nondecisive";
    } else if (eligibility.allowed && decision === "true_avoid") {
      familyEffectState = "family_clear_avoid_nondecisive";
    }

    const counterfactualKinds = isMissingMeaningfulTaste
      ? adultGoogleBooksCounterfactualKindsForDecision(decision)
      : [];
    for (const kind of counterfactualKinds) {
      const counterProfile = adultGoogleBooksProfileWithCounterfactualFamily(profile, family, kind);
      const counterCandidate = kind === "clear_avoid_removed_counterfactual"
        ? adultGoogleBooksCandidateWithoutDislikedFamily(candidate, family)
        : candidate;
      const counterEligibility = adultGoogleBooksFinalEligibility(counterCandidate, counterProfile);
      const decisive = !eligibility.allowed && counterEligibility.allowed;
      const row = {
        family,
        counterfactual: kind,
        originalFamilyPolarity: decision,
        counterfactualPolarity: kind === "soft_negative_to_neutral_counterfactual"
          ? "neutral"
          : kind === "clear_avoid_removed_counterfactual"
            ? "avoid_removed"
            : "positive",
        originalMeaningfulAlignmentDecision: eligibility.meaningfulTastePassed ? "passed" : `failed:${eligibility.meaningfulTasteFailureReason}`,
        counterfactualMeaningfulAlignmentDecision: counterEligibility.meaningfulTastePassed ? "passed" : `failed:${counterEligibility.meaningfulTasteFailureReason}`,
        originalFinalEligibilityDecision: eligibility.allowed ? `accepted:${eligibility.reason}` : `rejected:${eligibility.reason}`,
        counterfactualFinalEligibilityDecision: counterEligibility.allowed ? `accepted:${counterEligibility.reason}` : `rejected:${counterEligibility.reason}`,
        familyChangeAloneDecisive: decisive,
        otherRemainingFailureReasons: decisive ? [] : adultGoogleBooksOtherCounterfactualFailureReasons(counterEligibility),
        productionRule,
        likedSignals,
        dislikedSignals,
      };
      counterfactuals.push(row);
      if (decisive) decisiveCandidates.push(row);
    }

    const effectRow = {
      family,
      state: familyEffectState,
      familyEffectState,
      weightedDecision: decision || "not_profile_family",
      productionRule,
      finalProductionPolarity: String(explanation.finalProductionPolarity || ""),
      positiveContribution: Number(explanation.positiveContribution || 0),
      negativeContribution: Number(explanation.negativeContribution || 0),
      cancellationAmount: Number(explanation.cancellationAmount || 0),
      remainingNetScore: Number(explanation.remainingNetScore || 0),
      thresholdComparison: String(explanation.thresholdComparison || ""),
      candidateLikedSignals: likedSignals,
      candidateDislikedSignals: dislikedSignals,
      positiveNetFamily: positiveFamilySet.has(family),
    };
    familyEffects.push(effectRow);
    if (familyEffectState === "family_positive_support_suppressed") positiveSupportSuppressed.push(effectRow);
    if (
      familyEffectState === "family_soft_negative_nondecisive"
      || familyEffectState === "family_neutral_nondecisive"
      || familyEffectState === "family_clear_avoid_nondecisive"
    ) {
      nondecisiveEffects.push(effectRow);
    }
  }

  if (eligibility.allowed) {
    return {
      familyEffects,
      positiveSupportSuppressed,
      nondecisiveEffects,
      causalityState: "accepted_not_rejected",
      counterfactuals,
      counterfactualPass: false,
      counterfactualStillFail: false,
    };
  }
  if (!isMissingMeaningfulTaste) {
    return {
      familyEffects,
      positiveSupportSuppressed,
      nondecisiveEffects,
      unrelatedRejection: {
        state: "candidate_rejection_unrelated_to_polarity",
        reason: eligibility.reason,
        remainingFailureReasons: adultGoogleBooksOtherCounterfactualFailureReasons(eligibility),
      },
      causalityState: "candidate_rejection_unrelated_to_polarity",
      counterfactuals,
      counterfactualPass: false,
      counterfactualStillFail: false,
    };
  }

  const decisive = decisiveCandidates.find((row) => row.counterfactual === "neutral_to_positive_counterfactual")
    || decisiveCandidates.find((row) => row.counterfactual === "soft_negative_to_positive_counterfactual")
    || decisiveCandidates.find((row) => row.counterfactual === "clear_avoid_removed_counterfactual");
  if (decisive) {
    const counterfactual = String(decisive.counterfactual || "");
    const state: AdultGoogleBooksPolarityCausalityState = counterfactual === "neutral_to_positive_counterfactual"
      ? "candidate_rejection_decisive_neutral"
      : counterfactual === "clear_avoid_removed_counterfactual"
        ? "candidate_rejection_decisive_clear_avoid"
        : "candidate_rejection_decisive_soft_negative";
    return {
      familyEffects,
      positiveSupportSuppressed,
      nondecisiveEffects,
      decisiveRejection: {
        ...decisive,
        state,
      },
      causalityState: state,
      counterfactuals,
      counterfactualPass: true,
      counterfactualStillFail: false,
      decisiveRule: String(decisive.productionRule || decisive.counterfactual || ""),
    };
  }

  if (counterfactuals.length > 0 || familyKeys.length > 0) {
    return {
      familyEffects,
      positiveSupportSuppressed,
      nondecisiveEffects,
      multiFactorRejection: {
        state: "candidate_rejection_multi_factor",
        reason: eligibility.reason,
        counterfactualsConsidered: counterfactuals.map((row) => row.counterfactual),
        remainingFailureReasons: Array.from(new Set(counterfactuals.flatMap((row) =>
          Array.isArray(row.otherRemainingFailureReasons) ? row.otherRemainingFailureReasons.map(String) : [],
        ))),
      },
      causalityState: "candidate_rejection_multi_factor",
      counterfactuals,
      counterfactualPass: false,
      counterfactualStillFail: counterfactuals.length > 0,
    };
  }

  return {
    familyEffects,
    positiveSupportSuppressed,
    nondecisiveEffects,
    unrelatedRejection: {
      state: "candidate_rejection_unrelated_to_polarity",
      reason: eligibility.reason,
      remainingFailureReasons: adultGoogleBooksOtherCounterfactualFailureReasons(eligibility),
    },
    causalityState: "candidate_rejection_unrelated_to_polarity",
    counterfactuals,
    counterfactualPass: false,
    counterfactualStillFail: false,
  };
}

function adultGoogleBooksFamilyCounts(families: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const family of families) counts[family] = Number(counts[family] || 0) + 1;
  return counts;
}

function adultGoogleBooksProductionResolvedFamilies(profile: TasteProfile | undefined, likedFamilies: string[], dislikedFamilies: string[]): {
  positiveNetTasteFamilies: string[];
  negativeNetTasteFamilies: string[];
  productionDecisionReason: string;
} {
  const likedCounts = adultGoogleBooksFamilyCounts(likedFamilies);
  const dislikedCounts = adultGoogleBooksFamilyCounts(dislikedFamilies);
  const polarity = adultTasteProductionPolarity(profile);
  const families = Array.from(new Set([...likedFamilies, ...dislikedFamilies]));
  const positiveNetTasteFamilies: string[] = [];
  const negativeNetTasteFamilies: string[] = [];
  const appliedReasons: string[] = [];

  for (const family of families) {
    let likedCount = Number(likedCounts[family] || 0);
    let dislikedCount = Number(dislikedCounts[family] || 0);
    const production = polarity[family];
    const decision = String(production?.decision || "");

    if (production?.overlap === true) {
      if (["strongly_liked", "weakly_liked", "mixed_positive"].includes(decision)) {
        dislikedCount = 0;
        appliedReasons.push(`${family}:${decision}_counts_as_positive_overlap_resolution`);
      } else if (decision === "mixed_neutral") {
        likedCount = 0;
        dislikedCount = 0;
        appliedReasons.push(`${family}:mixed_neutral_neither_pass_nor_block`);
      } else if (decision === "mixed_negative") {
        likedCount = 0;
        dislikedCount = 0;
        appliedReasons.push(`${family}:mixed_negative_soft_negative_no_hard_block`);
      } else if (decision === "true_avoid") {
        likedCount = 0;
        appliedReasons.push(`${family}:true_avoid_overlap_blocks_positive_family_support`);
      }
    }

    if (likedCount > dislikedCount) positiveNetTasteFamilies.push(family);
    if (dislikedCount > likedCount) negativeNetTasteFamilies.push(family);
  }

  return {
    positiveNetTasteFamilies: positiveNetTasteFamilies.map(String),
    negativeNetTasteFamilies: negativeNetTasteFamilies.map(String),
    productionDecisionReason: appliedReasons.length > 0
      ? uniqueSignals(appliedReasons).join("|")
      : "binary_family_gate_no_weighted_overlap_resolution_applied",
  };
}

function adultGoogleBooksMeaningfulTasteEligibility(
  candidate: ScoredCandidate,
  profile?: TasteProfile,
  canonicalPromotions: AdultGoogleBooksCanonicalNarrativeFamilyPromotion[] = [],
): {
  passed: boolean;
  reason: string;
  likedSignals: string[];
  dislikedSignals: string[];
  positiveNetTasteFamilies: string[];
  allCandidateTasteFamilies: string[];
  negativeNetTasteFamilies: string[];
  tasteEvidenceSource: string;
  likedSignalCount: number;
  threshold: string;
  specificToneThemeLikedSignals: string[];
  broadToneLikedSignals: string[];
  contextOnlyLikedSignals: string[];
  productionDecisionReason: string;
} {
  const contextOnlySignal = /^(family|families|relationship|relationships|friends?|friendship|domestic)$/;
  const broadToneSignal = /^(dark|hopeful|weird|spooky|realistic|atmospheric|epic|gritty|moody)$/;
  const promotedLikedSignals = canonicalPromotions
    .filter((promotion) => promotion.applied && (promotion.promotedAs === "liked" || promotion.promotedAs === "liked_and_disliked"))
    .map((promotion) => promotion.phrase);
  const promotedDislikedSignals = canonicalPromotions
    .filter((promotion) => promotion.applied && (promotion.promotedAs === "disliked" || promotion.promotedAs === "liked_and_disliked"))
    .map((promotion) => promotion.phrase);
  const promotedCandidateFamilies = canonicalPromotions
    .filter((promotion) => promotion.applied)
    .map((promotion) => promotion.expectedFamily);
  const likedSignals = uniqueSignals([
    ...adultGoogleBooksDocumentBackedSignals(candidate, "metadataBackedMatchedLikedSignals"),
    ...promotedLikedSignals,
  ])
    .filter((signal) => {
      const value = normalized(signal);
      return value
        && !ADULT_OPENLIBRARY_GENERIC_TASTE_SIGNAL.test(value)
        && !ADULT_OPENLIBRARY_CONTEXT_ONLY_TASTE_SIGNAL.test(value)
        && value !== "literature";
    });
  const dislikedSignals = uniqueSignals([
    ...adultGoogleBooksDocumentBackedSignals(candidate, "metadataBackedMatchedDislikedSignals"),
    ...promotedDislikedSignals,
  ])
    .filter((signal) => {
      const value = normalized(signal);
      return value
        && !ADULT_OPENLIBRARY_GENERIC_TASTE_SIGNAL.test(value)
        && !ADULT_OPENLIBRARY_CONTEXT_ONLY_TASTE_SIGNAL.test(value)
        && value !== "literature";
    });

  const likedFamilies = likedSignals
    .map((signal) => adultOpenLibraryPrimaryContentFamily(signal))
    .filter(Boolean);
  const dislikedFamilies = dislikedSignals
    .map((signal) => adultOpenLibraryPrimaryContentFamily(signal))
    .filter(Boolean);
  const productionFamilyResolution = adultGoogleBooksProductionResolvedFamilies(profile, likedFamilies, dislikedFamilies);
  const positiveNetTasteFamilies = productionFamilyResolution.positiveNetTasteFamilies;
  const negativeNetTasteFamilies = productionFamilyResolution.negativeNetTasteFamilies;
  const productionDecisionReason = productionFamilyResolution.productionDecisionReason;
  const allCandidateTasteFamilies = Array.from(new Set([...likedFamilies, ...dislikedFamilies, ...promotedCandidateFamilies]));
  const likedSignalCount = likedSignals.length;

  // Classify non-family signals up front so every return path can report them.
  const nonFamilyLikedSignals = likedSignals.filter((signal) => !adultOpenLibraryPrimaryContentFamily(signal));
  const nonFamilyDislikedSignals = dislikedSignals.filter((signal) => !adultOpenLibraryPrimaryContentFamily(signal));
  const contextOnlyLikedSignals = nonFamilyLikedSignals.filter((signal) => contextOnlySignal.test(normalized(signal)));
  const broadToneLikedSignals = nonFamilyLikedSignals.filter((signal) => broadToneSignal.test(normalized(signal)));
  const specificToneThemeLikedSignals = nonFamilyLikedSignals
    .filter((signal) => !contextOnlySignal.test(normalized(signal)) && !broadToneSignal.test(normalized(signal)));
  const specificToneThemeDislikedSignals = nonFamilyDislikedSignals
    .filter((signal) => !contextOnlySignal.test(normalized(signal)) && !broadToneSignal.test(normalized(signal)));
  const weakerLikedSignals = [...specificToneThemeLikedSignals, ...broadToneLikedSignals];
  const weakerDislikedSignals = nonFamilyDislikedSignals.filter((signal) => !contextOnlySignal.test(normalized(signal)));

  if (positiveNetTasteFamilies.length > 0) {
    return { passed: true, reason: "positive_net_liked_family_document_backed", likedSignals, dislikedSignals, positiveNetTasteFamilies, allCandidateTasteFamilies, negativeNetTasteFamilies, tasteEvidenceSource: "family", likedSignalCount, threshold: "family_liked_gt_disliked", specificToneThemeLikedSignals, broadToneLikedSignals, contextOnlyLikedSignals, productionDecisionReason };
  }

  if (contextOnlyLikedSignals.length > 0 && specificToneThemeLikedSignals.length === 0 && positiveNetTasteFamilies.length === 0) {
    return { passed: false, reason: "context_only_signal_not_meaningful", likedSignals, dislikedSignals, positiveNetTasteFamilies, allCandidateTasteFamilies, negativeNetTasteFamilies, tasteEvidenceSource: "context_only", likedSignalCount, threshold: "context_only_insufficient", specificToneThemeLikedSignals, broadToneLikedSignals, contextOnlyLikedSignals, productionDecisionReason };
  }

  if (
    broadToneLikedSignals.length === 1
    && specificToneThemeLikedSignals.length === 0
    && positiveNetTasteFamilies.length === 0
    && Number(candidate.scoreBreakdown?.genreFacetMatch || 0) <= 0
  ) {
    return { passed: false, reason: "broad_tone_without_content_family_corroboration", likedSignals, dislikedSignals, positiveNetTasteFamilies, allCandidateTasteFamilies, negativeNetTasteFamilies, tasteEvidenceSource: "broad_tone", likedSignalCount, threshold: "broad_tone_needs_family_or_genreFacet_gt_0", specificToneThemeLikedSignals, broadToneLikedSignals, contextOnlyLikedSignals, productionDecisionReason };
  }

  if (specificToneThemeLikedSignals.length >= 2 && specificToneThemeLikedSignals.length > specificToneThemeDislikedSignals.length) {
    return { passed: true, reason: "specific_liked_tone_theme_document_backed", likedSignals, dislikedSignals, positiveNetTasteFamilies, allCandidateTasteFamilies, negativeNetTasteFamilies, tasteEvidenceSource: "specific_tone_theme", likedSignalCount, threshold: "two_specific_tone_theme_liked_gt_disliked", specificToneThemeLikedSignals, broadToneLikedSignals, contextOnlyLikedSignals, productionDecisionReason };
  }
  if (specificToneThemeLikedSignals.length >= 1 && positiveNetTasteFamilies.length > 0) {
    return { passed: true, reason: "specific_tone_theme_with_content_family_corroboration", likedSignals, dislikedSignals, positiveNetTasteFamilies, allCandidateTasteFamilies, negativeNetTasteFamilies, tasteEvidenceSource: "specific_tone_theme_and_family", likedSignalCount, threshold: "one_specific_and_one_positive_net_family", specificToneThemeLikedSignals, broadToneLikedSignals, contextOnlyLikedSignals, productionDecisionReason };
  }

  if (weakerLikedSignals.length >= 2 && weakerLikedSignals.length > weakerDislikedSignals.length && specificToneThemeLikedSignals.length > 0) {
    return { passed: true, reason: "multi_signal_document_backed_positive_support", likedSignals, dislikedSignals, positiveNetTasteFamilies, allCandidateTasteFamilies, negativeNetTasteFamilies, tasteEvidenceSource: "multi_signal_weaker", likedSignalCount, threshold: "two_weaker_liked_gt_disliked_with_one_specific", specificToneThemeLikedSignals, broadToneLikedSignals, contextOnlyLikedSignals, productionDecisionReason };
  }
  const failureReason = likedSignals.length === 0 ? "no_document_backed_liked_signals" : "no_positive_net_document_backed_taste_support";
  const failThreshold = likedSignals.length === 0
    ? "at_least_one_meaningful_liked_signal_required"
    : "no_passing_combination_of_family_or_specific_tone_theme";
  // "none" is only valid when there are truly no signals. When signals exist but no combination passes, report the best available evidence type.
  const failEvidenceSource = likedSignals.length === 0
    ? "none"
    : specificToneThemeLikedSignals.length > 0
      ? "specific_tone_theme"
      : broadToneLikedSignals.length > 0
        ? "broad_tone"
        : "context_only";
  return { passed: false, reason: failureReason, likedSignals, dislikedSignals, positiveNetTasteFamilies, allCandidateTasteFamilies, negativeNetTasteFamilies, tasteEvidenceSource: failEvidenceSource, likedSignalCount, threshold: failThreshold, specificToneThemeLikedSignals, broadToneLikedSignals, contextOnlyLikedSignals, productionDecisionReason };
}

type AdultGoogleBooksMeaningfulAlignmentFailureMode =
  | "no_family_evidence"
  | "family_score_below_threshold"
  | "positive_family_canceled"
  | "broad_tone_only"
  | "context_only"
  | "metadata_sparse"
  | "semantic_extraction_failure"
  | "threshold_only";

function adultGoogleBooksEscapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function adultGoogleBooksTruncateDiagnosticText(value: unknown, limit = 700): string {
  const text = String(value || "").trim();
  return text.length > limit ? `${text.slice(0, limit)}...` : text;
}

function adultGoogleBooksRawMetadataSummary(candidate: ScoredCandidate): Record<string, unknown> {
  const raw = (candidate.raw || {}) as Record<string, unknown>;
  const volumeInfo = (raw.volumeInfo && typeof raw.volumeInfo === "object") ? (raw.volumeInfo as Record<string, unknown>) : {};
  return {
    title: candidate.title,
    subtitle: candidate.subtitle || "",
    description: adultGoogleBooksTruncateDiagnosticText(candidate.description || volumeInfo.description || ""),
    categories: Array.isArray(volumeInfo.categories) ? volumeInfo.categories.map(String) : [],
    genres: candidate.genres || [],
    authors: Array.isArray(volumeInfo.authors) ? volumeInfo.authors.map(String) : candidate.creators || [],
    publisher: String(volumeInfo.publisher || ""),
    publishedDate: String(volumeInfo.publishedDate || ""),
    pageCount: Number(volumeInfo.pageCount || 0) || undefined,
  };
}

function adultGoogleBooksMetadataSparseReasons(candidate: ScoredCandidate): string[] {
  const raw = (candidate.raw || {}) as Record<string, unknown>;
  const volumeInfo = (raw.volumeInfo && typeof raw.volumeInfo === "object") ? (raw.volumeInfo as Record<string, unknown>) : {};
  const description = String(candidate.description || volumeInfo.description || "");
  const categories = Array.isArray(volumeInfo.categories) ? volumeInfo.categories.filter(Boolean) : [];
  const genres = Array.isArray(candidate.genres) ? candidate.genres.filter(Boolean) : [];
  const authors = Array.isArray(candidate.creators) ? candidate.creators.filter(Boolean) : [];
  const reasons: string[] = [];
  if (!description.trim()) reasons.push("missing_description");
  else if (description.trim().length < 120) reasons.push("short_description");
  if (categories.length === 0) reasons.push("missing_google_categories");
  if (genres.length === 0) reasons.push("missing_normalized_genres");
  if (authors.length === 0) reasons.push("missing_authors");
  if (!String(volumeInfo.publisher || "").trim()) reasons.push("missing_publisher");
  return reasons;
}

function adultGoogleBooksSignalPresentLiteral(signal: string, metadataText: string): boolean {
  const value = normalized(signal);
  if (!value) return false;
  const pattern = new RegExp(`(^|[^\\p{L}\\p{N}])${adultGoogleBooksEscapeRegExp(value)}(?=$|[^\\p{L}\\p{N}])`, "iu");
  return pattern.test(metadataText);
}

function adultGoogleBooksProfileLikedSignalValues(profile?: TasteProfile): string[] {
  if (!profile) return [];
  return uniqueSignals([
    ...(profile.genreFamily || []).map((row) => String(row.value || "")),
    ...(profile.themes || []).map((row) => String(row.value || "")),
    ...(profile.tone || []).map((row) => String(row.value || "")),
    ...(profile.characterDynamics || []).map((row) => String(row.value || "")),
    ...(profile.formatPreference || []).map((row) => String(row.value || "")),
  ].map((value) => normalized(value)).filter(Boolean));
}

function adultGoogleBooksMeaningfulAlignmentFailureDetails(
  candidate: ScoredCandidate,
  meaningfulTaste: ReturnType<typeof adultGoogleBooksMeaningfulTasteEligibility>,
  profile?: TasteProfile,
): Record<string, unknown> {
  const likedFamilies = meaningfulTaste.likedSignals.map((signal) => adultOpenLibraryPrimaryContentFamily(signal)).filter(Boolean);
  const dislikedFamilies = meaningfulTaste.dislikedSignals.map((signal) => adultOpenLibraryPrimaryContentFamily(signal)).filter(Boolean);
  const likedFamilyCounts = adultGoogleBooksFamilyCounts(likedFamilies);
  const dislikedFamilyCounts = adultGoogleBooksFamilyCounts(dislikedFamilies);
  const allFamilies = Array.from(new Set([...likedFamilies, ...dislikedFamilies]));
  const familyScoresByFamily = Object.fromEntries(allFamilies.map((family) => {
    const likedScore = Number(likedFamilyCounts[family] || 0);
    const opposingScore = Number(dislikedFamilyCounts[family] || 0);
    const threshold = opposingScore + 1;
    return [family, {
      likedFamilyScore: likedScore,
      opposingFamilyScore: opposingScore,
      netFamilyScore: likedScore - opposingScore,
      threshold,
      missingPoints: Math.max(0, threshold - likedScore),
      comparison: likedScore > opposingScore ? "positive" : likedScore === opposingScore ? "tied_or_canceled" : "negative",
    }];
  }));
  const canceledFamilies = allFamilies.filter((family) =>
    Number(likedFamilyCounts[family] || 0) > 0
    && Number(dislikedFamilyCounts[family] || 0) >= Number(likedFamilyCounts[family] || 0)
    && !meaningfulTaste.positiveNetTasteFamilies.includes(family));
  const familyMissingDistances = Object.values(familyScoresByFamily)
    .map((row) => Number((row as Record<string, unknown>).missingPoints || 0))
    .filter((value) => value > 0);
  const specificToneThresholdMissing = meaningfulTaste.specificToneThemeLikedSignals.length > 0
    ? Math.max(0, 2 - meaningfulTaste.specificToneThemeLikedSignals.length)
    : undefined;
  const closestThresholdDistance = [
    ...familyMissingDistances,
    ...(specificToneThresholdMissing !== undefined && specificToneThresholdMissing > 0 ? [specificToneThresholdMissing] : []),
  ].sort((a, b) => a - b)[0];

  const fields = adultGoogleBooksMetadataFields(candidate);
  const metadataText = fields.combined;
  const extractedLiked = uniqueSignals(meaningfulTaste.likedSignals.map((signal) => normalized(signal)).filter(Boolean));
  const expectedSignalsFromMetadata = adultGoogleBooksProfileLikedSignalValues(profile)
    .filter((signal) => adultGoogleBooksSignalPresentLiteral(signal, metadataText));
  const expectedSignalsMissingFromExtraction = expectedSignalsFromMetadata
    .filter((signal) => !extractedLiked.includes(signal));
  const parserConfidence = expectedSignalsFromMetadata.length > 0
    ? adultOpenLibraryRoundWeight((expectedSignalsFromMetadata.length - expectedSignalsMissingFromExtraction.length) / expectedSignalsFromMetadata.length)
    : meaningfulTaste.likedSignals.length > 0
      ? 1
      : 0;
  const metadataSparseReasons = adultGoogleBooksMetadataSparseReasons(candidate);
  const positiveTasteScore = adultOpenLibraryRoundWeight(Number(candidate.diagnostics?.positiveTasteScore || 0));
  const preciseAvoidPenalty = Number(candidate.scoreBreakdown?.avoidSignalPenalty || 0);
  const broadAvoidPenalty = Number(candidate.scoreBreakdown?.broadAvoidSignalPenalty || 0);
  const negativeTasteScore = adultOpenLibraryRoundWeight(Math.abs(preciseAvoidPenalty + broadAvoidPenalty));
  const failureModes: AdultGoogleBooksMeaningfulAlignmentFailureMode[] = [];

  if (likedFamilies.length === 0) failureModes.push("no_family_evidence");
  if (likedFamilies.length > 0 && meaningfulTaste.positiveNetTasteFamilies.length === 0) failureModes.push("family_score_below_threshold");
  if (canceledFamilies.length > 0) failureModes.push("positive_family_canceled");
  if (meaningfulTaste.reason === "broad_tone_without_content_family_corroboration") failureModes.push("broad_tone_only");
  if (meaningfulTaste.reason === "context_only_signal_not_meaningful" || (meaningfulTaste.contextOnlyLikedSignals.length > 0 && meaningfulTaste.specificToneThemeLikedSignals.length === 0 && likedFamilies.length === 0)) failureModes.push("context_only");
  if (metadataSparseReasons.length >= 2 || metadataSparseReasons.includes("missing_description")) failureModes.push("metadata_sparse");
  if (expectedSignalsFromMetadata.length > 0 && expectedSignalsMissingFromExtraction.length > 0 && meaningfulTaste.likedSignals.length === 0) failureModes.push("semantic_extraction_failure");
  if (
    meaningfulTaste.likedSignals.length > 0
    && closestThresholdDistance !== undefined
    && closestThresholdDistance <= 1
  ) {
    failureModes.push("threshold_only");
  }
  if (failureModes.length === 0) {
    failureModes.push(meaningfulTaste.likedSignals.length > 0 ? "threshold_only" : "no_family_evidence");
  }

  return {
    failureModes: Array.from(new Set(failureModes)),
    extractedFamilies: allFamilies,
    positiveNetTasteFamilies: meaningfulTaste.positiveNetTasteFamilies,
    negativeNetTasteFamilies: meaningfulTaste.negativeNetTasteFamilies,
    likedFamilyScoresByFamily: likedFamilyCounts,
    dislikedFamilyScoresByFamily: dislikedFamilyCounts,
    familyScoresByFamily,
    canceledFamilies,
    positiveScore: positiveTasteScore,
    negativeScore: negativeTasteScore,
    signedAvoidPenalty: adultOpenLibraryRoundWeight(preciseAvoidPenalty + broadAvoidPenalty),
    threshold: meaningfulTaste.threshold,
    distanceFromThreshold: closestThresholdDistance !== undefined ? adultOpenLibraryRoundWeight(closestThresholdDistance) : undefined,
    rawScore: meaningfulTaste.likedSignalCount,
    evidenceSources: {
      tasteEvidenceSource: meaningfulTaste.tasteEvidenceSource,
      matchedFields: candidate.diagnostics?.adultGoogleBooksSignalMatchedField || {},
      matchedMethods: candidate.diagnostics?.adultGoogleBooksSignalMatchMethod || {},
      matchedText: candidate.diagnostics?.adultGoogleBooksSignalMatchedText || {},
    },
    parserConfidence,
    expectedSignalsFromMetadata,
    expectedSignalsMissingFromExtraction,
    actuallyExtractedSignals: {
      liked: meaningfulTaste.likedSignals,
      disliked: meaningfulTaste.dislikedSignals,
      specificToneTheme: meaningfulTaste.specificToneThemeLikedSignals,
      broadTone: meaningfulTaste.broadToneLikedSignals,
      contextOnly: meaningfulTaste.contextOnlyLikedSignals,
    },
    metadataSparseReasons,
    missingMetadataFields: metadataSparseReasons,
    rawMetadata: adultGoogleBooksRawMetadataSummary(candidate),
    productionDecisionReason: meaningfulTaste.productionDecisionReason,
  };
}

type AdultGoogleBooksNarrativeCue = {
  family: AdultOpenLibraryContentFamily;
  phrase: string;
  pattern: RegExp;
};

type AdultGoogleBooksNarrativeCueEvidence = {
  family: AdultOpenLibraryContentFamily;
  phrase: string;
  fields: string[];
};

type AdultGoogleBooksCanonicalNarrativeFamilyPromotion = {
  phrase: string;
  field: string;
  expectedFamily: AdultOpenLibraryContentFamily;
  canonicalRule: string;
  matchedText: string;
  familyAlreadyExisted: boolean;
  applied: boolean;
  promotedAs: "liked" | "disliked" | "liked_and_disliked" | "none";
  productionPolarity: string;
  decision: string;
  meaningfulAlignmentBefore: string;
  meaningfulAlignmentAfter?: string;
  finalEligibilityBefore?: string;
  finalEligibilityAfter?: string;
};

type AdultGoogleBooksAmbiguousCueEvidence = {
  phrase: string;
  fields: string[];
  reason: string;
};

type AdultGoogleBooksNarrativeCueClassificationState =
  | "canonical_cue_mapped_positive"
  | "canonical_cue_mapped_negative"
  | "canonical_cue_mapped_mixed_neutral"
  | "canonical_cue_mapped_mixed_negative"
  | "canonical_cue_mapped_context_only"
  | "canonical_cue_mapped_below_threshold"
  | "canonical_cue_missing_expected_family"
  | "genuine_alias_candidate"
  | "ambiguous_or_nonactionable";

type AdultGoogleBooksNarrativeCueClassification = {
  phrase: string;
  sourceFields: string[];
  expectedFamily: string;
  canonical: boolean;
  approvedAlias: boolean;
  allExtractedFamilies: string[];
  likedFamilyEvidence: string[];
  dislikedFamilyEvidence: string[];
  productionFamilyPolarity: string;
  evidenceSourceClassification: string;
  meaningfulAlignmentResult: string;
  finalDiagnosticState: AdultGoogleBooksNarrativeCueClassificationState;
  explanation: string;
};

const ADULT_GOOGLEBOOKS_NARRATIVE_CUES: AdultGoogleBooksNarrativeCue[] = [
  { family: "mystery_crime_thriller", phrase: "mystery", pattern: /\bmystery\b/ },
  { family: "mystery_crime_thriller", phrase: "thriller", pattern: /\bthrillers?\b/ },
  { family: "mystery_crime_thriller", phrase: "suspense", pattern: /\bsuspense(?:ful)?\b/ },
  { family: "mystery_crime_thriller", phrase: "crime", pattern: /\bcrime\b/ },
  { family: "mystery_crime_thriller", phrase: "detective", pattern: /\bdetectives?\b/ },
  { family: "mystery_crime_thriller", phrase: "investigation", pattern: /\binvestigat(?:e|es|ed|ing|ion|ions|or|ors)\b/ },
  { family: "mystery_crime_thriller", phrase: "murder", pattern: /\bmurders?\b/ },
  { family: "mystery_crime_thriller", phrase: "killer", pattern: /\bkillers?\b/ },
  { family: "mystery_crime_thriller", phrase: "serial killer", pattern: /\bserial killers?\b/ },
  { family: "mystery_crime_thriller", phrase: "missing person", pattern: /\bmissing (?:girl|woman|man|boy|child|person|people)\b/ },
  { family: "mystery_crime_thriller", phrase: "conspiracy", pattern: /\bconspirac(?:y|ies)\b/ },
  { family: "mystery_crime_thriller", phrase: "noir", pattern: /\bnoir\b/ },
  { family: "fantasy", phrase: "fantasy", pattern: /\bfantasy\b/ },
  { family: "fantasy", phrase: "magic", pattern: /\bmagic(?:al)?\b/ },
  { family: "fantasy", phrase: "wizard", pattern: /\bwizards?\b/ },
  { family: "fantasy", phrase: "witch", pattern: /\bwitch(?:es)?\b/ },
  { family: "fantasy", phrase: "dragon", pattern: /\bdragons?\b/ },
  { family: "fantasy", phrase: "mythology", pattern: /\bmytholog(?:y|ical)\b/ },
  { family: "fantasy", phrase: "kingdom", pattern: /\bkingdoms?\b/ },
  { family: "fantasy", phrase: "realm", pattern: /\brealms?\b/ },
  { family: "horror_paranormal", phrase: "horror", pattern: /\bhorror\b/ },
  { family: "horror_paranormal", phrase: "haunted", pattern: /\bhaunt(?:ed|ing|s)?\b/ },
  { family: "horror_paranormal", phrase: "ghost", pattern: /\bghosts?\b/ },
  { family: "horror_paranormal", phrase: "supernatural", pattern: /\bsupernatural\b/ },
  { family: "horror_paranormal", phrase: "paranormal", pattern: /\bparanormal\b/ },
  { family: "horror_paranormal", phrase: "occult", pattern: /\boccult\b/ },
  { family: "horror_paranormal", phrase: "monster", pattern: /\bmonsters?\b/ },
  { family: "horror_paranormal", phrase: "nightmare", pattern: /\bnightmares?\b/ },
  { family: "drama_contemporary", phrase: "drama", pattern: /\bdrama\b/ },
  { family: "drama_contemporary", phrase: "family saga", pattern: /\bfamily saga\b/ },
  { family: "drama_contemporary", phrase: "grief", pattern: /\bgrie(?:f|ving)\b/ },
  { family: "drama_contemporary", phrase: "identity", pattern: /\bidentity\b/ },
  { family: "drama_contemporary", phrase: "literary", pattern: /\bliterary\b/ },
  { family: "drama_contemporary", phrase: "contemporary", pattern: /\bcontemporary\b/ },
  { family: "drama_contemporary", phrase: "realistic", pattern: /\brealistic\b/ },
  { family: "science_fiction", phrase: "science fiction", pattern: /\bscience fiction\b/ },
  { family: "science_fiction", phrase: "sci-fi", pattern: /\bsci fi\b/ },
  { family: "science_fiction", phrase: "dystopian", pattern: /\bdystopi(?:a|an)\b/ },
  { family: "science_fiction", phrase: "artificial intelligence", pattern: /\bartificial intelligence\b/ },
  { family: "science_fiction", phrase: "robot", pattern: /\brobots?\b/ },
  { family: "science_fiction", phrase: "space", pattern: /\bspace\b/ },
  { family: "science_fiction", phrase: "alien", pattern: /\baliens?\b/ },
  { family: "historical", phrase: "historical", pattern: /\bhistorical\b/ },
  { family: "historical", phrase: "wartime", pattern: /\bwartime\b/ },
  { family: "historical", phrase: "empire", pattern: /\bempires?\b/ },
  { family: "romance", phrase: "romance", pattern: /\bromance\b/ },
  { family: "romance", phrase: "romantic", pattern: /\bromantic\b/ },
  { family: "adventure_action", phrase: "adventure", pattern: /\badventures?\b/ },
  { family: "adventure_action", phrase: "action", pattern: /\baction\b/ },
  { family: "adventure_action", phrase: "quest", pattern: /\bquests?\b/ },
  { family: "adventure_action", phrase: "survival", pattern: /\bsurviv(?:al|e|es|ed|ing)\b/ },
  { family: "comedy", phrase: "comedy", pattern: /\bcomedy\b/ },
  { family: "comedy", phrase: "humor", pattern: /\bhumou?r\b/ },
  { family: "comedy", phrase: "satire", pattern: /\bsatir(?:e|ical)\b/ },
];

const ADULT_GOOGLEBOOKS_CANONICAL_NARRATIVE_CUES = new Set([
  "thriller",
  "suspense",
  "crime",
  "mystery",
  "detective",
  "investigation",
  "murder",
  "horror",
  "supernatural",
  "haunted",
  "ghost",
  "adventure",
  "action",
  "survival",
  "historical",
  "romance",
  "romantic",
  "science fiction",
  "sci-fi",
  "sci fi",
]);

const ADULT_GOOGLEBOOKS_GENUINE_ALIAS_CUE_PHRASES = new Set([
  "serial killer",
  "missing person",
  "conspiracy",
  "monster",
  "nightmare",
  "family saga",
  "grief",
  "wartime",
  "empire",
  "alien",
]);

const ADULT_GOOGLEBOOKS_AMBIGUOUS_NARRATIVE_CUES = [
  { phrase: "gripping", pattern: /\bgripping\b/, reason: "promotional_blurb_language" },
  { phrase: "twisty", pattern: /\btwisty\b/, reason: "promotional_blurb_language" },
  { phrase: "page-turner", pattern: /\bpage turner\b/, reason: "promotional_blurb_language" },
  { phrase: "perfect for readers", pattern: /\bperfect for readers\b/, reason: "comparative_reader_positioning" },
  { phrase: "fans of", pattern: /\bfans of\b/, reason: "comparative_reader_positioning" },
  { phrase: "for readers who love", pattern: /\bfor readers who love\b/, reason: "comparative_reader_positioning" },
  { phrase: "bestselling", pattern: /\bbestselling\b/, reason: "market_positioning" },
  { phrase: "award-winning", pattern: /\baward winning\b/, reason: "market_positioning" },
];

function adultGoogleBooksRawNarrativeDescription(candidate: ScoredCandidate): string {
  const raw = (candidate.raw || {}) as Record<string, unknown>;
  const volumeInfo = (raw.volumeInfo && typeof raw.volumeInfo === "object") ? (raw.volumeInfo as Record<string, unknown>) : {};
  const rawDescription = typeof raw.description === "string"
    ? raw.description
    : typeof (raw.description as { value?: unknown } | undefined)?.value === "string"
      ? String((raw.description as { value: string }).value)
      : typeof volumeInfo.description === "string"
        ? String(volumeInfo.description)
        : "";
  return adultGoogleBooksTruncateDiagnosticText(candidate.description || rawDescription || "");
}

function adultGoogleBooksNarrativeCueEvidence(candidate: ScoredCandidate): AdultGoogleBooksNarrativeCueEvidence[] {
  const fields = adultGoogleBooksMetadataFields(candidate);
  const metadataFields = [
    { field: "description", text: fields.description },
    { field: "categories", text: fields.categories },
    { field: "genres", text: fields.genres },
  ].filter((row) => row.text);
  return ADULT_GOOGLEBOOKS_NARRATIVE_CUES
    .map((cue) => {
      const matchedFields = metadataFields
        .filter((row) => cue.pattern.test(row.text))
        .map((row) => row.field);
      return matchedFields.length > 0
        ? { family: cue.family, phrase: cue.phrase, fields: matchedFields }
        : undefined;
    })
    .filter((row): row is AdultGoogleBooksNarrativeCueEvidence => Boolean(row));
}

function adultGoogleBooksDescriptionPromotionSegments(candidate: ScoredCandidate): string[] {
  const rawDescription = adultGoogleBooksRawNarrativeDescription(candidate);
  const segments = rawDescription
    .split(/[.!?;]\s+/)
    .map((segment) => normalized(segment))
    .filter(Boolean);
  const excludedFraming = /\b(?:fans of|for fans|perfect for readers|readers who love|readers of|praise for|reviewers?|critics?|bestselling|best selling|award winning|author of|interviews?|essays?|guide|study|analysis|criticism|scholarship|this book examines|this volume|this collection|anthology|publisher|marketing)\b/;
  const narrativeFraming = /\b(?:novel|story|stories|tale|follows|centers on|must|journey|investigates?|haunts?|surviv(?:al|e|es|ed|ing)|romance|romantic|detectives?|murders?|crime|thrillers?|suspense|ghosts?|horror|adventures?|action|quests?|science fiction|sci fi|historical|period setting|magic|magical|witch(?:es)?|realm|family saga|grief|contemporary|literary|drama)\b/;
  return segments.filter((segment) => !excludedFraming.test(segment) && narrativeFraming.test(segment));
}

function adultGoogleBooksCanonicalPromotionFieldRows(candidate: ScoredCandidate): { field: string; text: string }[] {
  const fields = adultGoogleBooksMetadataFields(candidate);
  return [
    { field: "title", text: fields.title },
    { field: "subtitle", text: fields.subtitle },
    { field: "categories", text: fields.categories },
    { field: "genres", text: fields.genres },
    ...adultGoogleBooksDescriptionPromotionSegments(candidate).map((text) => ({ field: "description", text })),
  ].filter((row) => row.text);
}

function adultGoogleBooksCanonicalCuePromotionEvidence(candidate: ScoredCandidate): AdultGoogleBooksNarrativeCueEvidence[] {
  const metadataFields = adultGoogleBooksCanonicalPromotionFieldRows(candidate);
  return ADULT_GOOGLEBOOKS_NARRATIVE_CUES
    .filter((cue) => adultGoogleBooksCueIsCanonical({ family: cue.family, phrase: cue.phrase, fields: [] }))
    .map((cue) => {
      const matchedFields = metadataFields
        .filter((row) => cue.pattern.test(row.text))
        .map((row) => row.field);
      return matchedFields.length > 0
        ? { family: cue.family, phrase: cue.phrase, fields: uniqueSignals(matchedFields) }
        : undefined;
    })
    .filter((row): row is AdultGoogleBooksNarrativeCueEvidence => Boolean(row));
}

function adultGoogleBooksAmbiguousCueEvidence(candidate: ScoredCandidate): AdultGoogleBooksAmbiguousCueEvidence[] {
  const fields = adultGoogleBooksMetadataFields(candidate);
  const metadataFields = [
    { field: "description", text: fields.description },
    { field: "categories", text: fields.categories },
    { field: "genres", text: fields.genres },
  ].filter((row) => row.text);
  return ADULT_GOOGLEBOOKS_AMBIGUOUS_NARRATIVE_CUES
    .map((cue) => {
      const matchedFields = metadataFields
        .filter((row) => cue.pattern.test(row.text))
        .map((row) => row.field);
      return matchedFields.length > 0
        ? { phrase: cue.phrase, fields: matchedFields, reason: cue.reason }
        : undefined;
    })
    .filter((row): row is AdultGoogleBooksAmbiguousCueEvidence => Boolean(row));
}

function adultGoogleBooksProfileLikedFamiliesFromProfile(profile?: TasteProfile): string[] {
  if (!profile) return [];
  const signals = [
    ...(profile.genreFamily || []).map((s) => String(s.value || "")),
    ...(profile.tone || []).map((s) => String(s.value || "")),
    ...(profile.themes || []).map((s) => String(s.value || "")),
  ].filter(Boolean);
  return adultOpenLibraryUniqueFamilies(signals.map(adultOpenLibraryPrimaryContentFamily).filter(Boolean));
}

function adultGoogleBooksFlattenSignalTextMap(value: unknown): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const rows = Object.values(value as Record<string, unknown>)
    .flatMap((entry) => Array.isArray(entry) ? entry.map(String) : []);
  return uniqueSignals(rows.map(normalized).filter(Boolean));
}

function adultGoogleBooksIncrementCounter(map: Record<string, number>, key: string): void {
  if (!key) return;
  map[key] = Number(map[key] || 0) + 1;
}

function adultGoogleBooksCueIsCanonical(cue: AdultGoogleBooksNarrativeCueEvidence): boolean {
  const phrase = normalized(cue.phrase);
  return ADULT_GOOGLEBOOKS_CANONICAL_NARRATIVE_CUES.has(phrase)
    || adultOpenLibraryPrimaryContentFamily(phrase) === cue.family
    || adultOpenLibraryFamilySupportedByText(cue.family, phrase);
}

function adultGoogleBooksCueIsApprovedAlias(cue: AdultGoogleBooksNarrativeCueEvidence): boolean {
  const phrase = normalized(cue.phrase);
  return adultOpenLibraryPrimaryContentFamily(phrase) !== cue.family
    && adultOpenLibraryFamilySupportedByText(cue.family, phrase);
}

function adultGoogleBooksMeaningfulTasteFamilies(meaningfulTaste: ReturnType<typeof adultGoogleBooksMeaningfulTasteEligibility>): string[] {
  return adultOpenLibraryUniqueFamilies([
    ...meaningfulTaste.allCandidateTasteFamilies,
    ...meaningfulTaste.likedSignals.map(adultOpenLibraryPrimaryContentFamily).filter(Boolean),
    ...meaningfulTaste.dislikedSignals.map(adultOpenLibraryPrimaryContentFamily).filter(Boolean),
  ]);
}

function adultGoogleBooksCanonicalMissingFamilyRows(
  candidate: ScoredCandidate,
  meaningfulTaste: ReturnType<typeof adultGoogleBooksMeaningfulTasteEligibility>,
): { phrase: string; family: AdultOpenLibraryContentFamily; fields: string[] }[] {
  const extractedFamilies = adultGoogleBooksMeaningfulTasteFamilies(meaningfulTaste);
  return adultGoogleBooksCanonicalCuePromotionEvidence(candidate)
    .filter((cue) => !extractedFamilies.includes(cue.family))
    .map((cue) => ({
      phrase: cue.phrase,
      family: cue.family,
      fields: cue.fields,
    }));
}

function adultGoogleBooksCanonicalPromotionTarget(
  profile: TasteProfile | undefined,
  family: AdultOpenLibraryContentFamily,
): { promotedAs: AdultGoogleBooksCanonicalNarrativeFamilyPromotion["promotedAs"]; productionPolarity: string } {
  const production = adultTasteProductionPolarity(profile)[family];
  const decision = String(production?.decision || "");
  if (["strongly_liked", "weakly_liked", "mixed_positive"].includes(decision)) {
    return { promotedAs: "liked", productionPolarity: decision };
  }
  if (decision === "true_avoid") {
    return { promotedAs: "disliked", productionPolarity: decision };
  }
  if (decision === "mixed_neutral" || decision === "mixed_negative") {
    return { promotedAs: "liked_and_disliked", productionPolarity: decision };
  }

  const likedSignals = [
    ...(profile?.genreFamily || []).map((row) => String(row.value || "")),
    ...(profile?.tone || []).map((row) => String(row.value || "")),
    ...(profile?.themes || []).map((row) => String(row.value || "")),
  ];
  const avoidSignals = (profile?.avoidSignals || []).map((row) => String(row.value || ""));
  const liked = adultOpenLibraryContentFamilies(likedSignals).includes(family);
  const avoided = adultOpenLibraryContentFamilies(avoidSignals).includes(family);
  if (liked && avoided) return { promotedAs: "liked_and_disliked", productionPolarity: "binary_liked_and_avoid" };
  if (liked) return { promotedAs: "liked", productionPolarity: "binary_liked" };
  if (avoided) return { promotedAs: "disliked", productionPolarity: "binary_avoid" };
  return { promotedAs: "none", productionPolarity: "not_profile_family" };
}

function adultGoogleBooksMatchedTextForCue(candidate: ScoredCandidate, cue: AdultGoogleBooksNarrativeCueEvidence, field: string): string {
  const row = adultGoogleBooksCanonicalPromotionFieldRows(candidate).find((entry) =>
    entry.field === field
    && ADULT_GOOGLEBOOKS_NARRATIVE_CUES.some((candidateCue) =>
      candidateCue.phrase === cue.phrase
      && candidateCue.family === cue.family
      && candidateCue.pattern.test(entry.text),
    ),
  );
  return adultGoogleBooksTruncateDiagnosticText(row?.text || cue.phrase, 180);
}

function adultGoogleBooksCanonicalNarrativeFamilyPromotions(
  candidate: ScoredCandidate,
  profile: TasteProfile | undefined,
  meaningfulTasteBefore: ReturnType<typeof adultGoogleBooksMeaningfulTasteEligibility>,
): AdultGoogleBooksCanonicalNarrativeFamilyPromotion[] {
  if (candidate.source !== "googleBooks" || profile?.ageBand !== "adult") return [];
  const existingFamilies = adultGoogleBooksMeaningfulTasteFamilies(meaningfulTasteBefore);
  const alreadyPromotedFamilies = new Set<string>();
  const meaningfulAlignmentBefore = meaningfulTasteBefore.passed
    ? `passed:${meaningfulTasteBefore.reason}`
    : `failed:${meaningfulTasteBefore.reason}`;

  return adultGoogleBooksCanonicalCuePromotionEvidence(candidate)
    .flatMap((cue) => cue.fields.map((field) => ({ cue, field })))
    .map(({ cue, field }) => {
      const phrase = normalized(cue.phrase);
      const familyAlreadyExisted = existingFamilies.includes(cue.family);
      const { promotedAs, productionPolarity } = adultGoogleBooksCanonicalPromotionTarget(profile, cue.family);
      const duplicatePromotion = alreadyPromotedFamilies.has(cue.family);
      const applied = !familyAlreadyExisted && !duplicatePromotion;
      if (applied) alreadyPromotedFamilies.add(cue.family);
      const decision = familyAlreadyExisted
        ? "not_promoted_family_already_extracted"
        : duplicatePromotion
          ? "not_promoted_family_already_promoted_by_another_cue"
          : promotedAs === "none"
            ? "promoted_candidate_family_without_profile_polarity"
            : "promoted_canonical_narrative_family";
      return {
        phrase: cue.phrase,
        field,
        expectedFamily: cue.family,
        canonicalRule: `canonical_cue:${phrase}->${cue.family}`,
        matchedText: adultGoogleBooksMatchedTextForCue(candidate, cue, field),
        familyAlreadyExisted,
        applied,
        promotedAs,
        productionPolarity,
        decision,
        meaningfulAlignmentBefore,
        finalEligibilityBefore: meaningfulTasteBefore.passed
          ? "not_blocked_by_meaningful_alignment_before_promotion"
          : "rejected:adult_googlebooks_missing_meaningful_document_taste_alignment",
      };
    });
}

function adultGoogleBooksCueClassification(
  cue: AdultGoogleBooksNarrativeCueEvidence,
  meaningfulTaste: ReturnType<typeof adultGoogleBooksMeaningfulTasteEligibility>,
  profile?: TasteProfile,
): AdultGoogleBooksNarrativeCueClassification {
  const phrase = normalized(cue.phrase);
  const likedFamilyEvidence = meaningfulTaste.likedSignals
    .filter((signal) => adultOpenLibraryPrimaryContentFamily(signal) === cue.family);
  const dislikedFamilyEvidence = meaningfulTaste.dislikedSignals
    .filter((signal) => adultOpenLibraryPrimaryContentFamily(signal) === cue.family);
  const allExtractedFamilies = adultOpenLibraryUniqueFamilies([
    ...meaningfulTaste.allCandidateTasteFamilies,
    ...meaningfulTaste.likedSignals.map(adultOpenLibraryPrimaryContentFamily).filter(Boolean),
    ...meaningfulTaste.dislikedSignals.map(adultOpenLibraryPrimaryContentFamily).filter(Boolean),
  ]);
  const productionPolarity = profile ? String(adultTasteProductionPolarity(profile)[cue.family]?.decision || "not_profile_family") : "profile_unavailable";
  const canonical = adultGoogleBooksCueIsCanonical(cue);
  const approvedAlias = adultGoogleBooksCueIsApprovedAlias(cue);
  const familyExtracted = allExtractedFamilies.includes(cue.family);
  const contextOnly = meaningfulTaste.contextOnlyLikedSignals
    .map(normalized)
    .some((signal) => signal === phrase || signalPresentInText(phrase, signal) || signalPresentInText(signal, phrase));
  let finalDiagnosticState: AdultGoogleBooksNarrativeCueClassificationState;
  let explanation = "";

  if (!canonical && !approvedAlias && ADULT_GOOGLEBOOKS_GENUINE_ALIAS_CUE_PHRASES.has(phrase)) {
    finalDiagnosticState = "genuine_alias_candidate";
    explanation = "Phrase is not currently canonical for this family but strongly and unambiguously implies it.";
  } else if (familyExtracted) {
    if (contextOnly) {
      finalDiagnosticState = "canonical_cue_mapped_context_only";
      explanation = "Cue-like evidence was recognized but the meaningful-alignment gate classified it as context-only evidence.";
    } else if (productionPolarity === "mixed_neutral") {
      finalDiagnosticState = "canonical_cue_mapped_mixed_neutral";
      explanation = "Expected family was extracted, but production polarity resolved that family as mixed-neutral for this profile.";
    } else if (productionPolarity === "mixed_negative") {
      finalDiagnosticState = "canonical_cue_mapped_mixed_negative";
      explanation = "Expected family was extracted, but production polarity resolved that family as mixed-negative for this profile.";
    } else if (meaningfulTaste.positiveNetTasteFamilies.includes(cue.family)) {
      finalDiagnosticState = "canonical_cue_mapped_positive";
      explanation = "Expected family was extracted and counted as positive production evidence.";
    } else if (
      meaningfulTaste.negativeNetTasteFamilies.includes(cue.family)
      || productionPolarity === "true_avoid"
      || (likedFamilyEvidence.length === 0 && dislikedFamilyEvidence.length > 0)
    ) {
      finalDiagnosticState = "canonical_cue_mapped_negative";
      explanation = "Expected family was extracted only as disliked or avoid evidence.";
    } else {
      finalDiagnosticState = "canonical_cue_mapped_below_threshold";
      explanation = "Expected family was extracted, but it did not satisfy the current meaningful-alignment support threshold.";
    }
  } else if (canonical || approvedAlias) {
    finalDiagnosticState = "canonical_cue_missing_expected_family";
    explanation = "Known canonical or approved-alias cue exists in narrative metadata, but the expected family was not produced anywhere in extracted family evidence.";
  } else {
    finalDiagnosticState = "ambiguous_or_nonactionable";
    explanation = "Phrase is too broad, contextual, promotional, or ambiguous to become a safe semantic alias.";
  }

  return {
    phrase: cue.phrase,
    sourceFields: cue.fields,
    expectedFamily: cue.family,
    canonical,
    approvedAlias,
    allExtractedFamilies,
    likedFamilyEvidence,
    dislikedFamilyEvidence,
    productionFamilyPolarity: productionPolarity,
    evidenceSourceClassification: meaningfulTaste.tasteEvidenceSource,
    meaningfulAlignmentResult: meaningfulTaste.passed ? `passed:${meaningfulTaste.reason}` : `failed:${meaningfulTaste.reason}`,
    finalDiagnosticState,
    explanation,
  };
}

function adultGoogleBooksAmbiguousCueClassification(
  cue: AdultGoogleBooksAmbiguousCueEvidence,
  meaningfulTaste: ReturnType<typeof adultGoogleBooksMeaningfulTasteEligibility>,
): AdultGoogleBooksNarrativeCueClassification {
  return {
    phrase: cue.phrase,
    sourceFields: cue.fields,
    expectedFamily: "",
    canonical: false,
    approvedAlias: false,
    allExtractedFamilies: meaningfulTaste.allCandidateTasteFamilies,
    likedFamilyEvidence: [],
    dislikedFamilyEvidence: [],
    productionFamilyPolarity: "not_family_evidence",
    evidenceSourceClassification: meaningfulTaste.tasteEvidenceSource,
    meaningfulAlignmentResult: meaningfulTaste.passed ? `passed:${meaningfulTaste.reason}` : `failed:${meaningfulTaste.reason}`,
    finalDiagnosticState: "ambiguous_or_nonactionable",
    explanation: cue.reason,
  };
}

function adultGoogleBooksNarrativeFamilyExtractionAnalysis(
  candidate: ScoredCandidate,
  meaningfulTaste: ReturnType<typeof adultGoogleBooksMeaningfulTasteEligibility>,
  profile?: TasteProfile,
): Record<string, unknown> {
  const cueEvidence = adultGoogleBooksNarrativeCueEvidence(candidate);
  const ambiguousCueEvidence = adultGoogleBooksAmbiguousCueEvidence(candidate);
  const cueClassifications = [
    ...cueEvidence.map((cue) => adultGoogleBooksCueClassification(cue, meaningfulTaste, profile)),
    ...ambiguousCueEvidence.map((cue) => adultGoogleBooksAmbiguousCueClassification(cue, meaningfulTaste)),
  ];
  const expectedByFamily: Record<string, string[]> = {};
  const expectedEvidenceByFamily: Record<string, string[]> = {};
  for (const cue of cueEvidence) {
    expectedByFamily[cue.family] = uniqueSignals([...(expectedByFamily[cue.family] || []), cue.phrase]);
    expectedEvidenceByFamily[cue.family] = uniqueSignals([
      ...(expectedEvidenceByFamily[cue.family] || []),
      ...cue.fields.map((field) => `${field}:${cue.phrase}`),
    ]);
  }

  const extractedLikedFamilies = adultOpenLibraryUniqueFamilies(
    meaningfulTaste.likedSignals.map(adultOpenLibraryPrimaryContentFamily).filter(Boolean),
  );
  const extractedDislikedFamilies = adultOpenLibraryUniqueFamilies(
    meaningfulTaste.dislikedSignals.map(adultOpenLibraryPrimaryContentFamily).filter(Boolean),
  );
  const allExtractedFamilies = adultOpenLibraryUniqueFamilies([
    ...extractedLikedFamilies,
    ...extractedDislikedFamilies,
    ...meaningfulTaste.allCandidateTasteFamilies,
  ]);
  const expectedFamilies = Object.keys(expectedByFamily);
  const missingExpectedFamilies = expectedFamilies.filter((family) => !allExtractedFamilies.includes(family));
  const mappedButNonPositiveExpectedFamilies = expectedFamilies
    .filter((family) => allExtractedFamilies.includes(family) && !meaningfulTaste.positiveNetTasteFamilies.includes(family));
  const detectedSignalTexts = adultGoogleBooksFlattenSignalTextMap(candidate.diagnostics?.adultGoogleBooksSignalMatchedText);
  const detectedSignalValues = uniqueSignals([
    ...meaningfulTaste.likedSignals,
    ...meaningfulTaste.dislikedSignals,
  ].map(normalized).filter(Boolean));
  const ignoredNarrativePhrases = cueClassifications
    .filter((cue) => cue.finalDiagnosticState !== "canonical_cue_mapped_positive")
    .map((cue) => ({
      phrase: cue.phrase,
      family: cue.expectedFamily,
      fields: cue.sourceFields,
      finalDiagnosticState: cue.finalDiagnosticState,
      explanation: cue.explanation,
    }));
  const unmappedNarrativeCues = cueClassifications
    .filter((cue) => cue.finalDiagnosticState === "canonical_cue_missing_expected_family" || cue.finalDiagnosticState === "genuine_alias_candidate")
    .map((cue) => ({
      phrase: cue.phrase,
      family: cue.expectedFamily,
      fields: cue.sourceFields,
      finalDiagnosticState: cue.finalDiagnosticState,
      explanation: cue.explanation,
    }));
  const profileLikedFamilies = adultGoogleBooksProfileLikedFamiliesFromProfile(profile);
  const futureAliasCandidates = cueClassifications
    .filter((cue) => cue.finalDiagnosticState === "genuine_alias_candidate")
    .filter((cue) => profileLikedFamilies.length === 0 || profileLikedFamilies.includes(cue.expectedFamily))
    .map((cue) => ({
      phrase: cue.phrase,
      family: cue.expectedFamily,
      fields: cue.sourceFields,
      finalDiagnosticState: cue.finalDiagnosticState,
      reason: profileLikedFamilies.includes(cue.expectedFamily)
        ? "visible_profile_family_cue_not_extracted"
        : "visible_narrative_cue_not_extracted",
    }));
  const matchedExpectedFamilyCount = cueClassifications
    .filter((cue) => cue.expectedFamily)
    .filter((cue) => !["canonical_cue_missing_expected_family", "genuine_alias_candidate", "ambiguous_or_nonactionable"].includes(cue.finalDiagnosticState))
    .length;
  const classifiedExpectedCueCount = cueClassifications.filter((cue) => cue.expectedFamily).length;
  const parserConfidence = expectedFamilies.length > 0
    ? adultOpenLibraryRoundWeight(matchedExpectedFamilyCount / Math.max(1, classifiedExpectedCueCount))
    : detectedSignalValues.length > 0
      ? 1
      : 0;
  const canonicalCueMissingFamily = cueClassifications.filter((cue) => cue.finalDiagnosticState === "canonical_cue_missing_expected_family");
  const genuineAliasCandidateCues = cueClassifications.filter((cue) => cue.finalDiagnosticState === "genuine_alias_candidate");
  const falseUnmappedSuppressed = cueClassifications.filter((cue) =>
    !["canonical_cue_missing_expected_family", "genuine_alias_candidate", "ambiguous_or_nonactionable"].includes(cue.finalDiagnosticState),
  );

  return {
    rawNarrativeDescription: adultGoogleBooksRawNarrativeDescription(candidate),
    semanticPhrasesDetected: {
      matchedSignals: detectedSignalValues,
      matchedTexts: detectedSignalTexts,
      trace: Array.isArray(candidate.diagnostics?.adultGoogleBooksSignalMatchTrace)
        ? candidate.diagnostics.adultGoogleBooksSignalMatchTrace
        : [],
    },
    familyMappingsProduced: {
      likedSignals: meaningfulTaste.likedSignals.map((signal) => ({
        signal,
        family: adultOpenLibraryPrimaryContentFamily(signal) || "",
      })),
      dislikedSignals: meaningfulTaste.dislikedSignals.map((signal) => ({
        signal,
        family: adultOpenLibraryPrimaryContentFamily(signal) || "",
      })),
      positiveNetTasteFamilies: meaningfulTaste.positiveNetTasteFamilies,
      negativeNetTasteFamilies: meaningfulTaste.negativeNetTasteFamilies,
      allCandidateTasteFamilies: meaningfulTaste.allCandidateTasteFamilies,
    },
    ignoredNarrativePhrases,
    unmappedNarrativeCues,
    futureAliasCandidates,
    cueClassifications,
    canonicalCueMissingFamily,
    genuineAliasCandidateCues,
    narrativeCuePolarityOutcomes: cueClassifications.map((cue) => ({
      phrase: cue.phrase,
      expectedFamily: cue.expectedFamily,
      productionFamilyPolarity: cue.productionFamilyPolarity,
      finalDiagnosticState: cue.finalDiagnosticState,
      explanation: cue.explanation,
    })),
    falseUnmappedSuppressed,
    parserConfidence,
    expectedVsExtractedFamilyEvidence: {
      expectedFamiliesByCue: expectedByFamily,
      expectedEvidenceByFamily,
      extractedLikedFamilies,
      extractedDislikedFamilies,
      allExtractedFamilies,
      positiveNetTasteFamilies: meaningfulTaste.positiveNetTasteFamilies,
      negativeNetTasteFamilies: meaningfulTaste.negativeNetTasteFamilies,
      missingExpectedFamilies,
      mappedButNonPositiveExpectedFamilies,
      expectedFamilyCount: expectedFamilies.length,
      extractedExpectedFamilyCount: matchedExpectedFamilyCount,
    },
  };
}

function adultTasteWeightedPolarity(profile: TasteProfile): Record<string, { decision?: string; positiveWeight?: number; negativeWeight?: number; netWeight?: number; positiveCount?: number; negativeCount?: number }> {
  const raw = profile.diagnostics?.adultTasteWeightedPolarityByFamily;
  return raw && typeof raw === "object" && !Array.isArray(raw)
    ? raw as Record<string, { decision?: string; positiveWeight?: number; negativeWeight?: number; netWeight?: number; positiveCount?: number; negativeCount?: number }>
    : {};
}

function adultGoogleBooksWeightedCounterfactualDecision(
  profile: TasteProfile,
  meaningfulTaste: ReturnType<typeof adultGoogleBooksMeaningfulTasteEligibility>,
  currentProfileLikedFamilies: string[],
  currentProfileAvoidFamilies: string[],
): {
  currentPassed: boolean;
  weightedPassed: boolean;
  reason: string;
  changedFamilies: string[];
  weightedPositiveFamilies: string[];
  weightedAvoidFamilies: string[];
  weightedMixedFamilies: string[];
  currentOverlappingFamilies: string[];
} {
  const polarity = adultTasteWeightedPolarity(profile);
  const likedFamilies = Array.from(new Set(meaningfulTaste.likedSignals.map(adultOpenLibraryPrimaryContentFamily).filter(Boolean)));
  const dislikedFamilies = Array.from(new Set(meaningfulTaste.dislikedSignals.map(adultOpenLibraryPrimaryContentFamily).filter(Boolean)));
  const candidateFamilies = Array.from(new Set([...likedFamilies, ...dislikedFamilies]));
  const weightedPositiveFamilies = likedFamilies.filter((family) => {
    const decision = String(polarity[family]?.decision || "");
    return ["strongly_liked", "weakly_liked", "mixed_positive"].includes(decision);
  });
  const weightedAvoidFamilies = candidateFamilies.filter((family) => String(polarity[family]?.decision || "") === "true_avoid");
  const weightedMixedFamilies = candidateFamilies.filter((family) => /^mixed_/.test(String(polarity[family]?.decision || "")));
  const currentOverlappingFamilies = candidateFamilies.filter((family) => currentProfileLikedFamilies.includes(family) && currentProfileAvoidFamilies.includes(family));
  const changedFamilies = candidateFamilies.filter((family) => {
    const currentLiked = currentProfileLikedFamilies.includes(family);
    const currentAvoid = currentProfileAvoidFamilies.includes(family);
    const decision = String(polarity[family]?.decision || "");
    const weightedLiked = ["strongly_liked", "weakly_liked", "mixed_positive"].includes(decision);
    const weightedAvoid = decision === "true_avoid";
    return currentLiked !== weightedLiked || currentAvoid !== weightedAvoid;
  });

  const nonFamilyCurrentPass = meaningfulTaste.passed && meaningfulTaste.tasteEvidenceSource !== "family";
  const weightedPassed = weightedPositiveFamilies.length > 0
    || nonFamilyCurrentPass
    || (meaningfulTaste.specificToneThemeLikedSignals.length >= 2 && meaningfulTaste.specificToneThemeLikedSignals.length > meaningfulTaste.dislikedSignals.length);
  let reason = "weighted_model_matches_current_binary_result";
  if (!meaningfulTaste.passed && weightedPassed) {
    reason = weightedPositiveFamilies.length > 0
      ? "would_pass_weighted_positive_profile_family"
      : "would_pass_existing_nonfamily_taste_rule";
  } else if (meaningfulTaste.passed && !weightedPassed) {
    reason = weightedAvoidFamilies.length > 0
      ? "would_fail_weighted_true_avoid_profile_family"
      : "would_fail_no_weighted_positive_profile_family";
  } else if (currentOverlappingFamilies.length > 0 && weightedPositiveFamilies.some((family) => currentOverlappingFamilies.includes(family))) {
    reason = "weighted_model_resolves_binary_overlap_as_net_positive";
  } else if (currentOverlappingFamilies.length > 0 && weightedAvoidFamilies.some((family) => currentOverlappingFamilies.includes(family))) {
    reason = "weighted_model_preserves_overlap_as_true_avoid";
  }

  return {
    currentPassed: meaningfulTaste.passed,
    weightedPassed,
    reason,
    changedFamilies,
    weightedPositiveFamilies,
    weightedAvoidFamilies,
    weightedMixedFamilies,
    currentOverlappingFamilies,
  };
}

function adultGoogleBooksNarrativeEvidence(candidate: ScoredCandidate): string[] {
  const fields = adultGoogleBooksMetadataFields(candidate);
  const signals: string[] = [];
  if (/\b(follows|story of|tells the story|centers on|must survive|must uncover|must confront|must choose|must save|protagonist|heroine|hero|detective|character|characters|family saga)\b/.test(fields.description)) {
    signals.push("narrative_description_shape");
  }
  const hasAcademicFraming = /\b(?:this (?:book|text|study|work|volume|anthology|collection|guide|reference)|examines?|explores? the|analysis of|study of|in this (?:volume|collection|anthology|survey)|scholarship|scholarly|literary criticism|critical (?:study|analysis|essays?)|this anthology|this collection)\b/.test(fields.description);
  if (!hasAcademicFraming && /\b(novel|fiction|thriller|mystery|fantasy|romance|science fiction|historical fiction|horror|saga)\b/.test(`${fields.subtitle} ${fields.description}`)) {
    signals.push("narrative_subtitle_or_description_marker");
  }
  return Array.from(new Set(signals));
}

function adultGoogleBooksCredibleFictionSignals(candidate: ScoredCandidate): string[] {
  const fields = adultGoogleBooksMetadataFields(candidate);
  const signals: string[] = [];
  // Only count first-class fiction categories — not Literary Criticism categories that merely mention fiction topics.
  const firstClassFiction = adultGoogleBooksFirstClassFictionCategories(candidate);
  if (firstClassFiction.length > 0) {
    signals.push("fiction_category_or_genre");
  }
  if (/\b(a novel|novel|fiction|thriller|mystery|fantasy|romance|science fiction|historical fiction|horror)\b/.test(fields.subtitle)) {
    signals.push("fiction_subtitle");
  }
  return Array.from(new Set(signals));
}

function adultGoogleBooksStrongIncompatibility(candidate: ScoredCandidate): string[] {
  const fields = adultGoogleBooksMetadataFields(candidate);
  const incompatibilities: string[] = [];
  if (/\b(young adult reference|for young adults|juvenile fiction|children'?s books?|middle grade|ages?\s*(?:8|9|10|11|12|13|14|15|16|17)\b)\b/.test(fields.combined)) {
    incompatibilities.push("juvenile_or_ya_reference_incompatibility");
  }
  if (/\b(history of(?: [a-z-]+){0,4} literature|history of literature|literary history|criticism and interpretation|critical studies?|critical study|history and criticism|companion to|authors and artists for young adults|book reviews? of fiction|reviews? of fiction|places to sell manuscripts?|markets?\s+for\s+writ(?:er|ers)|manuscript markets?|writer directory|submission guide)\b/.test(fields.combined)) {
    incompatibilities.push("reference_or_criticism_incompatibility");
  }
  return Array.from(new Set(incompatibilities));
}

function adultGoogleBooksWorkIdentitySignals(candidate: ScoredCandidate): string[] {
  const fields = adultGoogleBooksMetadataFields(candidate);
  const signals: string[] = [];
  // Signal 1: first-class fiction category (not Literary Criticism about fiction).
  const firstClassFiction = adultGoogleBooksFirstClassFictionCategories(candidate);
  if (firstClassFiction.length > 0) signals.push("first_class_fiction_category");
  // Signal 2: subtitle identifies the work as a novel.
  if (/\ba novel\b/.test(fields.subtitle) || /\ba (?:fantasy|horror|thriller|mystery|romance|science fiction|historical) novel\b/.test(fields.subtitle)) {
    signals.push("subtitle_identifies_as_novel");
  }
  // Signal 3: title contains "a novel".
  if (/\ba novel\b/.test(fields.title)) signals.push("title_identifies_as_novel");
  // Signal 4: character/event-centered synopsis with no academic or collection framing.
  const hasAcademicOrCollectionFraming = /\b(?:this (?:book|text|study|work|volume|anthology|collection|guide|reference|manual|handbook)|examines?|explores? the|analysis of|study of|in this (?:volume|collection|anthology|survey)|scholarship|scholarly|literary criticism|critical (?:study|analysis|essays?)|this anthology|this collection|how to|guide to writing|for writers?|writing craft|story craft|narrative technique|plot development|character creation)\b/.test(fields.description);
  const hasNarrativeSynopsis = /\b(?:follows|story of|tells the story|centers on|must survive|must uncover|must confront|must choose|must save|protagonist|heroine|hero|detective|characters?|family saga)\b/.test(fields.description);
  if (hasNarrativeSynopsis && !hasAcademicOrCollectionFraming) signals.push("character_event_synopsis_without_academic_framing");
  return Array.from(new Set(signals));
}

function adultGoogleBooksFinalEligibility(candidate: ScoredCandidate, profile: TasteProfile): AdultGoogleBooksEligibility {
  if (profile.ageBand !== "adult" || candidate.source !== "googleBooks") {
    return {
      allowed: true,
      reason: "not_adult_googlebooks_candidate",
      artifactReasons: [],
      referenceSurveyReasons: [],
      encyclopediaReferenceReasons: [],
      multiVolumeReferenceCorroboration: [],
      annualAnthologyReasons: [],
      anthologyCorroboration: [],
      instructionalCraftReasons: [],
      narrativeEvidence: [],
      credibleFictionSignals: [],
      workIdentitySignals: [],
      documentBackedLikedSignals: [],
      documentBackedDislikedSignals: [],
      positiveNetTasteFamilies: [],
      meaningfulTastePassed: true,
      meaningfulTasteFailureReason: "not_applicable",
      strongNarrativeOverrideBlockedByTaste: false,
      sourceQualityScore: Number(candidate.scoreBreakdown?.sourceQualityRelevance || 0),
      sourceQualityFailureReasons: [],
      strongNarrativeOverrideApplied: false,
      periodicalCorroboration: [],
      allCandidateTasteFamilies: [],
      negativeNetTasteFamilies: [],
      tasteEvidenceSource: "not_applicable",
      likedSignalCount: 0,
      threshold: "not_applicable",
      specificToneThemeLikedSignals: [],
      broadToneLikedSignals: [],
      contextOnlyLikedSignals: [],
      productionDecisionReason: "not_applicable",
      canonicalNarrativeFamilyPromotions: [],
      canonicalMissingFamilyBefore: [],
      canonicalMissingFamilyAfter: [],
    };
  }
  const encyclopediaReference = adultGoogleBooksEncyclopediaReferenceSignals(candidate);
  const annualAnthology = adultGoogleBooksAnnualAnthologySignals(candidate);
  const referenceSurveyReasons = [...adultGoogleBooksReferenceSurveyReasons(candidate), ...encyclopediaReference.reasons];
  const instructionalCraftReasons = adultGoogleBooksInstructionalCraftReasons(candidate);
  const artifactReasons = [...adultGoogleBooksArtifactReasons(candidate), ...referenceSurveyReasons, ...annualAnthology.reasons, ...instructionalCraftReasons];
  const narrativeEvidence = adultGoogleBooksNarrativeEvidence(candidate);
  const credibleFictionSignals = adultGoogleBooksCredibleFictionSignals(candidate);
  const incompatibilities = adultGoogleBooksStrongIncompatibility(candidate);
  const workIdentitySignals = adultGoogleBooksWorkIdentitySignals(candidate);
  const meaningfulTasteBeforePromotion = adultGoogleBooksMeaningfulTasteEligibility(candidate, profile);
  const canonicalPromotions = adultGoogleBooksCanonicalNarrativeFamilyPromotions(candidate, profile, meaningfulTasteBeforePromotion);
  const meaningfulTaste = adultGoogleBooksMeaningfulTasteEligibility(candidate, profile, canonicalPromotions);
  const canonicalMissingFamilyBefore = adultGoogleBooksCanonicalMissingFamilyRows(candidate, meaningfulTasteBeforePromotion);
  const canonicalMissingFamilyAfter = adultGoogleBooksCanonicalMissingFamilyRows(candidate, meaningfulTaste);
  const canonicalPromotionDiagnostics = canonicalPromotions.map((promotion) => ({
    ...promotion,
    meaningfulAlignmentAfter: meaningfulTaste.passed
      ? `passed:${meaningfulTaste.reason}`
      : `failed:${meaningfulTaste.reason}`,
  }));
  const periodicalCorroboration = adultGoogleBooksPeriodicalCorroboration(candidate);
  // Collect all taste-diagnostic fields once so every return object below can spread them without repetition.
  const tasteDiagnosticFields = {
    allCandidateTasteFamilies: meaningfulTaste.allCandidateTasteFamilies,
    negativeNetTasteFamilies: meaningfulTaste.negativeNetTasteFamilies,
    tasteEvidenceSource: meaningfulTaste.tasteEvidenceSource,
    likedSignalCount: meaningfulTaste.likedSignalCount,
    threshold: meaningfulTaste.threshold,
    specificToneThemeLikedSignals: meaningfulTaste.specificToneThemeLikedSignals,
    broadToneLikedSignals: meaningfulTaste.broadToneLikedSignals,
    contextOnlyLikedSignals: meaningfulTaste.contextOnlyLikedSignals,
    productionDecisionReason: meaningfulTaste.productionDecisionReason,
    canonicalNarrativeFamilyPromotions: canonicalPromotionDiagnostics,
    canonicalMissingFamilyBefore,
    canonicalMissingFamilyAfter,
  };
  const sourceQuality = Number(candidate.scoreBreakdown?.sourceQualityRelevance || 0);
  const strongWorkIdentity = workIdentitySignals.length > 0;
  const hasUsableTitle = Boolean(candidate.title && String(candidate.title).trim().length > 0);
  const hasUsableAuthor = Array.isArray(candidate.creators) && candidate.creators.some((name) => String(name || "").trim().length > 0);
  const hasAdultCompatibleMetadata = incompatibilities.length === 0;
  const hasNonNegativeTotalScore = Number(candidate.score || 0) >= 0;
  const sourceQualityFailureReasons: string[] = [];
  if (sourceQuality <= 0) sourceQualityFailureReasons.push("source_quality_not_positive");
  if (!hasUsableTitle) sourceQualityFailureReasons.push("missing_usable_title");
  if (!hasUsableAuthor) sourceQualityFailureReasons.push("missing_usable_author");
  if (!hasAdultCompatibleMetadata) sourceQualityFailureReasons.push("adult_incompatible_metadata");
  if (!hasNonNegativeTotalScore) sourceQualityFailureReasons.push("total_score_negative");

  if (artifactReasons.length > 0) {
    return {
      allowed: false,
      reason: "adult_googlebooks_artifact_or_reference_shape",
      artifactReasons,
      referenceSurveyReasons,
      encyclopediaReferenceReasons: encyclopediaReference.reasons,
      multiVolumeReferenceCorroboration: encyclopediaReference.multiVolumeCorroboration,
      annualAnthologyReasons: annualAnthology.reasons,
      anthologyCorroboration: annualAnthology.corroboration,
      instructionalCraftReasons,
      narrativeEvidence,
      credibleFictionSignals,
      workIdentitySignals,
      documentBackedLikedSignals: meaningfulTaste.likedSignals,
      documentBackedDislikedSignals: meaningfulTaste.dislikedSignals,
      positiveNetTasteFamilies: meaningfulTaste.positiveNetTasteFamilies,
      meaningfulTastePassed: meaningfulTaste.passed,
      meaningfulTasteFailureReason: meaningfulTaste.reason,
      strongNarrativeOverrideBlockedByTaste: false,
      sourceQualityScore: sourceQuality,
      sourceQualityFailureReasons,
      strongNarrativeOverrideApplied: false,
      periodicalCorroboration,
      ...tasteDiagnosticFields,
    };
  }
  if (incompatibilities.length > 0) {
    return {
      allowed: false,
      reason: "adult_googlebooks_strong_juvenile_or_reference_incompatibility",
      artifactReasons: [...artifactReasons, ...incompatibilities],
      referenceSurveyReasons,
      encyclopediaReferenceReasons: encyclopediaReference.reasons,
      multiVolumeReferenceCorroboration: encyclopediaReference.multiVolumeCorroboration,
      annualAnthologyReasons: annualAnthology.reasons,
      anthologyCorroboration: annualAnthology.corroboration,
      instructionalCraftReasons,
      narrativeEvidence,
      credibleFictionSignals,
      workIdentitySignals,
      documentBackedLikedSignals: meaningfulTaste.likedSignals,
      documentBackedDislikedSignals: meaningfulTaste.dislikedSignals,
      positiveNetTasteFamilies: meaningfulTaste.positiveNetTasteFamilies,
      meaningfulTastePassed: meaningfulTaste.passed,
      meaningfulTasteFailureReason: meaningfulTaste.reason,
      strongNarrativeOverrideBlockedByTaste: false,
      sourceQualityScore: sourceQuality,
      sourceQualityFailureReasons,
      strongNarrativeOverrideApplied: false,
      periodicalCorroboration,
      ...tasteDiagnosticFields,
    };
  }
  if (!meaningfulTaste.passed) {
    return {
      allowed: false,
      reason: "adult_googlebooks_missing_meaningful_document_taste_alignment",
      artifactReasons,
      referenceSurveyReasons,
      encyclopediaReferenceReasons: encyclopediaReference.reasons,
      multiVolumeReferenceCorroboration: encyclopediaReference.multiVolumeCorroboration,
      annualAnthologyReasons: annualAnthology.reasons,
      anthologyCorroboration: annualAnthology.corroboration,
      instructionalCraftReasons,
      narrativeEvidence,
      credibleFictionSignals,
      workIdentitySignals,
      documentBackedLikedSignals: meaningfulTaste.likedSignals,
      documentBackedDislikedSignals: meaningfulTaste.dislikedSignals,
      positiveNetTasteFamilies: meaningfulTaste.positiveNetTasteFamilies,
      meaningfulTastePassed: false,
      meaningfulTasteFailureReason: meaningfulTaste.reason,
      strongNarrativeOverrideBlockedByTaste: true,
      sourceQualityScore: sourceQuality,
      sourceQualityFailureReasons,
      strongNarrativeOverrideApplied: false,
      periodicalCorroboration,
      ...tasteDiagnosticFields,
    };
  }

  if (sourceQuality <= 0) {
    const strongNarrativeOverride = strongWorkIdentity
      && hasUsableTitle
      && hasUsableAuthor
      && hasAdultCompatibleMetadata
      && hasNonNegativeTotalScore
      && meaningfulTaste.passed;
    if (!strongNarrativeOverride) {
      return {
        allowed: false,
        reason: "adult_googlebooks_source_quality_not_positive",
        artifactReasons,
        referenceSurveyReasons,
        encyclopediaReferenceReasons: encyclopediaReference.reasons,
        multiVolumeReferenceCorroboration: encyclopediaReference.multiVolumeCorroboration,
        annualAnthologyReasons: annualAnthology.reasons,
        anthologyCorroboration: annualAnthology.corroboration,
        instructionalCraftReasons,
        narrativeEvidence,
        credibleFictionSignals,
        workIdentitySignals,
        documentBackedLikedSignals: meaningfulTaste.likedSignals,
        documentBackedDislikedSignals: meaningfulTaste.dislikedSignals,
        positiveNetTasteFamilies: meaningfulTaste.positiveNetTasteFamilies,
        meaningfulTastePassed: meaningfulTaste.passed,
        meaningfulTasteFailureReason: meaningfulTaste.reason,
        strongNarrativeOverrideBlockedByTaste: meaningfulTaste.passed ? false : true,
        sourceQualityScore: sourceQuality,
        sourceQualityFailureReasons,
        strongNarrativeOverrideApplied: false,
        periodicalCorroboration,
        ...tasteDiagnosticFields,
      };
    }
    return {
      allowed: true,
      reason: "adult_googlebooks_minimal_final_gate_passed_with_strong_narrative_override",
      artifactReasons,
      referenceSurveyReasons,
      encyclopediaReferenceReasons: encyclopediaReference.reasons,
      multiVolumeReferenceCorroboration: encyclopediaReference.multiVolumeCorroboration,
      annualAnthologyReasons: annualAnthology.reasons,
      anthologyCorroboration: annualAnthology.corroboration,
      instructionalCraftReasons,
      narrativeEvidence,
      credibleFictionSignals,
      workIdentitySignals,
      documentBackedLikedSignals: meaningfulTaste.likedSignals,
      documentBackedDislikedSignals: meaningfulTaste.dislikedSignals,
      positiveNetTasteFamilies: meaningfulTaste.positiveNetTasteFamilies,
      meaningfulTastePassed: meaningfulTaste.passed,
      meaningfulTasteFailureReason: meaningfulTaste.reason,
      strongNarrativeOverrideBlockedByTaste: false,
      sourceQualityScore: sourceQuality,
      sourceQualityFailureReasons,
      strongNarrativeOverrideApplied: true,
      periodicalCorroboration,
      ...tasteDiagnosticFields,
    };
  }

  // Strong work identity is sufficient for fiction shape when artifact and incompatibility checks pass.
  if (!strongWorkIdentity) {
    if (credibleFictionSignals.length === 0) {
      return {
        allowed: false,
        reason: "adult_googlebooks_missing_credible_fiction_signal",
        artifactReasons,
        referenceSurveyReasons,
        encyclopediaReferenceReasons: encyclopediaReference.reasons,
        multiVolumeReferenceCorroboration: encyclopediaReference.multiVolumeCorroboration,
        annualAnthologyReasons: annualAnthology.reasons,
        anthologyCorroboration: annualAnthology.corroboration,
        instructionalCraftReasons,
        narrativeEvidence,
        credibleFictionSignals,
        workIdentitySignals,
        documentBackedLikedSignals: meaningfulTaste.likedSignals,
        documentBackedDislikedSignals: meaningfulTaste.dislikedSignals,
        positiveNetTasteFamilies: meaningfulTaste.positiveNetTasteFamilies,
        meaningfulTastePassed: meaningfulTaste.passed,
        meaningfulTasteFailureReason: meaningfulTaste.reason,
        strongNarrativeOverrideBlockedByTaste: false,
        sourceQualityScore: sourceQuality,
        sourceQualityFailureReasons,
        strongNarrativeOverrideApplied: false,
        periodicalCorroboration,
        ...tasteDiagnosticFields,
      };
    }
    if (narrativeEvidence.length === 0) {
      return {
        allowed: false,
        reason: "adult_googlebooks_missing_narrative_metadata_evidence",
        artifactReasons,
        referenceSurveyReasons,
        encyclopediaReferenceReasons: encyclopediaReference.reasons,
        multiVolumeReferenceCorroboration: encyclopediaReference.multiVolumeCorroboration,
        annualAnthologyReasons: annualAnthology.reasons,
        anthologyCorroboration: annualAnthology.corroboration,
        instructionalCraftReasons,
        narrativeEvidence,
        credibleFictionSignals,
        workIdentitySignals,
        documentBackedLikedSignals: meaningfulTaste.likedSignals,
        documentBackedDislikedSignals: meaningfulTaste.dislikedSignals,
        positiveNetTasteFamilies: meaningfulTaste.positiveNetTasteFamilies,
        meaningfulTastePassed: meaningfulTaste.passed,
        meaningfulTasteFailureReason: meaningfulTaste.reason,
        strongNarrativeOverrideBlockedByTaste: false,
        sourceQualityScore: sourceQuality,
        sourceQualityFailureReasons,
        strongNarrativeOverrideApplied: false,
        periodicalCorroboration,
        ...tasteDiagnosticFields,
      };
    }
  }
  return {
    allowed: true,
    reason: "adult_googlebooks_minimal_final_gate_passed",
    artifactReasons,
    referenceSurveyReasons,
    encyclopediaReferenceReasons: encyclopediaReference.reasons,
    multiVolumeReferenceCorroboration: encyclopediaReference.multiVolumeCorroboration,
    annualAnthologyReasons: annualAnthology.reasons,
    anthologyCorroboration: annualAnthology.corroboration,
    instructionalCraftReasons,
    narrativeEvidence,
    credibleFictionSignals,
    workIdentitySignals,
    documentBackedLikedSignals: meaningfulTaste.likedSignals,
    documentBackedDislikedSignals: meaningfulTaste.dislikedSignals,
    positiveNetTasteFamilies: meaningfulTaste.positiveNetTasteFamilies,
    meaningfulTastePassed: meaningfulTaste.passed,
    meaningfulTasteFailureReason: meaningfulTaste.reason,
    strongNarrativeOverrideBlockedByTaste: false,
    sourceQualityScore: sourceQuality,
    sourceQualityFailureReasons,
    strongNarrativeOverrideApplied: false,
    periodicalCorroboration,
    ...tasteDiagnosticFields,
  };
}

function rejectReason(candidate: ScoredCandidate, profile: TasteProfile): string | null {
  if (!candidate.title.trim()) return "missing_title";
  const googleBooksMaturityReason = googleBooksMaturityRejectReason(candidate, profile);
  if (googleBooksMaturityReason) return googleBooksMaturityReason;
  if (profile.ageBand === "kids" && candidate.source === "googleBooks") {
    const eligibility = kidsGoogleBooksPreScoringEligibility(candidate, profile);
    if (!eligibility.allowed) return eligibility.reason;
  }
  if (profile.ageBand === "kids" && isKidsSuspiciousSelectionCandidate(candidate)) return "k2_suspicious_title_artifact";
  if (profile.ageBand === "kids" && kidsNonNarrativeInformationalArtifact(candidate) && !profileExplicitlyRequestsNonfictionReference(profile)) return "k2_non_narrative_informational_artifact";
  if (profile.ageBand === "kids") {
    const cleanFinalResult = kidsCleanFinalCandidateWithEvidence(candidate);
    if (!cleanFinalResult.passed) {
      candidate.diagnostics = {
        ...(candidate.diagnostics || {}),
        kidsGoogleBooksCleanFinalGatePassed: false,
        kidsGoogleBooksCleanFinalGateEvidence: cleanFinalResult.evidence,
        kidsGoogleBooksCleanFinalGateFailedCheck: cleanFinalResult.failedCheck,
      };
      return cleanFinalResult.reason;
    }
    candidate.diagnostics = {
      ...(candidate.diagnostics || {}),
      kidsGoogleBooksCleanFinalGatePassed: true,
      kidsGoogleBooksCleanFinalGateEvidence: cleanFinalResult.evidence,
      kidsGoogleBooksCleanFinalGateFailedCheck: "",
    };
  }
  if (profile.ageBand === "preteens") {
    if (candidate.rejectedReasons.includes("middle_grades_replaced_by_stronger_franchise_representative")) return "middle_grades_replaced_by_stronger_franchise_representative";
    const eligibility = middleGradesFinalEligibility(candidate);
    if (!eligibility.allowed) return eligibility.rejectedReason || "middle_grades_final_eligibility_missing_evidence";
    if (middleGradesNonNarrativeInformationalArtifact(candidate) && !profileExplicitlyRequestsNonfictionReference(profile)) return "middle_grades_non_narrative_informational_artifact";
    const tasteEligibility = middleGradesMeaningfulTasteEligibility(candidate, true);
    if (!tasteEligibility.allowed) return tasteEligibility.reason || "middle_grades_missing_meaningful_taste_evidence";
    if (candidate.source === "googleBooks") {
      const publicationIdentity = preteenGoogleBooksPublicationIdentityAudit(candidate);
      annotatePreteenGoogleBooksPublicationIdentity(candidate, publicationIdentity);
      if (!publicationIdentity.allowed) return publicationIdentity.reason;
    }
  }
  if (profile.ageBand === "teens" && candidate.source === "openLibrary") {
    const eligibility = teenOpenLibraryMeaningfulTasteEligibility(candidate, profile);
    if (!eligibility.allowed) return eligibility.reason || "teen_openlibrary_no_meaningful_metadata_taste";
  }
  if (profile.ageBand === "teens" && candidate.source === "googleBooks") {
    const publicationIdentity = teenGoogleBooksPublicationIdentityAudit(candidate, profile);
    candidate.diagnostics = {
      ...(candidate.diagnostics || {}),
      teenGoogleBooksPublicationIdentityDecision: publicationIdentity.decision,
      teenGoogleBooksPublicationIdentityReason: publicationIdentity.reason,
      teenGoogleBooksPublicationIdentityClassification: publicationIdentity.classification,
      teenGoogleBooksPublicationIdentityEvidence: publicationIdentity.evidence,
    };
    if (!publicationIdentity.allowed) return publicationIdentity.reason;
  }
  if (profile.ageBand === "adult" && candidate.source === "openLibrary") {
    const eligibility = adultOpenLibraryMeaningfulTasteEligibility(candidate, profile);
    if (!eligibility.allowed) return eligibility.reason || "adult_openlibrary_no_meaningful_metadata_taste";
  }
  if (profile.ageBand === "adult" && candidate.source === "googleBooks") {
    const eligibility = adultGoogleBooksFinalEligibility(candidate, profile);
    if (!eligibility.allowed) return eligibility.reason;
    const identityEnforcement = adultGoogleBooksIdentityEnforcement(candidate, eligibility);
    if (identityEnforcement.decision === "rejected") return identityEnforcement.reason;
  }
  if (candidate.score <= 0 && !isContemporaryLowScoreAcceptable(candidate, profile)) return "non_positive_score";
  const hasMaturityBandMismatch = candidate.maturityBand && String(candidate.maturityBand) !== profile.maturityBand && profile.ageBand !== "adult";
  if (hasMaturityBandMismatch && profile.ageBand === "teens" && candidate.source === "googleBooks") {
    const teenAudienceAudit = teenGoogleBooksAudienceReconciliationAudit(candidate, profile);
    candidate.diagnostics = {
      ...(candidate.diagnostics || {}),
      teenGoogleBooksAudienceReconciliationDecision: teenAudienceAudit.allowed ? "rescued" : "rejected",
      teenGoogleBooksAudienceReconciliationReason: teenAudienceAudit.reason,
      teenGoogleBooksAudienceReconciliationEvidence: teenAudienceAudit.evidence,
    };
    if (teenAudienceAudit.allowed) return null;
  }
  if (hasMaturityBandMismatch) return "maturity_band_mismatch";
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

function addAdultGoogleBooksSelectionObservability(rankedCandidates: ScoredCandidate[], selected: ScoredCandidate[], rejectedReasons: Record<string, number>, profile: TasteProfile): void {
  const diagnostics = rejectedReasons as Record<string, unknown>;
  const eligibilityReasonByTitle: Record<string, string> = {};
  const artifactReasonsByTitle: Record<string, string[]> = {};
  const narrativeEvidenceByTitle: Record<string, string[]> = {};
  const credibleFictionSignalsByTitle: Record<string, string[]> = {};
  const workIdentitySignalsByTitle: Record<string, string[]> = {};
  const sourceQualityScoreByTitle: Record<string, number> = {};
  const sourceQualityFailureReasonsByTitle: Record<string, string[]> = {};
  const strongNarrativeOverrideAppliedByTitle: Record<string, boolean> = {};
  const strongNarrativeOverrideBlockedByTasteByTitle: Record<string, boolean> = {};
  const periodicalCorroborationByTitle: Record<string, string[]> = {};
  const instructionalCraftReasonsByTitle: Record<string, string[]> = {};
  const referenceSurveyReasonsByTitle: Record<string, string[]> = {};
  const encyclopediaReferenceReasonsByTitle: Record<string, string[]> = {};
  const multiVolumeReferenceCorroborationByTitle: Record<string, string[]> = {};
  const annualAnthologyReasonsByTitle: Record<string, string[]> = {};
  const anthologyCorroborationByTitle: Record<string, string[]> = {};
  const authorCapAppliedByTitle: Record<string, boolean> = {};
  const seriesCapAppliedByTitle: Record<string, boolean> = {};
  const normalizedSeriesRootByTitle: Record<string, string> = {};
  const documentBackedLikedSignalsByTitle: Record<string, string[]> = {};
  const documentBackedDislikedSignalsByTitle: Record<string, string[]> = {};
  const positiveNetTasteFamiliesByTitle: Record<string, string[]> = {};
  const meaningfulTastePassedByTitle: Record<string, boolean> = {};
  const meaningfulTasteFailureReasonByTitle: Record<string, string> = {};
  const broadToneOnlyRejectedByTitle: Record<string, boolean> = {};
  const candidateTasteFamiliesByTitle: Record<string, string[]> = {};
  const negativeNetTasteFamiliesByTitle: Record<string, string[]> = {};
  const tasteEvidenceSourceByTitle: Record<string, string> = {};
  const meaningfulAlignmentScoreByTitle: Record<string, number> = {};
  const meaningfulAlignmentThresholdByTitle: Record<string, string> = {};
  const candidateDocumentSignalsByTitle: Record<string, { liked: string[]; disliked: string[] }> = {};
  const specificTasteEvidenceByTitle: Record<string, string[]> = {};
  const broadToneEvidenceByTitle: Record<string, string[]> = {};
  const contextOnlyEvidenceByTitle: Record<string, string[]> = {};
  const meaningfulAlignmentRuleByTitle: Record<string, string> = {};
  const meaningfulAlignmentDecisionByTitle: Record<string, string> = {};
  const meaningfulAlignmentOverrideByTitle: Record<string, string> = {};
  const avoidFamilyOverlapByTitle: Record<string, string[]> = {};
  const weightedCounterfactualCandidateDecisionByTitle: Record<string, Record<string, unknown>> = {};
  const weightedCounterfactualNewPassTitles: string[] = [];
  const weightedCounterfactualNewFailTitles: string[] = [];
  const weightedProductionDecisionReasonByTitle: Record<string, string> = {};
  const weightedProductionNewPassTitles: string[] = [];
  const weightedProductionNewFailTitles: string[] = [];
  const overlapAffectedCandidateTitlesByFamily: Record<string, string[]> = {};
  const productionNonPositiveFamilyPresenceRuleHistogram: Record<string, number> = {};
  const productionNonPositiveFamilyPresenceCandidatesByRule: Record<string, string[]> = {};
  const productionNonPositiveFamilyPresenceFamiliesByTitle: Record<string, string[]> = {};
  const productionNonPositiveFamilyPresenceDetailsByTitle: Record<string, unknown[]> = {};
  const polarityFamilyEffectByTitle: Record<string, unknown[]> = {};
  const polarityFamilyEffectHistogram: Record<string, number> = {};
  const polarityFamilyPositiveSupportSuppressedByTitle: Record<string, unknown[]> = {};
  const polarityNondecisiveEffectsByTitle: Record<string, unknown[]> = {};
  const polarityDecisiveRejectionByTitle: Record<string, unknown> = {};
  const polarityMultiFactorRejectionByTitle: Record<string, unknown> = {};
  const polarityUnrelatedRejectionByTitle: Record<string, unknown> = {};
  const polarityCausalityStateByTitle: Record<string, string> = {};
  const polarityCausalityHistogram: Record<string, number> = {};
  const polarityCounterfactualsByTitle: Record<string, unknown[]> = {};
  const polarityCounterfactualPassTitles: string[] = [];
  const polarityCounterfactualStillFailTitles: string[] = [];
  const polarityDecisiveRuleHistogram: Record<string, number> = {};
  const signalMatchTraceByTitle: Record<string, unknown[]> = {};
  const signalMatchedFieldByTitle: Record<string, Record<string, string[]>> = {};
  const signalMatchedTextByTitle: Record<string, Record<string, string[]>> = {};
  const signalMatchMethodByTitle: Record<string, Record<string, string[]>> = {};
  const shortSignalSubstringMatchesByTitle: Record<string, unknown[]> = {};
  const rejectedShortSignalMatchesByTitle: Record<string, unknown[]> = {};
  const meaningfulAlignmentFailureReasonByTitle: Record<string, string> = {};
  const meaningfulAlignmentFailureDetailsByTitle: Record<string, Record<string, unknown>> = {};
  const meaningfulAlignmentFailureHistogram: Record<string, number> = {};
  const meaningfulAlignmentFailureExamples: Record<string, string[]> = {};
  const narrativeDescriptionByTitle: Record<string, string> = {};
  const narrativeSemanticPhrasesByTitle: Record<string, Record<string, unknown>> = {};
  const narrativeFamilyMappingsByTitle: Record<string, Record<string, unknown>> = {};
  const ignoredNarrativePhrasesByTitle: Record<string, unknown[]> = {};
  const unmappedNarrativeCuesByTitle: Record<string, unknown[]> = {};
  const futureAliasCandidatesByTitle: Record<string, unknown[]> = {};
  const parserConfidenceByTitle: Record<string, number> = {};
  const expectedVsExtractedFamilyEvidenceByTitle: Record<string, Record<string, unknown>> = {};
  const unmappedNarrativePhraseHistogram: Record<string, number> = {};
  const unmappedNarrativeCueHistogramByFamily: Record<string, Record<string, number>> = {};
  const futureAliasCandidateHistogram: Record<string, number> = {};
  const narrativeFamilyExtractionExamplesByFamily: Record<string, unknown[]> = {};
  const narrativeCueClassificationByTitle: Record<string, unknown[]> = {};
  const narrativeCueClassificationHistogram: Record<string, number> = {};
  const canonicalCueMissingFamilyByTitle: Record<string, unknown[]> = {};
  const canonicalCueMissingFamilyHistogram: Record<string, number> = {};
  const genuineAliasCandidatesByTitle: Record<string, unknown[]> = {};
  const genuineAliasCandidateHistogram: Record<string, number> = {};
  const narrativeCuePolarityOutcomeByTitle: Record<string, unknown[]> = {};
  const narrativeCueFalseUnmappedSuppressedByTitle: Record<string, unknown[]> = {};
  const canonicalNarrativeFamilyPromotionsByTitle: Record<string, string[]> = {};
  const canonicalNarrativeFamilyPromotionEvidenceByTitle: Record<string, unknown[]> = {};
  const canonicalNarrativeFamilyPromotionFieldByTitle: Record<string, string[]> = {};
  const canonicalNarrativeFamilyPromotionPhraseByTitle: Record<string, string[]> = {};
  const canonicalNarrativeFamilyPromotionDecisionByTitle: Record<string, unknown[]> = {};
  const canonicalMissingFamilyBeforeByTitle: Record<string, unknown[]> = {};
  const canonicalMissingFamilyAfterByTitle: Record<string, unknown[]> = {};
  const canonicalMissingFamilyResolvedTitles: string[] = [];
  const canonicalMissingFamilyUnresolvedTitles: string[] = [];
  const canonicalNarrativeFamilyPromotionHistogram: Record<string, number> = {};
  const canonicalNarrativeFamilyPromotionEligibilityChanges: Record<string, unknown> = {};
  const finalSlateIdentityByTitle: Record<string, string> = {};
  const finalSlateIdentityEvidenceByTitle: Record<string, Record<string, string[]>> = {};
  const finalSlateIdentityConfidenceByTitle: Record<string, number> = {};
  const finalSlateIdentityAgreementByTitle: Record<string, string> = {};
  const finalSlateIdentityHistogram: Record<string, number> = {};
  const likelyNonNarrativeFalseAcceptedTitles: string[] = [];
  const likelyCollectionFalseAcceptedTitles: string[] = [];
  const likelyNarrativeFalseRejectedTitles: string[] = [];
  const renderedIdentityAudit: Record<string, unknown> = {};
  const finalSlateIdentityRootCauseHistogram: Record<string, number> = {};
  const finalSlateIdentityFlaggedDetailsByTitle: Record<string, unknown> = {};
  const identityEnforcementDecisionByTitle: Record<string, string> = {};
  const identityEnforcementReasonByTitle: Record<string, string> = {};
  const identityRejectedTitles: string[] = [];
  const identityAcceptedTitles: string[] = [];
  const identityEnforcementHistogram: Record<string, number> = {};
  const identityBehaviorChanges: Record<string, unknown> = {};
  const narrativeStrengthScoreByTitle: Record<string, number> = {};
  const narrativeStrengthComponentsByTitle: Record<string, Record<string, number>> = {};
  const narrativeStrengthEvidenceByTitle: Record<string, Record<string, string[]>> = {};
  const narrativeStrengthSelectionScoreByTitle: Record<string, number> = {};
  const narrativeStrengthRankBeforeByTitle: Record<string, number> = {};
  const narrativeStrengthRankAfterByTitle: Record<string, number> = {};
  const narrativeStrengthRankDeltaByTitle: Record<string, number> = {};
  const narrativeStrengthAppliedTitles: string[] = [];
  const narrativeStrengthRankingChanges: Record<string, unknown> = {};
  let profileLikedFamilies: string[] = [];
  let profileAvoidFamilies: string[] = [];
  if (profile.ageBand === "adult") {
    const likedSigs = [
      ...(profile.genreFamily || []).map((s) => String(s.value || "")),
      ...(profile.tone || []).map((s) => String(s.value || "")),
      ...(profile.themes || []).map((s) => String(s.value || "")),
    ].filter(Boolean);
    profileLikedFamilies = Array.from(new Set(likedSigs.map(adultOpenLibraryPrimaryContentFamily).filter(Boolean)));
    const avoidSigs = (profile.avoidSignals || []).map((s) => String(s.value || "")).filter(Boolean);
    profileAvoidFamilies = Array.from(new Set(avoidSigs.map(adultOpenLibraryPrimaryContentFamily).filter(Boolean)));
  }
  const plannedQueries = new Set<string>();
  const queriesAttempted = new Set<string>();
  const rawCountByQuery: Record<string, number> = {};
  const acceptedCountByQuery: Record<string, number> = {};
  const rejectedCountByQueryAndReason: Record<string, Record<string, number>> = {};
  const rejectedTitlesByReason: Record<string, string[]> = {};
  const acceptedTitles: string[] = [];
  const rankedCandidateTitles: string[] = [];
  // Explicit per-title decision maps so no ranked candidate disappears with only a lineage gap.
  const finalEligibilityDecisionByTitle: Record<string, string> = {};
  const finalEligibilityEvidenceByTitle: Record<string, string[]> = {};
  const postRankingGateByTitle: Record<string, string> = {};
  const postRankingGateReasonByTitle: Record<string, string> = {};
  const finalSelectionDecisionByTitle: Record<string, string> = {};
  const finalSelectionExclusionReasonByTitle: Record<string, string> = {};
  if (profile.ageBand !== "adult") {
    diagnostics.adultGoogleBooksFinalGateApplied = false;
    diagnostics.adultGoogleBooksEligibilityReasonByTitle = {};
    diagnostics.adultGoogleBooksArtifactReasonsByTitle = {};
    diagnostics.adultGoogleBooksNarrativeEvidenceByTitle = {};
    diagnostics.adultGoogleBooksCredibleFictionSignalsByTitle = {};
    diagnostics.adultGoogleBooksNarrativeWorkIdentitySignalsByTitle = {};
    diagnostics.adultGoogleBooksSourceQualityScoreByTitle = {};
    diagnostics.adultGoogleBooksSourceQualityFailureReasonsByTitle = {};
    diagnostics.adultGoogleBooksStrongNarrativeOverrideAppliedByTitle = {};
    diagnostics.adultGoogleBooksStrongNarrativeOverrideBlockedByTasteByTitle = {};
    diagnostics.adultGoogleBooksPeriodicalCorroborationByTitle = {};
    diagnostics.adultGoogleBooksInstructionalCraftReasonsByTitle = {};
    diagnostics.adultGoogleBooksReferenceSurveyReasonsByTitle = {};
    diagnostics.adultGoogleBooksEncyclopediaReferenceReasonsByTitle = {};
    diagnostics.adultGoogleBooksMultiVolumeReferenceCorroborationByTitle = {};
    diagnostics.adultGoogleBooksAnnualAnthologyReasonsByTitle = {};
    diagnostics.adultGoogleBooksAnthologyCorroborationByTitle = {};
    diagnostics.adultGoogleBooksAuthorCapAppliedByTitle = {};
    diagnostics.adultGoogleBooksSeriesCapAppliedByTitle = {};
    diagnostics.adultGoogleBooksNormalizedSeriesRootByTitle = {};
    diagnostics.adultGoogleBooksDeferredForAuthorDiversityTitles = [];
    diagnostics.adultGoogleBooksDeferredForSeriesDiversityTitles = [];
    diagnostics.adultGoogleBooksDistinctAuthorCount = 0;
    diagnostics.adultGoogleBooksDistinctSeriesRootCount = 0;
    diagnostics.adultGoogleBooksDocumentBackedLikedSignalsByTitle = {};
    diagnostics.adultGoogleBooksDocumentBackedDislikedSignalsByTitle = {};
    diagnostics.adultGoogleBooksPositiveNetTasteFamiliesByTitle = {};
    diagnostics.adultGoogleBooksMeaningfulTastePassedByTitle = {};
    diagnostics.adultGoogleBooksMeaningfulTasteFailureReasonByTitle = {};
    diagnostics.adultGoogleBooksBroadToneOnlyRejectedByTitle = {};
    diagnostics.adultGoogleBooksCandidateTasteFamiliesByTitle = {};
    diagnostics.adultGoogleBooksNegativeNetTasteFamiliesByTitle = {};
    diagnostics.adultGoogleBooksTasteEvidenceSourceByTitle = {};
    diagnostics.adultGoogleBooksMeaningfulAlignmentScoreByTitle = {};
    diagnostics.adultGoogleBooksMeaningfulAlignmentThresholdByTitle = {};
    diagnostics.adultGoogleBooksProfileLikedFamilies = [];
    diagnostics.adultGoogleBooksProfileAvoidFamilies = [];
    diagnostics.adultGoogleBooksCandidateDocumentSignalsByTitle = {};
    diagnostics.adultGoogleBooksSpecificTasteEvidenceByTitle = {};
    diagnostics.adultGoogleBooksBroadToneEvidenceByTitle = {};
    diagnostics.adultGoogleBooksContextOnlyEvidenceByTitle = {};
    diagnostics.adultGoogleBooksMeaningfulAlignmentRuleByTitle = {};
    diagnostics.adultGoogleBooksMeaningfulAlignmentDecisionByTitle = {};
    diagnostics.adultGoogleBooksMeaningfulAlignmentOverrideByTitle = {};
    diagnostics.adultGoogleBooksAvoidFamilyOverlapByTitle = {};
    diagnostics.adultTasteWeightedCounterfactualCandidateDecisionByTitle = {};
    diagnostics.adultTasteWeightedCounterfactualNewPassTitles = [];
    diagnostics.adultTasteWeightedCounterfactualNewFailTitles = [];
    diagnostics.adultTasteWeightedProductionDecisionReasonByTitle = {};
    diagnostics.adultTasteWeightedProductionNewPassTitles = [];
    diagnostics.adultTasteWeightedProductionNewFailTitles = [];
    diagnostics.adultTasteOverlapAffectedCandidateTitlesByFamily = {};
    diagnostics.adultGoogleBooksProductionNonPositiveFamilyPresenceRuleHistogram = {};
    diagnostics.adultGoogleBooksProductionNonPositiveFamilyPresenceCandidatesByRule = {};
    diagnostics.adultGoogleBooksProductionNonPositiveFamilyPresenceFamiliesByTitle = {};
    diagnostics.adultGoogleBooksProductionNonPositiveFamilyPresenceDetailsByTitle = {};
    diagnostics.adultGoogleBooksFamilyPolarityEffectByTitle = {};
    diagnostics.adultGoogleBooksFamilyPolarityEffectHistogram = {};
    diagnostics.adultGoogleBooksFamilyPositiveSupportSuppressedByTitle = {};
    diagnostics.adultGoogleBooksPolarityNondecisiveEffectsByTitle = {};
    diagnostics.adultGoogleBooksPolarityDecisiveRejectionByTitle = {};
    diagnostics.adultGoogleBooksPolarityMultiFactorRejectionByTitle = {};
    diagnostics.adultGoogleBooksPolarityUnrelatedRejectionByTitle = {};
    diagnostics.adultGoogleBooksPolarityCausalityStateByTitle = {};
    diagnostics.adultGoogleBooksPolarityCausalityHistogram = {};
    diagnostics.adultGoogleBooksPolarityCounterfactualsByTitle = {};
    diagnostics.adultGoogleBooksPolarityCounterfactualPassTitles = [];
    diagnostics.adultGoogleBooksPolarityCounterfactualStillFailTitles = [];
    diagnostics.adultGoogleBooksPolarityDecisiveRuleHistogram = {};
    diagnostics.adultGoogleBooksSignalMatchTraceByTitle = {};
    diagnostics.adultGoogleBooksSignalMatchedFieldByTitle = {};
    diagnostics.adultGoogleBooksSignalMatchedTextByTitle = {};
    diagnostics.adultGoogleBooksSignalMatchMethodByTitle = {};
    diagnostics.adultGoogleBooksShortSignalSubstringMatchesByTitle = {};
    diagnostics.adultGoogleBooksRejectedShortSignalMatchesByTitle = {};
    diagnostics.adultGoogleBooksMeaningfulAlignmentFailureHistogram = {};
    diagnostics.adultGoogleBooksMeaningfulAlignmentFailurePercentages = {};
    diagnostics.adultGoogleBooksMeaningfulAlignmentFailureExamples = {};
    diagnostics.adultGoogleBooksMeaningfulAlignmentFailureReasonByTitle = {};
    diagnostics.adultGoogleBooksMeaningfulAlignmentFailureDetailsByTitle = {};
    diagnostics.adultGoogleBooksMeaningfulAlignmentRootCauseSummary = "";
    diagnostics.adultGoogleBooksNarrativeDescriptionByTitle = {};
    diagnostics.adultGoogleBooksNarrativeSemanticPhrasesByTitle = {};
    diagnostics.adultGoogleBooksNarrativeFamilyMappingsByTitle = {};
    diagnostics.adultGoogleBooksIgnoredNarrativePhrasesByTitle = {};
    diagnostics.adultGoogleBooksUnmappedNarrativeCuesByTitle = {};
    diagnostics.adultGoogleBooksFutureAliasCandidatesByTitle = {};
    diagnostics.adultGoogleBooksNarrativeParserConfidenceByTitle = {};
    diagnostics.adultGoogleBooksExpectedVsExtractedFamilyEvidenceByTitle = {};
    diagnostics.adultGoogleBooksUnmappedNarrativePhraseHistogram = {};
    diagnostics.adultGoogleBooksUnmappedNarrativeCueHistogramByFamily = {};
    diagnostics.adultGoogleBooksFutureAliasCandidateHistogram = {};
    diagnostics.adultGoogleBooksNarrativeFamilyExtractionExamplesByFamily = {};
    diagnostics.adultGoogleBooksNarrativeFamilyExtractionRootCauseSummary = "";
    diagnostics.adultGoogleBooksNarrativeCueClassificationByTitle = {};
    diagnostics.adultGoogleBooksNarrativeCueClassificationHistogram = {};
    diagnostics.adultGoogleBooksCanonicalCueMissingFamilyByTitle = {};
    diagnostics.adultGoogleBooksCanonicalCueMissingFamilyHistogram = {};
    diagnostics.adultGoogleBooksGenuineAliasCandidatesByTitle = {};
    diagnostics.adultGoogleBooksGenuineAliasCandidateHistogram = {};
    diagnostics.adultGoogleBooksNarrativeCuePolarityOutcomeByTitle = {};
    diagnostics.adultGoogleBooksNarrativeCueFalseUnmappedSuppressedByTitle = {};
    diagnostics.adultGoogleBooksNarrativeExtractionDiagnosticSummary = "";
    diagnostics.adultGoogleBooksCanonicalNarrativeFamilyPromotionsByTitle = {};
    diagnostics.adultGoogleBooksCanonicalNarrativeFamilyPromotionEvidenceByTitle = {};
    diagnostics.adultGoogleBooksCanonicalNarrativeFamilyPromotionFieldByTitle = {};
    diagnostics.adultGoogleBooksCanonicalNarrativeFamilyPromotionPhraseByTitle = {};
    diagnostics.adultGoogleBooksCanonicalNarrativeFamilyPromotionDecisionByTitle = {};
    diagnostics.adultGoogleBooksCanonicalMissingFamilyBeforeByTitle = {};
    diagnostics.adultGoogleBooksCanonicalMissingFamilyAfterByTitle = {};
    diagnostics.adultGoogleBooksCanonicalMissingFamilyResolvedTitles = [];
    diagnostics.adultGoogleBooksCanonicalMissingFamilyUnresolvedTitles = [];
    diagnostics.adultGoogleBooksCanonicalNarrativeFamilyPromotionHistogram = {};
    diagnostics.adultGoogleBooksCanonicalNarrativeFamilyPromotionEligibilityChanges = {};
    diagnostics.adultGoogleBooksFinalSlateIdentityByTitle = {};
    diagnostics.adultGoogleBooksFinalSlateIdentityEvidenceByTitle = {};
    diagnostics.adultGoogleBooksFinalSlateIdentityConfidenceByTitle = {};
    diagnostics.adultGoogleBooksFinalSlateIdentityAgreementByTitle = {};
    diagnostics.adultGoogleBooksFinalSlateIdentityHistogram = {};
    diagnostics.adultGoogleBooksLikelyNonNarrativeFalseAcceptedTitles = [];
    diagnostics.adultGoogleBooksLikelyCollectionFalseAcceptedTitles = [];
    diagnostics.adultGoogleBooksLikelyNarrativeFalseRejectedTitles = [];
    diagnostics.adultGoogleBooksRenderedIdentityAudit = {};
    diagnostics.adultGoogleBooksFinalSlateIdentityRootCauseHistogram = {};
    diagnostics.adultGoogleBooksFinalSlateIdentityAuditSummary = "";
    diagnostics.adultGoogleBooksFinalSlateIdentityFlaggedDetailsByTitle = {};
    diagnostics.adultGoogleBooksIdentityEnforcementDecisionByTitle = {};
    diagnostics.adultGoogleBooksIdentityEnforcementReasonByTitle = {};
    diagnostics.adultGoogleBooksIdentityRejectedTitles = [];
    diagnostics.adultGoogleBooksIdentityAcceptedTitles = [];
    diagnostics.adultGoogleBooksIdentityEnforcementHistogram = {};
    diagnostics.adultGoogleBooksIdentityBehaviorChanges = {};
    diagnostics.adultGoogleBooksNarrativeStrengthScoreByTitle = {};
    diagnostics.adultGoogleBooksNarrativeStrengthComponentsByTitle = {};
    diagnostics.adultGoogleBooksNarrativeStrengthEvidenceByTitle = {};
    diagnostics.adultGoogleBooksNarrativeStrengthSelectionScoreByTitle = {};
    diagnostics.adultGoogleBooksNarrativeStrengthRankBeforeByTitle = {};
    diagnostics.adultGoogleBooksNarrativeStrengthRankAfterByTitle = {};
    diagnostics.adultGoogleBooksNarrativeStrengthRankDeltaByTitle = {};
    diagnostics.adultGoogleBooksNarrativeStrengthAppliedTitles = [];
    diagnostics.adultGoogleBooksNarrativeStrengthRankingChanges = {};
    diagnostics.googleBooksPlannedQueries = [];
    diagnostics.googleBooksQueriesAttempted = [];
    diagnostics.googleBooksRawCountByQuery = {};
    diagnostics.googleBooksAcceptedCountByQuery = {};
    diagnostics.googleBooksRejectedCountByQueryAndReason = {};
    diagnostics.googleBooksRetrievalUnderfillReason = undefined;
    diagnostics.adultGoogleBooksRejectedTitlesByReason = {};
    diagnostics.adultGoogleBooksAcceptedTitles = [];
    diagnostics.googleBooksFinalEligibilityDecisionByTitle = {};
    diagnostics.googleBooksFinalEligibilityReasonByTitle = {};
    diagnostics.googleBooksFinalEligibilityEvidenceByTitle = {};
    diagnostics.googleBooksPostRankingGateByTitle = {};
    diagnostics.googleBooksPostRankingGateReasonByTitle = {};
    diagnostics.googleBooksFinalSelectionDecisionByTitle = {};
    diagnostics.googleBooksFinalSelectionExclusionReasonByTitle = {};
    return;
  }

  const selectedTitleSet = new Set(selected.filter((candidate) => candidate.source === "googleBooks").map((candidate) => normalized(candidate.title)));
  const productionPolarityExplanations = adultTasteProductionPolarityExplanations(profile);
  for (const candidate of rankedCandidates.filter((row) => row.source === "googleBooks")) {
    rankedCandidateTitles.push(candidate.title);
    narrativeStrengthScoreByTitle[candidate.title] = Number(candidate.diagnostics?.adultGoogleBooksNarrativeStrengthScore || 0);
    narrativeStrengthComponentsByTitle[candidate.title] = candidate.diagnostics?.adultGoogleBooksNarrativeStrengthComponents && typeof candidate.diagnostics.adultGoogleBooksNarrativeStrengthComponents === "object" && !Array.isArray(candidate.diagnostics.adultGoogleBooksNarrativeStrengthComponents)
      ? candidate.diagnostics.adultGoogleBooksNarrativeStrengthComponents as Record<string, number>
      : {};
    narrativeStrengthEvidenceByTitle[candidate.title] = candidate.diagnostics?.adultGoogleBooksNarrativeStrengthEvidence && typeof candidate.diagnostics.adultGoogleBooksNarrativeStrengthEvidence === "object" && !Array.isArray(candidate.diagnostics.adultGoogleBooksNarrativeStrengthEvidence)
      ? candidate.diagnostics.adultGoogleBooksNarrativeStrengthEvidence as Record<string, string[]>
      : {};
    narrativeStrengthSelectionScoreByTitle[candidate.title] = Number(candidate.diagnostics?.adultGoogleBooksNarrativeStrengthSelectionScore || candidate.score || 0);
    narrativeStrengthRankBeforeByTitle[candidate.title] = Number(candidate.diagnostics?.adultGoogleBooksNarrativeStrengthRankBefore || 0);
    narrativeStrengthRankAfterByTitle[candidate.title] = Number(candidate.diagnostics?.adultGoogleBooksNarrativeStrengthRankAfter || 0);
    narrativeStrengthRankDeltaByTitle[candidate.title] = Number(candidate.diagnostics?.adultGoogleBooksNarrativeStrengthRankDelta || 0);
    if (candidate.diagnostics?.adultGoogleBooksNarrativeStrengthApplied) narrativeStrengthAppliedTitles.push(candidate.title);
    if (Number(candidate.diagnostics?.adultGoogleBooksNarrativeStrengthRankDelta || 0) !== 0) {
      narrativeStrengthRankingChanges[candidate.title] = {
        baseScore: Number(candidate.diagnostics?.adultGoogleBooksNarrativeStrengthBaseScore || candidate.score || 0),
        narrativeStrengthScore: narrativeStrengthScoreByTitle[candidate.title],
        adjustedSelectionScore: narrativeStrengthSelectionScoreByTitle[candidate.title],
        rankBefore: narrativeStrengthRankBeforeByTitle[candidate.title],
        rankAfter: narrativeStrengthRankAfterByTitle[candidate.title],
        rankDelta: narrativeStrengthRankDeltaByTitle[candidate.title],
        components: narrativeStrengthComponentsByTitle[candidate.title],
      };
    }
    const plannedQuery = String(candidate.diagnostics?.originalPlannedQuery || candidate.diagnostics?.queryText || "").trim();
    const attemptedQuery = String(candidate.diagnostics?.queryText || candidate.diagnostics?.originalPlannedQuery || "").trim();
    if (plannedQuery) plannedQueries.add(plannedQuery);
    if (attemptedQuery) queriesAttempted.add(attemptedQuery);
    if (attemptedQuery) rawCountByQuery[attemptedQuery] = Number(rawCountByQuery[attemptedQuery] || 0) + 1;

    const binaryMeaningfulTaste = adultGoogleBooksMeaningfulTasteEligibility(candidate);
    const profileMeaningfulTasteBeforePromotion = adultGoogleBooksMeaningfulTasteEligibility(candidate, profile);
    const profileCanonicalPromotions = adultGoogleBooksCanonicalNarrativeFamilyPromotions(candidate, profile, profileMeaningfulTasteBeforePromotion);
    const profileMeaningfulTaste = adultGoogleBooksMeaningfulTasteEligibility(candidate, profile, profileCanonicalPromotions);
    const eligibility = adultGoogleBooksFinalEligibility(candidate, profile);
    const weightedCounterfactual = adultGoogleBooksWeightedCounterfactualDecision(profile, binaryMeaningfulTaste, profileLikedFamilies, profileAvoidFamilies);
    eligibilityReasonByTitle[candidate.title] = eligibility.reason;
    artifactReasonsByTitle[candidate.title] = eligibility.artifactReasons;
    narrativeEvidenceByTitle[candidate.title] = eligibility.narrativeEvidence;
    credibleFictionSignalsByTitle[candidate.title] = eligibility.credibleFictionSignals;
    workIdentitySignalsByTitle[candidate.title] = eligibility.workIdentitySignals;
    sourceQualityScoreByTitle[candidate.title] = eligibility.sourceQualityScore;
    sourceQualityFailureReasonsByTitle[candidate.title] = eligibility.sourceQualityFailureReasons;
    strongNarrativeOverrideAppliedByTitle[candidate.title] = eligibility.strongNarrativeOverrideApplied;
    strongNarrativeOverrideBlockedByTasteByTitle[candidate.title] = eligibility.strongNarrativeOverrideBlockedByTaste;
    periodicalCorroborationByTitle[candidate.title] = eligibility.periodicalCorroboration;
    instructionalCraftReasonsByTitle[candidate.title] = eligibility.instructionalCraftReasons;
    referenceSurveyReasonsByTitle[candidate.title] = eligibility.referenceSurveyReasons;
    encyclopediaReferenceReasonsByTitle[candidate.title] = eligibility.encyclopediaReferenceReasons;
    multiVolumeReferenceCorroborationByTitle[candidate.title] = eligibility.multiVolumeReferenceCorroboration;
    annualAnthologyReasonsByTitle[candidate.title] = eligibility.annualAnthologyReasons;
    anthologyCorroborationByTitle[candidate.title] = eligibility.anthologyCorroboration;
    authorCapAppliedByTitle[candidate.title] = candidate.rejectedReasons.includes("same_author_deferred") || candidate.rejectedReasons.includes("underfill_blocked_same_author_variant");
    seriesCapAppliedByTitle[candidate.title] = candidate.rejectedReasons.includes("same_series_or_root_deferred") || candidate.rejectedReasons.includes("underfill_blocked_same_root_variant");
    normalizedSeriesRootByTitle[candidate.title] = adultGoogleBooksSeriesRoot(candidate);
    documentBackedLikedSignalsByTitle[candidate.title] = eligibility.documentBackedLikedSignals;
    documentBackedDislikedSignalsByTitle[candidate.title] = eligibility.documentBackedDislikedSignals;
    positiveNetTasteFamiliesByTitle[candidate.title] = eligibility.positiveNetTasteFamilies;
    meaningfulTastePassedByTitle[candidate.title] = eligibility.meaningfulTastePassed;
    meaningfulTasteFailureReasonByTitle[candidate.title] = eligibility.meaningfulTasteFailureReason;
    broadToneOnlyRejectedByTitle[candidate.title] = eligibility.meaningfulTasteFailureReason === "broad_tone_without_content_family_corroboration";
    candidateTasteFamiliesByTitle[candidate.title] = eligibility.allCandidateTasteFamilies;
    negativeNetTasteFamiliesByTitle[candidate.title] = eligibility.negativeNetTasteFamilies;
    tasteEvidenceSourceByTitle[candidate.title] = eligibility.tasteEvidenceSource;
    meaningfulAlignmentScoreByTitle[candidate.title] = eligibility.likedSignalCount;
    meaningfulAlignmentThresholdByTitle[candidate.title] = eligibility.threshold;
    candidateDocumentSignalsByTitle[candidate.title] = {
      liked: adultGoogleBooksDocumentBackedSignals(candidate, "metadataBackedMatchedLikedSignals"),
      disliked: adultGoogleBooksDocumentBackedSignals(candidate, "metadataBackedMatchedDislikedSignals"),
    };
    specificTasteEvidenceByTitle[candidate.title] = eligibility.specificToneThemeLikedSignals;
    broadToneEvidenceByTitle[candidate.title] = eligibility.broadToneLikedSignals;
    contextOnlyEvidenceByTitle[candidate.title] = eligibility.contextOnlyLikedSignals;
    meaningfulAlignmentRuleByTitle[candidate.title] = eligibility.meaningfulTasteFailureReason;
    meaningfulAlignmentDecisionByTitle[candidate.title] = eligibility.meaningfulTastePassed ? "passed" : "failed";
    meaningfulAlignmentOverrideByTitle[candidate.title] = eligibility.strongNarrativeOverrideApplied ? "strong_narrative_identity_override" : "none";
    avoidFamilyOverlapByTitle[candidate.title] = eligibility.negativeNetTasteFamilies.filter((f) => profileAvoidFamilies.includes(f));
    weightedCounterfactualCandidateDecisionByTitle[candidate.title] = weightedCounterfactual;
    if (!weightedCounterfactual.currentPassed && weightedCounterfactual.weightedPassed) weightedCounterfactualNewPassTitles.push(candidate.title);
    if (weightedCounterfactual.currentPassed && !weightedCounterfactual.weightedPassed) weightedCounterfactualNewFailTitles.push(candidate.title);
    weightedProductionDecisionReasonByTitle[candidate.title] = eligibility.productionDecisionReason;
    if (!binaryMeaningfulTaste.passed && eligibility.meaningfulTastePassed) weightedProductionNewPassTitles.push(candidate.title);
    if (binaryMeaningfulTaste.passed && !eligibility.meaningfulTastePassed) weightedProductionNewFailTitles.push(candidate.title);
    const positiveFamilySet = new Set(eligibility.positiveNetTasteFamilies);
    const nonPositiveFamilyDetails = Array.from(new Set(eligibility.allCandidateTasteFamilies.map(String).filter(Boolean)))
      .filter((family) => !positiveFamilySet.has(family))
      .map((family) => {
        const explanation = productionPolarityExplanations[family];
        const rule = adultGoogleBooksProductionNonPositiveFamilyPresenceRule(explanation);
        if (!rule) return null;
        return {
          family,
          rule,
          weightedDecision: String(explanation?.decision || ""),
          finalProductionPolarity: String(explanation?.finalProductionPolarity || ""),
          positiveContribution: Number(explanation?.positiveContribution || 0),
          negativeContribution: Number(explanation?.negativeContribution || 0),
          cancellationAmount: Number(explanation?.cancellationAmount || 0),
          remainingNetScore: Number(explanation?.remainingNetScore || 0),
          thresholdComparison: String(explanation?.thresholdComparison || ""),
          candidateLikedSignals: eligibility.documentBackedLikedSignals.filter((signal) => adultOpenLibraryPrimaryContentFamily(signal) === family),
          candidateDislikedSignals: eligibility.documentBackedDislikedSignals.filter((signal) => adultOpenLibraryPrimaryContentFamily(signal) === family),
        };
      })
      .filter(Boolean) as Record<string, unknown>[];
    if (nonPositiveFamilyDetails.length > 0) {
      productionNonPositiveFamilyPresenceDetailsByTitle[candidate.title] = nonPositiveFamilyDetails;
      productionNonPositiveFamilyPresenceFamiliesByTitle[candidate.title] = Array.from(new Set(nonPositiveFamilyDetails.map((row) => String(row.family || "")).filter(Boolean)));
      for (const detail of nonPositiveFamilyDetails) {
        const rule = String(detail.rule || "unknown_production_rule");
        adultGoogleBooksIncrementCounter(productionNonPositiveFamilyPresenceRuleHistogram, rule);
        productionNonPositiveFamilyPresenceCandidatesByRule[rule] = Array.from(new Set([
          ...(productionNonPositiveFamilyPresenceCandidatesByRule[rule] || []),
          candidate.title,
        ])).slice(0, 12);
      }
    }
    const polarityCausality = adultGoogleBooksPolarityCausalityForCandidate(candidate, profile, eligibility, productionPolarityExplanations);
    polarityFamilyEffectByTitle[candidate.title] = polarityCausality.familyEffects;
    for (const row of polarityCausality.familyEffects) {
      adultGoogleBooksIncrementCounter(polarityFamilyEffectHistogram, String(row.state || "unknown_family_polarity_effect"));
    }
    if (polarityCausality.positiveSupportSuppressed.length > 0) {
      polarityFamilyPositiveSupportSuppressedByTitle[candidate.title] = polarityCausality.positiveSupportSuppressed;
    }
    if (polarityCausality.nondecisiveEffects.length > 0) {
      polarityNondecisiveEffectsByTitle[candidate.title] = polarityCausality.nondecisiveEffects;
    }
    if (polarityCausality.decisiveRejection) {
      polarityDecisiveRejectionByTitle[candidate.title] = polarityCausality.decisiveRejection;
    }
    if (polarityCausality.multiFactorRejection) {
      polarityMultiFactorRejectionByTitle[candidate.title] = polarityCausality.multiFactorRejection;
    }
    if (polarityCausality.unrelatedRejection) {
      polarityUnrelatedRejectionByTitle[candidate.title] = polarityCausality.unrelatedRejection;
    }
    if (polarityCausality.causalityState && polarityCausality.causalityState !== "accepted_not_rejected") {
      polarityCausalityStateByTitle[candidate.title] = polarityCausality.causalityState;
      adultGoogleBooksIncrementCounter(polarityCausalityHistogram, polarityCausality.causalityState);
    }
    if (polarityCausality.counterfactuals.length > 0) {
      polarityCounterfactualsByTitle[candidate.title] = polarityCausality.counterfactuals;
      if (polarityCausality.counterfactualPass) polarityCounterfactualPassTitles.push(candidate.title);
      if (polarityCausality.counterfactualStillFail) polarityCounterfactualStillFailTitles.push(candidate.title);
    }
    if (polarityCausality.decisiveRule) {
      adultGoogleBooksIncrementCounter(polarityDecisiveRuleHistogram, polarityCausality.decisiveRule);
    }
    signalMatchTraceByTitle[candidate.title] = Array.isArray(candidate.diagnostics?.adultGoogleBooksSignalMatchTrace)
      ? candidate.diagnostics.adultGoogleBooksSignalMatchTrace as unknown[]
      : [];
    signalMatchedFieldByTitle[candidate.title] = candidate.diagnostics?.adultGoogleBooksSignalMatchedField && typeof candidate.diagnostics.adultGoogleBooksSignalMatchedField === "object" && !Array.isArray(candidate.diagnostics.adultGoogleBooksSignalMatchedField)
      ? candidate.diagnostics.adultGoogleBooksSignalMatchedField as Record<string, string[]>
      : {};
    signalMatchedTextByTitle[candidate.title] = candidate.diagnostics?.adultGoogleBooksSignalMatchedText && typeof candidate.diagnostics.adultGoogleBooksSignalMatchedText === "object" && !Array.isArray(candidate.diagnostics.adultGoogleBooksSignalMatchedText)
      ? candidate.diagnostics.adultGoogleBooksSignalMatchedText as Record<string, string[]>
      : {};
    signalMatchMethodByTitle[candidate.title] = candidate.diagnostics?.adultGoogleBooksSignalMatchMethod && typeof candidate.diagnostics.adultGoogleBooksSignalMatchMethod === "object" && !Array.isArray(candidate.diagnostics.adultGoogleBooksSignalMatchMethod)
      ? candidate.diagnostics.adultGoogleBooksSignalMatchMethod as Record<string, string[]>
      : {};
    shortSignalSubstringMatchesByTitle[candidate.title] = Array.isArray(candidate.diagnostics?.adultGoogleBooksShortSignalSubstringMatches)
      ? candidate.diagnostics.adultGoogleBooksShortSignalSubstringMatches as unknown[]
      : [];
    rejectedShortSignalMatchesByTitle[candidate.title] = Array.isArray(candidate.diagnostics?.adultGoogleBooksRejectedShortSignalMatches)
      ? candidate.diagnostics.adultGoogleBooksRejectedShortSignalMatches as unknown[]
      : [];
    const narrativeExtraction = adultGoogleBooksNarrativeFamilyExtractionAnalysis(candidate, profileMeaningfulTaste, profile);
    narrativeDescriptionByTitle[candidate.title] = String(narrativeExtraction.rawNarrativeDescription || "");
    narrativeSemanticPhrasesByTitle[candidate.title] = (narrativeExtraction.semanticPhrasesDetected && typeof narrativeExtraction.semanticPhrasesDetected === "object" && !Array.isArray(narrativeExtraction.semanticPhrasesDetected))
      ? narrativeExtraction.semanticPhrasesDetected as Record<string, unknown>
      : {};
    narrativeFamilyMappingsByTitle[candidate.title] = (narrativeExtraction.familyMappingsProduced && typeof narrativeExtraction.familyMappingsProduced === "object" && !Array.isArray(narrativeExtraction.familyMappingsProduced))
      ? narrativeExtraction.familyMappingsProduced as Record<string, unknown>
      : {};
    ignoredNarrativePhrasesByTitle[candidate.title] = Array.isArray(narrativeExtraction.ignoredNarrativePhrases)
      ? narrativeExtraction.ignoredNarrativePhrases as unknown[]
      : [];
    unmappedNarrativeCuesByTitle[candidate.title] = Array.isArray(narrativeExtraction.unmappedNarrativeCues)
      ? narrativeExtraction.unmappedNarrativeCues as unknown[]
      : [];
    futureAliasCandidatesByTitle[candidate.title] = Array.isArray(narrativeExtraction.futureAliasCandidates)
      ? narrativeExtraction.futureAliasCandidates as unknown[]
      : [];
    parserConfidenceByTitle[candidate.title] = adultOpenLibraryRoundWeight(Number(narrativeExtraction.parserConfidence || 0));
    expectedVsExtractedFamilyEvidenceByTitle[candidate.title] = (narrativeExtraction.expectedVsExtractedFamilyEvidence && typeof narrativeExtraction.expectedVsExtractedFamilyEvidence === "object" && !Array.isArray(narrativeExtraction.expectedVsExtractedFamilyEvidence))
      ? narrativeExtraction.expectedVsExtractedFamilyEvidence as Record<string, unknown>
      : {};
    narrativeCueClassificationByTitle[candidate.title] = Array.isArray(narrativeExtraction.cueClassifications)
      ? narrativeExtraction.cueClassifications as unknown[]
      : [];
    canonicalCueMissingFamilyByTitle[candidate.title] = Array.isArray(narrativeExtraction.canonicalCueMissingFamily)
      ? narrativeExtraction.canonicalCueMissingFamily as unknown[]
      : [];
    genuineAliasCandidatesByTitle[candidate.title] = Array.isArray(narrativeExtraction.genuineAliasCandidateCues)
      ? narrativeExtraction.genuineAliasCandidateCues as unknown[]
      : [];
    narrativeCuePolarityOutcomeByTitle[candidate.title] = Array.isArray(narrativeExtraction.narrativeCuePolarityOutcomes)
      ? narrativeExtraction.narrativeCuePolarityOutcomes as unknown[]
      : [];
    narrativeCueFalseUnmappedSuppressedByTitle[candidate.title] = Array.isArray(narrativeExtraction.falseUnmappedSuppressed)
      ? narrativeExtraction.falseUnmappedSuppressed as unknown[]
      : [];
    const promotionEvidence = (eligibility.canonicalNarrativeFamilyPromotions || []).map((promotion) => ({
      ...promotion,
      finalEligibilityAfter: eligibility.allowed ? `accepted:${eligibility.reason}` : `rejected:${eligibility.reason}`,
    }));
    canonicalNarrativeFamilyPromotionsByTitle[candidate.title] = Array.from(new Set(
      promotionEvidence
        .filter((promotion) => promotion.applied)
        .map((promotion) => String(promotion.expectedFamily || "")),
    ));
    canonicalNarrativeFamilyPromotionEvidenceByTitle[candidate.title] = promotionEvidence;
    canonicalNarrativeFamilyPromotionFieldByTitle[candidate.title] = uniqueSignals(promotionEvidence.map((promotion) => String(promotion.field || "")).filter(Boolean));
    canonicalNarrativeFamilyPromotionPhraseByTitle[candidate.title] = uniqueSignals(promotionEvidence.map((promotion) => String(promotion.phrase || "")).filter(Boolean));
    canonicalNarrativeFamilyPromotionDecisionByTitle[candidate.title] = promotionEvidence.map((promotion) => ({
      phrase: promotion.phrase,
      expectedFamily: promotion.expectedFamily,
      promotedAs: promotion.promotedAs,
      productionPolarity: promotion.productionPolarity,
      applied: promotion.applied,
      decision: promotion.decision,
      meaningfulAlignmentBefore: promotion.meaningfulAlignmentBefore,
      meaningfulAlignmentAfter: promotion.meaningfulAlignmentAfter,
      finalEligibilityBefore: promotion.finalEligibilityBefore,
      finalEligibilityAfter: promotion.finalEligibilityAfter,
    }));
    canonicalMissingFamilyBeforeByTitle[candidate.title] = eligibility.canonicalMissingFamilyBefore;
    canonicalMissingFamilyAfterByTitle[candidate.title] = eligibility.canonicalMissingFamilyAfter;
    const missingBeforeKeys = new Set((eligibility.canonicalMissingFamilyBefore || []).map((row) => `${row.family}:${row.phrase}`));
    const missingAfterKeys = new Set((eligibility.canonicalMissingFamilyAfter || []).map((row) => `${row.family}:${row.phrase}`));
    if ([...missingBeforeKeys].some((key) => !missingAfterKeys.has(key))) canonicalMissingFamilyResolvedTitles.push(candidate.title);
    if (missingAfterKeys.size > 0) canonicalMissingFamilyUnresolvedTitles.push(candidate.title);
    for (const promotion of promotionEvidence.filter((row) => row.applied)) {
      adultGoogleBooksIncrementCounter(canonicalNarrativeFamilyPromotionHistogram, `${promotion.expectedFamily}:${promotion.phrase}`);
    }
    if (promotionEvidence.some((promotion) => promotion.applied)) {
      canonicalNarrativeFamilyPromotionEligibilityChanges[candidate.title] = {
        before: promotionEvidence[0]?.finalEligibilityBefore || "",
        after: promotionEvidence[0]?.finalEligibilityAfter || "",
        meaningfulAlignmentBefore: promotionEvidence[0]?.meaningfulAlignmentBefore || "",
        meaningfulAlignmentAfter: promotionEvidence[0]?.meaningfulAlignmentAfter || "",
        appliedFamilies: canonicalNarrativeFamilyPromotionsByTitle[candidate.title],
      };
    }
    for (const row of narrativeCueClassificationByTitle[candidate.title]) {
      const state = String((row as Record<string, unknown>)?.finalDiagnosticState || "");
      adultGoogleBooksIncrementCounter(narrativeCueClassificationHistogram, state);
    }
    for (const row of unmappedNarrativeCuesByTitle[candidate.title]) {
      const family = String((row as Record<string, unknown>)?.family || "");
      const phrase = String((row as Record<string, unknown>)?.phrase || "");
      if (!family) continue;
      adultGoogleBooksIncrementCounter(unmappedNarrativePhraseHistogram, phrase);
      if (!unmappedNarrativeCueHistogramByFamily[family]) unmappedNarrativeCueHistogramByFamily[family] = {};
      adultGoogleBooksIncrementCounter(unmappedNarrativeCueHistogramByFamily[family], phrase);
      narrativeFamilyExtractionExamplesByFamily[family] = [
        ...(narrativeFamilyExtractionExamplesByFamily[family] || []),
        {
          title: candidate.title,
          phrase,
          fields: (row as Record<string, unknown>)?.fields || [],
          extractedFamilies: expectedVsExtractedFamilyEvidenceByTitle[candidate.title].allExtractedFamilies || [],
          eligibilityReason: eligibility.reason,
          parserConfidence: parserConfidenceByTitle[candidate.title],
        },
      ].slice(0, 8);
    }
    for (const row of canonicalCueMissingFamilyByTitle[candidate.title]) {
      const family = String((row as Record<string, unknown>)?.expectedFamily || "");
      const phrase = String((row as Record<string, unknown>)?.phrase || "");
      adultGoogleBooksIncrementCounter(canonicalCueMissingFamilyHistogram, family && phrase ? `${family}:${phrase}` : phrase || family);
    }
    for (const row of futureAliasCandidatesByTitle[candidate.title]) {
      const phrase = String((row as Record<string, unknown>)?.phrase || "");
      adultGoogleBooksIncrementCounter(futureAliasCandidateHistogram, phrase);
    }
    for (const row of genuineAliasCandidatesByTitle[candidate.title]) {
      const family = String((row as Record<string, unknown>)?.expectedFamily || "");
      const phrase = String((row as Record<string, unknown>)?.phrase || "");
      adultGoogleBooksIncrementCounter(genuineAliasCandidateHistogram, family && phrase ? `${family}:${phrase}` : phrase || family);
    }
    if (eligibility.reason === "adult_googlebooks_missing_meaningful_document_taste_alignment") {
      const failureDetails = adultGoogleBooksMeaningfulAlignmentFailureDetails(candidate, profileMeaningfulTaste, profile);
      const failureModes = Array.isArray(failureDetails.failureModes)
        ? (failureDetails.failureModes as string[]).map(String).filter(Boolean)
        : [];
      meaningfulAlignmentFailureReasonByTitle[candidate.title] = failureModes.join("|") || "unclassified";
      meaningfulAlignmentFailureDetailsByTitle[candidate.title] = failureDetails;
      for (const mode of failureModes) {
        meaningfulAlignmentFailureHistogram[mode] = Number(meaningfulAlignmentFailureHistogram[mode] || 0) + 1;
        meaningfulAlignmentFailureExamples[mode] = Array.from(new Set([
          ...(meaningfulAlignmentFailureExamples[mode] || []),
          candidate.title,
        ])).slice(0, 8);
      }
    }
    for (const family of weightedCounterfactual.currentOverlappingFamilies) {
      if (!eligibility.meaningfulTastePassed || weightedCounterfactual.reason !== "weighted_model_matches_current_binary_result") {
        overlapAffectedCandidateTitlesByFamily[family] = Array.from(new Set([...(overlapAffectedCandidateTitlesByFamily[family] || []), candidate.title]));
      }
    }

    // Explicit per-title decision diagnostics so every ranked candidate has a named reason.
    finalEligibilityDecisionByTitle[candidate.title] = eligibility.allowed ? "accepted" : "rejected";
    finalEligibilityEvidenceByTitle[candidate.title] = Array.from(new Set([
      ...eligibility.artifactReasons,
      ...eligibility.narrativeEvidence,
      ...eligibility.workIdentitySignals,
      ...eligibility.credibleFictionSignals,
      ...eligibility.sourceQualityFailureReasons,
    ]));
    const isAuthorDeferred = authorCapAppliedByTitle[candidate.title];
    const isSeriesDeferred = seriesCapAppliedByTitle[candidate.title];
    const otherDeferralReason = candidate.rejectedReasons.find((r) =>
      /deferred|cluster/.test(r) && r !== "same_author_deferred" && r !== "same_series_or_root_deferred",
    );
    if (!eligibility.allowed) {
      postRankingGateByTitle[candidate.title] = "final_eligibility";
      postRankingGateReasonByTitle[candidate.title] = eligibility.reason;
    } else if (isAuthorDeferred) {
      postRankingGateByTitle[candidate.title] = "author_diversity_deferral";
      postRankingGateReasonByTitle[candidate.title] = "same_author_deferred";
    } else if (isSeriesDeferred) {
      postRankingGateByTitle[candidate.title] = "series_diversity_deferral";
      postRankingGateReasonByTitle[candidate.title] = "same_series_or_root_deferred";
    } else if (otherDeferralReason) {
      postRankingGateByTitle[candidate.title] = "cluster_diversity_deferral";
      postRankingGateReasonByTitle[candidate.title] = otherDeferralReason;
    } else if (selectedTitleSet.has(normalized(candidate.title))) {
      postRankingGateByTitle[candidate.title] = "selected";
      postRankingGateReasonByTitle[candidate.title] = "accepted";
    } else {
      postRankingGateByTitle[candidate.title] = "passed_eligibility_not_selected";
      postRankingGateReasonByTitle[candidate.title] = candidate.rejectedReasons.find(Boolean) || "not_reached_selection_capacity";
    }
    if (eligibility.allowed) {
      if (selectedTitleSet.has(normalized(candidate.title))) {
        finalSelectionDecisionByTitle[candidate.title] = "selected";
      } else if (isAuthorDeferred) {
        finalSelectionDecisionByTitle[candidate.title] = "deferred_author_diversity";
        finalSelectionExclusionReasonByTitle[candidate.title] = "same_author_deferred";
      } else if (isSeriesDeferred) {
        finalSelectionDecisionByTitle[candidate.title] = "deferred_series_diversity";
        finalSelectionExclusionReasonByTitle[candidate.title] = "same_series_or_root_deferred";
      } else if (otherDeferralReason) {
        finalSelectionDecisionByTitle[candidate.title] = "deferred_cluster_diversity";
        finalSelectionExclusionReasonByTitle[candidate.title] = otherDeferralReason;
      } else {
        finalSelectionDecisionByTitle[candidate.title] = "passed_eligibility_not_selected";
        finalSelectionExclusionReasonByTitle[candidate.title] = candidate.rejectedReasons.find(Boolean) || "not_reached_selection_capacity";
      }
    }

    const identityAudit = adultGoogleBooksFinalSlateIdentityAudit(candidate, {
      eligibility,
      finalEligibilityDecision: finalEligibilityDecisionByTitle[candidate.title],
      finalEligibilityReason: eligibilityReasonByTitle[candidate.title],
      finalSelectionDecision: finalSelectionDecisionByTitle[candidate.title],
      rendered: selectedTitleSet.has(normalized(candidate.title)),
    });
    const identityEnforcement = adultGoogleBooksIdentityEnforcementForIdentity(identityAudit.identity);
    finalSlateIdentityByTitle[candidate.title] = identityAudit.identity;
    finalSlateIdentityEvidenceByTitle[candidate.title] = identityAudit.evidence;
    finalSlateIdentityConfidenceByTitle[candidate.title] = identityAudit.confidence;
    finalSlateIdentityAgreementByTitle[candidate.title] = identityAudit.agreement;
    finalSlateIdentityHistogram[identityAudit.identity] = Number(finalSlateIdentityHistogram[identityAudit.identity] || 0) + 1;
    finalSlateIdentityRootCauseHistogram[identityAudit.rootCause] = Number(finalSlateIdentityRootCauseHistogram[identityAudit.rootCause] || 0) + 1;
    identityEnforcementDecisionByTitle[candidate.title] = identityEnforcement.decision;
    identityEnforcementReasonByTitle[candidate.title] = identityEnforcement.reason;
    identityEnforcementHistogram[identityEnforcement.reason] = Number(identityEnforcementHistogram[identityEnforcement.reason] || 0) + 1;
    if (identityEnforcement.decision === "rejected") {
      identityRejectedTitles.push(candidate.title);
      if (eligibility.allowed) {
        identityBehaviorChanges[candidate.title] = {
          identity: identityAudit.identity,
          before: `accepted:${eligibility.reason}`,
          after: `rejected:${identityEnforcement.reason}`,
          reason: identityEnforcement.reason,
        };
      }
    } else if (identityEnforcement.decision === "accepted") {
      identityAcceptedTitles.push(candidate.title);
    }
    if (identityAudit.agreement === "likely_non_narrative_false_accept") {
      likelyNonNarrativeFalseAcceptedTitles.push(candidate.title);
      finalSlateIdentityFlaggedDetailsByTitle[candidate.title] = identityAudit.summary;
    } else if (identityAudit.agreement === "likely_collection_false_accept") {
      likelyCollectionFalseAcceptedTitles.push(candidate.title);
      finalSlateIdentityFlaggedDetailsByTitle[candidate.title] = identityAudit.summary;
    } else if (identityAudit.agreement === "likely_narrative_false_reject") {
      likelyNarrativeFalseRejectedTitles.push(candidate.title);
      finalSlateIdentityFlaggedDetailsByTitle[candidate.title] = identityAudit.summary;
    } else if (identityAudit.agreement === "uncertain_identity_needs_review") {
      finalSlateIdentityFlaggedDetailsByTitle[candidate.title] = identityAudit.summary;
    }
    if (selectedTitleSet.has(normalized(candidate.title))) {
      renderedIdentityAudit[candidate.title] = identityAudit.summary;
    }

    if (eligibility.allowed && identityEnforcement.decision !== "rejected" && selectedTitleSet.has(normalized(candidate.title))) {
      acceptedTitles.push(candidate.title);
      if (attemptedQuery) acceptedCountByQuery[attemptedQuery] = Number(acceptedCountByQuery[attemptedQuery] || 0) + 1;
    } else if (!eligibility.allowed || identityEnforcement.decision === "rejected") {
      const rejectedReason = identityEnforcement.decision === "rejected" ? identityEnforcement.reason : eligibility.reason;
      rejectedTitlesByReason[rejectedReason] = [...(rejectedTitlesByReason[rejectedReason] || []), candidate.title];
      if (attemptedQuery) {
        if (!rejectedCountByQueryAndReason[attemptedQuery]) rejectedCountByQueryAndReason[attemptedQuery] = {};
        rejectedCountByQueryAndReason[attemptedQuery][rejectedReason] = Number(rejectedCountByQueryAndReason[attemptedQuery][rejectedReason] || 0) + 1;
      }
    }
  }

  const meaningfulAlignmentFailureTotal = Math.max(1, Object.keys(meaningfulAlignmentFailureDetailsByTitle).length);
  const meaningfulAlignmentFailurePercentages = Object.fromEntries(
    Object.entries(meaningfulAlignmentFailureHistogram)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([mode, count]) => [mode, adultOpenLibraryRoundWeight((count / meaningfulAlignmentFailureTotal) * 100)]),
  );
  const meaningfulAlignmentRootCauseSummary = Object.entries(meaningfulAlignmentFailurePercentages)
    .map(([mode, pct]) => `${pct}% ${mode} (${meaningfulAlignmentFailureHistogram[mode] || 0})`)
    .join(" | ");
  const narrativeFamilyExtractionRootCauseSummary = Object.entries(unmappedNarrativeCueHistogramByFamily)
    .map(([family, histogram]) => {
      const total = Object.values(histogram).reduce((sum, count) => sum + Number(count || 0), 0);
      const topPhrases = Object.entries(histogram)
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, 4)
        .map(([phrase, count]) => `${phrase}:${count}`)
        .join(",");
      return `${family}:${total}${topPhrases ? ` (${topPhrases})` : ""}`;
    })
    .join(" | ");
  const narrativeExtractionDiagnosticSummary = Object.entries(narrativeCueClassificationHistogram)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([state, count]) => `${state}:${count}`)
    .join(" | ");
  const finalSlateIdentityAuditSummary = [
    `identity=${Object.entries(finalSlateIdentityHistogram).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([identity, count]) => `${identity}:${count}`).join(",") || "none"}`,
    `nonNarrativeFalseAccepts=${likelyNonNarrativeFalseAcceptedTitles.length}`,
    `collectionFalseAccepts=${likelyCollectionFalseAcceptedTitles.length}`,
    `narrativeFalseRejects=${likelyNarrativeFalseRejectedTitles.length}`,
    `uncertain=${Object.values(finalSlateIdentityAgreementByTitle).filter((value) => value === "uncertain_identity_needs_review").length}`,
    `rootCauses=${Object.entries(finalSlateIdentityRootCauseHistogram).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([reason, count]) => `${reason}:${count}`).join(",") || "none"}`,
  ].join(" | ");

  diagnostics.adultGoogleBooksFinalGateApplied = true;
  diagnostics.adultGoogleBooksEligibilityReasonByTitle = eligibilityReasonByTitle;
  diagnostics.adultGoogleBooksArtifactReasonsByTitle = artifactReasonsByTitle;
  diagnostics.adultGoogleBooksNarrativeEvidenceByTitle = narrativeEvidenceByTitle;
  diagnostics.adultGoogleBooksCredibleFictionSignalsByTitle = credibleFictionSignalsByTitle;
  diagnostics.adultGoogleBooksNarrativeWorkIdentitySignalsByTitle = workIdentitySignalsByTitle;
  diagnostics.adultGoogleBooksSourceQualityScoreByTitle = sourceQualityScoreByTitle;
  diagnostics.adultGoogleBooksSourceQualityFailureReasonsByTitle = sourceQualityFailureReasonsByTitle;
  diagnostics.adultGoogleBooksStrongNarrativeOverrideAppliedByTitle = strongNarrativeOverrideAppliedByTitle;
  diagnostics.adultGoogleBooksStrongNarrativeOverrideBlockedByTasteByTitle = strongNarrativeOverrideBlockedByTasteByTitle;
  diagnostics.adultGoogleBooksPeriodicalCorroborationByTitle = periodicalCorroborationByTitle;
  diagnostics.adultGoogleBooksInstructionalCraftReasonsByTitle = instructionalCraftReasonsByTitle;
  diagnostics.adultGoogleBooksReferenceSurveyReasonsByTitle = referenceSurveyReasonsByTitle;
  diagnostics.adultGoogleBooksEncyclopediaReferenceReasonsByTitle = encyclopediaReferenceReasonsByTitle;
  diagnostics.adultGoogleBooksMultiVolumeReferenceCorroborationByTitle = multiVolumeReferenceCorroborationByTitle;
  diagnostics.adultGoogleBooksAnnualAnthologyReasonsByTitle = annualAnthologyReasonsByTitle;
  diagnostics.adultGoogleBooksAnthologyCorroborationByTitle = anthologyCorroborationByTitle;
  diagnostics.adultGoogleBooksAuthorCapAppliedByTitle = authorCapAppliedByTitle;
  diagnostics.adultGoogleBooksSeriesCapAppliedByTitle = seriesCapAppliedByTitle;
  diagnostics.adultGoogleBooksNormalizedSeriesRootByTitle = normalizedSeriesRootByTitle;
  diagnostics.adultGoogleBooksDeferredForAuthorDiversityTitles = Object.entries(authorCapAppliedByTitle).filter(([, applied]) => applied).map(([title]) => title);
  diagnostics.adultGoogleBooksDeferredForSeriesDiversityTitles = Object.entries(seriesCapAppliedByTitle).filter(([, applied]) => applied).map(([title]) => title);
  diagnostics.adultGoogleBooksDistinctAuthorCount = new Set(selected.filter((candidate) => candidate.source === "googleBooks").map((candidate) => primaryAuthor(candidate)).filter(Boolean)).size;
  diagnostics.adultGoogleBooksDistinctSeriesRootCount = new Set(selected.filter((candidate) => candidate.source === "googleBooks").map((candidate) => adultGoogleBooksSeriesRoot(candidate)).filter(Boolean)).size;
  diagnostics.adultGoogleBooksDocumentBackedLikedSignalsByTitle = documentBackedLikedSignalsByTitle;
  diagnostics.adultGoogleBooksDocumentBackedDislikedSignalsByTitle = documentBackedDislikedSignalsByTitle;
  diagnostics.adultGoogleBooksPositiveNetTasteFamiliesByTitle = positiveNetTasteFamiliesByTitle;
  diagnostics.adultGoogleBooksMeaningfulTastePassedByTitle = meaningfulTastePassedByTitle;
  diagnostics.adultGoogleBooksMeaningfulTasteFailureReasonByTitle = meaningfulTasteFailureReasonByTitle;
  diagnostics.adultGoogleBooksBroadToneOnlyRejectedByTitle = broadToneOnlyRejectedByTitle;
  diagnostics.adultGoogleBooksCandidateTasteFamiliesByTitle = candidateTasteFamiliesByTitle;
  diagnostics.adultGoogleBooksNegativeNetTasteFamiliesByTitle = negativeNetTasteFamiliesByTitle;
  diagnostics.adultGoogleBooksTasteEvidenceSourceByTitle = tasteEvidenceSourceByTitle;
  diagnostics.adultGoogleBooksMeaningfulAlignmentScoreByTitle = meaningfulAlignmentScoreByTitle;
  diagnostics.adultGoogleBooksMeaningfulAlignmentThresholdByTitle = meaningfulAlignmentThresholdByTitle;
  diagnostics.adultGoogleBooksProfileLikedFamilies = profileLikedFamilies;
  diagnostics.adultGoogleBooksProfileAvoidFamilies = profileAvoidFamilies;
  diagnostics.adultGoogleBooksCandidateDocumentSignalsByTitle = candidateDocumentSignalsByTitle;
  diagnostics.adultGoogleBooksSpecificTasteEvidenceByTitle = specificTasteEvidenceByTitle;
  diagnostics.adultGoogleBooksBroadToneEvidenceByTitle = broadToneEvidenceByTitle;
  diagnostics.adultGoogleBooksContextOnlyEvidenceByTitle = contextOnlyEvidenceByTitle;
  diagnostics.adultGoogleBooksMeaningfulAlignmentRuleByTitle = meaningfulAlignmentRuleByTitle;
  diagnostics.adultGoogleBooksMeaningfulAlignmentDecisionByTitle = meaningfulAlignmentDecisionByTitle;
  diagnostics.adultGoogleBooksMeaningfulAlignmentOverrideByTitle = meaningfulAlignmentOverrideByTitle;
  diagnostics.adultGoogleBooksAvoidFamilyOverlapByTitle = avoidFamilyOverlapByTitle;
  diagnostics.adultTasteWeightedCounterfactualCandidateDecisionByTitle = weightedCounterfactualCandidateDecisionByTitle;
  diagnostics.adultTasteWeightedCounterfactualNewPassTitles = Array.from(new Set(weightedCounterfactualNewPassTitles));
  diagnostics.adultTasteWeightedCounterfactualNewFailTitles = Array.from(new Set(weightedCounterfactualNewFailTitles));
  diagnostics.adultTasteWeightedProductionDecisionReasonByTitle = weightedProductionDecisionReasonByTitle;
  diagnostics.adultTasteWeightedProductionNewPassTitles = Array.from(new Set(weightedProductionNewPassTitles));
  diagnostics.adultTasteWeightedProductionNewFailTitles = Array.from(new Set(weightedProductionNewFailTitles));
  diagnostics.adultTasteOverlapAffectedCandidateTitlesByFamily = overlapAffectedCandidateTitlesByFamily;
  diagnostics.adultGoogleBooksProductionNonPositiveFamilyPresenceRuleHistogram = productionNonPositiveFamilyPresenceRuleHistogram;
  diagnostics.adultGoogleBooksProductionNonPositiveFamilyPresenceCandidatesByRule = productionNonPositiveFamilyPresenceCandidatesByRule;
  diagnostics.adultGoogleBooksProductionNonPositiveFamilyPresenceFamiliesByTitle = productionNonPositiveFamilyPresenceFamiliesByTitle;
  diagnostics.adultGoogleBooksProductionNonPositiveFamilyPresenceDetailsByTitle = productionNonPositiveFamilyPresenceDetailsByTitle;
  diagnostics.adultGoogleBooksProductionSuppressionDiagnosticsDeprecated = "renamed_to_polarity_causality_fields_to_avoid_conflating_family_non_support_with_rejection_causality";
  diagnostics.adultGoogleBooksFamilyPolarityEffectByTitle = polarityFamilyEffectByTitle;
  diagnostics.adultGoogleBooksFamilyPolarityEffectHistogram = polarityFamilyEffectHistogram;
  diagnostics.adultGoogleBooksFamilyPositiveSupportSuppressedByTitle = polarityFamilyPositiveSupportSuppressedByTitle;
  diagnostics.adultGoogleBooksPolarityNondecisiveEffectsByTitle = polarityNondecisiveEffectsByTitle;
  diagnostics.adultGoogleBooksPolarityDecisiveRejectionByTitle = polarityDecisiveRejectionByTitle;
  diagnostics.adultGoogleBooksPolarityMultiFactorRejectionByTitle = polarityMultiFactorRejectionByTitle;
  diagnostics.adultGoogleBooksPolarityUnrelatedRejectionByTitle = polarityUnrelatedRejectionByTitle;
  diagnostics.adultGoogleBooksPolarityCausalityStateByTitle = polarityCausalityStateByTitle;
  diagnostics.adultGoogleBooksPolarityCausalityHistogram = polarityCausalityHistogram;
  diagnostics.adultGoogleBooksPolarityCounterfactualsByTitle = polarityCounterfactualsByTitle;
  diagnostics.adultGoogleBooksPolarityCounterfactualPassTitles = Array.from(new Set(polarityCounterfactualPassTitles));
  diagnostics.adultGoogleBooksPolarityCounterfactualStillFailTitles = Array.from(new Set(polarityCounterfactualStillFailTitles));
  diagnostics.adultGoogleBooksPolarityDecisiveRuleHistogram = polarityDecisiveRuleHistogram;
  diagnostics.adultGoogleBooksSignalMatchTraceByTitle = signalMatchTraceByTitle;
  diagnostics.adultGoogleBooksSignalMatchedFieldByTitle = signalMatchedFieldByTitle;
  diagnostics.adultGoogleBooksSignalMatchedTextByTitle = signalMatchedTextByTitle;
  diagnostics.adultGoogleBooksSignalMatchMethodByTitle = signalMatchMethodByTitle;
  diagnostics.adultGoogleBooksShortSignalSubstringMatchesByTitle = shortSignalSubstringMatchesByTitle;
  diagnostics.adultGoogleBooksRejectedShortSignalMatchesByTitle = rejectedShortSignalMatchesByTitle;
  diagnostics.adultGoogleBooksMeaningfulAlignmentFailureHistogram = meaningfulAlignmentFailureHistogram;
  diagnostics.adultGoogleBooksMeaningfulAlignmentFailurePercentages = meaningfulAlignmentFailurePercentages;
  diagnostics.adultGoogleBooksMeaningfulAlignmentFailureExamples = meaningfulAlignmentFailureExamples;
  diagnostics.adultGoogleBooksMeaningfulAlignmentFailureReasonByTitle = meaningfulAlignmentFailureReasonByTitle;
  diagnostics.adultGoogleBooksMeaningfulAlignmentFailureDetailsByTitle = meaningfulAlignmentFailureDetailsByTitle;
  diagnostics.adultGoogleBooksMeaningfulAlignmentRootCauseSummary = meaningfulAlignmentRootCauseSummary;
  diagnostics.adultGoogleBooksNarrativeDescriptionByTitle = narrativeDescriptionByTitle;
  diagnostics.adultGoogleBooksNarrativeSemanticPhrasesByTitle = narrativeSemanticPhrasesByTitle;
  diagnostics.adultGoogleBooksNarrativeFamilyMappingsByTitle = narrativeFamilyMappingsByTitle;
  diagnostics.adultGoogleBooksIgnoredNarrativePhrasesByTitle = ignoredNarrativePhrasesByTitle;
  diagnostics.adultGoogleBooksUnmappedNarrativeCuesByTitle = unmappedNarrativeCuesByTitle;
  diagnostics.adultGoogleBooksFutureAliasCandidatesByTitle = futureAliasCandidatesByTitle;
  diagnostics.adultGoogleBooksNarrativeParserConfidenceByTitle = parserConfidenceByTitle;
  diagnostics.adultGoogleBooksExpectedVsExtractedFamilyEvidenceByTitle = expectedVsExtractedFamilyEvidenceByTitle;
  diagnostics.adultGoogleBooksUnmappedNarrativePhraseHistogram = unmappedNarrativePhraseHistogram;
  diagnostics.adultGoogleBooksUnmappedNarrativeCueHistogramByFamily = unmappedNarrativeCueHistogramByFamily;
  diagnostics.adultGoogleBooksFutureAliasCandidateHistogram = futureAliasCandidateHistogram;
  diagnostics.adultGoogleBooksNarrativeFamilyExtractionExamplesByFamily = narrativeFamilyExtractionExamplesByFamily;
  diagnostics.adultGoogleBooksNarrativeFamilyExtractionRootCauseSummary = narrativeFamilyExtractionRootCauseSummary;
  diagnostics.adultGoogleBooksNarrativeCueClassificationByTitle = narrativeCueClassificationByTitle;
  diagnostics.adultGoogleBooksNarrativeCueClassificationHistogram = narrativeCueClassificationHistogram;
  diagnostics.adultGoogleBooksCanonicalCueMissingFamilyByTitle = canonicalCueMissingFamilyByTitle;
  diagnostics.adultGoogleBooksCanonicalCueMissingFamilyHistogram = canonicalCueMissingFamilyHistogram;
  diagnostics.adultGoogleBooksGenuineAliasCandidatesByTitle = genuineAliasCandidatesByTitle;
  diagnostics.adultGoogleBooksGenuineAliasCandidateHistogram = genuineAliasCandidateHistogram;
  diagnostics.adultGoogleBooksNarrativeCuePolarityOutcomeByTitle = narrativeCuePolarityOutcomeByTitle;
  diagnostics.adultGoogleBooksNarrativeCueFalseUnmappedSuppressedByTitle = narrativeCueFalseUnmappedSuppressedByTitle;
  diagnostics.adultGoogleBooksNarrativeExtractionDiagnosticSummary = narrativeExtractionDiagnosticSummary;
  diagnostics.adultGoogleBooksCanonicalNarrativeFamilyPromotionsByTitle = canonicalNarrativeFamilyPromotionsByTitle;
  diagnostics.adultGoogleBooksCanonicalNarrativeFamilyPromotionEvidenceByTitle = canonicalNarrativeFamilyPromotionEvidenceByTitle;
  diagnostics.adultGoogleBooksCanonicalNarrativeFamilyPromotionFieldByTitle = canonicalNarrativeFamilyPromotionFieldByTitle;
  diagnostics.adultGoogleBooksCanonicalNarrativeFamilyPromotionPhraseByTitle = canonicalNarrativeFamilyPromotionPhraseByTitle;
  diagnostics.adultGoogleBooksCanonicalNarrativeFamilyPromotionDecisionByTitle = canonicalNarrativeFamilyPromotionDecisionByTitle;
  diagnostics.adultGoogleBooksCanonicalMissingFamilyBeforeByTitle = canonicalMissingFamilyBeforeByTitle;
  diagnostics.adultGoogleBooksCanonicalMissingFamilyAfterByTitle = canonicalMissingFamilyAfterByTitle;
  diagnostics.adultGoogleBooksCanonicalMissingFamilyResolvedTitles = Array.from(new Set(canonicalMissingFamilyResolvedTitles));
  diagnostics.adultGoogleBooksCanonicalMissingFamilyUnresolvedTitles = Array.from(new Set(canonicalMissingFamilyUnresolvedTitles));
  diagnostics.adultGoogleBooksCanonicalNarrativeFamilyPromotionHistogram = canonicalNarrativeFamilyPromotionHistogram;
  diagnostics.adultGoogleBooksCanonicalNarrativeFamilyPromotionEligibilityChanges = canonicalNarrativeFamilyPromotionEligibilityChanges;
  diagnostics.adultGoogleBooksFinalSlateIdentityByTitle = finalSlateIdentityByTitle;
  diagnostics.adultGoogleBooksFinalSlateIdentityEvidenceByTitle = finalSlateIdentityEvidenceByTitle;
  diagnostics.adultGoogleBooksFinalSlateIdentityConfidenceByTitle = finalSlateIdentityConfidenceByTitle;
  diagnostics.adultGoogleBooksFinalSlateIdentityAgreementByTitle = finalSlateIdentityAgreementByTitle;
  diagnostics.adultGoogleBooksFinalSlateIdentityHistogram = finalSlateIdentityHistogram;
  diagnostics.adultGoogleBooksLikelyNonNarrativeFalseAcceptedTitles = Array.from(new Set(likelyNonNarrativeFalseAcceptedTitles));
  diagnostics.adultGoogleBooksLikelyCollectionFalseAcceptedTitles = Array.from(new Set(likelyCollectionFalseAcceptedTitles));
  diagnostics.adultGoogleBooksLikelyNarrativeFalseRejectedTitles = Array.from(new Set(likelyNarrativeFalseRejectedTitles));
  diagnostics.adultGoogleBooksRenderedIdentityAudit = renderedIdentityAudit;
  diagnostics.adultGoogleBooksFinalSlateIdentityRootCauseHistogram = finalSlateIdentityRootCauseHistogram;
  diagnostics.adultGoogleBooksFinalSlateIdentityAuditSummary = finalSlateIdentityAuditSummary;
  diagnostics.adultGoogleBooksFinalSlateIdentityFlaggedDetailsByTitle = finalSlateIdentityFlaggedDetailsByTitle;
  diagnostics.adultGoogleBooksIdentityEnforcementDecisionByTitle = identityEnforcementDecisionByTitle;
  diagnostics.adultGoogleBooksIdentityEnforcementReasonByTitle = identityEnforcementReasonByTitle;
  diagnostics.adultGoogleBooksIdentityRejectedTitles = Array.from(new Set(identityRejectedTitles));
  diagnostics.adultGoogleBooksIdentityAcceptedTitles = Array.from(new Set(identityAcceptedTitles));
  diagnostics.adultGoogleBooksIdentityEnforcementHistogram = identityEnforcementHistogram;
  diagnostics.adultGoogleBooksIdentityBehaviorChanges = identityBehaviorChanges;
  diagnostics.adultGoogleBooksNarrativeStrengthScoreByTitle = narrativeStrengthScoreByTitle;
  diagnostics.adultGoogleBooksNarrativeStrengthComponentsByTitle = narrativeStrengthComponentsByTitle;
  diagnostics.adultGoogleBooksNarrativeStrengthEvidenceByTitle = narrativeStrengthEvidenceByTitle;
  diagnostics.adultGoogleBooksNarrativeStrengthSelectionScoreByTitle = narrativeStrengthSelectionScoreByTitle;
  diagnostics.adultGoogleBooksNarrativeStrengthRankBeforeByTitle = narrativeStrengthRankBeforeByTitle;
  diagnostics.adultGoogleBooksNarrativeStrengthRankAfterByTitle = narrativeStrengthRankAfterByTitle;
  diagnostics.adultGoogleBooksNarrativeStrengthRankDeltaByTitle = narrativeStrengthRankDeltaByTitle;
  diagnostics.adultGoogleBooksNarrativeStrengthAppliedTitles = Array.from(new Set(narrativeStrengthAppliedTitles));
  diagnostics.adultGoogleBooksNarrativeStrengthRankingChanges = narrativeStrengthRankingChanges;
  diagnostics.googleBooksPlannedQueries = Array.from(plannedQueries);
  diagnostics.googleBooksQueriesAttempted = Array.from(queriesAttempted);
  diagnostics.googleBooksRankedCandidateTitles = uniqueSignals(rankedCandidateTitles);
  diagnostics.googleBooksRawCountByQuery = rawCountByQuery;
  diagnostics.googleBooksAcceptedCountByQuery = acceptedCountByQuery;
  diagnostics.googleBooksRejectedCountByQueryAndReason = rejectedCountByQueryAndReason;
  diagnostics.googleBooksRetrievalUnderfillReason = acceptedTitles.length === 0 ? "no_googlebooks_candidates_passed_final_eligibility" : undefined;
  diagnostics.adultGoogleBooksRejectedTitlesByReason = rejectedTitlesByReason;
  diagnostics.adultGoogleBooksAcceptedTitles = acceptedTitles;
  diagnostics.googleBooksFinalEligibilityDecisionByTitle = finalEligibilityDecisionByTitle;
  diagnostics.googleBooksFinalEligibilityReasonByTitle = eligibilityReasonByTitle;
  diagnostics.googleBooksFinalEligibilityEvidenceByTitle = finalEligibilityEvidenceByTitle;
  diagnostics.googleBooksPostRankingGateByTitle = postRankingGateByTitle;
  diagnostics.googleBooksPostRankingGateReasonByTitle = postRankingGateReasonByTitle;
  diagnostics.googleBooksFinalSelectionDecisionByTitle = finalSelectionDecisionByTitle;
  diagnostics.googleBooksFinalSelectionExclusionReasonByTitle = finalSelectionExclusionReasonByTitle;
}

function addPreteenGoogleBooksPublicationIdentityObservability(rankedCandidates: ScoredCandidate[], selected: ScoredCandidate[], rejectedReasons: Record<string, number>, profile: TasteProfile): void {
  if (profile.ageBand !== "preteens" || !rankedCandidates.some((candidate) => candidate.source === "googleBooks")) return;
  const diagnostics = rejectedReasons as Record<string, unknown>;
  const identityByTitle: Record<string, string> = {};
  const confidenceByTitle: Record<string, number> = {};
  const evidenceByTitle: Record<string, string[]> = {};
  const narrativeEvidenceByTitle: Record<string, string[]> = {};
  const artifactEvidenceByTitle: Record<string, string[]> = {};
  const narrativeConfidenceSourceByTitle: Record<string, string[]> = {};
  const trustedFieldEvidenceByTitle: Record<string, string[]> = {};
  const overriddenNarrativeEvidenceByTitle: Record<string, string[]> = {};
  const decisionByTitle: Record<string, string> = {};
  const reasonByTitle: Record<string, string> = {};
  const recommendedFuturePolicyByTitle: Record<string, string> = {};
  const rejectedTitles: string[] = [];
  const acceptedTitles: string[] = [];
  const selectedTitles = new Set(selected.filter((candidate) => candidate.source === "googleBooks").map((candidate) => normalized(candidate.title)));

  for (const candidate of rankedCandidates.filter((row) => row.source === "googleBooks")) {
    const audit = preteenGoogleBooksPublicationIdentityAudit(candidate);
    annotatePreteenGoogleBooksPublicationIdentity(candidate, audit);
    const title = candidate.title;
    identityByTitle[title] = audit.identity;
    confidenceByTitle[title] = audit.confidence;
    evidenceByTitle[title] = audit.evidence;
    narrativeEvidenceByTitle[title] = audit.narrativeEvidence;
    artifactEvidenceByTitle[title] = audit.artifactEvidence;
    narrativeConfidenceSourceByTitle[title] = audit.narrativeConfidenceSource;
    trustedFieldEvidenceByTitle[title] = audit.trustedFieldEvidence;
    overriddenNarrativeEvidenceByTitle[title] = audit.overriddenNarrativeEvidence;
    recommendedFuturePolicyByTitle[title] = audit.recommendedFuturePolicyDecision;
    if (!audit.allowed) {
      decisionByTitle[title] = "rejected";
      reasonByTitle[title] = audit.reason;
      rejectedTitles.push(title);
    } else if (selectedTitles.has(normalized(title))) {
      decisionByTitle[title] = "selected";
      reasonByTitle[title] = audit.reason;
      acceptedTitles.push(title);
    } else {
      decisionByTitle[title] = "not_selected_after_existing_ranking";
      reasonByTitle[title] = audit.reason;
    }
  }

  diagnostics.preteenGoogleBooksPublicationIdentityByTitle = identityByTitle;
  diagnostics.preteenGoogleBooksPublicationIdentityConfidenceByTitle = confidenceByTitle;
  diagnostics.preteenGoogleBooksPublicationIdentityEvidenceByTitle = evidenceByTitle;
  diagnostics.preteenGoogleBooksPublicationNarrativeEvidenceByTitle = narrativeEvidenceByTitle;
  diagnostics.preteenGoogleBooksPublicationArtifactEvidenceByTitle = artifactEvidenceByTitle;
  diagnostics.preteenGoogleBooksPublicationNarrativeConfidenceSourceByTitle = narrativeConfidenceSourceByTitle;
  diagnostics.preteenGoogleBooksPublicationTrustedFieldEvidenceByTitle = trustedFieldEvidenceByTitle;
  diagnostics.preteenGoogleBooksPublicationOverriddenNarrativeEvidenceByTitle = overriddenNarrativeEvidenceByTitle;
  diagnostics.preteenGoogleBooksPublicationDecisionByTitle = decisionByTitle;
  diagnostics.preteenGoogleBooksPublicationReasonByTitle = reasonByTitle;
  diagnostics.preteenGoogleBooksPublicationRecommendedFuturePolicyByTitle = recommendedFuturePolicyByTitle;
  diagnostics.preteenGoogleBooksPublicationRejectedTitles = Array.from(new Set(rejectedTitles));
  diagnostics.preteenGoogleBooksPublicationAcceptedTitles = Array.from(new Set(acceptedTitles));
}
function nonAdultGoogleBooksFinalEligibilityGate(reason: string, ageBand: string): string {
  if (/googlebooks_mature_content|maturity_band_mismatch/i.test(reason)) return "audience_maturity_final_eligibility";
  if (/^teen_googlebooks_publication_identity_/i.test(reason)) return "teen_publication_identity_final_guard";
  if (/^k2_(?:unknown_or_non_k2_audience_without_credible_k2_evidence|missing_child_readable_narrative_or_format_identity|decisive_adult_or_ya_contradiction)$/i.test(reason)) return "kids_googlebooks_audience_format_final_eligibility";
  if (/^k2_(?:suspicious_title_artifact|non_narrative_informational_artifact|missing_story_picture_reader_relevance)$/i.test(reason)) return "kids_clean_final_eligibility";
  if (/^preteen_googlebooks_publication_identity/i.test(reason)) return "preteen_publication_identity_final_guard";
  if (/middle_grades_(?:reference_or_local_history_artifact|query_only_missing_document_evidence|missing_route_or_fiction_evidence|non_narrative_informational_artifact)|title_only_route_evidence_missing_support|adult_or_ya_humor_leakage|humor_keyword_only_leakage|zero_doc_backed_taste_match|broad_adventure_only_taste_match/i.test(reason)) return "preteen_age_taste_final_eligibility";
  if (/non_positive_score/i.test(reason)) return `${ageBand}_positive_score_final_eligibility`;
  if (/missing_title/i.test(reason)) return "shared_required_metadata_final_eligibility";
  return "";
}

function nonAdultGoogleBooksSelectionGate(reason: string): string {
  if (/same_author/i.test(reason)) return "author_diversity_deferral";
  if (/same_series|same_root/i.test(reason)) return "series_diversity_deferral";
  if (/cluster/i.test(reason)) return "cluster_diversity_deferral";
  if (/duplicate/i.test(reason)) return "duplicate_selection_gate";
  if (/replaced|cap|coverage|ranked_below|not_selected|capacity/i.test(reason)) return "selection_capacity_or_quality_ordering";
  if (/deferred/i.test(reason)) return "selection_diversity_deferral";
  return "passed_eligibility_not_selected";
}

function addNonAdultGoogleBooksSelectionLineageObservability(rankedCandidates: ScoredCandidate[], selected: ScoredCandidate[], rejectedReasons: Record<string, number>, profile: TasteProfile): void {
  if (profile.ageBand === "adult" || !rankedCandidates.some((candidate) => candidate.source === "googleBooks")) return;
  const diagnostics = rejectedReasons as Record<string, unknown>;
  const finalEligibilityDecisionByTitle = { ...((diagnostics.googleBooksFinalEligibilityDecisionByTitle || {}) as Record<string, string>) };
  const finalEligibilityReasonByTitle = { ...((diagnostics.googleBooksFinalEligibilityReasonByTitle || {}) as Record<string, string>) };
  const finalEligibilityEvidenceByTitle = { ...((diagnostics.googleBooksFinalEligibilityEvidenceByTitle || {}) as Record<string, string[]>) };
  const finalEligibilityGateByTitle = { ...((diagnostics.googleBooksFinalEligibilityGateByTitle || {}) as Record<string, string>) };
  const postRankingGateByTitle = { ...((diagnostics.googleBooksPostRankingGateByTitle || {}) as Record<string, string>) };
  const postRankingGateReasonByTitle = { ...((diagnostics.googleBooksPostRankingGateReasonByTitle || {}) as Record<string, string>) };
  const finalSelectionDecisionByTitle = { ...((diagnostics.googleBooksFinalSelectionDecisionByTitle || {}) as Record<string, string>) };
  const finalSelectionExclusionReasonByTitle = { ...((diagnostics.googleBooksFinalSelectionExclusionReasonByTitle || {}) as Record<string, string>) };
  const teenAudienceReconciliationDecisionByTitle = { ...((diagnostics.teenGoogleBooksAudienceReconciliationDecisionByTitle || {}) as Record<string, string>) };
  const teenAudienceReconciliationReasonByTitle = { ...((diagnostics.teenGoogleBooksAudienceReconciliationReasonByTitle || {}) as Record<string, string>) };
  const teenAudienceReconciliationEvidenceByTitle = { ...((diagnostics.teenGoogleBooksAudienceReconciliationEvidenceByTitle || {}) as Record<string, string[]>) };
  const teenPublicationIdentityDecisionByTitle = { ...((diagnostics.teenGoogleBooksPublicationIdentityDecisionByTitle || {}) as Record<string, string>) };
  const teenPublicationIdentityReasonByTitle = { ...((diagnostics.teenGoogleBooksPublicationIdentityReasonByTitle || {}) as Record<string, string>) };
  const teenPublicationIdentityClassificationByTitle = { ...((diagnostics.teenGoogleBooksPublicationIdentityClassificationByTitle || {}) as Record<string, string>) };
  const teenPublicationIdentityEvidenceByTitle = { ...((diagnostics.teenGoogleBooksPublicationIdentityEvidenceByTitle || {}) as Record<string, string[]>) };
  const selectedTitles = new Set(selected.filter((candidate) => candidate.source === "googleBooks").map((candidate) => normalized(candidate.title)));

  for (const candidate of rankedCandidates.filter((row) => row.source === "googleBooks")) {
    const title = candidate.title;
    const selectedCandidate = selectedTitles.has(normalized(title));
    const finalEligibilityFailureReason = candidate.rejectedReasons.find((entry) => Boolean(nonAdultGoogleBooksFinalEligibilityGate(entry, profile.ageBand))) || "";
    const selectionReason = candidate.rejectedReasons.find((entry) => entry !== "selected" && entry !== finalEligibilityFailureReason && !/^non_positive_score_detail/.test(entry)) || "";
    const kidsAudienceEvidence = Array.isArray(candidate.diagnostics?.kidsGoogleBooksAudienceEvidence)
      ? candidate.diagnostics.kidsGoogleBooksAudienceEvidence.map((row: unknown) => String(row || "")).filter(Boolean)
      : [];
    const kidsFormatEvidence = Array.isArray(candidate.diagnostics?.kidsGoogleBooksFormatEvidence)
      ? candidate.diagnostics.kidsGoogleBooksFormatEvidence.map((row: unknown) => String(row || "")).filter(Boolean)
      : [];
    const kidsFinalEligibilityEvidence = profile.ageBand === "kids"
      ? [
        `inferred_audience:${String(candidate.diagnostics?.kidsGoogleBooksInferredAudienceBand || "unknown")}`,
        `format_identity:${String(candidate.diagnostics?.kidsGoogleBooksFormatIdentity || "unknown")}`,
        ...kidsAudienceEvidence.map((entry) => `audience_evidence:${entry}`),
        ...kidsFormatEvidence.map((entry) => `format_evidence:${entry}`),
      ]
      : [];
    const acceptedReason = profile.ageBand === "kids"
      ? "kids_googlebooks_independent_audience_and_format_final_eligibility_passed"
      : `${profile.ageBand}_googlebooks_named_final_eligibility_passed`;
    const teenPublicationIdentityDecision = String(candidate.diagnostics?.teenGoogleBooksPublicationIdentityDecision || "").trim();
    const teenPublicationIdentityReason = String(candidate.diagnostics?.teenGoogleBooksPublicationIdentityReason || "").trim();
    const teenPublicationIdentityClassification = String(candidate.diagnostics?.teenGoogleBooksPublicationIdentityClassification || "").trim();
    const teenPublicationIdentityEvidence = Array.isArray(candidate.diagnostics?.teenGoogleBooksPublicationIdentityEvidence)
      ? (candidate.diagnostics.teenGoogleBooksPublicationIdentityEvidence as unknown[]).map((entry) => String(entry || "")).filter(Boolean)
      : [];
    if (profile.ageBand === "teens" && candidate.source === "googleBooks" && teenPublicationIdentityDecision) {
      teenPublicationIdentityDecisionByTitle[title] = teenPublicationIdentityDecision;
      teenPublicationIdentityReasonByTitle[title] = teenPublicationIdentityReason || (teenPublicationIdentityDecision === "passed"
        ? "teen_googlebooks_publication_identity_passed"
        : "teen_googlebooks_publication_identity_rejected");
      teenPublicationIdentityClassificationByTitle[title] = teenPublicationIdentityClassification || "uncertain";
      teenPublicationIdentityEvidenceByTitle[title] = teenPublicationIdentityEvidence;
    }
    const teenReconciliationDecision = String(candidate.diagnostics?.teenGoogleBooksAudienceReconciliationDecision || "").trim();
    const teenReconciliationReason = String(candidate.diagnostics?.teenGoogleBooksAudienceReconciliationReason || "").trim();
    const teenReconciliationEvidence = Array.isArray(candidate.diagnostics?.teenGoogleBooksAudienceReconciliationEvidence)
      ? (candidate.diagnostics.teenGoogleBooksAudienceReconciliationEvidence as unknown[]).map((entry) => String(entry || "")).filter(Boolean)
      : [];
    if (profile.ageBand === "teens" && candidate.source === "googleBooks" && teenReconciliationDecision) {
      teenAudienceReconciliationDecisionByTitle[title] = teenReconciliationDecision;
      teenAudienceReconciliationReasonByTitle[title] = teenReconciliationReason || (teenReconciliationDecision === "rescued"
        ? "teen_googlebooks_audience_reconciliation_rescue"
        : "teen_googlebooks_audience_reconciliation_not_applied");
      teenAudienceReconciliationEvidenceByTitle[title] = teenReconciliationEvidence;
    }
    const teenAcceptedRescueReason = profile.ageBand === "teens" && teenReconciliationDecision === "rescued"
      ? (teenReconciliationReason || "teen_googlebooks_audience_reconciliation_rescue")
      : "";
    const acceptedRescueReason = candidate.rejectedReasons.find((entry) => /^accepted_.*rescue|rescue_accepted/i.test(entry)) || teenAcceptedRescueReason;
    const teenReconciliationEvidenceMarkers = profile.ageBand === "teens" && candidate.source === "googleBooks" && teenReconciliationDecision
      ? [
        `teen_audience_reconciliation:${teenReconciliationDecision}`,
        `teen_audience_reconciliation_reason:${teenAudienceReconciliationReasonByTitle[title] || teenReconciliationReason || "unknown"}`,
        ...teenReconciliationEvidence.map((entry) => `teen_audience_reconciliation_evidence:${entry}`),
      ]
      : [];
    const teenPublicationIdentityEvidenceMarkers = profile.ageBand === "teens" && candidate.source === "googleBooks" && teenPublicationIdentityDecision
      ? [
        `teen_publication_identity:${teenPublicationIdentityDecision}`,
        `teen_publication_identity_reason:${teenPublicationIdentityReasonByTitle[title] || teenPublicationIdentityReason || "unknown"}`,
        `teen_publication_identity_classification:${teenPublicationIdentityClassificationByTitle[title] || teenPublicationIdentityClassification || "uncertain"}`,
        ...teenPublicationIdentityEvidence.map((entry) => `teen_publication_identity_evidence:${entry}`),
      ]
      : [];
    if (selectedCandidate) {
      finalEligibilityDecisionByTitle[title] = "accepted";
      finalEligibilityReasonByTitle[title] = acceptedRescueReason ? `${acceptedReason}_via:${acceptedRescueReason}` : acceptedReason;
      finalEligibilityGateByTitle[title] = acceptedRescueReason
        ? `${profile.ageBand}_googlebooks_rescue_final_eligibility`
        : profile.ageBand === "kids"
          ? "kids_googlebooks_audience_format_final_eligibility"
          : `${profile.ageBand}_googlebooks_final_eligibility`;
      finalEligibilityEvidenceByTitle[title] = profile.ageBand === "kids"
        ? kidsFinalEligibilityEvidence
        : [`requested_deck:${profile.ageBand}`, acceptedRescueReason ? `accepted_rescue:${acceptedRescueReason}` : "named_final_eligibility_passed", ...teenPublicationIdentityEvidenceMarkers, ...teenReconciliationEvidenceMarkers];
      postRankingGateByTitle[title] = "selected";
      postRankingGateReasonByTitle[title] = acceptedRescueReason || "accepted";
      finalSelectionDecisionByTitle[title] = "selected";
      delete finalSelectionExclusionReasonByTitle[title];
    } else if (finalEligibilityFailureReason) {
      const gate = nonAdultGoogleBooksFinalEligibilityGate(finalEligibilityFailureReason, profile.ageBand);
      finalEligibilityDecisionByTitle[title] = "rejected";
      finalEligibilityReasonByTitle[title] = finalEligibilityFailureReason;
      finalEligibilityGateByTitle[title] = gate;
      finalEligibilityEvidenceByTitle[title] = profile.ageBand === "kids"
        ? [
          `requested_deck:kids`,
          `named_gate:${gate}`,
          ...(Array.isArray(candidate.diagnostics?.kidsGoogleBooksCleanFinalGateEvidence)
            ? (candidate.diagnostics.kidsGoogleBooksCleanFinalGateEvidence as string[]).map((e) => `clean_final_gate:${e}`)
            : []),
        ]
        : [`requested_deck:${profile.ageBand}`, `named_gate:${gate}`, ...teenPublicationIdentityEvidenceMarkers, ...teenReconciliationEvidenceMarkers];
      postRankingGateByTitle[title] = "final_eligibility";
      postRankingGateReasonByTitle[title] = finalEligibilityFailureReason;
      finalSelectionDecisionByTitle[title] = `not_reached:${gate}`;
      finalSelectionExclusionReasonByTitle[title] = finalEligibilityFailureReason;
    } else {
      finalEligibilityDecisionByTitle[title] = "accepted";
      finalEligibilityReasonByTitle[title] = acceptedReason;
      finalEligibilityGateByTitle[title] = profile.ageBand === "kids"
        ? "kids_googlebooks_audience_format_final_eligibility"
        : `${profile.ageBand}_googlebooks_final_eligibility`;
      finalEligibilityEvidenceByTitle[title] = profile.ageBand === "kids"
        ? kidsFinalEligibilityEvidence
        : [`requested_deck:${profile.ageBand}`, "named_final_eligibility_passed", ...teenPublicationIdentityEvidenceMarkers, ...teenReconciliationEvidenceMarkers];
      const exclusionReason = selectionReason || "ranked_below_final_selection";
      postRankingGateByTitle[title] = nonAdultGoogleBooksSelectionGate(exclusionReason);
      postRankingGateReasonByTitle[title] = exclusionReason;
      finalSelectionDecisionByTitle[title] = "passed_eligibility_not_selected";
      finalSelectionExclusionReasonByTitle[title] = exclusionReason;
    }
  }

  diagnostics.googleBooksFinalEligibilityDecisionByTitle = finalEligibilityDecisionByTitle;
  diagnostics.googleBooksFinalEligibilityReasonByTitle = finalEligibilityReasonByTitle;
  diagnostics.googleBooksFinalEligibilityEvidenceByTitle = finalEligibilityEvidenceByTitle;
  diagnostics.googleBooksFinalEligibilityGateByTitle = finalEligibilityGateByTitle;
  diagnostics.googleBooksPostRankingGateByTitle = postRankingGateByTitle;
  diagnostics.googleBooksPostRankingGateReasonByTitle = postRankingGateReasonByTitle;
  diagnostics.googleBooksFinalSelectionDecisionByTitle = finalSelectionDecisionByTitle;
  diagnostics.googleBooksFinalSelectionExclusionReasonByTitle = finalSelectionExclusionReasonByTitle;
  diagnostics.teenGoogleBooksAudienceReconciliationDecisionByTitle = teenAudienceReconciliationDecisionByTitle;
  diagnostics.teenGoogleBooksAudienceReconciliationReasonByTitle = teenAudienceReconciliationReasonByTitle;
  diagnostics.teenGoogleBooksAudienceReconciliationEvidenceByTitle = teenAudienceReconciliationEvidenceByTitle;
  diagnostics.teenGoogleBooksPublicationIdentityDecisionByTitle = teenPublicationIdentityDecisionByTitle;
  diagnostics.teenGoogleBooksPublicationIdentityReasonByTitle = teenPublicationIdentityReasonByTitle;
  diagnostics.teenGoogleBooksPublicationIdentityClassificationByTitle = teenPublicationIdentityClassificationByTitle;
  diagnostics.teenGoogleBooksPublicationIdentityEvidenceByTitle = teenPublicationIdentityEvidenceByTitle;
}

export function selectRecommendations(candidates: ScoredCandidate[], profile: TasteProfile, limit = 10): { selected: ScoredCandidate[]; rejectedReasons: Record<string, number> } {
  const rejectedReasons: Record<string, number> = {};
  const selected: ScoredCandidate[] = [];
  const deferred: DeferredCandidate[] = [];
  const lowScoreRescue: ScoredCandidate[] = [];
  const adultWeakOpenLibraryCandidates: ScoredCandidate[] = [];
  const seenTitles = new Set<string>();
  const seenAuthors = new Set<string>();
  const seenSeries = new Set<string>();
  const seenRecurringOpenLibraryClusters = new Set<string>();
  const seenAdultGoogleBooksClusterCounts: Record<string, number> = {};
  const seenAdultGoogleBooksClusterAuthors: Record<string, Set<string>> = {};

  applyMiddleGradesQueryOnlyScoreCaps(candidates, profile, rejectedReasons);
  const rankedCandidates = adultGoogleBooksApplyNarrativeStrengthRanking(
    [...candidates].sort((a, b) => compareForInitialSelection(a, b, profile)),
    profile,
  );

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
    const teenLaterSeriesInfo = profile.ageBand === "teens" && candidate.source === "openLibrary"
      ? teenOpenLibrarySeriesPositionInfo(candidate)
      : null;
    if (teenLaterSeriesInfo) {
      annotateTeenOpenLibrarySeriesDiagnostics(candidate, teenLaterSeriesInfo);
      const laterSeriesWeakReason = teenOpenLibraryLaterSeriesWeakReason(candidate, profile);
      if (laterSeriesWeakReason) {
        recordRejected(candidate, rejectedReasons, laterSeriesWeakReason);
        continue;
      }
      candidate.rejectedReasons.push("teen_openlibrary_later_series_deferred");
      rejectedReasons.teen_openlibrary_later_series_deferred = Number(rejectedReasons.teen_openlibrary_later_series_deferred || 0) + 1;
      deferred.push({ candidate, reason: "teen_openlibrary_later_series_deferred" });
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
    const rootKey = profile.ageBand === "adult" && candidate.source === "googleBooks"
      ? adultGoogleBooksSeriesRoot(candidate)
      : seriesKey(candidate);
    if (rootKey && seenSeries.has(rootKey)) {
      deferred.push({ candidate, reason: "same_series_or_root_deferred" });
      continue;
    }
    const adultGoogleBooksCluster = profile.ageBand === "adult" && candidate.source === "googleBooks"
      ? adultGoogleBooksClusterKey(candidate)
      : "";
    if (adultGoogleBooksCluster) {
      const clusterCount = Number(seenAdultGoogleBooksClusterCounts[adultGoogleBooksCluster] || 0);
      const clusterAuthors = seenAdultGoogleBooksClusterAuthors[adultGoogleBooksCluster] || new Set<string>();
      if (clusterCount >= 2 || (authorKey && clusterAuthors.has(authorKey))) {
        deferred.push({ candidate, reason: "same_googlebooks_cluster_deferred" });
        continue;
      }
    }
    const recurringClusterKey = recurringOpenLibraryClusterKey(candidate);
    if (recurringClusterKey && (selected.length > 0 || seenRecurringOpenLibraryClusters.has(recurringClusterKey))) {
      deferred.push({ candidate, reason: "recurring_openlibrary_cluster_deferred" });
      continue;
    }
    seenTitles.add(titleKey);
    if (authorKey) seenAuthors.add(authorKey);
    if (rootKey) seenSeries.add(rootKey);
    if (adultGoogleBooksCluster) {
      seenAdultGoogleBooksClusterCounts[adultGoogleBooksCluster] = Number(seenAdultGoogleBooksClusterCounts[adultGoogleBooksCluster] || 0) + 1;
      if (!seenAdultGoogleBooksClusterAuthors[adultGoogleBooksCluster]) seenAdultGoogleBooksClusterAuthors[adultGoogleBooksCluster] = new Set<string>();
      if (authorKey) seenAdultGoogleBooksClusterAuthors[adultGoogleBooksCluster].add(authorKey);
    }
    if (recurringClusterKey) seenRecurringOpenLibraryClusters.add(recurringClusterKey);
    selected.push(candidate);
    if (selected.length >= limit) break;
  }

  if (selected.length === 0 && lowScoreRescue.length > 0) {
    rejectedReasons.low_score_rescue_candidates_available = lowScoreRescue.length;
    for (const candidate of lowScoreRescue.sort((a, b) => b.score - a.score)) {
      const titleKey = normalized(candidate.title);
      const authorKey = primaryAuthor(candidate);
      const rootKey = profile.ageBand === "adult" && candidate.source === "googleBooks"
        ? adultGoogleBooksSeriesRoot(candidate)
        : seriesKey(candidate);
      const adultGoogleBooksCluster = profile.ageBand === "adult" && candidate.source === "googleBooks"
        ? adultGoogleBooksClusterKey(candidate)
        : "";
      const recurringClusterKey = recurringOpenLibraryClusterKey(candidate);
      if (seenTitles.has(titleKey) || (authorKey && seenAuthors.has(authorKey)) || (rootKey && seenSeries.has(rootKey)) || (recurringClusterKey && seenRecurringOpenLibraryClusters.has(recurringClusterKey))) continue;
      if (adultGoogleBooksCluster) {
        const clusterCount = Number(seenAdultGoogleBooksClusterCounts[adultGoogleBooksCluster] || 0);
        const clusterAuthors = seenAdultGoogleBooksClusterAuthors[adultGoogleBooksCluster] || new Set<string>();
        if (clusterCount >= 2 || (authorKey && clusterAuthors.has(authorKey))) continue;
      }
      candidate.rejectedReasons.push("accepted_low_score_rescue_source_quality_or_query_alignment");
      rejectedReasons.accepted_low_score_rescue = Number(rejectedReasons.accepted_low_score_rescue || 0) + 1;
      seenTitles.add(titleKey);
      if (authorKey) seenAuthors.add(authorKey);
      if (rootKey) seenSeries.add(rootKey);
      if (adultGoogleBooksCluster) {
        seenAdultGoogleBooksClusterCounts[adultGoogleBooksCluster] = Number(seenAdultGoogleBooksClusterCounts[adultGoogleBooksCluster] || 0) + 1;
        if (!seenAdultGoogleBooksClusterAuthors[adultGoogleBooksCluster]) seenAdultGoogleBooksClusterAuthors[adultGoogleBooksCluster] = new Set<string>();
        if (authorKey) seenAdultGoogleBooksClusterAuthors[adultGoogleBooksCluster].add(authorKey);
      }
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
      if (profile.ageBand === "adult" && row.candidate.source === "googleBooks" && row.reason === "same_author_deferred") {
        row.candidate.rejectedReasons.push("underfill_blocked_same_author_variant");
        rejectedReasons.underfill_blocked_same_author_variant = Number(rejectedReasons.underfill_blocked_same_author_variant || 0) + 1;
        continue;
      }
      if (row.reason === "recurring_openlibrary_cluster_deferred" || row.reason === "same_series_or_root_deferred") {
        const blockedReason = row.reason === "same_series_or_root_deferred" ? "underfill_blocked_same_root_variant" : "underfill_blocked_recurring_openlibrary_cluster";
        row.candidate.rejectedReasons.push(blockedReason);
        rejectedReasons[blockedReason] = Number(rejectedReasons[blockedReason] || 0) + 1;
        continue;
      }
      if (profile.ageBand === "adult" && row.candidate.source === "googleBooks" && row.reason === "same_googlebooks_cluster_deferred") {
        row.candidate.rejectedReasons.push("underfill_blocked_googlebooks_cluster_concentration");
        rejectedReasons.underfill_blocked_googlebooks_cluster_concentration = Number(rejectedReasons.underfill_blocked_googlebooks_cluster_concentration || 0) + 1;
        continue;
      }
      if (profile.ageBand === "teens" && row.reason === "teen_openlibrary_later_series_deferred") {
        row.candidate.rejectedReasons.push("teen_openlibrary_later_series_accepted_after_underfill");
        rejectedReasons.teen_openlibrary_later_series_accepted_after_underfill = Number(rejectedReasons.teen_openlibrary_later_series_accepted_after_underfill || 0) + 1;
      } else {
        row.candidate.rejectedReasons.push(`underfill_relaxed_diversity:${row.reason}`);
        rejectedReasons.underfill_relaxed_diversity = Number(rejectedReasons.underfill_relaxed_diversity || 0) + 1;
      }
      seenTitles.add(titleKey);
      if (profile.ageBand === "adult" && row.candidate.source === "googleBooks") {
        const authorKey = primaryAuthor(row.candidate);
        const rootKey = adultGoogleBooksSeriesRoot(row.candidate);
        const clusterKey = adultGoogleBooksClusterKey(row.candidate);
        if (authorKey) seenAuthors.add(authorKey);
        if (rootKey) seenSeries.add(rootKey);
        if (clusterKey) {
          seenAdultGoogleBooksClusterCounts[clusterKey] = Number(seenAdultGoogleBooksClusterCounts[clusterKey] || 0) + 1;
          if (!seenAdultGoogleBooksClusterAuthors[clusterKey]) seenAdultGoogleBooksClusterAuthors[clusterKey] = new Set<string>();
          if (authorKey) seenAdultGoogleBooksClusterAuthors[clusterKey].add(authorKey);
        }
      }
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
      if (row.reason === "teen_openlibrary_later_series_deferred") {
        row.candidate.rejectedReasons.push("teen_openlibrary_later_series_accepted_after_underfill");
        rejectedReasons.teen_openlibrary_later_series_accepted_after_underfill = Number(rejectedReasons.teen_openlibrary_later_series_accepted_after_underfill || 0) + 1;
      } else {
        row.candidate.rejectedReasons.push(`teen_openlibrary_underfill_relaxed_diversity:${row.reason}`);
        rejectedReasons.teen_openlibrary_underfill_relaxed_diversity = Number(rejectedReasons.teen_openlibrary_underfill_relaxed_diversity || 0) + 1;
      }
      seenTitles.add(titleKey);
      selected.push(row.candidate);
    }
    for (const candidate of rankedCandidates) {
      if (selected.length >= teenOpenLibraryTarget) break;
      if (candidate.source !== "openLibrary") continue;
      if (selected.includes(candidate)) continue;
      if (rejectReason(candidate, profile)) continue;
      const laterSeriesInfo = teenOpenLibrarySeriesPositionInfo(candidate);
      if (laterSeriesInfo) {
        annotateTeenOpenLibrarySeriesDiagnostics(candidate, laterSeriesInfo);
        candidate.rejectedReasons.push("teen_openlibrary_later_series_requires_deferred_underfill_path");
        rejectedReasons.teen_openlibrary_later_series_requires_deferred_underfill_path = Number(rejectedReasons.teen_openlibrary_later_series_requires_deferred_underfill_path || 0) + 1;
        continue;
      }
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

  applyMiddleGradesFranchiseRepresentativePreference(rankedCandidates, selected, deferred, rejectedReasons, profile);
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
    const ageSuitabilityFloor = profile.ageBand === "preteens" ? 0.25 : 0.35;
    return candidate.score >= 5 && Number(breakdown.sourceQualityRelevance || 0) >= 1.5 && Number(breakdown.ageTeenSuitability || 0) >= ageSuitabilityFloor && avoidTotal > -1.2;
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
  applyMiddleGradesCleanFinalTopUp(rankedCandidates, selected, rejectedReasons, profile, limit);
  applyKidsCleanFinalTopUp(rankedCandidates, selected, rejectedReasons, profile, limit);
  applyKidsProfileCoverageDiversification(rankedCandidates, selected, rejectedReasons, profile, limit);

  addMiddleGradesSlateDiagnostics(selected, rejectedReasons, profile);
  addMiddleGradesSelectionObservability(rankedCandidates, selected, rejectedReasons, profile);
  addKidsSelectionObservability(rankedCandidates, selected, rejectedReasons, profile);
  addTeenOpenLibrarySelectionObservability(rankedCandidates, selected, rejectedReasons, profile);
  addTeenGoogleBooksMeaningfulTasteObservability(rankedCandidates, selected, rejectedReasons, profile);
  addAdultOpenLibrarySelectionObservability(rankedCandidates, selected, rejectedReasons, profile);
  addAdultGoogleBooksSelectionObservability(rankedCandidates, selected, rejectedReasons, profile);
  addPreteenGoogleBooksPublicationIdentityObservability(rankedCandidates, selected, rejectedReasons, profile);
  addNonAdultGoogleBooksSelectionLineageObservability(rankedCandidates, selected, rejectedReasons, profile);
  addAdultFamilyDiagnostics(rankedCandidates, selected, rejectedReasons, profile);

  return { selected, rejectedReasons };
}
