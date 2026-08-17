import type { VercelRequest, VercelResponse } from "@vercel/node";
import { hasValidOwnerAnalyticsSession, ownerAnalyticsAuthConfigured } from "../lib/ownerAnalyticsAuth";
import { createRepository } from "../lib/humanReview/index";
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
import { listSwipeCardPerformance } from "../lib/swipeCardPerformance";
import { listRealSessionAudits, logRealSessionAuditStorageFailure } from "../lib/realSessionOverlapAudit";

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
    const swipeCardPerformanceStorageAvailable = Boolean(process.env.POSTGRES_URL);
    const swipeCardPerformanceResult = swipeCardPerformanceStorageAvailable
      ? listSwipeCardPerformance()
          .then((rows) => ({ rows, storageMode: "durable_postgres", error: null }))
          .catch((error: any) => ({
            rows: [],
            storageMode: "error",
            error: typeof error?.message === "string" ? error.message : "swipe_card_performance_unavailable",
          }))
      : Promise.resolve({ rows: [], storageMode: "unavailable", error: null });
    const realSessionAuditStorageAvailable = Boolean(process.env.BLOB_READ_WRITE_TOKEN);
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
    const [snapshots, reviews, swipeCardPerformance, realSessionAudits] = await Promise.all([
      repo.listSnapshots(),
      repo.listReviews(),
      swipeCardPerformanceResult,
      realSessionAuditResult,
    ]);
    const dashboard = buildHumanReviewDashboardData({ filters, snapshots, reviews });
    return res.status(200).json({
      status: "ok",
      storageMode: repo.storageMode,
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
