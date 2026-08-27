import { createHash } from "node:crypto";
import type {
  RealSessionAuditRow,
  RealSessionReviewEvidence,
} from "./realSessionOverlapAudit";

export type AnonymousReviewSession = {
  anonymousSessionId: string;
  ageBand: "kids" | "preteens" | "teens" | "adult";
  swipeEvidence: RealSessionReviewEvidence["swipeEvidence"];
  recommendationSlate: RealSessionReviewEvidence["recommendationSlate"];
};

function publicSessionId(auditId: string): string {
  return `anonymous-${createHash("sha256").update(`novelideas-review:${auditId}`).digest("hex").slice(0, 24)}`;
}

export function isAnonymousReviewEligible(
  row: Pick<RealSessionAuditRow, "reviewEvidence">,
): boolean {
  const evidence = row.reviewEvidence;
  if (!evidence || evidence.schemaVersion !== "anonymous_review_evidence_v1") return false;
  const decisionCount = evidence.swipeEvidence.filter(
    (item) => item.action === "like" || item.action === "dislike",
  ).length;
  return decisionCount >= 4 && evidence.recommendationSlate.length >= 5;
}

export function toAnonymousReviewSession(row: RealSessionAuditRow): AnonymousReviewSession | null {
  if (!isAnonymousReviewEligible(row) || !row.reviewEvidence) return null;
  return {
    anonymousSessionId: publicSessionId(row.auditId),
    ageBand: row.ageBand as AnonymousReviewSession["ageBand"],
    swipeEvidence: row.reviewEvidence.swipeEvidence,
    recommendationSlate: row.reviewEvidence.recommendationSlate,
  };
}

function stableHash(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function selectAnonymousReviewSession(args: {
  rows: RealSessionAuditRow[];
  reviewCoverageBySessionId: Map<string, number>;
  excludedSessionIds?: Set<string>;
  rotationKey: string;
}): AnonymousReviewSession | null {
  const candidates = args.rows
    .map(toAnonymousReviewSession)
    .filter((session): session is AnonymousReviewSession => Boolean(session));
  if (!candidates.length) return null;

  const excluded = args.excludedSessionIds || new Set<string>();
  const unserved = candidates.filter((session) => !excluded.has(session.anonymousSessionId));
  const pool = unserved.length ? unserved : candidates;
  const ageCoverage = new Map<string, number>();
  for (const session of candidates) {
    const count = args.reviewCoverageBySessionId.get(session.anonymousSessionId) || 0;
    ageCoverage.set(session.ageBand, (ageCoverage.get(session.ageBand) || 0) + count);
  }

  return [...pool].sort((left, right) => {
    const leftCoverage = args.reviewCoverageBySessionId.get(left.anonymousSessionId) || 0;
    const rightCoverage = args.reviewCoverageBySessionId.get(right.anonymousSessionId) || 0;
    return leftCoverage - rightCoverage
      || (ageCoverage.get(left.ageBand) || 0) - (ageCoverage.get(right.ageBand) || 0)
      || stableHash(`${args.rotationKey}:${left.anonymousSessionId}`)
        - stableHash(`${args.rotationKey}:${right.anonymousSessionId}`)
      || left.anonymousSessionId.localeCompare(right.anonymousSessionId);
  })[0] || null;
}
