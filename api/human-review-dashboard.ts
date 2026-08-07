import type { VercelRequest, VercelResponse } from "@vercel/node";
import { ADMIN_SESSION_COOKIE_NAME } from "../lib/adminSession";
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

function hasAdminSessionCookie(req: VercelRequest): boolean {
  const cookie = String(req.headers.cookie || "");
  return cookie.split(";").some((part) => part.trim().startsWith(`${ADMIN_SESSION_COOKIE_NAME}=1`));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "method_not_allowed" });
  }

  if (!hasAdminSessionCookie(req)) {
    return res.status(401).json({ error: "admin_session_required" });
  }

  try {
    const filters = parseHumanReviewDashboardFilters(req.query as Record<string, unknown>);
    const previewAcceptanceMode =
      isPreviewAcceptanceEnvironmentEnabled() && hasAdminSessionCookie(req)
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
    const [snapshots, reviews, swipeCardPerformance] = await Promise.all([
      repo.listSnapshots(),
      repo.listReviews(),
      swipeCardPerformanceResult,
    ]);
    const dashboard = buildHumanReviewDashboardData({ filters, snapshots, reviews });
    return res.status(200).json({
      status: "ok",
      storageMode: repo.storageMode,
      swipeCardPerformanceStorageMode: swipeCardPerformance.storageMode,
      swipeCardPerformanceError: swipeCardPerformance.error,
      swipeCardPerformance: swipeCardPerformance.rows,
      ...dashboard,
    });
  } catch (error: any) {
    return res.status(500).json({
      error: typeof error?.message === "string" ? error.message : "human_review_dashboard_failed",
    });
  }
}
