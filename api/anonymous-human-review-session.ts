import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  selectAnonymousReviewSession,
} from "../lib/anonymousHumanReview";
import { createRepository } from "../lib/humanReview";
import {
  listRealSessionAudits,
  realSessionAuditBlobStorageConfigured,
} from "../lib/realSessionOverlapAudit";

function queryValues(value: string | string[] | undefined): string[] {
  const values = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
  return values.map((item) => item.trim()).filter((item) => /^anonymous-[0-9a-f]{24}$/.test(item)).slice(0, 50);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "method_not_allowed" });
  }
  if (!realSessionAuditBlobStorageConfigured()) {
    return res.status(503).json({ error: "anonymous_review_sessions_unavailable" });
  }

  try {
    const [rows, reviews] = await Promise.all([
      listRealSessionAudits({ limit: 200 }),
      createRepository().listReviews(),
    ]);
    const coverage = new Map<string, number>();
    for (const review of reviews) {
      if (review?.reviewMode !== "anonymous_session") continue;
      const sourceSessionId = String(review?.sourceSessionId || "");
      if (!/^anonymous-[0-9a-f]{24}$/.test(sourceSessionId)) continue;
      coverage.set(sourceSessionId, (coverage.get(sourceSessionId) || 0) + 1);
    }
    const session = selectAnonymousReviewSession({
      rows,
      reviewCoverageBySessionId: coverage,
      excludedSessionIds: new Set(queryValues(req.query.exclude)),
      rotationKey: `${new Date().toISOString().slice(0, 10)}:${
        String(Array.isArray(req.query.nonce) ? req.query.nonce[0] : req.query.nonce || "")
          .replace(/[^a-z0-9]/gi, "")
          .slice(0, 24)
      }`,
    });
    if (!session) {
      return res.status(404).json({
        status: "no_eligible_session",
        message: "No completed anonymous sessions currently contain enough preserved review evidence.",
      });
    }
    return res.status(200).json({ status: "ok", session });
  } catch (error: any) {
    return res.status(500).json({
      error: "anonymous_review_session_load_failed",
      detail: String(error?.message || "unknown_error"),
    });
  }
}
