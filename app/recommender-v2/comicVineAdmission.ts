import type { NormalizedCandidate, SourceDiagnosticV2, SourceResult } from "./types";

export type ComicVineAdmissionDecision = "hard_reject" | "preferred_admit" | "conditional_admit";

type IdentityGroup = "hard_reject" | "preferred" | "conditional";

type EvaluatedComicVineCandidate = {
  candidate: NormalizedCandidate;
  sourceId: string;
  title: string;
  identity: string;
  group: IdentityGroup;
  decision: ComicVineAdmissionDecision;
  admissionReasons: string[];
  admissionEvidence: string[];
  sourceQuery: string;
  queryFamily: string;
  clusterBaseKey: string;
  clusterConfidence: "high" | "low";
  seriesRoot: string;
  volumeId?: string;
  issueNumber?: number;
  collectionIssueRange?: { start: number; end: number };
  volumeMarker?: string;
};

type SuppressionRecord = {
  sourceId: string;
  title: string;
  identity: string;
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
  evidence: string[];
};

type AmbiguousClusterRecord = {
  clusterKey: string;
  members: string[];
  reason: string;
  evidence: string[];
};

type ComicVineAdmissionDiagnostics = {
  evaluatedCount: number;
  admittedToScorerCount: number;
  admissionStateCounts: Record<ComicVineAdmissionDecision, number>;
  hardRejectionReasonHistogram: Record<string, number>;
  preferredIdentityHistogram: Record<string, number>;
  conditionalIdentityHistogram: Record<string, number>;
  hardRejectedCandidates: HardRejectRecord[];
  clusters: ClusterRecord[];
  suppressedIssues: SuppressionRecord[];
  ambiguousClusters: AmbiguousClusterRecord[];
  candidatesReachingScorer: Array<{ sourceId: string; title: string; decision: ComicVineAdmissionDecision; identity: string }>;
  deferredObservability: Record<string, unknown>;
};

const HARD_REJECT_IDENTITIES = new Set([
  "coloring_book",
  "activity_book",
  "rpg_supplement",
  "trading_card_guide",
  "toy_guide",
]);

const PREFERRED_IDENTITIES = new Set([
  "omnibus",
  "compendium",
  "trade_paperback",
  "collected_edition",
  "deluxe_edition",
  "graphic_novel",
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

function parsePositiveInt(value: unknown): number | undefined {
  const match = safeString(value).match(/\d+/);
  if (!match) return undefined;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function normalizedSeriesRoot(value: string): string {
  return safeString(value)
    .toLowerCase()
    .replace(/[\(\[\{].*?[\)\]\}]/g, " ")
    .replace(/[:;].*$/, " ")
    .replace(/\b(vol(?:ume)?|tpb|omnibus|compendium|deluxe|edition|collect(?:ed|s|ion)|graphic novel|hc|hardcover)\b/g, " ")
    .replace(/#\s*\d+/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractCollectionIssueRange(text: string): { start: number; end: number } | undefined {
  const normalized = safeString(text).toLowerCase();
  if (!normalized) return undefined;
  const matches = [
    normalized.match(/\bcollect(?:s|ed|ing)?\s+(?:issues?\s*)?#?\s*(\d+)\s*[-–]\s*#?\s*(\d+)/i),
    normalized.match(/\bcontains?\s+(?:issues?\s*)?#?\s*(\d+)\s*[-–]\s*#?\s*(\d+)/i),
    normalized.match(/\bfrom\s+issues?\s+#?\s*(\d+)\s*[-–]\s*#?\s*(\d+)/i),
  ];
  for (const match of matches) {
    if (!match) continue;
    const start = Number(match[1]);
    const end = Number(match[2]);
    if (Number.isFinite(start) && Number.isFinite(end) && start > 0 && end >= start && end - start <= 200) {
      return { start, end };
    }
  }
  return undefined;
}

function extractVolumeMarker(title: string): string {
  const match = safeString(title).match(/\bvol(?:ume)?\.?\s*(\d+)\b/i);
  return match ? `vol_${match[1]}` : "";
}

function clusterIdentityGroup(identity: string): IdentityGroup {
  if (HARD_REJECT_IDENTITIES.has(identity)) return "hard_reject";
  if (PREFERRED_IDENTITIES.has(identity)) return "preferred";
  return "conditional";
}

function decisionFromGroup(group: IdentityGroup): ComicVineAdmissionDecision {
  if (group === "hard_reject") return "hard_reject";
  if (group === "preferred") return "preferred_admit";
  return "conditional_admit";
}

function enrichComicVineProvenance(
  candidate: NormalizedCandidate,
  update: Partial<{
    admissionDecision: ComicVineAdmissionDecision;
    admissionReasons: string[];
    admissionEvidence: string[];
    clusterKey: string;
    representedBy: string;
    representativeOf: string[];
  }>,
): void {
  const diagnostics = asRecord(candidate.diagnostics);
  const sourceProvenance = asRecord(diagnostics.sourceProvenance);
  const nextReasons = update.admissionReasons || (Array.isArray(sourceProvenance.admissionReasons)
    ? sourceProvenance.admissionReasons.map((entry) => String(entry || "")).filter(Boolean)
    : []);
  const nextEvidence = update.admissionEvidence || (Array.isArray(sourceProvenance.admissionEvidence)
    ? sourceProvenance.admissionEvidence.map((entry) => String(entry || "")).filter(Boolean)
    : []);
  const nextRepresentativeOf = update.representativeOf || (Array.isArray(sourceProvenance.representativeOf)
    ? sourceProvenance.representativeOf.map((entry) => String(entry || "")).filter(Boolean)
    : []);
  const admissionDecision = update.admissionDecision || (safeString(sourceProvenance.admissionDecision) as ComicVineAdmissionDecision) || "conditional_admit";

  candidate.diagnostics = {
    ...diagnostics,
    sourceProvenance: {
      ...sourceProvenance,
      source: "comicVine",
      sourceId: safeString(sourceProvenance.sourceId || candidate.sourceId || candidate.id) || undefined,
      sourceQuery: safeString(sourceProvenance.sourceQuery || diagnostics.queryText) || undefined,
      admissionDecision,
      admissionReasons: nextReasons,
      admissionEvidence: nextEvidence,
      clusterKey: update.clusterKey !== undefined ? update.clusterKey : sourceProvenance.clusterKey,
      representativeOf: nextRepresentativeOf,
      representedBy: update.representedBy !== undefined ? update.representedBy : sourceProvenance.representedBy,
      sourceAdmissionDecision: admissionDecision,
      sourceAdmissionReasons: nextReasons,
    },
  };
}

function admissionEvidenceFromCandidate(candidate: NormalizedCandidate): string[] {
  const diagnostics = asRecord(candidate.diagnostics);
  const sourceProvenance = asRecord(diagnostics.sourceProvenance);
  const raw = asRecord(candidate.raw);
  const sourceRaw = asRecord(raw.raw);
  const rawVolume = asRecord(sourceRaw.volume || raw.volume);
  return uniqueStrings([
    ...(Array.isArray(diagnostics.publicationIdentityEvidence) ? diagnostics.publicationIdentityEvidence : []),
    ...(Array.isArray(sourceProvenance.publicationIdentityEvidence) ? sourceProvenance.publicationIdentityEvidence : []),
    safeString(sourceRaw.resource_type || raw.resource_type) ? `resource_type:${safeString(sourceRaw.resource_type || raw.resource_type).toLowerCase()}` : "",
    safeString(sourceRaw.issue_number || raw.issue_number) ? `issue_number:${safeString(sourceRaw.issue_number || raw.issue_number)}` : "",
    safeString(rawVolume.id) ? `volume_id:${safeString(rawVolume.id)}` : "",
    safeString(rawVolume.name) ? `volume_name:${safeString(rawVolume.name)}` : "",
  ], 24);
}

function evaluateComicVineCandidate(candidate: NormalizedCandidate): EvaluatedComicVineCandidate {
  const diagnostics = asRecord(candidate.diagnostics);
  const sourceProvenance = asRecord(diagnostics.sourceProvenance);
  const raw = asRecord(candidate.raw);
  const sourceRaw = asRecord(raw.raw);
  const rawVolume = asRecord(sourceRaw.volume || raw.volume);
  const identity = safeString(diagnostics.publicationIdentity || sourceProvenance.publicationIdentity || "unknown") || "unknown";
  const group = clusterIdentityGroup(identity);
  const decision = decisionFromGroup(group);
  const sourceId = safeString(candidate.sourceId || sourceProvenance.sourceId || candidate.id) || candidate.id;
  const sourceQuery = safeString(diagnostics.queryText || sourceProvenance.sourceQuery);
  const queryFamily = safeString(diagnostics.queryFamily);
  const title = safeString(candidate.title);
  const subtitle = safeString(candidate.subtitle);
  const volumeId = safeString(rawVolume.id);
  const volumeName = safeString(rawVolume.name);
  const seriesRoot = normalizedSeriesRoot(volumeName || subtitle || title);
  const issueNumber = parsePositiveInt(sourceRaw.issue_number || raw.issue_number || diagnostics.issueNumber || title.match(/#\s*(\d+)/)?.[1]);
  const volumeMarker = extractVolumeMarker(title);
  const collectionEvidenceText = [
    title,
    subtitle,
    safeString(sourceRaw.deck || raw.deck),
    safeString(sourceRaw.description || raw.description),
    safeString(diagnostics.publicationIdentityEvidence),
  ].join(" ");
  const collectionIssueRange = extractCollectionIssueRange(collectionEvidenceText);
  const clusterBaseKey = volumeId
    ? `volume_id:${volumeId}`
    : seriesRoot
      ? `series_root:${seriesRoot}${volumeMarker ? `:${volumeMarker}` : ""}`
      : `source_id:${sourceId}`;
  const clusterConfidence = volumeId || (seriesRoot && collectionIssueRange) ? "high" : "low";
  const admissionReasons = group === "hard_reject"
    ? [`hard_reject_identity_${identity}`, "hard_reject_identity"]
    : group === "preferred"
      ? [`preferred_identity_${identity}`, "preferred_identity_admit"]
      : [`conditional_identity_${identity}`, "conditional_identity_admit"];

  return {
    candidate,
    sourceId,
    title,
    identity,
    group,
    decision,
    admissionReasons,
    admissionEvidence: admissionEvidenceFromCandidate(candidate),
    sourceQuery,
    queryFamily,
    clusterBaseKey,
    clusterConfidence,
    seriesRoot,
    volumeId: volumeId || undefined,
    issueNumber,
    collectionIssueRange,
    volumeMarker: volumeMarker || undefined,
  };
}

function matchesComponentIssueToCollection(
  collection: EvaluatedComicVineCandidate,
  issue: EvaluatedComicVineCandidate,
): { matched: boolean; evidence: string[] } {
  const evidence: string[] = [];
  if (!issue.issueNumber) return { matched: false, evidence: [] };

  if (collection.volumeId && issue.volumeId && collection.volumeId === issue.volumeId) {
    evidence.push(`shared_volume_id:${collection.volumeId}`);
  }

  if (collection.seriesRoot && issue.seriesRoot && collection.seriesRoot === issue.seriesRoot) {
    evidence.push(`shared_series_root:${collection.seriesRoot}`);
  }

  const range = collection.collectionIssueRange;
  if (range && issue.issueNumber >= range.start && issue.issueNumber <= range.end) {
    evidence.push(`issue_in_collected_range:${range.start}-${range.end}`);
  }

  const highConfidence =
    evidence.includes(`shared_volume_id:${collection.volumeId}`) && evidence.some((entry) => entry.startsWith("issue_in_collected_range:"))
    || evidence.includes(`shared_series_root:${collection.seriesRoot}`) && evidence.some((entry) => entry.startsWith("issue_in_collected_range:")) && Boolean(collection.volumeMarker || collection.collectionIssueRange);

  return { matched: Boolean(highConfidence), evidence: uniqueStrings(evidence, 10) };
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
  const titleCorpus = evaluated.map((row) => row.title).join(" ").toLowerCase();
  const previewSignalCount = (titleCorpus.match(/\bpreview\b/g) || []).length;
  const variantSignalCount = (titleCorpus.match(/\bvariant\b/g) || []).length;
  const unsuppressedSingleIssueCount = admittedToScorer.filter((row) => row.identity === "single_issue").length;

  return {
    previews: { enforced: false, observedSignalCount: previewSignalCount },
    variant_covers: { enforced: false, observedSignalCount: variantSignalCount },
    art_book_suitability: { enforced: false, admittedCount: Number(identityCounts.art_book || 0) },
    reference_book_suitability: { enforced: false, admittedCount: Number(identityCounts.reference_book || 0) },
    tie_in_vs_guide_separation: { enforced: false, admittedTieInCount: Number(identityCounts.movie_or_tv_tie_in || 0) },
    unknown_identity_behavior: { enforced: false, admittedUnknownCount: Number(identityCounts.unknown || 0) },
    single_issue_fallback_without_collection: { enforced: false, admittedUnsuppressedSingleIssueCount: unsuppressedSingleIssueCount },
    collection_form_preference_between_collections: { enforced: false, ambiguousCollectionClusters: ambiguousClusters.length },
    broad_franchise_diversity: { enforced: false },
    final_selection_diversity: { enforced: false },
    scorer_ranking_changes: { enforced: false },
  };
}

function pushHistogramCount(histogram: Record<string, number>, key: string): void {
  histogram[key] = Number(histogram[key] || 0) + 1;
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
    const evaluatedCandidate = evaluateComicVineCandidate(candidate);
    enrichComicVineProvenance(candidate, {
      admissionDecision: evaluatedCandidate.decision,
      admissionReasons: evaluatedCandidate.admissionReasons,
      admissionEvidence: evaluatedCandidate.admissionEvidence,
    });
    evaluated.push(evaluatedCandidate);
  }

  const hardRejected: HardRejectRecord[] = [];
  const preferredIdentityHistogram: Record<string, number> = {};
  const conditionalIdentityHistogram: Record<string, number> = {};
  const hardRejectionReasonHistogram: Record<string, number> = {};
  const admittedBaseline = new Map<string, EvaluatedComicVineCandidate>();
  const admissionStateCounts: Record<ComicVineAdmissionDecision, number> = {
    hard_reject: 0,
    preferred_admit: 0,
    conditional_admit: 0,
  };

  for (const row of evaluated) {
    pushHistogramCount(admissionStateCounts, row.decision);
    if (row.group === "hard_reject") {
      for (const reason of row.admissionReasons) pushHistogramCount(hardRejectionReasonHistogram, reason);
      hardRejected.push({
        sourceId: row.sourceId,
        title: row.title,
        identity: row.identity,
        decision: row.decision,
        reasonCodes: row.admissionReasons,
        evidence: row.admissionEvidence,
        sourceQuery: row.sourceQuery,
      });
      continue;
    }

    if (row.group === "preferred") pushHistogramCount(preferredIdentityHistogram, row.identity);
    if (row.group === "conditional") pushHistogramCount(conditionalIdentityHistogram, row.identity);
    admittedBaseline.set(row.sourceId, row);
  }

  const byClusterBase = new Map<string, EvaluatedComicVineCandidate[]>();
  for (const row of admittedBaseline.values()) {
    const existing = byClusterBase.get(row.clusterBaseKey) || [];
    existing.push(row);
    byClusterBase.set(row.clusterBaseKey, existing);
  }

  const suppressedSourceIds = new Set<string>();
  const suppressedIssues: SuppressionRecord[] = [];
  const clusters: ClusterRecord[] = [];
  const ambiguousClusters: AmbiguousClusterRecord[] = [];

  for (const [clusterBaseKey, members] of byClusterBase.entries()) {
    const preferred = members.filter((row) => row.group === "preferred");
    const issues = members.filter((row) => row.identity === "single_issue");
    if (preferred.length === 0 || issues.length === 0) continue;

    const clusterKey = `comicvine_cluster:${clusterBaseKey}`;
    if (preferred.length !== 1) {
      ambiguousClusters.push({
        clusterKey,
        members: members.map((entry) => entry.sourceId),
        reason: "multiple_preferred_collection_candidates",
        evidence: uniqueStrings(preferred.map((entry) => `${entry.title} (${entry.identity})`), 20),
      });
      continue;
    }

    const representative = preferred[0];
    const suppressedMembers: SuppressionRecord[] = [];
    const clusterEvidence: string[] = [];

    for (const issue of issues) {
      const match = matchesComponentIssueToCollection(representative, issue);
      if (!match.matched) continue;
      suppressedSourceIds.add(issue.sourceId);
      const evidence = uniqueStrings([
        ...issue.admissionEvidence,
        ...representative.admissionEvidence,
        ...match.evidence,
        `representative:${representative.sourceId}`,
      ], 30);
      const reasonCodes = ["component_issue_suppressed_by_collection", ...match.evidence];
      suppressedMembers.push({
        sourceId: issue.sourceId,
        title: issue.title,
        identity: issue.identity,
        decision: issue.decision,
        reasonCodes,
        evidence,
        sourceQuery: issue.sourceQuery,
        representativeId: representative.sourceId,
        representativeTitle: representative.title,
        clusterKey,
      });

      const sourceProvenance = asRecord(asRecord(issue.candidate.diagnostics).sourceProvenance);
      const existingReasons = Array.isArray(sourceProvenance.admissionReasons)
        ? sourceProvenance.admissionReasons.map((entry) => String(entry || "")).filter(Boolean)
        : issue.admissionReasons;
      enrichComicVineProvenance(issue.candidate, {
        admissionDecision: issue.decision,
        admissionReasons: uniqueStrings([...existingReasons, "component_issue_suppressed_by_collection"], 12),
        admissionEvidence: evidence,
        clusterKey,
        representedBy: representative.sourceId,
      });
      clusterEvidence.push(...match.evidence);
    }

    if (suppressedMembers.length === 0) {
      ambiguousClusters.push({
        clusterKey,
        members: members.map((entry) => entry.sourceId),
        reason: "insufficient_deterministic_component_evidence",
        evidence: uniqueStrings([
          representative.collectionIssueRange ? `representative_collection_range:${representative.collectionIssueRange.start}-${representative.collectionIssueRange.end}` : "",
          representative.volumeId ? `representative_volume_id:${representative.volumeId}` : "",
          representative.seriesRoot ? `representative_series_root:${representative.seriesRoot}` : "",
        ], 20),
      });
      continue;
    }

    const representativeProvenance = asRecord(asRecord(representative.candidate.diagnostics).sourceProvenance);
    const representativeOf = uniqueStrings([
      ...(Array.isArray(representativeProvenance.representativeOf) ? representativeProvenance.representativeOf : []),
      ...suppressedMembers.map((entry) => entry.sourceId),
    ], 100);
    enrichComicVineProvenance(representative.candidate, {
      admissionDecision: representative.decision,
      admissionReasons: representative.admissionReasons,
      admissionEvidence: representative.admissionEvidence,
      clusterKey,
      representativeOf,
    });
    clusters.push({
      clusterKey,
      members: members.map((entry) => entry.sourceId),
      chosenRepresentative: representative.sourceId,
      suppressedMembers: suppressedMembers.map((entry) => entry.sourceId),
      evidence: uniqueStrings([
        ...clusterEvidence,
        representative.collectionIssueRange ? `collection_issue_range:${representative.collectionIssueRange.start}-${representative.collectionIssueRange.end}` : "",
        representative.volumeId ? `representative_volume_id:${representative.volumeId}` : "",
        representative.seriesRoot ? `representative_series_root:${representative.seriesRoot}` : "",
      ], 40),
    });
    suppressedIssues.push(...suppressedMembers);
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
    hardRejectionReasonHistogram,
    preferredIdentityHistogram,
    conditionalIdentityHistogram,
    hardRejectedCandidates: hardRejected,
    clusters,
    suppressedIssues,
    ambiguousClusters,
    candidatesReachingScorer: admittedToScorerRows.map((row) => ({
      sourceId: row.sourceId,
      title: row.title,
      decision: row.decision,
      identity: row.identity,
    })),
    deferredObservability: buildDeferredObservability(evaluated, admittedToScorerRows, ambiguousClusters),
  };

  const comicVineSource = sourceResults.find((result) => result.source === "comicVine");
  if (comicVineSource) {
    const sourceDiagnostics = comicVineSource.diagnostics as SourceDiagnosticV2 & Record<string, unknown>;
    sourceDiagnostics.comicVineAdmissionPolicyVersion = "slice2_source_admission_evidence_only";
    sourceDiagnostics.comicVineAdmissionStateCounts = diagnostics.admissionStateCounts;
    sourceDiagnostics.comicVineHardRejectionReasonHistogram = diagnostics.hardRejectionReasonHistogram;
    sourceDiagnostics.comicVinePreferredIdentityHistogram = diagnostics.preferredIdentityHistogram;
    sourceDiagnostics.comicVineConditionalIdentityHistogram = diagnostics.conditionalIdentityHistogram;
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
