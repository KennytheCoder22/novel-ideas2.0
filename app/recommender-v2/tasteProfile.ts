import type { SourceIdV2, SwipeSessionV2, SwipeSignalV2, TasteProfile, WeightedSignalV2 } from "./types";

const SOURCE_HINTS = new Set<SourceIdV2>(["googleBooks", "openLibrary", "kitsu", "comicVine", "localLibrary", "nyt", "mock"]);

function normalizeSignal(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ").trim();
}

type AdultTasteFamily =
  | "fantasy"
  | "science_fiction"
  | "mystery_crime_thriller"
  | "horror_paranormal"
  | "historical"
  | "romance"
  | "drama_contemporary"
  | "adventure_action"
  | "comedy";

type AdultTastePolarityDecision =
  | "strongly_liked"
  | "weakly_liked"
  | "mixed_positive"
  | "mixed_neutral"
  | "mixed_negative"
  | "true_avoid"
  | "insufficient_evidence";

type AdultTasteContribution = {
  family: AdultTasteFamily;
  sourceTag: string;
  canonicalTag: string;
  field: string;
  map: string;
  contribution: number;
  contributionStrength: number;
  evidenceLevel: "family_level" | "subfamily_or_tone_level";
  reason: string;
};

const ADULT_TASTE_GENERIC_SIGNAL = /^(adult|book|books|fiction|novel|novels|story|stories|series|literature)$/i;
const ADULT_TASTE_CONTEXT_ONLY_SIGNAL = /^(family|families|relationship|relationships|friends?|friendship|domestic)$/i;
const ADULT_TASTE_SUPPLEMENTAL_SIGNAL = /^(identity|authority|political|war and society|systemic injustice|vulnerability|human connection|betrayal|regret|love|community|outsider|atmospheric|dark|spooky|weird|hopeful|warm|gentle|melancholic|playful|quirky|energetic|fast-paced|fast paced|slow|quiet|paced|epic)$/i;

function adultTastePrimaryContentFamily(rawValue: string): AdultTasteFamily | "" {
  const value = normalizeSignal(rawValue);
  if (!value || ADULT_TASTE_GENERIC_SIGNAL.test(value) || ADULT_TASTE_CONTEXT_ONLY_SIGNAL.test(value) || ADULT_TASTE_SUPPLEMENTAL_SIGNAL.test(value)) return "";
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

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => String(value || "").trim()).filter(Boolean)));
}

function roundAdultTasteWeight(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function adultTasteContributionMultiplier(field: string): number {
  if (field === "genres") return 1;
  if (field === "tags") return 0.5;
  if (field === "format") return 0.25;
  return 0.75;
}

function adultTasteEvidenceLevel(field: string, canonicalTag: string): "family_level" | "subfamily_or_tone_level" {
  if (field !== "genres") return "subfamily_or_tone_level";
  return /\s|-/.test(canonicalTag) ? "subfamily_or_tone_level" : "family_level";
}

function adultTasteFamilyContribution(rawValue: string, field: string, map: string, baseWeight: number, action: SwipeSignalV2["action"], title: string): AdultTasteContribution | null {
  const canonicalTag = normalizeSignal(rawValue);
  const family = adultTastePrimaryContentFamily(canonicalTag);
  if (!family) return null;
  const contributionStrength = roundAdultTasteWeight(Math.abs(baseWeight) * adultTasteContributionMultiplier(field));
  const contribution = action === "dislike"
    ? -contributionStrength
    : action === "like"
      ? contributionStrength
      : 0;
  const evidenceLevel = adultTasteEvidenceLevel(field, canonicalTag);
  return {
    family,
    sourceTag: rawValue,
    canonicalTag,
    field,
    map,
    contribution,
    contributionStrength,
    evidenceLevel,
    reason: action === "skip"
      ? `skip_excluded_from_weighted_polarity:${title || "untitled"}`
      : `${action}_${field}_contributes_${family}_${evidenceLevel}`,
  };
}

function adultTastePolarityDecision(positiveWeight: number, negativeWeight: number, positiveCount: number, negativeCount: number): { decision: AdultTastePolarityDecision; reason: string } {
  const net = roundAdultTasteWeight(positiveWeight - negativeWeight);
  const meaningfulNegativeMargin = Math.max(1, roundAdultTasteWeight(positiveWeight * 0.5));
  const positiveEvidenceStrong = positiveCount >= 2 || positiveWeight >= 2;
  if (positiveWeight <= 0 && negativeWeight <= 0) return { decision: "insufficient_evidence", reason: "no_liked_or_disliked_family_evidence" };
  if (negativeWeight > 0 && positiveWeight <= 0) return { decision: "true_avoid", reason: "only_disliked_family_evidence" };
  if (negativeCount >= 3 && negativeWeight > positiveWeight + meaningfulNegativeMargin && !positiveEvidenceStrong) {
    return { decision: "true_avoid", reason: "overwhelming_negative_evidence_exceeds_weak_positive_by_meaningful_margin" };
  }
  if (positiveWeight > 0 && negativeWeight <= 0 && positiveCount >= 2 && positiveWeight >= 2) return { decision: "strongly_liked", reason: "multiple_liked_titles_no_negative_family_evidence" };
  if (positiveWeight > 0 && negativeWeight <= 0) return { decision: "weakly_liked", reason: "liked_family_evidence_no_negative_family_evidence" };
  if (net > 0) return { decision: "mixed_positive", reason: "liked_weight_exceeds_disliked_weight" };
  if (net < 0) return { decision: "mixed_negative", reason: "disliked_weight_exceeds_liked_weight_but_positive_evidence_exists" };
  return { decision: "mixed_neutral", reason: "liked_and_disliked_family_weights_tie" };
}

function buildAdultTasteFamilyDiagnostics(session: SwipeSessionV2, currentLikedFamilies: string[], currentAvoidFamilies: string[]): Record<string, unknown> {
  if (session.ageBand !== "adult") return {};

  const evidenceBySwipe: Record<string, Record<string, unknown>> = {};
  const positiveContributionBySwipe: Record<string, AdultTasteContribution[]> = {};
  const negativeContributionBySwipe: Record<string, AdultTasteContribution[]> = {};
  const reasonBySwipe: Record<string, string[]> = {};
  const sourceTagsBySwipe: Record<string, string[]> = {};
  const familyPositiveByTitle: Record<string, Record<string, number>> = {};
  const familyNegativeByTitle: Record<string, Record<string, number>> = {};
  const familyPositiveEvidenceLevelByTitle: Record<string, Record<string, Set<string>>> = {};
  const familyNegativeEvidenceLevelByTitle: Record<string, Record<string, Set<string>>> = {};
  const skippedTitlesByFamily: Record<string, string[]> = {};
  const skippedTitles = new Set<string>();

  const addBestContribution = (
    store: Record<string, Record<string, number>>,
    evidenceStore: Record<string, Record<string, Set<string>>>,
    family: string,
    title: string,
    weight: number,
    evidenceLevel: string,
  ) => {
    if (!store[family]) store[family] = {};
    store[family][title] = Math.max(Number(store[family][title] || 0), roundAdultTasteWeight(Math.abs(weight)));
    if (!evidenceStore[family]) evidenceStore[family] = {};
    if (!evidenceStore[family][title]) evidenceStore[family][title] = new Set<string>();
    evidenceStore[family][title].add(evidenceLevel);
  };

  for (const signal of session.signals || []) {
    const title = String(signal.title || signal.id || "untitled");
    const baseWeight = Math.max(0.25, Number(signal.weight || 1));
    const contributions: AdultTasteContribution[] = [];
    const addContribution = (rawValue: unknown, field: string, map: string) => {
      const value = String(rawValue || "");
      const contribution = adultTasteFamilyContribution(value, field, map, baseWeight, signal.action, title);
      if (contribution) contributions.push(contribution);
    };

    for (const value of signal.genres || []) addContribution(value, "genres", signal.action === "dislike" ? "avoidSignals" : "genreFamily");
    for (const value of signal.tones || []) addContribution(value, "tones", signal.action === "dislike" ? "avoidSignals" : "tone");
    for (const value of signal.themes || []) addContribution(value, "themes", signal.action === "dislike" ? "avoidSignals" : "themes");
    for (const value of signal.characterDynamics || []) addContribution(value, "characterDynamics", signal.action === "dislike" ? "avoidSignals" : "characterDynamics");
    for (const value of signal.tags || []) {
      const canonical = normalizeSignal(value);
      const target = /slow|fast|propulsive|quiet|paced/.test(canonical) ? "pacing" : "themes";
      addContribution(value, "tags", signal.action === "dislike" ? "avoidSignals" : target);
    }
    if (signal.format) addContribution(signal.format, "format", signal.action === "dislike" ? "avoidSignals" : "formatPreference");

    if (signal.action === "like") {
      for (const contribution of contributions) {
        addBestContribution(familyPositiveByTitle, familyPositiveEvidenceLevelByTitle, contribution.family, title, contribution.contributionStrength, contribution.evidenceLevel);
      }
      positiveContributionBySwipe[title] = contributions;
      negativeContributionBySwipe[title] = [];
    } else if (signal.action === "dislike") {
      for (const contribution of contributions) {
        addBestContribution(familyNegativeByTitle, familyNegativeEvidenceLevelByTitle, contribution.family, title, contribution.contributionStrength, contribution.evidenceLevel);
      }
      positiveContributionBySwipe[title] = [];
      negativeContributionBySwipe[title] = contributions;
    } else {
      skippedTitles.add(title);
      for (const contribution of contributions) {
        skippedTitlesByFamily[contribution.family] = uniqueStrings([...(skippedTitlesByFamily[contribution.family] || []), title]);
      }
      positiveContributionBySwipe[title] = [];
      negativeContributionBySwipe[title] = [];
    }

    sourceTagsBySwipe[title] = [
      ...(signal.genres || []),
      ...(signal.tags || []),
      ...(signal.themes || []),
      ...(signal.tones || []),
      ...(signal.characterDynamics || []),
      signal.format || "",
    ].filter(Boolean).map(String);
    const canonicalizedTags = sourceTagsBySwipe[title].map(normalizeSignal).filter(Boolean);
    const derivedFamilies = uniqueStrings(contributions.map((row) => row.family));
    reasonBySwipe[title] = uniqueStrings([
      ...contributions.map((row) => row.reason),
      signal.action === "skip" ? "skip_has_zero_weight_in_weighted_polarity" : "",
      contributions.length === 0 ? "no_adult_content_family_derived_from_profile_inputs" : "",
    ]);
    evidenceBySwipe[title] = {
      title,
      action: signal.action,
      rawCardTags: sourceTagsBySwipe[title],
      canonicalizedTags,
      derivedContentFamilies: derivedFamilies,
      contributionStrength: roundAdultTasteWeight(baseWeight),
      evidenceLevels: uniqueStrings(contributions.map((row) => row.evidenceLevel)),
      contributionScopeByFamily: Object.fromEntries(derivedFamilies.map((family) => [
        family,
        uniqueStrings(contributions.filter((row) => row.family === family).map((row) => row.evidenceLevel)),
      ])),
    };
  }

  const families = uniqueStrings([
    ...Object.keys(familyPositiveByTitle),
    ...Object.keys(familyNegativeByTitle),
    ...currentLikedFamilies,
    ...currentAvoidFamilies,
  ]);
  const positiveWeight: Record<string, number> = {};
  const negativeWeight: Record<string, number> = {};
  const netWeight: Record<string, number> = {};
  const likedTitlesByFamily: Record<string, string[]> = {};
  const dislikedTitlesByFamily: Record<string, string[]> = {};
  const positiveCount: Record<string, number> = {};
  const negativeCount: Record<string, number> = {};
  const polarityDecision: Record<string, AdultTastePolarityDecision> = {};
  const polarityReason: Record<string, string> = {};
  const familyContributionEvidenceLevel: Record<string, string[]> = {};

  for (const family of families) {
    const likedByTitle = familyPositiveByTitle[family] || {};
    const dislikedByTitle = familyNegativeByTitle[family] || {};
    likedTitlesByFamily[family] = Object.keys(likedByTitle);
    dislikedTitlesByFamily[family] = Object.keys(dislikedByTitle);
    positiveCount[family] = likedTitlesByFamily[family].length;
    negativeCount[family] = dislikedTitlesByFamily[family].length;
    positiveWeight[family] = roundAdultTasteWeight(Object.values(likedByTitle).reduce((sum, weight) => sum + Number(weight || 0), 0));
    negativeWeight[family] = roundAdultTasteWeight(Object.values(dislikedByTitle).reduce((sum, weight) => sum + Number(weight || 0), 0));
    netWeight[family] = roundAdultTasteWeight(positiveWeight[family] - negativeWeight[family]);
    const decision = adultTastePolarityDecision(positiveWeight[family], negativeWeight[family], positiveCount[family], negativeCount[family]);
    polarityDecision[family] = decision.decision;
    polarityReason[family] = decision.reason;
    familyContributionEvidenceLevel[family] = uniqueStrings([
      ...Object.values(familyPositiveEvidenceLevelByTitle[family] || {}).flatMap((set) => Array.from(set)),
      ...Object.values(familyNegativeEvidenceLevelByTitle[family] || {}).flatMap((set) => Array.from(set)),
    ]);
  }

  const weightedLikedFamilies = families.filter((family) => ["strongly_liked", "weakly_liked", "mixed_positive"].includes(polarityDecision[family]));
  const weightedAvoidFamilies = families.filter((family) => polarityDecision[family] === "true_avoid");
  const weightedMixedFamilies = families.filter((family) => /^mixed_/.test(polarityDecision[family]));
  const currentLikedSet = new Set(currentLikedFamilies);
  const currentAvoidSet = new Set(currentAvoidFamilies);
  const weightedLikedSet = new Set(weightedLikedFamilies);
  const weightedAvoidSet = new Set(weightedAvoidFamilies);
  const overlappingFamilies = currentLikedFamilies.filter((family) => currentAvoidSet.has(family));
  const overlappingFamilySet = new Set(overlappingFamilies);
  const productionLikedSet = new Set(currentLikedFamilies.filter((family) => !overlappingFamilySet.has(family)));
  const productionAvoidSet = new Set(currentAvoidFamilies.filter((family) => !overlappingFamilySet.has(family)));
  const productionMixedPositiveFamilies: string[] = [];
  const productionMixedNeutralFamilies: string[] = [];
  const productionMixedNegativeFamilies: string[] = [];
  const productionResolutionReasonByFamily: Record<string, string> = {};

  for (const family of families) {
    const decision = polarityDecision[family];
    const overlapsCurrentProfile = overlappingFamilySet.has(family);
    if (!overlapsCurrentProfile) {
      if (currentLikedSet.has(family)) productionResolutionReasonByFamily[family] = "non_overlapping_family_keeps_current_liked_profile_behavior";
      else if (currentAvoidSet.has(family)) productionResolutionReasonByFamily[family] = "non_overlapping_family_keeps_current_avoid_profile_behavior";
      else productionResolutionReasonByFamily[family] = "family_not_present_in_current_production_profile";
      continue;
    }

    if (decision === "mixed_positive" || decision === "strongly_liked" || decision === "weakly_liked") {
      productionLikedSet.add(family);
      productionAvoidSet.delete(family);
      if (decision === "mixed_positive") productionMixedPositiveFamilies.push(family);
      productionResolutionReasonByFamily[family] = `${decision}_overlap_resolved_as_liked_without_hard_avoid`;
    } else if (decision === "mixed_neutral") {
      productionAvoidSet.delete(family);
      productionLikedSet.delete(family);
      productionMixedNeutralFamilies.push(family);
      productionResolutionReasonByFamily[family] = "mixed_neutral_overlap_treated_as_neither_positive_proof_nor_hard_avoid";
    } else if (decision === "mixed_negative") {
      productionAvoidSet.delete(family);
      productionLikedSet.delete(family);
      productionMixedNegativeFamilies.push(family);
      productionResolutionReasonByFamily[family] = "mixed_negative_overlap_treated_as_soft_negative_without_hard_block";
    } else if (decision === "true_avoid") {
      productionAvoidSet.add(family);
      productionLikedSet.delete(family);
      productionResolutionReasonByFamily[family] = "true_avoid_overlap_retains_hard_avoid";
    } else {
      productionAvoidSet.delete(family);
      productionLikedSet.delete(family);
      productionResolutionReasonByFamily[family] = "overlap_has_insufficient_weighted_evidence";
    }
  }

  const productionPolarityByFamily = Object.fromEntries(families.map((family) => [
    family,
    {
      decision: polarityDecision[family],
      currentLiked: currentLikedSet.has(family),
      currentAvoid: currentAvoidSet.has(family),
      overlap: overlappingFamilySet.has(family),
      productionLiked: productionLikedSet.has(family),
      productionAvoid: productionAvoidSet.has(family),
      positiveWeight: positiveWeight[family],
      negativeWeight: negativeWeight[family],
      netWeight: netWeight[family],
      positiveCount: positiveCount[family],
      negativeCount: negativeCount[family],
      reason: productionResolutionReasonByFamily[family],
    },
  ]));
  const productionPolarityExplanationByFamily = Object.fromEntries(families.map((family) => {
    const positive = Number(positiveWeight[family] || 0);
    const negative = Number(negativeWeight[family] || 0);
    const net = Number(netWeight[family] || 0);
    const cancellationAmount = roundAdultTasteWeight(Math.min(positive, negative));
    const meaningfulNegativeMargin = Math.max(1, roundAdultTasteWeight(positive * 0.5));
    const decision = polarityDecision[family];
    const productionLiked = productionLikedSet.has(family);
    const productionAvoid = productionAvoidSet.has(family);
    const thresholdComparison =
      decision === "true_avoid" && positive <= 0
        ? `negativeWeight=${negative} > 0 and positiveWeight=${positive} <= 0`
        : decision === "true_avoid"
          ? `negativeCount=${negativeCount[family]} >= 3 and negativeWeight=${negative} > positiveWeight=${positive} + meaningfulNegativeMargin=${meaningfulNegativeMargin}`
          : decision === "strongly_liked"
            ? `positiveWeight=${positive} >= 2 and positiveCount=${positiveCount[family]} >= 2 with negativeWeight=${negative} <= 0`
            : decision === "weakly_liked"
              ? `positiveWeight=${positive} > 0 with negativeWeight=${negative} <= 0`
              : decision === "mixed_positive"
                ? `netWeight=${net} > 0 after cancellation=${cancellationAmount}`
                : decision === "mixed_negative"
                  ? `netWeight=${net} < 0 after cancellation=${cancellationAmount}`
                  : decision === "mixed_neutral"
                    ? `netWeight=${net} == 0 after cancellation=${cancellationAmount}`
                    : `positiveWeight=${positive} and negativeWeight=${negative} provide insufficient evidence`;
    return [
      family,
      {
        family,
        decision,
        polarityReason: polarityReason[family],
        productionRule: productionResolutionReasonByFamily[family],
        finalProductionPolarity: productionLiked ? "liked" : productionAvoid ? "avoided" : "neutral",
        positiveContribution: positive,
        negativeContribution: negative,
        cancellationAmount,
        remainingNetScore: net,
        thresholdComparison,
        thresholdValues: {
          positiveCount: positiveCount[family],
          negativeCount: negativeCount[family],
          meaningfulNegativeMargin,
          positiveEvidenceStrong: positiveCount[family] >= 2 || positive >= 2,
        },
        currentLiked: currentLikedSet.has(family),
        currentAvoid: currentAvoidSet.has(family),
        overlap: overlappingFamilySet.has(family),
        productionLiked,
        productionAvoid,
        likedTitles: likedTitlesByFamily[family] || [],
        dislikedTitles: dislikedTitlesByFamily[family] || [],
      },
    ];
  }));
  const mixedFamilyProductionExplanationByFamily = Object.fromEntries(
    Object.entries(productionPolarityExplanationByFamily).filter(([, value]) => {
      const decision = String((value as Record<string, unknown>).decision || "");
      return decision === "insufficient_evidence" || /^mixed_/.test(decision);
    }),
  );
  const productionPolarityRuleHistogram: Record<string, number> = {};
  const mixedFamilyProductionRuleHistogram: Record<string, number> = {};
  for (const family of families) {
    const rule = productionResolutionReasonByFamily[family] || "unknown_production_rule";
    productionPolarityRuleHistogram[rule] = Number(productionPolarityRuleHistogram[rule] || 0) + 1;
    if (Object.prototype.hasOwnProperty.call(mixedFamilyProductionExplanationByFamily, family)) {
      mixedFamilyProductionRuleHistogram[rule] = Number(mixedFamilyProductionRuleHistogram[rule] || 0) + 1;
    }
  }
  const overlapEvidenceByFamily = Object.fromEntries(overlappingFamilies.map((family) => [
    family,
    {
      likedTitles: likedTitlesByFamily[family] || [],
      dislikedTitles: dislikedTitlesByFamily[family] || [],
      avoidEvidenceCardinality: (dislikedTitlesByFamily[family] || []).length <= 1 ? "single_title" : "multiple_titles",
      evidenceLevels: familyContributionEvidenceLevel[family] || [],
    },
  ]));

  return {
    adultTasteFamilyEvidenceBySwipe: evidenceBySwipe,
    adultTastePositiveContributionBySwipe: positiveContributionBySwipe,
    adultTasteNegativeContributionBySwipe: negativeContributionBySwipe,
    adultTasteFamilyContributionReasonBySwipe: reasonBySwipe,
    adultTasteFamilySourceTagsBySwipe: sourceTagsBySwipe,
    adultTasteFamilyPositiveCount: positiveCount,
    adultTasteFamilyNegativeCount: negativeCount,
    adultTasteFamilyPositiveWeight: positiveWeight,
    adultTasteFamilyNegativeWeight: negativeWeight,
    adultTasteFamilyNetWeight: netWeight,
    adultTasteFamilyLikedTitles: likedTitlesByFamily,
    adultTasteFamilyDislikedTitles: dislikedTitlesByFamily,
    adultTasteFamilySkippedTitles: skippedTitlesByFamily,
    adultTasteSkippedTitlesExcludedFromPolarity: Array.from(skippedTitles),
    adultTasteSkippedSignalsRemovedFromProductionProfile: Array.from(skippedTitles).map((title) => {
      const removedFamilies = evidenceBySwipe[title]?.derivedContentFamilies;
      return {
        title,
        removedFamilies: Array.isArray(removedFamilies) ? removedFamilies.map(String) : [],
        reason: "adult_skip_has_zero_production_weight",
      };
    }),
    adultTasteFamilyPolarityDecision: polarityDecision,
    adultTasteFamilyPolarityReason: polarityReason,
    adultTasteFamilyEvidenceLevel: familyContributionEvidenceLevel,
    adultTasteOverlappingFamilies: overlappingFamilies,
    adultTasteOverlapEvidenceByFamily: overlapEvidenceByFamily,
    adultTasteOverlapCurrentResolutionByFamily: Object.fromEntries(overlappingFamilies.map((family) => [
      family,
      "current_binary_profile_exposes_family_as_liked_and_avoid; candidate_gate_can_cancel_equal_family_support",
    ])),
    adultTasteWeightedLikedFamilies: weightedLikedFamilies,
    adultTasteWeightedAvoidFamilies: weightedAvoidFamilies,
    adultTasteWeightedMixedFamilies: weightedMixedFamilies,
    adultTasteWeightedPolarityByFamily: Object.fromEntries(families.map((family) => [
      family,
      {
        decision: polarityDecision[family],
        positiveWeight: positiveWeight[family],
        negativeWeight: negativeWeight[family],
        netWeight: netWeight[family],
        positiveCount: positiveCount[family],
        negativeCount: negativeCount[family],
        likedTitles: likedTitlesByFamily[family] || [],
        dislikedTitles: dislikedTitlesByFamily[family] || [],
        skippedTitles: skippedTitlesByFamily[family] || [],
        reason: polarityReason[family],
      },
    ])),
    adultTasteWeightedChangedFamilies: families.filter((family) =>
      currentLikedSet.has(family) !== weightedLikedSet.has(family)
      || currentAvoidSet.has(family) !== weightedAvoidSet.has(family),
    ),
    adultTasteProductionPolarityByFamily: productionPolarityByFamily,
    adultTasteProductionPolarityResolutionReasonByFamily: productionResolutionReasonByFamily,
    adultTasteProductionPolarityExplanationByFamily: productionPolarityExplanationByFamily,
    adultTasteMixedFamilyProductionExplanationByFamily: mixedFamilyProductionExplanationByFamily,
    adultTasteProductionPolarityRuleHistogram: productionPolarityRuleHistogram,
    adultTasteMixedFamilyProductionRuleHistogram: mixedFamilyProductionRuleHistogram,
    adultTasteProductionLikedFamilies: Array.from(productionLikedSet),
    adultTasteProductionAvoidFamilies: Array.from(productionAvoidSet),
    adultTasteProductionMixedPositiveFamilies: uniqueStrings(productionMixedPositiveFamilies),
    adultTasteProductionMixedNeutralFamilies: uniqueStrings(productionMixedNeutralFamilies),
    adultTasteProductionMixedNegativeFamilies: uniqueStrings(productionMixedNegativeFamilies),
    adultTasteWeightedModelEnabledForSelection: false,
    adultTasteWeightedModelConstants: {
      genreContribution: 1,
      themeToneCharacterContribution: 0.75,
      tagContribution: 0.5,
      formatContribution: 0.25,
      perSwipeFamilyContribution: "max_per_family_per_swipe_to_avoid_double_counting_tags_from_one_title",
      trueAvoidRule: "negative_only_family_or_at_least_three_disliked_titles_exceeding_weak_positive_by_meaningful_margin",
      skipRule: "skips_recorded_but_zero_weight_for_weighted_polarity",
      productionUse: "weighted_polarity_reconciles_only_current_liked_and_avoid_family_overlaps",
    },
  };
}

function addWeighted(map: Map<string, WeightedSignalV2>, rawValue: string, weight: number, evidence: string): void {
  const value = normalizeSignal(rawValue);
  if (!value) return;
  const existing = map.get(value) || { value, weight: 0, evidence: [] };
  existing.weight += weight;
  if (!existing.evidence.includes(evidence)) existing.evidence.push(evidence);
  map.set(value, existing);
}

function sortedSignals(map: Map<string, WeightedSignalV2>, positiveOnly = true): WeightedSignalV2[] {
  return [...map.values()]
    .filter((row) => (positiveOnly ? row.weight > 0 : row.weight !== 0))
    .sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight) || a.value.localeCompare(b.value))
    .slice(0, 12);
}


const MIDDLE_GRADES_SHARED_AVOID_SIGNAL = /^(book|books|novel|novels|fiction|story|stories|series|children|childrens?|middle grade|middle grades|adventure|fantasy|friendship|friends|playful|fast-paced|fast paced|comedy|funny|school|family|coming of age|game|games)$/i;

function hasPositiveSignal(value: string, maps: Map<string, WeightedSignalV2>[]): boolean {
  const normalized = normalizeSignal(value);
  return maps.some((map) => (map.get(normalized)?.weight || 0) > 0);
}

function middleGradesAvoidSignals(avoidSignals: Map<string, WeightedSignalV2>, positiveMaps: Map<string, WeightedSignalV2>[]): WeightedSignalV2[] {
  return sortedSignals(avoidSignals, false).filter((signal) => {
    const value = normalizeSignal(signal.value);
    if (!value) return false;
    if (hasPositiveSignal(value, positiveMaps)) return false;
    if (MIDDLE_GRADES_SHARED_AVOID_SIGNAL.test(value)) return false;
    return true;
  });
}

const MIDDLE_GRADES_DEEP_DEBUG_FLAG_NAMES = [
  "debugMiddleGradesDeepTrace",
  "debugMiddleGradesNoTimeouts",
  "debugMiddleGradesDeepDebug",
  "middleGradesDeepDebug",
];

function browserDebugFlag(names: string | string[]): { active: boolean; source?: "url" | "localStorage" } {
  const flagNames = Array.isArray(names) ? names : [names];
  const runtime = globalThis as any;
  try {
    const search = String(runtime?.location?.search || "");
    if (search) {
      const params = new URLSearchParams(search);
      for (const name of flagNames) {
        const value = params.get(name);
        if (value === "1" || value === "true") return { active: true, source: "url" };
      }
    }
  } catch {
    // Non-browser runtimes do not expose location; ignore.
  }
  try {
    for (const name of flagNames) {
      const value = runtime?.localStorage?.getItem?.(name);
      if (value === "1" || value === "true") return { active: true, source: "localStorage" };
    }
  } catch {
    // localStorage may be unavailable or blocked; ignore.
  }
  return { active: false };
}

function middleGradesDeepDebug(session: SwipeSessionV2): { active: boolean; source: "profile" | "url" | "localStorage" | "preset" | "none" } {
  if (session.ageBand !== "preteens") return { active: false, source: "none" };
  const diagnostics = session.diagnostics || {};
  if (diagnostics.debugMiddleGradesDeepTrace || diagnostics.debugMiddleGradesNoTimeouts || session.debugMiddleGradesDeepTrace || session.debugMiddleGradesNoTimeouts) {
    return { active: true, source: diagnostics.middleGradesDeepDebugActivationSource === "preset" ? "preset" : "profile" };
  }
  const browserFlag = browserDebugFlag(MIDDLE_GRADES_DEEP_DEBUG_FLAG_NAMES);
  if (browserFlag.active) return { active: true, source: browserFlag.source || "url" };
  return { active: false, source: "none" };
}

function middleGradesDeepDebugExpectedButInactive(session: SwipeSessionV2, active: boolean): { requestedButInactive: boolean; reason?: string } {
  if (!session.diagnostics?.middleGradesDeepDebugExpected || active) return { requestedButInactive: false };
  if (session.ageBand !== "preteens") return { requestedButInactive: true, reason: "request_was_not_for_middle_grades_age_band" };
  if (!session.diagnostics.debugMiddleGradesDeepTrace && !session.diagnostics.debugMiddleGradesNoTimeouts && !session.debugMiddleGradesDeepTrace && !session.debugMiddleGradesNoTimeouts) {
    return { requestedButInactive: true, reason: "expected_flag_set_without_debug_flag" };
  }
  return { requestedButInactive: true, reason: "activation_detector_returned_inactive" };
}

export function buildTasteProfile(session: SwipeSessionV2): TasteProfile {
  const tone = new Map<string, WeightedSignalV2>();
  const pacing = new Map<string, WeightedSignalV2>();
  const genreFamily = new Map<string, WeightedSignalV2>();
  const themes = new Map<string, WeightedSignalV2>();
  const characterDynamics = new Map<string, WeightedSignalV2>();
  const formatPreference = new Map<string, WeightedSignalV2>();
  const avoidSignals = new Map<string, WeightedSignalV2>();
  const sourceHints = new Set<SourceIdV2>();
  const deepDebug = middleGradesDeepDebug(session);
  const deepDebugFailure = middleGradesDeepDebugExpectedButInactive(session, deepDebug.active);

  for (const signal of session.signals || []) {
    const adultSkip = session.ageBand === "adult" && signal.action === "skip";
    const direction = signal.action === "like" ? 1 : signal.action === "dislike" ? -1 : adultSkip ? 0 : 0.25;
    const weight = direction * Math.max(0.25, Number(signal.weight || 1));
    const evidence = signal.title ? `${signal.action}:${signal.title}` : signal.action;
    const targetMap = signal.action === "dislike" ? avoidSignals : null;

    for (const value of signal.tones || []) addWeighted(targetMap || tone, value, weight, evidence);
    for (const value of signal.genres || []) addWeighted(targetMap || genreFamily, value, weight, evidence);
    for (const value of signal.themes || []) addWeighted(targetMap || themes, value, weight, evidence);
    for (const value of signal.characterDynamics || []) addWeighted(targetMap || characterDynamics, value, weight, evidence);
    for (const value of signal.tags || []) {
      const normalized = normalizeSignal(value);
      if (/slow|fast|propulsive|quiet|paced/.test(normalized)) addWeighted(targetMap || pacing, normalized, weight, evidence);
      else addWeighted(targetMap || themes, normalized, weight * 0.5, evidence);
    }
    if (signal.format) addWeighted(targetMap || formatPreference, signal.format, weight, evidence);
    const source = String(signal.source || "") as SourceIdV2;
    if (SOURCE_HINTS.has(source) && !adultSkip) sourceHints.add(source);
  }

  const positiveMaps = [tone, pacing, genreFamily, themes, characterDynamics, formatPreference];
  const adultCurrentLikedFamilies = session.ageBand === "adult"
    ? uniqueStrings(positiveMaps.flatMap((map) => [...map.values()].filter((signal) => signal.weight > 0).map((signal) => adultTastePrimaryContentFamily(signal.value)).filter(Boolean)))
    : [];
  const adultCurrentAvoidFamilies = session.ageBand === "adult"
    ? uniqueStrings([...avoidSignals.values()].filter((signal) => signal.weight !== 0).map((signal) => adultTastePrimaryContentFamily(signal.value)).filter(Boolean))
    : [];
  const adultTasteDiagnostics = buildAdultTasteFamilyDiagnostics(session, adultCurrentLikedFamilies, adultCurrentAvoidFamilies);

  return {
    ageBand: session.ageBand,
    tone: sortedSignals(tone),
    pacing: sortedSignals(pacing),
    genreFamily: sortedSignals(genreFamily),
    themes: sortedSignals(themes),
    characterDynamics: sortedSignals(characterDynamics),
    formatPreference: sortedSignals(formatPreference),
    maturityBand: session.ageBand,
    avoidSignals: session.ageBand === "preteens"
      ? middleGradesAvoidSignals(avoidSignals, [tone, pacing, genreFamily, themes, characterDynamics, formatPreference])
      : sortedSignals(avoidSignals, false),
    sourceHints: [...sourceHints],
    diagnostics: {
      inputSignalCount: session.signals?.length || 0,
      likedCount: session.signals?.filter((s) => s.action === "like").length || 0,
      dislikedCount: session.signals?.filter((s) => s.action === "dislike").length || 0,
      skippedCount: session.signals?.filter((s) => s.action === "skip").length || 0,
      ...(session.diagnostics || {}),
      debugMiddleGradesDeepTrace: deepDebug.active,
      debugMiddleGradesNoTimeouts: deepDebug.active,
      middleGradesDeepDebugActive: deepDebug.active,
      middleGradesDeepDebugActivationSource: deepDebug.source,
      middleGradesDeepDebugRequestedButNotActivated: deepDebugFailure.requestedButInactive,
      middleGradesDeepDebugActivationFailureReason: deepDebugFailure.reason,
      sessionReportHeader: deepDebug.active ? "MIDDLE GRADES DEEP DEBUG: ACTIVE" : undefined,
      ...adultTasteDiagnostics,
    },
  };
}
