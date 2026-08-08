import type {
  NormalizedCandidate,
  ScoredCandidate,
  SourceDiagnosticV2,
  SourceResult,
  TasteProfile,
} from "./types";
import type {
  ComicVineEntityMetadata,
  ComicVineFallbackState,
  ComicVinePolicyBucket,
  ComicVinePublicationIdentity,
  ComicVineRange,
} from "./comicVineTypes";
import { buildComicVineEntityMetadata, comicVinePolicyBucketForIdentity } from "./comicVineIdentity";

export type ComicVineAdmissionDecision = "hard_reject" | "preferred_admit" | "conditional_admit";

type EvaluatedComicVineCandidate = {
  candidate: NormalizedCandidate;
  sourceId: string;
  title: string;
  identity: ComicVinePublicationIdentity;
  entityType: string;
  policyBucket: ComicVinePolicyBucket;
  decision: ComicVineAdmissionDecision;
  admissionReasons: string[];
  admissionEvidence: string[];
  sourceQuery: string;
  queryFamily: string;
  familyKey: string;
  titleRoot: string;
  seriesRoot: string;
  volumeId?: string;
  volumeNumber?: number;
  issueNumber?: number;
  collectionIssueRange?: ComicVineRange;
  collectionVolumeRange?: ComicVineRange;
};

type SuppressionRecord = {
  sourceId: string;
  title: string;
  identity: string;
  entityType: string;
  policyBucket: ComicVinePolicyBucket;
  decision: ComicVineAdmissionDecision;
  reasonCodes: string[];
  evidence: string[];
  sourceQuery: string;
  representativeId: string;
  representativeTitle: string;
  clusterKey: string;
};

type HardRejectRecord = {
  sourceId: string;
  title: string;
  identity: string;
  entityType: string;
  policyBucket: ComicVinePolicyBucket;
  decision: ComicVineAdmissionDecision;
  reasonCodes: string[];
  evidence: string[];
  sourceQuery: string;
};

type ClusterRecord = {
  clusterKey: string;
  members: string[];
  chosenRepresentative: string;
  suppressedMembers: string[];
  reason: string;
  evidence: string[];
};

type AmbiguousClusterRecord = {
  clusterKey: string;
  members: string[];
  reason: string;
  evidence: string[];
};

type PostScoreRecord = {
  sourceId: string;
  title: string;
  identity: string;
  entityType: string;
  policyBucket: ComicVinePolicyBucket;
  score: number;
  reason: string;
  evidence: string[];
};

type ComicVineAdmissionDiagnostics = {
  evaluatedCount: number;
  admittedToScorerCount: number;
  admissionStateCounts: Record<ComicVineAdmissionDecision, number>;
  policyBucketHistogram: Record<string, number>;
  hardRejectionReasonHistogram: Record<string, number>;
  preferredIdentityHistogram: Record<string, number>;
  allowedIdentityHistogram: Record<string, number>;
  fallbackIdentityHistogram: Record<string, number>;
  restrictedIdentityHistogram: Record<string, number>;
  hardRejectedCandidates: HardRejectRecord[];
  clusters: ClusterRecord[];
  suppressedIssues: SuppressionRecord[];
  ambiguousClusters: AmbiguousClusterRecord[];
  candidatesReachingScorer: Array<{
    sourceId: string;
    title: string;
    decision: ComicVineAdmissionDecision;
    identity: string;
    entityType: string;
    policyBucket: ComicVinePolicyBucket;
  }>;
  deferredObservability: Record<string, unknown>;
};

export type ComicVinePostScoreDiagnostics = {
  consideredCount: number;
  releasableCount: number;
  withheldCount: number;
  fallbackSlotsRequested: number;
  fallbackSlotsReleased: number;
  policyBucketHistogram: Record<string, number>;
  fallbackStateHistogram: Record<string, number>;
  restrictedReleases: PostScoreRecord[];
  releasedFallbackCandidates: PostScoreRecord[];
  withheldCandidates: PostScoreRecord[];
};

const EXCLUDED_IDENTITIES = new Set<ComicVinePublicationIdentity>([
  "coloring_book",
  "activity_book",
  "rpg_supplement",
  "trading_card_guide",
  "toy_guide",
  "encyclopedia",
  "companion_guide",
]);

function safeString(value: unknown): string {
  return String(value || "").trim();
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function uniqueStrings(values: unknown[], limit = 80): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const text = safeString(value);
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
    if (out.length >= limit) break;
  }
  return out;
}

function normalizedSignalText(value: unknown): string {
  return safeString(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cloneComicVineMetadata(metadata: ComicVineEntityMetadata): ComicVineEntityMetadata {
  return {
    ...metadata,
    aliases: Array.isArray(metadata.aliases) ? [...metadata.aliases] : [],
    classificationEvidence: Array.isArray(metadata.classificationEvidence) ? [...metadata.classificationEvidence] : [],
    collectionIssueRange: metadata.collectionIssueRange ? { ...metadata.collectionIssueRange } : undefined,
    collectionVolumeRange: metadata.collectionVolumeRange ? { ...metadata.collectionVolumeRange } : undefined,
    collapseLoserSourceIds: Array.isArray(metadata.collapseLoserSourceIds) ? [...metadata.collapseLoserSourceIds] : undefined,
  };
}

function ensureComicVineMetadata(candidate: NormalizedCandidate | ScoredCandidate): ComicVineEntityMetadata {
  if (candidate.comicVine) return cloneComicVineMetadata(candidate.comicVine);
  const diagnostics = asRecord(candidate.diagnostics);
  const sourceProvenance = asRecord(diagnostics.sourceProvenance);
  const raw = asRecord(candidate.raw);
  const sourceRaw = asRecord(raw.raw);
  const rawVolume = asRecord(sourceRaw.volume || raw.volume);
  return buildComicVineEntityMetadata({
    sourceId: candidate.sourceId || candidate.id,
    title: candidate.title,
    subtitle: candidate.subtitle,
    issueNumber: sourceRaw.issue_number || raw.issue_number,
    deck: sourceRaw.deck || raw.deck,
    description: sourceRaw.description || candidate.description,
    aliases: sourceRaw.aliases || raw.aliases,
    resourceType: sourceRaw.resource_type || raw.resource_type || sourceProvenance.resourceType,
    publisher: asRecord(sourceRaw.publisher).name || raw.publisher || sourceProvenance.publisher,
    volumeId: rawVolume.id || sourceProvenance.volumeId,
    volumeName: rawVolume.name || raw.volume || sourceProvenance.volumeName,
  });
}

function decisionForBucket(policyBucket: ComicVinePolicyBucket): ComicVineAdmissionDecision {
  return policyBucket === "preferred" ? "preferred_admit" : policyBucket === "excluded" ? "hard_reject" : "conditional_admit";
}

function pushHistogramCount(histogram: Record<string, number>, key: string): void {
  histogram[key] = Number(histogram[key] || 0) + 1;
}

function setCandidateComicVine(
  candidate: NormalizedCandidate | ScoredCandidate,
  metadataUpdate: Partial<ComicVineEntityMetadata>,
  provenanceUpdate?: Partial<Record<string, unknown>>,
): void {
  const existingMetadata = ensureComicVineMetadata(candidate);
  const nextMetadata: ComicVineEntityMetadata = {
    ...existingMetadata,
    ...metadataUpdate,
    aliases: Array.isArray(metadataUpdate.aliases) ? [...metadataUpdate.aliases] : existingMetadata.aliases,
    classificationEvidence: Array.isArray(metadataUpdate.classificationEvidence)
      ? uniqueStrings(metadataUpdate.classificationEvidence, 30)
      : existingMetadata.classificationEvidence,
    collapseLoserSourceIds: Array.isArray(metadataUpdate.collapseLoserSourceIds)
      ? uniqueStrings(metadataUpdate.collapseLoserSourceIds, 60)
      : existingMetadata.collapseLoserSourceIds,
  };
  candidate.comicVine = nextMetadata;

  const diagnostics = asRecord(candidate.diagnostics);
  const sourceProvenance = asRecord(diagnostics.sourceProvenance);
  candidate.diagnostics = {
    ...diagnostics,
    publicationIdentity: nextMetadata.identity,
    publicationIdentityConfidence: nextMetadata.confidence,
    publicationIdentityEvidence: nextMetadata.classificationEvidence,
    comicVineEntityType: nextMetadata.entityType,
    comicVinePolicyBucket: nextMetadata.policyBucket,
    comicVinePrecedenceRule: nextMetadata.precedenceRule,
    comicVineFamilyKey: nextMetadata.familyKey,
    sourceProvenance: {
      ...sourceProvenance,
      source: "comicVine",
      publicationIdentity: nextMetadata.identity,
      publicationIdentityConfidence: nextMetadata.confidence,
      publicationIdentityEvidence: nextMetadata.classificationEvidence,
      comicVineEntityType: nextMetadata.entityType,
      comicVinePolicyBucket: nextMetadata.policyBucket,
      comicVinePrecedenceRule: nextMetadata.precedenceRule,
      comicVineFamilyKey: nextMetadata.familyKey,
      volumeId: nextMetadata.volumeId,
      volumeName: nextMetadata.volumeName,
      issueNumber: nextMetadata.issueNumber,
      issueAccessibility: nextMetadata.issueAccessibility,
      fallbackEligible: nextMetadata.fallbackEligible,
      fallbackState: nextMetadata.fallbackState,
      fallbackReason: nextMetadata.fallbackReason,
      collapseReason: nextMetadata.collapseReason,
      collapseWinnerSourceId: nextMetadata.collapseWinnerSourceId,
      collapseLoserSourceIds: nextMetadata.collapseLoserSourceIds,
      ...provenanceUpdate,
    },
  };
}

function admissionEvidenceFromCandidate(candidate: NormalizedCandidate | ScoredCandidate, metadata: ComicVineEntityMetadata): string[] {
  const diagnostics = asRecord(candidate.diagnostics);
  const sourceProvenance = asRecord(diagnostics.sourceProvenance);
  return uniqueStrings([
    ...metadata.classificationEvidence,
    ...(Array.isArray(sourceProvenance.publicationIdentityEvidence) ? sourceProvenance.publicationIdentityEvidence : []),
    metadata.precedenceRule ? `precedence:${metadata.precedenceRule}` : "",
    metadata.familyKey ? `family_key:${metadata.familyKey}` : "",
    metadata.volumeId ? `volume_id:${metadata.volumeId}` : "",
    metadata.volumeName ? `volume_name:${metadata.volumeName}` : "",
    metadata.issueNumber ? `issue_number:${metadata.issueNumber}` : "",
    metadata.collectionIssueRange ? `issue_range:${metadata.collectionIssueRange.start}-${metadata.collectionIssueRange.end}` : "",
    metadata.collectionVolumeRange ? `volume_range:${metadata.collectionVolumeRange.start}-${metadata.collectionVolumeRange.end}` : "",
  ], 30);
}

function comicVineClearlyUnusableRecord(candidate: NormalizedCandidate, metadata: ComicVineEntityMetadata): { unusable: boolean; reasons: string[]; evidence: string[] } {
  const raw = asRecord(candidate.raw);
  const normalizedTitle = safeString(candidate.title).toLowerCase().replace(/[^a-z0-9\s#]/g, " ").replace(/\s+/g, " ").trim();
  const titleWordCount = normalizedTitle.split(" ").filter(Boolean).length;
  const hasCreators = Array.isArray(candidate.creators) && candidate.creators.some((value) => safeString(value));
  const hasCover = Boolean(candidate.coverUrl || raw.cover_i || raw.imageUrl || raw.image_url);
  const hasDescription = safeString(candidate.description).length >= 40;
  const weakTitle = /^(hc|tpb|gn|sc|ogn|mgn)$/.test(normalizedTitle)
    || /^(volume|vol|book)\s+\d+\b/.test(normalizedTitle)
    || /\b(volume|vol|book)\s+\d+\b/.test(normalizedTitle)
    || /#\s*\d+\b/.test(candidate.title)
    || /\bcomics?\s*#\s*\d+\b/i.test(candidate.title)
    || titleWordCount <= 2;
  const reasons: string[] = [];
  if (weakTitle) reasons.push("low_information_title");
  if (!hasCreators) reasons.push("missing_creator");
  if (!hasCover) reasons.push("missing_cover");
  if (!hasDescription) reasons.push("missing_description");
  const evidence = uniqueStrings([
    `title:${candidate.title}`,
    `identity:${metadata.identity}`,
    weakTitle ? "weak_generic_or_issue_like_title" : "",
    hasCreators ? "creator_present" : "creator_missing",
    hasCover ? "cover_present" : "cover_missing",
    hasDescription ? "description_present" : "description_missing",
  ], 20);
  return {
    unusable: weakTitle && !hasCreators && !hasCover,
    reasons,
    evidence,
  };
}

function evaluateComicVineCandidate(candidate: NormalizedCandidate): EvaluatedComicVineCandidate {
  const metadata = ensureComicVineMetadata(candidate);
  const diagnostics = asRecord(candidate.diagnostics);
  const sourceProvenance = asRecord(diagnostics.sourceProvenance);
  const policyBucket = metadata.policyBucket || comicVinePolicyBucketForIdentity(metadata.identity);
  const decision = decisionForBucket(policyBucket);
  const sourceId = safeString(candidate.sourceId || sourceProvenance.sourceId || candidate.id) || candidate.id;
  const sourceQuery = safeString(diagnostics.queryText || sourceProvenance.sourceQuery);
  const queryFamily = safeString(diagnostics.queryFamily);
  const title = safeString(candidate.title);
  const unusable = comicVineClearlyUnusableRecord(candidate, metadata);
  const admissionReasons = policyBucket === "excluded"
    ? [`excluded_identity_${metadata.identity}`, `policy_bucket_${policyBucket}`]
    : policyBucket === "preferred"
      ? [`preferred_identity_${metadata.identity}`, `policy_bucket_${policyBucket}`]
      : policyBucket === "allowed"
        ? [`allowed_identity_${metadata.identity}`, `policy_bucket_${policyBucket}`]
        : policyBucket === "fallback_only"
          ? [`fallback_only_identity_${metadata.identity}`, `policy_bucket_${policyBucket}`]
          : [`restricted_identity_${metadata.identity}`, `policy_bucket_${policyBucket}`];
  const effectivePolicyBucket = unusable.unusable ? "excluded" : policyBucket;
  const effectiveDecision = unusable.unusable ? "hard_reject" : decision;
  const effectiveAdmissionReasons = unusable.unusable
    ? ["excluded_low_information_comicvine_record", ...unusable.reasons, `policy_bucket_${effectivePolicyBucket}`]
    : admissionReasons;
  const effectiveAdmissionEvidence = unusable.unusable
    ? uniqueStrings([...admissionEvidenceFromCandidate(candidate, metadata), ...unusable.evidence], 30)
    : admissionEvidenceFromCandidate(candidate, metadata);

  setCandidateComicVine(candidate, { policyBucket: effectivePolicyBucket }, {
    admissionDecision: effectiveDecision,
    admissionReasons: effectiveAdmissionReasons,
    admissionEvidence: effectiveAdmissionEvidence,
  });

  return {
    candidate,
    sourceId,
    title,
    identity: metadata.identity,
    entityType: metadata.entityType,
    policyBucket: effectivePolicyBucket,
    decision: effectiveDecision,
    admissionReasons: effectiveAdmissionReasons,
    admissionEvidence: effectiveAdmissionEvidence,
    sourceQuery,
    queryFamily,
    familyKey: metadata.familyKey || `source_id:${sourceId}`,
    titleRoot: metadata.titleRoot || "",
    seriesRoot: metadata.seriesRoot || "",
    volumeId: metadata.volumeId,
    volumeNumber: metadata.volumeNumber,
    issueNumber: metadata.issueNumber,
    collectionIssueRange: metadata.collectionIssueRange,
    collectionVolumeRange: metadata.collectionVolumeRange,
  };
}

function rangesOverlap(a?: ComicVineRange, b?: ComicVineRange): boolean {
  if (!a || !b) return false;
  return a.start <= b.end && b.start <= a.end;
}

function rangeContains(range: ComicVineRange | undefined, value: number | undefined): boolean {
  return Boolean(range && value && value >= range.start && value <= range.end);
}

function entityPriority(row: EvaluatedComicVineCandidate): number {
  switch (row.identity) {
    case "omnibus":
      return 100;
    case "compendium":
      return 95;
    case "deluxe_edition":
      return 92;
    case "hardcover_collection":
      return 90;
    case "trade_paperback":
      return 88;
    case "collected_edition":
      return 86;
    case "graphic_novel":
      return 84;
    case "limited_series":
      return 78;
    case "ongoing_series":
      return 74;
    case "story_arc":
      return 72;
    case "one_shot":
      return 50;
    case "annual":
      return 48;
    case "single_issue":
      return 46;
    case "reference_book":
      return 25;
    case "art_book":
      return 24;
    case "movie_or_tv_tie_in":
      return 22;
    case "unknown":
      return 20;
    default:
      return 10;
  }
}

function policyRank(bucket: ComicVinePolicyBucket): number {
  switch (bucket) {
    case "preferred":
      return 5;
    case "allowed":
      return 4;
    case "restricted":
      return 3;
    case "fallback_only":
      return 2;
    default:
      return 1;
  }
}

function confidenceRank(confidence: string): number {
  return confidence === "high" ? 3 : confidence === "medium" ? 2 : 1;
}

function compareClusterOrder(a: EvaluatedComicVineCandidate, b: EvaluatedComicVineCandidate): number {
  const aMeta = ensureComicVineMetadata(a.candidate);
  const bMeta = ensureComicVineMetadata(b.candidate);
  return policyRank(b.policyBucket) - policyRank(a.policyBucket)
    || entityPriority(b) - entityPriority(a)
    || confidenceRank(bMeta.confidence) - confidenceRank(aMeta.confidence)
    || (bMeta.classificationEvidence.length - aMeta.classificationEvidence.length)
    || a.title.localeCompare(b.title);
}

function dominanceReason(
  winner: EvaluatedComicVineCandidate,
  loser: EvaluatedComicVineCandidate,
): { matched: boolean; reason: string; evidence: string[] } {
  if (winner.sourceId === loser.sourceId) return { matched: false, reason: "", evidence: [] };

  const sharedEvidence = uniqueStrings([
    winner.familyKey === loser.familyKey ? `shared_family_key:${winner.familyKey}` : "",
    winner.volumeId && loser.volumeId && winner.volumeId === loser.volumeId ? `shared_volume_id:${winner.volumeId}` : "",
    winner.seriesRoot && loser.seriesRoot && winner.seriesRoot === loser.seriesRoot ? `shared_series_root:${winner.seriesRoot}` : "",
    winner.titleRoot && loser.titleRoot && winner.titleRoot === loser.titleRoot ? `shared_title_root:${winner.titleRoot}` : "",
  ], 12);
  const sameFamily = sharedEvidence.length > 0;
  if (!sameFamily) return { matched: false, reason: "", evidence: [] };

  const winnerMeta = ensureComicVineMetadata(winner.candidate);
  const loserMeta = ensureComicVineMetadata(loser.candidate);

  if (winner.policyBucket !== "fallback_only" && loser.policyBucket === "fallback_only") {
    if (rangeContains(winner.collectionIssueRange, loser.issueNumber)) {
      return {
        matched: true,
        reason: "collection_defeats_component_issue",
        evidence: uniqueStrings([...sharedEvidence, `issue_in_collected_range:${winner.collectionIssueRange?.start}-${winner.collectionIssueRange?.end}`], 20),
      };
    }
    if ((winner.identity === "limited_series" || winner.identity === "ongoing_series" || winner.identity === "story_arc")
      && loser.issueNumber
      && (winner.volumeId && winner.volumeId === loser.volumeId)) {
      return {
        matched: true,
        reason: "series_container_defeats_component_issue",
        evidence: uniqueStrings([...sharedEvidence, `issue_accessibility:${loserMeta.issueAccessibility}`], 20),
      };
    }
  }

  if (winner.identity === "omnibus" && loser.volumeNumber && rangeContains(winner.collectionVolumeRange, loser.volumeNumber)) {
    return {
      matched: true,
      reason: "omnibus_defeats_contained_volume",
      evidence: uniqueStrings([...sharedEvidence, `volume_in_omnibus_range:${winner.collectionVolumeRange?.start}-${winner.collectionVolumeRange?.end}`], 20),
    };
  }

  if (winner.policyBucket !== "fallback_only" && loser.policyBucket !== "fallback_only") {
    const sameIssueRange = rangesOverlap(winner.collectionIssueRange, loser.collectionIssueRange)
      && Boolean(winner.collectionIssueRange && loser.collectionIssueRange);
    const sameVolumeNumber = Boolean(winner.volumeNumber && loser.volumeNumber && winner.volumeNumber === loser.volumeNumber);
    if (sameIssueRange || sameVolumeNumber) {
      const betterBucket = policyRank(winner.policyBucket) >= policyRank(loser.policyBucket);
      const betterPriority = entityPriority(winner) >= entityPriority(loser);
      if (betterBucket && betterPriority) {
        return {
          matched: true,
          reason: sameIssueRange ? "duplicate_collection_family_collapsed_by_issue_range" : "duplicate_collection_family_collapsed_by_volume_marker",
          evidence: uniqueStrings([
            ...sharedEvidence,
            sameIssueRange && winner.collectionIssueRange ? `shared_issue_range:${winner.collectionIssueRange.start}-${winner.collectionIssueRange.end}` : "",
            sameVolumeNumber ? `shared_volume_number:${winner.volumeNumber}` : "",
            `winner_identity:${winner.identity}`,
            `loser_identity:${loser.identity}`,
          ], 20),
        };
      }
    }
  }

  return { matched: false, reason: "", evidence: [] };
}

function buildDeferredObservability(
  evaluated: EvaluatedComicVineCandidate[],
  admittedToScorer: EvaluatedComicVineCandidate[],
  ambiguousClusters: AmbiguousClusterRecord[],
): Record<string, unknown> {
  const identityCounts = evaluated.reduce<Record<string, number>>((acc, row) => {
    acc[row.identity] = Number(acc[row.identity] || 0) + 1;
    return acc;
  }, {});
  const policyBucketCounts = evaluated.reduce<Record<string, number>>((acc, row) => {
    acc[row.policyBucket] = Number(acc[row.policyBucket] || 0) + 1;
    return acc;
  }, {});
  return {
    policyBuckets: policyBucketCounts,
    admittedRestrictedCount: Number(policyBucketCounts.restricted || 0),
    admittedFallbackOnlyCount: Number(policyBucketCounts.fallback_only || 0),
    admittedExcludedCount: Number(policyBucketCounts.excluded || 0),
    identityCounts,
    scorerHandoffFallbackOnlyCount: admittedToScorer.filter((row) => row.policyBucket === "fallback_only").length,
    scorerHandoffRestrictedCount: admittedToScorer.filter((row) => row.policyBucket === "restricted").length,
    ambiguousCollectionClusters: ambiguousClusters.length,
  };
}

export function applyComicVineSourceAdmissionPolicy(
  candidates: NormalizedCandidate[],
  sourceResults: SourceResult[],
): {
  candidates: NormalizedCandidate[];
  diagnostics: ComicVineAdmissionDiagnostics;
} {
  const evaluated: EvaluatedComicVineCandidate[] = [];
  const retainedNonComicVine: NormalizedCandidate[] = [];

  for (const candidate of candidates) {
    if (candidate.source !== "comicVine") {
      retainedNonComicVine.push(candidate);
      continue;
    }
    evaluated.push(evaluateComicVineCandidate(candidate));
  }

  const hardRejected: HardRejectRecord[] = [];
  const preferredIdentityHistogram: Record<string, number> = {};
  const allowedIdentityHistogram: Record<string, number> = {};
  const fallbackIdentityHistogram: Record<string, number> = {};
  const restrictedIdentityHistogram: Record<string, number> = {};
  const policyBucketHistogram: Record<string, number> = {};
  const hardRejectionReasonHistogram: Record<string, number> = {};
  const admittedBaseline = new Map<string, EvaluatedComicVineCandidate>();
  const admissionStateCounts: Record<ComicVineAdmissionDecision, number> = {
    hard_reject: 0,
    preferred_admit: 0,
    conditional_admit: 0,
  };

  for (const row of evaluated) {
    pushHistogramCount(admissionStateCounts, row.decision);
    pushHistogramCount(policyBucketHistogram, row.policyBucket);
    if (row.policyBucket === "excluded" || EXCLUDED_IDENTITIES.has(row.identity)) {
      for (const reason of row.admissionReasons) pushHistogramCount(hardRejectionReasonHistogram, reason);
      hardRejected.push({
        sourceId: row.sourceId,
        title: row.title,
        identity: row.identity,
        entityType: row.entityType,
        policyBucket: row.policyBucket,
        decision: row.decision,
        reasonCodes: row.admissionReasons,
        evidence: row.admissionEvidence,
        sourceQuery: row.sourceQuery,
      });
      setCandidateComicVine(row.candidate, {
        policyBucket: "excluded",
        fallbackState: "not_applicable",
        fallbackReason: "excluded_by_policy_bucket",
      }, {
        admissionDecision: "hard_reject",
        admissionReasons: row.admissionReasons,
        admissionEvidence: row.admissionEvidence,
      });
      continue;
    }

    if (row.policyBucket === "preferred") pushHistogramCount(preferredIdentityHistogram, row.identity);
    else if (row.policyBucket === "allowed") pushHistogramCount(allowedIdentityHistogram, row.identity);
    else if (row.policyBucket === "fallback_only") pushHistogramCount(fallbackIdentityHistogram, row.identity);
    else pushHistogramCount(restrictedIdentityHistogram, row.identity);
    admittedBaseline.set(row.sourceId, row);
  }

  const byFamily = new Map<string, EvaluatedComicVineCandidate[]>();
  for (const row of admittedBaseline.values()) {
    const existing = byFamily.get(row.familyKey) || [];
    existing.push(row);
    byFamily.set(row.familyKey, existing);
  }

  const suppressedSourceIds = new Set<string>();
  const suppressedIssues: SuppressionRecord[] = [];
  const clusters: ClusterRecord[] = [];
  const ambiguousClusters: AmbiguousClusterRecord[] = [];

  for (const [familyKey, members] of byFamily.entries()) {
    if (members.length <= 1) continue;
    const ordered = [...members].sort(compareClusterOrder);
    const clusterKey = `comicvine_cluster:${familyKey}`;
    const winners = new Set<string>();
    let hadSuppression = false;

    for (let index = 0; index < ordered.length; index += 1) {
      const loser = ordered[index];
      if (suppressedSourceIds.has(loser.sourceId)) continue;
      let suppressingWinner: EvaluatedComicVineCandidate | undefined;
      let suppressingReason = "";
      let suppressingEvidence: string[] = [];
      for (let winnerIndex = 0; winnerIndex < index; winnerIndex += 1) {
        const candidateWinner = ordered[winnerIndex];
        if (suppressedSourceIds.has(candidateWinner.sourceId)) continue;
        const dominance = dominanceReason(candidateWinner, loser);
        if (!dominance.matched) continue;
        suppressingWinner = candidateWinner;
        suppressingReason = dominance.reason;
        suppressingEvidence = dominance.evidence;
        break;
      }
      if (!suppressingWinner) {
        winners.add(loser.sourceId);
        continue;
      }

      hadSuppression = true;
      winners.add(suppressingWinner.sourceId);
      suppressedSourceIds.add(loser.sourceId);
      const evidence = uniqueStrings([
        ...loser.admissionEvidence,
        ...suppressingWinner.admissionEvidence,
        ...suppressingEvidence,
        `representative:${suppressingWinner.sourceId}`,
      ], 30);
      const reasonCodes = [suppressingReason, ...suppressingEvidence];
      suppressedIssues.push({
        sourceId: loser.sourceId,
        title: loser.title,
        identity: loser.identity,
        entityType: loser.entityType,
        policyBucket: loser.policyBucket,
        decision: loser.decision,
        reasonCodes,
        evidence,
        sourceQuery: loser.sourceQuery,
        representativeId: suppressingWinner.sourceId,
        representativeTitle: suppressingWinner.title,
        clusterKey,
      });
      setCandidateComicVine(loser.candidate, {
        collapseReason: suppressingReason,
        collapseWinnerSourceId: suppressingWinner.sourceId,
        fallbackState: loser.policyBucket === "fallback_only" ? "withheld" : loser.candidate.comicVine?.fallbackState || "not_applicable",
        fallbackReason: loser.policyBucket === "fallback_only" ? "suppressed_by_stronger_family_member" : loser.candidate.comicVine?.fallbackReason,
      }, {
        admissionDecision: loser.decision,
        admissionReasons: uniqueStrings([...loser.admissionReasons, suppressingReason], 20),
        admissionEvidence: evidence,
        clusterKey,
        representedBy: suppressingWinner.sourceId,
        collapseReason: suppressingReason,
      });
      const winnerMeta = ensureComicVineMetadata(suppressingWinner.candidate);
      const winnerSourceProvenance = asRecord(asRecord(suppressingWinner.candidate.diagnostics).sourceProvenance);
      setCandidateComicVine(suppressingWinner.candidate, {
        collapseLoserSourceIds: uniqueStrings([...(winnerMeta.collapseLoserSourceIds || []), loser.sourceId], 80),
      }, {
        clusterKey,
        representativeOf: uniqueStrings([...(Array.isArray(winnerSourceProvenance.representativeOf)
          ? (winnerSourceProvenance.representativeOf as string[])
          : []), loser.sourceId], 80),
      });
      clusters.push({
        clusterKey,
        members: members.map((entry) => entry.sourceId),
        chosenRepresentative: suppressingWinner.sourceId,
        suppressedMembers: [loser.sourceId],
        reason: suppressingReason,
        evidence,
      });
    }

    if (!hadSuppression && winners.size > 1) {
      ambiguousClusters.push({
        clusterKey,
        members: members.map((entry) => entry.sourceId),
        reason: "multiple_family_members_retained_without_deterministic_dominance",
        evidence: uniqueStrings(members.flatMap((entry) => [
          entry.identity,
          entry.collectionIssueRange ? `issue_range:${entry.collectionIssueRange.start}-${entry.collectionIssueRange.end}` : "",
          entry.collectionVolumeRange ? `volume_range:${entry.collectionVolumeRange.start}-${entry.collectionVolumeRange.end}` : "",
          entry.volumeNumber ? `volume_number:${entry.volumeNumber}` : "",
        ]), 20),
      });
    }
  }

  const comicVineAdmittedForScorer = Array.from(admittedBaseline.values())
    .filter((row) => !suppressedSourceIds.has(row.sourceId))
    .map((row) => row.candidate);
  const finalCandidates = [...retainedNonComicVine, ...comicVineAdmittedForScorer];
  const admittedToScorerRows = Array.from(admittedBaseline.values()).filter((row) => !suppressedSourceIds.has(row.sourceId));
  const diagnostics: ComicVineAdmissionDiagnostics = {
    evaluatedCount: evaluated.length,
    admittedToScorerCount: admittedToScorerRows.length,
    admissionStateCounts,
    policyBucketHistogram,
    hardRejectionReasonHistogram,
    preferredIdentityHistogram,
    allowedIdentityHistogram,
    fallbackIdentityHistogram,
    restrictedIdentityHistogram,
    hardRejectedCandidates: hardRejected,
    clusters,
    suppressedIssues,
    ambiguousClusters,
    candidatesReachingScorer: admittedToScorerRows.map((row) => ({
      sourceId: row.sourceId,
      title: row.title,
      decision: row.decision,
      identity: row.identity,
      entityType: row.entityType,
      policyBucket: row.policyBucket,
    })),
    deferredObservability: buildDeferredObservability(evaluated, admittedToScorerRows, ambiguousClusters),
  };

  const comicVineSource = sourceResults.find((result) => result.source === "comicVine");
  if (comicVineSource) {
    const sourceDiagnostics = comicVineSource.diagnostics as SourceDiagnosticV2 & Record<string, unknown>;
    sourceDiagnostics.comicVineAdmissionPolicyVersion = "entity_policy_v1_source_local";
    sourceDiagnostics.comicVineAdmissionStateCounts = diagnostics.admissionStateCounts;
    sourceDiagnostics.comicVinePolicyBucketHistogram = diagnostics.policyBucketHistogram;
    sourceDiagnostics.comicVineHardRejectionReasonHistogram = diagnostics.hardRejectionReasonHistogram;
    sourceDiagnostics.comicVinePreferredIdentityHistogram = diagnostics.preferredIdentityHistogram;
    sourceDiagnostics.comicVineAllowedIdentityHistogram = diagnostics.allowedIdentityHistogram;
    sourceDiagnostics.comicVineFallbackIdentityHistogram = diagnostics.fallbackIdentityHistogram;
    sourceDiagnostics.comicVineRestrictedIdentityHistogram = diagnostics.restrictedIdentityHistogram;
    sourceDiagnostics.comicVineHardRejectedCandidates = diagnostics.hardRejectedCandidates;
    sourceDiagnostics.comicVineAdmissionClusterCount = diagnostics.clusters.length;
    sourceDiagnostics.comicVineAdmissionClusters = diagnostics.clusters;
    sourceDiagnostics.comicVineSuppressedIssues = diagnostics.suppressedIssues;
    sourceDiagnostics.comicVineAmbiguousClusters = diagnostics.ambiguousClusters;
    sourceDiagnostics.comicVineAdmissionDeferredObservability = diagnostics.deferredObservability;
    sourceDiagnostics.comicVineCandidatesReachingScorerAfterAdmission = diagnostics.candidatesReachingScorer;
  }

  return {
    candidates: finalCandidates,
    diagnostics,
  };
}

function directTasteEvidence(candidate: ScoredCandidate): { signals: string[]; liked: string[]; disliked: string[]; positiveScore: number } {
  const diagnostics = asRecord(candidate.diagnostics);
  const contentText = normalizedSignalText([candidate.title, candidate.subtitle, candidate.description].filter(Boolean).join(" "));
  const rawLikedSignals = uniqueStrings([
    ...(Array.isArray(diagnostics.documentBackedTasteSignals) ? diagnostics.documentBackedTasteSignals : []),
    ...(Array.isArray(diagnostics.metadataBackedMatchedLikedSignals) ? diagnostics.metadataBackedMatchedLikedSignals : []),
  ], 20);
  const documentSignals = rawLikedSignals.filter((signal) => {
    const normalizedSignal = normalizedSignalText(signal);
    return normalizedSignal && contentText.includes(normalizedSignal);
  });
  const likedSet = new Set(documentSignals.map((signal) => normalizedSignalText(signal)));
  const dislikedSignals = uniqueStrings(Array.isArray(diagnostics.metadataBackedMatchedDislikedSignals) ? diagnostics.metadataBackedMatchedDislikedSignals : [], 20)
    .filter((signal) => {
      const normalizedSignal = normalizedSignalText(signal);
      return normalizedSignal && contentText.includes(normalizedSignal) && !likedSet.has(normalizedSignal);
    });
  return {
    signals: documentSignals,
    liked: documentSignals,
    disliked: dislikedSignals,
    positiveScore: Number(diagnostics.positiveTasteScore || 0),
  };
}

function restrictedCategoryAllowed(candidate: ScoredCandidate, metadata: ComicVineEntityMetadata): { allowed: boolean; reason: string; evidence: string[] } {
  const taste = directTasteEvidence(candidate);
  const evidence = uniqueStrings([
    ...metadata.classificationEvidence,
    ...taste.liked.map((signal) => `taste_signal:${signal}`),
    metadata.precedenceRule ? `precedence:${metadata.precedenceRule}` : "",
  ], 20);

  if (metadata.identity === "encyclopedia" || metadata.identity === "companion_guide") {
    return { allowed: false, reason: "restricted_category_excluded_by_policy", evidence };
  }
  if (taste.disliked.length > 0) {
    return { allowed: false, reason: "restricted_category_has_negative_overlap", evidence: uniqueStrings([...evidence, ...taste.disliked.map((signal) => `avoid_signal:${signal}`)], 24) };
  }
  if (taste.liked.length < 2 || taste.positiveScore < 3.5) {
    return { allowed: false, reason: "restricted_category_lacks_direct_taste_evidence", evidence };
  }
  return { allowed: true, reason: "restricted_category_supported_by_direct_taste_evidence", evidence };
}

function fallbackCandidateEligibility(
  candidate: ScoredCandidate,
  metadata: ComicVineEntityMetadata,
  nonFallbackCandidates: ScoredCandidate[],
): { eligible: boolean; reason: string; evidence: string[] } {
  const taste = directTasteEvidence(candidate);
  const equivalentStronger = nonFallbackCandidates.find((other) => {
    if (other.source !== "comicVine") return false;
    const otherMeta = ensureComicVineMetadata(other);
    if (!otherMeta.familyKey || otherMeta.familyKey !== metadata.familyKey) return false;
    const winnerRow = {
      candidate: other as unknown as NormalizedCandidate,
      sourceId: String(other.sourceId || other.id),
      title: other.title,
      identity: otherMeta.identity,
      entityType: otherMeta.entityType,
      policyBucket: otherMeta.policyBucket,
      decision: decisionForBucket(otherMeta.policyBucket),
      admissionReasons: [],
      admissionEvidence: otherMeta.classificationEvidence,
      sourceQuery: String(other.diagnostics?.queryText || ""),
      queryFamily: String(other.diagnostics?.queryFamily || ""),
      familyKey: otherMeta.familyKey || "",
      titleRoot: otherMeta.titleRoot || "",
      seriesRoot: otherMeta.seriesRoot || "",
      volumeId: otherMeta.volumeId,
      volumeNumber: otherMeta.volumeNumber,
      issueNumber: otherMeta.issueNumber,
      collectionIssueRange: otherMeta.collectionIssueRange,
      collectionVolumeRange: otherMeta.collectionVolumeRange,
    } satisfies EvaluatedComicVineCandidate;
    const loserRow = {
      candidate: candidate as unknown as NormalizedCandidate,
      sourceId: String(candidate.sourceId || candidate.id),
      title: candidate.title,
      identity: metadata.identity,
      entityType: metadata.entityType,
      policyBucket: metadata.policyBucket,
      decision: decisionForBucket(metadata.policyBucket),
      admissionReasons: [],
      admissionEvidence: metadata.classificationEvidence,
      sourceQuery: String(candidate.diagnostics?.queryText || ""),
      queryFamily: String(candidate.diagnostics?.queryFamily || ""),
      familyKey: metadata.familyKey || "",
      titleRoot: metadata.titleRoot || "",
      seriesRoot: metadata.seriesRoot || "",
      volumeId: metadata.volumeId,
      volumeNumber: metadata.volumeNumber,
      issueNumber: metadata.issueNumber,
      collectionIssueRange: metadata.collectionIssueRange,
      collectionVolumeRange: metadata.collectionVolumeRange,
    } satisfies EvaluatedComicVineCandidate;
    return dominanceReason(winnerRow, loserRow).matched;
  });

  const evidence = uniqueStrings([
    ...metadata.classificationEvidence,
    `issue_accessibility:${metadata.issueAccessibility}`,
    ...taste.liked.map((signal) => `taste_signal:${signal}`),
  ], 20);

  if (equivalentStronger) {
    return { eligible: false, reason: "fallback_blocked_by_stronger_equivalent_reading_unit", evidence: uniqueStrings([...evidence, `stronger_equivalent:${equivalentStronger.title}`], 24) };
  }
  if (taste.disliked.length > 0) {
    return { eligible: false, reason: "fallback_has_negative_overlap", evidence: uniqueStrings([...evidence, ...taste.disliked.map((signal) => `avoid_signal:${signal}`)], 24) };
  }
  if (metadata.issueAccessibility === "middle_issue") {
    return { eligible: false, reason: "fallback_middle_issue_withheld", evidence };
  }
  if (metadata.issueAccessibility !== "issue_one" && metadata.issueAccessibility !== "one_shot" && metadata.issueAccessibility !== "annual") {
    return { eligible: false, reason: "fallback_issue_not_accessible", evidence };
  }
  if (taste.positiveScore < 2.5) {
    return { eligible: false, reason: "fallback_lacks_adequate_taste_relevance", evidence };
  }
  return { eligible: true, reason: "fallback_accessible_issue_allowed_under_underfill", evidence };
}

export function applyAdultComicVinePostScorePolicy(
  scored: ScoredCandidate[],
  profile: TasteProfile,
  limit: number,
): {
  candidates: ScoredCandidate[];
  diagnostics: ComicVinePostScoreDiagnostics;
} {
  if (profile.ageBand !== "adult" || !scored.some((candidate) => candidate.source === "comicVine")) {
    return {
      candidates: scored,
      diagnostics: {
        consideredCount: 0,
        releasableCount: scored.length,
        withheldCount: 0,
        fallbackSlotsRequested: 0,
        fallbackSlotsReleased: 0,
        policyBucketHistogram: {},
        fallbackStateHistogram: {},
        restrictedReleases: [],
        releasedFallbackCandidates: [],
        withheldCandidates: [],
      },
    };
  }

  const kept: ScoredCandidate[] = [];
  const comicVineCandidates: ScoredCandidate[] = [];
  const nonComicVineCandidates: ScoredCandidate[] = [];
  const restrictedApproved: ScoredCandidate[] = [];
  const fallbackEligible: Array<{ candidate: ScoredCandidate; evidence: string[]; reason: string }> = [];
  const withheldCandidates: PostScoreRecord[] = [];
  const restrictedReleases: PostScoreRecord[] = [];
  const policyBucketHistogram: Record<string, number> = {};
  const fallbackStateHistogram: Record<string, number> = {};

  for (const candidate of scored) {
    if (candidate.source !== "comicVine") {
      nonComicVineCandidates.push(candidate);
      kept.push(candidate);
      continue;
    }
    comicVineCandidates.push(candidate);
    const metadata = ensureComicVineMetadata(candidate);
    pushHistogramCount(policyBucketHistogram, metadata.policyBucket);

    if (metadata.policyBucket === "preferred" || metadata.policyBucket === "allowed") {
      setCandidateComicVine(candidate, {
        fallbackState: "not_applicable",
        fallbackReason: undefined,
      });
      pushHistogramCount(fallbackStateHistogram, "not_applicable");
      kept.push(candidate);
      continue;
    }

    if (metadata.policyBucket === "restricted") {
      const restrictedDecision = restrictedCategoryAllowed(candidate, metadata);
      if (restrictedDecision.allowed) {
        setCandidateComicVine(candidate, {
          fallbackState: "not_applicable",
          fallbackReason: restrictedDecision.reason,
        }, {
          fallbackState: "not_applicable",
          fallbackReason: restrictedDecision.reason,
        });
        pushHistogramCount(fallbackStateHistogram, "not_applicable");
        kept.push(candidate);
        restrictedApproved.push(candidate);
        restrictedReleases.push({
          sourceId: String(candidate.sourceId || candidate.id),
          title: candidate.title,
          identity: metadata.identity,
          entityType: metadata.entityType,
          policyBucket: metadata.policyBucket,
          score: candidate.score,
          reason: restrictedDecision.reason,
          evidence: restrictedDecision.evidence,
        });
      } else {
        setCandidateComicVine(candidate, {
          fallbackState: "withheld",
          fallbackReason: restrictedDecision.reason,
        }, {
          fallbackState: "withheld",
          fallbackReason: restrictedDecision.reason,
        });
        pushHistogramCount(fallbackStateHistogram, "withheld");
        withheldCandidates.push({
          sourceId: String(candidate.sourceId || candidate.id),
          title: candidate.title,
          identity: metadata.identity,
          entityType: metadata.entityType,
          policyBucket: metadata.policyBucket,
          score: candidate.score,
          reason: restrictedDecision.reason,
          evidence: restrictedDecision.evidence,
        });
      }
      continue;
    }

    const nonFallbackCandidates = [...nonComicVineCandidates, ...comicVineCandidates.filter((other) => {
      if (other === candidate) return false;
      const otherMeta = ensureComicVineMetadata(other);
      return otherMeta.policyBucket === "preferred" || otherMeta.policyBucket === "allowed" || otherMeta.policyBucket === "restricted";
    }), ...restrictedApproved];
    const eligibility = fallbackCandidateEligibility(candidate, metadata, nonFallbackCandidates);
    if (eligibility.eligible) {
      setCandidateComicVine(candidate, {
        fallbackEligible: true,
        fallbackState: "eligible",
        fallbackReason: eligibility.reason,
      }, {
        fallbackEligible: true,
        fallbackState: "eligible",
        fallbackReason: eligibility.reason,
      });
      pushHistogramCount(fallbackStateHistogram, "eligible");
      fallbackEligible.push({ candidate, evidence: eligibility.evidence, reason: eligibility.reason });
    } else {
      setCandidateComicVine(candidate, {
        fallbackEligible: false,
        fallbackState: "withheld",
        fallbackReason: eligibility.reason,
      }, {
        fallbackEligible: false,
        fallbackState: "withheld",
        fallbackReason: eligibility.reason,
      });
      pushHistogramCount(fallbackStateHistogram, "withheld");
      withheldCandidates.push({
        sourceId: String(candidate.sourceId || candidate.id),
        title: candidate.title,
        identity: metadata.identity,
        entityType: metadata.entityType,
        policyBucket: metadata.policyBucket,
        score: candidate.score,
        reason: eligibility.reason,
        evidence: eligibility.evidence,
      });
    }
  }

  const nonFallbackCount = kept.length;
  const fallbackSlotsRequested = Math.max(0, limit - nonFallbackCount);
  const releasedFallbackCandidates: PostScoreRecord[] = [];
  const eligibleFallbackSorted = [...fallbackEligible].sort((a, b) => b.candidate.score - a.candidate.score || a.candidate.title.localeCompare(b.candidate.title));

  for (let index = 0; index < eligibleFallbackSorted.length; index += 1) {
    const entry = eligibleFallbackSorted[index];
    const metadata = ensureComicVineMetadata(entry.candidate);
    const released = index < fallbackSlotsRequested;
    setCandidateComicVine(entry.candidate, {
      fallbackState: released ? "released" : "withheld",
      fallbackReason: released ? entry.reason : "fallback_not_needed_after_non_fallback_candidates",
    }, {
      fallbackState: released ? "released" : "withheld",
      fallbackReason: released ? entry.reason : "fallback_not_needed_after_non_fallback_candidates",
    });
    pushHistogramCount(fallbackStateHistogram, released ? "released" : "withheld");
    const record: PostScoreRecord = {
      sourceId: String(entry.candidate.sourceId || entry.candidate.id),
      title: entry.candidate.title,
      identity: metadata.identity,
      entityType: metadata.entityType,
      policyBucket: metadata.policyBucket,
      score: entry.candidate.score,
      reason: released ? entry.reason : "fallback_not_needed_after_non_fallback_candidates",
      evidence: entry.evidence,
    };
    if (released) {
      kept.push(entry.candidate);
      releasedFallbackCandidates.push(record);
    } else {
      withheldCandidates.push(record);
    }
  }

  return {
    candidates: kept.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title)),
    diagnostics: {
      consideredCount: comicVineCandidates.length,
      releasableCount: kept.filter((candidate) => candidate.source === "comicVine").length,
      withheldCount: withheldCandidates.length,
      fallbackSlotsRequested,
      fallbackSlotsReleased: releasedFallbackCandidates.length,
      policyBucketHistogram,
      fallbackStateHistogram,
      restrictedReleases,
      releasedFallbackCandidates,
      withheldCandidates,
    },
  };
}
