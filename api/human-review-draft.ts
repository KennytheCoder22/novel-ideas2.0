import type { VercelRequest, VercelResponse } from "@vercel/node";
import { saveHumanReviewDraft } from "../lib/humanReview/humanReviewDraftStorage";

function isObject(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "method_not_allowed" });
  }

  try {
    const payload = req.body;
    if (!isObject(payload) || !isObject(payload.snapshot) || !isObject(payload.draft)) {
      return res.status(400).json({ error: "invalid_draft_payload" });
    }
    if (JSON.stringify(payload).length > 128_000) {
      return res.status(413).json({ error: "draft_payload_too_large" });
    }
    const snapshotId = String(payload.snapshot.snapshotId || "").trim();
    const profileId = String(payload.snapshot.profileId || "").trim();
    const reviewerId = String(payload.draftOwnerId || "").trim();
    const updatedAt = String(payload.draft.updatedAt || "").trim();
    const itemReviews = payload.draft?.form?.itemReviews;
    if (
      payload.snapshot.schemaVersion !== "human_review_snapshot_v1"
      || payload.draft.schemaVersion !== "human_review_draft_v1"
      || payload.draft.snapshotId !== snapshotId
      || !snapshotId
      || snapshotId.length > 160
      || !profileId
      || profileId.length > 160
      || !reviewerId
      || reviewerId.length > 160
      || !Number.isFinite(Date.parse(updatedAt))
    ) {
      return res.status(400).json({ error: "missing_draft_identity" });
    }
    const recommendationItems = payload.snapshot.recommendationItems;
    if (
      !Array.isArray(itemReviews)
      || !Array.isArray(recommendationItems)
      || itemReviews.length !== recommendationItems.length
      || itemReviews.length > 20
      || itemReviews.some((item: any, index: number) => (
        !isObject(item)
        || item.rank !== recommendationItems[index]?.rank
        || String(item.title || "") !== String(recommendationItems[index]?.title || "")
      ))
    ) {
      return res.status(400).json({ error: "invalid_draft_items" });
    }

    await saveHumanReviewDraft({
      schemaVersion: "human_review_durable_draft_v1",
      snapshotId,
      profileId,
      reviewerId,
      snapshot: payload.snapshot,
      draft: payload.draft,
      updatedAt,
    });
    return res.status(200).json({ status: "saved", storageMode: "durable_blob", updatedAt });
  } catch (error: any) {
    return res.status(503).json({
      error: "draft_storage_unavailable",
      detail: typeof error?.message === "string" ? error.message : "unknown_error",
    });
  }
}
