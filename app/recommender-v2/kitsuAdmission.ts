/**
 * Kitsu source-local admission policy (GAP-K1).
 *
 * Pre-admission gate:   hard-rejects doujinshi and OEL subtypes before scoring.
 * Post-score gate:      withholds one_shot candidates unless positiveTasteScore >= 2.5
 *                       (same fallback threshold used by ComicVine single-issue policy).
 *
 * This file is Kitsu-local and must not be imported by any other source.
 */
import type { NormalizedCandidate, ScoredCandidate, SourceResult, TasteProfile } from "./types";

// Subtypes that are hard-rejected regardless of taste signal.
const KITSU_HARD_REJECT_SUBTYPES = new Set(["doujinshi", "oel"]);

// Subtypes that are allowed only as taste-evidence fallback (positive score threshold).
const KITSU_ONE_SHOT_FALLBACK_SUBTYPES = new Set(["one_shot"]);

const KITSU_ONE_SHOT_POSITIVE_SCORE_THRESHOLD = 2.5;

export type KitsuAdmissionDecision = "hard_reject" | "admitted" | "one_shot_fallback_only";

type KitsuAdmissionRecord = {
  sourceId: string;
  title: string;
  kitsuSubtype: string;
  decision: KitsuAdmissionDecision;
  reason: string;
};

type KitsuAdmissionDiagnostics = {
  evaluatedCount: number;
  admittedCount: number;
  hardRejectedCount: number;
  oneShotFallbackCount: number;
  admissionDecisionBySubtype: Record<string, string>;
  hardRejectedCandidates: KitsuAdmissionRecord[];
};

function safeString(value: unknown): string {
  return String(value || "").trim();
}

function extractKitsuSubtype(candidate: NormalizedCandidate): string {
  const raw = candidate.raw as Record<string, unknown> | undefined;
  return safeString(raw?.kitsuSubtype).toLowerCase();
}

function admissionDecision(subtype: string): KitsuAdmissionDecision {
  if (KITSU_HARD_REJECT_SUBTYPES.has(subtype)) return "hard_reject";
  if (KITSU_ONE_SHOT_FALLBACK_SUBTYPES.has(subtype)) return "one_shot_fallback_only";
  return "admitted";
}

/**
 * Pre-score admission gate: hard-reject doujinshi and OEL candidates.
 * one_shot candidates are admitted here but may be withheld post-score.
 * All other Kitsu candidates pass through.
 */
export function applyKitsuSourceAdmissionPolicy(
  candidates: NormalizedCandidate[],
  sourceResults: SourceResult[],
): {
  candidates: NormalizedCandidate[];
  diagnostics: KitsuAdmissionDiagnostics;
} {
  const passedCandidates: NormalizedCandidate[] = [];
  const hardRejectedCandidates: KitsuAdmissionRecord[] = [];
  const admissionDecisionBySubtype: Record<string, string> = {};

  let admittedCount = 0;
  let hardRejectedCount = 0;
  let oneShotFallbackCount = 0;

  for (const candidate of candidates) {
    if (candidate.source !== "kitsu") {
      passedCandidates.push(candidate);
      continue;
    }

    const subtype = extractKitsuSubtype(candidate);
    const decision = admissionDecision(subtype);
    const subtypeKey = subtype || "unknown";

    if (!admissionDecisionBySubtype[subtypeKey]) {
      admissionDecisionBySubtype[subtypeKey] = decision;
    }

    if (decision === "hard_reject") {
      hardRejectedCount++;
      hardRejectedCandidates.push({
        sourceId: safeString(candidate.sourceId || candidate.id),
        title: candidate.title,
        kitsuSubtype: subtype,
        decision: "hard_reject",
        reason: KITSU_HARD_REJECT_SUBTYPES.has(subtype)
          ? `kitsu_subtype_${subtype}_hard_rejected`
          : "kitsu_subtype_policy_hard_reject",
      });
      // Annotate candidate diagnostics so the pipeline lineage shows the gate
      (candidate.diagnostics as Record<string, unknown>).kitsuAdmissionDecision = "hard_reject";
      (candidate.diagnostics as Record<string, unknown>).kitsuAdmissionReason = `subtype_${subtype}_excluded`;
      continue;
    }

    if (decision === "one_shot_fallback_only") {
      oneShotFallbackCount++;
      // Annotate and admit — the post-score gate will enforce the threshold
      (candidate.diagnostics as Record<string, unknown>).kitsuAdmissionDecision = "one_shot_fallback_only";
      (candidate.diagnostics as Record<string, unknown>).kitsuAdmissionReason = "one_shot_requires_taste_score_2_5";
    } else {
      admittedCount++;
      (candidate.diagnostics as Record<string, unknown>).kitsuAdmissionDecision = "admitted";
    }

    passedCandidates.push(candidate);
  }

  const diagnostics: KitsuAdmissionDiagnostics = {
    evaluatedCount: candidates.filter((c) => c.source === "kitsu").length,
    admittedCount,
    hardRejectedCount,
    oneShotFallbackCount,
    admissionDecisionBySubtype,
    hardRejectedCandidates,
  };

  // Surface diagnostics onto the Kitsu source result for observability
  const kitsuSource = sourceResults.find((r) => r.source === "kitsu");
  if (kitsuSource) {
    const d = kitsuSource.diagnostics as unknown as Record<string, unknown>;
    d.kitsuAdmissionPolicyVersion = "admission_policy_v1";
    d.kitsuAdmissionEvaluated = diagnostics.evaluatedCount;
    d.kitsuAdmissionAdmitted = diagnostics.admittedCount;
    d.kitsuAdmissionHardRejected = diagnostics.hardRejectedCount;
    d.kitsuAdmissionOneShotFallback = diagnostics.oneShotFallbackCount;
    d.kitsuAdmissionDecisionBySubtype = diagnostics.admissionDecisionBySubtype;
    d.kitsuAdmissionHardRejectedCandidates = diagnostics.hardRejectedCandidates;
  }

  return { candidates: passedCandidates, diagnostics };
}

/**
 * Post-score gate: withholds one_shot candidates unless positiveTasteScore >= 2.5.
 * All non-Kitsu candidates and non-one_shot Kitsu candidates pass through unchanged.
 */
export function applyAdultKitsuPostScorePolicy(
  scored: ScoredCandidate[],
  profile: TasteProfile,
): {
  candidates: ScoredCandidate[];
  withheldCount: number;
  withheldCandidates: Array<{ sourceId: string; title: string; kitsuSubtype: string; positiveTasteScore: number; reason: string }>;
} {
  // Gate only applies to adult profiles with Kitsu candidates
  if (profile.ageBand !== "adult" || !scored.some((c) => c.source === "kitsu")) {
    return { candidates: scored, withheldCount: 0, withheldCandidates: [] };
  }

  const passed: ScoredCandidate[] = [];
  const withheld: Array<{ sourceId: string; title: string; kitsuSubtype: string; positiveTasteScore: number; reason: string }> = [];

  for (const candidate of scored) {
    if (candidate.source !== "kitsu") {
      passed.push(candidate);
      continue;
    }

    const admissionDecisionField = safeString((candidate.diagnostics as Record<string, unknown>)?.kitsuAdmissionDecision);
    if (admissionDecisionField !== "one_shot_fallback_only") {
      passed.push(candidate);
      continue;
    }

    const positiveTasteScore = Number((candidate.diagnostics as Record<string, unknown>)?.positiveTasteScore || 0);
    if (positiveTasteScore >= KITSU_ONE_SHOT_POSITIVE_SCORE_THRESHOLD) {
      passed.push(candidate);
      continue;
    }

    // Withhold: one_shot without adequate taste relevance
    const subtype = extractKitsuSubtype(candidate as unknown as NormalizedCandidate);
    const record = {
      sourceId: safeString(candidate.sourceId || candidate.id),
      title: candidate.title,
      kitsuSubtype: subtype,
      positiveTasteScore,
      reason: "one_shot_withheld_insufficient_taste_score",
    };
    withheld.push(record);
    (candidate.diagnostics as Record<string, unknown>).kitsuPostScoreDecision = "withheld";
    (candidate.diagnostics as Record<string, unknown>).kitsuPostScoreReason = "one_shot_withheld_insufficient_taste_score";
  }

  return { candidates: passed, withheldCount: withheld.length, withheldCandidates: withheld };
}
