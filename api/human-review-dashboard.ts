import type { VercelRequest, VercelResponse } from "@vercel/node";
import { hasValidOwnerAnalyticsSession, ownerAnalyticsAuthConfigured } from "../lib/ownerAnalyticsAuth";
import { createRepository } from "../lib/humanReview/index";
import { humanReviewBlobStorageConfigured } from "../lib/humanReview/BlobHumanReviewRepository";
import {
  buildHumanReviewDashboardData,
  parseHumanReviewDashboardFilters,
} from "../lib/humanReview/dashboard";
import {
  buildPreviewAcceptanceDashboardFixture,
  PREVIEW_ACCEPTANCE_FIXTURE_STORAGE_MODE,
} from "../lib/humanReview/dashboardPreviewAcceptanceFixture";
import {
  isPreviewAcceptanceEnvironmentEnabled,
  readPreviewAcceptanceDashboardModeFromCookie,
} from "../lib/previewAcceptanceHarness";
import { listSwipeCardPerformance, listSwipeCardPerformanceBlob } from "../lib/swipeCardPerformance";
import {
  listRealSessionAudits,
  logRealSessionAuditStorageFailure,
  realSessionAuditBlobStorageConfigured,
} from "../lib/realSessionOverlapAudit";
import {
  listHumanReviewDrafts,
  summarizeHumanReviewDraft,
} from "../lib/humanReview/humanReviewDraftStorage";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "method_not_allowed" });
  }

  if (!ownerAnalyticsAuthConfigured()) {
    return res.status(503).json({ error: "owner_analytics_auth_not_configured" });
  }

  if (!hasValidOwnerAnalyticsSession(req)) {
    return res.status(401).json({ error: "owner_session_required" });
  }

  try {
    const filters = parseHumanReviewDashboardFilters(req.query as Record<string, unknown>);
    const previewAcceptanceMode =
      isPreviewAcceptanceEnvironmentEnabled() && hasValidOwnerAnalyticsSession(req)
        ? readPreviewAcceptanceDashboardModeFromCookie(req.headers.cookie || "")
        : "live";

    if (previewAcceptanceMode === "failure") {
      throw new Error("preview_acceptance_forced_dashboard_failure");
    }

    if (previewAcceptanceMode === "fixtures") {
      return res.status(200).json({
        status: "ok",
        storageMode: PREVIEW_ACCEPTANCE_FIXTURE_STORAGE_MODE,
        incompleteReviewDrafts: [],
        swipeCardPerformanceStorageMode: "unavailable",
        swipeCardPerformanceError: null,
        swipeCardPerformance: [],
        realSessionAuditStorageMode: "unavailable",
        realSessionAuditError: null,
        realSessionAudits: [],
        ...buildPreviewAcceptanceDashboardFixture(filters),
      });
    }

    const repo = createRepository();
    const swipeCardPerformanceStorageMode = process.env.POSTGRES_URL
      ? "durable_postgres"
      : process.env.BLOB_READ_WRITE_TOKEN
        ? "durable_blob"
        : "unavailable";
    const swipeCardPerformanceResult = swipeCardPerformanceStorageMode !== "unavailable"
      ? (swipeCardPerformanceStorageMode === "durable_postgres" ? listSwipeCardPerformance() : listSwipeCardPerformanceBlob())
          .then((rows) => ({ rows, storageMode: swipeCardPerformanceStorageMode, error: null }))
          .catch((error: any) => ({
            rows: [],
            storageMode: "error",
            error: typeof error?.message === "string" ? error.message : "swipe_card_performance_unavailable",
          }))
      : Promise.resolve({ rows: [], storageMode: "unavailable", error: null });
    const realSessionAuditStorageAvailable = realSessionAuditBlobStorageConfigured();
    const realSessionAuditResult = realSessionAuditStorageAvailable
      ? listRealSessionAudits()
          .then((rows) => ({ rows, storageMode: "durable_blob", error: null }))
          .catch((error: any) => {
            logRealSessionAuditStorageFailure("dashboard-read", error);
            return {
              rows: [],
              storageMode: "error",
              error: typeof error?.message === "string" ? error.message : "real_session_audit_unavailable",
            };
          })
      : Promise.resolve({ rows: [], storageMode: "unavailable", error: null });
    const draftResult = process.env.POSTGRES_URL || humanReviewBlobStorageConfigured()
      ? listHumanReviewDrafts().catch(() => [])
      : Promise.resolve([]);
    const [snapshots, reviews, drafts, swipeCardPerformance, realSessionAudits] = await Promise.all([
      repo.listSnapshots(),
      repo.listReviews(),
      draftResult,
      swipeCardPerformanceResult,
      realSessionAuditResult,
    ]);
    const completedDraftKeys = new Set(reviews.map((review) => (
      `${String(review.snapshotId || "")}::${String(review.reviewerId || "")}`
    )));
    const incompleteDrafts = drafts.filter((draft) => (
      !completedDraftKeys.has(`${draft.snapshotId}::${String(draft.draft?.form?.reviewerId || draft.reviewerId)}`)
    ));
    const dashboard = buildHumanReviewDashboardData({ filters, snapshots, reviews });
    return res.status(200).json({
      status: "ok",
      storageMode: repo.storageMode,
      incompleteReviewDrafts: incompleteDrafts.map(summarizeHumanReviewDraft),
      swipeCardPerformanceStorageMode: swipeCardPerformance.storageMode,
      swipeCardPerformanceError: swipeCardPerformance.error,
      swipeCardPerformance: swipeCardPerformance.rows,
      realSessionAuditStorageMode: realSessionAudits.storageMode,
      realSessionAuditError: realSessionAudits.error,
      realSessionAudits: realSessionAudits.rows,
      ...dashboard,
    });
  } catch (error: any) {
    return res.status(500).json({
      error: typeof error?.message === "string" ? error.message : "human_review_dashboard_failed",
    });
  }
}
